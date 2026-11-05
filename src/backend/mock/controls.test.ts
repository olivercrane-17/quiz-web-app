/**
 * Mock controls: scenarios played through the sealed area (with the echo
 * test plugins here; the app plays them on the real ones), seeded once per
 * database, and the transport switches.
 */
import { describe, expect, it } from "vitest";

import { createFakeClock } from "@/engine/clock";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import { parseTimeZone, type TimeZone } from "@/engine/types";
import type { IdentityProvider } from "@/platform/identity/provider";
import { createLocalIdentityProvider } from "@/platform/identity/local";
import { createServerClock } from "@/platform/server-clock";
import { createKv, createMemoryStorage } from "@/platform/storage";

import { createMockBackend, type MockInit } from "./index";
import { createMemoryStore, type MockStore } from "./store";

const NOV_1 = Date.UTC(2026, 10, 1, 9);
const UTC = parseTimeZone("UTC") as TimeZone;

function setup(
  options: {
    store?: MockStore;
    init?: MockInit;
    identity?: IdentityProvider;
  } = {},
) {
  const clock = createFakeClock(NOV_1);
  const identity =
    options.identity ??
    createLocalIdentityProvider({
      kv: createKv({ storage: createMemoryStorage() }),
      now: () => NOV_1,
    });
  const mock = createMockBackend(
    {
      identity: () => identity,
      serverClock: createServerClock({ base: clock }),
    },
    {
      store: options.store ?? createMemoryStore(),
      clock,
      init: { latencyMs: 0, ...options.init },
      attachControls: false,
      plugins: createEchoRegistry(),
    },
  );
  return { mock, identity };
}

describe("seed", () => {
  it("finished_today leaves today's Daily finished by this device, 9/12 with the Encore near", async () => {
    const { mock, identity } = setup();
    await mock.controls.seed("finished_today");
    expect(identity.current().registered).toBe(true);
    const card = await mock.daily.today(UTC);
    expect(card).toMatchObject({
      ok: true,
      value: {
        status: "finished",
        finished: {
          points: 9,
          maxPoints: 12,
          rows: [
            ["solved", "unused", "unused", "unused"],
            ["passed", "solved", "unused", "unused"],
            ["passed", "passed", "solved", "unused"],
          ],
        },
      },
    });
    const attemptId = card.ok ? card.value.attemptId : null;
    const snapshot = await mock.sealed.get(attemptId as never);
    // Mystery 2 fell on clue 2 to a wrong guess, Mystery 3 to Next clue.
    const reveals = snapshot.ok
      ? snapshot.value.resolved.map((r) => r.outcome)
      : [];
    expect(
      reveals.map((o) => (o.family === "mystery" ? o.solvedOn : o.family)),
    ).toEqual([1, 2, 3, "encore"]);
  });

  it("in_progress_mystery_2 leaves Mystery 2 open on clue 2 with one wrong guess", async () => {
    const { mock } = setup();
    await mock.controls.seed("in_progress_mystery_2");
    const start = await mock.sealed.start(
      { kind: "today" },
      {
        tz: UTC,
        browser: { context: "browser", app: "none", platform: "desktop" },
        appVersion: "test",
      },
    );
    expect(start).toMatchObject({
      ok: true,
      value: {
        status: "active",
        points: 3,
        current: {
          index: 1,
          open: {
            family: "mystery",
            clue: 2,
            wrongGuesses: [{ clue: 1, entityId: "fx.x.country.ostravia" }],
          },
        },
      },
    });
    expect(
      start.ok && start.value.resolved.map((r) => r.outcome),
    ).toMatchObject([{ family: "mystery", solvedOn: 2, points: 3 }]);
  });

  it("seeds an init scenario once per database, so a reload keeps what play changed", async () => {
    const store = createMemoryStore();
    const identity = createLocalIdentityProvider({
      kv: createKv({ storage: createMemoryStorage() }),
      now: () => NOV_1,
    });
    const first = setup({
      store,
      identity,
      init: { scenario: "in_progress_mystery_2" },
    });
    await first.mock.ready;
    const before =
      first.mock.controls.inspect<Record<string, unknown>>("attempts");
    const attemptId = Object.keys(before)[0] ?? "";
    expect(
      await first.mock.sealed.act({
        attemptId: attemptId as never,
        index: 1,
        step: 2,
        intent: { family: "mystery", kind: "next_clue" },
        clientActiveMs: 0,
        hiddenMs: 0,
        key: "00000000-0000-4000-8000-0000000000aa" as never,
      }),
    ).toMatchObject({ ok: true });

    // The page reloads: the same init, the same database.
    const second = setup({
      store,
      identity,
      init: { scenario: "in_progress_mystery_2" },
    });
    await second.mock.ready;
    expect(
      Object.keys(second.mock.controls.inspect("attempts") as object),
    ).toEqual([attemptId]);
    expect(
      second.mock.controls.inspect(`attempts.${attemptId}.rounds.1.open.clue`),
    ).toBe(3);
  });

  it("keeps a later seed() across a reload that still carries the init scenario", async () => {
    const store = createMemoryStore();
    const identity = createLocalIdentityProvider({
      kv: createKv({ storage: createMemoryStorage() }),
      now: () => NOV_1,
    });
    const init: MockInit = { scenario: "in_progress_mystery_2" };
    const first = setup({ store, identity, init });
    await first.mock.ready;
    await first.mock.controls.seed("finished_today");

    // The spec reloads; its init script sets the same scenario again.
    const second = setup({ store, identity, init });
    expect(await second.mock.daily.today(UTC)).toMatchObject({
      ok: true,
      value: { status: "finished", finished: { points: 9, maxPoints: 12 } },
    });
  });

  it("leaves a database that has been played alone, scenario or not", async () => {
    const store = createMemoryStore();
    const identity = createLocalIdentityProvider({
      kv: createKv({ storage: createMemoryStorage() }),
      now: () => NOV_1,
    });
    const first = setup({ store, identity });
    expect(
      await first.mock.sealed.start(
        { kind: "today" },
        {
          tz: UTC,
          browser: { context: "browser", app: "none", platform: "desktop" },
          appVersion: "test",
        },
      ),
    ).toMatchObject({ ok: true, value: { points: 0 } });
    const second = setup({
      store,
      identity,
      init: { scenario: "finished_today" },
    });
    expect(await second.mock.daily.today(UTC)).toMatchObject({
      ok: true,
      value: { status: "in_progress" },
    });
  });

  it("makes every call wait for the init scenario", async () => {
    const { mock } = setup({ init: { scenario: "finished_today" } });
    // No await on ready: the first call still sees the seeded attempt.
    expect(await mock.daily.today(UTC)).toMatchObject({
      ok: true,
      value: { status: "finished" },
    });
  });

  it("refuses scenarios no ticket has built yet, and fresh resets everything", async () => {
    const { mock } = setup();
    await expect(mock.controls.seed("room_lobby_5_seats")).rejects.toThrow(
      /not built yet/,
    );
    await mock.controls.seed("finished_today");
    mock.controls.setLatency(250);
    await mock.controls.seed("fresh");
    expect(mock.controls.inspect("attempts")).toBeUndefined();
    expect(mock.context.transport.latencyMs).toBe(30);
  });
});

