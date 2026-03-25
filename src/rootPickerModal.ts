import { SuggestModal, Notice, debounce } from "obsidian";
import type GoogleDriveFolderLinkPlugin from "./main";
import type { DriveFolder, DriveRoot } from "./types";
import { listSharedDrives, searchFoldersByName } from "./driveApi";

interface DriveOption {
  id: string | null; // null = My Drive
  name: string;
}

export class DriveSelectModal extends SuggestModal<DriveOption> {
  plugin: GoogleDriveFolderLinkPlugin;
  private options: DriveOption[] = [];
  private onDone: () => void;

  constructor(
    plugin: GoogleDriveFolderLinkPlugin,
    onDone: () => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.setPlaceholder("Loading drives...");
    this.loadDrives();
  }

  private async loadDrives(): Promise<void> {
    try {
      const token = await this.plugin.getAccessToken();
      const sharedDrives = await listSharedDrives(token);
      this.options = [
        { id: null, name: "My Drive" },
        ...sharedDrives.map((d) => ({ id: d.id, name: d.name })),
      ];
      this.setPlaceholder("Select a drive...");
      // Trigger re-render
      if (typeof (this as any).updateSuggestions === "function") {
        (this as any).updateSuggestions();
      }
    } catch (e) {
      new Notice(
        `Failed to load drives: ${e instanceof Error ? e.message : String(e)}`
      );
      this.close();
    }
  }

  getSuggestions(query: string): DriveOption[] {
    const lower = query.toLowerCase();
    return this.options.filter((o) =>
      o.name.toLowerCase().includes(lower)
    );
  }

  renderSuggestion(option: DriveOption, el: HTMLElement): void {
    el.createEl("div", { text: option.name });
    el.createEl("small", {
      text: option.id ? "Shared Drive" : "Personal",
    });
  }

  onChooseSuggestion(option: DriveOption): void {
    new FolderSearchModal(
      this.plugin,
      option.id,
      option.name,
      this.onDone
    ).open();
  }
}

class FolderSearchModal extends SuggestModal<DriveFolder> {
  plugin: GoogleDriveFolderLinkPlugin;
  private driveId: string | null;
  private driveName: string;
  private results: DriveFolder[] = [];
  private onDone: () => void;

  private debouncedSearch = debounce(
    async (query: string) => {
      try {
        const token = await this.plugin.getAccessToken();
        this.results = await searchFoldersByName(
          token,
          query,
          this.driveId
        );
        // Trigger re-render
        if (typeof (this as any).updateSuggestions === "function") {
          (this as any).updateSuggestions();
        }
      } catch (e) {
        new Notice(
          `Search failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
    300
  );

  constructor(
    plugin: GoogleDriveFolderLinkPlugin,
    driveId: string | null,
    driveName: string,
    onDone: () => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.driveId = driveId;
    this.driveName = driveName;
    this.onDone = onDone;
    this.setPlaceholder(`Search folders in ${driveName}...`);
  }

  getSuggestions(query: string): DriveFolder[] {
    if (query.trim().length > 0) {
      this.debouncedSearch(query.trim());
    }
    return this.results;
  }

  renderSuggestion(folder: DriveFolder, el: HTMLElement): void {
    el.createEl("div", { text: folder.name });
  }

  onChooseSuggestion(folder: DriveFolder): void {
    const root: DriveRoot = {
      id: folder.id,
      name: folder.name,
      driveId: this.driveId,
      driveName: this.driveName === "My Drive" ? "My Drive" : this.driveName,
      enabled: true,
    };

    const existing = this.plugin.settings.roots.find(
      (r) => r.id === folder.id
    );
    if (existing) {
      new Notice(`"${folder.name}" is already a root folder.`);
      return;
    }

    this.plugin.settings.roots.push(root);
    this.plugin.saveSettings();
    this.plugin.folderCache.crawlSingleRoot(root, () =>
      this.plugin.getAccessToken()
    );
    new Notice(`Added root: ${folder.name}`);
    this.onDone();
  }
}
