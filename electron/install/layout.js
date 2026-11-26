const { validateName } = require('../files/paths');

function planArchive(gameId, archiveName, entries) {
  const files = entries.filter((entry) => !entry.isDirectory)
    .map((entry) => ({ entry, name: entry.entryName.replace(/\\/g, '/') }));
  const candidates = new Map();
  for (const { name } of files) {
    const lower = name.toLowerCase();
    if (/(^|\/)(lobotomycorp|libraryofruina)\.exe$|(^|\/)managed\/assembly-csharp\.dll$/.test(lower)) {
      throw new Error('This ZIP contains game files. Choose an individual mod ZIP.');
    }
    const marker = /(^|\/)(stagemodinfo\.xml|info\/info\.txt|globalinfo\.xml)$/.exec(lower);
    if (!marker) continue;
    const kind = marker[2] === 'stagemodinfo.xml' ? 'ruina' : 'lobotomy';
    if (kind !== gameId) {
      throw new Error('This ZIP is for ' + (kind === 'ruina' ? 'Library of Ruina.' : 'Lobotomy Corporation.'));
    }
    const prefix = name.slice(0, marker.index + marker[1].length);
    candidates.set(prefix.toLowerCase(), prefix);
  }
  if (candidates.size > 1) throw new Error('This ZIP contains more than one mod. Import each mod as a separate ZIP.');

  let prefix = candidates.values().next().value ?? '';
  const nativePath = gameId === 'ruina' ? /^libraryofruina_data\/mods\/([^/]+)\//i : /^lobotomycorp_data\/basemods\/([^/]+)\//i;
  const nativeRoots = new Map();
  for (const { name } of files) {
    const match = nativePath.exec(name);
    if (match) nativeRoots.set(match[0].toLowerCase(), match[0]);
  }
  if (nativeRoots.size > 1) throw new Error('This ZIP contains several mod folders. Import each mod separately.');
  if (!prefix && nativeRoots.size === 1) prefix = nativeRoots.values().next().value;
  if (files.some(({ name }) => /(^|\/)(bepinex|melonloader)\//i.test(name))) {
    throw new Error('This ZIP uses a different mod loader. Follow the mod author’s install instructions.');
  }
  if (!prefix && files.some(({ name }) => /(^|\/)(lobotomycorp_data|libraryofruina_data|managed)\//i.test(name))) {
    throw new Error('This folder layout is unsupported. Choose the ZIP for a single mod.');
  }
  if (prefix && files.some(({ name }) => !name.toLowerCase().startsWith(prefix.toLowerCase()) &&
      !/^(?:[^/]+\/)*(?:readme(?:[._-].*)?|license(?:[._-].*)?|changelog(?:[._-].*)?)$/i.test(name))) {
    throw new Error('This ZIP contains files outside the mod folder. Import a ZIP containing just the mod.');
  }

  const modName = prefix ? validateName(prefix.slice(0, -1).split('/').at(-1)) : archiveName;
  return {
    modName,
    entries: entries.flatMap((entry) => {
      const name = entry.entryName.replace(/\\/g, '/');
      if (!name.toLowerCase().startsWith(prefix.toLowerCase()) || name.length === prefix.length) return [];
      return [{ entry, name: name.slice(prefix.length) }];
    }),
  };
}

module.exports = { planArchive };
