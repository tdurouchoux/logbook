# Logbook — product spec

A markdown notes app that replaces folder hierarchies with **a chat-style feed of typed notes**. You write into the bottom of the page; your past lives stacked above you. Tags, projects, teams, and types do the work that folder trees usually do.

---

## 1. Guiding principles

- **No tree.** The app never asks "where does this go?" before letting you write. Categorisation is lazy and applied after capture.
- **Markdown files are canonical.** Every note is a `.md` file with YAML front matter. The UI is a view onto that file; it never holds state the file can't represent.
- **The bottom of the screen is the active surface.** The composer and the most recent note both sit in the user's eye-line.
- **A note isn't a blob.** A note has a *type*, and each type has its own structure that the UI surfaces — at-a-glance in the feed, and as dedicated fields in the editor.
- **Opinionated defaults.** Sensible structure ships with the type — the user adds detail, never scaffolding.

---

## 2. The feed

### Layout

- A single centred column, comfortably under reading width (~700–760 px).
- A small header at the top: brand wordmark, active filter chips, theme toggle, shortcuts.
- A **todo task count indicator** at the very top of the main page shows the number of tasks with status `todo`. Clicking it applies a filter showing only `todo` tasks. The count updates in real time.
- A scrollable feed in the middle.
- A bottom "dock" containing the command bar, the main interface of the app.

### Order

- **Chronological, with newest at the bottom.** On load, the feed is scrolled to the bottom.
- **Pinned notes** appear in a separate section at the bottom of the page, under the chronological section, under a "Pinned" divider.
- The chronological section is grouped by day with dividers (`Today`, `Yesterday`, `Wednesday`, `Wed, May 14`, `May 14, 2024`).
- Sort key is the **latest activity** of each note — the full timestamp, not just the calendar day. For a recurring meeting, that's its most recent occurrence date; for everything else, the `updatedAt` field. Within a day, notes are ordered by time of day.
- A newly created note always lands at the very bottom of the chronological section — directly above the Pinned section — and the feed scrolls to reveal it.

### History loading

- Notes older than one month are **not displayed on initial load**.
- When the user scrolls to the top of the visible feed and the top is reached, older notes are loaded automatically (infinite scroll upward).
- A subtle loading indicator appears while older notes are being fetched.

### Empty state

When filters yield no results, show a quiet message describing the filter and a hint to type `/` to create one or to clear filters. When no notes exist at all, show a friendly invitation to start writing.

---

## 3. Notes — common model

Every note, regardless of type, has:

- `id` — a stable note identifier
- `type` — one of `draft`, `task`, `meeting`, `thoughts`, `knowledge`, `design`
- `title` — short headline
- `body` — markdown source
- `tags[]` — lowercase, hyphenated, free-form
- `projects[]` — list, optional, free-form (lowercase); a note can belong to multiple projects
- `teams[]` — list, optional, free-form (lowercase); a note can belong to multiple teams
- `createdAt`, `updatedAt` — ISO timestamps
- `pinned` — boolean

**Update date behaviour:** when an existing note is saved without any content modification (e.g. re-opened and immediately saved), `updatedAt` is not changed.

Plus type-specific fields described below.

The on-disk representation is a markdown file with these fields in YAML front matter, followed by the body. The markdown file name is a formatted version of the title (UNIX compatible, spaces replaces by underscores, normalization of special characters ) : "<formatted_title>.md". If the markdown title already exists, a _<number> is added as suffix to the formatted title.

---

## 4. The six note types

Each type has its own colored badge shown in the feed and the editor, plus structure that's visible at a glance.

### Type-level filtering with additional attributes

Each type exposes one or more **additional attributes** that can be used as filter sub-axes. These attributes appear as a second filter step when `/type` is chosen, and as clickable values in note cards.

| Type | Additional filterable attributes |
|---|---|
| Task | `status` (`todo`, `done`, `suspended`) |
| Meeting | `theme` |
| Thoughts | *(none)* |
| Knowledge | `tech stack` |
| Design | `status` |
| Draft | *(none)* |

### 4.1 Draft

Quick unstructured capture. The catchall when no other type fits.

- No extra fields beyond the common model.
- Badge color: warm gray.
- **Draft notes are automatically deleted after 7 days.** Deletion is checked at app startup; any draft whose `createdAt` is more than 7 days ago is removed without prompting.

### 4.2 Task

An action with a state.

