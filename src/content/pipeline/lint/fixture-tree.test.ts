// @vitest-environment node
/**
 * The fixture tree itself (content/fixtures/), which every mock build and
 * the RITE playtests play, against what round 2 found
 * (docs/playtests/rite-2.md): the new rules pass on it (X33 for R2-15, X34
 * for R2-23), its ascending keys are spread, and the Mystery 1s that round
 * 3 will play don't give themselves away (section 10, item 11). R2-22's
 * cross-pool check over the same tree is content:dedupe's
 * (scripts/content/dedupe.test.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { DAILY_EPOCH } from "@/config/shared";
import {
  FIXTURE_SCHEDULE,
  FIXTURE_SPARES,
  fixtureDailyFor,
  fixtureRoundContent,
} from "@/content/loaders/fixtures/sealed";
import { parseLocalDate, type LocalDate } from "@/engine/types";

import { REPO_ROOT } from "../__fixtures__/builders.ts";
import { loadBank, type Bank } from "../bank.ts";
import { playerTextFields } from "./fields.ts";
import { lintBank, type Finding } from "./index.ts";
import { resolveLayout } from "../layout.ts";
import { ascendingKeyPosition } from "./pool-rules.ts";

let bank: Bank;
let findings: Finding[];

beforeAll(async () => {
  bank = await loadBank(
    resolveLayout({
      repoRoot: REPO_ROOT,
      root: "content/fixtures",
      fixtures: true,
    }),
  );
  findings = lintBank(bank, { today: "2026-11-05", dedupe: false });
});

const itemNamed = (id: string) => {
  const record = bank.itemsById.get(id);
  if (record === undefined) throw new Error(`${id} is not in the fixtures`);
  return record.item;
};

describe("the fixture tree after RITE round 2", () => {
  it("R2-15 asks which is heavier of the two loaves, and passes X33", () => {
    const loaves = itemNamed("fx.p.food.0106");
    expect(loaves).toMatchObject({
      format: "comparison",
      stem: "Which is heavier?",
      relation: "heavier",
      measure: "mass",
    });
    expect(findings.filter((finding) => finding.rule === "X33")).toEqual([]);
  });

  it("R2-23 spreads its seven ascending keys with no position holding more than three, and passes X34", () => {
    const counts = [0, 0, 0, 0];
    for (const record of bank.items) {
      if (record.pool !== "practice") continue;
      const position = ascendingKeyPosition(record.item);
      if (position !== null) counts[position] = (counts[position] ?? 0) + 1;
    }
    // Round 2 played A 1, B 5, C 1, D 0.
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(7);
    for (const count of counts) expect(count).toBeLessThanOrEqual(3);
    expect(counts).toEqual([2, 2, 2, 1]);
    expect(findings.filter((finding) => finding.rule === "X34")).toEqual([]);
  });

  it("R2-22 no longer tells the Gorlund Games' year in fx.p.hist.0105, or anywhere in practice", () => {
    for (const record of bank.items) {
      if (record.pool !== "practice") continue;
      const text = playerTextFields(record.item)
        .map((field) => field.value)
        .join(" ");
      expect(text, record.id).not.toMatch(/Gorlund Games/);
    }
    expect(itemNamed("fx.p.hist.0105")).toMatchObject({
      stem: "Which came first?",
      b: "The Saltby horse fair",
      a: "The Pellin wool market",
      values: { a: 1180, b: 1290 },
    });
  });

  it("fx.p.hist.0105 no longer tells the Cindral charter's year, which fx.p.hist.0103 asks for", () => {
    const text = playerTextFields(itemNamed("fx.p.hist.0105"))
      .map((field) => field.value)
      .join(" ");
    expect(text).not.toMatch(/Cindral|1204/);
    expect(itemNamed("fx.p.hist.0103")).toMatchObject({ answer: "1204" });
  });
});

describe("the Mystery 1s round 3 will play (RITE round 2, section 10, item 11)", () => {
  /** Round 3 plays Daily #46 on (Thursday 5 November 2026). */
  const ROUND_3_FROM = 46;
  /**
   * A pronoun that tells a person's gender. With a 40-name fixture list a
   * few typed letters list four names, and "her" left one or two: every
   * persona solved #46's Mystery 1 on clue 1 that way.
   */
  const GENDERED = /\b(?:he|she|his|her|hers|him|himself|herself)\b/i;

  function dateOf(dailyNumber: number): LocalDate {
    const at =
      Date.parse(`${DAILY_EPOCH}T00:00:00Z`) + (dailyNumber - 1) * 86_400_000;
    const parsed = parseLocalDate(new Date(at).toISOString().slice(0, 10));
    if (parsed === null) throw new Error(`no date for #${dailyNumber}`);
    return parsed;
  }

  it("R2 §10 item 11 no person Mystery 1 from Daily #46 on gives the answer's gender away in clue 1", () => {
    const first = dateOf(ROUND_3_FROM);
    expect(first).toBe("2026-11-05");
    // One whole cycle of the spare sets from #46, and every dated row after.
    const days = new Set<LocalDate>([
      ...FIXTURE_SPARES.map((_, i) => dateOf(ROUND_3_FROM + i)),
      ...FIXTURE_SCHEDULE.map((row) => row.date).filter((day) => day >= first),
    ]);
    const people: string[] = [];
    for (const day of days) {
      const round = fixtureDailyFor(day)?.rounds.find(
        (spec) => spec.type === "mystery" && spec.difficulty === "easy",
      );
      if (round === undefined) continue;
      const content = fixtureRoundContent(round.contentId);
      if (content?.kind !== "mystery" || content.answerType !== "person")
        continue;
      expect(content.clues[0], `${day}: ${round.contentId}`).not.toMatch(
        GENDERED,
      );
      people.push(round.contentId);
    }
    // #46 itself plays the person Mystery round 2 solved by the pronoun.
    expect(people).toContain("fx.m.hist.0101");
  });
});

describe("the Daily round 4 plays (RITE round 3, R3-04)", () => {
  it("R3-04 no clue-4 option in the fixture tree breaks a letter rule its clue 3 states (X35)", () => {
    expect(findings.filter((finding) => finding.rule === "X35")).toEqual([]);
    // Round 3's Mystery 3 is the case X35 was written for: its options now
    // all begin and end with A.
    const arvenna = fixtureRoundContent(
      "fx.m.geo.0101" as Parameters<typeof fixtureRoundContent>[0],
    );
    expect(arvenna?.kind === "mystery" && arvenna.clues[2]).toMatch(
      /begins and ends with the letter A/,
    );
  });

  it("R3-04 set A, round 4's Daily, keeps Mystery 1 at slot 1 and the other two at their slots", () => {
    for (const [id, slot] of [
      ["fx.m.film.0101", 1],
      ["fx.m.sci.0101", 2],
      ["fx.m.geo.0101", 3],
    ] as const) {
      expect(itemNamed(id)).toMatchObject({ kind: "mystery", slot });
    }
  });
});
