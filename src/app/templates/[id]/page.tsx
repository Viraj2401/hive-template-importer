import Link from "next/link";
import { notFound } from "next/navigation";
import { getImportIssues, getLatestImportRun, getTemplate, getTemplateTree } from "@/lib/db/templates";
import { renderCommentHtml } from "@/lib/render";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditableName } from "@/components/editable-name";
import { CommentEditor } from "@/components/comment-editor";
import { TemplateActions } from "@/components/template-actions";
import { FidelityPanel } from "@/components/fidelity-panel";
import { LocalTime } from "@/components/local-time";
import type { Comment, ImportIssue, ImportRun } from "@/lib/types";
import {
  copyTemplateAction,
  deleteTemplateAction,
  recheckFidelityAction,
  renameItemAction,
  renameSectionAction,
  renameTemplateAction,
  updateCommentAction,
} from "./actions";

export const dynamic = "force-dynamic";

function typeVariant(t: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (t === "defect") return "destructive";
  if (t === "limit") return "secondary";
  return "outline";
}

// Spectora's codes, shown as words. Unknown values fall through unchanged.
const TYPE_LABEL: Record<string, string> = { info: "Information", limit: "Limitation", defect: "Defect" };
const SEVERITY_LABEL: Record<string, string> = { "-1": "Low", "0": "Medium", "1": "High" };

function platformName(p: string | null): string {
  if (!p) return "import";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** "Multiple Choice Options (comma-separated)" -> "Multiple Choice Options" */
function cleanHeader(k: string): string {
  if (k === "raw_name") return "Original name in export";
  return k.replace(/\s*\(.*$/, "").trim();
}

function CommentBody({ c }: { c: Comment }) {
  if (c.body_html) {
    return (
      <div
        className="prose prose-sm max-w-none text-foreground [&_a]:underline [&_p]:my-1"
        dangerouslySetInnerHTML={{ __html: renderCommentHtml(c.body_html) }}
      />
    );
  }
  if (c.body_text) return <p className="whitespace-pre-wrap text-sm">{c.body_text}</p>;
  return <p className="text-xs italic text-muted-foreground">No text in the export. This is an answer-style field in Spectora.</p>;
}

function KeptFields({ extra, platform, unmappedTotal }: { extra: Record<string, unknown>; platform: string; unmappedTotal: number | null }) {
  const entries = Object.entries(extra).filter(([k]) => k !== "source_row");
  const filled = entries.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");
  const emptyInFile = unmappedTotal !== null ? Math.max(unmappedTotal - filled.filter(([k]) => k !== "raw_name").length, 0) : null;
  if (filled.length === 0 && !emptyInFile) return null;
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">
        Kept from the export: {filled.length} field{filled.length === 1 ? "" : "s"}
      </summary>
      <p className="mt-1">Read-only here; they travel with the comment when you copy the template.</p>
      <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
        {filled.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="truncate font-medium" title={k}>
              {cleanHeader(k)}
            </dt>
            <dd className="truncate">{String(v)}</dd>
          </div>
        ))}
      </dl>
      {emptyInFile !== null && emptyInFile > 0 && (
        <p className="mt-1">
          {emptyInFile} more of the {platform} columns are empty in the file for this comment.
        </p>
      )}
    </details>
  );
}

