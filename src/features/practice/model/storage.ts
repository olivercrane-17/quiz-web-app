/**
 * What practice keeps on the device (ARCHITECTURE §6.2, §6.5), both owned
 * by PRA-1:
 *
 * - `qz:runs:<runId>`: an unfinished run. The run machine's
 *   `LocalRunSnapshot` (invariant 8), saved after every opened round and
 *   verdict, plus what a resume needs that the snapshot doesn't hold: the
 *   items in round order, the request (for the header and Play again) and
 *   the plan's notes. The newest 3 are kept; a finished run moves to the
 *   history and its snapshot goes.
 * - `qz:history`: the last 100 finished runs, newest first, for the results
 *   screen and, later, stats. Questions are compact tuples, so 100 runs
 *   stay around 40 kB.
 *
 * Every read goes through a decoder. A snapshot that doesn't decode is
 * quarantined by the kv layer and the run starts fresh; a history entry that
 * doesn't decode is dropped and the rest are kept.
 */
import type { PracticeNote } from "@/engine/practice";
import type { ChoiceClient } from "@/engine/rounds/choice";
import type { LocalRunSnapshot, RoundSlot } from "@/engine/run";
import {
  CATEGORY_IDS,
  parseItemId,
  type CategoryId,
  type DifficultyChoice,
  type EpochMs,
  type ItemId,
  type OptionView,
  type RoundMeta,
  type RoundOpen,
  type RoundOutcome,
  type RoundReveal,
  type RunConfig,
  type ShareCell,
} from "@/engine/types";
import type { Kv, StorageKey } from "@/platform/storage";

export const RUN_KEY_PREFIX = "qz:runs:";
/** Unfinished runs kept (§6.2). */
export const MAX_STORED_RUNS = 3;
export const HISTORY_KEY = "qz:history";
/** Finished runs kept (§6.2). */
export const MAX_HISTORY = 100;

/** What a run was asked for: the intent, settled. */
export interface PracticeRunRequest {
  mode: "quick" | "category";
  category: CategoryId | "mixed";
  difficulty: DifficultyChoice;
  repeats: boolean;
}

export interface StoredPracticeRun {
  v: 1;
  request: PracticeRunRequest;
  /** The plan, in round order. */
  itemIds: ItemId[];
  notes: PracticeNote[];
  snapshot: LocalRunSnapshot;
  savedAt: EpochMs;
}

export interface HistoryQuestion {
  itemId: ItemId;
  correct: boolean;
  /** The pick as an index into the item's options in source order; null when unanswered. */
  chosen: number | null;
}

export interface PracticeHistoryEntry {
  runId: string;
  mode: "practice";
  request: PracticeRunRequest;
  score: number;
  maxPoints: number;
  startedAt: EpochMs;
  finishedAt: EpochMs;
  questions: HistoryQuestion[];
}

type Obj = Record<string, unknown>;

const CHOICE_TYPES: readonly string[] = ["mc", "tf", "comparison"];
const DIFFICULTIES: readonly string[] = ["easy", "medium", "hard", "mixed"];
const BANDS: readonly string[] = ["easy", "medium", "hard"];
const NOTES: readonly string[] = [
  "repeats_mixed_in",
  "pool_exhausted",
  "hard_filled",
  "hard_exhausted",
];
const CELLS: readonly string[] = ["correct", "wrong", "voided"];

const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNum = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isInt = (value: unknown): value is number => Number.isInteger(value);
const isNumOrNull = (value: unknown): value is number | null =>
  value === null || isNum(value);
const isStr = (value: unknown): value is string => typeof value === "string";
const isBool = (value: unknown): value is boolean => typeof value === "boolean";
const oneOf = (value: unknown, values: readonly string[]): value is string =>
  typeof value === "string" && values.includes(value);
const isCategory = (value: unknown): value is CategoryId =>
  oneOf(value, CATEGORY_IDS);

