# Logbook — implementation plan

Tracks the gap between `design.md` and the current prototype (`plugin/src/main.ts`). Organized as phases, each phase roughly independent and shippable. Check items off as they land.

**Current state of the prototype:** single-file view with a feed, day grouping, one note type's worth of rendering for all six types, a `/type [title]` creation-only command bar, and a project picker on the card. Missing: stable `id`, most frontmatter fields, all type-specific fields, tags/teams pickers, title editing/rename, filters, search, history pagination, draft auto-delete, collapse mode, template support, occurrence handling, and the `processFrontMatter` write-queue the design explicitly calls out as a risk.

---

## Phase 0 — Data layer foundations

- [ ] Add `id` (stable, minted on creation) to frontmatter; never regenerate/overwrite on later saves
- [ ] Fix `createNote` frontmatter to match §2 schema exactly — drop the stray `pinned` field, add `id`, keep `createdAt`/`updatedAt` only bumping `updatedAt` on real content changes
- [ ] Centralize frontmatter read access through `app.metadataCache.getFileCache()` only (no `cachedRead` parsing of frontmatter by hand for fields already in the cache)
- [ ] Build a per-file `processFrontMatter` write queue (serialize calls per path) — required per §15's documented risk of concurrent calls dropping writes; route every frontmatter mutation (status cycle, picker edits, rename-triggered updates, occurrence prepend) through it
- [ ] Generalize the current ad-hoc `skipRefreshUntil` hack into the documented 600ms refresh-suppression window after any `processFrontMatter` call (§15), scoped so it doesn't suppress unrelated file changes
- [ ] Note-loading: extend `LogNote` (or replace with a discriminated union per type) to carry every common + type-specific field from §2 and §5

## Phase 1 — Note types & type-specific fields

- [ ] Task: `status: todo|done|suspended`; collapsed read-only pill; expanded click-to-cycle pill that saves immediately; struck-through dimmed title for `done`, extra dimming for `suspended`
- [ ] Meeting: `subtype: standalone|recurring`, `theme`, `attendees[]`; recurring adds `occurrences[]` mirroring `##` body headings; optional `template` field on both subtypes
- [ ] Thoughts: `question` (shown above body collapsed + dedicated expanded field), `landed` (expanded-only "Where I landed" field)
- [ ] Knowledge: `techStack[]` with `STACK` label on the card
- [ ] Design: `status: exploring|in-review|decided`, filterable, same pill treatment as task status
- [ ] Draft: confirm no extra fields; wire into auto-delete (Phase 6)
- [ ] Type-specific filterable attributes wired into the filter system (status for task/design, theme for meeting, techStack for knowledge) — see §2 table

## Phase 2 — Note card: collapsed view

- [ ] Status pill rendering (task/design only), read-only, correct dimming rules
- [ ] Body preview: 2-line clamp already present — verify it strips markdown syntax beyond headings (bold/italic/links) for a clean preview
- [ ] Tag chips row (currently missing entirely — only projects render)
- [ ] Clicking a `#tag`, project chip, team chip, or type badge applies it as a filter instead of expanding the card (currently every click on the project row already correctly stops propagation; extend the same pattern to tags/teams/badge)
- [ ] Meeting (recurring) subtype indicator: "N occurrences" + latest date, in place of/alongside the normal preview

## Phase 3 — Note card: expanded view

