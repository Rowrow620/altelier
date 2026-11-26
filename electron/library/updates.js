const { NexusRateLimitError } = require('../catalog/nexus');

function compareVersions(installed, latest) {
  if (installed === latest) return 'current';
  const numeric = /^v?(\d{1,10}(?:\.\d{1,10}){0,7})$/i;
  const left = numeric.exec(installed)?.[1].split('.').map(Number);
  const right = numeric.exec(latest)?.[1].split('.').map(Number);
  if (!left || !right) return 'different';
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const delta = (right[index] ?? 0) - (left[index] ?? 0);
    if (delta !== 0) return delta > 0 ? 'available' : 'ahead';
  }
  return 'current';
}

function createUpdateService({ store, library, lookup, now = Date.now }) {
  const pending = new Map();
  const cache = new Map();

  async function readReleases(gameId, ids) {
    const key = gameId + ':' + ids.join(',');
    const existing = cache.get(key);
    if (existing && now() - existing.fetchedAt < 5 * 60 * 1000) return existing.releases;
    if (pending.has(key)) return pending.get(key);
    const operation = lookup(gameId, ids).then((releases) => {
      cache.set(key, { releases, fetchedAt: now() });
      if (cache.size > 40) cache.delete(cache.keys().next().value);
      return releases;
    }).finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  }

  return async function checkUpdates(gameId) {
    const installed = library.scan(store.read().games[gameId]);
    const knownIds = new Set(installed.filter((mod) => mod.nexusModId && mod.enabled !== false).map((mod) => mod.nexusModId));
    const mods = installed.filter((mod) => mod.nexusModId && mod.version);
    const bySource = new Map();
    for (const mod of mods) {
      if (!bySource.has(mod.nexusModId)) bySource.set(mod.nexusModId, []);
      bySource.get(mod.nexusModId).push(mod);
    }
    const ids = [...bySource.keys()].sort((left, right) => left - right);
    const items = [];
    for (let offset = 0; offset < ids.length; offset += 20) {
      const batch = ids.slice(offset, offset + 20);
      let releases;
      try {
        releases = await readReleases(gameId, batch);
      } catch (error) {
        if (!(error instanceof NexusRateLimitError)) throw new Error('Nexus Mods could not check for updates. Try again later.');
        return { items, eligible: mods.length, retryAt: new Date(error.retryAt).toISOString() };
      }
      for (const [source, release] of releases) {
        for (const mod of bySource.get(source) ?? []) {
          items.push({
            modId: mod.id,
            nexusModId: source,
            installedVersion: mod.version,
            latestVersion: release.version,
            status: compareVersions(mod.version, release.version),
            missingRequirements: release.requiredIds.filter((id) => !knownIds.has(id)).length,
            reviewRequirements: release.reviewRequirements,
          });
        }
      }
    }
    return { items, eligible: mods.length };
  };
}

module.exports = { createUpdateService, compareVersions };
