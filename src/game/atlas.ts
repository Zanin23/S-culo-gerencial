import worldRaw from './atlas/world.json';
import outlineRaw from './atlas/outline.json';
import type { ResourceNode, TerrainKey } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Atlas estático do mundo real.
// Fonte: Natural Earth 5.1.2 (domínio público). O arquivo é gerado por
// scripts/build-atlas.py e versionado junto com o jogo.
// ─────────────────────────────────────────────────────────────────────────────

export type Rings = number[][];
export type Shapes = number[][][];
export interface CountryDetail {
  iso: string;
  country: Shapes;
  provinces: Record<string, Shapes>;
}

export interface AtlasCountry {
  id: string;
  name: string;
  continent: string;
  pop: number;
  area: number;
  lat: number;
  lon: number;
  terrain: TerrainKey;
  node: ResourceNode;
  strategic: number;
  provinces: number;
  cities: number;
  capital: string;
  neighbors: Array<[string, number]>;
}

export interface AtlasProvince {
  id: string;
  countryId: string;
  name: string;
  lat: number;
  lon: number;
  pop: number;
  cities: number;
  capital: boolean;
  area: number;
}

export interface AtlasCity {
  id: string;
  countryId: string;
  provinceId: string;
  name: string;
  lat: number;
  lon: number;
  pop: number;
  capital: boolean;
  rank: number;
}

interface RawWorld {
  version: number;
  source: string;
  countries: AtlasCountry[];
  provinces: Array<[string, number, string, number, number, number, number, number, number]>;
  cities: Array<[string, number, string, string, number, number, number, number, number]>;
}

const raw = worldRaw as unknown as RawWorld;

export const ATLAS_SOURCE = raw.source;
export const COUNTRIES: AtlasCountry[] = raw.countries;
export const COUNTRY_BY_ID: Record<string, AtlasCountry> = Object.fromEntries(
  COUNTRIES.map((country) => [country.id, country]),
);
export const COUNTRY_INDEX: Record<string, number> = Object.fromEntries(
  COUNTRIES.map((country, index) => [country.id, index]),
);

export const PROVINCES: AtlasProvince[] = raw.provinces.map((row) => ({
  id: row[0],
  countryId: COUNTRIES[row[1]].id,
  name: row[2],
  lat: row[3],
  lon: row[4],
  pop: row[5],
  cities: row[6],
  capital: Boolean(row[7]),
  area: row[8],
}));
export const PROVINCE_BY_ID: Record<string, AtlasProvince> = Object.fromEntries(
  PROVINCES.map((province) => [province.id, province]),
);

export const CITIES: AtlasCity[] = raw.cities.map((row) => ({
  id: row[0],
  countryId: COUNTRIES[row[1]].id,
  provinceId: row[2],
  name: row[3],
  lat: row[4],
  lon: row[5],
  pop: row[6],
  capital: Boolean(row[7]),
  rank: row[8],
}));
export const CITY_BY_ID: Record<string, AtlasCity> = Object.fromEntries(
  CITIES.map((city) => [city.id, city]),
);

// ── Cidades de detalhe (carregadas sob demanda) ────────────────────────────
// O atlas principal guarda 1.203 cidades reais. Outras ~4.500 chegam num JSON
// separado, só quando o jogador aproxima ou foca um país: nenhum byte delas
// entra no pacote inicial. O registro abaixo é preenchido por
// `detailCities.ts` e as listas derivadas são mantidas ordenadas, para que o
// desenho continue sendo uma varredura linear barata.

export type DetailCityRow = [number, string, string, number, number, number, number, number];

let detailCities: AtlasCity[] = [];
let detailById: Record<string, AtlasCity> = {};
const detailGrid = new Map<string, AtlasCity[]>();
const GRID = 6;

const cellKey = (lat: number, lon: number) =>
  `${Math.floor((lat + 90) / GRID)}:${Math.floor((lon + 180) / GRID)}`;

export function detailCitiesLoaded(): boolean {
  return detailCities.length > 0;
}

export function allDetailCities(): AtlasCity[] {
  return detailCities;
}

/** Registra o lote de cidades extras uma única vez. */
export function registerDetailCities(startId: number, rows: DetailCityRow[], source?: string): void {
  if (detailCities.length) return;
  const list: AtlasCity[] = rows.map((row, index) => ({
    id: `c${startId + index}`,
    countryId: COUNTRIES[row[0]].id,
    provinceId: row[1],
    name: row[2],
    lat: row[3],
    lon: row[4],
    pop: row[5],
    capital: Boolean(row[6]),
    rank: row[7],
  }));
  detailCities = list.sort((a, b) => b.pop - a.pop);
  detailById = Object.fromEntries(list.map((city) => [city.id, city]));
  for (const city of list) {
    const key = cellKey(city.lat, city.lon);
    if (!detailGrid.has(key)) detailGrid.set(key, []);
    detailGrid.get(key)!.push(city);
    const bucket = citiesByCountry.get(city.countryId);
    if (bucket) bucket.push(city);
    else citiesByCountry.set(city.countryId, [city]);
    const provinceBucket = citiesByProvince.get(city.provinceId);
    if (provinceBucket) provinceBucket.push(city);
    else citiesByProvince.set(city.provinceId, [city]);
  }
  for (const bucket of new Set([...citiesByCountry.values(), ...citiesByProvince.values()])) {
    bucket.sort((a, b) => b.pop - a.pop);
  }
  DETAIL_SOURCE = source ?? DETAIL_SOURCE;
}

