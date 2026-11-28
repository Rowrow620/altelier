import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { errorMessage } from '../errors';
import type { ConfigPatch, GameConfig } from '../types';

interface TweaksViewProps {
  game: GameConfig;
  onSaveConfig: (patch: ConfigPatch) => Promise<void>;
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({ label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.02]">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
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
}

const RUINA_TOGGLES = [
  {
    key: 'NoGrindBooks',
    label: 'No Grind: 999 Fight Books',
    description: 'Drops 999 copies of each enemy book from combat encounters and stage bonuses.',
  },
  {
    key: 'NoGrindBurnCards',
    label: '999 Combat Pages on Burn',
    description: 'Grants 999 copies of each Combat Page when burning books.',
  },
  {
    key: 'MultiplePurpleBooks',
    label: 'Multiple Purple Key Pages',
    description: 'Allows owning up to 99 copies of Purple (Rare) Key Pages.',
  },
  {
    key: 'MultipleGoldBooks',
    label: 'Multiple Gold / Orange Key Pages',
    description: 'Allows owning up to 99 copies of Gold / Orange (Unique) Key Pages and resets Unique drop boxes.',
  },
  {
    key: 'MultipleCommonBooks',
    label: 'Multiple Common / Blue Key Pages',
    description: 'Allows owning up to 99 copies of Common / Blue Key Pages.',
  },
] as const;

const LOBOTOMY_TOGGLES = [
  {
    key: 'UnlimitedLob',
    label: 'Unlimited LOB Points',
    description: 'Hire and customize agents without spending LOB points.',
  },
  {
    key: 'UnlimitedEgo',
    label: 'Unlimited E.G.O Crafting',
    description: 'Lifts the per-E.G.O crafting limit up to 999.',
  },
  {
    key: 'UnlockAllEgos',
    label: 'Unlock All E.G.O',
    description: 'Unlocks all E.G.O gear recipes and removes stat and observation requirements.',
  },
  {
    key: 'KeepAgentsForever',
    label: 'Keep Agents Forever',
    description: 'Revives fallen agents after each day and preserves E.G.O gear across resets.',
  },
] as const;

const SPEED_OPTIONS = [
  { value: 0, label: 'Off (Vanilla)' },
  { value: 4, label: '4x / 8x' },
  { value: 8, label: '8x / 16x' },
] as const;

export function TweaksView({ game, onSaveConfig }: TweaksViewProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [keyPageWarning, setKeyPageWarning] = useState(false);
  const tweaks = (game.tweaks ?? {}) as Record<string, boolean | number>;

  async function updateTweak(key: string, value: boolean | number) {
    if (busy) return;
    setBusy(true);
    setError('');
    if (
      game.id === 'ruina' &&
      value === false &&
      (key === 'MultiplePurpleBooks' || key === 'MultipleGoldBooks' || key === 'MultipleCommonBooks')
    ) {
      setKeyPageWarning(true);
    }
    try {
      await onSaveConfig({ games: { [game.id]: { tweaks: { [key]: value } } } });
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save tweak setting.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="cheats-heading" className="workspace-scroll">
      <div className="workspace-content flex flex-col gap-5 pt-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="cheats-heading" className="page-title">Cheats/Tweaks</h2>
        </header>

        {error && (
          <p role="alert" className="rounded-md border border-rose-500/30 bg-panel px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {keyPageWarning && game.id === 'ruina' && (
          <div role="status" className="flex items-start justify-between gap-3 rounded-md border border-amber-500/30 bg-panel px-4 py-3 text-xs text-amber-200">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <span>Disabling Key Page limit unlocks may cause the game to clamp excess copies when loading a save.</span>
            </div>
            <button type="button" onClick={() => setKeyPageWarning(false)} className="shrink-0 text-muted hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-panel">
          {game.id === 'ruina' ? (
            RUINA_TOGGLES.map((item) => (
              <ToggleRow
                key={item.key}
                label={item.label}
                description={item.description}
                checked={Boolean(tweaks[item.key])}
                disabled={busy}
                onChange={(next) => void updateTweak(item.key, next)}
              />
            ))
          ) : (
            <>
              {LOBOTOMY_TOGGLES.map((item) => (
                <ToggleRow
                  key={item.key}
                  label={item.label}
                  description={item.description}
                  checked={Boolean(tweaks[item.key])}
                  disabled={busy}
                  onChange={(next) => void updateTweak(item.key, next)}
                />
              ))}
              <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-white">Speed Multipliers</div>
                  <div className="text-xs text-muted">Overrides fast-forward speed tiers during the management phase.</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {SPEED_OPTIONS.map((opt) => {
                    const selected = Number(tweaks.SpeedMultiplier ?? 0) === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={busy}
                        onClick={() => void updateTweak('SpeedMultiplier', opt.value)}
                        className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? 'border-accent bg-accent/20 text-white'
                            : 'border-line bg-field text-muted hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
