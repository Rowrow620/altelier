const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const AdmZip = require('adm-zip');
const { createConfigStore, writeAtomic } = require('../electron/config/store');
const { createGameService, getModsDirectory, isNativeModsDirectory } = require('../electron/games/service');
const { createSteamDiscovery } = require('../electron/games/steam');
const { createInstallService } = require('../electron/install/service');
const { createLibrary } = require('../electron/library/scan');
const { createProfileService } = require('../electron/library/profiles');
const { createUpdateService } = require('../electron/library/updates');
const { lookupNexusReleases, createNexusRequest } = require('../electron/catalog/nexus');
const { externalUrl } = require('../electron/ipc/register');

function fixture(t, { persist, warnings } = {}) {
  const temp = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temp, 'atelier-games-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(directory)), temp);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  function write(relative, data = '') {
    const file = path.join(directory, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    return file;
  }
  const store = createConfigStore(path.join(directory, 'settings.json'), persist);
  const installer = createInstallService({
    store, getGameModsDir: getModsDirectory,
    activation: (game, root) => isNativeModsDirectory(game, root) ? 'native' : 'manual',
    confirmReplace: async () => true,
    installWarnings: warnings,
  });
  return { directory, write, store, installer };
}

function archive(directory, name, files) {
  const target = path.join(directory, name);
  const zip = new AdmZip();
  for (const [file, contents] of Object.entries(files)) zip.addFile(file, Buffer.from(contents));
  zip.writeZip(target);
  return target;
}

test('finds games and Workshop items in a secondary Steam library through the manifests', (t) => {
  const { directory, write, store, installer } = fixture(t);
  const secondary = path.join(directory, 'Second Steam Library');
  const vdfPath = secondary.replace(/\\/g, '\\\\');
  write('steam/steamapps/libraryfolders.vdf', '"libraryfolders" { "1" { "path" "' + vdfPath + '" } }');
  write('Second Steam Library/steamapps/appmanifest_1256670.acf', '"AppState" { "appid" "1256670" "installdir" "Custom Ruina Folder" }');
  const exe = write('Second Steam Library/steamapps/common/Custom Ruina Folder/LibraryOfRuina.exe');
  const item = write('Second Steam Library/steamapps/workshop/content/1256670/12345/StageModInfo.xml',
    '<NormalInvitation><Version>1.1</Version><Workshop><Title>Maps &amp; Cards</Title></Workshop></NormalInvitation>');
  write('Second Steam Library/steamapps/workshop/content/1256670/12345/preview.png', Buffer.from([1, 2, 3]));
  write('Second Steam Library/steamapps/workshop/content/1256670/12345/huge.jpg', Buffer.alloc(2 * 1024 * 1024));
  const steam = createSteamDiscovery([path.join(directory, 'steam')]);
  const games = createGameService({ store, steam });
  const library = createLibrary({ store, workshopDirectories: games.workshopDirectories, localFolder: installer.folder });
  const config = games.detectConfig();
  assert.equal(config.games.ruina.gamePath, path.dirname(exe));
  const [mod] = library.scan(config.games.ruina);
  assert.equal(mod.id, 'workshop:12345');
  assert.equal(mod.name, 'Maps & Cards');
  assert.equal(mod.version, '1.1');
  assert.equal(mod.enabled, true);
  assert.equal(mod.source, 'workshop');
  assert.equal(externalUrl(mod.workshopUrl), mod.workshopUrl);
  assert.throws(() => externalUrl('https://steamcommunity.com/sharedfiles/filedetails/?id=12345&other=unsafe'));
  assert.equal(library.folder('ruina', mod.id), path.dirname(item));
  assert.deepEqual(library.previews('ruina', mod.id), ['data:image/png;base64,AQID']);
  assert.throws(() => installer.deleteMod('ruina', mod.id));

  const alias = path.join(directory, 'workshop alias');
  fs.symlinkSync(path.dirname(item), alias, 'junction');
  store.patch({ games: { ruina: { modsPath: alias } } });
  assert.throws(() => getModsDirectory(store.read().games.ruina), /outside Steam Workshop/);
  assert(fs.existsSync(item));
});

