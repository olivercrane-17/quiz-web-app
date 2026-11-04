/**
 * The fixture world's client content (ARCHITECTURE §5.6): the practice
 * packs and answer lists the build generates from content/fixtures/ into
 * src/content/generated/fixture-world.json, in the same shapes the bank
 * ships. One lazy chunk, loaded the first time a mock build or a unit test
 * needs it, so no route carries it in its first load.
 */
import type { EntityLookup, EntityRecord } from "@/engine/rounds/types";
import {
  ANSWER_TYPES,
  CATEGORY_IDS,
  type AnswerList,
  type AnswerType,
  type CategoryId,
  type EntityId,
} from "@/engine/types";

import type { PracticePack } from "../types";
import { WireError, decodeListFile, decodePackFile } from "./wire";

interface FixtureWorld {
  version: string;
  packs: ReadonlyMap<CategoryId, PracticePack>;
  lists: ReadonlyMap<AnswerType, AnswerList>;
  lookups: ReadonlyMap<AnswerType, EntityLookup>;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WireError(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function decodeWorld(raw: unknown): FixtureWorld {
  const o = record(raw, "fixture-world");
  const packsRaw = record(o.packs, "fixture-world.packs");
  const listsRaw = record(o.lists, "fixture-world.lists");
  const labelsRaw = record(o.labels, "fixture-world.labels");
  const packs = new Map<CategoryId, PracticePack>();
  for (const category of CATEGORY_IDS) {
    if (packsRaw[category] === undefined) continue;
    packs.set(
      category,
      decodePackFile(packsRaw[category], category, `packs.${category}`),
    );
  }
  const lists = new Map<AnswerType, AnswerList>();
  const lookups = new Map<AnswerType, EntityLookup>();
  for (const type of ANSWER_TYPES) {
    if (listsRaw[type] === undefined) continue;
    const list = decodeListFile(listsRaw[type], type, `lists.${type}`);
    lists.set(type, list);
    const labels = record(labelsRaw[type] ?? {}, `labels.${type}`);
    const records = new Map<EntityId, EntityRecord>();
    for (const entity of list.entities) {
      const label = labels[entity.id];
      records.set(entity.id, {
        id: entity.id,
        display: entity.display,
        optionLabel: typeof label === "string" ? label : entity.display,
      });
    }
    lookups.set(type, { get: (id) => records.get(id) ?? null });
  }
  return {
    version: typeof o.version === "string" ? o.version : "",
    packs,
    lists,
    lookups,
  };
}

let world: Promise<FixtureWorld> | null = null;

function loadWorld(): Promise<FixtureWorld> {
  world ??= import("../generated/fixture-world.json").then((module) =>
    decodeWorld(module.default),
  );
  world.catch(() => {
    world = null;
  });
  return world;
}

/** The fixture pack of a category, or null when the fixtures have none. */
export async function fixtureWorldPack(
  category: CategoryId,
): Promise<PracticePack | null> {
  return (await loadWorld()).packs.get(category) ?? null;
}

/** The fixture list of a type, as the client projection, or null. */
export async function fixtureWorldList(
  type: AnswerType,
): Promise<AnswerList | null> {
  return (await loadWorld()).lists.get(type) ?? null;
}

/** The judge's view of a fixture list (§4.4): display and clue-4 option label. */
export async function fixtureWorldEntityLookup(
  type: AnswerType,
): Promise<EntityLookup | null> {
  return (await loadWorld()).lookups.get(type) ?? null;
}
