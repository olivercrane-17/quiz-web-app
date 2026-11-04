/**
 * MoMA's artists (`moma-artists`, CC0): a check of people and musicians the
 * museum records. Where the record carries a Wikidata QID, that QID is the
 * entry's id (CONTENT_GUIDE §2.12), so the id must match it; the birth year
 * must match `qualifier.born` where both are known. Locator:
 * `ConstituentID=912`.
 */
import type { DatasetRecord, ListImporter } from "./importer.ts";

interface Artist {
  ConstituentID: number;
  DisplayName: string;
  BeginDate: number;
  "Wiki QID": string | null;
}

export const momaArtists: ListImporter = {
  key: "moma-artists",
  role: "check",
  names: "person",
  types: ["person", "music_artist"],
  load(file) {
    const records = new Map<number, DatasetRecord>();
    for (const artist of JSON.parse(file("Artists.json")) as Artist[]) {
      const facts: Record<string, string | number> = {};
      if (artist.BeginDate > 0) facts.born = artist.BeginDate;
      if (artist["Wiki QID"]) facts.id = artist["Wiki QID"];
      records.set(artist.ConstituentID, {
        locator: `ConstituentID=${artist.ConstituentID}`,
        names: [artist.DisplayName],
        facts,
      });
    }
    return {
      resolve(_type, locator) {
        const id = Number(/^ConstituentID=(\d+)\b/.exec(locator)?.[1]);
        return records.get(id) ?? null;
      },
    };
  },
};
