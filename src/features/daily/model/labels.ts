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
import { solvedStamp } from "@/features/rounds";
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

/**
 * The E pill's mark once the Encore resolves (R2-06): 🎯 inside the
 * bullseye band, else the % off ("13%", "<1%", ">999%", or "8y" for a year
 * 8 years out), short enough for the 38 px pill. Round 2 left E blank, so
 * the header never said how the Encore went.
 */
export function encoreMark(
  outcome: Extract<RoundOutcome, { family: "encore" }>,
): string {
  const error = outcome.error;
  if (error === null) return "E";
  if (outcome.band === "bullseye")
    return DAILY_SCREEN_COPY.segment.bullseyeMark;
  const amount = error.display.replace(/ off$/, "");
  if (error.kind === "years") {
    return `${amount.replace(/\s*years?$/, "")}y`;
  }
  return amount.replace(/^under\s*/, "<").replace(/^over\s*/, ">");
}

/** The most rounds the header shows as lettered pills (DESIGN §6.6). */
export const PILL_ROUNDS_MAX = 6;

/** Pills for the four-round Daily, slim segments past PILL_ROUNDS_MAX rounds. */
export function progressVariant(state: RunState): "pills" | "bar" {
  return state.slots.length <= PILL_ROUNDS_MAX ? "pills" : "bar";
}

/**
 * The header's pills (DESIGN §6.6, decision D11): M1 to M3 and E, or one
 * slim segment per question when a composition has more rounds than pills
 * fit. A solved Mystery shows the points it earned as "+2" on the correct
 * fill, so the mark can't be read as a clue or Mystery number; a miss shows
 * the X, a withdrawn round a dash; a locked-in Encore shows 🎯 or how far
 * off it was (R2-06, `encoreMark`). Each has its own screen-reader label
 * ("Mystery 1, solved on clue 3, 2 points"; "Encore, locked in, 13% off, a
 * close guess").
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
          ? words.marks.mystery(slot.meta.ordinal)
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
        label:
          outcome.error === null
            ? label
            : `${label}, ${words.encoreResult(outcome.error.display, outcome.band)}`,
        ...(pills ? { mark: encoreMark(outcome) } : {}),
      };
    }
    if (outcome.family === "mystery") {
      return outcome.solvedOn === null
        ? { status: "wrong", current, label }
        : {
            status: "correct",
            current,
            label: `${label}, ${words.points(outcome.points)}`,
            mark: words.gained(outcome.points),
          };
    }
    return { status: outcome.correct ? "correct" : "wrong", current, label };
  });
}

/**
 * Where the run stands in words, for a header too narrow for the pills (at
 * 200% text on a phone, R1-03): "Mystery 2 of 3", "Encore", "Question 4 of
 * 9". The screen shows it in the pills' place, never beside them, and for
 * the eye only: the pills' labelled list stays in the accessibility tree,
 * so a screen reader still hears every finished round's result. The words
 * leave those results out: in the room a phone's header has at 200% text,
 * "Encore · M1 +1 · M2 +1 · M3 +1" took four lines, a third of a 360 by 640
 * screen, and D11 keeps a running total out of the header.
 */
export function progressText(state: RunState): string {
  const slot = state.slots[state.index];
  if (slot === undefined) return DAILY_SCREEN_COPY.progress;
  const words = DAILY_SCREEN_COPY.roundLabel;
  const family = ROUND_FAMILY[slot.meta.type];
  return family === "encore"
    ? words.encore
    : family === "mystery"
      ? words.mystery(slot.meta.ordinal, slot.meta.ofType)
      : words.choice(slot.meta.ordinal, slot.meta.ofType);
}

/**
 * Whether the round's time is counting on the server right now (PRD
 * §4.1.4, decision D19): a clue or the Encore is open, even with the Daily
 * closed or How to play open, or Continue has asked for the next one and
 * the server opens it as the request lands. On a reveal, before the Daily
 * opens, after a begin_round that failed and once it is finished, it is
 * stopped. Leave's words say which (R2-01).
 */
