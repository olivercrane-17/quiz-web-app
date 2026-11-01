// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { AnswerEntity, AnswerList, AnswerType } from "../types/content.ts";
import { parseEntityId, type EntityId } from "../types/ids.ts";
import {
  createSuggestionIndex,
  exactMatch,
  highlightRange,
  normalizeName,
  normalizeWithOffsets,
  prefixWithinOneEdit,
  suggest,
  type SuggestMatch,
} from "./index.ts";

function id(text: string): EntityId {
  const parsed = parseEntityId(text);
  if (parsed === null) throw new Error(text);
  return parsed;
}

/** A list entry the way the build ships it: keys are the normalized name, then aliases. */
function entry(
  entityId: string,
  name: string,
  options: { aliases?: string[]; display?: string; popularity?: number } = {},
): AnswerEntity {
  return {
    id: id(entityId),
    display: options.display ?? name,
    keys: [
      ...new Set([name, ...(options.aliases ?? [])].map(normalizeName)),
    ].filter((key) => key !== ""),
    popularity: options.popularity ?? 0,
  };
}

function list(type: AnswerType, entities: AnswerEntity[]): AnswerList {
  return { type, version: "test", entities };
}

const COUNTRIES = list("country", [
  entry("x.country.cote-divoire", "Côte d'Ivoire", {
    aliases: ["Ivory Coast"],
  }),
  entry("x.country.costa-rica", "Costa Rica"),
  entry("x.country.united-states", "United States", {
    aliases: ["USA", "US", "United States of America"],
  }),
  entry("x.country.united-kingdom", "United Kingdom", { aliases: ["UK"] }),
  entry("x.country.mexico", "Mexico"),
  entry("x.country.peru", "Peru"),
  entry("x.country.guinea-bissau", "Guinea-Bissau"),
  entry("x.country.trinidad-and-tobago", "Trinidad and Tobago", {
    aliases: ["Trinidad & Tobago"],
  }),
  entry("x.country.antigua-and-barbuda", "Antigua & Barbuda"),
  entry("x.country.the-gambia", "The Gambia", { aliases: ["Gambia"] }),
]);

const ARTISTS = list("music_artist", [
  entry("x.music_artist.the-beatles", "The Beatles", { aliases: ["Beatles"] }),
  entry("x.music_artist.rem", "R.E.M."),
  entry("x.music_artist.ac-dc", "AC/DC"),
  entry("x.music_artist.earth-wind-and-fire", "Earth, Wind & Fire"),
]);

const PEOPLE = list("person", [
  entry("x.person.ada-morrow-cartographer", "Ada Morrow", {
    display: "Ada Morrow (cartographer)",
  }),
  entry("x.person.ada-morrow-sculptor", "Ada Morrow", {
    display: "Ada Morrow (sculptor)",
  }),
  entry("x.person.ada-lovelace", "Ada Lovelace", {
    aliases: ["Augusta Ada King"],
  }),
]);

const LIMIT = 6;
const run = (l: AnswerList, query: string, guessed: EntityId[] = []) =>
  suggest(createSuggestionIndex(l), query, {
    limit: LIMIT,
    alreadyGuessed: new Set(guessed),
  });
const names = (rows: SuggestMatch[]) => rows.map((row) => row.display);

