import { useMemo } from 'react';
import { FACTIONS } from '../game/constants';
import { computeEconomy } from '../game/economy';
import { careerSteps, nextStep } from '../game/guidance';
import { operationsOf } from '../game/operations';
import { objectivesOf, rankOf, scoreOf } from '../game/progress';
import { tilesOfFaction } from '../game/map';
import type { LogKind } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { fmt, money, trendClass } from './format';
import { Icon } from './Icon';
import { ProgressBar, SectionHeader, cx } from './primitives';

const LOG_ICON: Record<LogKind, string> = {
  economia: 'Coins',
  construcao: 'Hammer',
  expansao: 'Target',
  diplomacia: 'Handshake',
  operacoes: 'Store',
  evento: 'Sun',
  sistema: 'Info',
  pesquisa: 'FlaskConical',
};

/**
 * Painel do mapa: só o que decide o próximo movimento.
 * Caixa, resultado e o roteiro do começo de carreira; o resto vive nas telas
 * próprias (Empresas, Finanças, Metas) para não abrir o jogo num mural.
 */
export function OverviewPanel() {
  const game = useGameStore((s) => s.game)!;
  const setView = useGameStore((s) => s.setView);
  const goToMenu = useGameStore((s) => s.goToMenu);
  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const faction = FACTIONS[playerId];
  const tiles = tilesOfFaction(game.tiles, playerId);
  const eco = useMemo(() => computeEconomy(game, playerId), [game, playerId]);
  const operations = useMemo(() => operationsOf(game, playerId), [game, playerId]);
  const units = operations.reduce((sum, op) => sum + op.units, 0);
  const objectives = useMemo(() => objectivesOf(game), [game]);
  const next = useMemo(() => nextStep(game), [game]);
  const career = useMemo(() => careerSteps(game), [game]);
  const goalsDone = career.filter((step) => step.done).length;
  const allDone = goalsDone === career.length;
  const pendingObjectives = objectives.filter((objective) => !objective.done).slice(0, 2);
  const score = scoreOf(game, playerId);
  const rank = rankOf(score);
  const offers = game.offers.filter((offer) => offer.to === playerId);
  const finance = eco.finance;
  const lastLog = game.log[0];

  return (
    <div className="context-panel">
      <header className="context-head">
        <div className="context-head__main">
          <div className="eyebrow">Sua companhia</div>
          <h2>{faction.name}</h2>
          <p>{rank.name} · {fmt(score)} de relevância</p>
        </div>
        <span className="crest crest--lg" style={{ borderColor: faction.color, color: faction.color }}>
          <span>{faction.short.slice(0, 1)}</span>
        </span>
      </header>

      <div className="context-scroll">
        <button className="callout callout--gold" onClick={() => setView(next.view)} type="button">
          <Icon name={next.icon} size={18} />
          <span>
            <strong>{next.title}</strong>
            <small>{next.body}</small>
          </span>
          <span className="callout__action">{next.action} <Icon name="ChevronRight" size={13} /></span>
        </button>

        <section className="quick-stats quick-stats--three">
          <button className="quick-stat" onClick={() => setView('economy')} type="button">
            <span className="quick-stat__icon"><Icon name="Coins" size={16} /></span>
            <div>
              <span>Caixa</span>
              <strong>{money(player.stocks.creditos)}</strong>
              <small className={trendClass(finance.net)}>{money(finance.net, true)}/ciclo</small>
            </div>
          </button>
          <button className="quick-stat" onClick={() => setView('companies')} type="button">
            <span className="quick-stat__icon"><Icon name="Store" size={16} /></span>
            <div>
              <span>Unidades</span>
              <strong>{units}</strong>
              <small>{operations.length} operações · {tiles.length} praças</small>
            </div>
          </button>
          <button className="quick-stat" onClick={() => setView('objectives')} type="button">
            <span className="quick-stat__icon"><Icon name="Award" size={16} /></span>
            <div>
              <span>Relevância</span>
              <strong>{fmt(score)}</strong>
              <small>{rank.name}</small>
            </div>
          </button>
        </section>

        {offers.length ? (
          <button className="callout" onClick={() => setView('diplomacy')} type="button">
            <Icon name="Handshake" size={18} />
            <span>
              <strong>{offers.length} proposta{offers.length > 1 ? 's' : ''} de parceria</strong>
              <small>Um acordo comercial pode render caixa por ciclo.</small>
            </span>
            <Icon name="ChevronRight" size={15} />
          </button>
        ) : null}

        <section className="card">
          <SectionHeader
            eyebrow={allDone ? 'Campanha' : 'Começo de carreira'}
            title={allDone ? 'Próximos marcos' : `${goalsDone} de ${career.length} primeiros passos`}
            icon={allDone ? 'Target' : 'Check'}
            action={allDone
              ? <button className="text-button" onClick={() => setView('objectives')} type="button">Metas <Icon name="ChevronRight" size={13} /></button>
              : undefined}
          />
          {allDone ? (
            <div className="objective-mini-list">
              {pendingObjectives.map((objective) => (
                <div className="objective-mini" key={objective.id}>
                  <span className="objective-mini__icon"><Icon name={objective.icon} size={15} /></span>
                  <div className="objective-mini__body">
                    <div className="objective-mini__top">
                      <strong>{objective.title}</strong>
                      <span>{fmt(objective.progress)}/{fmt(objective.target)}</span>
                    </div>
                    <ProgressBar value={objective.progress} max={objective.target} tone="teal" thin />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ol className="career-list">
              {career.map((step) => (
                <li className={cx('career-step', step.done && 'is-done')} key={step.id}>
                  <span className="career-step__mark"><Icon name={step.done ? 'Check' : 'Circle'} size={13} /></span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.hint}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {lastLog ? (
          <button className="panel-note" onClick={() => setView('chronicle')} type="button">
            <Icon name={LOG_ICON[lastLog.kind]} size={14} />
            <span>
              <small>Ciclo {lastLog.cycle}</small>
              <strong>{lastLog.text}</strong>
            </span>
            <Icon name="ChevronRight" size={13} />
          </button>
        ) : null}

        <div className="panel-actions panel-actions--quiet">
          <button className="button button--ghost" onClick={() => setView('companies')} type="button">
            <Icon name="Store" size={15} /> Empresas
          </button>
          <button className="button button--ghost" onClick={goToMenu} type="button">
            <Icon name="Menu" size={15} /> Menu
          </button>
        </div>
      </div>
    </div>
  );
}