export function clockRunning(state: RunState | null): boolean {
  if (state === null) return false;
  switch (state.phase) {
    case "active":
    case "judging":
      return true;
    case "opening":
      return state.failing === null && state.error === null;
    default:
      return false;
  }
}

/** The open round's number for `how_to_play_open` (PRD §7.2), or "none" between runs. */
export function openRoundNumber(state: RunState | null): number | "none" {
  if (state === null) return "none";
  return state.phase === "opening" ||
    state.phase === "active" ||
    state.phase === "judging" ||
    state.phase === "revealed"
    ? state.index + 1
    : "none";
}

/**
 * The time a round had before this page loaded, which the server counted
 * and the device can't have (R1-06): added to that round's running total,
 * open or resolved, until the next snapshot replaces it.
 */
export interface TimeOffset {
  index: number;
  ms: number;
}

/**
 * The one rounding rule for Daily time (RITE round 3, R3-01): down to the
 * whole second. The running stopwatch shows its time floored
 * (`formatStopwatch`), each resolved round counts its recorded time floored,
 * and the server floors each round the same way before it adds them up for
 * the finish (`recordedRoundMs` in the mock's sealed area). Round 2 rounded
 * resolved rounds to the nearest second while the display floored, so 254.6 s
 * showed as 4:14 and recorded as 4:15. Floor never shows a time higher than
 * the one counted.
 */
export function wholeSecond(ms: number): number {
  return Math.floor(Math.max(0, ms) / 1000) * 1000;
}

/**
 * Total active time so far (PRD §3.1.3): each round's active interval,
 * capped at 15 minutes; it runs only while a round is open and is frozen on
 * reveals and between rounds. The device's own measure, plus what the
 * server counted before a reload (R1-06): resolved rounds arrive with their
 * recorded time in `activeMs`, and the round open at the reload carries
 * `offset`. A resolved round counts in whole seconds, as the server adds it
 * (R2-08, R3-01), and the verdict that resolves a round brings the server's
 * own figure for it (`withRecordedTime`). The server's figure decides.
 *
 * What RITE round 3 changed (R3-01):
 * - **Frozen from the press.** While an answer is with the server
 *   (`judging`), the open round counts up to the moment it was sent
 *   (`pending.sentAt`), never the time since: the header stops when Lock in
 *   is pressed and holds that value through the reveal. Round 3's header ran
 *   on through the round trip, for about 2 s on a slow phone (Marcus).
 * - **Time away counts.** The open round runs on while the page is hidden,
 *   as decision D19 says and as the server counts it, so coming back never
 *   shows a clock that paused, and a reveal never adds the time away at once.
 *   `claimedRoundMs` reports the same figure to the server.
 */
export function elapsedMs(
  state: RunState,
  now: EpochMs,
  offset: TimeOffset | null = null,
): number {
  let total = 0;
  state.slots.forEach((slot, index) => {
    const before = offset !== null && offset.index === index ? offset.ms : 0;
    if (slot.outcome !== null) {
      total += wholeSecond(Math.min(slot.activeMs + before, SHARED.roundCapMs));
      return;
    }
    const running =
      index === state.index &&
      slot.openedAt !== null &&
      (state.phase === "active" || state.phase === "judging");
    if (!running || slot.openedAt === null) {
      total += Math.min(before, SHARED.roundCapMs);
      return;
    }
    const until =
      state.phase === "judging" && state.pending !== null
        ? state.pending.sentAt
        : now;
    const active = Math.max(0, until - slot.openedAt);
    total += Math.min(active + before, SHARED.roundCapMs);
  });
  return total;
}

/**
 * The round time a judge call reports as the client's measure (PRD §4.3.3,
 * R3-01): the round's whole interval as the stopwatch counts it, so the
 * number on the header when the answer is sent is the number the server
 * records unless its own bound beats it by more than the latency allowance
 * (the honest-play case). That is the device's interval since the round
 * opened on this page, time hidden included (decision D19; `hiddenMs` still
 * goes to the server on its own for the honest-play flags), plus what the
 * server counted before a reload (`offset`), floored to the millisecond so
 * the server's floor to the second can never land above the header's.
 */
