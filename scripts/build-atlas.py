#!/usr/bin/env python3
"""Gera o atlas do TESSERA a partir do Natural Earth (domínio público).

Entradas (scripts/.cache, baixadas automaticamente se ausentes):
  - ne_50m_admin_0_countries.geojson
  - ne_10m_admin_1_states_provinces.geojson
  - ne_50m_populated_places_simple.geojson

Saídas:
  - src/game/atlas/world.json      dados de jogo (países, províncias, cidades, adjacência)
  - src/game/atlas/outline.json    contornos simplificados para o globo e o mapa 2D
  - public/atlas/geo/{ISO}.json    contorno detalhado + geometria das províncias (carregado sob demanda)

Uso:  python3 scripts/build-atlas.py
Requer: shapely (`pip install shapely`).
"""
from __future__ import annotations

import json
import math
import os
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

try:
    from shapely.geometry import Polygon, MultiPolygon, GeometryCollection, shape
    from shapely.ops import unary_union
    from shapely.prepared import prep
except ImportError:  # pragma: no cover
    sys.exit('shapely é necessário: pip install shapely')

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'scripts' / '.cache'
GAME_OUT = ROOT / 'src' / 'game' / 'atlas'
GEO_OUT = ROOT / 'public' / 'atlas' / 'geo'

RAW = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
FILES = {
    'countries.geojson': 'ne_50m_admin_0_countries.geojson',
    'states.geojson': 'ne_10m_admin_1_states_provinces.geojson',
    'cities.geojson': 'ne_50m_populated_places_simple.geojson',
}

# ── Atributos editoriais ─────────────────────────────────────────────────────

DESERT = set('DZA LBY EGY SAU ARE OMN YEM JOR IRQ SYR NAM BWA MRT MLI NER TCD SDN ERI SOM DJI AUS MNG KAZ UZB TKM AZE QAT BHR KWT'.split())
MOUNTAIN = set('NPL BTN CHE AUT GEO ARM TJK KGZ LAO LSO RWA BOL PER ECU CHL NOR ISL AFG PAK IRN TUR COL MEX NZL ETH KEN TZA UGA JPN AND'.split())
FOREST = set('BRA COD COG GAB CMR CAF IDN MYS VEN GUY SUR FIN SWE RUS CAN PNG MMR THA VNM BLZ NIC HND GTM PAN CRI NGA GHA CIV LBR SLE TGO BEN LVA EST LTU BLR'.split())
COAST = set('PRT GBR IRL GRC HRV SGP MDV FJI WSM TON VUT SLB KIR MHL FSM PLW NRU TUV BRB BHS CUB JAM HTI DOM TTO ATG DMA GRD KNA LCA VCT SYC MUS COM CPV STP BHR MLT CYP TWN KOR ISR LBN NLD DNK'.split())
HILL = set('ITA ESP SVN SVK CZE HUN ROU BGR SRB BIH ALB MKD MNE MAR TUN ZAF ZWE URY ARG MDA UKR'.split())

RARE = set('CHN USA AUS MMR VNM BRA RUS IND ZAF COD CAN TAN MDG'.split())
ENERGY = set('SAU RUS USA IRN IRQ KWT ARE QAT OMN NOR CAN NGA VEN AZE KAZ TKM DZA LBY AGO MEX BRA ECU COL BOL TTO BRN MOZ IDN MYS VNM EGY'.split())
MINING = set('AUS CHL PER COD ZAF RUS BRA IND CHN MNG ZMB KAZ IDN PHL UKR SWE MRT NER GIN SLE ZWE BWA NAM MAR JOR'.split())
FISHING = set('JPN PER CHL NOR ISL IDN VNM PHL GBR ESP PRT MAR RUS CAN USA KOR MMR THA NZL AUS SEN NAM CPV'.split())
FARM = set('BRA USA IND CHN ARG UKR FRA RUS CAN AUS NGA THA VNM IDN MEX TUR PAK DEU POL ROU ESP ITA EGY IRN'.split())
TIMBER = set('RUS BRA CAN IDN SWE FIN COD COG CMR MYS PNG PER USA CHL ARG NZL SUR GUY GAB'.split())

