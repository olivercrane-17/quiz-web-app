/**
 * The mock identity area (ARCHITECTURE §7.4, §8.5, §9.1), following the
 * SQL rules with engine code: the device mints its player id and secret,
 * nothing reaches the server until a write, and the first write registers
 * the identity (`start_daily` is "auth, registers"). The server keeps only a
 * hash of the secret, and a wrong secret always answers `auth_failed`.
 *
 * DLY-1 builds registration on first write, `register` and `getProfile`,
 * and the helpers every other area authenticates with (`authenticate`,
 * `verifyCredential`, `confirmRegistered`) and dates with (`resolveZone`,
 * `playerToday`, the effective today of §8.7). IDN-1 owns the area from
 * Wave 3 (the full lifecycle and AC-IDN-05's limits), and IDN-2 adds sync
 * codes and claims. Rate limits and low trust are not modelled yet.
 */
import type { BrowserContextKind } from "@/analytics/dictionary";
import { localDateOf } from "@/engine/time";
import {
  TEST_PLAYER_PREFIX,
  parsePlayerId,
  parseSecret,
  parseTimeZone,
  type EpochMs,
  type LocalDate,
  type PlayerId,
  type Profile,
  type Result,
  type TimeZone,
} from "@/engine/types";

import { unavailableArea } from "../../areas";
import { fail, ok } from "../../errors";
import type { AppTag, BrowserContextInfo, IdentityApi } from "../../types";
import type { MockContext } from "../context";
import type { MockDb } from "../store";

/** The methods this area really implements; the mock contract run skips the rest (§7.5). */
export const MOCK_CAPABILITIES: readonly (keyof IdentityApi)[] = [
  "register",
  "getProfile",
];

/** One player (§8.3 `private.players`), as the mock keeps it. */
export interface MockPlayerRow {
  id: PlayerId;
  createdAt: EpochMs;
  /** Test identities (`e2e2e2e2-`, §8.17) play the e2e track. */
  isTest: boolean;
  track: "main" | "e2e";
  friendlyName: string;
  nickname: string | null;
  ageBand: "13_17" | "18_plus" | null;
  /** The stored zone (§8.7). */
  tz: TimeZone | null;
  /** The latest local date served: today never goes back (§8.7). */
  maxLocalDate: LocalDate | null;
  lastSeenAt: EpochMs | null;
  firstContext: BrowserContextKind | null;
  firstApp: AppTag | null;
}

/** One credential: a player id and a hash of one device's secret (§8.3, D8). */
export interface MockCredentialRow {
  playerId: PlayerId;
  secretHash: string;
  source: "mint" | "sync" | "claim";
  createdAt: EpochMs;
  lastUsedAt: EpochMs;
}

export interface IdentityTables {
  players: Record<string, MockPlayerRow>;
  credentials: Record<string, MockCredentialRow>;
}

/** The tables, created on first write. */
export function identityTables(db: MockDb): IdentityTables {
  db.players ??= {};
  db.credentials ??= {};
  return db as unknown as IdentityTables;
}

function readTables(db: Readonly<MockDb>): IdentityTables {
  return {
    players: (db.players ?? {}) as Record<string, MockPlayerRow>,
    credentials: (db.credentials ?? {}) as Record<string, MockCredentialRow>,
  };
}

/**
 * A short stand-in for SHA-256 (two FNV-1a passes, 64 bits as hex). The
 * mock is not a security boundary; the hash only keeps `inspect()` output
 * and the shared document free of secrets, as the real table is.
 */
