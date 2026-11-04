/**
 * Every output of ARCHITECTURE §5.3, computed in memory from the content
 * bank and the fixture tree. Deterministic: the same inputs give the same
 * bytes, with no clock, no randomness and no dependence on the machine, so
 * CI can rebuild and compare (the drift check, drift.ts).
 *
 * The real world comes from content/: practice packs and answer-list
 * projections under public/content/, the manifest and the static modules
 * under src/content/generated/, and the committed SQL loads under
 * supabase/seed/. The fixture world comes from content/fixtures/ only: the
 * client half (packs and lists) in src/content/generated/fixture-world.json
 * and the mock's sealed half in src/backend/mock/fixtures.generated.ts.
 * Nothing here reads content/sealed/ or the plaintext workspace: no sealed
 * pool ever reaches an output (§5.4).
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import type { Bank, BankItem } from "../../../src/content/pipeline/bank.ts";
import type {
  Encore,
  Mystery,
  PracticeItem,
  RoomQuestion,
} from "../../../src/content/schema/items.ts";
import {
  ANSWER_TYPES,
  type AnswerType,
} from "../../../src/content/schema/primitives.ts";
import { parseShareLayouts } from "../../../src/engine/share/code.ts";
import {
  categoriesModule,
  categoryPagesModule,
  manifestModule,
  mockFixturesModule,
  moderationModule,
  namesModule,
  ROT13,
  type CategoryPage,
  type ManifestList,
  type ManifestPack,
} from "./modules.ts";
import {
  ProjectionError,
  isShippedEntity,
  optionLabelOf,
  projectEncore,
  projectList,
  projectMystery,
  projectPracticeItem,
  projectSealedChoice,
  type BuiltChoiceItem,
  type BuiltList,
} from "./project.ts";
import {
  answerEntitiesSql,
  configSql,
  practiceItemsSql,
  readPracticeRows,
  type EntityRow,
  type PracticeRow,
} from "./sql.ts";

/** Directories the build owns outright: anything else in them is stale. */
export const OUTPUT_DIRS = [
  "public/content/packs",
  "public/content/lists",
  "src/content/generated",
] as const;

/** Single files the build owns. */
export const OUTPUT_FILES = [
  "src/backend/mock/fixtures.generated.ts",
  "supabase/seed/answer-entities.sql",
  "supabase/seed/practice-items.sql",
  "supabase/seed/config.sql",
] as const;

export const MANIFEST_PATH = "src/content/generated/manifest.ts";
export const FIXTURE_WORLD_PATH = "src/content/generated/fixture-world.json";
export const MOCK_FIXTURES_PATH = "src/backend/mock/fixtures.generated.ts";
export const PRACTICE_SEED_PATH = "supabase/seed/practice-items.sql";

/** Budgets (PRD §8.1, ARCHITECTURE §5.2), gzipped, 1 kB = 1000 bytes. */
export const PACK_GZIP_LIMIT = 40_000;
export const PACKS_GZIP_LIMIT = 400_000;
export const LIST_GZIP_LIMIT = 80_000;

export interface Output {
  /** Repository-relative, forward slashes. */
  path: string;
  content: string;
}

/** Something that keeps the build from writing. Messages never quote content. */
export interface BuildProblem {
  rule: string;
  file: string;
  itemId?: string;
  path?: string;
  message: string;
  sealed: boolean;
}

export interface PackStat {
  category: string;
  slug: string;
  url: string;
  items: number;
  bytes: number;
  gzipBytes: number;
}

export interface ListStat {
  type: AnswerType;
  url: string;
  entities: number;
  bytes: number;
  gzipBytes: number;
}

export interface BuildResult {
  outputs: Output[];
  problems: BuildProblem[];
  packs: PackStat[];
  lists: ListStat[];
  contentVersion: string;
}

