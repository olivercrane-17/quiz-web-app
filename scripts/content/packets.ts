/**
 * npm run content:packets -- --batch <id> --pass A|B|T|E
 *
 * The packet builder (ARCHITECTURE §5.8, CONTENT_GUIDE §9.4), at the path
 * ARCHITECTURE §2.1 gives it. The content team's `npm run content:packet`
 * runs this same module through scripts/content/packet.ts, under its own
 * name, so every command and every line of output they rely on stays as it
 * was.
 *
 * Writes blind packets to .cache/packets/<batch>/<pass>/: cold.json (for
 * mysteries cold-1.json to cold-4.json, one clue per stage, the options with
 * the last) and reveal.json, prints each item's packetSha256, and moves the
 * batch to checking. Items move to checking once they carry both a check
 * record and the estimate (content:record, content:estimate). Pass E writes
 * the estimator's packet, estimate.json, and changes nothing.
 *
 * Passes A, B and T need the content key: options are shuffled with a seed
 * derived from it, so cold packets never show where the key sits. Before it
 * writes a packet with sealed items, the tool checks that .cache/packets/ is
 * git-ignored. See content/README.md.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadBank } from "../../src/content/pipeline/bank.ts";
import {
  nowUtc,
  parseCli,
  requireStr,
  run,
  str,
  todayUtc,
} from "../../src/content/pipeline/cli.ts";
import {
  formatJson,
  writeJsonFile,
  writeTextFile,
} from "../../src/content/pipeline/json.ts";
import {
  keySourceFromProcess,
  loadMasterKey,
} from "../../src/content/pipeline/keys.ts";
import {
  findRepoRoot,
  repoRelative,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import {
  estimatorView,
  packetEntry,
  packetFiles,
  type OrderKey,
} from "../../src/content/pipeline/packets.ts";
import {
  batchItems,
  requireBatch,
} from "../../src/content/pipeline/register.ts";
import { assertPacketsIgnored } from "../../src/content/pipeline/store.ts";
import { BatchRegisterSchema } from "../../src/content/schema/batches.ts";
import type { Pass } from "../../src/content/schema/verification.ts";
import { lintBank } from "./lint.ts";

const usage = (
  name: string,
) => `Usage: npm run ${name} -- --batch <id> --pass A|B|T|E [options]

  A and B are the two fact-checkers, T a tiebreak (§9.7), E the estimator (§8.5).
  A, B and T need the content key (QZ_CONTENT_KEY or ~/.config/quiz-web-app/content.key).

  --items <ids>    Comma-separated item ids (default: every draft or checking item;
                   for pass T, the items whose A and B verdicts split)
  --root <dir>     Bank root (default content/)
  --fixtures       Treat --root as a fixture tree
  --force          Build packets for a batch that is still open
  --json           Print the hashes as JSON`;

/** Fixture trees are invented content, so their packets use a public order key. */
const FIXTURE_ORDER_KEY = createHash("sha256")
  .update("quiz-web-app fixture packet order")
  .digest();

/**
 * Builds one batch's packets for one pass. `name` is the command the
 * person typed (content:packets, or the older content:packet), which every
 * message names.
 */
