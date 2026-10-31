/**
 * Mystery rules: C12 (giveaways), C13 (clue 4 and the display form), C14
 * (list coverage and the freeze), X01 (answer type and category) and X02
 * (parallel clue-4 display forms).
 */
import type { AnswerEntity } from "../../schema/answer-lists.ts";
import { MYSTERY_ANSWER_TYPES } from "../../schema/categories.ts";
import type { Mystery } from "../../schema/items.ts";
import type { Bank } from "../bank.ts";
import { entityTypeOf } from "../ids.ts";
import { charCount, containsPhrase, foldName, foldedWords } from "../text.ts";
import type { RuleHit } from "./types.ts";

/** Significant words: 4 or more characters and not a stopword (§2.13, C12). */
function significant(words: string[], stopwords: Set<string>): string[] {
  return [
    ...new Set(
      words.filter((word) => word.length >= 4 && !stopwords.has(word)),
    ),
  ];
}

function entityOf(
  bank: Bank,
  mystery: Mystery,
  id: string,
): AnswerEntity | undefined {
  return bank.lists.get(mystery.answerType)?.entities.get(id);
}

/** C12: clue length and giveaways. */
export function ruleC12(bank: Bank, mystery: Mystery): RuleHit[] {
  const hits: RuleHit[] = [];
  const stopwords = bank.references.stopwords;
  const names: string[] = [];
  for (const id of [mystery.answer, ...mystery.accepted]) {
    const entity = entityOf(bank, mystery, id);
    if (entity) names.push(entity.name, ...entity.aliases);
  }
  const phrases = [
    ...new Set(names.map(foldName).filter((phrase) => phrase !== "")),
  ];
  const sigWords = significant(
    phrases.flatMap((phrase) => phrase.split(" ")),
    stopwords,
  );
  const giveaways = mystery.giveawayTerms
    .map(foldName)
    .filter((term) => term !== "");

  mystery.clues.forEach((clue, index) => {
    const path = `clues[${index}]`;
    const length = charCount(clue);
    if (length > 140) {
      hits.push({
        rule: "C12",
        severity: "error",
        path,
        message: `clue ${index + 1} has ${length} characters; the limit is 140 (§5.2 rule 9)`,
      });
    }
    const folded = foldName(clue);
    const words = folded === "" ? [] : folded.split(" ");
    const phrase = phrases.find((p) => containsPhrase(folded, p));
    if (phrase) {
      hits.push({
        rule: "C12",
        severity: "error",
        path,
        message: `clue ${index + 1} contains the answer's name or an alias (§5.2 rule 6)`,
        excerpt: phrase,
      });
    }
    const prefixed = words.find((word) =>
      sigWords.some((sig) => word.startsWith(sig)),
    );
    if (prefixed && !phrase) {
      hits.push({
        rule: "C12",
        severity: "error",
        path,
        message: `clue ${index + 1} has a word that is, or begins with, a significant word of the answer's name or an alias (§5.2 rule 6)`,
        excerpt: prefixed,
      });
    }
    const giveaway = giveaways.find(
      (term) =>
        containsPhrase(folded, term) ||
        (!term.includes(" ") && words.some((word) => word.startsWith(term))),
    );
    if (giveaway) {
      hits.push({
        rule: "C12",
        severity: "error",
        path,
        message: `clue ${index + 1} contains a giveaway term (§5.2 rule 6)`,
        excerpt: giveaway,
      });
    }
    if (!prefixed) {
      const near = words.find(
        (word) =>
          word.length >= 4 &&
          sigWords.some((sig) => sig.slice(0, 4) === word.slice(0, 4)),
      );
      if (near) {
        hits.push({
          rule: "C12",
          severity: "warn",
          path,
          message: `clue ${index + 1} has a word sharing its first four letters with the answer's name or an alias; the suggestion box matches prefixes (§5.2 rule 6)`,
          excerpt: near,
        });
      }
    }
  });
  return hits;
}

/** C13: clue 4 contains no significant word of the answer's display form. */
export function ruleC13(bank: Bank, mystery: Mystery): RuleHit[] {
  const entity = entityOf(bank, mystery, mystery.answer);
  if (!entity) return [];
  const sigWords = significant(
    foldedWords(entity.display),
    bank.references.stopwords,
  );
  const words = foldedWords(mystery.clues[3]);
  const found = words.find((word) =>
    sigWords.some((sig) => word === sig || word === `${sig}s`),
  );
  return found
    ? [
        {
          rule: "C13",
          severity: "error",
          path: "clues[3]",
          message:
            "clue 4 contains a word of the answer's display form, which the options show (§5.2 rule 7)",
          excerpt: found,
        },
      ]
    : [];
}

