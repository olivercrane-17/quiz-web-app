/**
 * What the Daily screen says about its rounds, worked out from the run
 * state alone (pure, so the screen and the tests share it): round labels,
 * Continue labels, the header's progress pills, the stopwatch, the
 * announcements' copy and the analytics score band.
 */
import { SHARED } from "@/config/shared";
import type { Announcement } from "@/engine/rounds";
import type { RunState } from "@/engine/run";
import {
  ROUND_FAMILY,
  type EpochMs,
  type RoundMeta,
  type RoundOutcome,
} from "@/engine/types";
import type { ProgressSegment } from "@/ui/progress-segments";

import { ANNOUNCE_COPY, DAILY_SCREEN_COPY } from "../client-copy";
import { ANSWER_TYPE_WORDS, DIFFICULTY_WORDS } from "../words";

/** "Mystery 2 of 3 · Medium", "Encore", "Question 4 of 9 · Easy" (PRD §3.1.4). */
export function roundLabel(meta: RoundMeta): string {
  const family = ROUND_FAMILY[meta.type];
  const words = DAILY_SCREEN_COPY.roundLabel;
  const base =
    family === "encore"
      ? words.encore
      : family === "mystery"
        ? words.mystery(meta.ordinal, meta.ofType)
        : words.choice(meta.ordinal, meta.ofType);
  return family === "encore" || meta.difficulty === null
    ? base
    : `${base} · ${DIFFICULTY_WORDS[meta.difficulty]}`;
}

/** "The answer is a film": known from the round's meta before its clue arrives. */
export function answerTypeLine(meta: RoundMeta): string | null {
  return meta.answerType === null
    ? null
    : DAILY_SCREEN_COPY.answerTypeLine(ANSWER_TYPE_WORDS[meta.answerType]);
}

/** The Continue button under a reveal: names where it goes (PRD §3.1.3). */
export function continueLabel(state: RunState): string {
  const next = state.slots[state.index + 1];
  const words = DAILY_SCREEN_COPY.continueTo;
  if (next === undefined) return words.results;
  const family = ROUND_FAMILY[next.meta.type];
  return family === "mystery"
    ? words.mystery
    : family === "encore"
      ? words.encore
      : words.choice;
}

function outcomeWords(outcome: RoundOutcome): string {
  const words = DAILY_SCREEN_COPY.segment;
  if (outcome.voided) return words.withdrawn;
  if (outcome.family === "mystery") {
    return outcome.solvedOn === null
      ? words.missed
      : words.solvedOn(outcome.solvedOn);
  }
  if (outcome.family === "encore") return words.lockedIn;
  return outcome.correct ? words.right : words.wrong;
}

/** The most rounds the header shows as lettered pills (DESIGN §6.6). */
export const PILL_ROUNDS_MAX = 6;

/** Pills for the four-round Daily, slim segments past PILL_ROUNDS_MAX rounds. */
export function progressVariant(state: RunState): "pills" | "bar" {
  return state.slots.length <= PILL_ROUNDS_MAX ? "pills" : "bar";
}

/**
 * The header's pills (DESIGN §6.6): M1 to M3 and E, or one slim segment per
 * question when a composition has more rounds than pills fit. A solved
 * Mystery shows its points, a miss an X, a withdrawn round a dash; each has
 * its own screen-reader label ("Mystery 2, solved on clue 2").
 */
