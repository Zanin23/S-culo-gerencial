import {
  BUILDINGS,
  FACTIONS,
  GAME,
  MARKET_KEYS,
  RESOURCES,
  RESOURCE_KEYS,
  SECTOR_ORDER,
  SECTORS,
  TECH_ORDER,
  TECHS,
} from './constants';
import {
  adminCapacityOfState,
  buildingLevelTotal,
  canAfford,
  developmentOf,
  missingResources,
  payCost,
  projectSlotsOf,
  researchDiscountFor,
  slotsOf,
  techEffects,
  usedSlots,
} from './economy';
import { applyTradeImpact, buyUnitPrice, sellUnitPrice } from './market';
import { getRelation, offerLabel, proposeCost, relationKey, relationRequirement } from './diplomacy';
import { COUNTRY_BY_ID, cityById } from './atlas';
import { canOpenOperation, operationCost } from './operations';
import { neighborsOf, tilesOfFaction } from './map';
import { logEntry } from './state';
import type {
  BuildingKey,
  CommandResult,
  FactionId,
  GameState,
  MarketKey,
  Operation,
  Project,
  ResourceKey,
  SectorKey,
  CityDistrict,
  TechId,
  Tile,
} from './types';
import { clamp, nextRandom, round1 } from './rng';

class GameError extends Error {}

function fail(message: string): never {
  throw new GameError(message);
}

export function withState(state: GameState, fn: (next: GameState) => string): CommandResult {
  const next = structuredClone(state);
  try {
    if (next.phase !== 'playing') fail('A partida foi encerrada. Inicie um novo mundo.');
    const message = fn(next);
    return { ok: true, state: next, message };
  } catch (error) {
    return {
      ok: false,
      state,
      message: error instanceof GameError ? error.message : 'A ação não pôde ser concluída.',
    };
  }
}

function factionOf(state: GameState, id: FactionId) {
  const faction = state.factions[id];
  if (!faction || faction.eliminated) fail(`${FACTIONS[id]?.name ?? 'A facção'} não está mais em jogo.`);
  return faction;
}

function requirePlaying(state: GameState): void {
  if (state.phase !== 'playing') fail('A partida foi encerrada.');
}

function requireAfford(state: GameState, factionId: FactionId, cost: Partial<Record<ResourceKey, number>>): void {
  const faction = state.factions[factionId];
  const missing = missingResources(faction.stocks, cost);
  if (missing.length) {
    const label = missing.map((k) => RESOURCES[k].label).join(', ');
    fail(`Recursos insuficientes: ${label}.`);
  }
}

function activeProjects(state: GameState, factionId: FactionId): Project[] {
  return state.projects.filter((p) => p.factionId === factionId);
}

function requireProjectSlot(state: GameState, factionId: FactionId): void {
  const faction = state.factions[factionId];
  const active = activeProjects(state, factionId).length;
  if (active >= projectSlotsOf(faction)) {
    fail(`Limite de ${projectSlotsOf(faction)} projetos simultâneos atingido. Aguarde uma conclusão ou pesquise Logística.`);
  }
}

function newProjectId(state: GameState): string {
  return `proj_${++state.nextId}`;
}

// ── Construction ────────────────────────────────────────────────────────────

export function buildingCost(building: BuildingKey, level: number): Partial<Record<ResourceKey, number>> {
  const def = BUILDINGS[building];
  const spec = def.levels[clamp(level - 1, 0, def.levels.length - 1)];
  return spec.cost;
}

