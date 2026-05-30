/* eslint-disable react/prop-types */
/* Logbook — app shell. */

const openCommand = (type, prefill) =>
  window.dispatchEvent(new CustomEvent("logbook:create", { detail: { type, prefill } }));

/* ── Tweaks: Voice / Cadence / Detail ────────────────────── */
const Tweaks = () => {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);

  useEffect(() => {
    const r = document.documentElement;
    r.dataset.voice   = t.voice;
    r.dataset.cadence = t.cadence;
    r.dataset.detail  = t.detail;
  }, [t.voice, t.cadence, t.detail]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Voice"/>
      <TweakRadio
        label="Personality"
        value={t.voice}
        options={["editorial", "industrial", "modern", "index"]}
        onChange={(v) => setTweak("voice", v)}
      />
      <div style={{ fontSize: 10.5, color: "rgba(41,38,27,.55)", marginTop: -4, lineHeight: 1.4 }}>
        {{
          editorial:  "Plex Sans body, Plex Serif titles, paper grain, clay accent.",
          industrial: "Plex Mono everywhere. Sharp corners. Monochrome accent.",
          modern:     "DM Sans throughout. Slate accent. Cool whites.",
          index:      "Source Serif body, DM Serif titles. Lined paper. Amber accent.",
        }[t.voice]}
      </div>

      <TweakSection label="Cadence"/>
      <TweakRadio
        label="How notes carry"
        value={t.cadence}
        options={["cards", "stream", "stack"]}
        onChange={(v) => setTweak("cadence", v)}
      />
      <div style={{ fontSize: 10.5, color: "rgba(41,38,27,.55)", marginTop: -4, lineHeight: 1.4 }}>
        {{
          cards:  "Bordered cards in the feed.",
          stream: "No borders — hairline dividers, chat-transcript.",
          stack:  "Cards on a pile of paper, with depth.",
        }[t.cadence]}
      </div>

      <TweakSection label="Detail"/>
      <TweakRadio
        label="Per-note density"
        value={t.detail}
        options={["full", "compact", "title"]}
        onChange={(v) => setTweak("detail", v)}
      />
      <div style={{ fontSize: 10.5, color: "rgba(41,38,27,.55)", marginTop: -4, lineHeight: 1.4 }}>
        {{
          full:    "Everything visible — body preview, prompt, source.",
          compact: "Hide the body preview. Keep badges, tags, time.",
          title:   "One line: type · title · time. Skim mode.",
        }[t.detail]}
      </div>
    </TweaksPanel>
  );
};

