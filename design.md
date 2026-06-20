# Logbook — Obsidian plugin design

A personal note-taking plugin that replaces folder hierarchies with a **chat-style feed of typed notes**, living directly inside your Obsidian vault.

---

## Why a plugin, not a standalone app

The core Logbook idea maps almost perfectly onto Obsidian's architecture:

- Notes are already `.md` files with YAML frontmatter — no custom format needed.
- Obsidian's metadata cache indexes every frontmatter field instantly, making filtering free.
- Sync, backup, and version control are already solved (iCloud, Obsidian Sync, git).
- `[[wikilinks]]` in note bodies connect Logbook notes to the rest of the vault.
- Other plugins (Dataview, Tasks, Templater) can query Logbook notes by frontmatter.
- Obsidian's own theme system and native editor/reading view cover rendering and visual styling for free — the plugin never needs to render a full note body itself.
- Obsidian already tracks a last-modified time for every file and has its own tag system (frontmatter `tags`, inline `#tags`, the tag pane) — the plugin doesn't need to duplicate either.

The trade-off: the UI lives inside Obsidian's constraints (a tab/pane, not a clean browser context) and inherits the user's installed theme rather than shipping its own. Custom views are capable enough that this is acceptable.

---

## 1. Guiding principles

- **No tree.** The plugin never asks "where does this go?" before letting you write. The feed is the only interface.
- **Markdown files are canonical.** Every note is a `.md` file with YAML frontmatter. The plugin is a view onto the vault — it holds no state the file can't represent.
- **The bottom of the view is the active surface.** The command bar (dock) and the most recent note both sit in the user's eye-line at the bottom of the feed.
- **A note has a type.** Each type has its own structure that the UI surfaces — at a glance in the feed, and as dedicated fields when expanded.
- **Opinionated defaults.** Sensible structure ships with the type — the user adds detail, never scaffolding.
- **Scoped to one folder.** The plugin watches a configurable folder (default: `logbook/`). Notes outside it are untouched by the feed, filters, and auto-delete.

---

## 2. Data model

Every note is a `.md` file in the logbook folder. The filename is a normalized slug of the title — UNIX-safe, spaces replaced with underscores, special characters stripped — e.g. `my_note.md`. If the resulting filename already exists, a `_<number>` suffix is appended.

Renaming the file when the title is edited inline (see §4) must go through `app.fileManager.renameFile()`, not `Vault.rename()` — only `fileManager.renameFile()` updates other notes' `[[wikilinks]]` to the renamed file.

### Common frontmatter fields

```yaml
---
id: <stable identifier>   # generated on creation, never changes
type: draft               # one of the six types below
title: "Note title"
projects: []              # free-form, lowercase-hyphenated; a note can belong to multiple
teams: []                 # same shape as projects, but for people/groups
createdAt: <ISO>
---
```

There is no plugin-managed `updatedAt` field. "Last activity" is read straight off the file itself — `file.stat.mtime`, which Obsidian already maintains for every file on every write, whether that write came from the plugin (a frontmatter edit) or from editing the body directly in Obsidian's native editor. Re-opening and closing a note without edits doesn't touch `mtime`, so it doesn't reorder the feed either.

`id` is a stable identifier minted on creation (a short random/UUID string) — filenames and titles can change without breaking anything that might reference a note by it.

Tags are not a plugin-managed field. A note may or may not carry a `tags` frontmatter property — that's entirely Obsidian's own tag system (frontmatter `tags`, inline `#tags` in the body, the built-in tag pane and search). The plugin neither writes, edits, displays, nor filters by it; see §9.

### The six note types

| Type | Extra fields | Badge color |
|---|---|---|
| **Draft** | *(none)* — auto-deleted 7 days after `createdAt` | warm gray |
| **Task** | `status: todo \| done \| suspended` | amber |
| **Meeting** | `subtype: standalone \| recurring`, `theme`, `attendees[]` + for recurring: `occurrences[]`; either subtype may carry `template` (filename reference) | dusty blue |
| **Thoughts** | `question`, `landed` | muted plum |
| **Knowledge** | `techStack[]` | moss green |
| **Design** | `status: exploring \| in-review \| decided` | dusty violet |

### Type-level filterable attributes