function ImportNotes({ issues, run, parent }: { issues: ImportIssue[]; run: ImportRun | null; parent: { id: string; name: string } | null }) {
  if (issues.length === 0 && !run) {
    if (parent) {
      return (
        <p className="text-sm text-muted-foreground">
          Import notes and the fidelity check live on the original:{" "}
          <Link href={`/templates/${parent.id}`} className="underline">
            {parent.name}
          </Link>
          .
        </p>
      );
    }
    return null;
  }
  const groups: Record<string, ImportIssue[]> = {};
  for (const i of issues) (groups[i.severity] ??= []).push(i);
  const count = (s: string) => groups[s]?.length ?? 0;
  const order = ["skipped", "warning", "unsupported", "info"];
  const label: Record<string, string> = {
    skipped: "Skipped",
    warning: "Warnings",
    unsupported: "Kept, not editable here",
    info: "Notes",
  };
  const summary = [
    count("skipped") === 0 ? "Nothing skipped" : `${count("skipped")} skipped`,
    `${count("warning")} warning${count("warning") === 1 ? "" : "s"}`,
    `${count("unsupported")} field${count("unsupported") === 1 ? "" : "s"} kept but not editable here`,
    `${count("info")} note${count("info") === 1 ? "" : "s"}`,
  ].join(" · ");

  return (
    <details className="rounded-lg border bg-muted/20">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-sm">
        <span className="font-medium">Import notes</span>
        <span className="ml-2 text-muted-foreground">{summary}</span>
      </summary>
      <div className="space-y-3 border-t px-4 py-3">
        {run && (
          <p className="text-sm text-muted-foreground">
            File had {run.rows_total ?? "?"} rows and {run.columns_seen?.length ?? "?"} columns; {run.columns_mapped?.length ?? "?"} are shown as
            fields here.
            {run.file_hash && <span className="ml-1 font-mono text-xs">sha256 {run.file_hash.slice(0, 16)}…</span>}
          </p>
        )}
        {count("skipped") === 0 && <p className="text-sm">Skipped: nothing. Every row in the file became a comment.</p>}
        {order
          .filter((s) => groups[s]?.length)
          .map((s) => (
            <details key={s} open={s === "skipped" || s === "warning"} className="rounded-md border bg-background">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
                {label[s]} · {groups[s].length}
              </summary>
              <ul className="divide-y text-sm">
                {groups[s].map((i) => (
                  <li key={i.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {i.kind.replace(/_/g, " ")}
                      </Badge>
                      {i.location && <span className="text-xs text-muted-foreground">{i.location}</span>}
                      {i.row_number && <span className="text-xs text-muted-foreground">row {i.row_number}</span>}
                    </div>
                    <div className="mt-0.5">{i.message}</div>
                    {i.raw_value && (
                      <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">raw: {i.raw_value}</div>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
      </div>
    </details>
  );
}

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { id } = await params;
  const { s } = await searchParams;
  const tree = await getTemplateTree(id);
  if (!tree) notFound();
  const [run, issues, parent] = await Promise.all([
    getLatestImportRun(id),
    getImportIssues(id),
    tree.parent_template_id ? getTemplate(tree.parent_template_id) : Promise.resolve(null),
  ]);

  const counts = {
    sections: tree.sections.length,
    items: tree.sections.reduce((n, sec) => n + sec.items.length, 0),
    comments: tree.sections.reduce((n, sec) => n + sec.items.reduce((m, i) => m + i.comments.length, 0), 0),
  };

  // One section on screen at a time. The server renders only the chosen one,
  // so a 392-comment template does not become a 3 MB page.
  const requested = Number.parseInt(s ?? "0", 10);
  const sIdx = Math.min(Math.max(Number.isFinite(requested) ? requested : 0, 0), Math.max(tree.sections.length - 1, 0));
  const section = tree.sections[sIdx];
  const platform = platformName(tree.source_platform);
  const unmappedTotal = run?.columns_seen && run?.columns_mapped ? run.columns_seen.length - run.columns_mapped.length : null;

  const renameTemplate = renameTemplateAction.bind(null, id);
  const copy = copyTemplateAction.bind(null, id);
  const del = deleteTemplateAction.bind(null, id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <EditableName as="h1" name={tree.name} onSave={renameTemplate} className="text-2xl font-semibold tracking-tight" />
            {parent ? (
              <Badge variant="secondary">
                copy of&nbsp;
                <Link href={`/templates/${parent.id}`} className="underline">
                  {parent.name}
                </Link>
              </Badge>
            ) : (
              <Badge variant="outline">Imported from {platform}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {counts.sections} sections · {counts.items} items · {counts.comments} comments
            {tree.source_file_name && <> · from <span className="font-mono">{tree.source_file_name}</span></>}
            {run && (
              <>
                {" "}
                · imported <LocalTime iso={run.created_at} />
              </>
            )}
            {parent && (
              <>
                {" "}
                · copied <LocalTime iso={tree.created_at} />
              </>
            )}
          </p>
        </div>
        <TemplateActions onCopy={copy} onDelete={del} />
      </div>

      {run?.fidelity && <FidelityPanel record={run.fidelity} templateId={id} onRecheck={recheckFidelityAction.bind(null, id)} />}

      <ImportNotes issues={issues} run={run} parent={parent} />

      {section ? (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label="Sections" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sections</div>
            <ol className="flex w-full flex-wrap gap-1 lg:flex-col lg:gap-0.5">
              {tree.sections.map((sec, i) => {
                const n = sec.items.reduce((m, it) => m + it.comments.length, 0);
                const active = i === sIdx;
                return (
                  <li key={sec.id} className="min-w-0 max-w-full">
                    <Link
                      href={`/templates/${id}?s=${i}`}
                      title={sec.name}
                      aria-current={active ? "page" : undefined}
                      className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm ${
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <span className="min-w-0 truncate">{sec.name}</span>
                      <span className={`shrink-0 text-xs tabular-nums ${active ? "opacity-80" : "text-muted-foreground"}`}>{n}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>

          <Card id={`section-${section.id}`} className="min-w-0">
            <CardHeader>
              <CardTitle className="text-lg">
                <EditableName name={section.name} onSave={renameSectionAction.bind(null, id, section.id)} />
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Section {sIdx + 1} of {tree.sections.length} · {section.items.length} item{section.items.length === 1 ? "" : "s"} ·{" "}
                {section.items.reduce((m, it) => m + it.comments.length, 0)} comment
                {section.items.reduce((m, it) => m + it.comments.length, 0) === 1 ? "" : "s"}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {section.items.map((it) => (
                <details key={it.id} className="rounded-md border">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
                    <EditableName name={it.name} onSave={renameItemAction.bind(null, id, it.id)} />
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {it.comments.length} comment{it.comments.length === 1 ? "" : "s"}
                    </span>
                  </summary>
                  <ul className="divide-y">
                    {it.comments.map((c) => (
                      <li key={c.id} className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{c.name ?? <em className="text-muted-foreground">unnamed</em>}</span>
                          {c.comment_type && (
                            <Badge variant={typeVariant(c.comment_type)}>{TYPE_LABEL[c.comment_type] ?? c.comment_type}</Badge>
                          )}
                          {c.category && (
                            <span className="text-xs text-muted-foreground">Severity: {SEVERITY_LABEL[c.category] ?? c.category}</span>
                          )}
                          {c.recommendation && (
                            <span className="text-xs text-muted-foreground">Recommendation: {c.recommendation}</span>
                          )}
                        </div>
                        <div className="mt-1">
                          <CommentEditor
                            name={c.name}
                            bodyHtml={c.body_html}
                            bodyText={c.body_text}
                            onSave={updateCommentAction.bind(null, id, c.id)}
                          >
                            <CommentBody c={c} />
                          </CommentEditor>
                        </div>
                        <KeptFields extra={c.extra} platform={platform} unmappedTotal={unmappedTotal} />
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This template has no sections.</p>
      )}
    </div>
  );
}
