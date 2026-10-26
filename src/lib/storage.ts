/*
 * Settings, exam progress and results live in this browser's localStorage.
 * Audio blobs live in IndexedDB (see audioDb.ts). Nothing here leaves the device.
 */
export const STORAGE_KEYS = {
  settings: 'opic-mock.settings.v1',
  activeExam: 'opic-mock.activeExam.v1',
  results: 'opic-mock.results.v1',
  practice: 'opic-mock.practice.v1',
} as const;

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
