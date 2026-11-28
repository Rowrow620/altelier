import { CheckCircle2 } from 'lucide-react';
import type { GameDiagnostics } from '../../types';

interface DiagnosticsPanelProps {
  data: GameDiagnostics | null;
  loading: boolean;
  busy: boolean;
  onFixCompatibility: (issueId: string) => void;
}

export function DiagnosticsPanel({ data, loading, busy, onFixCompatibility }: DiagnosticsPanelProps) {
  return (
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
                    onClick={() => onFixCompatibility(item.id)}
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
  );
}
