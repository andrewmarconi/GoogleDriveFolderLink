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

// Google API response shapes (used to type requestUrl().json)
export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface GoogleAboutResponse {
  user?: { emailAddress?: string };
}

export interface GoogleDriveListResponse {
  nextPageToken?: string;
  drives?: { id: string; name: string }[];
}

export interface GoogleFileListResponse {
  nextPageToken?: string;
  files?: { id: string; name: string; parents?: string[] }[];
}

export interface GoogleFileMetadataResponse {
  id: string;
  name: string;
  parents?: string[];
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
