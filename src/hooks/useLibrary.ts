import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../errors';
import type { GameConfig, GameId, Mod } from '../types';

interface LibraryState {
  mods: Mod[];
  loading: boolean;
  error: string | null;
}

const EMPTY_LIBRARY: LibraryState = { mods: [], loading: true, error: null };

export function useLibrary(game: GameConfig, configLoading: boolean) {
  const [libraries, setLibraries] = useState<Partial<Record<GameId, LibraryState>>>({});
  const pending = useRef<Partial<Record<GameId, Promise<void>>>>({});
  const latestRefresh = useRef<Partial<Record<GameId, Promise<void>>>>({});

  const update = useCallback((gameId: GameId, change: Partial<LibraryState>) => {
    setLibraries((previous) => ({
      ...previous,
      [gameId]: { ...(previous[gameId] ?? EMPTY_LIBRARY), ...change },
    }));
  }, []);

  const run = useCallback((
    gameId: GameId,
    action: () => Promise<Mod[] | false>,
    fallback: string,
  ) => {
    // Each reply is a snapshot of the entire library for this game.
    const operation = (pending.current[gameId] ?? Promise.resolve()).then(async () => {
      update(gameId, { error: null });
      try {
        const mods = await action();
        if (mods) update(gameId, { mods });
      } catch (cause) {
        update(gameId, { error: errorMessage(cause, fallback) });
      }
    });
    pending.current[gameId] = operation;
    return operation;
  }, [update]);

  const refreshMods = useCallback((gameId: GameId, showLoading = true) => {
    const api = window.atelierApi;
    if (!api) {
      update(gameId, { loading: false });
      return;
    }
    if (showLoading) update(gameId, { loading: true });
    const operation = run(gameId, async () => {
      try {
        return await api.getMods(gameId);
      } catch (cause) {
        update(gameId, { mods: [] });
        throw cause;
      }
    }, 'Could not load installed mods.');
    latestRefresh.current[gameId] = operation;
    void operation.finally(() => {
      if (latestRefresh.current[gameId] === operation) update(gameId, { loading: false });
    });
  }, [run, update]);

  useEffect(() => {
    if (!configLoading) refreshMods(game.id);
  }, [game, configLoading, refreshMods]);

  function toggleMod(modId: string, enabled: boolean) {
    const api = window.atelierApi;
    if (api) void run(game.id, () => api.toggleMod(game.id, modId, !enabled), 'Could not change the mod.');
  }

  function toggleAll(enable: boolean) {
    const api = window.atelierApi;
    if (api) void run(game.id, () => api.toggleAllMods(game.id, enable), 'Could not update all mods.');
  }

  function deleteMod(folderName: string) {
    const api = window.atelierApi;
    if (api) void run(game.id, () => api.deleteMod(game.id, folderName), 'Could not delete the mod.');
  }

  function openFolder(folderName?: string) {
    const api = window.atelierApi;
    if (api) void run(game.id, async () => {
      await api.openModFolder(game.id, folderName);
      return false;
    }, 'Could not open the mods folder.');
  }

  return {
    ...(libraries[game.id] ?? EMPTY_LIBRARY),
    refreshMods, toggleMod, toggleAll, deleteMod, openFolder,
    dismissError: () => update(game.id, { error: null }),
  };
}
