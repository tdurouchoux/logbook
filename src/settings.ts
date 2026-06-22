import { App, PluginSettingTab, Setting } from "obsidian";
import type LogbookPlugin from "./main";
import { NoteType, NOTE_TYPES } from "./types";

export interface LogbookSettings {
  folder: string;
  /** Optional vault path to a template file per note type, applied to a note's body
   *  on creation only (never retroactively) — see design.md §7, §15. Empty/missing-file
   *  means no template, same as today's blank-body creation. */
  templates: Record<NoteType, string>;
}

const DEFAULT_TEMPLATES: Record<NoteType, string> = Object.fromEntries(
  (Object.keys(NOTE_TYPES) as NoteType[]).map((t) => [t, `templates/${t}.md`])
) as Record<NoteType, string>;

export const DEFAULT_SETTINGS: LogbookSettings = { folder: "logbook", templates: DEFAULT_TEMPLATES };

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
  }
}
