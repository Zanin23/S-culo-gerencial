import {
  EMPTY_FLOW,
  EMPTY_STOCKS,
  FACTIONS,
  GAME,
  MARKET_BASE,
  STARTING_STOCKS,
} from './constants';
import { CITY_BY_ID, COUNTRY_BY_ID, cityById } from './atlas';
import { EMPTY_RELATION, RELATION_SEED, relationKey } from './diplomacy';
import { createTiles, START_SEATS } from './map';
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


export const SAVE_KEY = 'management-century.save.v5';
/** Chaves de versões anteriores do jogo: lidas uma vez e migradas. */
export const LEGACY_SAVE_KEYS = ['management-century.save.v4', 'management-century.save.v3', 'management-century.save.v2', 'tessera.save.v2'];
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
    lastFlow: EMPTY_FLOW(),
    lastProduction: EMPTY_FLOW(),
    lastConsumption: EMPTY_FLOW(),
    shortages: [],
    debts: [],
    eliminated: false,
    deficitCycles: 0,
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

/** Cidades onde o Grupo Concórdia pode fundar a sede (Portugal e Espanha). */
export const SEAT_CITIES = ['c1044', 'c1146', 'c1039', 'c746', 'c830', 'c225', 'c224', 'c205', 'c65', 'c223', 'c669'];

export interface SeatChoice {
  cityId: string;
  plotId: string;
  district: 'Centro' | 'Expansão' | 'Periferia';
}

export function seatCitiesIn(countryIds: string[]): string[] {
  return SEAT_CITIES.filter((id) => {
    const city = CITY_BY_ID[id];
    return city ? countryIds.includes(city.countryId) : false;
  });
}

