/**
 * Storage migrations (ARCHITECTURE §6.1): ordered, idempotent steps
 * `{ from, to, run(kv) }` that run once at boot, before any feature reads
 * storage, inside a Web Locks request so two tabs never migrate at once.
 *
 * Rules: a key that fails to decode is quarantined and reset while the
 * rest of storage stays; identity is never deleted by a migration; each
 * migration has a unit test that feeds it a snapshot from the previous
 * version.
 */
import type { EpochMs } from "@/engine/types";

import { getKv, type Kv } from "./kv";
import {
  STORAGE_VERSION,
  decodeMeta,
  type StorageKey,
  type StorageMeta,
} from "./schema";

export interface MigrationContext {
  now: EpochMs;
  /** Keys a migration moved to quarantine. */
  quarantined: StorageKey[];
}

export interface Migration {
  from: number;
  to: number;
  describe: string;
  run(kv: Kv, ctx: MigrationContext): void;
}

/** Keys no migration may quarantine or remove. */
const PROTECTED: ReadonlySet<StorageKey> = new Set<StorageKey>(["qz:identity"]);

export const MIGRATIONS: readonly Migration[] = [
  {
    from: 0,
    to: 1,
    describe:
      "Adopt versioned storage: quarantine any qz: value that is not JSON, except the identity, and stamp qz:meta.",
    run(kv, ctx) {
      for (const key of kv.keys()) {
        if (
          PROTECTED.has(key) ||
          key === "qz:meta" ||
          key.startsWith("qz:quarantine:")
        ) {
          continue;
        }
        if (kv.readRaw(key).state === "unreadable") {
          kv.quarantine(key);
          ctx.quarantined.push(key);
        }
      }
    },
  },
];

export interface MigrationReport {
  /** The version found, 0 when storage carried no qz:meta. */
  from: number;
  to: number;
  applied: string[];
  quarantined: StorageKey[];
  /** Storage written by a newer build: left untouched. */
  newerThanApp: boolean;
}

/** Brings storage to `target`. Synchronous and idempotent. */
export function migrateStorage(
  kv: Kv,
  now: EpochMs,
  migrations: readonly Migration[] = MIGRATIONS,
  target: number = STORAGE_VERSION,
): MigrationReport {
  const raw = kv.readRaw("qz:meta");
  const meta: StorageMeta | null =
    raw.state === "ok" ? decodeMeta(raw.value) : null;
  const from = meta?.storageVersion ?? 0;
  const report: MigrationReport = {
    from,
    to: from,
    applied: [],
    quarantined: [],
    newerThanApp: from > target,
  };
  if (report.newerThanApp) return report;

  const ctx: MigrationContext = { now, quarantined: report.quarantined };
  const ordered = [...migrations].sort((a, b) => a.from - b.from);
  let version = from;
  for (const migration of ordered) {
    if (migration.from !== version || migration.to > target) continue;
    migration.run(kv, ctx);
    report.applied.push(`${migration.from}->${migration.to}`);
    version = migration.to;
  }
  report.to = version;

  if (meta === null || version !== from) {
    kv.write("qz:meta", {
      storageVersion: version,
      createdAt: meta?.createdAt ?? now,
      migratedAt: report.applied.length > 0 ? now : (meta?.migratedAt ?? null),
    } satisfies StorageMeta);
  }
  return report;
}

/** The slice of the Web Locks API the runner uses. */
export interface LockManagerLike {
  request<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
}

function browserLocks(): LockManagerLike | null {
  try {
    const locks = (
      globalThis.navigator as { locks?: LockManagerLike } | undefined
    )?.locks;
    return locks ?? null;
  } catch {
    return null;
  }
}

export const MIGRATION_LOCK = "qz-storage-migrate";

/**
 * Runs the migrations once at boot under a Web Lock, so two tabs never
 * migrate at once. Without Web Locks it runs directly.
 */
export async function runStorageMigrations(
  options: {
    kv?: Kv;
    now?: () => EpochMs;
    locks?: LockManagerLike | null;
  } = {},
): Promise<MigrationReport> {
  const kv = options.kv ?? getKv();
  const now = options.now ?? (() => Date.now());
  const locks = options.locks === undefined ? browserLocks() : options.locks;
  const run = () => migrateStorage(kv, now());
  return locks === null ? run() : locks.request(MIGRATION_LOCK, run);
}
