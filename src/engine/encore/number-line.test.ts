// @vitest-environment node
import { describe, expect, it } from "vitest";

import { NUMBER_LINE_YEARS, numberLineGeometry } from "./number-line.ts";

const QUANTITY_BANDS = { bullseye: 0.05, close: 0.15 };
const YEAR_BANDS = { bullseye: 2, close: 5 };

describe("the Encore number line (PRD §3.1.5)", () => {
  it("puts the answer in the middle of a ratio scale from half to double", () => {
    const line = numberLineGeometry({
      valueKind: "quantity",
      guess: 1250,
      answer: 1250,
      median: null,
      bands: QUANTITY_BANDS,
    });
    expect(line.scale).toBe("ratio");
    expect(line.answer).toBe(0.5);
    expect(line.guess).toEqual({ at: 0.5, edge: null });
    expect(line.ends).toEqual({ low: 625, high: 2500 });
    expect(line.median).toBeNull();
  });

  it("places twice and half the answer at the two ends, equally far out", () => {
    const at = (guess: number) =>
      numberLineGeometry({
        valueKind: "quantity",
        guess,
        answer: 1250,
        median: null,
        bands: QUANTITY_BANDS,
      }).guess;
    expect(at(2500)).toEqual({ at: 1, edge: null });
    expect(at(625)).toEqual({ at: 0, edge: null });
    expect(at(1200).at).toBeCloseTo(0.5 + Math.log2(1200 / 1250) / 2, 10);
    expect(0.5 - at(1000).at).toBeCloseTo(at(1562.5).at - 0.5, 10);
  });

  it("pins a guess beyond either end to it, with the edge set for the arrow", () => {
    const far = numberLineGeometry({
      valueKind: "quantity",
      guess: 9000,
      answer: 1250,
      median: 100,
      bands: QUANTITY_BANDS,
    });
    expect(far.guess).toEqual({ at: 1, edge: "high" });
    expect(far.median).toEqual({ at: 0, edge: "low" });
  });

  it("shades bands that hold exactly the guesses inside them", () => {
    const line = numberLineGeometry({
      valueKind: "quantity",
      guess: 1200,
      answer: 1250,
      median: 1100,
      bands: QUANTITY_BANDS,
    });
    const position = (v: number) => 0.5 + Math.log2(v / 1250) / 2;
    expect(line.bullseye.to).toBeCloseTo(position(1250 * 1.05), 10);
    expect(line.bullseye.from).toBeCloseTo(position(1250 / 1.05), 10);
    expect(line.close.to).toBeCloseTo(position(1250 * 1.15), 10);
    expect(line.close.from).toBeLessThan(line.bullseye.from);
    // A bullseye guess sits inside the bullseye shading.
    expect(line.guess.at).toBeGreaterThan(line.bullseye.from);
    expect(line.median?.at).toBeCloseTo(position(1100), 10);
  });

  it("uses an even scale of 20 years either side for years", () => {
    const line = numberLineGeometry({
      valueKind: "year",
      guess: 1979,
      answer: 1969,
      median: 1900,
      bands: YEAR_BANDS,
    });
    expect(NUMBER_LINE_YEARS).toBe(20);
    expect(line.scale).toBe("years");
    expect(line.guess).toEqual({ at: 0.75, edge: null });
    expect(line.median).toEqual({ at: 0, edge: "low" });
    expect(line.bullseye).toEqual({ from: 0.45, to: 0.55 });
    expect(line.close).toEqual({ from: 0.375, to: 0.625 });
    expect(line.ends).toEqual({ low: 1949, high: 1989 });
  });

  it("never shades past the ends, even for wide bands", () => {
    const line = numberLineGeometry({
      valueKind: "quantity",
      guess: 10,
      answer: 10,
      median: null,
      bands: { bullseye: 1.5, close: 3 },
    });
    expect(line.close).toEqual({ from: 0, to: 1 });
  });
});
