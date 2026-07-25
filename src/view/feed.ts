import { LogNote } from "../types";
import { FilterState, hasActiveFilters } from "../filters";
import { groupByDay, relativeTime } from "../utils";
import { CardContext, buildCard } from "./card";

export interface FeedRenderOptions {
  notes: LogNote[];
  filters: FilterState;
  hasMoreHistory: boolean;
  loadingMore: boolean;
  onLoadMore(): void;
  pendingDivider?: string; // "Writing a [type]" divider shown above a just-created note
  pendingNotePath?: string;
  // Same key `notes` is sorted by — day-grouping must use it too, or an expanded
  // card whose real mtime just changed gets bucketed into a different day-group
  // (and that whole group reordered) even though its position in `notes` was held.
  activityOf(note: LogNote): number;
  // Pre-sorted (oldest first) by the caller, exempt from history-window pagination
  // (design.md §3) — rendered as one flat list under a single "Pinned" divider,
  // always last, with no day sub-grouping.
  pinnedNotes: LogNote[];
}

interface CardCacheEntry {
  el: HTMLElement;
  sig: string;
}

/** Keyed by note path; owned by the caller (LogbookView) so it survives across renders. */
export type CardCache = Map<string, CardCacheEntry>;

/**
 * Renders the feed by reconciling `feedEl`'s children against a desired list, instead of
 * tearing everything down and rebuilding it (see design.md §15). A note's card is reused
 * untouched unless its own frontmatter/body/mtime (or the search query) actually changed,
 * and a currently-expanded card is never rebuilt regardless — so a write to one note (and
 * the settle-triggered refresh that follows it) only ever touches that note's own card.
 */
export function renderFeed(feedEl: HTMLElement, opts: FeedRenderOptions, cardCtx: CardContext, cache: CardCache) {
  const atBottom = feedEl.scrollHeight - feedEl.scrollTop <= feedEl.clientHeight + 80;

  const desired: HTMLElement[] = [];
  const postAttach: (() => void)[] = [];
  const livePaths = new Set<string>();

  if (!hasActiveFilters(opts.filters) && (opts.hasMoreHistory || opts.loadingMore)) {
    const sentinel = document.createElement("div");
    sentinel.className = "logbook-history-sentinel";
    sentinel.textContent = opts.loadingMore ? "Loading more…" : "";
    desired.push(sentinel);
    postAttach.push(() => observeSentinel(sentinel, opts.onLoadMore));
  }

  if (opts.notes.length === 0 && opts.pinnedNotes.length === 0) {
    desired.push(buildEmptyState(opts.filters));
  } else {
    for (const [label, group] of groupByDay(opts.notes, opts.activityOf)) {
      desired.push(buildDivider(label));
      for (const note of group) {
        livePaths.add(note.file.path);
        desired.push(resolveCard(note, cardCtx, cache));
      }
    }

    if (opts.pendingDivider && opts.pendingNotePath) {
      desired.push(buildDivider(opts.pendingDivider, true));
    }

    if (opts.pinnedNotes.length) {
      desired.push(buildDivider("Pinned", false, true));
      for (const note of opts.pinnedNotes) {
        livePaths.add(note.file.path);
        desired.push(resolveCard(note, cardCtx, cache));
      }
    }
  }

  reconcileChildren(feedEl, desired);
  for (const cb of postAttach) cb();

  for (const path of Array.from(cache.keys())) {
    if (!livePaths.has(path)) cache.delete(path);
  }

  if (atBottom || opts.pendingNotePath) {
    feedEl.scrollTop = feedEl.scrollHeight;
  }
}

function resolveCard(note: LogNote, cardCtx: CardContext, cache: CardCache): HTMLElement {
  const sig = cardSignature(note, cardCtx.searchQuery);
  const cached = cache.get(note.file.path);
  // While expanded, keep the live DOM untouched no matter what changed elsewhere —
  // the user is actively in this card and its own listeners already keep the file in sync.
  if (cached && (cardCtx.isExpanded(note.file.path) || cached.sig === sig)) {
    // The signature only tracks the note's own data, not wall-clock time — so a
    // reused card whose underlying note hasn't changed would otherwise show a
    // relative time ("now", "2m"...) frozen at whatever it said when it was last
    // actually rebuilt. Refresh just that text node on every pass instead.
    const timeEl = cached.el.querySelector(".logbook-time");
    if (timeEl) timeEl.textContent = relativeTime(new Date(note.file.stat.mtime));
    return cached.el;
  }
  const el = buildCard(note, cardCtx);
  cache.set(note.file.path, { el, sig });
  return el;
}

/** Deliberately excludes `note.body`: every write that changes a body also bumps
 *  `file.stat.mtime`, which is already in the key, so including the body only
 *  duplicates a signal we have — at the cost of serializing every rendered note's
 *  full text on every render pass (~52ms vs ~8ms across 10k cards). */
function cardSignature(note: LogNote, searchQuery: string): string {
  return JSON.stringify([note.fm, note.file.stat.mtime, searchQuery]);
}

function buildDivider(label: string, pending = false, pinned = false): HTMLElement {
  const divider = document.createElement("div");
  divider.className = "logbook-divider";
  if (pending) divider.className += " logbook-divider-pending";
  if (pinned) divider.className += " logbook-divider-pinned";
  const span = document.createElement("span");
  span.textContent = label;
  divider.appendChild(span);
  return divider;
}

function buildEmptyState(filters: FilterState): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "logbook-empty";
  const p1 = document.createElement("p");
  const p2 = document.createElement("p");
  p2.className = "logbook-empty-hint";
  if (hasActiveFilters(filters)) {
    p1.textContent = "No notes match the active filters.";
    p2.textContent = "Type / to create a matching note, or clear filters.";
  } else {
    p1.textContent = "Nothing here yet.";
    p2.textContent = "Type / to pick a note type, or just write to capture a draft.";
  }
  empty.append(p1, p2);
  return empty;
}

/** Single-pass keyed reconciliation: only moves nodes not already in the right spot,
 *  and only removes nodes absent from `desired` — anything unchanged is never detached. */
function reconcileChildren(parent: HTMLElement, desired: HTMLElement[]) {
  const desiredSet = new Set<HTMLElement>(desired);
  for (const child of Array.from(parent.children)) {
    if (!desiredSet.has(child as HTMLElement)) parent.removeChild(child);
  }
  let ref: Node | null = parent.firstChild;
  for (const node of desired) {
    if (ref === node) {
      ref = node.nextSibling;
    } else {
      parent.insertBefore(node, ref);
    }
  }
}

function observeSentinel(sentinel: HTMLElement, onLoadMore: () => void) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) onLoadMore();
    },
    { root: sentinel.parentElement }
  );
  observer.observe(sentinel);
}
