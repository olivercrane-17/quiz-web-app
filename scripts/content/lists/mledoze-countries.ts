/**
 * mledoze/countries (`mledoze-countries`, ODbL-1.0): a check, never a source,
 * because ODbL data is for single facts only (CONTENT_GUIDE §9.5.1). Each
 * country entry that cites it must keep its ISO code, and one of the
 * record's names (common, official or an alternative spelling) must be
 * among the entry's. Locator: `cca3=CZE`.
 */
import type { DatasetRecord, ListImporter } from "./importer.ts";

interface Country {
  cca2: string;
  cca3: string;
  name: { common: string; official: string };
  altSpellings?: string[];
}

export const mledozeCountries: ListImporter = {
  key: "mledoze-countries",
  role: "check",
  types: ["country"],
  load(file) {
    const records = new Map<string, DatasetRecord>();
    for (const country of JSON.parse(file("countries.json")) as Country[]) {
      records.set(country.cca3, {
        locator: `cca3=${country.cca3}`,
        names: [
          country.name.common,
          country.name.official,
          ...(country.altSpellings ?? []).filter(
            (s) => !/^[A-Z]{2,3}$/.test(s),
          ),
        ],
        facts: { iso_a2: country.cca2 },
      });
    }
    return {
      resolve(type, locator) {
        const code = /^cca3=([A-Z]{3})\b/.exec(locator)?.[1];
        return type === "country" && code ? (records.get(code) ?? null) : null;
      },
    };
  },
};
