import { BUILDINGS, MARKET_BASE, RESOURCES, RESOURCE_KEYS, TERRAIN, TECHS, GAME } from './constants';
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

export const POP_FOOD = 0.22;
export const POP_ENERGY = 0.08;
export const POP_GOODS = 0.012;
export const TAX_PER_POP = 0.45;
export const MILITARY_UPKEEP = 0.03;
export const BASE_ADMIN_CAPACITY = 4;

export interface EconomySources {
  base: Flow;
  nodes: Flow;
  buildings: Flow;
  taxes: Flow;
  commerce: Flow;
  institutions: Flow;
  diplomacy: Flow;
}

export interface EconomyDemands {
  population: Flow;
  industry: Flow;
  upkeep: Flow;
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
  warCount: number;
  pactCount: number;
  energyRatio: number;
  materialRatio: number;
  defense: number;
  buildingUpkeep: number;
  militaryUpkeep: number;
  researchDiscount: number;
}

const emptySources = (): EconomySources => ({
  base: EMPTY_FLOW(), nodes: EMPTY_FLOW(), buildings: EMPTY_FLOW(),
  taxes: EMPTY_FLOW(), commerce: EMPTY_FLOW(), institutions: EMPTY_FLOW(), diplomacy: EMPTY_FLOW(),
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
    militaryMult: 0,
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
    effects.militaryMult += e.militaryMult ?? 0;
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
  return BASE_ADMIN_CAPACITY + adminLevels + techEffects(faction).adminCapacity;
}

export function projectSlotsOf(faction: Faction): number {
  return GAME.baseProjectSlots + techEffects(faction).maxProjects;
}

export function defenseOf(state: GameState, tile: Tile): number {
  const owner = tile.owner ? state.factions[tile.owner] : null;
  const defenseLevels = tile.buildings.defesa;
  const terrainBonus = tile.terrain === 'montanha' ? 25 : tile.terrain === 'colina' ? 14 : 0;
  const base = defenseLevels * 18 + terrainBonus + (tile.isCapital ? 20 : 0);
  return Math.round(base * (1 + (owner ? techEffects(owner).defenseMult : 0)));
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
      const adjusted = prod * resMult * terrainBonusMult(def, tile);
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
    demands.population.alimentos += tile.pop * POP_FOOD;
    demands.population.energia += tile.pop * POP_ENERGY;
    demands.population.bens += tile.pop * POP_GOODS;
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
  const bensAvailable = faction.stocks.bens + sources.buildings.bens;
  const commerceInput = clamp(
    bensAvailable / Math.max(0.001, demands.industry.bens + demands.population.bens),
    0.4,
    1,
  );
  const commerce = commerceBase * commerceMult * commerceInput;
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

  // Security & administration
  const adminCapacity = adminCapacityOfState(state, factionId);
  const territoryCount = tiles.length;
  const overCapacity = territoryCount > adminCapacity;
  const warCount = Object.keys(state.diplomacy).filter(
    (key) => key.includes(factionId) && state.diplomacy[key].war,
  ).length;
  const militaryUpkeep = faction.military * MILITARY_UPKEEP;
  const warCost = warCount * 3;
  demands.upkeep.creditos += buildingUpkeep + militaryUpkeep + warCost;
  sources.base.creditos += 0; // terrain taxes are handled above

  const production = sumFlow(
    sources.base, sources.nodes, sources.buildings, sources.taxes,
    sources.commerce, sources.institutions, sources.diplomacy,
  );
  const demand = sumFlow(demands.population, demands.industry, demands.upkeep);

  // Input bottlenecks: energy and raw materials limit industrial & research output.
  const energyRatio = clamp(
    (faction.stocks.energia + production.energia) / Math.max(0.001, demand.energia),
    0,
    1,
  );
  const materialRatio = clamp(
    (faction.stocks.materias + production.materias) / Math.max(0.001, demand.materias),
    0,
    1,
  );
  const industryFactor = Math.min(1, Math.max(0.45, energyRatio), Math.max(0.5, materialRatio));
  const researchFactor = Math.max(0.4, energyRatio);
  if (industryFactor < 1) {
    sources.buildings.bens *= industryFactor;
    const newCommerce = commerce * Math.max(0.55, industryFactor);
    production.creditos += newCommerce - commerce;
    sources.commerce.creditos = newCommerce;
    production.bens = sources.base.bens + sources.nodes.bens + sources.buildings.bens;
  }
  if (researchFactor < 1) {
    sources.buildings.conhecimento *= researchFactor;
    production.conhecimento = sources.buildings.conhecimento + sources.institutions.conhecimento;
  }

  if (overCapacity) {
    for (const k of RESOURCE_KEYS) {
      production[k] *= 0.9;
    }
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

  const income = production.creditos;
  const expenses = demands.upkeep.creditos;

  return {
    factionId,
    production,
    demand,
    net,
    sources,
    demands,
    upkeep: buildingUpkeep + militaryUpkeep + warCost,
    commerce,
    income,
    expenses,
    shortages,
    projectedStocks: projected,
    adminCapacity,
    territoryCount,
    overCapacity,
    devSum,
    pop,
    jobs,
    laborRatio: jobs > 0 ? clamp(pop / jobs, 0, 1) : 1,
    warCount,
    pactCount: pacts.length,
    energyRatio,
    materialRatio,
    defense,
    buildingUpkeep,
    militaryUpkeep,
    researchDiscount,
  };
}

/** Applies production, demand, population growth and unrest for one faction. */
export function applyEconomy(state: GameState, factionId: FactionId): FactionEconomy {
  const faction = state.factions[factionId];
  const eco = computeEconomy(state, factionId);
  const tiles = tilesOfFaction(state.tiles, factionId);

  const actualDemand = EMPTY_FLOW();
  const deltas = EMPTY_FLOW();
  for (const k of RESOURCE_KEYS) {
    const available = faction.stocks[k] + eco.production[k];
    const paid = Math.min(available, eco.demand[k]);
    actualDemand[k] = paid;
    const after = available - paid;
    faction.stocks[k] = round1(Math.max(0, after));
    deltas[k] = round1(eco.production[k] - paid);
  }

  faction.lastFlow = deltas;
  faction.lastProduction = { ...eco.production };
  faction.lastConsumption = actualDemand;
  faction.shortages = eco.shortages;

  // Unrest pressure & population dynamics
  const adminLevels = tiles.reduce((sum, t) => sum + t.buildings.administrativo, 0);
  const tech = techEffects(faction);
  const warPressure = eco.warCount * 0.6;
  const shortagePressure = Math.min(9, eco.shortages.length * 3);
  const foodShortage = eco.shortages.includes('alimentos');
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
    unrest -= falloff * reduction;
    unrest += warPressure + shortagePressure + overCapPressure + modifierUnrest;
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

  // Consequences of empty treasury / famine
  if (faction.stocks.creditos <= 0.1 && eco.net.creditos < 0) {
    faction.military = Math.max(0, round1(faction.military - 1.5));
    for (const tile of tiles) tile.unrest = clamp(tile.unrest + 1.5, 0, 100);
  }
  if (foodShortage) {
    faction.military = Math.max(0, round1(faction.military - 0.8));
  }
  faction.military = round1(clamp(faction.military, 0, 999));

  return eco;
}

export function canAfford(stocks: Stocks, cost: Partial<Stocks>): boolean {
  return RESOURCE_KEYS.every((k) => (stocks[k] ?? 0) + 1e-9 >= (cost[k] ?? 0));
}

export function payCost(stocks: Stocks, cost: Partial<Stocks>): void {
  for (const k of RESOURCE_KEYS) {
    stocks[k] = round1(stocks[k] - (cost[k] ?? 0));
  }
}

export function missingResources(stocks: Stocks, cost: Partial<Stocks>): ResourceKey[] {
  return RESOURCE_KEYS.filter((k) => stocks[k] + 1e-9 < (cost[k] ?? 0));
}

export function describeCost(cost: Partial<Stocks>): string {
  return RESOURCE_KEYS
    .filter((k) => (cost[k] ?? 0) > 0)
    .map((k) => `${Math.round(cost[k] ?? 0)} ${RESOURCES[k].short}`)
    .join(' · ');
}

export function relationCount(state: GameState, factionId: FactionId): number {
  return Object.keys(state.diplomacy).filter(
    (key) => key.includes(factionId) && hasActivePact(state.diplomacy[key]),
  ).length;
}

export function relKey(a: FactionId, b: FactionId): string {
  return relationKey(a, b);
}
