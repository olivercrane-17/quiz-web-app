/**
 * `/about-our-questions` (PRD §3.14; CONTENT_GUIDE Appendix A item 2,
 * §0.2, §3.4, §9; decisions memo §10, §15, §18): CONTENT_GUIDE's wording
 * first, then an honest account of how a question is made: AI-assisted
 * drafting, two independent fact-checks (the second on a different model
 * wherever the model can be chosen: no check record names its model yet),
 * evidence, including memo §18's path for a risky fact that no dataset
 * covered once the web searches had run out, tiebreaks with published
 * sources, an editor, the Daily's extra check and the audits; nothing that
 * changes often, and review dates for the few facts that could drift; how
 * to report; how corrections and rescoring work. Plain and factual: we
 * never market Knewt as AI.
 *
 * The lede keeps AC-LGL-02's sentence word for word, though memo §18 let
 * most of the practice bank's risky facts pass on both checkers' certain
 * knowledge alone. The Evidence step says so, and the launch report asks
 * the product team for a truthful sentence in PRD §3.14, AC-LGL-02 and
 * CONTENT_GUIDE Appendix A item 2. When it lands, change
 * `QUESTIONS_PROMISE` and the AC-LGL-02 tests together.
 */
import type { FeatureFlag } from "@/config/features";
import { VOIDED_MYSTERY_POINTS } from "@/engine/scoring/mystery";
import { SHELL_COPY } from "@/features/shell";

import { legalDate, sectionHref, type LegalDocument } from "../document";

/** CONTENT_GUIDE Appendix A, item 2, word for word (AC-LGL-02). */
export const QUESTIONS_PROMISE =
  "Questions are drafted with AI assistance. Each one is accepted only after two independent checks, and any fact that is uncertain or easy to get wrong is checked against published data or sources.";

export function aboutOurQuestionsDocument(
  _flags: (flag: FeatureFlag) => boolean,
): LegalDocument {
  return {
    path: "/about-our-questions",
    title: SHELL_COPY.legal.aboutOurQuestions,
    updated: legalDate("2026-11-05"),
    lede: [
      QUESTIONS_PROMISE,
      "Here is what that means in practice, and what happens when we get one wrong.",
    ],
    sections: [
      {
        id: "how",
        heading: "How a question is made",
        blocks: [
          {
            kind: "list",
            ordered: true,
            items: [
              "**Drafting.** An AI model drafts each question under our written guide and lists every fact it rests on. A draft the writer can't stand behind is dropped before anyone checks it.",
              "**Two independent checks.** Two separate fact-checkers each see the question cold, with no notes from the writer or from each other. One confirms every fact. The other tries to break the question, hunting for a second right answer, an outdated fact, a reading that only works in one country, or a clue that gives it away. Wherever we can choose the model, the second check runs on a different AI model from the writer and the first check, because models that learned from the same text tend to make the same mistakes.",
              "**Evidence.** A checker's own knowledge counts only when they're certain. Facts that live in open datasets, such as capitals, chemical elements, Nobel Prizes and World Cup results, are checked against those datasets, which our [credits](/credits) list. When no dataset covers a fact that is easy to get wrong and our web searches have run out, the fact can still pass if both checkers, working separately, are certain of it. Most of our practice questions have at least one fact that passed this way. Every one of them can come up in the audits below, which check a random sample again with web searches.",
              "**Tiebreaks.** When the two checks disagree, or either has a doubt, a third check settles it with published data or a web search. If it can't, the question is cut.",
              "**An editor.** An editor reads the question and both checks before accepting it. Questions that fall short are rewritten or cut, and any change to what you'd see goes back for a fresh check.",
              "**One more check for the Daily.** Before a Daily is locked, a separate check, on a different model where we can, goes over every clue and number in it again against published sources.",
              "**Audits.** Before launch, and every month after, an auditor checks a random sample of questions again with web searches, mixed with mistakes we planted on purpose. Catching the planted ones shows the checks work, and a real error found sends its whole batch back to be checked.",
            ],
          },
          {
            kind: "p",
            text: "Every role in that list, from writer to editor, is played by an AI model, each a separate run with one job. People at Knewt write the rules they follow, and each week they look at every exception the process flags, along with a random sample of the questions it accepted.",
          },
        ],
      },
      {
        id: "timeless",
        heading: "What we leave out",
        blocks: [
          {
            kind: "p",
            text: "We leave out facts that change often, such as who holds an office or a title, records that can still be broken, prices and populations. We ask about a country's capital only when it is single and settled. The few facts we use that could still drift, such as where an organisation has its headquarters, carry a review date, and each gets a fresh check when that date arrives.",
          },
          {
            kind: "p",
            text: "We also avoid questions that only make sense in one country, and wherever English spellings differ, both count.",
          },
        ],
      },
      {
        id: "answers",
        heading: "Answers and suggestions",
        blocks: [
          {
            kind: "p",
            text: "A Mystery's answer comes from a closed list for its kind of answer: countries, films, people, animals and so on. You see the same suggestions every day, so they never hint at the day's answer. The lists draw on open data from Unicode CLDR, GeoNames, the Museum of Modern Art and Tate, among others, and our [credits](/credits) name every source.",
          },
          {
            kind: "p",
            text: "Each answer's **Learn more** link opens a Wikipedia search for it. We build those links rather than typing them, so none can point somewhere made up.",
          },
        ],
      },
      {
        id: "report",
        heading: "When you spot a mistake",
        blocks: [
          {
            kind: "p",
            text: "Every reveal and explanation has **Report a problem**. Tell us what's wrong; on a Mystery you can also say your guess should have counted. We read every report, and the [content policy](/content-policy) says how quickly.",
          },
          {
            kind: "p",
            text: "When reports point at one of our answers, a fresh check looks at the claim again with published sources. If we got it wrong:",
          },
          {
            kind: "list",
            items: [
              `**A Daily Mystery** is withdrawn, and everyone who played that Daily gets ${VOIDED_MYSTERY_POINTS} points for it. Anyone who hasn't reached it yet skips it, with a note saying why.`,
              "**If the right answer was one of the four options** on the last clue, we may correct the answer instead and check every finished game against it again.",
              "**A withdrawn Encore** drops out of that day's ranking, so ties fall to time.",
              "**A practice question** comes out of play, and the fix arrives with the next update.",
              "**A guess that should have counted** goes to the queue for our answer lists. If it's a fair answer, it joins its list, and earlier guesses of it are scored again.",
            ],
          },
          {
            kind: "p",
            text: `Scores, percentiles, challenges and Group boards are updated, and you'll see a one-time note. Streaks never change because of a correction. [How scoring works](${sectionHref("/how-scoring-works", "corrections")}) has the details.`,
          },
        ],
      },
    ],
  };
}