NODE_OVERRIDES = {
    'PRT': 'pesca', 'ESP': 'fertil', 'ITA': 'fertil', 'AUT': 'madeira',
    'GBR': 'energia', 'IRL': 'fertil', 'TUR': 'minerio', 'BGR': 'fertil',
    'FRA': 'fertil', 'DEU': 'industria_placeholder', 'NLD': 'fertil',
    'MAR': 'pesca', 'DZA': 'energia', 'LBY': 'energia', 'EGY': 'fertil',
    'SAU': 'energia', 'IRN': 'energia', 'IRQ': 'energia', 'ISR': 'nenhum',
    'JPN': 'pesca', 'KOR': 'minerio', 'CHN': 'raro', 'IND': 'fertil',
    'PAK': 'fertil', 'BGD': 'fertil', 'THA': 'fertil', 'VNM': 'fertil',
    'IDN': 'energia', 'PHL': 'pesca', 'MYS': 'madeira', 'SGP': 'nenhum',
    'AUS': 'minerio', 'NZL': 'pesca', 'USA': 'energia', 'CAN': 'energia',
    'MEX': 'energia', 'BRA': 'fertil', 'ARG': 'fertil', 'CHL': 'minerio',
    'PER': 'minerio', 'COL': 'energia', 'VEN': 'energia', 'BOL': 'minerio',
    'ECU': 'energia', 'URY': 'fertil', 'PRY': 'energia',
    'ZAF': 'minerio', 'NGA': 'energia', 'COD': 'raro', 'KEN': 'fertil',
    'ETH': 'fertil', 'TZA': 'raro', 'MOZ': 'energia', 'AGO': 'energia',
    'GHA': 'minerio', 'CIV': 'fertil', 'SEN': 'pesca', 'NAM': 'minerio',
    'BWA': 'minerio', 'ZMB': 'minerio', 'ZWE': 'minerio',
    'RUS': 'energia', 'UKR': 'fertil', 'POL': 'fertil', 'ROU': 'fertil',
    'HUN': 'fertil', 'CZE': 'minerio', 'SVK': 'fertil', 'SRB': 'minerio',
    'HRV': 'pesca', 'GRC': 'pesca', 'BGR': 'fertil', 'ALB': 'minerio',
    'CHE': 'nenhum', 'SWE': 'madeira', 'NOR': 'energia', 'FIN': 'madeira',
    'DNK': 'pesca', 'ISL': 'pesca', 'BEL': 'fertil', 'LUX': 'nenhum',
    'KAZ': 'energia', 'UZB': 'fertil', 'TKM': 'energia', 'KGZ': 'minerio',
    'TJK': 'minerio', 'MNG': 'minerio', 'GEO': 'minerio', 'ARM': 'minerio',
    'AZE': 'energia', 'ISL': 'pesca',
}
NODE_OVERRIDES = {k: v for k, v in NODE_OVERRIDES.items() if v != 'industria_placeholder'}

CONTINENTS = {
    'Africa': 'África',
    'Asia': 'Ásia',
    'Europe': 'Europa',
    'North America': 'América do Norte',
    'South America': 'América do Sul',
    'Oceania': 'Oceania',
}

START_SEATS = {
    'PRT': ('concordia', True),
    'ESP': ('concordia', False),
    'ITA': ('aurelia', True),
    'AUT': ('aurelia', False),
    'GBR': ('kestrel', True),
    'IRL': ('kestrel', False),
    'TUR': ('vantor', True),
    'BGR': ('vantor', False),
}

