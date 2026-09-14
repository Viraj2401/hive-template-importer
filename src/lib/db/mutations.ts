import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { hasHtml, stripTags } from "@/lib/import/spectora";
import { getLatestImportRun, getTemplateTree } from "./templates";
import { insertTree } from "./tree-insert";
import { computeFidelity, snapshotFromTree, type FidelityRecord, type FidelityReport } from "@/lib/fidelity";

function requireName(name: string, what: string): string {
  const n = name.trim();
  if (!n) throw new Error(`${what} name cannot be empty.`);
  if (n.length > 500) throw new Error(`${what} name is too long.`);
  return n;
}

export async function renameTemplate(id: string, name: string): Promise<void> {
  const sb = supabaseServer();
  const { error } = await sb.from("templates").update({ name: requireName(name, "Template") }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function renameSection(id: string, name: string): Promise<void> {
  const sb = supabaseServer();
  const { error } = await sb.from("sections").update({ name: requireName(name, "Section") }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function renameItem(id: string, name: string): Promise<void> {
  const sb = supabaseServer();
  const { error } = await sb.from("items").update({ name: requireName(name, "Item") }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Update a comment's name and body. The body is edited as source: if it
 * contains markup it is stored as body_html (with body_text derived), otherwise
 * as plain body_text. No WYSIWYG - see NOTES.md for why.
 */
export async function updateComment(id: string, input: { name: string; body: string }): Promise<void> {
  const sb = supabaseServer();
  const name = input.name.trim() || null;
  const body = input.body.replace(/\r\n/g, "\n");
  const isHtml = hasHtml(body);
  const patch = {
    name,
    body_html: isHtml ? body : null,
    body_text: body.trim() === "" ? null : isHtml ? stripTags(body) : body.trim(),
  };
  const { error } = await sb.from("comments").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Deep-copy a template. Every section, item and comment gets a new row, so
 * edits to the copy cannot touch the original. Lineage is recorded in
 * parent_template_id. Import provenance stays on the original.
 */
export async function copyTemplate(sourceId: string, newName?: string): Promise<string> {
  const sb = supabaseServer();
  const tree = await getTemplateTree(sourceId);
  if (!tree) throw new Error("Template not found.");

  const { data: tpl, error: tplErr } = await sb
    .from("templates")
    .insert({
      name: (newName?.trim() || `Copy of ${tree.name}`).slice(0, 500),
      source_platform: tree.source_platform,
      source_file_name: tree.source_file_name,
      source_file_hash: tree.source_file_hash,
      parent_template_id: sourceId,
    })
    .select("id")
    .single();
  if (tplErr || !tpl) throw new Error(`Failed to create copy: ${tplErr?.message}`);
  const newId = tpl.id as string;

  try {
    await insertTree(
      sb,
      newId,
      tree.sections.map((s) => ({
        name: s.name,
        extra: s.extra ?? {},
        items: s.items.map((it) => ({
          name: it.name,
          extra: it.extra ?? {},
          comments: it.comments.map((c) => ({
            name: c.name,
            body_html: c.body_html,
            body_text: c.body_text,
            comment_type: c.comment_type,
            category: c.category,
            recommendation: c.recommendation,
            extra: c.extra ?? {},
          })),
        })),
      })),
    );
    return newId;
  } catch (e) {
    await sb.from("templates").delete().eq("id", newId);
    throw e;
  }
}

/**
 * Re-run the fidelity check against the snapshot taken at import. After edits
 * this shows exactly what has drifted from the source, and where.
 */
export async function recheckFidelity(templateId: string): Promise<FidelityReport> {
  const sb = supabaseServer();
  const run = await getLatestImportRun(templateId);
  if (!run) throw new Error("This template has no import run to check against (copies inherit none).");
  if (!run.source_snapshot) throw new Error("No source snapshot was stored for this import.");
  const tree = await getTemplateTree(templateId);
  if (!tree) throw new Error("Template not found.");
  const latest = computeFidelity(run.source_snapshot, snapshotFromTree(tree));
  const record: FidelityRecord = { atImport: run.fidelity?.atImport ?? latest, latest };
  const { error } = await sb.from("import_runs").update({ fidelity: record }).eq("id", run.id);
  if (error) throw new Error(error.message);
  return latest;
}

export async function deleteTemplate(id: string): Promise<void> {
  const sb = supabaseServer();
  const { error } = await sb.from("templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
