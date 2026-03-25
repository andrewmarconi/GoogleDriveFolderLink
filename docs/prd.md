# Google Drive Folder Link

## Product Requirements Document (PRD)

### 1. Product overview

Build an Obsidian plugin that lets a user quickly **attach a Google Drive folder** to an Obsidian note via a fuzzy‑search picker limited to one or more configured Drive root folders. The plugin:

- Handles Google OAuth once per vault.
- Lets the user configure **which top-level Drive folders** are searchable.
- Adds a **command and context‑menu item** to “Attach Google Drive folder…”.
- Stores the chosen folder (ID + URL) as note metadata and optionally inserts a link into the note.

Target user: people who keep client/project docs in Drive but manage project knowledge in Obsidian, and want a 1–2 click way to bind a note to its Drive folder.

***

### 2. Goals and non‑goals

**Goals**

- One‑step UX to associate a note with an existing Drive folder.
- Fast, fuzzy live search over folders under selected Drive roots.
- Opinionated scope: only search inside configured root folders, not entire Drive.
- Transparent metadata: the association is visible and editable in the note’s properties.

**Non‑goals (v1)**

- No bi‑directional sync of files or contents.
- No Drive file picker (folders only).
- No per‑search “search entire Drive” override.
- No attachment upload / download management.

***

### 3. User stories

1. **Attach existing client folder to a note**

   - As a consultant, I want to open a client’s project note and quickly attach the corresponding Drive folder so I don’t need to manually grab share links from Drive.

2. **Configure which Drive areas are searchable**

   - As a user, I want to specify one or more Drive root folders (e.g., “Clients”) so that search results are focused on relevant project folders.

3. **See and follow the attached folder**

   - As a user, I want to see the attached Drive folder as a property/link in the note and click it to open the folder in my browser.

4. **Re‑attach or change the folder**

   - As a user, I want to re‑run the command on a note that already has a folder, see that it’s attached, and change it if needed.

***

### 4. Core workflows

#### 4.1 Initial setup (per vault)

1. User installs and enables plugin.
2. User opens plugin **Settings**.
3. Plugin prompts to **connect to Google Drive** (if no token exists).
4. After auth, user uses a **“Add root folder…”** control:
   - Opens a Drive‑search modal.
   - User types a folder name, picks one.
   - Plugin stores the folder ID/name as a “root” with `enabled=true`.
5. User optionally adds more roots or disables some.

#### 4.2 Attach Drive folder to note

1. User opens a note representing a project/client.
2. User triggers:
   - Command palette: “Attach Google Drive folder…”, or
   - File context‑menu item on the note.
3. Plugin checks for existing `googleDriveFolderId` in the note properties:
   - If exists, show current folder (name/path) and a subtle indication (“Currently attached; pick another to replace.”).
4. Plugin opens a **fuzzy search modal**:
   - Input box at top.
   - Results list below (folder name + short context).
   - Only searches within **enabled root folders**.
5. On each keypress, plugin:
   - Uses cached results or queries Drive with:
     - `mimeType='application/vnd.google-apps.folder'`
     - `trashed=false`
     - `name contains '<query>'`
     - `('<rootId1>' in parents or '<rootId2>' in parents ...)`
6. User selects a folder (Enter or click).
7. Plugin:
   - Stores folder ID and URL in note properties.
   - Optionally inserts a Markdown link at top of note (configurable).
   - Closes modal.

#### 4.3 Open attached folder

- From the note:
  - Click the property value (URL) in the properties pane, or
  - Click the inserted Markdown link at top.
- Browser opens the folder in Drive.

***

### 5. Functional requirements

#### 5.1 Obsidian integration

- Register at least one **command**:
  - `attach-google-drive-folder`: attach/change Drive folder for active file.
- Add an entry to the **file context menu** for markdown files:
  - Label: “Attach Google Drive folder…”.
- Plugin **Settings tab**:
  - Auth status (“Connected as <account email>”).
  - “Reconnect” / “Disconnect” controls.
  - **Root folders list**:
    - For each root: name, ID (read‑only), enabled toggle, remove button.
  - “Add root folder…” button:
    - Opens the same Drive folder search modal, but dedicated to selecting a root.