test('installs, moves and removes a local mod for either native loader and preserves legacy disabled folders', async (t) => {
  const { directory, write, store, installer } = fixture(t);
  const lCorp = path.dirname(write('LobotomyCorp/LobotomyCorp.exe'));
  const ruina = path.dirname(write('Ruina/LibraryOfRuina.exe'));
  write('LobotomyCorp/LobotomyCorp_Data/Managed/LobotomyBaseModLib.dll');
  write('Ruina/LibraryOfRuina_Data/Mods/mods here.txt');
  const oldRuinaPath = path.join(ruina, 'LibraryOfRuina_Data', 'BaseMods');
  fs.mkdirSync(oldRuinaPath);
  store.patch({ games: { lobotomy: { gamePath: lCorp }, ruina: { gamePath: ruina, modsPath: oldRuinaPath } } });
  const plans = [];
  const games = createGameService({ store, steam: createSteamDiscovery([]), start: async (plan) => { plans.push(plan); } });
  const library = createLibrary({ store, workshopDirectories: games.workshopDirectories, localFolder: installer.folder });
  assert.equal(games.detectConfig().games.ruina.modsPath, path.join(ruina, 'LibraryOfRuina_Data', 'Mods'));
  const zipFile = path.join(directory, 'Example.zip');
  const zip = new AdmZip();
  zip.addFile('README.md', Buffer.from('# Example'));
  zip.writeZip(zipFile);

  for (const gameId of ['lobotomy', 'ruina']) {
    const game = store.read().games[gameId];
    const root = getModsDirectory(game);
    assert.equal((await installer.install(gameId, zipFile)).success, true);
    assert.equal(library.scan(game)[0].enabled, true);
    installer.toggle(gameId, 'Example', false);
    assert.equal(fs.existsSync(path.join(root, 'Example')), false);
    assert.equal(library.scan(game)[0].enabled, false);
    assert.equal((await installer.install(gameId, zipFile)).success, true);
    assert.equal(library.scan(game)[0].enabled, false);
    installer.toggle(gameId, 'Example', true);
    assert.equal(library.scan(game)[0].enabled, true);

    fs.mkdirSync(path.join(root, 'Legacy.disabled'));
    await games.launch(gameId, true, installer.prepareLaunch);
    assert.equal(fs.existsSync(path.join(root, 'Legacy.disabled')), false);
    assert.equal(library.scan(game).find((mod) => mod.id === 'Legacy').enabled, false);
    installer.deleteMod(gameId, 'Legacy');
    installer.deleteMod(gameId, 'Example');
    assert.deepEqual(library.scan(game), []);
  }
  assert.deepEqual(plans.map(({ args }) => args), [[], ['-mod']]);
  await games.launch('ruina', false, installer.prepareLaunch);
  assert.deepEqual(plans.at(-1).args, []);
  await assert.rejects(games.launch('lobotomy', false, installer.prepareLaunch), /clean Lobotomy/);

  const clean = path.dirname(write('Clean/LobotomyCorp.exe'));
  store.patch({ games: { lobotomy: { gamePath: clean, modsPath: '' } } });
  await games.launch('lobotomy', false, installer.prepareLaunch);
  assert.equal(plans.at(-1).executable, path.join(clean, 'LobotomyCorp.exe'));
  const manager = write('LMM/LobotomyModManager.exe');
  store.patch({ games: { lobotomy: { gamePath: path.dirname(manager) } } });
  assert.match(await games.launch('lobotomy', true, installer.prepareLaunch), /Lobotomy Mod Manager/);
  assert.equal(plans.at(-1).executable, manager);
});

