import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CITY_CELLS,
  sampleHeight,
  type BuildingKind,
  type BuildingZone,
  type CityBuilding,
  type CityPlan,
  type CityPlot,
  type RoofKind,
} from '../../game/cityPlan';
import { Dollhouse, FLOOR_HEIGHT } from './Dollhouse';

// ─────────────────────────────────────────────────────────────────────────────
// Cena 3D da cidade: terreno, água, quadras, ruas, edificações e interior.
// Unidade = metro. A câmera orbita o centro; no modo interior ela entra na sede.
// ─────────────────────────────────────────────────────────────────────────────

export type CityMode = 'overview' | 'select' | 'building' | 'interior';

export interface CitySceneCallbacks {
  onHoverPlot: (plot: CityPlot | null, x: number, y: number) => void;
  onPickPlot: (plot: CityPlot) => void;
  onEnterBuilding: () => void;
  onFail: () => void;
}

/**
 * Paleta de maquete: base clara e mate, asfalto neutro, verde natural e vidro
 * azulado. Tudo com contraste de valor suficiente para as quadras e avenidas
 * serem lidas à primeira vista — sem contornos escuros nem cores saturadas.
 */
const COLORS = {
  ground: 0xc9c3b3,
  groundHigh: 0xb6ae9c,
  groundEdge: 0x8e9678,
  park: 0x9db183,
  parkDeep: 0x8ba070,
  sand: 0xd8cfb4,
  water: 0x89aab1,
  asphalt: 0x9c988e,
  avenue: 0x938f85,
  sidewalk: 0xc4beb0,
  kerb: 0xd6d0c2,
  marking: 0xf0ebdd,
  median: 0x94a37c,
  skirting: 0xcfc7b6,
  hq: 0xd8b46a,
  interiorFloor: 0x2a2b28,
  interiorWall: 0x3c3f3a,
  wood: 0x6d5136,
};

/** Cores das fachadas por zona: betão, bege, branco e vidro azulado. */
const ZONE_FACADES: Record<string, number[]> = {
  centro: [0xf1eee6, 0xe7e2d6, 0xdad7cc, 0xd9dbd8, 0xcdd5d8],
  residencial: [0xf3ecdd, 0xe8dfcd, 0xdccfba, 0xefe7da, 0xe2d6c3],
  industrial: [0xdfe0da, 0xd3d6d0, 0xc9cfcb, 0xe6e5dd],
  periferia: [0xece1cb, 0xe2d5bd, 0xd9cbb2, 0xf0e8d8],
};

const ROOF_COLORS: Record<RoofKind, number[]> = {
  gable: [0xa9735b, 0x9c6b54, 0xb17b62],
  hip: [0x9c7f6a, 0x907763, 0xa98c75],
  flat: [0x9b978e, 0x8f8c84, 0xa5a199],
  saw: [0xa9ada7, 0x9ea49f, 0xb3b6b0],
  crown: [0x8e9a9c, 0x98a3a5],
};

/** Tipologias reutilizáveis: poucos modelos, variação por escala e cor. */
type FacadeKind = 'grid' | 'ribbon' | 'housing';

interface BuildingModel {
  key: string;
  kinds: BuildingKind[];
  zones: BuildingZone[];
  w: number;
  d: number;
  h: number;
  facade: FacadeKind;
  roof: RoofKind;
  walls: THREE.BufferGeometry;
  roofGeometry: THREE.BufferGeometry;
  accent: THREE.BufferGeometry | null;
}

/* ── Geometria utilitária (metres, sem texturas fora das fachadas) ──────── */

const TILE_W = 7.2;
const TILE_H = 3.6;

/** Quatro paredes com UV em metros: cada tile é uma janela de 7,2 × 3,6 m. */
function wallBox(w: number, h: number, d: number, y0 = 0): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const push = (
    corners: Array<[number, number, number]>,
    normal: [number, number, number],
    uSpan: number,
  ) => {
    const base = positions.length / 3;
    const [a, b, c, e] = corners;
    for (const [x, y, z] of [a, b, c, e]) {
      positions.push(x, y, z);
      normals.push(normal[0], normal[1], normal[2]);
    }
    uvs.push(0, 0, uSpan / TILE_W, 0, uSpan / TILE_W, h / TILE_H, 0, h / TILE_H);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const hw = w / 2;
  const hd = d / 2;
  const top = y0 + h;
  push([[hw, y0, hd], [hw, y0, -hd], [hw, top, -hd], [hw, top, hd]], [1, 0, 0], d);
  push([[-hw, y0, -hd], [-hw, y0, hd], [-hw, top, hd], [-hw, top, -hd]], [-1, 0, 0], d);
  push([[-hw, y0, hd], [hw, y0, hd], [hw, top, hd], [-hw, top, hd]], [0, 0, 1], w);
  push([[hw, y0, -hd], [-hw, y0, -hd], [-hw, top, -hd], [hw, top, -hd]], [0, 0, -1], w);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Sólido sem UV para coberturas, coroas e detalhes. */
function solidBox(w: number, h: number, d: number, y0 = 0): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.deleteAttribute('uv');
  geometry.translate(0, y0 + h / 2, 0);
  return geometry;
}

function gableSolid(w: number, d: number, rise: number, y0 = 0): THREE.BufferGeometry {
  const geometry = gableGeometry();
  geometry.scale(w, rise, d);
  geometry.translate(0, y0, 0);
  geometry.deleteAttribute('uv');
  return geometry;
}

function hipSolid(w: number, d: number, rise: number, y0 = 0): THREE.BufferGeometry {
  const geometry = hipGeometry();
  geometry.scale(w, rise, d);
  geometry.translate(0, y0, 0);
  geometry.deleteAttribute('uv');
  return geometry;
}

function sawSolid(w: number, d: number, rise: number, y0 = 0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bays = 3;
  const bay = d / bays;
  for (let index = 0; index < bays; index += 1) {
    const geometry = sawGeometry();
    geometry.scale(w, rise, bay);
    geometry.translate(0, y0, -d / 2 + bay * (index + 0.5));
    geometry.deleteAttribute('uv');
    parts.push(geometry);
  }
  return mergeGeometries(parts, false) ?? parts[0];
}

function mergeWalls(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts, false) ?? parts[0];
}

/* ── Catálogo de modelos ───────────────────────────────────────────────── */

