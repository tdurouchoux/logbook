# Logbook — implementation plan

Tracks the gap between `design.md` and the current prototype (`plugin/src/main.ts`). Organized as phases, each phase roughly independent and shippable. Check items off as they land.

**Current state:** Phases 0–8 and 10 are complete — modular file layout, the full data layer (write queue, refresh suppression + settle resync, stable ids), all six note types with their type-specific fields, full collapsed/expanded card behavior, feed grouping/pagination/empty-states, the full command bar (creation + filter/utility commands), and the filtering/search engine. Remaining: meeting template scaffolding (Phase 9) and in-Obsidian manual QA (Phase 11) — everything else has been implemented and verified via `tsc -noEmit` + `esbuild` after every change.

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
- [x] Fix `createNote` frontmatter to match §2 schema exactly — drop the stray `pinned` field, add `id`, keep `createdAt`/`updatedAt` only bumping `updatedAt` on real content changes
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
- [x] Tag chips row (currently missing entirely — only projects render)
- [x] Clicking a `#tag`, project chip, or type badge applies it as a filter instead of expanding the card (team chips are expanded-only per §4's layout, so there's no collapsed team chip to click — judgment call, design.md doesn't show one collapsed)
- [x] Meeting (recurring) subtype indicator: "N occurrences" + latest date, in place of/alongside the normal preview

## Phase 4 — Note card: expanded view

- [x] Title becomes an editable input on expand; saves via `app.fileManager.renameFile()` (not `Vault.rename()`) so wikilinks stay valid, debounced same as other autosave fields
- [x] Body renders via `MarkdownRenderer.render()` (already used) but each card must own a `Component` whose `load()`/`unload()` the view manages explicitly as cards mount/unmount/scroll out of the lazy window — currently no `Component` lifecycle management at all
- [x] Team picker (chips + ×, autocomplete, italic styling) — mirror the existing project picker, generalize shared picker logic into one reusable component instead of duplicating
- [x] Tag picker (chips + ×, autocomplete, `Enter`/`,` to add, `Backspace` on empty removes last)
- [x] Type-specific editable fields per type (status pill cycle-on-click + immediate save; thoughts' `question`/`landed`; knowledge's `techStack`; meeting's `theme`/`attendees`)
- [x] "New task from this note" button: creates a task note pre-filled with source's projects/teams/tags, a body backlink via `app.fileManager.generateMarkdownLink()`, and `sourceNoteId` set to source's `id`
- [x] Footer hint text (`⌘↵ save / esc collapse`)
- [x] `⌘↵` saves + collapses; `Esc` discards unsaved edits and collapses (currently only the dock has Enter/Esc handling, not the card)
- [x] 600ms autosave-after-typing-settles for all editable fields, going through the Phase 1 write queue
- [x] `updatedAt` bump only when content actually changed (no-op edits shouldn't reorder the feed)

## Phase 5 — Feed behavior

- [x] Day-group label rules: `Today`, `Yesterday`, weekday name within the week, `Wed, May 14` outside the week but same year, `May 14, 2024` for prior years (current code only does Today/Yesterday/weekday — missing the two longer-form cases)
- [x] Sort key: `updatedAt` normally, but for recurring meetings use the date of the most recent occurrence
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
- [x] Filter chips rendered in the dock to the left of the input, each with its own ×
- [x] `Backspace` on an empty command bar removes the most recent filter in priority order: tags → project → team → type → type attribute
- [x] Dropdown fuzzy-matches by prefix as typed (currently exact-prefix `startsWith` on the command key only — fine for the 8 fixed commands, but `/project`, `/team`, `/occurrence` need fuzzy title matching for their argument)

## Phase 8 — Filtering engine

- [x] Filter state model: free-text query, tags (multi), projects (multi), teams (multi), type (single), type-attribute (single) — all AND'd together
- [x] Free-text search matches AND across whitespace-separated terms against title, body, tags, projects, teams, and type-specific fields
- [x] `<mark>` highlighting of matched terms in both collapsed preview and expanded rendered body when a query is active
- [x] Apply filters by clicking card elements (tag/project/team/badge) as described in Phase 3

## Phase 9 — Meeting specifics

- [x] Recurring meeting body structure: `## <ISO date>` headings, most recent first; `occurrences[]` frontmatter mirrors them
- [ ] Meeting template type: `type: template` notes containing only `###` headings, no body — `loadNotes` already excludes `type: template` notes from the feed, but there's no creation path or scaffolding logic that reads one
- [ ] Applying a template on creation (standalone) or new occurrence (recurring) pre-fills the body scaffold from the template's headings — **not implemented**
- [x] Opening a recurring meeting in Obsidian's editor shows the full file with every occurrence (no special handling needed — it's a plain markdown file)

## Phase 10 — Lifecycle & housekeeping

- [x] Draft auto-delete: on plugin load, `type: draft` notes older than 7 days (by `createdAt`) go to `app.vault.trash()`, never a hard delete
- [x] Collapse mode: title-bar action (`addAction`) toggling badge+title-only cards, session-persisted, resets on reload
- [x] Settings tab: confirm folder setting is the only one needed per §15, or add others if new features need configuration

## Phase 11 — Polish pass

- [ ] Verify markdown support breadth (tables, callouts, task checkboxes, code blocks) renders correctly through `MarkdownRenderer.render()` — should mostly be free, but confirm callout types render with the active theme — **needs manual QA inside real Obsidian, not possible in this environment**
- [x] Keyboard shortcuts audit against the full table in §12 (dropdown nav, card-level `⌘↵`/`Esc`, dock `Backspace`-removes-filter, and the tag/project/team input `Enter`/`,`/`Backspace` rules are all implemented and match the table)
- [x] Live refresh: confirm vault/metadata-cache event handling still works correctly once filters, pagination, and the write queue are in place (don't refetch/rerender during an in-flight edit) — `isAnySuppressed()` guards `maybeRefresh()`, and the new `onSettled` callback resyncs once the suppression window closes
- [x] Manual pass through every anti-feature in §13 to confirm none crept in (no folders inside logbook/, no custom theme, no file-explorer/graph duplication, no sharing/collab, flat hierarchy — confirmed by code review, still worth a final look in a live vault)
