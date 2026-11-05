/**
 * npm run content:packets -- --batch <id> --pass A|B|T|E
 * npm run content:packets -- --batch <id> --pass A|B|T --next --record <draft.json>
 *
 * The packet builder (ARCHITECTURE §5.8, CONTENT_GUIDE §9.4), at the path
 * ARCHITECTURE §2.1 gives it. The content team's `npm run content:packet`
 * runs this same module through scripts/content/packet.ts, under its own
 * name.
 *
 * Packets are staged (§9.4). The first call serves each item's first stage
 * only, into .cache/packets/<batch>/<pass>/<item>/stage-1.json, logs its
 * hash and the time in served.json, and moves the batch to checking. Each
 * `--next` serves an item its next stage, and only once the run's draft
 * check record (`--record`) holds the cold-solve entry, with recordedAt,
 * for the stage before: a mystery's next clue after its clue's entry, the
 * final stage (the key and the claims) after the last cold one. The final
 * stage gives the packetSha256 and stagesServedAt lists the record copies,
 * and content:record holds the record to them. Running the first call
 * again starts the items' packets over.
 *
 * Before building, it refuses an item with lint errors, or whose selfCheck
 * lacks a code or holds a false (§2.3, §9.3). Pass E writes the estimator's
 * packet, estimate.json, in one stage, and changes nothing else.
 *
 * Passes A, B and T need the content key: options are shuffled with a seed
 * derived from it, so cold stages never show where the key sits. Before it
 * writes a packet with sealed items, the tool checks that .cache/packets/ is
 * git-ignored. See content/README.md.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
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
  todayUtc,
} from "../../src/content/pipeline/cli.ts";
import {
  formatJson,
  parseJsonText,
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
  type Layout,
} from "../../src/content/pipeline/layout.ts";
import {
  SERVE_LOG,
  STAGED_PACKET_VERSION,
  ServeLogSchema,
  estimatorView,
  nextStageBlocked,
  packetDir,
  packetStages,
  stageFile,
  stagedInstructions,
  type OrderKey,
  type ServeLog,
} from "../../src/content/pipeline/packets.ts";
import {
  batchItems,
  requireBatch,
} from "../../src/content/pipeline/register.ts";
import { assertPacketsIgnored } from "../../src/content/pipeline/store.ts";
import { BatchRegisterSchema } from "../../src/content/schema/batches.ts";
import {
  SELF_CHECK_CODES,
  type AnyItem,
} from "../../src/content/schema/items.ts";
import {
  BRIEF_FOR_PASS,
  ColdSolveSchema,
  type Pass,
} from "../../src/content/schema/verification.ts";
import { lintBank } from "./lint.ts";

const usage = (
  name: string,
) => `Usage: npm run ${name} -- --batch <id> --pass A|B|T|E [options]

  A and B are the two fact-checkers, T a tiebreak (§9.7), E the estimator (§8.5).
  A, B and T need the content key (QZ_CONTENT_KEY or ~/.config/quiz-web-app/content.key).
  Without --next: serves each item's first stage (and starts it over).

  --next           Serve each item its next stage, once --record holds the
                   cold-solve entry, with recordedAt, for the stage before
  --record <file>  The run's draft check record(s): a JSON array of entries
                   with "itemId" and "coldSolve", as content:record takes them
  --items <ids>    Comma-separated item ids (default: every draft or checking
                   item; for pass T, the items whose A and B verdicts split;
                   with --next, every item whose packet is not finished)
  --root <dir>     Bank root (default content/)
  --fixtures       Treat --root as a fixture tree
  --force          Build packets for a batch that is still open
  --json           Machine-readable output`;

/** Why an item may not get a packet: its selfCheck is missing or not all true (§2.3, §9.3). */
export function selfCheckProblem(item: AnyItem): string | null {
  const selfCheck = item.selfCheck;
  if (selfCheck === undefined) return "no selfCheck";
  const open = SELF_CHECK_CODES.filter((code) => selfCheck[code] !== true);
  return open.length === 0 ? null : `selfCheck ${open.join(", ")} not true`;
}

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
      next: { type: "boolean" },
      record: { type: "string" },
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
  const wanted = str(values, "items")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (values.next === true) {
    if (pass === "E")
      throw new Error(
        "the estimator's packet has one stage: --next is for A, B and T",
      );
    return serveNext(
      bank,
      name,
      batchId,
      pass,
      wanted,
      str(values, "record"),
      values.json === true,
    );
  }
  if (
    batch.status !== "submitted" &&
    batch.status !== "checking" &&
    !(values.force && batch.status === "open")
  ) {
    throw new Error(
      `${batchId} is ${batch.status}; packets are built once the writer has submitted it (content:batch -- submit)`,
    );
  }

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

  // Gate: the writer's selfCheck, every code true (§2.3, §9.3).
  const unchecked = records.flatMap((record) => {
    const problem = selfCheckProblem(record.item);
    return problem === null ? [] : [`${record.id} (${problem})`];
  });
  if (unchecked.length > 0) {
    throw new Error(
      `the packet builder refuses an item whose selfCheck lacks a code or holds a false (CONTENT_GUIDE §2.3, §9.3): ${unchecked.join(", ")}`,
    );
  }

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

  const orderKey = await orderKeyFor(layout.kind);
  const dir = packetDir(layout, batchId, pass);
  // Unstaged files from before staging never sit beside staged ones.
  if (existsSync(dir)) {
    for (const file of await readdir(dir)) {
      if (/^(?:cold(?:-\d+)?|reveal)\.json$/.test(file))
        await rm(join(dir, file), { force: true });
    }
  }
  const log = readLog(dir, batchId, pass as Pass);
  // Served times keep their milliseconds: a cold-solve entry and the next
  // stage can fall in the same second (§9.4's order is strict).
  const now = new Date().toISOString();
  const served: Served[] = [];
  for (const record of records) {
    const stages = packetStages(bank, record, pass as Pass, orderKey);
    const first = stages[0];
    if (!first) continue;
    // Starting over: the item's earlier stages leave the folder and the log.
    await rm(join(dir, record.id), { recursive: true, force: true });
    const previous = log.items[record.id];
    log.items[record.id] = {
      stages: stages.length,
      served: [{ stage: 1, sha256: first.sha256, servedAt: now }],
      restarts: previous ? previous.restarts + 1 : 0,
    };
    served.push(
      await serveStage(
        dir,
        batchId,
        pass as Pass,
        record,
        stages,
        1,
        log,
        name,
      ),
    );
  }
  await writeLog(dir, log);

  if (bank.register && batch.status !== "checking") {
    batch.status = "checking";
    await writeJsonFile(
      layout.registerFile,
      BatchRegisterSchema.parse(bank.register),
    );
  }
  report(name, layout, dir, pass, served, [], values.json === true);
  return 0;
}

