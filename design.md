# Logbook — Obsidian plugin design

A personal note-taking plugin that replaces folder hierarchies with a **chat-style feed of typed notes**, living directly inside your Obsidian vault.

---

## Why a plugin, not a standalone app

The core Logbook idea maps almost perfectly onto Obsidian's architecture:

- Notes are already `.md` files with YAML frontmatter — no custom format needed
- Obsidian's metadata cache indexes every frontmatter field instantly, making filtering free
- Sync, backup, and version control are already solved (iCloud, Obsidian Sync, git)
- `[[wikilinks]]` in note bodies connect Logbook notes to the rest of the vault
- Other plugins (Dataview, Tasks, Templater) can query your Logbook notes by frontmatter

The trade-off: the UI lives inside Obsidian's constraints rather than a clean browser context. Custom views are capable enough that this is acceptable.

---

## Guiding principles

- **No tree.** The plugin never asks "where does this go?" before letting you write. The feed is the only interface.
- **Markdown files are canonical.** Every note is a `.md` file with YAML frontmatter. The plugin is a view onto the vault — it holds no state the file can't represent.
- **Capture first.** Plain text in the bar → draft. Categorisation is optional and lazy.
- **A note has a type.** Each type has its own structure that the UI surfaces at a glance.
- **Scoped to one folder.** The plugin watches a configurable folder (default: `logbook/`). Notes outside it are untouched.

---

## Data model

Every note is a `.md` file in the logbook folder. The filename is a slug derived from the title (`my_note.md`, with `_2` suffix on collision).

### Common frontmatter fields

```yaml
---
type: draft          # one of the six types below
title: "Note title"
tags: []
projects: []         # free-form, lowercase-hyphenated; a note can belong to multiple
teams: []            # same shape as projects, but for people/groups
createdAt: <ISO>
updatedAt: <ISO>
pinned: false
---
```

`updatedAt` is only bumped when content actually changes — re-opening and closing a note doesn't reorder the feed.

### The six note types

| Type | Extra fields | Badge color |
|---|---|---|
| **Draft** | *(none)* — auto-deleted 7 days after `createdAt` | warm gray |
| **Task** | `status: todo \| done \| suspended` | amber |
| **Meeting** | `subtype: standalone \| recurring`, `theme`, `attendees[]` + for recurring: `occurrences[]` | dusty blue |
| **Thoughts** | `prompt`, `landed` | muted plum |
| **Knowledge** | `techStack[]` | moss green |
| **Design** | `status: exploring \| in-review \| decided` | dusty violet |

---

## Feed

The plugin registers a full-width tab view. Layout is a flex column:

```
┌──────────────────────────────────┐
│  Feed (scrollable, flex:1)       │
│  Oldest at top, newest at bottom │
│  Grouped by day with dividers    │
├──────────────────────────────────┤
│  Dock (command bar)              │
└──────────────────────────────────┘
```

- On open, the feed is scrolled to the bottom.
- Notes are sorted ascending by `updatedAt` (oldest top, newest bottom).
- Day groups: `Today`, `Yesterday`, `Wednesday`, `Wed, May 14`, `May 14, 2024`.
- **Pinned notes** appear in a separate section at the very bottom of the feed, below the chronological section, under a "Pinned" divider.

### Note card (collapsed)

```
[badge] [proj1] [proj2] [+ project]          [▽] [2h]
Note title
Body preview — 2 lines, plain text…
#tag1  #tag2
```

- Type badge: colored dot + uppercase label.
- Project chips live inline in the top row. Edit controls (× buttons, input) appear only when expanded.
- Click anywhere → expand.

### Note card (expanded)

First click expands the card in place:
- Preview hides; chevron rotates.
- Full body renders via Obsidian's `MarkdownRenderer` (lazy — only on first open).
- Project picker becomes editable inline.
- Footer: tags + **"Open note →"** button.

Second click collapses. Clicking a different card collapses the current one.

---

## Command bar (dock)

A single input at the bottom of the view.

**Default mode** — free text becomes the title of a new draft on `Enter`.

**Command mode** — typing `/` switches the bar: monospace font, accent color, dropdown rises above.

| Command | Effect |
|---|---|
| `/draft [title]` | New draft note |
| `/task [title]` | New task (status: `todo`) |
| `/meeting [title]` | New standalone meeting |
| `/recurring [title]` | New recurring meeting |
| `/thoughts [title]` | New thoughts note |
| `/knowledge [title]` | New knowledge note |
| `/design [title]` | New design note |

The dropdown filters by prefix as you type. Arrow keys + `Enter`/`Tab` to select; `Esc` to cancel. After selecting a type, the bar stays active to receive the title — `Enter` creates the note.

---

## Implementation status

### ✅ Done

