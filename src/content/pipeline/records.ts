/**
 * Validating and merging fact-checker records (CONTENT_GUIDE §9.4, §9.8).
 * Checkers never edit items; `content:record` merges their records into
 * `verification.checks` (passes A and B) or `verification.tiebreak` (T).
 */
import type { BatchEntry, Incident } from "../schema/batches.ts";
import { datasetVersion } from "../schema/datasets.ts";
import type { RecordInputEntry } from "../schema/inputs.ts";
import type { AnyItem } from "../schema/items.ts";
import type {
  CheckRecord,
  Pass,
  Verification,
} from "../schema/verification.ts";
import { estimatorsOf } from "./acceptance.ts";
import type { Bank, BankItem } from "./bank.ts";
import { cloneJson } from "./json.ts";
import { isMysteryKey, mysteryKeys, rivalsAfterClue3 } from "./mystery-keys.ts";
import { coldView, packetSha256 } from "./packets.ts";
import {
  anyAgentRun,
  batchItems,
  sameAgentRun,
  searchBudget,
} from "./register.ts";
import { foldName } from "./text.ts";

export interface RecordCheck {
  itemId: string;
  errors: string[];
  warnings: string[];
}

function isChoice(item: AnyItem): boolean {
  return !("kind" in item) || item.kind === "choice";
}

const norm = (value: string) => foldName(value);

/** The key as a cold-solve answer: option text, True/False or a label. */
function keyText(item: AnyItem): string | null {
  if ("kind" in item && item.kind !== "choice") return null;
  if (item.format === "tf") return item.answer ? "True" : "False";
  if (item.format === "comparison")
    return item.answer === "a" ? item.a : item.b;
  return item.answer;
}

/** Incident kinds whose `checkers` may never check the batch again. */
const BARRING_KINDS: ReadonlySet<Incident["kind"]> = new Set([
  "fabricated_source",
  "invalid_check",
]);

/**
 * Checkers an incident barred from this batch: everyone who had checked it
 * when a fabricated source was found (§9.6), and the checker whose records
 * an invalid_check incident voided.
 */
export function barredCheckers(batch: BatchEntry): string[] {
  return batch.incidents.flatMap((incident) =>
    BARRING_KINDS.has(incident.kind) ? (incident.checkers ?? []) : [],
  );
}

/** The first incident that barred `checker` from this batch, if any. */
export function barringIncident(
  batch: BatchEntry,
  checker: string,
): Incident | undefined {
  return batch.incidents.find(
    (incident) =>
      BARRING_KINDS.has(incident.kind) &&
      anyAgentRun(checker, incident.checkers ?? []),
  );
}

