/**
 * npm run content:reinstate -- (--batch <id> | --all) [--dry-run] [--json]
 *
 * Reinstates cut items of closed batches that were cut only because a
 * high-risk claim or an encore value had no dataset or web evidence, which
 * decisions memo §18 now accepts when checks A and B both confirmed it
 * directly. Every other cut stands. The rule and its gates are in
 * src/content/pipeline/reinstate.ts; see content/README.md.
 *
 * Output follows the rule of ARCHITECTURE §5.4: counts per batch and item
 * ids, never item text, and for sealed batches (mysteries, encores, room
 * packs) counts only.
 */
import { loadBank } from "../../src/content/pipeline/bank.ts";
import { nowUtc, parseCli, run, str } from "../../src/content/pipeline/cli.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import { requireBatch } from "../../src/content/pipeline/register.ts";
import {
  applyReinstatement,
  keptByReason,
  planReinstatement,
  type ReinstateBatchResult,
} from "../../src/content/pipeline/reinstate.ts";
import type { BatchEntry } from "../../src/content/schema/batches.ts";

const USAGE = `Usage: npm run content:reinstate -- (--batch <id> | --all) [options]

  Reinstates cut items of closed batches that were cut only for missing
  external evidence on a high-risk claim or an encore value, now accepted
  when checks A and B both confirmed it directly (decisions memo section 18).
  An item comes back only if both checks passed it, by different runs, with
  every claim confirmed directly in both, no tiebreak, no issue raised, no
  dedupe, myths or lint problem, and the acceptance rule passes exactly as
  content:decide runs it with the batch's editor. It becomes active with an
  editor decision of accept; the register's counts are updated and the batch
  stays closed. Ids and text never change.

  --batch <id>     One closed batch
  --all            Every closed item batch
  --dry-run        Change nothing; list what would change
  --include-checking  Also consider batches still in checking (cut items only;
                   use only when no editor is working on them)
  --skip-guide     Leave the guide's examples out of the dedupe check
  --root <dir>     Bank root (default content/)
  --fixtures       Treat --root as a fixture tree
  --json           Machine-readable output

  It writes items and content/batches.json: run it under the content lock,
  like every other command that changes content.`;

function line(result: ReinstateBatchResult, dryRun: boolean): string[] {
  const verb = dryRun ? "would reinstate" : "reinstated";
  const reasons = Object.entries(keptByReason(result.kept))
    .map(([reason, n]) => `${reason} ${n}`)
    .join(", ");
  const out = [
    `${result.batchId.padEnd(24)} editor ${String(result.editor ?? "none").padEnd(14)} cut ${String(result.considered).padStart(3)}: ${verb} ${result.reinstated.length}, stay cut ${result.kept.length}${reasons ? ` (${reasons})` : ""}${result.skipped > 0 ? `; ${result.skipped} cut without a cut decision left alone` : ""}`,
  ];
  if (result.reinstated.length > 0) {
    const { before, after } = result.register;
    out.push(
      `  register: accepted ${String(before.accepted)} -> ${String(after.accepted)}, cut ${String(before.cut)} -> ${String(after.cut)}; still closed`,
    );
    out.push(
      result.sealed
        ? "  ids: not shown for a sealed batch"
        : `  ids: ${result.reinstated.join(", ")}`,
    );
  }
  return out;
}

run("content:reinstate", async () => {
  const values = parseCli(
    "content:reinstate",
    process.argv.slice(2),
    {
      batch: { type: "string" },
      all: { type: "boolean" },
      "dry-run": { type: "boolean" },
      "skip-guide": { type: "boolean" },
      "include-checking": { type: "boolean" },
      root: { type: "string" },
      fixtures: { type: "boolean" },
      json: { type: "boolean" },
    },
    USAGE,
  );
  const batchId = str(values, "batch");
  const all = values.all === true;
  if ((batchId === undefined) === !all) {
    console.error(`Pass --batch <id> or --all, not both.\n\n${USAGE}`);
    return 2;
  }
  const dryRun = values["dry-run"] === true;
  const includeChecking = values["include-checking"] === true;
  const layout = resolveLayout({
    repoRoot: findRepoRoot(),
    root: str(values, "root") ?? "content",
    fixtures: values.fixtures === true,
  });
  const bank = await loadBank(layout);
  if (!bank.register)
    throw new Error(
      `no valid batch register at ${layout.registerFile}; run npm run content:check`,
    );
  let batches: BatchEntry[];
  if (batchId !== undefined) {
    const batch = requireBatch(bank, batchId);
    if (batch.pool === "list")
      throw new Error(`${batchId} is a list batch, which holds no items`);
    if (
      batch.status !== "closed" &&
      !(includeChecking && batch.status === "checking")
    )
      throw new Error(
        `${batchId} is ${batch.status}; content:reinstate considers closed batches only`,
      );
    batches = [batch];
  } else {
    batches = bank.register.batches.filter(
      (batch) =>
        (batch.status === "closed" ||
          (includeChecking && batch.status === "checking")) &&
        batch.pool !== "list",
    );
  }

  const plan = planReinstatement(bank, batches, {
    now: nowUtc(),
    includeGuide: values["skip-guide"] !== true,
    includeChecking,
  });
  const written = dryRun ? [] : await applyReinstatement(bank, plan);
  const total = (pick: (result: ReinstateBatchResult) => number) =>
    plan.batches.reduce((sum, result) => sum + pick(result), 0);
  const reinstated = total((result) => result.reinstated.length);
  const sealedChanged = plan.batches.some(
    (result) => result.sealed && result.reinstated.length > 0,
  );

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          dryRun,
          batches: plan.batches.map((result) => ({
            batchId: result.batchId,
            pool: result.pool,
            sealed: result.sealed,
            editor: result.editor,
            considered: result.considered,
            skipped: result.skipped,
            reinstated: result.reinstated.length,
            kept: result.kept.length,
            keptByReason: keptByReason(result.kept),
            register: result.register,
            // Sealed batches: counts only, never ids (ARCHITECTURE §5.4).
            ...(result.sealed
              ? {}
              : { ids: result.reinstated, keptIds: result.kept }),
          })),
          totals: {
            batches: plan.batches.length,
            considered: total((result) => result.considered),
            reinstated,
            kept: total((result) => result.kept.length),
          },
          filesWritten: written.length,
          notes: bank.notes,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(
    dryRun
      ? "content:reinstate: dry run, nothing is written."
      : "content:reinstate: writing reinstated items and the register.",
  );
  for (const note of bank.notes) console.log(`note: ${note}`);
  for (const result of plan.batches)
    for (const text of line(result, dryRun)) console.log(text);
  console.log(
    `content:reinstate: ${plan.batches.length} closed batch(es), ${total((result) => result.considered)} cut item(s) considered, ${reinstated} ${dryRun ? "would be reinstated" : "reinstated"}, ${total((result) => result.kept.length)} stay cut.`,
  );
  if (!dryRun && sealedChanged)
    console.log(
      "content:reinstate: sealed items changed in the plaintext workspace; run npm run content:seal before committing the envelopes.",
    );
  return 0;
});
