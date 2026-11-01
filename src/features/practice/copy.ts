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
  /** Today's Practice card (DESIGN §12.1). */
  card: {
    title: "Practice",
    line: "Ten questions on anything. Works offline.",
  },
  meta: {
    run: "Practice",
    results: "Practice results",
  },
} as const;
