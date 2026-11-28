import { useState } from 'react';
import { ArrowDown, ArrowUp, Package, Search, Upload } from 'lucide-react';
import type { GameId, Mod, UpdateResults } from '../types';
import { errorMessage } from '../errors';
import { ModCard } from './ModCard';

interface DashboardViewProps {
  gameId: GameId;
  mods: Mod[];
  loading: boolean;
  onToggleMod: (modId: string, current: boolean) => void;
  onToggleAll: (enable: boolean) => void;
  onOpenFolder: (modId?: string) => void;
  onDeleteMod: (modId: string) => void;
  onViewDetails: (mod: Mod) => void;
  onImport: () => void;
}

type SortKey = 'name' | 'status' | 'category';

export function DashboardView({
  gameId, mods, loading, onToggleMod, onToggleAll, onOpenFolder, onDeleteMod, onViewDetails, onImport,
}: DashboardViewProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [updateReport, setUpdateReport] = useState<{ mods: Mod[]; results: UpdateResults } | null>(null);
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [updateError, setUpdateError] = useState('');
  const query = search.trim().toLowerCase();
  const categories = [...new Set(mods.map((mod) => mod.category))].sort((left, right) => left.localeCompare(right));
  const matchingMods = mods
    .filter((mod) => (
      (!category || mod.category === category) &&
      (statusFilter === 'all' || (statusFilter === 'enabled' ? mod.enabled === true : mod.enabled === false)) &&
      [mod.name, mod.author, mod.description].some((field) => field.toLowerCase().includes(query))
    ))
    .sort((left, right) => {
      let cmp = 0;
      if (sortBy === 'status') cmp = Number(Boolean(right.enabled)) - Number(Boolean(left.enabled));
      else if (sortBy === 'category') cmp = left.category.localeCompare(right.category);
      else cmp = left.name.localeCompare(right.name);
      if (cmp === 0) cmp = left.name.localeCompare(right.name);
      return sortAsc ? cmp : -cmp;
    });
  const updates = updateReport?.mods === mods ? updateReport.results : null;
  const updatesByMod = new Map(updates?.items.map((item) => [item.modId, item]));
  const currentChecks = mods.flatMap((mod) => {
    const check = updatesByMod.get(mod.id);
    return check && check.installedVersion === mod.version && check.nexusModId === mod.nexusModId ? [check] : [];
  });
  const available = currentChecks.filter((item) => item.status === 'available' || item.status === 'different' ||
    item.missingRequirements || item.reviewRequirements).length;
  let updateStatus = '';
  if (updates?.retryAt) {
    updateStatus = 'Nexus Mods is limiting requests. Try again after ' + new Date(updates.retryAt).toLocaleTimeString() + '.';
  } else if (updates) {
    if (!updates.eligible) updateStatus = 'Add a Nexus link and version in a mod’s details to check for updates.';
    else if (!currentChecks.length) updateStatus = 'No current versions could be checked.';
    else updateStatus = available ? available + (available === 1 ? ' mod to review.' : ' mods to review.') : 'No updates found for checked mods.';
  }

  function toggleSort(column: SortKey) {
    if (sortBy === column) setSortAsc((asc) => !asc);
    else {
      setSortBy(column);
      setSortAsc(true);
    }
  }

  async function checkUpdates() {
    const api = window.atelierApi;
    if (!api || checking) return;
    setChecking(true);
    setUpdateError('');
    try {
      setUpdateReport({ mods, results: await api.checkUpdates(gameId) });
    } catch (cause) {
      setUpdateReport(null);
      setUpdateError(errorMessage(cause, 'Could not check for updates.'));
    } finally {
      setChecking(false);
    }
  }

  const SortIcon = sortAsc ? ArrowUp : ArrowDown;

  return (
    <section aria-labelledby="library-heading" className="workspace-scroll">
      <h2 id="library-heading" className="sr-only">Mod Library</h2>
      <div className="workspace-content pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <label className="relative min-w-52 flex-1 max-w-md">
              <span className="sr-only">Search installed mods</span>
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-2.5 left-3 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search installed mods"
                className="ui-field w-full select-text pl-9 placeholder:text-muted"
              />
            </label>
            <label>
              <span className="sr-only">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | 'enabled' | 'disabled')}
                className="ui-field"
              >
                <option value="all">All statuses</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="ui-field">
                <option value="">All categories</option>
                {categories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <div className="inline-flex h-9 shrink-0 items-center divide-x divide-line overflow-hidden rounded-md border border-line bg-panel">
            <button
              type="button"
              disabled={loading || !mods.some((mod) => mod.enabled === false)}
              className="h-full px-3 text-xs font-medium text-white transition-colors hover:bg-white/[0.07] disabled:opacity-45"
              onClick={() => onToggleAll(true)}
            >
              Enable all
            </button>
            <button
              type="button"
              disabled={loading || !mods.some((mod) => mod.enabled === true)}
              className="h-full px-3 text-xs font-medium text-white transition-colors hover:bg-white/[0.07] disabled:opacity-45"
              onClick={() => onToggleAll(false)}
            >
              Disable all
            </button>
            <button
              type="button"
              disabled={loading || checking || !mods.some((mod) => mod.source === 'local')}
              className="h-full px-3 text-xs font-medium text-white transition-colors hover:bg-white/[0.07] disabled:opacity-45"
              onClick={checkUpdates}
            >
              Check updates
            </button>
          </div>
        </div>
        {(checking || updateStatus || updateError) && (
          <p role="status" className="mt-3 text-sm text-muted">
            {checking ? 'Checking for updates…' : updateError || updateStatus}
          </p>
        )}
        {loading && <p role="status" className="mt-4 text-sm text-muted">Loading installed mods…</p>}

        {!loading && (matchingMods.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-md border border-line bg-panel">
            {(() => {
              const visibleMods = expanded ? matchingMods : matchingMods.slice(0, 10);
              const selectableVisible = visibleMods.filter((mod) => mod.source !== 'workshop');
              const selectedSet = new Set(selectedIds);
              const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((mod) => selectedSet.has(mod.id));
              const selectedMods = mods.filter((mod) => mod.source !== 'workshop' && selectedSet.has(mod.id));
              return (
                <>
                  {selectedMods.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-field px-4 py-2 text-xs">
                      <span className="font-medium text-white">{selectedMods.length} selected</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            for (const mod of selectedMods) {
                              if (mod.enabled === false) await onToggleMod(mod.id, false);
                            }
                            setSelectedIds([]);
                          }}
                          className="ui-button h-7 min-h-7 text-xs"
                        >
                          Enable selected
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            for (const mod of selectedMods) {
                              if (mod.enabled === true) await onToggleMod(mod.id, true);
                            }
                            setSelectedIds([]);
                          }}
                          className="ui-button h-7 min-h-7 text-xs"
                        >
                          Disable selected
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedIds([])}
                          className="text-muted hover:text-white"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="hidden grid-cols-[28px_100px_minmax(180px,1fr)_140px_92px_168px_96px] items-center gap-3 border-b border-line bg-chrome px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid">
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        disabled={selectableVisible.length === 0}
                        aria-label="Select all visible local mods"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds((prev) => [...new Set([...prev, ...selectableVisible.map((m) => m.id)])]);
                          } else {
                            const visibleSet = new Set(selectableVisible.map((m) => m.id));
                            setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
                          }
                        }}
                        className="size-3.5 accent-[var(--color-accent)]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSort('status')}
                      className="flex items-center justify-center gap-1 transition-colors hover:text-white"
                    >
                      <span>Status</span>
                      {sortBy === 'status' && <SortIcon size={12} aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className="flex items-center gap-1 text-left transition-colors hover:text-white"
                    >
                      <span>Mod Name</span>
                      {sortBy === 'name' && <SortIcon size={12} aria-hidden="true" />}
                    </button>
                    <span>Author</span>
                    <span>Version</span>
                    <button
                      type="button"
                      onClick={() => toggleSort('category')}
                      className="flex items-center gap-1 text-left transition-colors hover:text-white"
                    >
                      <span>Category</span>
                      {sortBy === 'category' && <SortIcon size={12} aria-hidden="true" />}
                    </button>
                    <span className="sr-only">Actions</span>
                  </div>
                  <div className="max-h-[480px] divide-y divide-line overflow-y-auto">
                    {visibleMods.map((mod) => (
                      <ModCard
                        key={mod.id}
                        mod={mod}
                        update={currentChecks.find((item) => item.modId === mod.id)}
                        selected={selectedSet.has(mod.id)}
                        onSelectChange={(modId, next) => {
                          setSelectedIds((prev) => next ? [...new Set([...prev, modId])] : prev.filter((id) => id !== modId));
                        }}
                        onToggle={onToggleMod}
                        onOpenFolder={onOpenFolder}
                        onDelete={onDeleteMod}
                        onViewDetails={onViewDetails}
                      />
                    ))}
                  </div>
                </>
              );
            })()}
            {matchingMods.length > 10 && (
              <div className="flex items-center justify-between border-t border-line bg-chrome/60 px-4 py-2 text-xs text-muted">
                <span>
                  Showing {expanded ? matchingMods.length : 10} of {matchingMods.length} mods
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => !prev)}
                  className="font-medium text-accent transition-colors hover:text-white"
                >
                  {expanded ? 'Show 10' : `Expand (${matchingMods.length - 10} more)`}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-md border border-dashed border-line px-4 py-12 text-center">
            <Package size={25} aria-hidden="true" className="text-muted" />
            <h3 className="text-sm font-semibold text-white">{mods.length ? 'No matching mods' : 'No mods installed'}</h3>
            {!!mods.length && (
              <button
                type="button"
                onClick={() => { setSearch(''); setCategory(''); setStatusFilter('all'); }}
                className="ui-button"
              >
                Clear filters
              </button>
            )}
          </div>
        ))}
        {!loading && (
          <div className="mt-4 flex items-center justify-center rounded-md border border-dashed border-line bg-chrome/60 px-4 py-3">
            <button type="button" onClick={onImport} aria-haspopup="dialog" className="ui-button text-xs">
              <Upload size={14} aria-hidden="true" /> Import Mod
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
