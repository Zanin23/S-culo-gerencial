import {
  ADJACENCY,
  COUNTRIES,
  COUNTRY_BY_ID,
  COUNTRY_INDEX,
  PROVINCES,
  type AtlasCountry,
} from './atlas';
import { BUILDINGS, FACTIONS } from './constants';
import type { Rng } from './rng';
import type { BuildingKey, FactionId, Tile } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// O tabuleiro é o mundo real: cada país é um território soberano.
// A adjacência (fronteira terrestre ou rota marítima) vem do atlas.
// ─────────────────────────────────────────────────────────────────────────────

export const START_SEATS: Record<FactionId, { capital: string; holding: string }> = {
  concordia: { capital: 'PRT', holding: 'ESP' },
  aurelia: { capital: 'ITA', holding: 'AUT' },
  kestrel: { capital: 'GBR', holding: 'IRL' },
  vantor: { capital: 'TUR', holding: 'BGR' },
};

function zeroBuildings(): Record<BuildingKey, number> {
  const record = {} as Record<BuildingKey, number>;
  for (const key of Object.keys(BUILDINGS) as BuildingKey[]) record[key] = 0;
  return record;
}

/** População de jogo derivada da população real (escala logarítmica 5–34). */
export function gamePopulation(realPopulation: number): number {
  const millions = realPopulation / 1_000_000;
  return Math.max(5, Math.min(34, Math.round(5 + 9 * Math.log10(millions + 1))));
}

function neutralBuildings(country: AtlasCountry): Partial<Record<BuildingKey, number>> {
  const out: Partial<Record<BuildingKey, number>> = {};
  const add = (key: BuildingKey, level = 1) => {
    out[key] = Math.min(2, (out[key] ?? 0) + level);
  };
  if (country.pop >= 20_000_000) add('administrativo');
  if (country.pop >= 150_000_000) add('administrativo');
  if (country.node === 'fertil' || country.pop >= 15_000_000) add('fazenda');
  if (country.node === 'minerio' || country.node === 'raro') add('extratora');
  if (country.node === 'energia') add('usina');
  if (country.node === 'pesca' || country.node === 'madeira') add('entreposto');
  if (country.strategic >= 3) add('defesa');
  if (country.pop >= 10_000_000) add('logistica');
  return out;
}

const START_BUILDINGS: Record<FactionId, Partial<Record<BuildingKey, number>>> = {
  concordia: { administrativo: 2, fazenda: 1, defesa: 1, logistica: 1, entreposto: 1 },
  aurelia: { administrativo: 2, entreposto: 2, fazenda: 1, defesa: 1, logistica: 1 },
  kestrel: { administrativo: 2, extratora: 2, usina: 1, defesa: 1, logistica: 1 },
  vantor: { administrativo: 2, extratora: 2, defesa: 2, fazenda: 1, logistica: 1 },
};

const SEAT_NOTES: Record<string, string> = {
  PRT: 'Sede da Casa Concórdia, no estuário do Tejo. O conselho governa daqui.',
  ESP: 'A fronteira sul de Concórdia. Serve de escudo e de celeiro para Lisboa.',
  ITA: 'Sede da Liga Aureliana. Os bancos de Roma financiam metade do Mediterrâneo.',
  AUT: 'O corredor alpino de Aurelia: madeira, túneis e pedágio sobre o comércio do norte.',
  GBR: 'Sede do Consórcio Kestrel. A bolsa de Londres ainda dita o preço da energia.',
  IRL: 'O celeiro atlântico de Kestrel, encravado entre rotas marítimas.',
  TUR: 'Sede do Domínio Vantor, no Bósforo. Quem controla o estreito controla a passagem.',
  BGR: 'A cabeça de ponte de Vantor nos Bálcãs, voltada para o Danúbio.',
};

