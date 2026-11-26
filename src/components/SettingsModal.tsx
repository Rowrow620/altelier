import { useState } from 'react';
import { Eye, EyeOff, Folder, RotateCw, Save } from 'lucide-react';
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
  const [draftApiKey, setDraftApiKey] = useState<string | undefined>(undefined);
  const [showApiKey, setShowApiKey] = useState(false);
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
      await onSaveConfig({
        ...(draftApiKey !== undefined ? { nexusApiKey: draftApiKey } : {}),
        games: draftPaths,
      });
      setDraftPaths({});
      setDraftApiKey(undefined);
      setStatus('Settings saved.');
    } catch (cause) {
      setStatus(errorMessage(cause, 'Could not save settings.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="settings-heading" className="workspace-scroll">
      <div className="workspace-content flex flex-col gap-5 pt-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="settings-heading" className="page-title">Settings</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="ui-button" onClick={detectGames} disabled={busy}>
              <RotateCw size={15} aria-hidden="true" className={busy ? 'animate-spin' : ''} /> Detect games
            </button>
            <button type="button" className="ui-button ui-button--primary" onClick={saveSettings} disabled={busy}>
              <Save size={15} aria-hidden="true" /> Save settings
            </button>
          </div>
        </header>

        {status && (
          <p role="status" className="rounded-md border border-line bg-panel px-4 py-2.5 text-sm text-stone-200">
            {status}
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          {Object.values(config.games).map((game) => {
            const { id } = game;
            return (
              <section key={id} aria-labelledby={`${id}-settings`} className="space-y-4 rounded-md border border-line bg-panel p-5">
                <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                  <h3 id={`${id}-settings`} className="text-sm font-semibold text-white">{game.name}</h3>
                  {id !== 'ruina' && (
                    <span className={`text-xs font-medium ${game.baseModInstalled ? 'text-emerald-300' : 'text-accent'}`}>
                      {game.baseModInstalled ? 'BaseMod detected' : 'BaseMod missing'}
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  {pathFields.map(({ field, label }) => (
                    <div key={field} className="space-y-1.5">
                      <label htmlFor={`${id}-${field}`} className="block text-xs font-medium text-muted">{label}</label>
                      <div className="flex gap-2">
                        <input
                          id={`${id}-${field}`}
                          value={draftPaths[id]?.[field] ?? game[field] ?? ''}
                          onChange={(event) => setPath(id, field, event.target.value)}
                          disabled={busy}
                          className="ui-field flex-1 select-text font-mono text-xs"
                        />
                        <button
                          type="button"
                          className="ui-button text-xs"
                          aria-label={`Browse for ${game.name} ${label.toLowerCase()}`}
                          disabled={busy}
                          onClick={() => pickFolder(id, field)}
                        >
                          <Folder size={14} aria-hidden="true" /> Browse
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <section aria-labelledby="nexus-settings" className="space-y-4 rounded-md border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <h3 id="nexus-settings" className="text-sm font-semibold text-white">Nexus Mods</h3>
            <span className="text-xs text-muted">Optional for direct in-app downloads (Premium)</span>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="nexus-api-key" className="block text-xs font-medium text-muted">Personal API key</label>
            <div className="flex gap-2">
              <input
                id="nexus-api-key"
                type={showApiKey ? 'text' : 'password'}
                value={draftApiKey ?? config.nexusApiKey ?? ''}
                onChange={(event) => {
                  setDraftApiKey(event.target.value);
                  setStatus('');
                }}
                placeholder="Paste your Nexus Mods personal API key"
                disabled={busy}
                className="ui-field flex-1 select-text font-mono text-xs"
              />
              <button
                type="button"
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                title={showApiKey ? 'Hide API key' : 'Show API key'}
                disabled={busy}
                onClick={() => setShowApiKey((visible) => !visible)}
                className="ui-button ui-button--icon"
              >
                {showApiKey ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