test('imports a wrapped mod, records its files and preserves a disabled mod during a ZIP update', async (t) => {
  const { directory, write, store, installer } = fixture(t, { warnings: () => ['Install BaseMod.'] });
  const gamePath = path.dirname(write('LobotomyCorp/LobotomyCorp.exe'));
  store.patch({ games: { lobotomy: { gamePath } } });
  const linked = 'https://www.nexusmods.com/lobotomycorporation/mods/18';
  const original = archive(directory, 'first-download.zip', {
    'LobotomyCorp_Data/BaseMods/Example/Info/Info.txt': 'Name: Example\nVersion: 1.2\nNexus: ' + linked,
    'LobotomyCorp_Data/BaseMods/Example/CustomData/value.txt': 'first',
  });
  const imported = await installer.install('lobotomy', original);
  assert.deepEqual(imported, { success: true, modId: 'Example', warnings: ['Install BaseMod.'] });
  const getRecord = () => JSON.parse(fs.readFileSync(path.join(installer.folder('lobotomy', 'Example'), '.atelier-install.json')));
  assert.equal(getRecord().version, '1.2');
  assert.equal(getRecord().nexusUrl, linked);
  assert.deepEqual(getRecord().files.sort(), ['CustomData/value.txt', 'Info/Info.txt']);

  installer.toggle('lobotomy', 'Example', false);
  const replacement = archive(directory, 'completely-different-name.zip', {
    'Updated/Info/Info.txt': 'Name: Example\nVersion: 1.3',
  });
  assert.equal((await installer.install('lobotomy', replacement, { replaceId: 'Example' })).success, true);
  assert.equal(getRecord().version, '1.3');
  assert.equal(getRecord().nexusUrl, linked);
  assert.match(path.dirname(installer.folder('lobotomy', 'Example')), /\.atelier-disabled$/);

  const wrongSource = archive(directory, 'wrong-page.zip', {
    'Updated/Info/Info.txt': 'Version: 3\nNexus: https://www.nexusmods.com/lobotomycorporation/mods/19',
  });
  assert.match((await installer.install('lobotomy', wrongSource, { replaceId: 'Example' })).error, /different Nexus listings/);
  assert.equal(getRecord().version, '1.3');
  const wrongGame = archive(directory, 'wrong-game.zip', { 'Folder/StageModInfo.xml': '<NormalInvitation />' });
  assert.match((await installer.install('lobotomy', wrongGame)).error, /Library of Ruina/);
  const multiple = archive(directory, 'bundle.zip', { 'One/Info/Info.txt': 'Name: One', 'Two/Info/Info.txt': 'Name: Two' });
  assert.match((await installer.install('lobotomy', multiple)).error, /more than one mod/);

  write('LobotomyCorp/LobotomyCorp_Data/BaseMods/OldMod/Info/Info.txt', 'Name: Old Mod');
  installer.saveDetails('lobotomy', 'OldMod', { nexusUrl: linked, version: '2.1' });
  const library = createLibrary({ store, workshopDirectories: () => [], localFolder: installer.folder });
  const old = library.scan(store.read().games.lobotomy).find((mod) => mod.id === 'OldMod');
  assert.equal(old.version, '2.1');
  assert.equal(old.nexusModId, 18);
  assert.equal(old.fileCount, 1);
});

