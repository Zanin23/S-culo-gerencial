import { useMemo, type CSSProperties } from 'react';
import { AI_FACTIONS, FACTIONS, RESOURCE_VALUE } from '../game/constants';
import { getRelation, hasActivePact, offerLabel, proposeCost, relationRequirement, relationStatus } from '../game/diplomacy';
import { scoreOf } from '../game/progress';
import { tilesOfFaction } from '../game/map';
import { GIFT_COST } from '../game/commands';
import type { FactionId } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { fmt, money } from './format';
import { Icon } from './Icon';
import { Badge, cx, EmptyState, SectionHeader } from './primitives';
import { ViewShell } from './ViewShell';

type TreatyKind = 'trade' | 'nonAggression' | 'alliance';

interface ActionState {
  disabled: boolean;
  reason: string | null;
}

function RelationMeter({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <div className="relation-meter" title={`Relações: ${Math.round(value)} de 100`}>
      <div className="relation-meter__center" />
      <div
        className={cx('relation-meter__fill', positive ? 'is-positive' : 'is-negative')}
        style={{ width: `${Math.min(50, Math.abs(value) / 2)}%`, [positive ? 'left' : 'right']: '50%' }}
      />
      <span className="relation-meter__marker" style={{ left: `${50 + value / 2}%` }} />
      <div className="relation-meter__labels">
        <span>−100</span><span>0</span><span>+100</span>
      </div>
    </div>
  );
}

function CompanyCard({ id }: { id: FactionId }) {
  const game = useGameStore((s) => s.game)!;
  const gift = useGameStore((s) => s.gift);
  const treaty = useGameStore((s) => s.treaty);
  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const other = game.factions[id];
  const house = FACTIONS[id];
  const relation = getRelation(game, playerId, id);
  const status = relationStatus(relation);
  const score = scoreOf(game, id);
  const territories = tilesOfFaction(game.tiles, id).length;
  const operations = game.operations.filter((op) => op.factionId === id).length;
  const canGift = player.stocks.creditos >= GIFT_COST.creditos && player.lastGiftCycle !== game.cycle;

  const treatyCost = (kind: TreatyKind) => Math.round(proposeCost(kind) * RESOURCE_VALUE.influencia);

  const treatyState = (kind: TreatyKind): ActionState => {
    const cost = treatyCost(kind);
    if (player.stocks.creditos < cost) return { disabled: true, reason: `Requer ${money(cost)} em caixa.` };
    if (kind === 'trade' && relation.trade) return { disabled: true, reason: 'Acordo comercial já ativo.' };
    if (kind === 'nonAggression' && relation.nonAggression) return { disabled: true, reason: 'Pacto de não concorrência já ativo.' };
    if (kind === 'alliance' && relation.alliance) return { disabled: true, reason: 'Parceria estratégica já ativa.' };
    const requirement = relationRequirement(kind);
    if (relation.relation < requirement) return { disabled: true, reason: `Requer relações ${requirement}. Atual: ${Math.round(relation.relation)}.` };
    return { disabled: false, reason: null };
  };

  return (
    <article className={cx('house-card', relation.alliance && 'is-allied')} style={{ '--house': house.color } as CSSProperties}>
      <div className="house-card__head">
        <span className="crest crest--lg" style={{ borderColor: house.color, color: house.color }}>{house.short.slice(0, 1)}</span>
        <div className="house-card__identity">
          <div className="eyebrow">{house.epithet}</div>
          <h3>{house.name}</h3>
          <span>{house.leader}</span>
        </div>
        <Badge tone={status.tone === 'good' ? 'teal' : status.tone === 'warm' ? 'gold' : status.tone === 'bad' ? 'red' : 'neutral'}>{status.label}</Badge>
      </div>

      <p className="house-card__doctrine">{house.description}</p>

      <div className="relation-block">
        <div className="relation-block__top">
          <span>Relações comerciais</span>
          <strong className={relation.relation >= 0 ? 'tone-teal' : 'tone-red'}>{Math.round(relation.relation)}</strong>
        </div>
        <RelationMeter value={relation.relation} />
      </div>

      <div className="house-card__stats">
        <div><span>Relevância</span><strong>{fmt(score)}</strong></div>
        <div><span>Praças</span><strong>{territories}</strong></div>
        <div><span>Unidades</span><strong>{operations}</strong></div>
        <div><span>Tecnologias</span><strong>{other.techs.length}</strong></div>
      </div>

      <div className="house-card__pacts">
        {relation.alliance ? <Badge tone="teal" icon="Handshake">Parceria estratégica</Badge> : null}
        {relation.nonAggression ? <Badge tone="blue" icon="Shield">Trégua de concorrência</Badge> : null}
        {relation.trade ? <Badge tone="gold" icon="Coins">Acordo comercial</Badge> : null}
        {!relation.alliance && !relation.nonAggression && !relation.trade ? <Badge tone="neutral" icon="Minus">Sem acordos</Badge> : null}
      </div>

      <div className="house-card__actions">
        <button
          className="button button--tiny button--ghost"
          disabled={!canGift}
          onClick={() => gift(id)}
          title={player.lastGiftCycle === game.cycle ? 'Um presente por ciclo.' : `Custo: ${money(GIFT_COST.creditos)} em presentes.`}
          type="button"
        >
          <Icon name="Gem" size={13} /> Presente
          <span className="button__meta">{money(GIFT_COST.creditos)}</span>
        </button>
        <button className="button button--tiny button--ghost" disabled={treatyState('trade').disabled} onClick={() => treaty(id, 'trade')} title={treatyState('trade').reason ?? `Custo: ${money(treatyCost('trade'))}`} type="button">
          <Icon name="Coins" size={13} /> Comércio
        </button>
        <button className="button button--tiny button--ghost" disabled={treatyState('nonAggression').disabled} onClick={() => treaty(id, 'nonAggression')} title={treatyState('nonAggression').reason ?? `Custo: ${money(treatyCost('nonAggression'))}`} type="button">
          <Icon name="Shield" size={13} /> Não concorrência
        </button>
        <button className="button button--tiny button--ghost" disabled={treatyState('alliance').disabled} onClick={() => treaty(id, 'alliance')} title={treatyState('alliance').reason ?? `Custo: ${money(treatyCost('alliance'))}`} type="button">
          <Icon name="Handshake" size={13} /> Parceria
        </button>
      </div>

      <div className="house-card__hints">
        {treatyState('trade').reason && !relation.trade ? <span>{treatyState('trade').reason}</span> : null}
        {relation.trade ? <span className="tone-teal">Acordo comercial rende créditos e relações a cada ciclo.</span> : null}
        {relation.alliance ? <span className="tone-teal">Parceria estratégica: receita extra e estabilidade.</span> : null}
      </div>
    </article>
  );
}

