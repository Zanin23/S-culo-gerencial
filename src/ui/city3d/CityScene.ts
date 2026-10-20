import * as THREE from 'three';
import {
  CITY_CELLS,
  sampleHeight,
  type CityBuilding,
  type CityPlan,
  type CityPlot,
} from '../../game/cityPlan';

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

function buildingTone(tone: number): THREE.Color {
  const palette = [0xb9b3a6, 0xc9c1b0, 0xa89f90, 0x9aa4a2, 0xc4b8a2, 0x8f9794];
  return new THREE.Color(palette[Math.floor(tone * palette.length) % palette.length]);
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
  private sun: THREE.DirectionalLight;

  private target = new THREE.Vector3(0, 0, 0);
  private spherical = { radius: 2700, theta: -0.9, phi: 0.86 };
  private goal = { radius: 2700, theta: -0.9, phi: 0.86 };

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

    this.scene.fog = new THREE.Fog(0x14202a, 2900, 7600);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.6, 12000);
    this.scene.add(this.world);
    this.world.add(this.cityGroup, this.plotGroup, this.hqGroup, this.interiorGroup);
    this.sun = this.buildLights();
    this.bind();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.loop();
  }

  private buildLights(): THREE.DirectionalLight {
    this.scene.add(new THREE.HemisphereLight(0xcfd9e2, 0x121a18, 1.15));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.1);
    sun.position.set(-900, 1500, 700);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const camera = sun.shadow.camera as THREE.OrthographicCamera;
    camera.left = -1500;
    camera.right = 1500;
    camera.top = 1500;
    camera.bottom = -1500;
    camera.near = 200;
    camera.far = 5200;
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

    // ── Edificações ────────────────────────────────────────────────────────
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      map: this.windowMap,
      roughness: 0.78,
      metalness: 0.06,
      vertexColors: false,
    });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.9 });
    const buildings = plan.buildings;
    const body = new THREE.InstancedMesh(box, bodyMaterial, buildings.length);
    body.castShadow = true;
    body.receiveShadow = true;
    body.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const roof = new THREE.InstancedMesh(box, roofMaterial, buildings.length);
    roof.castShadow = false;
    roof.receiveShadow = false;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const positionVector = new THREE.Vector3();
    const color = new THREE.Color();
    buildings.forEach((building: CityBuilding, index: number) => {
      const base = sampleHeight(plan, building.x, building.y) - 2.2 + 0.4;
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -building.rot);
      positionVector.set(building.x, base, building.y);
      scale.set(building.w, building.h, building.d);
      matrix.compose(positionVector, quaternion, scale);
      body.setMatrixAt(index, matrix);
      color.copy(buildingTone(building.tone));
      if (building.kind === 'torre') color.lerp(new THREE.Color(COLORS.glass), 0.45);
      body.setColorAt(index, color);
      positionVector.set(building.x, base + building.h, building.y);
      scale.set(building.w * 1.04, 0.5, building.d * 1.04);
      matrix.compose(positionVector, quaternion, scale);
      roof.setMatrixAt(index, matrix);
    });
    body.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    roof.instanceMatrix.needsUpdate = true;
    this.cityGroup.add(body, roof);

    // ── Árvores ────────────────────────────────────────────────────────────
    if (plan.trees.length) {
      const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.7, 3, 5);
      trunkGeometry.translate(0, 1.5, 0);
      const crownGeometry = new THREE.ConeGeometry(3.4, 8, 7);
      crownGeometry.translate(0, 7, 0);
      const trunks = new THREE.InstancedMesh(trunkGeometry, new THREE.MeshLambertMaterial({ color: 0x4a3d2c }), plan.trees.length);
      const crowns = new THREE.InstancedMesh(crownGeometry, new THREE.MeshLambertMaterial({ color: 0x35663f }), plan.trees.length);
      crowns.castShadow = true;
      plan.trees.forEach((tree, index) => {
        const y = sampleHeight(plan, tree.x, tree.y) - 2.2 + 0.2;
        quaternion.identity();
        positionVector.set(tree.x, y, tree.y);
        scale.setScalar(tree.s / 4.4);
        matrix.compose(positionVector, quaternion, scale);
        trunks.setMatrixAt(index, matrix);
        scale.setScalar(tree.s / 3.6);
        matrix.compose(positionVector, quaternion, scale);
        crowns.setMatrixAt(index, matrix);
      });
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      this.cityGroup.add(trunks, crowns);
    }

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

  /** Constrói a sede no lote escolhido: torre corporativa com jardim e heliponto. */
  setHq(plot: CityPlot): void {
    this.hqPlot = plot;
    disposeObject(this.hqGroup);
    this.hqGroup.clear();
    this.hqGroup.position.set(0, 0, 0);
    const plan = this.plan;
    if (!plan) return;
    const base = sampleHeight(plan, plot.x, plot.y) - 2.2 + 0.5;
    const height = 92;
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(plot.w * 0.9, height, plot.d * 0.9),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.55, metalness: 0.18 }),
    );
    tower.position.set(plot.x, base + height / 2, plot.y);
    tower.castShadow = true;
    tower.receiveShadow = true;
    this.hqGroup.add(tower);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(plot.w * 0.92, height * 0.74, plot.d * 0.92),
      new THREE.MeshStandardMaterial({ color: 0x7fb3c2, roughness: 0.1, metalness: 0.65, transparent: true, opacity: 0.55 }),
    );
    glass.position.set(plot.x, base + height * 0.42, plot.y);
    this.hqGroup.add(glass);
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(plot.w * 0.5, plot.w * 0.52, 4, 24),
      new THREE.MeshStandardMaterial({ color: COLORS.hq, roughness: 0.4, metalness: 0.6 }),
    );
    crown.position.set(plot.x, base + height + 2, plot.y);
    this.hqGroup.add(crown);
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(11, 11, 1.2, 24),
      new THREE.MeshStandardMaterial({ color: 0x2f3436, roughness: 0.9 }),
    );
    pad.position.set(plot.x, base + height + 4.6, plot.y);
    this.hqGroup.add(pad);
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(plot.w * 0.95, plot.w * 0.95, 0.8, 32),
      new THREE.MeshStandardMaterial({ color: 0x8f8a7c, roughness: 0.95 }),
    );
    plaza.position.set(plot.x, base + 0.1, plot.y);
    this.hqGroup.add(plaza);

    this.buildInterior(plot, base + height - 4.2);
    this.plotGroup.visible = this.mode === 'select';
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

  setMode(mode: CityMode): void {
    this.mode = mode;
    this.plotGroup.visible = mode === 'select';
    this.interiorGroup.visible = mode === 'interior';
    // No interior a cidade continua visível: é por ela que se olha pelas janelas.
    // Apenas a torre da sede some para não bloquear a vista.
    this.hqGroup.visible = mode !== 'interior';
    this.labLight.intensity = mode === 'interior' ? 12 : 0;
    if (mode === 'select') {
      this.goal.radius = 2100;
      this.goal.phi = 0.72;
      this.target.set(0, 0, 0);
    } else if (mode === 'building' && this.hqPlot) {
      this.target.set(this.hqPlot.x, 45, this.hqPlot.y);
      this.goal.radius = 260;
      this.goal.phi = 1.16;
    } else if (mode === 'interior') {
      this.goal.radius = 1;
      this.goal.phi = Math.PI / 2;
      this.target.set(0, 0, 0);
    } else {
      this.target.set(0, 0, 0);
      this.goal.radius = 2700;
      this.goal.phi = 0.86;
    }
  }

  resetView(): void {
    this.goal = { radius: 2700, theta: -0.9, phi: 0.86 };
    this.target.set(0, 0, 0);
  }

  zoomBy(factor: number): void {
    this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * factor, this.mode === 'interior' ? 1 : 90, 5200);
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
        this.target.x = THREE.MathUtils.clamp(this.target.x - dx * scale * Math.cos(this.goal.theta), -2400, 2400);
        this.target.z = THREE.MathUtils.clamp(this.target.z + dy * scale, -2400, 2400);
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
    this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * factor, 90, 5200);
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
      this.sun.position.set(-900 + this.target.x * 0.2, 1500, 700 + this.target.z * 0.2);
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
      this.camera.fov = 46;
      this.camera.updateProjectionMatrix();
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
    disposeObject(this.scene);
    this.windowMap.dispose();
    this.renderer.dispose();
    canvas.remove();
  }
}
