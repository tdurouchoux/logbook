import { App, TFile, normalizePath } from "obsidian";
import {
  LogNote,
  NoteFrontmatter,
  NoteType,
  MeetingFrontmatter,
} from "./types";
import { generateId, slugify, todayISO } from "./utils";
import { LogbookSettings } from "./settings";

/**
 * Owns all vault/metadata-cache access for the logbook folder: reading notes,
 * creating them, and serializing frontmatter writes per file.
 *
 * Obsidian's processFrontMatter has documented reports of dropping/reverting
 * writes when called rapidly on the same file (design.md §15) — every mutation
 * here is queued per path so two writes to the same note never race.
 */
export class NoteStore {
  private writeQueues = new Map<string, Promise<unknown>>();
  /** Paths currently suppressed from triggering a feed refresh (mid-edit). */
  private suppressedUntil = new Map<string, number>();
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private settleCb: (() => void) | null = null;

  constructor(private app: App, private settings: LogbookSettings) {}

  get folder(): string {
    return this.settings.folder;
  }

  /** True while any write is mid-flight — used to skip a feed refresh that would tear down an open card. */
  isAnySuppressed(): boolean {
    const now = Date.now();
    for (const until of this.suppressedUntil.values()) {
      if (now < until) return true;
    }
    return false;
  }

  /**
   * Called once activity quiets down after one or more suppressed writes —
   * the view's vault-event refresh is swallowed during the suppression
   * window (design.md §15), so this is what brings it back in sync once
   * editing settles, rather than waiting indefinitely for an event that
   * may never come.
   */
  onSettled(cb: () => void) {
    this.settleCb = cb;
  }

