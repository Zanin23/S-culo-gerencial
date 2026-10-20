import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CITIES, GLOBAL_CITIES, PROVINCE_BY_ID, type CountryDetail, type Shapes } from '../game/atlas';
import { FACTIONS, TERRAIN } from '../game/constants';
import { cityLabel } from '../game/names';
import type { FactionId, Tile } from '../game/types';
import { cx } from './primitives';

// Mapa 2D de contingência (e alternativa acessível): projeção equirretangular.
// Usa exatamente os mesmos dados e seleção do globo 3D.

const NEUTRAL = ['#5f7b80', '#6d7c6e', '#7d7461', '#657c78', '#73786d', '#607a85'];

function polygonPath(rings: number[][]): string {
  const parts: string[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const x = ring[i] + 180;
      const y = 90 - ring[i + 1];
      parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    parts.push('Z');
  }
  return parts.join(' ');
}

function shapesPath(shapes: Shapes): string {
  return shapes.map(polygonPath).join(' ');
}

function bounds(shapes: Shapes | undefined): { minLon: number; maxLon: number; minLat: number; maxLat: number } | null {
  if (!shapes || !shapes.length) return null;
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  for (const polygon of shapes) {
    for (let i = 0; i < polygon[0].length; i += 2) {
      const lon = polygon[0][i];
      const lat = polygon[0][i + 1];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

export interface FlatAtlasProps {
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
  onSelectCountry: (id: string, focus: boolean) => void;
  onSelectProvince: (id: string) => void;
  onSelectCity: (id: string) => void;
  onClear: () => void;
}

export interface FlatAtlasHandle {
  zoom: (factor: number) => void;
  reset: () => void;
}

export const FlatAtlas = forwardRef<FlatAtlasHandle, FlatAtlasProps>(function FlatAtlas({
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
  onSelectCountry,
  onSelectProvince,
  onSelectCity,
  onClear,
}, ref) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; viewX: number; viewY: number; moved: boolean } | null>(null);
  const suppress = useRef(false);

  const paths = useMemo(() => Object.fromEntries(
    Object.entries(shapes).map(([iso, value]) => [iso, shapesPath(value)]),
  ), [shapes]);

  const provincePaths = useMemo(() => {
    if (!detail) return [];
    return Object.entries(detail.provinces).map(([id, value]) => ({ id, d: shapesPath(value) }));
  }, [detail]);

  useEffect(() => {
    if (!focusCountryId) {
      setView({ x: 0, y: 0, k: 1 });
      return;
    }
    const box = bounds(detail?.country ?? shapes[focusCountryId]);
    if (!box) return;
    const spanLon = Math.max(1.5, box.maxLon - box.minLon);
    const spanLat = Math.max(1.2, box.maxLat - box.minLat);
    const k = Math.max(1, Math.min(9, Math.min(340 / spanLon, 165 / spanLat) * 0.82));
    setView({
      k,
      x: (box.minLon + box.maxLon) / 2 - 180 / k,
      y: 90 - (box.minLat + box.maxLat) / 2 - 90 / k,
    });
  }, [focusCountryId, detail, shapes]);

  const width = 360 / view.k;
  const height = 180 / view.k;

  useImperativeHandle(ref, () => ({
    zoom: (factor: number) => setView((current) => {
      const k = Math.max(1, Math.min(12, current.k * factor));
      const centerX = current.x + 180 / current.k;
      const centerY = current.y + 90 / current.k;
      return { k, x: centerX - 180 / k, y: centerY - 90 / k };
    }),
    reset: () => setView({ x: 0, y: 0, k: 1 }),
  }), []);

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
      x: drag.viewX - (dx / rect.width) * width,
      y: drag.viewY - (dy / rect.height) * height,
    }));
  };

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    window.setTimeout(() => { suppress.current = false; }, 30);
  };

  // Wheel nativo com passive:false — sem isso o React mantém o listener passivo
  // e a página rola em vez de aproximar a carta.
  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / Math.max(1, rect.width);
      const py = (event.clientY - rect.top) / Math.max(1, rect.height);
      setView((current) => {
        const factor = event.deltaY > 0 ? 0.85 : 1.18;
        const nextK = Math.max(1, Math.min(12, current.k * factor));
        const lon = current.x + px * (360 / current.k);
        const lat = current.y + py * (180 / current.k);
        return {
          k: nextK,
          x: lon - px * (360 / nextK),
          y: lat - py * (180 / nextK),
        };
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const visibleCities = useMemo(() => {
    if (!showCities) return [];
    const list = focusCountryId
      ? CITIES.filter((city) => city.countryId === focusCountryId || city.capital)
      : GLOBAL_CITIES;
    return list.slice(0, 260);
  }, [focusCountryId, showCities]);

  return (
    <svg
      ref={svgRef}
      className="map-svg map-fallback"
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
      aria-label="Mapa-múndi bidimensional interativo"
    >
      <rect x={view.x} y={view.y} width={width} height={height} fill="#081820" onClick={onClear} />
      <g className="flat-grid" aria-hidden="true">
        {Array.from({ length: 11 }).map((_, index) => (
          <line key={`h${index}`} x1={view.x} x2={view.x + width} y1={index * 18} y2={index * 18} />
        ))}
        {Array.from({ length: 19 }).map((_, index) => (
          <line key={`v${index}`} x1={index * 20} x2={index * 20} y1={view.y} y2={view.y + height} />
        ))}
      </g>

      {Object.keys(shapes).map((iso) => {
        const tile = tiles[iso];
        if (!tile) return null;
        const owner = tile.owner;
        const fill = owner ? FACTIONS[owner].color : claimable.has(iso) ? '#3e6f66' : NEUTRAL[Math.abs(iso.charCodeAt(0) + iso.charCodeAt(2)) % NEUTRAL.length];
        return (
          <path
            key={iso}
            d={paths[iso]}
            fill={fill}
            fillOpacity={owner ? (owner === playerId ? 0.92 : 0.68) : 0.5}
            stroke="#061318"
            strokeWidth={0.35 / view.k}
            fillRule="evenodd"
            className={cx('flat-country', iso === selectedCountryId && 'is-selected', owner === playerId && 'is-player')}
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
        );
      })}

      {provincePaths.map((province, index) => (
        <path
          key={province.id}
          d={province.d}
          fill={TERRAIN[focusCountryId ? tiles[focusCountryId]?.terrain ?? 'planicie' : 'planicie'].color}
          fillOpacity={0.62 + (index % 3) * 0.09}
          stroke="#08171c"
          strokeWidth={0.3 / view.k}
          className={cx('flat-province', province.id === selectedProvinceId && 'is-selected')}
          onClick={(event) => {
            if (suppress.current) return;
            event.stopPropagation();
            onSelectProvince(province.id);
          }}
        >
          <title>{PROVINCE_BY_ID[province.id]?.name ?? province.id}</title>
        </path>
      ))}

      {visibleCities.map((city) => {
        const x = city.lon + 180;
        const y = 90 - city.lat;
        const radius = city.capital ? 1.5 / view.k : 1 / view.k;
        return (
          <circle
            key={city.id}
            cx={x}
            cy={y}
            r={radius}
            className={cx('flat-city', city.capital && 'is-capital', city.id === selectedCityId && 'is-selected')}
            onClick={(event) => {
              if (suppress.current) return;
              event.stopPropagation();
              onSelectCity(city.id);
            }}
          >
            <title>{cityLabel(city.name)}</title>
          </circle>
        );
      })}
    </svg>
  );
});