- `status` — one of `todo`, `done`, `suspended`.
- Badge color: amber.
- The status appears as a **read-only pill** in the feed. Status can be changed in the quick-add popover, the inline editor, or focus mode.
- `done` tasks render with the title struck through and the card visually dimmed.
- `suspended` tasks are dimmed further.

**Quick-add (the primary way to make a task).** Tasks are created through a small floating **quick-add popover** — not a full inline feed note. It holds just a title field, a status pill, project/team pickers, and a tag input; `⌘↵` adds it, `esc` cancels. The new task is appended to the bottom of the feed. The popover is opened by:

- the **+ Task** button in the dock,
- the **`T`** keyboard shortcut,
- the `/task` and `/done` commands (the latter pre-sets status `done`),
- the **"New task from this note"** action in any saved note's editor — which prefills the source's projects/teams/tags and links back to it (`sourceNoteId` + a `→ from [[…]]` body line).

Other note types (draft, meeting, thoughts, knowledge, design) are still created as full inline notes in the feed; only tasks use the quick-add popover.

### 4.3 Meeting

Notes from a conversation. 

Common meeting fields:

- `theme` — broader category ("Design", "Product sync"); filterable
- `attendees[]` — first names, displayed inline

The feed card shows: type badge, subtype indicator, theme, attendees, and a preview of the most recent body.

#### Standalone meeting

- `subtype: "standalone"`
- `body` holds the entire set of notes from that one meeting.
- Badge subtype indicator: `standalone`.

#### Recurring meeting

- `subtype: "recurring"`
- **The on-disk representation stores each occurrence as a second-level heading (`##`) inside the single markdown file.** The heading text is the ISO date of the occurrence (e.g. `## 2025-05-14`). The body of each occurrence follows its heading.
- In the YAML front matter, occurrences are still tracked as `occurrences[]` for indexing, but the canonical body in the `.md` file uses the `##` heading structure.
- Badge subtype indicator: `N occurrences`.
- When opened, the editor shows a row of date tabs across the top, latest first, with a "latest" label on the first one. Switching tabs reveals each occurrence's body in the editor. A **`+ new`** button creates a new occurrence dated today (adds a new `##` heading) and selects it.

#### Meeting templates

- A recurring or standalone meeting note can optionally reference a **template**.
- A template consists only of a list of headings (`###` titles), with no body content.
- When a new occurrence is created (recurring) or a new meeting is created (standalone) with a template applied, the body is pre-filled with those headings as an empty scaffold.
- Templates are stored as regular `.md` files with `type: template` in front matter.

### 4.4 Thoughts

An exploration of an idea or question.

- `body` — the working-through
- `landed` — optional takeaway / conclusion

The feed card shows the question above the body preview; the editor has dedicated input fields for question and "Where I landed" (above and below the body, respectively).

The `/thoughts [question]` command pre-fills the `question` field.

Badge color: muted plum.

### 4.5 Knowledge

Something worth remembering — a fact, snippet, quote, definition.

- `tech stack` — optional reference to a **list** of technologies or concepts; filterable

The feed card shows a small uppercase `STACK` label next to the source. Badge color: muted moss.

### 4.6 Design

Technical design of a part of a whole project.

- `status` — one of `exploring`, `in-review`, `decided`; filterable

Badge color: dusty violet.

---

## 5. Markdown support

The body of every note is markdown. The reading view renders it fully; editing switches to a raw textarea.

Supported:

- Headings (h1–h4)
- Bold, italic, strikethrough
- Inline code, fenced code blocks (with light syntax highlighting for the common families)
- Unordered, ordered, and task lists (checkboxes render as styled boxes)
- Blockquotes (italic serif)
- Tables (GFM)
- Links
- **Obsidian-style callouts:** `> [!note]`, `> [!tip]`, `> [!warning]`, `> [!info]`, `> [!quote]` — each rendered as a tinted block with an icon

Inline highlighting wraps search-query matches in a `<mark>` while a filter is active.

---

## 6. Editing flow

A note has three states in the UI: **read mode in the feed**, **inline editor in the feed**, and **focus mode** (full-screen, opens in a new window).

### Read mode (the feed card)

Compact, type-aware (see §4). Body shown as a 3-line plain-text preview. Hover reveals pin and delete icons.

### Inline editor (replaces the card on click)

When the user clicks a note, the card morphs into an editor in the same slot. The editor opens in **preview mode**:

- Title is editable.
- Body is rendered markdown.
- Tags, projects, teams, and type-specific fields are all editable inline.

Clicking the rendered body, or hitting the pencil/eye toggle, switches to **edit mode**: body becomes a monospace markdown textarea. Toggling again returns to preview.

