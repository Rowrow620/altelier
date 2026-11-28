import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ExternalLink,
  FileText,
  ListOrdered,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from 'lucide-react';
import { errorMessage } from '../errors';
import type { ConfigPatch, GameConfig, GameDiagnostics, GameLogState, LoadOrderState, SaveBackupsState } from '../types';
import { BackupsPanel } from './optimization/BackupsPanel';
import { DiagnosticsPanel } from './optimization/DiagnosticsPanel';
import { LaunchOptionsPanel } from './optimization/LaunchOptionsPanel';
import { LoadOrderPanel } from './optimization/LoadOrderPanel';
import { LogsPanel } from './optimization/LogsPanel';

interface OptimizationViewProps {
  game: GameConfig;
  onSaveConfig: (patch: ConfigPatch) => Promise<void>;
  onLibraryChanged: () => void;
}

type OptimizationTab = 'diagnostics' | 'load-order' | 'backups' | 'logs' | 'launch';

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
  const [loadOrderState, setLoadOrderState] = useState<LoadOrderState | null>(null);
  const [logsState, setLogsState] = useState<GameLogState | null>(null);
  const [selectedLogId, setSelectedLogId] = useState('player');
  const [errorsOnly, setErrorsOnly] = useState(false);
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
      const [diag, saves, order, logs] = await Promise.all([
        api.getDiagnostics(game.id),
        api.getSaveBackups(game.id),
        api.getLoadOrder(game.id),
        api.getGameLogs(game.id),
      ]);
      setData(diag);
      setBackupsState(saves);
      setLoadOrderState(order);
      setLogsState(logs);
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

  async function moveLoadOrder(index: number, delta: -1 | 1) {
    const api = window.atelierApi;
    if (!api || busy || !loadOrderState) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= loadOrderState.orders.length) return;
    const reordered = [...loadOrderState.orders];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, moved);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setLoadOrderState(await api.saveLoadOrder(game.id, reordered));
      setNotice('Load order updated.');
    } catch (cause) {
      setError(errorMessage(cause, 'Could not update load order.'));
    } finally {
      setBusy(false);
    }
  }

  const diagnosticCount = data ? data.compatibility.length + data.conflicts.length : 0;
  const backupCount = backupsState?.backups.length ?? 0;
  const activeFlagCount = (game.launchArgs ?? []).length;

  const tabs: { id: OptimizationTab; label: string; Icon: typeof Wrench; badge?: number }[] = [
    { id: 'diagnostics', label: 'Diagnostics', Icon: Wrench, badge: diagnosticCount },
    { id: 'load-order', label: 'Load Order', Icon: ListOrdered, badge: loadOrderState?.orders.length || undefined },
    { id: 'backups', label: 'Save Backups', Icon: Archive, badge: backupCount },
    { id: 'logs', label: 'Logs', Icon: FileText, badge: logsState?.errorCount || undefined },
    { id: 'launch', label: 'Launch Options', Icon: SlidersHorizontal, badge: activeFlagCount || undefined },
  ];

  return (
    <section aria-labelledby="optimization-heading" className="workspace-scroll">
      <div className="workspace-content flex flex-col gap-5 pt-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="optimization-heading" className="page-title">Optimization &amp; Compatibility</h2>
          <div className="flex flex-wrap items-center gap-2">
            {data?.baseMod && game.id !== 'ruina' && data.baseMod.status !== 'ok' && data.baseMod.nexusUrl && (
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
                    {game.id === 'ruina'
                      ? 'Not needed'
                      : (data.baseMod.version || (data.baseMod.status === 'missing' ? 'Missing' : 'Ready'))}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {game.id === 'ruina'
                      ? 'Uses built-in -mod support'
                      : (data.baseMod.harmonyVersion ? `Harmony ${data.baseMod.harmonyVersion}` : 'No Harmony DLL detected')}
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
              {game.id === 'lobotomy' && data.baseMod.status !== 'ok' && data.baseMod.nexusUrl && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-chrome/60 px-4 py-2.5 text-xs text-stone-300">
                  <span>
                    To install or update BaseMod, download the release archive and extract <code className="font-mono text-white">LobotomyBaseModLib.dll</code>, <code className="font-mono text-white">0Harmony.dll</code>, and <code className="font-mono text-white">Assembly-CSharp.dll</code> into <code className="font-mono text-white">LobotomyCorp_Data/Managed/</code>.
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        const api = window.atelierApi;
                        if (!api || busy) return;
                        setBusy(true);
                        setError('');
                        setNotice('');
                        try {
                          const picked = await api.selectModArchive();
                          if (picked) {
                            setData(await api.installBaseMod(picked));
                            setNotice('BaseMod installed cleanly with a Managed backup.');
                            onLibraryChanged();
                          }
                        } catch (cause) {
                          setError(errorMessage(cause, 'Could not install BaseMod archive.'));
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="ui-button ui-button--primary h-7 min-h-7 text-xs"
                    >
                      Install BaseMod ZIP
                    </button>
                    <button
                      type="button"
                      onClick={() => window.atelierApi?.openExternal(data.baseMod.nexusUrl)}
                      className="ui-button h-7 min-h-7 text-xs"
                    >
                      <ExternalLink size={12} aria-hidden="true" /> Open Nexus BaseMod
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

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

        {subTab === 'diagnostics' && (
          <DiagnosticsPanel
            data={data}
            loading={loading}
            busy={busy}
            onFixCompatibility={(id) => void fixCompatibility(id)}
          />
        )}
        {subTab === 'load-order' && (
          <LoadOrderPanel
            gameId={game.id}
            loadOrderState={loadOrderState}
            busy={busy}
            onMove={(index, delta) => void moveLoadOrder(index, delta)}
          />
        )}
        {subTab === 'backups' && (
          <BackupsPanel
            backupsState={backupsState}
            busy={busy}
            formatBytes={formatBytes}
            onCreateBackup={() => void createBackup()}
            onRestoreBackup={(id) => void restoreBackup(id)}
          />
        )}
        {subTab === 'logs' && (
          <LogsPanel
            logsState={logsState}
            selectedLogId={selectedLogId}
            errorsOnly={errorsOnly}
            onSelectLog={setSelectedLogId}
            onToggleErrorsOnly={setErrorsOnly}
          />
        )}
        {subTab === 'launch' && (
          <LaunchOptionsPanel
            launchArgs={game.launchArgs ?? []}
            busy={busy}
            onToggleFlag={(flag) => void toggleFlag(flag)}
          />
        )}
      </div>
    </section>
  );
}
