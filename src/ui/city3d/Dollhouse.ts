import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Corte "casa de bonecas" da sede: quatro pisos empilhados com planta mobiliada,
// paredes voltadas para a câmera escondidas e cobertura removida. A leitura é a
// mesma de The Sims: você orbita e enxerga os ambientes por cima das paredes.
// ─────────────────────────────────────────────────────────────────────────────

export const FLOOR_HEIGHT = 3.15;
const WALL_HEIGHT = 2.95;
const PARTITION_HEIGHT = 1.55;
const SLAB = 0.28;

const COLORS = {
  slab: 0x8a8072,
  slabEdge: 0x4e473d,
  wall: 0xe6ddca,
  partition: 0xf0e9da,
  glass: 0xa8cad4,
  mullion: 0x39403f,
  wood: 0x8a6844,
  darkWood: 0x5d4930,
  dark: 0x2b3134,
  fabric: 0x357a6b,
  fabricWarm: 0x9a6a4f,
  rug: 0x3a4a43,
  gold: 0xd8b46a,
  plant: 0x3f7c4f,
  pot: 0x6b5943,
  screen: 0x123238,
  white: 0xe8e4d8,
};

const UNIT = new THREE.BoxGeometry(1, 1, 1);
UNIT.translate(0, 0.5, 0);

type MaterialCache = Map<string, THREE.MeshStandardMaterial>;

function material(cache: MaterialCache, color: number, options: { roughness?: number; metalness?: number; emissive?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}:${options.roughness ?? 0.8}:${options.metalness ?? 0}:${options.emissive ?? 0}:${options.transparent ?? false}:${options.opacity ?? 1}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const created = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.8,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissive ? 0.7 : 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.transparent ? THREE.DoubleSide : THREE.FrontSide,
  });
  cache.set(key, created);
  return created;
}

function block(
  parent: THREE.Object3D,
  cache: MaterialCache,
  size: [number, number, number],
  position: [number, number, number],
  color: number,
  rotation = 0,
  options?: { roughness?: number; metalness?: number; emissive?: number; transparent?: boolean; opacity?: number; shadow?: boolean },
): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT, material(cache, color, options));
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.y = rotation;
  if (options?.shadow !== false) {
    mesh.castShadow = size[0] > 0.6 && size[2] > 0.6;
    mesh.receiveShadow = true;
  }
  parent.add(mesh);
  return mesh;
}

function plant(parent: THREE.Object3D, cache: MaterialCache, x: number, z: number): void {
  block(parent, cache, [0.7, 0.65, 0.7], [x, 0, z], COLORS.pot, 0, { shadow: false });
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.15, 7), material(cache, COLORS.plant, { roughness: 0.9 }));
  leaves.position.set(x, 0.65 + 0.58, z);
  leaves.castShadow = true;
  parent.add(leaves);
}

function chair(parent: THREE.Object3D, cache: MaterialCache, x: number, z: number, rotation = 0): void {
  block(parent, cache, [0.6, 0.1, 0.6], [x, 0.42, z], COLORS.dark, rotation);
  block(parent, cache, [0.6, 0.62, 0.1], [x - Math.sin(rotation) * 0.26, 0.52, z - Math.cos(rotation) * 0.26], COLORS.dark, rotation);
  block(parent, cache, [0.08, 0.42, 0.08], [x, 0, z], COLORS.dark, rotation, { shadow: false });
}

