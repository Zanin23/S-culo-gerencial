import {
  BUILDINGS,
  FACTIONS,
  MARKET_KEYS,
  RESOURCES,
  RESOURCE_KEYS,
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
import { neighborsOf, tileId, tilesOfFaction } from './map';
import { logEntry } from './state';
import type {
  BuildingKey,
  CommandResult,
  FactionId,
  GameState,
  MarketKey,
  Project,
  ResourceKey,
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
  return 18 + tile.strategic * 5;
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
    logEntry(next, 'expansao', `${FACTIONS[factionId].short}: expedição enviada a ${target.name}.`, factionId);
    return `Expedição enviada para ${target.name}. A soberania será proclamada no ciclo ${project.completesCycle}.`;
  });
}

// ── Military ────────────────────────────────────────────────────────────────

export const RECRUIT_BATCH = 10;
export const RECRUIT_COST = { creditos: 45, bens: 3, influencia: 2 };

export function militaryCap(state: GameState, factionId: FactionId): number {
  return 60 + adminCapacityOfState(state, factionId) * 15 + (state.factions[factionId].techs.includes('es3') ? 30 : 0);
}

export function recruit(state: GameState, factionId: FactionId, batches = 1): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    const count = clamp(Math.floor(batches), 1, 5);
    const cost = {
      creditos: RECRUIT_COST.creditos * count,
      bens: RECRUIT_COST.bens * count,
      influencia: RECRUIT_COST.influencia * count,
    };
    const cap = militaryCap(next, factionId);
    if (faction.military + RECRUIT_BATCH * count > cap) {
      fail(`Limite de força militar atingido (${Math.round(faction.military)}/${cap}). Expanda a administração ou pesquise Doutrina de Defesa.`);
    }
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);
    faction.military = round1(faction.military + RECRUIT_BATCH * count);
    logEntry(next, 'militar', `${FACTIONS[factionId].short}: ${RECRUIT_BATCH * count} novas unidades incorporadas.`, factionId);
    return `${RECRUIT_BATCH * count} unidades incorporadas. Poder militar: ${Math.round(faction.military)}.`;
  });
}

export function operationCost(state: GameState, factionId: FactionId, target: Tile) {
  const defense = target.buildings.defesa;
  return {
    creditos: Math.round(150 + defense * 22 + target.strategic * 10),
    materias: 30,
    bens: 8,
    influencia: 8,
  };
}

export function startOperation(state: GameState, factionId: FactionId, targetId: string): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    const target = next.tiles[targetId];
    if (!target) fail('Território não encontrado.');
    if (!target.owner) fail('Operações militares exigem um território inimigo.');
    if (target.owner === factionId) fail('Este território já é seu.');
    const relation = getRelation(next, factionId, target.owner);
    if (!relation.war) fail(`É preciso declarar guerra a ${FACTIONS[target.owner].short} antes de atacar.`);
    if (relation.alliance) fail('Aliados não podem ser atacados.');
    if (!neighborsOf(target, next.tiles).some((t) => t.owner === factionId)) {
      fail('A operação precisa partir de um território adjacente controlado por você.');
    }
    if (faction.military < 25) fail('Poder militar insuficiente (mínimo 25). Recrute unidades.');
    if (next.projects.some((p) => p.kind === 'operacao' && p.tileId === target.id)) {
      fail('Já existe uma operação planejada contra este território.');
    }
    requireProjectSlot(next, factionId);
    const cost = operationCost(next, factionId, target);
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);
    const project: Project = {
      id: newProjectId(next),
      factionId,
      kind: 'operacao',
      tileId: target.id,
      targetFaction: target.owner,
      label: `Operação contra ${target.name}`,
      cost,
      startedCycle: next.cycle,
      completesCycle: next.cycle + 2,
    };
    next.projects.push(project);
    logEntry(next, 'militar', `${FACTIONS[factionId].short}: operação militar preparada contra ${target.name} (${FACTIONS[target.owner].short}).`, factionId);
    return `Operação preparada contra ${target.name}. O confronto ocorre no ciclo ${project.completesCycle}.`;
  });
}

