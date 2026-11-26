const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readSmallFile } = require('../files/read');
const { validateName } = require('../files/paths');

function readKeyValues(file) {
  try {
    const input = readSmallFile(file, 1024 * 1024)?.toString('utf8') ?? '';
    const tokens = input.matchAll(/\/\/[^\r\n]*|"((?:\\.|[^"\\])*)"|[{}]|([^\s{}"]+)/g);
    const stack = [new Map()];
    let key;
    for (const [token, quoted, bare] of tokens) {
      const current = stack.at(-1);
      if (token.startsWith('//')) continue;
      if (token === '{') {
        if (key === undefined || stack.length === 32) return new Map();
        const child = new Map();
        current.set(key, child);
        stack.push(child);
        key = undefined;
      } else if (token === '}') {
        if (key !== undefined || stack.length === 1) return new Map();
        stack.pop();
      } else {
        const value = quoted?.replace(/\\([\\"])/g, '$1') ?? bare;
        if (key === undefined) key = value.toLowerCase();
        else {
          current.set(key, value);
          key = undefined;
        }
      }
    }
    if (stack.length === 1 && key === undefined) return stack[0];
  } catch {
    // An unavailable library or manifest should not block other libraries.
  }
  return new Map();
}

function steamRoots() {
  if (process.platform !== 'win32') return [];
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]
    .filter(Boolean).map((directory) => path.join(directory, 'Steam'));
  const windows = process.env.SystemRoot;
  if (windows) {
    try {
      const result = execFileSync(path.join(windows, 'System32', 'reg.exe'), [
        'query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath',
      ], { encoding: 'utf8', timeout: 2000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const steamPath = result.match(/^\s*SteamPath\s+REG_SZ\s+(.+?)\s*$/mi)?.[1];
      if (steamPath) roots.unshift(steamPath);
    } catch {
      // The client can be installed even when the registry entry is missing.
    }
  }
  return [...roots, 'D:\\SteamLibrary', 'E:\\SteamLibrary', 'F:\\SteamLibrary'];
}

function createSteamDiscovery(roots = steamRoots()) {
  function libraries(gamePath = '') {
    const candidates = [...roots];
    for (const root of roots) {
      const folders = readKeyValues(path.join(root, 'steamapps', 'libraryfolders.vdf')).get('libraryfolders');
      if (!(folders instanceof Map)) continue;
      for (const [key, value] of folders) {
        if (/^\d+$/.test(key)) candidates.push(value instanceof Map ? value.get('path') : value);
      }
    }
    const common = path.dirname(gamePath);
    const steamapps = path.dirname(common);
    if (path.basename(common).toLowerCase() === 'common' && path.basename(steamapps).toLowerCase() === 'steamapps') {
      candidates.unshift(path.dirname(steamapps));
    }
    const available = new Set();
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) continue;
      try {
        const root = fs.realpathSync(candidate);
        if (fs.statSync(path.join(root, 'steamapps')).isDirectory()) available.add(root);
      } catch {
        // Skip libraries on drives that are currently unavailable.
      }
    }
    return [...available];
  }

  function findGame(game) {
    for (const library of libraries()) {
      const steamapps = path.join(library, 'steamapps');
      const manifest = readKeyValues(path.join(steamapps, 'appmanifest_' + game.appId + '.acf')).get('appstate');
      const names = [...game.steamFolders];
      if (manifest instanceof Map && manifest.get('appid') === game.appId) {
        try { names.unshift(validateName(manifest.get('installdir'))); } catch {}
      }
      for (const name of new Set(names)) {
        const directory = path.join(steamapps, 'common', name);
        if (hasExecutable(directory, game.exeName)) return directory;
      }
    }
    return '';
  }

  function workshopDirectories(game) {
    return libraries(game.gamePath).map((root) => path.join(root, 'steamapps', 'workshop', 'content', game.appId));
  }

  return { findGame, workshopDirectories };
}

function hasExecutable(directory, name) {
  try {
    return Boolean(directory && fs.lstatSync(path.join(directory, name), { throwIfNoEntry: false })?.isFile());
  } catch {
    return false;
  }
}

function isWorkshopPath(directory) {
  return directory.split(/[\\/]/).some((part, index, parts) =>
    part.toLowerCase() === 'steamapps' && parts[index + 1]?.toLowerCase() === 'workshop' &&
    parts[index + 2]?.toLowerCase() === 'content');
}

module.exports = { createSteamDiscovery, hasExecutable, isWorkshopPath };
