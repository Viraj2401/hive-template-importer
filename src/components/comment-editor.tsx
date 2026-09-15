"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Save = (input: { name: string; body: string }) => Promise<{ ok: true } | { ok: false; error: string }>;

export function CommentEditor({
  name,
  bodyHtml,
  bodyText,
  onSave,
  children,
}: {
  name: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  onSave: Save;
  /** The read-only rendering, shown when not editing. */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [n, setN] = useState(name ?? "");
  const [body, setBody] = useState(bodyHtml ?? bodyText ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sourceIsHtml = bodyHtml !== null;

  function commit() {
    start(async () => {
      const r = await onSave({ name: n, body });
      if (r.ok) {
        setEditing(false);
        setError(null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  if (!editing) {
    return (
      <div>
        {children}
        <button
          type="button"
          onClick={() => {
            setN(name ?? "");
            setBody(bodyHtml ?? bodyText ?? "");
            setEditing(true);
          }}
          className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Edit this comment"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="space-y-1">
        <Label className="text-xs">Comment name</Label>
        <Input value={n} onChange={(e) => setN(e.target.value)} className="h-8" disabled={pending} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">
          Comment text {sourceIsHtml && <span className="text-muted-foreground">(editing HTML source, as exported)</span>}
        </Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={Math.min(14, Math.max(4, body.split("\n").length + 1))}
          className="font-mono text-xs"
          disabled={pending}
        />
        <p className="text-[11px] text-muted-foreground">
          {sourceIsHtml
            ? "Formatting from your Spectora export is kept exactly as it was. The marks in angle brackets are that formatting: <p> starts a paragraph, <strong> makes text bold, <a href=…> is a link. Change the words; leave the marks where they are."
            : "Plain text, exactly as exported. Line breaks are kept."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={commit} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
          Cancel
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
      <p className="text-[11px] text-muted-foreground">Saving will make the fidelity check show this comment as edited after import.</p>
    </div>
  );
}
