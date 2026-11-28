const UNITY_FLAGS = [
  { flag: '-popupwindow', label: 'Borderless window (-popupwindow)', description: 'Runs the game in a borderless window when windowed mode is selected.' },
  { flag: '-nolog', label: 'Disable Unity log (-nolog)', description: 'Skips writing Player.log during gameplay to reduce disk writes.' },
] as const;

interface LaunchOptionsPanelProps {
  launchArgs: string[];
  busy: boolean;
  onToggleFlag: (flag: string) => void;
}

export function LaunchOptionsPanel({ launchArgs, busy, onToggleFlag }: LaunchOptionsPanelProps) {
  return (
    <div id="opt-panel-launch" role="tabpanel" aria-labelledby="opt-tab-launch" className="divide-y divide-line overflow-hidden rounded-md border border-line bg-panel">
      {UNITY_FLAGS.map(({ flag, label, description }) => {
        const checked = launchArgs.includes(flag);
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
                onChange={() => onToggleFlag(flag)}
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
  );
}
