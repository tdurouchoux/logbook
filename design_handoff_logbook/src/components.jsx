/* eslint-disable react/prop-types */
/* Logbook — type-aware components.
   Hooks come from window.React; we destructure here once.        */
const { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } = React;

/* ─────────────────────────────────────────────────────────
   Icons (Lucide-style, 24×24 viewbox)
   ───────────────────────────────────────────────────────── */
const Icon = ({ name, size = 17, strokeWidth = 1.8 }) => {
  const paths = {
    search:    <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    moon:      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
    sun:       <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    expand:    <><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></>,
    plus:      <><path d="M12 5v14M5 12h14"/></>,
    x:         <><path d="M18 6 6 18M6 6l12 12"/></>,
    pin:       <><path d="m12 17 0 5M9 8a3 3 0 0 0 0 6h6a3 3 0 0 0 0-6M9 8h6M9 8V3h6v5"/></>,
    trash:     <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    braces:    <><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></>,
    check:     <path d="m5 12 5 5L20 7"/>,
    arrowLeft: <path d="m19 12H5M12 19l-7-7 7-7"/>,
    eye:       <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    pencil:    <><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>,
    keyboard:  <><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M8 18h8"/></>,
    folder:    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>,
    users:     <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    plus_circle: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
    cornerDownRight: <><path d="M4 4v7a4 4 0 0 0 4 4h12M16 11l4 4-4 4"/></>,
    chevronDown: <path d="m6 9 6 6 6-6"/>,
    /* type glyphs (used in command palette + occasionally cards) */
    t_draft:     <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"/></>,
    t_task:      <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m8 12 3 3 5-6"/></>,
    t_meeting:   <><path d="M3 6a3 3 0 0 1 3-3h9l6 6v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><path d="M15 3v6h6"/></>,
    t_thoughts:  <><path d="M21 12a9 9 0 0 0-9-9v18a9 9 0 0 0 9-9z"/><circle cx="12" cy="12" r="9"/></>,
    t_knowledge: <><path d="M4 4v16a2 2 0 0 0 2 2h14V4H6a2 2 0 0 0-2 2"/><path d="M9 8h7M9 12h5"/></>,
    t_design:    <><path d="M3 3h18v18H3z" opacity=".0"/><path d="M12 3v18M3 12h18" opacity=".4"/><path d="M3 3h18v18H3z"/><circle cx="7.5" cy="7.5" r="1.4" fill="currentColor"/><circle cx="16.5" cy="16.5" r="1.4" fill="currentColor"/></>,
    layers:      <><path d="m12 2 10 6-10 6L2 8z"/><path d="m2 16 10 6 10-6"/><path d="m2 12 10 6 10-6"/></>,
    chevronsRight: <><path d="m6 17 5-5-5-5M13 17l5-5-5-5"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

/* ─────────────────────────────────────────────────────────
   Relative time
   ───────────────────────────────────────────────────────── */
const relTime = (iso) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const fmtDay = (iso) => {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dDay = new Date(d); dDay.setHours(0, 0, 0, 0);
  const diff = Math.floor((today - dDay) / (24 * 3600_000));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const fmtMeetingDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

/* ─────────────────────────────────────────────────────────
   Tag chip + tag input
   ───────────────────────────────────────────────────────── */
const Tag = ({ name, active, onClick, onRemove }) => (
  <span
    className={`tag${active ? " is-active" : ""}`}
    onClick={(e) => { e.stopPropagation(); onClick && onClick(name); }}
  >
    {name}
    {onRemove && (
      <button className="tag__remove" onClick={(e) => { e.stopPropagation(); onRemove(name); }} aria-label={`remove ${name}`}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    )}
  </span>
);

const TagInput = ({ tags, allTags, onAdd, onRemove }) => {
  const [val, setVal] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const inputRef = useRef(null);

  const suggest = useMemo(() => {
    const q = val.trim().toLowerCase();
    if (!q) return [];
    return allTags.filter(t => t.toLowerCase().includes(q) && !tags.includes(t)).slice(0, 6);
  }, [val, allTags, tags]);

  const add = (raw) => {
    const clean = raw.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
    if (!clean) return;
    if (!tags.includes(clean)) onAdd(clean);
    setVal("");
  };

  return (
    <>
      {tags.map(t => <Tag key={t} name={t} onRemove={() => onRemove(t)} />)}
      <div style={{ position: "relative", display: "inline-block" }}>
        <input
          ref={inputRef}
          className="tag-input"
          placeholder={tags.length ? "+ tag" : "+ add tags…"}
          value={val}
          onChange={(e) => { setVal(e.target.value); setShowSuggest(true); }}
          onFocus={() => setShowSuggest(true)}
          onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(val); }
            else if (e.key === "Backspace" && !val && tags.length) onRemove(tags[tags.length - 1]);
            else if (e.key === "Escape") setShowSuggest(false);
          }}
        />
        {showSuggest && suggest.length > 0 && (
          <div className="tag-suggest" style={{ top: "calc(100% + 4px)", left: 0 }}>
            {suggest.map(s => (
              <div key={s} className="tag-suggest__item" onMouseDown={(e) => { e.preventDefault(); add(s); }}>
                <span style={{ color: "var(--muted-soft)" }}>#</span>{s}
                <span className="tag-suggest__hint">existing</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

/* ─────────────────────────────────────────────────────────
   Type / status / project / team primitives
   ───────────────────────────────────────────────────────── */
const TypeBadge = ({ type, extra, onClick, active }) => {
  const meta = NOTE_TYPES[type];
  if (!meta) return null;
  return (
    <span
      className={`type-badge type-badge--${type}${active ? " is-active" : ""}${onClick ? " is-clickable" : ""}`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(type); } : undefined}
      title={meta.description}
    >
      <span className="type-badge__dot"/>
      {meta.label}
      {extra && <span className="type-badge__extra">· {extra}</span>}
    </span>
  );
};

const StatusPill = ({ status, onCycle, readOnly, kind = "task" }) => {
  const meta = kind === "design" ? DESIGN_STATUSES[status] : TASK_STATUSES[status];
  if (!meta) return null;
  const icons = {
    todo:        <rect x="4" y="4" width="16" height="16" rx="3" fill="none"/>,
    done:        <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6" stroke="white" strokeWidth="2.2" fill="none"/></>,
    suspended:   <><rect x="4" y="4" width="16" height="16" rx="3" fill="none"/><path d="M9 8v8M15 8v8"/></>,
    exploring:   <><circle cx="12" cy="12" r="8" fill="none"/><path d="M12 8v4l3 2"/></>,
    "in-review": <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    decided:     <><circle cx="12" cy="12" r="9" fill="currentColor"/><path d="m8 12 3 3 5-6" stroke="white" strokeWidth="2.2" fill="none"/></>,
  };
  const next = kind === "design"
    ? { exploring: "in-review", "in-review": "decided", decided: "exploring" }[status]
    : { todo: "done", done: "suspended", suspended: "todo" }[status];
  return (
    <button
      className={`status-pill status-pill--${status}${readOnly ? " is-readonly" : ""}`}
      onClick={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        onCycle && onCycle(next);
      }}
      title={readOnly ? meta.label : `${meta.label} · click to cycle`}
      type="button"
      disabled={readOnly}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {icons[status]}
      </svg>
      {meta.label}
    </button>
  );
};

const ProjectChip = ({ name, active, onClick, onRemove }) => name ? (
  <span className={`pt-chip pt-chip--project${active ? " is-active" : ""}`} onClick={onClick ? (e) => { e.stopPropagation(); onClick(name); } : undefined}>
    <Icon name="folder" size={11} strokeWidth={2}/>
    {name}
    {onRemove && (
      <button className="pt-chip__remove" onClick={(e) => { e.stopPropagation(); onRemove(name); }}>
        <Icon name="x" size={9} strokeWidth={3}/>
      </button>
    )}
  </span>
) : null;

const TeamChip = ({ name, active, onClick, onRemove }) => name ? (
  <span className={`pt-chip pt-chip--team${active ? " is-active" : ""}`} onClick={onClick ? (e) => { e.stopPropagation(); onClick(name); } : undefined}>
    <Icon name="users" size={11} strokeWidth={2}/>
    {name}
    {onRemove && (
      <button className="pt-chip__remove" onClick={(e) => { e.stopPropagation(); onRemove(name); }}>
        <Icon name="x" size={9} strokeWidth={3}/>
      </button>
    )}
  </span>
) : null;

/* Project / team picker — text input with autocomplete from existing values */
const PtPicker = ({ kind, value, options, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");
  const inputRef = useRef(null);
  useEffect(() => { setVal(value || ""); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const suggest = useMemo(() => {
    const q = val.trim().toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q) && o !== value).slice(0, 6);
  }, [val, options, value]);

  const commit = (v) => {
    const clean = v.trim().toLowerCase().replace(/\s+/g, "-");
    onChange(clean || null);
    setEditing(false);
  };

  const Icn = kind === "project" ? "folder" : "users";

  if (!editing) {
    return value ? (
      <button className={`pt-picker pt-picker--${kind} has-value`} onClick={() => setEditing(true)}>
        <Icon name={Icn} size={11} strokeWidth={2}/>
        {value}
      </button>
    ) : (
      <button className={`pt-picker pt-picker--${kind}`} onClick={() => setEditing(true)}>
        <Icon name={Icn} size={11} strokeWidth={2}/>
        <span className="pt-picker__placeholder">{kind}</span>
      </button>
    );
  }
  return (
    <div className={`pt-picker pt-picker--${kind} is-editing`}>
      <Icon name={Icn} size={11} strokeWidth={2}/>
      <input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={kind}
        onBlur={() => setTimeout(() => { commit(val); }, 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(val); }
          else if (e.key === "Escape") { e.preventDefault(); setEditing(false); setVal(value || ""); }
          else if (e.key === "Backspace" && !val) { onChange(null); setEditing(false); }
        }}
      />
      {suggest.length > 0 && (
        <div className="pt-picker__menu">
          {suggest.map(s => (
            <div key={s} className="pt-picker__item" onMouseDown={(e) => { e.preventDefault(); commit(s); }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* Multi-value picker for projects[] / teams[].
   Renders one chip per value + an "+ add" affordance. */
const PtMultiPicker = ({ kind, values, options, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const suggest = useMemo(() => {
    const q = val.trim().toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q) && !values.includes(o)).slice(0, 6);
  }, [val, options, values]);

  const add = (raw) => {
    const clean = (raw || "").trim().toLowerCase().replace(/\s+/g, "-");
    if (!clean || values.includes(clean)) return;
    onChange([...values, clean]);
    setVal("");
  };
  const remove = (v) => onChange(values.filter(x => x !== v));

  const Icn = kind === "project" ? "folder" : "users";
  const Chip = kind === "project" ? ProjectChip : TeamChip;

  return (
    <>
      {values.map(v => (
        <Chip key={v} name={v} onRemove={() => remove(v)} />
      ))}
      {!editing ? (
        <button className={`pt-picker pt-picker--${kind}`} onClick={() => setEditing(true)}>
          <Icon name={Icn} size={11} strokeWidth={2}/>
          <span className="pt-picker__placeholder">+ {kind}</span>
        </button>
      ) : (
        <div className={`pt-picker pt-picker--${kind} is-editing`}>
          <Icon name={Icn} size={11} strokeWidth={2}/>
          <input
            ref={inputRef}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={kind}
            onBlur={() => setTimeout(() => { if (val) add(val); setEditing(false); }, 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(val); }
              else if (e.key === "Escape") { e.preventDefault(); setEditing(false); setVal(""); }
              else if (e.key === "Backspace" && !val && values.length) { remove(values[values.length - 1]); }
            }}
          />
          {suggest.length > 0 && (
            <div className="pt-picker__menu">
              {suggest.map(s => (
                <div key={s} className="pt-picker__item" onMouseDown={(e) => { e.preventDefault(); add(s); }}>
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

/* ─────────────────────────────────────────────────────────
   Note card — type-aware
   ───────────────────────────────────────────────────────── */
const NoteCard = ({
  note, query, activeTags, activeProject, activeTeam, activeTechStack,
  onClickTag, onClickProject, onClickTeam, onClickType, onClickTechStack,
  onClickEdit, onPin, onDelete,
}) => {
  const preview = useMemo(() => toPlainText(notePreviewBody(note)), [note]);
  const highlighted = useMemo(() => searchHighlight(preview, query), [preview, query]);
  const titleHighlighted = useMemo(() => searchHighlight(note.title || "Untitled", query), [note.title, query]);
  const lastTime = note.type === "meeting" && note.subtype === "recurring" && note.occurrences?.length
    ? note.occurrences[0].date
    : note.updatedAt;

  const extra = note.type === "meeting" && note.subtype === "recurring"
    ? `${note.occurrences?.length || 0} occurrences`
    : note.type === "meeting" && note.subtype === "standalone"
      ? "standalone"
      : null;

  return (
    <article
      className={`note note--${note.type}${note.pinned ? " is-pinned" : ""}${note.type === "task" && note.status === "done" ? " is-done" : ""}${note.type === "task" && note.status === "suspended" ? " is-suspended" : ""}`}
      onClick={onClickEdit}
    >
      <div className="note__topbar">
        <div className="note__topbar-left">
          <TypeBadge type={note.type} extra={extra} onClick={onClickType}/>
          {note.type === "task" && (
            <StatusPill status={note.status} readOnly kind="task"/>
          )}
          {note.type === "design" && (
            <StatusPill status={note.status} readOnly kind="design"/>
          )}
          {(note.projects || []).map(p => (
            <ProjectChip key={p} name={p} active={activeProject === p} onClick={onClickProject}/>
          ))}
          {(note.teams || []).map(t => (
            <TeamChip key={t} name={t} active={activeTeam === t} onClick={onClickTeam}/>
          ))}
        </div>
        <time className="note__time" title={new Date(lastTime).toLocaleString()}>
          {relTime(lastTime)}
        </time>
      </div>

      <div className="note__head">
        <h3 className="note__title" dangerouslySetInnerHTML={{ __html: titleHighlighted }}/>
      </div>

      {/* type-specific meta line */}
      {note.type === "meeting" && (
        <div className="note__meta">
          {note.theme && <span className="note__meta-key">{note.theme}</span>}
          {note.attendees?.length > 0 && (
            <span className="note__meta-attendees">{note.attendees.join(" · ")}</span>
          )}
        </div>
      )}
      {note.type === "thoughts" && note.prompt && (
        <div className="note__prompt">
          <span className="note__prompt-mark">?</span>
          <span dangerouslySetInnerHTML={{ __html: searchHighlight(note.prompt, query) }}/>
        </div>
      )}
      {note.type === "knowledge" && (note.techStack || []).length > 0 && (
        <div className="note__source">
          <span className="note__source-label">stack</span>
          <span className="note__stack">
            {note.techStack.map((s, i) => (
              <span
                key={s}
                className={`note__stack-item${activeTechStack === s ? " is-active" : ""}`}
                onClick={(e) => { e.stopPropagation(); onClickTechStack && onClickTechStack(s); }}
              >{s}</span>
            ))}
          </span>
        </div>
      )}

      {preview && (
        <p className="note__body" dangerouslySetInnerHTML={{ __html: highlighted }}/>
      )}

      <div className="note__foot">
        <div className="note__tags">
          {note.tags.map(t => (
            <Tag key={t} name={t} active={activeTags.includes(t)} onClick={onClickTag}/>
          ))}
        </div>
        <div className="note__actions">
          <button className={`icon-btn${note.pinned ? " is-active" : ""}`} title={note.pinned ? "Unpin" : "Pin to top"} onClick={(e) => { e.stopPropagation(); onPin(note.id); }}>
            <Icon name="pin" size={14}/>
          </button>
          <button className="icon-btn" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}>
            <Icon name="trash" size={14}/>
          </button>
        </div>
      </div>
    </article>
  );
};

/* ─────────────────────────────────────────────────────────
   Inline editor — type-aware
   ───────────────────────────────────────────────────────── */
const InlineEditor = ({
  note, allTags, allProjects, allTeams, allTechStack,
  onSave, onCancel, onFocus, onDelete, onCreateTaskFrom,
  isNew, initialMode = "edit",
}) => {
  const [title, setTitle] = useState(note?.title || "");
  const [body, setBody] = useState(note?.body || "");
  const [tags, setTags] = useState(note?.tags || []);
  const [projects, setProjects] = useState(note?.projects || []);
  const [teams, setTeams] = useState(note?.teams || []);

  /* type-specific state */
  const [status, setStatus] = useState(note?.status || (note?.type === "design" ? "exploring" : "todo"));
  const [theme, setTheme] = useState(note?.theme || "");
  const [subject, setSubject] = useState(note?.subject || "");
  const [attendees, setAttendees] = useState(note?.attendees || []);
  const [occurrences, setOccurrences] = useState(note?.occurrences || []);
  const [activeOccIdx, setActiveOccIdx] = useState(0);
  const [prompt, setPrompt] = useState(note?.prompt || "");
  const [landed, setLanded] = useState(note?.landed || "");
  const [techStack, setTechStack] = useState(note?.techStack || []);

  const [showSource, setShowSource] = useState(false);
  const [mode, setMode] = useState(initialMode);
  const bodyRef = useRef(null);

  const type = note?.type || "draft";
  const isRecurring = type === "meeting" && note?.subtype === "recurring";

  /* the body we render/edit varies by subtype:
     - recurring meeting → the currently-selected occurrence's body
     - everything else   → the note's body field                       */
  const activeBody = isRecurring && occurrences[activeOccIdx] ? occurrences[activeOccIdx].body : body;
  const setActiveBody = (v) => {
    if (isRecurring) {
      setOccurrences(occurrences.map((o, i) => i === activeOccIdx ? { ...o, body: v } : o));
    } else {
      setBody(v);
    }
  };

  /* auto-grow */
  useLayoutEffect(() => {
    const t = bodyRef.current;
    if (!t || mode !== "edit" || showSource) return;
    t.style.height = "auto";
    t.style.height = Math.max(120, t.scrollHeight) + "px";
  }, [activeBody, mode, showSource, activeOccIdx]);

  const renderedHtml = useMemo(() => {
    if (!activeBody || !activeBody.trim()) return "";
    return window.renderMarkdown(activeBody);
  }, [activeBody]);

  const switchToEdit = useCallback(() => {
    if (showSource) return;
    setMode("edit");
    requestAnimationFrame(() => {
      const t = bodyRef.current;
      if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    });
  }, [showSource]);

  /* build the save payload, including type-specific fields */
  const build = () => {
    const base = { title: title.trim() || (type === "meeting" ? subject.trim() : "Untitled"), body, tags, projects, teams };
    switch (type) {
      case "task":      return { ...base, status };
      case "meeting":   return { ...base, title: subject.trim() || base.title, subject, theme, attendees, ...(isRecurring ? { occurrences } : {}) };
      case "thoughts":  return { ...base, prompt, landed };
      case "knowledge": return { ...base, techStack };
      case "design":    return { ...base, status };
      default:          return base;
    }
  };

  const save = useCallback(() => onSave(build()), [title, body, tags, projects, teams, status, theme, subject, attendees, occurrences, prompt, landed, techStack, onSave]);

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
    else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };

  const addOccurrence = () => {
    const now = new Date().toISOString();
    setOccurrences([{ date: now, body: "", attendees }, ...occurrences]);
    setActiveOccIdx(0);
  };

  const buildRawMd = () => {
    const fileTitle = build().title;
    const fields = [
      `type: ${type}`,
      `title: ${fileTitle}`,
      tags.length ? `tags: [${tags.join(", ")}]` : null,
      projects.length ? `projects: [${projects.join(", ")}]` : null,
      teams.length ? `teams: [${teams.join(", ")}]` : null,
      type === "task" ? `status: ${status}` : null,
      type === "design" ? `status: ${status}` : null,
      type === "meeting" ? `subject: ${subject}` : null,
      type === "meeting" ? `theme: ${theme}` : null,
      type === "meeting" ? `subtype: ${note?.subtype || "standalone"}` : null,
      type === "meeting" && attendees.length ? `attendees: [${attendees.join(", ")}]` : null,
      type === "thoughts" && prompt ? `prompt: ${prompt}` : null,
      type === "thoughts" && landed ? `landed: ${landed}` : null,
      type === "knowledge" && techStack.length ? `tech_stack: [${techStack.join(", ")}]` : null,
      note?.sourceNoteId ? `sourceNoteId: ${note.sourceNoteId}` : null,
      `created: ${note?.createdAt || new Date().toISOString()}`,
      `updated: ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n");
    const bodyForMd = isRecurring
      ? occurrences.map(o => `## ${fmtMeetingDate(o.date)}\n\n${o.body}`).join("\n\n")
      : body;
    const filename = window.titleToFilename ? window.titleToFilename(fileTitle) : `${fileTitle}.md`;
    return `# ${filename}\n---\n${fields}\n---\n${bodyForMd}`;
  };

  return (
    <div className={`editor editor--${type} fade-enter`} onKeyDown={onKey}>
      {/* top row: type, status (task/design), project, team */}
      <div className="editor__topbar">
        <TypeBadge type={type}/>
        {type === "task" && (
          <StatusPill status={status} onCycle={setStatus} kind="task"/>
        )}
        {type === "design" && (
          <StatusPill status={status} onCycle={setStatus} kind="design"/>
        )}
        <PtMultiPicker kind="project" values={projects} options={allProjects} onChange={setProjects}/>
        <PtMultiPicker kind="team" values={teams} options={allTeams} onChange={setTeams}/>
      </div>

      {/* meeting-specific theme/subject row */}
      {type === "meeting" && (
        <div className="editor__meeting-head">
          <input
            className="editor__theme"
            placeholder="Theme (e.g. Design, Product sync)"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          />
          <input
            className="editor__title editor__subject"
            placeholder="Subject"
            value={subject}
            onChange={(e) => { setSubject(e.target.value); setTitle(e.target.value); }}
            autoFocus={isNew}
          />
        </div>
      )}

      {/* default title for non-meeting types */}
      {type !== "meeting" && (
        <input
          autoFocus={isNew}
          className="editor__title"
          placeholder={type === "task" ? "What needs doing?"
            : type === "thoughts" ? "What are you thinking about?"
            : type === "knowledge" ? "What's worth remembering?"
            : "Untitled note"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      )}

      {/* thoughts prompt */}
      {type === "thoughts" && (
        <div className="editor__sub">
          <span className="editor__sub-label">Prompt</span>
          <input
            className="editor__sub-input"
            placeholder="The question you're chewing on…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
      )}

      {/* knowledge tech stack */}
      {type === "knowledge" && (
        <div className="editor__sub">
          <span className="editor__sub-label">Tech stack</span>
          <TagInput
            tags={techStack}
            allTags={allTechStack || []}
            onAdd={(s) => setTechStack([...techStack, s])}
            onRemove={(s) => setTechStack(techStack.filter(x => x !== s))}
          />
        </div>
      )}

      {/* meeting attendees */}
      {type === "meeting" && (
        <div className="editor__sub">
          <span className="editor__sub-label">Attendees</span>
          <TagInput
            tags={attendees}
            allTags={[]}
            onAdd={(a) => setAttendees([...attendees, a])}
            onRemove={(a) => setAttendees(attendees.filter(x => x !== a))}
          />
        </div>
      )}

      {/* recurring occurrence tabs */}
      {isRecurring && (
        <div className="editor__occurrences">
          <button
            className="editor__occ-add"
            onClick={addOccurrence}
            title="Add a new occurrence (today)"
          >
            <Icon name="plus" size={11} strokeWidth={2.4}/>
            new
          </button>
          <div className="editor__occ-list">
            {occurrences.map((o, i) => (
              <button
                key={i}
                className={`editor__occ-tab${i === activeOccIdx ? " is-active" : ""}`}
                onClick={() => setActiveOccIdx(i)}
              >
                {fmtMeetingDate(o.date)}
                {i === 0 && <span className="editor__occ-latest">latest</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* body — preview or edit */}
      {showSource ? (
        <pre className="editor__rawsrc">{buildRawMd()}</pre>
      ) : mode === "preview" ? (
        renderedHtml ? (
          <div className="md editor__preview" onClick={switchToEdit}
               dangerouslySetInnerHTML={{ __html: renderedHtml }}/>
        ) : (
          <div className="editor__preview editor__preview--empty" onClick={switchToEdit}>
            <em>Empty.</em> Click to write…
          </div>
        )
      ) : (
        <textarea
          ref={bodyRef}
          className="editor__body"
          placeholder={isRecurring
            ? "Notes from this occurrence. Markdown supported."
            : "Markdown supported. **bold** *italic* `code` # heading > [!note] callout…"}
          value={activeBody}
          onChange={(e) => setActiveBody(e.target.value)}
          autoFocus={!isNew && initialMode === "edit"}
        />
      )}

      {/* thoughts landed */}
      {type === "thoughts" && (
        <div className="editor__sub editor__sub--landed">
          <span className="editor__sub-label">Where I landed</span>
          <textarea
            className="editor__sub-textarea"
            placeholder="The takeaway. Leave blank if still working through it."
            value={landed}
            onChange={(e) => setLanded(e.target.value)}
            rows={2}
          />
        </div>
      )}

      <div className="editor__tags">
        <TagInput
          tags={tags}
          allTags={allTags}
          onAdd={(t) => setTags([...tags, t])}
          onRemove={(t) => setTags(tags.filter(x => x !== t))}
        />
      </div>

      <div className="editor__bar">
        <div className="editor__bar-left">
          <span className="editor__hint">
            {mode === "preview" && !showSource
              ? <>Click body to edit · <kbd>esc</kbd> close</>
              : <><kbd>⌘</kbd><kbd>↵</kbd> save · <kbd>esc</kbd> cancel</>}
          </span>
          {!isNew && onCreateTaskFrom && type !== "task" && (
            <button
              className="btn btn--ghost editor__taskfrom"
              title="Create a new task linked to this note"
              onClick={() => onCreateTaskFrom(note)}
            >
              <Icon name="plus_circle" size={13} strokeWidth={2}/>
              New task from this note
            </button>
          )}
        </div>
        <div className="editor__bar-right">
          <button
            className={`icon-btn${mode === "preview" && !showSource ? " is-active" : ""}`}
            title={mode === "preview" ? "Edit raw markdown" : "Preview rendered markdown"}
            onClick={() => { if (showSource) setShowSource(false); setMode(mode === "preview" ? "edit" : "preview"); }}
          >
            <Icon name={mode === "preview" ? "pencil" : "eye"} size={14}/>
          </button>
          <button
            className={`icon-btn${showSource ? " is-active" : ""}`}
            title={showSource ? "Hide raw source" : "View .md source with front matter"}
            onClick={() => setShowSource(s => !s)}
          >
            <Icon name="braces" size={14}/>
          </button>
          <button className="icon-btn" title="Open in focus mode" onClick={() => onFocus(build())}>
            <Icon name="expand" size={14}/>
          </button>
          {!isNew && (
            <button className="icon-btn" title="Delete" onClick={() => onDelete(note.id)}>
              <Icon name="trash" size={14}/>
            </button>
          )}
          <button className="btn btn--ghost" onClick={onCancel}>
            {mode === "preview" && !isNew ? "Close" : "Cancel"}
          </button>
          <button className="btn btn--primary" onClick={save}>
            <Icon name="check" size={13}/>
            {isNew ? "Publish" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Focus mode — full-screen distraction-free editor
   For meetings/recurring, edits the latest occurrence.
   ───────────────────────────────────────────────────────── */
const FocusMode = ({ note, allTags, onClose, onSave, isNew }) => {
  const isRecurring = note?.type === "meeting" && note?.subtype === "recurring";
  const initialBody = isRecurring && note?.occurrences?.length
    ? note.occurrences[0].body
    : note?.body || "";
  const [title, setTitle] = useState(note?.title || "");
  const [body, setBody] = useState(initialBody);
  const [tags, setTags] = useState(note?.tags || []);
  const [saved, setSaved] = useState(true);
  const bodyRef = useRef(null);
  const dirtyRef = useRef(false);

  useLayoutEffect(() => {
    const t = bodyRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = Math.max(window.innerHeight * 0.5, t.scrollHeight) + "px";
  }, [body]);

  const buildPayload = useCallback(() => {
    const base = { ...note, title: title.trim() || "Untitled", tags };
    if (isRecurring && note.occurrences?.length) {
      base.occurrences = note.occurrences.map((o, i) => i === 0 ? { ...o, body } : o);
    } else {
      base.body = body;
    }
    return base;
  }, [note, title, body, tags, isRecurring]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    setSaved(false);
    const id = setTimeout(() => { onSave(buildPayload()); setSaved(true); }, 600);
    return () => clearTimeout(id);
  }, [title, body, tags, onSave, buildPayload]);

  const markDirty = () => { dirtyRef.current = true; };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose(buildPayload());
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onClose(buildPayload());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buildPayload, onClose]);

  return (
    <div className="focus-overlay">
      <div className="focus__bar">
        <div className="focus__bar-left">
          <button className="icon-btn" onClick={() => onClose(buildPayload())} title="Exit focus (Esc)">
            <Icon name="arrowLeft" size={16}/>
          </button>
          <TypeBadge type={note?.type || "draft"}/>
          <span className="focus__status">
            <span className="focus__status-dot" style={{ background: saved ? "#4ea76c" : "#c89844" }}/>
            {saved ? "Saved" : "Saving…"}
          </span>
        </div>
        <div className="focus__bar-right">
          <span className="editor__hint">
            <kbd>esc</kbd> to exit · <kbd>⌘</kbd><kbd>↵</kbd> done
          </span>
        </div>
      </div>
      <div className="focus__scroll">
        <div className="focus__inner">
          <div className="focus__tags">
            <TagInput
              tags={tags}
              allTags={allTags}
              onAdd={(t) => { setTags([...tags, t]); markDirty(); }}
              onRemove={(t) => { setTags(tags.filter(x => x !== t)); markDirty(); }}
            />
          </div>
          <input
            className="focus__title"
            placeholder="Untitled"
            value={title}
            onChange={(e) => { setTitle(e.target.value); markDirty(); }}
            autoFocus={isNew && !title}
          />
          <textarea
            ref={bodyRef}
            className="focus__body"
            placeholder="Write freely. Markdown supported."
            value={body}
            onChange={(e) => { setBody(e.target.value); markDirty(); }}
            autoFocus={!!title || !isNew}
          />
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Command bar — search + /-commands
   ───────────────────────────────────────────────────────── */
const COMMANDS = [
  { cmd: "/draft",      type: "create", noteType: "draft",      label: "Draft",            hint: "quick capture",         icon: "t_draft" },
  { cmd: "/task",       type: "create", noteType: "task",       label: "Task",             hint: "an action with status", icon: "t_task" },
  { cmd: "/done",       type: "create", noteType: "task",       label: "Task (done)",      hint: "log something done",    icon: "t_task", status: "done" },
  { cmd: "/meeting",    type: "create", noteType: "meeting",    label: "Meeting",          hint: "standalone",            icon: "t_meeting", subtype: "standalone" },
  { cmd: "/recurring",  type: "create", noteType: "meeting",    label: "Recurring meeting",hint: "stacked occurrences",   icon: "t_meeting", subtype: "recurring" },
  { cmd: "/thoughts",   type: "create", noteType: "thoughts",   label: "Thoughts",         hint: "explore an idea",       icon: "t_thoughts" },
  { cmd: "/knowledge",  type: "create", noteType: "knowledge",  label: "Knowledge",        hint: "something worth remembering", icon: "t_knowledge" },
  { cmd: "/design",     type: "create", noteType: "design",     label: "Design",           hint: "a technical design",    icon: "t_design" },
  { cmd: "/project",    type: "filter", filterKey: "project",   label: "Filter by project",hint: "/project name",         icon: "folder" },
  { cmd: "/team",       type: "filter", filterKey: "team",      label: "Filter by team",   hint: "/team name",            icon: "users" },
  { cmd: "/type",       type: "filter", filterKey: "type",      label: "Filter by type",   hint: "/type task → status",   icon: "layers" },
  { cmd: "/clear",      type: "action", action: "clear",        label: "Clear filters",    hint: "reset",                  icon: "x" },
];

const CommandBar = ({
  query, setQuery,
  activeTags, setActiveTags,
  activeProject, setActiveProject,
  activeTeam, setActiveTeam,
  activeType, setActiveType,
  activeTypeAttr, setActiveTypeAttr,
  activeTechStack, setActiveTechStack,
  allTags, allProjects, allTeams, allTechStack, allNotes,
  resultCount, totalCount,
  onCreate,
}) => {
  const inputRef = useRef(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuIdx, setMenuIdx] = useState(0);

  // global "/" focuses
  useEffect(() => {
    const onKey = (e) => {
      const active = document.activeElement;
      const onForm = active?.tagName === "INPUT" || active?.tagName === "TEXTAREA";
      if (e.key === "/" && !onForm) {
        e.preventDefault();
        inputRef.current?.focus();
        setQuery("/");
        setShowMenu(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setQuery]);

  const isCmd = query.startsWith("/");
  const cmdTokens = isCmd ? query.slice(1).split(/\s+/) : [];
  const cmdPrefix = cmdTokens[0] || "";
  const cmdArg = cmdTokens.slice(1).join(" ");

  /* what command items match the current input */
  const matches = useMemo(() => {
    if (!isCmd) return [];
    if (!cmdPrefix) return COMMANDS;
    return COMMANDS.filter(c => c.cmd.slice(1).startsWith(cmdPrefix.toLowerCase()));
  }, [isCmd, cmdPrefix]);

  /* filter suggestions — uniform shape: { kind, label, sublabel?, value, value2? }
     where the renderer just shows label + sublabel and the picker dispatches based on kind */
  const filterSuggest = useMemo(() => {
    if (!isCmd) return [];
    const c = matches[0];
    if (!c || c.type !== "filter") return [];

    /* /type is a 2-step filter: type → attribute */
    if (c.filterKey === "type") {
      const parts = cmdArg.split(/\s+/).filter(Boolean);
      const trailingSpace = cmdArg.endsWith(" ");
      const allTypes = Object.keys(NOTE_TYPES);

      /* Step 2 — user already picked a type, now pick an attribute value */
      if ((parts.length === 1 && trailingSpace) || parts.length >= 2) {
        const typeName = parts[0].toLowerCase();
        if (!NOTE_TYPES[typeName]) return [];
        const attrDef = window.TYPE_FILTER_ATTRS[typeName];
        if (!attrDef) {
          /* no sub-attribute for this type — show "Apply filter" as the single item */
          return [{ kind: "type", value: typeName, label: NOTE_TYPES[typeName].label, sublabel: "Apply type filter" }];
        }
        const q = (parts[1] || "").toLowerCase();
        const values = attrDef.values(allNotes || []).filter(v => !q || v.toLowerCase().includes(q));
        return [
          /* let user pick "skip the sub-step" too */
          { kind: "type", value: typeName, label: `${NOTE_TYPES[typeName].label} — all`, sublabel: "Apply only type filter" },
          ...values.map(v => ({
            kind: "typeAttr",
            typeName,
            attrKey: attrDef.key,
            value: v,
            label: v,
            sublabel: `${NOTE_TYPES[typeName].label} / ${attrDef.key}`,
          })),
        ];
      }

      /* Step 1 — list types. Types that carry a sub-attribute advance to step 2
         when chosen (so you can drill into e.g. design → decided). */
      const q = (parts[0] || "").toLowerCase();
      return allTypes
        .filter(t => !q || t.startsWith(q))
        .map(t => {
          const attr = window.TYPE_FILTER_ATTRS[t];
          return {
            kind: "type",
            value: t,
            label: NOTE_TYPES[t].label,
            sublabel: attr ? `then pick ${attr.key} →` : NOTE_TYPES[t].description,
            advance: !!attr,
          };
        });
    }

    const pool = c.filterKey === "project" ? allProjects
              : c.filterKey === "team" ? allTeams
              : [];
    return pool
      .filter(v => !cmdArg || v.toLowerCase().includes(cmdArg.toLowerCase()))
      .slice(0, 8)
      .map(v => ({ kind: c.filterKey, value: v, label: v }));
  }, [isCmd, matches, cmdArg, allProjects, allTeams, allNotes]);

  useEffect(() => { setMenuIdx(0); }, [query]);

  const runFilterSuggestion = (s) => {
    if (s.kind === "project") setActiveProject(s.value);
    else if (s.kind === "team") setActiveTeam(s.value);
    else if (s.kind === "type") {
      /* Type carries a sub-attribute — advance to step 2 instead of finalizing. */
      if (s.advance) {
        setQuery(`/type ${s.value} `);
        setShowMenu(true);
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      setActiveType(s.value);
      setActiveTypeAttr && setActiveTypeAttr(null);
    } else if (s.kind === "typeAttr") {
      setActiveType(s.typeName);
      setActiveTypeAttr && setActiveTypeAttr({ key: s.attrKey, value: s.value });
    }
    setQuery("");
    setShowMenu(false);
  };

  const runCommand = (cmd, arg) => {
    if (cmd.type === "create") {
      const prefill = { title: arg };
      if (cmd.noteType === "task" && cmd.status) prefill.status = cmd.status;
      if (cmd.noteType === "meeting") {
        prefill.subject = arg;
        prefill.subtype = cmd.subtype || "standalone";
      }
      if (cmd.noteType === "thoughts") prefill.prompt = arg;
      onCreate(cmd.noteType, prefill);
      setQuery("");
      setShowMenu(false);
    } else if (cmd.type === "filter") {
      /* no arg → open the picker */
      setQuery(cmd.cmd + " ");
      return;
    } else if (cmd.type === "action" && cmd.action === "clear") {
      setActiveTags([]); setActiveProject(null); setActiveTeam(null); setActiveType(null);
      setActiveTypeAttr && setActiveTypeAttr(null);
      setActiveTechStack && setActiveTechStack(null);
      setQuery("");
      setShowMenu(false);
    }
  };

  const onKey = (e) => {
    if (!showMenu && e.key === "/" && !query) {
      setShowMenu(true);
    }
    if (showMenu && isCmd) {
      const items = filterSuggest.length > 0 ? filterSuggest : matches;
      if (e.key === "ArrowDown") { e.preventDefault(); setMenuIdx((menuIdx + 1) % Math.max(1, items.length)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMenuIdx((menuIdx - 1 + items.length) % Math.max(1, items.length)); return; }
      if (e.key === "Tab" && matches[0] && matches[0].type === "filter" && !cmdArg) {
        e.preventDefault();
        setQuery(matches[0].cmd + " ");
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (filterSuggest.length > 0) {
          runFilterSuggestion(filterSuggest[menuIdx]);
        } else if (matches.length > 0) {
          runCommand(matches[menuIdx], cmdArg);
        }
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setQuery(""); setShowMenu(false); return; }
    }
    if (!isCmd) {
      if (e.key === "Backspace" && !query) {
        // remove last filter, in priority order: tags → project → team → type-attr → type
        if (activeTags.length) return setActiveTags(activeTags.slice(0, -1));
        if (activeProject) return setActiveProject(null);
        if (activeTeam) return setActiveTeam(null);
        if (activeTypeAttr) return setActiveTypeAttr && setActiveTypeAttr(null);
        if (activeType) return setActiveType(null);
      }
      if (e.key === "Escape") {
        setQuery(""); inputRef.current?.blur();
      }
    }
  };

  const filtering = activeTags.length > 0 || activeProject || activeTeam || activeType || activeTypeAttr || activeTechStack || query.trim();

  return (
    <div className={`cmdbar${isCmd ? " is-command" : ""}`}>
      <span className="cmdbar__icon">
        <Icon name={isCmd ? "pencil" : "search"} size={18}/>
      </span>
      <div className="cmdbar__chips">
        {activeType && (
          <TypeBadge type={activeType} onClick={() => { setActiveType(null); setActiveTypeAttr && setActiveTypeAttr(null); }} active/>
        )}
        {activeTypeAttr && (
          <span className="attr-chip" onClick={() => setActiveTypeAttr && setActiveTypeAttr(null)} title={`Remove ${activeTypeAttr.key} = ${activeTypeAttr.value}`}>
            <span className="attr-chip__key">{activeTypeAttr.key}</span>
            <span className="attr-chip__val">{activeTypeAttr.value}</span>
            <button className="pt-chip__remove" onClick={(e) => { e.stopPropagation(); setActiveTypeAttr && setActiveTypeAttr(null); }}>
              <Icon name="x" size={9} strokeWidth={3}/>
            </button>
          </span>
        )}
        {activeTechStack && (
          <span className="attr-chip" onClick={() => setActiveTechStack && setActiveTechStack(null)}>
            <span className="attr-chip__key">stack</span>
            <span className="attr-chip__val">{activeTechStack}</span>
            <button className="pt-chip__remove" onClick={(e) => { e.stopPropagation(); setActiveTechStack && setActiveTechStack(null); }}>
              <Icon name="x" size={9} strokeWidth={3}/>
            </button>
          </span>
        )}
        {activeProject && (
          <ProjectChip name={activeProject} active onRemove={() => setActiveProject(null)}/>
        )}
        {activeTeam && (
          <TeamChip name={activeTeam} active onRemove={() => setActiveTeam(null)}/>
        )}
        {activeTags.map(t => (
          <Tag key={t} name={t} active onRemove={() => setActiveTags(activeTags.filter(x => x !== t))}/>
        ))}
      </div>
      <input
        ref={inputRef}
        className="cmdbar__input"
        placeholder={filtering ? "filter…" : "Search, or type / for commands"}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShowMenu(e.target.value.startsWith("/") || e.target.value === ""); }}
        onFocus={() => setShowMenu(query.startsWith("/") || !query)}
        onBlur={() => setTimeout(() => setShowMenu(false), 200)}
        onKeyDown={onKey}
      />
      <span className="cmdbar__meta">
        {filtering ? (
          <>{resultCount} of {totalCount}</>
        ) : (
          <>
            <kbd className="cmdbar__kbd">/</kbd> commands
          </>
        )}
      </span>
      {filtering && (
        <button className="search__clear" onClick={() => {
          setQuery(""); setActiveTags([]); setActiveProject(null); setActiveTeam(null); setActiveType(null);
          setActiveTypeAttr && setActiveTypeAttr(null);
          setActiveTechStack && setActiveTechStack(null);
        }} title="Clear filters">
          <Icon name="x" size={14}/>
        </button>
      )}

      {/* Command menu */}
      {showMenu && isCmd && (
        <div className="cmd-menu">
          {filterSuggest.length > 0 ? (
            <>
              <div className="cmd-menu__label">
                {(() => {
                  const c = matches[0];
                  if (!c) return "pick one";
                  if (c.filterKey === "type") {
                    const parts = cmdArg.split(/\s+/).filter(Boolean);
                    if (parts.length >= 1 && (parts.length >= 2 || cmdArg.endsWith(" "))) {
                      const tn = parts[0].toLowerCase();
                      const a = window.TYPE_FILTER_ATTRS[tn];
                      return a ? `${tn} — pick ${a.key}` : `${tn} — apply`;
                    }
                    return "filter by type — pick one";
                  }
                  return `${c.label.toLowerCase()} — pick one`;
                })()}
              </div>
              {filterSuggest.map((s, i) => (
                <div
                  key={s.kind + ":" + (s.typeName || "") + ":" + s.value}
                  className={`cmd-menu__item${i === menuIdx ? " is-active" : ""}`}
                  onMouseDown={(e) => { e.preventDefault(); runFilterSuggestion(s); }}
                  onMouseEnter={() => setMenuIdx(i)}
                >
                  <Icon
                    name={s.kind === "type" || s.kind === "typeAttr" ? (NOTE_TYPES[s.typeName || s.value] ? `t_${s.typeName || s.value}` : "layers") :
                          s.kind === "project" ? "folder" :
                          s.kind === "team" ? "users" : "layers"}
                    size={13}
                    strokeWidth={2}
                  />
                  <span className="cmd-menu__cmd">{s.label}</span>
                  {s.sublabel && <span className="cmd-menu__hint">{s.sublabel}</span>}
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="cmd-menu__label">{cmdPrefix ? "matching commands" : "commands"}</div>
              {matches.length === 0 && <div className="cmd-menu__empty">no commands match</div>}
              {matches.map((c, i) => (
                <div
                  key={c.cmd}
                  className={`cmd-menu__item${i === menuIdx ? " is-active" : ""}`}
                  onMouseDown={(e) => { e.preventDefault(); runCommand(c, cmdArg); }}
                  onMouseEnter={() => setMenuIdx(i)}
                >
                  <Icon name={c.icon} size={13} strokeWidth={2}/>
                  <span className="cmd-menu__cmd">{c.cmd}</span>
                  <span className="cmd-menu__label-inline">{c.label}</span>
                  <span className="cmd-menu__hint">{c.hint}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Tag autocomplete (when not a command, plain search w/ focus) */}
      {showMenu && !isCmd && (
        <div className="cmd-menu cmd-menu--tags">
          <div className="cmd-menu__label">type / for commands · or filter by tag</div>
          <div className="cmd-menu__tags">
            {allTags.filter(t => !activeTags.includes(t)).slice(0, 12).map(t => (
              <Tag key={t} name={t} onClick={() => {
                setActiveTags([...new Set([...activeTags, t])]);
                setQuery("");
                inputRef.current?.focus();
              }}/>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Todo count indicator + collapse button live in the header.
   Per spec: header has wordmark, todo count, collapse, shortcuts, theme.
   Filter chips live ONLY in the command bar.
   ───────────────────────────────────────────────────────── */
const Header = ({
  todoCount, onClickTodoCount, todoFilterActive,
  collapsed, onToggleCollapse,
  totalCount, resultCount, filtering,
  theme, setTheme, onShortcuts,
}) => {
  return (
    <header className="header">
      <div className="wordmark">
        <div className="wordmark__logo">Log<i>book</i></div>
        <div className="wordmark__meta">
          {filtering ? `${resultCount} of ${totalCount}` : `${totalCount} notes`}
        </div>
      </div>

      <div className="header__center">
        <button
          className={`todo-counter${todoFilterActive ? " is-active" : ""}`}
          onClick={onClickTodoCount}
          title={todoFilterActive ? "Clear todo filter" : "Show only todo tasks"}
        >
          <span className="todo-counter__count">{todoCount}</span>
          <span className="todo-counter__label">{todoCount === 1 ? "open task" : "open tasks"}</span>
        </button>
      </div>

      <div className="header__actions">
        <button
          className={`icon-btn${collapsed ? " is-active" : ""}`}
          title={collapsed ? "Expand notes" : "Collapse to titles"}
          onClick={onToggleCollapse}
        >
          <Icon name={collapsed ? "chevronsRight" : "chevronDown"}/>
        </button>
        <button className="icon-btn" title="Shortcuts" onClick={onShortcuts}>
          <Icon name="keyboard"/>
        </button>
        <button className="icon-btn" title={theme === "dark" ? "Light mode" : "Dark mode"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Icon name={theme === "dark" ? "sun" : "moon"}/>
        </button>
      </div>
    </header>
  );
};

/* ─────────────────────────────────────────────────────────
   Quick-add task — a small floating window for fast task capture.
   No full feed note / editor: just a title + attributes, save.
   Opened from the dock "+ Task" button, /task, /done, or
   "New task from this note" (which prefills + links the source).
   ───────────────────────────────────────────────────────── */
const QuickAddTask = ({
  sourceNote, initialTitle = "", initialStatus = "todo",
  allTags, allProjects, allTeams,
  onSave, onClose,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState(initialStatus);
  const [projects, setProjects] = useState(sourceNote?.projects || []);
  const [teams, setTeams] = useState(sourceNote?.teams || []);
  const [tags, setTags] = useState(sourceNote?.tags || []);
  const inputRef = useRef(null);

  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(t); }, []);

  const save = () => {
    if (!title.trim()) { inputRef.current?.focus(); return; }
    const payload = { title: title.trim(), status, projects, teams, tags };
    if (sourceNote) {
      payload.sourceNoteId = sourceNote.id;
      payload.body = `→ from [[${sourceNote.title || "Untitled"}]] (${NOTE_TYPES[sourceNote.type]?.label || sourceNote.type})`;
    }
    onSave(payload);
  };

  return (
    <div className="quick-overlay" onMouseDown={onClose}>
      <div
        className="quick-card"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
          else if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
      >
        <div className="quick-card__head">
          <TypeBadge type="task"/>
          <StatusPill status={status} onCycle={setStatus} kind="task"/>
          <span className="quick-card__spacer"/>
          <button className="icon-btn" onClick={onClose} title="Close (esc)"><Icon name="x" size={14}/></button>
        </div>

        {sourceNote && (
          <div className="quick-card__from">
            <Icon name="cornerDownRight" size={12} strokeWidth={2}/>
            from <strong>{sourceNote.title || "Untitled"}</strong>
          </div>
        )}

        <input
          ref={inputRef}
          className="quick-card__title"
          placeholder="What needs doing?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="quick-card__attrs">
          <PtMultiPicker kind="project" values={projects} options={allProjects} onChange={setProjects}/>
          <PtMultiPicker kind="team" values={teams} options={allTeams} onChange={setTeams}/>
        </div>

        <div className="quick-card__tags">
          <TagInput
            tags={tags}
            allTags={allTags}
            onAdd={(t) => setTags([...tags, t])}
            onRemove={(t) => setTags(tags.filter(x => x !== t))}
          />
        </div>

        <div className="quick-card__bar">
          <span className="editor__hint"><kbd>⌘</kbd><kbd>↵</kbd> add · <kbd>esc</kbd> cancel</span>
          <div className="quick-card__actions">
            <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary" onClick={save} disabled={!title.trim()}>Add task</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* expose to app.jsx */
Object.assign(window, {
  Icon, Tag, TagInput, TypeBadge, StatusPill, ProjectChip, TeamChip, PtPicker, PtMultiPicker,
  NoteCard, InlineEditor, FocusMode, CommandBar, Header, QuickAddTask,
  relTime, fmtDay, fmtMeetingDate,
});
