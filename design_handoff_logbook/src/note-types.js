/* Note-type system — opinionated structure for a non-folder note app.
   Each note has a `type` that drives both display and the editor form. */

window.NOTE_TYPES = {
  draft: {
    label: "Draft",
    plural: "Drafts",
    color: "#807966",       // warm gray
    colorDark: "#a8a18d",
    description: "Quick capture. Auto-deletes after 7 days.",
  },
  task: {
    label: "Task",
    plural: "Tasks",
    color: "#c89844",       // amber
    colorDark: "#d8a85a",
    description: "An action with a status.",
  },
  meeting: {
    label: "Meeting",
    plural: "Meetings",
    color: "#5b8db8",       // dusty blue
    colorDark: "#7aaedb",
    description: "Notes from a conversation.",
  },
  thoughts: {
    label: "Thoughts",
    plural: "Thoughts",
    color: "#8a5cb2",       // muted plum
    colorDark: "#b288d4",
    description: "Working through an idea or question.",
  },
  knowledge: {
    label: "Knowledge",
    plural: "Knowledge",
    color: "#7a9956",       // moss green
    colorDark: "#a3c977",
    description: "Something worth remembering.",
  },
  design: {
    label: "Design",
    plural: "Designs",
    color: "#9b6db5",       // dusty violet (warmer than thoughts plum)
    colorDark: "#bc92d4",
    description: "Technical design of a part of a project.",
  },
};

window.TASK_STATUSES = {
  todo:      { label: "To do",     color: "#c89844", colorDark: "#d8a85a" },
  done:      { label: "Done",      color: "#4ea76c", colorDark: "#6cc287" },
  suspended: { label: "Suspended", color: "#a8a18d", colorDark: "#807966" },
};

window.DESIGN_STATUSES = {
  exploring:   { label: "Exploring",   color: "#5b8db8", colorDark: "#7aaedb" },
  "in-review": { label: "In review",   color: "#c89844", colorDark: "#d8a85a" },
  decided:     { label: "Decided",     color: "#4ea76c", colorDark: "#6cc287" },
};

window.MEETING_SUBTYPES = {
  standalone: { label: "Standalone" },
  recurring:  { label: "Recurring"  },
};

/* Which additional attributes each type exposes for filter sub-step. */
window.TYPE_FILTER_ATTRS = {
  task:      { key: "status",    values: () => Object.keys(window.TASK_STATUSES) },
  meeting:   { key: "theme",     values: (notes) => [...new Set(notes.filter(n => n.type === "meeting" && n.theme).map(n => n.theme))] },
  knowledge: { key: "techStack", values: (notes) => [...new Set(notes.filter(n => n.type === "knowledge").flatMap(n => n.techStack || []))] },
  design:    { key: "status",    values: () => Object.keys(window.DESIGN_STATUSES) },
};

/* Factory — creates a fresh note of a given type with sensible defaults. */
window.createNote = (type, prefill = {}) => {
  const now = new Date().toISOString();
  const base = {
    id: crypto.randomUUID(),
    type,
    title: prefill.title || "",
    body: prefill.body || "",
    tags: prefill.tags || [],
    projects: prefill.projects || (prefill.project ? [prefill.project] : []),
    teams: prefill.teams || (prefill.team ? [prefill.team] : []),
    createdAt: now,
    updatedAt: now,
    pinned: false,
    sourceNoteId: prefill.sourceNoteId || null,
  };
  switch (type) {
    case "task":
      return { ...base, status: prefill.status || "todo" };
    case "meeting":
      return {
        ...base,
        subtype: prefill.subtype || "standalone",
        theme: prefill.theme || "",
        subject: prefill.subject || prefill.title || "",
        attendees: prefill.attendees || [],
        templateId: prefill.templateId || null,
        occurrences: prefill.subtype === "recurring"
          ? [{ date: now, body: prefill.body || "", attendees: prefill.attendees || [] }]
          : undefined,
      };
    case "thoughts":
      return { ...base, prompt: prefill.prompt || "", landed: prefill.landed || "" };
    case "knowledge":
      return { ...base, techStack: prefill.techStack || [] };
    case "design":
      return { ...base, status: prefill.status || "exploring" };
    default:
      return base;
  }
};

/* Returns the date of the latest activity for sorting / display. */
window.latestActivity = (n) => {
  if (n.type === "meeting" && n.subtype === "recurring" && n.occurrences?.length) {
    return n.occurrences[0].date; // newest at index 0
  }
  return n.updatedAt;
};

/* True if a note matches a free-text search query (across all its fields). */
window.noteMatchesQuery = (n, q) => {
  if (!q) return true;
  const parts = [n.title, n.body, n.tags?.join(" "), (n.projects || []).join(" "), (n.teams || []).join(" ")];
  if (n.type === "meeting") {
    parts.push(n.theme, n.subject, (n.attendees || []).join(" "));
    if (n.occurrences) {
      n.occurrences.forEach(o => parts.push(o.body, (o.attendees || []).join(" ")));
    }
  }
  if (n.type === "thoughts") parts.push(n.prompt, n.landed);
  if (n.type === "knowledge") parts.push((n.techStack || []).join(" "));
  if (n.type === "design") parts.push(n.status);
  const hay = parts.filter(Boolean).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t.replace(/^#/, "")));
};

/* Returns the preview-body string for a note (whatever is most descriptive). */
window.notePreviewBody = (n) => {
  if (n.type === "meeting" && n.subtype === "recurring" && n.occurrences?.length) {
    return n.occurrences[0].body || "";
  }
  return n.body || "";
};

/* Format a title into a UNIX-safe filename. */
window.titleToFilename = (title) => {
  const clean = (title || "untitled")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")        // strip diacritics
    .replace(/[^a-z0-9\s_-]/g, "")          // drop punctuation
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
  return (clean || "untitled") + ".md";
};
