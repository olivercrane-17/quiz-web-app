/**
 * Content types (ARCHITECTURE §2.1, §3.2): the built shapes the product
 * reads, re-exported from the engine so features import content types from
 * one place. The authored source formats are zod schemas in
 * src/content/schema/, which only scripts and tests import.
 */
import type { CategoryId, PracticeItem } from "@/engine/types";

export {
  ANSWER_TYPES,
  CATEGORY_IDS,
  CHOICE_FORMATS,
  DIFFICULTY_BANDS,
} from "@/engine/types";
export type {
  AnswerEntity,
  AnswerList,
  AnswerType,
  Category,
  CategoryId,
  ChallengePack,
  ChoiceFormat,
  ChoiceItem,
  DifficultyBand,
  DifficultyChoice,
  EncoreContent,
  EncorePrediction,
  ItemCommon,
  MysteryContent,
  MysteryPrediction,
  PracticeItem,
  PredictedRate,
  Region,
  RoomPack,
  RoundSpec,
  SealedChoiceContent,
  Volatility,
} from "@/engine/types";

/** A practice pack as the build ships it (§5.3). */
export interface PracticePack {
  category: CategoryId;
  version: string;
  items: PracticeItem[];
}

/** What a loader answers: the content, or why it couldn't be had. */
export type LoadResult<T> =
  { ok: true; value: T } | { ok: false; error: LoadError };

/**
 * offline: never cached and no network ("This category isn't saved on your
 * device yet..."); not_found: nothing ships under that name; failed: a
 * fetch or decode error ("We couldn't load these questions.", with Retry).
 */
export type LoadError = "offline" | "not_found" | "failed";
