# How I worked

The assignment asked to show how I work with AI tools, so this is that, plainly.

## Setup

- Claude Code inside VS Code, one long session, this repo as the working directory.
- Supabase project created up front so every step ran against the real database, not a mock.
- The real Spectora export committed as a fixture first. Everything was built against it, not against an imagined shape.

## The split

**I decided:**

- No LLM in the import path. This was the first decision and it shaped the rest.
- The 4-column shape as the promise, and "nothing dropped, everything reported" as the rule.
- Missing-in-source and unsupported-by-importer as separate categories.
- The fidelity report as the one improvement, over a WYSIWYG editor or drag reordering.
- Every cut in NOTES.md.

**Claude wrote:**

- The parser, database layer, UI, tests and fixtures, from those decisions.
- The first draft of NOTES.md and README.md, which I edited.

**Both:**

- Reviewing the export file's real structure (42 columns, 393 rows, mixed plain and HTML bodies, padded names, entity-escaped names). The plan changed after this; I had assumed a cleaner file.
- Choosing the failure fixtures. The list came from asking "what would a customer actually hand us" rather than from the parser's code paths.

## Design pass

On day two I wrote a brief for a design tool (the prompt is in this folder as `DESIGN_PROMPT.md`), attached screenshots of the working app and of Hive's own template editor, and asked for five artboards aimed at a non-technical inspector. I implemented the hierarchy change, the one-section-at-a-time tree, the wording and the kept-fields drawer, and skipped the font, tokens, undo and phone layouts. The design's example of a red state, two edits after import, is now exactly what the app shows when you rename a section and edit a comment.

## Discipline

- Every feature was checked by running it, not by reading it: unit tests, then the seed script against Supabase, then curl against the upload route, then the page in a browser.
- Two things the first version got wrong that testing caught: SheetJS silently reading arbitrary bytes as a one-column CSV (now sniffed before parsing), and a missing Comment Text column being accepted (now required).
- Secrets never entered the chat or the repo. `.env.local` is gitignored; `.env.example` is tracked with blanks.

## Prompts

The working prompts were conversational, not templated. The shape of the important ones:

- "Analyse the assignment and let's assess what it is about, then strategise how we complete it." Produced [PLAN.md](PLAN.md).
- "Step by step guide me what to do." Produced the ordered build list.
- Paste of the export's structure dump, then "what does this mean for the data model".
- "The parser must not drop anything. Anything unmapped goes to extra and gets an issue."
- "Prove the import is faithful, not just count it." Produced the fidelity report design.
- "Generate failure fixtures from the real file, not invented ones."
