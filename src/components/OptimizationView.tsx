import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ExternalLink,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from 'lucide-react';
import { errorMessage } from '../errors';
import type { ConfigPatch, GameConfig, GameDiagnostics, SaveBackupsState } from '../types';

interface OptimizationViewProps {
  game: GameConfig;
  onSaveConfig: (patch: ConfigPatch) => Promise<void>;
  onLibraryChanged: () => void;
}

type OptimizationTab = 'diagnostics' | 'backups' | 'launch';

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
  const [subTab, setSubTab] = useState<OptimizationTab>('diagnostics');
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
    setNotice('');
    try {
      setData(await api.cleanTempFolders(game.id));
      setNotice('Removed stale temporary folders.');
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

  const diagnosticCount = data ? data.compatibility.length + data.conflicts.length : 0;
  const backupCount = backupsState?.backups.length ?? 0;
  const activeFlagCount = (game.launchArgs ?? []).length;

  const tabs: { id: OptimizationTab; label: string; Icon: typeof Wrench; badge?: number }[] = [
    { id: 'diagnostics', label: 'Diagnostics', Icon: Wrench, badge: diagnosticCount },
    { id: 'backups', label: 'Save Backups', Icon: Archive, badge: backupCount },
    { id: 'launch', label: 'Launch Options', Icon: SlidersHorizontal, badge: activeFlagCount || undefined },
  ];

  return (
    <section aria-labelledby="optimization-heading" className="workspace-scroll">
      <div className="workspace-content flex flex-col gap-5 pt-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="optimization-heading" className="page-title">Optimization &amp; Compatibility</h2>
          <div className="flex flex-wrap items-center gap-2">
            {data?.baseMod && data.baseMod.status !== 'ok' && (
              <button
                type="button"
                className="ui-button text-xs"
                onClick={() => window.atelierApi?.openExternal(data.baseMod.nexusUrl)}
              >
                <ExternalLink size={14} aria-hidden="true" /> Get latest BaseMod
              </button>
            )}
            <button type="button" onClick={() => void load()} disabled={loading || busy} className="ui-button">
              <RotateCw size={15} aria-hidden="true" className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </header>

        {error && <p role="alert" className="rounded-md border border-rose-500/30 bg-panel px-4 py-3 text-sm text-rose-200">{error}</p>}
        {notice && <p role="status" className="rounded-md border border-line bg-panel px-4 py-2.5 text-sm text-stone-200">{notice}</p>}

        {/* Unified Overview Strip */}
        <section aria-label="Setup overview" className="overflow-hidden rounded-md border border-line bg-panel">
          {loading || !data ? (
            <p className="px-4 py-3.5 text-sm text-muted">Scanning game setup…</p>
          ) : (
            <>
              <div className="grid divide-y divide-line md:grid-cols-2 md:divide-y-0 lg:grid-cols-4 lg:divide-x">
                <div className="px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Loader</div>
                  <div className="mt-1 text-sm font-semibold text-white">{data.baseMod.loaderName}</div>
                  <div className={`mt-0.5 flex items-center gap-1.5 text-xs ${data.baseMod.status === 'ok' ? 'text-emerald-300' : 'text-amber-200'}`}>
                    {data.baseMod.status === 'ok'
                      ? <CheckCircle2 size={13} aria-hidden="true" className="shrink-0" />
                      : <AlertTriangle size={13} aria-hidden="true" className="shrink-0 text-accent" />}
                    <span className="truncate" title={data.baseMod.details}>{data.baseMod.details}</span>
                  </div>
                </div>

                <div className="px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Loader Version</div>
                  <div className={`mt-1 text-sm font-semibold ${data.baseMod.status === 'ok' ? 'text-emerald-300' : 'text-accent'}`}>
                    {data.baseMod.version || (data.baseMod.status === 'missing' ? 'Missing' : 'Ready')}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {data.baseMod.harmonyVersion ? `Harmony ${data.baseMod.harmonyVersion}` : 'No Harmony DLL detected'}
                  </div>
                </div>

                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Mods Storage</span>
                    {data.storage.tempCount > 0 && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void cleanTemp()}
                        className="inline-flex items-center gap-1 rounded border border-line bg-field px-1.5 py-0.5 text-[11px] font-medium text-stone-200 transition-colors hover:border-[#3f3f46] hover:bg-white/[0.07]"
                      >
                        <Trash2 size={11} aria-hidden="true" /> Clean temp ({data.storage.tempCount})
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white tabular-nums">
                    {data.storage.enabledCount} enabled · {formatBytes(data.storage.enabledBytes)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted tabular-nums">
                    {data.storage.disabledCount} disabled ({formatBytes(data.storage.disabledBytes)})
                    {data.storage.tempCount === 0 ? ` · ${data.storage.tempCount} temp` : ` · ${formatBytes(data.storage.tempBytes)} temp`}
                  </div>
                </div>

                <div className="px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Mods Folder</div>
                  <div className="mt-1 truncate font-mono text-xs text-white" title={data.modsPath || 'Not set'}>
                    {data.modsPath || 'Not set'}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {diagnosticCount === 0 ? 'No compatibility issues' : `${diagnosticCount} diagnostic item${diagnosticCount === 1 ? '' : 's'}`}
                  </div>
                </div>
              </div>

              {data.issues.length > 0 && (
                <ul className="space-y-1 border-t border-line bg-chrome/60 px-4 py-2.5 text-xs text-amber-200">
                  {data.issues.map((issue) => (
                    <li key={issue} className="flex items-start gap-2">
                      <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        {/* Sub-Navigation Tabs */}
        <div role="tablist" aria-label="Optimization sections" className="flex flex-wrap items-center gap-1 border-b border-line">
          {tabs.map(({ id, label, Icon, badge }) => {
            const active = subTab === id;
            return (
              <button
                key={id}
                id={`opt-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`opt-panel-${id}`}
                onClick={() => setSubTab(id)}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-accent text-white'
                    : 'border-transparent text-muted hover:text-stone-200'
                }`}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
                {badge !== undefined && (
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
                      active ? 'bg-white/10 text-white' : 'bg-panel text-muted'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sub-Tab Content */}
        {subTab === 'diagnostics' && (
          <div id="opt-panel-diagnostics" role="tabpanel" aria-labelledby="opt-tab-diagnostics" className="space-y-6">
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Mod Compatibility Checks</h3>
                {data && (
                  <span className="text-xs text-muted">
                    {data.compatibility.length} {data.compatibility.length === 1 ? 'item' : 'items'}
                  </span>
                )}
              </div>
              {loading || !data ? (
                <div className="rounded-md border border-line bg-panel px-4 py-3 text-sm text-muted">Scanning mods for structure issues…</div>
              ) : data.compatibility.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-line bg-panel px-4 py-3 text-sm text-emerald-300">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>All installed local mods pass folder and compatibility scans.</span>
                </div>
              ) : (
                <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-panel">
                  {data.compatibility.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-white/[0.02]">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="text-sm font-medium text-white">{item.modName}</div>
                        <div className="text-xs text-muted">{item.message}</div>
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

            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Enabled Mod File Conflicts</h3>
                {data && (
                  <span className="text-xs text-muted">
                    {data.conflicts.length} overlapping {data.conflicts.length === 1 ? 'file' : 'files'}
                  </span>
                )}
              </div>
              {loading || !data ? (
                <div className="rounded-md border border-line bg-panel px-4 py-3 text-sm text-muted">Checking enabled mods…</div>
              ) : data.conflicts.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-line bg-panel px-4 py-3 text-sm text-emerald-300">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>No overlapping files across enabled local mods.</span>
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-line bg-panel">
                  <div className="hidden grid-cols-[minmax(220px,1fr)_minmax(240px,1.5fr)] gap-4 border-b border-line bg-chrome px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid">
                    <span>Overlapping File</span>
                    <span>Shared By Enabled Mods</span>
                  </div>
                  <div className="divide-y divide-line">
                    {data.conflicts.map((conflict) => (
                      <div
                        key={conflict.path}
                        className="flex flex-col gap-1 px-4 py-2.5 text-xs transition-colors hover:bg-white/[0.02] md:grid md:grid-cols-[minmax(220px,1fr)_minmax(240px,1.5fr)] md:items-center md:gap-4"
                      >
                        <div className="truncate font-mono text-stone-200" title={conflict.path}>{conflict.path}</div>
                        <div className="text-muted">{conflict.mods.join(', ')}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {subTab === 'backups' && (
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
                onClick={() => void createBackup()}
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
          </div>
        )}

        {subTab === 'launch' && (
          <div id="opt-panel-launch" role="tabpanel" aria-labelledby="opt-tab-launch" className="divide-y divide-line overflow-hidden rounded-md border border-line bg-panel">
            {UNITY_FLAGS.map(({ flag, label, description }) => {
              const checked = (game.launchArgs ?? []).includes(flag);
              return (
                <label
                  key={flag}
                  className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => void toggleFlag(flag)}
                      className="mt-0.5 size-4 accent-[var(--color-accent)]"
                    />
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium text-white">{label}</div>
                      <div className="text-xs text-muted">{description}</div>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] ${
                      checked
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-line bg-field text-muted'
                    }`}
                  >
                    {checked ? 'Enabled' : 'Off'}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
