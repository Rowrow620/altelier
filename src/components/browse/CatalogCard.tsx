import { useState } from 'react';
import { Download, ExternalLink, Image, ThumbsUp } from 'lucide-react';
import type { CatalogMod } from '../../types';

const compactCount = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export function CatalogCard({ mod, eager }: { mod: CatalogMod; eager: boolean }) {
  const [failedPreview, setFailedPreview] = useState<string>();

  return (
    <article className="atelier-card flex min-w-0 flex-col overflow-hidden rounded-xl">
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
            <a
              href={mod.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open on Nexus (${mod.name})`}
              title={mod.name}
              className="group flex items-start justify-between gap-2 rounded-sm hover:text-accent"
            >
              <span className="line-clamp-2 break-words">{mod.name}</span>
              <ExternalLink size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-muted group-hover:text-accent" />
            </a>
          </h3>
          {mod.author && <p className="mt-1 truncate text-xs text-muted" title={mod.author}>{mod.author}</p>}
        </div>
        {mod.summary && <p className="line-clamp-2 text-xs leading-relaxed text-muted">{mod.summary}</p>}
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
        </div>
      </div>
    </article>
  );
}
