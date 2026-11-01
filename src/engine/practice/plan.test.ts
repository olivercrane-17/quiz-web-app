// @vitest-environment node
import { describe, expect, it } from "vitest";

import { addDays } from "../time/calendar.ts";
import type { DifficultyChoice, PracticeItem } from "../types/content.ts";
import type { ItemId } from "../types/ids.ts";
import { difficultyBandOf } from "./bands.ts";
import { MAX_COMPARISONS, MAX_TRUE_FALSE, planPracticeRun } from "./plan.ts";
import { dayNumberOf } from "./seen.ts";
import { localDate, practiceItem, syntheticPool } from "./testing.ts";
import type { PracticeRequest, SeenIndex } from "./types.ts";

const TODAY = localDate("2026-11-01");
const TODAY_DAY = dayNumberOf(TODAY);

function request(overrides: Partial<PracticeRequest> = {}): PracticeRequest {
  return {
    mode: "quick",
    category: "mixed",
    difficulty: "mixed",
    length: 10,
    seed: "seed",
    today: TODAY,
    seen: new Map(),
    denylist: new Set(),
    ability: null,
    ...overrides,
  };
}

const p = (item: PracticeItem) => item.predicted.p;
const band = (item: PracticeItem) => difficultyBandOf(p(item));
const count = (items: readonly PracticeItem[], format: string) =>
  items.filter((item) => item.format === format).length;

function seenAll(items: readonly PracticeItem[], day: number): SeenIndex {
  return new Map(items.map((item) => [item.id, day]));
}

/** Geography as the fixtures hold it: 3 Hard and 7 Medium items (content/fixtures/README.md). */
function geographyFixtureShape(): PracticeItem[] {
  const hard = [0.42, 0.38, 0.3].map((value, i) =>
    practiceItem({ id: `p.geo.010${i + 1}`, p: value }),
  );
  const medium = [0.72, 0.68, 0.64, 0.6, 0.56, 0.52, 0.48].map((value, i) =>
    practiceItem({
      id: `p.geo.020${i + 1}`,
      p: value,
      shape: i === 3 ? "tf" : i === 4 ? "comparison" : "mc",
    }),
  );
  // Another category's Hard items, which a Geography run never touches.
  const elsewhere = Array.from({ length: 10 }, (_, i) =>
    practiceItem({
      id: `p.hist.01${String(i).padStart(2, "0")}`,
      p: 0.2 + i / 100,
      category: "hist",
    }),
  );
  return [...hard, ...medium, ...elsewhere];
}

