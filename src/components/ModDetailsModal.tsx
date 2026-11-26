import React, { useEffect, useId, useRef, useState } from 'react';
import { X, Folder, ExternalLink, Image as ImageIcon } from 'lucide-react';
import type { GameId, Mod } from '../types';
import { ModTrackingForm } from './ModTrackingForm';

interface ModDetailsModalProps {
  mod: Mod | null;
  gameId: GameId;
  onClose: () => void;
  onOpenFolder: (modId: string) => void;
  onToggle: (modId: string, current: boolean) => void;
  onUpdate: (mod: Mod) => void;
  onDetailsSaved: () => void;
}

export const ModDetailsModal: React.FC<ModDetailsModalProps> = ({
  mod,
  gameId,
  onClose,
  onOpenFolder,
  onToggle,
  onUpdate,
  onDetailsSaved,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modId = mod?.id;
  const modKey = `${gameId}:${modId ?? ''}`;
  const [prevModKey, setPrevModKey] = useState(modKey);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [images, setImages] = useState<string[]>([]);

  if (modKey !== prevModKey) {
    setPrevModKey(modKey);
    setSelectedImageIndex(0);
    setImages([]);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !modId) return;
    if (!dialog.open) {
      dialog.showModal();
      closeButtonRef.current?.focus();
    }
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [modId]);

  useEffect(() => {
    if (!modId || !window.atelierApi) return;
    let active = true;
    void window.atelierApi.getModPreviews(gameId, modId).then((previews) => {
      if (active) setImages(previews);
    }, () => {});
    return () => { active = false; };
  }, [gameId, modId]);

  if (!mod) return null;

  const sourceUrl = mod.workshopUrl || mod.nexusUrl;
  const sourceLabel = mod.source === 'workshop' ? 'Steam Workshop' : 'Nexus Mods';
  const activeImageIndex = selectedImageIndex < images.length ? selectedImageIndex : 0;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl border border-line bg-panel p-0 text-stone-100 shadow-2xl backdrop:bg-black/75"
    >
      <div className="flex max-h-[90vh] flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line bg-chrome p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 id={titleId} className="font-cinzel text-xl font-bold tracking-wide text-white">
                {mod.name}
              </h2>
              {mod.version && (
                <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-xs text-amber-400">
                  v{mod.version}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-muted">
              <span>Author: <strong className="text-stone-200">{mod.author}</strong></span>
              <span aria-hidden="true">/</span>
              <span className="text-amber-300">{mod.category}</span>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close mod details"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-6 overflow-y-auto p-6 text-sm">
          {/* Action Row: Enable/Disable + Source Link + Open Folder */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-field p-3.5">
            <div className="flex items-center gap-2.5">
              <div
                aria-hidden="true"
                className={`h-3 w-3 rounded-full ${
                  mod.enabled ? 'bg-amber-400 shadow-md shadow-amber-400/50' : 'bg-stone-600'
                }`}
              />
              <span className="text-xs font-semibold text-stone-200">
                {mod.enabled === null
                  ? mod.source === 'workshop' ? 'Managed in Steam' : 'Managed outside Atelier'
                  : mod.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {sourceUrl && (
                <button
                  type="button"
                  onClick={() => window.atelierApi?.openExternal(sourceUrl)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#da8e35]/40 bg-[#da8e35]/20 px-3 py-1.5 text-xs font-semibold text-[#f5af58] transition-colors hover:bg-[#da8e35]/30"
                  title={sourceLabel}
                >
                  <span>{sourceLabel}</span>
                  <ExternalLink size={13} aria-hidden="true" />
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenFolder(mod.source === 'workshop' ? mod.id : mod.folderName)}
                className="ui-button inline-flex items-center gap-1.5 text-xs"
              >
                <Folder size={13} aria-hidden="true" />
                <span>Folder</span>
              </button>

              {mod.source === 'local' && (
                <button type="button" className="ui-button text-xs" onClick={() => onUpdate(mod)}>
                  Update from ZIP
                </button>
              )}

              {mod.enabled !== null && (
                <button
                  type="button"
                  onClick={() => onToggle(mod.id, mod.enabled)}
                  className={mod.enabled ? 'ui-button text-xs' : 'ui-button ui-button--primary text-xs'}
                >
                  {mod.enabled ? 'Disable' : 'Enable'}
                </button>
              )}
            </div>
          </div>

          {mod.source === 'local' && <ModTrackingForm gameId={gameId} mod={mod} onSaved={onDetailsSaved} />}

          {/* Image Gallery */}
          {images.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-muted">
                <ImageIcon size={13} className="text-amber-400" aria-hidden="true" />
                <span>Screenshots &amp; Previews</span>
              </div>

              <div className="flex max-h-80 items-center justify-center overflow-hidden rounded-lg border border-line bg-black/60">
                <img
                  src={images[activeImageIndex]}
                  alt={`${mod.name} preview ${activeImageIndex + 1} of ${images.length}`}
                  className="mx-auto max-h-80 w-auto object-contain"
                />
              </div>

              {images.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {images.map((img, idx) => (
                    <button
                      key={`${idx}:${img}`}
                      type="button"
                      aria-label={`Select preview ${idx + 1} of ${images.length}`}
                      aria-pressed={activeImageIndex === idx}
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                        activeImageIndex === idx
                          ? 'border-amber-400'
                          : 'border-line opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Full Description */}
          <div className="space-y-2">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">
              Description
            </div>
            <div className="whitespace-pre-wrap rounded-lg border border-line bg-field p-4 font-sans text-xs leading-relaxed text-stone-300 selection:bg-amber-500/30 sm:text-sm">
              {mod.fullDescription || mod.description || 'No description provided.'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 border-t border-line bg-chrome p-4">
          <span className="max-w-md truncate font-mono text-[11px] text-muted" title={mod.path}>
            {mod.path}
          </span>
          <button type="button" onClick={onClose} className="ui-button text-xs">
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
};
