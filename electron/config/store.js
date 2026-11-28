const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const DEFAULT_CONFIG = require('../../shared/default-config.json');
const { validateName, validateGameId, validatePath } = require('../files/paths');

const gameIds = Object.keys(DEFAULT_CONFIG.games);

function normalizeLaunchArgs(args) {
  if (args === undefined) return [];
  if (!Array.isArray(args) || args.length > 16) throw new Error('Invalid launch options.');
  const result = [];
  for (const arg of args) {
    if (typeof arg !== 'string') throw new Error('Invalid launch option.');
    const trimmed = arg.trim();
    if (!trimmed || trimmed.length > 64 || /[\u0000-\u001f;&|<>`$]/.test(trimmed)) {
      throw new Error('Invalid launch option.');
    }
    if (!result.includes(trimmed)) result.push(trimmed);
  }
  return result;
}

function normalizeApiKey(value) {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new Error('Invalid Nexus API key.');
  const trimmed = value.trim();
  if (trimmed.length > 256 || /[\s\u0000-\u001f]/.test(trimmed)) {
    throw new Error('Invalid Nexus API key.');
  }
  return trimmed;
}

function normalizeWorkshopIds(ids) {
  if (ids === undefined) return [];
  if (!Array.isArray(ids) || ids.length > 10000 || ids.some((id) => typeof id !== 'string' || !/^\d{1,20}$/.test(id))) {
    throw new Error('Invalid Workshop mod list in settings.');
  }
  return [...new Set(ids)];
}

function normalizeTweaks(gameId, input, previous = DEFAULT_CONFIG.games[gameId].tweaks) {
  if (input === undefined) return { ...previous };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid gameplay tweaks.');
  const next = { ...previous };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(previous, key) || typeof value !== typeof previous[key] ||
      (typeof value === 'number' && !Number.isInteger(value)) ||
      (key === 'SpeedMultiplier' && ![0, 2, 4, 8].includes(value)) ||
      (key === 'NoGrindAmount' && (value < 0 || value > 99)) ||
      (key === 'KeyPageLimit' && ![5, 10, 25, 99].includes(value))) {
      throw new Error('Invalid gameplay tweak: ' + key + '.');
    }
    next[key] = value;
  }
  return next;
}

function profileName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100 || /[\u0000-\u001f]/.test(value)) {
    throw new Error('Enter a profile name up to 100 characters.');
  }
  return value.trim();
}

function normalizeConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid settings file.');
  const config = structuredClone(DEFAULT_CONFIG);
  config.schemaVersion = 1;
  if (data.schemaVersion && data.schemaVersion !== 1) throw new Error('Unsupported settings version.');
  if (data.activeGame !== undefined) config.activeGame = validateGameId(data.activeGame);
  if (data.nexusApiKey !== undefined) config.nexusApiKey = normalizeApiKey(data.nexusApiKey);
  if (data.profiles !== undefined) {
    if (!Array.isArray(data.profiles) || !data.profiles.length ||
      data.profiles.some((name) => typeof name !== 'string' || !name.trim() || name.length > 100)) {
      throw new Error('Invalid profiles in settings.');
    }
    config.profiles = [...new Set(data.profiles.map(profileName))];
  }
  config.gameProfiles = {};
  for (const id of gameIds) {
    const selected = data.gameProfiles?.[id] ?? (id === config.activeGame ? data.activeProfile : undefined);
    config.gameProfiles[id] = config.profiles.includes(selected) ? selected : config.profiles[0];
    const stored = data.games?.[id] ?? {};
    const game = config.games[id];
    for (const field of ['gamePath', 'modsPath', 'fallbackModsPath']) {
      if (stored[field] !== undefined) game[field] = validatePath(stored[field]);
    }
    game.baseModInstalled = stored.baseModInstalled === true;
    if (stored.enabledModIds !== undefined) {
      if (!Array.isArray(stored.enabledModIds)) throw new Error('Invalid enabled mods in settings.');
      game.enabledModIds = [...new Set(stored.enabledModIds.map(validateName))];
    }
    game.disabledWorkshopIds = normalizeWorkshopIds(stored.disabledWorkshopIds);
    game.launchArgs = normalizeLaunchArgs(stored.launchArgs);
    game.tweaks = normalizeTweaks(id, stored.tweaks);
  }
  config.activeProfile = config.gameProfiles[config.activeGame];
  config.profileSnapshots = [];
  if (data.profileSnapshots !== undefined) {
    if (!Array.isArray(data.profileSnapshots) || data.profileSnapshots.length > config.profiles.length * gameIds.length) {
      throw new Error('Invalid saved profiles.');
    }
    const keys = new Set();
    for (const snapshot of data.profileSnapshots) {
      const name = profileName(snapshot?.name);
      const gameId = validateGameId(snapshot.gameId);
      const root = validatePath(snapshot.root);
      const key = JSON.stringify([gameId, name]);
      if (!root || keys.has(key) || !config.profiles.includes(name) ||
          !Array.isArray(snapshot.enabled) || snapshot.enabled.length > 10000) throw new Error('Invalid saved profile.');
      keys.add(key);
      config.profileSnapshots.push({ name, gameId, root, enabled: [...new Set(snapshot.enabled.map(validateName))] });
    }
  }
  return config;
}

function writeFileAtomic(filePath, contents) {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, contents, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filePath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

function writeAtomic(filePath, value) {
  writeFileAtomic(filePath, JSON.stringify(value, null, 2));
}

function createConfigStore(filePath, persist = writeAtomic) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  function read() {
    try {
      return normalizeConfig(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') return normalizeConfig({});
      throw new Error('Could not read settings. The existing settings file has been preserved.', { cause: error });
    }
  }

  function update(change) {
    const config = read();
    change(config);
    const validated = normalizeConfig(config);
    persist(filePath, validated);
    return validated;
  }

  function patch(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !['activeGame', 'activeProfile', 'nexusApiKey', 'games'].includes(key))) {
      throw new Error('Invalid settings change.');
    }
    return update((config) => {
      if (input.activeGame !== undefined) config.activeGame = validateGameId(input.activeGame);
      if (input.nexusApiKey !== undefined) config.nexusApiKey = normalizeApiKey(input.nexusApiKey);
      if (input.activeProfile !== undefined) {
        if (!config.profiles.includes(input.activeProfile)) throw new Error('Choose an existing profile.');
        config.gameProfiles[config.activeGame] = input.activeProfile;
      }
      if (input.games !== undefined) {
        if (!input.games || typeof input.games !== 'object' || Array.isArray(input.games)) throw new Error('Invalid game settings.');
        for (const [id, change] of Object.entries(input.games)) {
          validateGameId(id);
          if (!change || typeof change !== 'object' || Array.isArray(change) ||
            Object.keys(change).some((key) => !['gamePath', 'modsPath', 'launchArgs', 'tweaks'].includes(key))) {
            throw new Error('Only game and mods folders, launch options, or gameplay tweaks can be changed here.');
          }
          for (const [field, value] of Object.entries(change)) {
            if (field === 'launchArgs') config.games[id].launchArgs = normalizeLaunchArgs(value);
            else if (field === 'tweaks') config.games[id].tweaks = normalizeTweaks(id, value, config.games[id].tweaks);
            else config.games[id][field] = validatePath(value);
          }
        }
      }
    });
  }

  return { read, update, patch };
}

module.exports = { createConfigStore, writeAtomic, writeFileAtomic, profileName };
