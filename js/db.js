const DB_NAME = 'sach-reader';
const DB_VERSION = 1;
const STORE = 'books';

let _dbPromise = null;

function openDB() {
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

function run(mode, op) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result = undefined;
        const req = op(store);
        if (req) {
          req.onsuccess = () => {
            result = req.result;
          };
        }
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const db = {
  put(book) {
    return run('readwrite', (s) => s.put(book));
  },
  getAll() {
    return run('readonly', (s) => s.getAll());
  },
  get(id) {
    return run('readonly', (s) => s.get(id));
  },
  delete(id) {
    return run('readwrite', (s) => s.delete(id));
  },
};

export function makeId() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  return 'b-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}