export function createInitialState(seed = Date.now() % 1000000, now = Date.now(), seat?: SeatChoice): GameState {
  const rng = new Rng(seed);
  const tiles = createTiles(rng);

  const factions: Record<FactionId, Faction> = {
    concordia: newFaction('concordia', START_SEATS.concordia.capital, { ...STARTING_STOCKS }),
    aurelia: newFaction('aurelia', START_SEATS.aurelia.capital, { ...AI_START }),
    kestrel: newFaction('kestrel', START_SEATS.kestrel.capital, { ...AI_START }),
    vantor: newFaction('vantor', START_SEATS.vantor.capital, { ...AI_START }),
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
    victoryCycle: null,
    operations: [],
    tutorial: { seenIntro: false, step: 0, done: false },
    settings: { showDigest: true },
    city: null,
    nextId: 1,
  };

  if (seat) {
    const city = cityById(seat.cityId);
    if (city) {
      state.city = {
        build: 0,
        cityId: city.id,
        cityName: city.name,
        countryId: city.countryId,
        plotId: seat.plotId,
        district: seat.district,
        lat: city.lat,
        lon: city.lon,
        foundedCycle: 1,
      };
      const host = state.tiles[city.countryId];
      if (host && !host.isCapital) {
        // A capital passa a ser o país que hospeda a sede escolhida.
        const previous = state.tiles[state.factions.concordia.capitalId];
        if (previous) previous.isCapital = false;
        host.isCapital = true;
        state.factions.concordia.capitalId = host.id;
        if (host.owner === null) host.owner = 'concordia';
      }
    }
  }

  state.history.push(snapshot(state));
  const seatLabel = state.city ? `${state.city.cityName} (${COUNTRY_BY_ID[state.city.countryId]?.name ?? state.city.countryId})` : 'Lisboa';
  logEntry(state, 'sistema', `A diretoria de Concórdia assume a sede em ${seatLabel}.`);
  logEntry(state, 'sistema', 'Quatro companhias disputam o mercado global. O primeiro ciclo começa.');
  logEntry(state, 'economia', 'Ciclo 1: o caixa inicial financia as primeiras decisões.');
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
/**
 * Atualiza saves antigos para o formato atual. A v4 transforma a economia em
 * caixa único (o dinheiro paga insumos), troca filiais por unidades de negócio
 * e aposenta os recursos de Estado. A v5 adiciona as expansões de construção,
 * de ramo de negócio e da sede: as unidades antigas passam a valer como o
 * degrau inicial. Nenhuma praça, obra ou tecnologia se perde.
 */
export function migrateSave(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const version = typeof input.version === 'number' ? input.version : 0;
  if (version >= SAVE_VERSION) return input;
  const next = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  next.version = SAVE_VERSION;
  if (!Array.isArray(next.operations)) next.operations = [];
  next.operations = (next.operations as unknown[]).filter(isRecord).map((op) => {
    const units = typeof op.units === 'number' ? op.units : typeof op.level === 'number' ? op.level : 1;
    const sector = op.sector === 'logistica' ? 'porto' : op.sector;
    const build = typeof op.build === 'number' ? op.build : 0;
    const range = typeof op.range === 'number' ? op.range : 0;
    return {
      ...op,
      sector,
      units: Math.max(1, Math.min(3, Math.round(units))),
      build: Math.max(0, Math.min(3, Math.round(build))),
      range: Math.max(0, Math.min(3, Math.round(range))),
      level: undefined,
    };
  });
  if (isRecord(next.city)) {
    const build = typeof next.city.build === 'number' ? next.city.build : 0;
    next.city.build = Math.max(0, Math.min(3, Math.round(build)));
  }
  if (isRecord(next.factions)) {
    for (const faction of Object.values(next.factions)) {
      if (!isRecord(faction)) continue;
      if (isRecord(faction.stocks)) {
        for (const key of Object.keys(faction.stocks)) {
          if (key !== 'creditos') faction.stocks[key] = 0;
        }
      }
    }
  }
  if (isRecord(next.factions)) {
    for (const faction of Object.values(next.factions)) {
      if (!isRecord(faction)) continue;
      delete faction.military;
      delete faction.warExhaustion;
      if (typeof faction.deficitCycles !== 'number') faction.deficitCycles = 0;
    }
  }
  if (isRecord(next.diplomacy)) {
    for (const relation of Object.values(next.diplomacy)) {
      if (isRecord(relation)) delete relation.war;
    }
  }
  if (Array.isArray(next.projects)) {
    next.projects = next.projects.filter((project) => !isRecord(project) || project.kind !== 'operacao');
  }
  if (Array.isArray(next.offers)) {
    next.offers = next.offers.filter((offer) => !isRecord(offer) || offer.kind !== 'peace');
  }
  delete next.lastBattle;
  if (isRecord(next.lastReport)) delete next.lastReport.battles;
  if (Array.isArray(next.log)) {
    for (const entry of next.log) {
      if (isRecord(entry) && entry.kind === 'militar') entry.kind = 'operacoes';
    }
  }
  return next;
}

export function validateState(input: unknown): LoadResult {
  const raw = migrateSave(input);
  if (!isRecord(raw)) return { state: null, error: 'O arquivo não contém um mundo válido.' };
  if (raw.version !== SAVE_VERSION) {
    return { state: null, error: 'Versão de save incompatível com esta build.' };
  }
  if (typeof raw.cycle !== 'number' || raw.cycle < 1 || !Number.isFinite(raw.cycle)) {
    return { state: null, error: 'O ciclo registrado é inválido.' };
  }
  if (!isRecord(raw.factions) || !isRecord(raw.tiles)) {
    return { state: null, error: 'Companhias ou praças ausentes.' };
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
      return { state: null, error: 'Há praças com proprietário desconhecido.' };
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
  if (!Array.isArray(raw.operations)) {
    return { state: null, error: 'Registro de operações ausente.' };
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
  let legacyKey: string | null = null;
  try {
    text = storage.getItem(SAVE_KEY);
    if (!text) {
      // Campanhas salvas antes da troca de nome continuam abrindo.
      for (const key of LEGACY_SAVE_KEYS) {
        const previous = storage.getItem(key);
        if (previous) {
          text = previous;
          legacyKey = key;
          break;
        }
      }
    }
  } catch {
    return { state: null, error: 'Não foi possível ler o armazenamento local.' };
  }
  if (!text) return { state: null, error: null };
  try {
    const result = validateState(JSON.parse(text));
    if (result.state && legacyKey) {
      // Migra para a chave nova e libera a antiga.
      try {
        storage.setItem(SAVE_KEY, text);
        storage.removeItem(legacyKey);
      } catch {
        // Se o storage estiver cheio, a campanha segue legível na chave antiga.
      }
    }
    return result;
  } catch {
    return { state: null, error: 'O save está ilegível e não pôde ser carregado.' };
  }
}

export function clearSave(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): void {
  try {
    storage?.removeItem(SAVE_KEY);
    for (const key of LEGACY_SAVE_KEYS) storage?.removeItem(key);
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
