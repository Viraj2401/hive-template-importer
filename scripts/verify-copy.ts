/**
 * Proves that a copied template is independent of its original.
 *
 * 1. Copy the seeded template.
 * 2. Rename a section, rename an item, and rewrite a comment on the COPY.
 * 3. Re-read the ORIGINAL and assert nothing changed.
 * 4. Assert the copy has the same shape (sections/items/comments) as the original.
 * 5. Delete the copy; assert the original still has all its rows.
 *
 * Usage: npm run verify:copy
 */
import assert from "node:assert/strict";

async function main() {
  const { supabaseServer } = await import("../src/lib/supabase/server");
  const { getTemplateTree, listTemplates } = await import("../src/lib/db/templates");
  const { copyTemplate, renameSection, renameItem, updateComment, deleteTemplate } = await import("../src/lib/db/mutations");

  const sb = supabaseServer();
  const templates = await listTemplates();
  const original = templates.find((t) => !t.parent_template_id);
  assert(original, "No original (non-copy) template found. Run `npm run seed` first.");

  const before = await getTemplateTree(original.id);
  assert(before);
  const shape = (t: NonNullable<typeof before>) => ({
    sections: t.sections.length,
    items: t.sections.reduce((n, s) => n + s.items.length, 0),
    comments: t.sections.reduce((n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0), 0),
  });
  const beforeShape = shape(before);
  console.log(`Original "${before.name}":`, beforeShape);

  // 1. copy
  const copyId = await copyTemplate(original.id, `VERIFY COPY of ${before.name}`);
  const copy = await getTemplateTree(copyId);
  assert(copy, "copy not readable");
  assert.equal(copy.parent_template_id, original.id, "copy must record its parent");
  assert.deepEqual(shape(copy), beforeShape, "copy must have the same shape as the original");
  console.log("Copy created:", copyId, shape(copy));

  // no shared row ids between original and copy
  const originalIds = new Set<string>();
  for (const s of before.sections) {
    originalIds.add(s.id);
    for (const it of s.items) {
      originalIds.add(it.id);
      for (const c of it.comments) originalIds.add(c.id);
    }
  }
  for (const s of copy.sections) {
    assert(!originalIds.has(s.id), "copy shares a section row with the original");
    for (const it of s.items) {
      assert(!originalIds.has(it.id), "copy shares an item row with the original");
      for (const c of it.comments) assert(!originalIds.has(c.id), "copy shares a comment row with the original");
    }
  }
  console.log("No shared rows between original and copy.");

  // 2. mutate the copy
  const cs = copy.sections[1];
  const ci = cs.items[0];
  const cc = ci.comments.find((c) => c.body_html) ?? ci.comments[0];
  await renameSection(cs.id, `${cs.name} (EDITED)`);
  await renameItem(ci.id, `${ci.name} (EDITED)`);
  await updateComment(cc.id, { name: `${cc.name ?? ""} (EDITED)`, body: "<p><strong>Edited on the copy.</strong> Original must not change.</p>" });
  console.log(`Edited on copy: section "${cs.name}", item "${ci.name}", comment "${cc.name}".`);

  // 3. original unchanged
  const after = await getTemplateTree(original.id);
  assert(after);
  const os = after.sections[1];
  const oi = os.items[0];
  const oc = oi.comments.find((c) => c.name === cc.name) ?? oi.comments[0];
  assert.equal(os.name, before.sections[1].name, "original section name changed!");
  assert.equal(oi.name, before.sections[1].items[0].name, "original item name changed!");
  const ocBefore = before.sections[1].items[0].comments.find((c) => c.id === oc.id)!;
  assert.equal(oc.name, ocBefore.name, "original comment name changed!");
  assert.equal(oc.body_html, ocBefore.body_html, "original comment body_html changed!");
  assert.equal(oc.body_text, ocBefore.body_text, "original comment body_text changed!");
  assert.deepEqual(shape(after), beforeShape, "original shape changed!");
  console.log("Original unchanged after editing the copy.");

  // the copy did change
  const copyAfter = await getTemplateTree(copyId);
  assert(copyAfter);
  assert.equal(copyAfter.sections[1].name, `${cs.name} (EDITED)`);
  assert.equal(copyAfter.sections[1].items[0].name, `${ci.name} (EDITED)`);
  const ccAfter = copyAfter.sections[1].items[0].comments.find((c) => c.id === cc.id)!;
  assert.match(ccAfter.body_html ?? "", /Edited on the copy/);
  assert.equal(ccAfter.body_text, "Edited on the copy. Original must not change.");
  console.log("Copy reflects the edits (html kept as source, text derived).");

  // 5. delete copy, original intact
  await deleteTemplate(copyId);
  const { count } = await sb.from("comments").select("*", { count: "exact", head: true });
  const afterDelete = await getTemplateTree(original.id);
  assert(afterDelete);
  assert.deepEqual(shape(afterDelete), beforeShape, "original lost rows when copy was deleted!");
  console.log(`Copy deleted; original intact. Total comments in DB now: ${count}.`);
  console.log("\nPASS: copy is independent of the original.");
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
