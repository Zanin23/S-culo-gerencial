import {
  AI_FACTIONS,
  BUILDINGS,
  BUILDING_ORDER,
  FACTIONS,
  TECHS,
  TECH_ORDER,
} from './constants';
import {
  adminCapacityOfState,
  computeEconomy,
  developmentOf,
  moneyOf,
  projectSlotsOf,
  researchDiscountFor,
  slotsOf,
  techEffects,
  usedSlots,
} from './economy';
import { getRelation, relationKey } from './diplomacy';
import { neighborsOf, tilesOfFaction } from './map';
import { nextRandom } from './rng';
import {
  canBuild,
  expandOperation,
  expansionCost,
  openOperation,
  expandUnitBuild,
  expandUnitBusiness,
  proposeTreaty,
  requiredDevelopment,
  sendGift,
  startConstruction,
  startExpansion,
  startResearch,
} from './commands';
import { citiesOf, cityById } from './atlas';
import { MAX_UNIT_BUILD, MAX_UNIT_RANGE, SECTORS } from './constants';
import { scoreOf } from './progress';
import type { AtlasCity } from './atlas';
import { buildLevel, operationCost, rangeLevel, unitExpansionCost } from './operations';
import type { SectorKey } from './types';
import { logEntry } from './state';
import type {
  BuildingKey,
  FactionId,
  GameState,
  MarketKey,
  TechId,
  Tile,
} from './types';

const BRANCH_AFFINITY: Record<string, Record<string, number>> = {
  mercantil: { economia: 1, logistica: 0.7, estado: 0.55, industria: 0.35 },
  industrial: { industria: 1, logistica: 0.7, economia: 0.55, estado: 0.4 },
  expansionista: { logistica: 1, estado: 0.7, economia: 0.55, industria: 0.55 },
  tecnocrata: { estado: 0.9, economia: 0.8, industria: 0.7, logistica: 0.7 },
};

const NODE_SCORE: Record<string, number> = {
  raro: 6, minerio: 5, energia: 4, fertil: 3.5, pesca: 2.5, madeira: 2, nenhum: 0,
};

function applyResult(state: GameState, result: { ok: boolean; state: GameState }): boolean {
  if (!result.ok) return false;
  Object.assign(state, result.state);
  return true;
}

function activeProjectCount(state: GameState, id: FactionId): number {
  return state.projects.filter((p) => p.factionId === id).length;
}

function projectSlotsAvailable(state: GameState, id: FactionId): boolean {
  return activeProjectCount(state, id) < projectSlotsOf(state.factions[id]);
}

function ownedTiles(state: GameState, id: FactionId): Tile[] {
  return tilesOfFaction(state.tiles, id);
}

function frontierTiles(state: GameState, id: FactionId): Tile[] {
  return ownedTiles(state, id).filter((tile) =>
    neighborsOf(tile, state.tiles).some((n) => n.owner !== id),
  );
}

function buildingSuitability(building: BuildingKey, tile: Tile): number {
  let score = 0;
  if (building === 'fazenda') {
    if (tile.node === 'fertil') score += 5;
    if (tile.terrain === 'planicie') score += 2;
  }
  if (building === 'extratora') {
    if (tile.node === 'minerio') score += 5;
    if (tile.terrain === 'montanha' || tile.terrain === 'colina') score += 3;
  }
  if (building === 'usina') {
    if (tile.node === 'energia') score += 5;
    if (tile.terrain === 'montanha') score += 1.5;
  }
  if (building === 'entreposto') {
    if (tile.terrain === 'costa') score += 4;
    if (tile.isCapital) score += 2;
  }
  if (building === 'industria') {
    if (tile.terrain === 'colina' || tile.terrain === 'planicie') score += 1.5;
    if (tile.isCapital) score += 2;
  }
  if (building === 'pesquisa') {
    if (tile.isCapital) score += 2;
    if (tile.strategic >= 3) score += 1.5;
  }
  if (building === 'administrativo' && tile.isCapital) score += 2.5;
  if (building === 'logistica' && tile.isCapital) score += 1.5;
  if (building === 'defesa') score += tile.strategic * 0.5;
  score += Math.min(2, tile.buildings.logistica * 0.5);
  score -= tile.unrest * 0.01;
  return score;
}

