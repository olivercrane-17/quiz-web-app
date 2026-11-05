/**
 * The answer-list importers behind `content:lists` (ARCHITECTURE §5.5,
 * CONTENT_GUIDE §2.10 and §9.5.1). One importer per pinned dataset reads its
 * cached files (`.cache/datasets/<key>/`, from `npm run content:datasets`)
 * into records by the locator list entries cite in their `source`
 * (`cldr-territories@7d2b9cb CZ`, `moma-artists@51a140d ConstituentID=912`).
 *
 * Re-importing a list from its recorded sources means: every dataset token
 * in an entry's `source` must resolve in the pinned dataset, and the entry
 * must agree with the record. An importer has one of two roles:
 *
 * - `source`: the dataset may supply shipped fields (CLDR's Unicode licence,
 *   CC0, public domain). Its names are the entry's aliases (§2.10: "CLDR
 *   forms and variants become aliases"), and a missing one is a change
 *   `--write` adds.
 * - `check`: evidence only (ODbL, BY-SA, or data that is not ours to ship).
 *   Disagreements are reported for the list builder and never written.
 *
 * Nothing here ever deletes an entry or changes an id: retiring, merging and
 * adding entries are the list builder's work in a list batch (§2.10 rule 5).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { AnswerEntity } from "../../../src/content/schema/answer-lists.ts";
import {
  datasetVersion,
  type DatasetEntry,
  type DatasetManifest,
} from "../../../src/content/schema/datasets.ts";
import type { AnswerType } from "../../../src/content/schema/primitives.ts";
import { foldName } from "../../../src/content/pipeline/text.ts";

/** One dataset record, as a list entry's locator finds it. */
export interface DatasetRecord {
  locator: string;
  /** The names the record gives the entity. Empty: names aren't compared. */
  names: string[];
  /**
   * Facts the entry must agree with: a qualifier key and its value, or `id`
   * for a QID the record carries (§2.12: that QID is the entry's id).
   */
  facts: Record<string, string | number>;
}

export interface DatasetIndex {
  /** The record a locator names, or null when the dataset holds none. */
  resolve(type: AnswerType, locator: string): DatasetRecord | null;
  /** Every record of a type, for a source that enumerates a list (CLDR). */
  enumerate?(type: AnswerType): DatasetRecord[];
}

export interface ListImporter {
  /** The manifest key. */
  key: string;
  role: "source" | "check";
  /**
   * How a check dataset's names are compared: `person` lets titles,
   * bracketed asides, middle names and initials and the order of the names
   * differ ("Paul A. Samuelson" is Paul Samuelson); `exact`, the default,
   * doesn't.
   */
  names?: "exact" | "person";
  /** The list types whose entries cite it. */
  types: readonly AnswerType[];
  /** Reads the dataset's cached files: `file(path)` returns one as text. */
  load(file: (path: string) => string): DatasetIndex;
}

/** A dataset token in an entry's source: `key@version locator`. */
export interface SourceToken {
  key: string;
  version: string;
  locator: string;
}

/**
 * The dataset tokens of a `source` string. Tokens are separated by ";" or
 * by ", " before the next `key@`; text before a token ("checked", "id from")
 * is not part of it.
 */
export function sourceTokens(source: string): SourceToken[] {
  const out: SourceToken[] = [];
  for (const part of source.split(/;|,\s*(?=[a-z0-9-]+@)/)) {
    const match = /([a-z0-9]+(?:-[a-z0-9]+)*)@([0-9a-z.]+)(?:\s+(.*))?$/.exec(
      part.trim(),
    );
    if (!match) continue;
    out.push({
      key: match[1] ?? "",
      version: match[2] ?? "",
      locator: (match[3] ?? "").trim(),
    });
  }
  return out;
}

/** True when a token's version names the dataset's pin (a short commit counts). */
export function atPin(token: SourceToken, dataset: DatasetEntry): boolean {
  const pinned = datasetVersion(dataset);
  return dataset.kind === "github"
    ? token.version.length >= 7 && pinned.startsWith(token.version)
    : token.version === pinned;
}