- [ ] Title becomes an editable input on expand; saves via `app.fileManager.renameFile()` (not `Vault.rename()`) so wikilinks stay valid, debounced same as other autosave fields
- [ ] Body renders via `MarkdownRenderer.render()` (already used) but each card must own a `Component` whose `load()`/`unload()` the view manages explicitly as cards mount/unmount/scroll out of the lazy window — currently no `Component` lifecycle management at all
- [ ] Team picker (chips + ×, autocomplete, italic styling) — mirror the existing project picker, generalize shared picker logic into one reusable component instead of duplicating
- [ ] Tag picker (chips + ×, autocomplete, `Enter`/`,` to add, `Backspace` on empty removes last)
- [ ] Type-specific editable fields per type (status pill cycle-on-click + immediate save; thoughts' `question`/`landed`; knowledge's `techStack`; meeting's `theme`/`attendees`)
- [ ] "New task from this note" button: creates a task note pre-filled with source's projects/teams/tags, a body backlink via `app.fileManager.generateMarkdownLink()`, and `sourceNoteId` set to source's `id`
- [ ] Footer hint text (`⌘↵ save / esc collapse`)
- [ ] `⌘↵` saves + collapses; `Esc` discards unsaved edits and collapses (currently only the dock has Enter/Esc handling, not the card)
- [ ] 600ms autosave-after-typing-settles for all editable fields, going through the Phase 0 write queue
- [ ] `updatedAt` bump only when content actually changed (no-op edits shouldn't reorder the feed)

## Phase 4 — Feed behavior

- [ ] Day-group label rules: `Today`, `Yesterday`, weekday name within the week, `Wed, May 14` outside the week but same year, `May 14, 2024` for prior years (current code only does Today/Yesterday/weekday — missing the two longer-form cases)
- [ ] Sort key: `updatedAt` normally, but for recurring meetings use the date of the most recent occurrence
- [ ] History loading: only fetch notes from the last month on initial load; sentinel element at top of feed loads one more month when scrolled into view, with a loading indicator
- [ ] When any filter/search is active, lift the horizon — query spans the whole logbook folder, not just the loaded window
- [ ] Two distinct empty states: no notes at all (invitation to write) vs. no notes matching active filters (description of the filter + hint to clear or use `/`)
- [ ] New-note scroll behavior: creating a note scrolls it into view at the bottom with a "Writing a [type]" divider above it

## Phase 5 — Command bar: creation commands

- [ ] Add missing creation commands: `/done` (task, status done), `/recurring` (meeting, recurring subtype, one occurrence dated today)
- [ ] `/thoughts [question]` pre-fills `question`, not `title`
- [ ] Created note is added expanded at the bottom of the feed (currently `createNote` just writes the file — no expand-and-scroll-to-it behavior)
- [ ] Apply meeting template scaffold (see Phase 7) when a template is set at creation time

## Phase 6 — Command bar: filter & utility commands

- [ ] `/project [name]` — filter by project, autocomplete from existing projects (pool already collected, just needs the filter command wired up)
- [ ] `/team [name]` — filter by team, autocomplete from existing teams (need to start collecting the teams pool, same as projects)
- [ ] `/type [type]` — filter by type; two-step flow for types with a sub-attribute (task/design → status, meeting → theme, knowledge → techStack), with a "— all" option; immediate apply for thoughts/draft
- [ ] `/clear` — remove all active filters
- [ ] `/occurrence [meeting]` — dropdown of recurring meetings (fuzzy-matched, latest-occurrence-first); on selection, either jump to today's existing `##` heading or insert a new one at the top of the body via `app.vault.process()` + prepend to `occurrences[]` via the Phase 0 write queue, then open the note with cursor under the new heading
- [ ] Filter chips rendered in the dock to the left of the input, each with its own ×
- [ ] `Backspace` on an empty command bar removes the most recent filter in priority order: tags → project → team → type → type attribute
- [ ] Dropdown fuzzy-matches by prefix as typed (currently exact-prefix `startsWith` on the command key only — fine for the 8 fixed commands, but `/project`, `/team`, `/occurrence` need fuzzy title matching for their argument)

## Phase 7 — Filtering engine

- [ ] Filter state model: free-text query, tags (multi), projects (multi), teams (multi), type (single), type-attribute (single) — all AND'd together
- [ ] Free-text search matches AND across whitespace-separated terms against title, body, tags, projects, teams, and type-specific fields
- [ ] `<mark>` highlighting of matched terms in both collapsed preview and expanded rendered body when a query is active
- [ ] Apply filters by clicking card elements (tag/project/team/badge) as described in Phase 2

## Phase 8 — Meeting specifics

- [ ] Recurring meeting body structure: `## <ISO date>` headings, most recent first; `occurrences[]` frontmatter mirrors them
- [ ] Meeting template type: `type: template` notes containing only `###` headings, no body
- [ ] Applying a template on creation (standalone) or new occurrence (recurring) pre-fills the body scaffold from the template's headings
- [ ] Opening a recurring meeting in Obsidian's editor shows the full file with every occurrence

## Phase 9 — Lifecycle & housekeeping

- [ ] Draft auto-delete: on plugin load, `type: draft` notes older than 7 days (by `createdAt`) go to `app.vault.trash()`, never a hard delete
- [ ] Collapse mode: title-bar action (`addAction`) toggling badge+title-only cards, session-persisted, resets on reload
- [ ] Settings tab: confirm folder setting is the only one needed per §15, or add others if new features need configuration

## Phase 10 — Polish pass

- [ ] Verify markdown support breadth (tables, callouts, task checkboxes, code blocks) renders correctly through `MarkdownRenderer.render()` — should mostly be free, but confirm callout types render with the active theme
- [ ] Keyboard shortcuts audit against the full table in §12 (dropdown nav already present; card-level `⌘↵`/`Esc` and dock `Backspace`-removes-filter are new)
- [ ] Live refresh: confirm vault/metadata-cache event handling still works correctly once filters, pagination, and the write queue are in place (don't refetch/rerender during an in-flight edit)
- [ ] Manual pass through every anti-feature in §13 to confirm none crept in (no folders inside logbook/, no custom theme, etc.)
