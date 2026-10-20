import { useMemo } from 'react';
import { INSOLVENCY_CYCLES } from '../game/cycle';
import { computeEconomy, moneyOf, techEffects } from '../game/economy';
import { cityById } from '../game/atlas';
import { averageOperationShare, operationOutput } from '../game/operations';
import { leaderboard, rankOf, scoreParts, VICTORY_TARGET, victoryInfo } from '../game/progress';
import { SECTORS } from '../game/constants';
import type { FactionId, GameState } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { fmt, money, trendClass } from './format';
import { Icon } from './Icon';
import { Badge, ProgressBar, SectionHeader, cx } from './primitives';
import { ViewShell } from './ViewShell';

function CashChart({ history }: { history: Array<{ cycle: number; stocks: Record<string, number> }> }) {
  const data = history.slice(-42);
  if (data.length < 2) {
    return (
      <div className="chart-empty">
        <Icon name="TrendingUp" size={18} />
        <span>Avance alguns ciclos para desenhar a evolução do caixa.</span>
      </div>
    );
  }
  const width = 640;
  const height = 190;
  const padding = { left: 54, right: 16, top: 16, bottom: 26 };
  const values = data.map((point) => point.stocks.creditos ?? 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const x = (index: number) => padding.left + (index / Math.max(1, data.length - 1)) * innerW;
  const y = (value: number) => padding.top + innerH - ((value - min) / Math.max(1, max - min)) * innerH;
  const path = data.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(values[index]).toFixed(1)}`).join(' ');
  const area = `${path} L ${x(data.length - 1).toFixed(1)} ${padding.top + innerH} L ${padding.left} ${padding.top + innerH} Z`;

  return (
    <svg className="cash-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolução do caixa por ciclo">
      <defs>
        <linearGradient id="cashFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(228,189,114,.42)" />
          <stop offset="100%" stopColor="rgba(228,189,114,0)" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((ratio) => (
        <line
          key={ratio}
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + innerH * ratio}
          y2={padding.top + innerH * ratio}
          stroke="rgba(255,255,255,.08)"
          strokeDasharray="2 5"
        />
      ))}
      <text x={8} y={y(max) + 4} className="cash-chart__label">{money(max)}</text>
      <text x={8} y={y(min) + 4} className="cash-chart__label">{money(min)}</text>
      <path d={area} fill="url(#cashFill)" />
      <path d={path} fill="none" stroke="var(--gold)" strokeWidth={2} strokeLinejoin="round" />
      <text x={padding.left} y={height - 6} className="cash-chart__label">ciclo {data[0].cycle}</text>
      <text x={width - padding.right} y={height - 6} textAnchor="end" className="cash-chart__label">ciclo {data[data.length - 1].cycle}</text>
    </svg>
  );
}

function UnitTable({ game, playerId }: { game: GameState; playerId: FactionId }) {
  const tech = techEffects(game.factions[playerId]);
  const rows = game.operations
    .filter((op) => op.factionId === playerId)
    .map((op) => ({ op, city: cityById(op.cityId), out: operationOutput(game, op, tech.operationsMult) }))
    .sort((a, b) => b.out.net - a.out.net)
    .slice(0, 8);

  if (!rows.length) {
    return (
      <div className="chart-empty">
        <Icon name="Store" size={18} />
        <span>Nenhuma unidade de negócio aberta. Comece por uma fazenda ou uma rede de varejo.</span>
      </div>
    );
  }

  return (
    <div className="finance-units">
      {rows.map(({ op, city, out }) => {
        const sector = SECTORS[op.sector];
        return (
          <div className="finance-unit" key={op.id}>
            <span className="finance-unit__icon" style={{ color: sector.color }}><Icon name={sector.icon} size={16} /></span>
            <div className="finance-unit__name">
              <strong>{city?.name ?? op.cityId}</strong>
              <small>{sector.name} · {op.units} unidade{op.units > 1 ? 's' : ''} · {Math.round(out.share * 100)}% do mercado</small>
            </div>
            <span className="finance-unit__revenue tone-teal">{money(out.revenue)}</span>
            <span className="finance-unit__cost">−{money(out.upkeep + out.supply)}</span>
            <span className={cx('finance-unit__net', trendClass(out.net))}>{money(out.net, true)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function EconomyPanel() {
  const game = useGameStore((s) => s.game)!;
  const setView = useGameStore((s) => s.setView);
  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const eco = useMemo(() => computeEconomy(game, playerId), [game, playerId]);
  const score = useMemo(() => scoreParts(game, playerId), [game, playerId]);
  const board = useMemo(() => leaderboard(game), [game]);
  const victory = useMemo(() => victoryInfo(game), [game]);
  const rank = rankOf(victory.playerScore);
  const units = game.operations.filter((op) => op.factionId === playerId).reduce((sum, op) => sum + op.units, 0);
  const finance = eco.finance;
  const margin = finance.income > 0 ? (finance.net / finance.income) * 100 : 0;
  const maxLine = Math.max(...finance.revenue.map((line) => line.value), ...finance.costs.map((line) => line.value), 1);
  const creditFlow = useMemo(() => moneyOf({ creditos: finance.net }), [finance.net]);

  return (
    <ViewShell
      eyebrow="Diretoria financeira"
      title="Finanças da companhia"
      subtitle="Caixa, receita e custo das unidades, da infraestrutura e dos acordos. Tudo em dinheiro, ciclo a ciclo."
      icon="Coins"
      actions={<Badge tone={finance.net >= 0 ? 'teal' : 'red'} icon="Coins">{money(finance.net, true)}/ciclo</Badge>}
    >
      <div className="summary-grid summary-grid--4">
        <div className="summary-card summary-card--gold">
          <span className="summary-card__label"><Icon name="Coins" size={14} /> Caixa</span>
          <strong>{money(player.stocks.creditos)}</strong>
          <span className={cx('summary-card__delta', trendClass(finance.net))}>{money(finance.net, true)}/ciclo</span>
          <small>Paga unidades, obras, P&amp;D e licenças de praça.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="TrendingUp" size={14} /> Receita</span>
          <strong>{money(finance.income)}</strong>
          <span className="summary-card__delta">por ciclo</span>
          <small>{eco.operationCount ? `${eco.operationCount} operações · ${units} unidades · ${Math.round((eco.operationRevenue / Math.max(1, finance.income)) * 100)}% da receita` : 'Abra a primeira unidade para gerar receita própria'}</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="TrendingDown" size={14} /> Despesas</span>
          <strong>{money(finance.expenses)}</strong>
          <span className="summary-card__delta">por ciclo</span>
          <small>Pessoal, insumos e manutenção.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Award" size={14} /> Margem</span>
          <strong className={finance.net >= 0 ? 'tone-teal' : 'tone-red'}>{Math.round(margin)}%</strong>
          <span className="summary-card__delta">resultado sobre receita</span>
          <small>Relevância {victory.playerScore} / {VICTORY_TARGET} · {rank.name}</small>
        </div>
      </div>

      {player.deficitCycles > 0 ? (
        <div className="warning-banner warning-banner--debt">
          <Icon name="AlertTriangle" size={18} />
          <div>
            <strong>
              Caixa zerado há {player.deficitCycles} ciclo{player.deficitCycles > 1 ? 's' : ''} — insolvência em {Math.max(0, INSOLVENCY_CYCLES - player.deficitCycles)}
            </strong>
            <p>
              Seis ciclos seguidos no vermelho encerram a companhia: as unidades fecham e as praças ficam livres.
              Venda uma unidade deficitária, corte obras ou reduza a estrutura.
            </p>
          </div>
          <button className="button button--tiny button--danger" onClick={() => setView('companies')} type="button">Ver unidades</button>
        </div>
      ) : null}

      <div className="economy-layout">
        <div className="economy-main">
          <section className="view-card">
            <SectionHeader eyebrow="Resultado do ciclo" title="De onde vem e para onde vai o dinheiro" icon="Scale" />
            <div className="credit-columns">
              <div>
                <div className="breakdown-title">Receita ({money(finance.income)})</div>
                {finance.revenue.map((line) => (
                  <div className="breakdown-row" key={line.key}>
                    <span>{line.label}</span>
                    <div className="breakdown-bar"><i style={{ width: `${(line.value / maxLine) * 100}%`, background: 'var(--gold)' }} /></div>
                    <strong>{money(line.value)}</strong>
                  </div>
                ))}
              </div>
              <div>
                <div className="breakdown-title">Despesas ({money(finance.expenses)})</div>
                {finance.costs.map((line) => (
                  <div className="breakdown-row" key={line.key}>
                    <span>{line.label}</span>
                    <div className="breakdown-bar"><i style={{ width: `${(line.value / maxLine) * 100}%`, background: '#e39a80' }} /></div>
                    <strong>{money(line.value)}</strong>
                  </div>
                ))}
                <div className="credit-result">
                  <span>Resultado do ciclo</span>
                  <strong className={trendClass(finance.net)}>{money(finance.net, true)}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="view-card">
            <SectionHeader
              eyebrow="Carteira"
              title="Resultado por unidade"
              icon="Store"
              action={<button className="button button--tiny button--ghost" onClick={() => setView('companies')} type="button">Gerir empresas</button>}
            />
            <UnitTable game={game} playerId={playerId} />
          </section>

          <section className="view-card">
            <SectionHeader eyebrow="Histórico" title="Fluxo de caixa" icon="TrendingUp" action={<Badge tone="neutral">{game.history.length === 1 ? 'último ciclo' : `últimos ${Math.min(42, game.history.length)} ciclos`}</Badge>} />
            <CashChart history={game.history} />
            <div className="chart-foot">
              <span><i style={{ background: 'var(--gold)' }} /> caixa ao fim do ciclo</span>
              <span>{creditFlow >= 0 ? 'Operação superavitária' : 'Operação deficitária'}</span>
            </div>
          </section>
        </div>

        <aside className="economy-side">
          <section className="view-card">
            <SectionHeader eyebrow="Relevância" title="Peso da companhia" icon="Award" action={<Badge tone="gold">{victory.playerScore}</Badge>} />
            <ProgressBar value={victory.playerScore} max={VICTORY_TARGET} tone="gold" />
            <div className="score-list">
              {score.map((part) => (
                <div className="score-row" key={part.label}>
                  <span>{part.label}<small>{part.detail}</small></span>
                  <strong>{part.value}</strong>
                </div>
              ))}
            </div>
            <p className="table-note">A relevância é recalculada a cada ciclo e define a liderança do mercado.</p>
          </section>

          <section className="view-card">
            <SectionHeader eyebrow="Mercado" title="Ranking de relevância" icon="Crown" />
            <div className="ranking-list">
              {board.map((row, index) => (
                <div className={cx('ranking-row', row.isPlayer && 'is-player')} key={row.id}>
                  <span className="ranking-row__rank">{index + 1}</span>
                  <span className="ranking-row__house"><i style={{ background: row.color }} />{row.name}</span>
                  <span className="ranking-row__score"><strong>{fmt(row.score)}</strong></span>
                </div>
              ))}
            </div>
          </section>

          <section className="view-card">
            <SectionHeader eyebrow="Praças" title="Estrutura da rede" icon="Map" />
            <div className="finance-facts">
              <div><span>Praças licenciadas</span><strong>{eco.territoryCount}</strong></div>
              <div><span>Unidades de negócio</span><strong>{units}</strong></div>
              <div><span>Participação média</span><strong>{Math.round(averageOperationShare(game, playerId) * 100)}%</strong></div>
              <div><span>Capacidade administrativa</span><strong>{eco.territoryCount} / {eco.adminCapacity}</strong></div>
            </div>
            <p className="table-note">Cada praça licenciada permite abrir unidades nas cidades daquele país.</p>
          </section>
        </aside>
      </div>
    </ViewShell>
  );
}
