/**
 * The key-value layer over localStorage (ARCHITECTURE §6.1).
 *
 * - Every call is wrapped in try/catch: storage can be missing, blocked or
 *   full, and nothing here ever throws.
 * - Values are JSON, decoded through per-key decoders their owners supply.
 *   A value that fails to decode is moved to `qz:quarantine:<key>` and
 *   reset; the rest of storage stays.
 * - When a write hits the quota, the least valuable keys (schema.ts ranks)
 *   are dropped first and the write is retried, but only keys ranked
 *   strictly below the key being written. A write that still can't land is
 *   kept in memory for this tab, so the app behaves the same until the next
 *   load. Quarantine copies never evict anything: on a full store they are
 *   skipped.
 * - Without usable storage (some private windows, unit tests) everything
 *   lives in memory and `persistent` is false.
 * - Device namespaces for tests: in mock builds a page that sets
 *   `window.__QZ_DEVICE__ = 'phone3'` before load gets keys prefixed
 *   `qz:d:phone3:`, so one browser context can hold several devices. The
 *   mock database (`qz-mock:*`) is never namespaced. Supabase builds ignore
 *   the flag.
 */
import { isMockBackend } from "@/lib/env";

import { keyDefinition, quarantineKeyFor, type StorageKey } from "./schema";

/** The slice of the Web Storage API the layer uses. */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Turns a parsed JSON value into a typed one, or null when it doesn't fit. */
export type Decoder<T> = (raw: unknown) => T | null;

export type RawRead =
  | { state: "missing" }
  | { state: "ok"; value: unknown }
  | { state: "unreadable"; text: string };

export interface Kv {
  /** False when values live only in memory. */
  readonly persistent: boolean;
  /** The device namespace in use, or null. */
  readonly device: string | null;
  /**
   * The decoded value, or null when it is missing. A value its decoder
   * refuses is quarantined and reset, unless `quarantine` is false.
   */
  read<T>(
    key: StorageKey,
    decode: Decoder<T>,
    options?: { quarantine?: boolean },
  ): T | null;
  /** The parsed JSON as stored, for migrations. */
  readRaw(key: StorageKey): RawRead;
  /** JSON-encodes and stores; false when the value could not be persisted. */
  write(key: StorageKey, value: unknown): boolean;
  remove(key: StorageKey): void;
  /** Every schema key stored in this namespace. */
  keys(): StorageKey[];
  /** Moves the stored text to `qz:quarantine:<key>` and removes the key. */
  quarantine(key: StorageKey): void;
}

const DEVICE_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** An in-memory StorageLike, for the fallback and for tests. */
export function createMemoryStorage(
  initial: Record<string, string> = {},
): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function isQuotaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014
  );
}

