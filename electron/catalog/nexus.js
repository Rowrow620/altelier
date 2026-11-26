const { version } = require('../../package.json');
const { games } = require('../../shared/default-config.json');

const NEXUS_API = 'https://api.nexusmods.com/v2/graphql';
const PAGE_SIZE = 20;
const DEFAULT_RETRY_DELAY = 60_000;

class NexusRateLimitError extends Error {
  constructor(retryAfter, now = Date.now()) {
    super('Nexus Mods is limiting requests.');
    const retryAt = /^\d+$/.test(retryAfter)
      ? now + Number(retryAfter) * 1000
      : Date.parse(retryAfter);
    this.retryAt = Number.isFinite(new Date(retryAt).getTime()) && retryAt >= now
      ? retryAt
      : now + DEFAULT_RETRY_DELAY;
  }
}

function createNexusRequest(request = fetch, now = Date.now) {
  let limited;
  return async (url, options) => {
    if (limited && now() < limited.retryAt) throw limited;
    const response = await request(url, options);
    if (response.status === 429) {
      const limit = new NexusRateLimitError(response.headers.get('Retry-After'), now());
      if (!limited || limit.retryAt > limited.retryAt) limited = limit;
      throw limited;
    }
    return response;
  };
}

async function requestGraphQL(query, variables, request) {
  const response = await request(NEXUS_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Application-Name': 'Atelier Mod Manager',
      'Application-Version': version,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 429) throw new NexusRateLimitError(response.headers.get('Retry-After'));
  if (!response.ok) throw new Error('Nexus Mods returned HTTP ' + response.status);
  return response.json();
}

const SEARCH_FIELDS = {
  all: ['nameStemmed', 'author', 'description'],
  name: ['nameStemmed'],
  author: ['author'],
};

const SORT_FIELDS = {
  relevance: 'relevance',
  updated: 'updatedAt',
  newest: 'createdAt',
  downloads: 'downloads',
  endorsements: 'endorsements',
};
const IMAGE_CDNS = [
  'https://images.nexusmods.com/',
  'https://staticdelivery.nexusmods.com/',
];

const SEARCH_MODS = `
  query AtelierBrowse($filter: ModsFilter!, $category: [String!]!, $sort: [ModsSort!]!, $count: Int!, $offset: Int!) {
    mods(filter: $filter, facets: { categoryName: $category }, sort: $sort, count: $count, offset: $offset) {
      totalCount
      facetsData
      nodes {
        modId
        name
        author
        version
        summary
        category
        adultContent
        downloads
        endorsements
        thumbnailLargeUrl
        thumbnailUrl
      }
    }
  }
`;

function toCatalogMod(node, gameId, domain) {
  const thumbnailUrl = [node.thumbnailLargeUrl, node.thumbnailUrl].find(
    (url) => url && IMAGE_CDNS.some((base) => url.startsWith(base)),
  );
  return {
    id: `nexus:${gameId}:${node.modId}`,
    name: node.name,
    author: node.author || undefined,
    version: node.version || undefined,
    summary: node.summary || undefined,
    category: node.category,
    adult: node.adultContent === true,
    downloads: node.downloads,
    endorsements: node.endorsements,
    thumbnailUrl,
    url: `https://www.nexusmods.com/${domain}/mods/${node.modId}`,
  };
}

async function searchNexus({
  gameId, query, page, searchIn = 'all', category = '', sort = 'downloads',
}, request = fetch) {
  const domain = games[gameId].nexusDomain;
  const filters = [
    { gameDomainName: { value: domain, op: 'EQUALS' } },
    { adultContent: { value: false, op: 'EQUALS' } },
  ];

  if (query) {
    filters.push({
      op: 'OR',
      filter: SEARCH_FIELDS[searchIn].map((field) => ({ [field]: { value: query, op: 'MATCHES' } })),
    });
  }

  const rankBy = sort === 'relevance' && !query ? 'updatedAt' : SORT_FIELDS[sort];
  const sortFields = [...new Set([rankBy, 'updatedAt', 'createdAt'])];
  const payload = await requestGraphQL(SEARCH_MODS, {
    filter: { op: 'AND', filter: filters },
    category: category ? [category] : [],
    sort: sortFields.map((field) => ({ [field]: { direction: 'DESC' } })),
    count: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }, request);
  const mods = payload.data?.mods;
  if (payload.errors?.length || !Array.isArray(mods?.nodes) || !Number.isSafeInteger(mods.totalCount)) {
    throw new Error('Invalid Nexus Mods catalog response');
  }

  return {
    mods: mods.nodes
      .filter((node) => node.adultContent === false)
      .map((node) => toCatalogMod(node, gameId, domain)),
    categories: Object.keys(mods.facetsData?.categoryName ?? {}).sort((left, right) => left.localeCompare(right)),
    totalCount: mods.totalCount,
    hasNextPage: page * PAGE_SIZE < mods.totalCount,
  };
}

const MOD_RELEASES = `
  query AtelierReleases($filter: ModsFilter!, $count: Int!) {
    mods(filter: $filter, count: $count) {
      nodes {
        modId version adultContent
        modRequirements {
          nexusRequirements(count: 20) {
            totalCount
            nodes { modId gameId externalRequirement }
          }
          dlcRequirements { __typename }
        }
      }
    }
  }
`;

async function lookupNexusReleases(gameId, ids, request = fetch) {
  const nexusGameId = String(games[gameId].nexusGameId);
  const payload = await requestGraphQL(MOD_RELEASES, {
    filter: {
      op: 'OR',
      filter: ids.map((id) => ({
        op: 'AND',
        gameId: [{ value: nexusGameId, op: 'EQUALS' }],
        modId: [{ value: String(id), op: 'EQUALS' }],
        adultContent: [{ value: false, op: 'EQUALS' }],
      })),
    },
    count: ids.length,
  }, request);
  const nodes = payload.data?.mods?.nodes;
  if (payload.errors?.length || !Array.isArray(nodes)) throw new Error('Nexus Mods could not check for updates.');
  return new Map(nodes.filter((node) => node?.adultContent === false && ids.includes(node.modId) &&
    typeof node.version === 'string' && node.version.trim() && node.version.length <= 100)
    .map((node) => {
      const page = node.modRequirements?.nexusRequirements;
      const requirements = Array.isArray(page?.nodes) ? page.nodes : [];
      const localRequirements = requirements.filter((item) => item?.externalRequirement === false &&
        String(item.gameId) === nexusGameId && Number.isSafeInteger(Number(item.modId)) && Number(item.modId) > 0);
      return [node.modId, {
        version: node.version.trim(),
        requiredIds: [...new Set(localRequirements.map((item) => Number(item.modId)))],
        reviewRequirements: Boolean(page?.totalCount > localRequirements.length || node.modRequirements?.dlcRequirements?.length),
      }];
    }));
}

module.exports = { searchNexus, lookupNexusReleases, createNexusRequest, NexusRateLimitError };