- Custom `ItemView` registered as a full-width tab
- Feed: chronological, day-grouped, scroll-to-bottom on open
- Note cards: type badge (dot + label), project chips, body preview, tags, relative time
- 2-step card: collapse → expand with rendered markdown + "Open note →" button
- Inline project picker: add/remove with autocomplete, saves via `processFrontMatter`
- Command bar: `/type title` creation, plain text → draft, animated dropdown
- Frontmatter-based file creation with all common fields
- Settings tab: configurable logbook folder
- Live feed refresh on vault changes (vault events + metadata cache)

### 🔲 Filtering and search

The command bar doubles as a search/filter bar when not in command mode.

- **Free-text search**: AND across title, body, tags, projects, teams, type-specific fields. Matches highlighted in card previews.
- **Filter commands**:
  - `/project [name]` — filter by project (autocomplete from existing)
  - `/team [name]` — filter by team
  - `/type [type]` — filter by note type; types with sub-attributes (task→status, design→status, meeting→theme, knowledge→techStack) advance to a second step
  - `/clear` — remove all active filters
- Active filters shown as chips inside the command bar, each removable with ×.
- `Backspace` on empty bar removes the most recent filter.
- Clicking a tag, project chip, or type badge on a card applies that as a filter.

### 🔲 Inline editing

Edit a note without opening it in Obsidian's editor:

- In expanded mode, title becomes an editable input.
- Body switches between rendered preview and a `textarea` (toggle or click-to-edit).
- Tags: same add/remove UX as the project picker (Enter or comma to add, Backspace to remove).
- Teams: same as project picker.
- Type-specific fields editable inline (task status, design status, thoughts prompt/landed, knowledge techStack).
- Save on `⌘↵`; cancel on `Esc`. Autosaves after 600ms idle for expanded cards.
- `updatedAt` only bumped if content actually changed.

### 🔲 Tags editing (inline)

Same pattern as the project picker — already in the card header, chips with ×, input with autocomplete from all tags in the vault.

### 🔲 Task status toggle

- Status pill shown on task cards (and design cards): `todo`, `done`, `suspended`.
- **Read-only** in collapsed cards.
- **Editable** in expanded cards — clicking the pill cycles to the next status and saves immediately.
- `done` tasks: title struck through, card dimmed.
- `suspended` tasks: dimmed further.

### 🔲 Todo count indicator

A small ambient counter in the feed header showing the number of `type === 'task' && status === 'todo'` notes. Clicking it applies a task/todo filter.

### 🔲 Pin / unpin

- Hover a card → pin icon appears (top-right).
- Clicking pins the note: `pinned: true` written to frontmatter.
- Pinned notes move to the "Pinned" section at the bottom of the feed.
- Pinned cards get a thin accent-colored left border.

### 🔲 Draft auto-delete

On plugin load, any `type: draft` note whose `createdAt` is more than 7 days ago is moved to Obsidian's trash (respects the vault's trash setting — no hard delete).

### 🔲 History horizon (infinite scroll up)

- On initial load, only notes from the last month are shown.
- A sentinel at the top of the feed: when scrolled into view, loads one more month of notes.
- When a filter is active, the horizon is lifted — search spans the full vault.

### 🔲 Collapse mode

A chevron button in the feed header toggles **title-only mode**: each card shows only its type badge and title, one line, no preview. Useful for scanning a long feed quickly. Persists for the session.

### 🔲 Recurring meetings

- `subtype: recurring` notes store each occurrence as a `## YYYY-MM-DD` heading in the body.
- Expanded card shows a row of date tabs (latest first, labeled "latest"), one tab per occurrence.
- A `+ new` button creates today's occurrence and selects it.
- Tab switching reveals that occurrence's body.

### 🔲 Focus mode

Triggered from the "Open note →" button (or a dedicated expand icon). Opens the note in Obsidian's editor, but could alternatively open a full-screen modal within the plugin view for distraction-free editing with autosave.

### 🔲 Keyboard shortcuts

| Key | Action |
|---|---|
| `T` | Open quick-add task (when not typing in a field) |
| `?` | Open shortcuts overlay |
| `⌘↵` | Save in inline editor |
| `Esc` | Cancel / collapse expanded card / clear command bar |
| `⌫` | Remove last active filter (when command bar is empty) |

---

## Obsidian-specific decisions

**`processFrontMatter`** is used for all frontmatter edits — it's Obsidian's official API for updating frontmatter without touching the body, and it handles YAML serialization correctly.

**Metadata cache** (`app.metadataCache`) is the source of truth for all frontmatter reads — no file I/O needed for filtering or displaying metadata. Reads are synchronous and instant.

**Refresh suppression**: after a `processFrontMatter` call, vault events fire immediately. The feed suppresses re-renders for 600ms to avoid destroying the DOM while the user is still interacting with an editable field.

**No custom sync**: notes are `.md` files in the vault — whatever sync the user has (iCloud, Obsidian Sync, git) handles them automatically.

**Trash, not delete**: destructive operations (draft auto-delete) use `app.vault.trash()` so files go to Obsidian's configured trash location, not to `/dev/null`.
