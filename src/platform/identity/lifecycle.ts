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
 * | A write fails with `auth_failed`   | `recover(failed)`: one cookie restore; if     |
 * |                                    | that can't help, a new identity               |
 *
 * (Sync codes and claim links, the fourth row, replace the identity through
 * `replace()`: IDN-2.)
 *
 * - The decisions run under the Web Lock `qz-identity`, so two tabs opened
 *   together settle on one identity, and two recoveries never both mint.
 * - When `/api/restore` gives no answer we can trust (offline, a timeout, a
 *   server error), the tab mints an identity but keeps it in memory only:
 *   storing it would hide the cookie's identity from every later load. The
 *   question is asked again after 5 s, 15 s and 60 s, then every 5
 *   minutes, whenever the page becomes visible or the browser comes back
 *   online, and on the next load.
 * - The cookie is never overwritten unread. Before a minted identity's
 *   first post (registration, or a refresh of one never posted) the cookie
 *   is read: empty, refused, already this identity, or holding one the
 *   server refused, and the post goes ahead. If it holds another identity
 *   and this tab minted ours while the cookie had no answer, the cookie's
 *   identity is the player's: the tab switches to it (the one just
 *   registered is left behind, unposted), as §9.6 restores a wiped store.
 *   An identity from an earlier visit can't be judged that way (the cookie
 *   may hold a credential the server since refused), so neither is
 *   touched: the cookie keeps its identity and the device keeps its own.
 *   With no answer, a registered identity is stored (so a reload keeps its
 *   progress) but not posted, and the question is asked again.
 * - A restore counts as a lost store (`onRestored`) only when storage
 *   persists: without it every load starts empty, and nothing was lost.
 * - Under 13 (§9.7, `qz:under13`): the device keeps no identity. The tab's
 *   lives in memory, the cookie is never read or posted, and `forget()`
 *   still expires it.
 * - Device namespaces (mock builds, §6.1) stand for separate devices inside
 *   one browser context, which has one cookie jar, so they never read or
 *   write the backup cookie.
 * - Changes from other tabs arrive through `broadcast.ts`: the tab re-reads
 *   `qz:identity` and tells its subscribers when the player changed, or
 *   forgets the identity when another tab did.
 */
import type { EpochMs, LocalIdentity } from "@/engine/types";
import { getKv, type Kv } from "@/platform/storage";

import {
  createHttpBackup,
  type BackupTransport,
  type RestoreOutcome,
} from "./backup";
import { createIdentityChannel, type IdentityChannel } from "./broadcast";
import {
  IDENTITY_KEY,
  IDENTITY_LOCK,
  UNDER13_KEY,
  createLocalIdentityProvider,
  credentialKey,
  decodeLocalIdentity,
  firstBackupPending,
  identityFromBackup,
  mintIdentity,
  sameCredential,
  systemRandom,
  type LocalIdentityProvider,
  type RandomBytes,
} from "./local";
import type { RecoveryOutcome, SentCredential } from "./provider";

export type { RecoveryOutcome, SentCredential } from "./provider";

/** The slice of the Web Locks API the loader uses. */
export interface LocksLike {
  request<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
}

/** Where `online` events come from (`window`). */
export interface OnlineEventSource {
  addEventListener(type: "online", listener: () => void): void;
  removeEventListener(type: "online", listener: () => void): void;
}

