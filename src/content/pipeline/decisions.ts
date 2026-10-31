/**
 * Editor decisions (CONTENT_GUIDE §9.7, §9.9): accept, rewrite or cut. Only
 * items that pass the acceptance rule become active.
 *
 * - accept: may edit only sourceLabels, tags, lintAllow and reviewBy, which
 *   no checker packet shows. The item must still be the one the checkers
 *   judged: every check's packetSha256 is recomputed and must match. Then
 *   the lint runs (a warning passes only with an editor's lintAllow,
 *   ARCHITECTURE §5.2), dedupe and the myths screen run, the §9.9 rule is
 *   applied, and the item becomes active with its full verification record.
 * - rewrite: applies the edits. Changing anything a packet shows
 *   (KEY_FIELDS), or `recheck: true`, clears the checks and the estimate and
 *   sends the item back to draft for two fresh checks and a fresh estimate
 *   (§9.7). With `wordingOnly: true`, rewording stem, question, explanation,
 *   learnMore, measure, valueDisplay, unitShort or unitLabel keeps the
 *   checks: their packetSha256 values are re-stamped to the new packet, and
 *   the old values and the editor go into the editor's reason. Edits no
 *   packet shows (tags, notes, rivals and so on) keep the checks as they
 *   are. Two failed checks are never rewritten: cut, and draft the
 *   replacement under a new id (§9.7).
 * - cut: status cut. The id is never reused.
 *
 * Messages follow the output rule of ARCHITECTURE §5.4: a near-duplicate
 * that crosses the seal is described without the other side's id, score or
 * reason (`content:dedupe -- --item <id> --reveal` shows it locally).
 */
import { existsSync, readFileSync } from "node:fs";

import type { ZodType } from "zod";

import type { BatchEntry } from "../schema/batches.ts";
import type { DecisionInputEntry } from "../schema/inputs.ts";
import {
  EncoreSchema,
  MysterySchema,
  PracticeItemSchema,
  RoomQuestionSchema,
  type AnyItem,
  type Mystery,
} from "../schema/items.ts";
import type { Verification } from "../schema/verification.ts";
import {
  acceptanceFailures,
  checksOf,
  estimatorsOf,
  mythCleared,
} from "./acceptance.ts";
import { formatPath, type Bank, type BankItem } from "./bank.ts";
import {
  DEDUPE_FLAG,
  buildDedupeIndex,
  dedupeEntry,
  dedupeRecordFor,
  entityNamer,
  guideExamples,
  nearestTo,
  type DedupeEntry,
  type DedupeMatch,
} from "./dedupe.ts";
import type { Pool } from "./ids.ts";
import { cloneJson, stableStringify } from "./json.ts";
import { LINT_VERSION, applyLintAllow, rawItemHits } from "./lint/index.ts";
import { scheduledDates } from "./lint/pool-rules.ts";
import { mysteryKeys } from "./mystery-keys.ts";
import { PACKET_FIELDS, changedSinceChecks, packetSha256 } from "./packets.ts";
import { mythMatches } from "./references.ts";
import { anyAgentRun, batchItems, sameAgentRun } from "./register.ts";
import { saveItems, type SaveOptions } from "./store.ts";

/**
 * Fields whose change alters what a checker saw, so the checks no longer
 * apply (§9.7): everything a packet shows, plus tfKind.
 */
export const KEY_FIELDS: ReadonlySet<string> = new Set([
  ...Object.values(PACKET_FIELDS).flat(),
  "tfKind",
]);

/** Fields a `wordingOnly` rewrite may reword while keeping the checks. */
export const WORDING_FIELDS: ReadonlySet<string> = new Set([
  "stem",
  "question",
  "explanation",
  "learnMore",
  "measure",
  "valueDisplay",
  "unitShort",
  "unitLabel",
]);

/** The only fields an accept decision may edit; no packet shows them. */
export const ACCEPT_EDITS: ReadonlySet<string> = new Set([
  "sourceLabels",
  "tags",
  "lintAllow",
  "reviewBy",
]);