- Metadata conventions:
  - Store at least:
    - `googleDriveFolderId`
    - `googleDriveFolderUrl`
    - Optionally `googleDriveFolderName` (for quicker display).
  - Storage location:
    - Prefer a dedicated **frontmatter / properties** section on the note.
    - Key names should be configurable in plugin settings (with sane defaults).

#### 5.2 Google Drive integration

- Use **Drive API v3**.
- Auth:
  - OAuth 2, with offline access.
  - Store refresh token securely in plugin data (per vault).
  - Handle token refresh automatically.
- Queries:
  - Use `files.list` with `q` filters:
    - Restrict to folders: `mimeType='application/vnd.google-apps.folder'`.
    - Exclude trashed: `trashed=false`.
    - Restrict to allowed roots:
      - `('<rootId1>' in parents or '<rootId2>' in parents ...)`.
    - Filter by name:
      - `name contains '<escaped_query>'`.
- Pagination:
  - For v1, retrieve first N pages or cap results at a reasonable max (e.g., 100–200 folders).
- Folder URL format:
  - `https://drive.google.com/drive/folders/<folderId>`.

***

### 6. Non‑functional requirements

- **Performance**: search results should appear within ~200–500 ms after keypress, where network latency allows.
- **Resilience**:
  - Gracefully handle network errors (inline message in the modal).
  - If auth fails, show a clear message and link back to plugin settings to reconnect.
- **Privacy**:
  - No data is sent to third‑party servers other than Google’s own APIs.
  - Tokens and IDs are stored locally in the vault’s plugin data.

***

### 7. UX details

#### 7.1 Attach modal

- Built on Obsidian’s **`FuzzySuggestModal` / `SuggestModal`**.
- Title: “Attach Google Drive folder”.
- Empty state:
  - If no enabled roots: show message: “No Drive roots configured. Configure roots in plugin settings.”
- List item display:
  - Main line: folder name.
  - Sub line: parent path or root name (if cheaply available).
- If note already has a folder:
  - Show a small “Current: {name}” label above the input.
  - Selecting a new folder replaces the existing mapping.

#### 7.2 Settings tab

- Sections:
  1. **Google Drive connection**
     - Connect / Reconnect / Disconnect buttons.
  2. **Search roots**
     - List with checkboxes.
     - Add root button opens same folder search modal, but writes to settings.
  3. **Note properties**
     - Text boxes to customize property keys.
     - Toggle: “Insert Markdown link at top of note when attaching”.

***

### 8. Edge cases

- No internet: show an error in the modal and allow retry.
- Drive token revoked: detect 401, prompt user to reconnect.
- User types a query that returns zero results: show “No folders found under your configured roots.”
- User deletes a root folder in Drive: search will naturally return nothing under it; optionally show a warning in settings if a root lookup fails.

***

## Skeleton plugin structure (TypeScript)

This is a suggested high‑level structure you can paste into Claude Code as a starting point. It assumes the standard Obsidian plugin template.

### File layout

- `main.ts` – plugin entrypoint
- `settings.ts` – settings interface + SettingsTab UI
- `driveClient.ts` – Google Drive API client (auth + search)
- `attachModal.ts` – modal to attach folder to note
- `selectRootModal.ts` – modal to pick root folders (can reuse attach modal logic)
- `types.ts` – shared interfaces (DriveFolder, settings shapes)

Below are minimal code skeletons (no actual logic, just structure and key methods).

***

### `types.ts`

```ts
export interface DriveRoot {
  id: string;
  name: string;
  enabled: boolean;
}

export interface DriveFolder {
  id: string;
  name: string;
  parents?: string[];
}

export interface DriveLink {
  id: string;
  url: string;
  name?: string;
}

export interface PluginSettings {
  roots: DriveRoot[];
  driveConnected: boolean;
  driveAccountEmail?: string;
  notePropertyFolderIdKey: string;
  notePropertyFolderUrlKey: string;
  notePropertyFolderNameKey: string;
  insertMarkdownLink: boolean;
}
```

***

### `settings.ts`

