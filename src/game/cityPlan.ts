import { CITY_BY_ID, COUNTRY_BY_ID } from './atlas';
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
}

export type BuildingZone = 'centro' | 'meio' | 'borda';

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

/** Catálogo de tipologias. Os pesos mudam do centro para a periferia. */
export const BUILDING_ARCHETYPES: BuildingArchetype[] = [
  { kind: 'torre', roof: 'crown', w: [20, 30], d: [20, 30], h: [62, 152], styles: [3, 4, 1], crown: 2, weight: { centro: 20, meio: 4, borda: 0 } },
  { kind: 'comercial', roof: 'crown', w: [20, 30], d: [17, 26], h: [34, 78], styles: [3, 5, 1], crown: 1, weight: { centro: 18, meio: 7, borda: 1 } },
  { kind: 'predio', roof: 'flat', w: [18, 28], d: [14, 22], h: [20, 44], styles: [0, 1, 2], crown: 1, weight: { centro: 22, meio: 24, borda: 5 } },
  { kind: 'solar', roof: 'flat', w: [16, 26], d: [13, 20], h: [11, 21], styles: [0, 2, 5], crown: 0, weight: { centro: 12, meio: 22, borda: 12 } },
  { kind: 'casa', roof: 'gable', w: [8, 13], d: [9, 14], h: [6, 10], styles: [0, 2, 6], crown: 0, weight: { centro: 4, meio: 22, borda: 44 } },
  { kind: 'villa', roof: 'hip', w: [12, 18], d: [11, 16], h: [7, 11], styles: [0, 1, 6], crown: 0, weight: { centro: 2, meio: 8, borda: 16 } },
  { kind: 'galpao', roof: 'saw', w: [26, 40], d: [17, 28], h: [8, 14], styles: [2, 5], crown: 0, weight: { centro: 0, meio: 14, borda: 22 } },
  { kind: 'marco', roof: 'crown', w: [16, 24], d: [16, 24], h: [38, 86], styles: [6], crown: 2, weight: { centro: 2, meio: 0, borda: 0 } },
];

