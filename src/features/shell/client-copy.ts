/**
 * The shell's words that client components render (the skip link and the
 * tab labels the active tab list draws). Kept apart from `copy.ts` so a
 * route's client chunk carries these few strings, not every shell string
 * (legal labels, the host notice, the placeholder copy). `SHELL_COPY`
 * includes them, so server code and the design team read one object; the
 * words themselves live here.
 */
export const SHELL_CLIENT_COPY = {
  skipLink: "Skip to content",
  tabs: {
    today: "Today",
    practice: "Practice",
    groups: "Groups",
    me: "Me",
  },
  /**
   * Said when the More menu hides the Daily's stopwatch, which otherwise
   * just vanished (RITE rounds 2 and 3, R2-29 and R3-09).
   */
  stopwatchHidden: "Stopwatch hidden. Show it again from More.",
} as const;
