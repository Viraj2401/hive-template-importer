/**
 * Seed the database with the committed Spectora export, through the exact same
 * code path the upload route uses. Idempotent by file hash: re-running does not
 * create a duplicate template.
 *
 * Usage:  npm run seed
 *         (loads .env.local via node --env-file)
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const FIXTURE = path.resolve(process.cwd(), "fixtures/InterNACHI Residential -2026-09-14.xls");

async function main() {
  // Lazy imports so the "server-only" guard does not fire at module load in a script context.
  const { sha256, importSpectoraFile } = await import("../src/lib/db/import");
  const { supabaseServer } = await import("../src/lib/supabase/server");

  const data = new Uint8Array(readFileSync(FIXTURE));
  const hash = sha256(data);
  const sb = supabaseServer();

  const { data: existing } = await sb.from("templates").select("id, name").eq("source_file_hash", hash).maybeSingle();
  if (existing) {
    console.log(`Already seeded: "${existing.name}" (${existing.id}). Nothing to do.`);
    return;
  }

  const res = await importSpectoraFile(data, path.basename(FIXTURE));
  console.log("Seeded template", res.templateId);
  console.log("  sections:", res.stats.sections, " items:", res.stats.items, " comments:", res.stats.comments);
  console.log("  issues recorded:", res.issuesCount);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
