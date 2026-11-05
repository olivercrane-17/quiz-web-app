/**
 * npm run content:audit -- --seed <n> ...      draw a seeded audit sample
 * npm run content:audit -- pack --audit <id>   mix in the planted items
 * npm run content:audit -- verdicts --audit <id> --file <verdicts.json>
 * npm run content:audit -- confirm --audit <id> --item <id> (--error --recheck <ref> | --cleared)
 * npm run content:audit -- check [--audit <id>] [--launch] [--sealed]
 *
 * The seeded blind audit (CONTENT_GUIDE §9.10; decisions memo §15 and §18,
 * which make it mandatory before launch). A separate auditor re-checks at
 * least 400 random practice items and 60 sealed Daily items mixed with at
 * least 25 planted bad items, at least half of them subtle. Every item, real
 * or planted, reaches the auditor under an opaque packet id, so no id tells
 * the two apart. The audit passes only if the auditor catches at least 24 of
 * 25 plants (96% when more are planted) and no real item turns out wrong.
 *
 * 1. **Draw** (`--seed`): the sample, drawn from the active practice items
 *    and the active mysteries and encores with the engine's seeded rng, so a
 *    seed and a bank always draw the same items. Items the auditor wrote,
 *    checked, estimated or decided are left out (§0.2), and so are the
 *    batches the planter wrote or checked. Writes the record (status
 *    `drawn`) and the planter's brief, `.cache/audits/<id>/planter.json`.
 * 2. **Plant**: the planter writes `.cache/audits/<id>/planted/<NN>.json`,
 *    each `{ "defect", "subtle", "item" }`, the item in its source format.
 *    Planted items live only there, never under content/ (§9.10).
 * 3. **Pack**: every sampled and planted item under a fresh opaque id, in a
 *    shuffled order, as the auditor sees it (no id, status, notes, checks,
 *    estimate or difficulty), in `.cache/audits/<id>/packet.json`. The
 *    plants' defect types and subtlety go into the record, never their text.
 * 4. **Verdicts**: the auditor's `[{ "packetId", "verdict": "pass" | "fail",
 *    "defect"?, "note"? }]`, one per packet, all or nothing. A failed plant
 *    is caught; a failed real item is flagged for a fresh re-check.
 * 5. **Confirm**: each flagged item's re-check, `--error` (with the
 *    re-checks' references; the item's batch gets an `audit_failure`
 *    incident and goes back for a full re-check, and a fresh audit runs on a
 *    new sample) or `--cleared`. The audit closes when none is left open.
 * 6. **Check**: validates every audit record against its schema
 *    (src/content/schema/audit.ts) and reports the latest pre-launch one's
 *    AC-CNT-05 criteria, which `--launch` makes errors. Records are sealed,
 *    so a `--sealed` run reads the envelopes in memory and prints through
 *    the redacting reporter (ARCHITECTURE §5.4).
 *
 * The record is sealed because it lists sealed ids: it lives in the
 * plaintext workspace (`content/.sealed-plain/audits/<id>.json`) and
 * `npm run content:seal` commits it as an envelope. **--dry-run** keeps it
 * in `.cache/audits/<id>/record.json` instead and writes nothing under
 * content/, register incidents included. See content/README.md.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  loadBank,
  type Bank,
  type BankItem,
} from "../../src/content/pipeline/bank.ts";
import {
  parseCli,
  str,
  todayUtc,
  type CliValues,
} from "../../src/content/pipeline/cli.ts";
import { batchForItem, parseItemId } from "../../src/content/pipeline/ids.ts";
import {
  formatJson,
  writeJsonFile,
  writeTextFile,
} from "../../src/content/pipeline/json.ts";
import {
  findRepoRoot,
  repoRelative,
  resolveLayout,
  type Layout,
} from "../../src/content/pipeline/layout.ts";
import { sameAgentRun } from "../../src/content/pipeline/register.ts";
import {
  AuditRecordSchema,
  AUDIT_FLOORS,
  AUDIT_ID_PATTERN,
  DEFECT_TYPES,
  SUBTLE_DEFECTS,
  auditCriteria,
  caughtNeeded,
  countsOf,
  planterId,
  type AuditRecord,
} from "../../src/content/schema/audit.ts";
import { BatchRegisterSchema } from "../../src/content/schema/batches.ts";
import {
  EncoreSchema,
  MysterySchema,
  PracticeItemSchema,
  RoomQuestionSchema,
  type AnyItem,
} from "../../src/content/schema/items.ts";
import { agentId, text } from "../../src/content/schema/primitives.ts";
import { createRng } from "../../src/engine/rng.ts";
import {
  isEnvelope,
  keySourceFromProcess,
  loadMasterKey,
  openEnvelope,
  type SealKeys,
} from "./crypto.ts";
import { printReport, runReported, type ReportFinding } from "./lib/report.ts";

const USAGE = `Usage: npm run content:audit -- <step> [options]

  Draw (the default):  --seed <n> --auditor <au-...> --auditor-model <model>
                       --planter <pl-...> --planter-model <model>
                       [--audit <id>] [--purpose prelaunch|monthly|rerun] [--date <yyyy-mm-dd>]
                       [--practice 400] [--daily 60] [--plants 25]
  pack      --audit <id>                      Mix the planted items in; write the auditor's packet
  verdicts  --audit <id> --file <verdicts.json>
  confirm   --audit <id> --item <item id> (--error --recheck <ref> [--defect <text>] | --cleared)
  check     [--audit <id>] [--launch] [--sealed] [--json]

  --dry-run        Keep the record in .cache/audits/<id>/record.json and write nothing under content/
  --root <dir>     Bank root (default content/); with --fixtures, a fixture tree
  --fixtures       Treat --root as a fixture tree`;

/** The audit's step-by-step files, all git-ignored. */
export function auditCacheDir(layout: Layout, auditId: string): string {
  return join(layout.cacheDir, "audits", auditId);
}

