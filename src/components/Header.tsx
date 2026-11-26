import { Minus, Shield, Square, X, Zap } from 'lucide-react';

interface HeaderProps {
  activeCount?: number;
  profiles: string[];
  activeProfile: string;
  onSelectProfile: (profile: string) => void;
  onSaveProfile: () => void;
  onLaunch: (modded: boolean) => void;
  launching: boolean;
}

const windowControl = 'grid size-9 place-items-center rounded-md text-muted hover:bg-white/10 hover:text-white';

export function Header({ activeCount, profiles, activeProfile, onSelectProfile, onSaveProfile, onLaunch, launching }: HeaderProps) {
  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-4 border-b border-line bg-chrome px-4 [-webkit-app-region:drag]">
      <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
        <label className="flex items-center gap-2 text-xs font-medium text-muted">
          Profile
          <select
            value={activeProfile}
            onChange={(event) => onSelectProfile(event.target.value)}
            className="ui-field h-8 max-w-42 bg-panel text-xs"
          >
            {profiles.map((profile) => <option key={profile}>{profile}</option>)}
          </select>
        </label>
        <button type="button" className="ui-button min-h-8 text-xs" onClick={onSaveProfile}>Save profile</button>
      </div>

      <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
        <button
          type="button"
          onClick={() => onLaunch(false)}
          disabled={launching}
          className="ui-button min-h-8 text-xs"
        >
          <Shield size={14} aria-hidden="true" /> Launch Vanilla
        </button>
        <button
          type="button"
          onClick={() => onLaunch(true)}
          disabled={launching}
          className="ui-button ui-button--primary min-h-8 text-xs"
        >
          <Zap size={14} aria-hidden="true" /> Launch Modded{activeCount !== undefined && ' (' + activeCount + ')'}
        </button>

        <div className="ml-1 flex items-center border-l border-line pl-2">
          <button type="button" aria-label="Minimize window" title="Minimize window" className={windowControl} onClick={() => window.atelierApi?.minimize()}>
            <Minus size={15} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Toggle maximize" title="Toggle maximize" className={windowControl} onClick={() => window.atelierApi?.maximize()}>
            <Square size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Close window"
            title="Close window"
            className={`${windowControl} hover:bg-red-700`}
            onClick={() => window.atelierApi?.close()}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
