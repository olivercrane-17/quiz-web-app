/**
 * The acceptance rule (CONTENT_GUIDE §9.9). The validator refuses
 * `status: active` unless all of these hold. content:decide applies it when
 * an editor accepts, and content:check applies it again to every item that
 * is already active, so an item hand-edited to `active` never passes CI.
 *
 * 1. Two check records, passes A and B, by two different checkers, neither
 *    of whom is the writer or the editor. Every follow-up and tiebreak is by
 *    a checker who is none of the writer, the editor or the claim's author
 *    (the checker whose pass added it). One run holds one role (§0.2): the
 *    editor did not write the batch, and no checker or editor estimated the
 *    item.
 * 2. Both verdicts are pass, or a tiebreak passed under §9.7 (one check
 *    passed, the other did not, and pass T, by a third checker, passed with
 *    external evidence on every claim the other check did not confirm).
 * 3. Every claim in the merged list (§9.7, §9.8: the writer's claims and
 *    the checkers' additions in `verification.merge`, less its duplicates)
 *    is confirmed in both checks: directly, through the tiebreak for the
 *    non-passing check, or through a passing follow-up under the missing
 *    check's brief that was sent the claim. Every high-risk claim, and an
 *    encore's value, has dataset, web or calculation evidence in a
 *    confirming check, or was confirmed directly by both independent checks
 *    (decisions memo §18: knowledge confirms only at "certain"; a claim that
 *    needed the tiebreak still needs external evidence). A web call counts
 *    at its cited result's tier, or at the lowest tier it could have relied
 *    on, so Tier C never counts (§9.5.2). The Daily key of a mystery (every clue claim
 *    that pins the answer, i.e. any clue a rival's `ruledOutBy` names, and
 *    any claim with role key) must be confirmed by both independent checks,
 *    which run on different models; a pinning claim marked high-risk also
 *    needs external evidence through the high-risk rule. This relaxes the
 *    guide's "two independent external sources" per docs/02-PRODUCT-DECISIONS.md
 *    §15, because the shared web-search budget cannot cover every Daily clue.
 * 4. Mysteries: both checks confirm the uniqueness claim, and neither found
 *    a rival that fits clues 1 to 3: no candidate besides the answer in its
 *    clue-3 cold solve, whatever severity its issue carries, and no
 *    second_answer or ambiguity issue of severity blocker or fix.
 * 5. No open blocker. Lint passed. Dedupe verdict unique or related_ok.
 *    Myths screen clean: every claim that resembles a known myth is
 *    confirmed by both checks, with dataset or web evidence in one of them.
 * 6. The editor's decision is accept (the caller's), and a slow item's
 *    reviewBy falls at most 24 months after it.
 */
import type { BatchEntry } from "../schema/batches.ts";
import { additionPass } from "../schema/claims.ts";
import type { AnyItem } from "../schema/items.ts";
import {
  backsHighRisk,
  evidenceEntries,
  isExternalSource,
  type CheckRecord,
  type ClaimResult,
  type FollowUpRecord,
} from "../schema/verification.ts";
import { rivalsAfterClue3 } from "./mystery-keys.ts";
import { anyAgentRun, sameAgentRun } from "./register.ts";
import { foldName } from "./text.ts";

export interface DedupeVerdictInput {
  nearestId: string | null;
  score: number | null;
  verdict: "unique" | "related_ok" | "duplicate";
}

export interface AcceptanceInput {
  item: AnyItem;
  batch: BatchEntry | null;
  editor: string;
  /** When the editor accepted (rule 6's reviewBy bound). */
  decidedAt: string;
  lintPassed: boolean;
  dedupe: DedupeVerdictInput;
  mythHits: { claimId: string; mythId: string; cleared: boolean }[];
  /**
   * Mysteries: mysteryKeys() of the item (names and aliases from its list),
   * for the clue-3 rival test. Without it only the ids count as the answer.
   */
  answerKeys?: ReadonlySet<string>;
}

/**
 * A confirmed result with an independent external source: a dataset record
 * or a web call that counts at Tier A or B (§9.5.2). Tier C never counts.
 */