/** Where a record lives: the sealed workspace, or the cache for a dry run. */
export function recordPath(
  layout: Layout,
  auditId: string,
  dryRun: boolean,
): string {
  return dryRun
    ? join(auditCacheDir(layout, auditId), "record.json")
    : join(layout.workspaceDir, "audits", `${auditId}.json`);
}

/** The record of an audit in progress: the workspace's, else a dry run's. */
function locateRecord(
  layout: Layout,
  auditId: string,
  dryRun: boolean,
): { path: string; dryRun: boolean } {
  if (!dryRun) {
    const sealed = recordPath(layout, auditId, false);
    if (existsSync(sealed)) return { path: sealed, dryRun: false };
  }
  const cached = recordPath(layout, auditId, true);
  if (existsSync(cached)) return { path: cached, dryRun: true };
  throw new Error(
    `no record for ${auditId}: draw it first (npm run content:audit -- --seed <n> --audit ${auditId} ...)`,
  );
}

function readRecord(path: string): AuditRecord {
  const parsed = AuditRecordSchema.safeParse(
    JSON.parse(readFileSync(path, "utf8")),
  );
  if (!parsed.success)
    throw new Error(
      `the audit record is invalid at ${parsed.error.issues[0]?.path.join(".") ?? ""}: run npm run content:audit -- check`,
    );
  return parsed.data;
}

/** Throws unless `probe` is git-ignored (CONTENT_GUIDE §11.2). Fixture trees skip it. */
function assertIgnored(layout: Layout, probe: string): void {
  if (layout.kind === "fixtures") return;
  const result = spawnSync("git", ["check-ignore", "-q", probe], {
    cwd: layout.repoRoot,
  });
  if (result.status !== 0)
    throw new Error(
      `${repoRelative(layout, probe)} is not git-ignored; sealed plaintext must never be committed (CONTENT_GUIDE §11.2)`,
    );
}

/** A fresh opaque packet id, `pk-` and eight base-36 characters. */
export function randomPacketId(): string {
  let id = "";
  for (const byte of randomBytes(8)) id += (byte % 36).toString(36);
  return `pk-${id}`;
}

// ---------------------------------------------------------------------------
// 1. Draw
// ---------------------------------------------------------------------------

export interface DrawOptions {
  auditId: string;
  date: string;
  seed: number;
  purpose: AuditRecord["purpose"];
  auditor: AuditRecord["auditor"];
  planter: AuditRecord["planter"];
  practice: number;
  daily: number;
  plants: number;
  packetId?: () => string;
}

export interface Draw {
  record: AuditRecord;
  brief: Record<string, unknown>;
  /** Candidates left out because the auditor or planter worked on them. */
  excluded: { auditor: number; planter: number };
  /** Fewer candidates than asked for, by pool. */
  short: { practice: number; daily: number };
}

/** Every run that wrote, checked, estimated or decided an item. */
function workedOn(bank: Bank, record: BankItem): string[] {
  const item = record.item;
  const parsed = parseItemId(record.id);
  const batch =
    parsed && bank.register ? batchForItem(bank.register, parsed) : null;
  const v = item.verification;
  return [
    ...(batch?.writer ? [batch.writer] : []),
    ...(v
      ? [
          ...v.checks,
          ...(v.tiebreak ? [v.tiebreak] : []),
          ...(v.followUps ?? []),
          ...(v.dailyChecks ?? []),
          ...(v.rechecks ?? []),
        ].map((check) => check.checker)
      : []),
    ...(v?.editor ? [v.editor.editor] : []),
    ...(v?.estimates ?? []).map((estimate) => estimate.by),
  ];
}

function batchIdOf(bank: Bank, id: string): string | null {
  const parsed = parseItemId(id);
  if (!parsed || !bank.register) return null;
  return batchForItem(bank.register, parsed)?.batchId ?? null;
}

