import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LogbookSettings, LogbookSettingTab } from "./settings";
import { LogbookView, VIEW_TYPE_LOGBOOK } from "./view/LogbookView";
import { ALL_COMMANDS } from "./types";
import { LogbookMcpServer } from "./mcp-server";

const CREATION_COMMANDS = ALL_COMMANDS.map((c) => ({
  id: `new-${c.key}`,
  key: c.key,
  name: `New ${c.label.toLowerCase()}`,
}));

export default class LogbookPlugin extends Plugin {
  settings!: LogbookSettings;
  private mcpServer: LogbookMcpServer | null = null;

  async onload() {
    await this.loadSettings();
    if (this.settings.mcpEnabled) await this.startMcpServer();
    this.registerView(
      VIEW_TYPE_LOGBOOK,
      (leaf) => new LogbookView(leaf, this.settings, () => this.saveSettings())
    );
    this.addRibbonIcon("book-open", "Open Logbook", () => this.activateView());
    this.addCommand({ id: "open-logbook", name: "Open Logbook", callback: () => this.activateView() });
    this.addCommand({
      id: "focus-logbook-input",
      name: "Focus Logbook input",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "k" }],
      callback: async () => {
        const view = await this.activateView();
        view.focusDockInput();
      },
    });
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

  async onunload() {
    await this.stopMcpServer();
  }

  private async startMcpServer() {
    this.mcpServer = new LogbookMcpServer(this.app, this.settings);
    await this.mcpServer.start(this.settings.mcpPort);
  }

  private async stopMcpServer() {
    if (!this.mcpServer) return;
    await this.mcpServer.stop();
    this.mcpServer = null;
  }

  /** Called by the settings tab when the MCP enabled toggle or port changes. */
  async restartMcpServer() {
    await this.stopMcpServer();
    if (this.settings.mcpEnabled) await this.startMcpServer();
  }

  async activateView(): Promise<LogbookView> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LOGBOOK);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return existing[0].view as LogbookView;
    }
    // Opens in the left sidebar by default (falls back to a main-area tab if the
    // workspace has no left split at all, which getLeftLeaf can return null for).
    const leaf = this.app.workspace.getLeftLeaf(false) ?? this.app.workspace.getLeaf("tab");
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
