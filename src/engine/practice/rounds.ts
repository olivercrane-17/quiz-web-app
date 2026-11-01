/**
 * From a practice plan to a local run (ARCHITECTURE §4.5, §4.8): the round
 * metadata the run machine walks, the run config, and the judge context a
 * round opens and is judged with.
 *
 * A local run's option order comes from its own seed: round `n` shuffles
 * with `createRng(seed).fork('round:<n>')`, so reopening a round after a
 * reload rebuilds exactly the order the player saw (§4.2).
 */
import { createRng, type Rng } from "../rng.ts";
import type { JudgeContext } from "../rounds/types.ts";
import type { PracticeItem } from "../types/content.ts";
import type { EpochMs } from "../types/ids.ts";
import type { RoundMeta } from "../types/rounds.ts";
import type { RunConfig, RunMode } from "../types/runs.ts";
import { DEFAULT_PRACTICE_BANDS, difficultyBandOf } from "./bands.ts";
import type { PracticeBands } from "./types.ts";

/** One RoundMeta per item: "Question 4 of 10 · Medium", 1 point each. */
export function practiceRoundMetas(
  items: readonly PracticeItem[],
  bands: PracticeBands = DEFAULT_PRACTICE_BANDS,
): RoundMeta[] {
  return items.map((item, index) => ({
    index,
    type: item.format,
    difficulty: difficultyBandOf(item.predicted.p, bands),
    category: item.category,
    answerType: null,
    ordinal: index + 1,
    ofType: items.length,
    maxPoints: 1,
    voided: false,
  }));
}

export interface PracticeRunConfigInput {
  /** A local UUID; also the run's seed. */
  runId: string;
  items: readonly PracticeItem[];
  bands?: PracticeBands;
  /** 'practice' unless a later mode (review, solo quiz) reuses the shape. */
  mode?: RunMode;
}

/** Ten fixed rounds, untimed, 1 point each, judged on the device (PRD §3.3.1). */
export function practiceRunConfig(input: PracticeRunConfigInput): RunConfig {
  return {
    mode: input.mode ?? "practice",
    sealed: false,
    rounds: practiceRoundMetas(input.items, input.bands),
    endRule: { kind: "fixed" },
    timing: { kind: "untimed" },
    scoring: "practice",
    seed: input.runId,
    runId: input.runId,
  };
}

/** The rng round `index` of a local run opens with. */
export function practiceRoundRng(seed: string, index: number): Rng {
  return createRng(seed).fork(`round:${index}`);
}

/** What the choice plugin's judge half reads for round `index` of a local run. */
export function practiceJudgeContext(
  seed: string,
  index: number,
  at: EpochMs,
): JudgeContext {
  return {
    at,
    rng: practiceRoundRng(seed, index),
    shuffle: null,
    optionsFromClue: 4,
    entities: null,
  };
}
