import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RESOURCES } from '../game/constants';
import type { Flow, ResourceKey, Stocks } from '../game/types';
import { costEntries, fmt, fmtRate, trendClass } from './format';
import { Icon } from './Icon';

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function Tooltip({ text, children, side = 'top' }: { text: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className={cx('tooltip-wrap', side === 'bottom' && 'tooltip-wrap--bottom')} data-tip={text}>
      {children}
    </span>
  );
}

export function Cost({
  cost,
  stocks,
  compact = false,
}: {
  cost: Partial<Stocks> | null | undefined;
  stocks?: Stocks;
  compact?: boolean;
}) {
  const entries = costEntries(cost);
  if (!entries.length) return <span className="muted tiny">sem custo</span>;
  return (
    <span className={cx('cost-row', compact && 'cost-row--compact')}>
      {entries.map(({ key, value }) => {
        const missing = stocks ? (stocks[key] ?? 0) + 1e-9 < value : false;
        return (
          <span key={key} className={cx('cost-chip', missing && 'is-missing')} title={RESOURCES[key].label}>
            <Icon name={RESOURCES[key].icon} size={12} />
            <span>{fmt(value)}</span>
          </span>
        );
      })}
    </span>
  );
}

export function Delta({ value, suffix = '/ciclo' }: { value: number; suffix?: string | null }) {
  return (
    <span className={cx('delta', trendClass(value))}>
      {value > 0.05 ? <Icon name="ArrowUpRight" size={12} /> : value < -0.05 ? <Icon name="ArrowDownRight" size={12} /> : <Icon name="Minus" size={11} />}
      {fmtRate(value)}
      {suffix ? <small>{suffix}</small> : null}
    </span>
  );
}

export function FlowDelta({ flow, resource }: { flow: Flow; resource: ResourceKey }) {
  return <Delta value={flow[resource]} suffix={null} />;
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'teal',
  label,
  thin = false,
}: {
  value: number;
  max?: number;
  tone?: 'teal' | 'gold' | 'purple' | 'red' | 'blue' | 'neutral';
  label?: string;
  thin?: boolean;
}) {
  const percent = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={cx('progress', thin && 'progress--thin')} aria-label={label} role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
      <span className={`progress__fill progress__fill--${tone}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function LevelPips({ level, max = 3 }: { level: number; max?: number }) {
  return (
    <span className="level-pips" aria-label={`Nível ${level} de ${max}`}>
      {Array.from({ length: max }).map((_, index) => (
        <span key={index} className={cx('level-pip', index < level && 'is-filled')} />
      ))}
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'teal' | 'gold' | 'red' | 'purple' | 'blue';
  icon?: string;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {icon ? <Icon name={icon} size={11} /> : null}
      {children}
    </span>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action,
  icon,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="section-header">
      <div className="section-header__title">
        {icon ? <span className="section-header__icon"><Icon name={icon} size={16} /></span> : null}
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h3>{title}</h3>
        </div>
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: string;
  tone?: 'teal' | 'gold' | 'red' | 'purple' | 'blue' | 'neutral';
}) {
  return (
    <div className="stat">
      <div className="stat__label">
        {icon ? <Icon name={icon} size={13} /> : null}
        {label}
      </div>
      <div className={cx('stat__value', tone && `tone-${tone}`)}>{value}</div>
      {hint ? <div className="stat__hint">{hint}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon"><Icon name={icon} size={22} /></span>
      <h4>{title}</h4>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  icon,
  children,
  footer,
  size = 'md',
  variant = 'center',
  closeLabel = 'Fechar',
  hideClose = false,
  className,
}: {
  open: boolean;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'center' | 'sheet' | 'full';
  closeLabel?: string;
  hideClose?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    const focusTarget = ref.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusTarget?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={cx('overlay', `overlay--${variant}`)}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && onClose) onClose();
      }}
    >
      <div
        ref={ref}
        className={cx('modal', `modal--${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {title ? (
          <header className="modal__header">
            <div className="modal__heading">
              {icon ? <span className="modal__icon"><Icon name={icon} size={20} /></span> : null}
              <div>
                {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
                <h2>{title}</h2>
                {subtitle ? <p>{subtitle}</p> : null}
              </div>
            </div>
            {!hideClose && onClose ? (
              <button className="icon-button" onClick={onClose} aria-label={closeLabel} type="button">
                <Icon name="X" size={18} />
              </button>
            ) : null}
          </header>
        ) : null}
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Ring({ percent, size = 42, stroke = 4, color = 'var(--teal)' }: { percent: number; size?: number; stroke?: number; color?: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
