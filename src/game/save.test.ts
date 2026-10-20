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
    expect(storage.getItem('management-century.save.v4')).toBeTruthy();
    expect(storage.getItem('tessera.save.v2')).toBeNull();
    expect(SAVE_KEY).toBe('management-century.save.v4');
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
      alimentos: 400,
    };
    const storage = memoryStorage();
    storage.setItem('management-century.save.v3', JSON.stringify(legacy));
    const result = loadState(storage);
    expect(result.error).toBeNull();
    const migrated = result.state!;
    expect(migrated.version).toBe(4);
    expect(migrated.operations[0].units).toBe(3);
    expect(migrated.operations[0].sector).toBe('porto');
    expect((migrated.operations[0] as unknown as Record<string, unknown>).level).toBeUndefined();
    expect(migrated.factions.concordia.stocks.alimentos).toBe(0);
    expect(migrated.factions.concordia.stocks.creditos).toBeGreaterThan(0);
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
    expect(migrated.version).toBe(4);
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
});
