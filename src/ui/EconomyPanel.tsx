import { useMemo, useState } from 'react';
import { MARKET_BASE, MARKET_KEYS, MARKET_LABELS, RESOURCES, RESOURCE_KEYS } from '../game/constants';
import {
  adminCapacityOfState,
  computeEconomy,
  projectSlotsOf,
  techEffects,
} from '../game/economy';
import { buyUnitPrice, marketTrend, round2, sellUnitPrice } from '../game/market';
import type { MarketKey, ResourceKey } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { fmt, fmtRate, trendClass } from './format';
import { ResourceGlyph } from './art/Glyph';
import { Icon } from './Icon';
import { Badge, cx, EmptyState, ProgressBar, SectionHeader } from './primitives';
import { ViewShell } from './ViewShell';

const SOURCE_LABELS: Record<string, string> = {
  base: 'Terreno e população',
  nodes: 'Depósitos naturais',
  buildings: 'Estruturas',
  taxes: 'Impostos urbanos',
  commerce: 'Rede comercial',
  institutions: 'Instituições',
  diplomacy: 'Tratados',
};

const DEMAND_LABELS: Record<string, string> = {
  population: 'Consumo populacional',
  industry: 'Insumos industriais',
  upkeep: 'Manutenção e exército',
};

const CHART_OPTIONS: ResourceKey[] = ['creditos', 'alimentos', 'energia', 'materias', 'influencia'];

