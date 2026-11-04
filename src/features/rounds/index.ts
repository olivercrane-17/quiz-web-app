/**
 * Round components (ARCHITECTURE §4.4.3): the contract every round
 * component takes, and the settings it reads. The components themselves
 * are client components, so they come from `./client`, never from here: a
 * route whose server code imports a barrel gets every client module the
 * barrel re-exports in its first load (§2.2).
 *
 * The rounds' words for the plugins' announcements are plain modules, so
 * they come from here: every controller that runs Mysteries and Encores
 * (the Daily, the archive, challenges) speaks a verdict the same way. So do
 * D10's stamps: `mysteryMissed` tells a controller whether a round showed a
 * miss before its solve, which `mysteryAnnouncementText` and `solvedStamp`
 * take, so a solve after a miss reads "Got there.", never "Knew it.".
 *
 * `focusReveal` is how a screen moves focus to a reveal it draws or finds:
 * the heading takes focus without the browser's scroll, and the reveal's
 * card then starts just below the sticky header (R1-12), as the rounds' own
 * reveals do.
 */
export {
  playSettingsFrom,
  type AnswerListHandle,
  type PlaySettings,
  type RoundComponent,
  type RoundComponentProps,
  type Suggestion,
} from "./contracts";
export { encoreAnnouncementText } from "./encore/copy";
export {
  mysteryAnnouncementText,
  mysteryMissed,
  solvedStamp,
} from "./mystery/copy";
export { focusReveal } from "./viewport";
