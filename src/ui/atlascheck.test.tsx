// @vitest-environment jsdom
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { App } from '../App';
import { useGameStore } from '../store/gameStore';

it('atlas monta sem NaN e com camadas principais', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<App />); });
  await act(async () => {
    useGameStore.getState().startNewGame(2024);
    useGameStore.getState().finishTutorial();
    useGameStore.getState().setView('map');
  });
  const svg = container.querySelector('.atlas-svg');
  expect(svg).toBeTruthy();
  const html = svg!.outerHTML;
  expect(html.includes('NaN')).toBe(false);
  expect(html.includes('undefined')).toBe(false);
  expect(container.querySelectorAll('.atlas-country').length).toBeGreaterThan(200);
  expect(container.querySelectorAll('.atlas-country__hit').length).toBeGreaterThan(200);
  expect(container.querySelector('.atlas-compass')).toBeTruthy();
  expect(container.querySelector('.map-modes')?.textContent).toContain('Atlas');
  expect(container.querySelector('.res-chip__icon svg')).toBeTruthy();

  // Ficha territorial: indicadores em papel e terreno desenhado.
  const state = useGameStore.getState().game!;
  const ownTile = Object.values(state.tiles).find((tile) => tile.owner === state.playerFactionId)!;
  expect(ownTile).toBeTruthy();
  await act(async () => {
    useGameStore.getState().selectTile(null);
    useGameStore.getState().selectTile(ownTile.id);
  });
  expect(container.querySelectorAll('.tile-stat').length).toBeGreaterThan(3);
  expect(container.querySelector('.tile-subline__terrain svg')).toBeTruthy();

  // Obras: cada cartão de construção mostra o glifo ilustrado.
  await act(async () => {
    useGameStore.getState().setView('construction');
  });
  const cards = container.querySelectorAll('.building-card');
  expect(cards.length).toBeGreaterThan(2);
  expect(cards[0].querySelector('.building-card__icon svg')).toBeTruthy();
  await act(async () => { root.unmount(); });
  container.remove();
});
