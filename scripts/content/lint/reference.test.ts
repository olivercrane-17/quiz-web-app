// @vitest-environment node
/**
 * content/reference/ (CONTENT_GUIDE §11.1): every file there passes its
 * schema, and the four CNT-2 adds hold what the guide says they hold.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  removeTempDirs,
  tempDir,
} from "../../../src/content/pipeline/__fixtures__/builders.ts";
import {
  CapitalsExcludedFileSchema,
  ExampleDenylistFileSchema,
  REFERENCE_FILES,
  SuperlativesFileSchema,
  UnitsFileSchema,
  loadLintReferences,
} from "./reference.ts";

afterAll(removeTempDirs);

const DIR = join(REPO_ROOT, "content/reference");
const read = (name: string) =>
  JSON.parse(readFileSync(join(DIR, name), "utf8")) as unknown;
const GUIDE = readFileSync(join(REPO_ROOT, "docs/CONTENT_GUIDE.md"), "utf8");

describe("content/reference/", () => {
  it("holds exactly the files REFERENCE_FILES names, and each passes its schema", () => {
    const names = readdirSync(DIR)
      .filter((name) => name.endsWith(".json"))
      .sort();
    expect(names).toEqual(REFERENCE_FILES.map((spec) => spec.name).sort());
    for (const spec of REFERENCE_FILES) {
      const result = spec.schema.safeParse(read(spec.name));
      expect(result.success, spec.name).toBe(true);
    }
    expect(loadLintReferences(DIR).problems).toEqual([]);
  });

  it("reports a missing file, a broken one and one no schema knows, as the lint's C01", () => {
    const dir = tempDir("qz-reference-");
    mkdirSync(dir, { recursive: true });
    for (const spec of REFERENCE_FILES)
      writeFileSync(join(dir, spec.name), JSON.stringify(read(spec.name)));
    writeFileSync(join(dir, "units.json"), "{ not json");
    writeFileSync(join(dir, "colours.json"), "{}");
    const problems = loadLintReferences(dir).problems.map((p) => p.message);
    expect(problems).toEqual([
      expect.stringContaining("units.json is not valid JSON"),
      expect.stringContaining("colours.json is not a reference file"),
    ]);
  });
});

describe("superlatives.json", () => {
  it("holds the words §2.13 names for C19 and every -est word it lists", () => {
    const file = SuperlativesFileSchema.parse(read("superlatives.json"));
    const row = /\| C19 \|[^\n]*/.exec(GUIDE)?.[0] ?? "";
    const listed = [
      ...(/\(([a-z, ]+ and their kin)\)/.exec(row)?.[1] ?? "")
        .replace(" and their kin", "")
        .split(/,\s*/),
      "first",
      "only",
      "record",
      "most",
      "least",
      "best",
      "worst",
    ];
    expect(listed.length).toBeGreaterThan(20);
    for (const word of listed) expect(file.words, word).toContain(word);
  });

  it("refuses a list without one of §2.13's own words, or with a duplicate", () => {
    const file = SuperlativesFileSchema.parse(read("superlatives.json"));
    expect(
      SuperlativesFileSchema.safeParse({
        ...file,
        words: file.words.filter((w) => w !== "first"),
      }).success,
    ).toBe(false);
    expect(
      SuperlativesFileSchema.safeParse({
        ...file,
        words: [...file.words, "largest"],
      }).success,
    ).toBe(false);
  });
});