function bestTileFor(
  state: GameState,
  id: FactionId,
  building: BuildingKey,
  candidates: Tile[],
): Tile | null {
  let best: Tile | null = null;
  let bestScore = -Infinity;
  for (const tile of candidates) {
    if (tile.owner !== id) continue;
    if (usedSlots(tile) >= slotsOf(tile, state.factions[id]) && (tile.buildings[building] ?? 0) === 0) {
      continue;
    }
    const check = canBuild(state, id, tile, building);
    if (!check.ok) continue;
    const score = buildingSuitability(building, tile) + developmentOf(tile) * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
}

function tryBuild(state: GameState, id: FactionId, building: BuildingKey, essential = false): boolean {
  const check = canBuild(state, id, state.tiles[state.factions[id].capitalId], building);
  const reserve = essential ? 0 : expansionReserve(state, id) * 0.75;
  if (check.cost && state.factions[id].stocks.creditos - (check.cost.creditos ?? 0) < reserve) return false;
  const candidates = ownedTiles(state, id);
  const tile = bestTileFor(state, id, building, candidates);
  if (!tile) return false;
  return applyResult(state, startConstruction(state, id, tile.id, building));
}

function desiredBuildings(state: GameState, id: FactionId): BuildingKey[] {
  const faction = state.factions[id];
  const def = FACTIONS[id];
  const eco = computeEconomy(state, id);
  const tiles = ownedTiles(state, id);
  const capacity = adminCapacityOfState(state, id);
  const list: BuildingKey[] = [];

  const expansions = state.projects.filter((p) => p.factionId === id && p.kind === 'expansao').length;
  if (tiles.length + expansions >= capacity - 0.01) list.push('administrativo');

  const usinaLevels = tiles.reduce((sum, t) => sum + t.buildings.usina, 0);
  if (usinaLevels === 0 || eco.net.energia < 2) list.push('usina');

  const farmLevels = tiles.reduce((sum, t) => sum + t.buildings.fazenda, 0);
  if (farmLevels === 0 || eco.net.alimentos < 4) list.push('fazenda');

  const researchLevels = tiles.reduce((sum, t) => sum + t.buildings.pesquisa, 0);
  if (researchLevels === 0 && def.techBias > 0.55) list.push('pesquisa');

  if (def.industryBias > 0.7) list.push('industria');
  const commerceLevels = tiles.reduce((sum, t) => sum + t.buildings.entreposto, 0);
  if (commerceLevels === 0) list.push('entreposto');
  if (eco.net.materias < 3) list.push('extratora');
  if (def.aggression > 0.65 && frontierTiles(state, id).length > 0) list.push('defesa');
  if (tiles.some((t) => usedSlots(t) >= slotsOf(t, faction))) list.push('logistica');

  const unique: BuildingKey[] = [];
  for (const building of list) if (!unique.includes(building)) unique.push(building);
  return unique;
}

function tryUpgrade(state: GameState, id: FactionId): boolean {
  const faction = state.factions[id];
  if (faction.stocks.creditos < 190 + expansionReserve(state, id) * 0.5) return false;
  const candidates: Array<{ tile: Tile; building: BuildingKey }> = [];
  for (const tile of ownedTiles(state, id)) {
    for (const building of ['fazenda', 'extratora', 'usina', 'entreposto', 'industria', 'pesquisa', 'administrativo'] as BuildingKey[]) {
      const level = tile.buildings[building];
      if (level > 0 && level < 3 && canBuild(state, id, tile, building).ok) {
        candidates.push({ tile, building });
      }
    }
  }
  if (!candidates.length) return false;
  candidates.sort((a, b) => {
    const levelA = a.tile.buildings[a.building];
    const levelB = b.tile.buildings[b.building];
    return levelA - levelB || developmentOf(b.tile) - developmentOf(a.tile);
  });
  return applyResult(state, startConstruction(state, id, candidates[0].tile.id, candidates[0].building));
}

function tryBuildAny(state: GameState, id: FactionId, exclude: BuildingKey[] = []): boolean {
  const desired = desiredBuildings(state, id).filter((b) => !exclude.includes(b));
  for (const building of desired) {
    if (tryBuild(state, id, building)) return true;
  }
  return false;
}

function essentialBuilding(state: GameState, id: FactionId): BuildingKey | null {
  const eco = computeEconomy(state, id);
  const tiles = ownedTiles(state, id);
  const distribution = tiles.reduce((sum, t) => sum + t.buildings.usina, 0);
  if (distribution === 0) return 'usina';
  const expansions = state.projects.filter((p) => p.factionId === id && p.kind === 'expansao').length;
  if (tiles.length + expansions >= adminCapacityOfState(state, id)) return 'administrativo';
  const farms = tiles.reduce((sum, t) => sum + t.buildings.fazenda, 0);
  if (farms === 0 && eco.finance.net < 30) return 'fazenda';
  return null;
}

function techAffinity(id: FactionId, techId: TechId): number {
  const def = FACTIONS[id];
  const branch = TECHS[techId].branch;
  const table = BRANCH_AFFINITY[def.personality] ?? {};
  return table[branch] ?? 0.5;
}

export function candidateTechs(state: GameState, id: FactionId): TechId[] {
  const faction = state.factions[id];
  const discount = researchDiscountFor(state, id);
  return TECH_ORDER.filter((techId) => {
    const def = TECHS[techId];
    if (faction.techs.includes(techId)) return false;
    if (state.projects.some((p) => p.factionId === id && p.techId === techId)) return false;
    if (!def.requires.every((req) => faction.techs.includes(req))) return false;
    const total = moneyOf({ conhecimento: def.cost.conhecimento, creditos: def.cost.creditos }) * (1 - discount);
    return faction.stocks.creditos >= total;
  }).sort((a, b) => {
    const ta = TECHS[a];
    const tb = TECHS[b];
    const scoreA = techAffinity(id, a) * 30 - ta.tier * 5 + (ta.effects.production ? 4 : 0);
    const scoreB = techAffinity(id, b) * 30 - tb.tier * 5 + (tb.effects.production ? 4 : 0);
    return scoreB - scoreA;
  });
}

function tryResearch(state: GameState, id: FactionId): boolean {
  const candidates = candidateTechs(state, id);
  if (!candidates.length) return false;
  const faction = state.factions[id];
  const discount = researchDiscountFor(state, id);
  const creditCost = TECHS[candidates[0]].cost.creditos * (1 - discount);
  if (faction.stocks.creditos - creditCost < expansionReserve(state, id) * 0.6) return false;
  return applyResult(state, startResearch(state, id, candidates[0]));
}

export function candidateExpansions(state: GameState, id: FactionId): Tile[] {
  const faction = state.factions[id];
  const tiles = ownedTiles(state, id);
  const seen = new Set<string>();
  const options: Tile[] = [];
  for (const tile of tiles) {
    for (const neighbor of neighborsOf(tile, state.tiles)) {
      if (neighbor.owner !== null || seen.has(neighbor.id)) continue;
      seen.add(neighbor.id);
      const anchor = tile;
      if (developmentOf(anchor) < requiredDevelopment(neighbor)) continue;
      const cost = expansionCost(state, id, neighbor);
      const affordable = faction.stocks.creditos >= cost.creditos;
      if (!affordable) continue;
      options.push(neighbor);
    }
  }
  return options.sort((a, b) => {
    const score = (tile: Tile) => tile.strategic * 6 + (NODE_SCORE[tile.node] ?? 0) + tile.pop * 0.15;
    return score(b) - score(a);
  });
}

function expansionReserve(state: GameState, id: FactionId): number {
  const faction = state.factions[id];
  let cheapest: number | null = null;
  for (const tile of ownedTiles(state, id)) {
    for (const neighbor of neighborsOf(tile, state.tiles)) {
      if (neighbor.owner !== null) continue;
      if (developmentOf(tile) < requiredDevelopment(neighbor)) continue;
      const cost = expansionCost(state, id, neighbor);
      if (cheapest === null || cost.creditos < cheapest) cheapest = cost.creditos;
    }
  }
  if (cheapest !== null) return cheapest;
  // If no neutral border is ready, keep a smaller cash buffer for the next opportunity.
  return faction.stocks.creditos > 220 ? 40 : 0;
}

function tryExpand(state: GameState, id: FactionId): boolean {
  const options = candidateExpansions(state, id);
  for (const target of options.slice(0, 3)) {
    if (applyResult(state, startExpansion(state, id, target.id))) return true;
  }
  return false;
}

const SECTOR_BY_PERSONALITY: Record<string, SectorKey> = {
  mercantil: 'varejo',
  industrial: 'industria',
  expansionista: 'porto',
  tecnocrata: 'financas',
};

function openableCities(state: GameState, id: FactionId): AtlasCity[] {
  const out: AtlasCity[] = [];
  for (const tile of ownedTiles(state, id)) {
    const cities = citiesOf(tile.id)
      .slice()
      .sort((a, b) => b.pop - a.pop)
      .slice(0, 8);
    for (const city of cities) {
      if (state.operations.some((op) => op.factionId === id && op.cityId === city.id)) continue;
      out.push(city);
    }
  }
  return out;
}

/** Custo de uma unidade comparado ao caixa e à relevância da companhia. */
function branchAffordable(state: GameState, id: FactionId, city: AtlasCity, sector: SectorKey, targetUnits = 1, reserve = 0): boolean {
  const faction = state.factions[id];
  if (scoreOf(state, id) + 1e-9 < SECTORS[sector].relevance) return false;
  if (sector === 'fabrica' && !state.operations.some((op) => op.factionId === id && op.countryId === city.countryId && op.sector === 'industria')) return false;
  const cost = operationCost(city, sector, targetUnits);
  return faction.stocks.creditos - cost.creditos >= reserve;
}

/** A companhia abre filiais quando o caixa permite; prioriza as maiores cidades. */
function tryOpenOperation(state: GameState, id: FactionId): boolean {
  const preferred = SECTOR_BY_PERSONALITY[FACTIONS[id].personality] ?? 'varejo';
  const sectors: SectorKey[] = [preferred, 'fazenda', 'varejo', 'porto', 'industria', 'financas', 'fabrica'];
  const cities = openableCities(state, id).sort((a, b) => b.pop - a.pop);
  // A justa de caixa pode trocar a linha de negócio pela mais barata.
  for (const city of cities.slice(0, 8)) {
    const sector = sectors.find((key) => branchAffordable(state, id, city, key, 1));
    if (!sector) continue;
    if (nextRandom(state) > 0.5) return false;
    return applyResult(state, openOperation(state, id, city.id, sector));
  }
  return false;
}

/** Comprar expansão física ou de negócio: as rivais também crescem no lugar. */
function tryExpandUnit(state: GameState, id: FactionId): boolean {
  const faction = state.factions[id];
  const operations = state.operations.filter((op) => op.factionId === id);
  if (!operations.length) return false;
  const operation = operations[Math.floor(nextRandom(state) * operations.length)];
  const city = cityById(operation.cityId);
  if (!city) return false;
  const options: Array<'build' | 'range'> = [];
  if (buildLevel(operation) < MAX_UNIT_BUILD) options.push('build');
  if (rangeLevel(operation) < MAX_UNIT_RANGE) options.push('range');
  if (!options.length) return false;
  const kind = options[Math.floor(nextRandom(state) * options.length)];
  const level = kind === 'build' ? buildLevel(operation) : rangeLevel(operation);
  const cost = unitExpansionCost(city, operation.sector, kind, level);
  if (faction.stocks.creditos - cost.creditos < 40) return false;
  return applyResult(
    state,
    kind === 'build'
      ? expandUnitBuild(state, id, operation.id)
      : expandUnitBusiness(state, id, operation.id),
  );
}

/** Ampliar a filial existente rende mais que abrir outra em cidade pequena. */
function tryUpgradeOperation(state: GameState, id: FactionId): boolean {
  const candidates = state.operations
    .filter((op) => op.factionId === id && op.units < 3)
    .filter((op) => {
      const city = cityById(op.cityId);
      return city ? branchAffordable(state, id, city, op.sector, op.units + 1, 30) : false;
    });
  if (!candidates.length) return false;
  if (nextRandom(state) > 0.45) return false;
  const target = candidates[Math.floor(nextRandom(state) * candidates.length)];
  return applyResult(state, expandOperation(state, id, target.id));
}

function tryAIDiplomacy(state: GameState, id: FactionId): void {
  const def = FACTIONS[id];
  const faction = state.factions[id];
  const others = (Object.keys(state.factions) as FactionId[]).filter((o) => o !== id && !state.factions[o].eliminated);
  if (nextRandom(state) > 0.25) return;

  if (faction.stocks.creditos > 260 && faction.lastGiftCycle !== state.cycle) {
    const player = state.playerFactionId;
    const rel = getRelation(state, id, player);
    if (rel.relation < 18 && nextRandom(state) < 0.35) {
      applyResult(state, sendGift(state, id, player));
      return;
    }
  }

  const partners = others.filter((other) => {
    const rel = getRelation(state, id, other);
    return !rel.alliance && rel.relation >= 35;
  });
  if (!partners.length) return;
  const target = partners.sort((a, b) => getRelation(state, id, b).relation - getRelation(state, id, a).relation)[0];
  const rel = getRelation(state, id, target);
  if (!rel.trade && rel.relation >= 35) {
    applyResult(state, proposeTreaty(state, id, target, 'trade'));
  } else if (!rel.nonAggression && rel.relation >= 48) {
    applyResult(state, proposeTreaty(state, id, target, 'nonAggression'));
  }
}

export function runAITurn(state: GameState, id: FactionId): void {
  const faction = state.factions[id];
  if (faction.eliminated) return;
  const def = FACTIONS[id];
  const eco = computeEconomy(state, id);
  let acted = false;

  // 1. Expansion first: territory is the engine of long-term score.
  if (!acted && projectSlotsAvailable(state, id) && nextRandom(state) < def.expansionBias * 0.9) {
    acted = tryExpand(state, id);
  }

  // 2. Rede de filiais: abrir, comprar módulos ou expandir a unidade.
  const branchRoll = nextRandom(state);
  if (branchRoll < 0.42) tryOpenOperation(state, id);
  else if (branchRoll < 0.75) tryUpgradeOperation(state, id);
  else tryExpandUnit(state, id);

  // 3. Essential infrastructure, then research and development.
  if (!acted) {
    const essential = essentialBuilding(state, id);
    if (essential) acted = tryBuild(state, id, essential, true);
  }
  if (!acted && projectSlotsAvailable(state, id)) {
    const action = nextRandom(state);
    if (action < def.techBias * 0.65) acted = tryResearch(state, id);
    if (!acted) acted = tryBuildAny(state, id);
    if (!acted) acted = tryExpand(state, id);
    if (!acted) acted = tryResearch(state, id);
    if (!acted) acted = tryUpgrade(state, id);
  }

  // 4. Camada de mercado e acordos.
  tryAIDiplomacy(state, id);
}

export function runAITurns(state: GameState): void {
  for (const id of AI_FACTIONS) {
    runAITurn(state, id);
  }
}

// ── Offers presented to the human player ────────────────────────────────────

export function generateOffers(state: GameState): void {
  const player = state.playerFactionId;
  const pendingFrom = new Set(state.offers.map((o) => o.from));
  for (const id of AI_FACTIONS) {
    const faction = state.factions[id];
    if (faction.eliminated) continue;
    if (pendingFrom.has(id)) continue;
    if (state.offers.length >= 3) break;
    const relation = getRelation(state, id, player);
    const def = FACTIONS[id];
    let kind: 'trade' | 'nonAggression' | 'alliance' | null = null;

    if (relation.alliance) {
      continue;
    } else if (def.diplomacyBias > 0.45) {
      const chance = 0.035 + def.diplomacyBias * 0.04;
      if (!relation.trade && relation.relation >= 26 && nextRandom(state) < chance) kind = 'trade';
      else if (!relation.nonAggression && relation.relation >= 42 && nextRandom(state) < chance * 0.8) kind = 'nonAggression';
      else if (!relation.alliance && relation.relation >= 66 && nextRandom(state) < chance * 0.5) kind = 'alliance';
    }
    if (!kind) continue;
    state.offers.push({
      id: `offer_${++state.nextId}`,
      from: id,
      to: player,
      kind,
      createdCycle: state.cycle,
      expiresCycle: state.cycle + 3,
    });
    logEntry(state, 'diplomacia', `${FACTIONS[id].short} enviou uma proposta de ${kind === 'trade' ? 'acordo comercial' : kind === 'nonAggression' ? 'não concorrência' : 'parceria estratégica'} a ${FACTIONS[player].short}.`, id);
  }
}


export function relationLabelFor(state: GameState, a: FactionId, b: FactionId): string {
  const rel = getRelation(state, a, b);
  if (rel.alliance) return 'Parceria';
  if (rel.nonAggression) return 'Não concorrência';
  if (rel.trade) return 'Comércio';
  return `${Math.round(rel.relation)}`;
}

export function relationKeyOf(a: FactionId, b: FactionId): string {
  return relationKey(a, b);
}

export function buildingLabel(key: BuildingKey): string {
  return BUILDINGS[key].short;
}

export function aiDoctrineSummary(id: FactionId): string {
  const def = FACTIONS[id];
  if (def.personality === 'mercantil') return 'Varejo e acordos';
  if (def.personality === 'industrial') return 'Indústria e extração';
  if (def.personality === 'expansionista') return 'Logística e expansão';
  return 'Finanças e pesquisa';
}

export function allBuildingKeys(): BuildingKey[] {
  return BUILDING_ORDER;
}

export function techsByBranch(): Record<string, TechId[]> {
  const out: Record<string, TechId[]> = {};
  for (const id of TECH_ORDER) {
    const branch = TECHS[id].branch;
    out[branch] = out[branch] ?? [];
    out[branch].push(id);
  }
  return out;
}

export function techEffectSummary(state: GameState, id: FactionId): number {
  return techEffects(state.factions[id]).operationsMult;
}
