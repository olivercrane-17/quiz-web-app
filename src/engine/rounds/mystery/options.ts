/**
 * The four options of a Mystery's last clues (PRD §4.1.2, ARCHITECTURE
 * §4.4.1, §5.5, §8.8): the primary answer and the three distractors, in
 * the attempt's stored shuffle, naming no entity id.
 *
 * - **Order.** `order[i]` is the option shown at display index `i`, as an
 *   index into `[answer, ...distractors]`, so `order[i] === 0` marks the
 *   key. Sealed play stores it per attempt and round (`JudgeContext.shuffle`;
 *   SQL keeps it as four digits); without one it comes from the round's
 *   forked rng.
 * - **Labels.** Each option shows its entity's `display`, unless any of the
 *   four would show a bracket ("Michael Collins (astronaut)"): then all four
 *   take their `optionLabel` ("Name (descriptor)"), so the key is never the
 *   only option with a qualifier (CONTENT_GUIDE §2.10 rule 6).
 */
import type { EntityId } from "../../types/ids.ts";
import type { MysteryContent } from "../../types/content.ts";
import type { EntityLookup, JudgeContext } from "../types.ts";

export const OPTION_COUNT = 4;

/** True for a permutation of 0 to 3. */
export function isOptionOrder(order: readonly number[]): boolean {
  if (order.length !== OPTION_COUNT) return false;
  return [0, 1, 2, 3].every((i) => order.includes(i));
}

/** The stored shuffle when there is one, else a draw from the round's rng. */
export function optionOrder(
  ctx: Pick<JudgeContext, "shuffle" | "rng">,
): number[] {
  if (ctx.shuffle !== null) {
    if (!isOptionOrder(ctx.shuffle)) {
      throw new RangeError(
        "mystery: the stored shuffle must be a permutation of 0 to 3",
      );
    }
    return [...ctx.shuffle];
  }
  return ctx.rng.shuffle([0, 1, 2, 3]);
}

/** The four option entities in source order: the answer, then the distractors. */
export function sourceOptions(content: MysteryContent): EntityId[] {
  return [content.answer, ...content.distractors];
}

/** The entity shown at display index `index`. */
export function optionEntity(
  content: MysteryContent,
  order: readonly number[],
  index: number,
): EntityId | null {
  const source = order[index];
  return source === undefined ? null : (sourceOptions(content)[source] ?? null);
}

/** A bracketed qualifier, as in "Queen (band)" or "Heat (1995)". */
export function showsBracket(label: string): boolean {
  return /[()]/.test(label);
}

/**
 * The labels in display order: every `display`, or every `optionLabel`
 * when any display shows a bracket. Throws when an option's entity is not
 * an active entry of the lookup, a content error that the release check
 * (`verify_release`) and lint C14 keep out of scheduled Dailies.
 */
export function optionLabels(
  content: MysteryContent,
  order: readonly number[],
  entities: EntityLookup | null,
): string[] {
  if (entities === null) {
    throw new Error("mystery: labelling the options needs the answer list");
  }
  const records = order.map((source) => {
    const id = sourceOptions(content)[source];
    const record = id === undefined ? null : entities.get(id);
    if (record === null || record === undefined) {
      throw new Error(
        `mystery ${content.id}: option ${String(source)} is not an active list entry`,
      );
    }
    return record;
  });
  const labelAll = records.some((record) => showsBracket(record.display));
  return records.map((record) =>
    labelAll ? record.optionLabel : record.display,
  );
}
