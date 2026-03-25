import { Notice, Plugin } from "obsidian";
import { PluginSettings, DEFAULT_SETTINGS } from "./types";
import { startAuthFlow, getValidAccessToken } from "./auth";
import { DriveLinkSettingsTab } from "./settings";

export default class GoogleDriveFolderLinkPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new DriveLinkSettingsTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  get isConnected(): boolean {
    return this.settings.refreshToken !== null;
  }

  async startDriveAuthFlow(): Promise<void> {
    if (!this.settings.clientId || !this.settings.clientSecret) {
      new Notice("Please enter Client ID and Client Secret first.");
      return;
    }
    try {
      const result = await startAuthFlow(
        this.settings.clientId,
        this.settings.clientSecret
      );
      this.settings.accessToken = result.tokens.accessToken;
      this.settings.refreshToken = result.tokens.refreshToken;
      this.settings.tokenExpiry = result.tokens.expiresAt;
      this.settings.accountEmail = result.email;
      await this.saveSettings();
      new Notice(`Connected as ${result.email}`);
    } catch (e) {
      new Notice(`Auth failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  disconnect(): void {
    this.settings.accessToken = null;
    this.settings.refreshToken = null;
    this.settings.tokenExpiry = null;
    this.settings.accountEmail = null;
    this.saveSettings();
    new Notice("Disconnected from Google Drive.");
  }

  openRootPickerModal(onDone: () => void): void {
    new Notice("Root picker not yet implemented");
  }

  removeRoot(rootId: string): void {
    this.settings.roots = this.settings.roots.filter((r) => r.id !== rootId);
    this.saveSettings();
  }

  async refreshFolderCache(): Promise<void> {
    new Notice("Folder cache not yet implemented");
  }

  async getAccessToken(): Promise<string> {
    return getValidAccessToken(
      this.settings.accessToken,
      this.settings.refreshToken,
      this.settings.tokenExpiry,
      this.settings.clientId,
      this.settings.clientSecret,
      (accessToken, expiresAt) => {
        this.settings.accessToken = accessToken;
        this.settings.tokenExpiry = expiresAt;
        this.saveSettings();
      }
    );
  }
}
