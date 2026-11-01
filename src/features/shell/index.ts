/**
 * The shell (ARCHITECTURE §2.1, DESIGN §6.13): what other features use.
 * The route-group layouts come in through `routes/`, re-exported by the
 * app's layout files.
 */
export { SHELL_COPY } from "./copy";
export { LEGAL_LINKS, SiteFooter } from "./footer";
export { PagePlaceholder } from "./page-placeholder";
export { PlayHeader, type PlayHeaderProps } from "./play-header";
export {
  SHELL_ROUTES,
  shellPath,
  shellRewrites,
  type ShellGroup,
  type ShellRoute,
} from "./shell-routes";
export { MAIN_ID } from "./landmarks";
export { TABS, tabForPath, type ActiveTab, type TabId } from "./tabs";
export { Wordmark } from "./wordmark";
