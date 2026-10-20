import type { ReactNode } from 'react';
import type { ResourceKey, TerrainKey } from '../../game/types';

// ─────────────────────────────────────────────────────────────────────────────
// Conjunto de glifos ilustrados do jogo: traço de tinta, chapas chapadas e
// marca de guache. Todos desenhados à mão no mesmo grid de 32×32 para que
// recursos, terrenos e construções pareçam saídos do mesmo caderno.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#2a2118';
const CREAM = '#f6ecd4';

export interface GlyphProps {
  size?: number;
  className?: string;
  /** Glifos são decorativos por padrão; passe um título para anunciá-los. */
  title?: string;
}

function Svg({ size = 22, className, title, children }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {children}
    </svg>
  );
}

const stroke = { stroke: INK, strokeWidth: 1.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

function Coin({ x, y, tone }: { x: number; y: number; tone: string }) {
  return (
    <g>
      <ellipse cx={x} cy={y + 1.6} rx={6.1} ry={3.1} fill="#a97b36" />
      <ellipse cx={x} cy={y} rx={6.1} ry={3.1} fill={tone} {...stroke} strokeWidth={1.1} />
      <path d={`M${x - 2.3} ${y}h4.6M${x} ${y - 1.5}v3`} stroke={INK} strokeWidth={1} opacity={0.5} />
    </g>
  );
}

/** Ícones de recurso — usados na barra do topo, custos e mercado. */
export function ResourceGlyph({ resource, size, className }: GlyphProps & { resource: ResourceKey }) {
  switch (resource) {
    case 'creditos':
      return (
        <Svg size={size} className={className} title="Créditos">
          <Coin x={16} y={21} tone="#e8c37a" />
          <Coin x={16} y={17} tone="#f2d79b" />
          <Coin x={16} y={13} tone="#f7e3b4" />
          <path d="M16 3.4v5M13.4 6.1h5.2" stroke="#7b5a2b" strokeWidth={1.3} strokeLinecap="round" />
        </Svg>
      );
    case 'alimentos':
      return (
        <Svg size={size} className={className} title="Alimentos">
          <path d="M16 28V9" stroke="#6f7a3c" strokeWidth={2} strokeLinecap="round" />
          {[0, 1, 2, 3].map((index) => {
            const y = 11 + index * 4.2;
            return (
              <g key={index} {...stroke} strokeWidth={1.2}>
                <path d={`M16 ${y}c-3.2-2.4-5.4-1.9-6.6.3 1.9 1.9 4.4 1.7 6.6-.3Z`} fill="#d7b75e" />
                <path d={`M16 ${y}c3.2-2.4 5.4-1.9 6.6.3-1.9 1.9-4.4 1.7-6.6-.3Z`} fill="#c6a24b" />
              </g>
            );
          })}
          <path d="M16 9c-1.9-2.6-1.1-4.9 0-6 1.1 1.1 1.9 3.4 0 6Z" fill="#8fae5b" {...stroke} strokeWidth={1.1} />
        </Svg>
      );
    case 'energia':
      return (
        <Svg size={size} className={className} title="Energia">
          <path d="M18.6 3 9.4 17.4h5.2L13.2 29 23 14h-5.4L18.6 3Z" fill="#8fd7ea" {...stroke} />
          <path d="M18.6 3 9.4 17.4h5.2" stroke={CREAM} strokeWidth={1.2} strokeLinecap="round" opacity={0.85} />
          <path d="M5 24.5c1.6-1.4 3.2 1.4 4.8 0" stroke="#5f9fb3" strokeWidth={1.3} strokeLinecap="round" />
        </Svg>
      );
    case 'materias':
      return (
        <Svg size={size} className={className} title="Matérias-primas">
          <path d="M3.6 22.6 8 16.2l5 2.2-1 5.6-6.4.8Z" fill="#b98a63" {...stroke} strokeWidth={1.2} />
          <path d="M17.4 24.8 20 18.6l6.4 1.4.4 5.2-4.8 1.6Z" fill="#c99e77" {...stroke} strokeWidth={1.2} />
          <path d="M7.6 15.4 21.8 5.6" stroke="#6b4a2f" strokeWidth={2.6} strokeLinecap="round" />
          <path d="M18.4 12.2c4.6-4 8.4-3.2 9.6-1.4-2.4 3.4-6.2 3.6-9.6 1.4Z" fill="#8b9aa2" {...stroke} strokeWidth={1.1} />
          <path d="M7.4 15c-3.6-2-6.4-.6-6.9 1.3 2.2 2.1 4.9 1.6 6.9-1.3Z" fill="#9aa7ad" {...stroke} strokeWidth={1.1} />
        </Svg>
      );
    case 'bens':
      return (
        <Svg size={size} className={className} title="Bens industriais">
          <path d="M4.6 13.2 16 8l11.4 5.2v10.2L16 28.6 4.6 23.4V13.2Z" fill="#c3a5e2" {...stroke} strokeWidth={1.3} />
          <path d="M4.6 13.2 16 18.4l11.4-5.2M16 18.4v10.2" stroke={INK} strokeWidth={1.2} opacity={0.7} />
          <path d="M11.2 10.4 22.4 15.6" stroke={CREAM} strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
          <circle cx={16} cy={13.4} r={2.2} fill="#efe0ff" stroke={INK} strokeWidth={1.1} />
          <path d="M16 12v1.6l1.1.8" stroke={INK} strokeWidth={1} strokeLinecap="round" />
        </Svg>
      );
    case 'influencia':
      return (
        <Svg size={size} className={className} title="Influência">
          <path d="M5.4 26h21.2" stroke="#3f7f6d" strokeWidth={2.2} strokeLinecap="round" />
          <path d="M7 26V9.4l9-4.6 9 4.6V26" fill="#6fc3ad" {...stroke} strokeWidth={1.3} />
          <path d="M12.2 26v-7.4c0-2.6 1.7-4.2 3.8-4.2s3.8 1.6 3.8 4.2V26" fill={CREAM} stroke={INK} strokeWidth={1.2} />
          <circle cx={16} cy={9.2} r={1.5} fill="#2f7f6c" stroke={INK} strokeWidth={1} />
        </Svg>
      );
    case 'conhecimento':
      return (
        <Svg size={size} className={className} title="Conhecimento">
          <path d="M12 4.6h8v5.2l3.6 10.8c1 3-1.2 5.8-4.3 5.8h-6.6c-3.1 0-5.3-2.8-4.3-5.8L12 9.8V4.6Z" fill="#a9c2dd" {...stroke} strokeWidth={1.3} />
          <path d="M12 20.4c1.6-2 4.4 2 8-1.2l1.3 3.8c.4 1.5-.8 2.8-2.3 2.8h-6.1c-1.5 0-2.6-1.3-2.3-2.8l1.4-2.6Z" fill="#7fa8cf" stroke={INK} strokeWidth={1.1} />
          <path d="M12 4.6h8v2.2h-8z" fill={CREAM} stroke={INK} strokeWidth={1} />
          <circle cx={13.2} cy={21.6} r={0.85} fill={CREAM} />
          <circle cx={17.4} cy={24} r={0.7} fill={CREAM} />
        </Svg>
      );
    default:
      return null;
  }
}

/** Glifos de terreno: aparecem na legenda, no painel e nas fichas de país. */
export function TerrainGlyph({ terrain, size = 24, className }: GlyphProps & { terrain: TerrainKey }) {
  switch (terrain) {
    case 'montanha':
      return (
        <Svg size={size} className={className} title="Montanha">
          <path d="M2.6 26 12 7.4 18 18l3-4.6 8.4 12.6H2.6Z" fill="#8f8d92" {...stroke} />
          <path d="m9.4 12.4 2.6-5 3 5.6-2.6 1.4-3-2Z" fill={CREAM} opacity={0.9} />
          <path d="M12 7.4 18 18l-3.4 1.6L12 7.4Z" fill="#6f6e77" opacity={0.55} />
        </Svg>
      );
    case 'floresta':
      return (
        <Svg size={size} className={className} title="Floresta">
          {[
            [9, 7],
            [22, 10],
            [16, 20],
          ].map(([x, y], index) => (
            <g key={index}>
              <path d={`M${x} ${y + 17}v4`} stroke="#5a452c" strokeWidth={1.8} strokeLinecap="round" />
              <path d={`M${x} ${y}h0L${x + 6} ${y + 11}H${x + 3.4}L${x + 7.6} ${y + 17}H${x - 7.6}L${x - 3.4} ${y + 11}H${x - 6}L${x} ${y}Z`} fill={index === 2 ? '#4b6f4c' : '#5c8154'} {...stroke} strokeWidth={1.2} />
            </g>
          ))}
        </Svg>
      );
    case 'colina':
      return (
        <Svg size={size} className={className} title="Colina">
          <path d="M1.8 26c2.6-7 7-10.6 12-10.6S24.6 19 27.2 26H1.8Z" fill="#a89a6c" {...stroke} />
          <path d="M7 26c1.8-4.2 4.2-6.4 6.8-6.4S18.8 21.8 20.6 26H7Z" fill="#8a7d55" opacity={0.55} />
          <path d="M8.8 21.4c1.6-1 3-.4 3.8.8M19 22c1.4-.8 2.6-.4 3.4.6" stroke="#5f5636" strokeWidth={1.1} strokeLinecap="round" />
        </Svg>
      );
    case 'deserto':
      return (
        <Svg size={size} className={className} title="Deserto">
          <path d="M2 26c4-5 8-3.4 12-7.4s8-1.6 16 7.4H2Z" fill="#d9b77a" {...stroke} />
          <path d="M2 26c4.4-3.6 7.6-2.2 11.4-5.2" stroke="#a98a52" strokeWidth={1.2} strokeLinecap="round" />
          <circle cx={24} cy={8.4} r={3.4} fill="#e8cd93" stroke={INK} strokeWidth={1.2} />
          <path d="M24 2.4v1.6M24 12.8v1.6M18 8.4h1.6M28.4 8.4H30M19.8 4.2l1.1 1.1M27.1 11.5l1.1 1.1M28.2 4.2l-1.1 1.1M20.9 11.5l-1.1 1.1" stroke={INK} strokeWidth={1.1} strokeLinecap="round" />
        </Svg>
      );
    case 'costa':
      return (
        <Svg size={size} className={className} title="Costa">
          <path d="M2 20c3.6-4.8 8-6.8 12.6-6 3.4.6 6 3 9 3.4 2.4.4 4.6-.4 6.4-2V26c-6 2.6-11 2-16 .2C9.6 24.8 5.6 24.6 2 26v-6Z" fill="#7fb8b4" {...stroke} />
          <path d="M2 18.6c4.4-5.6 9-7.6 13.6-6.4" stroke={CREAM} strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />
          <path d="M20 6.6 22.6 3 25 6.6h-1.4l2 3.4h-7.2l2-3.4H20Z" fill={CREAM} stroke={INK} strokeWidth={1.1} />
        </Svg>
      );
    case 'agua':
    case 'planicie':
    default:
      return (
        <Svg size={size} className={className} title="Planície">
          <path d="M1.6 22.4c4-3.2 7.4-1.2 11.4-3.6s8-1 17.4 3.6v3.2H1.6v-3.2Z" fill="#93a86d" {...stroke} />
          <path d="M4 12.2c1.2-2.6 3.6-3.6 5.8-2.6M14 8.4c1.4-2.4 3.6-2 4.6-.2M23.6 12.6c1.2-2.2 3.2-2 4-.4" stroke="#6c8050" strokeWidth={1.3} strokeLinecap="round" />
          <path d="M6 18.6h4M18 17.4h5" stroke="#7d9257" strokeWidth={1.1} strokeLinecap="round" />
        </Svg>
      );
  }
}

/** Pequenas construções ilustradas para fichas, cartões e painéis. */
export function BuildingGlyph({ kind, size = 34, className }: GlyphProps & { kind: string }) {
  const base = (children: ReactNode, ground = true) => (
    <Svg size={size} className={className}>
      {ground && <ellipse cx={16} cy={28.4} rx={12} ry={2.4} fill="#3a2e20" opacity={0.18} />}
      {children}
    </Svg>
  );
  switch (kind) {
    case 'fazenda':
      return base(
        <>
          <path d="M3.4 24V16l8-5.4 8 5.4v8h-16Z" fill="#d8c79a" {...stroke} />
          <path d="M3.4 16 11.4 10.6 19.4 16h-16Z" fill="#a9613f" {...stroke} />
          <path d="M8.2 24v-4.4h3.6V24" fill="#7c5836" stroke={INK} strokeWidth={1.1} />
          <path d="M20 24v-6.6l4.2-2.8 4.2 2.8V24H20Z" fill="#c9b88d" {...stroke} strokeWidth={1.2} />
          <path d="M19.4 17.4 24.2 14l4.8 3.4" fill="#96603f" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
          <path d="M21.6 24v-3h3.2v3" fill="#6f5133" stroke={INK} strokeWidth={1} />
        </>,
      );
    case 'industria':
      return base(
        <>
          <path d="M4 25V14l6 3.4V14l6 3.4V14l6 3.4V25H4Z" fill="#b9a98c" {...stroke} />
          <path d="M9 10h3v6.4H9z" fill="#8a5a44" {...stroke} strokeWidth={1.1} />
          <path d="M17.4 8.6h2.6V14h-2.6z" fill="#8a5a44" {...stroke} strokeWidth={1.1} />
          <ellipse cx={10.6} cy={7} rx={2.2} ry={1.3} fill="#e6dcc8" opacity={0.8} />
          <ellipse cx={13} cy={4.4} rx={1.6} ry={1} fill="#e6dcc8" opacity={0.55} />
          <path d="M6.2 20.4h3.4v4.6H6.2zM18.2 19.8h3.6v5.2h-3.6z" fill="#6f7a72" stroke={INK} strokeWidth={1} />
        </>,
      );
    case 'usina':
      return base(
        <>
          <path d="M4 25V13.6l8.6-4.8 8.6 4.8V25H4Z" fill="#b7b29c" {...stroke} />
          <path d="M12.6 8.8V3.4" stroke="#7c7462" strokeWidth={1.8} strokeLinecap="round" />
          <path d="M8.4 10.6 12.6 6.4l4.2 4.2" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" fill="none" />
          <path d="M9.6 15.4h6v9.6h-6z" fill="#8fa9b0" stroke={INK} strokeWidth={1.1} />
          <path d="M10.6 17h2.2M10.6 19.4h2.2M10.6 21.8h2.2" stroke="#e7f0ef" strokeWidth={1} />
          <circle cx={21.6} cy={19.4} r={3.4} fill="#d8cbb0" {...stroke} strokeWidth={1.1} />
          <path d="M21.6 17.2v2.4l1.6 1" stroke={INK} strokeWidth={1} strokeLinecap="round" />
        </>,
      );
    case 'entreposto':
      return base(
        <>
          <path d="M4 25V13h17v12H4Z" fill="#c9b48c" {...stroke} />
          <path d="M3 13 12.5 6.4 22 13H3Z" fill="#8f6b44" {...stroke} />
          <path d="M7 25v-6.4h4.4V25M15 25v-4.6h3.2V25" fill="#6f5436" stroke={INK} strokeWidth={1} />
          <path d="M21 19h6.4v6H21z" fill="#b7a583" stroke={INK} strokeWidth={1.1} />
          <path d="M22.4 19v-2.4h3.2V19" stroke={INK} strokeWidth={1.1} fill="none" />
        </>,
      );
    case 'administrativo':
      return base(
        <>
          <path d="M6 25V12h20v13H6Z" fill="#ddd0b0" {...stroke} />
          <path d="M4.6 12 16 5l11.4 7H4.6Z" fill="#a9a08a" {...stroke} />
          <path d="M9 25v-6h3.4v6M19.4 25v-6h3.4v6M14 25v-8.6h3.8V25" fill="#7d725e" stroke={INK} strokeWidth={1} />
          <path d="M16 5V2.2" stroke={INK} strokeWidth={1.2} strokeLinecap="round" />
          <path d="M16 2.4h4.2l-1.2 1.6 1.2 1.6H16Z" fill="#b4553c" stroke={INK} strokeWidth={0.9} />
        </>,
      );
    case 'pesquisa':
      return base(
        <>
          <path d="M6 25V10.6h8.4V25H6Z" fill="#d6cbb3" {...stroke} />
          <path d="M9.4 15.4h1.8M9.4 18.2h1.8M9.4 21h1.8" stroke="#6d6454" strokeWidth={1} />
          <path d="M17.4 25V16h8.4v9h-8.4Z" fill="#c2cbbf" {...stroke} />
          <path d="M19.6 16v-3.4c0-2.4 1.4-4 3-4s3 1.6 3 4V16" stroke={INK} strokeWidth={1.2} fill="none" />
          <circle cx={18.4} cy={10} r={1.2} fill="#8fb0c9" />
          <circle cx={22.8} cy={12.4} r={0.9} fill="#8fb0c9" opacity={0.7} />
        </>,
      );
    case 'defesa':
      return base(
        <>
          <path d="M6 25V12l7-3.4V25H6Z" fill="#b6b4a6" {...stroke} />
          <path d="M6 12 13 8.6 20 12" stroke={INK} strokeWidth={1.2} fill="none" />
          <path d="M16 25V15.4l6.4-3.2V25H16Z" fill="#a9a89a" {...stroke} />
          <path d="M17.6 18h3.2M17.6 21h3.2" stroke="#5f6157" strokeWidth={1} />
          <path d="M4 25h24" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
          <path d="M12 5.4 14.6 3l2.6 2.4-2.6 2.4L12 5.4Z" fill="#b4553c" stroke={INK} strokeWidth={0.9} />
        </>,
      );
    case 'logistica':
      return base(
        <>
          <path d="M3.4 25h25" stroke="#7d6a4c" strokeWidth={2.2} strokeLinecap="round" />
          <path d="M5.4 21.4h7.2l4.4-4.6h7.6" stroke="#5c5344" strokeWidth={1.2} fill="none" strokeLinecap="round" />
          <path d="M11 25V13.4h9.4V25H11Z" fill="#c6bda9" {...stroke} />
          <path d="M13.4 16.4h4.6M13.4 19.4h4.6" stroke="#6d6454" strokeWidth={1.1} />
          <circle cx={8.4} cy={25} r={2.6} fill="#54483a" stroke={INK} strokeWidth={1.1} />
          <circle cx={22.4} cy={25} r={2.6} fill="#54483a" stroke={INK} strokeWidth={1.1} />
        </>,
      );
    default:
      return base(
        <>
          <path d="M9 25V14.4l7-4.2 7 4.2V25H9Z" fill="#d3c4a4" {...stroke} />
          <path d="M7.4 14.6 16 9l8.6 5.6H7.4Z" fill="#a4714c" {...stroke} />
          <path d="M14 25v-5.2h4V25" fill="#7c5836" stroke={INK} strokeWidth={1} />
        </>,
      );
  }
}

/** Selo de cera da Casa: usado em painéis, cartazes e no cabeçalho. */
export function WaxSeal({ size = 44, color = '#b4553c', letter = 'C', className }: GlyphProps & { color?: string; letter?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="presentation" aria-hidden="true">
      <path
        d="M24 4.6c5.2 0 8 3 11.6 4.4 3.6 1.4 7.8 2 8.4 6.6.6 4.6-2.4 6.6-1.6 10.6.8 4 4 6 2.8 9.6-1.2 3.6-5.4 3.4-8.6 5.6-3.2 2.2-5.6 6.4-10.2 6.4-4.6 0-7-4.2-10.2-6.4C12.6 40 8.4 40.2 7.2 36.6c-1.2-3.6 2-5.6 2.8-9.6.8-4-2.2-6-1.6-10.6.6-4.6 4.8-5.2 8.4-6.6C20.4 7.6 18.8 4.6 24 4.6Z"
        fill={color}
      />
      <path
        d="M24 8.2c4 0 6.4 2.4 9.2 3.6 2.8 1.2 5.8 1.6 6.2 5 .4 3.4-1.8 5-1.2 8 .6 3 3 4.6 2 7.2-.8 2.6-4.2 2.6-6.6 4.2-2.6 1.8-4.4 5-8 5s-5.4-3.2-8-5c-2.4-1.6-5.8-1.6-6.6-4.2-1-2.6 1.4-4.2 2-7.2.6-3-1.6-4.6-1.2-8 .4-3.4 3.4-3.8 6.2-5 2.8-1.2 5.2-3.6 9.2-3.6Z"
        fill="none"
        stroke="#000"
        strokeOpacity={0.22}
        strokeWidth={1.4}
      />
      <text x="24" y="30.5" textAnchor="middle" fontFamily="Spectral, Georgia, serif" fontSize="18" fill="#f6ecd4" opacity={0.92}>
        {letter}
      </text>
    </svg>
  );
}