Both modes share an editor chrome:

- **Top row**: type badge, status pill (tasks — editable here), project chips, team chips.
- **Mid section**: title; type-specific extras (question + landed for thoughts; source for knowledge; theme/attendees/occurrences for meetings).
- **Body**: preview or textarea.
- **Tags row**: existing tags plus a free-form input — Enter or comma to add, Backspace on empty removes the last.
- **Action bar**: hint text (`⌘↵ save / esc cancel`), and on the right: preview/edit toggle, raw source toggle (`{ }`), focus-mode button, delete (existing notes only), Cancel, Save.
- **"New task from this note"** action available in the action bar for all note types.

The **raw source toggle** shows the canonical `.md` representation — YAML front matter plus body — so the user can see exactly how the note is stored.

### Focus mode (full-screen, new window)

Triggered from any editor's expand button. Opens in a **new browser window** (or OS window in desktop apps). Provides the same interactions as the feed (clicking tags filters, clicking project/team chips filters, status pill is editable, etc.).

A clean, full-viewport editor with:

- A thin top bar: back/close button, type badge, autosave status indicator, keyboard hint.
- A wide page-like area: tag input, large display title, markdown textarea.
- Autosaves every 600 ms after changes settle.
- `Esc` or `⌘↵` exits back to the feed and commits.

For a recurring meeting, focus mode show all occurences (full markdown)

### Saving semantics

- Inline editor: explicit Save / Cancel. Cancel discards unsaved changes.
- Focus mode: autosaves continuously. Closing always commits.
- **When an existing note is saved without any modifications, `updatedAt` is not changed.**
- For new notes opened from a `/` command (see §7), the editor opens directly in edit mode pre-filled with whatever the user typed after the command.

---

## 7. The command bar

The big input at the bottom of the page. It has two modes determined by what the user types.

### Search mode (default)

- Free text → full-text search across `title`, `body`, `tags`, `projects`, `teams`, and every type-specific field.
- Search is AND across whitespace-separated terms.
- Active matches are highlighted in note previews.
- When filters are active, the bar shows the filter chips on the left of the input.

### Command mode (`/`)

Typing a leading `/` switches the bar into command mode: monospace font, accent-colored, and a dropdown menu appears above with arrow-key navigation. Pressing `/` from anywhere on the page focuses the bar and opens the menu.

**Creation commands** — `/task` and `/done` open the **quick-add task popover** (see §4.2); all other creation commands open a new note inline at the bottom of the feed, pre-filled with the rest of the typed text:

| Command | Effect |
|---|---|
| `/draft [title]` | New draft |
| `/task [title]` | Quick-add a task with status `todo` (opens the popover) |
| `/done [title]` | Quick-add a task with status `done` (for logging things already done) |
| `/meeting [title]` | New standalone meeting |
| `/recurring [title]` | New recurring meeting with one initial occurrence dated today |
| `/thoughts [title]` | New thoughts note with the title pre-filled |
| `/knowledge [title]` | New knowledge note |
| `/design [title]` | New design note |

**Filter commands** — apply a filter to the feed:

| Command | Effect |
|---|---|
| `/project [name]` | Filter by project; offers autocomplete from existing projects |
| `/team [name]` | Filter by team; offers autocomplete from existing teams |
| `/type [type]` | Filter by note type; offers autocomplete from the six types; a second step allows filtering by that type's additional attributes (e.g. Task → status, Meeting → theme) |

**Other:**

| Command | Effect |
|---|---|
| `/clear` | Remove all active filters |

The menu fuzzy-matches command names by prefix. Hitting `tab` select the currently matching command. For filter commands, a second step appears where the user picks the value from a suggestion list. For `/type`, **selecting a type that carries a sub-attribute (task → status, design → status, meeting → theme, knowledge → tech stack) advances the menu to a second step** listing that attribute's values (plus a "— all" option to apply only the type filter); types without a sub-attribute apply immediately. Both the type and the chosen attribute show as separate chips in the command bar.r types a free value).

When a new note is created via a command, the feed scrolls to the bottom so the editor is in view, and a date divider labeled "Writing a [type]" appears above it.

---

## 8. Filters

A filter narrows what notes the feed shows. All filters AND together. Filter axes:

- Free-text query (search)
- Tags (multi-select)
- Projects (multi-select)
- Teams (multi-select)
- Type (single)
- Type-specific attribute (single, available after a type filter is set — e.g. Task status, Meeting theme)

### Filter chips

Active filters appear as chips in two places:

