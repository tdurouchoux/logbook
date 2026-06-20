import { setIcon } from "obsidian";

/**
 * Reusable chip + autocomplete picker for tags/projects/teams. Renders current
 * values as removable chips plus a free-text input (hidden via CSS unless the
 * owning card is expanded) with autocomplete from a candidate pool.
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

  const render = (values: string[]) => {
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

    const inputWrap = container.createDiv("logbook-picker-input-wrap");
    const input = inputWrap.createEl("input", {
      cls: "logbook-picker-input",
      attr: { type: "text", placeholder: opts.placeholder, spellcheck: "false" },
    });
    const suggestEl = inputWrap.createDiv("logbook-picker-suggestions");
    suggestEl.style.display = "none";

    let filtered: string[] = [];
    let suggestIdx = 0;
    let pickingFromList = false;

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
      input.value = "";
      suggestEl.style.display = "none";
      await opts.onChange(updated);
      render(updated);
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
        render(updated);
      } else if (e.key === "Escape") {
        e.stopPropagation();
        input.value = "";
        suggestEl.style.display = "none";
      }
    });

    input.addEventListener("blur", () => {
      if (!pickingFromList) suggestEl.style.display = "none";
    });
  };

  render(opts.values);
}
