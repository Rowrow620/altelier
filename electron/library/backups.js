const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { existingStat, validateGameId } = require('../files/paths');
const { readSmallFile } = require('../files/read');

const MAX_BACKUPS_LISTED = 20;
const MAX_BACKUP_FILES = 20_000;
const MAX_BACKUP_BYTES = 512 * 1024 * 1024;

function defaultLocalLow() {
  return path.join(os.homedir(), 'AppData', 'LocalLow');
}

function saveDirectoryForGame(gameId, localLowRoot = defaultLocalLow()) {
  const id = validateGameId(gameId);
  return id === 'lobotomy'
    ? path.join(localLowRoot, 'Project_Moon', 'Lobotomy')
    : path.join(localLowRoot, 'Project_Moon', 'LibraryOfRuina');
}

function copySafeTree(src, dst) {
  let fileCount = 0;
  let totalBytes = 0;
  function walk(fromDir, toDir) {
    fs.mkdirSync(toDir, { recursive: true });
    for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.atelier-')) continue;
      const srcPath = path.join(fromDir, entry.name);
      const dstPath = path.join(toDir, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath, dstPath);
      } else if (entry.isFile()) {
        const stat = existingStat(srcPath);
        if (!stat) continue;
        fileCount++;
        totalBytes += stat.size;
        if (fileCount > MAX_BACKUP_FILES || totalBytes > MAX_BACKUP_BYTES) {
          throw new Error('Save folder exceeds backup safety limits.');
        }
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  }
  walk(src, dst);
  return { fileCount, totalBytes };
}

function createBackupService({ backupsRoot, localLowRoot = defaultLocalLow() }) {
  function gameBackupRoot(gameId) {
    return path.join(backupsRoot, validateGameId(gameId));
  }

  function list(gameId) {
    const id = validateGameId(gameId);
    const savePath = saveDirectoryForGame(id, localLowRoot);
    const saveExists = Boolean(existingStat(savePath)?.isDirectory());
    const root = gameBackupRoot(id);
    if (!existingStat(root)?.isDirectory()) {
      return { gameId: id, savePath, saveExists, backups: [] };
    }
    const entries = [];
    for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name.startsWith('.')) continue;
      const metaRaw = readSmallFile(path.join(root, dir.name, 'backup.json'), 16 * 1024);
      if (!metaRaw) continue;
      try {
        const meta = JSON.parse(metaRaw.toString('utf8'));
        if (meta?.id === dir.name && typeof meta.createdAt === 'string') {
          entries.push(meta);
        }
      } catch {
        // Ignore invalid backup metadata
      }
    }
    entries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return { gameId: id, savePath, saveExists, backups: entries.slice(0, MAX_BACKUPS_LISTED) };
  }

  function create(gameId, label = '') {
    const id = validateGameId(gameId);
    const savePath = saveDirectoryForGame(id, localLowRoot);
    if (!existingStat(savePath)?.isDirectory()) {
      throw new Error('No save data folder was found to back up yet.');
    }
    const root = gameBackupRoot(id);
    fs.mkdirSync(root, { recursive: true });
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const backupId = `${stamp}-${randomUUID().slice(0, 6)}`;
    const tmpDir = path.join(root, `.tmp-${backupId}`);
    const finalDir = path.join(root, backupId);
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      const { fileCount, totalBytes } = copySafeTree(savePath, path.join(tmpDir, 'data'));
      const meta = {
        id: backupId,
        gameId: id,
        label: String(label || '').trim().slice(0, 80),
        createdAt: now.toISOString(),
        fileCount,
        totalBytes,
      };
      fs.writeFileSync(path.join(tmpDir, 'backup.json'), JSON.stringify(meta, null, 2), 'utf8');
      fs.renameSync(tmpDir, finalDir);
      if (meta.label.startsWith('Auto-backup:')) {
        const autoBackups = list(id).backups.filter((entry) => entry.label.startsWith('Auto-backup:'));
        for (const stale of autoBackups.slice(5)) {
          fs.rmSync(path.join(root, stale.id), { recursive: true, force: true });
        }
      }
      return list(id);
    } catch (error) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw error;
    }
  }

  function restore(gameId, backupId) {
    const id = validateGameId(gameId);
    if (typeof backupId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(backupId)) {
      throw new Error('Invalid save backup selection.');
    }
    const root = gameBackupRoot(id);
    const sourceData = path.join(root, backupId, 'data');
    if (!existingStat(sourceData)?.isDirectory()) {
      throw new Error('Selected save backup could not be found.');
    }
    const savePath = saveDirectoryForGame(id, localLowRoot);
    if (existingStat(savePath)?.isDirectory()) {
      create(id, 'Before restore');
      fs.rmSync(savePath, { recursive: true, force: true });
    }
    copySafeTree(sourceData, savePath);
    return list(id);
  }

  return { list, create, restore };
}

module.exports = { createBackupService, saveDirectoryForGame };