export function hashSecret(secret: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < secret.length; i += 1) {
    const code = secret.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x0100019d);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${hex(a)}${hex(b)}`;
}

const credentialKey = (playerId: PlayerId, hash: string) =>
  `${playerId}:${hash}`;

/** Generated friendly names (§3.10.1); MOD-1 loads the reviewed lists. */
const ADJECTIVES = [
  "Plucky",
  "Brave",
  "Clever",
  "Quiet",
  "Swift",
  "Sunny",
  "Lucky",
  "Merry",
  "Nimble",
  "Bold",
  "Calm",
  "Witty",
] as const;
const ANIMALS = [
  "Otter",
  "Heron",
  "Badger",
  "Fox",
  "Wren",
  "Hare",
  "Newt",
  "Owl",
  "Lynx",
  "Puffin",
  "Robin",
  "Seal",
] as const;

function friendlyNameFor(ctx: MockContext, id: PlayerId): string {
  const rng = ctx.rng.fork(`player:${id}`);
  return `${rng.pick(ADJECTIVES)} ${rng.pick(ANIMALS)}`;
}

export function profileOf(player: MockPlayerRow): Profile {
  return {
    playerId: player.id,
    friendlyName: player.friendlyName,
    nickname: player.nickname,
    ageBand: player.ageBand,
    createdAt: player.createdAt,
  };
}

/** The device's credential, as the backend sends it with every call (§7.1). */
function deviceCredential(
  ctx: MockContext,
): { playerId: PlayerId; secret: string } | null {
  try {
    const identity = ctx.identity().current();
    const playerId = parsePlayerId(identity.playerId);
    const secret = parseSecret(identity.secret);
    return playerId === null || secret === null ? null : { playerId, secret };
  } catch {
    // No identity provider yet: the call carries no credential.
    return null;
  }
}

/**
 * The calling device's player when its credential is valid, for reads that
 * never register (`get_today` with optional auth, `get_profile`). Nothing is
 * touched.
 */
export function verifyCredential(
  ctx: MockContext,
  db: Readonly<MockDb>,
): MockPlayerRow | null {
  const credential = deviceCredential(ctx);
  if (credential === null) return null;
  const tables = readTables(db);
  const key = credentialKey(credential.playerId, hashSecret(credential.secret));
  if (tables.credentials[key] === undefined) return null;
  return tables.players[credential.playerId] ?? null;
}

export type AuthOutcome =
  | { ok: true; player: MockPlayerRow; registered: boolean }
  | { ok: false; result: Result<never> };

/**
 * `private.authenticate` (§8.5) for the calling device, inside a write.
 * A known credential returns its player (touching its last use); a known
 * player with another secret is `auth_failed`; an unknown player is
 * created on the spot when `register` is set, with a generated friendly
 * name and a `mint` credential.
 */
export function authenticate(
  ctx: MockContext,
  db: MockDb,
  options: { register: boolean; browser?: BrowserContextInfo },
): AuthOutcome {
  const refused: AuthOutcome = { ok: false, result: fail("auth_failed") };
  const credential = deviceCredential(ctx);
  if (credential === null) return refused;
  const tables = identityTables(db);
  const now = ctx.clock.now();
  const hash = hashSecret(credential.secret);
  const key = credentialKey(credential.playerId, hash);
  const existing = tables.players[credential.playerId];
  const row = tables.credentials[key];
  if (existing !== undefined && row !== undefined) {
    row.lastUsedAt = now;
    existing.lastSeenAt = now;
    return { ok: true, player: existing, registered: false };
  }
  if (existing !== undefined || !options.register) return refused;
  const isTest = credential.playerId.startsWith(TEST_PLAYER_PREFIX);
  const player: MockPlayerRow = {
    id: credential.playerId,
    createdAt: now,
    isTest,
    track: isTest ? "e2e" : "main",
    friendlyName: friendlyNameFor(ctx, credential.playerId),
    nickname: null,
    ageBand: null,
    tz: null,
    maxLocalDate: null,
    lastSeenAt: now,
    firstContext: options.browser?.context ?? null,
    firstApp: options.browser?.app ?? null,
  };
  tables.players[player.id] = player;
  tables.credentials[key] = {
    playerId: player.id,
    secretHash: hash,
    source: "mint",
    createdAt: now,
    lastUsedAt: now,
  };
  return { ok: true, player, registered: true };
}

/**
 * After a successful write: the identity is now known to the server, so the
 * provider records it (and IDN-1's provider posts the backup cookie, §9.1).
 */
export function confirmRegistered(ctx: MockContext): void {
  try {
    const identity = ctx.identity();
    if (!identity.current().registered) identity.markRegistered();
  } catch {
    // No provider: nothing to record.
  }
}

const UTC = parseTimeZone("UTC") as TimeZone;

/** The request's zone, else the player's stored zone, else UTC (§8.7). */
export function resolveZone(
  requested: string,
  player: MockPlayerRow | null,
): TimeZone {
  return parseTimeZone(requested) ?? player?.tz ?? UTC;
}

/**
 * The player's effective today (§8.7, D21): the later of the request zone's
 * local date and the latest date already served, so a westward zone switch
 * can never reopen yesterday. With `record`, a later date is stored and the
 * zone kept, as `private.player_today` does. Zone-hop flags and streak
 * credit (AC-STK-09) arrive with SQL-4 and STK-1.
 */
export function playerToday(
  player: MockPlayerRow | null,
  zone: TimeZone,
  now: EpochMs,
  options: { record: boolean } = { record: false },
): LocalDate {
  const local = localDateOf(now, zone);
  if (player === null) return local;
  const served = player.maxLocalDate;
  const today = served !== null && served > local ? served : local;
  if (options.record) {
    if (served === null || local > served) player.maxLocalDate = local;
    if (local >= (served ?? local)) player.tz = zone;
  }
  return today;
}

export function createIdentityArea(ctx: MockContext): IdentityApi {
  return {
    ...unavailableArea("identity"),
    async register(browser) {
      const result = await ctx.store.write(
        (db): Result<Profile> => {
          const auth = authenticate(ctx, db, { register: true, browser });
          return auth.ok ? ok(profileOf(auth.player)) : auth.result;
        },
        ["players", "credentials"],
      );
      if (result.ok) confirmRegistered(ctx);
      return result;
    },
    async getProfile() {
      const player = ctx.store.read((db) => verifyCredential(ctx, db));
      return player === null ? fail("auth_failed") : ok(profileOf(player));
    },
  };
}
