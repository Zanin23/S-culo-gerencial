import { cityById, type AtlasCity } from './atlas';
import {
  MAX_UNIT_BUILD,
  MAX_UNIT_RANGE,
  SECTORS,
  UNIT_BUILD_COST,
  UNIT_BUILD_STEPS,
  UNIT_RANGE_COST,
  UNIT_RANGE_STEPS,
  type SectorDef,
  type UnitExpansionDef,
} from './constants';
import { seatCommerceMult } from './hq';
import { clamp } from './rng';
import type { FactionId, GameState, Operation, SectorKey, Tile } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Unidades de negócio: a camada de empresas da companhia.
//
// Cada unidade ocupa uma cidade real e disputa o mercado local com as rivais.
// O tamanho do mercado vem da população (escala logarítmica: cidades enormes
// rendem mais, mas não infinitamente). A participação é a fatia da capacidade
// instalada da companhia no total da cidade — unidades rivais diluem a receita
// de todos, o que torna a competição econômica, não militar.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_UNITS_PER_CITY = 3;
/** Comércio local já instalado em cada cidade: a concorrência de base da praça. */
export const LOCAL_MARKET_UNITS = 2;

export interface OperationOutput {
  /** Receita bruta por ciclo, em dinheiro. */
  revenue: number;
  /** Manutenção da estrutura, em dinheiro. */
  upkeep: number;
  /** Compra de insumos no mercado, em dinheiro. */
  supply: number;
  net: number;
  share: number;
  market: number;
  units: number;
  portBonus: number;
  /** Expansões físicas e de negócio já compradas. */
  build: number;
  range: number;
  /** Multiplicador combinado das expansões sobre a receita. */
  expansionMult: number;
}

export function cityMarketSize(city: Pick<AtlasCity, 'pop'>): number {
  // 100 mil hab. → ~19; 1 milhão → ~27; 10 milhões → ~36.
  return 3 + Math.log10(1 + Math.max(0, city.pop) / 1000) * 13;
}

export function cityOfOperation(op: Operation): AtlasCity | undefined {
  return cityById(op.cityId);
}

export function operationsInCity(state: GameState, cityId: string): Operation[] {
  return state.operations.filter((op) => op.cityId === cityId);
}

export function operationsOf(state: GameState, factionId: FactionId): Operation[] {
  return state.operations.filter((op) => op.factionId === factionId);
}

/** Expansões físicas compradas (0–3). Saves antigos não têm o campo. */
export function buildLevel(op: Operation): number {
  return clamp(Math.round(op.build ?? 0), 0, MAX_UNIT_BUILD);
}

/** Expansões do ramo de negócio compradas (0–3). */
export function rangeLevel(op: Operation): number {
  return clamp(Math.round(op.range ?? 0), 0, MAX_UNIT_RANGE);
}

/** Próximo degrau físico, ou null quando a unidade já é âncora. */
export function nextBuildStep(op: Operation): UnitExpansionDef | null {
  const level = buildLevel(op);
  return level < MAX_UNIT_BUILD ? UNIT_BUILD_STEPS[level] : null;
}

/** Próximo degrau do ramo de negócio, ou null quando o ramo está completo. */
export function nextRangeStep(op: Operation): UnitExpansionDef | null {
  const level = rangeLevel(op);
  return level < MAX_UNIT_RANGE ? UNIT_RANGE_STEPS[op.sector][level] : null;
}

/** Peso de mercado: módulos instalados + presença das expansões físicas. */
export function operationWeight(op: Operation): number {
  const presence = UNIT_BUILD_STEPS
    .slice(0, buildLevel(op))
    .reduce((sum, step) => sum + (step.presence ?? 0), 0);
  return Math.max(0, op.units ?? 1) + presence;
}

/** Capacidade instalada do mercado local, incluindo o comércio de base. */
export function cityCapacity(state: GameState, cityId: string): number {
  return state.operations
    .filter((op) => op.cityId === cityId)
    .reduce((sum, op) => sum + operationWeight(op), 0) + LOCAL_MARKET_UNITS;
}

/** Participação da unidade na capacidade instalada da cidade (0..1). */
export function operationShare(state: GameState, op: Operation): number {
  const total = cityCapacity(state, op.cityId);
  return clamp(total > 0 ? operationWeight(op) / total : 0, 0, 1);
}

/** Portos da mesma companhia no país melhoram o escoamento de todas as unidades. */
export function portBonusIn(state: GameState, factionId: FactionId, countryId: string): number {
  const ports = state.operations
    .filter((op) => op.factionId === factionId && op.countryId === countryId && op.sector === 'porto')
    .reduce((sum, op) => sum + op.units, 0);
  return clamp(ports * (SECTORS.porto.portBonus ?? 0.05), 0, 0.3);
}

/** Bônus de rede: finanças crescem com o total de unidades da companhia. */
function networkFactor(state: GameState, factionId: FactionId, sector: SectorDef): number {
  if (!sector.networkBonus) return 1;
  const count = state.operations
    .filter((op) => op.factionId === factionId)
    .reduce((sum, op) => sum + op.units, 0);
  return 1 + sector.networkBonus * Math.max(0, count - 1);
}

/**
 * Receita e custo de uma unidade por ciclo. `operationsMult` vem das tecnologias
 * da companhia (mantém este módulo livre de dependência de economy.ts).
 */
