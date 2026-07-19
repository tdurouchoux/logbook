import { ItemView, MarkdownView, Notice, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { LogbookSettings } from "../settings";
import { NoteStore } from "../note-store";
import { LogNote, NOTE_TYPES, NoteType, TASK_STATUSES, DESIGN_STATUSES, MEETING_AGENDAS, activityTimestamp } from "../types";
import { FilterState, applyFilters, emptyFilters, hasActiveFilters, filterSnapshot } from "../filters";
import { countLoggedItems, generateId, relativeTime, todayISO } from "../utils";
import { renderFeed, CardCache } from "./feed";
import { CardContext } from "./card";
import { Dock, RecurringMeetingRef } from "./dock";

export const VIEW_TYPE_LOGBOOK = "logbook-feed";

const INITIAL_WINDOW_MONTHS = 1;

export class LogbookView extends ItemView {
  private store: NoteStore;
  private feedEl!: HTMLElement;
  private statusBarEl!: HTMLElement;

  private allNotes: LogNote[] = [];
  private filters: FilterState = emptyFilters();
  private monthsBack = INITIAL_WINDOW_MONTHS;
  private loadingMore = false;

  private expandedPath: string | null = null;
  private frozenTimestamp: number | null = null;
  private frozenPinned: boolean | null = null;
  private activeCloseHandler: (() => void | Promise<void>) | null = null;
  private cardCache: CardCache = new Map();
  private pendingDivider: string | undefined;
  private pendingNotePath: string | undefined;

  private dock!: Dock;

  constructor(
    leaf: WorkspaceLeaf,
    private settings: LogbookSettings,
    private persistSettings: () => Promise<void>
  ) {
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
    this.statusBarEl = contentEl.createDiv("logbook-status-bar");
    const dockEl = contentEl.createDiv("logbook-dock");
    this.dock = new Dock(dockEl, {
      onSearch: (q) => {
        this.filters.query = q;
        this.renderDisplay();
      },
      onCreate: (type, title) => void this.createAndShow(type, title),
      onCreateRecurring: (title) => void this.createAndShow("recurring", title),
      onOpenDaily: () => void this.openDailyNote(),
      onAppendDaily: (text) => void this.appendToDailyNote(text),
      onFilterProject: (name) => this.addFilterValue("projects", name),
      onFilterTeam: (name) => this.addFilterValue("teams", name),
      onFilterTag: (name) => this.addFilterValue("tags", name),
      onFilterType: (type, attr) => {
        this.filters.type = type;
        this.filters.typeAttr = attr ?? null;
        this.afterFilterChange();
      },
      onExcludeType: (type, attr) => {
        this.filters.excludeType = type;
        this.filters.excludeTypeAttr = attr ?? null;
        this.afterFilterChange();
      },
      onClearFilters: () => {
        this.filters = emptyFilters();
        this.afterFilterChange();
      },
      onOccurrence: (meeting) => void this.handleOccurrence(meeting),
      onRemoveFilterChip: (kind, value) => this.removeFilterChip(kind, value),
      onApplyView: (name) => this.applyView(name),
      onSaveView: (name) => void this.saveView(name),
      getAllProjects: () => this.collectPool((n) => n.fm.projects),
      getAllTeams: () => this.collectPool((n) => n.fm.teams),
      getAllTags: () => this.collectPool((n) => n.tags),
      getTypeAttrValues: (type) => this.typeAttrValues(type),
      getRecurringMeetings: () => this.recurringMeetings(),
      getAllViews: () => this.settings.views.map((v) => v.name),
      getFilters: () => this.filters,
    });

    this.addAction("chevrons-up-down", "Toggle collapse mode", () => {
      contentEl.toggleClass("is-collapse-mode", !contentEl.hasClass("is-collapse-mode"));
    });

    this.registerEvent(this.app.vault.on("create", () => this.maybeRefresh()));
    this.registerEvent(this.app.vault.on("modify", () => this.maybeRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.maybeRefresh()));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => void this.handleRename(file, oldPath)));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.maybeRefresh()));
    this.store.onSettled(() => void this.refresh());

    await this.store.pruneExpiredNotes();
    await this.refresh();
    setTimeout(() => {
      this.feedEl.scrollTop = this.feedEl.scrollHeight;
    }, 80);

    // Keeps the status bar's red/orange/green state current purely from the
    // passage of time — including falling back to red once a midnight
    // rollover means todaysDailyNote() no longer finds a match, since
    // nothing here creates one; only /daily itself does that.
    this.registerInterval(window.setInterval(() => this.renderStatusBar(), 60_000));
  }

  private maybeRefresh() {
    if (this.store.isAnySuppressed()) return;
    void this.refresh();
  }

  private async refresh() {
    this.allNotes = await this.store.loadNotes();
    this.renderDisplay();
  }

  /** Editing Obsidian's own inline title (or renaming the file any other way —
   *  Quick Switcher, file explorer) is literally a vault rename, since the title
   *  doubles as the file name. Without this: every bit of state keyed by the old
   *  path (expandedPath, cardCache, pendingNotePath) goes stale, isExpanded()
   *  stops matching and the card looks frozen; and frontmatter `title` — the
   *  feed's actual display source — never gets told about the new name at all.
   *  Skipped when the rename came from our own renameTitle() (the card's title
   *  field), which already wrote the literal typed title itself. */
  private async handleRename(file: TAbstractFile, oldPath: string) {
    if (!(file instanceof TFile) || !file.path.startsWith(this.store.folder + "/")) return;

    if (this.expandedPath === oldPath) this.expandedPath = file.path;
    if (this.pendingNotePath === oldPath) this.pendingNotePath = file.path;
    this.cardCache.delete(oldPath);

    if (this.store.consumeSelfRename(file.path)) return;
    await this.store.updateFrontmatter(file, (fm) => {
      fm.title = file.basename;
    });
  }

  /** Esc on an expanded card (design.md §4): nothing was written to disk while
   *  editing, so discarding is just reloading disk-truth and forcing that one
   *  card to rebuild from it — every other card's cache entry stays untouched. */
  private async discardEdits(path: string) {
    this.allNotes = await this.store.loadNotes();
    this.cardCache.delete(path);
    if (this.expandedPath === path) {
      this.expandedPath = null;
      this.frozenTimestamp = null;
      this.frozenPinned = null;
      this.activeCloseHandler = null;
    }
    if (this.pendingNotePath === path) this.pendingNotePath = undefined;
    this.renderDisplay();
  }

  /** The expanded card's trash button (design.md §4) — soft-deletes via the store,
   *  discarding any staged edits outright. The card's own removal from the feed is
   *  driven by the vault "delete" event (registered in onOpen) like any other live
   *  refresh, not handled specially here. */
  private async deleteNote(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    if (this.expandedPath === path) {
      this.expandedPath = null;
      this.frozenTimestamp = null;
      this.frozenPinned = null;
      this.activeCloseHandler = null;
    }
    if (this.pendingNotePath === path) this.pendingNotePath = undefined;
    this.cardCache.delete(path);
    await this.store.deleteNote(file);
  }

  /** Backing the global `Mod+Enter` command (main.ts) — closing a card moves focus
   *  into the opened note's editor, so the shortcut can't be a card-scoped listener. */
  closeActiveCard() {
    if (this.activeCloseHandler) void this.activeCloseHandler();
  }

  /** Backing the command-palette creation shortcuts (main.ts) — jumps straight into
   *  the same prefilled-dock flow as picking the command from its own dropdown. */
  focusDockCommand(key: string) {
    this.dock.runCommand(key);
  }

  private addFilterValue(key: "projects" | "teams" | "tags", value: string) {
    if (!this.filters[key].includes(value)) this.filters[key] = [...this.filters[key], value];
    this.afterFilterChange();
  }

  private removeFilterChip(
    kind: "project" | "team" | "tag" | "type" | "typeAttr" | "excludeType" | "excludeTypeAttr",
    value?: string
  ) {
    if (kind === "project") this.filters.projects = this.filters.projects.filter((v) => v !== value);
    else if (kind === "team") this.filters.teams = this.filters.teams.filter((v) => v !== value);
    else if (kind === "tag") this.filters.tags = this.filters.tags.filter((v) => v !== value);
    else if (kind === "type") {
      this.filters.type = null;
      this.filters.typeAttr = null;
    } else if (kind === "typeAttr") this.filters.typeAttr = null;
    else if (kind === "excludeType") {
      this.filters.excludeType = null;
      this.filters.excludeTypeAttr = null;
    } else if (kind === "excludeTypeAttr") this.filters.excludeTypeAttr = null;
    this.afterFilterChange();
  }

  private afterFilterChange() {
    this.dock.renderChips();
    this.renderDisplay();
  }

  /** /view <name> — applies a saved filter combination on top of the current
   *  search query, which a view deliberately doesn't capture (see filterSnapshot). */
  private applyView(name: string) {
    const view = this.settings.views.find((v) => v.name === name);
    if (!view) return;
    this.filters = { ...this.filters, ...view.filters };
    this.afterFilterChange();
    new Notice(`Applied view "${name}"`);
  }

  /** /saveview <name> — snapshots the currently active filters as a new saved
   *  view, or overwrites an existing one of the same name. */
  private async saveView(name: string) {
    const snapshot = filterSnapshot(this.filters);
    const existing = this.settings.views.find((v) => v.name === name);
    if (existing) {
      existing.filters = snapshot;
    } else {
      this.settings.views.push({ id: generateId(), name, filters: snapshot });
    }
    await this.persistSettings();
    new Notice(`Saved view "${name}"`);
  }

  private collectPool(pick: (n: LogNote) => string[]): string[] {
    return [...new Set(this.allNotes.flatMap(pick))].sort();
  }

  /** Values for a type's filterAttr (design.md §12 /type two-step flow): all three are closed enums. */
  private typeAttrValues(type: NoteType): string[] {
    if (type === "task") return TASK_STATUSES;
    if (type === "design") return DESIGN_STATUSES;
    if (type === "meeting") return MEETING_AGENDAS;
    return [];
  }

  private recurringMeetings(): RecurringMeetingRef[] {
    return this.allNotes
      .filter((n) => n.fm.type === "recurring")
      .sort((a, b) => activityTimestamp(b) - activityTimestamp(a))
      .map((n) => ({ title: n.fm.title, path: n.file.path }));
  }

  /** Whether `n` belongs in the Pinned section (design.md §3) — frozen at expand time
   *  (mirroring sortKey's frozenTimestamp) so a mid-edit pin toggle doesn't move a card
   *  between the regular feed and the Pinned section until it collapses. */
  private isPinnedFor(n: LogNote): boolean {
    if (this.expandedPath === n.file.path && this.frozenPinned !== null) return this.frozenPinned;
    return !!n.fm.pinned;
  }

  private windowedNotes(): LogNote[] {
    if (hasActiveFilters(this.filters)) {
      return applyFilters(this.allNotes, this.filters).filter((n) => !this.isPinnedFor(n));
    }
    const cutoff = Date.now() - this.monthsBack * 30 * 24 * 60 * 60 * 1000;
    return this.allNotes.filter((n) => !this.isPinnedFor(n) && activityTimestamp(n) >= cutoff);
  }

  /** Pinned section (design.md §3): exempt from the history-window cutoff, but still
   *  subject to active filters/search like the rest of the feed. */
  private pinnedNotes(): LogNote[] {
    const base = hasActiveFilters(this.filters) ? applyFilters(this.allNotes, this.filters) : this.allNotes;
    return base.filter((n) => this.isPinnedFor(n));
  }

  private hasMoreHistory(): boolean {
    if (hasActiveFilters(this.filters)) return false;
    const cutoff = Date.now() - this.monthsBack * 30 * 24 * 60 * 60 * 1000;
    return this.allNotes.some((n) => !this.isPinnedFor(n) && activityTimestamp(n) < cutoff);
  }

  /** Pins the expanded card's sort position so a frontmatter edit (e.g. a status pill click)
   *  can't move the card the user is actively looking at out from under them. */
  private sortKey(n: LogNote): number {
    if (this.expandedPath === n.file.path && this.frozenTimestamp !== null) return this.frozenTimestamp;
    return activityTimestamp(n);
  }

  private renderDisplay() {
    const notes = this.windowedNotes().sort((a, b) => this.sortKey(a) - this.sortKey(b));
    const pinned = this.pinnedNotes().sort((a, b) => this.sortKey(a) - this.sortKey(b));

    const ctx: CardContext = {
      app: this.app,
      store: this.store,
      isExpanded: (path) => this.expandedPath === path,
      expand: (path, onForceClose) => {
        const prevClose = this.activeCloseHandler;
        this.activeCloseHandler = onForceClose;
        this.expandedPath = path;
        const note = this.allNotes.find((n) => n.file.path === path);
        this.frozenTimestamp = note ? activityTimestamp(note) : null;
        this.frozenPinned = note ? !!note.fm.pinned : null;
        // Run the previously-expanded card's own close handler (commit + collapse-UI)
        // instead of stripping .is-expanded directly, so its staged edits get saved
        // and its pillsRow node isn't left stranded in the expanded DOM position.
        if (prevClose) void prevClose();
      },
      // For a card that's already expanded when it first renders (e.g. right after
      // creation, where expandedPath is set directly rather than via expand() above)
      // — registers its close handler without disturbing expandedPath/frozenTimestamp
      // or force-closing anything, so Mod+Enter and cross-card switches still save it.
      registerCloseHandler: (path, onForceClose) => {
        if (this.expandedPath === path) this.activeCloseHandler = onForceClose;
      },
      collapse: (path) => {
        if (this.expandedPath === path) {
          this.expandedPath = null;
          this.frozenTimestamp = null;
          this.frozenPinned = null;
          this.activeCloseHandler = null;
        }
        if (this.pendingNotePath === path) this.pendingNotePath = undefined;
        // Unfreezing sortKey above only takes effect on the next render — a body-only
        // edit (typed straight into Obsidian's editor) never goes through the store's
        // write queue, so there's no onSettled-triggered refresh() to re-sort by the
        // now-current mtime like a frontmatter commit gets. Force that re-render here.
        this.renderDisplay();
      },
      discardEdits: (path) => void this.discardEdits(path),
      deleteNote: (path) => void this.deleteNote(path),
      pools: {
        projects: () => this.collectPool((n) => n.fm.projects),
        teams: () => this.collectPool((n) => n.fm.teams),
      },
      searchQuery: this.filters.query,
      onFilterProject: (p) => this.addFilterValue("projects", p),
      onFilterTeam: (t) => this.addFilterValue("teams", t),
      onFilterType: (type, attr) => {
        this.filters.type = type;
        this.filters.typeAttr = attr ?? null;
        this.afterFilterChange();
      },
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
        activityOf: (n) => this.sortKey(n),
        pinnedNotes: pinned,
      },
      ctx,
      this.cardCache
    );
    this.renderStatusBar();
  }

  private todaysDailyNote(): LogNote | undefined {
    const today = todayISO();
    return this.allNotes.find((n) => n.fm.type === "daily" && n.file.basename === today);
  }

  /** design.md §3, §5.8 — red (no daily note exists yet today) / orange (idle
   *  past the configured threshold) / green (logged within it), driven purely
   *  off today's daily note's mtime and logged-item count. Nothing here ever
   *  creates the note — only /daily does that. */
  private renderStatusBar() {
    const note = this.todaysDailyNote();
    const count = note ? countLoggedItems(note.body) : 0;

    let state: "red" | "orange" | "green";
    let icon: string;
    let text: string;

    if (!note) {
      state = "red";
      icon = "🌱";
      text = "No daily note yet — try /daily";
    } else {
      const idleMs = this.settings.dailyIdleMinutes * 60_000;
      const sinceMs = Date.now() - note.file.stat.mtime;
      const plural = count === 1 ? "task" : "tasks";
      const last = relativeTime(new Date(note.file.stat.mtime));
      if (sinceMs > idleMs) {
        state = "orange";
        icon = "⏳";
        text = `${count} ${plural} logged today · idle since ${last}`;
      } else {
        state = "green";
        icon = "🔥";
        text = `${count} ${plural} logged today · last ${last}`;
      }
    }

    this.statusBarEl.empty();
    this.statusBarEl.removeClass("is-red", "is-orange", "is-green");
    this.statusBarEl.addClass(`is-${state}`);
    this.statusBarEl.createSpan({ cls: "logbook-status-icon", text: icon });
    this.statusBarEl.createSpan({ cls: "logbook-status-msg", text });
  }

  /** /daily with no text (design.md §7) — jumps to today's note without
   *  force-expanding its feed card, mirroring handleOccurrence()'s "open an
   *  existing/just-ensured note" pattern rather than createAndShow()'s. */
  private async openDailyNote() {
    const file = await this.store.ensureDailyNote();
    await this.refresh();
    await this.app.workspace.openLinkText(file.path, "", false);
  }

  /** /daily <text> (design.md §7) — appends a logged item without navigating
   *  to the note or expanding its card. */
  private async appendToDailyNote(text: string) {
    const file = await this.store.ensureDailyNote();
    await this.store.appendDailyItem(file, text);
  }

  private async loadMoreHistory() {
    if (this.loadingMore || hasActiveFilters(this.filters)) return;
    this.loadingMore = true;
    this.renderDisplay();
    this.monthsBack += 1;
    this.loadingMore = false;
    this.renderDisplay();
  }

  private async createAndShow(type: NoteType, title: string) {
    // Mirrors what ctx.expand() does when switching between two existing cards
    // (commit + collapse the previously-open one) — createAndShow sets
    // expandedPath directly rather than going through ctx.expand(), so without
    // this the previously-open card was left expanded with its edits unsaved.
    if (this.activeCloseHandler) await this.activeCloseHandler();

    const file = type === "recurring"
      ? await this.store.createRecurringMeeting(title)
      : await this.store.createNote(type, title);

    this.expandedPath = file.path;
    this.pendingDivider = `Writing a ${NOTE_TYPES[type].label.toLowerCase()}`;
    this.pendingNotePath = file.path;
    await this.refresh();
    // Also bypassed by not going through ctx.expand(): opening the new note in
    // Obsidian's own editor, same as expanding any other card does.
    await this.app.workspace.openLinkText(file.path, "", false);
  }

  private async handleOccurrence(meeting: RecurringMeetingRef) {
    const file = this.app.vault.getAbstractFileByPath(meeting.path);
    if (!(file instanceof TFile)) return;
    const note = this.allNotes.find((n) => n.file.path === meeting.path);
    if (!note || note.fm.type !== "recurring") return;

    await this.store.addOrFindTodayOccurrence(file, note.fm);
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
