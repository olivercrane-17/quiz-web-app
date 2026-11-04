// @vitest-environment node
/**
 * The batch register (CONTENT_GUIDE §11.3) and the dataset manifest
 * (§9.5.1): the repository's files pass, and the rules CNT-2 adds refuse
 * what they should.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../pipeline/__fixtures__/builders.ts";
import { BatchEntrySchema, BatchRegisterSchema } from "./batches.ts";
import { DatasetManifestSchema } from "./datasets.ts";

const read = (path: string) =>
  JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8")) as unknown;

const closedPractice = {
  batchId: "p.geo.b01",
  pool: "practice",
  category: "geo",
  writer: "w-run1",
  status: "closed",
  plan: { target: 63, draft: 72 },
  accepted: 60,
  cut: 12,
  lastSequence: 72,
  incidents: [],
};

describe("the batch register", () => {
  it("validates the repository's register", () => {
    expect(
      BatchRegisterSchema.safeParse(read("content/batches.json")).success,
    ).toBe(true);
  });

  it("takes §11.3's + fields on the pools they describe", () => {
    expect(
      BatchEntrySchema.safeParse({
        ...closedPractice,
        searchCaps: { writer: 7, A: 26, B: 7 },
        searchesUsed: { writer: 2, A: 19, B: 4, T: 1, followUps: 2 },
        highRiskClaims: 140,
        externallyEvidenced: 140,
        bandCounts: { easy: 24, medium: 25, hard: 11 },
        approvals: [
          {
            date: "2026-11-02",
            what: "Copy GeoNames coordinates into a shipped file",
            by: "owner",
          },
        ],
      }).success,
    ).toBe(true);
    const encore = {
      batchId: "e.b01",
      pool: "encore",
      writer: "w-run2",
      status: "open",
      plan: { target: 40, draft: 46 },
      accepted: null,
      cut: null,
      lastSequence: 0,
      incidents: [],
    };
    expect(
      BatchEntrySchema.safeParse({ ...encore, measuredEncores: 4 }).success,
    ).toBe(true);
    const mystery = {
      ...encore,
      batchId: "m.geo.b01",
      pool: "mystery",
      category: "geo",
    };
    expect(
      BatchEntrySchema.safeParse({
        ...mystery,
        typeCounts: { country: 12, city: 10, landmark: 8 },
      }).success,
    ).toBe(true);
  });

  it("refuses a + field on the wrong pool, too many measured encores, and a close with unevidenced high-risk claims", () => {
    const issues = (value: unknown) => {
      const result = BatchEntrySchema.safeParse(value);
      return result.success
        ? []
        : result.error.issues.map((issue) => issue.path.join("."));
    };
    expect(issues({ ...closedPractice, typeCounts: { country: 3 } })).toContain(
      "typeCounts",
    );
    expect(issues({ ...closedPractice, measuredEncores: 1 })).toContain(
      "measuredEncores",
    );
    expect(
      issues({
        batchId: "e.b01",
        pool: "encore",
        writer: "w-run2",
        status: "open",
        plan: { target: 10, draft: 12 },
        accepted: null,
        cut: null,
        lastSequence: 0,
        incidents: [],
        measuredEncores: 2,
      }),
    ).toContain("measuredEncores");
    expect(
      issues({
        ...closedPractice,
        highRiskClaims: 140,
        externallyEvidenced: 139,
      }),
    ).toContain("externallyEvidenced");
    expect(issues({ ...closedPractice, highRiskClaims: 140 })).toContain(
      "externallyEvidenced",
    );
  });
});

describe("the dataset manifest", () => {
  const manifest = read("content/datasets/manifest.json") as {
    version: 1;
    datasets: Record<string, unknown>[];
  };

  it("validates the repository's manifest", () => {
    expect(DatasetManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("refuses a GitHub file that is not fetched at the pinned commit, and an npm tarball of another version", () => {
    const github = manifest.datasets.find((d) => d.kind === "github") as {
      files: { url: string }[];
    } & Record<string, unknown>;
    const moved = {
      ...github,
      files: github.files.map((file, i) =>
        i === 0
          ? { ...file, url: file.url.replace(/\/[0-9a-f]{40}\//, "/main/") }
          : file,
      ),
    };
    expect(
      DatasetManifestSchema.safeParse({ ...manifest, datasets: [moved] })
        .success,
    ).toBe(false);
    const npm = manifest.datasets.find((d) => d.kind === "npm") as Record<
      string,
      unknown
    >;
    expect(
      DatasetManifestSchema.safeParse({
        ...manifest,
        datasets: [{ ...npm, version: "1.1.66" }],
      }).success,
    ).toBe(false);
    expect(
      DatasetManifestSchema.safeParse({
        ...manifest,
        datasets: [
          {
            ...github,
            files: [...github.files, github.files[0]],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