# Ligações marítimas curadas (estreitos e rotas históricas) que a distância bruta perde.
SEA_LINKS = [
    ('USA', 'RUS'), ('JPN', 'KOR'), ('JPN', 'RUS'), ('TWN', 'CHN'), ('PHL', 'MYS'),
    ('AUS', 'NZL'), ('AUS', 'IDN'), ('IDN', 'SGP'), ('LKA', 'IND'), ('MDG', 'MOZ'),
    ('GBR', 'FRA'), ('ESP', 'MAR'), ('ITA', 'TUN'), ('GRC', 'TUR'), ('CUB', 'USA'),
    ('HTI', 'USA'), ('DOM', 'USA'), ('ISL', 'GBR'), ('NOR', 'DNK'), ('SWE', 'FIN'),
    ('EST', 'FIN'), ('MLT', 'ITA'), ('CYP', 'TUR'), ('CYP', 'GRC'), ('BHR', 'QAT'),
    ('ARE', 'IRN'), ('OMN', 'IRN'), ('DJI', 'YEM'), ('ERI', 'YEM'), ('SEN', 'CPV'),
    ('BHS', 'USA'), ('TTO', 'VEN'), ('SUR', 'TTO'), ('GUY', 'TTO'), ('BRB', 'VCT'),
    ('LCA', 'FRA'), ('ATG', 'KNA'), ('FJI', 'NZL'), ('FJI', 'AUS'), ('PNG', 'AUS'),
    ('SLB', 'PNG'), ('VUT', 'SLB'), ('WSM', 'FJI'), ('TON', 'FJI'), ('KIR', 'MHL'),
    ('FSM', 'PNG'), ('PLW', 'PHL'), ('TLS', 'IDN'), ('BRN', 'MYS'), ('KHM', 'THA'),
    ('MMR', 'BGD'), ('LKA', 'MDV'), ('ZAF', 'NAM'), ('MOZ', 'TZA'), ('KEN', 'TZA'),
    ('UGA', 'TZA'), ('RWA', 'TZA'), ('BDI', 'TZA'), ('COD', 'TZA'), ('MWI', 'MOZ'),
    ('ZMB', 'MOZ'), ('ZWE', 'MOZ'), ('BWA', 'ZAF'), ('LSO', 'ZAF'), ('SWZ', 'ZAF'),
    ('GMB', 'SEN'), ('GNB', 'SEN'), ('SLE', 'LBR'), ('TGO', 'GHA'), ('BEN', 'NGA'),
    ('GNQ', 'CMR'), ('GAB', 'GNQ'), ('COG', 'COD'), ('CAF', 'COD'), ('SSD', 'SDN'),
    ('JOR', 'ISR'), ('LBN', 'CYP'), ('SYR', 'CYP'), ('GEO', 'TUR'), ('ARM', 'TUR'),
    ('AZE', 'TKM'), ('KAZ', 'AZE'), ('UZB', 'TKM'), ('AFG', 'TJK'), ('PAK', 'OMN'),
    ('IND', 'MMR'), ('BGD', 'MMR'), ('NPL', 'IND'), ('BTN', 'IND'), ('MDV', 'LKA'),
    ('KOR', 'CHN'), ('TWN', 'PHL'), ('MNG', 'RUS'), ('PRK', 'KOR'), ('PRK', 'CHN'),
    ('JAM', 'CUB'), ('JAM', 'HTI'), ('CYM', 'CUB'), ('BHS', 'CUB'), ('BHS', 'USA'),
    ('BMU', 'USA'), ('GRL', 'CAN'), ('GRL', 'ISL'), ('FRO', 'ISL'), ('FRO', 'NOR'),
    ('NCL', 'AUS'), ('NCL', 'NZL'), ('PYF', 'NZL'), ('COK', 'NZL'), ('NIU', 'NZL'),
    ('WLF', 'FJI'), ('GUM', 'PHL'), ('MNP', 'JPN'), ('ASM', 'WSM'), ('TUV', 'FJI'),
    ('NRU', 'KIR'), ('KIR', 'MHL'), ('MHL', 'FSM'), ('STP', 'GAB'), ('CPV', 'SEN'),
    ('GRD', 'TTO'), ('MSR', 'ATG'), ('AIA', 'ATG'), ('VGB', 'USA'), ('TCA', 'BHS'),
    ('SXM', 'ATG'), ('BLM', 'ATG'), ('MAF', 'ATG'), ('ABW', 'VEN'), ('CUW', 'VEN'),
    ('FLK', 'ARG'), ('ALD', 'FIN'), ('ALD', 'SWE'), ('PCN', 'NCL'), ('NFK', 'NCL'),
    ('SPM', 'CAN'), ('TON', 'NZL'), ('KNA', 'ATG'), ('VCT', 'BRB'),
]
SEA_LINKS = {tuple(sorted(pair)) for pair in SEA_LINKS}


