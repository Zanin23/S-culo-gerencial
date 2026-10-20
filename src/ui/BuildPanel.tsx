import { useMemo } from 'react';
import { cityById } from '../game/atlas';
import {
  HQ_STAGES,
  MAX_HQ_BUILD,
  MAX_UNIT_BUILD,
  MAX_UNIT_RANGE,
  SECTORS,
  UNIT_BUILD_STEPS,
  UNIT_RANGE_STEPS,
} from '../game/constants';
import { techEffects } from '../game/economy';
import {
  MAX_UNITS_PER_CITY,
  buildLevel,
  nextBuildStep,
  nextRangeStep,
  operationCost,
  operationOutput,
  operationsOf,
  rangeLevel,
  unitExpansionCost,
  type OperationOutput,
} from '../game/operations';
import type { Operation } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { money } from './format';
import { Icon } from './Icon';
import { Badge, ProgressBar, SectionHeader, cx } from './primitives';
import { HqBlueprint, UnitBlueprint } from './UnitBlueprint';
import { ViewShell } from './ViewShell';

// ─────────────────────────────────────────────────────────────────────────────
// Módulo de construção: a sede e cada filial em uma bancada de projeto.
//
// Toda unidade começa pequena. Duas trilhas de compra independentes evoluem o
// mesmo endereço: a construção (área, altura e presença de mercado) e o ramo de
// negócio (novas fontes de receita daquele setor).
// ─────────────────────────────────────────────────────────────────────────────

