# Contributing to Google Drive Folder Link

## Architecture

The plugin uses a layered module architecture with a linear data flow:

```
auth.ts → driveApi.ts → folderCache.ts → modals → frontmatter
```

| Module | Responsibility |
|--------|---------------|
| `src/auth.ts` | OAuth 2.0 desktop loopback flow, token refresh |
| `src/driveApi.ts` | Google Drive API v3 HTTP calls via Obsidian's `requestUrl` |
| `src/folderCache.ts` | BFS folder tree crawl, in-memory cache |
| `src/attachModal.ts` | `FuzzySuggestModal` for attaching folders to notes |
| `src/rootPickerModal.ts` | Two-step modal: drive selector + folder search |
| `src/settings.ts` | Plugin settings tab UI |
| `src/main.ts` | Plugin lifecycle, commands, context menus, orchestration |
| `src/types.ts` | Shared interfaces |

## Local Development

### Prerequisites

- Node.js 18+
- An Obsidian vault for testing
- Google Cloud project with OAuth credentials (see [README](README.md#setup))

### Setup

```bash
git clone git@github.com:andrewmarconi/GoogleDriveFolderLink.git
cd GoogleDriveFolderLink
npm install
```

### Build

```bash
# Development (watches for changes)
npm run dev

# Production (type-check + minified build)
npm run build
```

### Load into Obsidian

1. Create a folder in your test vault: `.obsidian/plugins/google-drive-folder-link/`
2. Copy (or symlink) these files into it:
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. In Obsidian, go to **Settings > Community plugins** and enable "Google Drive Folder Link"
4. Reload Obsidian after rebuilding (`Ctrl+R` / `Cmd+R`)

For faster iteration, symlink the files so rebuilds are picked up automatically:

```bash
VAULT_PATH="/path/to/your/vault"
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/google-drive-folder-link"
mkdir -p "$PLUGIN_DIR"
ln -sf "$(pwd)/main.js" "$PLUGIN_DIR/main.js"
ln -sf "$(pwd)/manifest.json" "$PLUGIN_DIR/manifest.json"
ln -sf "$(pwd)/styles.css" "$PLUGIN_DIR/styles.css"
```

## Key Design Decisions

**Single frontmatter property.** Notes store only `googleDriveFolderUrl`. Obsidian renders URLs as clickable links in the Properties pane natively, so no custom property widget is needed. The folder ID can be parsed from the URL when required internally.

**In-memory folder cache.** The folder tree is crawled via BFS on plugin load and stored in a flat `Map<string, CachedFolder>`. No persistent cache on disk — keeps storage clean and avoids stale data. Users can manually refresh via the settings tab.

**Desktop loopback OAuth.** The plugin spins up a temporary local HTTP server on a random port to receive the OAuth callback. Each user provides their own Google Cloud credentials. This avoids the need for a hosted auth proxy or Google's OAuth app verification process.

**User email via Drive API.** The connected account email is fetched from the Drive API `about` endpoint (`/drive/v3/about?fields=user`) rather than the userinfo endpoint. This avoids requiring an additional OAuth scope beyond `drive.readonly`.

## Project Structure

```
├── src/
│   ├── main.ts            # Plugin entrypoint and orchestrator
│   ├── auth.ts            # OAuth 2.0 loopback authentication
│   ├── driveApi.ts        # Google Drive API v3 wrapper
│   ├── folderCache.ts     # BFS folder tree crawl and cache
│   ├── attachModal.ts     # Fuzzy search modal for attaching folders
│   ├── rootPickerModal.ts # Two-step root folder picker
│   ├── settings.ts        # Plugin settings tab
│   └── types.ts           # Shared TypeScript interfaces
├── docs/
│   ├── prd.md             # Product requirements document
│   └── superpowers/
│       ├── specs/         # Design specifications
│       └── plans/         # Implementation plans
├── manifest.json          # Obsidian plugin manifest
├── styles.css             # Plugin styles
├── esbuild.config.mjs     # Build configuration
└── tsconfig.json          # TypeScript configuration
```
