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
}

export function emptyFilters(): FilterState {
  return { query: "", projects: [], teams: [], tags: [], type: null, typeAttr: null };
}

export function hasActiveFilters(f: FilterState): boolean {
  return (
    !!f.query || f.projects.length > 0 || f.teams.length > 0 || f.tags.length > 0 || !!f.type || !!f.typeAttr
  );
}

function fieldsOf(note: LogNote): string[] {
  const fm: any = note.fm;
  const fields = [fm.title, note.body, ...(fm.projects ?? []), ...(fm.teams ?? [])];
  switch (fm.type) {
    case "task":
      fields.push(fm.status);
      break;
    case "meeting":
      fields.push(fm.agenda, ...(fm.attendees ?? []));
      break;
    case "recurring":
      fields.push(...(fm.attendees ?? []));
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

/** One prepared fuzzy matcher per query term, built once per `applyFilters` call
 *  rather than per note — `prepareFuzzySearch` only needs to parse the term once. */
function prepareQueryMatchers(query: string): Array<(text: string) => unknown> {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => prepareFuzzySearch(term));
}

function matchesQuery(note: LogNote, matchers: Array<(text: string) => unknown>): boolean {
  if (!matchers.length) return true;
  const haystack = fieldsOf(note).join(" \n ");
  return matchers.every((m) => !!m(haystack));
}

function matchesTypeAttr(note: LogNote, attr: TypeAttrFilter): boolean {
  const fm: any = note.fm;
  const value = fm[attr.key];
  if (Array.isArray(value)) return value.includes(attr.value);
  return value === attr.value;
}

export function applyFilters(notes: LogNote[], filters: FilterState): LogNote[] {
  const queryMatchers = prepareQueryMatchers(filters.query);
  return notes.filter((n) => {
    if (filters.type && n.fm.type !== filters.type) return false;
    if (filters.typeAttr && !matchesTypeAttr(n, filters.typeAttr)) return false;
    if (filters.projects.length && !filters.projects.every((p) => n.fm.projects.includes(p))) return false;
    if (filters.teams.length && !filters.teams.every((t) => n.fm.teams.includes(t))) return false;
    if (filters.tags.length && !filters.tags.every((t) => n.tags.includes(t))) return false;
    if (!matchesQuery(n, queryMatchers)) return false;
    return true;
  });
}

/** Per-term fuzzy match ranges within `text`, merged and sorted for `renderMatches`
 *  (design.md §6) — each query term is matched independently since terms can land
 *  in different, non-adjacent parts of the text. */
export function fuzzyMatchRanges(text: string, query: string): SearchMatches {
  const terms = query.split(/\s+/).filter(Boolean);
  const ranges: SearchMatches = [];
  for (const term of terms) {
    const result = prepareFuzzySearch(term)(text);
    if (result) ranges.push(...result.matches);
  }
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
