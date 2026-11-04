/**
 * The device's guest identity (ARCHITECTURE §9.1, D8): `qz:identity`, the
 * IdentityProvider the backend adds to every call that needs it, minting,
 * and the backup cookie and cross-tab news hooked to every change.
 * `lifecycle.ts` decides which identity a tab starts with (local storage,
 * then the backup cookie, then a new one, §9.6); this module keeps it.
 *
 * - Minting: a v4 UUID for the player id and 32 bytes from
 *   `crypto.getRandomValues` for the secret, in unpadded base64url (43
 *   characters). Nothing reaches the server until the first write, which
 *   registers the identity (AC-IDN-01).
 * - `markRegistered()` runs after the first successful write: it records
 *   `registered` and posts the identity to the backup cookie, then records
 *   `cookieSavedAt` once the route answered (§9.1 step 2). `replace()` (a
 *   sync-code or claim restore) posts a registered identity the same way.
 * - The first post of a minted identity waits for `confirmFirstBackup`
 *   (the lifecycle reads the cookie first): an identity minted while
 *   `/api/restore` had no answer must never overwrite the identity a wiped
 *   store lost (§9.6). Until the cookie answers, a registered identity in
 *   memory only stays there; the lifecycle stores it.
 * - `refreshBackup()` re-posts a registered identity whose cookie was never
 *   saved, or was saved 7 days ago or more, so its 400-day Max-Age keeps
 *   rolling (§9.1 step 3). A post the route refused (403) counts as saved
 *   for that clock: asking again on every load would only be refused again.
 * - Every stored change is announced to the other tabs (§6.4), and
 *   `reload()` is how a tab takes in another tab's change.
 * - `erase()` (Delete my data, Under 13, §9.7) forgets the identity: the
 *   key goes, the other tabs hear it, and from then on the tab keeps a new
 *   identity in memory only, storing and posting nothing. The same happens
 *   in a tab that hears another tab forget, or that finds the Under 13
 *   flag, and a write-back that raced the news is removed again, so a
 *   forgotten secret doesn't come back. A tab never overwrites another
 *   tab's different identity with its own: it takes the other one.
 * - A stored value that is not a valid identity is quarantined by the kv
 *   layer and a new one is minted; storage migrations never touch it (§6.1).
 *
 * The secret never reaches a log, an error message or an analytics event.
 */
import {
  parsePlayerId,
  parseSecret,
  type EpochMs,
  type LocalIdentity,
} from "@/engine/types";
import { getKv, type Kv } from "@/platform/storage";

import type { BackupSaveOutcome, BackupTransport } from "./backup";
import type { IdentityChannel } from "./broadcast";
import { BACKUP_REFRESH_MS, type BackupCredential } from "./cookie";
import { PROFILE_KEY } from "./profile";
import type { IdentityProvider } from "./provider";

export const IDENTITY_KEY = "qz:identity";
/** The Web Lock under which a tab loads, restores or mints the identity. */
export const IDENTITY_LOCK = "qz-identity";
/**
 * SET-1's flag after an Under 13 answer (§6.2, §9.7). While it exists the
 * device keeps no identity: nothing is stored, posted or restored.
 */
export const UNDER13_KEY = "qz:under13";

const SOURCES: readonly LocalIdentity["source"][] = [
  "minted",
  "cookie",
  "sync",
  "claim",
];

/** A stored identity, or null when the value is not one (§3.10). */
export function decodeLocalIdentity(raw: unknown): LocalIdentity | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const playerId = parsePlayerId(record.playerId);
  const secret = parseSecret(record.secret);
  const createdAt = record.createdAt;
  const cookieSavedAt = record.cookieSavedAt ?? null;
  if (
    record.v !== 1 ||
    playerId === null ||
    secret === null ||
    typeof record.registered !== "boolean" ||
    typeof createdAt !== "number" ||
    !Number.isFinite(createdAt) ||
    !SOURCES.includes(record.source as LocalIdentity["source"]) ||
    !(
      cookieSavedAt === null ||
      (typeof cookieSavedAt === "number" && Number.isFinite(cookieSavedAt))
    )
  ) {
    return null;
  }
  return {
    v: 1,
    playerId,
    secret,
    registered: record.registered,
    createdAt,
    source: record.source as LocalIdentity["source"],
    cookieSavedAt: cookieSavedAt as EpochMs | null,
  };
}

