/**
 * The Daily controller (ARCHITECTURE §4.5) against the mock backend, with
 * the echo test plugins for both halves and a manual clock, so retries and
 * waits run without sleeping.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameBackend } from "@/backend";
import {
  createMockBackend,
  createMemoryStore,
  type MockBackend,
} from "@/backend/mock";
import { voidRound } from "@/backend/mock/server/sealed";
import { createFakeClock, type FakeClock } from "@/engine/clock";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import {
  parseEntityId,
  parseIdempotencyKey,
  parseTimeZone,
  type EntityId,
  type IdempotencyKey,
  type TimeZone,
} from "@/engine/types";
import { createLocalIdentityProvider } from "@/platform/identity/local";
import { createServerClock } from "@/platform/server-clock";
import { createKv, createMemoryStorage } from "@/platform/storage";

import {
  RATE_LIMIT_JITTER,
  createDailyController,
  type DailyController,
  type DailyControllerDeps,
  type DailySnapshot,
} from "./controller";

const NOV_1 = Date.UTC(2026, 10, 1, 9);
const UTC = parseTimeZone("UTC") as TimeZone;
const entity = (raw: string) => parseEntityId(raw) as EntityId;
const ODILE = entity("fx.x.person.odile-marsh");
const LIESL = entity("fx.x.person.liesl-varo");
const VALDORIA = entity("fx.x.country.valdoria");
const BISMUTH = entity("fx.x.element.bismuth");

/** Backend calls still in flight, across every harness. */
let inFlight = 0;

/**
 * Waits until no backend call is in flight and promise chains have run
 * out: the mock answers through microtasks, and its first calls also load
 * the fixture chunks.
 */
async function settle(): Promise<void> {
  let quiet = 0;
  for (let turn = 0; turn < 500 && quiet < 5; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    quiet = inFlight === 0 ? quiet + 1 : 0;
  }
}

/** Counts a backend area's calls while they are in flight. */
function counted<T extends object>(area: T): T {
  const out: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(area)) {
    out[name] =
      typeof fn !== "function"
        ? fn
        : async (...args: unknown[]) => {
            inFlight += 1;
            try {
              return await (fn as (...a: unknown[]) => Promise<unknown>)(
                ...args,
              );
            } finally {
              inFlight -= 1;
            }
          };
  }
  return out as T;
}

/** Timers on the fake clock: they fire only when the test advances it. */
function manualTimers(clock: FakeClock) {
  const timers: { at: number; fn: () => void }[] = [];
  return {
    schedule(fn: () => void, ms: number) {
      const timer = { at: clock.now() + ms, fn };
      timers.push(timer);
      return () => {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
      };
    },
    /** Delays still pending, from now. */
    pending: () =>
      timers.map((timer) => timer.at - clock.now()).sort((a, b) => a - b),
    async advance(ms: number) {
      const until = clock.now() + ms;
      for (;;) {
        const due = timers
          .filter((timer) => timer.at <= until)
          .sort((a, b) => a.at - b.at)[0];
        if (due === undefined) break;
        timers.splice(timers.indexOf(due), 1);
        if (due.at > clock.now()) clock.advance(due.at - clock.now());
        due.fn();
        await settle();
      }
      if (until > clock.now()) clock.advance(until - clock.now());
      await settle();
    },
  };
}

interface Harness {
  mock: MockBackend;
  backend: GameBackend;
  clock: FakeClock;
  timers: ReturnType<typeof manualTimers>;
  announced: { message: string; politeness: string }[];
  finished: ReturnType<typeof vi.fn>;
  keysSent: IdempotencyKey[];
  controller: DailyController;
  state(): DailySnapshot;
  /** A new controller over the same server and device, as a reload makes. */
  reload(): DailyController;
}

const controllers: DailyController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.stop();
});

