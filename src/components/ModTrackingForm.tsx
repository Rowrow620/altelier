import { useState } from 'react';
import { errorMessage } from '../errors';
import type { GameId, Mod } from '../types';

export function ModTrackingForm({ gameId, mod, onSaved }: {
  gameId: GameId;
  mod: Mod;
  onSaved: () => void;
}) {
  const [nexusUrl, setNexusUrl] = useState(mod.nexusModId ? mod.nexusUrl : '');
  const [version, setVersion] = useState(mod.version);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  return (
    <details className="rounded-lg border border-line p-3 text-muted">
      <summary className="cursor-pointer">Nexus link and version</summary>
      <form className="mt-3 space-y-2" onSubmit={async (event) => {
        event.preventDefault();
        const api = window.atelierApi;
        if (!api || saving) return;
        setSaving(true);
        setError('');
        setSaved(false);
        try {
          await api.saveModDetails(gameId, mod.id, { nexusUrl: nexusUrl.trim(), version: version.trim() });
          setSaved(true);
          onSaved();
        } catch (cause) {
          setError(errorMessage(cause, 'Could not save the mod details.'));
        } finally {
          setSaving(false);
        }
      }}>
        <label className="grid gap-1.5">
          Nexus mod link
          <input type="url" value={nexusUrl} maxLength={2048} required disabled={saving}
            className="ui-field select-text" onChange={(event) => { setNexusUrl(event.target.value); setSaved(false); }} />
        </label>
        <label className="grid gap-1.5">
          Installed version
          <input value={version} maxLength={100} required disabled={saving}
            className="ui-field select-text" onChange={(event) => { setVersion(event.target.value); setSaved(false); }} />
        </label>
        {error && <p role="alert" className="text-rose-200">{error}</p>}
        {saved && <p role="status">Mod details saved.</p>}
        <button type="submit" className="ui-button" disabled={saving || !version.trim()}>Save details</button>
      </form>
    </details>
  );
}
