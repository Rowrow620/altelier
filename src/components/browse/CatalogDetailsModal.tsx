import { useEffect, useId, useRef, useState } from 'react';
import { Download, ExternalLink, Image, ThumbsUp, X } from 'lucide-react';
import { errorMessage } from '../../errors';
import type { CatalogMod, CatalogModFile, GameId } from '../../types';

interface CatalogDetailsModalProps {
  gameId: GameId;
  mod: CatalogMod;
  onClose: () => void;
  onInstalled: () => void;
}

function formatBytes(bytes: number) {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function CatalogDetailsModal({ gameId, mod, onClose, onInstalled }: CatalogDetailsModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const numericModId = mod.modId ?? Number(mod.id.split(':').pop());
  const [files, setFiles] = useState<CatalogModFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState('');
  const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);
  const [installStatus, setInstallStatus] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    }
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const api = window.atelierApi;
    if (!api) {
      setFilesLoading(false);
      return;
    }
    let active = true;
    setFilesLoading(true);
    setFilesError('');
    void api.getCatalogFiles(gameId, numericModId).then(
      (list) => {
        if (active) setFiles(list);
      },
      (cause) => {
        if (active) setFilesError(errorMessage(cause, 'Could not load files from Nexus Mods.'));
      },
    ).finally(() => {
      if (active) setFilesLoading(false);
    });
    return () => { active = false; };
  }, [gameId, numericModId]);

  async function installFile(file: CatalogModFile) {
    const api = window.atelierApi;
    if (!api || downloadingFileId !== null) return;
    setDownloadingFileId(file.fileId);
    setInstallStatus(`Downloading ${file.name}…`);
    try {
      const result = await api.downloadCatalogMod({
        gameId,
        modId: numericModId,
        fileId: file.fileId,
        fileName: file.name || mod.name,
        nexusUrl: mod.url,
        version: file.version || mod.version,
      });
      if (result.success) {
        setInstallStatus(`Installed ${result.modId ?? mod.name}.`);
        onInstalled();
      } else if (result.cancelled) {
        setInstallStatus('Replacement cancelled.');
      } else {
        setInstallStatus(result.error || 'Could not install this file.');
      }
    } catch (cause) {
      setInstallStatus(errorMessage(cause, 'Could not download this file.'));
    } finally {
      setDownloadingFileId(null);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (downloadingFileId === null) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && downloadingFileId === null) onClose();
      }}
      className="m-auto w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-lg border border-line bg-panel p-0 text-stone-100 shadow-2xl backdrop:bg-black/75"
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line bg-chrome p-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id={titleId} className="font-cinzel text-xl font-bold tracking-wide text-white">{mod.name}</h2>
              {mod.version && (
                <span className="rounded border border-line bg-field px-2 py-0.5 font-mono text-xs text-accent">
                  {/^v/i.test(mod.version) ? mod.version : `v${mod.version}`}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              {mod.author && <span>By <strong className="text-stone-200">{mod.author}</strong></span>}
              <span>{mod.category}</span>
              <span className="inline-flex items-center gap-1"><Download size={12} aria-hidden="true" /> {mod.downloads.toLocaleString()}</span>
              <span className="inline-flex items-center gap-1"><ThumbsUp size={12} aria-hidden="true" /> {mod.endorsements.toLocaleString()}</span>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close mod summary"
            disabled={downloadingFileId !== null}
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-6 text-sm">
          {mod.thumbnailUrl ? (
            <div className="flex max-h-72 items-center justify-center overflow-hidden rounded-md border border-line bg-field">
              <img src={mod.thumbnailUrl} alt={`${mod.name} preview`} className="mx-auto max-h-72 w-auto object-contain" />
            </div>
          ) : (
            <div className="grid h-32 place-items-center rounded-md border border-line bg-field text-muted">
              <Image size={28} aria-hidden="true" />
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">Summary</h3>
            <div className="whitespace-pre-wrap rounded-md border border-line bg-field p-4 text-xs leading-relaxed text-stone-200 sm:text-sm">
              {mod.description || mod.summary || 'No description provided.'}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">Files</h3>
              <button
                type="button"
                className="ui-button text-xs"
                onClick={() => window.atelierApi?.openExternal(`${mod.url}?tab=files`)}
              >
                <ExternalLink size={13} aria-hidden="true" /> Open on Nexus Mods
              </button>
            </div>

            {installStatus && (
              <p role="status" className="rounded-md border border-line bg-field px-3.5 py-2.5 text-xs text-stone-200">
                {installStatus}
              </p>
            )}

            {filesLoading ? (
              <p className="text-xs text-muted">Loading available files…</p>
            ) : filesError ? (
              <p className="text-xs text-rose-200">{filesError}</p>
            ) : files.length === 0 ? (
              <p className="text-xs text-muted">No downloadable files listed.</p>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <div key={file.fileId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-field p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white">{file.name}</span>
                        {file.version && <span className="font-mono text-xs text-accent">{/^v/i.test(file.version) ? file.version : `v${file.version}`}</span>}
                        <span className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">{file.category}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {formatBytes(file.sizeInBytes)}
                        {file.description && ` · ${file.description.slice(0, 120)}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={downloadingFileId !== null}
                      onClick={() => void installFile(file)}
                      className="ui-button ui-button--primary text-xs"
                    >
                      <Download size={13} aria-hidden="true" />
                      {downloadingFileId === file.fileId ? 'Downloading…' : 'Download & Install'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-line bg-chrome p-4">
          <button type="button" disabled={downloadingFileId !== null} onClick={onClose} className="ui-button text-xs">
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
