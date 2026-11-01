/**
 * Round components (ARCHITECTURE §4.4.3): the screens that run rounds
 * (the Daily, practice, challenges, rooms, quizzes) render them from the
 * registry with the contract's props.
 */
export {
  playSettingsFrom,
  type AnswerListHandle,
  type PlaySettings,
  type RoundComponent,
  type RoundComponentProps,
  type Suggestion,
} from "./contracts";
export {
  ROUND_COMPONENTS,
  roundComponentFor,
  type PlayableFamily,
} from "./registry";
