import { HQ_STAGES, SECTORS } from '../game/constants';
import type { SectorKey } from '../game/types';

// ─────────────────────────────────────────────────────────────────────────────
// Maquetes isométricas das unidades e da sede.
//
// O mesmo desenho acompanha a evolução comprada no painel: mais módulos,
// construção mais alta, anexos do ramo de negócio e a sede vira torre. É SVG
// puro — nenhum WebGL, nenhum canvas e nenhum estado.
// ─────────────────────────────────────────────────────────────────────────────

const ISO_X = Math.sqrt(3) / 2;
const SCALE = 1.24;
const OX = 120;
const OY = 114;

type Pt = { x: number; y: number };

function project(x: number, y: number, z: number): Pt {
  return {
    x: OX + (x - y) * ISO_X * SCALE,
    y: OY + (x + y) * 0.5 * SCALE - z * SCALE,
  };
}

const path = (points: Pt[]) => points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ') + 'Z';

function shade(hex: string, amount: number): string {
  const value = parseInt(hex.replace('#', ''), 16);
  const channel = (shift: number) => {
    const base = (value >> shift) & 255;
    return Math.max(0, Math.min(255, Math.round(base + amount * 255)));
  };
  return `rgb(${channel(16)} ${channel(8)} ${channel(0)})`;
}

interface BoxGeometry {
  cx: number;
  cy: number;
  w: number;
  d: number;
  h: number;
  z?: number;
}

function faces({ cx, cy, w, d, h, z = 0 }: BoxGeometry) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - d / 2;
  const y1 = cy + d / 2;
  return {
    top: [project(x0, y0, z + h), project(x1, y0, z + h), project(x1, y1, z + h), project(x0, y1, z + h)],
    right: [project(x1, y0, z + h), project(x1, y1, z + h), project(x1, y1, z), project(x1, y0, z)],
    left: [project(x0, y1, z + h), project(x1, y1, z + h), project(x1, y1, z), project(x0, y1, z)],
    depth: cx + cy,
  };
}

interface BoxProps {
  /** Cor da face superior. */
  top: string;
  /** Cor da face frontal direita. */
  right: string;
  /** Cor da face frontal esquerda. */
  left: string;
  stroke?: string;
  opacity?: number;
}

/** Uma caixa isométrica com as três faces visíveis. */
function IsoBox({ cx, cy, w, d, h, z = 0, top, right, left, stroke = 'rgba(40, 34, 24, 0.35)', opacity = 1 }: BoxGeometry & BoxProps) {
  const geometry = faces({ cx, cy, w, d, h, z });
  return (
    <g opacity={opacity}>
      <path d={path(geometry.left)} fill={left} stroke={stroke} strokeWidth={0.6} strokeLinejoin="round" />
      <path d={path(geometry.right)} fill={right} stroke={stroke} strokeWidth={0.6} strokeLinejoin="round" />
      <path d={path(geometry.top)} fill={top} stroke={stroke} strokeWidth={0.6} strokeLinejoin="round" />
    </g>
  );
}

/** Silo cilíndrico visto em perspectiva. */
function IsoSilo({ cx, cy, r, h, z = 0, color }: { cx: number; cy: number; r: number; h: number; z?: number; color: string }) {
  const top = project(cx, cy, z + h);
  const bottom = project(cx, cy, z);
  return (
    <g>
      <rect
        x={top.x - r * ISO_X * SCALE * 2}
        y={top.y}
        width={r * ISO_X * SCALE * 4}
        height={bottom.y - top.y}
        fill={shade(color, -0.22)}
        stroke="rgba(40, 34, 24, 0.35)"
        strokeWidth={0.6}
      />
      <ellipse cx={top.x} cy={top.y} rx={r * ISO_X * SCALE * 2} ry={r * 0.5 * SCALE * 2} fill={shade(color, 0.16)} stroke="rgba(40, 34, 24, 0.35)" strokeWidth={0.6} />
      <rect x={top.x - r * ISO_X * SCALE * 2} y={top.y + (bottom.y - top.y) * 0.45} width={r * ISO_X * SCALE * 4} height={1.2} fill="rgba(40, 34, 24, 0.18)" />
    </g>
  );
}

