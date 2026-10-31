// @vitest-environment node
import { describe, expect, it } from "vitest";

import { BatchRegisterSchema } from "../schema/batches.ts";
import {
  batchForItem,
  isReservedExampleId,
  parseBatchId,
  parseItemId,
} from "./ids.ts";
import {
  draftFor,
  idRange,
  issueIds,
  openBatch,
  productionPlan,
  runIdOf,
  sameAgentRun,
  searchBudget,
} from "./register.ts";

describe("the production plan", () => {
  it("is a valid register of planned batches with the accepted targets", () => {
    const register = BatchRegisterSchema.parse(productionPlan());
    const total = (pool: string) =>
      register.batches
        .filter((b) => b.pool === pool)
        .reduce((sum, b) => sum + b.plan.target, 0);
    expect(total("practice")).toBe(24 * 63);
    expect(total("mystery")).toBe(360);
    expect(total("encore")).toBe(120);
    expect(total("room")).toBe(120);
    expect(
      register.batches.find((b) => b.batchId === "p.geo.b01")?.plan.draft,
    ).toBe(draftFor(63));
    expect(draftFor(63)).toBe(73);
  });
});

describe("opening batches and issuing ids", () => {
  it("opens a planned batch for one writer and issues ids in its range", () => {
    const register = productionPlan();
    openBatch(register, "p.geo.b01", { writer: "w-run1" });
    expect(issueIds(register, "p.geo.b01", "w-run1", 3)).toEqual([
      "p.geo.0101",
      "p.geo.0102",
      "p.geo.0103",
    ]);
    expect(issueIds(register, "p.geo.b01", "w-run1", 2)).toEqual([
      "p.geo.0104",
      "p.geo.0105",
    ]);
    expect(() => issueIds(register, "p.geo.b01", "w-run2", 1)).toThrow(
      /registered to w-run1/,
    );
    expect(() => issueIds(register, "p.geo.b01", "w-run1", 95)).toThrow(
      /up to sequence 99/,
    );
    expect(() => issueIds(register, "p.hist.b01", "w-run1", 1)).toThrow(
      /planned/,
    );
    expect(() =>
      openBatch(register, "p.geo.b01", { writer: "w-run3" }),
    ).toThrow(/open, not planned/);
    expect(() =>
      openBatch(register, "l.city.b01", { writer: "w-run3" }),
    ).toThrow(/lb- agents/);
  });

  it("numbers room questions per pack, from 01 to 89", () => {
    const register = productionPlan();
    openBatch(register, "r.game-on.b01", { writer: "w-room" });
    expect(issueIds(register, "r.game-on.b01", "w-room", 2)).toEqual([
      "r.game-on.01",
      "r.game-on.02",
    ]);
    const batch = openBatch(register, "r.game-on.b02", {
      writer: "w-room2",
      target: 3,
    });
    expect(idRange(register, batch)).toEqual({
      first: "r.game-on.03",
      last: "r.game-on.89",
    });
    expect(issueIds(register, "r.game-on.b02", "w-room2", 1)).toEqual([
      "r.game-on.03",
    ]);
    const parsed = parseItemId("r.game-on.03");
    expect(parsed && batchForItem(register, parsed)?.batchId).toBe(
      "r.game-on.b02",
    );
  });

  it("adds top-up batches only with a target", () => {
    const register = productionPlan();
    expect(() => openBatch(register, "p.geo.b06", { writer: "w-x" })).toThrow(
      /--target/,
    );
    const batch = openBatch(register, "p.geo.b06", {
      writer: "w-x",
      target: 20,
    });
    expect(batch).toMatchObject({
      category: "geo",
      status: "open",
      plan: { target: 20, draft: 23 },
    });
    expect(BatchRegisterSchema.safeParse(register).success).toBe(true);
  });
});

describe("ids", () => {
  it("parses item and batch ids, and spots reserved examples", () => {
    expect(parseItemId("p.geo.0317")).toMatchObject({
      pool: "practice",
      category: "geo",
      batchNumber: 3,
      sequence: 17,
    });
    expect(parseItemId("fx.m.hist.0207")).toMatchObject({
      pool: "mystery",
      fixture: true,
      batchNumber: 2,
      sequence: 7,
    });
    expect(parseItemId("e.0104")).toMatchObject({
      pool: "encore",
      batchNumber: 1,
      sequence: 4,
    });
    expect(parseItemId("r.around-the-world.12")).toMatchObject({
      pool: "room",
      packId: "around-the-world",
      sequence: 12,
    });
    expect(parseItemId("q.geo.0101")).toBeNull();
    expect(parseBatchId("l.music_artist.b05")).toMatchObject({
      pool: "list",
      scope: "music_artist",
      number: 5,
    });
    expect(
      isReservedExampleId(
        parseItemId("p.geo.0001") as NonNullable<
          ReturnType<typeof parseItemId>
        >,
      ),
    ).toBe(true);
    expect(
      isReservedExampleId(
        parseItemId("r.all-sorts.93") as NonNullable<
          ReturnType<typeof parseItemId>
        >,
      ),
    ).toBe(true);
  });

  it("compares agent runs across roles", () => {
    expect(runIdOf("fc-a1b2")).toBe("a1b2");
    expect(sameAgentRun("w-a1b2", "fc-a1b2")).toBe(true);
    expect(sameAgentRun("fc-a1b2", "fc-c3d4")).toBe(false);
    expect(sameAgentRun("fc-a1b2", null)).toBe(false);
    // Case is ignored: fc-ABC and w-abc are one run.
    expect(sameAgentRun("fc-ABC", "w-abc")).toBe(true);
    expect(runIdOf("ED-Run9")).toBe("run9");
  });

  it("scales the WebSearch caps to the batch size", () => {
    const register = productionPlan();
    const budget = (id: string) =>
      searchBudget(
        register.batches.find((b) => b.batchId === id) ?? register.batches[0]!,
      );
    expect(budget("p.geo.b01")).toBe(26);
    expect(budget("m.geo.b01")).toBe(45);
    expect(budget("e.b01")).toBe(48);
    expect(budget("r.game-on.b01")).toBe(8);
  });
});