/** Everything that would make `content:record` refuse this record. */
export function checkRecord(
  bank: Bank,
  batch: BatchEntry,
  pass: Pass,
  record: BankItem,
  entry: RecordInputEntry,
): RecordCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const item = record.item;
  const verification = item.verification;

  if (pass === "T" && (verification?.checks.length ?? 0) < 2) {
    errors.push("a tiebreak follows passes A and B (§9.7)");
  }
  if (entry.pass !== pass)
    errors.push(`the record is pass ${entry.pass}, but --pass is ${pass}`);
  if (item.status !== "draft" && item.status !== "checking") {
    errors.push(
      `the item is ${item.status}; records merge only into draft or checking items`,
    );
  }

  // Independence: never the writer, the editor or the other passes' checker.
  if (sameAgentRun(entry.checker, batch.writer)) {
    errors.push(
      `checker ${entry.checker} is the batch's writer (${String(batch.writer)}); checkers never check their own items (§0.2)`,
    );
  }
  if (sameAgentRun(entry.checker, verification?.editor?.editor)) {
    errors.push(`checker ${entry.checker} is this item's editor (§9.9)`);
  }
  const others = [
    ...(verification?.checks ?? []),
    ...(verification?.tiebreak ? [verification.tiebreak] : []),
  ].filter((check) => check.pass !== pass);
  for (const other of others) {
    if (sameAgentRun(entry.checker, other.checker)) {
      errors.push(
        `checker ${entry.checker} already did pass ${other.pass}; passes need different checkers (§9.9)`,
      );
    }
  }
  if (anyAgentRun(entry.checker, estimatorsOf(item))) {
    errors.push(
      `checker ${entry.checker} estimated this item; one run holds one role (§0.2)`,
    );
  }
  const barred = barringIncident(batch, entry.checker);
  if (barred) {
    errors.push(
      barred.kind === "fabricated_source"
        ? `checker ${entry.checker} checked this batch before its fabricated-source incident; fresh checkers re-check every item (§9.6)`
        : `checker ${entry.checker} is barred from this batch by its ${barred.kind} incident of ${barred.date}, which voided their records; a new checker id records this pass`,
    );
  }

  // The packet the checker saw must be the packet of this item now. The
  // expected value is never printed: it would let anyone record a check
  // without opening the packet.
  if (entry.packetSha256 !== packetSha256(record.id, item, pass)) {
    errors.push(
      `packetSha256 does not match pass ${pass} of the current item; rebuild the packet with content:packet and check again`,
    );
  }

  // Claims: A and B verify every claim; T covers the disputed ones.
  const itemClaims = new Set(item.claims.map((claim) => claim.id));
  const covered = new Set(entry.claimResults.map((result) => result.claimId));
  for (const id of covered) {
    if (!itemClaims.has(id) && !id.startsWith("x")) {
      errors.push(
        `claim ${id} is not in the item; checker additions use x1, x2 and so on (§9.2)`,
      );
    }
  }
  if (pass !== "T") {
    const missing = [...itemClaims].filter((id) => !covered.has(id));
    if (missing.length > 0)
      errors.push(
        `no result for claim(s) ${missing.join(", ")}; both passes verify every claim (§9.4)`,
      );
  }

  // Knowledge confirms only in the checker's own words (§9.5): a
  // restatement that repeats the claim's wording shows nothing was checked.
  const claimWording = new Map(
    item.claims.map((claim) => [claim.id, wording(claim.text)]),
  );
  for (const result of entry.claimResults) {
    const evidence = result.evidence;
    if (evidence.kind !== "knowledge") continue;
    const text = claimWording.get(result.claimId);
    if (text && wording(evidence.restatement) === text)
      errors.push(
        `claim ${result.claimId}: the restatement repeats the claim's wording; restate the fact in your own words from your own check (§9.5)`,
      );
  }

  // Evidence: dataset records must name a pinned manifest dataset.
  entry.claimResults.forEach((result) => {
    const evidence = result.evidence;
    if (evidence.kind !== "dataset") return;
    const dataset = bank.manifest?.datasets.find(
      (d) => d.key === evidence.dataset,
    );
    if (!dataset) {
      errors.push(
        `claim ${result.claimId}: dataset ${evidence.dataset} is not in content/datasets/manifest.json (§9.6)`,
      );
    } else if (!dataset.evidence) {
      errors.push(
        `claim ${result.claimId}: dataset ${evidence.dataset} is for brainstorming and never counts as evidence`,
      );
    } else if (evidence.version !== datasetVersion(dataset)) {
      errors.push(
        `claim ${result.claimId}: ${evidence.dataset} is pinned at ${datasetVersion(dataset)}, not ${evidence.version}`,
      );
    }
  });

  // Cold solve: shape, and honesty about misses (§9.4 step 1).
  const cold = entry.coldSolve;
  const hasIssue = entry.issues.length > 0;
  if (isChoice(item)) {
    if (!("answerGiven" in cold)) {
      errors.push(
        "coldSolve for a choice item has answerGiven, confidence and matchedKey",
      );
    } else {
      const options =
        (coldView(bank, record, pass).options as string[] | undefined) ?? [];
      if (!options.some((option) => norm(option) === norm(cold.answerGiven))) {
        errors.push("coldSolve.answerGiven is not one of the packet's options");
      }
      const key = keyText(item);
      const matched = key !== null && norm(key) === norm(cold.answerGiven);
      if (cold.matchedKey !== matched)
        errors.push(
          `coldSolve.matchedKey is ${String(cold.matchedKey)} but the answer given ${matched ? "matches" : "does not match"} the key`,
        );
      if (!matched && !hasIssue)
        errors.push(
          "a cold miss needs an issue explaining it: ambiguity, or a gap in the checker's own knowledge (§9.4)",
        );
    }
  } else if ("kind" in item && item.kind === "mystery") {
    if (!("perClue" in cold)) {
      errors.push("coldSolve for a mystery has perClue");
    } else {
      cold.perClue.forEach((step, i) => {
        if (step.clue !== i + 1)
          errors.push(`coldSolve.perClue[${i}] should be clue ${i + 1}`);
      });
      if (pass !== "T" && cold.perClue.length < 3) {
        errors.push(
          "coldSolve.perClue needs clues 1 to 3 at least: the candidates left after clue 3 are the uniqueness test (§9.4, §9.9 rule 4)",
        );
      }
      const keys = mysteryKeys(bank, item);
      const rivals = rivalsAfterClue3(keys, cold);
      const explained = entry.issues.some(
        (issue) => issue.type === "ambiguity" || issue.type === "second_answer",
      );
      if (rivals.length > 0 && !explained) {
        errors.push(
          "candidates other than the answer remain after clue 3: explain them in an ambiguity or second_answer issue (§9.4)",
        );
      }
      // Listing a rival after clue 3 while confirming that only the answer
      // fits clues 1 to 3 contradicts itself (§9.9 rule 4).
      const uniqueness = new Set(
        item.claims
          .filter((claim) => claim.role === "uniqueness")
          .map((claim) => claim.id),
      );
      const confirmsUniqueness = entry.claimResults.some(
        (result) =>
          uniqueness.has(result.claimId) && result.verdict === "confirmed",
      );
      if (rivals.length > 0 && confirmsUniqueness) {
        errors.push(
          `the record confirms the uniqueness claim but lists ${rivals.length} candidate(s) besides the answer after clue 3; refute or doubt the claim, or drop the candidates (§9.9 rule 4)`,
        );
      }
      const last = cold.perClue.at(-1);
      const solved =
        last?.guess !== null &&
        last?.guess !== undefined &&
        isMysteryKey(keys, last.guess);
      if (!solved && !hasIssue)
        errors.push("a cold miss needs an issue explaining it (§9.4)");
    }
  } else if (!("estimate" in cold)) {
    errors.push("coldSolve for an encore has estimate and reasoning");
  }

  if (pass === "T") {
    const external = entry.claimResults.every(
      (result) => result.method !== "knowledge",
    );
    if (!external)
      warnings.push(
        "a tiebreak needs external evidence on every disputed claim; knowledge results will not count (§9.7)",
      );
  }
  return { itemId: record.id, errors, warnings };
}

