/**
 * Decodes the mock backend's generated fixtures
 * (src/backend/mock/fixtures.generated.ts, ARCHITECTURE §5.3): the e2e
 * track's sealed content, already in the built shapes of §3.2. The mock
 * hands the module's data here on first use; the decoders check every
 * field and make the branded ids (§3.1), so a stale or hand-edited module
 * fails loudly instead of serving a broken Daily.
 */
import type {
  EncoreContent,
  ItemId,
  MysteryContent,
  PackId,
  RoomPack,
  SealedChoiceContent,
} from "@/engine/types";
import { parseItemId, parsePackId } from "@/engine/types";

import { decodeSealedChoice } from "../wire";
import type { CycleDaily, CycleSpare } from "./cycle";
import {
  ContentDecodeError,
  decodeEncore,
  decodeMystery,
  decodeScheduleMonth,
  decodeSpareSet,
} from "./decode";

export interface MockFixtureContent {
  version: string;
  mysteries: ReadonlyMap<ItemId, MysteryContent>;
  encores: ReadonlyMap<ItemId, EncoreContent>;
  /** Every sealed choice question: the room packs' and the Dailies'. */
  choices: ReadonlyMap<ItemId, SealedChoiceContent>;
  /** The hostable room packs. */
  roomPacks: ReadonlyMap<PackId, RoomPack>;
  /** The e2e track's dated Dailies, oldest first. */
  schedule: readonly CycleDaily[];
  /** The e2e track's spare sets, in id order. */
  spares: readonly CycleSpare[];
}

type Obj = Record<string, unknown>;

function object(value: unknown, path: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ContentDecodeError(path, "must be an object");
  }
  return value as Obj;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value))
    throw new ContentDecodeError(path, "must be an array");
  return value;
}

function byId<T extends { id: ItemId }>(values: readonly T[]) {
  return new Map(values.map((value) => [value.id, value]));
}

export function decodeMockFixtures(raw: unknown): MockFixtureContent {
  const o = object(raw, "fixtures");
  const mysteries = array(o.mysteries, "mysteries").map((value, i) =>
    decodeMystery(value, `mysteries[${i}]`),
  );
  const encores = array(o.encores, "encores").map((value, i) =>
    decodeEncore(value, `encores[${i}]`),
  );
  const choices = array(o.choices, "choices").map((value, i) =>
    decodeSealedChoice(value, `choices[${i}]`),
  );
  const roomPacks = array(o.roomPacks, "roomPacks").map(
    (value, i): RoomPack => {
      const path = `roomPacks[${i}]`;
      const pack = object(value, path);
      const id =
        parsePackId(pack.id) ??
        (() => {
          throw new ContentDecodeError(`${path}.id`, "is not a pack id");
        })();
      const title = pack.title;
      const theme = pack.theme;
      if (typeof title !== "string" || typeof theme !== "string") {
        throw new ContentDecodeError(path, "needs a title and a theme");
      }
      return {
        id,
        title,
        theme,
        questionIds: array(pack.questionIds, `${path}.questionIds`).map(
          (questionId, j) =>
            parseItemId(questionId) ??
            (() => {
              throw new ContentDecodeError(
                `${path}.questionIds[${j}]`,
                "is not an item id",
              );
            })(),
        ),
      };
    },
  );
  const schedule = array(o.schedule, "schedule").map((value, i): CycleDaily => {
    const row = object(value, `schedule[${i}]`);
    const [daily] = decodeScheduleMonth(
      { track: row.track, dailies: [row] },
      `schedule[${i}]`,
    ).dailies;
    if (daily === undefined) {
      throw new ContentDecodeError(`schedule[${i}]`, "is not a Daily");
    }
    return daily;
  });
  const spares = array(o.spares, "spares").map((value, i) =>
    decodeSpareSet(value, `spares[${i}]`),
  );
  return {
    version: typeof o.version === "string" ? o.version : "",
    mysteries: byId(mysteries),
    encores: byId(encores),
    choices: byId(choices),
    roomPacks: new Map(roomPacks.map((pack) => [pack.id, pack])),
    schedule: [...schedule].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    ),
    spares: [...spares].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
