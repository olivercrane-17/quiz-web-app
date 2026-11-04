// @vitest-environment node
/**
 * The answer-list importers behind content:lists (ARCHITECTURE §5.5): each
 * reads its dataset's real format, resolves the locators list entries cite,
 * and reports what disagrees; the CLDR source adds the forms an entry lacks.
 * The datasets here are small invented files in each dataset's own format,
 * pinned by their sha256 like the real manifest pins the real files.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  removeTempDirs,
  tempDir,
  writeTree,
} from "../../../src/content/pipeline/__fixtures__/builders.ts";
import { loadBank } from "../../../src/content/pipeline/bank.ts";
import { resolveLayout } from "../../../src/content/pipeline/layout.ts";
import { lintBank } from "../lint.ts";
import type { AnswerEntity } from "../../../src/content/schema/answer-lists.ts";
import type {
  DatasetEntry,
  DatasetManifest,
} from "../../../src/content/schema/datasets.ts";
import type { AnswerType } from "../../../src/content/schema/primitives.ts";
import { parseCsv } from "./csv.ts";
import { pinnedFiles, samePerson, sourceTokens } from "./importer.ts";
import { IMPORTERS, reimport } from "./index.ts";

afterAll(removeTempDirs);

const COMMIT = "a".repeat(40);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** A cache folder and a manifest pinning the given files, dataset by dataset. */
function datasets(files: Record<string, Record<string, string>>): {
  dir: string;
  manifest: DatasetManifest;
} {
  const dir = tempDir("qz-datasets-");
  const entries: DatasetEntry[] = Object.entries(files).map(([key, byPath]) => {
    for (const [path, text] of Object.entries(byPath)) {
      mkdirSync(join(dir, key, path, ".."), { recursive: true });
      writeFileSync(join(dir, key, path), text);
    }
    return {
      key,
      title: key,
      license: "CC0-1.0",
      retrievedAt: "2026-10-31",
      sourceLabel: key,
      evidence: true,
      use: "tests",
      knownIssues: [],
      kind: "github",
      repo: `fixture/${key}`,
      commit: COMMIT,
      files: Object.entries(byPath).map(([path, text]) => ({
        path,
        url: `https://raw.githubusercontent.com/fixture/${key}/${COMMIT}/${path}`,
        sha256: sha(text),
        bytes: Buffer.byteLength(text),
      })),
    };
  });
  return { dir, manifest: { version: 1, datasets: entries } };
}

function entity(
  id: string,
  name: string,
  source: string,
  qualifier: Record<string, unknown>,
  extra: Partial<AnswerEntity> = {},
): AnswerEntity {
  return {
    id,
    name,
    display: name,
    aliases: [],
    popularity: 0,
    qualifier,
    source,
    status: "active",
    addedIn: "2026-11-01",
    wikidataId: null,
    replacedBy: null,
    ...extra,
  } as AnswerEntity;
}

function list(
  type: AnswerType,
  entities: AnswerEntity[],
  provenance = "l.x.b01",
) {
  return {
    type,
    version: "2026-11-01",
    liveAt: "2026-11-01",
    provenance: [
      { source: provenance, license: "CC0-1.0", retrievedAt: "2026-10-31" },
    ],
    entities,
  };
}

const PIN = "aaaaaaa";