function desk(parent: THREE.Object3D, cache: MaterialCache, x: number, z: number, rotation = 0, width = 2.0): void {
  block(parent, cache, [width, 0.1, 0.95], [x, 0.72, z], COLORS.wood, rotation);
  block(parent, cache, [0.1, 0.72, 0.9], [x - Math.cos(rotation) * (width / 2 - 0.12), 0, z + Math.sin(rotation) * (width / 2 - 0.12)], COLORS.dark, rotation, { shadow: false });
  block(parent, cache, [0.1, 0.72, 0.9], [x + Math.cos(rotation) * (width / 2 - 0.12), 0, z - Math.sin(rotation) * (width / 2 - 0.12)], COLORS.dark, rotation, { shadow: false });
  // Monitor virado para quem se senta do lado oposto.
  const monitor = block(parent, cache, [0.95, 0.6, 0.06], [x + Math.sin(rotation) * 0.24, 0.98, z + Math.cos(rotation) * 0.24], COLORS.screen, rotation, { emissive: 0x2fb39a });
  monitor.userData.screen = true;
  block(parent, cache, [0.16, 0.22, 0.16], [x + Math.sin(rotation) * 0.24, 0.82, z + Math.cos(rotation) * 0.24], COLORS.dark, rotation, { shadow: false });
  chair(parent, cache, x - Math.sin(rotation) * 0.95, z - Math.cos(rotation) * 0.95, rotation);
}

function sofa(parent: THREE.Object3D, cache: MaterialCache, x: number, z: number, rotation = 0, color = COLORS.fabric): void {
  block(parent, cache, [2.5, 0.42, 0.95], [x, 0.2, z], color, rotation);
  block(parent, cache, [2.5, 0.62, 0.24], [x - Math.sin(rotation) * 0.36, 0.58, z - Math.cos(rotation) * 0.36], color, rotation);
  block(parent, cache, [0.22, 0.5, 0.95], [x - Math.cos(rotation) * 1.14, 0.42, z + Math.sin(rotation) * 1.14], color, rotation);
  block(parent, cache, [0.22, 0.5, 0.95], [x + Math.cos(rotation) * 1.14, 0.42, z - Math.sin(rotation) * 1.14], color, rotation);
}

function rug(parent: THREE.Object3D, cache: MaterialCache, x: number, z: number, w: number, d: number, color = COLORS.rug, rotation = 0): void {
  block(parent, cache, [w, 0.04, d], [x, 0.02, z], color, rotation, { shadow: false, roughness: 1 });
}

function screenPanel(parent: THREE.Object3D, cache: MaterialCache, x: number, y: number, z: number, width: number, rotation = 0): void {
  block(parent, cache, [width, 1.15, 0.07], [x, y, z], COLORS.screen, rotation, { emissive: 0x2fb39a });
  block(parent, cache, [width + 0.1, 0.08, 0.1], [x, y + 1.15, z], COLORS.dark, rotation, { shadow: false });
}

export class Dollhouse {
  readonly group = new THREE.Group();
  private levels: THREE.Group[] = [];
  private walls: Array<{ object: THREE.Object3D; normalX: number; normalZ: number }> = [];
  private cache: MaterialCache = new Map();
  private spotlight: THREE.PointLight;
  private visibleFloor = 1;
  readonly width: number;
  readonly depth: number;
  readonly height: number;