let DETAIL_SOURCE = 'Natural Earth 10m (domínio público)';

export function detailSource(): string {
  return DETAIL_SOURCE;
}

/** Cidades extras dentro de um retângulo de coordenadas (graus). */
export function detailCitiesIn(bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number }): AtlasCity[] {
  if (!detailCities.length) return [];
  const out: AtlasCity[] = [];
  const lon0 = Math.floor((bounds.minLon + 180) / GRID);
  const lon1 = Math.floor((bounds.maxLon + 180) / GRID);
  const lat0 = Math.floor((bounds.minLat + 90) / GRID);
  const lat1 = Math.floor((bounds.maxLat + 90) / GRID);
  for (let lat = lat0; lat <= lat1; lat += 1) {
    for (let lon = lon0; lon <= lon1; lon += 1) {
      const bucket = detailGrid.get(`${lat}:${lon}`);
      if (!bucket) continue;
      for (const city of bucket) {
        if (city.lon < bounds.minLon || city.lon > bounds.maxLon) continue;
        if (city.lat < bounds.minLat || city.lat > bounds.maxLat) continue;
        out.push(city);
      }
    }
  }
  return out.sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0) || b.pop - a.pop);
}

const provincesByCountry = new Map<string, AtlasProvince[]>();
const citiesByCountry = new Map<string, AtlasCity[]>();
const citiesByProvince = new Map<string, AtlasCity[]>();
for (const province of PROVINCES) {
  if (!provincesByCountry.has(province.countryId)) provincesByCountry.set(province.countryId, []);
  provincesByCountry.get(province.countryId)!.push(province);
}
for (const city of CITIES) {
  if (!citiesByCountry.has(city.countryId)) citiesByCountry.set(city.countryId, []);
  citiesByCountry.get(city.countryId)!.push(city);
  if (!citiesByProvince.has(city.provinceId)) citiesByProvince.set(city.provinceId, []);
  citiesByProvince.get(city.provinceId)!.push(city);
}
for (const list of citiesByCountry.values()) list.sort((a, b) => b.pop - a.pop);
for (const list of citiesByProvince.values()) list.sort((a, b) => b.pop - a.pop);
for (const list of provincesByCountry.values()) list.sort((a, b) => b.pop - a.pop);

export function provincesOf(countryId: string): AtlasProvince[] {
  return provincesByCountry.get(countryId) ?? [];
}

export function citiesOf(countryId: string): AtlasCity[] {
  return citiesByCountry.get(countryId) ?? [];
}

/** Busca uma cidade do atlas principal ou do lote detalhado. */
export function cityById(id: string): AtlasCity | undefined {
  return CITY_BY_ID[id] ?? detailById[id];
}

/** Lista ordenada (capital primeiro, depois população) para o desenho. */
export function sortedCities(list: AtlasCity[]): AtlasCity[] {
  return [...list].sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0) || b.pop - a.pop);
}

export function citiesInProvince(provinceId: string): AtlasCity[] {
  return citiesByProvince.get(provinceId) ?? [];
}

export function countryOfProvince(provinceId: string): AtlasCountry | null {
  const province = PROVINCE_BY_ID[provinceId];
  return province ? COUNTRY_BY_ID[province.countryId] ?? null : null;
}

export const ADJACENCY: Record<string, Array<{ id: string; sea: boolean }>> = Object.fromEntries(
  COUNTRIES.map((country) => [
    country.id,
    country.neighbors.map(([id, kind]) => ({ id, sea: kind === 1 })),
  ]),
);

export function countryNeighbors(countryId: string): Array<{ country: AtlasCountry; sea: boolean }> {
  return (ADJACENCY[countryId] ?? [])
    .map((edge) => ({ country: COUNTRY_BY_ID[edge.id], sea: edge.sea }))
    .filter((edge): edge is { country: AtlasCountry; sea: boolean } => Boolean(edge.country));
}

export const OUTLINE: Record<string, Shapes> = (outlineRaw as { shapes: Record<string, Shapes> }).shapes;

// ── Carregamento sob demanda da geometria detalhada ─────────────────────────

const detailCache = new Map<string, Promise<CountryDetail | null>>();

export function loadCountryDetail(iso: string): Promise<CountryDetail | null> {
  if (detailCache.has(iso)) return detailCache.get(iso)!;
  const request = fetch(`/atlas/geo/${iso}.json`)
    .then((response) => (response.ok ? (response.json() as Promise<CountryDetail>) : null))
    .catch(() => null);
  detailCache.set(iso, request);
  return request;
}

/** Cidades visíveis no globo em escala mundial: capitais e grandes metrópoles. */
export const GLOBAL_CITIES: AtlasCity[] = sortedCities(
  CITIES.filter((city) => city.capital || city.pop >= 6_000_000),
);

export function continentalLabel(continent: string): string {
  if (continent === 'América do Norte' || continent === 'América do Sul') return 'Américas';
  return continent;
}

export const ATLAS_STATS = {
  countries: COUNTRIES.length,
  provinces: PROVINCES.length,
  cities: COUNTRIES.reduce((sum, country) => sum + country.cities, 0),
  majorCities: CITIES.length,
  population: COUNTRIES.reduce((sum, country) => sum + country.pop, 0),
};
