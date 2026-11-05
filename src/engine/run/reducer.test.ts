// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createEchoRegistry } from "../rounds/testing/echo.ts";
import { parseAttemptId, parseEntityId, type EntityId } from "../types/ids.ts";
import type { BackendError } from "../types/results.ts";
import type { AttemptSnapshot } from "../types/runs.ts";
import { createRun, reduceRun, toLocalSnapshot } from "./reducer.ts";
import { Driver, config, key, metas, roundMeta } from "./testing.ts";
import type { RunState } from "./types.ts";
import { selectRunView } from "./view.ts";

const T0 = Date.parse("2026-11-01T09:00:00Z");
const plugins = createEchoRegistry();

function entity(text: string): EntityId {
  const id = parseEntityId(text);
  if (id === null) throw new Error(`bad entity ${text}`);
  return id;
}

/** The echo mystery's default answer. */
const ECHO = entity("fx.x.country.echo");

function err(
  code: BackendError["code"],
  extra: Partial<BackendError> = {},
): BackendError {
  const retryable = [
    "offline",
    "unreachable",
    "timeout",
    "internal",
    "rate_limited",
  ].includes(code);
  return { code, retryable, retryAfterMs: null, refId: null, ...extra };
}

/** A sealed Driver whose round 0 is open, as start() returns it. */
function sealedRun(types: Parameters<typeof metas>, content: object[] = []) {
  const driver = new Driver(
    config(metas(...types), {
      sealed: true,
      mode: "daily",
      scoring: "sealed",
      runId: "attempt-1",
    }),
    T0,
    { content, autoJudge: false, autoOpen: false },
  );
  driver.openRound(0, T0);
  return driver;
}

describe("createRun", () => {
  it("starts opening round 0", () => {
    const { state, commands } = createRun(config(metas("mc", "mc")), T0);
    expect(state.phase).toBe("opening");
    expect(state.index).toBe(0);
    expect(state.slots).toHaveLength(2);
    expect(state.countdownEndsAt).toBeNull();
    expect(commands).toEqual([{ kind: "open_round", index: 0 }]);
  });

  it("finishes at once when a fixed run has no rounds", () => {
    const { state, commands } = createRun(config([]), T0);
    expect(state.phase).toBe("finishing");
    expect(commands).toEqual([{ kind: "finish" }]);
  });

  it("sets the countdown of a clock run", () => {
    const { state } = createRun(
      config("stream", { endRule: { kind: "clock", durationMs: 60_000 } }),
      T0,
    );
    expect(state.countdownEndsAt).toBe(T0 + 60_000);
    expect(state.slots).toEqual([]);
  });
});

describe("a local run end to end", () => {
  it("plays two choice rounds to the finish, persisting after every verdict", () => {
    const run = new Driver(config(metas("mc", "tf")), T0, {
      content: [{ correct: 2 }, { correct: 0 }],
    });
    expect(run.state.phase).toBe("active");
    run.answer(2, T0 + 1000);
    expect(run.state.phase).toBe("revealed");
    expect(run.state.score).toBe(1);
    expect(run.state.slots[0]?.outcome).toMatchObject({
      family: "choice",
      correct: true,
    });
    run.continue(T0 + 5000);
    expect(run.state.index).toBe(1);
    run.answer(1, T0 + 6000);
    expect(run.state.score).toBe(1);
    expect(run.state.strikes).toBe(1);
    const last = run.continue(T0 + 9000);
    expect(run.state.phase).toBe("finishing");
    expect(last).toContainEqual({ kind: "finish" });
    run.dispatch({ type: "finished", at: T0 + 9001, summary: null });
    expect(run.state.phase).toBe("finished");
    expect(run.commandsOf("persist").length).toBeGreaterThanOrEqual(4);
  });

  it("announces verdicts and moves focus to the reveal", () => {
    const run = new Driver(config(metas("mc")), T0, {
      content: [{ correct: 1 }],
    });
    const before = run.commands.length;
    run.answer(0, T0 + 500);
    const after = run.commands.slice(before);
    expect(after).toContainEqual({
      kind: "announce",
      announcement: {
        kind: "wrong_choice",
        chosen: "Option 1",
        answer: "Option 2",
      },
      politeness: "polite",
    });
    expect(after).toContainEqual({ kind: "focus", target: "reveal_heading" });
  });
});

describe("invariant 1: at most one intent in flight", () => {
  it("refuses a second intent while the first is pending", () => {
    const run = sealedRun(["mc"]);
    run.answer(0, T0 + 100);
    expect(run.state.phase).toBe("judging");
    const before = run.state;
    const commands = run.dispatch({
      type: "intent",
      at: T0 + 200,
      intent: { family: "choice", kind: "answer", option: 1 },
      key: key(99),
    });
    expect(commands).toEqual([]);
    expect(run.state).toBe(before);
    expect(run.state.pending?.key).toBe(key(1));
    expect(selectRunView(run.state, plugins).inputEnabled).toBe(false);
  });

  it("refuses intents outside an open round", () => {
    const run = sealedRun(["mc"]);
    run.answer(0, T0 + 100);
    run.dispatch({
      type: "verdict",
      at: T0 + 200,
      key: key(1),
      verdict: {
        kind: "resolved",
        reveal: {
          family: "choice",
          correctIndex: 0,
          chosenIndex: 0,
          correct: true,
          points: 1,
          valueDisplay: null,
          explanation: "",
          learnMore: "",
          crowd: null,
        },
        next: null,
      },
    });
    const revealed = run.state;
    run.answer(1, T0 + 300);
    expect(run.state).toBe(revealed);
  });
});