const external = (result: ClaimResult) =>
  result.verdict === "confirmed" &&
  evidenceEntries(result).some(isExternalSource);

/** A confirmed result whose evidence backs a high-risk claim: external, or a calculation (§9.5.4). */
const backed = (result: ClaimResult) =>
  result.verdict === "confirmed" && evidenceEntries(result).some(backsHighRisk);

function resultFor(
  check: { claimResults: readonly ClaimResult[] } | null | undefined,
  claimId: string,
): ClaimResult | undefined {
  return check?.claimResults.find((result) => result.claimId === claimId);
}

/** True when this one record confirmed the claim itself (no tiebreak). */
export function confirmedIn(
  check: CheckRecord | null | undefined,
  claimId: string,
): boolean {
  return resultFor(check, claimId)?.verdict === "confirmed";
}

export interface CheckSet {
  a: CheckRecord | undefined;
  b: CheckRecord | undefined;
  t: CheckRecord | null;
  /** §9.7's follow-ups, each standing in for one pass on the claims it was sent. */
  followUps: readonly FollowUpRecord[];
}

export function checksOf(item: AnyItem): CheckSet {
  const checks = item.verification?.checks ?? [];
  return {
    a: checks.find((check) => check.pass === "A"),
    b: checks.find((check) => check.pass === "B"),
    t: item.verification?.tiebreak ?? null,
    followUps: item.verification?.followUps ?? [],
  };
}

/** One claim of the merged list (§9.7, §9.8). */
export interface MergedClaim {
  id: string;
  risk: "standard" | "high";
  /** Null for an older addition that carries no addedClaim. */
  role: string | null;
  /** Who added it: the writer, or the pass whose checker did. */
  addedBy: "writer" | "A" | "B" | "T" | "D";
}

/**
 * The merged claim list (§9.7, §9.8): every writer claim, plus every claim
 * the editor's merge record lists, less the additions it marks as
 * duplicates. Without a merge record it is the writer's claims. An
 * addition's role and risk come from the adding check's `addedClaim`.
 */
export function mergedClaims(item: AnyItem): MergedClaim[] {
  const v = item.verification;
  const out: MergedClaim[] = item.claims.map((claim) => ({
    id: claim.id,
    risk: claim.risk,
    role: claim.role,
    addedBy: "writer",
  }));
  const merge = v?.merge;
  if (!merge) return out;
  const writer = new Set(out.map((claim) => claim.id));
  const duplicates = new Set(
    merge.duplicates
      .map((duplicate) => duplicate.id)
      .filter((id) => !writer.has(id)),
  );
  const records = [
    ...(v.checks ?? []),
    ...(v.tiebreak ? [v.tiebreak] : []),
    ...(v.dailyChecks ?? []),
  ];
  for (const entry of merge.claims) {
    if (writer.has(entry.id) || duplicates.has(entry.id)) continue;
    if (out.some((claim) => claim.id === entry.id)) continue;
    const added = records
      .map((record) => resultFor(record, entry.id)?.addedClaim)
      .find((claim) => claim !== undefined);
    out.push({
      id: entry.id,
      risk: added?.risk ?? "standard",
      role: added?.role ?? null,
      addedBy: entry.addedBy,
    });
  }
  return out;
}

/** The pass that added a merged claim: the merge record's word, or its id's prefix. */
function adderOf(item: AnyItem, claimId: string): "A" | "B" | "T" | "D" | null {
  const entry = item.verification?.merge?.claims.find(
    (claim) => claim.id === claimId,
  );
  if (entry && entry.addedBy !== "writer") return entry.addedBy;
  return additionPass(claimId);
}

/** The checker runs behind the pass that added a claim (the claim's author, §9.9 rule 1). */
function authorsOf(item: AnyItem, claimId: string): string[] {
  const v = item.verification;
  const pass = adderOf(item, claimId);
  if (pass === "A" || pass === "B")
    return (v?.checks ?? [])
      .filter((check) => check.pass === pass)
      .map((check) => check.checker);
  if (pass === "T") return v?.tiebreak ? [v.tiebreak.checker] : [];
  if (pass === "D") return (v?.dailyChecks ?? []).map((check) => check.checker);
  return [];
}

