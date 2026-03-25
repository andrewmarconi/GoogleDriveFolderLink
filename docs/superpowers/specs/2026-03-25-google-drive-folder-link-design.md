# Google Drive Folder Link — Design Spec

## Overview

An Obsidian plugin that lets users attach a Google Drive folder to a note via a fuzzy-search picker. The plugin caches the Drive folder tree in memory for fast local search, stores the association in note frontmatter, and provides one-click access to the linked folder.

## Architecture

Layered module architecture with clear boundaries:

```
main.ts (orchestrator)
  ├── auth.ts         — OAuth 2.0 loopback flow, token lifecycle
  ├── driveApi.ts     — Google Drive API v3 HTTP calls
  ├── folderCache.ts  — Folder tree crawl, in-memory cache
  ├── attachModal.ts  — FuzzySuggestModal for attaching folders
  ├── rootPickerModal.ts — Two-step modal for selecting root folders
  ├── settings.ts     — Plugin settings tab UI
  └── types.ts        — Shared interfaces
```

Data flow: `auth → driveApi → folderCache → modal → frontmatter`

---

## Module Specifications

### 1. Authentication (`auth.ts`)

**OAuth 2.0 desktop loopback flow.** Each user provides their own Google Cloud OAuth credentials (Client ID + Client Secret) configured as a "Desktop app" type.

**Flow:**

1. User enters Client ID and Client Secret in plugin settings
2. User clicks "Connect"
3. Plugin spins up a temporary local HTTP server on a random available port
4. Plugin opens the default browser to Google's OAuth consent screen with `redirect_uri=http://127.0.0.1:<port>`
5. User grants access; Google redirects to the local server with an auth code
6. Plugin exchanges the auth code for access + refresh tokens via Google's token endpoint
7. Tokens are stored via `plugin.saveData()`
8. Local server shuts down

**Token refresh:** Before any API call, check if the access token is expired. If so, use the refresh token silently. If refresh fails (revoked), surface an error prompting the user to reconnect.

**Scope:** `https://www.googleapis.com/auth/drive.readonly` — read-only metadata access.

**Disconnect:** Clears all stored tokens and resets auth state.

**Stored data:**

- `clientId` (user-provided)
- `clientSecret` (user-provided)
- `accessToken`, `refreshToken`, `tokenExpiry`
- `accountEmail`

### 2. Drive API Layer (`driveApi.ts`)

Thin wrapper around Google Drive API v3. No caching or business logic.

**Functions:**

- **`listSharedDrives()`** — `drives.list` to get all accessible shared drives. Returns `{id, name}[]`.
- **`listFolders(parentId, driveId?)`** — `files.list` with:
  - `q: mimeType='application/vnd.google-apps.folder' and '<parentId>' in parents and trashed=false`
  - `supportsAllDrives=true`, `includeItemsFromAllDrives=true`
  - `fields: files(id, name, parents)`
  - Shared drive scoping via `driveId` and `corpora=drive` when applicable
  - Pagination via `nextPageToken`
- **`getFolderMetadata(folderId)`** — Single folder's name and parents.
- **`getUserEmail()`** — Calls userinfo endpoint for display in settings.

All functions take an access token, throw typed errors on 401 or network failure. Uses Obsidian's `requestUrl` for all HTTP calls (handles CORS in Electron).

### 3. Folder Cache (`folderCache.ts`)

Crawls the folder tree under each configured root and holds it in memory for fast search.

**Data structure:**

```ts
interface CachedFolder {
  id: string;
  name: string;
  parentId: string | null;
  rootId: string;       // which configured root this belongs to
  path: string;         // computed: "Clients/Acme Corp/Projects"
}
```

Stored as a flat `Map<string, CachedFolder>` keyed by folder ID.

**Crawl logic:**

1. For each enabled root, call `driveApi.listFolders(rootId, driveId?)` for immediate children
2. Breadth-first recursion into children
3. Build flat map with computed paths (walk up parent chain)
4. Rate-limit: batch requests with small delays to respect Drive API quotas

**Search:** No custom search logic needed. The full `CachedFolder[]` array is passed to `FuzzySuggestModal`, which handles fuzzy matching.

**Lifecycle:**

- **Plugin load:** Auto-crawl all enabled roots in background
- **"Refresh" button:** Clear cache, re-crawl all enabled roots
- **Root added:** Crawl the new root only
- **Root removed:** Remove cached entries for that root

**Status:** Exposes crawl state (`idle | crawling | error`) for UI feedback.

**Scale:** ~1,000 folders completes in seconds. BFS with batching keeps larger trees manageable.

### 4. Attach Modal (`attachModal.ts`)

Lets the user fuzzy-search cached folders and attach one to the active note.

**Implementation:** Extends `FuzzySuggestModal<CachedFolder>`.

- `getItems()` — Returns full cached folder list
- `getItemText(item)` — Returns `item.name` for fuzzy matching
- `renderSuggestion(item, el)` — Folder name (bold) + path underneath (e.g., "Clients / Acme Corp")
- `onChooseItem(item)` — Calls `main.ts` to write frontmatter

**Empty states:**

- No roots configured: "No Drive roots configured. Open plugin settings to add roots."
- Cache loading: "Loading folder tree..."
- No results: "No folders found under configured roots."

