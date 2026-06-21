import { ALL_COMMANDS, NoteType, NOTE_TYPES } from "../types";
import { FilterState } from "../filters";
import { fuzzyMatch } from "../utils";

export interface RecurringMeetingRef {
  title: string;
  path: string;
}

export interface DockCallbacks {
  onSearch(query: string): void;
  onCreate(type: NoteType, titleOrQuestion: string): void;
  onCreateRecurring(title: string): void;
  onFilterProject(name: string): void;
  onFilterTeam(name: string): void;
  onFilterTag(name: string): void;
  onFilterType(type: NoteType, attr?: { key: string; value: string }): void;
  onClearFilters(): void;
  onOccurrence(meeting: RecurringMeetingRef): void;
  onRemoveFilterChip(kind: "project" | "team" | "tag" | "type" | "typeAttr", value?: string): void;
  getAllProjects(): string[];
  getAllTeams(): string[];
  getAllTags(): string[];
  getTypeAttrValues(type: NoteType): string[];
  getRecurringMeetings(): RecurringMeetingRef[];
  getFilters(): FilterState;
}

type Phase = "idle" | "command-list" | "free-arg" | "pick-arg" | "pick-type-attr";

interface DropdownItem {
  render(el: HTMLElement, selected: boolean): void;
  select(): void;
}

const UTILITY_COMMANDS = [
  { key: "project", desc: "Filter by project" },
  { key: "team", desc: "Filter by team" },
  { key: "tag", desc: "Filter by tag" },
  { key: "type", desc: "Filter by note type" },
  { key: "occurrence", desc: "Add/open today's occurrence" },
  { key: "clear", desc: "Remove all active filters" },
];

export class Dock {
  private inputEl!: HTMLInputElement;
  private dropdownEl!: HTMLElement;
  private chipsEl!: HTMLElement;
  private phase: Phase = "idle";
  private items: DropdownItem[] = [];
  private idx = 0;
  private pendingType: NoteType | null = null;

  constructor(private dockEl: HTMLElement, private cb: DockCallbacks) {
    this.chipsEl = dockEl.createDiv("logbook-filter-chips");
    const inputRow = dockEl.createDiv("logbook-input-row");
    this.dropdownEl = dockEl.createDiv("logbook-cmd-dropdown");
    this.dropdownEl.style.display = "none";
    this.inputEl = inputRow.createEl("input", {
      cls: "logbook-input",
      attr: { type: "text", placeholder: "Write a note, or type / for a type…", spellcheck: "false" },
    });
    this.inputEl.addEventListener("input", () => this.onInput());
    this.inputEl.addEventListener("keydown", (e) => this.onKeydown(e));
    document.addEventListener("click", (e) => {
      if (!dockEl.contains(e.target as Node)) this.closeDropdown();
    });
    this.renderChips();
  }

  renderChips() {
    this.chipsEl.empty();
    const f = this.cb.getFilters();
    for (const p of f.projects) {
      this.addChip("project", p, () => this.cb.onRemoveFilterChip("project", p));
    }
    for (const t of f.teams) {
      this.addChip("team", t, () => this.cb.onRemoveFilterChip("team", t), true);
    }
    for (const t of f.tags) {
      this.addChip("tag", t, () => this.cb.onRemoveFilterChip("tag", t));
    }
    if (f.type) {
      this.addChip("type", NOTE_TYPES[f.type].label, () => this.cb.onRemoveFilterChip("type"));
    }
    if (f.typeAttr && f.type) {
      const attrLabel = NOTE_TYPES[f.type].filterAttr?.label ?? "filter";
      this.addChip(attrLabel.toLowerCase(), f.typeAttr.value, () => this.cb.onRemoveFilterChip("typeAttr"));
    }
  }

  private addChip(kind: string, value: string, onRemove: () => void, italic = false) {
    const chip = this.chipsEl.createEl("span", { cls: "logbook-pill logbook-filter-chip" });
    chip.createSpan({ cls: "logbook-filter-chip-kind", text: kind });
    chip.createSpan({ cls: "logbook-filter-chip-value", text: value }).toggleClass("is-italic", italic);
    const x = chip.createEl("button", { cls: "logbook-chip-remove", text: "×" });
    x.addEventListener("click", onRemove);
    chip.addEventListener("click", (e) => {
      if (e.target === x) return;
      onRemove();
    });
  }

  private resetInput() {
    this.inputEl.value = "";
    this.inputEl.removeClass("is-command");
    this.inputEl.placeholder = "Write a note, or type / for a type…";
    this.phase = "idle";
    this.pendingType = null;
    this.closeDropdown();
  }

