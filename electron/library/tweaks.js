const fs = require('node:fs');
const path = require('node:path');
const { getModsDirectory } = require('../games/service');
const lobotomy = require('../games/lobotomy');
const ruina = require('../games/ruina');
const { modsRoot, validateGameId } = require('../files/paths');

const TWEAKS_FOLDER = '.atelier-tweaks';
const RUINA_DLL_SRC = path.join(__dirname, '..', 'tweaks', 'ruina', 'Assemblies', 'AtelierTweaks.dll');
const LOBOTOMY_DLL_SRC = path.join(__dirname, '..', 'tweaks', 'lobotomy', 'AtelierLobotomyTweaks.dll');

function hasActiveTweaks(gameId, tweaks) {
  if (!tweaks || typeof tweaks !== 'object') return false;
  if (gameId === 'ruina') {
    return Boolean(
      tweaks.NoGrindBooks ||
      tweaks.NoGrindBurnCards ||
      tweaks.MultiplePurpleBooks ||
      tweaks.MultipleGoldBooks ||
      tweaks.MultipleCommonBooks
    );
  }
  if (gameId === 'lobotomy') {
    return Boolean(
      tweaks.UnlimitedLob ||
      tweaks.UnlimitedEgo ||
      tweaks.UnlockAllEgos ||
      tweaks.KeepAgentsForever ||
      Number(tweaks.SpeedMultiplier) > 0
    );
  }
  return false;
}

function targetModsRoot(game) {
  if (!game) return '';
  if (game.id === 'ruina') {
    const dir = ruina.nativeMods(game) || getModsDirectory(game);
    return dir ? modsRoot(dir) : '';
  }
  const dir = lobotomy.nativeMods(game) || getModsDirectory(game);
  return dir ? modsRoot(dir) : '';
}

function ruinaStageModXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<NormalInvitation xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <Version>1.0</Version>',
    '  <Workshop>',
    '    <ID>com.rowrow620.atelier.tweaks</ID>',
    '    <Title>Atelier Tweaks</Title>',
    '    <Description>Built-in Atelier gameplay tweaks.</Description>',
    '    <Tag />',
    '    <PreviewImage />',
    '  </Workshop>',
    '</NormalInvitation>',
    '',
  ].join('\n');
}

function ruinaConfigText(tweaks = {}) {
  const amt = Number(tweaks.NoGrindAmount) > 0 ? Number(tweaks.NoGrindAmount) : 999;
  const lim = Number(tweaks.KeyPageLimit) > 0 ? Number(tweaks.KeyPageLimit) : 99;
  return [
    `NoGrindBooks=${Boolean(tweaks.NoGrindBooks)}`,
    `NoGrindBurnCards=${Boolean(tweaks.NoGrindBurnCards)}`,
    `NoGrindAmount=${amt}`,
    `MultiplePurpleBooks=${Boolean(tweaks.MultiplePurpleBooks)}`,
    `MultipleGoldBooks=${Boolean(tweaks.MultipleGoldBooks)}`,
    `MultipleCommonBooks=${Boolean(tweaks.MultipleCommonBooks)}`,
    `KeyPageLimit=${lim}`,
    '',
  ].join('\n');
}

function lobotomyConfigText(tweaks = {}) {
  const spd = [0, 2, 4, 8].includes(Number(tweaks.SpeedMultiplier)) ? Number(tweaks.SpeedMultiplier) : 0;
  return [
    `UnlimitedLob=${Boolean(tweaks.UnlimitedLob)}`,
    `UnlimitedEgo=${Boolean(tweaks.UnlimitedEgo)}`,
    `UnlockAllEgos=${Boolean(tweaks.UnlockAllEgos)}`,
    `KeepAgentsForever=${Boolean(tweaks.KeepAgentsForever)}`,
    `SpeedMultiplier=${spd}`,
    '',
  ].join('\n');
}

function syncTweaks(game, modded) {
  const id = validateGameId(game?.id);
  const root = targetModsRoot(game);
  if (!root || !fs.existsSync(root)) return { synced: false, active: false };

  const targetDir = path.join(root, TWEAKS_FOLDER);
  const active = Boolean(modded && hasActiveTweaks(id, game.tweaks));

  if (!active) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    return { synced: true, active: false };
  }

  fs.mkdirSync(targetDir, { recursive: true });
  if (id === 'ruina') {
    const asmDir = path.join(targetDir, 'Assemblies');
    fs.mkdirSync(asmDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'StageModInfo.xml'), ruinaStageModXml(), 'utf8');
    fs.writeFileSync(path.join(targetDir, 'tweaks.cfg'), ruinaConfigText(game.tweaks), 'utf8');
    if (fs.existsSync(RUINA_DLL_SRC)) {
      fs.copyFileSync(RUINA_DLL_SRC, path.join(asmDir, 'AtelierTweaks.dll'));
    }
  } else {
    const infoDir = path.join(targetDir, 'Info');
    const enDir = path.join(infoDir, 'en');
    fs.mkdirSync(enDir, { recursive: true });
    fs.writeFileSync(path.join(infoDir, 'Info.txt'), 'Name: Atelier Tweaks\nAuthor: Atelier\n', 'utf8');
    fs.writeFileSync(
      path.join(infoDir, 'GlobalInfo.xml'),
      '<?xml version="1.0" encoding="utf-8"?>\n<ModGlobalInfoXml><modid>-1</modid></ModGlobalInfoXml>\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(enDir, 'info.xml'),
      '<info><name>Atelier Tweaks</name><descs><desc>Built-in Atelier gameplay tweaks.</desc></descs></info>\n',
      'utf8',
    );
    fs.writeFileSync(path.join(targetDir, 'tweaks.cfg'), lobotomyConfigText(game.tweaks), 'utf8');
    if (fs.existsSync(LOBOTOMY_DLL_SRC)) {
      fs.copyFileSync(LOBOTOMY_DLL_SRC, path.join(targetDir, 'AtelierLobotomyTweaks.dll'));
    }
  }

  return { synced: true, active: true, targetDir };
}

module.exports = { hasActiveTweaks, syncTweaks, TWEAKS_FOLDER };
