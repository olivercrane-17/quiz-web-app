/**
 * Identifiers and primitives (ARCHITECTURE §3.1).
 *
 * Branded types are nominal. A value becomes a PlayerId, a LocalDate or a
 * ChallengeCode only through the total parse helpers below, which return
 * null for anything malformed and never throw. Nothing else may cast to a
 * branded type.
 *
 * Engine rules apply (§4.1): relative `.ts` imports, erasable syntax only,
 * no clock and no randomness. `Intl` is allowed.
 */
import { ANSWER_TYPES, CATEGORY_IDS } from "./content.ts";

declare const brand: unique symbol;
/** A nominal type. Values are created only by the parse helpers in ids.ts. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Milliseconds since the Unix epoch. */
export type EpochMs = number;
/** UUID v4, minted on the device. */
export type PlayerId = Brand<string, "PlayerId">;
/** 43-char base64url, 256 bits. */
export type Secret = Brand<string, "Secret">;
/** UUID v4. */
export type IdempotencyKey = Brand<string, "IdempotencyKey">;
/** 'YYYY-MM-DD' in a named zone. */
export type LocalDate = Brand<string, "LocalDate">;
/** IANA name. */
export type TimeZone = Brand<string, "TimeZone">;
/** 1 on DAILY_EPOCH. */
export type DailyNumber = Brand<number, "DailyNumber">;
/** 'p.geo.0142', 'm.film.0107', 'e.0113'. */
export type ItemId = Brand<string, "ItemId">;
/** Wikidata QID, e.g. 'Q90', or x.<type>.<slug> (§2.4). */
export type EntityId = Brand<string, "EntityId">;
/** UUID, issued by the server. */
export type AttemptId = Brand<string, "AttemptId">;
/** 8 Crockford base32. */
export type ChallengeCode = Brand<string, "ChallengeCode">;
/** UUID. */
export type GroupId = Brand<string, "GroupId">;
/** 10 Crockford base32. */
export type InviteCode = Brand<string, "InviteCode">;
/** UUID, 122 random bits. */
export type RoomId = Brand<string, "RoomId">;
/** 6 digits. */
export type RoomCode = Brand<string, "RoomCode">;
/** UUID. */
export type SeatId = Brand<string, "SeatId">;
/** 43-char base64url. */
export type SeatToken = Brand<string, "SeatToken">;
/** 43-char base64url. */
export type HostToken = Brand<string, "HostToken">;
/** UUID. */
export type QuizId = Brand<string, "QuizId">;
/** 10 Crockford base32. */
export type QuizShareCode = Brand<string, "QuizShareCode">;
/** 16 Crockford base32, no hyphens. */
export type SyncCode = Brand<string, "SyncCode">;
/** 43-char base64url, minted on the device. */
export type ClaimToken = Brand<string, "ClaimToken">;
/** [0-9a-z]{1,8}. */
export type ShareCode = Brand<string, "ShareCode">;
/** 'around-the-world'. */
export type PackId = Brand<string, "PackId">;
export type NoticeId = Brand<number, "NoticeId">;
/** 'A01' to 'A30'. */
export type AchievementId = Brand<string, "AchievementId">;

/** Test identities start with this prefix (§8.17). */
export const TEST_PLAYER_PREFIX = "e2e2e2e2-";

/** The Crockford base32 alphabet (§2.4): no I, L, O or U. */
export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Any RFC 9562 UUID (versions 1 to 8), for ids the server issues. */
const UUID_ANY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/**
 * 32 bytes in unpadded base64url: 43 characters, and the last one carries
 * only 4 bits, so its two low bits are zero. Requiring that keeps one
 * canonical spelling per token.
 */
const BASE64URL_32 = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const CROCKFORD_RUN = /^[0-9A-HJKMNP-TV-Z]+$/;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;
const KEBAB = "[a-z0-9]+(?:-[a-z0-9]+)*";
const CATEGORY_ALT = CATEGORY_IDS.join("|");
const ITEM_ID = new RegExp(
  `^(?:fx\\.)?(?:p\\.(?:${CATEGORY_ALT})\\.\\d{4}|m\\.(?:${CATEGORY_ALT})\\.\\d{4}|e\\.\\d{4}|r\\.${KEBAB}\\.\\d{2})$`,
);
/** The same pattern as the content schema's ENTITY_ID_PATTERN (§2.4). */
const ENTITY_ID = new RegExp(
  `^(?:fx\\.)?(?:Q[1-9][0-9]*|x\\.(?:${ANSWER_TYPES.join("|")})\\.${KEBAB})$`,
);
const PACK_ID = /^(?:fx-)?[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHARE_CODE = /^[0-9a-z]{1,8}$/;
const ACHIEVEMENT_ID = /^A(?:0[1-9]|[12][0-9]|30)$/;
const ROOM_CODE = /^\d{6}$/;
const DAILY_NUMBER_MAX = 99_999;

function asString(raw: unknown): string | null {
  return typeof raw === "string" ? raw : null;
}

function lowerUuid(raw: unknown, pattern: RegExp): string | null {
  const text = asString(raw)?.toLowerCase();
  return text !== undefined && pattern.test(text) ? text : null;
}

function token(raw: unknown): string | null {
  const text = asString(raw);
  return text !== null && BASE64URL_32.test(text) ? text : null;
}

/**
 * Normalizes typed Crockford base32 (§2.4, §9.2): upper case, spaces and
 * hyphens dropped (any whitespace, and the Unicode hyphens and dashes people
 * paste), I and L read as 1, O as 0. It does not validate: the parse
 * helpers check the alphabet and the length afterwards.
 */
export function normalizeCrockford(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s\-‐-―−]+/gu, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

function crockford(raw: unknown, length: number): string | null {
  const text = asString(raw);
  if (text === null) return null;
  const normalized = normalizeCrockford(text);
  return normalized.length === length && CROCKFORD_RUN.test(normalized)
    ? normalized
    : null;
}

export function parsePlayerId(raw: unknown): PlayerId | null {
  return lowerUuid(raw, UUID_V4) as PlayerId | null;
}

/** True for the reserved test identities of §8.17. */
export function isTestPlayerId(id: PlayerId): boolean {
  return id.startsWith(TEST_PLAYER_PREFIX);
}

export function parseSecret(raw: unknown): Secret | null {
  return token(raw) as Secret | null;
}

export function parseIdempotencyKey(raw: unknown): IdempotencyKey | null {
  return lowerUuid(raw, UUID_V4) as IdempotencyKey | null;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** A real calendar date written 'YYYY-MM-DD', years 0001 to 9999. */
export function parseLocalDate(raw: unknown): LocalDate | null {
  const text = asString(raw);
  const match = text === null ? null : LOCAL_DATE.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return text as LocalDate;
}

const knownZones = new Set<string>();

/**
 * An IANA zone name that this runtime's Intl accepts. The name is returned
 * as given: the server checks it against pg_timezone_names (§8.7).
 */
export function parseTimeZone(raw: unknown): TimeZone | null {
  const text = asString(raw);
  if (text === null || text.length > 64 || !ZONE_NAME.test(text)) return null;
  if (!knownZones.has(text)) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: text });
    } catch {
      return null;
    }
    knownZones.add(text);
  }
  return text as TimeZone;
}

