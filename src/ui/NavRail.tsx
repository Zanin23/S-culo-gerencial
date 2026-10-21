import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore, type ViewKey } from '../store/gameStore';
import { Icon } from './Icon';
import { cx, Tooltip } from './primitives';

/**
 * Navegação enxuta: seis destinos do dia a dia e um menu "Mais" para as telas
 * que entram em cena depois (estruturas, P&D, expansão, acordos e relatório).
 */

const PRIMARY: Array<{ view: ViewKey; label: string; icon: string }> = [
  { view: 'map', label: 'Mundo', icon: 'Map' },
  { view: 'city', label: 'Cidade', icon: 'Building2' },
  { view: 'companies', label: 'Empresas', icon: 'Store' },
  { view: 'units', label: 'Obras', icon: 'Blocks' },
  { view: 'economy', label: 'Finanças', icon: 'Coins' },
  { view: 'objectives', label: 'Metas', icon: 'Award' },
];

const SECONDARY: Array<{ view: ViewKey; label: string; icon: string; hint: string }> = [
  { view: 'construction', label: 'Estruturas', icon: 'Hammer', hint: 'Construir na praça' },
  { view: 'expansion', label: 'Expansão', icon: 'Target', hint: 'Licenciar novas praças' },
  { view: 'tech', label: 'P&D', icon: 'FlaskConical', hint: 'Pesquisar tecnologias' },
  { view: 'diplomacy', label: 'Acordos', icon: 'Handshake', hint: 'Presentes e parcerias' },
  { view: 'chronicle', label: 'Relatório', icon: 'ScrollText', hint: 'Histórico da campanha' },
  { view: 'settings', label: 'Ajustes', icon: 'Settings', hint: 'Saves e novo mundo' },
];

interface MenuPosition {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  width: number;
}

function menuPosition(button: HTMLElement): MenuPosition {
  const rect = button.getBoundingClientRect();
  const mobile = window.innerWidth <= 900;
  const width = Math.min(240, window.innerWidth - 20);
  if (mobile) {
    return { right: 8, bottom: window.innerHeight - rect.top + 8, width };
  }
  return { left: rect.right + 10, top: Math.min(rect.top - 6, window.innerHeight - 360), width };
}

export function NavRail() {
  const view = useGameStore((s) => s.view);
  const setView = useGameStore((s) => s.setView);
  const selectTile = useGameStore((s) => s.selectTile);
  const selectedTileId = useGameStore((s) => s.selectedTileId);
  const game = useGameStore((s) => s.game)!;
  const playerId = game.playerFactionId;
  const offers = game.offers.filter((o) => o.to === playerId).length;
  const pendingProjects = game.projects.filter((p) => p.factionId === playerId).length;
  const openOperations = game.operations.filter((op) => op.factionId === playerId).length;
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const moreOpen = menu !== null;
  const secondaryActive = SECONDARY.some((item) => item.view === view);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    const reposition = () => {
      if (buttonRef.current) setMenu(menuPosition(buttonRef.current));
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', reposition);
    };
  }, [moreOpen]);

  const go = (next: ViewKey) => {
    setMenu(null);
    if (next === 'map' && view === 'map' && selectedTileId) {
      selectTile(null);
      return;
    }
    setView(next);
  };

  const toggleMore = () => {
    if (moreOpen) {
      setMenu(null);
      return;
    }
    if (buttonRef.current) setMenu(menuPosition(buttonRef.current));
  };

  return (
    <nav className="nav-rail" aria-label="Navegação principal">
      <div className="nav-rail__items">
        {PRIMARY.map((item) => (
          <Tooltip key={item.view} text={item.label}>
            <button
              type="button"
              className={cx('nav-item', view === item.view && 'is-active')}
              onClick={() => go(item.view)}
              aria-current={view === item.view ? 'page' : undefined}
            >
              <span className="nav-item__icon">
                <Icon name={item.icon} size={19} />
                {item.view === 'companies' && openOperations ? <span className="dot-badge dot-badge--gold">{openOperations}</span> : null}
                {item.view === 'units' && pendingProjects ? <span className="dot-badge dot-badge--teal">{pendingProjects}</span> : null}
              </span>
              <span className="nav-item__label">{item.label}</span>
            </button>
          </Tooltip>
        ))}
        <div className="nav-more">
          <Tooltip text="Mais telas">
            <button
              ref={buttonRef}
              type="button"
              className={cx('nav-item', (secondaryActive || moreOpen) && 'is-active')}
              onClick={toggleMore}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
            >
              <span className="nav-item__icon">
                <Icon name="Layers" size={19} />
                {offers ? <span className="dot-badge">{offers}</span> : null}
              </span>
              <span className="nav-item__label">Mais</span>
            </button>
          </Tooltip>
        </div>
      </div>
      {moreOpen
        ? createPortal(
            <div
              className="nav-more__menu"
              role="menu"
              ref={menuRef}
              style={{
                left: menu.left,
                right: menu.right,
                top: menu.top,
                bottom: menu.bottom,
                width: menu.width,
              }}
            >
              {SECONDARY.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  role="menuitem"
                  className={cx('nav-more__item', view === item.view && 'is-active')}
                  onClick={() => go(item.view)}
                >
                  <Icon name={item.icon} size={16} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                  {item.view === 'diplomacy' && offers ? <span className="dot-badge">{offers}</span> : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </nav>
  );
}
