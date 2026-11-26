const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { validateName, validatePath } = require('../files/paths');

const ARCHIVE_LIMITS = {
  archiveBytes: 512 * 1024 * 1024,
  fileBytes: 256 * 1024 * 1024,
  totalBytes: 2 * 1024 * 1024 * 1024,
  entries: 20000,
};

function inspectArchive(filePath, limits = ARCHIVE_LIMITS) {
  validatePath(filePath);
  if (path.extname(filePath).toLowerCase() !== '.zip') throw new Error('Choose a ZIP file.');
  const modName = validateName(path.basename(filePath, path.extname(filePath)));
  const descriptor = fs.openSync(filePath, 'r');
  let zip;
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error('Choose a ZIP file.');
    if (stat.size > limits.archiveBytes) throw new Error('The ZIP is too large. The limit is 512 MB.');
    const buffer = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      const count = fs.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
      if (!count) throw new Error('The ZIP changed while it was being read. Try importing it again.');
      offset += count;
    }
    if (fs.fstatSync(descriptor).size !== stat.size) throw new Error('The ZIP changed while it was being read. Try importing it again.');
    zip = new AdmZip(buffer, { readEntries: false });
  } finally {
    fs.closeSync(descriptor);
  }
  if (zip.getEntryCount() > limits.entries) throw new Error('The ZIP contains too many files.');
  const entries = zip.getEntries();
  if (!entries.length || entries.length > limits.entries) throw new Error('The ZIP is empty or contains too many files.');

  const paths = new Map();
  let totalBytes = 0;
  let fileCount = 0;
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    const parts = (entry.isDirectory ? name.slice(0, -1) : name).split('/');
    if (parts.length > 32) throw new Error('The ZIP contains too many nested folders.');
    parts.forEach(validateName);
    const relative = parts.join('/');
    if (relative.length > 220) throw new Error('The ZIP contains an excessively long file path.');
    const key = relative.toLowerCase();
    if (paths.has(key)) throw new Error('The ZIP contains duplicate file or folder names.');
    paths.set(key, { directory: entry.isDirectory, relative });

    const kind = (entry.attr >>> 16) & 0xf000;
    if (kind && kind !== 0x8000 && kind !== 0x4000) throw new Error('The ZIP contains a link or special file.');
    if (entry.header.encrypted) throw new Error('Password-protected ZIPs are not supported.');
    if (!entry.isDirectory) {
      fileCount++;
      if (![0, 8].includes(entry.header.method)) throw new Error('The ZIP uses an unsupported compression method.');
      if (!Number.isSafeInteger(entry.header.size) || entry.header.size < 0 || entry.header.size > limits.fileBytes) {
        throw new Error('A file in the ZIP exceeds the 256 MB limit.');
      }
      if (entry.header.method === 0 && entry.header.size !== entry.header.compressedSize) {
        throw new Error('The ZIP contains invalid file sizes.');
      }
      totalBytes += entry.header.size;
      if (totalBytes > limits.totalBytes) throw new Error('The ZIP would expand beyond the 2 GB limit.');
    }
  }
  if (!fileCount) throw new Error('The ZIP contains no files.');
  for (const { relative } of paths.values()) {
    const parts = relative.split('/');
    parts.pop();
    while (parts.length) {
      const parent = paths.get(parts.join('/').toLowerCase());
      if (parent && !parent.directory) throw new Error('The ZIP contains conflicting file and folder names.');
      parts.pop();
    }
  }
  return { modName, entries };
}

async function extractArchive(entries, destination) {
  for (const { entry, name } of entries) {
    const target = path.join(destination, ...name.split('/'));
    if (entry.isDirectory) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    const data = await new Promise((resolve, reject) => entry.getDataAsync(
      (buffer, error) => error ? reject(error) : resolve(buffer),
    ));
    if (data.length !== entry.header.size) throw new Error('The ZIP contains a damaged file.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data, { flag: 'wx' });
  }
}

module.exports = { inspectArchive, extractArchive, ARCHIVE_LIMITS };
