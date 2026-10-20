import { BUILDINGS, MARKET_BASE, RESOURCES, RESOURCE_KEYS, RESOURCE_VALUE, TERRAIN, TECHS, GAME } from './constants';
import { getRelation, hasActivePact, relationKey } from './diplomacy';
import { tilesOfFaction } from './map';
import type {
  BuildingKey,
  Faction,
  FactionId,
  Flow,
  GameState,
  ResourceKey,
  Stocks,
  TechId,
  Tile,
} from './types';
import { EMPTY_FLOW, EMPTY_STOCKS } from './constants';
import { clamp, round1 } from './rng';
import { hqCommerceMult, hqDefenseMult, hqProductionMult, seatAdminBonus } from './hq';
import { operationsSummary } from './operations';

export const POP_FOOD = 0;
export const POP_ENERGY = 0;
export const POP_GOODS = 0;
/** Salários e encargos por habitante das praças, por ciclo. */
export const SALARY_PER_POP = 0.32;
export const TAX_PER_POP = 0.45;
export const BASE_ADMIN_CAPACITY = 4;

export interface EconomySources {
  base: Flow;
  nodes: Flow;
  buildings: Flow;
  taxes: Flow;
  commerce: Flow;
  institutions: Flow;
  diplomacy: Flow;
  operations: Flow;
}

export interface EconomyDemands {
  population: Flow;
  industry: Flow;
  upkeep: Flow;
}

export interface FinanceLine {
  key: string;
  label: string;
  value: number;
}

export interface FinanceReport {
  income: number;
  expenses: number;
  net: number;
  revenue: FinanceLine[];
  costs: FinanceLine[];
}

export interface FactionEconomy {
  factionId: FactionId;
  production: Flow;
  demand: Flow;
  net: Flow;
  sources: EconomySources;
  demands: EconomyDemands;
  upkeep: number;
  commerce: number;
  income: number;
  expenses: number;
  shortages: ResourceKey[];
  projectedStocks: Stocks;
  adminCapacity: number;
  territoryCount: number;
  overCapacity: boolean;
  devSum: number;
  pop: number;
  jobs: number;
  laborRatio: number;
  operationCount: number;
  operationRevenue: number;
  operationUpkeep: number;
  pactCount: number;
  energyRatio: number;
  materialRatio: number;
  defense: number;
  buildingUpkeep: number;
  researchDiscount: number;
  finance: FinanceReport;
}

const emptySources = (): EconomySources => ({
  base: EMPTY_FLOW(), nodes: EMPTY_FLOW(), buildings: EMPTY_FLOW(),
  taxes: EMPTY_FLOW(), commerce: EMPTY_FLOW(), institutions: EMPTY_FLOW(), diplomacy: EMPTY_FLOW(),
  operations: EMPTY_FLOW(),
});

const emptyDemands = (): EconomyDemands => ({
  population: EMPTY_FLOW(), industry: EMPTY_FLOW(), upkeep: EMPTY_FLOW(),
});

export function sumFlow(...flows: Flow[]): Flow {
  const out = EMPTY_FLOW();
  for (const f of flows) for (const k of RESOURCE_KEYS) out[k] += f[k];
  return out;
}

export function scaleFlow(flow: Flow, factor: number): Flow {
  const out = EMPTY_FLOW();
  for (const k of RESOURCE_KEYS) out[k] = flow[k] * factor;
  return out;
}

export function flowTotal(flow: Flow): number {
  return RESOURCE_KEYS.reduce((sum, k) => sum + flow[k], 0);
}

/** Converte um custo em recursos para o caixa da companhia (única moeda). */
export function moneyOf(cost: Partial<Record<ResourceKey, number>> | null | undefined): number {
  if (!cost) return 0;
  return RESOURCE_KEYS.reduce((sum, k) => sum + (cost[k] ?? 0) * RESOURCE_VALUE[k], 0);
}

export function hasTech(faction: Faction, tech: TechId): boolean {
  return faction.techs.includes(tech);
}

