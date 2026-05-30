/* Seed notes — mix of all 6 types, with projects + teams.
   Latest at the bottom of the feed; older notes establish history. */

(function () {
  const D = (daysAgo, h = 9, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    /* Guard: a "today" seed note must never be timestamped in the future (or
       within a couple minutes of now), otherwise a freshly-created note —
       which carries updatedAt = now — would sort ABOVE it instead of landing
       at the very bottom of the feed. If the clock time hasn't happened yet,
       push the note a few minutes into the past, keeping notes roughly ordered
       by their intended hour (earlier hour → further back). */
    const cutoff = Date.now() - 2 * 60 * 1000;
    if (d.getTime() > cutoff) {
      d.setTime(cutoff - (24 - h) * 60 * 1000);
    }
    return d.toISOString();
  };

  /* helper to assemble a note with the type defaults + overrides */
  const N = (type, ago, fields = {}) => {
    const [d, h = 9, mi = 0] = Array.isArray(ago) ? ago : [ago];
    const ts = D(d, h, mi);
    const base = window.createNote(type, fields);
    base.createdAt = ts;
    base.updatedAt = fields.updatedAt || ts;
    if (base.occurrences) {
      base.occurrences = base.occurrences.map((o, i) =>
        i === 0 ? { ...o, date: fields.lastOccurrence || ts } : o
      );
    }
    if (fields.pinned) base.pinned = true;
    if (fields.id) base.id = fields.id;
    return base;
  };

  window.SEED_NOTES = [

    /* ── 28d ago: kickoff draft ─────────────────────────── */
    N("draft", [28, 8, 12], {
      title: "Starting a logbook",
      tags: ["meta", "writing"],
      projects: ["logbook"],
      teams: ["self"],
      body:
`Going to try keeping everything in one place — a single feed instead of folders.

The thing that always kills me with **Notion** is the moment I have to decide *where* a thought lives. By the time I've picked a database, I've lost the thought.

Tags > trees.`,
    }),

    /* ── 25d: knowledge ─────────────────────────────────── */
    N("knowledge", [25, 14, 22], {
      title: "LSM-trees vs B-trees",
      tags: ["databases", "fundamentals"],
      projects: [],
      teams: ["eng"],
      techStack: ["postgres", "rocksdb", "cassandra"],
      body:
`Two write paths, two compromises:

- **B-trees** — in-place updates, balanced tree on disk. Reads are cheap; writes amplify because of page splits + journaling.
- **LSM-trees** — append-only writes to an in-memory table, flushed and compacted into sorted runs on disk. Writes are cheap; reads pay the cost of merging across runs (mitigated by Bloom filters).

Source: *Designing Data-Intensive Applications*, ch. 3.

Modern systems mostly pick the trade-off and live with it. Cassandra/RocksDB pick LSM; Postgres/InnoDB pick B-trees.`,
    }),

    /* ── 22d: task done (log of a thing already shipped) ── */
    N("task", [22, 7, 30], {
      title: "Dial in pour-over (Kieni AA)",
      status: "done",
      tags: ["coffee", "log"],
      teams: ["self"],
      body:
`18 g · 290 g water · 94°C · C40 at 18 clicks · 3:20 total.

Balanced. One click finer next time to push the finish.`,
    }),

    /* ── 20d: knowledge (snippet) ───────────────────────── */
    N("knowledge", [20, 11, 0], {
      title: "Find recently-modified files",
      tags: ["shell", "tip"],
      teams: ["eng"],
      techStack: ["bash", "fd", "unix"],
      body:
"```bash\nfind . -type f -mmin -60 -print0 | xargs -0 ls -lt | head\n```\n\nPair it with `fd` if you have it: `fd --changed-within 1h`.\n\nFrom muscle memory.",
    }),

    /* ── 18d: pinned product brief (knowledge — persists; drafts would auto-delete) ── */
    N("knowledge", [18, 20, 5], {
      title: "Logbook — product brief",
      tags: ["meta", "product"],
      projects: ["logbook"],
      teams: ["self", "product"],
      techStack: [],
      pinned: true,
      body:
`> A single feed of thoughts. No folders. No "where does this go?"

**Core idea**

- Notes are markdown files with YAML front matter (\`title\`, \`tags\`, \`type\`, timestamps).
- The UI never asks where to put them. It's a chronological feed.
- Tags do all the categorisation work — created on the fly, surfaced in search.
- Two writing modes: inline (quick) and focus (full-screen).

**Anti-features**

- ~~Folders~~
- ~~Mandatory titles~~
- ~~Sharing, collab, comments~~ (not yet)`,
    }),

    /* ── 17d: recurring meeting (5 occurrences) ─────────── */
    N("meeting", [17, 10, 0], {
      subtype: "recurring",
      title: "Logbook weekly",
      subject: "Logbook weekly",
      theme: "Product sync",
      attendees: ["Maya", "Aleks", "Sam"],
      tags: ["standup"],
      projects: ["logbook"],
      teams: ["eng", "design"],
      lastOccurrence: D(3, 10, 0),
      body: "",
    }),

    /* ── 16d: thoughts ──────────────────────────────────── */
    N("thoughts", [16, 9, 41], {
      title: "Should folders die?",
      tags: ["ideas", "product"],
      projects: ["logbook"],
      teams: ["self"],
      prompt: "If tagging works, why does every notes app still default to a tree?",
      landed:
`Trees are great for *retrieval* and terrible for *capture*. The first time you write a thought, you don't know its category — you just know it. Forcing a folder choice at write-time is the friction. Lazy categorisation (tags applied after) keeps the entry frictionless and the retrieval flexible.`,
      body:
`Trees pre-decide. Tags post-decide.

Hierarchies privilege the *first* category you assign — and most thoughts belong to several. A note about "the API design of /search" is engineering AND product AND a specific project. In a tree you'd pick one folder and lose the others.

The cost of tags is discoverability — you can't browse them like a folder tree. The fix is good search, not folders.`,
    }),

    /* ── 15d: design (decided) ──────────────────────────── */
    N("design", [15, 11, 0], {
      title: "Feed scroll direction",
      tags: ["product", "ux"],
      projects: ["logbook"],
      teams: ["design"],
      status: "decided",
      body:
`**Decision:** newest at the bottom, composer below it; scroll up for older.

**Why:**
- The composer + latest entry stay in the user's eye-line.
- Matches how chat apps work — what you wrote last is freshest context.
- For a personal log (read-by-self, write-often), it beats blog-style chronology.

**Trade-offs:**
- Unusual for a note app — onboarding has to call it out once.
- Initial scroll position must be at the bottom; tested across browsers.`,
    }),

    /* ── 14d: standalone meeting ────────────────────────── */
    N("meeting", [14, 15, 30], {
      subtype: "standalone",
      title: "Onboarding kickoff with Maya",
      subject: "Onboarding kickoff",
      theme: "Design",
      attendees: ["Maya"],
      tags: ["onboarding"],
      projects: ["q4-launch"],
      teams: ["design"],
      body:
`Scope: net-new sign-up flow + first-run experience.

- 3 screens, max. Maya's pushing for 2 and an empty-state.
- We agreed to ship without social login for v1.
- Open question: where does the tag intro live? Maya thinks first-run; I think it's better when they hit zero results in search.

**Next:** Maya owns wireframes by Wed. I review Thurs.`,
    }),

    /* ── 12d: design (in-review) ────────────────────────── */
    N("design", [12, 16, 20], {
      title: "Command-bar parser",
      tags: ["engineering"],
      projects: ["logbook"],
      teams: ["eng"],
      status: "in-review",
      body:
`A `+"`/`"+` at column 0 switches to command mode. Then we tokenise on whitespace into [command, ...args].

\`\`\`ts
type ParsedCmd =
  | { kind: "create"; type: NoteType; rest: string }
  | { kind: "filter"; axis: "project" | "team" | "type"; value?: string }
  | { kind: "filter-subset"; type: NoteType; attr: string; value: string }
  | { kind: "action"; name: "clear" };
\`\`\`

**Open:** how to disambiguate \`/type task\` filter from a typo for \`/task\` create. Resolution: \`/type\` is an explicit filter command; \`/task\` creates. They're separate keywords.`,
    }),

    /* ── 11d: knowledge (callout-heavy) ─────────────────── */
    N("knowledge", [11, 13, 18], {
      title: "Callout syntax (Obsidian-style)",
      tags: ["markdown", "meta"],
      teams: ["self"],
      techStack: ["markdown", "obsidian"],
      body:
`> [!note]
> Front matter is invisible in the rendered feed but lives in the raw \`.md\` file. The \`{ }\` button on a note shows it.

> [!warning]
> Tag names are case-insensitive on storage but display-cased on render.

> [!tip]
> Five callout types ship in v1: note, tip, warning, info, quote.`,
    }),

    /* ── 9d: task (active todo) ─────────────────────────── */
    N("task", [9, 16, 2], {
      title: "Unify /search and /notes endpoints",
      status: "todo",
      tags: ["engineering"],
      projects: ["logbook"],
      teams: ["eng"],
      body:
"Debating whether `/notes?tag=x` and `/notes/search?q=x` should be the same endpoint. They probably should.\n\n" +
"```ts\ntype Query = {\n  q?: string;          // full-text\n  tags?: string[];     // AND\n  since?: string;      // ISO date\n  cursor?: string;\n};\n```\n\nThe trick: make `tags` and `q` composable without inventing a query DSL. Lean on the URL.",
    }),

    /* ── 7d: design (exploring) ─────────────────────────── */
    N("design", [7, 14, 0], {
      title: "Storage: markdown files vs SQLite",
      tags: ["engineering", "ideas"],
      projects: ["logbook"],
      teams: ["eng"],
      status: "exploring",
      body:
`**Option A — flat .md files on disk**
Pros: portable, plain-text durable, git-able, every other tool reads them.
Cons: full-text search needs an external index; lots of small files; no transactional guarantees.

**Option B — SQLite with FTS5**
Pros: queries are trivial, transactional, one file.
Cons: opaque blob to other tools, harder to back up incrementally.

**Leaning A** but parking it — depends on whether we ever want offline-first sync.`,
    }),

    /* ── 5d: thoughts ───────────────────────────────────── */
    N("thoughts", [5, 11, 33], {
      title: "Lazy categorisation",
      tags: ["ideas", "product"],
      projects: ["logbook"],
      teams: ["design"],
      prompt: "What if filing happens *after* writing, not before?",
      landed: "Capture first. Tag later (or never). The note still lives in the feed without a category — that's the point.",
      body:
`Every notes app I've used asks the same question at write-time: where does this go? Pick a notebook, pick a folder, pick a database. By the time I've answered it, the thought is gone.

What if the answer is "I don't know yet"? In a folder system, that costs you — the note ends up in **Inbox** and rots. In a tag system, it costs nothing — the note is in *the* feed, findable by anything you write in it.

Lazy categorisation isn't sloppy; it's a different default. Tags applied later, when you actually have context.`,
    }),

    /* ── 4d: task (suspended) ───────────────────────────── */
    N("task", [4, 9, 10], {
      title: "Wire up backlinks ([[wikilink]])",
      status: "suspended",
      tags: ["ideas"],
      projects: ["logbook"],
      teams: ["eng"],
      body: "Parked. Not until tags + search feel right.",
    }),

    /* ── 3d: knowledge (quote) ──────────────────────────── */
    N("knowledge", [3, 22, 0], {
      title: "Lamott, on lowering the bar",
      tags: ["reading", "writing"],
      teams: ["self"],
      techStack: [],
      body:
`> Almost all good writing begins with terrible first efforts. You need to start somewhere. Start by getting something — anything — down on paper.

— *Bird by Bird*, Anne Lamott.

Reminder to lower the bar for what counts as a note.`,
    }),

    /* ── 2d: task (done) ────────────────────────────────── */
    N("task", [2, 9, 30], {
      title: "Wire up tag-filter chips",
      status: "done",
      tags: ["work"],
      projects: ["logbook"],
      teams: ["eng"],
      body: "Shipped. Chips show in the command bar; clicking a tag on a note adds it as a filter.",
    }),

    /* ── 1d: a fresh draft (survives the 7-day cutoff) ──── */
    N("draft", [1, 8, 15], {
      title: "Quick capture — onboarding idea",
      tags: ["onboarding", "ideas"],
      projects: ["q4-launch"],
      teams: ["self"],
      body:
`What if the empty state *is* the tutorial? First run shows the command bar with a blinking \`/\` and three ghost cards explaining each note type.

Park it — revisit when the first-run flow lands. (This is a draft; it'll auto-delete in a week if I don't promote it.)`,
    }),

    /* ── today: knowledge ───────────────────────────────── */
    N("knowledge", [0, 14, 12], {
      title: "text-wrap: pretty",
      tags: ["css", "tip"],
      teams: ["eng"],
      techStack: ["css"],
      body:
"One of the quietest wins of the last year. Drop it on body copy and the rag stops orphaning the last line.\n\n" +
"```css\np, h1, h2, h3 { text-wrap: pretty; }\n```\n\nNo JS, no measuring, no library. Source: Adam Argyle, web.dev.",
    }),

    /* ── today (afternoon): task todo ───────────────────── */
    N("task", [0, 16, 0], {
      title: "Draft the v1 onboarding copy",
      status: "todo",
      tags: ["copy", "onboarding"],
      projects: ["q4-launch"],
      teams: ["design"],
      body: "Three screens — what is it / how to capture / how to find again. Keep it under 40 words per screen.",
    }),

    /* ── today (evening): task list as a task ───────────── */
    N("task", [0, 18, 45], {
      title: "Wrap up before tomorrow",
      status: "todo",
      tags: ["log"],
      teams: ["self"],
      body:
`- [ ] finish the command bar
- [ ] write a real \`README\`
- [ ] call mum
- [ ] groceries — oats, miso, lemons`,
    }),

  ];

  /* Backfill recurring meeting occurrences (5 entries, weekly-ish). */
  const weekly = window.SEED_NOTES.find(n => n.type === "meeting" && n.subtype === "recurring");
  if (weekly) {
    weekly.occurrences = [
      {
        date: D(3, 10, 0),
        attendees: ["Maya", "Aleks", "Sam"],
        body:
`- Maya shipped wireframes for first-run; review Thurs
- Aleks: search rewrite is in review
- Sam off Friday
- **decision:** keep \`@team\` filter out of v1 — too easy to confuse with \`@mentions\` later`,
      },
      {
        date: D(10, 10, 0),
        attendees: ["Maya", "Aleks", "Sam"],
        body:
`- agreed on the command-bar pattern (\`/\` for commands)
- Aleks owns the parser
- punted on backlinks — Maya pushed back, agreed to revisit after v1`,
      },
      {
        date: D(17, 10, 0),
        attendees: ["Maya", "Aleks"],
        body:
`- Sam out
- discussed note types — landed on 6 (draft, task, meeting, thoughts, knowledge, design)
- open question: do recurring meetings belong as one note or many?`,
      },
      {
        date: D(24, 10, 0),
        attendees: ["Maya", "Aleks", "Sam"],
        body:
`- kicked off
- scope: feed UI + 6 note types + tags + search
- nice-to-have: focus mode, dark mode, projects/teams
- timeline: 6 weeks`,
      },
    ];
    weekly.updatedAt = weekly.occurrences[0].date;
  }
})();
