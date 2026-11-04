/**
 * npm run content:record -- --batch <id> --pass A|B|T --file <records.json>
 *
 * Validates fact-checker CheckRecords and merges them into the items'
 * verification. All or nothing: one bad record and nothing is merged.
 * See content/README.md.
 */
import { readFile } from "node:fs/promises";

import { loadBank } from "../../src/content/pipeline/bank.ts";
import { formatPath } from "../../src/content/pipeline/bank.ts";
import {
  parseCli,
  requireStr,
  run,
  str,
} from "../../src/content/pipeline/cli.ts";
import { parseJsonText } from "../../src/content/pipeline/json.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import {
  checkRecord,
  mergeRecord,
  recordFileErrors,
  searchUse,
} from "../../src/content/pipeline/records.ts";
import {
  batchItems,
  requireBatch,
} from "../../src/content/pipeline/register.ts";
import { saveItems } from "../../src/content/pipeline/store.ts";
import { RecordInputSchema } from "../../src/content/schema/inputs.ts";
import type { AnyItem } from "../../src/content/schema/items.ts";

const USAGE = `Usage: npm run content:record -- --batch <id> --pass A|B|T --file <records.json> [options]

  The file is a JSON array of CheckRecords (CONTENT_GUIDE §9.8), each with an
  extra "itemId" field.

  --replace        Overwrite an existing record for the same pass
  --dry-run        Validate only; write nothing
  --root <dir>     Bank root (default content/)
  --fixtures       Treat --root as a fixture tree
  --json           Machine-readable output`;

run("content:record", async () => {
  const values = parseCli(
    "content:record",
    process.argv.slice(2),
    {
      batch: { type: "string" },
      pass: { type: "string" },
      file: { type: "string" },
      replace: { type: "boolean" },
      "dry-run": { type: "boolean" },
      root: { type: "string" },
      fixtures: { type: "boolean" },
      json: { type: "boolean" },
    },
    USAGE,
  );
  const batchId = requireStr(values, "batch", USAGE);
  const pass = requireStr(values, "pass", USAGE);
  if (pass !== "A" && pass !== "B" && pass !== "T")
    throw new Error("--pass is A, B or T");
  const file = requireStr(values, "file", USAGE);
  const layout = resolveLayout({
    repoRoot: findRepoRoot(),
    root: str(values, "root") ?? "content",
    fixtures: values.fixtures === true,
  });
  const bank = await loadBank(layout);
  const batch = requireBatch(bank, batchId);

  const parsed = RecordInputSchema.safeParse(
    parseJsonText(await readFile(file, "utf8"), file),
  );
  const report: { itemId: string; errors: string[]; warnings: string[] }[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      report.push({
        itemId: `record ${formatPath(issue.path)}`,
        errors: [issue.message],
        warnings: [],
      });
    }
  } else {
    const inBatch = new Set(
      batchItems(bank, batchId).map((record) => record.id),
    );
    const seen = new Set<string>();
    for (const entry of parsed.data) {
      const record = bank.itemsById.get(entry.itemId);
      if (!record || !inBatch.has(entry.itemId)) {
        report.push({
          itemId: entry.itemId,
          errors: [`not an item of ${batchId}`],
          warnings: [],
        });
        continue;
      }
      if (seen.has(entry.itemId)) {
        report.push({
          itemId: entry.itemId,
          errors: ["two records for one item in one file"],
          warnings: [],
        });
        continue;
      }
      seen.add(entry.itemId);
      report.push(checkRecord(bank, batch, pass, record, entry));
    }
    const fileErrors = recordFileErrors(bank, parsed.data);
    if (fileErrors.length > 0)
      report.push({ itemId: "record file", errors: fileErrors, warnings: [] });
  }

  const rejected = report.filter((entry) => entry.errors.length > 0);
  const warnings: string[] = report.flatMap((entry) =>
    entry.warnings.map((w) => `${entry.itemId}: ${w}`),
  );
  let merged: string[] = [];
  if (rejected.length === 0 && parsed.success) {
    const updates = new Map<string, AnyItem>();
    for (const entry of parsed.data) {
      const record = bank.itemsById.get(entry.itemId);
      if (!record) continue;
      try {
        updates.set(
          entry.itemId,
          mergeRecord(record.item, entry, pass, values.replace === true).item,
        );
      } catch (error) {
        rejected.push({
          itemId: entry.itemId,
          errors: [(error as Error).message],
          warnings: [],
        });
      }
    }
    if (rejected.length === 0) {
      const added = parsed.data.reduce(
        (sum, entry) => sum + entry.searchesUsed,
        0,
      );
      const { used, budget } = searchUse(bank, batch);
      if (used + added > budget) {
        warnings.push(
          `${batchId} has used ${used + added} searches against a cap of ${budget}; rewrite fragile claims toward robust facts (§9.5.2)`,
        );
      }
      if (values["dry-run"] !== true) await saveItems(bank, updates);
      merged = [...updates.keys()];
    }
  }

  if (values.json) {
    console.log(
      JSON.stringify(
        { ok: rejected.length === 0, merged, rejected, warnings },
        null,
        2,
      ),
    );
  } else {
    for (const entry of rejected)
      for (const error of entry.errors)
        console.log(`rejected ${entry.itemId}: ${error}`);
    for (const warning of warnings) console.log(`warn ${warning}`);
    console.log(
      rejected.length === 0
        ? `content:record: ${values["dry-run"] ? "validated" : "merged"} ${merged.length} pass ${pass} record(s) into ${batchId}.`
        : `content:record: ${rejected.length} record(s) rejected; nothing was merged.`,
    );
  }
  return rejected.length === 0 ? 0 : 1;
});
