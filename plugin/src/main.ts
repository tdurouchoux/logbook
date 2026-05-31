import {
  App,
  ItemView,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";

const VIEW_TYPE_LOGBOOK = "logbook-feed";

const NOTE_TYPES: Record<string, { label: string; color: string }> = {
  draft:     { label: "Draft",     color: "#807966" },
  task:      { label: "Task",      color: "#c89844" },
  meeting:   { label: "Meeting",   color: "#5b8db8" },
  thoughts:  { label: "Thoughts",  color: "#8a5cb2" },
  knowledge: { label: "Knowledge", color: "#7a9956" },
  design:    { label: "Design",    color: "#9b6db5" },
};

interface LogbookSettings {
  folder: string;
}

const DEFAULT_SETTINGS: LogbookSettings = {
  folder: "logbook",
};

interface LogNote {
  file: TFile;
  title: string;
  type: string;
  body: string;
  updatedAt: string;
  tags: string[];
}

// ─── View ────────────────────────────────────────────────────────────────────

class LogbookView extends ItemView {
  private settings: LogbookSettings;
  private feedEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private typeSelectEl!: HTMLSelectElement;

  constructor(leaf: WorkspaceLeaf, settings: LogbookSettings) {
    super(leaf);
    this.settings = settings;
  }

  getViewType(): string  { return VIEW_TYPE_LOGBOOK; }
  getDisplayText(): string { return "Logbook"; }
  getIcon(): string { return "book-open"; }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("logbook-view");

    this.feedEl = contentEl.createDiv("logbook-feed");

    const dock = contentEl.createDiv("logbook-dock");

    this.typeSelectEl = dock.createEl("select", { cls: "logbook-type-select" });
    for (const [key, { label }] of Object.entries(NOTE_TYPES)) {
      this.typeSelectEl.createEl("option", { value: key, text: label });
    }

    this.inputEl = dock.createEl("input", {
      cls: "logbook-input",
      attr: { placeholder: "Write a note… press Enter to save", type: "text" },
    });

    this.inputEl.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && this.inputEl.value.trim()) {
        await this.createNote(this.inputEl.value.trim(), this.typeSelectEl.value);
        this.inputEl.value = "";
      }
    });

    this.registerEvent(this.app.vault.on("create",  () => this.refresh()));
    this.registerEvent(this.app.vault.on("modify",  () => this.refresh()));
    this.registerEvent(this.app.vault.on("delete",  () => this.refresh()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.refresh()));

    await this.refresh();
    // Scroll to bottom after first render
    setTimeout(() => { this.feedEl.scrollTop = this.feedEl.scrollHeight; }, 80);
  }

  async onClose() {}

  // ── Data ──────────────────────────────────────────────────────────────────

  private async refresh() {
    const notes = await this.loadNotes();
    this.renderFeed(notes);
  }

  private async loadNotes(): Promise<LogNote[]> {
    const prefix = this.settings.folder + "/";
    const files = this.app.vault.getMarkdownFiles().filter(
      (f) => f.path.startsWith(prefix)
    );

    const notes: LogNote[] = [];
    for (const file of files) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const content = await this.app.vault.cachedRead(file);

      // Strip YAML front matter to get body
      let body = content;
      if (content.startsWith("---")) {
        const end = content.indexOf("\n---\n", 3);
        body = end >= 0 ? content.slice(end + 5).trim() : "";
      }

      notes.push({
        file,
        title: fm?.title ?? file.basename,
        type:  fm?.type  ?? "draft",
        body,
        updatedAt: fm?.updatedAt ?? new Date(file.stat.mtime).toISOString(),
        tags: Array.isArray(fm?.tags) ? fm.tags : [],
      });
    }

    // Oldest first → newest at the bottom
    return notes.sort(
      (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    );
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private renderFeed(notes: LogNote[]) {
    // Remember if the user was already at the bottom
    const atBottom =
      this.feedEl.scrollHeight - this.feedEl.scrollTop <=
      this.feedEl.clientHeight + 80;

    this.feedEl.empty();

    if (notes.length === 0) {
      const empty = this.feedEl.createDiv("logbook-empty");
      empty.setText("No notes yet — start writing below.");
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
    const card = this.feedEl.createDiv("logbook-card");
    card.addEventListener("click", () => {
      this.app.workspace.openLinkText(note.file.path, "", false);
    });

    // Top row: badge + time
    const top = card.createDiv("logbook-card-top");
    const typeInfo = NOTE_TYPES[note.type] ?? NOTE_TYPES.draft;
    const badge = top.createEl("span", {
      cls: "logbook-badge",
      text: typeInfo.label.toUpperCase(),
    });
    badge.style.setProperty("--badge-color", typeInfo.color);
    top.createEl("span", {
      cls: "logbook-time",
      text: relativeTime(new Date(note.updatedAt)),
    });

    // Title
    card.createEl("div", { cls: "logbook-title", text: note.title });

    // Body preview (strip markdown syntax noise)
    if (note.body) {
      const plain = note.body.replace(/^#{1,4}\s+/gm, "").slice(0, 140);
      card.createEl("div", { cls: "logbook-preview", text: plain });
    }

    // Tags
    if (note.tags.length > 0) {
      const tagsRow = card.createDiv("logbook-tags");
      for (const tag of note.tags) {
        tagsRow.createEl("span", { cls: "logbook-tag", text: "#" + tag });
      }
    }
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
    const content =
`---
type: ${type}
title: "${title}"
tags: []
projects: []
teams: []
createdAt: ${now}
updatedAt: ${now}
pinned: false
---

`;
    await this.app.vault.create(path, content);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByDay(notes: LogNote[]): [string, LogNote[]][] {
  const map = new Map<string, LogNote[]>();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const note of notes) {
    const d = new Date(note.updatedAt);
    let label: string;
    if (sameDay(d, today)) label = "Today";
    else if (sameDay(d, yesterday)) label = "Yesterday";
    else
      label = d.toLocaleDateString("en", {
        weekday: "long",
        month: "short",
        day: "numeric",
      });

    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(note);
  }

  return Array.from(map.entries());
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return date.toLocaleDateString("en", { day: "numeric", month: "short" });
}

// ─── Settings tab ─────────────────────────────────────────────────────────────

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

    this.registerView(
      VIEW_TYPE_LOGBOOK,
      (leaf) => new LogbookView(leaf, this.settings)
    );

    this.addRibbonIcon("book-open", "Open Logbook", () => this.activateView());

    this.addCommand({
      id: "open-logbook",
      name: "Open Logbook",
      callback: () => this.activateView(),
    });

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
