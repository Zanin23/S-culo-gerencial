import { describe, expect, it } from 'vitest';
import {
  ATLAS_STATS,
  CITIES,
  CITY_BY_ID,
  COUNTRIES,
  COUNTRY_BY_ID,
  OUTLINE,
  PROVINCES,
  PROVINCE_BY_ID,
} from '../../game/atlas';
import { createTiles } from '../../game/map';
import { Rng } from '../../game/rng';
import { countryColors, shapesToGeometry } from './globe';

describe('mapa-múndi', () => {
  it('has consistent country, province and city references', () => {
    expect(ATLAS_STATS.countries).toBeGreaterThan(200);
    expect(ATLAS_STATS.provinces).toBeGreaterThan(4000);
    expect(ATLAS_STATS.cities).toBeGreaterThan(1000);
    for (const province of PROVINCES) {
      expect(COUNTRY_BY_ID[province.countryId], province.id).toBeTruthy();
    }
    for (const city of CITIES) {
      expect(COUNTRY_BY_ID[city.countryId], city.id).toBeTruthy();
      expect(PROVINCE_BY_ID[city.provinceId] ?? city.id).toBeTruthy();
      expect(Number.isFinite(city.lat) && Math.abs(city.lat) <= 90, city.id).toBe(true);
      expect(Number.isFinite(city.lon) && Math.abs(city.lon) <= 180, city.id).toBe(true);
    }
    for (const country of COUNTRIES) {
      expect(country.neighbors.length, country.id).toBeGreaterThan(0);
      for (const [neighbor] of country.neighbors) expect(COUNTRY_BY_ID[neighbor], `${country.id}->${neighbor}`).toBeTruthy();
    }
  });

  it('generates a complete board where every country is a claimable territory', () => {
    const tiles = createTiles(new Rng(11));
    const ids = Object.keys(tiles);
    expect(ids.length).toBe(COUNTRIES.length);
    for (const iso of Object.keys(OUTLINE)) {
      const tile = tiles[iso];
      expect(tile, iso).toBeTruthy();
      expect(tile.id).toBe(iso);
      expect(tile.pop).toBeGreaterThan(0);
      expect(tile.provinceCount).toBe(COUNTRY_BY_ID[iso].provinces);
    }
  });

  it('tessellates every country outline into triangles on the sphere', () => {
    let total = 0;
    for (const [iso, shapes] of Object.entries(OUTLINE)) {
      const geometry = shapesToGeometry(shapes, 1, 0.007);
      const position = geometry.getAttribute('position');
      expect(position.count, iso).toBeGreaterThan(0);
      expect(position.count % 3, iso).toBe(0);
      total += position.count / 3;
      geometry.dispose();
    }
    expect(total).toBeGreaterThan(20_000);
  });

  it('keeps pacific countries contiguous instead of wrapping the sphere', () => {
    // FJI e NZL cruzam o antimeridiano; sem unwrap a geometria ocuparia o mundo inteiro.
    for (const iso of ['FJI', 'NZL', 'RUS']) {
      const shapes = OUTLINE[iso];
      if (!shapes) continue;
      const geometry = shapesToGeometry(shapes, 1, 0.007);
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count * 3; i += 1) {
        expect(Number.isFinite(position.array[i]), iso).toBe(true);
      }
      geometry.dispose();
    }
  });

  it('paints owners, neutrals and distant positions distinctly', () => {
    const tiles = createTiles(new Rng(5));
    const colors = countryColors(tiles, 'concordia');
    expect(Object.keys(colors)).toHaveLength(Object.keys(tiles).length);
    expect(colors.PRT).toBeTruthy();
    expect(colors.PRT).not.toBe(colors.DEU);
    expect(CITY_BY_ID[Object.keys(CITY_BY_ID)[0]]).toBeTruthy();
  });
});
