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
  /** The header's first line; the category name (or Mixed) sits under it. */
  practice: "Practice",
  mixed: "Mixed",
  difficulty: DIFFICULTY_WORDS,
  run: {
    /** The X in the header; only the icon shows, so this is its whole name. */
    leave: "Leave practice. Your progress is saved",
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
    failed: {
      title: "We couldn't load these questions.",
      body: "Practice works offline once a category has loaded. Try again in a moment.",
      retry: "Try again",
    },
    offline: {
      title: "This category isn't saved on your device yet.",
      body: "Connect once and it'll work offline.",
      playMixed: "Play Mixed instead",
    },
    empty: {
      title: "You've played everything here. Try Mixed.",
      playMixed: "Play Mixed",
    },
    exhausted: {
      title: (category: string) =>
        `You've played every Hard and Medium ${category} question. Try Hard Mixed?`,
      hardMixed: "Play Hard Mixed",
      repeats: "Play with repeats",
    },
  },
  results: {
    /** The page's one h1, for screen readers; the score shows large beside it. */
    heading: (score: number, max: number) =>
      `Practice done. ${score} out of ${max}.`,
    outOf: (max: number) => `out of ${max}`,
    questions: "Your questions",
    question: (n: number) => `Question ${n}`,
    right: "Right",
    wrong: "Not quite",
    answer: (text: string) => `Answer: ${text}`,
    yourAnswer: (text: string) => `You chose ${text}`,
    why: "Why",
    withdrawn: "This question is no longer in the pack.",
    playAgain: "Play again",
    close: "Close and go to Today",
    loading: "Loading your results",
    none: {
      title: "No practice results yet.",
      body: "Ten questions on anything. Works offline.",
    },
    failed: "We couldn't load the questions for these results.",
  },
} as const;
