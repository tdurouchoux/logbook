# Handoff: Logbook — type-aware chat-style notes app

## Overview

**Logbook** is a personal note-taking app that replaces folder hierarchies with a single **chat-style feed of typed notes**. The user writes into a command bar at the bottom; notes stack chronologically (newest at the bottom, like a chat transcript). Every note has a **type** that drives both its display and its editor form. Categorization is *lazy* — capture first, tag/file later (or never). Retrieval is handled by tags, projects, teams, and a `/` command bar, never by folders.

The core experience:
- A scrolling **feed** of notes grouped by day, newest at the bottom; the feed opens scrolled to the bottom.
- A bottom **dock** with a "+ Task" quick-add button and a `/` **command bar** that does both search/filtering and note creation.
- Six note **types**, each with its own structure: Draft, Task, Meeting, Thoughts, Knowledge, Design.
- Inline editing (click a card to edit in place) and a full-screen **focus mode**.
- A **Tweaks** panel exposing visual variants (voice / cadence / detail).

---

## About the Design Files

The files in `src/` are a **design reference created in HTML/React-via-Babel** — a working prototype that demonstrates the intended look, layout, and behavior. **They are not meant to be shipped or copied verbatim.** They load React + Babel from a CDN and transpile JSX in the browser, which is fine for a prototype but not for production.

Your task is to **recreate this design in the target codebase's environment**, using its established patterns, component library, state management, and build tooling. If there is no existing app yet, choose an appropriate stack (the prototype is React-flavored, so React + TypeScript + a real bundler like Vite is a natural fit, but any framework works — the design is framework-agnostic).

Treat `src/` as the source of truth for **visual detail and interaction behavior**, and `SPEC.md` as the source of truth for **product requirements and edge cases**. Where the two ever disagree, `SPEC.md` wins.

## Fidelity

**High-fidelity.** The prototype has final colors, typography, spacing, shadows, radii, and fully worked-out interactions. Recreate the UI pixel-faithfully using the codebase's libraries. All design tokens are enumerated below and defined as CSS custom properties at the top of `src/styles.css`.

---

## File map (`src/`)

| File | Role |
|---|---|
| `index.html` | Entry point. Loads fonts (IBM Plex families + others for Tweaks voices), React/Babel, then the scripts below. Holds the `TWEAK_DEFAULTS` block. |
| `styles.css` | All styling + design tokens (CSS custom properties). ~1785 lines. The canonical token source. |
| `note-types.js` | **Data model.** Defines the 6 note types, task/design statuses, meeting subtypes, the per-type filterable attributes, the `createNote()` factory, and helpers (`latestActivity`, `noteMatchesQuery`, `notePreviewBody`, `titleToFilename`). Start here. |
| `components.jsx` | All React components: `Icon`, `Tag`/`TagInput`, `TypeBadge`, `StatusPill`, `ProjectChip`/`TeamChip`, `PtMultiPicker`, `NoteCard`, `InlineEditor`, `FocusMode`, `CommandBar`, `Header`, `QuickAddTask`. |
| `app.jsx` | App shell: state, filtering, day-grouping/sorting, feed scroll management, create/save/delete/pin, quick-add task, keyboard shortcuts, the Tweaks wiring, and the Shortcuts modal. |
| `seed.js` | Demo data (~20 notes across all types). Useful to understand the data shape; replace with real persistence. |
| `markdown.js` | Thin wrapper over `marked` for rendering note bodies + custom callout (`> [!note]`) handling. |
| `tweaks-panel.jsx` | Prototype-only tweak panel host. **Not part of the product** — it's the mechanism that powers the visual-variant explorer. You can drop it entirely, or keep one chosen variant. |

---

## Data model

A note is a plain object. Common fields on every note:

| Field | Type | Notes |
|---|---|---|
| `id` | string | stable id (uuid in prototype) |
| `type` | `'draft' \| 'task' \| 'meeting' \| 'thoughts' \| 'knowledge' \| 'design'` | drives display + editor |
| `title` | string | short headline |
| `body` | string | markdown source |
| `tags` | string[] | free-form, lowercase, hyphenated |
| `projects` | string[] | a note can belong to **multiple** projects |
| `teams` | string[] | a note can belong to **multiple** teams |
| `createdAt`, `updatedAt` | ISO string | |
| `pinned` | boolean | |
| `sourceNoteId` | string \| null | set when a task was spun off "from this note" |

