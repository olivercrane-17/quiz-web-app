// @vitest-environment node
/**
 * The output rule of ARCHITECTURE §5.4: a command that decrypts sealed
 * content prints item ids, rule codes, field paths and counts, and never a
 * clue, key, entity name, alias or number from the content. The
 * content-sealed CI job's logs are public.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  COUNTRY_NAMES,
  REPO_ROOT,
  fxCountryList,
  fxEncore,
  fxMc,
  fxMystery,
  removeTempDirs,
  tempDir,
} from "./__fixtures__/builders.ts";
import { deriveSealKeys, envelopeText, sealBytes } from "./seal.ts";

afterAll(removeTempDirs);

const master = Buffer.alloc(32, 5);
const keys = deriveSealKeys(master);

/** The fixture country list with plain x. ids, so the bank is a content bank. */
function contentCountryList() {
  const list = fxCountryList() as { entities: Record<string, unknown>[] };
  return {
    ...list,
    entities: list.entities.map((entity) => ({
      ...entity,
      id: String(entity.id).replace(/^fx\./, ""),
    })),
  };
}

const plain = (id: string) => id.replace(/^fx\./, "");

/** A plaintext item whose answer is the sealed mysteries' answer. */
const PUBLIC_TWIN = fxMc({
  id: "p.geo.0101",
  stem: "Which fixture country did the explorer Dorn reach in spring?",
  answer: "Arvenna",
  wrong: ["Belloria", "Cassova", "Dravenor"],
});
const SEALED_ID = /\b(?:m\.[a-z]+\.\d{4}|e\.\d{4})\b/;

/** No output line, and no JSON finding, joins the public item to a sealed one. */
function expectNoJoin(output: string): void {
  for (const line of output.split("\n")) {
    if (line.includes("p.geo.0101")) expect(line).not.toMatch(SEALED_ID);
  }
  const start = output.indexOf("{");
  if (output.trimStart().startsWith("{") && start >= 0) {
    const report = JSON.parse(output.slice(start)) as {
      findings?: { itemId?: string; message: string; excerpt?: string }[];
      pairs?: Record<string, unknown>[];
    };
    for (const finding of report.findings ?? []) {
      const text = `${finding.itemId ?? ""} ${finding.message} ${finding.excerpt ?? ""}`;
      expect(text.includes("p.geo.0101") && SEALED_ID.test(text), text).toBe(
        false,
      );
    }
    for (const pair of report.pairs ?? []) {
      const text = JSON.stringify(pair);
      expect(text.includes("p.geo.0101") && SEALED_ID.test(text), text).toBe(
        false,
      );
    }
  }
}