export async function main(
  argv: string[],
  name = "content:packets",
): Promise<number> {
  const USAGE = usage(name);
  const values = parseCli(
    name,
    argv,
    {
      batch: { type: "string" },
      pass: { type: "string" },
      items: { type: "string" },
      root: { type: "string" },
      fixtures: { type: "boolean" },
      force: { type: "boolean" },
      json: { type: "boolean" },
    },
    USAGE,
  );
  const batchId = requireStr(values, "batch", USAGE);
  const pass = requireStr(values, "pass", USAGE);
  if (pass !== "A" && pass !== "B" && pass !== "T" && pass !== "E")
    throw new Error("--pass is A, B, T or E");
  const layout = resolveLayout({
    repoRoot: findRepoRoot(),
    root: str(values, "root") ?? "content",
    fixtures: values.fixtures === true,
  });
  const bank = await loadBank(layout);
  const batch = requireBatch(bank, batchId);
  if (
    batch.status !== "submitted" &&
    batch.status !== "checking" &&
    !(values.force && batch.status === "open")
  ) {
    throw new Error(
      `${batchId} is ${batch.status}; packets are built once the writer has submitted it (content:batch -- submit)`,
    );
  }

  const wanted = str(values, "items")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  let records = batchItems(bank, batchId).filter(
    (record) =>
      record.item.status === "draft" || record.item.status === "checking",
  );
  if (wanted) {
    records = records.filter((record) => wanted.includes(record.id));
    const missing = wanted.filter(
      (id) => !records.some((record) => record.id === id),
    );
    if (missing.length > 0)
      throw new Error(
        `not draft or checking items of ${batchId}: ${missing.join(", ")}`,
      );
  } else if (pass === "T") {
    records = records.filter((record) => {
      const checks = record.item.verification?.checks ?? [];
      const verdicts = checks.map((check) => check.verdict === "pass");
      return checks.length === 2 && verdicts[0] !== verdicts[1];
    });
  }
  if (records.length === 0)
    throw new Error(`no items to build pass ${pass} packets for in ${batchId}`);

  // Gate: lint clean and claims listed (§0.3, step 1).
  const findings = lintBank(bank, { today: todayUtc(), dedupe: false });
  const ids = new Set(records.map((record) => record.id));
  const blocked = [
    ...new Set(
      findings
        .filter((f) => f.severity === "error" && f.itemId && ids.has(f.itemId))
        .map((f) => f.itemId),
    ),
  ];
  if (blocked.length > 0) {
    throw new Error(
      `lint errors in ${blocked.length} item(s): ${blocked.join(", ")}. Run npm run content:check -- --batch ${batchId}`,
    );
  }

  // Packets of sealed items hold their clues and keys in plaintext.
  if (records.some((record) => record.file.sealed))
    assertPacketsIgnored(layout);

  if (pass === "E") {
    const dir = join(layout.packetsDir, batchId, "E");
    await writeTextFile(
      join(dir, "estimate.json"),
      await formatJson({
        batchId,
        pass: "E",
        generatedAt: nowUtc(),
        instructions: [
          "Estimator v0 (CONTENT_GUIDE §8.5): give five independent estimates per item, each from a different angle: fame of the answer across countries; school exposure; distractor pull (clue depth for mysteries); recency and memorability; reach outside the US and UK.",
          "Practice and room items: p, the share of typical adults who pick the right answer. Mysteries: cumulative shares [s1, s2, s3, s4]. Encores: { pClose, pExact }.",
          "Never use your own solve rate as difficulty. Then run: npm run content:estimate -- --batch <batch> --file <estimates.json>.",
        ],
        items: records.map((record) => estimatorView(bank, record)),
      }),
    );
    console.log(
      `${name}: ${records.length} estimator packet(s) in ${repoRelative(layout, dir)}/estimate.json.`,
    );
    return 0;
  }

  const key = await loadMasterKey(keySourceFromProcess());
  let orderKey: OrderKey;
  if (key) orderKey = key.keys.order;
  else if (layout.kind === "fixtures") orderKey = FIXTURE_ORDER_KEY;
  else
    throw new Error(
      "no content key: set QZ_CONTENT_KEY or run npm run content:keygen. Packets shuffle their options with a seed derived from the key, so a cold packet never shows where the key sits.",
    );

  const entries = records.map((record) =>
    packetEntry(bank, record, pass as Pass, orderKey),
  );
  const files = packetFiles(batchId, pass, entries, nowUtc());
  const dir = join(layout.packetsDir, batchId, pass);
  // A stale stage from an earlier build must never sit beside the new ones.
  if (existsSync(dir)) {
    for (const name of await readdir(dir)) {
      if (/^(?:cold(?:-\d+)?|reveal)\.json$/.test(name))
        await rm(join(dir, name), { force: true });
    }
  }
  for (const file of files)
    await writeTextFile(join(dir, file.name), await formatJson(file.content));

  if (bank.register && batch.status !== "checking") {
    batch.status = "checking";
    await writeJsonFile(
      layout.registerFile,
      BatchRegisterSchema.parse(bank.register),
    );
  }

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          batchId,
          pass,
          dir: repoRelative(layout, dir),
          files: files.map((file) => file.name),
          items: entries.map(({ itemId, packetSha256 }) => ({
            itemId,
            packetSha256,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    for (const entry of entries)
      console.log(`${entry.itemId}  ${entry.packetSha256}`);
    console.log(
      `${name}: ${entries.length} pass ${pass} packet(s) in ${repoRelative(layout, dir)}/ (${files.map((file) => file.name).join(", then ")}).`,
    );
  }
  return 0;
}

/** Runs the command under the name it was typed as. */
export function runPackets(name: string): void {
  run(name, () => main(process.argv.slice(2), name));
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url))
  runPackets("content:packets");
