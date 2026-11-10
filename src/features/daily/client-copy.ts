/**
 * The Daily screen's and the stop screen's words (DESIGN §1.4, PRD §3.1),
 * apart from the home card's (`home-copy.ts`) and the shared words
 * (`words.ts`), so Home's chunk never carries these. `copy.ts` includes
 * them all for the design team and the copy lint. Greybox wording where
 * DESIGN.md is silent; DLY-2 and DLY-3 polish the screens they complete.
 */

/** The Daily screen (PRD §3.1.3 to §3.1.5, DESIGN §12.2). */
export const DAILY_SCREEN_COPY = {
  title: "Today's Daily",
  /**
   * The X's accessible name (decision D19, R2-01), by whether time is
   * counting: while a clue or the Encore is open it keeps running, even
   * with the Daily closed; on a reveal, between rounds and before the Daily
   * opens it is stopped.
   */
  leave: {
    running:
      "Leave the Daily. Your progress is saved, and the stopwatch keeps running.",
    stopped: "Leave the Daily. Your progress is saved.",
  },
  progress: "Daily progress",
  loading: "Loading today's Daily",
  /** The skeleton between rounds, while begin_round is out. */
  loadingRound: {
    mystery: "Loading the next clue",
    encore: "Loading the Encore",
    choice: "Loading the next question",
  },
  stopwatch: "Time so far",
  /** Beside the stopwatch, in the player's first Daily only (PRD §3.1.3, DESIGN §1.4). */
  stopwatchHint: "Take your time. Time only breaks ties.",
  /**
   * The toast on Leave (DESIGN §6.9, D19), which the X's name already says:
   * leaving with a clue or the Encore open, the clock is still counting.
   */
  saved: {
    running: "Saved. The stopwatch keeps running.",
    stopped: "Saved",
  },
  /** The focus-mode header's overflow menu (DESIGN §6.13, PRD §3.1.3). */
  more: {
    label: "More",
    howToPlay: "How to play",
    hideStopwatch: "Hide stopwatch",
    showStopwatch: "Show stopwatch",
  },
  /** How to play's way to the page with the same text and the rest of the rules. */
  howScoringWorks: "How scoring works",
  roundLabel: {
    mystery: (ordinal: number, ofType: number) =>
      ofType > 1 ? `Mystery ${ordinal} of ${ofType}` : "Mystery",
    encore: "Encore",
    choice: (ordinal: number, ofType: number) =>
      ofType > 1 ? `Question ${ordinal} of ${ofType}` : "Question",
  },
  answerTypeLine: (phrase: string) =>
    `The answer is ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`,
  continueTo: {
    mystery: "Next mystery",
    encore: "On to the Encore",
    choice: "Next question",
    results: "See your results",
  },
  segment: {
    mystery: (ordinal: number) => `Mystery ${ordinal}`,
    encore: "Encore",
    choice: (ordinal: number) => `Question ${ordinal}`,
    playing: "playing now",
    upcoming: "not started",
    solvedOn: (clue: number) => `solved on clue ${clue}`,
    /** After "solved on clue 3" (decision D11): "2 points". */
    points: (points: number) =>
      `${points} ${points === 1 ? "point" : "points"}`,
    /** A solved pill's mark, on the correct fill (decision D11): "+2". */
    gained: (points: number) => `+${points}`,
    /** A Mystery pill's mark before its result: "M1". */
    marks: {
      mystery: (ordinal: number) => `M${ordinal}`,
    },
    missed: "missed",
    lockedIn: "locked in",
    /**
     * After "Encore, locked in" (R2-06): how far off, and the band, as the
     * pill's mark shows them: "13% off, a close guess".
     */
    encoreResult: (error: string, band: "bullseye" | "close" | null) => {
      const off = `${error.charAt(0).toLowerCase()}${error.slice(1)}`;
      return band === "bullseye"
        ? `${off}, a bullseye`
        : band === "close"
          ? `${off}, a close guess`
          : off;
    },
    /** The E pill's mark inside the bullseye band (R2-06). */
    bullseyeMark: "🎯",
    right: "right",
    wrong: "not right",
    withdrawn: "withdrawn",
  },
  withdrawn: {
    mystery:
      "This Mystery was withdrawn because we got it wrong. Everyone gets 4 points.",
    encore: "The Encore was withdrawn, so ties fall to time.",
    choice:
      "This question was withdrawn because we got it wrong. Everyone gets the point.",
    ordering: "This round was withdrawn.",
  },
  resumed: {
    solved: (clue: number, points: number) =>
      `Solved on clue ${clue} · ${points} ${points === 1 ? "point" : "points"}`,
    missed: "Missed · 0 points",
    lockedIn: (error: string) => `Locked in · ${error}`,
    right: "Right · 1 point",
    wrong: "Not quite · 0 points",
    learnMore: "Learn more",
    /** Contains the visible label (WCAG 2.5.3). */
    learnMoreLabel: (topic: string) =>
      `Learn more about ${topic} on Wikipedia (opens in a new tab)`,
  },
  movedOn: "This Daily moved on in another tab.",
  /** The one `role="alert"` (PRD §3.1.3). */
  lostConnection:
    "You're offline. Your progress is saved, and we'll pick up where you left off.",
  stillTrying: "That didn't reach us. Nothing was lost. Trying again…",
  /** A rate-limited move: it reached us and used up nothing (PRD §3.0.2, §3.1.3). */
  busy: "Lots of players right now. Nothing was used up. Trying again…",
  /** A rate limit that asks for more than a minute's wait. */
  busyLonger:
    "Lots of players right now. Nothing was used up. Try again in a few minutes.",
  /** A rate-limited start after 5 s of silent retries (AC-IDN-04), by whose limit refused it. */
  startBusy: {
    ip: "Lots of new players on your network right now. Trying again…",
    other: "Lots of new players right now. Trying again…",
  },
  /** A rate-limited start from 30 s, when Practice is offered (AC-IDN-04). */
  startBusyFallback: {
    title: "We couldn't set up your profile right now.",
    body: "Practice still works.",
  },
  offline: {
    title: "The Daily needs a connection.",
    body: "Practice works offline, but it isn't today's Daily.",
  },
  unreachable: {
    title: "We couldn't reach today's Daily.",
    body: "Nothing was lost. We'll keep trying.",
  },
  outage: {
    title: "We're having trouble on our side.",
    body: "Your streak is protected today.",
  },
  /**
   * The backend serves no Daily yet (its daily area answers `unavailable`,
   * as the Supabase adapters do until SQL-4 and SQL-5): never "on this
   * server", which means nothing to a player.
   */
  notReady: {
    title: "Today's Daily isn't ready yet.",
    body: "Practice is ready when you are.",
  },
  failed: {
    title: "Something went wrong with today's Daily.",
    body: "Nothing was lost. Try again in a moment.",
  },
  tryAgain: "Try again",
  practice: "Play practice instead",
  reference: (ref: string) => `Ref ${ref}`,
} as const;

