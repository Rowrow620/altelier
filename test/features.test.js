const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConfigStore } = require('../electron/config/store');
const { createGameService, getModsDirectory } = require('../electron/games/service');
const { createInstallService } = require('../electron/install/service');
const { createLibrary } = require('../electron/library/scan');
const { createProfileService } = require('../electron/library/profiles');
const { createDiagnosticsService } = require('../electron/library/diagnostics');
const { createBackupService } = require('../electron/library/backups');
const { getNexusModFiles, getNexusDownloadLink } = require('../electron/catalog/nexus');
const { createDownloadService } = require('../electron/catalog/download');
const AdmZip = require('adm-zip');

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-feat-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (rel, content = 'x') => {
    const target = path.join(dir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  };
  const store = createConfigStore(path.join(dir, 'config.json'));
  const installer = createInstallService({
    store,
    getGameModsDir: getModsDirectory,
    activation: () => 'native',
    confirmReplace: async () => true,
  });
  const library = createLibrary({ store, workshopDirectories: () => [], localFolder: installer.folder });
  const profiles = createProfileService({ store, installer, journalPath: path.join(dir, 'profile-switch.json') });
  const diagnostics = createDiagnosticsService({ store, installer });
  return { dir, write, store, installer, library, profiles, diagnostics };
}

test('toggleAll toggles all local mods and works in custom mods folders', (t) => {
  const { dir, write, store, installer, library } = setup(t);
  const customMods = path.join(dir, 'CustomMods');
  write('CustomMods/Alpha/Info.txt', 'Name: Alpha');
  write('CustomMods/Beta/Info.txt', 'Name: Beta');
  store.patch({ games: { lobotomy: { modsPath: customMods } } });

  let scanned = library.scan(store.read().games.lobotomy);
  assert.equal(scanned.length, 2);
  assert(scanned.every((mod) => mod.enabled === true));

  installer.toggleAll('lobotomy', false);
  scanned = library.scan(store.read().games.lobotomy);
  assert(scanned.every((mod) => mod.enabled === false));

  installer.toggleAll('lobotomy', true);
  scanned = library.scan(store.read().games.lobotomy);
  assert(scanned.every((mod) => mod.enabled === true));
});

test('diagnostics detects file conflicts, temp folders, and launchArgs validation', async (t) => {
  const { dir, write, store, diagnostics } = setup(t);
  const gameDir = path.dirname(write('LobotomyCorp/LobotomyCorp.exe'));
  write('LobotomyCorp/LobotomyCorp_Data/Managed/LobotomyBaseModLib.dll');
  write('LobotomyCorp/LobotomyCorp_Data/BaseMods/ModA/shared.dll', 'abc');
  write('LobotomyCorp/LobotomyCorp_Data/BaseMods/ModA/.git/HEAD', 'ref: refs/heads/main');
  write('LobotomyCorp/LobotomyCorp_Data/BaseMods/ModB/shared.dll', 'abcd');
  write('LobotomyCorp/LobotomyCorp_Data/BaseMods/ModB/.git/HEAD', 'ref: refs/heads/main');
  write('LobotomyCorp/LobotomyCorp_Data/BaseMods/ModB/Info.txt', 'Name: ModB');
  write('LobotomyCorp/LobotomyCorp_Data/BaseMods/.atelier-txn-stale/tmp.txt', '12345');

  store.patch({ games: { lobotomy: { gamePath: gameDir, launchArgs: ['-popupwindow', '-nolog'] } } });
  const report = diagnostics.analyze('lobotomy');
  assert.equal(report.validInstall, true);
  assert.equal(report.baseModInstalled, true);
  assert.equal(report.conflicts.length, 1);
  assert.equal(report.conflicts[0].path, 'shared.dll');
  assert.deepEqual(report.conflicts[0].mods, ['ModA', 'ModB']);
  assert.equal(report.storage.tempCount, 1);

  const cleaned = diagnostics.cleanTempFolders('lobotomy');
  assert.equal(cleaned.storage.tempCount, 0);

  assert.throws(() => store.patch({ games: { lobotomy: { launchArgs: ['bad;arg'] } } }), /Invalid launch option/);

  let launchedArgs;
  const gameService = createGameService({
    store,
    start: async ({ args }) => { launchedArgs = args; },
  });
  await gameService.launch('lobotomy', true, () => {});
  assert.deepEqual(launchedArgs, ['-popupwindow', '-nolog']);
});

