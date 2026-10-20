import { BUILDINGS, FACTIONS, MARKET_LABELS, OBJECTIVES, TECHS } from './constants';
import { applyEconomy, adminCapacityOfState, developmentOf, techEffects } from './economy';
import { generateOffers, runAITurns } from './ai';
import { eventById, pickEvent } from './events';
import { getRelation, relationKey } from './diplomacy';
import { defenseOf } from './economy';
import { updateMarket } from './market';
import { neighborsOf, tilesOfFaction } from './map';
import { logEntry, snapshot } from './state';
import { scoreOf, VICTORY_TARGET } from './progress';
import { clamp, nextRandom, round1 } from './rng';
import type {
  BattleReport,
  CycleReport,
  FactionId,
  GameState,
  LogEntry,
  Project,
  Tile,
} from './types';

export interface AdvanceResult {
  ok: boolean;
  state: GameState;
  report: CycleReport | null;
  message: string;
}

function refund(state: GameState, project: Project, credits: number, materias: number, influence: number): void {
  const faction = state.factions[project.factionId];
  if (!faction) return;
  faction.stocks.creditos = round1(faction.stocks.creditos + Math.round((project.cost.creditos ?? 0) * credits));
  faction.stocks.materias = round1(faction.stocks.materias + Math.round((project.cost.materias ?? 0) * materias));
  faction.stocks.influencia = round1(faction.stocks.influencia + Math.round((project.cost.influencia ?? 0) * influence));
}

function relocateCapital(state: GameState, factionId: FactionId): Tile | null {
  const remaining = tilesOfFaction(state.tiles, factionId);
  if (!remaining.length) return null;
  remaining.sort((a, b) => developmentOf(b) - developmentOf(a));
  const next = remaining[0];
  next.isCapital = true;
  state.factions[factionId].capitalId = next.id;
  logEntry(state, 'militar', `${FACTIONS[factionId].short} transferiu sua capital para ${next.name}.`, factionId);
  return next;
}

function eliminate(state: GameState, factionId: FactionId): void {
  const faction = state.factions[factionId];
  if (!faction || faction.eliminated) return;
  faction.eliminated = true;
  faction.military = 0;
  state.projects = state.projects.filter((p) => p.factionId !== factionId);
  state.offers = state.offers.filter((o) => o.from !== factionId && o.to !== factionId);
  for (const tile of Object.values(state.tiles)) {
    if (tile.owner === factionId) {
      tile.owner = null;
      tile.isCapital = false;
      tile.unrest = clamp(tile.unrest + 10, 0, 100);
    }
  }
  logEntry(state, 'militar', `${FACTIONS[factionId].name} foi eliminada do Cinturão.`, factionId);
}

