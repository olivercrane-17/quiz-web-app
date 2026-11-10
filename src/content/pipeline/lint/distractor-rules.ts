/**
 * X35 (RITE round 3, R3-04): a clue-4 option that contradicts clue 3 where
 * the lint can tell.
 *
 * The four options appear with clue 4, after the player has read clues 1 to
 * 3. An option that breaks a rule clue 3 states about the name itself is out
 * at a glance, so clue 4 becomes a pick among fewer than four. Round 3's
 * Mystery 3 asked for a name that "begins and ends with the letter A" and
 * then offered Arvenna beside Belloria, Cassova and Dravenor: every persona
 * saw the only A at once. Each distractor still has to contradict one of
 * clues 1 to 3 (CONTENT_GUIDE §2.7's uniqueness claim), but by what it is,
 * not by how it is spelled on the button.
 *
 * Only rules about the letters of the name are machine-checkable, so only
 * those are read, and only from clue 3, the clue just before the options:
 *
 * - "its name begins (or starts) with A", "with the letters Ar";
 * - "ends with A";
 * - "begins and ends with the letter A";
 * - "has a double N" (or "a double letter");
 * - "has seven letters".
 *
 * A clue that states none of these is not read, and the rule says nothing.
 * Letters compare case- and accent-blind, on the entity's name (the display
 * form's qualifier is not part of a name). A warning: the parse can't be
 * sure it understood the clue, so an editor reads each finding.
 */
import type { Mystery } from "../../schema/items.ts";
import type { Bank } from "../bank.ts";
import { foldName } from "../text.ts";
import type { RuleHit } from "./types.ts";

/** A rule clue 3 states about the letters of a name. */
export interface LetterRule {
  /** What the rule asks, in words safe to print: no letter or name. */
  readonly kind: "starts" | "ends" | "double" | "length";
  /** True when the name keeps the rule. */
  holds(name: string): boolean;
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

/** A name's letters alone, folded: "Évrenne" is "evrenne", "Saint Orlen" "saintorlen". */
function lettersOf(name: string): string {
  return foldName(name).replace(/[^\p{L}]/gu, "");
}

/** The letters a clue names ("A", "the letter A", "the letters Ar"), folded. */
const LETTERS = String.raw`(?:the\s+letters?\s+)?["“'‘]?([A-Z][A-Za-z]{0,2})["”'’]?(?![A-Za-z])`;
/** The clue speaks of the name or the title: "Its name", "This country's name". */
const SUBJECT = String.raw`\b(?:name|title)\b[^.;]*?`;

const BEGINS_AND_ENDS = new RegExp(
  `${SUBJECT}\\b(?:begins|starts)\\s+and\\s+ends\\s+with\\s+${LETTERS}`,
);
const BEGINS = new RegExp(
  `${SUBJECT}\\b(?:begins|starts)\\s+with\\s+${LETTERS}`,
);
const ENDS = new RegExp(
  `${SUBJECT}\\b(?:ends|finishes)\\s+(?:in|with)\\s+${LETTERS}`,
);
const DOUBLE = /\bdouble\s+(?:([A-Z])(?![A-Za-z])|letter\b)/;
const LENGTH = new RegExp(
  `${SUBJECT}\\bhas\\s+(\\d{1,2}|${Object.keys(NUMBER_WORDS).join("|")})\\s+letters\\b`,
  "i",
);

function startsRule(letters: string): LetterRule {
  const want = lettersOf(letters);
  return { kind: "starts", holds: (name) => lettersOf(name).startsWith(want) };
}

function endsRule(letters: string): LetterRule {
  const want = lettersOf(letters);
  return { kind: "ends", holds: (name) => lettersOf(name).endsWith(want) };
}

/** The letter rules a clue states about the name, in the order above. */
export function letterRules(clue: string): LetterRule[] {
  const rules: LetterRule[] = [];
  const both = BEGINS_AND_ENDS.exec(clue);
  if (both?.[1] !== undefined) {
    rules.push(startsRule(both[1]), endsRule(both[1]));
  } else {
    const begins = BEGINS.exec(clue);
    if (begins?.[1] !== undefined) rules.push(startsRule(begins[1]));
    const ends = ENDS.exec(clue);
    if (ends?.[1] !== undefined) rules.push(endsRule(ends[1]));
  }
  const double = DOUBLE.exec(clue);
  if (double !== null) {
    const letter = double[1]?.toLowerCase();
    rules.push({
      kind: "double",
      holds: (name) => {
        const letters = lettersOf(name);
        for (let i = 1; i < letters.length; i += 1) {
          if (
            letters[i] === letters[i - 1] &&
            (letter === undefined || letters[i] === letter)
          ) {
            return true;
          }
        }
        return false;
      },
    });
  }
  const length = LENGTH.exec(clue);
  if (length?.[1] !== undefined) {
    const raw = length[1].toLowerCase();
    const count = NUMBER_WORDS[raw] ?? Number(raw);
    rules.push({
      kind: "length",
      holds: (name) => lettersOf(name).length === count,
    });
  }
  return rules;
}

const WORDS: Readonly<Record<LetterRule["kind"], string>> = {
  starts: "start with the letters clue 3 names",
  ends: "end with the letters clue 3 names",
  double: "hold the double letter clue 3 names",
  length: "have as many letters as clue 3 says",
};

/** The clue that comes with the options, at launch's options_from_clue of 4. */
const OPTIONS_CLUE = 4;

/** X35: every clue-4 option keeps the letter rules clue 3 states. */
export function ruleX35(bank: Bank, mystery: Mystery): RuleHit[] {
  const clue = mystery.clues[OPTIONS_CLUE - 2];
  if (clue === undefined) return [];
  const rules = letterRules(clue);
  if (rules.length === 0) return [];
  const list = bank.lists.get(mystery.answerType);
  const answer = list?.entities.get(mystery.answer);
  // A rule the answer itself breaks is one the parse misread: say nothing.
  if (answer === undefined) return [];
  const read = rules.filter((rule) => rule.holds(answer.name));
  const hits: RuleHit[] = [];
  mystery.distractors.forEach((id, index) => {
    const entity = list?.entities.get(id);
    if (entity === undefined) return;
    const broken = read.find((rule) => !rule.holds(entity.name));
    if (broken === undefined) return;
    hits.push({
      rule: "X35",
      severity: "warn",
      path: `distractors[${index}]`,
      message: `distractor ${index + 1} doesn't ${WORDS[broken.kind]}, so it is out at a glance when the options appear: pick options that fit what clue 3 says of the name (RITE round 3, R3-04)`,
      excerpt: entity.name,
    });
  });
  return hits;
}
