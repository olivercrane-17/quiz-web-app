/**
 * Today's own words (DESIGN §1.4, §12.1; decisions memo §19, D18). The
 * slots keep theirs in their own features.
 */
export const HOME_COPY = {
  /** By the player's local time (DESIGN §1.4, D18). */
  greeting: {
    /** Midnight to 4:59 (D18). */
    night: "Hello.",
    morning: "Good morning.",
    afternoon: "Good afternoon.",
    evening: "Good evening.",
  },
  /** In the prerendered HTML, before the device's clock is known. */
  greetingFallback: "Hello.",
  /** Under the greeting on a first visit, what the Daily asks of you (D18). */
  firstVisit: "Name the mystery in as few clues as you can.",
} as const;
