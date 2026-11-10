/**
 * The Daily's sealed contract against the mock backend (ARCHITECTURE
 * §7.5): runs in every `npm test`. Each context's clock starts at 09:00 UTC
 * on Thursday 5 November 2026, so the mock serves Daily #46 (spare set 4:
 * Odile Marsh, Valdoria and bismuth, then the Harbour Tower Encore), the
 * Daily RITE round 2 played, on whatever day the suite runs. The clock
 * moves 700 ms each time the mock reads it, so rounds take time that isn't
 * a whole number of seconds and the whole-second rule has work to do.
 */
import type { Clock } from "@/engine/clock";

import { dailyContract } from "./daily.contract";
import { runContract } from "./harness";

/** 09:00 UTC on Thursday 5 November 2026: Daily #46. */
const DAILY_46 = Date.UTC(2026, 10, 5, 9);
/** How far each reading moves the clock. */
const STEP_MS = 700;

/** A clock that starts at Daily #46 and moves on each time it is read. */
function steppingClock(): Clock {
  let now = DAILY_46;
  let elapsed = 0;
  return {
    now: () => {
      now += STEP_MS;
      elapsed += STEP_MS;
      return now;
    },
    monotonic: () => elapsed,
  };
}

runContract(dailyContract, "mock", { mockClock: steppingClock });
