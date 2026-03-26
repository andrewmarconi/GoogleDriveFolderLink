# Google Drive Folder Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian plugin that lets users attach Google Drive folders to notes via fuzzy search, with OAuth authentication, recursive folder tree caching, and one-click access from the properties pane.

**Architecture:** Layered modules — `auth.ts` (OAuth loopback), `driveApi.ts` (Drive API v3 wrapper), `folderCache.ts` (BFS tree crawl + in-memory cache), `attachModal.ts` (FuzzySuggestModal), `rootPickerModal.ts` (two-step drive/folder picker), `settings.ts` (settings tab), `main.ts` (orchestrator). Data flows linearly: auth → API → cache → modal → frontmatter.

**Tech Stack:** TypeScript, Obsidian Plugin API, Google Drive API v3, esbuild, Node.js `http` module (for OAuth loopback)

**Spec:** `docs/superpowers/specs/2026-03-25-google-drive-folder-link-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/types.ts` | Shared interfaces: `PluginSettings`, `DriveRoot`, `CachedFolder`, `DriveFolder` |
| `src/auth.ts` | OAuth 2.0 loopback flow, token storage, refresh, disconnect |
| `src/driveApi.ts` | Thin wrapper for Drive API v3 HTTP calls via `requestUrl` |
| `src/folderCache.ts` | BFS folder tree crawl, in-memory `Map<string, CachedFolder>`, path computation |
| `src/attachModal.ts` | `FuzzySuggestModal<CachedFolder>` for attaching folders to notes |
| `src/rootPickerModal.ts` | Two-step modal: drive selector (`SuggestModal`) + folder search (`SuggestModal` with debounced API calls) |
| `src/settings.ts` | `PluginSettingTab` — connection, roots list, refresh button |
| `src/main.ts` | Plugin lifecycle, commands, context menus, property widget, orchestration |
| `manifest.json` | Obsidian plugin manifest |
| `package.json` | Dependencies and build scripts |
| `tsconfig.json` | TypeScript configuration |
| `esbuild.config.mjs` | Build configuration |
| `.gitignore` | Ignore node_modules, main.js, etc. |
| `styles.css` | Minimal styles for property widget |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `.gitignore`, `styles.css`
- Create: `src/types.ts`, `src/main.ts`

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "id": "google-drive-folder-link",
  "name": "Google Drive Folder Link",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Attach Google Drive folders to notes via fuzzy search",
  "author": "Andrew Marconi",
  "isDesktopOnly": true
}
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "google-drive-folder-link",
  "version": "0.1.0",
  "description": "Obsidian plugin to attach Google Drive folders to notes",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.20.0",
    "obsidian": "latest",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES2018",
    "allowJs": true,
    "noImplicitAny": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "strictNullChecks": true,
    "lib": ["DOM", "ES2018", "ES2021.String"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Create `esbuild.config.mjs`**

```js
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
main.js
data.json
```

- [ ] **Step 6: Create `styles.css`**

```css
.google-drive-folder-link {
  cursor: pointer;
  color: var(--text-accent);
}
.google-drive-folder-link:hover {
  text-decoration: underline;
}
```

- [ ] **Step 7: Create `src/types.ts`**

```ts
export interface DriveRoot {
  id: string;
  name: string;
  driveId: string | null;
  driveName: string | null;
  enabled: boolean;
}

export interface CachedFolder {
  id: string;
  name: string;
  parentId: string | null;
  rootId: string;
  path: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  parents?: string[];
}

export interface DriveInfo {
  id: string;
  name: string;
}

export interface PluginSettings {
  clientId: string;
  clientSecret: string;
  roots: DriveRoot[];
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: number | null;
  accountEmail: string | null;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  clientId: "",
  clientSecret: "",
  roots: [],
  accessToken: null,
  refreshToken: null,
  tokenExpiry: null,
  accountEmail: null,
};
```

- [ ] **Step 8: Create minimal `src/main.ts` that loads**

```ts
import { Plugin } from "obsidian";
import { PluginSettings, DEFAULT_SETTINGS } from "./types";

export default class GoogleDriveFolderLinkPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();
    console.log("Google Drive Folder Link plugin loaded");
  }

  onunload() {
    console.log("Google Drive Folder Link plugin unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

- [ ] **Step 9: Install dependencies and verify build**

Run: `npm install && npm run build`
Expected: Build succeeds, `main.js` is produced with no errors.

- [ ] **Step 10: Commit**

```bash
git add manifest.json package.json tsconfig.json esbuild.config.mjs .gitignore styles.css src/types.ts src/main.ts
git commit -m "feat: scaffold Obsidian plugin project structure"
```

---

## Task 2: Authentication Module (`src/auth.ts`)

**Files:**
- Create: `src/auth.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/auth.ts` with OAuth loopback flow**

```ts
import { requestUrl } from "obsidian";
import http from "http";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthResult {
  tokens: AuthTokens;
  email: string;
}

export async function startAuthFlow(
  clientId: string,
  clientSecret: string
): Promise<AuthResult> {
  const { code, redirectUri } = await listenForAuthCode(clientId);
  const tokens = await exchangeCodeForTokens(
    code,
    clientId,
    clientSecret,
    redirectUri
  );
  const email = await fetchUserEmail(tokens.accessToken);
  return { tokens, email };
}

function listenForAuthCode(
  clientId: string
): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "", `http://127.0.0.1`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authorization failed.</h2><p>You can close this tab.</p></body></html>"
        );
        server.close();
        reject(new Error(`Auth error: ${error}`));
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authorization successful!</h2><p>You can close this tab and return to Obsidian.</p></body></html>"
        );
        server.close();
        const addr = server.address();
        const port =
          typeof addr === "object" && addr !== null ? addr.port : 0;
        resolve({ code, redirectUri: `http://127.0.0.1:${port}` });
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port =
        typeof addr === "object" && addr !== null ? addr.port : 0;
      const redirectUri = `http://127.0.0.1:${port}`;
      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      window.open(authUrl.toString());
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Auth timed out after 120 seconds"));
    }, 120_000);
  });
}