```ts
import { App, PluginSettingTab, Setting } from "obsidian";
import type MyPlugin from "./main";
import type { PluginSettings, DriveRoot } from "./types";

export class DriveLinkSettingsTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Google Drive link settings" });

    // Connection section (placeholder)
    new Setting(containerEl)
      .setName("Google Drive connection")
      .setDesc("Connect or reconnect your Google Drive account.")
      .addButton((btn) => {
        btn.setButtonText("Connect");
        btn.onClick(() => {
          this.plugin.startDriveAuthFlow();
        });
      });

    // Roots section (placeholder)
    containerEl.createEl("h3", { text: "Search root folders" });

    this.plugin.settings.roots.forEach((root: DriveRoot, index: number) => {
      new Setting(containerEl)
        .setName(root.name)
        .setDesc(root.id)
        .addToggle((toggle) => {
          toggle.setValue(root.enabled);
          toggle.onChange(async (value) => {
            root.enabled = value;
            await this.plugin.saveSettings();
          });
        })
        .addExtraButton((btn) => {
          btn.setIcon("trash");
          btn.onClick(async () => {
            this.plugin.settings.roots.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
          });
        });
    });

    new Setting(containerEl)
      .setName("Add root folder")
      .setDesc("Add a Google Drive folder as a root for searches.")
      .addButton((btn) => {
        btn.setButtonText("Add root");
        btn.onClick(() => {
          this.plugin.openSelectRootModal();
        });
      });

    // Note properties section (placeholder)
    containerEl.createEl("h3", { text: "Note properties" });

    new Setting(containerEl)
      .setName("Folder ID property key")
      .addText((text) => {
        text
          .setValue(this.plugin.settings.notePropertyFolderIdKey)
          .onChange(async (value) => {
            this.plugin.settings.notePropertyFolderIdKey = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Folder URL property key")
      .addText((text) => {
        text
          .setValue(this.plugin.settings.notePropertyFolderUrlKey)
          .onChange(async (value) => {
            this.plugin.settings.notePropertyFolderUrlKey = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Insert Markdown link in note")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.insertMarkdownLink)
          .onChange(async (value) => {
            this.plugin.settings.insertMarkdownLink = value;
            await this.plugin.saveSettings();
          });
      });
  }
}
```

(Referenced Obsidian settings patterns.) [docs.obsidian](https://docs.obsidian.md/Plugins/User+interface/Settings)

***

### `driveClient.ts`

```ts
import type { DriveFolder, DriveRoot } from "./types";

export class DriveClient {
  // store tokens / config as needed
  // constructor can receive plugin instance or settings

  async ensureAuthenticated(): Promise<void> {
    // if no token or expired, trigger auth flow
  }

  async searchFolders(
    query: string,
    roots: DriveRoot[]
  ): Promise<DriveFolder[]> {
    // Build Drive API `files.list` query:
    // mimeType='application/vnd.google-apps.folder'
    // and trashed=false
    // and name contains '<query>'
    // and ('rootId1' in parents or 'rootId2' in parents ...)
    return [];
  }

  buildFolderUrl(id: string): string {
    return `https://drive.google.com/drive/folders/${id}`;
  }
}
```

(Drive search query patterns based on Drive docs.) [developers.google](https://developers.google.com/workspace/drive/api/guides/search-files)

***

### `attachModal.ts`

```ts
import { FuzzySuggestModal, TFile } from "obsidian";
import type MyPlugin from "./main";
import type { DriveFolder, DriveLink } from "./types";

export class AttachDriveFolderModal extends FuzzySuggestModal<DriveFolder> {
  plugin: MyPlugin;
  file: TFile;

  private currentQuery = "";
  private currentResults: DriveFolder[] = [];

