import { describe, expect, it } from 'vitest';
import { CITY_BY_ID, COUNTRY_BY_ID } from './atlas';
import {
  CITY_CELLS,
  generateCityPlan,
  getCityPlan,
  isWaterAt,
  sampleHeight,
  type CityPlan,
} from './cityPlan';
import { SEAT_CITIES } from './state';

function cellOf(plan: CityPlan, x: number, y: number): number {
  const half = plan.size / 2;
  const i = Math.floor((x + half) / plan.cell);
  const j = Math.floor((y + half) / plan.cell);
  if (i < 0 || j < 0 || i >= plan.cells || j >= plan.cells) return -1;
  return j * plan.cells + i;
}

describe('plano urbano 3D', () => {
  it('gera o mesmo plano para a mesma cidade e semente', () => {
    const a = generateCityPlan('c1044', 3);
    const b = generateCityPlan('c1044', 3);
    expect(a.stats).toEqual(b.stats);
    expect(a.buildings.length).toBe(b.buildings.length);
    expect(a.roads.length).toBe(b.roads.length);
    const c = generateCityPlan('c1044', 4);
    expect(c.stats.roadKm).not.toBe(a.stats.roadKm);
  });

  it('usa a geografia real de cada cidade-sede (água, terra e orla)', () => {
    for (const id of SEAT_CITIES) {
      const plan = getCityPlan(id, 0);
      expect(plan.land.some((value) => value === 1), id).toBe(true);
      expect(plan.elevation.length).toBe(CITY_CELLS * CITY_CELLS);
      expect(plan.stats.blocks, id).toBeGreaterThan(120);
      expect(plan.stats.roadKm, id).toBeGreaterThan(120);
      expect(plan.stats.buildings, id).toBeGreaterThan(600);
      expect(plan.trees.length, id).toBeGreaterThan(600);
      // Nada de prédio dentro da água.
      const inWater = plan.buildings.filter((building) => isWaterAt(plan, building.x, building.y));
      expect(inWater.length, `${id} tem ${inWater.length} prédios na água`).toBe(0);
    }
    // Lisboa e Barcelona são costeiras; Madrid não tem água no recorte.
    expect(getCityPlan('c1044', 0).stats.waterRatio).toBeGreaterThan(0.05);
    expect(getCityPlan('c1039', 0).stats.waterRatio).toBeGreaterThan(0.05);
    expect(getCityPlan('c1146', 0).stats.waterRatio).toBeLessThan(0.02);
  });

  it('desenha ruas apenas em terra e deixa lotes livres para a sede', () => {
    const plan = getCityPlan('c1044', 0);
    for (const road of plan.roads) {
      for (const [x, y] of road.pts) {
        expect(isWaterAt(plan, x, y), `${road.kind} na água em ${x},${y}`).toBe(false);
      }
    }
    expect(plan.plots.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(plan.plots.map((plot) => plot.id));
    expect(ids.size).toBe(plan.plots.length);
    for (const plot of plan.plots) {
      expect(plot.district).toMatch(/Centro|Expansão|Periferia/);
      const index = cellOf(plan, plot.x, plot.y);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(plan.water[index], plot.id).toBe(0);
      // O lote não pode ficar em cima de uma rua.
      expect(plan.road[index], plot.id).toBe(0);
    }
    // O primeiro lote é o mais próximo do centro — é o sugerido para a sede.
    const nearest = [...plan.plots].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
    expect(plan.plots[0].id).toBe(nearest.id);
  });

  it('mantém a elevação coerente e o relevo suave', () => {
    const plan = getCityPlan('c746', 0);
    let max = 0;
    let min = Number.POSITIVE_INFINITY;
    for (let index = 0; index < plan.elevation.length; index += 1) {
      if (plan.water[index]) continue;
      max = Math.max(max, plan.elevation[index]);
      min = Math.min(min, plan.elevation[index]);
    }
    expect(min).toBeGreaterThan(0);
    expect(max).toBeLessThan(700);
    const height = sampleHeight(plan, 0, 0);
    expect(Number.isFinite(height)).toBe(true);
    expect(sampleHeight(plan, -plan.size, -plan.size)).toBeGreaterThanOrEqual(0);
  });

  it('mistura tipologias, coberturas e alturas na mesma cidade', () => {
    const plan = getCityPlan('c1044', 0);
    const kinds = new Set(plan.buildings.map((building) => building.kind));
    const roofs = new Set(plan.buildings.map((building) => building.roof));
    const styles = new Set(plan.buildings.map((building) => building.style));
    expect(kinds.size).toBeGreaterThanOrEqual(7);
    expect(roofs.size).toBeGreaterThanOrEqual(4);
    expect(styles.size).toBeGreaterThanOrEqual(4);
    for (const building of plan.buildings) {
      expect(building.floors).toBeGreaterThanOrEqual(1);
      expect(building.roofH).toBeGreaterThan(0);
      expect(building.style).toBeGreaterThanOrEqual(0);
      expect(building.style).toBeLessThanOrEqual(6);
      // Poucos volumes grandes: nada de caixinhas espalhadas.
      expect(building.w).toBeGreaterThanOrEqual(16);
      expect(building.d).toBeGreaterThanOrEqual(11);
      expect(building.h).toBeGreaterThanOrEqual(5);
    }
    const heights = plan.buildings.map((building) => building.h);
    expect(Math.max(...heights)).toBeGreaterThan(80);
    expect(heights.filter((height) => height < 12).length).toBeGreaterThan(600);
  });

  it('organiza zonas legíveis: centro alto, indústria baixa e periferia rarefeita', () => {
    for (const id of SEAT_CITIES) {
      const plan = getCityPlan(id, 0);
      const byZone = new Map<string, number[]>();
      for (const building of plan.buildings) {
        expect(building.zone, id).toMatch(/centro|residencial|industrial|periferia/);
        const list = byZone.get(building.zone) ?? [];
        list.push(building.h);
        byZone.set(building.zone, list);
      }
      const average = (zone: string) => {
        const list = byZone.get(zone) ?? [];
        return list.reduce((sum, height) => sum + height, 0) / Math.max(1, list.length);
      };
      expect(byZone.get('centro')?.length, `${id} sem centro`).toBeGreaterThan(20);
      expect(byZone.get('residencial')?.length, `${id} sem bairros`).toBeGreaterThan(100);
      // A Ponta Delgada é minúscula: o distrito existe, mas em escala de vila.
      const pop = CITY_BY_ID[id].pop;
      const industrialMinimum = pop > 1_000_000 ? 80 : pop > 300_000 ? 40 : 10;
      expect(byZone.get('industrial')?.length, `${id} sem indústria`).toBeGreaterThan(industrialMinimum);
      // A silhueta da cidade conta a hierarquia sem nenhuma legenda.
      expect(average('centro'), `${id} centro`).toBeGreaterThan(average('residencial') * 2.2);
      expect(average('residencial'), `${id} bairros`).toBeGreaterThan(average('industrial'));
      // Indústria é reconhecível pelo tipo, não só pela altura.
      const industrial = plan.buildings.filter((building) => building.zone === 'industrial');
      const sheds = industrial.filter((building) => building.kind === 'galpao').length;
      expect(sheds / industrial.length, `${id} galpões`).toBeGreaterThan(0.5);
      // Galpões são baixos e compridos; torres são altas.
      for (const shed of industrial) expect(shed.h).toBeLessThan(22);
      for (const tower of plan.buildings.filter((building) => building.kind === 'torre')) {
        expect(tower.h).toBeGreaterThan(60);
      }
    }
  });

  it('ocupa as quadras com frentes contínuas em vez de pontos soltos', () => {
    const plan = getCityPlan('c1044', 0);
    // Quadras com pelo menos quatro volumes e casas alinhadas às ruas.
    const perBlock = new Map<string, number>();
    for (const building of plan.buildings) {
      const key = `${Math.round(building.x / 120)}:${Math.round(building.y / 120)}`;
      perBlock.set(key, (perBlock.get(key) ?? 0) + 1);
    }
    const dense = [...perBlock.values()].filter((count) => count >= 4).length;
    expect(dense).toBeGreaterThan(120);
    // Transição gradual: a ocupação cresce até o anel intermediário e cai na
    // borda — sem talho reto, mas também sem metrópole até o último metro.
    const half = plan.size / 2;
    const coverage = (start: number, end: number) => {
      let land = 0;
      let built = 0;
      for (let j = 0; j < plan.cells; j += 1) {
        for (let i = 0; i < plan.cells; i += 1) {
          if (!plan.land[j * plan.cells + i]) continue;
          const x = -half + (i + 0.5) * plan.cell;
          const y = -half + (j + 0.5) * plan.cell;
          const distance = Math.hypot(x, y);
          if (distance >= start && distance < end) land += 1;
        }
      }
      for (const building of plan.buildings) {
        const distance = Math.hypot(building.x, building.y);
        if (distance >= start && distance < end) built += building.w * building.d;
      }
      return built / Math.max(1, land * plan.cell * plan.cell);
    };
    const bands = [0, 0.35, 0.6, 0.8, 1].map((fraction) => half * fraction);
    const rings = [
      coverage(bands[0], bands[1]),
      coverage(bands[1], bands[2]),
      coverage(bands[2], bands[3]),
      coverage(bands[3], bands[4]),
    ];
    const peak = Math.max(...rings);
    expect(rings[0]).toBeGreaterThan(0.02);
    expect(rings[3]).toBeLessThan(peak * 0.9);
    expect(rings[3]).toBeGreaterThan(peak * 0.35);
  });

  it('não empilha edifícios uns sobre os outros', () => {
    const plan = getCityPlan('c1039', 0);
    // Confere num raio de 1,2 km, onde a densidade é maior.
    const near = plan.buildings.filter((building) => Math.hypot(building.x, building.y) < 1200);
    const buckets = new Map<string, typeof near>();
    const key = (i: number, j: number) => `${i}:${j}`;
    let overlaps = 0;
    for (const building of near) {
      const radius = Math.hypot(building.w, building.d) / 2;
      const i = Math.floor(building.x / 20);
      const j = Math.floor(building.y / 20);
      for (let di = -1; di <= 1; di += 1) {
        for (let dj = -1; dj <= 1; dj += 1) {
          for (const other of buckets.get(key(i + di, j + dj)) ?? []) {
            const distance = Math.hypot(other.x - building.x, other.y - building.y);
            if (distance < (Math.hypot(other.w, other.d) / 2 + radius) * 0.45) overlaps += 1;
          }
        }
      }
      const bucket = buckets.get(key(i, j));
      if (bucket) bucket.push(building);
      else buckets.set(key(i, j), [building]);
    }
    expect(near.length).toBeGreaterThan(300);
    expect(overlaps).toBe(0);
  });

  it('liga cada cidade-sede a um país real do tabuleiro', () => {
    for (const id of SEAT_CITIES) {
      const city = CITY_BY_ID[id];
      expect(city, id).toBeTruthy();
      expect(COUNTRY_BY_ID[city.countryId], id).toBeTruthy();
      expect(['PRT', 'ESP']).toContain(city.countryId);
    }
  });
});