describe("planPracticeRun: composition", () => {
  const pool = syntheticPool();
  const choices: readonly (DifficultyChoice | "ramp")[] = [
    "mixed",
    "easy",
    "medium",
    "hard",
    "ramp",
  ];

  it("AC-PRA-03 across 1,000 seeded runs, no run has more than 1 true/false or more than 2 comparisons, and no run starts with true/false", () => {
    for (let run = 0; run < 1000; run += 1) {
      const difficulty = choices[run % choices.length] ?? "mixed";
      const category = run % 2 === 0 ? "mixed" : "geo";
      const { items } = planPracticeRun(
        pool,
        request({ seed: `ac-pra-03:${run}`, difficulty, category }),
      );
      expect(items.length).toBeGreaterThan(0);
      // PRD §3.3.1: at most 1 true/false and 2 comparisons.
      expect(count(items, "tf")).toBeLessThanOrEqual(1);
      expect(count(items, "comparison")).toBeLessThanOrEqual(2);
      const [first] = items;
      expect(first?.format).not.toBe("tf");
      // The first question is the easiest in the run (PRD §3.3.1).
      expect(p(first as PracticeItem)).toBe(Math.max(...items.map(p)));
    }
  });

  it("names the PRD's limits", () => {
    expect([MAX_TRUE_FALSE, MAX_COMPARISONS]).toEqual([1, 2]);
  });

  it("still serves true/false items and comparisons, within the limits", () => {
    let trueFalse = 0;
    let comparisons = 0;
    for (let run = 0; run < 200; run += 1) {
      const { items } = planPracticeRun(pool, request({ seed: `mix:${run}` }));
      trueFalse += count(items, "tf");
      comparisons += count(items, "comparison");
    }
    expect(trueFalse).toBeGreaterThan(50);
    expect(comparisons).toBeGreaterThan(100);
  });

  it("never serves one item twice in a run", () => {
    for (let run = 0; run < 200; run += 1) {
      const { items } = planPracticeRun(pool, request({ seed: `dup:${run}` }));
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    }
  });

  it("gives way when the easiest pick is a true/false, rather than opening on it", () => {
    const items = [
      practiceItem({ id: "p.geo.0001", p: 0.95, shape: "tf" }),
      ...[0.8, 0.79, 0.78, 0.77, 0.76].map((value, i) =>
        practiceItem({ id: `p.geo.010${i}`, p: value }),
      ),
    ];
    for (let run = 0; run < 50; run += 1) {
      const plan = planPracticeRun(
        items,
        request({ seed: `tf-top:${run}`, difficulty: "easy", length: 5 }),
      );
      expect(plan.items).toHaveLength(5);
      expect(plan.items[0]?.format).not.toBe("tf");
      expect(plan.items.map((item) => item.id)).not.toContain("p.geo.0001");
    }
  });

  it("opens on a non true/false item that ties for easiest", () => {
    const items = [
      practiceItem({ id: "p.geo.0001", p: 0.9, shape: "tf" }),
      practiceItem({ id: "p.geo.0002", p: 0.9 }),
      practiceItem({ id: "p.geo.0003", p: 0.8 }),
    ];
    const plan = planPracticeRun(
      items,
      request({ difficulty: "easy", length: 3 }),
    );
    expect(plan.items[0]?.id).toBe("p.geo.0002");
    expect(plan.items).toHaveLength(3);
  });
});

describe("planPracticeRun: Mixed", () => {
  const pool = syntheticPool();

  it("AC-PRA-13 across 1,000 seeded Mixed runs: 4 Easy, 4 Medium and 2 Hard; question 1 easiest; 1 to 7 non-increasing; the hardest at 8 or 9; 10 a Medium", () => {
    const hardestAt = new Set<number>();
    for (let run = 0; run < 1000; run += 1) {
      const category = (["mixed", "geo", "hist", "sci"] as const)[run % 4];
      const { items, notes } = planPracticeRun(
        pool,
        request({ seed: `ac-pra-13:${run}`, category }),
      );
      expect(items).toHaveLength(10);
      expect(notes).toEqual([]);
      const bands = items.map(band);
      expect(bands.filter((b) => b === "easy")).toHaveLength(4);
      expect(bands.filter((b) => b === "medium")).toHaveLength(4);
      expect(bands.filter((b) => b === "hard")).toHaveLength(2);
      expect(bands).toEqual([
        "easy",
        "easy",
        "easy",
        "easy",
        "medium",
        "medium",
        "medium",
        "hard",
        "hard",
        "medium",
      ]);
      const ps = items.map(p);
      expect(ps[0]).toBe(Math.max(...ps));
      for (let i = 1; i < 7; i += 1) {
        expect(ps[i]).toBeLessThanOrEqual(ps[i - 1] as number);
      }
      const hardest = Math.min(...ps);
      const position = ps.indexOf(hardest);
      expect([7, 8]).toContain(position);
      hardestAt.add(position);
      // Position 10 is the Medium players most often get.
      const mediums = items.filter((item) => band(item) === "medium").map(p);
      expect(ps[9]).toBe(Math.max(...mediums));
    }
    // The seed decides between 8 and 9, so both happen.
    expect(hardestAt).toEqual(new Set([7, 8]));
  });

  it("borrows from a neighbouring band when a band is empty, so the run still has ten", () => {
    const noEasy = syntheticPool({
      categories: ["geo"],
      perBand: { easy: 0, medium: 12, hard: 6 },
    });
    const plan = planPracticeRun(noEasy, request({ category: "geo" }));
    expect(plan.items).toHaveLength(10);
    expect(plan.items[0]?.format).not.toBe("tf");
    expect(plan.notes).toEqual([]);
  });

  it("is shorter, with pool_exhausted, when the whole filter holds fewer than ten", () => {
    const tiny = syntheticPool({
      categories: ["geo"],
      perBand: { easy: 2, medium: 2, hard: 1 },
    });
    const plan = planPracticeRun(tiny, request({ category: "geo" }));
    expect(plan.items.length).toBeLessThan(10);
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.notes).toContain("pool_exhausted");
  });
});

