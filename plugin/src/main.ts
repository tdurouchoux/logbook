import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LogbookSettings, LogbookSettingTab } from "./settings";
import { LogbookView, VIEW_TYPE_LOGBOOK } from "./view/LogbookView";

export default class LogbookPlugin extends Plugin {
  settings!: LogbookSettings;

  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_LOGBOOK, (leaf) => new LogbookView(leaf, this.settings));
    this.addRibbonIcon("book-open", "Open Logbook", () => this.activateView());
    this.addCommand({ id: "open-logbook", name: "Open Logbook", callback: () => this.activateView() });
    this.addSettingTab(new LogbookSettingTab(this.app, this));
  }

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LOGBOOK);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_LOGBOOK, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
