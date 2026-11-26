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
    <aside className="flex w-53 shrink-0 flex-col justify-between gap-5 border-r border-line bg-chrome p-3.5">
      <div className="space-y-5">
        <h1 className="px-1.5 pt-1 font-cinzel text-lg font-bold text-accent">Atelier</h1>

        <div role="group" aria-labelledby="games-label" className="space-y-1">
          <p id="games-label" className="px-2 pb-1 text-xs font-medium text-muted">Games</p>
          {Object.values(games).map(({ id, name }) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeGameId === id}
              onClick={() => onSelectGame(id)}
              className="flex min-h-10 w-full items-center gap-2 rounded-md border border-transparent px-2 text-left text-xs font-medium text-muted hover:bg-white/5 hover:text-white aria-pressed:border-[#6a5230] aria-pressed:bg-[#2c2318] aria-pressed:text-accent"
            >
              <img src={gameIcons[id]} alt="" className="size-5 shrink-0 object-contain" />
              <span>{name}</span>
            </button>
          ))}
        </div>

        <nav aria-label="Main navigation" className="space-y-1 border-t border-line pt-3">
          {navigation.map(({ tab, label, Icon }) => (
            <button
              key={tab}
              type="button"
              aria-current={activeTab === tab ? 'page' : undefined}
              aria-haspopup={tab === 'import' ? 'dialog' : undefined}
              onClick={tab === 'import' ? onImport : () => onSelectTab(tab)}
              className="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-muted hover:bg-white/5 hover:text-white aria-[current=page]:bg-panel aria-[current=page]:text-accent"
            >
              <Icon size={17} aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
      </div>

      <button type="button" onClick={onOpenFolder} className="ui-button w-full text-xs">
        <FolderOpen size={15} aria-hidden="true" /> Open Mods Folder
      </button>
    </aside>
  );
}
