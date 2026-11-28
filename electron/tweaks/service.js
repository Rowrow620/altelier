const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomic } = require('../config/store');
const { childPath, existingStat, modsRoot } = require('../files/paths');

const folderName = '.atelier-tweaks';
const markerName = '.owner';
const title = 'Atelier Tweaks';
const packageId = 'com.rowrow620.atelier.tweaks';
const packages = {
  lobotomy: {
    assets: ['AtelierLobotomyTweaks.dll'],
    manifests: {
      'Info/GlobalInfo.xml': '<info><ID>AtelierLobotomyTweaks</ID></info>\n',
      'Info/en/info.xml': '<info><name>Atelier Tweaks</name><descs><desc>Gameplay settings from Atelier.</desc></descs></info>\n',
    },
  },
  ruina: {
    assets: ['Assemblies/AtelierTweaks.dll', 'Assemblies/0Harmony.dll', 'Harmony-LICENSE.txt'],
    manifests: {
      'StageModInfo.xml': '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<NormalInvitation><Version>1.0</Version><Workshop>' +
        '<ID>' + packageId + '</ID><Title>' + title + '</Title>' +
        '<Description>Gameplay settings from Atelier.</Description><Tag>Tweak</Tag>' +
        '</Workshop><InvitationFile /></NormalInvitation>\n',
    },
  },
};

function ensureFolders(root, segments) {
  for (const segment of segments) {
    const folder = childPath(root, segment);
    if (!existingStat(folder)) fs.mkdirSync(folder);
    root = modsRoot(folder);
  }
  return root;
}

function syncAssets(root, gameId) {
  for (const asset of packages[gameId].assets) {
    const segments = asset.split('/');
    const name = segments.pop();
    const directory = ensureFolders(root, segments);
    const destination = childPath(directory, name);
    const contents = fs.readFileSync(path.join(__dirname, gameId, asset));
    const current = existingStat(destination);
    if (current && !current.isFile()) throw new Error('An Atelier Tweaks file is already in use.');
    if (current?.size === contents.length && fs.readFileSync(destination).equals(contents)) continue;
    writeFileAtomic(destination, contents);
  }
}

function installPackage(target, root, gameId, config) {
  const bundle = packages[gameId];
  const parent = path.dirname(root);
  const staging = fs.mkdtempSync(path.join(parent, '.atelier-tweaks-'));
  try {
    syncAssets(staging, gameId);
    for (const [name, contents] of Object.entries(bundle.manifests)) {
      const file = path.join(staging, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents, 'utf8');
    }
    fs.writeFileSync(path.join(staging, markerName), packageId, 'utf8');
    fs.writeFileSync(path.join(staging, 'tweaks.cfg'), config, 'utf8');
    fs.renameSync(staging, target);
  } finally {
    if (existingStat(staging) && path.dirname(fs.realpathSync(staging)) === parent) {
      fs.rmSync(staging, { recursive: true });
    }
  }
}

function prepareTweaks(game, directory) {
  if (!directory) return;
  const tweaks = game.tweaks;
  const enabled = tweaks.SpeedMultiplier > 0 || Object.values(tweaks).includes(true);
  if (!enabled && !existingStat(path.join(directory, folderName, markerName))) return;

  const root = ensureFolders(modsRoot(game.gamePath), path.relative(game.gamePath, directory).split(path.sep));
  const target = path.join(root, folderName);
  const config = Object.entries(tweaks).map(([key, value]) => key + '=' + value).join('\n') + '\n';
  if (!existingStat(target)) {
    installPackage(target, root, game.id, config);
    return;
  }

  const installed = modsRoot(target);
  const marker = childPath(installed, markerName);
  if (!existingStat(marker)?.isFile() || fs.readFileSync(marker, 'utf8') !== packageId) {
    throw new Error('The Atelier Tweaks folder is already in use. Move it before applying tweaks.');
  }
  const configFile = childPath(installed, 'tweaks.cfg');
  const configStat = existingStat(configFile);
  if (configStat && !configStat.isFile()) {
    throw new Error('Could not update the Atelier Tweaks configuration.');
  }
  syncAssets(installed, game.id);
  writeFileAtomic(configFile, config);
}

module.exports = { prepareTweaks };
