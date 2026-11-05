/**
 * Natural Earth (`natural-earth`, public domain): a check of natural
 * landmarks by feature. A locator names the file and the feature's ne_id,
 * `ne_50m_geography_regions_points.geojson ne_id=1159105019`; the feature
 * names it (`name`, `name_en` or `name_alt`), and where it carries a
 * Wikidata id, that QID is the entry's id (CONTENT_GUIDE §2.12).
 */
import type { DatasetRecord, ListImporter } from "./importer.ts";

interface Feature {
  properties: Record<string, unknown>;
}

const LOCATOR = /^(\S+\.geojson) ne_id=(\d+)\b/;

export const naturalEarth: ListImporter = {
  key: "natural-earth",
  role: "check",
  types: ["landmark", "country", "city"],
  load(file) {
    const byFile = new Map<string, Map<string, DatasetRecord>>();
    const read = (path: string) => {
      const known = byFile.get(path);
      if (known) return known;
      const records = new Map<string, DatasetRecord>();
      for (const feature of (JSON.parse(file(path)) as { features: Feature[] })
        .features) {
        const p = feature.properties;
        const id = String(p.ne_id ?? p.NE_ID ?? "");
        if (id === "") continue;
        const names = [p.name, p.name_en, p.name_alt, p.NAME, p.NAME_EN].filter(
          (name): name is string => typeof name === "string" && name !== "",
        );
        const qid = p.wikidataid ?? p.WIKIDATAID;
        records.set(id, {
          locator: `${path} ne_id=${id}`,
          names: [...new Set(names)],
          facts:
            typeof qid === "string" && /^Q\d+$/.test(qid) ? { id: qid } : {},
        });
      }
      byFile.set(path, records);
      return records;
    };
    return {
      resolve(_type, locator) {
        const match = LOCATOR.exec(locator.trim());
        if (!match) return null;
        try {
          return read(match[1] ?? "").get(match[2] ?? "") ?? null;
        } catch {
          return null;
        }
      },
    };
  },
};