export function techEffects(faction: Faction) {
  const effects = {
    production: EMPTY_FLOW(),
    globalProduction: 0,
    tradeMult: 0,
    sellMult: 0,
    expansionCostMult: 0,
    expansionInfluenceMult: 0,
    maxProjects: 0,
    slotsBonus: 0,
    defenseMult: 0,
    operationsMult: 0,
    unrestReduction: 0,
    relationGainMult: 0,
    influencePerCycle: 0,
    adminCapacity: 0,
    industryEnergyMult: 1,
  };
  for (const id of faction.techs) {
    const def = TECHS[id];
    if (!def) continue;
    const e = def.effects;
    if (e.production) for (const k of RESOURCE_KEYS) effects.production[k] += e.production[k] ?? 0;
    effects.globalProduction += e.globalProduction ?? 0;
    effects.tradeMult += e.tradeMult ?? 0;
    effects.sellMult += e.sellMult ?? 0;
    effects.expansionCostMult += e.expansionCostMult ?? 0;
    effects.expansionInfluenceMult += e.expansionInfluenceMult ?? 0;
    effects.maxProjects += e.maxProjects ?? 0;
    effects.slotsBonus += e.slotsBonus ?? 0;
    effects.defenseMult += e.defenseMult ?? 0;
    effects.operationsMult += e.operationsMult ?? 0;
    effects.unrestReduction += e.unrestReduction ?? 0;
    effects.relationGainMult += e.relationGainMult ?? 0;
    effects.influencePerCycle += e.influencePerCycle ?? 0;
    effects.adminCapacity += e.adminCapacity ?? 0;
    if (e.industryEnergyMult) effects.industryEnergyMult *= e.industryEnergyMult;
  }
  return effects;
}

export function activeModifiersFor(state: GameState, factionId: FactionId) {
  return state.modifiers.filter(
    (modifier) =>
      modifier.untilCycle >= state.cycle &&
      (modifier.scope === 'global' || modifier.factionId === factionId),
  );
}

export function researchDiscountFor(state: GameState, factionId: FactionId): number {
  return Math.min(
    0.6,
    activeModifiersFor(state, factionId).reduce((sum, m) => sum + (m.researchDiscount ?? 0), 0),
  );
}

// ── Territory maths ─────────────────────────────────────────────────────────

export function buildingLevelTotal(tile: Tile): number {
  return (Object.values(tile.buildings) as number[]).reduce((a, b) => a + b, 0);
}

export function developmentOf(tile: Tile): number {
  const levels = buildingLevelTotal(tile);
  const popFactor = Math.min(10, tile.pop * 0.2);
  return Math.min(
    100,
    Math.round(6 + levels * 5 + tile.buildings.logistica * 2 + (tile.isCapital ? 5 : 0) + popFactor),
  );
}

export function slotsOf(tile: Tile, faction?: Faction): number {
  const tech = faction ? techEffects(faction).slotsBonus : 0;
  return 3 + TERRAIN[tile.terrain].slots + (tile.isCapital ? 2 : 0) + tile.buildings.logistica * 2 + tech;
}

export function usedSlots(tile: Tile): number {
  return (Object.values(tile.buildings) as number[]).filter((lvl) => lvl > 0).length;
}

export function adminCapacityOfState(state: GameState, factionId: FactionId): number {
  const faction = state.factions[factionId];
  const adminLevels = Object.values(state.tiles)
    .filter((t) => t.owner === factionId)
    .reduce((sum, t) => sum + t.buildings.administrativo, 0);
  return BASE_ADMIN_CAPACITY + adminLevels + techEffects(faction).adminCapacity + seatAdminBonus(state, factionId);
}

export function projectSlotsOf(faction: Faction): number {
  return GAME.baseProjectSlots + techEffects(faction).maxProjects;
}

export function defenseOf(state: GameState, tile: Tile): number {
  const owner = tile.owner ? state.factions[tile.owner] : null;
  const defenseLevels = tile.buildings.defesa;
  const terrainBonus = tile.terrain === 'montanha' ? 25 : tile.terrain === 'colina' ? 14 : 0;
  const base = defenseLevels * 18 + terrainBonus + (tile.isCapital ? 20 : 0);
  const district = hqDefenseMult(state, tile.id);
  return Math.round(base * (1 + (owner ? techEffects(owner).defenseMult : 0)) * district);
}

