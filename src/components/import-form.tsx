"use client";

import { useState } from "react";
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

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="file">Spectora export (.xls or .xlsx)</Label>
        <Input id="file" name="file" type="file" accept=".xls,.xlsx" required />
        <p className="text-xs text-muted-foreground">
          In Spectora: Templates → your template → ⋮ → Export to spreadsheet → <strong>Export HTML Text</strong>.
          The plain-text export also imports, but links and formatting will already be gone.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Template name (optional)</Label>
        <Input id="name" name="name" placeholder="Defaults to the file name" />
      </div>
      <Button type="submit" disabled={outcome.kind === "busy"}>
        {outcome.kind === "busy" ? "Importing…" : "Import"}
      </Button>

      {outcome.kind === "ok" && (
        <Alert>
          <AlertTitle>Imported</AlertTitle>
          <AlertDescription className="space-y-2">
            <div>
              {outcome.stats.sections} sections · {outcome.stats.items} items · {outcome.stats.comments} comments from{" "}
              {outcome.stats.rowsTotal} rows. {outcome.issuesCount} note{outcome.issuesCount === 1 ? "" : "s"} recorded.
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/templates/${outcome.templateId}`)}>
              Open template
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {outcome.kind === "rejected" && (
        <Alert variant="destructive">
          <AlertTitle>Could not import this file</AlertTitle>
          <AlertDescription className="space-y-2">
            <div>{outcome.error}</div>
            {outcome.details && "expected" in outcome.details && (
              <div className="text-xs">
                <div>
                  <span className="font-medium">Expected columns:</span> {(outcome.details.expected as string[]).join(", ")}
                </div>
                <div>
                  <span className="font-medium">Found:</span>{" "}
                  {Array.isArray(outcome.details.found) && outcome.details.found.length > 0
                    ? (outcome.details.found as string[]).join(", ")
                    : "(none)"}
                </div>
              </div>
            )}
            <div className="text-xs text-muted-foreground">Nothing was saved. This attempt is recorded on the home page.</div>
          </AlertDescription>
        </Alert>
      )}

      {outcome.kind === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>{outcome.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
