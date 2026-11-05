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

describe("D1: commas that group thousands, with decimals allowed", () => {
  const oneDecimal = { decimals: 1, valueKind: "quantity" } as const;

  it("R1-10 reads 1,200 as 1200 on an Encore that allows a decimal, where it was refused", () => {
    // Daily #45's Encore (Lake Ostry, one decimal) refused "1,200" with
    // "Up to 1 decimal place, please." for a guess with no decimal at all.
    expect(parseEncoreInput("1,200", oneDecimal)).toEqual({
      ok: true,
      value: 1200,
      preview: "1,200",
    });
    expect(parseEncoreInput("12,345,678", oneDecimal)).toMatchObject({
      ok: true,
      value: 12_345_678,
    });
    // Indian grouping (Marcus, en-IN), refused before as "Check the dots and commas."
    expect(parseEncoreInput("1,20,000", oneDecimal)).toEqual({
      ok: true,
      value: 120_000,
      preview: "120,000",
    });
    // A comma before one or two final digits is still the point.
    expect(parseEncoreInput("300,5", oneDecimal)).toEqual({
      ok: true,
      value: 300.5,
      preview: "300.5",
    });
    expect(parseEncoreInput("1,250.5", oneDecimal)).toMatchObject({
      ok: true,
      value: 1250.5,
    });
    expect(parseEncoreInput("1,2345", oneDecimal)).toEqual({
      ok: false,
      error: "too_many_decimals",
    });
  });

  it("R1-10 leaves every reading with no decimals allowed as it was: each separator is grouping", () => {
    const noDecimals = { decimals: 0, valueKind: "quantity" } as const;
    for (const typed of [
      "1,200",
      "12,345,678",
      "1,20,000",
      "300,5",
      "1,2345",
      "0,500",
      "1,200,5",
      "1.200",
    ]) {
      const digits = typed.replace(/[.,]/g, "");
      expect(parseEncoreInput(typed, noDecimals)).toEqual(
        parseEncoreInput(digits, noDecimals),
      );
    }
    for (const row of rows.filter((r) => r.decimals === 0)) {
      if (row.error !== undefined) continue;
      expect(parseEncoreInput(row.typed, rules(row))).toMatchObject({
        ok: true,
        value: row.value,
      });
    }
  });

  it("keeps a comma that can't be grouping as the point, and a dot as the point always", () => {
    // A grouped number is 1,000 or more, so a zero or empty lead isn't grouping.
    expect(parseEncoreInput("0,500", oneDecimal)).toEqual({
      ok: false,
      error: "too_many_decimals",
    });
    expect(parseEncoreInput(",5", oneDecimal)).toMatchObject({
      ok: true,
      value: 0.5,
    });
    // Broken or mixed groups read the first comma as the point, then refuse the rest.
    for (const typed of ["1,200,5", "1,20,00", "1,234,56,789"]) {
      expect(parseEncoreInput(typed, oneDecimal)).toEqual({
        ok: false,
        error: "bad_separator",
      });
    }
    // D1 names commas only.
    expect(parseEncoreInput("1.200", oneDecimal)).toEqual({
      ok: false,
      error: "too_many_decimals",
    });
    // Full-width commas group as ASCII ones do.
    expect(parseEncoreInput("１，２００", oneDecimal)).toMatchObject({
      ok: true,
      value: 1200,
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
