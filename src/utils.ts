import { LogNote } from "./types";

/** Cleans a title into a valid filename while keeping it human-readable — only strips
 *  what Obsidian actually disallows in a note title (`* " \ / < > : | ?`, since the
 *  title doubles as the file name) plus trailing dots/spaces (invalid on Windows).
 *  No casing/whitespace changes, so the file name shown in Obsidian's editor/tab
 *  matches what the user typed. */
export function sanitizeFilename(title: string): string {
  return (
    title
      .replace(/[*"\\/<>:|?]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/, "") || "Untitled"
  );
}

export function generateId(): string {
  // Short, URL/filename-safe random id — stable once minted.
  return Array.from({ length: 10 }, () =>
    "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]
  ).join("");
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

/** Day-group label per design.md §3: Today / Yesterday / weekday / "Wed, May 14" / "May 14, 2024". */
export function dayLabel(d: Date, now: Date = new Date()): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";

  if (d >= startOfWeek(today) && d <= today) {
    return d.toLocaleDateString("en", { weekday: "long" });
  }
  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function groupByDay(notes: LogNote[], tsOf: (n: LogNote) => number): [string, LogNote[]][] {
  const map = new Map<string, LogNote[]>();
  for (const note of notes) {
    const label = dayLabel(new Date(tsOf(note)));
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(note);
  }
  return Array.from(map.entries());
}

export function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return date.toLocaleDateString("en", { day: "numeric", month: "short" });
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Simple fuzzy prefix/subsequence match used by /project, /team, /occurrence dropdowns. */
export function fuzzyMatch(query: string, candidate: string): boolean {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (!q) return true;
  if (c.includes(q)) return true;
  let qi = 0;
  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
