/**
 * Loads a content bank from disk and validates every file against its
 * schema. Everything downstream (lint, packets, records, decisions, dedupe,
 * stats) works on the Bank this returns.
 *
 * Sealed files come from one of two places:
 * - the plaintext workspace, content/.sealed-plain/ (writers and checkers
 *   work there; the tools write back there), or
 * - the envelopes in content/sealed/, decrypted in memory (`--sealed`, for
 *   CI). Those are read-only.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { z, type ZodType } from "zod";

import {
  answerEntitySchema,
  type AnswerEntity,
} from "../schema/answer-lists.ts";
import { BatchRegisterSchema, type BatchRegister } from "../schema/batches.ts";
import {
  CATEGORY_TABLE,
  CategoriesFileSchema,
  type Category,
} from "../schema/categories.ts";
import {
  DatasetManifestSchema,
  type DatasetManifest,
} from "../schema/datasets.ts";
import {
  EncoreSchema,
  MysterySchema,
  PracticeItemSchema,
  RoomQuestionSchema,
  type AnyItem,
} from "../schema/items.ts";
import {
  ANSWER_TYPES,
  ENTITY_ID_PATTERN,
  type AnswerType,
  isoDate,
  text,
} from "../schema/primitives.ts";
import {
  ScheduleMonthSchema,
  SpareSetSchema,
  type ScheduleMonth,
  type SpareSet,
} from "../schema/schedule.ts";
import type { Pool } from "./ids.ts";
import { parseJsonText } from "./json.ts";
import {
  repoRelative,
  SEALED_FOLDERS,
  type Layout,
  type SealedFolder,
} from "./layout.ts";
import { loadReferences, type References } from "./references.ts";
import { isEnvelope, openEnvelope, type SealKeys } from "./seal.ts";

export type FileKind =
  | "practice"
  | "mystery"
  | "encore"
  | "room-pack"
  | "schedule"
  | "spare"
  | "answer-list"
  | "categories"
  | "batches"
  | "manifest"
  | "unknown";

export interface SchemaProblem {
  path: string;
  message: string;
  itemId?: string;
}

export interface BankFile {
  kind: FileKind;
  /** Where the data was read from: a workspace file or an envelope. */
  abs: string;
  /** Repository-relative path for messages. */
  rel: string;
  /** Mystery, encore, room pack, schedule or spare (never shown in CI logs). */
  sealed: boolean;
  /** True when decrypted from an envelope: never written back. */
  fromEnvelope: boolean;
  raw: string | null;
  data: unknown;
  /** A read, JSON or decryption error. */
  error?: string;
  problems: SchemaProblem[];
  /** The file name without extension, which must match the id inside. */
  stem: string;
}

export interface BankItem {
  id: string;
  pool: Pool;
  file: BankFile;
  item: AnyItem;
  /** Room questions: the pack and the position in it. */
  packId?: string;
  index?: number;
}

export interface ListIndex {
  type: AnswerType;
  file: BankFile;
  version: string | null;
  entities: Map<string, AnswerEntity>;
}

export interface PackInfo {
  file: BankFile;
  id: string;
  title: string;
  theme: string;
  questionIds: string[];
}

export interface Bank {
  layout: Layout;
  files: BankFile[];
  items: BankItem[];
  itemsById: Map<string, BankItem>;
  /** Ids seen in files that failed their schema, so "missing" checks stay quiet. */
  invalidIds: Set<string>;
  lists: Map<AnswerType, ListIndex>;
  categories: Category[];
  register: BatchRegister | null;
  manifest: DatasetManifest | null;
  references: References;
  schedules: { file: BankFile; month: ScheduleMonth }[];
  spares: { file: BankFile; spare: SpareSet }[];
  packs: PackInfo[];
  /** Where sealed content came from. */
  sealedSource: "workspace" | "envelopes" | "none";
  /** Notes for the report, such as sealed content that was not checked. */
  notes: string[];
}

export interface LoadOptions {
  /** Decrypt content/sealed/ in memory instead of reading the workspace. */
  sealed?: boolean;
  keys?: SealKeys | null;
}

async function listDir(
  dir: string,
): Promise<{ name: string; isDir: boolean }[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .map((entry) => ({ name: entry.name, isDir: entry.isDirectory() }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function problemsOf(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}): SchemaProblem[] {
  if (result.success || !result.error) return [];
  return result.error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));
}

export function formatPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const key of path) {
    if (typeof key === "number") out += `[${key}]`;
    else out += out === "" ? String(key) : `.${String(key)}`;
  }
  return out;
}

