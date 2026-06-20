import { App } from "obsidian";
import {
  LogNote,
  NoteType,
  NOTE_TYPES,
  TASK_STATUSES,
  DESIGN_STATUSES,
  isTask,
  isMeeting,
  isThoughts,
  isKnowledge,
  isDesign,
} from "../types";
import { NoteStore } from "../note-store";
import { relativeTime } from "../utils";
import { highlight } from "../filters";
import { renderPicker } from "./pickers";

export interface CardContext {
  app: App;
  store: NoteStore;
  isExpanded(path: string): boolean;
  expand(path: string, onForceClose: () => void | Promise<void>): void;
  registerCloseHandler(path: string, onForceClose: () => void | Promise<void>): void;
  collapse(path: string): void;
  discardEdits(path: string): void;
  pools: { projects(): string[]; teams(): string[]; templates(): string[] };
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
  const typeInfo = NOTE_TYPES[note.fm.type] ?? NOTE_TYPES.draft;
  const isExpanded = ctx.isExpanded(note.file.path);

  const card = parent.createDiv("logbook-card");
  card.style.setProperty("--card-type-color", typeInfo.color);
  if (isExpanded) card.addClass("is-expanded");
  if (isTask(note) && note.fm.status === "done") card.addClass("is-done");
  if (isTask(note) && note.fm.status === "suspended") card.addClass("is-suspended");

  // Nothing is written to disk while a field is being edited (design.md §4) — every
  // handler below mutates `note.fm` + its own DOM immediately, then records what
  // changed here. `commit()` flushes it all in one batch when the card closes.
  const dirty = new Set<string>();
  let titleDirty = false;
  let templateDirty = false;

  // ── Collapsed header ──────────────────────────────────────────────────
  const header = card.createDiv("logbook-card-header");
  const top = header.createDiv("logbook-card-top");

  const badge = renderBadge(top, note.fm.type);
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

  if (typeInfo.filterAttr) {
    const filterLine = renderPillLine(pillsRow, typeInfo.filterAttr.label);
    renderFilterAttrPill(filterLine, note, ctx, card, dirty);
  }

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

  const chevron = top.createEl("span", { cls: "logbook-chevron" });
  chevron.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9"/></svg>`;

  top.createEl("span", { cls: "logbook-time", text: relativeTime(new Date(note.file.stat.mtime)) });

  const titleRow = header.createDiv("logbook-title-row");
  if (isThoughts(note) && note.fm.question) {
    titleRow.createEl("div", { cls: "logbook-question", text: note.fm.question });
  }
  const titleEl = titleRow.createEl("div", { cls: "logbook-title" });
  titleEl.innerHTML = ctx.searchQuery ? highlight(note.fm.title, ctx.searchQuery) : escapeHtml(note.fm.title);

  if (isMeeting(note) && note.fm.subtype === "recurring") {
    const n = note.fm.occurrences?.length ?? 0;
    const latest = note.fm.occurrences?.[0];
    header.createEl("div", {
      cls: "logbook-occurrence-info",
      text: `${n} occurrence${n === 1 ? "" : "s"}${latest ? ` · latest ${latest}` : ""}`,
    });
  }

  const previewWrap = header.createDiv("logbook-card-preview-wrap");
  if (isKnowledge(note) && note.fm.techStack.length) {
    const stackRow = previewWrap.createDiv("logbook-stack-row");
    stackRow.createEl("span", { cls: "logbook-stack-label", text: "STACK" });
    for (const tech of note.fm.techStack) {
      stackRow.createEl("span", { cls: "logbook-pill logbook-stack-chip", text: tech });
    }
  }
  if (note.body) {
    const plain = note.body.replace(/^#{1,4}\s+/gm, "").replace(/[*_`>#]/g, "").slice(0, 160);
    const preview = previewWrap.createEl("div", { cls: "logbook-preview" });
    preview.innerHTML = ctx.searchQuery ? highlight(plain, ctx.searchQuery) : escapeHtml(plain);
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

  // Type-specific editable fields (status/subtype live in pillsRow, not here)
  const typeFieldsEl = expandInner.createDiv("logbook-type-fields");
  renderTypeFields(typeFieldsEl, note, ctx, dirty, () => (templateDirty = true));

  const expandFooter = expandInner.createDiv("logbook-expand-footer");
  expandFooter.createEl("span", { cls: "logbook-kbd-hint", text: "⌘↵ save / esc collapse" });

  // ── Commit / discard ────────────────────────────────────────────────────
  /** Flushes every staged edit in as few writes as possible: a rename (title),
   *  a template scaffold (meeting template), and one batched frontmatter write
   *  for everything else (design.md §4). */
  const commit = async () => {
    if (titleDirty) {
      titleDirty = false;
      await ctx.store.renameTitle(note.file, note.fm.title);
    }
    if (templateDirty && isMeeting(note)) {
      templateDirty = false;
      await ctx.store.setMeetingTemplate(note.file, note.fm, note.fm.template ?? "");
    }
    if (dirty.size > 0) {
      const keys = Array.from(dirty);
      dirty.clear();
      await ctx.store.updateFrontmatter(note.file, (raw) => {
        for (const k of keys) raw[k] = (note.fm as unknown as Record<string, unknown>)[k];
      });
    }
  };

  // ── Expand / collapse toggle ────────────────────────────────────────────
  // The card never renders the body inline — expanding opens the real note in
  // Obsidian's editor instead (design.md §4, §6), and the body preview (shown
  // only while collapsed) is hidden via CSS on .is-expanded.
  const collapseUI = () => {
    card.removeClass("is-expanded");
    top.insertBefore(pillsRow, chevron);
  };
  const closeAndSave = async () => {
    await commit();
    ctx.collapse(note.file.path);
    collapseUI();
  };
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

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void closeAndSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      ctx.discardEdits(note.file.path);
    }
  });
}