export function startConstruction(
  state: GameState,
  factionId: FactionId,
  tileIdValue: string,
  building: BuildingKey,
): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    const tile = next.tiles[tileIdValue];
    if (!tile) fail('Território não encontrado.');
    if (tile.owner !== factionId) fail('Você só pode construir em territórios que controla.');
    const current = tile.buildings[building] ?? 0;
    if (current >= 3) fail(`${BUILDINGS[building].name} já está no nível máximo neste território.`);
    const targetLevel = current + 1;
    const techRequired = BUILDINGS[building].techUnlock?.[targetLevel];
    if (techRequired && !faction.techs.includes(techRequired)) {
      fail(`Requer a tecnologia ${TECHS[techRequired].name}.`);
    }
    const slots = slotsOf(tile, faction);
    if (current === 0 && usedSlots(tile) >= slots) {
      fail(`Sem espaço construível (${usedSlots(tile)}/${slots}). Melhore a Logística ou pesquise Malha Integrada.`);
    }
    if (activeProjects(next, factionId).some((p) => p.tileId === tile.id && p.building === building)) {
      fail('Já há uma obra desta estrutura em andamento neste território.');
    }
    requireProjectSlot(next, factionId);
    const cost = buildingCost(building, targetLevel);
    requireAfford(next, factionId, cost);
    const def = BUILDINGS[building];
    const cycles = def.levels[targetLevel - 1].cycles;
    payCost(faction.stocks, cost);
    const project: Project = {
      id: newProjectId(next),
      factionId,
      kind: 'construcao',
      tileId: tile.id,
      building,
      targetLevel,
      label: `${def.name} nível ${targetLevel} em ${tile.name}`,
      cost,
      startedCycle: next.cycle,
      completesCycle: next.cycle + cycles,
    };
    next.projects.push(project);
    logEntry(
      next,
      'construcao',
      `${FACTIONS[factionId].short}: obra iniciada — ${def.name} nível ${targetLevel} em ${tile.name} (${cycles} ciclos).`,
      factionId,
    );
    return `Obra iniciada: ${def.name} nível ${targetLevel} em ${tile.name}. Conclusão no ciclo ${project.completesCycle}.`;
  });
}

// ── Research ────────────────────────────────────────────────────────────────

export function startResearch(state: GameState, factionId: FactionId, techId: TechId): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    const def = TECHS[techId];
    if (!def) fail('Tecnologia desconhecida.');
    if (faction.techs.includes(techId)) fail(`${def.name} já foi pesquisada.`);
    if (activeProjects(next, factionId).some((p) => p.techId === techId)) fail('Esta pesquisa já está em andamento.');
    for (const req of def.requires) {
      if (!faction.techs.includes(req)) fail(`Requer ${TECHS[req].name} antes de ${def.name}.`);
    }
    requireProjectSlot(next, factionId);
    const discount = researchDiscountFor(next, factionId);
    const cost = {
      conhecimento: Math.max(1, Math.round(def.cost.conhecimento * (1 - discount))),
      creditos: Math.max(1, Math.round(def.cost.creditos * (1 - discount))),
    };
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);
    const cycles = def.tier >= 3 ? 3 : 2;
    const project: Project = {
      id: newProjectId(next),
      factionId,
      kind: 'pesquisa',
      tileId: next.factions[factionId].capitalId,
      techId,
      label: `Pesquisa: ${def.name}`,
      cost,
      startedCycle: next.cycle,
      completesCycle: next.cycle + cycles,
    };
    next.projects.push(project);
    logEntry(next, 'pesquisa', `${FACTIONS[factionId].short}: pesquisa de ${def.name} iniciada (${cycles} ciclos).`, factionId);
    return `Pesquisa iniciada: ${def.name}. Conclusão no ciclo ${project.completesCycle}.`;
  });
}

// ── Expansion ───────────────────────────────────────────────────────────────

export function expansionCost(state: GameState, factionId: FactionId, tile: Tile) {
  const tech = techEffects(state.factions[factionId]);
  const owned = tilesOfFaction(state.tiles, factionId).length;
  const scale = 1 + 0.1 * owned;
  const credits = Math.max(30, Math.round((90 + tile.strategic * 22) * scale * (1 + tech.expansionCostMult)));
  const materias = Math.round((15 + tile.strategic * 3) * (1 + 0.04 * owned));
  const influencia = Math.max(
    3,
    Math.round((10 + tile.strategic * 4 + owned * 2) * (1 + tech.expansionInfluenceMult)),
  );
  return { creditos: credits, materias, influencia };
}

function expansionAnchor(state: GameState, factionId: FactionId, tile: Tile): Tile | null {
  const ownNeighbors = neighborsOf(tile, state.tiles).filter((t) => t.owner === factionId);
  if (!ownNeighbors.length) return null;
  return ownNeighbors.sort((a, b) => developmentOf(b) - developmentOf(a))[0];
}

export function requiredDevelopment(tile: Tile): number {
  return 14 + tile.strategic * 4;
}