export function declareWar(state: GameState, factionId: FactionId, targetId: FactionId): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    factionOf(next, targetId);
    if (targetId === factionId) fail('Uma Casa não pode declarar guerra a si mesma.');
    const key = relationKey(factionId, targetId);
    const relation = next.diplomacy[key] ?? {
      relation: 0, trade: false, nonAggression: false, alliance: false, war: false, since: 0,
    };
    if (relation.war) fail('Você já está em guerra com esta potência.');
    const cost = { influencia: 5 };
    requireAfford(next, factionId, cost);
    payCost(faction.stocks, cost);
    const hadPact = relation.trade || relation.nonAggression || relation.alliance;
    next.diplomacy[key] = {
      ...relation,
      war: true,
      trade: false,
      nonAggression: false,
      alliance: false,
      relation: clamp(relation.relation - (hadPact ? 42 : 30), -100, 100),
      since: next.cycle,
    };
    next.factions[targetId].military = round1(next.factions[targetId].military + 2);
    logEntry(next, 'militar', `${FACTIONS[factionId].short} declarou guerra a ${FACTIONS[targetId].short}.`, factionId);
    if (hadPact) logEntry(next, 'diplomacia', `Os acordos com ${FACTIONS[targetId].short} foram rompidos pela guerra.`, factionId);
    return `Guerra declarada a ${FACTIONS[targetId].short}. Prepare operações a partir de territórios adjacentes.`;
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
    if (relation.war) fail('Não é possível enviar presentes durante uma guerra.');
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
  kind: 'trade' | 'nonAggression' | 'alliance' | 'peace',
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
    updated.war = false;
  }
  if (kind === 'peace') {
    updated.war = false;
    updated.nonAggression = true;
    updated.relation = clamp(updated.relation + 10, -100, 100);
  }
  updated.relation = clamp(updated.relation + (kind === 'alliance' ? 6 : 3), -100, 100);
  next.diplomacy[key] = updated;
  logEntry(next, 'diplomacia', `${FACTIONS[from].short} e ${FACTIONS[to].short} firmaram ${offerLabel(kind).toLowerCase()}.`);
}

export function proposeTreaty(
  state: GameState,
  factionId: FactionId,
  targetId: FactionId,
  kind: 'trade' | 'nonAggression' | 'alliance' | 'peace',
): CommandResult {
  return withState(state, (next) => {
    requirePlaying(next);
    const faction = factionOf(next, factionId);
    const target = factionOf(next, targetId);
    if (targetId === factionId) fail('Escolha outra potência.');
    const relation = getRelation(next, factionId, targetId);
    if (kind === 'peace') {
      if (!relation.war) fail('Não há guerra em andamento com esta potência.');
    } else {
      if (relation.war) fail('Assine a paz antes de propor novos acordos.');
      if (relation.alliance) fail('Já existe uma aliança com esta potência.');
      if (kind === 'trade' && relation.trade) fail('Já existe um acordo comercial.');
      if (kind === 'nonAggression' && relation.nonAggression) fail('Já existe um pacto de não-agressão.');
      if (kind === 'alliance' && relation.alliance) fail('Já existe uma aliança.');
      if (relation.relation < relationRequirement(kind)) {
        fail(`Relações insuficientes (${Math.round(relation.relation)}/${relationRequirement(kind)}). Envie presentes ou negocie antes.`);
      }
    }
    const influence = proposeCost(kind);
    requireAfford(next, factionId, { influencia: influence });
    payCost(faction.stocks, { influencia: influence });
    faction.stocks.influencia = round1(Math.max(0, faction.stocks.influencia));

    const targetDef = FACTIONS[targetId];
    const targetTech = techEffects(target);
    let chance = clamp(
      0.28 + (relation.relation - relationRequirement(kind)) / 90 + targetDef.diplomacyBias * 0.2 - targetDef.aggression * 0.18,
      0.05,
      0.95,
    );
    if (kind === 'peace') {
      const myPower = faction.military + faction.stocks.creditos * 0.02;
      const theirPower = target.military + target.stocks.creditos * 0.02;
      chance = clamp(0.45 + (myPower - theirPower) / 400 + (100 - relation.relation) / 500, 0.2, 0.95);
    }
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
      if (offer.kind === 'peace') {
        const relation = getRelation(next, offer.from, offer.to);
        if (!relation.war) fail('A guerra já terminou.');
      }
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

export function tileKey(q: number, r: number): string {
  return tileId(q, r);
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
