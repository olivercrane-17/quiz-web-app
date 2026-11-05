/**
 * Names the shell's frames and client islands share. A plain module, so
 * server components (the frames) read the strings themselves rather than
 * client references.
 */

/** The id every shell frame gives its `<main>`, the skip link's target. */
export const MAIN_ID = "main";

/** The top bar's title slot (`data-topbar-title` in AppHeader), which `TopBarTitle` fills. */
export const TOP_BAR_TITLE_SLOT = "[data-topbar-title]";
