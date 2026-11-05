/**
 * What Today's Daily card loads after first paint, in its own chunk, so the
 * card itself stays within its byte target (§10.9 item 2): the client boot,
 * the backend, `get_today` and the stored high-contrast setting, and for
 * the finished card the share text, built from the attempt's results as
 * the stop screen builds it (AC-SHR-11).
 */
import { getBackend, prefetchBackend } from "@/backend";
import {
  parseTimeZone,
  type AttemptId,
  type DailyTodayCard,
  type Result,
  type TimeZone,
} from "@/engine/types";
import { bootClient } from "@/features/identity";
import type { SharePayload } from "@/features/share/share-button";
import { getSiteUrl } from "@/lib/env";
import { getSettingsStore } from "@/platform/settings/store";

import { dailySharePayload } from "./share";

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

function storedHighContrast(): boolean {
  try {
    return getSettingsStore().get().highContrast;
  } catch {
    return false;
  }
}

/** What the card shows once `get_today` answers. */
export interface TodayCardData {
  card: Result<DailyTodayCard>;
  /** The stored high-contrast setting: the mini grid's glyphs (DESIGN §6.11). */
  highContrast: boolean;
}

export async function loadTodayCard(): Promise<TodayCardData> {
  await bootClient();
  const backend = await getBackend();
  const card = await backend.daily.today(deviceZone());
  return { card, highContrast: storedHighContrast() };
}

/** The finished card's Share (PRD §3.1.7): the stop screen's text, or null when the results can't load. */
export async function loadSharePayload(
  attemptId: AttemptId,
  highContrast: boolean,
): Promise<SharePayload | null> {
  await bootClient();
  const backend = await getBackend();
  const results = await backend.daily.results(attemptId);
  return results.ok
    ? dailySharePayload(results.value.attempt, {
        siteUrl: getSiteUrl(),
        highContrast,
      })
    : null;
}

/**
 * On pointerdown of Play: the first tap then only waits for start_daily
 * (§10.9 item 5). The boot goes first (§2.3), so the backend never starts
 * before the tab's identity is handed to it.
 */
export function warmDaily(): void {
  void bootClient().then(prefetchBackend);
}