describe("invariant 2: a retry re-sends the same idempotency key", () => {
  it("keeps pending through a transport failure and retries with the same key", () => {
    const run = sealedRun(["mc"]);
    const k = run.answer(0, T0 + 100);
    run.dispatch({
      type: "failed",
      at: T0 + 8100,
      key: k,
      error: err("timeout"),
    });
    expect(run.state.phase).toBe("judging");
    expect(run.state.pending?.key).toBe(k);
    expect(run.commandsOf("schedule_retry").at(-1)).toEqual({
      kind: "schedule_retry",
      tries: 1,
      afterMs: 2000,
    });
    run.dispatch({ type: "retry", at: T0 + 10_100 });
    const judges = run.commandsOf("judge");
    expect(judges).toHaveLength(2);
    expect(judges[1]?.key).toBe(k);
    expect(judges[1]?.intent).toEqual(judges[0]?.intent);
    expect(run.state.pending?.tries).toBe(2);
  });

  it("follows the transport schedule of 2, 5, 10, then 30 s", () => {
    const run = sealedRun(["mc"]);
    const k = run.answer(0, T0);
    const delays: (number | null)[] = [];
    for (let i = 1; i <= 5; i += 1) {
      run.dispatch({
        type: "failed",
        at: T0 + i * 1000,
        key: k,
        error: err("unreachable"),
      });
      delays.push(run.commandsOf("schedule_retry").at(-1)?.afterMs ?? null);
      run.dispatch({ type: "retry", at: T0 + i * 1000 + 1 });
    }
    expect(delays).toEqual([2000, 5000, 10_000, 30_000, 30_000]);
  });
});

describe("invariant 3: verdicts for another key are ignored", () => {
  it("ignores a verdict whose key is not pending", () => {
    const run = sealedRun(["mc"]);
    run.answer(0, T0 + 100);
    const judging = run.state;
    const commands = run.dispatch({
      type: "verdict",
      at: T0 + 200,
      key: key(42),
      verdict: {
        kind: "continue",
        open: judging.slots[0]?.open ?? (null as never),
      },
    });
    expect(commands).toEqual([]);
    expect(run.state).toBe(judging);
  });

  it("ignores a late verdict once nothing is pending", () => {
    const run = sealedRun(["mc"]);
    const k = run.answer(0, T0 + 100);
    run.dispatch({
      type: "failed",
      at: T0 + 200,
      key: k,
      error: err("invalid_input"),
    });
    const active = run.state;
    expect(active.pending).toBeNull();
    run.dispatch({
      type: "verdict",
      at: T0 + 300,
      key: k,
      verdict: {
        kind: "continue",
        open: active.slots[0]?.open ?? (null as never),
      },
    });
    expect(run.state).toBe(active);
  });
});

