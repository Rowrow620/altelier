const fs = require('node:fs');
const path = require('node:path');
const { childPath, existingStat, modsRoot, validateGameId } = require('../files/paths');
const { getModsDirectory, installWarnings, isNativeModsDirectory } = require('../games/service');
const { inactiveDirectory, stableName } = require('../install/activation');
const lobotomy = require('../games/lobotomy');
const ruina = require('../games/ruina');
const { detectBaseModInfo, fixCompatibilityIssue, scanCompatibility } = require('./compatibility');

const adapters = { lobotomy, ruina };
const IGNORED_CONFLICT_FILES = new Set([
  'info.txt', 'readme.md', '.atelier-record.json', 'license', 'license.md', 'license.txt', 'changelog.md',
]);
const IGNORED_CONFLICT_DIRS = new Set(['node_modules', '__macosx']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function walkModFolder(folder, onFile) {
  const pending = [{ dir: modsRoot(folder), depth: 0 }];
  let scanned = 0;
  while (pending.length && scanned < 20000) {
    const { dir, depth } = pending.pop();
    let dirHandle;
    try {
      dirHandle = fs.opendirSync(dir);
    } catch {
      continue;
    }
    try {
      for (let entry = dirHandle.readSync(); entry && scanned < 20000; entry = dirHandle.readSync()) {
        scanned++;
        if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
        if (entry.isDirectory() && IGNORED_CONFLICT_DIRS.has(entry.name.toLowerCase())) continue;
        const full = childPath(dir, entry.name);
        if (entry.isDirectory()) {
          if (depth < 16) pending.push({ dir: full, depth: depth + 1 });
        } else if (entry.isFile()) {
          const stat = existingStat(full);
          if (stat) onFile(path.relative(folder, full).split(path.sep).join('/'), stat.size);
        }
      }
    } finally {
      dirHandle.closeSync();
    }
  }
}

function measureDirectory(root) {
  let bytes = 0;
  const pending = [root];
  let scanned = 0;
  while (pending.length && scanned < 20000) {
    const dir = pending.pop();
    let dirHandle;
    try {
      dirHandle = fs.opendirSync(dir);
    } catch {
      continue;
    }
    try {
      for (let entry = dirHandle.readSync(); entry && scanned < 20000; entry = dirHandle.readSync()) {
        scanned++;
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) pending.push(full);
        else if (entry.isFile()) bytes += existingStat(full)?.size ?? 0;
      }
    } finally {
      dirHandle.closeSync();
    }
  }
  return bytes;
}

function listDirectories(root) {
  if (!root || !existingStat(root)?.isDirectory()) return [];
  return fs.readdirSync(modsRoot(root), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink());
}

function createDiagnosticsService({ store, installer }) {
  function analyze(gameId) {
    const id = validateGameId(gameId);
    const game = store.read().games[id];
    const adapter = adapters[id];
    const validInstall = adapter.validInstall(game);
    const baseModInstalled = adapter.loaderInstalled(game);
    const directory = getModsDirectory(game);
    const root = directory && existingStat(directory)?.isDirectory() ? modsRoot(directory) : '';
    const isNativeModsDir = Boolean(root && isNativeModsDirectory(game, root));
    const issues = [...installWarnings(game)];
    const fileOwners = new Map();
    const storage = {
      enabledCount: 0, enabledBytes: 0,
      disabledCount: 0, disabledBytes: 0,
      tempCount: 0, tempBytes: 0,
    };

    if (root) {
      for (const entry of listDirectories(root)) {
        if (entry.name.startsWith('.atelier-txn-')) {
          storage.tempCount++;
          storage.tempBytes += measureDirectory(path.join(root, entry.name));
          continue;
        }
        if (entry.name.startsWith('.atelier-')) continue;
        const full = childPath(root, entry.name);
        const enabled = stableName(entry.name) === entry.name;
        if (!enabled) {
          storage.disabledCount++;
          storage.disabledBytes += measureDirectory(full);
          continue;
        }
        storage.enabledCount++;
        let filesInMod = 0;
        walkModFolder(full, (rel, size) => {
          filesInMod++;
          storage.enabledBytes += size;
          const lower = rel.toLowerCase();
          const base = path.posix.basename(lower);
          if (IGNORED_CONFLICT_FILES.has(base) || IMAGE_EXTENSIONS.has(path.posix.extname(base))) return;
          if (!fileOwners.has(lower)) fileOwners.set(lower, { path: rel, mods: new Set() });
          fileOwners.get(lower).mods.add(entry.name);
        });
        if (filesInMod === 0) issues.push(`"${entry.name}" contains no mod files.`);
      }

      const inactive = inactiveDirectory(root);
      for (const entry of listDirectories(inactive)) {
        if (entry.name.startsWith('.atelier-txn-')) {
          storage.tempCount++;
          storage.tempBytes += measureDirectory(path.join(inactive, entry.name));
          continue;
        }
        if (entry.name.startsWith('.atelier-')) continue;
        const full = childPath(inactive, entry.name);
        storage.disabledCount++;
        storage.disabledBytes += measureDirectory(full);
      }
    }

    const conflicts = [...fileOwners.values()]
      .filter((entry) => entry.mods.size > 1)
      .map((entry) => ({ path: entry.path, mods: [...entry.mods].sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, 100);

    const baseMod = detectBaseModInfo(game);
    const compatibility = scanCompatibility(game);

    return {
      gameId: id,
      validInstall,
      modsPath: root || directory || '',
      isNativeModsDir,
      baseModInstalled,
      baseMod,
      compatibility,
      issues: [...new Set(issues)],
      conflicts,
      storage,
    };
  }

  function fixIssue(gameId, issueId) {
    fixCompatibilityIssue({ store, installer, gameId, issueId });
    return analyze(gameId);
  }

  function cleanTempFolders(gameId) {
    const id = validateGameId(gameId);
    if (installer.isBusy()) throw new Error('Wait for the current mod operation to finish.');
    installer.recover(id);
    const game = store.read().games[id];
    const directory = getModsDirectory(game);
    const root = directory && existingStat(directory)?.isDirectory() ? modsRoot(directory) : '';
    if (root) {
      for (const folder of [root, inactiveDirectory(root)].filter(Boolean)) {
        for (const entry of listDirectories(folder)) {
          if (entry.name.startsWith('.atelier-txn-')) {
            fs.rmSync(path.join(folder, entry.name), { recursive: true, force: true });
          }
        }
      }
    }
    return analyze(id);
  }

  return { analyze, fixIssue, cleanTempFolders };
}

module.exports = { createDiagnosticsService };
