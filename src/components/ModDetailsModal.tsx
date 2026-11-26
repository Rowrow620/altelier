import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import type { Mod } from '../types';

interface ModDetailsModalProps {
  mod: Mod | null;
  onClose: () => void;
}

export const ModDetailsModal: React.FC<ModDetailsModalProps> = ({ mod, onClose }) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modId = mod?.id;

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

  if (!mod) return null;

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
      className="m-auto w-full max-w-xl max-h-[85vh] overflow-hidden rounded-lg border border-line bg-panel p-0 text-stone-100 shadow-2xl backdrop:bg-black/75"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line bg-chrome p-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id={titleId} className="font-cinzel text-xl font-bold tracking-wide text-white">
                {mod.name}
              </h2>
              {mod.version && (
                <span className="rounded border border-line bg-field px-2 py-0.5 font-mono text-xs text-accent">
                  {/^v/i.test(mod.version) ? mod.version : `v${mod.version}`}
                </span>
              )}
            </div>
            <div className="font-mono text-xs text-muted">
              Author: <strong className="text-stone-200">{mod.author}</strong>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close mod details"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 text-sm">
          <div className="space-y-2">
            <div className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">
              Summary
            </div>
            <div className="whitespace-pre-wrap rounded-md border border-line bg-field p-4 font-sans text-xs leading-relaxed text-stone-300 sm:text-sm">
              {mod.fullDescription || mod.description || 'No summary provided.'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-line bg-chrome p-4">
          <button type="button" onClick={onClose} className="ui-button text-xs">
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
};
