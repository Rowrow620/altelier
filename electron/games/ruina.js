const fs = require('node:fs');
const path = require('node:path');
const { hasExecutable } = require('./steam');

function nativeMods(game) {
  return hasExecutable(game.gamePath, game.exeName)
    ? path.join(game.gamePath, 'LibraryOfRuina_Data', 'Mods') : '';
}

function legacyMods(game) {
  return game.gamePath ? path.join(game.gamePath, 'LibraryOfRuina_Data', 'BaseMods') : '';
}

function loaderInstalled(game) {
  return Boolean(nativeMods(game) && fs.existsSync(nativeMods(game)));
}

function launchPlan(game, modded) {
  if (!hasExecutable(game.gamePath, game.exeName)) throw new Error('Choose the Library of Ruina game folder in Settings.');
  if (!modded && fs.existsSync(path.join(game.gamePath, 'LibraryOfRuina_Data', 'Managed', 'BaseMod'))) {
    throw new Error('This Library of Ruina install has a legacy BaseMod patch. Choose a clean install for Vanilla.');
  }
  return {
    executable: path.join(game.gamePath, game.exeName),
    args: modded ? ['-mod'] : [],
    message: modded ? 'Launch requested for Library of Ruina. Select your mods in the game.' : undefined,
  };
}

module.exports = {
  validInstall: (game) => hasExecutable(game.gamePath, game.exeName),
  defaultMods: nativeMods, nativeMods, legacyMods, loaderInstalled, launchPlan,
};
