import { Component, ItemView, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import { LogbookSettings } from "../settings";
import { NoteStore } from "../note-store";
import { LogNote, NOTE_TYPES, NoteType, TASK_STATUSES, DESIGN_STATUSES, activityTimestamp } from "../types";
import { FilterState, applyFilters, emptyFilters, hasActiveFilters } from "../filters";
import { renderFeed } from "./feed";
import { CardContext } from "./card";
import { Dock, RecurringMeetingRef } from "./dock";

export const VIEW_TYPE_LOGBOOK = "logbook-feed";

const INITIAL_WINDOW_MONTHS = 1;

export class LogbookView extends ItemView {
  private store: NoteStore;
  private feedEl!: HTMLElement;

  private allNotes: LogNote[] = [];
  private templateTitles: string[] = [];
  private filters: FilterState = emptyFilters();
  private monthsBack = INITIAL_WINDOW_MONTHS;
  private loadingMore = false;

  private expandedPath: string | null = null;
  private pendingDivider: string | undefined;
  private pendingNotePath: string | undefined;

  private bodyComponents = new Map<string, Component>();
  private dock!: Dock;

  constructor(leaf: WorkspaceLeaf, private settings: LogbookSettings) {
    super(leaf);
    this.store = new NoteStore(this.app, settings);
  }

  getViewType(): string {
    return VIEW_TYPE_LOGBOOK;
  }
  getDisplayText(): string {
    return "Logbook";
  }
  getIcon(): string {
    return "book-open";
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("logbook-view");

    this.feedEl = contentEl.createDiv("logbook-feed");
    const dockEl = contentEl.createDiv("logbook-dock");
    this.dock = new Dock(dockEl, {
      onSearch: (q) => {
        this.filters.query = q;
        this.renderDisplay();
      },
      onCreate: (type, title) => void this.createAndShow(type, title),
      onCreateDone: (title) => void this.createAndShow("task", title, { done: true }),
      onCreateRecurring: (title) => void this.createAndShow("meeting", title, { recurring: true }),
      onFilterProject: (name) => this.addFilterValue("projects", name),
      onFilterTeam: (name) => this.addFilterValue("teams", name),
      onFilterType: (type, attr) => {
        this.filters.type = type;
        this.filters.typeAttr = attr ?? null;
        this.afterFilterChange();
      },
      onClearFilters: () => {
        this.filters = emptyFilters();
        this.afterFilterChange();
      },
      onOccurrence: (meeting) => void this.handleOccurrence(meeting),
      onRemoveFilterChip: (kind, value) => this.removeFilterChip(kind, value),
      getAllProjects: () => this.collectPool((n) => n.fm.projects),
      getAllTeams: () => this.collectPool((n) => n.fm.teams),
      getTypeAttrValues: (type) => this.typeAttrValues(type),
      getRecurringMeetings: () => this.recurringMeetings(),
      getFilters: () => this.filters,
    });

    this.addAction("chevrons-up-down", "Toggle collapse mode", () => {
      contentEl.toggleClass("is-collapse-mode", !contentEl.hasClass("is-collapse-mode"));
    });

    this.registerEvent(this.app.vault.on("create", () => this.maybeRefresh()));
    this.registerEvent(this.app.vault.on("modify", () => this.maybeRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.maybeRefresh()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.maybeRefresh()));
    this.store.onSettled(() => void this.refresh());

    await this.store.pruneOldDrafts();
    await this.refresh();
    setTimeout(() => {
      this.feedEl.scrollTop = this.feedEl.scrollHeight;
    }, 80);
  }

  async onClose() {
    this.unloadAllBodyComponents();
  }

  private maybeRefresh() {
    if (this.store.isAnySuppressed()) return;
    void this.refresh();
  }

  private async refresh() {
    this.allNotes = await this.store.loadNotes();
    this.templateTitles = (await this.store.listTemplates()).map((t) => t.title);
    this.renderDisplay();
  }

  private addFilterValue(key: "projects" | "teams", value: string) {
    if (!this.filters[key].includes(value)) this.filters[key] = [...this.filters[key], value];
    this.afterFilterChange();
  }

  private removeFilterChip(kind: "tag" | "project" | "team" | "type" | "typeAttr", value?: string) {
    if (kind === "tag") this.filters.tags = this.filters.tags.filter((v) => v !== value);
    else if (kind === "project") this.filters.projects = this.filters.projects.filter((v) => v !== value);
    else if (kind === "team") this.filters.teams = this.filters.teams.filter((v) => v !== value);
    else if (kind === "type") {
      this.filters.type = null;
      this.filters.typeAttr = null;
    } else if (kind === "typeAttr") this.filters.typeAttr = null;
    this.afterFilterChange();
  }

  private afterFilterChange() {
    this.dock.renderChips();
    this.renderDisplay();
  }

  private collectPool(pick: (n: LogNote) => string[]): string[] {
    return [...new Set(this.allNotes.flatMap(pick))].sort();
  }

  /** Values for a type's filterAttr (design.md §12 /type two-step flow): fixed enums for task/design, observed values for meeting/knowledge. */
  private typeAttrValues(type: NoteType): string[] {
    if (type === "task") return TASK_STATUSES;
    if (type === "design") return DESIGN_STATUSES;
    if (type === "meeting") {
      return this.collectPool((n) => (n.fm.type === "meeting" && n.fm.theme ? [n.fm.theme] : []));
    }
    if (type === "knowledge") {
      return this.collectPool((n) => (n.fm.type === "knowledge" ? n.fm.techStack : []));
    }
    return [];
  }

  private recurringMeetings(): RecurringMeetingRef[] {
    return this.allNotes
      .filter((n) => n.fm.type === "meeting" && (n.fm as any).subtype === "recurring")
      .sort((a, b) => activityTimestamp(b) - activityTimestamp(a))
      .map((n) => ({ title: n.fm.title, path: n.file.path }));
  }

  private windowedNotes(): LogNote[] {
    if (hasActiveFilters(this.filters)) return applyFilters(this.allNotes, this.filters);
    const cutoff = Date.now() - this.monthsBack * 30 * 24 * 60 * 60 * 1000;
    return this.allNotes.filter((n) => activityTimestamp(n) >= cutoff);
  }

  private hasMoreHistory(): boolean {
    if (hasActiveFilters(this.filters)) return false;
    const cutoff = Date.now() - this.monthsBack * 30 * 24 * 60 * 60 * 1000;
    return this.allNotes.some((n) => activityTimestamp(n) < cutoff);
  }

  private renderDisplay() {
    const notes = this.windowedNotes().sort((a, b) => activityTimestamp(a) - activityTimestamp(b));

    this.unloadAllBodyComponents();

    const ctx: CardContext = {
      app: this.app,
      store: this.store,
      hostComponent: this,
      registerBodyComponent: (path, comp) => {
        const prev = this.bodyComponents.get(path);
        if (prev) prev.unload();
        this.bodyComponents.set(path, comp);
      },
      unregisterBodyComponent: (path) => {
        this.bodyComponents.get(path)?.unload();
        this.bodyComponents.delete(path);
      },
      isExpanded: (path) => this.expandedPath === path,
      expand: (path) => {
        this.feedEl
          .querySelectorAll(".logbook-card.is-expanded")
          .forEach((el) => el.classList.remove("is-expanded"));
        this.expandedPath = path;
      },
      collapse: (path) => {
        if (this.expandedPath === path) this.expandedPath = null;
        if (this.pendingNotePath === path) this.pendingNotePath = undefined;
      },
      pools: {
        projects: () => this.collectPool((n) => n.fm.projects),
        teams: () => this.collectPool((n) => n.fm.teams),
        tags: () => this.collectPool((n) => n.fm.tags),
        templates: () => this.templateTitles,
      },
      searchQuery: this.filters.query,
      onFilterTag: (tag) => {
        if (!this.filters.tags.includes(tag)) this.filters.tags = [...this.filters.tags, tag];
        this.afterFilterChange();
      },
      onFilterProject: (p) => this.addFilterValue("projects", p),
      onFilterTeam: (t) => this.addFilterValue("teams", t),
      onFilterType: (type) => {
        this.filters.type = type;
        this.filters.typeAttr = null;
        this.afterFilterChange();
      },
      onCreateTaskFromNote: (note) => void this.createTaskFromNote(note),
    };

    renderFeed(
      this.feedEl,
      {
        notes,
        filters: this.filters,
        hasMoreHistory: this.hasMoreHistory(),
        loadingMore: this.loadingMore,
        onLoadMore: () => void this.loadMoreHistory(),
        pendingDivider: this.pendingDivider,
        pendingNotePath: this.pendingNotePath,
      },
      ctx
    );
  }

  private async loadMoreHistory() {
    if (this.loadingMore || hasActiveFilters(this.filters)) return;
    this.loadingMore = true;
    this.renderDisplay();
    this.monthsBack += 1;
    this.loadingMore = false;
    this.renderDisplay();
  }

  private unloadAllBodyComponents() {
    for (const comp of this.bodyComponents.values()) comp.unload();
    this.bodyComponents.clear();
  }

  private async createAndShow(
    type: NoteType,
    titleOrQuestion: string,
    opts?: { done?: boolean; recurring?: boolean }
  ) {
    const file = opts?.done
      ? await this.store.createDoneTask(titleOrQuestion)
      : opts?.recurring
        ? await this.store.createRecurringMeeting(titleOrQuestion)
        : await this.store.createNote(type, titleOrQuestion);

    this.expandedPath = file.path;
    this.pendingDivider = `Writing a ${NOTE_TYPES[type].label.toLowerCase()}`;
    this.pendingNotePath = file.path;
    await this.refresh();
  }

  private async createTaskFromNote(source: LogNote) {
    const file = await this.store.createTaskFromNote(source);
    this.expandedPath = file.path;
    this.pendingDivider = "Writing a task";
    this.pendingNotePath = file.path;
    await this.refresh();
  }

  private async handleOccurrence(meeting: RecurringMeetingRef) {
    const file = this.app.vault.getAbstractFileByPath(meeting.path);
    if (!(file instanceof TFile)) return;
    const note = this.allNotes.find((n) => n.file.path === meeting.path);
    if (!note || note.fm.type !== "meeting") return;

    await this.store.addOrFindTodayOccurrence(file, note.fm as any);
    await this.app.workspace.openLinkText(file.path, "", false);

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.editor;
    if (editor) {
      const lines = editor.getValue().split("\n");
      const headingIdx = lines.findIndex((l) => /^## \d{4}-\d{2}-\d{2}$/.test(l));
      if (headingIdx >= 0) editor.setCursor({ line: headingIdx + 1, ch: 0 });
    }
  }
}
