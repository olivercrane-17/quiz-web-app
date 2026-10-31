/**
 * The fixture answer lists (content/fixtures/answer-lists/, ARCHITECTURE
 * §5.6), decoded into the client projection of §5.5 and the records the
 * judge needs. Each list is its own chunk, loaded on first use.
 */
import type { EntityLookup, EntityRecord } from "@/engine/rounds/types";
import type { AnswerType, EntityId } from "@/engine/types";

import { decodeAnswerList, type DecodedAnswerList } from "./decode";

/** The list types the fixtures ship. */
export const FIXTURE_LIST_TYPES = [
  "country",
  "element",
  "film",
  "music_artist",
  "person",
] as const satisfies readonly AnswerType[];

/** The files this module loads, relative to content/fixtures/. */
export const FIXTURE_LIST_FILES: readonly string[] = FIXTURE_LIST_TYPES.map(
  (type) => `answer-lists/${type}.json`,
);

async function source(type: AnswerType): Promise<unknown | null> {
  switch (type) {
    case "country":
      return (
        await import("../../../../content/fixtures/answer-lists/country.json")
      ).default;
    case "element":
      return (
        await import("../../../../content/fixtures/answer-lists/element.json")
      ).default;
    case "film":
      return (
        await import("../../../../content/fixtures/answer-lists/film.json")
      ).default;
    case "music_artist":
      return (
        await import("../../../../content/fixtures/answer-lists/music_artist.json")
      ).default;
    case "person":
      return (
        await import("../../../../content/fixtures/answer-lists/person.json")
      ).default;
    default:
      return null;
  }
}

const cache = new Map<AnswerType, Promise<DecodedAnswerList | null>>();

/** A fixture list, decoded once per tab; null for a type the fixtures don't ship. */
export function loadFixtureList(
  type: AnswerType,
): Promise<DecodedAnswerList | null> {
  let loaded = cache.get(type);
  if (loaded === undefined) {
    loaded = source(type).then((raw) =>
      raw === null ? null : decodeAnswerList(raw, `answer-lists/${type}.json`),
    );
    loaded.catch(() => cache.delete(type));
    cache.set(type, loaded);
  }
  return loaded;
}

/** An EntityLookup over a decoded list's active entries (the judge's view, §4.4). */
export function entityLookupOf(decoded: DecodedAnswerList): EntityLookup {
  const records = new Map<EntityId, EntityRecord>(
    decoded.records.map((record) => [record.id, record]),
  );
  return { get: (id) => records.get(id) ?? null };
}
