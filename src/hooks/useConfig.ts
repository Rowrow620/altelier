import { useCallback, useEffect, useRef, useState } from 'react';
import defaultConfig from '../../shared/default-config.json';
import { errorMessage } from '../errors';
import type { AppConfig, ConfigPatch, GameId } from '../types';

export function useConfig() {
  const [config, setConfig] = useState<AppConfig>(defaultConfig as AppConfig);
  const [loading, setLoading] = useState(() => Boolean(window.atelierApi));
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(Promise.resolve());
  const initialLoad = useRef<Promise<AppConfig> | null>(null);

  const enqueue = useCallback((
    action: () => Promise<AppConfig>,
    apply: (saved: AppConfig) => void = setConfig,
  ) => {
    const operation = pending.current.then(action).then((saved) => {
      apply(saved);
      return saved;
    });
    pending.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, []);

  useEffect(() => {
    const api = window.atelierApi;
    if (!api) return;
    const request = initialLoad.current ??= enqueue(() => api.getConfig());
    let active = true;
    void request.catch((cause) => {
      if (active) setError(errorMessage(cause, 'Could not load settings.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [enqueue]);

  async function selectGame(gameId: GameId) {
    const api = window.atelierApi;
    setError(null);
    if (!api) {
      setConfig((previous) => ({ ...previous, activeGame: gameId }));
      return;
    }
    try {
      await enqueue(() => api.saveConfig({ activeGame: gameId }), ({ activeGame, activeProfile }) => {
        setConfig((previous) => ({ ...previous, activeGame, activeProfile }));
      });
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save settings.'));
    }
  }

  async function saveConfig(patch: ConfigPatch) {
    const api = window.atelierApi;
    if (!api) throw new Error('Open Atelier to save settings.');
    await enqueue(() => api.saveConfig(patch));
  }

  async function detectGames() {
    const api = window.atelierApi;
    return api && enqueue(() => api.detectGames());
  }

  async function activateProfile(gameId: GameId, name: string) {
    const api = window.atelierApi;
    setError(null);
    if (!api) return;
    try {
      await enqueue(() => api.activateProfile(gameId, name));
    } catch (cause) {
      setError(errorMessage(cause, 'Could not switch profiles.'));
    }
  }

  async function saveProfile(gameId: GameId, name: string) {
    const api = window.atelierApi;
    if (!api) throw new Error('Open Atelier to save profiles.');
    await enqueue(() => api.saveProfile(gameId, name));
  }

  async function deleteProfile(gameId: GameId, name: string) {
    const api = window.atelierApi;
    setError(null);
    if (!api) return;
    try {
      await enqueue(() => api.deleteProfile(gameId, name));
    } catch (cause) {
      setError(errorMessage(cause, 'Could not delete the profile.'));
    }
  }

  async function exportProfile(gameId: GameId, name: string) {
    const api = window.atelierApi;
    setError(null);
    if (!api) return;
    try {
      await api.exportProfile(gameId, name);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not export the profile.'));
    }
  }

  async function importProfile(gameId: GameId) {
    const api = window.atelierApi;
    setError(null);
    if (!api) return;
    try {
      await enqueue(async () => (await api.importProfile(gameId)) ?? config);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not import the profile.'));
    }
  }

  return {
    config, loading, error, dismissError: () => setError(null), selectGame, saveConfig, detectGames,
    activateProfile, saveProfile, deleteProfile, exportProfile, importProfile,
  };
}