const isDaily = (record: BankItem) =>
  "kind" in record.item &&
  (record.item.kind === "mystery" || record.item.kind === "encore");

/** Draws the seeded sample and the record that starts the audit. */
export function drawAudit(bank: Bank, options: DrawOptions): Draw {
  const packetId = options.packetId ?? randomPacketId;
  // Batches the planter wrote or checked never feed the sample (§0.2).
  const planterBatches = new Set<string>();
  for (const record of bank.items) {
    if (
      workedOn(bank, record).some((id) => sameAgentRun(options.planter.id, id))
    ) {
      const batch = batchIdOf(bank, record.id);
      if (batch) planterBatches.add(batch);
    }
  }
  const excluded = { auditor: 0, planter: 0 };
  const pools: Record<"practice" | "daily", BankItem[]> = {
    practice: [],
    daily: [],
  };
  for (const record of [...bank.items].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (record.item.status !== "active") continue;
    const pool =
      record.pool === "practice"
        ? "practice"
        : isDaily(record)
          ? "daily"
          : null;
    if (pool === null) continue;
    if (
      workedOn(bank, record).some((id) => sameAgentRun(options.auditor.id, id))
    ) {
      excluded.auditor += 1;
      continue;
    }
    const batch = batchIdOf(bank, record.id);
    if (batch !== null && planterBatches.has(batch)) {
      excluded.planter += 1;
      continue;
    }
    pools[pool].push(record);
  }
  const rng = createRng(`content-audit|${options.seed}`);
  const sample: AuditRecord["sample"] = [];
  const short = { practice: 0, daily: 0 };
  for (const pool of ["practice", "daily"] as const) {
    const wanted = pool === "practice" ? options.practice : options.daily;
    const drawn = rng.fork(pool).shuffle(pools[pool]).slice(0, wanted);
    short[pool] = Math.max(0, wanted - drawn.length);
    for (const record of drawn.sort((a, b) => (a.id < b.id ? -1 : 1)))
      sample.push({
        packetId: packetId(),
        itemId: record.id,
        pool,
        verdict: "pending",
      });
  }
  const record: AuditRecord = {
    id: options.auditId,
    date: options.date,
    seed: options.seed,
    purpose: options.purpose,
    status: "drawn",
    auditor: options.auditor,
    planter: options.planter,
    sample,
    plants: [],
    counts: countsOf({ sample, plants: [], confirmedErrors: [] }),
    confirmedErrors: [],
  };
  const brief = {
    auditId: options.auditId,
    planter: options.planter.id,
    plants: options.plants,
    subtleAtLeast: Math.ceil(options.plants / 2),
    mix: {
      practice: sample.filter((entry) => entry.pool === "practice").length,
      daily: sample.filter((entry) => entry.pool === "daily").length,
    },
    subtleDefects: SUBTLE_DEFECTS,
    defects: DEFECT_TYPES,
    instructions: [
      `Write ${options.plants} planted bad items, at least ${Math.ceil(options.plants / 2)} of them subtle (CONTENT_GUIDE §9.10): a date a few years off, a number 10 to 20% off, a misattributed quotation, a folk etymology stated as fact, a fact that changed since 2019, a second answer that holds in one region. The rest may be blatant: a wrong key, an ambiguous stem, a right distractor, an invented source.`,
      "Mix the formats the way the sample does: mostly practice items, some mysteries and encores. Each plant must look like a real submission: the item's source format (CONTENT_GUIDE §2), its claims included, any id of its pool's pattern.",
      `Save each as .cache/audits/${options.auditId}/planted/<NN>.json: { "defect": "<one of defects>", "subtle": true|false, "item": { ... } }. Never write a planted item anywhere under content/, and never write or check real items in the batches this audit samples.`,
      `Then run: npm run content:audit -- pack --audit ${options.auditId}`,
    ],
  };
  return { record, brief, excluded, short };
}

// ---------------------------------------------------------------------------
// 2 and 3. Plant and pack
// ---------------------------------------------------------------------------

export const PlantFileSchema = z.strictObject({
  defect: z.enum(DEFECT_TYPES),
  subtle: z.boolean(),
  item: z.record(z.string(), z.unknown()),
  note: text.optional(),
});
export type PlantFile = z.infer<typeof PlantFileSchema>;

function schemaFor(item: Record<string, unknown>) {
  if (item.kind === "mystery") return MysterySchema;
  if (item.kind === "encore") return EncoreSchema;
  if (item.kind === "choice") return RoomQuestionSchema;
  return PracticeItemSchema;
}

