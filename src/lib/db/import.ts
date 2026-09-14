import "server-only";
import { createHash } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import type { ParsedTemplate } from "@/lib/import/types";
import { parseSpectoraExport } from "@/lib/import/spectora";
import { ImportRejectedError } from "@/lib/import/types";
import { insertTree } from "./tree-insert";

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export interface PersistResult {
  templateId: string;
  importRunId: string;
  stats: ParsedTemplate["stats"];
  issuesCount: number;
}

/**
 * Write a parsed template to the database.
 *
 * supabase-js has no multi-table transaction, so this inserts in dependency
 * order and deletes the template (cascading) if any later step fails. That
 * keeps a failed import from leaving a half-written template behind.
 * A Postgres function would make this atomic; see NOTES.md for why it was cut.
 */
export async function persistParsedTemplate(
  parsed: ParsedTemplate,
  opts: { name?: string; fileName: string; fileHash: string; sourcePlatform?: string },
): Promise<PersistResult> {
  const sb = supabaseServer();
  const name = (opts.name ?? parsed.suggestedName).trim() || parsed.suggestedName;

  const { data: tpl, error: tplErr } = await sb
    .from("templates")
    .insert({
      name,
      source_platform: opts.sourcePlatform ?? "spectora",
      source_file_name: opts.fileName,
      source_file_hash: opts.fileHash,
    })
    .select("id")
    .single();
  if (tplErr || !tpl) throw new Error(`Failed to create template: ${tplErr?.message}`);
  const templateId = tpl.id as string;

  try {
    await insertTree(
      sb,
      templateId,
      parsed.sections.map((s) => ({
        name: s.name,
        extra: s.rawName ? { raw_name: s.rawName, source_row: s.sourceRow } : { source_row: s.sourceRow },
        items: s.items.map((it) => ({
          name: it.name,
          extra: it.rawName ? { raw_name: it.rawName, source_row: it.sourceRow } : { source_row: it.sourceRow },
          comments: it.comments.map((c) => ({
            name: c.name,
            body_html: c.bodyHtml,
            body_text: c.bodyText,
            comment_type: c.commentType,
            category: c.category,
            recommendation: c.recommendation,
            extra: { ...c.extra, ...(c.rawName ? { raw_name: c.rawName } : {}), source_row: c.sourceRow },
          })),
        })),
      })),
    );

    const { data: run, error: runErr } = await sb
      .from("import_runs")
      .insert({
        template_id: templateId,
        file_name: opts.fileName,
        file_hash: opts.fileHash,
        status: "completed",
        rows_total: parsed.stats.rowsTotal,
        sections_count: parsed.stats.sections,
        items_count: parsed.stats.items,
        comments_count: parsed.stats.comments,
        issues_count: parsed.issues.length,
        columns_seen: parsed.columnsSeen,
        columns_mapped: parsed.columnsMapped,
      })
      .select("id")
      .single();
    if (runErr || !run) throw new Error(`Failed to record import run: ${runErr?.message}`);

    if (parsed.issues.length > 0) {
      const { error: issErr } = await sb.from("import_issues").insert(
        parsed.issues.map((i) => ({
          import_run_id: run.id,
          template_id: templateId,
          severity: i.severity,
          kind: i.kind,
          row_number: i.rowNumber,
          location: i.location,
          message: i.message,
          raw_value: i.rawValue,
        })),
      );
      if (issErr) throw new Error(`Failed to record import issues: ${issErr.message}`);
    }

    return { templateId, importRunId: run.id as string, stats: parsed.stats, issuesCount: parsed.issues.length };
  } catch (e) {
    await sb.from("templates").delete().eq("id", templateId); // cascade rollback
    throw e;
  }
}

/** Record a rejected import so failure cases leave an audit trail. */
export async function recordRejectedImport(err: ImportRejectedError, fileName: string, fileHash: string): Promise<string> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("import_runs")
    .insert({
      template_id: null,
      file_name: fileName,
      file_hash: fileHash,
      status: "rejected",
      reject_reason: err.reason,
      columns_seen: Array.isArray(err.details?.found) ? (err.details!.found as string[]) : null,
    })
    .select("id")
    .single();
  return (data?.id as string) ?? "";
}

/** Parse + persist in one call. Used by the API route and the seed script. */
export async function importSpectoraFile(
  data: Uint8Array,
  fileName: string,
  opts: { name?: string } = {},
): Promise<PersistResult> {
  const fileHash = sha256(data);
  let parsed: ParsedTemplate;
  try {
    parsed = parseSpectoraExport(data, fileName);
  } catch (e) {
    if (e instanceof ImportRejectedError) await recordRejectedImport(e, fileName, fileHash);
    throw e;
  }
  return persistParsedTemplate(parsed, { name: opts.name, fileName, fileHash });
}
