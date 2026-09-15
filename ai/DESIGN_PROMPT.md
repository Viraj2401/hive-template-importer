# Design brief given to the design tool (Claude Design), 15 Sep 2026


Design the web UI for a small tool called Template Importer. It imports a home inspector's report template from Spectora (a spreadsheet export) into a new inspection platform, shows exactly what came through, lets the inspector fix names and comment text, copy the template, and proves that nothing was lost. The working app exists and is functional; the job here is to make it read clearly to a non-technical home inspector, not to add features.

**Who uses it.** A solo home inspector, 35 to 60, on a laptop, not a developer. They spent years writing the comments in this template and are afraid the import silently changed or dropped something. Their first question on every screen is "did my stuff survive, and where do I look if it did not".

**The data.** A template has Sections (Roof, Exterior, Plumbing), each with Items (Coverings, Flashings), each with Comments. A comment has a name, a body that may contain formatting (paragraphs, bold, links), a type (Information, Limitation, Defect), a severity for defects (Low, Medium, High), and a recommendation. The real template is 13 sections, 69 items, 392 comments, 198 with formatting. Each comment also carries up to 35 extra fields from the spreadsheet that we keep but do not edit.

**Screens to design, as separate artboards, desktop first (1440 wide) with a note on how each collapses to a phone.**

1. **Templates list.** Cards or rows for each template: name, counts, whether it is an import or a copy of another template, when it was imported. Below, a short list of rejected imports with the reason each was rejected. One primary action: Import.

2. **Import.** Choose a file, optional name, submit. Three result states on the same artboard: success (go to the template), rejected (a plain reason, and where relevant the columns expected versus the columns found), and failed.

3. **Template page, default state.** This is the main screen. It must show: the template name (editable), the import source, counts, actions (make a copy, delete); the tree of sections, items and comments, with items collapsed by default; per comment the type, severity, recommendation and the formatted body, an edit control, and a drawer for the extra kept fields; and the Import Fidelity panel with a green badge, source versus stored counts for sections, items, comments and formatted comments, "text identical" count, order preserved, and a button to re-check. Also an Import Notes panel that groups deviations: skipped, warnings, preserved but not editable here, notes. Decide the hierarchy: what a worried inspector sees first.

4. **Template page after an edit.** Same screen after the inspector renamed a section and changed one comment, and pressed re-check. The fidelity badge is red, and a differences list shows two entries with a path like "Exterior > Exterior Doors > Loose Hinge", the source text, and the stored text. Make it obvious that red here means "you changed this", not "something broke".

5. **Comment edit state.** Inline: name field, body field, save and cancel. The body is edited as source text with light formatting marks visible, not a rich editor. Explain in a one-line hint that formatting from the export is kept exactly.

**Constraints.** Components must be implementable with Tailwind and shadcn/ui in an afternoon: cards, badges, buttons, collapsibles, inputs, textarea. No rich text editor. No drag and drop. Light theme, calm palette, one accent colour, red and amber only for the fidelity states. Plain words everywhere: no "source_platform", no "extra", no codes like "info" or "0". Every editable thing must look editable without hovering.

**Known weaknesses of the current version to fix.** The tree of 392 comments is a wall of cards with equal weight; the fidelity panel is on the right where an eye lands last; edit affordances are small; the extra-fields drawer shows raw spreadsheet column names.

**Output.** The five artboards, a short annotation next to each explaining the choice, and a list of the components used so it can be built directly.

