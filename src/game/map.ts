import { BUILDINGS } from './constants';
import type { BuildingKey, FactionId, ResourceNode, Tile, TerrainKey } from './types';
import type { Rng } from './rng';

// ── Hex helpers (axial coordinates, pointy-top) ─────────────────────────────

export const HEX_DIRS = [
  { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
  { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
] as const;

export const tileId = (q: number, r: number): string => `t${q}_${r}`;

export function getTile(state: { tiles: Record<string, Tile> }, q: number, r: number): Tile | undefined {
  return state.tiles[tileId(q, r)];
}

export function neighborsOf(tile: Tile, tiles: Record<string, Tile>): Tile[] {
  const out: Tile[] = [];
  for (const d of HEX_DIRS) {
    const n = tiles[tileId(tile.q + d.q, tile.r + d.r)];
    if (n) out.push(n);
  }
  return out;
}

export function axialDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const ax = a.q, az = a.r, ay = -ax - az;
  const bx = b.q, bz = b.r, by = -bx - bz;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

export function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * 1.5 * r,
  };
}

export function hexCorners(cx: number, cy: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + size * Math.cos(angle)).toFixed(2)},${(cy + size * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// ── World definition ────────────────────────────────────────────────────────

interface RawTile {
  q: number;
  r: number;
  name: string;
  terrain: TerrainKey;
  node: ResourceNode;
  pop: number;
  strategic: number;
  owner?: FactionId;
  capital?: boolean;
  buildings?: Partial<Record<BuildingKey, number>>;
  note?: string;
}

const RAW: RawTile[] = [
  // Casa Concórdia — capital and one rural holding
  {
    q: -2, r: 1, name: 'Porto Lúmen', terrain: 'costa', node: 'pesca', pop: 22, strategic: 2,
    owner: 'concordia', capital: true,
    buildings: { administrativo: 2, fazenda: 1, defesa: 1, logistica: 1, entreposto: 1 },
    note: 'Fundada sobre sete cais, é o coração comercial da Casa Concórdia.',
  },
  {
    q: -2, r: 2, name: 'Campos de Mirra', terrain: 'planicie', node: 'fertil', pop: 9, strategic: 1,
    owner: 'concordia', buildings: { fazenda: 1 },
    note: 'Celeiros de Mirra: a despensa de Porto Lúmen.',
  },

  // Corredores neutros
  {
    q: -3, r: 1, name: 'Véu da Serra', terrain: 'montanha', node: 'minerio', pop: 6, strategic: 2,
    buildings: { extratora: 1 }, note: 'Minas antigas, agora operadas por capatazes independentes.',
  },
  { q: -1, r: 1, name: 'Valo Verde', terrain: 'floresta', node: 'madeira', pop: 5, strategic: 1 },
  { q: -3, r: 2, name: 'Estreito Cinza', terrain: 'costa', node: 'pesca', pop: 7, strategic: 1 },
  { q: -1, r: 2, name: 'Colinas de Anzo', terrain: 'colina', node: 'minerio', pop: 6, strategic: 2 },
  { q: -2, r: 3, name: 'Vale Úmbrio', terrain: 'floresta', node: 'nenhum', pop: 4, strategic: 1 },
  { q: -4, r: 2, name: 'Ilha Fendida', terrain: 'costa', node: 'pesca', pop: 3, strategic: 2 },
  { q: -3, r: 0, name: 'Baixada Sombria', terrain: 'planicie', node: 'fertil', pop: 5, strategic: 1 },
  {
    q: -1, r: 0, name: 'Passo de Ravel', terrain: 'colina', node: 'minerio', pop: 8, strategic: 3,
    buildings: { defesa: 1 }, note: 'O único caminho seco entre o oeste e o coração de Vesper.',
  },
  { q: -2, r: 0, name: 'Bosque Cinéreo', terrain: 'floresta', node: 'madeira', pop: 5, strategic: 1 },
  { q: -1, r: -1, name: 'Bosque Partido', terrain: 'floresta', node: 'energia', pop: 4, strategic: 1, buildings: { logistica: 1 } },
  { q: -2, r: -1, name: 'Vértice Oeste', terrain: 'colina', node: 'minerio', pop: 5, strategic: 1 },
  { q: -3, r: -1, name: 'Baía Silente', terrain: 'costa', node: 'pesca', pop: 4, strategic: 1 },
  { q: -3, r: 3, name: 'Mangue de Lúmen', terrain: 'costa', node: 'fertil', pop: 4, strategic: 1 },
  { q: -1, r: 3, name: 'Vale Verdejante', terrain: 'floresta', node: 'madeira', pop: 4, strategic: 1 },
  { q: -2, r: 4, name: 'Campo de Sal', terrain: 'deserto', node: 'energia', pop: 3, strategic: 1 },

  // Consórcio Kestrel
  {
    q: -1, r: -4, name: 'Ferroalto', terrain: 'montanha', node: 'minerio', pop: 20, strategic: 2,
    owner: 'kestrel', capital: true,
    buildings: { administrativo: 2, extratora: 2, usina: 1, defesa: 1, logistica: 1 },
    note: 'A cidade-forja do leste, onde a fumaça nunca se dissipa.',
  },
  {
    q: 0, r: -4, name: 'Forja Menor', terrain: 'colina', node: 'minerio', pop: 8, strategic: 1,
    owner: 'kestrel', buildings: { extratora: 1 },
  },
  {
    q: -1, r: -3, name: 'Cume Fumegante', terrain: 'montanha', node: 'energia', pop: 7, strategic: 2,
    buildings: { usina: 1 },
  },
  { q: -2, r: -3, name: 'Dentes de Kestrel', terrain: 'montanha', node: 'minerio', pop: 5, strategic: 1 },
  { q: -2, r: -4, name: 'Alto Fuligem', terrain: 'colina', node: 'nenhum', pop: 4, strategic: 1 },
  { q: -1, r: -5, name: 'Garganta Norte', terrain: 'floresta', node: 'madeira', pop: 4, strategic: 1 },
  { q: 0, r: -5, name: 'Lagoa Vasta', terrain: 'costa', node: 'pesca', pop: 5, strategic: 1 },
  { q: 0, r: -3, name: 'Planalto Vazio', terrain: 'planicie', node: 'energia', pop: 5, strategic: 1 },
  { q: 0, r: -2, name: 'Garganta Central', terrain: 'montanha', node: 'energia', pop: 4, strategic: 2 },

  // Liga Aureliana
  {
    q: 3, r: -2, name: 'Ourovil', terrain: 'costa', node: 'raro', pop: 21, strategic: 2,
    owner: 'aurelia', capital: true,
    buildings: { administrativo: 2, entreposto: 2, fazenda: 1, defesa: 1, logistica: 1 },
    note: 'Bancos de pedra dourada abrigam o maior mercado de crédito do Cinturão.',
  },
  {
    q: 2, r: -2, name: 'Campo das Trocas', terrain: 'planicie', node: 'fertil', pop: 10, strategic: 1,
    owner: 'aurelia', buildings: { fazenda: 1 },
  },
  {
    q: 3, r: -1, name: 'Mercados de Rhen', terrain: 'planicie', node: 'nenhum', pop: 9, strategic: 1,
    buildings: { entreposto: 1 },
  },
  { q: 4, r: -2, name: 'Salinas de Ouro', terrain: 'deserto', node: 'raro', pop: 6, strategic: 1 },
  { q: 2, r: -1, name: 'Ponte Dourada', terrain: 'costa', node: 'nenhum', pop: 6, strategic: 2 },
  { q: 3, r: -3, name: 'Alameda Alta', terrain: 'colina', node: 'energia', pop: 5, strategic: 1 },
  { q: 2, r: -3, name: 'Terraço de Vidro', terrain: 'colina', node: 'nenhum', pop: 4, strategic: 1 },
  { q: 4, r: -3, name: 'Duna Rosa', terrain: 'deserto', node: 'minerio', pop: 4, strategic: 1 },
  { q: 3, r: 0, name: 'Arquipélago Rhen', terrain: 'costa', node: 'pesca', pop: 5, strategic: 1 },
  { q: 4, r: -1, name: 'Dunas de Ouro', terrain: 'deserto', node: 'minerio', pop: 4, strategic: 1 },
  { q: 2, r: 0, name: 'Ilha do Trigo', terrain: 'costa', node: 'fertil', pop: 5, strategic: 1 },

  // Domínio Vantor
  {
    q: 2, r: 4, name: 'Bastião Cindro', terrain: 'colina', node: 'minerio', pop: 21, strategic: 2,
    owner: 'vantor', capital: true,
    buildings: { administrativo: 2, extratora: 2, defesa: 2, fazenda: 1, logistica: 1 },
    note: 'Uma fortaleza-cidade talhada na rocha, sede do punho quebrado de Vantor.',
  },
  {
    q: 2, r: 5, name: 'Vale do Punho', terrain: 'planicie', node: 'fertil', pop: 9, strategic: 1,
    owner: 'vantor', buildings: { fazenda: 1 },
  },
  {
    q: 1, r: 5, name: 'Forja de Guerra', terrain: 'montanha', node: 'minerio', pop: 8, strategic: 1,
    buildings: { extratora: 1 },
  },
  { q: 3, r: 4, name: 'Muralha de Sal', terrain: 'costa', node: 'pesca', pop: 7, strategic: 1 },
  { q: 1, r: 4, name: 'Passo Sangrento', terrain: 'deserto', node: 'nenhum', pop: 5, strategic: 2 },
  { q: 2, r: 3, name: 'Planície de Vidro', terrain: 'planicie', node: 'fertil', pop: 6, strategic: 1 },
  { q: 3, r: 3, name: 'Posto Sul', terrain: 'deserto', node: 'energia', pop: 4, strategic: 1 },
  {
    q: 1, r: 3, name: 'Ruínas de Cindro', terrain: 'deserto', node: 'raro', pop: 3, strategic: 3,
    note: 'As ruínas da velha capital Vantor. Quem as controla herda sua lenda.',
  },
  { q: 0, r: 4, name: 'Boca do Abismo', terrain: 'montanha', node: 'minerio', pop: 3, strategic: 2 },

  // Coração de Vesper — neutros estratégicos
  {
    q: 0, r: 0, name: 'Coração de Vesper', terrain: 'planicie', node: 'fertil', pop: 8, strategic: 3,
    buildings: { administrativo: 1 },
    note: 'O antigo parlamento do Cinturão. Uma cidade livre, cobiçada por todas as Casas.',
  },
  { q: 0, r: 1, name: 'Nó de Rotas', terrain: 'planicie', node: 'nenhum', pop: 6, strategic: 3, note: 'Sete estradas se cruzam aqui. Controle-as e o comércio se curva.' },
  { q: 1, r: 0, name: 'Vau de Orvalho', terrain: 'costa', node: 'pesca', pop: 6, strategic: 1 },
  { q: 0, r: -1, name: 'Cume Partido', terrain: 'colina', node: 'minerio', pop: 5, strategic: 2 },
  {
    q: 1, r: -2, name: 'Ruínas de Vael', terrain: 'floresta', node: 'raro', pop: 4, strategic: 3,
    buildings: { pesquisa: 1 }, note: 'Uma capital esquecida cujos arquivos ainda sussurram segredos.',
  },
  { q: 1, r: 1, name: 'Planície de Sortis', terrain: 'planicie', node: 'fertil', pop: 6, strategic: 1 },
  { q: 2, r: 1, name: 'Ponta de Âmbar', terrain: 'costa', node: 'nenhum', pop: 5, strategic: 2 },
  { q: 2, r: 2, name: 'Desfiladeiro Sul', terrain: 'deserto', node: 'nenhum', pop: 3, strategic: 2, buildings: { defesa: 1 } },
  { q: 0, r: 2, name: 'Charneca de Ivo', terrain: 'floresta', node: 'madeira', pop: 4, strategic: 1 },
  { q: 0, r: 3, name: 'Ermo de Cinzas', terrain: 'deserto', node: 'raro', pop: 3, strategic: 3, note: 'Areia negra rica em metais raros. Também chamada de Cicatriz.' },
  { q: 1, r: 2, name: 'Colina de Sortis', terrain: 'colina', node: 'energia', pop: 4, strategic: 1 },
];

const SPECS: RawTile[] = RAW.filter((t) => t.name && t.terrain !== 'agua' && t.pop > 0);

function zeroBuildings(): Record<BuildingKey, number> {
  const rec = {} as Record<BuildingKey, number>;
  for (const key of Object.keys(BUILDINGS) as BuildingKey[]) rec[key] = 0;
  return rec;
}

export function createTiles(rng: Rng): Record<string, Tile> {
  const tiles: Record<string, Tile> = {};
  for (const raw of SPECS) {
    const buildings = zeroBuildings();
    if (raw.buildings) {
      for (const [k, v] of Object.entries(raw.buildings)) buildings[k as BuildingKey] = v ?? 0;
    }
    const jitter = raw.capital ? 0 : rng.int(-1, 1);
    const tile: Tile = {
      id: tileId(raw.q, raw.r),
      q: raw.q,
      r: raw.r,
      name: raw.name,
      terrain: raw.terrain,
      node: raw.node,
      pop: Math.max(2, raw.pop + jitter),
      owner: raw.owner ?? null,
      buildings,
      unrest: raw.owner ? rng.int(0, 4) : rng.int(2, 12),
      strategic: raw.strategic,
      isCapital: Boolean(raw.capital),
      note: raw.note,
    };
    tiles[tile.id] = tile;
  }
  return tiles;
}

export function tileNeighborsOf(tileIdValue: string, tiles: Record<string, Tile>): Tile[] {
  const tile = tiles[tileIdValue];
  return tile ? neighborsOf(tile, tiles) : [];
}

export function tilesOfFaction(tiles: Record<string, Tile>, factionId: FactionId): Tile[] {
  return Object.values(tiles)
    .filter((t) => t.owner === factionId)
    .sort((a, b) => (b.isCapital ? 1 : 0) - (a.isCapital ? 1 : 0) || a.name.localeCompare(b.name));
}

export function mapBounds(tiles: Record<string, Tile>, size: number) {
  const all = Object.values(tiles).map((t) => hexToPixel(t.q, t.r, size));
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const pad = size * 1.8;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

export const MAP_SIZE = 36;
