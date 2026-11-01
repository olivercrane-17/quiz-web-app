/**
 * The shell's words (DESIGN §1.4, §6.13, §10.4, §12.40). The design team
 * edits them here.
 */
export const SHELL_COPY = {
  /** The product name (DESIGN §0.2). */
  brand: "Knewt",
  skipLink: "Skip to content",
  /** The tab bar's landmark name. */
  mainNav: "Main",
  tabs: {
    today: "Today",
    practice: "Practice",
    groups: "Groups",
    me: "Me",
  },
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
} as const;
