import { App, Menu, setIcon, renderMatches } from "obsidian";
import {
  LogNote,
  NoteType,
  NOTE_TYPES,
  TASK_STATUSES,
  DESIGN_STATUSES,
  isTask,
  isMeeting,
  isRecurring,
  isKnowledge,
  isDesign,
  isDaily,
  convertType,
  MEETING_AGENDAS,
} from "../types";
import { NoteStore } from "../note-store";
import { relativeTime, formatDeadline, isPastDeadline } from "../utils";
import { fuzzyMatchRanges } from "../filters";
import { renderPicker } from "./pickers";

export interface CardContext {
  app: App;
  store: NoteStore;
  isExpanded(path: string): boolean;
  expand(path: string, onForceClose: () => void | Promise<void>): void;
  registerCloseHandler(path: string, onForceClose: () => void | Promise<void>): void;
  collapse(path: string): void;
  discardEdits(path: string): void;
  deleteNote(path: string): void;
  pools: { projects(): string[]; teams(): string[] };
  searchQuery: string;
  onFilterProject(p: string): void;
  onFilterTeam(t: string): void;
  onFilterType(type: NoteType, attr?: { key: string; value: string }): void;
}

/** Builds a card detached from any parent, for callers that want to place/cache it themselves (see feed.ts's incremental diff). */
export function buildCard(note: LogNote, ctx: CardContext): HTMLElement {
  const wrapper = document.createElement("div");
  renderCard(wrapper, note, ctx);
  return wrapper.firstElementChild as HTMLElement;
}

