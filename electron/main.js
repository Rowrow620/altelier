const { app, BrowserWindow, ipcMain, dialog, Menu, nativeImage, shell, Tray } = require('electron');
const path = require('path');
const { createConfigStore } = require('./config/store');
const { createInstallService } = require('./install/service');
const { registerIpc, externalUrl } = require('./ipc/register');
const { createCatalogService } = require('./catalog/service');
const { searchNexus, lookupNexusReleases, getNexusModFiles, createNexusRequest } = require('./catalog/nexus');
const { createDownloadService } = require('./catalog/download');
const { createGameService, getModsDirectory, isNativeModsDirectory, installWarnings } = require('./games/service');
const { createLibrary } = require('./library/scan');
const { createProfileService } = require('./library/profiles');
const { createUpdateService } = require('./library/updates');
const { createDiagnosticsService } = require('./library/diagnostics');
const { createBackupService } = require('./library/backups');
const { createLoadOrderService } = require('./library/loadOrder');
const { syncTweaks, hasActiveTweaks } = require('./library/tweaks');

const isDevelopment = process.env.NODE_ENV === 'development';
const debugLogging = isDevelopment || process.argv.includes('--atelier-debug');

let mainWindow;
let tray;

// Default paths & config
const userDataPath = app.getPath('userData');
const configFilePath = path.join(userDataPath, 'atelier-config.json');
const nexusRequest = createNexusRequest();
const searchCatalog = createCatalogService({
  cachePath: path.join(userDataPath, 'atelier-catalog-v2.json'),
  search: (request) => searchNexus(request, nexusRequest),
});

const store = createConfigStore(configFilePath);
const gameService = createGameService({ store });
const rendererFile = path.join(__dirname, '..', 'dist', 'index.html');
const iconPath = path.join(__dirname, '..', 'src', 'assets', 'app-icon.png');
const devUrl = isDevelopment ? 'http://localhost:5173' : undefined;
const installer = createInstallService({
  store,
  getGameModsDir: getModsDirectory,
  installWarnings,
  activation: () => 'native',
  confirmReplace: async (name) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Replace mod?',
      message: 'Replace "' + name + '"?',
      detail: 'The existing mod will be replaced after the ZIP has been checked.',
      buttons: ['Cancel', 'Replace'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    return result.response === 1;
  },
});
const library = createLibrary({ store, workshopDirectories: gameService.workshopDirectories, localFolder: installer.folder });
const profiles = createProfileService({
  store, installer, journalPath: path.join(userDataPath, 'atelier-profile-switch.json'),
});
const checkUpdates = createUpdateService({
  store, library, lookup: (gameId, ids) => lookupNexusReleases(gameId, ids, nexusRequest),
});
const diagnostics = createDiagnosticsService({
  store,
  installer,
  workshopDirectories: gameService.workshopDirectories,
});
const backups = createBackupService({ backupsRoot: path.join(userDataPath, 'save-backups') });
const loadOrder = createLoadOrderService({ store });
const catalogFiles = (gameId, modId) => getNexusModFiles(gameId, modId, nexusRequest);
const downloadCatalogMod = createDownloadService({ store, installer, nexusRequest }).downloadAndInstall;

function createWindow(icon) {
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 840,
    minWidth: 1000,
    minHeight: 680,
    frame: false,
    backgroundColor: '#09090b',
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (debugLogging) {
    mainWindow.webContents.on('console-message', ({ level, message }) => {
      console.log(`[Renderer ${level}]`, message);
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      void shell.openExternal(externalUrl(url)).catch((error) => console.warn(error.message));
    } catch (error) {
      console.warn('Blocked external link:', error.message);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-frame-navigate', (event) => event.preventDefault());

  if (isDevelopment) {
    mainWindow.loadURL(devUrl).catch(() => {
      mainWindow.loadFile(rendererFile);
    });
  } else {
    mainWindow.loadFile(rendererFile);
  }
}

function focusWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusWindow);
  app.whenReady().then(() => {
    const icon = nativeImage.createFromPath(iconPath);
    createWindow(icon);

    if (process.platform === 'win32' && !icon.isEmpty()) {
      tray = new Tray(icon);
      tray.setToolTip('Atelier Mod Manager');
      tray.on('click', focusWindow);
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open Atelier', click: focusWindow },
        { label: 'Quit', click: () => app.quit() },
      ]));
      app.once('before-quit', () => tray.destroy());
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(icon);
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

registerIpc({
  ipcMain, getWindow: () => mainWindow, rendererFile, devUrl,
  store, installer, gameService, library, profiles, checkUpdates, searchCatalog,
  catalogFiles, downloadCatalogMod, diagnostics, backups, loadOrder, syncTweaks, hasActiveTweaks, dialog, shell,
});
