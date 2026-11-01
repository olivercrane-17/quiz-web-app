// @vitest-environment node
import { describe, expect, it } from "vitest";

import { normalizeName } from "./normalize.ts";

describe("normalizeName", () => {
  it.each([
    ["Paris", "paris"],
    ["  Paris,   France ", "paris france"],
    ["Côte d'Ivoire", "cote divoire"],
    ["Côte d’Ivoire", "cote divoire"],
    ["São Tomé & Príncipe", "sao tome and principe"],
    ["Guinea-Bissau", "guinea bissau"],
    ["The Hague", "hague"],
    ["A Coruña", "coruna"],
    ["An Lộc", "loc"],
    ["The", "the"],
    ["Ærø", "aero"],
    ["Łódź", "lodz"],
    ["Straße", "strasse"],
    ["İstanbul", "istanbul"],
    ["ＦＵＬＬ　ＷＩＤＴＨ", "full width"],
    ["O'Brien", "obrien"],
    // Periods are deleted like apostrophes, so "rem" finds R.E.M.
    ["R.E.M.", "rem"],
    ["U.S.", "us"],
    ["E.T. the Extra-Terrestrial", "et the extra terrestrial"],
    ["St. Lucia", "st lucia"],
    ["Washington, D.C.", "washington dc"],
    // Every other mark still splits words.
    ["AC/DC", "ac dc"],
    ["Guinea–Bissau", "guinea bissau"],
    ["Earth, Wind & Fire", "earth wind and fire"],
    ["", ""],
  ])("%j is %j", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it("is idempotent", () => {
    for (const name of [
      "Côte d'Ivoire",
      "The Hague",
      "São Tomé & Príncipe",
      "R.E.M.",
      "AC/DC",
    ]) {
      expect(normalizeName(normalizeName(name))).toBe(normalizeName(name));
    }
  });
});
