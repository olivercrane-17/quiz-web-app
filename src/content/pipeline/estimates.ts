/**
 * Estimator v0 (CONTENT_GUIDE §8.5): five independent estimates per item,
 * combined by the median on the logit scale, with the standard deviation of
 * the five logits as the spread. `content:estimate` writes the result into
 * the item's `predicted`; estimators never edit item files by hand.
 *
 * - Practice and room items: five values of p.
 * - Mysteries: five sets of cumulative shares [s1, s2, s3, s4]. Each clue is
 *   combined on its own and the result is kept non-decreasing; the spread is
 *   the standard deviation of the five estimators' expected points, each one's
 *   E = s1 + s2 + s3 + s4 (§8.3, §8.5), on the points scale §10.2 picks
 *   Mystery 1 by.
 * - Encores: five { pClose, pExact } pairs; the spread is taken over pClose.
 *
 * The estimator's agent id goes into `verification.estimates` (every run that
 * wrote `predicted`), so content:record, content:decide and content:check can
 * hold "one run holds one role" against it (§0.2). `predicted.estimator`
 * keeps naming the method version, as §2.7 and §2.8 define it.
 */
import { z } from "zod";

import type { BatchEntry } from "../schema/batches.ts";
import type { AnyItem } from "../schema/items.ts";
import { agentId, share, text } from "../schema/primitives.ts";
import type { Verification } from "../schema/verification.ts";
import { checksOf } from "./acceptance.ts";
import type { BankItem } from "./bank.ts";
import { cloneJson } from "./json.ts";
import { sameAgentRun } from "./register.ts";

export const ESTIMATOR_VERSION = "v0";

const shares4 = z.tuple([share, share, share, share]);
const encorePair = z.strictObject({ pClose: share, pExact: share });

export const EstimateInputEntrySchema = z.strictObject({
  itemId: text,
  estimator: agentId("es"),
  /** Five estimates from five angles (§8.5). */
  estimates: z.array(z.union([share, shares4, encorePair])).length(5),
});
export type EstimateInputEntry = z.infer<typeof EstimateInputEntrySchema>;
export const EstimateInputSchema = z.array(EstimateInputEntrySchema).min(1);

const EPSILON = 0.005;
const clamp = (p: number) => Math.min(1 - EPSILON, Math.max(EPSILON, p));
export const logit = (p: number) => Math.log(clamp(p) / (1 - clamp(p)));
export const invLogit = (x: number) => 1 / (1 + Math.exp(-x));

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Sample standard deviation. */
export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

const round = (value: number, digits = 3) =>
  Math.round(value * 10 ** digits) / 10 ** digits;

function combine(values: number[]): { p: number; spread: number } {
  const logits = values.map(logit);
  return { p: round(invLogit(median(logits))), spread: round(stdev(logits)) };
}

export interface EstimateOutcome {
  itemId: string;
  errors: string[];
  predicted?: unknown;
}

/** Combines five estimates into `predicted`, or explains why it cannot. */
export function applyEstimate(
  record: BankItem,
  batch: BatchEntry,
  entry: EstimateInputEntry,
  /** ISO timestamp recorded in verification.estimates. */
  now: string,
): { outcome: EstimateOutcome; item?: AnyItem } {
  const item = record.item;
  const outcome: EstimateOutcome = { itemId: record.id, errors: [] };
  const errors = outcome.errors;
  if (item.status !== "draft" && item.status !== "checking") {
    errors.push(
      `the item is ${item.status}; estimates go on draft or checking items`,
    );
  }
  if (sameAgentRun(entry.estimator, batch.writer)) {
    errors.push(
      `estimator ${entry.estimator} wrote this batch; one run holds one role (§0.2)`,
    );
  }
  const { a, b, t } = checksOf(item);
  for (const check of [a, b, t]) {
    if (check && sameAgentRun(entry.estimator, check.checker)) {
      errors.push(
        `estimator ${entry.estimator} checked this item (pass ${check.pass})`,
      );
    }
  }
  const editor = item.verification?.editor?.editor;
  if (sameAgentRun(entry.estimator, editor)) {
    errors.push(
      `estimator ${entry.estimator} is this item's editor; one run holds one role (§0.2)`,
    );
  }

  let predicted: Record<string, unknown> | undefined;
  if ("kind" in item && item.kind === "mystery") {
    const sets = entry.estimates.filter(
      (e): e is [number, number, number, number] => Array.isArray(e),
    );
    if (sets.length !== 5) {
      errors.push("a mystery takes five [s1, s2, s3, s4] estimates");
    } else {
      const shares = [0, 1, 2, 3].map((k) =>
        invLogit(median(sets.map((set) => logit(set[k] ?? 0)))),
      );
      for (let k = 1; k < 4; k += 1)
        shares[k] = Math.max(shares[k] ?? 0, shares[k - 1] ?? 0);
      // §8.5: how far the five disagree on expected points.
      const spread = stdev(
        sets.map((set) => set.reduce((sum, s) => sum + s, 0)),
      );
      predicted = {
        solveByClue: shares.map((s) => round(s)),
        spread: round(spread),
        estimator: ESTIMATOR_VERSION,
      };
    }
  } else if ("kind" in item && item.kind === "encore") {
    const pairs = entry.estimates.filter(
      (e): e is { pClose: number; pExact: number } =>
        typeof e === "object" && !Array.isArray(e),
    );
    if (pairs.length !== 5) {
      errors.push("an encore takes five { pClose, pExact } estimates");
    } else {
      const close = combine(pairs.map((pair) => pair.pClose));
      const exact = combine(pairs.map((pair) => pair.pExact));
      predicted = {
        pClose: close.p,
        pExact: Math.min(exact.p, close.p),
        spread: close.spread,
        estimator: ESTIMATOR_VERSION,
      };
    }
  } else {
    const values = entry.estimates.filter(
      (e): e is number => typeof e === "number",
    );
    if (values.length !== 5) {
      errors.push("a practice or room item takes five values of p");
    } else {
      const { p, spread } = combine(values);
      predicted = { p, spread, estimator: ESTIMATOR_VERSION };
    }
  }
  if (errors.length > 0 || !predicted) return { outcome };
  const next = { ...cloneJson(item), predicted } as AnyItem;
  const verification: Verification = next.verification ?? { checks: [] };
  verification.estimates = [
    ...(verification.estimates ?? []),
    { by: entry.estimator, at: now },
  ];
  next.verification = verification;
  // From checking on, the estimate and a check record are both present.
  if (next.status === "draft" && verification.checks.length > 0)
    next.status = "checking";
  outcome.predicted = predicted;
  return { outcome, item: next };
}
