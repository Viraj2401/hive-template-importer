/**
 * Parser tests against the committed Spectora export.
 * The central claim: every non-blank row becomes exactly one comment. Nothing is dropped.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { ImportRejectedError } from "./types";
import { decodeEntities, normalizeHeader, parseSpectoraExport, stripTags, suggestName } from "./spectora";

const FIXTURE = path.resolve(__dirname, "../../../fixtures/InterNACHI Residential -2026-09-14.xls");
const fixture = () => new Uint8Array(readFileSync(FIXTURE));

function countNonBlankRows(): number {
  const wb = XLSX.read(readFileSync(FIXTURE), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: false });
  return rows.slice(1).filter((r) => (r ?? []).some((c) => String(c ?? "").trim() !== "")).length;
}

describe("parseSpectoraExport on the InterNACHI Residential fixture", () => {
  const parsed = parseSpectoraExport(fixture(), "InterNACHI Residential -2026-09-14.xls");

  it("turns every non-blank source row into exactly one comment", () => {
    const sourceRows = countNonBlankRows();
    expect(parsed.stats.rowsTotal).toBe(sourceRows);
    expect(parsed.stats.comments).toBe(sourceRows);
    const treeCount = parsed.sections.reduce((n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0), 0);
    expect(treeCount).toBe(sourceRows);
  });

  it("never emits a 'skipped' issue - nothing is dropped", () => {
    expect(parsed.issues.filter((i) => i.severity === "skipped")).toHaveLength(0);
  });

  it("rebuilds the hierarchy from the flat rows in source order", () => {
    expect(parsed.sections[0].name).toBe("Inspection Details");
    expect(parsed.sections[0].items[0].name).toBe("General");
    expect(parsed.sections[0].items[0].comments[0].name).toBe("In Attendance");
    expect(parsed.sections[1].name).toBe("Exterior");
    expect(parsed.stats.sections).toBeGreaterThan(5);
  });

  it("decodes HTML entities in names and keeps the raw value", () => {
    const exterior = parsed.sections.find((s) => s.name === "Exterior")!;
    const siding = exterior.items.find((i) => i.name === "Siding, Flashing & Trim")!;
    expect(siding).toBeDefined();
    expect(siding.rawName).toBe("Siding, Flashing &amp; Trim");
  });

  it("trims padded names and keeps the raw value", () => {
    const general = parsed.sections[0].items[0];
    const temp = general.comments.find((c) => c.name === "Temperature")!;
    expect(temp).toBeDefined();
    expect(temp.rawName).toBe("Temperature ");
  });

  it("keeps HTML comment bodies verbatim and derives plain text", () => {
    const exterior = parsed.sections.find((s) => s.name === "Exterior")!;
    const siding = exterior.items.find((i) => i.name === "Siding, Flashing & Trim")!;
    const c = siding.comments.find((c) => c.name === "Evidence of Water Intrusion")!;
    expect(c.bodyHtml).toMatch(/^<p>Siding showed signs of water intrusion/);
    expect(c.bodyHtml).toMatch(/<\/p>\r?\n?$/);
    expect(c.bodyText).toMatch(/^Siding showed signs of water intrusion/);
    expect(c.bodyText).not.toMatch(/<p>/);
  });

  it("stores plain-text comment bodies as text with no html", () => {
    const exterior = parsed.sections.find((s) => s.name === "Exterior")!;
    const siding = exterior.items.find((i) => i.name === "Siding, Flashing & Trim")!;
    const c = siding.comments.find((c) => c.name === "Cracking - Major")!;
    expect(c.bodyHtml).toBeNull();
    expect(c.bodyText).toMatch(/^Moderate to major cracking/);
  });

  it("keeps form-field comments that legitimately have no text", () => {
    const attendance = parsed.sections[0].items[0].comments[0];
    expect(attendance.name).toBe("In Attendance");
    expect(attendance.bodyText).toBeNull();
    expect(attendance.extra["Multiple Choice Options (comma-separated)"]).toContain("Client");
    expect(parsed.stats.commentsWithoutText).toBeGreaterThan(0);
    const note = parsed.issues.find((i) => i.kind === "missing_in_source" && /no narrative text/.test(i.message));
    expect(note).toBeDefined();
  });

  it("preserves every unmapped column verbatim in extra, keyed by original header", () => {
    const c = parsed.sections[1].items[0].comments[0]; // Exterior > General > Inspection Method
    expect(c.extra["Answer Type (boolean, checkbox, date, number, range, text)"]).toBe("checkbox");
    expect(c.extra["Order (w/i item)"]).toBe("0");
    expect(c.extra["Last Modified"]).toBeTruthy();
    // mapped columns must NOT be duplicated into extra
    expect(c.extra["Section Name"]).toBeUndefined();
    expect(c.extra["Comment Text"]).toBeUndefined();
  });

  it("distinguishes missing-in-source columns from unsupported-by-importer columns", () => {
    const missing = parsed.issues.filter((i) => i.kind === "missing_in_source" && /Default Photo 1"/.test(i.location ?? ""));
    expect(missing).toHaveLength(1);
    const unsupported = parsed.issues.filter((i) => i.kind === "unsupported_by_importer");
    expect(unsupported.some((i) => /Multiple Choice Options/.test(i.location ?? ""))).toBe(true);
    // a column with values that we DO map must not be flagged unsupported
    expect(unsupported.some((i) => /"Comment Text"/.test(i.location ?? ""))).toBe(false);
  });

  it("records the columns it saw and the columns it mapped", () => {
    expect(parsed.columnsSeen).toHaveLength(42);
    expect(parsed.columnsMapped).toEqual(
      expect.arrayContaining(["Section Name", "Item Name", "Comment Name", "Comment Text"]),
    );
    expect(parsed.columnsMapped.length).toBe(7);
  });

  it("does not warn about a plain-text export when HTML is present", () => {
    expect(parsed.stats.commentsWithHtml).toBeGreaterThan(0);
    expect(parsed.issues.some((i) => /plain-text export/.test(i.message))).toBe(false);
  });
});

describe("failure cases", () => {
  it("rejects a file that is not a spreadsheet", () => {
    expect(() => parseSpectoraExport(new TextEncoder().encode("hello, world"), "notes.txt")).toThrow(ImportRejectedError);
  });

  it("rejects a sheet with no required columns and lists what it found", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Foo", "Bar"], ["1", "2"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    try {
      parseSpectoraExport(buf, "wrong.xlsx");
      throw new Error("expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(ImportRejectedError);
      const err = e as ImportRejectedError;
      expect(err.reason).toMatch(/Missing required column/);
      expect(err.details?.found).toEqual(["Foo", "Bar"]);
    }
  });

  it("rejects a header-only sheet", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Section Name", "Item Name", "Comment Name", "Comment Text"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(() => parseSpectoraExport(buf, "empty.xlsx")).toThrow(/no template rows/);
  });

  it("keeps orphan rows under Unsectioned instead of dropping them", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Section Name", "Item Name", "Comment Name", "Comment Text"],
      ["Roof", "Coverings", "Damaged", "<p>Shingles damaged.</p>"],
      ["", "", "Lost comment", "This row has no section or item."],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const p = parseSpectoraExport(buf, "orphans.xlsx");
    expect(p.stats.comments).toBe(2);
    const unsectioned = p.sections.find((s) => s.name === "Unsectioned")!;
    expect(unsectioned.items[0].name).toBe("Unnamed item");
    expect(unsectioned.items[0].comments[0].name).toBe("Lost comment");
    expect(p.issues.filter((i) => i.kind === "orphan")).toHaveLength(2);
  });

  it("warns when no HTML is present (likely plain-text export) but still imports", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Section Name", "Item Name", "Comment Name", "Comment Text"],
      ["Roof", "Coverings", "Damaged", "Shingles damaged."],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const p = parseSpectoraExport(buf, "plain.xlsx");
    expect(p.stats.comments).toBe(1);
    expect(p.issues.some((i) => i.severity === "warning" && /plain-text export/.test(i.message))).toBe(true);
  });
});

describe("helpers", () => {
  it("normalises headers by prefix", () => {
    expect(normalizeHeader("Comment Type (info, limit, defect)")).toBe("comment type");
    expect(normalizeHeader("Order (w/i item)")).toBe("order");
    expect(normalizeHeader("  Section   Name ")).toBe("section name");
  });
  it("decodes entities", () => {
    expect(decodeEntities("Siding, Flashing &amp; Trim")).toBe("Siding, Flashing & Trim");
    expect(decodeEntities("&lt;b&gt; &#39;x&#39; &#x41;")).toBe("<b> 'x' A");
  });
  it("strips tags to text", () => {
    expect(stripTags("<p>Hello <b>world</b></p>\r\n")).toBe("Hello world");
  });
  it("suggests a name from the file name", () => {
    expect(suggestName("InterNACHI Residential -2026-09-14.xls")).toBe("InterNACHI Residential");
    expect(suggestName("my-template.xlsx")).toBe("my-template");
  });
});
