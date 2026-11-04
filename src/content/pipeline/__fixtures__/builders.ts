/**
 * Builders for invented `fx.` test content. Every name, place and number
 * here is made up (Arvenna, Cindral, the Vellum river): fixtures never carry
 * real facts, so nothing in them can leak into the bank or be mistaken for
 * checked content.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type { RecordInputEntry } from "../../schema/inputs.ts";
import type {
  Encore,
  McItem,
  Mystery,
  RoomQuestion,
  TfItem,
  ComparisonItem,
} from "../../schema/items.ts";
import type { CheckRecord, Pass } from "../../schema/verification.ts";
import { loadBank, type Bank, type BankItem } from "../bank.ts";
import { resolveLayout } from "../layout.ts";
import {
  STAGED_PACKET_VERSION,
  stageHashes,
  type ServeLog,
} from "../packets.ts";

export const REPO_ROOT = resolve(import.meta.dirname, "../../../..");
export const FIXTURE_BANK = resolve(import.meta.dirname, "bank");

/** The real pinned commit of a manifest dataset, for dataset evidence. */
export const MLEDOZE_COMMIT = "6031f5df137c41c76d180c55a0782185ae3ed05b";
export const PTABLE_COMMIT = "a78c7a48fe7235cebd6153161a9e7fa70f0cfb30";

export const WRITER = "w-fx-writer";
export const CHECKER_A = "fc-fx-alpha";
export const CHECKER_B = "fc-fx-bravo";
export const CHECKER_T = "fc-fx-tango";
export const EDITOR = "ed-fx-editor";

type Json = Record<string, unknown>;

export const COUNTRY_NAMES = [
  "Arvenna",
  "Belloria",
  "Cassova",
  "Dravenor",
  "Elmaris",
  "Fendara",
  "Gorlund",
  "Halvessa",
  "Istrova",
  "Jarnholm",
  "Kestavia",
  "Lorvenn",
  "Marisca",
  "Norvaal",
  "Ostrevia",
  "Pellandra",
  "Quoravia",
  "Rendolin",
  "Saltrea",
  "Tovaria",
  "Ulmerra",
  "Vastrel",
  "Wendmoor",
  "Xandrel",
  "Yorvane",
  "Zelmora",
  "Ambrelle",
  "Brontavia",
  "Corrindel",
  "Dunmarra",
  "Estravel",
  "Falkenor",
];
const ISO = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
  .map((ch) => `X${ch}`)
  .concat(["QM", "QN", "QO", "QP", "QQ", "QR"]);

export const countryId = (name: string) => `fx.x.country.${name.toLowerCase()}`;

export function fxCountryList(count = COUNTRY_NAMES.length): Json {
  return {
    type: "country",
    version: "2026-09-01",
    provenance: [
      {
        source: "invented fixture names",
        license: "CC0-1.0",
        retrievedAt: "2026-09-01",
      },
    ],
    entities: COUNTRY_NAMES.slice(0, count).map((name, i) => ({
      id: countryId(name),
      name,
      display: name,
      aliases: name === "Arvenna" ? ["Arven Republic"] : [],
      popularity: 0,
      qualifier: { iso_a2: ISO[i] },
      source: "l.country.b01",
      status: "active",
      addedIn: "2026-09-01",
      wikidataId: null,
      replacedBy: null,
    })),
  };
}