  constructor(width: number, depth: number) {
    this.width = width;
    this.depth = depth;
    this.height = FLOOR_HEIGHT * 4;
    const w = width;
    const d = depth;
    this.group.name = 'dollhouse';

    for (let level = 0; level < 4; level += 1) {
      const floorGroup = new THREE.Group();
      floorGroup.name = `piso-${level + 1}`;
      floorGroup.position.y = level * FLOOR_HEIGHT;
      this.group.add(floorGroup);
      this.levels.push(floorGroup);

      // Laje, faixa de sombra e acabamento distinto por piso.
      block(floorGroup, this.cache, [w + 0.5, SLAB, d + 0.5], [0, -SLAB, 0], COLORS.slab, 0, { roughness: 0.9 });
      block(floorGroup, this.cache, [w + 0.56, 0.05, d + 0.56], [0, 0.0, 0], COLORS.slabEdge, 0, { shadow: false });
      const finish = [0xd8ccb0, 0xc7b28c, 0xb0aa9b, 0x86694c][level];
      block(floorGroup, this.cache, [w, 0.06, d], [0, 0.03, 0], finish, 0, { shadow: false, roughness: 1 });

      // Moldura de piso: leitura de "diorama" sem cobrir a vista.
      block(floorGroup, this.cache, [w + 0.2, 0.14, 0.2], [0, 0.02, d / 2 + 0.09], COLORS.slabEdge, 0, { shadow: false });
      block(floorGroup, this.cache, [w + 0.2, 0.14, 0.2], [0, 0.02, -d / 2 - 0.09], COLORS.slabEdge, 0, { shadow: false });
      block(floorGroup, this.cache, [0.2, 0.14, d + 0.2], [w / 2 + 0.09, 0.02, 0], COLORS.slabEdge, 0, { shadow: false });
      block(floorGroup, this.cache, [0.2, 0.14, d + 0.2], [-w / 2 - 0.09, 0.02, 0], COLORS.slabEdge, 0, { shadow: false });

      this.buildWalls(floorGroup, level, w, d);
      this.buildInterior(floorGroup, level, w, d);
    }

    this.spotlight = new THREE.PointLight(0xffe9c4, 16, 34, 2);
    this.spotlight.position.set(0, FLOOR_HEIGHT * 3.2, 0);
    this.group.add(this.spotlight);
    this.setFloor(this.visibleFloor);
  }

  private buildWalls(parent: THREE.Group, level: number, w: number, d: number): void {
    const glass = material(this.cache, COLORS.glass, { roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.32 });
    const wallMat = material(this.cache, level === 3 ? 0xe8dfcb : COLORS.wall, { roughness: 0.9 });
    const sill = material(this.cache, 0xb9a98e, { roughness: 0.9 });

    const addSide = (length: number, x: number, z: number, rotation: number, normalX: number, normalZ: number) => {
      const sideGroup = new THREE.Group();
      // Faixa opaca inferior, vidro e faixa superior: fachada envidraçada.
      const base = new THREE.Mesh(UNIT, sill);
      base.scale.set(length, 0.85, 0.26);
      base.position.set(x, 0, z);
      base.rotation.y = rotation;
      base.castShadow = true;
      base.receiveShadow = true;
      // A faixa baixa funciona como "corte": fica mesmo quando a parede some.
      base.userData.stub = true;
      sideGroup.add(base);

      const band = new THREE.Mesh(UNIT, glass);
      band.scale.set(length - 0.1, 1.5, 0.1);
      band.position.set(x, 0.85, z);
      band.rotation.y = rotation;
      sideGroup.add(band);

      const header = new THREE.Mesh(UNIT, wallMat);
      header.scale.set(length, 0.6, 0.26);
      header.position.set(x, 2.35, z);
      header.rotation.y = rotation;
      header.castShadow = true;
      sideGroup.add(header);

      // Montantes a cada 3 m.
      const count = Math.max(2, Math.round(length / 3));
      const mullion = material(this.cache, COLORS.mullion, { metalness: 0.55, roughness: 0.45 });
      for (let index = 0; index <= count; index += 1) {
        const t = (index / count - 0.5) * length;
        const m = new THREE.Mesh(UNIT, mullion);
        m.scale.set(0.09, 2.1, 0.14);
        m.position.set(x + Math.cos(rotation) * t, 0.85, z - Math.sin(rotation) * t);
        m.rotation.y = rotation;
        sideGroup.add(m);
      }
      sideGroup.name = `parede-${normalX}:${normalZ}`;
      sideGroup.userData.normal = [normalX, normalZ];
      parent.add(sideGroup);
      this.walls.push({ object: sideGroup, normalX, normalZ });
    };

    addSide(w, 0, -d / 2, 0, 0, -1);
    addSide(w, 0, d / 2, 0, 0, 1);
    addSide(d, -w / 2, 0, Math.PI / 2, -1, 0);
    addSide(d, w / 2, 0, Math.PI / 2, 1, 0);

    if (level === 3) {
      // Parapeito na cobertura: sem telhado, a vista de cima continua aberta.
      const parapet = material(this.cache, COLORS.wall, { roughness: 0.9 });
      for (const [px, pz, sx, sz] of [[0, -d / 2, w, 0.22], [0, d / 2, w, 0.22], [-w / 2, 0, 0.22, d], [w / 2, 0, 0.22, d]] as number[][]) {
        const mesh = new THREE.Mesh(UNIT, parapet);
        mesh.scale.set(sx || 0.22, 0.5, sz || 0.22);
        mesh.position.set(px, WALL_HEIGHT, pz);
        parent.add(mesh);
      }
    }
  }