describe("planPracticeRun: bands", () => {
  const pool = syntheticPool();

  it("AC-PRA-08 a Hard run contains only items with p < 0.45 and an Easy run only p >= 0.75", () => {
    for (let run = 0; run < 300; run += 1) {
      const hard = planPracticeRun(
        pool,
        request({ seed: `hard:${run}`, difficulty: "hard", category: "geo" }),
      );
      expect(hard.items).toHaveLength(10);
      expect(hard.notes).toEqual([]);
      for (const item of hard.items) expect(p(item)).toBeLessThan(0.45);
      const easy = planPracticeRun(
        pool,
        request({ seed: `easy:${run}`, difficulty: "easy" }),
      );
      expect(easy.items).toHaveLength(10);
      for (const item of easy.items) {
        expect(p(item)).toBeGreaterThanOrEqual(0.75);
      }
      const medium = planPracticeRun(
        pool,
        request({ seed: `medium:${run}`, difficulty: "medium" }),
      );
      for (const item of medium.items) {
        expect(p(item)).toBeGreaterThanOrEqual(0.45);
        expect(p(item)).toBeLessThan(0.75);
      }
    }
  });

  it("AC-PRA-08 the only exception in a Hard run is the Medium fill of a short Hard filter, which is noted", () => {
    const plan = planPracticeRun(
      geographyFixtureShape(),
      request({ difficulty: "hard", category: "geo", mode: "category" }),
    );
    expect(plan.notes).toEqual(["hard_filled"]);
    const outside = plan.items.filter((item) => p(item) >= 0.45);
    expect(outside.every((item) => band(item) === "medium")).toBe(true);
  });

  it("never borrows from another band for a chosen band: a short Easy filter is shorter instead", () => {
    const pool = [
      ...[0.9, 0.85, 0.8, 0.76].map((value, i) =>
        practiceItem({ id: `p.geo.000${i + 1}`, p: value }),
      ),
      ...syntheticPool({
        categories: ["geo"],
        perBand: { easy: 0, medium: 20, hard: 20 },
      }).map((item, i) =>
        practiceItem({
          id: `p.geo.1${String(i).padStart(3, "0")}`,
          p: item.predicted.p,
        }),
      ),
    ];
    const plan = planPracticeRun(
      pool,
      request({ difficulty: "easy", category: "geo" }),
    );
    expect(plan.items).toHaveLength(4);
    expect(plan.items.every((item) => band(item) === "easy")).toBe(true);
    expect(plan.notes).toEqual(["pool_exhausted"]);
  });

  it("an empty filter is an empty plan", () => {
    const plan = planPracticeRun(
      syntheticPool({ categories: ["geo"] }),
      request({ category: "music", difficulty: "easy" }),
    );
    expect(plan).toEqual({ items: [], notes: ["pool_exhausted"] });
  });

  it("takes its thresholds from the options", () => {
    const pool = syntheticPool({ categories: ["geo"] });
    const plan = planPracticeRun(
      pool,
      request({ difficulty: "easy", category: "geo" }),
      { bands: { easyMinP: 0.9, hardMaxP: 0.45 } },
    );
    expect(plan.items.length).toBeGreaterThan(0);
    for (const item of plan.items) expect(p(item)).toBeGreaterThanOrEqual(0.9);
  });
});

