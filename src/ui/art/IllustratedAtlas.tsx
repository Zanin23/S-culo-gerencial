import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  CITIES, GLOBAL_CITIES, PROVINCES, PROVINCE_BY_ID, cityById, citiesOf, detailCitiesIn, detailCitiesLoaded,
  sortedCities, type AtlasCity, type CountryDetail, type Shapes,
} from '../../game/atlas';
import { loadDetailCities, subscribeDetailCities } from '../../game/detailCities';
import { FACTIONS, TERRAIN } from '../../game/constants';
import { cityLabel } from '../../game/names';
import type { FactionId, TerrainKey, Tile } from '../../game/types';
import { cx } from '../primitives';

// ─────────────────────────────────────────────────────────────────────────────
// Atlas ilustrado: a carta central do jogo.
//
// Tinta sobre papel: o mar recebe hachura e rotas, a terra é lavada com a cor do
// terreno e coberta por padrões desenhados à mão (píncaros, pinheiros, dunas,
// ondas). Cada Casa pinta o território com um banho de cor e uma hachura; o
// jogador vê de imediato o que é seu, o que é reivindicável e onde há cidades.
// Navios, fumaça e bandeiras dão vida sem alterar nenhum dado do jogo.
// ─────────────────────────────────────────────────────────────────────────────

/** Papel, tinta e pigmentos da carta. */
const PAPER = '#efe2c4';
const PAPER_DEEP = '#e3d2ad';
const SEA = '#9dbfb4';
const SEA_DEEP = '#7ea79f';
const INK = '#3b3226';
const INK_SOFT = '#6c5f4a';

/** Terra por terreno — lavagens quentes e dessaturadas. */
/** Inclinação da hachura de cada Casa (uma por quadrante, sem ambiguidade). */
export const FACTION_HATCH_ANGLE: Record<string, number> = {
  concordia: 24,
  aurelia: 68,
  kestrel: 112,
  vantor: 156,
};

const LAND: Record<TerrainKey, { wash: string; shade: string; motif: string }> = {
  planicie: { wash: '#d3c480', shade: '#bfae6a', motif: '#a8934f' },
  floresta: { wash: '#8fae6f', shade: '#789a5b', motif: '#577a45' },
  colina: { wash: '#c9b172', shade: '#b2985a', motif: '#97794a' },
  montanha: { wash: '#b3a795', shade: '#9b8f7d', motif: '#7c7061' },
  costa: { wash: '#c2c483', shade: '#aab073', motif: '#8b9a5c' },
  deserto: { wash: '#dcc08a', shade: '#c7a86f', motif: '#ab8a55' },
  agua: { wash: SEA, shade: SEA_DEEP, motif: SEA_DEEP },
};

interface ViewBoxState {
  x: number;
  y: number;
  k: number;
}

export interface IllustratedAtlasProps {
  tiles: Record<string, Tile>;
  shapes: Record<string, Shapes>;
  detail: CountryDetail | null;
  focusCountryId: string | null;
  selectedCountryId: string | null;
  selectedProvinceId: string | null;
  selectedCityId: string | null;
  playerId: FactionId;
  claimable: Set<string>;
  showCities: boolean;
  reducedMotion?: boolean;
  onSelectCountry: (id: string, focus: boolean) => void;
  onSelectProvince: (id: string) => void;
  onSelectCity: (id: string) => void;
  /** Tooltip do mapa: país sob o ponteiro, em coordenadas do contêiner. */
  onHover?: (next: { kind: 'country'; id: string; x: number; y: number } | null) => void;
  onClear: () => void;
}

export interface IllustratedAtlasHandle {
  zoom: (factor: number) => void;
  reset: () => void;
}

const WORLD_W = 360;
const WORLD_H = 180;

function polygonPath(rings: number[][]): string {
  const parts: string[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      // Arredondar para 0,1° reduz ~20% do texto do path sem diferença visível
      // no mundo inteiro (1° ≈ 4 px na tela cheia).
      parts.push(`${i === 0 ? 'M' : 'L'}${(ring[i] + 180).toFixed(1)} ${(90 - ring[i + 1]).toFixed(1)}`);
    }
    parts.push('Z');
  }
  return parts.join(' ');
}

function shapesPath(shapes: Shapes): string {
  return shapes.map(polygonPath).join(' ');
}

