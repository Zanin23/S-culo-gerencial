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

  // A escrita do viewBox é agendada num quadro (um write por frame).
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
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

it('zoom também não remonta a carta e limpa o estado de gesto', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<App />); });
  await act(async () => {
    useGameStore.getState().startNewGame(2024);
    useGameStore.getState().finishTutorial();
    useGameStore.getState().setView('map');
  });

  const wrap = container.querySelector('.atlas-illustrated') as HTMLDivElement;
  const svg = wrap.querySelector('.atlas-svg') as SVGSVGElement;
  const before = svg.getAttribute('viewBox');
  const firstCountry = svg.querySelector('.atlas-country');

  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120, clientX: 300, clientY: 200 }));
    });
  }

  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });

  // Aproximou…
  expect(svg.getAttribute('viewBox')).not.toBe(before);
  // …sem remontar nada e em modo de gesto (padrões escondidos por CSS).
  expect(svg.querySelector('.atlas-country')).toBe(firstCountry);
  expect(wrap.classList.contains('is-zooming')).toBe(true);

  // Rendering settles and the gesture class is removed.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  expect(wrap.classList.contains('is-zooming')).toBe(false);

  await act(async () => { root.unmount(); });
  container.remove();
});
