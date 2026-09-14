/**
 * Import Fidelity Report.
 *
 * The customer's fear is silent loss. This module turns "we preserved your
 * template" from a claim into a check: the parsed source and the stored tree
 * are reduced to the same 4-column shape and compared position by position.
 *
 * Pure functions, no I/O, so they are unit-testable and can run both at import
 * time (parsed vs freshly stored) and later (snapshot vs current tree, to show
 * drift after edits).
 */

import type { ParsedTemplate } from "@/lib/import/types";
import type { TemplateTree } from "@/lib/types";
import { decodeEntities, hasHtml } from "@/lib/import/spectora";

export interface SnapshotComment {
  name: string | null;
  /** body_html when present, else body_text. The exact stored/parsed value. */
  text: string | null;
  html: boolean;
}
export interface SnapshotItem {
  name: string;
  comments: SnapshotComment[];
}
export interface SnapshotSection {
  name: string;
  items: SnapshotItem[];
}
export interface Snapshot {
  sections: SnapshotSection[];
}

export type MismatchKind = "exact_mismatch" | "whitespace_only" | "missing_in_stored" | "extra_in_stored";
export interface Mismatch {
  path: string;
  field: "section.name" | "item.name" | "comment.name" | "comment.text" | "structure";
  kind: MismatchKind;
  source: string | null;
  stored: string | null;
}

export interface FidelityReport {
  status: "green" | "amber" | "red";
  checkedAt: string;
  counts: {
    source: { sections: number; items: number; comments: number };
    stored: { sections: number; items: number; comments: number };
  };
  ordering: { sections: boolean; items: boolean; comments: boolean };
  text: { exact: number; whitespaceOnly: number; mismatched: number; missing: number; extra: number };
  html: { source: number; stored: number; preserved: boolean };
  mismatches: Mismatch[];
  mismatchesTruncated: boolean;
}

export interface FidelityRecord {
  atImport: FidelityReport;
  latest: FidelityReport;
}

const MAX_MISMATCHES = 200;

export function snapshotFromParsed(p: ParsedTemplate): Snapshot {
  return {
    sections: p.sections.map((s) => ({
      name: s.name,
      items: s.items.map((it) => ({
        name: it.name,
        comments: it.comments.map((c) => ({
          name: c.name,
          text: c.bodyHtml ?? c.bodyText,
          html: c.bodyHtml !== null,
        })),
      })),
    })),
  };
}

export function snapshotFromTree(t: TemplateTree): Snapshot {
  return {
    sections: t.sections.map((s) => ({
      name: s.name,
      items: s.items.map((it) => ({
        name: it.name,
        comments: it.comments.map((c) => ({
          name: c.name,
          text: c.body_html ?? c.body_text,
          html: c.body_html !== null,
        })),
      })),
    })),
  };
}

