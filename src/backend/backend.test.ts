import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeClock } from "@/engine/clock";
import type { LocalIdentity } from "@/engine/types";
import type { IdentityProvider } from "@/platform/identity/provider";
import { createServerClock } from "@/platform/server-clock";

import { AREA_METHODS } from "./areas";
import type { BackendDeps } from "./deps";
import { UNAVAILABLE } from "./errors";
import {
  configureBackend,
  getBackend,
  prefetchBackend,
  resetBackendForTests,
} from "./index";
import { createMockBackend } from "./mock";
import { createOffBackend } from "./off";
import { createSupabaseBackend } from "./supabase";
import { BACKEND_AREAS, type GameBackend } from "./types";

const identity: IdentityProvider = {
  current: () => ({}) as LocalIdentity,
  markRegistered: () => {},
  replace: () => {},
};
const deps: BackendDeps = {
  identity: () => identity,
  serverClock: createServerClock({ base: createFakeClock(0) }),
};

async function everyCall(backend: GameBackend) {
  const results: unknown[] = [];
  for (const area of BACKEND_AREAS) {
    const impl = backend[area] as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    for (const method of AREA_METHODS[area]) {
      if (area === "rooms" && method === "subscribe") continue;
      results.push(await impl[method]?.());
    }
  }
  return results;
}

afterEach(() => {
  resetBackendForTests();
});

describe("backend implementations", () => {
  it("each area implements exactly the interface's methods", () => {
    for (const backend of [
      createOffBackend(),
      createSupabaseBackend(deps),
      createMockBackend(deps, { attachControls: false }),
    ]) {
      for (const area of BACKEND_AREAS) {
        expect(Object.keys(backend[area]).sort()).toEqual(
          [...AREA_METHODS[area]].sort(),
        );
      }
    }
  });

  it("off answers unavailable everywhere and room subscriptions are no-ops (§7.6)", async () => {
    const off = createOffBackend();
    expect(off.mode).toBe("off");
    for (const result of await everyCall(off)) {
      expect(result).toEqual({ ok: false, error: UNAVAILABLE });
    }
    const unsubscribe = off.rooms.subscribe("r" as never, "players", {
      hint() {},
      status() {},
    });
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });

  it("the Supabase stubs answer unavailable until their SQL tickets land", async () => {
    const backend = createSupabaseBackend(deps);
    expect(backend.mode).toBe("supabase");
    for (const result of await everyCall(backend)) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "unavailable" },
      });
    }
  });
});

describe("the mock transport", () => {
  const make = () =>
    createMockBackend(deps, {
      init: { latencyMs: 0 },
      clock: createFakeClock(5000),
      attachControls: false,
    });

  it("answers unbuilt areas with unavailable and logs every response", async () => {
    const mock = make();
    expect(mock.mode).toBe("mock");
    const result = await mock.health.status();
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(mock.controls.responses()).toEqual([
      { method: "health.status", at: 5000, payload: result },
    ]);
  });

  it("fails the next calls of a method as injected, matching `when`", async () => {
    const mock = make();
    mock.controls.failNext("rooms.answer", "internal", {
      times: 2,
      when: { questionIndex: 6 },
    });
    const answer = (questionIndex: number) =>
      mock.rooms.answer({ questionIndex } as never);
    expect(await answer(5)).toMatchObject({ error: { code: "unavailable" } });
    expect(await answer(6)).toMatchObject({
      error: { code: "internal", retryable: true },
    });
    expect(await answer(6)).toMatchObject({ error: { code: "internal" } });
    expect(await answer(6)).toMatchObject({ error: { code: "unavailable" } });
    mock.controls.failNext("sealed.act", "rate_limited");
    expect(await mock.sealed.act({} as never)).toMatchObject({
      error: { code: "rate_limited", retryAfterMs: 1000, limitScope: "player" },
    });
  });

  it("fails with unreachable when unreachable, and offline when the browser is offline", async () => {
    const mock = make();
    mock.controls.setReachable(false);
    expect(await mock.daily.today("UTC" as never)).toMatchObject({
      error: { code: "unreachable" },
    });
    mock.controls.setReachable(true);
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(await mock.daily.today("UTC" as never)).toMatchObject({
      error: { code: "offline" },
    });
    online.mockRestore();
  });

  it("applies __QZ_MOCK_INIT__ and resets", async () => {
    const mock = createMockBackend(deps, {
      init: {
        latencyMs: 0,
        realtime: "down",
        failures: [{ method: "streaks.get", code: "timeout" }],
      },
      attachControls: false,
    });
    expect(mock.context.transport.realtime).toBe("down");
    expect(await mock.streaks.get("UTC" as never)).toMatchObject({
      error: { code: "timeout" },
    });
    await mock.context.store.write(
      (db) => {
        db.attempts = [{ id: "a1" }];
      },
      ["attempts"],
    );
    expect(mock.controls.inspect("attempts")).toEqual([{ id: "a1" }]);
    expect(mock.controls.inspect("attempts.0.id")).toBe("a1");
    await mock.controls.seed("fresh");
    expect(mock.controls.inspect("attempts")).toBeUndefined();
    expect(mock.controls.responses()).toEqual([]);
    // finished_today and in_progress_mystery_2 are built (DLY-1); the
    // Group scenario waits for GRP-1.
    await expect(mock.controls.seed("group_of_4")).rejects.toThrow(
      /not built yet/,
    );
  });

  it("attaches window.__qzMock in the browser", () => {
    const mock = createMockBackend(deps, { init: {} });
    expect((window as { __qzMock?: unknown }).__qzMock).toBe(mock.controls);
    delete (window as { __qzMock?: unknown }).__qzMock;
  });
});

describe("getBackend", () => {
  it("loads the build's backend once per tab", async () => {
    const first = getBackend();
    expect(getBackend()).toBe(first);
    const backend = await first;
    expect(backend.mode).toBe("mock");
    expect(() => prefetchBackend()).not.toThrow();
    delete (window as { __qzMock?: unknown }).__qzMock;
  });

  it("hands implementations the registered identity, and refuses calls before one exists", async () => {
    const backend = (await getBackend()) as ReturnType<
      typeof createMockBackend
    >;
    expect(() => backend.context.identity()).toThrow(/configureBackend/);
    configureBackend({ identity });
    expect(backend.context.identity()).toBe(identity);
    delete (window as { __qzMock?: unknown }).__qzMock;
  });
});