describe("planPracticeRun: short Hard filters", () => {
  const pool = geographyFixtureShape();
  const hardIds = pool
    .filter((item) => item.category === "geo" && band(item) === "hard")
    .map((item) => item.id);
  const geoMedium = pool.filter(
    (item) => item.category === "geo" && band(item) === "medium",
  );

  it("AC-PRA-14 a Hard run in a category with 3 unseen Hard items serves those 3 and fills with the 7 hardest unseen Medium items", () => {
    const plan = planPracticeRun(
      pool,
      request({ difficulty: "hard", category: "geo", mode: "category" }),
    );
    expect(plan.items).toHaveLength(10);
    expect(plan.notes).toEqual(["hard_filled"]);
    const ids = plan.items.map((item) => item.id);
    for (const id of hardIds) expect(ids).toContain(id);
    for (const item of geoMedium) expect(ids).toContain(item.id);
    expect(ids.some((id) => id.startsWith("p.hist."))).toBe(false);
  });

  it("AC-PRA-14 fills with the hardest unseen Medium items first", () => {
    const bigger = [
      ...pool,
      ...[0.74, 0.73, 0.7].map((value, i) =>
        practiceItem({ id: `p.geo.030${i + 1}`, p: value }),
      ),
    ];
    const plan = planPracticeRun(
      bigger,
      request({ difficulty: "hard", category: "geo" }),
    );
    const mediums = plan.items.filter((item) => band(item) === "medium");
    expect(mediums).toHaveLength(7);
    // The three easiest Mediums (0.74, 0.73, 0.72) are left out.
    expect(Math.max(...mediums.map(p))).toBe(0.7);
  });

  it("AC-PRA-14 with no unseen Hard or Medium items left, the plan stops before any repeat, and repeats appear only with Play with repeats", () => {
    const seen = seenAll(
      pool.filter((item) => item.category === "geo"),
      TODAY_DAY,
    );
    const stopped = planPracticeRun(
      pool,
      request({ difficulty: "hard", category: "geo", seen }),
    );
    expect(stopped).toEqual({ items: [], notes: ["hard_exhausted"] });

    // Hard Mixed, offered first, still has unseen Hard items elsewhere.
    const hardMixed = planPracticeRun(
      pool,
      request({ difficulty: "hard", category: "mixed", seen }),
    );
    expect(hardMixed.items).toHaveLength(10);
    expect(hardMixed.notes).toEqual([]);
    expect(hardMixed.items.every((item) => item.id.startsWith("p.hist."))).toBe(
      true,
    );

    const withRepeats = planPracticeRun(
      pool,
      request({ difficulty: "hard", category: "geo", seen, repeats: true }),
    );
    expect(withRepeats.items).toHaveLength(10);
    expect(withRepeats.notes).toContain("repeats_mixed_in");
    for (const id of hardIds) {
      expect(withRepeats.items.map((item) => item.id)).toContain(id);
    }
  });

  it("AC-PRA-14 a partly fresh short Hard filter still waits for the player before any repeat", () => {
    const seen = seenAll(geoMedium.slice(0, 3), TODAY_DAY);
    const plan = planPracticeRun(
      pool,
      request({ difficulty: "hard", category: "geo", seen }),
    );
    expect(plan).toEqual({ items: [], notes: ["hard_exhausted"] });
  });

  it("AC-PRA-14 Play with repeats over a filter played through carries the repeats note alone", () => {
    const seen = seenAll(
      pool.filter((item) => item.category === "geo"),
      TODAY_DAY - 1,
    );
    const plan = planPracticeRun(
      pool,
      request({ difficulty: "hard", category: "geo", seen, repeats: true }),
    );
    expect(plan.items).toHaveLength(10);
    // Every Medium in it is a repeat, so it is no "toughest ones left" fill.
    expect(plan.notes).toEqual(["repeats_mixed_in"]);
  });

  it("AC-PRA-14 Play with repeats keeps the hard_filled note when fresh Medium items fill the run too", () => {
    const seen = seenAll(geoMedium.slice(0, 3), TODAY_DAY);
    const plan = planPracticeRun(
      pool,
      request({ difficulty: "hard", category: "geo", seen, repeats: true }),
    );
    expect(plan.notes).toEqual(["hard_filled", "repeats_mixed_in"]);
  });

  it("AC-PRA-06 a Hard run with repeats fills with the least recently seen items, not the hardest", () => {
    const hard = [0.42, 0.38, 0.3].map((value, i) =>
      practiceItem({ id: `p.geo.010${i + 1}`, p: value }),
    );
    // Twelve Mediums: the seven hardest seen yesterday, the five easiest 50 days ago.
    const medium = [
      0.46, 0.47, 0.48, 0.49, 0.5, 0.51, 0.52, 0.6, 0.62, 0.64, 0.66, 0.68,
    ].map((value, i) =>
      practiceItem({ id: `p.geo.02${String(i).padStart(2, "0")}`, p: value }),
    );
    const seen = new Map<ItemId, number>([
      ...hard.map((item) => [item.id, TODAY_DAY - 1] as const),
      ...medium.map(
        (item, i) => [item.id, TODAY_DAY - (i < 7 ? 1 : 50)] as const,
      ),
    ]);
    for (let run = 0; run < 50; run += 1) {
      const plan = planPracticeRun(
        [...hard, ...medium],
        request({
          seed: `ac-pra-06-hard:${run}`,
          difficulty: "hard",
          category: "geo",
          seen,
          repeats: true,
        }),
      );
      expect(plan.items).toHaveLength(10);
      expect(plan.notes).toEqual(["repeats_mixed_in"]);
      const ids = new Set(plan.items.map((item) => item.id));
      // The Hard repeats first, then the Mediums seen longest ago.
      for (const item of hard) expect(ids.has(item.id)).toBe(true);
      for (const item of medium.slice(7)) expect(ids.has(item.id)).toBe(true);
      const recent = medium.slice(0, 7).filter((item) => ids.has(item.id));
      expect(recent).toHaveLength(2);
    }
  });
});