| Type | Additional filterable attribute |
|---|---|
| Task | `status` |
| Meeting | `subtype` |
| Design | `status` |
| Thoughts | *(none)* |
| Knowledge | *(none)* |
| Draft | *(none)* |

---

## 3. The feed

The plugin registers an `ItemView` tab in the main workspace area. Its width is whatever the pane gets in the user's current split — full-width only if it's the sole open pane, narrower if split alongside others. Obsidian gives every pane its own title bar for free — that's where the view's collapse-mode action lives (see §10) — so the view's own layout is just a flex column:

```
┌──────────────────────────────────────────┐
│  Feed (scrollable, flex:1)                │
│  Oldest at top, newest at bottom          │
│  Grouped by day with dividers             │
├──────────────────────────────────────────┤
│  Dock (command bar)                       │
└──────────────────────────────────────────┘
```

### Order

- Chronological, newest at the bottom. The view scrolls to the bottom on open.
- Sort key is each note's **latest activity timestamp**: the file's last-modified time (`file.stat.mtime`) for most notes, but for a recurring meeting it's the date of its most recent occurrence — unless that occurrence is today, in which case `file.stat.mtime` is used after all, since a bare date has no time-of-day and would otherwise always sort earlier than every other note touched today.
- A newly created note always lands at the bottom of the feed, and the view scrolls to reveal it.
- Day groups: `Today`, `Yesterday`, `Wednesday`, `Wed, May 14`, `May 14, 2024`.
- **Stable position while expanded:** any frontmatter write — a status pill click, a project edit — bumps `file.stat.mtime` just like a body edit, but the feed doesn't resort an open card out from under the user. A card holds its current position *and day-group* for as long as it's expanded — both the sort and the day-grouping use its frozen timestamp, not its live one — and only catches up to its new sorted position (and day group) once it collapses. Without this, toggling a status pill mid-edit could make the card (and its whole day-group) jump elsewhere in the feed and scroll out of view — disorienting, since the user's attention is still on it.

### History loading

- On initial load, notes older than one month are not fetched.
- A sentinel at the top of the feed triggers loading one more month of notes when scrolled into view, with a subtle loading indicator while it fetches.
- When a filter is active, the horizon is lifted — search and filters span the whole logbook folder, not just the loaded window.

### Empty states

- **No notes match the active filter(s):** a quiet message describing the filter, with a hint to type `/` in the command bar to create a matching note or to clear filters.
- **No notes exist at all:** a friendly invitation to start writing.

---

## 4. Note card

### Collapsed (default)

```
[badge] [filter-pill] [💼 proj1] [💼 proj2] [👤 team1]      [▽] [2h]
Note title
Body preview — 2 lines, plain text…
```

- Top row, left to right: the type badge, then — if the type has one (see §2) — its filterable-property pill (`status` for task/design, `subtype` for meeting), then a project pill per value (briefcase icon) and a team pill per value (people icon). Any of these the note doesn't have is simply absent from the row; nothing reserves space for it.
- Top right: the chevron (closed state) and the note's "age" — a relative-time pill (`2h`, `3d`, …). These two are pinned to the top-right corner in both collapsed and expanded state (see Expanded below) — they don't drift when the pills row between them and the badge comes and goes.
- Middle: the title.
- Bottom: a 2-line plain-text body preview (see §6) — shown only while collapsed; it disappears once the card expands, since expanding opens the real note in Obsidian's editor instead.
- `done` tasks render with the title struck through and the card dimmed; `suspended` tasks dimmed further.
- **Clicking any pill in the top row (badge, filterable-property pill, project pill, team pill) applies it as a filter (see §8) — it never expands the card.** Clicking anywhere else on the card (title, preview, top-right area) expands it.

### Expanded

First click (anywhere except a top-row pill) expands the card in place **and simultaneously opens the underlying note in Obsidian's native editor** (see "Opening in Obsidian's editor" below) — there's no separate button for it. Because the real body is now visible in the editor, the card itself drops its body preview the moment it expands; only the editable frontmatter fields remain on the card.

```
[badge]                                       [△] [2h]
Note title (editable)
Status     [filter-pill]
Projects   [💼 proj1 ×] [+]
Teams      [👤 team1 ×] [+]
other type-specific fields…
⌘↵ save / esc collapse
```

