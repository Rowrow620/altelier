import { Download, Minus, PanelLeftClose, PanelLeftOpen, Square, Trash2, Upload, X } from 'lucide-react';

interface HeaderProps {
  profiles: string[];
  activeProfile: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSelectProfile: (profile: string) => void;
  onSaveProfile: () => void;
  onDeleteProfile: () => void;
  onExportProfile: () => void;
  onImportProfile: () => void;
}

const windowControl = 'grid size-9 place-items-center rounded-md text-muted hover:bg-white/10 hover:text-white';

export function Header({
  profiles, activeProfile, sidebarOpen, onToggleSidebar, onSelectProfile,
  onSaveProfile, onDeleteProfile, onExportProfile, onImportProfile,
}: HeaderProps) {
  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-4 border-b border-line bg-chrome px-4 [-webkit-app-region:drag]">
      <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
        <button
          type="button"
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          onClick={onToggleSidebar}
          className="ui-button ui-button--icon h-8 min-h-8 w-8"
        >
          {sidebarOpen ? <PanelLeftClose size={15} aria-hidden="true" /> : <PanelLeftOpen size={15} aria-hidden="true" />}
        </button>
        <label className="flex items-center gap-2 text-xs font-medium text-muted">
          Profile
          <select
            value={activeProfile}
            onChange={(event) => onSelectProfile(event.target.value)}
            className="ui-field h-8 max-w-40 bg-panel text-xs"
          >
            {profiles.map((profile) => <option key={profile}>{profile}</option>)}
          </select>
        </label>
        <div className="inline-flex h-8 items-center divide-x divide-line overflow-hidden rounded-md border border-line bg-panel">
          <button
            type="button"
            className="h-full px-2.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.07]"
            onClick={onSaveProfile}
          >
            Save
          </button>
          <button
            type="button"
            aria-label="Export profile"
            title="Export profile"
            className="grid h-full w-8 place-items-center text-muted transition-colors hover:bg-white/[0.07] hover:text-white"
            onClick={onExportProfile}
          >
            <Download size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Import profile"
            title="Import profile"
            className="grid h-full w-8 place-items-center text-muted transition-colors hover:bg-white/[0.07] hover:text-white"
            onClick={onImportProfile}
          >
            <Upload size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Delete profile"
            title={activeProfile === 'Default' ? 'Default profile cannot be deleted' : `Delete ${activeProfile}`}
            disabled={activeProfile === 'Default'}
            className="grid h-full w-8 place-items-center text-muted transition-colors hover:bg-white/[0.07] hover:text-rose-300 disabled:opacity-40"
            onClick={onDeleteProfile}
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex items-center [-webkit-app-region:no-drag]">
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
    </header>
  );
}
