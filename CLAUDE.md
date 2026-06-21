# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Logbook is an Obsidian plugin (`plugin/`) that replaces folder hierarchies with a chat-style feed of typed notes, living inside an Obsidian vault. The plugin holds no state of its own — every note is a `.md` file with YAML frontmatter, and the feed is just a view onto the vault.

`design.md` at the repo root is the full spec — UI behavior, data model, and the rationale behind it, organized by numbered section (§1–§15). `plan.md` tracks implementation status against the spec, phase by phase, and calls out exact bugs found and fixed along the way. **Read `design.md` before implementing any feature** — most behaviors here have subtle, deliberate edge cases (e.g. sort-key freezing while a card is expanded, the recurring-meeting mtime-vs-occurrence-date tie-break) that are easy to silently regress without it.

## Commands

All commands run from `plugin/`:

```bash
npm install        # install deps (not committed; node_modules is gitignored)
npm run dev         # esbuild watch mode, emits main.js to plugin/ (or $VAULT_PATH/.obsidian/plugins/logbook if set)
npm run build        # tsc -noEmit -skipLibCheck (type-check only) + production esbuild bundle
```

There is no test suite and no linter configured. `plan.md` records that every change is verified with `tsc -noEmit -skipLibCheck` followed by a production `esbuild` build — treat that pair as the correctness gate for any change.

To test live in Obsidian, set `VAULT_PATH` to a vault's root before running `npm run dev`/`npm run build`, so the bundle is written straight to that vault's `.obsidian/plugins/logbook/`.

## Architecture

Entry point is `plugin/src/main.ts` — a standard Obsidian `Plugin` that registers one `ItemView` (`LogbookView`, view type `logbook-feed`), a ribbon icon, a global `Mod+Enter` command for saving/closing whatever card is expanded, and a settings tab.

Layers, bottom-up:

- **`types.ts`** — `NoteType` union (draft/task/meeting/thoughts/knowledge/design), their frontmatter shapes, the `NOTE_TYPES` config table (label/color/filterable attribute per type), and `activityTimestamp(note)` — the sort-key function with the recurring-meeting/mtime tie-break described in design.md §3.
- **`note-store.ts`** (`NoteStore`) — owns all vault/metadata-cache I/O for the configured logbook folder: loading notes, creating them, frontmatter writes. Two things matter here architecturally:
  - **Per-file write queue.** `processFrontMatter` has documented Obsidian bugs around concurrent/rapid calls on the same file dropping writes; `updateFrontmatter()` serializes writes per path through a `Map<path, Promise>` chain rather than firing them independently.
  - **Refresh suppression.** After a write, vault events fire immediately and would otherwise tear down an open card mid-edit; the store tracks a per-path suppression window (600ms) and exposes `isAnySuppressed()` / `onSettled()` so the view can skip/re-trigger refreshes around it.
- **`filters.ts`** — `FilterState` (query + projects + teams + type + type-attribute) and `applyFilters`/`matchesQuery`/`highlight`, all pure functions over `LogNote[]`.
- **`utils.ts`** — slugs, IDs, day-grouping/relative-time formatting, fuzzy matching for the command dropdown.
- **`view/LogbookView.ts`** — the `ItemView` itself; owns the feed/dock DOM, in-memory note list, filter state, and the single source of truth for which card (if any) is expanded. Builds a `CardContext` object each render and passes it down to `feed.ts`/`card.ts` — this is the seam between "view state" and "card rendering," so most cross-card behavior (closing the previous card when expanding/creating another, freezing sort position while expanded, save-on-close) is wired through `CardContext` callbacks rather than living inside individual cards.
- **`view/feed.ts`** — renders the day-grouped, incrementally-diffed card list (`CardCache`, keyed by file path) plus the history-loading sentinel and empty states.
- **`view/card.ts`** — collapsed/expanded card rendering and the save-on-close edit-staging logic (nothing hits disk until the card actually closes).
- **`view/dock.ts`** — the command bar: search mode vs. `/`-command mode, creation/filter commands, filter chips.
- **`view/pickers.ts`** — the reusable autocomplete/multi-value input used for projects, teams, and tech stack.

### Things that are easy to get wrong (see design.md for the full rationale)

- **Sort key freezing**: an expanded card's position in the feed must not change because of a frontmatter edit the user just made to it (e.g. clicking a status pill) — `LogbookView.sortKey()`/`frozenTimestamp` exist specifically for this.
- **Save-on-close, not autosave**: field edits inside an expanded card only mutate in-memory state until the card closes (`⌘↵`, click-away, or switching cards), at which point one batched `processFrontMatter` call (+ a rename if the title changed) fires. `Esc` discards by re-reading disk truth, not by undoing in-memory state.
- **`file.stat.mtime` is the only "last activity" signal** — there is no plugin-managed `updatedAt`. Recurring meetings sort by their latest occurrence date instead, *unless* that occurrence is today (a bare date has no time-of-day and would otherwise sort before every other note touched today) — see `activityTimestamp()` in `types.ts`.
- **Tags are entirely Obsidian's own feature.** The plugin never reads, writes, or filters on the `tags` frontmatter property or inline `#tags` — don't add tag handling here.
- **Trash, never hard-delete.** Draft auto-expiry and the manual delete button both go through `app.vault.trash()`.
