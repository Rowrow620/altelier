const fs = require('node:fs');
const path = require('node:path');
const { games } = require('../../shared/default-config.json');
const { readSmallFile } = require('../files/read');
const { childPath, existingStat, modsRoot } = require('../files/paths');
const { getModsDirectory } = require('../games/service');
const { inactiveDirectory, stableName } = require('../install/activation');
const { metadata, readRecord } = require('../install/record');

const mimeTypes = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp', '.gif': 'gif' };

function entries(directory, limit) {
  const result = [];
  const dir = fs.opendirSync(directory);
  try {
    while (result.length < limit) {
      const entry = dir.readSync();
      if (!entry) break;
      result.push(entry);
    }
    return result;
  } finally {
    dir.closeSync();
  }
}

function readText(directory, filename) {
  try {
    return readSmallFile(childPath(directory, filename), 128 * 1024)?.toString('utf8') ?? '';
  } catch {
    return '';
  }
}

function xmlText(xml, tag) {
  const value = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i').exec(xml)?.[1]?.trim();
  return value?.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity]);
}

function categorize(name, description) {
  const text = (name + ' ' + description).toLowerCase();
  if (/ego|weapon|suit|gift/.test(text)) return 'E.G.O & Gear';
  if (/agent|sprite|studio|cosmetic/.test(text)) return 'Agent Customization';
  if (/creature|abnormalit/.test(text)) return 'Abnormalities';
  if (/reception|page|invitation|floor/.test(text)) return 'Receptions & Pages';
  if (/speed|forward|work|auto|clean|lobpoint/.test(text)) return 'Quality of Life';
  return 'Gameplay Tweaks';
}

function describe(game, folder, source, enabled) {
  const folderName = path.basename(folder);
  const localName = stableName(folderName);
  const { info, stage: xml, readme, version, source: detectedSource } = metadata(folder, game.id);
  const record = source === 'local' ? readRecord(folder, game.id) : undefined;
  const nexus = source === 'local' ? record?.source ?? detectedSource : undefined;
  const fields = new Map();
  for (const line of info.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator !== -1) fields.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }
  const workshop = xmlText(xml, 'Workshop') ?? '';
  const fallbackName = localName.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const name = xmlText(workshop, 'Title') || readme.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    fields.get('name') || fields.get('id') || fallbackName;
  const paragraph = readme.split(/\r?\n\r?\n/).find((part) => part.length > 20 && !part.startsWith('#'));
  const description = xmlText(workshop, 'Description') || fields.get('description') || paragraph || '';
  const domain = games[game.id].nexusDomain;
  return {
    id: source === 'workshop' ? 'workshop:' + folderName : localName,
    source, folderName, name, path: folder, enabled,
    version: record?.version ?? version ?? '',
    author: fields.get('author') || xmlText(workshop, 'Author') || 'Community',
    description: description.replace(/[*_#]/g, '').trim().slice(0, 180),
    fullDescription: readme || description || info,
    category: xmlText(workshop, 'Tag') || categorize(name, description),
    hasConfig: Boolean(existingStat(path.join(folder, 'config.txt'))?.isFile()),
    hasReadme: Boolean(readme),
    fileCount: record?.fileCount ?? entries(folder, 10_000).length,
    nexusModId: nexus?.modId,
    nexusUrl: source === 'workshop' ? '' : nexus?.url ?? 'https://www.nexusmods.com/' + domain + '/mods/?keyword=' + encodeURIComponent(name),
    workshopUrl: source === 'workshop' ? 'https://steamcommunity.com/sharedfiles/filedetails/?id=' + folderName : undefined,
  };
}

function listFolders(directory, workshop = false) {
  if (!directory || !existingStat(directory)?.isDirectory()) return [];
  const root = modsRoot(directory);
  return entries(root, 10_000).filter((entry) => entry.isDirectory() &&
    (workshop ? /^\d{1,20}$/.test(entry.name) : !entry.name.startsWith('.atelier-')))
    .flatMap((entry) => {
      try { return [childPath(root, entry.name)]; } catch { return []; }
    });
}

function findPreviews(folder) {
  const images = [];
  const pending = [{ folder: modsRoot(folder), depth: 0 }];
  let remaining = 300;
  while (pending.length && remaining > 0 && images.length < 6) {
    const { folder: directory, depth } = pending.shift();
    const children = entries(directory, remaining);
    remaining -= children.length;
    children.sort((left, right) => Number(/^preview\./i.test(right.name)) - Number(/^preview\./i.test(left.name)));
    for (const child of children) {
      if (images.length === 6) break;
      try {
        const file = childPath(directory, child.name);
        if (child.isDirectory() && depth < 2) pending.push({ folder: file, depth: depth + 1 });
        const format = mimeTypes[path.extname(child.name).toLowerCase()];
        if (!child.isFile() || !format) continue;
        const data = readSmallFile(file, 1024 * 1024);
        if (data?.length) images.push('data:image/' + format + ';base64,' + data.toString('base64'));
      } catch {
        // A preview can be removed while the library is open.
      }
    }
  }
  return images;
}

function createLibrary({ store, workshopDirectories, localFolder }) {
  const workshopCache = new Map();

  function describeWorkshop(game, folder, enabled) {
    const manifestPath = path.join(folder, 'StageModInfo.xml');
    const mtimeMs = existingStat(manifestPath)?.mtimeMs ?? existingStat(folder)?.mtimeMs ?? 0;
    const cached = workshopCache.get(folder);
    if (cached && cached.mtimeMs === mtimeMs) {
      return { ...cached.mod, enabled };
    }
    const mod = describe(game, folder, 'workshop', enabled);
    workshopCache.set(folder, { mtimeMs, mod });
    return mod;
  }

  function scan(game) {
    const directory = getModsDirectory(game);
    const root = directory && existingStat(directory)?.isDirectory() ? modsRoot(directory) : '';
    const inactive = root && inactiveDirectory(root);
    const disabledWorkshop = new Set(game.disabledWorkshopIds ?? []);
    const result = [
      ...listFolders(root).map((folder) => describe(game, folder, 'local',
        stableName(path.basename(folder)) === path.basename(folder))),
      ...listFolders(inactive).map((folder) => describe(game, folder, 'local', false)),
    ];
    const items = new Set();
    for (const workshop of workshopDirectories(game)) {
      for (const folder of listFolders(workshop, true)) {
        const id = path.basename(folder);
        if (items.has(id)) continue;
        items.add(id);
        result.push(describeWorkshop(game, folder, !disabledWorkshop.has(id)));
      }
    }
    return result.sort((left, right) => left.name.localeCompare(right.name));
  }

  function folder(gameId, modId) {
    if (typeof modId !== 'string' || !modId.startsWith('workshop:')) return localFolder(gameId, modId);
    const itemId = modId.slice('workshop:'.length);
    if (!/^\d{1,20}$/.test(itemId)) throw new Error('Invalid Workshop item.');
    const game = store.read().games[gameId];
    for (const workshop of workshopDirectories(game)) {
      if (!existingStat(workshop)?.isDirectory()) continue;
      const item = childPath(modsRoot(workshop), itemId);
      if (existingStat(item)?.isDirectory()) return item;
    }
    throw new Error('Steam Workshop item is no longer installed.');
  }

  return { scan, folder, previews: (gameId, modId) => findPreviews(folder(gameId, modId)) };
}

module.exports = { createLibrary };
