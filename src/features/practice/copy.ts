/**
 * Practice's words (DESIGN §1.4, §12.1, §12.7, §12.11, PRD §3.3.1). The
 * design team edits them here and in `client-copy.ts`, which holds the
 * words client components render and which this object includes. Client
 * code imports `client-copy.ts` only, so this file never reaches a client
 * chunk.
 */
import { PRACTICE_CLIENT_COPY } from "./client-copy";

export const PRACTICE_COPY = {
  ...PRACTICE_CLIENT_COPY,
  /**
   * Today's Practice card (DESIGN §12.1). "Works offline." waits for PWA-1,
   * whose E2E proves a cold open offline (R1-15).
   */
  card: {
    title: "Practice",
    line: "Ten questions on anything.",
  },
  /**
   * The greybox hub at /practice (R1-02): its title, and the Quick play
   * card until PRA-2 builds the category grid and the difficulty control.
   */
  hub: {
    title: "Practice",
    quickPlayLine: "Ten questions on anything, at every level. Untimed.",
    later: "Choosing a category and a difficulty comes next.",
  },
  meta: {
    hub: "Practice",
    hubDescription: "Ten quick questions on anything, untimed.",
    run: "Practice",
    results: "Practice results",
  },
} as const;
