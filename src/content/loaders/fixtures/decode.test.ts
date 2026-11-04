// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ContentDecodeError,
  decodeAnswerList,
  decodeCategories,
  decodeEncore,
  decodeMystery,
  decodePracticeItem,
  decodeRoomPack,
  decodeScheduleMonth,
  decodeSpareSet,
  isInPlay,
} from "./decode";

const COMMON = {
  id: "fx.p.geo.0199",
  status: "draft",
  category: "geo",
  tags: ["fixtures"],
  region: "global",
  volatility: "evergreen",
  reviewBy: null,
  seededDifficulty: 2,
  counterintuitive: false,
  explanation: "Because.",
  learnMore: "Thing",
  claims: [],
  predicted: { p: 0.5, spread: 0.2, estimator: "fixture" },
};

describe("source decoders", () => {
  it("turns mc answer and wrong into options and correct", () => {
    const item = decodePracticeItem({
      ...COMMON,
      format: "mc",
      stem: "Which?",
      answer: "A",
      wrong: ["B", "C", "D"],
      order: "shuffle",
    });
    expect(item).toMatchObject({
      options: ["A", "B", "C", "D"],
      correct: 0,
      order: "shuffle",
      valueDisplay: null,
    });
    expect("claims" in item).toBe(false);
    expect("status" in item).toBe(false);
  });

  it("fixes true/false options and points false answers at index 1", () => {
    const item = decodePracticeItem({
      ...COMMON,
      format: "tf",
      stem: "It is.",
      answer: false,
      tfKind: "myth",
    });
    expect(item).toMatchObject({
      options: ["True", "False"],
      correct: 1,
      order: "fixed",
    });
  });

  it("always shuffles comparisons and keeps both displays in source order", () => {
    const item = decodePracticeItem({
      ...COMMON,
      format: "comparison",
      stem: "Which is longer?",
      a: "X",
      b: "Y",
      answer: "b",
      relation: "longer",
      measure: "length",
      unit: "km",
      values: { a: 1, b: 2 },
      valueDisplay: { a: "1 km", b: "2 km" },
    });
    expect(item).toMatchObject({
      options: ["X", "Y"],
      correct: 1,
      order: "shuffle",
      valueDisplay: ["1 km", "2 km"],
    });
  });

  it("names the path of what is wrong", () => {
    const attempt = () =>
      decodePracticeItem(
        {
          ...COMMON,
          format: "mc",
          stem: "Which?",
          answer: "A",
          wrong: ["B"],
          order: "shuffle",
        },
        "practice/x.json",
      );
    expect(attempt).toThrow(ContentDecodeError);
    expect(attempt).toThrow("practice/x.json.wrong: must hold 2 or 3 options");
    expect(() =>
      decodePracticeItem({ ...COMMON, id: "p.zzz.0101", format: "tf" }),
    ).toThrow(/id: is not an item id/);
    expect(() =>
      decodePracticeItem({
        ...COMMON,
        predicted: { p: 2, spread: 0, estimator: "x" },
        format: "tf",
        stem: "s",
        answer: true,
      }),
    ).toThrow(/predicted.p/);
    expect(() => decodePracticeItem(null)).toThrow(/must be an object/);
    expect(() => decodeMystery({ ...COMMON, kind: "encore" })).toThrow(
      /kind: must be mystery/,
    );
    expect(() => decodeEncore({ ...COMMON, kind: "mystery" })).toThrow(
      /kind: must be encore/,
    );
    expect(() =>
      decodeRoomPack({ id: "Bad Pack", title: "t", theme: "t", questions: [] }),
    ).toThrow(/pack id/);
    expect(() =>
      decodeScheduleMonth({
        track: "main",
        dailies: [{ date: "2026-02-30", rounds: [] }],
      }),
    ).toThrow(/date/);
    expect(() =>
      decodeSpareSet({ id: "spare_07", track: "e2e", rounds: [] }),
    ).toThrow(/spare\.NN/);
    expect(() =>
      decodeSpareSet({ id: "spare.7", track: "e2e", rounds: [] }),
    ).toThrow(/spare\.NN/);
    expect(() => decodeCategories({})).toThrow(/must be an array/);
  });

  it("accepts spare ids as §2.4 names them, and no other spelling", () => {
    expect(
      decodeSpareSet({ id: "spare.07", track: "e2e", rounds: [] }).id,
    ).toBe("spare.07");
    expect(() =>
      decodeSpareSet({ id: "spare-07", track: "e2e", rounds: [] }),
    ).toThrow(/spare\.NN/);
  });

  it("projects only active, unreplaced list entries", () => {
    const entity = (id: string, extra: object = {}) => ({
      id,
      name: id.split(".").at(-1),
      display: id.split(".").at(-1),
      aliases: [],
      popularity: 0,
      qualifier: { iso_a2: "XA" },
      source: "l.country.b01",
      status: "active",
      addedIn: "2026-09-01",
      ...extra,
    });
    const decoded = decodeAnswerList({
      type: "country",
      version: "2026-09-01",
      provenance: [],
      entities: [
        entity("fx.x.country.alpha"),
        entity("fx.x.country.beta", { status: "retired" }),
        entity("fx.x.country.gamma", { replacedBy: "fx.x.country.alpha" }),
      ],
    });
    expect(decoded.list.entities.map((e) => e.id)).toEqual([
      "fx.x.country.alpha",
    ]);
    expect(decoded.records).toEqual([
      { id: "fx.x.country.alpha", display: "alpha", optionLabel: "alpha" },
    ]);
  });

  it("keeps cut and retired items out of play", () => {
    expect(isInPlay({ status: "draft" })).toBe(true);
    expect(isInPlay({ status: "active" })).toBe(true);
    expect(isInPlay({ status: "cut" })).toBe(false);
    expect(isInPlay({ status: "retired" })).toBe(false);
  });
});
