import type { Book } from './types';

const DB_NAME = 'sach-reader';
const DB_VERSION = 1;
const STORE = 'books';

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest | null): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result: T = undefined as T;
        const req = op(store);
        if (req) {
          req.onsuccess = () => {
            result = req.result;
          };
        }
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export function idbPut(book: Book): Promise<void> {
  return run('readwrite', (s) => s.put(book)) as Promise<void>;
}

export function idbGetAll(): Promise<Book[]> {
  return run<Book[]>('readonly', (s) => s.getAll());
}

export function idbGet(id: string): Promise<Book | undefined> {
  return run<Book | undefined>('readonly', (s) => s.get(id));
}

export function idbDelete(id: string): Promise<void> {
  return run('readwrite', (s) => s.delete(id)) as Promise<void>;
}