export interface BuildInputs {
  /** content/, loaded by the pipeline's loadBank. */
  bank: Bank;
  /** content/fixtures/, or null when the tree has none. */
  fixtures: Bank | null;
  /** content/compositions.json, parsed. */
  compositions: unknown;
  /** src/config/shared.json, parsed. */
  shared: Record<string, unknown>;
  /** The committed supabase/seed/practice-items.sql, or null. */
  previousPracticeSql: string | null;
  names: { adjectives: string[]; animals: string[] };
  /** Plain terms; the module stores them ROT13-encoded. */
  moderation: { terms: string[]; allowlist: string[] };
  /** Intro copy by category slug. */
  categoryIntros: ReadonlyMap<string, string>;
  /** Formats one output as the repo's Prettier config does. */
  format: (path: string, text: string) => Promise<string>;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function gzipBytes(text: string): number {
  return gzipSync(Buffer.from(text, "utf8")).length;
}

const inPlay = (status: string) => status !== "cut" && status !== "retired";

const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function projectionProblem(record: BankItem, error: unknown): BuildProblem {
  const message =
    error instanceof ProjectionError
      ? error.message
      : "the item could not be converted to its built shape";
  const problem: BuildProblem = {
    rule: "X18",
    file: record.file.rel,
    itemId: record.id,
    message,
    sealed: record.file.sealed,
  };
  if (error instanceof ProjectionError) problem.path = error.path;
  return problem;
}

interface PackBuild {
  category: string;
  items: BuiltChoiceItem[];
}

function practicePacks(
  bank: Bank,
  wanted: (status: string) => boolean,
  problems: BuildProblem[],
): PackBuild[] {
  const byCategory = new Map<string, BuiltChoiceItem[]>();
  for (const record of bank.items) {
    if (record.pool !== "practice" || record.file.sealed) continue;
    const item = record.item as PracticeItem;
    if (!wanted(item.status)) continue;
    try {
      const built = projectPracticeItem(item);
      const list = byCategory.get(built.category) ?? [];
      list.push(built);
      byCategory.set(built.category, list);
    } catch (error) {
      problems.push(projectionProblem(record, error));
    }
  }
  return [...bank.categories]
    .sort((a, b) => a.order - b.order)
    .flatMap((category) => {
      const items = byCategory.get(category.id);
      return items === undefined
        ? []
        : [{ category: category.id, items: [...items].sort(byId) }];
    });
}

/** A pack's version is the hash of its category and items; the file embeds it. */
function packFile(pack: PackBuild): { hash: string; json: string } {
  const hash = sha256(
    JSON.stringify({ category: pack.category, items: pack.items }),
  ).slice(0, 8);
  return {
    hash,
    json: JSON.stringify({
      category: pack.category,
      version: hash,
      items: pack.items,
    }),
  };
}

function lists(bank: Bank): BuiltList[] {
  return ANSWER_TYPES.flatMap((type) => {
    const list = bank.lists.get(type);
    if (!list) return [];
    return [projectList(type, list.version ?? "", list.entities.values())];
  });
}

function entityRows(bank: Bank, problems: BuildProblem[]): EntityRow[][] {
  return ANSWER_TYPES.flatMap((type) => {
    const list = bank.lists.get(type);
    if (!list) return [];
    const rows: EntityRow[] = [];
    list.entities.forEach((entity) => {
      try {
        rows.push({
          answerType: type,
          entityId: entity.id,
          display: entity.display,
          optionLabel: optionLabelOf(type, entity),
          active: isShippedEntity(entity),
        });
      } catch (error) {
        problems.push({
          rule: "X18",
          file: list.file.rel,
          path: error instanceof ProjectionError ? error.path : "",
          message:
            error instanceof ProjectionError
              ? `${entity.id}: ${error.message}`
              : `${entity.id}: no option label`,
          sealed: false,
        });
      }
    });
    return [rows];
  });
}

/**
 * Bit positions for practice_items (§8.12): every id that ever had one
 * keeps it, and new active items take the next free positions in id order.
 */
function practiceRows(
  previous: readonly PracticeRow[],
  packs: readonly PackBuild[],
): PracticeRow[] {
  const rows = new Map(previous.map((row) => [row.id, { ...row }]));
  let next = previous.reduce((max, row) => Math.max(max, row.ord + 1), 0);
  const active = packs.flatMap((pack) => pack.items).sort(byId);
  for (const item of active) {
    const known = rows.get(item.id);
    if (known) {
      known.category = item.category;
      known.optionCount = item.options.length;
    } else {
      rows.set(item.id, {
        id: item.id,
        category: item.category,
        ord: next,
        optionCount: item.options.length,
      });
      next += 1;
    }
  }
  return [...rows.values()].sort((a, b) => a.ord - b.ord);
}

function categoryPages(
  bank: Bank,
  packs: readonly PackBuild[],
  intros: ReadonlyMap<string, string>,
): Record<string, CategoryPage> {
  const pages: Record<string, CategoryPage> = {};
  for (const category of [...bank.categories].sort(
    (a, b) => a.order - b.order,
  )) {
    const items = packs.find((pack) => pack.category === category.id)?.items;
    const sample =
      (items ?? [])
        .filter((item) => item.format === "mc")
        .sort((a, b) => b.predicted.p - a.predicted.p || byId(a, b))[0] ?? null;
    pages[category.id] = {
      slug: category.slug,
      intro: intros.get(category.slug) ?? null,
      sample,
    };
  }
  return pages;
}

interface FixtureWorld {
  version: string;
  packs: Record<string, { category: string; version: string; items: unknown }>;
  lists: Record<string, BuiltList>;
  /** Clue-4 option labels that differ from the display, for the mock's judge. */
  labels: Record<string, Record<string, string>>;
}

function fixtureWorld(
  fixtures: Bank,
  problems: BuildProblem[],
): FixtureWorld | null {
  const packs = practicePacks(fixtures, inPlay, problems);
  const world: FixtureWorld = { version: "", packs: {}, lists: {}, labels: {} };
  for (const pack of packs) {
    const { hash } = packFile(pack);
    world.packs[pack.category] = {
      category: pack.category,
      version: hash,
      items: pack.items,
    };
  }
  for (const list of lists(fixtures)) world.lists[list.type] = list;
  for (const type of ANSWER_TYPES) {
    const list = fixtures.lists.get(type);
    if (!list) continue;
    const labels: Record<string, string> = {};
    list.entities.forEach((entity) => {
      if (!isShippedEntity(entity)) return;
      try {
        const label = optionLabelOf(type, entity);
        if (label !== entity.display) labels[entity.id] = label;
      } catch (error) {
        problems.push({
          rule: "X18",
          file: list.file.rel,
          message: `${entity.id}: ${(error as Error).message}`,
          sealed: false,
        });
      }
    });
    world.labels[type] = labels;
  }
  world.version = sha256(JSON.stringify({ ...world, version: "" })).slice(0, 8);
  return world;
}

function mockFixtures(fixtures: Bank, problems: BuildProblem[]) {
  const take = <T>(
    pool: BankItem["pool"],
    project: (record: BankItem) => T,
  ): T[] =>
    fixtures.items
      .filter((record) => record.pool === pool && inPlay(record.item.status))
      .sort(byId)
      .flatMap((record) => {
        try {
          return [project(record)];
        } catch (error) {
          problems.push(projectionProblem(record, error));
          return [];
        }
      });
  const mysteries = take("mystery", (r) => projectMystery(r.item as Mystery));
  const encores = take("encore", (r) => projectEncore(r.item as Encore));
  const choices = take("room", (r) =>
    projectSealedChoice(r.item as RoomQuestion),
  );
  const inPlayIds = new Set(choices.map((choice) => choice.id));
  // `dly` holds the fixture Dailies' choice rounds (content/fixtures/
  // README.md): sealed content, never a hostable pack.
  const roomPacks = fixtures.packs
    .filter((pack) => pack.id !== "dly")
    .sort(byId)
    .map((pack) => ({
      id: pack.id,
      title: pack.title,
      theme: pack.theme,
      questionIds: pack.questionIds.filter((id) => inPlayIds.has(id)),
    }));
  const schedule = fixtures.schedules
    .flatMap(({ month }) =>
      month.dailies.map((daily) => ({
        track: month.track,
        date: daily.date,
        rounds: daily.rounds.map((round) => ({
          type: round.type,
          difficulty: round.difficulty,
          contentId: round.contentId,
        })),
      })),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const spares = fixtures.spares
    .map(({ spare }) => ({
      id: spare.id,
      track: spare.track,
      rounds: spare.rounds.map((round) => ({
        type: round.type,
        difficulty: round.difficulty,
        contentId: round.contentId,
      })),
    }))
    .sort(byId);
  const data = {
    version: "",
    mysteries,
    encores,
    choices,
    roomPacks,
    schedule,
    spares,
  };
  data.version = sha256(JSON.stringify(data)).slice(0, 8);
  return data;
}

function lineFiles(raw: string | null): string[] {
  if (raw === null) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** Reads content/names/*.txt and content/safety/*.txt: one entry per line, # comments. */
export function parseLineFile(raw: string | null): string[] {
  return lineFiles(raw);
}

/**
 * Builds every output. Never throws for bad content: problems come back
 * in `problems`, and the caller writes nothing while any stands.
 */
export async function buildOutputs(input: BuildInputs): Promise<BuildResult> {
  const { bank } = input;
  const problems: BuildProblem[] = [];
  const outputs: Output[] = [];
  const add = async (path: string, text: string) => {
    outputs.push({ path, content: await input.format(path, text) });
  };

  try {
    parseShareLayouts(input.compositions);
  } catch (error) {
    problems.push({
      rule: "X25",
      file: "content/compositions.json",
      message: (error as Error).message,
      sealed: false,
    });
  }

  // Practice packs: active items only, every source-only field stripped.
  const packs = practicePacks(bank, (status) => status === "active", problems);
  const packStats: PackStat[] = [];
  const manifestPacks: Record<string, ManifestPack> = {};
  for (const pack of packs) {
    const category = bank.categories.find((c) => c.id === pack.category);
    const slug = category?.slug ?? pack.category;
    const { hash, json } = packFile(pack);
    const path = `public/content/packs/${slug}.${hash}.json`;
    await add(path, json);
    const content = outputs.at(-1)?.content ?? "";
    const url = `/${path.slice("public/".length)}`;
    packStats.push({
      category: pack.category,
      slug,
      url,
      items: pack.items.length,
      bytes: Buffer.byteLength(content, "utf8"),
      gzipBytes: gzipBytes(content),
    });
    manifestPacks[pack.category] = {
      url,
      version: hash,
      items: pack.items.length,
    };
  }

  // Answer lists: the client projection of §5.5.
  const listStats: ListStat[] = [];
  const manifestLists: Record<string, ManifestList> = {};
  for (const list of lists(bank)) {
    const json = JSON.stringify(list);
    const hash = sha256(json).slice(0, 8);
    const path = `public/content/lists/${list.type}.${hash}.json`;
    await add(path, json);
    const content = outputs.at(-1)?.content ?? "";
    const url = `/${path.slice("public/".length)}`;
    listStats.push({
      type: list.type,
      url,
      entities: list.entities.length,
      bytes: Buffer.byteLength(content, "utf8"),
      gzipBytes: gzipBytes(content),
    });
    manifestLists[list.type] = {
      url,
      version: list.version,
      entities: list.entities.length,
    };
  }

  // Budgets on the bytes that ship (PRD §8.1, ARCHITECTURE §5.2, §5.5).
  for (const stat of packStats) {
    if (stat.gzipBytes > PACK_GZIP_LIMIT) {
      problems.push({
        rule: "X18",
        file: `content/practice/${stat.slug}`,
        message: `the ${stat.category} pack ships ${(stat.gzipBytes / 1000).toFixed(1)} kB gzipped; the limit is ${PACK_GZIP_LIMIT / 1000} kB per pack (ARCHITECTURE §5.2)`,
        sealed: false,
      });
    }
  }
  const allPacks = packStats.reduce((sum, stat) => sum + stat.gzipBytes, 0);
  if (allPacks > PACKS_GZIP_LIMIT) {
    problems.push({
      rule: "X18",
      file: "content/practice",
      message: `the practice packs ship ${(allPacks / 1000).toFixed(1)} kB gzipped together; the limit is ${PACKS_GZIP_LIMIT / 1000} kB (ARCHITECTURE §5.2)`,
      sealed: false,
    });
  }
  for (const stat of listStats) {
    if (stat.gzipBytes > LIST_GZIP_LIMIT) {
      problems.push({
        rule: "X09",
        file: `content/answer-lists/${stat.type}.json`,
        message: `the ${stat.type} list ships ${(stat.gzipBytes / 1000).toFixed(1)} kB gzipped; the limit is ${LIST_GZIP_LIMIT / 1000} kB per list (ARCHITECTURE §5.5)`,
        sealed: false,
      });
    }
  }

  const contentVersion = sha256(
    JSON.stringify([
      Object.entries(manifestPacks).map(([key, pack]) => [key, pack.url]),
      Object.entries(manifestLists).map(([key, list]) => [key, list.url]),
    ]),
  ).slice(0, 8);
  await add(
    MANIFEST_PATH,
    manifestModule({
      contentVersion,
      packs: manifestPacks,
      lists: manifestLists,
    }),
  );

  const categories = [...bank.categories]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      shortName: c.shortName,
      order: c.order,
    }));
  await add(
    "src/content/generated/categories.ts",
    categoriesModule(categories),
  );
  await add("src/content/generated/names.ts", namesModule(input.names));
  await add(
    "src/content/generated/category-pages.ts",
    categoryPagesModule(categoryPages(bank, packs, input.categoryIntros)),
  );
  await add(
    "src/content/generated/moderation.ts",
    moderationModule({
      terms: input.moderation.terms.map(ROT13),
      allowlist: input.moderation.allowlist.map(ROT13),
    }),
  );

  // The fixture world: content/fixtures/ only.
  if (input.fixtures !== null) {
    const world = fixtureWorld(input.fixtures, problems);
    if (world !== null) await add(FIXTURE_WORLD_PATH, JSON.stringify(world));
    await add(
      MOCK_FIXTURES_PATH,
      mockFixturesModule(mockFixtures(input.fixtures, problems)),
    );
  }

  // The committed SQL loads. Not Prettier's business: no SQL parser.
  outputs.push({
    path: "supabase/seed/answer-entities.sql",
    content: answerEntitiesSql(
      entityRows(bank, problems).map((rows) => ({
        type: rows[0]?.answerType ?? "",
        rows,
      })),
    ),
  });
  outputs.push({
    path: PRACTICE_SEED_PATH,
    content: practiceItemsSql(
      categories.map(({ id, slug, name, shortName }) => ({
        id,
        slug,
        name,
        shortName,
      })),
      practiceRows(readPracticeRows(input.previousPracticeSql), packs),
    ),
  });
  outputs.push({
    path: "supabase/seed/config.sql",
    content: configSql(input.shared),
  });

  outputs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    outputs,
    problems,
    packs: packStats,
    lists: listStats,
    contentVersion,
  };
}
