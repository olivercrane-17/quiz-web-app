/**
 * The shell's words (DESIGN §1.4, §6.13, §10.4, §12.40, §12.42). The
 * design team edits them here, and in `client-copy.ts` for the few that
 * client components render (the skip link and the tab labels), which this
 * object includes. Client code imports `client-copy.ts` only, so this file
 * never reaches a client chunk.
 */
import { SHELL_CLIENT_COPY } from "./client-copy";

export const SHELL_COPY = {
  ...SHELL_CLIENT_COPY,
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
  settings: "Settings",
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
  /** A route whose feature has not been built yet. */
  notReady: "This part of Knewt isn't ready yet.",
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
