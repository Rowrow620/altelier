import { ExternalLink, Folder, Trash2 } from 'lucide-react';
import type { Mod, ModUpdate } from '../types';

interface ModCardProps {
  mod: Mod;
  update?: ModUpdate;
  onToggle: (modId: string, current: boolean) => void;
  onOpenFolder: (modId: string) => void;
  onDelete: (modId: string) => void;
  onViewDetails: (mod: Mod) => void;
}

const iconButton = 'grid size-8 place-items-center rounded-md border border-transparent text-muted transition-colors hover:border-line hover:bg-white/10 hover:text-white';

export function ModCard({ mod, update, onToggle, onOpenFolder, onDelete, onViewDetails }: ModCardProps) {
  const reference = mod.source === 'workshop' ? mod.id : mod.folderName;
  const sourceUrl = mod.workshopUrl || (update?.status === 'available' ? mod.nexusUrl + '?tab=files' : mod.nexusUrl);
  const sourceLabel = mod.source === 'workshop' ? 'Steam Workshop' : 'Nexus Mods';
  return (
    <article className="atelier-card flex min-w-0 flex-col overflow-hidden rounded-xl">
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="leading-snug font-semibold">
              <button
                type="button"
                onClick={() => onViewDetails(mod)}
                className="rounded-sm text-left text-sm break-words text-white hover:text-accent hover:underline"
              >
                {mod.name}
              </button>
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted">
              {mod.source === 'workshop' ? sourceLabel : mod.author}{mod.version && ' · ' + mod.version}
            </p>
          </div>
          {mod.enabled !== null && <button
            type="button"
            role="switch"
            aria-label={`Enable ${mod.name}`}
            aria-checked={mod.enabled}
            onClick={() => onToggle(mod.id, mod.enabled)}
            className={`flex h-6 w-10 shrink-0 items-center rounded-full p-1 transition-colors ${mod.enabled ? 'bg-accent' : 'bg-[#454955]'}`}
          >
            <span aria-hidden="true" className={`size-4 rounded-full transition-transform ${mod.enabled ? 'translate-x-4 bg-chrome' : 'bg-white'}`} />
          </button>}
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted">{mod.description}</p>
        {(update?.status === 'available' || update?.status === 'different') && (
          <p className="text-xs text-accent">
            {update.status === 'available' ? 'Update available' : 'Different version on Nexus'} · {update.latestVersion}
          </p>
        )}
        {!!update?.missingRequirements && (
          <p className="text-xs text-accent">
            {update.missingRequirements} {update.missingRequirements === 1 ? 'requirement' : 'requirements'} missing or disabled
          </p>
        )}
        {update?.reviewRequirements && <p className="text-xs text-muted">Review requirements on Nexus Mods</p>}
        <div className="mt-auto flex items-center justify-between gap-1 border-t border-line pt-2">
          <span className="truncate text-xs text-muted" title={mod.category}>{mod.category}</span>
          <div className="flex shrink-0 items-center">
            {sourceUrl && (
              <button
                type="button"
                aria-label={`Open on ${sourceLabel} (${mod.name})`}
                title={sourceLabel}
                onClick={() => window.atelierApi?.openExternal(sourceUrl)}
                className={iconButton}
              >
                <ExternalLink size={15} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              aria-label={`Open folder for ${mod.name}`}
              title="Open folder"
              onClick={() => onOpenFolder(reference)}
              className={iconButton}
            >
              <Folder size={15} aria-hidden="true" />
            </button>
            {mod.source !== 'workshop' && <button
              type="button"
              aria-label={`Delete ${mod.name}`}
              title="Delete mod"
              onClick={() => onDelete(mod.folderName)}
              className={`${iconButton} hover:text-rose-300`}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>}
          </div>
        </div>
      </div>
    </article>
  );
}
