// Dump the structure of a Spectora spreadsheet export so the parser is built on evidence, not assumptions.
// Usage: node scripts/inspect-export.mjs fixtures/<file>.xls
import * as XLSX from "xlsx";
import fs from "node:fs";

const path = process.argv[2];
if (!path) { console.error("usage: node scripts/inspect-export.mjs <file>"); process.exit(1); }
const wb = XLSX.read(fs.readFileSync(path), { type: "buffer" });
console.log("SHEETS:", wb.SheetNames);
const trunc = (c, n) => (typeof c === "string" && c.length > n) ? c.slice(0, n) + "…" : c;

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  console.log(`\n=== SHEET "${name}" : ${rows.length} rows, range ${ws["!ref"]} ===`);
  const hdr = rows[0] || [];
  console.log("HEADER ROW:", JSON.stringify(hdr));
  const counts = hdr.map((h, i) => [h, rows.slice(1).filter(r => r[i] !== null && r[i] !== "").length]);
  console.log("NON-EMPTY PER COLUMN:", JSON.stringify(counts));
  console.log("\nFIRST 12 DATA ROWS:");
  for (const r of rows.slice(1, 13)) console.log(JSON.stringify(r.map(c => trunc(c, 90))));
  const htmlRow = rows.slice(1).find(r => r.some(c => typeof c === "string" && /<[a-z][\s\S]*>/i.test(c)));
  console.log("\nSAMPLE ROW WITH HTML:", JSON.stringify(htmlRow?.map(c => trunc(c, 300))));
  for (const [i, h] of hdr.entries()) {
    const vals = new Set(rows.slice(1).map(r => r[i]).filter(v => v !== null && v !== ""));
    if (vals.size > 0 && vals.size <= 12) console.log(`DISTINCT "${h}":`, JSON.stringify([...vals]));
  }
}