function boundsOf(shapes: Shapes | undefined): { minLon: number; maxLon: number; minLat: number; maxLat: number } | null {
  if (!shapes?.length) return null;
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  for (const polygon of shapes) {
    const ring = polygon[0];
    for (let i = 0; i < ring.length; i += 2) {
      const lon = ring[i];
      const lat = ring[i + 1];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 4294967295;
}

// ── Padrões desenhados à mão ────────────────────────────────────────────────

function TerrainPattern({ id, terrain }: { id: string; terrain: TerrainKey }) {
  const tone = LAND[terrain];
  const paint = tone.motif;
  const common = { stroke: paint, strokeWidth: 0.36, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, opacity: 0.85 };
  switch (terrain) {
    case 'montanha':
      return (
        <pattern id={id} width={9} height={7.4} patternUnits="userSpaceOnUse">
          <rect width={9} height={7.4} fill={tone.wash} />
          <g {...common}>
            <path d="M0.7 6.4 3 2l2.3 4.4M1.5 4.9h3" />
            <path d="M5.4 6.7 7 3.6l1.6 3.1M5.9 5.7h2.2" opacity={0.75} />
          </g>
        </pattern>
      );
    case 'floresta':
      return (
        <pattern id={id} width={7.6} height={6.6} patternUnits="userSpaceOnUse">
          <rect width={7.6} height={6.6} fill={tone.wash} />
          <g {...common}>
            <path d="M2.4 5.6v.9M2.4 5.6 1.3 3.7h.8L1.2 2h.7L1.6 0.9h1.6L2.9 2h.7L2.9 3.7h.8L2.4 5.6" />
            <path d="M5.8 6.2v.6M5.8 6.2 5 4.8h.6L4.9 3.4h.5L5.2 2.4h1.2L6.1 3.4h.5L5.7 4.8h.6L5.8 6.2" opacity={0.72} />
          </g>
        </pattern>
      );
    case 'colina':
      return (
        <pattern id={id} width={8} height={6} patternUnits="userSpaceOnUse">
          <rect width={8} height={6} fill={tone.wash} />
          <g {...common}>
            <path d="M0.6 4.6c1-1.7 2.6-1.7 3.6 0" />
            <path d="M4.6 5.4c.9-1.5 2.3-1.5 3.2 0" opacity={0.72} />
            <path d="M1.8 3.2c.4-.6.9-.6 1.3 0" opacity={0.55} />
          </g>
        </pattern>
      );
    case 'deserto':
      return (
        <pattern id={id} width={9.4} height={5.6} patternUnits="userSpaceOnUse">
          <rect width={9.4} height={5.6} fill={tone.wash} />
          <g {...common} opacity={0.62}>
            <path d="M0.4 4.4c1.6-1.1 3.2-1.1 4.8 0M5.2 2.2c1-.7 2-.7 3 0" />
            <circle cx={7.6} cy={4.2} r={0.24} fill={paint} stroke="none" />
            <circle cx={2.2} cy={1.6} r={0.2} fill={paint} stroke="none" />
          </g>
        </pattern>
      );
    case 'costa':
      return (
        <pattern id={id} width={8} height={6} patternUnits="userSpaceOnUse">
          <rect width={8} height={6} fill={tone.wash} />
          <g {...common} opacity={0.5}>
            <path d="M0.5 4c.8-.9 1.6-.9 2.4 0s1.6.9 2.4 0 1.6-.9 2.4 0" />
            <path d="M1.4 1.8c.5-.5 1-.5 1.5 0" />
          </g>
        </pattern>
      );
    case 'planicie':
    default:
      return (
        <pattern id={id} width={8.4} height={6} patternUnits="userSpaceOnUse">
          <rect width={8.4} height={6} fill={tone.wash} />
          <g {...common} opacity={0.45}>
            <path d="M1 4.6V3.9M1.8 4.6V3.4M2.6 4.6V3.9" />
            <path d="M4.8 2.8V2.1M5.6 2.8V1.6M6.4 2.8V2.1" opacity={0.8} />
            <path d="M4 5.4h1.4" opacity={0.35} />
          </g>
        </pattern>
      );
  }
}

/** Mar: hachura larga, ondas e marcas de sondagem. */
function SeaPatterns() {
  return (
    <>
      <pattern id="atlas-sea-hatch" width={64} height={64} patternUnits="userSpaceOnUse">
        <g stroke={SEA_DEEP} strokeWidth={1} opacity={0.24} fill="none">
          <path d="M-10 18c10-7 20-7 30 0s20 7 30 0 20-7 30 0M-10 46c10-7 20-7 30 0s20 7 30 0 20-7 30 0" />
        </g>
      </pattern>
      <pattern id="atlas-sea-waves" width={90} height={90} patternUnits="userSpaceOnUse">
        <g stroke="#6d968e" strokeWidth={0.8} opacity={0.5} fill="none" strokeLinecap="round">
          <path d="M12 30c3-2.4 6-2.4 9 0s6 2.4 9 0" />
          <path d="M58 66c3-2.4 6-2.4 9 0s6 2.4 9 0" />
          <path d="M36 84c2.6-2 5.2-2 7.8 0" opacity={0.6} />
        </g>
      </pattern>
      <radialGradient id="atlas-sea-glow" cx="52%" cy="44%" r="72%">
        <stop offset="0%" stopColor="#b6d2c6" />
        <stop offset="58%" stopColor={SEA} />
        <stop offset="100%" stopColor="#82a89f" />
      </radialGradient>
    </>
  );
}

/** Banho de cor + hachura por Casa. */
function FactionPatterns() {
  return (
    <>
      {Object.values(FACTIONS).map((faction) => (
        <pattern
          key={faction.id}
          id={`atlas-hatch-${faction.id}`}
          width={3.6}
          height={3.6}
          patternUnits="userSpaceOnUse"
          /* Cada Casa tem inclinação própria: a presença continua legível sem cor. */
          patternTransform={`rotate(${FACTION_HATCH_ANGLE[faction.id] ?? 38})`}
        >
          <path d="M0 0v3.6" stroke={faction.color} strokeWidth={0.3} opacity={0.42} />
        </pattern>
      ))}
      <pattern id="atlas-claim" width={2.2} height={2.2} patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
        <path d="M0 0v2.2" stroke="#8a6a3a" strokeWidth={0.32} opacity={0.42} />
      </pattern>
      {/* Sem filtros SVG: sombra e brilho custam caro a cada quadro. */}
    </>
  );
}

// ── Cidades ilustradas ──────────────────────────────────────────────────────

function CityCluster({
  city,
  x,
  y,
  scale,
  tone,
  capital,
  selected,
  smoke,
  onClick,
}: {
  city: AtlasCity;
  x: number;
  y: number;
  scale: number;
  tone: string;
  capital: boolean;
  selected: boolean;
  smoke: boolean;
  onClick: () => void;
}) {
  const seed = hash(city.id);
  const s = scale * (capital ? 1.16 : 0.9 + (seed % 0.24));
  const buildings = capital ? 5 : 3;
  const roofs = ['#a5613f', '#8e5a44', '#6f6a5c', '#9a6a45', '#7d5540'];
  return (
    <g className={cx('atlas-city', capital && 'is-capital', selected && 'is-selected')} onClick={(event) => { event.stopPropagation(); onClick(); }}>
      <title>{`${cityLabel(city.name)} · ${Math.round(city.pop / 1000)} mil hab`}</title>
      {selected && <circle cx={x} cy={y} r={s * 13} className="atlas-city__ring" />}
      <ellipse cx={x} cy={y + s * 1.4} rx={s * (capital ? 10 : 7)} ry={s * 2.4} fill="#3b3226" opacity={0.18} />
      {Array.from({ length: buildings }).map((_, index) => {
        const offset = (index - (buildings - 1) / 2) * s * 4.2;
        const jitter = (hash(city.id + index) - 0.5) * s * 2;
        const width = s * (3.4 + (hash(city.id + 'w' + index) * 1.8));
        const height = s * (3 + hash(city.id + 'h' + index) * (capital ? 5.4 : 3.4));
        const px = x + offset + jitter;
        const py = y + (index % 2 === 0 ? 0 : s * 1.1);
        return (
          <g key={index}>
            <rect x={px - width / 2} y={py - height} width={width} height={height} fill={index % 3 === 0 ? '#e0d2b2' : '#d3c3a2'} stroke={INK} strokeWidth={s * 0.16} />
            <path d={`M${px - width / 2 - s * 0.5} ${py - height} ${px} ${py - height - s * 2} ${px + width / 2 + s * 0.5} ${py - height}Z`} fill={roofs[(index + Math.floor(seed * 5)) % roofs.length]} stroke={INK} strokeWidth={s * 0.15} strokeLinejoin="round" />
            {index % 2 === 0 && (
              <rect x={px - width * 0.18} y={py - height * 0.66} width={width * 0.22} height={height * 0.2} fill="#5f6f6a" opacity={0.75} />
            )}
            {index === 0 && capital && (
              <g className="atlas-flag">
                <path d={`M${px} ${py - height - s * 2}v${-s * 6}`} stroke={INK} strokeWidth={s * 0.24} strokeLinecap="round" />
                <path d={`M${px} ${py - height - s * 8}h${s * 4.2}l${-s * 1.2} ${s * 1.5} ${s * 1.2} ${s * 1.5}h${-s * 4.2}Z`} fill={tone} stroke={INK} strokeWidth={s * 0.18} strokeLinejoin="round" />
              </g>
            )}
          </g>
        );
      })}
      {smoke && (
        <g className="atlas-smoke" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <circle key={index} cx={x + scale * (3 + index * 0.7)} cy={y - scale * (5 + index * 1.6)} r={scale * (1.1 + index * 0.35)} style={{ animationDelay: `${index * 1.4}s` }} />
          ))}
        </g>
      )}
    </g>
  );
}