function renderCard(parent: HTMLElement, note: LogNote, ctx: CardContext) {
  const isExpanded = ctx.isExpanded(note.file.path);
  // Daily notes never convert to/from another type (card.ts's Change-type menu
  // excludes them), so whether pickers are hidden is fixed for this card's
  // whole lifetime — safe to decide once here rather than in
  // refreshTypeDependentUI().
  const initialTypeInfo = NOTE_TYPES[note.fm.type] ?? NOTE_TYPES.draft;

  const card = parent.createDiv("logbook-card");
  if (isExpanded) card.addClass("is-expanded");

  // Nothing is written to disk while a field is being edited (design.md §4) — every
  // handler below mutates `note.fm` + its own DOM immediately, then records what
  // changed here. `commit()` flushes it all in one batch when the card closes.
  const dirty = new Set<string>();
  let titleDirty = false;
  let typeDirty = false;

  // ── Collapsed header ──────────────────────────────────────────────────
  const header = card.createDiv("logbook-card-header");
  const top = header.createDiv("logbook-card-top");

  const badge = top.createEl("span", { cls: "logbook-pill logbook-badge" });
  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    ctx.onFilterType(note.fm.type);
  });

  // Filterable-property pill + project/team pills: live in the top row while
  // collapsed, and relocate into the field block once expanded (design.md §4)
  // — same DOM nodes either way, just moved between containers below. Each
  // gets its own "line" (label + content) once expanded; while collapsed the
  // lines collapse back into one flowing row (see .logbook-pill-line CSS).
  const pillsRow = top.createDiv("logbook-pills-row");
  let filterLineEl: HTMLElement | null = null;

  if (!initialTypeInfo.hidePickers) {
    const projectLine = renderPillLine(pillsRow, "Projects");
    const projectRow = projectLine.createDiv("logbook-project-row");
    renderPicker(projectRow, {
      values: note.fm.projects,
      pool: ctx.pools.projects,
      placeholder: "+ project",
      chipClass: "logbook-pill logbook-project-chip",
      icon: "briefcase",
      onChange: (next) => {
        note.fm.projects = next;
        dirty.add("projects");
      },
    });
    // Clicking an existing project chip's label (not its × or the input) filters by it.
    projectRow.querySelectorAll(".logbook-project-chip .logbook-pill-label").forEach((el, i) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        ctx.onFilterProject(note.fm.projects[i]);
      });
    });

    const teamLine = renderPillLine(pillsRow, "Teams");
    const teamRow = teamLine.createDiv("logbook-team-row");
    renderPicker(teamRow, {
      values: note.fm.teams,
      pool: ctx.pools.teams,
      placeholder: "+ team",
      chipClass: "logbook-pill logbook-team-chip",
      icon: "users",
      onChange: (next) => {
        note.fm.teams = next;
        dirty.add("teams");
      },
    });
    // Clicking an existing team chip's label (not its × or the input) filters by it.
    teamRow.querySelectorAll(".logbook-team-chip .logbook-pill-label").forEach((el, i) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        ctx.onFilterTeam(note.fm.teams[i]);
      });
    });
  }

  // Pin glyph (design.md §4): same node in both states — a pure indicator while
  // collapsed (hidden entirely when not pinned, via CSS), a clickable toggle once
  // expanded. Lives in the top-right corner cluster alongside chevron/age, ahead
  // of them so it doesn't drift when the pills row comes and goes.
  const pinIndicator = top.createEl("span", { cls: "logbook-pin-indicator", attr: { "aria-label": "Pinned" } });
  setIcon(pinIndicator, "pin");
  pinIndicator.addEventListener("click", (e) => {
    // While collapsed it's display-only — don't intercept the click, so it
    // falls through to the card's own handler and expands like normal.
    if (!card.hasClass("is-expanded")) return;
    e.stopPropagation();
    const next = !note.fm.pinned;
    note.fm.pinned = next || undefined;
    dirty.add("pinned");
    pinIndicator.toggleClass("is-pinned", next);
  });
  pinIndicator.toggleClass("is-pinned", !!note.fm.pinned);

  const chevron = top.createEl("span", { cls: "logbook-chevron" });
  chevron.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9"/></svg>`;

  top.createEl("span", { cls: "logbook-time", text: relativeTime(new Date(note.file.stat.mtime)) });

  // ── Commit / discard ────────────────────────────────────────────────────
  // Defined here (rather than down by the fields that use it) so every editable
  // input — including the ones below — can wire its own Cmd/Ctrl+Enter handler
  // directly, instead of relying on the keystroke bubbling all the way up to a
  // single card-level listener (which a picker's own Enter handling, or some
  // future child listener, could swallow before it gets there).
  /** Flushes every staged edit in as few writes as possible: a rename (title)
   *  and one batched frontmatter write for everything else (design.md §4). */
  const commit = async () => {
    if (titleDirty) {
      titleDirty = false;
      await ctx.store.renameTitle(note.file, note.fm.title);
    }
    if (typeDirty) {
      // Replace-not-merge (design.md §15): a type change drops every old-type
      // field, so it supersedes the normal key-by-key dirty write below.
      typeDirty = false;
      dirty.clear();
      await ctx.store.changeType(note.file, note.fm);
    } else if (dirty.size > 0) {
      const keys = Array.from(dirty);
      dirty.clear();
      await ctx.store.updateFrontmatter(note.file, (raw) => {
        for (const k of keys) raw[k] = (note.fm as unknown as Record<string, unknown>)[k];
      });
    }
  };
  const collapseUI = () => {
    card.removeClass("is-expanded");
    top.insertBefore(pillsRow, chevron);
  };
  const closeAndSave = async () => {
    await commit();
    ctx.collapse(note.file.path);
    collapseUI();
  };
  /** Attach directly to every field input — fires regardless of whatever a
   *  child's own keydown handling (e.g. a picker's Enter-to-add) might do,
   *  since it's the first listener to see the event, not the last. */
  const onFieldKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      void closeAndSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      ctx.discardEdits(note.file.path);
    }
  };

  const titleRow = header.createDiv("logbook-title-row");
  const titleEl = titleRow.createEl("div", { cls: "logbook-title" });
  if (ctx.searchQuery) {
    renderMatches(titleEl, note.fm.title, fuzzyMatchRanges(note.fm.title, ctx.searchQuery));
  } else {
    titleEl.textContent = note.fm.title;
  }

  let occurrenceInfoEl: HTMLElement | null = null;
  let deadlineInfoEl: HTMLElement | null = null;

  const previewWrap = header.createDiv("logbook-card-preview-wrap");
  let stackRowEl: HTMLElement | null = null;
  if (note.body) {
    const plain = note.body.replace(/^#{1,4}\s+/gm, "").replace(/[*_`>#]/g, "").slice(0, 160);
    const preview = previewWrap.createEl("div", { cls: "logbook-preview" });
    if (ctx.searchQuery) {
      renderMatches(preview, plain, fuzzyMatchRanges(plain, ctx.searchQuery));
    } else {
      preview.textContent = plain;
    }
  }

  // ── Expanded section ──────────────────────────────────────────────────
  const expandWrap = card.createDiv("logbook-card-expand");
  const expandInner = expandWrap.createDiv("logbook-card-expand-inner");
  expandInner.createEl("div", { cls: "logbook-sep" });

  // Editable title (only meaningfully interactive while expanded; CSS keeps
  // the read-only title visible/clickable while collapsed).
  const titleInputWrap = expandInner.createDiv("logbook-title-edit-wrap");
  const titleInput = titleInputWrap.createEl("input", {
    cls: "logbook-title-input",
    attr: { type: "text", spellcheck: "false" },
  });
  titleInput.value = note.fm.title;
  titleInput.addEventListener("input", () => {
    titleEl.textContent = titleInput.value;
    const val = titleInput.value.trim();
    if (val) {
      note.fm.title = val;
      titleDirty = true;
    }
  });
  titleInput.addEventListener("click", (e) => e.stopPropagation());
  titleInput.addEventListener("keydown", onFieldKeydown);

  // Type-specific editable fields (status/subtype live in pillsRow, not here)
  const typeFieldsEl = expandInner.createDiv("logbook-type-fields");

  const expandFooter = expandInner.createDiv("logbook-expand-footer");
  expandFooter.createEl("span", { cls: "logbook-kbd-hint", text: "⌘↵ save / esc collapse" });

  // Change type (design.md §4, §15): opens a small menu of the other types;
  // picking one stages a conversion via convertType() and re-renders the
  // type-dependent UI in place — nothing is written until the card closes.
  // Daily notes are excluded entirely, both as a source and a target: their
  // filename is date-keyed and they carry no projects/teams, neither of which
  // convertType()'s generic common-field carryover was designed around.
  if (!isDaily(note)) {
    const typeBtn = expandFooter.createEl("button", {
      cls: "logbook-type-btn",
      attr: { type: "button" },
    });
    typeBtn.createSpan({ text: "Change type" });
    setIcon(typeBtn.createSpan({ cls: "logbook-type-btn-chevron" }), "chevron-down");
    typeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = new Menu();
      for (const t of Object.keys(NOTE_TYPES) as NoteType[]) {
        if (t === note.fm.type || t === "daily") continue;
        menu.addItem((item) => {
          item.setTitle(NOTE_TYPES[t].label);
          item.onClick(() => applyTypeChange(t));
        });
      }
      menu.showAtMouseEvent(e);
    });
  }

  // Save (design.md §4, §12): explicit equivalent of ⌘↵, since the global hotkey
  // has proven unreliable depending on where keyboard focus lands.
  const saveBtn = expandFooter.createEl("button", { cls: "logbook-save-btn", attr: { type: "button" }, text: "Save" });
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void closeAndSave();
  });

  // Soft-delete (design.md §4): first click arms it, second click while armed
  // actually deletes — a single accidental click can't trash anything.
  const deleteBtn = expandFooter.createEl("button", {
    cls: "logbook-delete-btn",
    attr: { type: "button", "aria-label": "Delete note" },
  });
  setIcon(deleteBtn, "trash-2");
  let armed = false;
  let disarmTimer: ReturnType<typeof setTimeout> | null = null;
  const disarm = () => {
    armed = false;
    if (disarmTimer) clearTimeout(disarmTimer);
    disarmTimer = null;
    deleteBtn.removeClass("is-armed");
    deleteBtn.setAttribute("aria-label", "Delete note");
  };
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!armed) {
      armed = true;
      deleteBtn.addClass("is-armed");
      deleteBtn.setAttribute("aria-label", "Click again to delete");
      disarmTimer = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    ctx.deleteNote(note.file.path);
  });

  // ── Type-dependent UI (design.md §2, §4) ────────────────────────────────
  // Everything here depends on note.fm.type and must be rebuilt — not just
  // updated — when the type changes, since the shape of the fields changes.
  // Each piece is tracked by a nullable element reference so it can be torn
  // down and reinserted at a stable position without disturbing siblings.
  function refreshTypeDependentUI() {
    const typeInfo = NOTE_TYPES[note.fm.type] ?? NOTE_TYPES.draft;
    card.style.setProperty("--card-type-color", typeInfo.color);
    card.toggleClass("is-done", isTask(note) && note.fm.status === "done");
    card.toggleClass("is-suspended", isTask(note) && note.fm.status === "suspended");
    paintBadge(badge, note.fm.type);

    if (filterLineEl) {
      filterLineEl.remove();
      filterLineEl = null;
    }
    if (typeInfo.filterAttr) {
      filterLineEl = renderPillLine(pillsRow, typeInfo.filterAttr.label);
      pillsRow.insertBefore(filterLineEl, pillsRow.firstChild);
      renderFilterAttrPill(filterLineEl, note, ctx, card, dirty);
    }

    if (occurrenceInfoEl) {
      occurrenceInfoEl.remove();
      occurrenceInfoEl = null;
    }
    if (isRecurring(note)) {
      const n = note.fm.occurrences.length;
      const latest = note.fm.occurrences[0];
      occurrenceInfoEl = header.createEl("div", {
        cls: "logbook-occurrence-info",
        text: `${n} occurrence${n === 1 ? "" : "s"}${latest ? ` · latest ${latest}` : ""}`,
      });
      header.insertBefore(occurrenceInfoEl, previewWrap);
    }

    if (deadlineInfoEl) {
      deadlineInfoEl.remove();
      deadlineInfoEl = null;
    }
    if (isTask(note) && note.fm.deadline) {
      const overdue = note.fm.status !== "done" && isPastDeadline(note.fm.deadline);
      deadlineInfoEl = header.createEl("div", {
        cls: `logbook-deadline-info${overdue ? " is-overdue" : ""}`,
        text: `Due ${formatDeadline(note.fm.deadline)}`,
      });
      header.insertBefore(deadlineInfoEl, previewWrap);
    }

    if (stackRowEl) {
      stackRowEl.remove();
      stackRowEl = null;
    }
    if (isKnowledge(note) && note.fm.techStack.length) {
      stackRowEl = previewWrap.createDiv("logbook-stack-row");
      stackRowEl.createEl("span", { cls: "logbook-stack-label", text: "STACK" });
      for (const tech of note.fm.techStack) {
        stackRowEl.createEl("span", { cls: "logbook-pill logbook-stack-chip", text: tech });
      }
      previewWrap.insertBefore(stackRowEl, previewWrap.firstChild);
    }

    typeFieldsEl.empty();
    renderTypeFields(typeFieldsEl, note, ctx, dirty, onFieldKeydown);
  }

  /** Stages a type conversion (design.md §15): replaces note.fm with the converted
   *  shape and re-renders the type-dependent UI in place — committed wholesale by
   *  changeType() when the card closes, like any other staged edit. */
  function applyTypeChange(toType: NoteType) {
    note.fm = convertType(note.fm, toType);
    typeDirty = true;
    refreshTypeDependentUI();
  }

  refreshTypeDependentUI();

  // ── Expand / collapse toggle ────────────────────────────────────────────
  // The card never renders the body inline — expanding opens the real note in
  // Obsidian's editor instead (design.md §4, §6), and the body preview (shown
  // only while collapsed) is hidden via CSS on .is-expanded.
  const expand = () => {
    ctx.expand(note.file.path, closeAndSave);
    card.addClass("is-expanded");
    expandInner.insertBefore(pillsRow, typeFieldsEl);
    titleInput.focus();
    void ctx.app.workspace.openLinkText(note.file.path, "", false);
  };
  // A card can be rendered already-expanded without ever going through expand()
  // above — e.g. right after creation, where LogbookView sets expandedPath
  // directly. Match pillsRow's location to that initial state, and register
  // this card's own closeAndSave so Mod+Enter / switching to another card
  // still commits and collapses it instead of silently doing nothing.
  if (isExpanded) {
    expandInner.insertBefore(pillsRow, typeFieldsEl);
    ctx.registerCloseHandler(note.file.path, closeAndSave);
  }

  header.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("input, button, .logbook-pill, .logbook-badge")) return;
    card.hasClass("is-expanded") ? void closeAndSave() : expand();
  });

  // Fallback for Cmd/Ctrl+Enter or Esc while focus is on the card itself or a
  // non-input element inside it (e.g. a pill) — every actual input already has
  // its own onFieldKeydown listener above, which fires first.
  card.addEventListener("keydown", onFieldKeydown);
}

