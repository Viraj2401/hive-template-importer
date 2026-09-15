"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Save = (name: string) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * A name with an always-visible pencil button. The pencil is the only edit
 * trigger on purpose: item names live inside <summary>, where clicking the
 * text should expand the item, not start a rename.
 */
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
    const iconSize = Tag === "h1" ? "h-4 w-4" : "h-3.5 w-3.5";
    return (
      <Tag className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
        <span>{name}</span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setValue(name);
            setEditing(true);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2"
          aria-label={`Rename ${name}`}
          title="Rename"
        >
          <Pencil className={iconSize} aria-hidden="true" />
        </button>
      </Tag>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-8 w-72 font-normal"
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
