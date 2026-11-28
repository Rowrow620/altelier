import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Sidebar, type Tab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { BrowseOnlineView } from './components/BrowseOnlineView';
import { TweaksView } from './components/TweaksView';
import { OptimizationView } from './components/OptimizationView';
import { InstallModal } from './components/InstallModal';
import { SettingsModal } from './components/SettingsModal';
import { ModDetailsModal } from './components/ModDetailsModal';
import { SaveProfileDialog } from './components/SaveProfileDialog';
import { errorMessage } from './errors';
import { useConfig } from './hooks/useConfig';
import { useLibrary } from './hooks/useLibrary';
import type { GameId, Mod } from './types';

interface LaunchStatus {
  gameId: GameId;
  status: 'launching' | 'requested' | 'error';
  message: string;
}

export function App() {
  const settings = useConfig();
  const { config } = settings;
  const currentGame = config.games[config.activeGame];
  const library = useLibrary(currentGame, settings.loading);
  const [activeTab, setActiveTab] = useState<Tab>('mods');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedModId, setSelectedModId] = useState<string | null>(null);
  const [install, setInstall] = useState<{ gameId: GameId; replacement?: Mod } | null>(null);
  const [savingProfileFor, setSavingProfileFor] = useState<GameId | null>(null);
  const [launch, setLaunch] = useState<LaunchStatus | null>(null);

  useEffect(() => {
    if (launch?.status !== 'requested') return;
    const timer = setTimeout(() => setLaunch(null), 3000);
    return () => clearTimeout(timer);
  }, [launch]);

  async function launchGame(modded: boolean) {
    const api = window.atelierApi;
    const gameId = currentGame.id;
    const mode = modded ? 'modded' : 'vanilla';
    setLaunch({ gameId, status: 'launching', message: `Launching ${currentGame.name} (${mode})…` });
    try {
      if (!api) throw new Error('Open Atelier to launch a game.');
      await settings.waitForPendingSave();
      const message = await api.launchGame(gameId, modded);
      setLaunch({ gameId, status: 'requested', message });
    } catch (cause) {
      setLaunch({ gameId, status: 'error', message: errorMessage(cause, 'Could not launch the game.') });
    }
  }

  const loadingMods = settings.loading || library.loading;
  const mods = loadingMods ? [] : library.mods;
  const selectedMod = mods.find((mod) => mod.id === selectedModId) ?? null;
  const builtInTweaksEnabled = Boolean(currentGame.tweaks.SpeedMultiplier) || Object.values(currentGame.tweaks).includes(true);
  const activeCount = mods.filter((mod) => mod.enabled).length + Number(builtInTweaksEnabled);
  const hasExternallyManagedMods = mods.some((mod) => mod.enabled === null);
  const gameLaunch = launch?.gameId === currentGame.id ? launch : null;
  const launchError = gameLaunch?.status === 'error' ? gameLaunch.message : null;
  const operationError = settings.error ?? launchError ?? library.error;

  function dismissError() {
    if (settings.error) settings.dismissError();
    else if (launchError) setLaunch(null);
    else library.dismissError();
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-workspace text-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-1.5 focus:text-xs focus:font-semibold focus:text-chrome"
      >
        Skip to content
      </a>
      <Header
        profiles={config.profiles}
        activeProfile={config.activeProfile}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onSelectProfile={(activeProfile) => {
          setSelectedModId(null);
          void settings.activateProfile(currentGame.id, activeProfile);
        }}
        onSaveProfile={() => setSavingProfileFor(currentGame.id)}
        onDeleteProfile={() => {
          setSelectedModId(null);
          void settings.deleteProfile(currentGame.id, config.activeProfile);
        }}
        onExportProfile={() => void settings.exportProfile(currentGame.id, config.activeProfile)}
        onImportProfile={() => {
          setSelectedModId(null);
          void settings.importProfile(currentGame.id).then(() => library.refreshMods(currentGame.id, false));
        }}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen && (
          <Sidebar
            activeGameId={config.activeGame}
            onSelectGame={(activeGame) => {
              setSelectedModId(null);
              void settings.selectGame(activeGame);
            }}
            games={config.games}
            activeTab={activeTab}
            onSelectTab={(tab) => {
              setSelectedModId(null);
              setActiveTab(tab);
            }}
            onOpenFolder={() => library.openFolder()}
            activeCount={loadingMods || hasExternallyManagedMods ? undefined : activeCount}
            onLaunch={launchGame}
            launching={settings.loading || launch?.status === 'launching'}
          />
        )}

        <main id="main-content" tabIndex={-1} className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-workspace focus:outline-none">
          {operationError && (
            <div role="alert" className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-5 py-3 text-sm text-rose-200">
              <span>{operationError}</span>
              <button type="button" className="ui-button" onClick={dismissError}>Dismiss</button>
            </div>
          )}
          {gameLaunch && gameLaunch.status !== 'error' && (
            <div role="status" className="absolute top-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-line bg-panel px-4 py-2 text-sm shadow-lg">
              {gameLaunch.message}
            </div>
          )}

          {activeTab === 'mods' ? (
            <DashboardView
              key={currentGame.id}
              gameId={currentGame.id}
              mods={mods}
              loading={loadingMods}
              onToggleMod={library.toggleMod}
              onToggleAll={library.toggleAll}
              onOpenFolder={library.openFolder}
              onDeleteMod={library.deleteMod}
              onDeleteMods={library.deleteMods}
              onViewDetails={(mod) => setSelectedModId(mod.id)}
              onImport={() => setInstall({ gameId: currentGame.id })}
            />
          ) : activeTab === 'browse' ? (
            <BrowseOnlineView
              key={currentGame.id}
              gameId={currentGame.id}
              onInstalled={() => library.refreshMods(currentGame.id, false)}
            />
          ) : activeTab === 'tweaks' ? (
            <TweaksView
              key={currentGame.id}
              game={currentGame}
              onSaveConfig={settings.saveConfig}
            />
          ) : activeTab === 'optimization' ? (
            <OptimizationView
              key={currentGame.id}
              game={currentGame}
              onSaveConfig={settings.saveConfig}
              onLibraryChanged={() => library.refreshMods(currentGame.id, false)}
            />
          ) : (
            <div className="workspace-scroll">
              <SettingsModal
                config={config}
                onSaveConfig={settings.saveConfig}
                onDetectGames={settings.detectGames}
              />
            </div>
          )}
        </main>
      </div>

      {selectedMod && (
        <ModDetailsModal
          key={currentGame.id + ':' + selectedMod.id}
          gameId={currentGame.id}
          mod={selectedMod}
          onClose={() => setSelectedModId(null)}
          onSaved={() => void library.refreshMods(currentGame.id, false)}
        />
      )}

      {install && (
        <InstallModal
          games={config.games}
          initialGameId={install.gameId}
          replacement={install.replacement}
          onClose={() => setInstall(null)}
          onDone={library.refreshMods}
        />
      )}
      {savingProfileFor && (
        <SaveProfileDialog name={config.activeProfile}
          onSave={(name) => settings.saveProfile(savingProfileFor, name)}
          onClose={() => setSavingProfileFor(null)} />
      )}
    </div>
  );
}

export default App;