export function startExpansion(state: GameState, factionId: FactionId, targetId: string): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    const target = next.tiles[targetId];
    if (!target) fail('Território não encontrado.');
    if (target.owner !== null) fail('Este território já tem soberano. Use diplomacia ou força.');
    if (!expansionAnchor(next, factionId, target)) fail('A expansão precisa de um território seu adjacente.');
    const owned = tilesOfFaction(next.tiles, factionId);
    const reserved = owned.length + activeProjects(next, factionId).filter((p) => p.kind === 'expansao').length;
    const capacity = adminCapacityOfState(next, factionId);
    if (reserved >= capacity) {
      fail(`Capacidade administrativa esgotada (${reserved}/${capacity}). Construa Centros Administrativos ou pesquise Administração Civil.`);
    }
    if (next.projects.some((p) => p.tileId === target.id && p.kind === 'expansao')) {
      fail('Já existe uma expedição sendo preparada para este território.');
    }
    const anchor = expansionAnchor(next, factionId, target)!;
    const dev = developmentOf(anchor);
    const required = requiredDevelopment(target);
    if (dev < required) {
      fail(`${anchor.name} tem desenvolvimento ${dev}; esta rota exige ${required}. Desenvolva a base de partida.`);
    }
    requireProjectSlot(next, factionId);
    const cost = expansionCost(next, factionId, target);
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);
    const project: Project = {
      id: newProjectId(next),
      factionId,
      kind: 'expansao',
      tileId: target.id,
      label: `Expedição para ${target.name}`,
      cost,
      startedCycle: next.cycle,
      completesCycle: next.cycle + 2,
    };
    next.projects.push(project);
    logEntry(next, 'expansao', `${FACTIONS[factionId].short}: licença protocolada para operar em ${target.name}.`, factionId);
    return `Licença protocolada para ${target.name}. A entrada no mercado é efetivada no ciclo ${project.completesCycle}.`;
  });
}

// ── Market ──────────────────────────────────────────────────────────────────

export const MAX_TRADE = 60;

export function sellResource(
  state: GameState,
  factionId: FactionId,
  resource: MarketKey,
  amount: number,
): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    if (!MARKET_KEYS.includes(resource)) fail('Este recurso não é negociado no mercado.');
    const qty = Math.floor(amount);
    if (!Number.isFinite(qty) || qty < 1) fail('Informe uma quantidade válida.');
    if (qty > MAX_TRADE) fail(`O mercado aceita no máximo ${MAX_TRADE} unidades por operação.`);
    if (faction.stocks[resource] + 1e-9 < qty) fail(`Estoque insuficiente de ${RESOURCES[resource].label}.`);
    const price = sellUnitPrice(next, faction, resource);
    const revenue = round1(qty * price);
    faction.stocks[resource] = round1(faction.stocks[resource] - qty);
    faction.stocks.creditos = round1(faction.stocks.creditos + revenue);
    applyTradeImpact(next, resource, qty, 'sell');
    logEntry(next, 'economia', `${FACTIONS[factionId].short} vendeu ${qty} ${RESOURCES[resource].label} por ${Math.round(revenue)} créditos.`, factionId);
    return `Venda concluída: ${qty} ${RESOURCES[resource].label} por ${Math.round(revenue)} créditos.`;
  });
}

export function buyResource(
  state: GameState,
  factionId: FactionId,
  resource: MarketKey,
  amount: number,
): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    if (!MARKET_KEYS.includes(resource)) fail('Este recurso não é negociado no mercado.');
    const qty = Math.floor(amount);
    if (!Number.isFinite(qty) || qty < 1) fail('Informe uma quantidade válida.');
    if (qty > MAX_TRADE) fail(`O mercado aceita no máximo ${MAX_TRADE} unidades por operação.`);
    const unit = buyUnitPrice(next, resource);
    const total = round1(qty * unit);
    if (faction.stocks.creditos + 1e-9 < total) fail(`Créditos insuficientes: a compra custa ${Math.round(total)}.`);
    faction.stocks.creditos = round1(faction.stocks.creditos - total);
    faction.stocks[resource] = round1(faction.stocks[resource] + qty);
    applyTradeImpact(next, resource, qty, 'buy');
    logEntry(next, 'economia', `${FACTIONS[factionId].short} comprou ${qty} ${RESOURCES[resource].label} por ${Math.round(total)} créditos.`, factionId);
    return `Compra concluída: ${qty} ${RESOURCES[resource].label} por ${Math.round(total)} créditos.`;
  });
}

// ── Diplomacy ───────────────────────────────────────────────────────────────

export const GIFT_COST = { creditos: 50, influencia: 3 };

