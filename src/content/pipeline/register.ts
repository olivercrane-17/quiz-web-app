/**
 * The batch register (CONTENT_GUIDE §11.3): the production plan, opening
 * batches, issuing ids, submitting and closing.
 */
import type {
  BatchEntry,
  BatchPlan,
  BatchRegister,
} from "../schema/batches.ts";
import { MYSTERY_ANSWER_TYPES, PACK_TABLE } from "../schema/categories.ts";
import {
  ANSWER_TYPES,
  CATEGORY_CODES,
  PACK_IDS,
  type AnswerType,
  type CategoryCode,
} from "../schema/primitives.ts";
import type { Bank, BankItem } from "./bank.ts";
import {
  batchForItem,
  batchIdFor,
  firstSequence,
  itemIdFor,
  maxSequence,
  parseBatchId,
  parseItemId,
} from "./ids.ts";

/** Writers draft about 15% over the accepted target. */
export const DRAFT_MARGIN = 0.15;
export const draftFor = (target: number) =>
  Math.ceil(target * (1 + DRAFT_MARGIN));

/**
 * The run id of an agent id (`fc-abc` -> `abc`), so one run in two roles is
 * caught. Case is ignored: `fc-ABC` and `w-abc` are the same run.
 */
export function runIdOf(agentId: string): string {
  return agentId.toLowerCase().replace(/^[a-z]+-/, "");
}

export function sameAgentRun(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return runIdOf(a) === runIdOf(b);
}

/** True when `agent` is the same run as any of `others`. */
export function anyAgentRun(
  agent: string | null | undefined,
  others: readonly (string | null | undefined)[],
): boolean {
  return others.some((other) => sameAgentRun(agent, other));
}

/**
 * WebSearch caps per batch (§9.5.2) are set for the guide's batch sizes
 * (25 practice, 10 mysteries, 10 encores, 15 room questions, about 100 list
 * entries). Bigger batches get a proportional cap.
 */
const SEARCH_BASE = {
  practice: [10, 25],
  mystery: [15, 10],
  encore: [12, 10],
  room: [8, 15],
  list: [5, 100],
} as const;

export function searchBudget(batch: BatchEntry): number {
  const [base, size] = SEARCH_BASE[batch.pool];
  return Math.ceil((base * batch.plan.target) / size);
}

export function findBatch(
  register: BatchRegister | null,
  batchId: string,
): BatchEntry | undefined {
  return register?.batches.find((batch) => batch.batchId === batchId);
}

export function requireBatch(bank: Bank, batchId: string): BatchEntry {
  if (!bank.register)
    throw new Error("no batch register (content/batches.json)");
  const batch = findBatch(bank.register, batchId);
  if (!batch) throw new Error(`${batchId} is not in the batch register`);
  return batch;
}

