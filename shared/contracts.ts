import type defaultConfig from './default-config.json';

export type GameId = keyof typeof defaultConfig.games;

export type CatalogSearchField = 'all' | 'name' | 'author';
export type CatalogSort = 'relevance' | 'updated' | 'newest' | 'downloads' | 'endorsements';

export interface CatalogFilters {
  searchIn: CatalogSearchField;
  category: string;
  sort: CatalogSort;
}

export interface CatalogSearch extends CatalogFilters {
  gameId: GameId;
  query: string;
  page: number;
  refresh?: boolean;
}

export interface CatalogMod {
  id: string;
  name: string;
  author?: string;
  version?: string;
  summary?: string;
  thumbnailUrl?: string;
  category: string;
  downloads: number;
  endorsements: number;
  adult: boolean;
  url: string;
}

export interface CatalogResults {
  mods: CatalogMod[];
  categories: string[];
  totalCount: number;
  hasNextPage: boolean;
  freshness: 'live' | 'cached';
  fetchedAt: string;
  rateLimitedUntil?: string;
}

export type CatalogReply = CatalogResults | { rateLimitedUntil: string };

export type ArchiveInstallResult = { success: boolean; modId?: string; error?: string; cancelled?: boolean; warnings?: string[] };
export interface ArchiveInstallOptions {
  replaceId?: string;
  nexusUrl?: string;
  version?: string;
}

export interface ModUpdate {
  modId: string;
  nexusModId: number;
  installedVersion: string;
  latestVersion: string;
  status: 'available' | 'current' | 'ahead' | 'different';
  missingRequirements: number;
  reviewRequirements: boolean;
}

export interface UpdateResults {
  items: ModUpdate[];
  eligible: number;
  retryAt?: string;
}

export interface Mod {
  id: string;
  source: 'local' | 'workshop';
  folderName: string;
  name: string;
  version: string;
  author: string;
  description: string;
  fullDescription: string;
  category: string;
  path: string;
  enabled: boolean | null;
  hasConfig: boolean;
  hasReadme: boolean;
  fileCount: number;
  nexusUrl: string;
  nexusModId?: number;
  workshopUrl?: string;
}

export interface GameConfig {
  id: GameId;
  name: string;
  appId: string;
  exeName: string;
  gamePath: string;
  modsPath: string;
  fallbackModsPath: string;
  baseModInstalled: boolean;
  enabledModIds: string[];
}

export interface AppConfig {
  activeGame: GameId;
  activeProfile: string;
  profiles: string[];
  games: Record<GameId, GameConfig>;
}

export interface ConfigPatch {
  activeGame?: GameId;
  games?: Partial<Record<GameId, { gamePath?: string; modsPath?: string }>>;
}

export interface AtelierApi {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  getConfig: () => Promise<AppConfig>;
  saveConfig: (patch: ConfigPatch) => Promise<AppConfig>;
  detectGames: () => Promise<AppConfig>;
  saveProfile: (gameId: GameId, name: string) => Promise<AppConfig>;
  activateProfile: (gameId: GameId, name: string) => Promise<AppConfig>;
  searchCatalog: (request: CatalogSearch) => Promise<CatalogReply>;
  getMods: (gameId: GameId) => Promise<Mod[]>;
  getModPreviews: (gameId: GameId, modId: string) => Promise<string[]>;
  checkUpdates: (gameId: GameId) => Promise<UpdateResults>;
  saveModDetails: (gameId: GameId, modId: string, details: { nexusUrl: string; version: string }) => Promise<void>;
  toggleMod: (gameId: GameId, modId: string, enable: boolean) => Promise<Mod[] | false>;
  deleteMod: (gameId: GameId, modId: string) => Promise<Mod[] | false>;
  openModFolder: (gameId: GameId, modId?: string) => Promise<boolean>;
  installModArchive: (gameId: GameId, filePath: string, options?: ArchiveInstallOptions) => Promise<ArchiveInstallResult>;
  installDroppedModArchive: (gameId: GameId, file: File, options?: ArchiveInstallOptions) => Promise<ArchiveInstallResult>;
  selectModArchive: () => Promise<string | null>;
  selectDirectory: () => Promise<string | null>;
  launchGame: (gameId: GameId, modded: boolean) => Promise<string>;
  openExternal: (url: string) => Promise<void>;
}
