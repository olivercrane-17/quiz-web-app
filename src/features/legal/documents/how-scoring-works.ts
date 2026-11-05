/**
 * `/how-scoring-works` (PRD §3.14): the How to play text (§3.1.3), which
 * the route passes in as the `how-to-play` slot from `@/features/daily`
 * rather than repeating it; Mystery points, and that a wrong guess costs
 * what Next clue costs; Encore bands and how "% off" is measured; the
 * ranking; the "so far today" percentile and its threshold; the
 * honest-play disclosure (PRD §3.14, kept to its intent), including the
 * bulk new-profile rule; time zones as decisions memo §14.1 rewrote them
 * (no 20-hour rule); practice, Blitz, Survival and room scoring; and
 * corrections.
 *
 * Tunable numbers come from `TUNABLES` and the worked examples from the
 * engine's own scoring, so the page can't drift from the rules. Blitz,
 * Survival and rooms appear when their flags are on.
 */
import type { FeatureFlag } from "@/config/features";
import { TUNABLES } from "@/config/tunables";
import { formatEncoreAmount } from "@/engine/encore";
import {
  BLITZ_BASE_POINTS,
  BLITZ_BONUS_WINDOW_MS,
  BLITZ_SPEED_POINTS,
} from "@/engine/scoring/blitz";
import { judgeEncoreGuess } from "@/engine/scoring/encore";
import { VOIDED_MYSTERY_POINTS, mysteryPoints } from "@/engine/scoring/mystery";
import { SHELL_COPY } from "@/features/shell";

import { legalDate, sectionHref, type LegalDocument } from "../document";

/** PRD §3.14's honest-play disclosure, word for word in intent (AC-LGL-02). */
export const HONEST_PLAY_DISCLOSURE =
  "Solo play runs on the honour system. We can't see what's on your other screen, and with nothing to win there's little point looking things up. If your tab was hidden for more than a few seconds in the middle of a round, that run stays out of the crowd's numbers. Nothing else happens: no penalty, no label, no ban.";

/** How "% off" is measured (PRD §4.2.2), with its two-way example (AC-LGL-02). */
export const PERCENT_OFF_EXPLANATION =
  "We divide the larger of your guess and the answer by the smaller, and take away 1. So twice the answer and half the answer are both 100% off: guessing high and guessing low count the same.";

/** The worked example's Encore: 1,250 km, as in PRD §4.2.4. */
const EXAMPLE = { answer: 1250, unit: "km" } as const;

const percent = (fraction: number): string =>
  `${String(Math.round(fraction * 100))}%`;

function encoreExample(guess: number): { amount: string; verdict: string } {
  const { error, band } = judgeEncoreGuess(
    {
      valueKind: "quantity",
      decimals: 0,
      answer: EXAMPLE.answer,
      bands: TUNABLES.encoreBands.quantity,
    },
    guess,
  );
  const verdict =
    band === "bullseye"
      ? `${error.display}: a bullseye`
      : band === "close"
        ? `${error.display}: close`
        : error.display;
  return {
    amount: formatEncoreAmount(guess, EXAMPLE.unit, "quantity"),
    verdict,
  };
}

function minutes(ms: number): string {
  const value = ms / 60_000;
  return value === 1 ? "1 minute" : `${String(value)} minutes`;
}

function seconds(ms: number): string {
  const value = ms / 1000;
  return value === 1 ? "1 second" : `${String(value)} seconds`;
}