export function sendGift(state: GameState, factionId: FactionId, targetId: FactionId): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    factionOf(next, targetId);
    if (targetId === factionId) fail('Escolha outra potência.');
    if (faction.lastGiftCycle === next.cycle) fail('Você já enviou um presente neste ciclo.');
    const key = relationKey(factionId, targetId);
    const relation = getRelation(next, factionId, targetId);
    requireAfford(next, factionId, GIFT_COST);
    payCost(faction.stocks, GIFT_COST);
    faction.lastGiftCycle = next.cycle;
    const gain = 8 * (1 + techEffects(faction).relationGainMult);
    next.diplomacy[key] = {
      ...relation,
      relation: clamp(relation.relation + gain, -100, 100),
      since: relation.since || next.cycle,
    };
    logEntry(next, 'diplomacia', `${FACTIONS[factionId].short} enviou um presente a ${FACTIONS[targetId].short} (+${Math.round(gain)} relações).`, factionId);
    return `Presente enviado a ${FACTIONS[targetId].short}. Relações agora em ${Math.round(next.diplomacy[key].relation)}.`;
  });
}

function acceptTreaty(
  next: GameState,
  from: FactionId,
  to: FactionId,
  kind: 'trade' | 'nonAggression' | 'alliance',
): void {
  const key = relationKey(from, to);
  const relation = getRelation(next, from, to);
  const updated = { ...relation, since: next.cycle };
  if (kind === 'trade') updated.trade = true;
  if (kind === 'nonAggression') updated.nonAggression = true;
  if (kind === 'alliance') {
    updated.alliance = true;
    updated.nonAggression = true;
    updated.trade = true;
  }
  updated.relation = clamp(updated.relation + (kind === 'alliance' ? 6 : 3), -100, 100);
  next.diplomacy[key] = updated;
  logEntry(next, 'diplomacia', `${FACTIONS[from].short} e ${FACTIONS[to].short} firmaram ${offerLabel(kind).toLowerCase()}.`);
}

export function proposeTreaty(
  state: GameState,
  factionId: FactionId,
  targetId: FactionId,
  kind: 'trade' | 'nonAggression' | 'alliance',
): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    const target = factionOf(next, targetId);
    if (targetId === factionId) fail('Escolha outra potência.');
    const relation = getRelation(next, factionId, targetId);
    if (relation.alliance) fail('Já existe uma parceria estratégica com esta companhia.');
    if (kind === 'trade' && relation.trade) fail('Já existe um acordo comercial.');
    if (kind === 'nonAggression' && relation.nonAggression) fail('Já existe um pacto de não concorrência.');
    if (kind === 'alliance' && relation.alliance) fail('Já existe uma parceria estratégica.');
    if (relation.relation < relationRequirement(kind)) {
      fail(`Relações insuficientes (${Math.round(relation.relation)}/${relationRequirement(kind)}). Envie presentes ou negocie antes.`);
    }
    const influence = proposeCost(kind);
    requireAfford(next, factionId, { influencia: influence });
    payCost(faction.stocks, { influencia: influence });
    faction.stocks.influencia = round1(Math.max(0, faction.stocks.influencia));

    const targetDef = FACTIONS[targetId];
    const targetTech = techEffects(target);
    let chance = clamp(
      0.28 + (relation.relation - relationRequirement(kind)) / 90 + targetDef.diplomacyBias * 0.2 - targetDef.aggression * 0.12,
      0.05,
      0.95,
    );
    // Porte da rede pesa na negociação: quem já tem mais filiais inspira confiança.
    const myNetwork = next.operations.filter((op) => op.factionId === factionId).length;
    const theirNetwork = next.operations.filter((op) => op.factionId === targetId).length;
    chance = clamp(chance + (myNetwork - theirNetwork) * 0.01, 0.05, 0.95);
    chance += targetTech.relationGainMult * 0.05;
    const roll = nextRandom(next);
    if (roll < chance) {
      acceptTreaty(next, factionId, targetId, kind);
      return `${FACTIONS[targetId].short} aceitou: ${offerLabel(kind)} em vigor.`;
    }
    next.diplomacy[relationKey(factionId, targetId)] = {
      ...relation,
      relation: clamp(relation.relation - 2, -100, 100),
    };
    logEntry(next, 'diplomacia', `${FACTIONS[targetId].short} recusou ${offerLabel(kind).toLowerCase()} de ${FACTIONS[factionId].short}.`, factionId);
    return `${FACTIONS[targetId].short} recusou a proposta. Relações e reputação continuam influenciando novas tentativas.`;
  });
}

