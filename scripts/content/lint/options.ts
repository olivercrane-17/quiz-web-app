/**
 * C28, option display parity (CONTENT_GUIDE §2.13, §2.10 rule 6, §5.5). The
 * four clue-4 options are labelled as the server labels them (ARCHITECTURE
 * §5.5, the engine's `optionLabels`): every option shows its `display`,
 * unless any display shows a bracket, and then all four take their option
 * label ("Name (descriptor)" for people, TV series and music artists, the
 * display for every other type). The four labels must agree: each kind of
 * qualifier (a bracket, a ", Country" tail, a spaced hyphen) is on all four
 * or on none, so the key is never the only option that looks different.
 *
 * C28 supersedes the pipeline's X02 warning, which looked at the answer's
 * display alone.
 */
import type { AnswerEntity } from "../../../src/content/schema/answer-lists.ts";
import type { Mystery } from "../../../src/content/schema/items.ts";
import type { Bank } from "../../../src/content/pipeline/bank.ts";
import type { RuleHit } from "../../../src/content/pipeline/lint/types.ts";
import { showsBracket } from "../../../src/engine/rounds/mystery/options.ts";

/** The types whose option label adds the descriptor (ARCHITECTURE §5.5). */
const DESCRIBED_TYPES = new Set(["person", "tv_series", "music_artist"]);

/** The option label the release writes for an entry (scripts/content/lib/project.ts). */
export function optionLabelFor(type: string, entity: AnswerEntity): string {
  if (!DESCRIBED_TYPES.has(type)) return entity.display;
  const descriptor = (entity.qualifier as { descriptor?: unknown }).descriptor;
  return typeof descriptor === "string" && descriptor !== ""
    ? `${entity.name} (${descriptor})`
    : entity.display;
}

/** The labels the four options would show, answer first. */
export function serverLabels(type: string, entities: AnswerEntity[]): string[] {
  const labelAll = entities.some((entity) => showsBracket(entity.display));
  return entities.map((entity) =>
    labelAll ? optionLabelFor(type, entity) : entity.display,
  );
}

const QUALIFIERS: readonly [string, (label: string) => boolean][] = [
  ["a bracket", (label) => showsBracket(label)],
  ["a ', Country' qualifier", (label) => /, \S/.test(label)],
  ["a spaced hyphen", (label) => / [-\u2010-\u2015] /.test(label)],
];

/** C28 for one mystery. Silent when an option isn't on the list (C14 says so). */
export function ruleC28(bank: Bank, mystery: Mystery): RuleHit[] {
  const list = bank.lists.get(mystery.answerType);
  if (!list) return [];
  const entities: AnswerEntity[] = [];
  for (const id of [mystery.answer, ...mystery.distractors]) {
    const entity = list.entities.get(id);
    if (!entity) return [];
    entities.push(entity);
  }
  const labels = serverLabels(mystery.answerType, entities);
  const hits: RuleHit[] = [];
  for (const [what, test] of QUALIFIERS) {
    const marked = labels.map(test);
    const count = marked.filter(Boolean).length;
    if (count === 0 || count === labels.length) continue;
    const keyAlone = marked[0] === true && count === 1;
    const odd = marked.findIndex((value) => value !== marked[0]);
    hits.push({
      rule: "C28",
      severity: "error",
      path: keyAlone
        ? "answer"
        : odd <= 0
          ? "distractors"
          : `distractors[${odd - 1}]`,
      message: keyAlone
        ? `the answer is the only clue-4 option with ${what}, which gives it away (§2.10 rule 6, §5.5)`
        : `${count} of the four clue-4 options show ${what}; all four agree or none does (§2.10 rule 6, ARCHITECTURE §5.5)`,
    });
  }
  return hits;
}
