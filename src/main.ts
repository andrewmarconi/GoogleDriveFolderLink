import { Menu, Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { PluginSettings, DEFAULT_SETTINGS, CachedFolder } from "./types";
import { startAuthFlow, getValidAccessToken } from "./auth";
import { DriveLinkSettingsTab } from "./settings";
import { FolderCache } from "./folderCache";
import { AttachDriveFolderModal } from "./attachModal";

export default class GoogleDriveFolderLinkPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  folderCache: FolderCache = new FolderCache();

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new DriveLinkSettingsTab(this.app, this));

    this.addCommand({
      id: "attach-google-drive-folder",
      name: "Attach Google Drive folder...",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file && file.extension === "md") {
          if (!checking) {
            new AttachDriveFolderModal(this, file).open();
          }
          return true;
        }
        return false;
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) => {
            item
              .setTitle("Attach Google Drive folder...")
              .setIcon("link")
              .onClick(() => {
                new AttachDriveFolderModal(this, file).open();
              });
          });
        }
      })
    );

    if (this.isConnected) {
      this.refreshFolderCache();
    }
  }

  onunload() {
    this.folderCache.abort();
  }

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
    this.folderCache.removeRoot(rootId);
    this.saveSettings();
  }

  async attachFolderToFile(file: TFile, folder: CachedFolder): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter["googleDriveFolderId"] = folder.id;
      frontmatter["googleDriveFolderName"] = folder.name;
    });
    new Notice(`Attached: ${folder.name}`);
  }

  async refreshFolderCache(): Promise<void> {
    const enabledRoots = this.settings.roots.filter((r) => r.enabled);
    if (enabledRoots.length === 0) return;
    this.folderCache.clear();
    await this.folderCache.crawlRoots(
      enabledRoots,
      () => this.getAccessToken()
    );
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
