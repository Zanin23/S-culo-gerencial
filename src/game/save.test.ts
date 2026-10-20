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
    expect(storage.getItem('management-century.save.v2')).toBeTruthy();
    expect(storage.getItem('tessera.save.v2')).toBeNull();
    expect(SAVE_KEY).toBe('management-century.save.v2');
  });

  it('migra a campanha salva como TESSERA e libera a chave antiga', () => {
    const storage = memoryStorage();
    const legacy = JSON.stringify(state());
    storage.setItem(LEGACY_SAVE_KEYS[0], legacy);

    const result = loadState(storage);
    expect(result.error).toBeNull();
    expect(result.state?.cycle).toBe(1);

    // Uma vez lida, a campanha passa a viver na chave nova.
    expect(storage.getItem(SAVE_KEY)).toBe(legacy);
    expect(storage.getItem(LEGACY_SAVE_KEYS[0])).toBeNull();
  });

  it('prefere a chave nova quando as duas existem', () => {
    const storage = memoryStorage();
    const current = state();
    current.cycle = 5;
    storage.setItem(SAVE_KEY, JSON.stringify(current));
    storage.setItem(LEGACY_SAVE_KEYS[0], JSON.stringify(state()));

    expect(loadState(storage).state?.cycle).toBe(5);
  });

  it('clearSave apaga as duas chaves', () => {
    const storage = memoryStorage();
    saveState(state(), storage);
    storage.setItem(LEGACY_SAVE_KEYS[0], '{}');
    clearSave(storage);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_SAVE_KEYS[0])).toBeNull();
  });
});
