const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { searchNexus } = require('../electron/catalog/nexus');
const { version } = require('../package.json');
const { createCatalogService } = require('../electron/catalog/service');
const nexusResponse = require('./fixtures/nexus-search.json');

test('maps Nexus listings and scopes the search and page to the selected game', async () => {
  const results = await searchNexus({ gameId: 'ruina', query: 'optimization', page: 2 }, async (url, options) => {
    const { variables } = JSON.parse(options.body);
    assert.equal(url, 'https://api.nexusmods.com/v2/graphql');
    assert.equal(options.headers['Application-Name'], 'Atelier Mod Manager');
    assert.equal(options.headers['Application-Version'], version);
    assert.deepEqual(variables.filter.filter[0], { gameDomainName: { value: 'libraryofruina', op: 'EQUALS' } });
    assert.deepEqual(variables.filter.filter[1], { adultContent: { value: false, op: 'EQUALS' } });
    assert.equal(variables.filter.filter[2].filter[0].nameStemmed.value, 'optimization');
    assert.deepEqual(variables.sort[0], { downloads: { direction: 'DESC' } });
    assert.equal(variables.offset, variables.count);
    return Response.json(nexusResponse);
  });

  const [mod] = results.mods;
  assert.equal(mod.id, 'nexus:ruina:234');
  assert.equal(mod.name, 'Library of Ruina Optimization mod');
  assert.equal(mod.url, 'https://www.nexusmods.com/libraryofruina/mods/234');
  assert.match(mod.thumbnailUrl, /^https:\/\/images\.nexusmods\.com\//);
  assert.equal(mod.category, 'Utilities');
  assert.equal(mod.downloads, 97);
  assert.equal(results.totalCount, 173);
  assert.deepEqual(results.categories, ['Boss Fights', 'Gameplay', 'Miscellaneous', 'Skins', 'User Interface', 'Utilities']);
  assert.equal(results.hasNextPage, true);
});

test('distinguishes a successful empty search from a GraphQL error', async () => {
  const request = { gameId: 'lobotomy', query: 'missing', page: 1 };
  const empty = await searchNexus(request, async () => Response.json({ data: { mods: { totalCount: 0, nodes: [] } } }));
  assert.deepEqual(empty, { totalCount: 0, mods: [], categories: [], hasNextPage: false });
  await assert.rejects(
    searchNexus(request, async () => Response.json({ errors: [{ message: 'Unavailable' }] })),
    /Invalid Nexus Mods catalog response/,
  );
});

test('keeps adult and unclassified listings out of public searches', async () => {
  const search = {
    gameId: 'ruina', query: 'SionGamesEz', page: 1, searchIn: 'author', category: 'Utilities', sort: 'endorsements',
  };
  const [regular] = nexusResponse.data.mods.nodes;
  const flagged = { ...regular, modId: 999, adultContent: true };
  const unclassified = { ...regular, modId: 998, adultContent: null };
  const payload = { data: { mods: { totalCount: 3, nodes: [regular, flagged, unclassified] } } };
  const hidden = await searchNexus({ ...search, showAdult: true }, async (_, options) => {
    const { variables } = JSON.parse(options.body);
    assert.deepEqual(variables.category, ['Utilities']);
    assert.deepEqual(variables.sort[0], { endorsements: { direction: 'DESC' } });
    assert.deepEqual(variables.filter.filter.slice(1), [
      { adultContent: { value: false, op: 'EQUALS' } },
      { op: 'OR', filter: [{ author: { value: 'SionGamesEz', op: 'MATCHES' } }] },
    ]);
    return Response.json(payload);
  });
  assert.deepEqual(hidden.mods.map((mod) => mod.id), ['nexus:ruina:234']);
});

test('deduplicates concurrent searches and keeps cached pages scoped to their requests after restart', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atelier-catalog-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cachePath = path.join(directory, 'catalog.json');
  let requests = 0;
  const catalog = createCatalogService({
    cachePath,
    search: async (request) => {
      requests += 1;
      assert.equal(request.showAdult, undefined);
      return {
        mods: [{ id: `${request.gameId}:${request.page}`, adult: false }, { id: 'flagged', adult: true }],
        totalCount: 21,
        hasNextPage: request.page === 1,
      };
    },
  });
  const ruina = { gameId: 'ruina', query: 'basemod', page: 1 };
  const lobotomy = { gameId: 'lobotomy', query: 'basemod', page: 1 };
  const secondPage = { ...ruina, page: 2 };
  const [live, duplicate] = await Promise.all([
    catalog(ruina),
    catalog({ ...ruina, query: ' basemod ', showAdult: true }),
    catalog(lobotomy),
    catalog(secondPage),
  ]);
  assert.equal(requests, 3);
  assert.equal(live.freshness, 'live');
  assert.deepEqual(live.mods.map((mod) => mod.id), ['ruina:1']);
  assert.deepEqual(live, duplicate);

  const offline = createCatalogService({
    cachePath,
    search: async () => { throw new Error('Offline'); },
  });
  assert.deepEqual(await offline(ruina), { ...live, freshness: 'cached' });
  assert.equal((await offline(lobotomy)).mods[0].id, 'lobotomy:1');
  assert.equal((await offline(secondPage)).mods[0].id, 'ruina:2');
  await assert.rejects(offline({ ...ruina, sort: 'relevance' }), /Offline/);
  await assert.rejects(offline({ ...ruina, searchIn: 'name' }), /Offline/);
  await assert.rejects(offline({ ...ruina, category: 'Utilities' }), /Offline/);
  await assert.rejects(offline({ ...ruina, query: 'no cached page' }), /Offline/);
  await assert.rejects(offline({ ...ruina, gameId: 'unknown' }), /Invalid catalog search/);
  await assert.rejects(offline({ ...ruina, page: 0 }), /Invalid catalog search/);
});

