const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const AdmZip = require('adm-zip');
const { createConfigStore, writeAtomic } = require('../electron/config/store');
const { createInstallService } = require('../electron/install/service');
const { inspectArchive, ARCHIVE_LIMITS } = require('../electron/install/archive');
const { childPath, modsRoot } = require('../electron/files/paths');
const { registerIpc, trustedSender, externalUrl } = require('../electron/ipc/register');

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-security-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith('atelier-security-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const configPath = path.join(directory, 'settings.json');
  const root = path.join(directory, 'mods');
  fs.mkdirSync(root);
  const store = createConfigStore(configPath, options.persist);
  store.patch({ games: { lobotomy: { modsPath: root }, ruina: { modsPath: root } } });
  const installer = createInstallService({
    store, getGameModsDir: (game) => game.modsPath,
    confirmReplace: options.confirmReplace ?? (async () => true),
  });
  function archive(name = 'Example.zip', content = 'new') {
    const file = path.join(directory, name);
    const zip = new AdmZip();
    zip.addFile('README.md', Buffer.from(content));
    zip.writeZip(file);
    return file;
  }
  return { directory, root, store, installer, configPath, archive };
}

test('migrates partial settings, retains custom paths and enabled mods, and preserves newer mod changes', (t) => {
  const { root, configPath, store } = fixture(t);
  fs.writeFileSync(configPath, JSON.stringify({
    games: { lobotomy: { modsPath: root, enabledModIds: ['Existing'], appId: 'attacker-value' } },
  }));
  const migrated = store.read();
  assert.equal(migrated.games.lobotomy.appId, '568220');
  assert.equal(migrated.games.ruina.appId, '1256670');
  assert.equal(migrated.games.lobotomy.modsPath, root);
  store.update((config) => config.games.lobotomy.enabledModIds.push('NewImport'));
  store.patch({ activeGame: 'ruina', games: { lobotomy: { gamePath: root } } });
  assert.deepEqual(store.read().games.lobotomy.enabledModIds, ['Existing', 'NewImport']);
  assert.throws(() => store.patch({ games: { lobotomy: { enabledModIds: [] } } }), /Only game and mods folders/);
  assert.throws(() => store.patch({ games: { unexpected: {} } }), /supported game/);
  assert.throws(() => store.patch({ games: { lobotomy: { modsPath: '../outside' } } }), /absolute/);
});

test('preserves corrupt settings and a failed atomic write', (t) => {
  const { configPath, store } = fixture(t);
  const original = fs.readFileSync(configPath, 'utf8');
  const failing = createConfigStore(configPath, () => { throw new Error('Disk full'); });
  assert.throws(() => failing.patch({ activeGame: 'ruina' }), /Disk full/);
  assert.equal(fs.readFileSync(configPath, 'utf8'), original);
  fs.writeFileSync(configPath, '{invalid JSON');
  assert.throws(() => store.patch({ activeGame: 'ruina' }), /preserved/);
  assert.equal(fs.readFileSync(configPath, 'utf8'), '{invalid JSON');
});