async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<AuthTokens> {
  const response = await requestUrl({
    url: GOOGLE_TOKEN_URL,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const data = response.json;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await requestUrl({
    url: GOOGLE_TOKEN_URL,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });
  const data = response.json;
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function fetchUserEmail(accessToken: string): Promise<string> {
  const response = await requestUrl({
    url: GOOGLE_USERINFO_URL,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.json.email;
}

export async function getValidAccessToken(
  accessToken: string | null,
  refreshToken: string | null,
  tokenExpiry: number | null,
  clientId: string,
  clientSecret: string,
  onRefresh: (accessToken: string, expiresAt: number) => void
): Promise<string> {
  if (!accessToken || !refreshToken) {
    throw new Error("Not authenticated. Please connect to Google Drive.");
  }
  if (tokenExpiry && Date.now() < tokenExpiry - 60_000) {
    return accessToken;
  }
  const refreshed = await refreshAccessToken(
    refreshToken,
    clientId,
    clientSecret
  );
  onRefresh(refreshed.accessToken, refreshed.expiresAt);
  return refreshed.accessToken;
}
```

- [ ] **Step 2: Wire auth into `src/main.ts`**

Add `startAuthFlow` import and `startDriveAuthFlow()` / `disconnect()` / `getAccessToken()` methods to the plugin class:

```ts
import { Notice } from "obsidian";
import { startAuthFlow, getValidAccessToken } from "./auth";

// Add these methods to GoogleDriveFolderLinkPlugin:

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

get isConnected(): boolean {
  return this.settings.refreshToken !== null;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Builds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/auth.ts src/main.ts
git commit -m "feat: add OAuth 2.0 loopback authentication module"
```

---

## Task 3: Drive API Layer (`src/driveApi.ts`)

**Files:**
- Create: `src/driveApi.ts`

- [ ] **Step 1: Create `src/driveApi.ts`**

```ts
import { requestUrl } from "obsidian";
import type { DriveFolder, DriveInfo } from "./types";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

export async function listSharedDrives(
  accessToken: string
): Promise<DriveInfo[]> {
  const drives: DriveInfo[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      pageSize: "100",
      fields: "nextPageToken,drives(id,name)",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await requestUrl({
      url: `${DRIVE_API_BASE}/drives?${params}`,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = response.json;
    if (data.drives) {
      drives.push(
        ...data.drives.map((d: { id: string; name: string }) => ({
          id: d.id,
          name: d.name,
        }))
      );
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return drives;
}

export async function listFolders(
  accessToken: string,
  parentId: string,
  driveId?: string | null
): Promise<DriveFolder[]> {
  const folders: DriveFolder[] = [];
  let pageToken: string | undefined;
  const q = `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;

  do {
    const params = new URLSearchParams({
      q,
      pageSize: "200",
      fields: "nextPageToken,files(id,name,parents)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (driveId) {
      params.set("driveId", driveId);
      params.set("corpora", "drive");
    }
    if (pageToken) params.set("pageToken", pageToken);

    const response = await requestUrl({
      url: `${DRIVE_API_BASE}/files?${params}`,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = response.json;
    if (data.files) {
      folders.push(
        ...data.files.map(
          (f: { id: string; name: string; parents?: string[] }) => ({
            id: f.id,
            name: f.name,
            parents: f.parents,
          })
        )
      );
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return folders;
}

export async function searchFoldersByName(
  accessToken: string,
  query: string,
  driveId?: string | null
): Promise<DriveFolder[]> {
  const escapedQuery = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = `mimeType='application/vnd.google-apps.folder' and name contains '${escapedQuery}' and trashed=false`;

  const params = new URLSearchParams({
    q,
    pageSize: "50",
    fields: "files(id,name,parents)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (driveId) {
    params.set("driveId", driveId);
    params.set("corpora", "drive");
  }

  const response = await requestUrl({
    url: `${DRIVE_API_BASE}/files?${params}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = response.json;
  return (data.files ?? []).map(
    (f: { id: string; name: string; parents?: string[] }) => ({
      id: f.id,
      name: f.name,
      parents: f.parents,
    })
  );
}

export async function getFolderMetadata(
  accessToken: string,
  folderId: string
): Promise<{ id: string; name: string; parents?: string[] }> {
  const params = new URLSearchParams({
    fields: "id,name,parents",
    supportsAllDrives: "true",
  });
  const response = await requestUrl({
    url: `${DRIVE_API_BASE}/files/${folderId}?${params}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.json;
}

export function buildFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Builds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/driveApi.ts
git commit -m "feat: add Google Drive API v3 wrapper module"
```

---

## Task 4: Folder Cache (`src/folderCache.ts`)

**Files:**
- Create: `src/folderCache.ts`

- [ ] **Step 1: Create `src/folderCache.ts`**

```ts
import type { CachedFolder, DriveRoot } from "./types";
import { listFolders } from "./driveApi";

export type CrawlState = "idle" | "crawling" | "error";

export class FolderCache {
  private cache: Map<string, CachedFolder> = new Map();
  private _state: CrawlState = "idle";
  private _error: string | null = null;
  private abortController: AbortController | null = null;

  get state(): CrawlState {
    return this._state;
  }

  get error(): string | null {
    return this._error;
  }

  getAllFolders(): CachedFolder[] {
    return Array.from(this.cache.values());
  }

  clear(): void {
    this.cache.clear();
  }

  removeRoot(rootId: string): void {
    for (const [key, folder] of this.cache) {
      if (folder.rootId === rootId) {
        this.cache.delete(key);
      }
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  async crawlRoots(
    roots: DriveRoot[],
    getAccessToken: () => Promise<string>
  ): Promise<void> {
    this.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this._state = "crawling";
    this._error = null;

    try {
      for (const root of roots) {
        if (signal.aborted) break;
        if (!root.enabled) continue;
        await this.crawlRoot(root, getAccessToken, signal);
      }
      this._state = "idle";
    } catch (e) {
      if (!signal.aborted) {
        this._state = "error";
        this._error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  async crawlSingleRoot(
    root: DriveRoot,
    getAccessToken: () => Promise<string>
  ): Promise<void> {
    this._state = "crawling";
    this._error = null;
    try {
      await this.crawlRoot(
        root,
        getAccessToken,
        new AbortController().signal
      );
      this._state = "idle";
    } catch (e) {
      this._state = "error";
      this._error = e instanceof Error ? e.message : String(e);
    }
  }

  private async crawlRoot(
    root: DriveRoot,
    getAccessToken: () => Promise<string>,
    signal: AbortSignal
  ): Promise<void> {
    const queue: { parentId: string; parentPath: string }[] = [
      { parentId: root.id, parentPath: root.name },
    ];

    while (queue.length > 0) {
      if (signal.aborted) return;

      const batch = queue.splice(0, 5);
      const results = await Promise.all(
        batch.map(async ({ parentId, parentPath }) => {
          const token = await getAccessToken();
          const folders = await listFolders(token, parentId, root.driveId);
          return folders.map((f) => ({
            folder: f,
            path: `${parentPath}/${f.name}`,
          }));
        })
      );

      // Rate-limit: small delay between batches to respect Drive API quotas
      if (queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      for (const entries of results) {
        for (const { folder, path } of entries) {
          const cached: CachedFolder = {
            id: folder.id,
            name: folder.name,
            parentId:
              folder.parents && folder.parents.length > 0
                ? folder.parents[0]
                : null,
            rootId: root.id,
            path,
          };
          this.cache.set(folder.id, cached);
          queue.push({ parentId: folder.id, parentPath: path });
        }
      }
    }
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Builds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/folderCache.ts
git commit -m "feat: add folder cache with BFS tree crawl"
```

---

## Task 5: Settings Tab (`src/settings.ts`)

**Files:**
- Create: `src/settings.ts`
- Modify: `src/main.ts` — register settings tab

- [ ] **Step 1: Create `src/settings.ts`**

```ts
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
    containerEl.createEl("h2", { text: "Google Drive Connection" });

    if (this.plugin.isConnected) {
      new Setting(containerEl)
        .setName("Status")
        .setDesc(`Connected as ${this.plugin.settings.accountEmail ?? "unknown"}`);

      new Setting(containerEl)
        .setName("Disconnect")
        .setDesc("Remove stored credentials and disconnect from Google Drive.")
        .addButton((btn) => {
          btn.setButtonText("Disconnect").setWarning().onClick(() => {
            this.plugin.disconnect();
            this.display();
          });
        });
    } else {
      new Setting(containerEl)
        .setName("Client ID")
        .setDesc("From your Google Cloud console OAuth credentials")
        .addText((text) => {
          text
            .setPlaceholder("Enter Client ID")
            .setValue(this.plugin.settings.clientId)
            .onChange(async (value) => {
              this.plugin.settings.clientId = value.trim();
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName("Client Secret")
        .setDesc("From your Google Cloud console OAuth credentials")
        .addText((text) => {
          text
            .setPlaceholder("Enter Client Secret")
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
    containerEl.createEl("h2", { text: "Search Root Folders" });

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
          btn.setIcon("trash").setTooltip("Remove root").onClick(async () => {
            this.plugin.removeRoot(root.id);
            this.display();
          });
        });
    });

    const addRootSetting = new Setting(containerEl)
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
```

- [ ] **Step 2: Register settings tab in `src/main.ts` `onload()`**

Add to `onload()`:
```ts
import { DriveLinkSettingsTab } from "./settings";

// In onload():
this.addSettingTab(new DriveLinkSettingsTab(this.app, this));
```

- [ ] **Step 3: Add stub methods to `src/main.ts`** for methods referenced by settings

Add these placeholder methods (will be implemented in later tasks):
```ts
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
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Builds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/main.ts
git commit -m "feat: add plugin settings tab with connection and root folder management"
```

---

## Task 6: Folder Cache Integration

**Files:**
- Modify: `src/main.ts` — initialize cache, wire refresh, crawl on load

- [ ] **Step 1: Import and initialize `FolderCache` in `src/main.ts`**

```ts
import { FolderCache } from "./folderCache";

// Add property to class:
folderCache: FolderCache = new FolderCache();

// In onload(), after loadSettings:
if (this.isConnected) {
  this.refreshFolderCache();
}
```

- [ ] **Step 2: Implement `refreshFolderCache()` properly**

Replace the stub:
```ts
async refreshFolderCache(): Promise<void> {
  const enabledRoots = this.settings.roots.filter((r) => r.enabled);
  if (enabledRoots.length === 0) return;
  this.folderCache.clear();
  await this.folderCache.crawlRoots(
    enabledRoots,
    () => this.getAccessToken()
  );
}
```

- [ ] **Step 3: Update `removeRoot()` to clear cache entries**

```ts
removeRoot(rootId: string): void {
  this.settings.roots = this.settings.roots.filter((r) => r.id !== rootId);
  this.folderCache.removeRoot(rootId);
  this.saveSettings();
}
```

- [ ] **Step 4: Add cleanup in `onunload()`**

```ts
onunload() {
  this.folderCache.abort();
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Builds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: integrate folder cache with plugin lifecycle"
```

---

## Task 7: Attach Modal (`src/attachModal.ts`)

**Files:**
- Create: `src/attachModal.ts`
- Modify: `src/main.ts` — register command and context menu

- [ ] **Step 1: Create `src/attachModal.ts`**

```ts
import { FuzzySuggestModal, FuzzyMatch, TFile, Notice } from "obsidian";
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
    const currentName = frontmatter?.googleDriveFolderName;
    if (currentName) {
      return [{ command: "", purpose: `Currently attached: ${currentName}` }];
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
```

- [ ] **Step 2: Add `attachFolderToFile()` to `src/main.ts`**

```ts
import { TFile, TAbstractFile, Menu, Notice } from "obsidian";
import { buildFolderUrl } from "./driveApi";
import type { CachedFolder } from "./types";

async attachFolderToFile(file: TFile, folder: CachedFolder): Promise<void> {
  await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
    frontmatter["googleDriveFolderId"] = folder.id;
    frontmatter["googleDriveFolderName"] = folder.name;
  });
  new Notice(`Attached: ${folder.name}`);
}
```

- [ ] **Step 3: Register the attach command in `onload()`**

```ts
import { AttachDriveFolderModal } from "./attachModal";

// In onload():
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
```

- [ ] **Step 4: Register the attach context menu item in `onload()`**

```ts
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
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Builds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/attachModal.ts src/main.ts
git commit -m "feat: add attach modal with fuzzy search and context menu"
```

---

## Task 8: Open Attached Folder Command

**Files:**
- Modify: `src/main.ts` — add open command and context menu

- [ ] **Step 1: Add `openAttachedFolder()` to `src/main.ts`**

```ts
openAttachedFolder(file: TFile): void {
  const frontmatter =
    this.app.metadataCache.getFileCache(file)?.frontmatter;
  const folderId = frontmatter?.googleDriveFolderId;
  if (!folderId) {
    new Notice("No Google Drive folder attached to this note.");
    return;
  }
  const url = buildFolderUrl(folderId);
  window.open(url);
}
```

- [ ] **Step 2: Register the open command in `onload()`**

```ts
this.addCommand({
  id: "open-google-drive-folder",
  name: "Open attached Google Drive folder",
  checkCallback: (checking) => {
    const file = this.app.workspace.getActiveFile();
    if (file && file.extension === "md") {
      const frontmatter =
        this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (frontmatter?.googleDriveFolderId) {
        if (!checking) {
          this.openAttachedFolder(file);
        }
        return true;
      }
    }
    return false;
  },
});
```

- [ ] **Step 3: Add open context menu item in the existing `file-menu` handler**

Add within the existing `file-menu` event registration, inside the `if (file instanceof TFile && file.extension === "md")` block:

```ts
const frontmatter =
  this.app.metadataCache.getFileCache(file as TFile)?.frontmatter;
if (frontmatter?.googleDriveFolderId) {
  menu.addItem((item) => {
    item
      .setTitle("Open Google Drive folder")
      .setIcon("external-link")
      .onClick(() => {
        this.openAttachedFolder(file as TFile);
      });
  });
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Builds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: add command and context menu to open attached Drive folder"
```

---

## Task 9: Root Picker Modal (`src/rootPickerModal.ts`)

**Files:**
- Create: `src/rootPickerModal.ts`
- Modify: `src/main.ts` — implement `openRootPickerModal()`

- [ ] **Step 1: Create `src/rootPickerModal.ts`**

```ts
import { SuggestModal, Notice, debounce } from "obsidian";
import type GoogleDriveFolderLinkPlugin from "./main";
import type { DriveInfo, DriveFolder, DriveRoot } from "./types";
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
      (this as any).updateSuggestions();
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
        (this as any).updateSuggestions();
      } catch (e) {
        new Notice(
          `Search failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
    300,
    true
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
```

- [ ] **Step 2: Update `openRootPickerModal()` in `src/main.ts`**

Replace the stub:
```ts
import { DriveSelectModal } from "./rootPickerModal";

openRootPickerModal(onDone: () => void): void {
  new DriveSelectModal(this, onDone).open();
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Builds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/rootPickerModal.ts src/main.ts
git commit -m "feat: add two-step root folder picker modal"
```

---

## Task 10: Custom Property Widget

**Files:**
- Modify: `src/main.ts` — register property widget for `googleDriveFolderId`
- Modify: `styles.css` — (already has base styles)

- [ ] **Step 1: Register custom property widget in `onload()`**

Note: Obsidian's property widget APIs are internal and may vary by version. The approach below uses DOM observation on the properties pane to replace the raw folder ID with a clickable link. If a future Obsidian version exposes a public `registerPropertyWidget` API, migrate to that instead.

```ts
// In onload(), after other registrations:
this.registerPropertyWidget();
```

Add method:
```ts
private registerPropertyWidget(): void {
  // Use a MutationObserver on the workspace to detect when the properties
  // pane renders a googleDriveFolderId property, and replace it with a link.
  this.registerEvent(
    this.app.workspace.on("layout-change", () => {
      this.patchPropertyElements();
    })
  );
  // Also patch on active leaf change
  this.registerEvent(
    this.app.workspace.on("active-leaf-change", () => {
      setTimeout(() => this.patchPropertyElements(), 100);
    })
  );
}

private patchPropertyElements(): void {
  const propertyEls = document.querySelectorAll(
    '.metadata-property[data-property-key="googleDriveFolderId"] .metadata-property-value'
  );
  propertyEls.forEach((propEl) => {
    if (propEl.querySelector(".google-drive-folder-link")) return;
    const input = propEl.querySelector("input");
    const folderId = input?.value?.trim();
    if (!folderId) return;

    // Hide the input and add a clickable link alongside it
    const link = document.createElement("a");
    link.textContent = "Open Google Drive Folder";
    link.className = "google-drive-folder-link";
    link.href = buildFolderUrl(folderId);
    link.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(buildFolderUrl(folderId));
    });
    propEl.appendChild(link);
  });
}
```

**Fallback:** If the DOM selectors don't match the user's Obsidian version, the property simply displays the raw folder ID — no breakage, just less polish. The "Open attached Google Drive folder" command and context menu item remain fully functional regardless.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Builds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts styles.css
git commit -m "feat: add custom property widget for Drive folder link"
```

---

## Task 11: Final Integration and Manual Testing

**Files:**
- Modify: `src/main.ts` — final cleanup and ensure all imports are correct

- [ ] **Step 1: Review `src/main.ts` for completeness**

Verify the final `onload()` method contains all registrations in order:
1. `loadSettings()`
2. Initialize `FolderCache`
3. Register settings tab
4. Register `attach-google-drive-folder` command
5. Register `open-google-drive-folder` command
6. Register `file-menu` event (both attach and open items)
7. Register property widget
8. Trigger background crawl if connected

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: Builds with no errors, `main.js` is produced.

- [ ] **Step 3: Manual smoke test in Obsidian**

Copy the plugin to an Obsidian vault's `.obsidian/plugins/google-drive-folder-link/` directory (copy `main.js`, `manifest.json`, `styles.css`). Enable the plugin and verify:

1. Settings tab appears with connection section
2. Can enter Client ID / Client Secret
3. Connect button starts OAuth flow
4. After connecting, can add root folders via the two-step picker
5. Refresh button crawls the folder tree
6. "Attach Google Drive folder..." command opens the fuzzy search modal
7. Selecting a folder writes frontmatter to the note
8. "Open attached Google Drive folder" command opens the folder in browser
9. Context menu items appear and work
10. Property widget renders as clickable link

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes from manual testing"
```

- [ ] **Step 5: Final commit — clean up console.log statements**

Remove any leftover `console.log` calls used during development:

```bash
git add -A
git commit -m "chore: remove debug console.log statements"
```