export function DiplomacyPanel() {
  const game = useGameStore((s) => s.game)!;
  const answerOffer = useGameStore((s) => s.answerOffer);
  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const offers = game.offers.filter((offer) => offer.to === playerId);
  const relations = AI_FACTIONS.map((id) => getRelation(game, playerId, id));
  const pactCount = relations.filter(hasActivePact).length;
  const rivalOperations = game.operations.filter((op) => op.factionId !== playerId).length;
  const standing = relations.length ? relations.reduce((sum, relation) => sum + relation.relation, 0) / relations.length : 0;
  const recent = useMemo(
    () => game.log.filter((entry) => entry.kind === 'diplomacia' || entry.kind === 'operacoes').slice(0, 7),
    [game.log],
  );

  return (
    <ViewShell
      eyebrow="Mesa de relações"
      title="Acordos entre companhias"
      subtitle="Relações abrem mercados e sustentam a operação. Presentes e acordos custam caixa e podem ser recusados."
      icon="Handshake"
      actions={<Badge tone="teal" icon="Handshake">{money(player.stocks.creditos)} em caixa</Badge>}
    >
      <div className="summary-grid summary-grid--4">
        <div className="summary-card summary-card--teal">
          <span className="summary-card__label"><Icon name="Coins" size={14} /> Caixa para acordos</span>
          <strong>{money(player.stocks.creditos)}</strong>
          <span className="summary-card__delta">caixa para presentes e acordos</span>
          <small>Presentes e propostas são pagos em dinheiro.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Handshake" size={14} /> Acordos ativos</span>
          <strong>{pactCount}</strong>
          <span className="summary-card__delta">com {AI_FACTIONS.length} companhias</span>
          <small>Objetivo de campanha: 2 acordos ativos.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Store" size={14} /> Unidades rivais</span>
          <strong>{rivalOperations}</strong>
          <span className="summary-card__delta">disputando mercado</span>
          <small>Mais unidades rivais = menos participação por cidade.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Scale" size={14} /> Reputação média</span>
          <strong className={standing >= 0 ? 'tone-teal' : 'tone-red'}>{Math.round(standing)}</strong>
          <span className="summary-card__delta">de −100 a +100</span>
          <small>Acordos são mais fáceis com relações altas.</small>
        </div>
      </div>

      {offers.length ? (
        <section className="view-card offers-card">
          <SectionHeader eyebrow="Aguardando resposta" title={`${offers.length} proposta${offers.length > 1 ? 's' : ''} na mesa`} icon="Bell" action={<Badge tone="gold">expira em até 3 ciclos</Badge>} />
          <div className="offer-list">
            {offers.map((offer) => {
              const house = FACTIONS[offer.from];
              return (
                <div className="offer-row" key={offer.id}>
                  <span className="crest" style={{ borderColor: house.color, color: house.color }}>{house.short.slice(0, 1)}</span>
                  <div className="offer-row__body">
                    <strong>{house.short} propõe {offerLabel(offer.kind).toLowerCase()}</strong>
                    <span>{house.leader} aguarda uma resposta. Expira no ciclo {offer.expiresCycle}.</span>
                  </div>
                  <button className="button button--tiny button--primary" onClick={() => answerOffer(offer.id, true)} type="button"><Icon name="Check" size={12} /> Aceitar</button>
                  <button className="button button--tiny button--ghost" onClick={() => answerOffer(offer.id, false)} type="button"><Icon name="X" size={12} /> Recusar</button>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="callout callout--neutral">
          <Icon name="Bell" size={16} />
          <span><strong>Nenhuma proposta pendente</strong><small>As companhias observam suas relações e seus acordos. Elas podem procurar Concórdia quando a confiança aumentar.</small></span>
        </div>
      )}

      <div className="house-grid">
        {AI_FACTIONS.map((id) => <CompanyCard id={id} key={id} />)}
      </div>

      <div className="diplomacy-foot">
        <section className="view-card">
          <SectionHeader eyebrow="Registro" title="Últimos movimentos diplomáticos" icon="ScrollText" />
          {recent.length ? (
            <div className="feed">
              {recent.map((entry) => (
                <div className="feed-row" key={entry.id}>
                  <span className="feed-row__icon"><Icon name={entry.kind === 'operacoes' ? 'Store' : 'Handshake'} size={13} /></span>
                  <div>
                    <span className="feed-row__meta">Ciclo {entry.cycle} · {entry.kind}</span>
                    <p>{entry.text}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState icon="ScrollText" title="Nenhum movimento registrado">Presentes e propostas aparecerão aqui.</EmptyState>}
        </section>
        <aside className="view-card">
          <SectionHeader eyebrow="Protocolo" title="Como negociar" icon="Info" />
          <ul className="benefit-list">
            <li><Icon name="Gem" size={13} /> Presentes custam {money(GIFT_COST.creditos)} e elevam o relacionamento.</li>
            <li><Icon name="Coins" size={13} /> Acordo comercial exige relações 20 e {money(Math.round(proposeCost('trade') * RESOURCE_VALUE.influencia))}; rende caixa a cada ciclo.</li>
            <li><Icon name="Shield" size={13} /> Trégua de concorrência exige relações 32 e {money(Math.round(proposeCost('nonAggression') * RESOURCE_VALUE.influencia))}.</li>
            <li><Icon name="Handshake" size={13} /> Parceria estratégica exige relações 62 e {money(Math.round(proposeCost('alliance') * RESOURCE_VALUE.influencia))}.</li>
            <li><Icon name="Store" size={13} /> Unidades rivais disputam participação nas mesmas cidades.</li>
          </ul>
          <div className="protocol-note">
            <Icon name="Info" size={13} /> Ofertas recebidas expiram; aceitar pode consolidar a parceria e liberar receita.
          </div>
        </aside>
      </div>
    </ViewShell>
  );
}