function buildModels(): BuildingModel[] {
  const models: BuildingModel[] = [];
  const add = (
    spec: Omit<BuildingModel, 'walls' | 'roofGeometry' | 'accent'> & {
      walls: THREE.BufferGeometry[];
      roofGeometry: THREE.BufferGeometry;
      accent?: THREE.BufferGeometry | null;
    },
  ) => {
    models.push({
      ...spec,
      walls: mergeWalls(spec.walls),
      accent: spec.accent ?? null,
    });
  };

  // Torres do centro financeiro: três silhuetas distintas.
  add({
    key: 'torre-a', kinds: ['torre', 'comercial'], zones: ['centro'], w: 34, d: 30, h: 105.2, facade: 'ribbon', roof: 'flat',
    walls: [wallBox(34, 92, 30), wallBox(24, 12, 21, 92)],
    roofGeometry: solidBox(24.6, 1.2, 21.6, 104),
    accent: solidBox(11, 4.2, 9, 105.2),
  });
  add({
    key: 'torre-b', kinds: ['torre', 'comercial'], zones: ['centro'], w: 30, d: 30, h: 153.4, facade: 'ribbon', roof: 'crown',
    walls: [wallBox(30, 96, 30), wallBox(23, 40, 23, 96), wallBox(15, 16, 15, 136)],
    roofGeometry: solidBox(15.6, 1.4, 15.6, 152),
    accent: mergeWalls([solidBox(0.9, 24, 0.9, 153), solidBox(5, 1.2, 5, 153)]),
  });
  add({
    key: 'torre-c', kinds: ['torre', 'comercial'], zones: ['centro'], w: 40, d: 33, h: 75.2, facade: 'grid', roof: 'flat',
    walls: [wallBox(40, 74, 33), wallBox(17, 22, 14, 0)],
    roofGeometry: solidBox(40.8, 1.2, 33.8, 74),
    accent: solidBox(14, 3.6, 12, 75.2),
  });
  // Escritórios e edifícios de médio porte.
  add({
    key: 'escritorio-a', kinds: ['comercial', 'predio', 'solar'], zones: ['centro', 'residencial'], w: 34, d: 24, h: 45.1, facade: 'grid', roof: 'flat',
    walls: [wallBox(34, 44, 24)],
    roofGeometry: solidBox(35, 1.1, 25, 44),
    accent: mergeWalls([solidBox(10, 3.2, 8, 45.1), solidBox(30, 1.1, 1.2, 45.1)]),
  });
  add({
    key: 'escritorio-b', kinds: ['comercial', 'predio', 'solar'], zones: ['centro', 'residencial'], w: 28, d: 22, h: 63.1, facade: 'ribbon', roof: 'flat',
    walls: [wallBox(28, 62, 22), wallBox(11, 26, 18, 0)],
    roofGeometry: solidBox(28.6, 1.1, 22.6, 62),
    accent: solidBox(9, 3, 7, 63.1),
  });
  add({
    key: 'predio-a', kinds: ['predio', 'solar'], zones: ['centro', 'residencial', 'periferia'], w: 36, d: 26, h: 31, facade: 'grid', roof: 'flat',
    walls: [wallBox(36, 30, 26)],
    roofGeometry: solidBox(37, 1, 27, 30),
    accent: mergeWalls([solidBox(8, 2.8, 6, 31), solidBox(33, 0.9, 0.9, 31)]),
  });
  add({
    key: 'predio-b', kinds: ['predio', 'solar'], zones: ['residencial', 'periferia', 'centro'], w: 30, d: 21, h: 39, facade: 'grid', roof: 'flat',
    walls: [wallBox(30, 38, 21), wallBox(13, 19, 9, 0)],
    roofGeometry: solidBox(30.6, 1, 21.6, 38),
    accent: null,
  });
  add({
    key: 'predio-c', kinds: ['predio', 'solar'], zones: ['residencial', 'periferia'], w: 26, d: 24, h: 22, facade: 'housing', roof: 'flat',
    walls: [wallBox(26, 21, 24)],
    roofGeometry: solidBox(26.6, 1, 24.6, 21),
    accent: null,
  });
  add({
    key: 'predio-d', kinds: ['predio', 'solar'], zones: ['residencial', 'periferia'], w: 22, d: 18, h: 15, facade: 'housing', roof: 'flat',
    walls: [wallBox(22, 14, 18)],
    roofGeometry: solidBox(22.6, 1, 18.6, 14),
    accent: null,
  });
  // Habitação: fita de sobrados e casas isoladas com telhado.
  add({
    key: 'sobrado', kinds: ['casa', 'villa'], zones: ['residencial', 'periferia'], w: 30, d: 14, h: 12.8, facade: 'housing', roof: 'gable',
    walls: [wallBox(30, 9.4, 14)],
    roofGeometry: mergeWalls([
      gableSolid(9.6, 15, 3.4, 9.4).translate(-10, 0, 0),
      gableSolid(9.6, 15, 3.4, 9.4),
      gableSolid(9.6, 15, 3.4, 9.4).translate(10, 0, 0),
    ]),
    accent: null,
  });
  add({
    key: 'geminada', kinds: ['casa', 'villa'], zones: ['periferia', 'residencial'], w: 32, d: 18, h: 7.8, facade: 'housing', roof: 'gable',
    walls: [wallBox(32, 6.4, 18)],
    roofGeometry: mergeWalls([
      gableSolid(10.6, 18.6, 1.4, 6.4).translate(-10.7, 0, 0),
      gableSolid(10.6, 18.6, 1.4, 6.4),
      gableSolid(10.6, 18.6, 1.4, 6.4).translate(10.7, 0, 0),
    ]),
    accent: null,
  });
  add({
    key: 'geminada-b', kinds: ['casa', 'villa'], zones: ['periferia', 'residencial'], w: 26, d: 20, h: 9.4, facade: 'housing', roof: 'gable',
    walls: [wallBox(26, 7.6, 20)],
    roofGeometry: mergeWalls([
      gableSolid(12.6, 20.6, 1.8, 7.6).translate(-6.6, 0, 0),
      gableSolid(12.6, 20.6, 1.8, 7.6).translate(6.6, 0, 0),
    ]),
    accent: null,
  });
  add({
    key: 'casa', kinds: ['casa', 'villa'], zones: ['residencial', 'periferia'], w: 15, d: 12, h: 8.8, facade: 'housing', roof: 'hip',
    walls: [wallBox(15, 5.6, 12)],
    roofGeometry: hipSolid(16.5, 13.5, 3.2, 5.6),
    accent: null,
  });
  add({
    key: 'villa', kinds: ['casa', 'villa'], zones: ['residencial', 'periferia'], w: 21, d: 16, h: 10.4, facade: 'housing', roof: 'hip',
    walls: [wallBox(21, 7, 16), wallBox(8, 3.2, 6, 0)],
    roofGeometry: hipSolid(22.5, 17.5, 3.4, 7),
    accent: null,
  });
  // Indústria e logística: naves baixas, longas e de silhuetas diferentes.
  add({
    key: 'galpao-a', kinds: ['galpao'], zones: ['industrial', 'periferia'], w: 50, d: 36, h: 13, facade: 'grid', roof: 'saw',
    walls: [wallBox(50, 10.4, 36)],
    roofGeometry: sawSolid(51, 37, 3.2, 10.4),
    accent: mergeWalls([
      solidBox(10, 2.6, 8, 10.4).translate(-12, 0, 0),
      solidBox(6, 1.8, 6, 10.4).translate(14, 0, 6),
    ]),
  });
  add({
    key: 'galpao-b', kinds: ['galpao'], zones: ['industrial', 'periferia'], w: 40, d: 30, h: 11.1, facade: 'grid', roof: 'flat',
    walls: [wallBox(40, 10, 30)],
    roofGeometry: solidBox(41, 1.1, 31, 10),
    accent: solidBox(9, 2.4, 7, 11.1).translate(-9, 0, 0),
  });
  add({
    key: 'fabrica', kinds: ['galpao'], zones: ['industrial'], w: 52, d: 34, h: 17, facade: 'grid', roof: 'saw',
    walls: [wallBox(52, 13, 34), wallBox(16, 4, 12, 13)],
    roofGeometry: sawSolid(53, 35, 3.4, 13),
    accent: solidBox(3.4, 30, 3.4, 0).translate(18, 0, -10),
  });
  // Marco urbano: torre esguia com anéis, referência de horizonte.
  add({
    key: 'marco', kinds: ['marco'], zones: ['centro'], w: 28, d: 28, h: 68, facade: 'ribbon', roof: 'crown',
    walls: [wallBox(28, 22, 28), wallBox(19, 30, 19, 22), wallBox(11, 12, 11, 52)],
    roofGeometry: solidBox(11.6, 1.2, 11.6, 64),
    accent: mergeWalls([solidBox(14, 1.1, 14, 30), solidBox(9, 1, 9, 43), solidBox(0.8, 16, 0.8, 65)]),
  });
  return models;
}

export const BUILDING_MODELS = buildModels();

/** Cor de fachada por zona, com variação controlada (nada de sorteio saturado). */
function facadeColor(building: CityBuilding, target: THREE.Color): THREE.Color {
  const palette = ZONE_FACADES[building.zone] ?? ZONE_FACADES.residencial;
  return target.setHex(palette[Math.floor(building.tone * palette.length) % palette.length]);
}

/** Grava a cor do edifício como atributo de vértice para mesclar geometrias. */
function paintGeometry(geometry: THREE.BufferGeometry, color: THREE.Color): void {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Dimensões finais do volume: a escala é limitada para o modelo não deformar. */
function buildingDimensions(building: CityBuilding, model: BuildingModel) {
  return {
    w: model.w * THREE.MathUtils.clamp(building.w / model.w, 0.76, 1.32),
    h: model.h * THREE.MathUtils.clamp(building.h / model.h, 0.74, 1.36),
    d: model.d * THREE.MathUtils.clamp(building.d / model.d, 0.76, 1.32),
  };
}

function roofColor(building: CityBuilding, target: THREE.Color): THREE.Color {
  const palette = ROOF_COLORS[building.roof];
  return target.setHex(palette[Math.floor(building.tone * palette.length) % palette.length]);
}

/** Escolhe o modelo cuja proporção e altura ficam mais próximas do lote. */
export function pickModel(building: CityBuilding): BuildingModel {
  const pool = BUILDING_MODELS.filter(
    (model) => model.kinds.includes(building.kind) && model.zones.includes(building.zone),
  );
  const candidates = pool.length
    ? pool
    : BUILDING_MODELS.filter((model) => model.kinds.includes(building.kind));
  let best = candidates[0] ?? BUILDING_MODELS[0];
  let bestScore = Number.POSITIVE_INFINITY;
  const buildingAspect = building.w / building.d;
  for (const model of candidates) {
    const score = Math.abs(Math.log(building.h / model.h)) * 1.3
      + Math.abs(Math.log(building.w / model.w)) * 0.4
      + Math.abs(Math.log(building.d / model.d)) * 0.4
      // Pegada com proporção parecida evita esticar o volume numa direção só.
      + Math.abs(Math.log(buildingAspect / (model.w / model.d))) * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = model;
    }
  }
  return best;
}


/** Monta uma geometria a partir de vértices e faces, recalculando normais. */
function faceGeometry(vertices: number[][], faces: number[][]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  for (const [x, y, z] of vertices) positions.push(x, y, z);
  for (const face of faces) {
    if (face.length === 3) indices.push(face[0], face[1], face[2]);
    else indices.push(face[0], face[1], face[2], face[0], face[2], face[3]);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Telhado de duas águas, cumeeira no eixo X, base em y=0. */
function gableGeometry(): THREE.BufferGeometry {
  const A = [-0.5, 0, -0.5];
  const B = [0.5, 0, -0.5];
  const C = [0.5, 0, 0.5];
  const D = [-0.5, 0, 0.5];
  const E = [-0.5, 1, 0];
  const F = [0.5, 1, 0];
  return faceGeometry(
    [A, B, C, D, E, F],
    [
      [0, 5, 1], [0, 4, 5], // água norte
      [2, 4, 3], [2, 5, 4], // água sul
      [3, 4, 0], // empena oeste
      [1, 5, 2], // empena leste
    ],
  );
}

/** Telhado de quatro águas (pirâmide de base quadrada), base em y=0. */
function hipGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  geometry.rotateY(Math.PI / 4);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/** Cobertura em shed: uma água inclinada, mais alta no lado -X. */
function sawGeometry(): THREE.BufferGeometry {
  const h = 1;
  const low = 0.2;
  const A = [-0.5, 0, -0.5];
  const B = [-0.5, 0, 0.5];
  const C = [0.5, 0, 0.5];
  const D = [0.5, 0, -0.5];
  const E = [-0.5, h, -0.5];
  const F = [-0.5, h, 0.5];
  const G = [0.5, low, 0.5];
  const H = [0.5, low, -0.5];
  return faceGeometry(
    [A, B, C, D, E, F, G, H],
    [
      [4, 5, 6], [4, 6, 7], // água
      [0, 1, 5], [0, 5, 4], // empena oeste
      [3, 6, 2], [3, 7, 6], // empena leste
      [0, 7, 3], [0, 4, 7], // lateral norte (-z)
      [1, 2, 6], [1, 6, 5], // lateral sul (+z)
    ],
  );
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose();
  });
}

