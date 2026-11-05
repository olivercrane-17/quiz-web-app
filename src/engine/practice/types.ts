/**
 * Practice selection types (ARCHITECTURE §4.8, PRD §3.3).
 *
 * `PracticeRequest` and `PracticePlan` are §4.8's contract, plus one
 * optional field, `repeats`, which carries the player's "Play with repeats"
 * answer after a short Hard filter ran out (PRD §3.3.1, AC-PRA-14): without
 * it, a Hard run never serves a repeat.
 */
import type {
  CategoryId,
  DifficultyBand,
  DifficultyChoice,
  PracticeItem,
} from "../types/content.ts";
import type { ItemId, LocalDate } from "../types/ids.ts";

/** A local calendar day as a number: whole days since 1970-01-01 (see ./seen.ts). */
export type DayNumber = number;

/** Item id to the day number it was last seen on this device (`qz:practice`, PRA-2). */
export type SeenIndex = ReadonlyMap<ItemId, DayNumber>;

export type PracticeMode =
  "quick" | "category" | "blitz" | "survival" | "review" | "pack";

export interface PracticeRequest {
  mode: PracticeMode;
  category: CategoryId | "mixed";
  /** 'ramp': Survival's Easy, then Medium, then Hard by position. */
  difficulty: DifficultyChoice | "ramp";
  /** 10 for practice; stream modes ignore it. */
  length: number;
  seed: string;
  /** The device's local date, for freshness and `reviewBy`. */
  today: LocalDate;
  seen: SeenIndex;
  /** Pulled items (PRD §3.13): never served (AC-PRA-07). */
  denylist: ReadonlySet<ItemId>;
  /** Reserved: adaptive Mixed (F-ADP) is Later (PRD §3.3.3). */
  ability: null;
  /** Monthly pack (F-PCK): items carrying at least one of these tags. */
  tags?: string[];
  /**
   * The player chose "Play with repeats" after a short Hard filter ran out
   * (PRD §3.3.1). Only Hard runs read it; other bands mix repeats in on
   * their own, with the repeats note.
   */
  repeats?: boolean;
}

/**
 * - `repeats_mixed_in`: the run holds items seen in the last 60 days, the
 *   least recently seen first (AC-PRA-06).
 * - `pool_exhausted`: even with repeats the filter can't fill the run; it
 *   is shorter, possibly empty ("You've played everything here. Try Mixed.").
 * - `hard_filled`: a short Hard filter was filled with the hardest unseen
 *   Medium items of the same filter (AC-PRA-14).
 * - `hard_exhausted`: those ran out too; the plan holds no items, so the
 *   setup can offer Hard Mixed before any repeat (AC-PRA-14).
 */
export type PracticeNote =
  "repeats_mixed_in" | "pool_exhausted" | "hard_filled" | "hard_exhausted";

export interface PracticePlan {
  items: PracticeItem[];
  notes: PracticeNote[];
}

/** Bands by predicted correct rate p (PRD §3.3.3, tunable). */
export interface PracticeBands {
  /** Easy is p >= easyMinP. */
  easyMinP: number;
  /** Hard is p < hardMaxP; Medium is everything between. */
  hardMaxP: number;
}

/** Survival's ramp (PRD §3.3.6, tunable): Easy through question 5, Medium through 12, then Hard. */
export interface PracticeRamp {
  easyThrough: number;
  mediumThrough: number;
}

/** The tunables a plan reads; the engine's defaults match src/config/tunables.ts. */
export interface PlanOptions {
  bands?: PracticeBands;
  ramp?: PracticeRamp;
}

export type { DifficultyBand };
