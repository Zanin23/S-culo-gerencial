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

  // Tecido urbano em 2D: um único <path> por tipologia, sem rotação, para o
  // fallback sem WebGL continuar leve mesmo com dezenas de milhares de casas.
  const fabric = useMemo(() => {
    if (compact) return [];
    const byKind = new Map<string, string[]>();
    const limit = 9000;
    const ordered = plan.buildings.length > limit
      ? [...plan.buildings].sort((a, b) => b.w * b.d - a.w * a.d).slice(0, limit)
      : plan.buildings;
    for (const building of ordered) {
      const list = byKind.get(building.kind) ?? [];
      const x = building.x - building.w / 2;
      const y = -(building.y - building.d / 2);
      list.push(`M${x.toFixed(0)} ${y.toFixed(0)}h${building.w}v${-building.d}h${-building.w}z`);
      byKind.set(building.kind, list);
    }
    return [...byKind.entries()];
  }, [plan, compact]);

  const half = plan.size / 2;
  return (
    <svg
      className={cx('city-plan2d', compact && 'city-plan2d--compact')}
      viewBox={`${-half} ${-half} ${plan.size} ${plan.size}`}
      role="img"
      aria-label={`Planta de ${cityLabel(plan.name)}`}
    >
      <defs>
        <radialGradient id={`water-glow-${plan.cityId}`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#12414f" />
          <stop offset="100%" stopColor="#0a2630" />
        </radialGradient>
      </defs>
      <rect x={-half} y={-half} width={plan.size} height={plan.size} fill="#243128" />
      <rect x={-half} y={-half} width={plan.size} height={plan.size} fill={`url(#water-glow-${plan.cityId})`} opacity={0.35} />
      {/* água aproximada pelas células: retângulos agrupados por linha */}
      {!compact && <WaterMask plan={plan} />}
      <path d={roads} fill="none" stroke="#454b4e" strokeWidth={compact ? 26 : 11} strokeLinecap="round" />
      {fabric.map(([kind, path]) => (
        <path key={kind} d={path.join('')} fill={PLAN2D_KINDS[kind] ?? '#6b6f66'} opacity={0.9} />
      ))}
      {shore && <path d={shore} fill="none" stroke="#c9bd9a" strokeWidth={compact ? 30 : 13} opacity={0.55} />}
      {plan.plots.map((plot) => {
        const isHq = plot.id === plotId;
        const isChosen = plot.id === selectedPlotId;
        return (
          <circle
            key={plot.id}
            cx={plot.x}
            cy={-plot.y}
            r={compact ? 46 : 26}
            fill={isHq ? 'rgba(99,220,195,0.85)' : isChosen ? 'rgba(244,215,154,0.9)' : 'rgba(216,180,106,0.55)'}
            stroke={isHq || isChosen ? '#f4d79a' : 'rgba(216,180,106,0.9)'}
            strokeWidth={compact ? 12 : 6}
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
            fill="#0c2a34"
            opacity={0.9}
          />,
        );
        start = -1;
      }
    }
  }
  return <g>{rows}</g>;
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
    sceneRef.current.setHq(selectedPlot);
  }, [selectedPlot, active]);

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
