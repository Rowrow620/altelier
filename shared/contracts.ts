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
  modId: number;
  name: string;
  author?: string;
  version?: string;
  summary?: string;
  description?: string;
  thumbnailUrl?: string;
  category: string;
  downloads: number;
  endorsements: number;
  adult: boolean;
  url: string;
}

export interface CatalogModFile {
  fileId: number;
  name: string;
  version: string;
  sizeInBytes: number;
  category: string;
  description?: string;
  uploadedAt?: string;
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

export interface GameplayTweaks {
  SpeedMultiplier?: number;
  UnlimitedLob?: boolean;
  KeepAgentsForever?: boolean;
  UnlimitedEgo?: boolean;
  UnlockAllEgos?: boolean;
  NoGrindBooks?: boolean;
  NoGrindBurnCards?: boolean;
  NoGrindAmount?: number;
  MultiplePurpleBooks?: boolean;
  MultipleGoldBooks?: boolean;
  MultipleCommonBooks?: boolean;
  KeyPageLimit?: number;
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
  disabledWorkshopIds: string[];
  launchArgs: string[];
  tweaks: GameplayTweaks;
}

export interface ModConflict {
  path: string;
  mods: string[];
}

export interface StorageSummary {
  enabledCount: number;
  enabledBytes: number;
  disabledCount: number;
  disabledBytes: number;
  tempCount: number;
  tempBytes: number;
}

export interface BaseModInfo {
  status: 'ok' | 'missing' | 'outdated' | 'legacy-patch';
  loaderName: string;
  version: string;
  harmonyVersion: string;
  details: string;
  nexusUrl: string;
}

export interface CompatibilityIssue {
  id: string;
  modName: string;
  severity: 'warning';
  message: string;
  fixable: boolean;
  fixLabel?: string;
}

export interface GameDiagnostics {
  gameId: GameId;
  validInstall: boolean;
  modsPath: string;
  isNativeModsDir: boolean;
  baseModInstalled: boolean;
  baseMod: BaseModInfo;
  compatibility: CompatibilityIssue[];
  issues: string[];
  conflicts: ModConflict[];
  storage: StorageSummary;
}

export interface LoadOrderState {
  gameId: GameId;
  available: boolean;
  sourcePath: string;
  orders: string[];
  activeIds: string[];
}

export interface SaveBackupEntry {
  id: string;
  gameId: GameId;
  label: string;
  createdAt: string;
  fileCount: number;
  totalBytes: number;
}

export interface SaveBackupsState {
  gameId: GameId;
  savePath: string;
  saveExists: boolean;
  backups: SaveBackupEntry[];
}

export interface AppConfig {
  activeGame: GameId;
  activeProfile: string;
  nexusApiKey: string;
  profiles: string[];
  games: Record<GameId, GameConfig>;
}

export interface ConfigPatch {
  activeGame?: GameId;
  nexusApiKey?: string;
  games?: Partial<Record<GameId, { gamePath?: string; modsPath?: string; launchArgs?: string[]; tweaks?: GameplayTweaks }>>;
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
  deleteProfile: (gameId: GameId, name: string) => Promise<AppConfig>;
  exportProfile: (gameId: GameId, name: string) => Promise<boolean>;
  importProfile: (gameId: GameId) => Promise<AppConfig | null>;
  searchCatalog: (request: CatalogSearch) => Promise<CatalogReply>;
  getCatalogFiles: (gameId: GameId, modId: number) => Promise<CatalogModFile[]>;
  downloadCatalogMod: (input: { gameId: GameId; modId: number; fileId: number; fileName?: string; nexusUrl: string; version?: string }) => Promise<ArchiveInstallResult>;
  getMods: (gameId: GameId) => Promise<Mod[]>;
  getModPreviews: (gameId: GameId, modId: string) => Promise<string[]>;
  readModConfig: (gameId: GameId, modId: string) => Promise<string>;
  saveModConfig: (gameId: GameId, modId: string, content: string) => Promise<void>;
  checkUpdates: (gameId: GameId) => Promise<UpdateResults>;
  saveModDetails: (gameId: GameId, modId: string, details: { nexusUrl: string; version: string }) => Promise<void>;
  toggleMod: (gameId: GameId, modId: string, enable: boolean) => Promise<Mod[] | false>;
  toggleAllMods: (gameId: GameId, enable: boolean) => Promise<Mod[] | false>;
  deleteMod: (gameId: GameId, modId: string) => Promise<Mod[] | false>;
  openModFolder: (gameId: GameId, modId?: string) => Promise<boolean>;
  getDiagnostics: (gameId: GameId) => Promise<GameDiagnostics>;
  fixCompatibilityIssue: (gameId: GameId, issueId: string) => Promise<GameDiagnostics>;
  cleanTempFolders: (gameId: GameId) => Promise<GameDiagnostics>;
  getSaveBackups: (gameId: GameId) => Promise<SaveBackupsState>;
  createSaveBackup: (gameId: GameId, label?: string) => Promise<SaveBackupsState>;
  restoreSaveBackup: (gameId: GameId, backupId: string) => Promise<SaveBackupsState>;
  getLoadOrder: (gameId: GameId) => Promise<LoadOrderState>;
  saveLoadOrder: (gameId: GameId, orders: string[]) => Promise<LoadOrderState>;
  installModArchive: (gameId: GameId, filePath: string, options?: ArchiveInstallOptions) => Promise<ArchiveInstallResult>;
  installDroppedModArchive: (gameId: GameId, file: File, options?: ArchiveInstallOptions) => Promise<ArchiveInstallResult>;
  selectModArchive: () => Promise<string | null>;
  selectDirectory: () => Promise<string | null>;
  launchGame: (gameId: GameId, modded: boolean) => Promise<string>;
  openExternal: (url: string) => Promise<void>;
}