describe("transport controls", () => {
  it("feeds the server clock from each response's server time", async () => {
    const clock = createFakeClock(NOV_1);
    const serverClock = createServerClock({ base: clock });
    const identity = createLocalIdentityProvider({
      kv: createKv({ storage: createMemoryStorage() }),
      now: () => NOV_1,
    });
    const mock = createMockBackend(
      { identity: () => identity, serverClock },
      {
        store: createMemoryStore(),
        clock,
        init: { latencyMs: 0 },
        attachControls: false,
      },
    );
    await mock.daily.today(UTC);
    expect(serverClock.samples()).toEqual([{ offsetMs: 0, rttMs: 0 }]);
  });

  it("answers a thrown error as internal, logging the bug", async () => {
    const identity = createLocalIdentityProvider({
      kv: createKv({ storage: createMemoryStorage() }),
      now: () => NOV_1,
    });
    // A plugin whose open throws stands in for a bug in round 0.
    const mock = createMockBackend(
      {
        identity: () => identity,
        serverClock: createServerClock({ base: createFakeClock(NOV_1) }),
      },
      {
        store: createMemoryStore(),
        clock: createFakeClock(NOV_1),
        init: { latencyMs: 0 },
        attachControls: false,
        plugins: {
          ...createEchoRegistry(),
          mystery: {
            ...createEchoRegistry().mystery,
            open: () => {
              throw new Error("not built");
            },
          },
        },
      },
    );
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const result = await mock.sealed.start(
        { kind: "today" },
        {
          tz: UTC,
          browser: { context: "browser", app: "none", platform: "desktop" },
          appVersion: "test",
        },
      );
      expect(result).toMatchObject({
        ok: false,
        error: { code: "internal", retryable: true },
      });
    } finally {
      console.error = original;
    }
    expect(errors).toHaveLength(1);
    // The transaction rolled back: no half-made attempt, no registration.
    expect(mock.controls.inspect("attempts")).toBeUndefined();
    expect(identity.current().registered).toBe(false);
  });

  it("switches room hints off and on", () => {
    const { mock } = setup();
    const statuses: string[] = [];
    mock.context.realtime.subscribe("room:r1", {
      hint() {},
      status: (status) => statuses.push(status),
    });
    mock.controls.setRealtime("down");
    mock.controls.setRealtime("live");
    expect(statuses).toEqual(["down", "live"]);
  });
});