/** Text compared for wording only: case, punctuation and spacing ignored. */
function wording(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The least time a check of one item takes (§9.4), in seconds. */
export const MIN_SECONDS_PER_ITEM = { mystery: 30, other: 8 } as const;

/**
 * File-level sanity (§9.4): a file of real checks spans real time. Checkers
 * set startedAt and finishedAt from their own clock, so a file whose span is
 * far shorter than the work it records was not checked item by item.
 * Files of fewer than five records (tiebreaks, re-checks) are exempt.
 */
export function recordFileErrors(
  bank: Bank,
  entries: readonly RecordInputEntry[],
): string[] {
  if (entries.length < 5) return [];
  const starts = entries
    .map((entry) => Date.parse(entry.startedAt))
    .filter(Number.isFinite);
  const ends = entries
    .map((entry) => Date.parse(entry.finishedAt))
    .filter(Number.isFinite);
  if (starts.length === 0 || ends.length === 0) return [];
  const span = (Math.max(...ends) - Math.min(...starts)) / 1000;
  let need = 0;
  for (const entry of entries) {
    const item = bank.itemsById.get(entry.itemId)?.item;
    need +=
      item && "kind" in item && item.kind === "mystery"
        ? MIN_SECONDS_PER_ITEM.mystery
        : MIN_SECONDS_PER_ITEM.other;
  }
  if (span >= need) return [];
  return [
    `this file records ${entries.length} checks made in ${Math.round(span / 60)} minute(s), but checking that many items properly takes at least ${Math.ceil(need / 60)} minutes. Record each item from your own cold solve and verification, never from a script or a template (§9.4)`,
  ];
}

/** Total searches recorded so far in a batch, plus the cap. */
export function searchUse(
  bank: Bank,
  batch: BatchEntry,
): { used: number; budget: number } {
  let used = 0;
  for (const record of batchItems(bank, batch.batchId)) {
    const v = record.item.verification;
    if (!v) continue;
    for (const check of [
      ...v.checks,
      ...(v.tiebreak ? [v.tiebreak] : []),
      ...(v.rechecks ?? []),
    ]) {
      used += check.searchesUsed;
    }
  }
  return { used, budget: searchBudget(batch) };
}

/**
 * The item with the record merged in. A draft moves to checking once it also
 * carries the estimator's `predicted`.
 */
export function mergeRecord(
  item: AnyItem,
  entry: RecordInputEntry,
  pass: Pass,
  replace: boolean,
): { item: AnyItem; replaced: boolean } {
  const { itemId: _itemId, ...rest } = entry;
  const record: CheckRecord = rest;
  const next = cloneJson(item);
  const verification: Verification = next.verification ?? { checks: [] };
  let replaced = false;
  if (pass === "T") {
    if (verification.tiebreak && !replace)
      throw new Error(
        `${item.id} already has a tiebreak record; pass --replace to overwrite it`,
      );
    replaced = Boolean(verification.tiebreak);
    verification.tiebreak = record;
  } else {
    const index = verification.checks.findIndex((check) => check.pass === pass);
    if (index >= 0 && !replace)
      throw new Error(
        `${item.id} already has a pass ${pass} record; pass --replace to overwrite it`,
      );
    if (index >= 0) {
      verification.checks[index] = record;
      replaced = true;
    } else {
      verification.checks.push(record);
      verification.checks.sort((a, b) => a.pass.localeCompare(b.pass));
    }
  }
  next.verification = verification;
  // From checking on, the estimate and the record are both present (§2.3).
  if (
    next.status === "draft" &&
    "predicted" in next &&
    next.predicted !== undefined
  ) {
    next.status = "checking";
  }
  return { item: next, replaced };
}
