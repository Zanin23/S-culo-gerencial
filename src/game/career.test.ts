import { describe, expect, it } from 'vitest';
import { citiesOf } from './atlas';
import { advanceCycle, INSOLVENCY_CYCLES, resolveInsolvency } from './cycle';
import { chooseEvent, eventById } from './events';
import { computeEconomy } from './economy';
import { START_CASH } from './money';
import { openOperation } from './commands';
import { operationCost } from './operations';
import { createInitialState, exportSave, importSave } from './state';
import type { GameState } from './types';

/**
 * Começo de carreira: a campanha nasce com R$ 12 mi, duas praças e nenhuma
 * unidade. Estes testes fixam a semente e provam que o primeiro passo é
 * pagável, que dez ciclos não explodem o caixa e que a insolvência continua
 * alcançável quando a companhia gasta o que não tem.
 */

const SEED = 20261021;
const SEAT_CITY = citiesOf('PRT').slice().sort((a, b) => b.pop - a.pop)[0];

function freshCampaign(): GameState {
  return createInitialState(SEED, 1, {
    cityId: SEAT_CITY.id,
    plotId: `${SEAT_CITY.id}-lote-01`,
    district: 'Centro',
  });
}

/** Eventos entram no meio do caminho: escolhe a opção mais barata, como um jogador cauteloso. */
function settlePending(state: GameState): GameState {
  if (!state.pendingEventId) return state;
  const event = eventById(state.pendingEventId)!;
  const player = state.factions.concordia;
  const choice = event.choices.find((option) =>
    !option.effect.cost
    || Object.entries(option.effect.cost).every(([key, value]) => player.stocks[key as keyof typeof player.stocks] >= (value ?? 0)));
  return (choice ? chooseEvent(state, 'concordia', choice.id) : { state, ok: false, message: '', log: [] }).state;
}

function runCycles(start: GameState, cycles: number, onCycle?: (state: GameState) => GameState): GameState {
  let state = start;
  for (let i = 0; i < cycles; i += 1) {
    state = settlePending(state);
    if (state.phase !== 'playing') return state;
    if (onCycle) state = onCycle(state);
    const result = advanceCycle(state);
    if (!result.ok) {
      throw new Error(`Ciclo ${state.cycle} bloqueado: ${result.message}`);
    }
    state = result.state;
    if (state.phase !== 'playing') return state;
  }
  return state;
}

