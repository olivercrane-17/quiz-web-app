/**
 * The mock daily area: the home card's states (PRD §3.1.7) and the basic
 * results, over the fixture Dailies with the echo test plugins.
 */
import { describe, expect, it } from "vitest";

import { createFakeClock } from "@/engine/clock";
import { createEchoRegistry } from "@/engine/rounds/testing/echo";
import { startOfLocalDay } from "@/engine/time";
import {
  parseEntityId,
  parseIdempotencyKey,
  parseLocalDate,
  parseTimeZone,
  type AttemptId,
  type EntityId,
  type IdempotencyKey,
  type LocalDate,
  type RoundIntent,
  type TimeZone,
} from "@/engine/types";
import { createLocalIdentityProvider } from "@/platform/identity/local";
import { createServerClock } from "@/platform/server-clock";
import { createKv, createMemoryStorage } from "@/platform/storage";

import { createMockBackend } from "../index";
import { createMemoryStore } from "../store";

const NOV_1 = Date.UTC(2026, 10, 1, 9);
const LONDON = parseTimeZone("Europe/London") as TimeZone;
const START = {
  tz: LONDON,
  browser: { context: "browser", app: "none", platform: "desktop" },
  appVersion: "test",
} as const;
const ANSWERS = [
  "fx.x.person.odile-marsh",
  "fx.x.country.valdoria",
  "fx.x.element.bismuth",
].map((raw) => parseEntityId(raw) as EntityId);

let keys = 0;
const key = (): IdempotencyKey => {
  keys += 1;
  return parseIdempotencyKey(
    `00000000-0000-4000-8000-${keys.toString(16).padStart(12, "0")}`,
  ) as IdempotencyKey;
};

function setup(at = NOV_1) {
  const clock = createFakeClock(at);
  const identity = createLocalIdentityProvider({
    kv: createKv({ storage: createMemoryStorage() }),
    now: () => at,
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
  return { mock, clock };
}

async function act(
  t: ReturnType<typeof setup>,
  attemptId: AttemptId,
  index: number,
  step: number,
  intent: RoundIntent,
) {
  const result = await t.mock.sealed.act({
    attemptId,
    index,
    step,
    intent,
    clientActiveMs: 0,
    hiddenMs: 0,
    key: key(),
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe("today", () => {
  it("serves the not-started card before any write, with one chip per round", async () => {
    const t = setup();
    const card = await t.mock.daily.today(LONDON);
    expect(card).toEqual({
      ok: true,
      value: {
        daily: { dailyNumber: 42, date: "2026-11-01" },
        rounds: [
          { type: "mystery", difficulty: "easy", answerType: "person" },
          { type: "mystery", difficulty: "medium", answerType: "country" },
          { type: "mystery", difficulty: "hard", answerType: "element" },
          { type: "encore", difficulty: null, answerType: null },
        ],
        playedCount: null,
        status: "not_started",
        attemptId: null,
        progress: null,
        finished: null,
        nextUnlockAt: startOfLocalDay(
          parseLocalDate("2026-11-02") as LocalDate,
          LONDON,
        ),
        serverTime: NOV_1,
      },
    });
    // get_today never registers (§8.4).
    expect(t.mock.controls.inspect("players")).toBeUndefined();
  });

  it("shows the attempt in progress, then finished with its grid and Encore", async () => {
    const t = setup();
    const start = await t.mock.sealed.start({ kind: "today" }, START);
    if (!start.ok) throw new Error(start.error.code);
    const { attemptId } = start.value;
    expect(await t.mock.daily.today(LONDON)).toMatchObject({
      ok: true,
      value: {
        status: "in_progress",
        attemptId,
        progress: { roundIndex: 0, of: 4 },
        finished: null,
      },
    });

    // Clue 1, then clue 2 after Next clue, then clue 3 after two.
    for (const [index, nextClues] of [0, 1, 2].entries()) {
      if (index > 0) await t.mock.sealed.beginRound(attemptId, index);
      for (let clue = 1; clue <= nextClues; clue += 1) {
        await act(t, attemptId, index, clue, {
          family: "mystery",
          kind: "next_clue",
        });
      }
      await act(t, attemptId, index, nextClues + 1, {
        family: "mystery",
        kind: "guess",
        entityId: ANSWERS[index]!,
      });
    }
    expect(await t.mock.daily.today(LONDON)).toMatchObject({
      value: { status: "in_progress", progress: { roundIndex: 3, of: 4 } },
    });
    await t.mock.sealed.beginRound(attemptId, 3);
    await act(t, attemptId, 3, 1, {
      family: "encore",
      kind: "lock_in",
      value: 104,
    });

    expect(await t.mock.daily.today(LONDON)).toMatchObject({
      ok: true,
      value: {
        status: "finished",
        attemptId,
        progress: null,
        finished: {
          points: 9,
          maxPoints: 12,
          rows: [
            ["solved", "unused", "unused", "unused"],
            ["passed", "solved", "unused", "unused"],
            ["passed", "passed", "solved", "unused"],
          ],
          encore: { display: "4% off" },
        },
      },
    });
  });

  it("answers no_daily before the epoch", async () => {
    const t = setup(Date.UTC(2026, 8, 1, 9));
    expect(await t.mock.daily.today(LONDON)).toMatchObject({
      ok: false,
      error: { code: "no_daily" },
    });
  });
});

describe("results", () => {
  it("serves only the caller's finished attempts, with the cold-start view", async () => {
    const t = setup();
    const start = await t.mock.sealed.start({ kind: "today" }, START);
    if (!start.ok) throw new Error(start.error.code);
    const { attemptId } = start.value;
    expect(await t.mock.daily.results(attemptId)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    for (const index of [0, 1, 2]) {
      if (index > 0) await t.mock.sealed.beginRound(attemptId, index);
      await act(t, attemptId, index, 1, {
        family: "mystery",
        kind: "guess",
        entityId: ANSWERS[index]!,
      });
    }
    await t.mock.sealed.beginRound(attemptId, 3);
    await act(t, attemptId, 3, 1, {
      family: "encore",
      kind: "lock_in",
      value: 300,
    });
    const results = await t.mock.daily.results(attemptId);
    expect(results).toMatchObject({
      ok: true,
      value: {
        attempt: { attemptId, status: "finished", points: 12 },
        summary: { attemptId, points: 12, maxPoints: 12, ranked: true },
        percentile: { status: "cold_start", finishers: 1 },
        histogram: null,
        personal: null,
        challenge: null,
      },
    });
    expect(results.ok && results.value.attempt.resolved).toHaveLength(4);
  });
});