test('switches profiles per game, rolls back a failed save and recovers after an interrupted switch', (t) => {
  let failSave = false;
  const { directory, write, store, installer } = fixture(t, { persist(file, value) {
    if (failSave && value.gameProfiles.lobotomy === 'Empty') throw new Error('Disk full');
    writeAtomic(file, value);
  } });
  const lobotomy = path.dirname(write('LobotomyCorp/LobotomyCorp.exe'));
  const ruina = path.dirname(write('Ruina/LibraryOfRuina.exe'));
  write('LobotomyCorp/LobotomyCorp_Data/BaseMods/Example/README.md');
  write('Ruina/LibraryOfRuina_Data/Mods/Other/README.md');
  store.patch({ games: { lobotomy: { gamePath: lobotomy }, ruina: { gamePath: ruina } } });
  const journalPath = path.join(directory, 'profile-switch.json');
  const profiles = createProfileService({ store, installer, journalPath });
  const native = installer.profileState('lobotomy').root;

  profiles.save('Default', 'lobotomy');
  installer.toggle('lobotomy', 'Example', false);
  profiles.save('Empty', 'lobotomy');
  profiles.activate('Default', 'lobotomy');
  assert.equal(installer.profileState('lobotomy').mods.get('example').enabled, true);

  failSave = true;
  assert.throws(() => profiles.activate('Empty', 'lobotomy'), /Disk full/);
  assert.equal(installer.profileState('lobotomy').mods.get('example').enabled, true);
  assert.equal(store.read().activeProfile, 'Default');
  assert.equal(fs.existsSync(journalPath), false);

  writeAtomic(journalPath, { gameId: 'lobotomy', root: native, from: 'Default', to: 'Empty',
    before: [{ name: 'Example', enabled: true }] });
  installer.applyProfile('lobotomy', native, [{ name: 'Example', enabled: false }]);
  createProfileService({ store, installer, journalPath }).recover();
  assert.equal(installer.profileState('lobotomy').mods.get('example').enabled, true);

  failSave = false;
  profiles.activate('Empty', 'lobotomy');
  assert.equal(installer.profileState('lobotomy').mods.get('example').enabled, false);
  assert.equal(store.patch({ activeGame: 'ruina' }).activeProfile, 'Default');
  assert.equal(installer.profileState('ruina').mods.get('other').enabled, true);
  assert.equal(store.patch({ activeGame: 'lobotomy' }).activeProfile, 'Empty');
});

test('checks only linked, versioned public mods and honors the shared Nexus rate limit', async () => {
  const game = { id: 'ruina' };
  const mods = [
    { id: 'older', version: 'v1.0', nexusModId: 101 },
    { id: 'different', version: 'beta', nexusModId: 102 },
    { id: 'restricted', version: '1.0', nexusModId: 103 },
    { id: 'unclassified', version: '1.0', nexusModId: 104 },
    { id: 'unknown-version', version: '', nexusModId: 105 },
    { id: 'unlinked', version: '1.0' },
  ];
  let requests = 0;
  let now = Date.now();
  const request = createNexusRequest(async (_url, options) => {
    requests += 1;
    const { variables } = JSON.parse(options.body);
    assert.equal(variables.filter.filter[0].gameId[0].value, '3356');
    assert(variables.filter.filter.every((filter) => filter.adultContent[0].value === false));
    if (requests > 1) return new Response(null, { status: 429, headers: { 'Retry-After': '120' } });
    return Response.json({ data: { mods: { nodes: [
      { modId: 101, version: '1.1', adultContent: false, modRequirements: { nexusRequirements: {
        totalCount: 3, nodes: [
          { modId: 102, gameId: '3356', externalRequirement: false },
          { modId: 106, gameId: '3356', externalRequirement: false },
          { modId: 107, gameId: '3356', externalRequirement: true },
        ],
      } } },
      { modId: 102, version: '2.0', adultContent: false },
      { modId: 103, version: '99', adultContent: true },
      { modId: 104, version: '99' },
    ] } } });
  }, () => now);
  const updates = createUpdateService({
    store: { read: () => ({ games: { ruina: game } }) },
    library: { scan: () => mods },
    lookup: (gameId, ids) => lookupNexusReleases(gameId, ids, request),
    now: () => now,
  });
  const report = await updates('ruina');
  assert.deepEqual(report.items.map(({ status }) => status), ['available', 'different']);
  assert.equal(report.items[0].missingRequirements, 1);
  assert.equal(report.items[0].reviewRequirements, true);
  assert.equal(report.eligible, 4);
  assert.deepEqual(await updates('ruina'), report);
  now += 5 * 60 * 1000;
  assert.equal((await updates('ruina')).retryAt, new Date(now + 120_000).toISOString());
  await assert.rejects(request('https://api.nexusmods.com/v2/graphql'), /limiting requests/);
  assert.equal(requests, 2);
});
