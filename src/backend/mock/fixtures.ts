/**
 * The sealed content the mock "server" judges with (ARCHITECTURE §5.6,
 * §7.4): the fixture Daily for each date on the `e2e` track, the content
 * each round names, and the judge's view of each answer list.
 *
 * It plays the content build's generated module, fixtures.generated.ts
 * (§5.3, built from content/fixtures/ only, never content/sealed/), which
 * loads as its own chunk on first use and is decoded once, so the mock
 * chunk itself carries no content and the bundle scan (§5.4) finds only
 * `fx.` ids. The judge's view of each list comes from the fixture world's
 * lists, the same ones a mock build's suggestions use.
 *
 * Tests pass their own `MockContent` to createMockBackend to play Dailies
 * the fixtures don't have.
 */
import { DAILY_EPOCH } from "@/config/shared";
import type { EntityLookup } from "@/engine/rounds";
import type { AnswerType, ItemId, LocalDate } from "@/engine/types";
import type {
  FixtureDaily,
  FixtureRoundContent,
} from "@/content/loaders/fixture-daily";
import { fixtureWorldEntityLookup } from "@/content/loaders/fixture-world";
import { fixtureDailyFrom } from "@/content/loaders/fixtures/cycle";
import {
  decodeMockFixtures,
  type MockFixtureContent,
} from "@/content/loaders/fixtures/generated";

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

let generated: Promise<MockFixtureContent> | null = null;

function fixtures(): Promise<MockFixtureContent> {
  generated ??= import("./fixtures.generated").then((module) =>
    decodeMockFixtures(module.FIXTURE_DATA),
  );
  generated.catch(() => {
    generated = null;
  });
  return generated;
}

/** The fixture content of content/fixtures/, as the build generated it. */
export function fixtureContent(): MockContent {
  return {
    async daily(date) {
      const content = await fixtures();
      return fixtureDailyFrom(
        date,
        DAILY_EPOCH,
        content.schedule,
        content.spares,
      );
    },
    async round(contentId) {
      const content = await fixtures();
      return (
        content.mysteries.get(contentId) ??
        content.encores.get(contentId) ??
        content.choices.get(contentId) ??
        null
      );
    },
    entities: (type) => fixtureWorldEntityLookup(type),
  };
}
