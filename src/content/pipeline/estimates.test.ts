// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import {
  WRITER,
  itemOf,
  loadFx,
  removeTempDirs,
} from "./__fixtures__/builders.ts";
import {
  EstimateInputSchema,
  applyEstimate,
  invLogit,
  logit,
  median,
  stdev,
} from "./estimates.ts";
import { estimatorView } from "./packets.ts";
import { requireBatch } from "./register.ts";

afterAll(removeTempDirs);

const NOW = "2026-11-02T09:00:00Z";

describe("estimator v0 (§8.5)", () => {
  it("combines five values of p by the median on the logit scale", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const { item, outcome } = applyEstimate(
      record,
      requireBatch(bank, "p.geo.b01"),
      {
        itemId: record.id,
        estimator: "es-fx-one",
        estimates: [0.6, 0.7, 0.75, 0.8, 0.9],
      },
      NOW,
    );
    expect(outcome.errors).toEqual([]);
    const logits = [0.6, 0.7, 0.75, 0.8, 0.9].map(logit);
    expect(item && "predicted" in item ? item.predicted : null).toEqual({
      p: Math.round(invLogit(median(logits)) * 1000) / 1000,
      spread: Math.round(stdev(logits) * 1000) / 1000,
      estimator: "v0",
    });
  });

  it("keeps a mystery's cumulative shares rising, and encores' exact share under close", async () => {
    const bank = await loadFx();
    const mystery = applyEstimate(
      itemOf(bank, "fx.m.geo.0101"),
      requireBatch(bank, "m.geo.b01"),
      {
        itemId: "fx.m.geo.0101",
        estimator: "es-fx-two",
        estimates: [
          [0.5, 0.45, 0.9, 0.97],
          [0.55, 0.5, 0.9, 0.98],
          [0.6, 0.55, 0.92, 0.99],
          [0.5, 0.48, 0.88, 0.97],
          [0.45, 0.4, 0.9, 0.96],
        ],
      },
      NOW,
    );
    const shares = (mystery.outcome.predicted as { solveByClue: number[] })
      .solveByClue;
    expect(shares.every((s, i) => i === 0 || s >= (shares[i - 1] ?? 0))).toBe(
      true,
    );
    const encore = applyEstimate(
      itemOf(bank, "fx.e.0101"),
      requireBatch(bank, "e.b01"),
      {
        itemId: "fx.e.0101",
        estimator: "es-fx-three",
        estimates: Array.from({ length: 5 }, (_, i) => ({
          pClose: 0.2 + i * 0.05,
          pExact: 0.01,
        })),
      },
      NOW,
    );
    expect(encore.outcome.predicted).toMatchObject({
      pClose: 0.3,
      estimator: "v0",
    });
  });

  it("refuses the writer as estimator, wrong shapes and anything but five estimates", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const batch = requireBatch(bank, "p.geo.b01");
    expect(
      applyEstimate(
        record,
        batch,
        {
          itemId: record.id,
          estimator: `es-${WRITER.slice(2)}`,
          estimates: [0.5, 0.5, 0.5, 0.5, 0.5],
        },
        NOW,
      ).outcome.errors,
    ).toEqual([expect.stringContaining("wrote this batch")]);
    expect(
      applyEstimate(
        record,
        batch,
        {
          itemId: record.id,
          estimator: "es-x",
          estimates: [[0.1, 0.2, 0.3, 0.4], 0.5, 0.5, 0.5, 0.5],
        },
        NOW,
      ).outcome.errors,
    ).toEqual([expect.stringContaining("five values of p")]);
    expect(
      EstimateInputSchema.safeParse([
        {
          itemId: record.id,
          estimator: "es-x",
          estimates: [0.5, 0.5, 0.5, 0.5],
        },
      ]).success,
    ).toBe(false);
  });

  it("records the estimator's run, so it can never check or edit the item (§0.2)", async () => {
    const bank = await loadFx();
    const record = itemOf(bank, "fx.p.geo.0101");
    const batch = requireBatch(bank, "p.geo.b01");
    const { item } = applyEstimate(
      record,
      batch,
      {
        itemId: record.id,
        estimator: "es-fx-four",
        estimates: [0.5, 0.5, 0.5, 0.5, 0.5],
      },
      NOW,
    );
    expect(item?.verification?.estimates).toEqual([
      { by: "es-fx-four", at: NOW },
    ]);
    // A draft without a check record stays a draft.
    expect(item?.status).toBe("draft");
    const edited = {
      ...record.item,
      verification: {
        checks: [],
        editor: {
          editor: "ed-fx-five",
          decision: "rewrite" as const,
          reason: "x",
          decidedAt: NOW,
        },
      },
    } as typeof record.item;
    expect(
      applyEstimate(
        { ...record, item: edited },
        batch,
        {
          itemId: record.id,
          estimator: "es-fx-five",
          estimates: [0.5, 0.5, 0.5, 0.5, 0.5],
        },
        NOW,
      ).outcome.errors,
    ).toEqual([expect.stringContaining("is this item's editor")]);
  });

  it("gives the estimator the key but no claims, notes or seed", async () => {
    const bank = await loadFx();
    const view = estimatorView(bank, itemOf(bank, "fx.p.geo.0101"));
    expect(view.key).toEqual({ answer: "Bone flute" });
    expect(Object.keys(view)).not.toEqual(expect.arrayContaining(["claims"]));
    expect(JSON.stringify(view)).not.toMatch(
      /writerNotes|seededDifficulty|claims|explanation/,
    );
  });
});
