import Link from "next/link";
import { listTemplates, listRejectedImports } from "@/lib/db/templates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalTime } from "@/components/local-time";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [templates, rejected] = await Promise.all([listTemplates(), listRejectedImports(5)]);
  const byId = new Map(templates.map((t) => [t.id, t]));

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Imported from Spectora. Open one to review, edit, or copy it.
          </p>
        </div>
        <Link href="/import" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90">
          Import a template
        </Link>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No templates yet</CardTitle>
            <CardDescription>Import a Spectora HTML-text export to get started.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((t) => {
            const parent = t.parent_template_id ? byId.get(t.parent_template_id) : null;
            return (
              <Link key={t.id} href={`/templates/${t.id}`} className="block">
                <Card className="h-full transition hover:border-foreground/30">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{t.name}</CardTitle>
                      {t.parent_template_id ? (
                        <Badge variant="secondary">copy</Badge>
                      ) : (
                        <Badge variant="outline">
                          From {t.source_platform ? t.source_platform.charAt(0).toUpperCase() + t.source_platform.slice(1) : "import"}
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      {parent ? `Copy of “${parent.name}”` : t.source_file_name ?? "—"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    Updated <LocalTime iso={t.updated_at} />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {rejected.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Recent rejected imports</h2>
          <ul className="divide-y rounded-md border text-sm">
            {rejected.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-3 py-2">
                <span className="truncate">{r.file_name ?? "(unnamed file)"}</span>
                <span className="truncate text-muted-foreground">{r.reject_reason}</span>
                <LocalTime iso={r.created_at} className="shrink-0 text-xs text-muted-foreground" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