export function respondToOffer(state: GameState, factionId: FactionId, offerId: string, accept: boolean): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    factionOf(next, factionId);
    const offer = next.offers.find((o) => o.id === offerId);
    if (!offer) fail('Esta proposta não está mais disponível.');
    if (offer.to !== factionId) fail('Esta proposta foi feita a outra potência.');
    next.offers = next.offers.filter((o) => o.id !== offerId);
    if (accept) {
      acceptTreaty(next, offer.from, offer.to, offer.kind);
      return `Proposta aceita: ${offerLabel(offer.kind)} com ${FACTIONS[offer.from].short}.`;
    }
    const key = relationKey(offer.from, offer.to);
    const relation = getRelation(next, offer.from, offer.to);
    next.diplomacy[key] = { ...relation, relation: clamp(relation.relation - 4, -100, 100) };
    logEntry(next, 'diplomacia', `${FACTIONS[factionId].short} recusou ${offerLabel(offer.kind).toLowerCase()} de ${FACTIONS[offer.from].short}.`, factionId);
    return `Proposta recusada. ${FACTIONS[offer.from].short} reagirá à negativa.`;
  });
}

// ── Operações urbanas ───────────────────────────────────────────────────────

export function openOperation(
  state: GameState,
  factionId: FactionId,
  cityId: string,
  sector: SectorKey,
): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    if (!SECTOR_ORDER.includes(sector)) fail('Linha de negócio desconhecida.');
    const city = cityById(cityId);
    if (!city) fail('Cidade desconhecida no atlas.');
    const blocked = canOpenOperation(next, factionId, cityId);
    if (blocked) fail(blocked);
    const cost = operationCost(city, sector, 1);
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);
    const operation: Operation = {
      id: `op_${++next.nextId}`,
      factionId,
      cityId,
      countryId: city.countryId,
      sector,
      level: 1,
      openedCycle: next.cycle,
    };
    next.operations.push(operation);
    logEntry(
      next,
      'operacoes',
      `${FACTIONS[factionId].short} abriu ${SECTORS[sector].name} em ${city.name} (${COUNTRY_BY_ID[city.countryId]?.name ?? city.countryId}).`,
      factionId,
    );
    return `Filial de ${SECTORS[sector].name} aberta em ${city.name}.`;
  });
}

export function expandOperation(state: GameState, factionId: FactionId, operationId: string): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    const operation = next.operations.find((op) => op.id === operationId);
    if (!operation) fail('Operação não encontrada.');
    if (operation.factionId !== factionId) fail('Esta operação pertence a outra companhia.');
    if (operation.level >= GAME.maxOperationLevel) fail('Esta filial já está no nível máximo.');
    const city = cityById(operation.cityId);
    if (!city) fail('Cidade da operação não existe mais no atlas.');
    const cost = operationCost(city, operation.sector, operation.level + 1);
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);
    operation.level += 1;
    logEntry(next, 'operacoes', `${FACTIONS[factionId].short}: ${SECTORS[operation.sector].short} em ${city.name} chegou ao nível ${operation.level}.`, factionId);
    return `${city.name}: ${SECTORS[operation.sector].short} nível ${operation.level}.`;
  });
}

export function closeOperation(state: GameState, factionId: FactionId, operationId: string): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    factionOf(next, factionId);
    const operation = next.operations.find((op) => op.id === operationId);
    if (!operation) fail('Operação não encontrada.');
    if (operation.factionId !== factionId) fail('Esta operação pertence a outra companhia.');
    const city = cityById(operation.cityId);
    next.operations = next.operations.filter((op) => op.id !== operationId);
    logEntry(next, 'operacoes', `${FACTIONS[factionId].short} encerrou a filial de ${city?.name ?? 'uma cidade'}.`, factionId);
    return `Filial encerrada em ${city?.name ?? 'cidade'}.`;
  });
}

// ── Helpers for UI ──────────────────────────────────────────────────────────