export function progressSegments(state: RunState): ProgressSegment[] {
  const pills = progressVariant(state) === "pills";
  const words = DAILY_SCREEN_COPY.segment;
  return state.slots.map((slot, index): ProgressSegment => {
    const family = ROUND_FAMILY[slot.meta.type];
    const name =
      family === "mystery"
        ? words.mystery(slot.meta.ordinal)
        : family === "encore"
          ? words.encore
          : words.choice(slot.meta.ordinal);
    const current =
      index === state.index &&
      state.phase !== "finished" &&
      state.phase !== "finishing";
    const outcome = slot.outcome;
    const upcomingMark = pills
      ? family === "encore"
        ? "E"
        : family === "mystery"
          ? `M${slot.meta.ordinal}`
          : String(slot.meta.ordinal)
      : undefined;
    if (outcome === null) {
      return {
        status: "upcoming",
        current,
        label: `${name}, ${current ? words.playing : words.upcoming}`,
        ...(upcomingMark === undefined ? {} : { mark: upcomingMark }),
      };
    }
    const label = `${name}, ${outcomeWords(outcome)}`;
    if (outcome.voided) return { status: "voided", current, label };
    if (outcome.family === "encore") {
      return {
        status: "done",
        current,
        label,
        ...(pills ? { mark: "E" } : {}),
      };
    }
    if (outcome.family === "mystery") {
      return outcome.solvedOn === null
        ? { status: "wrong", current, label }
        : { status: "correct", current, label, mark: String(outcome.points) };
    }
    return { status: outcome.correct ? "correct" : "wrong", current, label };
  });
}

/**
 * Total active time so far (PRD §3.1.3): each round's active interval,
 * capped at 15 minutes; it runs only while a round is open and frozen on
 * reveals and between rounds. The device's own measure; the server's
 * decides.
 */
export function elapsedMs(state: RunState, now: EpochMs): number {
  let total = 0;
  state.slots.forEach((slot, index) => {
    if (slot.outcome !== null) {
      total += Math.min(slot.activeMs, SHARED.roundCapMs);
      return;
    }
    const running =
      index === state.index &&
      slot.openedAt !== null &&
      (state.phase === "active" || state.phase === "judging");
    if (!running || slot.openedAt === null) return;
    const hiddenNow =
      state.hiddenAt === null
        ? 0
        : Math.max(0, now - Math.max(state.hiddenAt, slot.openedAt));
    const active = now - slot.openedAt - slot.hiddenMs - hiddenNow;
    total += Math.min(Math.max(0, active), SHARED.roundCapMs);
  });
  return total;
}

/** The stopwatch's `m:ss` (`h:mm:ss` past an hour), tabular figures in the view. */
export function formatStopwatch(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

/** A Mystery's worth on clue k: 4, 3, 2, 1 (PRD §4.1.2). */
const worthOn = (clue: number) => Math.max(1, 5 - clue);

const capitalize = (text: string) =>
  text.length === 0 ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** The polite status message for a verdict (PRD §3.0.3, §3.1.4). */
export function announcementText(announcement: Announcement): string {
  const words = ANNOUNCE_COPY;
  switch (announcement.kind) {
    case "correct":
      return words.correct(announcement.answer);
    case "wrong_choice":
      return words.wrongChoice(announcement.chosen, announcement.answer);
    case "wrong_guess":
      return words.wrongGuess(
        announcement.guess,
        announcement.clue,
        worthOn(announcement.clue),
        announcement.clueText,
      );
    case "next_clue":
      return words.nextClue(
        announcement.clue,
        worthOn(announcement.clue),
        announcement.clueText,
      );
    case "mystery_solved":
      return words.solved(
        announcement.answer,
        announcement.clue,
        announcement.points,
      );
    case "mystery_missed":
      // A withdrawn Mystery resolves unjudged, and the plugin has no answer
      // to name (the controller words withdrawals before they reach here).
      return announcement.answer === ""
        ? DAILY_SCREEN_COPY.withdrawn.mystery
        : words.missed(announcement.answer);
    case "encore_result": {
      const error = capitalize(announcement.error);
      const exact = error === "Spot on";
      const band =
        exact || announcement.band === null
          ? ""
          : `${words.encore[announcement.band]} `;
      return `${band}${words.encore.result(error, announcement.answer)}`;
    }
  }
}

/** `run_complete`'s score band (PRD §7.2): the Daily's four bands. */
export function scoreBand(points: number): "0-3" | "4-6" | "7-9" | "10-12" {
  if (points <= 3) return "0-3";
  if (points <= 6) return "4-6";
  if (points <= 9) return "7-9";
  return "10-12";
}