**Existing attachment:** Shows "Currently attached: {name}" via `setInstructions()` if the note already has `googleDriveFolderId`.

### 5. Root Picker Modal (`rootPickerModal.ts`)

Two-step flow for adding root folders in settings.

**Step 1 — Drive selector:** `SuggestModal<DriveOption>`

- Fetches shared drives via `driveApi.listSharedDrives()`
- Presents them plus a "My Drive" option
- User picks one

**Step 2 — Folder search:** `FuzzySuggestModal<DriveFolder>`

- Live API search (not cached) within the selected drive using `files.list` with `name contains '<query>'` filtered to folders
- Debounced per-keystroke queries scoped to the selected drive
- On choose: adds folder as new root in settings, triggers cache crawl for it

### 6. Settings Tab (`settings.ts`)

**Three sections:**

**Google Drive Connection**

- Auth status: "Connected as user@example.com" or "Not connected"
- Client ID and Client Secret text fields (editable only when disconnected)
- Connect button (when disconnected) / Disconnect button (when connected)

**Search Root Folders**

- List of configured roots showing:
  - Folder name + drive context (e.g., "Clients — Shared Drive: DriveA")
  - Enable/disable toggle
  - Remove (trash) button
- "Add root folder" button — opens root picker modal (disabled if not connected)
- "Refresh folder tree" button — re-crawls all enabled roots, shows "Refreshing..." while active (disabled if not connected)

**Note Properties** (minimal for v1)

- Reserved for future settings. No user-facing controls in v1.

### 7. Main Plugin (`main.ts`)

Thin orchestrator wiring all modules together.

**`onload()`:**

1. Load settings from disk
2. Initialize `DriveApi` with stored credentials
3. Initialize `FolderCache` (empty)
4. Register settings tab
5. Register commands:
   - `attach-google-drive-folder` — open attach modal for active file
   - `open-google-drive-folder` — open attached folder in browser
6. Register file context menu items for both commands (`open` only shown when note has a folder attached)
7. Register custom property widget for `googleDriveFolderId` — renders as clickable "Open Google Drive Folder" link
8. If authenticated, trigger background folder tree crawl

**`onunload()`:** Clean up in-flight requests or crawl operations.

**Key methods:**

- `attachFolderToFile(file, folder)` — Uses `app.fileManager.processFrontMatter()` to set `googleDriveFolderId` and `googleDriveFolderName`
- `openAttachedFolder(file)` — Reads frontmatter, constructs URL (`https://drive.google.com/drive/folders/<id>`), opens browser
- `startAuthFlow()` — Delegates to `auth.ts`, stores tokens, refreshes settings tab
- `addRoot(folder)` — Adds to settings, triggers crawl
- `removeRoot(rootId)` — Removes from settings and cache

**Error handling:** All user-facing operations catch errors and show `Notice` messages (Obsidian's toast system). Auth failures prompt reconnection.

---

## Frontmatter Schema

Two properties per note (fixed keys, not configurable):

```yaml
---
googleDriveFolderId: "abc123def456"
googleDriveFolderName: "Acme Corp"
---
```

- No URL stored — constructed at runtime from the ID
- Users delete properties to unlink a folder (no explicit "unlink" command)
- Re-running the attach command replaces existing values

---

## User Access Points

### Opening an attached folder

1. **Custom property widget** — `googleDriveFolderId` renders as a clickable "Open Google Drive Folder" link in the Properties pane
2. **Command palette** — "Open attached Google Drive folder"
3. **File context menu** — "Open Google Drive folder" (only shown when note has a folder attached)

### Attaching a folder

1. **Command palette** — "Attach Google Drive folder..."
2. **File context menu** — "Attach Google Drive folder..."

---

## Settings Data Shape

```ts
interface PluginSettings {
  clientId: string;
  clientSecret: string;
  roots: DriveRoot[];
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: number | null;
  accountEmail: string | null;
}

interface DriveRoot {
  id: string;
  name: string;
  driveId: string | null;   // null for My Drive roots
  driveName: string | null;  // "My Drive" or shared drive name
  enabled: boolean;
}
```

---

## Edge Cases

- **No internet:** Error notice in modal, allow retry
- **Token revoked:** Detect 401, prompt reconnect via settings
- **Zero search results:** "No folders found under configured roots."
- **Deleted root in Drive:** Crawl returns nothing for that root; no error, just empty
- **Very large folder trees:** BFS with batched requests, no depth cap
- **Note without frontmatter:** `processFrontMatter()` creates the frontmatter block automatically

---

## Out of Scope (v1)

- Published OAuth credentials (users create their own)
- Configurable property key names
- Markdown link insertion in note body
- Bi-directional sync
- File picker (folders only)
- Per-search "search entire Drive" override
- Persistent folder tree cache on disk

---

## Google Cloud Setup (README documentation)

Users must create their own Google Cloud project with:

1. Enable the Google Drive API
2. Create OAuth 2.0 credentials (Application type: "Desktop app")
3. Add `http://127.0.0.1` to authorized redirect URIs
4. Copy Client ID and Client Secret into plugin settings

Detailed step-by-step instructions will be provided in the plugin README.