test('deletion rejects parent paths, root paths, and reserved names', (t) => {
  const { directory, root, installer } = fixture(t);
  const outside = path.join(directory, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  for (const name of ['../outside', '..', '.', '', root, 'C:escape', 'CON', 'mod.', '.ATELIER-txn-hidden']) {
    assert.throws(() => installer.deleteMod('lobotomy', name));
  }
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
  assert(fs.existsSync(root));
  fs.writeFileSync(path.join(root, 'program.exe'), 'temporary test file');
  assert.throws(() => installer.folder('lobotomy', 'program.exe'), /mod folder/);
});

test('rejects a junction root, a linked mod, and a link inside a mod', (t) => {
  const { directory, root, installer } = fixture(t);
  const outside = path.join(directory, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  const link = path.join(root, 'Linked');
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => modsRoot(link), /real folder/);
  assert.throws(() => childPath(root, 'Linked'), /links and junctions/);
  assert.throws(() => installer.deleteMod('lobotomy', 'Linked'), /links and junctions/);
  const mod = path.join(root, 'Example');
  fs.mkdirSync(mod);
  fs.symlinkSync(outside, path.join(mod, 'NestedLink'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => installer.deleteMod('lobotomy', 'Example'), /links and special files/);
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
});

test('imports a new archive, requires approval for replacement, and preserves disabled state', async (t) => {
  let approved = false;
  let prompts = 0;
  const { archive, root, store, installer } = fixture(t, { confirmReplace: async () => { prompts++; return approved; } });
  const file = archive();
  assert.deepEqual(await installer.install('lobotomy', file), { success: true, modId: 'Example' });
  assert(store.read().games.lobotomy.enabledModIds.includes('Example'));
  archive('Example.zip', 'replacement');
  assert.deepEqual(await installer.install('lobotomy', file), { success: false, cancelled: true });
  assert.equal(fs.readFileSync(path.join(root, 'Example', 'README.md'), 'utf8'), 'new');
  installer.toggle('lobotomy', 'Example', false);
  approved = true;
  assert.equal((await installer.install('lobotomy', file)).success, true);
  assert.equal(prompts, 2);
  assert.equal(fs.readFileSync(path.join(root, 'Example', 'README.md'), 'utf8'), 'replacement');
  assert(!store.read().games.lobotomy.enabledModIds.includes('Example'));
  installer.deleteMod('lobotomy', 'Example');
  assert(!fs.existsSync(path.join(root, 'Example')));
});

test('rejects a ..zip name and traversal, duplicate, linked, or oversized entries before changing mods', async (t) => {
  const { archive, directory, root, installer } = fixture(t);
  fs.writeFileSync(path.join(root, 'README.md'), 'keep');
  assert.equal((await installer.install('lobotomy', archive('..zip'))).success, false);

  for (const entryName of ['../escape.txt', '/absolute.txt', 'folder/../../escape.txt', 'name:stream', 'bad /file.txt']) {
    const zip = new AdmZip();
    zip.addFile('safe.txt', Buffer.from('test'));
    zip.getEntries()[0].entryName = entryName;
    const file = path.join(directory, 'Unsafe.zip');
    zip.writeZip(file);
    assert.equal((await installer.install('lobotomy', file)).success, false, entryName);
  }
  const duplicate = new AdmZip();
  duplicate.addFile('Readme.txt', Buffer.from('one'));
  duplicate.addFile('README.txt', Buffer.from('two'));
  const duplicatePath = path.join(directory, 'Duplicate.zip');
  duplicate.writeZip(duplicatePath);
  assert.throws(() => inspectArchive(duplicatePath), /duplicate/);
  const linked = new AdmZip();
  linked.addFile('linked', Buffer.from('../outside'));
  linked.getEntries()[0].attr = (0xa1ff << 16) >>> 0;
  const linkedPath = path.join(directory, 'Link.zip');
  linked.writeZip(linkedPath);
  assert.throws(() => inspectArchive(linkedPath), /link or special/);
  const file = archive();
  assert.throws(() => inspectArchive(file, { ...ARCHIVE_LIMITS, fileBytes: 1 }), /256 MB/);
  assert.throws(() => inspectArchive(file, { ...ARCHIVE_LIMITS, totalBytes: 1 }), /2 GB/);
  assert.throws(() => inspectArchive(file, { ...ARCHIVE_LIMITS, archiveBytes: 1 }), /512 MB/);
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), 'keep');
  assert.deepEqual(fs.readdirSync(root), ['README.md']);
});

test('failed decompression leaves an existing mod intact', async (t) => {
  const { archive, root, installer } = fixture(t);
  const file = archive();
  await installer.install('lobotomy', file);
  archive('Example.zip', 'replacement');
  const damaged = fs.readFileSync(file);
  const entry = new AdmZip(damaged).getEntries()[0];
  const localOffset = entry.header.offset;
  const dataOffset = localOffset + 30 + damaged.readUInt16LE(localOffset + 26) + damaged.readUInt16LE(localOffset + 28);
  damaged[dataOffset] ^= 255;
  fs.writeFileSync(file, damaged);
  assert.equal((await installer.install('lobotomy', file)).success, false);
  assert.equal(fs.readFileSync(path.join(root, 'Example', 'README.md'), 'utf8'), 'new');
  assert.deepEqual(fs.readdirSync(root), ['Example']);
});

test('retains legacy disabled folders when replacing a mod', async (t) => {
  const { root, archive, installer, store } = fixture(t);
  fs.mkdirSync(path.join(root, 'Example.disabled'));
  fs.writeFileSync(path.join(root, 'Example.disabled', 'README.md'), 'old');
  assert.equal((await installer.install('lobotomy', archive())).success, true);
  assert(!fs.existsSync(path.join(root, 'Example')));
  assert.equal(fs.readFileSync(path.join(root, 'Example.disabled', 'README.md'), 'utf8'), 'new');
  assert(!store.read().games.lobotomy.enabledModIds.includes('Example'));
  installer.deleteMod('lobotomy', 'Example.disabled');
  assert(!fs.existsSync(path.join(root, 'Example.disabled')));
});