const PRODUCTIVE: BuildingKey[] = ['fazenda', 'extratora', 'usina', 'industria', 'entreposto', 'pesquisa'];

export function jobsOf(tile: Tile): number {
  return PRODUCTIVE.reduce((sum, key) => sum + tile.buildings[key] * BUILDINGS[key].jobs, 0);
}

function terrainBonusMult(def: (typeof BUILDINGS)[BuildingKey], tile: Tile): number {
  const tb = def.terrainBonus;
  if (!tb) return 1;
  const nodeMatch = tb.nodes?.includes(tile.node) ?? false;
  const terrainMatch = tb.terrains?.includes(tile.terrain) ?? false;
  if (nodeMatch || terrainMatch) return 1 + tb.multiplier;
  return 1;
}

export interface TerritoryProduction {
  base: Flow;
  nodes: Flow;
  buildings: Flow;
  commerceBase: number;
  consumption: Flow;
  upkeep: number;
  jobs: number;
  defense: number;
  laborRatio: number;
}

/** Production of a single territory, before national modifiers and shortages. */
export function territoryProduction(state: GameState, tile: Tile, faction: Faction): TerritoryProduction {
  const tech = techEffects(faction);
  const terrain = TERRAIN[tile.terrain];
  const dev = developmentOf(tile);
  const devFactor = 1 + dev / 250;
  const unrestFactor = 1 - tile.unrest / 200;
  const local = 1 + tile.buildings.logistica * 0.05 + (tile.isCapital ? 0.1 : 0);
  const jobs = jobsOf(tile);
  const laborRatio = jobs > 0 ? clamp(tile.pop / jobs, 0.55, 1) : 1;

  const base = EMPTY_FLOW();
  base.alimentos = terrain.baseFood * devFactor * unrestFactor;
  base.materias = terrain.baseMaterials * devFactor * unrestFactor;
  base.energia = terrain.baseEnergy * devFactor * unrestFactor;

  const nodes = EMPTY_FLOW();
  const nodeDef = tile.node !== 'nenhum' ? stateNodeBonus(tile) : null;
  if (nodeDef) for (const k of RESOURCE_KEYS) nodes[k] += (nodeDef[k] ?? 0) * unrestFactor;

  const buildings = EMPTY_FLOW();
  const consumption = EMPTY_FLOW();
  let commerceBase = 0;
  let upkeep = 0;
  const defense = defenseOf(state, tile);

  for (const key of Object.keys(BUILDINGS) as BuildingKey[]) {
    const level = tile.buildings[key];
    if (!level) continue;
    const def = BUILDINGS[key];
    upkeep += (def.upkeep.creditos ?? 0) * level;
    for (const r of RESOURCE_KEYS) {
      const prod = (def.production[r] ?? 0) * level * local * laborRatio * unrestFactor * devFactor;
      if (prod <= 0) continue;
      const resMult = 1 + tech.production[r] + tech.globalProduction;
      const district = key === 'entreposto'
        ? hqCommerceMult(state, tile.id)
        : key === 'industria' || key === 'extratora'
          ? hqProductionMult(state, tile.id)
          : 1;
      const adjusted = prod * resMult * terrainBonusMult(def, tile) * district;
      if (key === 'entreposto' && r === 'creditos') {
        commerceBase += adjusted;
      } else {
        buildings[r] += adjusted;
      }
    }
    for (const r of RESOURCE_KEYS) {
      let amount = (def.consumption[r] ?? 0) * level;
      if (key === 'industria' && r === 'energia') amount *= tech.industryEnergyMult;
      consumption[r] += amount;
    }
  }

  return {
    base,
    nodes,
    buildings,
    commerceBase,
    consumption,
    upkeep,
    jobs,
    defense,
    laborRatio,
  };
}

function stateNodeBonus(tile: Tile): Partial<Flow> {
  const bonuses: Record<string, Partial<Flow>> = {
    fertil: { alimentos: 2.4 },
    minerio: { materias: 2.8 },
    energia: { energia: 2.8 },
    madeira: { materias: 1.6, creditos: 1 },
    pesca: { alimentos: 2 },
    raro: { creditos: 5, influencia: 0.8 },
  };
  return bonuses[tile.node] ?? {};
}

