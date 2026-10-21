import { COUNTRY_BY_ID, cityById } from './atlas';
import geoRaw from './city/geo.json';
import { Rng } from './rng';
import type { TerrainKey } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Gerador urbano determinístico.
//
// A base é geografia real (Natural Earth 10m): o polígono de terra em volta da
// cidade define a costa, as enseadas e os rios; o centro é a coordenada real.
// Sobre essa base o gerador desenha a malha viária, quadras, parques e
// edificações — o padrão (radial, ortogonal ou misto) segue porte, litoral e
// relevo da cidade, mas as ruas locais são sintetizadas, não copiadas do OSM.
// ─────────────────────────────────────────────────────────────────────────────

export const CITY_SIZE = 6800;
export const CITY_CELLS = 272;
export const CITY_CELL = CITY_SIZE / CITY_CELLS;

export type Pt = [number, number];

export interface CityGeo {
  lat: number;
  lon: number;
  land: number[][][][];
  rivers: Array<{ w: number; pts: Pt[] }>;
  lakes: number[][][];
}

export type RoadKind = 'arterial' | 'anel' | 'rua' | 'costa' | 'calcadao';

export interface CityRoad {
  pts: Pt[];
  width: number;
  kind: RoadKind;
}

export type BuildingKind =
  | 'casa'
  | 'villa'
  | 'solar'
  | 'predio'
  | 'torre'
  | 'comercial'
  | 'galpao'
  | 'marco';

/** Cobertura: duas águas, quatro águas, laje, dente de serra ou coroamento. */
export type RoofKind = 'gable' | 'hip' | 'flat' | 'saw' | 'crown';

export interface CityBuilding {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  tone: number;
  kind: BuildingKind;
  roof: RoofKind;
  roofH: number;
  /** 0–6: paleta de fachada (reboco claro, tijolo, betão, vidro, ardósia, metal, pedra). */
  style: number;
  /** Volumes extras no topo (0 nenhum, 1 parapeto/casa de máquinas, 2 coroa + antena). */
  crown: number;
  floors: number;
  /** Zona urbana que define material, densidade e silhueta na cena 3D. */
  zone: BuildingZone;
}

/**
 * Zonas urbanas com identidade própria. O plano classifica cada quadra e a cena
 * usa a zona para escolher silhueta, material e densidade — é o que faz o centro
 * financeiro, os bairros, o distrito industrial e a periferia serem reconhecíveis
 * sem precisar de uma camada de informação ligada.
 */
export type BuildingZone = 'centro' | 'residencial' | 'industrial' | 'periferia';

export interface BuildingArchetype {
  kind: BuildingKind;
  roof: RoofKind;
  w: [number, number];
  d: [number, number];
  h: [number, number];
  styles: number[];
  crown: number;
  weight: Record<BuildingZone, number>;
}

/**
 * Catálogo de tipologias. As pegadas são generosas de propósito: poucos volumes
 * grandes leem melhor do que milhares de caixinhas. Cada zona tem 3–4 tipos
 * dominantes e silhuetas bem diferentes entre si.
 */
export const BUILDING_ARCHETYPES: BuildingArchetype[] = [
  { kind: 'torre', roof: 'crown', w: [30, 44], d: [28, 40], h: [92, 186], styles: [3, 4, 5], crown: 2, weight: { centro: 26, residencial: 0, industrial: 0, periferia: 0 } },
  { kind: 'comercial', roof: 'crown', w: [26, 38], d: [22, 32], h: [38, 84], styles: [3, 5, 0], crown: 1, weight: { centro: 24, residencial: 5, industrial: 0, periferia: 0 } },
  { kind: 'predio', roof: 'flat', w: [24, 34], d: [20, 28], h: [18, 40], styles: [0, 2, 1], crown: 1, weight: { centro: 16, residencial: 30, industrial: 0, periferia: 4 } },
  { kind: 'solar', roof: 'flat', w: [22, 32], d: [18, 26], h: [11, 22], styles: [0, 2, 6], crown: 0, weight: { centro: 6, residencial: 22, industrial: 0, periferia: 8 } },
  { kind: 'casa', roof: 'gable', w: [12, 18], d: [12, 18], h: [6, 9], styles: [0, 2, 6], crown: 0, weight: { centro: 0, residencial: 18, industrial: 0, periferia: 58 } },
  { kind: 'villa', roof: 'hip', w: [16, 24], d: [14, 20], h: [7, 11], styles: [0, 1, 6], crown: 0, weight: { centro: 0, residencial: 15, industrial: 0, periferia: 22 } },
  { kind: 'galpao', roof: 'saw', w: [34, 54], d: [26, 42], h: [9, 16], styles: [2, 5], crown: 0, weight: { centro: 0, residencial: 0, industrial: 78, periferia: 6 } },
  { kind: 'marco', roof: 'crown', w: [24, 32], d: [24, 32], h: [58, 112], styles: [6], crown: 2, weight: { centro: 4, residencial: 0, industrial: 0, periferia: 0 } },
];

/** Prédio de apartamentos: o miolo de quadra nunca vira casa isolada. */
const MID_RISE = BUILDING_ARCHETYPES.find((archetype) => archetype.kind === 'predio')!;

export function pickArchetype(rng: Rng, zone: BuildingZone): BuildingArchetype {
  const pool = BUILDING_ARCHETYPES.filter((archetype) => archetype.weight[zone] > 0);
  const total = pool.reduce((sum, archetype) => sum + archetype.weight[zone], 0);
  let roll = rng.next() * total;
  for (const archetype of pool) {
    roll -= archetype.weight[zone];
    if (roll <= 0) return archetype;
  }
  return pool[0] ?? BUILDING_ARCHETYPES[0];
}

export interface CityPlot {
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  rot: number;
  district: string;
}

/** Quadra: centroide, eixo principal e extensão no referencial local. */
interface BlockShape {
  id: number;
  size: number;
  center: Pt;
  angle: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}

export interface CityPlan {
  cityId: string;
  name: string;
  countryId: string;
  size: number;
  cells: number;
  cell: number;
  center: Pt;
  water: Uint8Array;
  land: Uint8Array;
  road: Uint8Array;
  park: Uint8Array;
  elevation: Float32Array;
  roads: CityRoad[];
  shore: Pt[][];
  buildings: CityBuilding[];
  trees: Array<{ x: number; y: number; s: number }>;
  plots: CityPlot[];
  districts: Array<{ name: string; x: number; y: number }>;
  stats: {
    roadKm: number;
    buildings: number;
    parkArea: number;
    waterRatio: number;
    blocks: number;
    tallest: number;
  };
}

const GEO = (geoRaw as unknown as { cities: Record<string, CityGeo> }).cities;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
}

function fbm(x: number, y: number, seed: number): number {
  return (
    noise2(x, y, seed) * 0.55 +
    noise2(x * 2.1, y * 2.1, seed + 7) * 0.28 +
    noise2(x * 4.3, y * 4.3, seed + 19) * 0.17
  );
}

function cellIndex(plan: { cells: number; cell: number }, x: number, y: number): number {
  const half = (plan.cells * plan.cell) / 2;
  const i = Math.floor((x + half) / plan.cell);
  const j = Math.floor((y + half) / plan.cell);
  if (i < 0 || j < 0 || i >= plan.cells || j >= plan.cells) return -1;
  return j * plan.cells + i;
}

export function cellCenter(plan: { cells: number; cell: number }, index: number): Pt {
  const half = (plan.cells * plan.cell) / 2;
  const i = index % plan.cells;
  const j = Math.floor(index / plan.cells);
  return [-half + (i + 0.5) * plan.cell, -half + (j + 0.5) * plan.cell];
}

