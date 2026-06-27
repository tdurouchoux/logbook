---
id: t5h0ughtmc
type: thoughts
title: "MCP read vs write tools tradeoffs"
projects: [mcp-server]
teams: []
createdAt: 2026-06-27T07:40:00.000Z
---

Read-only first. Write tools need a story for the per-path write queue before they're safe to expose to an agent.