/** Repaints an existing badge node in place (e.g. after a type change) rather than
 *  creating a new one, so the rest of the card's DOM doesn't need to track it. */
function paintBadge(badge: HTMLElement, type: NoteType) {
  const typeInfo = NOTE_TYPES[type] ?? NOTE_TYPES.draft;
  badge.empty();
  badge.style.setProperty("--badge-color", typeInfo.color);
  const dot = badge.createEl("span", { cls: "logbook-badge-dot" });
  dot.style.background = typeInfo.color;
  badge.createSpan({ text: typeInfo.label.toUpperCase() });
}

/**
 * A single "pill line" inside `pillsRow`: a label + its content. While the card
 * is collapsed, the label is hidden and the line collapses into the flowing
 * top-row layout (see .logbook-pill-line in styles.css); while expanded, each
 * line renders as its own row with the label to the left (design.md §4).
 */
function renderPillLine(parent: HTMLElement, label: string): HTMLElement {
  const line = parent.createDiv("logbook-pill-line");
  line.createEl("span", { cls: "logbook-pill-line-label", text: label });
  return line;
}

/**
 * The type's filterable-property pill (design.md §2, §4): filters when collapsed,
 * cycles through the enum (and stages, design.md §4) when expanded — task/design's
 * `status`, meeting's `agenda`. Reused as a single DOM node relocated between the
 * collapsed top row and the expanded field block, so its click behavior is read
 * from `card`'s current `is-expanded` class at click time rather than baked in at
 * render time.
 */
