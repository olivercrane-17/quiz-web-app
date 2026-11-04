// @vitest-environment node
/**
 * CNT-2's rules in a sealed run (ARCHITECTURE §5.4, CNT-2's acceptance):
 * every finding about sealed content reaches the console only through the
 * redacting reporter, as severity, id, rule code and field path. The test
 * seals planted failures of C15, C19, C22, C26, C27 and C28, and a failing
 * audit record, with a throwaway key, runs the real commands, and checks
 * both output streams for every planted name, number and text.
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
} from "../../../src/content/pipeline/__fixtures__/builders.ts";
import {
  deriveSealKeys,
  envelopeText,
  sealBytes,
} from "../../../src/content/pipeline/seal.ts";
import { normalizeName } from "../../../src/engine/suggest/normalize.ts";

afterAll(removeTempDirs);

const plain = (id: string) => id.replace(/^fx\./, "");

function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) =>
    Number(m[0].replace(/,/g, "")),
  );
}

function hasName(text: string, name: string): boolean {
  return ` ${normalizeName(text)} `.includes(` ${normalizeName(name)} `);
}

describe("CNT-2's rules in a sealed run", () => {
  it("print only ids, rule codes and paths, never a planted name, number or text", () => {
    const repo = tempDir("qz-cnt2-sealed-");
    writeFileSync(join(repo, "package.json"), "{}\n");
    for (const path of [
      "content/categories.json",
      "content/batches.json",
      "content/compositions.json",
      "content/reference",
      "content/datasets/manifest.json",
      "src/config/shared.json",
    ])
      cpSync(join(REPO_ROOT, path), join(repo, path), { recursive: true });

    // A public list where one option of the mystery shows a bracket (C28).
    const list = fxCountryList() as { entities: Record<string, unknown>[] };
    mkdirSync(join(repo, "content/answer-lists"), { recursive: true });
    writeFileSync(
      join(repo, "content/answer-lists/country.json"),
      JSON.stringify({
        ...list,
        entities: list.entities.map((e) => ({
          ...e,
          id: plain(String(e.id)),
          ...(e.name === "Cassova" ? { display: "Cassova (Lowlands)" } : {}),
        })),
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
      // C27: a clue pairing "capital" with a listed country; C19: a
      // superlative with no high-risk claim anywhere in the item.
      clues: [
        base.clues[0],
        "Its capital moved away from Bonn when Germany was reunited.",
        "It holds the largest heron colony on the Vellum river.",
        base.clues[3],
      ],
      // C26: claims below the floor, one with a distinctive number.
      claims: [
        ...base.claims,
        {
          id: "c8",
          role: "explanation",
          risk: "standard",
          text: "Herons have nested along the Vellum for 4813 years.",
        },
      ],
    };
    // C22: an encore value from the guide's §12.9 (285 squares); C15: more
    // measured encores than one batch may hold.
    const denied = {
      ...fxEncore(),
      id: "e.0101",
      question: "How many squares does the fixture board of Cindral hold?",
      answer: 285,
      unit: "squares",
      unitShort: "squares",
      unitLabel: "squares",
    };
    const measured = (id: string, answer: number) => ({
      ...fxEncore(),
      id,
      question: `How far does the fixture ferry ${id.slice(-1)} of Gorlund sail each day?`,
      answer,
      unit: "km",
      unitShort: "km",
      unitLabel: "km",
    });
    // A pre-launch audit record that misses AC-CNT-05.
    const audit = {
      id: "audit-2026-11-04",
      date: "2026-11-04",
      seed: 7,
      purpose: "prelaunch",
      status: "closed",
      auditor: { id: "au-fx-auditor", model: "model-b" },
      planter: { id: "pl-fx-planter", model: "model-c" },
      sample: [
        {
          packetId: "pk-aaaaaaaa",
          itemId: "m.geo.0101",
          pool: "daily",
          verdict: "fail",
          defect: "the heron colony is in Zorvania",
          resolution: "confirmed",
        },
      ],
      plants: [
        {
          packetId: "pk-bbbbbbbb",
          defect: "date_off",
          subtle: true,
          caught: false,
        },
      ],
      counts: {
        practice: 0,
        daily: 1,
        planted: 1,
        subtle: 1,
        caught: 0,
        flagged: 1,
        confirmedErrors: 1,
      },
      confirmedErrors: [
        {
          itemId: "m.geo.0101",
          defect: "the heron colony is in Zorvania",
          rechecks: ["verification.rechecks[0]"],
        },
      ],
    };

    const master = Buffer.alloc(32, 21);
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
    seal("encores", "e.0101", denied);
    // The register plans 40 encores for e.b01, so four measured ones fit.
    const values = [4127, 3911, 2753, 2671, 2459];
    values.forEach((value, i) => {
      const id = `e.010${i + 2}`;
      seal("encores", id, measured(id, value));
    });
    seal("audits", "audit-2026-11-04", audit);
    // A public practice item that gives away the sealed mystery's flag
    // clue: the cross-pool check (X29) catches it in any sealed run.
    const twin = {
      ...fxMc(),
      id: "p.geo.0199",
      stem: "Which fixture country flies a silver heron above three blue waves?",
      answer: "Arvenna",
      wrong: ["Belloria", "Cassova", "Dravenor"],
    };
    mkdirSync(join(repo, "content/practice/geography"), { recursive: true });
    writeFileSync(
      join(repo, "content/practice/geography/p.geo.0199.json"),
      `${JSON.stringify(twin, null, 2)}\n`,
    );

    const run = (script: string, ...args: string[]) => {
      const result = spawnSync(
        process.execPath,
        [
          "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
          join(REPO_ROOT, "scripts/content", script),
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
            QZ_CONTENT_KEY: master.toString("base64"),
          },
        },
      );
      return `${result.stdout}\n${result.stderr}`;
    };
    const outputs = [
      run("check.ts", "--sealed", "--today", "2026-11-04"),
      run("check.ts", "--sealed", "--today", "2026-11-04", "--json"),
      run("audit.ts", "check", "--sealed"),
      run("audit.ts", "check", "--sealed", "--launch", "--json"),
      run("check.ts", "--sealed", "--today", "2026-11-04", "--launch"),
    ];
    const [text = "", , auditText = "", , launchText = ""] = outputs;
    // content:check itself reads the audit record (ARCHITECTURE §5.7): the
    // pre-launch audit's AC-CNT-05 misses warn, and fail with --launch...
    expect(text).toContain("warn  audit-2026-11-04 X32");
    expect(launchText).toContain("error audit-2026-11-04 X32");
    // ...and runs the cross-pool dedupe without --launch: the sealed side
    // is named, the public one never.
    expect(text).toContain("error m.geo.0101 X29");
    expect(text).not.toContain("p.geo.0199 X29");
    // The planted failures were all found...
    expect(text).toContain("m.geo.0101 C26 claims[");
    expect(text).toContain("error m.geo.0101 C27 clues[1]");
    expect(text).toContain("m.geo.0101 C19 clues[2]");
    expect(text).toContain("error m.geo.0101 C28 distractors[1]");
    expect(text).toContain("warn  e.0101 C22 answer");
    expect(text).toContain("error e.0106 C15 unit");
    expect(text).not.toContain("e.0105 C15");
    expect(auditText).toContain("audit-2026-11-04 X32");
    // ...and nothing of the content came out, in any run or stream.
    for (const output of outputs) {
      for (const name of [
        ...COUNTRY_NAMES,
        "Germany",
        "Bonn",
        "heron",
        "Vellum",
        "Zorvania",
        "Lowlands",
        "squares",
        "Gorlund",
      ])
        expect(hasName(output, name), name).toBe(false);
      const found = numbersIn(output);
      for (const value of [4813, 285, ...values])
        expect(found, String(value)).not.toContain(value);
      for (const snippet of [
        ...mystery.clues,
        "largest",
        "e.0004",
        "date_off",
        "km",
      ])
        expect(output).not.toContain(snippet);
    }
  }, 120_000);
});