/** Fields a decision may never set. */
const FORBIDDEN_EDITS = new Set([
  "id",
  "status",
  "kind",
  "format",
  "verification",
  "predicted",
]);

/** Marks a wording-only rewrite in the editor's reason. */
const TRAIL = "[wording-only rewrite by ";

const SCHEMAS: Record<Pool, ZodType<AnyItem>> = {
  practice: PracticeItemSchema as ZodType<AnyItem>,
  mystery: MysterySchema as ZodType<AnyItem>,
  encore: EncoreSchema as ZodType<AnyItem>,
  room: RoomQuestionSchema as ZodType<AnyItem>,
};

export function schemaProblems(pool: Pool, item: unknown): string[] {
  const result = SCHEMAS[pool].safeParse(item);
  return result.success
    ? []
    : result.error.issues.map(
        (issue) => `${formatPath(issue.path) || "(item)"}: ${issue.message}`,
      );
}

export interface DecisionOutcome {
  itemId: string;
  decision: DecisionInputEntry["decision"];
  ok: boolean;
  status?: AnyItem["status"];
  checksCleared?: boolean;
  errors: string[];
  warnings: string[];
}

export interface DecideOptions extends SaveOptions {
  /** ISO timestamp used when a decision has no decidedAt. */
  now: string;
  includeGuide?: boolean;
}

type EditorRecord = NonNullable<Verification["editor"]>;

function isoSeconds(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, "Z");
}

const guideCache = new WeakMap<Bank, DedupeEntry[]>();

/** The guide's worked examples as dedupe entries, read once per bank. */
function guideEntries(bank: Bank): DedupeEntry[] {
  const cached = guideCache.get(bank);
  if (cached) return cached;
  const entries: DedupeEntry[] = [];
  if (existsSync(bank.layout.guideFile)) {
    const namer = entityNamer(bank.lists.values());
    for (const raw of guideExamples(
      readFileSync(bank.layout.guideFile, "utf8"),
    )) {
      const entry = dedupeEntry(raw, bank.references.stopwords, "guide", namer);
      if (entry) entries.push({ ...entry, id: `guide:${entry.id}` });
    }
  }
  guideCache.set(bank, entries);
  return entries;
}

/** The nearest bank item or guide example to `item`, which stands for `record`. */
export function nearestForItem(
  bank: Bank,
  record: BankItem,
  item: AnyItem = record.item,
  includeGuide = true,
): DedupeMatch {
  const stopwords = bank.references.stopwords;
  const namer = entityNamer(bank.lists.values());
  const entries: DedupeEntry[] = [];
  for (const other of bank.items) {
    if (
      other.id === record.id ||
      other.item.status === "cut" ||
      other.item.status === "retired"
    )
      continue;
    const entry = dedupeEntry(
      other.item as unknown as Record<string, unknown>,
      stopwords,
      "bank",
      namer,
      other.file.sealed,
    );
    if (entry) entries.push(entry);
  }
  if (includeGuide) entries.push(...guideEntries(bank));
  const self = dedupeEntry(
    item as unknown as Record<string, unknown>,
    stopwords,
    "bank",
    namer,
    record.file.sealed,
  );
  if (!self)
    return {
      nearestId: null,
      score: 0,
      reason: "no text",
      nearestSealed: false,
    };
  entries.push(self);
  return nearestTo(buildDedupeIndex(entries), entries.length - 1);
}

/** The refusal for an unanswered near-duplicate flag, safe to print. */
function dedupeRefusal(record: BankItem, match: DedupeMatch): string {
  const ask =
    'set "dedupe": "related_ok" if they state different facts, or cut';
  const reveal = `npm run content:dedupe -- --item ${record.id} --reveal shows which, in your own terminal`;
  if (record.file.sealed !== match.nearestSealed) {
    return record.file.sealed
      ? `near-duplicate of a public item (a practice item or a guide example): ${ask}; ${reveal}`
      : `near-duplicate of a sealed item: ${ask}; ${reveal}`;
  }
  const other = String(match.nearestId).replace(
    /^guide:/,
    "the guide's example ",
  );
  return `near-duplicate of ${other} (${match.score.toFixed(2)}, ${match.reason}): ${ask}`;
}

