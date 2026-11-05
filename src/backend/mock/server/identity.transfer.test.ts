/**
 * Sync codes and claim links in the mock identity area (ARCHITECTURE §8.4,
 * §9.2, §9.5), following SQL-2's RPCs: the identity contract's sync and
 * claim cases, run here on one mock server shared by two devices (the
 * contract harness gives each context its own store, see
 * MOCK_CAPABILITIES), plus the limits, the credential cap and what a
 * restore answers.
 */
import { describe, expect, it } from "vitest";

import { createFakeClock } from "@/engine/clock";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import {
  parseClaimToken,
  parseDailyNumber,
  parseLocalDate,
  type ClaimToken,
  type EpochMs,
  type LocalIdentity,
  type PlayerId,
  type Result,
  type Secret,
} from "@/engine/types";
import {
  base64url,
  createLocalIdentityProvider,
  mintIdentity,
} from "@/platform/identity/local";
import { createServerClock } from "@/platform/server-clock";
import { createKv, createMemoryStorage } from "@/platform/storage";

import type { BrowserContextInfo, GameBackend } from "../../types";
import { createMockBackend } from "../index";
import { createMemoryStore, type MockDb, type MockStore } from "../store";
import {
  CLAIM_TTL_MS,
  MAX_CREDENTIALS,
  TRANSFER_LIMITS,
  type MockCredentialRow,
} from "./identity";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** 09:00 UTC on Sunday 1 November 2026. */
const NOV_1 = Date.UTC(2026, 10, 1, 9) as EpochMs;
const BROWSER: BrowserContextInfo = {
  context: "browser",
  app: "none",
  platform: "desktop",
};

function value<T>(result: Result<T>, what: string): T {
  if (!result.ok) throw new Error(`${what}: ${result.error.code}`);
  return result.value;
}

function codeOf<T>(result: Result<T>): string {
  return result.ok ? "ok" : result.error.code;
}

/** A fresh secret, as a device mints one. */
function newSecret(): Secret {
  return mintIdentity(NOV_1).secret;
}

/** A fresh claim token: 32 random bytes, base64url (§2.4). */
function newToken(): ClaimToken {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = parseClaimToken(base64url(bytes));
  if (token === null) throw new Error("minted a malformed token");
  return token;
}

interface Device {
  backend: GameBackend;
  identity: ReturnType<typeof createLocalIdentityProvider>;
}

/** One mock server and its clock; devices share it, as browsers share Supabase. */
function setup(db: MockDb = {}) {
  const clock = createFakeClock(NOV_1);
  const store: MockStore = createMemoryStore(db);
  const device = (): Device => {
    const identity = createLocalIdentityProvider({
      kv: createKv({ storage: createMemoryStorage() }),
      now: () => clock.now(),
    });
    const backend = createMockBackend(
      {
        identity: () => identity,
        serverClock: createServerClock({ base: clock }),
      },
      {
        store,
        clock,
        init: { latencyMs: 0 },
        attachControls: false,
        plugins: createEchoRegistry(),
      },
    );
    return { backend, identity };
  };
  return {
    clock,
    store,
    device,
    credentialsOf(playerId: PlayerId): MockCredentialRow[] {
      const rows = (store.snapshot().credentials ?? {}) as Record<
        string,
        MockCredentialRow
      >;
      return Object.values(rows).filter((row) => row.playerId === playerId);
    },
  };
}

/** What a device stores after a restore (the caller's job, §9.2). */
function restored(playerId: PlayerId, secret: Secret): LocalIdentity {
  return {
    v: 1,
    playerId,
    secret,
    registered: true,
    createdAt: NOV_1,
    source: "sync",
    cookieSavedAt: null,
  };
}

async function registered(device: Device) {
  return value(await device.backend.identity.register(BROWSER), "register");
}

