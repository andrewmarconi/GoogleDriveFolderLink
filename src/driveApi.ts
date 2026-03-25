import { requestUrl } from "obsidian";
import type { DriveFolder, DriveInfo } from "./types";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

function validateDriveId(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid Drive ID: ${id}`);
  }
  return id;
}

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
  const q = `mimeType='application/vnd.google-apps.folder' and '${validateDriveId(parentId)}' in parents and trashed=false`;

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
    url: `${DRIVE_API_BASE}/files/${validateDriveId(folderId)}?${params}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.json;
}

export function buildFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
