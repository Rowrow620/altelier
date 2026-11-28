const { validateGameId, validateName } = require('../files/paths');

function registerModIpc({
  handle, getWindow, store, installer, library, checkUpdates,
  searchCatalog, catalogFiles, downloadCatalogMod, selectedArchives, dialog, shell,
}) {
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
    nexusUrl: input?.nexusUrl,
    version: input?.version,
  }));
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
    if (typeof input.modId !== 'string') throw new Error('Choose an installed mod.');
    if (input.modId.startsWith('workshop:')) {
      const workshopId = input.modId.slice('workshop:'.length);
      if (!/^\d{1,20}$/.test(workshopId)) throw new Error('Invalid Workshop item.');
      store.update((next) => {
        const disabled = new Set(next.games[gameId].disabledWorkshopIds);
        if (input.enable) disabled.delete(workshopId);
        else disabled.add(workshopId);
        next.games[gameId].disabledWorkshopIds = [...disabled];
      });
    } else {
      installer.toggle(gameId, input.modId, input.enable);
    }
    return library.scan(store.read().games[gameId]);
  });
  handle('mods:toggle-all', (input) => {
    const gameId = validateGameId(input?.gameId);
    installer.toggleAll(gameId, input?.enable);
    return library.scan(store.read().games[gameId]);
  });
  handle('mods:delete', async (input) => {
    const directory = installer.folder(input?.gameId, input?.modId);
    validateName(input?.modId);
    const decision = await dialog.showMessageBox(getWindow(), {
      type: 'warning',
      title: 'Delete mod?',
      message: 'Delete "' + input.modId + '"?',
      detail: directory,
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (decision.response !== 1) return false;
    if (installer.folder(input.gameId, input.modId) !== directory) throw new Error('The mods folder changed. Try deleting the mod again.');
    installer.deleteMod(input?.gameId, input?.modId);
    return library.scan(store.read().games[input.gameId]);
  });
  handle('mods:delete-many', async (input) => {
    const gameId = validateGameId(input?.gameId);
    if (!Array.isArray(input?.modIds) || input.modIds.length === 0 || input.modIds.length > 500) {
      throw new Error('Choose one or more mods to delete.');
    }
    const cleanIds = [...new Set(input.modIds.map(validateName))];
    const targets = cleanIds.map((modId) => ({ modId, dir: installer.folder(gameId, modId) }));
    const decision = await dialog.showMessageBox(getWindow(), {
      type: 'warning',
      title: 'Delete selected mods?',
      message: `Delete ${targets.length} selected ${targets.length === 1 ? 'mod' : 'mods'}?`,
      detail: targets.map((t) => t.modId).join(', '),
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (decision.response !== 1) return false;
    for (const target of targets) {
      if (installer.folder(gameId, target.modId) !== target.dir) {
        throw new Error('The mods folder changed. Try deleting the mods again.');
      }
      installer.deleteMod(gameId, target.modId);
    }
    return library.scan(store.read().games[gameId]);
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
}

module.exports = { registerModIpc };