/** Fills a buffer with secure random bytes (`crypto.getRandomValues`). */
export type RandomBytes = (bytes: Uint8Array) => void;

export function systemRandom(bytes: Uint8Array): void {
  globalThis.crypto.getRandomValues(bytes);
}

const BASE64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Unpadded base64url. */
export function base64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += BASE64URL[(n >> 18) & 63];
    out += BASE64URL[(n >> 12) & 63];
    if (b !== undefined) out += BASE64URL[(n >> 6) & 63];
    if (c !== undefined) out += BASE64URL[n & 63];
  }
  return out;
}

/** A v4 UUID from 16 random bytes; works outside secure contexts, unlike randomUUID. */
export function uuidV4(random: RandomBytes = systemRandom): string {
  const bytes = new Uint8Array(16);
  random(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}

/** A new identity: a v4 player id and a 256-bit secret (§9.1 step 1). */
export function mintIdentity(
  now: EpochMs,
  random: RandomBytes = systemRandom,
): LocalIdentity {
  const playerId = parsePlayerId(uuidV4(random));
  const secretBytes = new Uint8Array(32);
  random(secretBytes);
  const secret = parseSecret(base64url(secretBytes));
  if (playerId === null || secret === null) {
    throw new Error("could not mint an identity");
  }
  return {
    v: 1,
    playerId,
    secret,
    registered: false,
    createdAt: now,
    source: "minted",
    cookieSavedAt: null,
  };
}

/**
 * The identity the backup cookie brought back (§9.6): registered, since only
 * a registered identity is ever posted, and with no `cookieSavedAt`, since
 * the cookie's age is unknown, so the next refresh re-posts it at once.
 */
export function identityFromBackup(
  credential: BackupCredential,
  now: EpochMs,
): LocalIdentity {
  return {
    v: 1,
    playerId: credential.playerId,
    secret: credential.secret,
    registered: true,
    createdAt: now,
    source: "cookie",
    cookieSavedAt: null,
  };
}

/** The same player and the same device credential. */
export function sameCredential(
  a: Pick<LocalIdentity, "playerId" | "secret">,
  b: Pick<LocalIdentity, "playerId" | "secret">,
): boolean {
  return a.playerId === b.playerId && a.secret === b.secret;
}

/**
 * A key for one credential, for in-memory bookkeeping only (it holds the
 * secret: never store or log it).
 */
export function credentialKey(
  credential: Pick<LocalIdentity, "playerId" | "secret">,
): string {
  return `${credential.playerId}.${credential.secret}`;
}

function sameIdentity(a: LocalIdentity, b: LocalIdentity): boolean {
  return (
    sameCredential(a, b) &&
    a.registered === b.registered &&
    a.createdAt === b.createdAt &&
    a.source === b.source &&
    a.cookieSavedAt === b.cookieSavedAt
  );
}

/** True when a registered identity's cookie should be posted again (§9.1 step 3). */
export function backupDue(identity: LocalIdentity, now: EpochMs): boolean {
  if (!identity.registered) return false;
  const saved = identity.cookieSavedAt;
  // A save stamped in the future means the clock moved: refresh rather than wait.
  return saved === null || saved > now || now - saved >= BACKUP_REFRESH_MS;
}

/**
 * True for an identity the cookie may never have seen: minted on this
 * device and never posted. Its first post must not overwrite a cookie
 * nobody has read (§9.6), so it waits for `confirmFirstBackup`.
 */
export function firstBackupPending(identity: LocalIdentity): boolean {
  return identity.source === "minted" && identity.cookieSavedAt === null;
}

export interface LocalIdentityOptions {
  kv?: Kv;
  now?: () => EpochMs;
  random?: RandomBytes;
  /**
   * The backup cookie. With one, `markRegistered()` and `replace()` post a
   * registered identity, and `refreshBackup()` re-posts a stale one.
   * Default: none, for tests and device namespaces.
   */
  backup?: BackupTransport | null;
  /** Cross-tab news: every stored change is announced. Default: none. */
  channel?: IdentityChannel | null;
  /**
   * The identity the tab starts with, and whether it is stored already
   * (`lifecycle.ts`). Default: the stored one, else a new one stored at
   * once, on first use.
   */
  initial?: { identity: LocalIdentity; stored: boolean };
  /**
   * Asked before the first post of a minted identity (`firstBackupPending`):
   * resolves true when the cookie may take it. `lifecycle.ts` reads the
   * cookie here and stores an identity that lives in memory. Without it, a
   * registered identity is stored and posted at once (tests, device
   * namespaces).
   */
  confirmFirstBackup?: ((target: LocalIdentity) => Promise<boolean>) | null;
  /** True: start forgotten (Under 13, §9.7): nothing is ever stored or posted. */
  forgotten?: boolean;
}

/** The tab's identity: what the backend uses, plus what the lifecycle needs. */
export interface LocalIdentityProvider extends IdentityProvider {
  /**
   * False while the identity lives in memory only: minted while the backup
   * cookie could not be asked (offline, a timeout), so a later answer can
   * still bring the old identity back (§9.1, `lifecycle.ts`). Also false
   * once forgotten.
   */
  readonly stored: boolean;
  /**
   * True once this tab forgot the identity (`erase()`, another tab's
   * forget, or the Under 13 flag): its identity lives in memory only, and
   * nothing is stored, posted or announced until the next load.
   */
  readonly forgotten: boolean;
  /** Stores the in-memory identity as it stands, unless another tab stored one meanwhile. */
  persist(): void;
  /**
   * Takes in `qz:identity` as another tab left it (§6.4). Returns true when
   * the player or the credential changed. A missing or unreadable key
   * changes nothing here (the other tab owns that problem), unless the
   * other tab said it forgot the identity or the Under 13 flag is set: then
   * this tab forgets it too, and removes its own secret if a write-back of
   * its own put it back.
   */
  reload(news?: { forgotten?: boolean }): boolean;
  /** Posts the backup now if it is due (§9.1 step 3); true once stored. */
  refreshBackup(): Promise<boolean>;
  /**
   * Forgets the identity on this device (§9.7, PRD §3.10.7): removes
   * `qz:identity` and `qz:profile`, tells the other tabs, and keeps a new
   * identity in memory only from then on. Expiring the cookie is the
   * lifecycle's (`ManagedIdentity.forget()`), after `idle()`.
   */
  erase(): void;
  /** Resolves once this tab has no backup post in flight. */
  idle(): Promise<void>;
  /** Called with the new identity whenever the player or the credential changes. */
  subscribe(listener: (identity: LocalIdentity) => void): () => void;
}

/**
 * An IdentityProvider over `qz:identity`. `current()` never returns null:
 * without an initial identity it loads the stored one, or mints and stores
 * one, on first use.
 */
export function createLocalIdentityProvider(
  options: LocalIdentityOptions = {},
): LocalIdentityProvider {
  const kv = options.kv ?? getKv();
  const now = options.now ?? (() => Date.now() as EpochMs);
  const random = options.random ?? systemRandom;
  const backup = options.backup ?? null;
  const channel = options.channel ?? null;
  const confirmFirstBackup = options.confirmFirstBackup ?? null;
  let identity: LocalIdentity | null = options.initial?.identity ?? null;
  let forgotten = options.forgotten === true;
  let stored = forgotten ? false : (options.initial?.stored ?? true);
  const listeners = new Set<(identity: LocalIdentity) => void>();
  /** The backup post in flight, by credential, so two triggers share one request. */
  let saving: { key: string; done: Promise<boolean> } | null = null;

  const notify = (next: LocalIdentity) => {
    for (const listener of [...listeners]) {
      try {
        listener(next);
      } catch {
        // One listener's bug never stops the others.
      }
    }
  };

  /** True while SET-1's Under 13 flag is set: the device keeps no identity (§9.7). */
  const deviceKeepsNone = (): boolean =>
    kv.readRaw(UNDER13_KEY).state !== "missing";

  /**
   * Forgets the identity in this tab: `replacement`, or a new one, lives in
   * memory from now on, and nothing is stored, posted or announced again.
   */
  const drop = (replacement?: LocalIdentity): void => {
    if (forgotten) return;
    forgotten = true;
    stored = false;
    let next = replacement ?? null;
    if (next === null) {
      try {
        next = mintIdentity(now(), random);
      } catch {
        // Without randomness the old identity stays, in memory only.
      }
    }
    if (next === null) return;
    const previous = identity;
    identity = next;
    if (previous === null || !sameCredential(previous, next)) notify(next);
  };

  /** Takes `next` as the tab's identity, stores it and tells the other tabs. */
  const save = (next: LocalIdentity): LocalIdentity => {
    if (!forgotten && deviceKeepsNone()) {
      drop(next);
      return next;
    }
    const previous = identity;
    identity = next;
    if (!forgotten) {
      stored = true;
      // A write storage refuses stays in memory for the tab (the kv layer).
      kv.write(IDENTITY_KEY, next);
      channel?.announce();
    }
    if (previous === null || !sameCredential(previous, next)) notify(next);
    return next;
  };

  const current = (): LocalIdentity => {
    if (identity !== null) return identity;
    if (!forgotten) {
      const found = kv.read(IDENTITY_KEY, decodeLocalIdentity);
      if (found !== null) {
        identity = found;
        stored = true;
        return found;
      }
    }
    return save(mintIdentity(now(), random));
  };

  const reload = (news: { forgotten?: boolean } = {}): boolean => {
    if (forgotten) return false;
    const keepsNone = deviceKeepsNone();
    if (news.forgotten === true || keepsNone) {
      // A write-back of this tab's may have raced the other tab's forget:
      // the forgotten secret goes again. Another identity stored since (a
      // fresh load's) stays, unless the device keeps none at all.
      const onDisk = kv.read(IDENTITY_KEY, decodeLocalIdentity, {
        quarantine: false,
      });
      if (
        onDisk !== null &&
        (keepsNone || (identity !== null && sameCredential(onDisk, identity)))
      ) {
        kv.remove(IDENTITY_KEY);
      }
      drop();
      return true;
    }
    const found = kv.read(IDENTITY_KEY, decodeLocalIdentity, {
      quarantine: false,
    });
    if (found === null) return false;
    const previous = identity;
    if (previous !== null && sameIdentity(previous, found)) {
      stored = true;
      return false;
    }
    identity = found;
    stored = true;
    const changed = previous === null || !sameCredential(previous, found);
    if (changed) notify(found);
    return changed;
  };

  /**
   * Whether the tab may write `target` back over the stored identity
   * (registration, the cookie stamp, a post). Never once forgotten, and
   * never while the Under 13 flag is set, which forgets it here too. Not
   * when another tab stored a different identity meanwhile: the tab takes
   * that one. Another tab's newer copy of the same identity is taken in
   * first, so the write starts from it.
   *
   * A key that is simply gone is written back: WebKit can wipe storage
   * under an open tab, and a registration it lost would orphan the player.
   * Deleting the identity is announced instead (`erase()`), and a tab that
   * wrote back before the news arrived removes it again (`reload()`).
   */
  const mayWriteBack = (target: LocalIdentity): boolean => {
    if (forgotten) return false;
    if (deviceKeepsNone()) {
      reload();
      return false;
    }
    if (!stored) return true;
    const onDisk = kv.read(IDENTITY_KEY, decodeLocalIdentity, {
      quarantine: false,
    });
    if (onDisk === null) return true;
    reload();
    return sameCredential(onDisk, target);
  };

  /** Posts the current identity to the backup and records when the route answered. */
  const saveBackup = (): Promise<boolean> => {
    if (backup === null || forgotten) return Promise.resolve(false);
    const target = current();
    if (!target.registered) return Promise.resolve(false);
    const key = credentialKey(target);
    if (saving !== null && saving.key === key) return saving.done;
    const done = (async (): Promise<boolean> => {
      if (confirmFirstBackup !== null && firstBackupPending(target)) {
        const go = await confirmFirstBackup(target).catch(() => false);
        if (!go) return false;
      }
      // While the cookie was asked, the tab may have moved on, forgotten,
      // or still hold the identity in memory only: then nothing is posted.
      if (!stored || !sameCredential(current(), target)) return false;
      if (!mayWriteBack(target)) return false;
      const outcome: BackupSaveOutcome = await backup
        .save({ playerId: target.playerId, secret: target.secret })
        .catch(() => "failed" as const);
      // Only the identity that was posted gets the stamp: a restore or
      // another tab may have replaced it while the request ran, or a forget
      // may have removed it. A refusal is stamped too, so the next post
      // waits the usual 7 days instead of one load (§9.1 step 3).
      if (
        outcome !== "failed" &&
        stored &&
        sameCredential(current(), target) &&
        mayWriteBack(target)
      ) {
        save({ ...current(), cookieSavedAt: now() });
      }
      return outcome === "saved";
    })().catch(() => false);
    const entry = { key, done };
    saving = entry;
    void done.then(() => {
      if (saving === entry) saving = null;
    });
    return done;
  };

  return {
    current,
    get stored() {
      return stored;
    },
    get forgotten() {
      return forgotten;
    },
    markRegistered(): void {
      const known = current();
      if (known.registered) return;
      if (forgotten) {
        identity = { ...known, registered: true };
        return;
      }
      if (
        !stored &&
        confirmFirstBackup !== null &&
        backup !== null &&
        firstBackupPending(known)
      ) {
        // Minted while the cookie had no answer: registered from now on,
        // but stored (and posted) only once the lifecycle has read the
        // cookie, which may hold the identity a wiped store lost (§9.6).
        identity = { ...known, registered: true };
        void saveBackup();
        return;
      }
      if (!mayWriteBack(known)) return;
      const latest = current();
      if (latest.registered) return;
      save({ ...latest, registered: true });
      void saveBackup();
    },
    replace(next: LocalIdentity): void {
      save(next);
      if (next.registered && !forgotten) void saveBackup();
    },
    persist(): void {
      if (stored || forgotten) return;
      const target = current();
      // Another tab may have stored an identity meanwhile: take it, never overwrite it.
      const found = kv.read(IDENTITY_KEY, decodeLocalIdentity, {
        quarantine: false,
      });
      if (found !== null && !sameCredential(found, target)) {
        reload();
        return;
      }
      save(target);
    },
    reload,
    refreshBackup(): Promise<boolean> {
      if (backup === null || forgotten) return Promise.resolve(false);
      return backupDue(current(), now())
        ? saveBackup()
        : Promise.resolve(false);
    },
    erase(): void {
      drop();
      kv.remove(IDENTITY_KEY);
      kv.remove(PROFILE_KEY);
      channel?.announce({ forgotten: true });
    },
    idle(): Promise<void> {
      return saving === null
        ? Promise.resolve()
        : saving.done.then(() => undefined);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
