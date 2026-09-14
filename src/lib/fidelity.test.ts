import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSpectoraExport } from "./import/spectora";
import { computeFidelity, snapshotFromParsed, type Snapshot } from "./fidelity";

const FIXTURE = path.resolve(__dirname, "../../fixtures/InterNACHI Residential -2026-09-14.xls");
const parsed = parseSpectoraExport(new Uint8Array(readFileSync(FIXTURE)), "InterNACHI Residential -2026-09-14.xls");
const source = snapshotFromParsed(parsed);
const clone = (s: Snapshot): Snapshot => JSON.parse(JSON.stringify(s));

describe("computeFidelity", () => {
  it("is green when stored equals source exactly", () => {
    const r = computeFidelity(source, clone(source));
    expect(r.status).toBe("green");
    expect(r.counts.stored).toEqual(r.counts.source);
    expect(r.text.exact).toBe(r.counts.source.comments);
    expect(r.text.mismatched + r.text.missing + r.text.extra + r.text.whitespaceOnly).toBe(0);
    expect(r.ordering).toEqual({ sections: true, items: true, comments: true });
    expect(r.html.preserved).toBe(true);
    expect(r.html.source).toBe(parsed.stats.commentsWithHtml);
    expect(r.mismatches).toHaveLength(0);
  });

  it("is amber when only whitespace differs", () => {
    const stored = clone(source);
    const c = stored.sections[1].items[1].comments[2];
    c.text = (c.text ?? "") + "   \n";
    const r = computeFidelity(source, stored);
    expect(r.status).toBe("amber");
    expect(r.text.whitespaceOnly).toBe(1);
    expect(r.text.mismatched).toBe(0);
    expect(r.mismatches[0].kind).toBe("whitespace_only");
    expect(r.mismatches[0].path).toContain("sections[1].items[1].comments[2]");
  });

  it("is red when comment text changed", () => {
    const stored = clone(source);
    stored.sections[2].items[0].comments[0].text = "Something else entirely.";
    const r = computeFidelity(source, stored);
    expect(r.status).toBe("red");
    expect(r.text.mismatched).toBe(1);
    expect(r.mismatches.find((m) => m.field === "comment.text")?.kind).toBe("exact_mismatch");
  });

  it("is red when a comment was dropped, and names the path", () => {
    const stored = clone(source);
    stored.sections[1].items[1].comments.splice(3, 1);
    const r = computeFidelity(source, stored);
    expect(r.status).toBe("red");
    expect(r.counts.stored.comments).toBe(r.counts.source.comments - 1);
    expect(r.text.missing).toBe(1);
    expect(r.ordering.comments).toBe(false);
    expect(r.mismatches.some((m) => m.kind === "missing_in_stored")).toBe(true);
  });

  it("is red when HTML was flattened to text", () => {
    const stored = clone(source);
    const withHtml = stored.sections.flatMap((s) => s.items.flatMap((i) => i.comments)).find((c) => c.html)!;
    withHtml.html = false;
    withHtml.text = withHtml.text!.replace(/<[^>]+>/g, "");
    const r = computeFidelity(source, stored);
    expect(r.status).toBe("red");
    expect(r.html.preserved).toBe(false);
  });

  it("is red when a section is renamed (structure drifted from source)", () => {
    const stored = clone(source);
    stored.sections[0].name = "Renamed";
    const r = computeFidelity(source, stored);
    expect(r.status).toBe("red");
    expect(r.mismatches[0].field).toBe("section.name");
  });

  it("reports extra stored content too", () => {
    const stored = clone(source);
    stored.sections.push({ name: "Bonus", items: [] });
    const r = computeFidelity(source, stored);
    expect(r.status).toBe("red");
    expect(r.mismatches.some((m) => m.kind === "extra_in_stored" && m.field === "structure")).toBe(true);
  });
});
