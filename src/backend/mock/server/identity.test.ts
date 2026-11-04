/**
 * The mock identity area (ARCHITECTURE §8.5, §8.6): registration on first
 * write, the identity limits for one browser (one IP subject), low trust,
 * and the profile. AC-IDN-05 and the registration half of AC-IDN-04 run
 * here against the area, and in e2e/identity/cookie.spec.ts through the
 * screens.
 */
import { describe, expect, it } from "vitest";

import { createFakeClock, type FakeClock } from "@/engine/clock";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import {
  parsePlayerId,
  parseTimeZone,
  type EpochMs,
  type LocalIdentity,
  type TimeZone,
} from "@/engine/types";
import {
  createLocalIdentityProvider,
  mintIdentity,
} from "@/platform/identity/local";
import { createServerClock } from "@/platform/server-clock";
import { createKv, createMemoryStorage } from "@/platform/storage";

import type { BrowserContextInfo } from "../../types";
import { createMockContext } from "../context";
import { createMockBackend } from "../index";
import { createMemoryStore, type MockDb } from "../store";
import {
  IDENTITY_LIMITS,
  MOCK_IP_SUBJECT,
  PROJECT_SUBJECT,
  authenticate,
  hitLimit,
  peekLimit,
  rateCounterKey,
  windowStartOf,
  type MockPlayerRow,
} from "./identity";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** 09:00:00 UTC on Sunday 1 November 2026, the top of a minute and an hour. */
const NOV_1 = Date.UTC(2026, 10, 1, 9) as EpochMs;
const LONDON = parseTimeZone("Europe/London") as TimeZone;
const BROWSER: BrowserContextInfo = {
  context: "browser",
  app: "none",
  platform: "desktop",
};
const START = { tz: LONDON, browser: BROWSER, appVersion: "test" } as const;

/** A new device's identity: a fresh player id and secret. */
function newDevice(at: EpochMs, prefix?: string): LocalIdentity {
  const minted = mintIdentity(at);
  if (prefix === undefined) return minted;
  const id = parsePlayerId(`${prefix}${minted.playerId.slice(prefix.length)}`);
  return { ...minted, playerId: id ?? minted.playerId };
}

/** One mock server, and a "browser" whose device can be swapped for a fresh one. */
function setup(options: { at?: EpochMs; db?: MockDb } = {}) {
  const clock = createFakeClock(options.at ?? NOV_1);
  const store = createMemoryStore(options.db ?? {});
  const identity = createLocalIdentityProvider({
    kv: createKv({ storage: createMemoryStorage() }),
    now: () => clock.now(),
  });
  const deps = {
    identity: () => identity,
    serverClock: createServerClock({ base: clock }),
  };
  const mock = createMockBackend(deps, {
    store,
    clock,
    init: { latencyMs: 0 },
    attachControls: false,
    plugins: createEchoRegistry(),
  });
  return {
    mock,
    clock,
    store,
    identity,
    /** The next registration comes from a device that has never registered. */
    freshDevice(prefix?: string) {
      identity.replace(newDevice(clock.now(), prefix));
      return identity.current();
    },
    players(): MockPlayerRow[] {
      return Object.values(
        (store.snapshot().players ?? {}) as Record<string, MockPlayerRow>,
      );
    },
  };
}

/** Starts today's Daily from the current device: one tap on Play. */
async function play(t: ReturnType<typeof setup>) {
  return t.mock.sealed.start({ kind: "today" }, START);
}

