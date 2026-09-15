"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalTime } from "@/components/local-time";
import { structureIntact, type FidelityRecord, type Mismatch } from "@/lib/fidelity";

const FIELD_WORD: Record<Mismatch["field"], string> = {
  "section.name": "Section name",
  "item.name": "Item name",
  "comment.name": "Comment name",
  "comment.text": "Comment text",
  structure: "Structure",
};

function kindWord(m: Mismatch): string {
  if (m.kind === "missing_in_stored") return "In the file, not stored";
  if (m.kind === "extra_in_stored") return "Stored, not in the file";
  if (m.kind === "whitespace_only") return "Spacing only";
  return FIELD_WORD[m.field];
}

function Row({ label, a, b }: { label: string; a: number; b: number }) {
  const ok = a === b;
  return (
    <tr className={ok ? "" : "text-red-700"}>
      <td className="py-0.5 pr-3 text-muted-foreground">{label}</td>
      <td className="py-0.5 pr-3 text-right tabular-nums">{a}</td>
      <td className="py-0.5 pr-2 text-right tabular-nums">{b}</td>
      <td className="py-0.5">{ok ? "✓" : "✗"}</td>
    </tr>
  );
}

export function FidelityPanel({
  record,
  templateId,
  onRecheck,
}: {
  record: FidelityRecord;
  templateId: string;
  onRecheck: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const r = record.latest;
  const atImport = record.atImport;
  const drifted = r.checkedAt !== atImport.checkedAt;
  const intact = structureIntact(r);
  const n = r.mismatches.length;
  const nText = n + (r.mismatchesTruncated ? "+" : "");
  const total = r.counts.source.comments;

  // One badge, one sentence. Everything else is behind "Show the counts".
  let badge: string;
  let badgeCls: string;
  let sentence: string;
  if (r.status === "green") {
    badge = "Everything came through";
    badgeCls = "bg-emerald-50 text-emerald-800 border-emerald-300";
    sentence = `All ${total} comments match the Spectora file, character for character.`;
  } else if (r.status === "amber") {
    badge = "Only spacing differs";
    badgeCls = "bg-amber-50 text-amber-800 border-amber-300";
    sentence = `${nText} place${n === 1 ? "" : "s"} differ from the file only in spaces or line breaks. Every word is the same.`;
  } else {
    badge = `${nText} difference${n === 1 ? "" : "s"} from the file`;
    badgeCls = "bg-red-50 text-red-800 border-red-300";
    if (drifted && atImport.status === "green" && intact) {
      sentence = n === 1 ? "That is an edit made after import. Nothing was lost." : "These are edits made after import. Nothing was lost.";
    } else if (!intact) {
      sentence = "Some content did not come through. The list below names every place.";
    } else {
      sentence = "The stored text differs from the file in the places listed below.";
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-3 text-base">
          <span className={`rounded-full border px-2.5 py-0.5 text-sm font-medium ${badgeCls}`}>{badge}</span>
          <span className="font-normal">{sentence}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
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
            {pending ? "Checking…" : "Check again"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Last checked <LocalTime iso={r.checkedAt} />
          </span>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer select-none text-xs text-muted-foreground underline-offset-2 hover:underline">
            Show the counts
          </summary>
          <div className="mt-2 grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
            <table className="w-full max-w-sm text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="pr-3 text-left font-normal"></th>
                  <th className="pr-3 text-right font-normal">In file</th>
                  <th className="pr-2 text-right font-normal">Stored</th>
                  <th className="w-4"></th>
                </tr>
              </thead>
              <tbody>
                <Row label="Sections" a={r.counts.source.sections} b={r.counts.stored.sections} />
                <Row label="Items" a={r.counts.source.items} b={r.counts.stored.items} />
                <Row label="Comments" a={r.counts.source.comments} b={r.counts.stored.comments} />
                <Row label="With formatting" a={r.html.source} b={r.html.stored} />
                <tr>
                  <td className="py-0.5 pr-3 text-muted-foreground">Text identical</td>
                  <td className="py-0.5 pr-2 text-right tabular-nums" colSpan={2}>
                    {r.text.exact} of {total}
                  </td>
                  <td className="py-0.5">{r.text.exact === total ? "✓" : ""}</td>
                </tr>
                <tr>
                  <td className="py-0.5 pr-3 text-muted-foreground">Order kept</td>
                  <td className="py-0.5 pr-2 text-right whitespace-normal" colSpan={2}>
                    {(["sections", "items", "comments"] as const).filter((k) => r.ordering[k]).join(", ") || "no"}
                  </td>
                  <td className="py-0.5">{r.ordering.sections && r.ordering.items && r.ordering.comments ? "✓" : "✗"}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground">
              {drifted ? "Checked again" : "Checked at import"} by reading the stored template back and comparing it with the file, cell by
              cell. After you edit a name or a comment, run the check again: it turns red and lists exactly which cells no longer match
              the Spectora export. Your edits are kept; the list is the record of them.
            </p>
          </div>
        </details>

        {n > 0 && (
          <details open={r.status === "red"} className="rounded-md border">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">What differs · {nText}</summary>
            <ul className="divide-y">
              {r.mismatches.map((m, i) => (
                <li key={i} className="space-y-1 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="font-medium">{m.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{kindWord(m)}</span>
                    </div>
                    <Link href={`/templates/${templateId}?s=${m.sectionIndex}`} scroll={false} className="text-xs underline underline-offset-2">
                      Go to section
                    </Link>
                  </div>
                  {m.source !== null && (
                    <div className="grid grid-cols-[4rem_1fr] gap-2 text-xs">
                      <span className="text-muted-foreground">In file</span>
                      <span className="break-words font-mono" title={m.source}>
                        {m.source.length > 400 ? m.source.slice(0, 400) + "…" : m.source}
                      </span>
                    </div>
                  )}
                  {m.stored !== null && (
                    <div className="grid grid-cols-[4rem_1fr] gap-2 text-xs">
                      <span className="text-muted-foreground">Stored</span>
                      <span className="break-words font-mono" title={m.stored}>
                        {m.stored.length > 400 ? m.stored.slice(0, 400) + "…" : m.stored}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