  private onInput() {
    const val = this.inputEl.value;
    if (!val.startsWith("/")) {
      this.phase = "idle";
      this.inputEl.removeClass("is-command");
      this.inputEl.placeholder = "Write a note, or type / for a type…";
      this.closeDropdown();
      this.cb.onSearch(val);
      return;
    }

    this.inputEl.addClass("is-command");
    const rest = val.slice(1);
    const spaceIdx = rest.indexOf(" ");

    if (spaceIdx === -1) {
      this.phase = "command-list";
      this.showCommandList(rest.toLowerCase());
      return;
    }

    const cmdKey = rest.slice(0, spaceIdx).toLowerCase();
    const arg = rest.slice(spaceIdx + 1);

    if (cmdKey === "clear") {
      this.closeDropdown();
      return;
    }
    if (cmdKey === "project") {
      this.phase = "pick-arg";
      this.showPickList(arg, this.cb.getAllProjects(), (v) => {
        this.cb.onFilterProject(v);
        this.resetInput();
      });
      return;
    }
    if (cmdKey === "team") {
      this.phase = "pick-arg";
      this.showPickList(arg, this.cb.getAllTeams(), (v) => {
        this.cb.onFilterTeam(v);
        this.resetInput();
      });
      return;
    }
    if (cmdKey === "tag") {
      this.phase = "pick-arg";
      this.showPickList(arg, this.cb.getAllTags(), (v) => {
        this.cb.onFilterTag(v);
        this.resetInput();
      });
      return;
    }
    if (cmdKey === "occurrence") {
      this.phase = "pick-arg";
      const meetings = this.cb.getRecurringMeetings();
      this.showPickList(
        arg,
        meetings.map((m) => m.title),
        (title) => {
          const m = meetings.find((x) => x.title === title);
          if (m) this.cb.onOccurrence(m);
          this.resetInput();
        }
      );
      return;
    }
    if (cmdKey === "type") {
      const typeSpaceIdx = arg.indexOf(" ");
      if (typeSpaceIdx === -1) {
        // Still typing/filtering the type name itself.
        this.pendingType = null;
        this.phase = "pick-arg";
        this.showTypeList(arg);
        return;
      }
      const typeKey = arg.slice(0, typeSpaceIdx).toLowerCase() as NoteType;
      const attrQuery = arg.slice(typeSpaceIdx + 1);
      if (NOTE_TYPES[typeKey]?.filterAttr) {
        this.pendingType = typeKey;
        this.phase = "pick-type-attr";
        this.showTypeAttrList(attrQuery);
      } else {
        // Unknown type, or a valid type with no filterable attribute — nothing to propose.
        this.pendingType = null;
        this.closeDropdown();
      }
      return;
    }

    // Creation command — free text title/question, no dropdown.
    this.phase = "free-arg";
    this.closeDropdown();
    const typeInfo = NOTE_TYPES[cmdKey as NoteType];
    this.inputEl.placeholder = typeInfo ? `${typeInfo.label} title…` : "Note title…";
  }

  private showCommandList(prefix: string) {
    const creation = ALL_COMMANDS.filter((c) => fuzzyMatch(prefix, c.key));
    const utility = UTILITY_COMMANDS.filter((c) => fuzzyMatch(prefix, c.key));

    this.items = [
      ...creation.map((c) => this.commandItem(c.key, c.desc, () => this.pickCommand(c.key))),
      ...utility.map((c) => this.commandItem(c.key, c.desc, () => this.pickCommand(c.key))),
    ];
    this.idx = 0;
    this.openDropdown();
  }

  private commandItem(key: string, desc: string, onSelect: () => void): DropdownItem {
    return {
      render: (el, selected) => {
        if (selected) el.addClass("is-selected");
        const left = el.createDiv("logbook-cmd-item-left");
        left.createSpan({ cls: "logbook-cmd-desc", text: desc });
        el.createEl("kbd", { cls: "logbook-cmd-key", text: `/${key}` });
      },
      select: onSelect,
    };
  }

  private pickCommand(key: string) {
    this.inputEl.value = `/${key} `;
    this.inputEl.focus();
    this.onInput();
  }

  /** Entry point for Obsidian command-palette commands (main.ts) — prefills and
   *  focuses the bar exactly as picking the command from its own dropdown would. */
  runCommand(key: string) {
    this.pickCommand(key);
  }

  private showPickList(query: string, pool: string[], onPick: (v: string) => void) {
    const matches = pool.filter((p) => fuzzyMatch(query, p));
    this.items = matches.map((m) => ({
      render: (el, selected) => {
        if (selected) el.addClass("is-selected");
        el.createSpan({ text: m });
      },
      select: () => onPick(m),
    }));
    this.idx = 0;
    this.openDropdown();
  }

