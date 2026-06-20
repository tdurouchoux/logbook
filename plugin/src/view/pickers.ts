import { setIcon } from "obsidian";

/**
 * Reusable chip + autocomplete picker for tags/projects/teams. Renders current
 * values as removable chips plus a "+" button (hidden via CSS unless the
 * owning card is expanded); clicking it reveals a free-text input with
 * autocomplete from a candidate pool, closing back to "+" on blur.
 */
export interface PickerOptions {
  values: string[];
  pool: () => string[];
  placeholder: string;
  chipClass: string;
  prefix?: string; // e.g. "#" for tags
  icon?: string; // Lucide icon id rendered before each chip's label, via setIcon()
  onChange: (next: string[]) => void | Promise<void>;
}

export function renderPicker(container: HTMLElement, opts: PickerOptions) {
  container.addEventListener("click", (e) => e.stopPropagation());
  const label = opts.placeholder.replace(/^\+\s*/, "");

  const render = (values: string[], keepOpen = false) => {
    container.empty();

    for (const v of values) {
      const chip = container.createEl("span", { cls: opts.chipClass });
      if (opts.icon) setIcon(chip.createSpan({ cls: "logbook-pill-icon" }), opts.icon);
      chip.createEl("span", { cls: "logbook-pill-label", text: opts.prefix ? `${opts.prefix}${v}` : v });
      const x = chip.createEl("button", { cls: "logbook-chip-remove", text: "×" });
      x.addEventListener("click", async (e) => {
        e.stopPropagation();
        const updated = values.filter((x2) => x2 !== v);
        await opts.onChange(updated);
        render(updated);
      });
    }

    const addBtn = container.createEl("button", {
      cls: "logbook-picker-add-btn",
      attr: { type: "button", "aria-label": `Add ${label}` },
    });
    setIcon(addBtn, "plus");

    const inputWrap = container.createDiv("logbook-picker-input-wrap");
    const input = inputWrap.createEl("input", {
      cls: "logbook-picker-input",
      attr: { type: "text", placeholder: label, spellcheck: "false" },
    });
    const suggestEl = inputWrap.createDiv("logbook-picker-suggestions");
    suggestEl.style.display = "none";

    let filtered: string[] = [];
    let suggestIdx = 0;
    let pickingFromList = false;

    const open = () => {
      addBtn.addClass("is-hidden");
      inputWrap.addClass("is-open");
      input.focus();
    };
    const close = () => {
      addBtn.removeClass("is-hidden");
      inputWrap.removeClass("is-open");
      input.value = "";
      suggestEl.style.display = "none";
    };
    if (keepOpen) open();

    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      open();
    });

    const renderSuggestions = () => {
      suggestEl.empty();
      if (!filtered.length) {
        suggestEl.style.display = "none";
        return;
      }
      suggestEl.style.display = "block";
      filtered.forEach((p, i) => {
        const item = suggestEl.createDiv("logbook-suggest-item");
        if (i === suggestIdx) item.addClass("is-selected");
        item.setText(p);
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          pickingFromList = true;
        });
        item.addEventListener("click", () => addValue(p));
        item.addEventListener("mouseenter", () => {
          suggestIdx = i;
          renderSuggestions();
        });
      });
    };

    const addValue = async (raw: string) => {
      const name = raw.toLowerCase().trim().replace(/\s+/g, "-");
      pickingFromList = false;
      if (!name || values.includes(name)) return;
      const updated = [...values, name];
      await opts.onChange(updated);
      render(updated, true);
    };

    input.addEventListener("input", () => {
      const val = input.value.toLowerCase().trim();
      if (!val) {
        suggestEl.style.display = "none";
        return;
      }
      filtered = opts.pool().filter((p) => p.includes(val) && !values.includes(p));
      suggestIdx = 0;
      renderSuggestions();
    });

    input.addEventListener("keydown", async (e) => {
      // Cmd/Ctrl+Enter is the card's save-and-close shortcut (design.md §4/§18) —
      // leave it alone here so it bubbles up to the card's own listener instead
      // of being treated as "add this value".
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) return;
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        e.stopPropagation();
        await addValue(filtered[suggestIdx] ?? input.value);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        suggestIdx = Math.min(suggestIdx + 1, filtered.length - 1);
        renderSuggestions();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        suggestIdx = Math.max(suggestIdx - 1, 0);
        renderSuggestions();
      } else if (e.key === "Backspace" && !input.value && values.length) {
        e.stopPropagation();
        const updated = values.slice(0, -1);
        await opts.onChange(updated);
        render(updated, true);
      } else if (e.key === "Escape") {
        // Don't stop propagation: let the card's own Escape handler (discard
        // edits) also see this, same as Esc on any other field input.
        input.blur();
      }
    });

    input.addEventListener("blur", () => {
      if (!pickingFromList) close();
    });
  };

  render(opts.values);
}