// ── Tráfego marítimo ───────────────────────────────────────────────────────

interface Lane {
  from: [number, number];
  to: [number, number];
  curve: number;
  speed: number;
  phase: number;
  tone: string;
}

/** Rotas em lon/lat, curvadas como arcos de navegação. */
const LANES: Lane[] = [
  { from: [-34, 40], to: [-8, 38], curve: -16, speed: 0.016, phase: 0.1, tone: '#f0e0bd' },
  { from: [-72, 18], to: [-24, 32], curve: -10, speed: 0.013, phase: 0.62, tone: '#efe0bd' },
  { from: [-14, 30], to: [14, 34], curve: 8, speed: 0.018, phase: 0.35, tone: '#e8d6b1' },
  { from: [64, 12], to: [104, 6], curve: -12, speed: 0.014, phase: 0.8, tone: '#efe0bd' },
  { from: [140, 34], to: [186, 40], curve: -14, speed: 0.012, phase: 0.2, tone: '#efe0bd' },
  { from: [-120, 34], to: [-92, 8], curve: 12, speed: 0.015, phase: 0.52, tone: '#efe0bd' },
  { from: [28, 44], to: [30, 34], curve: 6, speed: 0.024, phase: 0.75, tone: '#e8d6b1' },
];

function SeaTraffic({ animate, k }: { animate: boolean; k: number }) {
  const groupRef = useRef<SVGGElement | null>(null);
  const ships = useRef<Array<SVGGElement | null>>([]);

  // Posição inicial (sem animação) para o caso de render estático ou movimento
  // reduzido: barcos pequenos nas rotas, sem roubar a cena.
  const restPosition = (lane: Lane, k: number) => {
    const progress = lane.phase;
    const x1 = lane.from[0] + 180;
    const y1 = 90 - lane.from[1];
    const x2 = lane.to[0] + 180;
    const y2 = 90 - lane.to[1];
    const mx = (x1 + x2) / 2 + lane.curve;
    const my = (y1 + y2) / 2 - Math.abs(lane.curve) * 0.6;
    const a = (1 - progress) * (1 - progress);
    const b = 2 * (1 - progress) * progress;
    const c = progress * progress;
    return `translate(${(a * x1 + b * mx + c * x2).toFixed(2)} ${(a * y1 + b * my + c * y2).toFixed(2)}) scale(${(0.3 / Math.sqrt(k)).toFixed(4)})`;
  };

  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    let last = 0;
    const start = performance.now();
    const place = (now: number) => {
      frame = requestAnimationFrame(place);
      // ~20 fps: barcos lentos não precisam de 60 quadros por segundo, e cada
      // quadro obriga o SVG inteiro a repintar.
      if (now - last < 48) return;
      last = now;
      if (document.hidden) return;
      if (document.querySelector('.atlas-illustrated.is-panning')) return;
      const t = (now - start) / 1000;
      LANES.forEach((lane, index) => {
        const node = ships.current[index];
        if (!node) return;
        const progress = (lane.phase + t * lane.speed) % 1;
        const x1 = lane.from[0] + 180;
        const y1 = 90 - lane.from[1];
        const x2 = lane.to[0] + 180;
        const y2 = 90 - lane.to[1];
        const mx = (x1 + x2) / 2 + lane.curve;
        const my = (y1 + y2) / 2 - Math.abs(lane.curve) * 0.6;
        const a = (1 - progress) * (1 - progress);
        const b = 2 * (1 - progress) * progress;
        const c = progress * progress;
        const x = a * x1 + b * mx + c * x2;
        const y = a * y1 + b * my + c * y2;
        const dx = 2 * (1 - progress) * (mx - x1) + 2 * progress * (x2 - mx);
        const dy = 2 * (1 - progress) * (my - y1) + 2 * progress * (y2 - my);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const scale = (0.3 / Math.sqrt(k)).toFixed(4);
        node.setAttribute('transform', `translate(${x.toFixed(3)} ${y.toFixed(3)}) rotate(${angle.toFixed(1)}) scale(${scale})`);
        node.setAttribute('opacity', progress < 0.02 || progress > 0.98 ? '0' : '0.9');
      });
    };
    frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [animate, k]);

  return (
    <g ref={groupRef} className="atlas-traffic" aria-hidden="true">
      {LANES.map((lane, index) => {
        const x1 = lane.from[0] + 180;
        const y1 = 90 - lane.from[1];
        const x2 = lane.to[0] + 180;
        const y2 = 90 - lane.to[1];
        const mx = (x1 + x2) / 2 + lane.curve;
        const my = (y1 + y2) / 2 - Math.abs(lane.curve) * 0.6;
        return (
          <g key={index}>
            <path d={`M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`} className="atlas-route" fill="none" stroke="#4a7269" strokeOpacity={0.32} strokeWidth={0.5 / k} strokeDasharray={`${2.2 / k} ${2.6 / k}`} />
            <g ref={(node) => { ships.current[index] = node; }} transform={restPosition(lane, k)} opacity={0.85}>
              <path d="M-4.4 1.1h10.4l-2 3.2h-6.2Z" fill="#8a6a49" stroke={INK} strokeWidth={0.9} strokeLinejoin="round" />
              <path d="M0.4 1.1v-6.4M0.4 -5.3c2.6 1 4.2 2.2 4.8 4.2-1.8.8-3.4.6-4.8-.2Z" fill={lane.tone} stroke={INK} strokeWidth={0.8} />
              <path d="M-0.2 -5.3c-2.2.9-3.6 2-4.2 3.8 1.6.6 3 .4 4.2-.2Z" fill="#f2e6cd" stroke={INK} strokeWidth={0.7} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

// ── Rótulos, rosa dos ventos e cartela ─────────────────────────────────────

const SEA_LABELS: Array<{ name: string; lon: number; lat: number; rotate: number; size: number }> = [
  { name: 'Oceano Atlântico', lon: -32, lat: -8, rotate: -7, size: 3.4 },
  { name: 'Oceano Pacífico', lon: -146, lat: 12, rotate: -7, size: 3.6 },
  { name: 'Oceano Índico', lon: 82, lat: -26, rotate: 4, size: 3.2 },
  { name: 'Mar Mediterrâneo', lon: 17, lat: 34.4, rotate: 2, size: 2.0 },
];

function CompassRose() {
  return (
    <svg className="atlas-compass" viewBox="0 0 120 120" role="presentation" aria-hidden="true">
      <circle cx="60" cy="60" r="46" fill="#efe2c4" stroke={INK} strokeWidth="2" />
      <circle cx="60" cy="60" r="41" fill="none" stroke={INK} strokeWidth="0.8" opacity="0.5" />
      <circle cx="60" cy="60" r="30" fill="none" stroke={INK} strokeWidth="0.6" opacity="0.3" strokeDasharray="2 4" />
      {Array.from({ length: 16 }).map((_, index) => {
        const angle = (index / 16) * Math.PI * 2;
        const r1 = index % 4 === 0 ? 36 : 40;
        return (
          <line
            key={index}
            x1={60 + Math.cos(angle) * r1}
            y1={60 + Math.sin(angle) * r1}
            x2={60 + Math.cos(angle) * 45}
            y2={60 + Math.sin(angle) * 45}
            stroke={INK}
            strokeWidth={index % 4 === 0 ? 1.4 : 0.7}
            opacity={index % 4 === 0 ? 0.8 : 0.45}
          />
        );
      })}
      <path d="M60 14 66 54 60 60 54 54Z" fill="#b4553c" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
      <path d="M60 106 54 66 60 60 66 66Z" fill="#e0d2b0" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
      <path d="M14 60 54 54 60 60 54 66Z" fill="#e0d2b0" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
      <path d="M106 60 66 66 60 60 66 54Z" fill="#c9a15a" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
      <circle cx="60" cy="60" r="3.4" fill="#f6ecd4" stroke={INK} strokeWidth="1.2" />
      <text x="60" y="11" textAnchor="middle" className="atlas-compass__letter">N</text>
    </svg>
  );
}

// ── Tinta da terra: poucos caminhos mesclados ──────────────────────────────
//
// Antes cada país era um grupo com até sete caminhos: o mundo somava ~1.200
// <path> e 900 kB de marcação, reavaliados a cada evento de ponteiro. Agora a
// terra é "assada" em um caminho por terreno e um por Casa, e só a camada de
// clique continua país a país.

interface LandPaint {
  terrain: Array<{ key: TerrainKey; d: string }>;
  tint: Array<{ id: string; color: string; d: string; own: boolean }>;
  borders: string;
  claim: string;
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

function buildLand(
  paths: Record<string, string>,
  tiles: Record<string, Tile>,
  claimable: Set<string>,
  playerId: FactionId,
): LandPaint {
  const terrain = new Map<string, string[]>();
  const tint = new Map<string, string[]>();
  const borders: string[] = [];
  const claim: string[] = [];

  for (const iso in paths) {
    const tile = tiles[iso];
    if (!tile) continue;
    const d = paths[iso];
    push(terrain, tile.terrain === 'agua' ? 'planicie' : tile.terrain, d);
    borders.push(d);
    if (tile.owner) push(tint, tile.owner, d);
    if (claimable.has(iso)) claim.push(d);
  }

  const join = (list?: string[]) => (list && list.length ? list.join(' ') : '');
  return {
    terrain: [...terrain].map(([key, list]) => ({ key: key as TerrainKey, d: list.join(' ') })),
    tint: [...tint].map(([id, list]) => ({
      id,
      color: FACTIONS[id as FactionId]?.color ?? '#8a8a8a',
      d: list.join(' '),
      own: id === playerId,
    })),
    borders: join(borders),
    claim: join(claim),
  };
}

// ── Cache de geometria ─────────────────────────────────────────────────────
// A malha de 231 países é grande; converter para path e calcular caixas a cada
// montagem do atlas custava uma pausa visível ao voltar ao mapa.

const pathCache = new WeakMap<object, Record<string, string>>();
const boundsCache = new WeakMap<object, ReturnType<typeof boundsOf>>();

function pathsFor(shapes: Record<string, Shapes>): Record<string, string> {
  const cached = pathCache.get(shapes);
  if (cached) return cached;
  const built: Record<string, string> = {};
  for (const key in shapes) built[key] = shapesPath(shapes[key]);
  pathCache.set(shapes, built);
  return built;
}

/** Junta duas listas já ordenadas (capital, população) sem reordenar. */
function mergeCities(a: AtlasCity[], b: AtlasCity[]): AtlasCity[] {
  const out: AtlasCity[] = [];
  let i = 0;
  let j = 0;
  const before = (x: AtlasCity, y: AtlasCity) => (x.capital ? 1 : 0) - (y.capital ? 1 : 0) || x.pop - y.pop;
  while (i < a.length && j < b.length) {
    if (before(b[j], a[i]) > 0) out.push(a[i++]);
    else out.push(b[j++]);
  }
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}

function boundsFor(shapes: Shapes): ReturnType<typeof boundsOf> {
  const cached = boundsCache.get(shapes);
  if (cached !== undefined) return cached;
  const bounds = boundsOf(shapes);
  boundsCache.set(shapes, bounds);
  return bounds;
}

// ── Componente principal ───────────────────────────────────────────────────

export const IllustratedAtlas = forwardRef<IllustratedAtlasHandle, IllustratedAtlasProps>(function IllustratedAtlas({
  tiles,
  shapes,
  detail,
  focusCountryId,
  selectedCountryId,
  selectedProvinceId,
  selectedCityId,
  playerId,
  claimable,
  showCities,
  reducedMotion,
  onSelectCountry,
  onSelectProvince,
  onSelectCity,
  onHover,
  onClear,
}, ref) {
  // O viewBox vive num ref e é escrito direto no SVG: arrastar e aproximar não
  // disparam render do React. Um "commit" espaçado (110 ms) atualiza o que
  // depende da escala (rótulos, conjuntos urbanos, recorte por viewport).
  const live = useRef<ViewBoxState>({ x: 0, y: 0, k: 1 });
  const [, bump] = useReducer((tick: number) => tick + 1, 0);
  const [aspect, setAspect] = useState(16 / 9);
  const aspectRef = useRef(16 / 9);
  const hoveredIso = useRef<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; viewX: number; viewY: number; width: number; height: number; moved: boolean } | null>(null);
  const suppress = useRef(false);
  const commitTimer = useRef<number | null>(null);
  const frame = useRef(0);

  /** Geometria do viewBox para uma câmera — sempre dentro dos limites da carta. */
  const boxOf = (next: ViewBoxState) => {
    const k = Math.max(1, Math.min(11, next.k));
    const width = WORLD_W / k;
    const height = width / Math.max(0.4, aspectRef.current);
    return {
      k,
      width,
      height,
      x: Math.max(-WORLD_W * 0.25, Math.min(WORLD_W * 1.25 - width, next.x)),
      y: Math.max(-WORLD_H * 0.5, Math.min(WORLD_H * 1.5 - height, next.y)),
    };
  };

  /** Escreve a câmera no SVG; re-renderiza só quando o gesto assenta. */
  const paint = useCallback((next: ViewBoxState, immediate = false) => {
    const box = boxOf(next);
    live.current = { x: box.x, y: box.y, k: box.k };
    // Um único write por quadro: vários eventos de roda no mesmo frame viram um.
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      svgRef.current?.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
    });
    if (immediate) {
      if (commitTimer.current !== null) {
        window.clearTimeout(commitTimer.current);
        commitTimer.current = null;
      }
      wrapRef.current?.classList.remove('is-zooming', 'is-panning');
      bump();
      return;
    }
    // Só re-renderiza quando o gesto assenta: durante o zoom o React não entra.
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      wrapRef.current?.classList.remove('is-zooming');
      bump();
    }, 240);
  }, []);

  useEffect(() => () => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    if (frame.current) cancelAnimationFrame(frame.current);
  }, []);

  // Cidades de detalhe: o lote extra só é buscado quando faz diferença (zoom
  // próximo ou país em foco). Enquanto não chega, o mapa é o de sempre.
  const [detailReady, setDetailReady] = useState(detailCitiesLoaded);
  useEffect(() => subscribeDetailCities(() => setDetailReady(detailCitiesLoaded())), []);

  const paths = useMemo(() => pathsFor(shapes), [shapes]);
  const land = useMemo(() => buildLand(paths, tiles, claimable, playerId), [paths, tiles, claimable, playerId]);
  const view = live.current;
  const width = WORLD_W / view.k;
  const height = width / aspect;
  const unit = 1 / view.k;

  // O lote extra só é buscado quando faz diferença (zoom próximo ou país em
  // foco). Enquanto não chega, o mapa é o de sempre.
  useEffect(() => {
    if (detailReady || !showCities) return;
    if (focusCountryId || view.k >= 1.7) void loadDetailCities();
  }, [detailReady, focusCountryId, showCities, view.k]);

  const provincePaths = useMemo(() => {
    if (!detail) return [];
    return Object.entries(detail.provinces).map(([id, value]) => ({ id, d: shapesPath(value) }));
  }, [detail]);

  // Enquadra o país focado (ou volta ao mundo).
  useEffect(() => {
    if (!focusCountryId) {
      paint({ x: 0, y: 0, k: 1 }, true);
      return;
    }
    const box = boundsOf(detail?.country ?? shapes[focusCountryId]);
    if (!box) return;
    const spanLon = Math.max(2.4, box.maxLon - box.minLon);
    const spanLat = Math.max(2.0, box.maxLat - box.minLat);
    const k = Math.max(1, Math.min(9, Math.min(300 / spanLon, (300 / aspect) / spanLat) * 0.86));
    const centerLon = (box.minLon + box.maxLon) / 2 + 180;
    const centerLat = 90 - (box.minLat + box.maxLat) / 2;
    paint({
      k,
      x: centerLon - (WORLD_W / k) / 2,
      y: centerLat - (WORLD_W / k / aspect) / 2,
    }, true);
  }, [focusCountryId, detail, shapes, aspect, paint]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        aspectRef.current = rect.width / rect.height;
        setAspect(aspectRef.current);
      }
    };
    measure();
    // jsdom e navegadores antigos não trazem ResizeObserver: o atlas funciona
    // com a proporção padrão e o SVG continua preenchendo o contêiner.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    zoom: (factor: number) => {
      const current = live.current;
      const nextK = Math.max(1, Math.min(11, current.k * factor));
      const centerLon = current.x + WORLD_W / current.k / 2;
      const centerLat = current.y + WORLD_W / current.k / aspectRef.current / 2;
      paint({
        k: nextK,
        x: centerLon - WORLD_W / nextK / 2,
        y: centerLat - WORLD_W / nextK / aspectRef.current / 2,
      }, true);
    },
    reset: () => paint({ x: 0, y: 0, k: 1 }, true),
  }), [paint]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      viewX: live.current.x,
      viewY: live.current.y,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      moved: false,
    };
    suppress.current = false;
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      drag.moved = true;
      suppress.current = true;
    }
    if (!drag.moved) return;
    // Modo de gesto: alivia o que é caro repintar enquanto o dedo/mouse corre.
    wrapRef.current?.classList.add('is-panning');
    paint({
      k: live.current.k,
      x: drag.viewX - (dx / drag.width) * (WORLD_W / live.current.k),
      y: drag.viewY - (dy / drag.height) * (WORLD_W / live.current.k / aspectRef.current),
    });
  };

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (typeof event.currentTarget.hasPointerCapture === 'function' && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    window.setTimeout(() => { suppress.current = false; }, 30);
    wrapRef.current?.classList.remove('is-panning');
  };

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    let settle = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const wrap = wrapRef.current;
      if (wrap) {
        wrap.classList.add('is-panning');
        window.clearTimeout(settle);
        settle = window.setTimeout(() => wrap.classList.remove('is-panning'), 140);
      }
      const rect = node.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
      const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height)));
      const current = live.current;
      wrapRef.current?.classList.add('is-zooming');
      // Passo contínuo: trackpads manda deltas pequenos e não sofrem saltos.
      const factor = Math.exp(-event.deltaY * 0.0018);
      const nextK = Math.max(1, Math.min(11, current.k * Math.max(0.72, Math.min(1.38, factor))));
      const nodeWidth = WORLD_W / current.k;
      const nodeHeight = nodeWidth / aspectRef.current;
      const lon = current.x + px * nodeWidth;
      const lat = current.y + py * nodeHeight;
      const nextWidth = WORLD_W / nextK;
      paint({ k: nextK, x: lon - px * nextWidth, y: lat - py * (nextWidth / aspectRef.current) });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [paint]);

  /**
   * Tooltip: só avisa o mapa quando o ponteiro muda de país. O realce do
   * território é CSS puro, então mover o mouse não custa nenhum render.
   */
  const reportHover = (iso: string | null, event?: { clientX: number; clientY: number }) => {
    if (hoveredIso.current === iso) return;
    hoveredIso.current = iso;
    if (!onHover) return;
    if (!iso) {
      onHover(null);
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    onHover({
      kind: 'country',
      id: iso,
      x: Math.max(0, (event?.clientX ?? 0) - (rect?.left ?? 0)),
      y: Math.max(0, (event?.clientY ?? 0) - (rect?.top ?? 0)),
    });
  };

  // Cidades visíveis: prioriza capitais e população, descarta o que está fora.
  const cities = useMemo(() => {
    if (!showCities) return [];
    const margin = 24 / view.k;
    const minLon = view.x - margin;
    const maxLon = view.x + width + margin;
    const minLat = view.y - margin;
    const maxLat = view.y + height + margin;

    // Ordem de prioridade: capital primeiro, depois população. As listas já
    // vêm ordenadas; no mundo inteiro a base é só de capitais e metrópoles.
    let ranked: AtlasCity[];
    if (focusCountryId) {
      ranked = sortedCities(citiesOf(focusCountryId));
    } else if (detailReady && view.k > 2) {
      const extras = detailCitiesIn({
        minLon: minLon - 180, maxLon: maxLon - 180, minLat: 90 - maxLat, maxLat: 90 - minLat,
      });
      ranked = mergeCities(GLOBAL_CITIES, extras);
    } else {
      ranked = GLOBAL_CITIES;
    }

    const visible: AtlasCity[] = [];
    for (const city of ranked) {
      const x = city.lon + 180;
      const y = 90 - city.lat;
      if (x < minLon || x > maxLon || y < minLat || y > maxLat) continue;
      // No mundo inteiro só as capitais realmente grandes; o resto aparece
      // quando se aproxima. Menos pinos = carta mais legível.
      if (view.k < 1.7 && !focusCountryId) {
        if (!city.capital || city.pop <= 6_500_000) continue;
      }
      visible.push(city);
      if (visible.length >= 160) break;
    }
    // A cidade selecionada nunca desaparece, mesmo fora do recorte.
    if (selectedCityId && !visible.some((city) => city.id === selectedCityId)) {
      const chosen = cityById(selectedCityId);
      if (chosen) visible.unshift(chosen);
    }
    if (view.k > 1.9) return visible;
    // Despoluição: no mundo inteiro só um marcador a cada ~5 unidades.
    const thin: AtlasCity[] = [];
    for (const city of visible) {
      if (thin.some((other) => Math.abs(other.lon - city.lon) < 7.5 && Math.abs(other.lat - city.lat) < 4.6)) continue;
      thin.push(city);
      if (thin.length >= 34) break;
    }
    return thin;
  }, [detailReady, focusCountryId, selectedCityId, showCities, view.x, view.y, view.k, width, height]);

  const provinces = useMemo(() => {
    if (!focusCountryId) return [];
    return PROVINCES
      .filter((province) => province.countryId === focusCountryId)
      .sort((a, b) => b.pop - a.pop)
      .slice(0, 34);
  }, [focusCountryId]);

  const showClusters = view.k > 1.35;

  // Só os países que tocam a tela recebem área de clique: no zoom o mundo
  // inteiro sai do DOM e o ponteiro volta a responder na hora.
  const hitCountries = useMemo(() => {
    const keys = Object.keys(paths);
    if (view.k < 1.45) return keys;
    const padX = width * 0.3;
    const padY = height * 0.3;
    return keys.filter((iso) => {
      const bounds = boundsFor(shapes[iso]);
      if (!bounds) return false;
      return (
        bounds.maxLon + 180 > view.x - padX &&
        bounds.minLon + 180 < view.x + width + padX &&
        (90 - bounds.maxLat) < view.y + height + padY &&
        (90 - bounds.minLat) > view.y - padY
      );
    });
  }, [paths, shapes, view.x, view.y, view.k, width, height]);

  // Rótulos sem colisão: varre do mais importante para o menos, descartando o
  // que cairia perto de um rótulo já aceito. Evita a "sopa de nomes".
  const labelCities = useMemo(() => {
    // No mundo inteiro, só as maiores capitais nomeadas — o resto é ruído.
    if (view.k < 1.7 && !focusCountryId) {
      return cities.filter((city) => city.capital && city.pop > 9_000_000).slice(0, 7);
    }
    const pool = cities.filter((city) => city.capital || (view.k > 2.4 && city.pop > 4_000_000));
    const placed: Array<{ lon: number; lat: number }> = [];
    const spacing = 12.5 / Math.max(0.6, view.k * 0.75);
    const accepted: typeof pool = [];
    for (const city of pool) {
      const near = placed.some((other) => Math.abs(other.lon - city.lon) < spacing && Math.abs(other.lat - city.lat) < spacing * 0.55);
      if (near) continue;
      placed.push({ lon: city.lon, lat: city.lat });
      accepted.push(city);
      if (accepted.length >= 26) break;
    }
    return accepted;
  }, [cities, view.k]);

  return (
    <div ref={wrapRef} className={cx('atlas-illustrated', reducedMotion && 'is-still')}>
      <svg
        ref={svgRef}
        className="atlas-svg"
        viewBox={`${view.x} ${view.y} ${width} ${height}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={(event) => {
          if (suppress.current) return;
          if (event.target === event.currentTarget) onClear();
        }}
        role="group"
        aria-label="Atlas-múndi ilustrado e interativo"
      >
        <defs>
          <SeaPatterns />
          <FactionPatterns />
          {(Object.keys(LAND) as TerrainKey[]).filter((terrain) => terrain !== 'agua').map((terrain) => (
            <TerrainPattern key={terrain} id={`atlas-terrain-${terrain}`} terrain={terrain} />
          ))}
        </defs>

        {/* Mar: papel texturizado em CSS. Este retângulo é só a área clicável. */}
        <rect x={-400} y={-320} width={1300} height={900} fill="transparent" onClick={onClear} />

        {/* Graduação discreta: só os meridianos e paralelos de 30°. Fixa, para
            não ter de ser refeita a cada arrasto. */}
        <g className="atlas-graticule" pointerEvents="none">
          {Array.from({ length: 13 }).map((_, index) => {
            const x = index * 30;
            return <line key={`v${index}`} x1={x} x2={x} y1={-20} y2={200} />;
          })}
          {Array.from({ length: 7 }).map((_, index) => {
            const y = 90 - (index - 3) * 30;
            return <line key={`h${index}`} x1={-20} x2={380} y1={y} y2={y} />;
          })}
        </g>

        <g className="atlas-sealabels" pointerEvents="none">
          {SEA_LABELS.map((label) => (
            <text
              key={label.name}
              x={label.lon + 180}
              y={90 - label.lat}
              transform={`rotate(${label.rotate} ${label.lon + 180} ${90 - label.lat})`}
              fontSize={label.size * unit}
              letterSpacing={0.3 * unit}
              fill="#3f6a63"
              fillOpacity={0.55}
            >
              {label.name.toUpperCase()}
            </text>
          ))}
        </g>

        {/* Orla de areia: um único traço por baixo da terra. */}
        {land.borders && (
          <path
            className="atlas-shore"
            d={land.borders}
            fill="none"
            stroke="#e6d3ab"
            strokeOpacity={0.95}
            strokeWidth={6}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}

        <g className="atlas-land" pointerEvents="none">
          {land.terrain.map((entry) => (
            <path key={entry.key} data-terrain={entry.key} d={entry.d} fill={`url(#atlas-terrain-${entry.key})`} fillRule="evenodd" />
          ))}
          {land.tint.map((entry) => (
            <path key={`tint-${entry.id}`} d={entry.d} fill={entry.color} fillOpacity={entry.own ? 0.4 : 0.26} fillRule="evenodd" />
          ))}
          {land.tint.map((entry) => (
            <path
              key={`hatch-${entry.id}`}
              className="atlas-hatch"
              d={entry.d}
              fill={`url(#atlas-hatch-${entry.id})`}
              fillRule="evenodd"
              opacity={entry.own ? 0.7 : 0.32}
            />
          ))}
          {land.claim && (
            <path className="atlas-claim" d={land.claim} fill="url(#atlas-claim)" fillRule="evenodd" opacity={0.8} />
          )}
          <path
            d={land.borders}
            fill="none"
            stroke="#3f3323"
            strokeOpacity={0.45}
            strokeWidth={0.9}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {land.tint.map((entry) => (
            <path
              key={`stroke-${entry.id}`}
              d={entry.d}
              fill="none"
              stroke={entry.color}
              strokeOpacity={0.92}
              strokeWidth={2.2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        {/* Camada de clique: um caminho por país visível. */}
        <g className="atlas-hits">
          {hitCountries.map((iso) => (
            <path
              key={iso}
              d={paths[iso]}
              fill="transparent"
              fillRule="evenodd"
              className={cx('atlas-country', 'atlas-country__hit', iso === selectedCountryId && 'is-selected')}
              onClick={(event) => {
                if (suppress.current) return;
                event.stopPropagation();
                onSelectCountry(iso, false);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                onSelectCountry(iso, true);
              }}
              onPointerEnter={(event) => reportHover(iso, event)}
              onPointerLeave={(event) => {
                // Só limpa quando o ponteiro sai da carta (não ao trocar de país).
                const next = event.relatedTarget as Element | null;
                if (next?.classList?.contains('atlas-country__hit')) return;
                reportHover(null);
              }}
            />
          ))}
        </g>

        {/* Províncias do país em foco */}
        {provincePaths.length > 0 && (
          <g className="atlas-provinces">
            {provincePaths.map((province, index) => (
              <path
                key={province.id}
                d={province.d}
                fill={index % 2 === 0 ? '#f6ecd4' : '#e8d8b6'}
                fillOpacity={province.id === selectedProvinceId ? 0.4 : 0.16}
                stroke="#3f3323"
                strokeWidth={0.8}
                strokeDasharray="2.4 1.8"
                strokeOpacity={0.55}
                vectorEffect="non-scaling-stroke"
                className={cx('atlas-province', province.id === selectedProvinceId && 'is-selected')}
                onClick={(event) => {
                  if (suppress.current) return;
                  event.stopPropagation();
                  onSelectProvince(province.id);
                }}
              />
            ))}
          </g>
        )}

        {/* Cidades: pinos quando afastado, conjuntos ilustrados quando perto. */}
        <g className="atlas-cities">
          {cities.map((city) => {
            const x = city.lon + 180;
            const y = 90 - city.lat;
            const selected = city.id === selectedCityId;
            const owner = tiles[city.countryId]?.owner;
            const tone = owner ? FACTIONS[owner].color : '#7f8f86';
            if (!showClusters) {
              return (
                <g key={city.id} className={cx('atlas-pin', city.capital && 'is-capital', selected && 'is-selected')} onClick={(event) => { event.stopPropagation(); onSelectCity(city.id); }}>
                  <circle cx={x} cy={y} r={(city.capital ? 1.1 : 0.8) * unit} fill={city.capital ? '#b4553c' : '#4a3f30'} stroke="#f6ecd4" strokeWidth={0.4 * unit} />
                  <title>{cityLabel(city.name)}</title>
                </g>
              );
            }
            return (
              <CityCluster
                key={city.id}
                city={city}
                x={x}
                y={y}
                scale={unit}
                tone={tone}
                capital={Boolean(city.capital)}
                selected={selected}
                smoke={Boolean(city.capital) && city.pop > 4_000_000}
                onClick={() => onSelectCity(city.id)}
              />
            );
          })}
        </g>

        {/* Rótulos das cidades principais */}
        {showCities && (
          <g className="atlas-labels" pointerEvents="none">
            {labelCities.map((city) => (
              <text
                key={city.id}
                x={city.lon + 180}
                y={90 - city.lat - (showClusters ? 9 : 4.2) * unit}
                fontSize={(city.capital ? 4.1 : 3.5) * unit}
                textAnchor="middle"
                fill="#2f271c"
                stroke="#f6ecd4"
                strokeWidth={0.9 * unit}
                paintOrder="stroke"
                strokeLinejoin="round"
                letterSpacing={0.18 * unit}
                style={{ fontWeight: 650 }}
              >
                {cityLabel(city.name)}
              </text>
            ))}
          </g>
        )}

        {/* Destaque do território selecionado */}
        {selectedCountryId && paths[selectedCountryId] && (
          <g className="atlas-selection" pointerEvents="none">
            <path
              d={paths[selectedCountryId]}
              fill="none"
              stroke="#f6dca6"
              strokeOpacity={0.85}
              strokeWidth={2.6}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={paths[selectedCountryId]}
              fill="none"
              stroke="#7a4a1f"
              strokeOpacity={0.85}
              strokeWidth={1.1}
              strokeDasharray="3.2 2.4"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}

        <SeaTraffic animate={!reducedMotion} k={view.k} />
      </svg>
      <div className="atlas-paper" aria-hidden="true" />
      <CompassRose />
    </div>
  );
});
