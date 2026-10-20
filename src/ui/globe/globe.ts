import * as THREE from 'three';
import earcut from 'earcut';
import { COUNTRY_BY_ID, CITIES, GLOBAL_CITIES, type AtlasCity, type CountryDetail, type Shapes } from '../../game/atlas';
import { FACTIONS, TERRAIN } from '../../game/constants';
import { cityLabel } from '../../game/names';
import type { FactionId, Tile } from '../../game/types';

export { supportsWebGL } from './webgl';

// ─────────────────────────────────────────────────────────────────────────────
// Globo 3D: esferas de países extrudadas, províncias detalhadas e cidades.
// Implementação imperativa em three.js — o React apenas envia o estado.
// ─────────────────────────────────────────────────────────────────────────────

const RADIUS = 1;
const COUNTRY_LIFT = 0.007;
const PROVINCE_LIFT = 0.012;
const CITY_LIFT = 0.019;

export type GlobeHover =
  | { kind: 'country'; id: string; x: number; y: number }
  | { kind: 'province'; id: string; x: number; y: number }
  | { kind: 'city'; id: string; x: number; y: number };

export interface GlobeCallbacks {
  onSelectCountry: (id: string, focus: boolean) => void;
  onSelectProvince: (id: string) => void;
  onSelectCity: (id: string) => void;
  onClear: () => void;
  onHover: (hover: GlobeHover | null) => void;
  onFail: () => void;
}

export interface GlobeState {
  tiles: Record<string, Tile>;
  shapes: Record<string, Shapes>;
  focusCountryId: string | null;
  selectedCountryId: string | null;
  selectedProvinceId: string | null;
  selectedCityId: string | null;
  detail: CountryDetail | null;
  playerId: FactionId;
  claimable: Set<string>;
  showCities: boolean;
  showBorders: boolean;
}

const NEUTRAL: Record<string, string> = {
  'Europa': '#6b878b',
  'África': '#8a7c5a',
  'Ásia': '#79806a',
  'América do Norte': '#63807a',
  'América do Sul': '#5f8273',
  'Oceania': '#65808c',
  'Outros': '#6a7883',
};

function latLonToVec3(lon: number, lat: number, radius: number, target = new THREE.Vector3()): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  const sinPhi = Math.sin(phi);
  return target.set(
    -radius * sinPhi * Math.cos(theta),
    radius * Math.cos(phi),
    radius * sinPhi * Math.sin(theta),
  );
}

function hashHue(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 360;
  return hash;
}

function countryColor(tile: Tile | undefined, playerId: FactionId): THREE.Color {
  if (tile?.owner) {
    const base = new THREE.Color(FACTIONS[tile.owner].color);
    return base.offsetHSL(0, 0, tile.owner === playerId ? 0.02 : 0);
  }
  const base = new THREE.Color(NEUTRAL[tile?.continent ?? 'Outros'] ?? NEUTRAL.Outros);
  return base.offsetHSL(((hashHue(tile?.id ?? 'x') % 16) - 8) / 360, 0, 0);
}

function unwrapRing(ring: number[], reference: number | null = null): number[] {
  const out: number[] = [];
  let previous: number | null = reference;
  for (let i = 0; i < ring.length; i += 2) {
    let lon = ring[i];
    const lat = ring[i + 1];
    if (previous !== null) {
      while (lon - previous > 180) lon -= 360;
      while (lon - previous < -180) lon += 360;
    }
    out.push(lon, lat);
    previous = lon;
  }
  return out;
}

function pushTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  depth = 0,
): void {
  const ab = a.distanceTo(b);
  const bc = b.distanceTo(c);
  const ca = c.distanceTo(a);
  const longest = Math.max(ab, bc, ca);
  if (longest > 0.16 && depth < 4) {
    const abMid = a.clone().add(b).normalize().multiplyScalar(a.length());
    const bcMid = b.clone().add(c).normalize().multiplyScalar(b.length());
    const caMid = c.clone().add(a).normalize().multiplyScalar(a.length());
    pushTriangle(positions, a, abMid, caMid, depth + 1);
    pushTriangle(positions, abMid, b, bcMid, depth + 1);
    pushTriangle(positions, caMid, bcMid, c, depth + 1);
    pushTriangle(positions, abMid, bcMid, caMid, depth + 1);
    return;
  }
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

/** Converte polígonos lon/lat em uma casca esférica extrudada. */
export function shapesToGeometry(shapes: Shapes, radius: number, lift: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const topRadius = radius + lift;
  for (const polygon of shapes) {
    if (!polygon.length) continue;
    const outer = unwrapRing(polygon[0]);
    const reference = outer[0] ?? 0;
    const rings = [outer, ...polygon.slice(1).map((ring) => unwrapRing(ring, reference))];
    const coords: number[] = [];
    const holes: number[] = [];
    for (let r = 0; r < rings.length; r += 1) {
      if (r > 0) holes.push(coords.length / 2);
      for (let i = 0; i < rings[r].length; i += 2) {
        coords.push(rings[r][i], rings[r][i + 1]);
      }
    }
    const indices = earcut(coords, holes.length ? holes : undefined, 2);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i] * 2;
      const i1 = indices[i + 1] * 2;
      const i2 = indices[i + 2] * 2;
      latLonToVec3(coords[i0], coords[i0 + 1], topRadius, a);
      latLonToVec3(coords[i1], coords[i1 + 1], topRadius, b);
      latLonToVec3(coords[i2], coords[i2 + 1], topRadius, c);
      pushTriangle(positions, a, b, c);
    }
    // Paredes
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 2; i += 2) {
        const lon1 = ring[i];
        const lat1 = ring[i + 1];
        const lon2 = ring[i + 2];
        const lat2 = ring[i + 3];
        const delta = Math.hypot((lon2 - lon1) * Math.cos(THREE.MathUtils.degToRad((lat1 + lat2) / 2)), lat2 - lat1);
        const steps = Math.max(1, Math.min(24, Math.ceil(delta / 3)));
        for (let s = 0; s < steps; s += 1) {
          const t1 = s / steps;
          const t2 = (s + 1) / steps;
          const lo1 = lon1 + (lon2 - lon1) * t1;
          const la1 = lat1 + (lat2 - lat1) * t1;
          const lo2 = lon1 + (lon2 - lon1) * t2;
          const la2 = lat1 + (lat2 - lat1) * t2;
          const top1 = latLonToVec3(lo1, la1, topRadius);
          const top2 = latLonToVec3(lo2, la2, topRadius);
          const bot1 = latLonToVec3(lo1, la1, radius);
          const bot2 = latLonToVec3(lo2, la2, radius);
          positions.push(
            top1.x, top1.y, top1.z, bot1.x, bot1.y, bot1.z, top2.x, top2.y, top2.z,
            top2.x, top2.y, top2.z, bot1.x, bot1.y, bot1.z, bot2.x, bot2.y, bot2.z,
          );
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function ringSegments(shapes: Shapes, radius: number): Float32Array {
  const points: number[] = [];
  for (const polygon of shapes) {
    const outer = unwrapRing(polygon[0]);
    const reference = outer[0] ?? 0;
    const rings = [outer, ...polygon.slice(1).map((ring) => unwrapRing(ring, reference))];
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 2; i += 2) {
        const a = latLonToVec3(ring[i], ring[i + 1], radius);
        const b = latLonToVec3(ring[i + 2], ring[i + 3], radius);
        points.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }
  return new Float32Array(points);
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

function dotTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.62, 'rgba(255,255,255,0.28)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(32, 32, 31, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class GlobeMap {
  private container: HTMLElement;
  private callbacks: GlobeCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private world = new THREE.Group();
  private countryGroup = new THREE.Group();
  private provinceGroup = new THREE.Group();
  private cityGroup = new THREE.Group();
  private borderGroup = new THREE.Group();
  private selectedGroup = new THREE.Group();
  private labelLayer: HTMLDivElement;
  private labels = new Map<string, HTMLDivElement>();

  private meshes = new Map<string, THREE.Mesh>();
  private outlineGeometries = new Map<string, THREE.BufferGeometry>();
  private provinceMeshes = new Map<string, THREE.Mesh>();
  private cityMarkers: Array<{ id: string; position: THREE.Vector3; city: AtlasCity; focused: boolean }> = [];
  private cityTexture = dotTexture();

  private state: GlobeState | null = null;
  private lon = 10;
  private lat = 26;
  private distance = 3.05;
  private targetLon = 10;
  private targetLat = 26;
  private targetDistance = 3.05;

  private dragging = false;
  private moved = false;
  private lastPointer = { x: 0, y: 0 };
  private downPointer = { x: 0, y: 0 };
  private activePointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private lastCountryClick = { id: '', at: 0 };
  private hoverKey: string | null = null;
  private bordersKey = '';
  private selectionKey = '';
  private resizeObserver: ResizeObserver | null = null;
  private frame = 0;
  private disposed = false;

  constructor(container: HTMLElement, callbacks: GlobeCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x050b10, 1);
    this.renderer.domElement.className = 'globe-webgl';
    this.renderer.domElement.setAttribute('aria-label', 'Globo tridimensional interativo');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);

    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'globe-labels';
    container.appendChild(this.labelLayer);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 200);
    this.scene.add(this.world);
    this.world.add(this.countryGroup, this.provinceGroup, this.cityGroup, this.borderGroup, this.selectedGroup);
    this.buildSky();
    this.buildOcean();
    this.applyCamera();
    this.bindEvents();
    this.resize();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.loop();
  }

  private buildSky(): void {
    const stars = 1400;
    const positions = new Float32Array(stars * 3);
    for (let i = 0; i < stars; i += 1) {
      const vector = new THREE.Vector3().randomDirection().multiplyScalar(18 + Math.random() * 40);
      positions[i * 3] = vector.x;
      positions[i * 3 + 1] = vector.y;
      positions[i * 3 + 2] = vector.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0x9fc3bd, size: 0.08, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true,
    })));

    const ambient = new THREE.AmbientLight(0xd9ece7, 1.65);
    const hemisphere = new THREE.HemisphereLight(0xbfd8dd, 0x0a1519, 1.15);
    const key = new THREE.DirectionalLight(0xfff0d6, 1.55);
    key.position.set(4, 2.6, 3.2);
    const rim = new THREE.DirectionalLight(0x63dcc3, 0.55);
    rim.position.set(-4, -1.4, -3);
    this.scene.add(ambient, hemisphere, key, rim);
  }

  private buildOcean(): void {
    const ocean = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS - 0.002, 96, 96),
      new THREE.MeshLambertMaterial({ color: 0x0a1c25, emissive: 0x031018, emissiveIntensity: 0.7 }),
    );
    this.scene.add(ocean);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.055, 64, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.6);
            gl_FragColor = vec4(0.18, 0.62, 0.64, 1.0) * intensity;
          }`,
      }),
    );
    this.scene.add(atmosphere);

    const grid: number[] = [];
    for (let lon = -180; lon <= 180; lon += 20) {
      for (let lat = -80; lat < 80; lat += 5) {
        const a = latLonToVec3(lon, lat, RADIUS + 0.0004);
        const b = latLonToVec3(lon, lat + 5, RADIUS + 0.0004);
        grid.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    for (let lat = -80; lat <= 80; lat += 20) {
      for (let lon = -180; lon < 180; lon += 5) {
        const a = latLonToVec3(lon, lat, RADIUS + 0.0004);
        const b = latLonToVec3(lon + 5, lat, RADIUS + 0.0004);
        grid.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    this.scene.add(new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({
      color: 0x1d4750, transparent: true, opacity: 0.35, depthWrite: false,
    })));
  }

  setState(next: GlobeState): void {
    const previous = this.state;
    this.state = next;
    const shapesChanged = !previous || previous.shapes !== next.shapes;
    const focusChanged = previous?.focusCountryId !== next.focusCountryId || previous?.detail !== next.detail;
    const citiesChanged = previous?.showCities !== next.showCities
      || previous?.focusCountryId !== next.focusCountryId;
    if (shapesChanged) this.buildCountries(next.shapes);
    this.applyColors();
    if (focusChanged) this.applyFocus(next);
    if (focusChanged || citiesChanged) this.buildCities(next);
    const detailKey = next.detail ? next.detail.iso : '';
    const selectionKey = `${next.selectedCountryId ?? ''}|${next.focusCountryId ?? ''}|${detailKey}`;
    if (selectionKey !== this.selectionKey) {
      this.selectionKey = selectionKey;
      this.buildSelectedOutline(next);
    }
    const bordersKey = `${next.showBorders}|${next.focusCountryId ?? ''}|${detailKey}`;
    if (bordersKey !== this.bordersKey) {
      this.bordersKey = bordersKey;
      this.buildBorders(next.showBorders);
    }
  }

  private buildCountries(shapes: Record<string, Shapes>): void {
    disposeObject(this.countryGroup);
    this.countryGroup.clear();
    this.meshes.clear();
    this.outlineGeometries.clear();
    this.bordersKey = '';
    // DoubleSide: os anéis do GeoJSON não têm orientação garantida, então o cap
    // superior pode estar no sentido horário; sem isso países sumiriam do globo.
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: THREE.DoubleSide });
    for (const [iso, geometryShapes] of Object.entries(shapes)) {
      if (!geometryShapes.length) continue;
      const geometry = shapesToGeometry(geometryShapes, RADIUS, COUNTRY_LIFT);
      this.outlineGeometries.set(iso, geometry);
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.userData = { kind: 'country', id: iso };
      this.countryGroup.add(mesh);
      this.meshes.set(iso, mesh);
    }
    this.applyColors();
  }

  private applyColors(): void {
    if (!this.state) return;
    for (const [iso, mesh] of this.meshes) {
      const tile = this.state.tiles[iso];
      const color = countryColor(tile, this.state.playerId);
      if (!tile?.owner && this.state.claimable.has(iso)) color.offsetHSL(0.02, 0.12, 0.05);
      (mesh.material as THREE.MeshLambertMaterial).color.copy(color);
      (mesh.material as THREE.MeshLambertMaterial).emissive.setHex(0x000000);
    }
    for (const [id, mesh] of this.provinceMeshes) {
      const tile = this.state.tiles[this.state.focusCountryId ?? ''];
      const terrain = tile ? TERRAIN[tile.terrain] : TERRAIN.planicie;
      const base = new THREE.Color(terrain.color);
      base.offsetHSL(((hashHue(id) % 14) - 7) / 360, 0, 0.02);
      (mesh.material as THREE.MeshLambertMaterial).color.copy(base);
    }
  }

  private applyFocus(next: GlobeState): void {
    // Restaura a geometria de contorno do país anterior.
    for (const [iso, mesh] of this.meshes) {
      const outline = this.outlineGeometries.get(iso);
      if (outline && mesh.geometry !== outline) {
        mesh.geometry.dispose();
        mesh.geometry = outline;
      }
    }
    disposeObject(this.provinceGroup);
    this.provinceGroup.clear();
    this.provinceMeshes.clear();

    const iso = next.focusCountryId;
    if (!iso) {
      this.resetView();
      return;
    }
    const country = COUNTRY_BY_ID[iso];
    if (country) this.focusCamera(country.lon, country.lat, country.id);
    // O detalhe é buscado por país; enquanto o novo arquivo não chega, o detalhe
    // anterior não pode ser aplicado à geometria do país recém-focado.
    if (!next.detail || next.detail.iso !== iso) return;
    const mesh = this.meshes.get(iso);
    if (mesh && next.detail.country.length) {
      mesh.geometry = shapesToGeometry(next.detail.country, RADIUS, COUNTRY_LIFT);
    }
    // DoubleSide: os anéis do GeoJSON não têm orientação garantida, então o cap
    // superior pode estar no sentido horário; sem isso países sumiriam do globo.
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: THREE.DoubleSide });
    for (const [provinceId, provinceShapes] of Object.entries(next.detail.provinces)) {
      const geometry = shapesToGeometry(provinceShapes, RADIUS, PROVINCE_LIFT);
      const province = new THREE.Mesh(geometry, material.clone());
      province.userData = { kind: 'province', id: provinceId, country: iso };
      this.provinceGroup.add(province);
      this.provinceMeshes.set(provinceId, province);
    }
    this.applyColors();
    this.highlightSelection();
  }

  private buildBorders(visible: boolean): void {
    disposeObject(this.borderGroup);
    this.borderGroup.clear();
    if (!visible || !this.state) return;
    const material = new THREE.LineBasicMaterial({ color: 0x061318, transparent: true, opacity: 0.55, depthWrite: false });
    for (const [iso, mesh] of this.meshes) {
      const geometry = new THREE.BufferGeometry();
      const focused = iso === this.state.focusCountryId
        && this.state.detail
        && this.state.detail.iso === iso;
      const shapes = focused ? this.state.detail!.country : this.state.shapes[iso];
      if (!shapes) continue;
      const lift = focused ? PROVINCE_LIFT + 0.0012 : COUNTRY_LIFT + 0.0012;
      geometry.setAttribute('position', new THREE.BufferAttribute(ringSegments(shapes, RADIUS + lift), 3));
      this.borderGroup.add(new THREE.LineSegments(geometry, material));
    }
  }

  private buildSelectedOutline(next: GlobeState): void {
    disposeObject(this.selectedGroup);
    this.selectedGroup.clear();
    const iso = next.selectedCountryId;
    if (!iso) return;
    const focused = iso === next.focusCountryId && next.detail?.iso === iso;
    const shapes = focused ? next.detail!.country : next.shapes[iso];
    if (!shapes) return;
    const geometry = new THREE.BufferGeometry();
    const lift = (focused ? PROVINCE_LIFT : COUNTRY_LIFT) + 0.0035;
    geometry.setAttribute('position', new THREE.BufferAttribute(ringSegments(shapes, RADIUS + lift), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xf4d79a, transparent: true, opacity: 0.95, depthWrite: false });
    this.selectedGroup.add(new THREE.LineSegments(geometry, material));
    this.highlightSelection();
  }

  private highlightSelection(): void {
    if (!this.state) return;
    for (const [iso, mesh] of this.meshes) {
      const base = countryColor(this.state.tiles[iso], this.state.playerId);
      if (iso === this.state.selectedCountryId) base.offsetHSL(0, 0.1, 0.12);
      (mesh.material as THREE.MeshLambertMaterial).color.copy(base);
    }
    for (const [id, mesh] of this.provinceMeshes) {
      const material = mesh.material as THREE.MeshLambertMaterial;
      material.emissive.setHex(id === this.state.selectedProvinceId ? 0x3a2a08 : 0x000000);
    }
  }

  private buildCities(next: GlobeState): void {
    disposeObject(this.cityGroup);
    this.cityGroup.clear();
    this.cityMarkers = [];
    for (const label of this.labels.values()) label.remove();
    this.labels.clear();
    if (!next.showCities) return;

    const focus = next.focusCountryId;
    const list: Array<{ city: AtlasCity; focused: boolean }> = [];
    const seen = new Set<string>();
    if (focus) {
      for (const city of CITIES) {
        if (city.countryId !== focus) continue;
        list.push({ city, focused: true });
        seen.add(city.id);
      }
    }
    for (const city of GLOBAL_CITIES) {
      if (seen.has(city.id)) continue;
      list.push({ city, focused: city.countryId === focus });
    }

    const branch = (items: Array<{ city: AtlasCity; focused: boolean }>, size: number, color: number) => {
      if (!items.length) return;
      const positions = new Float32Array(items.length * 3);
      items.forEach((item, index) => {
        const position = latLonToVec3(item.city.lon, item.city.lat, RADIUS + CITY_LIFT);
        positions[index * 3] = position.x;
        positions[index * 3 + 1] = position.y;
        positions[index * 3 + 2] = position.z;
        this.cityMarkers.push({ id: item.city.id, position, city: item.city, focused: item.focused });
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color,
        size,
        map: this.cityTexture,
        transparent: true,
        alphaTest: 0.25,
        depthWrite: false,
        sizeAttenuation: true,
      });
      this.cityGroup.add(new THREE.Points(geometry, material));
    };

    branch(list.filter((item) => item.city.capital), 0.028, 0xf4d79a);
    branch(list.filter((item) => !item.city.capital && item.city.pop >= 8_000_000), 0.02, 0xdcefeb);
    branch(list.filter((item) => !item.city.capital && item.city.pop < 8_000_000), 0.014, 0x9ec4bd);

    if (focus) {
      this.container.dataset.focus = focus;
    } else {
      delete this.container.dataset.focus;
    }
  }

  private focusCamera(lon: number, lat: number, iso: string): void {
    const shapes = this.state?.detail?.iso === iso ? this.state.detail.country : this.state?.shapes[iso];
    let span = 18;
    if (shapes && shapes.length) {
      // Países com territórios ultramarinos (FRA, USA, NLD…) têm polígonos em
      // continentes diferentes: enquadra o polígono mais próximo do centro do país.
      let main = shapes[0];
      let best = Number.POSITIVE_INFINITY;
      for (const polygon of shapes) {
        let sumLon = 0;
        let sumLat = 0;
        const count = polygon[0].length / 2;
        for (let i = 0; i < polygon[0].length; i += 2) {
          sumLon += polygon[0][i];
          sumLat += polygon[0][i + 1];
        }
        const distance = Math.hypot(sumLon / count - lon, sumLat / count - lat);
        if (distance < best) {
          best = distance;
          main = polygon;
        }
      }
      let minLon = 180;
      let maxLon = -180;
      let minLat = 90;
      let maxLat = -90;
      for (let i = 0; i < main[0].length; i += 2) {
        const lonValue = main[0][i];
        const latValue = main[0][i + 1];
        if (lonValue < minLon) minLon = lonValue;
        if (lonValue > maxLon) maxLon = lonValue;
        if (latValue < minLat) minLat = latValue;
        if (latValue > maxLat) maxLat = latValue;
      }
      const lonSpan = (maxLon - minLon) * Math.cos(THREE.MathUtils.degToRad(lat));
      const latSpan = maxLat - minLat;
      const raw = Math.max(lonSpan, latSpan);
      if (raw < 180) span = Math.max(raw, 4);
    }
    this.targetLon = lon;
    this.targetLat = THREE.MathUtils.clamp(lat, -68, 72);
    this.targetDistance = THREE.MathUtils.clamp(1.16 + (span / 180) * 2.5, 1.22, 3.2);
  }

  resetView(): void {
    this.targetLon = 10;
    this.targetLat = 26;
    this.targetDistance = 3.05;
  }

  zoomBy(factor: number): void {
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * factor, 1.32, 4.2);
  }

  private applyCamera(): void {
    const position = latLonToVec3(this.lon, this.lat, this.distance);
    this.camera.position.copy(position);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private bindEvents(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.activePointers.size === 2) {
      const [a, b] = [...this.activePointers.values()];
      this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      this.dragging = false;
      return;
    }
    this.dragging = true;
    this.moved = false;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.downPointer = { x: event.clientX, y: event.clientY };
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.renderer.domElement.style.cursor = 'grabbing';
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.activePointers.has(event.pointerId)) {
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (this.activePointers.size === 2) {
      const [a, b] = [...this.activePointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDistance > 0) {
        this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * (this.pinchDistance / Math.max(1, distance)), 1.32, 4.2);
      }
      this.pinchDistance = distance;
      return;
    }
    if (this.dragging) {
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      if (Math.abs(event.clientX - this.downPointer.x) + Math.abs(event.clientY - this.downPointer.y) > 4) this.moved = true;
      this.targetLon -= dx * 0.28;
      this.targetLat = THREE.MathUtils.clamp(this.targetLat + dy * 0.22, -78, 78);
      this.targetLon = ((this.targetLon + 180) % 360 + 360) % 360 - 180;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      return;
    }
    this.updateHover(event);
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.activePointers.delete(event.pointerId);
    if (this.activePointers.size < 2) this.pinchDistance = 0;
    if (!this.dragging) return;
    this.dragging = false;
    this.renderer.domElement.style.cursor = 'grab';
    if (this.moved) return;
    const hit = this.pick(event.clientX, event.clientY);
    this.callbacks.onHover(null);
    this.hoverKey = null;
    if (!hit) {
      this.callbacks.onClear();
      return;
    }
    if (hit.kind === 'city') {
      this.callbacks.onSelectCity(hit.id);
      return;
    }
    if (hit.kind === 'province') {
      this.callbacks.onSelectProvince(hit.id);
      return;
    }
    const now = performance.now();
    const isDouble = this.lastCountryClick.id === hit.id && now - this.lastCountryClick.at < 340;
    this.lastCountryClick = { id: hit.id, at: now };
    this.callbacks.onSelectCountry(hit.id, isDouble);
  };

  private onPointerLeave = (): void => {
    this.dragging = false;
    this.callbacks.onHover(null);
    this.hoverKey = null;
    this.renderer.domElement.style.cursor = 'grab';
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const factor = Math.exp(event.deltaY * 0.0011);
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * factor, 1.32, 4.2);
  };

  private updatePointer(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private pick(clientX: number, clientY: number): { kind: 'country' | 'province' | 'city'; id: string } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const cameraDirection = this.camera.position.clone().normalize();

    let bestCity: { id: string; distance: number } | null = null;
    for (const marker of this.cityMarkers) {
      if (marker.position.clone().normalize().dot(cameraDirection) < 0.1) continue;
      const projected = marker.position.clone().project(this.camera);
      const x = (projected.x * 0.5 + 0.5) * rect.width;
      const y = (-projected.y * 0.5 + 0.5) * rect.height;
      const distance = Math.hypot(x - (clientX - rect.left), y - (clientY - rect.top));
      if (distance < 9 && (!bestCity || distance < bestCity.distance)) {
        bestCity = { id: marker.id, distance };
      }
    }
    if (bestCity) return { kind: 'city', id: bestCity.id };

    this.updatePointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const provinceHits = this.raycaster.intersectObjects([...this.provinceMeshes.values()], false);
    for (const hit of provinceHits) {
      if (hit.point.clone().normalize().dot(cameraDirection) < 0.05) continue;
      const data = hit.object.userData as { kind: 'province'; id: string };
      return { kind: 'province', id: data.id };
    }
    const countryHits = this.raycaster.intersectObjects([...this.meshes.values()], false);
    for (const hit of countryHits) {
      if (hit.point.clone().normalize().dot(cameraDirection) < 0.05) continue;
      const data = hit.object.userData as { kind: 'country'; id: string };
      return { kind: 'country', id: data.id };
    }
    return null;
  }

  private updateHover(event: PointerEvent): void {
    const hit = this.pick(event.clientX, event.clientY);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const key = hit ? `${hit.kind}:${hit.id}` : null;
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.callbacks.onHover(hit ? { ...hit, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
  }

  private updateLabels(): void {
    if (!this.state?.showCities) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const cameraDirection = this.camera.position.clone().normalize();
    const focus = this.state.focusCountryId;
    const candidates = this.cityMarkers
      .filter((marker) => (focus ? marker.focused || marker.city.capital : marker.city.capital || marker.city.pop >= 8_000_000))
      .sort((a, b) => Number(b.city.capital) - Number(a.city.capital) || b.city.pop - a.city.pop)
      .slice(0, focus ? 14 : 10);
    const active = new Set<string>();
    for (const marker of candidates) {
      const normal = marker.position.clone().normalize();
      const visible = normal.dot(cameraDirection) > 0.22;
      if (!visible) continue;
      const projected = marker.position.clone().project(this.camera);
      const x = (projected.x * 0.5 + 0.5) * rect.width;
      const y = (-projected.y * 0.5 + 0.5) * rect.height;
      if (x < -20 || y < -20 || x > rect.width + 20 || y > rect.height + 20) continue;
      active.add(marker.id);
      let label = this.labels.get(marker.id);
      if (!label) {
        label = document.createElement('div');
        label.className = 'globe-label';
        label.innerHTML = `<i></i><span></span>`;
        if (marker.city.capital) label.classList.add('is-capital');
        if (marker.focused) label.classList.add('is-focus');
        this.labelLayer.appendChild(label);
        this.labels.set(marker.id, label);
      }
      const text = label.querySelector('span');
      if (text) text.textContent = cityLabel(marker.city.name);
      label.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
      label.style.opacity = String(marker.focused ? 1 : 0.72);
    }
    for (const [id, label] of this.labels) {
      if (!active.has(id)) {
        label.remove();
        this.labels.delete(id);
      }
    }
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const ease = 0.14;
    let lonDelta = this.targetLon - this.lon;
    while (lonDelta > 180) lonDelta -= 360;
    while (lonDelta < -180) lonDelta += 360;
    this.lon += lonDelta * ease;
    this.lat += (this.targetLat - this.lat) * ease;
    this.distance += (this.targetDistance - this.distance) * ease;
    this.applyCamera();
    this.updateLabels();
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
    disposeObject(this.scene);
    for (const geometry of this.outlineGeometries.values()) geometry.dispose();
    this.outlineGeometries.clear();
    this.cityTexture.dispose();
    this.renderer.dispose();
    canvas.remove();
    this.labelLayer.remove();
  }
}

export function countryColors(tiles: Record<string, Tile>, playerId: FactionId): Record<string, string> {
  return Object.fromEntries(Object.entries(tiles).map(([id, tile]) => [id, countryColor(tile, playerId).getStyle()]));
}
