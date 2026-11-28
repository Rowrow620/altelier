interface EnabledButtonProps {
  name: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function EnabledButton({ name, enabled, onToggle, disabled }: EnabledButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label={enabled ? `Disable ${name}` : `Enable ${name}`}
      title={enabled ? 'Enabled (click to disable)' : 'Disabled (click to enable)'}
      disabled={disabled}
      onClick={onToggle}
      className={`grid h-7 w-20 shrink-0 place-items-center rounded border px-2 text-xs font-semibold transition-colors disabled:opacity-45 ${
        enabled
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
          : 'border-rose-500/35 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
      }`}
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </button>
  );
}
