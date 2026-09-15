# NOTES

Written for whoever reviews this take-home. Short on purpose. The code and tests are the long version.

## What I built

An importer for Spectora's "Export HTML Text" template file, backed by Supabase Postgres, with:

1. a deterministic parser that keeps every section, item and comment in order and drops nothing,
2. an import fidelity report that re-reads what was stored and compares it to what was parsed, cell by cell,
3. import notes that say what was missing in the source versus what this importer does not support,
4. inline editing, deep copy, delete,
5. explicit rejection of files that cannot be imported faithfully, with the reason recorded.

The seeded template is InterNACHI Residential: 13 sections, 69 items, 392 comments, 198 of them with HTML bodies. The fidelity check at import is green: 392 of 392 comment texts identical, 198 of 198 HTML bodies preserved, order intact.

## Decisions

**No LLM anywhere in the import path.** The customer's fear is that the import will quietly change their words. A model would make that fear rational. The parser is column-driven and the same file always produces the same result. Where an LLM would help (guessing a mapping for an export from a platform we have never seen) it should propose a mapping for a human to confirm, and then the deterministic path runs. That is a follow-up, not part of this.

**Column-driven, not position-driven.** Headers are matched by a normalised prefix ("Comment Type (info, limit, defect)" becomes "comment type"). So a re-ordered export, extra columns, or the same shape saved as `.xlsx` or `.csv` all import. Fixture 08 is a different template in `.csv` and imports fully.

**Nothing is dropped, and every deviation is written down.** Spectora exports 42 columns. Four are the template's substance (section, item, comment name, comment text) and three more are useful metadata (type, category, recommendation). The remaining 35 are kept verbatim on each row in a JSON `extra` column, and each such column is reported once as `unsupported_by_importer`. A column that exists but is empty in this export (for example "Default Photo 3") is reported as `missing_in_source`. Those two statements mean different things to the customer and the UI keeps them apart.

**HTML is stored exactly as exported.** No reformatting, no pretty-printing. A derived plain-text version is stored next to it for search and for the plain-text comparison. HTML is sanitised only at render time with a small allowlist, so the stored value stays byte for byte what Spectora produced.

**Names are decoded, raw kept.** Spectora exports `&amp;` in names. The display name is decoded and trimmed; the raw value is kept in `extra.raw_name` and the change is reported once per unique raw value. That is the one place the importer changes what it shows you, and it tells you.

**Orphans and duplicates stay.** Comment rows before any section go under "Unsectioned" / "Unnamed item". Sections that reappear later in the file are kept as separate positions and reported as duplicates. Merging would be a guess about intent.

**The fidelity report is the improvement I chose.** Counts alone say "392 in, 392 out". The report reduces both the parsed file and the stored rows to the same 4-column shape and compares them position by position. It is stored on the import run, and "Re-check against source" runs it again against the snapshot taken at import. After you edit, the result turns red and lists exactly which cells differ from the Spectora original. That is the feature I would want as an inspector before trusting a migration.

**Supabase through the server only.** Row-level security is on with no anonymous policies, and every read and write goes through server code with the service role key. The browser never talks to the database. There is no auth; the optional `DEMO_PASSWORD` gate exists only to stop strangers editing the public demo.

**Copy is a deep clone.** Every section, item and comment becomes a new row. `scripts/verify-copy.ts` edits the copy and asserts the original is unchanged and no row ids are shared.

## What I cut, and why