export function decodeRequest(raw: unknown): PracticeRunRequest | null {
  if (!isObj(raw)) return null;
  const { mode, category, difficulty, repeats } = raw;
  if (mode !== "quick" && mode !== "category") return null;
  if (category !== "mixed" && !isCategory(category)) return null;
  if (!oneOf(difficulty, DIFFICULTIES) || !isBool(repeats)) return null;
  return {
    mode,
    category,
    difficulty: difficulty as DifficultyChoice,
    repeats,
  };
}

function decodeMeta(raw: unknown, index: number): RoundMeta | null {
  if (!isObj(raw) || raw.index !== index || !oneOf(raw.type, CHOICE_TYPES)) {
    return null;
  }
  const { difficulty, category, ordinal, ofType, maxPoints, voided } = raw;
  if (difficulty !== null && !oneOf(difficulty, BANDS)) return null;
  if (category !== null && !isCategory(category)) return null;
  if (raw.answerType !== null || !isInt(ordinal) || !isInt(ofType)) return null;
  if (!isNum(maxPoints) || !isBool(voided)) return null;
  return raw as unknown as RoundMeta;
}

function decodeOptions(raw: unknown): OptionView[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const ok = raw.every(
    (option, i) =>
      isObj(option) &&
      option.index === i &&
      isStr(option.label) &&
      isBool(option.alreadyGuessed),
  );
  return ok ? (raw as OptionView[]) : null;
}

type ChoiceOpen = Extract<RoundOpen, { family: "choice" }>;
type ChoiceReveal = Extract<RoundReveal, { family: "choice" }>;
type ChoiceOutcome = Extract<RoundOutcome, { family: "choice" }>;

function decodeOpen(raw: unknown, index: number): ChoiceOpen | null {
  if (!isObj(raw) || raw.family !== "choice" || raw.index !== index) {
    return null;
  }
  if (!oneOf(raw.format, CHOICE_TYPES) || !isStr(raw.stem)) return null;
  if (decodeOptions(raw.options) === null || !isNum(raw.issuedAt)) return null;
  return raw as unknown as ChoiceOpen;
}

function decodeReveal(raw: unknown, optionCount: number): ChoiceReveal | null {
  if (!isObj(raw) || raw.family !== "choice") return null;
  const inRange = (value: unknown) =>
    isInt(value) && value >= 0 && value < optionCount;
  const { correctIndex, chosenIndex, valueDisplay, crowd } = raw;
  if (!inRange(correctIndex)) return null;
  if (chosenIndex !== null && !inRange(chosenIndex)) return null;
  if (!isBool(raw.correct) || !isNum(raw.points)) return null;
  if (!isStr(raw.explanation) || !isStr(raw.learnMore)) return null;
  if (
    valueDisplay !== null &&
    !(
      Array.isArray(valueDisplay) &&
      valueDisplay.length === 2 &&
      valueDisplay.every(isStr)
    )
  ) {
    return null;
  }
  if (crowd !== null && !isObj(crowd)) return null;
  return raw as unknown as ChoiceReveal;
}

function decodeOutcome(raw: unknown): ChoiceOutcome | null {
  if (!isObj(raw) || raw.family !== "choice") return null;
  if (!isBool(raw.correct) || !isNum(raw.points) || !isBool(raw.voided)) {
    return null;
  }
  if (!isNumOrNull(raw.answerMs)) return null;
  const cells = raw.cells;
  if (!Array.isArray(cells) || !cells.every((cell) => oneOf(cell, CELLS))) {
    return null;
  }
  return raw as unknown as ChoiceOutcome;
}

