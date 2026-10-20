#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Gera public/atlas/cities-detail.json: as cidades reais do Natural Earth 10m
// que completam as 1.203 do atlas principal.
//
// Uso:
//   curl -L -H "Accept: application/vnd.github.raw" \
//     "https://api.github.com/repos/nvkelso/natural-earth-vector/contents/geojson/ne_10m_populated_places_simple.geojson?ref=master" \
//     -o /tmp/places10.geojson
//   node scripts/build-extra-cities.mjs /tmp/places10.geojson
//
// O arquivo de saída é servido por /atlas e baixado sob demanda pelo jogo; ele
// não entra no pacote JS. As cidades existentes (c1..c1203) nunca mudam de id.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const placesPath = process.argv[2] ?? '/tmp/places10.geojson';
const worldPath = path.join(ROOT, 'src/game/atlas/world.json');
const world = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
const places = JSON.parse(fs.readFileSync(placesPath, 'utf8')).features;

const isos = world.countries.map((c) => c.id);
const isoIndex = Object.fromEntries(isos.map((iso, i) => [iso, i]));

// Províncias: polígonos simplificados do próprio atlas + bbox.
const provsByIso = new Map();
for (const iso of isos) {
  const geo = JSON.parse(fs.readFileSync(path.join(ROOT, `public/atlas/geo/${iso}.json`), 'utf8'));
  const list = [];
  for (const [pid, shapes] of Object.entries(geo.provinces || {})) {
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    const rings = [];
    for (const shape of shapes) {
      for (const ring of shape) {
        rings.push(ring);
        for (let i = 0; i < ring.length; i += 2) {
          const lon = ring[i], lat = ring[i + 1];
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
    if (rings.length) list.push({ pid, rings, minLon, maxLon, minLat, maxLat });
  }
  provsByIso.set(iso, list);
}
const provinceRow = new Map(world.provinces.map((row) => [row[0], row]));

function inside(ring, lon, lat) {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const x1 = ring[i], y1 = ring[i + 1], x2 = ring[j], y2 = ring[j + 1];
    if ((y1 > lat) !== (y2 > lat) && lon < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) hit = !hit;
  }
  return hit;
}

function provinceFor(iso, lon, lat) {
  const list = provsByIso.get(iso) || [];
  let best = null, bestD = Infinity;
  for (const p of list) {
    if (lon < p.minLon - 0.02 || lon > p.maxLon + 0.02 || lat < p.minLat - 0.02 || lat > p.maxLat + 0.02) continue;
    for (const ring of p.rings) if (inside(ring, lon, lat)) return p.pid;
    const row = provinceRow.get(p.pid);
    if (row) {
      const d = (row[3] - lat) ** 2 + ((row[4] - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
      if (d < bestD) { bestD = d; best = p.pid; }
    }
  }
  if (best) return best;
  for (const p of list) {
    const row = provinceRow.get(p.pid);
    if (!row) continue;
    const d = (row[3] - lat) ** 2 + ((row[4] - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) { bestD = d; best = p.pid; }
  }
  return best;
}

const seenName = new Set(world.cities.map((c) => `${world.countries[c[1]].id}|${String(c[3]).toLowerCase()}`));
const seenGeo = new Set(world.cities.map((c) => `${world.countries[c[1]].id}|${c[4].toFixed(1)}|${c[5].toFixed(1)}`));
const round3 = (n) => Math.round(Number(n) * 1000) / 1000;

const extra = [];
for (const f of places) {
  const p = f.properties;
  const iso = p.adm0_a3;
  if (!(iso in isoIndex)) continue;
  const name = String(p.name || p.nameascii || '').trim();
  if (!name) continue;
  const pop = Number(p.pop_max || 0);
  const isCap = p.adm0cap ? 1 : 0;
  if (pop < 15000 && !isCap) continue;
  const key = `${iso}|${name.toLowerCase()}`;
  if (seenName.has(key)) continue;
  seenName.add(key);
  const lat = round3(p.latitude), lon = round3(p.longitude);
  const geoKey = `${iso}|${lat.toFixed(1)}|${lon.toFixed(1)}`;
  if (seenGeo.has(geoKey)) continue;
  seenGeo.add(geoKey);
  const province = provinceFor(iso, lon, lat);
  if (!province) continue;
  extra.push([isoIndex[iso], province, name, lat, lon, Math.round(pop), isCap, Math.min(10, Math.round(p.scalerank ?? 10))]);
}

// Ordem estável: país, população desc, nome. Ids c1204+ seguem essa ordem.
extra.sort((a, b) => a[0] - b[0] || b[5] - a[5] || a[2].localeCompare(b[2]));

for (const [iso, province] of extra) {
  world.countries[iso].cities += 1;
  const row = provinceRow.get(province);
  if (row) row[6] += 1;
}
world.generated.cities = world.cities.length + extra.length;
fs.writeFileSync(worldPath, JSON.stringify(world));

const outPath = path.join(ROOT, 'public/atlas/cities-detail.json');
fs.writeFileSync(outPath, JSON.stringify({
  version: 1,
  source: 'Natural Earth 10m populated places (domínio público)',
  startId: world.cities.length + 1,
  cities: extra,
}));
console.log(`cidades extras: ${extra.length} · ${(fs.statSync(outPath).size / 1024).toFixed(0)} kB`);