/**
 * The reason to record. A wording-only rewrite's trail (old packet hashes,
 * editor) is carried into every later editor record, because each decision
 * replaces verification.editor.
 */
function withTrail(reason: string, previous: EditorRecord | undefined): string {
  if (!previous || !previous.reason.includes(TRAIL)) return reason;
  return `${reason} (earlier, ${previous.decision} by ${previous.editor}: ${previous.reason})`;
}

/** Applies a decision to an in-memory copy. Throws nothing; reports errors. */
export function decideOne(
  bank: Bank,
  batch: BatchEntry,
  record: BankItem,
  decision: DecisionInputEntry,
  options: DecideOptions,
): { outcome: DecisionOutcome; item?: AnyItem } {
  const outcome: DecisionOutcome = {
    itemId: record.id,
    decision: decision.decision,
    ok: false,
    errors: [],
    warnings: [],
  };
  const errors = outcome.errors;
  const current = record.item;
  const decidedAt = isoSeconds(decision.decidedAt ?? options.now);

  // The editor never decides on an item they wrote, checked or estimated
  // (§0.2): one run holds one role.
  if (sameAgentRun(decision.editor, batch.writer))
    errors.push(`editor ${decision.editor} wrote this batch`);
  const { a, b, t } = checksOf(current);
  for (const check of [a, b, t]) {
    if (check && sameAgentRun(decision.editor, check.checker))
      errors.push(
        `editor ${decision.editor} checked this item (pass ${check.pass})`,
      );
  }
  if (anyAgentRun(decision.editor, estimatorsOf(current)))
    errors.push(
      `editor ${decision.editor} estimated this item; one run holds one role (§0.2)`,
    );
  if (current.status !== "draft" && current.status !== "checking") {
    errors.push(
      `the item is ${current.status}; decisions apply to draft or checking items`,
    );
  }

  // Edits.
  const edits = decision.edits ?? {};
  const changed: string[] = [];
  const next = cloneJson(current) as AnyItem & Record<string, unknown>;
  for (const [field, value] of Object.entries(edits)) {
    if (FORBIDDEN_EDITS.has(field)) {
      errors.push(`edits may not set ${field}`);
      continue;
    }
    if (
      stableStringify((next as Record<string, unknown>)[field]) !==
      stableStringify(value)
    ) {
      changed.push(field);
      (next as Record<string, unknown>)[field] = value;
    }
  }
  const changedKeys = changed.filter((field) => KEY_FIELDS.has(field));
  if (
    decision.decision !== "rewrite" &&
    (decision.wordingOnly || decision.recheck)
  )
    errors.push("wordingOnly and recheck apply to rewrite decisions only");
  if (decision.decision === "accept") {
    const refused = changed.filter((field) => !ACCEPT_EDITS.has(field));
    if (refused.length > 0) {
      errors.push(
        `accept may edit only sourceLabels, tags, lintAllow and reviewBy; ${refused.join(", ")} need a rewrite, which sends the item for two fresh checks unless it is wordingOnly (§9.7)`,
      );
    }
  }
  if (decision.decision === "rewrite") {
    if (a?.verdict === "fail" && b?.verdict === "fail") {
      errors.push(
        "both checks failed: cut it and draft the replacement under a new id (§9.7)",
      );
    }
    if (decision.wordingOnly && decision.recheck)
      errors.push("a rewrite is wordingOnly or recheck, not both");
    if (decision.wordingOnly) {
      const tf = !("kind" in current) && current.format === "tf";
      const claimBearing = changedKeys.filter(
        (field) => !WORDING_FIELDS.has(field) || (tf && field === "stem"),
      );
      if (claimBearing.length > 0) {
        errors.push(
          `wordingOnly covers stem, question, explanation, learnMore, measure, valueDisplay, unitShort and unitLabel (never a true/false statement, which is its key claim); ${claimBearing.join(", ")} change a claim, so drop wordingOnly and let the rewrite send the item for two fresh checks (§9.7)`,
        );
      }
    }
  }
  if (errors.length > 0) return { outcome };

  const verification: Verification = cloneJson(
    next.verification ?? { checks: [] },
  );
  verification.editor = {
    editor: decision.editor,
    decision: decision.decision,
    reason: withTrail(decision.reason, current.verification?.editor),
    decidedAt,
  };

  if (decision.decision === "cut") {
    next.verification = verification;
    next.status = "cut";
  } else if (decision.decision === "rewrite") {
    const fresh =
      decision.recheck === true ||
      (changedKeys.length > 0 && decision.wordingOnly !== true);
    if (fresh) {
      verification.checks = [];
      verification.tiebreak = null;
      outcome.checksCleared = true;
      // The estimate was made for the old question: a fresh one is needed.
      delete (next as Record<string, unknown>).predicted;
      next.status = "draft";
      outcome.warnings.push(
        changedKeys.length > 0
          ? `changed ${changedKeys.join(", ")}: the checks and the estimate were cleared; build fresh packets for two new checks and a new estimate (§9.7)`
          : "recheck requested: the checks and the estimate were cleared",
      );
    } else if (changedKeys.length > 0) {
      // wordingOnly: keep the checks, re-stamped to the new packet.
      const stamps: string[] = [];
      for (const check of [
        ...verification.checks,
        ...(verification.tiebreak ? [verification.tiebreak] : []),
      ]) {
        const stamp = packetSha256(record.id, next, check.pass);
        stamps.push(`pass ${check.pass} ${check.packetSha256} -> ${stamp}`);
        check.packetSha256 = stamp;
      }
      verification.editor.reason = `${verification.editor.reason} ${TRAIL}${decision.editor} at ${decidedAt} of ${changedKeys.join(", ")}; checks kept, packetSha256 re-stamped: ${stamps.join("; ") || "no checks yet"}]`;
      outcome.warnings.push(
        `wording-only rewrite of ${changedKeys.join(", ")}: the checks were kept and their packetSha256 re-stamped; the old values are in the editor's reason (§9.7)`,
      );
    }
    next.verification = verification;
  } else {
    // accept
    next.verification = verification;
    for (const pass of changedSinceChecks(record.id, next)) {
      errors.push(
        `the item changed after pass ${pass} was recorded; rebuild packets and re-check (§9.7)`,
      );
    }
    const candidate = { ...record, item: next };
    const raw = rawItemHits(
      { bank, today: decidedAt.slice(0, 10) },
      candidate,
      scheduledDates(bank),
    );
    const kept = applyLintAllow(next, raw);
    const waived = raw.filter((hit) => !kept.includes(hit));
    const schema = schemaProblems(record.pool, next);
    const lintErrors = kept.filter((hit) => hit.severity === "error");
    // A warning passes only with an editor's lintAllow (ARCHITECTURE §5.2,
    // §2.13). A C25 hit on a claim is the myths screen's call, below.
    for (const hit of kept) {
      if (hit.severity !== "warn") continue;
      if (hit.rule === "C25" && hit.path?.startsWith("claims[")) continue;
      errors.push(
        `${hit.rule} ${hit.path ?? ""}: ${hit.message}. A warning passes only with the editor's lintAllow, which accept may add (ARCHITECTURE §5.2)`.replace(
          " :",
          ":",
        ),
      );
    }
    for (const hit of waived)
      outcome.warnings.push(
        `${hit.rule} ${hit.path ?? ""}: waived by lintAllow`.replace(" :", ":"),
      );
    const match = nearestForItem(
      bank,
      record,
      next,
      options.includeGuide !== false,
    );
    const flagged = match.nearestId !== null && match.score >= DEDUPE_FLAG;
    if (flagged && decision.dedupe === undefined)
      errors.push(dedupeRefusal(record, match));
    // Unflagged items are unique; flagged ones carry the editor's call (an
    // unanswered flag is already an error above, so it is not reported twice).
    const dedupeVerdict = flagged
      ? (decision.dedupe ?? "related_ok")
      : "unique";
    const mythHits = next.claims.flatMap((claim) =>
      bank.references.myths
        .filter((myth) => mythMatches(myth, claim.text))
        .map((myth) => ({
          claimId: claim.id,
          mythId: myth.id,
          cleared: mythCleared(next, claim.id),
        })),
    );
    const failures = acceptanceFailures({
      item: next,
      batch,
      editor: decision.editor,
      decidedAt,
      lintPassed: schema.length === 0 && lintErrors.length === 0,
      dedupe: {
        nearestId: match.nearestId,
        score: match.score,
        verdict: dedupeVerdict,
      },
      mythHits,
      ...("kind" in next && next.kind === "mystery"
        ? { answerKeys: mysteryKeys(bank, next as Mystery) }
        : {}),
    });
    errors.push(...failures);
    for (const problem of schema) errors.push(`C01 ${problem}`);
    for (const hit of lintErrors)
      errors.push(
        `${hit.rule} ${hit.path ?? ""}: ${hit.message}`.replace(" :", ":"),
      );
    if (Array.isArray(next.sourceLabels) && next.sourceLabels.length === 0) {
      const external = [a, b, t].some((check) =>
        check?.claimResults.some(
          (r) => r.verdict === "confirmed" && r.method !== "knowledge",
        ),
      );
      if (external)
        outcome.warnings.push(
          "sourceLabels is empty although external evidence exists; the editor fills it from the evidence (§2.3)",
        );
    }
    if (errors.length > 0) return { outcome };
    verification.dedupe = dedupeRecordFor(
      record.file.sealed,
      match,
      decidedAt,
      dedupeVerdict,
    );
    verification.mythsScreen = { checkedAt: decidedAt, hits: mythHits };
    verification.lint = {
      version: LINT_VERSION,
      passed: true,
      warnings: waived.map((hit) => ({
        rule: hit.rule,
        path: hit.path ?? "",
        message: hit.message,
      })),
    };
    verification.tiebreak ??= null;
    verification.rechecks ??= [];
    next.verification = verification;
    next.status = "active";
  }

  const problems = schemaProblems(record.pool, next);
  if (problems.length > 0) {
    errors.push(...problems.map((problem) => `C01 ${problem}`));
    return { outcome };
  }
  outcome.ok = true;
  outcome.status = next.status;
  return { outcome, item: next };
}

