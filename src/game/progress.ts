import { AI_FACTIONS, FACTIONS, GAME, OBJECTIVES, RANKS } from './constants';
import { computeEconomy, developmentOf } from './economy';
import { hasActivePact } from './diplomacy';
import { tilesOfFaction } from './map';
import type { FactionId, GameState, ObjectiveState } from './types';
import { clamp } from './rng';

export const VICTORY_TARGET = 360;

export interface ScorePart {
  label: string;
  value: number;
  detail: string;
}

export function scoreParts(state: GameState, factionId: FactionId): ScorePart[] {
  const faction = state.factions[factionId];
  const tiles = tilesOfFaction(state.tiles, factionId);
  const devSum = tiles.reduce((sum, t) => sum + developmentOf(t), 0);
  const pacts = Object.keys(state.diplomacy).filter(
    (key) => key.includes(factionId) && hasActivePact(state.diplomacy[key]),
  ).length;
  const eco = computeEconomy(state, factionId);
  const units = state.operations
    .filter((op) => op.factionId === factionId)
    .reduce((sum, op) => sum + op.units, 0);
  const share = eco.operationCount
    ? state.operations
        .filter((op) => op.factionId === factionId)
        .reduce((sum, op) => {
          const capacity = state.operations.filter((peer) => peer.cityId === op.cityId).reduce((n, peer) => n + peer.units, 0) + 2;
          return sum + op.units / capacity;
        }, 0) / eco.operationCount
    : 0;
  return [
    { label: 'Praças', value: Math.round(tiles.length * 2.5), detail: `${tiles.length} praças licenciadas` },
    { label: 'Unidades', value: units * 3 + Math.round(share * 20), detail: `${units} unidades · ${Math.round(share * 100)}% de participação` },
    { label: 'Receita', value: Math.round(eco.operationRevenue * 0.28), detail: `R$ ${Math.round(eco.operationRevenue)}/ciclo em unidades` },
    { label: 'Estrutura', value: Math.round(devSum * 0.22), detail: `${devSum} de desenvolvimento` },
    { label: 'Tecnologia', value: faction.techs.length * 8, detail: `${faction.techs.length} × 8` },
    { label: 'Caixa', value: Math.min(10, Math.round(faction.stocks.creditos * 0.004)), detail: `R$ ${Math.round(faction.stocks.creditos)} (máx. 10)` },
    { label: 'Parcerias', value: pacts * 6, detail: `${pacts} acordos ativos` },
  ];
}

export function scoreOf(state: GameState, factionId: FactionId): number {
  return scoreParts(state, factionId).reduce((sum, part) => sum + part.value, 0);
}

export function rankOf(score: number) {
  let rank = RANKS[0];
  for (const r of RANKS) if (score >= r.min) rank = r;
  return rank;
}

export interface LeaderRow {
  id: FactionId;
  name: string;
  color: string;
  score: number;
  territories: number;
  techs: number;
  operations: number;
  units: number;
  revenue: number;
  isPlayer: boolean;
}

export function leaderboard(state: GameState): LeaderRow[] {
  return (Object.keys(state.factions) as FactionId[])
    .map((id) => {
      const faction = state.factions[id];
      return {
        id,
        name: FACTIONS[id].name,
        color: FACTIONS[id].color,
        score: scoreOf(state, id),
        territories: tilesOfFaction(state.tiles, id).length,
        techs: faction.techs.length,
        operations: state.operations.filter((op) => op.factionId === id).length,
        units: state.operations.filter((op) => op.factionId === id).reduce((sum, op) => sum + op.units, 0),
        revenue: computeEconomy(state, id).finance.income,
        isPlayer: id === state.playerFactionId,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function objectivesOf(state: GameState): ObjectiveState[] {
  const playerId = state.playerFactionId;
  const faction = state.factions[playerId];
  const tiles = tilesOfFaction(state.tiles, playerId);
  const capital = state.tiles[faction.capitalId];
  const capitalDev = capital ? developmentOf(capital) : 0;
  const pacts = Object.keys(state.diplomacy).filter(
    (key) => key.includes(playerId) && hasActivePact(state.diplomacy[key]),
  ).length;

  const operationCount = state.operations.filter((op) => op.factionId === playerId).length;
  const eco = computeEconomy(state, playerId);
  const values: Record<string, number> = {
    capital: capitalDev,
    operacoes: operationCount,
    territorios: tiles.length,
    receita: Math.round(eco.finance.income),
    tecnologia: faction.techs.length,
    relevancia: scoreOf(state, playerId),
    acordos: pacts,
  };

  return OBJECTIVES.map((def) => {
    const value = values[def.id] ?? 0;
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      progress: clamp(value, 0, def.target),
      target: def.target,
      done: value >= def.target,
      unit: def.unit,
      hint: def.hint,
      icon: def.icon,
    };
  });
}

export interface VictoryInfo {
  target: number;
  playerScore: number;
  leader: LeaderRow;
  playerRank: number;
  percent: number;
  isLeader: boolean;
  rivalClose: boolean;
}

export function victoryInfo(state: GameState): VictoryInfo {
  const board = leaderboard(state);
  const playerScore = scoreOf(state, state.playerFactionId);
  const leader = board[0];
  const playerPos = board.findIndex((row) => row.isPlayer);
  return {
    target: VICTORY_TARGET,
    playerScore,
    leader,
    playerRank: playerPos + 1,
    percent: clamp((playerScore / VICTORY_TARGET) * 100, 0, 100),
    isLeader: leader.isPlayer,
    rivalClose: !leader.isPlayer && leader.score >= VICTORY_TARGET * 0.82,
  };
}

export function aiScoreSummary(state: GameState): Array<{ id: FactionId; score: number }> {
  return AI_FACTIONS.map((id) => ({ id, score: scoreOf(state, id) }));
}

export function economySummary(state: GameState, factionId: FactionId) {
  return computeEconomy(state, factionId);
}

export function territoryCount(state: GameState, factionId: FactionId): number {
  return Object.values(state.tiles).filter((t) => t.owner === factionId).length;
}

export function gameTitle(): string {
  return `${GAME.name} — ${GAME.world}`;
}
