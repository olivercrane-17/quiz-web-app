// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import table from "../fixtures/share-codes.json";
import { mysteryCells } from "../run/outcome.ts";
import {
  decodeShareCode,
  encodeShareCode,
  parseShareLayouts,
  type DecodedShare,
} from "../share/code.ts";
import type { CategoryId } from "../types/content.ts";
import type { RoundOutcome } from "../types/rounds.ts";
import { shareAltText, type AltTextLabels } from "./alt-text.ts";

const LAYOUTS = parseShareLayouts(
  JSON.parse(
    readFileSync(
      new URL("../../../content/compositions.json", import.meta.url),
      "utf8",
    ),
  ),
);
const SHORT = new Map(
  (
    JSON.parse(
      readFileSync(
        new URL("../../../content/categories.json", import.meta.url),
        "utf8",
      ),
    ) as { id: CategoryId; shortName: string }[]
  ).map((category) => [category.id, category.shortName]),
);
const LABELS: AltTextLabels = {
  brand: "Knewt",
  category: (id) => SHORT.get(id) ?? id,
  choiceRow: "Questions",
};

const mystery = (
  category: CategoryId,
  solvedOn: 1 | 2 | 3 | 4 | null,
  voided = false,
): RoundOutcome => ({
  family: "mystery",
  solvedOn,
  points: voided ? 4 : solvedOn === null ? 0 : 5 - solvedOn,
  voided,
  category,
  cells: voided
    ? ["voided", "voided", "voided", "voided"]
    : mysteryCells(solvedOn),
});

function decode(
  number: number,
  composition: string,
  archive: boolean,
  outcomes: RoundOutcome[],
): DecodedShare {
  const code = encodeShareCode({ composition, archive, outcomes }, LAYOUTS);
  const decoded = decodeShareCode(number, code, LAYOUTS);
  if (decoded === null) throw new Error(`could not decode ${code}`);
  return decoded;
}

describe("shareAltText", () => {
  it("reads DESIGN §6.11's sample result word for word", () => {
    const decoded = decode(42, "m3e1", false, [
      mystery("geo", 1),
      mystery("hist", 2),
      mystery("film", 3),
      {
        family: "encore",
        error: { kind: "relative", value: 0.04, display: "4% off" },
        band: "bullseye",
        voided: false,
      },
    ]);
    expect(shareAltText(decoded, LABELS)).toBe(
      "Knewt Daily number 42 result: 9 out of 12. Geography solved on clue 1. History solved on clue 2. Film and TV solved on clue 3. Encore 4% off, a bullseye.",
    );
  });

  it("names a miss, a voided Mystery, an archive play and a close Encore", () => {
    const decoded = decode(40, "m3e1", true, [
      mystery("sci", null),
      mystery("book", null, true),
      mystery("food", 4),
      {
        family: "encore",
        error: { kind: "years", value: 3, display: "3 years off" },
        band: "close",
        voided: false,
      },
    ]);
    expect(shareAltText(decoded, LABELS)).toBe(
      "Knewt Daily number 40 result (archive): 5 out of 12. Science and Tech missed. Books voided. Food and Drink solved on clue 4. Encore 3 years off, close.",
    );
  });

  it("collapses consecutive choice rounds into one sentence and reads a voided Encore", () => {
    const row = table.roundTrips.find((trip) => trip.id === "c5m1e1");
    const decoded = decodeShareCode(row?.number ?? 0, row?.code ?? "", LAYOUTS);
    expect(decoded).not.toBeNull();
    if (decoded === null) return;
    expect(shareAltText(decoded, LABELS)).toBe(
      "Knewt Daily number 57 result (archive): 7 out of 9. Questions: 4 of 5 correct. Film and TV solved on clue 2. Encore 9999 years off.",
    );
    const voided = decode(56, "c9e1", false, [
      ...Array.from({ length: 8 }, (): RoundOutcome => ({
        family: "choice",
        correct: true,
        points: 1,
        voided: false,
        answerMs: null,
        cells: ["correct"],
      })),
      {
        family: "choice",
        correct: false,
        points: 1,
        voided: true,
        answerMs: null,
        cells: ["voided"],
      },
      { family: "encore", error: null, band: null, voided: true },
    ]);
    expect(shareAltText(voided, LABELS)).toBe(
      "Knewt Daily number 56 result: 9 out of 9. Questions: 8 of 9 correct, 1 voided. Encore voided.",
    );
  });

  it("never names an answer, a clue or a time: only the code's facts", () => {
    for (const trip of table.roundTrips) {
      const decoded = decodeShareCode(trip.number, trip.code, LAYOUTS);
      expect(decoded).not.toBeNull();
      if (decoded === null) continue;
      const text = shareAltText(decoded, LABELS);
      expect(text).not.toMatch(/answer|clue text|seconds|minute|percentile/i);
      expect(text.startsWith(`Knewt Daily number ${trip.number} result`)).toBe(
        true,
      );
    }
  });
});