describe("invariant 4: failures", () => {
  it("returns to active with the error after a non-retryable failure", () => {
    const run = sealedRun(["mc"]);
    const k = run.answer(0, T0 + 100);
    const commands = run.dispatch({
      type: "failed",
      at: T0 + 200,
      key: k,
      error: err("not_found"),
    });
    expect(commands).toEqual([]);
    expect(run.state.phase).toBe("active");
    expect(run.state.pending).toBeNull();
    expect(run.state.error).toEqual({ code: "not_found", retryable: false });
    expect(selectRunView(run.state, plugins).status).toBe("error");
  });

  it("keeps the round interactive after a validation refusal from the server", () => {
    const run = sealedRun(["mystery"]);
    const k = run.intent(
      {
        family: "mystery",
        kind: "guess",
        entityId: entity("fx.x.country.nowhere"),
      },
      T0 + 100,
    );
    run.dispatch({
      type: "failed",
      at: T0 + 200,
      key: k,
      error: err("invalid_entity"),
    });
    expect(run.state.phase).toBe("active");
    expect(run.state.error).toEqual({
      code: "invalid_entity",
      retryable: false,
    });
    const view = selectRunView(run.state, plugins);
    expect(view.status).toBe("idle");
    expect(view.inputEnabled).toBe(true);
  });

  it("emits resync on stale and refuses intents until the snapshot arrives", () => {
    const run = sealedRun(["mc"]);
    const k = run.answer(0, T0 + 100);
    const commands = run.dispatch({
      type: "failed",
      at: T0 + 200,
      key: k,
      error: err("stale"),
    });
    expect(commands).toEqual([{ kind: "resync" }]);
    expect(run.state.phase).toBe("active");
    expect(run.state.error?.code).toBe("stale");
    const stale = run.state;
    run.answer(1, T0 + 300);
    expect(run.state).toBe(stale);
    expect(selectRunView(stale, plugins).inputEnabled).toBe(false);
  });

  it("keeps pending on rate_limited and waits for Retry-After", () => {
    const run = sealedRun(["mc"]);
    const k = run.answer(0, T0);
    run.dispatch({
      type: "failed",
      at: T0 + 100,
      key: k,
      error: err("rate_limited", { retryAfterMs: 7000, limitScope: "ip" }),
    });
    expect(run.state.phase).toBe("judging");
    expect(run.state.pending?.key).toBe(k);
    expect(run.commandsOf("schedule_retry").at(-1)).toEqual({
      kind: "schedule_retry",
      tries: 1,
      afterMs: 7000,
    });
  });

  it("backs off 1, 2, 4, 8 s when rate_limited carries no Retry-After", () => {
    const run = sealedRun(["mc"]);
    const k = run.answer(0, T0);
    const delays: (number | null)[] = [];
    for (let i = 1; i <= 5; i += 1) {
      run.dispatch({
        type: "failed",
        at: T0 + i * 100,
        key: k,
        error: err("rate_limited"),
      });
      delays.push(run.commandsOf("schedule_retry").at(-1)?.afterMs ?? null);
      run.dispatch({ type: "retry", at: T0 + i * 100 + 1 });
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 8000]);
  });

  it("stays silent, then plain after 5 s, then offers the fallback after 30 s", () => {
    const run = sealedRun(["mc"]);
    const k = run.answer(0, T0);
    run.dispatch({
      type: "failed",
      at: T0 + 100,
      key: k,
      error: err("rate_limited"),
    });
    expect(selectRunView(run.state, plugins).retry?.notice).toBe("silent");
    run.dispatch({ type: "tick", at: T0 + 5100 });
    expect(selectRunView(run.state, plugins).retry?.notice).toBe("plain");
    run.dispatch({ type: "tick", at: T0 + 30_100 });
    expect(selectRunView(run.state, plugins).retry?.notice).toBe("fallback");
  });

  it("shows the action's own copy at once when the wait passes 60 s", () => {
    const run = sealedRun(["mc"]);
    const k = run.answer(0, T0);
    run.dispatch({
      type: "failed",
      at: T0 + 100,
      key: k,
      error: err("rate_limited", { retryAfterMs: 3_600_000 }),
    });
    expect(selectRunView(run.state, plugins).retry?.notice).toBe("action");
  });

  it("clears the failure run once the verdict lands", () => {
    const run = sealedRun(["mc"]);
    const k = run.answer(0, T0);
    run.dispatch({
      type: "failed",
      at: T0 + 100,
      key: k,
      error: err("offline"),
    });
    expect(selectRunView(run.state, plugins).status).toBe("offline");
    run.dispatch({ type: "retry", at: T0 + 2100 });
    run.judgeLocally(
      0,
      { family: "choice", kind: "answer", option: 0 },
      k,
      T0 + 2200,
    );
    expect(run.state.phase).toBe("revealed");
    expect(run.state.failing).toBeNull();
    expect(run.state.error).toBeNull();
  });

  it("retries a failed open_round and a failed finish", () => {
    const run = new Driver(
      config(metas("mc"), { sealed: true, scoring: "sealed" }),
      T0,
      { autoOpen: false, autoJudge: false },
    );
    run.dispatch({
      type: "failed",
      at: T0 + 100,
      key: null,
      error: err("unreachable"),
    });
    expect(run.state.phase).toBe("opening");
    expect(run.commandsOf("schedule_retry")).toHaveLength(1);
    expect(run.dispatch({ type: "retry", at: T0 + 2100 })).toEqual([
      { kind: "open_round", index: 0 },
    ]);
    run.openRound(0, T0 + 2200);
    const k = run.answer(0, T0 + 3000);
    run.judgeLocally(
      0,
      { family: "choice", kind: "answer", option: 0 },
      k,
      T0 + 3100,
    );
    run.continue(T0 + 4000);
    expect(run.state.phase).toBe("finishing");
    run.dispatch({
      type: "failed",
      at: T0 + 4100,
      key: null,
      error: err("timeout"),
    });
    expect(run.dispatch({ type: "retry", at: T0 + 6100 })).toEqual([
      { kind: "finish" },
    ]);
  });

  it("shows a silent retry of begin_round after Continue as checking, with plain copy only after 5 s", () => {
    const run = sealedRun(["mc", "mc"]);
    const k = run.answer(0, T0 + 1000);
    run.judgeLocally(
      0,
      { family: "choice", kind: "answer", option: 0 },
      k,
      T0 + 1100,
    );
    run.continue(T0 + 2000);
    expect(run.state.phase).toBe("opening");
    run.dispatch({
      type: "failed",
      at: T0 + 2100,
      key: null,
      error: err("rate_limited"),
    });
    let view = selectRunView(run.state, plugins);
    expect(view.status).toBe("checking");
    expect(view.retry).toMatchObject({ op: "open", notice: "silent" });
    run.dispatch({ type: "tick", at: T0 + 7100 });
    view = selectRunView(run.state, plugins);
    expect(view.status).toBe("checking");
    expect(view.retry?.notice).toBe("plain");

    // A timeout retries the same way; offline reads as offline.
    run.dispatch({ type: "retry", at: T0 + 7200 });
    run.dispatch({
      type: "failed",
      at: T0 + 7300,
      key: null,
      error: err("timeout"),
    });
    expect(selectRunView(run.state, plugins).status).toBe("checking");
    run.dispatch({ type: "retry", at: T0 + 9300 });
    run.dispatch({
      type: "failed",
      at: T0 + 9400,
      key: null,
      error: err("offline"),
    });
    expect(selectRunView(run.state, plugins).status).toBe("offline");
  });

  it("shows a silent retry of finish as checking, and a refusal that can't be retried as an error", () => {
    const run = sealedRun(["mc"]);
    const k = run.answer(0, T0 + 1000);
    run.judgeLocally(
      0,
      { family: "choice", kind: "answer", option: 0 },
      k,
      T0 + 1100,
    );
    run.continue(T0 + 2000);
    expect(run.state.phase).toBe("finishing");
    run.dispatch({
      type: "failed",
      at: T0 + 2100,
      key: null,
      error: err("rate_limited", { retryAfterMs: 2000 }),
    });
    expect(selectRunView(run.state, plugins)).toMatchObject({
      status: "checking",
      retry: { op: "finish", notice: "silent" },
    });
    run.dispatch({ type: "retry", at: T0 + 4100 });
    run.dispatch({
      type: "failed",
      at: T0 + 4200,
      key: null,
      error: err("not_found"),
    });
    expect(selectRunView(run.state, plugins)).toMatchObject({
      status: "error",
      retry: null,
    });
  });

  it("refuses an intent the client half rejects, staying active", () => {
    const run = new Driver(config(metas("mc")), T0);
    const before = run.commands.length;
    run.answer(9, T0 + 100);
    expect(run.state.phase).toBe("active");
    expect(run.state.error).toEqual({
      code: "not_selectable",
      retryable: false,
    });
    expect(run.commands.slice(before)).toEqual([]);
    expect(selectRunView(run.state, plugins).status).toBe("idle");
  });

  it("refuses an intent of another family", () => {
    const run = new Driver(config(metas("mc")), T0);
    run.intent({ family: "encore", kind: "lock_in", value: 3 }, T0 + 100);
    expect(run.state.error?.code).toBe("invalid_input");
    expect(run.state.phase).toBe("active");
  });
});

