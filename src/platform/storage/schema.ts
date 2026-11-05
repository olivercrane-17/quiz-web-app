/**
 * The storage schema (ARCHITECTURE §6.1, §6.2): the version, every key, its
 * owner and how readily it may be dropped when storage is full. Every key
 * starts with `qz:`. Owners decode their own values with typed decoders in
 * their modules (`kv.read(key, decode)`); a value that fails its decoder is
 * quarantined and reset.
 */
import type { EpochMs } from "@/engine/types";

export const STORAGE_VERSION = 1;

/** Every local-storage key, as features name it (device namespaces are added by kv). */
export type StorageKey =
  | "qz:meta"
  | "qz:identity"
  | "qz:profile"
  | "qz:sync"
  | "qz:settings"
  | "qz:practice"
  | "qz:review"
  | "qz:mastery"
  | `qz:runs:${string}`
  | "qz:history"
  | "qz:cache:daily"
  | "qz:cache:groups"
  | "qz:cache:challenges"
  | "qz:denylist"
  | "qz:outbox"
  | "qz:offers"
  | `qz:drafts:${string}`
  | `qz:seats:${string}`
  | `qz:host:${string}`
  | "qz:under13"
  | `qz:quarantine:${string}`;

export interface KeyDefinition {
  /** The key, or the prefix of a family of keys. */
  key: string;
  prefix: boolean;
  owner: string;
  /**
   * When storage is full, lower ranks are dropped first. Null: never
   * dropped (identity, settings and the records a restore depends on).
   */
  evictRank: number | null;
}

export const STORAGE_KEYS: readonly KeyDefinition[] = [
  { key: "qz:quarantine:", prefix: true, owner: "CORE-0a", evictRank: 0 },
  { key: "qz:cache:daily", prefix: false, owner: "DLY-2", evictRank: 10 },
  { key: "qz:cache:groups", prefix: false, owner: "GRP-1", evictRank: 10 },
  { key: "qz:cache:challenges", prefix: false, owner: "CHL-1", evictRank: 10 },
  { key: "qz:offers", prefix: false, owner: "DLY-3", evictRank: 15 },
  { key: "qz:denylist", prefix: false, owner: "PRA-2", evictRank: 20 },
  { key: "qz:seats:", prefix: true, owner: "ROM-3", evictRank: 25 },
  { key: "qz:host:", prefix: true, owner: "ROM-2", evictRank: 25 },
  { key: "qz:runs:", prefix: true, owner: "PRA-1", evictRank: 30 },
  { key: "qz:history", prefix: false, owner: "PRA-1", evictRank: 40 },
  { key: "qz:outbox", prefix: false, owner: "PRA-2", evictRank: 50 },
  { key: "qz:profile", prefix: false, owner: "IDN-1", evictRank: 60 },
  { key: "qz:review", prefix: false, owner: "REV-1", evictRank: 70 },
  { key: "qz:mastery", prefix: false, owner: "MAS-1", evictRank: 75 },
  { key: "qz:practice", prefix: false, owner: "PRA-2", evictRank: 80 },
  { key: "qz:drafts:", prefix: true, owner: "EDT-1", evictRank: 90 },
  { key: "qz:meta", prefix: false, owner: "CORE-0a", evictRank: null },
  { key: "qz:identity", prefix: false, owner: "IDN-1", evictRank: null },
  { key: "qz:sync", prefix: false, owner: "IDN-2", evictRank: null },
  { key: "qz:settings", prefix: false, owner: "CORE-0a", evictRank: null },
  { key: "qz:under13", prefix: false, owner: "SET-1", evictRank: null },
];

/**
 * Session-storage keys (§6.2); per tab, so never namespaced by device.
 * Their owners use sessionStorage directly, so only this list (and the
 * schema test that holds every `qz:` name in src/ to it) keeps /privacy's
 * storage list complete.
 */
export const SESSION_KEYS = [
  "qz:session",
  "qz:practice-intent",
  "qz:practice-run",
  "qz:server-clock",
  "qz:share-origin",
  "qz:restore-notice",
] as const;
export type SessionKey = (typeof SESSION_KEYS)[number];

/** The definition a key falls under, or null for a key outside the schema. */
export function keyDefinition(key: string): KeyDefinition | null {
  return (
    STORAGE_KEYS.find((def) =>
      def.prefix
        ? key.startsWith(def.key) && key.length > def.key.length
        : key === def.key,
    ) ?? null
  );
}

export function isStorageKey(key: string): key is StorageKey {
  return keyDefinition(key) !== null;
}

/** Where a key that failed to decode is kept: `qz:quarantine:<key without qz:>`. */
export function quarantineKeyFor(key: StorageKey): StorageKey {
  return `qz:quarantine:${key.slice("qz:".length)}`;
}

/** `qz:meta` (§6.2). */
export interface StorageMeta {
  storageVersion: number;
  createdAt: EpochMs;
  migratedAt: EpochMs | null;
}

export function decodeMeta(raw: unknown): StorageMeta | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { storageVersion, createdAt, migratedAt } = raw as Record<
    string,
    unknown
  >;
  if (
    typeof storageVersion !== "number" ||
    !Number.isInteger(storageVersion) ||
    storageVersion < 1 ||
    typeof createdAt !== "number" ||
    !Number.isFinite(createdAt) ||
    !(
      migratedAt === null ||
      (typeof migratedAt === "number" && Number.isFinite(migratedAt))
    )
  ) {
    return null;
  }
  return { storageVersion, createdAt, migratedAt };
}
