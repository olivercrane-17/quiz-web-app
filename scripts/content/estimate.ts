/**
 * npm run content:estimate -- --batch <id> --file <estimates.json>
 *
 * Combines five estimator runs per item into `predicted` (CONTENT_GUIDE
 * §8.5): the median on the logit scale, with the standard deviation of the
 * logits as the spread. Estimators never edit item files themselves. See
 * content/README.md.
 */
import { readFile } from "node:fs/promises";

import { formatPath, loadBank } from "../../src/content/pipeline/bank.ts";
import {
  nowUtc,
  parseCli,
  requireStr,
  run,
  str,
} from "../../src/content/pipeline/cli.ts";
import {
  EstimateInputSchema,
  applyEstimate,
} from "../../src/content/pipeline/estimates.ts";
import { parseJsonText } from "../../src/content/pipeline/json.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import {
  batchItems,
  requireBatch,
} from "../../src/content/pipeline/register.ts";
import { saveItems } from "../../src/content/pipeline/store.ts";
import type { AnyItem } from "../../src/content/schema/items.ts";

const USAGE = `Usage: npm run content:estimate -- --batch <id> --file <estimates.json> [options]

  The file is a JSON array of { "itemId", "estimator": "es-...", "estimates": [five values] }:
  p for practice and room items, [s1, s2, s3, s4] for mysteries, { "pClose", "pExact" } for encores.

  --root <dir>     Bank root (default content/)
  --fixtures       Treat --root as a fixture tree
  --json           Machine-readable output`;

run("content:estimate", async () => {
  const values = parseCli(
    "content:estimate",
    process.argv.slice(2),
    {
      batch: { type: "string" },
      file: { type: "string" },
      root: { type: "string" },
      fixtures: { type: "boolean" },
      json: { type: "boolean" },
    },
    USAGE,
  );
  const batchId = requireStr(values, "batch", USAGE);
  const file = requireStr(values, "file", USAGE);
  const layout = resolveLayout({
    repoRoot: findRepoRoot(),
    root: str(values, "root") ?? "content",
    fixtures: values.fixtures === true,
  });
  const bank = await loadBank(layout);
  const batch = requireBatch(bank, batchId);
  const parsed = EstimateInputSchema.safeParse(
    parseJsonText(await readFile(file, "utf8"), file),
  );
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      console.log(
        `rejected estimate ${formatPath(issue.path)}: ${issue.message}`,
      );
    return 1;
  }
  const inBatch = new Set(batchItems(bank, batchId).map((record) => record.id));
  const updates = new Map<string, AnyItem>();
  const failures: { itemId: string; errors: string[] }[] = [];
  const now = nowUtc();
  for (const entry of parsed.data) {
    const record = bank.itemsById.get(entry.itemId);
    if (!record || !inBatch.has(entry.itemId)) {
      failures.push({
        itemId: entry.itemId,
        errors: [`not an item of ${batchId}`],
      });
      continue;
    }
    const { outcome, item } = applyEstimate(record, batch, entry, now);
    if (item) updates.set(entry.itemId, item);
    else failures.push({ itemId: entry.itemId, errors: outcome.errors });
  }
  if (failures.length === 0) await saveItems(bank, updates);
  if (values.json) {
    console.log(
      JSON.stringify(
        {
          ok: failures.length === 0,
          written: failures.length === 0 ? [...updates.keys()] : [],
          failures,
        },
        null,
        2,
      ),
    );
  } else {
    for (const failure of failures)
      for (const error of failure.errors)
        console.log(`rejected ${failure.itemId}: ${error}`);
    console.log(
      failures.length === 0
        ? `content:estimate: wrote predicted on ${updates.size} item(s) of ${batchId}.`
        : `content:estimate: ${failures.length} estimate(s) rejected; nothing was written.`,
    );
  }
  return failures.length === 0 ? 0 : 1;
});
