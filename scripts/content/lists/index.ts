/**
 * npm run content:lists -- --type <type> [--write] [--json]
 * npm run content:lists -- --all
 *
 * Re-imports an answer list from its recorded sources (ARCHITECTURE §5.5,
 * §5.8): every pinned dataset the list's provenance or its entries' `source`
 * cite is read from `.cache/datasets/` (after `npm run content:datasets`),
 * each file checked against its pinned sha256, and every entry's citation
 * resolved and compared (scripts/content/lists/importer.ts):
 *
 * - an error when a citation resolves to nothing, when the list cites a
 *   dataset the manifest doesn't pin, or when a pinned file is missing or
 *   changed;
 * - a warning when an entry cites an older pin, or disagrees with a check
 *   dataset (a name, a code, a birth year, a QID); datasets are evidence,
 *   never the truth (CONTENT_GUIDE §9.5.1), so the list builder decides;
 * - a change when a source dataset (CLDR) gives a form the entry lacks:
 *   `--write` adds it as an alias, and the list takes a new version and
 *   `liveAt` (today, UTC: commit it the same day, on its own, §2.10 rule 5);
 * - a note listing the source records no entry cites, for the list builder,
 *   who adds entries only through a list batch.
 *
 * A list built only from list batches (films, books, dishes and others no
 * pinned dataset covers) has nothing to re-import, and says so. See
 * content/README.md and scripts/content/lists/README.md.
 */
import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseCli,
  run,
  str,
  todayUtc,
} from "../../../src/content/pipeline/cli.ts";
import {
  readJsonFile,
  writeJsonFile,
} from "../../../src/content/pipeline/json.ts";
import {
  findRepoRoot,
  repoRelative,
  resolveLayout,
} from "../../../src/content/pipeline/layout.ts";
import {
  AnswerListSchema,
  type AnswerEntity,
} from "../../../src/content/schema/answer-lists.ts";
import {
  DatasetManifestSchema,
  type DatasetEntry,
  type DatasetManifest,
} from "../../../src/content/schema/datasets.ts";
import {
  ANSWER_TYPES,
  type AnswerType,
} from "../../../src/content/schema/primitives.ts";
import { cldrTerritories } from "./cldr-territories.ts";
import { geonamesCities } from "./geonames-cities.ts";
import {
  citedDatasets,
  manifestEntry,
  pinnedFiles,
  reconcileList,
  type DatasetIndex,
  type ListFinding,
  type ListImporter,
  type Reconciled,
} from "./importer.ts";
import { mledozeCountries } from "./mledoze-countries.ts";
import { momaArtists } from "./moma-artists.ts";
import { naturalEarth } from "./natural-earth.ts";
import { nobelLaureates2016 } from "./nobel-laureates-2016.ts";
import { nobelPrizes } from "./nobel-prizes.ts";
import { ptable } from "./ptable.ts";
import { tateArtists } from "./tate-artists.ts";
import { worldCities } from "./world-cities.ts";
import { worldcup } from "./worldcup.ts";

/** One importer per pinned dataset a list cites. */
export const IMPORTERS: readonly ListImporter[] = [
  cldrTerritories,
  mledozeCountries,
  ptable,
  geonamesCities,
  worldCities,
  momaArtists,
  tateArtists,
  nobelPrizes,
  nobelLaureates2016,
  naturalEarth,
  worldcup,
];

const USAGE = `Usage: npm run content:lists -- (--type <type> | --all) [options]

  Re-imports an answer list from the pinned datasets it cites (run
  npm run content:datasets first) and reports what disagrees.

  --write          Add the aliases a source dataset gives (a new list version, liveAt today)
  --root <dir>     Bank root (default content/); with --fixtures, a fixture tree
  --fixtures       Treat --root as a fixture tree
  --today <date>   The version date --write gives (default today, UTC)
  --json           Machine-readable output`;

export interface ListReport extends Reconciled {
  type: AnswerType;
  entries: number;
  /** Datasets the list cites that no importer reads (list batches are no dataset). */
  unread: string[];
  written: boolean;
}

type ListFile = {
  type: AnswerType;
  version: string;
  liveAt?: string;
  provenance: { source: string; license: string; retrievedAt: string }[];
  entities: AnswerEntity[];
};

/** Re-imports one list in memory; `write` applies the alias changes to it. */
export function reimport(
  list: ListFile,
  manifest: DatasetManifest | null,
  datasetsDir: string,
  options: {
    write: boolean;
    today: string;
    importers?: readonly ListImporter[];
  },
): ListReport {
  const importers = options.importers ?? IMPORTERS;
  const findings: ListFinding[] = [];
  const unread: string[] = [];
  const datasets = new Map<
    string,
    { dataset: DatasetEntry; importer: ListImporter; index: DatasetIndex }
  >();
  for (const key of [...citedDatasets(list)].sort()) {
    const dataset = manifestEntry(manifest, key);
    if (!dataset) {
      findings.push({
        severity: "error",
        entityId: null,
        dataset: key,
        message: `the list cites ${key}, which content/datasets/manifest.json doesn't pin`,
      });
      continue;
    }
    const importer = importers.find(
      (candidate) =>
        candidate.key === key && candidate.types.includes(list.type),
    );
    if (!importer) {
      unread.push(key);
      continue;
    }
    try {
      datasets.set(key, {
        dataset,
        importer,
        index: importer.load(pinnedFiles(datasetsDir, dataset)),
      });
    } catch (error) {
      findings.push({
        severity: "error",
        entityId: null,
        dataset: key,
        message: (error as Error).message,
      });
    }
  }
  const reconciled = reconcileList(list.type, list.entities, datasets);
  let written = false;
  if (options.write && reconciled.changes.length > 0) {
    const byId = new Map(list.entities.map((entity) => [entity.id, entity]));
    for (const change of reconciled.changes) {
      const entity = byId.get(change.entityId);
      if (!entity) continue;
      entity.aliases = [...entity.aliases, ...change.add];
    }
    list.version = options.today;
    list.liveAt = options.today;
    written = true;
  }
  return {
    type: list.type,
    entries: list.entities.length,
    unread,
    written,
    ...reconciled,
    findings: [...findings, ...reconciled.findings],
  };
}

