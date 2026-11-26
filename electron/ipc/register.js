const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { validateGameId, validateName } = require('../files/paths');

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

function externalUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Invalid link.');
  const url = new URL(value);
  const nexus = ['www.nexusmods.com', 'nexusmods.com'].includes(url.hostname);
  const workshop = url.hostname === 'steamcommunity.com' && url.pathname === '/sharedfiles/filedetails/' &&
    /^\?id=\d{1,20}$/.test(url.search) && !url.hash;
  const github = url.hostname === 'github.com' && /^\/Rowrow620\/altelier\/?$/.test(url.pathname) &&
    !url.search && !url.hash;
  if (url.protocol !== 'https:' || url.username || url.password || url.port || (!nexus && !workshop && !github)) {
    throw new Error('Only Nexus Mods, Steam Workshop, and the Atelier GitHub links can be opened here.');
  }
  return url.href;
}

function registerIpc({
  ipcMain, getWindow, rendererFile, devUrl, store, installer,
  gameService, library, profiles, checkUpdates, searchCatalog, catalogFiles, downloadCatalogMod, diagnostics, backups, dialog, shell,
}) {
  const selectedArchives = new Set();
  const selectedDirectories = new Set();
  const handle = (channel, action) => ipcMain.handle(channel, (event, input) => {
    if (!trustedSender(event, getWindow(), rendererFile, devUrl)) throw new Error('Untrusted app message.');
    if (/^(?:config:|mods:|games:detect$|game:launch$)/.test(channel)) profiles?.recover();
    return action(input);
  });

  handle('window:minimize', () => getWindow().minimize());
  handle('window:maximize', () => {
    const window = getWindow();
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  handle('window:close', () => getWindow().close());
  handle('config:get', () => gameService.detectConfig());
  handle('config:save', async (patch) => {
    if (patch?.activeProfile !== undefined) throw new Error('Use the profile selector to change profiles.');
    if (installer.isBusy() && patch?.games) throw new Error('Wait for the current mod operation before changing folders.');
    const current = store.read();
    const changes = [];
    for (const [id, fields] of Object.entries(patch?.games ?? {})) {
      validateGameId(id);
      for (const field of ['gamePath', 'modsPath']) {
        const value = fields?.[field];
        if (value && value !== current.games[id][field] && !selectedDirectories.has(value)) {
          changes.push(value);
        }
      }
    }
    if (changes.length) {
      const decision = await dialog.showMessageBox(getWindow(), {
        type: 'question', title: 'Change folders?', message: 'Use these folders?',
        detail: changes.join('\n'), buttons: ['Cancel', 'Use folders'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (decision.response !== 1) throw new Error('Folder changes cancelled.');
    }
    if (installer.isBusy() && patch?.games) throw new Error('Wait for the current mod operation before changing folders.');
    return store.patch(patch);
  });
  handle('games:detect', () => {
    if (installer.isBusy()) throw new Error('Wait for the current mod operation before detecting games.');
    return gameService.detectConfig();
  });
  handle('catalog:search', searchCatalog);
  handle('catalog:files', (input) => {
    const gameId = validateGameId(input?.gameId);
    return catalogFiles(gameId, input?.modId);
  });
  handle('catalog:download', (input) => downloadCatalogMod({
    gameId: input?.gameId,
    modId: input?.modId,
    fileId: input?.fileId,
    fileName: input?.fileName,
    nexusUrl: input?.nexusUrl ? externalUrl(input.nexusUrl) : undefined,
    version: input?.version,
  }));
  handle('profiles:save', (input) => profiles.save(input?.name, input?.gameId));
  handle('profiles:activate', (input) => profiles.activate(input?.name, input?.gameId));
  handle('profiles:delete', async (input) => {
    const decision = await dialog.showMessageBox(getWindow(), {
      type: 'warning', title: 'Delete profile?', message: `Delete profile "${input?.name}"?`,
      buttons: ['Cancel', 'Delete'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (decision.response !== 1) return store.read();
    return profiles.remove(input?.name, input?.gameId);
  });
  handle('profiles:export', async (input) => {
    const data = profiles.exportData(input?.gameId, input?.name);
    const safeName = `${data.gameId}-${data.profile.replace(/[^a-z0-9-_]+/gi, '_')}.json`;
    const result = await dialog.showSaveDialog(getWindow(), {
      title: 'Export profile',
      defaultPath: safeName,
      filters: [{ name: 'JSON files', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  });
  handle('profiles:import', async (gameId) => {
    const id = validateGameId(gameId);
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Import profile',
      filters: [{ name: 'JSON files', extensions: ['json'] }],
      properties: ['openFile'],
    });
    const file = result.canceled ? null : result.filePaths[0] ?? null;
    if (!file) return null;
    const raw = fs.readFileSync(file, 'utf8');
    if (raw.length > 4 * 1024 * 1024) throw new Error('Profile file is too large.');
    return profiles.importData(id, JSON.parse(raw));
  });
  handle('mods:check-updates', (gameId) => {
    validateGameId(gameId);
    if (installer.isBusy()) throw new Error('Wait for the current mod operation to finish.');
    installer.recover(gameId);
    return checkUpdates(gameId);
  });
  handle('mods:save-details', (input) => installer.saveDetails(input?.gameId, input?.modId, input?.details));
  handle('mods:read-config', (input) => installer.readConfigText(input?.gameId, input?.modId));
  handle('mods:save-config', (input) => installer.saveConfigText(input?.gameId, input?.modId, input?.content));
  handle('mods:get', (gameId) => {
    validateGameId(gameId);
    installer.recover(gameId);
    return library.scan(store.read().games[gameId]);
  });
  handle('mods:toggle', (input) => {
    const gameId = validateGameId(input?.gameId);
    if (typeof input?.enable !== 'boolean') throw new Error('Invalid enabled state.');
    if (typeof input?.modId === 'string' && input.modId.startsWith('workshop:')) {
      const workshopId = input.modId.slice('workshop:'.length);
      if (!/^\d{1,20}$/.test(workshopId)) throw new Error('Invalid Workshop item.');
      store.update((next) => {
        const list = next.games[gameId].disabledWorkshopIds ?? [];
        next.games[gameId].disabledWorkshopIds = input.enable
          ? list.filter((id) => id !== workshopId)
          : [...new Set([...list, workshopId])];
      });
    } else {
      installer.toggle(gameId, input?.modId, input.enable);
    }
    return library.scan(store.read().games[gameId]);
  });
  handle('mods:toggle-all', (input) => {
    const gameId = validateGameId(input?.gameId);
    if (typeof input?.enable !== 'boolean') throw new Error('Invalid enabled state.');
    installer.toggleAll(gameId, input.enable);
    const game = store.read().games[gameId];
    const workshopIds = library.scan(game).filter((mod) => mod.source === 'workshop')
      .map((mod) => mod.id.slice('workshop:'.length));
    if (workshopIds.length || (game.disabledWorkshopIds?.length && input.enable)) {
      store.update((next) => {
        next.games[gameId].disabledWorkshopIds = input.enable ? [] : workshopIds;
      });
    }
    return library.scan(store.read().games[gameId]);
  });
  handle('diagnostics:get', (gameId) => {
    validateGameId(gameId);
    installer.recover(gameId);
    return diagnostics.analyze(gameId);
  });
  handle('diagnostics:fix', (input) => diagnostics.fixIssue(input?.gameId, input?.issueId));
  handle('diagnostics:clean-temp', (gameId) => diagnostics.cleanTempFolders(gameId));
  handle('backups:list', (gameId) => backups.list(gameId));
  handle('backups:create', (input) => backups.create(input?.gameId, input?.label));
  handle('backups:restore', async (input) => {
    const decision = await dialog.showMessageBox(getWindow(), {
      type: 'warning',
      title: 'Restore save backup?',
      message: 'Replace current save data with this backup?',
      detail: 'A backup of the current save folder will be created automatically first.',
      buttons: ['Cancel', 'Restore'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (decision.response !== 1) return backups.list(input?.gameId);
    return backups.restore(input?.gameId, input?.backupId);
  });
  handle('mods:delete', async (input) => {
    const directory = installer.folder(input?.gameId, input?.modId);
    validateName(input?.modId);
    const decision = await dialog.showMessageBox(getWindow(), {
      type: 'warning', title: 'Delete mod?', message: 'Delete "' + input.modId + '"?',
      detail: directory, buttons: ['Cancel', 'Delete'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (decision.response !== 1) return false;
    if (installer.folder(input.gameId, input.modId) !== directory) throw new Error('The mods folder changed. Try deleting the mod again.');
    installer.deleteMod(input?.gameId, input?.modId);
    return library.scan(store.read().games[input.gameId]);
  });
  handle('mods:open-folder', async (input) => {
    validateGameId(input?.gameId);
    const directory = library.folder(input.gameId, input.modId);
    const error = await shell.openPath(directory);
    if (error) throw new Error(error);
    return true;
  });
  handle('mods:previews', (input) => {
    validateGameId(input?.gameId);
    if (typeof input.modId !== 'string') throw new Error('Choose an installed mod.');
    return library.previews(input.gameId, input.modId);
  });
  handle('mods:install-archive', (input) => {
    if (!selectedArchives.has(input?.filePath)) throw new Error('Choose the ZIP file before importing it.');
    return installer.install(input?.gameId, input?.filePath, input?.options);
  });
  // This channel is exposed only through the preload's native File conversion.
  handle('mods:install-dropped', (input) => installer.install(input?.gameId, input?.filePath, input?.options));
  handle('dialog:select-archive', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Choose ZIP', filters: [{ name: 'ZIP files', extensions: ['zip'] }], properties: ['openFile'],
    });
    const file = result.canceled ? null : result.filePaths[0] ?? null;
    if (file) selectedArchives.add(file);
    return file;
  });
  handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog(getWindow(), { title: 'Choose folder', properties: ['openDirectory'] });
    const directory = result.canceled ? null : result.filePaths[0] ?? null;
    if (directory) selectedDirectories.add(directory);
    return directory;
  });
  handle('game:launch', async (input) => {
    validateGameId(input?.gameId);
    if (typeof input.modded !== 'boolean') throw new Error('Invalid launch mode.');
    return gameService.launch(input.gameId, input.modded, installer.prepareLaunch);
  });
  handle('shell:open-external', async (url) => {
    await shell.openExternal(externalUrl(url));
  });
}

module.exports = { registerIpc, trustedSender, externalUrl };