export function createKv(
  options: { storage?: StorageLike | null; device?: string | null } = {},
): Kv {
  const persistent = options.storage != null;
  const storage = options.storage ?? createMemoryStorage();
  const device =
    options.device != null && DEVICE_NAME.test(options.device)
      ? options.device
      : null;
  const prefix = device === null ? "qz:" : `qz:d:${device}:`;
  /** Writes that could not land: physical key to text, or null for a removal. */
  const overlay = new Map<string, string | null>();

  const physical = (key: StorageKey): string =>
    `${prefix}${key.slice("qz:".length)}`;

  function getText(key: StorageKey): string | null {
    const name = physical(key);
    if (overlay.has(name)) return overlay.get(name) ?? null;
    try {
      return storage.getItem(name);
    } catch {
      return null;
    }
  }

  /** Schema keys physically held by storage in this namespace. */
  function persistedKeys(): StorageKey[] {
    const out: StorageKey[] = [];
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const name = storage.key(i);
        if (name === null || !name.startsWith(prefix)) continue;
        const logical = `qz:${name.slice(prefix.length)}`;
        if (keyDefinition(logical) !== null) out.push(logical as StorageKey);
      }
    } catch {
      // A storage that can't be listed has nothing we can evict.
    }
    return out;
  }

  /** Every key this tab can read: storage as the overlay amends it. */
  function storedKeys(): StorageKey[] {
    const out = persistedKeys().filter(
      (key) => overlay.get(physical(key)) !== null,
    );
    for (const [name, text] of overlay) {
      const logical = `qz:${name.slice(prefix.length)}`;
      if (text !== null && !out.includes(logical as StorageKey)) {
        out.push(logical as StorageKey);
      }
    }
    return out;
  }

  /**
   * Drops the least valuable stored key ranked strictly below `keep`; false
   * when none is left. A write may only push out keys worth less than
   * itself, so a re-fetchable cache can never cost the practice history,
   * the outbox or a draft (§6.1, §6.5). A key that is never dropped (rank
   * null) may evict any ranked key. Only keys storage holds count: dropping
   * a value that lives in memory alone frees nothing.
   */
  function evictOne(keep: StorageKey): boolean {
    const keepRank = keyDefinition(keep)?.evictRank ?? Number.POSITIVE_INFINITY;
    const candidates = persistedKeys()
      .filter((key) => key !== keep)
      .map((key) => ({ key, rank: keyDefinition(key)?.evictRank ?? null }))
      .filter(
        (entry): entry is { key: StorageKey; rank: number } =>
          entry.rank !== null && entry.rank < keepRank,
      )
      .sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
    const victim = candidates[0];
    if (victim === undefined) return false;
    try {
      storage.removeItem(physical(victim.key));
    } catch {
      return false;
    }
    overlay.delete(physical(victim.key));
    return true;
  }

  function setText(key: StorageKey, text: string): boolean {
    const name = physical(key);
    for (;;) {
      try {
        storage.setItem(name, text);
        overlay.delete(name);
        return true;
      } catch (error) {
        if (!isQuotaError(error) || !evictOne(key)) {
          overlay.set(name, text);
          return false;
        }
      }
    }
  }

  function readRaw(key: StorageKey): RawRead {
    const text = getText(key);
    if (text === null) return { state: "missing" };
    try {
      return { state: "ok", value: JSON.parse(text) as unknown };
    } catch {
      return { state: "unreadable", text };
    }
  }

  function remove(key: StorageKey): void {
    const name = physical(key);
    try {
      storage.removeItem(name);
      overlay.delete(name);
    } catch {
      overlay.set(name, null);
    }
  }

  /**
   * Stores a quarantine copy only if it fits as storage stands. It never
   * evicts and never goes to the overlay: a copy is the least valuable
   * thing we keep, so on a full or blocked store it is skipped.
   */
  function copyToQuarantine(key: StorageKey, text: string): void {
    const name = physical(quarantineKeyFor(key));
    try {
      storage.setItem(name, text);
      overlay.delete(name);
    } catch {
      // Skipped; the overlay is left alone.
    }
  }

  function quarantine(key: StorageKey): void {
    if (key.startsWith("qz:quarantine:")) {
      remove(key);
      return;
    }
    const text = getText(key);
    if (text !== null) copyToQuarantine(key, text);
    remove(key);
  }

  return {
    persistent,
    device,
    read<T>(
      key: StorageKey,
      decode: Decoder<T>,
      readOptions: { quarantine?: boolean } = {},
    ): T | null {
      const raw = readRaw(key);
      if (raw.state === "missing") return null;
      const value = raw.state === "ok" ? decode(raw.value) : null;
      if (value === null && readOptions.quarantine !== false) quarantine(key);
      return value;
    },
    readRaw,
    write(key: StorageKey, value: unknown): boolean {
      let text: string | undefined;
      try {
        text = JSON.stringify(value);
      } catch {
        return false;
      }
      if (text === undefined) return false;
      return setText(key, text);
    },
    remove,
    keys: storedKeys,
    quarantine,
  };
}

function browserLocalStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    // Some private windows throw on access or on the first read.
    localStorage.getItem("qz:meta");
    return localStorage;
  } catch {
    return null;
  }
}

/** The device namespace a mock-build page asked for, if any. */
function requestedDevice(): string | null {
  if (!isMockBackend()) return null;
  const value = (globalThis as { __QZ_DEVICE__?: unknown }).__QZ_DEVICE__;
  return typeof value === "string" ? value : null;
}

let shared: Kv | null = null;

/** The tab's kv: localStorage when usable, else memory. */
export function getKv(): Kv {
  shared ??= createKv({
    storage: browserLocalStorage(),
    device: requestedDevice(),
  });
  return shared;
}
