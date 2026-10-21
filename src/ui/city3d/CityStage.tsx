import { useEffect, useMemo, useRef, useState } from 'react';
import { getCityPlan, type CityPlan, type CityPlot } from '../../game/cityPlan';
import { cityLabel } from '../../game/names';
import { Icon } from '../Icon';
import { cx } from '../primitives';
import { CityScene, type CityMode } from './CityScene';
import { supportsWebGL } from '../globe/webgl';

export interface CityStageProps {
  cityId: string;
  mode: CityMode;
  plotId?: string | null;
  /** Pisos visíveis no corte da sede (1–4). */
  floor?: number;
  /** Estágio da sede (0–3): muda a altura e os detalhes da maquete. */
  stage?: number;
  showMinimap?: boolean;
  onPickPlot?: (plot: CityPlot) => void;
  onEnterBuilding?: () => void;
  onFail?: () => void;
  onHoverPlot?: (plot: CityPlot | null, x: number, y: number) => void;
  children?: React.ReactNode;
  className?: string;
}

/** Mapa 2D da mesma planta — fallback sem WebGL e minimapa permanente. */
export function CityPlan2D({
  plan,
  plotId,
  selectedPlotId,
  compact = false,
  onPickPlot,
}: {
  plan: CityPlan;
  plotId?: string | null;
  selectedPlotId?: string | null;
  compact?: boolean;
  onPickPlot?: (plot: CityPlot) => void;
}) {
  const roads = useMemo(() => {
    const parts: string[] = [];
    for (const road of plan.roads) {
      if (compact && road.kind === 'rua') continue;
      let path = '';
      for (let index = 0; index < road.pts.length; index += 1) {
        const [x, y] = road.pts[index];
        path += `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${(-y).toFixed(1)}`;
      }
      parts.push(path);
    }
    return parts.join(' ');
  }, [plan, compact]);

  const shore = useMemo(() => {
    return plan.shore
      .map((run) => run.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${(-y).toFixed(1)}`).join(' '))
      .join(' ');
  }, [plan]);

  // Tecido urbano em 2D: um único <path> por zona, sem rotação, para o
  // fallback sem WebGL continuar leve mesmo com milhares de quadras.
  const fabric = useMemo(() => {
    const byZone = new Map<string, string[]>();
    // O minimapa mostra a distribuição urbana, não cada casa: amostra uniforme.
    const source = compact
      ? plan.buildings.filter((_, index) => index % Math.max(1, Math.ceil(plan.buildings.length / 1400)) === 0)
      : plan.buildings.length > 9000
        ? [...plan.buildings].sort((a, b) => b.w * b.d - a.w * a.d).slice(0, 9000)
        : plan.buildings;
    const ordered = source;
    for (const building of ordered) {
      const list = byZone.get(building.zone) ?? [];
      const x = building.x - building.w / 2;
      const y = -(building.y - building.d / 2);
      list.push(`M${x.toFixed(0)} ${y.toFixed(0)}h${building.w}v${-building.d}h${-building.w}z`);
      byZone.set(building.zone, list);
    }
    return [...byZone.entries()];
  }, [plan]);

  const half = plan.size / 2;
  return (
    <svg
      className={cx('city-plan2d', compact && 'city-plan2d--compact')}
      viewBox={`${-half} ${-half} ${plan.size} ${plan.size}`}
      role="img"
      aria-label={`Planta de ${cityLabel(plan.name)}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`water-glow-${plan.cityId}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#b7c9cd" />
          <stop offset="100%" stopColor="#a5bcc2" />
        </linearGradient>
        <linearGradient id={`land-glow-${plan.cityId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ece8db" />
          <stop offset="100%" stopColor="#ded8c7" />
        </linearGradient>
      </defs>
      <rect x={-half} y={-half} width={plan.size} height={plan.size} fill={`url(#water-glow-${plan.cityId})`} />
      <rect x={-half} y={-half} width={plan.size} height={plan.size} fill={`url(#land-glow-${plan.cityId})`} opacity={0.28} />
      {!compact && <WaterMask plan={plan} />}
      {!compact && <ParkMask plan={plan} />}
      <path
        d={roads}
        fill="none"
        stroke="#c9c3b5"
        strokeWidth={compact ? 30 : 13}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={roads}
        fill="none"
        stroke="#aca79a"
        strokeWidth={compact ? 15 : 4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {fabric.map(([zone, path]) => (
        <path key={zone} d={path.join('')} fill={PLAN2D_ZONES[zone] ?? '#b9ae99'} />
      ))}
      {!compact && <TreeDots plan={plan} />}
      {plan.plots.map((plot) => {
        const isHq = plot.id === plotId;
        const isChosen = plot.id === selectedPlotId;
        return (
          <circle
            key={plot.id}
            cx={plot.x}
            cy={-plot.y}
            r={compact ? 42 : 24}
            fill={isHq ? 'rgba(47,179,154,0.9)' : isChosen ? 'rgba(216,180,106,0.92)' : 'rgba(216,180,106,0.45)'}
            stroke={isHq ? '#8fe3d2' : '#c9a25f'}
            strokeWidth={compact ? 10 : 5}
            className={onPickPlot ? 'city-plan2d__plot' : undefined}
            onClick={onPickPlot ? () => onPickPlot(plot) : undefined}
          >
            <title>{plot.id} · {plot.district}</title>
          </circle>
        );
      })}
    </svg>
  );
}

/** Cores do tecido urbano na planta 2D, por zona. */
const PLAN2D_ZONES: Record<string, string> = {
  centro: '#8d939a',
  residencial: '#c2b096',
  industrial: '#a3aeae',
  periferia: '#d3c3a8',
};

/** Cores do tecido urbano na planta 2D, por tipologia. */
const PLAN2D_KINDS: Record<string, string> = {
  casa: '#6d5f4c',
  villa: '#77664f',
  solar: '#7b786d',
  predio: '#8a8a80',
  comercial: '#7e9199',
  torre: '#8fa9b3',
  galpao: '#6f7a7c',
  marco: '#9bb0b6',
};

function WaterMask({ plan }: { plan: CityPlan }) {
  const rows: React.ReactNode[] = [];
  const step = 4;
  for (let j = 0; j < plan.cells; j += step) {
    let start = -1;
    for (let i = 0; i <= plan.cells; i += step) {
      const water = i < plan.cells && plan.water[j * plan.cells + i] === 1;
      if (water && start < 0) start = i;
      if (!water && start >= 0) {
        const x = -plan.size / 2 + start * plan.cell;
        const y = -plan.size / 2 + j * plan.cell;
        rows.push(
          <rect
            key={`${j}-${start}`}
            x={x}
            y={-y - step * plan.cell}
            width={(i - start) * plan.cell}
            height={step * plan.cell + 1}
            fill="#b3c6ca"
            opacity={1}
          />,
        );
        start = -1;
      }
    }
  }
  return <g>{rows}</g>;
}

/** Parques e praças na planta 2D, agrupados por linha para ficar leve. */
function ParkMask({ plan }: { plan: CityPlan }) {
  const rows: React.ReactNode[] = [];
  const step = 4;
  for (let j = 0; j < plan.cells; j += step) {
    let start = -1;
    for (let i = 0; i <= plan.cells; i += step) {
      const park = i < plan.cells && plan.park[j * plan.cells + i] === 1;
      if (park && start < 0) start = i;
      if (!park && start >= 0) {
        const x = -plan.size / 2 + start * plan.cell;
        const y = -plan.size / 2 + j * plan.cell;
        rows.push(
          <rect
            key={`p-${j}-${start}`}
            x={x}
            y={-y - step * plan.cell}
            width={(i - start) * plan.cell}
            height={step * plan.cell + 1}
            fill="#a8bf8f"
            opacity={1}
          />,
        );
        start = -1;
      }
    }
  }
  return <g>{rows}</g>;
}

/** Copas de árvore pontuais na planta: o mesmo verde da maquete 3D. */
function TreeDots({ plan }: { plan: CityPlan }) {
  const trees = plan.trees.length > 1600
    ? plan.trees.filter((_, index) => index % Math.ceil(plan.trees.length / 1600) === 0)
    : plan.trees;
  return (
    <g>
      {trees.map((tree, index) => (
        <circle
          key={`${tree.x}-${tree.y}-${index}`}
          cx={tree.x}
          cy={-tree.y}
          r={Math.max(3, tree.s * 0.55)}
          fill="#8ba474"
          opacity={0.85}
        />
      ))}
    </g>
  );
}

export function CityStage({
  cityId,
  mode,
  plotId,
  showMinimap = true,
  onPickPlot,
  onEnterBuilding,
  onFail,
  onHoverPlot,
  floor = 4,
  stage = 0,
  children,
  className,
}: CityStageProps) {
  const plan = useMemo(() => getCityPlan(cityId, 0), [cityId]);
  const [webgl] = useState(() => supportsWebGL());
  const [failed, setFailed] = useState(false);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CityScene | null>(null);
  // Callbacks em ref: os pais recriam funções a cada render e a cena não pode
  // ser desmontada por isso.
  const handlers = useRef({ onPickPlot, onEnterBuilding, onHoverPlot, onFail });
  handlers.current = { onPickPlot, onEnterBuilding, onHoverPlot, onFail };
  const [module, setModule] = useState<typeof import('./CityScene') | null>(null);

  const hqPlot = useMemo(() => plan.plots.find((plot) => plot.id === plotId) ?? null, [plan, plotId]);
  const selectedPlot = useMemo(
    () => plan.plots.find((plot) => plot.id === plotId) ?? null,
    [plan, plotId],
  );

  useEffect(() => {
    if (!webgl || failed || module) return;
    let cancelled = false;
    import('./CityScene')
      .then((loaded) => {
        if (!cancelled) setModule(() => loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [webgl, failed, module]);

  const active = webgl && !failed && Boolean(module);

  useEffect(() => {
    if (!active || !module || !mountRef.current) return;
    let scene: CityScene;
    try {
      scene = new module.CityScene(mountRef.current, {
        onHoverPlot: (plot, x, y) => handlers.current.onHoverPlot?.(plot, x, y),
        onPickPlot: (plot) => handlers.current.onPickPlot?.(plot),
        onEnterBuilding: () => handlers.current.onEnterBuilding?.(),
        onFail: () => {
          setFailed(true);
          handlers.current.onFail?.();
        },
      });
    } catch {
      mountRef.current?.replaceChildren();
      setFailed(true);
      handlers.current.onFail?.();
      return;
    }
    sceneRef.current = scene;
    scene.setPlan(plan);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [active, module, plan]);

  useEffect(() => {
    if (!sceneRef.current || !selectedPlot) return;
    sceneRef.current.setHq(selectedPlot, stage);
  }, [selectedPlot, stage, active]);

  useEffect(() => {
    sceneRef.current?.setMode(mode);
  }, [mode, active, selectedPlot]);

  useEffect(() => {
    sceneRef.current?.setFloor(floor);
  }, [floor, active, selectedPlot]);

  return (
    <div className={cx('city-stage', className)}>
      <div ref={mountRef} className={cx('city-stage__canvas', !active && 'is-hidden')} aria-hidden={!active} />
      {!active && (
        <CityPlan2D
          plan={plan}
          plotId={plotId}
          selectedPlotId={plotId}
          onPickPlot={onPickPlot}
        />
      )}
      {!webgl && (
        <div className="city-stage__note" role="status">
          WebGL indisponível: exibindo a planta 2D da mesma cidade.
        </div>
      )}
      {showMinimap && active && (
        <div className="city-minimap" aria-hidden="true">
          <CityPlan2D plan={plan} plotId={plotId} compact />
        </div>
      )}
      {active && (
        <div className="city-nav" role="group" aria-label="Câmera">
          <button
            type="button"
            onClick={() => sceneRef.current?.zoomBy(0.78)}
            aria-label="Aproximar"
            title="Aproximar"
          >
            <Icon name="Plus" size={13} />
          </button>
          <button
            type="button"
            onClick={() => sceneRef.current?.zoomBy(1.28)}
            aria-label="Afastar"
            title="Afastar"
          >
            <Icon name="Minus" size={13} />
          </button>
          <button
            type="button"
            onClick={() => sceneRef.current?.resetView()}
            aria-label="Recentrar a câmera"
            title="Recentrar"
          >
            <Icon name="RotateCcw" size={13} />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
