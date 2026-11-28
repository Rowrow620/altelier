const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { existingStat, validateGameId } = require('../files/paths');

const MAX_LOG_TAIL_BYTES = 128 * 1024;
const MAX_LINES = 250;

function defaultLocalLowRoot() {
  return path.join(os.homedir(), 'AppData', 'LocalLow');
}

function gameLogPath(gameId, localLowRoot = defaultLocalLowRoot()) {
  const folder = validateGameId(gameId) === 'ruina' ? 'LibraryOfRuina' : 'LobotomyCorp';
  return path.join(localLowRoot, 'Project Moon', folder, 'Player.log');
}

function readTailLines(filePath, maxBytes = MAX_LOG_TAIL_BYTES) {
  const stat = existingStat(filePath);
  if (!stat?.isFile()) return null;
  const start = Math.max(0, stat.size - maxBytes);
  const length = stat.size - start;
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buffer, 0, length, start);
  } finally {
    fs.closeSync(fd);
  }
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);
  if (start > 0) lines.shift();
  return lines.slice(-MAX_LINES);
}

function readGameLogs(gameId, { localLowRoot = defaultLocalLowRoot() } = {}) {
  const id = validateGameId(gameId);
  const logPath = gameLogPath(id, localLowRoot);
  const lines = readTailLines(logPath);
  if (!lines) {
    return {
      gameId: id,
      logPath,
      exists: false,
      lines: [],
      errorCount: 0,
    };
  }
  const errorLines = lines.filter((line) => /\b(error|fail)\b|exception/i.test(line));
  return {
    gameId: id,
    logPath,
    exists: true,
    lines,
    errorCount: errorLines.length,
  };
}

module.exports = { readGameLogs, gameLogPath };
