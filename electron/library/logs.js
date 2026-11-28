const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { existingStat, validateGameId } = require('../files/paths');

const MAX_LOG_TAIL_BYTES = 128 * 1024;
const MAX_LINES = 250;

function defaultLocalLowRoot() {
  return path.join(os.homedir(), 'AppData', 'LocalLow');
}

function gameLogDirectory(gameId, localLowRoot = defaultLocalLowRoot()) {
  const id = validateGameId(gameId);
  const candidates = id === 'ruina'
    ? [
        path.join(localLowRoot, 'Project Moon', 'LibraryOfRuina'),
        path.join(localLowRoot, 'Project_Moon', 'LibraryOfRuina'),
      ]
    : [
        path.join(localLowRoot, 'Project_Moon', 'Lobotomy'),
        path.join(localLowRoot, 'Project Moon', 'Lobotomy'),
        path.join(localLowRoot, 'Project Moon', 'LobotomyCorp'),
      ];
  return candidates.find((dir) => existingStat(dir)?.isDirectory()) ?? candidates[0];
}

function gameLogPath(gameId, localLowRoot = defaultLocalLowRoot()) {
  return path.join(gameLogDirectory(gameId, localLowRoot), 'Player.log');
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

function readGameLogs(gameId, { localLowRoot = defaultLocalLowRoot(), gamePath = '' } = {}) {
  const id = validateGameId(gameId);
  const baseDir = gameLogDirectory(id, localLowRoot);
  const candidates = [
    { id: 'player', label: 'Player.log', logPath: path.join(baseDir, 'Player.log') },
    { id: 'player-prev', label: 'Player-prev.log', logPath: path.join(baseDir, 'Player-prev.log') },
  ];
  if (id === 'lobotomy' && gamePath) {
    candidates.push({
      id: 'basemod',
      label: 'BaseModLog.txt',
      logPath: path.join(gamePath, 'LobotomyCorp_Data', 'Managed', 'BaseMod', 'BaseModLog.txt'),
    });
  }
  const sources = candidates.map((entry) => {
    const lines = readTailLines(entry.logPath);
    if (!lines) {
      return { ...entry, exists: false, lines: [], errorCount: 0 };
    }
    const errorCount = lines.filter((line) => /\b(error|fail)\b|exception/i.test(line)).length;
    return { ...entry, exists: true, lines, errorCount };
  });
  const primary = sources[0];
  return {
    gameId: id,
    logPath: primary.logPath,
    exists: primary.exists,
    lines: primary.lines,
    errorCount: primary.errorCount,
    sources,
  };
}

module.exports = { readGameLogs, gameLogPath };
