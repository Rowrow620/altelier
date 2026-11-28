import type { SaveBackupsState } from '../../types';

interface BackupsPanelProps {
  backupsState: SaveBackupsState | null;
  busy: boolean;
  formatBytes: (bytes: number) => string;
  onCreateBackup: () => void;
  onRestoreBackup: (backupId: string) => void;
  onDeleteBackup: (backupId: string) => void;
}

export function BackupsPanel({
  backupsState,
  busy,
  formatBytes,
  onCreateBackup,
  onRestoreBackup,
  onDeleteBackup,
}: BackupsPanelProps) {
  return (
    <div id="opt-panel-backups" role="tabpanel" aria-labelledby="opt-tab-backups" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-panel px-4 py-3.5">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="text-sm font-semibold text-white">Unity Save Folder</div>
          <div className="truncate font-mono text-xs text-muted" title={backupsState?.savePath || ''}>
            {backupsState?.savePath || 'Checking save path…'}
          </div>
        </div>
        <button
          type="button"
          disabled={busy || !backupsState?.saveExists}
          onClick={onCreateBackup}
          className="ui-button ui-button--primary text-xs"
        >
          Back up saves now
        </button>
      </div>

      {!backupsState ? (
        <div className="rounded-md border border-line bg-panel px-4 py-3 text-sm text-muted">Checking save folder…</div>
      ) : !backupsState.saveExists && backupsState.backups.length === 0 ? (
        <div className="rounded-md border border-line bg-panel px-4 py-3 text-xs text-muted">
          No Unity save folder found at this location yet.
        </div>
      ) : backupsState.backups.length === 0 ? (
        <div className="rounded-md border border-line bg-panel px-4 py-3 text-xs text-muted">
          No backups created yet. Back up saves before testing heavy mods.
        </div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-panel">
          {backupsState.backups.map((backup) => (
            <div key={backup.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 text-xs transition-colors hover:bg-white/[0.02]">
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-white">
                  {new Date(backup.createdAt).toLocaleString()}
                  {backup.label ? ` · ${backup.label}` : ''}
                </div>
                <div className="text-muted tabular-nums">
                  {backup.fileCount} files · {formatBytes(backup.totalBytes)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRestoreBackup(backup.id)}
                  className="ui-button h-8 min-h-8 text-xs"
                >
                  Restore
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDeleteBackup(backup.id)}
                  className="ui-button h-8 min-h-8 text-xs text-rose-200 hover:border-rose-500/40"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
