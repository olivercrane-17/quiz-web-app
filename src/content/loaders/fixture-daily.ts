/**
 * Fixture Dailies for the mock backend (ARCHITECTURE §2.3, §5.6). Final
 * signatures; DLY-1 builds the mock's sealed and daily areas on them. Sealed
 * fixture content stays in the chunk this module loads, which only the mock
 * backend imports.
 */
import type { ItemId, LocalDate } from "@/engine/types";

import type { FixtureDaily, FixtureRoundContent } from "./fixtures/sealed";

export type { FixtureDaily, FixtureRoundContent };

/** The fixture Daily for a local date, or null before the epoch. */
export async function loadFixtureDaily(
  date: LocalDate,
  epoch?: LocalDate,
): Promise<FixtureDaily | null> {
  const { fixtureDailyFor } = await import("./fixtures/sealed");
  return epoch === undefined
    ? fixtureDailyFor(date)
    : fixtureDailyFor(date, epoch);
}

/** The sealed content a fixture round names: a mystery, an encore or a choice question. */
export async function loadFixtureRoundContent(
  contentId: ItemId,
): Promise<FixtureRoundContent | null> {
  const { fixtureRoundContent } = await import("./fixtures/sealed");
  return fixtureRoundContent(contentId);
}