describe("capitals-excluded.json", () => {
  it("lists §3.4's launch countries, each once, with its reason", () => {
    const file = CapitalsExcludedFileSchema.parse(
      read("capitals-excluded.json"),
    );
    const section =
      GUIDE.split(/^### /m).find((p) => p.startsWith("3.4 ")) ?? "";
    const rows = [
      ...section.matchAll(
        /^\| (More than one|Moved or renamed|A move announced)[^|]*\| ([^\n]+) \|$/gm,
      ),
    ];
    expect(rows).toHaveLength(3);
    const reasons = ["multiple_or_none", "moved", "move_announced"];
    rows.forEach((row, i) => {
      const countries = (row[2] ?? "")
        .replace(/\([^)]*\)/g, "")
        .split(/,\s*/)
        .map((name) => name.trim().replace(/^the /, ""))
        .filter(Boolean);
      const listed = file.countries
        .filter((entry) => entry.reason === reasons[i])
        .map((entry) => entry.country.replace(/^the /, ""));
      expect(listed.sort(), reasons[i]).toEqual(countries.sort());
    });
    expect(file.countries).toHaveLength(25);
  });

  it("refuses a duplicate country, and a moved capital without what moved", () => {
    const file = CapitalsExcludedFileSchema.parse(
      read("capitals-excluded.json"),
    );
    const first = file.countries[0];
    expect(
      CapitalsExcludedFileSchema.safeParse({
        ...file,
        countries: [...file.countries, first],
      }).success,
    ).toBe(false);
    expect(
      CapitalsExcludedFileSchema.safeParse({
        ...file,
        countries: [{ country: "Arvenna", iso_a2: "QM", reason: "moved" }],
      }).success,
    ).toBe(false);
  });
});

describe("units.json", () => {
  const units = UnitsFileSchema.parse(read("units.json"));
  const c = new Map(units.constants.map((k) => [k.name, k.value]));
  const get = (name: string) => {
    const value = c.get(name);
    if (value === undefined) throw new Error(name);
    return value;
  };

  it("holds exact definitions that agree with each other", () => {
    expect(get("km_per_mile")).toBe(1.609344);
    expect(get("kmh_per_mph")).toBe(get("km_per_mile"));
    expect(get("km2_per_square_mile")).toBeCloseTo(get("km_per_mile") ** 2, 12);
    expect(get("m2_per_acre")).toBeCloseTo(43_560 * get("m_per_foot") ** 2, 9);
    expect(get("m_per_yard")).toBeCloseTo(3 * get("m_per_foot"), 12);
    expect(get("kmh_per_knot")).toBe(get("km_per_nautical_mile"));
    expect(get("km_per_light_year")).toBeCloseTo(
      (get("speed_of_light_ms") *
        get("days_per_julian_year") *
        get("s_per_day")) /
        1000,
      1,
    );
    expect(get("s_per_day")).toBe(24 * get("s_per_hour"));
  });

  it("lists the measured units C15 counts, each in one dimension", () => {
    expect(Object.keys(units.measured).sort()).toEqual([
      "area",
      "length",
      "mass",
      "speed",
    ]);
    const all = Object.values(units.measured).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const unit of ["km", "metres", "km²", "kg", "km/h", "miles"])
      expect(all, unit).toContain(unit);
    // C21's ambiguous units are never measured units.
    for (const unit of [
      "ton",
      "tons",
      "gallon",
      "ounce",
      "pint",
      "cup",
      "calorie",
    ])
      expect(all, unit).not.toContain(unit);
    expect(
      UnitsFileSchema.safeParse({
        ...units,
        measured: { ...units.measured, mass: [...units.measured.mass, "km"] },
      }).success,
    ).toBe(false);
  });
});

describe("example-denylist.json", () => {
  it("holds the ten §12.7 answers and the ten §12.9 values", () => {
    const file = ExampleDenylistFileSchema.parse(read("example-denylist.json"));
    const examples = (section: string) => {
      const body =
        GUIDE.split(/^### /m).find((p) => p.startsWith(`${section} `)) ?? "";
      return [...body.matchAll(/```json\s*\n([\s\S]*?)```/g)].map(
        (m) => JSON.parse(m[1] ?? "") as Record<string, unknown>,
      );
    };
    expect(
      file.mysteryAnswers.map((e) => [e.example, e.answerType, e.answer]),
    ).toEqual(examples("12.7").map((e) => [e.id, e.answerType, e.answer]));
    expect(file.encoreValues.map((e) => [e.example, e.answer, e.unit])).toEqual(
      examples("12.9").map((e) => [e.id, e.answer, e.unit]),
    );
  });
});