function resolveBattle(state: GameState, project: Project): BattleReport | null {
  const tile = state.tiles[project.tileId];
  if (!tile) return null;
  const attacker = state.factions[project.factionId];
  const defenderId = tile.owner;
  if (!attacker || !defenderId || defenderId === project.factionId) return null;
  const defender = state.factions[defenderId];
  if (!defender || defender.eliminated) return null;
  const relation = getRelation(state, project.factionId, defenderId);
  if (!relation.war) {
    refund(state, project, 0.5, 0.5, 0.5);
    logEntry(state, 'militar', `A operação contra ${tile.name} foi cancelada: a paz foi assinada antes do confronto.`, project.factionId);
    return null;
  }
  const attackerTech = techEffects(attacker);
  const defenderTech = techEffects(defender);
  const attackerStrength =
    attacker.military * 0.55 * (1 + attackerTech.militaryMult) + 12 + nextRandom(state) * 6;
  const defenderStrength =
    defenseOf(state, tile) + defender.military * 0.3 * (1 + defenderTech.defenseMult) + 8 + nextRandom(state) * 6;
  const chance = clamp(attackerStrength / (attackerStrength + defenderStrength * 0.95), 0.1, 0.9);
  const success = nextRandom(state) < chance;

  let attackerLoss = 0;
  let defenderLoss = 0;
  if (success) {
    attackerLoss = Math.round(4 + defenderStrength * 0.08 + nextRandom(state) * 4);
    defenderLoss = Math.round(8 + attackerStrength * 0.07 + nextRandom(state) * 5);
    attacker.military = Math.max(0, round1(attacker.military - attackerLoss));
    defender.military = Math.max(0, round1(defender.military - defenderLoss));
    const wasCapital = tile.isCapital;
    tile.owner = project.factionId;
    tile.isCapital = false;
    tile.unrest = clamp(35 + nextRandom(state) * 20, 0, 100);
    tile.conqueredCycle = state.cycle;
    tile.pop = round1(tile.pop * 0.9);
    for (const key of Object.keys(tile.buildings) as Array<keyof typeof tile.buildings>) {
      if (tile.buildings[key] > 0 && nextRandom(state) < 0.22) {
        tile.buildings[key] -= 1;
      }
    }
    const key = relationKey(project.factionId, defenderId);
    state.diplomacy[key] = {
      ...getRelation(state, project.factionId, defenderId),
      relation: clamp(relation.relation - 12, -100, 100),
    };
    logEntry(
      state,
      'militar',
      `${FACTIONS[project.factionId].short} conquistou ${tile.name} de ${FACTIONS[defenderId].short}. Perdas: ${attackerLoss} vs ${defenderLoss}.`,
      project.factionId,
    );
    if (wasCapital) {
      const newCapital = relocateCapital(state, defenderId);
      if (!newCapital) eliminate(state, defenderId);
    }
    if (!tilesOfFaction(state.tiles, defenderId).length) eliminate(state, defenderId);
  } else {
    attackerLoss = Math.round(8 + defenderStrength * 0.1 + nextRandom(state) * 6);
    defenderLoss = Math.round(4 + attackerStrength * 0.05 + nextRandom(state) * 4);
    attacker.military = Math.max(0, round1(attacker.military - attackerLoss));
    defender.military = Math.max(0, round1(defender.military - defenderLoss));
    tile.unrest = clamp(tile.unrest + 12, 0, 100);
    const key = relationKey(project.factionId, defenderId);
    state.diplomacy[key] = {
      ...relation,
      relation: clamp(relation.relation - 6, -100, 100),
    };
    logEntry(
      state,
      'militar',
      `A operação de ${FACTIONS[project.factionId].short} contra ${tile.name} fracassou. Perdas: ${attackerLoss} vs ${defenderLoss}.`,
      project.factionId,
    );
  }

  return {
    cycle: state.cycle,
    attacker: project.factionId,
    defender: defenderId,
    tileId: tile.id,
    tileName: tile.name,
    attackerStrength: Math.round(attackerStrength),
    defenderStrength: Math.round(defenderStrength),
    success,
    attackerLoss,
    defenderLoss,
  };
}

function completeProjects(state: GameState, completed: string[], battles: BattleReport[]): void {
  const due = state.projects
    .filter((p) => p.completesCycle <= state.cycle)
    .sort((a, b) => a.completesCycle - b.completesCycle || a.startedCycle - b.startedCycle);
  for (const project of due) {
    const faction = state.factions[project.factionId];
    if (!faction || faction.eliminated) {
      state.projects = state.projects.filter((p) => p.id !== project.id);
      continue;
    }
    const tile = state.tiles[project.tileId];
    if (project.kind === 'construcao' && project.building) {
      if (!tile || tile.owner !== project.factionId) {
        refund(state, project, 0.5, 0.5, 0);
        logEntry(state, 'construcao', `Obra perdida: o território de ${tile?.name ?? 'destino'} não pertence mais a ${FACTIONS[project.factionId].short}.`, project.factionId);
      } else {
        const level = Math.min(3, project.targetLevel ?? tile.buildings[project.building] + 1);
        tile.buildings[project.building] = level;
        completed.push(`${BUILDINGS[project.building].short} nível ${level} em ${tile.name}`);
        logEntry(state, 'construcao', `${FACTIONS[project.factionId].short}: ${BUILDINGS[project.building].name} nível ${level} concluída em ${tile.name}.`, project.factionId);
      }
    } else if (project.kind === 'pesquisa' && project.techId) {
      if (!faction.techs.includes(project.techId)) faction.techs.push(project.techId);
      completed.push(`Tecnologia ${TECHS[project.techId].name}`);
      logEntry(state, 'pesquisa', `${FACTIONS[project.factionId].short} concluiu a pesquisa ${TECHS[project.techId].name}.`, project.factionId);
    } else if (project.kind === 'expansao') {
      if (!tile) {
        // Territory disappeared; refund half.
        refund(state, project, 0.5, 0.5, 0.5);
      } else if (tile.owner === project.factionId) {
        // Already ours (should not happen).
      } else if (tile.owner !== null) {
        refund(state, project, 0.7, 0.5, 1);
        logEntry(state, 'expansao', `${FACTIONS[project.factionId].short}: a expedição a ${tile.name} foi desviada — outro poder chegou primeiro.`, project.factionId);
      } else if (tilesOfFaction(state.tiles, project.factionId).length >= adminCapacityOfState(state, project.factionId)) {
        refund(state, project, 0.8, 0.8, 1);
        logEntry(state, 'expansao', `${FACTIONS[project.factionId].short}: expedição a ${tile.name} cancelada por falta de capacidade administrativa.`, project.factionId);
      } else {
        tile.owner = project.factionId;
        tile.unrest = clamp(tile.unrest + 25, 0, 100);
        tile.conqueredCycle = state.cycle;
        tile.pop = round1(tile.pop * 0.92);
        completed.push(`Soberania sobre ${tile.name}`);
        logEntry(state, 'expansao', `${FACTIONS[project.factionId].short} proclamou soberania sobre ${tile.name}.`, project.factionId);
      }
    } else if (project.kind === 'operacao') {
      if (!tile || !tile.owner || tile.owner === project.factionId) {
        refund(state, project, 0.5, 0.5, 0.5);
      } else {
        const report = resolveBattle(state, project);
        if (report) battles.push(report);
      }
    }
    state.projects = state.projects.filter((p) => p.id !== project.id);
  }
}

