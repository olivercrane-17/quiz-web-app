/**
 * The sealed fixture content (content/fixtures/, ARCHITECTURE §5.6),
 * decoded straight from the source files: mysteries, encores, the room
 * pack, the Dailies' choice rounds, the e2e schedule and its spare sets,
 * plus the rule that gives every date a fixture Daily (cycle.ts).
 *
 * The mock backend plays the build's generated copy of the same content
 * (src/backend/mock/fixtures.generated.ts); this module serves tests and
 * the E2E support code, which read the sources, and a parity test keeps
 * the two equal. Sealed kinds exist on the client only in mock builds, so
 * no page imports this module.
 */
import { DAILY_EPOCH } from "@/config/shared";
import type {
  EncoreContent,
  ItemId,
  LocalDate,
  MysteryContent,
  PackId,
  SealedChoiceContent,
} from "@/engine/types";

import fxParty from "../../../../content/fixtures/room-packs/fx-party.json";
import dly from "../../../../content/fixtures/room-packs/dly.json";
import e0101 from "../../../../content/fixtures/encores/fx.e.0101.json";
import e0102 from "../../../../content/fixtures/encores/fx.e.0102.json";
import e0103 from "../../../../content/fixtures/encores/fx.e.0103.json";
import mFilm0101 from "../../../../content/fixtures/mysteries/fx.m.film.0101.json";
import mGeo0101 from "../../../../content/fixtures/mysteries/fx.m.geo.0101.json";
import mGeo0102 from "../../../../content/fixtures/mysteries/fx.m.geo.0102.json";
import mHist0101 from "../../../../content/fixtures/mysteries/fx.m.hist.0101.json";
import mSci0101 from "../../../../content/fixtures/mysteries/fx.m.sci.0101.json";
import mSci0102 from "../../../../content/fixtures/mysteries/fx.m.sci.0102.json";
import schedule202611 from "../../../../content/fixtures/schedule/2026-11.json";
import spare01 from "../../../../content/fixtures/spares/spare.01.json";
import spare02 from "../../../../content/fixtures/spares/spare.02.json";
import spare03 from "../../../../content/fixtures/spares/spare.03.json";
import spare04 from "../../../../content/fixtures/spares/spare.04.json";
import spare05 from "../../../../content/fixtures/spares/spare.05.json";
import spare06 from "../../../../content/fixtures/spares/spare.06.json";
import { fixtureDailyFrom, type FixtureDaily } from "./cycle";
import {
  decodeEncore,
  decodeMystery,
  decodeRoomPack,
  decodeScheduleMonth,
  decodeSpareSet,
  isInPlay,
  type DecodedRoomPack,
  type DecodedSpare,
  type ScheduledDaily,
} from "./decode";

type Source = readonly [file: string, raw: unknown];

const MYSTERY_SOURCES: readonly Source[] = [
  ["mysteries/fx.m.film.0101.json", mFilm0101],
  ["mysteries/fx.m.geo.0101.json", mGeo0101],
  ["mysteries/fx.m.geo.0102.json", mGeo0102],
  ["mysteries/fx.m.hist.0101.json", mHist0101],
  ["mysteries/fx.m.sci.0101.json", mSci0101],
  ["mysteries/fx.m.sci.0102.json", mSci0102],
];
const ENCORE_SOURCES: readonly Source[] = [
  ["encores/fx.e.0101.json", e0101],
  ["encores/fx.e.0102.json", e0102],
  ["encores/fx.e.0103.json", e0103],
];
const PACK_SOURCES: readonly Source[] = [
  ["room-packs/dly.json", dly],
  ["room-packs/fx-party.json", fxParty],
];
const SCHEDULE_SOURCES: readonly Source[] = [
  ["schedule/2026-11.json", schedule202611],
];
const SPARE_SOURCES: readonly Source[] = [
  ["spares/spare.01.json", spare01],
  ["spares/spare.02.json", spare02],
  ["spares/spare.03.json", spare03],
  ["spares/spare.04.json", spare04],
  ["spares/spare.05.json", spare05],
  ["spares/spare.06.json", spare06],
];

