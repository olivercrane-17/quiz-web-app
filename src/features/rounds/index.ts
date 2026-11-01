/**
 * Round components (ARCHITECTURE §4.4.3): the contract every round
 * component takes, and the settings it reads. The components themselves
 * are client components, so they come from `./client`, never from here: a
 * route whose server code imports a barrel gets every client module the
 * barrel re-exports in its first load (§2.2).
 *
 * The rounds' words for the plugins' announcements are plain modules, so
 * they come from here: every controller that runs Mysteries and Encores
 * (the Daily, the archive, challenges) speaks a verdict the same way.
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
export { mysteryAnnouncementText } from "./mystery/copy";
