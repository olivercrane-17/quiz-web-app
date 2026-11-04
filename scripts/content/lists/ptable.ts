/**
 * Bowserinator's periodic table (`ptable`, CC BY-SA 3.0): a check only. The
 * element list is written from IUPAC's table and checked fact by fact, so
 * no BY-SA data ships (CONTENT_GUIDE §9.5.1, §11.4). The symbol and atomic
 * number must agree; names don't, because ptable spells "Cesium" where
 * IUPAC has caesium. Locator: `number=55`.
 */
import type { DatasetRecord, ListImporter } from "./importer.ts";

export const ptable: ListImporter = {
  key: "ptable",
  role: "check",
  types: ["element"],
  load(file) {
    const data = JSON.parse(file("PeriodicTableJSON.json")) as {
      elements: { number: number; symbol: string; name: string }[];
    };
    const records = new Map<number, DatasetRecord>();
    for (const element of data.elements)
      records.set(element.number, {
        locator: `number=${element.number}`,
        names: [],
        facts: { number: element.number, symbol: element.symbol },
      });
    return {
      resolve(type, locator) {
        const n = Number(/^number=(\d+)\b/.exec(locator)?.[1]);
        return type === "element" ? (records.get(n) ?? null) : null;
      },
    };
  },
};
