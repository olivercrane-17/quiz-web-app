// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  TEST_PLAYER_PREFIX,
  formatSyncCode,
  isFixtureId,
  isTestPlayerId,
  itemPoolOf,
  normalizeCrockford,
  parseAchievementId,
  parseAttemptId,
  parseChallengeCode,
  parseClaimToken,
  parseDailyNumber,
  parseEntityId,
  parseGroupId,
  parseHostToken,
  parseIdempotencyKey,
  parseInviteCode,
  parseItemId,
  parseLocalDate,
  parseNoticeId,
  parsePackId,
  parsePlayerId,
  parseQuizId,
  parseQuizShareCode,
  parseRoomCode,
  parseRoomId,
  parseSeatId,
  parseSeatToken,
  parseSecret,
  parseShareCode,
  parseSyncCode,
  parseTimeZone,
} from "./ids.ts";

const V4 = "3f2b8c1e-9d4a-4e6f-8b2c-1a2b3c4d5e6f";
const V7 = "01890a5d-ac96-774b-bcce-b302099a8057";
const TOKEN = "q3Jm8yZ0bW9ja19zZWNyZXRfdmFsdWVfMzJieXRlc00";

describe("UUID ids", () => {
  it("accepts v4 player ids and idempotency keys, lower-casing them", () => {
    expect(parsePlayerId(V4)).toBe(V4);
    expect(parsePlayerId(V4.toUpperCase())).toBe(V4);
    expect(parseIdempotencyKey(V4)).toBe(V4);
    expect(parseRoomId(V4)).toBe(V4);
  });

  it("refuses other versions where the device mints v4", () => {
    expect(parsePlayerId(V7)).toBeNull();
    expect(parseIdempotencyKey(V7)).toBeNull();
  });

  it("accepts any RFC 9562 version for ids the server issues", () => {
    for (const parse of [
      parseAttemptId,
      parseGroupId,
      parseSeatId,
      parseQuizId,
    ]) {
      expect(parse(V4)).toBe(V4);
      expect(parse(V7)).toBe(V7);
      expect(parse("not-a-uuid")).toBeNull();
      expect(parse(42)).toBeNull();
    }
  });

  it("recognises test identities", () => {
    const id = parsePlayerId(
      `${TEST_PLAYER_PREFIX}9d4a-4e6f-8b2c-1a2b3c4d5e6f`,
    );
    expect(id).not.toBeNull();
    expect(id !== null && isTestPlayerId(id)).toBe(true);
    const real = parsePlayerId(V4);
    expect(real !== null && isTestPlayerId(real)).toBe(false);
  });
});

describe("base64url tokens", () => {
  it("accepts 43-character canonical tokens", () => {
    for (const parse of [
      parseSecret,
      parseSeatToken,
      parseHostToken,
      parseClaimToken,
    ]) {
      expect(parse(TOKEN)).toBe(TOKEN);
    }
  });

  it("refuses wrong lengths, padding, non-url characters and non-canonical endings", () => {
    expect(parseSecret(TOKEN.slice(1))).toBeNull();
    expect(parseSecret(`${TOKEN}=`)).toBeNull();
    expect(parseSecret(`${TOKEN.slice(0, 42)}+`)).toBeNull();
    // The 43rd character carries 4 bits, so 'B' (000001) is not canonical.
    expect(parseSecret(`${TOKEN.slice(0, 42)}B`)).toBeNull();
    expect(parseSecret(null)).toBeNull();
  });
});

describe("normalizeCrockford", () => {
  it("upper-cases, drops spaces and hyphens, reads I and L as 1 and O as 0", () => {
    expect(normalizeCrockford("k7qx-2m9p t4rw-8hnc")).toBe("K7QX2M9PT4RW8HNC");
    expect(normalizeCrockford("ILo")).toBe("110");
    expect(normalizeCrockford(" ab–cd ")).toBe("ABCD");
  });

  it("does not validate the alphabet itself", () => {
    expect(normalizeCrockford("u")).toBe("U");
  });
});

describe("Crockford codes", () => {
  it("parses each code at its length", () => {
    expect(parseChallengeCode("ab12-cd34")).toBe("AB12CD34");
    expect(parseInviteCode("ab12cd34ef")).toBe("AB12CD34EF");
    expect(parseQuizShareCode("0123456789")).toBe("0123456789");
    expect(parseSyncCode("k7qx-2m9p-t4rw-8hnc")).toBe("K7QX2M9PT4RW8HNC");
  });

  it("refuses wrong lengths and letters outside the alphabet", () => {
    expect(parseChallengeCode("AB12CD3")).toBeNull();
    expect(parseChallengeCode("AB12CD345")).toBeNull();
    expect(parseChallengeCode("AB12CD3U")).toBeNull();
    expect(parseSyncCode(12345)).toBeNull();
  });

  it("formats a sync code as four groups", () => {
    const code = parseSyncCode("K7QX2M9PT4RW8HNC");
    expect(code).not.toBeNull();
    if (code !== null) expect(formatSyncCode(code)).toBe("K7QX-2M9P-T4RW-8HNC");
  });
});

