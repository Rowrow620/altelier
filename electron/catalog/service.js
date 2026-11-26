const { randomUUID } = require('node:crypto');
const { open, rename, rm, writeFile } = require('node:fs/promises');
const { games } = require('../../shared/default-config.json');
const { searchNexus, NexusRateLimitError } = require('./nexus');

const MAX_CACHED_PAGES = 60;
const MAX_PAGE = 500;
const FRESH_FOR = 5 * 60 * 1000;
const KEEP_FOR = 7 * 24 * 60 * 60 * 1000;

function validateSearch(input) {
  const { gameId, query, page, searchIn = 'all', category = '', sort = 'downloads' } = input ?? {};
  if (
    typeof gameId !== 'string' || !Object.hasOwn(games, gameId) ||
    typeof query !== 'string' || query.length > 120 ||
    !Number.isInteger(page) || page < 1 || page > MAX_PAGE ||
    !['all', 'name', 'author'].includes(searchIn) ||
    typeof category !== 'string' || category.length > 100 ||
    !['relevance', 'updated', 'newest', 'downloads', 'endorsements'].includes(sort) ||
    (input.refresh !== undefined && typeof input.refresh !== 'boolean')
  ) {
    throw new Error('Invalid catalog search');
  }
  return { gameId, query: query.trim(), page, searchIn, category: category.trim(), sort };
}

async function readCache(cachePath, now) {
  const entries = new Map();
  const file = await open(cachePath, 'r');
  try {
    const contents = JSON.parse(await file.readFile('utf8'));
    const { mtime } = await file.stat();
    for (const entry of contents) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const [key, page] = entry;
      if (!isPublicPage(key, page)) continue;
      // Older versions did not always include the timestamp; clamp filesystem mtime against clock skew.
      const currentTime = now();
      const fetchedAt = page.fetchedAt ?? new Date(Math.min(currentTime, mtime.getTime())).toISOString();
      const age = currentTime - Date.parse(fetchedAt);
      if (age >= -5000 && age < KEEP_FOR) {
        entries.set(key, { ...page, fetchedAt, categories: page.categories ?? [] });
      }
    }
    return entries;
  } finally {
    await file.close();
  }
}

function isPublicPage(key, page) {
  try {
    return JSON.parse(key)?.showAdult === false && Array.isArray(page?.mods) &&
      page.mods.every((mod) => mod?.adult === false);
  } catch {
    return false;
  }
}

async function saveCache(cachePath, snapshot) {
  const temporaryPath = `${cachePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, snapshot, 'utf8');
    await rename(temporaryPath, cachePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function createCatalogService({ cachePath, search = searchNexus, now = Date.now }) {
  const cache = readCache(cachePath, now).catch(() => new Map());
  const pending = new Map();
  let cacheWrite = Promise.resolve();
  let rateLimitedUntil = 0;

  function recentPage(entries, key, time) {
    const page = entries.get(key);
    if (page && time - Date.parse(page.fetchedAt) >= KEEP_FOR) {
      entries.delete(key);
      return undefined;
    }
    return page;
  }

  function rateLimitedPage(page) {
    const limit = { rateLimitedUntil: new Date(rateLimitedUntil).toISOString() };
    return page ? { ...page, freshness: 'cached', ...limit } : limit;
  }

  async function searchAndCache(entries, request, key) {
    let results;
    try {
      results = await search(request);
    } catch (error) {
      const time = now();
      const previous = recentPage(entries, key, time);
      if (error instanceof NexusRateLimitError) {
        rateLimitedUntil = Math.max(rateLimitedUntil, error.retryAt);
        return rateLimitedPage(previous);
      }
      if (previous) return { ...previous, freshness: 'cached' };
      throw error;
    }

    const entry = {
      ...results,
      mods: results.mods.filter((mod) => mod?.adult === false),
      categories: results.categories ?? [],
      hasNextPage: request.page < MAX_PAGE && results.hasNextPage,
      fetchedAt: new Date(now()).toISOString(),
    };
    entries.delete(key);
    entries.set(key, entry);
    if (entries.size > MAX_CACHED_PAGES) {
      entries.delete(entries.keys().next().value);
    }

    const snapshot = JSON.stringify([...entries]);
    cacheWrite = cacheWrite
      .then(() => saveCache(cachePath, snapshot))
      .catch((error) => console.warn('Could not save the mod catalog cache:', error.message));
    await cacheWrite;
    return { ...entry, freshness: 'live' };
  }

  return async function searchCatalog(input) {
    const request = validateSearch(input);
    // Preserve the existing cache keys for public results.
    const key = JSON.stringify({ ...request, showAdult: false });
    const entries = await cache;
    const queued = pending.get(key);
    if (queued) return queued;

    const time = now();
    const previous = recentPage(entries, key, time);
    if (time < rateLimitedUntil) return rateLimitedPage(previous);
    if (!input.refresh && previous && time - Date.parse(previous.fetchedAt) < FRESH_FOR) {
      return { ...previous, freshness: 'cached' };
    }

    const searchPage = searchAndCache(entries, request, key).finally(() => pending.delete(key));
    pending.set(key, searchPage);
    return searchPage;
  };
}

module.exports = { createCatalogService };
