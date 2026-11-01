/**
 * Round components (ARCHITECTURE §4.4.3): the contract every round
 * component takes, and the settings it reads. The components themselves
 * are client components, so they come from `./client`, never from here: a
 * route whose server code imports a barrel gets every client module the
 * barrel re-exports in its first load (§2.2).
 */
export {
  playSettingsFrom,
  type AnswerListHandle,
  type PlaySettings,
  type RoundComponent,
  type RoundComponentProps,
  type Suggestion,
} from "./contracts";