export interface Independence {
  writer: string | null;
  editor: string;
  estimators: readonly string[];
}

/**
 * Why a follow-up may not stand in (§9.9 rule 1): its run is the writer,
 * the editor, an estimator or the author of a claim it was sent.
 */
export function followUpConflicts(
  item: AnyItem,
  followUp: FollowUpRecord,
  who: Independence,
): string[] {
  const out: string[] = [];
  const name = `the pass ${followUp.pass} follow-up by ${followUp.checker}`;
  if (sameAgentRun(followUp.checker, who.writer))
    out.push(`rule 1: ${name} is the writer's run`);
  if (sameAgentRun(followUp.checker, who.editor))
    out.push(`rule 1: ${name} is the editor's run`);
  if (anyAgentRun(followUp.checker, who.estimators))
    out.push(
      `rule 1: ${name} estimated this item; one run holds one role (§0.2)`,
    );
  for (const claimId of followUp.followUpFor) {
    if (anyAgentRun(followUp.checker, authorsOf(item, claimId)))
      out.push(
        `rule 1: ${name} added claim ${claimId}; a follow-up is never by the claim's author (§9.7)`,
      );
  }
  return out;
}

/**
 * A passing follow-up under `pass`'s brief that was sent the claim and
 * confirmed it: it stands in for that check on the claim (§9.7). Rule 1
 * checks separately that every follow-up's run is independent.
 */
function followUpConfirms(
  set: CheckSet,
  pass: "A" | "B",
  claimId: string,
): boolean {
  return set.followUps.some(
    (followUp) =>
      followUp.pass === pass &&
      followUp.verdict === "pass" &&
      followUp.followUpFor.includes(claimId) &&
      resultFor(followUp, claimId)?.verdict === "confirmed",
  );
}

/** Every estimator run recorded on the item (content:estimate). */
export function estimatorsOf(item: AnyItem): string[] {
  return (item.verification?.estimates ?? []).map((estimate) => estimate.by);
}

/** True when the tiebreak settles a pass/non-pass split (§9.7). */
export function tiebreakApplies({ a, b, t }: CheckSet): boolean {
  if (!a || !b || !t || t.verdict !== "pass") return false;
  return (a.verdict === "pass") !== (b.verdict === "pass");
}

/**
 * A claim counts as confirmed in check X: directly, through the tiebreak
 * when X is the non-passing check, or through a passing follow-up under
 * X's brief that was sent the claim (§9.7, §9.9 rule 3).
 */
export function confirmedFor(
  set: CheckSet,
  which: "a" | "b",
  claimId: string,
): boolean {
  const check = set[which];
  if (confirmedIn(check, claimId)) return true;
  if (followUpConfirms(set, which === "a" ? "A" : "B", claimId)) return true;
  if (!check || check.verdict === "pass" || !tiebreakApplies(set)) return false;
  const result = resultFor(set.t, claimId);
  return result !== undefined && external(result);
}

export function claimCleared(item: AnyItem, claimId: string): boolean {
  const set = checksOf(item);
  return confirmedFor(set, "a", claimId) && confirmedFor(set, "b", claimId);
}

/**
 * True when A, B, T or a follow-up confirmed the claim with an external
 * source (a dataset record, or a web call counting at Tier A or B). With
 * `calculation`, a calculation counts too (the high-risk rule, §9.9 rule 3).
 */
export function externallyConfirmed(
  set: CheckSet,
  claimId: string,
  options: { calculation?: boolean } = {},
): boolean {
  return [set.a, set.b, set.t, ...set.followUps].some((check) => {
    const result = resultFor(check, claimId);
    if (!result) return false;
    return options.calculation === true ? backed(result) : external(result);
  });
}

/**
 * A myth-screen hit is cleared when both checks confirmed the claim and one
 * confirming result is dataset or web evidence. Two agents agreeing from
 * knowledge is weak evidence, and a famous myth is exactly what correlated
 * checkers get wrong (§9.1).
 */
export function mythCleared(item: AnyItem, claimId: string): boolean {
  return (
    claimCleared(item, claimId) && externallyConfirmed(checksOf(item), claimId)
  );
}

