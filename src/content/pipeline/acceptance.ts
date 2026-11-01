/**
 * The acceptance rule (CONTENT_GUIDE §9.9). The validator refuses
 * `status: active` unless all of these hold. content:decide applies it when
 * an editor accepts, and content:check applies it again to every item that
 * is already active, so an item hand-edited to `active` never passes CI.
 *
 * 1. Two check records, passes A and B, by two different checkers, neither
 *    of whom is the writer or the editor. One run holds one role (§0.2): the
 *    editor did not write the batch, and no checker or editor estimated the
 *    item.
 * 2. Both verdicts are pass, or a tiebreak passed under §9.7 (one check
 *    passed, the other did not, and pass T, by a third checker, passed with
 *    external evidence on every claim the other check did not confirm).
 * 3. Every claim is confirmed in both checks (or, for the non-passing
 *    check, by the tiebreak). Every high-risk claim, and an encore's value,
 *    has dataset or web evidence in a confirming check, or was confirmed
 *    directly by both independent checks (decisions memo §18: knowledge
 *    confirms only at "certain"; a claim that needed the tiebreak still needs
 *    external evidence). The Daily key of a mystery (every clue claim
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
import type { AnyItem } from "../schema/items.ts";
import type { CheckRecord, ClaimResult } from "../schema/verification.ts";
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

const external = (result: ClaimResult) =>
  result.method === "dataset" || result.method === "web";

function resultFor(
  check: CheckRecord | null | undefined,
  claimId: string,
): ClaimResult | undefined {
  return check?.claimResults.find((result) => result.claimId === claimId);
}

function confirmedIn(
  check: CheckRecord | null | undefined,
  claimId: string,
): boolean {
  return resultFor(check, claimId)?.verdict === "confirmed";
}

export interface CheckSet {
  a: CheckRecord | undefined;
  b: CheckRecord | undefined;
  t: CheckRecord | null;
}

export function checksOf(item: AnyItem): CheckSet {
  const checks = item.verification?.checks ?? [];
  return {
    a: checks.find((check) => check.pass === "A"),
    b: checks.find((check) => check.pass === "B"),
    t: item.verification?.tiebreak ?? null,
  };
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

/** A claim counts as confirmed in check X, directly or through the tiebreak. */
export function confirmedFor(
  set: CheckSet,
  which: "a" | "b",
  claimId: string,
): boolean {
  const check = set[which];
  if (confirmedIn(check, claimId)) return true;
  if (!check || check.verdict === "pass" || !tiebreakApplies(set)) return false;
  const result = resultFor(set.t, claimId);
  return result?.verdict === "confirmed" && external(result);
}

export function claimCleared(item: AnyItem, claimId: string): boolean {
  const set = checksOf(item);
  return confirmedFor(set, "a", claimId) && confirmedFor(set, "b", claimId);
}

/** True when A, B or T confirmed the claim with dataset or web evidence. */
export function externallyConfirmed(set: CheckSet, claimId: string): boolean {
  return [set.a, set.b, set.t].some((check) => {
    const result = resultFor(check, claimId);
    return result?.verdict === "confirmed" && external(result);
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

/** Independent external sources behind a claim, across confirming results. */
export function externalSources(set: CheckSet, claimId: string): number {
  const datasets = new Set<string>();
  const webSets = new Map<string, number>();
  for (const check of [set.a, set.b, set.t]) {
    const result = resultFor(check, claimId);
    if (!result || result.verdict !== "confirmed") continue;
    const evidence = result.evidence;
    if (evidence.kind === "dataset") datasets.add(evidence.dataset);
    if (evidence.kind === "web") {
      const strong = evidence.tiers.filter(
        (tier) => tier === "A" || tier === "B",
      ).length;
      const key = evidence.results
        .map((r) => r.url)
        .sort()
        .join(" ");
      webSets.set(
        key,
        Math.max(
          webSets.get(key) ?? 0,
          Math.min(strong, evidence.results.length),
        ),
      );
    }
  }
  let web = 0;
  for (const count of webSets.values()) web += count;
  return datasets.size + web;
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

  // Rule 2.
  const bothPass = a.verdict === "pass" && b.verdict === "pass";
  if (!bothPass && !tiebreakApplies(set)) {
    failures.push(
      a.verdict === "fail" && b.verdict === "fail"
        ? "rule 2: both checks failed; cut it or reopen it as a new draft with a new id (§9.7)"
        : `rule 2: verdicts are A ${a.verdict} and B ${b.verdict}; accept needs two passes or a passed tiebreak (§9.7)`,
    );
  }

  // Rule 3.
  for (const claim of item.claims) {
    if (
      !confirmedFor(set, "a", claim.id) ||
      !confirmedFor(set, "b", claim.id)
    ) {
      failures.push(
        `rule 3: claim ${claim.id} is not confirmed in both checks`,
      );
      continue;
    }
    // Decisions memo §18: when no dataset or web evidence was obtainable, a
    // high-risk claim (and an encore value) may rest on knowledge, but only if
    // BOTH independent checks confirmed it directly. Knowledge confirms only
    // at "certain" confidence (schema), and A and B run on different models.
    // A claim that needed the tiebreak still needs external evidence.
    const bothDirect =
      !!a &&
      !!b &&
      !sameAgentRun(a.checker, b.checker) &&
      confirmedIn(a, claim.id) &&
      confirmedIn(b, claim.id);
    if (
      claim.risk === "high" &&
      !externallyConfirmed(set, claim.id) &&
      !bothDirect
    ) {
      failures.push(
        `rule 3: high-risk claim ${claim.id} has no dataset or web evidence and was not confirmed directly by both checks`,
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
