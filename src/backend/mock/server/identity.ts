/**
 * The mock identity area (ARCHITECTURE §7.4, §8.5, §8.6, §9.1), following
 * the SQL rules with engine code: the device mints its player id and
 * secret, nothing reaches the server until a write, and the first write
 * registers the identity (`start_daily` is "auth, registers"). The server
 * keeps only a hash of the secret, and a wrong secret always answers
 * `auth_failed`.
 *
 * Registration follows `private.authenticate` step 5 (§8.5) with the
 * limits of §8.6, for one browser, which the mock treats as one IP subject:
 *
 * - Refused past 20 new identities a minute (`identity_1m`, scope `ip`) or
 *   past 5,000 an hour project-wide (`identity_all_1h`, scope `project`),
 *   with `rate_limited` and the time left in the window that refused. A
 *   refusal creates no player and counts only on the counter that refused
 *   it. So 30 identities from one browser in 10 minutes all register
 *   (AC-IDN-05), and the client's registration copy can name the right
 *   scope (AC-IDN-04).
 * - Past 60 an hour (`identity_soft_1h`) a new identity still registers, as
 *   low trust. The mark lifts once it is 24 hours old or has finished 2
 *   Dailies. Test identities (`e2e2e2e2-`) count in their own bucket
 *   (`identity_test_1h`, 200 an hour) and are never low trust.
 * - The browser context and app sent with a registration must be in their
 *   enums (`invalid_input`), as `register_player` and `start_daily` check.
 *
 * DLY-1 built registration on first write, `register`, `getProfile` and the
 * helpers every other area authenticates with (`authenticate`,
 * `verifyCredential`, `confirmRegistered`) and dates with (`resolveZone`,
 * `playerToday`, the effective today of §8.7). IDN-1 owns the area from
 * Wave 3 and added the limits and low trust. Counter rows live in
 * `rateCounters`, one per bucket, subject and aligned window, which other
 * areas' limits can share through `hitLimit`.
 *
 * IDN-2 added sync codes and claim links (§8.4, §9.2, §9.5), following
 * `create_sync_code`, `redeem_sync_code`, `create_claim`, `peek_claim` and
 * `redeem_claim` of supabase/migrations/20261104000400_identity.sql:
 *
 * - A player has one sync code and one claim at a time, each stored as a
 *   hash: a new code ends the old one (AC-SYN-03), and a new claim ends
 *   the previous token, which then reads `not_found`.
 * - Redeeming adds a credential for the secret the device minted (`sync`
 *   or `claim`), so the other device keeps working; the same secret again
 *   only touches its row. A player keeps the 10 most recently used
 *   credentials (PRD §3.10.1).
 * - A claim lasts 10 minutes and redeems once. A used or expired claim is
 *   `expired` with `current: { used }` (`claim_link_used`); a token nobody
 *   holds is `not_found`.
 * - Limits (§8.6), one browser being one IP subject: 5 new codes per
 *   player a day; 5 failed redemptions per 15 minutes and 20 a day, both
 *   counted before the code is looked at and given back when it is right
 *   (AC-SYN-04); 5 claims per player an hour, a retried token counting
 *   once; 10 peeks and redemptions an hour together.
 * - Codes are typed (AC-SYN-02): a code that can't be one is
 *   `invalid_input` without costing an attempt, as the Supabase adapter
 *   never sends it.
 * - What a restore answers (`RestoredProfile`): the profile, the streak
 *   and the last Daily from `identityStreak` and `identityLastDaily`, the
 *   mock's bodies for the SQL hooks SQL-4 and SQL-6 fill. STK-1 replaces
 *   `identityStreak` with its streak area's evaluation.
 */
