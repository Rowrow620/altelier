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
        description
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

function cleanDescription(text) {
  if (typeof text !== 'string' || !text.trim()) return undefined;
  return text
    .replace(/\[br\s*\/?\]/gi, '\n')
    .replace(/\[\/?(?:b|i|u|s|center|quote|code|list|\*|size(?:=[^\]]*)?|color(?:=[^\]]*)?|font(?:=[^\]]*)?|url(?:=[^\]]*)?|img)\]/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 6000);
}

function toCatalogMod(node, gameId, domain) {
  const thumbnailUrl = [node.thumbnailLargeUrl, node.thumbnailUrl].find(
    (url) => url && IMAGE_CDNS.some((base) => url.startsWith(base)),
  );
  return {
    id: `nexus:${gameId}:${node.modId}`,
    modId: node.modId,
    name: node.name,
    author: node.author || undefined,
    version: node.version || undefined,
    summary: node.summary || undefined,
    description: cleanDescription(node.description),
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

const MOD_FILES = `
  query AtelierModFiles($modId: ID!, $gameId: ID!) {
    modFiles(modId: $modId, gameId: $gameId) {
      fileId
      name
      version
      sizeInBytes
      category
      description
      date
    }
  }
`;

const CATEGORY_ORDER = { MAIN: 0, UPDATE: 1, OPTIONAL: 2, MISCELLANEOUS: 3 };

async function getNexusModFiles(gameId, modId, request = fetch) {
  if (!Number.isSafeInteger(modId) || modId <= 0) throw new Error('Invalid Nexus mod ID.');
  const nexusGameId = games[gameId].nexusGameId;
  const payload = await requestGraphQL(MOD_FILES, { modId: String(modId), gameId: String(nexusGameId) }, request);
  const files = payload.data?.modFiles;
  if (payload.errors?.length || !Array.isArray(files)) {
    throw new Error('Could not load mod files from Nexus Mods.');
  }
  return files
    .filter((file) => Number.isSafeInteger(file?.fileId) && file.fileId > 0 &&
      !['ARCHIVED', 'REMOVED', 'OLD_VERSION'].includes(file.category))
    .map((file) => ({
      fileId: file.fileId,
      name: String(file.name || `File #${file.fileId}`),
      version: String(file.version || ''),
      sizeInBytes: Number(file.sizeInBytes) || 0,
      category: String(file.category || 'MAIN'),
      description: cleanDescription(file.description),
      uploadedAt: file.date ? new Date(Number(file.date) * 1000).toISOString() : undefined,
    }))
    .sort((left, right) => {
      const rank = (CATEGORY_ORDER[left.category] ?? 9) - (CATEGORY_ORDER[right.category] ?? 9);
      return rank !== 0 ? rank : right.fileId - left.fileId;
    });
}

async function getNexusDownloadLink(domain, modId, fileId, apiKey, request = fetch) {
  if (!apiKey) {
    throw new Error('Add a Nexus Mods Premium API key in Settings to download mods directly.');
  }
  const url = `https://api.nexusmods.com/v1/games/${encodeURIComponent(domain)}/mods/${modId}/files/${fileId}/download_link.json`;
  const response = await request(url, {
    headers: {
      Accept: 'application/json',
      apikey: apiKey,
      'Application-Name': 'Atelier Mod Manager',
      'Application-Version': version,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 429) throw new NexusRateLimitError(response.headers.get('Retry-After'));
  if (response.status === 401 || response.status === 403) {
    throw new Error('Nexus Mods rejected the API key or requires a Premium account for direct downloads.');
  }
  if (!response.ok) throw new Error('Nexus Mods returned HTTP ' + response.status);
  const links = await response.json();
  const uri = Array.isArray(links) ? links.find((item) => typeof item?.URI === 'string' && item.URI.startsWith('https://'))?.URI : undefined;
  if (!uri) throw new Error('Nexus Mods did not return a download link.');
  return uri;
}

module.exports = {
  searchNexus, lookupNexusReleases, getNexusModFiles, getNexusDownloadLink,
  createNexusRequest, NexusRateLimitError,
};