export function canBuild(
  state: GameState,
  factionId: FactionId,
  tile: Tile,
  building: BuildingKey,
): { ok: boolean; reason: string | null; cost: Partial<Record<ResourceKey, number>> | null; cycles: number | null } {
  const faction = state.factions[factionId];
  const level = tile.buildings[building] ?? 0;
  if (tile.owner !== factionId) return { ok: false, reason: 'Território não é seu.', cost: null, cycles: null };
  if (level >= 3) return { ok: false, reason: 'Nível máximo.', cost: null, cycles: null };
  const nextLevel = level + 1;
  const techRequired = BUILDINGS[building].techUnlock?.[nextLevel];
  if (techRequired && !faction.techs.includes(techRequired)) {
    return { ok: false, reason: `Requer ${TECHS[techRequired].name}.`, cost: null, cycles: null };
  }
  if (level === 0 && usedSlots(tile) >= slotsOf(tile, faction)) {
    return { ok: false, reason: 'Sem espaço construível.', cost: null, cycles: null };
  }
  const cost = buildingCost(building, nextLevel);
  const cycles = BUILDINGS[building].levels[nextLevel - 1].cycles;
  if (!canAfford(faction.stocks, cost)) {
    return { ok: false, reason: `Faltam recursos: ${missingResources(faction.stocks, cost).map((k) => RESOURCES[k].short).join(', ')}.`, cost, cycles };
  }
  if (state.projects.filter((p) => p.factionId === factionId).length >= projectSlotsOf(faction)) {
    return { ok: false, reason: 'Sem vagas de projeto.', cost, cycles };
  }
  if (state.projects.some((p) => p.tileId === tile.id && p.building === building)) {
    return { ok: false, reason: 'Obra já em andamento.', cost, cycles };
  }
  return { ok: true, reason: null, cost, cycles };
}

export function expansionPreview(state: GameState, factionId: FactionId, tile: Tile) {
  const anchor = expansionAnchor(state, factionId, tile);
  const dev = anchor ? developmentOf(anchor) : 0;
  return {
    anchor,
    dev,
    required: requiredDevelopment(tile),
    cost: expansionCost(state, factionId, tile),
    canAfford: canAfford(state.factions[factionId].stocks, expansionCost(state, factionId, tile)),
    owned: tile.owner !== null,
    adjacent: Boolean(anchor),
  };
}

export function findTileNeighbor(state: GameState, factionId: FactionId, tile: Tile): Tile | null {
  return expansionAnchor(state, factionId, tile);
}

export function buildingLevels(tile: Tile): number {
  return buildingLevelTotal(tile);
}

export function availableTechs(state: GameState, factionId: FactionId): TechId[] {
  const faction = state.factions[factionId];
  return TECH_ORDER.filter((id) => !faction.techs.includes(id));
}

export function nationCapitals(state: GameState): Record<FactionId, string> {
  const out = {} as Record<FactionId, string>;
  for (const id of Object.keys(state.factions) as FactionId[]) out[id] = state.factions[id].capitalId;
  return out;
}

/** Funda (ou muda) a sede do jogador numa cidade real e num lote do plano 3D. */
export function foundSeat(
  state: GameState,
  cityId: string,
  plotId: string,
  district: CityDistrict,
): CommandResult {
  return withState(state, (next) => {
    const city = cityById(cityId);
    if (!city) fail('Cidade desconhecida no atlas.');
    const host = next.tiles[city.countryId];
    if (!host) fail('O país da cidade não faz parte do tabuleiro.');
    const player = next.factions[next.playerFactionId];
    if (host.owner && host.owner !== player.id) fail('A cidade está em território de outra companhia.');
    if (!host.owner) {
      // Fundar a sede anexa o país anfitrião (é a primeira decisão do jogador).
      const own = tilesOfFaction(next.tiles, player.id).length;
      const capacity = adminCapacityOfState(next, player.id);
      if (own > 0 && own >= capacity) fail('Capacidade administrativa esgotada para anexar o país-sede.');
      host.owner = player.id;
      host.unrest = Math.max(host.unrest, 8);
    }
    const previous = next.tiles[player.capitalId];
    if (previous && previous.id !== host.id) previous.isCapital = false;
    host.isCapital = true;
    player.capitalId = host.id;
    next.city = {
      cityId: city.id,
      cityName: city.name,
      countryId: city.countryId,
      plotId,
      district,
      lat: city.lat,
      lon: city.lon,
      foundedCycle: next.cycle,
    };
    logEntry(
      next,
      'sistema',
      `${FACTIONS[player.id].short} fundou a sede em ${city.name} (${COUNTRY_BY_ID[city.countryId]?.name ?? city.countryId}), distrito ${district}.`,
      player.id,
    );
    return `Sede fundada em ${city.name}.`;
  });
}
