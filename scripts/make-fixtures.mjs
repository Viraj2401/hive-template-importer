/**
 * Generate the failure-case and generalisation fixtures from the real export.
 * Every fixture is derived from the genuine Spectora column set so the parser
 * is tested against realistic shapes, not invented ones.
 *
 * Usage: node scripts/make-fixtures.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const SRC = path.resolve("fixtures/InterNACHI Residential -2026-09-14.xls");
const OUT = path.resolve("fixtures/cases");
mkdirSync(OUT, { recursive: true });

const wb = XLSX.read(readFileSync(SRC), { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
const header = rows[0];
const body = rows.slice(1);

const write = (name, aoa, sheet = "Sheet1") => {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(aoa), sheet);
  const ext = path.extname(name).slice(1);
  XLSX.writeFile(w, path.join(OUT, name), { bookType: ext === "xls" ? "biff8" : ext });
  console.log("wrote", name, aoa.length, "rows");
};

const strip = (s) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/\r\n/g, "\n").trim();
const col = (n) => header.findIndex((h) => String(h).toLowerCase().startsWith(n));
const cText = col("comment text");
const cItem = col("item name");
const cSection = col("section name");

// 1. Plain-text export: what you get if you choose "Export Text" instead of "Export HTML Text".
write("01-plain-text-export.xlsx", [header, ...body.map((r) => { const x = [...r]; x[cText] = strip(x[cText]); return x; })]);

// 2. Missing required column: "Comment Text" removed entirely (columns shifted).
write("02-missing-comment-text.xlsx", [header.filter((_, i) => i !== cText), ...body.map((r) => r.filter((_, i) => i !== cText))]);

// 3. Header only, no rows.
write("03-header-only.xlsx", [header]);

// 4. Completely empty sheet.
write("04-empty.xlsx", [[]]);

// 5. Not a spreadsheet at all: PNG signature followed by binary noise, renamed to .xls.
//    (SheetJS would otherwise read arbitrary bytes as a one-column CSV; the parser sniffs bytes first.)
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(Array.from({ length: 256 }, (_, i) => (i * 37 + 11) & 0xff))]);
writeFileSync(path.join(OUT, "05-not-a-spreadsheet.xls"), png);
console.log("wrote 05-not-a-spreadsheet.xls");

// 6. Orphans: first 6 data rows have their Section/Item blanked, so comments exist before any section.
write("06-orphan-rows.xlsx", [header, ...body.map((r, i) => { const x = [...r]; if (i < 6) { x[cSection] = ""; x[cItem] = ""; } return x; })]);

// 7. Different platform's headers (a plausible HomeGauge-style export) - should be rejected with a clear list.
write("07-other-platform.xlsx", [["Category", "Subcategory", "Narrative", "Severity"], ["Roof", "Shingles", "Damaged shingles observed", "High"]]);

// 8. Same shape, different template: a small commercial template as CSV. Proves the parser
//    is column-driven, not tied to this file or to .xls. Includes a stray unknown column.
const small = [
  [...header, "Custom Field"],
  ["Site &amp; Grounds", "Parking", "Cracked asphalt", "<p>Asphalt surface shows <strong>cracking</strong>.</p>", "defect", "0", "", "", "Repair", "1", "", "", "", "", "", "", "", "", "", "", "", ...Array(20).fill(""), "2026-09-14", "x"],
  ["Site &amp; Grounds", "Parking", "Striping faded", "<p>Parking stall lines are faded.</p>", "info", "-1", "", "", "Monitor", "2", "", "", "", "", "", "", "", "", "", "", "", ...Array(20).fill(""), "2026-09-14", ""],
  ["Site &amp; Grounds", "Landscaping", "Trees touching roof", "<p>Trim vegetation away from the roof.</p>", "limit", "1", "", "", "Correct", "1", "", "", "", "", "", "", "", "", "", "", "", ...Array(20).fill(""), "2026-09-14", ""],
  ["Roof", "Membrane", "Ponding", "<p>Ponding water noted on the membrane.</p>", "defect", "1", "", "", "Evaluate", "1", "", "", "", "", "", "", "", "", "", "", "", ...Array(20).fill(""), "2026-09-14", ""],
  ["Roof", "Membrane", "Roof type", "", "info", "", "TPO,EPDM,Modified bitumen", "", "", "2", "checkbox", "", "", "", "", "", "", "", "", "", "", ...Array(20).fill(""), "2026-09-14", ""],
];
write("08-commercial-small.csv", small.map((r) => r.slice(0, header.length + 1)));
write("08-commercial-small.xlsx", small.map((r) => r.slice(0, header.length + 1)));
