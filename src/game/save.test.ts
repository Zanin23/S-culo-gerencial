import { describe, expect, it } from 'vitest';
import { clearSave, LEGACY_SAVE_KEYS, loadState, SAVE_KEY, saveState } from './state';
import { createInitialState } from './state';

/** Storage falso em memória: o teste roda sem jsdom. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
  } as Storage;
}

const state = () => createInitialState(7, 1_700_000_000_000);

describe('save com o novo nome do jogo', () => {
  it('grava na chave de MANAGEMENT CENTURY', () => {
    const storage = memoryStorage();
    expect(saveState(state(), storage)).toBe(true);
    expect(storage.getItem('management-century.save.v6')).toBeTruthy();
    expect(storage.getItem('tessera.save.v2')).toBeNull();
    expect(SAVE_KEY).toBe('management-century.save.v6');
  });

  it('migra a campanha salva como TESSERA e libera a chave antiga', () => {
    const storage = memoryStorage();
    const legacy = storage.getItem(SAVE_KEY) ?? JSON.stringify(state());
    storage.setItem(LEGACY_SAVE_KEYS[LEGACY_SAVE_KEYS.length - 1], legacy);

    const result = loadState(storage);
    expect(result.error).toBeNull();
    expect(result.state?.cycle).toBe(1);

    // Uma vez lida, a campanha passa a viver na chave nova e já no formato v3.
    expect(storage.getItem(SAVE_KEY)).toBeTruthy();
    expect(storage.getItem(LEGACY_SAVE_KEYS[LEGACY_SAVE_KEYS.length - 1])).toBeNull();
  });

  it('converte filiais com nível em unidades e renomeia o setor logístico', () => {
    const legacy = JSON.parse(JSON.stringify(state())) as Record<string, unknown>;
    legacy.version = 3;
    legacy.operations = [
      { id: 'op1', factionId: 'concordia', cityId: 'c1', countryId: 'PRT', sector: 'logistica', level: 3, openedCycle: 1 },
    ];
    (legacy.factions as Record<string, Record<string, unknown>>).concordia.stocks = {
      ...((legacy.factions as Record<string, Record<string, Record<string, number>>>).concordia.stocks),
      creditos: 380,
      alimentos: 400,
    };
    const storage = memoryStorage();
    storage.setItem('management-century.save.v3', JSON.stringify(legacy));
    const result = loadState(storage);
    expect(result.error).toBeNull();
    const migrated = result.state!;
    expect(migrated.version).toBe(6);
    expect(migrated.operations[0].units).toBe(3);
    expect(migrated.operations[0].sector).toBe('porto');
    expect((migrated.operations[0] as unknown as Record<string, unknown>).level).toBeUndefined();
    expect(migrated.factions.concordia.stocks.alimentos).toBe(0);
    // O caixa antigo é reescalado para reais (fator 20 000).
    expect(migrated.factions.concordia.stocks.creditos).toBe(7_600_000);
  });

  it('prefere a chave nova quando as duas existem', () => {
    const storage = memoryStorage();
    const current = state();
    current.cycle = 5;
    storage.setItem(SAVE_KEY, JSON.stringify(current));
    storage.setItem(LEGACY_SAVE_KEYS[0], JSON.stringify(state()));

    expect(loadState(storage).state?.cycle).toBe(5);
  });

  it('clearSave apaga a chave nova e todas as legadas', () => {
    const storage = memoryStorage();
    saveState(state(), storage);
    for (const key of LEGACY_SAVE_KEYS) storage.setItem(key, '{}');
    clearSave(storage);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    for (const key of LEGACY_SAVE_KEYS) expect(storage.getItem(key)).toBeNull();
  });


  it('converte caixa, mercado e histórico de uma campanha antiga para reais', () => {
    const legacy = JSON.parse(JSON.stringify(state())) as Record<string, unknown>;
    legacy.version = 5;
    (legacy.factions as Record<string, Record<string, unknown>>).concordia.stocks = {
      ...((legacy.factions as Record<string, Record<string, Record<string, number>>>).concordia.stocks),
      creditos: 420,
    };
    legacy.market = {
      prices: { alimentos: 1.1, energia: 0.9, materias: 1.2, bens: 1.4 },
      previous: { alimentos: 1.0, energia: 0.9, materias: 1.2, bens: 1.3 },
    };
    legacy.history = [{
      cycle: 3,
      stocks: { creditos: 300, alimentos: 4, energia: 2, materias: 3, bens: 1, influencia: 2, conhecimento: 1 },
      production: { creditos: 14, alimentos: 2, energia: 1, materias: 1, bens: 0, influencia: 1, conhecimento: 0 },
      net: { creditos: 9, alimentos: 1, energia: 0, materias: 0, bens: 0, influencia: 0, conhecimento: 0 },
      tiles: 2, pop: 34, score: 33,
    }];
    legacy.projects = [{
      id: 'p1', factionId: 'concordia', kind: 'obra', tileId: 't1', building: 'fazenda',
      targetLevel: 1, cost: { creditos: 78, materias: 13, energia: 5 }, cyclesLeft: 1, cyclesTotal: 2,
    }];

    const storage = memoryStorage();
    storage.setItem('management-century.save.v5', JSON.stringify(legacy));
    const migrated = loadState(storage).state!;

    expect(migrated.version).toBe(6);
    expect(migrated.factions.concordia.stocks.creditos).toBe(8_400_000);
    expect(migrated.market.prices.alimentos).toBe(22_000);
    expect(migrated.market.previous.bens).toBe(26_000);
    expect(migrated.history[0].stocks.creditos).toBe(6_000_000);
    expect(migrated.history[0].net.creditos).toBe(180_000);
    expect(migrated.projects[0].cost.creditos).toBe(1_560_000);
  });

  it('converte uma campanha v2 com exército e guerra para o formato gerencial', () => {
    const legacy = JSON.parse(JSON.stringify(state())) as Record<string, unknown>;
    legacy.version = 2;
    delete legacy.operations;
    const factions = legacy.factions as Record<string, Record<string, unknown>>;
    factions.concordia.military = 120;
    factions.concordia.warExhaustion = 8;
    const diplomacy = legacy.diplomacy as Record<string, Record<string, unknown>>;
    const relationKey = Object.keys(diplomacy)[0];
    diplomacy[relationKey].war = true;
    legacy.projects = [{ id: 'p1', factionId: 'concordia', kind: 'operacao', tileId: 't1' }];
    legacy.offers = [{ id: 'o1', from: 'aurelia', to: 'concordia', kind: 'peace' }];
    legacy.lastBattle = { tileId: 't1', winner: 'concordia' };
    legacy.lastReport = { battles: 2, creditsGained: 10 };
    legacy.log = [{ id: 'l1', cycle: 1, kind: 'militar', text: 'Guerra declarada.' }];

    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify(legacy));
    const result = loadState(storage);
    expect(result.error).toBeNull();
    const migrated = result.state!;
    expect(migrated.version).toBe(6);
    expect(migrated.operations).toEqual([]);
    expect(migrated.factions.concordia.deficitCycles).toBe(0);
    expect((migrated.factions.concordia as unknown as Record<string, unknown>).military).toBeUndefined();
    expect((migrated.diplomacy[relationKey] as unknown as Record<string, unknown>).war).toBeUndefined();
    expect(migrated.projects).toHaveLength(0);
    expect(migrated.offers).toHaveLength(0);
    expect(migrated.log[0].kind).toBe('operacoes');
    expect((migrated as unknown as Record<string, unknown>).lastBattle).toBeUndefined();
    expect((migrated.lastReport as unknown as Record<string, unknown> | undefined)?.battles).toBeUndefined();
  });

  it('abre uma campanha v4 sem expansões como estágio inicial', () => {
    const legacy = JSON.parse(JSON.stringify(state())) as Record<string, unknown>;
    legacy.version = 4;
    legacy.operations = [
      { id: 'op1', factionId: 'concordia', cityId: 'c1', countryId: 'PRT', sector: 'varejo', units: 2, openedCycle: 1 },
    ];
    legacy.city = {
      cityId: 'c1', cityName: 'Lisboa', countryId: 'PRT', district: 'Centro',
      plotId: 'c1-lote-01', foundedCycle: 1,
    };
    const storage = memoryStorage();
    storage.setItem('management-century.save.v4', JSON.stringify(legacy));

    const result = loadState(storage);
    expect(result.error).toBeNull();
    const migrated = result.state!;
    expect(migrated.version).toBe(6);
    expect(migrated.operations[0].build).toBe(0);
    expect(migrated.operations[0].range).toBe(0);
    expect(migrated.city?.build).toBe(0);
    // A campanha antiga continua jogável e é regravada já no formato v6.
    expect(storage.getItem(SAVE_KEY)).toBeTruthy();
    expect(storage.getItem('management-century.save.v4')).toBeNull();
  });

  it('limita expansões corrompidas ao intervalo válido', () => {
    const legacy = JSON.parse(JSON.stringify(state())) as Record<string, unknown>;
    legacy.version = 4;
    legacy.operations = [
      { id: 'op1', factionId: 'concordia', cityId: 'c1', countryId: 'PRT', sector: 'varejo', units: 2, openedCycle: 1, build: 99, range: -4 },
    ];
    legacy.city = {
      cityId: 'c1', cityName: 'Lisboa', countryId: 'PRT', district: 'Centro',
      plotId: 'c1-lote-01', foundedCycle: 1, build: 42,
    };
    const storage = memoryStorage();
    storage.setItem('management-century.save.v4', JSON.stringify(legacy));

    const migrated = loadState(storage).state!;
    expect(migrated.operations[0].build).toBe(3);
    expect(migrated.operations[0].range).toBe(0);
    expect(migrated.city?.build).toBe(3);
  });
});