/** Fundo discreto: névoa clara em cima, horizonte quente — a cidade é o assunto. */
function skyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#c3cbca');
    gradient.addColorStop(0.42, '#cfd3cc');
    gradient.addColorStop(0.62, '#dcd8ca');
    gradient.addColorStop(0.78, '#d6d3c6');
    gradient.addColorStop(1, '#c8c9bd');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 4, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Fachadas procedurais nítidas (sem grão): parede branca para o tom da instância
 * colorir, vãos de vidro azulado e uma linha de sombra sob a janela.
 * Um tile = 7,2 m × 3,6 m.
 */
function windowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 128, 64);
    for (let row = 0; row < 1; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const x = col * 64 + 14;
        const y = row * 64 + 12;
        context.fillStyle = '#8fa9b3';
        context.fillRect(x, y, 36, 32);
        context.fillStyle = 'rgba(255,255,255,0.55)';
        context.fillRect(x, y + 14, 36, 2);
        context.fillStyle = 'rgba(60,72,78,0.18)';
        context.fillRect(x, y + 32, 36, 3);
      }
    }
    context.fillStyle = 'rgba(120,118,110,0.14)';
    context.fillRect(0, 0, 128, 4);
    context.fillRect(0, 60, 128, 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Faixa de vidro contínua: torres com pele de cortina, luz uniforme. */
function ribbonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = '#8ba7b2';
    context.fillRect(0, 16, 64, 26);
    context.fillStyle = 'rgba(255,255,255,0.5)';
    context.fillRect(0, 29, 64, 2);
    context.fillStyle = 'rgba(255,255,255,0.32)';
    for (let col = 0; col < 4; col += 1) context.fillRect(col * 16 + 15, 16, 2, 26);
    context.fillStyle = 'rgba(110,108,100,0.16)';
    context.fillRect(0, 42, 64, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Habitação: janelas pequenas, peitoril e faixa de varanda. */
function housingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 128, 64);
    for (let col = 0; col < 4; col += 1) {
      const x = col * 32 + 8;
      context.fillStyle = '#93a9ad';
      context.fillRect(x, 14, 16, 20);
      context.fillStyle = 'rgba(255,255,255,0.7)';
      context.fillRect(x, 23, 16, 2);
      context.fillStyle = 'rgba(120,116,106,0.2)';
      context.fillRect(x - 2, 34, 20, 3);
    }
    context.fillStyle = 'rgba(130,126,116,0.16)';
    context.fillRect(0, 52, 128, 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

interface CityMaterials {
  facades: Record<FacadeKind, THREE.MeshStandardMaterial>;
  roof: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  coarse: THREE.MeshStandardMaterial;
  sidewalk: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  marking: THREE.MeshBasicMaterial;
  median: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  skirt: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  trunk: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
}

/**
 * Estágios da maquete da sede. A altura acompanha HQ_STAGES (em metros) e cada
 * estágio acrescenta corpos empilhados, coroa e detalhes de praça.
 */
interface HqMaquette {
  height: number;
  /** Fração do lote ocupada pelo embasamento. */
  base: number;
  /** Altura do embasamento como fração da altura total. */
  baseH: number;
  /** Corpos superiores: largura relativa e faixa vertical (0–1 da altura). */
  tiers: Array<{ width: number; from: number; to: number }>;
  crown: 'band' | 'ring' | 'spire';
  pad: boolean;
  flags: number;
  gardens: number;
}

const HQ_MAQUETTE: HqMaquette[] = [
  { height: 14, base: 0.62, baseH: 1, tiers: [], crown: 'band', pad: false, flags: 0, gardens: 2 },
  { height: 34, base: 0.72, baseH: 0.3, tiers: [{ width: 0.46, from: 0.26, to: 1 }], crown: 'band', pad: false, flags: 3, gardens: 4 },
  {
    height: 66, base: 0.76, baseH: 0.21,
    tiers: [{ width: 0.5, from: 0.18, to: 0.76 }, { width: 0.37, from: 0.73, to: 1 }],
    crown: 'ring', pad: true, flags: 3, gardens: 5,
  },
  {
    height: 98, base: 0.8, baseH: 0.17,
    tiers: [
      { width: 0.52, from: 0.14, to: 0.62 },
      { width: 0.42, from: 0.59, to: 0.86 },
      { width: 0.3, from: 0.83, to: 1 },
    ],
    crown: 'spire', pad: true, flags: 5, gardens: 6,
  },
];

export class CityScene {
  private container: HTMLElement;
  private callbacks: CitySceneCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private world = new THREE.Group();
  private cityGroup = new THREE.Group();
  private plotGroup = new THREE.Group();
  private interiorGroup = new THREE.Group();
  private hqGroup = new THREE.Group();
  private dollhouseGroup = new THREE.Group();
  private dollhouse: Dollhouse | null = null;
  private dollhouseFloor = 1;
  private dollhouseBase = 0;
  private sun: THREE.DirectionalLight;
  private fog = new THREE.Fog(0xcfd0c1, 2800, 11000);

  private target = new THREE.Vector3(0, 0, 0);
  private spherical = { radius: 3100, theta: -0.9, phi: 0.8 };
  private goal = { radius: 3100, theta: -0.9, phi: 0.8 };
  private lodTick = 0;

  private dragging = false;
  private panning = false;
  private moved = false;
  private last = { x: 0, y: 0 };
  private down = { x: 0, y: 0 };
  private pointerNdc = { x: 0, y: 0 };
  private hasPointer = false;
  private hovered: CityPlot | null = null;

  private plan: CityPlan | null = null;
  private mode: CityMode = 'overview';
  private hqPlot: CityPlot | null = null;
  private hqStage = 0;
  private hqTextures: THREE.Texture[] = [];
  private frame = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private windowMap = windowTexture();
  private materials: CityMaterials | null = null;
  private materialTextures: THREE.Texture[] = [];
  private buildingTextures: THREE.Texture[] = [];
  private chunks = new Map<string, {
    center: THREE.Vector3;
    buildings: CityBuilding[];
    coarse: THREE.InstancedMesh | null;
    detail: THREE.Group | null;
    detailed: boolean;
  }>();
  private clock = new THREE.Clock();
  private labLight = new THREE.PointLight(0xffe6b8, 0, 26, 2);

  constructor(container: HTMLElement, callbacks: CitySceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (error) {
      callbacks.onFail();
      throw error;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = 'city-canvas';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', 'Maquete tridimensional da cidade');
    container.appendChild(this.renderer.domElement);

    this.scene.fog = this.fog;
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.6, 16000);
    this.scene.background = skyTexture();
    this.scene.add(this.world);
    this.world.add(this.cityGroup, this.plotGroup, this.hqGroup, this.interiorGroup, this.dollhouseGroup);
    this.dollhouseGroup.visible = false;
    this.sun = this.buildLights();
    this.bind();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.loop();
  }

  private buildLights(): THREE.DirectionalLight {
    // Luz global equilibrada: céu claro, sol alto e suave, preenchimento frio do
    // lado oposto. Exposição única para fachadas claras sem estourar o branco.
    this.scene.add(new THREE.HemisphereLight(0xe4ecec, 0x9d9a86, 0.55));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const fill = new THREE.DirectionalLight(0xbcd2dd, 0.24);
    fill.position.set(1500, 900, -1200);
    this.scene.add(fill);
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
    sun.position.set(-820, 1500, 560);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const camera = sun.shadow.camera as THREE.OrthographicCamera;
    camera.left = -2300;
    camera.right = 2300;
    camera.top = 2300;
    camera.bottom = -2300;
    camera.near = 200;
    camera.far = 8000;
    camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.scene.add(this.labLight);
    return sun;
  }

  /** Materiais compartilhados por toda a cena — criados uma vez por plano. */
  private buildMaterials(): CityMaterials {
    const grid = windowTexture();
    const ribbon = ribbonTexture();
    const housing = housingTexture();
    this.materialTextures.push(grid, ribbon, housing);
    const facadeTexture = (kind: FacadeKind, texture: THREE.Texture) => new THREE.MeshStandardMaterial({
      map: texture,
      vertexColors: true,
      roughness: kind === 'ribbon' ? 0.55 : 0.86,
      metalness: kind === 'ribbon' ? 0.1 : 0.02,
    });
    return {
      facades: {
        grid: facadeTexture('grid', grid),
        ribbon: facadeTexture('ribbon', ribbon),
        housing: facadeTexture('housing', housing),
      },
      roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 }),
      accent: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.25 }),
      coarse: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
      sidewalk: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 }),
      asphalt: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }),
      marking: new THREE.MeshBasicMaterial({ vertexColors: true }),
      median: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 }),
      ground: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
      skirt: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
      water: new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.42, metalness: 0.04 }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x7d6b52, roughness: 0.95 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 }),
    };
  }

  setPlan(plan: CityPlan): void {
    this.plan = plan;
    this.buildCity(plan);
    this.resetView();
  }

  /** Altura de apoio: o ponto mais baixo do lote, para nada flutuar no declive. */
  private baseHeight(plan: CityPlan, building: CityBuilding): number {
    const cos = Math.cos(building.rot);
    const sin = Math.sin(building.rot);
    let min = Number.POSITIVE_INFINITY;
    for (const [u, v] of [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]] as Array<[number, number]>) {
      const x = building.x + u * building.w * 0.5 * cos - v * building.d * 0.5 * sin;
      const z = building.y + u * building.w * 0.5 * sin + v * building.d * 0.5 * cos;
      min = Math.min(min, sampleHeight(plan, x, z));
    }
    return min - 2.2 + 0.05;
  }

  private disposeMaterials(): void {
    const materials = this.materials;
    if (!materials) return;
    for (const material of Object.values(materials)) {
      if (material instanceof THREE.Material) material.dispose();
    }
    for (const facade of Object.values(materials.facades)) facade.dispose();
    for (const texture of this.materialTextures) texture.dispose();
    this.materialTextures = [];
    this.materials = null;
  }

  private buildCity(plan: CityPlan): void {
    disposeObject(this.cityGroup);
    this.cityGroup.clear();
    disposeObject(this.hqGroup);
    this.hqGroup.clear();
    this.clearDollhouse();
    this.chunks.clear();
    this.disposeMaterials();
    this.materials = this.buildMaterials();
    this.buildTerrain(plan, this.materials);
    this.buildWater(plan, this.materials);
    this.buildRoads(plan, this.materials);
    this.buildBuildings(plan, this.materials);
    this.buildTrees(plan, this.materials);
    this.buildPlots(plan);
  }

  // ── Terreno ──────────────────────────────────────────────────────────────
  private buildTerrain(plan: CityPlan, materials: CityMaterials): void {
    const segments = 190;
    const geometry = new THREE.PlaneGeometry(plan.size, plan.size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    const half = plan.size / 2;
    const groundLow = new THREE.Color(COLORS.ground);
    const groundHigh = new THREE.Color(COLORS.groundHigh);
    const edge = new THREE.Color(COLORS.groundEdge);
    const park = new THREE.Color(COLORS.park);
    const parkDeep = new THREE.Color(COLORS.parkDeep);
    const sand = new THREE.Color(COLORS.sand);
    const tint = new THREE.Color();
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const height = sampleHeight(plan, x, z);
      position.setY(index, height - 2.2);
      const cellX = Math.max(0, Math.min(CITY_CELLS - 1, Math.floor((x + half) / plan.cell)));
      const cellY = Math.max(0, Math.min(CITY_CELLS - 1, Math.floor((z + half) / plan.cell)));
      const cell = cellY * CITY_CELLS + cellX;
      if (plan.water[cell]) {
        tint.copy(sand);
      } else if (plan.park[cell]) {
        const mix = 0.5 + 0.5 * Math.sin(x * 0.011) * Math.cos(z * 0.009);
        tint.copy(park).lerp(parkDeep, mix * 0.75);
      } else {
        const high = Math.min(1, Math.max(0, (height - 12) / 120));
        tint.copy(groundLow).lerp(groundHigh, high * 0.7);
        // Cinturão verde: o limite do recorte vira terreno natural, não uma borda.
        const rim = Math.max(Math.abs(x), Math.abs(z)) / half;
        if (rim > 0.78) tint.lerp(edge, Math.min(1, (rim - 0.78) / 0.2));
      }
      colors[index * 3] = tint.r;
      colors[index * 3 + 1] = tint.g;
      colors[index * 3 + 2] = tint.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const ground = new THREE.Mesh(geometry, materials.ground);
    ground.receiveShadow = true;
    this.cityGroup.add(ground);

    // Saia do bloco de maquete: o terreno tem espessura, não é uma folha solta.
    const positions: number[] = [];
    const skirtColors: number[] = [];
    const skirt = new THREE.Color(COLORS.skirting);
    const steps = 48;
    const pushSkirt = (ax: number, az: number, bx: number, bz: number) => {
      const ay = sampleHeight(plan, ax, az) - 2.2;
      const by = sampleHeight(plan, bx, bz) - 2.2;
      positions.push(ax, ay, az, bx, by, bz, bx, -26, bz, ax, -26, az);
      const top = 1;
      const bottom = 0.82;
      for (const shade of [top, top, bottom, bottom]) {
        skirtColors.push(skirt.r * shade, skirt.g * shade, skirt.b * shade);
      }
    };
    for (let step = 0; step < steps; step += 1) {
      const t0 = (step / steps) * plan.size - half;
      const t1 = ((step + 1) / steps) * plan.size - half;
      pushSkirt(t0, -half, t1, -half);
      pushSkirt(t1, half, t0, half);
      pushSkirt(-half, t1, -half, t0);
      pushSkirt(half, t0, half, t1);
    }
    const skirtGeometry = new THREE.BufferGeometry();
    skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    skirtGeometry.setAttribute('color', new THREE.Float32BufferAttribute(skirtColors, 3));
    // Converte a fita em triângulos (cada quadrilátero tem 4 vértices).
    const indices: number[] = [];
    for (let base = 0; base < positions.length / 3; base += 4) {
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    skirtGeometry.setIndex(indices);
    skirtGeometry.computeVertexNormals();
    this.cityGroup.add(new THREE.Mesh(skirtGeometry, materials.skirt));
  }

  private buildWater(plan: CityPlan, materials: CityMaterials): void {
    // Água discreta e uniforme, só dentro do recorte real da cidade.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(plan.size, plan.size),
      materials.water,
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.7;
    water.receiveShadow = false;
    this.cityGroup.add(water);
  }

  // ── Ruas: calçada, guia, asfalto, eixo e canteiro ─────────────────────────
  private buildRoads(plan: CityPlan, materials: CityMaterials): void {
    const pavementPos: number[] = [];
    const pavementCol: number[] = [];
    const markingPos: number[] = [];
    const markingCol: number[] = [];
    const medianPos: number[] = [];
    const medianCol: number[] = [];
    const walk = new THREE.Color(COLORS.sidewalk);
    const kerb = new THREE.Color(COLORS.kerb);
    const local = new THREE.Color(COLORS.asphalt);
    const avenue = new THREE.Color(COLORS.avenue);
    const marking = new THREE.Color(COLORS.marking);
    const median = new THREE.Color(COLORS.median);
    const tint = new THREE.Color();

    const quad = (
      target: number[], colors: number[],
      ax: number, az: number, bx: number, bz: number,
      half: number, lift: number, color: THREE.Color,
    ) => {
      const dx = bx - ax;
      const dz = bz - az;
      const length = Math.hypot(dx, dz) || 1;
      const nx = -dz / length;
      const nz = dx / length;
      const ay = sampleHeight(plan, ax, az) - 2.2 + lift;
      const by = sampleHeight(plan, bx, bz) - 2.2 + lift;
      target.push(
        ax + nx * half, ay, az + nz * half,
        ax - nx * half, ay, az - nz * half,
        bx + nx * half, by, bz + nz * half,
        bx - nx * half, by, bz - nz * half,
      );
      for (let index = 0; index < 4; index += 1) colors.push(color.r, color.g, color.b);
    };

    for (const road of plan.roads) {
      const wide = road.kind === 'arterial' || road.kind === 'anel';
      const halfWidth = road.width / 2;
      const walkWidth = wide ? 6.4 : 3.6;
      tint.copy(wide ? avenue : local);
      if (road.kind === 'anel') tint.offsetHSL(0, 0, -0.02);
      for (let index = 0; index < road.pts.length - 1; index += 1) {
        const [x1, z1] = road.pts[index];
        const [x2, z2] = road.pts[index + 1];
        // Calçada larga, guia clara e asfalto por cima: hierarquia sem contorno.
        quad(pavementPos, pavementCol, x1, z1, x2, z2, halfWidth + walkWidth, 0.14, walk);
        quad(pavementPos, pavementCol, x1, z1, x2, z2, halfWidth + 1.1, 0.32, kerb);
        quad(pavementPos, pavementCol, x1, z1, x2, z2, halfWidth, 0.44, tint);
        if (!wide) continue;
        const length = Math.hypot(x2 - x1, z2 - z1);
        const dashes = Math.max(1, Math.floor(length / 15));
        for (let dash = 0; dash < dashes; dash += 1) {
          const t0 = (dash + 0.18) / dashes;
          const t1 = (dash + 0.66) / dashes;
          quad(
            markingPos, markingCol,
            x1 + (x2 - x1) * t0, z1 + (z2 - z1) * t0,
            x1 + (x2 - x1) * t1, z1 + (z2 - z1) * t1,
            0.34, 0.5, marking,
          );
        }
        if (road.width >= 26) {
          quad(medianPos, medianCol, x1, z1, x2, z2, 2.2, 0.52, median);
        }
      }
    }

    const makeMesh = (
      positions: number[],
      colors: number[],
      material: THREE.Material,
      shadows: boolean,
    ) => {
      if (!positions.length) return null;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const indices: number[] = [];
      for (let base = 0; base < positions.length / 3; base += 4) {
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = shadows;
      mesh.castShadow = false;
      return mesh;
    };

    const pavement = makeMesh(pavementPos, pavementCol, materials.sidewalk, true);
    if (pavement) this.cityGroup.add(pavement);
    const marks = makeMesh(markingPos, markingCol, materials.marking, false);
    if (marks) this.cityGroup.add(marks);
    const medians = makeMesh(medianPos, medianCol, materials.median, true);
    if (medians) this.cityGroup.add(medians);
  }

  // ── Árvores ──────────────────────────────────────────────────────────────
  private buildTrees(plan: CityPlan, materials: CityMaterials): void {
    if (!plan.trees.length) return;
    const trunkGeometry = new THREE.CylinderGeometry(0.34, 0.5, 2.6, 5);
    trunkGeometry.translate(0, 1.3, 0);
    const leafGeometry = new THREE.IcosahedronGeometry(1, 0);
    leafGeometry.translate(0, 1, 0);
    const trunks = new THREE.InstancedMesh(trunkGeometry, materials.trunk, plan.trees.length);
    const leaves = new THREE.InstancedMesh(leafGeometry, materials.leaf, plan.trees.length);
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const palette = [0x7f9a6c, 0x8ba777, 0x73905f, 0x94ab7c];
    plan.trees.forEach((tree, index) => {
      const base = sampleHeight(plan, tree.x, tree.y) - 2.2 + 0.1;
      position.set(tree.x, base, tree.y);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (tree.x * 0.07 + tree.y * 0.11) % (Math.PI * 2));
      const crown = tree.s * 0.62;
      scale.set(crown, tree.s * 0.94, crown);
      matrix.compose(position, quaternion, scale);
      leaves.setMatrixAt(index, matrix);
      leaves.setColorAt(index, color.setHex(palette[Math.abs(Math.round(tree.x * 3 + tree.y * 5)) % palette.length]));
      scale.set(tree.s / 5, tree.s / 5, tree.s / 5);
      matrix.compose(position, quaternion, scale);
      trunks.setMatrixAt(index, matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    this.cityGroup.add(trunks, leaves);
  }

  // ── Lotes da sede ────────────────────────────────────────────────────────
  private buildPlots(plan: CityPlan): void {
    disposeObject(this.plotGroup);
    this.plotGroup.clear();
    for (const plot of plan.plots) {
      const radius = Math.max(20, plot.w * 0.6);
      const base = sampleHeight(plan, plot.x, plot.y) - 2.2;
      const discMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.hq,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 36), discMaterial);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(plot.x, base + 0.9, plot.y);
      disc.userData = { plotId: plot.id, role: 'disc' };
      this.plotGroup.add(disc);

      const ringMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.hq,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius, 40), ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(plot.x, base + 1.0, plot.y);
      ring.userData = { plotId: plot.id, role: 'ring' };
      this.plotGroup.add(ring);

      // Alfinete discreto: o lote tem de ser achado na visão geral sem poluir.
      const pinMaterial = new THREE.MeshBasicMaterial({ color: 0xf2d699, transparent: true, opacity: 0.9 });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 26, 5), pinMaterial);
      stem.position.set(plot.x, base + 14, plot.y);
      stem.userData = { plotId: plot.id, role: 'pin' };
      const head = new THREE.Mesh(new THREE.ConeGeometry(5.2, 14, 10), pinMaterial);
      head.rotation.x = Math.PI;
      head.position.set(plot.x, base + 34, plot.y);
      head.userData = { plotId: plot.id, role: 'pin' };
      this.plotGroup.add(stem, head);
    }
    this.plotGroup.visible = false;
  }

  // ── Edificações ──────────────────────────────────────────────────────────
  private facadeTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
    const texture = this.windowMap.clone() as THREE.CanvasTexture;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    this.buildingTextures.push(texture);
    return texture;
  }

  /**
   * Cidade em blocos de 850 m. Cada bloco tem uma versão grosseira (uma caixa
   * instanciada) e uma versão detalhada, montada sob demanda com os modelos
   * reutilizáveis. Longe, a cidade é um volume; perto, ganha fachada, telhado e
   * coroamento — sem criar nem destruir milhares de objetos por quadro.
   */
  private buildBuildings(plan: CityPlan, materials: CityMaterials): void {
    const chunkSize = plan.size / 8;
    const half = plan.size / 2;
    const coarseGeometry = new THREE.BoxGeometry(1, 1, 1);
    coarseGeometry.translate(0, 0.5, 0);
    coarseGeometry.deleteAttribute('uv');
    const count = coarseGeometry.getAttribute('position').count;
    const tint = new Float32Array(count * 3);
    const normal = coarseGeometry.getAttribute('normal');
    for (let index = 0; index < count; index += 1) {
      // Topo mais escuro que as paredes: a caixa distante já tem telhado.
      const shade = normal.getY(index) > 0.5 ? 0.82 : 1;
      tint[index * 3] = shade;
      tint[index * 3 + 1] = shade;
      tint[index * 3 + 2] = shade;
    }
    coarseGeometry.setAttribute('color', new THREE.BufferAttribute(tint, 3));

    const buckets = new Map<string, CityBuilding[]>();
    for (const building of plan.buildings) {
      const ci = Math.floor((building.x + half) / chunkSize);
      const cj = Math.floor((building.y + half) / chunkSize);
      const key = `${ci}:${cj}`;
      const list = buckets.get(key);
      if (list) list.push(building);
      else buckets.set(key, [building]);
    }

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();

    for (const [key, list] of buckets) {
      const [ci, cj] = key.split(':').map(Number);
      const center = new THREE.Vector3(
        -half + (ci + 0.5) * chunkSize,
        0,
        -half + (cj + 0.5) * chunkSize,
      );
      const coarse = new THREE.InstancedMesh(coarseGeometry, materials.coarse, list.length);
      coarse.castShadow = true;
      coarse.receiveShadow = true;
      list.forEach((building, index) => {
        const base = this.baseHeight(plan, building);
        // A caixa distante usa as mesmas dimensões finais do modelo: trocar de
        // LOD não muda a silhueta, só o nível de detalhe.
        const model = pickModel(building);
        const dims = buildingDimensions(building, model);
        quaternion.setFromAxisAngle(up, -building.rot);
        position.set(building.x, base, building.y);
        scale.set(dims.w, dims.h, dims.d);
        matrix.compose(position, quaternion, scale);
        coarse.setMatrixAt(index, matrix);
        coarse.setColorAt(index, facadeColor(building, color));
      });
      coarse.instanceMatrix.needsUpdate = true;
      if (coarse.instanceColor) coarse.instanceColor.needsUpdate = true;
      this.cityGroup.add(coarse);
      this.chunks.set(key, { center, buildings: list, coarse, detail: null, detailed: false });
    }
  }

  /**
   * Monta (uma vez) o bloco detalhado: uma geometria mesclada por tipo de
   * fachada + uma para coberturas + uma para coroamentos. Três draw calls por
   * bloco, sem instâncias invisíveis.
   */
  private ensureDetail(key: string): void {
    const chunk = this.chunks.get(key);
    const plan = this.plan;
    const materials = this.materials;
    if (!chunk || chunk.detail || !plan || !materials) return;
    const group = new THREE.Group();
    const wallsByFacade = new Map<FacadeKind, THREE.BufferGeometry[]>();
    const roofs: THREE.BufferGeometry[] = [];
    const accents: THREE.BufferGeometry[] = [];
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();

    for (const building of chunk.buildings) {
      const model = pickModel(building);
      const base = this.baseHeight(plan, building);
      quaternion.setFromAxisAngle(up, -building.rot);
      position.set(building.x, base, building.y);
      scale.set(
        THREE.MathUtils.clamp(building.w / model.w, 0.7, 1.36),
        THREE.MathUtils.clamp(building.h / model.h, 0.7, 1.4),
        THREE.MathUtils.clamp(building.d / model.d, 0.7, 1.36),
      );
      matrix.compose(position, quaternion, scale);

      const walls = model.walls.clone().applyMatrix4(matrix);
      paintGeometry(walls, facadeColor(building, color));
      const list = wallsByFacade.get(model.facade);
      if (list) list.push(walls);
      else wallsByFacade.set(model.facade, [walls]);

      const roof = model.roofGeometry.clone().applyMatrix4(matrix);
      paintGeometry(roof, roofColor(building, color));
      roofs.push(roof);

      if (model.accent) {
        const accent = model.accent.clone().applyMatrix4(matrix);
        paintGeometry(accent, color.setHex(0x9aa0a0));
        accents.push(accent);
      }
    }

    const addMerged = (parts: THREE.BufferGeometry[], material: THREE.Material) => {
      if (!parts.length) return;
      const merged = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    for (const [facade, parts] of wallsByFacade) addMerged(parts, materials.facades[facade]);
    addMerged(roofs, materials.roof);
    addMerged(accents, materials.accent);

    group.visible = false;
    chunk.detail = group;
    chunk.detailed = true;
    this.cityGroup.add(group);
  }

  /**
   * LOD em função do zoom: no plano geral a cidade é massa (caixas com sombra);
   * ao aproximar, os blocos centrais trocam para os modelos detalhados, em
   * ordem de distância ao alvo da câmera e com um teto fixo de blocos.
   */
  private updateLod(): void {
    const radius = this.spherical.radius;
    const detailRadius = Math.max(760, radius * 0.52);
    const wanted: Array<{ key: string; distance: number }> = [];
    for (const [key, chunk] of this.chunks) {
      const distance = Math.hypot(chunk.center.x - this.target.x, chunk.center.z - this.target.z);
      if (distance < detailRadius) wanted.push({ key, distance });
    }
    wanted.sort((a, b) => a.distance - b.distance);
    const keep = new Set(wanted.slice(0, 26).map((entry) => entry.key));
    // Constrói no máximo dois blocos por avaliação: o zoom nunca engasga.
    let budget = 2;
    for (const [key, chunk] of this.chunks) {
      const detailed = keep.has(key);
      if (detailed && !chunk.detailed && budget > 0) {
        this.ensureDetail(key);
        budget -= 1;
      }
      const ready = chunk.detailed;
      if (chunk.detail) chunk.detail.visible = detailed && ready;
      if (chunk.coarse) chunk.coarse.visible = !(detailed && ready);
    }
  }

  /** Maquete da sede: começa como escritório compacto e cresce por estágios. */
  setHq(plot: CityPlot, stage = 0): void {
    this.hqPlot = plot;
    this.hqStage = Math.max(0, Math.min(HQ_MAQUETTE.length - 1, Math.round(stage)));
    disposeObject(this.hqGroup);
    this.hqGroup.clear();
    for (const texture of this.hqTextures) texture.dispose();
    this.hqTextures = [];
    this.hqGroup.position.set(0, 0, 0);
    const plan = this.plan;
    if (!plan) return;

    const base = sampleHeight(plan, plot.x, plot.y) - 2.2 + 0.5;
    const spec = HQ_MAQUETTE[this.hqStage];
    const height = spec.height;
    const rot = -plot.rot;
    const ground = (color: number, roughness: number) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
    const gold = new THREE.MeshStandardMaterial({ color: COLORS.hq, roughness: 0.44, metalness: 0.5 });
    const add = (mesh: THREE.Mesh): THREE.Mesh => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.hqGroup.add(mesh);
      return mesh;
    };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, yaw = rot) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      return add(mesh);
    };
    const facade = (w: number, h: number, color: number, rough: number, metal: number) => {
      // Metros por tile (7,2 × 3,6 m): janelas da sede na mesma escala da cidade.
      const texture = this.facadeTexture(Math.max(1, Math.round(w / TILE_W)), Math.max(1, Math.round(h / TILE_H)));
      this.hqTextures.push(texture);
      return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, map: texture });
    };

    // ── Praça, terraço e anel dourado ──────────────────────────────────────
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(plot.w * 0.98, plot.w * 0.98, 0.8, 44), ground(0x8f8a7c, 0.96));
    plaza.position.set(plot.x, base + 0.1, plot.y);
    plaza.receiveShadow = true;
    this.hqGroup.add(plaza);
    const terrace = new THREE.Mesh(new THREE.CylinderGeometry(plot.w * 0.73, plot.w * 0.73, 0.44, 44), ground(0xb3ac9b, 0.9));
    terrace.position.set(plot.x, base + 0.56, plot.y);
    terrace.receiveShadow = true;
    this.hqGroup.add(terrace);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(plot.w * 0.73, 0.3, 6, 48), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(plot.x, base + 0.8, plot.y);
    this.hqGroup.add(ring);

    const baseW = plot.w * spec.base;
    const baseD = plot.d * spec.base;
    const baseH = height * spec.baseH;
    const groundY = base + 0.78;

    // ── Embasamento ───────────────────────────────────────────────────────
    const plinth = box(baseW * 1.04, 1.5, baseD * 1.04, plot.x, groundY + 0.75, plot.y, ground(0x6f6a5e, 0.9));
    plinth.receiveShadow = true;
    box(baseW, baseH, baseD, plot.x, groundY + baseH / 2, plot.y, facade(baseW, baseH, 0xdcd5c4, 0.6, 0.12));

    // ── Corpos superiores ─────────────────────────────────────────────────
    let topY = groundY + baseH;
    let topW = baseW;
    let topD = baseD;
    for (const tier of spec.tiers) {
      const tierH = height * (tier.to - tier.from);
      const tierW = plot.w * tier.width;
      const tierD = plot.d * tier.width;
      const y = groundY + height * tier.from + tierH / 2;
      box(tierW, tierH, tierD, plot.x, y, plot.y, facade(tierW, tierH, 0x9dc0cb, 0.16, 0.55));
      // Laje de transição: dá ritmo vertical e separa os corpos.
      box(tierW * 1.05, 0.9, tierD * 1.05, plot.x, y - tierH / 2 + 0.45, plot.y, ground(0xcbc4b2, 0.72));
      topY = y + tierH / 2;
      topW = tierW;
      topD = tierD;
    }

    // ── Coroa ─────────────────────────────────────────────────────────────
    if (spec.crown === 'band' || spec.crown === 'spire') {
      box(topW * 1.06, 1.7, topD * 1.06, plot.x, topY + 0.85, plot.y, gold);
    }
    if (spec.crown === 'ring') {
      const crownRing = new THREE.Mesh(new THREE.TorusGeometry(topW * 0.52, 0.75, 8, 40), gold);
      crownRing.rotation.x = Math.PI / 2;
      crownRing.position.set(plot.x, topY + 1.2, plot.y);
      this.hqGroup.add(crownRing);
      box(topW * 0.9, 2.2, topD * 0.9, plot.x, topY + 1.1, plot.y, gold);
      topY += 1.6;
    }
    if (spec.crown === 'spire') {
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, topW * 0.16, height * 0.12, 8), gold);
      spire.position.set(plot.x, topY + height * 0.06, plot.y);
      this.hqGroup.add(spire);
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffcf7a, emissiveIntensity: 2.2 }),
      );
      beacon.position.set(plot.x, topY + height * 0.125, plot.y);
      this.hqGroup.add(beacon);
      topY += height * 0.1;
    }

    // ── Heliponto ─────────────────────────────────────────────────────────
    // Na torre ele fica no terraço; na matriz, o mastro ocupa o topo e o
    // heliponto desce para a praça, como em um campus corporativo.
    if (spec.pad) {
      const onPlaza = spec.crown === 'spire';
      const padRadius = onPlaza ? Math.min(5.4, plot.w * 0.13) : Math.min(topW * 0.3, 9);
      const padX = onPlaza ? plot.x + Math.cos(-2.2) * plot.w * 0.7 : plot.x;
      const padZ = onPlaza ? plot.y + Math.sin(-2.2) * plot.w * 0.7 : plot.y;
      const padY = onPlaza ? groundY + 0.6 : topY + 0.35;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(padRadius, padRadius, onPlaza ? 1 : 0.7, 28), ground(0x2f3436, 0.95));
      pad.position.set(padX, padY, padZ);
      pad.receiveShadow = true;
      this.hqGroup.add(pad);
      const mark = new THREE.Mesh(new THREE.TorusGeometry(padRadius * 0.7, 0.28, 4, 32), ground(0xe6dcc0, 0.8));
      mark.rotation.x = Math.PI / 2;
      mark.position.set(padX, padY + (onPlaza ? 0.56 : 0.39), padZ);
      this.hqGroup.add(mark);
      if (!onPlaza) topY += 0.4;
    }

    // ── Entrada: porta de vidro, toldo e faixa iluminada ──────────────────
    const front = baseD / 2;
    const doorX = plot.x + Math.sin(rot) * front;
    const doorZ = plot.y + Math.cos(rot) * front;
    box(baseW * 0.34, 4.4, 0.6, doorX, groundY + 2.2, doorZ, new THREE.MeshStandardMaterial({ color: 0x2b3c40, roughness: 0.12, metalness: 0.6 }));
    box(baseW * 0.52, 0.34, 3.2, doorX + Math.sin(rot) * 1.5, groundY + 4.7, doorZ + Math.cos(rot) * 1.5, ground(0x55524a, 0.8));
    box(
      baseW * 0.42, 0.26, 0.5,
      plot.x + Math.sin(rot) * (front + 0.05), groundY + 3.1, plot.y + Math.cos(rot) * (front + 0.05),
      new THREE.MeshStandardMaterial({ color: 0xffe6b8, emissive: 0xffc978, emissiveIntensity: 1.5 }),
    );

    // ── Praça viva: canteiros, postes e bandeiras ─────────────────────────
    for (let index = 0; index < spec.gardens; index += 1) {
      const angle = (index / Math.max(1, spec.gardens)) * Math.PI * 2 + 0.4;
      const radius = plot.w * 0.86;
      const gx = plot.x + Math.cos(angle) * radius;
      const gz = plot.y + Math.sin(angle) * radius;
      box(4.6, 0.9, 4.6, gx, groundY + 0.45, gz, ground(0x7d7768, 0.95), angle);
      box(4.1, 0.5, 4.1, gx, groundY + 0.95, gz, ground(0x3f7046, 0.9), angle);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), ground(0x4a8253, 0.85));
      bush.position.set(gx, groundY + 1.9, gz);
      bush.castShadow = true;
      this.hqGroup.add(bush);
    }

    const lamps = 8;
    for (let index = 0; index < lamps; index += 1) {
      const angle = (index / lamps) * Math.PI * 2;
      const radius = plot.w * 0.9;
      const lx = plot.x + Math.cos(angle) * radius;
      const lz = plot.y + Math.sin(angle) * radius;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 4.6, 6), ground(0x39413f, 0.7));
      pole.position.set(lx, groundY + 2.3, lz);
      pole.castShadow = true;
      this.hqGroup.add(pole);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffd08a, emissiveIntensity: 1.8 }),
      );
      bulb.position.set(lx, groundY + 4.75, lz);
      this.hqGroup.add(bulb);
    }

    for (let index = 0; index < spec.flags; index += 1) {
      const angle = Math.PI * 0.5 + (index - (spec.flags - 1) / 2) * 0.22;
      const radius = plot.w * 0.6;
      const fx = plot.x + Math.cos(angle) * radius;
      const fz = plot.y + Math.sin(angle) * radius;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 8.4, 5), ground(0x9aa3a0, 0.45));
      pole.position.set(fx, groundY + 4.2, fz);
      this.hqGroup.add(pole);
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 1.5),
        new THREE.MeshStandardMaterial({ color: index % 2 === 0 ? COLORS.hq : 0x2fb39a, roughness: 0.8, side: THREE.DoubleSide }),
      );
      flag.position.set(fx + 1.3, groundY + 7.5, fz);
      this.hqGroup.add(flag);
    }

    this.buildInterior(plot, base + Math.max(8.4, height - 4.2));

    // Corte "casa de bonecas" da sede, quatro pisos mobiliados.
    this.clearDollhouse();
    // Planta fixa e plausível: os lotes têm 34–52 m, e um piso desse tamanho
    // deixaria o mobiliário perdido. A sede ocupa ~22 × 18 m dentro do lote.
    const width = 16;
    const depth = 13;
    this.dollhouse = new Dollhouse(Math.round(width), Math.round(depth));
    this.dollhouse.group.position.set(plot.x, base + 0.15, plot.y);
    this.dollhouse.group.rotation.y = -plot.rot;
    this.dollhouseBase = base;
    this.dollhouse.setFloor(this.dollhouseFloor);
    this.dollhouseGroup.add(this.dollhouse.group);
    this.dollhouseGroup.visible = this.mode === 'building';

    this.plotGroup.visible = this.mode === 'select';
    if (this.mode === 'building') {
      this.frameDollhouse();
      this.goal.theta = -0.9;
    }
  }

  private clearDollhouse(): void {
    if (!this.dollhouse) return;
    this.dollhouseGroup.remove(this.dollhouse.group);
    this.dollhouse.dispose();
    this.dollhouse = null;
  }

  /** Quantos pisos do corte estão visíveis (1–4). O último é o piso em foco. */
  setFloor(level: number): void {
    this.dollhouseFloor = Math.max(1, Math.min(4, level));
    this.dollhouse?.setFloor(this.dollhouseFloor);
    if (this.mode === 'building' && this.hqPlot) this.frameDollhouse();
  }

  private frameDollhouse(): void {
    if (!this.hqPlot) return;
    const top = this.dollhouseFloor * FLOOR_HEIGHT;
    this.target.set(
      this.hqPlot.x,
      this.dollhouseBase + Math.max(1.6, top / 2 + 0.8),
      this.hqPlot.y,
    );
    const span = Math.max(this.dollhouse?.width ?? 24, this.dollhouse?.depth ?? 20);
    this.goal.radius = span * 1.05 + 8 + this.dollhouseFloor * 4;
    this.goal.phi = 0.94;
  }

  private buildInterior(plot: CityPlot, floorY: number): void {
    disposeObject(this.interiorGroup);
    this.interiorGroup.clear();
    const width = 22;
    const depth = 16;
    const wallHeight = 3.6;
    // O interior é orientado na mesma rotação do prédio.
    const group = new THREE.Group();
    group.position.set(plot.x, floorY, plot.y);
    group.rotation.y = -plot.rot;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: COLORS.interiorFloor, roughness: 0.72 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: 0x1d211e, roughness: 1 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight;
    group.add(ceiling);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: COLORS.interiorWall, roughness: 0.85 });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xa9c6cf,
      transparent: true,
      opacity: 0.16,
      roughness: 0.04,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    // Paredes com janelas: faixa baixa (peitoril) + faixa superior.
    const addWall = (length: number, x: number, z: number, rotationY: number, withWindow: boolean) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 1.0, 0.24), wallMaterial);
      wall.position.set(x, 0.5, z);
      wall.rotation.y = rotationY;
      wall.receiveShadow = true;
      group.add(wall);
      const header = new THREE.Mesh(new THREE.BoxGeometry(length, 0.55, 0.24), wallMaterial);
      header.position.set(x, wallHeight - 0.27, z);
      header.rotation.y = rotationY;
      group.add(header);
      if (withWindow) {
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(length, wallHeight - 1.55), glassMaterial);
        glass.position.set(x, 1.0 + (wallHeight - 1.55) / 2, z);
        glass.rotation.y = rotationY;
        group.add(glass);
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(length, 0.08, 0.08),
          new THREE.MeshStandardMaterial({ color: 0x24282a, metalness: 0.6, roughness: 0.4 }),
        );
        frame.position.set(x, 1.0, z);
        frame.rotation.y = rotationY;
        group.add(frame);
      }
    };
    addWall(width, 0, -depth / 2, 0, true);
    addWall(width, 0, depth / 2, 0, true);
    addWall(depth, -width / 2, 0, Math.PI / 2, true);
    addWall(depth, width / 2, 0, Math.PI / 2, false);

    // Mobiliário: mesa de comando, telas, cadeiras, estante, plantas.
    const wood = new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.5, metalness: 0.4 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(10, 0.16, 3.2), wood);
    desk.position.set(0, 1.02, -2.2);
    desk.castShadow = true;
    group.add(desk);
    for (const offset of [-4.4, 4.4]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 3.0), dark);
      leg.position.set(offset, 0.5, -2.2);
      group.add(leg);
    }
    for (let index = 0; index < 3; index += 1) {
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(3.1, 1.8),
        new THREE.MeshStandardMaterial({
          color: 0x0c1a1f,
          emissive: new THREE.Color(0x2fb39a),
          emissiveIntensity: 0.9,
          roughness: 0.4,
        }),
      );
      screen.position.set(-3.4 + index * 3.4, 1.95, -2.55);
      group.add(screen);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), dark);
      stand.position.set(-3.4 + index * 3.4, 1.35, -2.55);
      group.add(stand);
    }
    const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.16, 1.4), dark);
    chairSeat.position.set(0, 0.62, 0.2);
    group.add(chairSeat);
    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 0.16), dark);
    chairBack.position.set(0, 1.35, 0.9);
    group.add(chairBack);
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 9),
      new THREE.MeshStandardMaterial({ color: 0x2e3a36, roughness: 1 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.02, 1.4);
    group.add(rug);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.16, 24), wood);
    table.position.set(-6.4, 1.05, 3.4);
    group.add(table);
    for (let index = 0; index < 4; index += 1) {
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), dark);
      const angle = (index / 4) * Math.PI * 2;
      chair.position.set(-6.4 + Math.cos(angle) * 3.2, 0.45, 3.4 + Math.sin(angle) * 3.2);
      group.add(chair);
    }
    for (const [x, z] of [[-9.4, -5.4], [9.4, -5.4], [9.4, 5.6], [-9.4, 5.6]] as Array<[number, number]>) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.55, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x5b4a3a }));
      pot.position.set(x, 0.45, z);
      group.add(pot);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 7), new THREE.MeshLambertMaterial({ color: 0x356b45 }));
      leaves.position.set(x, 2.1, z);
      group.add(leaves);
    }
    this.interiorGroup.add(group);
    this.interiorGroup.visible = false;
  }

  /** Ajusta a área das sombras: rua inteira na visão geral, quarteirão no corte. */
  private configureShadow(halfSize: number): void {
    const camera = this.sun.shadow.camera as THREE.OrthographicCamera;
    if (Math.abs(camera.right - halfSize) < 0.5) return;
    camera.left = -halfSize;
    camera.right = halfSize;
    camera.top = halfSize;
    camera.bottom = -halfSize;
    camera.updateProjectionMatrix();
    // Viés proporcional: sombra colada no corte da sede e sem acne no plano geral.
    this.sun.shadow.normalBias = THREE.MathUtils.clamp(halfSize * 0.0008, 0.4, 1.8);
  }

  setMode(mode: CityMode): void {
    this.mode = mode;
    this.configureShadow(mode === 'building' ? 95 : mode === 'interior' ? 300 : 2300);
    this.plotGroup.visible = mode === 'select';
    this.interiorGroup.visible = mode === 'interior';
    // No interior a cidade continua visível: é por ela que se olha pelas janelas.
    // Na vista de corte a torre some para o corte ficar legível.
    this.hqGroup.visible = mode !== 'interior' && mode !== 'building';
    this.dollhouseGroup.visible = mode === 'building';
    this.labLight.intensity = mode === 'interior' ? 12 : 0;
    if (mode === 'select') {
      this.goal.radius = 3900;
      this.goal.phi = 0.8;
      this.target.set(0, 0, 0);
    } else if (mode === 'building' && this.hqPlot) {
      // Corte da sede: câmera de maquete no piso em foco.
      this.frameDollhouse();
      this.goal.theta = -0.9;
    } else if (mode === 'interior') {
      this.goal.radius = 1;
      this.goal.phi = Math.PI / 2;
      this.target.set(0, 0, 0);
    } else {
      this.target.set(0, 0, 0);
      this.goal.radius = 3100;
      this.goal.phi = 0.8;
    }
  }

  resetView(): void {
    if (this.mode === 'building' && this.hqPlot) {
      this.frameDollhouse();
      this.goal.theta = -0.9;
      return;
    }
    this.goal = { radius: 3100, theta: -0.9, phi: 0.8 };
    this.target.set(0, 0, 0);
  }

  zoomBy(factor: number): void {
    const min = this.mode === 'building' ? 26 : this.mode === 'interior' ? 1 : 110;
    const max = this.mode === 'building' ? 220 : this.mode === 'interior' ? 1 : 5400;
    this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * factor, min, max);
  }

  private bind(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('dblclick', this.onDoubleClick);
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.dragging = true;
    this.panning = event.button === 2 || event.shiftKey;
    this.moved = false;
    this.last = { x: event.clientX, y: event.clientY };
    this.down = { x: event.clientX, y: event.clientY };
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    };
    this.hasPointer = true;
    if (this.dragging) {
      const dx = event.clientX - this.last.x;
      const dy = event.clientY - this.last.y;
      if (Math.abs(event.clientX - this.down.x) + Math.abs(event.clientY - this.down.y) > 4) this.moved = true;
      if (this.mode === 'interior') {
        this.goal.theta = THREE.MathUtils.clamp(this.goal.theta + dx * 0.0035, -1.2, 1.2);
        this.goal.phi = THREE.MathUtils.clamp(this.goal.phi - dy * 0.0025, Math.PI / 2 - 0.5, Math.PI / 2 + 0.25);
      } else if (this.panning) {
        const scale = this.goal.radius * 0.0016;
        const panLimit = this.mode === 'building' ? 0 : 3000;
        this.target.x = THREE.MathUtils.clamp(this.target.x - dx * scale * Math.cos(this.goal.theta), -panLimit, panLimit);
        this.target.z = THREE.MathUtils.clamp(this.target.z + dy * scale, -panLimit, panLimit);
      } else {
        this.goal.theta -= dx * 0.0052;
        this.goal.phi = THREE.MathUtils.clamp(this.goal.phi + dy * 0.0042, 0.16, 1.45);
      }
      this.last = { x: event.clientX, y: event.clientY };
      return;
    }
    if (this.mode === 'select') this.updateHover(event.clientX, event.clientY, rect);
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.dragging = false;
    this.panning = false;
    this.renderer.domElement.releasePointerCapture?.(event.pointerId);
    if (this.moved || this.mode !== 'select') return;
    const plot = this.pickPlot(event.clientX, event.clientY);
    if (plot) this.callbacks.onPickPlot(plot);
  };

  private onPointerLeave = (): void => {
    this.dragging = false;
    this.hasPointer = false;
    this.hovered = null;
    this.callbacks.onHoverPlot(null, 0, 0);
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (this.mode === 'interior') return;
    const factor = Math.exp(event.deltaY * 0.0009);
    const min = this.mode === 'building' ? 26 : 90;
    const max = this.mode === 'building' ? 220 : 5400;
    this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * factor, min, max);
  };

  private onDoubleClick = (): void => {
    if (this.mode === 'building') this.callbacks.onEnterBuilding();
  };

  private updateHover(clientX: number, clientY: number, rect: DOMRect): void {
    if (!this.hasPointer) return;
    const plot = this.pickPlot(clientX, clientY);
    if (plot?.id === this.hovered?.id) {
      this.callbacks.onHoverPlot(plot, clientX - rect.left, clientY - rect.top);
      return;
    }
    this.hovered = plot;
    this.callbacks.onHoverPlot(plot, clientX - rect.left, clientY - rect.top);
    for (const child of this.plotGroup.children) {
      const mesh = child as THREE.Mesh;
      const material = mesh.material as THREE.MeshBasicMaterial;
      const data = mesh.userData as { plotId?: string; role?: string };
      const match = data.plotId === plot?.id;
      const base = data.role === 'disc' ? 0.2 : data.role === 'pin' ? 0.9 : 0.85;
      material.opacity = match ? Math.min(1, base + 0.35) : base;
      material.color.setHex(match ? 0xf8e7bf : data.role === 'pin' ? 0xf2d699 : COLORS.hq);
    }
  }

  private pickPlot(clientX: number, clientY: number): CityPlot | null {
    if (!this.plan) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.plotGroup.children, false);
    for (const hit of hits) {
      const id = (hit.object.userData as { plotId?: string }).plotId;
      const plot = this.plan.plots.find((candidate) => candidate.id === id);
      if (plot) return plot;
    }
    // Sem acerto direto: usa o lote mais próximo no plano do chão.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, point)) return null;
    let best: CityPlot | null = null;
    let bestDistance = 46;
    for (const plot of this.plan.plots) {
      const distance = Math.hypot(plot.x - point.x, plot.y - point.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = plot;
      }
    }
    return best;
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const ease = 0.12;
    this.spherical.radius += (this.goal.radius - this.spherical.radius) * ease;
    this.spherical.theta += (this.goal.theta - this.spherical.theta) * ease;
    this.spherical.phi += (this.goal.phi - this.spherical.phi) * ease;
    if (this.mode !== 'interior') {
      if (this.dollhouseGroup.visible && this.dollhouse) this.dollhouse.update(this.camera);
      // Segue o alvo com suavidade sem acumular deriva.
      this.world.position.x += (this.target.x * -1 - this.world.position.x) * 0.12;
      this.world.position.y += (this.target.y * -1 - this.world.position.y) * 0.12;
      this.world.position.z += (this.target.z * -1 - this.world.position.z) * 0.12;
      const { radius, theta, phi } = this.spherical;
      const sinPhi = Math.sin(phi);
      this.camera.position.set(
        Math.cos(theta) * sinPhi * radius,
        Math.cos(phi) * radius,
        Math.sin(theta) * sinPhi * radius,
      );
      this.camera.lookAt(0, 0, 0);
      // Sol e frustum de sombra seguem o ponto observado: sombras nítidas
      // tanto na cidade inteira quanto no corte da sede.
      const focus = this.mode === 'building' && this.hqPlot
        ? { x: this.hqPlot.x, z: this.hqPlot.y }
        : { x: this.target.x, z: this.target.z };
      this.sun.position.set(focus.x - 820, 1500, focus.z + 560);
      this.sun.target.position.set(focus.x, this.mode === 'building' ? this.dollhouseBase : 0, focus.z);
      this.sun.target.updateMatrixWorld();
    } else {
      // Interior: câmera na altura dos olhos, dentro da sala.
      const room = this.interiorGroup.children[0] as THREE.Group | undefined;
      if (room) {
        this.world.position.set(-room.position.x, -room.position.y, -room.position.z);
        const yaw = this.spherical.theta + room.rotation.y;
        const pitch = this.spherical.phi - Math.PI / 2;
        const eye = new THREE.Vector3(0, 1.68, 4.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        this.camera.position.copy(eye);
        const look = new THREE.Vector3(
          eye.x + Math.sin(yaw) * Math.cos(pitch) * 8,
          eye.y + Math.sin(pitch) * 6,
          eye.z + Math.cos(yaw) * Math.cos(pitch) * 8,
        );
        this.camera.lookAt(look);
        this.camera.fov = 62;
        this.camera.updateProjectionMatrix();
      }
    }
    if (this.mode !== 'interior') {
      const fov = this.mode === 'building' ? 50 : 46;
      if (this.camera.fov !== fov) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }
      // Névoa proporcional à distância da câmera: o miolo da cidade nunca lava.
      // No corte a névoa sai de cena: o entorno da maquete continua legível.
      this.scene.fog = this.mode === 'building' ? null : this.fog;
      this.fog.near = this.spherical.radius * 1.55;
      this.fog.far = this.spherical.radius * 3.6;
      // Reavalia o LOD a cada 6 quadros: barato e sem cintilação.
      if (this.lodTick++ % 6 === 0) this.updateLod();
    }
    this.labLight.position.set(0, 3.2, 0);
    const time = this.clock.getElapsedTime();
    if (this.hqPlot) {
      for (const child of this.hqGroup.children) {
        const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (material && material.emissive && material.color.getHex() === COLORS.hq) {
          material.emissive.setHex(0x2a1e08);
          material.emissiveIntensity = 0.4 + Math.sin(time * 1.6) * 0.12;
        }
      }
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('dblclick', this.onDoubleClick);
    this.clearDollhouse();
    for (const texture of this.buildingTextures) texture.dispose();
    for (const texture of this.hqTextures) texture.dispose();
    if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    this.scene.background = null;
    this.disposeMaterials();
    disposeObject(this.scene);
    this.windowMap.dispose();
    this.renderer.dispose();
    canvas.remove();
  }
}
