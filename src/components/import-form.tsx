"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Outcome =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ok"; templateId: string; stats: { sections: number; items: number; comments: number; rowsTotal: number }; issuesCount: number }
  | { kind: "rejected"; error: string; details: Record<string, unknown> | null }
  | { kind: "failed"; error: string };

export function ImportForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setOutcome({ kind: "busy" });
    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const body = await res.json();
      if (res.status === 201) {
        setOutcome({ kind: "ok", templateId: body.templateId, stats: body.stats, issuesCount: body.issuesCount });
        router.refresh();
      } else if (res.status === 422) {
        setOutcome({ kind: "rejected", error: body.error, details: body.details ?? null });
      } else {
        setOutcome({ kind: "failed", error: body.error ?? `HTTP ${res.status}` });
      }
    } catch (err) {
      setOutcome({ kind: "failed", error: err instanceof Error ? err.message : "Network error" });
    }
  }

  const expected = outcome.kind === "rejected" && Array.isArray(outcome.details?.expected) ? (outcome.details!.expected as string[]) : null;
  const found = outcome.kind === "rejected" && Array.isArray(outcome.details?.found) ? (outcome.details!.found as string[]) : null;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
      <p className="text-sm text-muted-foreground">
        In Spectora, open the template and choose <strong>Export HTML Text</strong>. Bring the .xls file here. Your Spectora account
        is not changed.
      </p>
      <div className="space-y-2">
        <Label htmlFor="file">Spectora export file</Label>
        <Input id="file" name="file" type="file" accept=".xls,.xlsx,.csv" required />
        <p className="text-xs text-muted-foreground">
          .xls or .xlsx, up to 15 MB. The plain-text export also imports, but links and formatting will already be gone.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Template name (optional)</Label>
        <Input id="name" name="name" placeholder="Defaults to the file name" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={outcome.kind === "busy"}>
          {outcome.kind === "busy" ? "Importing…" : "Import"}
        </Button>
        <span className="text-xs text-muted-foreground">Usually takes a few seconds.</span>
      </div>

      {outcome.kind === "ok" && (
        <Alert>
          <AlertTitle>Imported</AlertTitle>
          <AlertDescription className="space-y-2">
            <div>
              {outcome.stats.sections} sections, {outcome.stats.items} items, {outcome.stats.comments} comments from{" "}
              {outcome.stats.rowsTotal} rows. Everything was checked against the file; the result is on the template page.
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => router.push(`/templates/${outcome.templateId}`)}>
                Open the template
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  formRef.current?.reset();
                  setOutcome({ kind: "idle" });
                }}
              >
                Import another
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {outcome.kind === "rejected" && (
        <Alert variant="destructive">
          <AlertTitle>Not imported</AlertTitle>
          <AlertDescription className="space-y-2">
            <div className="font-medium">Nothing was saved.</div>
            <div>{outcome.error}</div>
            {expected && (
              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <div className="font-medium">Columns we expected</div>
                  <ul className="mt-1 list-disc pl-4">
                    {expected.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-medium">Columns in your file</div>
                  {found && found.length > 0 ? (
                    <ul className="mt-1 list-disc pl-4">
                      {found.slice(0, 12).map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                      {found.length > 12 && <li>and {found.length - 12} more</li>}
                    </ul>
                  ) : (
                    <div className="mt-1">(none)</div>
                  )}
                </div>
              </div>
            )}
            <div className="text-xs">This attempt is recorded on the home page so you can see what was tried.</div>
          </AlertDescription>
        </Alert>
      )}

      {outcome.kind === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong on our side</AlertTitle>
          <AlertDescription className="space-y-1">
            <div className="font-medium">Nothing was saved.</div>
            <div>The import stopped partway and the partial template was removed. Try again; if it happens twice, send us the file.</div>
            <div className="text-xs">{outcome.error}</div>
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