export function fxMc(overrides: Partial<McItem> & Json = {}): McItem {
  return {
    id: "fx.p.geo.0101",
    status: "draft",
    format: "mc",
    category: "geo",
    tags: ["fixtures", "rivers"],
    region: "global",
    volatility: "evergreen",
    reviewBy: null,
    seededDifficulty: 2,
    counterintuitive: false,
    stem: "Which instrument opens the spring festival in the fixture town of Halvessa?",
    answer: "Bone flute",
    wrong: ["Brass horn", "Hand drum", "Reed pipe"],
    order: "shuffle",
    explanation:
      "Halvessan players carve the flute from a heron bone washed up on the shore, a custom the town dates to 1204.",
    learnMore: "Halvessa spring festival (fixture)",
    claims: [
      {
        id: "c1",
        role: "key",
        risk: "standard",
        text: "A bone flute opens the Halvessa spring festival.",
      },
      {
        id: "c2",
        role: "distractor",
        risk: "standard",
        text: "No brass horn, hand drum or reed pipe opens the festival.",
      },
      {
        id: "c3",
        role: "explanation",
        risk: "high",
        riskReason: "date",
        text: "Halvessa dates the bone-flute custom to 1204.",
      },
    ],
    writerNotes:
      "Invented fixture. Checked against nothing: it is not a real fact.",
    ...overrides,
  } as McItem;
}

export function fxTf(overrides: Partial<TfItem> & Json = {}): TfItem {
  return {
    id: "fx.p.geo.0102",
    status: "draft",
    format: "tf",
    category: "geo",
    tags: ["fixtures", "calendars"],
    region: "global",
    volatility: "evergreen",
    reviewBy: null,
    seededDifficulty: 3,
    counterintuitive: true,
    stem: "The fixture town of Istrova repaints every front door in a new colour each spring.",
    answer: true,
    tfKind: "surprising_truth",
    explanation:
      "The colour is drawn by lot at the town hall, and doors left unpainted pay a small fine.",
    learnMore: "Istrova doors (fixture)",
    claims: [
      {
        id: "c1",
        role: "key",
        risk: "standard",
        text: "Istrova repaints its front doors in a new colour each spring.",
      },
      {
        id: "c2",
        role: "explanation",
        risk: "standard",
        text: "The Istrova door colour is drawn by lot.",
      },
    ],
    writerNotes: "Invented fixture.",
    ...overrides,
  } as TfItem;
}

export function fxComparison(
  overrides: Partial<ComparisonItem> & Json = {},
): ComparisonItem {
  return {
    id: "fx.p.geo.0103",
    status: "draft",
    format: "comparison",
    category: "geo",
    tags: ["fixtures", "towers"],
    region: "global",
    volatility: "evergreen",
    reviewBy: null,
    seededDifficulty: 4,
    counterintuitive: false,
    stem: "Which fixture tower is taller?",
    a: "Brindle Tower",
    b: "Corvo Tower",
    answer: "a",
    relation: "taller",
    measure: "height to the roof",
    unit: "m",
    values: { a: 320, b: 250 },
    valueDisplay: { a: "320 m", b: "250 m" },
    explanation:
      "Brindle Tower stands on a hill as well, so it looks even taller from the harbour.",
    learnMore: "Brindle Tower (fixture)",
    claims: [
      {
        id: "c1",
        role: "label",
        ref: "a",
        risk: "high",
        riskReason: "number",
        text: "Brindle Tower is 320 m tall.",
      },
      {
        id: "c2",
        role: "label",
        ref: "b",
        risk: "high",
        riskReason: "number",
        text: "Corvo Tower is 250 m tall.",
      },
      {
        id: "c3",
        role: "explanation",
        risk: "standard",
        text: "Brindle Tower stands on a hill.",
      },
    ],
    writerNotes: "Invented fixture.",
    ...overrides,
  } as ComparisonItem;
}

