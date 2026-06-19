import { LogNote } from "../types";
import { FilterState, hasActiveFilters } from "../filters";
import { groupByDay } from "../utils";
import { activityTimestamp } from "../types";
import { CardContext, renderCard } from "./card";

export interface FeedRenderOptions {
  notes: LogNote[];
  filters: FilterState;
  hasMoreHistory: boolean;
  loadingMore: boolean;
  onLoadMore(): void;
  pendingDivider?: string; // "Writing a [type]" divider shown above a just-created note
  pendingNotePath?: string;
}

export function renderFeed(feedEl: HTMLElement, opts: FeedRenderOptions, cardCtx: CardContext) {
  const atBottom = feedEl.scrollHeight - feedEl.scrollTop <= feedEl.clientHeight + 80;

  feedEl.empty();

  if (!hasActiveFilters(opts.filters) && (opts.hasMoreHistory || opts.loadingMore)) {
    const sentinel = feedEl.createDiv("logbook-history-sentinel");
    sentinel.setText(opts.loadingMore ? "Loading more…" : "");
    observeSentinel(sentinel, opts.onLoadMore);
  }

  if (opts.notes.length === 0) {
    const empty = feedEl.createDiv("logbook-empty");
    if (hasActiveFilters(opts.filters)) {
      empty.createEl("p", { text: "No notes match the active filters." });
      empty.createEl("p", {
        cls: "logbook-empty-hint",
        text: "Type / to create a matching note, or clear filters.",
      });
    } else {
      empty.createEl("p", { text: "Nothing here yet." });
      empty.createEl("p", {
        cls: "logbook-empty-hint",
        text: "Type / to pick a note type, or just write to capture a draft.",
      });
    }
    return;
  }

  for (const [label, group] of groupByDay(opts.notes, activityTimestamp)) {
    const divider = feedEl.createDiv("logbook-divider");
    divider.createSpan({ text: label });
    for (const note of group) renderCard(feedEl, note, cardCtx);
  }

  if (opts.pendingDivider && opts.pendingNotePath) {
    const divider = feedEl.createDiv("logbook-divider logbook-divider-pending");
    divider.createSpan({ text: opts.pendingDivider });
  }

  if (atBottom || opts.pendingNotePath) {
    feedEl.scrollTop = feedEl.scrollHeight;
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
