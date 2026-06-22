import { TFile } from "obsidian";

export type NoteType =
  | "draft"
  | "task"
  | "meeting"
  | "recurring"
  | "thoughts"
  | "knowledge"
  | "design";

export type TaskStatus = "todo" | "done" | "suspended";
export type DesignStatus = "exploring" | "in-review" | "decided";
export type MeetingAgenda = "meetup" | "presentation" | "workshop" | "crisis" | "decision" | "other";

export interface NoteTypeConfig {
  label: string;
  color: string;
  desc: string;
  /** Type-specific filterable attribute, if any (key into the note's fields). */
  filterAttr?: { key: string; label: string };
}

export const NOTE_TYPES: Record<NoteType, NoteTypeConfig> = {
  draft: { label: "Draft", color: "#807966", desc: "Quick unstructured capture" },
  task: {
    label: "Task",
    color: "#c89844",
    desc: "An action with a state",
    filterAttr: { key: "status", label: "Status" },
  },
  meeting: {
    label: "Meeting",
    color: "#5b8db8",
    desc: "Notes from a conversation",
    filterAttr: { key: "agenda", label: "Agenda" },
  },
  recurring: {
    label: "Recurring",
    color: "#4a9d96",
    desc: "Recurring meeting, one note per series",
  },
  thoughts: { label: "Thoughts", color: "#bf5680", desc: "Exploration of an idea" },
  knowledge: {
    label: "Knowledge",
    color: "#7a9956",
    desc: "Something worth remembering",
  },
  design: {
    label: "Design",
    color: "#9b6db5",
    desc: "Technical design note",
    filterAttr: { key: "status", label: "Status" },
  },
};

export const TASK_STATUSES: TaskStatus[] = ["todo", "done", "suspended"];
export const DESIGN_STATUSES: DesignStatus[] = ["exploring", "in-review", "decided"];
export const MEETING_AGENDAS: MeetingAgenda[] = [
  "meetup",
  "presentation",
  "workshop",
  "crisis",
  "decision",
  "other",
];

export const ALL_COMMANDS = (Object.entries(NOTE_TYPES) as [NoteType, NoteTypeConfig][]).map(
  ([key, cfg]) => ({ key, ...cfg })
);

/** Common frontmatter fields shared by every note type, per design.md §2. */
export interface CommonFrontmatter {
  id: string;
  type: NoteType;
  title: string;
  projects: string[];
  teams: string[];
  createdAt: string;
  /** Omitted (not `false`) when not pinned — see design.md §2, §3, §4. */
  pinned?: boolean;
}

export interface TaskFrontmatter extends CommonFrontmatter {
  type: "task";
  status: TaskStatus;
}

export interface MeetingFrontmatter extends CommonFrontmatter {
  type: "meeting";
  agenda: MeetingAgenda;
  attendees: string[];
}

export interface RecurringFrontmatter extends CommonFrontmatter {
  type: "recurring";
  attendees: string[];
  occurrences: string[]; // ISO dates, most recent first
}

export interface ThoughtsFrontmatter extends CommonFrontmatter {
  type: "thoughts";
}

export interface KnowledgeFrontmatter extends CommonFrontmatter {
  type: "knowledge";
  techStack: string[];
}

export interface DesignFrontmatter extends CommonFrontmatter {
  type: "design";
  status: DesignStatus;
}

export interface DraftFrontmatter extends CommonFrontmatter {
  type: "draft";
}

export type NoteFrontmatter =
  | TaskFrontmatter
  | MeetingFrontmatter
  | RecurringFrontmatter
  | ThoughtsFrontmatter
  | KnowledgeFrontmatter
  | DesignFrontmatter
  | DraftFrontmatter;

/** A note loaded from the vault: frontmatter fields plus the file/body it came from.
 *  `tags` is Obsidian's own native tag set (frontmatter `tags` + inline `#tags`,
 *  from the metadata cache) — the plugin never writes it, only reads it for `/tag`. */
export interface LogNote {
  file: TFile;
  body: string;
  fm: NoteFrontmatter;
  tags: string[];
}

export function isTask(n: LogNote): n is LogNote & { fm: TaskFrontmatter } {
  return n.fm.type === "task";
}
export function isMeeting(n: LogNote): n is LogNote & { fm: MeetingFrontmatter } {
  return n.fm.type === "meeting";
}
export function isRecurring(n: LogNote): n is LogNote & { fm: RecurringFrontmatter } {
  return n.fm.type === "recurring";
}
export function isThoughts(n: LogNote): n is LogNote & { fm: ThoughtsFrontmatter } {
  return n.fm.type === "thoughts";
}
export function isKnowledge(n: LogNote): n is LogNote & { fm: KnowledgeFrontmatter } {
  return n.fm.type === "knowledge";
}
export function isDesign(n: LogNote): n is LogNote & { fm: DesignFrontmatter } {
  return n.fm.type === "design";
}

/** Converts frontmatter to another note type per design.md's conversion rules:
 *  keep common fields, drop everything type-specific, fill in the new type's defaults
 *  (mirroring note-store.ts's createNote() defaults). */
export function convertType(fm: NoteFrontmatter, toType: NoteType): NoteFrontmatter {
  const base: CommonFrontmatter = {
    id: fm.id,
    type: toType,
    title: fm.title,
    projects: fm.projects,
    teams: fm.teams,
    createdAt: fm.createdAt,
    pinned: fm.pinned,
  };
  switch (toType) {
    case "task":
      return { ...base, type: "task", status: "todo" };
    case "design":
      return { ...base, type: "design", status: "exploring" };
    case "meeting":
      return { ...base, type: "meeting", agenda: "meetup", attendees: [] };
    case "recurring":
      return { ...base, type: "recurring", attendees: [], occurrences: [] };
    case "knowledge":
      return { ...base, type: "knowledge", techStack: [] };
    case "thoughts":
      return { ...base, type: "thoughts" };
    default:
      return { ...base, type: "draft" };
  }
}

/** "YYYY-MM-DD" parsed as a local-midnight Date — the bare `Date` string constructor
 *  treats date-only strings as UTC, which can land on the wrong local calendar day. */
function localDateFromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Sort key per design.md §3: file.stat.mtime, except recurring meetings use latest occurrence —
 *  unless that occurrence is today, in which case file.stat.mtime is used instead. A bare
 *  occurrence date has no time-of-day, so it would otherwise always sort earlier than every
 *  other note touched today (which carry a real intraday mtime), pinning a just-created or
 *  just-edited recurring meeting to the top of "Today" instead of the bottom. */
export function activityTimestamp(n: LogNote): number {
  if (isRecurring(n) && n.fm.occurrences.length) {
    const occDate = localDateFromISO(n.fm.occurrences[0]);
    if (!Number.isNaN(occDate.getTime())) {
      const today = new Date();
      const isToday =
        occDate.getFullYear() === today.getFullYear() &&
        occDate.getMonth() === today.getMonth() &&
        occDate.getDate() === today.getDate();
      return isToday ? n.file.stat.mtime : occDate.getTime();
    }
  }
  return n.file.stat.mtime;
}
