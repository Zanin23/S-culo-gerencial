// @vitest-environment jsdom
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { App } from '../App';
import { CITIES, PROVINCES } from '../game/atlas';
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

it('boots the menu, chooses a city and founds the seat on a plot', async () => {
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
  // Passo 1: escolha da cidade real.
  expect(useGameStore.getState().screen).toBe('seat');
  expect(text()).toContain('Funde a sua sede');
  expect(text()).toContain('Lisboa');
  expect(container.querySelector('.city-plan2d')).toBeTruthy();

  // Passo 2: escolha do lote pela planta (sem WebGL no jsdom).
  const plots = Array.from(container.querySelectorAll('.city-plan2d__plot'));
  expect(plots.length).toBeGreaterThan(4);
  await act(async () => {
    plots[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const draft = useGameStore.getState().seatDraft;
  expect(draft.plotId).toBeTruthy();
  expect(draft.district).toBeTruthy();

  // Passo 3: fundar.
  const found = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Fundar a sede')) as HTMLButtonElement | undefined;
  expect(found).toBeTruthy();
  expect(found?.disabled).toBe(false);
  await act(async () => {
    found?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const state = useGameStore.getState();
  expect(state.game).toBeTruthy();
  expect(state.game!.city?.cityName).toBeTruthy();
  expect(state.game!.city?.plotId).toBe(draft.plotId);
  expect(state.view).toBe('city');
  expect(container.querySelector('.city-stage')).toBeTruthy();
  expect(text()).toContain('Sede da Casa');

  await act(async () => {
    useGameStore.getState().setView('map');
  });
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
  expect(text()).toContain('Mercado Global');

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

it('selects countries, provinces and cities on the world map', async () => {
  await act(async () => {
    root = createRoot(container);
    root.render(<App />);
  });
  await act(async () => {
    useGameStore.getState().startNewGame(2024);
    useGameStore.getState().finishTutorial();
  });

  const countries = Array.from(container.querySelectorAll('path.flat-country')) as SVGPathElement[];
  expect(countries.length).toBeGreaterThan(200);
  expect(container.querySelector('.map-fallback-note')).toBeTruthy();

  await act(async () => {
    countries[4].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const picked = useGameStore.getState().selectedTileId;
  expect(picked).toBeTruthy();

  await act(async () => {
    countries[4].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  expect(useGameStore.getState().focusCountryId).toBe(picked);

  const province = PROVINCES.find((item) => item.countryId === picked)!;
  await act(async () => {
    useGameStore.getState().selectProvince(province.id);
  });
  expect(useGameStore.getState().selectedProvinceId).toBe(province.id);
  expect(container.querySelector('.map-drill')?.textContent).toContain(province.name);

  const city = CITIES.find((item) => item.countryId === picked)!;
  await act(async () => {
    useGameStore.getState().selectCity(city.id);
  });
  expect(useGameStore.getState().selectedCityId).toBe(city.id);
  expect(container.querySelector('.map-drill')?.textContent).toContain(city.name);
  expect(useGameStore.getState().selectedProvinceId).toBeNull();

  const firstCountry = useGameStore.getState().game!.factions.concordia.capitalId;

  const locate = container.querySelector('select[aria-label="Localizar país"]') as HTMLSelectElement | null;
  expect(locate).toBeTruthy();
  await act(async () => {
    if (locate) {
      locate.value = 'FRA';
      locate.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  expect(useGameStore.getState().selectedTileId).toBe('FRA');
  expect(useGameStore.getState().focusCountryId).toBe('FRA');

  await act(async () => {
    useGameStore.getState().clearSelection();
  });
  expect(useGameStore.getState().selectedTileId).toBeNull();
  expect(firstCountry).toBeTruthy();
});
