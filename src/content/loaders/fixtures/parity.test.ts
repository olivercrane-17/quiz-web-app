/**
 * The build's generated fixture world equals the fixture sources, decoded
 * straight from content/fixtures/. Mock builds and the mock backend play
 * the generated copy; tests and the E2E support code read the sources; so
 * the two must never drift apart (content:check's drift check guards the
 * files, this guards the conversion).
 */
import { describe, expect, it } from "vitest";

import { DAILY_EPOCH } from "@/config/shared";
import { addDays } from "@/engine/time";
import { parseLocalDate } from "@/engine/types";

import { FIXTURE_DATA } from "../../../backend/mock/fixtures.generated";
import { loadAnswerList, loadEntityLookup } from "../answer-lists";
import { loadPracticePack } from "../practice";
import { fixtureDailyFrom } from "./cycle";
import { decodeMockFixtures } from "./generated";
import { FIXTURE_LIST_TYPES, loadFixtureList } from "./lists";
import { FIXTURE_PRACTICE_ITEMS } from "./practice";
import {
  FIXTURE_CHOICES,
  FIXTURE_ENCORES,
  FIXTURE_MYSTERIES,
  FIXTURE_ROOM_PACKS,
  fixtureDailyFor,
} from "./sealed";

describe("the generated fixture world", () => {
  it("serves exactly the fixture practice items, by category", async () => {
    const categories = [
      ...new Set(FIXTURE_PRACTICE_ITEMS.map((item) => item.category)),
    ];
    for (const category of categories) {
      const pack = await loadPracticePack(category);
      if (!pack.ok) throw new Error(`${category}: ${pack.error}`);
      const sources = FIXTURE_PRACTICE_ITEMS.filter(
        (item) => item.category === category,
      ).sort((a, b) => (a.id < b.id ? -1 : 1));
      expect(pack.value.items).toEqual(sources);
    }
  });

  it("serves exactly the fixture lists, with the judge's option labels", async () => {
    for (const type of FIXTURE_LIST_TYPES) {
      const decoded = await loadFixtureList(type);
      if (decoded === null) throw new Error(`no ${type} source`);
      const list = await loadAnswerList(type);
      if (!list.ok) throw new Error(`${type}: ${list.error}`);
      expect(list.value).toEqual(decoded.list);
      const lookup = await loadEntityLookup(type);
      if (!lookup.ok) throw new Error(`${type}: ${lookup.error}`);
      for (const record of decoded.records) {
        expect(lookup.value.get(record.id)).toEqual(record);
      }
    }
  });

  it("gives the mock the same sealed content and the same Daily for every date", () => {
    const generated = decodeMockFixtures(FIXTURE_DATA);
    expect([...generated.mysteries.values()]).toEqual(
      [...FIXTURE_MYSTERIES.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
    expect([...generated.encores.values()]).toEqual(
      [...FIXTURE_ENCORES.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
    expect(
      [...generated.choices.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    ).toEqual(
      [...FIXTURE_CHOICES.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
    expect([...generated.roomPacks.values()]).toEqual(
      [...FIXTURE_ROOM_PACKS.values()].map((pack) => pack.pack),
    );
    const start = parseLocalDate("2026-09-15");
    if (start === null) throw new Error("bad date");
    for (let day = 0; day < 120; day += 1) {
      const date = addDays(start, day);
      expect(
        fixtureDailyFrom(
          date,
          DAILY_EPOCH,
          generated.schedule,
          generated.spares,
        ),
        date,
      ).toEqual(fixtureDailyFor(date));
    }
  });
});
