/**
 * The system clock (ARCHITECTURE §4.3): Date.now for wall time and
 * performance.now for intervals. In E2E, Playwright's page.clock drives
 * both, and the mock backend reads the same clock, so the whole stack moves
 * together.
 */
import type { Clock } from "@/engine/clock";

export const systemClock: Clock = {
  now: () => Date.now(),
  monotonic: () =>
    typeof performance === "undefined" ? Date.now() : performance.now(),
};
