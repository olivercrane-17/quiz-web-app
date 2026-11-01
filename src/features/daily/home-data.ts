/**
 * What Today's Daily card loads after first paint, in its own chunk, so the
 * card itself stays within its byte target (§10.9 item 2): the client boot,
 * the backend and `get_today`.
 */
import { getBackend, prefetchBackend } from "@/backend";
import {
  parseTimeZone,
  type DailyTodayCard,
  type Result,
  type TimeZone,
} from "@/engine/types";
import { bootClient } from "@/features/identity";

function deviceZone(): TimeZone {
  try {
    const zone = parseTimeZone(
      new Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    if (zone !== null) return zone;
  } catch {
    // Fall through to UTC.
  }
  return parseTimeZone("UTC") as TimeZone;
}

export async function loadTodayCard(): Promise<Result<DailyTodayCard>> {
  await bootClient();
  const backend = await getBackend();
  return backend.daily.today(deviceZone());
}

/** On pointerdown of Play: the first tap then only waits for start_daily (§10.9 item 5). */
export function warmDaily(): void {
  prefetchBackend();
}
