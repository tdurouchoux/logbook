---
id: k6n0wledgo
type: knowledge
title: "Obsidian processFrontMatter gotchas"
projects: [logbook]
teams: []
tags: [reference]
createdAt: 2026-05-30T15:00:00.000Z
techStack: [obsidian-api, typescript]
---

Rapid concurrent calls on the same file can drop writes — always serialize per path, never fire independently.
