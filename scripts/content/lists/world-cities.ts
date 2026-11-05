/**
 * datasets/world-cities (`world-cities`, CC BY 4.0, from GeoNames): a check
 * that a city's GeoNames id exists and names it. Its country column holds
 * English names, not codes, so the country is geonames-cities' to check.
 * Locator: `geonameid=1850147`.
 */
import { csvObjects } from "./csv.ts";
import type { DatasetRecord, ListImporter } from "./importer.ts";

export const worldCities: ListImporter = {
  key: "world-cities",
  role: "check",
  types: ["city"],
  load(file) {
    const records = new Map<string, DatasetRecord>();
    for (const row of csvObjects(file("world-cities.csv"))) {
      const id = row.geonameid ?? "";
      if (id === "" || records.has(id)) continue;
      records.set(id, {
        locator: `geonameid=${id}`,
        names: [row.name ?? ""],
        facts: {},
      });
    }
    return {
      resolve(type, locator) {
        const id = /^geonameid=(\d+)\b/.exec(locator)?.[1];
        return type === "city" && id ? (records.get(id) ?? null) : null;
      },
    };
  },
};