export function fxMystery(overrides: Partial<Mystery> & Json = {}): Mystery {
  return {
    id: "fx.m.geo.0101",
    kind: "mystery",
    status: "draft",
    category: "geo",
    tags: ["fixtures", "invented-countries"],
    region: "global",
    volatility: "evergreen",
    reviewBy: null,
    seededDifficulty: 2,
    counterintuitive: false,
    answerType: "country",
    answer: countryId("Arvenna"),
    accepted: [],
    clues: [
      "Its fixture flag shows a silver heron above three blue waves.",
      "Its calendar has thirteen months of 28 days.",
      "The Vellum river runs through its capital, Cindral.",
      "This invented fixture country is the home of the seven bridges of Cindral.",
    ],
    distractors: [
      countryId("Belloria"),
      countryId("Cassova"),
      countryId("Dravenor"),
    ],
    slot: 1,
    sourceLabels: [],
    likelyGuesses: [
      "Belloria",
      "Cassova",
      "Dravenor",
      "Elmaris",
      "Fendara",
      "Gorlund",
    ].map(countryId),
    rivals: [
      { id: countryId("Belloria"), ruledOutBy: [1, 2] },
      { id: countryId("Cassova"), ruledOutBy: [2, 3] },
      { id: countryId("Elmaris"), ruledOutBy: [1, 3] },
    ],
    giveawayTerms: ["Arvennan"],
    seedSolveShares: [0.5, 0.8, 0.92, 0.98],
    explanation:
      "The heron on the flag nests by the Vellum, so all four clues point to the same river valley.",
    learnMore: "Arvenna (fixture)",
    claims: [
      {
        id: "c1",
        role: "uniqueness",
        risk: "standard",
        text: "Only Arvenna fits clues 1 to 3.",
      },
      {
        id: "c2",
        role: "clue",
        ref: "clue:1",
        risk: "standard",
        text: "The Arvennan flag shows a silver heron above three waves.",
      },
      {
        id: "c3",
        role: "clue",
        ref: "clue:2",
        risk: "standard",
        text: "The Arvennan calendar has thirteen months.",
      },
      {
        id: "c4",
        role: "clue",
        ref: "clue:3",
        risk: "standard",
        text: "Cindral, the capital of Arvenna, lies on the Vellum.",
      },
      {
        id: "c5",
        role: "clue",
        ref: "clue:4",
        risk: "standard",
        text: "Cindral has seven bridges.",
      },
      {
        id: "c6",
        role: "distractor",
        risk: "standard",
        text: "Belloria, Cassova and Dravenor contradict clues 1 to 3.",
      },
      {
        id: "c7",
        role: "explanation",
        risk: "standard",
        text: "Herons nest along the Vellum.",
      },
    ],
    writerNotes: "Invented fixture.",
    ...overrides,
  } as Mystery;
}

export function fxEncore(overrides: Partial<Encore> & Json = {}): Encore {
  return {
    id: "fx.e.0101",
    kind: "encore",
    status: "draft",
    category: "geo",
    tags: ["fixtures", "bridges"],
    region: "global",
    volatility: "evergreen",
    reviewBy: null,
    seededDifficulty: 3,
    counterintuitive: false,
    question: "How many steps lead up to the fixture lighthouse of Gorlund?",
    valueKind: "quantity",
    answer: 212,
    decimals: 0,
    unit: "steps",
    unitShort: "steps",
    unitLabel: "steps",
    bands: null,
    sourceLabels: [],
    derivation: null,
    explanation:
      "The keepers added 12 steps in 1890 when the lamp room was raised above the spray.",
    learnMore: "Gorlund lighthouse (fixture)",
    claims: [
      {
        id: "c1",
        role: "value",
        risk: "high",
        riskReason: "number",
        text: "212 steps lead up the Gorlund lighthouse.",
      },
      {
        id: "c2",
        role: "explanation",
        risk: "high",
        riskReason: "date",
        text: "Twelve steps were added in 1890.",
      },
    ],
    writerNotes: "Invented fixture.",
    ...overrides,
  } as Encore;
}

const ROOM_WORDS = [
  "Amber",
  "Basalt",
  "Cobalt",
  "Damask",
  "Ermine",
  "Flint",
  "Garnet",
  "Hazel",
  "Indigo",
  "Jasper",
  "Kelp",
  "Lapis",
  "Madder",
  "Nacre",
  "Ochre",
  "Pewter",
];
const ROOM_SUBJECTS = [
  "main square",
  "stone bridge",
  "harbour light",
  "spring fair",
  "royal barge",
  "town choir",
  "north gate",
  "night market",
  "river ferry",
  "glass works",
  "rowing club",
  "herb garden",
  "clock tower",
  "ice rink",
  "brass band",
];

