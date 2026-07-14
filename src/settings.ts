import { App, PluginSettingTab, Setting } from "obsidian";
import type LogbookPlugin from "./main";
import { NoteType, NOTE_TYPES } from "./types";
import { SavedView } from "./filters";

export interface LogbookSettings {
  folder: string;
  /** Optional vault path to a template file per note type, applied to a note's body
   *  on creation only (never retroactively) — see design.md §7, §15. Empty/missing-file
   *  means no template, same as today's blank-body creation. */
  templates: Record<NoteType, string>;
  /** Read-only MCP server (design.md §16) — off by default since opening a local
   *  port shouldn't happen silently just because the plugin is installed. */
  mcpEnabled: boolean;
  mcpPort: number;
  /** Days since a draft note's mtime (last-modified) before it's auto-trashed
   *  (design.md §5.1). `null` disables draft auto-delete entirely. */
  draftTTLDays: number | null;
  /** Days since a `done` task's mtime before it's auto-trashed, same mechanism
   *  as draft auto-delete (design.md §5.1, §5.2). `null` disables it entirely. */
  doneTaskTTLDays: number | null;
  /** Saved filter combinations ("views"), applied/created via /view and /saveview
   *  in the command bar. Plugin-level config, not vault content — same footing
   *  as the folder path/TTLs/templates above. */
  views: SavedView[];
}

const DEFAULT_TEMPLATES: Record<NoteType, string> = Object.fromEntries(
  (Object.keys(NOTE_TYPES) as NoteType[]).map((t) => [t, `templates/${t}.md`])
) as Record<NoteType, string>;

export const DEFAULT_SETTINGS: LogbookSettings = {
  folder: "logbook",
  templates: DEFAULT_TEMPLATES,
  mcpEnabled: false,
  mcpPort: 27124,
  draftTTLDays: 14,
  doneTaskTTLDays: 14,
  views: [],
};

/** Parses a TTL settings text input: blank or non-positive means "disabled" (`null`). */
function parseTTLDays(value: string): number | null {
  const n = Number(value.trim());
  return value.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

export class LogbookSettingTab extends PluginSettingTab {
  plugin: LogbookPlugin;

  constructor(app: App, plugin: LogbookPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Logbook" });
    new Setting(containerEl)
      .setName("Logbook folder")
      .setDesc("Vault folder where logbook notes are stored.")
      .addText((text) =>
        text.setValue(this.plugin.settings.folder).onChange(async (value) => {
          this.plugin.settings.folder = value.trim() || "logbook";
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Auto-delete" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Leave blank to disable auto-delete for that type.",
    });
    new Setting(containerEl)
      .setName("Draft TTL (days)")
      .setDesc("Drafts not modified for this long are sent to trash on plugin load.")
      .addText((text) =>
        text.setValue(this.plugin.settings.draftTTLDays?.toString() ?? "").onChange(async (value) => {
          this.plugin.settings.draftTTLDays = parseTTLDays(value);
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("Done task TTL (days)")
      .setDesc("Done tasks older than this (since last modified) are sent to trash on plugin load.")
      .addText((text) =>
        text.setValue(this.plugin.settings.doneTaskTTLDays?.toString() ?? "").onChange(async (value) => {
          this.plugin.settings.doneTaskTTLDays = parseTTLDays(value);
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Templates" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "Optional vault path to a template note per type, used to seed a new note's body on creation. " +
        "Leave blank or point at a file that doesn't exist to skip — the note is created empty, as before.",
    });
    for (const [type, cfg] of Object.entries(NOTE_TYPES) as [NoteType, (typeof NOTE_TYPES)[NoteType]][]) {
      new Setting(containerEl).setName(cfg.label).addText((text) =>
        text.setValue(this.plugin.settings.templates[type] ?? "").onChange(async (value) => {
          this.plugin.settings.templates[type] = value.trim();
          await this.plugin.saveSettings();
        })
      );
    }

    containerEl.createEl("h3", { text: "Views" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "Saved filter combinations — apply one with /view <name> in the command bar, " +
        "or save the currently active filters as a new one with /saveview <name>.",
    });
    if (this.plugin.settings.views.length === 0) {
      containerEl.createEl("p", { cls: "setting-item-description", text: "No saved views yet." });
    }
    for (const view of this.plugin.settings.views) {
      new Setting(containerEl).setName(view.name).addExtraButton((btn) =>
        btn
          .setIcon("trash-2")
          .setTooltip("Delete view")
          .onClick(async () => {
            this.plugin.settings.views = this.plugin.settings.views.filter((v) => v.id !== view.id);
            await this.plugin.saveSettings();
            this.display();
          })
      );
    }

    containerEl.createEl("h3", { text: "MCP server" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "Read-only access to this logbook for external agents over the Model Context Protocol " +
        "(design.md §16). Off by default.",
    });
    new Setting(containerEl)
      .setName("Enabled")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mcpEnabled).onChange(async (value) => {
          this.plugin.settings.mcpEnabled = value;
          await this.plugin.saveSettings();
          await this.plugin.restartMcpServer();
        })
      );
    new Setting(containerEl)
      .setName("Port")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.mcpPort)).onChange(async (value) => {
          const port = parseInt(value, 10);
          if (Number.isNaN(port)) return;
          this.plugin.settings.mcpPort = port;
          await this.plugin.saveSettings();
          await this.plugin.restartMcpServer();
        })
      );
  }
}
