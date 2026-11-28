const { version: currentVersion } = require('../../package.json');

const REPO_RELEASE_API = 'https://api.github.com/repos/Rowrow620/altelier/releases/latest';
const ALLOWED_RELEASE_PREFIX = 'https://github.com/Rowrow620/altelier/releases/';

function parseSemver(raw) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(raw ?? '').trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function sanitizeReleaseUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(ALLOWED_RELEASE_PREFIX)) {
    return '';
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

async function checkAppUpdate({ fetcher = fetch, appVersion = currentVersion } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(REPO_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Atelier-Mod-Manager/${appVersion}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`GitHub returned status ${response.status}.`);
    }
    const data = await response.json();
    const latestVersion = String(data?.tag_name ?? '').replace(/^v/i, '').trim();
    if (!parseSemver(latestVersion)) {
      throw new Error('Could not read latest release version.');
    }
    const releaseUrl = sanitizeReleaseUrl(data?.html_url);
    if (!releaseUrl) {
      throw new Error('Release link did not match the official repository.');
    }
    const updateAvailable = compareSemver(latestVersion, appVersion) > 0;
    return {
      currentVersion: appVersion,
      latestVersion,
      updateAvailable,
      releaseUrl,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { checkAppUpdate, compareSemver, sanitizeReleaseUrl };