export function parseDailyNumber(raw: unknown): DailyNumber | null {
  return typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= 1 &&
    raw <= DAILY_NUMBER_MAX
    ? (raw as DailyNumber)
    : null;
}

/** Practice, mystery, encore and room-pack ids, `fx.` fixtures included (§2.4). */
export function parseItemId(raw: unknown): ItemId | null {
  const text = asString(raw);
  return text !== null && ITEM_ID.test(text) ? (text as ItemId) : null;
}

export type ItemPool = "practice" | "mystery" | "encore" | "room";

/** Which pool an item id belongs to, read from its prefix. */
export function itemPoolOf(id: ItemId): ItemPool {
  const bare = id.startsWith("fx.") ? id.slice(3) : id;
  if (bare.startsWith("p.")) return "practice";
  if (bare.startsWith("m.")) return "mystery";
  if (bare.startsWith("e.")) return "encore";
  return "room";
}

/** True for fake fixture content (§5.6). */
export function isFixtureId(id: ItemId | EntityId): boolean {
  return id.startsWith("fx.");
}

export function parseEntityId(raw: unknown): EntityId | null {
  const text = asString(raw);
  return text !== null && ENTITY_ID.test(text) ? (text as EntityId) : null;
}

export function parseAttemptId(raw: unknown): AttemptId | null {
  return lowerUuid(raw, UUID_ANY) as AttemptId | null;
}

export function parseChallengeCode(raw: unknown): ChallengeCode | null {
  return crockford(raw, 8) as ChallengeCode | null;
}

export function parseGroupId(raw: unknown): GroupId | null {
  return lowerUuid(raw, UUID_ANY) as GroupId | null;
}

export function parseInviteCode(raw: unknown): InviteCode | null {
  return crockford(raw, 10) as InviteCode | null;
}

export function parseRoomId(raw: unknown): RoomId | null {
  return lowerUuid(raw, UUID_V4) as RoomId | null;
}

/** Six digits; spaces people type between the groups are ignored. */
export function parseRoomCode(raw: unknown): RoomCode | null {
  const text = asString(raw)?.replace(/\s+/gu, "");
  return text !== undefined && ROOM_CODE.test(text) ? (text as RoomCode) : null;
}

export function parseSeatId(raw: unknown): SeatId | null {
  return lowerUuid(raw, UUID_ANY) as SeatId | null;
}

export function parseSeatToken(raw: unknown): SeatToken | null {
  return token(raw) as SeatToken | null;
}

export function parseHostToken(raw: unknown): HostToken | null {
  return token(raw) as HostToken | null;
}

export function parseQuizId(raw: unknown): QuizId | null {
  return lowerUuid(raw, UUID_ANY) as QuizId | null;
}

export function parseQuizShareCode(raw: unknown): QuizShareCode | null {
  return crockford(raw, 10) as QuizShareCode | null;
}

/** 16 characters once normalized, however the player grouped them (§9.2). */
export function parseSyncCode(raw: unknown): SyncCode | null {
  return crockford(raw, 16) as SyncCode | null;
}

/** The display form of a sync code: four groups, `K7QX-2M9P-T4RW-8HNC` (§9.2). */
export function formatSyncCode(code: SyncCode): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

export function parseClaimToken(raw: unknown): ClaimToken | null {
  return token(raw) as ClaimToken | null;
}

export function parseShareCode(raw: unknown): ShareCode | null {
  const text = asString(raw);
  return text !== null && SHARE_CODE.test(text) ? (text as ShareCode) : null;
}

export function parsePackId(raw: unknown): PackId | null {
  const text = asString(raw);
  return text !== null && text.length <= 64 && PACK_ID.test(text)
    ? (text as PackId)
    : null;
}

export function parseNoticeId(raw: unknown): NoticeId | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 1
    ? (raw as NoticeId)
    : null;
}

export function parseAchievementId(raw: unknown): AchievementId | null {
  const text = asString(raw);
  return text !== null && ACHIEVEMENT_ID.test(text)
    ? (text as AchievementId)
    : null;
}
