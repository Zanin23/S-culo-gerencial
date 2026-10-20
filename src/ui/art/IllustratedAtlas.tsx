import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { CITIES, GLOBAL_CITIES, PROVINCES, PROVINCE_BY_ID, type AtlasCity, type CountryDetail, type Shapes } from '../../game/atlas';
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
      parts.push(`${i === 0 ? 'M' : 'L'}${(ring[i] + 180).toFixed(2)} ${(90 - ring[i + 1]).toFixed(2)}`);
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
          width={6}
          height={6}
          patternUnits="userSpaceOnUse"
          /* Cada Casa tem inclinação própria: a soberania continua legível sem cor. */
          patternTransform={`rotate(${FACTION_HATCH_ANGLE[faction.id] ?? 38})`}
        >
          <path d="M0 0v6" stroke={faction.color} strokeWidth={0.85} opacity={0.55} />
        </pattern>
      ))}
      <pattern id="atlas-claim" width={11} height={11} patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
        <path d="M0 0v11" stroke="#c9a15a" strokeWidth={2.4} opacity={0.55} />
      </pattern>
      <filter id="atlas-paper-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0.9" dy="1.4" stdDeviation="0.9" floodColor="#2b2318" floodOpacity="0.35" />
      </filter>
      <filter id="atlas-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="1.6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
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
    const start = performance.now();
    const place = (now: number) => {
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
      frame = requestAnimationFrame(place);
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
  { name: 'Oceano Atlântico', lon: -31, lat: -6, rotate: -7, size: 3.6 },
  { name: 'Oceano Atlântico', lon: -38, lat: 47, rotate: -8, size: 2.8 },
  { name: 'Oceano Pacífico', lon: -143, lat: 16, rotate: -7, size: 3.8 },
  { name: 'Oceano Pacífico', lon: -154, lat: -28, rotate: -4, size: 3.2 },
  { name: 'Oceano Índico', lon: 84, lat: -28, rotate: 4, size: 3.4 },
  { name: 'Mar Mediterrâneo', lon: 17, lat: 34.2, rotate: 2, size: 2.2 },
  { name: 'Mar do Norte', lon: 3, lat: 57, rotate: 0, size: 1.9 },
  { name: 'Golfo do México', lon: -90, lat: 23.6, rotate: -5, size: 2.1 },
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
  onClear,
}, ref) {
  const [view, setView] = useState<ViewBoxState>({ x: 0, y: 0, k: 1 });
  const [aspect, setAspect] = useState(16 / 9);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; viewX: number; viewY: number; moved: boolean } | null>(null);
  const suppress = useRef(false);

  const width = WORLD_W / view.k;
  const height = width / aspect;
  const unit = 1 / view.k;

  const paths = useMemo(
    () => Object.fromEntries(Object.entries(shapes).map(([iso, value]) => [iso, shapesPath(value)])),
    [shapes],
  );

  const provincePaths = useMemo(() => {
    if (!detail) return [];
    return Object.entries(detail.provinces).map(([id, value]) => ({ id, d: shapesPath(value) }));
  }, [detail]);

  // Enquadra o país focado (ou volta ao mundo).
  useEffect(() => {
    if (!focusCountryId) {
      setView({ x: 0, y: 0, k: 1 });
      return;
    }
    const box = boundsOf(detail?.country ?? shapes[focusCountryId]);
    if (!box) return;
    const spanLon = Math.max(2.4, box.maxLon - box.minLon);
    const spanLat = Math.max(2.0, box.maxLat - box.minLat);
    const k = Math.max(1, Math.min(9, Math.min(300 / spanLon, (300 / aspect) / spanLat) * 0.86));
    const centerLon = (box.minLon + box.maxLon) / 2 + 180;
    const centerLat = 90 - (box.minLat + box.maxLat) / 2;
    setView({
      k,
      x: centerLon - (WORLD_W / k) / 2,
      y: centerLat - (WORLD_W / k / aspect) / 2,
    });
  }, [focusCountryId, detail, shapes, aspect]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setAspect(rect.width / rect.height);
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
    zoom: (factor: number) => setView((current) => {
      const k = Math.max(1, Math.min(11, current.k * factor));
      const centerLon = current.x + WORLD_W / current.k / 2;
      const centerLat = current.y + WORLD_W / current.k / aspect / 2;
      return {
        k,
        x: centerLon - WORLD_W / k / 2,
        y: centerLat - WORLD_W / k / aspect / 2,
      };
    }),
    reset: () => setView({ x: 0, y: 0, k: 1 }),
  }), [aspect]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y, moved: false };
    suppress.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
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
    const rect = event.currentTarget.getBoundingClientRect();
    setView((current) => ({
      ...current,
      x: drag.viewX - (dx / Math.max(1, rect.width)) * width,
      y: drag.viewY - (dy / Math.max(1, rect.height)) * height,
    }));
  };

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    window.setTimeout(() => { suppress.current = false; }, 30);
  };

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / Math.max(1, rect.width);
      const py = (event.clientY - rect.top) / Math.max(1, rect.height);
      setView((current) => {
        const factor = event.deltaY > 0 ? 0.86 : 1.16;
        const nextK = Math.max(1, Math.min(11, current.k * factor));
        const nodeWidth = WORLD_W / current.k;
        const nodeHeight = nodeWidth / aspect;
        const lon = current.x + px * nodeWidth;
        const lat = current.y + py * nodeHeight;
        const nextWidth = WORLD_W / nextK;
        return {
          k: nextK,
          x: lon - px * nextWidth,
          y: lat - py * (nextWidth / aspect),
        };
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [aspect]);

  // Cidades visíveis: prioriza capitais e população, descarta o que está fora.
  const cities = useMemo(() => {
    if (!showCities) return [];
    const pool = focusCountryId
      ? CITIES.filter((city) => city.countryId === focusCountryId)
      : GLOBAL_CITIES;
    const ranked = [...pool].sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0) || b.pop - a.pop);
    const margin = 20 * view.k;
    const minLon = view.x - margin;
    const maxLon = view.x + width + margin;
    const minLat = view.y - margin;
    const maxLat = view.y + height + margin;
    const visible = ranked.filter((city) => {
      const x = city.lon + 180;
      const y = 90 - city.lat;
      if (x < minLon || x > maxLon || y < minLat || y > maxLat) return false;
      // No mundo inteiro só entram capitais grandes e metrópoles; aproximando,
      // todas as cidades do país focado aparecem.
      if (view.k < 1.6 && !focusCountryId) return Boolean(city.capital) && city.pop > 2_600_000;
      return true;
    });
    // Despoluição: no mundo inteiro só um marcador a cada ~6 unidades.
    if (view.k > 1.9) return visible.slice(0, 160);
    const thin: typeof visible = [];
    for (const city of visible) {
      if (thin.some((other) => Math.abs(other.lon - city.lon) < 5.2 && Math.abs(other.lat - city.lat) < 3.4)) continue;
      thin.push(city);
      if (thin.length >= 62) break;
    }
    return thin;
  }, [focusCountryId, showCities, view.x, view.y, view.k, width, height]);

  const provinces = useMemo(() => {
    if (!focusCountryId) return [];
    return PROVINCES
      .filter((province) => province.countryId === focusCountryId)
      .sort((a, b) => b.pop - a.pop)
      .slice(0, 34);
  }, [focusCountryId]);

  const selectedBox = selectedCountryId ? boundsOf(shapes[selectedCountryId]) : null;
  const showClusters = view.k > 1.35;

  // Rótulos sem colisão: varre do mais importante para o menos, descartando o
  // que cairia perto de um rótulo já aceito. Evita a "sopa de nomes".
  const labelCities = useMemo(() => {
    const pool = cities.filter((city) => (city.capital && city.pop > 4_200_000) || (view.k > 2.2 && city.pop > 6_000_000));
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
          <linearGradient id="atlas-vignette" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b3226" stopOpacity="0.18" />
            <stop offset="16%" stopColor="#3b3226" stopOpacity="0" />
            <stop offset="84%" stopColor="#3b3226" stopOpacity="0" />
            <stop offset="100%" stopColor="#3b3226" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        <rect x={view.x} y={view.y} width={width} height={height} fill="url(#atlas-sea-glow)" onClick={onClear} />
        <rect x={view.x} y={view.y} width={width} height={height} fill="url(#atlas-sea-hatch)" pointerEvents="none" />
        <rect x={view.x} y={view.y} width={width} height={height} fill="url(#atlas-sea-waves)" pointerEvents="none" opacity={0.7} />

        {/* Linhas de rumo e graduação */}
        <g className="atlas-graticule" pointerEvents="none">
          {Array.from({ length: 8 }).map((_, index) => {
            const y = (index + 1) * 20;
            return <line key={`h${index}`} x1={view.x} x2={view.x + width} y1={y} y2={y} stroke="#5f8b83" strokeOpacity={0.3} strokeWidth={0.4} strokeDasharray="1 3" />;
          })}
          {Array.from({ length: 12 }).map((_, index) => {
            const x = (index + 1) * 30;
            return <line key={`v${index}`} x1={x} x2={x} y1={view.y} y2={view.y + height} stroke="#5f8b83" strokeOpacity={0.3} strokeWidth={0.4} strokeDasharray="1 3" />;
          })}
          {[0, 1, 2, 3].map((index) => {
            const x = 60 + index * 90;
            return <line key={`rh${index}`} x1={x} y1={view.y} x2={x + 40} y2={view.y + height} className="atlas-rhumb" stroke="#4f7b74" strokeOpacity={0.16} strokeWidth={0.5} />;
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

        {/* Sombra de papel: a terra parece recortada e colada sobre o mar. */}
        <g className="atlas-papercut" pointerEvents="none" transform={`translate(${(0.11 * unit).toFixed(3)} ${(0.26 * unit).toFixed(3)})`}>
          {Object.keys(shapes).map((iso) => (
            <path key={`cut-${iso}`} d={paths[iso]} fill="#3a2c1c" fillOpacity={0.28} fillRule="evenodd" />
          ))}
        </g>

        {/* Orla: halo de areia e espuma sob cada país antes da lavagem. */}
        <g className="atlas-shore" pointerEvents="none">
          {Object.keys(shapes).map((iso) => (
            <path key={`halo-${iso}`} d={paths[iso]} fill="none" stroke="#e8d6ae" strokeWidth={2.4 * unit} strokeOpacity={0.8} strokeLinejoin="round" fillRule="evenodd" />
          ))}
        </g>

        {/* Terra: cada país recebe o padrão do terreno e um banho de tinta da Casa. */}
        <g className="atlas-land">
          {Object.keys(shapes).map((iso) => {
            const tile = tiles[iso];
            if (!tile) return null;
            const owner = tile.owner;
            const faction = owner ? FACTIONS[owner] : null;
            const selected = iso === selectedCountryId;
            const claim = claimable.has(iso);
            const terrain = tile.terrain === 'agua' ? 'planicie' : tile.terrain;
            return (
              <g key={iso} className={cx('atlas-country', selected && 'is-selected', owner === playerId && 'is-own', claim && 'is-claimable')}>
                <path d={paths[iso]} fill={`url(#atlas-terrain-${terrain})`} fillRule="evenodd" stroke="none" pointerEvents="none" />
                {faction && (
                  <path d={paths[iso]} fill={faction.color} fillOpacity={owner === playerId ? 0.4 : 0.26} fillRule="evenodd" pointerEvents="none" />
                )}
                {faction && (
                  <path
                    d={paths[iso]}
                    fill={`url(#atlas-hatch-${faction.id})`}
                    fillRule="evenodd"
                    pointerEvents="none"
                    opacity={owner === playerId ? 0.8 : 0.42}
                  />
                )}
                {claim && (
                  <path className="atlas-claim" d={paths[iso]} fill="url(#atlas-claim)" fillRule="evenodd" pointerEvents="none" opacity={0.5} />
                )}
                {/* Contorno de tinta; quem tem dono ganha traço na cor da Casa. */}
                <path
                  d={paths[iso]}
                  fill="none"
                  fillRule="evenodd"
                  stroke="#3f3323"
                  strokeOpacity={0.45}
                  strokeWidth={0.45 * unit}
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
                {faction && (
                  <path
                    d={paths[iso]}
                    fill="none"
                    fillRule="evenodd"
                    stroke={faction.color}
                    strokeOpacity={0.92}
                    strokeWidth={1.0 * unit}
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                )}
                <path
                  d={paths[iso]}
                  fill="transparent"
                  fillRule="evenodd"
                  stroke="transparent"
                  strokeWidth={1.4 * unit}
                  className="atlas-country__hit"
                  onClick={(event) => {
                    if (suppress.current) return;
                    event.stopPropagation();
                    onSelectCountry(iso, false);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onSelectCountry(iso, true);
                  }}
                >
                  <title>{tile.name}</title>
                </path>
              </g>
            );
          })}
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
                strokeWidth={0.34 * unit}
                strokeDasharray={`${1.2 * unit} ${0.9 * unit}`}
                strokeOpacity={0.55}
                className={cx('atlas-province', province.id === selectedProvinceId && 'is-selected')}
                onClick={(event) => {
                  if (suppress.current) return;
                  event.stopPropagation();
                  onSelectProvince(province.id);
                }}
              >
                <title>{PROVINCE_BY_ID[province.id]?.name ?? province.id}</title>
              </path>
            ))}
          </g>
        )}

        {/* Motivos de terreno nas províncias em foco */}
        {provinces.length > 0 && (
          <g className="atlas-motifs" pointerEvents="none">
            {provinces.map((province, index) => {
              const terrain = tiles[province.countryId]?.terrain ?? 'planicie';
              const x = province.lon + 180;
              const y = 90 - province.lat;
              const scale = unit * (1.5 + hash(province.id) * 0.8);
              return (
                <g key={province.id} transform={`translate(${x} ${y}) scale(${scale})`} opacity={0.85}>
                  {terrain === 'montanha' ? (
                    <path d="M-6 2 -2-4 1 1 3-2 6 2Z" fill={LAND.montanha.motif} stroke={INK} strokeWidth={0.5} strokeLinejoin="round" />
                  ) : terrain === 'floresta' ? (
                    <g fill={LAND.floresta.motif} stroke={INK} strokeWidth={0.4}>
                      <path d="M-4 2 -2.6-1.6-1.2 2Z" />
                      <path d="M0 2 1.4-2 2.8 2Z" />
                      <path d="M3.6 2 4.8-0.6 6 2Z" />
                    </g>
                  ) : terrain === 'deserto' ? (
                    <path d="M-6 1.6c2.6-1.8 5.4-1.8 8 0M-1 3.4c2-1 3.8-1 5.6 0" fill="none" stroke={LAND.deserto.motif} strokeWidth={0.7} strokeLinecap="round" />
                  ) : (
                    <path d="M-4 2v-1.4M-2 2v-2.4M0 2v-1.2M2 2v-2M4 2v-1.6" stroke={LAND.colina.motif} strokeWidth={0.6} strokeLinecap="round" />
                  )}
                </g>
              );
            })}
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
                  <circle cx={x} cy={y} r={(city.capital ? 1.35 : 0.95) * unit} fill={city.capital ? '#b4553c' : '#4a3f30'} stroke="#f6ecd4" strokeWidth={0.5 * unit} />
                  {city.capital && <circle cx={x} cy={y} r={2.4 * unit} fill="none" stroke="#f6ecd4" strokeWidth={0.35 * unit} opacity={0.6} />}
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
        {selectedBox && (
          <g className="atlas-selection" pointerEvents="none">
            <path
              d={paths[selectedCountryId ?? '']}
              fill="none"
              stroke="#f6dca6"
              strokeOpacity={0.85}
              strokeWidth={2.6 * unit}
              strokeLinejoin="round"
              fillRule="evenodd"
            />
            <path
              d={paths[selectedCountryId ?? '']}
              fill="none"
              stroke="#7a4a1f"
              strokeOpacity={0.85}
              strokeWidth={0.75 * unit}
              strokeDasharray={`${2.6 * unit} ${2.0 * unit}`}
              strokeLinejoin="round"
              fillRule="evenodd"
            />

          </g>
        )}

        <SeaTraffic animate={!reducedMotion} k={view.k} />

        <rect x={view.x} y={view.y} width={width} height={height} fill="url(#atlas-vignette)" pointerEvents="none" />
      </svg>
      <div className="atlas-paper" aria-hidden="true" />
      <CompassRose />
      <div className="atlas-plate" aria-hidden="true">
        <span>Atlas de Téssera</span>
        <small>levantado sobre a Partilha</small>
      </div>
      <div className="atlas-scalebar" aria-hidden="true">
        <span>1 000 km</span>
        <i />
      </div>
    </div>
  );
});

