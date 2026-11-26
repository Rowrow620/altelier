import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Archive, CheckCircle2, ExternalLink, HardDrive, RotateCw, Trash2, Wrench } from 'lucide-react';
import { errorMessage } from '../errors';
import type { ConfigPatch, GameConfig, GameDiagnostics, SaveBackupsState } from '../types';

interface OptimizationViewProps {
  game: GameConfig;
  onSaveConfig: (patch: ConfigPatch) => Promise<void>;
  onLibraryChanged: () => void;
}

const UNITY_FLAGS = [
  { flag: '-popupwindow', label: 'Borderless window (-popupwindow)', description: 'Runs the game in a borderless window when windowed mode is selected.' },
  { flag: '-nolog', label: 'Disable Unity log (-nolog)', description: 'Skips writing Player.log during gameplay to reduce disk writes.' },
] as const;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function OptimizationView({ game, onSaveConfig, onLibraryChanged }: OptimizationViewProps) {
  const [data, setData] = useState<GameDiagnostics | null>(null);
  const [backupsState, setBackupsState] = useState<SaveBackupsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const api = window.atelierApi;
    if (!api) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [diag, saves] = await Promise.all([
        api.getDiagnostics(game.id),
        api.getSaveBackups(game.id),
      ]);
      setData(diag);
      setBackupsState(saves);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not scan game diagnostics.'));
    } finally {
      setLoading(false);
    }
  }, [game.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFlag(flag: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const current = game.launchArgs ?? [];
      const next = current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag];
      await onSaveConfig({ games: { [game.id]: { launchArgs: next } } });
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save launch options.'));
    } finally {
      setBusy(false);
    }
  }

  async function fixCompatibility(issueId: string) {
    const api = window.atelierApi;
    if (!api || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setData(await api.fixCompatibilityIssue(game.id, issueId));
      setNotice('Applied compatibility fix.');
      onLibraryChanged();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not apply compatibility fix.'));
    } finally {
      setBusy(false);
    }
  }

  async function cleanTemp() {
    const api = window.atelierApi;
    if (!api || busy) return;
    setBusy(true);
    setError('');
    try {
      setData(await api.cleanTempFolders(game.id));
    } catch (cause) {
      setError(errorMessage(cause, 'Could not clean temporary folders.'));
    } finally {
      setBusy(false);
    }
  }

  async function createBackup() {
    const api = window.atelierApi;
    if (!api || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setBackupsState(await api.createSaveBackup(game.id, 'Manual backup'));
      setNotice('Save backup created.');
    } catch (cause) {
      setError(errorMessage(cause, 'Could not back up save files.'));
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup(backupId: string) {
    const api = window.atelierApi;
    if (!api || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setBackupsState(await api.restoreSaveBackup(game.id, backupId));
      setNotice('Save backup restored.');
    } catch (cause) {
      setError(errorMessage(cause, 'Could not restore save backup.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="optimization-heading" className="workspace-scroll">
      <div className="workspace-content space-y-5 pt-5">
        <div className="page-header mb-0">
          <h2 id="optimization-heading" className="page-title">Optimization &amp; Compatibility</h2>
          <button type="button" onClick={() => void load()} disabled={loading || busy} className="ui-button">
            <RotateCw size={15} aria-hidden="true" /> Refresh
          </button>
        </div>

        {error && <p role="alert" className="rounded-md border border-rose-500/30 bg-panel px-4 py-3 text-sm text-rose-200">{error}</p>}
        {notice && <p role="status" className="rounded-md border border-line bg-panel px-4 py-2.5 text-sm text-stone-200">{notice}</p>}

        {/* BaseMod Version & Loader Health */}
        <section className="space-y-3 rounded-md border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">BaseMod Version &amp; Setup Health</h3>
            {data?.baseMod && data.baseMod.status !== 'ok' && (
              <button
                type="button"
                className="ui-button text-xs"
                onClick={() => window.atelierApi?.openExternal(data.baseMod.nexusUrl)}
              >
                <ExternalLink size={13} aria-hidden="true" /> Get latest BaseMod
              </button>
            )}
          </div>
          {loading || !data ? (
            <p className="text-sm text-muted">Scanning game setup…</p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-md border border-line bg-field p-3">
                  <div className="text-muted">Loader</div>
                  <div className="mt-1 font-semibold text-white">{data.baseMod.loaderName}</div>
                </div>
                <div className="rounded-md border border-line bg-field p-3">
                  <div className="text-muted">Detected version</div>
                  <div className={`mt-1 font-semibold ${data.baseMod.status === 'ok' ? 'text-emerald-300' : 'text-accent'}`}>
                    {data.baseMod.version || (data.baseMod.status === 'missing' ? 'Missing' : 'Ready')}
                    {data.baseMod.harmonyVersion ? ` · Harmony ${data.baseMod.harmonyVersion}` : ''}
                  </div>
                </div>
                <div className="rounded-md border border-line bg-field p-3">
                  <div className="text-muted">Mods folder</div>
                  <div className="mt-1 truncate font-mono text-white" title={data.modsPath || 'Not set'}>
                    {data.modsPath || 'Not set'}
                  </div>
                </div>
              </div>
              <p className={`flex items-center gap-2 text-sm ${data.baseMod.status === 'ok' ? 'text-emerald-300' : 'text-amber-200'}`}>
                {data.baseMod.status === 'ok'
                  ? <CheckCircle2 size={16} aria-hidden="true" />
                  : <AlertTriangle size={16} aria-hidden="true" className="shrink-0 text-accent" />}
                <span>{data.baseMod.details}</span>
              </p>
              {data.issues.length > 0 && (
                <ul className="space-y-1.5 border-t border-line pt-2.5 text-sm text-amber-200">
                  {data.issues.map((issue) => (
                    <li key={issue} className="flex items-start gap-2">
                      <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            {/* Mod Compatibility & Auto-Fixes */}
            <section className="space-y-3 rounded-md border border-line bg-panel p-5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Wrench size={15} aria-hidden="true" /> Mod Compatibility Checks
                </h3>
                {data && <span className="text-xs text-muted">{data.compatibility.length} items</span>}
              </div>
              {loading || !data ? (
                <p className="text-sm text-muted">Scanning mods for structure issues…</p>
              ) : data.compatibility.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-emerald-300">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>All installed local mods pass folder and compatibility scans.</span>
                </p>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {data.compatibility.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-field p-3 text-xs">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="font-semibold text-white">{item.modName}</div>
                        <div className="text-muted">{item.message}</div>
                      </div>
                      {item.fixable && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void fixCompatibility(item.id)}
                          className="ui-button ui-button--primary h-8 min-h-8 text-xs"
                        >
                          {item.fixLabel || 'Fix'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* File Conflicts */}
            <section className="space-y-3 rounded-md border border-line bg-panel p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Enabled Mod File Conflicts</h3>
                {data && <span className="text-xs text-muted">{data.conflicts.length} overlapping files</span>}
              </div>
              {loading || !data ? (
                <p className="text-sm text-muted">Checking enabled mods…</p>
              ) : data.conflicts.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-emerald-300">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>No overlapping files across enabled local mods.</span>
                </p>
              ) : (
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {data.conflicts.map((conflict) => (
                    <div key={conflict.path} className="rounded-md border border-line bg-field p-3 text-xs">
                      <div className="font-mono text-accent">{conflict.path}</div>
                      <div className="mt-1 text-muted">Shared by: {conflict.mods.join(', ')}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-5">
            {/* Save Data Backups */}
            <section className="space-y-3 rounded-md border border-line bg-panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Archive size={15} aria-hidden="true" /> Save Data Backups
                  </h3>
                  {backupsState && (
                    <p className="mt-0.5 truncate font-mono text-xs text-muted" title={backupsState.savePath}>
                      {backupsState.savePath}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy || !backupsState?.saveExists}
                  onClick={() => void createBackup()}
                  className="ui-button text-xs"
                >
                  Back up saves now
                </button>
              </div>
              {!backupsState ? (
                <p className="text-sm text-muted">Checking save folder…</p>
              ) : !backupsState.saveExists && backupsState.backups.length === 0 ? (
                <p className="text-xs text-muted">No Unity save folder found at this location yet.</p>
              ) : backupsState.backups.length === 0 ? (
                <p className="text-xs text-muted">No backups created yet. Back up saves before testing heavy mods.</p>
              ) : (
                <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                  {backupsState.backups.map((backup) => (
                    <div key={backup.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-field p-3 text-xs">
                      <div>
                        <div className="font-medium text-white">
                          {new Date(backup.createdAt).toLocaleString()}
                          {backup.label ? ` · ${backup.label}` : ''}
                        </div>
                        <div className="text-muted">
                          {backup.fileCount} files · {formatBytes(backup.totalBytes)}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void restoreBackup(backup.id)}
                        className="ui-button h-8 min-h-8 text-xs"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Storage & Cleanup */}
            <section className="space-y-3 rounded-md border border-line bg-panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <HardDrive size={15} aria-hidden="true" /> Storage &amp; Cleanup
                </h3>
                {data && data.storage.tempCount > 0 && (
                  <button type="button" onClick={() => void cleanTemp()} disabled={busy} className="ui-button text-xs">
                    <Trash2 size={14} aria-hidden="true" /> Clean temp folders ({data.storage.tempCount})
                  </button>
                )}
              </div>
              {data && (
                <div className="grid gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-md border border-line bg-field p-3">
                    <div className="text-muted">Enabled mods ({data.storage.enabledCount})</div>
                    <div className="mt-1 font-semibold text-white">{formatBytes(data.storage.enabledBytes)}</div>
                  </div>
                  <div className="rounded-md border border-line bg-field p-3">
                    <div className="text-muted">Disabled mods ({data.storage.disabledCount})</div>
                    <div className="mt-1 font-semibold text-white">{formatBytes(data.storage.disabledBytes)}</div>
                  </div>
                  <div className="rounded-md border border-line bg-field p-3">
                    <div className="text-muted">Temp staging ({data.storage.tempCount})</div>
                    <div className="mt-1 font-semibold text-white">{formatBytes(data.storage.tempBytes)}</div>
                  </div>
                </div>
              )}
            </section>

            {/* Launch Options */}
            <section className="space-y-3 rounded-md border border-line bg-panel p-5">
              <h3 className="text-sm font-semibold text-white">Unity Launch Options</h3>
              <div className="space-y-2.5">
                {UNITY_FLAGS.map(({ flag, label, description }) => {
                  const checked = (game.launchArgs ?? []).includes(flag);
                  return (
                    <label key={flag} className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-field p-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => void toggleFlag(flag)}
                        className="mt-0.5 size-4 accent-[var(--color-accent)]"
                      />
                      <div>
                        <div className="text-sm font-medium text-white">{label}</div>
                        <div className="text-xs text-muted">{description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