describe("source citations", () => {
  it("reads every dataset token of a source string, whatever comes before it", () => {
    expect(
      sourceTokens(
        "l.person.b03; checked nobel-prizes@63e8e44 id=624, nobel-laureates-2016@de9a728 id=624, tate-artists@a51d8af id=907",
      ),
    ).toEqual([
      { key: "nobel-prizes", version: "63e8e44", locator: "id=624" },
      { key: "nobel-laureates-2016", version: "de9a728", locator: "id=624" },
      { key: "tate-artists", version: "a51d8af", locator: "id=907" },
    ]);
    expect(
      sourceTokens(
        "l.landmark.b02; id from natural-earth@ca96624 ne_50m_geography_regions_points.geojson ne_id=7",
      ),
    ).toEqual([
      {
        key: "natural-earth",
        version: "ca96624",
        locator: "ne_50m_geography_regions_points.geojson ne_id=7",
      },
    ]);
    expect(sourceTokens("l.film.b01")).toEqual([]);
    expect(
      sourceTokens("geonames-cities@1.1.65 name=Tokyo country=JP admin1=40")[0]
        ?.version,
    ).toBe("1.1.65");
  });

  it("matches a person's name across titles, asides, initials and name order", () => {
    expect(samePerson("Paul A. Samuelson", ["Paul Samuelson"])).toBe(true);
    expect(
      samePerson("Sir Chandrasekhara Venkata Raman", ["C. V. Raman"]),
    ).toBe(true);
    expect(samePerson("Marie Curie, née Sklodowska", ["Marie Curie"])).toBe(
      true,
    );
    expect(samePerson("Man Ray (Emmanuel Radnitzky)", ["Man Ray"])).toBe(true);
    expect(samePerson("Xiaobo Liu", ["Liu Xiaobo"])).toBe(true);
    expect(samePerson("Ada Morrow", ["Ida Morrow"])).toBe(false);
  });

  it("reads quoted CSV fields with commas, doubled quotes and line breaks", () => {
    expect(
      parseCsv('id,name\r\n1,"Morrow, Ada ""Ace"""\n2,"two\nlines"\n'),
    ).toEqual([
      ["id", "name"],
      ["1", 'Morrow, Ada "Ace"'],
      ["2", "two\nlines"],
    ]);
  });
});

describe("pinned files", () => {
  it("refuse a missing file and one that no longer matches its pin", () => {
    const { dir, manifest } = datasets({
      ptable: { "PeriodicTableJSON.json": "{}" },
    });
    const dataset = manifest.datasets[0] as DatasetEntry;
    expect(pinnedFiles(dir, dataset)("PeriodicTableJSON.json")).toBe("{}");
    writeFileSync(join(dir, "ptable", "PeriodicTableJSON.json"), "{ }");
    expect(() => pinnedFiles(dir, dataset)("PeriodicTableJSON.json")).toThrow(
      /pinned sha256/,
    );
    expect(() => pinnedFiles(dir, dataset)("other.json")).toThrow(
      /pins no file/,
    );
    const missing = datasets({ ptable: { "PeriodicTableJSON.json": "{}" } });
    const pinnedOnly = {
      ...(missing.manifest.datasets[0] as DatasetEntry),
      key: "ptable",
    };
    expect(() =>
      pinnedFiles(
        join(missing.dir, "nowhere"),
        pinnedOnly,
      )("PeriodicTableJSON.json"),
    ).toThrow(/content:datasets/);
  });
});

