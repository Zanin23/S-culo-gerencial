import { describe, expect, it } from 'vitest';
import { citiesOf } from './atlas';
import { expandSeat, expandUnitBuild, expandUnitBusiness, foundSeat, openOperation } from './commands';
import {
  HQ_STAGES,
  MAX_HQ_BUILD,
  MAX_UNIT_BUILD,
  MAX_UNIT_RANGE,
  UNIT_BUILD_STEPS,
  UNIT_RANGE_STEPS,
} from './constants';
import { adminCapacityOfState } from './economy';
import { seatAdminBonus, seatBuildLevel, seatCommerceMult } from './hq';
import {
  buildLevel,
  cityCapacity,
  operationOutput,
  operationShare,
  rangeLevel,
  unitExpansionCost,
} from './operations';
import { createInitialState } from './state';
import type { GameState } from './types';

/** Campanha com sede fundada e uma filial de varejo na mesma cidade. */
function prepared(seed = 4242): { state: GameState; cityId: string; opId: string } {
  const initial = createInitialState(seed, 1);
  const cityId = citiesOf(initial.factions.concordia.capitalId)[0].id;
  initial.factions.concordia.stocks.creditos = 40_000;

  const founded = foundSeat(initial, cityId, `${cityId}-lote-01`, 'Centro');
  expect(founded.ok).toBe(true);
  const opened = openOperation(founded.state, 'concordia', cityId, 'varejo');
  expect(opened.ok).toBe(true);
  const opId = opened.state.operations[0].id;
  return { state: opened.state, cityId, opId };
}

describe('expansões das unidades', () => {
  it('a construção encarece a manutenção e amplia a receita', () => {
    const { state, cityId, opId } = prepared();
    const before = operationOutput(state, state.operations[0]);
    const cost = unitExpansionCost(citiesOf(state.factions.concordia.capitalId)[0], 'varejo', 'build', 0);

    const result = expandUnitBuild(state, 'concordia', opId);
    expect(result.ok).toBe(true);
    const operation = result.state.operations[0];
    expect(buildLevel(operation)).toBe(1);
    expect(result.state.factions.concordia.stocks.creditos).toBe(
      state.factions.concordia.stocks.creditos - cost.creditos,
    );

    const after = operationOutput(result.state, operation);
    expect(after.revenue).toBeGreaterThan(before.revenue);
    expect(after.upkeep).toBeGreaterThan(before.upkeep);
    expect(after.expansionMult).toBeCloseTo(1 + UNIT_BUILD_STEPS[0].revenue, 5);
    expect(after.range).toBe(0);
    void cityId;
  });

  it('o ramo de negócio abre receita sem inflar a presença de mercado', () => {
    const { state, opId } = prepared(777);
    const before = operationOutput(state, state.operations[0]);
    const shareBefore = operationShare(state, state.operations[0]);

    const result = expandUnitBusiness(state, 'concordia', opId);
    expect(result.ok).toBe(true);
    const operation = result.state.operations[0];
    expect(rangeLevel(operation)).toBe(1);
    const after = operationOutput(result.state, operation);
    expect(after.revenue).toBeGreaterThan(before.revenue);
    expect(after.expansionMult).toBeCloseTo(1 + UNIT_RANGE_STEPS.varejo[0].revenue, 5);
    expect(operationShare(result.state, operation)).toBeCloseTo(shareBefore, 6);
    expect(buildLevel(operation)).toBe(0);
  });

  it('as duas trilhas param no máximo e recusam a compra seguinte', () => {
    const { state, opId } = prepared(31337);
    let current = state;
    for (let level = 0; level < MAX_UNIT_BUILD; level += 1) {
      const result = expandUnitBuild(current, 'concordia', opId);
      expect(result.ok).toBe(true);
      current = result.state;
    }
    const blockedBuild = expandUnitBuild(current, 'concordia', opId);
    expect(blockedBuild.ok).toBe(false);
    expect(buildLevel(blockedBuild.state.operations[0])).toBe(MAX_UNIT_BUILD);

    for (let level = 0; level < MAX_UNIT_RANGE; level += 1) {
      const result = expandUnitBusiness(current, 'concordia', opId);
      expect(result.ok).toBe(true);
      current = result.state;
    }
    const blockedRange = expandUnitBusiness(current, 'concordia', opId);
    expect(blockedRange.ok).toBe(false);
    expect(rangeLevel(blockedRange.state.operations[0])).toBe(MAX_UNIT_RANGE);

    // No topo das duas trilhas a unidade vale muito mais que a unidade original.
    const base = prepared(31337).state;
    const grown = operationOutput(current, current.operations[0]);
    const original = operationOutput(base, base.operations[0]);
    expect(grown.revenue).toBeGreaterThan(original.revenue * 1.8);
  });

  it('sem caixa a expansão é recusada e nada muda', () => {
    const { state, opId } = prepared(99);
    state.factions.concordia.stocks.creditos = 0;
    const result = expandUnitBuild(state, 'concordia', opId);
    expect(result.ok).toBe(false);
    expect(buildLevel(result.state.operations[0])).toBe(0);
    expect(state.factions.concordia.stocks.creditos).toBe(0);
  });

  it('a presença construída soma capacidade e divide o mercado da cidade', () => {
    const { state, opId } = prepared(515);
    const cityId = state.operations[0].cityId;
    const baseShare = operationShare(state, state.operations[0]);
    const capacityBefore = cityCapacity(state, cityId);
    const next = expandUnitBuild(state, 'concordia', opId).state;
    const expanded = next.operations[0];
    expect(cityCapacity(next, expanded.cityId) - capacityBefore).toBeCloseTo(
      UNIT_BUILD_STEPS[0].presence ?? 0,
      6,
    );
    expect(operationShare(state, expanded)).toBeGreaterThan(baseShare);
  });

  it('expansão fica mais cara a cada nível e em cidades maiores', () => {
    const small = { pop: 180_000 };
    const large = { pop: 12_000_000 };
    const first = unitExpansionCost(small, 'varejo', 'build', 0).creditos;
    const second = unitExpansionCost(small, 'varejo', 'build', 1).creditos;
    expect(second).toBeGreaterThan(first);
    expect(unitExpansionCost(large, 'varejo', 'build', 0).creditos).toBeGreaterThan(first);
    expect(unitExpansionCost(small, 'varejo', 'range', 0).creditos).toBeGreaterThan(0);
  });
});

