/**
 * Room scoring, Beta (ARCHITECTURE §4.6; PRD §4.5). The mock rooms area
 * (ROM-1) scores with these functions and SQL's room RPCs (SQL-14) replay
 * `src/engine/fixtures/room-scoring.json`.
 *
 * - **Classic**, a correct answer: `700 + round(300 × (1 - t / T)) +
 *   min(250, 50 × (s - 1))`, doubled on the final question. `T` is the
 *   player's own limit (with any +50% extension), `s` counts consecutive
 *   correct answers including this one, and the effective time is
 *   `t = clamp(max(tServer - 400, tClient), 0, T)`. The speed part is
 *   rounded half up in integers, so SQL and the engine agree at x.5.
 * - **Accuracy**, a correct answer: `1000 + min(250, 50 × (s - 1))`, doubled
 *   on the final question. It applies when the host picks it and always
 *   when the timer is off.
 * - **Wrong or no answer** scores 0 and resets `s` to 0. **A voided
 *   question** is skipped: nobody scores and `s` is unchanged.
 * - **Grace.** Answers received up to 500 ms after the player's deadline
 *   are accepted with a speed bonus of 0; later ones are rejected
 *   (AC-ROM-08). With the timer off there is no deadline: the host's Reveal
 *   ends answering.
 * - **Ranking.** Score, higher first; then the lower sum of effective times
 *   over correct answers; equal on both share the rank. Each phone shows
 *   the gap to the player directly above; the leader, the lead over second.
 */
import type { RoomSettings, RoomStanding } from "../types/rooms.ts";
import type { SeatId } from "../types/ids.ts";
import { rankBy } from "./ranking.ts";

/** The latency allowance on the server's interval (PRD §4.5.1). */
export const ROOM_LATENCY_ALLOWANCE_MS = 400;
/** Answers this long after the deadline still count, with no speed bonus (PRD §4.5.3). */
export const ROOM_GRACE_MS = 500;

const CLASSIC_BASE = 700;
const CLASSIC_SPEED = 300;
const ACCURACY_BASE = 1000;
const STREAK_STEP = 50;
const STREAK_CAP = 250;

export type RoomAnswer = "correct" | "wrong" | "none" | "voided";

export interface RoomPointsInput {
  scoring: RoomSettings["scoring"];
  answer: RoomAnswer;
  /** The player's limit T in ms, extensions included; null when the timer is off. */
  limitMs: number | null;
  /** From the server issuing the options to receiving the answer. */
  tServerMs: number;
  /** From the phone rendering the options to the press. */
  tClientMs: number;
  /** Consecutive correct answers before this question. */
  streakBefore: number;
  final: boolean;
}

export interface RoomPoints {
  points: number;
  /** Consecutive correct answers after this question. */
  streak: number;
  /** The effective answer time, for the ranking's tie-break; null when not correct. */
  effectiveMs: number | null;
}

/** The effective answer time: `max(tServer - 400, tClient)`, clamped to [0, T]. */
export function roomEffectiveMs(
  tServerMs: number,
  tClientMs: number,
  limitMs: number | null,
): number {
  const t = Math.max(
    Math.round(tServerMs) - ROOM_LATENCY_ALLOWANCE_MS,
    Math.round(tClientMs),
    0,
  );
  return limitMs === null ? t : Math.min(t, limitMs);
}

/** `round(300 × (1 - t / T))`, half up, in integers. */
function speedPoints(t: number, limitMs: number): number {
  if (limitMs <= 0) return 0;
  return Math.floor(
    (2 * CLASSIC_SPEED * (limitMs - t) + limitMs) / (2 * limitMs),
  );
}

export function roomPoints(input: RoomPointsInput): RoomPoints {
  if (input.answer === "voided") {
    return { points: 0, streak: input.streakBefore, effectiveMs: null };
  }
  if (input.answer !== "correct") {
    return { points: 0, streak: 0, effectiveMs: null };
  }
  const streak = input.streakBefore + 1;
  const bonus = Math.min(STREAK_CAP, STREAK_STEP * (streak - 1));
  const effectiveMs = roomEffectiveMs(
    input.tServerMs,
    input.tClientMs,
    input.limitMs,
  );
  let points: number;
  if (input.scoring === "accuracy" || input.limitMs === null) {
    points = ACCURACY_BASE + bonus;
  } else {
    const inGrace = input.tServerMs > input.limitMs;
    const speed = inGrace ? 0 : speedPoints(effectiveMs, input.limitMs);
    points = CLASSIC_BASE + speed + bonus;
  }
  return { points: input.final ? points * 2 : points, streak, effectiveMs };
}

/** How an answer received at `receivedAt` stands against the deadline. */
export type RoomAnswerWindow = "in_time" | "grace" | "late";

export function roomAnswerWindow(
  receivedAt: number,
  deadline: number | null,
): RoomAnswerWindow {
  if (deadline === null || receivedAt <= deadline) return "in_time";
  return receivedAt <= deadline + ROOM_GRACE_MS ? "grace" : "late";
}

export interface RoomSeatScore {
  seatId: SeatId;
  name: string;
  score: number;
  /** The sum of effective times over this seat's correct answers. */
  correctMs: number;
}

export function compareSeats(a: RoomSeatScore, b: RoomSeatScore): number {
  return b.score - a.score || a.correctMs - b.correctMs;
}

/** Standings, best first; seats equal on score and time share the rank. */
export function rankRoom(seats: readonly RoomSeatScore[]): RoomStanding[] {
  return rankBy(seats, compareSeats).map(({ item, rank }) => ({
    seatId: item.seatId,
    name: item.name,
    score: item.score,
    rank,
  }));
}

export interface StandingGap {
  /** The nearest seat ranked ahead, and how many points behind it this one is. */
  above: { name: string; gap: number } | null;
  /** For the leader: the next seat, and how far ahead the leader is. */
  below: { name: string; gap: number } | null;
}

/** "4th, 120 behind Brave Otter"; for the leader, "1st, 80 ahead of Plucky Otter". */
export function standingGap(
  standings: readonly RoomStanding[],
  seatId: SeatId,
): StandingGap {
  const index = standings.findIndex((standing) => standing.seatId === seatId);
  const me = standings[index];
  if (me === undefined) return { above: null, below: null };
  let above: StandingGap["above"] = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    const other = standings[i];
    if (other !== undefined && other.rank < me.rank) {
      above = { name: other.name, gap: other.score - me.score };
      break;
    }
  }
  let below: StandingGap["below"] = null;
  if (above === null) {
    const next = standings.find((standing) => standing.rank > me.rank);
    if (next !== undefined) {
      below = { name: next.name, gap: me.score - next.score };
    }
  }
  return { above, below };
}
