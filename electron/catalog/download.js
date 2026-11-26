const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { games } = require('../../shared/default-config.json');
const { validateGameId } = require('../files/paths');
const { ARCHIVE_LIMITS } = require('../install/archive');
const { getNexusDownloadLink } = require('./nexus');

async function downloadFile(url, destination, request = fetch) {
  const response = await request(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) {
    throw new Error('Could not download the mod archive from Nexus Mods.');
  }
  const reader = response.body.getReader();
  const stream = fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 });
  let total = 0;
  try {
    await new Promise((resolve, reject) => {
      stream.on('error', reject);
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > ARCHIVE_LIMITS.archiveBytes) {
              throw new Error('The downloaded archive exceeds the 512 MB limit.');
            }
            if (!stream.write(value)) {
              await new Promise((res) => stream.once('drain', res));
            }
          }
          stream.end(resolve);
        } catch (error) {
          reject(error);
        }
      })();
    });
  } finally {
    stream.destroy();
  }
}

function safeArchiveName(fileName, modId) {
  const base = path.basename(String(fileName || ''), path.extname(String(fileName || '')))
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/\.+$/g, '')
    .trim();
  const clean = base && !/^\.+$/.test(base) ? base.slice(0, 80) : `mod-${modId}`;
  return `${clean}.zip`;
}

function createDownloadService({ store, installer, nexusRequest = fetch }) {
  async function downloadAndInstall({ gameId, modId, fileId, fileName, nexusUrl, version }) {
    const id = validateGameId(gameId);
    if (!Number.isSafeInteger(modId) || modId <= 0 || !Number.isSafeInteger(fileId) || fileId <= 0) {
      throw new Error('Invalid Nexus mod or file selection.');
    }
    const apiKey = store.read().nexusApiKey?.trim();
    const domain = games[id].nexusDomain;
    const downloadUrl = await getNexusDownloadLink(domain, modId, fileId, apiKey, nexusRequest);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-dl-'));
    const tempZip = path.join(tempDir, safeArchiveName(fileName, modId));
    try {
      await downloadFile(downloadUrl, tempZip, nexusRequest);
      return await installer.install(id, tempZip, {
        nexusUrl: typeof nexusUrl === 'string' ? nexusUrl : `https://www.nexusmods.com/${domain}/mods/${modId}`,
        version: typeof version === 'string' ? version : undefined,
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  return { downloadAndInstall };
}

module.exports = { createDownloadService, downloadFile };
