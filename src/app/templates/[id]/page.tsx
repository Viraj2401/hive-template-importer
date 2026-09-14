import Link from "next/link";
import { notFound } from "next/navigation";
import { getImportIssues, getLatestImportRun, getTemplate, getTemplateTree } from "@/lib/db/templates";
import { renderCommentHtml } from "@/lib/render";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Comment, ImportIssue } from "@/lib/types";

export const dynamic = "force-dynamic";

function typeVariant(t: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (t === "defect") return "destructive";
  if (t === "limit") return "secondary";
  return "outline";
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
  return <p className="text-xs italic text-muted-foreground">No narrative text in the export (answer field).</p>;
}

function ExtraDetails({ extra }: { extra: Record<string, unknown> }) {
  const entries = Object.entries(extra).filter(([k]) => k !== "source_row");
  if (entries.length === 0) return null;
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">
        {entries.length} preserved field{entries.length === 1 ? "" : "s"} from the export
      </summary>
      <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="truncate font-medium">{k}</dt>
            <dd className="truncate">{String(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function IssuesPanel({ issues }: { issues: ImportIssue[] }) {
  if (issues.length === 0) return null;
  const groups: Record<string, ImportIssue[]> = {};
  for (const i of issues) (groups[i.severity] ??= []).push(i);
  const order = ["skipped", "warning", "unsupported", "info"];
  const label: Record<string, string> = {
    skipped: "Skipped (content not imported)",
    warning: "Warnings",
    unsupported: "Preserved but not editable here",
    info: "Notes",
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import notes · {issues.length}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {order
          .filter((s) => groups[s]?.length)
          .map((s) => (
            <details key={s} open={s === "skipped" || s === "warning"} className="rounded-md border">
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
      </CardContent>
    </Card>
  );
}

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tree = await getTemplateTree(id);
  if (!tree) notFound();
  const [run, issues, parent] = await Promise.all([
    getLatestImportRun(id),
    getImportIssues(id),
    tree.parent_template_id ? getTemplate(tree.parent_template_id) : Promise.resolve(null),
  ]);

  const counts = {
    sections: tree.sections.length,
    items: tree.sections.reduce((n, s) => n + s.items.length, 0),
    comments: tree.sections.reduce((n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0), 0),
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{tree.name}</h1>
          {parent ? (
            <Badge variant="secondary">
              copy of{" "}
              <Link href={`/templates/${parent.id}`} className="underline">
                {parent.name}
              </Link>
            </Badge>
          ) : (
            <Badge variant="outline">{tree.source_platform}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {counts.sections} sections · {counts.items} items · {counts.comments} comments
          {tree.source_file_name && <> · from <span className="font-mono">{tree.source_file_name}</span></>}
          {run && <> · imported {new Date(run.created_at).toLocaleString()}</>}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {tree.sections.map((s) => (
            <Card key={s.id} id={`section-${s.id}`}>
              <CardHeader>
                <CardTitle className="text-base">
                  {s.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{s.items.length} items</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {s.items.map((it) => (
                  <details key={it.id} className="rounded-md border">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
                      {it.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{it.comments.length}</span>
                    </summary>
                    <ul className="divide-y">
                      {it.comments.map((c) => (
                        <li key={c.id} className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{c.name ?? <em className="text-muted-foreground">unnamed</em>}</span>
                            {c.comment_type && <Badge variant={typeVariant(c.comment_type)}>{c.comment_type}</Badge>}
                            {c.category && <span className="text-xs text-muted-foreground">severity {c.category}</span>}
                            {c.recommendation && <span className="text-xs text-muted-foreground">rec: {c.recommendation}</span>}
                          </div>
                          <div className="mt-1">
                            <CommentBody c={c} />
                          </div>
                          <ExtraDetails extra={c.extra} />
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {run && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Rows in file</span> · {run.rows_total}
                </div>
                <div>
                  <span className="text-muted-foreground">Columns seen</span> · {run.columns_seen?.length ?? 0}
                </div>
                <div>
                  <span className="text-muted-foreground">Columns mapped</span> · {run.columns_mapped?.length ?? 0}
                </div>
                {run.file_hash && (
                  <div className="truncate font-mono text-xs text-muted-foreground">sha256 {run.file_hash.slice(0, 16)}…</div>
                )}
              </CardContent>
            </Card>
          )}
          <IssuesPanel issues={issues} />
        </aside>
      </div>
    </div>
  );
}
