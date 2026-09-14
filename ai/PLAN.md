# Plan (as written before building)

This is the working plan, kept as it was. Where the build diverged from it, NOTES.md is the record.

**Deadline:** 21 Sep 2026 (Mon). Today: 14 Sep (Mon). Target submit: Sun 20 Sep, one-day buffer.
**Stated effort:** "Two focused days, hackathon style." Spread across weeknight evenings + weekend.

---

## 1. What they are actually testing

Read past the feature list. The rubric, in their own words:

| They say | They mean |
|---|---|
| "Preserving that work matters more than originality" | Faithful import beats clever import. Zero silent loss. |
| "Make skipped or unsupported content visible; do not quietly drop or rewrite it" | Every row/cell either lands in the model or lands in an issues list. Nothing vanishes. |
| "Distinguish information missing from the export from information your importer does not support" | Two different flags: `missing_in_source` vs `unsupported_by_importer`. |
| "We may try another export in the same HTML-text format" | Parser must be column-name driven, not position driven. Generalise. |
| "Show how you checked preservation" | They want evidence, not claims. A verification mechanism. |
| "If you use a model... show what happens when it returns malformed output" | Strong hint: a deterministic importer is the safer, more defensible choice. |
| "Leave further features out deliberately and document why" | Scope discipline is graded. Cuts with reasons score; cuts without reasons don't. |
| "Be ready to explain and adapt the code you submitted" | Live follow-up. Must actually understand every file. |
| "We are interested in how you work" | Commit the AI prompts/specs. Meaningful git history. |


---

## 2. Decisions

### 2.1 No LLM in the import path
The Spectora HTML-text export is a structured spreadsheet with explicit columns (Section Name, Item Name, Comment Name, Comment Text, Comment Type, Category, Order w/i item, + ~12 more). Hierarchy is explicit. An LLM adds hallucination risk and removes nothing. Deterministic parser = faithful = the customer's four years intact. State this decision in the video as a judgment call, and note that the same validation discipline applies either way.

Optional, only if time: an LLM-generated plain-English import summary as a *non-authoritative* layer, with malformed-output handling shown. Default: skip. Say why.

### 2.2 Stack (fastest for Viraj, Vercel-native)
- **Next.js (App Router) + TypeScript** — one deployable, Vercel-native
- **Supabase Postgres** — encouraged by them, known to Viraj; supabase-js server client
- **Tailwind + shadcn/ui** — fast, clean, no design time
- **SheetJS (`xlsx`)** — parse .xlsx server-side in a route handler
- **DOMPurify / sanitize-html** — render comment HTML safely
- Auth: none, or a single shared password gate via middleware if we want to look tidy. Include instructions either way.

### 2.3 Data model (Supabase / Postgres)
```
templates        id, name, source_platform ('spectora'), source_file_name, source_file_hash,
                 parent_template_id (null | uuid)  -- lineage for copies
                 created_at, updated_at
sections         id, template_id, name, position
items            id, section_id, name, position
comments         id, item_id, name, body_html, body_text, comment_type, category,
                 recommendation, position,
                 extra jsonb   -- EVERY other Spectora column, verbatim, keyed by header
import_runs      id, template_id, file_name, file_hash, rows_total, sections_count,
                 items_count, comments_count, issues_count, columns_seen text[], created_at
import_issues    id, import_run_id, template_id, severity ('skipped'|'unsupported'|'warning'|'info'),
                 kind ('missing_in_source'|'unsupported_by_importer'|'malformed'|'orphan'|'duplicate'),
                 row_number, location, message, raw_value
```
- `extra jsonb` is the "do not quietly drop" answer: unsupported columns are still stored, and flagged.
- Copy = one transaction: clone template → sections → items → comments with fresh ids, set `parent_template_id`. Independence is structural.
- Ordering: `position` from spreadsheet row order (and "Order (w/i item)" where present). Preserve exactly; never sort alphabetically.

