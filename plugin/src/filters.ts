import { LogNote, NoteType } from "./types";

export interface TypeAttrFilter {
  key: string;
  value: string;
}

export interface FilterState {
  query: string;
  tags: string[];
  projects: string[];
  teams: string[];
  type: NoteType | null;
  typeAttr: TypeAttrFilter | null;
}

export function emptyFilters(): FilterState {
  return { query: "", tags: [], projects: [], teams: [], type: null, typeAttr: null };
}

export function hasActiveFilters(f: FilterState): boolean {
  return (
    !!f.query || f.tags.length > 0 || f.projects.length > 0 || f.teams.length > 0 || !!f.type || !!f.typeAttr
  );
}

function fieldsOf(note: LogNote): string[] {
  const fm: any = note.fm;
  const fields = [fm.title, note.body, ...(fm.tags ?? []), ...(fm.projects ?? []), ...(fm.teams ?? [])];
  switch (fm.type) {
    case "task":
      fields.push(fm.status);
      break;
    case "meeting":
      fields.push(fm.theme, ...(fm.attendees ?? []));
      break;
    case "thoughts":
      fields.push(fm.question, fm.landed);
      break;
    case "knowledge":
      fields.push(...(fm.techStack ?? []));
      break;
    case "design":
      fields.push(fm.status);
      break;
  }
  return fields.filter((v): v is string => typeof v === "string");
}

function matchesQuery(note: LogNote, query: string): boolean {
  if (!query.trim()) return true;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = fieldsOf(note).join(" \n ").toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

function matchesTypeAttr(note: LogNote, attr: TypeAttrFilter): boolean {
  const fm: any = note.fm;
  const value = fm[attr.key];
  if (Array.isArray(value)) return value.includes(attr.value);
  return value === attr.value;
}

export function applyFilters(notes: LogNote[], filters: FilterState): LogNote[] {
  return notes.filter((n) => {
    if (filters.type && n.fm.type !== filters.type) return false;
    if (filters.typeAttr && !matchesTypeAttr(n, filters.typeAttr)) return false;
    if (filters.tags.length && !filters.tags.every((t) => n.fm.tags.includes(t))) return false;
    if (filters.projects.length && !filters.projects.every((p) => n.fm.projects.includes(p))) return false;
    if (filters.teams.length && !filters.teams.every((t) => n.fm.teams.includes(t))) return false;
    if (!matchesQuery(n, filters.query)) return false;
    return true;
  });
}

/** Highlight matched query terms by wrapping them in <mark>, per design.md §6. */
export function highlight(text: string, query: string): string {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return escaped.replace(pattern, "<mark>$1</mark>");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
