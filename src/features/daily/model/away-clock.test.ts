/**
 * The Continue card's running time (RITE round 4, R4-04), held equal to
 * the play header's own after a reload: `timeOffsetOf` for the open round
 * and `wholeSecond` for the resolved ones.
 */
import { describe, expect, it } from "vitest";

import { SHARED } from "@/config/shared";
import type { AttemptSnapshot } from "@/engine/types";

import { awayClockMs, awayClockOf } from "./away-clock";
import { timeOffsetOf } from "./controller";
import { formatStopwatch, wholeSecond } from "./labels";

const T0 = Date.UTC(2026, 10, 10, 9);

/** A snapshot with two resolved rounds and round 2 open for `openMs`. */
function snapshot(
  overrides: Partial<Record<keyof AttemptSnapshot, unknown>> = {},
  openMs: number | undefined = 42_000,
): AttemptSnapshot {
  return {
    status: "active",
    resolved: [{ activeMs: 61_900 }, { activeMs: 30_000 }],
    current: {
      index: 2,
      open: { issuedAt: T0 - 50_000 },
      ...(openMs === undefined ? {} : { activeMs: openMs }),
    },
    serverTime: T0,
    ...overrides,
  } as unknown as AttemptSnapshot;
}

describe("the Continue card's running time", () => {
  it("R4-04 counts the resolved rounds to the whole second and the open round's interval so far", () => {
    const clock = awayClockOf(snapshot(), T0);
    expect(clock).toEqual({ resolvedMs: 91_000, openMs: 42_000, at: T0 });
    expect(formatStopwatch(awayClockMs(clock!, T0))).toBe("2:13");
  });

  it("R4-04 three seconds later it reads three seconds more, to the second", () => {
    const clock = awayClockOf(snapshot(), T0)!;
    expect(formatStopwatch(awayClockMs(clock, T0 + 3_000))).toBe("2:16");
    expect(formatStopwatch(awayClockMs(clock, T0 + 3_999))).toBe("2:16");
    // A device clock that steps back never takes time off.
    expect(awayClockMs(clock, T0 - 5_000)).toBe(133_000);
  });

  it("R4-04 is the header's own figure after a reload: the same offset for the open round, the trip back included", () => {
    for (const [openMs, serverNow] of [
      [42_000, T0 + 180],
      [undefined, T0 + 180],
      [42_000, null],
      [42_000, T0 + 600_000],
      [0, T0 - 5],
    ] as const) {
      const attempt = snapshot({}, openMs);
      const clock = awayClockOf(attempt, T0 + 200, serverNow)!;
      const offset = timeOffsetOf(attempt, serverNow);
      expect(clock.openMs).toBe(offset?.ms ?? 0);
      expect(clock.resolvedMs).toBe(wholeSecond(61_900) + wholeSecond(30_000));
    }
  });

  it("R4-04 stops at the round's 15-minute cap, as the header does", () => {
    const clock = awayClockOf(snapshot(), T0)!;
    expect(awayClockMs(clock, T0 + 2 * SHARED.roundCapMs)).toBe(
      91_000 + SHARED.roundCapMs,
    );
    const capped = awayClockOf(
      snapshot({
        resolved: [{ activeMs: 5 * SHARED.roundCapMs }, {}],
      }),
      T0,
    )!;
    expect(capped.resolvedMs).toBe(SHARED.roundCapMs);
  });

  it("R4-04 has no clock on a reveal, between rounds or once finished", () => {
    expect(awayClockOf(snapshot({ current: null }), T0)).toBeNull();
    expect(
      awayClockOf(snapshot({ current: { index: 2, open: null } }), T0),
    ).toBeNull();
    expect(awayClockOf(snapshot({ status: "finished" }), T0)).toBeNull();
  });
});
