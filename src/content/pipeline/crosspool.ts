/**
 * The cross-pool check's pairs, and the editor's judgments on them (CNT-2b,
 * X29, AC-CNT-06, CONTENT_GUIDE §10.5, §10.9).
 *
 * **Pairs.** X29 compares every Daily item in play (a mystery or an encore
 * that is not cut or retired) with every practice item and room question in
 * play, with the dedupe score of dedupe.ts, and flags each pair scoring at
 * or above DEDUPE_FLAG (0.5). The score is a similarity proxy, so a flagged
 * pair may share an entity but not a fact.
 *
 * **Judgments.** For such a pair the editor records `related_ok` on the
 * sealed Daily item, in `verification.crossPool` (never on the public item:
 * a public file never names a sealed id, ARCHITECTURE §5.4), with a
 * `pairSha256` over both items' packet fields (PACKET_FIELDS, packets.ts).
 * X29 skips the pair while that hash holds; once either item changes in
 * anything a packet shows, the judgment lapses and X29 reports the pair
 * again, as an accepted item's checks lapse when its packet changes. A
 * judgment proves itself on every run, like an active item's acceptance: it
 * counts only while its editor's run is none of the writer, a checker or an
 * estimator of either item (§0.2). A real shared fact is fixed by retiring
 * the public item instead (retire.ts).
 *
 * Every message here names one item at most, never a public item beside a
 * sealed one, and no item text.
 */
import type { AnyItem } from "../schema/items.ts";
import { agentId } from "../schema/primitives.ts";
import type { CrossPoolJudgment } from "../schema/verification.ts";
import type { Bank, BankItem } from "./bank.ts";
import { DEDUPE_FLAG, matchesAtOrAbove, type DedupeIndex } from "./dedupe.ts";
import type { Pool } from "./ids.ts";
import { sha256Hex, stableStringify } from "./json.ts";
import { bankDedupeIndex } from "./lint/index.ts";
import { packetContent } from "./packets.ts";
import { editorRefusal, roleHeld } from "./roles.ts";
import { editableCopy } from "./store.ts";

/** Bumped only if what the pair hash covers changes. */
export const CROSS_POOL_PAIR_VERSION = 1;

/** A Daily item: the sealed side of every cross-pool pair. */
export const isDailyPool = (pool: Pool | undefined): boolean =>
  pool === "mystery" || pool === "encore";

/** The other side: a practice item, or a room question near a Daily item. */
export const isOtherPool = (pool: Pool | undefined): boolean =>
  pool === "practice" || pool === "room";

const inPlay = (item: AnyItem) =>
  item.status !== "cut" && item.status !== "retired";

/**
 * The hash a judgment stores: both items' ids and packet fields, in a fixed
 * order (the Daily item first). Fields no packet shows (tags, notes, the
 * verification record, the judgment itself) leave it unchanged.
 */
export function crossPoolPairSha256(
  daily: { id: string; item: AnyItem },
  other: { id: string; item: AnyItem },
): string {
  return sha256Hex(
    stableStringify({
      v: CROSS_POOL_PAIR_VERSION,
      daily: { id: daily.id, item: packetContent(daily.item) },
      other: { id: other.id, item: packetContent(other.item) },
    }),
  );
}

/** The judgment a Daily item holds on one other item, if any. */
export function judgmentOn(
  daily: AnyItem,
  otherId: string,
): CrossPoolJudgment | undefined {
  return daily.verification?.crossPool?.find(
    (judgment) => judgment.itemId === otherId,
  );
}

/**
 * Where a pair's judgment stands: `holds` (X29 skips the pair), `lapsed`
 * (an item changed since, so its hash no longer matches), `invalid` (its
 * editor's run wrote, checked or estimated one of the two) or `none`.
 */
export type JudgmentState = "holds" | "lapsed" | "invalid" | "none";

export function judgmentState(
  bank: Bank,
  daily: BankItem,
  other: BankItem,
): JudgmentState {
  const judgment = judgmentOn(daily.item, other.id);
  if (!judgment) return "none";
  if (
    roleHeld(bank, daily, judgment.by) !== null ||
    roleHeld(bank, other, judgment.by) !== null
  )
    return "invalid";
  return judgment.pairSha256 === crossPoolPairSha256(daily, other)
    ? "holds"
    : "lapsed";
}

/** One pair the cross-pool check flags, with its judgment's state. */
export interface CrossPoolPair {
  dailyId: string;
  otherId: string;
  otherPool: "practice" | "room";
  score: number;
  reason: string;
  state: JudgmentState;
}

export interface BuiltIndex {
  index: DedupeIndex;
  positions: Map<string, number>;
}

/** The pairs of one Daily item in play, best first. */
export function pairsOf(
  bank: Bank,
  daily: BankItem,
  built: BuiltIndex,
): CrossPoolPair[] {
  if (!isDailyPool(daily.pool) || !inPlay(daily.item)) return [];
  const position = built.positions.get(daily.id);
  if (position === undefined) return [];
  const out: CrossPoolPair[] = [];
  for (const hit of matchesAtOrAbove(
    built.index,
    position,
    DEDUPE_FLAG,
    (entry) =>
      entry.source === "bank" &&
      isOtherPool(bank.itemsById.get(entry.id)?.pool),
  )) {
    const other = bank.itemsById.get(hit.id);
    if (!other || !inPlay(other.item)) continue;
    out.push({
      dailyId: daily.id,
      otherId: other.id,
      otherPool: other.pool === "room" ? "room" : "practice",
      score: hit.score,
      reason: hit.reason,
      state: judgmentState(bank, daily, other),
    });
  }
  return out;
}