import type { BrowserContextKind, Platform } from "@/analytics/dictionary";
import { TUNABLES } from "@/config/tunables";
import { addDays, localDateOf } from "@/engine/time";
import {
  CROCKFORD_ALPHABET,
  TEST_PLAYER_PREFIX,
  parseClaimToken,
  parsePlayerId,
  parseSecret,
  parseSyncCode,
  parseTimeZone,
  type ClaimPreview,
  type ClaimToken,
  type DailyIdentity,
  type EpochMs,
  type LocalDate,
  type PlayerId,
  type Profile,
  type RestoredProfile,
  type Result,
  type Secret,
  type SyncCode,
  type TimeZone,
} from "@/engine/types";

import { unavailableArea } from "../../areas";
import { fail, ok } from "../../errors";
import type { AppTag, BrowserContextInfo, IdentityApi } from "../../types";
import type { MockContext } from "../context";
import type { MockDb } from "../store";
import type { MockAttemptRow } from "./sealed";

/**
 * The methods the shared contract suite runs against this area; it skips
 * the rest (§7.5). The sync-code and claim methods are built too, but the
 * suite's tests of them restore on "another device" from
 * `createContractEnv`, which gives every context its own memory store, so
 * against the mock that device meets an empty server. They join this list
 * once the harness lets one test's contexts share a mock server; until
 * then identity.transfer.test.ts runs the same cases on one shared store.
 */
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
  /**
   * Registered past the soft threshold (§8.5): its reports weigh 0 and its
   * first finished Daily stays out of the crowd's numbers. Absent on rows
   * written before IDN-1, which read as normal trust.
   */
  lowTrust?: boolean;
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

// ---------------------------------------------------------------------------
// Rate limits (§8.6): one counter row per bucket, subject and aligned window
// ---------------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A limit: at most `max` hits per aligned window of `windowMs`. */
export interface MockLimit {
  bucket: string;
  windowMs: number;
  max: number;
}

/**
 * The registration limits of §8.5 and §8.6, from the tunables SQL copies
 * into `private.config.limits`.
 */
export const IDENTITY_LIMITS = {
  /** Refused past this many new identities a minute from one IP subject. */
  burst: {
    bucket: "identity_1m",
    windowMs: MINUTE,
    max: TUNABLES.identity.burstPerIpPerMinute,
  },
  /** Refused past this many new identities an hour, project-wide. */
  ceiling: {
    bucket: "identity_all_1h",
    windowMs: HOUR,
    max: TUNABLES.identity.projectPerHour,
  },
  /** Past this many an hour from one IP subject, new identities are low trust. */
  soft: {
    bucket: "identity_soft_1h",
    windowMs: HOUR,
    max: TUNABLES.identity.normalTrustPerIpPerHour,
  },
  /** Test identities' own bucket (§8.6, §8.17). */
  test: { bucket: "identity_test_1h", windowMs: HOUR, max: 200 },
} as const satisfies Record<string, MockLimit>;

/** The mock serves one browser, so every call comes from one IP subject. */
export const MOCK_IP_SUBJECT = "ip:local";
/** The subject of project-wide ceilings, which need no IP at all. */
export const PROJECT_SUBJECT = "project";

/** One counter row (§8.3 `private.rate_counters`). */
export interface MockRateCounterRow {
  bucket: string;
  subject: string;
  windowStart: EpochMs;
  windowMs: number;
  /** Every hit in the window, refused ones included (the refusals are hits past the cap). */
  hits: number;
}

/** Where a window's row lives in `rateCounters`. */
export function rateCounterKey(
  bucket: string,
  subject: string,
  windowStart: EpochMs,
): string {
  return `${bucket}|${subject}|${windowStart}`;
}

/** The start of the aligned window that holds `now`. */
export function windowStartOf(now: EpochMs, windowMs: number): EpochMs {
  return Math.floor(now / windowMs) * windowMs;
}

function readCounters(
  db: Readonly<MockDb>,
): Readonly<Record<string, MockRateCounterRow>> {
  return (db.rateCounters ?? {}) as Record<string, MockRateCounterRow>;
}