describe("sync codes (§9.2)", () => {
  it("AC-SYN-01 a code made on one device restores the same player on another, which then works as that player", async () => {
    const t = setup();
    const a = t.device();
    const profile = await registered(a);
    const { code, createdAt } = value(
      await a.backend.identity.createSyncCode(),
      "createSyncCode",
    );
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    expect(createdAt).toBe(NOV_1);

    const b = t.device();
    const secret = newSecret();
    const restore = value(
      await b.backend.identity.redeemSyncCode(code, secret),
      "redeem",
    );
    expect(restore).toEqual({
      playerId: profile.playerId,
      profile,
      streak: { current: 0, best: 0 },
      lastDaily: null,
    });
    b.identity.replace(restored(restore.playerId, secret));
    expect(value(await b.backend.identity.getProfile(), "b")).toEqual(profile);
    // The first device keeps working: a credential was added, none replaced.
    expect(value(await a.backend.identity.getProfile(), "a")).toEqual(profile);
    expect(
      t
        .credentialsOf(profile.playerId)
        .map((row) => row.source)
        .sort(),
    ).toEqual(["mint", "sync"]);
  });

  it("AC-SYN-02 lower case, no hyphens, spaces, I for 1 and O for 0 all redeem the same code", async () => {
    const t = setup();
    const a = t.device();
    const profile = await registered(a);
    const { code } = value(await a.backend.identity.createSyncCode(), "code");
    const grouped = code.match(/.{4}/g)?.join("-") ?? code;
    const variants = [
      code.toLowerCase(),
      grouped,
      grouped.toLowerCase().replaceAll("-", " "),
      `  ${code.replaceAll("1", "I").replaceAll("0", "O")} `,
      code.replaceAll("1", "l").toLowerCase(),
    ];
    for (const typed of variants) {
      const b = t.device();
      const restore = value(
        await b.backend.identity.redeemSyncCode(typed, newSecret()),
        typed,
      );
      expect(restore.playerId).toBe(profile.playerId);
    }
  });

  it("AC-SYN-03 a new code ends the old one", async () => {
    const t = setup();
    const a = t.device();
    const profile = await registered(a);
    const first = value(await a.backend.identity.createSyncCode(), "first");
    const second = value(await a.backend.identity.createSyncCode(), "second");
    expect(second.code).not.toBe(first.code);
    const b = t.device();
    expect(
      codeOf(await b.backend.identity.redeemSyncCode(first.code, newSecret())),
    ).toBe("not_found");
    const restore = value(
      await b.backend.identity.redeemSyncCode(second.code, newSecret()),
      "the new code",
    );
    expect(restore.playerId).toBe(profile.playerId);
  });

  it("AC-SYN-04 the sixth failure in 15 minutes is refused before the code is looked at, and a right code never counts", async () => {
    const t = setup();
    const a = t.device();
    await registered(a);
    const { code } = value(await a.backend.identity.createSyncCode(), "code");
    const b = t.device();
    // A right code in between gives its attempt back.
    value(await b.backend.identity.redeemSyncCode(code, newSecret()), "right");
    for (let n = 1; n <= TRANSFER_LIMITS.syncFail.max; n += 1) {
      expect(
        codeOf(
          await b.backend.identity.redeemSyncCode(
            "0000-0000-0000-0000",
            newSecret(),
          ),
        ),
        `failure ${n}`,
      ).toBe("not_found");
    }
    // Now even the right code is refused: the limit comes first.
    const refused = await b.backend.identity.redeemSyncCode(code, newSecret());
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toMatchObject({
      code: "rate_limited",
      limitScope: "ip",
    });
    expect(refused.error.retryAfterMs).toBeGreaterThan(0);
    expect(refused.error.retryAfterMs).toBeLessThanOrEqual(15 * MINUTE);
    // Once the window has passed, it works again.
    t.clock.set((NOV_1 + 15 * MINUTE) as EpochMs);
    expect(
      codeOf(await b.backend.identity.redeemSyncCode(code, newSecret())),
    ).toBe("ok");
  });

  it("a code that can't be one costs no attempt", async () => {
    const t = setup();
    const b = t.device();
    for (let n = 0; n < 10; n += 1) {
      expect(
        codeOf(
          await b.backend.identity.redeemSyncCode("not a code", newSecret()),
        ),
      ).toBe("invalid_input");
    }
    expect(
      codeOf(
        await b.backend.identity.redeemSyncCode(
          "0000-0000-0000-0000",
          newSecret(),
        ),
      ),
    ).toBe("not_found");
  });

  it("a code needs a registered player, and five a day at most", async () => {
    const t = setup();
    const a = t.device();
    expect(codeOf(await a.backend.identity.createSyncCode())).toBe(
      "auth_failed",
    );
    await registered(a);
    for (let n = 1; n <= TRANSFER_LIMITS.syncCreate.max; n += 1) {
      expect(
        codeOf(await a.backend.identity.createSyncCode()),
        `code ${n}`,
      ).toBe("ok");
    }
    const refused = await a.backend.identity.createSyncCode();
    expect(refused.ok ? null : refused.error).toMatchObject({
      code: "rate_limited",
      limitScope: "player",
    });
  });

  it("draws the same codes run to run for one seed", async () => {
    const draw = async () => {
      const t = setup();
      const a = t.device();
      await registered(a);
      return value(await a.backend.identity.createSyncCode(), "code").code;
    };
    expect(await draw()).toBe(await draw());
  });
});