export function howScoringWorksDocument(
  flags: (flag: FeatureFlag) => boolean,
): LegalDocument {
  const bands = TUNABLES.encoreBands;
  const minN = TUNABLES.crowd.percentileMinN;
  const crowdN = TUNABLES.crowd.minN;
  const [clue1, clue2, clue3, clue4] = ([1, 2, 3, 4] as const).map((clue) =>
    mysteryPoints(clue),
  );
  const maxDaily = 3 * (clue1 ?? 0);
  const answer = formatEncoreAmount(EXAMPLE.answer, EXAMPLE.unit, "quantity");
  const examples = [1200, 1100, 900].map(encoreExample);
  const twice = encoreExample(EXAMPLE.answer * 2);
  const half = encoreExample(EXAMPLE.answer / 2);

  const practiceBlocks = [
    {
      kind: "p" as const,
      text: "A practice round is 10 questions at 1 point each. There's no clock, and no speed points.",
    },
    ...(flags("blitz")
      ? [
          {
            kind: "p" as const,
            text: `**Blitz** gives you ${String(TUNABLES.blitz.seconds)} seconds to answer as many questions as you can. A right answer scores ${String(BLITZ_BASE_POINTS)} points plus up to ${String(BLITZ_SPEED_POINTS)} for speed: all ${String(BLITZ_SPEED_POINTS)} if you answer at once, none after ${seconds(BLITZ_BONUS_WINDOW_MS)}. A wrong answer scores 0, with no other penalty. The clock pauses while each verdict shows, and while the tab is hidden.`,
          },
        ]
      : []),
    ...(flags("survival")
      ? [
          {
            kind: "p" as const,
            text: `**Survival** has no clock. Three wrong answers end the run, and your score is how many you got right. Questions get harder as you go: easy for the first ${String(TUNABLES.survival.easyThrough)}, medium up to question ${String(TUNABLES.survival.mediumThrough)}, then hard.`,
          },
        ]
      : []),
  ];

  return {
    path: "/how-scoring-works",
    title: SHELL_COPY.legal.howScoringWorks,
    updated: legalDate("2026-11-05"),
    lede: [
      "Everything that decides your score and your place in the crowd, in one place. Nothing here is secret.",
    ],
    sections: [
      {
        id: "how-to-play",
        heading: "How to play",
        blocks: [{ kind: "slot", name: "how-to-play" }],
      },
      {
        id: "mysteries",
        heading: "Mystery points",
        blocks: [
          {
            kind: "p",
            text: `Solve a Mystery on clue 1 for ${String(clue1)} points, on clue 2 for ${String(clue2)}, on clue 3 for ${String(clue3)} or on clue 4 for ${String(clue4)}. A miss scores 0, so three Mysteries make ${String(maxDaily)} points at most.`,
          },
          {
            kind: "p",
            text: "A wrong guess costs exactly what Next clue costs. Either one moves you to the next clue, and the Mystery is then worth one point less, so having a go never scores less than passing.",
          },
          {
            kind: "p",
            text: "Every guess comes from the suggestions, so a typo can't cost you a clue, and guessing an answer you've already tried doesn't use one either. On the last clue you pick one of four options: a right pick scores 1 point, a wrong one 0.",
          },
        ],
      },
      {
        id: "encore",
        heading: "The Encore and “% off”",
        blocks: [
          {
            kind: "p",
            text: "The Encore asks for one number. It scores no points: it breaks ties between players on the same points, and the closer guess ranks higher.",
          },
          { kind: "p", text: PERCENT_OFF_EXPLANATION },
          { kind: "p", text: `For an answer of ${answer}:` },
          {
            kind: "list",
            items: [
              ...examples.map(
                (example) => `${example.amount} is ${example.verdict}.`,
              ),
              `${twice.amount} and ${half.amount} are both ${twice.verdict}.`,
            ],
          },
          {
            kind: "p",
            text: `Within ${percent(bands.quantity.bullseye)} is a **bullseye** and within ${percent(bands.quantity.close)} is **close**. When the answer is a year, we count years instead: within ${String(bands.year.bullseye)} years is a bullseye and within ${String(bands.year.close)} is close. Now and then an Encore uses its own bands, where the usual ones wouldn't be fair.`,
          },
          {
            kind: "p",
            text: "An exact answer reads “Spot on”. Anything closer than 1% reads “under 1% off”, and 999% or more reads “over 999% off”.",
          },
        ],
      },
      {
        id: "ranking",
        heading: "The ranking",
        blocks: [
          { kind: "p", text: "Players on the same Daily are ranked by:" },
          {
            kind: "list",
            ordered: true,
            items: [
              "points, highest first;",
              "then the Encore, closest first;",
              "then total time, quickest first.",
            ],
          },
          {
            kind: "p",
            text: `Total time adds up how long each clue or Encore question was open, up to ${minutes(TUNABLES.timing.roundCapMs)} a round. Reading a reveal never counts, and neither does the time between rounds. Nothing ever times out. Players level on all three share a place.`,
          },
          {
            kind: "p",
            text: "Our server keeps the official time, and players far from it get a small allowance for the distance their answers travel.",
          },
        ],
      },
      {
        id: "so-far-today",
        heading: "“So far today”",
        blocks: [
          {
            kind: "p",
            text: "When you finish, you see how you compare with everyone who has finished the same Daily: “You beat 64% of players so far today.” It says so far because later time zones are still playing, and the number can move until the Daily has closed everywhere.",
          },
          {
            kind: "p",
            text: `Ties count as half. You're compared with players in your part of the world (the Americas; Europe and Africa; or Asia and the Pacific) once ${String(minN)} have finished there, and with everyone until then. Until ${String(minN)} players have finished in all, you see how many have played instead of a percentage.`,
          },
          {
            kind: "p",
            text:
              crowdN === minN
                ? `The chart of how everyone did, and the numbers under each round, wait for ${String(minN)} players too.`
                : `The chart of how everyone did waits for ${String(minN)} players too, and the numbers under each round for ${String(crowdN)}.`,
          },
        ],
      },
      {
        id: "honest-play",
        heading: "Honest play",
        blocks: [
          { kind: "p", text: HONEST_PLAY_DISCLOSURE },
          {
            kind: "p",
            text: "A few other kinds of run stay out of the crowd's numbers in the same quiet way:",
          },
          {
            kind: "list",
            items: [
              "a Mystery solved by a typed guess almost the instant its clue appeared;",
              "the hardest Mystery solved on its first clue after an unusually long look at it;",
              `a Daily started after your device's time zone changed (see [time zones](${sectionHref("/how-scoring-works", "time-zones")}));`,
              `runs from brand-new profiles created in bulk from one network, which join the crowd's numbers once the profile is a day old or has finished a second Daily.`,
            ],
          },
          {
            kind: "p",
            text: "These runs still count everywhere else, streaks and Groups included, and you still see your own percentile. Nothing on screen changes.",
          },
        ],
      },
      {
        id: "time-zones",
        heading: "Time zones and your streak",
        blocks: [
          {
            kind: "p",
            text: "Your Daily is the one for your local date. It unlocks at your midnight and stays today's Daily until your next midnight. Our server works out your date from your device's time zone, never from its clock.",
          },
          {
            kind: "p",
            text: "Once you've been given a date, you can't go back to an earlier one, so moving your clock or your time zone west won't reopen yesterday's Daily as today's. We accept a Daily only for a date within a day of the date in UTC, which covers every time zone on Earth.",
          },
          {
            kind: "p",
            text: "A Daily counts for your streak only when its date is later than your last Daily that counted, so changing time zone can't fill in a day you missed: freezes and repairs are there for that. If your device's time zone changed since your previous Daily, that run still counts for your streak, but stays out of the crowd's numbers.",
          },
          {
            kind: "p",
            text: `If we have an outage, the day is covered for everyone, so your streak is safe. And if flying east across the date line skips a calendar day, that day is covered too, once every ${String(TUNABLES.streaks.datelineCooldownDays)} days.`,
          },
        ],
      },
      {
        id: "practice",
        heading: "Practice",
        blocks: practiceBlocks,
      },
      ...(flags("rooms")
        ? [
            {
              id: "rooms",
              heading: "Rooms (Beta)",
              blocks: [
                {
                  kind: "p" as const,
                  text: "In a room, a right answer scores 700 points plus up to 300 for speed, and 50 more for each right answer in a row before it, up to 250. The last question counts double. A wrong answer, or none, scores 0 and starts the run of right answers again.",
                },
                {
                  kind: "p" as const,
                  text: "In Accuracy mode, and whenever the host turns the timer off, a right answer scores 1,000 plus the same bonus for answers in a row. Players level on points are ranked by their total time on right answers.",
                },
              ],
            },
          ]
        : []),
      {
        id: "corrections",
        heading: "When we get one wrong",
        blocks: [
          {
            kind: "p",
            text: `If a Daily Mystery turns out to be wrong, we withdraw it. Everyone who played that Daily gets ${String(VOIDED_MYSTERY_POINTS)} points for it, and anyone who hasn't reached it yet skips it, with a note saying why. A withdrawn Encore drops out of that day's ranking, so ties fall to time.`,
          },
          {
            kind: "p",
            text: "If the right answer was one of the four options on the last clue, we may correct the answer instead. Finished games are checked again: if you guessed the corrected answer, your Mystery counts as solved on the clue where you first guessed or picked it.",
          },
          {
            kind: "p",
            text: "Percentiles, the crowd's numbers, challenges and Group boards are worked out again, and you'll see a one-time note. Streaks never change because of a correction. A corrected practice question arrives with the next update, and earlier practice scores stay as they were.",
          },
        ],
      },
    ],
  };
}
