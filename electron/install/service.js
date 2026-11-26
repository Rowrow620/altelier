const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { writeAtomic } = require('../config/store');
const { inspectArchive, extractArchive } = require('./archive');
const { planArchive } = require('./layout');
const { metadata, readRecord, saveRecord, readInstallDetails, recordFile } = require('./record');
const { stableName, inactiveDirectory, moveMod } = require('./activation');
const {
  validateGameId, validateName, existingStat, modsRoot, childPath, assertSafeTree, removeChild,
} = require('../files/paths');

const transactionPattern = /^\.atelier-txn-[0-9a-f-]{36}$/;

function createInstallService({ store, getGameModsDir, activation = () => 'settings', confirmReplace, installWarnings = () => [] }) {
  const busy = new Set();

  function rootFor(gameId, create = false) {
    const game = store.read().games[validateGameId(gameId)];
    const directory = getGameModsDir(game);
    if (create && directory && !existingStat(directory)) fs.mkdirSync(directory, { recursive: true });
    return modsRoot(directory);
  }

  function modRoots(gameId, root) {
    const mode = activation(store.read().games[gameId], root);
    const inactive = mode === 'native' && inactiveDirectory(root);
    return inactive ? [root, inactive] : [root];
  }

  function setMembership(gameId, modId, enabled, directory) {
    return store.update((config) => {
      const game = config.games[gameId];
      const ids = new Set(game.enabledModIds);
      if (enabled) ids.add(modId);
      else ids.delete(modId);
      game.enabledModIds = [...ids];
      if (directory) game.modsPath = directory;
    });
  }

  function rollback(root, transaction, record) {
    const target = childPath(root, record.targetName);
    const old = childPath(transaction, 'old');
    const next = childPath(transaction, 'next');
    if (existingStat(old)) {
      removeChild(root, record.targetName);
      fs.renameSync(old, target);
    } else if (!record.hadTarget && record.operation === 'install' && !existingStat(next)) {
      removeChild(root, record.targetName);
    }
    setMembership(record.gameId, record.modId, record.wasEnabled);
  }

  function cleanup(root, transaction) {
    if (!transactionPattern.test(path.basename(transaction)) || path.dirname(transaction) !== root) {
      throw new Error('Invalid installation recovery folder.');
    }
    assertSafeTree(transaction);
    fs.rmSync(transaction, { recursive: true });
  }

  function recover(gameId) {
    if (busy.size) return;
    const game = store.read().games[validateGameId(gameId)];
    const directory = getGameModsDir(game);
    if (!directory || !existingStat(directory)) return;
    for (const root of modRoots(gameId, rootFor(gameId))) recoverRoot(gameId, root);
  }

  function recoverRoot(gameId, root) {
    for (const name of fs.readdirSync(root).filter((name) => transactionPattern.test(name))) {
      const transaction = path.join(root, name);
      const stat = fs.lstatSync(transaction);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid installation recovery folder.');
      const journal = childPath(transaction, 'journal.json');
      if (existingStat(journal)) {
        if (fs.statSync(journal).size > 8192) throw new Error('Invalid installation recovery record.');
        const record = JSON.parse(fs.readFileSync(journal, 'utf8'));
        validateName(record.targetName);
        validateName(record.modId);
        validateGameId(record.gameId);
        if (record.gameId !== gameId || !['install', 'delete'].includes(record.operation) ||
          typeof record.wasEnabled !== 'boolean' || typeof record.hadTarget !== 'boolean' ||
          typeof record.committed !== 'boolean') {
          throw new Error('Invalid installation recovery record.');
        }
        if (!record.committed) rollback(root, transaction, record);
      }
      cleanup(root, transaction);
    }
  }

  function begin(gameId) {
    validateGameId(gameId);
    if (busy.size) throw new Error('Wait for the current mod operation to finish.');
    recover(gameId);
    busy.add(gameId);
  }

  function findMod(gameId, root, modId, required = true) {
    validateName(modId);
    const name = stableName(modId);
    const matches = modRoots(gameId, root).flatMap((directory) => [name, name + '.disabled']
      .map((entry) => childPath(directory, entry)).filter(existingStat));
    if (matches.length > 1) throw new Error('Two folders use this mod name. Resolve them before changing it.');
    if (!matches.length && required) throw new Error('This mod folder no longer exists. Refresh the library.');
    return matches[0];
  }

  function commit(root, transaction, record, directory) {
    const journal = path.join(transaction, 'journal.json');
    try {
      const target = childPath(root, record.targetName);
      if (record.hadTarget) {
        assertSafeTree(target);
        fs.renameSync(target, path.join(transaction, 'old'));
      }
      if (record.operation === 'install') fs.renameSync(path.join(transaction, 'next'), target);
      setMembership(record.gameId, record.modId,
        record.operation === 'install' && !record.targetName.endsWith('.disabled') &&
          (!record.hadTarget || record.wasEnabled), directory);
      writeAtomic(journal, { ...record, committed: true });
    } catch (error) {
      try {
        rollback(root, transaction, record);
        cleanup(root, transaction);
      } catch (recoveryError) {
        throw new Error('The operation stopped. Its backup was kept for recovery. Restart Atelier before continuing.', { cause: recoveryError });
      }
      throw error;
    }
    try {
      cleanup(root, transaction);
    } catch (error) {
      // The committed record lets the next operation finish removing the backup.
      console.warn('Mod operation completed; backup cleanup will be retried:', error.message);
    }
  }

  async function install(gameId, filePath, options = {}) {
    let transaction;
    let root;
    let locked = false;
    try {
      begin(gameId);
      locked = true;
      if (!options || typeof options !== 'object' || Array.isArray(options) ||
          Object.keys(options).some((field) => !['replaceId', 'version', 'nexusUrl'].includes(field))) {
        throw new Error('Invalid install details.');
      }
      const inspected = inspectArchive(filePath);
      const { modName, entries } = planArchive(gameId, inspected.modName, inspected.entries);
      const warnings = installWarnings(store.read().games[gameId]);
      const modId = validateName(stableName(validateName(options.replaceId ?? modName)));
      const { source: requestedSource, version: enteredVersion } = readInstallDetails(gameId, options);
      const primary = rootFor(gameId, true);
      const target = findMod(gameId, primary, modId, options?.replaceId !== undefined) ?? childPath(primary, modName);
      root = path.dirname(target);
      const targetName = path.basename(target);
      const hadTarget = !!existingStat(target);
      if (hadTarget) {
        if (!fs.lstatSync(target).isDirectory()) throw new Error('A file already uses this mod name.');
        assertSafeTree(target);
        const approved = await confirmReplace(modName);
        if (!approved) return { success: false, cancelled: true };
      }
      transaction = path.join(root, `.atelier-txn-${randomUUID()}`);
      fs.mkdirSync(transaction, { mode: 0o700 });
      const next = path.join(transaction, 'next');
      fs.mkdirSync(next);
      await extractArchive(entries, next);
      const details = metadata(next, gameId);
      const previousSource = hadTarget ? readRecord(target, gameId)?.source ?? metadata(target, gameId).source : undefined;
      const sources = [requestedSource, previousSource, details.source].filter(Boolean);
      if (new Set(sources.map((source) => source.modId)).size > 1) {
        throw new Error('The ZIP and the installed mod point to different Nexus listings.');
      }
      const files = entries.filter(({ entry }) => !entry.isDirectory).map(({ name }) => name);
      saveRecord(next, gameId, files, enteredVersion ?? details.version, sources[0]);
      if (rootFor(gameId, true) !== primary || !modRoots(gameId, primary).includes(root)) {
        throw new Error('The mods folder changed. Import the ZIP again.');
      }
      if (!!existingStat(childPath(root, targetName)) !== hadTarget) {
        throw new Error('The mod folder changed during import. Import the ZIP again.');
      }
      const record = {
        operation: 'install', gameId, modId, targetName, hadTarget,
        wasEnabled: store.read().games[gameId].enabledModIds.includes(modId),
        committed: false,
      };
      writeAtomic(path.join(transaction, 'journal.json'), record);
      commit(root, transaction, record, primary);
      return warnings.length ? { success: true, modId, warnings } : { success: true, modId };
    } catch (error) {
      if (transaction && existingStat(transaction) && !existingStat(path.join(transaction, 'journal.json'))) {
        try { cleanup(root, transaction); } catch (cleanupError) { console.warn(cleanupError.message); }
      }
      return { success: false, error: error.message };
    } finally {
      if (locked) busy.delete(gameId);
    }
  }

  function deleteMod(gameId, modId) {
    begin(gameId);
    try {
      const target = findMod(gameId, rootFor(gameId), modId);
      const root = path.dirname(target);
      if (!fs.lstatSync(target).isDirectory()) throw new Error('Choose an installed mod folder.');
      assertSafeTree(target);
      const stableId = stableName(path.basename(target));
      const transaction = path.join(root, `.atelier-txn-${randomUUID()}`);
      fs.mkdirSync(transaction, { mode: 0o700 });
      const record = {
        operation: 'delete', gameId, modId: stableId, targetName: path.basename(target),
        hadTarget: true, wasEnabled: store.read().games[gameId].enabledModIds.includes(stableId),
        committed: false,
      };
      writeAtomic(path.join(transaction, 'journal.json'), record);
      commit(root, transaction, record);
    } finally {
      busy.delete(gameId);
    }
  }

  function toggle(gameId, modId, enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Invalid enabled state.');
    begin(gameId);
    try {
      const root = rootFor(gameId);
      const mode = activation(store.read().games[gameId], root);
      if (mode === 'manual') throw new Error('Use the game or its mod manager to change this mod.');
      const target = findMod(gameId, root, modId);
      if (!fs.lstatSync(target).isDirectory()) throw new Error('Choose an installed mod folder.');
      if (mode === 'native') {
        assertSafeTree(target);
        moveMod(target, root, enabled);
      } else {
        setMembership(gameId, stableName(path.basename(target)), enabled);
      }
    } finally {
      busy.delete(gameId);
    }
  }

  function toggleAll(gameId, enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Invalid enabled state.');
    begin(gameId);
    try {
      const root = rootFor(gameId);
      const mode = activation(store.read().games[gameId], root);
      if (mode === 'manual') throw new Error('Use the game or its mod manager to change these mods.');
      const inactive = inactiveDirectory(root);
      const targets = [];
      for (const folder of [root, inactive].filter(Boolean)) {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name.startsWith('.atelier-')) continue;
          const isCurrentlyEnabled = folder === root && stableName(entry.name) === entry.name;
          if (isCurrentlyEnabled !== enabled) targets.push(childPath(folder, entry.name));
        }
      }
      for (const target of targets) {
        if (mode === 'native') {
          assertSafeTree(target);
          moveMod(target, root, enabled);
        } else {
          setMembership(gameId, stableName(path.basename(target)), enabled);
        }
      }
    } finally {
      busy.delete(gameId);
    }
  }

  function readConfigText(gameId, modId) {
    const target = folder(gameId, validateName(modId));
    assertSafeTree(target);
    const configPath = childPath(target, 'config.txt');
    const stat = existingStat(configPath);
    if (!stat || !stat.isFile()) throw new Error('No config.txt file was found for this mod.');
    if (stat.size > 128 * 1024) throw new Error('config.txt exceeds the 128 KB limit.');
    return fs.readFileSync(configPath, 'utf8');
  }

  function saveConfigText(gameId, modId, content) {
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 128 * 1024) {
      throw new Error('config.txt content must be 128 KB or less.');
    }
    begin(gameId);
    try {
      const target = folder(gameId, validateName(modId));
      assertSafeTree(target);
      const configPath = childPath(target, 'config.txt');
      const stat = existingStat(configPath);
      if (!stat || !stat.isFile()) throw new Error('No config.txt file was found for this mod.');
      const tmp = path.join(target, `.atelier-cfg-${randomUUID()}.tmp`);
      try {
        fs.writeFileSync(tmp, content, 'utf8');
        fs.renameSync(tmp, configPath);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    } finally {
      busy.delete(gameId);
    }
  }

  function folder(gameId, modId) {
    const root = rootFor(gameId);
    const directory = modId === undefined ? root : findMod(gameId, root, modId);
    if (!fs.lstatSync(directory).isDirectory()) throw new Error('Choose an installed mod folder.');
    return directory;
  }

  function saveDetails(gameId, modId, options) {
    begin(gameId);
    try {
      if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid install details.');
      const { source, version } = readInstallDetails(gameId, options);
      if (!source || !version) throw new Error('Enter a Nexus mod link and the installed version.');
      const target = folder(gameId, validateName(modId));
      const record = readRecord(target, gameId);
      const files = record?.files ?? listExistingFiles(target);
      const recordPath = path.join(target, recordFile);
      if (existingStat(recordPath) && !existingStat(recordPath).isFile()) throw new Error('The install record is not a regular file.');
      saveRecord(target, gameId, files, version, source);
    } finally {
      busy.delete(gameId);
    }
  }

  function prepareLaunch(gameId, modded) {
    if (busy.size) throw new Error('Wait for the current mod operation to finish.');
    recover(gameId);
    const game = store.read().games[gameId];
    const directory = getGameModsDir(game);
    if (!modded || !directory || !existingStat(directory) || activation(game, directory) !== 'native') return;
    const root = modsRoot(directory);
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && stableName(entry.name) !== entry.name) toggle(gameId, entry.name, false);
    }
  }

  function profileState(gameId) {
    if (busy.size) throw new Error('Wait for the current mod operation to finish.');
    const game = store.read().games[validateGameId(gameId)];
    const directory = getGameModsDir(game);
    if (!directory || !existingStat(directory)?.isDirectory()) {
      throw new Error('Choose a valid mods folder in Settings.');
    }
    const root = modsRoot(directory);
    const inactive = inactiveDirectory(root);
    const mods = new Map();
    for (const folder of [root, inactive].filter(Boolean)) {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.atelier-')) continue;
        const name = validateName(stableName(entry.name));
        const key = name.toLowerCase();
        if (mods.has(key) || mods.size >= 10000) throw new Error('Resolve duplicate or excessive mod folders before using profiles.');
        mods.set(key, {
          name, enabled: folder === root && entry.name === name, path: childPath(folder, entry.name),
        });
      }
    }
    return { root, mods };
  }

  function applyProfile(gameId, root, changes) {
    const current = profileState(gameId);
    if (current.root !== root) throw new Error('The mods folder changed. Restore the previous folder before recovering the profile.');
    const moves = [];
    for (const { name, enabled } of changes) {
      const mod = current.mods.get(name.toLowerCase());
      if (!mod || mod.enabled === enabled) continue;
      assertSafeTree(mod.path);
      moves.push({ path: mod.path, enabled });
    }
    for (const move of moves) moveMod(move.path, root, move.enabled);
  }

  return {
    install, deleteMod, toggle, toggleAll, folder, saveDetails, readConfigText, saveConfigText,
    recover, prepareLaunch, profileState, applyProfile, isBusy: () => busy.size > 0,
  };
}

function listExistingFiles(root) {
  const files = [];
  const pending = [root];
  let examined = 0;
  while (pending.length) {
    const directory = fs.opendirSync(pending.pop());
    try {
      for (let entry = directory.readSync(); entry; entry = directory.readSync()) {
        if (++examined > 20000) throw new Error('This mod has too many files to record.');
        if (entry.name.startsWith('.atelier-') || entry.isSymbolicLink()) continue;
        const file = childPath(directory.path, entry.name);
        if (entry.isDirectory()) pending.push(file);
        else if (entry.isFile()) files.push(path.relative(root, file).split(path.sep).join('/'));
      }
    } finally {
      directory.closeSync();
    }
  }
  return files;
}

module.exports = { createInstallService };
