import { describe, expect, it } from 'vitest';
import { chooseEvent, eventById } from './events';
import { runAITurn } from './ai';
import { advanceCycle, resolveInsolvency } from './cycle';
import { computeEconomy, defenseOf, territoryProduction } from './economy';
import { neighborsOf, tilesOfFaction } from './map';
import { createInitialState, exportSave, importSave, validateState } from './state';
import { buildingCost, foundSeat, openOperation, startConstruction, startResearch, startExpansion } from './commands';
import { objectivesOf } from './progress';
import { citiesOf } from './atlas';
import type { FactionId, GameState } from './types';

function resolvePending(state: GameState): GameState {
  if (!state.pendingEventId) return state;
  const event = eventById(state.pendingEventId)!;
  const player = state.factions.concordia;
  const affordable = event.choices.find((c) =>
    !c.effect.cost || Object.entries(c.effect.cost).every(([k, v]) => player.stocks[k as keyof typeof player.stocks] >= (v ?? 0)),
  );
  const choice = affordable ?? event.choices[0];
  return chooseEvent(state, 'concordia', choice.id).state;
}

describe('MANAGEMENT CENTURY engine', () => {
  it('encerra a companhia insolvente e libera os mercados', () => {
    const state = createInitialState(99, 1);
    const faction = state.factions.concordia;
    const tileId = faction.capitalId;
    state.operations.push({
      id: 'op1',
      factionId: 'concordia',
      cityId: 'c1',
      countryId: tileId,
      sector: 'varejo',
      units: 1,
      openedCycle: 1,
    });
    faction.deficitCycles = 6;
    const fallen = resolveInsolvency(state);
    expect(fallen).toContain('concordia');
    expect(state.factions.concordia.eliminated).toBe(true);
    expect(state.operations).toHaveLength(0);
    expect(tilesOfFaction(state.tiles, 'concordia')).toHaveLength(0);
    expect(state.tiles[tileId].owner).toBeNull();
  });

  it('pays research in cash even after the cycle zeroes legacy stocks', () => {
    const state = createInitialState(777, 1);
    const player = state.factions.concordia;
    player.stocks.conhecimento = 0;
    player.stocks.creditos = 600;
    const result = startResearch(state, 'concordia', 'ec1');
    expect(result.ok).toBe(true);
    expect(result.state.factions.concordia.stocks.creditos).toBeLessThan(600);
  });

  it('routes operation revenue into the company cash flow', () => {
    const state = createInitialState(4242, 1);
    const countryId = state.factions.concordia.capitalId;
    const city = citiesOf(countryId)[0];
    expect(city).toBeTruthy();
    state.factions.concordia.stocks.creditos = 5000;
    const result = openOperation(state, 'concordia', city.id, 'varejo');
    expect(result.ok).toBe(true);
    const eco = computeEconomy(result.state, 'concordia');
    const line = eco.finance.revenue.find((entry) => entry.key === 'unidades');
    expect(line?.value ?? 0).toBeGreaterThan(0);
  });

  it('creates a coherent world', () => {
    const state = createInitialState(123456, 1);
    expect(Object.keys(state.tiles).length).toBeGreaterThan(200);
    expect(tilesOfFaction(state.tiles, 'concordia')).toHaveLength(2);
    for (const id of Object.keys(state.factions) as FactionId[]) {
      expect(state.tiles[state.factions[id].capitalId]).toBeTruthy();
      expect(state.factions[id].stocks.creditos).toBeGreaterThan(0);
    }
    const eco = computeEconomy(state, 'concordia');
    expect(eco.production.alimentos).toBeGreaterThan(eco.demand.alimentos);
    expect(eco.net.creditos).toBeGreaterThan(0);
    expect(Number.isFinite(eco.production.creditos)).toBe(true);
    expect(objectivesOf(state).filter((objective) => objective.done)).toHaveLength(0);
  });

  it('runs a 60-cycle simulation with an AI-driven player', () => {
    let state = createInitialState(20261020, 1);
    const eventsSeen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      if (state.pendingEventId) eventsSeen.add(state.pendingEventId);
      state = resolvePending(state);
      runAITurn(state, state.playerFactionId);
      const result = advanceCycle(state);
      if (!result.ok) break;
      state = result.state;
      if (state.phase !== 'playing') break;
    }
    const player = state.factions.concordia;
    for (const key of Object.keys(player.stocks) as Array<keyof typeof player.stocks>) {
      expect(Number.isFinite(player.stocks[key])).toBe(true);
      expect(player.stocks[key]).toBeGreaterThanOrEqual(0);
    }
    for (const tile of Object.values(state.tiles)) {
      expect(Number.isFinite(tile.pop)).toBe(true);
      expect(tile.pop).toBeGreaterThan(0);
      expect(tile.unrest).toBeGreaterThanOrEqual(0);
      expect(tile.unrest).toBeLessThanOrEqual(100);
    }
    expect(eventsSeen.size).toBeGreaterThan(0);
  });

  it('exports and reimports a complete save', () => {
    const state = createInitialState(99, 123);
    const encoded = exportSave(state);
    const loaded = importSave(encoded);
    expect(loaded.error).toBeNull();
    expect(loaded.state?.seed).toBe(99);
    expect(loaded.state?.cycle).toBe(1);
    expect(Object.keys(loaded.state?.tiles ?? {}).length).toBe(Object.keys(state.tiles).length);
    expect(loaded.state?.factions.concordia.stocks.creditos).toBe(state.factions.concordia.stocks.creditos);
    expect(importSave('{ "version": 99 }').state).toBeNull();
  });

  it('validates actions and refuses invalid ones', () => {
    const state = createInitialState(42, 1);
    const tile = state.tiles[state.factions.concordia.capitalId];
    const build = startConstruction(state, 'concordia', tile.id, 'fazenda');
    expect(build.ok).toBe(true);
    const neutralTile = Object.values(state.tiles).find((t) => t.owner === null)!;
    const invalidBuild = startConstruction(state, 'concordia', neutralTile.id, 'fazenda');
    expect(invalidBuild.ok).toBe(false);
    const research = startResearch(state, 'concordia', 'ec4');
    expect(research.ok).toBe(false);
    const capital = state.tiles[state.factions.concordia.capitalId];
    const adjacentNeutral = tilesOfFaction(state.tiles, 'concordia')
      .flatMap((tile) => neighborsOf(tile, state.tiles))
      .find((tile) => tile.owner === null)!;
    const expansion = startExpansion(state, 'concordia', adjacentNeutral.id);
    expect(expansion.ok).toBe(true);
    const ownedExpansion = startExpansion(state, 'concordia', capital.id);
    expect(ownedExpansion.ok).toBe(false);
    const offline = startConstruction(state, 'concordia', neutralTile.id, 'fazenda');
    expect(offline.ok).toBe(false);
    const invalid = validateState({ version: 1, cycle: 0 });
    expect(invalid.state).toBeNull();
  });
});