describe("sealed validation output", () => {
  // Nine child processes run the content scripts: about 3 to 4.5 s alone,
  // 7 to 8 s under shared-CPU load, past Vitest's 5 s default.
  it("never prints clues, answers, names, aliases or numbers", () => {
    const repo = tempDir("qz-sealed-out-");
    writeFileSync(join(repo, "package.json"), "{}\n");
    for (const path of [
      "content/categories.json",
      "content/batches.json",
      "content/reference",
      "content/datasets/manifest.json",
    ]) {
      cpSync(join(REPO_ROOT, path), join(repo, path), { recursive: true });
    }
    mkdirSync(join(repo, "content/answer-lists"), { recursive: true });
    writeFileSync(
      join(repo, "content/answer-lists/country.json"),
      JSON.stringify(contentCountryList()),
    );
    // A public practice item that shares the sealed mysteries' answer: a
    // near-duplicate pair across the seal (review finding 5).
    mkdirSync(join(repo, "content/practice/geography"), { recursive: true });
    writeFileSync(
      join(repo, "content/practice/geography/p.geo.0101.json"),
      JSON.stringify(PUBLIC_TWIN, null, 2),
    );

    const base = fxMystery();
    const toPlain = <
      T extends { answer: string; distractors: readonly string[] },
    >(
      m: T,
    ) => ({
      ...m,
      answer: plain(m.answer),
      distractors: m.distractors.map(plain),
    });
    const mystery = {
      ...toPlain(base),
      id: "m.geo.0101",
      accepted: [],
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
    const twin = {
      ...mystery,
      id: "m.geo.0102",
      // Planted: a failing refinement and a near-duplicate (same answer).
      seedSolveShares: [0.9, 0.5, 0.95, 0.99],
    };
    // Planted: a bad encore unit and a distinctive numeric answer.
    const encore = {
      ...fxEncore(),
      id: "e.0101",
      answer: 37.25,
      decimals: 2,
      unit: "°C",
    };

    const write = (folder: string, id: string, value: unknown) => {
      const dir = join(repo, "content/sealed", folder);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${id}.json.enc`),
        envelopeText(
          sealBytes(keys, Buffer.from(`${JSON.stringify(value, null, 2)}\n`)),
        ),
      );
    };
    write("mysteries", "m.geo.0101", mystery);
    write("mysteries", "m.geo.0102", twin);
    // Planted: a valid near-duplicate with the same answer.
    write("mysteries", "m.geo.0103", { ...mystery, id: "m.geo.0103" });
    write("encores", "e.0101", encore);

    const runs = [[], ["--json"]].map((extra) =>
      spawnSync(
        process.execPath,
        [
          "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
          join(REPO_ROOT, "scripts/content/check.ts"),
          "--sealed",
          ...extra,
        ],
        {
          cwd: repo,
          encoding: "utf8",
          env: {
            NODE_ENV: "test",
            PATH: process.env.PATH ?? "",
            QZ_CONTENT_KEY: master.toString("base64"),
          },
        },
      ),
    );
    for (const run of runs) {
      expect(run.status).toBe(1);
      const output = `${run.stdout}\n${run.stderr}`;
      // The planted failures were found...
      for (const rule of ["C01", "C12", "C15", "C22"])
        expect(output).toContain(rule);
      expect(output).toContain("m.geo.0101");
      // ...and nothing of the content came out.
      const words = output.toLowerCase().split(/[^a-z0-9.]+/);
      const secrets = [
        ...COUNTRY_NAMES,
        "Arven",
        "Arvennan",
        "heron",
        "Vellum",
        "Cindral",
        "Gorlund",
        "lighthouse",
        "steps",
        "bridges",
      ].map((s) => s.toLowerCase());
      for (const secret of secrets) expect(words, secret).not.toContain(secret);
      expect(output).not.toMatch(/\b37\.25\b/);
      expect(output).not.toContain("°C");
      for (const clue of mystery.clues) expect(output).not.toContain(clue);
      expectNoJoin(run.stdout);
    }

    // The same bank from the plaintext workspace, as writers run it, and
    // content:dedupe over it: still no line ties the public item to a
    // sealed id, and the cross-seal pair is listed under its sealed id only.
    for (const [id, value] of [
      ["m.geo.0101", mystery],
      ["m.geo.0102", twin],
      ["m.geo.0103", { ...mystery, id: "m.geo.0103" }],
    ] as const) {
      const dir = join(repo, "content/.sealed-plain/mysteries");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(value, null, 2));
    }
    const node = (script: string, ...args: string[]) =>
      spawnSync(
        process.execPath,
        [
          "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
          join(REPO_ROOT, `scripts/content/${script}.ts`),
          ...args,
        ],
        {
          cwd: repo,
          encoding: "utf8",
          env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: repo },
        },
      );
    for (const args of [
      ["check"],
      ["check", "--json"],
      ["dedupe"],
      ["dedupe", "--json"],
      ["dedupe", "--item", "m.geo.0101"],
    ]) {
      const [script = "check", ...rest] = args;
      const result = node(script, ...rest);
      expectNoJoin(result.stdout);
      expect(result.stderr).not.toMatch(/p\.geo\.0101/);
    }
    const pairs = node("dedupe").stdout;
    expect(pairs).toMatch(/m\.geo\.010\d {2}a public item/);
    // With --reveal, in your own terminal, the pair is named.
    expect(node("dedupe", "--reveal").stdout).toMatch(
      /p\.geo\.0101 {2}m\.geo\.010\d|m\.geo\.010\d {2}p\.geo\.0101/,
    );
  }, 30_000);
});