describe("invariant 5: reading time never counts", () => {
  it("measures active time from the open to the resolving verdict only", () => {
    const run = new Driver(config(metas("mc", "mc")), T0);
    run.answer(0, T0 + 4000);
    expect(run.state.slots[0]?.activeMs).toBe(4000);
    // Ten seconds on the reveal, then the next round opens at the Continue.
    run.continue(T0 + 14_000);
    run.answer(0, T0 + 17_000);
    expect(run.state.slots[1]?.activeMs).toBe(3000);
    expect(run.state.slots[0]?.activeMs).toBe(4000);
  });

  it("excludes hidden time from active time", () => {
    const run = new Driver(config(metas("mc")), T0);
    run.dispatch({ type: "visibility", at: T0 + 1000, hidden: true });
    run.dispatch({ type: "visibility", at: T0 + 4000, hidden: false });
    run.answer(0, T0 + 6000);
    expect(run.state.slots[0]?.hiddenMs).toBe(3000);
    expect(run.state.slots[0]?.activeMs).toBe(3000);
  });

  it("stamps the client measure on choice outcomes", () => {
    const run = new Driver(config(metas("mc")), T0);
    run.answer(0, T0 + 2500);
    expect(run.state.slots[0]?.outcome).toMatchObject({ answerMs: 2500 });
  });
});

describe("invariant 6: end rules", () => {
  it("fixed: finishes on the Continue after the last round", () => {
    const run = new Driver(config(metas("mc", "mc")), T0);
    run.answer(0, T0 + 1000);
    expect(run.continue(T0 + 2000)).toContainEqual({
      kind: "open_round",
      index: 1,
    });
    run.answer(0, T0 + 3000);
    expect(selectRunView(run.state, plugins).isLast).toBe(true);
    expect(run.continue(T0 + 4000)).toContainEqual({ kind: "finish" });
    expect(run.state.phase).toBe("finishing");
  });

  it("fixed: a summary that arrives during the last reveal waits for the Continue", () => {
    const run = sealedRun(["mc"]);
    const k = run.answer(0, T0 + 1000);
    run.judgeLocally(
      0,
      { family: "choice", kind: "answer", option: 0 },
      k,
      T0 + 1100,
    );
    expect(run.state.phase).toBe("revealed");
    // The last act() returns the summary; passing it on at once changes nothing.
    const onReveal = run.state;
    expect(
      run.dispatch({ type: "finished", at: T0 + 1200, summary: null }),
    ).toEqual([]);
    expect(run.state).toBe(onReveal);
    // The Continue asks for it, and then it lands.
    expect(run.continue(T0 + 5000)).toEqual([{ kind: "finish" }]);
    run.dispatch({ type: "finished", at: T0 + 5100, summary: null });
    expect(run.state.phase).toBe("finished");
  });

  it("strikes: finishes on the Continue after the third wrong verdict, never earlier", () => {
    const run = new Driver(
      config("stream", {
        mode: "survival",
        endRule: { kind: "strikes", max: 3 },
      }),
      T0,
      {
        autoOpen: false,
        content: Array.from({ length: 10 }, () => ({ correct: 0 })),
      },
    );
    let at = T0;
    const answers = [1, 0, 1, 0, 1];
    answers.forEach((option, index) => {
      run.openRound(index, (at += 100), roundMeta(index, "mc"));
      run.answer(option, (at += 100));
      if (index < answers.length - 1) {
        expect(run.state.strikes).toBeLessThan(3);
        expect(run.continue((at += 100))).toContainEqual({
          kind: "open_round",
          index: index + 1,
        });
      }
    });
    expect(run.state.strikes).toBe(3);
    expect(run.state.phase).toBe("revealed");
    expect(run.continue((at += 100))).toContainEqual({ kind: "finish" });
    expect(run.state.phase).toBe("finishing");
  });

  it("clock: ends at exactly 60.0 s of countdown time, verdict flashes excluded, and the question on screen is unscored (engine rule behind AC-BLZ-01)", () => {
    const run = new Driver(
      config("stream", {
        mode: "blitz",
        scoring: "blitz",
        endRule: { kind: "clock", durationMs: 60_000 },
        timing: { kind: "countdown", durationMs: 60_000 },
      }),
      T0,
      {
        autoOpen: false,
        content: Array.from({ length: 12 }, () => ({ correct: 0 })),
      },
    );
    let at = T0;
    for (let index = 0; index < 10; index += 1) {
      run.openRound(index, at, roundMeta(index, "mc"));
      at += 5400;
      run.answer(0, at);
      // The 600 ms verdict flash pauses the countdown.
      run.dispatch({ type: "pause", at, paused: true });
      at += 600;
      run.dispatch({ type: "pause", at, paused: false });
      run.continue(at);
    }
    // 10 answers took 54 s of countdown and 6 s of flashes.
    run.openRound(10, at, roundMeta(10, "mc"));
    expect(run.state.countdownEndsAt).toBe(T0 + 66_000);
    run.dispatch({ type: "tick", at: T0 + 65_999 });
    expect(run.state.phase).toBe("active");
    const commands = run.dispatch({ type: "tick", at: T0 + 66_000 });
    expect(run.state.phase).toBe("finishing");
    expect(commands).toContainEqual({ kind: "finish" });
    // The 11th question was on screen: discarded, unscored and unseen.
    expect(run.state.slots).toHaveLength(10);
    expect(run.state.slots.every((slot) => slot.outcome !== null)).toBe(true);
  });

  it("clock: an intent at or after the deadline finishes the run instead of judging", () => {
    const run = new Driver(
      config("stream", {
        mode: "blitz",
        scoring: "blitz",
        endRule: { kind: "clock", durationMs: 1000 },
      }),
      T0,
      { autoOpen: false },
    );
    run.openRound(0, T0, roundMeta(0, "mc"));
    run.answer(0, T0 + 1000);
    expect(run.state.phase).toBe("finishing");
    expect(run.commandsOf("judge")).toEqual([]);
    expect(run.state.slots).toEqual([]);
  });

  it("scores Blitz answers with speed points", () => {
    const run = new Driver(
      config("stream", {
        mode: "blitz",
        scoring: "blitz",
        endRule: { kind: "clock", durationMs: 60_000 },
      }),
      T0,
      {
        autoOpen: false,
        content: [{ correct: 0 }, { correct: 0 }, { correct: 0 }],
      },
    );
    run.openRound(0, T0, roundMeta(0, "mc"));
    run.answer(0, T0); // t = 0: 150
    run.continue(T0);
    run.openRound(1, T0, roundMeta(1, "mc"));
    run.answer(0, T0 + 4000); // t = 4 s: 125
    run.continue(T0 + 4000);
    run.openRound(2, T0 + 4000, roundMeta(2, "mc"));
    run.answer(1, T0 + 5000); // wrong: 0
    expect(run.state.score).toBe(275);
  });
});

