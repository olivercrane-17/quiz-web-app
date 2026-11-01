/**
 * Content (ARCHITECTURE §3.2).
 *
 * These are the built shapes: what packs, lists, fixtures and SQL loads
 * hold, and what the engine reads. The authored source formats carry more
 * (CONTENT_GUIDE §2's fields marked +, including claims, writer notes and
 * verification) and live as zod schemas in src/content/schema/ (§5.1). The
 * build strips everything the product doesn't read.
 */
import type { CompositionId } from "./daily.ts";
import type { EntityId, ItemId, LocalDate, PackId } from "./ids.ts";
import type { RoundSpec } from "./rounds.ts";

/** The 12 categories, in display order (CONTENT_GUIDE §1). */
export const CATEGORY_IDS = [
  "geo",
  "hist",
  "sci",
  "nat",
  "film",
  "music",
  "art",
  "book",
  "sport",
  "food",
  "lang",
  "soc",
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface Category {
  id: CategoryId;
  /** 'science-tech' */
  slug: string;
  /** 'Science & Tech' */
  name: string;
  /** The share row label. */
  shortName: string;
  order: number;
}

export const DIFFICULTY_BANDS = ["easy", "medium", "hard"] as const;
export type DifficultyBand = (typeof DIFFICULTY_BANDS)[number];
export type DifficultyChoice = DifficultyBand | "mixed";
export type Region = "global" | `region:${string}`;
/** 'fast' is refused at launch (SYNTHESIS 7.8). */
export type Volatility = "evergreen" | "slow" | "dated";

export interface ItemCommon {
  id: ItemId;
  category: CategoryId;
  tags: string[];
  region: Region;
  volatility: Volatility;
  /** Required when volatility is 'slow'. */
  reviewBy: LocalDate | null;
  /** Every kind, encores included (memo §11). */
  seededDifficulty: 1 | 2 | 3 | 4 | 5;
  /** 35 words or fewer, by wordCount (§4.12). */
  explanation: string;
  /** The name searched by the "Learn more" link. */
  learnMore: string;
}

/** Estimator v0 for choice items: the share of typical adults picking the key (CONTENT_GUIDE §8.5). */
export interface PredictedRate {
  p: number;
  spread: number;
  estimator: string;
}

export const CHOICE_FORMATS = ["mc", "tf", "comparison"] as const;
export type ChoiceFormat = (typeof CHOICE_FORMATS)[number];

/** Multiple choice, true/false and comparison share one shape after the build. */
export interface ChoiceItem extends ItemCommon {
  format: ChoiceFormat;
  /** comparison: the relation's prompt, "Which came first?" */
  stem: string;
  /** mc: 3 or 4; tf: ['True', 'False']; comparison: [a, b] */
  options: string[];
  /** Index into options, in source order. */
  correct: number;
  /**
   * mc numbers and dates: ascending, by sortKey (§4.12); tf: fixed;
   * comparison: always shuffle, so the key's side never leaks.
   */
  order: "shuffle" | "ascending" | "fixed";
  /** Comparison only, in source order: ['by 1096', 'around 1325']. */
  valueDisplay: readonly [string, string] | null;
  predicted: PredictedRate;
}
export type PracticeItem = ChoiceItem;

export const ANSWER_TYPES = [
  "country",
  "city",
  "person",
  "film",
  "tv_series",
  "book",
  "animal",
  "element",
  "landmark",
  "music_artist",
  "dish",
  "sport",
] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

/**
 * Estimator v0 for mysteries. solveByClue[k - 1] is the CUMULATIVE share of typical adults who have
 * solved the mystery by clue k, so 0 <= s1 <= s2 <= s3 <= s4 <= 1 (a zod refinement), and expected
 * points are s1 + s2 + s3 + s4, because a solve on clue k earns 5 - k (CONTENT_GUIDE §8.3).
 */
export interface MysteryPrediction {
  solveByClue: readonly [number, number, number, number];
  spread: number;
  estimator: string;
}

/** Sealed. Exists on the client only in mock builds (fixtures). */
export interface MysteryContent extends ItemCommon {
  kind: "mystery";
  answerType: AnswerType;
  answer: EntityId;
  /** At most 2 genuine equivalents. */
  accepted: EntityId[];
  /** Hardest first, 140 characters or fewer (charCount). */
  clues: readonly [string, string, string, string];
  distractors: readonly [EntityId, EntityId, EntityId];
  slot: 1 | 2 | 3;
  predicted: MysteryPrediction;
  /** The reveal's sources line; may be empty. */
  sourceLabels: string[];
}

/** Estimator v0 for encores: shares inside the close band and exactly right (CONTENT_GUIDE §8.4). */
export interface EncorePrediction {
  pClose: number;
  pExact: number;
  spread: number;
  estimator: string;
}

/** Sealed. */
export interface EncoreContent extends ItemCommon {
  kind: "encore";
  question: string;
  /** The unit word, 'kilometres'; '' for years. */
  unit: string;
  /** After numbers: 'km' (may equal unit); '' for years. */
  unitShort: string;
  /** Beside the field: 'in kilometres', "times Earth's volume". */
  unitLabel: string;
  valueKind: "quantity" | "year";
  answer: number;
  decimals: 0 | 1 | 2;
  /** Relative error or years; null = defaults. */
  bands: { bullseye: number; close: number } | null;
  predicted: EncorePrediction;
  sourceLabels: string[];
}

/** Sealed multiple choice for room packs and for choice rounds in sealed compositions. Built from the
 *  CONTENT_GUIDE §2.4 source shape plus kind 'choice'; the source's predicted rate stays out of SQL. */
export interface SealedChoiceContent extends Omit<ChoiceItem, "predicted"> {
  kind: "choice";
}

/**
 * The client projection of an answer entity (§5.5). Only active entries ship, so retired and merged
 * ones are never suggested. The full record (qualifier, source, status, addedIn, wikidataId,
 * replacedBy) stays in the source file, and private.answer_entities keeps every id so old guesses resolve.
 */
export interface AnswerEntity {
  id: EntityId;
  /** 'Paris, France': what suggestions show. */
  display: string;
  /** normalizeName of the name first, then of each alias (§4.7). */
  keys: string[];
  /** Wikidata sitelink count; 0 until enrichment (ENR-1); breaks ranking ties. */
  popularity: number;
}
export interface AnswerList {
  type: AnswerType;
  version: string;
  entities: AnswerEntity[];
}

/** 15 question ids in play order. */
export interface RoomPack {
  id: PackId;
  title: string;
  theme: string;
  questionIds: ItemId[];
}

/** Challenge packs (PRD §3.6.1): the table and type exist in v1, but none is published before 30 Dailies close. */
export interface ChallengePack {
  id: PackId;
  title: string;
  theme: string;
  rounds: RoundSpec[];
  composition: CompositionId;
  maxPoints: number;
}
