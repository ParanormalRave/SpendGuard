// Read state keyed on dedupeKey — try/catch for private mode
const STORAGE_KEY = "spendguard:read:dedupeKeys";

function loadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function saveSet(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export function getReadDedupeKeys(): Set<string> {
  return loadSet();
}

export function isRead(dedupeKey: string): boolean {
  return loadSet().has(dedupeKey);
}

export function markRead(dedupeKey: string): void {
  const s = loadSet();
  s.add(dedupeKey);
  saveSet(s);
}

export function markAllRead(dedupeKeys: string[]): void {
  const s = loadSet();
  for (const k of dedupeKeys) s.add(k);
  saveSet(s);
}
