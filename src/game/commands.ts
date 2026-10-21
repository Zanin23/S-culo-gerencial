import {
  BUILDINGS,
  FACTIONS,
  GAME,
  HQ_STAGES,
  MAX_HQ_BUILD,
  MAX_UNIT_BUILD,
  MAX_UNIT_RANGE,
  RESOURCES,
  RESOURCE_KEYS,
  RESOURCE_VALUE,
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
  moneyOf,
  missingResources,
  payCost,
  projectSlotsOf,
  researchDiscountFor,
  slotsOf,
  techEffects,
  usedSlots,
} from './economy';
import { getRelation, offerLabel, proposeCost, relationKey, relationRequirement } from './diplomacy';
import { COUNTRY_BY_ID, cityById } from './atlas';
import {
  buildLevel,
  canOpenOperation,
  canOpenSector,
  MAX_UNITS_PER_CITY,
  nextBuildStep,
  nextRangeStep,
  operationCost,
  rangeLevel,
  unitExpansionCost,
} from './operations';
import { seatBuildLevel } from './hq';
import { scoreOf } from './progress';
import { neighborsOf, tilesOfFaction } from './map';
import { logEntry } from './state';
import type {
  BuildingKey,
  CommandResult,
  FactionId,
  GameState,
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
    fail(`Caixa insuficiente: faltam R$ ${Math.max(0, Math.round(moneyOf(cost) - faction.stocks.creditos)).toLocaleString('pt-BR')}.`);
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
    if (!tile) fail('Praça não encontrada.');
    if (tile.owner !== factionId) fail('Você só pode construir em praças onde a companhia opera.');
    const current = tile.buildings[building] ?? 0;
    if (current >= 3) fail(`${BUILDINGS[building].name} já está no nível máximo nesta praça.`);
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
      fail('Já há uma obra desta estrutura em andamento nesta praça.');
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
    // Pesquisa é paga em caixa; P&D e conhecimento entram convertidos.
    const discounted = {
      conhecimento: Math.max(1, Math.round(def.cost.conhecimento * (1 - discount))),
      creditos: Math.max(1, Math.round(def.cost.creditos * (1 - discount))),
    };
    const cost = { creditos: Math.round(moneyOf(discounted)) };
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
  // Licença paga em caixa: matérias-primas e relações entram convertidas.
  const total = credits + materias * RESOURCE_VALUE.materias + influencia * RESOURCE_VALUE.influencia;
  return { creditos: Math.round(total) };
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
    if (!target) fail('Praça não encontrada.');
    if (target.owner !== null) fail('Esta praça já tem uma companhia operando. Negocie ou escolha outra rota.');
    if (!expansionAnchor(next, factionId, target)) fail('A expansão precisa de uma praça sua ao lado.');
    const owned = tilesOfFaction(next.tiles, factionId);
    const reserved = owned.length + activeProjects(next, factionId).filter((p) => p.kind === 'expansao').length;
    const capacity = adminCapacityOfState(next, factionId);
    if (reserved >= capacity) {
      fail(`Capacidade administrativa esgotada (${reserved}/${capacity}). Construa Centros Administrativos ou pesquise Administração Civil.`);
    }
    if (next.projects.some((p) => p.tileId === target.id && p.kind === 'expansao')) {
      fail('Já existe uma licença em preparação para esta praça.');
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
      label: `Licença para ${target.name}`,
      cost,
      startedCycle: next.cycle,
      completesCycle: next.cycle + 2,
    };
    next.projects.push(project);
    logEntry(next, 'expansao', `${FACTIONS[factionId].short}: licença protocolada para operar em ${target.name}.`, factionId);
    return `Licença protocolada para ${target.name}. A entrada no mercado é efetivada no ciclo ${project.completesCycle}.`;
  });
}

// ── Diplomacy ───────────────────────────────────────────────────────────────

export const GIFT_COST = { creditos: 65 };

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
    const cost = { creditos: Math.round(proposeCost(kind) * RESOURCE_VALUE.influencia) };
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);

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
    const sectorBlocked = canOpenSector(next, factionId, cityId, sector, scoreOf(next, factionId));
    if (sectorBlocked) fail(sectorBlocked);
    const cost = operationCost(city, sector, 1);
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);
    const operation: Operation = {
      id: `op_${++next.nextId}`,
      factionId,
      cityId,
      countryId: city.countryId,
      sector,
      units: 1,
      openedCycle: next.cycle,
    };
    next.operations.push(operation);
    logEntry(
      next,
      'operacoes',
      `${FACTIONS[factionId].short} abriu ${SECTORS[sector].name} em ${city.name} (${COUNTRY_BY_ID[city.countryId]?.name ?? city.countryId}).`,
      factionId,
    );
    return `${SECTORS[sector].name} aberta em ${city.name}.`;
  });
}