function driftRelations(state: GameState): void {
  for (const [key, relation] of Object.entries(state.diplomacy)) {
    const [a, b] = key.split('|') as [FactionId, FactionId];
    if (!state.factions[a] || !state.factions[b]) continue;
    if (state.factions[a].eliminated || state.factions[b].eliminated) continue;
    const baseline = (FACTIONS[a].relationBaseline + FACTIONS[b].relationBaseline) / 2;
    let target = baseline;
    if (relation.war) target = baseline - 45;
    else if (relation.alliance) target = 78;
    else if (relation.nonAggression) target = 52;
    else if (relation.trade) target = 34;
    const speed = relation.war ? 0.018 : 0.012;
    const next = relation.relation + (target - relation.relation) * speed;
    state.diplomacy[key] = {
      ...relation,
      relation: Math.round(clamp(next, -100, 100) * 10) / 10,
    };
  }
}

function maybeTriggerEvent(state: GameState): string | null {
  if (state.pendingEventId) return null;
  const firstEvent = state.cycle === 5 && state.usedEvents.length === 0;
  const scheduled = state.cycle >= 5 && state.cycle % 5 === 0 && nextRandom(state) < 0.7;
  if (!firstEvent && !scheduled) return null;
  const eventId = pickEvent(state);
  if (!eventId) return null;
  state.pendingEventId = eventId;
  return eventById(eventId)?.title ?? null;
}

function checkEnd(state: GameState): void {
  if (state.phase !== 'playing') return;
  const playerId = state.playerFactionId;
  const playerTiles = tilesOfFaction(state.tiles, playerId).length;
  if (playerTiles === 0 || state.factions[playerId].eliminated) {
    state.phase = 'defeat';
    state.victoryCycle = state.cycle;
    logEntry(state, 'sistema', 'Concórdia perdeu todos os seus territórios. A campanha terminou.', playerId);
    return;
  }
  if (scoreOf(state, playerId) >= VICTORY_TARGET) {
    state.phase = 'victory';
    state.victoryCycle = state.cycle;
    logEntry(state, 'sistema', `Hegemonia consolidada no ciclo ${state.cycle}. ${FACTIONS[playerId].name} lidera o Cinturão.`, playerId);
    return;
  }
  for (const id of Object.keys(state.factions) as FactionId[]) {
    if (id === playerId || state.factions[id].eliminated) continue;
    if (scoreOf(state, id) >= VICTORY_TARGET) {
      state.phase = 'defeat';
      state.victoryCycle = state.cycle;
      logEntry(state, 'sistema', `${FACTIONS[id].name} alcançou a hegemonia do Cinturão antes de Concórdia.`, id);
      return;
    }
  }
}

