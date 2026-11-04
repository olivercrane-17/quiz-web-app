/**
 * The e2e track's Daily for each date (content/fixtures/README.md, "The
 * e2e cycle"): a date with a row in the fixture schedule plays that row;
 * every other date from the epoch plays spare set ((n - 1) mod S) + 1 for
 * Daily number n, where S is the number of spare sets. Shared by the raw
 * fixture loader (sealed.ts) and the mock backend, which reads the build's
 * generated fixtures; the e2e-track seed (SQL-3) must generate the same.
 */
import { compositionIdOf } from "@/engine/composition";
import { dailyNumberFor } from "@/engine/time";
import type {
  CompositionId,
  DailyIdentity,
  LocalDate,
  RoundSpec,
} from "@/engine/types";

export interface CycleDaily {
  date: LocalDate;
  rounds: RoundSpec[];
}

export interface CycleSpare {
  id: string;
  rounds: RoundSpec[];
}

export interface FixtureDaily {
  daily: DailyIdentity;
  composition: CompositionId;
  rounds: RoundSpec[];
  /** Where the Daily came from: a dated row, or the spare its number picks. */
  source: { kind: "schedule" } | { kind: "spare"; spareId: string };
}

/**
 * The fixture Daily for a date, from a schedule (any order) and the spare
 * sets in id order. Null before the epoch, or with no spare to play.
 */
export function fixtureDailyFrom(
  date: LocalDate,
  epoch: LocalDate,
  schedule: readonly CycleDaily[],
  spares: readonly CycleSpare[],
): FixtureDaily | null {
  const dailyNumber = dailyNumberFor(date, epoch);
  if (dailyNumber === null) return null;
  const daily: DailyIdentity = { dailyNumber, date };
  const dated = schedule.find((row) => row.date === date);
  if (dated !== undefined) {
    return {
      daily,
      composition: compositionIdOf(dated.rounds.map((round) => round.type)),
      rounds: dated.rounds,
      source: { kind: "schedule" },
    };
  }
  const spare = spares[(dailyNumber - 1) % spares.length];
  if (spare === undefined) return null;
  return {
    daily,
    composition: compositionIdOf(spare.rounds.map((round) => round.type)),
    rounds: spare.rounds,
    source: { kind: "spare", spareId: spare.id },
  };
}
