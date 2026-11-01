/**
 * Reinstating cuts under decisions memo §18 (content:reinstate).
 *
 * The first production pass cut items whose high-risk claims (or encore
 * value) had no dataset or web evidence, although both independent checks
 * had passed them. Memo §18 now accepts such a claim when checks A and B
 * (different runs) both confirmed it directly, and says items cut only for
 * missing external evidence are reinstated through the normal acceptance
 * path. This module finds those items and nothing else.
 *
 * It looks only at closed item batches, and only at items whose status is
 * cut with an editor decision of cut. Why the editor cut an item is derived
 * from the records, never from the editor's prose. An item is reinstated only
 * when all of these hold:
 *
 * - checks A and B exist, by different runs, and both verdicts are pass;
 * - no tiebreak record, and every claim confirmed directly in both A and B
 *   (a checker's own addition, which the other check never saw, needs a
 *   follow-up under §9.7, so it keeps the item cut);
 * - neither record raised an issue of any severity: every issue type is a
 *   style or content concern the editor may have cut for (a blocker, of
 *   course, too);
 * - no stored dedupe verdict of duplicate, no stored failed lint, and no
 *   myth-screen hit (stored or current) without external evidence;
 * - the batch has no fabricated-source or audit-failure incident against
 *   these checks (§9.6, §9.10);
 * - under the rule before memo §18, the item did fail for missing external
 *   evidence: some high-risk claim had no dataset or web evidence, or the
 *   encore value no external source. Otherwise the cut was the editor's call
 *   on something else, and it stands;
 * - the current acceptance rule passes, run exactly as content:decide runs
 *   it (acceptanceScreen: packet hashes, lint with the item's own lintAllow,
 *   dedupe with no editor call, the myths screen and acceptanceFailures),
 *   with the batch's own editor id and decidedAt now; and the result passes
 *   content:check's re-check of active items;
 * - reinstating the batch's items adds no pool-rule error (a closed room
 *   pack must keep exactly 15 questions in play, X04).
 *
 * A reinstated item becomes active with an editor decision of accept, the
 * reason `Reinstated under decisions memo section 18; previous cut: <old
 * reason>`, and the dedupe, myths and lint records an accept writes. Ids and
 * text never change. Items are screened in id order and applied to the
 * in-memory bank as they pass, so a later item's dedupe sees an earlier one
 * as active, and two near-duplicate cuts never both come back.
 */
import { BatchRegisterSchema, type BatchEntry } from "../schema/batches.ts";
import type { AnyItem } from "../schema/items.ts";
import type { CheckRecord } from "../schema/verification.ts";
import {
  checksOf,
  confirmedIn,
  externalSources,
  externallyConfirmed,
  mythCleared,
} from "./acceptance.ts";
import type { Bank, BankItem } from "./bank.ts";
import {
  acceptanceScreen,
  isoSeconds,
  schemaProblems,
  type ScreenGate,
} from "./decisions.ts";
import type { Pool } from "./ids.ts";
import { cloneJson, writeJsonFile } from "./json.ts";
import { activeItemHits } from "./lint/active-rules.ts";
import { poolFindings } from "./lint/pool-rules.ts";
import { barredCheckers } from "./records.ts";
import { mythMatches } from "./references.ts";
import { anyAgentRun, batchItems, sameAgentRun } from "./register.ts";
import { saveItems, type SaveOptions } from "./store.ts";

/** How every reinstated item's editor reason starts. */
export const REINSTATE_REASON =
  "Reinstated under decisions memo section 18; previous cut:";

/**
 * Why a cut stays cut, in the order the gates run. An item is counted under
 * the first one that applies. None of them carries item text.
 */