function describe(report: ListReport): string[] {
  const lines: string[] = [];
  const checked = Object.entries(report.checked)
    .map(([key, n]) => `${key} ${n}`)
    .join(", ");
  lines.push(
    `${report.type}: ${report.entries} entries${checked ? `; checked against ${checked}` : ""}.`,
  );
  if (Object.keys(report.checked).length === 0 && report.findings.length === 0)
    lines.push(
      `  No pinned dataset feeds the ${report.type} list: its entries come from list batches, so there is nothing to re-import.`,
    );
  for (const finding of report.findings)
    lines.push(
      `  ${finding.severity === "error" ? "error" : "warn "} ${finding.entityId ?? report.type} ${finding.dataset}: ${finding.message}`,
    );
  for (const change of report.changes)
    lines.push(
      `  ${report.written ? "added" : "would add"} alias(es) to ${change.entityId}: ${change.add.join(", ")}`,
    );
  for (const uncited of report.uncited)
    lines.push(
      `  note: ${uncited.locators.length} ${uncited.dataset} record(s) no entry cites (${uncited.locators.join(", ")}); entries are added through a list batch (§2.10 rule 5)`,
    );
  if (report.unread.length > 0)
    lines.push(
      `  note: cited without an importer: ${report.unread.join(", ")}`,
    );
  return lines;
}

async function main(argv: string[]): Promise<number> {
  const values = parseCli(
    "content:lists",
    argv,
    {
      type: { type: "string" },
      all: { type: "boolean" },
      write: { type: "boolean" },
      root: { type: "string" },
      fixtures: { type: "boolean" },
      today: { type: "string" },
      json: { type: "boolean" },
    },
    USAGE,
  );
  const layout = resolveLayout({
    repoRoot: findRepoRoot(),
    root: str(values, "root") ?? "content",
    fixtures: values.fixtures === true,
  });
  const type = str(values, "type");
  if ((type === undefined) === (values.all !== true))
    throw new Error(`pass --type <type> or --all\n\n${USAGE}`);
  if (type !== undefined && !(ANSWER_TYPES as readonly string[]).includes(type))
    throw new Error(`--type is one of ${ANSWER_TYPES.join(", ")}`);
  const manifest = existsSync(layout.manifestFile)
    ? DatasetManifestSchema.parse(
        (await readJsonFile(layout.manifestFile)).data,
      )
    : null;
  const types =
    type !== undefined
      ? [type as AnswerType]
      : readdirSync(layout.answerListsDir)
          .filter((name) => name.endsWith(".json"))
          .map((name) => name.slice(0, -5) as AnswerType)
          .filter((name) => (ANSWER_TYPES as readonly string[]).includes(name))
          .sort();
  const reports: ListReport[] = [];
  for (const listType of types) {
    const path = join(layout.answerListsDir, `${listType}.json`);
    if (!existsSync(path))
      throw new Error(`${repoRelative(layout, path)} does not exist`);
    const parsed = AnswerListSchema.safeParse(
      JSON.parse(await readFile(path, "utf8")),
    );
    if (!parsed.success)
      throw new Error(
        `${repoRelative(layout, path)} fails its schema; run npm run content:check first`,
      );
    const list = parsed.data as ListFile;
    const report = reimport(list, manifest, layout.datasetsCacheDir, {
      write: values.write === true,
      today: str(values, "today") ?? todayUtc(),
    });
    if (report.written) await writeJsonFile(path, list);
    reports.push(report);
  }
  const errors = reports.reduce(
    (sum, report) =>
      sum + report.findings.filter((f) => f.severity === "error").length,
    0,
  );
  if (values.json) {
    console.log(JSON.stringify({ ok: errors === 0, reports }, null, 2));
  } else {
    for (const report of reports)
      for (const line of describe(report)) console.log(line);
    const changes = reports.reduce(
      (sum, report) => sum + report.changes.length,
      0,
    );
    console.log(
      `content:lists: ${reports.length} list(s), ${errors} error(s), ${changes} entr${changes === 1 ? "y" : "ies"} with aliases to add${reports.some((r) => r.written) ? " (written: commit the list on its own, today)" : changes > 0 ? " (--write adds them)" : ""}.`,
    );
  }
  return errors === 0 ? 0 : 1;
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url))
  run("content:lists", () => main(process.argv.slice(2)));
