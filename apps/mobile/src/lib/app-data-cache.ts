type CacheEntry<T> = {
  data: T;
  updatedAt: number;
};

const DEFAULT_MAX_AGE_MS = 60_000;
const cache = new Map<string, CacheEntry<unknown>>();

export function getCachedData<T>(key: string): CacheEntry<T> | null {
  return (cache.get(key) as CacheEntry<T> | undefined) ?? null;
}

export function setCachedData<T>(key: string, data: T): void {
  cache.set(key, { data, updatedAt: Date.now() });
}

export function isCacheFresh(
  entry: CacheEntry<unknown> | null,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): boolean {
  return Boolean(entry && Date.now() - entry.updatedAt < maxAgeMs);
}

export function updateCachedData<T>(
  key: string,
  update: (current: T | null) => T,
): T {
  const next = update(getCachedData<T>(key)?.data ?? null);
  setCachedData(key, next);
  return next;
}

export function invalidateCachedData(key: string): void {
  cache.delete(key);
}
