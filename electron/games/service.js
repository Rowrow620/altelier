const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createSteamDiscovery, isWorkshopPath } = require('./steam');
const lobotomy = require('./lobotomy');
const ruina = require('./ruina');
const { existingStat } = require('../files/paths');
const { inactiveSuffix } = require('../install/activation');

const adapters = { lobotomy, ruina };

function localDirectory(directory) {
  if (!directory) return '';
  let parent = directory;
  while (!existingStat(parent)) parent = path.dirname(parent);
  const resolved = fs.realpathSync(parent);
  if (isWorkshopPath(directory) || isWorkshopPath(resolved)) throw new Error('Choose a mods folder outside Steam Workshop.');
  if ([directory, resolved].some((location) => location.split(/[\\/]/)
    .some((component) => component.toLowerCase().endsWith(inactiveSuffix)))) {
    throw new Error('Choose the active mods folder.');
  }
  return directory;
}

function sameDirectory(left, right) {
  return Boolean(left && right && path.relative(path.resolve(left), path.resolve(right)) === '');
}

function getModsDirectory(game) {
  const adapter = adapters[game.id];
  const standard = adapter.defaultMods(game);
  const legacy = adapter.legacyMods?.(game);
  if (sameDirectory(game.modsPath, legacy) && standard && fs.existsSync(standard) && existingStat(legacy)?.isDirectory()) {
    const oldFolder = fs.opendirSync(legacy);
    try {
      if (!oldFolder.readSync()) return localDirectory(standard);
    } finally {
      oldFolder.closeSync();
    }
  }
  return localDirectory(game.modsPath || (fs.existsSync(standard) && standard) || game.fallbackModsPath || standard);
}

function isNativeModsDirectory(game, directory) {
  const native = adapters[game.id].nativeMods(game);
  if (sameDirectory(native, directory)) return true;
  return Boolean(native && existingStat(native)?.isDirectory() &&
    sameDirectory(fs.realpathSync(native), directory));
}

function installWarnings(game) {
  const adapter = adapters[game.id];
  if (!adapter.validInstall(game)) return ['Choose the game folder in Settings before playing with this mod.'];
  if (game.id === 'lobotomy' && !adapter.loaderInstalled(game)) return ['Install BaseMod before playing with this mod.'];
  if (game.id === 'ruina' && !isNativeModsDirectory(game, getModsDirectory(game))) {
    return ['Ruina reads local mods from LibraryOfRuina_Data/Mods. Check your mods folder in Settings.'];
  }
  return [];
}

function startProgram({ executable, args }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: path.dirname(executable), detached: true, stdio: 'ignore' });
    child.on('error', () => reject(new Error('Windows could not start the game. Check the game folder in Settings.')));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function createGameService({ store, steam = createSteamDiscovery(), start = startProgram }) {
  function detectConfig() {
    const detect = (config) => {
      for (const game of Object.values(config.games)) {
        const adapter = adapters[game.id];
        // Keep a working manually selected installation even when Steam finds another copy.
        if (!adapter.validInstall(game)) game.gamePath = steam.findGame(game) || game.gamePath;
        game.baseModInstalled = adapter.loaderInstalled(game);
        if (game.gamePath || game.modsPath) {
          try {
            const directory = getModsDirectory(game);
            if (directory && existingStat(directory)?.isDirectory()) game.modsPath = directory;
          } catch {
            // Keep the user's path visible in Settings so it can be corrected.
          }
        }
      }
    };
    const config = store.read();
    const previous = JSON.stringify(config);
    detect(config);
    if (JSON.stringify(config) === previous) return config;
    return store.update((saved) => { saved.games = config.games; });
  }

  async function launch(gameId, modded, prepare) {
    const game = store.read().games[gameId];
    const plan = adapters[game.id].launchPlan(game, modded);
    prepare(gameId, modded);
    await start({ ...plan, args: [...(plan.args ?? []), ...(game.launchArgs ?? [])] });
    return plan.message ?? 'Launch requested for ' + game.name + '.';
  }

  return { detectConfig, launch, workshopDirectories: (game) => game.id === 'ruina' ? steam.workshopDirectories(game) : [] };
}

module.exports = { createGameService, getModsDirectory, isNativeModsDirectory, installWarnings };