function EconomyChart({ history, resource }: { history: Array<{ cycle: number; stocks: Record<string, number> }>; resource: ResourceKey }) {
  const data = history.slice(-42);
  const color = RESOURCES[resource].color;
  if (data.length < 2) {
    return <EmptyState icon="TrendingUp" title="Histórico insuficiente">Avance alguns ciclos para desenhar a evolução econômica.</EmptyState>;
  }
  const width = 640;
  const height = 190;
  const padding = { left: 44, right: 14, top: 16, bottom: 24 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const values = data.map((row) => row.stocks[resource] ?? 0);
  const max = Math.max(...values) * 1.08 || 1;
  const min = 0;
  const points = data.map((row, index) => {
    const x = padding.left + (index / Math.max(1, data.length - 1)) * innerW;
    const y = padding.top + innerH - ((values[index] - min) / (max - min)) * innerH;
    return { x, y, value: values[index], cycle: row.cycle };
  });
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1].x},${padding.top + innerH} L${points[0].x},${padding.top + innerH} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Evolução de ${RESOURCES[resource].label}`}>
        <defs>
          <linearGradient id={`area-${resource}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((ratio) => {
          const y = padding.top + innerH * ratio;
          const value = max * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,.07)" strokeDasharray="3 5" />
              <text x={padding.left - 8} y={y + 3} textAnchor="end" fontSize="9" fill="rgba(220,238,234,.45)">{fmt(value)}</text>
            </g>
          );
        })}
        <path d={area} fill={`url(#area-${resource})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 3.2 : 1.5} fill={color} opacity={index === points.length - 1 ? 1 : 0.55}>
            <title>{`Ciclo ${point.cycle}: ${fmt(point.value)}`}</title>
          </circle>
        ))}
        <text x={padding.left} y={height - 5} fontSize="9" fill="rgba(220,238,234,.4)">Ciclo {data[0].cycle}</text>
        <text x={width - padding.right} y={height - 5} textAnchor="end" fontSize="9" fill="rgba(220,238,234,.4)">Ciclo {data[data.length - 1].cycle}</text>
      </svg>
    </div>
  );
}

function MarketCard({ resource }: { resource: MarketKey }) {
  const game = useGameStore((s) => s.game)!;
  const trade = useGameStore((s) => s.trade);
  const [amount, setAmount] = useState(10);
  const player = game.factions[game.playerFactionId];
  const price = game.market.prices[resource];
  const trend = marketTrend(game, resource);
  const unitBuy = buyUnitPrice(game, resource);
  const unitSell = sellUnitPrice(game, player, resource);
  const buyTotal = round2(amount * unitBuy);
  const sellTotal = round2(amount * unitSell);
  const base = MARKET_BASE[resource];
  const ratio = price / base;
  const stock = player.stocks[resource];

  return (
    <div className="market-card">
      <div className="market-card__head">
        <span className="market-card__icon" style={{ color: RESOURCES[resource].color }}><ResourceGlyph resource={resource} size={20} /></span>
        <div>
          <strong>{MARKET_LABELS[resource]}</strong>
          <span className={cx('market-card__trend', trend === 'up' ? 'is-positive' : trend === 'down' ? 'is-negative' : 'is-neutral')}>
            <Icon name={trend === 'up' ? 'TrendingUp' : trend === 'down' ? 'TrendingDown' : 'Minus'} size={12} />
            {price.toFixed(2).replace('.', ',')} cr.
          </span>
        </div>
        <Badge tone={ratio >= 1.08 ? 'gold' : ratio <= 0.92 ? 'blue' : 'neutral'}>
          {ratio >= 1.08 ? 'Alta' : ratio <= 0.92 ? 'Baixa' : 'Estável'}
        </Badge>
      </div>
      <div className="market-card__stock">
        <span>Estoque</span>
        <strong>{fmt(stock)}</strong>
        <span className="muted">· preço-base {base.toFixed(2).replace('.', ',')}</span>
      </div>
      <div className="market-card__amount">
        <button className="stepper" onClick={() => setAmount((v) => Math.max(5, v - 5))} aria-label="Diminuir quantidade" type="button"><Icon name="Minus" size={12} /></button>
        <span>{amount}</span>
        <button className="stepper" onClick={() => setAmount((v) => Math.min(60, v + 5))} aria-label="Aumentar quantidade" type="button"><Icon name="Plus" size={12} /></button>
      </div>
      <div className="market-card__actions">
        <button className="button button--tiny button--ghost" disabled={stock < amount} onClick={() => trade(resource, amount, 'sell')} type="button">
          Vender <span className="button__meta">{fmt(sellTotal)}</span>
        </button>
        <button className="button button--tiny button--primary" disabled={player.stocks.creditos < buyTotal} onClick={() => trade(resource, amount, 'buy')} type="button">
          Comprar <span className="button__meta">{fmt(buyTotal)}</span>
        </button>
      </div>
    </div>
  );
}

export function EconomyPanel() {
  const game = useGameStore((s) => s.game)!;
  const setView = useGameStore((s) => s.setView);
  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const eco = useMemo(() => computeEconomy(game, playerId), [game, playerId]);
  const [detail, setDetail] = useState<ResourceKey>('creditos');
  const [chartResource, setChartResource] = useState<ResourceKey>('creditos');
  const tech = techEffects(player);
  const capacity = adminCapacityOfState(game, playerId);
  const slots = projectSlotsOf(player);
  const activeProjects = game.projects.filter((p) => p.factionId === playerId);
  const sellModifier = tech.sellMult;

  const sourceEntries = (Object.entries(eco.sources) as Array<[keyof typeof eco.sources, Record<ResourceKey, number>]>)
    .map(([key, flow]) => ({ key, value: flow[detail] }))
    .filter((entry) => entry.value > 0.01)
    .sort((a, b) => b.value - a.value);
  const demandEntries = (Object.entries(eco.demands) as Array<[keyof typeof eco.demands, Record<ResourceKey, number>]>)
    .map(([key, flow]) => ({ key, value: flow[detail] }))
    .filter((entry) => entry.value > 0.01)
    .sort((a, b) => b.value - a.value);
  const sourceTotal = sourceEntries.reduce((sum, entry) => sum + entry.value, 0);
  const demandTotal = demandEntries.reduce((sum, entry) => sum + entry.value, 0);
  const detailNet = eco.net[detail];

  return (
    <ViewShell
      eyebrow="Sala de contas do Conselho"
      title="Economia de Concórdia"
      subtitle="Produção, consumo, mercado e a composição do tesouro — todos os números vêm das mesmas regras que movem o mundo."
      icon="Coins"
      actions={<button className="button button--ghost button--small" onClick={() => setView('construction')} type="button"><Icon name="Hammer" size={14} /> Projetos ({activeProjects.length}/{slots})</button>}
    >
      <div className="summary-grid summary-grid--4">
        <div className="summary-card summary-card--gold">
          <span className="summary-card__label"><Icon name="Coins" size={14} /> Tesouro</span>
          <strong>{fmt(player.stocks.creditos)}</strong>
          <span className={cx('summary-card__delta', trendClass(eco.net.creditos))}>{fmtRate(eco.net.creditos)}/ciclo</span>
          <small>Receita {fmt(eco.income)} · manutenção {fmt(eco.expenses)}</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="TrendingUp" size={14} /> Saldo comercial</span>
          <strong>{fmt(eco.commerce)}</strong>
          <span className="summary-card__delta">créditos/ciclo</span>
          <small>Multiplicador comercial {(1 + tech.tradeMult).toFixed(2)}× · preço dos bens {game.market.prices.bens.toFixed(2)}</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Landmark" size={14} /> Capacidade administrativa</span>
          <strong>{eco.territoryCount} <small>/ {capacity}</small></strong>
          <ProgressBar value={eco.territoryCount} max={capacity} tone={eco.overCapacity ? 'red' : 'teal'} thin />
          <small>{eco.overCapacity ? 'Sobrecarga: −10% de produção e desordem' : 'Territórios dentro do limite'}</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Users" size={14} /> População e trabalho</span>
          <strong>{fmt(eco.pop)}</strong>
          <span className="summary-card__delta">{fmt(eco.jobs)} empregos produtivos</span>
          <small>Consumo alimentar {fmt(eco.demands.population.alimentos)}/ciclo</small>
        </div>
      </div>

      {eco.shortages.length ? (
        <div className="warning-banner">
          <Icon name="AlertTriangle" size={18} />
          <div>
            <strong>Déficit projetado: {eco.shortages.map((key) => RESOURCES[key].label).join(', ')}</strong>
            <p>Sem estoque, a produção industrial é reduzida e a desordem aumenta. Compre no mercado ou reforce a cadeia produtiva.</p>
          </div>
          <a href="#market" className="button button--tiny button--danger" onClick={(event) => { event.preventDefault(); document.getElementById('market')?.scrollIntoView({ behavior: 'smooth' }); }}>Ir ao mercado</a>
        </div>
      ) : null}

      <div className="economy-layout">
        <div className="economy-main">
          <section className="view-card">
            <SectionHeader eyebrow="Fluxo nacional" title="Balanço por recurso" icon="TrendingUp" action={<Badge tone="teal">clique para detalhar</Badge>} />
            <div className="flow-table flow-table--economy flow-table--head">
              <span>Recurso</span>
              <span>Estoque</span>
              <span>Produção</span>
              <span>Demanda</span>
              <span>Saldo</span>
            </div>
            <div className="flow-table flow-table--economy">
              {RESOURCE_KEYS.map((key) => (
                <button
                  type="button"
                  key={key}
                  className={cx('flow-row flow-row--clickable', detail === key && 'is-selected')}
                  onClick={() => setDetail(key)}
                >
                  <span className="flow-row__name"><span className="flow-row__icon" style={{ color: RESOURCES[key].color }}><ResourceGlyph resource={key} size={17} /></span>{RESOURCES[key].label}</span>
                  <span className="flow-row__stock">{fmt(player.stocks[key])}</span>
                  <span className="flow-row__prod">+{fmt(eco.production[key])}</span>
                  <span className="flow-row__cons">−{fmt(eco.demand[key])}</span>
                  <span className={cx('flow-row__net', trendClass(eco.net[key]))}>{fmtRate(eco.net[key])}</span>
                </button>
              ))}
            </div>
            <div className="resource-detail">
              <div className="resource-detail__head">
                <span style={{ color: RESOURCES[detail].color }}><ResourceGlyph resource={detail} size={18} /></span>
                <strong>{RESOURCES[detail].label}</strong>
                <Badge tone={detailNet >= 0 ? 'teal' : 'red'}>{fmtRate(detailNet)}/ciclo</Badge>
              </div>
              <div className="resource-detail__grid">
                <div>
                  <div className="breakdown-title">Fontes de produção</div>
                  {sourceEntries.length ? sourceEntries.map((entry) => (
                    <div className="breakdown-row" key={entry.key}>
                      <span>{SOURCE_LABELS[entry.key] ?? entry.key}</span>
                      <div className="breakdown-bar"><i style={{ width: `${sourceTotal ? (entry.value / sourceTotal) * 100 : 0}%`, background: RESOURCES[detail].color }} /></div>
                      <strong>{fmt(entry.value)}</strong>
                    </div>
                  )) : <span className="muted small">Nenhuma fonte ativa.</span>}
                </div>
                <div>
                  <div className="breakdown-title">Destinos do recurso</div>
                  {demandEntries.length ? demandEntries.map((entry) => (
                    <div className="breakdown-row" key={entry.key}>
                      <span>{DEMAND_LABELS[entry.key] ?? entry.key}</span>
                      <div className="breakdown-bar"><i style={{ width: `${demandTotal ? (entry.value / demandTotal) * 100 : 0}%`, background: '#e39a80' }} /></div>
                      <strong>{fmt(entry.value)}</strong>
                    </div>
                  )) : <span className="muted small">Nenhum consumo ativo.</span>}
                </div>
              </div>
              <p className="table-note">Projeção para o próximo ciclo, considerando estruturas, população, tratados e capacidade administrativa.</p>
            </div>
          </section>

          <section className="view-card">
            <SectionHeader
              eyebrow="Memória econômica"
              title="Evolução do estoque"
              icon="TrendingUp"
              action={
                <div className="chip-tabs">
                  {CHART_OPTIONS.map((key) => (
                    <button key={key} className={cx('chip-tab', chartResource === key && 'is-active')} onClick={() => setChartResource(key)} type="button">
                      <ResourceGlyph resource={key} size={14} /> {RESOURCES[key].short}
                    </button>
                  ))}
                </div>
              }
            />
            <EconomyChart history={game.history} resource={chartResource} />
            <div className="chart-foot">
              <span><i style={{ background: RESOURCES[chartResource].color }} /> {RESOURCES[chartResource].label}</span>
              <span>{game.history.length} ciclos registrados</span>
            </div>
          </section>

          <section className="view-card">
            <SectionHeader eyebrow="Contas do Estado" title="De onde vêm os créditos" icon="Coins" />
            <div className="credit-columns">
              <div>
                <div className="breakdown-title">Receitas ({fmt(eco.income)}/ciclo)</div>
                {[
                  ['taxes', 'Impostos urbanos', '#e4bd72'],
                  ['commerce', 'Comércio de bens', '#c6a5ea'],
                  ['buildings', 'Administração e estruturas', '#9fc2b4'],
                  ['diplomacy', 'Tratados', '#6fd9c7'],
                  ['nodes', 'Depósitos naturais', '#c7a17b'],
                  ['base', 'Terreno', '#82c97c'],
                ].map(([key, label, color]) => {
                  const value = (eco.sources[key as keyof typeof eco.sources]?.creditos ?? 0);
                  if (value <= 0.01) return null;
                  return (
                    <div className="breakdown-row" key={key}>
                      <span>{label}</span>
                      <div className="breakdown-bar"><i style={{ width: `${eco.income ? (value / eco.income) * 100 : 0}%`, background: color }} /></div>
                      <strong>{fmt(value)}</strong>
                    </div>
                  );
                })}
              </div>
              <div>
                <div className="breakdown-title">Despesas ({fmt(eco.expenses)}/ciclo)</div>
                {[
                  ['buildings', 'Manutenção de estruturas', '#e39a80'],
                  ['military', 'Exército', '#8fb4f5'],
                  ['war', 'Esforço de guerra', '#e36d63'],
                ].map(([key, label, color]) => {
                  const value = key === 'buildings' ? eco.buildingUpkeep : key === 'military' ? eco.militaryUpkeep : Math.max(0, eco.upkeep - eco.buildingUpkeep - eco.militaryUpkeep);
                  if (value <= 0.01) return null;
                  return (
                    <div className="breakdown-row" key={key}>
                      <span>{label}</span>
                      <div className="breakdown-bar"><i style={{ width: `${eco.upkeep ? (value / eco.upkeep) * 100 : 0}%`, background: color }} /></div>
                      <strong>{fmt(value)}</strong>
                    </div>
                  );
                })}
                <div className="credit-result">
                  <span>Resultado operacional</span>
                  <strong className={trendClass(eco.income - eco.expenses)}>{fmtRate(eco.income - eco.expenses)}</strong>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="economy-side">
          <section className="view-card" id="market">
            <SectionHeader eyebrow="Ponto de troca" title="Mercado Global" icon="Store" action={<Badge tone="gold">volátil</Badge>} />
            <div className="market-list">
              {MARKET_KEYS.map((resource) => <MarketCard key={resource} resource={resource} />)}
            </div>
            <div className="market-foot">
              <Icon name="Info" size={13} />
              <span>Preço de compra inclui 6% de corretagem. Grandes volumes movem o mercado. Bônus de venda atual: {Math.round(sellModifier * 100)}%.</span>
            </div>
          </section>

          <section className="view-card">
            <SectionHeader eyebrow="Cadelas de suprimento" title="Estado das cadeias" icon="Network" />
            <div className="supply-list">
              <div>
                <span><Icon name="FlaskConical" size={13} /> Pesquisa</span>
                <Badge tone={eco.energyRatio < 1 ? 'red' : 'teal'}>{eco.energyRatio < 1 ? 'Energia limitando' : 'Operacional'}</Badge>
              </div>
              <div>
                <span><Icon name="Factory" size={13} /> Indústria</span>
                <Badge tone={eco.materialRatio < 1 || eco.energyRatio < 1 ? 'red' : 'teal'}>{eco.materialRatio < 1 ? 'Insumos limitando' : eco.energyRatio < 1 ? 'Energia limitando' : 'Operacional'}</Badge>
              </div>
              <div>
                <span><Icon name="Landmark" size={13} /> Administração</span>
                <Badge tone={eco.overCapacity ? 'red' : 'teal'}>{eco.territoryCount}/{capacity}</Badge>
              </div>
              <div>
                <span><Icon name="Hammer" size={13} /> Projetos</span>
                <Badge tone="blue">{activeProjects.length}/{slots}</Badge>
              </div>
            </div>
            <p className="table-note">A falta de energia reduz a produção de bens e conhecimento. A falta de matérias-primas limita a indústria.</p>
          </section>

          <section className="view-card">
            <SectionHeader eyebrow="Projeção" title="Próximos ciclos" icon="Compass" />
            <div className="forecast-list">
              {RESOURCE_KEYS.map((key) => {
                const weeks = [1, 3, 5].map((n) => Math.max(0, player.stocks[key] + eco.net[key] * n));
                const risk = eco.net[key] < 0 && player.stocks[key] / Math.max(1, Math.abs(eco.net[key])) < 5;
                return (
                  <div className="forecast-row" key={key}>
                    <span style={{ color: RESOURCES[key].color }}><ResourceGlyph resource={key} size={16} /></span>
                    <span>{RESOURCES[key].short}</span>
                    <span>+1c <b>{fmt(weeks[0])}</b></span>
                    <span>+3c <b>{fmt(weeks[1])}</b></span>
                    <span>+5c <b className={risk ? 'tone-red' : undefined}>{fmt(weeks[2])}</b></span>
                  </div>
                );
              })}
            </div>
            <p className="table-note">Projeção linear com o saldo atual; eventos, construções e comércio alteram o resultado.</p>
          </section>
        </aside>
      </div>
    </ViewShell>
  );
}