test('readConfigText, saveConfigText, and profile delete/export behave safely', (t) => {
  const { dir, write, store, installer, profiles } = setup(t);
  const modsDir = path.join(dir, 'Mods');
  write('Mods/Alpha/config.txt', 'speed=2');
  store.patch({ games: { lobotomy: { modsPath: modsDir } } });

  assert.equal(installer.readConfigText('lobotomy', 'Alpha'), 'speed=2');
  installer.saveConfigText('lobotomy', 'Alpha', 'speed=4');
  assert.equal(installer.readConfigText('lobotomy', 'Alpha'), 'speed=4');

  profiles.save('Speedrun', 'lobotomy');
  const exported = profiles.exportData('lobotomy', 'Speedrun');
  assert.equal(exported.profile, 'Speedrun');
  assert.deepEqual(exported.enabledModIds, ['Alpha']);

  assert.throws(() => profiles.remove('Default', 'lobotomy'), /cannot be deleted/);
  const afterDelete = profiles.remove('Speedrun', 'lobotomy');
  assert.equal(afterDelete.profiles.includes('Speedrun'), false);
  assert.equal(afterDelete.activeProfile, 'Default');
});

test('Nexus mod file lookup and direct download install ZIP cleanly', async (t) => {
  const { dir, store, installer, library } = setup(t);
  const modsDir = path.join(dir, 'Mods');
  fs.mkdirSync(modsDir, { recursive: true });
  store.patch({ games: { lobotomy: { modsPath: modsDir } } });

  const zip = new AdmZip();
  zip.addFile('QuickMod/Info.txt', Buffer.from('Name: QuickMod\nAuthor: Tester\n'));
  const zipBuffer = zip.toBuffer();

  const files = await getNexusModFiles('lobotomy', 42, async () => new Response(JSON.stringify({
    data: {
      modFiles: [
        { fileId: 10, name: 'QuickMod.zip', version: '1.2', sizeInBytes: zipBuffer.length, category: 'MAIN', description: '[b]Main file[/b]', date: 1700000000 },
        { fileId: 9, name: 'Old.zip', version: '1.0', sizeInBytes: 100, category: 'ARCHIVED' },
      ],
    },
  }), { status: 200 }));
  assert.equal(files.length, 1);
  assert.equal(files[0].fileId, 10);
  assert.equal(files[0].description, 'Main file');

  await assert.rejects(() => getNexusDownloadLink('lobotomycorporation', 42, 10, ''), /Premium API key/);
  await assert.rejects(
    () => getNexusDownloadLink('lobotomycorporation', 42, 10, 'free-key', async () => new Response('{}', { status: 403 })),
    /Premium account/,
  );

  store.patch({ nexusApiKey: 'test-premium-key' });
  const downloader = createDownloadService({
    store,
    installer,
    nexusRequest: async (url) => {
      if (url.includes('download_link.json')) {
        return new Response(JSON.stringify([{ URI: 'https://cf-files.nexusmods.com/QuickMod.zip' }]), { status: 200 });
      }
      return new Response(zipBuffer, { status: 200 });
    },
  });

  const installed = await downloader.downloadAndInstall({
    gameId: 'lobotomy',
    modId: 42,
    fileId: 10,
    fileName: 'QuickMod.zip',
    nexusUrl: 'https://www.nexusmods.com/lobotomycorporation/mods/42',
    version: '1.2',
  });
  assert.equal(installed.success, true);
  assert.equal(installed.modId, 'QuickMod');
  const mods = library.scan(store.read().games.lobotomy);
  assert.equal(mods.length, 1);
  assert.equal(mods[0].version, '1.2');
});

test('BaseMod version detection, Lobotomy Mod Manager, and compatibility auto-fixes', (t) => {
  const { dir, write, store, diagnostics } = setup(t);
  const gameDir = path.dirname(write('LobotomyCorp/LobotomyCorp.exe'));
  // Synthesize minimal PE binary >= 64 bytes with UTF-16LE FileVersion resource string "4.13.1.0"
  const oldDllBytes = Buffer.concat([Buffer.alloc(64, 0), Buffer.from('FileVersion\0', 'utf16le'), Buffer.from('4.13.1.0\0', 'utf16le')]);
  write('LobotomyCorp/LobotomyCorp_Data/Managed/LobotomyBaseModLib.dll', oldDllBytes);
  write('LobotomyCorp/LobotomyCorp_Data/BaseMods/NestedMod/NestedMod/Info.txt', 'Name: Nested\n');
  write('LobotomyCorp/LobotomyCorp_Data/BaseMods/NestedMod/NestedMod/code.dll', 'HarmonyInstance');
  write('LobotomyCorp/LobotomyCorp_Data/BaseMods/ValidNoDescMod/mod.dll', 'HarmonyInstance');

  store.patch({ games: { lobotomy: { gamePath: gameDir } } });
  let report = diagnostics.analyze('lobotomy');
  assert.equal(report.baseMod.status, 'outdated');
  assert.equal(report.baseMod.version, '4.13.1.0');
  assert(report.compatibility.some((c) => c.id === 'unwrap:NestedMod' && c.fixable));
  assert(!report.compatibility.some((c) => c.modName === 'ValidNoDescMod'));

  report = diagnostics.fixIssue('lobotomy', 'unwrap:NestedMod');
  assert(fs.existsSync(path.join(dir, 'LobotomyCorp/LobotomyCorp_Data/BaseMods/NestedMod/Info.txt')));
  assert(!report.compatibility.some((c) => c.id === 'unwrap:NestedMod'));

  const managerDir = path.dirname(write('ModManager/LobotomyModManager.exe'));
  store.patch({ games: { lobotomy: { gamePath: managerDir } } });
  report = diagnostics.analyze('lobotomy');
  assert.equal(report.baseMod.status, 'ok');
  assert.equal(report.baseMod.loaderName, 'Lobotomy Mod Manager');
});