export const KEEP_REASONS = [
  /** The batch's items name no single editor id. */
  "editor",
  /** A fabricated-source or audit-failure incident covers the checks. */
  "incident",
  /** Pass A or pass B is missing. */
  "checks",
  /** A and B are the same run. */
  "same-run",
  /** A verdict other than pass. */
  "verdict",
  /** A tiebreak was involved. */
  "tiebreak",
  /** A claim not confirmed directly in both A and B. */
  "unconfirmed-claim",
  /** A checker added a claim the other check never saw (§9.7). */
  "checker-addition",
  /** An issue of severity blocker. */
  "blocker",
  /** Any other issue a checker raised (style or content). */
  "checker-issue",
  /** A dedupe verdict of duplicate, or a near-duplicate flag with no editor call. */
  "dedupe",
  /** A myth-screen hit without dataset or web evidence. */
  "myths",
  /** A lint error or a warning without the editor's lintAllow. */
  "lint",
  /** The rule before memo §18 found no evidence gap: the cut was for something else. */
  "no-evidence-gap",
  /** The item changed after its checks (packetSha256). */
  "changed",
  /** Another acceptance-rule failure (§9.9). */
  "acceptance",
  /** The item would not be a valid active item (C01). */
  "schema",
  /** content:check's re-check of active items would refuse it. */
  "check",
  /** Reinstating the batch's items would add a pool-rule error (X04). */
  "pool",
] as const;
export type KeepReason = (typeof KEEP_REASONS)[number];

const GATE_REASON: Record<ScreenGate, KeepReason> = {
  changed: "changed",
  lint: "lint",
  dedupe: "dedupe",
  myths: "myths",
  acceptance: "acceptance",
  schema: "schema",
};

export interface KeptItem {
  itemId: string;
  /** Every reason that applies, in KEEP_REASONS order. */
  reasons: KeepReason[];
}

export interface BatchCounts {
  accepted: number | null;
  cut: number | null;
}

export interface ReinstateBatchResult {
  batchId: string;
  pool: Pool;
  /** Mystery, encore and room batches: report counts only, never ids. */
  sealed: boolean;
  /** The batch's own editor id, or null when its items name none or several. */
  editor: string | null;
  /** Cut items with an editor decision of cut. */
  considered: number;
  /** Cut items without an editor decision of cut, which were left alone. */
  skipped: number;
  /** Ids reinstated (or, in a dry run, to be reinstated), in id order. */
  reinstated: string[];
  kept: KeptItem[];
  register: { before: BatchCounts; after: BatchCounts };
}

export interface ReinstateOptions {
  /** ISO timestamp of the reinstatement (decidedAt). */
  now: string;
  /** Include the guide's examples in the dedupe check (default true). */
  includeGuide?: boolean;
  /** Also consider batches still in checking (only when no editor is working). */
  includeChecking?: boolean;
}

export interface ReinstatePlan {
  batches: ReinstateBatchResult[];
  /** The reinstated items by id, ready for saveItems. */
  updates: Map<string, AnyItem>;
}

/** Claims the rule before memo §18 refused for want of external evidence. */
export function evidenceGaps(item: AnyItem): string[] {
  const set = checksOf(item);
  const encore = "kind" in item && item.kind === "encore";
  return item.claims
    .filter(
      (claim) =>
        (claim.risk === "high" && !externallyConfirmed(set, claim.id)) ||
        (encore &&
          claim.role === "value" &&
          externalSources(set, claim.id) < 1),
    )
    .map((claim) => claim.id);
}

/** Myth hits, stored and current, whose claim lacks external evidence. */
function openMythHits(bank: Bank, item: AnyItem): string[] {
  const claims = new Set<string>();
  for (const hit of item.verification?.mythsScreen?.hits ?? [])
    claims.add(hit.claimId);
  for (const claim of item.claims) {
    if (bank.references.myths.some((myth) => mythMatches(myth, claim.text)))
      claims.add(claim.id);
  }
  return [...claims].filter((claimId) => !mythCleared(item, claimId));
}

interface IncidentScope {
  /** Checkers a fabricated-source incident barred from the batch. */
  barred: string[];
  /** An audit failure sends the whole batch back for a re-check. */
  auditFailure: boolean;
}

