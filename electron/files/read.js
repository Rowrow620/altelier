const fs = require('node:fs');
const { existingStat } = require('./paths');

function readSmallFile(file, limit) {
  const stat = existingStat(file);
  if (!stat?.isFile() || stat.size > limit) return undefined;
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.size > limit || opened.ino !== stat.ino || opened.dev !== stat.dev) return undefined;
    const buffer = Buffer.alloc(opened.size);
    const length = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, length);
  } finally {
    fs.closeSync(descriptor);
  }
}

module.exports = { readSmallFile };
