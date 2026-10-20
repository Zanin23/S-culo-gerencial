import { useMemo } from 'react';
import { FACTIONS, GAME, RESOURCES, RESOURCE_KEYS } from '../game/constants';
import { computeEconomy } from '../game/economy';
import { scoreOf, VICTORY_TARGET } from '../game/progress';
import { CYCLE_SECONDS, useGameStore } from '../store/gameStore';
import { fmt, fmtRate, trendClass } from './format';
import { Icon } from './Icon';
import { cx, Ring, Tooltip } from './primitives';

export function TopBar({ onHelp }: { onHelp: () => void }) {
  const game = useGameStore((s) => s.game)!;
  const view = useGameStore((s) => s.view);
  const setView = useGameStore((s) => s.setView);
  const autoPlay = useGameStore((s) => s.autoPlay);
  const toggleAutoPlay = useGameStore((s) => s.toggleAutoPlay);
  const advance = useGameStore((s) => s.advance);
  const secondsLeft = useGameStore((s) => s.secondsLeft);
  const goToMenu = useGameStore((s) => s.goToMenu);
  const openEvent = useGameStore((s) => s.openEvent);
  const pendingEvent = Boolean(game.pendingEventId);
  const offers = game.offers.filter((o) => o.to === game.playerFactionId).length;
  const player = game.factions[game.playerFactionId];
  const faction = FACTIONS[game.playerFactionId];
  const eco = useMemo(() => computeEconomy(game, game.playerFactionId), [game]);
  const score = useMemo(() => scoreOf(game, game.playerFactionId), [game]);
  const timerPercent = (secondsLeft / CYCLE_SECONDS) * 100;
  const victoryPercent = Math.min(100, (score / VICTORY_TARGET) * 100);
  const paused = !autoPlay || view !== 'map';

  return (
    <header className="topbar">
      <button className="brand" onClick={() => setView('map')} title="Voltar ao mapa">
        <span className="brand__mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="brand__type">
          <span className="brand__name">{GAME.name}</span>
          <span className="brand__world">{GAME.world}</span>
        </span>
      </button>

      <div className="cycle-block">
        <div className="cycle-ring">
          <Ring percent={timerPercent} size={42} stroke={3} color={paused ? 'rgba(255,255,255,.28)' : 'var(--teal)'} />
          <span>{secondsLeft}</span>
        </div>
        <div className="cycle-meta">
          <span className="eyebrow">Ciclo</span>
          <strong>{String(game.cycle).padStart(2, '0')}</strong>
          <span className={cx('cycle-state', paused && 'is-paused')}>
            <i /> {paused ? 'Pausado' : 'Em curso'}
          </span>
        </div>
        <div className="cycle-actions">
          <Tooltip text={autoPlay ? 'Pausar ciclos' : 'Retomar ciclos'}>
            <button
              className={cx('icon-button', autoPlay && 'is-active')}
              onClick={toggleAutoPlay}
              aria-label={autoPlay ? 'Pausar ciclos' : 'Retomar ciclos'}
              type="button"
            >
              <Icon name={autoPlay ? 'Pause' : 'Play'} size={16} />
            </button>
          </Tooltip>
          <Tooltip text="Encerrar ciclo agora">
            <button className="advance-button" onClick={advance} type="button">
              <Icon name="SkipForward" size={15} />
              <span>Avançar</span>
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="res-strip" role="list" aria-label="Recursos nacionais">
        {RESOURCE_KEYS.map((key) => {
          const net = eco.net[key];
          const low = key === 'creditos' ? player.stocks.creditos < 20 : key === 'energia' ? eco.projectedStocks.energia < 10 : false;
          return (
            <Tooltip key={key} text={`${RESOURCES[key].label}: ${RESOURCES[key].description}\nSaldo projetado: ${fmtRate(net)}`}>
              <button
                type="button"
                role="listitem"
                className={cx('res-chip', low && 'is-low')}
                onClick={() => setView('economy')}
              >
                <span className="res-chip__icon" style={{ color: RESOURCES[key].color }}>
                  <Icon name={RESOURCES[key].icon} size={15} />
                </span>
                <span className="res-chip__body">
                  <span className="res-chip__label">{RESOURCES[key].label}</span>
                  <strong>{fmt(player.stocks[key])}</strong>
                </span>
                <span className={cx('res-chip__net', trendClass(net))}>{fmtRate(net)}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>

      <button className="score-chip" onClick={() => setView('objectives')} type="button">
        <Ring percent={victoryPercent} size={38} stroke={3} color="var(--gold)" />
        <span>
          <span className="eyebrow">Hegemonia</span>
          <strong>{score} <small>/ {VICTORY_TARGET}</small></strong>
        </span>
        <Icon name="ChevronRight" size={14} />
      </button>

      <div className="top-actions">
        {pendingEvent ? (
          <button className="event-chip" onClick={openEvent} type="button">
            <span className="event-chip__pulse" />
            <Icon name="AlertTriangle" size={14} />
            Evento pendente
          </button>
        ) : null}
        <Tooltip text="Propostas diplomáticas pendentes" side="bottom">
          <button className="icon-button" onClick={() => setView('diplomacy')} type="button" aria-label="Diplomacia">
            <Icon name="Bell" size={17} />
            {offers ? <span className="dot-badge">{offers}</span> : null}
          </button>
        </Tooltip>
        <Tooltip text="Como jogar" side="bottom">
          <button className="icon-button" onClick={onHelp} type="button" aria-label="Como jogar">
            <Icon name="HelpCircle" size={17} />
          </button>
        </Tooltip>
        <Tooltip text="Configurações, saves e novo mundo" side="bottom">
          <button className="icon-button" onClick={() => setView('settings')} type="button" aria-label="Configurações">
            <Icon name="Settings" size={17} />
          </button>
        </Tooltip>
        <div className="brand-crest" title={`${faction.name} — ${faction.epithet}`}>
          <span style={{ background: faction.color }} />
          <span className="brand-crest__letter">{faction.short.slice(0, 1)}</span>
        </div>
        <Tooltip text="Voltar ao menu" side="bottom">
          <button className="icon-button" onClick={goToMenu} type="button" aria-label="Menu principal">
            <Icon name="Menu" size={17} />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
