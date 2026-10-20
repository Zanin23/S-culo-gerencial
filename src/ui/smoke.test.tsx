// @vitest-environment jsdom
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { App } from '../App';
import { eventById } from '../game/events';
import { useGameStore } from '../store/gameStore';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function text() {
  return container.textContent ?? '';
}

it('boots the menu and starts a campaign', async () => {
  await act(async () => {
    root = createRoot(container);
    root.render(<App />);
  });
  expect(text()).toContain('TESSERA');
  const start = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Fundar Concórdia'));
  expect(start).toBeTruthy();
  await act(async () => {
    start?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(useGameStore.getState().game).toBeTruthy();
  expect(container.querySelector('.map-svg')).toBeTruthy();
  expect(container.querySelector('.context-panel')).toBeTruthy();
});

it('advances cycles and opens every view', async () => {
  await act(async () => {
    root = createRoot(container);
    root.render(<App />);
  });
  await act(async () => {
    useGameStore.getState().startNewGame(777);
  });
  const views = ['economy', 'construction', 'tech', 'expansion', 'diplomacy', 'objectives', 'chronicle', 'settings'] as const;
  for (const view of views) {
    await act(async () => {
      useGameStore.getState().setView(view);
    });
    expect(container.querySelector('.view-shell')).toBeTruthy();
    expect(text().length).toBeGreaterThan(100);
  }
  await act(async () => {
    useGameStore.getState().setView('map');
    useGameStore.getState().confirmAction();
    useGameStore.getState().advance();
  });
  expect(useGameStore.getState().game?.cycle).toBe(2);
});

it('runs the core actions and resolves an event through the modal', async () => {
  await act(async () => {
    root = createRoot(container);
    root.render(<App />);
  });
  await act(async () => {
    useGameStore.getState().startNewGame(4242);
    useGameStore.getState().finishTutorial();
  });
  const store = useGameStore.getState();
  const game = store.game!;
  const player = game.factions[game.playerFactionId];
  const capital = game.tiles[player.capitalId];

  let built = false;
  await act(async () => {
    built = store.build(capital.id, 'fazenda');
  });
  expect(built).toBe(true);
  expect(useGameStore.getState().game!.projects.length).toBe(1);

  await act(async () => {
    store.setView('construction');
  });
  expect(text()).toContain('Construção');

  const advanceOne = async () => {
    const pending = useGameStore.getState().game!.pendingEventId;
    if (pending) {
      const event = eventById(pending);
      const playerNow = useGameStore.getState().game!.factions.concordia;
      const choice = event?.choices.find((option) =>
        !option.effect.cost || Object.entries(option.effect.cost).every(([key, value]) => playerNow.stocks[key as keyof typeof playerNow.stocks] >= (value ?? 0)),
      );
      if (event && choice) await act(async () => { useGameStore.getState().resolveEvent(choice.id); });
    }
    if (useGameStore.getState().digest) await act(async () => { useGameStore.getState().dismissDigest(); });
    await act(async () => {
      useGameStore.getState().advance();
    });
  };

  for (let i = 0; i < 3; i += 1) {
    await advanceOne();
  }
  expect(useGameStore.getState().game!.tiles[capital.id].buildings.fazenda).toBe(2);

  await act(async () => {
    expect(useGameStore.getState().build(capital.id, 'pesquisa')).toBe(true);
  });
  for (let i = 0; i < 4; i += 1) {
    await advanceOne();
  }
  expect(useGameStore.getState().game!.tiles[capital.id].buildings.pesquisa).toBe(1);
  expect(useGameStore.getState().game!.factions.concordia.stocks.conhecimento).toBeGreaterThan(10);

  await act(async () => {
    expect(useGameStore.getState().research('ec1')).toBe(true);
  });
  for (let i = 0; i < 4; i += 1) {
    await advanceOne();
  }
  expect(useGameStore.getState().game!.factions.concordia.techs).toContain('ec1');

  await act(async () => {
    expect(useGameStore.getState().trade('alimentos', 10, 'sell')).toBe(true);
  });
  await act(async () => {
    useGameStore.getState().setView('economy');
  });
  expect(text()).toContain('Mercado de Vesper');

  await act(async () => {
    expect(useGameStore.getState().gift('aurelia')).toBe(true);
  });

  // Find a cycle that produces an event, then resolve it with the UI.
  let guard = 0;
  while (!useGameStore.getState().game!.pendingEventId && guard < 20) {
    await act(async () => {
      useGameStore.getState().advance();
    });
    guard += 1;
    if (useGameStore.getState().digest) {
      await act(async () => {
        useGameStore.getState().dismissDigest();
      });
    }
  }
  if (useGameStore.getState().game!.pendingEventId) {
    expect(document.querySelectorAll('.event-choice').length).toBeGreaterThan(0);
    const choice = document.querySelector('.event-choice') as HTMLButtonElement;
    await act(async () => {
      choice.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(useGameStore.getState().game!.pendingEventId).toBeNull();
  }
});

it('clicking the primary UI actions mutates the world', async () => {
  await act(async () => {
    root = createRoot(container);
    root.render(<App />);
  });
  await act(async () => {
    useGameStore.getState().startNewGame(31415);
    useGameStore.getState().finishTutorial();
  });

  await act(async () => {
    useGameStore.getState().setView('construction');
  });
  const buildButton = Array.from(document.querySelectorAll('.building-card button')).find(
    (button) => /Construir|Melhorar/.test(button.textContent ?? '') && !(button as HTMLButtonElement).disabled,
  ) as HTMLButtonElement | undefined;
  expect(buildButton).toBeTruthy();
  await act(async () => {
    buildButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(useGameStore.getState().game!.projects.length).toBe(1);

  await act(async () => {
    useGameStore.getState().setView('economy');
  });
  const sellButton = Array.from(document.querySelectorAll('.market-card button')).find(
    (button) => /Vender/.test(button.textContent ?? '') && !(button as HTMLButtonElement).disabled,
  ) as HTMLButtonElement | undefined;
  expect(sellButton).toBeTruthy();
  const creditsBefore = useGameStore.getState().game!.factions.concordia.stocks.creditos;
  await act(async () => {
    sellButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(useGameStore.getState().game!.factions.concordia.stocks.creditos).toBeGreaterThan(creditsBefore);

  await act(async () => {
    useGameStore.getState().setView('diplomacy');
  });
  const giftButton = Array.from(document.querySelectorAll('.house-card__actions button')).find(
    (button) => /Presente/.test(button.textContent ?? '') && !(button as HTMLButtonElement).disabled,
  ) as HTMLButtonElement | undefined;
  expect(giftButton).toBeTruthy();
  await act(async () => {
    giftButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(useGameStore.getState().game!.factions.concordia.lastGiftCycle).toBe(useGameStore.getState().game!.cycle);

  await act(async () => {
    useGameStore.getState().setView('expansion');
  });
  const expandButton = Array.from(document.querySelectorAll('.claim-card button')).find(
    (button) => /Preparar expedição/.test(button.textContent ?? '') && !(button as HTMLButtonElement).disabled,
  ) as HTMLButtonElement | undefined;
  expect(expandButton).toBeTruthy();
  await act(async () => {
    expandButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(useGameStore.getState().game!.projects.some((project) => project.kind === 'expansao')).toBe(true);
});