/** What the polite status region says after each verdict (PRD §3.0.3, §3.1.4). */
export const ANNOUNCE_COPY = {
  correct: (answer: string) => `Correct. ${answer}.`,
  wrongChoice: (chosen: string, answer: string) =>
    `Not quite. You chose ${chosen}. The answer is ${answer}.`,
  wrongGuess: (guess: string, clue: number, worth: number, text: string) =>
    `Not ${guess}. Clue ${clue}, now worth ${worth}: ${text}`,
  nextClue: (clue: number, worth: number, text: string) =>
    `Clue ${clue}, now worth ${worth}: ${text}`,
  /**
   * A solve after its stamp, decision D10's "Knew it.", "Got there." or
   * "Got it.", which the rounds' `solvedStamp` picks: the pun lives there
   * alone (DESIGN §1.1).
   */
  solved: (stamp: string, answer: string, clue: number, points: number) =>
    clue === 4
      ? `${stamp} ${answer}, on the last clue. 1 point.`
      : `${stamp} ${answer}, solved on clue ${clue}. ${points} points.`,
  missed: (answer: string) =>
    `This one got away. The answer was ${answer}. 0 points.`,
  encore: {
    bullseye: "Bullseye.",
    close: "Close.",
    result: (error: string, answer: string) =>
      `${error}. The answer was ${answer}.`,
  },
} as const;

/** The stop screen, greybox (PRD §3.1.6, DESIGN §12.4); DLY-3 completes it. */
export const STOP_SCREEN_COPY = {
  title: "Your results",
  close: "Close the results and go to Today",
  loading: "Loading your results",
  heading: (dailyNumber: number) => `Daily #${dailyNumber}`,
  archive: "Archive · unranked",
  score: (points: number, maxPoints: number) => `${points}/${maxPoints}`,
  scoreLabel: (points: number, maxPoints: number) =>
    `${points} out of ${maxPoints}`,
  shareHeading: "Your share text",
  shareNote: "No answers inside.",
  /** Under the score card's grid (decisions D3 and D22), after each glyph. */
  legend: {
    passed: "clue used",
    solved: "solved",
    missed: "missed",
    unused: "not needed",
  },
  /** The score card's total time (decision D7): never in the share text. */
  time: (clock: string) => `Time ${clock} · only breaks ties`,
  roundsHeading: "Your rounds",
  mysteryRow: (ordinal: number, category: string) =>
    `Mystery ${ordinal} · ${category}`,
  choiceRow: (ordinal: number) => `Question ${ordinal}`,
  encoreRow: "Encore",
  /** The Encore row's purpose and the tiebreak order (decisions D2 and D21, R2-04). */
  encoreNote: "Breaks ties: closest Encore first, then time. Scores no points.",
  solved: (clue: number, points: number) =>
    `Solved on clue ${clue} · ${points} ${points === 1 ? "point" : "points"}`,
  missed: "Missed · 0 points",
  withdrawn: (points: number) =>
    `Withdrawn · ${points} ${points === 1 ? "point" : "points"}`,
  answerWas: (answer: string) => `The answer: ${answer}`,
  right: "Right",
  wrong: "Not quite",
  encoreLine: (guess: string, answer: string, error: string) =>
    `You said ${guess}, the answer was ${answer}: ${error}`,
  /** "Close guess", never "Close" on a line of its own, which reads as a dismiss button (D16, R2-24). */
  bands: { bullseye: "Bullseye", close: "Close guess" },
  done: "Done for today",
  nextDaily: (wait: string) => `Next Daily in ${wait}`,
  practice: "Want more? Try a practice round.",
  notFinished: "You haven't finished today's Daily yet.",
  playToday: "Play today's Daily",
  /**
   * Another day's results. Until the archive has a route (ARC-1 sets
   * `ARCHIVE_HREF`), the line promises nothing: round 4's "moved to the
   * archive" sent players looking for an archive that isn't there (R4-08).
   */
  elsewhere: (archive: boolean) =>
    archive
      ? "These results have moved to the archive."
      : "Results are only kept for today's Daily.",
  pastWeek: "Past 7 days",
  /** A results address with no Daily number in it (DESIGN §1.4, Not found). */
  notFound: "We couldn't find that page.",
  goToday: "Go to Today",
  error: "We couldn't load your results.",
  offline: "Your results need a connection.",
  tryAgain: "Try again",
} as const;
