import { useMemo } from 'react';
import { FACTIONS, GAME } from '../game/constants';
import { computeEconomy } from '../game/economy';
import { scoreOf, VICTORY_TARGET } from '../game/progress';
import { CYCLE_SECONDS, useGameStore } from '../store/gameStore';
import { money, trendClass } from './format';

import { Icon } from './Icon';
import { cx, Ring, Tooltip } from './primitives';
import { averageOperationShare } from '../game/operations';

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
  const paused = !autoPlay || view === 'settings';
  const operations = game.operations.filter((op) => op.factionId === player.id);
  const units = operations.reduce((sum, op) => sum + op.units, 0);
  const markets = Object.values(game.tiles).filter((tile) => tile.owner === player.id).length;
  const share = averageOperationShare(game, player.id);
  const profit = eco.finance.net;

  return (
    <header className="topbar">
      <button className="brand" onClick={() => setView('map')} title="Voltar ao mapa">
        <span className="brand__mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="brand__type">
          <span className="brand__name">
            {GAME.name.split(' ').map((word) => (
              <span key={word}>{word}</span>
            ))}
          </span>
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

      <div className="res-strip" aria-label="Indicadores da companhia">
        <Tooltip text={`Caixa disponível: ${money(player.stocks.creditos)}\nResultado projetado: ${money(profit, true)}/ciclo`}>
          <button type="button" className={cx('res-chip', player.stocks.creditos < 500_000 && 'is-low')} onClick={() => setView('economy')}>
            <span className="res-chip__icon" style={{ color: 'var(--gold)' }}><Icon name="Coins" size={19} /></span>
            <span className="res-chip__body">
              <span className="res-chip__label">Caixa</span>
              <strong aria-label="Caixa disponível">{money(player.stocks.creditos)}</strong>
            </span>
            <span className={cx('res-chip__net', trendClass(profit))}>{money(profit, true)}</span>
          </button>
        </Tooltip>
        <Tooltip text={`${operations.length} operações em ${markets} praças\nParticipação média: ${Math.round(share * 100)}%`}>
          <button type="button" className="res-chip" onClick={() => setView('companies')}>
            <span className="res-chip__icon" style={{ color: '#c6a5ea' }}><Icon name="Store" size={19} /></span>
            <span className="res-chip__body">
              <span className="res-chip__label">Unidades</span>
              <strong>{units}</strong>
            </span>
            <span className="res-chip__net muted">{markets} praça{markets === 1 ? '' : 's'}</span>
          </button>
        </Tooltip>
        {offers ? (
          <Tooltip text={`${offers} proposta${offers > 1 ? 's' : ''} de parceria`}>
            <button type="button" className="res-chip res-chip--alert" onClick={() => setView('diplomacy')}>
              <span className="res-chip__icon" style={{ color: 'var(--gold)' }}><Icon name="Handshake" size={19} /></span>
              <span className="res-chip__body">
                <span className="res-chip__label">Acordos</span>
                <strong>{offers}</strong>
              </span>
            </button>
          </Tooltip>
        ) : null}
      </div>

      <button className="score-chip" onClick={() => setView('objectives')} type="button">
        <Ring percent={victoryPercent} size={38} stroke={3} color="var(--gold)" />
        <span>
          <span className="eyebrow">Relevância</span>
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
        <Tooltip text="Como jogar" side="bottom">
          <button className="icon-button" onClick={onHelp} type="button" aria-label="Como jogar">
            <Icon name="HelpCircle" size={17} />
          </button>
        </Tooltip>
        <div className="brand-crest" title={`${faction.name} — ${faction.epithet}`}>
          <span style={{ background: faction.color }} />
          <span className="brand-crest__letter">{faction.short.slice(0, 1)}</span>
        </div>
        <Tooltip text="Menu e configurações" side="bottom">
          <button className="icon-button" onClick={goToMenu} type="button" aria-label="Menu principal">
            <Icon name="Menu" size={17} />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
