// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { ENVELOPE_FOLDERS } from "../../../scripts/content/crypto.ts";
import {
  REPO_ROOT,
  fxMystery,
  removeTempDirs,
  tempDir,
} from "./__fixtures__/builders.ts";
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

  it("CNT-0 the secret scan catches plaintext under content/sealed/: plain files, junk, and plaintext in an envelope's shape", () => {
    const dir = repo();
    const plaintext = `${JSON.stringify(fxMystery(), null, 2)}\n`;
    write(dir, "content/sealed/mysteries/m.geo.0101.json", plaintext);
    write(dir, "content/sealed/notes.md", "clue 2 names the capital\n");
    write(dir, "content/sealed/encores/e.0101.json.enc", '{"v": 1}');
    // Every field well formed, but data is the plaintext in base64.
    write(
      dir,
      "content/sealed/mysteries/m.geo.0102.json.enc",
      envelopeText({
        v: 1,
        alg: "A256GCM",
        kid: "k1",
        iv: Buffer.alloc(12, 1).toString("base64"),
        data: Buffer.from(plaintext).toString("base64"),
        tag: Buffer.alloc(16, 2).toString("base64"),
      }),
    );
    const result = scan(dir);
    expect(result.status).toBe(1);
    const lines = result.stderr.split("\n");
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "content/sealed/mysteries/m.geo.0101.json: only <folder>/<id>.json.enc envelopes",
        ),
        expect.stringContaining(
          "content/sealed/notes.md: only <folder>/<id>.json.enc envelopes",
        ),
        expect.stringContaining(
          "content/sealed/encores/e.0101.json.enc: not a valid envelope",
        ),
        expect.stringContaining(
          "content/sealed/mysteries/m.geo.0102.json.enc: not a valid envelope: data reads as text",
        ),
      ]),
    );
    // The scan names files and rules, never what they hold.
    expect(result.stderr).not.toContain("names the capital");
    for (const clue of fxMystery().clues)
      expect(result.stderr).not.toContain(clue);
  });

  it("accepts an envelope in every folder of ARCHITECTURE §2.1, the list content:seal uses, and in no other", () => {
    // The scan keeps its own copy of the list so it needs no TypeScript;
    // this keeps the copy equal to crypto.ts's ENVELOPE_FOLDERS.
    const source = readFileSync(SCAN, "utf8");
    const copy = /const FOLDERS = new Set\(\[([^\]]*)\]\)/.exec(source)?.[1];
    expect(copy, "the FOLDERS list in secret-scan.mjs").toBeDefined();
    expect(
      [...(copy ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]),
    ).toEqual([...ENVELOPE_FOLDERS]);
    const dir = repo();
    for (const folder of ENVELOPE_FOLDERS)
      write(dir, `content/sealed/${folder}/x.0001.json.enc`, envelope);
    const result = scan(dir);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`${ENVELOPE_FOLDERS.length} envelope(s)`);
    write(dir, "content/sealed/drafts/x.0001.json.enc", envelope);
    const extra = scan(dir);
    expect(extra.status).toBe(1);
    expect(extra.stderr).toContain(
      "content/sealed/drafts/x.0001.json.enc: only <folder>/<id>.json.enc envelopes",
    );
  });

  it("scans content/sealed/README.md for the key, and finds it as base64url, as hex and labelled without padding", () => {
    // A key whose base64 holds + and /, so its base64url form differs.
    const raw = Buffer.from(Array.from({ length: 32 }, (_, i) => 250 - i * 7));
    const key = raw.toString("base64");
    expect(key).toMatch(/[+/]/);
    const dir = repo();
    write(dir, "content/sealed/mysteries/m.geo.0101.json.enc", envelope);
    write(
      dir,
      "content/sealed/README.md",
      `Recovered key: ${raw.toString("base64url")}\n`,
    );
    write(dir, "docs/hex.txt", `${raw.toString("hex").toUpperCase()}\n`);
    write(dir, "docs/unpadded.env", `QZ_CONTENT_KEY=${key.slice(0, 43)}\n`);
    const result = scan(dir, { QZ_CONTENT_KEY: key });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "content/sealed/README.md: holds the content key",
    );
    expect(result.stderr).toContain("docs/hex.txt: holds the content key");
    expect(result.stderr).toContain(
      "docs/unpadded.env: holds a QZ_CONTENT_KEY value",
    );
    const output = `${result.stdout}${result.stderr}`;
    for (const form of [
      key.slice(0, 20),
      raw.toString("base64url").slice(0, 20),
      raw.toString("hex").slice(0, 20),
    ])
      expect(output.toLowerCase()).not.toContain(form.toLowerCase());
  });

  it("keeps the QZ_CONTENT_KEY secret in the content-sealed job (decisions memo §17)", () => {
    const sealedJob = [
      "  content-sealed:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "      - name: Sealed content check",
      "        env:",
      "          QZ_CONTENT_KEY: ${{ secrets.QZ_CONTENT_KEY }}",
      "        run: |",
      '          if [ -z "$QZ_CONTENT_KEY" ]; then echo "not run: no key"; exit 0; fi',
      "          npm run content:check -- --sealed",
    ];
    const workflow = (on: string[], jobs: string[]) =>
      [...on, "jobs:", ...jobs, ""].join("\n");
    const PUSH = ["on:", "  push:", "  pull_request:"];

    const good = repo();
    write(
      good,
      ".github/workflows/ci.yml",
      workflow(PUSH, [
        "  verify:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      # QZ_CONTENT_KEY is not needed here.",
        "      - run: npm run check:secrets",
        ...sealedJob,
      ]),
    );
    const passed = scan(good);
    expect(passed.status, passed.stderr).toBe(0);
    expect(passed.stdout).toContain("1 workflow file(s) checked");

    const bad = repo();
    write(
      bad,
      ".github/workflows/ci.yml",
      workflow(
        ["on:", "  pull_request_target:"],
        [
          "  verify:",
          "    runs-on: ubuntu-latest",
          "    env:",
          "      KEY: ${{ secrets.QZ_CONTENT_KEY }}",
          "    steps:",
          "      - run: npm test",
          "  content-sealed:",
          "    runs-on: ubuntu-latest",
          "    environment: production",
          "    steps:",
          "      - env:",
          "          QZ_CONTENT_KEY: ${{ secrets.QZ_CONTENT_KEY }}",
          "        run: |",
          '          echo "$QZ_CONTENT_KEY"',
          '          echo "QZ_CONTENT_KEY=${{ secrets.QZ_CONTENT_KEY }}" >> "$GITHUB_ENV"',
        ],
      ),
    );
    const failed = scan(bad);
    expect(failed.status).toBe(1);
    const at = (line: number, rule: string) =>
      expect.stringContaining(
        `.github/workflows/ci.yml: line ${line}: ${rule}`,
      );
    expect(failed.stderr.split("\n")).toEqual(
      expect.arrayContaining([
        at(
          7,
          "references secrets.QZ_CONTENT_KEY outside the content-sealed job",
        ),
        at(12, "the content-sealed job declares an environment"),
        at(17, "prints or exports the value of QZ_CONTENT_KEY"),
        at(18, "prints or exports the value of QZ_CONTENT_KEY"),
        at(2, "runs on pull_request_target or workflow_run"),
      ]),
    );
    // Line numbers only: no line of the workflow reaches the output.
    expect(failed.stderr).not.toContain("GITHUB_ENV");
    expect(failed.stderr).not.toContain("production");
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