// ── National economy ────────────────────────────────────────────────────────

export function computeEconomy(state: GameState, factionId: FactionId): FactionEconomy {
  const faction = state.factions[factionId];
  const tech = techEffects(faction);
  const modifiers = activeModifiersFor(state, factionId);
  for (const modifier of modifiers) {
    if (modifier.production) {
      for (const k of RESOURCE_KEYS) tech.production[k] += modifier.production[k] ?? 0;
    }
    tech.tradeMult += modifier.tradeBonus ?? 0;
  }
  const researchDiscount = Math.min(0.6, modifiers.reduce((sum, m) => sum + (m.researchDiscount ?? 0), 0));
  const tiles = tilesOfFaction(state.tiles, factionId);
  const sources = emptySources();
  const demands = emptyDemands();

  let commerceBase = 0;
  let buildingUpkeep = 0;
  let jobs = 0;
  let devSum = 0;
  let defense = 0;
  let pop = 0;

  for (const tile of tiles) {
    const tp = territoryProduction(state, tile, faction);
    for (const k of RESOURCE_KEYS) {
      sources.base[k] += tp.base[k];
      sources.nodes[k] += tp.nodes[k];
      sources.buildings[k] += tp.buildings[k];
      demands.industry[k] += tp.consumption[k];
    }
    commerceBase += tp.commerceBase;
    buildingUpkeep += tp.upkeep;
    jobs += tp.jobs;
    devSum += developmentOf(tile);
    defense += tp.defense;
    pop += tile.pop;
  }

  // Taxes and urban consumption
  for (const tile of tiles) {
    const unrestFactor = clamp(1 - tile.unrest / 250, 0.5, 1);
    const tax = tile.pop * TAX_PER_POP * unrestFactor * (1 + tech.production.creditos + tech.globalProduction);
    sources.taxes.creditos += tax;
    demands.population.creditos += tile.pop * SALARY_PER_POP;
  }

  // Commerce network
  const bensPriceFactor = Math.pow(state.market.prices.bens / MARKET_BASE.bens, 0.9);
  let commerceMult = bensPriceFactor * (1 + tech.tradeMult);
  const pacts: Array<{ key: string; relation: ReturnType<typeof getRelation> }> = [];
  for (const [key, rel] of Object.entries(state.diplomacy)) {
    if (!key.includes(factionId)) continue;
    if (hasActivePact(rel)) pacts.push({ key, relation: rel });
    if (rel.trade) commerceMult += 0.05;
  }
  const commerce = commerceBase * commerceMult;
  sources.commerce.creditos += commerce;

  // Institutions: the capital and strategic territories project soft power.
  for (const tile of tiles) {
    const unrestFactor = 1 - tile.unrest / 200;
    if (tile.isCapital) {
      sources.institutions.influencia += 1;
    }
    if (tile.strategic >= 3) {
      sources.institutions.influencia += 1.2 * unrestFactor;
      sources.institutions.conhecimento += 0.6 * unrestFactor;
    } else if (tile.strategic === 2) {
      sources.institutions.influencia += 0.5 * unrestFactor;
    }
  }
  sources.institutions.influencia += tech.influencePerCycle * Math.max(1, tiles.length * 0.25);

  // Treaties
  for (const pact of pacts) {
    if (pact.relation.alliance) {
      sources.diplomacy.creditos += 6;
      sources.diplomacy.influencia += 1.5;
    } else if (pact.relation.trade) {
      sources.diplomacy.creditos += 6;
      sources.diplomacy.influencia += 0.5;
    }
  }

  // Unidades de negócio: receita, manutenção e insumos comprados no mercado.
  const ops = operationsSummary(state, factionId, tech.operationsMult);
  sources.operations.creditos = ops.revenue;
  demands.upkeep.creditos += ops.upkeep;
  demands.industry.creditos += ops.supply;

  // Security & administration
  const adminCapacity = adminCapacityOfState(state, factionId);
  const territoryCount = tiles.length;
  const overCapacity = territoryCount > adminCapacity;
  demands.upkeep.creditos += buildingUpkeep;
  sources.base.creditos += 0; // terrain taxes are handled above

  const production = sumFlow(
    sources.base, sources.nodes, sources.buildings, sources.taxes,
    sources.commerce, sources.institutions, sources.diplomacy, sources.operations,
  );
  const demand = sumFlow(demands.population, demands.industry, demands.upkeep);

  // Insumos são comprados no mercado: não há estoque nem bloqueio de produção.
  const energyRatio = 1;
  const materialRatio = 1;
  const industryFactor = 1;
  const researchFactor = 1;
  const operationRevenue = ops.revenue;

  if (overCapacity) {
    for (const k of RESOURCE_KEYS) production[k] *= 0.9;
    sources.operations.creditos *= 0.9;
  }

  const net = EMPTY_FLOW();
  for (const k of RESOURCE_KEYS) net[k] = production[k] - demand[k];

  // Projected stocks and shortages
  const projected = EMPTY_STOCKS();
  const shortages: ResourceKey[] = [];
  for (const k of RESOURCE_KEYS) {
    const available = faction.stocks[k] + production[k];
    if (available + 1e-9 < demand[k]) shortages.push(k);
    projected[k] = Math.max(0, available - demand[k]);
  }

  const finance = financeReport(sources, demands);

  return {
    factionId,
    production,
    demand,
    net,
    sources,
    demands,
    upkeep: buildingUpkeep + ops.upkeep,
    commerce,
    income: finance.income,
    expenses: finance.expenses,
    shortages,
    projectedStocks: projected,
    adminCapacity,
    territoryCount,
    overCapacity,
    devSum,
    pop,
    jobs,
    laborRatio: jobs > 0 ? clamp(pop / jobs, 0, 1) : 1,
    operationCount: ops.count,
    operationRevenue,
    operationUpkeep: ops.upkeep,
    pactCount: pacts.length,
    energyRatio,
    materialRatio,
    defense,
    buildingUpkeep,
    researchDiscount,
    finance,
  };
}