test('a failed first install leaves no installed folder and can be retried', async (t) => {
  let fail = false;
  const { root, archive, installer } = fixture(t, {
    persist: (file, config) => {
      if (fail) { fail = false; throw new Error('Disk full'); }
      writeAtomic(file, config);
    },
  });
  const file = archive();
  fail = true;
  assert.equal((await installer.install('lobotomy', file)).success, false);
  assert.deepEqual(fs.readdirSync(root), []);
  assert.equal((await installer.install('lobotomy', file)).success, true);
});

test('rolls back both import and deletion if settings cannot be saved', async (t) => {
  let fail = false;
  const { archive, root, installer, store } = fixture(t, {
    persist: (file, config) => {
      if (fail) { fail = false; throw new Error('Disk full'); }
      writeAtomic(file, config);
    },
  });
  const file = archive();
  await installer.install('lobotomy', file);
  const enabled = store.read().games.lobotomy.enabledModIds;
  archive('Example.zip', 'replacement');
  fail = true;
  assert.equal((await installer.install('lobotomy', file)).success, false);
  assert.equal(fs.readFileSync(path.join(root, 'Example', 'README.md'), 'utf8'), 'new');
  assert.deepEqual(store.read().games.lobotomy.enabledModIds, enabled);
  fail = true;
  assert.throws(() => installer.deleteMod('lobotomy', 'Example'), /Disk full/);
  assert.equal(fs.readFileSync(path.join(root, 'Example', 'README.md'), 'utf8'), 'new');
  assert.deepEqual(store.read().games.lobotomy.enabledModIds, enabled);
});

test('recovers an interrupted replacement after restart', async (t) => {
  const { archive, root, installer, store } = fixture(t);
  await installer.install('lobotomy', archive());
  const transaction = path.join(root, '.atelier-txn-' + randomUUID());
  fs.mkdirSync(transaction);
  fs.renameSync(path.join(root, 'Example'), path.join(transaction, 'old'));
  fs.mkdirSync(path.join(root, 'Example'));
  fs.writeFileSync(path.join(root, 'Example', 'README.md'), 'unfinished replacement');
  store.update((config) => { config.games.lobotomy.enabledModIds = []; });
  writeAtomic(path.join(transaction, 'journal.json'), {
    operation: 'install', gameId: 'lobotomy', modId: 'Example', targetName: 'Example',
    hadTarget: true, wasEnabled: true, committed: false,
  });
  installer.recover('lobotomy');
  assert.equal(fs.readFileSync(path.join(root, 'Example', 'README.md'), 'utf8'), 'new');
  assert(store.read().games.lobotomy.enabledModIds.includes('Example'));
  assert(!fs.existsSync(transaction));
});

test('serializes file changes while a replacement decision is pending', async (t) => {
  let allow;
  let prompted;
  const ready = new Promise((resolve) => { prompted = resolve; });
  const { archive, root, installer } = fixture(t, {
    confirmReplace: () => new Promise((resolve) => { allow = resolve; prompted(); }),
  });
  const file = archive();
  await installer.install('lobotomy', file);
  archive('Example.zip', 'replacement');
  const pending = installer.install('lobotomy', file);
  await ready;
  assert.equal((await installer.install('ruina', file)).success, false);
  assert.throws(() => installer.deleteMod('lobotomy', 'Example'), /Wait/);
  installer.recover('ruina');
  assert.equal(fs.readFileSync(path.join(root, 'Example', 'README.md'), 'utf8'), 'new');
  allow(false);
  assert.equal((await pending).cancelled, true);
});

test('only accepts app messages from the expected main frame and validates external links', () => {
  const file = path.resolve('dist/index.html');
  const mainFrame = { url: require('node:url').pathToFileURL(file).href };
  const webContents = { mainFrame };
  const window = { webContents, isDestroyed: () => false };
  const event = { sender: webContents, senderFrame: mainFrame };
  assert(trustedSender(event, window, file));
  assert(!trustedSender({ ...event, senderFrame: { url: mainFrame.url } }, window, file));
  mainFrame.url = 'https://untrusted.example/';
  assert(!trustedSender(event, window, file));
  mainFrame.url = 'http://localhost:5173/';
  assert(trustedSender(event, window, file, 'http://localhost:5173'));
  assert(!trustedSender(event, window, file));
  const handlers = new Map();
  registerIpc({ ipcMain: { handle: (channel, action) => handlers.set(channel, action) }, getWindow: () => window, rendererFile: file });
  assert.throws(() => handlers.get('window:close')(event), /Untrusted/);
  assert.equal(externalUrl('https://www.nexusmods.com/lobotomycorporation/mods/2'), 'https://www.nexusmods.com/lobotomycorporation/mods/2');
  for (const url of ['file:///C:/Windows', 'javascript:alert(1)', 'https://nexusmods.com.attacker.example', 'https://user@nexusmods.com']) {
    assert.throws(() => externalUrl(url));
  }
});
