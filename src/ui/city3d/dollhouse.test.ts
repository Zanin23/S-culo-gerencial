// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Dollhouse, FLOOR_HEIGHT } from './Dollhouse';

/** Paredes em corte: só o rodapé baixo continua visível. */
function cutWalls(house: Dollhouse): string[] {
  const cut = new Set<string>();
  for (const child of house.group.children) {
    if (!(child instanceof THREE.Group) || !child.name.startsWith('piso-')) continue;
    for (const wall of child.children) {
      if (!(wall instanceof THREE.Group) || !wall.name.startsWith('parede-')) continue;
      const full = wall.children.filter((part) => part.visible).length;
      if (full === 1) cut.add(wall.name);
    }
  }
  return [...cut].sort();
}

describe('corte da sede (casa de bonecas)', () => {
  it('monta quatro pisos mobiliados e mostra só o piso em foco', () => {
    const house = new Dollhouse(22, 17);
    const levels = house.group.children.filter((child) => child instanceof THREE.Group && child.name.startsWith('piso-'));
    expect(levels.length).toBe(4);
    expect(house.height).toBeCloseTo(FLOOR_HEIGHT * 4, 2);
    house.setFloor(1);
    expect(levels.filter((level) => level.visible).length).toBe(1);
    house.setFloor(3);
    expect(levels.filter((level) => level.visible).length).toBe(3);
    house.setFloor(9);
    expect(levels.filter((level) => level.visible).length).toBe(4);
    // Cada piso tem mobiliário de verdade, não só a laje.
    for (const level of levels) expect(level.children.length).toBeGreaterThan(12);
  });

  it('esconde as paredes viradas para a câmera e mantém o rodapé de corte', () => {
    const house = new Dollhouse(22, 17);
    house.group.position.set(120, 0, -80);
    house.group.rotation.y = 0.4;
    house.group.updateWorldMatrix(true, true);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(120 + 30, 24, -80 + 40);
    house.update(camera);
    const front = cutWalls(house);
    // As duas paredes voltadas para a câmera ficam em corte.
    expect(front.length).toBe(2);

    // Do lado oposto da maquete, o corte muda de paredes.
    camera.position.set(120 - 30, 24, -80 - 40);
    house.update(camera);
    const back = cutWalls(house);
    expect(back.length).toBe(2);
    expect(back).not.toEqual(front);
  });
});
