/**
 * Decoders from the content source formats (src/content/schema/, CONTENT_GUIDE
 * §2.3 to §2.11) to the built shapes of ARCHITECTURE §3.2, the conversion
 * the content build does (§5.1.1, §5.3): source-only fields are dropped, mc
 * `answer` and `wrong` become `options` and `correct`, true/false options are
 * fixed as True, False, comparisons always shuffle, and answer lists become
 * the client projection of §5.5 with keys from the engine's normalizeName.
 *
 * Hand-written and zod-free, because browser code (the mock backend, the
 * fixture loaders) runs them. They check every field the built shape needs
 * and throw ContentDecodeError naming the path; the zod schemas stay the
 * authority on the source format, and content:check runs them in CI. Until
 * CNT-1's build generates modules from content/, the fixture loaders decode
 * content/fixtures/ with these at import time.
 */
import type { EntityRecord } from "@/engine/rounds/types";
import { normalizeName } from "@/engine/suggest/normalize";
import {
  ANSWER_TYPES,
  CATEGORY_IDS,
  DIFFICULTY_BANDS,
  ROUND_TYPES,
  parseEntityId,
  parseItemId,
  parseLocalDate,
  parsePackId,
  type AnswerEntity,
  type AnswerList,
  type AnswerType,
  type Category,
  type CategoryId,
  type ChoiceItem,
  type EncoreContent,
  type EntityId,
  type ItemCommon,
  type ItemId,
  type LocalDate,
  type MysteryContent,
  type PredictedRate,
  type Region,
  type RoomPack,
  type RoundSpec,
  type SealedChoiceContent,
} from "@/engine/types";

export class ContentDecodeError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ContentDecodeError";
    this.path = path;
  }
}

type Obj = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new ContentDecodeError(path, message);
}

function object(value: unknown, path: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  return value as Obj;
}

function text(o: Obj, key: string, path: string, allowEmpty = false): string {
  const value = o[key];
  if (typeof value !== "string" || (!allowEmpty && value === "")) {
    fail(
      `${path}.${key}`,
      allowEmpty ? "must be a string" : "must be a non-empty string",
    );
  }
  return value;
}

