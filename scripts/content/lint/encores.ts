/**
 * C15's measured encores (CONTENT_GUIDE §2.13, §6 rule 3, §11.4). An encore
 * whose unit or unitShort is on the measured list of content/reference/
 * units.json (a length, area, mass or speed) is a measured encore, and those
 * are at most 1 in 10: one per batch of ten, 12 in the bank.
 *
 * The guide's batches hold 10 encores; the production register may plan
 * bigger ones, so a batch's cap is one per ten of its planned target (at
 * least one). Encores over a cap, taken in id order, are the ones reported.
 * Cut and retired encores don't count.
 */
import type { Encore } from "../../../src/content/schema/items.ts";
import type { Bank, BankItem } from "../../../src/content/pipeline/bank.ts";
import {
  batchForItem,
  parseItemId,
} from "../../../src/content/pipeline/ids.ts";
import type { RuleHit } from "../../../src/content/pipeline/lint/types.ts";
import type { MeasuredDimension } from "./reference.ts";

/** Measured encores the bank may hold (§6 rule 3). */
export const MEASURED_BANK_CAP = 12;

/** The dimension an encore's unit measures, or null when it measures none. */
export function measuredDimension(
  encore: Pick<Encore, "unit" | "unitShort">,
  measured: ReadonlyMap<string, MeasuredDimension>,
): MeasuredDimension | null {
  // unitShort is optional on a draft (CNT-1's schema).
  for (const unit of [encore.unit, encore.unitShort ?? ""]) {
    const dimension = measured.get(unit.trim().toLowerCase());
    if (dimension !== undefined) return dimension;
  }
  return null;
}

/** The C15 hits for every measured encore over a cap, by item id. */
export function measuredEncoreHits(
  bank: Bank,
  measured: ReadonlyMap<string, MeasuredDimension>,
): Map<string, RuleHit[]> {
  const out = new Map<string, RuleHit[]>();
  if (measured.size === 0) return out;
  const encores: { record: BankItem; dimension: MeasuredDimension }[] = [];
  for (const record of bank.items) {
    const item = record.item;
    if (!("kind" in item) || item.kind !== "encore") continue;
    if (item.status === "cut" || item.status === "retired") continue;
    const dimension = measuredDimension(item, measured);
    if (dimension !== null) encores.push({ record, dimension });
  }
  encores.sort((x, y) => (x.record.id < y.record.id ? -1 : 1));
  const add = (record: BankItem, message: string) =>
    out.set(record.id, [
      ...(out.get(record.id) ?? []),
      { rule: "C15", severity: "error", path: "unit", message },
    ]);

  const byBatch = new Map<string, BankItem[]>();
  const caps = new Map<string, number>();
  for (const { record } of encores) {
    const parsed = parseItemId(record.id);
    const batch =
      parsed && bank.register ? batchForItem(bank.register, parsed) : null;
    const key =
      batch?.batchId ??
      `e.b${String(parsed?.batchNumber ?? 0).padStart(2, "0")}`;
    byBatch.set(key, [...(byBatch.get(key) ?? []), record]);
    caps.set(key, Math.max(1, Math.floor((batch?.plan.target ?? 10) / 10)));
  }
  for (const [batchId, records] of byBatch) {
    const cap = caps.get(batchId) ?? 1;
    for (const record of records.slice(cap)) {
      add(
        record,
        `a measured encore (a length, area, mass or speed unit) over ${batchId}'s cap of ${cap}, one per ten encores (§6 rule 3)`,
      );
    }
  }
  for (const { record } of encores.slice(MEASURED_BANK_CAP)) {
    add(
      record,
      `a measured encore over the bank's cap of ${MEASURED_BANK_CAP} (§6 rule 3)`,
    );
  }
  return out;
}
