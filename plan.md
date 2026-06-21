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

## Status: planned — Phase 24 (Save button, change type, pinned)

Three additions specced in `design.md` (§2, §3, §4, §12, §14, §15) but not yet implemented. Todo list, roughly in dependency order:

### Save button (design.md §4, §12)

- [ ] In `card.ts`, add an explicit **Save** button to `expandFooter`, alongside the existing `deleteBtn` — clicking it calls the same `closeAndSave()` already defined in `renderCard()`. No new logic needed beyond wiring the click handler; this is the cheapest of the three.
- [ ] Style it in `styles.css` (new `.logbook-save-btn` rule near the existing `.logbook-delete-btn` block at line ~764) as the footer's primary/accent action, positioned left of the delete button.
- [ ] Update the footer layout so hint text stays left and Change type / Save / Delete sit right, with Delete remaining the literal last/rightmost element (per design.md's existing guarantee).

### Change type (design.md §4 "Changing a note's type", §15)

- [ ] `types.ts`: add a pure function (e.g. `convertType(fm: NoteFrontmatter, toType: NoteType): NoteFrontmatter`) that, given current frontmatter and a target type, returns a new frontmatter object per the conversion rules in design.md: keep common fields (`id`, `title`, `projects`, `teams`, `createdAt`, `pinned`), drop every field specific to the old type, and fill in the new type's defaults (mirror `note-store.ts`'s `createNote()` defaults: `status: todo`/`exploring`, `subtype: standalone` + `attendees: []` for meeting, `techStack: []` for knowledge, nothing extra for thoughts/draft).
- [ ] `card.ts`: add a **Change type** button to `expandFooter`. Clicking it opens a small dropdown (reuse styling from the command bar's dropdown / `/type` list in `dock.ts`) listing the other five types with their badge color dot. Picking one:
  - Calls `convertType` and reassigns `note.fm` to the result (not a key-by-key mutation, since the shape itself changes).
  - Marks a new `typeDirty` flag (parallel to the existing `titleDirty`/`templateDirty`) rather than adding to the `dirty` key set, since the commit path differs (see below).
  - Re-renders the card's type-dependent UI in place without a full collapse/expand cycle: badge color/label, the filterable-property pill (or its absence), and `typeFieldsEl`'s contents (`renderTypeFields`). Likely cleanest as a small `rerenderTypeUI()` closure inside `renderCard()` that both the initial render and the change-type handler call.
- [ ] `note-store.ts`: add `changeType(file: TFile, newFm: NoteFrontmatter): Promise<void>` that, unlike `updateFrontmatter`'s key-by-key mutator, deletes every key not present in `newFm`'s shape and then assigns `newFm`'s fields — still routed through the same per-file write queue (`updateFrontmatter`'s queuing logic) so it doesn't race other writes to the same file. This is the "replace, not merge" special case called out in design.md §15.
- [ ] `card.ts`'s `commit()`: when `typeDirty`, call `store.changeType(note.file, note.fm)` instead of (or in addition to) the normal batched `updateFrontmatter` call for `dirty` keys.
- [ ] `Esc`/discard path (`ctx.discardEdits`) already reloads from disk and rebuilds the card from scratch — confirm this naturally undoes a staged-but-uncommitted type change with no extra work (it should, since nothing was written).
- [ ] Dropdown dismissal: click-away or `Esc` closes it without changing anything (only an actual selection stages a change).

### Pinned (design.md §2, §3 "Pinned section", §4)

- [ ] `types.ts`: add `pinned?: boolean` to `CommonFrontmatter`. Update `normalizeFrontmatter()` in `note-store.ts` to read it (`typeof raw.pinned === "boolean" ? raw.pinned : undefined`, or simply `!!raw.pinned` collapsed to `undefined` when falsy to match the omit-when-absent convention).
- [ ] `card.ts`: add the pin glyph to the top-right corner, alongside the existing `chevron`/`top.createEl("span", { cls: "logbook-time" ... })` nodes — a `setIcon()`-based element (e.g. `pin` Lucide icon), only appended/visible when `note.fm.pinned` is true. Wire a click handler that's a no-op while collapsed and toggles `note.fm.pinned` (staged, `dirty.add("pinned")`) while expanded, matching the existing `renderFilterAttrPill` pattern of one relocated/repurposed DOM node read against `card.hasClass("is-expanded")` at click time.
- [ ] `LogbookView.ts`: split `windowedNotes()` into two groups — pinned notes (bypass the month-window cutoff entirely, but still go through `applyFilters` when filters are active) and the rest (existing windowing logic unchanged). Pass both to `renderFeed`.
- [ ] `feed.ts`: extend `FeedRenderOptions` with a `pinnedNotes: LogNote[]` field (or similar). After the existing day-grouped loop, if `pinnedNotes.length`, append a single "Pinned" divider (reuse `buildDivider`, maybe a variant class) followed by one flat list of resolved cards (`resolveCard`) sorted by `activityOf` ascending — no day sub-grouping.
- [ ] Stable-section-while-expanded: extend the existing frozen-timestamp mechanism in `LogbookView.ts` (`frozenTimestamp`/`sortKey()`) with a frozen "is this note in the pinned section" flag captured at expand time, so a mid-edit pin toggle doesn't move the card between sections until it collapses — mirrors how `frozenTimestamp` already freezes sort position/day-group.
- [ ] `card.ts` commit: include `pinned` in the normal `dirty` key set — no special-case write needed (unlike type change), since it's just one more frontmatter key.
- [ ] `styles.css`: pin glyph styling (filled vs. outline state, sizing to match the existing `.logbook-chevron`/`.logbook-time` corner cluster), and the "Pinned" divider variant if it should look distinct from date dividers.

### Verification

- [ ] `tsc -noEmit -skipLibCheck` and `node esbuild.config.mjs production` from `plugin/` after each chunk, per this file's existing convention.
- [ ] Manual QA once in a live vault (already outstanding from earlier phases, see above): Save button under various focus states, change-type round-trips between all six types (check dropped/defaulted fields match design.md's table), pin toggle staging + section transition only on collapse, pinned section surviving filters and the history-window cutoff.
