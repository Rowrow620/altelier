// @ts-check
const { contextBridge, ipcRenderer, webUtils } = require('electron');

/** @type {import('../shared/contracts').AtelierApi} */
const atelierApi = {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Game & Settings
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  detectGames: () => ipcRenderer.invoke('games:detect'),

  searchCatalog: (request) => ipcRenderer.invoke('catalog:search', request),
  getCatalogFiles: (gameId, modId) => ipcRenderer.invoke('catalog:files', { gameId, modId }),
  downloadCatalogMod: (input) => ipcRenderer.invoke('catalog:download', input),
  saveProfile: (gameId, name) => ipcRenderer.invoke('profiles:save', { gameId, name }),
  activateProfile: (gameId, name) => ipcRenderer.invoke('profiles:activate', { gameId, name }),
  deleteProfile: (gameId, name) => ipcRenderer.invoke('profiles:delete', { gameId, name }),
  exportProfile: (gameId, name) => ipcRenderer.invoke('profiles:export', { gameId, name }),
  importProfile: (gameId) => ipcRenderer.invoke('profiles:import', gameId),

  // Mods
  getMods: (gameId) => ipcRenderer.invoke('mods:get', gameId),
  getModPreviews: (gameId, modId) => ipcRenderer.invoke('mods:previews', { gameId, modId }),
  readModConfig: (gameId, modId) => ipcRenderer.invoke('mods:read-config', { gameId, modId }),
  saveModConfig: (gameId, modId, content) => ipcRenderer.invoke('mods:save-config', { gameId, modId, content }),
  checkUpdates: (gameId) => ipcRenderer.invoke('mods:check-updates', gameId),
  saveModDetails: (gameId, modId, details) => ipcRenderer.invoke('mods:save-details', { gameId, modId, details }),
  toggleMod: (gameId, modId, enable) => ipcRenderer.invoke('mods:toggle', { gameId, modId, enable }),
  toggleAllMods: (gameId, enable) => ipcRenderer.invoke('mods:toggle-all', { gameId, enable }),
  deleteMod: (gameId, modId) => ipcRenderer.invoke('mods:delete', { gameId, modId }),
  deleteMods: (gameId, modIds) => ipcRenderer.invoke('mods:delete-many', { gameId, modIds }),
  openModFolder: (gameId, modId) => ipcRenderer.invoke('mods:open-folder', { gameId, modId }),
  getDiagnostics: (gameId) => ipcRenderer.invoke('diagnostics:get', gameId),
  fixCompatibilityIssue: (gameId, issueId) => ipcRenderer.invoke('diagnostics:fix', { gameId, issueId }),
  cleanTempFolders: (gameId) => ipcRenderer.invoke('diagnostics:clean-temp', gameId),
  installBaseMod: (filePath) => ipcRenderer.invoke('diagnostics:install-basemod', filePath),
  getSaveBackups: (gameId) => ipcRenderer.invoke('backups:list', gameId),
  createSaveBackup: (gameId, label) => ipcRenderer.invoke('backups:create', { gameId, label }),
  restoreSaveBackup: (gameId, backupId) => ipcRenderer.invoke('backups:restore', { gameId, backupId }),
  deleteSaveBackup: (gameId, backupId) => ipcRenderer.invoke('backups:delete', { gameId, backupId }),
  getLoadOrder: (gameId) => ipcRenderer.invoke('load-order:get', gameId),
  saveLoadOrder: (gameId, orders) => ipcRenderer.invoke('load-order:save', { gameId, orders }),
  getGameLogs: (gameId) => ipcRenderer.invoke('logs:get', gameId),
  checkAppUpdate: () => ipcRenderer.invoke('app:check-update'),
  installModArchive: (gameId, filePath, options) => ipcRenderer.invoke('mods:install-archive', { gameId, filePath, options }),
  installDroppedModArchive: (gameId, file, options) => {
    const filePath = webUtils.getPathForFile(file);
    if (!filePath || !filePath.toLowerCase().endsWith('.zip')) {
      return Promise.resolve({ success: false, error: 'Choose a .zip file.' });
    }
    return ipcRenderer.invoke('mods:install-dropped', { gameId, filePath, options });
  },
  selectModArchive: () => ipcRenderer.invoke('dialog:select-archive'),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),

  // Launching
  launchGame: (gameId, modded) => ipcRenderer.invoke('game:launch', { gameId, modded }),
  
  // Open external links
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
};

contextBridge.exposeInMainWorld('atelierApi', atelierApi);