Per-type extra fields:

| Type | Extra fields |
|---|---|
| **Draft** | *(none)* — auto-deleted 7 days after `createdAt` |
| **Task** | `status: 'todo' \| 'done' \| 'suspended'` |
| **Meeting** | `subtype: 'standalone' \| 'recurring'`, `theme`, `subject`, `attendees[]`, and for recurring: `occurrences[]` of `{ date, body, attendees[] }` (newest at index 0) |
| **Thoughts** | `prompt`, `landed` |
| **Knowledge** | `techStack[]` (e.g. `['postgres','rocksdb']`) |
| **Design** | `status: 'exploring' \| 'in-review' \| 'decided'` |

**`latestActivity(note)`** = sort key. For a recurring meeting it's the most recent occurrence date; otherwise `updatedAt`. The feed sorts ascending by this **full timestamp** (not just calendar day).

**Update-date rule:** saving an existing note **without content changes** does NOT bump `updatedAt` (so re-opening + closing a note doesn't reorder the feed). See `saveNote` in `app.jsx`.

**Draft auto-delete:** on app startup, any `draft` whose `createdAt` is > 7 days ago is removed silently (no pinned exemption). See `initialNotes` in `app.jsx`.

---

## Screens / Views

### 1. Main feed (the whole app)

A single full-viewport CSS grid, `grid-template-rows: auto minmax(0,1fr) auto` at `height: 100dvh`:

- **Row 1 — Header** (`auto`)
- **Row 2 — Feed** (`minmax(0,1fr)`, the only scroll container) — **the `minmax(0,…)` is required**, or the track grows to fit content and the window scrolls instead of the feed.
- **Row 3 — Dock** (`auto`)

The feed content is centered in a column: `max-width: 760px` (`--feed-max`), horizontal padding `28px` (`--feed-pad`).

#### Header (height ~67px, padding `0 20px`, bottom border `--divider`, a translucent backdrop)
Three zones, space-between:
- **Left — wordmark:** "Log*book*" ("book" italic serif), and below it a meta line ("20 notes", or "3 of 20" when filtering). Logo uses `--font-display`.
- **Center — todo counter:** a pill button showing the count of open tasks (`type==='task' && status==='todo'`), e.g. **`3` open tasks**. The number uses `--font-mono`, amber (`#c89844`). Clicking it toggles a filter to exactly the open tasks; when active the pill gets an amber tint and `is-active`.
- **Right — actions** (icon buttons, 32×32, radius `--r-md`): **collapse** (chevrons-right when expanded → collapses every card to a single title line; chevron-down to expand), **shortcuts** (keyboard icon → opens Shortcuts modal), **theme toggle** (sun/moon → light/dark, persisted to `localStorage['logbook.theme']`).

#### Feed body
- Notes grouped by day with **date dividers** (`Today`, `Yesterday`, `Wednesday`, `Wed, May 14`, `May 14, 2024`) — uppercase, 10.5px, letter-spacing `0.08em`, `--muted`, with hairline rules on both sides.
- **Order:** ascending by `latestActivity` — oldest at top, **newest at the bottom**. On load the feed is programmatically scrolled to the bottom (re-pinned after `document.fonts.ready` and on first content-resize, with `scroll-behavior` forced to `auto` during the jump — see the mount effect in `app.jsx`).
- A newly created note always lands at the very bottom of the chronological section, directly above the Pinned section.
- **Pinned section** renders **at the bottom**, *below* the chronological feed, under a "Pinned" divider (accent-colored). Pinned cards get a thin accent vertical bar on their left edge.
- **History horizon / infinite scroll up:** on initial load only notes from the **last 1 month** are shown. A sentinel at the top of the feed (with a subtle "Loading N older notes…" pulse) extends the horizon back another month when scrolled into view, preserving scroll anchor. When filtering, the horizon is ignored (search spans everything).
- **Empty state:** centered serif message ("No notes match *#design*." / "Nothing here yet.") with a hint to type `/`.

#### Dock (Row 3, top border `--divider`, translucent bg)
Inner column constrained to `--feed-max`, `display:flex; gap:10px`:
- **"+ Task" button** (left, flex-shrink:0): height 52px, accent background (`--accent`), white text, `+` icon, label "Task", radius `--r-lg`, `--shadow-sm`. Opens the quick-add popover.
- **Command bar** (fills remaining width): see §"Command bar" below.

---

### 2. Note card (read mode) — `NoteCard`

A bordered card (`--surface`, `1px --border`, radius `--r-lg`, padding `14px 18px 12px`, `--shadow-xs`; hover lifts to `--shadow-sm` + `--border-strong`). `cursor: text`. Clicking enters inline edit.

Top bar (`space-between`):
- **Left cluster** (wrap, gap 6px): **TypeBadge**, then a **read-only StatusPill** for task/design, then a **ProjectChip** per project, then a **TeamChip** per team.
- **Right:** relative time (`--muted`, 11px, tabular-nums), e.g. "5 mai", "2h", "now".

Body region (type-specific):
- **Title** — `--font-display`, ~17px, weight 500. Done tasks: struck through + card dimmed (opacity .78); suspended: opacity .65.
- **Body preview** — 3-line clamp, plain-text-ish markdown preview.
- **Thoughts** show a `prompt` line (italic, with a leading mark) above the body.
- **Knowledge** show a **`stack`** label + tech-stack chips (mono, 10.5px, moss-green tinted pills `#7a9956`; clickable to filter).
- **Meeting** show subtype indicator + theme + attendees; recurring shows the latest occurrence preview.
- **Tags row** at the bottom (hover reveals **pin** + **delete** icons).

**TypeBadge:** a pill = colored dot + uppercase label. Colors: Draft gray `#807966`, Task amber `#c89844`, Meeting dusty-blue `#5b8db8`, Thoughts plum `#8a5cb2`, Knowledge moss `#7a9956`, Design violet `#9b6db5`. (Dark-mode variants are lighter — see `note-types.js` `colorDark` and the `.type-badge--*` rules.)

**StatusPill:** icon + label. Task statuses: To do (amber, empty box), Done (green, filled box + check), Suspended (gray, pause). Design statuses: Exploring (blue, clock), In review (amber, eye), Decided (green, filled check). **Read-only in the feed** (no cycle); editable in editors where clicking cycles to the next status.

**Collapsed mode** (header collapse toggle): each card becomes one row — badge + single-line ellipsized title; previews/tags/time hidden; feed gap tightens to 4px.

---

### 3. Inline editor — `InlineEditor`

Replaces the card in place when clicked (and is also the composer for new non-task notes, shown above a "Writing a [type]" divider at the bottom of the feed). Card-like container with accent-soft border, `--shadow-md`.

- **Top row:** TypeBadge, editable StatusPill (task/design, click cycles), then **`PtMultiPicker`** for projects and teams (chip per value + "+ project"/"+ team" affordance with autocomplete from existing values; Backspace on empty removes last).
- **Type-specific sub-fields:** Meeting (subject, theme, attendees, subtype; recurring shows occurrence tabs), Thoughts (prompt + "where it landed"), Knowledge (tech stack via TagInput).
- **Title** input (large, `--font-display`).
- **Body**: a markdown **preview** (click to switch to a `textarea`) — preview hover tint `--accent-soft`.
- **Tags row**: existing tags + free-form input (Enter/comma to add, Backspace to remove last), autocomplete from all tags.
- **Action bar:** hint text (`⌘↵ save / esc cancel`); on saved non-task notes a **"New task from this note"** button (opens the quick-add popover, prefilled + linked); right side: preview/edit toggle, raw-source toggle (`{ }` shows the `.md` with YAML front matter), focus-mode button, delete (existing only), Cancel, Save.
- **Keys:** `⌘↵` save, `Esc` cancel.

---

### 4. Quick-add task popover — `QuickAddTask`

The **primary way to create a task** (tasks do NOT create a full inline feed note). A small floating window, bottom-centered above the dock, `max-width: 460px`, `--surface`, `1px --border-strong`, radius `--r-lg`, `--shadow-lg`, rises in with a `quick-rise` animation. Dim overlay behind (click outside or `Esc` closes).

Contents:
- Head: TypeBadge (task), editable StatusPill, close ✕.
- If opened from a note: a "→ from **Source title**" line (accent corner-down-right icon).
- **Title** input (large, autofocused).
- Project + Team `PtMultiPicker`s.
- Tag input.
- Bar: `⌘↵ add · esc cancel`, Cancel + **Add task** (primary, disabled until title non-empty).

Opened by: the dock **+ Task** button, the **`T`** key (when not typing in a field), the `/task` and `/done` commands (`/done` pre-sets status `done`), and **"New task from this note"** in any saved note (prefills projects/teams/tags, sets `sourceNoteId`, and inserts a `→ from [[Title]] (Type)` body line). On save the task is appended to the bottom of the feed and the feed scrolls to it.

---

### 5. Command bar (in the dock) — `CommandBar`

Default state = **search/filter** (placeholder, search icon, active filter chips on the left of the input). Typing a leading **`/`** switches to **command mode**: mono font, accent-tinted, and a dropdown menu rises above with arrow-key navigation. Pressing `/` anywhere focuses it.

**Creation commands** (`/draft`, `/meeting`, `/recurring`, `/thoughts`, `/knowledge`, `/design`) open an inline note; **`/task`** and **`/done`** open the quick-add popover.

**Filter commands:**
- `/project [name]`, `/team [name]` — autocomplete from existing values.
- `/type [type]` — **two-step.** Step 1 lists the 6 types. Selecting a type that carries a sub-attribute (task→status, design→status, meeting→theme, knowledge→techStack) **advances to a second step** listing that attribute's values, plus a "— all" option to apply only the type filter. Types without a sub-attribute apply immediately. The type and the attribute each show as their own chip in the bar.
- `/clear` — remove all filters.

Active filters render as removable chips: TypeBadge (type), a key/value **attr-chip** (e.g. `status / decided`), a `stack / postgres` chip, ProjectChip, TeamChip, Tag. Backspace on an empty bar removes the last filter (tags → project → team → type-attr → type). `Tab` completes a matched filter command.

---

### 6. Focus mode — `FocusMode`

Full-screen distraction-free editor for a single note (title + body, type sub-fields, tags). For recurring meetings it edits the latest occurrence. Save persists; close returns to the feed.

### 7. Shortcuts modal & Tweaks panel
- **Shortcuts** (`?`): a centered modal listing all `/` commands + keys.
- **Tweaks** (prototype-only): Voice (`editorial` / `industrial` / `modern` / `index` — swaps font pairings + accent), Cadence (`cards` / `stream` / `stack` — card treatment), Detail (`full` / `compact` / `title` — per-note density). Driven by `data-voice`/`data-cadence`/`data-detail` on `<html>`. **Decide with the user which single variant to ship** and bake it in; the panel itself is not product.

---

## Interactions & Behavior

- **Feed opens scrolled to bottom**, re-pinned after fonts load + first resize (see mount effect). Use a robust equivalent in your framework — don't rely on a single post-mount `scrollTop`.
- **Create** → note appended, feed scrolls to bottom. **Edit** card → inline editor. **Pin** (hover icon) → moves to bottom Pinned section. **Delete** (hover icon) → removed.
- **Status pills** cycle on click *in editors only* (task: todo→done→suspended; design: exploring→in-review→decided); read-only in feed.
- **Tag / project / team / type / techStack chips** are click-to-filter throughout.
- **Keyboard:** `/` focus command bar · `T` quick-add task · `?` shortcuts · `⌘↵` save · `Esc` cancel/close · `⌫` remove last filter on empty bar.
- **Theme** persists to `localStorage`; defaults to `prefers-color-scheme`.
- **Animations:** cards/editors fade-in (`fade`, 180ms); quick-add `quick-rise` (200ms `cubic-bezier(.2,.7,.2,1)`); loadmore label pulse (1.4s).

## State Management

Top-level state (see `app.jsx`): `notes[]`, `query`, `activeTags[]`, `activeProject`, `activeTeam`, `activeType`, `activeTypeAttr {key,value}`, `activeTechStack`, `editingId`, `creating`, `quickTask`, `focusState`, `showShortcuts`, `collapsed`, `historyHorizon`, `theme`. Derived via memos: `allTags/allProjects/allTeams/allTechStack`, `todoCount`, `filtered`, `visible` (horizon-clamped), `grouped` (pinned split out + day dividers). Persistence in the prototype is in-memory + seed; wire to your real store/API. The only thing persisted to `localStorage` is the theme.

---

## Design Tokens

All defined as CSS custom properties at the top of `styles.css` (light `:root`, dark `[data-theme="dark"]`).

### Colors — light theme
| Token | Value | | Token | Value |
|---|---|---|---|---|
| `--bg` | `#f7f5f0` | | `--ink` | `#1a1814` |
| `--bg-soft` | `#f1ede5` | | `--ink-soft` | `#4a463d` |
| `--surface` | `#fdfbf7` | | `--muted` | `#807966` |
| `--surface-hover` | `#f8f5ed` | | `--muted-soft` | `#a8a18d` |
| `--surface-active` | `#f3eee3` | | `--accent` | `#b04a25` (clay) |
| `--border` | `#e6e0d2` | | `--accent-ink` | `#6f2d12` |
| `--border-strong` | `#d4cdb9` | | `--accent-soft` | `#f3e3d6` |
| `--divider` | `#ece6d7` | | `--code-bg` | `#efeadb` |

### Colors — dark theme (key swaps)
`--bg #15140f` · `--surface #1f1d16` · `--border #2e2a20` · `--ink #ecead9` · `--muted #8a8472` · `--accent #e08a5f` · `--accent-soft #3a2718`.

### Type-badge / status colors
Draft `#807966` · Task `#c89844` · Meeting `#5b8db8` · Thoughts `#8a5cb2` · Knowledge `#7a9956` · Design `#9b6db5`. Status: done/decided green `#4ea76c`, suspended gray `#807966`. (Each has a lighter `colorDark` for dark mode — see `note-types.js`.)

### Typography
- Sans / display: **IBM Plex Sans** (`--font-sans`, `--font-display`)
- Serif (wordmark, some titles): **IBM Plex Serif** (`--font-serif`)
- Mono (code, kbd, counts, tech-stack, command mode): **IBM Plex Mono** (`--font-mono`)
- Body uses `text-wrap: pretty`. Approx sizes: card title ~17px/500, body ~14px, meta/time 11px, dividers 10.5px uppercase, tech-stack 10.5px.
- (Tweaks "voice" variants also load DM Sans/Serif, Source Sans/Serif, Geist, Instrument Serif, Newsreader, JetBrains Mono — only needed if you keep the variant explorer.)

### Radii
`--r-sm 6px` · `--r-md 10px` · `--r-lg 14px` · `--r-xl 20px` · `--r-pill 999px`.

### Shadows
`--shadow-xs/sm/md/lg` — warm, low-opacity (`rgba(40,30,10,…)` light; black in dark). See top of `styles.css`.

### Layout
`--feed-max 760px` · `--feed-pad 28px` · header ~67px · dock items 52px · icon buttons 32px.

---

## Assets

**No raster/image assets.** All iconography is inline SVG (Lucide-style, 24×24 viewBox) in the `Icon` component in `components.jsx` — re-implement with your icon library (Lucide matches closely) or port the paths. Fonts are Google Fonts (IBM Plex families) loaded in `index.html`; swap to your font-loading mechanism. No logos or brand assets.

---

## Suggested build order

1. Port the **data model + `createNote` factory** (`note-types.js`) and the sort/filter/search helpers — this is the spine.
2. Lay down **design tokens** from `styles.css` into your styling system.
3. Build the **grid shell** (header / scrollable feed / dock) — get `minmax(0,1fr)` + open-at-bottom right early.
4. **NoteCard** (read mode) for all 6 types, then **TypeBadge / StatusPill / chips**.
5. **Command bar** (search → filters → two-step `/type`), then **quick-add task** popover.
6. **Inline editor** + **focus mode**.
7. History horizon + infinite-scroll-up, draft auto-delete, pin section, collapse mode.
8. Decide on a single visual variant; drop the Tweaks panel.

Refer to `SPEC.md` for the full product spec and any behavior not covered here.