export function expandOperation(state: GameState, factionId: FactionId, operationId: string): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    const operation = next.operations.find((op) => op.id === operationId);
    if (!operation) fail('Operação não encontrada.');
    if (operation.factionId !== factionId) fail('Esta operação pertence a outra companhia.');
    if (operation.units >= MAX_UNITS_PER_CITY) fail('Esta unidade já está no tamanho máximo.');
    const city = cityById(operation.cityId);
    if (!city) fail('Cidade da operação não existe mais no atlas.');
    const cost = operationCost(city, operation.sector, operation.units + 1);
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);
    operation.units += 1;
    logEntry(next, 'operacoes', `${FACTIONS[factionId].short}: ${SECTORS[operation.sector].short} em ${city.name} agora opera com ${operation.units} unidades.`, factionId);
    return `${city.name}: ${SECTORS[operation.sector].short} com ${operation.units} unidades.`;
  });
}

export function closeOperation(state: GameState, factionId: FactionId, operationId: string): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    factionOf(next, factionId);
    const operation = next.operations.find((op) => op.id === operationId);
    if (!operation) fail('Unidade não encontrada.');
    if (operation.factionId !== factionId) fail('Esta unidade pertence a outra companhia.');
    const city = cityById(operation.cityId);
    next.operations = next.operations.filter((op) => op.id !== operationId);
    logEntry(next, 'operacoes', `${FACTIONS[factionId].short} vendeu a operação de ${city?.name ?? 'uma cidade'}.`, factionId);
    return `Operação encerrada em ${city?.name ?? 'cidade'}.`;
  });
}

// ── Expansões da unidade (construção e ramo) ────────────────────────────────

function ownedOperation(next: GameState, factionId: FactionId, operationId: string): Operation {
  const operation = next.operations.find((op) => op.id === operationId);
  if (!operation) fail('Unidade não encontrada.');
  if (operation.factionId !== factionId) fail('Esta unidade pertence a outra companhia.');
  return operation;
}

export function expandUnitBuild(state: GameState, factionId: FactionId, operationId: string): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    const operation = ownedOperation(next, factionId, operationId);
    if (buildLevel(operation) >= MAX_UNIT_BUILD) fail('A construção desta unidade já está no máximo.');
    const step = nextBuildStep(operation);
    if (!step) fail('Não há mais expansões de construção disponíveis.');
    const city = cityById(operation.cityId);
    if (!city) fail('Cidade da operação não existe mais no atlas.');
    const cost = unitExpansionCost(city, operation.sector, 'build', buildLevel(operation));
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);
    operation.build = buildLevel(operation) + 1;
    logEntry(
      next,
      'operacoes',
      `${FACTIONS[factionId].short}: ${step.name} concluída em ${city.name} (${SECTORS[operation.sector].short}).`,
      factionId,
    );
    return `${step.name} concluída em ${city.name}.`;
  });
}

export function expandUnitBusiness(state: GameState, factionId: FactionId, operationId: string): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    const operation = ownedOperation(next, factionId, operationId);
    if (rangeLevel(operation) >= MAX_UNIT_RANGE) fail('O ramo de negócio desta unidade já está completo.');
    const step = nextRangeStep(operation);
    if (!step) fail('Não há mais expansões de negócio disponíveis.');
    const city = cityById(operation.cityId);
    if (!city) fail('Cidade da operação não existe mais no atlas.');
    const cost = unitExpansionCost(city, operation.sector, 'range', rangeLevel(operation));
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);
    operation.range = rangeLevel(operation) + 1;
    logEntry(
      next,
      'operacoes',
      `${FACTIONS[factionId].short}: ${step.name} no ramo de ${SECTORS[operation.sector].short} em ${city.name}.`,
      factionId,
    );
    return `${step.name} ativada em ${city.name}.`;
  });
}

// ── Expansões da sede ───────────────────────────────────────────────────────

export function expandSeat(state: GameState, factionId: FactionId): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    if (!next.city) fail('A companhia ainda não tem sede.');
    if (factionId !== next.playerFactionId) fail('Só a companhia jogadora administra a própria sede.');
    const level = seatBuildLevel(next);
    if (level >= MAX_HQ_BUILD) fail('A sede já é um complexo matriz.');
    const stage = HQ_STAGES[level + 1];
    const cost = { creditos: stage.cost };
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);
    next.city.build = level + 1;
    logEntry(next, 'construcao', `${FACTIONS[factionId].short}: sede ampliada para ${stage.name.toLowerCase()} em ${next.city.cityName}.`, factionId);
    return `Sede ampliada: ${stage.name}.`;
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
  if (tile.owner !== factionId) return { ok: false, reason: 'Esta praça não é sua operação.', cost: null, cycles: null };
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
    if (host.owner && host.owner !== player.id) fail('A cidade está na área de outra companhia.');
    if (!host.owner) {
      // Fundar a sede instala a matriz no país anfitrião (primeira decisão do jogador).
      const own = tilesOfFaction(next.tiles, player.id).length;
      const capacity = adminCapacityOfState(next, player.id);
      if (own > 0 && own >= capacity) fail('Capacidade administrativa esgotada para instalar a sede no país anfitrião.');
      host.owner = player.id;
      host.unrest = Math.max(host.unrest, 8);
    }
    const previous = next.tiles[player.capitalId];
    if (previous && previous.id !== host.id) previous.isCapital = false;
    host.isCapital = true;
    player.capitalId = host.id;
    next.city = {
      build: 0,
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
