// @vitest-environment node
import { describe, expect, it } from "vitest";

import { displayLabels, hasNumberOption, midSentence } from "./index.ts";

describe("choice display labels", () => {
  it("R1-25 marks the era on every year once one option is BC", () => {
    // fx.p.geo.0109 as it ships: "300 BC" sat beside a bare "45".
    expect(displayLabels(["120 BC", "300 BC", "45", "210"])).toEqual([
      "120 BC",
      "300 BC",
      "AD 45",
      "AD 210",
    ]);
    // An option that already carries its era keeps it as written.
    expect(displayLabels(["500 BC", "AD 79", "1204"])).toEqual([
      "500 BC",
      "AD 79",
      "AD 1204",
    ]);
  });

  it("R1-25 follows the set's own style: CE after the year beside BCE", () => {
    expect(displayLabels(["44 BCE", "14", "79 CE"])).toEqual([
      "44 BCE",
      "14 CE",
      "79 CE",
    ]);
    expect(displayLabels(["44 bce", "14"])).toEqual(["44 bce", "14 CE"]);
  });

  it("leaves every other set as it is", () => {
    const cases = [
      // Plain years and counts, with no BC anywhere.
      ["1204", "1312", "1459", "1530"],
      ["2", "4", "9", "15"],
      // Eras without BC, and quantities that only look like years.
      ["AD 79", "AD 410", "1066"],
      ["300 BC", "6 weeks"],
      ["120 BC", "1,250"],
      // Words.
      ["Queen Amalie", "Queen Brisa"],
      ["True", "False"],
    ];
    for (const labels of cases) expect(displayLabels(labels)).toEqual(labels);
  });

  it("returns a copy, never the array it was given", () => {
    const labels = ["Venus", "Uranus"];
    expect(displayLabels(labels)).not.toBe(labels);
  });

  it("R1-13 calls a set numeric when any option holds a digit", () => {
    expect(hasNumberOption(["2", "4", "9", "15"])).toBe(true);
    expect(hasNumberOption(["2 weeks", "6 weeks"])).toBe(true);
    expect(hasNumberOption(["Apollo 11", "Gemini", "Mercury"])).toBe(true);
    expect(hasNumberOption(["120 BC", "AD 45"])).toBe(true);
    // Other scripts' digits count too.
    expect(hasNumberOption(["٤", "٩"])).toBe(true);
    expect(hasNumberOption(["The bell comb", "The gear harp"])).toBe(false);
    expect(hasNumberOption(["True", "False"])).toBe(false);
  });
});

describe("a label inside a sentence", () => {
  it("lowers a leading article in sentence case", () => {
    expect(midSentence("The bell comb")).toBe("the bell comb");
    expect(midSentence("A tide staff")).toBe("a tide staff");
    expect(midSentence("An oxbow lake")).toBe("an oxbow lake");
    expect(midSentence("The Gorlund bell")).toBe("the Gorlund bell");
    expect(midSentence("The 1920s")).toBe("the 1920s");
  });

  it("R1-25 lowers a leading The on a name in title case, as running text does", () => {
    expect(midSentence("The Glaziers' Guild", "hist")).toBe(
      "the Glaziers' Guild",
    );
    expect(midSentence("The Ashen Hills", "geo")).toBe("the Ashen Hills");
    expect(midSentence("The Vellum", "geo")).toBe("the Vellum");
    expect(midSentence("The Netherlands", "geo")).toBe("the Netherlands");
    expect(midSentence("The UN", "soc")).toBe("the UN");
    expect(midSentence("The Bay of Bengal")).toBe("the Bay of Bengal");
  });

  it("keeps the article of a title of a work, an official place name and A or An", () => {
    expect(midSentence("The Great Gatsby", "book")).toBe("The Great Gatsby");
    expect(midSentence("The Persistence of Memory", "art")).toBe(
      "The Persistence of Memory",
    );
    expect(midSentence("The Godfather", "film")).toBe("The Godfather");
    expect(midSentence("The Four Seasons", "music")).toBe("The Four Seasons");
    expect(midSentence("The Hague", "geo")).toBe("The Hague");
    expect(midSentence("The Gambia", "geo")).toBe("The Gambia");
    expect(midSentence("A Tale of Two Cities", "book")).toBe(
      "A Tale of Two Cities",
    );
    expect(midSentence("A Coruña", "geo")).toBe("A Coruña");
  });

  it("leaves a label without a leading article alone", () => {
    for (const label of [
      "Uranus",
      "Theodore Roosevelt",
      "Eels",
      "Queen Amalie",
      "Thebes",
      "True",
    ]) {
      expect(midSentence(label, "hist")).toBe(label);
    }
  });
});