  private buildInterior(parent: THREE.Group, level: number, w: number, d: number): void {
    const cache = this.cache;
    const partition = material(cache, COLORS.partition, { roughness: 0.92 });
    const cap = material(cache, 0x5b5448, { roughness: 0.8 });
    const addPartition = (length: number, x: number, z: number, rotation: number) => {
      if (length < 0.6) return;
      const mesh = new THREE.Mesh(UNIT, partition);
      mesh.scale.set(length, PARTITION_HEIGHT, 0.18);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = rotation;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      // Capeamento escuro: a divisória lê como parede de corte, não como caixa.
      const top = new THREE.Mesh(UNIT, cap);
      top.scale.set(length + 0.04, 0.09, 0.26);
      top.position.set(x, PARTITION_HEIGHT, z);
      top.rotation.y = rotation;
      parent.add(top);
    };
    const hall = w > 20 ? 2.2 : 1.6;

    if (level === 0) {
      // ── Átrio: recepção, espera, sala de reunião e elevadores ─────────────
      const loungeX = w * 0.26;
      const loungeZ = -d * 0.06;
      rug(parent, cache, loungeX, loungeZ, Math.min(9.5, w * 0.34), Math.min(6.4, d * 0.42), 0x3f6b5e);
      // Recepção em L, de frente para a entrada.
      const deskX = -w * 0.22;
      const deskZ = -d * 0.24;
      block(parent, cache, [3.4, 0.95, 0.95], [deskX, 0, deskZ], 0x4a3b2a, 0);
      block(parent, cache, [3.6, 0.1, 1.1], [deskX, 0.95, deskZ], 0xe4d3ac, 0);
      block(parent, cache, [0.95, 0.95, 2.3], [deskX - 1.9, 0, deskZ + 0.7], COLORS.darkWood, 0);
      boxLogo(parent, cache, deskX, deskZ - 0.52);
      chair(parent, cache, deskX, deskZ - 1.1, Math.PI);
      plant(parent, cache, deskX + 2.4, deskZ - 1.0);
      // Espera: dois sofás frente a frente, mesa de centro e poltronas.
      sofa(parent, cache, loungeX, loungeZ - 1.5, 0, COLORS.fabric);
      sofa(parent, cache, loungeX, loungeZ + 1.9, Math.PI, COLORS.fabricWarm);
      block(parent, cache, [2.0, 0.32, 1.0], [loungeX, 0, loungeZ + 0.2], COLORS.darkWood, 0);
      block(parent, cache, [0.45, 0.05, 0.45], [loungeX - 0.6, 0.32, loungeZ + 0.2], 0xd8c9a8, 0, { shadow: false });
      block(parent, cache, [0.28, 0.5, 0.28], [loungeX + 0.7, 0, loungeZ + 0.2], 0x8a8f7f, 0, { shadow: false });
      chair(parent, cache, loungeX - 2.6, loungeZ + 0.2, Math.PI / 2);
      chair(parent, cache, loungeX + 2.6, loungeZ + 0.2, -Math.PI / 2);
      // Sala de reunião no canto oposto, com divisórias de vidro baixo.
      const roomW = Math.min(6.4, w * 0.3);
      const roomD = Math.min(5.2, d * 0.34);
      const roomX = -w / 2 + roomW / 2 + 0.6;
      const roomZ = d / 2 - roomD / 2 - 0.6;
      addPartition(roomD, roomX + roomW / 2, roomZ, Math.PI / 2);
      addPartition(roomW, roomX, roomZ - roomD / 2, 0);
      block(parent, cache, [roomW * 0.62, 0.1, roomD * 0.3], [roomX, 0.7, roomZ], COLORS.wood, 0);
      chair(parent, cache, roomX, roomZ - roomD * 0.26, Math.PI);
      chair(parent, cache, roomX, roomZ + roomD * 0.26, 0);
      chair(parent, cache, roomX - roomW * 0.3, roomZ, Math.PI / 2);
      chair(parent, cache, roomX + roomW * 0.3, roomZ, -Math.PI / 2);
      screenPanel(parent, cache, roomX, 0.95, roomZ - roomD / 2 + 0.25, roomW * 0.45, 0);
      // Núcleo de elevadores com portas metálicas e indicador dourado.
      const coreX = w / 2 - 1.7;
      const coreZ = -d / 2 + 1.7;
      block(parent, cache, [2.6, WALL_HEIGHT - 0.1, 2.6], [coreX, 0, coreZ], 0xb0aca0, 0);
      for (const offset of [-0.42, 0.42]) {
        block(parent, cache, [0.7, 2.0, 0.06], [coreX + offset, 0.05, coreZ + 1.5], 0x969ca0, 0, { metalness: 0.5, roughness: 0.3 });
      }
      block(parent, cache, [1.2, 0.28, 0.08], [coreX, 2.2, coreZ + 1.52], COLORS.gold, 0, { shadow: false, emissive: 0x6a4f14 });
      // Balcão de café com prateleira e copos, junto ao núcleo.
      const cafeX = w / 2 - 4.4;
      block(parent, cache, [3.2, 0.9, 0.72], [cafeX, 0, coreZ + 3.3], 0xcfc6b2, 0);
      block(parent, cache, [0.7, 0.5, 0.5], [cafeX - 1.2, 0.9, coreZ + 3.3], COLORS.dark, 0);
      block(parent, cache, [2.6, 0.08, 0.45], [cafeX, 2.0, coreZ + 2.55], COLORS.wood, 0);
      for (let index = 0; index < 4; index += 1) {
        block(parent, cache, [0.22, 0.32, 0.22], [cafeX - 0.9 + index * 0.6, 2.08, coreZ + 2.55], [0xb05a44, 0x3f7c6b, 0xc9a24a, 0x7d4f57][index], 0, { shadow: false });
      }
      // Plantas nas esquinas e quadro na parede do fundo.
      plant(parent, cache, -w / 2 + 1.1, -d / 2 + 1.1);
      plant(parent, cache, w / 2 - 1.0, d / 2 - 1.0);
      block(parent, cache, [Math.min(3.4, w * 0.16), 1.2, 0.08], [loungeX, 1.6, d / 2 - 0.18], 0x2f6f63, 0, { emissive: 0x123c34 });
      block(parent, cache, [0.05, 0.36, 0.36], [w / 2 - 0.5, 2.35, 0.2], 0xd9d2c2, 0, { shadow: false });
      this.lightStrip(parent, w, d, 1);
    }

    if (level === 1) {
      // ── Escritório aberto: estações preenchem a planta ────────────────────
      const usableW = w - 4.0;
      const usableD = d - 3.4;
      const pitchX = 3.35;
      const pitchZ = 2.95;
      const cols = Math.max(3, Math.min(8, Math.floor(usableW / pitchX)));
      const rowCount = Math.max(3, Math.min(6, Math.floor(usableD / pitchZ)));
      const spanX = (cols - 1) * pitchX;
      const spanZ = (rowCount - 1) * pitchZ;
      rug(parent, cache, 0, 0.3, Math.min(w - 1.4, spanX + 5.2), Math.min(d - 1.2, spanZ + 3.6), 0x9b9a8c);
      for (let row = 0; row < rowCount; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const x = -spanX / 2 + col * pitchX;
          const z = -spanZ / 2 + row * pitchZ + 0.3;
          desk(parent, cache, x, z, 0, 2.3);
          block(parent, cache, [0.85, 0.68, 0.85], [x + 1.25, 0, z + 0.5], 0x50564c, 0);
          if ((row + col) % 3 === 0) plant(parent, cache, x + 1.55, z - 0.9);
        }
      }
      // Copa, sala de servidores e divisórias de apoio.
      const pantryZ = d / 2 - 1.1;
      block(parent, cache, [3.2, 0.9, 0.72], [w / 2 - 2.6, 0, pantryZ], 0xd2c9b6, 0);
      block(parent, cache, [0.68, 1.7, 0.66], [w / 2 - 4.5, 0, pantryZ], 0x9ba3a0, 0, { metalness: 0.3, roughness: 0.4 });
      block(parent, cache, [1.0, 0.09, 1.0], [w / 2 - 2.2, 1.0, pantryZ - 1.7], COLORS.wood, 0);
      chair(parent, cache, w / 2 - 2.2, pantryZ - 2.6, 0);
      addPartition(4.2, w / 2 - 3.2, pantryZ - 3.4, 0);
      block(parent, cache, [0.8, 1.9, 1.0], [-w / 2 + 0.9, 0, -d / 2 + 1.2], 0x2b3134, 0);
      for (let index = 0; index < 5; index += 1) {
        block(parent, cache, [0.06, 0.06, 0.06], [-w / 2 + 0.45, 0.4 + index * 0.3, -d / 2 + 1.2], 0x2fb39a, 0, { shadow: false, emissive: 0x2fb39a });
      }
      plant(parent, cache, -w / 2 + 1.2, d / 2 - 1.2);
      plant(parent, cache, w / 2 - 1.2, -d / 2 + 2.6);
      block(parent, cache, [2.8, 1.3, 0.08], [-2.4, 1.4, -d / 2 + 0.2], 0xe8e4d8, 0);
      block(parent, cache, [1.9, 0.9, 0.08], [1.6, 1.5, -d / 2 + 0.2], 0x4a5a52, 0);
      this.lightStrip(parent, w, d, 2);
    }