| Cut | Why |
| --- | --- |
| WYSIWYG comment editor | A rich editor rewrites HTML on save, which would defeat the promise that stored HTML stays as exported. The body is edited as source; the fidelity report shows what changed. |
| Drag-and-drop reordering, add or delete sections and items | Editing here is about correcting an import, not authoring a template. Positions are stored and ready for it. |
| Users, auth, multi-tenant | Out of scope for a take-home. Service role stays server-side. |
| Atomic multi-table transaction | supabase-js has no transactions. Inserts are dependency-ordered and a failure deletes the template (cascade), so nothing half-written survives. A Postgres function taking the whole tree as JSON would make it truly atomic and is the next step. |
| Pagination or lazy loading of the tree | The template page renders all 392 comments and their editors at once. It is about 3 MB of HTML on this template. Fine for a demo, not for a 3,000-comment template. |
| Re-import into an existing template, merge, versioning | Each import creates a new template. Combined with copy, that is enough to compare before and after. |
| Editing the 35 preserved-but-unmapped fields (photo captions, defaults, answer types) | They are stored and visible. Building an editor for each would have taken the time from the parts that matter. |
| Multi-sheet workbooks | Only the first sheet is read. Spectora exports one sheet. |
| Other platforms (HomeGauge, Spectora's other exports) | The parser is shaped so another platform is a second module with its own column map. Fixture 07 shows what happens today: a clear rejection listing what was found. |
| Realtime updates, optimistic UI | Server actions plus a router refresh were enough. |

## Supported input and limitations

- Spectora "Export HTML Text": `.xls` as exported. Also `.xlsx` and `.csv` with the same headers.
- Required columns: Section Name, Item Name, Comment Name, Comment Text. Comment Text is required even though many cells are empty (form fields), because a file with no such column would import as a skeleton with every narrative silently missing.
- Header matching is prefix-based and case-insensitive. Header text after an opening parenthesis is ignored.
- Grouping is by contiguous rows, the way Spectora writes the file. The "Order (w/i item)" column is checked for consistency and reported, but position in the file wins.
- Files over 15 MB are refused. UTF-16 text files are refused by the byte sniff (Spectora does not produce them).
- Comment bodies are edited as HTML source. A saved body that contains tags is stored as HTML; otherwise as plain text.
- Entity decoding is applied to names only. Comment HTML is stored untouched.

## Failure cases

All generated from the real export by `npm run fixtures`, all covered by tests, all tried through the real upload route.

| File | What happens |
| --- | --- |
| 01 plain-text export (the "Export Text" option) | Imported. Warning: no HTML found in any comment, so formatting is not in this file. |
| 02 Comment Text column missing | Rejected 422: missing required column, with the list of columns that were found. |
| 03 header only | Rejected 422: headers but no template rows. |
| 04 empty sheet | Rejected 422: the spreadsheet is empty. |
| 05 PNG bytes renamed `.xls` | Rejected 422 before SheetJS sees it. SheetJS would otherwise read arbitrary bytes as a one-column CSV and the error would be about columns. |
| 06 rows with no section or item | Imported. Kept under "Unsectioned" / "Unnamed item", each reported as an orphan with its row number. |
| 07 another platform's headers | Rejected 422 listing expected and found headers. |
| 08 a different, small template as `.csv` and `.xlsx` | Imported fully. The stray "Custom Field" column is kept in `extra` and reported. |

Every rejection is also written to `import_runs` with `status = rejected` and shown on the home page.

## How I checked

- `npm test`: 37 tests. Parser behaviour on the real file (counts, order, entities, HTML verbatim, extra fields, missing vs unsupported), 7 fidelity scenarios (exact, whitespace-only, changed text, dropped comment, flattened HTML, renamed section, extra section), the 8 fixtures above.
- `npm run verify:copy` against the live database: PASS.
- Every fixture posted to `/api/import` on a running server; response codes and reasons matched the table above. Also a 16 MB file (400) and a POST with no file (400).
- `DEMO_PASSWORD` gate: redirect to `/unlock` when locked, 401 on the API, wrong password bounces with an error, right password sets a cookie and the app opens, `next` is restricted to same-site paths.
- `npm run typecheck` and `npm run build` clean.

## What I would do next with a customer in the loop

1. Sit with one inspector while they import their real template and watch which import notes they actually read. I suspect the missing-vs-unsupported split matters more than I can prove alone.
2. The Postgres function for atomic import.
3. Lazy-load items per section; the page is too heavy for large templates.
4. A second platform module (HomeGauge) to confirm the parser boundary is in the right place.
5. LLM-assisted column mapping as a suggestion step for unknown platforms, never as the writer.

## Time spent

Approximate, across one long working day plus documentation and video.

| Part | Hours |
| --- | --- |
| Reading the assignment, the export file, and planning | 1.5 |
| Schema, parser, parser tests | 2.5 |
| Database layer, import route, seed, UI | 2.5 |
| Edit, copy, delete, copy-independence check | 1.0 |
| Fidelity report, fixtures, parser hardening, demo gate | 2.0 |
| Docs, deploy, video | 1.5 |

## Hive Inspect product feedback

From a trial account on 15 September 2026. I imported the same InterNACHI Residential export into Hive through Templates, Upload, Spectora, and then checked it field by field against what my importer holds for the same file.

**1. The import is faithful on content, and Hive should say so.** When I imported the export, Hive showed 13 sections, 69 subsections and 392 fields, the same counts my importer produced. Paragraph breaks, bold text and links survived in comment bodies, multiple-choice fields arrived with their options, medium severity became Recommendations and high became Safety Concerns, and the Spectora recommendation "monitor" arrived as the Service "Monitor". I expected some loss and found none. This is the thing inspectors fear most when switching, and it is done well.

**2. The import reports nothing.** When the import finished, I got a toast saying "Successfully imported" and nothing else: no counts, no list of what was mapped, changed or skipped. I expected a summary I could check against my Spectora template. Without it, the only way to trust the import is to open every subsection, which took me twenty minutes on a stock template and would take an afternoon on a real one. The fidelity report in this project is what I would want at that moment: source counts against stored counts, a green or red badge, and a list of the exact places anything differs.

**3. Order across comment types is regrouped, silently.** Hive groups fields in a subsection into Information, Limitations and Deficiencies bands. In the Spectora file the inspector's order within an item mixes types: Exterior, Exterior Doors is defect, info, defect, defect and so on. Hive keeps the order inside each band and drops the order across bands, and nothing tells the inspector. I expected either the original order or a note saying it was regrouped. Inspectors put their most used comments first on purpose. This is exactly the kind of change an import summary should list.

**4. "You have unsaved changes" on first open, with no changes made.** When I opened the imported template for the first time, the unsaved-changes banner was already showing before I touched anything. I expected a clean state. A new user does not know whether the import left something half done or whether the banner is noise, and the safe reaction is to stop trusting the screen.

**5. The upload dialog does not say which Spectora export to use.** It says "Excel files only (.xls, .xlsx)". Spectora offers two exports, "Export Text" and "Export HTML Text", and only the second keeps formatting. I expected one line telling the inspector which to pick. I did not test what Hive does with the plain-text file; my own importer accepts it and warns that no formatting was found, which is the behaviour I would want here too.

Smaller thing: the onboarding card asks "What software were you using before Hive?" and I answered Spectora. It thanked me and did nothing with the answer. A link to the importer at that moment would be cheap and useful.

## How I worked

I used Claude Code as a pair throughout. I made the calls on scope, data model and what to cut; it wrote most of the code and tests against those calls, and I read and ran everything before it went in. The [ai/](ai/) folder has the plan I worked from and a note on the workflow. The one thing I would not hand to a model is the import path itself, for the reason in Decisions.