test('keeps clean legacy cache pages and rejects restricted pages offline', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atelier-catalog-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cachePath = path.join(directory, 'catalog.json');
  const request = {
    gameId: 'ruina', query: '', page: 1, searchIn: 'all', category: '', sort: 'downloads',
  };
  const page = { mods: [{ id: 'public', adult: false }], totalCount: 1, hasNextPage: false };
  const restrictedPage = { ...page, mods: [{ id: 'restricted', adult: true }] };
  await writeFile(cachePath, JSON.stringify([
    [JSON.stringify({ ...request, showAdult: false }), page],
    [JSON.stringify({ ...request, showAdult: true }), restrictedPage],
    [JSON.stringify({ ...request, page: 2, showAdult: false }), restrictedPage],
    [JSON.stringify({ ...request, page: 3, showAdult: true }), page],
  ]));
  const offline = createCatalogService({
    cachePath,
    search: async () => { throw new Error('Offline'); },
  });

  assert.deepEqual((await offline({ ...request, showAdult: true })).mods, page.mods);
  await assert.rejects(offline({ ...request, page: 2 }), /Offline/);
  await assert.rejects(offline({ ...request, page: 3, showAdult: true }), /Offline/);
});

test('uses fresh cache until refreshed, then drops offline results after seven days', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atelier-catalog-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let time = Date.parse('2026-01-01T00:00:00Z');
  let requests = 0;
  let online = true;
  const catalog = createCatalogService({
    cachePath: path.join(directory, 'catalog.json'),
    now: () => time,
    search: async () => {
      requests += 1;
      if (!online) throw new Error('Offline');
      return { mods: [], totalCount: 0, hasNextPage: false };
    },
  });
  const request = { gameId: 'ruina', query: '', page: 1 };

  assert.equal((await catalog(request)).freshness, 'live');
  assert.equal((await catalog(request)).freshness, 'cached');
  assert.equal(requests, 1);
  assert.equal((await catalog({ ...request, refresh: true })).freshness, 'live');
  assert.equal(requests, 2);
  time += 5 * 60 * 1000;
  online = false;
  assert.equal((await catalog(request)).freshness, 'cached');
  assert.equal(requests, 3);
  time += 7 * 24 * 60 * 60 * 1000;
  await assert.rejects(catalog(request), /Offline/);
});

test('backs off across games after Nexus sends Retry-After and serves matching cached results', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atelier-catalog-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let time = Date.now();
  let requests = 0;
  let rateLimited = false;
  const catalog = createCatalogService({
    cachePath: path.join(directory, 'catalog.json'),
    now: () => time,
    search: (request) => searchNexus(request, async () => {
      requests += 1;
      return rateLimited
        ? new Response(null, { status: 429, headers: { 'Retry-After': '120' } })
        : Response.json(nexusResponse);
    }),
  });
  const request = { gameId: 'ruina', query: '', page: 1 };
  const otherGame = { ...request, gameId: 'lobotomy' };
  const live = await catalog(request);

  rateLimited = true;
  const cached = await catalog({ ...request, refresh: true });
  const { rateLimitedUntil } = cached;
  assert.ok(Date.parse(rateLimitedUntil) >= time + 120_000);
  assert.deepEqual(cached, { ...live, freshness: 'cached', rateLimitedUntil });
  assert.deepEqual(await catalog(otherGame), { rateLimitedUntil });
  assert.equal(requests, 2);

  time = Date.parse(rateLimitedUntil);
  rateLimited = false;
  assert.equal((await catalog(otherGame)).freshness, 'live');
  assert.equal(requests, 3);
});

test('keeps legacy cache entries when filesystem mtime is ahead of system clock', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atelier-catalog-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cachePath = path.join(directory, 'catalog.json');
  const request = {
    gameId: 'ruina', query: '', page: 1, searchIn: 'all', category: '', sort: 'downloads',
  };
  const page = { mods: [{ id: 'public', adult: false }], totalCount: 1, hasNextPage: false };
  await writeFile(cachePath, JSON.stringify([[JSON.stringify({ ...request, showAdult: false }), page]]));

  const skewedNow = Date.now() - 50;
  const offline = createCatalogService({
    cachePath,
    now: () => skewedNow,
    search: async () => { throw new Error('Offline'); },
  });

  assert.deepEqual((await offline(request)).mods, page.mods);
});