describe("claim links (§9.5)", () => {
  it("AC-IAB-04 a claim redeems once in a second context for the same player id", async () => {
    const t = setup();
    const app = t.device();
    const profile = await registered(app);
    const token = newToken();
    const created = value(
      await app.backend.identity.createClaim(token),
      "claim",
    );
    expect(created.expiresAt).toBe(NOV_1 + CLAIM_TTL_MS);
    // A retry with the same token is the same claim, and counts once.
    expect(
      value(await app.backend.identity.createClaim(token), "retry"),
    ).toEqual(created);

    const browser = t.device();
    expect(
      value(await browser.backend.identity.peekClaim(token), "peek"),
    ).toEqual({
      friendlyName: profile.friendlyName,
      nickname: null,
      streak: 0,
      lastDaily: null,
      expiresAt: created.expiresAt,
    });
    const secret = newSecret();
    const restore = value(
      await browser.backend.identity.redeemClaim(token, secret),
      "redeem",
    );
    expect(restore.playerId).toBe(profile.playerId);
    browser.identity.replace({
      ...restored(restore.playerId, secret),
      source: "claim",
    });
    expect((await browser.backend.identity.getProfile()).ok).toBe(true);
    // The in-app copy keeps working.
    expect((await app.backend.identity.getProfile()).ok).toBe(true);

    const again = await t
      .device()
      .backend.identity.redeemClaim(token, newSecret());
    expect(again.ok ? null : again.error).toMatchObject({
      code: "expired",
      current: { used: true },
    });
    const peekUsed = await t.device().backend.identity.peekClaim(token);
    expect(peekUsed.ok ? null : peekUsed.error).toMatchObject({
      code: "expired",
      current: { used: true },
    });
  });

  it("AC-IAB-04 a redemption at 10 min 1 s fails as expired, not used", async () => {
    const t = setup();
    const app = t.device();
    await registered(app);
    const token = newToken();
    value(await app.backend.identity.createClaim(token), "claim");
    t.clock.set((NOV_1 + CLAIM_TTL_MS - 1000) as EpochMs);
    expect((await t.device().backend.identity.peekClaim(token)).ok).toBe(true);
    t.clock.set((NOV_1 + CLAIM_TTL_MS + 1000) as EpochMs);
    for (const result of [
      await t.device().backend.identity.peekClaim(token),
      await t.device().backend.identity.redeemClaim(token, newSecret()),
    ]) {
      expect(result.ok ? null : result.error).toMatchObject({
        code: "expired",
        current: { used: false },
      });
    }
  });

  it("a new claim ends the previous token, and a token nobody holds is not_found", async () => {
    const t = setup();
    const app = t.device();
    await registered(app);
    const first = newToken();
    const second = newToken();
    value(await app.backend.identity.createClaim(first), "first");
    value(await app.backend.identity.createClaim(second), "second");
    const browser = t.device();
    expect(codeOf(await browser.backend.identity.peekClaim(first))).toBe(
      "not_found",
    );
    expect(codeOf(await browser.backend.identity.peekClaim(newToken()))).toBe(
      "not_found",
    );
    expect((await browser.backend.identity.peekClaim(second)).ok).toBe(true);
  });

  it("another player's token is a conflict, and an unregistered device can't make one", async () => {
    const t = setup();
    const a = t.device();
    const b = t.device();
    const token = newToken();
    expect(codeOf(await a.backend.identity.createClaim(token))).toBe(
      "auth_failed",
    );
    await registered(a);
    await registered(b);
    value(await a.backend.identity.createClaim(token), "a");
    expect(codeOf(await b.backend.identity.createClaim(token))).toBe(
      "conflict",
    );
    expect(
      codeOf(
        await a.backend.identity.createClaim("short" as unknown as ClaimToken),
      ),
    ).toBe("invalid_input");
  });

  it("limits claims to 5 a player an hour, and peeks with redemptions to 10 an hour", async () => {
    const t = setup();
    const app = t.device();
    await registered(app);
    for (let n = 1; n <= TRANSFER_LIMITS.claimCreate.max; n += 1) {
      value(await app.backend.identity.createClaim(newToken()), `claim ${n}`);
    }
    const sixth = await app.backend.identity.createClaim(newToken());
    expect(sixth.ok ? null : sixth.error).toMatchObject({
      code: "rate_limited",
      limitScope: "player",
    });

    const browser = t.device();
    for (let n = 1; n <= TRANSFER_LIMITS.claimIp.max; n += 1) {
      expect(codeOf(await browser.backend.identity.peekClaim(newToken()))).toBe(
        "not_found",
      );
    }
    const refused = await browser.backend.identity.redeemClaim(
      newToken(),
      newSecret(),
    );
    expect(refused.ok ? null : refused.error).toMatchObject({
      code: "rate_limited",
      limitScope: "ip",
    });
    expect(
      refused.ok ? 0 : (refused.error.retryAfterMs ?? 0),
    ).toBeLessThanOrEqual(HOUR);
  });
});