describe("invariant 7: hidden time", () => {
  it("adds hidden spans while a round is open and sends the running total with each judge", () => {
    const run = sealedRun(
      ["mystery"],
      [{ answer: entity("fx.x.country.arvenna") }],
    );
    run.dispatch({ type: "visibility", at: T0 + 1000, hidden: true });
    run.dispatch({ type: "visibility", at: T0 + 3500, hidden: false });
    run.dispatch({ type: "visibility", at: T0 + 4000, hidden: true });
    const k = run.intent({ family: "mystery", kind: "next_clue" }, T0 + 5000);
    expect(run.commandsOf("judge").at(-1)).toMatchObject({
      key: k,
      hiddenMs: 3500,
      activeMs: 1500,
    });
    run.dispatch({ type: "visibility", at: T0 + 6000, hidden: false });
    expect(run.state.slots[0]?.hiddenMs).toBe(4500);
  });

  it("ignores hidden time on the reveal and between rounds", () => {
    const run = new Driver(config(metas("mc", "mc")), T0);
    run.answer(0, T0 + 1000);
    run.dispatch({ type: "visibility", at: T0 + 2000, hidden: true });
    run.dispatch({ type: "visibility", at: T0 + 9000, hidden: false });
    expect(run.state.slots[0]?.hiddenMs).toBe(0);
    run.continue(T0 + 9500);
    run.answer(0, T0 + 10_000);
    expect(run.state.slots[1]?.hiddenMs).toBe(0);
  });

  it("counts a span that started before the round opened from the open only", () => {
    const run = new Driver(config("stream"), T0, { autoOpen: false });
    run.dispatch({ type: "visibility", at: T0, hidden: true });
    run.openRound(0, T0 + 2000, roundMeta(0, "mc"));
    run.dispatch({ type: "visibility", at: T0 + 3000, hidden: false });
    expect(run.state.slots[0]?.hiddenMs).toBe(1000);
  });

  it("pauses the Blitz countdown while the tab is hidden (engine rule behind AC-BLZ-03)", () => {
    const run = new Driver(
      config("stream", {
        mode: "blitz",
        scoring: "blitz",
        endRule: { kind: "clock", durationMs: 60_000 },
      }),
      T0,
      { autoOpen: false },
    );
    run.openRound(0, T0, roundMeta(0, "mc"));
    run.dispatch({ type: "tick", at: T0 + 20_000 });
    const remainingBefore = selectRunView(run.state, plugins).countdown
      ?.remainingMs;
    expect(remainingBefore).toBe(40_000);
    run.dispatch({ type: "visibility", at: T0 + 20_000, hidden: true });
    run.dispatch({ type: "tick", at: T0 + 30_000 });
    expect(selectRunView(run.state, plugins).countdown).toEqual({
      remainingMs: 40_000,
      paused: true,
    });
    run.dispatch({ type: "visibility", at: T0 + 30_000, hidden: false });
    expect(selectRunView(run.state, plugins).countdown).toEqual({
      remainingMs: 40_000,
      paused: false,
    });
    expect(run.state.countdownEndsAt).toBe(T0 + 70_000);
  });

  it("keeps the countdown paused until both the hidden page and the flash are over", () => {
    const run = new Driver(
      config("stream", {
        mode: "blitz",
        scoring: "blitz",
        endRule: { kind: "clock", durationMs: 60_000 },
      }),
      T0,
      { autoOpen: false },
    );
    run.openRound(0, T0, roundMeta(0, "mc"));
    run.dispatch({ type: "pause", at: T0 + 1000, paused: true });
    run.dispatch({ type: "visibility", at: T0 + 2000, hidden: true });
    run.dispatch({ type: "pause", at: T0 + 3000, paused: false });
    expect(run.state.pausedAt).toBe(T0 + 1000);
    run.dispatch({ type: "visibility", at: T0 + 5000, hidden: false });
    expect(run.state.pausedAt).toBeNull();
    expect(run.state.countdownEndsAt).toBe(T0 + 64_000);
  });
});