  private suppress(path: string, ms = 600) {
    this.suppressedUntil.set(path, Date.now() + ms);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.settleCb?.(), ms);
  }

  /** Queue a frontmatter mutation against `file`, serialized with any other pending write to it. */
  async updateFrontmatter(
    file: TFile,
    mutator: (fm: Record<string, unknown>) => void
  ): Promise<void> {
    const prev = this.writeQueues.get(file.path) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        this.suppress(file.path);
        await this.app.fileManager.processFrontMatter(file, mutator);
      });
    this.writeQueues.set(file.path, next);
    return next;
  }

  async loadNotes(): Promise<LogNote[]> {
    const prefix = this.folder + "/";
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix));

    const notes: LogNote[] = [];
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const raw = cache?.frontmatter;
      if (!raw || raw.type === "template") continue;

      const fm = normalizeFrontmatter(raw, file);
      const content = await this.app.vault.cachedRead(file);
      let body = content;
      if (content.startsWith("---")) {
        const end = content.indexOf("\n---\n", 3);
        body = end >= 0 ? content.slice(end + 5).trim() : "";
      }

      notes.push({ file, body, fm });
    }
    return notes;
  }

  async createNote(
    type: NoteType,
    titleOrQuestion: string
  ): Promise<TFile> {
    const folder = this.folder;
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }

    const title = type === "thoughts" ? titleOrQuestion || "Untitled thought" : titleOrQuestion;
    const slug = slugify(title);
    let path = normalizePath(`${folder}/${slug}.md`);
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${folder}/${slug}_${i++}.md`);
    }

    const now = new Date().toISOString();
    const lines = [
      "---",
      `id: ${generateId()}`,
      `type: ${type}`,
      `title: "${escapeYamlString(title)}"`,
      "projects: []",
      "teams: []",
      `createdAt: ${now}`,
    ];

    if (type === "task") {
      lines.push("status: todo");
    } else if (type === "design") {
      lines.push("status: exploring");
    } else if (type === "meeting") {
      lines.push("subtype: standalone", "attendees: []");
    } else if (type === "knowledge") {
      lines.push("techStack: []");
    } else if (type === "thoughts") {
      lines.push(`question: "${escapeYamlString(titleOrQuestion)}"`);
    }

    lines.push("---", "");
    await this.app.vault.create(path, lines.join("\n"));
    return this.app.vault.getAbstractFileByPath(path) as TFile;
  }

  async createDoneTask(title: string): Promise<TFile> {
    const file = await this.createNote("task", title);
    await this.updateFrontmatter(file, (fm) => {
      fm.status = "done";
    });
    return file;
  }

  async createRecurringMeeting(title: string): Promise<TFile> {
    const file = await this.createNote("meeting", title);
    const today = todayISO();
    await this.updateFrontmatter(file, (fm) => {
      fm.subtype = "recurring";
      fm.occurrences = [today];
    });
    await this.app.vault.process(file, (content) => {
      return insertOccurrenceHeading(content, today);
    });
    return file;
  }

  /** design.md §7 /occurrence — add or jump to today's occurrence on an existing recurring meeting. */
  async addOrFindTodayOccurrence(file: TFile, fm: MeetingFrontmatter): Promise<void> {
    const today = todayISO();
    if (fm.occurrences?.includes(today)) return;

    const headings = fm.template ? await this.getTemplateHeadings(fm.template) : [];
    await this.app.vault.process(file, (content) => insertOccurrenceHeading(content, today, headings));
    await this.updateFrontmatter(file, (raw) => {
      const occ: string[] = Array.isArray(raw.occurrences) ? raw.occurrences : [];
      raw.occurrences = [today, ...occ.filter((d) => d !== today)];
    });
  }

  /** design.md §5.3 meeting templates — notes with `type: template` in the logbook folder, headings-only. */
  async listTemplates(): Promise<{ title: string; path: string }[]> {
    const prefix = this.folder + "/";
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
    const templates: { title: string; path: string }[] = [];
    for (const file of files) {
      const raw = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (raw?.type === "template") {
        templates.push({ title: typeof raw.title === "string" ? raw.title : file.basename, path: file.path });
      }
    }
    return templates;
  }

  private async getTemplateHeadings(templateTitle: string): Promise<string[]> {
    const templates = await this.listTemplates();
    const match = templates.find((t) => t.title === templateTitle);
    if (!match) return [];
    const file = this.app.vault.getAbstractFileByPath(match.path);
    if (!(file instanceof TFile)) return [];
    const content = await this.app.vault.cachedRead(file);
    const end = content.indexOf("\n---\n");
    const body = content.startsWith("---") && end >= 0 ? content.slice(end + 5) : content;
    return body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("###"));
  }

  /** Sets a meeting's template reference; for standalone meetings with no body yet, also scaffolds it. */
  async setMeetingTemplate(file: TFile, fm: MeetingFrontmatter, template: string): Promise<void> {
    await this.updateFrontmatter(file, (raw) => {
      raw.template = template || undefined;
    });
    if (!template || fm.subtype !== "standalone") return;

    const content = await this.app.vault.cachedRead(file);
    const end = content.indexOf("\n---\n");
    const body = content.startsWith("---") && end >= 0 ? content.slice(end + 5).trim() : "";
    if (body) return;

    const headings = await this.getTemplateHeadings(template);
    if (!headings.length) return;
    await this.app.vault.process(file, (c) => scaffoldBody(c, headings));
  }

  async renameTitle(file: TFile, newTitle: string): Promise<void> {
    const slug = slugify(newTitle);
    const newPath = normalizePath(`${file.parent?.path ?? this.folder}/${slug}.md`);
    if (newPath !== file.path && !this.app.vault.getAbstractFileByPath(newPath)) {
      await this.app.fileManager.renameFile(file, newPath);
    }
    await this.updateFrontmatter(file, (fm) => {
      fm.title = newTitle;
    });
  }

  /** Manual delete from the card's trash button (design.md §4) — trash, never hard-delete. */
  async deleteNote(file: TFile): Promise<void> {
    await this.app.vault.trash(file, true);
  }

  /** Replaces frontmatter wholesale for a type change (design.md §15) — unlike updateFrontmatter's
   *  key-by-key mutator, this drops every key not present in newFm's shape. */
  async changeType(file: TFile, newFm: NoteFrontmatter): Promise<void> {
    await this.updateFrontmatter(file, (raw) => {
      const newKeys = new Set(Object.keys(newFm));
      for (const key of Object.keys(raw)) {
        if (!newKeys.has(key)) delete raw[key];
      }
      Object.assign(raw, newFm);
    });
  }

  /** Trash (never hard-delete) draft notes older than 7 days, per design.md §5.1. */
  async pruneOldDrafts(): Promise<void> {
    const notes = await this.loadNotes();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const note of notes) {
      if (note.fm.type !== "draft") continue;
      if (new Date(note.fm.createdAt).getTime() < cutoff) {
        await this.app.vault.trash(note.file, true);
      }
    }
  }
}

function normalizeFrontmatter(raw: Record<string, unknown>, file: TFile): NoteFrontmatter {
  const type = (raw.type as NoteType) ?? "draft";
  const base = {
    id: typeof raw.id === "string" ? raw.id : file.path,
    type,
    title: typeof raw.title === "string" ? raw.title : file.basename,
    projects: Array.isArray(raw.projects) ? raw.projects.map(String) : [],
    teams: Array.isArray(raw.teams) ? raw.teams.map(String) : [],
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(file.stat.ctime).toISOString(),
    pinned: typeof raw.pinned === "boolean" ? raw.pinned : undefined,
  };

  switch (type) {
    case "task":
      return {
        ...base,
        type: "task",
        status: (raw.status as any) ?? "todo",
      };
    case "meeting":
      return {
        ...base,
        type: "meeting",
        subtype: (raw.subtype as any) ?? "standalone",
        theme: typeof raw.theme === "string" ? raw.theme : undefined,
        attendees: Array.isArray(raw.attendees) ? raw.attendees.map(String) : [],
        occurrences: Array.isArray(raw.occurrences) ? raw.occurrences.map(String) : undefined,
        template: typeof raw.template === "string" ? raw.template : undefined,
      };
    case "thoughts":
      return {
        ...base,
        type: "thoughts",
        question: typeof raw.question === "string" ? raw.question : undefined,
        landed: typeof raw.landed === "string" ? raw.landed : undefined,
      };
    case "knowledge":
      return {
        ...base,
        type: "knowledge",
        techStack: Array.isArray(raw.techStack) ? raw.techStack.map(String) : [],
      };
    case "design":
      return { ...base, type: "design", status: (raw.status as any) ?? "exploring" };
    default:
      return { ...base, type: "draft" };
  }
}

function escapeYamlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function insertOccurrenceHeading(content: string, isoDate: string, headingLines: string[] = []): string {
  const end = content.indexOf("\n---\n");
  const fmEnd = content.startsWith("---") && end >= 0 ? end + 5 : 0;
  const head = content.slice(0, fmEnd);
  const body = content.slice(fmEnd);
  const scaffold = headingLines.length ? headingLines.join("\n\n") + "\n\n" : "";
  const heading = `## ${isoDate}\n\n${scaffold}`;
  // Insert above all existing occurrence headings, i.e. right at the top of the body.
  const trimmedBody = body.replace(/^\s*/, "");
  return head + heading + trimmedBody;
}

function scaffoldBody(content: string, headingLines: string[]): string {
  const end = content.indexOf("\n---\n");
  const fmEnd = content.startsWith("---") && end >= 0 ? end + 5 : 0;
  const head = content.slice(0, fmEnd);
  return head + headingLines.join("\n\n") + "\n";
}
