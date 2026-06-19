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
- Obsidian's own `MarkdownRenderer` and theme system cover rendering and visual styling for free.

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
tags: []
projects: []              # free-form, lowercase-hyphenated; a note can belong to multiple
teams: []                 # same shape as projects, but for people/groups
createdAt: <ISO>
updatedAt: <ISO>
---
```

`updatedAt` is only bumped when content actually changes — re-opening and closing a note without edits doesn't reorder the feed.

`id` is a stable identifier minted on creation (a short random/UUID string). It's what notes like a task's `sourceNoteId` link back to — filenames and titles can change without breaking that link.

### The six note types

| Type | Extra fields | Badge color |
|---|---|---|
| **Draft** | *(none)* — auto-deleted 7 days after `createdAt` | warm gray |
| **Task** | `status: todo \| done \| suspended`, optional `sourceNoteId` | amber |
| **Meeting** | `subtype: standalone \| recurring`, `theme`, `attendees[]` + for recurring: `occurrences[]`; either subtype may carry `template` (filename reference) | dusty blue |
| **Thoughts** | `question`, `landed` | muted plum |
| **Knowledge** | `techStack[]` | moss green |
| **Design** | `status: exploring \| in-review \| decided` | dusty violet |

### Type-level filterable attributes

| Type | Additional filterable attribute |
|---|---|
| Task | `status` |
| Meeting | `theme` |
| Knowledge | `techStack` |
| Design | `status` |
| Thoughts | *(none)* |
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
- Sort key is each note's **latest activity timestamp**: `updatedAt` for most notes, but for a recurring meeting it's the date of its most recent occurrence.
- A newly created note always lands at the bottom of the feed, and the view scrolls to reveal it.
- Day groups: `Today`, `Yesterday`, `Wednesday`, `Wed, May 14`, `May 14, 2024`.

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
[badge] [proj1] [proj2] [+ project]          [▽] [2h]
Note title
Body preview — 2 lines, plain text…
#tag1  #tag2
```

- Type badge: colored dot + uppercase label.
- Status pill (tasks, design notes only): read-only here.
- Project chips inline in the top row; edit affordances (× buttons, add input) only appear once expanded.
- `done` tasks render with the title struck through and the card dimmed; `suspended` tasks dimmed further.
- Clicking anywhere on the card expands it. Clicking a `#tag`, project chip, team chip, or the type badge instead applies that as a filter (see §8) without expanding the card.

### Expanded

First click expands the card in place:

- Preview hides; chevron rotates.
- Full body renders via Obsidian's `MarkdownRenderer.render()` (the non-deprecated form — `renderMarkdown()` is deprecated), lazily on first expand, **read-only**. The body is never edited inline — see "Opening in Obsidian's editor" below. Each rendered card owns a `Component` whose `load()`/`unload()` the view manages explicitly; skipping this leaks event listeners (e.g. hover-preview on internal links) as cards expand/collapse and scroll in and out of the lazy-loaded window.
- Title becomes an editable input.
- Project/team/tag pickers become editable inline: chips with ×, free-text input with autocomplete, `Enter`/`,` to add, `Backspace` on an empty input removes the last value.
- Type-specific fields become editable inline: task/design status pill (click cycles to the next status and saves immediately), thoughts' `question`/`landed`, knowledge's `techStack`, meeting's `theme`/`attendees`.
- A **"New task from this note"** button: creates a new inline task note pre-filled with the source note's projects/teams/tags, a body line linking back to the source (generated via `app.fileManager.generateMarkdownLink()` so it respects the user's link-format settings, rather than a hardcoded `[[Title]]`), and `sourceNoteId` set to the source's `id`.
- Footer: hint text (`⌘↵ save / esc collapse`), tags row, and an **"Open note →"** button.
- `⌘↵` saves and collapses; `Esc` discards unsaved changes and collapses. Edits otherwise autosave 600 ms after typing settles, via `processFrontMatter` — there's no body write path from the expanded card at all.
- `updatedAt` is only bumped if content actually changed.

Second click on the card (outside an input) collapses it. Expanding a different card collapses whichever was open.

### Opening in Obsidian's editor

Editing the body is never done inline in the feed — only frontmatter fields (title, tags, projects, teams, type-specific fields) are editable on the expanded card. To write or change body content, the **"Open note →"** button opens the underlying `.md` file in Obsidian's native editor (a new tab or pane, per the user's normal Obsidian behavior — `Cmd`/`Ctrl`-click for a new pane). This sidesteps maintaining a second, separate text buffer for the same file: Obsidian's own editor is the single source of truth for body content, with its own autosave and pane-splitting.

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
- Created the same way as any other note type: inline at the bottom of the feed, via the `/task` (status `todo`) or `/done` (status `done`, for logging things already finished) commands, or the **"New task from this note"** button on any expanded card.
- Status pill: read-only on the collapsed card; in the expanded card, clicking it cycles `todo → done → suspended → todo` and saves immediately.
- `done` tasks: title struck through, card dimmed. `suspended` tasks: dimmed further.

