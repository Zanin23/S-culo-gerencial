import { describe, expect, it } from 'vitest';
import { COUNTRIES, citiesOf, cityById, detailCitiesIn, detailCitiesLoaded, registerDetailCities } from './atlas';

describe('cidades de detalhe', () => {
  it('não pesa no início: o lote só existe depois do registro', () => {
    expect(detailCitiesLoaded()).toBe(false);
    expect(cityById('c9999')).toBeUndefined();
  });

  it('registra o lote extra com ids estáveis e busca por id/país/retângulo', () => {
    const iso = COUNTRIES.findIndex((country) => country.id === 'PRT');
    const province = 'PRT-1';
    const before = citiesOf('PRT').length;
    registerDetailCities(9001, [
      [iso, province, 'Aveiro', 40.64, -8.65, 80000, 0, 8],
      [iso, province, 'Faro', 37.02, -7.93, 64000, 0, 9],
      [iso, province, 'Bragança', 41.8, -6.75, 34000, 0, 9],
    ]);

    expect(detailCitiesLoaded()).toBe(true);
    expect(cityById('c9001')?.name).toBe('Aveiro');
    expect(cityById('c9003')?.name).toBe('Bragança');
    expect(citiesOf('PRT').length).toBe(before + 3);

    // Retângulo em volta de Aveiro/Faro (costa atlântica).
    const near = detailCitiesIn({ minLon: -10, maxLon: -7.5, minLat: 36.5, maxLat: 41 });
    expect(near.map((city) => city.name)).toEqual(['Aveiro', 'Faro']);
    // Fora do retângulo.
    expect(detailCitiesIn({ minLon: 0, maxLon: 2, minLat: 0, maxLat: 2 })).toHaveLength(0);
  });

  it('registrar de novo não duplica o lote', () => {
    registerDetailCities(1, [[0, 'AFG-1', 'Duplicada', 34, 69, 1, 0, 10]]);
    expect(cityById('c9001')?.name).toBe('Aveiro');
    expect(detailCitiesIn({ minLon: 68, maxLon: 70, minLat: 33, maxLat: 35 })).toHaveLength(0);
  });
});