- Top left: type badge only — the filterable-property pill and the project/team pills move down into the field block below, since they're editable there now.
- Top right: unchanged from collapsed — chevron (now rotated/open) and the note's age, still pinned to the card's top-right corner even though the pills row that used to sit between them and the badge has moved down into the field block.
- Middle: the title (now an editable input), followed by every additional field:
  - The filterable-property pill, project pills, and team pills each get their own line, with the pill type's name as a label on the left (`Status`/`Subtype`, `Projects`, `Teams`) — the same label-on-the-left layout as the other type-specific fields below them. Their behavior on click depends on the field:
    - **Project and team pills:** clicking the pill itself (not its `×`) still applies it as a filter, same as collapsed. The `×` removes the value; a small **`+`** button at the end of the line is the only add affordance — clicking it reveals a free-text input (autofocused) with autocomplete, `Enter`/`,` to add (the input stays open afterward so several values can be added in a row), `Backspace` on an empty input removes the last value, and it collapses back to `+` on blur or `Esc`.
    - **Task/design's `status` pill:** no longer filters while expanded — clicking it instead cycles to the next status (`todo → done → suspended → todo`, or `exploring → in-review → decided → exploring`); like every other field, the new value is staged and only written when the card closes. There's no `×` or removal — every task/design note always has a status.
    - **Meeting's `subtype` pill:** stays read-only/filter-only even while expanded — clicking it applies the subtype filter, exactly as collapsed. There's no edit affordance, since a meeting can't be converted between standalone and recurring after creation.
  - Remaining type-specific fields with no pill treatment — thoughts' `question`/`landed`, meeting's `theme`/`attendees`, knowledge's `techStack` (not filterable, see §2) — are plain labeled inputs/pickers, not pills, and carry no filter-on-click behavior.
- No body preview while expanded — see above.
- Footer: just the hint text (`⌘↵ save / esc collapse`); there's no button here anymore since opening the note already happened on expand.
- **Nothing is written to disk while a field is being edited.** Every property edit — title, the filterable-property pill, project/team pills, and every type-specific field — updates the card's own UI immediately (and the in-memory note, so filtering/sorting elsewhere stays consistent) but is only staged, not saved. Staged edits are flushed to disk — as a rename (if the title changed) plus a single batched `processFrontMatter` call for everything else — the moment the card is explicitly closed: `⌘↵`, clicking elsewhere to collapse, or expanding a different card. `Esc` discards the staged edits instead of saving them: since nothing was written yet, discarding is just re-reading the note's still-unchanged frontmatter and re-rendering the card from it, then collapsing.
- `⌘↵` works two ways, redundantly: as a global hotkey (`Mod+Enter`) that closes/saves whichever card is currently expanded regardless of which pane has focus (needed because expanding a card opens its note in Obsidian's editor and usually moves keyboard focus there), and as a `keydown` listener attached directly to every field input inside the card itself (title, every plain type-specific input, and every picker's text input) — so it also works the instant focus is still inside the card's own title or property fields, without depending on the keystroke bubbling up past a picker's own Enter-to-add handling. `Esc` is wired the same way, on both the card and every field.
- No `updatedAt` bump to manage: the save-on-close write updates `file.stat.mtime` automatically, which is what reorders the feed (see §2, §3) — but not while this card is the one expanded (see §3's stable-position rule).

Second click on the card (outside an input or a filtering pill) collapses it, saving any staged edits first. Expanding a different card closes (and saves) whichever was open, then opens the new note in the editor.

### Opening in Obsidian's editor

Editing the body is never done inline in the feed — only frontmatter fields (title, projects, teams, type-specific fields) are editable on the expanded card, and the body is never even rendered there. Expanding a card opens the underlying `.md` file in Obsidian's native editor at the same moment (a new tab or pane, per the user's normal Obsidian behavior — `Cmd`/`Ctrl`-click for a new pane) — this is automatic, not a separate click. This sidesteps maintaining a second renderer or a second text buffer for the same file: Obsidian's own editor/reading view is the single place body content is ever displayed or edited, with its own autosave, markdown rendering, and pane-splitting.

For a recurring meeting, opening the note shows the whole file, including every occurrence heading, in Obsidian's editor.

---

## 5. The six note types

