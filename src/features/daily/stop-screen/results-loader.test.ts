import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameBackend } from "@/backend";
import {
  parseAttemptId,
  parseDailyNumber,
  parseLocalDate,
  parseTimeZone,
  type AttemptId,
  type BackendErrorCode,
  type DailyResults,
  type DailyTodayCard,
  type Result,
  type TimeZone,
} from "@/engine/types";

import type { rememberFinished as RememberFinished } from "../model/handoff";
import type { loadResults as LoadResults } from "./results-loader";

let loadResults: typeof LoadResults;
let rememberFinished: typeof RememberFinished;

beforeEach(async () => {
  // The handoff is module state: start each case without one.
  vi.resetModules();
  ({ loadResults } = await import("./results-loader"));
  ({ rememberFinished } = await import("../model/handoff"));
});

function must<T>(value: T | null): T {
  if (value === null) throw new Error("bad test value");
  return value;
}

function id(raw: string): AttemptId {
  return must(parseAttemptId(raw));
}

function daily(dailyNumber: number, date: string) {
  return {
    dailyNumber: must(parseDailyNumber(dailyNumber)),
    date: must(parseLocalDate(date)),
  };
}

const TODAYS = id("0f8fad5b-d9cb-469f-a165-70867728950e");
const JUST_FINISHED = id("7c9e6679-7425-40de-944b-e07fc1f90ae7");
const ZONE: TimeZone = must(parseTimeZone("Europe/London"));
const NEXT_UNLOCK = Date.UTC(2026, 10, 2);
/** The loader hands results through untouched, so any object stands in. */
const RESULTS = { stand_in: "results" } as unknown as DailyResults;

function today(overrides: Partial<DailyTodayCard> = {}): DailyTodayCard {
  return {
    daily: daily(42, "2026-11-01"),
    rounds: [],
    playedCount: null,
    status: "finished",
    attemptId: TODAYS,
    progress: null,
    finished: null,
    nextUnlockAt: NEXT_UNLOCK,
    serverTime: Date.UTC(2026, 10, 1, 9),
    ...overrides,
  };
}

function failure<T>(code: BackendErrorCode, refId: string | null = null) {
  return {
    ok: false,
    error: { code, retryable: true, retryAfterMs: null, refId },
  } satisfies Result<T>;
}

function backend(
  todayResult: Result<DailyTodayCard>,
  results: Result<DailyResults> = { ok: true, value: RESULTS },
) {
  const area = {
    today: vi.fn(async () => todayResult),
    results: vi.fn(async () => results),
  };
  return { area, backend: { daily: area } as unknown as GameBackend };
}

describe("loadResults", () => {
  it("opens today's finished attempt, with the countdown to the next Daily", async () => {
    const { area, backend: b } = backend({ ok: true, value: today() });
    await expect(loadResults(b, 42, ZONE)).resolves.toEqual({
      kind: "ready",
      results: RESULTS,
      nextUnlockAt: NEXT_UNLOCK,
    });
    expect(area.today).toHaveBeenCalledWith(ZONE);
    expect(area.results).toHaveBeenCalledWith(TODAYS);
  });

  it("sends an unfinished Daily back to play, without asking for results", async () => {
    const { area, backend: b } = backend({
      ok: true,
      value: today({ status: "in_progress" }),
    });
    await expect(loadResults(b, 42, ZONE)).resolves.toEqual({
      kind: "not_finished",
    });
    expect(area.results).not.toHaveBeenCalled();
  });

  it("opens the attempt this tab just finished, even after the day turned over", async () => {
    rememberFinished(42, JUST_FINISHED);
    const { area, backend: b } = backend({
      ok: true,
      value: today({
        daily: daily(43, "2026-11-02"),
        status: "not_started",
        attemptId: null,
      }),
    });
    await expect(loadResults(b, 42, ZONE)).resolves.toEqual({
      kind: "ready",
      results: RESULTS,
      nextUnlockAt: null,
    });
    expect(area.results).toHaveBeenCalledWith(JUST_FINISHED);
  });

  it("leaves another day's results to the archive", async () => {
    const { area, backend: b } = backend({ ok: true, value: today() });
    await expect(loadResults(b, 41, ZONE)).resolves.toEqual({
      kind: "elsewhere",
    });
    expect(area.results).not.toHaveBeenCalled();
  });

  it("says why when get_today fails and this tab finished nothing", async () => {
    const { backend: b } = backend(failure("offline", "R-1"));
    await expect(loadResults(b, 42, ZONE)).resolves.toEqual({
      kind: "error",
      code: "offline",
      refId: "R-1",
    });
  });

  it("still opens the attempt this tab finished when get_today fails", async () => {
    rememberFinished(42, JUST_FINISHED);
    const { backend: b } = backend(failure("unreachable"));
    await expect(loadResults(b, 42, ZONE)).resolves.toEqual({
      kind: "ready",
      results: RESULTS,
      nextUnlockAt: null,
    });
  });

  it("reads an unknown attempt as archived, and other failures as errors", async () => {
    const missing = backend({ ok: true, value: today() }, failure("not_found"));
    await expect(loadResults(missing.backend, 42, ZONE)).resolves.toEqual({
      kind: "elsewhere",
    });
    const broken = backend(
      { ok: true, value: today() },
      failure("internal", "R-9"),
    );
    await expect(loadResults(broken.backend, 42, ZONE)).resolves.toEqual({
      kind: "error",
      code: "internal",
      refId: "R-9",
    });
  });
});