describe("invariant 8: persistence and resume", () => {
  it("never emits persist for a sealed run", () => {
    const run = sealedRun(["mc", "mc"]);
    const k = run.answer(0, T0 + 100);
    run.judgeLocally(
      0,
      { family: "choice", kind: "answer", option: 0 },
      k,
      T0 + 200,
    );
    run.continue(T0 + 300);
    expect(run.commandsOf("persist")).toEqual([]);
  });

  it("persists a local run after every verdict and resumes it at the same question", () => {
    const run = new Driver(config(metas("mc", "mc", "mc")), T0, {
      content: [{ correct: 0 }, { correct: 3 }, { correct: 1 }],
    });
    run.answer(0, T0 + 1000);
    expect(run.commands.at(-1)).toEqual({ kind: "persist" });
    run.continue(T0 + 2000);
    const snapshot = JSON.parse(JSON.stringify(toLocalSnapshot(run.state)));
    // A reload: a fresh run resumes from the stored snapshot.
    const fresh = createRun(snapshot.config, T0 + 60_000);
    const resumed = reduceRun(
      fresh.state,
      { type: "resume", at: T0 + 60_000, snapshot },
      plugins,
    );
    expect(resumed.state.phase).toBe("active");
    expect(resumed.state.index).toBe(1);
    expect(resumed.state.score).toBe(1);
    expect(resumed.state.slots[1]?.open).toEqual(run.state.slots[1]?.open);
    expect(resumed.state.slots[0]?.outcome).toEqual(
      run.state.slots[0]?.outcome,
    );
  });

  it("resumes a local run on its reveal when the verdict was the last thing saved", () => {
    const run = new Driver(config(metas("mc", "mc")), T0);
    run.answer(0, T0 + 1000);
    const resumed = reduceRun(
      createRun(run.state.config, T0).state,
      { type: "resume", at: T0 + 5000, snapshot: toLocalSnapshot(run.state) },
      plugins,
    );
    expect(resumed.state.phase).toBe("revealed");
    expect(resumed.commands).toEqual([
      { kind: "focus", target: "reveal_heading" },
    ]);
  });

  it("rebuilds a sealed run mid-mystery at the same clue with the same wrong guesses (engine rule behind AC-DLY-07)", () => {
    const answer = entity("fx.x.country.arvenna");
    const run = sealedRun(["mystery", "encore"], [{ answer }]);
    const k1 = run.intent(
      {
        family: "mystery",
        kind: "guess",
        entityId: entity("fx.x.country.belloria"),
      },
      T0 + 1000,
    );
    run.judgeLocally(
      0,
      {
        family: "mystery",
        kind: "guess",
        entityId: entity("fx.x.country.belloria"),
      },
      k1,
      T0 + 1100,
    );
    const k2 = run.intent({ family: "mystery", kind: "next_clue" }, T0 + 2000);
    run.judgeLocally(
      0,
      { family: "mystery", kind: "next_clue" },
      k2,
      T0 + 2100,
    );
    const open = run.state.slots[0]?.open;
    expect(open).toMatchObject({ clue: 3 });
    const attemptId = parseAttemptId("3f2b8c1e-9d4a-4e6f-8b2c-1a2b3c4d5e6f");
    if (attemptId === null || open === null || open === undefined)
      throw new Error("setup");
    const snapshot: AttemptSnapshot = {
      attemptId,
      kind: "daily",
      ranked: true,
      daily: null,
      composition: "m1e1",
      rounds: run.state.slots.map((slot) => slot.meta),
      maxPoints: 4,
      resolved: [],
      current: { index: 0, open },
      status: "active",
      points: 0,
      startedAt: T0,
      serverTime: T0 + 3000,
    };
    // The reload: a new tab, a new run, the same attempt.
    const fresh = createRun(run.state.config, T0 + 30_000);
    const resumed = reduceRun(
      fresh.state,
      { type: "resume", at: T0 + 30_000, snapshot },
      plugins,
    );
    expect(resumed.state.phase).toBe("active");
    expect(resumed.state.slots[0]?.open).toEqual(open);
    expect(resumed.state.slots[0]?.open).toMatchObject({
      clue: 3,
      wrongGuesses: [{ clue: 1, entityId: "fx.x.country.belloria" }],
    });
    expect(resumed.state.config.runId).toBe(attemptId);
    // Nothing was lost or duplicated, and nothing was persisted locally.
    expect(resumed.commands).toEqual([
      { kind: "focus", target: "round_heading" },
    ]);
  });

  it("resumes a sealed run on the last reveal when Continue was not tapped yet", () => {
    const attemptId = parseAttemptId("3f2b8c1e-9d4a-4e6f-8b2c-1a2b3c4d5e6f");
    if (attemptId === null) throw new Error("setup");
    const rounds = metas("mc", "mc");
    const outcome = {
      family: "choice",
      correct: true,
      points: 1,
      voided: false,
      answerMs: null,
      cells: ["correct"],
    } as const;
    const reveal = {
      family: "choice",
      correctIndex: 0,
      chosenIndex: 0,
      correct: true,
      points: 1,
      valueDisplay: null,
      explanation: "",
      learnMore: "",
      crowd: null,
    } as const;
    const base = createRun(
      config(rounds, { sealed: true, scoring: "sealed" }),
      T0,
    ).state;
    const snapshot = (
      current: AttemptSnapshot["current"],
      status: AttemptSnapshot["status"],
    ): AttemptSnapshot => ({
      attemptId,
      kind: "daily",
      ranked: true,
      daily: null,
      composition: "c2",
      rounds,
      maxPoints: 2,
      resolved: [
        {
          meta: rounds[0] ?? roundMeta(0, "mc"),
          outcome: { ...outcome, cells: [...outcome.cells] },
          reveal,
        },
      ],
      current,
      status,
      points: 1,
      startedAt: T0,
      serverTime: T0,
    });
    const onReveal = reduceRun(
      base,
      {
        type: "resume",
        at: T0 + 10,
        snapshot: snapshot({ index: 1, open: null }, "active"),
      },
      plugins,
    );
    expect(onReveal.state.phase).toBe("revealed");
    expect(onReveal.state.index).toBe(0);
    expect(onReveal.state.score).toBe(1);
    expect(
      reduceRun(onReveal.state, { type: "continue", at: T0 + 20 }, plugins)
        .commands,
    ).toEqual([{ kind: "open_round", index: 1 }]);
    const finished = reduceRun(
      base,
      { type: "resume", at: T0 + 10, snapshot: snapshot(null, "finished") },
      plugins,
    );
    expect(finished.state.phase).toBe("finished");
    const abandoned = reduceRun(
      base,
      { type: "resume", at: T0 + 10, snapshot: snapshot(null, "abandoned") },
      plugins,
    );
    expect(abandoned.state.phase).toBe("abandoned");
  });

  /**
   * A sealed run's snapshot after round 0 resolved on the server and
   * round 1 opened, as a reload finds it (PRD §4.1.4).
   */
  function reloadSnapshot(timing: {
    resolvedMs?: number;
    openMs?: number;
  }): AttemptSnapshot {
    const played = sealedRun(["mystery", "mystery", "encore"]);
    const answer = {
      family: "mystery",
      kind: "guess",
      entityId: ECHO,
    } as const;
    const k = played.intent(answer, T0 + 90_000);
    played.judgeLocally(0, answer, k, T0 + 90_000);
    played.continue(T0 + 95_000);
    played.openRound(1, T0 + 95_000);
    const [first, second] = played.state.slots;
    const attemptId = parseAttemptId("3f2b8c1e-9d4a-4e6f-8b2c-1a2b3c4d5e6f");
    if (
      attemptId === null ||
      first === undefined ||
      first.outcome === null ||
      first.reveal === null ||
      second === undefined ||
      second.open === null
    ) {
      throw new Error("setup");
    }
    return {
      attemptId,
      kind: "daily",
      ranked: true,
      daily: null,
      composition: "m2e1",
      rounds: played.state.slots.map((slot) => slot.meta),
      maxPoints: 8,
      resolved: [
        {
          meta: first.meta,
          outcome: first.outcome,
          reveal: first.reveal,
          ...(timing.resolvedMs === undefined
            ? {}
            : { activeMs: timing.resolvedMs }),
        },
      ],
      current: {
        index: 1,
        open: second.open,
        ...(timing.openMs === undefined ? {} : { activeMs: timing.openMs }),
      },
      status: "active",
      points: 4,
      startedAt: T0,
      serverTime: T0 + 125_000,
    };
  }

  it("R1-06 seeds each resolved round's activeMs from the snapshot's server interval", () => {
    const at = T0 + 126_000;
    const resumed = reduceRun(
      createRun(config(metas("mystery", "mystery", "encore")), at).state,
      {
        type: "resume",
        at,
        snapshot: reloadSnapshot({ resolvedMs: 90_000, openMs: 30_000 }),
      },
      plugins,
    ).state;
    expect(resumed.phase).toBe("active");
    expect(resumed.index).toBe(1);
    expect(resumed.slots[0]?.activeMs).toBe(90_000);
    // The open round's client measure restarts at the reload.
    expect(resumed.slots[1]).toMatchObject({ openedAt: at, activeMs: 0 });
  });

  it("R1-06 reports only the device's own measure for the round open at the reload", () => {
    const at = T0 + 126_000;
    const resumed = reduceRun(
      createRun(config(metas("mystery", "mystery", "encore")), at).state,
      {
        type: "resume",
        at,
        snapshot: reloadSnapshot({ resolvedMs: 90_000, openMs: 30_000 }),
      },
      plugins,
    ).state;
    const next = reduceRun(
      resumed,
      {
        type: "intent",
        at: at + 5_000,
        intent: { family: "mystery", kind: "next_clue" },
        key: key(9),
      },
      plugins,
    );
    // PRD §4.3.3 compares the server's interval with the client's own, so
    // the 30 s the server counted before the reload are never reported.
    expect(next.commands).toEqual([
      expect.objectContaining({ kind: "judge", index: 1, activeMs: 5_000 }),
    ]);
  });

  it("R1-06 resumes a resolved round at 0 when the backend reports no interval, as before", () => {
    const at = T0 + 126_000;
    const resumed = reduceRun(
      createRun(config(metas("mystery", "mystery", "encore")), at).state,
      { type: "resume", at, snapshot: reloadSnapshot({}) },
      plugins,
    ).state;
    expect(resumed.slots.map((slot) => slot.activeMs)).toEqual([0, 0, 0]);
    expect(resumed.slots[1]?.openedAt).toBe(at);
  });
});

