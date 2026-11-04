/**
 * Which identity a tab starts with, and how it stays right (ARCHITECTURE
 * §9.1, §9.6). The client boot (`src/features/identity/boot.ts`) runs
 * `loadIdentity()` once per tab, before any island reads the identity, and
 * hands the result to the backend.
 *
 * Restore precedence (§9.6):
 *
 * | Situation                          | Outcome                                       |
 * |------------------------------------|-----------------------------------------------|
 * | `qz:identity` present              | Used. Its cookie is re-posted if 7 days old   |
 * | Store empty, backup cookie present | Restored silently (`source: 'cookie'`), then  |
 * |                                    | `identity_restored` and `storage_lost` logged |
 * | Store empty, no cookie             | A new identity is minted and stored           |
 * | A write fails with `auth_failed`   | `recover()`: one cookie restore; if that      |
 * |                                    | can't help, a new identity                    |
 *
 * (Sync codes and claim links, the fourth row, replace the identity through
 * `replace()`: IDN-2.)
 *
 * - The decision runs under the Web Lock `qz-identity`, so two tabs opened
 *   together settle on one identity.
 * - When `/api/restore` gives no answer we can trust (offline, a timeout, a
 *   server error), the tab mints an identity but keeps it in memory only:
 *   storing it would hide the cookie's identity from every later load. The
 *   question is asked again when the browser comes back online, and on the
 *   next load. The identity is stored as soon as it registers, or when the
 *   answer turns out to be "no cookie".
 * - Device namespaces (mock builds, §6.1) stand for separate devices inside
 *   one browser context, which has one cookie jar, so they never read or
 *   write the backup cookie.
 * - Changes from other tabs arrive through `broadcast.ts`: the tab re-reads
 *   `qz:identity` and tells its subscribers when the player changed.
 */
import type { EpochMs, LocalIdentity } from "@/engine/types";
import { getKv, type Kv } from "@/platform/storage";

import { createHttpBackup, type BackupTransport } from "./backup";
import { createIdentityChannel, type IdentityChannel } from "./broadcast";
import {
  IDENTITY_KEY,
  IDENTITY_LOCK,
  createLocalIdentityProvider,
  decodeLocalIdentity,
  identityFromBackup,
  mintIdentity,
  sameCredential,
  systemRandom,
  type LocalIdentityProvider,
  type RandomBytes,
} from "./local";

/** The slice of the Web Locks API the loader uses. */
export interface LocksLike {
  request<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
}

/** Where `online` events come from (`window`). */
export interface OnlineEventSource {
  addEventListener(type: "online", listener: () => void): void;
  removeEventListener(type: "online", listener: () => void): void;
}

/** How a restore brought an identity back, for `identity_restored` (PRD §7.2). */
export type RestoreSource = "cookie";

export interface LoadIdentityOptions {
  kv?: Kv;
  now?: () => EpochMs;
  random?: RandomBytes;
  /** Default: the HTTP routes, or none in a device namespace (mock builds). */
  backup?: BackupTransport | null;
  /** Default: `BroadcastChannel('qz')` and storage events. Null: none. */
  channel?: IdentityChannel | null;
  /** Default: `navigator.locks`. Null: no lock. */
  locks?: LocksLike | null;
  /** Default: `window`. Null: no retry when the browser comes back online. */
  online?: OnlineEventSource | null;
  /**
   * Called each time the backup cookie brings back the identity a wiped
   * store had lost; the boot logs `identity_restored` and `storage_lost`.
   */
  onRestored?: (source: RestoreSource) => void;
}

/** What `recover()` did (§9.6, §7.3 `auth_failed`). */
export type RecoveryOutcome = "restored" | "minted";

/** The tab's identity, as the boot keeps it. */
export interface ManagedIdentity extends LocalIdentityProvider {
  /**
   * After a write failed with `auth_failed` (a wrong or pruned credential):
   * the backup cookie is asked once, and its identity taken when it differs
   * from the one that failed (`restored`, so the caller retries the write).
   * Otherwise the cookie can't fix it, and the device starts again with a
   * new identity (`minted`, which the caller explains: "We couldn't find
   * your profile on this device, so we started a new one...").
   */
  recover(): Promise<RecoveryOutcome>;
  /** Stops listening to other tabs and to connectivity. */
  dispose(): void;
}

function browserLocks(): LocksLike | null {
  try {
    return (
      (globalThis.navigator as { locks?: LocksLike } | undefined)?.locks ?? null
    );
  } catch {
    return null;
  }
}

function browserOnlineEvents(): OnlineEventSource | null {
  try {
    return typeof window === "undefined" ? null : window;
  } catch {
    return null;
  }
}

