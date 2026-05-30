/* Markdown rendering wrapper.
   - uses `marked` (loaded via <script>) for the heavy lifting
   - adds Obsidian-style callouts: > [!note] / [!warning] / [!tip]
   - tiny syntax highlight for common languages (no full hljs)
   - exposes searchHighlight() which wraps query matches in <mark>
*/

(function () {
  if (!window.marked) {
    console.error("marked.js not loaded");
    return;
  }

  /* ── tiny syntax highlighter ─────────────────────────────── */
  const KEYWORDS = {
    js: /\b(const|let|var|function|return|if|else|for|while|class|new|import|export|from|default|await|async|try|catch|throw|typeof|instanceof|true|false|null|undefined|this)\b/g,
    ts: /\b(const|let|var|function|return|if|else|for|while|class|new|import|export|from|default|await|async|try|catch|throw|type|interface|enum|extends|implements|public|private|protected|readonly|true|false|null|undefined|this|string|number|boolean|void|any|never|unknown)\b/g,
    bash: /\b(if|then|else|fi|for|in|do|done|while|case|esac|function|local|return|export|echo|cd|ls|cat|grep|find|xargs|head|tail|sort|uniq|awk|sed|read|set|unset)\b/g,
    css: /\b(color|background|border|margin|padding|display|position|font-family|font-size|line-height|width|height|flex|grid|gap)\b/g,
  };

  const highlight = (code, lang) => {
    let html = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    /* comments — // ... or # ... or /* ... *\/ */
    html = html.replace(
      /(\/\/[^\n]*|#(?!\w)[^\n]*|\/\*[\s\S]*?\*\/)/g,
      '<span class="tk-c">$1</span>'
    );

    /* strings */
    html = html.replace(
      /("[^"\n]*"|'[^'\n]*'|`[^`\n]*`)/g,
      '<span class="tk-s">$1</span>'
    );

    /* numbers */
    html = html.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="tk-n">$1</span>');

    /* keywords (per lang) */
    const re = KEYWORDS[lang];
    if (re) html = html.replace(re, '<span class="tk-k">$1</span>');

    /* flags / options (--foo) for bash */
    if (lang === "bash") {
      html = html.replace(/(\s)(-{1,2}[\w-]+)/g, '$1<span class="tk-f">$2</span>');
    }

    return html;
  };

  /* ── configure marked ────────────────────────────────────── */
  const renderer = new marked.Renderer();

  renderer.code = function (token) {
    const text = typeof token === "string" ? token : (token.text || "");
    const lang = typeof token === "string" ? arguments[1] : (token.lang || "");
    const display = (lang || "").toLowerCase();
    return `<pre class="md-code"><code class="lang-${display || "txt"}">${highlight(text, display)}</code></pre>`;
  };

  renderer.codespan = function (token) {
    const text = typeof token === "string" ? token : (token.text || "");
    return `<code class="md-inlinecode">${text}</code>`;
  };

  marked.setOptions({
    renderer,
    breaks: false,
    gfm: true,
  });

  /* Callouts (Obsidian-style) — pre-process the source before marked sees it.
     Matches a blockquote whose first line is `[!type]` (optional title after),
     followed by continued `> ...` lines. Output is raw HTML so marked passes it through. */
  const calloutTypes = { note: "📝", tip: "💡", warning: "⚠️", info: "ℹ️", quote: "❝" };
  const preprocessCallouts = (src) => {
    return src.replace(
      /(^|\n)>\s*\[!(\w+)\][^\n]*\n((?:>[^\n]*\n?)*)/g,
      (_, lead, type, rest) => {
        const t = type.toLowerCase();
        const icon = calloutTypes[t] || "📝";
        const cleaned = rest
          .split("\n")
          .map((l) => l.replace(/^>\s?/, ""))
          .join("\n")
          .trim();
        const innerHtml = marked.parseInline(cleaned) || cleaned;
        return `${lead}<div class="md-callout md-callout--${t}"><div class="md-callout__icon">${icon}</div><div class="md-callout__body">${innerHtml}</div></div>\n`;
      }
    );
  };

  /* ── public API ──────────────────────────────────────────── */
  window.renderMarkdown = (src) => {
    if (!src) return "";
    try {
      return marked.parse(preprocessCallouts(src));
    } catch (e) {
      console.warn("[markdown] render failed:", e);
      return `<pre class="md-code">${(src + "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`;
    }
  };

  /* Escape regex special chars */
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /* Wrap matches of `query` in `text` with <mark>. Used for note previews.
     Operates on plain text, not HTML. */
  window.searchHighlight = (text, query) => {
    if (!query) return text;
    const terms = query
      .split(/\s+/)
      .filter((t) => t && !t.startsWith("#"))
      .map(esc);
    if (!terms.length) return text;
    const re = new RegExp(`(${terms.join("|")})`, "gi");
    return text.replace(re, '<mark>$1</mark>');
  };

  /* Strip markdown for previews (~plain text) */
  window.toPlainText = (md) =>
    md
      .replace(/`{3}[\s\S]*?`{3}/g, "")           // fenced code
      .replace(/`([^`]+)`/g, "$1")                 // inline code
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")        // images
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")     // links
      .replace(/^>\s*\[![^\]]+\]\s*/gm, "")        // callout marker
      .replace(/^>\s?/gm, "")                       // blockquote >
      .replace(/^#{1,6}\s+/gm, "")                 // headings
      .replace(/\*\*([^*]+)\*\*/g, "$1")            // bold
      .replace(/\*([^*]+)\*/g, "$1")                // italic
      .replace(/~~([^~]+)~~/g, "$1")                // strike
      .replace(/^[-*+]\s+\[[ x]\]\s+/gm, "")        // task
      .replace(/^[-*+]\s+/gm, "")                  // list bullet
      .replace(/\|/g, " ")                          // table pipes
      .replace(/-{3,}/g, "")
      .replace(/\n{2,}/g, " · ")
      .replace(/\s+/g, " ")
      .trim();
})();

/* ── markdown styles (injected) ──────────────────────────────
   Co-locating with the renderer so styling stays in lockstep.
*/
(function injectMdStyles() {
  const css = `
  .md h1, .md h2, .md h3, .md h4 {
    font-family: var(--font-serif);
    font-weight: 400;
    line-height: 1.2;
    color: var(--ink);
    margin: 1.2em 0 0.4em;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  .md h1 { font-size: 1.8em; }
  .md h2 { font-size: 1.45em; }
  .md h3 { font-size: 1.2em; }
  .md p { margin: 0.5em 0; text-wrap: pretty; }
  .md strong { font-weight: 600; color: var(--ink); }
  .md em { font-style: italic; }
  .md a { color: var(--accent); border-bottom: 1px solid var(--accent-soft); }
  .md a:hover { background: var(--accent-soft); text-decoration: none; }
  .md ul, .md ol { margin: 0.5em 0; padding-left: 1.4em; }
  .md li { margin: 0.15em 0; }

  /* GFM task list (marked's default output: <li><input type="checkbox" disabled> ...) */
  .md li.task-list-item, .md li:has(> input[type="checkbox"]) {
    list-style: none;
    margin-left: -1.4em;
    padding-left: 0;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .md input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    width: 14px; height: 14px;
    border: 1.5px solid var(--border-strong);
    border-radius: 4px;
    flex-shrink: 0;
    margin-top: 6px;
    margin-right: 0;
    background: var(--surface);
    position: relative;
    cursor: default;
  }
  .md input[type="checkbox"]:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .md input[type="checkbox"]:checked::after {
    content: "";
    position: absolute;
    left: 3px; top: 0px;
    width: 5px; height: 8px;
    border: solid #fff;
    border-width: 0 1.8px 1.8px 0;
    transform: rotate(45deg);
  }
  [data-theme="dark"] .md input[type="checkbox"]:checked::after { border-color: #1a1814; }

  /* Default blockquote (when not a callout) */
  .md blockquote {
    border-left: 2px solid var(--border-strong);
    margin: 0.6em 0;
    padding: 0.1em 0 0.1em 14px;
    color: var(--ink-soft);
    font-style: italic;
    font-family: var(--font-serif);
    font-size: 1.05em;
  }
  .md blockquote p { margin: 0.2em 0; }

  .md-callout {
    display: flex;
    gap: 12px;
    margin: 0.8em 0;
    padding: 12px 14px;
    border-radius: var(--r-md);
    background: var(--bg-soft);
    border-left: 3px solid var(--border-strong);
  }
  .md-callout--note    { background: color-mix(in oklab, var(--surface) 60%, #cfe1f0 40%); border-left-color: #6ea3cc; }
  .md-callout--tip     { background: color-mix(in oklab, var(--surface) 60%, #d8eccf 40%); border-left-color: #6fa552; }
  .md-callout--warning { background: color-mix(in oklab, var(--surface) 60%, #f1dfb8 40%); border-left-color: #c89844; }
  .md-callout--info    { background: color-mix(in oklab, var(--surface) 60%, #d6dde9 40%); border-left-color: #8090aa; }
  [data-theme="dark"] .md-callout--note    { background: color-mix(in oklab, var(--surface) 70%, #1f3a55 30%); border-left-color: #4a78a0; }
  [data-theme="dark"] .md-callout--tip     { background: color-mix(in oklab, var(--surface) 70%, #1f3f1f 30%); border-left-color: #5a8e44; }
  [data-theme="dark"] .md-callout--warning { background: color-mix(in oklab, var(--surface) 70%, #4a3818 30%); border-left-color: #b07f2e; }
  [data-theme="dark"] .md-callout--info    { background: color-mix(in oklab, var(--surface) 70%, #2a2f3a 30%); border-left-color: #6a7b96; }
  .md-callout__icon { font-size: 14px; line-height: 1.6; flex-shrink: 0; }
  .md-callout__body { flex: 1; }
  .md-callout__body p { margin: 0.15em 0; }

  .md-code {
    background: var(--code-bg);
    color: var(--code-ink);
    border-radius: var(--r-md);
    padding: 12px 14px;
    overflow-x: auto;
    margin: 0.7em 0;
    font-family: var(--font-mono);
    font-size: 12.8px;
    line-height: 1.6;
    border: 1px solid var(--border);
  }
  .md-code code { font-family: inherit; background: none; padding: 0; color: inherit; }
  .md-inlinecode {
    font-family: var(--font-mono);
    font-size: 0.88em;
    background: var(--code-bg);
    color: var(--code-ink);
    padding: 1px 5px;
    border-radius: 4px;
  }

  /* syntax tokens */
  .tk-c { color: #8a8472; font-style: italic; }
  .tk-s { color: #6a8d3f; }
  .tk-n { color: #b04a25; }
  .tk-k { color: #8c4373; font-weight: 500; }
  .tk-f { color: #4d6996; }
  [data-theme="dark"] .tk-c { color: #7e7866; }
  [data-theme="dark"] .tk-s { color: #a3c977; }
  [data-theme="dark"] .tk-n { color: #e08a5f; }
  [data-theme="dark"] .tk-k { color: #d088b8; }
  [data-theme="dark"] .tk-f { color: #88a7d2; }

  .md table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.8em 0;
    font-size: 0.95em;
  }
  .md th, .md td {
    text-align: left;
    padding: 6px 12px;
    border-bottom: 1px solid var(--divider);
  }
  .md th {
    font-weight: 500;
    color: var(--muted);
    font-size: 11.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border-strong);
  }
  .md tr:last-child td { border-bottom: 0; }

  .md hr { border: 0; border-top: 1px solid var(--divider); margin: 1.2em 0; }
  `;
  const tag = document.createElement("style");
  tag.id = "md-styles";
  tag.textContent = css;
  document.head.appendChild(tag);
})();
