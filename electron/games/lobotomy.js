const fs = require('node:fs');
const path = require('node:path');
const { hasExecutable } = require('./steam');

const managerExe = 'LobotomyModManager.exe';

function hasManager(game) {
  return hasExecutable(game.gamePath, managerExe);
}

function nativeMods(game) {
  return hasExecutable(game.gamePath, game.exeName)
    ? path.join(game.gamePath, 'LobotomyCorp_Data', 'BaseMods') : '';
}

function defaultMods(game) {
  return hasManager(game) ? path.join(game.gamePath, 'mod list') : nativeMods(game);
}

function loaderInstalled(game) {
  if (hasManager(game)) return true;
  if (!game.gamePath) return false;
  const managed = path.join(game.gamePath, 'LobotomyCorp_Data', 'Managed');
  return ['LobotomyBaseModLib.dll', 'BaseMod', '0Harmony.dll'].some((file) => fs.existsSync(path.join(managed, file)));
}

function launchPlan(game, modded) {
  if (modded && hasManager(game)) {
    return {
      executable: path.join(game.gamePath, managerExe), args: [],
      message: 'Launch requested for Lobotomy Mod Manager. Start the game there.',
    };
  }
  if (!hasExecutable(game.gamePath, game.exeName)) {
    throw new Error('Choose the Lobotomy Corporation game folder in Settings. Vanilla needs a clean game install.');
  }
  if (modded && !loaderInstalled(game)) throw new Error('Install BaseMod before launching Lobotomy Corporation with mods.');
  if (!modded && loaderInstalled(game)) {
    throw new Error('Vanilla needs a clean Lobotomy Corporation install. Choose its folder in Settings.');
  }
  return { executable: path.join(game.gamePath, game.exeName), args: [] };
}

module.exports = {
  validInstall: (game) => hasExecutable(game.gamePath, game.exeName) || hasManager(game),
  defaultMods, nativeMods, loaderInstalled, launchPlan,
};