test('Ruina BaseMods migration, save backups, and profile JSON import', (t) => {
  const { dir, write, store, installer, library, profiles, diagnostics } = setup(t);
  const ruinaDir = path.dirname(write('Ruina/LibraryOfRuina.exe'));
  write('Ruina/LibraryOfRuina_Data/BaseMods/OldRuinaMod/StageModInfo.xml', '<Workshop><Title>Old</Title></Workshop>');
  fs.mkdirSync(path.join(ruinaDir, 'LibraryOfRuina_Data', 'Mods'), { recursive: true });
  store.patch({ activeGame: 'ruina', games: { ruina: { gamePath: ruinaDir } } });

  const pre = diagnostics.analyze('ruina');
  assert(pre.compatibility.some((c) => c.id === 'migrate-ruina:OldRuinaMod' && c.fixable));
  const post = diagnostics.fixIssue('ruina', 'migrate-ruina:OldRuinaMod');
  assert(!post.compatibility.some((c) => c.id === 'migrate-ruina:OldRuinaMod'));
  assert(fs.existsSync(path.join(ruinaDir, 'LibraryOfRuina_Data/Mods/OldRuinaMod/StageModInfo.xml')));

  // Profile import
  const imported = profiles.importData('ruina', {
    version: 1,
    gameId: 'ruina',
    profile: 'ImportedLoadout',
    enabledModIds: ['OldRuinaMod'],
  });
  assert.equal(imported.activeProfile, 'ImportedLoadout');
  assert.equal(library.scan(store.read().games.ruina)[0].enabled, true);

  // Save backups + restore
  const localLow = path.join(dir, 'LocalLow');
  write('LocalLow/Project_Moon/LibraryOfRuina/save.dat', 'original-save');
  const backups = createBackupService({ backupsRoot: path.join(dir, 'backups'), localLowRoot: localLow });
  const created = backups.create('ruina', 'Before testing');
  assert.equal(created.backups.length, 1);

  fs.writeFileSync(path.join(localLow, 'Project_Moon/LibraryOfRuina/save.dat'), 'corrupted-save');
  const afterRestore = backups.restore('ruina', created.backups[0].id);
  assert.equal(afterRestore.backups.length, 2); // includes automatic "Before restore" snapshot
  assert.equal(fs.readFileSync(path.join(localLow, 'Project_Moon/LibraryOfRuina/save.dat'), 'utf8'), 'original-save');
});

test('tweaks config validation, deployment sync, and Ruina loader status', (t) => {
  const { dir, write, store, diagnostics } = setup(t);
  const ruinaDir = path.dirname(write('Ruina/LibraryOfRuina.exe'));
  fs.mkdirSync(path.join(ruinaDir, 'LibraryOfRuina_Data', 'Mods'), { recursive: true });
  store.patch({
    activeGame: 'ruina',
    games: {
      ruina: {
        gamePath: ruinaDir,
        tweaks: { NoGrindBooks: true, MultiplePurpleBooks: true },
      },
      lobotomy: {
        tweaks: { UnlimitedLob: true, SpeedMultiplier: 4 },
      },
    },
  });

  const cfg = store.read();
  assert.equal(cfg.games.ruina.tweaks.NoGrindBooks, true);
  assert.equal(cfg.games.lobotomy.tweaks.SpeedMultiplier, 4);
  assert.throws(() => store.patch({ games: { lobotomy: { tweaks: { SpeedMultiplier: 99 } } } }), /Invalid gameplay tweak/);

  const { syncTweaks } = require('../electron/library/tweaks');
  const deployed = syncTweaks(cfg.games.ruina, true);
  assert.equal(deployed.active, true);
  const cfgText = fs.readFileSync(path.join(ruinaDir, 'LibraryOfRuina_Data/Mods/.atelier-tweaks/tweaks.cfg'), 'utf8');
  assert(cfgText.includes('NoGrindBooks=true'));
  assert(cfgText.includes('MultiplePurpleBooks=true'));

  const vanilla = syncTweaks(cfg.games.ruina, false);
  assert.equal(vanilla.active, false);
  assert.equal(fs.existsSync(path.join(ruinaDir, 'LibraryOfRuina_Data/Mods/.atelier-tweaks')), false);

  const report = diagnostics.analyze('ruina');
  assert.equal(report.baseMod.loaderName, 'Not needed');
  assert.equal(report.baseMod.version, 'Not needed');
  assert(!/basemod|harmony/i.test(report.baseMod.details));
});
