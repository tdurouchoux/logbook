# Logbook — implementation plan

Tracks the gap between `design.md` and the plugin implementation (`plugin/`). All phases below are complete and verified (`tsc -noEmit` + `esbuild` after every change).

## Status: done

- **Phase 0 — File layout.** Split the original single-file prototype into `main.ts`, `settings.ts`, `types.ts`, `note-store.ts`, `filters.ts`, `utils.ts`, and `view/{LogbookView,feed,card,pickers,dock}.ts`.
- **Phase 1 — Data layer.** Stable per-note `id`; frontmatter reads centralized through the metadata cache; per-file `processFrontMatter` write queue; 600ms refresh-suppression window with a settle-resync callback; `LogNote` discriminated union covering all type-specific fields.
- **Phase 2 — Note types.** All six types (Draft, Task, Meeting, Thoughts, Knowledge, Design) implemented with their type-specific fields, including filterable attributes (status, theme, techStack).
- **Phase 3/4 — Card UI.** Collapsed and expanded card views: status pills, project/team pickers, editable title (via `renameFile`), type-specific fields, `⌘↵`/`Esc` handling, debounced autosave through the write queue.
- **Phase 5 — Feed behavior.** Day-group labels (Today/Yesterday/weekday/date), one-month initial window with scroll-triggered pagination, full-vault search when filters are active, dual empty states, scroll-to-new-note on creation.
- **Phase 6/7 — Command bar.** Full `/` command set: creation commands (including `/done`, `/recurring`, `/thoughts`), filter commands (`/project`, `/team`, `/type` with two-step sub-attribute picking, `/occurrence`, `/clear`), filter chips with priority-ordered `Backspace` removal, fuzzy matching throughout.
- **Phase 8 — Filtering engine.** AND-combined filter state (free text, projects, teams, type, type-attribute) with `<mark>` highlighting on matches.
- **Phase 9 — Meeting specifics.** Recurring meetings (`## <date>` headings mirrored in `occurrences[]`), template notes (`type: template`, discovered via frontmatter scan, excluded from the feed), template scaffolding applied on standalone creation and on new occurrences.
- **Phase 10 — Lifecycle.** Draft auto-delete after 7 days (via trash, never hard delete); collapse-mode toggle; settings tab.
- **Phase 11 — Polish pass.** Keyboard shortcuts audited against the design doc; live refresh suppression verified; anti-feature checklist (§13) confirmed clean.
- **Phase 12 — Design revision (2026-06-20).** `design.md` was revised on four points; all implemented and verified, including live-vault QA:
  1. Expanded cards no longer render the full body — only the same plain-text preview shown collapsed. Full content is read/edited exclusively in Obsidian's own editor.
  2. Dropped the plugin-managed `updatedAt` field; the feed's sort key and time pills now read `file.stat.mtime` directly, so out-of-plugin body edits reorder the feed too.
  3. Removed the plugin's entire tag system (picker, chips, filter axis, click-to-filter). Tags are Obsidian's native feature now — the plugin doesn't touch them.
  4. Removed "New task from this note" (and `sourceNoteId`) entirely, no replacement.
- **Phase 13 — Stable position while expanded (2026-06-20).** Frontmatter-only edits (status pill, project/team changes) bump `file.stat.mtime` exactly like body edits, which was reordering the feed out from under an open card. Fixed in `LogbookView.ts`: the expanded card's sort key is frozen at the timestamp it had when expanded, and only resumes tracking live `mtime` once it collapses.

Everything in the original plan is implemented, type-checked, built, and confirmed in a live vault.

## Status: in progress

- **Phase 14 — Card layout redesign (2026-06-20).** `design.md` §4, §5.2, §5.3, §5.5, §7, §8, §9, §14, §15 revised: collapsed cards now show the filterable-property pill and project/team pills (briefcase/people icons) in the top row, with the title moved to the middle and the 2-line body preview at the bottom; expanded cards keep only the badge top-left and move every other pill/field into the field block. Meeting's filterable attribute changes from `theme` to `subtype`; knowledge's `techStack` is no longer filterable. Steps to implement:
  1. `types.ts` — change `NOTE_TYPES.meeting.filterAttr` from `{ key: "theme", label: "Theme" }` to `{ key: "subtype", label: "Subtype" }`; remove `NOTE_TYPES.knowledge.filterAttr` entirely.
  2. `LogbookView.ts` — update `typeAttrValues()` for `meeting` to read `subtype` values (`standalone`/`recurring`) instead of `theme`, and drop the `knowledge`/`techStack` branch.
  3. `card.ts` — rebuild the collapsed-card top row to render, left to right: type badge, filterable-property pill (if the type has one), a pill per project (briefcase icon via `setIcon()`), a pill per team (people icon via `setIcon()`); each pill's click applies a filter and stops propagation so it doesn't also expand the card.
  4. `card.ts` — rebuild the expanded-card layout: top-left badge only; field block under the title renders the filterable-property pill + project/team pills (still filter-on-click, with `×`/add affordances for project/team), followed by remaining type-specific fields (`theme`, `attendees`, `question`, `landed`, `techStack`) as plain inputs with no pill/filter treatment.
  5. `card.ts` — task/design's `status` pill: filter-on-click when collapsed, cycle-and-save-on-click when expanded (no filter while expanded). Meeting's `subtype` pill: filter-on-click in both states, never editable.
  6. `card.ts` / CSS — add briefcase and people icons to project/team pills via Obsidian's `setIcon()`, matching the existing collapse-mode action's icon mechanism; verify pill layout doesn't overflow the card header on narrow panes.
  7. Manual QA in a live vault: collapsed click-to-filter on every pill type; expanded status cycle vs. subtype filter-only; project/team filter-and-edit on the same pill; knowledge card shows no filterable pill for `techStack`.
  8. `tsc -noEmit -skipLibCheck` + `node esbuild.config.mjs production`, then commit and push.