/** Pequeno guindaste de pátio para o porto. */
function IsoCrane({ cx, cy, height, color }: { cx: number; cy: number; height: number; color: string }) {
  const base = project(cx, cy, 0);
  const top = project(cx, cy, height);
  const jibEnd = project(cx + 13, cy - 5, height);
  return (
    <g stroke={shade(color, -0.1)} strokeWidth={1.6} strokeLinecap="round" fill="none">
      <line x1={base.x} y1={base.y} x2={top.x} y2={top.y} />
      <line x1={top.x} y1={top.y} x2={jibEnd.x} y2={jibEnd.y} />
      <line x1={top.x} y1={top.y - 5} x2={top.x - 6} y2={top.y + 8} />
      <line x1={jibEnd.x} y1={jibEnd.y} x2={jibEnd.x} y2={jibEnd.y + 12} strokeWidth={0.9} />
    </g>
  );
}

/** Carros minúsculos para a fábrica de automóveis. */
function IsoCar({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return <IsoBox cx={cx} cy={cy} w={5} d={3} h={1.8} top={shade(color, 0.2)} right={shade(color, -0.1)} left={shade(color, -0.3)} />;
}

const WALL = {
  top: '#ded8c8',
  right: '#bdb6a5',
  left: '#9c9585',
};

const HEIGHTS = [7, 13, 21, 30];

export interface UnitBlueprintProps {
  sector: SectorKey;
  units: number;
  build: number;
  range: number;
  className?: string;
}

/** Maquete da unidade: módulos, altura construída e anexos do ramo. */
export function UnitBlueprint({ sector, units, build, range, className }: UnitBlueprintProps) {
  const def = SECTORS[sector];
  const accent = def.color;
  const modules = Math.max(1, Math.min(3, Math.round(units)));
  const level = Math.max(0, Math.min(3, Math.round(build)));
  const lines = Math.max(0, Math.min(3, Math.round(range)));
  const width = 12;
  const depth = 9.5;
  const height = HEIGHTS[level];
  const spacing = width + 3.4;
  const startX = -((modules - 1) * spacing) / 2;
  const objects: Array<{ depth: number; node: React.ReactNode }> = [];

  // Plateia do lote.
  const plate = project(0, 0, 0);
  const ground = [
    project(-36, -26, 0), project(36, -26, 0), project(36, 26, 0), project(-36, 26, 0),
  ];
  objects.push({
    depth: -1000,
    node: (
      <g key="ground">
        <path d={path(ground)} fill="rgba(216, 180, 106, 0.1)" stroke="rgba(216, 180, 106, 0.45)" strokeWidth={0.8} strokeDasharray={level < 3 ? '3 3' : undefined} />
        <ellipse cx={plate.x} cy={plate.y + 5} rx={44} ry={13} fill="rgba(20, 26, 22, 0.18)" />
      </g>
    ),
  });

  // Módulos: a unidade nasce com um bloco pequeno e cresce em número e altura.
  for (let index = 0; index < modules; index += 1) {
    const cx = startX + index * spacing;
    const variation = index % 2 === 0 ? 0 : 1.6;
    objects.push({
      depth: cx + 0,
      node: (
        <g key={`module-${index}`}>
          <IsoBox
            cx={cx}
            cy={0}
            w={width}
            d={depth}
            h={height + variation}
            top={WALL.top}
            right={WALL.right}
            left={WALL.left}
          />
          {/* Faixa da linha de negócio no topo da fachada. */}
          <path
            d={path([
              project(cx + width / 2, -depth / 2, height + variation - 1.5),
              project(cx + width / 2, depth / 2, height + variation - 1.5),
              project(cx + width / 2, depth / 2, height + variation - 3.4),
              project(cx + width / 2, -depth / 2, height + variation - 3.4),
            ])}
            fill={accent}
            opacity={0.9}
          />
          {/* Janelas: linhas horizontais nas duas faces. */}
          {Array.from({ length: Math.min(4, Math.floor((height + variation) / 6)) }).map((_, row) => {
            const z = 3.6 + row * 5.2;
            if (z > height + variation - 4) return null;
            return (
              <g key={`windows-${index}-${row}`} stroke="rgba(58, 52, 42, 0.32)" strokeWidth={0.7} fill="none">
                <line x1={project(cx + width / 2, -depth / 2, z).x} y1={project(cx + width / 2, -depth / 2, z).y} x2={project(cx + width / 2, depth / 2, z).x} y2={project(cx + width / 2, depth / 2, z).y} />
                <line x1={project(cx - width / 2, depth / 2, z).x} y1={project(cx - width / 2, depth / 2, z).y} x2={project(cx + width / 2, depth / 2, z).x} y2={project(cx + width / 2, depth / 2, z).y} />
              </g>
            );
          })}
          {/* Cobertura técnica: pequeno volume e antena quando a unidade cresce. */}
          {level >= 2 ? (
            <IsoBox cx={cx - 1.5} cy={-1} w={4.5} d={4} h={2.4} z={height + variation} top={shade(accent, 0.12)} right={shade(accent, -0.12)} left={shade(accent, -0.32)} />
          ) : null}
          {level >= 3 ? (
            <line
              x1={project(cx - 1.5, -1, height + variation + 2.4).x}
              y1={project(cx - 1.5, -1, height + variation + 2.4).y}
              x2={project(cx - 1.5, -1, height + variation + 8).x}
              y2={project(cx - 1.5, -1, height + variation + 8).y}
              stroke="rgba(58, 52, 42, 0.7)"
              strokeWidth={1}
            />
          ) : null}
        </g>
      ),
    });
  }

  // ── Anexos do ramo de negócio ──────────────────────────────────────────
  if (sector === 'fazenda') {
    for (let index = 0; index < 1 + lines; index += 1) {
      const cx = 20 + index * 6;
      const cy = -16 - index * 2;
      objects.push({ depth: cx + cy - 40, node: <IsoSilo key={`silo-${index}`} cx={cx} cy={cy} r={2.6} h={12 + index * 2} color={accent} /> });
    }
  }
  if (sector === 'porto') {
    objects.push({
      depth: -10,
      node: (
        <g key="porto">
          <IsoCrane cx={21} cy={-14} height={24} color={accent} />
          {/* Contêineres empilhados: cada expansão acrescenta uma pilha. */}
          {Array.from({ length: 1 + lines }).map((_, index) => (
            <IsoBox
              key={`container-${index}`}
              cx={14 + index * 7}
              cy={16 + (index % 2) * 2.4}
              w={6}
              d={3.4}
              h={2.6}
              z={(index % 3) * 0.6}
              top={shade(accent, 0.2)}
              right={shade(accent, -0.08)}
              left={shade(accent, -0.3)}
            />
          ))}
        </g>
      ),
    });
  }
  if (sector === 'varejo') {
    objects.push({
      depth: 40,
      node: (
        <g key="varejo">
          {Array.from({ length: 1 + lines }).map((_, index) => (
            <IsoBox
              key={`awning-${index}`}
              cx={startX + (index % modules) * spacing}
              cy={depth / 2 + 1.4}
              w={width * 0.9}
              d={1.8}
              h={0.7}
              z={4.4}
              top={shade(accent, 0.24)}
              right={shade(accent, -0.05)}
              left={shade(accent, -0.26)}
            />
          ))}
        </g>
      ),
    });
  }
  if (sector === 'industria') {
    for (let index = 0; index < 1 + lines; index += 1) {
      const cx = 22 + index * 5;
      const cy = -13 + index * 4;
      const h = 22 + index * 4;
      objects.push({
        depth: cx + cy - 20,
        node: (
          <g key={`chimney-${index}`}>
            <IsoBox cx={cx} cy={cy} w={2.8} d={2.8} h={h} top={shade(accent, 0.1)} right={shade(accent, -0.25)} left={shade(accent, -0.4)} />
            <ellipse cx={project(cx, cy, h + 2).x} cy={project(cx, cy, h + 2).y} rx={2.6} ry={1.3} fill="rgba(240, 238, 229, 0.5)" />
            <ellipse cx={project(cx + 2, cy - 1, h + 5).x} cy={project(cx + 2, cy - 1, h + 5).y} rx={3.2} ry={1.5} fill="rgba(240, 238, 229, 0.32)" />
          </g>
        ),
      });
    }
  }
  if (sector === 'fabrica') {
    objects.push({
      depth: 60,
      node: (
        <g key="fabrica">
          {/* Pátio de veículos: a plataforma cresce com o ramo. */}
          {Array.from({ length: 2 + lines * 2 }).map((_, index) => (
            <IsoCar key={`car-${index}`} cx={-20 + index * 6.4} cy={19 + (index % 2) * 3.6} color={index % 3 === 0 ? accent : index % 3 === 1 ? '#d8d2c4' : '#7f8b98'} />
          ))}
        </g>
      ),
    });
  }
  if (sector === 'financas') {
    objects.push({
      depth: 30,
      node: (
        <g key="financas">
          {/* Fachada de vidro: mais linhas verticais a cada expansão. */}
          {Array.from({ length: 2 + lines }).map((_, index) => {
            const x = startX - width / 2 + 2 + index * 3.2;
            const a = project(x, depth / 2, height + 0.4);
            const b = project(x, depth / 2, 2);
            return <line key={`glass-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={shade(accent, 0.28)} strokeWidth={1.2} opacity={0.8} />;
          })}
          <line
            x1={project(20, 20, 0).x}
            y1={project(20, 20, 0).y}
            x2={project(20, 20, 14 + lines * 3).x}
            y2={project(20, 20, 14 + lines * 3).y}
            stroke={shade(accent, -0.1)}
            strokeWidth={1.4}
          />
        </g>
      ),
    });
  }

  objects.sort((a, b) => a.depth - b.depth);

  return (
    <svg
      className={`unit-blueprint${className ? ` ${className}` : ''}`}
      viewBox="0 0 240 176"
      role="img"
      aria-label={`Maquete de ${def.name.toLowerCase()} com ${modules} módulo${modules > 1 ? 's' : ''}, construção nível ${level + 1} e ramo nível ${lines + 1}`}
    >
      {objects.map((object) => object.node)}
    </svg>
  );
}

const HQ_HEIGHT = [12, 26, 46, 64];

/** Maquete da sede: escritório compacto → complexo matriz. */
export function HqBlueprint({ stage, className }: { stage: number; className?: string }) {
  const level = Math.max(0, Math.min(3, Math.round(stage)));
  const stageDef = HQ_STAGES[level];
  const objects: Array<{ depth: number; node: React.ReactNode }> = [];
  const ground = [project(-40, -28, 0), project(40, -28, 0), project(40, 28, 0), project(-40, 28, 0)];

  objects.push({
    depth: -1000,
    node: (
      <g key="plaza">
        <path d={path(ground)} fill="rgba(216, 180, 106, 0.12)" stroke="rgba(216, 180, 106, 0.5)" strokeWidth={0.9} />
        {/* Jardins e caminho de entrada. */}
        <path d={path([project(-30, 8, 0), project(-16, 8, 0), project(-16, 22, 0), project(-30, 22, 0)])} fill="rgba(92, 138, 96, 0.55)" />
        <path d={path([project(16, 8, 0), project(30, 8, 0), project(30, 22, 0), project(16, 22, 0)])} fill="rgba(92, 138, 96, 0.42)" />
        <path d={path([project(-6, 16, 0), project(8, 10, 0), project(8, 24, 0), project(-6, 30, 0)])} fill="rgba(220, 212, 194, 0.28)" />
      </g>
    ),
  });

  if (level === 0) {
    // Primeiro endereço: um sobrado pequeno com toldo e placa.
    objects.push({
      depth: 0,
      node: (
        <g key="kiosk">
          <IsoBox cx={-2} cy={0} w={17} d={13} h={HQ_HEIGHT[0]} top={WALL.top} right={WALL.right} left={WALL.left} />
          <IsoBox cx={-2} cy={0} w={19} d={14.5} h={1.1} z={0} top="#8d6b3c" right="#7a5a31" left="#664a27" />
          <IsoBox cx={-2} cy={7.6} w={15} d={1.8} h={0.7} z={4.2} top="#c9a24a" right="#a9863a" left="#8b6c2e" />
          <IsoBox cx={-2} cy={0} w={6} d={4} h={2.2} z={HQ_HEIGHT[0]} top="#cbbfa6" right="#b3a68c" left="#968a72" />
        </g>
      ),
    });
  } else {
    const towerHeight = HQ_HEIGHT[level];
    const towerWidth = level >= 2 ? 24 : 20;
    const towerDepth = level >= 2 ? 18 : 16;
    const podiumHeight = 4 + level * 1.6;
    objects.push({
      depth: 0,
      node: (
        <g key="tower">
          {/* Pódio de recepção. */}
          <IsoBox cx={0} cy={2} w={34} d={24} h={podiumHeight} top="#cfc7b4" right="#b1a894" left="#948b78" />
          {/* Torre com faixas de vidro. */}
          <IsoBox
            cx={0}
            cy={-1}
            w={towerWidth}
            d={towerDepth}
            h={towerHeight}
            z={podiumHeight}
            top="#d6cfbd"
            right="#9fb9bd"
            left="#7d999e"
          />
          {Array.from({ length: 3 + level * 2 }).map((_, index) => {
            const z = podiumHeight + 3 + index * ((towerHeight - 4) / (3 + level * 2));
            const a = project(towerWidth / 2, -towerDepth / 2, z);
            const b = project(towerWidth / 2, towerDepth / 2, z);
            return <line key={`floor-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(48, 58, 58, 0.28)" strokeWidth={0.7} />;
          })}
          {/* Coroamento e heliponto no topo. */}
          {level >= 2 ? (
            <IsoBox
              cx={0}
              cy={-1}
              w={towerWidth * 0.62}
              d={towerDepth * 0.62}
              h={4}
              z={podiumHeight + towerHeight}
              top="#c9a24a"
              right="#ad8738"
              left="#8d6b2c"
            />
          ) : null}
          {level >= 3 ? (
            <ellipse
              cx={project(0, -1, podiumHeight + towerHeight + 4.6).x}
              cy={project(0, -1, podiumHeight + towerHeight + 4.6).y}
              rx={9}
              ry={4.6}
              fill="#2f3436"
              stroke="rgba(216, 180, 106, 0.75)"
              strokeWidth={1}
            />
          ) : null}
          {level >= 1 ? (
            <line
              x1={project(-towerWidth / 2 + 2, -towerDepth / 2, podiumHeight + towerHeight).x}
              y1={project(-towerWidth / 2 + 2, -towerDepth / 2, podiumHeight + towerHeight).y}
              x2={project(-towerWidth / 2 + 2, -towerDepth / 2, podiumHeight + towerHeight + 9).x}
              y2={project(-towerWidth / 2 + 2, -towerDepth / 2, podiumHeight + towerHeight + 9).y}
              stroke="rgba(58, 52, 42, 0.75)"
              strokeWidth={1.1}
            />
          ) : null}
        </g>
      ),
    });
  }

  return (
    <svg
      className={`hq-blueprint${className ? ` ${className}` : ''}`}
      viewBox="0 0 240 176"
      role="img"
      aria-label={`Maquete da sede no estágio ${stageDef.name}`}
    >
      {objects.map((object) => object.node)}
    </svg>
  );
}
