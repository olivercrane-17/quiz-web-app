/**
 * GeoNames cities (`geonames-cities`, npm cities.json, CC BY 4.0): a check
 * of a city's country and first-level division. Homonyms are real (two
 * places called Cusco in Peru), so a locator names all three: `name=Tokyo
 * country=JP admin1=40` (CONTENT_GUIDE §9.5.1), with `admin1=none` for a
 * city-state, which has none.
 */
import type { DatasetRecord, ListImporter } from "./importer.ts";

interface City {
  name: string;
  country: string;
  admin1: string;
}

const LOCATOR = /^name=(.+?) country=([A-Z]{2}) admin1=(\S*)$/;

export const geonamesCities: ListImporter = {
  key: "geonames-cities",
  role: "check",
  types: ["city"],
  load(file) {
    const records = new Map<string, DatasetRecord>();
    for (const city of JSON.parse(file("cities.json")) as City[]) {
      const locator = `name=${city.name} country=${city.country} admin1=${city.admin1}`;
      if (records.has(locator)) continue;
      records.set(locator, {
        locator,
        names: [city.name],
        facts:
          city.admin1 === ""
            ? { country: city.country }
            : { country: city.country, admin1: city.admin1 },
      });
    }
    return {
      resolve(type, locator) {
        const match = LOCATOR.exec(locator.trim());
        if (type !== "city" || !match) return null;
        // City-states have no first-level division: the lists write admin1=none.
        const admin1 = match[3] === "none" ? "" : match[3];
        return (
          records.get(
            `name=${match[1]} country=${match[2]} admin1=${admin1}`,
          ) ?? null
        );
      },
    };
  },
};
