import { App, TFile, getAllTags, normalizePath } from "obsidian";
import {
  LogNote,
  NoteFrontmatter,
  NoteType,
  RecurringFrontmatter,
} from "./types";
import { generateId, sanitizeFilename, todayISO } from "./utils";
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
  /** Destination paths of renames this store itself just performed (renameTitle) —
   *  lets the view's own vault "rename" listener tell those apart from an
   *  external rename (e.g. editing Obsidian's inline title) it needs to react to. */
  private pendingSelfRenames = new Set<string>();

  constructor(private app: App, private settings: LogbookSettings) {}

  get folder(): string {
    return this.settings.folder;
  }

  /** True (and consumes the flag) iff `path` is the destination of a rename this
   *  store itself just performed. */
  consumeSelfRename(path: string): boolean {
    return this.pendingSelfRenames.delete(path);
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
      if (!cache || !raw) continue;

      const fm = normalizeFrontmatter(raw, file);
      const tags = (getAllTags(cache) ?? []).map((t) => t.slice(1));
      const content = await this.app.vault.cachedRead(file);
      const body = stripFrontmatter(content);

      notes.push({ file, body, fm, tags });
    }
    return notes;
  }

  async createNote(
    type: NoteType,
    title: string
  ): Promise<TFile> {
    const folder = this.folder;
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }

    const filename = sanitizeFilename(title);
    let path = normalizePath(`${folder}/${filename}.md`);
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${folder}/${filename} ${i++}.md`);
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
      lines.push("agenda: meetup", "attendees: []", 'theme: ""');
    } else if (type === "recurring") {
      lines.push("attendees: []", 'theme: ""');
    } else if (type === "knowledge") {
      lines.push("techStack: []");
    }

    lines.push("---", "");
    const templateBody = await this.getTemplateBody(type);
    await this.app.vault.create(path, lines.join("\n") + templateBody);
    return this.app.vault.getAbstractFileByPath(path) as TFile;
  }

  /** design.md §7 — resolves the configured template for `type`, if any. Returns ""
   *  when no path is set or it doesn't resolve to an existing file, so a missing
   *  template is silently equivalent to having none. */
  private async getTemplateBody(type: NoteType): Promise<string> {
    const path = this.settings.templates[type]?.trim();
    if (!path) return "";
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) return "";
    const content = await this.app.vault.cachedRead(file);
    return stripFrontmatter(content);
  }

  async createRecurringMeeting(title: string): Promise<TFile> {
    const file = await this.createNote("recurring", title);
    const today = todayISO();
    await this.updateFrontmatter(file, (fm) => {
      fm.occurrences = [today];
    });
    await this.app.vault.process(file, (content) => {
      return insertOccurrenceHeading(content, today);
    });
    return file;
  }

  /** design.md §7 /occurrence — add or jump to today's occurrence on an existing recurring meeting. */
  async addOrFindTodayOccurrence(file: TFile, fm: RecurringFrontmatter): Promise<void> {
    const today = todayISO();
    if (fm.occurrences.includes(today)) return;

    await this.app.vault.process(file, (content) => insertOccurrenceHeading(content, today));
    await this.updateFrontmatter(file, (raw) => {
      const occ: string[] = Array.isArray(raw.occurrences) ? raw.occurrences : [];
      raw.occurrences = [today, ...occ.filter((d) => d !== today)];
    });
  }

  async renameTitle(file: TFile, newTitle: string): Promise<void> {
    const filename = sanitizeFilename(newTitle);
    const newPath = normalizePath(`${file.parent?.path ?? this.folder}/${filename}.md`);
    if (newPath !== file.path && !this.app.vault.getAbstractFileByPath(newPath)) {
      this.pendingSelfRenames.add(newPath);
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

  /** Trash (never hard-delete) expired drafts and done tasks, per design.md §5.1/§5.2.
   *  Both are keyed off mtime (last-modified) rather than `createdAt` — for a done task
   *  there's no separate "doneAt" field, and the status-cycle save already bumps mtime
   *  the moment it becomes done, so mtime is the meaningful "since" point for both types.
   *  Either TTL being `null` disables pruning for that note type. */
  async pruneExpiredNotes(): Promise<void> {
    const notes = await this.loadNotes();
    const draftCutoff =
      this.settings.draftTTLDays != null ? Date.now() - this.settings.draftTTLDays * 24 * 60 * 60 * 1000 : null;
    const doneCutoff =
      this.settings.doneTaskTTLDays != null
        ? Date.now() - this.settings.doneTaskTTLDays * 24 * 60 * 60 * 1000
        : null;
    for (const note of notes) {
      if (draftCutoff != null && note.fm.type === "draft" && note.file.stat.mtime < draftCutoff) {
        await this.app.vault.trash(note.file, true);
      } else if (
        doneCutoff != null &&
        note.fm.type === "task" &&
        note.fm.status === "done" &&
        note.file.stat.mtime < doneCutoff
      ) {
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
        deadline: typeof raw.deadline === "string" ? raw.deadline : undefined,
      };
    case "meeting":
      return {
        ...base,
        type: "meeting",
        agenda: (raw.agenda as any) ?? "meetup",
        attendees: Array.isArray(raw.attendees) ? raw.attendees.map(String) : [],
        theme: typeof raw.theme === "string" ? raw.theme : "",
      };
    case "recurring":
      return {
        ...base,
        type: "recurring",
        attendees: Array.isArray(raw.attendees) ? raw.attendees.map(String) : [],
        occurrences: Array.isArray(raw.occurrences) ? raw.occurrences.map(String) : [],
        theme: typeof raw.theme === "string" ? raw.theme : "",
      };
    case "thoughts":
      return { ...base, type: "thoughts" };
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

/** Strips a leading YAML frontmatter block (if any), returning just the body. */
function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---\n", 3);
  return end >= 0 ? content.slice(end + 5).trim() : "";
}

function insertOccurrenceHeading(content: string, isoDate: string): string {
  const end = content.indexOf("\n---\n");
  const fmEnd = content.startsWith("---") && end >= 0 ? end + 5 : 0;
  const head = content.slice(0, fmEnd);
  const body = content.slice(fmEnd);
  const heading = `## ${isoDate}\n\n`;
  // Insert above all existing occurrence headings, i.e. right at the top of the body.
  const trimmedBody = body.replace(/^\s*/, "");
  return head + heading + trimmedBody;
}
