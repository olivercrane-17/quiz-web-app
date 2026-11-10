/**
 * The Daily's public entries for other features (ARCHITECTURE §2.2): How
 * to play, which `/how-scoring-works` carries as well (PRD §3.1.3), and its
 * stopwatch sentence, which that page's total time repeats (D19); and
 * whether the stop screen shows a percentile or a player count yet, which
 * that page's "so far today" section follows (D21, R3-06).
 * Nothing re-exported here is a client module, so a server route that
 * imports this barrel adds nothing to its first load.
 */
export {
  HOW_TO_PLAY,
  STOP_SCREEN_PERCENTILE,
  STOP_SCREEN_PLAYER_COUNT,
  STOPWATCH_RULE,
  type HowToPlayPart,
} from "./how-to-play";
export { HowToPlayText, type HowToPlayTextProps } from "./how-to-play-text";
