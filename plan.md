# Logbook — implementation plan

Tracks the gap between `design.md` and the current prototype (`plugin/src/main.ts`). Organized as phases, each phase roughly independent and shippable. Check items off as they land.

**Current state:** Phases 0–10 are complete — modular file layout, the full data layer (write queue, refresh suppression + settle resync, stable ids), all six note types with their type-specific fields including meeting template scaffolding, full collapsed/expanded card behavior with a unified pill design system, feed grouping/pagination/empty-states, the full command bar (creation + filter/utility commands), and the filtering/search engine. Remaining: one in-Obsidian manual QA item in Phase 11 (verifying markdown rendering breadth — tables/callouts/checkboxes/code blocks against the active theme) that genuinely can't be done outside a live Obsidian vault — everything else has been implemented and verified via `tsc -noEmit` + `esbuild` after every change.

**Design revision (2026-06-20):** `design.md` was revised on four points, now implemented in full as **Phase 12** (12.1–12.4; 12.5's live-vault QA item is still open):

1. Expanded cards no longer render the full note body (no `MarkdownRenderer`/`Component` lifecycle in the feed at all) — only the same short plain-text preview shown collapsed. Full content is read/edited exclusively by opening the note in Obsidian's own editor.
2. `updatedAt` is no longer a plugin-managed frontmatter field — the feed's sort key and each card's time pill now read `file.stat.mtime` directly, so body edits made outside the plugin (in Obsidian's native editor) reorder the feed too, not just plugin-driven frontmatter writes.
3. The plugin's own tag system (picker, chips, tag-click-to-filter, tag filter axis, tag search field) is removed entirely. Tags are Obsidian's native feature (frontmatter `tags`, inline `#tags`, the tag pane) — the plugin doesn't touch them.
4. The "New task from this note" button (and the `sourceNoteId` field it set) is removed entirely — no replacement, just gone.

Several items checked off in Phases 1, 3, 4, 5, 7, 8 below (tag chips/picker, body-render `Component` lifecycle, `updatedAt` bump logic, "New task from this note") implemented the *old* design and are annotated in place as superseded — **Phase 12** is the actual rework, now done.

---

## Phase 0 — File layout (de-monolith)

The entire prototype lives in one 700-line `main.ts`. Split it before piling on more features, so each phase below lands in an obvious place rather than growing the single file further.

- [x] `src/main.ts` — plugin entry point only: `onload`/`onunload`, settings load/save, view registration, ribbon icon/command
- [x] `src/settings.ts` — `LogbookSettings`, defaults, `LogbookSettingTab`
- [x] `src/types.ts` — `NoteTypeConfig`, `NOTE_TYPES`, per-type frontmatter interfaces/discriminated union, shared constants
- [x] `src/note-store.ts` — vault/metadata-cache access: loading notes, the per-file `processFrontMatter` write queue, refresh-suppression window, draft auto-delete, create/rename helpers
- [x] `src/view/LogbookView.ts` — the `ItemView` shell: layout, vault event wiring, scroll/refresh orchestration (delegates to the modules below rather than owning everything itself)
- [x] `src/view/feed.ts` — feed rendering, day grouping, history pagination/sentinel, empty states
- [x] `src/view/card.ts` — note card (collapsed + expanded), one render function per type-specific field block
- [x] `src/view/pickers.ts` — the reusable chip+autocomplete picker (tags/projects/teams currently duplicate this logic once team/tag pickers are added — factor it out once, not three times)
- [x] `src/view/dock.ts` — command bar: input/dropdown state machine, command parsing, filter-chip rendering
- [x] `src/filters.ts` — filter state model and the predicate that applies it to a note list
- [x] `src/utils.ts` — `groupByDay`, `sameDay`, `relativeTime`, slug generation, and other pure helpers
- [x] Build check: `esbuild.config.mjs` already globs nothing special — confirm it still bundles correctly once `main.ts` is broken into multiple modules (no config change expected, just verify)

## Phase 1 — Data layer foundations

- [x] Add `id` (stable, minted on creation) to frontmatter; never regenerate/overwrite on later saves
- [x] Fix `createNote` frontmatter to match §2 schema exactly — drop the stray `pinned` field, add `id`, keep `createdAt`/`updatedAt` only bumping `updatedAt` on real content changes *(superseded — §2 no longer has an `updatedAt` field at all; see Phase 12)*
- [x] Centralize frontmatter read access through `app.metadataCache.getFileCache()` only (no `cachedRead` parsing of frontmatter by hand for fields already in the cache)
- [x] Build a per-file `processFrontMatter` write queue (serialize calls per path) — required per §15's documented risk of concurrent calls dropping writes; route every frontmatter mutation (status cycle, picker edits, rename-triggered updates, occurrence prepend) through it
- [x] Generalize the current ad-hoc `skipRefreshUntil` hack into the documented 600ms refresh-suppression window after any `processFrontMatter` call (§15), scoped so it doesn't suppress unrelated file changes — plus a settle callback (`NoteStore.onSettled`) so the view resyncs from disk once the suppression window closes instead of going stale, since the one `modify` event a write fires gets swallowed during suppression
- [x] Note-loading: extend `LogNote` (or replace with a discriminated union per type) to carry every common + type-specific field from §2 and §5

## Phase 2 — Note types & type-specific fields

- [x] Task: `status: todo|done|suspended`; collapsed read-only pill; expanded click-to-cycle pill that saves immediately; struck-through dimmed title for `done`, extra dimming for `suspended`
- [x] Meeting: `subtype: standalone|recurring`, `theme`, `attendees[]`; recurring adds `occurrences[]` mirroring `##` body headings; optional `template` field on both subtypes (field exists and round-trips; scaffold-from-template behavior itself is tracked in Phase 9, not yet implemented)
- [x] Thoughts: `question` (shown above body collapsed + dedicated expanded field), `landed` (expanded-only "Where I landed" field)
- [x] Knowledge: `techStack[]` with `STACK` label on the card
- [x] Design: `status: exploring|in-review|decided`, filterable, same pill treatment as task status
- [x] Draft: confirm no extra fields; wire into auto-delete (Phase 10)
- [x] Type-specific filterable attributes wired into the filter system (status for task/design, theme for meeting, techStack for knowledge) — see §2 table

## Phase 3 — Note card: collapsed view

- [x] Status pill rendering (task/design only), read-only, correct dimming rules
- [x] Body preview: 2-line clamp already present — verify it strips markdown syntax beyond headings (bold/italic/links) for a clean preview
- [x] Tag chips row (currently missing entirely — only projects render) *(superseded — tags are no longer a plugin-rendered chip at all; see Phase 12)*
- [x] Clicking a `#tag`, project chip, or type badge applies it as a filter instead of expanding the card (team chips are expanded-only per §4's layout, so there's no collapsed team chip to click — judgment call, design.md doesn't show one collapsed) *(tag-click-to-filter superseded — see Phase 12; project/type-badge click-to-filter still applies)*
- [x] Meeting (recurring) subtype indicator: "N occurrences" + latest date, in place of/alongside the normal preview

## Phase 4 — Note card: expanded view

- [x] Title becomes an editable input on expand; saves via `app.fileManager.renameFile()` (not `Vault.rename()`) so wikilinks stay valid, debounced same as other autosave fields
- [x] Body renders via `MarkdownRenderer.render()` (already used) but each card must own a `Component` whose `load()`/`unload()` the view manages explicitly as cards mount/unmount/scroll out of the lazy window — currently no `Component` lifecycle management at all *(superseded — §4 no longer renders the body in the feed at all; see Phase 12)*
- [x] Team picker (chips + ×, autocomplete, italic styling) — mirror the existing project picker, generalize shared picker logic into one reusable component instead of duplicating
- [x] Tag picker (chips + ×, autocomplete, `Enter`/`,` to add, `Backspace` on empty removes last) *(superseded — no plugin-managed tag picker; tags are edited via Obsidian's own Properties UI; see Phase 12)*
- [x] Type-specific editable fields per type (status pill cycle-on-click + immediate save; thoughts' `question`/`landed`; knowledge's `techStack`; meeting's `theme`/`attendees`)
- [x] "New task from this note" button: creates a task note pre-filled with source's projects/teams/tags, a body backlink via `app.fileManager.generateMarkdownLink()`, and `sourceNoteId` set to source's `id` *(superseded — feature removed entirely per design revision; see Phase 12)*
- [x] Footer hint text (`⌘↵ save / esc collapse`)
- [x] `⌘↵` saves + collapses; `Esc` discards unsaved edits and collapses (currently only the dock has Enter/Esc handling, not the card)
- [x] 600ms autosave-after-typing-settles for all editable fields, going through the Phase 1 write queue
- [x] `updatedAt` bump only when content actually changed (no-op edits shouldn't reorder the feed) *(superseded — no `updatedAt` field to bump; `file.stat.mtime` already only changes on a real write; see Phase 12)*

## Phase 5 — Feed behavior

- [x] Day-group label rules: `Today`, `Yesterday`, weekday name within the week, `Wed, May 14` outside the week but same year, `May 14, 2024` for prior years (current code only does Today/Yesterday/weekday — missing the two longer-form cases)
- [x] Sort key: `updatedAt` normally, but for recurring meetings use the date of the most recent occurrence *(superseded — sort key is now `file.stat.mtime`, not frontmatter `updatedAt`; see Phase 12)*
- [x] History loading: only fetch notes from the last month on initial load; sentinel element at top of feed loads one more month when scrolled into view, with a loading indicator
- [x] When any filter/search is active, lift the horizon — query spans the whole logbook folder, not just the loaded window
- [x] Two distinct empty states: no notes at all (invitation to write) vs. no notes matching active filters (description of the filter + hint to clear or use `/`)
- [x] New-note scroll behavior: creating a note scrolls it into view at the bottom with a "Writing a [type]" divider above it

## Phase 6 — Command bar: creation commands

- [x] Add missing creation commands: `/done` (task, status done), `/recurring` (meeting, recurring subtype, one occurrence dated today)
- [x] `/thoughts [question]` pre-fills `question`, not `title`
- [x] Created note is added expanded at the bottom of the feed (currently `createNote` just writes the file — no expand-and-scroll-to-it behavior)
- [ ] Apply meeting template scaffold (see Phase 9) when a template is set at creation time — **not implemented**: `template` field exists on `MeetingFrontmatter` and round-trips, but nothing reads a template note's `###` headings to scaffold a new note/occurrence body

## Phase 7 — Command bar: filter & utility commands

- [x] `/project [name]` — filter by project, autocomplete from existing projects (pool already collected, just needs the filter command wired up)
- [x] `/team [name]` — filter by team, autocomplete from existing teams (need to start collecting the teams pool, same as projects)
- [x] `/type [type]` — filter by type; two-step flow for types with a sub-attribute (task/design → status, meeting → theme, knowledge → techStack), with a "— all" option; immediate apply for thoughts/draft (fixed a bug where meeting/knowledge's second step only ever showed "— all" — `Dock` now asks the view for observed theme/techStack values via `getTypeAttrValues` instead of hardcoding the task/design status enums)
- [x] `/clear` — remove all active filters
- [x] `/occurrence [meeting]` — dropdown of recurring meetings (fuzzy-matched, latest-occurrence-first); on selection, either jump to today's existing `##` heading or insert a new one at the top of the body via `app.vault.process()` + prepend to `occurrences[]` via the Phase 1 write queue, then open the note with cursor under the new heading
- [x] Filter chips rendered in the dock to the left of the input, each with its own × *(tag chip no longer exists — see Phase 12)*
- [x] `Backspace` on an empty command bar removes the most recent filter in priority order: tags → project → team → type → type attribute *(superseded — tags dropped from the priority chain entirely: project → team → type → type attribute; see Phase 12)*
- [x] Dropdown fuzzy-matches by prefix as typed (currently exact-prefix `startsWith` on the command key only — fine for the 8 fixed commands, but `/project`, `/team`, `/occurrence` need fuzzy title matching for their argument)

## Phase 8 — Filtering engine

- [x] Filter state model: free-text query, tags (multi), projects (multi), teams (multi), type (single), type-attribute (single) — all AND'd together *(superseded — tags dropped as a filter axis entirely; see Phase 12)*
- [x] Free-text search matches AND across whitespace-separated terms against title, body, tags, projects, teams, and type-specific fields *(superseded — `tags` dropped from the search fields; see Phase 12)*
- [x] `<mark>` highlighting of matched terms in both collapsed preview and expanded rendered body when a query is active *(superseded — there's no separate "expanded rendered body" anymore, only the shared preview; see Phase 12)*
- [x] Apply filters by clicking card elements (tag/project/team/badge) as described in Phase 3 *(superseded — tag-click-to-filter removed; project/team/badge click-to-filter still applies; see Phase 12)*

## Phase 9 — Meeting specifics

- [x] Recurring meeting body structure: `## <ISO date>` headings, most recent first; `occurrences[]` frontmatter mirrors them
- [x] Meeting template type: `type: template` notes containing only `###` headings, no body — `loadNotes` excludes them from the feed; `NoteStore.listTemplates()` discovers them by scanning the folder's frontmatter cache for `type: template`. No dedicated `/template` creation command was added — templates aren't normal logged notes (not part of the `NoteType` union/feed), so they're authored as plain files like any other Obsidian template; the plugin only needs to *read* them
- [x] Applying a template on creation (standalone) or new occurrence (recurring) pre-fills the body scaffold from the template's headings — meeting card now has a "Template" field (autocomplete from `listTemplates()`); setting it on a standalone meeting with an empty body scaffolds the `###` headings in immediately via `NoteStore.setMeetingTemplate`, and `/occurrence` on a recurring meeting with a template set scaffolds each new occurrence's headings under its `## <date>` heading via `NoteStore.addOrFindTodayOccurrence`
- [x] Opening a recurring meeting in Obsidian's editor shows the full file with every occurrence (no special handling needed — it's a plain markdown file)

## Phase 10 — Lifecycle & housekeeping

- [x] Draft auto-delete: on plugin load, `type: draft` notes older than 7 days (by `createdAt`) go to `app.vault.trash()`, never a hard delete
- [x] Collapse mode: title-bar action (`addAction`) toggling badge+title-only cards, session-persisted, resets on reload
- [x] Settings tab: confirm folder setting is the only one needed per §15, or add others if new features need configuration

## Phase 11 — Polish pass

- [x] ~~Verify markdown support breadth (tables, callouts, task checkboxes, code blocks) renders correctly through `MarkdownRenderer.render()`~~ — **moot per the design revision**: the feed no longer renders markdown at all (§6), so there's nothing to QA here. Full markdown rendering is entirely Obsidian's native editor/reading view, exercised the same way it always is for any other note in the vault.
- [x] Keyboard shortcuts audit against the full table in §12 (dropdown nav, card-level `⌘↵`/`Esc`, dock `Backspace`-removes-filter, and the tag/project/team input `Enter`/`,`/`Backspace` rules are all implemented and match the table) *(re-audit after Phase 12: §12 now only lists project/team inputs, not tag)*
- [x] Live refresh: confirm vault/metadata-cache event handling still works correctly once filters, pagination, and the write queue are in place (don't refetch/rerender during an in-flight edit) — `isAnySuppressed()` guards `maybeRefresh()`, and the new `onSettled` callback resyncs once the suppression window closes
- [x] Manual pass through every anti-feature in §13 to confirm none crept in (no folders inside logbook/, no custom theme, no file-explorer/graph duplication, no sharing/collab, flat hierarchy — confirmed by code review, still worth a final look in a live vault) *(re-check after Phase 12 against the two new anti-features: no tag manager, no second body renderer)*

## Phase 12 — Design revision: preview-only cards, mtime-based activity, native tags

Implements the four `design.md` changes described above. Each sub-section below names the files/lines as they stand today; verify with `tsc -noEmit` + `esbuild` after each, same as every prior phase.

### 12.1 Drop in-feed body rendering (§4, §6)

- [x] `plugin/src/view/card.ts`: removed the `MarkdownRenderer.render()` call and the body-render helper; the expanded card now keeps showing the same `logbook-preview` element already used collapsed (CSS rule hiding `.logbook-card-preview-wrap` when expanded was dropped too) instead of swapping in a rendered body
- [x] `plugin/src/view/card.ts`: dropped `registerBodyComponent`/`unregisterBodyComponent`/`hostComponent` from `CardContext`
- [x] `plugin/src/view/LogbookView.ts`: removed the `bodyComponents` map, `unloadAllBodyComponents()`, `onClose()` (had no other purpose), and the `registerBodyComponent`/`unregisterBodyComponent` wiring passed into the card context
- [x] `plugin/src/view/card.ts`: expand/collapse simplified to a synchronous class toggle — no body render step at all
- [x] `<mark>` highlighting still targets just the one shared preview element (it always did; no separate expanded-body highlighting existed to dedupe)

### 12.2 `updatedAt` → `file.stat.mtime` (§2, §3, §4, §15)

- [x] `plugin/src/note-store.ts`: stopped writing `updatedAt: ${now}` in `createNote`
- [x] `plugin/src/note-store.ts`: stopped bumping `fm.updatedAt` inside `updateFrontmatter`'s mutator
- [x] `plugin/src/types.ts`: dropped `updatedAt: string` from `NoteFrontmatter`; sort-key function (`activityTimestamp`) now reads `n.file.stat.mtime`, recurring-meeting latest-occurrence override unchanged
- [x] `plugin/src/note-store.ts`: dropped the `updatedAt` normalization fallback in `normalizeFrontmatter`
- [x] `plugin/src/view/card.ts`: time pill now renders `relativeTime(new Date(note.file.stat.mtime))`
- [x] No migration needed for existing notes with a stray `updatedAt` key on disk — confirmed inert, nothing reads/writes it anymore

### 12.3 Remove the plugin's tag system (§8, §9)

- [x] `plugin/src/note-store.ts`: stopped writing `"tags: []"` in `createNote`; dropped the `tags` normalization in `normalizeFrontmatter`
- [x] `plugin/src/types.ts`: dropped `tags: string[]` from `NoteFrontmatter`
- [x] `plugin/src/view/card.ts`: deleted `renderTagChips` and its call site in the collapsed preview; deleted the tag-picker block in the expanded card; dropped `tags()` from the `pools` passed into `CardContext`
- [x] `plugin/src/filters.ts`: dropped `tags: string[]` from `FilterState` and its default; dropped it from `hasActiveFilters`; dropped `tags` from the search-field list in the free-text matcher; deleted the tag predicate in the filter-apply function
- [x] `plugin/src/view/dock.ts`: removed tag-chip rendering from the filter-chip row and the tags-first branch of the `Backspace`-removes-filter priority chain (now project → team → type → type attribute)
- [x] `plugin/src/view/LogbookView.ts`: removed the `"tag"` branch of `removeFilterChip`/`onRemoveFilterChip` and the tag-click-to-filter handler (there was no separate tags pool collector passed to the dock — only `getAllProjects`/`getAllTeams` ever were)
- [x] Left `plugin/src/view/pickers.ts` itself alone — still has two callers (projects, teams)
- [x] `createNote` no longer touches a `tags` field at all; every `processFrontMatter` mutator only sets the specific keys it owns, so a user-added native `tags` property is left untouched on subsequent writes

### 12.4 Remove "New task from this note" (§4, §5.2)

- [x] `plugin/src/note-store.ts`: deleted `createTaskFromNote()` entirely, plus the now-orphaned `appendBodyLine()` helper it was the only caller of
- [x] `plugin/src/types.ts`: dropped `sourceNoteId?: string` from `TaskFrontmatter`
- [x] `plugin/src/note-store.ts`: dropped the `sourceNoteId` normalization in `normalizeFrontmatter`
- [x] `plugin/src/view/card.ts`: deleted the "New task from this note" button block in the expanded footer, including its `note.fm.type !== "task"` guard
- [x] `plugin/src/view/card.ts`: dropped `onCreateTaskFromNote` from `CardContext`
- [x] `plugin/src/view/LogbookView.ts`: deleted `createTaskFromNote()` and its wiring into the card context
- [x] Removed the now-orphaned `.logbook-new-task-btn` rule from `plugin/styles.css`
- [x] No migration needed for existing task notes with a stray `sourceNoteId` — confirmed inert

### 12.5 Re-verification

- [x] `tsc -noEmit -skipLibCheck` and `node esbuild.config.mjs production` both run clean against the trimmed source (ran after installing `devDependencies`, which weren't present in the working tree)
- [x] Re-checked the Phase 11 keyboard-shortcut table and anti-feature pass against the new §12/§13 — no tag input row, no tag manager, no second body renderer; nothing else in the implementation regressed
- [ ] Manual QA in a live vault: edit a logbook note's body directly in Obsidian's native editor (bypassing the plugin entirely) and confirm the note jumps to the bottom of the feed once the view refreshes — this still genuinely needs a live Obsidian vault and hasn't been done
