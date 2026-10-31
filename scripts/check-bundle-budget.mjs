/**
 * Fails when a route's first-load JavaScript is over budget.
 *
 * Run it after `npm run build`. It reads the chunk list that a Turbopack
 * build writes for every route (.next/diagnostics/route-bundle-stats.json)
 * and gzips each chunk, which is roughly what a browser downloads.
 *
 * The budget comes from docs/01-ENGINEERING-CONSTRAINTS.md: initial JS on
 * the home route around 150 KB gzipped or less. Routes without a budget are
 * listed for information only.
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const STATS_FILE = ".next/diagnostics/route-bundle-stats.json";

/** Gzipped first-load JS budgets, in bytes (1 kB = 1000 bytes). */
const BUDGETS = new Map([["/", 150_000]]);

function fail(message) {
  console.error(`check:bundle: ${message}`);
  process.exit(1);
}

let stats;
try {
  stats = JSON.parse(readFileSync(STATS_FILE, "utf8"));
} catch (error) {
  fail(
    `could not read ${STATS_FILE} (${error.message}). Run "npm run build" first.`,
  );
}
if (!Array.isArray(stats) || stats.length === 0) {
  fail(`${STATS_FILE} lists no routes. Has its format changed?`);
}

const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;
const gzippedSizes = new Map();
function gzippedSize(path) {
  let size = gzippedSizes.get(path);
  if (size === undefined) {
    size = gzipSync(readFileSync(path)).length;
    gzippedSizes.set(path, size);
  }
  return size;
}

const overBudget = [];
for (const { route, firstLoadChunkPaths } of stats) {
  if (!Array.isArray(firstLoadChunkPaths)) {
    fail(`no chunk list for route ${route}. Has the stats format changed?`);
  }
  const total = firstLoadChunkPaths.reduce(
    (sum, path) => sum + gzippedSize(path),
    0,
  );
  const budget = BUDGETS.get(route);
  const verdict =
    budget === undefined
      ? "no budget"
      : `${Math.round((total / budget) * 100)}% of ${kB(budget)}`;
  console.log(`${route.padEnd(24)} ${kB(total).padStart(10)}   ${verdict}`);
  if (budget !== undefined && total > budget) overBudget.push(route);
}

const missing = [...BUDGETS.keys()].filter(
  (route) => !stats.some((row) => row.route === route),
);
if (missing.length > 0) {
  fail(`no stats for budgeted route(s): ${missing.join(", ")}.`);
}
if (overBudget.length > 0) {
  fail(
    `first-load JS over budget on ${overBudget.join(", ")}. Lazy-load heavy code with import() or next/dynamic.`,
  );
}
