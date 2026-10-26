/** IndexedDB store for recorded answers. Blobs stay in this browser only. */
const DB_NAME = 'opic-mock-audio';
const STORE = 'answers';

export interface StoredAudio {
  key: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) return Promise.reject(new Error('이 브라우저는 IndexedDB를 지원하지 않아 녹음을 저장할 수 없습니다.'));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('IndexedDB를 열 수 없습니다.'));
    };
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error('저장 공간이 부족하거나 저장이 중단되었습니다.'));
      }),
  );
}

export function putAudio(audio: StoredAudio) {
  return run('readwrite', (s) => s.put(audio));
}

export function getAudio(key: string) {
  return run<StoredAudio | undefined>('readonly', (s) => s.get(key));
}

export function deleteAudio(key: string) {
  return run('readwrite', (s) => s.delete(key));
}

export async function deleteAudioByPrefix(prefix: string) {
  const keys = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  await Promise.all(keys.filter((k) => String(k).startsWith(prefix)).map((k) => deleteAudio(String(k))));
}

export function clearAllAudio() {
  return run('readwrite', (s) => s.clear());
}
