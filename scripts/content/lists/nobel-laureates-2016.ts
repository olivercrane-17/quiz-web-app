/**
 * NobelDB's laureates to 2016 (`nobel-laureates-2016`, Apache-2.0): a check
 * of a laureate's name and birth year. Locator: `id=26`.
 */
import type { DatasetRecord, ListImporter } from "./importer.ts";

interface Laureate {
  id: string;
  firstname: string;
  surname?: string;
  born?: string;
}

export const nobelLaureates2016: ListImporter = {
  key: "nobel-laureates-2016",
  role: "check",
  names: "person",
  types: ["person", "music_artist"],
  load(file) {
    const records = new Map<string, DatasetRecord>();
    for (const laureate of (
      JSON.parse(file("laureate.json")) as { laureates: Laureate[] }
    ).laureates) {
      const born = Number(laureate.born?.slice(0, 4));
      records.set(laureate.id, {
        locator: `id=${laureate.id}`,
        names: [`${laureate.firstname} ${laureate.surname ?? ""}`.trim()],
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
