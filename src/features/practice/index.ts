/**
 * Practice (ARCHITECTURE §2.1, PRD §3.3): what other features use. A run
 * starts by leaving its request in session storage and opening
 * /practice/run (§1.4 item 10). Nothing here is a "use client" module: the
 * Quick play link comes from `./client`, so a server route that imports
 * this file pays no client bytes for it (§2.2).
 */
export {
  PRACTICE_INTENT_KEY,
  QUICK_PLAY_INTENT,
  writePracticeIntent,
  type PracticeIntent,
} from "./intent";
export { PRACTICE_COPY } from "./copy";
