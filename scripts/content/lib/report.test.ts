// @vitest-environment node
/**
 * The redacting reporter (ARCHITECTURE §5.4): a run that decrypts sealed
 * content prints ids, rule codes, field paths and counts, and never a clue,
 * key, entity name, alias, number or diff. The test runs the sealed
 * validator over a fixture with planted failures (a clue holding an alias,
 * a near-duplicate, a failing refinement, a bad encore unit, and the
 * schedule, list-request and challenge-pack files CNT-1 checks) and
 * matches both output streams for every fixture string, alias and numeric
 * answer: numbers by value, names as whole tokens after normalizeName.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import {
  COUNTRY_NAMES,
  REPO_ROOT,
  countryId,
  fxCountryList,
  fxEncore,
  fxMystery,
  removeTempDirs,
  tempDir,
} from "../../../src/content/pipeline/__fixtures__/builders.ts";
import {
  deriveSealKeys,
  envelopeText,
  sealBytes,
} from "../../../src/content/pipeline/seal.ts";
import { RULES } from "../../../src/content/pipeline/lint/types.ts";
import { normalizeName } from "../../../src/engine/suggest/normalize.ts";
import {
  RULE_TITLES,
  printReport,
  redactFinding,
  redactedLine,
  runReported,
  type ReportFinding,
} from "./report.ts";

afterAll(removeTempDirs);

/** Every number in a text, by value: "4,813.75" and "4813.75" are the same. */
function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) =>
    Number(m[0].replace(/,/g, "")),
  );
}

/** True when `name` appears in `text` as whole tokens, after normalizeName. */
function hasName(text: string, name: string): boolean {
  const haystack = ` ${normalizeName(text)} `;
  return haystack.includes(` ${normalizeName(name)} `);
}

function expectClean(
  output: string,
  secrets: { names: string[]; numbers: number[]; texts: string[] },
) {
  for (const name of secrets.names)
    expect(hasName(output, name), `name ${name}`).toBe(false);
  const found = numbersIn(output);
  for (const value of secrets.numbers)
    expect(found, `number ${value}`).not.toContain(value);
  for (const text of secrets.texts) expect(output).not.toContain(text);
}

describe("the redacting reporter", () => {
  const planted: ReportFinding = {
    rule: "C12",
    severity: "error",
    file: "content/.sealed-plain/mysteries/m.geo.0101.json",
    itemId: "m.geo.0101",
    path: "clues[1]",
    message: "clue 2 contains the alias 'Arven Republic' (answer 4813.75)",
    excerpt: "The Arven Republic flies a silver heron",
    sealed: true,
  };

  it("has a fixed title for every lint rule, so no redacted finding falls back to the generic one", () => {
    expect(Object.keys(RULES).filter((rule) => !(rule in RULE_TITLES))).toEqual(
      [],
    );
  });

  it("prints a finding as severity, item id, rule code and field path, and nothing else", () => {
    expect(redactedLine(planted)).toBe("error m.geo.0101 C12 clues[1]");
    expect(redactFinding(planted)).toEqual({
      rule: "C12",
      severity: "error",
      file: planted.file,
      itemId: "m.geo.0101",
      path: "clues[1]",
      message: RULE_TITLES.C12,
      sealed: true,
    });
  });

  it("replaces every message with the rule's fixed title in text and JSON, and ends with counts", () => {
    for (const json of [false, true]) {
      const lines: string[] = [];
      const code = printReport(
        {
          command: "content:check",
          items: 3,
          findings: [planted, { ...planted, rule: "Z99", severity: "warn" }],
          notes: ["Sealed content: 3 envelope(s) decrypted in memory."],
        },
        { redact: true, reveal: true, json },
        { out: (line) => lines.push(line) },
      );
      expect(code).toBe(1);
      const output = lines.join("\n");
      expectClean(output, {
        names: ["Arven Republic", "heron"],
        numbers: [4813.75],
        texts: [planted.message, planted.excerpt ?? ""],
      });
      expect(output).toContain(json ? '"rule": "C12"' : "error m.geo.0101 C12");
    }
  });

  it("turns a thrown error into one content-free line in a sealed run", async () => {
    const errors: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((line: string) => errors.push(line));
    runReported(
      "content:check",
      () => true,
      () =>
        Promise.reject(
          new SyntaxError(
            'Unexpected token, "Arven Republic" is not valid JSON',
          ),
        ),
    );
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]).not.toContain("Arven");
    expect(errors[0]).toMatch(/details are hidden/);
    spy.mockRestore();
    process.exitCode = 0;
  });
});

