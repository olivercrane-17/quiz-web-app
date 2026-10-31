// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { REPO_ROOT, removeTempDirs, tempDir } from "./__fixtures__/builders.ts";
import { deriveSealKeys, envelopeText, sealBytes } from "./seal.ts";

afterAll(removeTempDirs);

const SCAN = join(REPO_ROOT, "scripts/checks/secret-scan.mjs");

/** The ignore rules the scan insists on (CONTENT_GUIDE §11.2). */
const IGNORES = "content/.sealed-plain/\n.cache/\nsupabase/.generated/\n";

function repo(ignores = IGNORES): string {
  const dir = tempDir("qz-scan-");
  spawnSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(join(dir, ".gitignore"), ignores);
  return dir;
}

function write(dir: string, path: string, content: string): void {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), content);
}

/** HOME is the throwaway repository, so the machine's key file is never read. */
const scan = (dir: string, env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [SCAN], {
    cwd: dir,
    encoding: "utf8",
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: dir, ...env },
  });
const envelope = envelopeText(
  sealBytes(
    deriveSealKeys(Buffer.alloc(32, 3)),
    Buffer.from('{"id": "m.geo.0101"}\n'),
  ),
);

describe("secret-scan", () => {
  it("passes a tree with envelopes only", () => {
    const dir = repo();
    write(dir, "content/sealed/mysteries/m.geo.0101.json.enc", envelope);
    const result = scan(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 envelope(s)");
  });

  it("fails on plaintext or junk under content/sealed/", () => {
    const dir = repo();
    write(
      dir,
      "content/sealed/mysteries/m.geo.0101.json",
      '{"id": "m.geo.0101"}',
    );
    write(dir, "content/sealed/encores/e.0101.json.enc", '{"v": 1}');
    const result = scan(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("only <folder>/<id>.json.enc envelopes");
    expect(result.stderr).toContain("not a valid envelope");
  });

  it("fails when the plaintext workspace, a cache or a key is tracked", () => {
    const dir = repo();
    write(dir, "content/.sealed-plain/mysteries/m.geo.0101.json", "{}");
    write(dir, ".cache/packets/m.geo.b01/A/cold.json", "{}");
    write(
      dir,
      "notes.env",
      `QZ_CONTENT_KEY=${Buffer.alloc(32, 1).toString("base64")}\n`,
    );
    spawnSync("git", ["add", "-f", "."], { cwd: dir });
    const result = scan(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("sealed plaintext workspace is tracked");
    expect(result.stderr).toContain("tool caches");
    expect(result.stderr).toContain("holds a QZ_CONTENT_KEY value");
  });

  it("fails when the workspace or the packet cache is not git-ignored", () => {
    const dir = repo(".cache/\n");
    const result = scan(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "content/.sealed-plain/probe.json: not git-ignored",
    );
    expect(result.stderr).toContain(
      "supabase/.generated/probe.sql: not git-ignored",
    );
    expect(result.stderr).not.toContain(".cache/packets/probe.json");
  });

  it("fails on sealed content in public JSON, staged or not, outside the fixtures", () => {
    const dir = repo();
    write(
      dir,
      "content/mysteries/m.geo.0101.json",
      JSON.stringify({ id: "m.geo.0101", kind: "mystery", clues: ["a"] }),
    );
    write(
      dir,
      "docs/notes/packet-copy.json",
      JSON.stringify({ stage: "reveal", items: [{ itemId: "e.0101" }] }),
    );
    write(
      dir,
      "content/practice/geography/p.geo.0101.json",
      JSON.stringify({
        id: "p.geo.0101",
        verification: { dedupe: { nearestId: "m.geo.0102" } },
      }),
    );
    // Fixtures may hold every sealed shape.
    write(
      dir,
      "src/content/pipeline/__fixtures__/bank/mysteries/fx.m.geo.0101.json",
      JSON.stringify({ id: "fx.m.geo.0101", kind: "mystery", clues: [] }),
    );
    spawnSync("git", ["add", "docs"], { cwd: dir });
    const result = scan(dir);
    expect(result.status).toBe(1);
    const lines = result.stderr.split("\n");
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "content/mysteries/m.geo.0101.json: holds a sealed item (kind mystery)",
        ),
        expect.stringContaining(
          "content/mysteries/m.geo.0101.json: holds mystery clues",
        ),
        expect.stringContaining(
          "docs/notes/packet-copy.json: holds a checker packet",
        ),
        expect.stringContaining(
          "docs/notes/packet-copy.json: holds a sealed item id in itemId",
        ),
        expect.stringContaining(
          "p.geo.0101.json: holds a sealed item id in nearestId",
        ),
      ]),
    );
    expect(result.stderr).not.toContain("__fixtures__");
  });

  it("checks the staged version of an envelope, not only the working tree", () => {
    const dir = repo();
    const path = "content/sealed/mysteries/m.geo.0101.json.enc";
    write(dir, path, '{"id": "m.geo.0101", "kind": "mystery"}\n');
    spawnSync("git", ["add", path], { cwd: dir });
    write(dir, path, envelope);
    const result = scan(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `${path}: the staged version is not a valid envelope`,
    );
  });

  it("finds the raw content key in any text file when the key is available, without printing it", () => {
    const dir = repo();
    const key = Buffer.alloc(32, 7).toString("base64");
    write(dir, "docs/handover.md", `The key, for the record: ${key}\n`);
    const withKey = scan(dir, { QZ_CONTENT_KEY: key });
    expect(withKey.status).toBe(1);
    expect(withKey.stderr).toContain("docs/handover.md: holds the content key");
    expect(`${withKey.stdout}${withKey.stderr}`).not.toContain(
      key.slice(0, 20),
    );
    // Without the key on the machine an unlabelled key cannot be found.
    expect(scan(dir).status).toBe(0);
  });

  it("passes on this repository", () => {
    const result = spawnSync(process.execPath, [SCAN], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
  });
});
