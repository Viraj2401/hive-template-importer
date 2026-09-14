/**
 * Spectora "Export to spreadsheet -> Export HTML Text" parser.
 *
 * Design rules (these are the assignment's rules, restated as code):
 *   1. Deterministic. No model in the import path. The export is a structured
 *      sheet with explicit columns; a parser is more faithful than an LLM.
 *   2. Column-driven, not position-driven. Headers are matched on their prefix
 *      ("Comment Type (info, limit, defect)" -> "comment type") so another export
 *      in the same family still imports.
 *   3. Nothing is silently dropped. Every column either maps to a first-class
 *      field or lands verbatim in `extra`, and every deviation is an issue.
 *   4. "Missing in source" and "unsupported by importer" are different issues.
 *
 * Observed shape of the real export (InterNACHI Residential, Sep 2026):
 *   - One sheet, one header row, one row per comment, 42 columns.
 *   - Section Name / Item Name repeat on every row; hierarchy is implicit.
 *   - Names are HTML-escaped ("&amp;") and sometimes padded ("Temperature ").
 *   - Comment Text is a mix of bare prose and "<p>...</p>\r\n".
 *   - Form-field comments (checkbox / number / text) have no Comment Text.
 */

import * as XLSX from "xlsx";
import type { ExtraValue, ParsedComment, ParsedIssue, ParsedItem, ParsedSection, ParsedTemplate } from "./types";
import { ImportRejectedError } from "./types";

/** Canonical (normalised) header prefixes that map to first-class fields. */
export const MAPPED_COLUMNS = {
  sectionName: "section name",
  itemName: "item name",
  commentName: "comment name",
  commentText: "comment text",
  commentType: "comment type",
  category: "category",
  recommendation: "recommendation",
} as const;

const REQUIRED: ReadonlyArray<string> = [
  MAPPED_COLUMNS.sectionName,
  MAPPED_COLUMNS.itemName,
  MAPPED_COLUMNS.commentName,
];

/** Not mapped to a field, but read for a consistency check. */
const ORDER_COLUMN = "order";

const UNSECTIONED = "Unsectioned";
const UNNAMED_ITEM = "Unnamed item";

// ---------- helpers ----------

/** "Comment Type (info, limit, defect)" -> "comment type" */
export function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .split("(")[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Minimal HTML entity decoding for values that are plain text but arrive escaped. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
}

const TAG_RE = /<\/?[a-z][^>]*>/i;
export function hasHtml(s: string): boolean {
  return TAG_RE.test(s);
}

/** HTML -> plain text for search and fidelity comparison. Not for rendering. */
export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** "InterNACHI Residential -2026-09-14.xls" -> "InterNACHI Residential" */
export function suggestName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return base.replace(/\s*-?\s*\d{4}-\d{2}-\d{2}\s*$/, "").trim() || "Imported template";
}

// ---------- parser ----------

