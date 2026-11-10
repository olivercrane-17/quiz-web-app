/**
 * The device's time zone, on its own so the stop screen can read it without
 * browser.ts's imports: the round plugins and every round's UI, which would
 * land in the results route's first load (ARCHITECTURE §10.9).
 */
import { parseTimeZone, type TimeZone } from "@/engine/types";

/** The device's IANA zone (PRD §4.4.1); the server falls back for an unknown one. */
export function deviceZone(): TimeZone {
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
