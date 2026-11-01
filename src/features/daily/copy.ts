/**
 * The Daily's words (DESIGN §1.4, PRD §3.1), in one place for the design
 * team and the copy lint. Client components import the module that holds
 * their own words (`home-copy.ts`, `client-copy.ts`, `words.ts`), so no
 * island's chunk carries another's (§2.4).
 */
import {
  ANNOUNCE_COPY,
  DAILY_SCREEN_COPY,
  STOP_SCREEN_COPY,
} from "./client-copy";
import { HOME_CARD_COPY } from "./home-copy";
import { ANSWER_TYPE_WORDS, DIFFICULTY_WORDS } from "./words";

export const DAILY_COPY = {
  answerTypes: ANSWER_TYPE_WORDS,
  difficulties: DIFFICULTY_WORDS,
  homeCard: HOME_CARD_COPY,
  screen: DAILY_SCREEN_COPY,
  announce: ANNOUNCE_COPY,
  stopScreen: STOP_SCREEN_COPY,
  /** The routes' document titles. */
  metadata: {
    daily: "Today's Daily",
    results: "Your Daily results",
  },
} as const;