/** The hits counted so far in the window that holds `now` (`private.peek_*`). */
export function peekLimit(
  db: Readonly<MockDb>,
  limit: MockLimit,
  subject: string,
  now: EpochMs,
): number {
  const key = rateCounterKey(
    limit.bucket,
    subject,
    windowStartOf(now, limit.windowMs),
  );
  return readCounters(db)[key]?.hits ?? 0;
}

export interface MockLimitResult {
  allowed: boolean;
  /** The time left in the window that refused, or would have. */
  retryAfterMs: number;
}

/**
 * `private.hit` (§8.6): counts one hit in the current window, refused ones
 * included, and says whether it fits under the cap. Rows of ended windows
 * are dropped as it goes.
 */
export function hitLimit(
  db: MockDb,
  limit: MockLimit,
  subject: string,
  now: EpochMs,
): MockLimitResult {
  db.rateCounters ??= {};
  const rows = db.rateCounters as Record<string, MockRateCounterRow>;
  for (const [key, row] of Object.entries(rows)) {
    if (row.windowStart + row.windowMs <= now) delete rows[key];
  }
  const windowStart = windowStartOf(now, limit.windowMs);
  const key = rateCounterKey(limit.bucket, subject, windowStart);
  const row = rows[key] ?? {
    bucket: limit.bucket,
    subject,
    windowStart,
    windowMs: limit.windowMs,
    hits: 0,
  };
  row.hits += 1;
  rows[key] = row;
  return {
    allowed: row.hits <= limit.max,
    retryAfterMs: windowStart + limit.windowMs - now,
  };
}

type Admission =
  { ok: true; lowTrust: boolean } | { ok: false; result: Result<never> };

function refused(hit: MockLimitResult, scope: "ip" | "project"): Admission {
  return {
    ok: false,
    result: fail("rate_limited", {
      retryAfterMs: hit.retryAfterMs,
      limitScope: scope,
    }),
  };
}

/**
 * Whether a new identity may register now (§8.5 step 5), and as low trust
 * or not. A refusal consumes nothing but the counter that refused it, so
 * the ceiling and the burst are read before either is counted.
 */
function admitRegistration(
  db: MockDb,
  now: EpochMs,
  isTest: boolean,
): Admission {
  const { burst, ceiling, soft, test } = IDENTITY_LIMITS;
  if (isTest) {
    const hit = hitLimit(db, test, MOCK_IP_SUBJECT, now);
    return hit.allowed ? { ok: true, lowTrust: false } : refused(hit, "ip");
  }
  if (peekLimit(db, ceiling, PROJECT_SUBJECT, now) >= ceiling.max) {
    // SQL also writes an owner alert here; the mock has no owner to tell.
    return refused(hitLimit(db, ceiling, PROJECT_SUBJECT, now), "project");
  }
  if (peekLimit(db, burst, MOCK_IP_SUBJECT, now) >= burst.max) {
    return refused(hitLimit(db, burst, MOCK_IP_SUBJECT, now), "ip");
  }
  hitLimit(db, ceiling, PROJECT_SUBJECT, now);
  hitLimit(db, burst, MOCK_IP_SUBJECT, now);
  return {
    ok: true,
    lowTrust: !hitLimit(db, soft, MOCK_IP_SUBJECT, now).allowed,
  };
}

/** Finished Dailies of a player, as `low_trust` lifting counts them (§8.5 step 3). */
function finishedDailies(db: Readonly<MockDb>, playerId: PlayerId): number {
  const attempts = (db.attempts ?? {}) as Record<string, MockAttemptRow>;
  let count = 0;
  for (const attempt of Object.values(attempts)) {
    if (
      attempt.playerId === playerId &&
      attempt.kind === "daily" &&
      attempt.status === "finished"
    ) {
      count += 1;
    }
  }
  return count;
}

