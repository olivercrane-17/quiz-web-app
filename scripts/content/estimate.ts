/**
 * npm run content:estimate -- --batch <id> --file <estimates.json> [--replace]
 *
 * Estimator v0's runner (CONTENT_GUIDE §8.5). The file holds five
 * independent estimates per item, one from each angle the estimator packet
 * names (fame of the answer across countries; school exposure; distractor
 * pull, or clue depth for mysteries; recency and memorability; reach outside
 * the US and UK). They combine by the median on the logit scale, with the
 * standard deviation of the logits as the spread (src/content/pipeline/
 * estimates.ts), into the item's `predicted`, and the estimator's run id
 * goes into `verification.estimates`. Estimators never edit item files by
 * hand. All or nothing: one refused estimate and nothing is written.
 *
 * **--replace** re-estimates items that are already active, as the editors
 * asked: `predicted` is in no checker packet (a packet hash covers what the
 * checkers saw, never the estimate), so the checks stay valid and the item
 * stays active. The run still may not be the writer, the editor or anyone
 * who checked the item (A, B, T, a follow-up, pass D or a re-check),
 * because one run holds one role on an item (§0.2). Draft and checking
 * items take a new estimate with or without the flag, as before; cut and
 * retired items never do. Each re-estimated active item is reported with
 * its band before and after, and a mystery that leaves its slot's assembly
 * window is named, so the editor can move it (§8.5); practice packs read
 * `predicted.p`, so a changed practice item needs `npm run content:build`.
 *
 * See content/README.md.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatPath,
  loadBank,
  type Bank,
  type BankItem,
} from "../../src/content/pipeline/bank.ts";
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
  type EstimateInputEntry,
} from "../../src/content/pipeline/estimates.ts";
import { parseJsonText } from "../../src/content/pipeline/json.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import { bandOf } from "../../src/content/pipeline/lint/pool-rules.ts";
import {
  batchItems,
  requireBatch,
  sameAgentRun,
} from "../../src/content/pipeline/register.ts";
import { saveItems } from "../../src/content/pipeline/store.ts";
import type { BatchEntry } from "../../src/content/schema/batches.ts";
import type { AnyItem } from "../../src/content/schema/items.ts";
import { SLOT_WINDOWS } from "./lib/rules.ts";

const USAGE = `Usage: npm run content:estimate -- --batch <id> --file <estimates.json> [options]

  The file is a JSON array of { "itemId", "estimator": "es-...", "estimates": [five values] }:
  p for practice and room items, [s1, s2, s3, s4] for mysteries, { "pClose", "pExact" } for encores,
  one per angle of the estimator packet (§8.5).

  --replace        Re-estimate active items too: predicted is in no checker packet,
                   so their checks stay valid and they stay active
  --root <dir>     Bank root (default content/)
  --fixtures       Treat --root as a fixture tree
  --json           Machine-readable output`;

/** What a new estimate changed on one item, for the report. */
export interface EstimateChange {
  itemId: string;
  status: AnyItem["status"];
  before: unknown;
  after: unknown;
  bandBefore: string | null;
  bandAfter: string;
  /** Set for a mystery whose expected points leave its slot's window (§10.2). */
  window?: {
    slot: number;
    expected: number;
    low: number;
    high: number;
    /** The slot whose window holds the new expected points, if any. */
    fits: number | null;
  };
}

export interface EstimateRun {
  updates: Map<string, AnyItem>;
  failures: { itemId: string; errors: string[] }[];
  changes: EstimateChange[];
}

/** Everyone who checked the item, in any pass: A, B, T, follow-ups, pass D, re-checks. */
function checkersOf(item: AnyItem): string[] {
  const v = item.verification;
  if (!v) return [];
  return [
    ...v.checks,
    ...(v.tiebreak ? [v.tiebreak] : []),
    ...(v.followUps ?? []),
    ...(v.dailyChecks ?? []),
    ...(v.rechecks ?? []),
  ].map((check) => check.checker);
}

/** A mystery's expected points (§8.3): the sum of its cumulative shares. */
function expectedPoints(item: AnyItem): number | null {
  if (!("kind" in item) || item.kind !== "mystery" || !item.predicted)
    return null;
  return item.predicted.solveByClue.reduce((sum, share) => sum + share, 0);
}

function windowNote(item: AnyItem): EstimateChange["window"] {
  const expected = expectedPoints(item);
  if (expected === null || !("kind" in item) || item.kind !== "mystery")
    return undefined;
  const [low, high] = SLOT_WINDOWS[item.slot] ?? [0, Infinity];
  if (expected >= low && expected <= high) return undefined;
  const fits = Object.entries(SLOT_WINDOWS).find(
    ([, [lo, hi]]) => expected >= lo && expected <= hi,
  )?.[0];
  return {
    slot: item.slot,
    expected: Math.round(expected * 100) / 100,
    low,
    high,
    fits: fits === undefined ? null : Number(fits),
  };
}

