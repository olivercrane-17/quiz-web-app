/**
 * CLDR territories (`cldr-territories`, Unicode-3.0): the source of the
 * country list. Each two-letter territory gives the short name and its
 * variants (`-alt-variant`, `-alt-short`), which the list keeps as the
 * entry's name, display or aliases (CONTENT_GUIDE §2.10: "CLDR forms and
 * variants become aliases"), with straight apostrophes. The display
 * overrides of §2.10 stay the list builder's: a re-import only adds a form
 * an entry lacks. Locator: the code, `CZ`.
 */
import type { DatasetRecord, ListImporter } from "./importer.ts";

/** Codes CLDR lists that are not territories: groupings, pseudo-locales, unknown. */
const NOT_TERRITORIES = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ"]);
const FILE = "territories.json";

export const cldrTerritories: ListImporter = {
  key: "cldr-territories",
  role: "source",
  types: ["country"],
  load(file) {
    const data = JSON.parse(file(FILE)) as {
      main: {
        en: { localeDisplayNames: { territories: Record<string, string> } };
      };
    };
    const names = data.main.en.localeDisplayNames.territories;
    const records = new Map<string, DatasetRecord>();
    for (const [code, name] of Object.entries(names)) {
      if (!/^[A-Z]{2}$/.test(code) || NOT_TERRITORIES.has(code)) continue;
      const forms = [
        name,
        names[`${code}-alt-variant`],
        names[`${code}-alt-short`],
      ].filter((form): form is string => typeof form === "string");
      records.set(code, {
        locator: code,
        names: [...new Set(forms)],
        facts: { iso_a2: code },
      });
    }
    return {
      resolve: (type, locator) =>
        type === "country" ? (records.get(locator.trim()) ?? null) : null,
      enumerate: (type) => (type === "country" ? [...records.values()] : []),
    };
  },
};