function number(o: Obj, key: string, path: string): number {
  const value = o[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path}.${key}`, "must be a number");
  }
  return value;
}

function boolean(o: Obj, key: string, path: string): boolean {
  const value = o[key];
  if (typeof value !== "boolean")
    fail(`${path}.${key}`, "must be true or false");
  return value;
}

function list(o: Obj, key: string, path: string): unknown[] {
  const value = o[key];
  if (!Array.isArray(value)) fail(`${path}.${key}`, "must be an array");
  return value;
}

function texts(o: Obj, key: string, path: string): string[] {
  return list(o, key, path).map((value, i) => {
    if (typeof value !== "string" || value === "") {
      fail(`${path}.${key}[${i}]`, "must be a non-empty string");
    }
    return value;
  });
}

function oneOf<T extends string>(
  o: Obj,
  key: string,
  path: string,
  values: readonly T[],
): T {
  const value = o[key];
  if (
    typeof value !== "string" ||
    !(values as readonly string[]).includes(value)
  ) {
    fail(`${path}.${key}`, `must be one of ${values.join(", ")}`);
  }
  return value as T;
}

function itemId(value: unknown, path: string): ItemId {
  return parseItemId(value) ?? fail(path, "is not an item id");
}

function entityId(value: unknown, path: string): EntityId {
  return parseEntityId(value) ?? fail(path, "is not an entity id");
}

function share(o: Obj, key: string, path: string): number {
  const value = number(o, key, path);
  if (value < 0 || value > 1) fail(`${path}.${key}`, "must be from 0 to 1");
  return value;
}

/** The source statuses whose items are in play (cut and retired never ship). */
export function isInPlay(raw: unknown): boolean {
  const status = (raw as Obj | null)?.status;
  return status !== "cut" && status !== "retired";
}

function common(o: Obj, path: string, id: ItemId): ItemCommon {
  const region = text(o, "region", path);
  if (region !== "global" && !/^region:[a-z0-9-]+$/.test(region)) {
    fail(`${path}.region`, "must be global or region:<code>");
  }
  const reviewByRaw = o.reviewBy;
  const reviewBy =
    reviewByRaw === null
      ? null
      : (parseLocalDate(reviewByRaw) ??
        fail(`${path}.reviewBy`, "must be a date or null"));
  const seeded = number(o, "seededDifficulty", path);
  if (![1, 2, 3, 4, 5].includes(seeded)) {
    fail(`${path}.seededDifficulty`, "must be 1 to 5");
  }
  return {
    id,
    category: oneOf(o, "category", path, CATEGORY_IDS),
    tags: texts(o, "tags", path),
    region: region as Region,
    volatility: oneOf(o, "volatility", path, [
      "evergreen",
      "slow",
      "dated",
    ] as const),
    reviewBy,
    seededDifficulty: seeded as ItemCommon["seededDifficulty"],
    explanation: text(o, "explanation", path),
    learnMore: text(o, "learnMore", path),
  };
}

function predictedRate(o: Obj, path: string): PredictedRate {
  const p = object(o.predicted, `${path}.predicted`);
  return {
    p: share(p, "p", `${path}.predicted`),
    spread: number(p, "spread", `${path}.predicted`),
    estimator: text(p, "estimator", `${path}.predicted`),
  };
}

function mcOptions(o: Obj, path: string, wrongCount: readonly number[]) {
  const answer = text(o, "answer", path);
  const wrong = texts(o, "wrong", path);
  if (!wrongCount.includes(wrong.length)) {
    fail(`${path}.wrong`, `must hold ${wrongCount.join(" or ")} options`);
  }
  return { options: [answer, ...wrong], correct: 0 };
}

/** A practice item (mc, tf or comparison) as a built ChoiceItem. */
export function decodePracticeItem(raw: unknown, path = "item"): ChoiceItem {
  const o = object(raw, path);
  const id = itemId(o.id, `${path}.id`);
  const base = common(o, path, id);
  const predicted = predictedRate(o, path);
  const format = oneOf(o, "format", path, ["mc", "tf", "comparison"] as const);
  const stem = text(o, "stem", path);
  if (format === "mc") {
    return {
      ...base,
      format,
      stem,
      ...mcOptions(o, path, [2, 3]),
      order: oneOf(o, "order", path, ["shuffle", "ascending"] as const),
      valueDisplay: null,
      predicted,
    };
  }
  if (format === "tf") {
    return {
      ...base,
      format,
      stem,
      options: ["True", "False"],
      correct: boolean(o, "answer", path) ? 0 : 1,
      order: "fixed",
      valueDisplay: null,
      predicted,
    };
  }
  const shown = object(o.valueDisplay, `${path}.valueDisplay`);
  return {
    ...base,
    format,
    stem,
    options: [text(o, "a", path), text(o, "b", path)],
    correct: oneOf(o, "answer", path, ["a", "b"] as const) === "a" ? 0 : 1,
    order: "shuffle",
    valueDisplay: [
      text(shown, "a", `${path}.valueDisplay`),
      text(shown, "b", `${path}.valueDisplay`),
    ],
    predicted,
  };
}

/** A mystery as built MysteryContent (sealed; fixtures only on the client). */
export function decodeMystery(raw: unknown, path = "mystery"): MysteryContent {
  const o = object(raw, path);
  if (o.kind !== "mystery") fail(`${path}.kind`, "must be mystery");
  const id = itemId(o.id, `${path}.id`);
  const clues = texts(o, "clues", path);
  const distractors = list(o, "distractors", path).map((value, i) =>
    entityId(value, `${path}.distractors[${i}]`),
  );
  const [c1, c2, c3, c4] = clues;
  const [d1, d2, d3] = distractors;
  if (
    clues.length !== 4 ||
    c1 === undefined ||
    c2 === undefined ||
    c3 === undefined ||
    c4 === undefined
  ) {
    fail(`${path}.clues`, "must hold four clues");
  }
  if (
    distractors.length !== 3 ||
    d1 === undefined ||
    d2 === undefined ||
    d3 === undefined
  ) {
    fail(`${path}.distractors`, "must hold three ids");
  }
  const predicted = object(o.predicted, `${path}.predicted`);
  const shares = list(predicted, "solveByClue", `${path}.predicted`);
  const [s1, s2, s3, s4] = shares;
  if (
    shares.length !== 4 ||
    ![s1, s2, s3, s4].every((s) => typeof s === "number" && s >= 0 && s <= 1)
  ) {
    fail(`${path}.predicted.solveByClue`, "must hold four shares from 0 to 1");
  }
  const slot = number(o, "slot", path);
  if (slot !== 1 && slot !== 2 && slot !== 3)
    fail(`${path}.slot`, "must be 1, 2 or 3");
  return {
    ...common(o, path, id),
    kind: "mystery",
    answerType: oneOf(o, "answerType", path, ANSWER_TYPES),
    answer: entityId(o.answer, `${path}.answer`),
    accepted: list(o, "accepted", path).map((value, i) =>
      entityId(value, `${path}.accepted[${i}]`),
    ),
    clues: [c1, c2, c3, c4],
    distractors: [d1, d2, d3],
    slot,
    predicted: {
      solveByClue: [s1 as number, s2 as number, s3 as number, s4 as number],
      spread: number(predicted, "spread", `${path}.predicted`),
      estimator: text(predicted, "estimator", `${path}.predicted`),
    },
    sourceLabels: texts(o, "sourceLabels", path),
  };
}

/** An encore as built EncoreContent (sealed). */
export function decodeEncore(raw: unknown, path = "encore"): EncoreContent {
  const o = object(raw, path);
  if (o.kind !== "encore") fail(`${path}.kind`, "must be encore");
  const id = itemId(o.id, `${path}.id`);
  const decimals = number(o, "decimals", path);
  if (decimals !== 0 && decimals !== 1 && decimals !== 2) {
    fail(`${path}.decimals`, "must be 0, 1 or 2");
  }
  const bandsRaw = o.bands;
  const bands =
    bandsRaw === null
      ? null
      : {
          bullseye: number(
            object(bandsRaw, `${path}.bands`),
            "bullseye",
            `${path}.bands`,
          ),
          close: number(
            object(bandsRaw, `${path}.bands`),
            "close",
            `${path}.bands`,
          ),
        };
  const predicted = object(o.predicted, `${path}.predicted`);
  return {
    ...common(o, path, id),
    kind: "encore",
    question: text(o, "question", path),
    unit: text(o, "unit", path, true),
    unitShort: text(o, "unitShort", path, true),
    unitLabel: text(o, "unitLabel", path, true),
    valueKind: oneOf(o, "valueKind", path, ["quantity", "year"] as const),
    answer: number(o, "answer", path),
    decimals,
    bands,
    predicted: {
      pClose: share(predicted, "pClose", `${path}.predicted`),
      pExact: share(predicted, "pExact", `${path}.predicted`),
      spread: number(predicted, "spread", `${path}.predicted`),
      estimator: text(predicted, "estimator", `${path}.predicted`),
    },
    sourceLabels: texts(o, "sourceLabels", path),
  };
}

/** A room-pack question as built SealedChoiceContent (the source's predicted rate stays out). */
export function decodeSealedChoice(
  raw: unknown,
  path = "question",
): SealedChoiceContent {
  const o = object(raw, path);
  if (o.kind !== "choice") fail(`${path}.kind`, "must be choice");
  if (o.format !== "mc") fail(`${path}.format`, "must be mc");
  const id = itemId(o.id, `${path}.id`);
  return {
    ...common(o, path, id),
    kind: "choice",
    format: "mc",
    stem: text(o, "stem", path),
    ...mcOptions(o, path, [3]),
    order: oneOf(o, "order", path, ["shuffle", "ascending"] as const),
    valueDisplay: null,
  };
}

export interface DecodedRoomPack {
  pack: RoomPack;
  questions: SealedChoiceContent[];
}

/** A room-pack file: the pack and its questions in play order. */
export function decodeRoomPack(raw: unknown, path = "pack"): DecodedRoomPack {
  const o = object(raw, path);
  const id = parsePackId(o.id) ?? fail(`${path}.id`, "is not a pack id");
  const questions = list(o, "questions", path)
    .filter(isInPlay)
    .map((q, i) => decodeSealedChoice(q, `${path}.questions[${i}]`));
  return {
    pack: {
      id,
      title: text(o, "title", path),
      theme: text(o, "theme", path),
      questionIds: questions.map((q) => q.id),
    },
    questions,
  };
}

/** One list, as the client projection (§5.5) plus what the judge needs per entry. */
export interface DecodedAnswerList {
  list: AnswerList;
  /** Every active, unreplaced entry, with its clue-4 option label. */
  records: EntityRecord[];
}

const DESCRIBED: ReadonlySet<AnswerType> = new Set([
  "person",
  "tv_series",
  "music_artist",
]);

function uniqueKeys(names: string[]): string[] {
  return [...new Set(names.map(normalizeName).filter((key) => key !== ""))];
}

export function decodeAnswerList(
  raw: unknown,
  path = "list",
): DecodedAnswerList {
  const o = object(raw, path);
  const type = oneOf(o, "type", path, ANSWER_TYPES);
  const version = text(o, "version", path);
  const entities: AnswerEntity[] = [];
  const records: EntityRecord[] = [];
  list(o, "entities", path).forEach((value, i) => {
    const at = `${path}.entities[${i}]`;
    const e = object(value, at);
    const status = oneOf(e, "status", at, ["active", "retired"] as const);
    const replaced = e.replacedBy !== undefined && e.replacedBy !== null;
    if (status !== "active" || replaced) return;
    const id = entityId(e.id, `${at}.id`);
    const name = text(e, "name", at);
    const display = text(e, "display", at);
    const qualifier = object(e.qualifier, `${at}.qualifier`);
    const optionLabel = DESCRIBED.has(type)
      ? `${name} (${text(qualifier, "descriptor", `${at}.qualifier`)})`
      : display;
    entities.push({
      id,
      display,
      keys: uniqueKeys([name, ...texts(e, "aliases", at)]),
      popularity: number(e, "popularity", at),
    });
    records.push({ id, display, optionLabel });
  });
  return { list: { type, version, entities }, records };
}

export interface ScheduledDaily {
  date: LocalDate;
  rounds: RoundSpec[];
}

export interface DecodedSchedule {
  track: "main" | "e2e";
  dailies: ScheduledDaily[];
}

function roundSpec(value: unknown, path: string): RoundSpec {
  const o = object(value, path);
  const difficulty = o.difficulty;
  if (
    difficulty !== null &&
    !(DIFFICULTY_BANDS as readonly unknown[]).includes(difficulty)
  ) {
    fail(`${path}.difficulty`, "must be easy, medium, hard or null");
  }
  return {
    type: oneOf(o, "type", path, ROUND_TYPES),
    difficulty: difficulty as RoundSpec["difficulty"],
    contentId: itemId(o.contentId, `${path}.contentId`),
  };
}

/** A schedule month (CONTENT_GUIDE §2.11): its track and its Dailies' round lists. */
export function decodeScheduleMonth(
  raw: unknown,
  path = "schedule",
): DecodedSchedule {
  const o = object(raw, path);
  return {
    track: oneOf(o, "track", path, ["main", "e2e"] as const),
    dailies: list(o, "dailies", path).map((value, i) => {
      const at = `${path}.dailies[${i}]`;
      const d = object(value, at);
      return {
        date: parseLocalDate(d.date) ?? fail(`${at}.date`, "must be a date"),
        rounds: list(d, "rounds", at).map((r, j) =>
          roundSpec(r, `${at}.rounds[${j}]`),
        ),
      };
    }),
  };
}

export interface DecodedSpare {
  id: string;
  track: "main" | "e2e";
  rounds: RoundSpec[];
}

/**
 * A spare set (CONTENT_GUIDE §10.7): a Daily's round list with no date.
 * Ids are `spare.NN`, as ARCHITECTURE §2.4 names them and the content
 * schema spells them.
 */
export function decodeSpareSet(raw: unknown, path = "spare"): DecodedSpare {
  const o = object(raw, path);
  const id = text(o, "id", path);
  if (!/^spare\.\d{2}$/.test(id)) {
    fail(`${path}.id`, "must be spare.NN");
  }
  return {
    id,
    track: oneOf(o, "track", path, ["main", "e2e"] as const),
    rounds: list(o, "rounds", path).map((r, i) =>
      roundSpec(r, `${path}.rounds[${i}]`),
    ),
  };
}

/** content/categories.json (§3.2 Category). */
export function decodeCategories(
  raw: unknown,
  path = "categories",
): Category[] {
  if (!Array.isArray(raw)) fail(path, "must be an array");
  return raw.map((value, i) => {
    const at = `${path}[${i}]`;
    const o = object(value, at);
    return {
      id: oneOf(o, "id", at, CATEGORY_IDS) satisfies CategoryId,
      slug: text(o, "slug", at),
      name: text(o, "name", at),
      shortName: text(o, "shortName", at),
      order: number(o, "order", at),
    };
  });
}
