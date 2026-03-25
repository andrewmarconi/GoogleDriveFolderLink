import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type GoogleDriveFolderLinkPlugin from "./main";
import type { DriveRoot } from "./types";

export class DriveLinkSettingsTab extends PluginSettingTab {
  plugin: GoogleDriveFolderLinkPlugin;

  constructor(app: App, plugin: GoogleDriveFolderLinkPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // --- Connection section ---
    new Setting(containerEl).setName("Google Drive connection").setHeading();

    if (this.plugin.isConnected) {
      new Setting(containerEl)
        .setName("Status")
        .setDesc(`Connected as ${this.plugin.settings.accountEmail ?? "unknown"}`);

      new Setting(containerEl)
        .setName("Disconnect")
        .setDesc("Remove stored credentials and disconnect from Google Drive.")
        .addButton((btn) => {
          btn.setButtonText("Disconnect").setWarning().onClick(async () => {
            await this.plugin.disconnect();
            this.display();
          });
        });
    } else {
      new Setting(containerEl)
        .setName("Client ID")
        .setDesc("From your Google Cloud console OAuth credentials")
        .addText((text) => {
          text
            .setPlaceholder("Enter client ID")
            .setValue(this.plugin.settings.clientId)
            .onChange(async (value) => {
              this.plugin.settings.clientId = value.trim();
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName("Client secret")
        .setDesc("From your Google Cloud console OAuth credentials")
        .addText((text) => {
          text.inputEl.type = "password";
          text
            .setPlaceholder("Enter client secret")
            .setValue(this.plugin.settings.clientSecret)
            .onChange(async (value) => {
              this.plugin.settings.clientSecret = value.trim();
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName("Connect")
        .setDesc("Authenticate with Google Drive")
        .addButton((btn) => {
          btn.setButtonText("Connect").setCta().onClick(async () => {
            await this.plugin.startDriveAuthFlow();
            this.display();
          });
        });
    }

    // --- Root folders section ---
    new Setting(containerEl).setName("Search root folders").setHeading();

    if (this.plugin.settings.roots.length === 0) {
      containerEl.createEl("p", {
        text: "No root folders configured. Add a root folder to start searching.",
        cls: "setting-item-description",
      });
    }

    this.plugin.settings.roots.forEach((root: DriveRoot, index: number) => {
      const desc = root.driveName
        ? `${root.driveName} — ${root.id}`
        : `My Drive — ${root.id}`;

      new Setting(containerEl)
        .setName(root.name)
        .setDesc(desc)
        .addToggle((toggle) => {
          toggle.setValue(root.enabled).onChange(async (value) => {
            this.plugin.settings.roots[index].enabled = value;
            await this.plugin.saveSettings();
          });
        })
        .addExtraButton((btn) => {
          btn.setIcon("trash").setTooltip("Remove root").onClick(() => {
            this.plugin.removeRoot(root.id);
            this.display();
          });
        });
    });

    new Setting(containerEl)
      .setName("Add root folder")
      .setDesc("Select a Google Drive folder as a search root.")
      .addButton((btn) => {
        btn
          .setButtonText("Add root")
          .setDisabled(!this.plugin.isConnected)
          .onClick(() => {
            this.plugin.openRootPickerModal(() => this.display());
          });
      });

    new Setting(containerEl)
      .setName("Refresh folder tree")
      .setDesc("Re-crawl all enabled root folders.")
      .addButton((btn) => {
        btn
          .setButtonText("Refresh")
          .setDisabled(!this.plugin.isConnected)
          .onClick(async () => {
            btn.setButtonText("Refreshing...");
            btn.setDisabled(true);
            await this.plugin.refreshFolderCache();
            btn.setButtonText("Refresh");
            btn.setDisabled(false);
            new Notice("Folder tree refreshed.");
          });
      });
  }
}
