import { cityById, type AtlasCity } from './atlas';
import { SECTORS, type SectorDef } from './constants';
import { clamp } from './rng';
import type { FactionId, GameState, Operation, ResourceKey, SectorKey, Tile } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Operações urbanas: a camada de negócios da companhia.
//
// Cada filial ocupa uma cidade real e disputa o mercado local com as rivais.
// O tamanho do mercado vem da população (escala logarítmica: cidades enormes
// rendem mais, mas não infinitamente). A participação é a fatia da capacidade
// instalada da companhia no total da cidade — abrir filiais rivais dilui a
// receita de todos, o que torna a competição econômica, não militar.
// ─────────────────────────────────────────────────────────────────────────────

export interface OperationOutput {
  revenue: number;
  upkeep: number;
  inputs: Partial<Record<ResourceKey, number>>;
  share: number;
  market: number;
}

export function cityMarketSize(city: Pick<AtlasCity, 'pop'>): number {
  // 100 mil hab. → ~19; 1 milhão → ~27; 10 milhões → ~36.
  return 2 + Math.log10(1 + Math.max(0, city.pop) / 1000) * 8.5;
}

export function cityOfOperation(op: Operation): AtlasCity | undefined {
  return cityById(op.cityId);
}

export function operationsInCity(state: GameState, cityId: string): Operation[] {
  return state.operations.filter((op) => op.cityId === cityId);
}

export function operationsOf(state: GameState, factionId: FactionId): Operation[] {
  return state.operations.filter((op) => op.factionId === factionId);
}

/** Participação da filial na capacidade instalada da cidade (0..1). */
export function operationShare(state: GameState, op: Operation): number {
  const peers = operationsInCity(state, op.cityId);
  const total = peers.reduce((sum, peer) => sum + peer.level, 0) || 1;
  return clamp(op.level / total, 0, 1);
}

/** Participação média da companhia nas cidades onde já opera (0..1). */
export function averageOperationShare(state: GameState, factionId: FactionId): number {
  const own = operationsOf(state, factionId);
  if (!own.length) return 0;
  let total = 0;
  for (const op of own) {
    const peers = operationsInCity(state, op.cityId);
    const capacity = peers.reduce((sum, peer) => sum + peer.level, 0) || 1;
    total += op.level / capacity;
  }
  return total / own.length;
}

/** Bônus de rede: finanças crescem com o número de filiais da companhia. */
function networkFactor(state: GameState, op: Operation, sector: SectorDef): number {
  if (!sector.networkBonus) return 1;
  const count = operationsOf(state, op.factionId).length;
  return 1 + sector.networkBonus * Math.max(0, count - 1);
}

/**
 * Receita e custo de uma filial por ciclo. `operationsMult` vem das tecnologias
 * da companhia (mantém este módulo livre de dependência de economy.ts).
 */
export function operationOutput(
  state: GameState,
  op: Operation,
  operationsMult = 0,
  industryFactor = 1,
): OperationOutput {
  const city = cityOfOperation(op);
  const country: Tile | undefined = state.tiles[op.countryId];
  if (!city || !country) return { revenue: 0, upkeep: 0, inputs: {}, share: 0, market: 0 };
  const sector = SECTORS[op.sector];
  const market = cityMarketSize(city);
  const share = operationShare(state, op);
  const level = clamp(op.level, 1, 3);
  const levelFactor = 0.45 + 0.55 * (level / 3);
  const shareFactor = 0.5 + 0.5 * share;
  // Desordem e falta de segurança derrubam a operação local.
  const unrestFactor = clamp(1 - country.unrest / 220, 0.45, 1);
  const security = 1 + country.buildings.defesa * 0.03;
  const inputScale = op.sector === 'industria' ? clamp(industryFactor, 0.45, 1) : 1;

  const revenue =
    market * sector.revenue * levelFactor * shareFactor * unrestFactor * security *
    networkFactor(state, op, sector) * (1 + operationsMult) * inputScale;

  const upkeep = market * 0.14 * (0.6 + 0.4 * level);
  const inputs: Partial<Record<ResourceKey, number>> = {};
  for (const [key, value] of Object.entries(sector.inputs ?? {}) as Array<[ResourceKey, number]>) {
    inputs[key] = Math.round(value * level * 10) / 10;
  }
  return { revenue, upkeep, inputs, share, market };
}

/** Receita total menos custo operacional, por ciclo. */
export function operationsSummary(state: GameState, factionId: FactionId, operationsMult = 0, industryFactor = 1) {
  let revenue = 0;
  let upkeep = 0;
  const inputs: Partial<Record<ResourceKey, number>> = {};
  const list = operationsOf(state, factionId);
  for (const op of list) {
    const output = operationOutput(state, op, operationsMult, industryFactor);
    revenue += output.revenue;
    upkeep += output.upkeep;
    for (const [key, value] of Object.entries(output.inputs) as Array<[ResourceKey, number]>) {
      inputs[key] = (inputs[key] ?? 0) + (value ?? 0);
    }
  }
  return { revenue, upkeep, inputs, count: list.length, net: revenue - upkeep };
}

/** Custo para abrir (level 1) ou expandir uma filial até `targetLevel`. */
export function operationCost(city: Pick<AtlasCity, 'pop'>, sector: SectorKey, targetLevel: number) {
  const def = SECTORS[sector];
  const scale = 1 + Math.log10(1 + Math.max(0, city.pop) / 1000) * 0.6;
  const step = targetLevel <= 1 ? 1 : targetLevel * 1.55;
  return {
    creditos: Math.round(def.cost * scale * step),
    materias: Math.round(8 * step * (sector === 'industria' ? 1.8 : 1)),
    influencia: Math.max(1, Math.round(2 * step)),
  };
}

export function canOpenOperation(state: GameState, factionId: FactionId, cityId: string): string | null {
  const city = cityById(cityId);
  if (!city) return 'Cidade desconhecida.';
  const country = state.tiles[city.countryId];
  if (!country) return 'O país desta cidade não faz parte do tabuleiro.';
  if (country.owner !== factionId) return 'A companhia só opera em países que administra.';
  if (state.operations.some((op) => op.factionId === factionId && op.cityId === cityId)) {
    return 'Esta cidade já tem uma filial da companhia.';
  }
  return null;
}
