/**
 * Rounds (ARCHITECTURE §3.3): what a round is before it opens, while it is
 * open, and once it resolves. Nothing here ever holds an open round's key.
 */
import type {
  AnswerType,
  CategoryId,
  ChoiceFormat,
  DifficultyBand,
} from "./content.ts";
import type { EntityId, EpochMs, ItemId } from "./ids.ts";

export const ROUND_TYPES = [
  "mc",
  "tf",
  "comparison",
  "mystery",
  "encore",
  "ordering",
] as const;
export type RoundType = (typeof ROUND_TYPES)[number];
/** ordering: reserved, no v1 content. */
export type RoundFamily = "choice" | "mystery" | "encore" | "ordering";

/** The family each round type belongs to (§4.4.1). */
export const ROUND_FAMILY: Readonly<Record<RoundType, RoundFamily>> = {
  mc: "choice",
  tf: "choice",
  comparison: "choice",
  mystery: "mystery",
  encore: "encore",
  ordering: "ordering",
};

/** One row of a Daily composition, stored with the schedule (PRD §3.1.2). */
export interface RoundSpec {
  type: RoundType;
  difficulty: DifficultyBand | null;
  contentId: ItemId;
}

/** Public facts about a round, known before it opens. Never holds the key. */
export interface RoundMeta {
  index: number;
  type: RoundType;
  difficulty: DifficultyBand | null;
  category: CategoryId | null;
  /** Mysteries: the client preloads this list at start. */
  answerType: AnswerType | null;
  /** 2 in "Mystery 2 of 3". */
  ordinal: number;
  /** 3 in "Mystery 2 of 3". */
  ofType: number;
  maxPoints: number;
  voided: boolean;
}

/** A clue-4 option. It names no entity id: pick sends the index, and the server marks guessed ones.
 *  When any of the four labels carries a descriptor, all four do (§8.8, CONTENT_GUIDE §2.10 rule 6). */
export interface OptionView {
  index: number;
  label: string;
  alreadyGuessed: boolean;
}
export interface WrongGuess {
  clue: 1 | 2 | 3;
  entityId: EntityId;
  display: string;
}

/** What the client may see while a round is open. */
export type RoundOpen =
  | {
      family: "mystery";
      index: number;
      clue: 1 | 2 | 3 | 4;
      clues: string[];
      wrongGuesses: WrongGuess[];
      options: OptionView[] | null;
      issuedAt: EpochMs;
    }
  | {
      family: "encore";
      index: number;
      question: string;
      unit: string;
      unitShort: string;
      unitLabel: string;
      valueKind: "quantity" | "year";
      decimals: 0 | 1 | 2;
      issuedAt: EpochMs;
    }
  | {
      family: "choice";
      index: number;
      format: ChoiceFormat;
      stem: string;
      options: OptionView[];
      issuedAt: EpochMs;
    };

/** What the player does. Checked on the device, judged by the plugin's judge half. */
export type RoundIntent =
  | { family: "mystery"; kind: "guess"; entityId: EntityId }
  | { family: "mystery"; kind: "next_clue" }
  | { family: "mystery"; kind: "pick"; option: number }
  | { family: "encore"; kind: "lock_in"; value: number }
  | { family: "choice"; kind: "answer"; option: number };

export interface MysteryCrowd {
  /** Whole percentages, largest remainder. */
  solvedOn: readonly [number, number, number, number];
  missed: number;
  /** Only at 5% or more. */
  topWrongGuess: { entityId: EntityId; display: string } | null;
  eligible: number;
}
export interface EncoreCrowd {
  medianGuess: number;
  bullseyeShare: number;
  closeShare: number;
  /** Bullseye, close, 15-50% off, >50% off (or years). */
  buckets: readonly [number, number, number, number];
  eligible: number;
}
export interface ChoiceCrowd {
  optionShares: number[];
  eligible: number;
}

/** relative: the symmetric error max(g, a) / min(g, a) - 1 of PRD §4.2.2, computed exactly (§4.6); years: |g - a|. */
export interface EncoreError {
  kind: "relative" | "years";
  value: number;
  /** '4% off' */
  display: string;
}
export type EncoreBand = "bullseye" | "close" | null;

export type RoundReveal =
  | {
      family: "mystery";
      answer: { entityId: EntityId; display: string };
      clues: readonly [string, string, string, string];
      solvedOn: 1 | 2 | 3 | 4 | null;
      points: number;
      pickedOption: number | null;
      explanation: string;
      learnMore: string;
      sourceLabels: string[];
      crowd: MysteryCrowd | null;
    }
  | {
      family: "encore";
      guess: number;
      answer: number;
      unit: string;
      unitShort: string;
      error: EncoreError;
      band: EncoreBand;
      explanation: string;
      learnMore: string;
      sourceLabels: string[];
      crowd: EncoreCrowd | null;
    }
  | {
      family: "choice";
      correctIndex: number;
      chosenIndex: number | null;
      correct: boolean;
      points: number;
      /** Comparisons: both checked values, in display order. */
      valueDisplay: readonly [string, string] | null;
      explanation: string;
      learnMore: string;
      crowd: ChoiceCrowd | null;
    }
  /** A voided round (PRD §3.13.4). */
  | {
      family: "withdrawn";
      round: RoundFamily;
      points: number;
      maxPoints: number;
    };

/** The judge's answer to one intent. */
export type RoundVerdict =
  /** Wrong guess or Next clue. */
  | { kind: "continue"; open: RoundOpen }
  /** The round is over. */
  | { kind: "resolved"; reveal: RoundReveal; next: RoundMeta | null };

/** What begin_round returns. A voided round never opens: it resolves at once as withdrawn,
 *  scoring a mystery's 4 points, or an encore with no error. */
export type RoundStart =
  | { kind: "open"; open: RoundOpen }
  | {
      kind: "withdrawn";
      reveal: Extract<RoundReveal, { family: "withdrawn" }>;
      next: RoundMeta | null;
    };

/** Semantic share cells. DESIGN.md maps them to glyphs (default and high-contrast sets). */
export type ShareCell =
  "passed" | "solved" | "unused" | "voided" | "correct" | "wrong";

export type RoundOutcome =
  | {
      family: "mystery";
      solvedOn: 1 | 2 | 3 | 4 | null;
      points: number;
      voided: boolean;
      category: CategoryId;
      cells: ShareCell[];
    }
  | {
      family: "encore";
      error: EncoreError | null;
      band: EncoreBand;
      voided: boolean;
    }
  | {
      family: "choice";
      correct: boolean;
      points: number;
      voided: boolean;
      answerMs: number | null;
      cells: ShareCell[];
    };

export interface ResolvedRound {
  meta: RoundMeta;
  outcome: RoundOutcome;
  reveal: RoundReveal;
}
