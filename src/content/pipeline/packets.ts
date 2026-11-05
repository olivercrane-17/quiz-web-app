/**
 * Blind packets for fact-checkers (CONTENT_GUIDE §9.4).
 *
 * **Stages.** One agent run receives its packet in stages, and the tool
 * serves the next stage only after the run's draft check record holds the
 * cold-solve entry for the stage before (scripts/content/packets.ts):
 * - cold stages: what a player sees before answering (the prompt, options
 *   in a per-pass order, the category and answer type). A mystery has four,
 *   one clue each: stage k holds clues 1 to k, stage 1 also names the answer
 *   list file and the version that ships, and the four clue-4 options
 *   arrive with clue 4 (`optionsFromClue` at launch). Every other item has
 *   one. No cold
 *   stage holds the key, writerNotes, claims, risk notes, verification or
 *   difficulty.
 * - the final stage: the full cold view plus the key, the explanation and
 *   the item's claims (with their risk, so checker A knows what needs
 *   external evidence). Still no writerNotes, no rivals or likely guesses,
 *   no estimate and no other checker's record.
 *
 * **Hashes.** Each stage has its own hash, so a record's `packetSha256`
 * holds one per stage served, in order, and `stagesServedAt` the time each
 * was served (§9.8). A stage's hash is the SHA-256 of the canonical JSON of
 * the packet version, the pass, the item id, the stage and the item content
 * that stage shows: the cold stages' content is key-neutral (options as a
 * sorted set, no answer field), so a stage's hash says nothing about the
 * key, and the final stage covers every field a packet shows
 * (PACKET_FIELDS). Derived text (entity display names, category names,
 * myth hits) and the option order stay out: a hash can be recomputed
 * without the content key, and a reference-file change never invalidates a
 * check. content:record, content:decide and content:check recompute them
 * from the current item, so an item edited after its checks never goes
 * active on them.
 *
 * Records accepted before staging carry one hash of the whole packet
 * (`packetSha256`, PACKET_VERSION 2), which stays verifiable.
 *
 * Option order. Options are shuffled with a seed only the key holder can
 * compute, HMAC-SHA256(k_order, "<itemId>|<pass>") with k_order derived from
 * the content key (seal.ts). A public seed would let anyone undo the shuffle
 * and read the key's position off a cold stage. Without an order key
 * (hashing, record validation, the estimator's packet, which shows the key
 * anyway) options are sorted, which says nothing about which one is the key.
 */
import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { CATEGORY_TABLE } from "../schema/categories.ts";
import type { AnyItem, Mystery } from "../schema/items.ts";
import { isoDateTime, sha256Hex } from "../schema/primitives.ts";
import {
  coldSolveTimes,
  type ColdSolve,
  type Pass,
} from "../schema/verification.ts";
import type { Bank, BankItem } from "./bank.ts";
import { stableStringify } from "./json.ts";
import type { Layout } from "./layout.ts";
import { mythMatches } from "./references.ts";

/** The single-hash packets of records accepted before staging. */
export const PACKET_VERSION = 2;

/** Staged packets: one hash per stage (§9.4). */
export const STAGED_PACKET_VERSION = 3;

/** A key that seeds the option order (k_order from seal.ts). */
export type OrderKey = Uint8Array;