### 2.4 The improvement: Import Fidelity Report ("make the import easier to trust")
After import, re-serialise DB → the same 4-column shape (section / item / comment name / comment text) and diff against the parsed source:
- counts: sections, items, comments (source vs stored)
- per-cell text equality (exact + whitespace-normalised)
- ordering check (sequence preserved)
- HTML preserved check (tags in source == tags in stored body_html)
- issues list with severity and row numbers
Render as a panel: green / amber / red, drill-down to each mismatch. This is the DQ-engine answer-key discipline applied to migration, and it directly answers "show how you checked preservation." Video line: *the inspector's fear is silent loss; this proves nothing was lost.*

### 2.5 Failure cases (build, then demo at least one)
1. Plain-text export uploaded instead of HTML-text → detect (no HTML in any comment cell AND/OR column signature) → reject with a clear message and what to do instead.
2. Missing required column (e.g. no "Section Name") → reject, list expected vs found headers.
3. Empty file / header-only → reject.
4. Comment row with no section/item → attach to `Unsectioned` bucket + `orphan` issue. Nothing dropped.
5. Malformed HTML in a comment → sanitise, store original in `extra.raw_html`, flag `malformed`.
6. Duplicate section names → preserve both (position-distinct), flag `duplicate` as info.
7. Second, different template in same format → must import cleanly. Test with a second Spectora template if the trial allows, else a hand-modified copy.

### 2.6 Deliberate cuts (document in NOTES.md with reasons)
- Rich-text WYSIWYG for comment HTML → edit as text with HTML preview instead (time; fidelity risk of a WYSIWYG mangling markup)
- Editing of answer types / multiple-choice / defaults → stored + displayed read-only
- Default photos → references stored, images not fetched
- Drag-and-drop reorder → not needed for baseline; ordering preserved from import
- Multi-user auth / tenancy → single-tenant demo
- Export back to Spectora format → partially exists as the fidelity re-serialiser; not exposed as a feature

### 2.7 Repo hygiene
- `README.md`: setup, `supabase/schema.sql` init, `.env.example`, run, deploy
- `NOTES.md`: cuts + why, supported input + limitations, how checked, time spent, credits
- `fixtures/` : the committed Spectora export (+ second test file), with source noted
- `ai/` : CLAUDE.md / prompts / build specs used — "how you work"
- Meaningful commit history: commit per milestone, not one dump
- No credentials. Ever.

---

## 3. Timeline

| Day | Work | Hours |
|---|---|---|
| **Mon 14** (tonight) | Sign up Spectora, Hive, Binsr. Export InterNACHI Residential (HTML Text). Run one Hive inspection + publish + try Hive's own import. Note observations. Create GitHub repo, Vercel project, Supabase project. Commit fixture. | 2–3 |
| **Tue 15** | Schema SQL. Parser (column-driven) + issues. Import route. Unit tests on fixture. | 2 |
| **Wed 16** | Template list + tree view (sections → items → comments, HTML rendered safely). Import UI with issues panel. | 2 |
| **Thu 17** | Edit + save (section/item/comment). Copy with independence. | 2 |
| **Fri 18** | Fidelity report. Failure cases. Seed script. Deploy to Vercel. | 2–3 |
| **Sat 19** | Second-template test. Polish. README, NOTES.md. Video script. | 4 |
| **Sun 20** | Record video (8–10 min). Final review. Submit. | 3 |

~18 hours. Their "two focused days" estimate is honest.

---

## 4. Video outline (their 7 points, timed)
2. **What you built** (2:30) — import the fixture live; edit a comment, save, reload, still there; copy, edit the copy, show original unchanged.
3. **Repo** (1:00) — layout, stack, starters credited, how Claude Code was used (show `ai/`).
4. **Data model** (1:30) — schema, import mapping, `extra jsonb`, the fidelity report as proof.
5. **Decisions** (1:30) — no LLM in import path and why; the improvement and the customer problem; cuts; Binsr vs Hive.
6. **Hard part + failure** (1:30) — hardest import problem (likely rich HTML / ordering / orphans); demo one failure case.
7. **Hive feedback** (0:45) — 2–3 direct, specific things from actually using it.

---