function rasterizePolygon(
  target: Uint8Array,
  rings: Pt[][],
  cells: number,
  cell: number,
  value: number,
  offset: Pt,
): void {
  const half = (cells * cell) / 2;
  const minX = -half;
  const minY = -half;
  const xs: number[] = [];
  let minRow = cells;
  let maxRow = -1;
  const rows: number[][] = Array.from({ length: cells }, () => []);
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index += 1) {
      const [rawX, rawY] = ring[index];
      const x = rawX - offset[0];
      const y = rawY - offset[1];
      const next = ring[(index + 1) % ring.length];
      const x2 = next[0] - offset[0];
      const y2 = next[1] - offset[1];
      if (y === y2) continue;
      const yMin = Math.min(y, y2);
      const yMax = Math.max(y, y2);
      const startRow = Math.max(0, Math.ceil((yMin - minY) / cell - 0.5));
      const endRow = Math.min(cells - 1, Math.floor((yMax - minY) / cell - 0.5));
      if (startRow > endRow) continue;
      const slope = (x2 - x) / (y2 - y);
      for (let row = startRow; row <= endRow; row += 1) {
        const sampleY = minY + (row + 0.5) * cell;
        if (sampleY < yMin || sampleY >= yMax) continue;
        const sampleX = x + (sampleY - y) * slope;
        rows[row].push(sampleX);
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
      }
    }
  }
  for (let row = minRow; row <= maxRow; row += 1) {
    const crossings = rows[row].sort((a, b) => a - b);
    let inside = false;
    let previous = minX;
    for (let c = 0; c <= crossings.length; c += 1) {
      const xEdge = c < crossings.length ? crossings[c] : minX + cells * cell;
      if (inside) {
        const start = Math.max(0, Math.ceil((previous - minX) / cell - 0.5));
        const end = Math.min(cells - 1, Math.floor((xEdge - minX) / cell - 0.5));
        for (let col = start; col <= end; col += 1) target[row * cells + col] = value;
      }
      previous = xEdge;
      inside = !inside;
    }
  }
  void xs;
}

function rasterizeThickLine(
  target: Uint8Array,
  pts: Pt[],
  width: number,
  cells: number,
  cell: number,
  value: number,
  offset: Pt = [0, 0],
): void {
  const half = (cells * cell) / 2;
  const radius = Math.max(0.55, width / 2 / cell);
  for (let index = 0; index < pts.length - 1; index += 1) {
    const x1 = pts[index][0] - offset[0];
    const y1 = pts[index][1] - offset[1];
    const x2 = pts[index + 1][0] - offset[0];
    const y2 = pts[index + 1][1] - offset[1];
    const minI = Math.max(0, Math.floor((Math.min(x1, x2) + half) / cell - radius - 1));
    const maxI = Math.min(cells - 1, Math.ceil((Math.max(x1, x2) + half) / cell + radius + 1));
    const minJ = Math.max(0, Math.floor((Math.min(y1, y2) + half) / cell - radius - 1));
    const maxJ = Math.min(cells - 1, Math.ceil((Math.max(y1, y2) + half) / cell + radius + 1));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy || 1;
    for (let j = minJ; j <= maxJ; j += 1) {
      const py = -half + (j + 0.5) * cell;
      for (let i = minI; i <= maxI; i += 1) {
        const px = -half + (i + 0.5) * cell;
        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        const cx = x1 + dx * t;
        const cy = y1 + dy * t;
        if (Math.hypot(px - cx, py - cy) <= radius * cell) target[j * cells + i] = value;
      }
    }
  }
}

function distanceTransform(mask: Uint8Array, cells: number): Float32Array {
  const dist = new Float32Array(cells * cells).fill(Number.POSITIVE_INFINITY);
  const queue: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) {
      dist[index] = 0;
      queue.push(index);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    const i = index % cells;
    const j = Math.floor(index / cells);
    const current = dist[index];
    const neighbours = [
      i > 0 ? index - 1 : -1,
      i < cells - 1 ? index + 1 : -1,
      j > 0 ? index - cells : -1,
      j < cells - 1 ? index + cells : -1,
    ];
    for (const next of neighbours) {
      if (next < 0) continue;
      if (dist[next] > current + 1) {
        dist[next] = current + 1;
        queue.push(next);
      }
    }
  }
  return dist;
}

const TERRAIN_BASE: Record<TerrainKey, number> = {
  planicie: 26,
  floresta: 34,
  colina: 74,
  montanha: 180,
  costa: 12,
  deserto: 60,
  agua: 0,
};

function rotate(x: number, y: number, angle: number): Pt {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - y * sin, x * sin + y * cos];
}

/** Recorta uma polilinha nos trechos em que `passable` é verdadeiro. */
function clipRuns(
  pts: Pt[],
  passable: (x: number, y: number) => boolean,
  minLength = 70,
): Pt[][] {
  const runs: Pt[][] = [];
  let current: Pt[] = [];
  const step = 12;
  for (let index = 0; index < pts.length - 1; index += 1) {
    const [x1, y1] = pts[index];
    const [x2, y2] = pts[index + 1];
    const length = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(length / step));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (passable(x, y)) {
        current.push([x, y]);
      } else {
        if (current.length > 1 && polylineLength(current) >= minLength) runs.push(current);
        current = [];
      }
    }
  }
  if (current.length > 1 && polylineLength(current) >= minLength) runs.push(current);
  return runs;
}

export function polylineLength(pts: Pt[]): number {
  let total = 0;
  for (let index = 0; index < pts.length - 1; index += 1) {
    total += Math.hypot(pts[index + 1][0] - pts[index][0], pts[index + 1][1] - pts[index][1]);
  }
  return total;
}

