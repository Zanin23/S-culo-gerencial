import type { ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';
import { cx } from './primitives';

export function ViewShell({
  eyebrow,
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  icon: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const setView = useGameStore((s) => s.setView);
  return (
    <div className={cx('view-shell', className)}>
      <header className="view-head">
        <div className="view-head__title">
          <span className="view-head__icon"><Icon name={icon} size={22} /></span>
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
        <div className="view-head__actions">
          {actions}
          <button className="icon-button icon-button--bordered" onClick={() => setView('map')} aria-label="Voltar ao mapa" type="button">
            <Icon name="X" size={17} />
          </button>
        </div>
      </header>
      <div className="view-scroll">{children}</div>
    </div>
  );
}
