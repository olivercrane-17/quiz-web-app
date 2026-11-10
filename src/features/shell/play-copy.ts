/**
 * The words the play header's client parts say (`stopwatch-choice.tsx`).
 * Apart from `client-copy.ts`, whose words every tab page loads, so Today
 * never carries them. `SHELL_COPY` includes them for the design team.
 */
export const SHELL_PLAY_COPY = {
  /**
   * Said when the More menu hides the Daily's stopwatch, which otherwise
   * just vanished (RITE rounds 2 and 3, R2-29 and R3-09).
   */
  stopwatchHidden: "Stopwatch hidden. Show it again from More.",
} as const;
