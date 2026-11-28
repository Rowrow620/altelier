import type { GameLogState } from '../../types';

interface LogsPanelProps {
  logsState: GameLogState | null;
  selectedLogId: string;
  errorsOnly: boolean;
  onSelectLog: (id: string) => void;
  onToggleErrorsOnly: (next: boolean) => void;
}

export function LogsPanel({
  logsState,
  selectedLogId,
  errorsOnly,
  onSelectLog,
  onToggleErrorsOnly,
}: LogsPanelProps) {
  const sources = logsState?.sources?.length
    ? logsState.sources
    : (logsState
      ? [{
          id: 'player',
          label: 'Player.log',
          logPath: logsState.logPath,
          exists: logsState.exists,
          lines: logsState.lines,
          errorCount: logsState.errorCount,
        }]
      : []);
  const currentLog = sources.find((s) => s.id === selectedLogId) ?? sources[0] ?? null;
  const visibleLines = !currentLog
    ? []
    : errorsOnly
      ? currentLog.lines.filter((line) => /\b(error|fail)\b|exception/i.test(line))
      : currentLog.lines;

  return (
    <div id="opt-panel-logs" role="tabpanel" aria-labelledby="opt-tab-logs" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-panel px-4 py-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="text-sm font-semibold text-white">{currentLog?.label ?? 'Unity Player.log'}</div>
          <div className="truncate font-mono text-xs text-muted" title={currentLog?.logPath || ''}>
            {currentLog?.logPath || 'Checking log path…'}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {sources.length > 1 && (
            <div className="flex items-center gap-1">
              {sources.map((src) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => onSelectLog(src.id)}
                  className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
                    currentLog?.id === src.id
                      ? 'border-accent bg-accent/20 text-white'
                      : 'border-line bg-field text-muted hover:text-white'
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-200">
            <input
              type="checkbox"
              checked={errorsOnly}
              onChange={(e) => onToggleErrorsOnly(e.target.checked)}
              className="size-3.5 accent-[var(--color-accent)]"
            />
            <span>Errors only ({currentLog?.errorCount ?? 0})</span>
          </label>
        </div>
      </div>

      {!currentLog ? (
        <div className="rounded-md border border-line bg-panel px-4 py-3 text-sm text-muted">Loading log tail…</div>
      ) : !currentLog.exists ? (
        <div className="rounded-md border border-line bg-panel px-4 py-3 text-xs text-muted">
          No {currentLog.label} found yet. Launch the game once to generate logs.
        </div>
      ) : visibleLines.length === 0 ? (
        <div className="rounded-md border border-line bg-panel px-4 py-3 text-xs text-emerald-300">
          No error or exception lines found in the recent log tail.
        </div>
      ) : (
        <pre className="max-h-96 overflow-auto rounded-md border border-line bg-chrome p-4 font-mono text-[11px] leading-relaxed text-stone-300 select-text">
          {visibleLines.join('\n')}
        </pre>
      )}
    </div>
  );
}
