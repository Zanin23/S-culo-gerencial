import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { FACTIONS, NODES, TERRAIN } from '../game/constants';
import { developmentOf, jobsOf, defenseOf } from '../game/economy';
import { getRelation } from '../game/diplomacy';
import { hexCorners, hexToPixel, mapBounds, MAP_SIZE, neighborsOf, tilesOfFaction } from '../game/map';
import type { Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { clamp } from '../game/rng';
import { cx } from './primitives';
import { Icon } from './Icon';
import { fmt } from './format';

interface HoverState {
  tileId: string;
  x: number;
  y: number;
}

const BOUNDS = { size: MAP_SIZE };

function NodeGlyph({ kind, color, scale }: { kind: Tile['node']; color: string; scale: number }) {
  const s = scale;
  if (kind === 'nenhum') return null;
  if (kind === 'minerio') {
    return <polygon points={`0,-5 5,0 0,5 -5,0`} fill="none" stroke={color} strokeWidth={1.4 * s} transform={`scale(${s})`} />;
  }
  if (kind === 'energia') {
    return <path d="M1,-6 L-4,1 L0,1 L-1,6 L4,-1 L0,-1 Z" fill={color} transform={`scale(${s})`} />;
  }
  if (kind === 'fertil' || kind === 'madeira') {
    return (
      <g transform={`scale(${s})`}>
        <path d="M0,5 L0,-2" stroke={color} strokeWidth={1.3} />
        <path d="M0,-1 C-4,-2 -5,-6 -1,-6 C1,-6 1,-3 0,-1 Z" fill={color} />
        <path d="M0,2 C4,1 5,-3 1,-3 C-1,-3 -1,1 0,2 Z" fill={color} opacity={0.8} />
      </g>
    );
  }
  if (kind === 'pesca') {
    return (
      <g transform={`scale(${s})`} fill="none" stroke={color} strokeWidth={1.2}>
        <path d="M-5,2 q2.5,-4 5,0 t5,0" />
        <path d="M-5,-1 q2.5,-4 5,0 t5,0" opacity={0.7} />
      </g>
    );
  }
  return (
    <g transform={`scale(${s})`}>
      <path d="M0,-6 L1.7,-2 L6,-1.8 L2.6,1.2 L3.6,5.6 L0,3.3 L-3.6,5.6 L-2.6,1.2 L-6,-1.8 L-1.7,-2 Z" fill={color} />
    </g>
  );
}

function CapitalGlyph({ color, scale }: { color: string; scale: number }) {
  return (
    <g transform={`scale(${scale})`} fill={color}>
      <path d="M-6.5,3 L-6.5,-3 L-3,0 L0,-4.5 L3,0 L6.5,-3 L6.5,3 Z" />
      <rect x={-6.5} y={4} width={13} height={1.8} rx={0.6} />
    </g>
  );
}

export function MapView() {
  const game = useGameStore((s) => s.game)!;
  const selectedTileId = useGameStore((s) => s.selectedTileId);
  const selectTile = useGameStore((s) => s.selectTile);
  const playerId = game.playerFactionId;
  const [transform, setTransform] = useState({ zoom: 1.04, x: 0, y: 0 });
  const [hover, setHover] = useState<HoverState | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean; pointerId: number } | null>(null);
  const suppressClick = useRef(false);

  const bounds = useMemo(() => mapBounds(game.tiles, BOUNDS.size), [game.tiles]);
  const center = { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 };

  const activeProjects = useMemo(() => {
    const map = new Map<string, typeof game.projects[number]>();
    for (const project of game.projects) {
      if (!map.has(project.tileId)) map.set(project.tileId, project);
    }
    return map;
  }, [game.projects]);

  const myProjects = useMemo(
    () => game.projects.filter((project) => project.factionId === playerId),
    [game.projects, playerId],
  );

  const claimable = useMemo(() => {
    const own = tilesOfFaction(game.tiles, playerId);
    const set = new Set<string>();
    for (const tile of own) {
      for (const neighbor of neighborsOf(tile, game.tiles)) {
        if (neighbor.owner === null) set.add(neighbor.id);
      }
    }
    return set;
  }, [game.tiles, playerId]);

  const toSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: center.x, y: center.y };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: center.x, y: center.y };
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }, [center.x, center.y]);

  const zoomAt = useCallback((factor: number, screen?: { x: number; y: number }) => {
    const anchor = screen ?? center;
    setTransform((current) => {
      const zoom = clamp(current.zoom * factor, 0.82, 2.5);
      const ratio = zoom / current.zoom;
      return {
        zoom,
        x: anchor.x - center.x - ratio * (anchor.x - center.x - current.x),
        y: anchor.y - center.y - ratio * (anchor.y - center.y - current.y),
      };
    });
  }, [center]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const screen = toSvg(event.clientX, event.clientY);
      zoomAt(event.deltaY > 0 ? 0.9 : 1.1, screen);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [toSvg, zoomAt]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('[data-no-drag="true"]')) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: transform.x,
      panY: transform.y,
      moved: false,
      pointerId: event.pointerId,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const start = toSvg(drag.x, drag.y);
    const current = toSvg(event.clientX, event.clientY);
    setTransform((value) => ({
      ...value,
      x: drag.panX + (current.x - start.x),
      y: drag.panY + (current.y - start.y),
    }));
  };

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.moved) {
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 60);
    }
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(drag.pointerId)) {
      svgRef.current.releasePointerCapture(drag.pointerId);
    }
    void event;
  };

  const handleTileClick = (tile: Tile) => {
    if (suppressClick.current) return;
    selectTile(tile.id);
  };

  const hoverTile = hover ? game.tiles[hover.tileId] : null;
  const hoverOwner = hoverTile?.owner ? FACTIONS[hoverTile.owner] : null;

  const showTileHover = (tile: Tile, event: ReactPointerEvent) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ tileId: tile.id, x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  return (
    <div className="map-view" ref={mapRef}>
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHover(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) selectTile(null);
        }}
        role="group"
        aria-label="Mapa político do Cinturão de Vesper"
      >
        <defs>
          <radialGradient id="map-bg" cx="50%" cy="45%" r="75%">
            <stop offset="0%" stopColor="#14242b" />
            <stop offset="55%" stopColor="#0d171d" />
            <stop offset="100%" stopColor="#070d12" />
          </radialGradient>
          <pattern id="hex-grid" width="70" height="60.6" patternUnits="userSpaceOnUse" patternTransform="scale(1)">
            <path d="M17.5 0 L52.5 0 L70 30.3 L52.5 60.6 L17.5 60.6 L0 30.3 Z" fill="none" stroke="rgba(160,200,195,.05)" strokeWidth="1" />
          </pattern>
          <pattern id="pat-plains" width="18" height="18" patternUnits="userSpaceOnUse">
            <path d="M0 14 L18 14" stroke="rgba(255,255,255,.09)" strokeWidth=".7" />
            <path d="M4 9 L8 9" stroke="rgba(255,255,255,.07)" strokeWidth=".7" />
          </pattern>
          <pattern id="pat-forest" width="18" height="18" patternUnits="userSpaceOnUse">
            <path d="M5 14 L9 6 L13 14 Z" fill="none" stroke="rgba(255,255,255,.13)" strokeWidth=".8" />
            <path d="M2 8 L4 4 L6 8" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth=".7" />
          </pattern>
          <pattern id="pat-hills" width="22" height="18" patternUnits="userSpaceOnUse">
            <path d="M0 13 Q5 6 11 13 T22 13" fill="none" stroke="rgba(255,255,255,.11)" strokeWidth=".8" />
          </pattern>
          <pattern id="pat-mountain" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M2 16 L8 5 L14 16 Z" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth=".8" />
            <path d="M10 16 L15 8 L19 16" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth=".7" />
          </pattern>
          <pattern id="pat-desert" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="5" r=".8" fill="rgba(255,255,255,.13)" />
            <circle cx="12" cy="12" r=".6" fill="rgba(255,255,255,.1)" />
          </pattern>
          <pattern id="pat-coast" width="20" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 10 Q3 6 6 10 T12 10 T18 10" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth=".8" />
          </pattern>
          <pattern id="pat-sea" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M0 10 Q5 6 10 10 T20 10" fill="none" stroke="rgba(120,190,210,.12)" strokeWidth=".8" />
          </pattern>
          <linearGradient id="tile-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="45%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity=".38" />
          </linearGradient>
          <filter id="sel-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        <rect x={bounds.minX} y={bounds.minY} width={bounds.width} height={bounds.height} fill="url(#map-bg)" onClick={(event) => { event.stopPropagation(); selectTile(null); }} />
        <rect x={bounds.minX} y={bounds.minY} width={bounds.width} height={bounds.height} fill="url(#hex-grid)" pointerEvents="none" />

        <g transform={`translate(${transform.x} ${transform.y}) translate(${center.x} ${center.y}) scale(${transform.zoom}) translate(${-center.x} ${-center.y})`}>
          <g className="map-connections" opacity=".4">
            {(['concordia', 'aurelia', 'kestrel', 'vantor'] as const).map((id, index, list) => {
              const capital = game.tiles[game.factions[id].capitalId];
              const nextHouse = list[(index + 1) % list.length];
              const nextCapital = game.tiles[game.factions[nextHouse].capitalId];
              const a = hexToPixel(capital.q, capital.r, BOUNDS.size);
              const b = hexToPixel(nextCapital.q, nextCapital.r, BOUNDS.size);
              return <line key={id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={FACTIONS[id].color} strokeOpacity={0.1} strokeWidth={1} strokeDasharray="2 8" />;
            })}
          </g>

          {Object.values(game.tiles).map((tile) => {
            const point = hexToPixel(tile.q, tile.r, BOUNDS.size);
            const points = hexCorners(point.x, point.y, BOUNDS.size - 1.6);
            const owner = tile.owner ? FACTIONS[tile.owner] : null;
            const isPlayer = tile.owner === playerId;
            const isSelected = tile.id === selectedTileId;
            const isHover = tile.id === hover?.tileId;
            const project = activeProjects.get(tile.id);
            const showName = showLabels && (Boolean(owner) || isSelected || isHover || transform.zoom > 1.5);
            const terrain = TERRAIN[tile.terrain];
            const ownerColor = owner?.color ?? '#d8e9e5';
            const ownerOpacity = owner ? (isPlayer ? 0.4 : 0.3) : 0.015;
            const isClaimable = claimable.has(tile.id);
            const borderWidth = (isSelected ? 2.4 : isPlayer ? 1.5 : owner ? 1.2 : 0.9) / transform.zoom;
            const dev = developmentOf(tile);

            return (
              <g
                key={tile.id}
                className={cx(
                  'hex',
                  owner ? 'hex--owned' : 'hex--neutral',
                  isPlayer && 'hex--player',
                  isSelected && 'hex--selected',
                  isHover && 'hex--hover',
                  isClaimable && 'hex--claimable',
                  project && 'hex--project',
                )}
                onClick={() => handleTileClick(tile)}
                onPointerMove={(event) => showTileHover(tile, event)}
                onPointerEnter={(event) => showTileHover(tile, event)}
                onPointerLeave={() => { if (hover?.tileId === tile.id) setHover(null); }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectTile(tile.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${tile.name}, ${terrain.name}, ${owner ? owner.name : 'território neutro'}, desenvolvimento ${dev}`}
                data-no-drag="false"
              >
                <polygon points={points} fill={terrain.color} />
                <polygon points={points} fill={ownerColor} fillOpacity={ownerOpacity} />
                <polygon points={points} fill={`url(#pat-${terrain.texture})`} opacity={0.55} />
                <polygon points={points} fill="url(#tile-shade)" opacity={0.55} />
                <polygon
                  points={points}
                  fill="none"
                  stroke={owner ? owner.color : 'rgba(202,225,220,.24)'}
                  strokeOpacity={owner ? 0.9 : 0.55}
                  strokeWidth={borderWidth}
                  strokeDasharray={owner ? undefined : `${4 / transform.zoom} ${3 / transform.zoom}`}
                />
                {isPlayer ? (
                  <polygon points={points} fill="none" stroke={ownerColor} strokeOpacity={0.2} strokeWidth={3.4 / transform.zoom} filter="url(#soft-glow)" />
                ) : null}
                {isSelected ? (
                  <>
                    <polygon points={points} fill="none" stroke="#f4fffc" strokeWidth={2.3 / transform.zoom} filter="url(#sel-glow)" />
                    <polygon points={hexCorners(point.x, point.y, BOUNDS.size + 4)} fill="none" stroke="rgba(255,255,255,.32)" strokeWidth={0.8 / transform.zoom} strokeDasharray={`${3 / transform.zoom} ${4 / transform.zoom}`} />
                  </>
                ) : null}
                {project ? (
                  <polygon
                    points={points}
                    fill="none"
                    stroke={project.factionId === playerId ? 'var(--teal)' : FACTIONS[project.factionId].color}
                    strokeWidth={1.6 / transform.zoom}
                    strokeDasharray={`${5 / transform.zoom} ${4 / transform.zoom}`}
                    className="hex-project-ring"
                  />
                ) : null}

                {tile.node !== 'nenhum' ? (
                  <g transform={`translate(${point.x - 15 / transform.zoom} ${point.y - 9 / transform.zoom})`}>
                    <circle r={6.2 / transform.zoom} fill="rgba(5,12,15,.62)" stroke={NODES[tile.node].color} strokeOpacity={0.55} strokeWidth={0.8 / transform.zoom} />
                    <NodeGlyph kind={tile.node} color={NODES[tile.node].color} scale={0.9 / transform.zoom} />
                  </g>
                ) : null}

                {tile.isCapital ? (
                  <g transform={`translate(${point.x + 16 / transform.zoom} ${point.y - 9 / transform.zoom})`}>
                    <circle r={6.8 / transform.zoom} fill="rgba(5,12,15,.7)" stroke={ownerColor} strokeOpacity={0.5} strokeWidth={0.8 / transform.zoom} />
                    <CapitalGlyph color={ownerColor} scale={0.72 / transform.zoom} />
                  </g>
                ) : null}

                {tile.unrest >= 55 ? (
                  <g transform={`translate(${point.x + 17 / transform.zoom} ${point.y + 14 / transform.zoom})`}>
                    <circle r={4 / transform.zoom} fill="#e36d63" opacity={0.9} />
                    <text x={0} y={1.2 / transform.zoom} textAnchor="middle" fontSize={5 / transform.zoom} fill="#1a0907" fontWeight={800}>!</text>
                  </g>
                ) : null}

                {showName ? (
                  <text
                    x={point.x}
                    y={point.y + 5 / transform.zoom}
                    textAnchor="middle"
                    fontSize={8.6 / transform.zoom}
                    className={cx('hex-label', isPlayer && 'hex-label--player', !owner && 'hex-label--neutral')}
                    stroke="rgba(4,10,12,.8)"
                    strokeWidth={2.2 / transform.zoom}
                    paintOrder="stroke"
                  >
                    {tile.name}
                  </text>
                ) : null}

                {transform.zoom > 1.65 || isSelected ? (
                  <text
                    x={point.x}
                    y={point.y + 16 / transform.zoom}
                    textAnchor="middle"
                    fontSize={6.6 / transform.zoom}
                    className="hex-meta"
                    fill="rgba(222,240,235,.55)"
                    stroke="rgba(4,10,12,.75)"
                    strokeWidth={1.8 / transform.zoom}
                    paintOrder="stroke"
                  >
                    {jobsOf(tile) > 0 ? `${dev} DEV · ${Math.round(tile.pop)} POP` : `${dev} DEV`}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>

        <g className="map-compass" transform={`translate(${bounds.minX + bounds.width - 46} ${bounds.minY + 58})`}>
          <circle r="22" fill="rgba(7,14,18,.55)" stroke="rgba(210,235,230,.16)" />
          <circle r="16" fill="none" stroke="rgba(210,235,230,.1)" />
          <path d="M0,-18 L4,-4 L0,0 L-4,-4 Z" fill="rgba(63,214,194,.8)" />
          <path d="M0,18 L4,4 L0,0 L-4,4 Z" fill="rgba(220,240,235,.25)" />
          <text x="0" y="-27" textAnchor="middle" fontSize="7" fill="rgba(220,240,235,.6)" letterSpacing=".12em">N</text>
        </g>
      </svg>

      <div className="map-title">
        <span className="eyebrow">Teatro de operações</span>
        <strong>Cinturão de Vesper</strong>
        <span>{Object.values(game.tiles).filter((t) => t.owner === playerId).length} territórios sob seu controle</span>
      </div>

      {myProjects.length ? (
        <div className="map-projects">
          <div className="map-projects__title"><Icon name="Hammer" size={12} /> Em execução <span>{myProjects.length}</span></div>
          {myProjects.slice(0, 3).map((project) => {
            const total = Math.max(1, project.completesCycle - project.startedCycle);
            const elapsed = Math.max(0, game.cycle - project.startedCycle);
            const left = Math.max(0, project.completesCycle - game.cycle);
            return (
              <button
                className="map-project"
                key={project.id}
                onClick={() => selectTile(project.tileId)}
                type="button"
                title={`${project.label} · conclui no ciclo ${project.completesCycle}`}
              >
                <span className="map-project__icon">
                  <Icon name={project.kind === 'pesquisa' ? 'FlaskConical' : project.kind === 'expansao' ? 'Target' : project.kind === 'operacao' ? 'Swords' : 'Hammer'} size={13} />
                </span>
                <span className="map-project__body">
                  <span className="map-project__label">{project.label}</span>
                  <span className="map-project__bar"><i style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} /></span>
                </span>
                <span className="map-project__left">{left}c</span>
              </button>
            );
          })}
          {myProjects.length > 3 ? <div className="map-projects__more">+{myProjects.length - 3} no painel de obras</div> : null}
        </div>
      ) : null}

      <div className="map-controls" data-no-drag="true">
        <button className="map-control" onClick={() => zoomAt(1.18)} aria-label="Aproximar" type="button"><Icon name="Plus" size={16} /></button>
        <button className="map-control" onClick={() => zoomAt(0.85)} aria-label="Afastar" type="button"><Icon name="Minus" size={16} /></button>
        <button className="map-control" onClick={() => setTransform({ zoom: 1.04, x: 0, y: 0 })} aria-label="Recentralizar mapa" type="button"><Icon name="RotateCcw" size={15} /></button>
        <button className={cx('map-control', showLabels && 'is-active')} onClick={() => setShowLabels((v) => !v)} aria-label="Alternar rótulos" type="button"><Icon name="Eye" size={15} /></button>
        <button className={cx('map-control', showLegend && 'is-active')} onClick={() => setShowLegend((v) => !v)} aria-label="Alternar legenda" type="button"><Icon name="Layers" size={15} /></button>
      </div>

      {showLegend ? (
        <div className="map-legend">
          <div className="map-legend__title">Legenda</div>
          <div className="map-legend__grid">
            {(['concordia', 'aurelia', 'kestrel', 'vantor'] as const).map((id) => (
              <span key={id} className="legend-item"><i style={{ background: FACTIONS[id].color }} />{FACTIONS[id].short}</span>
            ))}
            <span className="legend-item"><i className="is-neutral" />Neutro</span>
            <span className="legend-item"><Icon name="Crown" size={11} />Capital</span>
            <span className="legend-item"><Icon name="Gem" size={11} />Recurso</span>
            <span className="legend-item"><i className="is-project" />Obra</span>
          </div>
        </div>
      ) : null}

      <div className="map-hint">
        <Icon name="MousePointer2" size={13} />
        Arraste para mover · role para aproximar · clique para inspecionar
      </div>

      {hover && hoverTile ? (
        <div
          className="map-tooltip"
          style={{
            left: Math.min(hover.x + 18, (mapRef.current?.clientWidth ?? 900) - 262),
            top: Math.min(hover.y + 14, (mapRef.current?.clientHeight ?? 600) - 180),
          }}
        >
          <div className="map-tooltip__top">
            <span className="map-tooltip__owner" style={{ background: hoverOwner?.color ?? '#93a6a1' }} />
            <div>
              <strong>{hoverTile.name}</strong>
              <span>{hoverOwner ? hoverOwner.name : 'Território livre'} {hoverTile.isCapital ? '· Capital' : ''}</span>
            </div>
            <span className="map-tooltip__dev">{developmentOf(hoverTile)} <small>dev</small></span>
          </div>
          <div className="map-tooltip__row">
            <span>{TERRAIN[hoverTile.terrain].name}</span>
            <span>{NODES[hoverTile.node].name}</span>
            <span>{Math.round(hoverTile.pop)} pop</span>
            <span>{defenseOf(game, hoverTile)} def</span>
          </div>
          {hoverTile.owner && hoverTile.owner !== playerId ? (
            <div className="map-tooltip__relation">
              Relações: {Math.round(getRelation(game, playerId, hoverTile.owner).relation)} ·{' '}
              {getRelation(game, playerId, hoverTile.owner).war ? 'Em guerra' : 'Sem guerra'}
            </div>
          ) : null}
          {hoverTile.owner === null && claimable.has(hoverTile.id) ? (
            <div className="map-tooltip__claim"><Icon name="Target" size={12} /> Fronteira reivindicável</div>
          ) : null}
          {activeProjects.get(hoverTile.id) ? (
            <div className="map-tooltip__project"><Icon name="Hammer" size={12} /> {activeProjects.get(hoverTile.id)!.label}</div>
          ) : null}
        </div>
      ) : null}

      <div className="map-scale">
        <span>Cinturão de Vesper</span>
        <span className="map-scale__line"><i /> 120 km</span>
        <span>Zoom {Math.round(transform.zoom * 100)}%</span>
      </div>

      <div className="map-owner-badge">
        <span className="map-owner-badge__dot" style={{ background: FACTIONS[playerId].color }} />
        <span>{FACTIONS[playerId].short}</span>
        <span className="map-owner-badge__sep">·</span>
        <span>{fmt(Object.values(game.tiles).reduce((sum, t) => sum + (t.owner === playerId ? t.pop : 0), 0))} pop.</span>
      </div>
    </div>
  );
}
