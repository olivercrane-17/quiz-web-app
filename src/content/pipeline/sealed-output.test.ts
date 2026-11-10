// @vitest-environment node
/**
 * The output rule of ARCHITECTURE §5.4: a command that decrypts sealed
 * content prints item ids, rule codes, field paths and counts, and never a
 * clue, key, entity name, alias or number from the content. The
 * content-sealed CI job's logs are public. CNT-2b adds a run with a
 * cross-pool judgment recorded and a sealed retirement refused: the planted
 * failures still never leak, and no line joins the public item to a sealed
 * one.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
      // The workspace report lists the pairs; a redacted one counts them.
      pairs?: Record<string, unknown>[] | number;
    };
    for (const finding of report.findings ?? []) {
      const text = `${finding.itemId ?? ""} ${finding.message} ${finding.excerpt ?? ""}`;
      expect(text.includes("p.geo.0101") && SEALED_ID.test(text), text).toBe(
        false,
      );
    }
    for (const pair of Array.isArray(report.pairs) ? report.pairs : []) {
      const text = JSON.stringify(pair);
      expect(text.includes("p.geo.0101") && SEALED_ID.test(text), text).toBe(
        false,
      );
    }
  }
}

/** Planted names and words: none may reach either output stream. */
const SECRETS = [
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

/**
 * A throwaway repository holding the planted failures: sealed envelopes of
 * two mysteries (a clue with the alias, a giveaway term) and a twin with a
 * failing refinement, an encore with a bad unit and a distinctive number,
 * and a public practice item that shares the mysteries' answer.
 */
function plantedRepo() {
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
  // Planted: a valid near-duplicate with the same answer.
  const third = { ...mystery, id: "m.geo.0103" };
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
  write("mysteries", "m.geo.0103", third);
  write("encores", "e.0101", encore);

  /** The plaintext workspace, as writers work in it. */
  const unseal = () => {
    for (const [id, value] of [
      ["m.geo.0101", mystery],
      ["m.geo.0102", twin],
      ["m.geo.0103", third],
    ] as const) {
      const dir = join(repo, "content/.sealed-plain/mysteries");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(value, null, 2));
    }
  };
  /** A content script, with or without the throwaway key. */
  const node = (script: string, args: string[], withKey = false) =>
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
        // Never the machine's own key: HOME is the throwaway repository.
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH ?? "",
          HOME: repo,
          ...(withKey ? { QZ_CONTENT_KEY: master.toString("base64") } : {}),
        },
      },
    );
  /** Nothing of the planted content in either stream. */
  const expectClean = (output: string) => {
    const words = output.toLowerCase().split(/[^a-z0-9.]+/);
    for (const secret of SECRETS) expect(words, secret).not.toContain(secret);
    expect(output).not.toMatch(/\b37\.25\b/);
    expect(output).not.toContain("°C");
    for (const clue of mystery.clues) expect(output).not.toContain(clue);
  };
  return { repo, mystery, write, unseal, node, expectClean };
}

