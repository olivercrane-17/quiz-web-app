/**
 * The sealed content the mock "server" judges with (ARCHITECTURE §5.6,
 * §7.4): the fixture Daily for each date on the `e2e` track, the content
 * each round names, and the judge's view of each answer list. It wraps the
 * content loaders (`loadFixtureDaily`, `loadFixtureRoundContent`,
 * `loadFixtureList` and `entityLookupOf`), which load their chunks on first
 * use, so the mock chunk itself carries no content and the bundle scan
 * (§5.4) finds only `fx.` ids.
 *
 * Tests pass their own `MockContent` to createMockBackend to play Dailies
 * the fixtures don't have.
 */
import type { EntityLookup } from "@/engine/rounds";
import type { AnswerType, ItemId, LocalDate } from "@/engine/types";
import {
  loadFixtureDaily,
  loadFixtureRoundContent,
  type FixtureDaily,
  type FixtureRoundContent,
} from "@/content/loaders/fixture-daily";
import {
  entityLookupOf,
  loadFixtureList,
} from "@/content/loaders/fixtures/lists";

export type { FixtureDaily, FixtureRoundContent };

/** The content track the fixtures play on (§8.17). */
export const MOCK_TRACK = "e2e";

export interface MockContent {
  /** The Daily scheduled for a local date, or null before the epoch. */
  daily(date: LocalDate): Promise<FixtureDaily | null>;
  /** The sealed content a round names, or null for an unknown id. */
  round(contentId: ItemId): Promise<FixtureRoundContent | null>;
  /** The active entries of an answer list, or null for a type with no list. */
  entities(type: AnswerType): Promise<EntityLookup | null>;
}

/** The fixture content of content/fixtures/. */
export function fixtureContent(): MockContent {
  return {
    daily: (date) => loadFixtureDaily(date),
    round: (contentId) => loadFixtureRoundContent(contentId),
    async entities(type) {
      const list = await loadFixtureList(type);
      return list === null ? null : entityLookupOf(list);
    },
  };
}
