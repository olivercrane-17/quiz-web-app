/**
 * Every number the PRD marks "(tunable)" (PRD §0: starting values that live
 * in configuration, never inline in components, so playtests and beta data
 * can move them without a code change). Unmarked PRD numbers are fixed
 * rules and stay with the code that implements them.
 *
 * Values the client and SQL must agree on come from shared.json (§5.3), so
 * they have one source; SQL-enforced limits are listed here too, as the
 * reference the SQL tickets copy into private.config.
 */
import { SHARED } from "./shared";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const TUNABLES = {
  /** PRD §3.0.3 and §3.12.4: the answer press and the reveal. */
  answers: {
    /** Answer buttons are at least this tall. */
    buttonMinHeightPx: 56,
    /** The reveal shows this long after the press. */
    revealMs: 400,
  },

  daily: {
    /** The home card's "about 4 minutes" (`daily_minutes`, PRD §3.1.7). */
    minutes: SHARED.dailyMinutes,
    /** Options replace typing from this clue (`options_from_clue`, PRD Q3). */
    optionsFromClue: SHARED.optionsFromClue,
    /** Field budget, p75 from Continue to the next clue on screen (PRD §8.1). */
    nextClueFieldBudgetMs: 600,
  },

  /** PRD §4.2.2: encore bands, overridable per Encore. Shared with SQL. */
  encoreBands: SHARED.encoreBands,

  crowd: {
    /** Crowd stats appear once this many eligible runs resolved a round (`crowd_min_n`, PRD §4.1.5). */
    minN: SHARED.crowdMinN,
    /** The percentile and histogram need a pool this big (`percentile_min_n`, PRD §4.3.4). */
    percentileMinN: SHARED.percentileMinN,
  },

  /** PRD §4.3: timing and honest play. Shared with SQL. */
  timing: {
    /** Each round's active interval is capped (PRD §4.3.2). */
    roundCapMs: SHARED.roundCapMs,
    /** Allowance per request in a round (PRD §4.3.3). */
    latencyAllowanceMs: SHARED.latencyAllowanceMs,
    /** Hidden time in one round that flags the run (`honest_play_hidden_ms`, PRD §4.3.6). */
    honestPlayHiddenMs: SHARED.honestPlayHiddenMs,
    /** A typed solve this soon after its clue flags the run (PRD §4.3.6 item 3). */
    tooFastMs: SHARED.tooFastMs,
    /** Expert-slot check (PRD §4.3.6 item 2): Mystery 3 solved on clue 1 after a dwell above this multiple of the median... */
    expertSlotMedianMultiple: 3,
    /** ...once this many such solves exist... */
    expertSlotMinSolves: 50,
    /** ...and before that, after a clue-1 dwell above this. */
    expertSlotFallbackDwellMs: 120 * SECOND,
  },

  /** PRD §4.1.6: expected points for a typical player, by slot (content). */
  calibration: {
    mystery1: { min: 3.0, max: 3.6 },
    mystery2: { min: 2.4, max: 3.0 },
    mystery3: { min: 1.8, max: 2.4 },
  },

  practice: {
    /** Bands by predicted correct rate p (PRD §3.3.3): Easy p >= 0.75, Hard p < 0.45. */
    easyMinP: 0.75,
    hardMaxP: 0.45,
  },

  /** PRD §3.3.5 (memo-review row: Blitz scoring is tunable). */
  blitz: {
    /** The run length (`blitz_seconds`). Shared with SQL. */
    seconds: SHARED.blitzSeconds,
    /** The verdict flash; the countdown pauses through it. */
    verdictFlashMs: 600,
    /** A correct answer scores base plus up to bonus, falling to 0 over the window. */
    basePoints: 100,
    speedBonusPoints: 50,
    speedWindowMs: 8 * SECOND,
  },

  /** PRD §3.3.6: Easy for questions 1 to 5, Medium to 12, Hard from 13. */
  survival: {
    easyThrough: 5,
    mediumThrough: 12,
  },

  /** PRD §4.1.3: suggestions shown at most (`SUGGESTION_COUNT`, §4.7). */
  suggestions: {
    count: 6,
  },

  /** PRD §3.4.4: category mastery tiers. */
  mastery: {
    tiers: [
      { tier: "bronze", distinct: 20, accuracy: 0.5, hardCorrect: 0 },
      { tier: "silver", distinct: 40, accuracy: 0.6, hardCorrect: 0 },
      { tier: "gold", distinct: 70, accuracy: 0.7, hardCorrect: 0 },
      { tier: "platinum", distinct: 100, accuracy: 0.8, hardCorrect: 20 },
    ],
  },

  /** PRD §3.4.5: achievements at launch. */
  achievements: {
    count: 30,
  },

  /** PRD §4.4.7: the date-line rule fires at most once in this many days. */
  streaks: {
    datelineCooldownDays: 30,
  },

  /** PRD §3.8.3 and §3.8.5 (Beta). */
  rooms: {
    /** The read beat: 0.25 s per word of the stem, clamped. */
    readBeatMsPerWord: 250,
    readBeatMinMs: 1.5 * SECOND,
    readBeatMaxMs: 5 * SECOND,
    /** Phones show "Waiting for the host..." after this long without a host heartbeat. */
    hostAwayMs: 60 * SECOND,
    /** The room ends after this long without the host. */
    hostGoneEndsMs: 15 * MINUTE,
    /** The room ends after this long idle in the lobby... */
    lobbyIdleEndsMs: 30 * MINUTE,
    /** ...or this long in total. */
    maxDurationMs: 4 * HOUR,
  },

  /** PRD §3.10.1: guest identity registration (SQL-enforced). */
  identity: {
    normalTrustPerIpPerHour: 60,
    burstPerIpPerMinute: 20,
    projectPerHour: 5000,
    /** A low-trust identity's runs count once it is this old... */
    lowTrustUntilAgeMs: DAY,
    /** ...or has finished this many Dailies. */
    lowTrustUntilFinishes: 2,
  },

  /** PRD §3.13.3: report weight (SQL-enforced). */
  reports: {
    newIdentityAgeMs: DAY,
    newIdentityWeight: 0.5,
    lowTrustWeight: 0,
  },

  /** PRD §3.16: share of sessions that send web_vitals and explanation_dwell. */
  analytics: {
    sampledEventShare: 0.25,
  },

  /** PRD §8.5: the storage shed switch (SQL-enforced). */
  shed: {
    onAtMb: 380,
    offBelowMb: 340,
  },

  /** PRD §8.4: rate limits, abuse brakes enforced in SQL (ARCHITECTURE §8.4, §8.6). */
  rateLimits: {
    anyCallPerIpPer5Min: 1000,
    anyCallPerPlayerPer5Min: 300,
    landingReadsPerIpPerMinute: 300,
    syncRedeem: { failuresPerIpPer15Min: 5, failuresPerDay: 20 },
    claim: { createdPerPlayerPerHour: 5, redemptionsPerIpPerHour: 10 },
    challengesPerPlayerPerDay: 20,
    groups: { createdPerPlayerPerDay: 3, joinsPerPlayerPerHour: 20 },
    rooms: {
      createdPerIdentityPerHour: 5,
      failedJoinsPerIpPerMinute: 10,
      projectUnknownCodesPerMinute: 300,
      slowJoinIntervalMs: 5 * SECOND,
    },
    quizzes: {
      savesPerPlayerPerHour: 30,
      maxQuizKb: 64,
      savedKbPerPlayerPerDay: 512,
      savedMbPerIpPerDay: 2,
      sharesPerPlayerPerDay: 10,
    },
    practiceUploads: {
      answersPerPlayerPerDay: 500,
      answersPerIpPerDay: 2000,
      newItemsPerIpPerDay: 50,
      calibrationAnswersPerIpPerItemPerDay: 3,
    },
    reportsPerPlayerPerDay: 30,
    logEvents: {
      perIdentityPerMinute: 60,
      perIpPer5Min: 300,
      projectPerMinute: 600,
      projectPerDay: 150_000,
    },
  },
} as const;

/** §4.7 names this one. */
export const SUGGESTION_COUNT = TUNABLES.suggestions.count;

export type Tunables = typeof TUNABLES;
