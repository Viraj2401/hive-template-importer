"use client";

import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the viewer's own time zone. The server renders a
 * stable UTC string first so hydration is deterministic; the browser then
 * swaps in the local form. Keeps every time on a page in the same zone.
 */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const [text, setText] = useState(() => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`);
  useEffect(() => {
    setText(new Date(iso).toLocaleString());
  }, [iso]);
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
