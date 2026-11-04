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
 *   `cookieSavedAt` once the route stored it (§9.1 step 2). `replace()` (a
 *   sync-code or claim restore) posts a registered identity the same way.
 * - `refreshBackup()` re-posts a registered identity whose cookie was never
 *   saved, or was saved 7 days ago or more, so its 400-day Max-Age keeps
 *   rolling (§9.1 step 3).
 * - Every stored change is announced to the other tabs (§6.4), and
 *   `reload()` is how a tab takes in another tab's change.
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

import type { BackupTransport } from "./backup";
import type { IdentityChannel } from "./broadcast";
import { BACKUP_REFRESH_MS, type BackupCredential } from "./cookie";
import type { IdentityProvider } from "./provider";

export const IDENTITY_KEY = "qz:identity";
/** The Web Lock under which a tab loads, restores or mints the identity. */
export const IDENTITY_LOCK = "qz-identity";

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
}

/** The tab's identity: what the backend uses, plus what the lifecycle needs. */
export interface LocalIdentityProvider extends IdentityProvider {
  /**
   * False while the identity lives in memory only: minted while the backup
   * cookie could not be asked (offline, a timeout), so a later answer can
   * still bring the old identity back (§9.1, `lifecycle.ts`).
   */
  readonly stored: boolean;
  /** Stores the in-memory identity as it stands. */
  persist(): void;
  /**
   * Takes in `qz:identity` as another tab left it (§6.4). Returns true when
   * the player or the credential changed. A missing or unreadable key
   * changes nothing here: the other tab owns that problem.
   */
  reload(): boolean;
  /** Posts the backup now if it is due (§9.1 step 3); true once stored. */
  refreshBackup(): Promise<boolean>;
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
  let identity: LocalIdentity | null = options.initial?.identity ?? null;
  let stored = options.initial?.stored ?? true;
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

  /** Takes `next` as the tab's identity, stores it and tells the other tabs. */
  const save = (next: LocalIdentity): LocalIdentity => {
    const previous = identity;
    identity = next;
    stored = true;
    // A write storage refuses stays in memory for the tab (the kv layer).
    kv.write(IDENTITY_KEY, next);
    channel?.announce();
    if (previous === null || !sameCredential(previous, next)) notify(next);
    return next;
  };

  const current = (): LocalIdentity => {
    if (identity !== null) return identity;
    const found = kv.read(IDENTITY_KEY, decodeLocalIdentity);
    if (found !== null) {
      identity = found;
      stored = true;
      return found;
    }
    return save(mintIdentity(now(), random));
  };

  /** Posts the current identity to the backup and records when it landed. */
  const saveBackup = (): Promise<boolean> => {
    if (backup === null) return Promise.resolve(false);
    const target = current();
    const key = `${target.playerId}.${target.secret}`;
    if (saving !== null && saving.key === key) return saving.done;
    const done = backup
      .save({ playerId: target.playerId, secret: target.secret })
      .catch(() => false)
      .then((ok) => {
        if (saving?.done === done) saving = null;
        const latest = current();
        // Only the identity that was posted gets the stamp: a restore or
        // another tab may have replaced it while the request ran.
        if (ok && sameCredential(latest, target)) {
          save({ ...latest, cookieSavedAt: now() });
        }
        return ok;
      });
    saving = { key, done };
    return done;
  };

  return {
    current,
    get stored() {
      return stored;
    },
    markRegistered(): void {
      const known = current();
      if (known.registered) return;
      save({ ...known, registered: true });
      void saveBackup();
    },
    replace(next: LocalIdentity): void {
      save(next);
      if (next.registered) void saveBackup();
    },
    persist(): void {
      if (!stored) save(current());
    },
    reload(): boolean {
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
    },
    refreshBackup(): Promise<boolean> {
      if (backup === null) return Promise.resolve(false);
      return backupDue(current(), now())
        ? saveBackup()
        : Promise.resolve(false);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