/** The files this module bundles, relative to content/fixtures/. */
export const FIXTURE_SEALED_FILES: readonly string[] = [
  ...MYSTERY_SOURCES,
  ...ENCORE_SOURCES,
  ...PACK_SOURCES,
  ...SCHEDULE_SOURCES,
  ...SPARE_SOURCES,
].map(([file]) => file);

/** The fixtures' content track (§8.17). */
export const FIXTURE_TRACK = "e2e";

function byId<T extends { id: ItemId }>(
  values: readonly T[],
): ReadonlyMap<ItemId, T> {
  return new Map(values.map((value) => [value.id, value]));
}

export const FIXTURE_MYSTERIES: ReadonlyMap<ItemId, MysteryContent> = byId(
  MYSTERY_SOURCES.filter(([, raw]) => isInPlay(raw)).map(([file, raw]) =>
    decodeMystery(raw, file),
  ),
);

export const FIXTURE_ENCORES: ReadonlyMap<ItemId, EncoreContent> = byId(
  ENCORE_SOURCES.filter(([, raw]) => isInPlay(raw)).map(([file, raw]) =>
    decodeEncore(raw, file),
  ),
);

const PACKS: readonly DecodedRoomPack[] = PACK_SOURCES.map(([file, raw]) =>
  decodeRoomPack(raw, file),
);

/**
 * `room-packs/dly.json` is not a room pack: it holds the sealed choice
 * rounds of the [mc ×9, encore] and [mc ×5, mystery, encore] Dailies, which
 * the content schema has no other home for. It must never be hostable.
 */
const DAILY_CHOICES_FILE = "dly";
const isDailyChoices = (pack: DecodedRoomPack) =>
  pack.pack.id === DAILY_CHOICES_FILE;

/** The hostable room packs: the one 15-question pack of §5.6, `fx-party`. */
export const FIXTURE_ROOM_PACKS: ReadonlyMap<PackId, DecodedRoomPack> = new Map(
  PACKS.filter((pack) => !isDailyChoices(pack)).map((pack) => [
    pack.pack.id,
    pack,
  ]),
);

/** The fixture Dailies' sealed choice rounds (`fx.r.dly.*`). */
export const FIXTURE_DAILY_CHOICES: ReadonlyMap<ItemId, SealedChoiceContent> =
  byId(PACKS.filter(isDailyChoices).flatMap((pack) => pack.questions));

/** Every sealed choice question: the room pack's and the Dailies'. */
export const FIXTURE_CHOICES: ReadonlyMap<ItemId, SealedChoiceContent> = byId(
  PACKS.flatMap((pack) => pack.questions),
);

/** The e2e track's dated Dailies, oldest first. */
export const FIXTURE_SCHEDULE: readonly ScheduledDaily[] =
  SCHEDULE_SOURCES.flatMap(
    ([file, raw]) => decodeScheduleMonth(raw, file).dailies,
  ).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/** The spare sets the e2e cycle plays, in id order. */
export const FIXTURE_SPARES: readonly DecodedSpare[] = SPARE_SOURCES.map(
  ([file, raw]) => decodeSpareSet(raw, file),
).sort((a, b) => a.id.localeCompare(b.id));

export type FixtureRoundContent =
  MysteryContent | EncoreContent | SealedChoiceContent;

/** The sealed content a round names, or null. */
export function fixtureRoundContent(id: ItemId): FixtureRoundContent | null {
  return (
    FIXTURE_MYSTERIES.get(id) ??
    FIXTURE_ENCORES.get(id) ??
    FIXTURE_CHOICES.get(id) ??
    null
  );
}

export type { FixtureDaily };

/**
 * The fixture Daily for a date (content/fixtures/README.md): the dated row
 * if the schedule has one, otherwise spare set ((n - 1) mod 6) + 1 for
 * Daily number n. Null before the epoch.
 */
export function fixtureDailyFor(
  date: LocalDate,
  epoch: LocalDate = DAILY_EPOCH,
): FixtureDaily | null {
  return fixtureDailyFrom(date, epoch, FIXTURE_SCHEDULE, FIXTURE_SPARES);
}
