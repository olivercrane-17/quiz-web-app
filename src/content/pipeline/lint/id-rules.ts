/**
 * C24: id pattern, a registered batch that issued the id (to this writer,
 * when one is named), no fixture ids in the bank, and none of the guide's
 * reserved example ids anywhere under content/.
 */
import { PACK_IDS } from "../../schema/primitives.ts";
import type { AnswerList } from "../../schema/answer-lists.ts";
import type { Bank, BankItem } from "../bank.ts";
import {
  batchForItem,
  isReservedExampleId,
  parseBatchId,
  parseItemId,
} from "../ids.ts";
import type { RuleHit } from "./types.ts";

export function ruleC24(
  bank: Bank,
  record: BankItem,
  writer?: string,
): RuleHit[] {
  const hits: RuleHit[] = [];
  const add = (message: string) =>
    hits.push({ rule: "C24", severity: "error", path: "id", message });
  const parsed = parseItemId(record.id);
  if (!parsed) {
    add(`${record.id} matches no id pattern (§2.12)`);
    return hits;
  }
  const fixtures = bank.layout.kind === "fixtures";
  if (fixtures && !parsed.fixture)
    add("fixture ids start with fx. (ARCHITECTURE §5.6)");
  if (!fixtures && parsed.fixture)
    add(
      "fx. ids are fixtures and never belong in the content bank (ARCHITECTURE §5.6)",
    );
  if (isReservedExampleId(parsed)) {
    add(
      "batch 00 and room sequences 90 to 99 are reserved for CONTENT_GUIDE examples (§2.12)",
    );
  }
  if (parsed.sequence === 0) add("sequences start at 01 (§2.12)");
  if (
    parsed.pool === "room" &&
    !fixtures &&
    !(PACK_IDS as readonly string[]).includes(String(parsed.packId))
  ) {
    add(`${String(parsed.packId)} is not one of the eight room packs (§10.9)`);
  }
  if (
    (parsed.pool === "practice" || parsed.pool === "mystery") &&
    parsed.category !== record.item.category
  ) {
    add(
      `the id says ${String(parsed.category)} but the item's category is ${record.item.category}`,
    );
  }
  const register = bank.register;
  if (!register) {
    if (!fixtures)
      add("no batch register to check the id against (content/batches.json)");
    return hits;
  }
  const batch = batchForItem(register, parsed);
  if (!batch) {
    add("its batch is not in the register; ask the editor to open one (§11.3)");
    return hits;
  }
  if (batch.status === "planned")
    add(`batch ${batch.batchId} is planned but not open (§11.3)`);
  if (parsed.sequence > batch.lastSequence) {
    add(
      `batch ${batch.batchId} has issued ids up to ${batch.lastSequence}; take ids with content:batch -- ids (§11.3)`,
    );
  }
  if (writer !== undefined && batch.writer !== writer) {
    add(
      `batch ${batch.batchId} is registered to ${batch.writer ?? "nobody"}, not ${writer} (§11.3)`,
    );
  }
  return hits;
}

/** C24 for answer-list entities: fixture ids and recorded sources. */
export function entityIdHits(bank: Bank, list: AnswerList): RuleHit[] {
  const hits: RuleHit[] = [];
  const fixtures = bank.layout.kind === "fixtures";
  const datasetKeys = new Set(
    bank.manifest?.datasets.map((dataset) => dataset.key) ?? [],
  );
  list.entities.forEach((entity, index) => {
    const path = `entities[${index}]`;
    if (!fixtures && entity.id.startsWith("fx.")) {
      hits.push({
        rule: "C24",
        severity: "error",
        path: `${path}.id`,
        message: "fx. ids are fixtures and never belong in the content bank",
      });
    }
    const source = entity.source.trim();
    const batchId = /^l\.[a-z_]+\.b\d{2}/.exec(source)?.[0];
    if (batchId) {
      const parsed = parseBatchId(batchId);
      const registered = bank.register?.batches.some(
        (batch) => batch.batchId === batchId,
      );
      if (!parsed || (bank.register && !registered)) {
        hits.push({
          rule: "C24",
          severity: "warn",
          path: `${path}.source`,
          message: `${batchId} is not a registered list batch`,
        });
      }
    } else if (!fixtures) {
      const key = /^[a-z0-9-]+/.exec(source)?.[0] ?? "";
      if (!datasetKeys.has(key)) {
        hits.push({
          rule: "C24",
          severity: "warn",
          path: `${path}.source`,
          message:
            "source names neither a list batch (l.<type>.bNN) nor a dataset key from content/datasets/manifest.json",
          excerpt: source,
        });
      }
    }
  });
  return hits;
}