export function advanceCycle(state: GameState): AdvanceResult {
  if (state.phase !== 'playing') {
    return { ok: false, state, report: null, message: 'A campanha já foi encerrada.' };
  }
  if (state.pendingEventId) {
    return { ok: false, state, report: null, message: 'Resolva o evento pendente antes de avançar.' };
  }
  const next = structuredClone(state);
  const startStocks = { ...next.factions[next.playerFactionId].stocks };
  const previousLogIds = new Set(next.log.map((entry) => entry.id));
  const completed: string[] = [];
  const battles: BattleReport[] = [];

  next.cycle += 1;
  next.modifiers = next.modifiers.filter((m) => m.untilCycle >= next.cycle);
  next.offers = next.offers.filter((o) => o.expiresCycle >= next.cycle);
  next.projects = next.projects.filter((p) => !state.factions[p.factionId]?.eliminated);

  completeProjects(next, completed, battles);

  for (const id of Object.keys(next.factions) as FactionId[]) {
    if (!next.factions[id].eliminated) applyEconomy(next, id);
  }

  driftRelations(next);
  runAITurns(next);
  generateOffers(next);
  updateMarket(next);

  const eventTitle = maybeTriggerEvent(next);
  checkEnd(next);

  const player = next.factions[next.playerFactionId];
  const newLogs: LogEntry[] = next.log.filter((entry) => !previousLogIds.has(entry.id));
  const alerts = newLogs
    .filter((entry) => ['militar', 'diplomacia', 'evento', 'sistema'].includes(entry.kind))
    .filter((entry) => !entry.factionId || entry.factionId !== next.playerFactionId)
    .slice(0, 4)
    .map((entry) => entry.text);

  const deltas = { ...startStocks };
  for (const key of Object.keys(deltas) as Array<keyof typeof deltas>) {
    deltas[key] = round1(player.stocks[key] - startStocks[key]);
  }

  if (player.shortages.length) {
    alerts.unshift(
      `Recursos em déficit: ${player.shortages.map((r) => MARKET_LABELS[r as keyof typeof MARKET_LABELS] ?? r).join(', ')}.`,
    );
  }

  const report: CycleReport = {
    cycle: next.cycle,
    deltas,
    production: { ...player.lastProduction },
    consumption: { ...player.lastConsumption },
    completed,
    events: eventTitle ? [eventTitle] : [],
    shortages: [...player.shortages],
    battles,
    alerts,
    notable: completed.length > 0 || battles.length > 0 || Boolean(eventTitle) || alerts.length > 0 || next.phase !== 'playing',
  };

  next.lastReport = report;
  next.lastBattle = battles.length ? battles[battles.length - 1] : null;
  next.history.push(snapshot(next));
  if (next.history.length > 160) next.history.splice(0, next.history.length - 160);

  const message = next.phase === 'victory'
    ? 'Hegemonia consolidada! A campanha foi vencida.'
    : next.phase === 'defeat'
      ? 'A campanha terminou em derrota.'
      : `Ciclo ${next.cycle} concluído.`;

  return { ok: true, state: next, report, message };
}

// ── UI helpers ──────────────────────────────────────────────────────────────

export function battleEstimate(state: GameState, factionId: FactionId, targetTileId: string) {
  const tile = state.tiles[targetTileId];
  if (!tile || !tile.owner || tile.owner === factionId) return null;
  const attacker = state.factions[factionId];
  const defender = state.factions[tile.owner];
  const attackerStrength = attacker.military * 0.55 * (1 + techEffects(attacker).militaryMult) + 12;
  const defenderStrength = defenseOf(state, tile) + defender.military * 0.3 * (1 + techEffects(defender).defenseMult) + 8;
  return {
    attackerStrength: Math.round(attackerStrength),
    defenderStrength: Math.round(defenderStrength),
    chance: Math.round(clamp(attackerStrength / (attackerStrength + defenderStrength * 0.95), 0.1, 0.9) * 100),
    adjacent: neighborsOf(tile, state.tiles).some((n) => n.owner === factionId),
    atWar: getRelation(state, factionId, tile.owner).war,
  };
}

export function nearbyThreats(state: GameState, factionId: FactionId): Tile[] {
  const own = tilesOfFaction(state.tiles, factionId);
  const out = new Map<string, Tile>();
  for (const tile of own) {
    for (const neighbor of neighborsOf(tile, state.tiles)) {
      if (neighbor.owner && neighbor.owner !== factionId) out.set(neighbor.id, neighbor);
    }
  }
  return [...out.values()];
}

export function objectiveList(state: GameState) {
  return OBJECTIVES.map((o) => ({ ...o }));
}

export { OBJECTIVES };
