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

  describe("keeps the QZ_CONTENT_KEY secret in the content-sealed job (decisions memo §17)", () => {
    /** The shape CNT-1's content-sealed job takes, which must pass. */
    const GOOD = [
      "name: CI",
      "on:",
      "  push:",
      "  pull_request:",
      "  workflow_dispatch:",
      "jobs:",
      "  verify:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      # QZ_CONTENT_KEY is not needed here.",
      "      - run: npm run check:secrets",
      "  content-sealed:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "        with:",
      "          persist-credentials: false",
      "      - run: npm ci",
      "      - name: Sealed content check",
      "        env:",
      "          QZ_CONTENT_KEY: ${{ secrets.QZ_CONTENT_KEY }}",
      "        run: npm run content:check -- --sealed",
    ];
    const KEY_ENV = "          QZ_CONTENT_KEY: ${{ secrets.QZ_CONTENT_KEY }}";
    const KEY_RUN = "        run: npm run content:check -- --sealed";

    /** GOOD with `lines` inserted after the line equal to `after`. */
    const insert = (after: string, ...lines: string[]) => {
      const at = GOOD.indexOf(after);
      expect(at, after).toBeGreaterThanOrEqual(0);
      return [...GOOD.slice(0, at + 1), ...lines, ...GOOD.slice(at + 1)];
    };
    /** GOOD with the line equal to `line` replaced by `lines`. */
    const replace = (line: string, ...lines: string[]) => {
      const at = GOOD.indexOf(line);
      expect(at, line).toBeGreaterThanOrEqual(0);
      return [...GOOD.slice(0, at), ...lines, ...GOOD.slice(at + 1)];
    };
    const scanWorkflow = (lines: string[]) => {
      const dir = repo();
      write(dir, ".github/workflows/ci.yml", `${lines.join("\n")}\n`);
      return scan(dir);
    };

    it("passes the content-sealed job that passes the key to the sealed check alone, with or without a gate on whether the secret is set", () => {
      for (const lines of [
        GOOD,
        // The usual gate: it says only whether the secret is set.
        replace(
          "      - name: Sealed content check",
          "      - id: key",
          `        run: echo "present=\${{ secrets.QZ_CONTENT_KEY != '' }}" >> "$GITHUB_OUTPUT"`,
          "      - name: Sealed content check",
          "        if: steps.key.outputs.present == 'true'",
        ),
        // A block scalar holding the one command, with a comment.
        replace(
          KEY_RUN,
          "        run: |",
          "          # Decrypts in memory; prints ids, rule codes and counts.",
          "          npm run content:check -- --sealed --strict",
        ),
        // Sequences at their parent key's own column, which YAML allows.
        GOOD.map((line) => (line.startsWith("      ") ? line.slice(2) : line)),
        // OPS-1: a second step scans a build for sealed text with the key.
        [
          ...GOOD,
          "      - run: npm run build",
          "      - name: Sealed text scan",
          "        env:",
          KEY_ENV,
          "        run: npm run check:lazy -- --sealed",
        ],
      ]) {
        const passed = scanWorkflow(lines);
        expect(passed.status, passed.stderr).toBe(0);
        expect(passed.stdout).toContain("1 workflow file(s) checked");
      }
    });

    /**
     * One case per way out: the lines, then each expected problem as the
     * text of the line it names and the rule, then a word of the offending
     * lines that must not reach the output (problems name line numbers
     * only, never the line).
     */
    const cases: [string, string[], [string, string][], string][] = [
      [
        "printenv of the key in another step of the job",
        insert(
          "      - run: npm ci",
          "      - run: printenv QZ_CONTENT_KEY | base64",
        ),
        [
          [
            "printenv",
            "names QZ_CONTENT_KEY, which only the step that runs the sealed check may",
          ],
        ],
        "printenv",
      ],
      [
        "node -e printing process.env.QZ_CONTENT_KEY as hex in the key step",
        replace(
          KEY_RUN,
          "        run: |",
          `          node -e "console.log(Buffer.from(process.env.QZ_CONTENT_KEY).toString('hex'))"`,
        ),
        [
          [
            "process.env",
            "names QZ_CONTENT_KEY, which only the step that runs the sealed check may",
          ],
          [
            "        run: |",
            "the step that receives QZ_CONTENT_KEY must run npm run content:check -- --sealed and nothing else",
          ],
        ],
        "process.env",
      ],
      [
        "printenv | base64, which names nothing, in the key step",
        replace(KEY_RUN, "        run: printenv | base64"),
        [
          [
            "printenv |",
            "the step that receives QZ_CONTENT_KEY must run npm run content:check -- --sealed and nothing else",
          ],
        ],
        "printenv",
      ],
      [
        "a second command after the check in the key step",
        replace(
          KEY_RUN,
          "        run: |",
          "          npm run content:check -- --sealed",
          "          env | gzip | xxd",
        ),
        [
          [
            "        run: |",
            "the step that receives QZ_CONTENT_KEY must run npm run content:check -- --sealed and nothing else",
          ],
        ],
        "gzip",
      ],
      [
        "OPS-1 the build scan with anything beside --sealed in the key step",
        replace(
          KEY_RUN,
          "        run: npm run check:lazy -- --sealed --verbose",
        ),
        [
          [
            "--verbose",
            "the step that receives QZ_CONTENT_KEY must run npm run content:check -- --sealed and nothing else",
          ],
        ],
        "--verbose",
      ],
      [
        "OPS-1 a build in the step that receives the key",
        replace(
          KEY_RUN,
          "        run: |",
          "          npm run build",
          "          npm run check:lazy -- --sealed",
        ),
        [
          [
            "        run: |",
            "the step that receives QZ_CONTENT_KEY must run npm run content:check -- --sealed and nothing else",
          ],
        ],
        "npm run build",
      ],
      [
        "--reveal on the sealed check",
        replace(
          KEY_RUN,
          "        run: npm run content:check -- --sealed --reveal",
        ),
        [
          [
            "--reveal",
            "the step that receives QZ_CONTENT_KEY must run npm run content:check -- --sealed and nothing else",
          ],
        ],
        "--reveal",
      ],
      [
        "a custom shell on the key step",
        insert(KEY_RUN, "        shell: python3 {0}"),
        [
          [
            "python3",
            "the step that receives QZ_CONTENT_KEY sets something other than name, id, if, env, run",
          ],
        ],
        "python3",
      ],
      [
        "toJSON(secrets) in the verify job",
        insert(
          "    runs-on: ubuntu-latest",
          "    env:",
          "      ALL_SECRETS: ${{ toJSON(secrets) }}",
        ),
        [["ALL_SECRETS", "uses the secrets context as a whole"]],
        "ALL_SECRETS",
      ],
      [
        "secrets[] with a computed name",
        insert(
          "    runs-on: ubuntu-latest",
          "    env:",
          "      DYNAMIC: ${{ secrets[format('QZ_{0}', 'CONTENT_KEY')] }}",
        ),
        [["DYNAMIC", "uses the secrets context as a whole"]],
        "DYNAMIC",
      ],
      [
        "a reusable workflow called with secrets: inherit",
        [
          ...GOOD,
          "  reuse:",
          "    uses: ./.github/workflows/reusable-thing.yml",
          "    secrets: inherit",
        ],
        [
          [
            "secrets: inherit",
            "passes every secret, QZ_CONTENT_KEY included, to a called workflow",
          ],
        ],
        "reusable-thing",
      ],
      [
        "issue_comment, which anyone can trigger, checking out a pull request's head",
        replace(
          "          persist-credentials: false",
          "          persist-credentials: false",
          "          ref: refs/pull/${{ github.event.issue.number }}/head",
        ).map((line) =>
          line === "  workflow_dispatch:" ? "  issue_comment:" : line,
        ),
        [
          [
            "issue_comment",
            "runs on issue_comment, which can run with secrets",
          ],
        ],
        "refs/pull",
      ],
      [
        "issue_comment in an on: sequence written at its key's own column",
        replace("on:", "on:", "- push", "- issue_comment").filter(
          (line) =>
            !["  push:", "  pull_request:", "  workflow_dispatch:"].includes(
              line,
            ),
        ),
        [["- issue_comment", "runs on issue_comment"]],
        "- issue",
      ],
      [
        "a default shell on the content-sealed job, which would wrap the sealed check",
        insert(
          "  content-sealed:",
          "    defaults:",
          "      run:",
          "        shell: bash -c 'env | base64; true' {0}",
        ),
        [
          [
            "env | base64",
            "sets a shell other than bash or sh where the step that receives QZ_CONTENT_KEY would run in it",
          ],
        ],
        "base64",
      ],
      [
        "a flow sequence of triggers with pull_request_target",
        replace("on:", "on: [push, pull_request_target]").filter(
          (line) =>
            !["  push:", "  pull_request:", "  workflow_dispatch:"].includes(
              line,
            ),
        ),
        [["on: [", "runs on pull_request_target"]],
        "[push",
      ],
      [
        "a quoted job key after content-sealed that references the key",
        [
          ...GOOD,
          '  "lint":',
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - run: npm run lint",
          "        env:",
          "          LATE_COPY: ${{ secrets.QZ_CONTENT_KEY }}",
        ],
        [
          [
            "LATE_COPY",
            "references secrets.QZ_CONTENT_KEY outside the content-sealed job",
          ],
        ],
        "LATE_COPY",
      ],
      [
        "the secret's name in lower case, which GitHub matches all the same",
        insert(
          "    runs-on: ubuntu-latest",
          "    env:",
          "      LOWER_COPY: ${{ secrets.qz_content_key }}",
        ),
        [
          [
            "LOWER_COPY",
            "references secrets.QZ_CONTENT_KEY outside the content-sealed job",
          ],
        ],
        "LOWER_COPY",
      ],
      [
        "a repository variable of that name",
        insert(
          "    runs-on: ubuntu-latest",
          "    env:",
          "      VAR_COPY: ${{ vars.QZ_CONTENT_KEY }}",
        ),
        [
          [
            "VAR_COPY",
            "references vars.QZ_CONTENT_KEY outside the content-sealed job",
          ],
        ],
        "VAR_COPY",
      ],
      [
        "the key in the workflow's own env:",
        insert(
          "  workflow_dispatch:",
          "env:",
          "  TOP_COPY: ${{ secrets.QZ_CONTENT_KEY }}",
        ),
        [
          [
            "TOP_COPY",
            "references secrets.QZ_CONTENT_KEY outside the content-sealed job",
          ],
        ],
        "TOP_COPY",
      ],
      [
        "a YAML anchor that carries the key step's env: into the verify job",
        replace("        env:", "        env: &key_env_anchor").map((line) =>
          line === "      - run: npm run check:secrets"
            ? "      - run: npm run check:secrets\n        env: *key_env_anchor"
            : line,
        ),
        [
          ["&key_env_anchor", "uses a YAML anchor or alias"],
          ["*key_env_anchor", "uses a YAML anchor or alias"],
        ],
        "key_env_anchor",
      ],
      [
        "the key in the job's env:, which every step would get",
        insert(
          "  content-sealed:",
          "    env:",
          "      QZ_CONTENT_KEY: ${{ secrets.QZ_CONTENT_KEY }} # all steps",
        ),
        [
          [
            "# all steps",
            "gives QZ_CONTENT_KEY to every step of the content-sealed job",
          ],
        ],
        "all steps",
      ],
      [
        "an environment on the content-sealed job",
        insert("  content-sealed:", "    environment: sealed-production"),
        [
          [
            "sealed-production",
            "the content-sealed job declares an environment",
          ],
        ],
        "sealed-production",
      ],
      [
        "the key as an action's input",
        insert(
          "      - run: npm ci",
          "      - uses: some-org/upload-thing@v1",
          "        with:",
          "          token: ${{ secrets.QZ_CONTENT_KEY }}",
        ),
        [
          [
            "          token:",
            "names QZ_CONTENT_KEY, which only the step that runs the sealed check may",
          ],
        ],
        "upload-thing",
      ],
      [
        "the key under another variable name in the step's env:",
        replace(
          KEY_ENV,
          "          SEALED_KEY_COPY: ${{ secrets.QZ_CONTENT_KEY }}",
        ),
        [
          [
            "SEALED_KEY_COPY",
            "names QZ_CONTENT_KEY, which only the step that runs the sealed check may",
          ],
        ],
        "SEALED_KEY_COPY",
      ],
    ];

    it.each(cases)("fails on %s", (_name, lines, expected, hidden) => {
      const text = lines.join("\n");
      const numbered = text.split("\n");
      const result = scanWorkflow(lines);
      expect(result.status, result.stdout).toBe(1);
      for (const [marker, rule] of expected) {
        const line = numbered.findIndex((entry) => entry.includes(marker)) + 1;
        expect(line, marker).toBeGreaterThan(0);
        expect(result.stderr).toContain(
          `.github/workflows/ci.yml: line ${line}: ${rule}`,
        );
      }
      // Nothing else fires, on GOOD's lines least of all.
      expect(result.stderr).toContain(
        `FAILED with ${expected.length} problem(s)`,
      );
      expect(result.stderr).not.toContain(hidden);
    });
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
    // A list request names a mystery's answer or guesses (CONTENT_GUIDE
    // §2.12), so a plaintext one fails, staged or not, and so does a public
    // list entry whose source names one, a sealed item or a mystery batch.
    write(
      dir,
      "content/list-requests/lr.m.hist.b02.03.json",
      JSON.stringify({
        id: "lr.m.hist.b02.03",
        name: "Placeholder Person",
        qualifier: "placeholder",
        evidence: "placeholder",
      }),
    );
    const entry = (id: string, source: string) => ({
      id,
      display: "Placeholder",
      source,
    });
    write(
      dir,
      "content/answer-lists/person.json",
      JSON.stringify({ entries: [entry("x.person.a", "lr.m.hist.b02.03")] }),
    );
    write(
      dir,
      "content/answer-lists/city.json",
      JSON.stringify({
        entries: [
          entry("x.city.a", "l.city.b02; checked geonames-cities@1.2.0"),
          entry("x.city.b", "l.city.b02; for m.hist.b02"),
          entry("x.city.c", "l.city.b02; same as m.geo.0105"),
        ],
      }),
    );
    // Real sources look like these, and pass.
    write(
      dir,
      "content/answer-lists/film.json",
      JSON.stringify({
        entries: [
          entry("x.film.a", "l.film.b01"),
          entry("x.film.b", "l.film.b01; id from moma-artists@51a140d"),
          entry("x.film.c", "l.film.b01; checked ptable@a1c2a3 release.2024"),
        ],
      }),
    );
    // JSON is JSON whatever the file is called.
    write(
      dir,
      "notes/m.geo.0103.txt",
      `${JSON.stringify({ id: "m.geo.0103", kind: "mystery" }, null, 2)}\n`,
    );
    spawnSync("git", ["add", "docs", "content/list-requests"], { cwd: dir });
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
        expect.stringContaining(
          "content/list-requests/lr.m.hist.b02.03.json: holds a sealed item id in id",
        ),
        expect.stringContaining(
          "content/answer-lists/person.json: holds a source naming sealed content",
        ),
        expect.stringContaining(
          "content/answer-lists/city.json: holds a source naming sealed content",
        ),
        expect.stringContaining(
          "notes/m.geo.0103.txt: holds a sealed item (kind mystery)",
        ),
      ]),
    );
    expect(result.stderr).not.toContain("__fixtures__");
    expect(result.stderr).not.toContain("film.json");
    expect(result.stderr).not.toContain("Placeholder");
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

  it("CNT-0 finds the content key in any file git could commit, whatever its name or type, and never prints it", () => {
    const dir = repo();
    const home = tempDir("qz-scan-home-");
    // A throwaway key with + and / in its base64, so every form differs.
    const raw = Buffer.from(
      Array.from({ length: 32 }, (_, i) => (i * 73 + 251) & 0xff),
    );
    const key = raw.toString("base64");
    expect(key).toMatch(/[+/]/);
    // The machine's key file, where content:keygen puts it.
    write(home, ".config/quiz-web-app/content.key", `${key}\n`);

    write(dir, "content.key.bak", `${key}\n`);
    spawnSync("git", ["add", "content.key.bak"], { cwd: dir });
    write(dir, "docs/handover.mdx", `The key, for the record: ${key}\n`);
    write(dir, "notes/KEY", `${key}\n`);
    write(dir, "src/app/globals.css", `/* ${key} */\n:root {\n}\n`);
    write(dir, ".npmrc", `QZ_CONTENT_KEY=${key}\n`);
    // A binary file (NUL bytes) carrying the key as hex in a text chunk.
    mkdirSync(join(dir, "public"), { recursive: true });
    writeFileSync(
      join(dir, "public/icon.png"),
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]),
        Buffer.from(`tEXtComment\0${raw.toString("hex")}`),
        Buffer.alloc(64),
      ]),
    );
    // Staged with the key, then told to look unchanged and wiped in the
    // working tree: git diff no longer lists it, the next commit holds it.
    write(dir, "docs/notes.txt", `${raw.toString("base64url")}\n`);
    spawnSync("git", ["add", "docs/notes.txt"], { cwd: dir });
    spawnSync("git", ["update-index", "--assume-unchanged", "docs/notes.txt"], {
      cwd: dir,
    });
    write(dir, "docs/notes.txt", "nothing here\n");

    const result = scan(dir, { HOME: home });
    expect(result.status).toBe(1);
    expect(result.stderr.split("\n")).toEqual(
      expect.arrayContaining([
        "secret-scan: content.key.bak: a key file is tracked",
        expect.stringContaining("content.key.bak: holds the content key"),
        expect.stringContaining("docs/handover.mdx: holds the content key"),
        expect.stringContaining("notes/KEY: holds the content key"),
        expect.stringContaining("src/app/globals.css: holds the content key"),
        expect.stringContaining(".npmrc: holds a QZ_CONTENT_KEY value"),
        expect.stringContaining("public/icon.png: holds the content key"),
        expect.stringContaining(
          "docs/notes.txt (staged): holds the content key",
        ),
      ]),
    );
    const output = `${result.stdout}${result.stderr}`;
    for (const form of [
      key.slice(0, 16),
      raw.toString("base64url").slice(0, 16),
      raw.toString("hex").slice(0, 16),
    ])
      expect(output.toLowerCase()).not.toContain(form.toLowerCase());

    // In CI there is no key, but a key file's name and shape still fail.
    const blind = scan(dir, { HOME: tempDir("qz-scan-home-") });
    expect(blind.status).toBe(1);
    expect(blind.stderr.split("\n")).toEqual(
      expect.arrayContaining([
        "secret-scan: content.key.bak: a key file is tracked",
        expect.stringContaining(
          "notes/KEY: holds nothing but a 32-byte base64 value",
        ),
        expect.stringContaining(".npmrc: holds a QZ_CONTENT_KEY value"),
      ]),
    );
    expect(blind.stderr.toLowerCase()).not.toContain(
      key.slice(0, 16).toLowerCase(),
    );
  });

  it("flags tracked key files by name, and leaves names that only look alike", () => {
    const dir = repo();
    for (const name of [
      "content.key",
      "backup/content.key.old",
      "notes/content.key~",
      "certs/server.KEY",
    ])
      write(dir, name, "not a key\n");
    for (const name of ["docs/keys.md", "src/content.keys.ts", "keymap.json"])
      write(dir, name, "{}\n");
    spawnSync("git", ["add", "."], { cwd: dir });
    const result = scan(dir);
    expect(result.status).toBe(1);
    const flagged = result.stderr
      .split("\n")
      .filter((line) => line.endsWith(": a key file is tracked"))
      .map((line) =>
        line.replace(/^secret-scan: |: a key file is tracked$/g, ""),
      )
      .sort();
    expect(flagged).toEqual([
      "backup/content.key.old",
      "certs/server.KEY",
      "content.key",
      "notes/content.key~",
    ]);
  });

  it("passes on this repository", () => {
    const result = spawnSync(process.execPath, [SCAN], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
  });
});
