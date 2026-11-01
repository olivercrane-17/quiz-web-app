// @vitest-environment node
import { describe, expect, it } from "vitest";

import table from "../fixtures/encore.json";
import {
  formatEncoreAmount,
  formatEncoreNumber,
  groupThousands,
} from "./format.ts";
import { parseEncoreInput, type EncoreParseError } from "./parse.ts";
import type { EncoreDecimals, EncoreValueKind } from "./value.ts";

interface ParseRow {
  id: string;
  typed: string;
  decimals: number;
  valueKind: string;
  value?: number;
  preview?: string;
  error?: string;
}

const rows = table.parse as ParseRow[];

function rules(row: ParseRow) {
  return {
    decimals: row.decimals as EncoreDecimals,
    valueKind: row.valueKind as EncoreValueKind,
  };
}

describe("parseEncoreInput (PRD §4.2.1, encore.json parse rows)", () => {
  it.each(rows.map((row) => [row.id, row] as const))("%s", (_id, row) => {
    const result = parseEncoreInput(row.typed, rules(row));
    if (row.error === undefined) {
      expect(result).toEqual({
        ok: true,
        value: row.value,
        preview: row.preview,
      });
    } else {
      expect(result).toEqual({
        ok: false,
        error: row.error as EncoreParseError,
      });
    }
  });

  it("covers every parse failure the contract names", () => {
    const errors = new Set(rows.map((row) => row.error).filter(Boolean));
    expect([...errors].sort()).toEqual([
      "bad_separator",
      "not_number",
      "not_positive",
      "too_many_decimals",
      "too_many_digits",
      "year_range",
    ]);
  });

  it("reads every grouping style of PRD §4.2.4 as the same number", () => {
    const quantity = { decimals: 0, valueKind: "quantity" } as const;
    for (const typed of ["1250", "1,250", "1.250", "1 250", "001,250"]) {
      expect(parseEncoreInput(typed, quantity)).toMatchObject({
        ok: true,
        value: 1250,
      });
    }
  });

  it("refuses a minus sign before anything else is checked", () => {
    const quantity = { decimals: 1, valueKind: "quantity" } as const;
    expect(parseEncoreInput("-", quantity)).toEqual({
      ok: false,
      error: "not_positive",
    });
    expect(parseEncoreInput("–1,5", quantity)).toEqual({
      ok: false,
      error: "not_positive",
    });
    expect(parseEncoreInput("-1a", quantity)).toEqual({
      ok: false,
      error: "not_number",
    });
  });

  it("keeps 15 significant digits exact with decimals", () => {
    const result = parseEncoreInput("1234567890123.45", {
      decimals: 2,
      valueKind: "quantity",
    });
    expect(result).toEqual({
      ok: true,
      value: 1234567890123.45,
      preview: "1,234,567,890,123.45",
    });
  });
});

describe("Encore number formatting", () => {
  it("groups thousands", () => {
    expect(groupThousands("1")).toBe("1");
    expect(groupThousands("999")).toBe("999");
    expect(groupThousands("1000")).toBe("1,000");
    expect(groupThousands("1234567")).toBe("1,234,567");
  });

  it("writes quantities grouped and years plain, with their decimals", () => {
    expect(formatEncoreNumber(1250, "quantity")).toBe("1,250");
    expect(formatEncoreNumber(1250.5, "quantity")).toBe("1,250.5");
    expect(formatEncoreNumber(0.07, "quantity")).toBe("0.07");
    expect(formatEncoreNumber(1969, "year")).toBe("1969");
    expect(formatEncoreNumber(12_000_000, "quantity")).toBe("12,000,000");
  });

  it("puts the unit's short form after the number, and nothing after a year", () => {
    expect(formatEncoreAmount(1250, "km", "quantity")).toBe("1,250 km");
    expect(formatEncoreAmount(320, "days", "quantity")).toBe("320 days");
    expect(formatEncoreAmount(1969, "", "year")).toBe("1969");
  });
});
