import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { indexedDbStorage, memoryStorage } from '../src/state/persistence.ts';
import { createAppStore } from '../src/state/store.ts';
import { makeSave, serializeSave } from '../src/engine/game/saveFormat.ts';

const data = loadDefaultData();
const makeStore = (storage = memoryStorage()) =>
  createAppStore({ data, storage, now: () => new Date('2026-11-14T12:00:00Z'), yieldToUi: async () => {} });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('store', () => {
  it('nová hra otevře Domů a automaticky se uloží', async () => {
    const storage = memoryStorage();
    const store = makeStore(storage);
    store.getState().startNewGame({ clubId: 'sparta-praha', managerName: 'Test', seed: 's1' });
    expect(store.getState().screen).toEqual({ name: 'home' });
    await flush();
    expect((await storage.list()).map((s) => s.slot)).toEqual(['auto']);
  });

  it('Pokračovat odehraje můj zápas a ukáže výsledek', async () => {
    const store = makeStore();
    store.getState().startNewGame({ clubId: 'sparta-praha', managerName: 'Test', seed: 's1' });
    const rev = store.getState().revision;
    await store.getState().continueGame();
    expect(store.getState().screen).toEqual({ name: 'match', reportIndex: 0 });
    expect(store.getState().revision).toBeGreaterThan(rev);
    store.getState().back();
    expect(store.getState().screen).toEqual({ name: 'home' });
  });

  it('uložit a načíst vrátí stejnou hru', async () => {
    const store = makeStore();
    store.getState().startNewGame({ clubId: 'zlin', managerName: 'Test', seed: 's2' });
    await store.getState().continueGame();
    await store.getState().saveTo('slot1');
    const before = JSON.stringify(store.getState().game);
    await store.getState().continueGame();
    await store.getState().loadFrom('slot1');
    expect(JSON.stringify(store.getState().game)).toBe(before);
    expect(store.getState().screen).toEqual({ name: 'home' });
  });

  it('import poškozeného souboru ukáže chybu a hru nezmění', () => {
    const store = makeStore();
    store.getState().importGame('{"format":"cosi"}');
    expect(store.getState().message?.kind).toBe('error');
    expect(store.getState().game).toBeNull();
  });

  it('import a export', () => {
    const store = makeStore();
    store.getState().startNewGame({ clubId: 'karvina', managerName: 'Test', seed: 's3' });
    const out = store.getState().exportGame()!;
    expect(out.fileName).toBe('fotbalovy-manazer-karvina-2026-07-01.json');
    const other = makeStore();
    other.getState().importGame(out.text);
    expect(JSON.stringify(other.getState().game)).toBe(JSON.stringify(store.getState().game));
  });

  it('přeskočení na konec: sezóna dohraná, sestavy vybíral asistent, nastavení se vrátí', async () => {
    const store = makeStore();
    store.getState().startNewGame({ clubId: 'opava', managerName: 'Test', seed: 's4' });
    await store.getState().skipToEnd();
    const game = store.getState().game!;
    expect(game.finished).toBe(true);
    expect(store.getState().screen).toEqual({ name: 'seasonEnd' });
    expect(game.user!.autoLineup).toBe(false);
    expect(store.getState().busy).toBeNull();
  });

  it('úprava taktiky zvýší revizi', () => {
    const store = makeStore();
    store.getState().startNewGame({ clubId: 'opava', managerName: 'Test', seed: 's5' });
    const rev = store.getState().revision;
    store.getState().editUser((u) => (u.tactics = { ...u.tactics, pressing: 'high' }));
    expect(store.getState().game!.user!.tactics.pressing).toBe('high');
    expect(store.getState().revision).toBe(rev + 1);
  });
});

describe('IndexedDB úložiště', () => {
  it('zápis, seznam, čtení a smazání', async () => {
    const storage = indexedDbStorage();
    const store = makeStore();
    store.getState().startNewGame({ clubId: 'dukla-praha', managerName: 'Test', seed: 'idb' });
    const save = makeSave(store.getState().game!, data, 'Ruční', '2026-11-14T12:00:00Z');
    await storage.write('slot2', save.meta, serializeSave(save));
    expect((await storage.list()).map((s) => [s.slot, s.meta.clubName])).toEqual([['slot2', 'FK Dukla Praha']]);
    expect(await storage.read('slot2')).toBe(serializeSave(save));
    await storage.remove('slot2');
    expect(await storage.list()).toEqual([]);
    expect(await storage.read('slot2')).toBeNull();
  });
});
