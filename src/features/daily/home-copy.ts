/**
 * Today's Daily card's words (PRD §3.1.7, DESIGN §12.1), in a module of
 * their own: the card is one of Home's eager islands, with a 4 kB gzipped
 * target (§10.9 item 2), and a chunk takes a whole module, so sharing one
 * with the play screen's copy would ship that copy on Home. `copy.ts`
 * includes them with the rest for the design team and the copy lint.
 */
export const HOME_CARD_COPY = {
  heading: "Today's Daily",
  /** No date: Today's dateline names the day once (D18). */
  dailyLine: (dailyNumber: number) => `Daily #${dailyNumber}`,
  minutes: (minutes: number) => `About ${minutes} minutes`,
  /** The one-line rule (PRD §3.1.7), for a Daily with Mysteries. */
  rule: "Fewer clues, more points. Then one number.",
  /** The same line for a Daily of questions alone (§3.1.2: composition is data). */
  ruleChoice: "A point a question. Then one number.",
  roundsLabel: "Today's rounds",
  encoreChip: "Encore · a number",
  questionChip: "A question",
  /** Before get_today answers (PRD §3.1.7, Loading). */
  placeholderChips: ["Easy", "Medium", "Hard", "Number"],
  play: "Play today's Daily",
  continueHeading: (dailyNumber: number, round: string) =>
    `Continue Daily #${dailyNumber} · ${round}`,
  /** Where an unfinished run stands: "Mystery 2 of 3". */
  progress: {
    mystery: (ordinal: number, ofType: number) =>
      ofType > 1 ? `Mystery ${ordinal} of ${ofType}` : "Mystery",
    encore: "Encore",
    choice: (ordinal: number, ofType: number) =>
      ofType > 1 ? `Question ${ordinal} of ${ofType}` : "Question",
  },
  continue: "Continue",
  doneHeading: (points: number, maxPoints: number) =>
    `Done for today · ${points}/${maxPoints}`,
  gridLabel: "Your result",
  seeResults: "See results",
  nextDaily: (wait: string) => `Next Daily in ${wait}`,
  pastWeek: "Past 7 days",
} as const;
