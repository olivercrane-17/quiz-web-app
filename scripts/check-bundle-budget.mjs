/**
 * Fails when a route's first-load JavaScript is over its budget
 * (ARCHITECTURE §10.9; PRD §8.1, "Home route JavaScript" and "Play routes").
 *
 * Run it after `npm run build`. It reads the chunk list that a Turbopack
 * build writes for every route (.next/diagnostics/route-bundle-stats.json)
 * and gzips each chunk, which is roughly what a browser downloads.
 *
 * Budgets, gzipped: `/` 150 kB; `/daily` and `/practice/run` 180 kB; every
 * other route 200 kB, a guard rather than a PRD number. Routes that were
 * already over budget when SEC-1 brought the per-route budgets in carry a
 * waiver: a ceiling a few kB above their size then, so they can't grow
 * unnoticed while they wait for PERF-1 (or a ticket that touches them) to
 * bring them back under. A waived route over its ceiling fails like any
 * other, and the check says when a waiver is no longer needed. Lazy-only
 * modules are scripts/checks/lazy-markers.mjs's job.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const STATS_FILE = ".next/diagnostics/route-bundle-stats.json";

/** Gzipped first-load JS budgets, in bytes (1 kB = 1000 bytes), ARCHITECTURE §10.9. */
export const BUDGETS = new Map([
  ["/", 150_000],
  ["/daily", 180_000],
  ["/practice/run", 180_000],
]);

/** Every route without a budget of its own. */
export const DEFAULT_BUDGET = 200_000;

/**
 * Routes over budget when the per-route budgets arrived (SEC-1, measured on
 * the mock and Supabase builds of 5 November 2026), each held to a ceiling.
 * Raise a ceiling only with a reason in review; delete a waiver once its
 * route fits its budget.
 */
export const WAIVERS = new Map([
  ["/daily", { ceiling: 230_000, measured: 223_000, until: "PERF-1" }],
  ["/practice/run", { ceiling: 225_000, measured: 219_300, until: "PERF-1" }],
  [
    "/daily/[number]/results",
    { ceiling: 220_000, measured: 215_000, until: "PERF-1" },
  ],
]);

/** A failure the CLI prints as one line. */
export class BudgetError extends Error {}

export const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

/** The rows of route-bundle-stats.json, checked for the fields this script reads. */
export function readStats(root = process.cwd()) {
  let stats;
  try {
    stats = JSON.parse(readFileSync(resolve(root, STATS_FILE), "utf8"));
  } catch (error) {
    throw new BudgetError(
      `could not read ${STATS_FILE} (${error.message}). Run "npm run build" first.`,
    );
  }
  if (!Array.isArray(stats) || stats.length === 0) {
    throw new BudgetError(
      `${STATS_FILE} lists no routes. Has its format changed?`,
    );
  }
  for (const row of stats) {
    if (
      typeof row?.route !== "string" ||
      !Array.isArray(row.firstLoadChunkPaths)
    ) {
      throw new BudgetError(
        `no chunk list for route ${row?.route}. Has the stats format changed?`,
      );
    }
  }
  return stats;
}

/** Gzipped sizes of chunk files, each read once. */
export function gzippedSizes(root = process.cwd()) {
  const sizes = new Map();
  return (path) => {
    let size = sizes.get(path);
    if (size === undefined) {
      size = gzipSync(readFileSync(resolve(root, path))).length;
      sizes.set(path, size);
    }
    return size;
  };
}

/**
 * Every route's first-load total against its budget. Returns one report
 * row per route, the problems (empty when every route passes) and notes.
 */
export function checkBudgets(
  stats,
  sizeOf,
  { budgets = BUDGETS, defaultBudget = DEFAULT_BUDGET, waivers = WAIVERS } = {},
) {
  const rows = [];
  const problems = [];
  const notes = [];
  for (const { route, firstLoadChunkPaths } of stats) {
    const total = firstLoadChunkPaths.reduce(
      (sum, path) => sum + sizeOf(path),
      0,
    );
    const budget = budgets.get(route) ?? defaultBudget;
    const waiver = waivers.get(route);
    const share = `${Math.round((total / budget) * 100)}% of ${kB(budget)}`;
    let verdict;
    if (total <= budget) {
      verdict = share;
      if (waiver !== undefined) {
        notes.push(
          `${route} fits its ${kB(budget)} budget now (${kB(total)}): delete its waiver in scripts/check-bundle-budget.mjs.`,
        );
      }
    } else if (waiver !== undefined && total <= waiver.ceiling) {
      verdict = `${share}, waived up to ${kB(waiver.ceiling)} until ${waiver.until}`;
    } else {
      verdict = `${share}, OVER BUDGET`;
      problems.push(
        waiver === undefined
          ? `${route} loads ${kB(total)} of JavaScript first, over its ${kB(budget)} budget.`
          : `${route} loads ${kB(total)} of JavaScript first, over its ${kB(budget)} budget and past its waiver's ceiling of ${kB(waiver.ceiling)}.`,
      );
    }
    rows.push(`${route.padEnd(24)} ${kB(total).padStart(10)}   ${verdict}`);
  }

  const routes = new Set(stats.map((row) => row.route));
  const missing = [...budgets.keys()].filter((route) => !routes.has(route));
  if (missing.length > 0) {
    problems.push(`no stats for budgeted route(s): ${missing.join(", ")}.`);
  }
  for (const route of waivers.keys()) {
    if (!routes.has(route)) {
      notes.push(
        `the waiver for ${route} names a route this build doesn't have: delete it in scripts/check-bundle-budget.mjs.`,
      );
    }
  }
  return { rows, problems, notes };
}

function main() {
  const root = process.cwd();
  const stats = readStats(root);
  const { rows, problems, notes } = checkBudgets(stats, gzippedSizes(root));
  for (const row of rows) console.log(row);
  for (const note of notes) console.log(`check:bundle: note: ${note}`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`check:bundle: ${problem}`);
    console.error(
      "check:bundle: lazy-load heavy code with import() or next/dynamic (ARCHITECTURE §10.9).",
    );
    return 1;
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    if (!(error instanceof BudgetError)) throw error;
    console.error(`check:bundle: ${error.message}`);
    process.exitCode = 1;
  }
}