/** Room question NN of the fixture pack fx-party, difficulty from the template. */
export function fxRoomQuestion(
  n: number,
  overrides: Partial<RoomQuestion> & Json = {},
): RoomQuestion {
  const nn = String(n).padStart(2, "0");
  // Template: 1-3 easy, then a mix with hard at 6, 10 and 13, finale medium.
  const seeds = [1, 2, 1, 2, 3, 5, 3, 4, 2, 5, 3, 4, 5, 2, 3];
  const word = ROOM_WORDS[(n - 1) % ROOM_WORDS.length] ?? "Amber";
  const subject =
    ROOM_SUBJECTS[(n - 1) % ROOM_SUBJECTS.length] ?? "main square";
  const options = [
    word,
    ...ROOM_WORDS.filter((w) => w !== word).slice(n % 5, (n % 5) + 3),
  ];
  return {
    id: `fx.r.fx-party.${nn}`,
    kind: "choice",
    status: "draft",
    format: "mc",
    category: "geo",
    tags: ["fixtures"],
    region: "global",
    volatility: "evergreen",
    reviewBy: null,
    seededDifficulty: (seeds[n - 1] ?? 3) as RoomQuestion["seededDifficulty"],
    counterintuitive: false,
    stem: `In fixture Cindral, which name does the ${subject} carry?`,
    answer: options[0] as string,
    wrong: options.slice(1) as [string, string, string],
    order: "shuffle",
    explanation: `The ${subject} took the name in a vote of ${100 + n * 7} residents.`,
    learnMore: `Cindral ${subject} (fixture)`,
    claims: [
      {
        id: "c1",
        role: "key",
        risk: "standard",
        text: `The Cindral ${subject} is named ${String(options[0])}.`,
      },
      {
        id: "c2",
        role: "distractor",
        risk: "standard",
        text: `The ${subject} has none of the other three names.`,
      },
      {
        id: "c3",
        role: "explanation",
        risk: "standard",
        text: `${100 + n * 7} residents voted on the name.`,
      },
    ],
    writerNotes: "Invented fixture.",
    ...overrides,
  } as RoomQuestion;
}

export function fxPack(questions: RoomQuestion[]): Json {
  return {
    id: "fx-party",
    title: "Fixture Party",
    theme: "Invented places for tests",
    questions,
  };
}

/** A fixture register: open batches for the fixture writer. */
export function fxRegister(
  overrides: { status?: string; lastSequence?: number } = {},
): Json {
  const status = overrides.status ?? "open";
  const last = overrides.lastSequence ?? 20;
  const base = {
    writer: WRITER,
    status,
    accepted: null,
    cut: null,
    incidents: [],
  };
  return {
    batches: [
      {
        batchId: "p.geo.b01",
        pool: "practice",
        category: "geo",
        ...base,
        plan: { target: 10, draft: 12 },
        lastSequence: last,
      },
      {
        batchId: "m.geo.b01",
        pool: "mystery",
        category: "geo",
        ...base,
        plan: { target: 3, draft: 4 },
        lastSequence: last,
      },
      {
        batchId: "e.b01",
        pool: "encore",
        ...base,
        plan: { target: 3, draft: 4 },
        lastSequence: last,
      },
      {
        batchId: "r.fx-party.b01",
        pool: "room",
        packId: "fx-party",
        ...base,
        plan: { target: 15, draft: 18 },
        lastSequence: Math.max(last, 15),
      },
      {
        batchId: "l.country.b01",
        pool: "list",
        answerType: "country",
        writer: "lb-fx-builder",
        status,
        accepted: null,
        cut: null,
        incidents: [],
        plan: { target: 32, draft: 32 },
        lastSequence: 0,
      },
    ],
  };
}

