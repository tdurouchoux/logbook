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

Everything in the original plan is implemented, type-checked, built, and confirmed in a live vault.
