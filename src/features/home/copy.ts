/**
 * Today's own words (DESIGN §1.4, §12.1). The slots keep theirs in their
 * own features.
 */
export const HOME_COPY = {
  /** By the player's local time (DESIGN §1.4). */
  greeting: {
    morning: "Good morning.",
    afternoon: "Good afternoon.",
    evening: "Good evening.",
  },
  /** In the prerendered HTML, before the device's clock is known. */
  greetingFallback: "Hello.",
} as const;
