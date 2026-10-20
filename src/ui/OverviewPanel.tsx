import { useMemo } from 'react';
import { AI_FACTIONS, FACTIONS, RESOURCES, RESOURCE_KEYS } from '../game/constants';
import { adminCapacityOfState, computeEconomy, developmentOf, projectSlotsOf } from '../game/economy';
import { leaderboard, objectivesOf, rankOf, scoreParts, VICTORY_TARGET } from '../game/progress';
import { tilesOfFaction } from '../game/map';
import type { LogKind } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { cityLabel } from '../game/names';
import { fmt, fmtRate, trendClass } from './format';
import { Icon } from './Icon';
import { Badge, ProgressBar, Ring, SectionHeader } from './primitives';

const LOG_ICON: Record<LogKind, string> = {
  economia: 'Coins',
  construcao: 'Hammer',
  expansao: 'Target',
  diplomacia: 'Handshake',
  militar: 'Swords',
  evento: 'Sun',
  sistema: 'Info',
  pesquisa: 'FlaskConical',
};

export function OverviewPanel() {
  const game = useGameStore((s) => s.game)!;
  const selectTile = useGameStore((s) => s.selectTile);
  const setView = useGameStore((s) => s.setView);
  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const faction = FACTIONS[playerId];
  const capital = game.tiles[player.capitalId];
  const tiles = tilesOfFaction(game.tiles, playerId);
  const board = useMemo(() => leaderboard(game), [game]);
  const objectives = useMemo(() => objectivesOf(game), [game]);
  const eco = useMemo(() => computeEconomy(game, playerId), [game, playerId]);
  const score = board.find((row) => row.isPlayer)?.score ?? 0;
  const rank = rankOf(score);
  const leader = board[0];
  const offers = game.offers.filter((offer) => offer.to === playerId);
  const projects = game.projects.filter((project) => project.factionId === playerId);
  const pendingObjectives = objectives.filter((objective) => !objective.done).slice(0, 3);
  const capacity = adminCapacityOfState(game, playerId);
  const totalDev = tiles.reduce((sum, tile) => sum + developmentOf(tile), 0);
  const scoreRows = scoreParts(game, playerId);

  return (
    <div className="context-panel">
      <header className="context-head">
        <div className="context-head__main">
          <div className="eyebrow">Painel da nação</div>
          <h2>{faction.name}</h2>
          <p>{faction.epithet} · {rank.name}</p>
        </div>
        <span className="crest crest--lg" style={{ borderColor: faction.color, color: faction.color }}>
          <span>{faction.short.slice(0, 1)}</span>
        </span>
      </header>

      <div className="context-scroll">
        <section className="card hero-card">
          <div className="hero-card__score">
            <Ring percent={(score / VICTORY_TARGET) * 100} size={74} stroke={5} color="var(--gold)" />
            <div className="hero-card__score-text">
              <strong>{fmt(score)}</strong>
              <span>de {VICTORY_TARGET} para hegemonia</span>
            </div>
          </div>
          <ProgressBar value={score} max={VICTORY_TARGET} tone="gold" />
          <div className="hero-card__meta">
            <span><Icon name="Award" size={13} /> {rank.name}</span>
            <span className={leader.isPlayer ? 'tone-teal' : 'tone-gold'}>
              <Icon name={leader.isPlayer ? 'TrendingUp' : 'Target'} size={13} />
              {leader.isPlayer ? 'Você lidera o mundo' : `${leader.name} lidera com ${fmt(leader.score)}`}
            </span>
          </div>
        </section>

        {offers.length ? (
          <button className="callout callout--gold" onClick={() => setView('diplomacy')} type="button">
            <Icon name="Handshake" size={18} />
            <span>
              <strong>{offers.length} proposta{offers.length > 1 ? 's' : ''} diplomática{offers.length > 1 ? 's' : ''}</strong>
              <small>Uma resposta pode mudar as relações do mundo.</small>
            </span>
            <Icon name="ChevronRight" size={15} />
          </button>
        ) : null}

        {game.city ? (
          <button className="callout callout--seat" onClick={() => setView('city')} type="button">
            <Icon name="Building2" size={18} />
            <span>
              <strong>Sede em {cityLabel(game.city.cityName)}</strong>
              <small>Distrito {game.city.district} · lote {game.city.plotId} · abrir a cidade 3D</small>
            </span>
            <Icon name="ChevronRight" size={15} />
          </button>
        ) : null}

        <section className="quick-stats">
          <button className="quick-stat" onClick={() => selectTile(player.capitalId)} type="button">
            <span className="quick-stat__icon"><Icon name="Landmark" size={16} /></span>
            <div>
              <span>Capital</span>
              <strong>{capital.name}</strong>
              <small>{developmentOf(capital)} de desenvolvimento</small>
            </div>
          </button>
          <div className="quick-stat">
            <span className="quick-stat__icon"><Icon name="Map" size={16} /></span>
            <div>
              <span>Territórios</span>
              <strong>{tiles.length} <small>/ {capacity} adm.</small></strong>
              <small>{totalDev} de desenvolvimento total</small>
            </div>
          </div>
          <div className="quick-stat">
            <span className="quick-stat__icon"><Icon name="Coins" size={16} /></span>
            <div>
              <span>Saldo de créditos</span>
              <strong className={trendClass(eco.net.creditos)}>{fmtRate(eco.net.creditos)}</strong>
              <small>{fmt(player.stocks.creditos)} em tesouro</small>
            </div>
          </div>
          <div className="quick-stat">
            <span className="quick-stat__icon"><Icon name="Users" size={16} /></span>
            <div>
              <span>População</span>
              <strong>{fmt(eco.pop)}</strong>
              <small>{fmt(eco.jobs)} empregos produtivos</small>
            </div>
          </div>
        </section>

        <section className="card">
          <SectionHeader
            eyebrow="Fluxo nacional"
            title="Balanço de recursos"
            icon="TrendingUp"
            action={<button className="text-button" onClick={() => setView('economy')} type="button">Abrir economia <Icon name="ChevronRight" size={13} /></button>}
          />
          <div className="mini-flow">
            {RESOURCE_KEYS.map((key) => (
              <div className="mini-flow__row" key={key}>
                <span className="mini-flow__icon" style={{ color: RESOURCES[key].color }}><Icon name={RESOURCES[key].icon} size={14} /></span>
                <span className="mini-flow__name">{RESOURCES[key].label}</span>
                <strong>{fmt(player.stocks[key])}</strong>
                <span className={`mini-flow__net ${trendClass(eco.net[key])}`}>{fmtRate(eco.net[key])}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <SectionHeader
            eyebrow="Objetivos de campanha"
            title="Próximos marcos"
            icon="Target"
            action={<button className="text-button" onClick={() => setView('objectives')} type="button">Ver todos <Icon name="ChevronRight" size={13} /></button>}
          />
          <div className="objective-mini-list">
            {pendingObjectives.length ? pendingObjectives.map((objective) => (
              <div className="objective-mini" key={objective.id}>
                <span className="objective-mini__icon"><Icon name={objective.icon} size={15} /></span>
                <div className="objective-mini__body">
                  <div className="objective-mini__top">
                    <strong>{objective.title}</strong>
                    <span>{fmt(objective.progress)}/{fmt(objective.target)}</span>
                  </div>
                  <ProgressBar value={objective.progress} max={objective.target} tone="teal" thin />
                  <small>{objective.description}</small>
                </div>
              </div>
            )) : (
              <div className="complete-banner"><Icon name="Check" size={16} /> Todos os objetivos de campanha foram cumpridos.</div>
            )}
          </div>
        </section>

        <section className="card">
          <SectionHeader
            eyebrow="Corrida pela hegemonia"
            title="Casas da Partilha"
            icon="Crown"
            action={<button className="text-button" onClick={() => setView('objectives')} type="button">Ranking <Icon name="ChevronRight" size={13} /></button>}
          />
          <div className="leader-list">
            {board.map((row, index) => (
              <div className={`leader-row ${row.isPlayer ? 'is-player' : ''}`} key={row.id}>
                <span className="leader-row__rank">{index + 1}</span>
                <span className="leader-row__dot" style={{ background: row.color }} />
                <div className="leader-row__body">
                  <div className="leader-row__top">
                    <strong>{row.name}{row.isPlayer ? ' · você' : ''}</strong>
                    <span>{fmt(row.score)}</span>
                  </div>
                  <ProgressBar value={row.score} max={VICTORY_TARGET} tone={row.isPlayer ? 'teal' : 'neutral'} thin />
                  <small>{row.territories} territórios · {row.techs} tecnologias</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <SectionHeader
            eyebrow="Em andamento"
            title={projects.length ? `${projects.length} projeto${projects.length > 1 ? 's' : ''} ativo${projects.length > 1 ? 's' : ''}` : 'Nenhum projeto ativo'}
            icon="Hammer"
            action={<button className="text-button" onClick={() => setView('construction')} type="button">Gerenciar <Icon name="ChevronRight" size={13} /></button>}
          />
          {projects.length ? (
            <div className="project-mini-list">
              {projects.map((project) => {
                const total = Math.max(1, project.completesCycle - project.startedCycle);
                const elapsed = Math.max(0, game.cycle - project.startedCycle);
                return (
                  <button className="project-mini" key={project.id} onClick={() => selectTile(project.tileId)} type="button">
                    <span className="project-mini__icon"><Icon name={project.kind === 'pesquisa' ? 'FlaskConical' : project.kind === 'expansao' ? 'Target' : project.kind === 'operacao' ? 'Swords' : 'Hammer'} size={15} /></span>
                    <div>
                      <strong>{project.label}</strong>
                      <ProgressBar value={elapsed} max={total} tone="teal" thin />
                      <small>Conclui no ciclo {project.completesCycle} · {Math.max(0, project.completesCycle - game.cycle)} restante(s)</small>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="muted small">Use o painel de obras, ciência ou expansão para iniciar um projeto. Você pode manter {projectSlotsOf(player)} projetos simultâneos com as tecnologias atuais.</p>
          )}
        </section>

        <section className="card">
          <SectionHeader eyebrow="Últimos acontecimentos" title="Crônicas recentes" icon="ScrollText" action={<button className="text-button" onClick={() => setView('chronicle')} type="button">Histórico <Icon name="ChevronRight" size={13} /></button>} />
          <div className="feed">
            {game.log.slice(0, 4).map((entry) => (
              <div className="feed-row" key={entry.id}>
                <span className="feed-row__icon"><Icon name={LOG_ICON[entry.kind]} size={13} /></span>
                <div>
                  <span className="feed-row__meta">Ciclo {entry.cycle} · {entry.kind}</span>
                  <p>{entry.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <SectionHeader eyebrow="Composição da hegemonia" title="De onde vem sua pontuação" icon="Award" />
          <div className="score-breakdown">
            {scoreRows.map((row) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <small>{row.detail}</small>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <div className="panel-actions">
          <button className="button button--ghost" onClick={() => setView('construction')} type="button"><Icon name="Hammer" size={15} /> Obras</button>
          <button className="button button--ghost" onClick={() => setView('tech')} type="button"><Icon name="FlaskConical" size={15} /> Ciência</button>
          <button className="button button--ghost" onClick={() => setView('diplomacy')} type="button"><Icon name="Handshake" size={15} /> Diplomacia</button>
          <button className="button button--primary" onClick={() => selectTile(player.capitalId)} type="button"><Icon name="Landmark" size={15} /> Capital</button>
        </div>

        <div className="ai-houses-note">
          <Badge tone="neutral" icon="Globe2">Rivais ativos</Badge>
          <p>{AI_FACTIONS.map((id) => FACTIONS[id].short).join(' · ')} jogam sob as mesmas regras econômicas e militares.</p>
        </div>
      </div>
    </div>
  );
}
