import { useMemo, useState } from 'react';
import {
  BUILDINGS,
  BUILDING_ORDER,
  FACTIONS,
  NODES,
  SECTORS,
  TECHS,
  TERRAIN,
} from '../game/constants';
import {
  adminCapacityOfState,
  developmentOf,
  hasTech,
  jobsOf,
  moneyOf,
  projectSlotsOf,
  SALARY_PER_POP,
  TAX_PER_POP,
  slotsOf,
  techEffects,
  territoryProduction,
  usedSlots,
} from '../game/economy';
import { getRelation, relationStatus } from '../game/diplomacy';
import { cityOfOperation, operationOutput } from '../game/operations';
import { neighborsOf, tilesOfFaction } from '../game/map';
import { canBuild, expansionPreview } from '../game/commands';
import type { BuildingKey, FactionId, GameState, Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { fmt, money, trendClass } from './format';
import { TerrainGlyph } from './art/Glyph';
import { Icon } from './Icon';
import { Badge, Cost, cx, EmptyState, LevelPips, ProgressBar, SectionHeader } from './primitives';

type Tab = 'resumo' | 'estruturas' | 'acoes';

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
  if (preview.owned) reasons.push('A praça já tem licença de outra companhia.');
  if (!preview.adjacent) reasons.push('Nenhuma praça sua é vizinha deste mercado.');
  if (preview.adjacent && preview.dev < preview.required) reasons.push(`Desenvolvimento insuficiente na base (${preview.dev}/${preview.required}).`);
  if (reserved >= capacity) reasons.push(`Capacidade administrativa esgotada (${reserved}/${capacity}).`);
  if (projectCount >= projectSlotsOf(player)) reasons.push('Sem vagas de projeto disponíveis.');
  if (inProgress) reasons.push('Licenciamento já em andamento.');
  if (player.stocks.creditos + 1e-9 < preview.cost.creditos) {
    reasons.push(`Caixa insuficiente: faltam ${money(preview.cost.creditos - player.stocks.creditos)}.`);
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
        {inProgress ? 'Licenciamento em andamento' : 'Abrir licença de praça'}
        <span className="button__meta">2 ciclos</span>
      </button>
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
      ? `Bônus local ativo (+${Math.round(def.terrainBonus.multiplier * 100)}% na ${def.terrainBonus.label})`
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
  const popCap = 10 + dev * 0.85 + (capital ? 8 : 0);

  const strategicText = tile.strategic === 3 ? 'Praça decisiva para o mercado global' : tile.strategic === 2 ? 'Praça de alto valor comercial' : 'Praça de valor comum';

  const marketOps = game.operations
    .filter((op) => op.countryId === tile.id)
    .map((op) => ({
      op,
      city: cityOfOperation(op),
      revenue: operationOutput(game, op, techEffects(game.factions[op.factionId]).operationsMult).revenue,
      units: operationOutput(game, op, techEffects(game.factions[op.factionId]).operationsMult).units,
    }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue);
  const ownMarketOps = marketOps.filter((row) => row.op.factionId === playerId);
  const foreignOperations = tile.owner && tile.owner !== playerId
    ? game.operations.filter((op) => op.factionId === tile.owner).length
    : 0;

  const relationBadge = relation ? relationStatus(relation) : null;

  return (
    <div className="context-panel">
      <header className="context-head context-head--tile">
        <div className="context-head__main">
          <div className="eyebrow">
            {owner ? owner.name : 'Praça aberta'}
            {capital ? ' · Capital' : ''}
            {relation ? ` · ${relationBadge?.label}` : ''}
          </div>
          <h2>{tile.name}</h2>
          <div className="tile-subline">
            <span className="tile-subline__terrain"><TerrainGlyph terrain={tile.terrain} size={17} /> {TERRAIN[tile.terrain].name}</span>
            <span className="tile-subline__sep">·</span>
            <span>{NODES[tile.node].name}</span>
            <span className="tile-subline__sep">·</span>
            <span>{tile.strategic}/3 estratégico</span>
            <span className="tile-subline__sep">·</span>
            <span>{tile.provinceCount} províncias · {tile.cityCount} cidades</span>
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
        <span className={cx('tile-status', isOwn && 'is-own')}>
          <i /> {isOwn ? 'Sua praça' : isNeutral ? 'Praça sem licença' : 'Praça de outra companhia'}
        </span>
        <span className="tile-strip__dev">{dev} <small>dev.</small></span>
        <button className="text-button text-button--small" onClick={() => selectTile(null)} type="button">
          Painel da companhia <Icon name="ChevronRight" size={12} />
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
          <Icon name="Target" size={14} /> Ações
        </button>
      </div>

      <div className="context-scroll">
        {tab === 'resumo' ? (
          <>
            {isOwn ? (
              <section className="tile-actions-row">
                <button className="button button--ghost button--small" onClick={() => setTab('estruturas')} type="button"><Icon name="Hammer" size={14} /> Construir</button>
                <button className="button button--ghost button--small" onClick={() => setView('companies')} type="button"><Icon name="Store" size={14} /> Abrir unidade</button>
                <button className="button button--ghost button--small" onClick={() => setView('diplomacy')} type="button"><Icon name="Handshake" size={14} /> Parcerias</button>
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
                <span><Icon name="Store" size={13} /> Unidades</span>
                <strong>{marketOps.reduce((sum, row) => sum + row.units, 0)} <small>na praça</small></strong>
                <small>{ownMarketOps.reduce((sum, row) => sum + row.units, 0)} da companhia</small>
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
              <SectionHeader eyebrow="Resultado da praça" title="Receita e custo locais" icon="Coins" action={<Badge tone="neutral">{owner ? owner.short : 'Sem licença'}</Badge>} />
              {prod ? (
                <>
                  <div className="finance-facts">
                    <div><span>Vendas urbanas</span><strong>{money(tile.pop * TAX_PER_POP * (1 - tile.unrest / 250))}</strong></div>
                    <div><span>Fazendas, indústrias e portos</span><strong>{money(moneyOf(prod.base) + moneyOf(prod.nodes) + moneyOf(prod.buildings))}</strong></div>
                    <div><span>Rede comercial</span><strong>{money(prod.commerceBase)}</strong></div>
                    <div><span>Pessoal e manutenção</span><strong className="tone-red">−{money(tile.pop * SALARY_PER_POP + prod.upkeep)}</strong></div>
                  </div>
                  <p className="table-note">Estimativa por ciclo antes dos multiplicadores nacionais. As unidades de negócio entram na receita da companhia, não aqui.</p>
                </>
              ) : (
                <EmptyState icon="Info" title="Praça sem licença">A companhia não opera nesta praça. Abra uma licença de operação para capturar receita local.</EmptyState>
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
              <SectionHeader eyebrow="Estabilidade" title={tile.unrest >= 50 ? 'Praça inquieta' : tile.unrest >= 25 ? 'Tensão crescente' : 'Operação estável'} icon="Shield" />
              <div className="unrest-summary">
                <div className={cx('unrest-badge', tile.unrest >= 50 ? 'is-bad' : tile.unrest >= 25 ? 'is-warn' : 'is-ok')}>
                  <strong>{Math.round(tile.unrest)}</strong>
                  <span>de 100</span>
                </div>
                <div>
                  <p>
                    {tile.unrest >= 50
                      ? 'A operação local perde eficiência e protestos podem eclodir. Escritórios centrais e segurança patrimonial reduzem a desordem a cada ciclo.'
                      : tile.unrest >= 25
                        ? 'A insatisfação cresce. Escritórios centrais e investimento local reduzem a desordem a cada ciclo.'
                        : 'A praça está estável. A desordem cai naturalmente com gestão e segurança patrimonial.'}
                  </p>
                  <div className="unrest-factors">
                    {tile.unrest >= 25 ? <Badge tone="gold" icon="AlertTriangle">Pressão social</Badge> : <Badge tone="teal" icon="Check">Ordem</Badge>}
                    {tile.conqueredCycle && game.cycle - tile.conqueredCycle < 12 ? <Badge tone="gold" icon="Map">Praça recém-licenciada</Badge> : null}
                    {isOwn ? <Badge tone="blue" icon="Landmark">Admin. {tile.buildings.administrativo}</Badge> : null}
                  </div>
                </div>
              </div>
            </section>

            {tileProjects.length ? (
              <section className="card">
                <SectionHeader eyebrow="Em andamento" title="Projetos nesta praça" icon="Hammer" />
                <div className="project-mini-list">
                  {tileProjects.map((project) => (
                    <div className="project-mini" key={project.id}>
                      <span className="project-mini__icon"><Icon name={project.kind === 'pesquisa' ? 'FlaskConical' : project.kind === 'expansao' ? 'Target' : 'Hammer'} size={15} /></span>
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
                <SectionHeader eyebrow="Companhia rival" title={FACTIONS[ownerFaction.id].name} icon="Globe2" />
                <div className="foreign-summary__grid">
                  <div><span>Diretoria</span><strong>{FACTIONS[ownerFaction.id].leader}</strong></div>
                  <div><span>Relações</span><strong>{relation ? Math.round(relation.relation) : '—'}</strong></div>
                  <div><span>Tecnologias</span><strong>{ownerFaction.techs.length}</strong></div>
                  <div><span>Unidades</span><strong>{foreignOperations}</strong></div>
                </div>
                <p className="muted small">{FACTIONS[ownerFaction.id].description}</p>
                {relation ? <div className="foreign-summary__pacts">
                  {relation.alliance ? <Badge tone="teal" icon="Handshake">Parceria estratégica</Badge> : null}
                  {relation.nonAggression ? <Badge tone="blue" icon="Shield">Trégua de concorrência</Badge> : null}
                  {relation.trade ? <Badge tone="gold" icon="Coins">Acordo comercial</Badge> : null}
                  {!relation.alliance && !relation.nonAggression && !relation.trade ? <Badge tone="neutral" icon="Handshake">Sem acordos</Badge> : null}
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
                <span><strong>Praça operada por {owner?.short}</strong><small>Estruturas só podem ser erguidas aqui com licença de operação ou expansão da companhia.</small></span>
              </div>
            ) : null}
            <section className="build-list">
              {BUILDING_ORDER.map((building) => (
                <BuildRow key={building} building={building} tile={tile} game={game} />
              ))}
            </section>
            <div className="panel-note">
              <Icon name="Info" size={14} />
              <p>Melhorar estruturas aumenta o desenvolvimento da praça e libera novos níveis com tecnologias. Obras ocupam uma vaga de projeto por vez.</p>
            </div>
          </>
        ) : null}

        {tab === 'acoes' ? (
          <>
            {isNeutral ? (
              <section>
                <SectionHeader eyebrow="Licença de praça" title="Entrar neste mercado" icon="Target" />
                <ClaimCard tile={tile} game={game} />
              </section>
            ) : null}

            {isOwn ? (
              <>
                <section>
                  <SectionHeader eyebrow="Vizinhança" title="Praças disponíveis" icon="Map" action={<Badge tone="teal">{neutralNeighbors.length}</Badge>} />
                  {neutralNeighbors.length ? (
                    <div className="claim-list">
                      {neutralNeighbors.map((neighbor) => <ClaimCard key={neighbor.id} tile={neighbor} game={game} compact />)}
                    </div>
                  ) : (
                    <EmptyState icon="Map" title="Sem fronteiras livres">Todas as praças vizinhas já têm licença. Desenvolva a base ou negocie acordos com a companhia vizinha.</EmptyState>
                  )}
                </section>

                <section>
                  <SectionHeader
                    eyebrow="Rede de unidades"
                    title="Operações nesta praça"
                    icon="Store"
                    action={<Badge tone={ownMarketOps.length ? 'teal' : 'neutral'}>{ownMarketOps.length} sua(s)</Badge>}
                  />
                  {marketOps.length ? (
                    <div className="market-ops">
                      {marketOps.slice(0, 8).map(({ op, city, revenue }) => (
                        <div className={cx('market-op', op.factionId === playerId && 'is-own')} key={op.id}>
                          <span className="crest crest--sm" style={{ borderColor: FACTIONS[op.factionId].color, color: FACTIONS[op.factionId].color }}>
                            {FACTIONS[op.factionId].short.slice(0, 1)}
                          </span>
                          <div className="market-op__body">
                            <strong>{city?.name ?? 'Cidade'}</strong>
                            <small>{SECTORS[op.sector].name} · {op.units} unidade{op.units > 1 ? 's' : ''} · {FACTIONS[op.factionId].short}</small>
                          </div>
                          <span className={cx('market-op__revenue', op.factionId === playerId ? 'tone-teal' : 'muted')}>
                            {op.factionId === playerId ? fmt(revenue) : '—'}
                          </span>
                        </div>
                      ))}
                      {marketOps.length > 8 ? <p className="table-note">Mais {marketOps.length - 8} unidades nesta praça — veja a rede completa em Empresas.</p> : null}
                    </div>
                  ) : (
                    <EmptyState icon="Store" title="Nenhuma unidade nesta praça">Abra a primeira unidade em uma cidade desta praça para capturar receita local.</EmptyState>
                  )}
                  <button className="button button--ghost button--block" onClick={() => setView('companies')} type="button">
                    <Icon name="Store" size={14} /> Gerir unidades da companhia
                  </button>
                </section>
              </>
            ) : null}

            {!isOwn && !isNeutral ? (
              <>
                <div className="callout callout--neutral">
                  <Icon name="Lock" size={16} />
                  <span>
                    <strong>Praça licenciada por outra companhia</strong>
                    <small>{FACTIONS[owner!.id].short} detém a licença desta praça. Unidades só podem ser abertas em praças licenciadas pela sua companhia.</small>
                  </span>
                  <button className="button button--tiny button--ghost" onClick={() => setView('companies')} type="button">Ver minhas unidades</button>
                </div>
                <div className="callout callout--gold">
                  <Icon name="Handshake" size={16} />
                  <span><strong>A via institucional</strong><small>Presentes e acordos comerciais melhoram as relações e podem abrir caminho para entrar neste mercado.</small></span>
                  <button className="button button--tiny button--ghost" onClick={() => setView('diplomacy')} type="button">Propor acordo</button>
                </div>
              </>
            ) : null}

            {isOwn ? (
              <section>
                <SectionHeader eyebrow="Relações institucionais" title="Acordos e parcerias" icon="Handshake" />
                <div className="influence-card">
                  <div>
                    <span>Acordos ativos</span>
                    <strong>{game.offers.filter((offer) => offer.to === playerId).length}</strong>
                  </div>
                  <p>Presentes e acordos comerciais custam caixa e melhoram a relação com outras companhias.</p>
                  <button className="button button--ghost button--block" onClick={() => setView('diplomacy')} type="button">Abrir mesa de parcerias</button>
                </div>
              </section>
            ) : null}

          </>
        ) : null}
      </div>
    </div>
  );
}