/** The writer's self-check with every code true (§2.3, §9.3), as packets need. */
export const FX_SELF_CHECK = {
  lint: true,
  claims: true,
  datasets: true,
  rivalTest: true,
  volatility: true,
  regional: true,
  style: true,
  myths: true,
  mystery: true,
  encore: true,
  doubts: true,
} as const;

/** The usual fixture files, each item self-checked, as a submitted batch holds them. */
export function fxCheckedFiles(extra: FxFiles = {}): FxFiles {
  const files = fxFiles(extra);
  const out: FxFiles = {};
  for (const [path, value] of Object.entries(files)) {
    const item = value as Record<string, unknown> | undefined;
    out[path] =
      item && typeof item === "object" && "claims" in item
        ? { ...item, selfCheck: { ...FX_SELF_CHECK } }
        : value;
  }
  return out;
}

export interface FxFiles {
  [path: string]: unknown;
}

/** The usual small fixture bank: one item of each kind plus a country list. */
export function fxFiles(extra: FxFiles = {}): FxFiles {
  return {
    "batches.json": fxRegister(),
    "answer-lists/country.json": fxCountryList(),
    "practice/geography/fx.p.geo.0101.json": fxMc(),
    "practice/geography/fx.p.geo.0102.json": fxTf(),
    "practice/geography/fx.p.geo.0103.json": fxComparison(),
    "mysteries/fx.m.geo.0101.json": fxMystery(),
    "encores/fx.e.0101.json": fxEncore(),
    ...extra,
  };
}

const tempDirs: string[] = [];

/**
 * A new temporary folder. Every test file that makes one (directly or
 * through writeTree, loadFx or loadContentTree) calls
 * `afterAll(removeTempDirs)`, so no run leaves folders behind in /tmp.
 */
export function tempDir(prefix = "qz-content-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Removes every folder tempDir made in this test file. */
export function removeTempDirs(): void {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
}

/** Writes files into a new temporary folder and returns its path. */
export async function writeTree(files: FxFiles, dir?: string): Promise<string> {
  const root = dir ?? tempDir();
  for (const [path, value] of Object.entries(files)) {
    if (value === undefined) continue;
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      target,
      typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
    );
  }
  return root;
}

/** Loads a fixture tree, with the repository's categories, references and manifest. */
export async function loadFx(files: FxFiles = fxFiles()): Promise<Bank> {
  const root = await writeTree(files);
  return loadBank(resolveLayout({ repoRoot: REPO_ROOT, root, fixtures: true }));
}

/** Loads a content-kind tree (no fx. ids expected), still with the repo's references. */
export async function loadContentTree(files: FxFiles): Promise<Bank> {
  const root = await writeTree(files);
  return loadBank(
    resolveLayout({ repoRoot: REPO_ROOT, root, fixtures: false }),
  );
}

export function itemOf(bank: Bank, id: string): BankItem {
  const record = bank.itemsById.get(id);
  if (!record) throw new Error(`${id} is not in the fixture bank`);
  return record;
}

const BRIEF = { A: "confirm", B: "refute", T: "tiebreak" } as const;
const CHECKER = { A: CHECKER_A, B: CHECKER_B, T: CHECKER_T } as const;

const STAGE_START = Date.parse("2026-11-02T10:00:00Z");
const iso = (ms: number) =>
  new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** When a fixture packet's stages were served: one a minute from 10:00. */
export function fxStageTimes(count: number): string[] {
  return Array.from({ length: count }, (_, i) => iso(STAGE_START + i * 60_000));
}

/** When a fixture checker recorded stage k's cold solve: half a minute in. */
const recordedAt = (stage: number) =>
  iso(STAGE_START + (stage - 1) * 60_000 + 30_000);