/** The items of a batch, in id order. */
export function batchItems(bank: Bank, batchId: string): BankItem[] {
  if (!bank.register) return [];
  return bank.items
    .filter((record) => {
      const parsed = parseItemId(record.id);
      return (
        parsed !== null &&
        batchForItem(bank.register as BatchRegister, parsed)?.batchId ===
          batchId
      );
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function entry(
  batchId: string,
  plan: BatchPlan,
  scope: Partial<BatchEntry> = {},
): BatchEntry {
  const parsed = parseBatchId(batchId);
  if (!parsed) throw new Error(`bad batch id ${batchId}`);
  return {
    batchId,
    pool: parsed.pool,
    ...scope,
    writer: null,
    status: "planned",
    plan,
    accepted: null,
    cut: null,
    lastSequence: 0,
    incidents: [],
  };
}

/** List batches sized to the §11.4 minimums, with their domains. */
const LIST_PLAN: [AnswerType, number, string[]][] = [
  [
    "country",
    190,
    [
      "All countries, from CLDR 49 English names checked against mledoze-countries",
    ],
  ],
  [
    "element",
    118,
    ["All 118 confirmed elements, from ptable numbers and IUPAC names"],
  ],
  [
    "city",
    100,
    [
      "Africa and Asia, checked against geonames-cities",
      "Europe, checked against geonames-cities",
      "The Americas and Oceania, checked against geonames-cities",
    ],
  ],
  [
    "person",
    100,
    [
      "Science and invention",
      "Exploration",
      "History and politics before 2001",
      "Art and architecture (QIDs from moma-artists)",
      "Literature",
      "Film and TV",
      "Sport",
      "Philosophy and religion",
      "Society and economics",
      "A mixed batch of famous names",
    ],
  ],
  [
    "film",
    100,
    [
      "Before 1970",
      "1970 to 1989",
      "1990 to 1999",
      "2000 to 2019",
      "Films from outside the US and UK, every decade",
    ],
  ],
  ["tv_series", 100, ["Europe, Africa, Asia and Oceania", "The Americas"]],
  ["book", 100, ["Classics", "World literature", "Children's books"]],
  [
    "animal",
    100,
    [
      "Land animals of every continent",
      "Sea and freshwater animals",
      "Birds, insects and other animals of the air",
    ],
  ],
  ["landmark", 100, ["Built landmarks", "Natural landmarks"]],
  [
    "music_artist",
    100,
    [
      "Composers",
      "Pop and rock of the 1950s and 1960s",
      "Pop and rock of the 1970s and 1980s",
      "Pop and rock from 1990 on",
      "Music from beyond the US and UK",
    ],
  ],
  ["dish", 100, ["Dishes", "Drinks"]],
  ["sport", 100, ["Sports, then games of every kind"]],
];

/**
 * The production plan this register starts with (accepted targets; writers
 * draft about 15% more):
 * - practice: p.<cat>.b01 and b02 per category, 63 each (mc 50, tf 6,
 *   comparison 7; easy 25, medium 25, hard 13 by seededDifficulty band);
 * - mysteries: m.<cat>.b01 per category, 30 each (10 per slot);
 * - encores: e.b01 to e.b03, 40 each, spread over all twelve categories;
 * - rooms: r.<pack>.b01 for the eight packs, 15 each (6, 6 and 3);
 * - lists: l.<type>.bNN sized to the §11.4 minimums.
 */
export function productionPlan(): BatchRegister {
  const batches: BatchEntry[] = [];
  for (const category of CATEGORY_CODES) {
    for (const number of [1, 2]) {
      batches.push(
        entry(
          batchIdFor("practice", category, number),
          {
            target: 63,
            draft: draftFor(63),
            difficulty: { easy: 25, medium: 25, hard: 13 },
            format: { mc: 50, tf: 6, comparison: 7 },
            note: "Cover at least four subtopics, none above 30% of the category; about a quarter counterintuitive (§11.4).",
          },
          { category },
        ),
      );
    }
  }
  for (const category of CATEGORY_CODES) {
    const types = MYSTERY_ANSWER_TYPES[category];
    batches.push(
      entry(
        batchIdFor("mystery", category, 1),
        {
          target: 30,
          draft: draftFor(30),
          difficulty: { easy: 10, medium: 10, hard: 10 },
          answerTypes: types === "any" ? [...ANSWER_TYPES] : [...types],
          note: "Slots 1, 2 and 3 are easy, medium and hard. Use at least two answer types where the category allows; no answer repeats anywhere in the bank (§11.4).",
        },
        { category },
      ),
    );
  }
  const groups: CategoryCode[][] = [
    ["geo", "hist", "sci", "nat"],
    ["film", "music", "art", "book"],
    ["sport", "food", "lang", "soc"],
  ];
  groups.forEach((heavy, i) => {
    const categories = Object.fromEntries(
      CATEGORY_CODES.map((code) => [code, heavy.includes(code) ? 4 : 3]),
    ) as Partial<Record<CategoryCode, number>>;
    batches.push(
      entry(batchIdFor("encore", undefined, i + 1), {
        target: 40,
        draft: draftFor(40),
        categories,
        maxYearEncores: 10,
        note: "Each category gets 10 encores across e.b01 to e.b03. Years at most a quarter (§6 rule 9).",
      }),
    );
  });
  for (const packId of PACK_IDS) {
    batches.push(
      entry(
        batchIdFor("room", packId, 1),
        {
          target: 15,
          draft: draftFor(15),
          difficulty: { easy: 6, medium: 6, hard: 3 },
          categories: PACK_TABLE[packId].categories,
          note: `${PACK_TABLE[packId].title}: ${PACK_TABLE[packId].theme}. Positions 1 to 3 easy, finale medium (§10.9).`,
        },
        { packId },
      ),
    );
  }
  for (const [type, perBatch, domains] of LIST_PLAN) {
    domains.forEach((domain, i) => {
      batches.push(
        entry(
          batchIdFor("list", type, i + 1),
          {
            target: perBatch,
            draft: type === "element" ? perBatch : draftFor(perBatch),
            domain,
          },
          { answerType: type },
        ),
      );
    });
  }
  return { batches };
}

export interface OpenOptions {
  writer: string;
  /** For a batch not yet in the register: the accepted target. */
  target?: number;
}

/** planned -> open, naming the writer. Creates top-up batches on demand. */
export function openBatch(
  register: BatchRegister,
  batchId: string,
  options: OpenOptions,
): BatchEntry {
  let batch = findBatch(register, batchId);
  if (!batch) {
    const parsed = parseBatchId(batchId);
    if (!parsed) throw new Error(`${batchId} is not a batch id`);
    if (options.target === undefined) {
      throw new Error(
        `${batchId} is not in the register; pass --target <n> to add it`,
      );
    }
    const scope: Partial<BatchEntry> =
      parsed.pool === "practice" || parsed.pool === "mystery"
        ? { category: parsed.scope as CategoryCode }
        : parsed.pool === "room"
          ? { packId: String(parsed.scope) }
          : parsed.pool === "list"
            ? { answerType: parsed.scope as AnswerType }
            : {};
    batch = entry(
      batchId,
      { target: options.target, draft: draftFor(options.target) },
      scope,
    );
    register.batches.push(batch);
  }
  if (batch.status !== "planned")
    throw new Error(`${batchId} is ${batch.status}, not planned`);
  const role = batch.pool === "list" ? "lb-" : "w-";
  if (!options.writer.startsWith(role))
    throw new Error(`${batch.pool} batches are written by ${role} agents`);
  batch.writer = options.writer;
  batch.status = "open";
  return batch;
}

/** The id range a batch may use, as first and last ids. Lists have none. */
export function idRange(
  register: BatchRegister,
  batch: BatchEntry,
): { first: string; last: string } | null {
  if (batch.pool === "list") return null;
  const parsed = parseBatchId(batch.batchId);
  if (!parsed) return null;
  return {
    first: itemIdFor(parsed, firstSequence(register, batch)),
    last: itemIdFor(parsed, maxSequence(batch.pool)),
  };
}

/** Issues the next `count` ids to the batch's writer and bumps lastSequence. */
export function issueIds(
  register: BatchRegister,
  batchId: string,
  writer: string,
  count: number,
): string[] {
  const batch = findBatch(register, batchId);
  if (!batch) throw new Error(`${batchId} is not in the register`);
  if (batch.pool === "list")
    throw new Error(
      "list batches add entities with x.<type>.<slug> ids, not issued ids",
    );
  if (batch.status !== "open")
    throw new Error(
      `${batchId} is ${batch.status}; ids are issued only while it is open`,
    );
  if (batch.writer !== writer)
    throw new Error(
      `${batchId} is registered to ${String(batch.writer)}, not ${writer}`,
    );
  if (!Number.isInteger(count) || count < 1)
    throw new Error("count must be a positive whole number");
  const parsed = parseBatchId(batchId);
  if (!parsed) throw new Error(`${batchId} is not a batch id`);
  const start = Math.max(
    batch.lastSequence + 1,
    firstSequence(register, batch),
  );
  const end = start + count - 1;
  if (end > maxSequence(batch.pool)) {
    throw new Error(
      `${batchId} can issue up to sequence ${maxSequence(batch.pool)}; ${end} asked for. Open a top-up batch.`,
    );
  }
  batch.lastSequence = end;
  const ids: string[] = [];
  for (let sequence = start; sequence <= end; sequence += 1)
    ids.push(itemIdFor(parsed, sequence));
  return ids;
}