/** The short form a list cites: seven characters of a commit, or the npm version. */
export function pinLabel(dataset: DatasetEntry): string {
  const pinned = datasetVersion(dataset);
  return dataset.kind === "github" ? pinned.slice(0, 7) : pinned;
}

/**
 * Reads a cached dataset file, refusing one whose hash isn't the pinned
 * file's: a list re-imported from a file nobody pinned has no provenance.
 */
export function pinnedFiles(
  datasetsDir: string,
  dataset: DatasetEntry,
): (path: string) => string {
  const cache = new Map<string, string>();
  return (path: string) => {
    const known = cache.get(path);
    if (known !== undefined) return known;
    const pinned = dataset.files.find((file) => file.path === path);
    if (!pinned)
      throw new Error(
        `${dataset.key} pins no file ${path} (content/datasets/manifest.json)`,
      );
    const abs = join(datasetsDir, dataset.key, path);
    if (!existsSync(abs))
      throw new Error(
        `${dataset.key}/${path} is not downloaded: run npm run content:datasets -- --key ${dataset.key}`,
      );
    const bytes = readFileSync(abs);
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (sha !== pinned.sha256)
      throw new Error(
        `${dataset.key}/${path} does not match its pinned sha256; run npm run content:datasets -- --key ${dataset.key} --force`,
      );
    const text = bytes.toString("utf8").replace(/^﻿/, "");
    cache.set(path, text);
    return text;
  };
}

export interface ListFinding {
  severity: "error" | "warn";
  entityId: string | null;
  dataset: string;
  message: string;
}

export interface AliasChange {
  entityId: string;
  add: string[];
}

export interface Reconciled {
  findings: ListFinding[];
  /** Dataset names a `source` dataset gives that the entry lacks. */
  changes: AliasChange[];
  /** Records of an enumerating source that no entry cites, by locator. */
  uncited: { dataset: string; locators: string[] }[];
  /** Entries checked against each dataset. */
  checked: Record<string, number>;
}

/** Straight apostrophes, as the lists write them (§2.1). */
export function listForm(name: string): string {
  return name.replace(/[\u2018\u2019]/g, "'").trim();
}

const HONORIFICS = new Set([
  "sir",
  "dame",
  "lord",
  "lady",
  "earl",
  "the",
  "dr",
]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/** A person's name without asides, titles and suffixes, as folded words. */
function personWords(name: string): string[] {
  const bare = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/,\s*(?:n[ée]e|born)\b.*$/i, "");
  return foldName(bare)
    .split(" ")
    .filter(
      (word) => word !== "" && !HONORIFICS.has(word) && !SUFFIXES.has(word),
    );
}

/**
 * True when a dataset's person name is one of ours: the same words in any
 * order ("Xiaobo Liu", "Liu Xiaobo"), or the same first and last names with
 * middle names or initials between, an initial standing for its first
 * letter ("Paul A. Samuelson", "C. V. Raman").
 */
export function samePerson(theirs: string, ours: Iterable<string>): boolean {
  const a = personWords(theirs);
  if (a.length === 0) return false;
  for (const name of ours) {
    const b = personWords(name);
    if (b.length === 0) continue;
    if (
      a.length === b.length &&
      [...a].sort().join(" ") === [...b].sort().join(" ")
    )
      return true;
    const firstA = a[0] ?? "";
    const firstB = b[0] ?? "";
    const firstAgrees =
      firstA === firstB ||
      ((firstA.length === 1 || firstB.length === 1) &&
        firstA.charAt(0) === firstB.charAt(0));
    if (a.at(-1) === b.at(-1) && firstAgrees) return true;
  }
  return false;
}

function factOf(entity: AnswerEntity, key: string): unknown {
  if (key === "id") return entity.id;
  return (entity.qualifier as Record<string, unknown>)[key];
}

function sameFact(
  key: string,
  entity: AnswerEntity,
  value: string | number,
): boolean {
  const mine = factOf(entity, key);
  if (mine === null || mine === undefined) return true; // Unknown on our side: nothing to compare.
  if (key === "id") return entity.id === value || entity.wikidataId === value;
  if (typeof value === "number") return Number(mine) === value;
  // Text facts compare folded, and a short form may stand in for a long one
  // (an author "T. S. Eliot" against "Thomas Stearns Eliot").
  const a = foldName(String(mine));
  const b = foldName(value);
  if (a === b) return true;
  const surname = (s: string) => s.split(" ").at(-1) ?? s;
  return key === "author" && surname(a) === surname(b);
}

