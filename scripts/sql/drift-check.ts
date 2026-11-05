/**
 * npm run sql:drift -- --applied <list_migrations.json> [--strict]
 *
 * Compares supabase/migrations with what the project has applied
 * (ARCHITECTURE §8.16). Paste the MCP list_migrations output into a file
 * and pass it. It fails when an applied migration has no file in the repo
 * (someone applied SQL that is not versioned), when a file that was never
 * applied sorts before the newest applied one (it would run out of order),
 * when a file name breaks the rule, or when a migration still to apply holds
 * a forbidden word or, unless it is an attended one, a statement the MCP
 * would stop to confirm. Applied migrations are never sent again, so they
 * are not scanned. Files after the newest applied one are pending: listed,
 * and an error only with --strict (the wave exit, after the integrator
 * applied everything). Owner-only migrations are listed as owner items and
 * never count as drift. So are attended migrations still to apply: they
 * wait for a session someone attends, which may come after later
 * migrations, and they only replace bodies an earlier migration of their
 * own ticket created, so neither their order nor --strict counts them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import {
  MIGRATIONS_DIR,
  describeFinding,
  listMigrations,
  mcpConfirmationReasons,
  parseAppliedMigrations,
  readText,
  scanForbidden,
  type MigrationFile,
} from "./lib.ts";

const USAGE = `Usage: npm run sql:drift -- --applied <file> [--strict]

  --applied <file>   list_migrations output (JSON) from the Supabase MCP
  --strict           Also fail while any migration is pending (attended
                     ones wait for an attended session and never count)`;

export interface DriftReport {
  /** In the repo and applied. */
  applied: string[];
  /** Applied but missing from the repo. */
  missing: string[];
  /** Not applied, after the newest applied migration: next to apply. */
  pending: string[];
  /** Not applied, but older than the newest applied migration. */
  outOfOrder: string[];
  /** Attended migrations not applied yet: they wait for an attended session, in any order. */
  attendedPending: string[];
  /** Owner-only migrations, and whether the project recorded them. */
  ownerOnly: { stem: string; applied: boolean }[];
  badNames: string[];
  /** Statements in migrations still to apply that cannot apply unattended. */
  forbidden: string[];
}

export function driftReport(
  files: MigrationFile[],
  badNames: string[],
  appliedNames: string[],
  read: (file: MigrationFile) => string,
): DriftReport {
  const applied = new Set(appliedNames);
  const stems = new Set(files.map((file) => file.stem));
  const agentFiles = files.filter((file) => !file.ownerOnly);
  const newestApplied = agentFiles
    .filter((file) => applied.has(file.stem))
    .map((file) => file.stem)
    .sort()
    .pop();
  const report: DriftReport = {
    applied: [],
    missing: appliedNames.filter((name) => !stems.has(name)).sort(),
    pending: [],
    outOfOrder: [],
    attendedPending: [],
    ownerOnly: files
      .filter((file) => file.ownerOnly)
      .map((file) => ({ stem: file.stem, applied: applied.has(file.stem) })),
    badNames: [...badNames],
    forbidden: [],
  };
  for (const file of agentFiles) {
    if (applied.has(file.stem)) {
      report.applied.push(file.stem);
      continue;
    }
    if (file.attended) report.attendedPending.push(file.stem);
    else if (newestApplied !== undefined && file.stem < newestApplied)
      report.outOfOrder.push(file.stem);
    else report.pending.push(file.stem);
    const path = `${MIGRATIONS_DIR}/${file.file}`;
    const sql = read(file);
    report.forbidden.push(...scanForbidden(path, sql).map(describeFinding));
    if (!file.attended) {
      report.forbidden.push(
        ...mcpConfirmationReasons(sql).map(
          (reason) =>
            `${path}: the MCP would ask a human to confirm: ${reason}`,
        ),
      );
    }
  }
  return report;
}

export function driftProblems(report: DriftReport, strict: boolean): string[] {
  return [
    ...report.missing.map(
      (name) =>
        `${name} is applied but has no file in ${MIGRATIONS_DIR}: version it, never edit the database by hand`,
    ),
    ...report.outOfOrder.map(
      (name) =>
        `${name} was never applied but sorts before the newest applied migration: rename it to a later timestamp`,
    ),
    ...report.badNames.map(
      (name) => `${name} is not <14-digit version>_<snake_case>.sql`,
    ),
    ...report.forbidden.map(
      (finding) => `would stop for confirmation: ${finding}`,
    ),
    ...(strict
      ? report.pending.map((name) => `${name} is not applied yet`)
      : []),
  ];
}

export function formatReport(report: DriftReport): string {
  const lines = [
    `applied (${report.applied.length}): ${report.applied.join(", ") || "none"}`,
    `pending (${report.pending.length}): ${report.pending.join(", ") || "none"}`,
  ];
  for (const stem of report.attendedPending) {
    lines.push(`attended item: ${stem} (waits for an attended session)`);
  }
  for (const item of report.ownerOnly) {
    lines.push(
      `owner item: ${item.stem} (${item.applied ? "recorded as applied" : "not applied; for the owner, see supabase/README.md"})`,
    );
  }
  return lines.join("\n");
}

export function main(argv: string[], root = process.cwd()): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      applied: { type: "string" },
      strict: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values.applied === undefined) {
    console.error(`sql:drift: --applied is required\n${USAGE}`);
    return 1;
  }
  const appliedNames = parseAppliedMigrations(
    JSON.parse(readFileSync(values.applied, "utf8")),
  );
  const { migrations, badNames } = listMigrations(root);
  const report = driftReport(migrations, badNames, appliedNames, (file) =>
    readText(root, `${MIGRATIONS_DIR}/${file.file}`),
  );
  console.log(formatReport(report));
  const problems = driftProblems(report, values.strict);
  if (problems.length > 0) {
    console.error("sql:drift: failed:");
    for (const problem of problems) console.error(`  ${problem}`);
    return 1;
  }
  console.log("sql:drift: no drift");
  return 0;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`sql:drift: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
