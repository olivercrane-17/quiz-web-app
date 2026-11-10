/**
 * How to play (PRD §3.1.3): five parts in a fixed order, the clue ladder,
 * the points, clue 4's single pick, the Encore and the ranking. The Daily's
 * More menu opens it as a sheet, Today's card opens the same sheet before
 * the Daily starts (D25), and `/how-scoring-works` carries the same text
 * (FIX-DS builds that page from `HowToPlayText`, exported by the feature's
 * index). Plain data, so a server page imports it for nothing.
 *
 * The words follow the RITE round 1 decisions: a wrong guess costs what
 * Next clue costs, so have a go (R1-04); the Encore scores no points and
 * breaks ties (D2); time only breaks ties (R1-05). And round 2's: the
 * stopwatch runs while a clue is open, even while you're away or reading
 * this, and stops on every reveal (D19, R2-01); the Encore breaks a tie
 * before time does (D21, R2-04); and the "so far today" sentence waits for
 * a stop screen that shows a percentile (D21), so How to play never
 * promises a number nobody can see.
 */

export interface HowToPlayPart {
  /** Stable, for tests and the page's anchors. */
  id: "ladder" | "points" | "clue4" | "encore" | "ranking";
  heading: string;
  body: readonly string[];
}

export interface HowToPlay {
  title: string;
  parts: readonly HowToPlayPart[];
}

/**
 * Whether the stop screen shows a percentile ("You beat 64% of players so
 * far today."). DLY-3 builds it in M2 and turns this on, which brings back
 * How to play's "so far today" sentence (D21).
 */
export const STOP_SCREEN_PERCENTILE = false;

/**
 * Whether the stop screen says how many have played while too few have
 * finished for a percentile (PRD §4.3.4). DLY-3 builds it in M2 and turns
 * this on, which brings back How scoring works' sentence about it (RITE
 * round 3, R3-06): until then the page doesn't promise a count nobody sees.
 */
export const STOP_SCREEN_PLAYER_COUNT = false;

/** D19's sentence, where the belief that leaving pauses the clock forms. */
export const STOPWATCH_RULE =
  "The stopwatch runs while a clue is open, even while you're away or reading this, and stops on every reveal.";

/** The ranking's last sentence, once the stop screen has a percentile. */
export const SO_FAR_TODAY =
  "Results say “so far today” because later time zones are still playing.";

/** How to play's words, with or without the "so far today" sentence. */
export function buildHowToPlay(options: { percentile: boolean }): HowToPlay {
  return {
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
          "The last clue comes with four options. Choose one, then Lock in. You get one pick, and a wrong pick scores 0.",
        ],
      },
      {
        id: "encore",
        heading: "The Encore",
        body: [
          "One number, no points. Within 5% is a bullseye, or within 2 years when the answer is a year.",
          "If you tie on points, the closer guess ranks higher. Time only counts after that.",
        ],
      },
      {
        id: "ranking",
        heading: "The ranking",
        body: [
          "Points come first, then the Encore, then total time. Nothing counts down, and time only breaks ties.",
          STOPWATCH_RULE,
          ...(options.percentile ? [SO_FAR_TODAY] : []),
        ],
      },
    ],
  };
}

export const HOW_TO_PLAY: HowToPlay = buildHowToPlay({
  percentile: STOP_SCREEN_PERCENTILE,
});