    if (level === 2) {
      // ── Duas salas de reunião, copa e lounge ──────────────────────────────
      const splitX = -w * 0.14;
      addPartition(d - 1.4, splitX, 0, Math.PI / 2);
      const westW = splitX + w / 2;
      const eastW = w / 2 - splitX;
      // Reunião principal (oeste), mesa proporcional à sala.
      const tableW = Math.min(8.5, westW * 0.66);
      const tableD = Math.min(2.8, d * 0.24);
      const tX = -w / 2 + westW * 0.46;
      rug(parent, cache, tX, 0.4, Math.min(westW - 1.6, tableW + 2.6), Math.min(d - 1.8, tableD + 4.6), 0x77897c);
      block(parent, cache, [tableW, 0.12, tableD], [tX, 0.72, 0.4], COLORS.darkWood, 0);
      block(parent, cache, [0.5, 0.72, 0.5], [tX, 0, 0.4], COLORS.dark, 0, { shadow: false });
      const seats = Math.max(2, Math.floor(tableW / 1.5));
      for (let index = 0; index < seats; index += 1) {
        const x = tX - tableW / 2 + (index + 0.5) * (tableW / seats);
        chair(parent, cache, x, 0.4 + tableD * 0.5 + 0.7, Math.PI);
        chair(parent, cache, x, 0.4 - tableD * 0.5 - 0.7, 0);
      }
      screenPanel(parent, cache, tX, 0.7, -d / 2 + 0.35, Math.min(3.6, tableW * 0.7), 0);
      plant(parent, cache, -w / 2 + 1.2, -d / 2 + 1.2);
      plant(parent, cache, splitX - 1.2, d / 2 - 1.2);
      // Sala menor + lounge (leste).
      const smallX = splitX + eastW * 0.5;
      addPartition(eastW * 0.9, smallX, d * 0.18, Math.PI / 2);
      block(parent, cache, [Math.min(4.2, eastW * 0.5), 0.1, 1.5], [smallX + 0.4, 0.72, d * 0.18], COLORS.wood, 0);
      chair(parent, cache, smallX + 0.4, d * 0.18 - 1.4, 0);
      chair(parent, cache, smallX + 0.4, d * 0.18 + 1.4, Math.PI);
      screenPanel(parent, cache, smallX + 0.4, 0.8, d * 0.18 - 2.6, Math.min(2.6, eastW * 0.4), 0);
      const lounge2X = splitX + eastW * 0.5;
      const lounge2Z = -d * 0.26;
      sofa(parent, cache, lounge2X, lounge2Z - 1.2, 0, COLORS.fabric);
      block(parent, cache, [2.0, 0.32, 1.0], [lounge2X, 0, lounge2Z + 0.4], COLORS.darkWood, 0);
      block(parent, cache, [1.8, 0.9, 0.8], [lounge2X - 2.1, 0, lounge2Z + 1.9], 0xd2c9b6, 0);
      plant(parent, cache, w / 2 - 1.2, -d / 2 + 1.2);
      plant(parent, cache, w / 2 - 1.2, d / 2 - 1.2);
      this.lightStrip(parent, w, d, 3);
    }