export function parseSpectoraExport(data: Uint8Array | ArrayBuffer, fileName: string): ParsedTemplate {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: data instanceof ArrayBuffer ? "array" : "buffer" });
  } catch {
    throw new ImportRejectedError("The file is not a readable spreadsheet. Expected Spectora's .xls or .xlsx export.", {
      fileName,
    });
  }

  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ImportRejectedError("The spreadsheet contains no sheets.", { fileName });
  const ws = wb.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
  if (rows.length === 0) throw new ImportRejectedError("The spreadsheet is empty.", { fileName });

  const headerRaw = (rows[0] ?? []).map((h) => cell(h).trim());
  if (headerRaw.every((h) => h === "")) {
    throw new ImportRejectedError("The first row has no column headers.", { fileName });
  }
  const headerNorm = headerRaw.map(normalizeHeader);
  const col = (key: string): number => headerNorm.indexOf(key);

  const missingRequired = REQUIRED.filter((k) => col(k) === -1);
  if (missingRequired.length > 0) {
    throw new ImportRejectedError(
      `Missing required column(s): ${missingRequired.map((k) => `"${k}"`).join(", ")}. This does not look like a Spectora template export.`,
      { fileName, expected: [...REQUIRED], found: headerRaw.filter(Boolean) },
    );
  }

  const dataRows = rows.slice(1);
  const nonBlankRows = dataRows.filter((r) => (r ?? []).some((c) => cell(c).trim() !== ""));
  if (nonBlankRows.length === 0) {
    throw new ImportRejectedError("The spreadsheet has headers but no template rows.", { fileName });
  }

  const mappedKeys = new Set<string>(Object.values(MAPPED_COLUMNS));
  const columnsMapped = headerRaw.filter((h, i) => h !== "" && mappedKeys.has(headerNorm[i]));
  const issues: ParsedIssue[] = [];

  // ---- column-level issues: one per column, never one per row ----
  const nonEmptyCount = headerRaw.map((_, i) => nonBlankRows.filter((r) => cell(r?.[i]).trim() !== "").length);
  headerRaw.forEach((h, i) => {
    if (h === "") return;
    const isMapped = mappedKeys.has(headerNorm[i]);
    const isOrder = headerNorm[i] === ORDER_COLUMN;
    if (nonEmptyCount[i] === 0) {
      issues.push({
        severity: "info",
        kind: "missing_in_source",
        rowNumber: null,
        location: `column "${h}"`,
        message: `The export has no values in "${h}". Nothing to import for this field.`,
        rawValue: null,
      });
    } else if (!isMapped && !isOrder) {
      issues.push({
        severity: "unsupported",
        kind: "unsupported_by_importer",
        rowNumber: null,
        location: `column "${h}"`,
        message: `"${h}" (${nonEmptyCount[i]} value${nonEmptyCount[i] === 1 ? "" : "s"}) is preserved verbatim on each comment but is not editable in this app.`,
        rawValue: null,
      });
    }
  });

  const iSection = col(MAPPED_COLUMNS.sectionName);
  const iItem = col(MAPPED_COLUMNS.itemName);
  const iCommentName = col(MAPPED_COLUMNS.commentName);
  const iText = col(MAPPED_COLUMNS.commentText);
  const iType = col(MAPPED_COLUMNS.commentType);
  const iCategory = col(MAPPED_COLUMNS.category);
  const iRecommendation = col(MAPPED_COLUMNS.recommendation);
  const iOrder = col(ORDER_COLUMN);

  if (iText === -1) {
    issues.push({
      severity: "warning",
      kind: "missing_in_source",
      rowNumber: null,
      location: "file",
      message: 'No "Comment Text" column. Comments were imported without narrative text.',
      rawValue: null,
    });
  } else if (!nonBlankRows.some((r) => hasHtml(cell(r?.[iText])))) {
    issues.push({
      severity: "warning",
      kind: "other",
      rowNumber: null,
      location: "file",
      message:
        "No HTML found in any comment. If this is Spectora's plain-text export, links and formatting were stripped at the source. Re-export using \"Export HTML Text\" to keep them.",
      rawValue: null,
    });
  }

  // ---- row grouping ----
  const sections: ParsedSection[] = [];
  const seenSections = new Set<string>();
  let cur: ParsedSection | null = null;
  let curItem: ParsedItem | null = null;
  const reportedNameFixes = new Set<string>();
  let rowsBlank = 0;
  let commentsWithHtml = 0;
  let commentsWithoutText = 0;
  let orphanRows = 0;

  const cleanName = (raw: string, kind: "section" | "item" | "comment", rowNumber: number): { name: string; rawName: string | null } => {
    const decoded = decodeEntities(raw);
    const name = decoded.trim();
    if (name === raw) return { name, rawName: null };
    const key = `${kind}:${raw}`;
    if (!reportedNameFixes.has(key)) {
      reportedNameFixes.add(key);
      const changes: string[] = [];
      if (decoded !== raw) changes.push("HTML entities decoded");
      if (name !== decoded) changes.push("surrounding whitespace trimmed");
      issues.push({
        severity: "info",
        kind: "other",
        rowNumber,
        location: `${kind} "${name}"`,
        message: `${changes.join("; ")} in ${kind} name. Original kept as raw_name.`,
        rawValue: raw,
      });
    }
    return { name, rawName: raw };
  };

  dataRows.forEach((r, idx) => {
    const rowNumber = idx + 2; // 1-based, header is row 1
    const row = r ?? [];
    if (!row.some((c) => cell(c).trim() !== "")) {
      rowsBlank++;
      return;
    }

    const rawSection = cell(row[iSection]);
    const rawItem = cell(row[iItem]);
    const rawCommentName = cell(row[iCommentName]);

    let section = cleanName(rawSection, "section", rowNumber);
    let item = cleanName(rawItem, "item", rowNumber);

    if (section.name === "") {
      orphanRows++;
      section = { name: UNSECTIONED, rawName: null };
      issues.push({
        severity: "warning",
        kind: "orphan",
        rowNumber,
        location: `row ${rowNumber}`,
        message: `Row has no Section Name. Placed under "${UNSECTIONED}" so it is not lost.`,
        rawValue: rawCommentName || null,
      });
    }
    if (item.name === "") {
      orphanRows++;
      item = { name: UNNAMED_ITEM, rawName: null };
      issues.push({
        severity: "warning",
        kind: "orphan",
        rowNumber,
        location: `row ${rowNumber}`,
        message: `Row has no Item Name. Placed under "${UNNAMED_ITEM}" in section "${section.name}".`,
        rawValue: rawCommentName || null,
      });
    }

    // New section when the name changes from the previous row. A name that
    // reappears later becomes a *second* section, preserving source order.
    if (!cur || cur.name !== section.name) {
      if (seenSections.has(section.name)) {
        issues.push({
          severity: "info",
          kind: "duplicate",
          rowNumber,
          location: `section "${section.name}"`,
          message: "Section name appears again after other sections. Imported as a separate section to preserve source order.",
          rawValue: null,
        });
      }
      cur = { name: section.name, rawName: section.rawName, sourceRow: rowNumber, items: [] };
      sections.push(cur);
      seenSections.add(section.name);
      curItem = null;
    }

    if (!curItem || curItem.name !== item.name) {
      if (cur.items.some((it) => it.name === item.name)) {
        issues.push({
          severity: "info",
          kind: "duplicate",
          rowNumber,
          location: `item "${item.name}" in section "${cur.name}"`,
          message: "Item name appears again within the same section. Imported as a separate item to preserve source order.",
          rawValue: null,
        });
      }
      curItem = { name: item.name, rawName: item.rawName, sourceRow: rowNumber, comments: [] };
      cur.items.push(curItem);
    }

    const rawText = iText >= 0 ? cell(row[iText]) : "";
    const isHtml = hasHtml(rawText);
    if (isHtml) commentsWithHtml++;
    if (rawText.trim() === "") commentsWithoutText++;

    const extra: Record<string, ExtraValue> = {};
    headerRaw.forEach((h, i) => {
      if (h === "" || mappedKeys.has(headerNorm[i])) return;
      const v = cell(row[i]);
      if (v !== "") extra[h] = v;
    });

    const commentName = cleanName(rawCommentName, "comment", rowNumber);

    curItem.comments.push({
      name: commentName.name || null,
      rawName: commentName.rawName,
      bodyHtml: isHtml ? rawText : null,
      bodyText: rawText.trim() === "" ? null : isHtml ? stripTags(rawText) : decodeEntities(rawText).replace(/\r\n/g, "\n").trim(),
      commentType: iType >= 0 ? cell(row[iType]).trim() || null : null,
      category: iCategory >= 0 ? cell(row[iCategory]).trim() || null : null,
      recommendation: iRecommendation >= 0 ? cell(row[iRecommendation]).trim() || null : null,
      sourceRow: rowNumber,
      extra,
    });
  });

  // ---- consistency check: source "Order (w/i item)" vs row order ----
  if (iOrder >= 0) {
    let disagreements = 0;
    for (const s of sections) {
      for (const it of s.items) {
        const orders = it.comments.map((c) => Number(c.extra[headerRaw[iOrder]] ?? NaN));
        const expected = orders.map((_, i) => i);
        if (orders.some((o) => Number.isNaN(o))) continue;
        if (orders.some((o, i) => o !== expected[i])) disagreements++;
      }
    }
    if (disagreements > 0) {
      issues.push({
        severity: "info",
        kind: "other",
        rowNumber: null,
        location: `column "${headerRaw[iOrder]}"`,
        message: `In ${disagreements} item(s) the source order column disagrees with row order. Row order was used; the source value is preserved in extra.`,
        rawValue: null,
      });
    }
  }

  if (rowsBlank > 0) {
    issues.push({
      severity: "info",
      kind: "other",
      rowNumber: null,
      location: "file",
      message: `${rowsBlank} blank row(s) ignored.`,
      rawValue: null,
    });
  }
  if (commentsWithoutText > 0) {
    issues.push({
      severity: "info",
      kind: "missing_in_source",
      rowNumber: null,
      location: 'column "Comment Text"',
      message: `${commentsWithoutText} comment(s) have no narrative text in the export (typically checkbox, number or text answer fields). Imported with an empty body; their answer configuration is preserved in extra.`,
      rawValue: null,
    });
  }

  const itemsCount = sections.reduce((n, s) => n + s.items.length, 0);
  const commentsCount = sections.reduce((n, s) => n + s.items.reduce((m, it) => m + it.comments.length, 0), 0);

  return {
    suggestedName: suggestName(fileName),
    sections,
    issues,
    stats: {
      rowsTotal: nonBlankRows.length,
      rowsBlank,
      sections: sections.length,
      items: itemsCount,
      comments: commentsCount,
      commentsWithHtml,
      commentsWithoutText,
    },
    columnsSeen: headerRaw.filter((h) => h !== ""),
    columnsMapped,
  };
}
