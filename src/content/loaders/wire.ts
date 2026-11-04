/**
 * Decoders for what the content build ships (ARCHITECTURE §5.3): practice
 * packs (`{ category, version, items: ChoiceItem[] }`) and answer lists as
 * compact tuples (`[id, display, keys, popularity]`, §5.5), whether they
 * arrive from the CDN or from the fixture world's module, plus a Daily's
 * sealed choice rounds for the mock.
 *
 * Hand-written and zod-free, because the browser runs them (§10.9). A
 * fetched file can be corrupt or from another deploy, so every field the
 * built shape needs is checked; a failure throws WireError and the loader
 * answers `failed`. Ids become branded only through the engine's parse
 * helpers (§3.1).
 */
import {
  ANSWER_TYPES,
  CATEGORY_IDS,
  parseEntityId,
  parseItemId,
  parseLocalDate,
  type AnswerEntity,
  type AnswerList,
  type AnswerType,
  type CategoryId,
  type ChoiceItem,
  type ItemCommon,
  type PredictedRate,
  type Region,
  type SealedChoiceContent,
} from "@/engine/types";

import type { PracticePack } from "../types";

export class WireError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "WireError";
    this.path = path;
  }
}

type Obj = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new WireError(path, message);
}

function object(value: unknown, path: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  return value as Obj;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}

function string(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value === "")) {
    fail(path, allowEmpty ? "must be a string" : "must be a non-empty string");
  }
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "must be a number");
  }
  return value;
}

function strings(value: unknown, path: string): string[] {
  return array(value, path).map((entry, i) => string(entry, `${path}[${i}]`));
}

function oneOf<T extends string>(
  value: unknown,
  path: string,
  values: readonly T[],
): T {
  if (
    typeof value !== "string" ||
    !(values as readonly string[]).includes(value)
  ) {
    fail(path, `must be one of ${values.join(", ")}`);
  }
  return value as T;
}

function common(o: Obj, path: string): ItemCommon {
  const id = parseItemId(o.id) ?? fail(`${path}.id`, "is not an item id");
  const region = string(o.region, `${path}.region`);
  if (region !== "global" && !/^region:[a-z0-9-]+$/.test(region)) {
    fail(`${path}.region`, "must be global or region:<code>");
  }
  const seeded = o.seededDifficulty;
  if (
    seeded !== 1 &&
    seeded !== 2 &&
    seeded !== 3 &&
    seeded !== 4 &&
    seeded !== 5
  ) {
    fail(`${path}.seededDifficulty`, "must be 1 to 5");
  }
  return {
    id,
    category: oneOf(o.category, `${path}.category`, CATEGORY_IDS),
    tags: strings(o.tags, `${path}.tags`),
    region: region as Region,
    volatility: oneOf(o.volatility, `${path}.volatility`, [
      "evergreen",
      "slow",
      "dated",
    ] as const),
    reviewBy:
      o.reviewBy === null
        ? null
        : (parseLocalDate(o.reviewBy) ??
          fail(`${path}.reviewBy`, "must be a date or null")),
    seededDifficulty: seeded,
    explanation: string(o.explanation, `${path}.explanation`),
    learnMore: string(o.learnMore, `${path}.learnMore`),
  };
}

function options(o: Obj, path: string, counts: readonly number[]) {
  const list = strings(o.options, `${path}.options`);
  if (!counts.includes(list.length)) {
    fail(`${path}.options`, `must hold ${counts.join(" or ")} options`);
  }
  const correct = o.correct;
  if (
    typeof correct !== "number" ||
    !Number.isInteger(correct) ||
    correct < 0 ||
    correct >= list.length
  ) {
    fail(`${path}.correct`, "must index one of the options");
  }
  return { options: list, correct };
}

function predictedRate(value: unknown, path: string): PredictedRate {
  const o = object(value, path);
  const p = number(o.p, `${path}.p`);
  if (p < 0 || p > 1) fail(`${path}.p`, "must be from 0 to 1");
  return {
    p,
    spread: number(o.spread, `${path}.spread`),
    estimator: string(o.estimator, `${path}.estimator`),
  };
}