/**
 * Every pair X29 reads: each Daily item in play against each practice item
 * or room question in play that scores at or above DEDUPE_FLAG, in bank
 * order. The dedupe score is symmetric, so the same list serves X29's room
 * side (a room question near a Daily item). Guide examples stay out.
 */
export function crossPoolPairs(
  bank: Bank,
  built: BuiltIndex = bankDedupeIndex(bank, false),
): CrossPoolPair[] {
  return bank.items.flatMap((record) => pairsOf(bank, record, built));
}

/** Counts of a list of pairs by judgment state. */
export function stateCounts(
  pairs: readonly CrossPoolPair[],
): Record<JudgmentState, number> {
  const counts: Record<JudgmentState, number> = {
    holds: 0,
    lapsed: 0,
    invalid: 0,
    none: 0,
  };
  for (const pair of pairs) counts[pair.state] += 1;
  return counts;
}

export interface JudgmentRequest {
  /** The sealed Daily item (a mystery or an encore) the judgment lives on. */
  dailyId: string;
  /** The practice item or room question it was judged against. */
  itemId: string;
  editor: string;
  reason: string;
  /** ISO timestamp the judgment records. */
  at: string;
}

export interface JudgmentPlan {
  dailyId: string;
  otherPool: "practice" | "room";
  /** The Daily item with the judgment stored, ready for saveItems. */
  item: AnyItem;
  /** True when it replaced an earlier judgment of the same pair. */
  replaced: boolean;
  /** Judgments the Daily item holds now. */
  judgments: number;
}

const describe = (record: BankItem) =>
  record.pool === "practice"
    ? "a practice item"
    : record.pool === "room"
      ? "a room question"
      : `a ${record.pool}`;

function refuse(message: string): never {
  throw new Error(message);
}

/**
 * Validates a cross-pool judgment and returns the Daily item with it
 * stored. Throws an Error whose message names one item at most. Only an
 * editor (ed-...) records one, never a run that wrote, checked or estimated
 * either item; both items are in play and X29 flags the pair; a judgment
 * already on the pair is replaced.
 */
export function planJudgment(
  bank: Bank,
  request: JudgmentRequest,
): JudgmentPlan {
  if (!agentId("ed").safeParse(request.editor).success)
    refuse(
      `--editor is an editor's agent id (ed-<run id>); only an editor records a cross-pool judgment, not ${request.editor}`,
    );
  if (request.reason.trim() === "")
    refuse(
      "--reason says why the two state different facts (it is stored on the sealed item)",
    );
  const dailyRecord = bank.itemsById.get(request.dailyId);
  if (!dailyRecord)
    refuse(
      `${request.dailyId} is not an item of the bank${bank.layout.kind === "content" ? "; sealed items are read from content/.sealed-plain/, so run npm run content:unseal first" : ""}`,
    );
  if (!isDailyPool(dailyRecord.pool))
    refuse(
      `--daily names a Daily item (a mystery or an encore), and ${dailyRecord.id} is ${describe(dailyRecord)}`,
    );
  const otherRecord = bank.itemsById.get(request.itemId);
  if (!otherRecord) refuse(`${request.itemId} is not an item of the bank`);
  if (!isOtherPool(otherRecord.pool))
    refuse(
      `--item names a practice item or a room question, and ${otherRecord.id} is ${describe(otherRecord)}`,
    );
  for (const record of [dailyRecord, otherRecord]) {
    if (!inPlay(record.item))
      refuse(
        `${record.id} is ${record.item.status}: the cross-pool check no longer reads it, so there is nothing to judge`,
      );
  }
  if (dailyRecord.file.fromEnvelope)
    refuse(
      `${dailyRecord.id} was read from an envelope; run content:unseal and record the judgment in the workspace`,
    );
  for (const record of [dailyRecord, otherRecord]) {
    const why = editorRefusal(bank, record, request.editor);
    if (why !== null) refuse(why);
  }
  const built = bankDedupeIndex(bank, false);
  const flagged = pairsOf(bank, dailyRecord, built).some(
    (pair) => pair.otherId === otherRecord.id,
  );
  if (!flagged)
    refuse(
      `the cross-pool check does not flag this pair (it scores below ${DEDUPE_FLAG}), so there is nothing to judge`,
    );

  const judgment: CrossPoolJudgment = {
    itemId: otherRecord.id,
    decision: "related_ok",
    by: request.editor,
    at: request.at,
    reason: request.reason.trim(),
    pairSha256: crossPoolPairSha256(dailyRecord, otherRecord),
  };
  const item = editableCopy(dailyRecord);
  const verification = item.verification ?? { checks: [] };
  const existing = verification.crossPool ?? [];
  const replaced = existing.some((entry) => entry.itemId === judgment.itemId);
  verification.crossPool = replaced
    ? existing.map((entry) =>
        entry.itemId === judgment.itemId ? judgment : entry,
      )
    : [...existing, judgment];
  item.verification = verification;
  return {
    dailyId: dailyRecord.id,
    otherPool: otherRecord.pool === "room" ? "room" : "practice",
    item,
    replaced,
    judgments: verification.crossPool.length,
  };
}
