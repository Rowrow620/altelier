import { Compass, FolderOpen, Layers, Settings, Upload } from 'lucide-react';
import type { GameId, GameConfig } from '../types';
import lobotomyIcon from '../assets/angela-lobotomy.png';
import ruinaIcon from '../assets/ruina-crest.png';

type Tab = 'mods' | 'browse' | 'settings';

interface SidebarProps {
  activeGameId: GameId;
  onSelectGame: (id: GameId) => void;
  games: Record<GameId, GameConfig>;
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
  onImport: () => void;
  onOpenFolder: () => void;
}

const gameIcons = { lobotomy: lobotomyIcon, ruina: ruinaIcon };
const navigation = [
  { tab: 'mods', label: 'Library', Icon: Layers },
  { tab: 'browse', label: 'Browse', Icon: Compass },
  { tab: 'import', label: 'Import', Icon: Upload },
  { tab: 'settings', label: 'Settings', Icon: Settings },
] as const;

export function Sidebar({ activeGameId, onSelectGame, games, activeTab, onSelectTab, onImport, onOpenFolder }: SidebarProps) {
  return (
    <aside className="flex w-55 shrink-0 flex-col justify-between gap-5 border-r border-line bg-chrome p-3.5">
      <div className="space-y-5">
        <h1 className="font-norwester px-1.5 pt-1 text-2xl tracking-[0.08em] text-accent">Atelier</h1>

        <div role="group" aria-labelledby="games-label" className="space-y-1.5">
          <p id="games-label" className="font-norwester px-2 pb-0.5 text-xs tracking-[0.1em] text-muted">Games</p>
          {Object.values(games).map(({ id, name }) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeGameId === id}
              onClick={() => onSelectGame(id)}
              className="font-norwester flex min-h-10 w-full items-center gap-2.5 rounded-md border border-line/70 bg-panel/60 px-2.5 text-left text-xs tracking-[0.06em] text-muted transition-colors hover:border-[#55504a] hover:bg-panel hover:text-white aria-pressed:border-accent/60 aria-pressed:bg-[#2c2318] aria-pressed:text-accent"
            >
              <img src={gameIcons[id]} alt="" className="size-5 shrink-0 object-contain" />
              <span>{name}</span>
            </button>
          ))}
        </div>

        <nav aria-label="Main navigation" className="space-y-1 border-t border-line pt-3.5">
          {navigation.map(({ tab, label, Icon }) => (
            <button
              key={tab}
              type="button"
              aria-current={activeTab === tab ? 'page' : undefined}
              aria-haspopup={tab === 'import' ? 'dialog' : undefined}
              onClick={tab === 'import' ? onImport : () => onSelectTab(tab)}
              className="font-norwester flex min-h-9 w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 text-sm tracking-[0.07em] text-muted transition-colors hover:border-line/70 hover:bg-panel/60 hover:text-white aria-[current=page]:border-accent/40 aria-[current=page]:bg-panel aria-[current=page]:text-accent"
            >
              <Icon size={16} aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
      </div>

      <button type="button" onClick={onOpenFolder} className="ui-button font-norwester w-full text-xs tracking-[0.07em]">
        <FolderOpen size={15} aria-hidden="true" /> Open Mods Folder
      </button>
    </aside>
  );
}
