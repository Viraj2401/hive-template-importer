"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function TemplateActions({
  onCopy,
  onDelete,
}: {
  onCopy: () => Promise<never>;
  onDelete: () => Promise<never>;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => onCopy())}>
        {pending ? "Working…" : "Make a copy"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this template and everything in it? This cannot be undone.")) start(() => onDelete());
        }}
      >
        Delete
      </Button>
    </div>
  );
}
