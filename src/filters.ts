import { prepareFuzzySearch, SearchMatches } from "obsidian";
import { LogNote, NoteType } from "./types";

export interface TypeAttrFilter {
  key: string;
  value: string;
}

export interface FilterState {
  query: string;
  projects: string[];
  teams: string[];
  tags: string[];
  type: NoteType | null;
  typeAttr: TypeAttrFilter | null;
  excludeType: NoteType | null;
  excludeTypeAttr: TypeAttrFilter | null;
}

/** The subset of FilterState a saved view captures — everything but free-text
 *  query, which stays a per-session search rather than part of a filter combo. */
export type SavedViewFilters = Omit<FilterState, "query">;

export interface SavedView {
  id: string;
  name: string;
  filters: SavedViewFilters;
}

/** Snapshot of the currently active filters (minus query) for saving as a view. */
export function filterSnapshot(f: FilterState): SavedViewFilters {
  return {
    projects: f.projects,
    teams: f.teams,
    tags: f.tags,
    type: f.type,
    typeAttr: f.typeAttr,
    excludeType: f.excludeType,
    excludeTypeAttr: f.excludeTypeAttr,
  };
}

export function emptyFilters(): FilterState {
  return {
    query: "",
    projects: [],
    teams: [],
    tags: [],
    type: null,
    typeAttr: null,
    excludeType: null,
    excludeTypeAttr: null,
  };
}

export function hasActiveFilters(f: FilterState): boolean {
  return (
    !!f.query ||
    f.projects.length > 0 ||
    f.teams.length > 0 ||
    f.tags.length > 0 ||
    !!f.type ||
    !!f.typeAttr ||
    !!f.excludeType ||
    !!f.excludeTypeAttr
  );
}

/** Short, filename-like fields — title, projects/teams, and type-specific tags/status
 *  — where Obsidian's subsequence fuzzy matcher (typo-tolerant, same as the quick
 *  switcher) stays a good fit. `body` is deliberately excluded: fuzzy subsequence
 *  matching over paragraph-length text has a near-100% false-positive rate, since a
 *  short term's letters are almost always found *somewhere* in order across that much
 *  text — see plan.md. Body gets plain substring matching instead, same as Obsidian's
 *  own full-text search pane. */
function shortFieldsOf(note: LogNote): string[] {
  const fm: any = note.fm;
  const fields = [fm.title, ...(fm.projects ?? []), ...(fm.teams ?? [])];
  switch (fm.type) {
    case "task":
      fields.push(fm.status, fm.deadline);
      break;
    case "meeting":
      fields.push(fm.agenda, fm.theme, ...(fm.attendees ?? []));
      break;
    case "recurring":
      fields.push(fm.theme, ...(fm.attendees ?? []));
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

interface QueryTerm {
  /** Lowercased, for plain substring matching against `body`. */
  text: string;
  /** Prepared once per `applyFilters` call rather than per note — `prepareFuzzySearch`
   *  only needs to parse the term once. */
  fuzzy: (text: string) => unknown;
}

function prepareQueryTerms(query: string): QueryTerm[] {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => ({ text: term.toLowerCase(), fuzzy: prepareFuzzySearch(term) }));
}

function matchesQuery(note: LogNote, terms: QueryTerm[]): boolean {
  if (!terms.length) return true;
  const shortHaystack = shortFieldsOf(note).join(" \n ");
  const body = note.body.toLowerCase();
  return terms.every(({ text, fuzzy }) => !!fuzzy(shortHaystack) || body.includes(text));
}

function matchesTypeAttr(note: LogNote, attr: TypeAttrFilter): boolean {
  const fm: any = note.fm;
  const value = fm[attr.key];
  if (Array.isArray(value)) return value.includes(attr.value);
  return value === attr.value;
}

export function applyFilters(notes: LogNote[], filters: FilterState): LogNote[] {
  const queryTerms = prepareQueryTerms(filters.query);
  return notes.filter((n) => {
    if (filters.type && n.fm.type !== filters.type) return false;
    if (filters.typeAttr && !matchesTypeAttr(n, filters.typeAttr)) return false;
    if (filters.excludeType && n.fm.type === filters.excludeType) {
      if (!filters.excludeTypeAttr || matchesTypeAttr(n, filters.excludeTypeAttr)) return false;
    }
    if (filters.projects.length && !filters.projects.every((p) => n.fm.projects.includes(p))) return false;
    if (filters.teams.length && !filters.teams.every((t) => n.fm.teams.includes(t))) return false;
    if (filters.tags.length && !filters.tags.every((t) => n.tags.includes(t))) return false;
    if (!matchesQuery(n, queryTerms)) return false;
    return true;
  });
}

/** Sorts and merges overlapping/adjacent ranges for `renderMatches` (design.md §6). */
function mergeRanges(ranges: SearchMatches): SearchMatches {
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: SearchMatches = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/** Per-term fuzzy match ranges within `text` — for short fields (title) matched via
 *  `prepareFuzzySearch`, same as `matchesQuery`'s short-field pass. */
export function fuzzyMatchRanges(text: string, query: string): SearchMatches {
  const terms = query.split(/\s+/).filter(Boolean);
  const ranges: SearchMatches = [];
  for (const term of terms) {
    const result = prepareFuzzySearch(term)(text);
    if (result) ranges.push(...result.matches);
  }
  return mergeRanges(ranges);
}

/** Per-term plain substring match ranges within `text` — for `body`, matched via
 *  case-insensitive substring rather than fuzzy subsequence (see `shortFieldsOf`). */
export function substringMatchRanges(text: string, query: string): SearchMatches {
  const terms = query.split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());
  const lower = text.toLowerCase();
  const ranges: SearchMatches = [];
  for (const term of terms) {
    let from = 0;
    let idx: number;
    while ((idx = lower.indexOf(term, from)) !== -1) {
      ranges.push([idx, idx + term.length]);
      from = idx + term.length;
    }
  }
  return mergeRanges(ranges);
}
