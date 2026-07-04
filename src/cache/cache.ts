import { openDB } from "idb";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const pending = new Map<string, Promise<unknown>>();

const database = openDB("hexagon-map-tiles", 1, {
  upgrade(db) {
    db.createObjectStore("responses");
  },
});

export async function cachedJson<T>(
  key: string,
  provider: () => Promise<T>,
  ttlMilliseconds: number,
): Promise<T> {
  const db = await database;
  const cached = (await db.get("responses", key)) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = pending.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const request = provider().then(async (value) => {
    await db.put(
      "responses",
      { value, expiresAt: Date.now() + ttlMilliseconds } satisfies CacheEntry<T>,
      key,
    );
    return value;
  });
  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}
