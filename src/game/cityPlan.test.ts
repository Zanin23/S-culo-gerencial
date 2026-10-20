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
      expect(plan.stats.blocks, id).toBeGreaterThan(40);
      expect(plan.stats.roadKm, id).toBeGreaterThan(40);
      expect(plan.stats.buildings, id).toBeGreaterThan(200);
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

  it('liga cada cidade-sede a um país real do tabuleiro', () => {
    for (const id of SEAT_CITIES) {
      const city = CITY_BY_ID[id];
      expect(city, id).toBeTruthy();
      expect(COUNTRY_BY_ID[city.countryId], id).toBeTruthy();
      expect(['PRT', 'ESP']).toContain(city.countryId);
    }
  });
});
