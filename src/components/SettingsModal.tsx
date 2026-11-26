import { useState } from 'react';
import { Folder, RotateCw, Save } from 'lucide-react';
import { errorMessage } from '../errors';
import type { AppConfig, ConfigPatch, GameId } from '../types';

interface SettingsModalProps {
  config: AppConfig;
  onSaveConfig: (patch: ConfigPatch) => Promise<void>;
  onDetectGames: () => Promise<AppConfig | undefined>;
}

const pathFields = [
  { field: 'gamePath', label: 'Game folder' },
  { field: 'modsPath', label: 'Mods folder' },
] as const;
type PathField = typeof pathFields[number]['field'];
type DraftPaths = Partial<Record<GameId, Partial<Record<PathField, string>>>>;

export function SettingsModal({ config, onSaveConfig, onDetectGames }: SettingsModalProps) {
  const [draftPaths, setDraftPaths] = useState<DraftPaths>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  function setPath(id: GameId, field: PathField, value: string) {
    setDraftPaths((paths) => ({ ...paths, [id]: { ...paths[id], [field]: value } }));
    setStatus('');
  }

  async function pickFolder(id: GameId, field: PathField) {
    setBusy(true);
    try {
      const path = await window.atelierApi?.selectDirectory();
      if (path) setPath(id, field, path);
    } catch {
      setStatus('Could not open the folder picker.');
    } finally {
      setBusy(false);
    }
  }

  async function detectGames() {
    setBusy(true);
    setStatus('Checking Steam libraries…');
    try {
      const detected = await onDetectGames();
      if (detected) setDraftPaths({});
      setStatus(detected ? 'Game folders refreshed.' : 'Open Atelier to detect games.');
    } catch (cause) {
      setStatus(errorMessage(cause, 'Could not detect game folders.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    setStatus('');
    try {
      await onSaveConfig({ games: draftPaths });
      setDraftPaths({});
      setStatus('Settings saved.');
    } catch (cause) {
      setStatus(errorMessage(cause, 'Could not save settings.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="settings-heading" className="workspace-content max-w-4xl">
      <header className="page-header">
        <h2 id="settings-heading" className="page-title">Settings</h2>
        <button type="button" className="ui-button" onClick={detectGames} disabled={busy}>
          <RotateCw size={16} aria-hidden="true" /> Detect games
        </button>
      </header>
      <div className="space-y-4">
        {Object.values(config.games).map((game) => {
          const { id } = game;
          return (
            <section key={id} aria-labelledby={`${id}-settings`} className="space-y-4 rounded-xl border border-line bg-panel p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id={`${id}-settings`} className="font-semibold text-white">{game.name}</h3>
                <p className={`text-sm ${game.baseModInstalled ? 'text-emerald-300' : 'text-accent'}`}>
                  {game.id === 'ruina' ? 'Built-in mod support' : game.baseModInstalled ? 'BaseMod detected' : 'BaseMod missing'}
                </p>
              </div>
              {pathFields.map(({ field, label }) => (
                <div key={field} className="space-y-1">
                  <label htmlFor={`${id}-${field}`} className="text-xs font-medium text-muted">{label}</label>
                  <div className="flex gap-2">
                    <input
                      id={`${id}-${field}`}
                      value={draftPaths[id]?.[field] ?? game[field] ?? ''}
                      onChange={(event) => setPath(id, field, event.target.value)}
                      disabled={busy}
                      className="ui-field flex-1 select-text"
                    />
                    <button
                      type="button"
                      className="ui-button"
                      aria-label={`Browse for ${game.name} ${label.toLowerCase()}`}
                      disabled={busy}
                      onClick={() => pickFolder(id, field)}
                    >
                      <Folder size={15} aria-hidden="true" /> Browse
                    </button>
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <div className="mt-4 flex min-h-9 items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted">{status}</p>
        <button type="button" className="ui-button ui-button--primary" onClick={saveSettings} disabled={busy}>
          <Save size={16} aria-hidden="true" /> Save settings
        </button>
      </div>
    </section>
  );
}