describe("mystery rounds with the test plugin", () => {
  it("walks the clue ladder: a wrong guess, Next clue, then the options", () => {
    const answer = entity("fx.x.country.arvenna");
    const run = sealedRun(["mystery"], [{ answer, correct: 2 }]);
    const wrong = entity("fx.x.country.belloria");
    const k1 = run.intent(
      { family: "mystery", kind: "guess", entityId: wrong },
      T0 + 1000,
    );
    run.judgeLocally(
      0,
      { family: "mystery", kind: "guess", entityId: wrong },
      k1,
      T0 + 1100,
    );
    expect(run.state.phase).toBe("active");
    expect(run.commands).toContainEqual({
      kind: "focus",
      target: "clue_heading",
    });
    // The same guess again is refused on the device and consumes nothing.
    const before = run.state;
    run.intent(
      { family: "mystery", kind: "guess", entityId: wrong },
      T0 + 1200,
    );
    expect(run.state.error?.code).toBe("already_guessed");
    expect(run.state.slots).toBe(before.slots);
    for (const at of [T0 + 2000, T0 + 3000]) {
      const k = run.intent({ family: "mystery", kind: "next_clue" }, at);
      run.judgeLocally(0, { family: "mystery", kind: "next_clue" }, k, at + 50);
    }
    const open = run.state.slots[0]?.open;
    expect(open).toMatchObject({ family: "mystery", clue: 4 });
    expect(open?.family === "mystery" ? open.options?.length : 0).toBe(4);
    const k4 = run.intent(
      { family: "mystery", kind: "pick", option: 2 },
      T0 + 4000,
    );
    run.judgeLocally(
      0,
      { family: "mystery", kind: "pick", option: 2 },
      k4,
      T0 + 4100,
    );
    expect(run.state.phase).toBe("revealed");
    expect(run.state.score).toBe(1);
    expect(run.state.slots[0]?.outcome).toEqual({
      family: "mystery",
      solvedOn: 4,
      points: 1,
      voided: false,
      category: "geo",
      cells: ["passed", "passed", "passed", "solved"],
    });
    expect(run.state.slots[0]?.requests).toBe(5);
  });

  it("counts a missed mystery as a strike and scores 0", () => {
    const run = new Driver(
      config(metas("mystery"), { endRule: { kind: "strikes", max: 1 } }),
      T0,
      {
        content: [{ correct: 0 }],
      },
    );
    for (const at of [T0 + 100, T0 + 200, T0 + 300]) {
      run.intent({ family: "mystery", kind: "next_clue" }, at);
    }
    run.intent({ family: "mystery", kind: "pick", option: 3 }, T0 + 400);
    expect(run.state.slots[0]?.outcome).toMatchObject({
      solvedOn: null,
      points: 0,
    });
    expect(run.state.strikes).toBe(1);
  });
});