describe("content:check --sealed over planted failures", () => {
  it("never prints a fixture string, an alias or a numeric answer, in either stream", () => {
    const repo = tempDir("qz-redact-");
    writeFileSync(join(repo, "package.json"), "{}\n");
    for (const path of [
      "content/categories.json",
      "content/batches.json",
      "content/compositions.json",
      "content/reference",
      "content/datasets/manifest.json",
      "src/config/shared.json",
    ]) {
      cpSync(join(REPO_ROOT, path), join(repo, path), { recursive: true });
    }
    const plain = (id: string) => id.replace(/^fx\./, "");
    const list = fxCountryList() as { entities: Record<string, unknown>[] };
    mkdirSync(join(repo, "content/answer-lists"), { recursive: true });
    writeFileSync(
      join(repo, "content/answer-lists/country.json"),
      JSON.stringify({
        ...list,
        entities: list.entities.map((e) => ({ ...e, id: plain(String(e.id)) })),
      }),
    );

    const base = fxMystery();
    const mystery = {
      ...base,
      id: "m.geo.0101",
      answer: plain(base.answer),
      distractors: base.distractors.map(plain),
      likelyGuesses: base.likelyGuesses.map(plain),
      rivals: base.rivals.map((rival) => ({ ...rival, id: plain(rival.id) })),
      // Planted: a clue with the alias, and a giveaway term.
      clues: [
        "The Arven Republic flies a silver heron above three blue waves.",
        "Arvennan farmers count thirteen months of 28 days.",
        base.clues[2],
        base.clues[3],
      ],
    };
    // Planted: a failing refinement and a near-duplicate (same answer).
    const twin = {
      ...mystery,
      id: "m.geo.0102",
      status: "draft",
      seedSolveShares: [0.9, 0.5, 0.95, 0.99],
    };
    // Planted: a bad encore unit and a distinctive numeric answer.
    const encore = {
      ...fxEncore(),
      id: "e.0101",
      answer: 4813.75,
      decimals: 2,
      unit: "°C",
    };
    // Planted: a frozen Daily with no pass D (X28), after a gap (X20).
    const schedule = {
      track: "main",
      dailies: [
        {
          date: "2026-12-01",
          rounds: [
            { type: "mystery", difficulty: "easy", contentId: "m.geo.0101" },
            { type: "encore", difficulty: null, contentId: "e.0101" },
          ],
          status: "frozen",
          predictedPoints: 3.2,
          dayCheck: null,
        },
      ],
    };
    // Planted: a list request whose qualifier is wrong, naming an entity.
    const request = {
      id: "lr.m.geo.b01.01",
      requestedBy: "w-fixture",
      answerType: "country",
      name: "Zorvania Minor",
      qualifier: { iso_a2: "zorvania" },
      evidence: [
        {
          kind: "web",
          query: "Zorvania Minor capital",
          results: [
            { title: "Zorvania", url: "https://example.invalid/zorvania" },
          ],
          summaryExcerpt: "Zorvania Minor is a fixture",
          tiers: ["A"],
          conflictReported: false,
          retrievedAt: "2026-11-01",
        },
      ],
    };
    // Planted: a challenge pack naming an item that doesn't exist.
    const pack = {
      id: "fixture-pack-one",
      track: "main",
      title: "Heron Week",
      theme: "Herons of Vellumland",
      rounds: [
        { type: "mystery", difficulty: "easy", contentId: "m.geo.0199" },
      ],
    };

    const master = Buffer.alloc(32, 9);
    const keys = deriveSealKeys(master);
    const seal = (folder: string, id: string, value: unknown) => {
      const dir = join(repo, "content/sealed", folder);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${id}.json.enc`),
        envelopeText(
          sealBytes(keys, Buffer.from(`${JSON.stringify(value, null, 2)}\n`)),
        ),
      );
    };
    seal("mysteries", "m.geo.0101", mystery);
    seal("mysteries", "m.geo.0102", twin);
    seal("encores", "e.0101", encore);
    seal("schedule", "2026-12", schedule);
    seal("list-requests", "lr.m.geo.b01.01", request);
    seal("challenge-packs", "fixture-pack-one", pack);

    const outputs = [[], ["--json"], ["--launch"]].map((extra) => {
      const run = spawnSync(
        process.execPath,
        [
          "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
          join(REPO_ROOT, "scripts/content/check.ts"),
          "--sealed",
          "--today",
          "2026-11-04",
          ...extra,
        ],
        {
          cwd: repo,
          encoding: "utf8",
          // Never the machine's own key: HOME is the throwaway repository.
          env: {
            NODE_ENV: "test",
            PATH: process.env.PATH ?? "",
            HOME: repo,
            QZ_CONTENT_KEY: master.toString("base64"),
          },
        },
      );
      expect(run.status).toBe(1);
      return `${run.stdout}\n${run.stderr}`;
    });
    const [text, json] = outputs;
    // The planted failures were all found...
    for (const rule of ["C01", "C12", "C15", "X10", "X20", "X28"])
      expect(text).toContain(` ${rule}`);
    expect(text).toContain("error m.geo.0101 C12 clues[0]");
    expect(JSON.parse(json?.slice(json.indexOf("{")) ?? "{}")).toMatchObject({
      ok: false,
    });
    // ...and nothing of the content came out.
    for (const output of outputs) {
      expectClean(output, {
        names: [
          ...COUNTRY_NAMES,
          "Arven Republic",
          "Arvennan",
          "heron",
          "Zorvania Minor",
          "Zorvania",
          "Heron Week",
          "Vellumland",
          ...[countryId("Arvenna")].map(plain),
        ],
        numbers: [4813.75],
        texts: [
          ...mystery.clues,
          "°C",
          request.evidence[0]?.summaryExcerpt ?? "",
        ],
      });
    }
  }, 60_000);
});
