const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { existingStat, validateGameId } = require('../files/paths');
const { writeFileAtomic } = require('../config/store');
const lobotomy = require('../games/lobotomy');

const RUINA_TWEAKS_ID = 'com.rowrow620.atelier.tweaks';

function defaultLocalLowRoot() {
  return path.join(os.homedir(), 'AppData', 'LocalLow');
}

function ruinaModSettingPath(localLowRoot = defaultLocalLowRoot()) {
  return path.join(localLowRoot, 'Project Moon', 'LibraryOfRuina', 'ModSetting.save');
}

function ruinaAssemblyPath(game) {
  if (!game?.gamePath) return '';
  return path.join(game.gamePath, 'LibraryOfRuina_Data', 'Managed', 'Assembly-CSharp.dll');
}

function lobotomyOrderXmlPath(game) {
  const dir = lobotomy.nativeMods(game);
  return dir ? path.join(dir, 'BaseModList_v2.xml') : '';
}

function validateOrderIds(orders) {
  if (!Array.isArray(orders) || orders.length > 5000) {
    throw new Error('Invalid load order list.');
  }
  const seen = new Set();
  const clean = [];
  for (const raw of orders) {
    if (typeof raw !== 'string') throw new Error('Invalid mod ID in load order.');
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 200 || /[\u0000-\u001f<>]/.test(trimmed)) {
      throw new Error('Invalid mod ID in load order.');
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      clean.push(trimmed);
    }
  }
  return clean;
}

function runRuinaModSettingScript(script, envVars) {
  if (process.platform !== 'win32') return null;
  const stdout = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      env: { ...process.env, ...envVars },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  return stdout.trim();
}

const READ_MODSETTING_PS = `
[void][Reflection.Assembly]::LoadFrom($env:ATELIER_ASM)
$bf = New-Object System.Runtime.Serialization.Formatters.Binary.BinaryFormatter
$fs = [IO.File]::OpenRead($env:ATELIER_SAVE)
try { $sd = $bf.Deserialize($fs) } finally { $fs.Close() }
$orders = @()
$active = @()
foreach ($kv in $sd.li) {
  if ($kv.k -eq 'orders' -and $kv.b) { $orders = @($kv.b | ForEach-Object { [string]$_ }) }
  elseif ($kv.k -eq 'lastActivated' -and $kv.b) { $active = @($kv.b | ForEach-Object { [string]$_ }) }
}
@{ orders = $orders; lastActivated = $active } | ConvertTo-Json -Compress
`;

const WRITE_MODSETTING_PS = `
[void][Reflection.Assembly]::LoadFrom($env:ATELIER_ASM)
$payload = $env:ATELIER_PAYLOAD | ConvertFrom-Json
$bf = New-Object System.Runtime.Serialization.Formatters.Binary.BinaryFormatter
$fs = [IO.File]::OpenRead($env:ATELIER_SAVE)
try { $sd = $bf.Deserialize($fs) } finally { $fs.Close() }
foreach ($kv in $sd.li) {
  if ($kv.k -eq 'orders' -and $null -ne $payload.orders) {
    $kv.b = [object[]]@($payload.orders | ForEach-Object { [string]$_ })
  } elseif ($kv.k -eq 'lastActivated' -and $null -ne $payload.lastActivated) {
    $kv.b = [object[]]@($payload.lastActivated | ForEach-Object { [string]$_ })
  }
}
$tmp = $env:ATELIER_TMP
$out = [IO.File]::Open($tmp, [IO.FileMode]::Create, [IO.FileAccess]::Write)
try { $bf.Serialize($out, $sd) } finally { $out.Close() }
`;

function readRuinaModSetting(game, localLowRoot = defaultLocalLowRoot()) {
  const savePath = ruinaModSettingPath(localLowRoot);
  const asmPath = ruinaAssemblyPath(game);
  if (!existingStat(savePath)?.isFile() || !existingStat(asmPath)?.isFile()) {
    return null;
  }
  const raw = runRuinaModSettingScript(READ_MODSETTING_PS, {
    ATELIER_ASM: asmPath,
    ATELIER_SAVE: savePath,
  });
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return {
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    lastActivated: Array.isArray(parsed.lastActivated) ? parsed.lastActivated : [],
  };
}

