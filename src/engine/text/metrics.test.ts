// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ascendingOrder,
  charCount,
  sortKey,
  sortKeys,
  wordCount,
} from "./metrics.ts";

describe("charCount", () => {
  it.each([
    ["", 0],
    ["Paris", 5],
    ["Côte d'Ivoire", 13],
    // A decomposed é (e + combining acute) counts once after NFC.
    ["Café", 4],
    ["🙂 ok", 4],
    ["日本", 2],
  ])("%j has %i characters", (text, count) => {
    expect(charCount(text)).toBe(count);
  });
});

describe("wordCount", () => {
  it.each([
    ["", 0],
    ["   ", 0],
    ["one", 1],
    ["Sydney and Melbourne both wanted the title.", 7],
    ["  leading and   trailing  ", 3],
    ["The 1,250 km route took 3.5 days", 7],
    ["tabs\tand\nnewlines count", 4],
  ])("%j has %i words", (text, count) => {
    expect(wordCount(text)).toBe(count);
  });
});

describe("sortKey", () => {
  it.each([
    ["500 BC", { form: "era", value: -500 }],
    ["500 BCE", { form: "era", value: -500 }],
    ["10,000 BC", { form: "era", value: -10_000 }],
    ["AD 79", { form: "era", value: 79 }],
    ["79 AD", { form: "era", value: 79 }],
    ["1066 CE", { form: "era", value: 1066 }],
    ["1912", { form: "plain", value: 1912 }],
    ["7", { form: "plain", value: 7 }],
    ["1,250 km", { form: "quantity", value: 1250, unit: "km" }],
    ["1250 km", { form: "quantity", value: 1250, unit: "km" }],
    ["2.5 km", { form: "quantity", value: 2.5, unit: "km" }],
    ["1,250", { form: "quantity", value: 1250, unit: "" }],
    ["-40", { form: "quantity", value: -40, unit: "" }],
    ["45%", { form: "quantity", value: 45, unit: "%" }],
    ["45 %", { form: "quantity", value: 45, unit: "%" }],
    ["3rd", { form: "quantity", value: 3, unit: "ordinal" }],
    ["1960s", { form: "quantity", value: 1960, unit: "s" }],
    ["  12,000   km  ", { form: "quantity", value: 12_000, unit: "km" }],
  ])("%j is %j", (option, key) => {
    expect(sortKey(option)).toEqual(key);
  });

  it.each(["", "Paris", "about 50", "AD 79 BC", "1,25 km", "AD", "km 5"])(
    "%j has no sort key",
    (option) => {
      expect(sortKey(option)).toBeNull();
    },
  );
});

describe("sortKeys and ascendingOrder", () => {
  it("sorts BC and AD dates on one signed scale", () => {
    const options = ["AD 79", "500 BC", "1066", "1492"];
    expect(ascendingOrder(options)).toEqual([1, 0, 2, 3]);
  });

  it("sorts quantities with their unit", () => {
    expect(ascendingOrder(["1,250 km", "900 km", "12,000 km", "3 km"])).toEqual(
      [3, 1, 0, 2],
    );
    expect(ascendingOrder(["2.5", "1,000", "12", "-3"])).toEqual([3, 0, 2, 1]);
  });

  it("keeps source order for equal values", () => {
    expect(ascendingOrder(["10", "5", "10"])).toEqual([1, 0, 2]);
  });

  it("rejects a set that mixes era years with quantities", () => {
    expect(sortKeys(["500 BC", "1,250 km"])).toEqual({
      ok: false,
      error: "mixed_forms",
      index: 1,
    });
    expect(sortKeys(["1,250", "AD 79"])).toEqual({
      ok: false,
      error: "mixed_forms",
      index: 1,
    });
    expect(ascendingOrder(["500 BC", "1,250"])).toBeNull();
  });

  it("rejects a set that mixes units, whichever comes first", () => {
    expect(sortKeys(["5 km", "5 miles"])).toEqual({
      ok: false,
      error: "mixed_units",
      index: 1,
    });
    expect(sortKeys(["1912", "1,250 km"])).toEqual({
      ok: false,
      error: "mixed_units",
      index: 1,
    });
    expect(sortKeys(["1,250 km", "1912"])).toEqual({
      ok: false,
      error: "mixed_units",
      index: 1,
    });
  });

  it("rejects an option that is not a number or a date", () => {
    expect(sortKeys(["12", "Paris"])).toEqual({
      ok: false,
      error: "not_numeric",
      index: 1,
    });
  });

  it("accepts plain numbers beside era years and beside unitless quantities", () => {
    expect(sortKeys(["1066", "500 BC"]).ok).toBe(true);
    expect(sortKeys(["12", "1,500", "300"]).ok).toBe(true);
    expect(sortKeys([]).ok).toBe(true);
  });
});