/** Receita e despesa da companhia, já convertidas para dinheiro. */
function financeReport(sources: EconomySources, demands: EconomyDemands): FinanceReport {
  const revenue: FinanceLine[] = [
    { key: 'unidades', label: 'Unidades de negócio', value: moneyOf(sources.operations) },
    { key: 'vendas', label: 'Vendas urbanas', value: moneyOf(sources.taxes) },
    { key: 'comercio', label: 'Rede comercial', value: moneyOf(sources.commerce) },
    { key: 'infraestrutura', label: 'Fazendas, indústrias e portos', value: moneyOf(sources.base) + moneyOf(sources.nodes) + moneyOf(sources.buildings) },
    { key: 'acordos', label: 'Acordos e marca', value: moneyOf(sources.diplomacy) + moneyOf(sources.institutions) },
  ].filter((line) => line.value > 0.05);

  const costs: FinanceLine[] = [
    { key: 'pessoal', label: 'Pessoal e utilidades', value: moneyOf(demands.population) },
    { key: 'insumos', label: 'Insumos e mercadorias', value: moneyOf(demands.industry) },
    { key: 'manutencao', label: 'Manutenção de estruturas', value: moneyOf(demands.upkeep) },
  ].filter((line) => line.value > 0.05);

  const income = revenue.reduce((sum, line) => sum + line.value, 0);
  const expenses = costs.reduce((sum, line) => sum + line.value, 0);
  return { income, expenses, net: income - expenses, revenue, costs };
}

