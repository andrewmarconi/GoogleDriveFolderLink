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
