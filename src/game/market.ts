import { MARKET_BASE, MARKET_KEYS, TECHS } from './constants';
import type { Faction, GameState, MarketKey } from './types';
import { clamp } from './rng';
import { nextRandom } from './rng';

export const PRICE_FLOOR = 0.55;
export const PRICE_CEIL = 1.75;

export function priceOf(state: GameState, key: MarketKey): number {
  return state.market.prices[key];
}

export function sellUnitPrice(state: GameState, faction: Faction, key: MarketKey): number {
  const sellBonus = faction.techs.reduce((sum, id) => sum + (TECHS[id]?.effects.sellMult ?? 0), 0);
  return state.market.prices[key] * (1 + sellBonus);
}

export function buyUnitPrice(state: GameState, key: MarketKey): number {
  return state.market.prices[key] * 1.06;
}

export function applyTradeImpact(state: GameState, key: MarketKey, amount: number, side: 'buy' | 'sell'): void {
  const base = MARKET_BASE[key];
  const delta = (side === 'sell' ? -0.004 : 0.0055) * amount;
  state.market.prices[key] = round2(
    clamp(state.market.prices[key] * (1 + delta), base * PRICE_FLOOR, base * PRICE_CEIL),
  );
}

export function updateMarket(state: GameState): void {
  const previous = { ...state.market.prices };
  for (const key of MARKET_KEYS) {
    const base = MARKET_BASE[key];
    const current = state.market.prices[key];
    const meanReversion = (base - current) * 0.14;
    const noise = (nextRandom(state) * 2 - 1) * 0.035 * base;
    state.market.prices[key] = round2(
      clamp(current + meanReversion + noise, base * PRICE_FLOOR, base * PRICE_CEIL),
    );
  }
  state.market.previous = previous;
}

export function marketTrend(state: GameState, key: MarketKey): 'up' | 'down' | 'flat' {
  const diff = state.market.prices[key] - state.market.previous[key];
  if (Math.abs(diff) < 0.02) return 'flat';
  return diff > 0 ? 'up' : 'down';
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