# ── Utilidades ───────────────────────────────────────────────────────────────

def download() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for local, remote in FILES.items():
        path = CACHE / local
        if path.exists():
            continue
        print(f'baixando {remote}…')
        urllib.request.urlretrieve(RAW + remote, path)


def load(name: str) -> dict:
    with open(CACHE / name, encoding='utf-8') as handle:
        return json.load(handle)


def polygon_list(geom) -> list[Polygon]:
    out: list[Polygon] = []
    if geom is None or geom.is_empty:
        return out
    if geom.geom_type == 'Polygon':
        out.append(geom)
    elif geom.geom_type in ('MultiPolygon', 'GeometryCollection'):
        for part in geom.geoms:
            out.extend(polygon_list(part))
    return out


def spherical_area_km2(geom) -> float:
    """Área aproximada de um polígono lon/lat (raio terrestre 6371 km)."""
    total = 0.0
    for poly in polygon_list(geom):
        for ring in [poly.exterior, *poly.interiors]:
            s = 0.0
            coords = list(ring.coords)
            for i in range(len(coords) - 1):
                lon1, lat1 = coords[i]
                lon2, lat2 = coords[i + 1]
                s += math.radians(lon2 - lon1) * (2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2)))
            total += s * 6371.0 * 6371.0 / 2.0
    return abs(total)


def clean_geometry(geom, min_area: float):
    polys = [p for p in polygon_list(geom) if p.area >= min_area]
    if not polys:
        polys = sorted(polygon_list(geom), key=lambda p: p.area, reverse=True)[:1]
    return unary_union(polys)


def flat_rings(geom, tolerance: float, precision: int, min_area: float = 0.0) -> list:
    """[[ [x,y,...], [buraco...] ], ...] com coordenadas arredondadas."""
    geom = geom.simplify(tolerance, preserve_topology=True)
    polygons = []
    for poly in polygon_list(geom):
        if not poly.is_valid:
            poly = poly.buffer(0)
        for part in polygon_list(poly):
            if part.area < min_area:
                continue
            rings = []
            for ring in [part.exterior, *part.interiors]:
                coords = list(ring.coords)
                flat = []
                for lon, lat in coords:
                    x = round(lon, precision)
                    y = round(lat, precision)
                    if flat and flat[-2] == x and flat[-1] == y:
                        continue
                    flat.extend([x, y])
                if len(flat) >= 8:
                    rings.append(flat)
            if rings:
                polygons.append(rings)
    return polygons


def slug(text: str) -> str:
    return ''.join(ch if ch.isalnum() else '-' for ch in text.lower()).strip('-')


def node_for(iso: str, rng: int) -> str:
    if iso in NODE_OVERRIDES:
        return NODE_OVERRIDES[iso]
    for group, node in ((RARE, 'raro'), (ENERGY, 'energia'), (MINING, 'minerio'), (FISHING, 'pesca'), (FARM, 'fertil'), (TIMBER, 'madeira')):
        if iso in group:
            return node
    return 'nenhum' if rng % 4 else 'fertil'


def placeholder_ring(lat: float, lon: float, area_km2: float, steps: int = 14) -> list:
    """Microestados e ilhas minúsculas perdem a geometria na simplificação.
    Gera um polígono mínimo em volta do centroide para que continuem visíveis
    e clicáveis no globo, sem inventar território em escala real."""
    import math
    radius = min(0.9, max(0.12, math.sqrt(max(area_km2, 1)) / 95))
    ring = []
    for step in range(steps):
        angle = (step / steps) * math.tau
        lat_off = math.sin(angle) * radius
        lon_off = math.cos(angle) * radius / max(0.18, math.cos(math.radians(lat)))
        ring.extend([round(lon + lon_off, 3), round(max(-89.5, min(89.5, lat + lat_off)), 3)])
    ring.extend(ring[:2])
    return [[ring]]