function fileRecord(
  layout: Layout,
  kind: FileKind,
  abs: string,
  rel: string,
  sealed: boolean,
  fromEnvelope: boolean,
  raw: string | null,
  stem: string,
): BankFile {
  const file: BankFile = {
    kind,
    abs,
    rel,
    sealed,
    fromEnvelope,
    raw,
    data: undefined,
    problems: [],
    stem,
  };
  void layout;
  if (raw === null) return file;
  if (raw.includes("\r"))
    file.problems.push({ path: "", message: "use LF line endings (§2.1)" });
  if (raw !== raw.normalize("NFC"))
    file.problems.push({
      path: "",
      message: "text must be Unicode NFC (§2.1)",
    });
  try {
    file.data = parseJsonText(raw, rel);
  } catch (error) {
    file.error = (error as Error).message;
  }
  return file;
}

async function readPlainFile(
  layout: Layout,
  kind: FileKind,
  abs: string,
  sealed: boolean,
  stem: string,
): Promise<BankFile> {
  let raw: string | null = null;
  let error: string | undefined;
  try {
    raw = await readFile(abs, "utf8");
  } catch (e) {
    error = (e as Error).message;
  }
  const file = fileRecord(
    layout,
    kind,
    abs,
    repoRelative(layout, abs),
    sealed,
    false,
    raw,
    stem,
  );
  if (error) file.error = error;
  return file;
}

function validate<T>(file: BankFile, schema: ZodType<T>): T | null {
  if (file.error !== undefined || file.data === undefined) return null;
  const result = schema.safeParse(file.data);
  if (result.success) return result.data;
  file.problems.push(...problemsOf(result));
  return null;
}

/** Answer lists are validated entity by entity, so one bad entry blocks nothing else. */
const ListShellSchema = z.strictObject({
  type: z.enum(ANSWER_TYPES),
  version: isoDate,
  provenance: z
    .array(
      z.strictObject({ source: text, license: text, retrievedAt: isoDate }),
    )
    .min(1),
  entities: z.array(z.unknown()),
});

const PackShellSchema = z.strictObject({
  id: z
    .string()
    .regex(/^(?:fx-)?[a-z0-9]+(?:-[a-z0-9]+)*$/, "pack ids are kebab-case"),
  title: text,
  theme: text,
  questions: z.array(z.unknown()).min(1).max(89),
});