/**
 * The serve log content:packets would hold after serving every stage of
 * each item's pass packet at fxStageTimes, as fxRecord's records repeat it.
 */
export function fxServeLog(
  batchId: string,
  pass: Pass,
  records: readonly BankItem[],
): ServeLog {
  const items: ServeLog["items"] = {};
  for (const record of records) {
    const hashes = stageHashes(record.id, record.item, pass);
    const times = fxStageTimes(hashes.length);
    items[record.id] = {
      stages: hashes.length,
      served: hashes.map((sha256, i) => ({
        stage: i + 1,
        sha256,
        servedAt: times[i] ?? "",
      })),
      restarts: 0,
    };
  }
  return {
    batchId,
    pass: pass as ServeLog["pass"],
    packetVersion: STAGED_PACKET_VERSION,
    items,
  };
}

/**
 * A complete, honest check record for a fixture item: every claim confirmed,
 * high-risk ones and a mystery's clue claims with dataset evidence (A and B
 * cite different datasets, so a claim has two independent sources; each
 * names a real pinned manifest entry, which is all the record validation
 * looks at).
 */
export function fxRecord(
  bank: Bank,
  record: BankItem,
  pass: Pass,
  overrides: Partial<RecordInputEntry> = {},
): RecordInputEntry {
  const item = record.item;
  const mystery = "kind" in item && item.kind === "mystery";
  const external = (claim: { risk: string; role: string }) =>
    claim.risk === "high" || (mystery && claim.role === "clue");
  let coldSolve: CheckRecord["coldSolve"];
  if ("kind" in item && item.kind === "mystery") {
    coldSolve = {
      perClue: [1, 2, 3, 4].map((clue) => ({
        clue,
        guess: item.answer,
        candidates: [item.answer],
        recordedAt: recordedAt(clue),
      })),
    };
  } else if ("kind" in item && item.kind === "encore") {
    coldSolve = {
      estimate: item.answer * 0.8,
      reasoning: "Seven in the city and a few dozen upstream.",
      recordedAt: recordedAt(1),
    };
  } else {
    const key =
      !("kind" in item) && item.format === "tf"
        ? item.answer
          ? "True"
          : "False"
        : !("kind" in item) && item.format === "comparison"
          ? item.answer === "a"
            ? item.a
            : item.b
          : (item as McItem).answer;
    coldSolve = {
      answerGiven: key,
      confidence: "high",
      matchedKey: true,
      recordedAt: recordedAt(1),
    };
  }
  // Every stage served at fxStageTimes, as fxServeLog logs it (§9.4).
  const hashes = stageHashes(record.id, item, pass);
  return {
    itemId: record.id,
    checker: CHECKER[pass],
    pass,
    brief: BRIEF[pass],
    packetSha256: hashes,
    stagesServedAt: fxStageTimes(hashes.length),
    startedAt: "2026-11-02T10:00:00Z",
    finishedAt: "2026-11-02T10:05:00Z",
    coldSolve,
    claimResults: item.claims.map((claim) => ({
      claimId: claim.id,
      verdict: "confirmed" as const,
      method: external(claim) ? ("dataset" as const) : ("knowledge" as const),
      evidence: external(claim)
        ? {
            kind: "dataset" as const,
            dataset: pass === "B" ? "ptable" : "mledoze-countries",
            version: pass === "B" ? PTABLE_COMMIT : MLEDOZE_COMMIT,
            file: "fixture.json",
            locator: `fixture=${claim.id}`,
            excerpt: "invented excerpt for a fixture",
            retrievedAt: "2026-10-31",
          }
        : {
            kind: "knowledge" as const,
            basis: "reference" as const,
            restatement: `Restated: ${claim.text}`,
            confidence: "certain" as const,
          },
      note: "",
    })),
    issues: [],
    searchesUsed: 0,
    verdict: "pass",
    ...overrides,
  };
}