export function operationOutput(state: GameState, op: Operation, operationsMult = 0): OperationOutput {
  const city = cityOfOperation(op);
  const country: Tile | undefined = state.tiles[op.countryId];
  const sector = SECTORS[op.sector];
  if (!city || !country || !sector) {
    return {
      revenue: 0, upkeep: 0, supply: 0, net: 0, share: 0, market: 0,
      units: op.units ?? 1, portBonus: 0, build: 0, range: 0, expansionMult: 1,
    };
  }
  const market = cityMarketSize(city);
  const units = clamp(op.units ?? 1, 1, MAX_UNITS_PER_CITY);
  const share = operationShare(state, op);
  const build = buildLevel(op);
  const range = rangeLevel(op);
  const buildSteps = UNIT_BUILD_STEPS.slice(0, build);
  const rangeSteps = UNIT_RANGE_STEPS[op.sector].slice(0, range);
  // Expansões físicas e de negócio somam receita; a construção também pesa
  // no mercado e encarece a manutenção.
  const expansionRevenue = [...buildSteps, ...rangeSteps].reduce((sum, step) => sum + step.revenue, 0);
  const upkeepFactor = 1 + buildSteps.reduce((sum, step) => sum + (step.upkeep ?? 0), 0);
  const supplyFactor = 1 + rangeSteps.reduce((sum, step) => sum + (step.supply ?? 0), 0);
  const seat = seatCommerceMult(state, op.factionId, op.cityId);
  const unitsFactor = 0.45 + 0.55 * (units / MAX_UNITS_PER_CITY);
  const shareFactor = 0.5 + 0.5 * share;
  // Desordem e falta de segurança derrubam a operação local.
  const unrestFactor = clamp(1 - country.unrest / 220, 0.45, 1);
  const security = 1 + country.buildings.defesa * 0.03;
  const ports = portBonusIn(state, op.factionId, op.countryId);

  const revenue =
    market * sector.revenue * 1.8 * unitsFactor * shareFactor * unrestFactor * security *
    networkFactor(state, op.factionId, sector) * (1 + operationsMult) * (1 + ports) *
    (1 + expansionRevenue) * seat;

  const upkeep = market * 0.1 * units * (0.75 + 0.25 * units) * upkeepFactor;
  const supply = market * (sector.supplyCost ?? 0) * units * supplyFactor;
  return {
    revenue, upkeep, supply, net: revenue - upkeep - supply, share, market, units, portBonus: ports,
    build, range, expansionMult: 1 + expansionRevenue,
  };
}

/** Resultado consolidado da rede de unidades. */
export function operationsSummary(state: GameState, factionId: FactionId, operationsMult = 0) {
  let revenue = 0;
  let upkeep = 0;
  let supply = 0;
  let units = 0;
  const list = operationsOf(state, factionId);
  for (const op of list) {
    const output = operationOutput(state, op, operationsMult);
    revenue += output.revenue;
    upkeep += output.upkeep;
    supply += output.supply;
    units += output.units;
  }
  return { revenue, upkeep, supply, net: revenue - upkeep - supply, count: list.length, units };
}

/** Participação média da companhia nas cidades onde já opera (0..1). */
export function averageOperationShare(state: GameState, factionId: FactionId): number {
  const own = operationsOf(state, factionId);
  if (!own.length) return 0;
  let total = 0;
  for (const op of own) {
    const capacity = cityCapacity(state, op.cityId);
    total += capacity > 0 ? operationWeight(op) / capacity : 0;
  }
  return total / own.length;
}

/** Custo em dinheiro de uma expansão física ou de negócio. */
export function unitExpansionCost(
  city: Pick<AtlasCity, 'pop'>,
  sector: SectorKey,
  kind: 'build' | 'range',
  level: number,
) {
  const def = SECTORS[sector];
  const scale = 1 + Math.log10(1 + Math.max(0, city.pop) / 1000) * 0.6;
  const table = kind === 'build' ? UNIT_BUILD_COST : UNIT_RANGE_COST;
  const factor = table[clamp(level, 0, table.length - 1)];
  return { creditos: Math.round(def.cost * scale * factor) };
}

/** Custo em dinheiro para abrir (1ª unidade) ou comprar o próximo módulo. */
export function operationCost(city: Pick<AtlasCity, 'pop'>, sector: SectorKey, targetUnits: number) {
  const def = SECTORS[sector];
  const scale = 1 + Math.log10(1 + Math.max(0, city.pop) / 1000) * 0.6;
  const step = targetUnits <= 1 ? 1 : 1 + (targetUnits - 1) * 0.35;
  return { creditos: Math.round(def.cost * scale * step) };
}

/** Por que a companhia ainda não pode abrir uma unidade nesta cidade. */
export function canOpenOperation(
  state: GameState,
  factionId: FactionId,
  cityId: string,
  relevance = 0,
): string | null {
  const city = cityById(cityId);
  if (!city) return 'Cidade desconhecida.';
  const country = state.tiles[city.countryId];
  if (!country) return 'O país desta cidade não faz parte do tabuleiro.';
  if (country.owner !== factionId) return 'A companhia só opera em praças com licença própria.';
  if (state.operations.some((op) => op.factionId === factionId && op.cityId === cityId)) {
    return 'Esta cidade já tem uma unidade da companhia.';
  }
  const sector = SECTORS.varejo;
  void sector;
  return null;
}

/** Regras extras de segmento: relevância e pré-requisitos de rede. */
export function canOpenSector(
  state: GameState,
  factionId: FactionId,
  cityId: string,
  sector: SectorKey,
  relevance: number,
): string | null {
  const city = cityById(cityId);
  if (!city) return 'Cidade desconhecida.';
  const def = SECTORS[sector];
  if (relevance + 1e-9 < def.relevance) {
    return `Relevância ${def.relevance} necessária. A companhia tem ${Math.round(relevance)}.`;
  }
  if (sector === 'fabrica') {
    const hasIndustry = state.operations.some(
      (op) => op.factionId === factionId && op.countryId === city.countryId && op.sector === 'industria',
    );
    if (!hasIndustry) return 'A fábrica de automóveis exige uma indústria no mesmo país.';
  }
  return null;
}
