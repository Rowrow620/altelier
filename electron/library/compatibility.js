const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { assertSafeTree, childPath, existingStat, modsRoot, validateGameId, validateName } = require('../files/paths');
const { readSmallFile } = require('../files/read');
const { getModsDirectory } = require('../games/service');
const { inactiveDirectory, stableName } = require('../install/activation');
const lobotomy = require('../games/lobotomy');
const ruina = require('../games/ruina');

const MAX_BINARY_SCAN_BYTES = 4 * 1024 * 1024;

function readPeFileVersion(filePath) {
  const data = readSmallFile(filePath, MAX_BINARY_SCAN_BYTES);
  if (!data || data.length < 64) return '';
  // Search UTF-16LE "FileVersion\0" in PE VS_VERSION_INFO resource section.
  const marker = Buffer.from('FileVersion\0', 'utf16le');
  const idx = data.indexOf(marker);
  if (idx !== -1) {
    let start = idx + marker.length;
    if (start % 2 !== 0) start++;
    while (start + 1 < data.length && data.readUInt16LE(start) === 0) start += 2;
    let end = start;
    while (end + 1 < data.length && end - start < 64 && data.readUInt16LE(end) !== 0) end += 2;
    const raw = data.subarray(start, end).toString('utf16le').trim();
    if (/^\d+\.\d+/.test(raw)) return raw;
  }
  // Fallback: VS_FIXEDFILEINFO signature 0xFEEF04BD (little-endian: BD 04 EF FE)
  const sig = Buffer.from([0xbd, 0x04, 0xef, 0xfe]);
  const sigIdx = data.indexOf(sig);
  if (sigIdx !== -1 && sigIdx + 16 <= data.length) {
    const ms = data.readUInt32LE(sigIdx + 8);
    const ls = data.readUInt32LE(sigIdx + 12);
    const major = (ms >>> 16) & 0xffff;
    const minor = ms & 0xffff;
    const build = (ls >>> 16) & 0xffff;
    const rev = ls & 0xffff;
    if (major > 0 || minor > 0) return `${major}.${minor}.${build}.${rev}`;
  }
  return '';
}

