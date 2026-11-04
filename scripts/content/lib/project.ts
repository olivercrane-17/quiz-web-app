/**
 * Source to built (ARCHITECTURE §3.2, §5.1.1, §5.5): the conversions the
 * content build makes, as plain JSON values. Every source-only field is
 * dropped (status, counterintuitive, claims, writerNotes, lintAllow,
 * selfCheck, verification; a comparison's relation, measure, unit, values
 * and exactDates; tfKind; a mystery's likelyGuesses, rivals, giveawayTerms
 * and seedSolveShares; an encore's derivation). Multiple choice `answer`
 * and `wrong` become `options` and `correct` (the answer first, in source
 * order), true/false options are fixed as True, False, and comparisons
 * always shuffle. Answer lists become the client projection of §5.5, with
 * keys from the engine's own normalizeName.
 *
 * The browser decoders in src/content/loaders/ read exactly these shapes.
 */
import type {
  AnswerEntity as SourceEntity,
  AnswerList as SourceList,
} from "../../../src/content/schema/answer-lists.ts";
import type {
  Encore,
  Mystery,
  PracticeItem,
  RoomQuestion,
} from "../../../src/content/schema/items.ts";
import type { AnswerType } from "../../../src/content/schema/primitives.ts";
import { normalizeName } from "../../../src/engine/suggest/normalize.ts";

/** A problem that keeps one item or list out of the build. */
export class ProjectionError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(message);
    this.name = "ProjectionError";
    this.path = path;
  }
}

export interface BuiltCommon {
  id: string;
  category: string;
  tags: string[];
  region: string;
  volatility: string;
  reviewBy: string | null;
  seededDifficulty: number;
  explanation: string;
  learnMore: string;
}

export interface BuiltPredictedRate {
  p: number;
  spread: number;
  estimator: string;
}

/** ARCHITECTURE §3.2 ChoiceItem (practice packs). */
export interface BuiltChoiceItem extends BuiltCommon {
  format: "mc" | "tf" | "comparison";
  stem: string;
  options: string[];
  correct: number;
  order: "shuffle" | "ascending" | "fixed";
  valueDisplay: [string, string] | null;
  predicted: BuiltPredictedRate;
}

/** ARCHITECTURE §3.2 SealedChoiceContent (room packs, a Daily's choice rounds). */
export interface BuiltSealedChoice extends BuiltCommon {
  kind: "choice";
  format: "mc";
  stem: string;
  options: string[];
  correct: number;
  order: "shuffle" | "ascending";
  valueDisplay: null;
}

/** ARCHITECTURE §3.2 MysteryContent. */
export interface BuiltMystery extends BuiltCommon {
  kind: "mystery";
  answerType: string;
  answer: string;
  accepted: string[];
  clues: [string, string, string, string];
  distractors: [string, string, string];
  slot: number;
  predicted: {
    solveByClue: [number, number, number, number];
    spread: number;
    estimator: string;
  };
  sourceLabels: string[];
}

/** ARCHITECTURE §3.2 EncoreContent. */
export interface BuiltEncore extends BuiltCommon {
  kind: "encore";
  question: string;
  unit: string;
  unitShort: string;
  unitLabel: string;
  valueKind: "quantity" | "year";
  answer: number;
  decimals: number;
  bands: { bullseye: number; close: number } | null;
  predicted: {
    pClose: number;
    pExact: number;
    spread: number;
    estimator: string;
  };
  sourceLabels: string[];
}

/** One shipped list entry: `[id, display, keys, popularity]` (§5.5). */
export type ListTuple = [string, string, string[], number];

/** A shipped list file (§5.3): the client projection, active entries only. */
export interface BuiltList {
  type: AnswerType;
  version: string;
  entities: ListTuple[];
}

interface CommonSource {
  id: string;
  category: string;
  tags: readonly string[];
  region: string;
  volatility: string;
  reviewBy: string | null;
  seededDifficulty: number;
  explanation: string;
  learnMore: string;
}

function common(item: CommonSource): BuiltCommon {
  return {
    id: item.id,
    category: item.category,
    tags: [...item.tags],
    region: item.region,
    volatility: item.volatility,
    reviewBy: item.reviewBy,
    seededDifficulty: item.seededDifficulty,
    explanation: item.explanation,
    learnMore: item.learnMore,
  };
}

function requirePredicted<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new ProjectionError(
      "predicted",
      "no predicted values: an item ships only with the estimator's output (§8.5)",
    );
  }
  return value;
}