describe("suggestions (PRD §4.1.3, ARCHITECTURE §4.7)", () => {
  it("AC-SUG-01 normalization: cote finds Côte d'Ivoire, the article is optional, & and and match", () => {
    expect(names(run(COUNTRIES, "cote").rows)).toContain("Côte d'Ivoire");
    expect(names(run(COUNTRIES, "CÔTE D’IV").rows)).toEqual(["Côte d'Ivoire"]);

    const withArticle = run(ARTISTS, "the beatles").rows;
    const without = run(ARTISTS, "beatles").rows;
    expect(withArticle.map((r) => r.entityId)).toEqual(
      without.map((r) => r.entityId),
    );
    expect(names(without)).toEqual(["The Beatles"]);

    expect(names(run(COUNTRIES, "trinidad & tobago").rows)).toEqual([
      "Trinidad and Tobago",
    ]);
    expect(names(run(COUNTRIES, "trinidad and tob").rows)).toEqual([
      "Trinidad and Tobago",
    ]);
    expect(names(run(COUNTRIES, "antigua and").rows)).toEqual([
      "Antigua & Barbuda",
    ]);
    expect(names(run(ARTISTS, "earth wind and").rows)).toEqual([
      "Earth, Wind & Fire",
    ]);
    // Periods vanish and hyphens and slashes split words (§4.7 step 1).
    expect(names(run(ARTISTS, "rem").rows)).toEqual(["R.E.M."]);
    expect(names(run(ARTISTS, "ac dc").rows)).toEqual(["AC/DC"]);
    expect(names(run(COUNTRIES, "guinea bissau").rows)).toEqual([
      "Guinea-Bissau",
    ]);
    expect(names(run(COUNTRIES, "bissau").rows)).toEqual(["Guinea-Bissau"]);
  });

  it("AC-SUG-02 aliases belong to their entity: one row, and a guess through one makes the other already guessed", () => {
    const usa = run(COUNTRIES, "USA").rows;
    const full = run(COUNTRIES, "United States").rows;
    expect(usa).toHaveLength(1);
    expect(usa[0]?.entityId).toBe(full[0]?.entityId);
    expect(
      full.filter((r) => r.entityId === id("x.country.united-states")),
    ).toHaveLength(1);
    // "us" is an alias and a prefix of "usa" and of the name's words: still one row.
    expect(
      run(COUNTRIES, "us").rows.filter(
        (r) => r.entityId === id("x.country.united-states"),
      ),
    ).toHaveLength(1);

    const guessed = [id("x.country.united-states")];
    expect(run(COUNTRIES, "united states", guessed).rows[0]).toMatchObject({
      display: "United States",
      alreadyGuessed: true,
    });
    expect(run(COUNTRIES, "usa", guessed).rows[0]?.alreadyGuessed).toBe(true);
    expect(run(COUNTRIES, "united k", guessed).rows[0]?.alreadyGuessed).toBe(
      false,
    );
  });

  it("AC-SUG-03 typo matching starts at 5 characters", () => {
    expect(names(run(COUNTRIES, "mexuco").rows)).toEqual(["Mexico"]);
    expect(run(COUNTRIES, "mexuco").rows[0]?.tier).toBe("typo");
    expect(names(run(COUNTRIES, "mxeico").rows)).toEqual(["Mexico"]);
    expect(run(COUNTRIES, "pwru").rows).toEqual([]);
    expect(names(run(COUNTRIES, "peru").rows)).toEqual(["Peru"]);
    // Insertions and deletions count as one edit too.
    expect(names(run(COUNTRIES, "mexiico").rows)).toEqual(["Mexico"]);
    expect(names(run(COUNTRIES, "mexco").rows)).toEqual(["Mexico"]);
  });

  it("AC-SUG-04 tiers, then popularity, then alphabetical, at most six rows", () => {
    const cities = list("city", [
      entry("x.city.paris", "Paris", {
        display: "Paris, France",
        popularity: 10,
      }),
      entry("x.city.paris-texas", "Paris", {
        display: "Paris, United States",
        popularity: 50,
      }),
      entry("x.city.parisville", "Parisville", { popularity: 5 }),
      entry("x.city.parisburg-a", "Parisburg", {
        display: "Parisburg, Arvenna",
      }),
      entry("x.city.parisburg-b", "Parisburg", {
        display: "Parisburg, Belloria",
      }),
      entry("x.city.lutetia", "Lutetia", {
        aliases: ["Parisian Rome"],
        popularity: 99,
      }),
      entry("x.city.old-paris", "Old Paris", { popularity: 99 }),
      entry("x.city.pairs", "Pairs", { popularity: 99 }),
      entry("x.city.parris", "Parris Island"),
    ]);
    const { rows, total } = run(cities, "paris");
    expect(total).toBe(9);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => [r.display, r.tier])).toEqual([
      // exact name, then by popularity
      ["Paris, United States", "exact"],
      ["Paris, France", "exact"],
      // canonical-name prefix: popularity, then alphabetical
      ["Parisville", "name_prefix"],
      ["Parisburg, Arvenna", "name_prefix"],
      ["Parisburg, Belloria", "name_prefix"],
      // alias prefix beats word prefix and typos, whatever their popularity
      ["Lutetia", "alias_prefix"],
    ]);
    const all = suggest(createSuggestionIndex(cities), "paris", {
      limit: 20,
    }).rows;
    expect(all.slice(6).map((r) => [r.display, r.tier])).toEqual([
      ["Old Paris", "word_prefix"],
      ["Pairs", "typo"],
      ["Parris Island", "typo"],
    ]);
  });

  it("AC-SUG-05 exact Enter selects only a single entity named or aliased exactly so", () => {
    const people = createSuggestionIndex(PEOPLE);
    const countries = createSuggestionIndex(COUNTRIES);
    expect(exactMatch(countries, "ivory coast")?.display).toBe("Côte d'Ivoire");
    expect(exactMatch(countries, "  Mexico ")?.display).toBe("Mexico");
    expect(exactMatch(countries, "the gambia")?.display).toBe("The Gambia");
    // A prefix is not exact, two namesakes are ambiguous, nothing is nothing.
    expect(exactMatch(countries, "mexi")).toBeNull();
    expect(exactMatch(people, "Ada Morrow")).toBeNull();
    expect(exactMatch(people, "zzz")).toBeNull();
    expect(exactMatch(people, "")).toBeNull();
    expect(exactMatch(people, "augusta ada king")?.display).toBe(
      "Ada Lovelace",
    );
  });

  it("returns nothing for an empty query or no room", () => {
    expect(run(COUNTRIES, "   ")).toEqual({ rows: [], total: 0 });
    expect(
      suggest(createSuggestionIndex(COUNTRIES), "me", { limit: 0 }),
    ).toEqual({
      rows: [],
      total: 0,
    });
  });

  it("builds each list's index once", () => {
    expect(createSuggestionIndex(COUNTRIES)).toBe(
      createSuggestionIndex(COUNTRIES),
    );
    expect(createSuggestionIndex(COUNTRIES).size).toBe(
      COUNTRIES.entities.length,
    );
  });
});

