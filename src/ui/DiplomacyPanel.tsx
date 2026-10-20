import { useMemo, type CSSProperties } from 'react';
import { AI_FACTIONS, FACTIONS } from '../game/constants';
import { getRelation, hasActivePact, offerLabel, proposeCost, relationRequirement, relationStatus } from '../game/diplomacy';
import { scoreOf } from '../game/progress';
import { tilesOfFaction } from '../game/map';
import { GIFT_COST } from '../game/commands';
import type { FactionId } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { fmt } from './format';
import { Icon } from './Icon';
import { Badge, cx, EmptyState, SectionHeader } from './primitives';
import { ViewShell } from './ViewShell';

type TreatyKind = 'trade' | 'nonAggression' | 'alliance' | 'peace';

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

function HouseCard({ id }: { id: FactionId }) {
  const game = useGameStore((s) => s.game)!;
  const gift = useGameStore((s) => s.gift);
  const treaty = useGameStore((s) => s.treaty);
  const war = useGameStore((s) => s.war);
  const requestConfirm = useGameStore((s) => s.requestConfirm);
  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const other = game.factions[id];
  const house = FACTIONS[id];
  const relation = getRelation(game, playerId, id);
  const status = relationStatus(relation);
  const influence = player.stocks.influencia;
  const score = scoreOf(game, id);
  const territories = tilesOfFaction(game.tiles, id).length;
  const canGift = !relation.war && player.stocks.creditos >= GIFT_COST.creditos && influence >= GIFT_COST.influencia && player.lastGiftCycle !== game.cycle;

  const treatyState = (kind: TreatyKind): ActionState => {
    const cost = proposeCost(kind);
    if (influence < cost) return { disabled: true, reason: `Requer ${cost} de influência.` };
    if (kind === 'peace') {
      return relation.war ? { disabled: false, reason: null } : { disabled: true, reason: 'Sem guerra em andamento.' };
    }
    if (relation.war) return { disabled: true, reason: 'Assine a paz antes de propor acordos.' };
    if (kind === 'trade' && relation.trade) return { disabled: true, reason: 'Acordo comercial já ativo.' };
    if (kind === 'nonAggression' && relation.nonAggression) return { disabled: true, reason: 'Pacto de não-agressão já ativo.' };
    if (kind === 'alliance' && relation.alliance) return { disabled: true, reason: 'Aliança já ativa.' };
    const requirement = relationRequirement(kind);
    if (relation.relation < requirement) return { disabled: true, reason: `Requer relações ${requirement}. Atual: ${Math.round(relation.relation)}.` };
    return { disabled: false, reason: null };
  };

  const declareWar = () => {
    requestConfirm({
      title: `Declarar guerra a ${house.short}?`,
      body: `A guerra rompe acordos existentes e derruba as relações. As operações militares só podem começar em territórios adjacentes. ${house.short} tem ${Math.round(other.military)} de poder militar e ${territories} territórios.`,
      confirmLabel: 'Declarar guerra',
      tone: 'danger',
      onConfirm: () => war(id),
    });
  };

  return (
    <article className={cx('house-card', relation.war && 'is-at-war', relation.alliance && 'is-allied')} style={{ '--house': house.color } as CSSProperties}>
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
          <span>Relações diplomáticas</span>
          <strong className={relation.relation >= 0 ? 'tone-teal' : 'tone-red'}>{Math.round(relation.relation)}</strong>
        </div>
        <RelationMeter value={relation.relation} />
      </div>

      <div className="house-card__stats">
        <div><span>Hegemonia</span><strong>{fmt(score)}</strong></div>
        <div><span>Territórios</span><strong>{territories}</strong></div>
        <div><span>Militar</span><strong>{Math.round(other.military)}</strong></div>
        <div><span>Tecnologias</span><strong>{other.techs.length}</strong></div>
      </div>

      <div className="house-card__pacts">
        {relation.war ? <Badge tone="red" icon="Swords">Em guerra</Badge> : null}
        {relation.alliance ? <Badge tone="teal" icon="Handshake">Aliança</Badge> : null}
        {relation.nonAggression ? <Badge tone="blue" icon="Shield">Não-agressão</Badge> : null}
        {relation.trade ? <Badge tone="gold" icon="Coins">Acordo comercial</Badge> : null}
        {!relation.war && !relation.alliance && !relation.nonAggression && !relation.trade ? <Badge tone="neutral" icon="Minus">Sem acordos</Badge> : null}
      </div>

      <div className="house-card__actions">
        <button
          className="button button--tiny button--ghost"
          disabled={!canGift}
          onClick={() => gift(id)}
          title={relation.war ? 'Não é possível presentear em guerra.' : player.lastGiftCycle === game.cycle ? 'Um presente por ciclo.' : `Custo: ${GIFT_COST.creditos} créditos e ${GIFT_COST.influencia} influência.`}
          type="button"
        >
          <Icon name="Gem" size={13} /> Presente
          <span className="button__meta">{GIFT_COST.creditos}c · {GIFT_COST.influencia}inf</span>
        </button>
        <button className="button button--tiny button--ghost" disabled={treatyState('trade').disabled} onClick={() => treaty(id, 'trade')} title={treatyState('trade').reason ?? 'Influência: 4'} type="button">
          <Icon name="Coins" size={13} /> Comércio
        </button>
        <button className="button button--tiny button--ghost" disabled={treatyState('nonAggression').disabled} onClick={() => treaty(id, 'nonAggression')} title={treatyState('nonAggression').reason ?? 'Influência: 7'} type="button">
          <Icon name="Shield" size={13} /> Não-agressão
        </button>
        <button className="button button--tiny button--ghost" disabled={treatyState('alliance').disabled} onClick={() => treaty(id, 'alliance')} title={treatyState('alliance').reason ?? 'Influência: 12'} type="button">
          <Icon name="Handshake" size={13} /> Aliança
        </button>
        {relation.war ? (
          <button className="button button--tiny button--primary" disabled={treatyState('peace').disabled} onClick={() => treaty(id, 'peace')} title={treatyState('peace').reason ?? 'Custa 2 de influência.'} type="button">
            <Icon name="Handshake" size={13} /> Propor paz
          </button>
        ) : (
          <button className="button button--tiny button--danger" onClick={declareWar} type="button">
            <Icon name="Swords" size={13} /> Guerra
          </button>
        )}
      </div>

      <div className="house-card__hints">
        {treatyState('trade').reason && !relation.trade && !relation.war ? <span>{treatyState('trade').reason}</span> : null}
        {relation.trade ? <span className="tone-teal">Acordo comercial rende créditos e influência a cada ciclo.</span> : null}
        {relation.war ? <span className="tone-red">Guerra ativa: operações militares disponíveis em fronteiras.</span> : null}
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
  const wars = relations.filter((relation) => relation.war).length;
  const standing = relations.length ? relations.reduce((sum, relation) => sum + relation.relation, 0) / relations.length : 0;
  const recent = useMemo(
    () => game.log.filter((entry) => entry.kind === 'diplomacia' || entry.kind === 'militar').slice(0, 7),
    [game.log],
  );

  return (
    <ViewShell
      eyebrow="Mesa do Conselho"
      title="Diplomacia entre as Casas"
      subtitle="Relações abrem mercados e protegem fronteiras. Presentes e acordos custam influência e podem ser recusados."
      icon="Handshake"
      actions={<Badge tone="teal" icon="Crown">{fmt(player.stocks.influencia)} de influência</Badge>}
    >
      <div className="summary-grid summary-grid--4">
        <div className="summary-card summary-card--teal">
          <span className="summary-card__label"><Icon name="Crown" size={14} /> Influência disponível</span>
          <strong>{fmt(player.stocks.influencia)}</strong>
          <span className="summary-card__delta">capital político</span>
          <small>Usada em tratados, presentes e expansões.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Handshake" size={14} /> Acordos ativos</span>
          <strong>{pactCount}</strong>
          <span className="summary-card__delta">com {AI_FACTIONS.length} potências</span>
          <small>Objetivo de campanha: 2 casas com acordo.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Swords" size={14} /> Guerras em curso</span>
          <strong className={wars ? 'tone-red' : 'tone-teal'}>{wars}</strong>
          <span className="summary-card__delta">{wars ? 'operações possíveis' : 'fronteiras em paz'}</span>
          <small>Guerra eleva custos e desordem.</small>
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
          <span><strong>Nenhuma proposta pendente</strong><small>As Casas observam suas relações e seus acordos. Elas podem procurar Concórdia quando a confiança aumentar.</small></span>
        </div>
      )}

      <div className="house-grid">
        {AI_FACTIONS.map((id) => <HouseCard id={id} key={id} />)}
      </div>

      <div className="diplomacy-foot">
        <section className="view-card">
          <SectionHeader eyebrow="Registro" title="Últimos movimentos diplomáticos" icon="ScrollText" />
          {recent.length ? (
            <div className="feed">
              {recent.map((entry) => (
                <div className="feed-row" key={entry.id}>
                  <span className="feed-row__icon"><Icon name={entry.kind === 'militar' ? 'Swords' : 'Handshake'} size={13} /></span>
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
            <li><Icon name="Gem" size={13} /> Presentes custam {GIFT_COST.creditos} créditos e {GIFT_COST.influencia} de influência e elevam relações.</li>
            <li><Icon name="Coins" size={13} /> Comércio exige relações 20 e 4 de influência; rende créditos a cada ciclo.</li>
            <li><Icon name="Shield" size={13} /> Não-agressão exige relações 32 e 7 de influência.</li>
            <li><Icon name="Handshake" size={13} /> Aliança exige relações 62 e 12 de influência.</li>
            <li><Icon name="Swords" size={13} /> Guerra custa 5 de influência e rompe todos os acordos.</li>
          </ul>
          <div className="protocol-note">
            <Icon name="Info" size={13} /> Ofertas recebidas expiram; aceitar pode consolidar a paz e liberar receita.
          </div>
        </aside>
      </div>
    </ViewShell>
  );
}