/** Amostra bilinear da elevação do plano (metros). */
export function sampleHeight(plan: CityPlan, x: number, y: number): number {
  const half = plan.size / 2;
  const fx = Math.max(0, Math.min(plan.cells - 1.001, (x + half) / plan.cell - 0.5));
  const fy = Math.max(0, Math.min(plan.cells - 1.001, (y + half) / plan.cell - 0.5));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const a = plan.elevation[j * plan.cells + i];
  const b = plan.elevation[j * plan.cells + i + 1];
  const c = plan.elevation[(j + 1) * plan.cells + i];
  const d = plan.elevation[(j + 1) * plan.cells + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

export function isWaterAt(plan: CityPlan, x: number, y: number): boolean {
  const index = cellIndex(plan, x, y);
  return index < 0 ? true : plan.water[index] === 1;
}

export function isRoadAt(plan: CityPlan, x: number, y: number): boolean {
  const index = cellIndex(plan, x, y);
  return index < 0 ? false : plan.road[index] === 1;
}

export function plotCenter(plot: CityPlot): Pt {
  return [plot.x, plot.y];
}

export function generateCityPlan(cityId: string, seed = 0): CityPlan {
  const city = cityById(cityId);
  const geo = GEO[cityId];
  const country = city ? COUNTRY_BY_ID[city.countryId] : null;
  const terrain: TerrainKey = country?.terrain ?? 'planicie';
  const rng = new Rng((hashString(cityId) ^ Math.imul(seed + 1, 2654435761)) >>> 0);
  const cells = CITY_CELLS;
  const cell = CITY_CELL;
  const size = CITY_SIZE;
  const half = size / 2;

  const plan: CityPlan = {
    cityId,
    name: city?.name ?? cityId,
    countryId: city?.countryId ?? '',
    size,
    cells,
    cell,
    center: [0, 0],
    water: new Uint8Array(cells * cells),
    land: new Uint8Array(cells * cells),
    road: new Uint8Array(cells * cells),
    park: new Uint8Array(cells * cells),
    elevation: new Float32Array(cells * cells),
    roads: [],
    shore: [],
    buildings: [],
    trees: [],
    plots: [],
    districts: [],
    stats: { roadKm: 0, buildings: 0, parkArea: 0, waterRatio: 0, blocks: 0, tallest: 0 },
  };

  if (!geo) {
    plan.land.fill(1);
    plan.shore = [];
  } else {
    // 1. Enquadramento: se a cidade é costeira, desloca o centro do mapa na
    //    direção da água (até 800 m) para a orla aparecer no enquadramento.
    const coarse = 64;
    const coarseMask = new Uint8Array(coarse * coarse);
    for (const rings of geo.land) {
      rasterizePolygon(coarseMask, rings as unknown as Pt[][], coarse, size / coarse, 1, [0, 0]);
    }
    let waterX = 0;
    let waterY = 0;
    let waterCount = 0;
    for (let index = 0; index < coarseMask.length; index += 1) {
      if (!coarseMask[index]) {
        const x = -half + ((index % coarse) + 0.5) * (size / coarse);
        const y = -half + (Math.floor(index / coarse) + 0.5) * (size / coarse);
        waterX += x;
        waterY += y;
        waterCount += 1;
      }
    }
    if (waterCount > 0 && waterCount < coarseMask.length * 0.6) {
      // O recorte geográfico em geo.json cobre ±3.780 m; com o mapa de 6,8 km
      // o deslocamento fica limitado a ±320 m para nunca faltar terra na borda.
      const frameX = Math.max(-320, Math.min(320, (waterX / waterCount) * 0.32));
      const frameY = Math.max(-320, Math.min(320, (waterY / waterCount) * 0.32));
      plan.center = [frameX, frameY];
    }

    for (const rings of geo.land) {
      rasterizePolygon(plan.land, rings as unknown as Pt[][], cells, cell, 1, plan.center);
    }
    for (const rings of geo.lakes) {
      rasterizePolygon(plan.land, rings as unknown as Pt[][], cells, cell, 0, plan.center);
    }
    for (const river of geo.rivers) {
      rasterizeThickLine(plan.land, river.pts, river.w, cells, cell, 0, plan.center);
    }
    for (let index = 0; index < plan.land.length; index += 1) {
      if (!plan.land[index]) plan.water[index] = 1;
    }

    // Orla real (polilinhas do polígono de terra, sem as bordas do recorte).
    for (const rings of geo.land) {
      for (const ring of rings) {
        let run: Pt[] = [];
        const limit = half + 1;
        for (const [rawX, rawY] of ring as unknown as Pt[]) {
          const x = rawX - plan.center[0];
          const y = rawY - plan.center[1];
          const onBorder = Math.abs(x) > limit - 6 || Math.abs(y) > limit - 6;
          if (onBorder) {
            if (run.length > 1) plan.shore.push(run);
            run = [];
          } else {
            run.push([x, y]);
          }
        }
        if (run.length > 1) plan.shore.push(run);
      }
    }
  }

  if (!plan.land.some((value) => value === 1)) {
    plan.land.fill(1);
    plan.water.fill(0);
  }

  // 2. Relevo: ruído determinístico + base do terreno, aplainado junto à água.
  const waterDist = distanceTransform(plan.water, cells);
  const base = TERRAIN_BASE[terrain] ?? 26;
  const ridgeAngle = rng.between(0, Math.PI * 2);
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      const index = j * cells + i;
      const x = -half + (i + 0.5) * cell;
      const y = -half + (j + 0.5) * cell;
      if (plan.water[index]) {
        plan.elevation[index] = -6;
        continue;
      }
      const broad = fbm(x / 1250, y / 1250, hashString(cityId) & 0xffff) - 0.5;
      const fine = fbm(x / 280, y / 280, (hashString(cityId) >>> 3) & 0xffff) - 0.5;
      const ridge = Math.cos(Math.atan2(y, x) - ridgeAngle) * 0.5 + 0.5;
      let height = base * 0.5 + broad * base * 1.1 + fine * 9 + ridge * base * 0.35;
      const shoreFactor = Math.min(1, waterDist[index] / 7);
      height *= 0.18 + 0.82 * shoreFactor;
      plan.elevation[index] = Math.max(2.6, height);
    }
  }

  // 3. Sistema viário.
  const roads: CityRoad[] = [];
  const passable = (x: number, y: number) => {
    if (Math.abs(x) > half - 70 || Math.abs(y) > half - 70) return false;
    return !isWaterAt(plan, x, y);
  };
  const center: Pt = [plan.center[0] * 0.15, plan.center[1] * 0.15];
  if (isWaterAt(plan, center[0], center[1])) {
    // Encontra a célula de terra mais próxima do centro.
    let best: Pt = [0, 0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (let index = 0; index < plan.land.length; index += 1) {
      if (!plan.land[index]) continue;
      const point = cellCenter(plan, index);
      const distance = Math.hypot(point[0] - center[0], point[1] - center[1]);
      if (distance < bestDist) {
        bestDist = distance;
        best = point;
      }
    }
    center[0] = best[0];
    center[1] = best[1];
  }

  const arterialCount = 5 + rng.int(0, 2);
  const baseAngle = rng.between(0, Math.PI * 2);
  for (let index = 0; index < arterialCount; index += 1) {
    const angle = baseAngle + (index / arterialCount) * Math.PI * 2 + rng.between(-0.16, 0.16);
    const pts: Pt[] = [center];
    let x = center[0];
    let y = center[1];
    let heading = angle;
    for (let step = 0; step < 60; step += 1) {
      heading += rng.between(-0.045, 0.045);
      x += Math.cos(heading) * 110;
      y += Math.sin(heading) * 110;
      pts.push([x, y]);
      if (!passable(x, y)) break;
    }
    for (const run of clipRuns(pts, passable, 90)) {
      roads.push({ pts: run, width: rng.between(24, 32), kind: 'arterial' });
    }
  }

  // Anéis viários.
  const ringCount = rng.chance(0.65) ? 2 : 1;
  for (let ring = 0; ring < ringCount; ring += 1) {
    const radius = (ring === 0 ? rng.between(520, 780) : rng.between(1150, 1650));
    const phase = rng.between(0, Math.PI * 2);
    const wobble = rng.between(0.03, 0.09);
    const pts: Pt[] = [];
    for (let step = 0; step <= 72; step += 1) {
      const angle = (step / 72) * Math.PI * 2;
      const localRadius = radius * (1 + Math.sin(angle * 3 + phase) * wobble + Math.cos(angle * 5 - phase) * wobble * 0.6);
      pts.push([center[0] + Math.cos(angle) * localRadius, center[1] + Math.sin(angle) * localRadius]);
    }
    for (const run of clipRuns(pts, passable, 110)) {
      roads.push({ pts: run, width: ring === 0 ? 22 : 26, kind: 'anel' });
    }
  }

  // Malha local: a cidade é dividida em nove distritos, cada um com sua
  // orientação de quadra (ruas retas com pequenas quebras).
  const districtSpan = size / 3;
  const gridAngles = new Float32Array(9);
  for (let dj = 0; dj < 3; dj += 1) {
    for (let di = 0; di < 3; di += 1) {
      const cx = -half + (di + 0.5) * districtSpan;
      const cy = -half + (dj + 0.5) * districtSpan;
      const far = Math.hypot(cx, cy) / half;
      const angle = baseAngle + Math.PI / 2 + (far > 0.55 ? Math.PI / 4 : 0) + rng.between(-0.22, 0.22);
      gridAngles[dj * 3 + di] = angle;
      const spacing = rng.between(118, 168);
      const bounds = districtSpan / 2 - 8;
      const limit = Math.ceil((bounds * 1.5) / spacing) + 1;
      for (let k = -limit; k <= limit; k += 1) {
        const offset = k * spacing + rng.between(-7, 7);
        for (let axis = 0; axis < 2; axis += 1) {
          const localAngle = angle + (axis === 1 ? Math.PI / 2 : 0);
          const dirX = Math.cos(localAngle);
          const dirY = Math.sin(localAngle);
          const normX = -dirY;
          const normY = dirX;
          const baseX = cx + normX * offset;
          const baseY = cy + normY * offset;
          // Recorte paramétrico no quadrado do distrito.
          let tMin = -bounds * 2;
          let tMax = bounds * 2;
          const clip = (p: number, q: number) => {
            if (Math.abs(p) < 1e-6) return q >= 0;
            const t = q / p;
            if (p < 0) tMin = Math.max(tMin, t);
            else tMax = Math.min(tMax, t);
            return tMin <= tMax;
          };
          const dx = baseX - cx;
          const dy = baseY - cy;
          const ok =
            clip(-dirX, bounds + dx) && clip(dirX, bounds - dx) &&
            clip(-dirY, bounds + dy) && clip(dirY, bounds - dy);
          if (!ok) continue;
          const pts: Pt[] = [
            [baseX + dirX * tMin, baseY + dirY * tMin],
            [baseX + dirX * tMax, baseY + dirY * tMax],
          ];
          // Nem toda linha da malha vira rua: quebras deixam quadras maiores e
          // mais irregulares, como em tecido urbano real.
          if (k !== 0 && rng.chance(0.1)) continue;
          const width = k === 0 ? 20 : rng.between(14, 17);
          for (const run of clipRuns(pts, passable, 110)) {
            roads.push({ pts: run, width, kind: 'rua' });
          }
        }
      }
    }
  }

  // 4. Rasteriza as ruas para separar quadras.
  for (const road of roads) {
    rasterizeThickLine(plan.road, road.pts, Math.max(road.width, 13), cells, cell, 1);
  }

  // 5. Quadras = componentes conexos de terra fora de ruas e água.
  const blockLabels = new Int32Array(cells * cells).fill(-1);
  const blockCells: number[][] = [];
  const isFree = (index: number) => plan.land[index] === 1 && !plan.road[index];
  for (let start = 0; start < blockLabels.length; start += 1) {
    if (blockLabels[start] !== -1 || !isFree(start)) continue;
    const id = blockCells.length;
    const queue = [start];
    blockLabels[start] = id;
    const members: number[] = [];
    let head = 0;
    while (head < queue.length) {
      const index = queue[head];
      head += 1;
      members.push(index);
      const i = index % cells;
      const j = Math.floor(index / cells);
      if (i > 0 && blockLabels[index - 1] === -1 && isFree(index - 1)) {
        blockLabels[index - 1] = id;
        queue.push(index - 1);
      }
      if (i < cells - 1 && blockLabels[index + 1] === -1 && isFree(index + 1)) {
        blockLabels[index + 1] = id;
        queue.push(index + 1);
      }
      if (j > 0 && blockLabels[index - cells] === -1 && isFree(index - cells)) {
        blockLabels[index - cells] = id;
        queue.push(index - cells);
      }
      if (j < cells - 1 && blockLabels[index + cells] === -1 && isFree(index + cells)) {
        blockLabels[index + cells] = id;
        queue.push(index + cells);
      }
    }
    blockCells.push(members);
  }
  plan.stats.blocks = blockCells.filter((members) => members.length > 6).length;

  // 6. Forma de cada quadra: centroide, eixo principal (PCA) e extensão local.
  const blockInfo: BlockShape[] = blockCells.map((members, id) => {
    let sumX = 0;
    let sumY = 0;
    for (const index of members) {
      const [x, y] = cellCenter(plan, index);
      sumX += x;
      sumY += y;
    }
    const c: Pt = members.length ? [sumX / members.length, sumY / members.length] : [0, 0];
    let cxx = 0;
    let cyy = 0;
    let cxy = 0;
    for (const index of members) {
      const [x, y] = cellCenter(plan, index);
      const dx = x - c[0];
      const dy = y - c[1];
      cxx += dx * dx;
      cyy += dy * dy;
      cxy += dx * dy;
    }
    const n = Math.max(1, members.length);
    const varX = cxx / n;
    const varY = cyy / n;
    const cov = cxy / n;
    let angle = 0.5 * Math.atan2(2 * cov, varX - varY);
    // Quadras quase quadradas não têm eixo dominante: herdam a malha do distrito.
    const anisotropy = Math.hypot(varX - varY, 2 * cov) / Math.max(1e-6, varX + varY);
    if (!Number.isFinite(angle) || anisotropy < 0.07) {
      const di = Math.max(0, Math.min(2, Math.floor((c[0] + half) / districtSpan)));
      const dj = Math.max(0, Math.min(2, Math.floor((c[1] + half) / districtSpan)));
      angle = gridAngles[dj * 3 + di];
    }
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    let uMin = Number.POSITIVE_INFINITY;
    let uMax = Number.NEGATIVE_INFINITY;
    let vMin = Number.POSITIVE_INFINITY;
    let vMax = Number.NEGATIVE_INFINITY;
    for (const index of members) {
      const [x, y] = cellCenter(plan, index);
      const dx = x - c[0];
      const dy = y - c[1];
      const u = dx * cosA + dy * sinA;
      const v = -dx * sinA + dy * cosA;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    if (!members.length) uMin = uMax = vMin = vMax = 0;
    return { id, size: members.length, center: c, angle, uMin, uMax, vMin, vMax };
  });
  plan.stats.blocks = blockInfo.filter((block) => block.size > 6).length;

  // 7. Parques: praça central, bolsões de bairro e parques de duas a três quadras.
  const parkBlocks = new Uint8Array(blockInfo.length);
  const blockRural = new Uint8Array(blockInfo.length);
  /** Probabilidade de uma quadra virar campo, crescendo em direção à borda. */
  const THREE_RURAL = (roll: number, reach: number) => {
    const t = Math.max(0, Math.min(1, (reach - 0.66) / 0.34));
    const share = 0.12 + t * t * 0.62;
    return roll < share;
  };
  // Uma quadra vira parque se for grande o bastante para ler como praça e
  // pequena o bastante para não engolir o bairro (nem tocar a borda do recorte).
  const parkable = (block: BlockShape) => {
    if (block.size < 7 || block.size > 300) return false;
    const reach = Math.max(Math.abs(block.center[0]), Math.abs(block.center[1]));
    return reach < half * 0.9;
  };
  const parkBy = (block: BlockShape) => {
    if (parkBlocks[block.id]) return;
    parkBlocks[block.id] = 1;
    for (const index of blockCells[block.id]) plan.park[index] = 1;
  };
  const centralBlock = blockInfo
    .filter((block) => parkable(block))
    .sort((a, b) => Math.hypot(a.center[0], a.center[1]) - Math.hypot(b.center[0], b.center[1]))[0];
  if (centralBlock) parkBy(centralBlock);
  for (const block of blockInfo) {
    if (parkBlocks[block.id] || !parkable(block)) continue;
    const distance = Math.hypot(block.center[0], block.center[1]);
    const chance = distance < 900 ? 0.085 : distance < 2100 ? 0.058 : 0.036;
    if (!rng.chance(chance)) continue;
    parkBy(block);
    const neighbours = blockInfo
      .filter((other) => other.id !== block.id && !parkBlocks[other.id] && parkable(other))
      .sort((a, b) => Math.hypot(a.center[0] - block.center[0], a.center[1] - block.center[1])
        - Math.hypot(b.center[0] - block.center[0], b.center[1] - block.center[1]))
      .slice(0, 2);
    for (const neighbour of neighbours) {
      const reach = Math.hypot(neighbour.center[0] - block.center[0], neighbour.center[1] - block.center[1]);
      if (reach < 330 && rng.chance(0.62)) parkBy(neighbour);
    }
  }

  // Grandes parques: três núcleos espalhados pelo tecido, cada um com duas ou
  // três quadras vizinhas — a mancha verde precisa ser lida de longe.
  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2 + rng.between(-0.5, 0.5);
    const radius = half * rng.between(0.32, 0.64);
    const target: Pt = [Math.cos(angle) * radius, Math.sin(angle) * radius];
    const nearby = blockInfo
      .filter((block) => !parkBlocks[block.id] && parkable(block))
      .sort((a, b) => Math.hypot(a.center[0] - target[0], a.center[1] - target[1])
        - Math.hypot(b.center[0] - target[0], b.center[1] - target[1]));
    const seed = nearby[0];
    if (!seed) continue;
    parkBy(seed);
    for (const neighbour of nearby.slice(1, 4)) {
      const reach = Math.hypot(neighbour.center[0] - seed.center[0], neighbour.center[1] - seed.center[1]);
      if (reach < 380 && rng.chance(0.8)) parkBy(neighbour);
    }
  }

  // Cinturão rural: perto da borda do recorte a cidade se dissolve em campos e
  // bosques — é a transição natural entre a malha urbana e o terreno aberto.
  for (const block of blockInfo) {
    if (parkBlocks[block.id] || block.size < 4) continue;
    const reach = Math.max(Math.abs(block.center[0]), Math.abs(block.center[1])) / half;
    if (reach < 0.66) continue;
    if (!THREE_RURAL(rng.next(), reach)) continue;
    if (block.size <= 220) parkBy(block);
    // Quadra grande demais para virar parque: fica como campo aberto.
    else blockRural[block.id] = 1;
  }

  // 8. Lotes da sede: quadras livres mais próximas do centro.
  const plotCandidates = blockInfo
    .filter((block) => block.size >= 9 && !parkBlocks[block.id])
    .sort((a, b) => Math.hypot(a.center[0], a.center[1]) - Math.hypot(b.center[0], b.center[1]))
    .slice(0, 36);
  const plotCells = new Uint8Array(cells * cells);
  const freePoint = (x: number, y: number, margin = 0) => {
    const index = cellIndex(plan, x, y);
    if (index < 0 || plan.land[index] === 0 || plan.road[index] === 1 || plan.park[index] === 1) return false;
    if (!margin) return true;
    const i = index % cells;
    const j = Math.floor(index / cells);
    const wear = Math.round(margin / cell);
    for (let dj = -wear; dj <= wear; dj += 1) {
      for (let di = -wear; di <= wear; di += 1) {
        const other = (j + dj) * cells + (i + di);
        if (other < 0 || other >= plan.road.length) return false;
        if (plan.land[other] === 0 || plan.road[other] === 1 || plan.park[other] === 1) return false;
      }
    }
    return true;
  };
  let plotNumber = 0;
  for (const block of plotCandidates) {
    if (plan.plots.length >= 16) break;
    const sizeLimit = Math.sqrt(block.size) * cell;
    const span = Math.min(block.uMax - block.uMin, block.vMax - block.vMin);
    const side = Math.round(Math.min(58, Math.max(36, Math.min(sizeLimit * 0.5, span * 0.62))));
    const angle = block.angle + rng.between(-0.1, 0.1);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const x = block.center[0];
    const y = block.center[1];
    let valid = true;
    for (let u = -0.5; u <= 0.5 && valid; u += 0.25) {
      for (let v = -0.5; v <= 0.5 && valid; v += 0.25) {
        const px = x + (u * side) * cosA - (v * side) * sinA;
        const py = y + (u * side) * sinA + (v * side) * cosA;
        if (!freePoint(px, py, 6)) valid = false;
      }
    }
    if (!valid) continue;
    plotNumber += 1;
    plan.plots.push({
      id: `${cityId}-lote-${String(plotNumber).padStart(2, '0')}`,
      x: Math.round(x),
      y: Math.round(y),
      w: side,
      d: side,
      rot: angle,
      district: distanceLabel(x, y),
    });
    // Reserva a área do lote (e um anel de praça) contra edificações.
    const reserve = side * 0.5 + 4;
    for (let u = -reserve; u <= reserve; u += 5) {
      for (let v = -reserve; v <= reserve; v += 5) {
        const index = cellIndex(plan, x + u * cosA - v * sinA, y + u * sinA + v * cosA);
        if (index >= 0) plotCells[index] = 1;
      }
    }
  }

  // 9. Zonas urbanas e composição de cada quadra.
  //    Centro financeiro compacto, anel residencial, setor industrial e periferia
  //    rarefeita: a transição é gradual e cada zona tem poucos tipos dominantes.
  const cityScale = city && city.pop > 2_000_000 ? 1.15 : city && city.pop < 400_000 ? 0.82 : 1;
  const coreRadius = 1000 * cityScale;
  const suburbRadius = 2320 * cityScale;
  const industryAngle = rng.between(0, Math.PI * 2);
  const noiseFor = (key: number) => {
    let hash = Math.imul(key + 1, 0x9e3779b1) ^ hashString(cityId);
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x85ebca6b);
    hash ^= hash >>> 13;
    return (hash >>> 0) / 4294967296;
  };
  const zoneFor = (block: BlockShape): BuildingZone => {
    const distance = Math.hypot(block.center[0], block.center[1]);
    const noise = noiseFor(block.id * 7 + 13);
    if (distance < coreRadius * (0.8 + noise * 0.34)) return 'centro';
    const angle = Math.atan2(block.center[1], block.center[0]);
    const delta = Math.abs(Math.atan2(Math.sin(angle - industryAngle), Math.cos(angle - industryAngle)));
    if (distance > coreRadius * 0.8 && distance < suburbRadius * 1.2 && delta < 0.85 && noise > 0.12) return 'industrial';
    if (distance > suburbRadius * (0.9 + noise * 0.26)) return 'periferia';
    return 'residencial';
  };
  const blockZones = blockInfo.map(zoneFor);
  // Garante um setor industrial em toda cidade: escolhe uma cunha equidistante
  // do centro e reconverte as quadras ali (com folga para virar um distrito).
  const industrialBlocks = blockInfo.filter((block) => blockZones[block.id] === 'industrial' && block.size > 5).length;
  if (industrialBlocks < 10) {
    // Cidade pequena ou recortada pela água: escolhe a cunha com mais quadras
    // livres a uma distância industrial e converte tudo ali.
    let industryStart = 0;
    let bestWedge = -1;
    for (let candidate = 0; candidate < 16; candidate += 1) {
      const angle = (candidate / 16) * Math.PI * 2;
      let count = 0;
      for (const block of blockInfo) {
        const distance = Math.hypot(block.center[0], block.center[1]);
        if (distance < coreRadius * 0.72 || distance > suburbRadius * 1.25) continue;
        const delta = Math.abs(Math.atan2(
          Math.sin(Math.atan2(block.center[1], block.center[0]) - angle),
          Math.cos(Math.atan2(block.center[1], block.center[0]) - angle),
        ));
        if (delta < 1.05) count += 1;
      }
      if (count > bestWedge) {
        bestWedge = count;
        industryStart = angle;
      }
    }
    let converted = 0;
    for (const block of blockInfo) {
      const distance = Math.hypot(block.center[0], block.center[1]);
      if (distance < coreRadius * 0.72 || distance > suburbRadius * 1.25) continue;
      const angle = Math.atan2(block.center[1], block.center[0]);
      const delta = Math.abs(Math.atan2(Math.sin(angle - industryStart), Math.cos(angle - industryStart)));
      if (delta > 1.05) continue;
      blockZones[block.id] = 'industrial';
      converted += 1;
    }
    // Cidade pequena ou muito recortada: escolhe o bloco industrial mais
    // próximo de uma âncora e cresce o distrito a partir dele.
    if (converted < 8) {
      const anchor: Pt = [Math.cos(industryStart) * suburbRadius * 0.7, Math.sin(industryStart) * suburbRadius * 0.7];
      const anchors = blockInfo
        .filter((block) => block.size > 5 && Math.hypot(block.center[0], block.center[1]) > coreRadius * 0.7)
        .sort((a, b) => Math.hypot(a.center[0] - anchor[0], a.center[1] - anchor[1])
          - Math.hypot(b.center[0] - anchor[0], b.center[1] - anchor[1]))
        .slice(0, 10);
      for (const block of anchors) blockZones[block.id] = 'industrial';
    }
  }

  interface ZoneMass {
    pitch: number;
    fill: number;
    gap: number;
    cover: [number, number];
    maxCols: number;
    maxRows: number;
  }
  const ZONE_MASS: Record<BuildingZone, ZoneMass> = {
    centro: { pitch: 58, fill: 0.84, gap: 8, cover: [0.68, 0.86], maxCols: 6, maxRows: 6 },
    residencial: { pitch: 46, fill: 0.96, gap: 6, cover: [0.72, 0.9], maxCols: 8, maxRows: 8 },
    industrial: { pitch: 58, fill: 0.94, gap: 10, cover: [0.72, 0.9], maxCols: 6, maxRows: 6 },
    periferia: { pitch: 50, fill: 0.74, gap: 8, cover: [0.68, 0.86], maxCols: 8, maxRows: 8 },
  };

  // Ocupação: baldes de 24 m impedem que quadras vizinhas se interpenetrem.
  const buckets = new Map<number, Array<{ x: number; y: number; r: number }>>();
  const bucketKey = (i: number, j: number) => (i + 512) * 1024 + (j + 512);
  const canPlace = (x: number, y: number, radius: number): boolean => {
    const bi = Math.floor(x / 24);
    const bj = Math.floor(y / 24);
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        const list = buckets.get(bucketKey(bi + di, bj + dj));
        if (!list) continue;
        for (const other of list) {
          if (Math.hypot(other.x - x, other.y - y) < (other.r + radius) * 0.5) return false;
        }
      }
    }
    return true;
  };
  const remember = (x: number, y: number, radius: number) => {
    const key = bucketKey(Math.floor(x / 24), Math.floor(y / 24));
    const list = buckets.get(key);
    if (list) list.push({ x, y, r: radius });
    else buckets.set(key, [{ x, y, r: radius }]);
  };

  const gardenSpots: Array<{ x: number; y: number; s: number }> = [];
  const fits = (block: BlockShape, x: number, y: number, w: number, d: number, rot: number): boolean => {
    const cosA = Math.cos(rot);
    const sinA = Math.sin(rot);
    const halfW = w / 2;
    const halfD = d / 2;
    for (let u = -halfW; u <= halfW + 0.001; u += 7) {
      for (let v = -halfD; v <= halfD + 0.001; v += 7) {
        const px = x + u * cosA - v * sinA;
        const py = y + u * sinA + v * cosA;
        if (Math.abs(px) > half * 0.92 || Math.abs(py) > half * 0.92) return false;
        const index = cellIndex(plan, px, py);
        if (index < 0) return false;
        if (plan.land[index] === 0 || plan.road[index] === 1 || plan.park[index] === 1) return false;
        if (plotCells[index] === 1) return false;
        if (blockLabels[index] !== block.id) return false;
      }
    }
    return true;
  };

  const edgeFade = (distance: number) => {
    const t = Math.max(0, Math.min(1, (distance - half * 0.72) / (half * 0.2)));
    return 1 - 0.55 * t;
  };

  /** Cria um volume a partir da zona da quadra e da posição no lote. */
  const placeBuilding = (
    block: BlockShape,
    zone: BuildingZone,
    archetype: BuildingArchetype,
    x: number,
    y: number,
    width: number,
    depth: number,
    rot: number,
    distance: number,
    spot: number,
  ): boolean => {
    if (!fits(block, x, y, width, depth, rot)) return false;
    const centerWeight = Math.exp(-distance / (1500 * cityScale));
    let height = rng.between(archetype.h[0], archetype.h[1]);
    // Fora do centro, a altura é limitada pela zona: é isso que impede um
    // arranha-céu solto no meio das casas e mantém o horizonte legível.
    const ceiling = zone === 'centro' ? 205 : zone === 'residencial' ? 34 : zone === 'industrial' ? 17 : 13;
    height = Math.min(height, ceiling);
    if (zone === 'centro') height *= 0.82 + 0.46 * centerWeight;
    else if (zone === 'residencial') height *= 0.82 + 0.14 * centerWeight;
    else if (zone === 'industrial') height *= 0.94;
    else height *= 0.9;
    if (archetype.kind === 'torre') height = Math.max(96, height);
    height = Math.max(5.5, Math.min(205, height));
    let kind = archetype.kind;
    let roof = archetype.roof;
    let crown = archetype.crown;
    // Telha é exceção, não regra: a maior parte das casas tem laje e muro.
    if (kind === 'casa') {
      const roll = noiseFor(spot + 7);
      if (roll < 0.46) {
        roof = 'flat';
        height = Math.min(9.5, height * 1.02);
      } else if (roll < 0.66) {
        roof = 'hip';
        height = Math.min(9.5, height * 0.94);
      }
    }
    if (kind === 'villa' && noiseFor(spot + 7) > 0.4) roof = 'flat';
    if (kind === 'galpao' && noiseFor(spot + 8) < 0.3) roof = 'flat';
    if (kind === 'torre' && noiseFor(spot + 9) < 0.16) {
      kind = 'comercial';
      crown = 1;
      height = Math.min(height, 92);
    }
    const roofH = roof === 'gable' ? rng.between(3.0, 4.4)
      : roof === 'hip' ? rng.between(2.2, 3.2)
        : roof === 'saw' ? rng.between(2.4, 3.4)
          : roof === 'crown' ? rng.between(1.4, 2.6)
            : rng.between(0.5, 1.0);
    const style = archetype.styles[rng.int(0, archetype.styles.length - 1)];
    plan.buildings.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: Math.round(width),
      d: Math.round(depth),
      h: Math.round(height * 10) / 10,
      rot: Math.round(rot * 1000) / 1000,
      tone: Math.round(noiseFor(spot + 10) * 1000) / 1000,
      kind,
      roof,
      roofH: Math.round(roofH * 10) / 10,
      style,
      crown,
      floors: Math.max(1, Math.round(height / 3.4)),
      zone,
    });
    remember(x, y, Math.hypot(width, depth) * 0.5);
    return true;
  };

  for (const block of blockInfo) {
    if (block.size < 5 || parkBlocks[block.id] || blockRural[block.id]) continue;
    const zone = blockZones[block.id];
    const mass = ZONE_MASS[zone];
    const cosA = Math.cos(block.angle);
    const sinA = Math.sin(block.angle);
    const spanU = Math.max(10, block.uMax - block.uMin);
    const spanV = Math.max(10, block.vMax - block.vMin);
    const distance = Math.hypot(block.center[0], block.center[1]);
    const primary = pickArchetype(rng, zone);
    const fade = zone === 'periferia' ? edgeFade(distance) : 1;
    const toWorld = (u: number, v: number): Pt => [
      block.center[0] + u * cosA - v * sinA,
      block.center[1] + u * sinA + v * cosA,
    ];

    if (zone === 'residencial' || zone === 'periferia') {
      // Habitação: lê a borda real das células da quadra e constrói frentes
      // contínuas de casas, com quintais no miolo. Segue a forma da quadra
      // (inclusive esquinas e ruas diagonais) em vez de um retângulo ideal.
      const cellsUV: Array<{ u: number; v: number }> = [];
      for (const cellId of blockCells[block.id]) {
        const [cx, cy] = cellCenter(plan, cellId);
        const du = cx - block.center[0];
        const dv = cy - block.center[1];
        cellsUV.push({ u: du * cosA + dv * sinA, v: -du * sinA + dv * cosA });
      }
      const bandDepth = Math.min(19, Math.max(15, Math.min(spanU, spanV) * 0.34));
      const skip = zone === 'periferia' ? 0.42 : 0.2;
      let spot = block.id * 97 + 5;

      const placeRow = (cells: Array<{ u: number; v: number }>, alongU: boolean) => {
        if (cells.length < 2) return;
        const keyOf = (cell: { u: number; v: number }) => Math.round((alongU ? cell.u : cell.v) / plan.cell);
        const sorted = [...cells].sort((a, b) => keyOf(a) - keyOf(b));
        const runs: Array<Array<{ u: number; v: number }>> = [];
        let run: Array<{ u: number; v: number }> = [];
        let lastKey = Number.NaN;
        for (const cell of sorted) {
          const key = keyOf(cell);
          if (Number.isFinite(lastKey) && key > lastKey + 1) {
            runs.push(run);
            run = [];
          }
          run.push(cell);
          lastKey = key;
        }
        if (run.length) runs.push(run);
        for (const group of runs) {
          if (group.length < 2) continue;
          const along = group.map((cell) => (alongU ? cell.u : cell.v));
          const across = group.map((cell) => (alongU ? cell.v : cell.u));
          const start = Math.min(...along);
          const finish = Math.max(...along);
          const length = finish - start + plan.cell;
          const count = Math.max(1, Math.round(length / 34));
          const width = length / count;
          if (width < 20) continue;
          const acrossMid = (Math.min(...across) + Math.max(...across)) / 2;
          const inward = Math.sign(-acrossMid) || 1;
          for (let index = 0; index < count; index += 1) {
            spot += 3;
            const position = start - plan.cell / 2 + width * (index + 0.5);
            if (noiseFor(spot) > 1 - skip * fade) {
              // Lote vazio vira quintal arborizado: o miolo da quadra respira.
              if (noiseFor(spot + 1) < 0.34) {
                const u = alongU ? position : acrossMid;
                const v = alongU ? acrossMid : position;
                const [gx, gy] = toWorld(u, v);
                gardenSpots.push({ x: gx, y: gy, s: 3.6 + noiseFor(spot + 2) * 2 });
              }
              continue;
            }
            const depth = Math.min(bandDepth + 3, length * 0.5);
            const u = alongU ? position : acrossMid + inward * bandDepth / 2;
            const v = alongU ? acrossMid + inward * bandDepth / 2 : position;
            const [x, y] = toWorld(u, v);
            const archetype = noiseFor(spot + 2) < 0.72 ? primary : pickArchetype(rng, zone);
            const width2 = width - 0.8;
            const depth2 = depth;
            const rot = block.angle + (alongU ? 0 : Math.PI / 2);
            if (!canPlace(x, y, Math.hypot(width2, depth2) * 0.5)) continue;
            placeBuilding(block, zone, archetype, x, y, width2, depth2, rot, distance, spot);
          }
        }
      };

      const vLow: typeof cellsUV = [];
      const vHigh: typeof cellsUV = [];
      const uLow: typeof cellsUV = [];
      const uHigh: typeof cellsUV = [];
      for (const cell of cellsUV) {
        if (cell.v < block.vMin + plan.cell * 1.15) vLow.push(cell);
        if (cell.v > block.vMax - plan.cell * 1.15) vHigh.push(cell);
        if (cell.u < block.uMin + plan.cell * 1.15) uLow.push(cell);
        if (cell.u > block.uMax - plan.cell * 1.15) uHigh.push(cell);
      }
      placeRow(vLow.filter((cell) => cell.u < block.uMax - plan.cell), true);
      placeRow(vHigh.filter((cell) => cell.u < block.uMax - plan.cell), true);
      placeRow(uLow.filter((cell) => cell.v < block.vMax - plan.cell), false);
      placeRow(uHigh.filter((cell) => cell.v < block.vMax - plan.cell), false);

      // Miolo: quadra de apartamentos ou quintal arborizado. Sem isso a
      // frente de rua vira um anel com um buraco no meio.
      const innerU = spanU - plan.cell * 2.2;
      const innerV = spanV - plan.cell * 2.2;
      if (innerU > 26 && innerV > 26) {
        const pitch = 30;
        const innerCols = Math.max(1, Math.min(3, Math.floor(innerU / pitch)));
        const innerRows = Math.max(1, Math.min(3, Math.floor(innerV / pitch)));
        const lotInnerW = Math.min(pitch, innerU / innerCols) - 6;
        const lotInnerD = Math.min(pitch, innerV / innerRows) - 6;
        for (let row = 0; row < innerRows; row += 1) {
          for (let col = 0; col < innerCols; col += 1) {
            const innerSpot = block.id * 211 + row * 17 + col * 5;
            if (noiseFor(innerSpot) > (zone === 'periferia' ? 0.36 : 0.62)) continue;
            if (lotInnerW < 16 || lotInnerD < 14) continue;
            const u = -((innerCols - 1) * Math.min(pitch, innerU / innerCols)) / 2 + col * Math.min(pitch, innerU / innerCols);
            const v = -((innerRows - 1) * Math.min(pitch, innerV / innerRows)) / 2 + row * Math.min(pitch, innerV / innerRows);
            const [x, y] = toWorld(u, v);
            const archetype = noiseFor(innerSpot + 1) < 0.7 ? MID_RISE : pickArchetype(rng, 'residencial');
            const width = lotInnerW + rng.between(-2, 2);
            const depth = lotInnerD + rng.between(-2, 2);
            if (!canPlace(x, y, Math.hypot(width, depth) * 0.5)) continue;
            placeBuilding(block, zone, archetype, x, y, width, depth, block.angle, distance, innerSpot);
          }
        }
        const [gx, gy] = toWorld(0, 0);
        gardenSpots.push({ x: gx, y: gy, s: 5 + noiseFor(block.id) * 3 });
      } else if (innerU > 14 && innerV > 14) {
        const [x, y] = toWorld(0, 0);
        gardenSpots.push({ x, y, s: 6 + noiseFor(block.id) * 3 });
      }
      continue;
    }

    if (zone === 'industrial') {
      // Naves seguem a quadra real: mede-se o corredor livre no eixo da
      // quadra a partir do centro (quadras recortadas pela água incluídas).
      const cellSet = new Set(blockCells[block.id]);
      const key = (i: number, j: number) => j * cells + i;
      const centerCell = cellIndex(plan, block.center[0], block.center[1]);
      let i0 = block.center[0] < 0 ? -1 : 0;
      let j0 = block.center[1] < 0 ? -1 : 0;
      if (centerCell >= 0) {
        i0 = centerCell % cells;
        j0 = Math.floor(centerCell / cells);
      } else {
        // Centroide fora da quadra (formato em L): usa a primeira célula.
        const fallback = blockCells[block.id][0];
        i0 = fallback % cells;
        j0 = Math.floor(fallback / cells);
      }
      if (cellSet.has(key(i0, j0))) {
        let lo = i0;
        let hi = i0;
        while (cellSet.has(key(lo - 1, j0))) lo -= 1;
        while (cellSet.has(key(hi + 1, j0))) hi += 1;
        let top = j0;
        let bottom = j0;
        while (cellSet.has(key(i0, top - 1))) top -= 1;
        while (cellSet.has(key(i0, bottom + 1))) bottom += 1;
        const runU = (hi - lo + 1) * cell;
        const runV = (bottom - top + 1) * cell;
        const along = runU >= runV;
        const width = Math.min(56, (along ? runU : runV) - 5);
        const depth = Math.min(34, (along ? runV : runU) - 5);
        if (width >= 18 && depth >= 14) {
          const longRun = along ? runU : runV;
          const bays = longRun > 150 ? 2 : 1;
          for (let bay = 0; bay < bays; bay += 1) {
            const shift = bays === 1 ? 0 : (bay === 0 ? -longRun * 0.24 : longRun * 0.24);
            const uCenter = -half + (Math.floor((lo + hi) / 2) + 0.5) * cell - block.center[0]
              + (along ? shift : 0);
            const vCenter = -half + (Math.floor((top + bottom) / 2) + 0.5) * cell - block.center[1]
              + (along ? 0 : shift);
            const du = uCenter * cosA + vCenter * sinA;
            const dv = -uCenter * sinA + vCenter * cosA;
            const [x, y] = toWorld(du, dv);
            const bayWidth = bays === 1 ? width : Math.min(width, longRun * 0.44);
            if (!canPlace(x, y, Math.hypot(bayWidth, depth) * 0.5)) continue;
            const spot = block.id * 61 + 7 + bay * 11;
            const archetype = noiseFor(spot + 2) < 0.75 ? BUILDING_ARCHETYPES[6] : pickArchetype(rng, zone);
            placeBuilding(block, zone, archetype, x, y, bayWidth, depth, block.angle, distance, spot);
          }
        }
      }
      continue;
    }

    // Centro: lotes regulares preenchendo a quadra.
    const cols = Math.max(1, Math.min(mass.maxCols, Math.round(spanU / mass.pitch)));
    const rows = Math.max(1, Math.min(mass.maxRows, Math.round(spanV / mass.pitch)));
    const lotW = Math.min(spanU / cols, mass.pitch * 1.2);
    const lotD = Math.min(spanV / rows, mass.pitch * 1.2);
    const gridU = (block.uMin + block.uMax) / 2 - (cols * lotW) / 2;
    const gridV = (block.vMin + block.vMax) / 2 - (rows * lotD) / 2;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const spot = block.id * 61 + row * 11 + col * 3;
        if (noiseFor(spot) > mass.fill) continue;
        const archetype = noiseFor(spot + 1) < 0.72 ? primary : pickArchetype(rng, zone);
        const u = gridU + (col + 0.5) * lotW + (noiseFor(spot + 2) - 0.5) * lotW * 0.06;
        const v = gridV + (row + 0.5) * lotD + (noiseFor(spot + 3) - 0.5) * lotD * 0.06;
        const [x, y] = toWorld(u, v);
        if (!canPlace(x, y, Math.hypot(lotW, lotD) * 0.5)) continue;
        const cover = mass.cover[0] + noiseFor(spot + 4) * (mass.cover[1] - mass.cover[0]);
        const maxW = lotW - mass.gap;
        const maxD = lotD - mass.gap;
        // Centro: torres livres sobre praça, com pegada do catálogo.
        const width = Math.min(maxW, Math.max(rng.between(archetype.w[0], archetype.w[1]), maxW * cover * 0.8));
        const depth = Math.min(maxD, Math.max(rng.between(archetype.d[0], archetype.d[1]), maxD * cover * 0.8));
        if (width < 11 || depth < 11) continue;
        // Fachada alinhada à quadra com micro-variação, nunca torta.
        const rot = block.angle + (noiseFor(spot + 6) - 0.5) * 0.04;
        placeBuilding(block, zone, archetype, x, y, width, depth, rot, distance, spot);
      }
    }
  }

  // Índice de ocupação para impedir árvores dentro de construções.
  const solidBuckets = new Map<number, Array<{ x: number; y: number; r: number }>>();
  for (const building of plan.buildings) {
    const key = bucketKey(Math.floor(building.x / 24), Math.floor(building.y / 24));
    const list = solidBuckets.get(key);
    const entry = { x: building.x, y: building.y, r: Math.hypot(building.w, building.d) * 0.5 };
    if (list) list.push(entry);
    else solidBuckets.set(key, [entry]);
  }
  const clearOfBuildings = (x: number, y: number, margin: number): boolean => {
    const bi = Math.floor(x / 24);
    const bj = Math.floor(y / 24);
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        const list = solidBuckets.get(bucketKey(bi + di, bj + dj));
        if (!list) continue;
        for (const other of list) {
          if (Math.hypot(other.x - x, other.y - y) < other.r + margin) return false;
        }
      }
    }
    return true;
  };

  // 10. Árvores: bosques nos parques, calçadas arborizadas e cinturão verde.
  for (let index = 0; index < plan.park.length; index += 1) {
    if (!plan.park[index]) continue;
    const [x, y] = cellCenter(plan, index);
    const grove = fbm(x / 210, y / 210, hashString(cityId) & 0xffff);
    if (!rng.chance(0.22 + grove * 0.58)) continue;
    plan.trees.push({
      x: Math.round((x + rng.between(-7, 7)) * 10) / 10,
      y: Math.round((y + rng.between(-7, 7)) * 10) / 10,
      s: Math.round(rng.between(3.4, 6.8) * 10) / 10,
    });
  }
  for (const spot of gardenSpots) {
    if (rng.chance(0.55)) continue;
    plan.trees.push({
      x: Math.round(spot.x * 10) / 10,
      y: Math.round(spot.y * 10) / 10,
      s: Math.round(spot.s * 10) / 10,
    });
  }
  for (const road of roads) {
    if (road.width < 20) continue;
    const offset = road.width * 0.5 + 6.5;
    for (let index = 0; index < road.pts.length - 1; index += 1) {
      const [x1, y1] = road.pts[index];
      const [x2, y2] = road.pts[index + 1];
      const length = Math.hypot(x2 - x1, y2 - y1);
      if (length < 14) continue;
      const steps = Math.max(1, Math.round(length / 54));
      const nx = (-(y2 - y1) / length) * offset;
      const ny = ((x2 - x1) / length) * offset;
      for (let step = 0; step < steps; step += 1) {
        const t = (step + 0.5) / steps;
        const side = (index + step) % 2 === 0 ? 1 : -1;
        const x = x1 + (x2 - x1) * t + nx * side;
        const y = y1 + (y2 - y1) * t + ny * side;
        if (!freePoint(x, y) || !clearOfBuildings(x, y, 3)) continue;
        if (!rng.chance(0.72)) continue;
        plan.trees.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, s: Math.round(rng.between(3, 4.4) * 10) / 10 });
      }
    }
  }
  const beltStart = half * 0.9;
  for (let index = 0; index < plan.land.length; index += 1) {
    if (!plan.land[index] || plan.road[index] || plan.park[index]) continue;
    const [x, y] = cellCenter(plan, index);
    if (Math.max(Math.abs(x), Math.abs(y)) < beltStart) continue;
    if (!rng.chance(0.16)) continue;
    if (!clearOfBuildings(x, y, 5)) continue;
    plan.trees.push({
      x: Math.round((x + rng.between(-8, 8)) * 10) / 10,
      y: Math.round((y + rng.between(-8, 8)) * 10) / 10,
      s: Math.round(rng.between(4, 7.5) * 10) / 10,
    });
  }

  // 11. Estatísticas e distritos.
  let roadMeters = 0;
  for (const road of roads) roadMeters += polylineLength(road.pts);
  const waterCells = plan.water.reduce((total, value) => total + value, 0);
  const parkCells = plan.park.reduce((total, value) => total + value, 0);
  plan.roads = roads;
  plan.stats = {
    roadKm: Math.round(roadMeters / 100) / 10,
    buildings: plan.buildings.length,
    parkArea: Math.round(parkCells * cell * cell),
    waterRatio: Math.round((waterCells / plan.water.length) * 1000) / 1000,
    blocks: plan.stats.blocks,
    tallest: plan.buildings.reduce((max, building) => Math.max(max, building.h), 0),
  };
  plan.districts = [
    { name: 'Centro', x: 0, y: 0 },
    { name: plan.center[1] < -120 ? 'Orla' : 'Norte', x: 0, y: plan.center[1] < -120 ? half * 0.62 : -half * 0.45 },
    { name: 'Leste', x: half * 0.55, y: 0 },
    { name: 'Oeste', x: -half * 0.55, y: 0 },
  ];
  if (plan.center[1] < -200) plan.districts[1].y = half * 0.55;
  return plan;
}

function distanceLabel(x: number, y: number): string {
  const distance = Math.hypot(x, y);
  if (distance < 550) return 'Centro';
  if (distance < 1200) return 'Expansão';
  return 'Periferia';
}

/** Cache de planos por cidade — o mesmo plano abastece seleção, jogo e testes. */
const cache = new Map<string, CityPlan>();

export function getCityPlan(cityId: string, seed = 0): CityPlan {
  const key = `${cityId}:${seed}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const plan = generateCityPlan(cityId, seed);
  cache.set(key, plan);
  return plan;
}