def terrain_for(iso: str, area: float) -> str:
    if iso in DESERT:
        return 'deserto'
    if iso in MOUNTAIN:
        return 'montanha'
    if iso in FOREST:
        return 'floresta'
    if iso in COAST:
        return 'costa'
    if iso in HILL:
        return 'colina'
    return 'planicie'


def strategic_for(iso: str, pop: int, area: float, node: str) -> int:
    value = 1
    if pop >= 40e6:
        value = 2
    if pop >= 120e6 or area >= 4_500_000:
        value = 3
    if node in ('raro', 'energia') and pop >= 15e6 and value < 3:
        value += 1
    if iso in {'USA', 'CHN', 'RUS', 'IND', 'BRA', 'SAU', 'AUS', 'JPN', 'DEU', 'GBR', 'FRA', 'TUR', 'EGY', 'PAN', 'SGP'}:
        value = 3
    return max(1, min(3, value))


# ── Construção ───────────────────────────────────────────────────────────────

def main() -> None:
    download()
    GAME_OUT.mkdir(parents=True, exist_ok=True)
    GEO_OUT.mkdir(parents=True, exist_ok=True)

    countries_raw = load('countries.geojson')['features']
    states_raw = load('states.geojson')['features']
    cities_raw = load('cities.geojson')['features']

    denied = {'ATC', 'IOA'}
    kept = [
        f for f in countries_raw
        if f['properties'].get('CONTINENT') not in ('Antarctica', 'Seven seas (open ocean)')
        and f['properties'].get('ADM0_A3')
        and f['properties'].get('ADM0_A3') not in denied
    ]
    kept.sort(key=lambda f: f['properties']['NAME_SORT'])

    countries: list[dict] = []
    geoms: dict[str, object] = {}
    index: dict[str, int] = {}
    for feature in kept:
        p = feature['properties']
        iso = p['ADM0_A3']
        geom = shape(feature['geometry'])
        geom = clean_geometry(geom, 0.012)
        index[iso] = len(countries)
        geoms[iso] = geom
        pop = int(p.get('POP_EST') or 0)
        if pop <= 0:
            pop = 500_000
        area = spherical_area_km2(geom)
        name = p.get('NAME_PT') or p.get('NAME') or iso
        check = sum(ord(ch) for ch in iso) % 4
        node = node_for(iso, check)
        countries.append({
            'id': iso,
            'name': name,
            'continent': CONTINENTS.get(p.get('CONTINENT'), 'Outros'),
            'pop': pop,
            'area': int(round(area)),
            'lat': round(float(p.get('LABEL_Y') or geom.centroid.y), 3),
            'lon': round(float(p.get('LABEL_X') or geom.centroid.x), 3),
            'terrain': terrain_for(iso, area),
            'node': node,
            'strategic': strategic_for(iso, pop, area, node),
            'provinces': 0,
            'cities': 0,
        })

    # Adjacência: fronteira terrestre + rotas marítimas.
    adjacency: dict[str, dict[str, int]] = {c['id']: {} for c in countries}
    simple = {iso: geoms[iso].simplify(0.02) for iso in geoms}
    from shapely.strtree import STRtree
    iso_list = [c['id'] for c in countries]
    tree = STRtree([simple[iso] for iso in iso_list])
    for i, iso in enumerate(iso_list):
        g = simple[iso]
        for j in tree.query(g.buffer(1.1)):
            j = int(j)
            if j <= i:
                continue
            other = iso_list[j]
            d = g.distance(simple[other])
            if d < 0.05:
                adjacency[iso][other] = 0
                adjacency[other][iso] = 0
            elif d < 0.7:
                adjacency[iso][other] = 1
                adjacency[other][iso] = 1
    for a, b in SEA_LINKS:
        if a in adjacency and b in adjacency and b not in adjacency[a]:
            adjacency[a][b] = 1
            adjacency[b][a] = 1

    # Pequenas ilhas sem vínculo terrestre recebem relevo costeiro.
    for country in countries:
        iso = country['id']
        edges = adjacency[iso].values()
        if country['terrain'] == 'planicie' and country['area'] < 120_000 and (not edges or all(kind == 1 for kind in edges)):
            country['terrain'] = 'costa'

    # Províncias (admin-1) e cidades.
    states_by_iso: dict[str, list[dict]] = defaultdict(list)
    for feature in states_raw:
        p = feature['properties']
        iso = p.get('adm0_a3')
        if iso in index:
            states_by_iso[iso].append(feature)

    provinces: list[list] = []
    province_index: dict[str, int] = {}
    province_polys: dict[str, object] = {}
    province_iso: dict[str, str] = {}
    for iso in iso_list:
        features = states_by_iso.get(iso, [])
        if not features:
            provinces.append([f'{iso}-00', index[iso], countries[index[iso]]['name'], countries[index[iso]]['lat'], countries[index[iso]]['lon'], countries[index[iso]]['pop'], 0, 1])
            province_index[f'{iso}-00'] = len(provinces) - 1
            province_polys[f'{iso}-00'] = geoms[iso]
            province_iso[f'{iso}-00'] = iso
            countries[index[iso]]['provinces'] = 1
            continue
        seen = set()
        for feature in features:
            p = feature['properties']
            name = p.get('name_pt') or p.get('name') or 'Região'
            base = p.get('adm1_code') or f"{iso}-{slug(name)}"
            pid = base
            n = 2
            while pid in seen:
                pid = f'{base}-{n}'
                n += 1
            seen.add(pid)
            geom = shape(feature['geometry'])
            if geom.is_empty:
                continue
            area = spherical_area_km2(geom)
            provinces.append([pid, index[iso], name, round(float(p.get('latitude') or geom.centroid.y), 3), round(float(p.get('longitude') or geom.centroid.x), 3), 0, 0, 0, int(round(area))])
            province_index[pid] = len(provinces) - 1
            province_polys[pid] = geom
            province_iso[pid] = iso
        countries[index[iso]]['provinces'] = len([p for p in provinces if p[1] == index[iso]])

    # Cidades: casa cada uma com sua província.
    cities: list[list] = []
    city_pops: dict[str, float] = defaultdict(float)
    city_count: dict[str, int] = defaultdict(int)
    province_capital: dict[str, int] = {}
    country_capital: dict[str, str] = {}
    prepared_cache: dict[str, list] = {}
    for raw in cities_raw:
        p = raw['properties']
        iso = p.get('adm0_a3')
        if iso not in index:
            continue
        lon = p.get('longitude')
        lat = p.get('latitude')
        if lon is None or lat is None:
            continue
        from shapely.geometry import Point
        point = Point(lon, lat)
        candidates = [pid for pid in province_polys if province_iso[pid] == iso]
        chosen = None
        if iso in states_by_iso and states_by_iso[iso]:
            # procura a província que contém o ponto (geometria original)
            if iso not in prepared_cache:
                prepared_cache[iso] = [(pid, prep(province_polys[pid])) for pid in candidates]
            for pid, pg in prepared_cache[iso]:
                if pg.contains(point):
                    chosen = pid
                    break
        if chosen is None:
            chosen = min(candidates, key=lambda pid: province_polys[pid].distance(point)) if candidates else f'{iso}-00'
        population = float(p.get('pop_max') or 0)
        is_capital = 1 if p.get('adm0cap') else 0
        name = p.get('name') or p.get('nameascii') or 'Cidade'
        cid = f'c{len(cities) + 1}'
        cities.append([cid, index[iso], chosen, name, round(float(lat), 3), round(float(lon), 3), int(population), is_capital, int(p.get('scalerank') or 10)])
        city_pops[chosen] += population
        city_count[chosen] += 1
        countries[index[iso]]['cities'] += 1
        if is_capital and iso not in country_capital:
            country_capital[iso] = name
            province_capital[chosen] = 1

    # População provincial: mistura de população urbana e área, normalizada ao total do país.
    for iso in iso_list:
        ids = [pid for pid in province_polys if province_iso[pid] == iso]
        if not ids:
            continue
        total_pop = float(countries[index[iso]]['pop'])
        weights = {}
        for pid in ids:
            area_share = province_polys[pid].area / max(1e-9, geoms[iso].area)
            weights[pid] = city_pops.get(pid, 0) + total_pop * area_share * 0.42
        total_weight = sum(weights.values()) or 1
        for pid in ids:
            row = provinces[province_index[pid]]
            row[5] = int(round(total_pop * weights[pid] / total_weight))
            row[6] = city_count.get(pid, 0)
            row[7] = 1 if province_capital.get(pid) else 0

    # Saída: world.json
    world = {
        'version': 2,
        'source': 'Natural Earth 5.1.2 (domínio público)',
        'generated': {'countries': len(countries), 'provinces': len(provinces), 'cities': len(cities)},
        'countries': [
            dict(c, capital=country_capital.get(c['id'], ''), neighbors=sorted(adjacency[c['id']].items(), key=lambda kv: kv[0]))
            for c in countries
        ],
        'provinces': provinces,
        'cities': cities,
    }
    (GAME_OUT / 'world.json').write_text(json.dumps(world, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    # Saída: contornos simplificados (globo e fallback 2D).
    outline = {}
    centroids = {c['id']: (c['lat'], c['lon'], c['area']) for c in countries}
    for iso in iso_list:
        rings = flat_rings(geoms[iso], 0.22, 2, min_area=0.02)
        if not rings and iso in centroids:
            lat, lon, area = centroids[iso]
            rings = placeholder_ring(lat, lon, area)
            print(f"  contorno mínimo para {iso}")
        if rings:
            outline[iso] = rings
    (GAME_OUT / 'outline.json').write_text(json.dumps({'version': 2, 'shapes': outline}, separators=(',', ':')), encoding='utf-8')

    # Saída: detalhe por país (geometria + províncias) — carregado sob demanda.
    for iso in iso_list:
        country_rings = flat_rings(geoms[iso], 0.04, 3, min_area=0.004)
        if not country_rings and iso in centroids:
            lat, lon, area = centroids[iso]
            country_rings = placeholder_ring(lat, lon, area)
        detail = {
            'iso': iso,
            'country': country_rings,
            'provinces': {},
        }
        for pid in province_polys:
            if province_iso[pid] != iso:
                continue
            rings = flat_rings(province_polys[pid], 0.05, 3, min_area=0.002)
            if rings:
                detail['provinces'][pid] = rings
        (GEO_OUT / f'{iso}.json').write_text(json.dumps(detail, separators=(',', ':')), encoding='utf-8')

    # Relatório
    total_geo = sum((GEO_OUT / f'{iso}.json').stat().st_size for iso in iso_list)
    print(f"países: {len(countries)}  províncias: {len(provinces)}  cidades: {len(cities)}")
    print(f"world.json: {(GAME_OUT / 'world.json').stat().st_size / 1024:.0f} kB")
    print(f"outline.json: {(GAME_OUT / 'outline.json').stat().st_size / 1024:.0f} kB")
    print(f"geo/*.json: {total_geo / 1024:.0f} kB em {len(iso_list)} arquivos")
    print('sem adjacência:', [iso for iso in iso_list if not adjacency[iso]])
    for iso in ('PRT', 'ESP', 'ITA', 'AUT', 'GBR', 'IRL', 'TUR', 'BGR'):
        c = countries[index[iso]]
        print(iso, c['name'], '| pop', c['pop'], '| terreno', c['terrain'], '| nó', c['node'], '| prov', c['provinces'], '| viz', list(adjacency[iso])[:8])


if __name__ == '__main__':
    main()
