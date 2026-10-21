import { BUILDINGS, FACTIONS, MARKET_LABELS, OBJECTIVES, TECHS } from './constants';
import { applyEconomy, adminCapacityOfState, developmentOf, moneyOf } from './economy';
import { generateOffers, runAITurns } from './ai';
import { eventById, pickEvent } from './events';
import { getRelation, relationKey } from './diplomacy';
import { updateMarket } from './market';
import { neighborsOf, tilesOfFaction } from './map';
import { logEntry, snapshot } from './state';
import { scoreOf, VICTORY_TARGET } from './progress';
import { clamp, nextRandom, round1 } from './rng';
import type {
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
  // A obra foi paga em caixa: o reembolso devolve a parcela correspondente em dinheiro.
  const returned = moneyOf({
    creditos: (project.cost.creditos ?? 0) * credits,
    materias: (project.cost.materias ?? 0) * materias,
    influencia: (project.cost.influencia ?? 0) * influence,
  });
  faction.stocks.creditos = round1(faction.stocks.creditos + Math.round(returned));
}

function completeProjects(state: GameState, completed: string[]): void {
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
        logEntry(state, 'construcao', `Obra perdida: a praça de ${tile?.name ?? 'destino'} não pertence mais a ${FACTIONS[project.factionId].short}.`, project.factionId);
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
        logEntry(state, 'expansao', `${FACTIONS[project.factionId].short}: a licença para ${tile.name} foi perdida — outra companhia chegou primeiro.`, project.factionId);
      } else if (tilesOfFaction(state.tiles, project.factionId).length >= adminCapacityOfState(state, project.factionId)) {
        refund(state, project, 0.8, 0.8, 1);
        logEntry(state, 'expansao', `${FACTIONS[project.factionId].short}: entrada em ${tile.name} cancelada por falta de capacidade administrativa.`, project.factionId);
      } else {
        tile.owner = project.factionId;
        tile.unrest = clamp(tile.unrest + 25, 0, 100);
        tile.conqueredCycle = state.cycle;
        tile.pop = round1(tile.pop * 0.92);
        completed.push(`Operação em ${tile.name}`);
        logEntry(state, 'expansao', `${FACTIONS[project.factionId].short} passou a operar em ${tile.name}.`, project.factionId);
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
    if (relation.alliance) target = 78;
    else if (relation.nonAggression) target = 52;
    else if (relation.trade) target = 34;
    const speed = 0.012;
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

export const INSOLVENCY_CYCLES = 6;

/**
 * Sem guerra, a saída do jogo é financeira: caixa zerado com resultado negativo
 * por seis ciclos encerra a companhia. As filiais fecham e os mercados voltam a
 * ficar livres para expansão.
 */
export function resolveInsolvency(state: GameState): FactionId[] {
  const fallen: FactionId[] = [];
  for (const id of Object.keys(state.factions) as FactionId[]) {
    const faction = state.factions[id];
    if (faction.eliminated) continue;
    if (faction.deficitCycles === 3) {
      logEntry(state, 'economia', `${FACTIONS[id].short}: terceiro ciclo no vermelho. Sem caixa, a operação começa a fechar filiais.`, id);
      continue;
    }
    if (faction.deficitCycles < INSOLVENCY_CYCLES) continue;
    faction.eliminated = true;
    faction.deficitCycles = 0;
    const closed = state.operations.filter((op) => op.factionId === id).length;
    state.operations = state.operations.filter((op) => op.factionId !== id);
    const tiles = tilesOfFaction(state.tiles, id);
    for (const tile of tiles) {
      tile.owner = null;
      tile.unrest = clamp(tile.unrest + 20, 0, 100);
    }
    state.projects = state.projects.filter((project) => project.factionId !== id);
    fallen.push(id);
    logEntry(state, 'sistema', `${FACTIONS[id].name} entrou em insolvência: ${closed} filial(is) e ${tiles.length} mercado(s) foram encerrados.`, id);
  }
  return fallen;
}

function checkEnd(state: GameState): void {
  if (state.phase !== 'playing') return;
  const playerId = state.playerFactionId;
  const playerTiles = tilesOfFaction(state.tiles, playerId).length;
  if (playerTiles === 0 || state.factions[playerId].eliminated) {
    state.phase = 'defeat';
    state.victoryCycle = state.cycle;
    logEntry(state, 'sistema', 'Concórdia perdeu todos os seus mercados. A campanha terminou.', playerId);
    return;
  }
  if (scoreOf(state, playerId) >= VICTORY_TARGET) {
    state.phase = 'victory';
    state.victoryCycle = state.cycle;
    logEntry(state, 'sistema', `Liderança consolidada no ciclo ${state.cycle}. ${FACTIONS[playerId].name} dita o mercado global.`, playerId);
    return;
  }
  for (const id of Object.keys(state.factions) as FactionId[]) {
    if (id === playerId || state.factions[id].eliminated) continue;
    if (scoreOf(state, id) >= VICTORY_TARGET) {
      state.phase = 'defeat';
      state.victoryCycle = state.cycle;
      logEntry(state, 'sistema', `${FACTIONS[id].name} alcançou a liderança do mercado antes de Concórdia.`, id);
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

  next.cycle += 1;
  next.modifiers = next.modifiers.filter((m) => m.untilCycle >= next.cycle);
  next.offers = next.offers.filter((o) => o.expiresCycle >= next.cycle);
  next.projects = next.projects.filter((p) => !state.factions[p.factionId]?.eliminated);

  completeProjects(next, completed);

  let playerEco: ReturnType<typeof applyEconomy> | null = null;
  for (const id of Object.keys(next.factions) as FactionId[]) {
    if (!next.factions[id].eliminated) {
      const eco = applyEconomy(next, id);
      if (id === next.playerFactionId) playerEco = eco;
    }
  }

  resolveInsolvency(next);
  driftRelations(next);
  runAITurns(next);
  generateOffers(next);
  updateMarket(next);

  const eventTitle = maybeTriggerEvent(next);
  checkEnd(next);

  const player = next.factions[next.playerFactionId];
  const newLogs: LogEntry[] = next.log.filter((entry) => !previousLogIds.has(entry.id));
  const alerts = newLogs
    .filter((entry) => ['operacoes', 'diplomacia', 'evento', 'sistema'].includes(entry.kind))
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
    income: Math.round(playerEco?.finance.income ?? 0),
    expenses: Math.round(playerEco?.finance.expenses ?? 0),
    cash: Math.round(player.stocks.creditos),
    completed,
    events: eventTitle ? [eventTitle] : [],
    shortages: [...player.shortages],
    alerts,
    notable: completed.length > 0 || Boolean(eventTitle) || alerts.length > 0 || next.phase !== 'playing',
  };

  next.lastReport = report;
  next.history.push(snapshot(next));
  if (next.history.length > 160) next.history.splice(0, next.history.length - 160);

  const message = next.phase === 'victory'
    ? 'Liderança de mercado consolidada! A campanha foi vencida.'
    : next.phase === 'defeat'
      ? 'A campanha terminou em derrota.'
      : `Ciclo ${next.cycle} concluído.`;

  return { ok: true, state: next, report, message };
}

// ── UI helpers ──────────────────────────────────────────────────────────────

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