/** Clears low trust once the identity is 24 hours old or has finished 2 Dailies (§8.5 step 3). */
function liftLowTrust(db: MockDb, player: MockPlayerRow, now: EpochMs): void {
  if (player.lowTrust !== true) return;
  if (
    now - player.createdAt >= TUNABLES.identity.lowTrustUntilAgeMs ||
    finishedDailies(db, player.id) >= TUNABLES.identity.lowTrustUntilFinishes
  ) {
    player.lowTrust = false;
  }
}

// ---------------------------------------------------------------------------
// Players and credentials
// ---------------------------------------------------------------------------

const CONTEXTS = [
  "browser",
  "installed",
  "in_app",
  "unknown",
] as const satisfies readonly BrowserContextKind[];
const APPS = [
  "whatsapp",
  "instagram",
  "facebook",
  "messenger",
  "tiktok",
  "snapchat",
  "linkedin",
  "telegram",
  "google",
  "other",
  "none",
] as const satisfies readonly AppTag[];
const PLATFORMS = [
  "ios",
  "android",
  "desktop",
  "other",
] as const satisfies readonly Platform[];

/** Fails to compile when an enum gains a value the lists above miss. */
type Covers<All, Listed> = [Exclude<All, Listed>] extends [never]
  ? true
  : never;
const ENUMS_COVERED: [
  Covers<BrowserContextKind, (typeof CONTEXTS)[number]>,
  Covers<AppTag, (typeof APPS)[number]>,
  Covers<Platform, (typeof PLATFORMS)[number]>,
] = [true, true, true];
void ENUMS_COVERED;

/** True when every field of the browser context is in its enum (`invalid_input` otherwise). */
export function isBrowserContextInfo(browser: BrowserContextInfo): boolean {
  return (
    (CONTEXTS as readonly string[]).includes(browser.context) &&
    (APPS as readonly string[]).includes(browser.app) &&
    (PLATFORMS as readonly string[]).includes(browser.platform)
  );
}

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
 * A known credential returns its player (touching its last use and lifting
 * low trust when it is due); a known player with another secret is
 * `auth_failed`; an unknown player is created on the spot when `register`
 * is set and the limits admit it, with a generated friendly name and a
 * `mint` credential.
 */