describe("sealed validation output", () => {
  // Nine child processes run the content scripts: about 3 to 4.5 s alone,
  // 7 to 8 s under shared-CPU load, past Vitest's 5 s default.
  it("never prints clues, answers, names, aliases or numbers", () => {
    const { unseal, node, expectClean } = plantedRepo();
    const runs = [[], ["--json"]].map((extra) =>
      node("check", ["--sealed", ...extra], true),
    );
    for (const run of runs) {
      expect(run.status).toBe(1);
      const output = `${run.stdout}\n${run.stderr}`;
      // The planted failures were found...
      for (const rule of ["C01", "C12", "C15", "C22"])
        expect(output).toContain(rule);
      expect(output).toContain("m.geo.0101");
      // ...and nothing of the content came out.
      expectClean(output);
      expectNoJoin(run.stdout);
    }

    // The same bank from the plaintext workspace, as writers run it, and
    // content:dedupe over it: still no line ties the public item to a
    // sealed id, and the cross-seal pair is listed under its sealed id only.
    unseal();
    for (const args of [
      ["check"],
      ["check", "--json"],
      ["dedupe"],
      ["dedupe", "--json"],
      ["dedupe", "--item", "m.geo.0101"],
    ]) {
      const [script = "check", ...rest] = args;
      const result = node(script, rest);
      expectNoJoin(result.stdout);
      expect(result.stderr).not.toMatch(/p\.geo\.0101/);
    }
    const pairs = node("dedupe", []).stdout;
    expect(pairs).toMatch(/m\.geo\.010\d {2}a public item/);
    // With --reveal, in your own terminal, the pair is named.
    expect(node("dedupe", ["--reveal"]).stdout).toMatch(
      /p\.geo\.0101 {2}m\.geo\.010\d|m\.geo\.010\d {2}p\.geo\.0101/,
    );
  }, 30_000);

  // CNT-2b: a cross-pool judgment recorded on the workspace, then sealed,
  // and a sealed retirement refused. The planted failures still never leak,
  // and no line joins the public item to a sealed id.
  it("still never leaks with a cross-pool judgment recorded and a sealed retirement refused", () => {
    const { repo, write, unseal, node, expectClean } = plantedRepo();
    unseal();
    // The workspace guard asks git whether the workspace is ignored.
    spawnSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(join(repo, ".gitignore"), "content/.sealed-plain/\n");
    const reason = "Both name the country; the flag clue is a different fact.";
    const recorded = node("dedupe", [
      "--cross-pool-ok",
      "--daily",
      "m.geo.0101",
      "--item",
      "p.geo.0101",
      "--editor",
      "ed-sealed-output-test",
      "--reason",
      reason,
    ]);
    expect(recorded.status, recorded.stderr).toBe(0);
    expect(recorded.stdout).toContain("m.geo.0101: related_ok recorded");
    for (const stream of [recorded.stdout, recorded.stderr]) {
      expect(stream).not.toContain("p.geo.0101");
      expect(stream).not.toContain(reason);
      expectClean(stream);
    }
    // Seal the judged mystery, as content:seal would.
    const judged = JSON.parse(
      readFileSync(
        join(repo, "content/.sealed-plain/mysteries/m.geo.0101.json"),
        "utf8",
      ),
    ) as { verification?: { crossPool?: unknown[] } };
    expect(judged.verification?.crossPool).toHaveLength(1);
    write("mysteries", "m.geo.0101", judged);

    // Sealed runs: the judged pair is skipped, the third mystery's is not,
    // and nothing of the content comes out, in text or JSON.
    const crossPool = node("dedupe", ["--sealed", "--cross-pool"], true);
    expect(crossPool.status).toBe(1);
    expect(crossPool.stdout).toContain("error m.geo.0103 X29");
    expect(crossPool.stdout).not.toContain("error m.geo.0101 X29");
    expect(crossPool.stdout).toContain(
      "1 flagged pair(s) skipped under an editor's related_ok",
    );
    for (const run of [
      crossPool,
      node("dedupe", ["--sealed", "--json"], true),
      node("check", ["--sealed"], true),
      node("check", ["--sealed", "--json"], true),
    ]) {
      const output = `${run.stdout}\n${run.stderr}`;
      expectClean(output);
      expect(output).not.toContain(reason);
      expectNoJoin(run.stdout);
      expect(run.stderr).not.toMatch(/p\.geo\.0101/);
    }
    // The workspace's own report of the pair: counts only, no join.
    const item = node("dedupe", ["--item", "m.geo.0101"]);
    expect(item.stdout).toContain(
      "X29 for m.geo.0101: 1 flagged: 1 judged related_ok, 0 unjudged",
    );
    expectNoJoin(item.stdout);

    // A sealed retirement the tools refuse (a draft) names the id and its
    // status only.
    const refused = node("batch", [
      "retire",
      "--item",
      "m.geo.0101",
      "--editor",
      "ed-sealed-output-test",
      "--reason",
      reason,
    ]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(
      "content:batch: m.geo.0101 is draft; retire takes active items only",
    );
    expectClean(`${refused.stdout}\n${refused.stderr}`);
    expect(refused.stderr).not.toContain(reason);
  }, 60_000);
});
