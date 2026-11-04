/**
 * How to play (PRD §3.1.3): five parts in a fixed order, the clue ladder,
 * the points, clue 4's single pick, the Encore and the ranking. The Daily's
 * More menu opens it as a sheet, and `/how-scoring-works` carries the same
 * text (FIX-DS builds that page from `HowToPlayText`, exported by the
 * feature's index). Plain data, so a server page imports it for nothing.
 *
 * The words follow the RITE round 1 decisions: a wrong guess costs what
 * Next clue costs, so have a go (R1-04); the Encore scores no points and
 * breaks ties (D2); time only breaks ties (R1-05).
 */

export interface HowToPlayPart {
  /** Stable, for tests and the page's anchors. */
  id: "ladder" | "points" | "clue4" | "encore" | "ranking";
  heading: string;
  body: readonly string[];
}

export const HOW_TO_PLAY = {
  title: "How to play",
  parts: [
    {
      id: "ladder",
      heading: "The clue ladder",
      body: [
        "Each Mystery has four clues, hardest first.",
        "Guess whenever you like, or use Next clue for an easier one.",
      ],
    },
    {
      id: "points",
      heading: "The points",
      body: [
        "Solve it on clue 1 for 4 points, on clue 2 for 3, on clue 3 for 2 and on clue 4 for 1.",
        "A wrong guess costs exactly what Next clue costs, so have a go.",
      ],
    },
    {
      id: "clue4",
      heading: "Clue 4",
      body: [
        "The last clue comes with four options. You get one pick, and a wrong pick scores 0.",
      ],
    },
    {
      id: "encore",
      heading: "The Encore",
      body: [
        "One number, no points. Within 5% is a bullseye, or within 2 years when the answer is a year.",
        "If you tie on points, the closer guess ranks higher.",
      ],
    },
    {
      id: "ranking",
      heading: "The ranking",
      body: [
        "Points come first, then the Encore, then total time. Nothing counts down, and time only breaks ties.",
        "Results say “so far today” because later time zones are still playing.",
      ],
    },
  ],
} as const satisfies { title: string; parts: readonly HowToPlayPart[] };