export function BuildPanel() {
  const game = useGameStore((s) => s.game)!;
  const setView = useGameStore((s) => s.setView);
  const expandSeat = useGameStore((s) => s.expandSeat);
  const expandUnitBuild = useGameStore((s) => s.expandUnitBuild);
  const expandUnitBusiness = useGameStore((s) => s.expandUnitBusiness);
  const upgradeOperation = useGameStore((s) => s.upgradeOperation);
  const closeOperation = useGameStore((s) => s.closeOperation);

  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const tech = techEffects(player);
  const operations = useMemo(() => operationsOf(game, playerId), [game, playerId]);
  const seat = game.city;
  const seatLevel = Math.max(0, Math.min(MAX_HQ_BUILD, Math.round(seat?.build ?? 0)));
  const stage = HQ_STAGES[seatLevel];
  const nextStage = seatLevel < MAX_HQ_BUILD ? HQ_STAGES[seatLevel + 1] : null;

  const modules = operations.reduce((sum, op) => sum + op.units, 0);
  const builds = operations.reduce((sum, op) => sum + buildLevel(op), 0);
  const ranges = operations.reduce((sum, op) => sum + rangeLevel(op), 0);
  const maxBuilds = Math.max(1, operations.length * MAX_UNIT_BUILD);
  const maxRanges = Math.max(1, operations.length * MAX_UNIT_RANGE);

  return (
    <ViewShell
      eyebrow="Construção e expansão"
      title="Sede e filiais"
      subtitle="Toda unidade começa pequena. Compre expansões de construção para crescer o prédio e expansões de ramo para abrir novas fontes de receita no mesmo endereço."
      icon="Blocks"
      actions={
        <>
          <Badge tone="gold" icon="Building2">{operations.length} filiai{operations.length === 1 ? 'l' : 's'}</Badge>
          <button className="button button--tiny" type="button" onClick={() => setView('companies')}>
            <Icon name="Plus" size={13} /> Abrir filial
          </button>
        </>
      }
    >
      <div className="summary-grid summary-grid--4">
        <div className="summary-card summary-card--gold">
          <span className="summary-card__label"><Icon name="Landmark" size={14} /> Sede</span>
          <strong>{stage.name}</strong>
          <span className="summary-card__delta">{stage.floors} pisos · estágio {seatLevel + 1} de {HQ_STAGES.length}</span>
          <small>{seat ? `${seat.cityName} · ${seat.district}` : 'Sede ainda não fundada'}</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Store" size={14} /> Módulos instalados</span>
          <strong>{modules}</strong>
          <span className="summary-card__delta">{operations.length} endereço{operations.length === 1 ? '' : 's'} de operação</span>
          <small>Até {MAX_UNITS_PER_CITY} módulos por unidade.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Blocks" size={14} /> Expansões de construção</span>
          <strong>{builds} <small>/ {operations.length ? maxBuilds : 0}</small></strong>
          <ProgressBar value={builds} max={maxBuilds} tone="teal" thin />
          <small>Área construída, presença de mercado e manutenção.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Layers" size={14} /> Linhas de negócio</span>
          <strong>{ranges} <small>/ {operations.length ? maxRanges : 0}</small></strong>
          <ProgressBar value={ranges} max={maxRanges} tone="gold" thin />
          <small>Receita nova dentro do mesmo ramo.</small>
        </div>
      </div>

      {seat ? (
        <section className="build-hq">
          <div className="build-hq__art">
            <HqBlueprint stage={seatLevel} />
            <div className="build-hq__art-caption">
              <span className="eyebrow">Sede · {seat.cityName}</span>
              <strong>{stage.name}</strong>
              <small>{stage.description}</small>
            </div>
          </div>
          <div className="build-hq__body">
            <SectionHeader
              eyebrow="Sede do grupo"
              title={`Estágio ${seatLevel + 1} de ${HQ_STAGES.length}`}
              icon="Landmark"
              action={<Badge tone="gold" icon="Building2">{stage.floors} pisos</Badge>}
            />
            <div className="build-hq__effects">
              <span>
                <Icon name="Coins" size={13} />
                {stage.commerce > 0 ? `+${Math.round(stage.commerce * 100)}% de receita nas unidades da cidade` : 'Sem bônus de comércio ainda'}
              </span>
              <span>
                <Icon name="Scale" size={13} />
                {HQ_STAGES.slice(0, seatLevel + 1).reduce((sum, item) => sum + item.admin, 0)} vagas administrativas extras
              </span>
              <span>
                <Icon name="Map" size={13} />
                {seat.district} · lote {seat.plotId}
              </span>
            </div>

            <ol className="build-stage-track" aria-label="Estágios da sede">
              {HQ_STAGES.map((item, index) => (
                <li
                  key={item.key}
                  className={cx(
                    'build-stage',
                    index < seatLevel && 'is-done',
                    index === seatLevel && 'is-current',
                    index > seatLevel && 'is-locked',
                  )}
                >
                  <span className="build-stage__dot">{index < seatLevel ? <Icon name="Check" size={11} /> : index + 1}</span>
                  <span className="build-stage__label">{item.name}</span>
                </li>
              ))}
            </ol>

            {nextStage ? (
              <div className="build-next">
                <div className="build-next__head">
                  <span className="build-next__icon"><Icon name="Hammer" size={16} /></span>
                  <div>
                    <div className="eyebrow">Próxima expansão</div>
                    <strong>{nextStage.name}</strong>
                  </div>
                  <span className="build-next__cost">{money(nextStage.cost)}</span>
                </div>
                <p>{nextStage.description}</p>
                <div className="build-next__effects">
                  {nextStage.commerce > 0 ? <Badge tone="teal" icon="TrendingUp">+{Math.round(nextStage.commerce * 100)}% comércio local</Badge> : null}
                  {nextStage.admin > 0 ? <Badge tone="blue" icon="Scale">+{nextStage.admin} vaga administrativa</Badge> : null}
                  <Badge tone="neutral" icon="Building2">{nextStage.floors} pisos</Badge>
                </div>
                <button
                  className="button button--primary button--block"
                  type="button"
                  disabled={player.stocks.creditos < nextStage.cost}
                  onClick={expandSeat}
                >
                  <Icon name="Hammer" size={15} />
                  {player.stocks.creditos < nextStage.cost ? `Faltam ${money(nextStage.cost - player.stocks.creditos)}` : `Ampliar a sede · ${money(nextStage.cost)}`}
                </button>
              </div>
            ) : (
              <div className="build-maxed">
                <Icon name="Crown" size={16} /> Complexo matriz concluído: a sede está no último estágio.
              </div>
            )}
          </div>
        </section>
      ) : null}

      <div className="build-units-head">
        <SectionHeader
          eyebrow="Filial por filial"
          title="Unidades de negócio"
          icon="Store"
          action={<button className="text-button" type="button" onClick={() => setView('companies')}>Portfólio financeiro <Icon name="ChevronRight" size={13} /></button>}
        />
      </div>

      {operations.length ? (
        <div className="build-unit-grid">
          {operations.map((operation) => (
            <UnitBuildCard
              key={operation.id}
              operation={operation}
              output={operationOutput(game, operation, tech.operationsMult)}
              cash={player.stocks.creditos}
              onBuild={() => expandUnitBuild(operation.id)}
              onRange={() => expandUnitBusiness(operation.id)}
              onModule={() => upgradeOperation(operation.id)}
              onSell={() => closeOperation(operation.id)}
            />
          ))}
        </div>
      ) : (
        <section className="view-card build-empty">
          <Icon name="Blocks" size={26} />
          <h3>Nenhuma filial para construir</h3>
          <p>Abra a primeira unidade em uma cidade licenciada. Ela nasce como um ponto compacto e evolui nos dois eixos desta bancada.</p>
          <button className="button button--primary" type="button" onClick={() => setView('companies')}>
            <Icon name="Plus" size={14} /> Abrir unidade
          </button>
        </section>
      )}
    </ViewShell>
  );
}

