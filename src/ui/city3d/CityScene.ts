import * as THREE from 'three';
import {
  CITY_CELLS,
  sampleHeight,
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

const COLORS = {
  land: 0x36443a,
  landHigh: 0x4a5443,
  park: 0x33573c,
  sand: 0x6b6553,
  water: 0x0d3340,
  road: 0x2b3033,
  roadEdge: 0x393f42,
  building: 0xb9b3a6,
  roof: 0x6f6a5f,
  glass: 0x7fa9b8,
  hq: 0xd8b46a,
  interiorFloor: 0x2a2b28,
  interiorWall: 0x3c3f3a,
  wood: 0x6d5136,
};

/** Paleta de fachadas por estilo: reboco, tijolo, betão, vidro, ardósia, metal, pedra. */
const FACADE_STYLES = [
  [0xd7d1c1, 0xcbc3b0, 0xe0dacb, 0xc2b8a2],
  [0xa65a41, 0x96503a, 0xb16b4c, 0x8e4936],
  [0xb6b8b3, 0xa8aaa5, 0xc2c4bf, 0x9b9d99],
  [0x86aebc, 0x7299a8, 0x95bcc9, 0x658c9b],
  [0x737f8c, 0x67737f, 0x7f8b98, 0x5c6874],
  [0xa7b0ae, 0x99a3a1, 0xb4bcba, 0x8d9795],
  [0xcabea4, 0xbfb299, 0xd4c9b2, 0xb2a58c],
];

const ROOF_COLORS: Record<RoofKind, number[]> = {
  gable: [0x8a5a44, 0x9c6a4e, 0x7a4e3b, 0x6d6a60],
  hip: [0x7e5744, 0x8d6550, 0x6f4c3c, 0x6a6257],
  flat: [0x6f6a5f, 0x7a776d, 0x625e55],
  saw: [0x8d939a, 0x7c838a, 0x9aa0a6],
  crown: [0x5f6c72, 0x6c7a80, 0x536066],
};

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

function styleColor(style: number, tone: number): THREE.Color {
  const palette = FACADE_STYLES[Math.abs(style) % FACADE_STYLES.length];
  const pick = palette[Math.floor(tone * palette.length) % palette.length];
  return new THREE.Color(pick);
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

/** Céu de fundo: gradiente vertical quente no horizonte, azul profundo no topo. */
function skyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#050c12');
    gradient.addColorStop(0.42, '#0c1921');
    gradient.addColorStop(0.6, '#192a2f');
    gradient.addColorStop(0.72, '#2c3c3b');
    gradient.addColorStop(0.84, '#1b2a28');
    gradient.addColorStop(1, '#0f1a18');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 4, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function windowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#e8e4d9';
    context.fillRect(0, 0, 64, 64);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const lit = (row * 4 + col) % 7 === 0;
        context.fillStyle = lit ? '#f3dfae' : '#5e7480';
        context.fillRect(col * 16 + 4, row * 16 + 4, 8, 9);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

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
  private fog = new THREE.Fog(0x1a2a30, 4600, 12000);

  private target = new THREE.Vector3(0, 0, 0);
  private spherical = { radius: 3450, theta: -0.9, phi: 0.78 };
  private goal = { radius: 3450, theta: -0.9, phi: 0.78 };

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
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = 'city-canvas';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', 'Maquete tridimensional da cidade');
    container.appendChild(this.renderer.domElement);

    this.scene.fog = this.fog;
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.6, 16000);
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
    // Luz de fim de tarde: sol quente rasante, céu frio e um recheio suave do
    // lado oposto para as fachadas não ficarem chapadas.
    this.scene.add(new THREE.HemisphereLight(0xd9e6ea, 0x1a2320, 0.96));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.17));
    const fill = new THREE.DirectionalLight(0x93bdd6, 0.52);
    fill.position.set(1300, 720, -980);
    this.scene.add(fill);
    const sun = new THREE.DirectionalLight(0xffeacb, 2.7);
    sun.position.set(-900, 1500, 700);
    sun.castShadow = true;
    sun.shadow.mapSize.set(3072, 3072);
    const camera = sun.shadow.camera as THREE.OrthographicCamera;
    camera.left = -2600;
    camera.right = 2600;
    camera.top = 2600;
    camera.bottom = -2600;
    camera.near = 200;
    camera.far = 11000;
    camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.scene.add(this.labLight);
    return sun;
  }

  setPlan(plan: CityPlan): void {
    this.plan = plan;
    this.buildCity(plan);
    this.resetView();
  }

  private buildCity(plan: CityPlan): void {
    disposeObject(this.cityGroup);
    this.cityGroup.clear();
    disposeObject(this.hqGroup);
    this.hqGroup.clear();
    this.clearDollhouse();
    const half = plan.size / 2;

    // ── Terreno ────────────────────────────────────────────────────────────
    const segments = 168;
    const geometry = new THREE.PlaneGeometry(plan.size, plan.size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    const land = new THREE.Color(COLORS.land);
    const high = new THREE.Color(COLORS.landHigh);
    const park = new THREE.Color(COLORS.park);
    const sand = new THREE.Color(COLORS.sand);
    const water = new THREE.Color(COLORS.water);
    const tint = new THREE.Color();
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const height = sampleHeight(plan, x, z);
      position.setY(index, height - 2.2);
      const cellX = Math.floor((x + half) / plan.cell);
      const cellY = Math.floor((z + half) / plan.cell);
      const cell = Math.max(0, Math.min(CITY_CELLS * CITY_CELLS - 1, cellY * CITY_CELLS + cellX));
      if (plan.water[cell]) {
        tint.copy(water);
      } else if (plan.park[cell]) {
        tint.copy(park);
      } else if (height < 4) {
        tint.copy(sand);
      } else {
        tint.copy(land).lerp(high, Math.min(1, height / 140));
      }
      colors[index * 3] = tint.r;
      colors[index * 3 + 1] = tint.g;
      colors[index * 3 + 2] = tint.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const ground = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    ground.receiveShadow = true;
    this.cityGroup.add(ground);

    // Água: plano único ligeiramente abaixo do nível do mar.
    const waterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(plan.size * 1.4, plan.size * 1.4),
      new THREE.MeshStandardMaterial({
        color: COLORS.water,
        roughness: 0.16,
        metalness: 0.35,
        transparent: true,
        opacity: 0.94,
      }),
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = 0.35;
    waterMesh.receiveShadow = false;
    this.cityGroup.add(waterMesh);

    // ── Ruas ───────────────────────────────────────────────────────────────
    const roadPositions: number[] = [];
    const roadIndices: number[] = [];
    let vertex = 0;
    for (const road of plan.roads) {
      const halfWidth = Math.max(3.2, road.width / 2);
      for (let index = 0; index < road.pts.length - 1; index += 1) {
        const [x1, z1] = road.pts[index];
        const [x2, z2] = road.pts[index + 1];
        const dx = x2 - x1;
        const dz = z2 - z1;
        const length = Math.hypot(dx, dz) || 1;
        const nx = (-dz / length) * halfWidth;
        const nz = (dx / length) * halfWidth;
        const y1 = sampleHeight(plan, x1, z1) - 2.2 + 0.5;
        const y2 = sampleHeight(plan, x2, z2) - 2.2 + 0.5;
        roadPositions.push(
          x1 + nx, y1, z1 + nz,
          x1 - nx, y1, z1 - nz,
          x2 + nx, y2, z2 + nz,
          x2 - nx, y2, z2 - nz,
        );
        roadIndices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
        vertex += 4;
      }
    }
    if (roadPositions.length) {
      const roadGeometry = new THREE.BufferGeometry();
      roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
      roadGeometry.setIndex(roadIndices);
      roadGeometry.computeVertexNormals();
      const roads = new THREE.Mesh(
        roadGeometry,
        new THREE.MeshLambertMaterial({ color: COLORS.road, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      );
      roads.receiveShadow = true;
      this.cityGroup.add(roads);
    }

    this.buildBuildings(plan);

    // ── Árvores ────────────────────────────────────────────────────────────
    if (plan.trees.length) {
      const treeMatrix = new THREE.Matrix4();
      const treeQuaternion = new THREE.Quaternion();
      const treePosition = new THREE.Vector3();
      const treeScale = new THREE.Vector3();
      const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.7, 3, 5);
      trunkGeometry.translate(0, 1.5, 0);
      const crownGeometry = new THREE.ConeGeometry(3.4, 8, 7);
      crownGeometry.translate(0, 7, 0);
      const trunks = new THREE.InstancedMesh(trunkGeometry, new THREE.MeshLambertMaterial({ color: 0x4a3d2c }), plan.trees.length);
      const crowns = new THREE.InstancedMesh(crownGeometry, new THREE.MeshLambertMaterial({ color: 0xffffff }), plan.trees.length);
      crowns.castShadow = true;
      const leafPalette = [0x35663f, 0x2e5a3a, 0x3f7247, 0x4a6b3a, 0x2a5240];
      plan.trees.forEach((tree, index) => {
        const y = sampleHeight(plan, tree.x, tree.y) - 2.2 + 0.2;
        treeQuaternion.identity();
        treePosition.set(tree.x, y, tree.y);
        treeScale.setScalar(tree.s / 4.4);
        treeMatrix.compose(treePosition, treeQuaternion, treeScale);
        trunks.setMatrixAt(index, treeMatrix);
        treeScale.setScalar(tree.s / 3.6);
        treeMatrix.compose(treePosition, treeQuaternion, treeScale);
        crowns.setMatrixAt(index, treeMatrix);
        const pick = Math.abs(Math.round(tree.x * 7 + tree.y * 13)) % leafPalette.length;
        crowns.setColorAt(index, tint.setHex(leafPalette[pick]));
      });
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      this.cityGroup.add(trunks, crowns);
    }

    this.buildStreetLamps(plan);

    // ── Praia / orla: faixa clara onde a terra encontra a água ─────────────
    if (plan.shore.length) {
      const beach: number[] = [];
      for (const run of plan.shore) {
        for (let index = 0; index < run.length - 1; index += 1) {
          const [x1, z1] = run[index];
          const [x2, z2] = run[index + 1];
          if (Math.hypot(x2 - x1, z2 - z1) > 380) continue;
          beach.push(x1, 1.0, z1, x2, 1.0, z2);
        }
      }
      if (beach.length) {
        const beachGeometry = new THREE.BufferGeometry();
        beachGeometry.setAttribute('position', new THREE.Float32BufferAttribute(beach, 3));
        this.cityGroup.add(new THREE.LineSegments(
          beachGeometry,
          new THREE.LineBasicMaterial({ color: 0xc9bd9a, transparent: true, opacity: 0.55 }),
        ));
      }
    }

    // ── Marcações dos lotes ────────────────────────────────────────────────
    disposeObject(this.plotGroup);
    this.plotGroup.clear();
    for (const plot of plan.plots) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(plot.w * 0.55, plot.w * 0.62, 28),
        new THREE.MeshBasicMaterial({ color: COLORS.hq, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(plot.x, sampleHeight(plan, plot.x, plot.y) - 2.2 + 0.9, plot.y);
      ring.userData = { plotId: plot.id };
      this.plotGroup.add(ring);
      const pin = new THREE.Mesh(
        new THREE.ConeGeometry(plot.w * 0.16, plot.w * 0.5, 8),
        new THREE.MeshBasicMaterial({ color: 0xf4d79a }),
      );
      pin.rotation.x = Math.PI;
      pin.position.set(plot.x, sampleHeight(plan, plot.x, plot.y) - 2.2 + plot.w * 0.5, plot.y);
      pin.userData = { plotId: plot.id };
      this.plotGroup.add(pin);
    }
    this.plotGroup.visible = false;
  }

  // ── Edificações ──────────────────────────────────────────────────────────
  private buildingTextures: THREE.Texture[] = [];

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

  /** Postes ao longo das avenidas: dão escala e vida à cidade vista de cima. */
  private buildStreetLamps(plan: CityPlan): void {
    const points: Array<{ x: number; z: number }> = [];
    const spacing = 96;
    for (const road of plan.roads) {
      if (road.kind === 'rua' || road.width < 11) continue;
      const offset = road.width * 0.62;
      for (let index = 0; index < road.pts.length - 1; index += 1) {
        const [x1, z1] = road.pts[index];
        const [x2, z2] = road.pts[index + 1];
        const dx = x2 - x1;
        const dz = z2 - z1;
        const length = Math.hypot(dx, dz);
        if (length < 8) continue;
        const nx = (-dz / length) * offset;
        const nz = (dx / length) * offset;
        const steps = Math.max(1, Math.round(length / spacing));
        for (let step = 0; step < steps; step += 1) {
          const t = (step + 0.5) / steps;
          const side = (index + step) % 2 === 0 ? 1 : -1;
          points.push({ x: x1 + dx * t + nx * side, z: z1 + dz * t + nz * side });
          if (points.length >= 620) break;
        }
        if (points.length >= 620) break;
      }
      if (points.length >= 620) break;
    }
    if (!points.length) return;
    const pole = new THREE.CylinderGeometry(0.14, 0.2, 6, 5);
    pole.translate(0, 3, 0);
    const bulb = new THREE.SphereGeometry(0.42, 7, 5);
    const poles = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: 0x424a48 }), points.length);
    const bulbs = new THREE.InstancedMesh(
      bulb,
      new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffcf8a, emissiveIntensity: 1.5 }),
      points.length,
    );
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    points.forEach((point, index) => {
      const y = sampleHeight(plan, point.x, point.z) - 2.2 + 0.4;
      position.set(point.x, y, point.z);
      matrix.compose(position, quaternion, scale);
      poles.setMatrixAt(index, matrix);
      position.set(point.x, y + 6.1, point.z);
      matrix.compose(position, quaternion, scale);
      bulbs.setMatrixAt(index, matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    this.cityGroup.add(poles, bulbs);
  }

  private buildBuildings(plan: CityPlan): void {
    for (const texture of this.buildingTextures) texture.dispose();
    this.buildingTextures = [];
    const buildings = plan.buildings;
    if (!buildings.length) return;

    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const color = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const setAt = (mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot: number) => {
      quaternion.setFromAxisAngle(up, -rot);
      position.set(x, y, z);
      scale.set(sx, sy, sz);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    };

    // Corpo: quatro faixas de altura, cada uma com janelas na escala certa.
    const bands = [
      { max: 4, repeat: [2, 1] as [number, number] },
      { max: 9, repeat: [2, 2] as [number, number] },
      { max: 19, repeat: [2, 4] as [number, number] },
      { max: Infinity, repeat: [3, 6] as [number, number] },
    ];
    const bandOf = (building: CityBuilding) => bands.findIndex((band) => building.floors <= band.max);
    const buckets = bands.map(() => [] as CityBuilding[]);
    for (const building of buildings) buckets[Math.max(0, bandOf(building))].push(building);

    bands.forEach((band, bandIndex) => {
      const list = buckets[bandIndex];
      if (!list.length) return;
      const bodyMaterial = new THREE.MeshStandardMaterial({
        map: this.facadeTexture(band.repeat[0], band.repeat[1]),
        roughness: 0.76,
        metalness: 0.08,
      });
      const body = new THREE.InstancedMesh(box, bodyMaterial, list.length);
      body.castShadow = true;
      body.receiveShadow = true;
      list.forEach((building, index) => {
        const base = sampleHeight(plan, building.x, building.y) - 2.2 + 0.3;
        setAt(body, index, building.x, base, building.y, building.w, building.h, building.d, building.rot);
        color.copy(styleColor(building.style, building.tone));
        if (building.style === 3) color.lerp(new THREE.Color(COLORS.glass), 0.35);
        body.setColorAt(index, color);
      });
      body.instanceMatrix.needsUpdate = true;
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      this.cityGroup.add(body);
    });

    // Coberturas por tipo — a silhueta passa a variar de verdade.
    const gable = gableGeometry();
    const hip = hipGeometry();
    const saw = sawGeometry();
    const slab = new THREE.BoxGeometry(1, 1, 1);
    slab.translate(0, 0.5, 0);
    const roofGroups: Array<{ kind: RoofKind; geometry: THREE.BufferGeometry; list: CityBuilding[]; y: number }> = [
      { kind: 'gable', geometry: gable, list: buildings.filter((b) => b.roof === 'gable'), y: 0 },
      { kind: 'hip', geometry: hip, list: buildings.filter((b) => b.roof === 'hip'), y: 0 },
      { kind: 'saw', geometry: saw, list: buildings.filter((b) => b.roof === 'saw'), y: 0 },
      { kind: 'flat', geometry: slab, list: buildings.filter((b) => b.roof === 'flat'), y: 0 },
      { kind: 'crown', geometry: slab, list: buildings.filter((b) => b.roof === 'crown'), y: 0 },
    ];
    for (const group of roofGroups) {
      if (!group.list.length) continue;
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.05 });
      const mesh = new THREE.InstancedMesh(group.geometry === slab ? slab : group.geometry, material, group.list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.list.forEach((building, index) => {
        const base = sampleHeight(plan, building.x, building.y) - 2.2 + 0.3;
        const y = base + building.h;
        if (building.roof === 'flat' || building.roof === 'crown') {
          setAt(mesh, index, building.x, y, building.y, building.w * 1.04, 0.62, building.d * 1.04, building.rot);
        } else if (building.roof === 'gable' || building.roof === 'hip') {
          setAt(mesh, index, building.x, y - 0.06, building.y, building.w, building.roofH, building.d, building.rot);
        } else {
          setAt(mesh, index, building.x, y - 0.06, building.y, building.w, building.roofH, building.d, building.rot);
        }
        const palette = ROOF_COLORS[building.roof];
        mesh.setColorAt(index, color.setHex(palette[Math.floor(building.tone * palette.length) % palette.length]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.cityGroup.add(mesh);
    }

    // Coroas, casas de máquinas e antenas das torres.
    const crowns = buildings.filter((building) => building.crown > 0);
    if (crowns.length) {
      const mesh = new THREE.InstancedMesh(slab, new THREE.MeshStandardMaterial({ color: 0x9aa4a2, roughness: 0.7, metalness: 0.15 }), crowns.length);
      crowns.forEach((building, index) => {
        const base = sampleHeight(plan, building.x, building.y) - 2.2 + 0.3;
        setAt(mesh, index, building.x, base + building.h, building.y, building.w * 0.46, Math.max(2.4, building.roofH * 1.6), building.d * 0.46, building.rot);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.cityGroup.add(mesh);
      const masts = crowns.filter((building) => building.crown >= 2);
      if (masts.length) {
        const mast = new THREE.CylinderGeometry(0.26, 0.4, 1, 5);
        mast.translate(0, 0.5, 0);
        const antennas = new THREE.InstancedMesh(mast, new THREE.MeshStandardMaterial({ color: 0x59646a, metalness: 0.6, roughness: 0.4 }), masts.length);
        masts.forEach((building, index) => {
          const base = sampleHeight(plan, building.x, building.y) - 2.2 + 0.3;
          setAt(antennas, index, building.x, base + building.h + Math.max(2.4, building.roofH * 1.6), building.y, 1, 8 + building.h * 0.08, 1, building.rot);
        });
        antennas.instanceMatrix.needsUpdate = true;
        this.cityGroup.add(antennas);
      }
    }

    // Toldos nas fachadas comerciais e vitrines no rés do chão.
    const awnings = buildings.filter((building) => (building.kind === 'casa' || building.kind === 'comercial' || building.kind === 'villa') && building.tone > 0.42);
    if (awnings.length) {
      const mesh = new THREE.InstancedMesh(slab, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), awnings.length);
      awnings.forEach((building, index) => {
        const base = sampleHeight(plan, building.x, building.y) - 2.2 + 0.3;
        const offset = building.d / 2 + 0.75;
        const dx = Math.sin(-building.rot) * offset;
        const dz = Math.cos(-building.rot) * offset;
        setAt(mesh, index, building.x + dx, base + 3.1, building.y + dz, building.w * 0.82, 0.16, 1.8, building.rot);
        const palette = [0xc0653f, 0x2f7d6c, 0xc9a24a, 0x7d4f57];
        mesh.setColorAt(index, color.setHex(palette[Math.floor(building.tone * 97) % palette.length]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.cityGroup.add(mesh);
    }

    const shopfronts = buildings.filter((building) => building.kind === 'comercial' || building.kind === 'solar' || building.kind === 'galpao');
    if (shopfronts.length) {
      const mesh = new THREE.InstancedMesh(slab, new THREE.MeshStandardMaterial({ color: 0x2a3d40, roughness: 0.25, metalness: 0.35 }), shopfronts.length);
      shopfronts.forEach((building, index) => {
        const base = sampleHeight(plan, building.x, building.y) - 2.2 + 0.3;
        setAt(mesh, index, building.x, base + 0.2, building.y, building.w * 1.015, 2.9, building.d * 1.015, building.rot);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.cityGroup.add(mesh);
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
    const gold = new THREE.MeshStandardMaterial({ color: COLORS.hq, roughness: 0.32, metalness: 0.72 });
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
      const texture = this.facadeTexture(Math.max(2, Math.round(w / 11)), Math.max(1, Math.round(h / 10)));
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
    if (spec.pad) {
      const padRadius = Math.min(topW * 0.3, 9);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(padRadius, padRadius, 0.7, 28), ground(0x2f3436, 0.95));
      pad.position.set(plot.x, topY + 0.35, plot.y);
      pad.receiveShadow = true;
      this.hqGroup.add(pad);
      const mark = new THREE.Mesh(new THREE.TorusGeometry(padRadius * 0.7, 0.28, 4, 32), ground(0xe6dcc0, 0.8));
      mark.rotation.x = Math.PI / 2;
      mark.position.set(plot.x, topY + 0.74, plot.y);
      this.hqGroup.add(mark);
      topY += 0.4;
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
  }

  setMode(mode: CityMode): void {
    this.mode = mode;
    this.configureShadow(mode === 'building' ? 95 : mode === 'interior' ? 300 : 2600);
    this.plotGroup.visible = mode === 'select';
    this.interiorGroup.visible = mode === 'interior';
    // No interior a cidade continua visível: é por ela que se olha pelas janelas.
    // Na vista de corte a torre some para o corte ficar legível.
    this.hqGroup.visible = mode !== 'interior' && mode !== 'building';
    this.dollhouseGroup.visible = mode === 'building';
    this.labLight.intensity = mode === 'interior' ? 12 : 0;
    if (mode === 'select') {
      this.goal.radius = 3000;
      this.goal.phi = 0.78;
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
      this.goal.radius = 3450;
      this.goal.phi = 0.78;
    }
  }

  resetView(): void {
    if (this.mode === 'building' && this.hqPlot) {
      this.frameDollhouse();
      this.goal.theta = -0.9;
      return;
    }
    this.goal = { radius: 3450, theta: -0.9, phi: 0.78 };
    this.target.set(0, 0, 0);
  }

  zoomBy(factor: number): void {
    const min = this.mode === 'building' ? 26 : this.mode === 'interior' ? 1 : 110;
    const max = this.mode === 'building' ? 220 : this.mode === 'interior' ? 1 : 6200;
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
    const factor = Math.exp(event.deltaY * 0.0011);
    const min = this.mode === 'building' ? 26 : 90;
    const max = this.mode === 'building' ? 220 : 6200;
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
      const match = (mesh.userData as { plotId?: string }).plotId === plot?.id;
      material.opacity = match ? 1 : 0.55;
      material.color.setHex(match ? 0xf6e2b4 : COLORS.hq);
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
      this.sun.position.set(focus.x - 780, 1500, focus.z + 620);
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
      const fov = this.mode === 'building' ? 52 : 58;
      if (this.camera.fov !== fov) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }
      // Névoa proporcional à distância da câmera: o miolo da cidade nunca lava.
      // No corte a névoa sai de cena: o entorno da maquete continua legível.
      this.scene.fog = this.mode === 'building' ? null : this.fog;
      this.fog.near = this.spherical.radius * 1.15;
      this.fog.far = this.spherical.radius * 3.1;
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
    disposeObject(this.scene);
    this.windowMap.dispose();
    this.renderer.dispose();
    canvas.remove();
  }
}