export function createTiles(rng: Rng): Record<string, Tile> {
  const tiles: Record<string, Tile> = {};
  const ownedBy: Record<string, { faction: FactionId; capital: boolean }> = {};
  for (const [faction, seats] of Object.entries(START_SEATS) as Array<[FactionId, { capital: string; holding: string }]>) {
    ownedBy[seats.capital] = { faction, capital: true };
    ownedBy[seats.holding] = { faction, capital: false };
  }

  for (const country of COUNTRIES) {
    const seat = ownedBy[country.id];
    const buildings = zeroBuildings();
    const preset = seat ? START_BUILDINGS[seat.faction] : neutralBuildings(country);
    if (seat && !seat.capital) {
      for (const key of Object.keys(buildings) as BuildingKey[]) buildings[key] = 0;
      buildings.fazenda = 2;
      buildings.logistica = 1;
      buildings.administrativo = 1;
      buildings.defesa = 1;
    } else {
      for (const [key, value] of Object.entries(preset)) buildings[key as BuildingKey] = value ?? 0;
    }
    const pop = gamePopulation(country.pop);
    const tile: Tile = {
      id: country.id,
      name: country.name,
      continent: country.continent,
      capitalCity: country.capital,
      lat: country.lat,
      lon: country.lon,
      area: country.area,
      provinceCount: country.provinces,
      cityCount: country.cities,
      terrain: country.terrain,
      node: country.node,
      pop: Math.max(4, pop + (seat ? 0 : rng.int(-1, 1))),
      owner: seat ? seat.faction : null,
      buildings,
      unrest: seat ? rng.int(0, 4) : rng.int(2, 12),
      strategic: country.strategic,
      isCapital: Boolean(seat?.capital),
      note: SEAT_NOTES[country.id],
    };
    tiles[tile.id] = tile;
  }
  return tiles;
}

export function neighborsOf(tile: Tile, tiles: Record<string, Tile>): Tile[] {
  const edges = ADJACENCY[tile.id] ?? [];
  const out: Tile[] = [];
  for (const edge of edges) {
    const neighbor = tiles[edge.id];
    if (neighbor) out.push(neighbor);
  }
  return out;
}

export function isSeaRoute(a: string, b: string): boolean {
  return (ADJACENCY[a] ?? []).some((edge) => edge.id === b && edge.sea);
}

export function tilesOfFaction(tiles: Record<string, Tile>, factionId: FactionId): Tile[] {
  return Object.values(tiles)
    .filter((tile) => tile.owner === factionId)
    .sort((a, b) => (b.isCapital ? 1 : 0) - (a.isCapital ? 1 : 0) || a.name.localeCompare(b.name, 'pt-BR'));
}

export function countryInfo(id: string): AtlasCountry | null {
  return COUNTRY_BY_ID[id] ?? null;
}

export const COUNTRY_TOTAL = COUNTRIES.length;
export const PROVINCE_TOTAL = PROVINCES.length;

export function countryIndexOf(id: string): number {
  return COUNTRY_INDEX[id] ?? -1;
}

export function factionCapital(factionId: FactionId): string {
  return START_SEATS[factionId].capital;
}

export function factionHolding(factionId: FactionId): string {
  return START_SEATS[factionId].holding;
}

export function seatLabel(factionId: FactionId): string {
  const seat = START_SEATS[factionId].capital;
  return `${FACTIONS[factionId].short} · ${COUNTRY_BY_ID[seat]?.capital || COUNTRY_BY_ID[seat]?.name || seat}`;
}

/** Países neutros que fazem fronteira com o jogador — usados nos atalhos de expansão. */
export function claimableNeighbors(tiles: Record<string, Tile>, factionId: FactionId): Tile[] {
  const out = new Map<string, Tile>();
  for (const tile of tilesOfFaction(tiles, factionId)) {
    for (const neighbor of neighborsOf(tile, tiles)) {
      if (neighbor.owner === null) out.set(neighbor.id, neighbor);
    }
  }
  return [...out.values()].sort((a, b) => b.strategic - a.strategic || b.pop - a.pop);
}