function UnitBuildCard({
  operation,
  output,
  cash,
  onBuild,
  onRange,
  onModule,
  onSell,
}: {
  operation: Operation;
  output: OperationOutput;
  cash: number;
  onBuild: () => void;
  onRange: () => void;
  onModule: () => void;
  onSell: () => void;
}) {
  const city = cityById(operation.cityId);
  const sector = SECTORS[operation.sector];
  const build = buildLevel(operation);
  const range = rangeLevel(operation);
  const nextBuild = nextBuildStep(operation);
  const nextRange = nextRangeStep(operation);
  const buildCost = city ? unitExpansionCost(city, operation.sector, 'build', build) : null;
  const rangeCost = city ? unitExpansionCost(city, operation.sector, 'range', range) : null;
  const moduleCost = city ? operationCost(city, operation.sector, operation.units + 1) : null;
  const buildSteps = UNIT_BUILD_STEPS;
  const rangeSteps = UNIT_RANGE_STEPS[operation.sector];

  return (
    <article className="unit-build" style={{ '--unit': sector.color } as React.CSSProperties}>
      <header className="unit-build__head">
        <span className="unit-build__icon"><Icon name={sector.icon} size={18} /></span>
        <div className="unit-build__identity">
          <div className="eyebrow">{sector.name}</div>
          <h3>{city?.name ?? operation.cityId}</h3>
          <span>{operation.units} módulo{operation.units > 1 ? 's' : ''} · {build + 1}º estágio de construção</span>
        </div>
        <span className="unit-build__net">
          <small>resultado</small>
          <strong className={cx(output.net >= 0 ? 'tone-teal' : 'tone-red')}>{money(output.net, true)}</strong>
          <span>/ciclo</span>
        </span>
      </header>

      <div className="unit-build__art">
        <UnitBlueprint sector={operation.sector} units={operation.units} build={build} range={range} />
      </div>

      <div className="unit-build__stats">
        <div><span>Receita</span><strong>{money(output.revenue)}</strong></div>
        <div><span>Custo</span><strong className="tone-red">−{money(output.upkeep + output.supply)}</strong></div>
        <div><span>Participação</span><strong>{Math.round(output.share * 100)}%</strong></div>
        <div><span>Multiplicador</span><strong>×{output.expansionMult.toFixed(2)}</strong></div>
      </div>

      <ExpansionTrack
        title="Construção"
        icon="Hammer"
        tone="teal"
        steps={buildSteps.map((step) => ({ name: step.name, description: step.description }))}
        level={build}
        next={nextBuild}
        cost={buildCost?.creditos ?? null}
        cash={cash}
        effect={nextBuild ? `+${Math.round(nextBuild.revenue * 100)}% de receita · +${Math.round((nextBuild.presence ?? 0) * 100)}% de presença` : null}
        onBuy={onBuild}
      />

      <ExpansionTrack
        title="Ramo de negócio"
        icon="Layers"
        tone="gold"
        steps={rangeSteps.map((step) => ({ name: step.name, description: step.description }))}
        level={range}
        next={nextRange}
        cost={rangeCost?.creditos ?? null}
        cash={cash}
        effect={nextRange ? `+${Math.round(nextRange.revenue * 100)}% de receita${nextRange.supply ? ` · +${Math.round(nextRange.supply * 100)}% de insumos` : ''}` : null}
        onBuy={onRange}
      />

      <footer className="unit-build__foot">
        <button
          className="button button--tiny"
          type="button"
          disabled={operation.units >= MAX_UNITS_PER_CITY || !moduleCost || cash < moduleCost.creditos}
          onClick={onModule}
          title={moduleCost ? `Instalar outro módulo por ${money(moduleCost.creditos)}` : undefined}
        >
          <Icon name="Plus" size={12} />
          {operation.units >= MAX_UNITS_PER_CITY ? 'Máximo de módulos' : `Novo módulo · ${moduleCost ? money(moduleCost.creditos) : '—'}`}
        </button>
        <button className="button button--tiny button--ghost" type="button" onClick={onSell}>
          <Icon name="X" size={12} /> Vender unidade
        </button>
      </footer>
    </article>
  );
}

