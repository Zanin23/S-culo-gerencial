import { useMemo } from 'react';
import { AI_FACTIONS, FACTIONS, GAME } from '../game/constants';
import { computeEconomy, developmentOf } from '../game/economy';
import { hasActivePact, getRelation } from '../game/diplomacy';
import { leaderboard, objectivesOf, rankOf, scoreParts, VICTORY_TARGET, victoryInfo } from '../game/progress';
import { tilesOfFaction } from '../game/map';
import { useGameStore } from '../store/gameStore';
import { fmt } from './format';
import { Icon } from './Icon';
import { Badge, ProgressBar, Ring, SectionHeader } from './primitives';
import { ViewShell } from './ViewShell';

export function ObjectivesPanel() {
  const game = useGameStore((s) => s.game)!;
  const setView = useGameStore((s) => s.setView);
  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const faction = FACTIONS[playerId];
  const tiles = tilesOfFaction(game.tiles, playerId);
  const board = useMemo(() => leaderboard(game), [game]);
  const objectives = useMemo(() => objectivesOf(game), [game]);
  const parts = useMemo(() => scoreParts(game, playerId), [game, playerId]);
  const victory = useMemo(() => victoryInfo(game), [game]);
  const eco = useMemo(() => computeEconomy(game, playerId), [game, playerId]);
  const rank = rankOf(victory.playerScore);
  const completedObjectives = objectives.filter((objective) => objective.done).length;
  const totalDev = tiles.reduce((sum, tile) => sum + developmentOf(tile), 0);
  const pacts = Object.keys(game.diplomacy).filter((key) => key.includes(playerId) && hasActivePact(game.diplomacy[key])).length;
  const wars = AI_FACTIONS.filter((id) => getRelation(game, playerId, id).war).length;
  const leaderGap = victory.leader.isPlayer ? 0 : Math.max(0, victory.leader.score - victory.playerScore);

  return (
    <ViewShell
      eyebrow="Painel de metas"
      title="Objetivos e hegemonia"
      subtitle={`A campanha termina quando uma Casa alcança ${VICTORY_TARGET} de hegemonia. Territórios, desenvolvimento, tecnologia e acordos constroem sua pontuação — não apenas exércitos.`}
      icon="Award"
      actions={<Badge tone="gold" icon="Crown">{fmt(victory.playerScore)} de hegemonia</Badge>}
    >
      <div className={`victory-hero ${victory.isLeader ? 'is-leading' : ''}`}>
        <div className="victory-hero__crest">
          <Ring percent={victory.percent} size={132} stroke={7} color="var(--gold)" />
          <div className="victory-hero__crest-inner">
            <span className="crest crest--xl" style={{ borderColor: faction.color, color: faction.color }}>{faction.short.slice(0, 1)}</span>
          </div>
        </div>
        <div className="victory-hero__body">
          <div className="eyebrow">{faction.name} · {rank.name}</div>
          <h2>{victory.isLeader ? 'Concórdia lidera o mundo' : `${victory.leader.name} lidera a corrida`}</h2>
          <p>{rank.note} {victory.rivalClose ? 'A liderança rival está próxima do objetivo — cada ciclo conta.' : 'Use os próximos ciclos para consolidar desenvolvimento, tecnologia e alianças.'}</p>
          <div className="victory-hero__score">
            <strong>{fmt(victory.playerScore)}</strong>
            <span>/ {VICTORY_TARGET} de hegemonia</span>
            {!victory.isLeader ? <Badge tone="red" icon="Target">−{fmt(leaderGap)} para a liderança</Badge> : <Badge tone="teal" icon="Award">1º lugar</Badge>}
          </div>
          <ProgressBar value={victory.playerScore} max={VICTORY_TARGET} tone="gold" />
          <div className="victory-hero__meta">
            <span><Icon name="Map" size={13} /> {tiles.length} territórios</span>
            <span><Icon name="Landmark" size={13} /> {totalDev} desenvolvimento</span>
            <span><Icon name="FlaskConical" size={13} /> {player.techs.length} tecnologias</span>
            <span><Icon name="Handshake" size={13} /> {pacts} acordos</span>
            {wars ? <span className="tone-red"><Icon name="Swords" size={13} /> {wars} guerra(s)</span> : null}
          </div>
        </div>
      </div>

      <div className="summary-grid summary-grid--4">
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Target" size={14} /> Objetivos de campanha</span>
          <strong>{completedObjectives} <small>/ {objectives.length}</small></strong>
          <ProgressBar value={completedObjectives} max={objectives.length} tone="teal" thin />
          <small>Marcos permanentes; não são obrigatórios para vencer.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Award" size={14} /> Sua posição</span>
          <strong>{victory.playerRank}º</strong>
          <span className="summary-card__delta">de {board.length} Casas</span>
          <small>O ranking soma todas as fontes de hegemonia.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Coins" size={14} /> Saldo econômico</span>
          <strong>{fmt(eco.income)} <small>/ {fmt(eco.expenses)}</small></strong>
          <span className="summary-card__delta">receita / manutenção</span>
          <small>{fmt(eco.net.creditos)} de saldo projetado por ciclo.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="SkipForward" size={14} /> Ciclo atual</span>
          <strong>{game.cycle}</strong>
          <span className="summary-card__delta">{game.phase === 'playing' ? 'campanha em curso' : 'campanha encerrada'}</span>
          <small>Semente do mundo: {game.seed}</small>
        </div>
      </div>

      <section className="view-card">
        <SectionHeader eyebrow="Marcos" title="Objetivos da campanha" icon="Target" action={<Badge tone="teal" icon="Check">{completedObjectives} cumpridos</Badge>} />
        <div className="objective-grid">
          {objectives.map((objective) => (
            <article className={`objective-card ${objective.done ? 'is-done' : ''}`} key={objective.id}>
              <div className="objective-card__head">
                <span className="objective-card__icon"><Icon name={objective.icon} size={19} /></span>
                <div>
                  <div className="eyebrow">Objetivo</div>
                  <h3>{objective.title}</h3>
                </div>
                {objective.done ? <Badge tone="teal" icon="Check">Concluído</Badge> : <span className="objective-card__fraction">{fmt(objective.progress)}<small>/{fmt(objective.target)}</small></span>}
              </div>
              <p>{objective.description}</p>
              <ProgressBar value={objective.progress} max={objective.target} tone={objective.done ? 'teal' : 'gold'} thin />
              <div className="objective-card__hint"><Icon name="Info" size={12} /> {objective.hint}</div>
            </article>
          ))}
        </div>
      </section>

      <div className="objectives-layout">
        <section className="view-card">
          <SectionHeader eyebrow="Corrida continental" title="Ranking das Casas" icon="Crown" />
          <div className="ranking-table">
            <div className="ranking-table__head">
              <span>#</span><span>Casa</span><span>Hegemonia</span><span>Territórios</span><span>Tecnologias</span><span>Militar</span>
            </div>
            {board.map((row, index) => (
              <div className={`ranking-row ${row.isPlayer ? 'is-player' : ''}`} key={row.id}>
                <span className="ranking-row__rank">{index === 0 ? <Icon name="Crown" size={14} /> : index + 1}</span>
                <span className="ranking-row__house"><i style={{ background: row.color }} />{row.name}{row.isPlayer ? <Badge tone="teal">você</Badge> : null}</span>
                <span className="ranking-row__score">
                  <strong>{fmt(row.score)}</strong>
                  <ProgressBar value={row.score} max={VICTORY_TARGET} tone={row.isPlayer ? 'teal' : 'neutral'} thin />
                </span>
                <span>{row.territories}</span>
                <span>{row.techs}</span>
                <span>{Math.round(row.military)}</span>
              </div>
            ))}
          </div>
          <div className="ranking-note">
            <Icon name="Info" size={13} />
            A IA joga com as mesmas regras de custo, produção e expansão. Nenhuma Casa recebe recursos ou ações fora das regras.
          </div>
        </section>

        <aside className="view-card">
          <SectionHeader eyebrow="Composição" title="Sua pontuação" icon="Award" />
          <div className="score-list">
            {parts.map((part) => (
              <div className="score-row" key={part.label}>
                <span>{part.label}<small>{part.detail}</small></span>
                <strong>{part.value}</strong>
              </div>
            ))}
          </div>
          <div className="score-total">
            <span>Total</span>
            <strong>{fmt(victory.playerScore)}</strong>
          </div>
          <p className="table-note">A pontuação é recalculada a cada ciclo. Estoques de créditos e influência têm teto de contribuição para evitar inatividade lucrativa.</p>
        </aside>
      </div>

      <div className="objectives-layout">
        <section className="view-card">
          <SectionHeader eyebrow="Condições" title="Como a campanha termina" icon="Info" />
          <div className="endgame-rules">
            <div className="endgame-rule is-victory">
              <span><Icon name="Award" size={18} /></span>
              <div><strong>Vitória de Concórdia</strong><p>Alcance {VICTORY_TARGET} de hegemonia antes das Casas rivais.</p></div>
            </div>
            <div className="endgame-rule is-defeat">
              <span><Icon name="AlertTriangle" size={18} /></span>
              <div><strong>Derrota</strong><p>Uma Casa rival alcança {VICTORY_TARGET} ou Concórdia perde todos os territórios.</p></div>
            </div>
            <div className="endgame-rule">
              <span><Icon name="Swords" size={18} /></span>
              <div><strong>Eliminação</strong><p>Capitais ocupadas são transferidas e Casas sem territórios saem do jogo.</p></div>
            </div>
            <div className="endgame-rule">
              <span><Icon name="ScrollText" size={18} /></span>
              <div><strong>Registro</strong><p>Cada decisão, batalha e evento fica nas crônicas da campanha.</p></div>
            </div>
          </div>
        </section>

        <aside className="view-card">
          <SectionHeader eyebrow="Ações rápidas" title="Próximos passos" icon="Compass" />
          <div className="quick-links">
            <button className="quick-link" onClick={() => setView('construction')} type="button"><Icon name="Hammer" size={16} /><span>Desenvolver territórios</span><Icon name="ChevronRight" size={14} /></button>
            <button className="quick-link" onClick={() => setView('tech')} type="button"><Icon name="FlaskConical" size={16} /><span>Pesquisar tecnologias</span><Icon name="ChevronRight" size={14} /></button>
            <button className="quick-link" onClick={() => setView('expansion')} type="button"><Icon name="Target" size={16} /><span>Reivindicar fronteiras</span><Icon name="ChevronRight" size={14} /></button>
            <button className="quick-link" onClick={() => setView('diplomacy')} type="button"><Icon name="Handshake" size={16} /><span>Negociar acordos</span><Icon name="ChevronRight" size={14} /></button>
            <button className="quick-link" onClick={() => setView('economy')} type="button"><Icon name="Coins" size={16} /><span>Vender excedentes</span><Icon name="ChevronRight" size={14} /></button>
          </div>
          <div className="seed-note">
            <Icon name="Globe2" size={13} /> {GAME.world} · build {GAME.version}.0
          </div>
        </aside>
      </div>
    </ViewShell>
  );
}
