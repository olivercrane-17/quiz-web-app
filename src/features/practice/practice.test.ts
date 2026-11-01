import { afterEach, describe, expect, it } from "vitest";

import { getCategories } from "@/content/loaders/categories";
import { loadPracticePool } from "@/content/loaders/practice";
import { difficultyBandOf, planPracticeRun } from "@/engine/practice";
import { localDate } from "@/engine/practice/testing";
import { parseIdempotencyKey, parseItemId } from "@/engine/types";

import { categorySlugs, practiceCategoryLabels } from "./categories";
import { PRACTICE_CLIENT_COPY } from "./client-copy";
import {
  PRACTICE_INTENT_KEY,
  QUICK_PLAY_INTENT,
  writePracticeIntent,
} from "./intent";
import { decodePracticeIntent, takePracticeIntent } from "./intent-read";
import { uuidV4 } from "./model/ids";
import { practiceScoreBand, resultRows } from "./model/summary";

afterEach(() => {
  sessionStorage.clear();
});

describe("the practice intent", () => {
  it("travels once through session storage: written by Quick play, taken by the run", () => {
    writePracticeIntent(QUICK_PLAY_INTENT);
    expect(sessionStorage.getItem(PRACTICE_INTENT_KEY)).not.toBeNull();
    expect(takePracticeIntent()).toEqual(QUICK_PLAY_INTENT);
    // Gone once read, so a reload resumes instead of starting again.
    expect(takePracticeIntent()).toBeNull();
  });

  it("is Mixed category and Mixed difficulty for Quick play", () => {
    expect(QUICK_PLAY_INTENT).toEqual({
      v: 1,
      mode: "quick",
      category: "mixed",
      difficulty: "mixed",
    });
  });

  it("drops anything that isn't a request", () => {
    expect(decodePracticeIntent({ ...QUICK_PLAY_INTENT, v: 2 })).toBeNull();
    expect(
      decodePracticeIntent({ ...QUICK_PLAY_INTENT, category: "x" }),
    ).toBeNull();
    expect(
      decodePracticeIntent({ ...QUICK_PLAY_INTENT, difficulty: "ramp" }),
    ).toBeNull();
    expect(
      decodePracticeIntent({ ...QUICK_PLAY_INTENT, mode: "blitz" }),
    ).toBeNull();
    expect(
      decodePracticeIntent({ ...QUICK_PLAY_INTENT, repeats: 1 }),
    ).toBeNull();
    expect(decodePracticeIntent([])).toBeNull();
    expect(
      decodePracticeIntent({
        v: 1,
        mode: "category",
        category: "geo",
        difficulty: "hard",
        repeats: true,
      }),
    ).toEqual({
      v: 1,
      mode: "category",
      category: "geo",
      difficulty: "hard",
      repeats: true,
    });
    sessionStorage.setItem(PRACTICE_INTENT_KEY, "{not json");
    expect(takePracticeIntent()).toBeNull();
  });
});

describe("practice ids", () => {
  it("are version 4 UUIDs, usable as idempotency keys", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const id = uuidV4();
      expect(parseIdempotencyKey(id)).toBe(id);
      seen.add(id);
    }
    expect(seen.size).toBe(50);
    expect(uuidV4((bytes) => bytes.fill(0xff))).toBe(
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
    );
  });
});

describe("practice results", () => {
  it("bands scores for run_complete as the PRD lists them", () => {
    expect([0, 3, 4, 6, 7, 8, 9, 10].map(practiceScoreBand)).toEqual([
      "0-3",
      "0-3",
      "4-6",
      "4-6",
      "7-8",
      "7-8",
      "9-10",
      "9-10",
    ]);
  });

  it("rows each question with its answer, the pick when wrong, and withdrawn items", async () => {
    const pool = await loadPracticePool("geo");
    if (!pool.ok) throw new Error("no pack");
    const [first, second] = pool.value;
    if (first === undefined || second === undefined)
      throw new Error("short pack");
    const missing = parseItemId("fx.p.geo.0199");
    if (missing === null) throw new Error("bad id");
    const rows = resultRows(
      {
        runId: "r",
        mode: "practice",
        request: {
          mode: "quick",
          category: "geo",
          difficulty: "mixed",
          repeats: false,
        },
        score: 1,
        maxPoints: 3,
        startedAt: 0,
        finishedAt: 1,
        questions: [
          { itemId: first.id, correct: true, chosen: first.correct },
          {
            itemId: second.id,
            correct: false,
            chosen: (second.correct + 1) % second.options.length,
          },
          { itemId: missing, correct: false, chosen: 0 },
        ],
      },
      pool.value,
    );
    expect(rows.map((row) => row.number)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({
      correct: true,
      answer: first.options[first.correct],
      chosen: null,
    });
    expect(rows[1]?.chosen).toBe(
      second.options[(second.correct + 1) % second.options.length],
    );
    expect(rows[2]).toMatchObject({ item: null, answer: null });
  });
});

describe("practice over the fixture packs", () => {
  it("loads one category, or every pack for Mixed", async () => {
    const geo = await loadPracticePool("geo");
    const mixed = await loadPracticePool("mixed");
    expect(geo.ok && geo.value).toHaveLength(10);
    expect(mixed.ok && mixed.value).toHaveLength(40);
    expect(await loadPracticePool("music")).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("AC-PRA-14 a Hard Geography run from the fixtures serves its 3 Hard items and fills with the 7 hardest Medium ones", async () => {
    const pool = await loadPracticePool("geo");
    if (!pool.ok) throw new Error("no pack");
    const plan = planPracticeRun(pool.value, {
      mode: "category",
      category: "geo",
      difficulty: "hard",
      length: 10,
      seed: "fixture-hard",
      today: localDate("2026-11-01"),
      seen: new Map(),
      denylist: new Set(),
      ability: null,
    });
    expect(plan.notes).toEqual(["hard_filled"]);
    expect(plan.items).toHaveLength(10);
    const bands = plan.items.map((item) => difficultyBandOf(item.predicted.p));
    expect(bands.filter((band) => band === "hard")).toHaveLength(3);
    expect(bands.filter((band) => band === "medium")).toHaveLength(7);
    expect(PRACTICE_CLIENT_COPY.run.notes.hardFilled("Geography")).toBe(
      "You've played every Hard Geography question. Here are the toughest ones left.",
    );
  });

  it("plans a full Mixed run over all four fixture packs", async () => {
    const pool = await loadPracticePool("mixed");
    if (!pool.ok) throw new Error("no packs");
    for (let run = 0; run < 100; run += 1) {
      const plan = planPracticeRun(pool.value, {
        mode: "quick",
        category: "mixed",
        difficulty: "mixed",
        length: 10,
        seed: `fixtures:${run}`,
        today: localDate("2026-11-01"),
        seen: new Map(),
        denylist: new Set(),
        ability: null,
      });
      expect(plan.items).toHaveLength(10);
      expect(plan.notes).toEqual([]);
      expect(plan.items[0]?.format).not.toBe("tf");
    }
  });
});

describe("practice category labels", () => {
  it("carry each category's name and slug to the client", () => {
    const labels = practiceCategoryLabels(getCategories());
    expect(labels.sci).toEqual({
      name: "Science & Tech",
      slug: "science-tech",
    });
    expect(categorySlugs(labels).food).toBe("food-drink");
    expect(Object.keys(labels)).toHaveLength(12);
  });
});