/** Seeded Fisher-Yates: the same seed always gives the same order. */
export function shuffleFor<T>(values: readonly T[], seed: string): T[] {
  const digest = createHash("sha256").update(seed).digest();
  let state = digest.readUInt32LE(0) || 1;
  const next = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** The secret seed of one item's option order in one pass. */
export function orderSeed(
  orderKey: OrderKey,
  itemId: string,
  pass: string,
): string {
  return createHmac("sha256", orderKey)
    .update(`${itemId}|${pass}`)
    .digest("hex");
}

const byText = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

/** Keyed shuffle with an order key; sorted (key-neutral) without one. */
function arrange<T>(
  values: readonly T[],
  text: (value: T) => string,
  orderKey: OrderKey | undefined,
  itemId: string,
  pass: string,
): T[] {
  if (orderKey) return shuffleFor(values, orderSeed(orderKey, itemId, pass));
  return [...values].sort((x, y) => byText(text(x), text(y)));
}

function leadingNumber(option: string): number {
  const match = /^\s*(-?\d[\d,]*(?:\.\d+)?)/.exec(option);
  return match ? Number((match[1] ?? "").replace(/,/g, "")) : Number.NaN;
}

const ANSWER_LINES: Record<string, string> = {
  country: "a country",
  city: "a city",
  person: "a person",
  film: "a film",
  tv_series: "a TV series",
  book: "a book",
  animal: "an animal",
  element: "a chemical element",
  landmark: "a landmark",
  music_artist: "a musician or band",
  dish: "a dish or drink",
  sport: "a sport or game",
};

export type ColdEntry = Record<string, unknown> & { itemId: string };

/** Clues per mystery stage; the clue-4 options come with the last one. */
export const MYSTERY_STAGES = 4;

function categoryName(code: string): string {
  return CATEGORY_TABLE.find((category) => category.id === code)?.name ?? code;
}

function entityView(bank: Bank, mystery: Mystery, id: string) {
  const entity = bank.lists.get(mystery.answerType)?.entities.get(id);
  return { id, name: entity?.name ?? id, display: entity?.display ?? id };
}

/**
 * The cold stages of one item for one pass: four for a mystery (clue k at
 * stage k, the clue-4 options at stage 4), one for everything else.
 */
export function coldStages(
  bank: Bank,
  record: BankItem,
  pass: Pass | "E",
  orderKey?: OrderKey,
): ColdEntry[] {
  const item = record.item;
  const base = {
    itemId: record.id,
    pool: record.pool,
    category: item.category,
    categoryName: categoryName(item.category),
  };
  if ("kind" in item && item.kind === "mystery") {
    const options = arrange(
      [item.answer, ...item.distractors].map((id) => {
        const view = entityView(bank, item, id);
        return { id: view.id, display: view.display };
      }),
      (option) => option.display,
      orderKey,
      record.id,
      pass,
    );
    const head = {
      ...base,
      kind: "mystery",
      answerType: item.answerType,
      answerLine: `The answer is ${ANSWER_LINES[item.answerType] ?? item.answerType}.`,
      answerList: `content/answer-lists/${item.answerType}.json`,
      answerListVersion: bank.lists.get(item.answerType)?.version ?? null,
    };
    return Array.from({ length: MYSTERY_STAGES }, (_, i) => ({
      ...head,
      clueStage: i + 1,
      clues: item.clues.slice(0, i + 1),
      ...(i + 1 === MYSTERY_STAGES ? { clue4Options: options } : {}),
    }));
  }
  if ("kind" in item && item.kind === "encore") {
    const view: ColdEntry = {
      ...base,
      kind: "encore",
      question: item.question,
      valueKind: item.valueKind,
      unit: item.unit,
      decimals: item.decimals,
    };
    if (item.unitShort !== undefined) view.unitShort = item.unitShort;
    if (item.unitLabel !== undefined) view.unitLabel = item.unitLabel;
    return [view];
  }
  if (item.format === "tf") {
    return [
      {
        ...base,
        format: "tf",
        statement: item.stem,
        options: ["True", "False"],
      },
    ];
  }
  if (item.format === "comparison") {
    return [
      {
        ...base,
        format: "comparison",
        stem: item.stem,
        options: arrange([item.a, item.b], String, orderKey, record.id, pass),
        measure: item.measure,
        unit: item.unit,
      },
    ];
  }
  const options = [item.answer, ...item.wrong];
  return [
    {
      ...base,
      format: "mc",
      ...("kind" in item ? { kind: "choice" } : {}),
      stem: item.stem,
      options:
        item.order === "ascending"
          ? [...options].sort((x, y) => leadingNumber(x) - leadingNumber(y))
          : arrange(options, String, orderKey, record.id, pass),
    },
  ];
}

/** The full cold view (a mystery's last stage: all four clues and the options). */
export function coldView(
  bank: Bank,
  record: BankItem,
  pass: Pass | "E",
  orderKey?: OrderKey,
): ColdEntry {
  const stages = coldStages(bank, record, pass, orderKey);
  return stages[stages.length - 1] as ColdEntry;
}

function keyView(bank: Bank, item: AnyItem): Record<string, unknown> {
  if ("kind" in item && item.kind === "mystery") {
    return {
      answer: entityView(bank, item, item.answer),
      accepted: item.accepted.map((id) => entityView(bank, item, id)),
    };
  }
  if ("kind" in item && item.kind === "encore") {
    return {
      answer: item.answer,
      decimals: item.decimals,
      unit: item.unit,
      valueKind: item.valueKind,
      bands: item.bands,
      derivation: item.derivation,
    };
  }
  if (item.format === "tf") return { answer: item.answer ? "True" : "False" };
  if (item.format === "comparison") {
    return {
      answer: item.answer === "a" ? item.a : item.b,
      relation: item.relation,
      values: [
        { label: item.a, value: item.values.a, display: item.valueDisplay.a },
        { label: item.b, value: item.values.b, display: item.valueDisplay.b },
      ],
    };
  }
  return { answer: item.answer };
}

/** The reveal view: the full cold view plus the key, explanation and claims. */
export function revealView(
  bank: Bank,
  record: BankItem,
  pass: Pass,
  orderKey?: OrderKey,
): ColdEntry {
  const item = record.item;
  const mythHits = item.claims.flatMap((claim) =>
    bank.references.myths
      .filter((myth) => mythMatches(myth, claim.text))
      .map((myth) => ({
        claimId: claim.id,
        mythId: myth.id,
        myth: myth.claim,
      })),
  );
  return {
    ...coldView(bank, record, pass, orderKey),
    key: keyView(bank, item),
    explanation: item.explanation,
    learnMore: item.learnMore,
    volatility: item.volatility,
    claims: item.claims.map((claim) => {
      const view: Record<string, unknown> = { id: claim.id, role: claim.role };
      if (claim.ref !== undefined) view.ref = claim.ref;
      view.risk = claim.risk;
      if (claim.riskReason !== undefined) view.riskReason = claim.riskReason;
      view.text = claim.text;
      return view;
    }),
    mythHits,
  };
}

/**
 * The estimator's packet (§8.5): the cold view plus the key, so fame and
 * distractor pull can be judged. No claims, notes, seed or verification.
 * It shows the key, so its options are simply sorted.
 */
export function estimatorView(bank: Bank, record: BankItem): ColdEntry {
  return { ...coldView(bank, record, "E"), key: keyView(bank, record.item) };
}

const COMMON_FIELDS = [
  "category",
  "explanation",
  "learnMore",
  "volatility",
  "claims",
] as const;

/**
 * The item fields each kind's packets show, across all stages and the
 * reveal. They are what packetSha256 covers, and what a rewrite may not
 * change without fresh checks (decisions.ts).
 */
export const PACKET_FIELDS = {
  mc: [...COMMON_FIELDS, "format", "stem", "answer", "wrong", "order"],
  tf: [...COMMON_FIELDS, "format", "stem", "answer"],
  comparison: [
    ...COMMON_FIELDS,
    "format",
    "stem",
    "a",
    "b",
    "answer",
    "relation",
    "measure",
    "unit",
    "values",
    "valueDisplay",
  ],
  mystery: [
    ...COMMON_FIELDS,
    "kind",
    "answerType",
    "answer",
    "accepted",
    "clues",
    "distractors",
  ],
  encore: [
    ...COMMON_FIELDS,
    "kind",
    "question",
    "valueKind",
    "answer",
    "decimals",
    "unit",
    "unitShort",
    "unitLabel",
    "bands",
    "derivation",
  ],
  room: [
    ...COMMON_FIELDS,
    "kind",
    "format",
    "stem",
    "answer",
    "wrong",
    "order",
  ],
} as const;

export function packetFields(item: AnyItem): readonly string[] {
  if ("kind" in item) {
    return item.kind === "choice"
      ? PACKET_FIELDS.room
      : PACKET_FIELDS[item.kind];
  }
  return PACKET_FIELDS[item.format];
}

/** The item content a packet shows, field by field. */
export function packetContent(item: AnyItem): Record<string, unknown> {
  const source = item as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of packetFields(item)) {
    if (source[field] !== undefined) out[field] = source[field];
  }
  return out;
}

