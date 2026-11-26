const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('packaging config references existing entrypoints and build icons', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.equal(fs.existsSync(path.join(root, pkg.main)), true);
  assert.equal(fs.existsSync(path.join(root, pkg.build.win.icon)), true);
  assert.equal(fs.existsSync(path.join(root, pkg.build.directories.buildResources, 'icon.png')), true);
  assert.equal(fs.existsSync(path.join(root, 'src', 'assets', 'app-icon.jpg')), true);
});

test('all modal dialogs use native <dialog> without blocking browser dialogs', () => {
  const modalFiles = [
    'src/components/ModDetailsModal.tsx',
    'src/components/InstallModal.tsx',
    'src/components/SaveProfileDialog.tsx',
  ];

  for (const relPath of modalFiles) {
    const source = fs.readFileSync(path.join(root, relPath), 'utf8');
    assert.match(source, /<dialog\b/, `${relPath} must use a native <dialog> element`);
    assert.match(source, /\.showModal\(\)/, `${relPath} must open via showModal()`);
    assert.match(source, /\bonCancel=/, `${relPath} must handle Escape via onCancel`);
    assert.doesNotMatch(source, /\b(?:window\.)?(?:alert|confirm|prompt)\(/, `${relPath} must not call blocking browser dialogs`);
  }
});

test('preload API keys match shared AtelierApi contract and IPC handlers', () => {
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
  const contracts = fs.readFileSync(path.join(root, 'shared', 'contracts.ts'), 'utf8').replace(/\r\n/g, '\n');
  const ipcRegister = fs.readFileSync(path.join(root, 'electron', 'ipc', 'register.js'), 'utf8');

  const apiBlockMatch = contracts.match(/export interface AtelierApi \{([\s\S]*?)\n\}/);
  assert.ok(apiBlockMatch, 'AtelierApi interface must exist in shared/contracts.ts');

  const contractMethods = [...apiBlockMatch[1].matchAll(/^\s*([a-zA-Z0-9_]+)\s*:/gm)].map((m) => m[1]);
  assert.ok(contractMethods.length >= 20);

  for (const method of contractMethods) {
    assert.match(preload, new RegExp(`\\b${method}:`), `preload.js must expose ${method}`);
  }

  const invokedChannels = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(invokedChannels.length >= 15);

  for (const channel of invokedChannels) {
    assert.match(ipcRegister, new RegExp(`'${channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`), `ipc/register.js must handle ${channel}`);
  }
});