function idOf(data: unknown): string | undefined {
  if (typeof data === "object" && data !== null && "id" in data) {
    const id = (data as { id: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

/**
 * Loads every file of the bank. Never throws for bad content: problems are
 * recorded on the files and reported by the lint as C01.
 */
export async function loadBank(
  layout: Layout,
  options: LoadOptions = {},
): Promise<Bank> {
  const files: BankFile[] = [];
  const notes: string[] = [];
  const bank: Bank = {
    layout,
    files,
    items: [],
    itemsById: new Map(),
    invalidIds: new Set(),
    lists: new Map(),
    categories: [...CATEGORY_TABLE],
    register: null,
    manifest: null,
    references: await loadReferences(layout.referenceDir),
    schedules: [],
    spares: [],
    packs: [],
    sealedSource: "none",
    notes,
  };

  // Categories.
  if (existsSync(layout.categoriesFile)) {
    const file = await readPlainFile(
      layout,
      "categories",
      layout.categoriesFile,
      false,
      "categories",
    );
    files.push(file);
    const categories = validate(file, CategoriesFileSchema);
    if (categories) bank.categories = categories;
  }
  const slugToCategory = new Map(bank.categories.map((c) => [c.slug, c]));

  // Register.
  if (existsSync(layout.registerFile)) {
    const file = await readPlainFile(
      layout,
      "batches",
      layout.registerFile,
      false,
      "batches",
    );
    files.push(file);
    bank.register = validate(file, BatchRegisterSchema);
  } else if (layout.kind === "content") {
    notes.push(
      `No batch register at ${repoRelative(layout, layout.registerFile)}.`,
    );
  }

  // Dataset manifest.
  if (existsSync(layout.manifestFile)) {
    const file = await readPlainFile(
      layout,
      "manifest",
      layout.manifestFile,
      false,
      "manifest",
    );
    files.push(file);
    bank.manifest = validate(file, DatasetManifestSchema);
  }

  // Practice items: practice/<category-slug>/<id>.json.
  for (const folder of await listDir(layout.practiceDir)) {
    const dir = join(layout.practiceDir, folder.name);
    if (!folder.isDir) {
      const stray = await readPlainFile(
        layout,
        "unknown",
        dir,
        false,
        folder.name,
      );
      stray.problems.push({
        path: "",
        message: "practice items live in practice/<category-slug>/",
      });
      files.push(stray);
      continue;
    }
    const category = slugToCategory.get(folder.name);
    for (const entry of await listDir(dir)) {
      if (entry.isDir || !entry.name.endsWith(".json")) continue;
      const file = await readPlainFile(
        layout,
        "practice",
        join(dir, entry.name),
        false,
        entry.name.slice(0, -5),
      );
      files.push(file);
      if (!category) {
        file.problems.push({
          path: "",
          message: `${folder.name} is not a category slug`,
        });
      }
      const item = validate(file, PracticeItemSchema);
      addItem(bank, file, item, "practice");
      if (item && category && item.category !== category.id) {
        file.problems.push({
          path: "category",
          message: `a ${item.category} item sits in practice/${folder.name}/`,
          itemId: item.id,
        });
      }
    }
  }

  // Answer lists: answer-lists/<type>.json (answer-lists/_wikidata/ is job output).
  for (const entry of await listDir(layout.answerListsDir)) {
    if (entry.isDir || !entry.name.endsWith(".json")) continue;
    const stem = entry.name.slice(0, -5);
    const file = await readPlainFile(
      layout,
      "answer-list",
      join(layout.answerListsDir, entry.name),
      false,
      stem,
    );
    files.push(file);
    loadList(bank, file, stem);
  }

  // Sealed content.
  await loadSealed(bank, options);

  // Anything else under content/ sits outside the layout: a plaintext
  // mystery or a copied packet there would be committed and published.
  if (layout.kind === "content") {
    for (const abs of await strayFiles(layout.root)) {
      const file = fileRecord(
        layout,
        "unknown",
        abs,
        repoRelative(layout, abs),
        true,
        false,
        null,
        basename(abs),
      );
      file.problems.push({
        path: "",
        message:
          "this file sits outside the content layout (CONTENT_GUIDE §11.1); sealed kinds are written in content/.sealed-plain/ and committed only as envelopes in content/sealed/, so move or delete it",
      });
      files.push(file);
    }
  }

  return bank;
}

/** Folders whose rules live elsewhere: envelopes, the workspace, fixture trees. */
const OWN_RULES = new Set(["sealed", ".sealed-plain", "fixtures"]);
const ANYWHERE = new Set(["README.md", ".gitkeep", ".DS_Store"]);

/** True for a path (relative to content/) that the layout expects. */
export function knownContentPath(rel: string): boolean {
  const parts = rel.split("/");
  const name = parts.at(-1) ?? "";
  if (ANYWHERE.has(name)) return true;
  switch (parts[0]) {
    case "practice":
      // Files directly in practice/ are reported by the practice loader.
      return (
        parts.length === 2 || (parts.length === 3 && name.endsWith(".json"))
      );
    case "answer-lists":
      return (
        (parts.length === 2 && name.endsWith(".json")) ||
        parts[1] === "_wikidata"
      );
    case "datasets":
      return rel === "datasets/manifest.json";
    case "reference":
      return parts.length === 2 && name.endsWith(".json");
    case "safety":
      return true;
    default:
      return (
        parts.length === 1 &&
        (name === "categories.json" || name === "batches.json")
      );
  }
}

/** Every file under the content root that the layout does not expect. */
async function strayFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, rel: string): Promise<void> => {
    for (const entry of await listDir(dir)) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (rel === "" && OWN_RULES.has(entry.name)) continue;
      if (entry.isDir) await walk(join(dir, entry.name), childRel);
      else if (!knownContentPath(childRel)) out.push(join(dir, entry.name));
    }
  };
  await walk(root, "");
  return out;
}

function addItem(
  bank: Bank,
  file: BankFile,
  item: AnyItem | null,
  pool: Pool,
  packId?: string,
  index?: number,
): void {
  if (!item) {
    const id = idOf(
      index === undefined
        ? file.data
        : (file.data as { questions?: unknown[] }).questions?.[index],
    );
    if (id) bank.invalidIds.add(id);
    return;
  }
  if (
    item.id.replace(/^fx\./, "") !== file.stem.replace(/^fx\./, "") &&
    index === undefined
  ) {
    file.problems.push({
      path: "id",
      message: `id ${item.id} does not match the file name ${file.stem}.json`,
      itemId: item.id,
    });
  }
  if (bank.itemsById.has(item.id)) {
    file.problems.push({
      path: "id",
      message: `${item.id} is defined twice`,
      itemId: item.id,
    });
    return;
  }
  const record: BankItem = { id: item.id, pool, file, item };
  if (packId !== undefined) record.packId = packId;
  if (index !== undefined) record.index = index;
  bank.items.push(record);
  bank.itemsById.set(item.id, record);
}

function loadList(bank: Bank, file: BankFile, stem: string): void {
  if (file.error !== undefined) return;
  const shell = ListShellSchema.safeParse(file.data);
  if (!shell.success) {
    file.problems.push(...problemsOf(shell));
    return;
  }
  const type = shell.data.type;
  if (type !== stem) {
    file.problems.push({
      path: "type",
      message: `the ${type} list must be in ${type}.json`,
    });
  }
  if (bank.lists.has(type)) {
    file.problems.push({ path: "type", message: `a second ${type} list` });
    return;
  }
  const schema = answerEntitySchema(type);
  const index: ListIndex = {
    type,
    file,
    version: shell.data.version,
    entities: new Map(),
  };
  shell.data.entities.forEach((raw, i) => {
    const result = schema.safeParse(raw);
    if (!result.success) {
      for (const problem of problemsOf(result)) {
        file.problems.push({
          path: `entities[${i}]${problem.path ? `.${problem.path}` : ""}`,
          message: problem.message,
        });
      }
      return;
    }
    const entity = result.data as AnswerEntity;
    if (index.entities.has(entity.id)) {
      file.problems.push({
        path: `entities[${i}].id`,
        message: `duplicate entity id ${entity.id}`,
      });
      return;
    }
    index.entities.set(entity.id, entity);
  });
  bank.lists.set(type, index);
}

interface SealedSourceFile {
  folder: SealedFolder;
  stem: string;
  abs: string;
  rel: string;
  raw: string | null;
  error?: string;
  fromEnvelope: boolean;
}

async function collectWorkspace(layout: Layout): Promise<SealedSourceFile[]> {
  const out: SealedSourceFile[] = [];
  for (const folder of SEALED_FOLDERS) {
    const dir = join(layout.workspaceDir, folder);
    for (const entry of await listDir(dir)) {
      if (entry.isDir || !entry.name.endsWith(".json")) continue;
      const abs = join(dir, entry.name);
      let raw: string | null = null;
      let error: string | undefined;
      try {
        raw = await readFile(abs, "utf8");
      } catch (e) {
        error = (e as Error).message;
      }
      const record: SealedSourceFile = {
        folder,
        stem: entry.name.slice(0, -5),
        abs,
        rel: repoRelative(layout, abs),
        raw,
        fromEnvelope: false,
      };
      if (error) record.error = error;
      out.push(record);
    }
  }
  return out;
}

/** Envelope files under content/sealed/, as (folder, stem, path). */
export async function listEnvelopes(
  layout: Layout,
): Promise<{ folder: SealedFolder; stem: string; abs: string }[]> {
  const out: { folder: SealedFolder; stem: string; abs: string }[] = [];
  if (!layout.envelopeDir) return out;
  for (const folder of SEALED_FOLDERS) {
    const dir = join(layout.envelopeDir, folder);
    for (const entry of await listDir(dir)) {
      if (entry.isDir || !entry.name.endsWith(".json.enc")) continue;
      out.push({
        folder,
        stem: entry.name.slice(0, -".json.enc".length),
        abs: join(dir, entry.name),
      });
    }
  }
  return out;
}

async function collectEnvelopes(
  layout: Layout,
  keys: SealKeys,
): Promise<SealedSourceFile[]> {
  const out: SealedSourceFile[] = [];
  for (const { folder, stem, abs } of await listEnvelopes(layout)) {
    const record: SealedSourceFile = {
      folder,
      stem,
      abs,
      rel: repoRelative(layout, abs),
      raw: null,
      fromEnvelope: true,
    };
    try {
      const envelope: unknown = JSON.parse(await readFile(abs, "utf8"));
      if (!isEnvelope(envelope)) throw new Error("not a valid envelope");
      record.raw = openEnvelope(keys, envelope).toString("utf8");
    } catch (error) {
      record.error = (error as Error).message;
    }
    out.push(record);
  }
  return out;
}

const FOLDER_KIND: Record<SealedFolder, FileKind> = {
  mysteries: "mystery",
  encores: "encore",
  "room-packs": "room-pack",
  schedule: "schedule",
  spares: "spare",
};

async function loadSealed(bank: Bank, options: LoadOptions): Promise<void> {
  const { layout, notes } = bank;
  let sources: SealedSourceFile[];
  if (options.sealed) {
    const envelopes = await listEnvelopes(layout);
    if (!options.keys) {
      notes.push(
        "Sealed content validation: not run (QZ_CONTENT_KEY is not set)",
      );
      return;
    }
    sources = await collectEnvelopes(layout, options.keys);
    bank.sealedSource = "envelopes";
    notes.push(
      `Sealed content: ${envelopes.length} envelope(s) decrypted in memory.`,
    );
  } else {
    sources = await collectWorkspace(layout);
    if (sources.length > 0 || existsSync(layout.workspaceDir))
      bank.sealedSource = "workspace";
    if (layout.kind === "content") {
      const envelopes = await listEnvelopes(layout);
      if (sources.length === 0 && envelopes.length > 0) {
        notes.push(
          `${envelopes.length} sealed envelope(s) not checked: run "npm run content:unseal" or pass --sealed.`,
        );
      }
    }
  }

  for (const source of sources) {
    const kind = FOLDER_KIND[source.folder];
    const file = fileRecord(
      layout,
      kind,
      source.abs,
      source.rel,
      true,
      source.fromEnvelope,
      source.raw,
      source.stem,
    );
    if (source.error) file.error = source.error;
    bank.files.push(file);
    switch (kind) {
      case "mystery":
        addItem(bank, file, validate(file, MysterySchema), "mystery");
        break;
      case "encore":
        addItem(bank, file, validate(file, EncoreSchema), "encore");
        break;
      case "room-pack":
        loadPack(bank, file);
        break;
      case "schedule": {
        const month = validate(file, ScheduleMonthSchema);
        if (month) {
          if (!/^\d{4}-\d{2}$/.test(file.stem)) {
            file.problems.push({
              path: "",
              message: "schedule files are named <yyyy-mm>.json",
            });
          }
          month.dailies.forEach((daily, i) => {
            if (!daily.date.startsWith(`${file.stem}-`)) {
              file.problems.push({
                path: `dailies[${i}].date`,
                message: `${daily.date} is not in ${file.stem}`,
              });
            }
          });
          bank.schedules.push({ file, month });
        }
        break;
      }
      case "spare": {
        const spare = validate(file, SpareSetSchema);
        if (spare) {
          if (spare.id !== file.stem)
            file.problems.push({
              path: "id",
              message: `id ${spare.id} does not match the file name`,
            });
          bank.spares.push({ file, spare });
        }
        break;
      }
      default:
        break;
    }
  }
}

function loadPack(bank: Bank, file: BankFile): void {
  const shell = validate(file, PackShellSchema);
  if (!shell) return;
  if (shell.id !== file.stem) {
    file.problems.push({
      path: "id",
      message: `pack id ${shell.id} does not match the file name ${file.stem}.json`,
    });
  }
  const info: PackInfo = {
    file,
    id: shell.id,
    title: shell.title,
    theme: shell.theme,
    questionIds: [],
  };
  shell.questions.forEach((raw, index) => {
    const result = RoomQuestionSchema.safeParse(raw);
    const rawId = idOf(raw);
    if (!result.success) {
      for (const problem of problemsOf(result)) {
        const entry: SchemaProblem = {
          path: `questions[${index}]${problem.path ? `.${problem.path}` : ""}`,
          message: problem.message,
        };
        if (rawId) entry.itemId = rawId;
        file.problems.push(entry);
      }
      if (rawId) bank.invalidIds.add(rawId);
      return;
    }
    const question = result.data;
    const expectedPrefix = `${shell.id.startsWith("fx-") || question.id.startsWith("fx.") ? "fx." : ""}r.${shell.id}.`;
    if (!question.id.startsWith(expectedPrefix)) {
      file.problems.push({
        path: `questions[${index}].id`,
        message: `question ids in this pack start ${expectedPrefix}`,
        itemId: question.id,
      });
    }
    info.questionIds.push(question.id);
    addItem(bank, file, question, "room", shell.id, index);
  });
  bank.packs.push(info);
}

/** Every entity id in the bank's lists, by type. */
export function entityLookup(
  bank: Bank,
  id: string,
): { type: AnswerType; entity: AnswerEntity } | null {
  for (const [type, list] of bank.lists) {
    const entity = list.entities.get(id);
    if (entity) return { type, entity };
  }
  return null;
}

export function isEntityId(value: string): boolean {
  return ENTITY_ID_PATTERN.test(value);
}

/** The base name of a path without its extension. */
export function stemOf(path: string): string {
  return basename(path).replace(/\.json(\.enc)?$/, "");
}