export function authenticate(
  ctx: MockContext,
  db: MockDb,
  options: { register: boolean; browser?: BrowserContextInfo },
): AuthOutcome {
  const refusedAuth: AuthOutcome = { ok: false, result: fail("auth_failed") };
  if (options.browser !== undefined && !isBrowserContextInfo(options.browser)) {
    return { ok: false, result: fail("invalid_input") };
  }
  const credential = deviceCredential(ctx);
  if (credential === null) return refusedAuth;
  const tables = identityTables(db);
  const now = ctx.clock.now();
  const hash = hashSecret(credential.secret);
  const key = credentialKey(credential.playerId, hash);
  const existing = tables.players[credential.playerId];
  const row = tables.credentials[key];
  if (existing !== undefined && row !== undefined) {
    row.lastUsedAt = now;
    existing.lastSeenAt = now;
    liftLowTrust(db, existing, now);
    return { ok: true, player: existing, registered: false };
  }
  if (existing !== undefined || !options.register) return refusedAuth;
  const isTest = credential.playerId.startsWith(TEST_PLAYER_PREFIX);
  const admission = admitRegistration(db, now, isTest);
  if (!admission.ok) return admission;
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
    lowTrust: admission.lowTrust,
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
 * provider records it and posts the backup cookie (§9.1 step 2).
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

// ---------------------------------------------------------------------------
// Sync codes and claim links (§8.4, §9.2, §9.5)
// ---------------------------------------------------------------------------

const DAY = 24 * HOUR;

/** How long a claim link works (PRD §3.10.4). */
export const CLAIM_TTL_MS = 10 * MINUTE;
/** The device credentials a player keeps; an 11th replaces the least recently used (PRD §3.10.1). */
export const MAX_CREDENTIALS = 10;
/** Characters in a sync code (§9.2). */
const SYNC_CODE_LENGTH = 16;

const { syncRedeem, claim: claimLimits } = TUNABLES.rateLimits;

/** The limits of §8.4 for codes and claims, in SQL's buckets. */
export const TRANSFER_LIMITS = {
  /** New sync codes per player a day (`sync_create_1d`). */
  syncCreate: { bucket: "sync_create_1d", windowMs: DAY, max: 5 },
  /** Failed redemptions per IP subject per 15 minutes (AC-SYN-04). */
  syncFail: {
    bucket: "sync_fail_15m",
    windowMs: 15 * MINUTE,
    max: syncRedeem.failuresPerIpPer15Min,
  },
  /** Failed redemptions per IP subject a day. */
  syncDay: { bucket: "sync_1d", windowMs: DAY, max: syncRedeem.failuresPerDay },
  /** Claims created per player an hour. */
  claimCreate: {
    bucket: "claim_player_1h",
    windowMs: HOUR,
    max: claimLimits.createdPerPlayerPerHour,
  },
  /** Peeks and redemptions per IP subject an hour, together. */
  claimIp: {
    bucket: "claim_ip_1h",
    windowMs: HOUR,
    max: claimLimits.redemptionsPerIpPerHour,
  },
} as const satisfies Record<string, MockLimit>;

/** One player's sync code (§8.3 `private.sync_codes`): only its hash. */
export interface MockSyncCodeRow {
  playerId: PlayerId;
  codeHash: string;
  createdAt: EpochMs;
}

/** One player's claim (§8.3 `private.claims`): a new one ends the previous token. */
export interface MockClaimRow {
  playerId: PlayerId;
  tokenHash: string;
  createdAt: EpochMs;
  expiresAt: EpochMs;
  redeemedAt: EpochMs | null;
}

export interface TransferTables {
  /** By player id. */
  syncCodes: Record<string, MockSyncCodeRow>;
  /** By player id. */
  claims: Record<string, MockClaimRow>;
  /** Draws for new codes, so codes repeat run to run for one seed (§7.4). */
  syncCodeDraws: { next: number };
}

/** The tables, created on first write. */
export function transferTables(db: MockDb): TransferTables {
  db.syncCodes ??= {};
  db.claims ??= {};
  db.syncCodeDraws ??= { next: 1 };
  return db as unknown as TransferTables;
}

function readTransferTables(
  db: Readonly<MockDb>,
): Pick<TransferTables, "syncCodes" | "claims"> {
  return {
    syncCodes: (db.syncCodes ?? {}) as Record<string, MockSyncCodeRow>,
    claims: (db.claims ?? {}) as Record<string, MockClaimRow>,
  };
}

/** The subject of a per-player limit. */
const playerSubject = (playerId: PlayerId) => `player:${playerId}`;

/**
 * `private.unhit_*` (§8.6): gives back one hit in the current window, for an
 * attempt that turned out to count for nothing (a right sync code).
 */
export function unhitLimit(
  db: MockDb,
  limit: MockLimit,
  subject: string,
  now: EpochMs,
): void {
  const rows = (db.rateCounters ?? {}) as Record<string, MockRateCounterRow>;
  const key = rateCounterKey(
    limit.bucket,
    subject,
    windowStartOf(now, limit.windowMs),
  );
  const row = rows[key];
  if (row !== undefined && row.hits > 0) row.hits -= 1;
}

function limited(hit: MockLimitResult, scope: "ip" | "player"): Result<never> {
  return fail("rate_limited", {
    retryAfterMs: hit.retryAfterMs,
    limitScope: scope,
  });
}

/**
 * `private.add_credential`: the same secret again only touches its row;
 * else a new credential, replacing the player's least recently used one
 * once it holds 10 (order: last use, creation, hash).
 */
export function addCredential(
  db: MockDb,
  playerId: PlayerId,
  secret: Secret,
  source: "sync" | "claim",
  now: EpochMs,
): void {
  const { credentials } = identityTables(db);
  const hash = hashSecret(secret);
  const key = credentialKey(playerId, hash);
  const existing = credentials[key];
  if (existing !== undefined) {
    existing.lastUsedAt = now;
    return;
  }
  const held = Object.entries(credentials)
    .filter(([, row]) => row.playerId === playerId)
    .sort(
      ([, a], [, b]) =>
        a.lastUsedAt - b.lastUsedAt ||
        a.createdAt - b.createdAt ||
        (a.secretHash < b.secretHash
          ? -1
          : a.secretHash > b.secretHash
            ? 1
            : 0),
    );
  if (held.length >= MAX_CREDENTIALS) {
    const [oldest] = held;
    if (oldest !== undefined) delete credentials[oldest[0]];
  }
  credentials[key] = {
    playerId,
    secretHash: hash,
    source,
    createdAt: now,
    lastUsedAt: now,
  };
}

/** The player's finished Dailies, newest finish first. */
function finishedDailiesOf(
  db: Readonly<MockDb>,
  playerId: PlayerId,
): MockAttemptRow[] {
  const attempts = (db.attempts ?? {}) as Record<string, MockAttemptRow>;
  return Object.values(attempts)
    .filter(
      (attempt) =>
        attempt.playerId === playerId &&
        attempt.status === "finished" &&
        attempt.dailyNumber !== null &&
        attempt.localDate !== null,
    )
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
}

/**
 * `private.identity_last_daily` (SQL-4's hook): the Daily the player
 * finished most recently, as the attempt names it, or null.
 */
export function identityLastDaily(
  db: Readonly<MockDb>,
  playerId: PlayerId,
): DailyIdentity | null {
  const [latest] = finishedDailiesOf(db, playerId);
  if (
    latest === undefined ||
    latest.dailyNumber === null ||
    latest.localDate === null
  ) {
    return null;
  }
  return { dailyNumber: latest.dailyNumber, date: latest.localDate };
}

/**
 * `private.identity_streak` (SQL-6's hook): the streak a restore or a claim
 * shows. Until STK-1 gives the mock its streak area, it counts the run of
 * consecutive dates with a finished ranked Daily: `current` while the run
 * reaches the player's today or yesterday, `best` the longest run. With
 * no freezes, repairs or protected dates in the mock yet, that is what
 * the full evaluation (§4.11) gives too.
 */
export function identityStreak(
  db: Readonly<MockDb>,
  player: MockPlayerRow,
  now: EpochMs,
): RestoredProfile["streak"] {
  const dates = new Set<LocalDate>();
  for (const attempt of finishedDailiesOf(db, player.id)) {
    if (
      attempt.kind === "daily" &&
      attempt.ranked &&
      attempt.localDate !== null
    ) {
      dates.add(attempt.localDate);
    }
  }
  const runFrom = (end: LocalDate) => {
    let count = 0;
    for (let date = end; dates.has(date); date = addDays(date, -1)) count += 1;
    return count;
  };
  let best = 0;
  for (const date of dates) {
    if (!dates.has(addDays(date, 1))) best = Math.max(best, runFrom(date));
  }
  const today = playerToday(player, player.tz ?? UTC, now);
  const current = dates.has(today)
    ? runFrom(today)
    : runFrom(addDays(today, -1));
  return { current, best };
}

/** What a sync-code or claim restore answers (`private.restored_json`). */
function restoredOf(
  db: Readonly<MockDb>,
  player: MockPlayerRow,
  now: EpochMs,
): RestoredProfile & { playerId: PlayerId } {
  return {
    playerId: player.id,
    profile: profileOf(player),
    streak: identityStreak(db, player, now),
    lastDaily: identityLastDaily(db, player.id),
  };
}

/** 16 Crockford characters from the seeded stream (`private.random_code`). */
function drawSyncCode(ctx: MockContext, draw: number): SyncCode {
  const rng = ctx.rng.fork(`sync-code:${draw}`);
  let code = "";
  for (let n = 0; n < SYNC_CODE_LENGTH; n += 1) {
    code += CROCKFORD_ALPHABET[rng.int(CROCKFORD_ALPHABET.length)];
  }
  const parsed = parseSyncCode(code);
  if (parsed === null) throw new Error("drew a malformed sync code");
  return parsed;
}

/** The claim a token names, by its hash. */
function claimByToken(
  claims: Record<string, MockClaimRow>,
  token: ClaimToken,
): MockClaimRow | null {
  const hash = hashSecret(token);
  return Object.values(claims).find((row) => row.tokenHash === hash) ?? null;
}

/** `expired` for a used or out-of-date claim, else null (peek_claim, redeem_claim). */
function claimRefusal(row: MockClaimRow, now: EpochMs): Result<never> | null {
  if (row.redeemedAt !== null)
    return fail("expired", { current: { used: true } });
  if (row.expiresAt <= now)
    return fail("expired", { current: { used: false } });
  return null;
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
        ["players", "credentials", "rateCounters"],
      );
      if (result.ok) confirmRegistered(ctx);
      return result;
    },
    async getProfile() {
      const player = ctx.store.read((db) => verifyCredential(ctx, db));
      return player === null ? fail("auth_failed") : ok(profileOf(player));
    },

    async createSyncCode() {
      const result = await ctx.store.write(
        (db): Result<{ code: SyncCode; createdAt: EpochMs }> => {
          const auth = authenticate(ctx, db, { register: false });
          if (!auth.ok) return auth.result;
          const now = ctx.clock.now();
          const hit = hitLimit(
            db,
            TRANSFER_LIMITS.syncCreate,
            playerSubject(auth.player.id),
            now,
          );
          if (!hit.allowed) return limited(hit, "player");
          const tables = transferTables(db);
          const taken = new Set(
            Object.values(tables.syncCodes).map((row) => row.codeHash),
          );
          const draw = (): SyncCode => {
            const code = drawSyncCode(ctx, tables.syncCodeDraws.next);
            tables.syncCodeDraws.next += 1;
            return code;
          };
          // A clash with a live code is drawn again, at most 5 times, as SQL does.
          let code = draw();
          for (
            let tries = 1;
            tries < 5 && taken.has(hashSecret(code));
            tries += 1
          ) {
            code = draw();
          }
          // One code per player: the previous one stops working (AC-SYN-03).
          tables.syncCodes[auth.player.id] = {
            playerId: auth.player.id,
            codeHash: hashSecret(code),
            createdAt: now,
          };
          return ok({ code, createdAt: now });
        },
        [
          "players",
          "credentials",
          "rateCounters",
          "syncCodes",
          "syncCodeDraws",
        ],
      );
      if (result.ok) confirmRegistered(ctx);
      return result;
    },

    redeemSyncCode(code: string, newSecret: Secret) {
      const normalized = parseSyncCode(code);
      // A code that can't be one costs no attempt: the adapter never sends it.
      if (normalized === null || parseSecret(newSecret) === null) {
        return Promise.resolve(fail("invalid_input"));
      }
      return ctx.store.write(
        (db): Result<RestoredProfile & { playerId: PlayerId }> => {
          const now = ctx.clock.now();
          const { syncFail, syncDay } = TRANSFER_LIMITS;
          // Counted before the code is looked at (AC-SYN-04).
          const failures = hitLimit(db, syncFail, MOCK_IP_SUBJECT, now);
          if (!failures.allowed) return limited(failures, "ip");
          const daily = hitLimit(db, syncDay, MOCK_IP_SUBJECT, now);
          if (!daily.allowed) {
            unhitLimit(db, syncFail, MOCK_IP_SUBJECT, now);
            return limited(daily, "ip");
          }
          const hash = hashSecret(normalized);
          const row = Object.values(transferTables(db).syncCodes).find(
            (entry) => entry.codeHash === hash,
          );
          const player =
            row === undefined
              ? undefined
              : identityTables(db).players[row.playerId];
          if (player === undefined) return fail("not_found");
          // A right code was no failure: both counts are given back.
          unhitLimit(db, syncFail, MOCK_IP_SUBJECT, now);
          unhitLimit(db, syncDay, MOCK_IP_SUBJECT, now);
          addCredential(db, player.id, newSecret, "sync", now);
          return ok(restoredOf(db, player, now));
        },
        ["credentials", "rateCounters"],
      );
    },

    async createClaim(token: ClaimToken) {
      const result = await ctx.store.write(
        (db): Result<{ expiresAt: EpochMs }> => {
          const auth = authenticate(ctx, db, { register: false });
          if (!auth.ok) return auth.result;
          if (parseClaimToken(token) === null) return fail("invalid_input");
          const tables = transferTables(db);
          const known = claimByToken(tables.claims, token);
          if (known !== null) {
            // The token is the call's key: a retry returns the same claim.
            return known.playerId === auth.player.id
              ? ok({ expiresAt: known.expiresAt })
              : fail("conflict");
          }
          const now = ctx.clock.now();
          const hit = hitLimit(
            db,
            TRANSFER_LIMITS.claimCreate,
            playerSubject(auth.player.id),
            now,
          );
          if (!hit.allowed) return limited(hit, "player");
          // One claim per player: a new one ends the previous token.
          const row: MockClaimRow = {
            playerId: auth.player.id,
            tokenHash: hashSecret(token),
            createdAt: now,
            expiresAt: now + CLAIM_TTL_MS,
            redeemedAt: null,
          };
          tables.claims[auth.player.id] = row;
          return ok({ expiresAt: row.expiresAt });
        },
        ["players", "credentials", "rateCounters", "claims"],
      );
      if (result.ok) confirmRegistered(ctx);
      return result;
    },

    peekClaim(token: ClaimToken) {
      return ctx.store.write(
        (db): Result<ClaimPreview> => {
          const now = ctx.clock.now();
          const hit = hitLimit(
            db,
            TRANSFER_LIMITS.claimIp,
            MOCK_IP_SUBJECT,
            now,
          );
          if (!hit.allowed) return limited(hit, "ip");
          if (parseClaimToken(token) === null) return fail("not_found");
          const row = claimByToken(readTransferTables(db).claims, token);
          const player =
            row === null ? undefined : identityTables(db).players[row.playerId];
          if (row === null || player === undefined) return fail("not_found");
          const refusal = claimRefusal(row, now);
          if (refusal !== null) return refusal;
          return ok({
            friendlyName: player.friendlyName,
            nickname: player.nickname,
            streak: identityStreak(db, player, now).current,
            lastDaily: identityLastDaily(db, player.id),
            expiresAt: row.expiresAt,
          });
        },
        ["rateCounters"],
      );
    },

    redeemClaim(token: ClaimToken, newSecret: Secret) {
      if (parseSecret(newSecret) === null) {
        return Promise.resolve(fail("invalid_input"));
      }
      return ctx.store.write(
        (db): Result<RestoredProfile & { playerId: PlayerId }> => {
          const now = ctx.clock.now();
          const hit = hitLimit(
            db,
            TRANSFER_LIMITS.claimIp,
            MOCK_IP_SUBJECT,
            now,
          );
          if (!hit.allowed) return limited(hit, "ip");
          if (parseClaimToken(token) === null) return fail("not_found");
          const row = claimByToken(transferTables(db).claims, token);
          const player =
            row === null ? undefined : identityTables(db).players[row.playerId];
          if (row === null || player === undefined) return fail("not_found");
          const refusal = claimRefusal(row, now);
          if (refusal !== null) return refusal;
          // Single use (AC-IAB-04): the store's lock makes this the only redemption.
          row.redeemedAt = now;
          addCredential(db, player.id, newSecret, "claim", now);
          return ok(restoredOf(db, player, now));
        },
        ["credentials", "rateCounters", "claims"],
      );
    },
  };
}