function harness(options: { at?: number; random?: number } = {}): Harness {
  const clock = createFakeClock(options.at ?? NOV_1);
  const identity = createLocalIdentityProvider({
    kv: createKv({ storage: createMemoryStorage() }),
    now: () => clock.now(),
  });
  const mock = createMockBackend(
    {
      identity: () => identity,
      serverClock: createServerClock({ base: clock }),
    },
    {
      store: createMemoryStore(),
      clock,
      init: { latencyMs: 0 },
      attachControls: false,
      plugins: createEchoRegistry(),
    },
  );
  const keysSent: IdempotencyKey[] = [];
  const backend: GameBackend = {
    ...mock,
    sealed: counted({
      ...mock.sealed,
      act(input: Parameters<GameBackend["sealed"]["act"]>[0]) {
        keysSent.push(input.key);
        return mock.sealed.act(input);
      },
    }),
  };
  const timers = manualTimers(clock);
  const announced: { message: string; politeness: string }[] = [];
  const finished = vi.fn();
  let keys = 0;
  const deps: DailyControllerDeps = {
    backend: async () => backend,
    plugins: createEchoRegistry(),
    clock,
    schedule: timers.schedule,
    random: () => options.random ?? 0.5,
    newKey: () => {
      keys += 1;
      return parseIdempotencyKey(
        `00000000-0000-4000-8000-${keys.toString(16).padStart(12, "0")}`,
      ) as IdempotencyKey;
    },
    announce: (message, politeness) => announced.push({ message, politeness }),
    startContext: () => ({
      tz: UTC,
      browser: { context: "browser", app: "none", platform: "desktop" },
      appVersion: "test",
    }),
    onFinished: finished,
  };
  const make = () => {
    const controller = createDailyController(deps);
    controllers.push(controller);
    return controller;
  };
  const h: Harness = {
    mock,
    backend,
    clock,
    timers,
    announced,
    finished,
    keysSent,
    controller: make(),
    state: () => h.controller.getSnapshot(),
    reload() {
      h.controller.stop();
      h.controller = make();
      return h.controller;
    },
  };
  return h;
}

async function started(h: Harness): Promise<DailySnapshot> {
  h.controller.start();
  await settle();
  return h.state();
}

const guess = (entityId: EntityId) =>
  ({ family: "mystery", kind: "guess", entityId }) as const;

async function act(
  h: Harness,
  intent: Parameters<DailyController["intent"]>[0],
) {
  h.controller.intent(intent);
  await settle();
}

async function next(h: Harness) {
  h.controller.continue();
  await settle();
}

describe("starting the Daily", () => {
  it("AC-DLY-01 one start opens Mystery 1 on clue 1, with no other call in between", async () => {
    const h = harness();
    const state = await started(h);
    expect(state).toMatchObject({
      status: "playing",
      problem: null,
      daily: { dailyNumber: 42, date: "2026-11-01" },
      composition: "m3e1",
      view: {
        phase: "active",
        index: 0,
        inputEnabled: true,
        round: { family: "mystery", open: { family: "mystery", clue: 1 } },
      },
    });
    expect(h.mock.controls.responses().map((r) => r.method)).toEqual([
      "sealed.start",
    ]);
  });

  it("goes straight to the results of a Daily already finished (AC-DLY-06)", async () => {
    const h = harness();
    await h.mock.controls.seed("finished_today");
    const state = await started(h);
    expect(state).toMatchObject({
      status: "finished",
      daily: { dailyNumber: 42 },
    });
    expect(state.run).toBeNull();
    expect(h.finished).not.toHaveBeenCalled();
  });

  it("retries a failed start on the transport schedule, and the player's Retry goes at once", async () => {
    const h = harness();
    h.mock.controls.failNext("sealed.start", "unreachable", { times: 2 });
    let state = await started(h);
    expect(state).toMatchObject({
      status: "starting",
      problem: { code: "unreachable", count: 1, retrying: true },
    });
    expect(h.timers.pending()).toContain(2000);
    h.controller.retry();
    await settle();
    expect(h.state().problem).toMatchObject({ count: 2 });
    expect(h.timers.pending()).toContain(5000);
    await h.timers.advance(5000);
    state = h.state();
    expect(state).toMatchObject({ status: "playing", problem: null });
  });

  it("gives up on a start that can't succeed", async () => {
    const h = harness();
    h.mock.controls.failNext("sealed.start", "unavailable");
    const state = await started(h);
    expect(state).toMatchObject({
      status: "failed",
      problem: { code: "unavailable", retrying: false },
    });
  });

  it("shows Checking… once the start has waited 1.5 s", async () => {
    const h = harness();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const start = h.backend.sealed.start;
    h.backend.sealed.start = async (...args) => {
      await gate;
      return start(...args);
    };
    h.controller.start();
    await settle();
    expect(h.state().slowStart).toBe(false);
    await h.timers.advance(1500);
    expect(h.state().slowStart).toBe(true);
    release();
    await settle();
    expect(h.state()).toMatchObject({ status: "playing", slowStart: false });
  });
});

