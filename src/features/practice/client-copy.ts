/**
 * The practice words that client components render (DESIGN §1.4, §12.7,
 * §12.11, PRD §3.3.1): the run and results screens and the Quick play
 * link. `copy.ts` includes them, so the design team reads one object; the
 * words live here, so a route's client chunk carries only these.
 */
import type { DifficultyChoice } from "@/engine/types";

const DIFFICULTY_WORDS: Readonly<Record<DifficultyChoice, string>> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  mixed: "Mixed",
};

export const PRACTICE_CLIENT_COPY = {
  quickPlay: "Quick play",
  /**
   * Quick play's label while a run is open, which it then carries on
   * rather than starting another (R1-36): "Continue practice · 3 of 10".
   */
  continuePractice: (question: number, total: number) =>
    `Continue practice · ${question} of ${total}`,
  /** The header's first line; the category name (or Mixed) sits under it. */
  practice: "Practice",
  mixed: "Mixed",
  difficulty: DIFFICULTY_WORDS,
  run: {
    /** The X in the header; only the icon shows, so this is its whole name. */
    leave: "Leave practice",
    loading: "Loading your questions",
    progress: (question: number, total: number, right: number, wrong: number) =>
      `Question ${question} of ${total}. ${right} right, ${wrong} wrong so far.`,
    segment: {
      right: (n: number) => `Question ${n}, right`,
      wrong: (n: number) => `Question ${n}, not quite`,
      current: (n: number) => `Question ${n}, playing now`,
      upcoming: (n: number) => `Question ${n}, still to come`,
    },
    nextQuestion: "Next question",
    seeResults: "See your results",
    /** Shown once above question 1 (DESIGN §12.7). `area` reads "Hard Geography questions" or "practice questions". */
    notes: {
      repeats: (area: string) =>
        `You've seen most ${area}, so a few repeats are mixed in.`,
      hardFilled: (category: string | null) =>
        `You've played every Hard ${category === null ? "" : `${category} `}question. Here are the toughest ones left.`,
    },
    /**
     * No promise about offline play here, or on the Practice card, until
     * PWA-1's precache proves it (R1-15); PWA-1 brings back PRD §3.3.1's
     * "Connect once and it'll work offline."
     */
    failed: {
      title: "We couldn't load these questions.",
      body: "Try again in a moment.",
      retry: "Try again",
    },
    offline: {
      title: "This category isn't saved on your device yet.",
      body: "Connect to the internet to play it.",
      playMixed: "Play Mixed instead",
    },
    empty: {
      title: "You've played everything here. Try Mixed.",
      playMixed: "Play Mixed",
    },
    exhausted: {
      title: (category: string) =>
        `You've played every Hard and Medium ${category} question. Try Hard Mixed?`,
      /** A Mixed request is Hard Mixed already, so it offers repeats only. */
      titleMixed: "You've played every Hard and Medium question.",
      hardMixed: "Play Hard Mixed",
      repeats: "Play with repeats",
    },
  },
  results: {
    /**
     * The page's one h1, which takes focus when the results arrive. Screen
     * readers hear this; the eye sees the score large in the same heading.
     */
    heading: (score: number, max: number) =>
      `Practice done. ${score} out of ${max}.`,
    done: "Practice done.",
    outOf: (max: number) => `out of ${max}`,
    questions: "Your questions",
    question: (n: number) => `Question ${n}`,
    /** A row's first line: its number and a short stem (D13). */
    numbered: (n: number, text: string) => `${n}. ${text}`,
    right: "Right",
    wrong: "Not quite",
    answer: (text: string) => `Answer: ${text}`,
    /** On a miss, the pick, as it reads mid-sentence (D13, R1-25). */
    yourAnswer: (text: string) => `You chose ${text}`,
    /** The open-me hint at the end of each row's summary. */
    why: "Why",
    withdrawn: "This question is no longer in the pack.",
    playAgain: "Play again",
    close: "Close and go to Today",
    loading: "Loading your results",
    none: {
      title: "No practice results yet.",
      body: "Ten questions on anything.",
    },
    failed: "We couldn't load the questions for these results.",
  },
} as const;
