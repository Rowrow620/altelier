import { useState } from 'react';
import { Package, Search } from 'lucide-react';
import type { GameId, Mod, UpdateResults } from '../types';
import { errorMessage } from '../errors';
import { ModCard } from './ModCard';

interface DashboardViewProps {
  gameId: GameId;
  mods: Mod[];
  loading: boolean;
  onToggleMod: (modId: string, current: boolean) => void;
  onOpenFolder: (modId?: string) => void;
  onDeleteMod: (modId: string) => void;
  onViewDetails: (mod: Mod) => void;
}

export function DashboardView({
  gameId, mods, loading, onToggleMod, onOpenFolder, onDeleteMod, onViewDetails,
}: DashboardViewProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [updateReport, setUpdateReport] = useState<{ mods: Mod[]; results: UpdateResults } | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const query = search.trim().toLowerCase();
  const categories = [...new Set(mods.map((mod) => mod.category))].sort((left, right) => left.localeCompare(right));
  const matchingMods = mods.filter((mod) => (
    (!category || mod.category === category) &&
    [mod.name, mod.author, mod.description].some((field) => field.toLowerCase().includes(query))
  ));
  const enabledCount = mods.filter((mod) => mod.enabled).length;
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

  return (
    <section aria-labelledby="library-heading" className="workspace-scroll">
      <h2 id="library-heading" className="sr-only">Mod Library</h2>
      <div className="workspace-content pt-5">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3.5">
          <label className="relative min-w-40 flex-1">
            <span className="sr-only">Search installed mods</span>
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-2.5 left-3 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search installed mods"
              className="ui-field w-full select-text pl-9 placeholder:text-muted"
            />
          </label>
          <label>
            <span className="sr-only">Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="ui-field">
              <option value="">All categories</option>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button type="button" disabled={loading || checking || !mods.some((mod) => mod.source === 'local')}
            className="ui-button" onClick={checkUpdates}>Check updates</button>
        </div>
        {(checking || updateStatus || updateError) && (
          <p role="status" className="mt-3 text-sm text-muted">
            {checking ? 'Checking for updates…' : updateError || updateStatus}
          </p>
        )}
        <p role="status" className="my-4 text-sm text-muted">
          {loading ? 'Loading installed mods…' : <>
            {query || category ? `${matchingMods.length} of ${mods.length}` : mods.length} installed
            {mods.some((mod) => mod.enabled !== null) && (
              <><span aria-hidden="true"> · </span> {enabledCount} local enabled</>
            )}
          </>}
        </p>

        {!loading && (matchingMods.length > 0 ? (
          <div className="mod-grid">
            {matchingMods.map((mod) => (
              <ModCard
                key={mod.id}
                mod={mod}
                update={currentChecks.find((item) => item.modId === mod.id)}
                onToggle={onToggleMod}
                onOpenFolder={onOpenFolder}
                onDelete={onDeleteMod}
                onViewDetails={onViewDetails}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-4 py-12 text-center">
            <Package size={25} aria-hidden="true" className="text-muted" />
            <h3 className="text-sm font-semibold text-white">{mods.length ? 'No matching mods' : 'No mods installed'}</h3>
            {!!mods.length && (
              <button type="button" onClick={() => { setSearch(''); setCategory(''); }} className="ui-button">Clear filters</button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
