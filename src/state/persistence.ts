// IndexedDB storage for saved games. Two object stores: `meta` (small, for listing) and `saves`
// (the full JSON text). Slots: automatic save + three manual slots.

import type { SaveMeta } from '../engine/game/saveFormat.ts';

export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  auto: 'Automatické uložení',
  slot1: 'Pozice 1',
  slot2: 'Pozice 2',
  slot3: 'Pozice 3',
};

export interface SaveListItem {
  slot: Slot;
  meta: SaveMeta;
}

export interface SaveStorage {
  list(): Promise<SaveListItem[]>;
  read(slot: Slot): Promise<string | null>;
  write(slot: Slot, meta: SaveMeta, text: string): Promise<void>;
  remove(slot: Slot): Promise<void>;
}

const DB_NAME = 'fotbalovy-manazer';
const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Chyba IndexedDB'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Chyba IndexedDB'));
    tx.onabort = () => reject(tx.error ?? new Error('Zápis do IndexedDB byl přerušen'));
  });
}

export function indexedDbStorage(factory: IDBFactory = globalThis.indexedDB): SaveStorage {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => {
    if (!factory) return Promise.reject(new Error('Prohlížeč nepodporuje IndexedDB, hru nejde uložit.'));
    dbPromise ??= new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
        if (!d.objectStoreNames.contains('saves')) d.createObjectStore('saves');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB nejde otevřít'));
    });
    return dbPromise;
  };

  return {
    async list() {
      const d = await db();
      const tx = d.transaction('meta', 'readonly');
      const store = tx.objectStore('meta');
      const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
      return keys
        .map((k, i) => ({ slot: k as Slot, meta: values[i] as SaveMeta }))
        .filter((x) => (SLOTS as readonly string[]).includes(x.slot))
        .sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
    },
    async read(slot) {
      const d = await db();
      const value = await request(d.transaction('saves', 'readonly').objectStore('saves').get(slot));
      return typeof value === 'string' ? value : null;
    },
    async write(slot, meta, text) {
      const d = await db();
      const tx = d.transaction(['meta', 'saves'], 'readwrite');
      tx.objectStore('saves').put(text, slot);
      tx.objectStore('meta').put(meta, slot);
      await transactionDone(tx);
    },
    async remove(slot) {
      const d = await db();
      const tx = d.transaction(['meta', 'saves'], 'readwrite');
      tx.objectStore('saves').delete(slot);
      tx.objectStore('meta').delete(slot);
      await transactionDone(tx);
    },
  };
}

/** In-memory storage (fallback and tests). */
export function memoryStorage(): SaveStorage {
  const saves = new Map<Slot, { meta: SaveMeta; text: string }>();
  return {
    list: async () => SLOTS.filter((s) => saves.has(s)).map((slot) => ({ slot, meta: saves.get(slot)!.meta })),
    read: async (slot) => saves.get(slot)?.text ?? null,
    write: async (slot, meta, text) => void saves.set(slot, { meta, text }),
    remove: async (slot) => void saves.delete(slot),
  };
}
