import {
  EMPTY_FLOW,
  EMPTY_STOCKS,
  FACTIONS,
  GAME,
  MARKET_BASE,
  STARTING_MILITARY,
  STARTING_STOCKS,
} from './constants';
import { EMPTY_RELATION, RELATION_SEED, relationKey } from './diplomacy';
import { createTiles, tileId } from './map';
import { Rng } from './rng';
import { scoreOf } from './progress';
import type {
  CycleSnapshot,
  Faction,
  FactionId,
  GameState,
  LogEntry,
  LogKind,
  Relation,
  Stocks,
} from './types';


export const SAVE_KEY = 'tessera.save.v1';
export const SAVE_VERSION = GAME.saveVersion;

const AI_START: Stocks = {
  creditos: 280,
  alimentos: 90,
  energia: 46,
  materias: 92,
  bens: 20,
  influencia: 26,
  conhecimento: 7,
};

function newFaction(id: FactionId, capitalId: string, stocks: Stocks): Faction {
  return {
    id,
    stocks: { ...stocks },
    techs: [],
    capitalId,
    military: STARTING_MILITARY + (id === 'vantor' ? 25 : id === 'kestrel' ? 8 : 0),
    lastFlow: EMPTY_FLOW(),
    lastProduction: EMPTY_FLOW(),
    lastConsumption: EMPTY_FLOW(),
    shortages: [],
    debts: [],
    warExhaustion: 0,
    eliminated: false,
    lastGiftCycle: -10,
  };
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function logEntry(state: GameState, kind: LogKind, text: string, factionId?: FactionId): void {
  const entry: LogEntry = {
    id: `log_${++state.nextId}`,
    cycle: state.cycle,
    kind,
    text,
    factionId,
  };
  state.log.unshift(entry);
  if (state.log.length > 140) state.log.length = 140;
}

export function snapshot(state: GameState): CycleSnapshot {
  const faction = state.factions[state.playerFactionId];
  const tiles = Object.values(state.tiles).filter((t) => t.owner === state.playerFactionId);
  return {
    cycle: state.cycle,
    stocks: { ...faction.stocks },
    production: { ...faction.lastProduction },
    net: { ...faction.lastFlow },
    tiles: tiles.length,
    pop: Math.round(tiles.reduce((sum, t) => sum + t.pop, 0)),
    score: scoreOf(state, state.playerFactionId),
  };
}

export function createInitialState(seed = Date.now() % 1000000, now = Date.now()): GameState {
  const rng = new Rng(seed);
  const tiles = createTiles(rng);

  const factions: Record<FactionId, Faction> = {
    concordia: newFaction('concordia', tileId(-2, 1), { ...STARTING_STOCKS }),
    aurelia: newFaction('aurelia', tileId(3, -2), { ...AI_START }),
    kestrel: newFaction('kestrel', tileId(-1, -4), { ...AI_START }),
    vantor: newFaction('vantor', tileId(2, 4), { ...AI_START }),
  };

  const diplomacy: Record<string, Relation> = {};
  for (const [key, value] of Object.entries(RELATION_SEED)) {
    diplomacy[key] = { ...EMPTY_RELATION(), relation: value, since: 0 };
  }

  const prices = { ...MARKET_BASE };
  for (const key of Object.keys(prices) as Array<keyof typeof prices>) {
    prices[key] = Math.round(prices[key] * rng.between(0.92, 1.08) * 100) / 100;
  }

  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    rngState: rng.state,
    cycle: 1,
    phase: 'playing',
    playerFactionId: 'concordia',
    createdAt: now,
    factions,
    tiles,
    diplomacy,
    market: { prices, previous: { ...prices } },
    projects: [],
    offers: [],
    modifiers: [],
    log: [],
    history: [],
    pendingEventId: null,
    usedEvents: [],
    lastReport: null,
    lastBattle: null,
    victoryCycle: null,
    tutorial: { seenIntro: false, step: 0, done: false },
    settings: { showDigest: true },
    nextId: 1,
  };

  state.history.push(snapshot(state));
  logEntry(state, 'sistema', 'O Conselho de Concórdia assume o governo de Porto Lúmen.');
  logEntry(state, 'sistema', 'Quatro Casas disputam o Cinturão de Vesper. A partida começa.');
  logEntry(state, 'economia', 'Ciclo 1: o tesouro inicial financia as primeiras decisões.');
  return state;
}