function renderFilterAttrPill(
  parent: HTMLElement,
  note: LogNote,
  ctx: CardContext,
  card: HTMLElement,
  dirty: Set<string>
) {
  const typeInfo = NOTE_TYPES[note.fm.type];
  if (!typeInfo.filterAttr) return;
  const { key } = typeInfo.filterAttr;

  if (!(isTask(note) || isDesign(note) || isMeeting(note))) return;
  const cycle = isTask(note) ? TASK_STATUSES : isDesign(note) ? DESIGN_STATUSES : MEETING_AGENDAS;
  const pillClass = isMeeting(note) ? "logbook-agenda-pill" : "logbook-status-pill";
  let value: string = (note.fm as unknown as Record<string, string>)[key];
  const pill = parent.createEl("span", {
    cls: `logbook-pill logbook-filter-attr-pill ${pillClass} is-${value}`,
    text: value,
  });
  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!card.hasClass("is-expanded")) {
      ctx.onFilterType(note.fm.type, { key, value });
      return;
    }
    const idx = (cycle as string[]).indexOf(value);
    value = cycle[(idx + 1) % cycle.length];
    (note.fm as unknown as Record<string, string>)[key] = value;
    dirty.add(key);
    pill.textContent = value;
    pill.className = `logbook-pill logbook-filter-attr-pill ${pillClass} is-${value}`;
  });
}