- **Inside the command bar**, to the left of the input. Each chip has its own visual: hashtag-prefixed pill for tags, folder-icon chip for project, people-icon chip for team, colored dot pill for type. Each is removable with a small × button or by clicking it.

### Removing filters

- Click the × on a chip
- Press `Backspace` in the command bar while the input is empty (removes the most recent filter, in priority order: tags → project → team → type → type attribute)
- Use `/clear`

### Clicking things

- Clicking a `#tag` on a note adds it to the active tag filters.
- Clicking a project chip or team chip on a note adds that as an active project/team filter.
- Clicking a type badge on a note sets that as the active type filter.
- Clicking the **todo task count** in the top bar filters to tasks with status `todo`.

This is the primary way users discover filtering — they never *learn* a query syntax, they just click.

---

## 9. Tags, projects, teams

### Tags

- Free-form, lowercase, hyphenated.
- Created on the fly by typing a new value in any tag input.
- The set of all tags is derived from the union of every note's tags.
- Tag input has autocomplete from existing tags as the user types.
- Tags appear in feed cards and in the editor.

### Projects & teams

A note can belong to **multiple projects** and **multiple teams**. The `projects[]` and `teams[]` fields in front matter hold arrays.

- Free-form, lowercase, hyphenated.
- Visible as chips in feed cards and as inline pickers at the top of every editor.
- Editor inline picker: clicking opens a small text input with autocomplete from existing values; type freely and press Enter to add a value; Backspace on empty removes the last added value.
- The visual distinction in the UI: lab icon for project chips, people icon for team chips, with the team chips set in italic to reinforce that it's about *who*, not *what*.

---

## 10. Collapse mode

A **collapse button** (chevron icon, top-right of the feed header) toggles the feed into **collapse mode**.

- In collapse mode, each note card displays only its title (and type badge), one per line — no body preview, no meta, no tags.
- A second click on the button restores the full feed view.
- Collapse mode persists across navigation within the session but resets on reload.

---

## 11. Pinning

Any note can be pinned via its hover action. Pinned notes appear in a dedicated section labeled "Pinned" under the chronological feed. A thin accent-colored vertical bar runs down the left edge of pinned cards.

---

## 12. Theming

- **Light mode** — warm off-white paper, warm near-black ink. Soft beige borders. A faint paper-grain texture.
- **Dark mode** — warm near-black paper, warm off-white ink. The same accent + type colors apply, lightened for contrast.
- Toggle is in the header (sun/moon). The choice is remembered.

---

## 13. Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Open the command bar (from anywhere) |
| `?` | Open the shortcuts overlay |
| `⌘ ↵` (or `Ctrl ↵`) | Save & close in any editor / focus-mode |
| `Esc` | Cancel an inline editor / exit focus mode / clear the command-bar input |
| `⌫` | Remove the last active filter (when the command-bar input is empty) |
| `↑ / ↓` | Navigate the command menu |
| `↵` | Run the selected command |

Inside any editor:

| Key | Action |
|---|---|
| `Enter` | Add a tag (when focus is in the tag input) |
| `,` | Add a tag (alternate) |

---

## 14. Anti-features (on purpose)

- ~~Folders~~
- ~~A right-side or left-side sidebar~~ — the feed gets the full reading column
- ~~Sharing, comments, collaboration~~ — out of scope for v1
- ~~A nested note hierarchy~~ — flat by design

---

## 15. Quick visual vocabulary

- **Type badge** — a pill with a colored dot + uppercase label. Per type: gray (draft), amber (task), dusty blue (meeting), muted plum (thoughts), moss green (knowledge), dusty violet (design).
- **Status pill** — only on tasks and design notes. Read-only in the feed; editable only in the inline editor or focus mode.
- **Project chip** — folder icon + value. Background-tinted. Multiple chips per note.
- **Team chip** — people icon + value, italicised. Multiple chips per note.
- **Tag chip** — hashtag-prefixed pill.
- **Active filter chips** — same shapes, filled with the accent colour to signal "filtering by this".
- **Date dividers** — uppercase tracked-out 10.5 px label between two hairlines.
- **Recurring occurrence tabs** — pill row with the latest tab outlined in accent and labeled "latest".
- **Todo count indicator** — a small ambient badge at the top of the main page showing the number of `todo` tasks; clickable to filter.
- **Collapse button** — chevron icon at the top-right of the feed header; toggles title-only view.

A consistent rule: **dots, hashes, and icons prefix every chip** so the user can read filter context at a glance without colour vision.
