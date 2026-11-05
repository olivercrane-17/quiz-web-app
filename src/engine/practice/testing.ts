/**
 * Test helpers for practice selection: built practice items and synthetic
 * pools with every format, so plan tests exercise the composition rules
 * (many true/false items and comparisons to say no to) and option order
 * (numbers that must sort ascending). Tests only.
 */
import { createRng } from "../rng.ts";
import type {
  CategoryId,
  ChoiceFormat,
  DifficultyBand,
  PracticeItem,
} from "../types/content.ts";
import { parseItemId, parseLocalDate, type LocalDate } from "../types/ids.ts";

export type ItemShape = ChoiceFormat | "mc_ascending";

export interface ItemSpec {
  /** 'p.geo.0001' */
  id: string;
  p: number;
  category?: CategoryId;
  shape?: ItemShape;
  tags?: string[];
  reviewBy?: string | null;
}

export function localDate(text: string): LocalDate {
  const date = parseLocalDate(text);
  if (date === null) throw new Error(`bad date ${text}`);
  return date;
}

export function practiceItem(spec: ItemSpec): PracticeItem {
  const id = parseItemId(spec.id);
  if (id === null) throw new Error(`bad item id ${spec.id}`);
  const shape = spec.shape ?? "mc";
  const common = {
    id,
    category: spec.category ?? "geo",
    tags: spec.tags ?? ["fixtures"],
    region: "global" as const,
    volatility: "evergreen" as const,
    reviewBy:
      spec.reviewBy === undefined || spec.reviewBy === null
        ? null
        : localDate(spec.reviewBy),
    seededDifficulty: 3 as const,
    explanation: `Why ${spec.id} is so.`,
    learnMore: `Topic ${spec.id}`,
    predicted: { p: spec.p, spread: 0.2, estimator: "test" },
  };
  switch (shape) {
    case "mc":
      return {
        ...common,
        format: "mc",
        stem: `Which one is right for ${spec.id}?`,
        options: ["Right", "Second", "Third", "Fourth"],
        correct: 0,
        order: "shuffle",
        valueDisplay: null,
      };
    case "mc_ascending":
      return {
        ...common,
        format: "mc",
        stem: `How far for ${spec.id}?`,
        options: ["1,250 km", "300 km", "2,400 km", "80 km"],
        correct: 0,
        order: "ascending",
        valueDisplay: null,
      };
    case "tf":
      return {
        ...common,
        format: "tf",
        stem: `${spec.id} is true.`,
        options: ["True", "False"],
        correct: 1,
        order: "fixed",
        valueDisplay: null,
      };
    case "comparison":
      return {
        ...common,
        format: "comparison",
        stem: "Which came first?",
        options: [`Older ${spec.id}`, `Newer ${spec.id}`],
        correct: 0,
        order: "shuffle",
        valueDisplay: ["by 1096", "around 1325"],
      };
  }
}

const BAND_RANGES: Readonly<Record<DifficultyBand, readonly [number, number]>> =
  {
    easy: [0.75, 0.97],
    medium: [0.45, 0.74],
    hard: [0.1, 0.44],
  };

/** Each band cycles through every shape: plenty of true/false and comparisons to refuse. */
const SHAPES: readonly ItemShape[] = ["mc", "tf", "comparison", "mc_ascending"];

export interface PoolSpec {
  categories?: readonly CategoryId[];
  perBand?: Readonly<Record<DifficultyBand, number>>;
  seed?: string;
}

/** A pool with `perBand` items per band per category, every shape mixed in. */
export function syntheticPool(spec: PoolSpec = {}): PracticeItem[] {
  const categories = spec.categories ?? ["geo", "hist", "sci"];
  const perBand = spec.perBand ?? { easy: 16, medium: 16, hard: 16 };
  const rng = createRng(spec.seed ?? "synthetic-pool");
  const items: PracticeItem[] = [];
  for (const category of categories) {
    let n = 0;
    for (const band of ["easy", "medium", "hard"] as const) {
      const [low, high] = BAND_RANGES[band];
      for (let i = 0; i < perBand[band]; i += 1) {
        n += 1;
        // Two decimals, as content stores p, so ties happen.
        const p = Math.round((low + rng.next() * (high - low)) * 100) / 100;
        items.push(
          practiceItem({
            id: `p.${category}.${String(n).padStart(4, "0")}`,
            p,
            category,
            shape: SHAPES[n % SHAPES.length],
          }),
        );
      }
    }
  }
  return items;
}
