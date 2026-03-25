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