/** A practice item (mc, tf or comparison) as a built ChoiceItem. */
export function projectPracticeItem(item: PracticeItem): BuiltChoiceItem {
  const predicted = requirePredicted(item.predicted);
  const base = common(item);
  const rate: BuiltPredictedRate = {
    p: predicted.p,
    spread: predicted.spread,
    estimator: predicted.estimator,
  };
  if (item.format === "mc") {
    return {
      ...base,
      format: "mc",
      stem: item.stem,
      options: [item.answer, ...item.wrong],
      correct: 0,
      order: item.order,
      valueDisplay: null,
      predicted: rate,
    };
  }
  if (item.format === "tf") {
    return {
      ...base,
      format: "tf",
      stem: item.stem,
      options: ["True", "False"],
      correct: item.answer ? 0 : 1,
      order: "fixed",
      valueDisplay: null,
      predicted: rate,
    };
  }
  return {
    ...base,
    format: "comparison",
    stem: item.stem,
    options: [item.a, item.b],
    correct: item.answer === "a" ? 0 : 1,
    order: "shuffle",
    valueDisplay: [item.valueDisplay.a, item.valueDisplay.b],
    predicted: rate,
  };
}

/** A room-pack question (or a Daily's sealed choice round): `predicted` stays out. */
export function projectSealedChoice(item: RoomQuestion): BuiltSealedChoice {
  return {
    ...common(item),
    kind: "choice",
    format: "mc",
    stem: item.stem,
    options: [item.answer, ...item.wrong],
    correct: 0,
    order: item.order,
    valueDisplay: null,
  };
}

export function projectMystery(item: Mystery): BuiltMystery {
  const predicted = requirePredicted(item.predicted);
  const [c1, c2, c3, c4] = item.clues;
  const [d1, d2, d3] = item.distractors;
  const [s1, s2, s3, s4] = predicted.solveByClue;
  return {
    ...common(item),
    kind: "mystery",
    answerType: item.answerType,
    answer: item.answer,
    accepted: [...item.accepted],
    clues: [c1, c2, c3, c4],
    distractors: [d1, d2, d3],
    slot: item.slot,
    predicted: {
      solveByClue: [s1, s2, s3, s4],
      spread: predicted.spread,
      estimator: predicted.estimator,
    },
    sourceLabels: [...item.sourceLabels],
  };
}

export function projectEncore(item: Encore): BuiltEncore {
  const predicted = requirePredicted(item.predicted);
  if (item.unitShort === undefined || item.unitLabel === undefined) {
    throw new ProjectionError(
      item.unitShort === undefined ? "unitShort" : "unitLabel",
      "an encore ships with unitShort and unitLabel (ARCHITECTURE §5.2)",
    );
  }
  return {
    ...common(item),
    kind: "encore",
    question: item.question,
    unit: item.unit,
    unitShort: item.unitShort,
    unitLabel: item.unitLabel,
    valueKind: item.valueKind,
    answer: item.answer,
    decimals: item.decimals,
    bands:
      item.bands === null
        ? null
        : { bullseye: item.bands.bullseye, close: item.bands.close },
    predicted: {
      pClose: predicted.pClose,
      pExact: predicted.pExact,
      spread: predicted.spread,
      estimator: predicted.estimator,
    },
    sourceLabels: [...item.sourceLabels],
  };
}

/** The types whose entries carry a descriptor (§5.5, CONTENT_GUIDE §2.10). */
export const DESCRIBED_TYPES: ReadonlySet<AnswerType> = new Set([
  "person",
  "tv_series",
  "music_artist",
]);

/** An entry the client may suggest: active, and not merged into another (§5.5). */
export function isShippedEntity(entity: SourceEntity): boolean {
  return (
    entity.status === "active" &&
    (entity.replacedBy === undefined || entity.replacedBy === null)
  );
}

/** `normalizeName` of the name, then of each alias, deduplicated, empties dropped. */
export function entityKeys(entity: Pick<SourceEntity, "name" | "aliases">) {
  const keys: string[] = [];
  for (const name of [entity.name, ...entity.aliases]) {
    const key = normalizeName(name);
    if (key !== "" && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * The clue-4 option label (§5.5): "Name (descriptor)" for the types that
 * carry a descriptor, the display everywhere else.
 */
export function optionLabelOf(type: AnswerType, entity: SourceEntity): string {
  if (!DESCRIBED_TYPES.has(type)) return entity.display;
  const descriptor = entity.qualifier.descriptor;
  if (typeof descriptor !== "string" || descriptor === "") {
    throw new ProjectionError(
      "qualifier.descriptor",
      `a ${type} entry carries a descriptor (§5.5)`,
    );
  }
  return `${entity.name} (${descriptor})`;
}

/** The client projection of one list (§5.5): active, unreplaced entries, in file order. */
export function projectList(
  type: AnswerType,
  version: string,
  entities: Iterable<SourceEntity>,
): BuiltList {
  const tuples: ListTuple[] = [];
  for (const entity of entities) {
    if (!isShippedEntity(entity)) continue;
    tuples.push([
      entity.id,
      entity.display,
      entityKeys(entity),
      entity.popularity,
    ]);
  }
  return { type, version, entities: tuples };
}

/** Re-export for callers that hold a whole source list. */
export function projectSourceList(list: SourceList): BuiltList {
  return projectList(list.type, list.version, list.entities);
}
