// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterAll, describe, expect, it } from "vitest";

import {
  DatasetManifestSchema,
  type DatasetEntry,
} from "../schema/datasets.ts";
import { REPO_ROOT, removeTempDirs, tempDir } from "./__fixtures__/builders.ts";
import { datasetPath, fetchDataset, type Fetcher } from "./datasets.ts";
import { readTar } from "./tar.ts";

afterAll(removeTempDirs);

const sha = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");

/** A minimal ustar archive, for tests. */
function tar(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const header = Buffer.alloc(512);
    header.write(name, 0, "utf8");
    header.write("0000644\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(
      `${Buffer.byteLength(content).toString(8).padStart(11, "0")}\0`,
      124,
    );
    header.write("00000000000\0", 136);
    header.write("        ", 148);
    header.write("0", 156);
    header.write("ustar\0", 257);
    header.write("00", 263);
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(header);
    const body = Buffer.alloc(
      Math.ceil(Buffer.byteLength(content) / 512) * 512,
    );
    body.write(content);
    blocks.push(body);
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

describe("tar reader", () => {
  it("reads members of a gzipped ustar archive without writing anything", () => {
    const members = readTar(
      tar({ "package/data.json": "[1,2,3]", "package/../evil.sh": "rm -rf /" }),
    );
    expect(members.map((m) => [m.name, m.data.toString()])).toEqual([
      ["package/data.json", "[1,2,3]"],
      ["package/../evil.sh", "rm -rf /"],
    ]);
  });
});

describe("content:datasets", () => {
  it("downloads a GitHub dataset pinned to a commit and checks its hash", async () => {
    const cache = tempDir("qz-datasets-");
    const body = '{"fixture": true}';
    const commit = "a".repeat(40);
    const entry: DatasetEntry = {
      kind: "github",
      key: "fx-data",
      title: "fixture",
      repo: "fixture/data",
      commit,
      files: [
        {
          path: "data.json",
          url: `https://raw.githubusercontent.com/fixture/data/${commit}/data.json`,
          sha256: sha(body),
          bytes: body.length,
        },
      ],
      license: "CC0-1.0",
      retrievedAt: "2026-10-31",
      sourceLabel: "fixture",
      evidence: true,
      use: "tests",
      knownIssues: [],
    };
    const calls: string[] = [];
    const fetcher: Fetcher = (url) => {
      calls.push(url);
      return Promise.resolve(Buffer.from(body));
    };
    const first = await fetchDataset(entry, cache, { fetcher });
    expect(first.files.map((f) => f.status)).toEqual(["downloaded"]);
    expect(readFileSync(join(cache, "fx-data", "data.json"), "utf8")).toBe(
      body,
    );
    const second = await fetchDataset(entry, cache, { fetcher });
    expect(second.files.map((f) => f.status)).toEqual(["cached"]);
    expect(calls).toHaveLength(1);
    const tampered = await fetchDataset({ ...entry, key: "fx-other" }, cache, {
      fetcher: () => Promise.resolve(Buffer.from("changed")),
    });
    expect(tampered.files[0]?.status).toBe("mismatch");
    expect(existsSync(join(cache, "fx-other", "data.json"))).toBe(false);
  });

  it("checks an npm tarball's integrity before reading members", async () => {
    const cache = tempDir("qz-datasets-");
    const archive = tar({
      "package/cities.json": "[]",
      "package/LICENSE": "CC BY 4.0",
    });
    const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
    const entry: DatasetEntry = {
      kind: "npm",
      key: "fx-npm",
      title: "fixture",
      package: "fixture-cities",
      version: "1.0.0",
      tarball:
        "https://registry.npmjs.org/fixture-cities/-/fixture-cities-1.0.0.tgz",
      integrity,
      files: [
        {
          path: "cities.json",
          member: "package/cities.json",
          sha256: sha("[]"),
          bytes: 2,
        },
      ],
      license: "CC-BY-4.0",
      retrievedAt: "2026-10-31",
      sourceLabel: "fixture",
      evidence: true,
      use: "tests",
      knownIssues: [],
    };
    const ok = await fetchDataset(entry, cache, {
      fetcher: () => Promise.resolve(archive),
    });
    expect(ok.files.map((f) => f.status)).toEqual(["downloaded"]);
    const bad = await fetchDataset(
      { ...entry, key: "fx-npm-bad", integrity: "sha512-AAAA" },
      cache,
      { fetcher: () => Promise.resolve(archive) },
    );
    expect(bad.files[0]).toMatchObject({
      status: "error",
      message: expect.stringContaining("integrity"),
    });
  });

  it("never writes outside the dataset folder", () => {
    expect(() => datasetPath("/cache", "key", "../escape.json")).toThrow(
      /escapes/,
    );
    expect(datasetPath("/cache", "key", "a/b.json")).toBe(
      "/cache/key/a/b.json",
    );
  });

  it("has a valid manifest of pinned datasets with licences", () => {
    const manifest = DatasetManifestSchema.parse(
      JSON.parse(
        readFileSync(join(REPO_ROOT, "content/datasets/manifest.json"), "utf8"),
      ),
    );
    const keys = manifest.datasets.map((d) => d.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "mledoze-countries",
        "ptable",
        "geonames-cities",
        "cldr-territories",
        "worldcup",
        "nobel-prizes",
        "olympic-editions",
      ]),
    );
    for (const dataset of manifest.datasets) {
      expect(dataset.license).not.toBe("");
      if (dataset.kind === "github") {
        for (const file of dataset.files)
          expect(file.url).toContain(dataset.commit);
      }
    }
  });
});
