import { useMemo, useState } from 'react';
import {
  BUILDINGS,
  BUILDING_ORDER,
  FACTIONS,
  NODES,
  RESOURCES,
  RESOURCE_KEYS,
  TECH_BRANCHES,
  TECHS,
  TERRAIN,
} from '../game/constants';
import {
  adminCapacityOfState,
  defenseOf,
  developmentOf,
  hasTech,
  jobsOf,
  projectSlotsOf,
  slotsOf,
  techEffects,
  territoryProduction,
  usedSlots,
} from '../game/economy';
import { getRelation, relationStatus } from '../game/diplomacy';
import { battleEstimate } from '../game/cycle';
import { neighborsOf, tilesOfFaction } from '../game/map';
import {
  canBuild,
  expansionPreview,
  militaryCap,
  operationCost,
  RECRUIT_BATCH,
  RECRUIT_COST,
} from '../game/commands';
import type { BuildingKey, FactionId, GameState, Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { fmt, fmtRate, trendClass } from './format';
import { Icon } from './Icon';
import { Badge, Cost, cx, EmptyState, LevelPips, ProgressBar, SectionHeader } from './primitives';

type Tab = 'resumo' | 'estruturas' | 'acoes';

function FlowRow({
  resource,
  production,
  consumption,
  stocks,
}: {
  resource: keyof typeof RESOURCES;
  production: number;
  consumption: number;
  stocks?: number;
}) {
  const net = production - consumption;
  if (Math.abs(production) < 0.05 && Math.abs(consumption) < 0.05 && !stocks) return null;
  return (
    <div className="flow-row">
      <span className="flow-row__icon" style={{ color: RESOURCES[resource].color }}><Icon name={RESOURCES[resource].icon} size={14} /></span>
      <span className="flow-row__name">{RESOURCES[resource].label}</span>
      <span className="flow-row__prod">+{fmt(production)}</span>
      <span className="flow-row__cons">−{fmt(consumption)}</span>
      <span className={cx('flow-row__net', trendClass(net))}>{fmtRate(net)}</span>
    </div>
  );
}

export function ClaimCard({ tile, game, compact = false }: { tile: Tile; game: GameState; compact?: boolean }) {
  const playerId = game.playerFactionId;
  const expand = useGameStore((s) => s.expand);
  const projectCount = game.projects.filter((p) => p.factionId === playerId).length;
  const ownTiles = tilesOfFaction(game.tiles, playerId).length;
  const reserved = ownTiles + game.projects.filter((p) => p.factionId === playerId && p.kind === 'expansao').length;
  const capacity = adminCapacityOfState(game, playerId);
  const player = game.factions[playerId];
  const preview = expansionPreview(game, playerId, tile);
  const inProgress = game.projects.some((p) => p.kind === 'expansao' && p.tileId === tile.id);

  const reasons: string[] = [];
  if (preview.owned) reasons.push('O território já tem soberano.');
  if (!preview.adjacent) reasons.push('Nenhum território seu é adjacente.');
  if (preview.adjacent && preview.dev < preview.required) reasons.push(`Desenvolvimento insuficiente na base (${preview.dev}/${preview.required}).`);
  if (reserved >= capacity) reasons.push(`Capacidade administrativa esgotada (${reserved}/${capacity}).`);
  if (projectCount >= projectSlotsOf(player)) reasons.push('Sem vagas de projeto disponíveis.');
  if (inProgress) reasons.push('Expedição já em andamento.');
  for (const [key, value] of Object.entries(preview.cost) as Array<[keyof typeof player.stocks, number]>) {
    if (player.stocks[key] + 1e-9 < value) reasons.push(`Faltam ${RESOURCES[key].short}.`);
  }

  const disabled = reasons.length > 0;
  return (
    <div className={cx('claim-card', compact && 'claim-card--compact')}>
      <div className="claim-card__head">
        <div>
          <div className="claim-card__eyebrow">{TERRAIN[tile.terrain].name} · {NODES[tile.node].name}</div>
          <strong>{tile.name}</strong>
          <div className="claim-card__tags">
            <Badge tone="teal" icon="Target">Valor {tile.strategic}/3</Badge>
            <Badge tone="neutral" icon="Users">{Math.round(tile.pop)} pop</Badge>
            {tile.buildings.defesa ? <Badge tone="red" icon="Shield">Defesa {tile.buildings.defesa}</Badge> : null}
          </div>
        </div>
        <span className="claim-card__dev">{preview.dev}<small>base</small></span>
      </div>
      <div className="claim-card__meta">
        <Cost cost={preview.cost} stocks={player.stocks} />
        <span className={cx('claim-card__req', preview.dev >= preview.required ? 'is-ok' : 'is-bad')}>
          <Icon name={preview.dev >= preview.required ? 'Check' : 'AlertTriangle'} size={12} />
          Exige {preview.required} dev. na base
        </span>
      </div>
      {preview.anchor ? <div className="claim-card__anchor"><Icon name="Map" size={12} /> Base: {preview.anchor.name} ({preview.dev} dev.)</div> : null}
      {reasons.length ? <div className="disabled-note">{reasons[0]}</div> : null}
      <button
        className="button button--primary button--block"
        disabled={disabled}
        onClick={() => expand(tile.id)}
        type="button"
      >
        <Icon name="Target" size={14} />
        {inProgress ? 'Expedição em andamento' : 'Preparar expedição'}
        <span className="button__meta">2 ciclos</span>
      </button>
    </div>
  );
}

function AttackCard({ tile, game }: { tile: Tile; game: GameState }) {
  const playerId = game.playerFactionId;
  const attack = useGameStore((s) => s.attack);
  const requestConfirm = useGameStore((s) => s.requestConfirm);
  const war = useGameStore((s) => s.war);
  const player = game.factions[playerId];
  const owner = tile.owner!;
  const relation = getRelation(game, playerId, owner);
  const estimate = battleEstimate(game, playerId, tile.id);
  const cost = operationCost(game, playerId, tile);
  const projectCount = game.projects.filter((p) => p.factionId === playerId).length;
  const inProgress = game.projects.some((p) => p.kind === 'operacao' && p.tileId === tile.id);
  const missing = (Object.entries(cost) as Array<[keyof typeof player.stocks, number]>).filter(([key, value]) => player.stocks[key] < value);
  const adjacency = estimate?.adjacent ?? false;
  const disabled = !relation.war || !adjacency || player.military < 25 || projectCount >= projectSlotsOf(player) || missing.length > 0 || inProgress;

  const declare = () => {
    requestConfirm({
      title: `Declarar guerra a ${FACTIONS[owner].short}?`,
      body: `A guerra rompe acordos, custa 5 de influência e abre caminho para operações militares. Relações cairão drasticamente. ${FACTIONS[owner].short} tem ${Math.round(game.factions[owner].military)} de poder militar.`,
      confirmLabel: 'Declarar guerra',
      tone: 'danger',
      onConfirm: () => war(owner),
    });
  };

  return (
    <div className="attack-card">
      <div className="attack-card__head">
        <div>
          <div className="eyebrow">Território estrangeiro</div>
          <strong>{tile.name}</strong>
          <span>{FACTIONS[owner].short} · {relationStatus(relation).label}</span>
        </div>
        <span className="crest" style={{ borderColor: FACTIONS[owner].color, color: FACTIONS[owner].color }}>{FACTIONS[owner].short.slice(0, 1)}</span>
      </div>
      <div className="battle-bar">
        <div>
          <span>Seu poder</span>
          <strong>{estimate?.attackerStrength ?? 0}</strong>
        </div>
        <div className="battle-bar__odds">
          <span>Chance estimada</span>
          <strong>{estimate?.chance ?? 0}%</strong>
        </div>
        <div>
          <span>Defesa</span>
          <strong>{estimate?.defenderStrength ?? 0}</strong>
        </div>
      </div>
      <div className="attack-card__cost">
        <span className="muted small">Custo da operação</span>
        <Cost cost={cost} stocks={player.stocks} />
      </div>
      {!relation.war ? (
        <button className="button button--danger button--block" onClick={declare} type="button">
          <Icon name="Swords" size={14} /> Declarar guerra
        </button>
      ) : (
        <button className="button button--danger button--block" onClick={() => attack(tile.id)} disabled={disabled} type="button">
          <Icon name="Swords" size={14} />
          {inProgress ? 'Operação em andamento' : 'Preparar operação'}
          <span className="button__meta">2 ciclos</span>
        </button>
      )}
      {!adjacency ? <div className="disabled-note">A operação exige um território seu adjacente.</div> : null}
      {relation.war && missing.length ? <div className="disabled-note">Faltam recursos para a operação.</div> : null}
    </div>
  );
}

function BuildRow({ tile, game, building }: { tile: Tile; game: GameState; building: BuildingKey }) {
  const build = useGameStore((s) => s.build);
  const playerId = game.playerFactionId;
  const def = BUILDINGS[building];
  const check = canBuild(game, playerId, tile, building);
  const level = tile.buildings[building];
  const project = game.projects.find((p) => p.tileId === tile.id && p.building === building);
  const next = Math.min(3, level + 1);
  const nextSpec = def.levels[next - 1];
  const techRequired = def.techUnlock?.[next];
  const bonusText = def.terrainBonus
    ? def.terrainBonus.nodes?.includes(tile.node) || def.terrainBonus.terrains?.includes(tile.terrain)
      ? `Bônus local ativo (+${Math.round(def.terrainBonus.multiplier * 100)}% ${RESOURCES[def.terrainBonus.resource].short})`
      : `Bônus local: ${def.terrainBonus.terrains?.map((t) => TERRAIN[t].name).join('/') ?? ''}${def.terrainBonus.nodes?.length ? ` · ${def.terrainBonus.nodes.map((n) => NODES[n].name).join('/')}` : ''}`
    : null;

  return (
    <div className={cx('build-row', project && 'is-building', !check.ok && 'is-locked')}>
      <span className="build-row__icon" style={{ color: def.accent }}><Icon name={def.icon} size={17} /></span>
      <div className="build-row__body">
        <div className="build-row__top">
          <strong>{def.short}</strong>
          <LevelPips level={level} />
          <span className="build-row__category">{def.category}</span>
        </div>
        <p>{def.effect}</p>
        {bonusText ? <small className={cx('build-row__bonus', (def.terrainBonus?.nodes?.includes(tile.node) || def.terrainBonus?.terrains?.includes(tile.terrain)) && 'is-active')}>{bonusText}</small> : null}
        {techRequired && !hasTech(game.factions[playerId], techRequired) ? (
          <small className="build-row__tech"><Icon name="Lock" size={11} /> Nível {next}: {TECHS[techRequired].name}</small>
        ) : null}
        {project ? (
          <div className="build-row__progress">
            <ProgressBar value={Math.max(0, game.cycle - project.startedCycle)} max={Math.max(1, project.completesCycle - project.startedCycle)} tone="teal" thin />
            <small>Nível {project.targetLevel} · conclui no ciclo {project.completesCycle}</small>
          </div>
        ) : level < 3 ? (
          <div className="build-row__action">
            <Cost cost={nextSpec.cost} stocks={game.factions[playerId].stocks} compact />
            <span className="build-row__cycles"><Icon name="SkipForward" size={11} /> {nextSpec.cycles}c</span>
            <button className="button button--tiny button--primary" disabled={!check.ok} onClick={() => build(tile.id, building)} type="button">
              {level === 0 ? 'Construir' : 'Melhorar'}
            </button>
          </div>
        ) : (
          <small className="build-row__max"><Icon name="Check" size={11} /> Nível máximo</small>
        )}
        {!check.ok && !project && check.reason && level < 3 ? <div className="build-row__reason">{check.reason}</div> : null}
      </div>
    </div>
  );
}

export function TerritoryPanel() {
  const game = useGameStore((s) => s.game)!;
  const selectedTileId = useGameStore((s) => s.selectedTileId);
  const selectTile = useGameStore((s) => s.selectTile);
  const setView = useGameStore((s) => s.setView);
  const enlist = useGameStore((s) => s.enlist);
  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const [tab, setTab] = useState<Tab>('resumo');

  const tile = selectedTileId ? game.tiles[selectedTileId] : null;
  if (!tile) return null;

  const owner = tile.owner ? FACTIONS[tile.owner] : null;
  const isOwn = tile.owner === playerId;
  const isNeutral = tile.owner === null;
  const ownerFaction = tile.owner ? game.factions[tile.owner] : null;
  const relation = tile.owner && tile.owner !== playerId ? getRelation(game, playerId, tile.owner) : null;
  const dev = developmentOf(tile);
  const slots = slotsOf(tile, ownerFaction ?? player);
  const used = usedSlots(tile);
  const jobs = jobsOf(tile);
  const prod = ownerFaction ? territoryProduction(game, tile, ownerFaction) : null;
  const capital = tile.isCapital;
  const tileProjects = game.projects.filter((p) => p.tileId === tile.id);
  const neighbors = neighborsOf(tile, game.tiles);
  const neutralNeighbors = neighbors.filter((n) => n.owner === null);
  const enemyNeighbors = neighbors.filter((n) => n.owner && n.owner !== playerId);
  const military = player.military;
  const cap = militaryCap(game, playerId);
  const canRecruit = player.stocks.creditos >= RECRUIT_COST.creditos && player.stocks.bens >= RECRUIT_COST.bens && player.stocks.influencia >= RECRUIT_COST.influencia && military + RECRUIT_BATCH <= cap;
  const popCap = 10 + dev * 0.85 + (capital ? 8 : 0);

  const resourceRows = useMemo(() => {
    if (!prod) return [];
    const production = RESOURCE_KEYS.reduce((acc, key) => {
      acc[key] = prod.base[key] + prod.nodes[key] + prod.buildings[key];
      return acc;
    }, {} as typeof prod.base);
    production.creditos += prod.commerceBase;
    return RESOURCE_KEYS.map((key) => ({
      key,
      production: production[key],
      consumption: prod.consumption[key] + (key === 'creditos' ? prod.upkeep : 0),
    })).filter((row) => Math.abs(row.production) > 0.05 || Math.abs(row.consumption) > 0.05);
  }, [prod]);

  const strategicText = tile.strategic === 3 ? 'Coração estratégico do Cinturão' : tile.strategic === 2 ? 'Posição estratégica relevante' : 'Posição comum';

  const relationBadge = relation ? relationStatus(relation) : null;

  return (
    <div className="context-panel">
      <header className="context-head context-head--tile">
        <div className="context-head__main">
          <div className="eyebrow">
            {owner ? owner.name : 'Território livre'}
            {capital ? ' · Capital' : ''}
            {relation ? ` · ${relationBadge?.label}` : ''}
          </div>
          <h2>{tile.name}</h2>
          <div className="tile-subline">
            <span>{TERRAIN[tile.terrain].name}</span>
            <span className="tile-subline__sep">·</span>
            <span>{NODES[tile.node].name}</span>
            <span className="tile-subline__sep">·</span>
            <span>{tile.strategic}/3 estratégico</span>
          </div>
        </div>
        {owner ? (
          <button className="crest" style={{ borderColor: owner.color, color: owner.color }} onClick={() => setView('diplomacy')} title={`Abrir diplomacia · ${owner.name}`} type="button">
            {owner.short.slice(0, 1)}
          </button>
        ) : (
          <span className="crest crest--neutral"><Icon name="Compass" size={18} /></span>
        )}
      </header>

      <div className="tile-strip">
        <span className={cx('tile-status', isOwn && 'is-own', relation?.war && 'is-war')}>
          <i /> {isOwn ? 'Sob seu controle' : isNeutral ? 'Sem soberano' : relation?.war ? 'Território inimigo' : 'Território estrangeiro'}
        </span>
        <span className="tile-strip__dev">{dev} <small>dev.</small></span>
        <button className="text-button text-button--small" onClick={() => selectTile(null)} type="button">
          Painel da nação <Icon name="ChevronRight" size={12} />
        </button>
      </div>

      <div className="context-tabs" role="tablist">
        <button className={cx('context-tab', tab === 'resumo' && 'is-active')} onClick={() => setTab('resumo')} type="button" role="tab" aria-selected={tab === 'resumo'}>
          <Icon name="ScrollText" size={14} /> Resumo
        </button>
        <button className={cx('context-tab', tab === 'estruturas' && 'is-active')} onClick={() => setTab('estruturas')} type="button" role="tab" aria-selected={tab === 'estruturas'}>
          <Icon name="Hammer" size={14} /> Estruturas {isOwn ? <span className="tab-count">{used}/{slots}</span> : null}
        </button>
        <button className={cx('context-tab', tab === 'acoes' && 'is-active')} onClick={() => setTab('acoes')} type="button" role="tab" aria-selected={tab === 'acoes'}>
          <Icon name="Swords" size={14} /> Ações
        </button>
      </div>

      <div className="context-scroll">
        {tab === 'resumo' ? (
          <>
            {isOwn ? (
              <section className="tile-actions-row">
                <button className="button button--ghost button--small" onClick={() => setTab('estruturas')} type="button"><Icon name="Hammer" size={14} /> Construir</button>
                <button className="button button--ghost button--small" onClick={() => setTab('acoes')} type="button"><Icon name="Target" size={14} /> Expandir</button>
                <button className="button button--ghost button--small" onClick={() => setView('diplomacy')} type="button"><Icon name="Handshake" size={14} /> Negociar</button>
              </section>
            ) : null}

            <section className="stat-grid">
              <div className="tile-stat">
                <span><Icon name="Users" size={13} /> População</span>
                <strong>{fmt(tile.pop)} <small>/ {fmt(popCap)}</small></strong>
                <ProgressBar value={tile.pop} max={popCap} tone="blue" thin />
              </div>
              <div className="tile-stat">
                <span><Icon name="Landmark" size={13} /> Desenvolvimento</span>
                <strong>{dev} <small>/ 100</small></strong>
                <ProgressBar value={dev} max={100} tone="teal" thin />
              </div>
              <div className="tile-stat">
                <span><Icon name="Hammer" size={13} /> Espaços</span>
                <strong>{used} <small>/ {slots}</small></strong>
                <ProgressBar value={used} max={slots} tone="gold" thin />
              </div>
              <div className="tile-stat">
                <span><Icon name="Shield" size={13} /> Defesa</span>
                <strong>{defenseOf(game, tile)}</strong>
                <small>{tile.buildings.defesa ? `${tile.buildings.defesa} nível(is) de instalações` : 'Sem instalações'}</small>
              </div>
              <div className="tile-stat">
                <span><Icon name="AlertTriangle" size={13} /> Desordem</span>
                <strong className={tile.unrest >= 50 ? 'tone-red' : tile.unrest >= 25 ? 'tone-gold' : 'tone-teal'}>{Math.round(tile.unrest)}%</strong>
                <ProgressBar value={tile.unrest} max={100} tone={tile.unrest >= 50 ? 'red' : 'gold'} thin />
              </div>
              <div className="tile-stat">
                <span><Icon name="Wrench" size={13} /> Mão de obra</span>
                <strong>{jobs} <small>postos</small></strong>
                <small>{tile.pop >= jobs ? 'Força de trabalho suficiente' : 'Déficit de trabalhadores'}</small>
              </div>
            </section>

            <section className="card">
              <SectionHeader eyebrow="Economia local" title="Produção territorial" icon="Coins" action={<Badge tone="neutral">{owner ? owner.short : 'Sem dono'}</Badge>} />
              {resourceRows.length ? (
                <>
                  <div className="flow-table flow-table--head">
                    <span />
                    <span>Recurso</span>
                    <span>Produção</span>
                    <span>Consumo</span>
                    <span>Saldo</span>
                  </div>
                  <div className="flow-table">
                    {resourceRows.map((row) => (
                      <FlowRow key={row.key} resource={row.key} production={row.production} consumption={row.consumption} />
                    ))}
                  </div>
                  <p className="table-note">Produção do território antes de impostos, consumo populacional e tratados nacionais. O detalhamento completo está em Economia.</p>
                </>
              ) : (
                <EmptyState icon="Info" title="Sem produção relevante">Este território ainda não possui estruturas produtivas.</EmptyState>
              )}
            </section>

            <section className="card node-card">
              <div className="node-card__head">
                <span className="node-card__icon" style={{ color: NODES[tile.node].color }}><Icon name={tile.node === 'minerio' ? 'Gem' : tile.node === 'energia' ? 'Zap' : tile.node === 'fertil' ? 'Leaf' : tile.node === 'pesca' ? 'Ship' : tile.node === 'raro' ? 'Gem' : 'Leaf'} size={20} /></span>
                <div>
                  <div className="eyebrow">Depósito natural</div>
                  <h3>{NODES[tile.node].name}</h3>
                </div>
              </div>
              <p>{NODES[tile.node].description}</p>
              {tile.note ? <blockquote>{tile.note}</blockquote> : null}
              <div className="node-card__strategic"><Icon name="Target" size={13} /> {strategicText}</div>
            </section>

            <section className="card">
              <SectionHeader eyebrow="Estabilidade" title={tile.unrest >= 50 ? 'Território inquieto' : tile.unrest >= 25 ? 'Tensão crescente' : 'Ordem estável'} icon="Shield" />
              <div className="unrest-summary">
                <div className={cx('unrest-badge', tile.unrest >= 50 ? 'is-bad' : tile.unrest >= 25 ? 'is-warn' : 'is-ok')}>
                  <strong>{Math.round(tile.unrest)}</strong>
                  <span>de 100</span>
                </div>
                <div>
                  <p>
                    {tile.unrest >= 50
                      ? 'A produção local está reduzida e protestos podem eclodir. Construa administração, reduza escassez e evite guerras prolongadas.'
                      : tile.unrest >= 25
                        ? 'A insatisfação cresce. Centros administrativos e alimentos estáveis reduzem a desordem a cada ciclo.'
                        : 'A população está satisfeita. A desordem cai naturalmente quando há alimento, administração e paz.'}
                  </p>
                  <div className="unrest-factors">
                    {tile.unrest >= 25 ? <Badge tone="gold" icon="AlertTriangle">Pressão social</Badge> : <Badge tone="teal" icon="Check">Ordem</Badge>}
                    {tile.conqueredCycle && game.cycle - tile.conqueredCycle < 12 ? <Badge tone="red" icon="Swords">Conquista recente</Badge> : null}
                    {isOwn ? <Badge tone="blue" icon="Landmark">Admin. {tile.buildings.administrativo}</Badge> : null}
                  </div>
                </div>
              </div>
            </section>

            {tileProjects.length ? (
              <section className="card">
                <SectionHeader eyebrow="Em andamento" title="Projetos neste território" icon="Hammer" />
                <div className="project-mini-list">
                  {tileProjects.map((project) => (
                    <div className="project-mini" key={project.id}>
                      <span className="project-mini__icon"><Icon name={project.kind === 'pesquisa' ? 'FlaskConical' : project.kind === 'expansao' ? 'Target' : project.kind === 'operacao' ? 'Swords' : 'Hammer'} size={15} /></span>
                      <div>
                        <strong>{project.label}</strong>
                        <ProgressBar value={Math.max(0, game.cycle - project.startedCycle)} max={Math.max(1, project.completesCycle - project.startedCycle)} tone="teal" thin />
                        <small>Conclui no ciclo {project.completesCycle} · {FACTIONS[project.factionId].short}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {!isOwn && ownerFaction ? (
              <section className="card foreign-summary">
                <SectionHeader eyebrow="Soberania" title={FACTIONS[ownerFaction.id].name} icon="Globe2" />
                <div className="foreign-summary__grid">
                  <div><span>Líder</span><strong>{FACTIONS[ownerFaction.id].leader}</strong></div>
                  <div><span>Relações</span><strong>{relation ? Math.round(relation.relation) : '—'}</strong></div>
                  <div><span>Tecnologias</span><strong>{ownerFaction.techs.length}</strong></div>
                  <div><span>Militar</span><strong>{Math.round(ownerFaction.military)}</strong></div>
                </div>
                <p className="muted small">{FACTIONS[ownerFaction.id].description}</p>
                {relation ? <div className="foreign-summary__pacts">
                  {relation.war ? <Badge tone="red" icon="Swords">Em guerra</Badge> : null}
                  {relation.alliance ? <Badge tone="teal" icon="Handshake">Aliança</Badge> : null}
                  {relation.nonAggression ? <Badge tone="blue" icon="Shield">Não-agressão</Badge> : null}
                  {relation.trade ? <Badge tone="gold" icon="Coins">Comércio</Badge> : null}
                  {!relation.war && !relation.alliance && !relation.nonAggression && !relation.trade ? <Badge tone="neutral" icon="Handshake">Sem acordos</Badge> : null}
                </div> : null}
                <button className="button button--ghost button--block" onClick={() => setView('diplomacy')} type="button"><Icon name="Handshake" size={14} /> Abrir mesa de negociações</button>
              </section>
            ) : null}
          </>
        ) : null}

        {tab === 'estruturas' ? (
          <>
            <section className="card build-overview">
              <div className="build-overview__row">
                <span><Icon name="Hammer" size={14} /> Espaços construíveis</span>
                <strong>{used} / {slots}</strong>
              </div>
              <ProgressBar value={used} max={slots} tone="teal" thin />
              <div className="build-overview__meta">
                <span><Icon name="Coins" size={12} /> Manutenção: {prod ? fmt(prod.upkeep) : 0}/ciclo</span>
                <span><Icon name="Wrench" size={12} /> Mão de obra: {jobs} postos</span>
              </div>
            </section>
            {!isOwn ? (
              <div className="callout callout--neutral">
                <Icon name="Lock" size={16} />
                <span><strong>Território sob controle de {owner?.short}</strong><small>Estruturas só podem ser erguidas neste território após expansão ou conquista.</small></span>
              </div>
            ) : null}
            <section className="build-list">
              {BUILDING_ORDER.map((building) => (
                <BuildRow key={building} building={building} tile={tile} game={game} />
              ))}
            </section>
            <div className="panel-note">
              <Icon name="Info" size={14} />
              <p>Melhorar estruturas aumenta o desenvolvimento do território e libera novos níveis com tecnologias. Obras ocupam uma vaga de projeto por vez.</p>
            </div>
          </>
        ) : null}

        {tab === 'acoes' ? (
          <>
            {isNeutral ? (
              <section>
                <SectionHeader eyebrow="Expansão pacífica" title="Reivindicar soberania" icon="Target" />
                <ClaimCard tile={tile} game={game} />
              </section>
            ) : null}

            {isOwn ? (
              <>
                <section>
                  <SectionHeader eyebrow="Fronteira" title="Territórios reivindicáveis" icon="Map" action={<Badge tone="teal">{neutralNeighbors.length}</Badge>} />
                  {neutralNeighbors.length ? (
                    <div className="claim-list">
                      {neutralNeighbors.map((neighbor) => <ClaimCard key={neighbor.id} tile={neighbor} game={game} compact />)}
                    </div>
                  ) : (
                    <EmptyState icon="Map" title="Sem fronteiras livres">Todos os territórios vizinhos já têm soberano. Desenvolva a base, negocie ou prepare uma campanha militar.</EmptyState>
                  )}
                </section>

                <section>
                  <SectionHeader eyebrow="Forças armadas" title="Exército de Concórdia" icon="Swords" />
                  <div className="military-card">
                    <div className="military-card__top">
                      <div>
                        <span>Poder militar</span>
                        <strong>{Math.round(military)} <small>/ {cap}</small></strong>
                      </div>
                      <div>
                        <span>Manutenção</span>
                        <strong>{fmt(military * 0.03)} <small>cr./ciclo</small></strong>
                      </div>
                    </div>
                    <ProgressBar value={military} max={cap} tone="red" thin />
                    <div className="military-card__action">
                      <div>
                        <strong>+{RECRUIT_BATCH} unidades</strong>
                        <Cost cost={RECRUIT_COST} stocks={player.stocks} compact />
                      </div>
                      <button className="button button--tiny button--primary" onClick={() => enlist(1)} disabled={!canRecruit} type="button">
                        <Icon name="Plus" size={12} /> Recrutar
                      </button>
                    </div>
                    {!canRecruit ? <div className="disabled-note">Limite militar, créditos, bens ou influência insuficientes.</div> : null}
                  </div>
                  {enemyNeighbors.length ? (
                    <div className="enemy-list">
                      {enemyNeighbors.map((neighbor) => <AttackCard key={neighbor.id} tile={neighbor} game={game} />)}
                    </div>
                  ) : (
                    <div className="callout callout--neutral">
                      <Icon name="Shield" size={16} />
                      <span><strong>Nenhuma fronteira hostil</strong><small>Suas fronteiras atuais não tocam outra Casa. Expanda-se ou aguarde o contato.</small></span>
                    </div>
                  )}
                </section>
              </>
            ) : null}

            {!isOwn && !isNeutral ? (
              <>
                <AttackCard tile={tile} game={game} />
                <div className="callout callout--gold">
                  <Icon name="Handshake" size={16} />
                  <span><strong>A via diplomática</strong><small>Presentes e acordos podem abrir mercados e evitar uma guerra dispendiosa.</small></span>
                  <button className="button button--tiny button--ghost" onClick={() => setView('diplomacy')} type="button">Negociar</button>
                </div>
              </>
            ) : null}

            {isOwn ? (
              <section>
                <SectionHeader eyebrow="Apoio político" title="Diplomacia e influência" icon="Handshake" />
                <div className="influence-card">
                  <div>
                    <span>Influência disponível</span>
                    <strong>{fmt(player.stocks.influencia)}</strong>
                  </div>
                  <p>Presentes e tratados usam influência. Expansões também consomem capital político.</p>
                  <button className="button button--ghost button--block" onClick={() => setView('diplomacy')} type="button">Abrir mesa de negociações</button>
                </div>
              </section>
            ) : null}

          </>
        ) : null}
      </div>
    </div>
  );
}
