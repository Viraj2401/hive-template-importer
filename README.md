# Hive Template Importer

Import an inspection template exported from Spectora, keep every section, item and comment exactly as it was, and prove it.

Live demo: https://hive-template-importer.vercel.app (password shared separately).

Take-home for the Forward Deployed Engineer role at Hive Inspect. See [NOTES.md](NOTES.md) for decisions, cuts, limitations and how it was checked, and [ai/](ai/) for how the work was done.

## What it does

- **Import** a Spectora "Export HTML Text" file (`.xls`, also `.xlsx` or `.csv` in the same column shape). Sections, items, comments and the comment HTML are stored in Postgres in their original order. Nothing is dropped: columns the importer does not understand are kept on each row as `extra`, and every such column is reported.
- **Fidelity report.** After writing, the importer re-reads what it stored and compares it to what it parsed, cell by cell. The template page shows this as green / amber / red with the exact paths of any difference. "Re-check against source" re-runs the comparison later, so after edits you can see precisely what drifted from the Spectora original.
- **Import notes.** Every deviation is recorded and shown, split by what it means: `missing_in_source` (the export had no values), `unsupported_by_importer` (the export had values that this importer preserves but does not edit), orphans, duplicates, malformed cells.
- **Edit** template, section, item and comment names inline; edit comment bodies as HTML source.
- **Copy** a template as a deep clone with its own rows, so editing the copy never touches the original.
- **Delete** a template.
- **Failure cases** are rejected with a specific reason and recorded in `import_runs` so the audit trail keeps them too.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui, Supabase Postgres, SheetJS for spreadsheet reading, `sanitize-html` at render time only, Vitest.

## Run it locally

```bash
npm install
cp .env.example .env.local        # fill in the three Supabase values
# create the schema: paste supabase/schema.sql into the Supabase SQL editor and run it
npm run seed                      # imports fixtures/InterNACHI Residential -2026-09-14.xls through the real import path
npm run dev
```

Environment variables:

| Name | Where used | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | server | project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | server | not used for writes; kept for a future browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | all reads and writes go through server code; row-level security is on with no anon policies |
| `DEMO_PASSWORD` | proxy | optional. When set, the whole app asks for this password once (cookie, 30 days) |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm test` | 37 unit tests: parser, fidelity, failure fixtures |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | idempotent import of the committed fixture; also backfills the fidelity report on an older import |
| `npm run verify:copy` | end-to-end check that a copy is independent of its original (edits the copy, asserts the original is untouched, deletes the copy) |
| `npm run fixtures` | regenerates `fixtures/cases/*` from the real export |

## Layout

```
src/lib/import/spectora.ts   parser: bytes -> ParsedTemplate (deterministic, column-driven, no LLM)
src/lib/import/types.ts      parsed shapes and ImportRejectedError
src/lib/fidelity.ts          snapshot + compare (pure functions)
src/lib/db/import.ts         persist a parsed template, record rejected imports, rollback on failure
src/lib/db/templates.ts      reads (list, tree, runs, issues)
src/lib/db/mutations.ts      rename, update comment, copy, delete, re-check fidelity
src/lib/db/tree-insert.ts    batched insert shared by import and copy
src/lib/render.ts            sanitised HTML for display
src/app/api/import/route.ts  POST multipart -> 201 / 422 (rejected, with details) / 400 / 500
src/app/templates/[id]/      template page and server actions
src/proxy.ts                 optional demo password gate
supabase/schema.sql          the whole schema; apply once
fixtures/                    the real export and the derived failure cases
scripts/                     seed, verify-copy, make-fixtures, inspect-export
```

## API

`POST /api/import` with `multipart/form-data`: `file` (required), `name` (optional).

- `201` `{ templateId, importRunId, stats, issuesCount }`
- `422` `{ error, details: { expected?, found? } | null }` when the file cannot be imported faithfully
- `400` `{ error }` no file, empty file, or over 15 MB
- `500` `{ error }` a write failed; the partial template is deleted before responding