describe("credentials and what a restore answers", () => {
  it("keeps the 10 most recently used credentials: an 11th device replaces the least recently used", async () => {
    const t = setup();
    const a = t.device();
    const profile = await registered(a);
    const { code } = value(await a.backend.identity.createSyncCode(), "code");
    const devices: Device[] = [];
    for (let n = 1; n < MAX_CREDENTIALS; n += 1) {
      t.clock.set((NOV_1 + n * MINUTE) as EpochMs);
      const device = t.device();
      const secret = newSecret();
      value(await device.backend.identity.redeemSyncCode(code, secret), `${n}`);
      device.identity.replace(restored(profile.playerId, secret));
      devices.push(device);
    }
    expect(t.credentialsOf(profile.playerId)).toHaveLength(MAX_CREDENTIALS);
    // The first device writes again, so its credential is no longer the
    // least recently used one, though it is still the oldest.
    t.clock.set((NOV_1 + 20 * MINUTE) as EpochMs);
    value(await a.backend.identity.register(BROWSER), "a writes");
    t.clock.set((NOV_1 + 21 * MINUTE) as EpochMs);
    value(
      await t.device().backend.identity.redeemSyncCode(code, newSecret()),
      "the 11th",
    );
    expect(t.credentialsOf(profile.playerId)).toHaveLength(MAX_CREDENTIALS);
    // The first restored device, unused since, lost its credential.
    const [first] = devices;
    if (first === undefined) throw new Error("no restored device");
    expect(codeOf(await first.backend.identity.getProfile())).toBe(
      "auth_failed",
    );
    expect((await a.backend.identity.getProfile()).ok).toBe(true);
    expect((await devices[1]?.backend.identity.getProfile())?.ok).toBe(true);
  });

  it("the same secret again only touches its row", async () => {
    const t = setup();
    const a = t.device();
    const profile = await registered(a);
    const { code } = value(await a.backend.identity.createSyncCode(), "code");
    const secret = newSecret();
    const b = t.device();
    value(await b.backend.identity.redeemSyncCode(code, secret), "once");
    value(await b.backend.identity.redeemSyncCode(code, secret), "twice");
    expect(t.credentialsOf(profile.playerId)).toHaveLength(2);
  });

  it("answers the streak and the last finished Daily with the profile", async () => {
    const t = setup();
    const a = t.device();
    const profile = await registered(a);
    // Finished Dailies on 28 October, then 30 October to 1 November (29
    // October missed), as the sealed area stores them.
    const finished = (
      id: string,
      date: string,
      number: number,
      at: number,
    ) => ({
      id,
      playerId: profile.playerId,
      kind: "daily",
      ranked: true,
      status: "finished",
      dailyNumber: parseDailyNumber(number),
      localDate: parseLocalDate(date),
      finishedAt: at,
    });
    await t.store.write((db) => {
      db.attempts = {
        x1: finished("x1", "2026-10-28", 40, NOV_1 - 4 * 24 * HOUR),
        x2: finished("x2", "2026-10-30", 42, NOV_1 - 2 * 24 * HOUR),
        x3: finished("x3", "2026-10-31", 43, NOV_1 - 24 * HOUR),
        x4: finished("x4", "2026-11-01", 44, NOV_1 - HOUR),
      };
    });
    const { code } = value(await a.backend.identity.createSyncCode(), "code");
    const restore = value(
      await t.device().backend.identity.redeemSyncCode(code, newSecret()),
      "redeem",
    );
    expect(restore.streak).toEqual({ current: 3, best: 3 });
    expect(restore.lastDaily).toEqual({
      dailyNumber: 44,
      date: "2026-11-01",
    });
    // The next day, before playing, the streak is still alive.
    t.clock.set((NOV_1 + 24 * HOUR) as EpochMs);
    const token = newToken();
    value(await a.backend.identity.createClaim(token), "claim");
    const preview = value(
      await t.device().backend.identity.peekClaim(token),
      "peek",
    );
    expect(preview.streak).toBe(3);
    expect(preview.lastDaily?.dailyNumber).toBe(44);
    // Two days later it is broken; the best stays.
    t.clock.set((NOV_1 + 2 * 24 * HOUR) as EpochMs);
    const late = value(
      await t.device().backend.identity.redeemSyncCode(code, newSecret()),
      "late",
    );
    expect(late.streak).toEqual({ current: 0, best: 3 });
  });
});
