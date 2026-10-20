import { useGameStore, type ViewKey } from '../store/gameStore';
import { Icon } from './Icon';
import { cx, Tooltip } from './primitives';

const ITEMS: Array<{ view: ViewKey; label: string; icon: string }> = [
  { view: 'map', label: 'Mundo', icon: 'Map' },
  { view: 'city', label: 'Cidade', icon: 'Building2' },
  { view: 'companies', label: 'Empresas', icon: 'Store' },
  { view: 'economy', label: 'Economia', icon: 'Coins' },
  { view: 'construction', label: 'Obras', icon: 'Hammer' },
  { view: 'tech', label: 'P&D', icon: 'FlaskConical' },
  { view: 'expansion', label: 'Expansão', icon: 'Target' },
  { view: 'diplomacy', label: 'Acordos', icon: 'Handshake' },
  { view: 'objectives', label: 'Metas', icon: 'Award' },
  { view: 'chronicle', label: 'Relatório', icon: 'ScrollText' },
];

export function NavRail({ onHelp }: { onHelp: () => void }) {
  const view = useGameStore((s) => s.view);
  const setView = useGameStore((s) => s.setView);
  const selectTile = useGameStore((s) => s.selectTile);
  const selectedTileId = useGameStore((s) => s.selectedTileId);
  const game = useGameStore((s) => s.game)!;
  const playerId = game.playerFactionId;
  const offers = game.offers.filter((o) => o.to === playerId).length;
  const pendingProjects = game.projects.filter((p) => p.factionId === playerId).length;
  const openOperations = game.operations.filter((op) => op.factionId === playerId).length;

  const go = (next: ViewKey) => {
    if (next === 'map' && view === 'map' && selectedTileId) {
      selectTile(null);
      return;
    }
    setView(next);
  };

  return (
    <nav className="nav-rail" aria-label="Navegação principal">
      <div className="nav-rail__items">
        {ITEMS.map((item) => (
          <Tooltip key={item.view} text={item.label}>
            <button
              type="button"
              className={cx('nav-item', view === item.view && 'is-active')}
              onClick={() => go(item.view)}
              aria-current={view === item.view ? 'page' : undefined}
            >
              <span className="nav-item__icon">
                <Icon name={item.icon} size={19} />
                {item.view === 'diplomacy' && offers ? <span className="dot-badge">{offers}</span> : null}
                {item.view === 'construction' && pendingProjects ? <span className="dot-badge dot-badge--teal">{pendingProjects}</span> : null}
                {item.view === 'companies' && openOperations ? <span className="dot-badge dot-badge--teal">{openOperations}</span> : null}
              </span>
              <span className="nav-item__label">{item.label}</span>
            </button>
          </Tooltip>
        ))}
      </div>
      <div className="nav-rail__bottom">
        <Tooltip text="Como jogar">
          <button className="nav-item nav-item--small" onClick={onHelp} type="button">
            <Icon name="HelpCircle" size={18} />
            <span className="nav-item__label">Ajuda</span>
          </button>
        </Tooltip>
        <Tooltip text="Configurações">
          <button className={cx('nav-item nav-item--small', view === 'settings' && 'is-active')} onClick={() => setView('settings')} type="button">
            <Icon name="Settings" size={18} />
            <span className="nav-item__label">Ajustes</span>
          </button>
        </Tooltip>
      </div>
    </nav>
  );
}
