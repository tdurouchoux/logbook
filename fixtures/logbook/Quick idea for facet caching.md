---
id: x7m2qz9kpl
type: draft
title: "Quick idea for facet caching"
projects: [mcp-server]
teams: []
tags: [idea]
createdAt: 2026-06-26T14:32:00.000Z
---

What if `list_projects`/`list_teams`/`list_tags` cached their facet counts per load instead of recomputing on every call? Probably premature — revisit once it's actually slow.