/** Checks a list's entries against every dataset they cite. */
export function reconcileList(
  type: AnswerType,
  entities: AnswerEntity[],
  datasets: Map<
    string,
    { dataset: DatasetEntry; importer: ListImporter; index: DatasetIndex }
  >,
): Reconciled {
  const findings: ListFinding[] = [];
  const changes = new Map<string, string[]>();
  const cited = new Map<string, Set<string>>();
  const checked: Record<string, number> = {};
  for (const entity of entities) {
    for (const token of sourceTokens(entity.source)) {
      const loaded = datasets.get(token.key);
      if (!loaded) continue;
      const { dataset, importer, index } = loaded;
      checked[token.key] = (checked[token.key] ?? 0) + 1;
      if (!atPin(token, dataset))
        findings.push({
          severity: "warn",
          entityId: entity.id,
          dataset: token.key,
          message: `cites ${token.key}@${token.version}, but the manifest pins ${pinLabel(dataset)}: re-import it at the pin`,
        });
      const record = index.resolve(type, token.locator);
      if (!record) {
        findings.push({
          severity: "error",
          entityId: entity.id,
          dataset: token.key,
          message: `${token.key} holds no record at "${token.locator}"`,
        });
        continue;
      }
      const seen = cited.get(token.key) ?? new Set<string>();
      seen.add(record.locator);
      cited.set(token.key, seen);
      const ours = new Set(
        [entity.name, entity.display, ...entity.aliases].map((n) =>
          foldName(listForm(n)),
        ),
      );
      if (importer.role === "source") {
        const missing = record.names
          .map(listForm)
          .filter((name) => !ours.has(foldName(name)));
        if (missing.length > 0)
          changes.set(entity.id, [
            ...new Set([...(changes.get(entity.id) ?? []), ...missing]),
          ]);
      } else if (
        record.names.length > 0 &&
        !record.names.some((name) =>
          importer.names === "person"
            ? samePerson(listForm(name), [
                entity.name,
                entity.display,
                ...entity.aliases,
              ])
            : ours.has(foldName(listForm(name))),
        )
      ) {
        findings.push({
          severity: "warn",
          entityId: entity.id,
          dataset: token.key,
          message: `${token.key} names it ${record.names.map((n) => `"${n}"`).join(" or ")}, which is not among its name, display and aliases`,
        });
      }
      for (const [key, value] of Object.entries(record.facts)) {
        if (!sameFact(key, entity, value))
          findings.push({
            severity: "warn",
            entityId: entity.id,
            dataset: token.key,
            message: `${key === "id" ? "id" : `qualifier.${key}`} is ${JSON.stringify(factOf(entity, key))}; ${token.key} gives ${JSON.stringify(value)}`,
          });
      }
    }
  }
  const uncited: Reconciled["uncited"] = [];
  for (const [key, { importer, index }] of datasets) {
    if (importer.role !== "source" || !index.enumerate) continue;
    const seen = cited.get(key) ?? new Set<string>();
    const locators = index
      .enumerate(type)
      .map((record) => record.locator)
      .filter((locator) => !seen.has(locator));
    if (locators.length > 0) uncited.push({ dataset: key, locators });
  }
  return {
    findings,
    changes: [...changes].map(([entityId, add]) => ({ entityId, add })),
    uncited,
    checked,
  };
}

/** The datasets a list cites, by key: its provenance and its entries' sources. */
export function citedDatasets(list: {
  provenance: { source: string }[];
  entities: { source: string }[];
}): Set<string> {
  const keys = new Set<string>();
  for (const entry of list.provenance)
    for (const token of sourceTokens(entry.source)) keys.add(token.key);
  for (const entity of list.entities)
    for (const token of sourceTokens(entity.source)) keys.add(token.key);
  return keys;
}

/** The manifest entry of a key, or null. */
export function manifestEntry(
  manifest: DatasetManifest | null,
  key: string,
): DatasetEntry | null {
  return manifest?.datasets.find((dataset) => dataset.key === key) ?? null;
}