describe('expansões da sede', () => {
  it('amplia a sede, cobra o custo do estágio e melhora o comércio local', () => {
    const { state } = prepared(2024);
    const before = operationOutput(state, state.operations[0]);
    expect(seatBuildLevel(state)).toBe(0);
    expect(seatCommerceMult(state, 'concordia', state.operations[0].cityId)).toBe(1);

    const next = HQ_STAGES[1];
    const result = expandSeat(state, 'concordia');
    expect(result.ok).toBe(true);
    expect(seatBuildLevel(result.state)).toBe(1);
    expect(result.state.factions.concordia.stocks.creditos).toBe(
      state.factions.concordia.stocks.creditos - next.cost,
    );

    const after = operationOutput(result.state, result.state.operations[0]);
    expect(seatCommerceMult(result.state, 'concordia', result.state.operations[0].cityId)).toBeCloseTo(
      1 + next.commerce,
      5,
    );
    expect(after.revenue / before.revenue).toBeCloseTo(1 + next.commerce, 4);
  });

  it('o bônus da sede não vale para concorrentes nem para outras cidades', () => {
    const { state, cityId } = prepared(808);
    let current = state;
    for (let level = 0; level < 2; level += 1) {
      current = expandSeat(current, 'concordia').state;
    }
    const operation = current.operations[0];
    expect(seatCommerceMult(current, 'concordia', cityId)).toBeGreaterThan(1);
    expect(seatCommerceMult(current, 'concordia', 'outra-cidade')).toBe(1);
    expect(seatCommerceMult(current, 'aurelia', cityId)).toBe(1);
    void operation;
  });

  it('administra mais filiais com as vagas ganhas na sede', () => {
    const { state } = prepared(606);
    let current = state;
    const base = adminCapacityOfState(current, 'concordia');
    for (let level = 0; level < 2; level += 1) {
      current = expandSeat(current, 'concordia').state;
    }
    expect(seatAdminBonus(current, 'concordia')).toBe(1);
    expect(adminCapacityOfState(current, 'concordia')).toBe(base + 1);
  });

  it('vai até o complexo matriz e então recusa nova expansão', () => {
    const { state } = prepared(12);
    let current = state;
    for (let level = 0; level < MAX_HQ_BUILD; level += 1) {
      const result = expandSeat(current, 'concordia');
      expect(result.ok).toBe(true);
      current = result.state;
    }
    expect(seatBuildLevel(current)).toBe(MAX_HQ_BUILD);
    expect(expandSeat(current, 'concordia').ok).toBe(false);
    expect(seatCommerceMult(current, 'concordia', current.operations[0].cityId)).toBeCloseTo(
      1 + HQ_STAGES[MAX_HQ_BUILD].commerce,
      5,
    );
  });

  it('sem sede fundada não há o que ampliar', () => {
    const state = createInitialState(4, 1);
    state.factions.concordia.stocks.creditos = 5000;
    expect(expandSeat(state, 'concordia').ok).toBe(false);
  });
});
