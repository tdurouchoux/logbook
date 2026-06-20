import { TFile } from "obsidian";

export type NoteType =
  | "draft"
  | "task"
  | "meeting"
  | "thoughts"
  | "knowledge"
  | "design";

export type TaskStatus = "todo" | "done" | "suspended";
export type DesignStatus = "exploring" | "in-review" | "decided";
export type MeetingSubtype = "standalone" | "recurring";

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
    filterAttr: { key: "subtype", label: "Subtype" },
  },
  thoughts: { label: "Thoughts", color: "#8a5cb2", desc: "Exploration of an idea" },
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
export const MEETING_SUBTYPES: MeetingSubtype[] = ["standalone", "recurring"];

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
}

export interface TaskFrontmatter extends CommonFrontmatter {
  type: "task";
  status: TaskStatus;
}

export interface MeetingFrontmatter extends CommonFrontmatter {
  type: "meeting";
  subtype: MeetingSubtype;
  theme?: string;
  attendees: string[];
  occurrences?: string[]; // recurring only, ISO dates, most recent first
  template?: string;
}

export interface ThoughtsFrontmatter extends CommonFrontmatter {
  type: "thoughts";
  question?: string;
  landed?: string;
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
  | ThoughtsFrontmatter
  | KnowledgeFrontmatter
  | DesignFrontmatter
  | DraftFrontmatter;

/** A note loaded from the vault: frontmatter fields plus the file/body it came from. */
export interface LogNote {
  file: TFile;
  body: string;
  fm: NoteFrontmatter;
}

export function isTask(n: LogNote): n is LogNote & { fm: TaskFrontmatter } {
  return n.fm.type === "task";
}
export function isMeeting(n: LogNote): n is LogNote & { fm: MeetingFrontmatter } {
  return n.fm.type === "meeting";
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

/** Sort key per design.md §3: file.stat.mtime, except recurring meetings use latest occurrence. */
export function activityTimestamp(n: LogNote): number {
  if (isMeeting(n) && n.fm.subtype === "recurring" && n.fm.occurrences?.length) {
    const latest = n.fm.occurrences[0];
    const t = new Date(latest).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return n.file.stat.mtime;
}
