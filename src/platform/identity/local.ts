/**
 * The device's guest identity (ARCHITECTURE §9.1, D8), as DLY-1 builds it:
 * load `qz:identity`, or mint one, and hand it to the backend through the
 * client boot. IDN-1 completes the lifecycle from Wave 3 (the backup-cookie
 * restore before minting, the cookie post in `markRegistered`, the 7-day
 * refresh and the cross-tab broadcast); the IdentityProvider contract stays.
 *
 * - Minting: a v4 UUID for the player id and 32 bytes from
 *   `crypto.getRandomValues` for the secret, in unpadded base64url (43
 *   characters). Nothing reaches the server until the first write, which
 *   registers the identity (AC-IDN-01).
 * - `loadLocalIdentity()` loads or mints under a Web Lock, so two tabs
 *   opened together agree on one identity.
 * - A stored value that is not a valid identity is quarantined by the kv
 *   layer and a new one is minted; storage migrations never touch it (§6.1).
 */
import {
  parsePlayerId,
  parseSecret,
  type EpochMs,
  type LocalIdentity,
} from "@/engine/types";
import { getKv, type Kv } from "@/platform/storage";

import type { IdentityProvider } from "./provider";

export const IDENTITY_KEY = "qz:identity";
/** The Web Lock under which a tab loads or mints the identity. */
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

function systemRandom(bytes: Uint8Array): void {
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

export interface LocalIdentityOptions {
  kv?: Kv;
  now?: () => EpochMs;
  random?: RandomBytes;
}

/**
 * An IdentityProvider over `qz:identity`. `current()` loads the stored
 * identity once, or mints and stores one, and never returns null.
 */
export function createLocalIdentityProvider(
  options: LocalIdentityOptions = {},
): IdentityProvider {
  const kv = options.kv ?? getKv();
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? systemRandom;
  let identity: LocalIdentity | null = null;

  const save = (next: LocalIdentity): LocalIdentity => {
    identity = next;
    // A write storage refuses stays in memory for the tab (the kv layer).
    kv.write(IDENTITY_KEY, next);
    return next;
  };

  const current = (): LocalIdentity => {
    if (identity !== null) return identity;
    const stored = kv.read(IDENTITY_KEY, decodeLocalIdentity);
    if (stored !== null) {
      identity = stored;
      return stored;
    }
    return save(mintIdentity(now(), random));
  };

  return {
    current,
    markRegistered(): void {
      const known = current();
      if (!known.registered) save({ ...known, registered: true });
    },
    replace(next: LocalIdentity): void {
      save(next);
    },
  };
}

/** The slice of the Web Locks API the loader uses. */
interface LocksLike {
  request<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
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

/**
 * Loads or mints the tab's identity under a Web Lock, so two tabs opened at
 * the same moment never mint two identities, and returns its provider.
 */
export async function loadLocalIdentity(
  options: LocalIdentityOptions & { locks?: LocksLike | null } = {},
): Promise<IdentityProvider> {
  const provider = createLocalIdentityProvider(options);
  const locks = options.locks === undefined ? browserLocks() : options.locks;
  const load = () => {
    provider.current();
  };
  if (locks === null) load();
  else await locks.request(IDENTITY_LOCK, load);
  return provider;
}
