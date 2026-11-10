/**
 * The shell's words (DESIGN §1.4, §6.13, §10.4, §12.40, §12.42). The
 * design team edits them here, and in `client-copy.ts` for the few that
 * client components render (the skip link and the tab labels) and in
 * `play-copy.ts` for the play header's, which this object includes. Client code imports `client-copy.ts` only, so this file
 * never reaches a client chunk.
 */
import { SHELL_CLIENT_COPY } from "./client-copy";
import { SHELL_PLAY_COPY } from "./play-copy";

/** The top bar's gear and the page it opens (PRD §6.1). */
const SETTINGS = "Settings";

export const SHELL_COPY = {
  ...SHELL_CLIENT_COPY,
  ...SHELL_PLAY_COPY,
  /** The product name (DESIGN §0.2). */
  brand: "Knewt",
  /**
   * The site's description for search results and link previews; it names
   * the product, because a preview may show it without the title (R1-20).
   */
  description:
    "Knewt is a daily trivia game: three Mysteries and an Encore. How few clues do you need?",
  /** The tab bar's landmark name. */
  mainNav: "Main",
  settings: SETTINGS,
  /** The footer's landmark name. */
  footerNav: "About Knewt",
  /** The seven legal and trust pages (PRD §3.14), in DESIGN's footer order. */
  legal: {
    howScoringWorks: "How scoring works",
    aboutOurQuestions: "About our questions",
    privacy: "Privacy",
    terms: "Terms",
    contentPolicy: "Content policy",
    accessibility: "Accessibility",
    credits: "Credits",
  },
  /** The host layout under 1024 by 576 (DESIGN §10.4). */
  hostTooSmall:
    "This screen is made for a TV or a big monitor. Make the window bigger, or open Knewt on your phone to play.",
  /**
   * A route whose feature has not been built yet, and has no line of its
   * own in `comingSoon`.
   */
  notReady: "This part of Knewt isn't ready yet.",
  /**
   * The line a placeholder destination shows in place of `notReady`, by
   * its title (RITE round 2, R2-07): what's coming there, and what already
   * works. Groups (GRP-1), Me (STA-1) and Settings (SET-1) are the
   * destinations the shell draws that are still placeholders; the seven
   * footer pages are LGL-1's real pages. The rest are the per-user shells
   * (ARCHITECTURE §10.1) that a link opens once its feature ships: a
   * group's board, a challenge, a room, a shared quiz. Each key is the
   * title its stub passes. Once a feature replaces its stub, the line is
   * left over and harmless, and the DS owner removes it: the building
   * ticket needn't touch src/features/shell (memo §22).
   */
  comingSoon: {
    [SHELL_CLIENT_COPY.tabs.groups]:
      "Groups are on the way. Until then, paste your result into your group chat.",
    [SHELL_CLIENT_COPY.tabs.me]: "Your streak and past results will live here.",
    [SETTINGS]:
      "Settings are on the way. Hide stopwatch is in the Daily's menu.",
    "Group board":
      "Group boards come with Groups. Until then, compare results in your group chat.",
    "Group invite":
      "Group invites are on the way. Until then, play today's Daily and share your result.",
    "Group settings":
      "Group settings come with Groups. Until then, today's Daily is ready to play.",
    Challenge:
      "Challenges are on the way. Until then, send a friend your Daily result.",
    "Challenge play":
      "Playing a friend's challenge is on the way. Until then, try today's Daily.",
    "Head-to-head":
      "Head-to-head results come with challenges. Until then, compare Daily results in your chat.",
    "Edit quiz":
      "Making your own quiz is on the way. Until then, try Quick play in Practice.",
    "Shared quiz":
      "Shared quizzes are on the way. Until then, Quick play in Practice is ready.",
    "Shared quiz play":
      "Playing a shared quiz is on the way. Until then, today's Daily is ready.",
    "Shared quiz result":
      "Shared quiz results are on the way. Your Daily result is on Today.",
    Room: "Rooms are on the way. Until then, play today's Daily on your phone.",
    "Joining a room":
      "Joining a room is on the way. Until then, Practice has Quick play.",
    "Host screen":
      "Hosting on a big screen is on the way. Until then, play today's Daily on your phone or computer.",
  },
  goToToday: "Go to Today",
  /** Leave on a play screen that isn't built yet; the X shows this as its name. */
  leaveToToday: "Leave and go to Today",
  /** The not-found page (DESIGN §1.4, §12.42), with the one smile it allows. */
  notFound: {
    /** The page's title: "Page not found · Knewt". */
    title: "Page not found",
    heading: "We couldn't find that page.",
    smile: "Even the newt can't find it.",
    goToToday: "Go to Today",
    practice: "Practice",
  },
} as const;
