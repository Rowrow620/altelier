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
  saveProfile: (gameId, name) => ipcRenderer.invoke('profiles:save', { gameId, name }),
  activateProfile: (gameId, name) => ipcRenderer.invoke('profiles:activate', { gameId, name }),

  // Mods
  getMods: (gameId) => ipcRenderer.invoke('mods:get', gameId),
  getModPreviews: (gameId, modId) => ipcRenderer.invoke('mods:previews', { gameId, modId }),
  checkUpdates: (gameId) => ipcRenderer.invoke('mods:check-updates', gameId),
  saveModDetails: (gameId, modId, details) => ipcRenderer.invoke('mods:save-details', { gameId, modId, details }),
  toggleMod: (gameId, modId, enable) => ipcRenderer.invoke('mods:toggle', { gameId, modId, enable }),
  deleteMod: (gameId, modId) => ipcRenderer.invoke('mods:delete', { gameId, modId }),
  openModFolder: (gameId, modId) => ipcRenderer.invoke('mods:open-folder', { gameId, modId }),
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
