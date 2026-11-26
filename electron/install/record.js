const path = require('node:path');
const { games } = require('../../shared/default-config.json');
const { readSmallFile } = require('../files/read');
const { existingStat } = require('../files/paths');
const { writeAtomic } = require('../config/store');

const recordFile = '.atelier-install.json';
const readLimit = 128 * 1024;

function nexusSource(gameId, url) {
  if (typeof url !== 'string' || url.length > 2048) return undefined;
  const match = /^https:\/\/(?:www\.)?nexusmods\.com\/(?:games\/)?([a-z0-9]+)\/mods\/(\d{1,15})\/?(?:[?#][^\s]*)?$/i.exec(url.trim());
  if (!match || match[1].toLowerCase() !== games[gameId].nexusDomain || Number(match[2]) < 1) return undefined;
  const modId = Number(match[2]);
  return { modId, url: 'https://www.nexusmods.com/' + games[gameId].nexusDomain + '/mods/' + modId };
}

function localText(directory, name) {
  try { return readSmallFile(path.join(directory, name), readLimit)?.toString('utf8') ?? ''; } catch { return ''; }
}

function metadata(directory, gameId) {
  const infoDir = path.join(directory, 'Info');
  const info = existingStat(infoDir)?.isDirectory() ? localText(infoDir, 'Info.txt') : '';
  const stage = gameId === 'ruina' ? localText(directory, 'StageModInfo.xml') : '';
  const readme = localText(directory, 'README.md');
  const manifestVersion = info.match(/^\s*version\s*:\s*(.+)$/mi)?.[1] ??
    stage.match(/<Version>\s*([^<]+)\s*<\/Version>/i)?.[1];
  const version = manifestVersion?.trim().slice(0, 100) || undefined;
  const infoLink = info.match(/^\s*(?:nexus|nexusurl|url)\s*:\s*(\S+)\s*$/mi)?.[1];
  const readmeLink = readme.match(/\[\s*Nexus Mods\s*\]\((https:\/\/[^)\s]+)\)/i)?.[1];
  const source = nexusSource(gameId, infoLink) ?? nexusSource(gameId, readmeLink);
  return { info, stage, readme, version, source };
}

function readRecord(directory, gameId) {
  try {
    const raw = readSmallFile(path.join(directory, recordFile), 20 * 1024 * 1024);
    if (!raw) return undefined;
    const record = JSON.parse(raw);
    if (record.schema !== 1 || record.gameId !== gameId || !Array.isArray(record.files) || record.files.length > 20000 ||
        record.files.some((file) => typeof file !== 'string' || file.length > 4096)) return undefined;
    return {
      fileCount: record.files.length,
      files: record.files,
      version: typeof record.version === 'string' ? record.version.slice(0, 100) : undefined,
      source: nexusSource(gameId, record.nexusUrl),
    };
  } catch {
    return undefined;
  }
}

function saveRecord(directory, gameId, files, version, source) {
  writeAtomic(path.join(directory, recordFile), {
    schema: 1, gameId, version, nexusUrl: source?.url, files,
  });
}

function readInstallDetails(gameId, options) {
  const source = options.nexusUrl ? nexusSource(gameId, options.nexusUrl) : undefined;
  if (options.nexusUrl && !source) throw new Error('Enter a Nexus Mods link for the selected game.');
  const version = options.version;
  if (version !== undefined && (typeof version !== 'string' || version.length > 100 || /[\u0000-\u001f]/.test(version))) {
    throw new Error('Enter a version up to 100 characters.');
  }
  return { source, version: version?.trim() || undefined };
}

module.exports = { nexusSource, metadata, readRecord, saveRecord, readInstallDetails, recordFile };