function renderBadge(parent: HTMLElement, type: NoteType): HTMLElement {
  const typeInfo = NOTE_TYPES[type] ?? NOTE_TYPES.draft;
  const badge = parent.createEl("span", { cls: "logbook-badge" });
  badge.style.setProperty("--badge-color", typeInfo.color);
  const dot = badge.createEl("span", { cls: "logbook-badge-dot" });
  dot.style.background = typeInfo.color;
  badge.createSpan({ text: typeInfo.label.toUpperCase() });
  return badge;
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
 * The type's filterable-property pill (design.md §2, §4): task/design's `status`
 * filters when collapsed but cycles (and stages, design.md §4) when expanded;
 * meeting's `subtype` always filters, in either state, and is never editable.
 * Reused as a single DOM node relocated between the collapsed top row and the
 * expanded field block, so its click behavior is read from `card`'s current
 * `is-expanded` class at click time rather than baked in at render time.
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

  if (isMeeting(note)) {
    const value = note.fm.subtype;
    const pill = parent.createEl("span", {
      cls: `logbook-pill logbook-filter-attr-pill logbook-subtype-pill is-${value}`,
      text: value,
    });
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      ctx.onFilterType(note.fm.type, { key, value });
    });
    return;
  }

  if (isTask(note) || isDesign(note)) {
    const cycle = isTask(note) ? TASK_STATUSES : DESIGN_STATUSES;
    let status: string = note.fm.status;
    const pill = parent.createEl("span", {
      cls: `logbook-pill logbook-filter-attr-pill logbook-status-pill is-${status}`,
      text: status,
    });
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!card.hasClass("is-expanded")) {
        ctx.onFilterType(note.fm.type, { key, value: status });
        return;
      }
      const idx = (cycle as string[]).indexOf(status);
      status = cycle[(idx + 1) % cycle.length];
      (note.fm as any).status = status;
      dirty.add("status");
      pill.textContent = status;
      pill.className = `logbook-pill logbook-filter-attr-pill logbook-status-pill is-${status}`;
    });
  }
}

function renderTypeFields(
  container: HTMLElement,
  note: LogNote,
  ctx: CardContext,
  dirty: Set<string>,
  markTemplateDirty: () => void
) {
  if (isMeeting(note)) {
    const themeRow = container.createDiv("logbook-field-row");
    themeRow.createEl("label", { text: "Theme" });
    const themeInput = themeRow.createEl("input", {
      cls: "logbook-field-input",
      attr: { type: "text", placeholder: "theme…" },
    });
    themeInput.value = note.fm.theme ?? "";
    themeInput.addEventListener("input", () => {
      note.fm.theme = themeInput.value.trim() || undefined;
      dirty.add("theme");
    });
    themeInput.addEventListener("click", (e) => e.stopPropagation());

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

    const templateRow = container.createDiv("logbook-field-row");
    templateRow.createEl("label", { text: "Template" });
    const templateListId = `logbook-templates-${note.file.path.replace(/[^a-zA-Z0-9]/g, "-")}`;
    const templateInput = templateRow.createEl("input", {
      cls: "logbook-field-input",
      attr: { type: "text", placeholder: "none", list: templateListId },
    });
    const datalist = templateRow.createEl("datalist", { attr: { id: templateListId } });
    for (const t of ctx.pools.templates()) datalist.createEl("option", { attr: { value: t } });
    templateInput.value = note.fm.template ?? "";
    templateInput.addEventListener("input", () => {
      note.fm.template = templateInput.value.trim() || undefined;
      markTemplateDirty();
    });
    templateInput.addEventListener("click", (e) => e.stopPropagation());
  }

  if (isThoughts(note)) {
    const qRow = container.createDiv("logbook-field-row");
    qRow.createEl("label", { text: "Question" });
    const qInput = qRow.createEl("input", { cls: "logbook-field-input", attr: { type: "text" } });
    qInput.value = note.fm.question ?? "";
    qInput.addEventListener("input", () => {
      note.fm.question = qInput.value.trim() || undefined;
      dirty.add("question");
    });
    qInput.addEventListener("click", (e) => e.stopPropagation());

    const lRow = container.createDiv("logbook-field-row");
    lRow.createEl("label", { text: "Where I landed" });
    const lInput = lRow.createEl("input", { cls: "logbook-field-input", attr: { type: "text" } });
    lInput.value = note.fm.landed ?? "";
    lInput.addEventListener("input", () => {
      note.fm.landed = lInput.value.trim() || undefined;
      dirty.add("landed");
    });
    lInput.addEventListener("click", (e) => e.stopPropagation());
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
