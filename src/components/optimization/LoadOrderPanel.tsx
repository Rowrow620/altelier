import { ArrowDown, ArrowUp } from 'lucide-react';
import type { GameId, LoadOrderState } from '../../types';

interface LoadOrderPanelProps {
  gameId: GameId;
  loadOrderState: LoadOrderState | null;
  busy: boolean;
  onMove: (index: number, delta: -1 | 1) => void;
}

export function LoadOrderPanel({ gameId, loadOrderState, busy, onMove }: LoadOrderPanelProps) {
  return (
    <div id="opt-panel-load-order" role="tabpanel" aria-labelledby="opt-tab-load-order" className="space-y-4">
      <div className="rounded-md border border-line bg-panel px-4 py-3 text-xs text-muted">
        Mods load from top to bottom. Later entries override earlier patches when modifying the same methods.
      </div>
      {!loadOrderState ? (
        <div className="rounded-md border border-line bg-panel px-4 py-3 text-sm text-muted">Reading load order…</div>
      ) : !loadOrderState.available || loadOrderState.orders.length === 0 ? (
        <div className="rounded-md border border-line bg-panel px-4 py-3 text-xs text-muted">
          {gameId === 'ruina'
            ? 'No load order saved yet. Launch Library of Ruina with -mod once to initialize ModSetting.save.'
            : 'No BaseModList_v2.xml load order entries found yet.'}
        </div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-panel">
          {loadOrderState.orders.map((modId, index) => (
            <div key={modId} className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs transition-colors hover:bg-white/[0.02]">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 shrink-0 font-mono text-muted tabular-nums">{index + 1}.</span>
                <span className="truncate font-mono text-stone-200">{modId}</span>
                {loadOrderState.activeIds.includes(modId) && (
                  <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                    Active
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`Move ${modId} up`}
                  disabled={busy || index === 0}
                  onClick={() => onMove(index, -1)}
                  className="ui-button h-7 min-h-7 px-2 text-xs disabled:opacity-35"
                >
                  <ArrowUp size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${modId} down`}
                  disabled={busy || index === loadOrderState.orders.length - 1}
                  onClick={() => onMove(index, 1)}
                  className="ui-button h-7 min-h-7 px-2 text-xs disabled:opacity-35"
                >
                  <ArrowDown size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