/** Problems with one plant, by its file. Empty when the plant is usable. */
export function plantProblems(plant: unknown): string[] {
  const parsed = PlantFileSchema.safeParse(plant);
  if (!parsed.success)
    return parsed.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
  const problems: string[] = [];
  const { defect, subtle } = parsed.data;
  if (
    defect !== "other" &&
    subtle !== (SUBTLE_DEFECTS as readonly string[]).includes(defect)
  )
    problems.push(
      `subtle: a ${defect} plant is ${subtle ? "blatant" : "subtle"} (§9.10)`,
    );
  // A plant looks like a draft submission: the source format, claims and all.
  const item = { ...parsed.data.item, status: "draft" };
  const result = schemaFor(item).safeParse(item);
  if (!result.success)
    for (const issue of result.error.issues)
      problems.push(`item.${issue.path.join(".")}: ${issue.message}`);
  return problems;
}

/** What the auditor sees of one item: never its id, status, notes, checks, estimate or difficulty. */
export function auditView(bank: Bank, item: AnyItem): Record<string, unknown> {
  const {
    id: _id,
    status: _status,
    writerNotes: _notes,
    selfCheck: _self,
    verification: _verification,
    predicted: _predicted,
    lintAllow: _allow,
    seededDifficulty: _seed,
    tags: _tags,
    reviewBy: _review,
    ...rest
  } = item as AnyItem & Record<string, unknown>;
  const view: Record<string, unknown> = { ...rest };
  // The writer's own uniqueness work and the editor's sources line: the
  // auditor runs the rival search afresh, as a checker would (§9.4).
  for (const key of [
    "sourceLabels",
    "seedSolveShares",
    "rivals",
    "likelyGuesses",
    "giveawayTerms",
  ])
    delete view[key];
  if ("kind" in item && item.kind === "mystery") {
    const list = bank.lists.get(item.answerType);
    const display = (id: string) => list?.entities.get(id)?.display ?? id;
    view.answerDisplay = display(item.answer);
    view.distractorDisplays = item.distractors.map(display);
    view.acceptedDisplays = item.accepted.map(display);
  }
  return view;
}

export interface Packed {
  record: AuditRecord;
  packet: Record<string, unknown>;
}

