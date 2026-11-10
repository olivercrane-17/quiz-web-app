// @vitest-environment node
import { describe, expect, it } from "vitest";

import { letterRules } from "./distractor-rules.ts";

const kinds = (clue: string) => letterRules(clue).map((rule) => rule.kind);
const holds = (clue: string, name: string) =>
  letterRules(clue).every((rule) => rule.holds(name));

describe("X35's reading of clue 3 (RITE round 3, R3-04)", () => {
  it("R3-04 reads the letter rules a clue states about the name", () => {
    expect(kinds("Its name begins and ends with the letter A.")).toEqual([
      "starts",
      "ends",
    ]);
    expect(
      kinds(
        "This fixture country's name starts with A and has a double N in the middle.",
      ),
    ).toEqual(["starts", "double"]);
    expect(kinds("Its title starts with the letters Ar.")).toEqual(["starts"]);
    expect(kinds("Its name ends in A.")).toEqual(["ends"]);
    expect(kinds("Its name has seven letters.")).toEqual(["length"]);
    expect(kinds("Its name has 7 letters.")).toEqual(["length"]);
    expect(kinds("Its name holds a double letter.")).toEqual(["double"]);
  });

  it("R3-04 leaves clues with no letter rule alone, articles and long words included", () => {
    expect(
      kinds("It sits between iron and nickel in the periodic table."),
    ).toEqual([]);
    expect(kinds("Its title names the job of whoever tends the lamp.")).toEqual(
      [],
    );
    expect(kinds("Its name starts with a vowel.")).toEqual([]);
    expect(kinds("Its name begins with Saint.")).toEqual([]);
    expect(kinds("The film starts with a storm at sea.")).toEqual([]);
  });

  it("R3-04 tests a name's letters blind to case, accents and spaces", () => {
    const clue = "Its name begins and ends with the letter A.";
    expect(holds(clue, "Arvenna")).toBe(true);
    expect(holds(clue, "Araeria")).toBe(true);
    expect(holds(clue, "Ávila")).toBe(true);
    expect(holds(clue, "Belloria")).toBe(false);
    expect(holds(clue, "Arimar")).toBe(false);
    expect(holds("Its name has a double N.", "Arvenna")).toBe(true);
    expect(holds("Its name has a double N.", "Belloria")).toBe(false);
    expect(holds("Its name holds a double letter.", "Belloria")).toBe(true);
    expect(holds("Its name has seven letters.", "Arvenna")).toBe(true);
    expect(holds("Its name has seven letters.", "Saint Orlen")).toBe(false);
  });
});