describe("the CLDR source", () => {
  const territories = JSON.stringify({
    main: {
      en: {
        localeDisplayNames: {
          territories: {
            QM: "Arvenna",
            "QM-alt-variant": "Arven Republic",
            QN: "Belloria",
            QP: "Cassova",
            EU: "Fixture Union",
          },
        },
      },
    },
  });

  it("adds the forms an entry lacks with --write, under a new version, and lists the records no entry cites", async () => {
    const { dir, manifest } = datasets({
      "cldr-territories": { "territories.json": territories },
    });
    const countries = list(
      "country",
      [
        entity(
          "x.country.arvenna",
          "Arvenna",
          `l.country.b01; cldr-territories@${PIN} QM`,
          { iso_a2: "QM" },
        ),
        entity(
          "x.country.belloria",
          "Belloria",
          `l.country.b01; cldr-territories@${PIN} QN`,
          { iso_a2: "QN" },
        ),
      ],
      `cldr-territories@${PIN}`,
    );
    const dry = reimport(structuredClone(countries), manifest, dir, {
      write: false,
      today: "2026-11-04",
    });
    expect(dry.findings).toEqual([]);
    expect(dry.changes).toEqual([
      { entityId: "x.country.arvenna", add: ["Arven Republic"] },
    ]);
    // EU is a grouping, never a territory; QP is one no entry cites yet.
    expect(dry.uncited).toEqual([
      { dataset: "cldr-territories", locators: ["QP"] },
    ]);
    expect(dry.written).toBe(false);

    const written = structuredClone(countries);
    const report = reimport(written, manifest, dir, {
      write: true,
      today: "2026-11-04",
    });
    expect(report.written).toBe(true);
    expect(written.entities[0]?.aliases).toEqual(["Arven Republic"]);
    expect(written.version).toBe("2026-11-04");
    expect(written.liveAt).toBe("2026-11-04");
    // A second re-import has nothing left to add.
    expect(
      reimport(written, manifest, dir, { write: false, today: "2026-11-05" })
        .changes,
    ).toEqual([]);
    // The written list loads as content:check and content:build load it,
    // liveAt and all, and lints clean of schema findings.
    const tree = await writeTree({
      "answer-lists/country.json": {
        ...written,
        entities: written.entities.map((e) => ({
          ...e,
          id: `fx.${e.id}`,
        })),
      },
    });
    const bank = await loadBank(
      resolveLayout({ repoRoot: REPO_ROOT, root: tree, fixtures: true }),
    );
    expect(bank.lists.get("country")?.entities.size).toBe(2);
    expect(
      lintBank(bank, { dedupe: false, today: "2026-11-04" }).filter(
        (f) => f.rule === "C01",
      ),
    ).toEqual([]);
  });

  it("refuses a citation that resolves to nothing, and warns on an older pin", () => {
    const { dir, manifest } = datasets({
      "cldr-territories": { "territories.json": territories },
    });
    const report = reimport(
      list("country", [
        entity("x.country.nowhere", "Nowhere", `cldr-territories@${PIN} XZ`, {
          iso_a2: "XZ",
        }),
        entity("x.country.cassova", "Cassova", "cldr-territories@bbbbbbb QP", {
          iso_a2: "QP",
        }),
      ]),
      manifest,
      dir,
      { write: false, today: "2026-11-04" },
    );
    expect(report.findings.map((f) => `${f.severity} ${f.entityId}`)).toEqual([
      "error x.country.nowhere",
      "warn x.country.cassova",
    ]);
  });
});