/**
 * Applies a file of estimates to one batch. Active items take one only with
 * `replace`; the combination itself is the pipeline's, the same for every
 * status.
 */
export function estimateBatch(
  bank: Bank,
  batch: BatchEntry,
  entries: EstimateInputEntry[],
  options: { replace: boolean; now: string },
): EstimateRun {
  const inBatch = new Set(batchItems(bank, batch.batchId).map((r) => r.id));
  const updates = new Map<string, AnyItem>();
  const failures: EstimateRun["failures"] = [];
  const changes: EstimateChange[] = [];
  for (const entry of entries) {
    const record = bank.itemsById.get(entry.itemId);
    if (!record || !inBatch.has(entry.itemId)) {
      failures.push({
        itemId: entry.itemId,
        errors: [`not an item of ${batch.batchId}`],
      });
      continue;
    }
    const active = record.item.status === "active";
    if (active && !options.replace) {
      failures.push({
        itemId: entry.itemId,
        errors: [
          "the item is active; pass --replace to re-estimate an active item (its checks stay valid)",
        ],
      });
      continue;
    }
    const errors: string[] = [];
    if (active) {
      // The pipeline's own role checks cover the writer, A, B, T and the editor.
      const checker = checkersOf(record.item).find((id) =>
        sameAgentRun(entry.estimator, id),
      );
      if (checker !== undefined)
        errors.push(
          `estimator ${entry.estimator} checked this item; one run holds one role (§0.2)`,
        );
    }
    // applyEstimate takes draft and checking items; an active item is
    // estimated as a checking one would be, and keeps its status.
    const subject: BankItem = active
      ? { ...record, item: { ...record.item, status: "checking" } as AnyItem }
      : record;
    const { outcome, item } = applyEstimate(subject, batch, entry, options.now);
    errors.push(...outcome.errors);
    if (errors.length > 0 || !item) {
      failures.push({ itemId: entry.itemId, errors: [...new Set(errors)] });
      continue;
    }
    const next = (active ? { ...item, status: "active" } : item) as AnyItem;
    updates.set(entry.itemId, next);
    const before = record.item.predicted;
    const change: EstimateChange = {
      itemId: entry.itemId,
      status: next.status,
      before: before ?? null,
      after: next.predicted ?? null,
      bandBefore: before === undefined ? null : bandOf(record.item),
      bandAfter: bandOf(next),
    };
    const window = windowNote(next);
    if (window) change.window = window;
    changes.push(change);
  }
  return { updates, failures, changes };
}

/** One line per re-estimated item: its band, and a slot it no longer fits. */
export function describeChange(change: EstimateChange): string {
  const band =
    change.bandBefore !== null && change.bandBefore !== change.bandAfter
      ? `band ${change.bandBefore} -> ${change.bandAfter}`
      : `band ${change.bandAfter}`;
  const parts = [`${change.itemId} (${change.status})`, band];
  if (change.window) {
    const w = change.window;
    parts.push(
      `expected points ${w.expected} leave Mystery ${w.slot}'s window (${w.low} to ${w.high})${w.fits === null ? "" : `; Mystery ${w.fits}'s holds them`}, so the editor moves it to another slot (§8.5)`,
    );
  }
  return parts.join(": ");
}

const isPractice = (id: string) => /^(?:fx\.)?p\./.test(id);

export async function main(argv: string[]): Promise<number> {
  const values = parseCli(
    "content:estimate",
    argv,
    {
      batch: { type: "string" },
      file: { type: "string" },
      replace: { type: "boolean" },
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
  const result = estimateBatch(bank, batch, parsed.data, {
    replace: values.replace === true,
    now: nowUtc(),
  });
  const ok = result.failures.length === 0;
  if (ok) await saveItems(bank, result.updates);
  if (values.json) {
    console.log(
      JSON.stringify(
        {
          ok,
          written: ok ? [...result.updates.keys()] : [],
          failures: result.failures,
          changes: ok ? result.changes : [],
        },
        null,
        2,
      ),
    );
    return ok ? 0 : 1;
  }
  for (const failure of result.failures)
    for (const error of failure.errors)
      console.log(`rejected ${failure.itemId}: ${error}`);
  if (!ok) {
    console.log(
      `content:estimate: ${result.failures.length} estimate(s) rejected; nothing was written.`,
    );
    return 1;
  }
  // Every re-estimated active item, and any new estimate that leaves its slot.
  for (const change of result.changes)
    if (change.status === "active" || change.window)
      console.log(describeChange(change));
  console.log(
    `content:estimate: wrote predicted on ${result.updates.size} item(s) of ${batchId}.`,
  );
  if (
    result.changes.some(
      (change) => change.status === "active" && isPractice(change.itemId),
    )
  )
    console.log(
      "Practice packs read predicted.p: run npm run content:build and commit its outputs.",
    );
  return 0;
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url))
  run("content:estimate", () => main(process.argv.slice(2)));