describe("planPracticeRun: freshness", () => {
  // Plain multiple choice only, so the composition rules never stand in the way.
  const easy = Array.from({ length: 30 }, (_, i) =>
    practiceItem({
      id: `p.geo.0${String(i + 100)}`,
      p: 0.75 + (i % 20) / 100,
    }),
  );
  const pool = [
    ...easy,
    ...syntheticPool({
      categories: ["hist"],
      perBand: { easy: 10, medium: 10, hard: 10 },
    }),
  ];

  it("AC-PRA-05 an item seen today is not served again within 60 days while unseen items remain in the filter", () => {
    const seenToday = easy.slice(0, 15);
    const seen = seenAll(seenToday, TODAY_DAY);
    const seenIds = new Set<ItemId>(seenToday.map((item) => item.id));
    for (let run = 0; run < 200; run += 1) {
      for (const day of [0, 30, 59]) {
        const plan = planPracticeRun(
          pool,
          request({
            seed: `ac-pra-05:${run}:${day}`,
            difficulty: "easy",
            category: "geo",
            seen,
            today: addDays(TODAY, day),
          }),
        );
        expect(plan.items).toHaveLength(10);
        expect(plan.items.some((item) => seenIds.has(item.id))).toBe(false);
        expect(plan.notes).toEqual([]);
      }
    }
  });

  it("AC-PRA-05 prefers items never seen over items seen 60 or more days ago, which count as fresh", () => {
    const long = easy.slice(0, 25);
    const seen = seenAll(long, TODAY_DAY - 60);
    const plan = planPracticeRun(
      pool,
      request({ difficulty: "easy", category: "geo", seen }),
    );
    const neverSeen = easy.slice(25).map((item) => item.id);
    const ids = plan.items.map((item) => item.id);
    for (const id of neverSeen) expect(ids).toContain(id);
    expect(plan.notes).toEqual([]);
  });

  it("AC-PRA-06 when the filter runs short, the repeats note appears and the least recently seen items fill the run", () => {
    // 27 of 30 Easy items seen, on days spread over the last month.
    const seen = new Map<ItemId, number>(
      easy.slice(0, 27).map((item, i) => [item.id, TODAY_DAY - 1 - i]),
    );
    const plan = planPracticeRun(
      pool,
      request({ difficulty: "easy", category: "geo", seen }),
    );
    expect(plan.items).toHaveLength(10);
    expect(plan.notes).toEqual(["repeats_mixed_in"]);
    const ids = new Set(plan.items.map((item) => item.id));
    for (const item of easy.slice(27)) expect(ids.has(item.id)).toBe(true);
    // The seven repeats are the seven seen longest ago: 21 to 27 days ago.
    const repeats = plan.items
      .filter((item) => seen.has(item.id))
      .map((item) => TODAY_DAY - (seen.get(item.id) ?? 0))
      .sort((a, b) => a - b);
    expect(repeats).toEqual([21, 22, 23, 24, 25, 26, 27]);
  });

  it("AC-PRA-07 an item on the pulled denylist is never served", () => {
    const denylist = new Set<ItemId>(pool.slice(0, 18).map((item) => item.id));
    for (let run = 0; run < 300; run += 1) {
      const plan = planPracticeRun(
        pool,
        request({ seed: `ac-pra-07:${run}`, denylist, category: "geo" }),
      );
      expect(plan.items.some((item) => denylist.has(item.id))).toBe(false);
    }
  });

  it("leaves out items past their review-by date", () => {
    const items = [
      practiceItem({ id: "p.geo.0001", p: 0.9, reviewBy: "2026-10-31" }),
      practiceItem({ id: "p.geo.0002", p: 0.9, reviewBy: "2026-11-01" }),
      practiceItem({ id: "p.geo.0003", p: 0.9 }),
    ];
    const plan = planPracticeRun(
      items,
      request({ difficulty: "easy", length: 3 }),
    );
    expect(plan.items.map((item) => item.id).sort()).toEqual([
      "p.geo.0002",
      "p.geo.0003",
    ]);
  });

  it("serves only the monthly pack's tags when it names any", () => {
    const items = [
      practiceItem({ id: "p.geo.0001", p: 0.9, tags: ["rivers"] }),
      practiceItem({ id: "p.geo.0002", p: 0.8, tags: ["lakes"] }),
      practiceItem({ id: "p.geo.0003", p: 0.85, tags: ["rivers", "seas"] }),
    ];
    const plan = planPracticeRun(
      items,
      request({ difficulty: "easy", tags: ["rivers"], mode: "pack" }),
    );
    expect(plan.items.map((item) => item.id).sort()).toEqual([
      "p.geo.0001",
      "p.geo.0003",
    ]);
  });
});

