const fs = require('node:fs');
const path = require('node:path');
const { games } = require('../../shared/default-config.json');

function validateName(name) {
  if (
    typeof name !== 'string' || !name || name.length > 180 ||
    name === '.' || name === '..' || name.toLowerCase().startsWith('.atelier-') ||
    /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(name)
  ) {
    throw new Error('Invalid mod or file name.');
  }
  return name;
}

function validateGameId(gameId) {
  if (typeof gameId !== 'string' || !Object.hasOwn(games, gameId)) throw new Error('Choose a supported game.');
  return gameId;
}

function validatePath(value) {
  if (typeof value !== 'string' || value.length > 4096 || value.includes('\0')) {
    throw new Error('Invalid folder path.');
  }
  if (value && !path.isAbsolute(value)) throw new Error('Choose an absolute folder path.');
  return value;
}

function existingStat(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function modsRoot(directory) {
  validatePath(directory);
  if (!directory) throw new Error('Choose a mods folder in Settings.');
  const stat = existingStat(directory);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('The mods folder must be a real folder, without a link or junction.');
  }
  const root = fs.realpathSync(directory);
  if (root === path.parse(root).root) throw new Error('Choose a mods folder inside the drive.');
  return root;
}

function childPath(root, name) {
  validateName(name);
  const target = path.resolve(root, name);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('The mod must stay inside its mods folder.');
  }
  const stat = existingStat(target);
  if (stat?.isSymbolicLink()) throw new Error('Mod links and junctions are not supported.');
  return target;
}

function assertSafeTree(root) {
  const pending = [root];
  let count = 0;
  while (pending.length) {
    const current = pending.pop();
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      throw new Error('Mod links and special files are not supported.');
    }
    if (++count > 100000) throw new Error('This mod contains too many files.');
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) pending.push(path.join(current, entry));
    }
  }
}

function removeChild(root, name) {
  const target = childPath(modsRoot(root), name);
  if (!existingStat(target)) return;
  assertSafeTree(target);
  fs.rmSync(target, { recursive: true });
}

module.exports = { validateName, validateGameId, validatePath, existingStat, modsRoot, childPath, assertSafeTree, removeChild };