  private showTypeList(query: string) {
    const matches = (Object.keys(NOTE_TYPES) as NoteType[]).filter((t) => fuzzyMatch(query, t));
    this.items = matches.map((t) => ({
      render: (el, selected) => {
        if (selected) el.addClass("is-selected");
        el.createSpan({ text: NOTE_TYPES[t].label });
      },
      select: () => {
        if (NOTE_TYPES[t].filterAttr) {
          this.pendingType = t;
          this.inputEl.value = `/type ${t} `;
          this.inputEl.focus();
          this.onInput();
        } else {
          this.cb.onFilterType(t);
          this.resetInput();
        }
      },
    }));
    this.idx = 0;
    this.openDropdown();
  }

  private showTypeAttrList(query: string) {
    const type = this.pendingType!;
    const options = ["— all", ...this.cb.getTypeAttrValues(type)];
    const matches = options.filter((v) => fuzzyMatch(query, v));
    this.items = matches.map((v) => ({
      render: (el, selected) => {
        if (selected) el.addClass("is-selected");
        el.createSpan({ text: v });
      },
      select: () => {
        const attrKey = NOTE_TYPES[type].filterAttr!.key;
        if (v === "— all") {
          this.cb.onFilterType(type);
        } else {
          this.cb.onFilterType(type, { key: attrKey, value: v });
        }
        this.resetInput();
      },
    }));
    this.idx = 0;
    this.openDropdown();
  }

  private openDropdown() {
    this.dropdownEl.style.display = "block";
    this.renderDropdown();
  }

  private closeDropdown() {
    this.dropdownEl.style.display = "none";
    this.items = [];
    this.idx = 0;
  }

  private renderDropdown() {
    this.dropdownEl.empty();
    if (!this.items.length) {
      this.dropdownEl.createDiv({ cls: "logbook-cmd-empty", text: "No matches" });
      return;
    }
    this.items.forEach((item, i) => {
      const el = this.dropdownEl.createDiv("logbook-cmd-item");
      item.render(el, i === this.idx);
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        item.select();
      });
      el.addEventListener("mouseenter", () => {
        this.idx = i;
        this.renderDropdown();
      });
    });
  }

  private onKeydown(e: KeyboardEvent) {
    const dropdownOpen = this.dropdownEl.style.display !== "none";

    if (dropdownOpen && this.items.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.idx = (this.idx + 1) % this.items.length;
        this.renderDropdown();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this.idx = (this.idx - 1 + this.items.length) % this.items.length;
        this.renderDropdown();
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        this.items[this.idx]?.select();
        return;
      }
      if (e.key === "Escape") {
        this.resetInput();
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      this.handleEnter();
    } else if (e.key === "Escape") {
      this.resetInput();
    } else if (e.key === "Backspace" && !this.inputEl.value) {
      const removed = this.removeMostRecentFilter();
      if (removed) e.preventDefault();
    }
  }

  private removeMostRecentFilter(): boolean {
    const f = this.cb.getFilters();
    if (f.projects.length) {
      this.cb.onRemoveFilterChip("project", f.projects[f.projects.length - 1]);
      return true;
    }
    if (f.teams.length) {
      this.cb.onRemoveFilterChip("team", f.teams[f.teams.length - 1]);
      return true;
    }
    if (f.tags.length) {
      this.cb.onRemoveFilterChip("tag", f.tags[f.tags.length - 1]);
      return true;
    }
    if (f.typeAttr) {
      this.cb.onRemoveFilterChip("typeAttr");
      return true;
    }
    if (f.type) {
      this.cb.onRemoveFilterChip("type");
      return true;
    }
    return false;
  }

  private handleEnter() {
    const val = this.inputEl.value.trim();
    if (!val) return;

    if (val.startsWith("/")) {
      const rest = val.slice(1);
      const spaceIdx = rest.indexOf(" ");
      if (spaceIdx === -1) {
        if (rest.toLowerCase() === "clear") {
          this.cb.onClearFilters();
          this.resetInput();
        }
        return;
      }
      const cmdKey = rest.slice(0, spaceIdx).toLowerCase();
      const title = rest.slice(spaceIdx + 1).trim();
      if (cmdKey === "clear") {
        this.cb.onClearFilters();
        this.resetInput();
        return;
      }
      if (!title) return;
      if (cmdKey === "recurring") {
        this.cb.onCreateRecurring(title);
        this.resetInput();
      } else if (NOTE_TYPES[cmdKey as NoteType]) {
        this.cb.onCreate(cmdKey as NoteType, title);
        this.resetInput();
      }
      // project/team/type/occurrence are handled via dropdown selection, not free Enter.
    } else {
      this.cb.onCreate("draft", val);
      this.resetInput();
    }
  }
}
