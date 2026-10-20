import { describe, expect, it } from 'vitest';
import { chooseEvent, eventById } from './events';
import { runAITurn } from './ai';
import { advanceCycle } from './cycle';
import { computeEconomy, developmentOf, techEffects } from './economy';
import { tilesOfFaction } from './map';
import { createInitialState, exportSave, importSave, validateState } from './state';
import { buildingCost, startConstruction, startResearch, startExpansion, sellResource } from './commands';
import { objectivesOf, scoreOf } from './progress';
import { FACTIONS } from './constants';
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

describe('TESSERA engine', () => {
  it('creates a coherent world', () => {
    const state = createInitialState(123456, 1);
    expect(Object.keys(state.tiles).length).toBeGreaterThan(50);
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
    console.log('start eco', {
      prod: Object.fromEntries(Object.entries(eco.production).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      demand: Object.fromEntries(Object.entries(eco.demand).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      admin: eco.adminCapacity,
      dev: developmentOf(state.tiles[state.factions.concordia.capitalId]),
    });
  });

  it('runs a 60-cycle simulation with an AI-driven player', () => {
    let state = createInitialState(20261020, 1);
    const eventsSeen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      if (state.pendingEventId) eventsSeen.add(state.pendingEventId);
      state = resolvePending(state);
      runAITurn(state, state.playerFactionId);
      const result = advanceCycle(state);
      if (!result.ok) {
        console.log('advance failed', result.message);
        break;
      }
      state = result.state;
      if (state.phase !== 'playing') break;
      if (state.cycle % 10 === 0) {
        const player = state.factions.concordia;
        console.log(`cycle ${state.cycle}`, {
          tiles: tilesOfFaction(state.tiles, 'concordia').length,
          credits: Math.round(player.stocks.creditos),
          food: Math.round(player.stocks.alimentos),
          energy: Math.round(player.stocks.energia),
          techs: player.techs.length,
          military: Math.round(player.military),
          score: scoreOf(state, 'concordia'),
          phase: state.phase,
        });
      }
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
    console.log('final', {
      cycle: state.cycle,
      phase: state.phase,
      events: [...eventsSeen],
      leaderboard: (Object.keys(state.factions) as FactionId[]).map((id) => ({
        id,
        name: FACTIONS[id].short,
        score: scoreOf(state, id),
        tiles: tilesOfFaction(state.tiles, id).length,
        techs: state.factions[id].techs.length,
      })),
    });
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
    const adjacentNeutral = Object.values(state.tiles).find(
      (t) => t.owner === null && Math.max(
        Math.abs(t.q - capital.q),
        Math.abs(t.r - capital.r),
        Math.abs(-t.q - t.r - (-capital.q - capital.r)),
      ) === 1,
    )!;
    const expansion = startExpansion(state, 'concordia', adjacentNeutral.id);
    expect(expansion.ok).toBe(true);
    const ownedExpansion = startExpansion(state, 'concordia', capital.id);
    expect(ownedExpansion.ok).toBe(false);
    const sell = sellResource(state, 'concordia', 'alimentos', 9999);
    expect(sell.ok).toBe(false);
    const invalid = validateState({ version: 1, cycle: 0 });
    expect(invalid.state).toBeNull();
  });
});