describe("the matched part of a row's display", () => {
  it("covers the typed letters of the canonical name, accents and apostrophes included", () => {
    expect(run(COUNTRIES, "cote d").rows[0]?.match).toEqual({
      start: 0,
      end: 6,
    });
    expect(run(COUNTRIES, "cote di").rows[0]?.match).toEqual({
      start: 0,
      end: 8,
    });
    const beatles = run(ARTISTS, "beat").rows[0];
    expect(
      beatles?.display.slice(beatles.match?.start, beatles.match?.end),
    ).toBe("Beat");
    const lovelace = run(PEOPLE, "love").rows[0];
    expect(
      lovelace?.display.slice(lovelace.match?.start, lovelace.match?.end),
    ).toBe("Love");
  });

  it("is null for an alias or a typo", () => {
    expect(run(COUNTRIES, "ivory").rows[0]?.match).toBeNull();
    expect(run(COUNTRIES, "mexuco").rows[0]?.match).toBeNull();
    expect(run(COUNTRIES, "usa").rows[0]?.match).toBeNull();
  });

  it("maps normalized text back to the source", () => {
    const mapped = normalizeWithOffsets("The Côte d’Ivoire & Co.");
    expect(mapped.text).toBe(normalizeName("The Côte d’Ivoire & Co."));
    expect(mapped.text).toBe("cote divoire and co");
    expect(mapped.start[0]).toBe(4);
    expect(highlightRange("Guinea-Bissau", "biss")).toEqual({
      start: 7,
      end: 11,
    });
    expect(highlightRange("Guinea-Bissau", "uinea")).toBeNull();
    expect(highlightRange("Paris", "")).toBeNull();
    // A decomposed accent stays with its letter.
    expect(highlightRange("César", "ce")).toEqual({ start: 0, end: 3 });
  });
});

describe("prefixWithinOneEdit", () => {
  it.each([
    ["mexico", "mexuco", true],
    ["mexico", "mxeico", true],
    ["mexico", "mexiico", true],
    ["mexico", "mexco", true],
    ["mexico", "pexico", true],
    ["mexico", "mexicoo", true],
    ["mexic", "mexico", true],
    ["mexico", "mexico", true],
    ["mexico", "maxuco", false],
    ["mexico", "exicom", false],
    ["peru", "pwru", true],
    ["mex", "mexico", false],
  ])("%s against %s is %s", (text, query, expected) => {
    expect(prefixWithinOneEdit(text, 0, query)).toBe(expected);
  });

  it("starts at a word inside the key", () => {
    expect(prefixWithinOneEdit("new mexico", 4, "mxeico")).toBe(true);
    expect(prefixWithinOneEdit("new mexico", 0, "mxeico")).toBe(false);
  });
});
