// @vitest-environment node
/**
 * The fixture Mysteries RITE round 1 found unfair (R1-30), solved the way
 * a player solves them: from the clues and what the suggestion list shows
 * for what they type, through the real suggestion engine over the fixture
 * answer lists. Every country and film in those lists is invented, so no
 * player can know a fact about one; their ladders have to work by
 * deduction, as Mystery 1's "…Lighthouse" decoys did in round 1.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fixtureRoundContent } from "@/content/loaders/fixtures/sealed";
import { loadFixtureList } from "@/content/loaders/fixtures/lists";
import { createSuggestionIndex, suggest } from "@/engine/suggest";
import {
  parseItemId,
  type AnswerType,
  type ItemId,
  type MysteryContent,
} from "@/engine/types";

function mystery(id: string): MysteryContent {
  const content = fixtureRoundContent(parseItemId(id) as ItemId);
  if (content === null || content.kind !== "mystery") {
    throw new Error(`no fixture Mystery ${id}`);
  }
  return content;
}

/**
 * What the suggestion list shows for a query: every row's display, in
 * order, or with `exact` only the rows that aren't typo matches (those
 * rank last, PRD §4.1.3).
 */
async function typed(
  type: AnswerType,
  query: string,
  options: { exact?: boolean } = {},
): Promise<string[]> {
  const decoded = await loadFixtureList(type);
  if (decoded === null) throw new Error(`no ${type} list`);
  const index = createSuggestionIndex(decoded.list);
  return suggest(index, query, { limit: 6 })
    .rows.filter((row) => options.exact !== true || row.tier !== "typo")
    .map((row) => row.display);
}

/** A rewritten fixture's writer fields, which the built content leaves out. */
function rivalsOf(id: string): { id: string; ruledOutBy: number[] }[] {
  const raw = JSON.parse(
    readFileSync(
      join(process.cwd(), "content/fixtures/mysteries", `${id}.json`),
      "utf8",
    ),
  ) as { rivals: { id: string; ruledOutBy: number[] }[] };
  return raw.rivals;
}

const REWRITTEN = ["fx.m.geo.0101", "fx.m.film.0101", "fx.m.sci.0102"];

describe("the rewritten fixture Mysteries (R1-30)", () => {
  it("R1-30 Arvenna can be deduced: the raven on clue 1, the two republics on clue 2, the A at both ends on clue 3", async () => {
    const arvenna = mystery("fx.m.geo.0101");
    expect(arvenna.answer).toBe("fx.x.country.arvenna");
    expect(arvenna.clues[0]).toMatch(/black bird/);
    // Clue 1's bird, its first two letters swapped, starts the name.
    expect(await typed("country", "arven", { exact: true })).toEqual([
      "Arvenna",
    ]);
    // Clue 2: a president means a republic, and two countries are one.
    expect(arvenna.clues[1]).toMatch(/president/);
    const republics = await typed("country", "republic", { exact: true });
    expect(republics.sort()).toEqual(["Arvenna", "Évrenne"]);
    // Clue 3 keeps the one that begins and ends with A.
    expect(arvenna.clues[2]).toMatch(/begins and ends with the letter A/);
    expect(republics.filter((name) => /^A.*a$/.test(name))).toEqual([
      "Arvenna",
    ]);
  });

  it("R1-30 Arvenna's clue 4 picks it out of its four options at a glance", async () => {
    const arvenna = mystery("fx.m.geo.0101");
    const decoded = await loadFixtureList("country");
    const names = [arvenna.answer, ...arvenna.distractors].map(
      (id) =>
        decoded?.list.entities.find((entity) => entity.id === id)?.display,
    );
    expect(names).toEqual(["Arvenna", "Belloria", "Cassova", "Dravenor"]);
    expect(arvenna.clues[3]).toMatch(/starts with A and has a double N/);
    expect(names.filter((name) => /^A.*nn/.test(name ?? ""))).toEqual([
      "Arvenna",
    ]);
  });

  it("R1-30 The Lantern Keeper keeps its decoys and year, solvable from clue 1, with a clue 4 of its own", async () => {
    const film = mystery("fx.m.film.0101");
    expect(film.answer).toBe("fx.x.film.the-lantern-keeper-1987");
    // Clue 1 names the title as a job: the lighthouse lamp's keeper.
    expect(film.clues[0]).toMatch(/job/);
    expect(await typed("film", "keeper")).toEqual([
      "The Lantern Keeper (1987)",
    ]);
    // Clue 2's "light" still finds the decoys, none of them from 1987.
    const decoys = await typed("film", "light");
    expect(decoys.filter((title) => title.includes("Lighthouse"))).toHaveLength(
      4,
    );
    expect(decoys.some((title) => title.includes("(1987)"))).toBe(false);
    // Clue 3's year: released the year before its 1988 prize.
    expect(film.clues[2]).toMatch(/1988, the year after it came out/);
    // Clue 4 is no longer clue 2 again.
    expect(film.clues[3]).not.toMatch(/watchman|thirty winters/);
    expect(film.clues[3]).not.toBe(film.clues[1]);
  });

  it("R1-30 bismuth's first two clues no longer fit antimony as well", () => {
    const bismuth = mystery("fx.m.sci.0102");
    expect(bismuth.answer).toBe("fx.x.element.bismuth");
    // Antimony expands as it freezes too, so clue 1 has to rule it out:
    // it was never thought the heaviest stable element.
    expect(bismuth.clues[0]).toMatch(/heaviest stable element/);
    expect(bismuth.clues[1]).toMatch(/expands as it freezes/);
    expect(bismuth.clues[3]).toBe(
      "This element's symbol is Bi, and its atomic number is 83.",
    );
  });

  it("R1-30 leaves no listed rival standing on clues 1 and 2 together", () => {
    for (const id of REWRITTEN) {
      const rivals = rivalsOf(id);
      expect(rivals.length, id).toBeGreaterThanOrEqual(3);
      for (const rival of rivals) {
        expect(
          rival.ruledOutBy.some((clue) => clue === 1 || clue === 2),
          `${id}: ${rival.id}`,
        ).toBe(true);
      }
    }
  });

  it("R1-30 never names an answer in a clue a player types against", async () => {
    for (const id of REWRITTEN) {
      const content = mystery(id);
      for (const clue of content.clues.slice(0, 3)) {
        for (const word of clue.split(/[^\p{L}\p{N}]+/u)) {
          if (word.length < 4) continue;
          const shown = await typed(content.answerType, word);
          const answer = (
            await loadFixtureList(content.answerType)
          )?.list.entities.find(
            (entity) => entity.id === content.answer,
          )?.display;
          expect(shown, `${id}: "${word}"`).not.toContain(answer);
        }
      }
    }
  });
});
