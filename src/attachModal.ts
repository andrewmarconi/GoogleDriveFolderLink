import { FuzzySuggestModal, FuzzyMatch, TFile } from "obsidian";
import type GoogleDriveFolderLinkPlugin from "./main";
import type { CachedFolder } from "./types";

export class AttachDriveFolderModal extends FuzzySuggestModal<CachedFolder> {
  plugin: GoogleDriveFolderLinkPlugin;
  file: TFile;

  constructor(plugin: GoogleDriveFolderLinkPlugin, file: TFile) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
    this.setPlaceholder("Search Google Drive folders...");
    this.setInstructions(this.buildInstructions());
    this.emptyStateText = this.getEmptyStateText();
  }

  private buildInstructions(): { command: string; purpose: string }[] {
    const frontmatter =
      this.app.metadataCache.getFileCache(this.file)?.frontmatter;
    const currentUrl = frontmatter?.googleDriveFolderUrl;
    if (currentUrl) {
      return [{ command: "", purpose: `Currently attached: ${currentUrl}` }];
    }
    return [];
  }

  private getEmptyStateText(): string {
    const enabledRoots = this.plugin.settings.roots.filter((r) => r.enabled);
    if (enabledRoots.length === 0) {
      return "No Drive roots configured. Open plugin settings to add roots.";
    }
    if (this.plugin.folderCache.state === "crawling") {
      return "Loading folder tree...";
    }
    return "No folders found under configured roots.";
  }

  getItems(): CachedFolder[] {
    return this.plugin.folderCache.getAllFolders();
  }

  getItemText(item: CachedFolder): string {
    return item.name;
  }

  renderSuggestion(match: FuzzyMatch<CachedFolder>, el: HTMLElement): void {
    const folder = match.item;
    el.createEl("div", { text: folder.name, cls: "suggestion-title" });
    el.createEl("small", { text: folder.path, cls: "suggestion-note" });
  }

  onChooseItem(item: CachedFolder): void {
    this.plugin.attachFolderToFile(this.file, item);
  }
}
