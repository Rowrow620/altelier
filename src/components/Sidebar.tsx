import { FolderOpen } from 'lucide-react';
import type { GameId, GameConfig } from '../types';
import lobotomyBanner from '../assets/lobotomy-banner.png';
import ruinaBanner from '../assets/ruina-banner.jpg';

export type Tab = 'mods' | 'browse' | 'tweaks' | 'optimization' | 'settings';

interface SidebarProps {
  activeGameId: GameId;
  onSelectGame: (id: GameId) => void;
  games: Record<GameId, GameConfig>;
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
  onOpenFolder: () => void;
  activeCount?: number;
  tweaksActive?: boolean;
  onLaunch: (modded: boolean) => void;
  launching: boolean;
}

const gameBanners = { lobotomy: lobotomyBanner, ruina: ruinaBanner };
const navigation = [
  { tab: 'mods', label: 'Library' },
  { tab: 'browse', label: 'Browse' },
  { tab: 'tweaks', label: 'Tweaks' },
  { tab: 'optimization', label: 'Optimization' },
  { tab: 'settings', label: 'Settings' },
] as const;

export function Sidebar({
  activeGameId, onSelectGame, games, activeTab, onSelectTab, onOpenFolder,
  activeCount, tweaksActive = false, onLaunch, launching,
}: SidebarProps) {
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-hidden border-r border-line bg-chrome p-4">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <div role="group" aria-labelledby="games-label" className="space-y-2.5">
          <p id="games-label" className="font-norwester px-1.5 pb-0.5 text-sm tracking-[0.12em] text-muted">Games</p>
          {Object.values(games).map(({ id, name }) => (
            <button
              key={id}
              type="button"
              aria-label={name}
              title={name}
              aria-pressed={activeGameId === id}
              onClick={() => onSelectGame(id)}
              className="group relative block w-full overflow-hidden rounded-md border border-line bg-panel transition-all hover:border-[#52525b] aria-pressed:border-accent aria-pressed:ring-1 aria-pressed:ring-accent/45"
            >
              <img
                src={gameBanners[id]}
                alt=""
                className="block h-auto w-full opacity-70 transition-all duration-200 group-hover:scale-[1.02] group-hover:opacity-95 group-aria-pressed:opacity-100"
              />
              <span className="sr-only">{name}</span>
            </button>
          ))}
        </div>

        <nav aria-label="Main navigation" className="space-y-1 pt-2">
          {navigation.map(({ tab, label }) => (
            <button
              key={tab}
              type="button"
              aria-current={activeTab === tab ? 'page' : undefined}
              onClick={() => onSelectTab(tab)}
              className="font-norwester flex min-h-10 w-full items-center rounded-md border border-transparent px-3 text-base tracking-[0.08em] text-muted transition-colors hover:border-line/70 hover:bg-panel/60 hover:text-white aria-[current=page]:border-accent/40 aria-[current=page]:bg-panel aria-[current=page]:text-accent"
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="shrink-0 space-y-2 pt-2">
        <button type="button" onClick={onOpenFolder} className="ui-button font-norwester mb-2 min-h-10 w-full text-sm tracking-[0.08em]">
          <FolderOpen size={16} aria-hidden="true" /> Open Mods Folder
        </button>
        <button
          type="button"
          onClick={() => onLaunch(true)}
          disabled={launching}
          className="font-norwester inline-flex min-h-10 w-full items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 text-sm tracking-[0.08em] text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-45"
        >
          Launch Modded{activeCount !== undefined
            ? ` (${activeCount}${tweaksActive ? ' + Tweaks' : ''})`
            : (tweaksActive ? ' (Tweaks)' : '')}
        </button>
        <button
          type="button"
          onClick={() => onLaunch(false)}
          disabled={launching}
          className="ui-button font-norwester min-h-10 w-full text-sm tracking-[0.08em]"
        >
          Launch Vanilla
        </button>
        <button
          type="button"
          onClick={() => window.atelierApi?.openExternal('https://github.com/Rowrow620/altelier')}
          aria-label="Open GitHub repository"
          title="https://github.com/Rowrow620/altelier"
          className="mx-auto flex items-center justify-center rounded p-1.5 text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