function norm(s: string | null): string {
  if (s === null) return "";
  return decodeEntities(s).replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

function countAll(s: Snapshot) {
  return {
    sections: s.sections.length,
    items: s.sections.reduce((n, x) => n + x.items.length, 0),
    comments: s.sections.reduce((n, x) => n + x.items.reduce((m, i) => m + i.comments.length, 0), 0),
  };
}

export function computeFidelity(source: Snapshot, stored: Snapshot, now: Date = new Date()): FidelityReport {
  const mismatches: Mismatch[] = [];
  const text = { exact: 0, whitespaceOnly: 0, mismatched: 0, missing: 0, extra: 0 };
  const html = { source: 0, stored: 0, preserved: true };
  const ordering = { sections: true, items: true, comments: true };

  const push = (m: Mismatch) => {
    if (mismatches.length < MAX_MISMATCHES) mismatches.push(m);
  };

  const compareStr = (path: string, field: Mismatch["field"], a: string | null, b: string | null): "exact" | "ws" | "diff" => {
    if (a === b) return "exact";
    if (norm(a) === norm(b)) {
      push({ path, field, kind: "whitespace_only", source: a, stored: b });
      return "ws";
    }
    push({ path, field, kind: "exact_mismatch", source: a, stored: b });
    return "diff";
  };

  const nSec = Math.max(source.sections.length, stored.sections.length);
  for (let i = 0; i < nSec; i++) {
    const ss = source.sections[i];
    const ts = stored.sections[i];
    const sPath = `sections[${i}]`;
    if (!ss) {
      push({ path: sPath, field: "structure", kind: "extra_in_stored", source: null, stored: ts.name });
      ordering.sections = false;
      continue;
    }
    if (!ts) {
      push({ path: sPath, field: "structure", kind: "missing_in_stored", source: ss.name, stored: null });
      ordering.sections = false;
      continue;
    }
    if (compareStr(`${sPath} "${ss.name}"`, "section.name", ss.name, ts.name) === "diff") ordering.sections = false;

    const nIt = Math.max(ss.items.length, ts.items.length);
    for (let j = 0; j < nIt; j++) {
      const si = ss.items[j];
      const ti = ts.items[j];
      const iPath = `${sPath}.items[${j}]`;
      if (!si) {
        push({ path: iPath, field: "structure", kind: "extra_in_stored", source: null, stored: ti.name });
        ordering.items = false;
        continue;
      }
      if (!ti) {
        push({ path: iPath, field: "structure", kind: "missing_in_stored", source: si.name, stored: null });
        ordering.items = false;
        continue;
      }
      if (compareStr(`${iPath} "${si.name}"`, "item.name", si.name, ti.name) === "diff") ordering.items = false;

      const nC = Math.max(si.comments.length, ti.comments.length);
      for (let k = 0; k < nC; k++) {
        const sc = si.comments[k];
        const tc = ti.comments[k];
        const cPath = `${iPath}.comments[${k}]`;
        if (!sc) {
          text.extra++;
          push({ path: cPath, field: "structure", kind: "extra_in_stored", source: null, stored: tc.name });
          ordering.comments = false;
          continue;
        }
        if (!tc) {
          text.missing++;
          push({ path: cPath, field: "structure", kind: "missing_in_stored", source: sc.name, stored: null });
          ordering.comments = false;
          continue;
        }
        if (sc.html) html.source++;
        if (tc.html) html.stored++;
        if (sc.html && !tc.html) html.preserved = false;

        if (compareStr(`${cPath} "${sc.name ?? ""}"`, "comment.name", sc.name, tc.name) === "diff") ordering.comments = false;
        const r = compareStr(`${cPath} "${sc.name ?? ""}"`, "comment.text", sc.text, tc.text);
        if (r === "exact") text.exact++;
        else if (r === "ws") text.whitespaceOnly++;
        else text.mismatched++;
      }
    }
  }

  const counts = { source: countAll(source), stored: countAll(stored) };
  const structuralLoss =
    text.missing > 0 || text.extra > 0 || !ordering.sections || !ordering.items || !ordering.comments ||
    counts.source.sections !== counts.stored.sections ||
    counts.source.items !== counts.stored.items ||
    counts.source.comments !== counts.stored.comments;

  let status: FidelityReport["status"] = "green";
  if (structuralLoss || text.mismatched > 0 || !html.preserved) status = "red";
  else if (text.whitespaceOnly > 0 || mismatches.length > 0) status = "amber";

  return {
    status,
    checkedAt: now.toISOString(),
    counts,
    ordering,
    text,
    html,
    mismatches,
    mismatchesTruncated: mismatches.length >= MAX_MISMATCHES,
  };
}

/** Convenience for tests and scripts: does the text we would display differ from the source at all? */
export function summarise(r: FidelityReport): string {
  const c = r.counts;
  return [
    `status=${r.status}`,
    `sections ${c.source.sections}/${c.stored.sections}`,
    `items ${c.source.items}/${c.stored.items}`,
    `comments ${c.source.comments}/${c.stored.comments}`,
    `text exact=${r.text.exact} ws=${r.text.whitespaceOnly} diff=${r.text.mismatched} missing=${r.text.missing} extra=${r.text.extra}`,
    `html ${r.html.source}/${r.html.stored}${r.html.preserved ? "" : " (LOST)"}`,
  ].join(" | ");
}

export { hasHtml };
