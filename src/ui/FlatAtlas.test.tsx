// @vitest-environment jsdom
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OUTLINE } from '../game/atlas';
import { createTiles } from '../game/map';
import { Rng } from '../game/rng';
import { FlatAtlas, type FlatAtlasHandle } from './FlatAtlas';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const noop = () => {};

function render(props: Partial<Parameters<typeof FlatAtlas>[0]> = {}) {
  const tiles = createTiles(new Rng(9));
  const handlers = {
    onSelectCountry: vi.fn(),
    onSelectProvince: vi.fn(),
    onSelectCity: vi.fn(),
    onClear: vi.fn(),
  };
  const detail = {
    iso: 'PRT',
    country: OUTLINE.PRT,
    provinces: { 'PRT-1': OUTLINE.PRT, 'PRT-2': OUTLINE.ESP },
  };
  act(() => {
    root = createRoot(container);
    root.render(
      <FlatAtlas
        tiles={tiles}
        shapes={OUTLINE}
        focusCountryId="PRT"
        selectedCountryId="PRT"
        selectedProvinceId={null}
        selectedCityId={null}
        playerId="concordia"
        claimable={new Set()}
        showCities
        detail={detail}
        {...handlers}
        {...props}
      />,
    );
  });
  return { tiles, handlers, detail };
}

it('desenha todos os países e as divisões internas do país focado', () => {
  render();
  expect(container.querySelectorAll('path.flat-country').length).toBe(Object.keys(OUTLINE).length);
  expect(container.querySelectorAll('path.flat-province').length).toBe(2);
  expect(container.querySelectorAll('circle.flat-city').length).toBeGreaterThan(0);
  const svg = container.querySelector('svg.map-svg');
  expect(svg?.getAttribute('viewBox')).toBeTruthy();
});

it('encaminha cliques de país, província e cidade', () => {
  const { handlers, detail } = render();
  const country = container.querySelector('path.flat-country') as SVGPathElement;
  act(() => country.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(handlers.onSelectCountry).toHaveBeenCalledTimes(1);

  act(() => country.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(handlers.onSelectCountry).toHaveBeenLastCalledWith(expect.any(String), true);

  const province = container.querySelector('path.flat-province') as SVGPathElement;
  act(() => province.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(handlers.onSelectProvince).toHaveBeenCalledWith(Object.keys(detail.provinces)[0]);

  const city = container.querySelector('circle.flat-city') as SVGCircleElement;
  act(() => city.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(handlers.onSelectCity).toHaveBeenCalledTimes(1);
});

it('expõe zoom e recentragem por ref', () => {
  const ref = { current: null as FlatAtlasHandle | null };
  render({ ref } as never);
  const before = container.querySelector('svg')?.getAttribute('viewBox');
  act(() => ref.current?.zoom(2));
  const zoomed = container.querySelector('svg')?.getAttribute('viewBox');
  expect(zoomed).not.toBe(before);
  act(() => ref.current?.reset());
  expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 360 180');
});