describe("withdrawn rounds", () => {
  it("resolves a voided round at once as withdrawn, scoring its points", () => {
    const run = new Driver(
      config(
        [roundMeta(0, "mystery", { voided: true }), roundMeta(1, "encore")],
        {
          sealed: true,
          scoring: "sealed",
        },
      ),
      T0,
      { autoOpen: false, autoJudge: false },
    );
    run.dispatch({
      type: "withdrawn",
      at: T0 + 300,
      index: 0,
      reveal: {
        family: "withdrawn",
        round: "mystery",
        points: 4,
        maxPoints: 4,
      },
      next: { ...roundMeta(1, "encore"), ordinal: 1 },
    });
    expect(run.state.phase).toBe("revealed");
    expect(run.state.score).toBe(4);
    expect(run.state.slots[0]?.outcome).toEqual({
      family: "mystery",
      solvedOn: null,
      points: 4,
      voided: true,
      category: "geo",
      cells: ["voided", "voided", "voided", "voided"],
    });
    expect(run.continue(T0 + 400)).toEqual([{ kind: "open_round", index: 1 }]);
  });

  it("ignores a withdrawn event for another round", () => {
    const run = new Driver(config(metas("mc"), { sealed: true }), T0, {
      autoOpen: false,
    });
    const before = run.state;
    run.dispatch({
      type: "withdrawn",
      at: T0,
      index: 3,
      reveal: { family: "withdrawn", round: "choice", points: 1, maxPoints: 1 },
      next: null,
    });
    expect(run.state).toBe(before);
  });
});

describe("events that do not apply", () => {
  it("return the same state with no commands", () => {
    const run = new Driver(config(metas("mc")), T0);
    const state: RunState = run.state;
    const events = [
      { type: "continue", at: T0 + 1 },
      { type: "retry", at: T0 + 1 },
      { type: "finished", at: T0 + 1, summary: null },
      {
        type: "opened",
        at: T0 + 1,
        index: 5,
        open: state.slots[0]?.open ?? (null as never),
      },
      {
        type: "verdict",
        at: T0 + 1,
        key: key(7),
        verdict: {
          kind: "continue",
          open: state.slots[0]?.open ?? (null as never),
        },
      },
      { type: "failed", at: T0 + 1, key: null, error: err("internal") },
      { type: "visibility", at: T0 + 1, hidden: false },
      { type: "pause", at: T0 + 1, paused: false },
    ] as const;
    for (const event of events) {
      const next = reduceRun(state, event, plugins);
      expect(next.state).toBe(state);
      expect(next.commands).toEqual([]);
    }
  });

  it("abandons local runs only", () => {
    const local = new Driver(config(metas("mc")), T0);
    local.dispatch({ type: "abandon", at: T0 + 10 });
    expect(local.state.phase).toBe("abandoned");
    const sealed = sealedRun(["mc"]);
    const before = sealed.state;
    sealed.dispatch({ type: "abandon", at: T0 + 10 });
    expect(sealed.state).toBe(before);
  });

  it("never runs time backwards when an event carries an earlier time", () => {
    const run = new Driver(config(metas("mc")), T0 + 5000);
    run.answer(0, T0);
    expect(run.state.slots[0]?.activeMs).toBe(0);
    expect(run.state.updatedAt).toBe(T0 + 5000);
  });
});

describe("selectRunView", () => {
  it("returns the same view for the same state", () => {
    const run = new Driver(config(metas("mc", "mystery", "encore")), T0);
    const a = selectRunView(run.state, plugins);
    expect(selectRunView(run.state, plugins)).toBe(a);
    expect(a.maxPoints).toBe(5);
    expect(a.total).toBe(3);
    expect(a.round?.family).toBe("choice");
    expect(a.inputEnabled).toBe(true);
    expect(a.status).toBe("idle");
  });

  it("shows checking once a verdict takes longer than 1.5 s", () => {
    const run = sealedRun(["mc"]);
    run.answer(0, T0);
    expect(selectRunView(run.state, plugins).status).toBe("judging");
    run.dispatch({ type: "tick", at: T0 + 1499 });
    expect(selectRunView(run.state, plugins).status).toBe("judging");
    run.dispatch({ type: "tick", at: T0 + 1500 });
    expect(selectRunView(run.state, plugins).status).toBe("checking");
  });

  it("sums the composition's maximum from its rounds, so [mc ×9, encore] is out of 9", () => {
    const rounds = metas(
      "mc",
      "mc",
      "mc",
      "mc",
      "mc",
      "mc",
      "mc",
      "mc",
      "mc",
      "encore",
    );
    const view = selectRunView(createRun(config(rounds), T0).state, plugins);
    expect(view.maxPoints).toBe(9);
    expect(view.total).toBe(10);
  });
});