describe("parseLocalDate", () => {
  it.each(["2026-11-01", "2028-02-29", "0001-01-01", "9999-12-31"])(
    "accepts %s",
    (text) => {
      expect(parseLocalDate(text)).toBe(text);
    },
  );
  it.each([
    "2026-02-29",
    "2100-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-04-31",
    "0000-01-01",
    "2026-1-01",
    "2026-11-01T00:00",
    "",
  ])("refuses %s", (text) => {
    expect(parseLocalDate(text)).toBeNull();
  });
});

describe("parseTimeZone", () => {
  it("accepts IANA names this runtime knows", () => {
    expect(parseTimeZone("Europe/London")).toBe("Europe/London");
    expect(parseTimeZone("UTC")).toBe("UTC");
    expect(parseTimeZone("Etc/GMT+12")).toBe("Etc/GMT+12");
    expect(parseTimeZone("America/Argentina/Buenos_Aires")).toBe(
      "America/Argentina/Buenos_Aires",
    );
  });

  it("refuses unknown names, offsets and junk", () => {
    expect(parseTimeZone("Mars/Olympus_Mons")).toBeNull();
    expect(parseTimeZone("+05:30")).toBeNull();
    expect(parseTimeZone("Europe/London; drop")).toBeNull();
    expect(parseTimeZone("")).toBeNull();
    expect(parseTimeZone(undefined)).toBeNull();
  });
});

describe("content ids", () => {
  it.each([
    ["p.geo.0142", "practice"],
    ["m.film.0107", "mystery"],
    ["e.0113", "encore"],
    ["r.around-the-world.12", "room"],
    ["fx.p.sci.0101", "practice"],
    ["fx.r.dly.03", "room"],
  ] as const)("%s is a %s id", (text, pool) => {
    const id = parseItemId(text);
    expect(id).toBe(text);
    if (id !== null) expect(itemPoolOf(id)).toBe(pool);
  });

  it.each([
    "p.xyz.0142",
    "p.geo.142",
    "m.geo.01420",
    "e.113",
    "r.Pack.12",
    "fx.fx.p.geo.0101",
  ])("refuses %s", (text) => {
    expect(parseItemId(text)).toBeNull();
  });

  it("parses entity ids: QIDs and x.<type>.<slug>, fixtures included", () => {
    expect(parseEntityId("Q90")).toBe("Q90");
    expect(parseEntityId("x.city.cordoba-ar")).toBe("x.city.cordoba-ar");
    expect(parseEntityId("fx.x.country.arvenna")).toBe("fx.x.country.arvenna");
    expect(parseEntityId("Q0")).toBeNull();
    expect(parseEntityId("x.planet.mars")).toBeNull();
    expect(parseEntityId("x.city.Cordoba")).toBeNull();
  });

  it("marks fixture ids", () => {
    const fixture = parseItemId("fx.m.geo.0101");
    const real = parseItemId("m.geo.0101");
    expect(fixture !== null && isFixtureId(fixture)).toBe(true);
    expect(real !== null && isFixtureId(real)).toBe(false);
  });
});

describe("other primitives", () => {
  it("parses Daily numbers as whole numbers from 1", () => {
    expect(parseDailyNumber(1)).toBe(1);
    expect(parseDailyNumber(42)).toBe(42);
    expect(parseDailyNumber(0)).toBeNull();
    expect(parseDailyNumber(1.5)).toBeNull();
    expect(parseDailyNumber("42")).toBeNull();
  });

  it("parses room codes as six digits, ignoring spaces", () => {
    expect(parseRoomCode("123 456")).toBe("123456");
    expect(parseRoomCode("012345")).toBe("012345");
    expect(parseRoomCode("12345")).toBeNull();
    expect(parseRoomCode("12345a")).toBeNull();
  });

  it("parses share codes, pack ids, notice ids and achievement ids", () => {
    expect(parseShareCode("a1b2c3d4")).toBe("a1b2c3d4");
    expect(parseShareCode("A1")).toBeNull();
    expect(parseShareCode("a1b2c3d4e")).toBeNull();
    expect(parsePackId("around-the-world")).toBe("around-the-world");
    expect(parsePackId("fx-party")).toBe("fx-party");
    expect(parsePackId("Around")).toBeNull();
    expect(parseNoticeId(7)).toBe(7);
    expect(parseNoticeId(0)).toBeNull();
    expect(parseAchievementId("A01")).toBe("A01");
    expect(parseAchievementId("A30")).toBe("A30");
    expect(parseAchievementId("A31")).toBeNull();
    expect(parseAchievementId("A00")).toBeNull();
  });
});