    if (level === 3) {
      // ── Direção: gabinete, biblioteca, apoio e terraço ────────────────────
      const deskX = -w * 0.1;
      const deskZ = -d * 0.2;
      rug(parent, cache, 0, 0.3, Math.min(w - 2.4, 13), Math.min(d - 2.0, 8.4), 0x6d7a6d);
      desk(parent, cache, deskX, deskZ, Math.PI, Math.min(3.6, w * 0.16));
      chair(parent, cache, deskX, deskZ + 1.3, 0);
      block(parent, cache, [1.0, 0.86, 0.86], [deskX + 2.8, 0, deskZ - 1.0], COLORS.darkWood, 0);
      screenPanel(parent, cache, deskX, 0.7, -d / 2 + 0.4, Math.min(3.6, w * 0.16), 0);
      // Biblioteca na parede oeste, com livros frequentes.
      const shelfZ = d * 0.16;
      const shelfLen = Math.min(d - 3.0, 7.0);
      block(parent, cache, [0.5, 2.35, shelfLen], [-w / 2 + 0.6, 0, shelfZ], COLORS.darkWood, 0);
      const levelsCount = 4;
      for (let index = 0; index < levelsCount; index += 1) {
        block(parent, cache, [0.52, 0.08, shelfLen], [-w / 2 + 0.6, 0.45 + index * 0.55, shelfZ], 0xd2c6ae, 0, { shadow: false });
        const books = Math.floor(shelfLen / 0.55);
        for (let book = 0; book < books; book += 1) {
          if ((index * 3 + book) % 4 === 0) continue;
          block(
            parent,
            cache,
            [0.3, 0.34, 0.12],
            [-w / 2 + 0.6, 0.53 + index * 0.55, shelfZ - shelfLen / 2 + 0.35 + book * 0.55],
            [0xb05a44, 0x3f7c6b, 0xc9a24a, 0x6b7f9a, 0x8a5a6a][(index * 7 + book) % 5],
            0,
            { shadow: false },
          );
        }
      }
      // Apoio: mesa redonda com cadeiras.
      const roundX = w * 0.28;
      const roundZ = d * 0.24;
      block(parent, cache, [2.0, 0.12, 2.0], [roundX, 0.85, roundZ], COLORS.wood, 0.78, { shadow: false });
      block(parent, cache, [0.5, 0.85, 0.5], [roundX, 0, roundZ], COLORS.dark, 0, { shadow: false });
      for (let index = 0; index < 4; index += 1) {
        const angle = (index / 4) * Math.PI * 2 + 0.4;
        chair(parent, cache, roundX + Math.cos(angle) * 1.9, roundZ + Math.sin(angle) * 1.9, -angle);
      }
      // Estar do gabinete.
      sofa(parent, cache, w * 0.24, d * 0.02, Math.PI, COLORS.fabricWarm);
      block(parent, cache, [1.9, 0.32, 1.0], [w * 0.24, 0, d * 0.02 - 1.6], COLORS.darkWood, 0);
      // Divisória do gabinete e bandeira da Casa.
      addPartition(Math.min(6.6, w * 0.34), deskX + Math.min(4.6, w * 0.2), 2.2, 0);
      block(parent, cache, [0.08, 2.4, 0.08], [w / 2 - 1.3, 0, -d / 2 + 1.3], COLORS.gold, 0, { shadow: false });
      block(parent, cache, [0.06, 1.0, 1.3], [w / 2 - 1.3, 1.4, -d / 2 + 2.0], 0x2fb39a, 0, { shadow: false });
      plant(parent, cache, -w / 2 + 1.3, -d / 2 + 1.3);
      plant(parent, cache, w / 2 - 1.3, d / 2 - 1.3);
      plant(parent, cache, -w * 0.02, d * 0.3);
      this.lightStrip(parent, w, d, 4);
    }
    void hall;
  }

  /** Faixa de luz de teto: dá leitura de planta baixa mesmo visto de longe. */
  private lightStrip(parent: THREE.Object3D, w: number, d: number, level: number): void {
    const light = material(this.cache, 0xfdf0cf, { emissive: 0xf6e2b4, roughness: 0.4 });
    const count = Math.max(2, Math.round((w - 4) / 7));
    for (let index = 0; index < count; index += 1) {
      const x = -w / 2 + 2 + ((index + 0.5) * (w - 4)) / count;
      const offset = level % 2 === 0 ? -d * 0.16 : d * 0.16;
      const mesh = new THREE.Mesh(UNIT, light);
      mesh.scale.set(1.9, 0.09, 0.4);
      mesh.position.set(x, WALL_HEIGHT - 0.14, offset);
      mesh.castShadow = false;
      parent.add(mesh);
    }
  }

  /** Mostra até `count` pisos (1–4); o piso de cima é o corte atual. */
  setFloor(count: number): void {
    this.visibleFloor = Math.max(1, Math.min(4, count));
    this.levels.forEach((level, index) => {
      level.visible = index < this.visibleFloor;
    });
  }

  /**
   * Paredes entre a câmera e o interior viram um rodapé baixo (corte à la
   * The Sims); as demais continuam inteiras.
   */
  update(camera: THREE.Object3D): void {
    this.group.updateWorldMatrix(true, false);
    const local = this.group.worldToLocal(camera.position.clone());
    const length = Math.hypot(local.x, local.z) || 1;
    const dirX = local.x / length;
    const dirZ = local.z / length;
    for (const wall of this.walls) {
      const cut = wall.normalX * dirX + wall.normalZ * dirZ >= 0.2;
      wall.object.visible = true;
      for (const child of wall.object.children) {
        child.visible = !cut || child.userData.stub === true;
      }
    }
    this.spotlight.position.y = this.visibleFloor * FLOOR_HEIGHT - 0.9;
  }

  dispose(): void {
    this.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      // As caixas compartilham UNIT; só os cones de planta têm geometria própria.
      if (mesh.isMesh && mesh.geometry !== UNIT) mesh.geometry.dispose();
    });
    for (const item of this.cache.values()) item.dispose();
    this.cache.clear();
    this.group.clear();
  }
}

function boxLogo(parent: THREE.Object3D, cache: MaterialCache, x: number, z: number): void {
  block(parent, cache, [1.4, 0.06, 0.06], [x, 1.55, z], COLORS.gold, 0, { shadow: false });
  block(parent, cache, [0.06, 0.55, 0.06], [x, 1.28, z], COLORS.gold, 0, { shadow: false });
}
