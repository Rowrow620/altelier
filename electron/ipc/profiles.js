const fs = require('node:fs');
const { validateGameId } = require('../files/paths');

function registerProfileIpc({ handle, getWindow, store, profiles, dialog }) {
  handle('profiles:save', (input) => profiles.save(input?.name, input?.gameId));
  handle('profiles:activate', async (input) => {
    const preview = profiles.previewActivation?.(input?.name, input?.gameId);
    if (preview && (preview.modChanges.length > 0 || preview.tweakChanges.length > 0)) {
      const lines = [
        ...preview.modChanges.slice(0, 12),
        ...(preview.modChanges.length > 12 ? [`...and ${preview.modChanges.length - 12} more mod changes`] : []),
        ...preview.tweakChanges,
      ];
      const decision = await dialog.showMessageBox(getWindow(), {
        type: 'question',
        title: 'Switch profile?',
        message: `Switch to "${input?.name}"?`,
        detail: lines.join('\n'),
        buttons: ['Cancel', 'Switch'],
        defaultId: 1,
        cancelId: 0,
        noLink: true,
      });
      if (decision.response !== 1) return store.read();
    }
    return profiles.activate(input?.name, input?.gameId);
  });
  handle('profiles:delete', async (input) => {
    const decision = await dialog.showMessageBox(getWindow(), {
      type: 'warning',
      title: 'Delete profile?',
      message: `Delete profile "${input?.name}"?`,
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
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
}

module.exports = { registerProfileIpc };
