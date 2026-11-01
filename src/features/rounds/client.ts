/**
 * The round components, for the client islands that run rounds (§4.4.3).
 *
 * Screens that mix families (the Daily, challenges, rooms, quizzes) render
 * from the registry. Screens that only ever show one family import that
 * component alone, so their route never carries the others: practice,
 * Blitz, Survival and review use `ChoiceRound`, and through the registry
 * /practice/run (180 kB budget) would also ship MYS-1's combobox and the
 * Encore input. A client island that imports one export from here gets
 * only that module (unused exports are dropped from client chunks); confirm
 * the split with check:bundle once PRA-1 and MYS-1 merge. The family files
 * stay owned by PRA-1 and MYS-1.
 */
export { ChoiceRound } from "./choice";
export { EncoreRound } from "./encore";
export { MysteryRound } from "./mystery";
export {
  ROUND_COMPONENTS,
  roundComponentFor,
  type PlayableFamily,
} from "./registry";
