"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FidelityRecord, FidelityReport } from "@/lib/fidelity";

const STATUS: Record<FidelityReport["status"], { label: string; cls: string }> = {
  green: { label: "Faithful", cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  amber: { label: "Whitespace differences only", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  red: { label: "Differs from source", cls: "bg-red-100 text-red-900 border-red-300" },
};

function Row({ label, a, b }: { label: string; a: number; b: number }) {
  const ok = a === b;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={ok ? "" : "font-medium text-red-700"}>
        {a} → {b} {ok ? "✓" : "✗"}
      </span>
    </div>
  );
}

export function FidelityPanel({
  record,
  onRecheck,
}: {
  record: FidelityRecord;
  onRecheck: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const r = record.latest;
  const atImport = record.atImport;
  const drifted = r.checkedAt !== atImport.checkedAt;
  const s = STATUS[r.status];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Import fidelity</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {drifted
            ? `Compared to the source at ${new Date(r.checkedAt).toLocaleString()}. At import it was “${STATUS[atImport.status].label}”.`
            : `Checked at import by re-reading the stored template and comparing it to the parsed file.`}
        </p>

        <div className="space-y-1">
          <Row label="Sections (source → stored)" a={r.counts.source.sections} b={r.counts.stored.sections} />
          <Row label="Items" a={r.counts.source.items} b={r.counts.stored.items} />
          <Row label="Comments" a={r.counts.source.comments} b={r.counts.stored.comments} />
          <Row label="Comments with HTML" a={r.html.source} b={r.html.stored} />
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Text identical</span>
            <span>{r.text.exact}</span>
          </div>
          {r.text.whitespaceOnly > 0 && (
            <div className="flex justify-between text-amber-800">
              <span>Whitespace-only differences</span>
              <span>{r.text.whitespaceOnly}</span>
            </div>
          )}
          {r.text.mismatched > 0 && (
            <div className="flex justify-between text-red-700">
              <span>Text changed</span>
              <span>{r.text.mismatched}</span>
            </div>
          )}
          {(r.text.missing > 0 || r.text.extra > 0) && (
            <div className="flex justify-between text-red-700">
              <span>Missing / extra comments</span>
              <span>
                {r.text.missing} / {r.text.extra}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Order preserved</span>
            <span>
              {r.ordering.sections && r.ordering.items && r.ordering.comments ? "sections, items, comments ✓" : "✗ see details"}
            </span>
          </div>
        </div>

        {r.mismatches.length > 0 && (
          <details className="rounded-md border">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
              {r.mismatches.length}
              {r.mismatchesTruncated ? "+" : ""} difference{r.mismatches.length === 1 ? "" : "s"}
            </summary>
            <ul className="max-h-72 divide-y overflow-auto text-xs">
              {r.mismatches.map((m, i) => (
                <li key={i} className="space-y-0.5 px-3 py-2">
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {m.path} · {m.field} · {m.kind.replace(/_/g, " ")}
                  </div>
                  {m.source !== null && (
                    <div className="truncate">
                      <span className="text-muted-foreground">source:</span> {m.source}
                    </div>
                  )}
                  {m.stored !== null && (
                    <div className="truncate">
                      <span className="text-muted-foreground">stored:</span> {m.stored}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await onRecheck();
              if (res.ok) router.refresh();
              else alert(res.error);
            })
          }
        >
          {pending ? "Checking…" : "Re-check against source"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          After editing, a red result is expected and correct: it shows exactly what you changed relative to the Spectora
          export.
        </p>
      </CardContent>
    </Card>
  );
}
