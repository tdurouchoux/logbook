---
status: "accepted"
date: "2026-07-25"
decision-makers: "tdurouchoux"
---

# Refresh the feed only on logbook-folder events, with debouncing

## Context and Problem Statement

`LogbookView` reloaded and re-parsed the entire logbook folder on almost any vault activity, with no debouncing and no folder scoping on the triggering events: editing any file, anywhere in the vault, triggered a full reload of the feed. Measured on a synthetic 10,000-note vault, one reload costs 20 ms warm and 1,936 ms cold, and is triggered twice per edit (`vault.modify`, then `metadataCache.changed`). How can this cost be brought down to an acceptable level without rewriting the vault access layer?

## Considered Options

* Folder-scoped event listeners, debounced refresh, and a lighter card signature
* Incremental note cache in `NoteStore` (`Map<path, LogNote>` with per-path invalidation)
* Parallelized file reads via `Promise.all`

## Decision Outcome

Chosen option: "Folder-scoped event listeners, debounced refresh, and a lighter card signature", because it attacks the *frequency* of reloads — the actual cause of the problem — in about thirty lines and without touching `NoteStore`'s public API, whereas the incremental cache requires invalidation machinery (rename, delete, folder-setting change, the MCP server's separate instance) for a gain that only materializes once frequency is already under control.

Parallelization via `Promise.all` is explicitly rejected: measured slower than the sequential pass when warm (25 ms vs 20 ms across 10,000 notes) and raising `EMFILE` beyond 5,000 files when cold.

Removing `note.body` from `cardSignature` accompanies the decision: any write that changes a body already bumps `file.stat.mtime`, which is part of the key, so serializing each card's full text on every render only duplicated an existing signal (52 ms vs 8 ms across 10,000 rendered cards).

### Consequences

* Good, because activity outside the logbook folder now costs nothing, and a burst of events (sync, autosave) collapses into a single reload.
* Good, because folder scoping forced the fix of a latent bug: a note moved *out* of the folder triggered no refresh at all, leaving its card displayed indefinitely — masked until now by the unscoped listeners refreshing on unrelated activity.
* Bad, because an external edit takes up to 300 ms to appear in the feed.
* Neutral, because the cost of a reload remains linear in note count; should profiling on a real vault justify it, the incremental cache stays open — in its most efficient measured form, the one that keeps the assembled array and replaces only the changed entry (0.11 ms vs 3.3 ms for a plain `Map` that rebuilds the array).