/** One built practice item (§3.2 ChoiceItem). */
export function decodeChoiceItem(raw: unknown, path = "item"): ChoiceItem {
  const o = object(raw, path);
  const base = common(o, path);
  const format = oneOf(o.format, `${path}.format`, [
    "mc",
    "tf",
    "comparison",
  ] as const);
  const stem = string(o.stem, `${path}.stem`);
  const predicted = predictedRate(o.predicted, `${path}.predicted`);
  if (format === "mc") {
    if (o.valueDisplay !== null)
      fail(`${path}.valueDisplay`, "must be null for mc");
    return {
      ...base,
      format,
      stem,
      ...options(o, path, [3, 4]),
      order: oneOf(o.order, `${path}.order`, ["shuffle", "ascending"] as const),
      valueDisplay: null,
      predicted,
    };
  }
  if (format === "tf") {
    const { options: pair, correct } = options(o, path, [2]);
    if (pair[0] !== "True" || pair[1] !== "False") {
      fail(`${path}.options`, "must be True, False");
    }
    if (o.order !== "fixed") fail(`${path}.order`, "must be fixed for tf");
    if (o.valueDisplay !== null)
      fail(`${path}.valueDisplay`, "must be null for tf");
    return {
      ...base,
      format,
      stem,
      options: pair,
      correct,
      order: "fixed",
      valueDisplay: null,
      predicted,
    };
  }
  if (o.order !== "shuffle")
    fail(`${path}.order`, "must be shuffle for comparisons");
  const shown = strings(o.valueDisplay, `${path}.valueDisplay`);
  const [a, b] = shown;
  if (shown.length !== 2 || a === undefined || b === undefined) {
    fail(`${path}.valueDisplay`, "must name both sides");
  }
  return {
    ...base,
    format,
    stem,
    ...options(o, path, [2]),
    order: "shuffle",
    valueDisplay: [a, b],
    predicted,
  };
}

/** One built sealed choice question (§3.2 SealedChoiceContent): the mock's Daily rounds. */
export function decodeSealedChoice(
  raw: unknown,
  path = "choice",
): SealedChoiceContent {
  const o = object(raw, path);
  if (o.kind !== "choice") fail(`${path}.kind`, "must be choice");
  if (o.format !== "mc") fail(`${path}.format`, "must be mc");
  if (o.valueDisplay !== null)
    fail(`${path}.valueDisplay`, "must be null for mc");
  return {
    ...common(o, path),
    kind: "choice",
    format: "mc",
    stem: string(o.stem, `${path}.stem`),
    ...options(o, path, [4]),
    order: oneOf(o.order, `${path}.order`, ["shuffle", "ascending"] as const),
    valueDisplay: null,
  };
}

/** A pack file as the build writes it. Its category must be the one asked for. */
export function decodePackFile(
  raw: unknown,
  category: CategoryId,
  path = "pack",
): PracticePack {
  const o = object(raw, path);
  if (o.category !== category) {
    fail(`${path}.category`, `must be ${category}`);
  }
  const items = array(o.items, `${path}.items`).map((item, i) =>
    decodeChoiceItem(item, `${path}.items[${i}]`),
  );
  items.forEach((item, i) => {
    if (item.category !== category) {
      fail(`${path}.items[${i}].category`, `must be ${category}`);
    }
  });
  return { category, version: string(o.version, `${path}.version`), items };
}

/** A list file as the build writes it: `[id, display, keys, popularity]` tuples (§5.5). */
export function decodeListFile(
  raw: unknown,
  type: AnswerType,
  path = "list",
): AnswerList {
  const o = object(raw, path);
  if (oneOf(o.type, `${path}.type`, ANSWER_TYPES) !== type) {
    fail(`${path}.type`, `must be ${type}`);
  }
  const entities: AnswerEntity[] = array(o.entities, `${path}.entities`).map(
    (value, i) => {
      const at = `${path}.entities[${i}]`;
      const tuple = array(value, at);
      if (tuple.length !== 4)
        fail(at, "must be [id, display, keys, popularity]");
      const [id, display, keys, popularity] = tuple;
      return {
        id: parseEntityId(id) ?? fail(`${at}[0]`, "is not an entity id"),
        display: string(display, `${at}[1]`),
        keys: strings(keys, `${at}[2]`),
        popularity: number(popularity, `${at}[3]`),
      };
    },
  );
  return { type, version: string(o.version, `${path}.version`), entities };
}