describe("stopping and starting again", () => {
  it("drops answers that land after stop(), and start() picks up from the server", async () => {
    const h = harness();
    await started(h);
    h.controller.intent(guess(LIESL));
    // The screen hides (a route kept in <Activity>) while the guess is out.
    h.controller.stop();
    await settle();
    expect(h.state().view).toMatchObject({ phase: "judging" });
    h.controller.start();
    await settle();
    expect(h.state()).toMatchObject({
      status: "playing",
      view: {
        phase: "active",
        round: { open: { clue: 2, wrongGuesses: [{ entityId: LIESL }] } },
      },
    });
    expect(h.timers.pending()).toEqual([]);
  });
});

describe("playing", () => {
  it("plays a Daily to the finish, announcing each verdict, and reports the finish once", async () => {
    const h = harness();
    await started(h);
    await act(h, guess(LIESL));
    expect(h.state().view).toMatchObject({
      phase: "active",
      round: { open: { clue: 2 } },
    });
    expect(h.announced.at(-1)).toEqual({
      message: "Not Liesl Varo. Clue 2, now worth 3: Echo clue 2",
      politeness: "polite",
    });
    await act(h, guess(ODILE));
    expect(h.state().view).toMatchObject({ phase: "revealed", score: 3 });
    expect(h.announced.at(-1)?.message).toBe(
      "Knew it. Echo answer, solved on clue 2. 3 points.",
    );
    expect(h.state().focus).toMatchObject({ target: "reveal_heading" });

    await next(h);
    expect(h.state().view).toMatchObject({ phase: "active", index: 1 });
    await act(h, guess(VALDORIA));
    await next(h);
    await act(h, guess(BISMUTH));
    await next(h);
    await act(h, { family: "encore", kind: "lock_in", value: 104 });
    expect(h.state().view).toMatchObject({
      phase: "revealed",
      isLast: true,
      score: 11,
    });
    expect(h.announced.at(-1)?.message).toBe(
      "Bullseye. 4% off. The answer was 100.",
    );
    expect(h.finished).not.toHaveBeenCalled();

    await next(h);
    expect(h.state()).toMatchObject({
      status: "finished",
      view: { phase: "finished", summary: { points: 11, maxPoints: 12 } },
    });
    expect(h.finished).toHaveBeenCalledTimes(1);
    expect(h.finished).toHaveBeenCalledWith(
      expect.objectContaining({ points: 11, maxPoints: 12 }),
      "m3e1",
    );
    // The last act() carried the summary, so the Continue needed no finish call.
    expect(h.mock.controls.responses().map((r) => r.method)).not.toContain(
      "sealed.finish",
    );
  });

  it("AC-DLY-07 a reload resumes at the same clue with the same guess chips, nothing lost or doubled", async () => {
    const h = harness();
    await started(h);
    await act(h, guess(LIESL));
    await act(h, { family: "mystery", kind: "next_clue" });
    const before = h.state().view?.round?.open;
    expect(before).toMatchObject({
      clue: 3,
      wrongGuesses: [{ entityId: LIESL }],
    });

    h.reload();
    const after = await started(h);
    expect(after.view).toMatchObject({
      phase: "active",
      index: 0,
      inputEnabled: true,
      round: {
        open: { clue: 3, clues: ["Echo clue 1", "Echo clue 2", "Echo clue 3"] },
      },
    });
    expect(after.view?.round?.open).toEqual(before);
    const attemptId = after.attemptId as string;
    expect(h.mock.controls.inspect(`attempts.${attemptId}.actions`)).toBe(2);
    expect(
      Object.keys(h.mock.controls.inspect("attempts") as object),
    ).toHaveLength(1);
  });

  it("retries a lost guess after 2 then 5 s with the same key, and the server counts it once", async () => {
    const h = harness();
    await started(h);
    h.mock.controls.failNext("sealed.act", "unreachable", { times: 2 });
    await act(h, guess(LIESL));
    expect(h.state().view).toMatchObject({
      phase: "judging",
      inputEnabled: false,
      retry: { op: "judge", code: "unreachable", count: 1 },
    });
    expect(h.timers.pending()).toContain(2000);
    await h.timers.advance(2000);
    expect(h.state().view?.retry).toMatchObject({ count: 2 });
    expect(h.timers.pending()).toContain(5000);
    await h.timers.advance(5000);
    expect(h.state().view).toMatchObject({
      phase: "active",
      retry: null,
      round: { open: { clue: 2 } },
    });
    expect(new Set(h.keysSent).size).toBe(1);
    expect(h.keysSent).toHaveLength(3);
    const attemptId = h.state().attemptId as string;
    expect(h.mock.controls.inspect(`attempts.${attemptId}.actions`)).toBe(1);
  });

  it("announces a lost connection once, assertively, and recovers without a reload", async () => {
    const h = harness();
    await started(h);
    h.mock.controls.failNext("sealed.act", "offline", { times: 2 });
    await act(h, guess(LIESL));
    await h.timers.advance(2000);
    const alerts = h.announced.filter((a) => a.politeness === "assertive");
    expect(alerts).toEqual([
      {
        message:
          "You're offline. Your progress is saved, and we'll pick up where you left off.",
        politeness: "assertive",
      },
    ]);
    expect(h.state().view?.status).toBe("offline");
    await h.timers.advance(5000);
    expect(h.state().view).toMatchObject({ phase: "active", status: "idle" });
  });

  it("waits out Retry-After exactly, and adds jitter only when the server sent none", async () => {
    const h = harness({ random: 1 });
    await started(h);
    h.mock.controls.failNext("sealed.act", "rate_limited");
    await act(h, guess(LIESL));
    // The mock's refusals carry Retry-After: 1 s.
    expect(h.timers.pending()).toContain(1000);
    await h.timers.advance(1000);
    expect(h.state().view).toMatchObject({
      phase: "active",
      round: { open: { clue: 2 } },
    });

    const act0 = h.backend.sealed.act;
    let refused = false;
    h.backend.sealed.act = async (input) => {
      if (refused) return act0(input);
      refused = true;
      return {
        ok: false,
        error: {
          code: "rate_limited",
          retryable: true,
          retryAfterMs: null,
          refId: null,
        },
      };
    };
    await act(h, guess(ODILE));
    expect(h.timers.pending()).toContain(
      Math.round(1000 * (1 + RATE_LIMIT_JITTER)),
    );
  });

  it("resyncs after stale to where another tab moved the Daily", async () => {
    const h = harness();
    const { attemptId } = await started(h);
    // Another tab takes Next clue.
    await h.mock.sealed.act({
      attemptId: attemptId as never,
      index: 0,
      step: 1,
      intent: { family: "mystery", kind: "next_clue" },
      clientActiveMs: 0,
      hiddenMs: 0,
      key: "00000000-0000-4000-8000-0000000000ff" as IdempotencyKey,
    });
    await act(h, { family: "mystery", kind: "next_clue" });
    expect(h.state()).toMatchObject({
      movedOn: true,
      view: { phase: "active", error: null, round: { open: { clue: 2 } } },
    });
  });

  it("shows a withdrawn round's card, scores its points, and moves on", async () => {
    const h = harness();
    await voidRound(h.mock.context, { dailyNumber: 42, round: 1 });
    await started(h);
    await act(h, guess(ODILE));
    await next(h);
    expect(h.state().view).toMatchObject({
      phase: "revealed",
      index: 1,
      score: 8,
      round: { open: null, reveal: { family: "withdrawn", points: 4 } },
    });
    await next(h);
    expect(h.state().view).toMatchObject({ phase: "active", index: 2 });
  });

  it("ticks a slow verdict into Checking… after 1.5 s", async () => {
    const h = harness();
    await started(h);
    const act0 = h.backend.sealed.act;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.backend.sealed.act = async (input) => {
      await gate;
      return act0(input);
    };
    await act(h, guess(LIESL));
    expect(h.state().view?.status).toBe("judging");
    await h.timers.advance(1500);
    expect(h.state().view?.status).toBe("checking");
    release();
    await settle();
    expect(h.state().view?.status).toBe("idle");
    // No wait, no ticking.
    expect(h.timers.pending()).toEqual([]);
  });
});
