/**
 * Batch incidents (CONTENT_GUIDE §9.6, §11.3). A fabricated source fails the
 * whole batch: the editor rejects it, fresh checkers re-check every item in
 * it, and the incident goes in the register.
 *
 * `content:batch -- incident --kind fabricated_source` therefore voids the
 * A, B and T records of every item that is not yet active (a voided checking
 * item goes back to draft, keeping its estimate, since the item itself did
 * not change), and stores everyone who had checked an item of the batch in
 * the incident's `checkers`. content:record refuses those checkers for the
 * batch from then on. Items already active cannot be re-checked in place;
 * they are listed for the editor's re-check under §9.10.
 */
import type { AnyItem } from "../schema/items.ts";
import type { Bank } from "./bank.ts";
import { cloneJson } from "./json.ts";
import { batchItems } from "./register.ts";

export interface VoidedChecks {
  /** Items whose checks were voided, ready for saveItems. */
  updates: Map<string, AnyItem>;
  /** Every checker of an item of the batch, active items included. */
  checkers: string[];
  /** Active items: they keep their checks and need a §9.10 re-check. */
  active: string[];
}

export function voidBatchChecks(bank: Bank, batchId: string): VoidedChecks {
  const updates = new Map<string, AnyItem>();
  const checkers = new Set<string>();
  const active: string[] = [];
  for (const record of batchItems(bank, batchId)) {
    const item = record.item;
    const v = item.verification;
    const records = [
      ...(v?.checks ?? []),
      ...(v?.tiebreak ? [v.tiebreak] : []),
    ];
    for (const check of records) checkers.add(check.checker);
    if (item.status === "active") {
      active.push(record.id);
      continue;
    }
    if (item.status !== "draft" && item.status !== "checking") continue;
    if (!v || records.length === 0) continue;
    const next = cloneJson(item);
    if (next.verification) {
      next.verification.checks = [];
      next.verification.tiebreak = null;
    }
    if (next.status === "checking") next.status = "draft";
    updates.set(record.id, next);
  }
  return { updates, checkers: [...checkers].sort(), active };
}
