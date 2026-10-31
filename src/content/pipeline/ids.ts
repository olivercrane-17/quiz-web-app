/**
 * Item and batch ids (CONTENT_GUIDE §2.12). In practice, mystery and encore
 * ids the first two of the four digits are the batch number and the last
 * two the sequence inside the batch. Room questions are r.<pack>.<NN>, with
 * NN shared by every batch of the pack.
 */
import type {
  BatchEntry,
  BatchPool,
  BatchRegister,
} from "../schema/batches.ts";
import {
  BATCH_ID_PATTERNS,
  ID_PATTERNS,
  type AnswerType,
  type CategoryCode,
} from "../schema/primitives.ts";

export type Pool = "practice" | "mystery" | "encore" | "room";

export interface ParsedItemId {
  id: string;
  /** The id without an `fx.` prefix. */
  bare: string;
  fixture: boolean;
  pool: Pool;
  category?: CategoryCode;
  packId?: string;
  /** Practice, mystery and encore: the BB digits. */
  batchNumber?: number;
  /** SS digits, or NN for room questions. */
  sequence: number;
}

export function parseItemId(id: string): ParsedItemId | null {
  const fixture = id.startsWith("fx.");
  const bare = fixture ? id.slice(3) : id;
  let match = ID_PATTERNS.practice.exec(id);
  if (match) {
    return {
      id,
      bare,
      fixture,
      pool: "practice",
      category: match[1] as CategoryCode,
      batchNumber: Number(match[2]),
      sequence: Number(match[3]),
    };
  }
  match = ID_PATTERNS.mystery.exec(id);
  if (match) {
    return {
      id,
      bare,
      fixture,
      pool: "mystery",
      category: match[1] as CategoryCode,
      batchNumber: Number(match[2]),
      sequence: Number(match[3]),
    };
  }
  match = ID_PATTERNS.encore.exec(id);
  if (match) {
    return {
      id,
      bare,
      fixture,
      pool: "encore",
      batchNumber: Number(match[1]),
      sequence: Number(match[2]),
    };
  }
  match = ID_PATTERNS.room.exec(id);
  if (match) {
    return {
      id,
      bare,
      fixture,
      pool: "room",
      packId: match[1] as string,
      sequence: Number(match[2]),
    };
  }
  return null;
}

export interface ParsedBatchId {
  batchId: string;
  pool: BatchPool;
  /** Category code, pack id or answer type, whichever the pool uses. */
  scope?: string;
  number: number;
}

export function parseBatchId(batchId: string): ParsedBatchId | null {
  for (const pool of [
    "practice",
    "mystery",
    "encore",
    "room",
    "list",
  ] as const) {
    const match = BATCH_ID_PATTERNS[pool].exec(batchId);
    if (!match) continue;
    if (pool === "encore") return { batchId, pool, number: Number(match[1]) };
    return {
      batchId,
      pool,
      scope: match[1] as string,
      number: Number(match[2]),
    };
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function batchIdFor(
  pool: BatchPool,
  scope: string | undefined,
  number: number,
): string {
  switch (pool) {
    case "practice":
      return `p.${String(scope)}.b${pad(number)}`;
    case "mystery":
      return `m.${String(scope)}.b${pad(number)}`;
    case "encore":
      return `e.b${pad(number)}`;
    case "room":
      return `r.${String(scope)}.b${pad(number)}`;
    case "list":
      return `l.${String(scope)}.b${pad(number)}`;
  }
}

/** The item id for a sequence in a batch. Lists issue no item ids. */
export function itemIdFor(batch: ParsedBatchId, sequence: number): string {
  switch (batch.pool) {
    case "practice":
      return `p.${String(batch.scope)}.${pad(batch.number)}${pad(sequence)}`;
    case "mystery":
      return `m.${String(batch.scope)}.${pad(batch.number)}${pad(sequence)}`;
    case "encore":
      return `e.${pad(batch.number)}${pad(sequence)}`;
    case "room":
      return `r.${String(batch.scope)}.${pad(sequence)}`;
    case "list":
      throw new Error("list batches add entities, not item ids");
  }
}

/** Highest sequence a batch may issue: 99, or 89 for room packs (90 to 99 are reserved). */
export function maxSequence(pool: BatchPool): number {
  return pool === "room" ? 89 : 99;
}

/** Room batches of one pack, in batch-number order. */
function roomBatches(register: BatchRegister, packId: string): BatchEntry[] {
  return register.batches
    .filter((batch) => batch.pool === "room" && batch.packId === packId)
    .sort((a, b) => a.batchId.localeCompare(b.batchId));
}

/** The first sequence a batch may issue. */
export function firstSequence(
  register: BatchRegister,
  batch: BatchEntry,
): number {
  if (batch.pool !== "room" || batch.packId === undefined) return 1;
  let first = 1;
  for (const other of roomBatches(register, batch.packId)) {
    if (other.batchId === batch.batchId) return first;
    first = Math.max(first, other.lastSequence + 1);
  }
  return first;
}

/**
 * The register entry an item id belongs to, or null when no registered
 * batch covers it. A room question belongs to the pack's batch whose issued
 * range holds its NN.
 */
export function batchForItem(
  register: BatchRegister,
  parsed: ParsedItemId,
): BatchEntry | null {
  if (parsed.pool === "room") {
    const batches = roomBatches(register, String(parsed.packId));
    let first = 1;
    for (const batch of batches) {
      const last = Math.max(batch.lastSequence, first - 1);
      if (parsed.sequence >= first && parsed.sequence <= last) return batch;
      first = last + 1;
    }
    return batches.at(-1) ?? null;
  }
  const scope = parsed.pool === "encore" ? undefined : parsed.category;
  const batchId = batchIdFor(parsed.pool, scope, parsed.batchNumber ?? 0);
  return register.batches.find((batch) => batch.batchId === batchId) ?? null;
}

/** True when an item id is one of the guide's reserved examples (batch 00, rooms 90 to 99). */
export function isReservedExampleId(parsed: ParsedItemId): boolean {
  if (parsed.pool === "room")
    return parsed.sequence >= 90 || parsed.sequence === 0;
  return parsed.batchNumber === 0;
}

/** The answer type an `x.` entity id names, or null for QIDs. */
export function entityTypeOf(id: string): AnswerType | null {
  const match = /^(?:fx\.)?x\.([a-z_]+)\./.exec(id);
  return match ? (match[1] as AnswerType) : null;
}
