// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BUILDING_MODELS, pickModel } from './CityScene';
import { getCityPlan, type CityBuilding } from '../../game/cityPlan';

function bounds(geometry: THREE.BufferGeometry): THREE.Box3 {
  const box = new THREE.Box3();
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    box.expandByPoint(new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index)));
  }
  return box;
}

describe('modelos da maquete 3D', () => {
  it('descreve cada modelo com as medidas que a geometria realmente tem', () => {
    // Catálogo controlado: poucos modelos reutilizados, não um por edifício.
    expect(BUILDING_MODELS.length).toBeLessThanOrEqual(20);
    for (const model of BUILDING_MODELS) {
      const walls = bounds(model.walls);
      expect(Math.abs(walls.min.x + model.w / 2), model.key).toBeLessThan(0.5);
      expect(Math.abs(walls.max.x - model.w / 2), model.key).toBeLessThan(0.5);
      expect(Math.abs(walls.max.z - model.d / 2), model.key).toBeLessThan(0.5);
      // `h` é a altura final, contando telhado/coroa: a silhueta não muda de escala.
      const roofTop = bounds(model.roofGeometry).max.y;
      expect(Math.abs(roofTop - model.h) / model.h, model.key).toBeLessThan(0.08);
      expect(walls.max.y, model.key).toBeLessThanOrEqual(model.h + 0.01);
      // Fachada tem UV em metros (os tijolos de janela não esticam com o volume).
      expect(model.walls.getAttribute('uv'), model.key).toBeTruthy();
      // Toda cobertura cobre a pegada: nada de telhado solto no ar.
      const roof = bounds(model.roofGeometry);
      expect(roof.max.x - roof.min.x, model.key).toBeGreaterThan(model.w * 0.4);
      expect(roof.max.z - roof.min.z, model.key).toBeGreaterThan(model.d * 0.4);
      expect(roof.min.y, model.key).toBeGreaterThanOrEqual(-0.01);
      // A mesclagem não pode ter descartado partes silenciosamente: cada parede
      // contribui com 16 vértices e as coberturas têm volume de verdade.
      const wallVertices = model.walls.getAttribute('position').count;
      expect(wallVertices % 16, model.key).toBe(0);
      expect(wallVertices, model.key).toBeGreaterThanOrEqual(16);
      expect(model.roofGeometry.getAttribute('position').count, model.key).toBeGreaterThanOrEqual(12);
    }
  });

  it('escala todo edifício para perto do modelo com pouca distorção', () => {
    const plan = getCityPlan('c1044', 0);
    let distorted = 0;
    let squashed = 0;
    const clamp = (value: number) => Math.min(1.32, Math.max(0.76, value));
    for (const building of plan.buildings as CityBuilding[]) {
      const model = pickModel(building);
      const sx = building.w / model.w;
      const sy = building.h / model.h;
      const sz = building.d / model.d;
      for (const scale of [sx, sy, sz]) {
        if (scale < 0.76 || scale > 1.32) distorted += 1;
      }
      // Depois do clamp a caixa não vira uma laje: proporção preservada.
      if (Math.abs(Math.log(clamp(sx) / clamp(sz))) > 0.36) squashed += 1;
      // O modelo escolhido sempre existe para a zona do edifício.
      expect(model.zones.includes(building.zone) || model.kinds.includes(building.kind), building.kind).toBe(true);
    }
    // A escala é ajuste fino, não deformação: a maioria fica na faixa direta.
    expect(distorted / (plan.buildings.length * 3)).toBeLessThan(0.15);
    expect(squashed / plan.buildings.length).toBeLessThan(0.08);
  });

  it('agrupa torres, prédios e galpões em modelos distintos', () => {
    const kindModels = (kind: CityBuilding['kind']) => new Set(
      BUILDING_MODELS.filter((model) => model.kinds.includes(kind)).map((model) => model.key),
    );
    expect(kindModels('torre').size).toBeGreaterThanOrEqual(3);
    expect(kindModels('casa').size).toBeGreaterThanOrEqual(2);
    expect(kindModels('galpao').size).toBeGreaterThanOrEqual(2);
    // Centro e periferia não compartilham silhueta: a mancha de cada zona lê diferente.
    const centro = BUILDING_MODELS.filter((model) => model.zones.includes('centro'));
    const periferia = BUILDING_MODELS.filter((model) => model.zones.includes('periferia'));
    const averageHeight = (models: typeof BUILDING_MODELS) =>
      models.reduce((sum, model) => sum + model.h, 0) / models.length;
    expect(averageHeight(centro)).toBeGreaterThan(averageHeight(periferia) * 2);
  });
});