export function relationBetween(state: GameState, a: FactionId, b: FactionId): Relation {
  return state.diplomacy[relationKey(a, b)] ?? EMPTY_RELATION();
}

// ── Persistence ─────────────────────────────────────────────────────────────

export interface LoadResult {
  state: GameState | null;
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural validation. A save is only trusted when the essentials are present
 *  and coherent; anything else is rejected rather than silently repaired. */
export function validateState(raw: unknown): LoadResult {
  if (!isRecord(raw)) return { state: null, error: 'O arquivo não contém um mundo válido.' };
  if (raw.version !== SAVE_VERSION) {
    return { state: null, error: 'Versão de save incompatível com esta build.' };
  }
  if (typeof raw.cycle !== 'number' || raw.cycle < 1 || !Number.isFinite(raw.cycle)) {
    return { state: null, error: 'O ciclo registrado é inválido.' };
  }
  if (!isRecord(raw.factions) || !isRecord(raw.tiles)) {
    return { state: null, error: 'Facções ou territórios ausentes.' };
  }
  const playerId = raw.playerFactionId;
  if (typeof playerId !== 'string' || !(playerId in raw.factions)) {
    return { state: null, error: 'Facção do jogador não encontrada.' };
  }
  const factions = raw.factions as Record<string, Faction>;
  for (const id of Object.keys(FACTIONS)) {
    const faction = factions[id];
    if (!faction || !isRecord(faction.stocks) || !Array.isArray(faction.techs)) {
      return { state: null, error: `Dados da facção ${id} estão corrompidos.` };
    }
    if (!Number.isFinite(faction.stocks.creditos) || faction.stocks.creditos < 0) {
      return { state: null, error: 'Tesouro inválido: os créditos não podem ser negativos.' };
    }
    if (!raw.tiles[faction.capitalId]) {
      return { state: null, error: `Capital da facção ${id} não existe no mapa.` };
    }
  }
  const tiles = raw.tiles as Record<string, { owner?: string | null; pop?: number; buildings?: unknown }>;
  const owned = Object.values(tiles).filter((t) => t.owner);
  for (const tile of owned) {
    if (typeof tile.owner !== 'string' || !(tile.owner in raw.factions)) {
      return { state: null, error: 'Há territórios com proprietário desconhecido.' };
    }
  }
  if (!isRecord(raw.diplomacy) || !isRecord(raw.market) || !Array.isArray(raw.projects)) {
    return { state: null, error: 'Registros diplomáticos ou de mercado ausentes.' };
  }
  if (!Array.isArray(raw.history) || !Array.isArray(raw.log)) {
    return { state: null, error: 'Histórico do mundo ausente.' };
  }
  if (!isRecord(raw.tutorial) || typeof raw.nextId !== 'number') {
    return { state: null, error: 'Estado de interface incompleto.' };
  }

  const state = raw as unknown as GameState;
  if (!state.pendingEventId) state.pendingEventId = null;
  if (!state.lastReport) state.lastReport = null;
  if (!Array.isArray(state.usedEvents)) state.usedEvents = [];
  if (!Array.isArray(state.modifiers)) state.modifiers = [];
  if (!Array.isArray(state.offers)) state.offers = [];
  if (!state.settings) state.settings = { showDigest: true };
  return { state, error: null };
}

export function saveState(state: GameState, storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadState(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): LoadResult {
  if (!storage) return { state: null, error: 'Armazenamento local indisponível.' };
  let text: string | null = null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { state: null, error: 'Não foi possível ler o armazenamento local.' };
  }
  if (!text) return { state: null, error: null };
  try {
    return validateState(JSON.parse(text));
  } catch {
    return { state: null, error: 'O save está ilegível e não pôde ser carregado.' };
  }
}

export function clearSave(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // Storage may be blocked; nothing else to do.
  }
}

export function exportSave(state: GameState): string {
  return JSON.stringify(state, null, 2);
}

export function importSave(text: string): LoadResult {
  try {
    return validateState(JSON.parse(text));
  } catch {
    return { state: null, error: 'O conteúdo colado não é um JSON válido.' };
  }
}

export function emptyStocks(): Stocks {
  return EMPTY_STOCKS();
}