describe("planPracticeRun: determinism", () => {
  const pool = syntheticPool();

  it("gives the same plan for the same seed, whatever order the pool arrives in", () => {
    const a = planPracticeRun(pool, request({ seed: "same" }));
    const b = planPracticeRun([...pool].reverse(), request({ seed: "same" }));
    expect(b).toEqual(a);
  });

  it("varies with the seed", () => {
    const plans = new Set<string>();
    for (let run = 0; run < 20; run += 1) {
      const plan = planPracticeRun(pool, request({ seed: `vary:${run}` }));
      plans.add(plan.items.map((item) => item.id).join(","));
    }
    expect(plans.size).toBeGreaterThan(15);
  });

  it("drops duplicate ids from a pool assembled from several packs", () => {
    const plan = planPracticeRun([...pool, ...pool], request({ seed: "dups" }));
    expect(new Set(plan.items.map((item) => item.id)).size).toBe(10);
  });

  it("plans nothing for a zero length", () => {
    expect(planPracticeRun(pool, request({ length: 0 }))).toEqual({
      items: [],
      notes: [],
    });
  });
});

describe("planPracticeRun: ramp", () => {
  it("serves Easy for questions 1 to 5 and Medium after, easiest first in each", () => {
    const pool = syntheticPool();
    for (let run = 0; run < 100; run += 1) {
      const plan = planPracticeRun(
        pool,
        request({ seed: `ramp:${run}`, difficulty: "ramp", mode: "survival" }),
      );
      expect(plan.items.map(band)).toEqual([
        ...Array<string>(5).fill("easy"),
        ...Array<string>(5).fill("medium"),
      ]);
      expect(plan.items[0]?.format).not.toBe("tf");
    }
  });

  it("reaches Hard after the ramp's Medium stretch", () => {
    const plan = planPracticeRun(
      syntheticPool(),
      request({ difficulty: "ramp", length: 14 }),
      { ramp: { easyThrough: 5, mediumThrough: 12 } },
    );
    expect(plan.items.slice(12).map(band)).toEqual(["hard", "hard"]);
  });
});
