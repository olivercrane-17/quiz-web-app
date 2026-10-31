/**
 * npm run content:stats -- [--json] [--sealed] [--today <date>]
 *
 * Counts by pool, category, difficulty band, format and status, batch
 * progress and the Daily runway. See content/README.md.
 */
import { loadBank } from "../../src/content/pipeline/bank.ts";
import {
  parseCli,
  run,
  str,
  todayUtc,
} from "../../src/content/pipeline/cli.ts";
import {
  keySourceFromProcess,
  loadMasterKey,
} from "../../src/content/pipeline/keys.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import { computeStats, formatStats } from "../../src/content/pipeline/stats.ts";

const USAGE = `Usage: npm run content:stats -- [options]

  --sealed         Count from the envelopes (decrypted in memory) instead of .sealed-plain/
  --root <dir>     Bank root (default content/)
  --fixtures       Treat --root as a fixture tree
  --today <date>   Runway reference date (default: today, UTC)
  --json           Machine-readable output`;

run("content:stats", async () => {
  const values = parseCli(
    "content:stats",
    process.argv.slice(2),
    {
      sealed: { type: "boolean" },
      root: { type: "string" },
      fixtures: { type: "boolean" },
      today: { type: "string" },
      json: { type: "boolean" },
    },
    USAGE,
  );
  const keys = values.sealed
    ? ((await loadMasterKey(keySourceFromProcess()))?.keys ?? null)
    : null;
  const layout = resolveLayout({
    repoRoot: findRepoRoot(),
    root: str(values, "root") ?? "content",
    fixtures: values.fixtures === true,
  });
  const bank = await loadBank(layout, { sealed: values.sealed === true, keys });
  const stats = computeStats(bank, str(values, "today") ?? todayUtc());
  if (values.json) {
    console.log(JSON.stringify({ ...stats, notes: bank.notes }, null, 2));
  } else {
    console.log(formatStats(stats));
    for (const note of bank.notes) console.log(`note: ${note}`);
  }
  return 0;
});
