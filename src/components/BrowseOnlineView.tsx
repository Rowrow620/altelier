import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CatalogFilters as FilterValues, CatalogResults, CatalogSearch, GameId } from '../types';
import { CatalogCard } from './browse/CatalogCard';
import { CatalogFilters } from './browse/CatalogFilters';

type BrowseRequest = Omit<CatalogSearch, 'gameId'>;
type SearchState =
  | { status: 'loading' }
  | { status: 'ready'; results: CatalogResults }
  | { status: 'error'; message: string };

const DEFAULT_SEARCH: BrowseRequest = {
  query: '',
  page: 1,
  searchIn: 'all',
  category: '',
  sort: 'downloads',
};

export function BrowseOnlineView({ gameId }: { gameId: GameId }) {
  const [search, setSearch] = useState('');
  const [request, setRequest] = useState(DEFAULT_SEARCH);
  const [categories, setCategories] = useState<string[]>([]);
  const [state, setState] = useState<SearchState>({ status: 'loading' });

  useEffect(() => {
    const api = window.atelierApi;
    if (!api) {
      setState({ status: 'error', message: 'Open Atelier to browse mods.' });
      return;
    }

    let active = true;
    api.searchCatalog({ gameId, ...request }).then(
      (reply) => {
        if (!active) return;
        if ('mods' in reply) {
          setCategories(reply.categories);
          setState({ status: 'ready', results: reply });
        } else {
          setState({ status: 'error', message: rateLimitMessage(reply.rateLimitedUntil) });
        }
      },
      () => {
        if (active) setState({ status: 'error', message: 'Nexus Mods is unavailable.' });
      },
    );
    return () => { active = false; };
  }, [gameId, request]);

  function load(next: BrowseRequest, refresh = false) {
    setState({ status: 'loading' });
    setRequest({ ...next, refresh });
  }

  function applyFilters(change: Partial<FilterValues> = {}) {
    load({ ...request, ...change, query: search.trim(), page: 1 });
  }

  function resetSearch() {
    setSearch('');
    load(DEFAULT_SEARCH);
  }

  const loading = state.status === 'loading';
  const results = state.status === 'ready' ? state.results : undefined;
  const previousDisabled = loading || request.page === 1;
  const nextDisabled = loading || !results?.hasNextPage;
  const canReset = !!(search || request.query || request.category ||
    request.searchIn !== DEFAULT_SEARCH.searchIn || request.sort !== DEFAULT_SEARCH.sort);
  const status = getResultStatus(state);

  return (
    <section aria-labelledby="browse-heading" className="workspace-scroll">
      <h2 id="browse-heading" className="sr-only">Browse Mods</h2>
      <div className="workspace-content pt-5">
        <CatalogFilters
          search={search}
          filters={request}
          categories={categories}
          loading={loading}
          canReset={canReset}
          onSearchChange={setSearch}
          onSearch={applyFilters}
          onFilterChange={applyFilters}
          onRefresh={() => load(request, true)}
          onReset={resetSearch}
        />

        <div className="mt-4 mb-3 flex flex-wrap items-center justify-between gap-2">
          <p role="status" aria-atomic="true" className="text-sm text-muted">
            {status}
            {results?.freshness === 'cached' && (
              <span className="ml-2 text-accent" title={new Date(results.fetchedAt).toLocaleString()}>Cached results</span>
            )}
            {results?.rateLimitedUntil && <span className="ml-2">{rateLimitMessage(results.rateLimitedUntil)}</span>}
            {!!results?.mods.length && <span className="sr-only">. Page {request.page}</span>}
          </p>
          <nav aria-label="Catalog pages" className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous page"
              title="Previous page"
              aria-disabled={previousDisabled}
              onClick={() => { if (!previousDisabled) load({ ...request, page: request.page - 1 }); }}
              className="ui-button ui-button--icon"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <span className="min-w-14 text-center text-xs text-muted tabular-nums">Page {request.page}</span>
            <button
              type="button"
              aria-label="Next page"
              title="Next page"
              aria-disabled={nextDisabled}
              onClick={() => { if (!nextDisabled) load({ ...request, page: request.page + 1 }); }}
              className="ui-button ui-button--icon"
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </nav>
        </div>

        <div aria-busy={loading} className="mod-grid">
          {loading && Array.from({ length: 6 }, (_, index) => (
            <div key={index} aria-hidden="true" className="atelier-card overflow-hidden rounded-xl motion-safe:animate-pulse">
              <div className="aspect-video max-h-40 bg-field" />
              <div className="space-y-3 p-4">
                <div className="h-3 w-2/3 rounded bg-line" />
                <div className="h-2 w-1/3 rounded bg-line" />
                <div className="h-2 w-full rounded bg-line" />
              </div>
            </div>
          ))}
          {results?.mods.map((mod, index) => <CatalogCard key={mod.id} mod={mod} eager={index < 5} />)}
        </div>
      </div>
    </section>
  );
}

function rateLimitMessage(retryAt: string) {
  const retryTime = new Date(retryAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Nexus Mods is limiting requests. Try again after ${retryTime}.`;
}

function getResultStatus(state: SearchState) {
  if (state.status === 'loading') return 'Loading mods…';
  if (state.status === 'error') return state.message;
  const { totalCount, mods } = state.results;
  if (totalCount === 0) return 'No mods found.';
  if (!mods.length) return 'No mods on this page.';
  return `${totalCount.toLocaleString()} ${totalCount === 1 ? 'mod' : 'mods'}`;
}