function compareVersions(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b || '').replace(/^v/i, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function detectBaseModInfo(game) {
  if (game.id === 'lobotomy') {
    const nexusUrl = 'https://www.nexusmods.com/lobotomycorporation/mods/2';
    if (!game.gamePath) {
      return {
        status: 'missing',
        loaderName: 'BaseMod (Lobotomy Corp)',
        version: '',
        harmonyVersion: '',
        details: 'Game folder is not configured in Settings.',
        nexusUrl,
      };
    }
    const hasManager = existingStat(path.join(game.gamePath, 'LobotomyModManager.exe'))?.isFile();
    if (hasManager) {
      const rootLib = path.join(game.gamePath, 'LobotomyBaseModLib.dll');
      const rootHarmony = path.join(game.gamePath, '0Harmony.dll');
      const libPath = existingStat(rootLib)?.isFile()
        ? rootLib
        : path.join(game.gamePath, 'LobotomyCorp_Data', 'Managed', 'LobotomyBaseModLib.dll');
      const detectedVersion = existingStat(libPath)?.isFile() ? readPeFileVersion(libPath) : '';
      const harmonyVer = existingStat(rootHarmony)?.isFile() ? (readPeFileVersion(rootHarmony) || 'Present') : '';
      return {
        status: 'ok',
        loaderName: 'Lobotomy Mod Manager',
        version: detectedVersion || 'Managed',
        harmonyVersion: harmonyVer,
        details: 'Lobotomy Mod Manager installation detected.',
        nexusUrl,
      };
    }

    const managed = path.join(game.gamePath, 'LobotomyCorp_Data', 'Managed');
    const libPath = path.join(managed, 'LobotomyBaseModLib.dll');
    const harmonyPath = path.join(managed, '0Harmony.dll');
    const hasLegacyFolder = existingStat(path.join(managed, 'BaseMod'))?.isDirectory();
    const hasStoryData = existingStat(path.join(managed, 'BaseMod', 'StoryData'))?.isDirectory();
    const hasImageData = existingStat(path.join(managed, 'BaseMod', 'Image'))?.isDirectory();
    const hasLib = existingStat(libPath)?.isFile();
    const hasHarmony = existingStat(harmonyPath)?.isFile();

    if (!lobotomy.loaderInstalled(game)) {
      return {
        status: 'missing',
        loaderName: 'BaseMod (Lobotomy Corp)',
        version: '',
        harmonyVersion: '',
        details: 'BaseMod files were not found in LobotomyCorp_Data/Managed.',
        nexusUrl,
      };
    }

    const detectedVersion = hasLib ? readPeFileVersion(libPath) : '';
    const inferredVersion = detectedVersion || (hasImageData ? '5.0+' : hasStoryData ? '4.14+' : hasLegacyFolder ? '3.x-4.x' : '');
    const harmonyVersion = hasHarmony ? (readPeFileVersion(harmonyPath) || 'Present') : 'Missing';

    let status = 'ok';
    let details = inferredVersion ? `BaseMod ${inferredVersion} detected.` : 'BaseMod installation detected.';
    if (detectedVersion && compareVersions(detectedVersion, '5.0') < 0) {
      status = 'outdated';
      details = `BaseMod ${detectedVersion} is older than v5.0; mods targeting BaseMod v5 may fail to load.`;
    } else if (!detectedVersion && hasLegacyFolder && !hasImageData) {
      status = 'outdated';
      details = 'BaseMod folder appears older than v5.0 (missing BaseMod/Image); check for a newer BaseMod release.';
    } else if (!hasHarmony) {
      status = 'outdated';
      details = 'BaseMod detected, but 0Harmony.dll is missing from Managed.';
    }

    return {
      status,
      loaderName: 'BaseMod (Lobotomy Corp)',
      version: inferredVersion,
      harmonyVersion,
      details,
      nexusUrl,
    };
  }

  // Library of Ruina uses native -mod support (no BaseMod/Harmony loader needed)
  if (!game.gamePath) {
    return {
      status: 'missing',
      loaderName: 'Not needed',
      version: 'Not needed',
      harmonyVersion: '',
      details: 'Game folder is not configured in Settings.',
      nexusUrl: '',
    };
  }
  const hasExecutableInstall = ruina.validInstall(game);
  return {
    status: hasExecutableInstall ? 'ok' : 'missing',
    loaderName: 'Not needed',
    version: 'Not needed',
    harmonyVersion: '',
    details: hasExecutableInstall
      ? 'Native -mod support ready.'
      : 'Game executable not found in configured folder.',
    nexusUrl: '',
  };
}

function listEntries(dir) {
  try {
    return fs.readdirSync(modsRoot(dir), { withFileTypes: true }).filter((entry) => !entry.isSymbolicLink());
  } catch {
    return [];
  }
}

function hasModDescriptor(dir) {
  return ['Info.txt', 'StageModInfo.xml', 'ModInfo.xml'].some((name) => existingStat(path.join(dir, name))?.isFile());
}

function detectNestedModSubfolder(folder) {
  const entries = listEntries(folder).filter((entry) => !entry.name.startsWith('.atelier-'));
  const dirs = entries.filter((entry) => entry.isDirectory());
  const files = entries.filter((entry) => entry.isFile());
  if (files.length === 0 && dirs.length === 1) {
    const inner = path.join(folder, dirs[0].name);
    if (hasModDescriptor(inner) || listEntries(inner).some((e) => e.isFile() && /\.(dll|xml|txt)$/i.test(e.name))) {
      return dirs[0].name;
    }
  }
  return '';
}

function scanCompatibility(game, { workshopDirectories } = {}) {
  const items = [];
  const directory = getModsDirectory(game);
  const root = directory && existingStat(directory)?.isDirectory() ? modsRoot(directory) : '';
  const inactive = root ? inactiveDirectory(root) : '';
  const workshopIds = new Set();
  const workshopTitles = new Set();

  if (game.id === 'ruina' && typeof workshopDirectories === 'function') {
    for (const dir of workshopDirectories(game) ?? []) {
      const folderId = path.basename(dir);
      if (folderId) workshopIds.add(folderId.toLowerCase());
      const xml = readSmallFile(path.join(dir, 'StageModInfo.xml'), 16 * 1024)?.toString('utf8') ?? '';
      const title = xml.match(/<Title>([^<]+)<\/Title>/i)?.[1]?.trim();
      if (title) workshopTitles.add(title.toLowerCase());
    }
  }

  for (const container of [root, inactive].filter(Boolean)) {
    for (const entry of listEntries(container)) {
      if (!entry.isDirectory() || entry.name.startsWith('.atelier-')) continue;
      const full = path.join(container, entry.name);
      const cleanName = stableName(entry.name);
      const nested = detectNestedModSubfolder(full);
      if (nested) {
        items.push({
          id: `unwrap:${entry.name}`,
          modName: cleanName,
          severity: 'warning',
          message: `"${entry.name}" is double-nested inside "${nested}/", which loaders skip.`,
          fixable: true,
          fixLabel: 'Unwrap folder',
        });
      }
      if (game.id === 'ruina' && (workshopIds.has(cleanName.toLowerCase()) || workshopTitles.has(cleanName.toLowerCase()))) {
        items.push({
          id: `duplicate-local:${cleanName}`,
          modName: cleanName,
          severity: 'warning',
          message: `"${cleanName}" duplicates an installed Steam Workshop mod.`,
          fixable: true,
          fixLabel: 'Remove local copy',
        });
      }
    }
  }

  if (game.id === 'ruina' && game.gamePath) {
    const legacyBaseMods = ruina.legacyMods(game);
    const nativeMods = ruina.nativeMods(game);
    if (legacyBaseMods && nativeMods && existingStat(legacyBaseMods)?.isDirectory() &&
        path.resolve(legacyBaseMods) !== path.resolve(nativeMods)) {
      for (const entry of listEntries(legacyBaseMods)) {
        if (!entry.isDirectory() || entry.name.startsWith('.atelier-')) continue;
        items.push({
          id: `migrate-ruina:${entry.name}`,
          modName: stableName(entry.name),
          severity: 'warning',
          message: `"${entry.name}" is in legacy LibraryOfRuina_Data/BaseMods instead of LibraryOfRuina_Data/Mods.`,
          fixable: true,
          fixLabel: 'Move to Mods/',
        });
      }
    }
  }

  return items;
}

function fixCompatibilityIssue({ store, installer, gameId, issueId }) {
  const id = validateGameId(gameId);
  if (typeof issueId !== 'string' || !issueId.includes(':')) throw new Error('Invalid compatibility fix action.');
  if (installer.isBusy()) throw new Error('Wait for the current mod operation to finish.');
  installer.recover(id);
  const sep = issueId.indexOf(':');
  const action = issueId.slice(0, sep);
  const rawModName = validateName(issueId.slice(sep + 1));
  const game = store.read().games[id];

  if (action === 'migrate-ruina') {
    if (id !== 'ruina') throw new Error('Ruina migration only applies to Library of Ruina.');
    const legacyDir = ruina.legacyMods(game);
    const targetRoot = ruina.nativeMods(game);
    if (!legacyDir || !targetRoot) throw new Error('Choose the Library of Ruina game folder in Settings.');
    const source = childPath(modsRoot(legacyDir), rawModName);
    if (!existingStat(source)?.isDirectory()) throw new Error('Source mod folder no longer exists.');
    assertSafeTree(source);
    fs.mkdirSync(targetRoot, { recursive: true });
    const destination = childPath(modsRoot(targetRoot), rawModName);
    if (existingStat(destination)) throw new Error(`"${rawModName}" already exists in LibraryOfRuina_Data/Mods.`);
    fs.renameSync(source, destination);
    return;
  }

  const target = installer.folder(id, rawModName);
  assertSafeTree(target);

  if (action === 'duplicate-local') {
    installer.deleteMod(id, rawModName);
    return;
  }

  if (action === 'unwrap') {
    const nested = detectNestedModSubfolder(target);
    if (!nested) throw new Error('This folder is no longer double-nested.');
    const innerDir = childPath(target, nested);
    const staging = path.join(target, `.atelier-txn-${randomUUID()}`);
    fs.mkdirSync(staging);
    try {
      const movedNames = [];
      for (const entry of listEntries(innerDir)) {
        const src = path.join(innerDir, entry.name);
        const dst = path.join(staging, entry.name);
        fs.renameSync(src, dst);
        movedNames.push(entry.name);
      }
      fs.rmdirSync(innerDir);
      for (const name of movedNames) {
        fs.renameSync(path.join(staging, name), path.join(target, name));
      }
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
    return;
  }

  throw new Error('Unsupported compatibility fix.');
}

module.exports = { detectBaseModInfo, scanCompatibility, fixCompatibilityIssue };