/** One served stage, as the command reports it. */
interface Served {
  itemId: string;
  stage: number;
  of: number;
  packetSha256: string;
  file: string;
}

function emptyLog(batchId: string, pass: Pass): ServeLog {
  return {
    batchId,
    pass: pass as ServeLog["pass"],
    packetVersion: STAGED_PACKET_VERSION,
    items: {},
  };
}

function readLog(dir: string, batchId: string, pass: Pass): ServeLog {
  const path = join(dir, SERVE_LOG);
  if (!existsSync(path)) return emptyLog(batchId, pass);
  const parsed = ServeLogSchema.safeParse(
    JSON.parse(readFileSync(path, "utf8")),
  );
  if (!parsed.success)
    throw new Error(
      `${path} is not a serve log; build the packets again (content:packets without --next)`,
    );
  return parsed.data;
}

async function writeLog(dir: string, log: ServeLog): Promise<void> {
  await writeJsonFile(join(dir, SERVE_LOG), ServeLogSchema.parse(log));
}

/** Writes stage `stage` of an item's packet; the log already holds it. */
async function serveStage(
  dir: string,
  batchId: string,
  pass: Pass,
  record: BankItem,
  stages: { view: Record<string, unknown>; sha256: string }[],
  stage: number,
  log: ServeLog,
  name: string,
): Promise<Served> {
  const entry = log.items[record.id];
  const current = stages[stage - 1];
  if (!entry || !current) throw new Error(`no stage ${stage} for ${record.id}`);
  const final = stage === stages.length;
  const file = stageFile(record.id, stage);
  await writeTextFile(
    join(dir, file),
    await formatJson({
      batchId,
      pass,
      brief: BRIEF_FOR_PASS[pass],
      packetVersion: STAGED_PACKET_VERSION,
      itemId: record.id,
      stage,
      of: stages.length,
      final,
      packetSha256: current.sha256,
      servedAt: entry.served[stage - 1]?.servedAt,
      instructions: stagedInstructions(batchId, pass, name),
      item: current.view,
      // What the record copies (§9.8), once every stage is served.
      ...(final
        ? {
            record: {
              packetSha256: entry.served.map((s) => s.sha256),
              stagesServedAt: entry.served.map((s) => s.servedAt),
            },
          }
        : {}),
    }),
  );
  return {
    itemId: record.id,
    stage,
    of: stages.length,
    packetSha256: current.sha256,
    file,
  };
}

