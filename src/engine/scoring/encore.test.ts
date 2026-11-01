// @vitest-environment node
import { describe, expect, it } from "vitest";

import table from "../fixtures/encore.json";
import {
  checkEncoreValue,
  decimalDigits,
  type EncoreDecimals,
  type EncoreValueKind,
} from "../encore/value.ts";
import {
  DEFAULT_ENCORE_BANDS,
  bandsFor,
  encoreBand,
  encoreError,
  encorePercent,
  encoreRatio,
  formatEncoreError,
  judgeEncoreGuess,
} from "./encore.ts";

interface JudgeRow {
  id: string;
  valueKind: string;
  decimals: number;
  bands: { bullseye: number; close: number } | null;
  answer: number;
  guess: number;
  display: string;
  band: string | null;
  value: number;
}

const judgeRows = table.judge as JudgeRow[];

describe("Encore error, band and display (PRD §4.2.2, §4.2.4, encore.json judge rows)", () => {
  it.each(judgeRows.map((row) => [row.id, row] as const))("%s", (_id, row) => {
    const encore = {
      valueKind: row.valueKind as EncoreValueKind,
      decimals: row.decimals as EncoreDecimals,
      answer: row.answer,
      bands: row.bands,
    };
    const { error, band } = judgeEncoreGuess(encore, row.guess);
    expect(error.display).toBe(row.display);
    expect(band).toBe(row.band);
    expect(error.kind).toBe(row.valueKind === "year" ? "years" : "relative");
    expect(error.value).toBeCloseTo(row.value, 6);
    expect(
      encoreError(encore.valueKind, row.guess, row.answer, encore.decimals),
    ).toEqual(error);
  });

  it("treats twice and half the answer as the same error (the symmetric measure)", () => {
    const twice = encoreRatio("quantity", 2500, 1250, 0);
    const half = encoreRatio("quantity", 625, 1250, 0);
    expect(twice.num * half.den).toBe(half.num * twice.den);
    expect(formatEncoreError(twice)).toBe("100% off");
  });

  it("decides the 5% boundary exactly, where floating point would not", () => {
    // 21 / 20 - 1 is 0.050000000000000044 in floating point.
    expect(21 / 20 - 1).toBeGreaterThan(0.05);
    expect(
      encoreBand(
        encoreRatio("quantity", 21, 20, 0),
        DEFAULT_ENCORE_BANDS.quantity,
      ),
    ).toBe("bullseye");
    expect(
      encoreBand(
        encoreRatio("quantity", 23, 20, 0),
        DEFAULT_ENCORE_BANDS.quantity,
      ),
    ).toBe("close");
  });

  it("rounds the percent half up from the exact ratio", () => {
    // 1,045 against 1,000 is exactly 4.5%, where a float gives 4.499...
    expect(encorePercent(encoreRatio("quantity", 1045, 1000, 0))).toBe(5);
    expect(encorePercent(encoreRatio("quantity", 1044, 1000, 0))).toBe(4);
  });

  it("measures decimals on the scaled values", () => {
    const ratio = encoreRatio("quantity", 86.5, 86.4, 1);
    expect(ratio).toEqual({
      kind: "relative",
      num: BigInt(1),
      den: BigInt(864),
    });
  });

  it("uses an Encore's own bands, else the defaults for its kind", () => {
    expect(bandsFor("quantity", null)).toEqual({ bullseye: 0.05, close: 0.15 });
    expect(bandsFor("year", null)).toEqual({ bullseye: 2, close: 5 });
    expect(bandsFor("quantity", { bullseye: 0.1, close: 0.3 })).toEqual({
      bullseye: 0.1,
      close: 0.3,
    });
  });

  it("refuses an answer the rules can't scale, a content error", () => {
    expect(() => encoreRatio("quantity", 10, 12.5, 0)).toThrow(RangeError);
    expect(() => encoreRatio("quantity", -1, 12, 0)).toThrow(RangeError);
  });
});

describe("the judge's value re-check (§8.8, encore.json values rows)", () => {
  interface ValueRow {
    id: string;
    valueKind: string;
    decimals: number;
    value: number;
  }
  it.each((table.values as ValueRow[]).map((row) => [row.id, row] as const))(
    "%s is refused",
    (_id, row) => {
      expect(
        checkEncoreValue(row.value, {
          valueKind: row.valueKind as EncoreValueKind,
          decimals: row.decimals as EncoreDecimals,
        }).ok,
      ).toBe(false);
    },
  );

  it("names why a value is refused", () => {
    const quantity = { decimals: 0, valueKind: "quantity" } as const;
    expect(checkEncoreValue(-5, quantity)).toEqual({
      ok: false,
      error: "not_positive",
    });
    expect(checkEncoreValue(12.5, quantity)).toEqual({
      ok: false,
      error: "too_many_decimals",
    });
    expect(checkEncoreValue(1e16, quantity)).toEqual({
      ok: false,
      error: "too_many_digits",
    });
    expect(checkEncoreValue(Number.NaN, quantity)).toEqual({
      ok: false,
      error: "not_number",
    });
    expect(
      checkEncoreValue(10_000, { decimals: 0, valueKind: "year" }),
    ).toEqual({
      ok: false,
      error: "year_range",
    });
  });

  it("accepts every parsed value of the parse rows", () => {
    for (const row of table.parse) {
      if (!("value" in row) || typeof row.value !== "number") continue;
      const checked = checkEncoreValue(row.value, {
        decimals: row.decimals as EncoreDecimals,
        valueKind: row.valueKind as EncoreValueKind,
      });
      expect(checked.ok, row.id).toBe(true);
    }
  });

  it("reads a number's exact digits, exponent forms included", () => {
    expect(decimalDigits(1250.5)).toEqual({ int: "1250", frac: "5" });
    expect(decimalDigits(0.07)).toEqual({ int: "0", frac: "07" });
    expect(decimalDigits(1e21)).toEqual({
      int: "1" + "0".repeat(21),
      frac: "",
    });
    expect(decimalDigits(1.5e-7)).toEqual({ int: "0", frac: "00000015" });
    expect(decimalDigits(-1)).toBeNull();
    expect(decimalDigits(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
