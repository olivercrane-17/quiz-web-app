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
 * Wave 3 and added the limits and low trust; IDN-2 adds sync codes and
 * claims. Counter rows live in `rateCounters`, one per bucket, subject and
 * aligned window, which other areas' limits can share through `hitLimit`.
 */
import type { BrowserContextKind, Platform } from "@/analytics/dictionary";
import { TUNABLES } from "@/config/tunables";
import {
  MODERATION_ALLOWLIST_ROT13,
  MODERATION_TERMS_ROT13,
} from "@/content/generated/moderation";
import { NAME_ADJECTIVES, NAME_ANIMALS } from "@/content/generated/names";
import { charCount } from "@/engine/text/metrics";
import {
  cleanText,
  createModerationList,
  isBlocked,
  rot13,
  type ModerationList,
} from "@/engine/text/moderation";
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
import type {
  AppTag,
  BrowserContextInfo,
  IdentityApi,
  NicknameInput,
} from "../../types";
import type { MockContext } from "../context";
import type { MockDb } from "../store";
import type { MockAttemptRow } from "./sealed";

/** The methods this area really implements; the mock contract run skips the rest (§7.5). */
export const MOCK_CAPABILITIES: readonly (keyof IdentityApi)[] = [
  "register",
  "getProfile",
  "setNickname",
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

/**
 * Generated friendly names (§3.10.1) from the reviewed lists of
 * content/names/ (MOD-1), which `private.name_parts` holds too.
 */
function friendlyNameFor(ctx: MockContext, id: PlayerId): string {
  const rng = ctx.rng.fork(`player:${id}`);
  return `${rng.pick(NAME_ADJECTIVES)} ${rng.pick(NAME_ANIMALS)}`;
}

/** An adjective and an animal of the lists, one space between (`private.is_generated_name`). */
function isGeneratedName(name: string): boolean {
  const [adjective, animal, ...rest] = name.split(" ");
  return (
    rest.length === 0 &&
    adjective !== undefined &&
    animal !== undefined &&
    NAME_ADJECTIVES.includes(adjective) &&
    NAME_ANIMALS.includes(animal)
  );
}

/**
 * A nickname's text and kind, or null for anything that isn't a
 * `NicknameInput`, which `set_nickname` refuses as a null name or kind.
 */
function nicknameParts(
  nickname: NicknameInput | undefined,
): { name: string; generated: boolean } | null {
  if (typeof nickname !== "object" || nickname === null) return null;
  const generated = "generated" in nickname;
  const name: unknown = generated
    ? nickname.generated
    : (nickname as { custom?: unknown }).custom;
  return typeof name === "string" ? { name, generated } : null;
}

/** set_nickname's limit (§8.4): 20 a player a day, refusals included. */
export const NICKNAME_LIMIT = {
  bucket: "nickname_1d",
  windowMs: 24 * 60 * 60_000,
  max: 20,
} as const;

/** The longest display name (PRD §3.12.1), as `set_nickname` counts it once cleaned. */
const NICKNAME_MAX = 24;

let moderation: ModerationList | null = null;

/** The slur filter's list, decoded once from its ROT13 module. */
function moderationList(): ModerationList {
  moderation ??= createModerationList(
    MODERATION_TERMS_ROT13.map(rot13),
    MODERATION_ALLOWLIST_ROT13.map(rot13),
  );
  return moderation;
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
    /**
     * `set_nickname` (MOD-1): the credential, then 20 a day, then the name
     * cleaned to 1 to 24 characters. A generated name is the player's own
     * friendly name or a pair from the lists, at any band; a custom one
     * needs 18_plus and the slur filter's pass. The friendly name itself
     * clears the column.
     */
    async setNickname(nickname) {
      return ctx.store.write(
        (db): Result<Profile> => {
          const auth = authenticate(ctx, db, { register: false });
          if (!auth.ok) return auth.result;
          const { player } = auth;
          const hit = hitLimit(
            db,
            NICKNAME_LIMIT,
            `player:${player.id}`,
            ctx.clock.now(),
          );
          if (!hit.allowed) {
            return fail("rate_limited", {
              retryAfterMs: hit.retryAfterMs,
              limitScope: "player",
            });
          }
          const parts = nicknameParts(nickname);
          if (parts === null) return fail("invalid_input");
          const { generated } = parts;
          const name = cleanText(parts.name);
          const length = charCount(name);
          if (length < 1 || length > NICKNAME_MAX) return fail("invalid_input");
          if (generated) {
            if (name !== player.friendlyName && !isGeneratedName(name)) {
              return fail("invalid_input");
            }
          } else if (player.ageBand === null) {
            return fail("age_required");
          } else if (player.ageBand !== "18_plus") {
            return fail("age_forbidden");
          } else if (isBlocked(name, moderationList())) {
            return fail("blocked_text");
          }
          player.nickname =
            generated && name === player.friendlyName ? null : name;
          return ok(profileOf(player));
        },
        ["players", "credentials", "rateCounters"],
      );
    },
  };
}