function writeRuinaModSetting(game, { orders, lastActivated }, localLowRoot = defaultLocalLowRoot()) {
  const savePath = ruinaModSettingPath(localLowRoot);
  const asmPath = ruinaAssemblyPath(game);
  if (!existingStat(savePath)?.isFile() || !existingStat(asmPath)?.isFile()) {
    return false;
  }
  const tmpPath = `${savePath}.${process.pid}.tmp`;
  try {
    runRuinaModSettingScript(WRITE_MODSETTING_PS, {
      ATELIER_ASM: asmPath,
      ATELIER_SAVE: savePath,
      ATELIER_TMP: tmpPath,
      ATELIER_PAYLOAD: JSON.stringify({
        orders: orders ?? null,
        lastActivated: lastActivated ?? null,
      }),
    });
    fs.renameSync(tmpPath, savePath);
    return true;
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

function activateRuinaMod(game, modId = RUINA_TWEAKS_ID, { active = true, localLowRoot = defaultLocalLowRoot() } = {}) {
  try {
    const state = readRuinaModSetting(game, localLowRoot);
    if (!state) return false;
    const orders = [...state.orders];
    const lastActivated = [...state.lastActivated];
    const nextOrders = active
      ? (orders.includes(modId) ? orders : [...orders, modId])
      : orders.filter((id) => id !== modId);
    const nextActive = active
      ? (lastActivated.includes(modId) ? lastActivated : [...lastActivated, modId])
      : lastActivated.filter((id) => id !== modId);
    return writeRuinaModSetting(game, { orders: nextOrders, lastActivated: nextActive }, localLowRoot);
  } catch {
    return false;
  }
}

function readLobotomyOrderXml(filePath) {
  if (!filePath || !existingStat(filePath)?.isFile()) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const ids = [];
  for (const match of text.matchAll(/<folderName>([^<]+)<\/folderName>|<modid>([^<]+)<\/modid>/gi)) {
    const val = (match[1] ?? match[2] ?? '').trim();
    if (val && !ids.includes(val)) ids.push(val);
  }
  return ids;
}

function writeLobotomyOrderXml(filePath, orders) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const escapeXml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const items = orders.map((id) => `  <ModInfoXml><modid>${escapeXml(id)}</modid><folderName>${escapeXml(id)}</folderName></ModInfoXml>`).join('\n');
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<ModListXml>\n  <list>\n${items}\n  </list>\n</ModListXml>\n`;
  writeFileAtomic(filePath, xml);
}

function createLoadOrderService({ store, localLowRoot = defaultLocalLowRoot() }) {
  function get(gameId) {
    const id = validateGameId(gameId);
    const game = store.read().games[id];
    if (id === 'ruina') {
      const state = readRuinaModSetting(game, localLowRoot);
      return {
        gameId: id,
        available: Boolean(state),
        sourcePath: ruinaModSettingPath(localLowRoot),
        orders: state?.orders ?? [],
        activeIds: state?.lastActivated ?? [],
      };
    }
    const xmlPath = lobotomyOrderXmlPath(game);
    return {
      gameId: id,
      available: Boolean(xmlPath),
      sourcePath: xmlPath,
      orders: readLobotomyOrderXml(xmlPath),
      activeIds: [],
    };
  }

  function save(gameId, orders) {
    const id = validateGameId(gameId);
    const clean = validateOrderIds(orders);
    const game = store.read().games[id];
    if (id === 'ruina') {
      const state = readRuinaModSetting(game, localLowRoot);
      if (!state) throw new Error('Launch Library of Ruina with -mod once before editing load order.');
      writeRuinaModSetting(game, { orders: clean, lastActivated: state.lastActivated }, localLowRoot);
      return get(id);
    }
    const xmlPath = lobotomyOrderXmlPath(game);
    if (!xmlPath) throw new Error('Choose the Lobotomy Corporation game folder in Settings.');
    writeLobotomyOrderXml(xmlPath, clean);
    return get(id);
  }

  return { get, save, activateRuinaMod };
}

module.exports = {
  RUINA_TWEAKS_ID,
  activateRuinaMod,
  createLoadOrderService,
  readLobotomyOrderXml,
  writeLobotomyOrderXml,
};
