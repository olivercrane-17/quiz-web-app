/**
 * Local time in specs (ARCHITECTURE §11.4). A spec that cares about local
 * dates creates its context in a zone (`test.use({ timezoneId })`) and sets
 * the page clock to a wall-clock time there:
 *
 * ```ts
 * test.use({ timezoneId: "Europe/London" });
 * await setClock(page, "2026-11-01T23:59:30", "Europe/London"); // before page.goto
 * await page.clock.fastForward("03:30");                         // 00:03 the next day
 * ```
 *
 * The mock backend reads the same page clock, so server and client agree.
 */
import type { Page } from "@playwright/test";

const LOCAL =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const HOUR_MS = 3_600_000;

/** The wall-clock reading of instant `at` in `zone`, as if it were UTC, in ms. */
function wallClock(at: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  const seconds = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return seconds + (((at % 1000) + 1000) % 1000);
}

/**
 * The instant at which the wall clock in `zone` reads `local`, written
 * without an offset ("2026-11-01T23:59:30"). Safe across daylight saving:
 * a time that occurs twice resolves to the first, and a time that a
 * spring-forward skips throws.
 */
export function localInstant(local: string, zone: string): number {
  const match = LOCAL.exec(local);
  if (match === null) {
    throw new Error(
      `"${local}" is not a local date-time such as 2026-11-01T23:59:30 (no offset: the zone gives it).`,
    );
  }
  const [year, month, day, hour, minute, second = "0", ms = "0"] = match
    .slice(1)
    .map((value) => value ?? undefined) as string[];
  const wall = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(ms.padEnd(3, "0")),
  );
  let at = wall;
  for (let step = 0; step < 3; step += 1) {
    at = wall - (wallClock(at, zone) - at);
  }
  if (wallClock(at, zone) !== wall) {
    throw new Error(
      `${local} never happens in ${zone}: daylight saving skips it.`,
    );
  }
  // A fall-back hour shows the same wall time twice: take the first.
  if (wallClock(at - HOUR_MS, zone) === wall) at -= HOUR_MS;
  return at;
}

/** The UTC offsets of `zone` around `at`: two zones that agree here keep the same dates. */
function offsetsAround(at: number, zone: string): number[] {
  return [at, at - 182 * 24 * HOUR_MS, at + 182 * 24 * HOUR_MS].map(
    (instant) => wallClock(instant, zone) - instant,
  );
}

export interface SetClockOptions {
  /**
   * `install` (default): fake timers from that instant, which then run on
   * their own and answer page.clock.fastForward, runFor and pauseAt.
   * `fixed`: Date.now() stays at that instant while timers run as usual.
   */
  mode?: "install" | "fixed";
}

/**
 * Sets the page clock to the instant `local` names in `zone`, and checks
 * that the page really runs in that zone: a context's zone is fixed when it
 * is created, so a spec must ask for it with `test.use({ timezoneId })`.
 * Returns the instant, in epoch milliseconds.
 */
export async function setClock(
  page: Page,
  local: string,
  zone: string,
  options: SetClockOptions = {},
): Promise<number> {
  const at = localInstant(local, zone);
  const pageZone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  if (
    pageZone !== zone &&
    offsetsAround(at, pageZone).join() !== offsetsAround(at, zone).join()
  ) {
    throw new Error(
      `The page runs in ${pageZone}, not ${zone}. A context's zone is set when it is created: add test.use({ timezoneId: "${zone}" }) to the spec.`,
    );
  }
  if (options.mode === "fixed") {
    await page.clock.setFixedTime(at);
  } else {
    await page.clock.install({ time: at });
  }
  return at;
}
