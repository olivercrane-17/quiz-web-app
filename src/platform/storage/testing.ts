/**
 * Storage doubles for unit tests of the kv layer and the migrations.
 * Imported by tests only.
 */
import type { StorageLike } from "./kv";

/** A storage that refuses everything, as some private windows do. */
export function throwingStorage(): StorageLike {
  const fail = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  return {
    get length(): number {
      return fail();
    },
    key: fail,
    getItem: fail,
    setItem: fail,
    removeItem: fail,
  };
}

/** Characters an entry takes: its value, plus its key as browsers count. */
export function entrySize(
  key: string,
  value: string,
  countKeys: boolean,
): number {
  return value.length + (countKeys ? key.length : 0);
}

/**
 * A storage that holds at most `capacity` characters of values, or of keys
 * plus values (as browsers count) with `countKeys`. A write past the
 * capacity throws `QuotaExceededError`.
 */
export function quotaStorage(
  capacity: number,
  initial: Record<string, string> = {},
  { countKeys = false }: { countKeys?: boolean } = {},
): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  const used = () =>
    [...map].reduce(
      (sum, [key, value]) => sum + entrySize(key, value, countKeys),
      0,
    );
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem(key, value) {
      const current = map.get(key);
      const before =
        current === undefined ? 0 : entrySize(key, current, countKeys);
      if (used() - before + entrySize(key, value, countKeys) > capacity) {
        throw new DOMException("full", "QuotaExceededError");
      }
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}