export function claimedRoundMs(
  command: { index: number; activeMs: number; hiddenMs: number },
  offset: TimeOffset | null,
): number {
  const before =
    offset !== null && offset.index === command.index ? offset.ms : 0;
  const ms = Math.max(0, command.activeMs) + Math.max(0, command.hiddenMs);
  return Math.floor(Math.min(ms + before, SHARED.roundCapMs));
}

/**
 * The claim a judge call sends, measured at the press (R3-01, round 4
 * review): while the answer is pending, the header stays frozen at
 * `pending.sentAt`, so the claim is the round's interval up to that moment.
 * A retried judge carries `activeMs` and `hiddenMs` worked out at the
 * retry's own time (the reducer's `onRetry`); claiming those would let a
 * send that never reached the server move the reveal past the header by up
 * to the retry's wait. Without a pending press for this command's round (a
 * state the machine shouldn't send a judge from), the command's own figures
 * stand, as `claimedRoundMs` reads them.
 */
export function claimedAtPress(
  state: RunState,
  command: { index: number; key: string; activeMs: number; hiddenMs: number },
  offset: TimeOffset | null,
): number {
  const slot = state.slots[command.index];
  const pending = state.pending;
  if (
    slot === undefined ||
    slot.openedAt === null ||
    pending === null ||
    pending.key !== command.key ||
    state.index !== command.index
  ) {
    return claimedRoundMs(command, offset);
  }
  const before =
    offset !== null && offset.index === command.index ? offset.ms : 0;
  const ms = Math.max(0, pending.sentAt - slot.openedAt);
  return Math.floor(Math.min(ms + before, SHARED.roundCapMs));
}

/**
 * A resolving verdict's recorded time for round `index` (R2-08): it takes
 * the place of the device's own measure of the round and of the offset a
 * reload left for it, so the round counts exactly what the server recorded.
 * Since round 3 the client reports the round's whole interval, the reload's
 * offset included (`claimedRoundMs`), and the offset is the server's raw
 * interval, so the recorded whole second is the header's at the press unless
 * the server's own bound beat it by more than the latency allowance. A
 * backend that reports no figure leaves the controller to pass the claim it
 * sent, so the reveal still shows the press's value. A round still open,
 * or a time that isn't a number, changes nothing.
 */
export function withRecordedTime(
  state: RunState,
  offset: TimeOffset | null,
  index: number,
  recordedMs: number,
): { state: RunState; offset: TimeOffset | null } {
  const slot = state.slots[index];
  if (
    slot === undefined ||
    slot.outcome === null ||
    !Number.isFinite(recordedMs)
  ) {
    return { state, offset };
  }
  const slots = state.slots.slice();
  slots[index] = { ...slot, activeMs: Math.max(0, recordedMs) };
  return {
    state: { ...state, slots },
    offset: offset !== null && offset.index === index ? null : offset,
  };
}

/**
 * What the stopwatch shows: the finish's official total once the last
 * verdict or the finish has brought it, frozen from Lock in on (R2-08), so
 * the header's last reading is the stop screen's time; until then, the
 * running total.
 */
export function stopwatchMs(
  state: RunState,
  now: EpochMs,
  offset: TimeOffset | null,
  totalMs: number | null,
): number {
  return totalMs ?? elapsedMs(state, now, offset);
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

/**
 * The polite status message for a verdict (PRD §3.0.3, §3.1.4). `history`
 * says whether the round showed a miss before a solve, which picks D10's
 * stamp; without it a solve on clue 1 or 2 reads "Knew it.".
 */
export function announcementText(
  announcement: Announcement,
  history?: { missed: boolean },
): string {
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
        solvedStamp({
          clue: announcement.clue,
          // Clue 4 shows the four options alone, so its solve is a pick.
          picked: announcement.clue === 4,
          missed: history?.missed ?? false,
        }),
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
