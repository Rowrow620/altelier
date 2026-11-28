import { ExternalLink, Folder, Trash2 } from 'lucide-react';
import { EnabledButton } from './EnabledButton';
import type { Mod, ModUpdate } from '../types';

interface ModCardProps {
  mod: Mod;
  update?: ModUpdate;
  selected?: boolean;
  onSelectChange?: (modId: string, selected: boolean) => void;
  onToggle: (modId: string, current: boolean) => void;
  onOpenFolder: (modId: string) => void;
  onDelete: (modId: string) => void;
  onViewDetails: (mod: Mod) => void;
}

const iconButton = 'grid size-7 place-items-center rounded border border-transparent text-muted transition-colors hover:border-line hover:bg-white/[0.06] hover:text-white';

export function ModCard({ mod, update, selected = false, onSelectChange, onToggle, onOpenFolder, onDelete, onViewDetails }: ModCardProps) {
  const reference = mod.source === 'workshop' ? mod.id : mod.folderName;
  const sourceUrl = mod.workshopUrl || (update?.status === 'available' ? mod.nexusUrl + '?tab=files' : mod.nexusUrl);
  const sourceLabel = mod.source === 'workshop' ? 'Steam Workshop' : 'Nexus Mods';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03] md:grid md:grid-cols-[28px_100px_minmax(180px,1fr)_140px_92px_168px_96px]">
      <div className="flex items-center justify-center">
        {mod.source !== 'workshop' && onSelectChange ? (
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Select ${mod.name}`}
            onChange={(e) => onSelectChange(mod.id, e.target.checked)}
            className="size-3.5 accent-[var(--color-accent)]"
          />
        ) : (
          <span className="size-3.5" aria-hidden="true" />
        )}
      </div>
      <div className="flex md:justify-center">
        {mod.enabled !== null ? (
          <EnabledButton name={mod.name} enabled={mod.enabled} onToggle={() => onToggle(mod.id, mod.enabled)} />
        ) : (
          <span className="text-xs text-muted">External</span>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onViewDetails(mod)}
          title={mod.name}
          className="truncate rounded-sm text-left text-sm font-medium text-white hover:text-accent hover:underline"
        >
          {mod.name}
        </button>
        {(update?.status === 'available' || update?.status === 'different') && (
          <span className="shrink-0 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent">
            {update.latestVersion}
          </span>
        )}
      </div>

      <div className="hidden truncate text-xs text-muted md:block" title={mod.source === 'workshop' ? sourceLabel : mod.author}>
        {mod.source === 'workshop' ? 'Steam Workshop' : mod.author}
      </div>

      <div className="hidden truncate font-mono text-xs text-stone-300 tabular-nums md:block" title={mod.version || undefined}>
        {mod.version || '—'}
      </div>

      <div className="hidden truncate text-xs text-muted md:block" title={mod.category}>
        {mod.category}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1">
        {sourceUrl && (
          <button
            type="button"
            aria-label={`Open on ${sourceLabel} (${mod.name})`}
            title={sourceLabel}
            onClick={() => window.atelierApi?.openExternal(sourceUrl)}
            className={iconButton}
          >
            <ExternalLink size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          aria-label={`Open folder for ${mod.name}`}
          title="Open folder"
          onClick={() => onOpenFolder(reference)}
          className={iconButton}
        >
          <Folder size={14} aria-hidden="true" />
        </button>
        {mod.source !== 'workshop' && (
          <button
            type="button"
            aria-label={`Delete ${mod.name}`}
            title="Delete mod"
            onClick={() => onDelete(mod.folderName)}
            className={`${iconButton} hover:text-rose-300`}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
