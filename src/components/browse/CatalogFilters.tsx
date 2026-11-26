import { RotateCw, Search, X } from 'lucide-react';
import type { CatalogFilters as FilterValues } from '../../types';

interface CatalogFiltersProps {
  search: string;
  filters: FilterValues;
  categories: string[];
  loading: boolean;
  canReset: boolean;
  onSearchChange: (query: string) => void;
  onSearch: () => void;
  onFilterChange: (change: Partial<FilterValues>) => void;
  onRefresh: () => void;
  onReset: () => void;
}

export function CatalogFilters({
  search, filters, categories, loading, canReset, onSearchChange, onSearch, onFilterChange, onRefresh, onReset,
}: CatalogFiltersProps) {
  const categoryOptions = filters.category && !categories.includes(filters.category)
    ? [filters.category, ...categories]
    : categories;

  return (
    <form
      role="search"
      aria-label="Nexus Mods"
      onSubmit={(event) => { event.preventDefault(); onSearch(); }}
      className="catalog-toolbar rounded-xl border border-line bg-panel p-3"
    >
      <div className="catalog-controls">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search mods</span>
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-2.5 left-3 text-muted" />
            <input
              id="catalog-search"
              type="search"
              maxLength={120}
              value={search}
              placeholder="Search mods"
              onChange={(event) => onSearchChange(event.target.value)}
              className="ui-field w-full select-text pl-9 placeholder:text-muted"
            />
          </label>
          <button type="submit" className="ui-button ui-button--primary">Search</button>
          <button
            type="button"
            title="Refresh results"
            aria-label="Refresh results"
            aria-disabled={loading}
            className="ui-button ui-button--icon"
            onClick={() => { if (!loading) onRefresh(); }}
          >
            <RotateCw size={16} aria-hidden="true" />
          </button>
          {canReset && (
            <button
              type="button"
              title="Reset search"
              aria-label="Reset search"
              onClick={(event) => {
                event.currentTarget.form?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
                onReset();
              }}
              className="ui-button ui-button--icon"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <label className="grid gap-1 text-xs font-medium text-muted">
            Search by
            <select
              value={filters.searchIn}
              onChange={(event) => onFilterChange({ searchIn: event.target.value as FilterValues['searchIn'] })}
              className="ui-field min-w-32"
            >
              <option value="all">All fields</option>
              <option value="name">Mod name</option>
              <option value="author">Author</option>
            </select>
          </label>

          <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">
            Category
            <select
              value={filters.category}
              onChange={(event) => onFilterChange({ category: event.target.value })}
              className="ui-field w-39 max-w-full"
            >
              <option value="">All categories</option>
              {categoryOptions.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-medium text-muted">
            Sort by
            <select
              value={filters.sort}
              onChange={(event) => onFilterChange({ sort: event.target.value as FilterValues['sort'] })}
              className="ui-field min-w-42"
            >
              <option value="relevance">Relevance</option>
              <option value="updated">Recently updated</option>
              <option value="newest">Newest</option>
              <option value="downloads">Most downloaded</option>
              <option value="endorsements">Most endorsed</option>
            </select>
          </label>

        </div>
      </div>
    </form>
  );
}
