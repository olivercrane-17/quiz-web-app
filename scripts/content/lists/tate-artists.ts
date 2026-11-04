/**
 * Tate's artists (`tate-artists`, CC0): a check of a person's name and
 * birth year. Tate writes names "Surname, Forenames"; both orders count.
 * Locator: `id=266`.
 */
import { csvObjects } from "./csv.ts";
import type { DatasetRecord, ListImporter } from "./importer.ts";

/** "Abbott, Berenice" as "Berenice Abbott". */
export function forenamesFirst(name: string): string {
  const [surname, forenames] = name.split(/,\s*/, 2);
  return forenames ? `${forenames} ${surname ?? ""}`.trim() : name;
}

export const tateArtists: ListImporter = {
  key: "tate-artists",
  role: "check",
  names: "person",
  types: ["person", "music_artist"],
  load(file) {
    const records = new Map<string, DatasetRecord>();
    for (const row of csvObjects(file("artist_data.csv"))) {
      const id = row.id ?? "";
      if (id === "") continue;
      const name = row.name ?? "";
      const born = Number(row.yearOfBirth);
      records.set(id, {
        locator: `id=${id}`,
        names: [...new Set([forenamesFirst(name), name])],
        facts: Number.isInteger(born) && born > 0 ? { born } : {},
      });
    }
    return {
      resolve(_type, locator) {
        const id = /^id=(\d+)\b/.exec(locator)?.[1];
        return id ? (records.get(id) ?? null) : null;
      },
    };
  },
};