### 5.1 Draft

Quick unstructured capture — the catchall when no other type fits. No extra fields. Badge color: warm gray.

**Auto-delete:** on plugin load, any `type: draft` note whose `createdAt` is more than 7 days ago is sent to `app.vault.trash()` (respecting the vault's configured trash location — never a hard delete).

### 5.2 Task

An action with a state.

- `status`: `todo`, `done`, or `suspended`.
- Badge color: amber.
- Created the same way as any other note type: inline at the bottom of the feed, via the `/task` (status `todo`) or `/done` (status `done`, for logging things already finished) commands.
- Status pill: on the collapsed card, clicking it applies a status filter (see §4, §8); in the expanded card, clicking it instead cycles `todo → done → suspended → todo` and saves immediately.
- `done` tasks: title struck through, card dimmed. `suspended` tasks: dimmed further.

### 5.3 Meeting

Notes from a conversation.

Common fields: `theme` (plain field, not filterable), `attendees[]` (first names, shown inline on the card).

#### Standalone

- `subtype: standalone`. Body holds the entire set of notes from that one meeting.

#### Recurring

- `subtype: recurring`. Each occurrence is stored as a second-level heading (`## 2025-05-14`, ISO date) inside the single file's body, most recent first. `occurrences[]` in frontmatter mirrors those dates for fast indexing, but the `##` headings in the body are the canonical structure.

`subtype` is the meeting type's filterable attribute (see §2, §4): it renders as a pill on every meeting card, clicking it always applies a `subtype` filter — collapsed or expanded — and it's never editable from the card, since a meeting can't be converted between standalone and recurring after creation.
- Card subtype indicator: `N occurrences`, plus the date of the latest one.
- There is no inline occurrence UI on the card — expanding it opens the note in Obsidian's editor, same as any other note (see §4), which is where the full history of occurrences is visible. Adding today's occurrence is a command, not a feed interaction: see **`/occurrence`** in §7.

#### Meeting templates

- A standalone or recurring meeting note may reference a **template** via a `template` frontmatter field (the template file's name).
- A template is a regular `.md` file with `type: template` in frontmatter, containing only a list of `###` headings with no body content.
- Creating a new occurrence (recurring) or a new meeting (standalone) with a template applies pre-fills the body with those headings as an empty scaffold.

### 5.4 Thoughts

An exploration of an idea or question.

- `question` — shown above the preview on the card and as a dedicated input field when expanded.
- `landed` — optional takeaway/conclusion, shown as a "Where I landed" field below the preview when expanded.
- The `/thoughts [question]` command pre-fills the `question` field.
- Badge color: muted plum.

### 5.5 Knowledge

Something worth remembering — a fact, snippet, quote, definition.

- `techStack[]` — optional list of technologies/concepts. Card shows a small uppercase `STACK` label alongside it. Not a filterable attribute for now (see §2) — no header pill, no filter-on-click.
- Badge color: moss green.

### 5.6 Design

Technical design of part of a project.

- `status`: `exploring`, `in-review`, or `decided`. Filterable.
- Badge color: dusty violet.

---

## 6. Markdown support

The feed never renders a note's body as markdown — only a plain-text preview (markdown syntax stripped beyond headings/bold/italic/links, clamped to two lines), shown only on the collapsed card. Expanding a card opens the real note in Obsidian's native editor instead (see §4, "Opening in Obsidian's editor"), so there's nothing left to preview once it's open. Full markdown support — headings, bold/italic/strikethrough, code blocks with syntax highlighting, task checkboxes, GFM tables, links, Obsidian-style callouts, and everything else — is simply whatever Obsidian's own native editor and reading view already provide. The plugin does no rendering work for any of it.

When a search/filter query is active, matching terms are wrapped in `<mark>` in the body preview — the only place a preview is shown, since it's collapsed-only.

---

## 7. The command bar (dock)

A single input at the bottom of the view, with two modes.

### Search mode (default)

- Free text is a search query: matches AND across whitespace-separated terms, checked against `title`, `body`, `projects`, `teams`, and every type-specific field. (Searching by tag is Obsidian's own job — its search pane and tag pane already do this; see §9.)
- Matches are highlighted (see §6) in card previews while the query is active.
- When filters are active, the bar shows their chips to the left of the input (see §8).
- Free text never creates a note — note creation only happens through `/` commands.

### Command mode (`/`)

Typing a leading `/` into the (always-visible) command bar switches it into command mode: monospace font, accent color, dropdown rises above with arrow-key navigation.

**Creation commands** — create a new note and add it to the bottom of the feed, expanded. The rest of the typed text becomes the note's `title` (or, for `/thoughts`, its `question` field) — never body content, since the body is never authored inline (see §4). The feed scrolls to reveal the new note, with a date divider reading "Writing a [type]" above it:

| Command | Effect |
|---|---|
| `/draft [title]` | New draft |
| `/task [title]` | New task, status `todo` |
| `/done [title]` | New task, status `done` |
| `/meeting [title]` | New standalone meeting |
| `/recurring [title]` | New recurring meeting with one occurrence dated today |
| `/thoughts [question]` | New thoughts note, `question` pre-filled |
| `/knowledge [title]` | New knowledge note |
| `/design [title]` | New design note |

**`/occurrence [meeting]`** — adds today's occurrence to an *existing* recurring meeting, rather than creating a new note. Typing `/occurrence ` with nothing after it opens a dropdown listing every recurring meeting (`type: meeting`, `subtype: recurring`), latest-occurrence-first; typing further narrows it by fuzzy-matching titles, the same pattern used by `/project` and `/team`. Navigate with `↑`/`↓`, pick with `Tab` or `Enter`. On selecting one:

- If a `## <today's ISO date>` heading already exists in that note (checked against its `occurrences[]` frontmatter, no need to open the file), nothing is inserted — the command just opens the note with the cursor on that existing heading. This avoids duplicate headings if the command is run twice in a day.
- Otherwise, the plugin inserts a new `## <today's ISO date>` heading at the top of the body, above all existing occurrence headings, via `app.vault.process()` — an atomic read-modify-write against the file's current on-disk content, not a cached in-memory copy, so it can't clobber concurrent edits or desync from what's actually on disk. It then prepends today's date to `occurrences[]` via `processFrontMatter` (see §15 for the write-queue note on that API). These are two separate, sequential atomic writes, not one transaction.
- The note is then opened in Obsidian's native editor (a normal `leaf.openFile`), with the cursor placed on the blank line right under the new heading — ready for the user to type that occurrence's notes directly. This is the only way occurrence content gets added; there is no inline editor for it in the feed (see §4, §5.3).

**Filter commands** — apply a filter to the feed:

| Command | Effect |
|---|---|
| `/project [name]` | Filter by project; autocompletes from existing projects |
| `/team [name]` | Filter by team; autocompletes from existing teams |
| `/type [type]` | Filter by note type; autocompletes the six types. Selecting a type with a sub-attribute (task/design → status, meeting → subtype) advances to a second step listing that attribute's values (plus "— all"); types without one apply immediately |

**Other:**

| Command | Effect |
|---|---|
| `/clear` | Remove all active filters |

The dropdown fuzzy-matches by prefix as the user types. `Tab` selects the highlighted command; `↑`/`↓` navigate it; `Enter` runs the selected command (or submits the typed search query, in search mode); `Esc` cancels and clears the bar.

---

## 8. Filters

A filter narrows what the feed shows; all active filters AND together. Filter axes:

- Free-text query (search)
- Projects (multi-select)
- Teams (multi-select)
- Type (single)
- Type-specific attribute (single, available once a type filter is set)

Tags are not a filter axis here — filtering by tag is Obsidian's own search/tag pane, not something the plugin reimplements (see §9).

### Filter chips

Active filters appear as chips inside the command bar, to the left of the input: a briefcase-icon chip for projects, a people-icon chip for teams, and a colored-dot pill for type. Each chip is removable via its own × or by clicking it.

### Removing filters

- Click the × on a chip.
- Press `Backspace` in the command bar while the input is empty — removes the most recent filter, in priority order: project → team → type → type attribute.
- Run `/clear`.

### Clicking things

Clicking a pill on a card almost always filters — the one exception is task/design's `status` pill on an *expanded* card, which edits instead. Specifically:

- **Project or team pill:** clicking it adds it as an active project/team filter — on both collapsed and expanded cards.
- **Type badge:** clicking it sets it as the active type filter — on both collapsed and expanded cards.
- **Filterable-property pill, collapsed card** (task/design's `status`, meeting's `subtype`): clicking it applies that value as a filter.
- **Filterable-property pill, expanded card:** behavior depends on the type. Meeting's `subtype` pill still filters, same as collapsed — it has no edit affordance. Task/design's `status` pill instead cycles to the next status and saves immediately (see §4, §5.2) — it does not filter while the card is expanded.

This is the primary way users discover filtering — no query syntax to learn, just click.

---

## 9. Tags, projects, teams

### Tags

Logbook has no tag feature of its own. Tagging a note is done exactly the way it's done on any other note in the vault — Obsidian's built-in `tags` frontmatter property, inline `#tags` in the body, the Properties editor, the tag pane, and tag-aware search. The plugin doesn't read, write, display, or filter on tags anywhere; it simply never touches that property and leaves it entirely to Obsidian.

### Projects & teams

A note can belong to multiple projects and multiple teams; `projects[]`/`teams[]` hold arrays.

- Free-form, lowercase, hyphenated.
- Visible as chips on collapsed cards and as inline pickers on expanded cards.
- Picker: click opens a text input with autocomplete from existing values; type freely, `Enter` adds, `Backspace` on empty removes the last value.
- Visual distinction: briefcase-icon chip for projects, people-icon chip for teams — team chips set in italic to reinforce "who" vs. "what".

---

## 10. Collapse mode

A chevron action in the pane's title bar (added via `addAction`) toggles collapse mode:

- Each card shows only its type badge and title, one per line — no body preview, no meta.
- A second click restores the full view.
- Persists for the session; resets on reload.

---

## 11. Theming

The plugin has no theme of its own — it uses Obsidian's CSS variables throughout, so it automatically matches whatever theme (light, dark, or community) the user already has active. The only fixed colors are the per-type badge accents (gray/amber/dusty blue/muted plum/moss green/dusty violet), chosen to read clearly against both light and dark Obsidian themes.

---

## 12. Keyboard shortcuts

No shortcut in the plugin is a global, app-wide single-key capture — Obsidian has no per-view equivalent of a web page's "listen from anywhere," and a bare `T`/`?`/`/` grabbed globally would hijack normal typing in any other open note. Every shortcut below only fires while focus is already inside the relevant control (the command bar or an open card):

| Key | Action |
|---|---|
| `⌘ ↵` (or `Ctrl ↵`) | Save & collapse the open card (focus must be inside the card) |
| `Esc` | Discard unsaved changes & collapse the open card / clear the command bar (focus must be inside it) |
| `⌫` | Remove the most recent active filter (when the command bar has focus and is empty) |
| `↑ / ↓` | Navigate the command dropdown (when the dropdown is open) |
| `↵` | Run the selected command, or submit the search query (when the command bar has focus) |

The command bar itself is always visible at the bottom of the view, so opening it is just a click — no shortcut needed to summon it.

Inside any project/team input:

| Key | Action |
|---|---|
| `Enter` | Add the typed value |
| `,` | Add the typed value (alternate) |
| `Backspace` (input empty) | Remove the last added value |

---

## 13. Anti-features (on purpose)

- ~~Folders~~ — notes outside the configured logbook folder are untouched, and inside it there's no sub-foldering.
- ~~A duplicate file explorer or graph view~~ — the plugin doesn't reimplement what Obsidian's core views already do; it's a typed, filterable feed layered on top.
- ~~Sharing, comments, collaboration~~ — out of scope.
- ~~A nested note hierarchy~~ — flat by design.
- ~~A custom theme~~ — see §11; the plugin defers entirely to the user's installed Obsidian theme.
- ~~A tag manager~~ — tags are edited via Obsidian's own Properties panel, inline `#tags`, and tag pane; see §9. The plugin doesn't add a picker, chips, or a filter axis on top of them.
- ~~A second body renderer~~ — the feed only ever shows a plain-text preview, and only while collapsed; full markdown rendering happens once, in Obsidian's own editor/reading view, the moment a card is expanded and the note opens automatically (see §4, §6).

---

## 14. Quick visual vocabulary

- **Type badge** — colored dot + uppercase label. gray (draft), amber (task), dusty blue (meeting), muted plum (thoughts), moss green (knowledge), dusty violet (design).
- **Filterable-property pill** — a type's extra filterable attribute (see §2): `status` for task/design, `subtype` for meeting. Click behavior differs by type: `status` filters when the card is collapsed but cycles/edits when expanded; `subtype` always filters, in either state, and is never editable from the card.
- **Project chip** — briefcase icon + value, background-tinted; multiple per note.
- **Team chip** — people icon + value, italicised; multiple per note.
- **Active filter chips** — same shapes, filled with the accent color to signal "filtering by this".
- **Date dividers** — uppercase tracked-out label between two hairlines.
- **Collapse toggle** — a chevron view action in the pane's title bar; toggles title-only view.

A consistent rule: dots and icons prefix every chip so filter context is readable without relying on color.

---

## 15. Obsidian-specific implementation notes

- **`processFrontMatter`** is used for all frontmatter edits — Obsidian's official API for updating frontmatter without touching the body, with correct YAML serialization.
  > ⚠️ **Known risk:** Obsidian's forum has multiple open reports of `processFrontMatter` calls silently dropping or reverting changes when called rapidly/concurrently on the same file (e.g. deletes that leave empty frontmatter, or one call's result getting overwritten by an in-flight one). Save-on-close (§4) means a single card close only ever fires one batched `processFrontMatter` call plus, if the title changed, one rename — but switching between cards in quick succession (closing one to open another) still hits this API back-to-back on different notes, and a card can still be closed again moments after a previous close's write is still in flight. Calls touching the same file need to be serialized (queued one-at-a-time per file path) rather than fired independently — this needs a deliberate write-queue design, not just "call the API and trust it."
- **Save-on-close, not autosave** — while a card is expanded, every field edit (title, pills, type-specific fields) only mutates the in-memory note and the card's own DOM; nothing is queued to `processFrontMatter` until the card actually closes (§4). This means the write-queue/suppression machinery below only ever has to deal with one save per close, not one per keystroke.
- **Metadata cache** (`app.metadataCache`) is the source of truth for all frontmatter reads — filtering and rendering card metadata never touches disk directly; reads are synchronous and instant.
- **`file.stat.mtime` is the sort/display timestamp** — there's no frontmatter `updatedAt` to bump. `TFile.stat.mtime` already reflects every write to the file, whether it's a plugin-driven `processFrontMatter` call or a body edit made directly in Obsidian's native editor, so the feed's ordering and each card's relative-time pill (`2h`, etc.) just read it off the file the vault/metadata-cache events already keep current.
- **Refresh suppression** — after a `processFrontMatter` call, vault events fire immediately. The feed suppresses re-renders for 600 ms afterward so an open expanded card isn't torn down mid-edit.
- **Incremental feed rendering** — a refresh never tears down and rebuilds the whole card list. Each note's card is keyed by file path and cached; a render reuses a note's existing card DOM unchanged unless that note's own frontmatter/body/mtime actually differs from what's cached, and a card that's currently expanded is never rebuilt out from under the user regardless of what changed elsewhere — only dividers and the top-level ordering are recomputed each time. This means a write to one note (and the settle-triggered refresh ~600ms later) only ever touches that note's own card, not every card in the feed. The one exception: the relative-time pill's text is refreshed on every render pass even for a reused/cached card, since it's a function of wall-clock time rather than the note's own data — otherwise it would stay frozen at whatever it said ("now", say) the last time that card was actually rebuilt, even hours later.
- **No custom sync** — notes are plain `.md` files in the vault; whatever sync the user already has (iCloud, Obsidian Sync, git) handles them.
- **Trash, not delete** — destructive operations (draft auto-delete) use `app.vault.trash()`, respecting the vault's configured trash location rather than hard-deleting.
- **Settings tab** — exposes the configurable logbook folder path (default `logbook/`).
- **Live refresh** — the feed re-renders on vault file events and metadata-cache updates, so external edits (other plugins, sync, direct file edits) are reflected without a manual reload.
- **Icons** — project (briefcase) and team (people) pill icons use Obsidian's built-in `setIcon()` API against the Lucide icon set, the same mechanism the collapse-mode title-bar action already uses (see §10) — no custom inline SVG.