/** Applies a decisions file to a batch and writes the changed items. */
export async function applyDecisions(
  bank: Bank,
  batch: BatchEntry,
  decisions: DecisionInputEntry[],
  options: DecideOptions,
): Promise<{ outcomes: DecisionOutcome[]; written: string[] }> {
  const inBatch = new Set(
    batchItems(bank, batch.batchId).map((record) => record.id),
  );
  const outcomes: DecisionOutcome[] = [];
  const updates = new Map<string, AnyItem>();
  const seen = new Set<string>();
  for (const decision of decisions) {
    const record = bank.itemsById.get(decision.itemId);
    if (!record || !inBatch.has(decision.itemId)) {
      outcomes.push({
        itemId: decision.itemId,
        decision: decision.decision,
        ok: false,
        errors: [`${decision.itemId} is not an item of ${batch.batchId}`],
        warnings: [],
      });
      continue;
    }
    if (seen.has(decision.itemId)) {
      outcomes.push({
        itemId: decision.itemId,
        decision: decision.decision,
        ok: false,
        errors: ["one decision per item per file"],
        warnings: [],
      });
      continue;
    }
    seen.add(decision.itemId);
    const { outcome, item } = decideOne(bank, batch, record, decision, options);
    outcomes.push(outcome);
    if (item) updates.set(record.id, item);
  }
  const written =
    updates.size > 0 ? await saveItems(bank, updates, options) : [];
  return { outcomes, written };
}