/** The packetSha256 of an item for a pass (see the header comment). */
export function packetSha256(
  itemId: string,
  item: AnyItem,
  pass: Pass,
): string {
  const payload = stableStringify({
    v: PACKET_VERSION,
    pass,
    itemId,
    item: packetContent(item),
  });
  return createHash("sha256").update(payload).digest("hex");
}

export interface PacketEntry {
  itemId: string;
  packetSha256: string;
  /** The cold stages, in the order a checker opens them. */
  stages: ColdEntry[];
  reveal: ColdEntry;
}

export function packetEntry(
  bank: Bank,
  record: BankItem,
  pass: Pass,
  orderKey?: OrderKey,
): PacketEntry {
  return {
    itemId: record.id,
    packetSha256: packetSha256(record.id, record.item, pass),
    stages: coldStages(bank, record, pass, orderKey),
    reveal: revealView(bank, record, pass, orderKey),
  };
}

/**
 * The item content each stage of a pass's packet shows, in order: the cold
 * stages, key-neutral (options as a sorted set, never the answer field),
 * then the final stage with every field a packet shows.
 */
export function stageContents(item: AnyItem): Record<string, unknown>[] {
  const sorted = (values: readonly string[]) =>
    [...values].sort((x, y) => byText(x, y));
  const final = packetContent(item);
  if ("kind" in item && item.kind === "mystery") {
    const cold = Array.from({ length: MYSTERY_STAGES }, (_, i) => ({
      category: item.category,
      kind: item.kind,
      answerType: item.answerType,
      clues: item.clues.slice(0, i + 1),
      ...(i + 1 === MYSTERY_STAGES
        ? { options: sorted([item.answer, ...item.distractors]) }
        : {}),
    }));
    return [...cold, final];
  }
  if ("kind" in item && item.kind === "encore") {
    return [
      {
        category: item.category,
        kind: item.kind,
        question: item.question,
        valueKind: item.valueKind,
        unit: item.unit,
        unitShort: item.unitShort,
        unitLabel: item.unitLabel,
        decimals: item.decimals,
      },
      final,
    ];
  }
  if (item.format === "tf")
    return [{ category: item.category, format: "tf", stem: item.stem }, final];
  if (item.format === "comparison")
    return [
      {
        category: item.category,
        format: "comparison",
        stem: item.stem,
        labels: sorted([item.a, item.b]),
        measure: item.measure,
        unit: item.unit,
      },
      final,
    ];
  return [
    {
      category: item.category,
      ...("kind" in item ? { kind: item.kind } : {}),
      format: "mc",
      stem: item.stem,
      options: sorted([item.answer, ...item.wrong]),
      order: item.order,
    },
    final,
  ];
}

