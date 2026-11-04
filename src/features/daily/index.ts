/**
 * The Daily's public entries for other features (ARCHITECTURE §2.2): How
 * to play, which `/how-scoring-works` carries as well (PRD §3.1.3), and the
 * greybox toast (DESIGN §6.9) that the Share button confirms a copy with
 * until DS-1's `src/ui/toast.ts` replaces it. Nothing re-exported here is a
 * client module, so a server route that imports this barrel adds nothing
 * to its first load.
 */
export { HOW_TO_PLAY, type HowToPlayPart } from "./how-to-play";
export { HowToPlayText, type HowToPlayTextProps } from "./how-to-play-text";
export { showToast } from "./toast";
