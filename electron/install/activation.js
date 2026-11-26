const fs = require('node:fs');
const path = require('node:path');
const { childPath, existingStat, modsRoot } = require('../files/paths');

const disabledSuffix = '.disabled';
const inactiveSuffix = '.atelier-disabled';

function stableName(name) {
  return name.toLowerCase().endsWith(disabledSuffix) ? name.slice(0, -disabledSuffix.length) : name;
}

function inactiveDirectory(root, create = false) {
  const directory = childPath(path.dirname(root), path.basename(root) + inactiveSuffix);
  if (create && !existingStat(directory)) fs.mkdirSync(directory);
  return existingStat(directory) ? modsRoot(directory) : '';
}

function moveMod(source, root, enabled) {
  const name = stableName(path.basename(source));
  const destinationRoot = enabled ? root : inactiveDirectory(root, true);
  const destination = childPath(destinationRoot, name);
  if (source === destination) return;
  if (existingStat(destination)) throw new Error('Two folders use this mod name. Resolve them before changing it.');
  fs.renameSync(source, destination);
}

module.exports = { stableName, inactiveDirectory, inactiveSuffix, moveMod };
