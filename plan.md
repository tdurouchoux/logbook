# Logbook — implementation plan

`design.md` is the spec; this file tracks implementation status against it. Everything below is implemented and verified (`tsc -noEmit -skipLibCheck` + `node esbuild.config.mjs production` after every change, run from `plugin/`).

## Status: done

**Foundational work (Phases 0–11):** file layout split into `main.ts` / `settings.ts` / `types.ts` / `note-store.ts` / `filters.ts` / `utils.ts` / `view/{LogbookView,feed,card,pickers,dock}.ts`; data layer (stable per-note IDs, metadata-cache-backed reads, per-file `processFrontMatter` write queue, 600ms refresh-suppression window); all six note types with their type-specific fields; collapsed/expanded card UI; feed behavior (day groups, scroll-triggered pagination, full-vault search under filters, empty states); full `/` command bar (creation + filter commands, fuzzy matching); AND-combined filter engine with `<mark>` match highlighting; recurring meetings (`## <date>` headings mirrored in `occurrences[]`) and meeting templates; draft auto-delete via trash; collapse-mode toggle; settings tab.

**Since then, `design.md` has been revised and re-implemented several times:**

- **Phase 12** — dropped inline body rendering on expand (preview-only; full content lives in Obsidian's editor), dropped the plugin-managed `updatedAt` field in favor of `file.stat.mtime`, removed the plugin's whole tag system (native Obsidian tags now), removed "new task from this note".
- **Phase 13** — froze an expanded card's sort key at its mtime-on-expand, so a frontmatter edit (status pill, project change) can't reorder the feed out from under an open card.
- **Phase 14** — card layout redesign: collapsed cards show the filterable-property pill + project/team pills in the top row with title/preview below; expanded cards relocate everything but the badge into the field block. Meeting's filterable attribute became `subtype`; knowledge's `techStack` is no longer filterable.
- **Phase 15** — expanding a card now also opens the note in Obsidian's editor automatically; dropped the separate "Open note" button and the inline body preview while expanded.
- **Phase 16** — filterable-property/project/team pills each get their own labeled line when expanded; project/team adding collapsed to a `+` button that reveals an autofocused input.
- **Phase 17** — incremental feed rendering: cards are cached by path + a data signature and only rebuilt when their own note actually changed; top-level DOM is reconciled in place instead of torn down every refresh.
- **Phase 18** — save-on-close: field edits stage in memory and flush as one batched write when a card closes (`⌘↵`, click-away, or switching cards); `Esc` discards staged edits. `⌘↵` added as a global `Mod+Enter` command since focus usually moves into Obsidian's editor on expand. Bug fix: cards that start out already-expanded (e.g. freshly created notes) need `CardContext.registerCloseHandler` too, or `Mod+Enter`/switching cards silently skipped them.
- **Phase 19** — `⌘↵`/`Esc` now also work via per-field `keydown` listeners (title, every plain input, every picker input), not just the global hotkey/bubbling — `pickers.ts` was unconditionally swallowing plain `Enter` regardless of modifiers, breaking the shortcut on picker-backed fields.
- **Phase 20** — relative-time pills no longer freeze on a reused/cached card; refreshed every render pass regardless of cache hit, since wall-clock time isn't part of the cache signature.
- **Phase 21** — fixed recurring meetings sorting to the top instead of the bottom of "Today": `activityTimestamp()` used the latest occurrence's bare date (local midnight) as the sort key, always earlier than same-day notes' real `mtime`. Now falls back to `mtime` when the latest occurrence is today; also fixed a latent UTC-vs-local date-parsing bug in the same function.
- **Phase 22** — creating a note now collapses/saves whatever card was previously open and opens the new note in Obsidian's editor, mirroring what `ctx.expand()` already does when switching between two existing cards (creation was bypassing it by setting `expandedPath` directly).
- **Phase 23** — added a soft-delete (trash) button to the expanded card's footer, bottom-right; two clicks required (arm, then confirm within 3s) before `app.vault.trash()` is called.

Manual QA in a live vault is still outstanding since this is a headless session — in particular: the full save-on-close flow (click-away / `⌘↵` / switching cards / `Esc`), keyboard shortcuts firing from inside both card fields and the opened note's editor, layout stability on expand, time-pill/sort-order correctness for recurring meetings, and the new delete button's confirm flow and follow-through.
