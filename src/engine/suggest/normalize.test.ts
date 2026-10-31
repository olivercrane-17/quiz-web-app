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
    ["R.E.M.", "r e m"],
    ["", ""],
  ])("%j is %j", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it("is idempotent", () => {
    for (const name of ["Côte d'Ivoire", "The Hague", "São Tomé & Príncipe"]) {
      expect(normalizeName(normalizeName(name))).toBe(normalizeName(name));
    }
  });
});