/** The record-based gates, before any acceptance screen runs. */
function recordReasons(
  bank: Bank,
  record: BankItem,
  incidents: IncidentScope,
): KeepReason[] {
  const item = record.item;
  const reasons = new Set<KeepReason>();
  const { a, b, t } = checksOf(item);
  if (!a || !b) return ["checks"];
  const both: CheckRecord[] = [a, b];
  if (
    incidents.auditFailure ||
    both.some((check) => anyAgentRun(check.checker, incidents.barred))
  )
    reasons.add("incident");
  if (sameAgentRun(a.checker, b.checker)) reasons.add("same-run");
  if (a.verdict !== "pass" || b.verdict !== "pass") reasons.add("verdict");
  if (t) reasons.add("tiebreak");
  if (
    item.claims.some(
      (claim) => !confirmedIn(a, claim.id) || !confirmedIn(b, claim.id),
    )
  )
    reasons.add("unconfirmed-claim");
  const ids = new Set(item.claims.map((claim) => claim.id));
  if (
    both.some((check) =>
      check.claimResults.some((result) => !ids.has(result.claimId)),
    )
  )
    reasons.add("checker-addition");
  if (
    both.some((check) =>
      check.issues.some((issue) => issue.severity === "blocker"),
    )
  )
    reasons.add("blocker");
  if (both.some((check) => check.issues.length > 0))
    reasons.add("checker-issue");
  const v = item.verification;
  if (v?.dedupe?.verdict === "duplicate") reasons.add("dedupe");
  if (openMythHits(bank, item).length > 0) reasons.add("myths");
  if (v?.lint && !v.lint.passed) reasons.add("lint");
  if (evidenceGaps(item).length === 0) reasons.add("no-evidence-gap");
  return KEEP_REASONS.filter((reason) => reasons.has(reason));
}

/**
 * The item as reinstated, or why it stays cut: the acceptance screen of
 * content:decide with the batch's editor, then the schema and content:check's
 * re-check of the active item.
 */
function reinstatedItem(
  bank: Bank,
  batch: BatchEntry,
  record: BankItem,
  editor: string,
  options: ReinstateOptions,
): { item: AnyItem } | { reasons: KeepReason[] } {
  const decidedAt = isoSeconds(options.now);
  const next = cloneJson(record.item);
  const verification = next.verification;
  const previous = verification?.editor;
  if (!verification || !previous) return { reasons: ["checks"] };
  verification.editor = {
    editor,
    decision: "accept",
    reason: `${REINSTATE_REASON} ${previous.reason}`,
    decidedAt,
  };
  // Screen it as content:decide saw it: checked and estimated.
  next.status = "checking";
  const screen = acceptanceScreen(bank, batch, record, next, {
    editor,
    decidedAt,
    includeGuide: options.includeGuide !== false,
  });
  if (screen.failures.length > 0) {
    const gates = new Set(
      screen.failures.map((failure) => GATE_REASON[failure.gate]),
    );
    return { reasons: KEEP_REASONS.filter((reason) => gates.has(reason)) };
  }
  verification.dedupe = screen.records.dedupe;
  verification.mythsScreen = screen.records.mythsScreen;
  verification.lint = screen.records.lint;
  verification.tiebreak ??= null;
  verification.rechecks ??= [];
  next.status = "active";
  if (schemaProblems(record.pool, next).length > 0)
    return { reasons: ["schema"] };
  if (activeItemHits(bank, { ...record, item: next }, true).length > 0)
    return { reasons: ["check"] };
  return { item: next };
}

/** The batch's own editor: the one editor id its items record. */
export function batchEditor(bank: Bank, batchId: string): string | null {
  const editors = new Set<string>();
  for (const record of batchItems(bank, batchId)) {
    const editor = record.item.verification?.editor?.editor;
    if (editor) editors.add(editor);
  }
  return editors.size === 1 ? ([...editors][0] ?? null) : null;
}

const poolErrors = (bank: Bank): Set<string> =>
  new Set(
    poolFindings(bank)
      .filter((finding) => finding.severity === "error")
      .map((finding) => `${finding.rule}|${finding.file}|${finding.message}`),
  );

function counts(bank: Bank, batchId: string): BatchCounts {
  const items = batchItems(bank, batchId);
  return {
    accepted: items.filter((record) => record.item.status === "active").length,
    cut: items.filter((record) => record.item.status === "cut").length,
  };
}

/**
 * Works out what to reinstate in each batch. Batches must be closed item
 * batches (the caller picks them). The in-memory bank is updated as items
 * pass, and stays updated: nothing is written here.
 */