/** Applies production, demand, population growth and unrest for one faction. */
export function applyEconomy(state: GameState, factionId: FactionId): FactionEconomy {
  const faction = state.factions[factionId];
  const eco = computeEconomy(state, factionId);
  const tiles = tilesOfFaction(state.tiles, factionId);

  // A companhia opera com caixa: recebe, paga e recompra insumos no mercado.
  const available = faction.stocks.creditos + eco.finance.income;
  const paid = Math.min(available, eco.finance.expenses);
  const cashAfter = round1(Math.max(0, available - paid));
  const actualDemand = EMPTY_FLOW();
  const deltas = EMPTY_FLOW();
  actualDemand.creditos = round1(paid);
  deltas.creditos = round1(eco.finance.income - paid);
  for (const k of RESOURCE_KEYS) {
    if (k === 'creditos') continue;
    faction.stocks[k] = 0;
  }
  faction.stocks.creditos = cashAfter;

  faction.lastFlow = deltas;
  faction.lastProduction = { ...eco.production };
  faction.lastConsumption = actualDemand;
  faction.shortages = [];
  // Insolvência: caixa vazio e resultado negativo por ciclos seguidos.
  faction.deficitCycles = cashAfter <= 0.1 && eco.finance.net < 0
    ? (faction.deficitCycles ?? 0) + 1
    : 0;

  // Unrest pressure & population dynamics
  const adminLevels = tiles.reduce((sum, t) => sum + t.buildings.administrativo, 0);
  const tech = techEffects(faction);
  const shortagePressure = 0;
  const foodShortage = false;
  const overCapPressure = eco.overCapacity ? 3 : 0;
  const modifierUnrest = activeModifiersFor(state, factionId).reduce(
    (sum, m) => sum + (m.unrestPerCycle ?? 0),
    0,
  );

  for (const tile of tiles) {
    const dev = developmentOf(tile);
    const popCap = 10 + dev * 0.85 + (tile.isCapital ? 8 : 0);
    const falloff = 2.2 + adminLevels * 0.5 + (tile.isCapital ? 0.8 : 0);
    const reduction = 1 - Math.min(0.5, tech.unrestReduction);
    let unrest = tile.unrest;
    // Segurança patrimonial acalma a operação local e reduz perdas.
    unrest -= falloff * reduction + tile.buildings.defesa * 0.8;
    unrest += shortagePressure + overCapPressure + modifierUnrest;
    if (tile.pop > popCap) unrest += 2.5;
    if (tile.pop < 0.45 * popCap) unrest += 0.4;
    tile.unrest = clamp(round1(unrest), 0, 100);

    let pop = tile.pop;
    const laborGap = Math.max(0, (jobsOf(tile) - tile.pop) / Math.max(1, jobsOf(tile)));
    if (foodShortage) {
      pop *= 0.985;
    } else if (tile.unrest < 55) {
      pop *= 1 + 0.006 * (1 - pop / Math.max(1, popCap)) + 0.035 * laborGap;
    } else if (tile.unrest > 72) {
      pop *= 0.995;
    }
    if (pop > popCap) pop *= 0.994;
    tile.pop = round1(clamp(pop, 1, 90));
  }

  // Caixa vazio desorganiza a operação; escassez de alimentos pressiona as ruas.
  if (faction.stocks.creditos <= 0.1 && eco.finance.net < 0) {
    for (const tile of tiles) tile.unrest = clamp(tile.unrest + 2.5, 0, 100);
  }
  if (foodShortage) {
    for (const tile of tiles) tile.unrest = clamp(tile.unrest + 1.2, 0, 100);
  }

  return eco;
}

export function canAfford(stocks: Stocks, cost: Partial<Stocks>): boolean {
  return stocks.creditos + 1e-9 >= moneyOf(cost);
}

/** Todo custo é pago em caixa: a companhia compra os insumos que precisa. */
export function payCost(stocks: Stocks, cost: Partial<Stocks>): void {
  stocks.creditos = round1(Math.max(0, stocks.creditos - moneyOf(cost)));
}

export function missingResources(stocks: Stocks, cost: Partial<Stocks>): ResourceKey[] {
  return stocks.creditos + 1e-9 < moneyOf(cost) ? ['creditos'] : [];
}

export function describeCost(cost: Partial<Stocks>): string {
  const total = moneyOf(cost);
  return total > 0 ? `R$ ${Math.round(total).toLocaleString('pt-BR')}` : 'sem custo';
}

export function relationCount(state: GameState, factionId: FactionId): number {
  return Object.keys(state.diplomacy).filter(
    (key) => key.includes(factionId) && hasActivePact(state.diplomacy[key]),
  ).length;
}

export function relKey(a: FactionId, b: FactionId): string {
  return relationKey(a, b);
}