/** One hash per stage of an item's packet for a pass, in order (§9.4, §9.8). */
export function stageHashes(
  itemId: string,
  item: AnyItem,
  pass: Pass,
): string[] {
  const contents = stageContents(item);
  return contents.map((content, i) =>
    createHash("sha256")
      .update(
        stableStringify({
          v: STAGED_PACKET_VERSION,
          pass,
          itemId,
          stage: i + 1,
          of: contents.length,
          item: content,
        }),
      )
      .digest("hex"),
  );
}

/** True when a recorded packetSha256 still matches the item for its pass. */
export function packetMatches(
  itemId: string,
  item: AnyItem,
  pass: Pass,
  recorded: string | readonly string[],
): boolean {
  if (typeof recorded === "string")
    return recorded === packetSha256(itemId, item, pass);
  const now = stageHashes(itemId, item, pass);
  return (
    recorded.length === now.length &&
    recorded.every((hash, i) => hash === now[i])
  );
}

/** The passes whose recorded packetSha256 no longer matches the item. */
export function changedSinceChecks(itemId: string, item: AnyItem): Pass[] {
  const v = item.verification;
  const records = [...(v?.checks ?? []), ...(v?.tiebreak ? [v.tiebreak] : [])];
  return records
    .filter(
      (check) => !packetMatches(itemId, item, check.pass, check.packetSha256),
    )
    .map((check) => check.pass);
}

