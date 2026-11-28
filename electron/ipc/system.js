const { validateGameId } = require('../files/paths');

function registerSystemIpc({
  handle, getWindow, store, installer, gameService, diagnostics, backups,
  loadOrder, readGameLogs, checkAppUpdate, syncTweaks, hasActiveTweaks,
  selectedArchives, selectedDirectories, dialog, shell, externalUrl,
}) {
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
        type: 'question',
        title: 'Change folders?',
        message: 'Use these folders?',
        detail: changes.join('\n'),
        buttons: ['Cancel', 'Use folders'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
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
  handle('diagnostics:get', (gameId) => diagnostics.analyze(gameId));
  handle('diagnostics:fix', (input) => diagnostics.fixIssue(input?.gameId, input?.issueId));
  handle('diagnostics:clean-temp', (gameId) => diagnostics.cleanTempFolders(gameId));
  handle('diagnostics:install-basemod', (filePath) => {
    if (!selectedArchives.has(filePath)) throw new Error('Choose a BaseMod archive through the file picker.');
    return diagnostics.installBaseMod(filePath);
  });
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
  handle('load-order:get', (gameId) => loadOrder.get(gameId));
  handle('load-order:save', (input) => loadOrder.save(input?.gameId, input?.orders));
  handle('logs:get', (gameId) => readGameLogs(gameId, { gamePath: store.read().games[validateGameId(gameId)]?.gamePath }));
  handle('app:check-update', () => checkAppUpdate());
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
    const game = store.read().games[input.gameId];
    syncTweaks?.(game, input.modded);
    if (input.gameId === 'ruina') {
      loadOrder?.activateRuinaMod(game, undefined, { active: Boolean(input.modded && hasActiveTweaks?.('ruina', game?.tweaks)) });
    }
    if (input.modded && hasActiveTweaks?.(input.gameId, game?.tweaks)) {
      try {
        backups?.create(input.gameId, 'Auto-backup: Tweaks active');
      } catch {
        // Ignore if save folder does not exist yet
      }
    }
    return gameService.launch(input.gameId, input.modded, installer.prepareLaunch);
  });
  handle('shell:open-external', async (url) => {
    await shell.openExternal(externalUrl(url));
  });
}

module.exports = { registerSystemIpc };
