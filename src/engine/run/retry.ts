/**
 * Retry schedules and wait thresholds for the run machine (ARCHITECTURE
 * §4.5 invariant 4, §7.3, PRD §3.0.2). Fixed rules, not tunables.
 */
import type { RetryNotice } from "./types.ts";

/** Transport failures retry after 2, 5, 10, then every 30 s. */
export const TRANSPORT_RETRY_MS = [2000, 5000, 10_000, 30_000] as const;
/** Rate-limited calls without Retry-After wait 1, 2, 4, then 8 s, plus jitter. */
export const RATE_LIMITED_RETRY_MS = [1000, 2000, 4000, 8000] as const;
/** A verdict that takes longer than this shows "Checking..." (PRD §3.0.2). */
export const CHECKING_AFTER_MS = 1500;
/** Refusals turn into plain copy with a Retry button after this long. */
export const PLAIN_COPY_AFTER_MS = 5000;
/** A feature's fallback (the Daily's is Practice) appears only after this long. */
export const FALLBACK_AFTER_MS = 30_000;
/** A wait longer than this shows the action's own copy at once. */
export const ACTION_COPY_WAIT_MS = 60_000;

function step(schedule: readonly number[], failures: number): number {
  const index = Math.min(Math.max(failures, 1), schedule.length) - 1;
  return schedule[index] ?? 0;
}

/** The base delay before retry number `failures` (1 for the first retry). */
export function retryDelayMs(
  kind: "transport" | "rate_limited",
  failures: number,
  retryAfterMs: number | null = null,
): number {
  if (kind === "rate_limited") {
    return retryAfterMs ?? step(RATE_LIMITED_RETRY_MS, failures);
  }
  return step(TRANSPORT_RETRY_MS, failures);
}

/** Which copy a run of refusals has earned so far (PRD §3.0.2). */
export function retryNotice(
  rateLimited: boolean,
  waitingMs: number,
  retryAfterMs: number | null,
): RetryNotice {
  if (!rateLimited) return "plain";
  if (retryAfterMs !== null && retryAfterMs > ACTION_COPY_WAIT_MS) {
    return "action";
  }
  if (waitingMs >= FALLBACK_AFTER_MS) return "fallback";
  if (waitingMs >= PLAIN_COPY_AFTER_MS) return "plain";
  return "silent";
}
