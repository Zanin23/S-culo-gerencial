#!/usr/bin/env python3
"""Extrai a geografia real de cada cidade jogável para o mapa 3D.

Fonte: Natural Earth 10m (domínio público) —
  - ne_10m_admin_0_countries (costa, rios largos e enseadas)
  - ne_10m_rivers_lake_centerlines (rios)
  - ne_10m_lakes (lagos)

Cada cidade recebe um recorte de ±2.800 m em coordenadas métricas locais
(equirretangular em torno do centro real). O resultado é
`src/game/city/geo.json`, versionado no repositório.

Uso:
    python3 scripts/build-city-geo.py

Os arquivos de origem devem estar em scripts/.cache/ (baixados do GitHub
Natural Earth com Accept: application/vnd.github.raw).
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from shapely.geometry import GeometryCollection, LineString, MultiLineString, MultiPolygon, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'scripts' / '.cache'
OUT = ROOT / 'src' / 'game' / 'city' / 'geo.json'
HALF = 2800.0
SIMPLIFY = 4.0

# Cidades jogáveis (id do atlas → lat/lon do centro real).
CITIES: dict[str, tuple[float, float]] = {
    'c1044': (38.725, -9.147),   # Lisboa
    'c1146': (40.402, -3.685),   # Madrid
    'c1039': (41.385, 2.181),    # Barcelona
    'c746': (37.405, -5.980),    # Sevilha
    'c830': (39.487, -0.402),    # Valência
    'c225': (43.250, -2.930),    # Bilbao
    'c224': (42.220, -8.730),    # Vigo
    'c205': (37.880, -4.770),    # Córdoba
    'c65': (32.650, -16.880),    # Funchal
    'c223': (37.748, -25.667),   # Ponta Delgada
    'c669': (28.100, -15.430),   # Las Palmas
}

RIVER_WIDTH = {
    'Guadalquivir': 90.0,
    'Tejo': 320.0,
    'Tagus': 320.0,
    'Douro': 160.0,
    'Ebro': 120.0,
}


def project(lon: float, lat: float, lon0: float, lat0: float) -> tuple[float, float]:
    x = (lon - lon0) * 111320.0 * math.cos(math.radians(lat0))
    y = (lat - lat0) * 110574.0
    return x, y


def rings_of(geom) -> list[list[list[float]]]:
    """Converte Polygon/MultiPolygon em [[anel externo, furos...], ...]."""
    polygons = []
    if isinstance(geom, Polygon):
        polygons = [geom]
    elif isinstance(geom, MultiPolygon):
        polygons = list(geom.geoms)
    elif isinstance(geom, GeometryCollection):
        for part in geom.geoms:
            polygons.extend(rings_of(part))
        return polygons
    out = []
    for polygon in polygons:
        if polygon.is_empty or polygon.area < 500:
            continue
        rings = [[[round(x, 1), round(y, 1)] for x, y in polygon.exterior.coords]]
        for interior in polygon.interiors:
            if Polygon(interior).area < 2000:
                continue
            rings.append([[round(x, 1), round(y, 1)] for x, y in interior.coords])
        out.append(rings)
    return out


def lines_of(geom) -> list[list[list[float]]]:
    lines = []
    if isinstance(geom, LineString):
        lines = [geom]
    elif isinstance(geom, MultiLineString):
        lines = list(geom.geoms)
    elif isinstance(geom, GeometryCollection):
        for part in geom.geoms:
            lines.extend(lines_of(part))
    out = []
    for line in lines:
        if line.is_empty or line.length < 40:
            continue
        out.append([[round(x, 1), round(y, 1)] for x, y in line.coords])
    return out


def localize(geom, lon0: float, lat0: float):
    """Transforma a geometria para metros locais com um clipping retangular."""
    def transform(coords):
        return [project(lon, lat, lon0, lat0) for lon, lat in coords]

    def convert(part):
        if isinstance(part, Polygon):
            return Polygon(transform(part.exterior.coords), [transform(r.coords) for r in part.interiors])
        if isinstance(part, LineString):
            return LineString(transform(part.coords))
        if isinstance(part, MultiPolygon):
            return MultiPolygon([convert(p) for p in part.geoms])
        if isinstance(part, MultiLineString):
            return MultiLineString([convert(l) for l in part.geoms])
        return part

    return convert(geom)


def main() -> None:
    countries_path = CACHE / 'ne_10m_admin_0_countries.geojson'
    rivers_path = CACHE / 'ne_10m_rivers_lake_centerlines.geojson'
    lakes_path = CACHE / 'ne_10m_lakes.geojson'
    for path in (countries_path, rivers_path, lakes_path):
        if not path.exists():
            sys.exit(f'faltando {path} — coloque os GeoJSON do Natural Earth em scripts/.cache/')

    print('carregando Natural Earth…')
    countries = json.loads(countries_path.read_text())['features']
    rivers = json.loads(rivers_path.read_text())['features']
    lakes = json.loads(lakes_path.read_text())['features']

    result: dict[str, dict] = {'version': 1, 'cities': {}}
    for city_id, (lat, lon) in CITIES.items():
        lon_delta = HALF / (111320.0 * math.cos(math.radians(lat)))
        lat_delta = HALF / 110574.0
        clip_geo = box(lon - lon_delta * 1.35, lat - lat_delta * 1.35, lon + lon_delta * 1.35, lat + lat_delta * 1.35)

        def intersects(feature) -> bool:
            from shapely.geometry import shape
            try:
                return shape(feature['geometry']).intersects(clip_geo)
            except Exception:
                return False

        nearby_countries = [f for f in countries if intersects(f)]
        from shapely.geometry import shape
        land_union = unary_union([shape(f['geometry']) for f in nearby_countries]).intersection(clip_geo)
        land = rings_of(localize(land_union, lon, lat))

        nearby_rivers = [f for f in rivers if intersects(f)]
        river_lines = []
        for feature in nearby_rivers:
            geom = shape(feature['geometry']).intersection(clip_geo)
            width = RIVER_WIDTH.get(feature['properties'].get('name') or '', 55.0)
            for line in lines_of(localize(geom, lon, lat)):
                river_lines.append({'w': width, 'pts': line})

        nearby_lakes = [f for f in lakes if intersects(f)]
        lake_polys = []
        for feature in nearby_lakes:
            geom = shape(feature['geometry']).intersection(clip_geo)
            lake_polys.extend(rings_of(localize(geom, lon, lat)))

        local_clip = box(-HALF, -HALF, HALF, HALF)
        land = [rings for rings in land if unary_union([Polygon(rings[0], rings[1:])]).buffer(0).intersects(local_clip)]
        river_lines = [line for line in river_lines if LineString([[x, y] for x, y in line['pts']]).intersects(local_clip)]

        has_water = any(abs(x) > HALF - 30 or abs(y) > HALF - 30 for rings in land for x, y in rings[0][:1])
        result['cities'][city_id] = {
            'lat': lat,
            'lon': lon,
            'land': land,
            'rivers': river_lines,
            'lakes': lake_polys,
            'coastal': bool(land and len(land[0][0]) > 200) and has_water,
        }
        print(f"  {city_id}: {len(land)} polígonos de terra, {len(river_lines)} rios, {len(lake_polys)} lagos")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1024:.0f} kB")


if __name__ == '__main__':
    main()