  constructor(plugin: MyPlugin, file: TFile) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
    this.setPlaceholder("Search Google Drive folders…");
  }

  getItems(): DriveFolder[] {
    return this.currentResults;
  }

  getItemText(item: DriveFolder): string {
    return item.name;
  }

  async onOpen() {
    // optional: if file has existing folder, display info in modal header
  }

  async onInputChanged() {
    const query = this.inputEl.value.trim();
    this.currentQuery = query;

    if (!query) {
      this.currentResults = [];
      this.renderSuggestion(this.currentResults[0], this.resultContainerEl); // noop
      return;
    }

    const enabledRoots = this.plugin.settings.roots.filter((r) => r.enabled);

    this.currentResults = await this.plugin.driveClient.searchFolders(
      query,
      enabledRoots
    );

    this.renderResults();
  }

  renderResults() {
    // FuzzySuggestModal handles list; ensure it re-renders
    this.setItems(this.currentResults);
  }

  async onChooseItem(item: DriveFolder, evt: MouseEvent | KeyboardEvent) {
    const link: DriveLink = {
      id: item.id,
      url: this.plugin.driveClient.buildFolderUrl(item.id),
      name: item.name,
    };

    await this.plugin.attachFolderToFile(this.file, link);
  }
}
```

(Using Obsidian modal APIs.) [docs.obsidian](https://docs.obsidian.md/Plugins/User+interface/Modals)

***

### `selectRootModal.ts`

```ts
import type MyPlugin from "./main";
import { AttachDriveFolderModal } from "./attachModal";
import type { DriveFolder } from "./types";

export class SelectRootFolderModal extends AttachDriveFolderModal {
  constructor(plugin: MyPlugin) {
    // Pass a dummy file or adjust parent class to not require a file
    // Alternatively, factor out base search modal logic into another class.
    // For now, just reuse behavior and override onChooseItem.
    // @ts-expect-error
    super(plugin, null);
    this.setTitle("Select Google Drive root folder");
  }

  async onChooseItem(item: DriveFolder) {
    this.plugin.addRootFolderFromSelection(item);
  }
}
```

***

### `main.ts`

```ts
import {
  App,
  Plugin,
  TFile,
  TAbstractFile,
  Menu,
} from "obsidian";
import { DriveLinkSettingsTab } from "./settings";
import { AttachDriveFolderModal } from "./attachModal";
import { SelectRootFolderModal } from "./selectRootModal";
import { DriveClient } from "./driveClient";
import type { PluginSettings, DriveLink, DriveFolder } from "./types";

const DEFAULT_SETTINGS: PluginSettings = {
  roots: [],
  driveConnected: false,
  driveAccountEmail: undefined,
  notePropertyFolderIdKey: "googleDriveFolderId",
  notePropertyFolderUrlKey: "googleDriveFolderUrl",
  notePropertyFolderNameKey: "googleDriveFolderName",
  insertMarkdownLink: true,
};

export default class MyPlugin extends Plugin {
  settings: PluginSettings;
  driveClient: DriveClient;

  async onload() {
    await this.loadSettings();

    this.driveClient = new DriveClient();

    this.addSettingTab(new DriveLinkSettingsTab(this.app, this));

    this.addCommand({
      id: "attach-google-drive-folder",
      name: "Attach Google Drive folder…",
      callback: () => {
        const file = this.getActiveMarkdownFile();
        if (file) this.openAttachModalForFile(file);
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) => {
            item
              .setTitle("Attach Google Drive folder…")
              .setIcon("link")
              .onClick(() => {
                this.openAttachModalForFile(file);
              });
          });
        }
      })
    );
  }

  onunload() {
    // clean up if needed
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getActiveMarkdownFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    if (file && file.extension === "md") return file;
    return null;
  }

  openAttachModalForFile(file: TFile) {
    new AttachDriveFolderModal(this, file).open();
  }

  openSelectRootModal() {
    new SelectRootFolderModal(this).open();
  }

  async attachFolderToFile(file: TFile, link: DriveLink) {
    // 1. Update note properties/frontmatter
    // 2. Optionally insert Markdown link at top
    // 3. Save file changes
  }

  async startDriveAuthFlow() {
    // Start OAuth flow; on success, set this.settings.driveConnected = true
    // and save tokens in driveClient or plugin data.
  }

  addRootFolderFromSelection(folder: DriveFolder) {
    this.settings.roots.push({
      id: folder.id,
      name: folder.name,
      enabled: true,
    });
    this.saveSettings();
  }
}
```

(Uses Obsidian plugin lifecycle and file menu APIs.) [docs.obsidian](https://docs.obsidian.md/Plugins/User+interface/Context+menus)

- Fill in Google OAuth + Drive API calls inside `DriveClient`.
- Implement `attachFolderToFile` to manipulate frontmatter and Markdown.
- Refactor the modals if needed (e.g., separate base search modal vs. attach/select modes).
- Add error handling and small UX polish.