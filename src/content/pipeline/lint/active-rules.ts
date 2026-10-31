/**
 * Active items, re-checked on every content:check (CONTENT_GUIDE §9.9,
 * ARCHITECTURE §5.2: "active: the acceptance rule below and a clean lint").
 *
 * content:decide applies the acceptance rule when an editor accepts. CI runs
 * only content:check, so an item whose file says `status: "active"` must
 * prove the same thing here: checkers independent of the writer, the editor
 * and each other, the verdicts and evidence of §9.9, a clean lint, a dedupe
 * verdict other than duplicate, a clean myths screen, and checks that were
 * recorded against the item as it stands now (its packetSha256 values).
 *
 * Myth hits are taken from the stored screen and from the current myths
 * list, and `cleared` is recomputed from the checks, never read from the file.
 */
import type { Mystery } from "../../schema/items.ts";
import { acceptanceFailures, mythCleared } from "../acceptance.ts";
import type { Bank, BankItem } from "../bank.ts";
import { batchForItem, parseItemId } from "../ids.ts";
import { mysteryKeys } from "../mystery-keys.ts";
import { changedSinceChecks } from "../packets.ts";
import { mythMatches } from "../references.ts";
import type { RuleHit } from "./types.ts";

function c01(message: string): RuleHit {
  return { rule: "C01", severity: "error", path: "verification", message };
}

/**
 * C01 findings for one active item. `lintClean` says whether this run found
 * no other error for it.
 */
export function activeItemHits(
  bank: Bank,
  record: BankItem,
  lintClean: boolean,
): RuleHit[] {
  const item = record.item;
  if (item.status !== "active") return [];
  const v = item.verification;
  const editor = v?.editor;
  // A missing record, editor, dedupe, myths screen or lint is a schema
  // problem the loader already reported.
  if (!v || !editor || !v.dedupe || !v.mythsScreen || !v.lint) return [];
  const parsed = parseItemId(record.id);
  const batch =
    parsed && bank.register ? batchForItem(bank.register, parsed) : null;

  const pairs = new Map<string, { claimId: string; mythId: string }>();
  for (const hit of v.mythsScreen.hits)
    pairs.set(`${hit.claimId}|${hit.mythId}`, hit);
  for (const claim of item.claims) {
    for (const myth of bank.references.myths) {
      if (mythMatches(myth, claim.text))
        pairs.set(`${claim.id}|${myth.id}`, {
          claimId: claim.id,
          mythId: myth.id,
        });
    }
  }
  const mythHits = [...pairs.values()].map((hit) => ({
    ...hit,
    cleared: mythCleared(item, hit.claimId),
  }));

  const mystery = "kind" in item && item.kind === "mystery";
  const failures = acceptanceFailures({
    item,
    batch,
    editor: editor.editor,
    decidedAt: editor.decidedAt,
    lintPassed: v.lint.passed && lintClean,
    dedupe: v.dedupe,
    mythHits,
    ...(mystery ? { answerKeys: mysteryKeys(bank, item as Mystery) } : {}),
  });
  const hits = failures.map((failure) =>
    c01(`an active item must pass the acceptance rule (§9.9): ${failure}`),
  );
  for (const pass of changedSinceChecks(record.id, item)) {
    hits.push(
      c01(
        `the item changed after pass ${pass} was recorded; rebuild packets and re-check (§9.7)`,
      ),
    );
  }
  return hits;
}
