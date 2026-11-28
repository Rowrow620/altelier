const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { registerModIpc } = require('./mods');
const { registerProfileIpc } = require('./profiles');
const { registerSystemIpc } = require('./system');

function trustedSender(event, window, rendererFile, devUrl) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame) return false;
  try {
    const url = new URL(event.senderFrame.url);
    if (devUrl && url.origin === new URL(devUrl).origin) return url.pathname === '/';
    url.hash = '';
    url.search = '';
    return url.protocol === 'file:' && path.resolve(fileURLToPath(url)) === path.resolve(rendererFile);
  } catch {
    return false;
  }
}

function externalUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid external link.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Blocked external link.');
  }
  const host = url.hostname.toLowerCase();
  if (host === 'nexusmods.com' || host.endsWith('.nexusmods.com')) {
    return url.toString();
  }
  if (host === 'github.com' && (url.pathname === '/Rowrow620/altelier' || url.pathname.startsWith('/Rowrow620/altelier/'))) {
    return url.toString();
  }
  if (host === 'steamcommunity.com' && url.pathname === '/sharedfiles/filedetails/' &&
      url.searchParams.size === 1 && /^\d{1,20}$/.test(url.searchParams.get('id') ?? '')) {
    return url.toString();
  }
  throw new Error('Blocked untrusted external host.');
}

function registerIpc({
  ipcMain, getWindow, rendererFile, devUrl,
  store, installer, gameService, library, profiles, checkUpdates, searchCatalog,
  catalogFiles, downloadCatalogMod, diagnostics, backups, loadOrder, readGameLogs,
  checkAppUpdate, syncTweaks, hasActiveTweaks, dialog, shell,
}) {
  const selectedArchives = new Set();
  const selectedDirectories = new Set();
  const handle = (channel, action) => ipcMain.handle(channel, (event, input) => {
    if (!trustedSender(event, getWindow(), rendererFile, devUrl)) throw new Error('Untrusted app message.');
    if (/^(?:config:|mods:|games:detect$|game:launch$)/.test(channel)) profiles?.recover();
    return action(input);
  });

  registerSystemIpc({
    handle, getWindow, store, installer, gameService, diagnostics, backups,
    loadOrder, readGameLogs, checkAppUpdate, syncTweaks, hasActiveTweaks,
    selectedArchives, selectedDirectories, dialog, shell, externalUrl,
  });
  registerProfileIpc({ handle, getWindow, store, profiles, dialog });
  registerModIpc({
    handle, getWindow, store, installer, library, checkUpdates,
    searchCatalog, catalogFiles, downloadCatalogMod, selectedArchives, dialog, shell,
  });
}

module.exports = { registerIpc, trustedSender, externalUrl };