/** Runs `work` under the identity lock when there is one. */
async function underLock<T>(
  locks: LocksLike | null,
  work: () => Promise<T>,
): Promise<T> {
  if (locks === null) return work();
  let ran = false;
  try {
    return await locks.request(IDENTITY_LOCK, () => {
      ran = true;
      return work();
    });
  } catch (error) {
    // A lock manager that refuses (a sandboxed frame) still lets us work.
    if (ran) throw error;
    return work();
  }
}

interface Settled {
  identity: LocalIdentity;
  /** False: kept in memory until the cookie question has an answer. */
  stored: boolean;
  /** True when this tab stored a new identity, which other tabs should hear about. */
  fresh: boolean;
  restored: boolean;
}

/**
 * Loads the tab's identity by the precedence of §9.6 and returns it,
 * listening to other tabs. Rejects only when no identity can be minted
 * (no `crypto.getRandomValues`, §9.1 step 5).
 */
export async function loadIdentity(
  options: LoadIdentityOptions = {},
): Promise<ManagedIdentity> {
  const kv = options.kv ?? getKv();
  const now = options.now ?? (() => Date.now() as EpochMs);
  const random = options.random ?? systemRandom;
  const backup =
    options.backup !== undefined
      ? options.backup
      : kv.device === null
        ? createHttpBackup()
        : null;
  const ownChannel = options.channel === undefined;
  const channel =
    options.channel !== undefined
      ? options.channel
      : createIdentityChannel({ device: kv.device });
  const locks = options.locks === undefined ? browserLocks() : options.locks;
  const online =
    options.online === undefined ? browserOnlineEvents() : options.online;
  const onRestored = (source: RestoreSource) => {
    try {
      options.onRestored?.(source);
    } catch {
      // Logging never breaks the identity.
    }
  };

  const settle = async (): Promise<Settled> => {
    const found = kv.read(IDENTITY_KEY, decodeLocalIdentity);
    if (found !== null) {
      return { identity: found, stored: true, fresh: false, restored: false };
    }
    const outcome =
      backup === null ? ({ kind: "none" } as const) : await backup.restore();
    if (outcome.kind === "restored") {
      const identity = identityFromBackup(outcome.credential, now());
      kv.write(IDENTITY_KEY, identity);
      return { identity, stored: true, fresh: true, restored: true };
    }
    const identity = mintIdentity(now(), random);
    if (outcome.kind === "failed") {
      return { identity, stored: false, fresh: false, restored: false };
    }
    kv.write(IDENTITY_KEY, identity);
    return { identity, stored: true, fresh: true, restored: false };
  };

  const settled = await underLock(locks, settle);
  const provider = createLocalIdentityProvider({
    kv,
    now,
    random,
    backup,
    channel,
    initial: { identity: settled.identity, stored: settled.stored },
  });
  if (settled.fresh) channel?.announce();
  const stopTabs = channel?.listen(() => {
    provider.reload();
  });
  if (settled.restored) onRestored("cookie");
  // §9.1 step 3: a registered identity re-posts a cookie 7 days old or
  // more; a restored one re-posts at once, its cookie's age unknown.
  void provider.refreshBackup();

  // The restore had no answer: ask again once the browser is back online.
  let retrying = false;
  let stopOnline: (() => void) | null = null;
  const retryRestore = async (): Promise<void> => {
    if (retrying || backup === null) return;
    retrying = true;
    try {
      await underLock(locks, async () => {
        if (provider.stored) return;
        // Another tab may have settled it meanwhile.
        if (kv.read(IDENTITY_KEY, decodeLocalIdentity) !== null) {
          provider.reload();
          return;
        }
        const outcome = await backup.restore();
        if (provider.stored) return;
        if (outcome.kind === "restored") {
          provider.replace(identityFromBackup(outcome.credential, now()));
          onRestored("cookie");
        } else if (outcome.kind !== "failed") {
          provider.persist();
        }
      });
    } finally {
      retrying = false;
      if (provider.stored) stopOnline?.();
    }
  };
  if (!settled.stored && backup !== null && online !== null) {
    const onOnline = () => {
      void retryRestore();
    };
    online.addEventListener("online", onOnline);
    stopOnline = () => {
      online.removeEventListener("online", onOnline);
      stopOnline = null;
    };
  }

  return Object.assign(provider, {
    async recover(): Promise<RecoveryOutcome> {
      const failed = provider.current();
      if (backup !== null) {
        const outcome = await backup.restore();
        if (
          outcome.kind === "restored" &&
          !sameCredential(outcome.credential, failed)
        ) {
          provider.replace(identityFromBackup(outcome.credential, now()));
          return "restored";
        }
      }
      provider.replace(mintIdentity(now(), random));
      return "minted";
    },
    dispose(): void {
      stopTabs?.();
      stopOnline?.();
      if (ownChannel) channel?.close();
    },
  });
}