/** Where `visibilitychange` events come from (`document`). */
export interface VisibilityEventSource {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** The timers the retries use (`setTimeout`). */
export interface TimersLike {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** When an unanswered restore is asked again: these delays, then every RESTORE_RETRY_EVERY_MS. */
export const RESTORE_RETRY_MS: readonly number[] = [5_000, 15_000, 60_000];
export const RESTORE_RETRY_EVERY_MS = 5 * 60_000;

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
  /** Default: `document`. Null: no retry when the page becomes visible. */
  visibility?: VisibilityEventSource | null;
  /** Default: the global timers. Null: no timed retries. */
  timers?: TimersLike | null;
  /**
   * Called each time the backup cookie brings back the identity a wiped
   * store had lost; the boot logs `identity_restored` and `storage_lost`.
   * Never called while storage doesn't persist.
   */
  onRestored?: (source: RestoreSource) => void;
}

/** The tab's identity, as the boot keeps it. */
export interface ManagedIdentity extends LocalIdentityProvider {
  /**
   * After a write sent with `failed` answered `auth_failed` (a wrong or
   * pruned credential). When the tab has moved on from `failed` already
   * (another tab, or an earlier recovery), nothing is asked: `restored`,
   * and the caller retries with the current identity. Otherwise the backup
   * cookie is asked once, and its identity taken when it differs
   * (`restored`, so the caller retries the write); else the device starts
   * again with a new identity (`minted`, which the caller explains: "We
   * couldn't find your profile on this device, so we started a new
   * one..."). Recoveries run one at a time, under the identity lock.
   * This is `IdentityProvider.recover`, which the Supabase RPC wrapper
   * calls once on `auth_failed` (src/backend/supabase/rpc.ts).
   */
  recover(failed: SentCredential): Promise<RecoveryOutcome>;
  /**
   * Delete my data and Under 13 (PRD §3.10.7, §9.7): forgets the identity
   * in every tab (`erase()`), so none writes it back, and expires the
   * backup cookie. Resolves true once the cookie is expired, or when there
   * is none to expire (a device namespace).
   */
  forget(): Promise<boolean>;
  /** Stops listening to other tabs, connectivity and the retry timer. */
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

function browserVisibility(): VisibilityEventSource | null {
  try {
    return typeof document === "undefined" ? null : document;
  } catch {
    return null;
  }
}

function browserTimers(): TimersLike | null {
  if (typeof globalThis.setTimeout !== "function") return null;
  return {
    setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
    clearTimeout: (handle) =>
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
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

const NO_COOKIE: RestoreOutcome = { kind: "none" };

interface Settled {
  identity: LocalIdentity;
  /** False: kept in memory until the cookie question has an answer. */
  stored: boolean;
  /** True when this tab stored a new identity, which other tabs should hear about. */
  fresh: boolean;
  restored: boolean;
}

/** What asking the cookie decided for one identity. */
type Verdict =
  /** The cookie may take it: it is stored, and a registered one is posted. */
  | "post"
  /** No answer, or one this tab can't act on: nothing is posted. */
  | "hold"
  /** The cookie's identity took its place. */
  | "replaced"
  /** The tab's identity changed while the cookie was asked. */
  | "moved";

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
  // §9.7: after an Under 13 answer the cookie is never read or posted again
  // on this device; `forget()` may still expire it.
  const under13 = kv.readRaw(UNDER13_KEY).state !== "missing";
  const cookie = under13 ? null : backup;
  const ownChannel = options.channel === undefined;
  const channel =
    options.channel !== undefined
      ? options.channel
      : createIdentityChannel({ device: kv.device });
  const locks = options.locks === undefined ? browserLocks() : options.locks;
  const online =
    options.online === undefined ? browserOnlineEvents() : options.online;
  const visibility =
    options.visibility === undefined ? browserVisibility() : options.visibility;
  const timers =
    options.timers === undefined ? browserTimers() : options.timers;
  const onRestored = (source: RestoreSource) => {
    // A store that never persists starts empty on every load: nothing was lost.
    if (!kv.persistent) return;
    try {
      options.onRestored?.(source);
    } catch {
      // Logging never breaks the identity.
    }
  };

  // What this tab knows about credentials, by credentialKey (memory only).
  /** May take the cookie: it was read and is empty, refused, theirs, or dead. */
  const cleared = new Set<string>();
  /** Minted here while the cookie had no answer, at boot or in a recovery. */
  const blind = new Map<string, "boot" | "recover">();
  /** Registered, its first post waiting for the cookie to answer. */
  const waiting = new Set<string>();
  /** Refused by the server (`auth_failed`): a cookie holding one may be overwritten. */
  const dead = new Set<string>();

  const settle = async (): Promise<Settled> => {
    if (under13) {
      // §9.7: no identity is ever stored beside the flag.
      kv.remove(IDENTITY_KEY);
      return {
        identity: mintIdentity(now(), random),
        stored: false,
        fresh: false,
        restored: false,
      };
    }
    const found = kv.read(IDENTITY_KEY, decodeLocalIdentity);
    if (found !== null) {
      return { identity: found, stored: true, fresh: false, restored: false };
    }
    const outcome = cookie === null ? NO_COOKIE : await cookie.restore();
    if (outcome.kind === "restored") {
      const identity = identityFromBackup(outcome.credential, now());
      kv.write(IDENTITY_KEY, identity);
      return { identity, stored: true, fresh: true, restored: true };
    }
    const identity = mintIdentity(now(), random);
    if (outcome.kind === "failed") {
      blind.set(credentialKey(identity), "boot");
      return { identity, stored: false, fresh: false, restored: false };
    }
    cleared.add(credentialKey(identity));
    kv.write(IDENTITY_KEY, identity);
    return { identity, stored: true, fresh: true, restored: false };
  };

  let settled: Settled;
  try {
    settled = await underLock(locks, settle);
  } catch (error) {
    if (ownChannel) channel?.close();
    throw error;
  }

  // The provider asks this before a minted identity's first post.
  let confirm: (target: LocalIdentity) => Promise<boolean> = () =>
    Promise.resolve(false);
  const provider = createLocalIdentityProvider({
    kv,
    now,
    random,
    backup: cookie,
    channel,
    initial: { identity: settled.identity, stored: settled.stored },
    forgotten: under13,
    confirmFirstBackup: (target) => confirm(target),
  });

  /** Settles an answer from the cookie for the tab's identity (`key`), under the lock. */
  const apply = (key: string, outcome: RestoreOutcome): Verdict => {
    if (outcome.kind === "failed") {
      // No answer yet. A registered identity is stored, so a reload keeps
      // its progress, but not posted: the cookie may hold the identity a
      // wiped store lost.
      if (provider.current().registered) provider.persist();
      waiting.add(key);
      return "hold";
    }
    waiting.delete(key);
    if (
      outcome.kind === "restored" &&
      !sameCredential(outcome.credential, provider.current()) &&
      !dead.has(credentialKey(outcome.credential))
    ) {
      const why = blind.get(key);
      // An identity from an earlier visit that never reached the cookie,
      // and a cookie that holds another: there is no telling which one
      // the player wants, so neither is touched.
      if (why === undefined) return "hold";
      // Minted here while the cookie had no answer: the cookie's identity
      // is the player's (§9.6, "restored silently"). Ours is left behind.
      blind.delete(key);
      provider.replace(identityFromBackup(outcome.credential, now()));
      if (why === "boot") onRestored("cookie");
      return "replaced";
    }
    // Empty, refused, this very identity, or one the server refused.
    blind.delete(key);
    cleared.add(key);
    provider.persist();
    return "post";
  };

  /** Reads the cookie for `target`, the tab's identity, and settles what it can. */
  const askCookie = (target: SentCredential): Promise<Verdict> => {
    if (cookie === null) return Promise.resolve("hold");
    return underLock(locks, async () => {
      // Another tab may have settled it, or changed it, meanwhile.
      provider.reload();
      if (provider.forgotten || !sameCredential(provider.current(), target)) {
        return "moved";
      }
      const key = credentialKey(target);
      if (cleared.has(key)) {
        provider.persist();
        return "post";
      }
      const outcome = await cookie.restore();
      provider.reload();
      if (provider.forgotten || !sameCredential(provider.current(), target)) {
        return "moved";
      }
      return apply(key, outcome);
    });
  };

  // Retries while the cookie owes the tab's identity an answer.
  let disposed = false;
  let retrying = false;
  let listening = false;
  let retryStep = 0;
  let retryTimer: unknown = null;

  const pending = (): boolean => {
    if (cookie === null || disposed || provider.forgotten) return false;
    if (!provider.stored) return true;
    // Waiting for its first post, which another tab may have made meanwhile.
    const self = provider.current();
    return waiting.has(credentialKey(self)) && firstBackupPending(self);
  };

  const stopRetrying = (): void => {
    if (retryTimer !== null) {
      timers?.clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (!listening) return;
    listening = false;
    online?.removeEventListener("online", onOnline);
    visibility?.removeEventListener("visibilitychange", onVisible);
  };

  const schedule = (): void => {
    if (timers === null || retryTimer !== null) return;
    const delay = RESTORE_RETRY_MS[retryStep] ?? RESTORE_RETRY_EVERY_MS;
    retryStep += 1;
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      void retry();
    }, delay);
  };

  const retry = async (): Promise<void> => {
    if (retrying) return;
    if (!pending()) {
      stopRetrying();
      return;
    }
    retrying = true;
    try {
      const self = provider.current();
      // A registered identity's first post reads the cookie itself.
      if (self.registered) await provider.refreshBackup();
      else await askCookie(self);
    } catch {
      // The next trigger asks again.
    } finally {
      retrying = false;
      if (pending()) schedule();
      else stopRetrying();
    }
  };

  function onOnline(): void {
    void retry();
  }

  function onVisible(): void {
    if (visibility?.visibilityState === "visible") void retry();
  }

  const startRetrying = (): void => {
    if (!pending()) return;
    if (!listening) {
      listening = true;
      retryStep = 0;
      online?.addEventListener("online", onOnline);
      visibility?.addEventListener("visibilitychange", onVisible);
    }
    schedule();
  };

  confirm = async (target) => {
    const key = credentialKey(target);
    if (cleared.has(key)) {
      if (sameCredential(provider.current(), target)) provider.persist();
      return provider.stored;
    }
    const verdict = await askCookie(target);
    if (waiting.has(key)) startRetrying();
    return verdict === "post";
  };

  if (settled.fresh) channel?.announce();
  const stopTabs = channel?.listen((news) => {
    provider.reload(news);
  });
  // A tab that changed the identity after the lock was released and before
  // the listener above existed went unheard: read once more.
  provider.reload();
  if (settled.restored) onRestored("cookie");
  // §9.1 step 3: a registered identity re-posts a cookie 7 days old or
  // more; a restored one re-posts at once, its cookie's age unknown.
  void provider.refreshBackup();
  startRetrying();

  let recovering: Promise<unknown> = Promise.resolve();

  return Object.assign(provider, {
    recover(failed: SentCredential): Promise<RecoveryOutcome> {
      // The credential the write was sent with, captured before any wait.
      const sent: SentCredential = {
        playerId: failed.playerId,
        secret: failed.secret,
      };
      const run = recovering.then(() =>
        underLock(locks, async (): Promise<RecoveryOutcome> => {
          dead.add(credentialKey(sent));
          provider.reload();
          // Another tab, or an earlier recovery, moved on already.
          if (!sameCredential(provider.current(), sent)) return "restored";
          const outcome =
            cookie === null || provider.forgotten
              ? NO_COOKIE
              : await cookie.restore();
          provider.reload();
          if (!sameCredential(provider.current(), sent)) return "restored";
          if (
            outcome.kind === "restored" &&
            !dead.has(credentialKey(outcome.credential))
          ) {
            provider.replace(identityFromBackup(outcome.credential, now()));
            return "restored";
          }
          const fresh = mintIdentity(now(), random);
          // Its first post may overwrite the cookie only once it was read.
          if (outcome.kind === "failed") {
            blind.set(credentialKey(fresh), "recover");
          } else {
            cleared.add(credentialKey(fresh));
          }
          provider.replace(fresh);
          return "minted";
        }),
      );
      recovering = run.catch(() => undefined);
      return run;
    },
    async forget(): Promise<boolean> {
      stopRetrying();
      waiting.clear();
      await underLock(locks, async () => {
        provider.erase();
      });
      // A post of ours still in flight could land after the expiry and set
      // the cookie again: let it finish first.
      await provider.idle();
      // Even under the Under 13 flag: an earlier expiry may have failed.
      return backup === null ? true : backup.remove();
    },
    dispose(): void {
      disposed = true;
      stopRetrying();
      stopTabs?.();
      if (ownChannel) channel?.close();
    },
  });
}