describe("registration limits (§8.5, §8.6)", () => {
  it("AC-IDN-05 registers 30 fresh identities from one IP within 10 minutes, each reaching clue 1 at normal trust", async () => {
    const t = setup();
    for (let n = 0; n < 30; n += 1) {
      t.clock.set((NOV_1 + n * 20_000) as EpochMs);
      t.freshDevice();
      const started = await play(t);
      expect(started.ok, `identity ${n + 1}`).toBe(true);
      if (!started.ok) return;
      // Round 0 comes back open: clue 1 with no second call.
      expect(started.value.current?.index).toBe(0);
      expect(started.value.current?.open).not.toBeNull();
      expect(t.identity.current().registered).toBe(true);
    }
    expect(t.clock.now() - NOV_1).toBeLessThan(10 * MINUTE);
    const players = t.players();
    expect(players).toHaveLength(30);
    expect(players.every((player) => player.lowTrust === false)).toBe(true);
  });

  it("AC-IDN-04 refuses a 21st new identity inside one minute with the rest of the minute and scope ip, then lets the retry in", async () => {
    const t = setup({ at: (NOV_1 + 10_000) as EpochMs });
    for (let n = 0; n < 20; n += 1) {
      t.freshDevice();
      expect((await play(t)).ok).toBe(true);
    }
    t.freshDevice();
    t.clock.advance(5_000);
    const refused = await play(t);
    expect(refused).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "rate_limited",
        retryAfterMs: 45_000,
        limitScope: "ip",
      }),
    });
    // The refusal created nothing and left the device unregistered.
    expect(t.players()).toHaveLength(20);
    expect(t.identity.current().registered).toBe(false);
    // The ceiling and the soft bucket never counted it.
    const db = t.store.snapshot();
    expect(
      peekLimit(db, IDENTITY_LIMITS.ceiling, PROJECT_SUBJECT, t.clock.now()),
    ).toBe(20);
    expect(
      peekLimit(db, IDENTITY_LIMITS.soft, MOCK_IP_SUBJECT, t.clock.now()),
    ).toBe(20);
    expect(
      peekLimit(db, IDENTITY_LIMITS.burst, MOCK_IP_SUBJECT, t.clock.now()),
    ).toBe(21);

    // The retry after Retry-After lands in a new minute and registers.
    t.clock.advance(45_000);
    const retried = await play(t);
    expect(retried.ok).toBe(true);
    expect(t.players()).toHaveLength(21);
  });

  it("AC-IDN-04 refuses with scope project once the project-wide ceiling is reached this hour", async () => {
    const at = (NOV_1 + 59 * MINUTE + 40_000) as EpochMs;
    const hour = windowStartOf(at, HOUR);
    const t = setup({
      at,
      db: {
        rateCounters: {
          [rateCounterKey("identity_all_1h", PROJECT_SUBJECT, hour)]: {
            bucket: "identity_all_1h",
            subject: PROJECT_SUBJECT,
            windowStart: hour,
            windowMs: HOUR,
            hits: 5000,
          },
        },
      },
    });
    t.freshDevice();
    const refused = await play(t);
    expect(refused).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "rate_limited",
        retryAfterMs: 20_000,
        limitScope: "project",
      }),
    });
    expect(t.players()).toHaveLength(0);
    // The burst never counted a refused registration.
    expect(
      peekLimit(t.store.snapshot(), IDENTITY_LIMITS.burst, MOCK_IP_SUBJECT, at),
    ).toBe(0);

    t.clock.advance(20_000);
    expect((await play(t)).ok).toBe(true);
    expect(t.players()).toHaveLength(1);
  });

  it("registers past 60 an hour as low trust, and nothing on the profile differs (AC-IDN-06, mock half)", async () => {
    const t = setup();
    for (let n = 0; n < 61; n += 1) {
      t.clock.set((NOV_1 + n * 20_000) as EpochMs);
      t.freshDevice();
      expect((await play(t)).ok, `identity ${n + 1}`).toBe(true);
    }
    const players = t.players();
    expect(players.filter((player) => player.lowTrust === true)).toHaveLength(
      1,
    );
    const last = players.find(
      (player) => player.id === t.identity.current().playerId,
    );
    expect(last?.lowTrust).toBe(true);
    const profile = await t.mock.identity.getProfile();
    expect(profile.ok).toBe(true);
    if (profile.ok) {
      expect(Object.keys(profile.value).sort()).toEqual([
        "ageBand",
        "createdAt",
        "friendlyName",
        "nickname",
        "playerId",
      ]);
    }
  });

  it("gives test identities their own bucket, never low trust", async () => {
    const t = setup();
    for (let n = 0; n < 25; n += 1) {
      t.freshDevice("e2e2e2e2-");
      expect((await play(t)).ok, `test identity ${n + 1}`).toBe(true);
    }
    const players = t.players();
    expect(players).toHaveLength(25);
    expect(players.every((player) => player.isTest && !player.lowTrust)).toBe(
      true,
    );
    // They don't use up the burst real players meet.
    t.freshDevice();
    expect((await play(t)).ok).toBe(true);
  });

  it("drops counter rows once their window has ended", () => {
    const db: MockDb = {};
    hitLimit(db, IDENTITY_LIMITS.burst, MOCK_IP_SUBJECT, NOV_1);
    hitLimit(db, IDENTITY_LIMITS.soft, MOCK_IP_SUBJECT, NOV_1);
    expect(Object.keys(db.rateCounters as object)).toHaveLength(2);
    hitLimit(
      db,
      IDENTITY_LIMITS.burst,
      MOCK_IP_SUBJECT,
      (NOV_1 + MINUTE) as EpochMs,
    );
    expect(Object.keys(db.rateCounters as object).sort()).toEqual(
      [
        rateCounterKey(
          "identity_1m",
          MOCK_IP_SUBJECT,
          (NOV_1 + MINUTE) as EpochMs,
        ),
        rateCounterKey("identity_soft_1h", MOCK_IP_SUBJECT, NOV_1),
      ].sort(),
    );
  });

  it("keys counter rows as bucket|subject|windowStart, the shape E2E seeds", () => {
    expect(rateCounterKey("identity_1m", MOCK_IP_SUBJECT, NOV_1)).toBe(
      `identity_1m|ip:local|${NOV_1}`,
    );
    expect(IDENTITY_LIMITS).toMatchObject({
      burst: { bucket: "identity_1m", windowMs: MINUTE, max: 20 },
      ceiling: { bucket: "identity_all_1h", windowMs: HOUR, max: 5000 },
      soft: { bucket: "identity_soft_1h", windowMs: HOUR, max: 60 },
      test: { bucket: "identity_test_1h", windowMs: HOUR, max: 200 },
    });
  });
});

