/**
 * Blind packets for fact-checkers (CONTENT_GUIDE §9.4).
 *
 * For each item and pass the tooling builds:
 * - cold stages: what a player sees before answering (the prompt, options
 *   in a per-pass order, the category and answer type). A mystery has four
 *   stages, written as cold-1.json to cold-4.json: stage k holds clues 1 to
 *   k, and the four clue-4 options arrive only with stage 4, so a checker
 *   records candidates clue by clue (the staged clue reveal, ARCHITECTURE
 *   §5.8). Every other item has one stage, cold.json. No stage holds the
 *   key, writerNotes, claims, risk notes, verification or difficulty.
 * - reveal: the full cold view plus the key, the explanation and the item's
 *   claims (with their risk, so checker A knows what needs external
 *   evidence). Still no writerNotes, no rivals or likely guesses, no
 *   estimate and no other checker's record.
 *
 * Option order. Options are shuffled with a seed only the key holder can
 * compute, HMAC-SHA256(k_order, "<itemId>|<pass>") with k_order derived from
 * the content key (seal.ts). A public seed would let anyone undo the shuffle
 * and read the key's position off cold.json. Without an order key (hashing,
 * record validation, the estimator's packet, which shows the key anyway)
 * options are sorted, which says nothing about which one is the key.
 *
 * packetSha256 is the SHA-256 of the canonical JSON of the packet version,
 * the pass, the item id and every item field the packets show (PACKET_FIELDS
 * below, across all stages). Derived text such as entity display names,
 * category names and myth hits, and the option order, stay out of it: the
 * hash proves which item content the checker judged, it can be recomputed
 * without the content key, and a reference-file change never invalidates a
 * check. content:record, content:decide and content:check recompute it from
 * the current item, so an item edited after its checks never goes active on
 * them. Changing what a packet shows means a new PACKET_VERSION, and the
 * previous version's hash must stay verifiable for items already accepted.
 */
import { createHash, createHmac } from "node:crypto";

import { CATEGORY_TABLE } from "../schema/categories.ts";
import type { AnyItem, Mystery } from "../schema/items.ts";
import { BRIEF_FOR_PASS, type Pass } from "../schema/verification.ts";
import type { Bank, BankItem } from "./bank.ts";
import { stableStringify } from "./json.ts";
import { mythMatches } from "./references.ts";

export const PACKET_VERSION = 2;

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

/** The passes whose recorded packetSha256 no longer matches the item. */
export function changedSinceChecks(itemId: string, item: AnyItem): Pass[] {
  const v = item.verification;
  const records = [...(v?.checks ?? []), ...(v?.tiebreak ? [v.tiebreak] : [])];
  return records
    .filter(
      (check) => check.packetSha256 !== packetSha256(itemId, item, check.pass),
    )
    .map((check) => check.pass);
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

const SOLVE_SINGLE =
  "Solve every item in cold.json before opening reveal.json.";
const SOLVE_STAGED =
  "Mysteries come in stages: open cold-1.json, record your guess and every candidate you would consider for each item at clue 1, then open cold-2.json, and so on to cold-4.json, which adds clue 4 and the four options. Never open a stage before recording the one before it. Only then open reveal.json. Candidates other than the answer left after clue 3 go in an ambiguity or second_answer issue, and rule out confirming the uniqueness claim.";

const COMMON_INSTRUCTIONS = [
  "Write one CheckRecord per item (§9.8) with this item's packetSha256, then run: npm run content:record -- --batch <batch> --pass <pass> --file <records.json>.",
  "Never edit an item, never search the item's text to find a quiz site, and never cite a source you did not retrieve (§9.4, §9.6).",
];

export interface PacketFile {
  /** File name inside .cache/packets/<batch>/<pass>/. */
  name: string;
  content: unknown;
}

/**
 * The files of one batch packet: cold.json (or cold-1.json to cold-4.json
 * for mysteries) and reveal.json, each item carrying its packetSha256.
 */
export function packetFiles(
  batchId: string,
  pass: Pass,
  entries: PacketEntry[],
  generatedAt: string,
): PacketFile[] {
  const steps = Math.max(1, ...entries.map((entry) => entry.stages.length));
  const header = {
    batchId,
    pass,
    brief: BRIEF_FOR_PASS[pass],
    packetVersion: PACKET_VERSION,
    generatedAt,
    instructions: [
      ...INSTRUCTIONS[pass],
      steps > 1 ? SOLVE_STAGED : SOLVE_SINGLE,
      ...COMMON_INSTRUCTIONS,
    ],
  };
  const files: PacketFile[] = [];
  for (let step = 1; step <= steps; step += 1) {
    files.push({
      name: steps === 1 ? "cold.json" : `cold-${step}.json`,
      content: {
        ...header,
        stage: "cold",
        step,
        steps,
        items: entries.flatMap((entry) => {
          const stage = entry.stages[step - 1];
          return stage ? [{ packetSha256: entry.packetSha256, ...stage }] : [];
        }),
      },
    });
  }
  files.push({
    name: "reveal.json",
    content: {
      ...header,
      stage: "reveal",
      items: entries.map((entry) => ({
        packetSha256: entry.packetSha256,
        ...entry.reveal,
      })),
    },
  });
  return files;
}
