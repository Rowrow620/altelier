import { useState } from 'react';
import { Download, ExternalLink, Image, ThumbsUp } from 'lucide-react';
import { errorMessage } from '../../errors';
import type { CatalogMod, GameId } from '../../types';

const compactCount = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

interface CatalogCardProps {
  mod: CatalogMod;
  gameId: GameId;
  eager: boolean;
  onSelect: (mod: CatalogMod) => void;
  onInstalled: () => void;
}

export function CatalogCard({ mod, gameId, eager, onSelect, onInstalled }: CatalogCardProps) {
  const [failedPreview, setFailedPreview] = useState<string>();
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState('');

  async function quickInstall() {
    const api = window.atelierApi;
    if (!api || installing) return;
    const numericModId = mod.modId ?? Number(mod.id.split(':').pop());
    setInstalling(true);
    setStatus('Loading file…');
    try {
      const files = await api.getCatalogFiles(gameId, numericModId);
      const primary = files[0];
      if (!primary) throw new Error('No downloadable file found.');
      setStatus('Downloading…');
      const result = await api.downloadCatalogMod({
        gameId,
        modId: numericModId,
        fileId: primary.fileId,
        fileName: primary.name || mod.name,
        nexusUrl: mod.url,
        version: primary.version || mod.version,
      });
      if (result.success) {
        setStatus(`Installed ${result.modId ?? mod.name}.`);
        onInstalled();
      } else if (result.cancelled) {
        setStatus('Cancelled.');
      } else {
        setStatus(result.error || 'Install failed.');
      }
    } catch (cause) {
      setStatus(errorMessage(cause, 'Could not download mod.'));
    } finally {
      setInstalling(false);
    }
  }

  return (
    <article className="atelier-card flex min-w-0 flex-col overflow-hidden rounded-md">
      <div className="relative grid aspect-video max-h-40 place-items-center bg-field">
        <Image size={28} aria-hidden="true" className="text-[#656977]" />
        {mod.thumbnailUrl && failedPreview !== mod.thumbnailUrl && (
          <img
            src={mod.thumbnailUrl}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            className="absolute inset-0 h-full w-full bg-field object-cover"
            onError={() => setFailedPreview(mod.thumbnailUrl)}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="min-w-0">
          <h3 className="text-[15px] leading-snug font-semibold text-white">
            <button
              type="button"
              onClick={() => onSelect(mod)}
              title={mod.name}
              className="w-full rounded-sm text-left hover:text-accent hover:underline"
            >
              <span className="line-clamp-2 break-words">{mod.name}</span>
            </button>
          </h3>
          {mod.author && <p className="mt-1 truncate text-xs text-muted" title={mod.author}>{mod.author}</p>}
        </div>
        {(mod.summary || mod.description) && (
          <p className="line-clamp-3 text-xs leading-relaxed text-stone-300">{mod.summary || mod.description}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1" title={`${mod.downloads.toLocaleString()} downloads`}>
            <Download size={13} aria-hidden="true" />
            <span aria-hidden="true">{compactCount.format(mod.downloads)}</span>
            <span className="sr-only">{mod.downloads.toLocaleString()} downloads</span>
          </span>
          <span className="inline-flex items-center gap-1" title={`${mod.endorsements.toLocaleString()} endorsements`}>
            <ThumbsUp size={13} aria-hidden="true" />
            <span aria-hidden="true">{compactCount.format(mod.endorsements)}</span>
            <span className="sr-only">{mod.endorsements.toLocaleString()} endorsements</span>
          </span>
          <span className="ml-auto max-w-full truncate" title={mod.category}>{mod.category}</span>
          <button
            type="button"
            aria-label={`Open on Nexus (${mod.name})`}
            title="Open on Nexus Mods"
            onClick={() => window.atelierApi?.openExternal(mod.url)}
            className="grid size-6 place-items-center rounded text-muted hover:bg-white/10 hover:text-white"
          >
            <ExternalLink size={13} aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            disabled={installing}
            onClick={() => void quickInstall()}
            className="ui-button ui-button--primary h-8 min-h-8 w-full text-xs"
          >
            <Download size={13} aria-hidden="true" />
            {installing ? 'Installing…' : 'Download & Install'}
          </button>
        </div>
        {status && <p role="status" className="text-[11px] leading-snug text-muted">{status}</p>}
      </div>
    </article>
  );
}
