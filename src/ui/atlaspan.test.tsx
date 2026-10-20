// @vitest-environment jsdom
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { App } from '../App';
import { useGameStore } from '../store/gameStore';

function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

it('arrastar não reconstrói a árvore: só o viewBox muda', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<App />); });
  await act(async () => {
    useGameStore.getState().startNewGame(2024);
    useGameStore.getState().finishTutorial();
    useGameStore.getState().setView('map');
  });

  const svg = container.querySelector('.atlas-svg') as SVGSVGElement;
  expect(svg).toBeTruthy();
  const before = svg.getAttribute('viewBox');
  const paths = svg.querySelectorAll('path').length;
  const firstCountry = svg.querySelector('.atlas-country');

  await act(async () => {
    svg.dispatchEvent(pointer('pointerdown', 200, 200));
  });
  await act(async () => {
    svg.dispatchEvent(pointer('pointermove', 268, 232));
    svg.dispatchEvent(pointer('pointerup', 268, 232));
  });

  // Câmera andou…
  expect(svg.getAttribute('viewBox')).not.toBe(before);
  // …sem remontar a carta: mesmos nós e mesmo número de caminhos.
  expect(svg.querySelectorAll('path').length).toBe(paths);
  expect(svg.querySelector('.atlas-country')).toBe(firstCountry);
  // A camada de terra é mesclada: poucos caminhos para 231 países.
  expect(svg.querySelectorAll(".atlas-land > path").length).toBeLessThan(30);
  expect(svg.querySelectorAll('.atlas-country').length).toBeGreaterThan(200);

  await act(async () => { root.unmount(); });
  container.remove();
});