function decodeSlot(raw: unknown, index: number): RoundSlot | null {
  if (!isObj(raw)) return null;
  const meta = decodeMeta(raw.meta, index);
  if (meta === null) return null;
  const open = raw.open === null ? null : decodeOpen(raw.open, index);
  if (raw.open !== null && open === null) return null;
  const optionCount = open?.options.length ?? 0;
  const reveal =
    raw.reveal === null ? null : decodeReveal(raw.reveal, optionCount);
  if (raw.reveal !== null && reveal === null) return null;
  const outcome = raw.outcome === null ? null : decodeOutcome(raw.outcome);
  if (raw.outcome !== null && outcome === null) return null;
  // A reveal needs the round it answers; an outcome needs its reveal.
  if (
    (reveal !== null && open === null) ||
    (outcome === null) !== (reveal === null)
  ) {
    return null;
  }
  let client: ChoiceClient | null = null;
  if (raw.client !== null) {
    if (!isObj(raw.client) || open === null) return null;
    const clientOpen = decodeOpen(raw.client.open, index);
    const clientReveal =
      raw.client.reveal === null
        ? null
        : decodeReveal(raw.client.reveal, optionCount);
    if (clientOpen === null) return null;
    if (raw.client.reveal !== null && clientReveal === null) return null;
    client = { open: clientOpen, reveal: clientReveal };
  }
  const { openedAt, resolvedAt, requests, activeMs, hiddenMs } = raw;
  if (!isNumOrNull(openedAt) || !isNumOrNull(resolvedAt)) return null;
  if (!isInt(requests) || !isNum(activeMs) || !isNum(hiddenMs)) return null;
  return {
    meta,
    open,
    client,
    reveal,
    outcome,
    openedAt,
    resolvedAt,
    requests,
    activeMs,
    hiddenMs,
  };
}

function decodeConfig(raw: unknown): RunConfig | null {
  if (!isObj(raw)) return null;
  const { rounds, endRule, timing } = raw;
  if (raw.mode !== "practice" || raw.sealed !== false) return null;
  if (raw.scoring !== "practice" || !isStr(raw.seed) || !isStr(raw.runId)) {
    return null;
  }
  if (!isObj(endRule) || endRule.kind !== "fixed") return null;
  if (!isObj(timing) || timing.kind !== "untimed") return null;
  if (!Array.isArray(rounds) || rounds.length === 0) return null;
  const metas = rounds.map((meta, i) => decodeMeta(meta, i));
  if (metas.some((meta) => meta === null)) return null;
  return raw as unknown as RunConfig;
}

export function decodeSnapshot(raw: unknown): LocalRunSnapshot | null {
  if (!isObj(raw)) return null;
  const config = decodeConfig(raw.config);
  if (config === null || config.rounds === "stream") return null;
  const { slots, score, strikes, startedAt, index } = raw;
  if (!Array.isArray(slots) || slots.length !== config.rounds.length) {
    return null;
  }
  const decoded = slots.map((slot, i) => decodeSlot(slot, i));
  if (decoded.some((slot) => slot === null)) return null;
  if (!isNum(score) || !isInt(strikes) || !isNum(startedAt)) return null;
  if (!isInt(index) || index < 0 || index >= slots.length) return null;
  return {
    config,
    slots: decoded as RoundSlot[],
    score,
    strikes,
    startedAt,
    index,
  };
}

export function decodeStoredRun(raw: unknown): StoredPracticeRun | null {
  if (!isObj(raw) || raw.v !== 1 || !isNum(raw.savedAt)) return null;
  const request = decodeRequest(raw.request);
  const snapshot = decodeSnapshot(raw.snapshot);
  if (request === null || snapshot === null) return null;
  const { itemIds, notes } = raw;
  if (!Array.isArray(itemIds) || itemIds.length !== snapshot.slots.length) {
    return null;
  }
  const ids = itemIds.map(parseItemId);
  if (ids.some((id) => id === null)) return null;
  if (!Array.isArray(notes) || !notes.every((note) => oneOf(note, NOTES))) {
    return null;
  }
  return {
    v: 1,
    request,
    itemIds: ids as ItemId[],
    notes: notes as PracticeNote[],
    snapshot,
    savedAt: raw.savedAt,
  };
}

export function runKey(runId: string): StorageKey {
  return `${RUN_KEY_PREFIX}${runId}`;
}

function storedRunKeys(kv: Kv): StorageKey[] {
  return kv.keys().filter((key) => key.startsWith(RUN_KEY_PREFIX));
}

/** Saves an unfinished run under its id. */
export function saveRun(kv: Kv, run: StoredPracticeRun): void {
  kv.write(runKey(run.snapshot.config.runId), run);
}

export function removeRun(kv: Kv, runId: string): void {
  kv.remove(runKey(runId));
}

