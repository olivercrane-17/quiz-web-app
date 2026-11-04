/**
 * Streak evaluation contracts (ARCHITECTURE §4.11, PRD §4.4).
 *
 * `StreakInput`, `StreakEvaluation` and the `applyFinish` finish follow
 * §4.11. Three input fields go beyond its listing: `epoch` (a repair offer
 * names its Daily number), `best` (the stored best, which a pruned history
 * alone could undercount) and `datelineCooldownDays` (tunable, PRD §4.4.7,
 * since the engine can't read the config). `StreakEvaluation` has exactly
 * §4.11's fields, the summary ones factored out as `StreakSummary`, and
 * `StreakCounters`, which §4.11 names without spelling out, is defined here.
 */
import type { EpochMs, LocalDate, TimeZone } from "../types/ids.ts";
import type { DayStatus, RepairOffer } from "../types/streaks.ts";

/** A status stored for a past date (one `player_days` row). */
export type StoredStatus = Exclude<DayStatus, "today">;

export interface StoredDay {
  date: LocalDate;
  status: StoredStatus;
}

/** The statuses an evaluation writes into a gap. */
export type GapStatus = "freeze" | "protected" | "missed";

/** An incident window on the player's track or `all` (PRD §3.15.3). */
export interface IncidentWindow {
  start: EpochMs;
  end: EpochMs;
}

/** A gap date the date-line rule holds undecided until the next request (PRD §4.4.7). */
export interface DatelineCandidate {
  date: LocalDate;
  zone: TimeZone;
}

/** The date-line rule fires at most once in this many days (tunable, `TUNABLES.streaks`). */
export const DATELINE_COOLDOWN_DAYS = 30;

/** The offset must have grown by at least this much since the last finish (PRD §4.4.7). */
export const DATELINE_MIN_GROWTH_MINUTES = 12 * 60;

/** At most one repair per rolling 168 hours of server time (PRD §4.4.4). */
export const REPAIR_COOLDOWN_MS = 168 * 3_600_000;

/** A repair of M is possible until local 00:00 on M + 3 (PRD §4.4.4). */
export const REPAIR_WINDOW_DAYS = 3;

/** A freeze is earned at every 7th counted finish (PRD §3.4.2). */
export const FINISHES_PER_FREEZE = 7;

/** Freezes held at most (PRD §3.4.2). */
export const MAX_FREEZES = 2;

export interface StreakInput {
  /** Server time of the request. */
  now: EpochMs;
  /** The effective today (§8.7): never earlier than a date already served. */
  today: LocalDate;
  /** Local 00:00 of a date in the request's zone. */
  dayStart(date: LocalDate): EpochMs;
  /** The request zone's UTC offset at `now`, in minutes. */
  offsetMinutes: number;
  lastFinishOffsetMinutes: number | null;
  zone: TimeZone;
  lastFinishZone: TimeZone | null;
  /** Stored by an earlier request (PRD §4.4.7). */
  datelineCandidate: DatelineCandidate | null;
  /** When the date-line rule last protected a date; it fires at most once per cooldown. */
  datelineUsedAt: EpochMs | null;
  /** Stored statuses, one per date. */
  days: readonly StoredDay[];
  /** Dates holding an open ranked attempt that can still finish on time. */
  pending: readonly LocalDate[];
  freezesHeld: 0 | 1 | 2;
  freezeProgress: number;
  lastRepairAt: EpochMs | null;
  /** The player's track plus `all`. */
  incidents: readonly IncidentWindow[];
  /** DAILY_EPOCH, so a repair offer can name its Daily number. */
  epoch: LocalDate;
  /** The stored best streak; the evaluation never reports less. Default 0. */
  best?: number;
  /** Default `DATELINE_COOLDOWN_DAYS`. */
  datelineCooldownDays?: number;
}

/** What every surface shows (PRD §4.4.3 step 6). */
export type StreakDisplay = "active" | "paused" | "broken";

export interface StreakSummary {
  /** The chain ending at the latest Played or Repaired date, or 0 once a gap date is Missed. */
  current: number;
  best: number;
  repair: RepairOffer | null;
  /** The 168-hour cap's end while it blocks repairs, else null. */
  repairBlockedUntil: EpochMs | null;
  /** Set exactly when `repair` is: the pre-break chain count and the repair deadline. */
  paused: { streak: number; until: EpochMs } | null;
  display: StreakDisplay;
  /** The latest break holds two or more Missed dates and, as one date, would still be repairable. */
  breakTooLong: boolean;
}

export interface StreakEvaluation extends StreakSummary {
  /** New gap statuses, oldest first. */
  written: { date: LocalDate; status: GapStatus }[];
  freezesHeld: 0 | 1 | 2;
  /** This evaluation protected a date by the date-line rule. */
  datelineUsed: boolean;
  /** To store: a new candidate, or null once decided. */
  datelineCandidate: DatelineCandidate | null;
  /** One-time notices, oldest first. */
  notices: { kind: "freeze_spent" | "protected"; date: LocalDate }[];
}

/** The counters a finish changes (`private.streaks`). */
export interface StreakCounters {
  freezesHeld: 0 | 1 | 2;
  /** 0 to 6; stays 0 while 2 are held. */
  freezeProgress: number;
  /** On-time finishes and repairs: the finishes that count toward freezes. */
  dailiesFinished: number;
}

/**
 * How a finish counts (§8.10): `on_time` for a ranked attempt with streak
 * credit, `repair` for an unranked play of a repairable Missed date, `other`
 * for everything else, which changes nothing.
 */
export type FinishKind = "on_time" | "repair" | "other";

export interface StreakFinish {
  date: LocalDate;
  kind: FinishKind;
  /** The gap status already stored for that date, if any. */
  existing: GapStatus | null;
}
