/**
 * The mock daily area (ARCHITECTURE §7.4, §8.4), following the SQL rules
 * with engine code.
 *
 * - `today(tz)` is get_today: it never registers. With a valid credential
 *   it uses the effective today (§8.7), raising the player's latest served
 *   date as `private.player_today` does, so the next start serves the date
 *   the card showed, and the player's attempt status; without one, the
 *   request zone's date, and nothing is written. It carries one chip per round
 *   (types, difficulty and answer types only: they are public from clue 1
 *   anyway), the played count from 50 finished ranked runs (AC-DLY-33),
 *   the finished score and grid, and when the next Daily unlocks.
 * - `results(attemptId)` is get_daily_results in its basic form: the
 *   caller's finished attempts only, with the cold-start percentile view.
 *
 * DLY-3 owns this file from Wave 6 and adds the engine percentile,
 * histogram, personal figures and `numbers` (with the `addFinishers`
 * control); ARC-1 adds `archive`.
 */
import { shareGrid } from "@/engine/share/text";
import { addDays, globalWindow, startOfLocalDay } from "@/engine/time";
import {
  ROUND_FAMILY,
  type DailyResults,
  type DailyTodayCard,
  type EncoreError,
  type Result,
  type RoundOutcome,
  type TodayRoundChip,
} from "@/engine/types";

import { unavailableArea } from "../../areas";
import { fail, ok } from "../../errors";
import type { DailyApi } from "../../types";
import type { MockContext } from "../context";
import type { FixtureDaily } from "../fixtures";
import { playerToday, resolveZone, verifyCredential } from "./identity";
import {
  allAttempts,
  attemptFor,
  snapshotOf,
  type MockAttemptRow,
} from "./sealed";

/** The methods this area really implements; the mock contract run skips the rest (§7.5). */
export const MOCK_CAPABILITIES: readonly (keyof DailyApi)[] = [
  "today",
  "results",
];

/** The home card shows the played count from this many finished ranked runs (PRD §3.1.7). */
export const PLAYED_COUNT_MIN = 50;

async function chipsOf(
  ctx: MockContext,
  daily: FixtureDaily,
): Promise<TodayRoundChip[]> {
  return Promise.all(
    daily.rounds.map(async (spec) => {
      let answerType: TodayRoundChip["answerType"] = null;
      if (ROUND_FAMILY[spec.type] === "mystery") {
        const content = await ctx.content.round(spec.contentId);
        const type = (content as { answerType?: unknown } | null)?.answerType;
        answerType = (type ?? null) as TodayRoundChip["answerType"];
      }
      return { type: spec.type, difficulty: spec.difficulty, answerType };
    }),
  );
}

function outcomesOf(attempt: MockAttemptRow): RoundOutcome[] {
  return attempt.rounds.flatMap((row) =>
    row.outcome === null ? [] : [row.outcome],
  );
}

function encoreOf(attempt: MockAttemptRow): EncoreError | null {
  const encore = outcomesOf(attempt).find(
    (outcome): outcome is Extract<RoundOutcome, { family: "encore" }> =>
      outcome.family === "encore",
  );
  return encore === undefined || encore.voided ? null : encore.error;
}

/** Finished ranked runs of a Daily: the played count, and the cold-start pool. */
function rankedFinishers(
  attempts: readonly MockAttemptRow[],
  dailyNumber: number,
): number {
  return attempts.filter(
    (attempt) =>
      attempt.dailyNumber === dailyNumber &&
      attempt.status === "finished" &&
      attempt.ranked,
  ).length;
}

export function createDailyArea(ctx: MockContext): DailyApi {
  return {
    ...unavailableArea("daily"),

    async today(tz) {
      const now = ctx.clock.now();
      const known = ctx.store.read((db) => verifyCredential(ctx, db));
      // With a credential, the effective today raises the latest date
      // served (§8.7), so a start from any zone serves the date shown here.
      // Without one, nothing is written: get_today never registers.
      const { player, zone, date } =
        known === null
          ? {
              player: null,
              zone: resolveZone(tz, null),
              date: playerToday(null, resolveZone(tz, null), now),
            }
          : await ctx.store.write(
              (db) => {
                const row = verifyCredential(ctx, db);
                const where = resolveZone(tz, row);
                return {
                  player: row,
                  zone: where,
                  date: playerToday(row, where, now, { record: true }),
                };
              },
              ["players"],
            );
      const daily = await ctx.content.daily(date);
      if (daily === null) return fail("no_daily");
      const rounds = await chipsOf(ctx, daily);
      return ctx.store.read((db): Result<DailyTodayCard> => {
        const dailyNumber = daily.daily.dailyNumber;
        const attempt =
          player === null ? null : attemptFor(db, player.id, dailyNumber);
        const finished = attempt?.status === "finished";
        const played = rankedFinishers(allAttempts(db), dailyNumber);
        return ok({
          daily: daily.daily,
          rounds,
          playedCount: played >= PLAYED_COUNT_MIN ? played : null,
          status:
            attempt === null
              ? "not_started"
              : finished
                ? "finished"
                : "in_progress",
          attemptId: attempt?.id ?? null,
          progress:
            attempt === null || finished
              ? null
              : { roundIndex: attempt.current, of: attempt.rounds.length },
          finished:
            attempt === null || !finished
              ? null
              : {
                  points: attempt.points,
                  maxPoints: attempt.summary?.maxPoints ?? 0,
                  rows: shareGrid(outcomesOf(attempt)),
                  encore: encoreOf(attempt),
                },
          nextUnlockAt: startOfLocalDay(addDays(date, 1), zone),
          serverTime: now,
        });
      });
    },

    async results(attemptId) {
      const now = ctx.clock.now();
      return ctx.store.read((db): Result<DailyResults> => {
        const player = verifyCredential(ctx, db);
        if (player === null) return fail("auth_failed");
        const attempt = allAttempts(db).find((row) => row.id === attemptId);
        if (
          attempt === undefined ||
          attempt.playerId !== player.id ||
          attempt.status !== "finished" ||
          attempt.summary === null ||
          attempt.dailyNumber === null
        ) {
          return fail("not_found");
        }
        const finishers = rankedFinishers(allAttempts(db), attempt.dailyNumber);
        return ok({
          attempt: snapshotOf(db, attempt, now),
          summary: attempt.summary,
          // The basic view: DLY-3 adds the engine percentile, which the
          // pool earns at percentile_min_n eligible finishers (§8.9).
          percentile: attempt.ranked
            ? { status: "cold_start", finishers }
            : {
                status: "unranked",
                wouldHaveBeaten: null,
                windowOpen:
                  attempt.localDate !== null &&
                  now < globalWindow(attempt.localDate).closesAt,
              },
          histogram: null,
          personal: null,
          challenge: null,
        });
      });
    },
  };
}
