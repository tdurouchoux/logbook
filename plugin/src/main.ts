import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LogbookSettings, LogbookSettingTab } from "./settings";
import { LogbookView, VIEW_TYPE_LOGBOOK } from "./view/LogbookView";
import { ALL_COMMANDS } from "./types";

const CREATION_COMMANDS = [
  ...ALL_COMMANDS.map((c) => ({ id: `new-${c.key}`, key: c.key, name: `New ${c.label.toLowerCase()}` })),
  { id: "new-recurring-meeting", key: "recurring", name: "New recurring meeting" },
];

export default class LogbookPlugin extends Plugin {
  settings!: LogbookSettings;

  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_LOGBOOK, (leaf) => new LogbookView(leaf, this.settings));
    this.addRibbonIcon("book-open", "Open Logbook", () => this.activateView());
    this.addCommand({ id: "open-logbook", name: "Open Logbook", callback: () => this.activateView() });
    this.addCommand({
      id: "close-logbook-card",
      name: "Close and save expanded Logbook card",
      hotkeys: [{ modifiers: ["Mod"], key: "Enter" }],
      callback: () => {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LOGBOOK)) {
          if (leaf.view instanceof LogbookView) leaf.view.closeActiveCard();
        }
      },
    });
    for (const c of CREATION_COMMANDS) {
      this.addCommand({
        id: c.id,
        name: c.name,
        callback: async () => {
          const view = await this.activateView();
          view.focusDockCommand(c.key);
        },
      });
    }
    this.addSettingTab(new LogbookSettingTab(this.app, this));
  }

  async activateView(): Promise<LogbookView> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LOGBOOK);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return existing[0].view as LogbookView;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_LOGBOOK, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf.view as LogbookView;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