/** Each stage's view, the cold stages then the final one, with its hash. */
export function packetStages(
  bank: Bank,
  record: BankItem,
  pass: Pass,
  orderKey?: OrderKey,
): { view: ColdEntry; sha256: string }[] {
  const views = [
    ...coldStages(bank, record, pass, orderKey),
    revealView(bank, record, pass, orderKey),
  ];
  const hashes = stageHashes(record.id, record.item, pass);
  return views.map((view, i) => ({ view, sha256: hashes[i] ?? "" }));
}

// ---------------------------------------------------------------------------
// The serve log: what each item's packet has served, and when (§9.4)
// ---------------------------------------------------------------------------

export const ServedStageSchema = z.strictObject({
  stage: z.int().min(1),
  sha256: sha256Hex,
  servedAt: isoDateTime,
});

export const ServedItemSchema = z.strictObject({
  /** How many stages the item's packet has: cold stages plus the final. */
  stages: z.int().min(2),
  served: z.array(ServedStageSchema),
  /** Times the packet was started over (content:packets without --next). */
  restarts: z.int().min(0),
});
export type ServedItem = z.infer<typeof ServedItemSchema>;

export const ServeLogSchema = z.strictObject({
  batchId: z.string(),
  pass: z.enum(["A", "B", "T"]),
  packetVersion: z.literal(STAGED_PACKET_VERSION),
  items: z.record(z.string(), ServedItemSchema),
});
export type ServeLog = z.infer<typeof ServeLogSchema>;

/** The folder of one batch's packets for one pass. */
export function packetDir(
  layout: Layout,
  batchId: string,
  pass: string,
): string {
  return join(layout.packetsDir, batchId, pass);
}

export const SERVE_LOG = "served.json";

/** The serve log of a batch's pass, or null when no packet was built. */
export function readServeLog(
  layout: Layout,
  batchId: string,
  pass: Pass,
): ServeLog | null {
  const path = join(packetDir(layout, batchId, pass), SERVE_LOG);
  if (!existsSync(path)) return null;
  const parsed = ServeLogSchema.safeParse(
    JSON.parse(readFileSync(path, "utf8")),
  );
  return parsed.success ? parsed.data : null;
}

/** The file one served stage of an item is written to, inside the pass folder. */
export function stageFile(itemId: string, stage: number): string {
  return join(itemId, `stage-${stage}.json`);
}

/**
 * Why stage `next` may not be served yet: the draft record lacks the
 * cold-solve entry for the stage before, with its recordedAt, or that entry
 * was recorded before its stage was served or in the future. Null when it
 * may be served.
 */
export function nextStageBlocked(
  served: ServedItem,
  coldSolve: ColdSolve | null | undefined,
  now: string,
): string | null {
  const last = served.served.at(-1);
  if (!last) return "no stage has been served yet";
  if (last.stage >= served.stages) return "every stage has been served";
  const recordedAt = coldSolveTimes(coldSolve).get(last.stage);
  if (recordedAt === undefined)
    return `the draft record holds no cold-solve entry for stage ${last.stage} with its recordedAt`;
  if (Date.parse(recordedAt) < Date.parse(last.servedAt))
    return `the stage ${last.stage} cold-solve entry is recorded before stage ${last.stage} was served`;
  if (Date.parse(recordedAt) > Date.parse(now))
    return `the stage ${last.stage} cold-solve entry is recorded in the future`;
  return null;
}