function report(
  name: string,
  layout: Layout,
  dir: string,
  pass: string,
  served: Served[],
  waiting: { itemId: string; reason: string }[],
  json: boolean,
): void {
  const where = repoRelative(layout, dir);
  if (json) {
    console.log(
      JSON.stringify(
        {
          pass,
          dir: where,
          items: served.map(({ itemId, stage, of, packetSha256, file }) => ({
            itemId,
            stage,
            of,
            packetSha256,
            file: `${where}/${file}`,
          })),
          waiting,
        },
        null,
        2,
      ),
    );
    return;
  }
  for (const entry of served)
    console.log(
      `${entry.itemId}  stage ${entry.stage} of ${entry.of}  ${entry.packetSha256}`,
    );
  for (const entry of waiting)
    console.log(`waiting ${entry.itemId}: ${entry.reason}`);
  console.log(
    `${name}: served ${served.length} pass ${pass} stage(s) in ${where}/${waiting.length > 0 ? `; ${waiting.length} item(s) wait for their cold-solve entry` : ""}.`,
  );
}

async function orderKeyFor(kind: "content" | "fixtures"): Promise<OrderKey> {
  const key = await loadMasterKey(keySourceFromProcess());
  if (key) return key.keys.order;
  if (kind === "fixtures") return FIXTURE_ORDER_KEY;
  throw new Error(
    "no content key: set QZ_CONTENT_KEY or run npm run content:keygen. Packets shuffle their options with a seed derived from the key, so a cold stage never shows where the key sits.",
  );
}

/** The cold solve the run's draft record holds for an item, if any. */
function draftColdSolves(path: string): Map<string, unknown> {
  const raw = parseJsonText(readFileSync(path, "utf8"), path);
  const entries = Array.isArray(raw) ? raw : [raw];
  const out = new Map<string, unknown>();
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const { itemId, coldSolve } = entry as Record<string, unknown>;
    if (typeof itemId === "string") out.set(itemId, coldSolve);
  }
  return out;
}

/** `--next`: each item's next stage, once its draft record allows it. */
async function serveNext(
  bank: Bank,
  name: string,
  batchId: string,
  pass: Pass,
  wanted: string[] | undefined,
  recordPath: string | undefined,
  json: boolean,
): Promise<number> {
  if (recordPath === undefined)
    throw new Error(
      "--next needs --record <draft.json>: the run's draft check record, holding the cold-solve entry for the stage before (§9.4)",
    );
  const layout = bank.layout;
  const dir = packetDir(layout, batchId, pass);
  const log = readLog(dir, batchId, pass);
  const ids =
    wanted ??
    Object.entries(log.items)
      .filter(([, item]) => item.served.length < item.stages)
      .map(([id]) => id);
  if (ids.length === 0)
    throw new Error(
      `no unfinished pass ${pass} packet in ${batchId}; build one with content:packets -- --batch ${batchId} --pass ${pass}`,
    );
  // Later stages of sealed items hold their clues and keys in plaintext.
  if (ids.some((id) => bank.itemsById.get(id)?.file.sealed === true))
    assertPacketsIgnored(layout);
  const drafts = draftColdSolves(recordPath);
  const now = new Date().toISOString();
  const orderKey = await orderKeyFor(layout.kind);
  const served: Served[] = [];
  const waiting: { itemId: string; reason: string }[] = [];
  for (const id of ids) {
    const entry = log.items[id];
    const record = bank.itemsById.get(id);
    if (!entry || !record) {
      waiting.push({
        itemId: id,
        reason:
          "no packet was built for it; run content:packets without --next first",
      });
      continue;
    }
    const cold = ColdSolveSchema.safeParse(drafts.get(id));
    const blocked = nextStageBlocked(
      entry,
      cold.success ? cold.data : null,
      now,
    );
    if (blocked !== null) {
      waiting.push({ itemId: id, reason: blocked });
      continue;
    }
    const stages = packetStages(bank, record, pass, orderKey);
    const changed = entry.served.some(
      (stage) => stages[stage.stage - 1]?.sha256 !== stage.sha256,
    );
    if (changed || stages.length !== entry.stages) {
      waiting.push({
        itemId: id,
        reason:
          "the item changed after its packet was started; start it over with content:packets without --next",
      });
      continue;
    }
    const next = entry.served.length + 1;
    entry.served.push({
      stage: next,
      sha256: stages[next - 1]?.sha256 ?? "",
      servedAt: now,
    });
    served.push(
      await serveStage(dir, batchId, pass, record, stages, next, log, name),
    );
  }
  await writeLog(dir, log);
  report(name, layout, dir, pass, served, waiting, json);
  // Asked for by name and not served: the run must not go on as if it was.
  return wanted !== undefined && waiting.length > 0 ? 1 : 0;
}

/** Runs the command under the name it was typed as. */
export function runPackets(name: string): void {
  run(name, () => main(process.argv.slice(2), name));
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url))
  runPackets("content:packets");