/* ── Shortcuts modal ─────────────────────────────────────── */
const Shortcuts = ({ onClose }) => (
  <div onClick={onClose}
    style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(20, 18, 14, 0.45)",
      display: "grid", placeItems: "center",
      animation: "fade 150ms ease",
    }}>
    <div onClick={(e) => e.stopPropagation()} style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-lg)",
      padding: "22px 26px", minWidth: 460, maxWidth: 540,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <h2 style={{ fontFamily: "var(--font-display, var(--font-serif))", fontWeight: 400, fontSize: 22, margin: 0 }}>Shortcuts</h2>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={14}/></button>
      </div>
      <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
        {[
          ["/", "Open the command bar (anywhere)"],
          ["T", "Quick-add a task"],
          ["/draft …", "New draft (auto-deletes after 7d)"],
          ["/task title", "Quick-add a task (todo)"],
          ["/done title", "Quick-add a finished task"],
          ["/meeting subject", "New standalone meeting"],
          ["/recurring subject", "New recurring meeting"],
          ["/thoughts prompt", "New thoughts note"],
          ["/knowledge title", "New knowledge note"],
          ["/design title", "New design note"],
          ["/project /team /type", "Filter the feed"],
          ["/type design", "Then pick a status (2-step)"],
          ["/clear", "Reset all filters"],
          ["⌘ ↵", "Save (in editor / quick-add)"],
          ["Esc", "Cancel / exit"],
          ["⌫", "Remove last filter (search empty)"],
          ["?", "This help"],
        ].map(([k, label], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--divider)", gap: 16 }}>
            <span style={{ color: "var(--ink-soft)" }}>{label}</span>
            <span style={{ whiteSpace: "nowrap" }}>{k.split(" ").map((c, ci) => (
              <kbd key={ci} style={{
                fontFamily: "var(--font-mono)", fontSize: 11,
                padding: "2px 7px", borderRadius: 5,
                background: "var(--kbd-bg)", border: "1px solid var(--border)",
                color: "var(--ink)", marginLeft: 3,
              }}>{c}</kbd>
            ))}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────
   App
   ───────────────────────────────────────────────────────── */
const MONTH_MS = 30 * 24 * 3600 * 1000;
const DRAFT_TTL_MS = 7 * 24 * 3600 * 1000;

const App = () => {
  /* Seed → auto-delete expired drafts on startup (per spec §4.1) */
  const initialNotes = useMemo(() => {
    const now = Date.now();
    return [...window.SEED_NOTES]
      .filter(n => !(n.type === "draft" && now - +new Date(n.createdAt) > DRAFT_TTL_MS))
      .sort((a, b) => +new Date(window.latestActivity(a)) - +new Date(window.latestActivity(b)));
  }, []);

  const [notes, setNotes] = useState(initialNotes);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [activeTeam, setActiveTeam] = useState(null);
  const [activeType, setActiveType] = useState(null);
  const [activeTypeAttr, setActiveTypeAttr] = useState(null);   // { key: "status", value: "todo" }
  const [activeTechStack, setActiveTechStack] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(null);
  const [quickTask, setQuickTask] = useState(null);   // null | { sourceNote?, title?, status? }
  const [focusState, setFocusState] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [historyHorizon, setHistoryHorizon] = useState(() => Date.now() - MONTH_MS);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("logbook.theme");
    if (saved) return saved;
    return matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("logbook.theme", theme);
  }, [theme]);

  /* ── derived: tags / projects / teams / tech stack ───── */
  const allTags = useMemo(() => {
    const s = new Set();
    notes.forEach(n => n.tags?.forEach(t => s.add(t)));
    return [...s].sort();
  }, [notes]);
  const allProjects = useMemo(() => {
    const s = new Set();
    notes.forEach(n => (n.projects || []).forEach(p => s.add(p)));
    return [...s].sort();
  }, [notes]);
  const allTeams = useMemo(() => {
    const s = new Set();
    notes.forEach(n => (n.teams || []).forEach(t => s.add(t)));
    return [...s].sort();
  }, [notes]);
  const allTechStack = useMemo(() => {
    const s = new Set();
    notes.forEach(n => (n.techStack || []).forEach(x => s.add(x)));
    return [...s].sort();
  }, [notes]);

  /* todo count (status: todo, type: task) — spec §2 */
  const todoCount = useMemo(
    () => notes.filter(n => n.type === "task" && n.status === "todo").length,
    [notes]
  );
  const todoFilterActive = activeType === "task" && activeTypeAttr?.key === "status" && activeTypeAttr?.value === "todo";

  /* ── filtering ──────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = query.startsWith("/") ? "" : query.trim();
    return notes.filter(n => {
      if (activeTags.length && !activeTags.every(t => n.tags?.includes(t))) return false;
      if (activeProject && !(n.projects || []).includes(activeProject)) return false;
      if (activeTeam && !(n.teams || []).includes(activeTeam)) return false;
      if (activeType && n.type !== activeType) return false;
      if (activeTypeAttr && n[activeTypeAttr.key] !== undefined) {
        const noteVal = n[activeTypeAttr.key];
        if (Array.isArray(noteVal)) {
          if (!noteVal.includes(activeTypeAttr.value)) return false;
        } else if (noteVal !== activeTypeAttr.value) return false;
      } else if (activeTypeAttr) {
        return false;
      }
      if (activeTechStack && !(n.techStack || []).includes(activeTechStack)) return false;
      return window.noteMatchesQuery(n, q);
    });
  }, [notes, query, activeTags, activeProject, activeTeam, activeType, activeTypeAttr, activeTechStack]);

  const filtering = activeTags.length > 0 || !!activeProject || !!activeTeam || !!activeType || !!activeTypeAttr || !!activeTechStack || !!(query.trim() && !query.startsWith("/"));

  /* Visible window = filtered ∧ within history horizon (or all, when filtering).
     When the user is filtering, the horizon doesn't apply — they want a wider net. */
  const visible = useMemo(() => {
    if (filtering) return filtered;
    return filtered.filter(n => +new Date(n.createdAt) >= historyHorizon || +new Date(window.latestActivity(n)) >= historyHorizon);
  }, [filtered, historyHorizon, filtering]);

  const hiddenOlderCount = filtered.length - visible.length;

  const grouped = useMemo(() => {
    /* Pinned section goes at the BOTTOM (per updated spec §2) */
    const rest = visible
      .filter(n => !n.pinned)
      .sort((a, b) => +new Date(window.latestActivity(a)) - +new Date(window.latestActivity(b)));
    const pinned = visible
      .filter(n => n.pinned)
      .sort((a, b) => +new Date(window.latestActivity(a)) - +new Date(window.latestActivity(b)));

    const groups = [];
    let lastDay = "";
    rest.forEach(n => {
      const day = fmtDay(window.latestActivity(n));
      if (day !== lastDay) {
        groups.push({ type: "divider", label: day, key: "d-" + day });
        lastDay = day;
      }
      groups.push({ type: "note", note: n, key: n.id });
    });
    return { pinned, groups, total: visible.length };
  }, [visible]);

  /* ── feed scroll: keep pinned-to-bottom + infinite scroll up ── */
  const feedRef = useRef(null);
  const sentinelTopRef = useRef(null);

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    let cancelled = false;

    /* Pin to bottom (newest). Force non-smooth so the jump can't be swallowed
       by scroll-behavior:smooth, then restore. */
    const pin = () => {
      const node = feedRef.current;
      if (!node || cancelled) return;
      const prev = node.style.scrollBehavior;
      node.style.scrollBehavior = "auto";
      node.scrollTop = node.scrollHeight;
      node.style.scrollBehavior = prev || "";
    };

    pin();
    requestAnimationFrame(() => requestAnimationFrame(pin));
    const timers = [setTimeout(pin, 120), setTimeout(pin, 400)];

    /* Re-pin once webfonts finish loading and reflow the feed taller. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => requestAnimationFrame(pin));
    }

    /* Re-pin on the first content-height growth after mount (e.g. late reflow,
       images, font swap). We only auto-follow while the user is already near the
       bottom so we never yank them up mid-scroll. */
    let settled = false;
    const ro = new ResizeObserver(() => {
      const node = feedRef.current;
      if (!node || cancelled) return;
      const distFromBottom = node.scrollHeight - node.clientHeight - node.scrollTop;
      if (!settled || distFromBottom < 80) pin();
    });
    ro.observe(el.firstElementChild || el);
    const settleTimer = setTimeout(() => { settled = true; }, 1200);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      clearTimeout(settleTimer);
      ro.disconnect();
    };
  }, []);

  /* infinite scroll upward: when the top sentinel comes into view, push the horizon back another month */
  useEffect(() => {
    const el = feedRef.current;
    const sentinel = sentinelTopRef.current;
    if (!el || !sentinel) return;
    if (hiddenOlderCount === 0) return;

    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        /* preserve scroll-from-top so the user stays visually anchored */
        const prevScrollHeight = el.scrollHeight;
        const prevScrollTop = el.scrollTop;
        setHistoryHorizon(h => h - MONTH_MS);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (feedRef.current) feedRef.current.scrollTop = prevScrollTop + (feedRef.current.scrollHeight - prevScrollHeight);
        }));
      }
    }, { root: el, threshold: 0.1 });

    io.observe(sentinel);
    return () => io.disconnect();
  }, [hiddenOlderCount]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }));
  };

  /* ── create / save / mutate ───────────────────────── */
  const publishNote = useCallback((payload) => {
    const n = { ...payload, id: payload.id || crypto.randomUUID(), createdAt: payload.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    setNotes(cur => [...cur, n]);
    scrollToBottom();
    return n.id;
  }, []);

  const saveNote = useCallback((id, payload) => {
    setNotes(cur => cur.map(n => {
      if (n.id !== id) return n;
      /* Per spec §3: when an existing note is saved without any content modification,
         updatedAt is not changed. We approximate "no modification" by deep-equal-ish comparison
         of all editable fields. */
      const changed = Object.keys(payload).some(k => JSON.stringify(payload[k]) !== JSON.stringify(n[k]));
      return changed
        ? { ...n, ...payload, updatedAt: new Date().toISOString() }
        : { ...n, ...payload };
    }));
  }, []);

  const deleteNote = useCallback((id) => {
    setNotes(cur => cur.filter(n => n.id !== id));
    setEditingId(cur => cur === id ? null : cur);
  }, []);

  const pinNote = useCallback((id) => {
    setNotes(cur => cur.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));
  }, []);

  /* ── command bar: create a note inline at the bottom ── */
  const startCreate = useCallback((type, prefill = {}) => {
    /* Tasks use the quick-add popover, not a full inline feed note. */
    if (type === "task") {
      setQuickTask({ title: prefill.title || "", status: prefill.status || "todo" });
      return;
    }
    const base = window.createNote(type, prefill);
    /* inherit active filters so the new note shows up in the filtered view */
    if (activeProject && !(base.projects || []).includes(activeProject)) base.projects = [...(base.projects || []), activeProject];
    if (activeTeam && !(base.teams || []).includes(activeTeam)) base.teams = [...(base.teams || []), activeTeam];
    setCreating({ type, prefill: base });
    setEditingId(null);
    scrollToBottom();
  }, [activeProject, activeTeam]);

  useEffect(() => {
    const handler = (e) => startCreate(e.detail.type, e.detail.prefill);
    window.addEventListener("logbook:create", handler);
    return () => window.removeEventListener("logbook:create", handler);
  }, [startCreate]);

  const finishCreate = useCallback((payload) => {
    publishNote({ ...creating.prefill, ...payload, type: creating.type });
    setCreating(null);
  }, [creating, publishNote]);

  /* ── new task from a note (per spec §4.2) ─────────────── */
  const newTaskFromNote = useCallback((sourceNote) => {
    /* Quick-add popover, prefilled with the source's context and linked back. */
    setEditingId(null);
    setQuickTask({ sourceNote });
  }, []);

  /* publish a task coming from the quick-add popover */
  const addQuickTask = useCallback((payload) => {
    const note = window.createNote("task", { ...payload });
    publishNote(note);
    setQuickTask(null);
  }, [publishNote]);

  /* ── global keys ──────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (focusState || showShortcuts || quickTask) return;
      if (e.key === "?") { setShowShortcuts(true); }
      else if (e.key === "t" || e.key === "T") { e.preventDefault(); setQuickTask({}); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusState, showShortcuts, quickTask]);

  /* ── click handlers ─────────────────────────────── */
  const onClickTag        = (t) => setActiveTags(c => c.includes(t) ? c : [...c, t]);
  const onClickProject    = (p) => setActiveProject(p);
  const onClickTeam       = (t) => setActiveTeam(t);
  const onClickType       = (t) => { setActiveType(t); setActiveTypeAttr(null); };
  const onClickTechStack  = (s) => setActiveTechStack(s);

  const onClickTodoCount = () => {
    if (todoFilterActive) {
      setActiveType(null);
      setActiveTypeAttr(null);
    } else {
      setActiveType("task");
      setActiveTypeAttr({ key: "status", value: "todo" });
    }
  };

  /* ── render a single note ─────────────────────────── */
  const renderNote = (n) => {
    if (editingId === n.id) {
      return (
        <InlineEditor
          key={n.id}
          note={n}
          allTags={allTags}
          allProjects={allProjects}
          allTeams={allTeams}
          allTechStack={allTechStack}
          isNew={false}
          initialMode="preview"
          onSave={(payload) => { saveNote(n.id, payload); setEditingId(null); }}
          onCancel={() => setEditingId(null)}
          onDelete={(id) => { deleteNote(id); setEditingId(null); }}
          onCreateTaskFrom={newTaskFromNote}
          onFocus={(draft) => {
            saveNote(n.id, draft);
            setEditingId(null);
            setFocusState({ mode: "edit", noteId: n.id });
          }}
        />
      );
    }
    return (
      <NoteCard
        key={n.id}
        note={n}
        query={query.startsWith("/") ? "" : query}
        activeTags={activeTags}
        activeProject={activeProject}
        activeTeam={activeTeam}
        activeTechStack={activeTechStack}
        onClickTag={onClickTag}
        onClickProject={onClickProject}
        onClickTeam={onClickTeam}
        onClickType={onClickType}
        onClickTechStack={onClickTechStack}
        onClickEdit={() => setEditingId(n.id)}
        onPin={pinNote}
        onDelete={deleteNote}
      />
    );
  };

  const filterDescr = activeType ? `#${activeType}` : "filter";

  return (
    <div className="app">
      <Header
        todoCount={todoCount}
        onClickTodoCount={onClickTodoCount}
        todoFilterActive={todoFilterActive}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
        totalCount={notes.length}
        resultCount={grouped.total}
        filtering={filtering}
        theme={theme}
        setTheme={setTheme}
        onShortcuts={() => setShowShortcuts(true)}
      />

      <div className={`feed-wrap${collapsed ? " is-collapsed" : ""}`} ref={feedRef}>
        <div className="feed">
          {/* Sentinel for infinite-scroll-upward */}
          {hiddenOlderCount > 0 && (
            <div className="feed-loadmore" ref={sentinelTopRef}>
              <span className="feed-loadmore__line"/>
              <span className="feed-loadmore__label">
                Loading {hiddenOlderCount} older {hiddenOlderCount === 1 ? "note" : "notes"}…
              </span>
              <span className="feed-loadmore__line"/>
            </div>
          )}

          {grouped.total === 0 && grouped.pinned.length === 0 && !creating ? (
            <div className="feed-empty">
              {filtering
                ? <>No notes match <em>{filterDescr}</em>.</>
                : <>Nothing here yet.</>}
              <small>Type <kbd style={{
                fontFamily: "var(--font-mono)", fontSize: 11, padding: "1px 6px", borderRadius: 4,
                background: "var(--kbd-bg)", border: "1px solid var(--border)",
              }}>/</kbd> to create your first note, or clear filters.</small>
            </div>
          ) : (
            <>
              {grouped.groups.map(g =>
                g.type === "divider"
                  ? <div className="date-divider" key={g.key}>{g.label}</div>
                  : renderNote(g.note)
              )}

              {creating && (
                <>
                  <div className="date-divider date-divider--composer">
                    Writing a {NOTE_TYPES[creating.type].label.toLowerCase()}
                  </div>
                  <InlineEditor
                    isNew
                    note={creating.prefill}
                    allTags={allTags}
                    allProjects={allProjects}
                    allTeams={allTeams}
                    allTechStack={allTechStack}
                    initialMode="edit"
                    onSave={finishCreate}
                    onCancel={() => setCreating(null)}
                    onFocus={(draft) => {
                      const id = publishNote({ ...creating.prefill, ...draft, type: creating.type });
                      setCreating(null);
                      setFocusState({ mode: "edit", noteId: id });
                    }}
                    onDelete={() => setCreating(null)}
                  />
                </>
              )}

              {grouped.pinned.length > 0 && (
                <>
                  <div className="date-divider date-divider--pinned">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: -4 }}>
                      <path d="m12 17 0 5M9 8a3 3 0 0 0 0 6h6a3 3 0 0 0 0-6M9 8h6M9 8V3h6v5"/>
                    </svg>
                    Pinned
                  </div>
                  {grouped.pinned.map(renderNote)}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="dock">
        <div className="dock__inner">
          <button
            className="quick-add-btn"
            onClick={() => setQuickTask({})}
            title="Quick-add a task (press T)"
          >
            <Icon name="plus" size={15} strokeWidth={2.4}/>
            <span>Task</span>
          </button>
          <CommandBar
            query={query} setQuery={setQuery}
            activeTags={activeTags} setActiveTags={setActiveTags}
            activeProject={activeProject} setActiveProject={setActiveProject}
            activeTeam={activeTeam} setActiveTeam={setActiveTeam}
            activeType={activeType} setActiveType={setActiveType}
            activeTypeAttr={activeTypeAttr} setActiveTypeAttr={setActiveTypeAttr}
            activeTechStack={activeTechStack} setActiveTechStack={setActiveTechStack}
            allTags={allTags} allProjects={allProjects} allTeams={allTeams}
            allTechStack={allTechStack} allNotes={notes}
            resultCount={grouped.total} totalCount={notes.length}
            onCreate={startCreate}
          />
        </div>
      </div>

      {focusState && (() => {
        const note = notes.find(n => n.id === focusState.noteId);
        if (!note) return null;
        return (
          <FocusMode
            note={note}
            allTags={allTags}
            onSave={(payload) => saveNote(focusState.noteId, payload)}
            onClose={(payload) => { saveNote(focusState.noteId, payload); setFocusState(null); }}
          />
        );
      })()}

      {quickTask && (
        <QuickAddTask
          sourceNote={quickTask.sourceNote}
          initialTitle={quickTask.title || ""}
          initialStatus={quickTask.status || "todo"}
          allTags={allTags}
          allProjects={allProjects}
          allTeams={allTeams}
          onSave={addQuickTask}
          onClose={() => setQuickTask(null)}
        />
      )}

      {showShortcuts && <Shortcuts onClose={() => setShowShortcuts(false)}/>}

      <Tweaks />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
