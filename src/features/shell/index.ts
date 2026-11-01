/**
 * The shell (ARCHITECTURE §2.1, DESIGN §6.13): what other features use.
 * The route-group layouts come in through `routes/`, re-exported by the
 * app's layout files. Nothing here is a "use client" module: client hooks
 * and components (`usePathParam`, `ShellParam`) come from `./client`, so a
 * route that imports this file for a server component pays no client bytes
 * for them (§2.2).
 */
export { SHELL_COPY } from "./copy";
export { LEGAL_LINKS, SiteFooter } from "./footer";
export { PagePlaceholder } from "./page-placeholder";
export { PlayFrame, type PlayFrameProps } from "./play-frame";
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