describe("the check datasets", () => {
  /** One fixture per importer: a file in its format, an entry that agrees and one that doesn't. */
  const cases: {
    key: string;
    type: AnswerType;
    files: Record<string, string>;
    agrees: AnswerEntity;
    disagrees: AnswerEntity;
    because: RegExp;
  }[] = [
    {
      key: "mledoze-countries",
      type: "country",
      files: {
        "countries.json": JSON.stringify([
          {
            cca2: "XA",
            cca3: "XAR",
            name: { common: "Arvenna", official: "Republic of Arvenna" },
            altSpellings: ["XA"],
          },
        ]),
      },
      agrees: entity(
        "x.country.arvenna",
        "Arvenna",
        `mledoze-countries@${PIN} cca3=XAR`,
        { iso_a2: "XA" },
      ),
      disagrees: entity(
        "x.country.arvenna",
        "Arvenna",
        `mledoze-countries@${PIN} cca3=XAR`,
        { iso_a2: "XB" },
      ),
      because: /qualifier\.iso_a2/,
    },
    {
      key: "ptable",
      type: "element",
      files: {
        "PeriodicTableJSON.json": JSON.stringify({
          elements: [{ number: 55, symbol: "Cs", name: "Cesium" }],
        }),
      },
      agrees: entity(
        "x.element.caesium",
        "Caesium",
        `ptable@${PIN} number=55`,
        { symbol: "Cs", number: 55 },
      ),
      disagrees: entity(
        "x.element.caesium",
        "Caesium",
        `ptable@${PIN} number=55`,
        { symbol: "Ce", number: 55 },
      ),
      because: /qualifier\.symbol/,
    },
    {
      key: "geonames-cities",
      type: "city",
      files: {
        "cities.json": JSON.stringify([
          { name: "Cindral", country: "XA", admin1: "04" },
          { name: "Ostrel", country: "XA", admin1: "" },
        ]),
      },
      agrees: entity(
        "x.city.ostrel-xa",
        "Ostrel",
        `geonames-cities@${PIN} name=Ostrel country=XA admin1=none`,
        { country: "XA", admin1: null },
      ),
      disagrees: entity(
        "x.city.cindral-xa",
        "Cindral",
        `geonames-cities@${PIN} name=Cindral country=XA admin1=04`,
        { country: "XA", admin1: "05" },
      ),
      because: /qualifier\.admin1/,
    },
    {
      key: "world-cities",
      type: "city",
      files: {
        "world-cities.csv":
          "name,country,subcountry,geonameid\nCindral,Arvenna,North,123\n",
      },
      agrees: entity(
        "x.city.cindral-xa",
        "Cindral",
        `world-cities@${PIN} geonameid=123`,
        { country: "XA", admin1: "04" },
      ),
      disagrees: entity(
        "x.city.cindral-xa",
        "Ostrel",
        `world-cities@${PIN} geonameid=123`,
        { country: "XA", admin1: "04" },
      ),
      because: /names it "Cindral"/,
    },
    {
      key: "moma-artists",
      type: "person",
      files: {
        "Artists.json": JSON.stringify([
          {
            ConstituentID: 912,
            DisplayName: "Ada Morrow",
            BeginDate: 1912,
            "Wiki QID": "Q99912",
            ULAN: null,
          },
        ]),
      },
      agrees: entity(
        "Q99912",
        "Ada Morrow",
        `moma-artists@${PIN} ConstituentID=912`,
        { descriptor: "sculptor", born: 1912 },
      ),
      disagrees: entity(
        "x.person.ada-morrow",
        "Ada Morrow",
        `moma-artists@${PIN} ConstituentID=912`,
        { descriptor: "sculptor", born: 1912 },
      ),
      because: /id is "x\.person\.ada-morrow"; moma-artists gives "Q99912"/,
    },
    {
      key: "tate-artists",
      type: "person",
      files: {
        "artist_data.csv":
          'id,name,gender,dates,yearOfBirth\n266,"Morrow, Ada",Female,born 1912,1912\n',
      },
      agrees: entity(
        "x.person.ada-morrow",
        "Ada Morrow",
        `tate-artists@${PIN} id=266`,
        { descriptor: "sculptor", born: 1912 },
      ),
      disagrees: entity(
        "x.person.ada-morrow",
        "Ada Morrow",
        `tate-artists@${PIN} id=266`,
        { descriptor: "sculptor", born: 1913 },
      ),
      because: /qualifier\.born is 1913/,
    },
    {
      key: "nobel-prizes",
      type: "book",
      files: {
        "prize.json": JSON.stringify({
          prizes: [
            {
              year: "1950",
              category: "literature",
              laureates: [
                { id: "619", firstname: "Thomas Stearns", surname: "Vellum" },
              ],
            },
          ],
        }),
      },
      agrees: entity(
        "x.book.reeds-vellum",
        "Reeds",
        `nobel-prizes@${PIN} id=619`,
        { author: "T. S. Vellum", year: 1922 },
      ),
      disagrees: entity(
        "x.book.reeds-heron",
        "Reeds",
        `nobel-prizes@${PIN} id=619`,
        { author: "Ada Heron", year: 1922 },
      ),
      because: /qualifier\.author/,
    },
    {
      key: "nobel-laureates-2016",
      type: "person",
      files: {
        "laureate.json": JSON.stringify({
          laureates: [
            {
              id: "26",
              firstname: "Ada",
              surname: "Morrow",
              born: "1912-03-04",
            },
          ],
        }),
      },
      agrees: entity(
        "x.person.ada-morrow",
        "Ada Morrow",
        `nobel-laureates-2016@${PIN} id=26`,
        { descriptor: "physicist", born: 1912 },
      ),
      disagrees: entity(
        "x.person.ida-morrow",
        "Ida Morrow",
        `nobel-laureates-2016@${PIN} id=26`,
        { descriptor: "physicist", born: 1912 },
      ),
      because: /names it "Ada Morrow"/,
    },
    {
      key: "natural-earth",
      type: "landmark",
      files: {
        "points.geojson": JSON.stringify({
          features: [
            {
              properties: {
                ne_id: 7,
                name: "Vellum Falls",
                wikidataid: "Q777",
              },
            },
          ],
        }),
      },
      agrees: entity(
        "Q777",
        "Vellum Falls",
        `natural-earth@${PIN} points.geojson ne_id=7`,
        { country: "XA" },
      ),
      disagrees: entity(
        "Q778",
        "Vellum Falls",
        `natural-earth@${PIN} points.geojson ne_id=7`,
        { country: "XA" },
      ),
      because: /id is "Q778"; natural-earth gives "Q777"/,
    },
  ];

  for (const c of cases) {
    it(`${c.key} resolves its locators and reports a disagreement`, () => {
      const { dir, manifest } = datasets({ [c.key]: c.files });
      const good = reimport(list(c.type, [c.agrees]), manifest, dir, {
        write: false,
        today: "2026-11-04",
      });
      expect(good.findings).toEqual([]);
      expect(good.checked).toEqual({ [c.key]: 1 });
      const bad = reimport(list(c.type, [c.disagrees]), manifest, dir, {
        write: false,
        today: "2026-11-04",
      });
      expect(bad.findings.map((f) => f.message).join(" ")).toMatch(c.because);
      expect(bad.findings.every((f) => f.severity === "warn")).toBe(true);
      // A check dataset never changes a list.
      expect(bad.changes).toEqual([]);
    });
  }

  it("worldcup finds the cited scorers in the cited tournaments", () => {
    const tournament = (scorer: string) =>
      JSON.stringify({
        name: "World Cup",
        matches: [{ goals1: [{ name: scorer, minute: "9" }], goals2: [] }],
      });
    const { dir, manifest } = datasets({
      worldcup: {
        "2014/worldcup.json": tournament("Ada Morrow"),
        "2018/worldcup.json": tournament("Morrow"),
      },
    });
    const cite = (locator: string) =>
      reimport(
        list("person", [
          entity(
            "x.person.ada-morrow",
            "Ada Morrow",
            `worldcup@${PIN} ${locator}`,
            { descriptor: "footballer", born: 1990 },
          ),
        ]),
        manifest,
        dir,
        { write: false, today: "2026-11-04" },
      ).findings.map((f) => f.severity);
    expect(cite("2014 scorer Ada Morrow (Arvenna)")).toEqual([]);
    expect(
      cite("2014 scorer Ada Morrow and 2018 scorer Morrow (Arvenna)"),
    ).toEqual([]);
    expect(cite("2014 and 2018 scorer Ada Morrow (Arvenna)")).toEqual([
      "error",
    ]);
  });

  it("has one importer per pinned dataset a list cites", () => {
    expect(IMPORTERS.map((importer) => importer.key).sort()).toEqual([
      "cldr-territories",
      "geonames-cities",
      "mledoze-countries",
      "moma-artists",
      "natural-earth",
      "nobel-laureates-2016",
      "nobel-prizes",
      "ptable",
      "tate-artists",
      "world-cities",
      "worldcup",
    ]);
    // Only CLDR may supply shipped names; the rest are evidence (§9.5.1).
    expect(
      IMPORTERS.filter((importer) => importer.role === "source").map(
        (i) => i.key,
      ),
    ).toEqual(["cldr-territories"]);
  });
});

describe("lists no dataset feeds", () => {
  it("have nothing to re-import, and an unpinned dataset is an error", () => {
    const { dir, manifest } = datasets({});
    const films = reimport(
      list("film", [
        entity("x.film.reeds-1950", "Reeds (1950)", "l.film.b01", {
          year: 1950,
        }),
      ]),
      manifest,
      dir,
      { write: false, today: "2026-11-04" },
    );
    expect(films.findings).toEqual([]);
    expect(films.checked).toEqual({});
    const unpinned = reimport(
      list("film", [
        entity("x.film.reeds-1950", "Reeds (1950)", "imdb@1234567 tt0001", {
          year: 1950,
        }),
      ]),
      manifest,
      dir,
      { write: false, today: "2026-11-04" },
    );
    expect(unpinned.findings.map((f) => f.message).join(" ")).toContain(
      "doesn't pin",
    );
  });
});
