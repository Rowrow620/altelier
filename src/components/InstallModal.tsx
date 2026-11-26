import { useEffect, useRef, useState, type DragEvent } from 'react';
import { UploadCloud, X } from 'lucide-react';
import type { ArchiveInstallOptions, ArchiveInstallResult, GameConfig, GameId, Mod } from '../types';

interface InstallModalProps {
  games: Record<GameId, GameConfig>;
  initialGameId: GameId;
  replacement?: Mod;
  onClose: () => void;
  onDone: (gameId: GameId) => void;
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]';

export function InstallModal({ games, initialGameId, replacement, onClose, onDone }: InstallModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const gameSelectRef = useRef<HTMLSelectElement>(null);
  const importing = useRef(false);
  const [gameId, setGameId] = useState(initialGameId);
  const [isDragging, setIsDragging] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState('');
  const [nexusUrl, setNexusUrl] = useState(replacement?.nexusModId ? replacement.nexusUrl : '');
  const [version, setVersion] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    gameSelectRef.current.focus();
    return () => dialog.close();
  }, []);

  function closeDialog() {
    if (importing.current) return;
    dialogRef.current.close();
    onClose();
  }

  async function importZip(install: (targetGameId: GameId, options: ArchiveInstallOptions) => Promise<ArchiveInstallResult | null>) {
    if (importing.current) return;
    importing.current = true;
    setInstalling(true);
    setStatus('');
    try {
      const result = await install(gameId, { replaceId: replacement?.id, nexusUrl: nexusUrl.trim(), version: version.trim() });
      if (result?.success) {
        const complete = replacement ? 'Mod updated.' : result.modId ? `Imported ${result.modId}.` : 'Mod imported.';
        setStatus([complete, ...(result.warnings ?? [])].join(' '));
        onDone(gameId);
      } else if (result?.cancelled) {
        setStatus('Import cancelled.');
      } else if (result) {
        setStatus(result.error || 'Could not import the ZIP.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import the ZIP.');
    } finally {
      importing.current = false;
      setInstalling(false);
    }
  }

  function chooseZip() {
    const api = window.atelierApi;
    if (!api) {
      setStatus('Open Atelier to import a ZIP.');
      return;
    }
    void importZip(async (targetGameId, options) => {
      const filePath = await api.selectModArchive();
      return filePath ? api.installModArchive(targetGameId, filePath, options) : null;
    });
  }

  function dropZip(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    const api = window.atelierApi;
    if (file && api) void importZip((targetGameId, options) => api.installDroppedModArchive(targetGameId, file, options));
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="import-zip-heading"
      onCancel={(event) => { event.preventDefault(); closeDialog(); }}
      className="fixed inset-0 m-auto w-[calc(100%-3rem)] max-w-lg space-y-5 rounded-2xl border border-white/15 bg-[#121520] p-6 text-white backdrop:bg-black/80"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="import-zip-heading" className="font-cinzel text-lg font-bold">
          {replacement ? 'Update ' + replacement.name : 'Import ZIP'}
        </h2>
        <button
          type="button"
          aria-label="Close import dialog"
          aria-disabled={installing}
          onClick={closeDialog}
          className={`rounded-lg p-2 text-stone-300 hover:bg-white/10 aria-disabled:opacity-50 ${focusRing}`}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <label className="grid gap-1.5 text-sm font-medium text-muted">
        Game
        <select
          ref={gameSelectRef}
          value={gameId}
          disabled={installing || !!replacement}
          onChange={(event) => {
            setGameId(event.target.value as GameId);
            setStatus('');
          }}
          className="ui-field w-full disabled:opacity-45"
        >
          {Object.values(games).map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
        </select>
      </label>

      <details className="space-y-3 text-sm text-muted">
        <summary className="cursor-pointer">Nexus link and version (optional)</summary>
        <label className="grid gap-1.5">
          Nexus mod link
          <input type="url" maxLength={2048} value={nexusUrl} onChange={(event) => setNexusUrl(event.target.value)}
            disabled={installing} className="ui-field select-text" />
        </label>
        <label className="grid gap-1.5">
          Version
          <input maxLength={100} value={version} onChange={(event) => setVersion(event.target.value)}
            disabled={installing} className="ui-field select-text" />
        </label>
      </details>

      <div
        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={dropZip}
        className={`flex flex-col items-center gap-3 rounded-md border-2 border-dashed p-6 ${isDragging ? 'border-accent bg-white/[0.05]' : 'border-line bg-field'}`}
      >
        <UploadCloud size={24} className="text-accent" aria-hidden="true" />
        <p className="text-sm text-stone-300">Choose a ZIP file or drop it here.</p>
        <button
          type="button"
          aria-disabled={installing}
          onClick={chooseZip}
          className={`ui-button ui-button--primary ${focusRing}`}
        >
          Choose ZIP
        </button>
      </div>

      <p role="status" aria-atomic="true" className="min-h-5 text-sm text-stone-300">
        {installing ? 'Importing mod…' : status}
      </p>
    </dialog>
  );
}