export function planReinstatement(
  bank: Bank,
  batches: readonly BatchEntry[],
  options: ReinstateOptions,
): ReinstatePlan {
  const plan: ReinstatePlan = { batches: [], updates: new Map() };
  for (const batch of batches) {
    const allowed =
      batch.status === "closed" ||
      (options.includeChecking === true && batch.status === "checking");
    if (!allowed || batch.pool === "list") {
      throw new Error(
        `${batch.batchId} is a ${batch.status} ${batch.pool} batch; content:reinstate takes closed item batches only`,
      );
    }
    const records = batchItems(bank, batch.batchId);
    const cut = records.filter((record) => record.item.status === "cut");
    const candidates = cut.filter(
      (record) => record.item.verification?.editor?.decision === "cut",
    );
    const editor = batchEditor(bank, batch.batchId);
    const result: ReinstateBatchResult = {
      batchId: batch.batchId,
      pool: batch.pool,
      sealed: batch.pool !== "practice",
      editor,
      considered: candidates.length,
      skipped: cut.length - candidates.length,
      reinstated: [],
      kept: [],
      register: {
        before: { accepted: batch.accepted, cut: batch.cut },
        after: { accepted: batch.accepted, cut: batch.cut },
      },
    };
    plan.batches.push(result);
    if (editor === null) {
      result.kept = candidates.map((record) => ({
        itemId: record.id,
        reasons: ["editor"],
      }));
      continue;
    }
    const incidents: IncidentScope = {
      barred: barredCheckers(batch),
      auditFailure: batch.incidents.some(
        (incident) => incident.kind === "audit_failure",
      ),
    };
    const baseline = poolErrors(bank);
    const applied: { record: BankItem; original: AnyItem }[] = [];
    for (const record of candidates) {
      const reasons = recordReasons(bank, record, incidents);
      if (reasons.length > 0) {
        result.kept.push({ itemId: record.id, reasons });
        continue;
      }
      const outcome = reinstatedItem(bank, batch, record, editor, options);
      if ("reasons" in outcome) {
        result.kept.push({ itemId: record.id, reasons: outcome.reasons });
        continue;
      }
      applied.push({ record, original: record.item });
      record.item = outcome.item;
    }
    if (applied.length > 0) {
      const added = [...poolErrors(bank)].filter((key) => !baseline.has(key));
      if (added.length > 0) {
        for (const { record, original } of applied) {
          record.item = original;
          result.kept.push({ itemId: record.id, reasons: ["pool"] });
        }
        applied.length = 0;
        result.kept.sort((x, y) => x.itemId.localeCompare(y.itemId));
      }
    }
    for (const { record } of applied) {
      result.reinstated.push(record.id);
      plan.updates.set(record.id, record.item);
    }
    if (applied.length > 0) result.register.after = counts(bank, batch.batchId);
  }
  return plan;
}

/**
 * Writes a plan: the reinstated items, then the register's accepted and cut
 * counts (recounted from the items, as content:batch -- close counts them).
 * Every batch stays closed.
 */
export async function applyReinstatement(
  bank: Bank,
  plan: ReinstatePlan,
  options: SaveOptions = {},
): Promise<string[]> {
  if (plan.updates.size === 0) return [];
  const register = bank.register;
  if (!register) throw new Error("no batch register (content/batches.json)");
  const written = await saveItems(bank, plan.updates, options);
  for (const result of plan.batches) {
    if (result.reinstated.length === 0) continue;
    const entry = register.batches.find(
      (batch) => batch.batchId === result.batchId,
    );
    if (!entry) throw new Error(`${result.batchId} left the register`);
    // A batch still in checking is recounted when its editor closes it.
    if (entry.status !== "closed") continue;
    entry.accepted = result.register.after.accepted;
    entry.cut = result.register.after.cut;
  }
  await writeJsonFile(
    bank.layout.registerFile,
    BatchRegisterSchema.parse(register),
  );
  return written;
}

/** Kept items by their first reason, for reports that print counts. */
export function keptByReason(
  kept: readonly KeptItem[],
): Partial<Record<KeepReason, number>> {
  const out: Partial<Record<KeepReason, number>> = {};
  for (const item of kept) {
    const reason = item.reasons[0];
    if (reason) out[reason] = (out[reason] ?? 0) + 1;
  }
  return out;
}
