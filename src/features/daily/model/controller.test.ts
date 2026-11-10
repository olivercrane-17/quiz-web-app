/**
 * The Daily controller (ARCHITECTURE §4.5) against the mock backend, with
 * the echo test plugins for both halves and a manual clock, so retries and
 * waits run without sleeping.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { backendError, type GameBackend } from "@/backend";
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
import { elapsedMs, formatStopwatch, stopwatchMs } from "./labels";

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
  const serverClock = createServerClock({ base: clock });
  const mock = createMockBackend(
    {
      identity: () => identity,
      serverClock,
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
    serverNow: () => serverClock.now(),
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

  it("AC-IDN-04 keeps a rate-limited start silent for 5 s, then says so, and offers Practice only from 30 s", async () => {
    const h = harness();
    const start = h.backend.sealed.start;
    let refusals = 0;
    h.backend.sealed.start = async (...args) => {
      refusals += 1;
      return refusals <= 40
        ? {
            ok: false,
            error: backendError("rate_limited", {
              retryAfterMs: 1000,
              limitScope: "ip",
            }),
          }
        : start(...args);
    };
    await started(h);
    const notice = () => h.state().problem?.notice;
    expect(h.state()).toMatchObject({
      status: "starting",
      problem: { code: "rate_limited", scope: "ip", retrying: true },
    });
    expect(notice()).toBe("silent");
    await h.timers.advance(4900);
    expect(notice()).toBe("silent");
    await h.timers.advance(100);
    expect(notice()).toBe("plain");
    await h.timers.advance(24_900);
    expect(notice()).toBe("plain");
    await h.timers.advance(100);
    expect(notice()).toBe("fallback");
    // The first accepted retry reaches clue 1 with no tap.
    await h.timers.advance(15_000);
    expect(h.state()).toMatchObject({
      status: "playing",
      problem: null,
      view: { phase: "active", round: { open: { clue: 1 } } },
    });
  });

  it("starts a plain-copy refusal's clock again when the error changes", async () => {
    const h = harness();
    h.mock.controls.failNext("sealed.start", "unreachable");
    h.mock.controls.failNext("sealed.start", "rate_limited", { times: 10 });
    await started(h);
    expect(h.state().problem).toMatchObject({
      code: "unreachable",
      notice: "plain",
    });
    await h.timers.advance(2000);
    expect(h.state().problem).toMatchObject({
      code: "rate_limited",
      notice: "silent",
      since: NOV_1 + 2000,
    });
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
      message: "Not Liesl Varo. Clue 2 is in. Now worth 3. Echo clue 2",
      politeness: "polite",
    });
    await act(h, guess(ODILE));
    expect(h.state().view).toMatchObject({ phase: "revealed", score: 3 });
    // D10: a wrong guess came first, so not "Knew it." (R1-22).
    expect(h.announced.at(-1)?.message).toBe(
      "Got there. Echo answer. Solved on clue 2, 3 points.",
    );
    expect(h.state().focus).toMatchObject({ target: "reveal_heading" });

    await next(h);
    expect(h.state().view).toMatchObject({ phase: "active", index: 1 });
    await act(h, guess(VALDORIA));
    // No miss before it: the stamp is earned.
    expect(h.announced.at(-1)?.message).toBe(
      "Knew it. Echo answer. Solved on clue 1, 4 points.",
    );
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
      "Bullseye. 4% off. You said 104. The answer was 100.",
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

  it("counts a guess once when the server took it and only its answer was lost (invariant 2)", async () => {
    const h = harness();
    const { attemptId } = await started(h);
    // The first act reaches the server and is applied; its answer never arrives.
    const act0 = h.backend.sealed.act;
    let lost = false;
    h.backend.sealed.act = async (input) => {
      const result = await act0(input);
      if (lost) return result;
      lost = true;
      return { ok: false, error: backendError("timeout") };
    };
    await act(h, guess(LIESL));
    expect(h.state().view).toMatchObject({
      phase: "judging",
      retry: { op: "judge", code: "timeout", count: 1 },
    });
    await h.timers.advance(2000);
    expect(h.state().view).toMatchObject({
      phase: "active",
      retry: null,
      round: {
        open: { clue: 2, wrongGuesses: [{ entityId: LIESL }] },
      },
    });
    expect(h.keysSent).toHaveLength(2);
    expect(new Set(h.keysSent).size).toBe(1);
    expect(h.mock.controls.inspect(`attempts.${attemptId}.actions`)).toBe(1);
    expect(
      Object.keys(h.mock.controls.inspect("roundActions") as object),
    ).toEqual([h.keysSent[0]]);

    // A solve whose answer is lost scores once, on the clue it was made on.
    lost = false;
    await act(h, guess(ODILE));
    await h.timers.advance(2000);
    expect(h.state().view).toMatchObject({ phase: "revealed", score: 3 });
    expect(h.mock.controls.inspect(`attempts.${attemptId}.points`)).toBe(3);
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

  it("shows Checking… once begin_round has waited 1.5 s (PRD §3.1.4, Loading clue)", async () => {
    const h = harness();
    await started(h);
    await act(h, guess(ODILE));
    const begin0 = h.backend.sealed.beginRound;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.backend.sealed.beginRound = async (...args) => {
      await gate;
      return begin0(...args);
    };
    await next(h);
    expect(h.state()).toMatchObject({
      slowOpen: false,
      view: { phase: "opening", index: 1 },
    });
    await h.timers.advance(1400);
    expect(h.state().slowOpen).toBe(false);
    await h.timers.advance(100);
    expect(h.state().slowOpen).toBe(true);
    release();
    await settle();
    expect(h.state()).toMatchObject({
      slowOpen: false,
      view: { phase: "active", index: 1 },
    });
    expect(h.timers.pending()).toEqual([]);
  });

  it("waits on the player when begin_round fails for good, and Retry starts over from the server", async () => {
    const h = harness();
    await started(h);
    await act(h, guess(ODILE));
    h.mock.controls.failNext("sealed.beginRound", "not_found");
    await next(h);
    expect(h.state()).toMatchObject({
      status: "playing",
      view: {
        phase: "opening",
        index: 1,
        status: "error",
        retry: null,
        error: { code: "not_found" },
      },
    });
    // Nothing ticks or retries by itself: only the player's Retry moves it.
    expect(h.timers.pending()).toEqual([]);
    await h.timers.advance(120_000);
    expect(h.state().view).toMatchObject({ phase: "opening", status: "error" });

    h.controller.retry();
    await settle();
    // The server never saw the Continue, so the reload lands on the reveal.
    expect(h.state()).toMatchObject({
      status: "playing",
      problem: null,
      view: { phase: "revealed", index: 0, error: null },
    });
    await next(h);
    expect(h.state().view).toMatchObject({ phase: "active", index: 1 });
  });

  it("waits on the player when finish fails for good, and Retry lands on the results", async () => {
    const h = harness();
    await started(h);
    for (const answer of [ODILE, VALDORIA, BISMUTH]) {
      await act(h, guess(answer));
      await next(h);
    }
    // The lock-in's answer comes back without its summary, so the Continue
    // asks finish() for it, which then fails for good.
    const act0 = h.backend.sealed.act;
    h.backend.sealed.act = async (input) => {
      const result = await act0(input);
      return result.ok
        ? { ok: true, value: { ...result.value, finished: null } }
        : result;
    };
    await act(h, { family: "encore", kind: "lock_in", value: 90 });
    h.mock.controls.failNext("sealed.finish", "not_found");
    await next(h);
    expect(h.state()).toMatchObject({
      status: "playing",
      view: { phase: "finishing", status: "error", retry: null },
    });
    expect(h.timers.pending()).toEqual([]);

    h.controller.retry();
    await settle();
    // The attempt finished on the server: the reload goes to its results.
    expect(h.state()).toMatchObject({ status: "finished", run: null });
  });

  it("announces a round voided mid-round as withdrawn, never as a miss", async () => {
    const h = harness();
    await started(h);
    await act(h, guess(LIESL));
    await voidRound(h.mock.context, { dailyNumber: 42, round: 0 });
    await act(h, { family: "mystery", kind: "next_clue" });
    expect(h.state().view).toMatchObject({
      phase: "revealed",
      score: 4,
      round: { reveal: { family: "withdrawn", round: "mystery", points: 4 } },
    });
    expect(h.announced.at(-1)).toEqual({
      message:
        "This Mystery was withdrawn because we got it wrong. Everyone gets 4 points.",
      politeness: "polite",
    });
    expect(h.announced.map((a) => a.message).join(" ")).not.toMatch(/got away/);
  });

  it("waits out a rate-limited resync's Retry-After", async () => {
    const h = harness();
    const { attemptId } = await started(h);
    await h.mock.sealed.act({
      attemptId: attemptId as never,
      index: 0,
      step: 1,
      intent: { family: "mystery", kind: "next_clue" },
      clientActiveMs: 0,
      hiddenMs: 0,
      key: "00000000-0000-4000-8000-0000000000fd" as IdempotencyKey,
    });
    // The mock's refusals carry Retry-After: 1 s.
    h.mock.controls.failNext("sealed.get", "rate_limited");
    await act(h, { family: "mystery", kind: "next_clue" });
    expect(h.timers.pending()).toEqual([1000]);
    await h.timers.advance(1000);
    expect(h.state()).toMatchObject({
      movedOn: true,
      view: { phase: "active", round: { open: { clue: 2 } } },
    });
  });

  it("starts over from the server when a resync can't be served", async () => {
    const h = harness();
    const { attemptId } = await started(h);
    await h.mock.sealed.act({
      attemptId: attemptId as never,
      index: 0,
      step: 1,
      intent: { family: "mystery", kind: "next_clue" },
      clientActiveMs: 0,
      hiddenMs: 0,
      key: "00000000-0000-4000-8000-0000000000fc" as IdempotencyKey,
    });
    h.mock.controls.failNext("sealed.get", "auth_failed");
    await act(h, { family: "mystery", kind: "next_clue" });
    expect(h.state()).toMatchObject({
      status: "failed",
      problem: { code: "auth_failed", retrying: false },
    });
    h.controller.retry();
    await settle();
    expect(h.state()).toMatchObject({
      status: "playing",
      problem: null,
      view: { phase: "active", round: { open: { clue: 2 } } },
    });
  });
});

describe("choice rounds", () => {
  it("leave their verdict to ChoiceRound, which speaks it as the reveal shows", async () => {
    // 15 November 2026: the [mc ×9, encore] fixture Daily.
    const h = harness({ at: Date.UTC(2026, 10, 15, 9) });
    await started(h);
    await act(h, { family: "choice", kind: "answer", option: 0 });
    expect(h.state().view).toMatchObject({ phase: "revealed", index: 0 });
    expect(h.announced).toEqual([]);
  });
});

describe("RITE round 1: what the start and a reload carry", () => {
  it("R1-04 carries the start's first-Daily flag for a player who has never finished a Daily", async () => {
    const h = harness();
    expect(h.state().firstDaily).toBe(false);
    expect((await started(h)).firstDaily).toBe(true);
    // A reload in the middle of that first Daily keeps the hints.
    h.reload();
    expect((await started(h)).firstDaily).toBe(true);
  });

  it("R1-04 drops the flag once the player has finished a Daily", async () => {
    const h = harness();
    await h.mock.controls.seed("finished_today");
    h.clock.advance(24 * 60 * 60 * 1000);
    const state = await started(h);
    expect(state.daily?.dailyNumber).toBe(43);
    expect(state.firstDaily).toBe(false);
  });

  it("R1-06 keeps the elapsed time across a reload, and the judge reports the round as the header counts it (R3-01)", async () => {
    const h = harness();
    await started(h);
    h.clock.advance(90_000);
    await act(h, guess(ODILE));
    await next(h);
    h.clock.advance(30_000);
    expect(elapsedMs(h.state().run!, h.clock.now())).toBe(120_000);

    // The reload: a new controller over the same server and device.
    h.reload();
    const state = await started(h);
    expect(state.view).toMatchObject({ phase: "active", index: 1 });
    // 30 s open on the server, raw (R3-01): the header carries on from
    // where it stood before the reload.
    expect(state.timeOffset).toEqual({ index: 1, ms: 30_000 });
    expect(state.run?.slots[0]?.activeMs).toBe(90_000);
    expect(elapsedMs(state.run!, h.clock.now(), state.timeOffset)).toBe(
      120_000,
    );

    const reported: number[] = [];
    const send = h.backend.sealed.act;
    h.backend.sealed.act = async (input) => {
      reported.push(input.clientActiveMs);
      return send(input);
    };
    h.clock.advance(5_000);
    await act(h, guess(LIESL));
    // PRD §4.3.3 compares the server's interval with the client's measure
    // of the round: the 5 s since the reload and the 30 s before it, the
    // round as the header counts it (R3-01).
    expect(reported).toEqual([35_000]);
    expect(elapsedMs(h.state().run!, h.clock.now(), h.state().timeOffset)).toBe(
      125_000,
    );
  });
});

describe("RITE round 2: one clock (R2-08)", () => {
  it("R2-08 two wrong guesses and two reloads in Mystery 2: the round counts what the server recorded, and the stopwatch ends on the finish's total", async () => {
    const h = harness();
    await started(h);
    h.clock.advance(20_000);
    await act(h, guess(ODILE));
    await next(h);
    h.clock.advance(12_300);
    await act(h, guess(entity("fx.x.country.ostravia")));
    h.reload();
    await started(h);
    h.clock.advance(9_400);
    await act(h, guess(entity("fx.x.country.rosmaar")));
    expect(h.state().view).toMatchObject({ round: { open: { clue: 3 } } });
    h.reload();
    let state = await started(h);
    // The reload's offset is the server's interval, 21.7 s, raw (R3-01).
    expect(state.timeOffset).toEqual({ index: 1, ms: 21_700 });
    h.clock.advance(6_100);
    const before = elapsedMs(state.run!, h.clock.now(), state.timeOffset);
    expect(before).toBe(20_000 + 27_800);
    await act(h, guess(VALDORIA));
    state = h.state();
    // The verdict neither sets the header back nor raises it (R3-01): the
    // client claimed the 27.8 s the header counted, over the server's 27.8 s
    // less 400 ms for each of its four requests, so the claim is recorded,
    // as 27 s, the whole second the header showed.
    expect(
      formatStopwatch(elapsedMs(state.run!, h.clock.now(), state.timeOffset)),
    ).toBe(formatStopwatch(before));
    expect(state.timeOffset).toBeNull();
    expect(state.run?.slots[1]?.activeMs).toBe(27_000);
    expect(elapsedMs(state.run!, h.clock.now(), state.timeOffset)).toBe(
      20_000 + 27_000,
    );

    await next(h);
    h.clock.advance(14_000);
    await act(h, guess(BISMUTH));
    await next(h);
    h.clock.advance(8_000);
    await act(h, { family: "encore", kind: "lock_in", value: 104 });
    state = h.state();
    const summary = h.mock.controls.inspect<{ summary: { totalMs: number } }>(
      `attempts.${state.attemptId}`,
    ).summary;
    // Lock in brought the finish's total: the stopwatch stops on it.
    expect(state.totalMs).toBe(summary.totalMs);
    expect(state.totalMs).toBe(
      elapsedMs(state.run!, h.clock.now(), state.timeOffset),
    );
  });

  it("R2-08 a backend that reports no recorded time keeps the claim the device sent, in whole seconds", async () => {
    const h = harness();
    const send = h.backend.sealed.act;
    h.backend.sealed.act = async (input) => {
      const result = await send(input);
      if (!result.ok) return result;
      const { activeMs: _dropped, ...rest } =
        result.value as typeof result.value & {
          activeMs?: number;
        };
      return { ok: true, value: rest };
    };
    await started(h);
    h.clock.advance(10_600);
    await act(h, guess(ODILE));
    const state = h.state();
    expect(state.run?.slots[0]?.activeMs).toBe(10_600);
    // Floored, as the running header showed it (R3-01).
    expect(elapsedMs(state.run!, h.clock.now(), state.timeOffset)).toBe(10_000);
    expect(state.totalMs).toBeNull();
  });
});

describe("RITE round 3: the header at Lock in is the stop screen's time (R3-01)", () => {
  /** What the header shows now. */
  const header = (h: Harness) => {
    const state = h.state();
    return formatStopwatch(
      stopwatchMs(state.run!, h.clock.now(), state.timeOffset, state.totalMs),
    );
  };

  /** Plays #42's Mysteries on clue 1, each in `ms`, and opens the Encore. */
  async function toTheEncore(h: Harness, ms: number) {
    for (const answer of [ODILE, VALDORIA, BISMUTH]) {
      h.clock.advance(ms);
      await act(h, guess(answer));
      await next(h);
    }
  }

  it("R3-01 fractions of a second in every round: the reading at Lock in is the finish's total", async () => {
    const h = harness();
    await started(h);
    // 10.9 s a Mystery: recorded as 10 s each, as the header shows them.
    await toTheEncore(h, 10_900);
    h.clock.advance(14_950);
    const reading = header(h);
    expect(reading).toBe("0:44");
    await act(h, { family: "encore", kind: "lock_in", value: 104 });
    expect(h.state().totalMs).toBe(44_000);
    expect(header(h)).toBe(reading);
  });

  it("R3-01 a slow Lock in round trip never moves the header, and the recorded time is the one at the press", async () => {
    const h = harness();
    await started(h);
    await toTheEncore(h, 10_000);
    const send = h.backend.sealed.act;
    let during = "";
    h.backend.sealed.act = async (input) => {
      // Two seconds before the verdict shows, on a slow phone: 300 ms on
      // the way out, inside the latency allowance, and the rest after the
      // server stamped the answer.
      h.clock.advance(300);
      const result = await send(input);
      h.clock.advance(1_000);
      during = header(h);
      h.clock.advance(700);
      return result;
    };
    h.clock.advance(8_700);
    const reading = header(h);
    expect(reading).toBe("0:38");
    await act(h, { family: "encore", kind: "lock_in", value: 104 });
    expect(during).toBe(reading);
    expect(header(h)).toBe(reading);
    expect(formatStopwatch(h.state().totalMs ?? 0)).toBe(reading);
  });

  it("R3-01 only a server bound past the allowance may change the header after Lock in (the honest-play case)", async () => {
    const h = harness();
    await started(h);
    await toTheEncore(h, 10_000);
    const send = h.backend.sealed.act;
    h.backend.sealed.act = async (input) => {
      // 2 s on the way out: past the 800 ms the Encore's two requests allow.
      h.clock.advance(2_000);
      return send(input);
    };
    h.clock.advance(8_700);
    expect(header(h)).toBe("0:38");
    await act(h, { family: "encore", kind: "lock_in", value: 104 });
    // 10.7 s on the server less 800 ms: 9.9 s, recorded as 9 s.
    expect(header(h)).toBe("0:39");
  });

  it("R3-01 a judge retried after a lost send claims the press, so the reveal shows the header's reading", async () => {
    const h = harness();
    await started(h);
    const reported: number[] = [];
    const send = h.backend.sealed.act;
    h.backend.sealed.act = async (input) => {
      reported.push(input.clientActiveMs);
      return send(input);
    };
    // Two clues asked for: with the round's issue and the guess, four
    // requests, so 1.6 s of latency allowance, and the server's bound at
    // the retry (9.3 s less 1.6 s) stays in the header's whole second.
    for (let clue = 0; clue < 2; clue += 1) {
      h.clock.advance(1_000);
      await act(h, { family: "mystery", kind: "next_clue" });
    }
    h.clock.advance(5_300);
    reported.length = 0;
    const reading = header(h);
    expect(reading).toBe("0:07");
    // The first send never reaches the server; the retry goes 2 s later.
    h.mock.controls.failNext("sealed.act", "unreachable", { times: 1 });
    await act(h, guess(ODILE));
    expect(h.state().view?.retry).toMatchObject({ op: "judge", count: 1 });
    expect(header(h)).toBe(reading);
    await h.timers.advance(2_000);
    expect(h.state().view).toMatchObject({ phase: "revealed", retry: null });
    // Both calls claim the round up to the press, not up to the retry.
    expect(reported).toEqual([7_300, 7_300]);
    expect(h.state().run?.slots[0]?.activeMs).toBe(7_000);
    expect(header(h)).toBe(reading);
  });

  it("R3-01 a page hidden mid-round keeps counting, and its reveal doesn't jump (D19)", async () => {
    const h = harness();
    await started(h);
    h.clock.advance(5_000);
    h.controller.visibility(true);
    h.clock.advance(60_000);
    h.controller.visibility(false);
    h.clock.advance(5_400);
    const reading = header(h);
    expect(reading).toBe("1:10");
    await act(h, guess(ODILE));
    expect(header(h)).toBe(reading);
    expect(h.state().run?.slots[0]?.activeMs).toBe(70_000);
  });
});