it('a sede escolhida altera a economia real da capital', () => {
  const base = createInitialState(8080, Date.now());
  const withSeat = foundSeat(base, 'c1044', 'c1044-lote-01', 'Centro');
  expect(withSeat.ok).toBe(true);
  const seat = withSeat.state.city!;
  expect(seat.cityName).toBe('Lisbon');
  expect(seat.district).toBe('Centro');
  expect(seat.countryId).toBe('PRT');

  const commerce = (state: typeof base) => {
    const capital = state.tiles[state.factions[state.playerFactionId].capitalId];
    return territoryProduction(state, capital, state.factions[state.playerFactionId]).commerceBase;
  };
  expect(commerce(withSeat.state)).toBeGreaterThan(commerce(base));

  const industry = foundSeat(base, 'c1146', 'c1146-lote-01', 'Expansão');
  expect(industry.ok).toBe(true);
  const defense = (state: typeof base) => {
    const capital = state.tiles[state.factions[state.playerFactionId].capitalId];
    return defenseOf(state, capital);
  };
  expect(defense(withSeat.state)).toBeLessThan(defense(base));
  const periphery = foundSeat(base, 'c1044', 'c1044-lote-01', 'Periferia');
  expect(periphery.ok).toBe(true);
  expect(defense(periphery.state)).toBeGreaterThan(defense(withSeat.state));

  // Anexa o país-sede quando ele ainda não pertence à Casa.
  const madrid = industry.state;
  expect(madrid.tiles.ESP.owner).toBe('concordia');
  expect(madrid.factions.concordia.capitalId).toBe('ESP');
  expect(madrid.tiles.ESP.isCapital).toBe(true);
  expect(madrid.tiles.PRT.isCapital).toBe(false);

  // Sem lote não há sede.
  const none = foundSeat(base, 'inexistente', 'x', 'Centro');
  expect(none.ok).toBe(false);
});
