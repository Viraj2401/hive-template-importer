"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Save = (name: string) => Promise<{ ok: true } | { ok: false; error: string }>;

export function EditableName({
  name,
  onSave,
  className,
  as: Tag = "span",
}: {
  name: string;
  onSave: Save;
  className?: string;
  as?: "span" | "h1";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function commit() {
    if (value.trim() === name) return setEditing(false);
    start(async () => {
      const r = await onSave(value);
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
      <Tag className={className}>
        {name}
        <button
          type="button"
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
          className="ml-2 align-middle text-xs text-muted-foreground underline-offset-2 hover:underline"
          aria-label={`Rename ${name}`}
        >
          rename
        </button>
      </Tag>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-8 w-72"
        disabled={pending}
      />
      <Button size="sm" onClick={commit} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
        Cancel
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
