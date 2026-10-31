/**
 * What counts as a mystery's answer in a checker's cold solve, shared by
 * content:record (records.ts) and the acceptance rule (acceptance.ts).
 *
 * The candidates a checker lists are sealed content: callers count them and
 * never print them.
 */
import type { Mystery } from "../schema/items.ts";
import type { ColdSolve } from "../schema/verification.ts";
import type { Bank } from "./bank.ts";
import { foldName } from "./text.ts";

/**
 * The answer and accepted ids, with their names, display forms and aliases,
 * folded the way the suggestion box folds them.
 */
export function mysteryKeys(bank: Bank, mystery: Mystery): Set<string> {
  const keys = new Set<string>();
  for (const id of [mystery.answer, ...mystery.accepted]) {
    keys.add(foldName(id));
    const entity = bank.lists.get(mystery.answerType)?.entities.get(id);
    if (entity)
      for (const name of [entity.name, entity.display, ...entity.aliases])
        keys.add(foldName(name));
  }
  return keys;
}

export function isMysteryKey(
  keys: ReadonlySet<string>,
  candidate: string,
): boolean {
  return keys.has(foldName(candidate));
}

/**
 * The candidates a cold solve still held after clue 3 that are not the
 * answer: rivals that fit clues 1 to 3, by the checker's own account. The
 * clue-3 list is the uniqueness test (§9.4 step 1, §9.9 rule 4).
 */
export function rivalsAfterClue3(
  keys: ReadonlySet<string>,
  coldSolve: ColdSolve,
): string[] {
  if (!("perClue" in coldSolve)) return [];
  const step = coldSolve.perClue.find((entry) => entry.clue === 3);
  return (
    step?.candidates.filter((candidate) => !isMysteryKey(keys, candidate)) ?? []
  );
}