function ExpansionTrack({
  title,
  icon,
  tone,
  steps,
  level,
  next,
  cost,
  cash,
  effect,
  onBuy,
}: {
  title: string;
  icon: string;
  tone: 'teal' | 'gold';
  steps: Array<{ name: string; description: string }>;
  level: number;
  next: { name: string; description: string } | null;
  cost: number | null;
  cash: number;
  effect: string | null;
  onBuy: () => void;
}) {
  return (
    <section className={cx('unit-track', `unit-track--${tone}`)}>
      <header className="unit-track__head">
        <span><Icon name={icon} size={13} /> {title}</span>
        <span className="unit-track__level">{level}/{steps.length}</span>
      </header>
      <ol className="unit-track__steps">
        {steps.map((step, index) => (
          <li
            key={step.name}
            className={cx(index < level && 'is-done', index === level && 'is-next', index > level && 'is-locked')}
            title={step.description}
          >
            <span className="unit-track__dot">{index < level ? <Icon name="Check" size={9} /> : index + 1}</span>
            <span>{step.name}</span>
          </li>
        ))}
      </ol>
      {next && cost !== null ? (
        <button
          className={cx('unit-track__buy', cash < cost && 'is-short')}
          type="button"
          disabled={cash < cost}
          onClick={onBuy}
        >
          <span className="unit-track__buy-body">
            <strong>{next.name}</strong>
            <small>{next.description}</small>
            {effect ? <em>{effect}</em> : null}
          </span>
          <span className="unit-track__price">
            {cash < cost ? <small>faltam</small> : null}
            {money(cash < cost ? cost - cash : cost)}
          </span>
        </button>
      ) : (
        <div className="unit-track__done"><Icon name="Check" size={12} /> {title} completa</div>
      )}
    </section>
  );
}
