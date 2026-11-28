const fs = require('node:fs');
const { normalizeTweaks, profileName, writeAtomic } = require('../config/store');
const { readSmallFile } = require('../files/read');
const { existingStat, validateGameId, validateName, validatePath } = require('../files/paths');

function storeSnapshot(config, snapshot) {
  config.profileSnapshots = config.profileSnapshots.filter(({ gameId, name }) =>
    gameId !== snapshot.gameId || name !== snapshot.name);
  config.profileSnapshots.push(snapshot);
}

function createProfileService({ store, installer, journalPath }) {
  function clearJournal() {
    try {
      fs.rmSync(journalPath, { force: true });
    } catch {
      throw new Error('Could not clear the profile recovery file. Try again.');
    }
  }

  function recover() {
    if (!existingStat(journalPath)) return;
    const raw = readSmallFile(journalPath, 8 * 1024 * 1024);
    let journal;
    try {
      journal = JSON.parse(raw?.toString('utf8') ?? '');
      validateGameId(journal.gameId);
      validatePath(journal.root);
      profileName(journal.to);
      profileName(journal.from);
      if (!journal.root || journal.from === journal.to || !Array.isArray(journal.before) ||
          journal.before.length > 10000) throw new Error();
      for (const item of journal.before) {
        validateName(item.name);
        if (typeof item.enabled !== 'boolean') throw new Error();
      }
    } catch {
      throw new Error('Could not read the profile recovery file. Profile changes are paused.');
    }
    const selected = store.read().gameProfiles[journal.gameId];
    if (selected !== journal.to) {
      if (selected !== journal.from) throw new Error('The active profile changed during recovery.');
      installer.applyProfile(journal.gameId, journal.root, journal.before);
    }
    clearJournal();
  }

  function capture(gameId, name, root, mods, config) {
    return {
      gameId,
      name,
      root,
      enabled: [...mods.values()].filter((mod) => mod.enabled).map((mod) => mod.name),
      tweaks: { ...config.games[gameId].tweaks },
    };
  }

  function save(input, requestedGame) {
    recover();
    const name = profileName(input);
    const gameId = validateGameId(requestedGame);
    const config = store.read();
    if (config.activeGame !== gameId) throw new Error('Switch back to this game to save its profile.');
    installer.recover(gameId);
    const { root, mods } = installer.profileState(gameId);
    const snapshot = capture(gameId, name, root, mods, config);
    return store.update((next) => {
      if (!next.profiles.includes(name)) {
        if (next.profiles.length >= 100) throw new Error('The library already has 100 profiles.');
        next.profiles.push(name);
      }
      if (next.activeProfile !== name &&
          !next.profileSnapshots.some((entry) => entry.gameId === gameId && entry.name === next.activeProfile)) {
        storeSnapshot(next, { ...snapshot, name: next.activeProfile });
      }
      storeSnapshot(next, snapshot);
      next.gameProfiles[gameId] = name;
    });
  }

  function activate(input, requestedGame) {
    recover();
    const name = profileName(input);
    const gameId = validateGameId(requestedGame);
    const config = store.read();
    if (config.activeGame !== gameId) throw new Error('Switch back to this game to change its profile.');
    if (!config.profiles.includes(name)) throw new Error('Choose an existing profile.');
    if (config.activeProfile === name) return config;

    installer.recover(gameId);
    const { root, mods } = installer.profileState(gameId);
    const outgoing = capture(gameId, config.activeProfile, root, mods, config);
    const target = config.profileSnapshots.find((entry) => entry.gameId === gameId && entry.name === name);
    if (target && target.root !== root) throw new Error('This profile uses a different mods folder. Save it again for this folder.');
    const enabled = new Set((target ?? outgoing).enabled.map((value) => value.toLowerCase()));
    const before = [...mods.values()].filter((mod) => mod.enabled !== enabled.has(mod.name.toLowerCase()))
      .map(({ name, enabled }) => ({ name, enabled }));
    const commit = () => store.update((next) => {
      storeSnapshot(next, outgoing);
      if (!target) storeSnapshot(next, { ...outgoing, name });
      else if (target.tweaks) next.games[gameId].tweaks = { ...target.tweaks };
      next.gameProfiles[gameId] = name;
    });
    if (!before.length) return commit();

    writeAtomic(journalPath, { gameId, root, from: config.activeProfile, to: name, before });
    let result;
    try {
      installer.applyProfile(gameId, root, before.map(({ name, enabled }) => ({ name, enabled: !enabled })));
      result = commit();
    } catch (error) {
      try {
        recover();
      } catch {
        throw new Error('Profile switch stopped. Atelier will retry recovery before changing mods again.');
      }
      throw error;
    }
    // The saved active profile distinguishes a committed switch if removal must be retried.
    try { clearJournal(); } catch (error) { console.warn(error.message); }
    return result;
  }

  function remove(input, requestedGame) {
    recover();
    const name = profileName(input);
    const gameId = validateGameId(requestedGame);
    if (name === 'Default') throw new Error('The Default profile cannot be deleted.');
    const config = store.read();
    if (!config.profiles.includes(name)) throw new Error('Choose an existing profile.');
    if (config.gameProfiles[gameId] === name) {
      activate('Default', gameId);
    }
    return store.update((next) => {
      next.profiles = next.profiles.filter((item) => item !== name);
      next.profileSnapshots = next.profileSnapshots.filter((entry) => entry.name !== name);
      for (const id of Object.keys(next.gameProfiles)) {
        if (next.gameProfiles[id] === name) next.gameProfiles[id] = next.profiles[0] ?? 'Default';
      }
    });
  }

  function exportData(requestedGame, input) {
    recover();
    const name = profileName(input);
    const gameId = validateGameId(requestedGame);
    const config = store.read();
    if (!config.profiles.includes(name)) throw new Error('Choose an existing profile.');
    const snapshot = config.profileSnapshots.find((entry) => entry.gameId === gameId && entry.name === name);
    const enabledModIds = snapshot?.enabled ?? (config.gameProfiles[gameId] === name
      ? [...installer.profileState(gameId).mods.values()].filter((mod) => mod.enabled).map((mod) => mod.name)
      : []);
    return {
      version: 1,
      gameId,
      profile: name,
      exportedAt: new Date().toISOString(),
      enabledModIds,
      ...(snapshot?.tweaks
        ? { tweaks: snapshot.tweaks }
        : config.gameProfiles[gameId] === name
          ? { tweaks: { ...config.games[gameId].tweaks } }
          : {}),
    };
  }

  function importData(requestedGame, rawData) {
    recover();
    const gameId = validateGameId(requestedGame);
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      throw new Error('Invalid profile file.');
    }
    if (rawData.gameId !== undefined && validateGameId(rawData.gameId) !== gameId) {
      throw new Error(`This profile belongs to ${rawData.gameId}, not ${gameId}.`);
    }
    const name = profileName(rawData.profile);
    if (!Array.isArray(rawData.enabledModIds) || rawData.enabledModIds.length > 10000) {
      throw new Error('Invalid mod list in profile file.');
    }
    const desired = [...new Set(rawData.enabledModIds.map(validateName))];
    const { root, mods } = installer.profileState(gameId);
    const desiredKeys = new Set(desired.map((item) => item.toLowerCase()));
    const snapshot = {
      gameId,
      name,
      root,
      enabled: [...mods.values()].filter((mod) => desiredKeys.has(mod.name.toLowerCase())).map((mod) => mod.name),
      ...(rawData.tweaks !== undefined ? { tweaks: normalizeTweaks(gameId, rawData.tweaks) } : {}),
    };
    const nextConfig = store.update((next) => {
      if (!next.profiles.includes(name)) {
        if (next.profiles.length >= 100) throw new Error('The library already has 100 profiles.');
        next.profiles.push(name);
      }
      storeSnapshot(next, snapshot);
    });
    return activate(name, gameId) || nextConfig;
  }

  return { activate, save, remove, exportData, importData, recover };
}

module.exports = { createProfileService };