/** Every stored run that decodes, newest first. */
export function listStoredRuns(kv: Kv): StoredPracticeRun[] {
  const runs: StoredPracticeRun[] = [];
  for (const key of storedRunKeys(kv)) {
    const run = kv.read(key, decodeStoredRun);
    // A run stored under another run's key is not to be trusted.
    if (run !== null && runKey(run.snapshot.config.runId) === key) {
      runs.push(run);
    }
  }
  return runs.sort((a, b) => b.savedAt - a.savedAt);
}

/** Keeps the newest `keep` unfinished runs (§6.2) and drops the rest. */
export function pruneRuns(kv: Kv, keep: number = MAX_STORED_RUNS): void {
  const runs = listStoredRuns(kv);
  for (const run of runs.slice(keep)) removeRun(kv, run.snapshot.config.runId);
}

export function newestStoredRun(kv: Kv): StoredPracticeRun | null {
  return listStoredRuns(kv)[0] ?? null;
}

/** As stored: questions as [itemId, 1 or 0 for right, chosen source index or null]. */
type StoredQuestion = [string, 0 | 1, number | null];
interface StoredEntry extends Omit<PracticeHistoryEntry, "questions"> {
  questions: StoredQuestion[];
}

function decodeQuestion(raw: unknown): HistoryQuestion | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const [id, right, chosen] = raw as unknown[];
  const itemId = parseItemId(id);
  if (itemId === null || (right !== 0 && right !== 1)) return null;
  if (chosen !== null && !(isInt(chosen) && chosen >= 0)) return null;
  return { itemId, correct: right === 1, chosen };
}

export function decodeHistoryEntry(raw: unknown): PracticeHistoryEntry | null {
  if (!isObj(raw) || !isStr(raw.runId) || raw.mode !== "practice") return null;
  const request = decodeRequest(raw.request);
  if (request === null) return null;
  const { score, maxPoints, startedAt, finishedAt, questions } = raw;
  if (!isNum(score) || !isNum(maxPoints)) return null;
  if (!isNum(startedAt) || !isNum(finishedAt)) return null;
  if (!Array.isArray(questions)) return null;
  const decoded = questions.map(decodeQuestion);
  if (decoded.some((question) => question === null)) return null;
  return {
    runId: raw.runId,
    mode: "practice",
    request,
    score,
    maxPoints,
    startedAt,
    finishedAt,
    questions: decoded as HistoryQuestion[],
  };
}

/** The history as stored; entries that don't decode are left out. Null when it isn't a history at all. */
export function decodeHistory(raw: unknown): PracticeHistoryEntry[] | null {
  if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.runs)) return null;
  return raw.runs
    .map(decodeHistoryEntry)
    .filter((entry): entry is PracticeHistoryEntry => entry !== null);
}

function encodeEntry(entry: PracticeHistoryEntry): StoredEntry {
  return {
    ...entry,
    questions: entry.questions.map((q) => [
      q.itemId,
      q.correct ? 1 : 0,
      q.chosen,
    ]),
  };
}

/** Finished runs, newest first. */
export function readHistory(kv: Kv): PracticeHistoryEntry[] {
  return kv.read(HISTORY_KEY, decodeHistory) ?? [];
}

/** Adds a finished run to the front, keeping the newest 100; a run already there is replaced. */
export function appendHistory(kv: Kv, entry: PracticeHistoryEntry): void {
  const runs = [
    entry,
    ...readHistory(kv).filter((run) => run.runId !== entry.runId),
  ].slice(0, MAX_HISTORY);
  kv.write(HISTORY_KEY, { v: 1, runs: runs.map(encodeEntry) });
}

export function findHistoryEntry(
  kv: Kv,
  runId: string | null,
): PracticeHistoryEntry | null {
  const runs = readHistory(kv);
  if (runId !== null) {
    const match = runs.find((run) => run.runId === runId);
    if (match !== undefined) return match;
  }
  return runs[0] ?? null;
}

/** The share cell a history question stands for. */
export function historyCell(question: HistoryQuestion): ShareCell {
  return question.correct ? "correct" : "wrong";
}
