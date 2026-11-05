/**
 * `/about-our-questions` (PRD §3.14; CONTENT_GUIDE Appendix A item 2,
 * §0.2, §9; decisions memo §10, §15, §18): CONTENT_GUIDE's wording first,
 * then an honest account of how a question is made: AI-assisted drafting,
 * two independent fact-checks (the second on a different model), evidence,
 * tiebreaks with published sources, an editor, the Daily's extra check and
 * the audits; nothing time-sensitive; how to report; how corrections and
 * rescoring work. Plain and factual: we never market Knewt as AI.
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
              "**Two independent checks.** Two separate fact-checkers each see the question cold, with no notes from the writer or from each other. One confirms every fact. The other tries to break the question, hunting for a second right answer, an outdated fact, a reading that only works in one country, or a clue that gives it away. The second check runs on a different AI model from the writer and the first check, because models that learned from the same text tend to make the same mistakes.",
              "**Evidence.** A checker's own knowledge counts only when they're certain. Facts that live in open datasets, such as capitals, chemical elements, Nobel Prizes and World Cup results, are checked against those datasets, which our [credits](/credits) list.",
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
            text: "We leave out anything that can change, such as who holds an office, who holds a record, prices or populations. A question about how things stand today goes stale, so ours rest on facts that stay put.",
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