describe("low trust lifts (§8.5 step 3)", () => {
  function lowTrustContext(extra: MockDb = {}) {
    const clock: FakeClock = createFakeClock(NOV_1);
    const device = mintIdentity(NOV_1);
    const provider = createLocalIdentityProvider({
      kv: createKv({ storage: createMemoryStorage() }),
      initial: { identity: device, stored: true },
    });
    const store = createMemoryStore(extra);
    const ctx = createMockContext({
      store,
      clock,
      identity: () => provider,
      plugins: createEchoRegistry(),
    });
    return { ctx, clock, store, device };
  }

  async function register(
    t: ReturnType<typeof lowTrustContext>,
  ): Promise<void> {
    await t.store.write((db) => {
      const auth = authenticate(t.ctx, db, {
        register: true,
        browser: BROWSER,
      });
      if (!auth.ok) throw new Error("could not register");
      auth.player.lowTrust = true;
    });
  }

  async function lowTrustNow(t: ReturnType<typeof lowTrustContext>) {
    return t.store.write((db) => {
      const auth = authenticate(t.ctx, db, { register: false });
      return auth.ok ? auth.player.lowTrust : null;
    });
  }

  it("once the identity is 24 hours old", async () => {
    const t = lowTrustContext();
    await register(t);
    t.clock.advance(DAY - 1);
    await expect(lowTrustNow(t)).resolves.toBe(true);
    t.clock.advance(1);
    await expect(lowTrustNow(t)).resolves.toBe(false);
  });

  it("once it has finished 2 Dailies", async () => {
    const t = lowTrustContext();
    await register(t);
    const finished = (id: string) => ({
      id,
      playerId: t.device.playerId,
      kind: "daily",
      status: "finished",
    });
    await t.store.write((db) => {
      db.attempts = { a: finished("a") };
    });
    await expect(lowTrustNow(t)).resolves.toBe(true);
    await t.store.write((db) => {
      db.attempts = { a: finished("a"), b: finished("b") };
    });
    await expect(lowTrustNow(t)).resolves.toBe(false);
  });
});

describe("register and the profile", () => {
  it("registers with a write that asks for nothing else, and confirms it on the device", async () => {
    const t = setup();
    expect((await t.mock.identity.getProfile()).ok).toBe(false);
    const registered = await t.mock.identity.register(BROWSER);
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    expect(registered.value).toMatchObject({
      playerId: t.identity.current().playerId,
      nickname: null,
      ageBand: null,
      createdAt: NOV_1,
    });
    expect(registered.value.friendlyName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(t.identity.current().registered).toBe(true);
    await expect(t.mock.identity.getProfile()).resolves.toEqual(registered);
    // Registering again is idempotent: the same player, no second row.
    await expect(t.mock.identity.register(BROWSER)).resolves.toEqual(
      registered,
    );
    expect(t.players()).toHaveLength(1);
    const player = t.players()[0];
    expect(player).toMatchObject({ firstContext: "browser", firstApp: "none" });
  });

  it("answers invalid_input for a context or app outside their enums, and registers nothing", async () => {
    const t = setup();
    for (const browser of [
      { ...BROWSER, context: "kiosk" },
      { ...BROWSER, app: "myspace" },
      { ...BROWSER, platform: "toaster" },
    ] as unknown as BrowserContextInfo[]) {
      const result = await t.mock.identity.register(browser);
      expect(result.ok ? null : result.error.code).toBe("invalid_input");
    }
    expect(t.players()).toHaveLength(0);
    expect(t.identity.current().registered).toBe(false);
  });

  it("answers auth_failed to a known player with another secret, and creates nothing", async () => {
    const t = setup();
    await t.mock.identity.register(BROWSER);
    const real = t.identity.current();
    t.identity.replace({ ...mintIdentity(NOV_1), playerId: real.playerId });
    const result = await t.mock.identity.register(BROWSER);
    expect(result.ok ? null : result.error.code).toBe("auth_failed");
    expect(Object.keys(t.store.snapshot().credentials as object)).toHaveLength(
      1,
    );
  });

  it("keeps secrets out of the database", async () => {
    const t = setup();
    await t.mock.identity.register(BROWSER);
    expect(JSON.stringify(t.store.snapshot())).not.toContain(
      t.identity.current().secret,
    );
  });
});