function renderTypeFields(
  container: HTMLElement,
  note: LogNote,
  ctx: CardContext,
  dirty: Set<string>,
  onFieldKeydown: (e: KeyboardEvent) => void
) {
  if (isTask(note)) {
    const row = container.createDiv("logbook-field-row");
    row.createEl("label", { text: "Deadline" });
    const input = row.createEl("input", {
      cls: "logbook-field-input",
      attr: { type: "date" },
    });
    input.value = note.fm.deadline ?? "";
    input.addEventListener("input", () => {
      note.fm.deadline = input.value || undefined;
      dirty.add("deadline");
    });
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("keydown", onFieldKeydown);
  }

  if (isMeeting(note) || isRecurring(note)) {
    const themeRow = container.createDiv("logbook-field-row");
    themeRow.createEl("label", { text: "Theme" });
    const themeInput = themeRow.createEl("input", {
      cls: "logbook-field-input",
      attr: { type: "text", spellcheck: "false", placeholder: "+ theme" },
    });
    themeInput.value = note.fm.theme ?? "";
    themeInput.addEventListener("input", () => {
      note.fm.theme = themeInput.value;
      dirty.add("theme");
    });
    themeInput.addEventListener("click", (e) => e.stopPropagation());
    themeInput.addEventListener("keydown", onFieldKeydown);

    const attendeesRow = container.createDiv("logbook-field-row");
    attendeesRow.createEl("label", { text: "Attendees" });
    const attendeesWrap = attendeesRow.createDiv();
    renderPicker(attendeesWrap, {
      values: note.fm.attendees,
      pool: () => [],
      placeholder: "+ attendee",
      chipClass: "logbook-pill logbook-attendee-chip",
      onChange: (next) => {
        note.fm.attendees = next;
        dirty.add("attendees");
      },
    });
  }

  if (isKnowledge(note)) {
    const row = container.createDiv("logbook-field-row");
    row.createEl("label", { text: "Stack" });
    const wrap = row.createDiv();
    renderPicker(wrap, {
      values: note.fm.techStack,
      pool: () => [],
      placeholder: "+ tech",
      chipClass: "logbook-pill logbook-stack-chip",
      onChange: (next) => {
        note.fm.techStack = next;
        dirty.add("techStack");
      },
    });
  }
}