### 5.3 Meeting

Notes from a conversation.

Common fields: `theme` (filterable), `attendees[]` (first names, shown inline on the card).

#### Standalone

- `subtype: standalone`. Body holds the entire set of notes from that one meeting.

#### Recurring

- `subtype: recurring`. Each occurrence is stored as a second-level heading (`## 2025-05-14`, ISO date) inside the single file's body, most recent first. `occurrences[]` in frontmatter mirrors those dates for fast indexing, but the `##` headings in the body are the canonical structure.
- Card subtype indicator: `N occurrences`, plus the date of the latest one.
- There is no inline occurrence UI on the card — expanding it shows the read-only body like any other note (see §4). Adding today's occurrence is a command, not a feed interaction: see **`/occurrence`** in §7.

#### Meeting templates

- A standalone or recurring meeting note may reference a **template** via a `template` frontmatter field (the template file's name).
- A template is a regular `.md` file with `type: template` in frontmatter, containing only a list of `###` headings with no body content.
- Creating a new occurrence (recurring) or a new meeting (standalone) with a template applies pre-fills the body with those headings as an empty scaffold.

### 5.4 Thoughts

An exploration of an idea or question.

- `question` — shown above the body on the card and as a dedicated input field when expanded.
- `landed` — optional takeaway/conclusion, shown as a "Where I landed" field below the body when expanded.
- The `/thoughts [question]` command pre-fills the `question` field.
- Badge color: muted plum.

### 5.5 Knowledge

Something worth remembering — a fact, snippet, quote, definition.

- `techStack[]` — optional list of technologies/concepts, filterable. Card shows a small uppercase `STACK` label alongside it.
- Badge color: moss green.

### 5.6 Design

Technical design of part of a project.

- `status`: `exploring`, `in-review`, or `decided`. Filterable.
- Badge color: dusty violet.

---

## 6. Markdown support

Bodies render through Obsidian's own `MarkdownRenderer`, so all of Obsidian's native markdown support — headings, bold/italic/strikethrough, inline code and fenced code blocks with syntax highlighting, lists and task checkboxes, blockquotes, GFM tables, links, and Obsidian-style callouts (`> [!note]`, `> [!tip]`, `> [!warning]`, `> [!info]`, `> [!quote]`) — is supported with no custom rendering work.

When a search/filter query is active, matching terms are wrapped in `<mark>` in both the collapsed card's body preview and the expanded card's rendered body.

---

## 7. The command bar (dock)

A single input at the bottom of the view, with two modes.

### Search mode (default)

- Free text is a search query: matches AND across whitespace-separated terms, checked against `title`, `body`, `tags`, `projects`, `teams`, and every type-specific field.
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

**`/occurrence [meeting]`** — adds today's occurrence to an *existing* recurring meeting, rather than creating a new note. Autocompletes against the titles of existing recurring meetings (`type: meeting`, `subtype: recurring`), the same fuzzy-matching dropdown used by `/project` and `/team`. On selecting one:

- If a `## <today's ISO date>` heading already exists in that note (checked against its `occurrences[]` frontmatter, no need to open the file), nothing is inserted — the command just opens the note with the cursor on that existing heading. This avoids duplicate headings if the command is run twice in a day.
- Otherwise, the plugin inserts a new `## <today's ISO date>` heading at the top of the body, above all existing occurrence headings, via `app.vault.process()` — an atomic read-modify-write against the file's current on-disk content, not a cached in-memory copy, so it can't clobber concurrent edits or desync from what's actually on disk. It then prepends today's date to `occurrences[]` via `processFrontMatter` (see §15 for the write-queue note on that API). These are two separate, sequential atomic writes, not one transaction.
- The note is then opened in Obsidian's native editor (a normal `leaf.openFile`), with the cursor placed on the blank line right under the new heading — ready for the user to type that occurrence's notes directly. This is the only way occurrence content gets added; there is no inline editor for it in the feed (see §4, §5.3).

**Filter commands** — apply a filter to the feed:

| Command | Effect |
|---|---|
| `/project [name]` | Filter by project; autocompletes from existing projects |
| `/team [name]` | Filter by team; autocompletes from existing teams |
| `/type [type]` | Filter by note type; autocompletes the six types. Selecting a type with a sub-attribute (task/design → status, meeting → theme, knowledge → techStack) advances to a second step listing that attribute's values (plus "— all"); types without one apply immediately |

**Other:**

| Command | Effect |
|---|---|
| `/clear` | Remove all active filters |

The dropdown fuzzy-matches by prefix as the user types. `Tab` selects the highlighted command; `↑`/`↓` navigate it; `Enter` runs the selected command (or submits the typed search query, in search mode); `Esc` cancels and clears the bar.

---

## 8. Filters

A filter narrows what the feed shows; all active filters AND together. Filter axes:

- Free-text query (search)
- Tags (multi-select)
- Projects (multi-select)
- Teams (multi-select)
- Type (single)
- Type-specific attribute (single, available once a type filter is set)

### Filter chips

Active filters appear as chips inside the command bar, to the left of the input: a hashtag-prefixed pill for tags, a folder-icon chip for projects, a people-icon chip for teams, and a colored-dot pill for type. Each chip is removable via its own × or by clicking it.

### Removing filters

- Click the × on a chip.
- Press `Backspace` in the command bar while the input is empty — removes the most recent filter, in priority order: tags → project → team → type → type attribute.
- Run `/clear`.

### Clicking things

- Clicking a `#tag` on a card adds it to the active tag filters.
- Clicking a project or team chip on a card adds it as an active project/team filter.
- Clicking a type badge on a card sets it as the active type filter.

This is the primary way users discover filtering — no query syntax to learn, just click.

---

## 9. Tags, projects, teams

### Tags

- Free-form, lowercase, hyphenated. Created on the fly by typing a new value in any tag input.
- The set of all tags is the union of every note's `tags[]`.
- Tag inputs autocomplete from existing tags.

### Projects & teams

A note can belong to multiple projects and multiple teams; `projects[]`/`teams[]` hold arrays.

- Free-form, lowercase, hyphenated.
- Visible as chips on collapsed cards and as inline pickers on expanded cards.
- Picker: click opens a text input with autocomplete from existing values; type freely, `Enter` adds, `Backspace` on empty removes the last value.
- Visual distinction: lab-icon chip for projects, people-icon chip for teams — team chips set in italic to reinforce "who" vs. "what".

---

## 10. Collapse mode

A chevron action in the pane's title bar (added via `addAction`) toggles collapse mode:

- Each card shows only its type badge and title, one per line — no body preview, no meta, no tags.
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

Inside any tag/project/team input:

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

---

## 14. Quick visual vocabulary

- **Type badge** — colored dot + uppercase label. gray (draft), amber (task), dusty blue (meeting), muted plum (thoughts), moss green (knowledge), dusty violet (design).
- **Status pill** — tasks and design notes only. Read-only on the collapsed card; editable (click to cycle) on the expanded card.
- **Project chip** — lab icon + value, background-tinted; multiple per note.
- **Team chip** — people icon + value, italicised; multiple per note.
- **Tag chip** — hashtag-prefixed pill.
- **Active filter chips** — same shapes, filled with the accent color to signal "filtering by this".
- **Date dividers** — uppercase tracked-out label between two hairlines.
- **Collapse toggle** — a chevron view action in the pane's title bar; toggles title-only view.

A consistent rule: dots, hashes, and icons prefix every chip so filter context is readable without relying on color.

---

## 15. Obsidian-specific implementation notes

- **`processFrontMatter`** is used for all frontmatter edits — Obsidian's official API for updating frontmatter without touching the body, with correct YAML serialization.
  > ⚠️ **Known risk:** Obsidian's forum has multiple open reports of `processFrontMatter` calls silently dropping or reverting changes when called rapidly/concurrently on the same file (e.g. deletes that leave empty frontmatter, or one call's result getting overwritten by an in-flight one). The status pill (click-to-cycle, saves immediately), the 600ms autosave, and rename-on-title-change can all hit this API back-to-back on the same note. Calls touching the same file need to be serialized (queued one-at-a-time per file path) rather than fired independently — this needs a deliberate write-queue design, not just "call the API and trust it."
- **Metadata cache** (`app.metadataCache`) is the source of truth for all frontmatter reads — filtering and rendering card metadata never touches disk directly; reads are synchronous and instant.
- **Refresh suppression** — after a `processFrontMatter` call, vault events fire immediately. The feed suppresses re-renders for 600 ms afterward so an open expanded card isn't torn down mid-edit.
- **No custom sync** — notes are plain `.md` files in the vault; whatever sync the user already has (iCloud, Obsidian Sync, git) handles them.
- **Trash, not delete** — destructive operations (draft auto-delete) use `app.vault.trash()`, respecting the vault's configured trash location rather than hard-deleting.
- **Settings tab** — exposes the configurable logbook folder path (default `logbook/`).
- **Live refresh** — the feed re-renders on vault file events and metadata-cache updates, so external edits (other plugins, sync, direct file edits) are reflected without a manual reload.
