// @vitest-environment node
/**
 * The licence notices behind /credits (LGL-1, scripts/content/licenses.ts):
 * the committed module matches a fresh build, so a dependency upgrade, a
 * new dataset or a new answer-list source can't leave /credits behind;
 * every dataset and font is there; dataset licence texts match their pinned
 * hashes; and the run-time closure leaves out dev, optional and
 * platform-only packages.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  removeTempDirs,
  writeTree,
} from "../../src/content/pipeline/__fixtures__/builders.ts";
import {
  DATASET_LICENCE_DIR,
  LICENSES_OUTPUT,
  collectLicenseData,
  renderLicenseModule,
  runtimePackages,
  tidyText,
} from "./licenses.ts";

afterAll(removeTempDirs);

interface ManifestFile {
  path: string;
  sha256: string;
}

const manifest = JSON.parse(
  readFileSync(join(REPO_ROOT, "content/datasets/manifest.json"), "utf8"),
) as { datasets: { key: string; files: ManifestFile[] }[] };

describe("the generated licence module", () => {
  it(
    "is up to date: run `node scripts/content/licenses.ts` after changing a dependency, a dataset or an answer list's provenance",
    { timeout: 30_000 },
    async () => {
      const committed = readFileSync(join(REPO_ROOT, LICENSES_OUTPUT), "utf8");
      expect(await renderLicenseModule(REPO_ROOT)).toBe(committed);
    },
  );

  it("credits every dataset in the manifest and both font licences", () => {
    const data = collectLicenseData(REPO_ROOT);
    expect(data.datasets.map((dataset) => dataset.key)).toEqual(
      manifest.datasets.map((dataset) => dataset.key),
    );
    const fonts = readdirSync(join(REPO_ROOT, "src/app/fonts")).filter((name) =>
      /^OFL-.+\.txt$/.test(name),
    );
    expect(data.fonts.map((font) => font.file)).toEqual(fonts.sort());
    for (const font of data.fonts) {
      expect(font.text).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
    expect(data.icons.text).toMatch(/^ISC License/);
    expect(data.icons.text).toContain("Feather");
  });

  it("keeps each committed dataset licence byte for byte as the manifest pins it", () => {
    const dir = join(REPO_ROOT, DATASET_LICENCE_DIR);
    const files = readdirSync(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const dataset = manifest.datasets.find(
        (entry) => entry.key === file.replace(/\.txt$/, ""),
      );
      const pinned = dataset?.files.find((entry) =>
        /^licen[cs]e(\.[a-z]+)?$/i.test(entry.path),
      );
      expect(pinned, file).toBeDefined();
      const hash = createHash("sha256")
        .update(readFileSync(join(dir, file)))
        .digest("hex");
      expect(hash, file).toBe(pinned?.sha256);
    }
  });

  it("names a list's datasets apart from what its compiled entries were checked against", () => {
    const { lists } = collectLicenseData(REPO_ROOT);
    const country = lists.find((list) => list.type === "country");
    expect(country?.from).toEqual(["cldr-territories"]);
    const element = lists.find((list) => list.type === "element");
    expect(element?.compiled).toBe(true);
    expect(element?.from).toEqual([]);
    expect(element?.checkedAgainst).toEqual(["ptable"]);
  });

  it("gives every package of the app its notice, with its own copyright lines", () => {
    const { software } = collectLicenseData(REPO_ROOT);
    const packages = software.flatMap((notice) => notice.packages);
    const names = packages.map((pkg) => pkg.name);
    for (const name of [
      "next",
      "react",
      "react-dom",
      "@supabase/supabase-js",
    ]) {
      expect(names).toContain(name);
    }
    // Build tools and native binaries for one platform never ship.
    for (const name of [
      "typescript",
      "vitest",
      "sharp",
      "@next/swc-linux-x64-gnu",
    ]) {
      expect(names).not.toContain(name);
    }
    expect(new Set(names).size).toBe(names.length);
    const next = packages.find((pkg) => pkg.name === "next");
    expect(next?.copyright).toEqual(["Copyright (c) 2025 Vercel, Inc."]);
    for (const notice of software) {
      // A shared text never keeps one package's copyright line.
      expect(notice.text).not.toMatch(/^\s*copyright\s*(\(c\)|©|\d{4})/im);
    }
  });
});

describe("the run-time closure", () => {
  it("follows dependencies, nearest copy first, and skips dev, optional and platform-only packages", () => {
    const lock = {
      packages: {
        "": {},
        "node_modules/app": {
          version: "1.0.0",
          dependencies: { a: "1", b: "1" },
        },
        "node_modules/a": { version: "1.0.0", dependencies: { c: "1" } },
        "node_modules/a/node_modules/c": { version: "2.0.0" },
        "node_modules/c": { version: "1.0.0" },
        "node_modules/b": {
          version: "1.0.0",
          dependencies: { d: "1", e: "1" },
        },
        "node_modules/d": { version: "1.0.0", optional: true },
        "node_modules/e": { version: "1.0.0", os: ["darwin"] },
        "node_modules/f": { version: "1.0.0", dev: true },
      },
    };
    expect(runtimePackages(lock, ["app"])).toEqual([
      "node_modules/a",
      "node_modules/a/node_modules/c",
      "node_modules/app",
      "node_modules/b",
    ]);
    expect(() => runtimePackages(lock, ["missing"])).toThrow(/missing/);
  });

  it("tidies licence texts: Unix line ends, no trailing spaces, one blank line at most", () => {
    expect(tidyText("A  \r\nB\r\n\r\n\r\n\r\nC \n")).toBe("A\nB\n\nC");
  });
});

describe("failing loudly", () => {
  it("refuses a list that names a dataset the manifest doesn't pin", async () => {
    const root = await writeTree({
      "content/datasets/manifest.json": { version: 1, datasets: [] },
      "content/answer-lists/country.json": {
        type: "country",
        version: "2026-11-01",
        provenance: [
          {
            source: "made-up@1234567",
            license: "MIT",
            retrievedAt: "2026-11-01",
          },
        ],
        entities: [],
      },
    });
    expect(() => collectLicenseData(root)).toThrow(
      /names dataset "made-up", which content\/datasets\/manifest\.json doesn't list/,
    );
  });
});
