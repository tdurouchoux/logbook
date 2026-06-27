---
id: d9esigncrd
type: design
title: "Card save-on-close architecture"
projects: [logbook]
teams: []
createdAt: 2026-05-20T17:00:00.000Z
status: decided
---

Nothing hits disk while a field is being edited — every staged edit flushes in one batched write when the card closes. Settled, see design.md §4.