describe(`começo de carreira (semente ${SEED})`, () => {
  it('abre a primeira unidade com o caixa inicial', () => {
    const state = freshCampaign();
    const player = state.factions.concordia;
    const tiles = Object.values(state.tiles).filter((tile) => tile.owner === 'concordia');
    const eco = computeEconomy(state, 'concordia');

    expect(player.stocks.creditos).toBe(START_CASH);
    expect(tiles).toHaveLength(2);
    expect(state.operations).toHaveLength(0);
    expect(eco.finance.income).toBeGreaterThan(0);
    // A sede sozinha já paga a operação corrente: o jogador tem tempo de aprender.
    expect(eco.finance.net).toBeGreaterThan(0);

    const cost = operationCost(SEAT_CITY, 'varejo', 1);
    expect(cost.creditos).toBeLessThan(player.stocks.creditos * 0.5);

    const opened = openOperation(state, 'concordia', SEAT_CITY.id, 'varejo');
    expect(opened.ok).toBe(true);
    expect(opened.state.operations).toHaveLength(1);
    expect(opened.state.operations[0]).toMatchObject({ cityId: SEAT_CITY.id, sector: 'varejo', units: 1 });
    expect(opened.state.factions.concordia.stocks.creditos).toBe(player.stocks.creditos - cost.creditos);

    const after = computeEconomy(opened.state, 'concordia');
    expect(after.finance.income).toBeGreaterThan(eco.finance.income);
    expect(after.finance.net).toBeGreaterThan(eco.finance.net);
    // A primeira unidade começa a pagar o próprio investimento já no primeiro ciclo.
    expect(after.finance.net - eco.finance.net).toBeGreaterThan(cost.creditos * 0.02);
  });

  it('atravessa dez ciclos sem caixa negativo nem bolha', () => {
    const start = freshCampaign();
    let previous = start;
    let previousCash = start.factions.concordia.stocks.creditos;
    let state = start;
    for (let i = 0; i < 10; i += 1) {
      state = runCycles(state, 1);
      expect(state.phase).toBe('playing');
      const cash = state.factions.concordia.stocks.creditos;
      expect(Number.isFinite(cash)).toBe(true);
      expect(cash).toBeGreaterThanOrEqual(0);
      const eco = computeEconomy(state, 'concordia');
      expect(eco.finance.net).toBeCloseTo(eco.finance.income - eco.finance.expenses, 5);
      // O resultado por ciclo fica dentro de uma faixa sã para 2 praças.
      expect(Math.abs(eco.finance.net)).toBeLessThan(START_CASH);
      previousCash = cash;
      previous = state;
    }
    expect(previous.cycle).toBe(11);
    expect(previousCash).toBeGreaterThanOrEqual(0);
    // Começar pequeno não vira enriquecimento passivo: 10 ciclos sem decidir nada.
    expect(previousCash).toBeLessThan(START_CASH * 3.5);
  });

  it('cresce abrindo unidades e preserva a campanha no save', () => {
    const state = runCycles(freshCampaign(), 10, (current) => {
      const player = current.factions.concordia;
      const open = current.operations.length;
      const country = Object.values(current.tiles).find((tile) => tile.owner === 'concordia');
      const city = country ? citiesOf(country.id)[0] : undefined;
      if (!city || open >= 4) return current;
      const sector = open % 2 === 0 ? 'varejo' : 'fazenda';
      const cost = operationCost(city, sector, 1).creditos;
      if (player.stocks.creditos < cost * 1.2) return current;
      return openOperation(current, 'concordia', city.id, sector).state;
    });

    expect(state.phase).toBe('playing');
    expect(state.cycle).toBe(11);
    expect(state.operations.length).toBeGreaterThanOrEqual(1);
    const player = state.factions.concordia;
    expect(player.stocks.creditos).toBeGreaterThan(0);
    for (const value of Object.values(player.stocks)) {
      expect(Number.isFinite(value)).toBe(true);
    }

    const encoded = exportSave(state);
    const loaded = importSave(encoded);
    expect(loaded.error).toBeNull();
    expect(loaded.state?.cycle).toBe(state.cycle);
    expect(loaded.state?.operations.length).toBe(state.operations.length);
    expect(loaded.state?.factions.concordia.stocks.creditos).toBe(player.stocks.creditos);
  });

  it('não deixa o caixa furar o piso e mantém a insolvência armada', () => {
    const state = freshCampaign();
    let current = state;
    let opened = 0;
    const cities = [...citiesOf('PRT'), ...citiesOf('ESP')];
    // Insiste em abrir unidades até o caixa não pagar mais: o motor recusa, não estoura o saldo.
    for (let i = 0; i < 10; i += 1) {
      const result = openOperation(current, 'concordia', cities[i].id, 'varejo');
      if (!result.ok) {
        // Recusa limpa: mensagem própria e caixa intacto.
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.state.factions.concordia.stocks.creditos)
          .toBe(current.factions.concordia.stocks.creditos);
        break;
      }
      current = result.state;
      opened += 1;
    }
    expect(opened).toBeGreaterThan(0);
    for (const faction of Object.values(current.factions)) {
      expect(faction.stocks.creditos).toBeGreaterThanOrEqual(0);
    }
    expect(current.factions.concordia.stocks.creditos).toBeLessThan(operationCost(SEAT_CITY, 'varejo', 1).creditos);
    expect(current.phase).toBe('playing');

    // A mecânica de insolvência continua ligada: seis ciclos no vermelho encerram a companhia.
    current.factions.concordia.deficitCycles = INSOLVENCY_CYCLES;
    const fallen = resolveInsolvency(current);
    expect(fallen).toContain('concordia');
    expect(current.factions.concordia.eliminated).toBe(true);
    expect(current.operations.filter((op) => op.factionId === 'concordia')).toHaveLength(0);
  });
});
