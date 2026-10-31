/**
 * npm run content:decide -- --batch <id> --file <decisions.json>
 *
 * Applies editor decisions (accept, rewrite, cut) and the acceptance rule of
 * CONTENT_GUIDE §9.9. Only items that pass become active. See
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
import { applyDecisions } from "../../src/content/pipeline/decisions.ts";
import { parseJsonText } from "../../src/content/pipeline/json.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import { requireBatch } from "../../src/content/pipeline/register.ts";
import { DecisionInputSchema } from "../../src/content/schema/inputs.ts";

const USAGE = `Usage: npm run content:decide -- --batch <id> --file <decisions.json> [options]

  The file is a JSON array of decisions:
    { "itemId", "editor": "ed-...", "decision": "accept" | "rewrite" | "cut",
      "reason", "edits"?: { field: value }, "dedupe"?: "related_ok" | "duplicate",
      "recheck"?: true, "wordingOnly"?: true, "decidedAt"?: ISO timestamp }

  accept edits only sourceLabels, tags, lintAllow and reviewBy, refuses an item
  changed since its checks, and needs a lintAllow for every lint warning.
  rewrite clears the checks and the estimate when it changes anything a packet
  shows, unless "wordingOnly": true (stem, question, explanation, learnMore,
  measure, valueDisplay, unitShort, unitLabel), which keeps and re-stamps them.

  --root <dir>     Bank root (default content/)
  --fixtures       Treat --root as a fixture tree
  --skip-guide     Leave the guide's examples out of the dedupe check
  --json           Machine-readable output`;

run("content:decide", async () => {
  const values = parseCli(
    "content:decide",
    process.argv.slice(2),
    {
      batch: { type: "string" },
      file: { type: "string" },
      root: { type: "string" },
      fixtures: { type: "boolean" },
      "skip-guide": { type: "boolean" },
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
  const parsed = DecisionInputSchema.safeParse(
    parseJsonText(await readFile(file, "utf8"), file),
  );
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      console.log(
        `rejected decision ${formatPath(issue.path)}: ${issue.message}`,
      );
    return 1;
  }
  const { outcomes, written } = await applyDecisions(bank, batch, parsed.data, {
    now: nowUtc(),
    includeGuide: values["skip-guide"] !== true,
  });
  const failed = outcomes.filter((outcome) => !outcome.ok);
  if (values.json) {
    console.log(
      JSON.stringify({ ok: failed.length === 0, outcomes, written }, null, 2),
    );
  } else {
    for (const outcome of outcomes) {
      if (outcome.ok) {
        console.log(
          `${outcome.itemId}: ${outcome.decision} -> ${String(outcome.status)}`,
        );
      } else {
        console.log(`${outcome.itemId}: ${outcome.decision} refused`);
        for (const error of outcome.errors) console.log(`  - ${error}`);
      }
      for (const warning of outcome.warnings) console.log(`  warn: ${warning}`);
    }
    console.log(
      `content:decide: ${outcomes.length - failed.length} applied, ${failed.length} refused.`,
    );
  }
  return failed.length === 0 ? 0 : 1;
});
