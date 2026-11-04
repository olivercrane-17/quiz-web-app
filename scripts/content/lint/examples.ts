/**
 * C22's sealed-pool rules (CONTENT_GUIDE §2.13, §12.0). The guide is public,
 * so a Daily or room item must never be one of its examples:
 *
 * - a sealed item (mystery, encore or room question) whose nearest guide
 *   example scores at or above the dedupe flag is an error, where a
 *   plaintext item's near-copy stays the pipeline's warning;
 * - a sealed mystery whose answer is one of the ten §12.7 answers
 *   (content/reference/example-denylist.json) is an error;
 * - a sealed encore whose answer and unit equal one of the ten §12.9 values
 *   is a warning, which the editor clears with a lintAllow only when it
 *   measures something else.
 *
 * Messages never name the example: next to a sealed id that would say what
 * the sealed item is about, in logs anyone can read (ARCHITECTURE §5.4).
 * The excerpt names it, and reporters show excerpts of sealed items only
 * with --reveal.
 */
import type { AnyItem } from "../../../src/content/schema/items.ts";
import type { Bank } from "../../../src/content/pipeline/bank.ts";
import {
  DEDUPE_FLAG,
  nearestTo,
} from "../../../src/content/pipeline/dedupe.ts";
import { bankDedupeIndex } from "../../../src/content/pipeline/lint/index.ts";
import type { RuleHit } from "../../../src/content/pipeline/lint/types.ts";
import type { LintReferences } from "./reference.ts";

const isGuide = (entry: { id: string }) => entry.id.startsWith("guide:");

/** A sealed item's guide near-copy, and whether it is also its nearest item overall. */
export interface GuideCopy {
  hit: RuleHit;
  /**
   * True when the guide example is the item's nearest entry of all, so the
   * pipeline's C22 warning is about the same pair and this error replaces
   * it; otherwise that warning names another pair and stays.
   */
  samePair: boolean;
}

/** Sealed items that are near-copies of a guide example, with the example's id. */
export function guideCopies(bank: Bank): Map<string, GuideCopy> {
  const out = new Map<string, GuideCopy>();
  if (!bank.items.some((record) => record.file.sealed)) return out;
  const { index, positions } = bankDedupeIndex(bank, true);
  for (const record of bank.items) {
    if (!record.file.sealed) continue;
    const position = positions.get(record.id);
    if (position === undefined) continue;
    const match = nearestTo(index, position, isGuide);
    if (match.nearestId === null || match.score < DEDUPE_FLAG) continue;
    const overall = nearestTo(index, position);
    out.set(record.id, {
      hit: {
        rule: "C22",
        severity: "error",
        message:
          "a sealed item may not be a near-copy of a CONTENT_GUIDE §12 example, which is public (§12.0); content:dedupe -- --item <id> --reveal shows which, in your own terminal",
        excerpt: match.nearestId.replace(/^guide:/, ""),
      },
      samePair: overall.nearestId === match.nearestId,
    });
  }
  return out;
}

/** The example-denylist hits for one sealed item. */
export function deniedExampleHits(
  item: AnyItem,
  refs: Pick<LintReferences, "deniedAnswers" | "deniedValues">,
): RuleHit[] {
  if (!("kind" in item)) return [];
  if (item.kind === "mystery") {
    const denied = refs.deniedAnswers.get(item.answerType);
    if (denied?.has(item.answer)) {
      return [
        {
          rule: "C22",
          severity: "error",
          path: "answer",
          message:
            "the answer is one of CONTENT_GUIDE §12.7's, which content/reference/example-denylist.json bars from Dailies (§12.0)",
        },
      ];
    }
  } else if (item.kind === "encore") {
    const unit = item.unit.trim().toLowerCase();
    const value = refs.deniedValues.find(
      (entry) =>
        entry.answer === item.answer && entry.unit.toLowerCase() === unit,
    );
    if (value) {
      return [
        {
          rule: "C22",
          severity: "warn",
          path: "answer",
          message:
            "the answer and unit equal a CONTENT_GUIDE §12.9 value (content/reference/example-denylist.json); the editor clears it only if it measures something else (§12.0)",
          excerpt: value.example,
          match: value.example,
        },
      ];
    }
  }
  return [];
}
