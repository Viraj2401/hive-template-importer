/**
 * Behaviour against the derived fixtures in fixtures/cases. These are the
 * failure cases and the generalisation check shown in the demo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ImportRejectedError } from "./types";
import { parseSpectoraExport } from "./spectora";

const CASES = path.resolve(__dirname, "../../../fixtures/cases");
const load = (name: string) => new Uint8Array(readFileSync(path.join(CASES, name)));
const reject = (name: string): ImportRejectedError => {
  try {
    parseSpectoraExport(load(name), name);
  } catch (e) {
    if (e instanceof ImportRejectedError) return e;
    throw e;
  }
  throw new Error(`${name} was accepted but should have been rejected`);
};

describe("failure cases", () => {
  it("01 plain-text export is accepted with a warning that formatting is absent", () => {
    const t = parseSpectoraExport(load("01-plain-text-export.xlsx"), "01-plain-text-export.xlsx");
    expect(t.stats.comments).toBe(392);
    expect(t.stats.commentsWithHtml).toBe(0);
    const w = t.issues.find((i) => i.severity === "warning" && /html|formatting/i.test(i.message));
    expect(w).toBeDefined();
  });

  it("02 missing Comment Text column is rejected and names what was found", () => {
    const e = reject("02-missing-comment-text.xlsx");
    expect(e.reason).toMatch(/comment text/i);
    expect(e.details?.expected).toContain("comment text");
    expect((e.details?.found as string[]).length).toBe(41);
  });

  it("03 header-only file is rejected", () => {
    expect(reject("03-header-only.xlsx").reason).toMatch(/no template rows/i);
  });

  it("04 empty sheet is rejected", () => {
    expect(reject("04-empty.xlsx").reason).toMatch(/empty|no headers|no data/i);
  });

  it("05 non-spreadsheet bytes are rejected", () => {
    expect(reject("05-not-a-spreadsheet.xls").reason).toMatch(/not a readable spreadsheet/i);
  });

  it("06 orphan rows are kept under Unsectioned / Unnamed item and reported", () => {
    const t = parseSpectoraExport(load("06-orphan-rows.xlsx"), "06-orphan-rows.xlsx");
    expect(t.stats.comments).toBe(392);
    expect(t.sections[0].name).toBe("Unsectioned");
    expect(t.sections[0].items[0].name).toBe("Unnamed item");
    expect(t.sections[0].items[0].comments.length).toBe(6);
    expect(t.issues.some((i) => i.kind === "orphan")).toBe(true);
  });

  it("07 another platform's headers are rejected with the expected list", () => {
    const e = reject("07-other-platform.xlsx");
    expect(e.details?.found).toEqual(["Category", "Subcategory", "Narrative", "Severity"]);
    expect(e.details?.expected).toEqual(["section name", "item name", "comment name", "comment text"]);
  });
});

describe("generalisation", () => {
  for (const name of ["08-commercial-small.csv", "08-commercial-small.xlsx"]) {
    it(`${name}: a different template in the same shape imports fully`, () => {
      const t = parseSpectoraExport(load(name), name);
      expect(t.sections.map((s) => s.name)).toEqual(["Site & Grounds", "Roof"]);
      expect(t.sections[0].items.map((i) => i.name)).toEqual(["Parking", "Landscaping"]);
      expect(t.stats.comments).toBe(5);
      expect(t.stats.commentsWithHtml).toBe(4);
      const bonus = t.issues.find((i) => i.kind === "unsupported_by_importer" && /custom field/i.test(i.message));
      expect(bonus, "unknown column reported, not dropped").toBeDefined();
      expect(t.sections[0].items[0].comments[0].extra["Custom Field"]).toBe("x");
      expect(t.suggestedName).toBe("08-commercial-small");
    });
  }
});