/** Mixes the plants into the sample under fresh opaque ids, shuffled. */
export function packAudit(
  bank: Bank,
  record: AuditRecord,
  plants: PlantFile[],
  options: { now: string; packetId?: () => string },
): Packed {
  if (record.status !== "drawn")
    throw new Error(
      `${record.id} is ${record.status}; only a drawn audit is packed`,
    );
  const packetId = options.packetId ?? randomPacketId;
  const used = new Set(record.sample.map((entry) => entry.packetId));
  const fresh = () => {
    let id = packetId();
    while (used.has(id)) id = packetId();
    used.add(id);
    return id;
  };
  const items: Record<string, unknown>[] = [];
  for (const entry of record.sample) {
    const real = bank.itemsById.get(entry.itemId);
    if (!real)
      throw new Error(
        `a sampled item is no longer in the bank (${entry.packetId}); draw a new audit`,
      );
    items.push({ packetId: entry.packetId, ...auditView(bank, real.item) });
  }
  const planted: AuditRecord["plants"] = plants.map((plant) => {
    const id = fresh();
    items.push({
      packetId: id,
      ...auditView(bank, {
        ...plant.item,
        status: "draft",
      } as unknown as AnyItem),
    });
    return {
      packetId: id,
      defect: plant.defect,
      subtle: plant.subtle,
      caught: null,
    };
  });
  const order = createRng(`content-audit|${record.seed}|pack`).shuffle(items);
  const next: AuditRecord = {
    ...record,
    status: "packed",
    plants: planted,
    counts: countsOf({ ...record, plants: planted }),
  };
  return {
    record: next,
    packet: {
      auditId: record.id,
      auditor: record.auditor.id,
      generatedAt: options.now,
      instructions: [
        "Re-check every item as a fact-checker would (CONTENT_GUIDE §9.4): verify each claim, gather web evidence for every high-risk one (decisions memo §18), and look for a second defensible answer, an outdated fact, a regional misreading or a giveaway.",
        "Some items are planted with a defect; nothing here says which. Judge each item on its own.",
        `Record one verdict per packet id: [{ "packetId", "verdict": "pass" | "fail", "defect": "what is wrong", "note": "..." }], then run npm run content:audit -- verdicts --audit ${record.id} --file <verdicts.json>.`,
      ],
      items: order,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Verdicts
// ---------------------------------------------------------------------------

export const VerdictFileSchema = z
  .array(
    z.strictObject({
      packetId: z.string(),
      verdict: z.enum(["pass", "fail"]),
      defect: text.optional(),
      note: text.optional(),
    }),
  )
  .min(1);
export type Verdicts = z.infer<typeof VerdictFileSchema>;

/** Applies the auditor's verdicts: all packets, each once, or nothing. */
export function applyVerdicts(
  record: AuditRecord,
  verdicts: Verdicts,
): { record?: AuditRecord; errors: string[] } {
  const errors: string[] = [];
  if (record.status !== "packed")
    errors.push(`${record.id} is ${record.status}; verdicts follow pack`);
  const known = new Set([
    ...record.sample.map((entry) => entry.packetId),
    ...record.plants.map((plant) => plant.packetId),
  ]);
  const byId = new Map<string, Verdicts[number]>();
  for (const verdict of verdicts) {
    if (!known.has(verdict.packetId))
      errors.push(`${verdict.packetId} is not a packet of ${record.id}`);
    else if (byId.has(verdict.packetId))
      errors.push(`${verdict.packetId} has two verdicts`);
    else if (verdict.verdict === "fail" && verdict.defect === undefined)
      errors.push(`${verdict.packetId}: a fail names its defect`);
    byId.set(verdict.packetId, verdict);
  }
  const missing = [...known].filter((id) => !byId.has(id));
  if (missing.length > 0)
    errors.push(`${missing.length} packet(s) have no verdict`);
  if (errors.length > 0) return { errors };
  const sample = record.sample.map((entry): AuditRecord["sample"][number] => {
    const verdict = byId.get(entry.packetId);
    const next = { ...entry, verdict: verdict?.verdict ?? entry.verdict };
    if (verdict?.verdict === "fail" && verdict.defect)
      return { ...next, defect: verdict.defect };
    return next;
  });
  const plants = record.plants.map((plant) => ({
    ...plant,
    caught: byId.get(plant.packetId)?.verdict === "fail",
  }));
  const next: AuditRecord = {
    ...record,
    sample,
    plants,
    status: sample.some((entry) => entry.verdict === "fail")
      ? "audited"
      : "closed",
  };
  next.counts = countsOf(next);
  return { record: next, errors };
}

// ---------------------------------------------------------------------------
// 5. Confirm
// ---------------------------------------------------------------------------

/** Settles one flagged item's re-check: a confirmed error, or cleared. */
export function settleFlagged(
  bank: Bank | null,
  record: AuditRecord,
  itemId: string,
  outcome: { error: boolean; rechecks: string[]; defect?: string },
): { record?: AuditRecord; errors: string[] } {
  const index = record.sample.findIndex((entry) => entry.itemId === itemId);
  const entry = record.sample[index];
  if (!entry)
    return { errors: [`${itemId} is not in the sample of ${record.id}`] };
  if (entry.verdict !== "fail")
    return {
      errors: [`${itemId} passed the audit; only a failed item is re-checked`],
    };
  if (entry.resolution !== undefined)
    return { errors: [`${itemId} is already ${entry.resolution}`] };
  if (outcome.error && outcome.rechecks.length === 0)
    return {
      errors: [
        "a confirmed error links to its re-checks (--recheck <ref>), §9.10",
      ],
    };
  const sample = [...record.sample];
  sample[index] = {
    ...entry,
    resolution: outcome.error ? "confirmed" : "cleared",
  };
  const confirmedErrors = [...record.confirmedErrors];
  if (outcome.error) {
    const batchId = bank ? batchIdOf(bank, itemId) : null;
    confirmedErrors.push({
      itemId,
      defect: outcome.defect ?? entry.defect ?? "confirmed on re-check",
      rechecks: outcome.rechecks,
      ...(batchId ? { batchId } : {}),
    });
  }
  const next: AuditRecord = { ...record, sample, confirmedErrors };
  if (!sample.some((s) => s.verdict === "fail" && s.resolution === undefined))
    next.status = "closed";
  next.counts = countsOf(next);
  return { record: next, errors: [] };
}

// ---------------------------------------------------------------------------
// 6. Check
// ---------------------------------------------------------------------------

export interface AuditSource {
  /** Repository-relative path for messages. */
  rel: string;
  /** The parsed JSON, or null when the file could not be read or decrypted. */
  data: unknown;
}

/**
 * Schema findings (C01) for every audit record, and AC-CNT-05 (X32) for the
 * latest pre-launch one: warnings, or errors with `launch`. With `launch`,
 * a missing pre-launch record is an error too.
 */
export function auditFindings(
  sources: AuditSource[],
  options: { launch: boolean },
): ReportFinding[] {
  const findings: ReportFinding[] = [];
  const valid: { rel: string; record: AuditRecord }[] = [];
  for (const source of sources) {
    if (source.data === null) {
      findings.push({
        rule: "C01",
        severity: "error",
        file: source.rel,
        message: "the audit record could not be read or decrypted",
        sealed: true,
      });
      continue;
    }
    const parsed = AuditRecordSchema.safeParse(source.data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        findings.push({
          rule: "C01",
          severity: "error",
          file: source.rel,
          path: issue.path.map(String).join("."),
          message: issue.message,
          sealed: true,
        });
      continue;
    }
    const stem = source.rel
      .replace(/^.*\//, "")
      .replace(/\.json(?:\.enc)?$/, "");
    if (stem !== "record" && stem !== parsed.data.id)
      findings.push({
        rule: "C01",
        severity: "error",
        file: source.rel,
        path: "id",
        message: "the id does not match the file name",
        sealed: true,
      });
    valid.push({ rel: source.rel, record: parsed.data });
  }
  const prelaunch = valid
    .filter((entry) => entry.record.purpose === "prelaunch")
    .sort(
      (a, b) =>
        a.record.date.localeCompare(b.record.date) ||
        a.record.id.localeCompare(b.record.id),
    )
    .at(-1);
  if (!prelaunch) {
    if (options.launch)
      findings.push({
        rule: "X32",
        severity: "error",
        file: "content/sealed/audits",
        message:
          "no pre-launch seeded audit record: AC-CNT-05 needs one (CONTENT_GUIDE §9.10)",
        sealed: true,
      });
    return findings;
  }
  for (const miss of auditCriteria(prelaunch.record))
    findings.push({
      rule: "X32",
      severity: options.launch ? "error" : "warn",
      file: prelaunch.rel,
      itemId: prelaunch.record.id,
      message: `AC-CNT-05: ${miss} (CONTENT_GUIDE §9.10)`,
      sealed: true,
    });
  return findings;
}

/** The audit records of a tree: the workspace's, or the envelopes' with keys. */
export function auditSources(
  layout: Layout,
  options: { sealed: boolean; keys: SealKeys | null },
): AuditSource[] {
  const out: AuditSource[] = [];
  const names = (dir: string, suffix: string) =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => name.endsWith(suffix))
          .sort()
      : [];
  if (options.sealed) {
    if (layout.envelopeDir === null || options.keys === null) return out;
    const dir = join(layout.envelopeDir, "audits");
    for (const name of names(dir, ".json.enc")) {
      const abs = join(dir, name);
      let data: unknown = null;
      try {
        const envelope: unknown = JSON.parse(readFileSync(abs, "utf8"));
        if (isEnvelope(envelope))
          data = JSON.parse(
            openEnvelope(options.keys, envelope).toString("utf8"),
          );
      } catch {
        data = null;
      }
      out.push({ rel: repoRelative(layout, abs), data });
    }
    return out;
  }
  const dir = join(layout.workspaceDir, "audits");
  for (const name of names(dir, ".json")) {
    const abs = join(dir, name);
    let data: unknown = null;
    try {
      data = JSON.parse(readFileSync(abs, "utf8"));
    } catch {
      data = null;
    }
    out.push({ rel: repoRelative(layout, abs), data });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

const DrawArgsSchema = z.strictObject({
  auditor: agentId("au"),
  auditorModel: text,
  planter: planterId,
  planterModel: text,
});

function intArg(values: CliValues, key: string, fallback: number): number {
  const raw = str(values, key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0)
    throw new Error(`--${key} takes a whole number`);
  return n;
}

async function writeRecord(
  layout: Layout,
  record: AuditRecord,
  dryRun: boolean,
): Promise<string> {
  const path = recordPath(layout, record.id, dryRun);
  if (!dryRun) assertIgnored(layout, join(layout.workspaceDir, "probe.json"));
  await writeJsonFile(path, AuditRecordSchema.parse(record));
  return path;
}

/** An `audit_failure` incident on the batch of a confirmed error (§9.10, §11.3). */
async function recordIncident(
  layout: Layout,
  batchId: string,
  auditId: string,
  date: string,
): Promise<void> {
  if (!existsSync(layout.registerFile)) return;
  const register = BatchRegisterSchema.parse(
    JSON.parse(readFileSync(layout.registerFile, "utf8")),
  );
  const batch = register.batches.find((entry) => entry.batchId === batchId);
  if (!batch) return;
  const note = `${auditId} confirmed an error in this batch: the whole batch goes back for a full re-check, and a fresh audit runs on a new sample (§9.10)`;
  if (batch.incidents.some((incident) => incident.note === note)) return;
  batch.incidents.push({ date, kind: "audit_failure", note });
  await writeJsonFile(layout.registerFile, BatchRegisterSchema.parse(register));
}

export async function main(argv: string[]): Promise<number> {
  // `--seed <n>` alone is the draw, as ARCHITECTURE §5.8 writes the command.
  const named = argv[0] !== undefined && !argv[0].startsWith("-");
  const step = named ? (argv[0] as string) : "draw";
  const rest = named ? argv.slice(1) : argv;
  const values = parseCli(
    "content:audit",
    rest,
    {
      seed: { type: "string" },
      audit: { type: "string" },
      auditor: { type: "string" },
      "auditor-model": { type: "string" },
      planter: { type: "string" },
      "planter-model": { type: "string" },
      purpose: { type: "string" },
      date: { type: "string" },
      practice: { type: "string" },
      daily: { type: "string" },
      plants: { type: "string" },
      file: { type: "string" },
      item: { type: "string" },
      error: { type: "boolean" },
      cleared: { type: "boolean" },
      recheck: { type: "string", multiple: true },
      defect: { type: "string" },
      launch: { type: "boolean" },
      sealed: { type: "boolean" },
      json: { type: "boolean" },
      "dry-run": { type: "boolean" },
      root: { type: "string" },
      fixtures: { type: "boolean" },
    },
    USAGE,
  );
  const layout = resolveLayout({
    repoRoot: findRepoRoot(),
    root: str(values, "root") ?? "content",
    fixtures: values.fixtures === true,
  });
  const dryRun = values["dry-run"] === true;
  const today = str(values, "date") ?? todayUtc();

  if (step === "check") {
    const sealed = values.sealed === true;
    const keys = sealed
      ? ((await loadMasterKey(keySourceFromProcess()))?.keys ?? null)
      : null;
    const notes: string[] = [];
    let sources = auditSources(layout, { sealed, keys });
    if (sealed && keys === null)
      notes.push(
        "Sealed audit records: not checked (QZ_CONTENT_KEY is not set)",
      );
    const only = str(values, "audit");
    if (only !== undefined) {
      if (!sealed) {
        const cached = recordPath(layout, only, true);
        if (
          existsSync(cached) &&
          !sources.some((s) => s.rel.endsWith(`/${only}.json`))
        )
          sources.push({
            rel: repoRelative(layout, cached),
            data: JSON.parse(readFileSync(cached, "utf8")) as unknown,
          });
      }
      sources = sources.filter(
        (source) =>
          source.rel.endsWith(`/${only}.json`) ||
          source.rel.endsWith(`/${only}.json.enc`) ||
          source.rel.endsWith(`/${only}/record.json`),
      );
    }
    notes.push(`${sources.length} audit record(s) checked.`);
    return printReport(
      {
        command: "content:audit",
        items: sources.length,
        findings: auditFindings(sources, { launch: values.launch === true }),
        notes,
      },
      { redact: sealed, reveal: false, json: values.json === true },
    );
  }

  const bank = await loadBank(layout);
  if (step === "draw") {
    const seed = intArg(values, "seed", -1);
    if (seed < 0) throw new Error(`--seed is required\n\n${USAGE}`);
    const args = DrawArgsSchema.safeParse({
      auditor: str(values, "auditor"),
      auditorModel: str(values, "auditor-model"),
      planter: str(values, "planter"),
      planterModel: str(values, "planter-model"),
    });
    if (!args.success)
      throw new Error(
        `${args.error.issues.map((i) => `--${String(i.path[0])}: ${i.message}`).join("; ")}\n\n${USAGE}`,
      );
    const auditId = str(values, "audit") ?? `audit-${today}`;
    if (
      !AUDIT_ID_PATTERN.test(auditId) ||
      !auditId.startsWith(`audit-${today}`)
    )
      throw new Error(`--audit is audit-${today} or audit-${today}-<suffix>`);
    const purpose = str(values, "purpose") ?? "prelaunch";
    if (purpose !== "prelaunch" && purpose !== "monthly" && purpose !== "rerun")
      throw new Error("--purpose is prelaunch, monthly or rerun");
    if (
      existsSync(recordPath(layout, auditId, false)) ||
      existsSync(recordPath(layout, auditId, true))
    )
      throw new Error(`${auditId} exists; audit ids are never reused`);
    const plants = intArg(values, "plants", AUDIT_FLOORS.planted);
    const draw = drawAudit(bank, {
      auditId,
      date: today,
      seed,
      purpose,
      auditor: { id: args.data.auditor, model: args.data.auditorModel },
      planter: { id: args.data.planter, model: args.data.planterModel },
      practice: intArg(values, "practice", AUDIT_FLOORS.practice),
      daily: intArg(values, "daily", AUDIT_FLOORS.daily),
      plants,
    });
    const cache = auditCacheDir(layout, auditId);
    assertIgnored(layout, join(cache, "probe.json"));
    mkdirSync(join(cache, "planted"), { recursive: true });
    const path = await writeRecord(layout, draw.record, dryRun);
    await writeTextFile(
      join(cache, "planter.json"),
      await formatJson(draw.brief),
    );
    const c = draw.record.counts;
    console.log(
      `content:audit: drew ${c.practice} practice and ${c.daily} Daily item(s) for ${auditId} (seed ${seed}); left out ${draw.excluded.auditor} the auditor worked on and ${draw.excluded.planter} from the planter's batches.`,
    );
    if (draw.short.practice + draw.short.daily > 0)
      console.log(
        `content:audit: the bank held ${draw.short.practice} practice and ${draw.short.daily} Daily item(s) fewer than asked for; AC-CNT-05 needs ${AUDIT_FLOORS.practice} and ${AUDIT_FLOORS.daily}.`,
      );
    console.log(
      `Record: ${repoRelative(layout, path)}${dryRun ? " (dry run)" : ""}`,
    );
    console.log(
      `Planter's brief: ${repoRelative(layout, join(cache, "planter.json"))}; plants go in ${repoRelative(layout, join(cache, "planted"))}/.`,
    );
    return 0;
  }

  const auditId = str(values, "audit");
  if (auditId === undefined) throw new Error(`--audit is required\n\n${USAGE}`);
  const located = locateRecord(layout, auditId, dryRun);
  const record = readRecord(located.path);
  const cache = auditCacheDir(layout, auditId);

  if (step === "pack") {
    const dir = join(cache, "planted");
    const files = existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => name.endsWith(".json"))
          .sort()
      : [];
    const plants: PlantFile[] = [];
    const problems: string[] = [];
    for (const name of files) {
      let data: unknown;
      try {
        data = JSON.parse(readFileSync(join(dir, name), "utf8"));
      } catch {
        problems.push(`${name}: not valid JSON`);
        continue;
      }
      const found = plantProblems(data);
      if (found.length > 0) problems.push(...found.map((p) => `${name}: ${p}`));
      else plants.push(PlantFileSchema.parse(data));
    }
    if (problems.length > 0) {
      for (const problem of problems) console.log(`refused plant ${problem}`);
      console.log("content:audit: nothing was packed; fix the plants above.");
      return 1;
    }
    if (plants.length === 0)
      throw new Error(
        `no planted items in ${repoRelative(layout, dir)}/; the planter writes them first`,
      );
    const packed = packAudit(bank, record, plants, {
      now: new Date().toISOString(),
    });
    assertIgnored(layout, join(cache, "probe.json"));
    await writeTextFile(
      join(cache, "packet.json"),
      await formatJson(packed.packet),
    );
    await writeRecord(layout, packed.record, located.dryRun);
    const c = packed.record.counts;
    console.log(
      `content:audit: packed ${c.practice + c.daily} real and ${c.planted} planted item(s) (${c.subtle} subtle) into ${repoRelative(layout, join(cache, "packet.json"))}.`,
    );
    if (c.planted < AUDIT_FLOORS.planted || c.subtle * 2 < c.planted)
      console.log(
        `content:audit: AC-CNT-05 needs ${AUDIT_FLOORS.planted} plants or more, at least half subtle.`,
      );
    return 0;
  }

  if (step === "verdicts") {
    const file = str(values, "file");
    if (file === undefined) throw new Error(`--file is required\n\n${USAGE}`);
    const parsed = VerdictFileSchema.safeParse(
      JSON.parse(readFileSync(file, "utf8")),
    );
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        console.log(
          `rejected verdicts ${issue.path.join(".")}: ${issue.message}`,
        );
      return 1;
    }
    const applied = applyVerdicts(record, parsed.data);
    if (!applied.record) {
      for (const error of applied.errors) console.log(`rejected: ${error}`);
      console.log("content:audit: nothing was recorded.");
      return 1;
    }
    await writeRecord(layout, applied.record, located.dryRun);
    const c = applied.record.counts;
    console.log(
      `content:audit: ${c.caught} of ${c.planted} planted item(s) caught (${caughtNeeded(c.planted)} needed); ${c.flagged} real item(s) failed and go to a fresh re-check (content:audit -- confirm).`,
    );
    return 0;
  }

  if (step === "confirm") {
    const itemId = str(values, "item");
    if (itemId === undefined || values.error === values.cleared)
      throw new Error(
        `--item and one of --error or --cleared are required\n\n${USAGE}`,
      );
    // parseArgs gives a list for an option marked multiple.
    const rechecks = (values.recheck as unknown as string[] | undefined) ?? [];
    const defect = str(values, "defect");
    const settled = settleFlagged(bank, record, itemId, {
      error: values.error === true,
      rechecks,
      ...(defect ? { defect } : {}),
    });
    if (!settled.record) {
      for (const error of settled.errors) console.log(`rejected: ${error}`);
      return 1;
    }
    await writeRecord(layout, settled.record, located.dryRun);
    const confirmed = settled.record.confirmedErrors.find(
      (e) => e.itemId === itemId,
    );
    if (confirmed?.batchId && !located.dryRun)
      await recordIncident(layout, confirmed.batchId, record.id, today);
    console.log(
      values.error === true
        ? `content:audit: a confirmed error${confirmed?.batchId ? ` in ${confirmed.batchId}, which goes back for a full re-check` : ""}; ${record.id} cannot pass AC-CNT-05, so a fresh audit runs on a new sample once the batch is repaired (§9.10).`
        : "content:audit: cleared on re-check.",
    );
    if (settled.record.status === "closed")
      console.log(`content:audit: ${record.id} is closed.`);
    return 0;
  }

  throw new Error(`unknown step ${step}\n\n${USAGE}`);
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) {
  const sealedCheck = process.argv.includes("--sealed");
  runReported(
    "content:audit",
    () => sealedCheck,
    () => main(process.argv.slice(2)),
  );
}