export function pickArchetype(rng: Rng, zone: BuildingZone, radial: number): BuildingArchetype {
  const pool = BUILDING_ARCHETYPES.map((archetype) => ({
    archetype,
    weight: archetype.kind === 'galpao' && radial < 0.62 ? 0 : archetype.weight[zone],
  }));
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.next() * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.archetype;
  }
  return BUILDING_ARCHETYPES[0];
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
  const city = CITY_BY_ID[cityId];
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
      roads.push({ pts: run, width: rng.between(21, 29), kind: 'arterial' });
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
      roads.push({ pts: run, width: ring === 0 ? 18 : 20, kind: 'anel' });
    }
  }

  // Malha local: a cidade é dividida em nove distritos, cada um com sua
  // orientação de quadra (ruas retas com pequenas quebras).
  const districtSpan = size / 3;
  for (let dj = 0; dj < 3; dj += 1) {
    for (let di = 0; di < 3; di += 1) {
      const cx = -half + (di + 0.5) * districtSpan;
      const cy = -half + (dj + 0.5) * districtSpan;
      const far = Math.hypot(cx, cy) / half;
      const angle = baseAngle + Math.PI / 2 + (far > 0.55 ? Math.PI / 4 : 0) + rng.between(-0.22, 0.22);
      const spacing = rng.between(165, 215);
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
          if (k !== 0 && rng.chance(0.34)) continue;
          const width = k === 0 ? 17 : rng.between(11, 14);
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

  const blockInfo = blockCells.map((members, id) => {
    let sumX = 0;
    let sumY = 0;
    for (const index of members) {
      const [x, y] = cellCenter(plan, index);
      sumX += x;
      sumY += y;
    }
    const c: Pt = members.length ? [sumX / members.length, sumY / members.length] : [0, 0];
    return { id, size: members.length, center: c, angle: baseAngle + Math.PI / 2 };
  });

  // 6. Parques e praças.
  for (const block of blockInfo) {
    if (block.size < 6) continue;
    const distance = Math.hypot(block.center[0], block.center[1]);
    const chance = distance < 500 ? 0.06 : 0.022;
    if (rng.chance(chance)) {
      for (const index of blockCells[block.id]) plan.park[index] = 1;
    }
  }
  // Praça central.
  const centralBlock = blockInfo
    .filter((block) => block.size >= 8)
    .sort((a, b) => Math.hypot(a.center[0], a.center[1]) - Math.hypot(b.center[0], b.center[1]))[0];
  if (centralBlock) {
    for (const index of blockCells[centralBlock.id]) plan.park[index] = 1;
  }

  // 7. Lotes para a sede e demais construções.
  const plotCandidates = blockInfo
    .filter((block) => block.size >= 9 && !plan.park[blockCells[block.id][0]])
    .sort((a, b) => Math.hypot(a.center[0], a.center[1]) - Math.hypot(b.center[0], b.center[1]))
    .slice(0, 26);
  let plotNumber = 0;
  for (const block of plotCandidates) {
    if (plan.plots.length >= 20) break;
    const members = blockCells[block.id];
    const sizeLimit = Math.sqrt(block.size) * cell;
    const side = Math.min(52, Math.max(34, sizeLimit * 0.55));
    const angle = block.angle + rng.between(-0.12, 0.12);
    const x = block.center[0];
    const y = block.center[1];
    // Precisa de um lote livre de ruas e água.
    let valid = true;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]] as Pt[]) {
      const pointX = x + dx * side * 0.5;
      const pointY = y + dy * side * 0.5;
      const index = cellIndex(plan, pointX, pointY);
      if (index < 0 || plan.land[index] === 0 || plan.road[index] === 1 || plan.park[index] === 1) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    plotNumber += 1;
    plan.plots.push({
      id: `${cityId}-lote-${String(plotNumber).padStart(2, '0')}`,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(side),
      d: Math.round(side),
      rot: angle,
      district: distanceLabel(x, y),
    });
  }

  // 8. Edificações sobre as quadras.
  // Células reservadas aos lotes da sede: nenhum edifício nasce em cima delas.
  const plotCells = new Uint8Array(cells * cells);
  for (const plot of plan.plots) {
    for (const [dx, dy] of [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]] as Pt[]) {
      const index = cellIndex(plan, plot.x + dx * plot.w * 0.5, plot.y + dy * plot.d * 0.5);
      if (index >= 0) plotCells[index] = 1;
    }
  }
  const cityScale = city && city.pop > 2_000_000 ? 1.15 : city && city.pop < 400_000 ? 0.82 : 1;
  const coreRadius = 980 * cityScale;

  // Índice espacial simples (baldes de 18 m) para impedir sobreposição.
  const buckets = new Map<number, Array<{ x: number; y: number; r: number }>>();
  const bucketKey = (i: number, j: number) => (i + 512) * 1024 + (j + 512);
  const canPlace = (x: number, y: number, radius: number): boolean => {
    const bi = Math.floor(x / 18);
    const bj = Math.floor(y / 18);
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        const list = buckets.get(bucketKey(bi + di, bj + dj));
        if (!list) continue;
        for (const other of list) {
          if (Math.hypot(other.x - x, other.y - y) < (other.r + radius) * 0.72) return false;
        }
      }
    }
    return true;
  };
  const remember = (x: number, y: number, radius: number) => {
    const bi = Math.floor(x / 18);
    const bj = Math.floor(y / 18);
    const key = bucketKey(bi, bj);
    const list = buckets.get(key);
    if (list) list.push({ x, y, r: radius });
    else buckets.set(key, [{ x, y, r: radius }]);
  };

  for (const block of blockInfo) {
    if (block.size < 2) continue;
    if (plan.park[blockCells[block.id][0]]) continue;
    const members = blockCells[block.id].slice();
    // Ordem embaralhada determinística: quadras crescem sem padrão de varredura.
    for (let index = members.length - 1; index > 0; index -= 1) {
      const swap = rng.int(0, index);
      const tmp = members[index];
      members[index] = members[swap];
      members[swap] = tmp;
    }
    const angle = block.angle + rng.between(-0.22, 0.22);
    for (const cellId of members) {
      if (plan.road[cellId] || plan.park[cellId] || plotCells[cellId]) continue;
      if (!rng.chance(0.66)) continue;
      const [cellX, cellY] = cellCenter(plan, cellId);
      const x = cellX + rng.between(-7, 7);
      const y = cellY + rng.between(-7, 7);
      const distance = Math.hypot(x, y);
      const zone: BuildingZone = distance < coreRadius ? 'centro' : distance < coreRadius * 2.1 ? 'meio' : 'borda';
      const radial = Math.min(1, distance / half);
      const archetype = pickArchetype(rng, zone, radial);
      let width = rng.between(archetype.w[0], archetype.w[1]);
      let depth = rng.between(archetype.d[0], archetype.d[1]);
      if (archetype.kind === 'galpao') {
        width = Math.min(width, 38);
        depth = Math.min(depth, 26);
      }
      // Amostra os cantos um pouco para dentro: a fachada pode encostar na rua.
      const halfWidth = width * 0.39;
      const halfDepth = depth * 0.39;
      const samples: Pt[] = [
        [x, y],
        [x + halfWidth, y + halfDepth],
        [x - halfWidth, y + halfDepth],
        [x + halfWidth, y - halfDepth],
        [x - halfWidth, y - halfDepth],
      ];
      let valid = true;
      for (const [px, py] of samples) {
        const index = cellIndex(plan, px, py);
        if (index < 0 || plan.land[index] === 0 || plan.road[index] === 1 || plan.park[index] === 1 || plotCells[index]) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      const radius = Math.hypot(width, depth) / 2;
      if (!canPlace(x, y, radius)) continue;
      remember(x, y, radius);

      // Altura: queda suave do centro para a borda, com variação por lote.
      const center = Math.exp(-distance / (1500 * cityScale));
      let height = rng.between(archetype.h[0], archetype.h[1]);
      height *= (0.62 + 0.6 * center) * (0.94 + radial * 0.12);
      height = Math.max(5.5, Math.min(160, height));
      let kind = archetype.kind;
      let roof = archetype.roof;
      let crown = archetype.crown;
      // Torres ocasionais no centro alto e casas geminadas na periferia.
      if (kind === 'casa' && rng.chance(0.26)) {
        roof = 'hip';
        height = Math.min(9.5, height * 0.92);
      }
      if (kind === 'predio' && rng.chance(0.14)) {
        roof = 'gable';
        height = Math.min(26, height * 0.8);
      }
      if (kind === 'galpao' && rng.chance(0.3)) roof = 'flat';
      if (kind === 'torre' && rng.chance(0.18)) {
        kind = 'comercial';
        roof = 'crown';
        crown = 1;
      }
      const roofH = roof === 'gable' ? rng.between(3.0, 4.6)
        : roof === 'hip' ? rng.between(2.2, 3.4)
          : roof === 'saw' ? rng.between(2.6, 3.6)
            : roof === 'crown' ? rng.between(1.6, 3.0)
              : rng.between(0.5, 1.1);
      const style = archetype.styles[rng.int(0, archetype.styles.length - 1)];
      plan.buildings.push({
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        w: Math.round(width),
        d: Math.round(depth),
        h: Math.round(height * 10) / 10,
        rot: Math.round(angle * 1000) / 1000,
        tone: rng.between(0, 1),
        kind,
        roof,
        roofH: Math.round(roofH * 10) / 10,
        style,
        crown,
        floors: Math.max(1, Math.round(height / 3.4)),
      });
    }
  }

  // 9. Árvores nos parques.
  for (let index = 0; index < plan.park.length; index += 1) {
    if (!plan.park[index] || rng.chance(0.28)) continue;
    const [x, y] = cellCenter(plan, index);
    plan.trees.push({
      x: Math.round((x + rng.between(-7, 7)) * 10) / 10,
      y: Math.round((y + rng.between(-7, 7)) * 10) / 10,
      s: Math.round(rng.between(3, 6.5) * 10) / 10,
    });
  }

  // 10. Estatísticas e distritos.
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
