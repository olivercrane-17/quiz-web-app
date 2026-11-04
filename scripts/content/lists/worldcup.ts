/**
 * openfootball's World Cups (`worldcup`, public domain): a check that the
 * goals an entry cites exist. A locator quotes the dataset's own scorer
 * name for each tournament, `2014 and 2022 scorer Lionel Messi (Argentina)`
 * or `2006 scorer Zidane (France)`; every named scorer must have scored in
 * every tournament named before it. Which person a scorer name is stays the
 * list builder's call, so names are not compared.
 */
import type { ListImporter } from "./importer.ts";

interface Match {
  goals1?: { name: string }[];
  goals2?: { name: string }[];
}

const CLAIM =
  /((?:\d{4})(?:\s+and\s+\d{4})*)\s+scorer\s+(.+?)(?=\s+and\s+\d{4}\s+scorer|\s+\(|$)/g;
const YEARS = [
  1930, 1934, 1938, 1950, 1954, 1958, 1962, 1966, 1970, 1974, 1978, 1982, 1986,
  1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022,
];

export const worldcup: ListImporter = {
  key: "worldcup",
  role: "check",
  types: ["person"],
  load(file) {
    const scorers = new Map<number, Set<string>>();
    const of = (year: number) => {
      const known = scorers.get(year);
      if (known) return known;
      const names = new Set<string>();
      if (YEARS.includes(year)) {
        const data = JSON.parse(file(`${year}/worldcup.json`)) as {
          matches: Match[];
        };
        for (const match of data.matches)
          for (const goal of [...(match.goals1 ?? []), ...(match.goals2 ?? [])])
            names.add(goal.name);
      }
      scorers.set(year, names);
      return names;
    };
    return {
      resolve(_type, locator) {
        const claims = [...locator.matchAll(CLAIM)];
        if (claims.length === 0) return null;
        for (const claim of claims) {
          const name = (claim[2] ?? "").trim();
          for (const year of (claim[1] ?? "").split(/\s+and\s+/).map(Number))
            if (!of(year).has(name)) return null;
        }
        return { locator: locator.trim(), names: [], facts: {} };
      },
    };
  },
};