/**
 * Why a staged record does not match what its packet served (§9.4, §9.8),
 * empty when it does: every stage served, the record's hashes and served
 * times those of the serve log, and the item still the one the stages
 * showed.
 */
export function servedMismatch(
  itemId: string,
  item: AnyItem,
  pass: Pass,
  record: {
    packetSha256: string | readonly string[];
    stagesServedAt?: readonly string[] | undefined;
  },
  served: ServedItem | undefined,
): string[] {
  if (typeof record.packetSha256 === "string")
    return [
      "packetSha256 holds one hash per stage served, with stagesServedAt beside it, as content:packets serves them (§9.4, §9.8); take the packet's stages with content:packets -- --next",
    ];
  if (!served)
    return [
      `no packet of pass ${pass} was served for this item; build it with content:packets and take its stages in turn`,
    ];
  const out: string[] = [];
  if (served.served.length !== served.stages)
    out.push(
      `${served.served.length} of the packet's ${served.stages} stages were served; the record comes after the final stage`,
    );
  const hashes = served.served.map((stage) => stage.sha256);
  const times = served.served.map((stage) => stage.servedAt);
  const same = (a: readonly string[], b: readonly string[] | undefined) =>
    b !== undefined && a.length === b.length && a.every((v, i) => v === b[i]);
  if (!same(hashes, record.packetSha256))
    out.push(
      "packetSha256 is not the list of hashes content:packets served for this item, in order",
    );
  if (!same(times, record.stagesServedAt))
    out.push(
      "stagesServedAt is not the list of times content:packets served this item's stages, in order",
    );
  if (!packetMatches(itemId, item, pass, hashes))
    out.push(
      `the item changed after its pass ${pass} packet was served; build the packet again and check again`,
    );
  return out;
}

const INSTRUCTIONS: Record<Pass, string[]> = {
  A: [
    "Brief: confirm (CONTENT_GUIDE §9.4). Verify every claim as a subject expert; gather dataset or web evidence for every high-risk claim.",
  ],
  B: [
    "Brief: refute (CONTENT_GUIDE §9.4). Try to break each item: a second defensible answer, an outdated fact, a regional misreading, a trick reading or a giveaway.",
  ],
  T: [
    "Brief: tiebreak (CONTENT_GUIDE §9.7). Check the disputed claims only, with external evidence (dataset or web) for each.",
  ],
};

/** What every staged packet file tells the checker. */
export function stagedInstructions(
  batchId: string,
  pass: Pass,
  name = "content:packets",
): string[] {
  return [
    ...INSTRUCTIONS[pass],
    `Each item comes in stages (CONTENT_GUIDE §9.4): one stage for most items, then the final stage with the key and the claims; a mystery gives one clue per stage, the four options with clue 4. Before asking for the next stage, write the cold-solve entry for the stage you hold, with its recordedAt, in your draft record file (mysteries: perClue, one entry per clue, with every candidate you would consider, checked against the list file); then run: npm run ${name} -- --batch ${batchId} --pass ${pass} --next --record <draft.json>. The tool serves nothing before that entry exists. Candidates other than the answer left after clue 3 go in an ambiguity or second_answer issue, and rule out confirming the uniqueness claim.`,
    `After the final stage, write one CheckRecord per item (§9.8) with the packetSha256 and stagesServedAt lists the final stage gives, then run: npm run content:record -- --batch ${batchId} --pass ${pass} --file <records.json>.`,
    "Never edit an item, never search the item's text to find a quiz site, and never cite a source you did not retrieve (§9.4, §9.6).",
  ];
}