export interface FreezeUse {
  date: string;
  file: string;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * C14: every referenced entity exists, is active and is not replaced;
 * distractors distinct;
 * the list is big enough for the slot; a scheduled answer has passed the
 * 30-day freeze.
 */
export function ruleC14(
  bank: Bank,
  mystery: Mystery,
  scheduledOn: string[] = [],
): RuleHit[] {
  const hits: RuleHit[] = [];
  const add = (path: string, message: string, excerpt?: string) => {
    const out: RuleHit = { rule: "C14", severity: "error", path, message };
    if (excerpt !== undefined) out.excerpt = excerpt;
    hits.push(out);
  };
  const list = bank.lists.get(mystery.answerType);
  if (!list) {
    add("answerType", `there is no ${mystery.answerType} answer list (§2.10)`);
    return hits;
  }
  // A replaced entry never ships (ARCHITECTURE §5.5), so it counts as gone.
  const live = (entity: AnswerEntity) =>
    entity.status === "active" && entity.replacedBy == null;
  const active = [...list.entities.values()].filter(live).length;
  const needed = mystery.slot === 1 ? 30 : 100;
  if (active < needed) {
    add(
      "slot",
      `the ${mystery.answerType} list has ${active} active entries; Mystery ${mystery.slot} needs ${needed} (§2.10 rule 3)`,
    );
  }
  const check = (path: string, id: string, label: string) => {
    const entity = list.entities.get(id);
    if (!entity) {
      const other = entityTypeOf(id);
      add(
        path,
        other && other !== mystery.answerType
          ? `${label} is from the ${other} list, not ${mystery.answerType} (§5.5)`
          : `${label} is not in the ${mystery.answerType} list (§2.10 rule 4)`,
        id,
      );
      return;
    }
    if (entity.status !== "active")
      add(path, `${label} is retired in the ${mystery.answerType} list`, id);
    else if (entity.replacedBy != null)
      add(
        path,
        `${label} is replaced by another entry of the ${mystery.answerType} list, so it never ships (ARCHITECTURE §5.5)`,
        id,
      );
  };
  check("answer", mystery.answer, "the answer");
  mystery.accepted.forEach((id, i) =>
    check(`accepted[${i}]`, id, "an accepted equivalent"),
  );
  mystery.distractors.forEach((id, i) =>
    check(`distractors[${i}]`, id, "a distractor"),
  );
  mystery.rivals.forEach((rival, i) =>
    check(`rivals[${i}].id`, rival.id, "a rival"),
  );
  mystery.likelyGuesses.forEach((id, i) =>
    check(`likelyGuesses[${i}]`, id, "a likely guess"),
  );

  const keyIds = new Set([mystery.answer, ...mystery.accepted]);
  if (new Set(mystery.distractors).size !== mystery.distractors.length) {
    add("distractors", "the three distractors must be distinct (§2.7)");
  }
  mystery.distractors.forEach((id, i) => {
    if (keyIds.has(id))
      add(
        `distractors[${i}]`,
        "a distractor is the answer or an accepted equivalent (§2.7)",
        id,
      );
  });
  mystery.accepted.forEach((id, i) => {
    if (id === mystery.answer)
      add(
        `accepted[${i}]`,
        "accepted lists equivalents, not the answer itself (§2.7)",
        id,
      );
  });
  mystery.rivals.forEach((rival, i) => {
    if (keyIds.has(rival.id))
      add(`rivals[${i}].id`, "a rival cannot be the answer (§5.4)", rival.id);
  });

  const answer = list.entities.get(mystery.answer);
  if (answer) {
    const liveFrom = addDays(answer.addedIn, 30);
    for (const date of scheduledOn) {
      if (date < liveFrom) {
        add(
          "answer",
          `scheduled on ${date}, before the 30-day freeze ends on ${liveFrom} (§2.10 rule 5)`,
        );
      }
    }
  }
  return hits;
}

/** X01: the category's mystery answer types (§1). */
export function ruleX01(mystery: Mystery): RuleHit[] {
  const allowed = MYSTERY_ANSWER_TYPES[mystery.category];
  if (allowed === "any" || allowed.includes(mystery.answerType)) return [];
  return [
    {
      rule: "X01",
      severity: "warn",
      path: "answerType",
      message: `${mystery.category} mysteries use ${allowed.join(", ")} (§1); ${mystery.answerType} needs the editor's reason`,
    },
  ];
}

/** X02: the answer is never the only clue-4 option with a bracket or a qualifier. */
export function ruleX02(bank: Bank, mystery: Mystery): RuleHit[] {
  const ids = [mystery.answer, ...mystery.distractors];
  const displays = ids.map((id) => entityOf(bank, mystery, id)?.display);
  if (displays.some((display) => display === undefined)) return [];
  const bracket = (display: string) => /\(.+\)/.test(display);
  const comma = (display: string) => display.includes(", ");
  const [answer = "", ...others] = displays as string[];
  for (const [test, what] of [
    [bracket, "a bracket"],
    [comma, "a qualifier after a comma"],
  ] as const) {
    if (test(answer) && !others.some(test)) {
      return [
        {
          rule: "X02",
          severity: "warn",
          path: "distractors",
          message: `the answer is the only clue-4 option with ${what}, which gives it away (§2.10 rule 6)`,
        },
      ];
    }
  }
  return [];
}