/**
 * Independent external sources behind a claim, across confirming results
 * (§9.5.2): each dataset once, and each web call that counts at Tier A or
 * B once, however many URLs it lists. A call that counts at Tier C (its
 * cited result's tier, or the lowest it could have relied on) never counts.
 */
export function externalSources(set: CheckSet, claimId: string): number {
  const datasets = new Set<string>();
  const calls = new Set<string>();
  for (const check of [set.a, set.b, set.t, ...set.followUps]) {
    const result = resultFor(check, claimId);
    if (!result || result.verdict !== "confirmed") continue;
    for (const entry of evidenceEntries(result)) {
      if (!isExternalSource(entry)) continue;
      if (entry.kind === "dataset") datasets.add(entry.dataset);
      if (entry.kind === "web")
        calls.add(
          entry.results
            .map((r) => r.url)
            .sort()
            .join(" "),
        );
    }
  }
  return datasets.size + calls.size;
}

/** The clue numbers a mystery's rivals are ruled out by: the pinning clues. */
export function pinningClues(item: AnyItem): Set<number> {
  if (!("kind" in item) || item.kind !== "mystery") return new Set();
  return new Set(item.rivals.flatMap((rival) => rival.ruledOutBy));
}

function addMonths(date: string, months: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** The latest reviewBy a slow item accepted on `decidedAt` may carry (§2.3). */
export function latestReviewBy(decidedAt: string): string {
  return addMonths(decidedAt, 24);
}

/** Why the item cannot become active. Empty means it passes §9.9. */
export function acceptanceFailures(input: AcceptanceInput): string[] {
  const { item, batch, editor } = input;
  const failures: string[] = [];
  const set = checksOf(item);
  const { a, b, t } = set;
  const writer = batch?.writer ?? null;
  const estimators = estimatorsOf(item);

  // Rule 1.
  if (!a || !b) {
    failures.push("rule 1: needs check records from passes A and B");
    return failures;
  }
  if (sameAgentRun(a.checker, b.checker))
    failures.push("rule 1: passes A and B were done by the same checker");
  for (const check of [a, b, ...(t ? [t] : [])]) {
    if (sameAgentRun(check.checker, writer))
      failures.push(
        `rule 1: pass ${check.pass} checker ${check.checker} is the writer`,
      );
    if (sameAgentRun(check.checker, editor))
      failures.push(
        `rule 1: pass ${check.pass} checker ${check.checker} is the editor`,
      );
    if (anyAgentRun(check.checker, estimators))
      failures.push(
        `rule 1: pass ${check.pass} checker ${check.checker} estimated this item; one run holds one role (§0.2)`,
      );
  }
  if (
    t &&
    (sameAgentRun(t.checker, a.checker) || sameAgentRun(t.checker, b.checker))
  ) {
    failures.push("rule 1: the tiebreak needs a third checker");
  }
  if (sameAgentRun(editor, writer))
    failures.push(`rule 1: the editor ${editor} wrote this batch (§0.2)`);
  if (anyAgentRun(editor, estimators))
    failures.push(
      `rule 1: the editor ${editor} estimated this item; one run holds one role (§0.2)`,
    );
  // Follow-ups (§9.7): none of the writer, the editor or the claim's author.
  for (const followUp of set.followUps)
    failures.push(
      ...followUpConflicts(item, followUp, { writer, editor, estimators }),
    );

  // Rule 2.
  const bothPass = a.verdict === "pass" && b.verdict === "pass";
  if (!bothPass && !tiebreakApplies(set)) {
    failures.push(
      a.verdict === "fail" && b.verdict === "fail"
        ? "rule 2: both checks failed; cut it or reopen it as a new draft with a new id (§9.7)"
        : `rule 2: verdicts are A ${a.verdict} and B ${b.verdict}; accept needs two passes or a passed tiebreak (§9.7)`,
    );
  }

  // Rule 3: every claim of the merged list (§9.8), a follow-up standing in
  // for the check that lacked it.
  for (const claim of mergedClaims(item)) {
    if (
      !confirmedFor(set, "a", claim.id) ||
      !confirmedFor(set, "b", claim.id)
    ) {
      failures.push(
        claim.addedBy === "writer"
          ? `rule 3: claim ${claim.id} is not confirmed in both checks`
          : `rule 3: claim ${claim.id}, added by pass ${claim.addedBy}, is not confirmed in both checks; a passing follow-up under the other pass's brief stands in for the check that lacked it (§9.7)`,
      );
      continue;
    }
    // Decisions memo §18: when no dataset or web evidence was obtainable, a
    // high-risk claim (and an encore value) may rest on knowledge, but only if
    // BOTH independent checks confirmed it directly (a follow-up under a
    // pass's brief counts for that pass). Knowledge confirms only at
    // "certain" confidence (schema), and A and B run on different models.
    // A claim that needed the tiebreak still needs external evidence.
    const direct = (check: CheckRecord, pass: "A" | "B") =>
      confirmedIn(check, claim.id) || followUpConfirms(set, pass, claim.id);
    const bothDirect =
      !sameAgentRun(a.checker, b.checker) && direct(a, "A") && direct(b, "B");
    if (
      claim.risk === "high" &&
      !externallyConfirmed(set, claim.id, { calculation: true }) &&
      !bothDirect
    ) {
      failures.push(
        `rule 3: high-risk claim ${claim.id} has no dataset, web or calculation evidence and was not confirmed directly by both checks`,
      );
    }
    const isEncoreValue =
      "kind" in item && item.kind === "encore" && claim.role === "value";
    if (isEncoreValue && externalSources(set, claim.id) < 1 && !bothDirect) {
      failures.push(
        `rule 3: the encore value (${claim.id}) needs an external source (dataset or web) or direct confirmation by both checks`,
      );
    }
    // Mystery pinning claims (the Daily key, see pinningClues) need no extra
    // rule here: both checks must already confirm them above, and a high-risk
    // one needs external evidence through the high-risk rule (memo §15).
  }

  // Rule 4.
  if ("kind" in item && item.kind === "mystery") {
    for (const claim of item.claims.filter((c) => c.role === "uniqueness")) {
      if (!confirmedIn(a, claim.id) || !confirmedIn(b, claim.id)) {
        failures.push(
          `rule 4: both checks must confirm the uniqueness claim ${claim.id}`,
        );
      }
    }
    const keys =
      input.answerKeys ??
      new Set([item.answer, ...item.accepted].map((id) => foldName(id)));
    for (const check of [a, b]) {
      const rival = check.issues.some(
        (issue) =>
          (issue.type === "second_answer" || issue.type === "ambiguity") &&
          issue.severity !== "note",
      );
      if (rival)
        failures.push(
          `rule 4: pass ${check.pass} found a rival or an ambiguity`,
        );
      const left = rivalsAfterClue3(keys, check.coldSolve).length;
      if (left > 0)
        failures.push(
          `rule 4: pass ${check.pass} still had ${left} candidate(s) besides the answer after clue 3, so a rival fits clues 1 to 3`,
        );
    }
  }

  // Rule 5.
  const resolved = tiebreakApplies(set)
    ? [a, b].find((check) => check.verdict !== "pass")
    : undefined;
  for (const check of [a, b, ...(t ? [t] : [])]) {
    if (check === resolved) continue;
    if (check.issues.some((issue) => issue.severity === "blocker")) {
      failures.push(`rule 5: pass ${check.pass} has an open blocker`);
    }
  }
  if (!input.lintPassed) failures.push("rule 5: the lint has errors");
  // The nearest id is left out: it may join a public item to a sealed one.
  if (input.dedupe.verdict === "duplicate")
    failures.push("rule 5: dedupe verdict is duplicate");
  const open = input.mythHits.filter((hit) => !hit.cleared);
  if (open.length > 0) {
    failures.push(
      `rule 5: myths screen not clean (claims ${[...new Set(open.map((hit) => hit.claimId))].join(", ")} match known myths and were not confirmed by both checks with dataset or web evidence)`,
    );
  }

  // Rule 6.
  if (
    item.volatility === "slow" &&
    item.reviewBy !== null &&
    item.reviewBy > latestReviewBy(input.decidedAt)
  ) {
    failures.push(
      "rule 6: reviewBy is more than 24 months after acceptance (§2.3)",
    );
  }
  return failures;
}
