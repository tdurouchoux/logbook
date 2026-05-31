import {
  App,
  ItemView,
  MarkdownRenderer,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";

const VIEW_TYPE_LOGBOOK = "logbook-feed";

interface NoteTypeConfig {
  label: string;
  color: string;
  desc: string;
}

const NOTE_TYPES: Record<string, NoteTypeConfig> = {
  draft:     { label: "Draft",     color: "#807966", desc: "Quick unstructured capture" },
  task:      { label: "Task",      color: "#c89844", desc: "An action with a state" },
  meeting:   { label: "Meeting",   color: "#5b8db8", desc: "Notes from a conversation" },
  thoughts:  { label: "Thoughts",  color: "#8a5cb2", desc: "Exploration of an idea" },
  knowledge: { label: "Knowledge", color: "#7a9956", desc: "Something worth remembering" },
  design:    { label: "Design",    color: "#9b6db5", desc: "Technical design note" },
};

const ALL_COMMANDS = Object.entries(NOTE_TYPES).map(([key, cfg]) => ({ key, ...cfg }));

interface LogbookSettings {
  folder: string;
}

const DEFAULT_SETTINGS: LogbookSettings = { folder: "logbook" };

interface LogNote {
  file: TFile;
  title: string;
  type: string;
  body: string;
  updatedAt: string;
  tags: string[];
  projects: string[];
}

// ─── View ────────────────────────────────────────────────────────────────────

class LogbookView extends ItemView {
  private settings: LogbookSettings;
  private feedEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private dropdownEl!: HTMLElement;

  // command-bar state
  private dropdownVisible = false;
  private dropdownIdx = 0;
  private filteredCmds: typeof ALL_COMMANDS = [];

  // expanded card
  private expandedPath: string | null = null;

  // project autocomplete pool
  private allProjects: string[] = [];

  // suppress refresh while the user is editing a project picker
  private skipRefreshUntil = 0;

  constructor(leaf: WorkspaceLeaf, settings: LogbookSettings) {
    super(leaf);
    this.settings = settings;
  }

  getViewType(): string    { return VIEW_TYPE_LOGBOOK; }
  getDisplayText(): string { return "Logbook"; }
  getIcon(): string        { return "book-open"; }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("logbook-view");

    // ── Feed ──────────────────────────────────────────────────────────────
    this.feedEl = contentEl.createDiv("logbook-feed");

    // ── Dock ──────────────────────────────────────────────────────────────
    const dock = contentEl.createDiv("logbook-dock");

    // Dropdown (rises above the input)
    this.dropdownEl = dock.createDiv("logbook-cmd-dropdown");
    this.dropdownEl.style.display = "none";

    // Input
    this.inputEl = dock.createEl("input", {
      cls: "logbook-input",
      attr: {
        type: "text",
        placeholder: "Write a note, or type / for a type…",
        spellcheck: "false",
      },
    });

    this.inputEl.addEventListener("input", () => this.onInput());
    this.inputEl.addEventListener("keydown", (e) => this.onKeydown(e));

    // Close dropdown on outside click
    document.addEventListener("click", (e) => {
      if (!dock.contains(e.target as Node)) this.closeDropdown();
    });

    // Vault reactivity
    this.registerEvent(this.app.vault.on("create",  () => this.refresh()));
    this.registerEvent(this.app.vault.on("modify",  () => this.refresh()));
    this.registerEvent(this.app.vault.on("delete",  () => this.refresh()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.refresh()));

    await this.refresh();
    setTimeout(() => { this.feedEl.scrollTop = this.feedEl.scrollHeight; }, 80);
  }

  async onClose() {}

  // ── Command bar ───────────────────────────────────────────────────────────

  private onInput() {
    const val = this.inputEl.value;

    if (val.startsWith("/")) {
      const rest = val.slice(1);
      const spaceIdx = rest.indexOf(" ");

      if (spaceIdx === -1) {
        // Still picking a command — show filtered dropdown
        this.filteredCmds = ALL_COMMANDS.filter((c) =>
          c.key.startsWith(rest.toLowerCase())
        );
        this.dropdownIdx = Math.min(this.dropdownIdx, Math.max(0, this.filteredCmds.length - 1));
        this.showDropdown();
        this.inputEl.addClass("is-command");
      } else {
        // Command picked, typing the title now
        this.closeDropdown();
        this.inputEl.addClass("is-command");
        const cmdKey = rest.slice(0, spaceIdx).toLowerCase();
        const typeInfo = NOTE_TYPES[cmdKey];
        this.inputEl.placeholder = typeInfo
          ? `${typeInfo.label} title…`
          : "Note title…";
      }
    } else {
      this.closeDropdown();
      this.inputEl.removeClass("is-command");
      this.inputEl.placeholder = "Write a note, or type / for a type…";
    }
  }

  private onKeydown(e: KeyboardEvent) {
    if (this.dropdownVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.dropdownIdx = (this.dropdownIdx + 1) % this.filteredCmds.length;
        this.renderDropdown();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.dropdownIdx =
          (this.dropdownIdx - 1 + this.filteredCmds.length) % this.filteredCmds.length;
        this.renderDropdown();
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (this.filteredCmds[this.dropdownIdx]) {
          this.pickCommand(this.filteredCmds[this.dropdownIdx].key);
        }
      } else if (e.key === "Escape") {
        this.inputEl.value = "";
        this.closeDropdown();
        this.inputEl.removeClass("is-command");
        this.inputEl.placeholder = "Write a note, or type / for a type…";
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      this.handleEnter();
    } else if (e.key === "Escape") {
      this.inputEl.value = "";
      this.inputEl.removeClass("is-command");
      this.inputEl.placeholder = "Write a note, or type / for a type…";
    }
  }

  private handleEnter() {
    const val = this.inputEl.value.trim();
    if (!val) return;

    if (val.startsWith("/")) {
      const rest = val.slice(1);
      const spaceIdx = rest.indexOf(" ");
      if (spaceIdx >= 0) {
        const cmdKey = rest.slice(0, spaceIdx).toLowerCase();
        const title  = rest.slice(spaceIdx + 1).trim();
        if (title && NOTE_TYPES[cmdKey]) {
          this.createNote(title, cmdKey);
          this.resetInput();
        }
      }
      // If no space yet, prompt user to keep typing
    } else {
      // Plain text → draft
      this.createNote(val, "draft");
      this.resetInput();
    }
  }

  private pickCommand(key: string) {
    this.inputEl.value = `/${key} `;
    this.closeDropdown();
    this.inputEl.focus();
    this.onInput(); // refresh placeholder
  }

  private showDropdown() {
    this.dropdownEl.style.display = "block";
    this.dropdownVisible = true;
    this.renderDropdown();
  }

  private closeDropdown() {
    this.dropdownEl.style.display = "none";
    this.dropdownVisible = false;
    this.dropdownIdx = 0;
  }

  private renderDropdown() {
    this.dropdownEl.empty();

    if (this.filteredCmds.length === 0) {
      this.dropdownEl.createEl("div", {
        cls: "logbook-cmd-empty",
        text: "No matching type",
      });
      return;
    }

    this.filteredCmds.forEach((cmd, i) => {
      const item = this.dropdownEl.createDiv("logbook-cmd-item");
      if (i === this.dropdownIdx) item.addClass("is-selected");

      item.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus on input
        this.pickCommand(cmd.key);
      });
      item.addEventListener("mouseenter", () => {
        this.dropdownIdx = i;
        this.renderDropdown();
      });

      const left = item.createDiv("logbook-cmd-item-left");
      this.renderBadge(left, cmd.key);
      left.createEl("span", { cls: "logbook-cmd-desc", text: cmd.desc });

      item.createEl("kbd", { cls: "logbook-cmd-key", text: `/${cmd.key}` });
    });
  }

  private resetInput() {
    this.inputEl.value = "";
    this.inputEl.removeClass("is-command");
    this.inputEl.placeholder = "Write a note, or type / for a type…";
  }

  // ── Data ─────────────────────────────────────────────────────────────────

  private async refresh() {
    if (Date.now() < this.skipRefreshUntil) return;
    const notes = await this.loadNotes();
    this.allProjects = [...new Set(notes.flatMap((n) => n.projects))].sort();
    this.renderFeed(notes);
  }

  private async loadNotes(): Promise<LogNote[]> {
    const prefix = this.settings.folder + "/";
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix));

    const notes: LogNote[] = [];
    for (const file of files) {
      const fm      = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const content = await this.app.vault.cachedRead(file);

      let body = content;
      if (content.startsWith("---")) {
        const end = content.indexOf("\n---\n", 3);
        body = end >= 0 ? content.slice(end + 5).trim() : "";
      }

      notes.push({
        file,
        title:     fm?.title    ?? file.basename,
        type:      fm?.type     ?? "draft",
        body,
        updatedAt: fm?.updatedAt ?? new Date(file.stat.mtime).toISOString(),
        tags:      Array.isArray(fm?.tags)     ? fm.tags     : [],
        projects:  Array.isArray(fm?.projects) ? fm.projects : [],
      });
    }

    return notes.sort(
      (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    );
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private renderFeed(notes: LogNote[]) {
    const atBottom =
      this.feedEl.scrollHeight - this.feedEl.scrollTop <=
      this.feedEl.clientHeight + 80;

    this.feedEl.empty();

    if (notes.length === 0) {
      const empty = this.feedEl.createDiv("logbook-empty");
      empty.createEl("p", { text: "Nothing here yet." });
      empty.createEl("p", { cls: "logbook-empty-hint", text: "Type / to pick a note type, or just write to capture a draft." });
      return;
    }

    for (const [label, group] of groupByDay(notes)) {
      const divider = this.feedEl.createDiv("logbook-divider");
      divider.createSpan({ text: label });
      for (const note of group) this.renderCard(note);
    }

    if (atBottom) {
      this.feedEl.scrollTop = this.feedEl.scrollHeight;
    }
  }

  private renderCard(note: LogNote) {
    const typeInfo = NOTE_TYPES[note.type] ?? NOTE_TYPES.draft;
    const isExpanded = note.file.path === this.expandedPath;

    const card = this.feedEl.createDiv("logbook-card");
    card.style.setProperty("--card-type-color", typeInfo.color);
    if (isExpanded) card.addClass("is-expanded");

    // ── Collapsed header (always visible) ────────────────────────────────
    const header = card.createDiv("logbook-card-header");

    const top = header.createDiv("logbook-card-top");
    this.renderBadge(top, note.type);

    // Project chips (read-only in collapsed view)
    for (const p of note.projects) {
      top.createEl("span", { cls: "logbook-project-chip", text: p });
    }

    // Chevron — rotates when expanded
    const chevron = top.createEl("span", { cls: "logbook-chevron" });
    chevron.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"/></svg>`;

    top.createEl("span", {
      cls: "logbook-time",
      text: relativeTime(new Date(note.updatedAt)),
    });

    header.createEl("div", { cls: "logbook-title", text: note.title });

    // Preview + tags (hidden when expanded)
    const previewWrap = header.createDiv("logbook-card-preview-wrap");
    if (note.body) {
      const plain = note.body.replace(/^#{1,4}\s+/gm, "").slice(0, 160);
      previewWrap.createEl("div", { cls: "logbook-preview", text: plain });
    }
    if (note.tags.length > 0) {
      const tagsRow = previewWrap.createDiv("logbook-tags");
      for (const tag of note.tags) {
        tagsRow.createEl("span", { cls: "logbook-tag", text: "#" + tag });
      }
    }

    // ── Expanded section (animated open/close) ────────────────────────────
    const expandWrap  = card.createDiv("logbook-card-expand");
    const expandInner = expandWrap.createDiv("logbook-card-expand-inner");

    expandInner.createEl("div", { cls: "logbook-sep" });

    const bodyEl = expandInner.createDiv("logbook-expanded-body");
    if (!note.body) {
      bodyEl.createEl("p", { cls: "logbook-no-body", text: "No content yet." });
    }

    // Project picker (editable)
    this.renderProjectPicker(expandInner, note);

    const expandFooter = expandInner.createDiv("logbook-expand-footer");
    if (note.tags.length > 0) {
      const tagsRow = expandFooter.createDiv("logbook-tags");
      for (const tag of note.tags) {
        tagsRow.createEl("span", { cls: "logbook-tag", text: "#" + tag });
      }
    }
    const openBtn = expandFooter.createEl("button", {
      cls: "logbook-open-btn",
      text: "Open note →",
    });
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.app.workspace.openLinkText(note.file.path, "", false);
    });

    // ── Toggle logic ──────────────────────────────────────────────────────
    let rendered = false;

    // If the card is being re-rendered while already expanded (e.g. after a
    // project save), render markdown immediately instead of waiting for a click.
    if (isExpanded && note.body) {
      rendered = true;
      MarkdownRenderer.render(this.app, note.body, bodyEl, note.file.path, this);
    }

    const expand = async () => {
      // Collapse any currently open card
      this.feedEl.querySelectorAll(".logbook-card.is-expanded").forEach((el) =>
        el.classList.remove("is-expanded")
      );
      this.expandedPath = note.file.path;
      card.addClass("is-expanded");

      // Lazy-render markdown on first open
      if (!rendered && note.body) {
        rendered = true;
        await MarkdownRenderer.render(
          this.app, note.body, bodyEl, note.file.path, this
        );
      }
    };

    const collapse = () => {
      this.expandedPath = null;
      card.removeClass("is-expanded");
    };

    header.addEventListener("click", () => {
      card.hasClass("is-expanded") ? collapse() : expand();
    });
  }

  // ── Project picker ────────────────────────────────────────────────────────

  private renderProjectPicker(container: HTMLElement, note: LogNote) {
    const wrap = container.createDiv("logbook-project-picker");
    wrap.addEventListener("click", (e) => e.stopPropagation()); // don't collapse card

    const renderChips = (projects: string[]) => {
      wrap.empty();

      const label = wrap.createEl("span", { cls: "logbook-picker-label", text: "Projects" });

      for (const p of projects) {
        const chip = wrap.createEl("span", { cls: "logbook-project-chip is-editable" });
        chip.createEl("span", { text: p });
        const x = chip.createEl("button", { cls: "logbook-chip-remove", text: "×" });
        x.addEventListener("click", async () => {
          const updated = note.projects.filter((v) => v !== p);
          note.projects = updated;
          await this.updateNoteProjects(note.file, updated);
          renderChips(updated);
        });
      }

      // ── Add-project input ────────────────────────────────────────────
      const inputWrap  = wrap.createDiv("logbook-picker-input-wrap");
      const input      = inputWrap.createEl("input", {
        cls: "logbook-picker-input",
        attr: { type: "text", placeholder: "+ project", spellcheck: "false" },
      });
      const suggestEl  = inputWrap.createDiv("logbook-picker-suggestions");
      suggestEl.style.display = "none";

      let filtered: string[] = [];
      let suggestIdx = 0;

      const renderSuggestions = () => {
        suggestEl.empty();
        if (!filtered.length) { suggestEl.style.display = "none"; return; }
        suggestEl.style.display = "block";
        filtered.forEach((p, i) => {
          const item = suggestEl.createDiv("logbook-suggest-item");
          if (i === suggestIdx) item.addClass("is-selected");
          item.setText(p);
          item.addEventListener("mousedown", (e) => { e.preventDefault(); addProject(p); });
          item.addEventListener("mouseenter", () => { suggestIdx = i; renderSuggestions(); });
        });
      };

      const addProject = async (raw: string) => {
        const name = raw.toLowerCase().trim().replace(/\s+/g, "-");
        if (!name || note.projects.includes(name)) return;
        const updated = [...note.projects, name];
        note.projects = updated;
        input.value = "";
        suggestEl.style.display = "none";
        await this.updateNoteProjects(note.file, updated);
        renderChips(updated);
      };

      input.addEventListener("input", () => {
        const val = input.value.toLowerCase().trim();
        if (!val) { suggestEl.style.display = "none"; return; }
        filtered = this.allProjects.filter(
          (p) => p.includes(val) && !note.projects.includes(p)
        );
        suggestIdx = 0;
        renderSuggestions();
      });

      input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault(); e.stopPropagation();
          const candidate = filtered[suggestIdx];
          await addProject(candidate ?? input.value);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          suggestIdx = Math.min(suggestIdx + 1, filtered.length - 1);
          renderSuggestions();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          suggestIdx = Math.max(suggestIdx - 1, 0);
          renderSuggestions();
        } else if (e.key === "Backspace" && !input.value && note.projects.length) {
          e.stopPropagation();
          const updated = note.projects.slice(0, -1);
          note.projects = updated;
          await this.updateNoteProjects(note.file, updated);
          renderChips(updated);
        } else if (e.key === "Escape") {
          e.stopPropagation();
          input.value = "";
          suggestEl.style.display = "none";
        }
      });

      input.addEventListener("blur", () => {
        setTimeout(() => { suggestEl.style.display = "none"; }, 160);
      });
    };

    renderChips(note.projects);
  }

  private async updateNoteProjects(file: TFile, projects: string[]) {
    // Suppress the vault-change refresh so the picker DOM isn't destroyed
    this.skipRefreshUntil = Date.now() + 600;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.projects = projects;
    });
  }

  private renderBadge(parent: HTMLElement, type: string) {
    const typeInfo = NOTE_TYPES[type] ?? NOTE_TYPES.draft;
    const badge = parent.createEl("span", { cls: "logbook-badge" });
    badge.style.setProperty("--badge-color", typeInfo.color);
    const dot = badge.createEl("span", { cls: "logbook-badge-dot" });
    dot.style.background = typeInfo.color;
    badge.createSpan({ text: typeInfo.label.toUpperCase() });
    return badge;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  private async createNote(title: string, type: string) {
    const folder = this.settings.folder;
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    let path = normalizePath(`${folder}/${slug}.md`);
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${folder}/${slug}_${i++}.md`);
    }

    const now = new Date().toISOString();
    await this.app.vault.create(
      path,
      `---\ntype: ${type}\ntitle: "${title}"\ntags: []\nprojects: []\nteams: []\ncreatedAt: ${now}\nupdatedAt: ${now}\npinned: false\n---\n\n`
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByDay(notes: LogNote[]): [string, LogNote[]][] {
  const map       = new Map<string, LogNote[]>();
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const note of notes) {
    const d = new Date(note.updatedAt);
    let label: string;
    if (sameDay(d, today))     label = "Today";
    else if (sameDay(d, yesterday)) label = "Yesterday";
    else label = d.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });

    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(note);
  }

  return Array.from(map.entries());
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

function relativeTime(date: Date): string {
  const diff  = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)  return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return date.toLocaleDateString("en", { day: "numeric", month: "short" });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

class LogbookSettingTab extends PluginSettingTab {
  plugin: LogbookPlugin;
  constructor(app: App, plugin: LogbookPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Logbook" });
    new Setting(containerEl)
      .setName("Logbook folder")
      .setDesc("Vault folder where logbook notes are stored.")
      .addText((text) =>
        text.setValue(this.plugin.settings.folder).onChange(async (value) => {
          this.plugin.settings.folder = value.trim() || "logbook";
          await this.plugin.saveSettings();
        })
      );
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class LogbookPlugin extends Plugin {
  settings!: LogbookSettings;

  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_LOGBOOK, (leaf) => new LogbookView(leaf, this.settings));
    this.addRibbonIcon("book-open", "Open Logbook", () => this.activateView());
    this.addCommand({ id: "open-logbook", name: "Open Logbook", callback: () => this.activateView() });
    this.addSettingTab(new LogbookSettingTab(this.app, this));
  }

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LOGBOOK);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_LOGBOOK, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
