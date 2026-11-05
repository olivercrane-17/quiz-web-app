// @vitest-environment node
/**
 * The packet builder (CONTENT_GUIDE §9.4, ARCHITECTURE §5.8): staged
 * packets, served one stage at a time once the run's draft record holds
 * the cold-solve entry for the stage before; byte-identical hashes across
 * two runs; the selfCheck gate; and `content:packet`, the content team's
 * name for the same tool.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  FX_SELF_CHECK,
  REPO_ROOT,
  fxCheckedFiles,
  fxMc,
  fxRecord,
  removeTempDirs,
  tempDir,
  writeTree,
} from "../../src/content/pipeline/__fixtures__/builders.ts";
import { loadBank } from "../../src/content/pipeline/bank.ts";
import { resolveLayout } from "../../src/content/pipeline/layout.ts";

afterAll(removeTempDirs);

/** A throwaway repository holding a fixture tree, outside the real one. */
async function repo(
  files = fxCheckedFiles(),
): Promise<{ repo: string; root: string }> {
  const dir = tempDir("qz-packets-");
  writeFileSync(join(dir, "package.json"), "{}\n");
  for (const path of [
    "content/categories.json",
    "content/reference",
    "content/datasets/manifest.json",
  ])
    cpSync(join(REPO_ROOT, path), join(dir, path), { recursive: true });
  const root = await writeTree(files, join(dir, "tree"));
  return { repo: dir, root };
}

function cli(dir: string, script: string, ...args: string[]) {
  const run = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      join(REPO_ROOT, "scripts/content", `${script}.ts`),
      ...args,
    ],
    {
      cwd: dir,
      encoding: "utf8",
      // Never the machine's own key: HOME is the throwaway repository, so a
      // fixture tree's public order key shuffles the options.
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: dir },
    },
  );
  return { code: run.status, out: run.stdout, err: run.stderr };
}

/** A fixture tree's packets live inside it (its layout's packetsDir). */
const passDir = (root: string, batch: string, pass: string) =>
  join(root, ".cache/packets", batch, pass);

/** Every file of a pass's packets, with the serve times taken out. */
function stages(root: string, batch: string, pass: string) {
  const out: Record<string, unknown> = {};
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const path = rel === "" ? name : `${rel}/${name}`;
      if (statSync(abs).isDirectory()) walk(abs, path);
      else
        out[path] = JSON.parse(
          readFileSync(abs, "utf8").replace(
            /"\d{4}-\d{2}-\d{2}T[\d:.]+Z"/g,
            '"T"',
          ),
        ) as unknown;
    }
  };
  walk(passDir(root, batch, pass), "");
  return out;
}

const BUILD = ["--root", "tree", "--fixtures", "--force"];

describe("staged packets", () => {
  it("are byte-identical across two runs, for every pass, stage by stage", async () => {
    for (const [batch, passes] of [
      ["p.geo.b01", ["A", "B"]],
      ["m.geo.b01", ["A", "B"]],
      ["e.b01", ["A"]],
    ] as const) {
      for (const pass of passes) {
        const first = await repo();
        const second = await repo();
        const args = ["--batch", batch, "--pass", pass, ...BUILD, "--json"];
        const a = cli(first.repo, "packets", ...args);
        const b = cli(second.repo, "packets", ...args);
        expect(a.code, a.err).toBe(0);
        expect(b.code, b.err).toBe(0);
        const items = (out: string) =>
          (
            JSON.parse(out) as {
              items: { itemId: string; stage: number; packetSha256: string }[];
            }
          ).items;
        // The same bytes: ids, stages and hashes in the same order.
        expect(JSON.stringify(items(a.out))).toBe(JSON.stringify(items(b.out)));
        expect(items(a.out).every((item) => item.stage === 1)).toBe(true);
        expect(JSON.stringify(items(a.out))).toMatch(
          /"packetSha256":"[0-9a-f]{64}"/,
        );
        // The files agree too, apart from when they were served.
        expect(stages(first.root, batch, pass)).toEqual(
          stages(second.root, batch, pass),
        );
      }
    }
  }, 120_000);

  it("serve the first stage only, and the next once the draft record holds the cold-solve entry before it", async () => {
    const { repo: dir, root } = await repo();
    const args = ["--batch", "m.geo.b01", "--pass", "A", ...BUILD];
    expect(cli(dir, "packets", ...args).code).toBe(0);
    const folder = join(passDir(root, "m.geo.b01", "A"), "fx.m.geo.0101");
    expect(readdirSync(folder)).toEqual(["stage-1.json"]);
    const stage1 = readFileSync(join(folder, "stage-1.json"), "utf8");
    expect(stage1).toContain('"clueStage": 1');
    expect(stage1).not.toContain('"claims"');
    expect(stage1).not.toContain('"clue4Options"');

    // No cold-solve entry yet: nothing is served, and naming the item fails.
    const draft = join(dir, "draft.json");
    const write = (perClue: unknown[]) =>
      writeFileSync(
        draft,
        JSON.stringify([{ itemId: "fx.m.geo.0101", coldSolve: { perClue } }]),
      );
    write([]);
    const next = [...args, "--next", "--record", draft];
    const early = cli(dir, "packets", ...next, "--items", "fx.m.geo.0101");
    expect(early.code).toBe(1);
    expect(early.out).toContain("no cold-solve entry for stage 1");
    expect(readdirSync(folder)).toEqual(["stage-1.json"]);

    // Clue by clue, then the final stage with the key and the claims.
    const entries: unknown[] = [];
    for (let clue = 1; clue <= 4; clue += 1) {
      entries.push({
        clue,
        guess: "fx.x.country.arvenna",
        candidates: ["fx.x.country.arvenna"],
        recordedAt: new Date().toISOString(),
      });
      write(entries);
      const served = cli(dir, "packets", ...next);
      expect(served.code, served.out).toBe(0);
      expect(served.out).toContain(`stage ${clue + 1} of 5`);
    }
    const final = JSON.parse(
      readFileSync(join(folder, "stage-5.json"), "utf8"),
    ) as {
      final: boolean;
      item: Record<string, unknown>;
      record: { packetSha256: string[]; stagesServedAt: string[] };
    };
    expect(final.final).toBe(true);
    expect(Object.keys(final.item)).toEqual(
      expect.arrayContaining(["key", "claims", "clue4Options"]),
    );
    expect(final.record.packetSha256).toHaveLength(5);
    expect(final.record.stagesServedAt).toHaveLength(5);
    // Nothing is left to serve.
    const done = cli(dir, "packets", ...next, "--items", "fx.m.geo.0101");
    expect(done.out).toContain("every stage has been served");

    // A record that repeats what was served passes content:record...
    const bank = await loadBank(
      resolveLayout({ repoRoot: dir, root: "tree", fixtures: true }),
    );
    const record = bank.itemsById.get("fx.m.geo.0101");
    if (!record) throw new Error("no mystery");
    const base = fxRecord(bank, record, "A");
    const honest = {
      ...base,
      ...final.record,
      startedAt: final.record.stagesServedAt[0],
      finishedAt: new Date().toISOString(),
      coldSolve: { perClue: entries },
    };
    const records = join(dir, "records.json");
    writeFileSync(records, JSON.stringify([honest]));
    const recordArgs = [
      "--batch",
      "m.geo.b01",
      "--pass",
      "A",
      "--file",
      records,
      "--root",
      "tree",
      "--fixtures",
      "--dry-run",
    ];
    const ok = cli(dir, "record", ...recordArgs);
    expect(ok.out).toContain("validated 1 pass A record(s)");
    // ...and one that claims other serve times than the log's does not,
    // even a millisecond off.
    writeFileSync(
      records,
      JSON.stringify([
        {
          ...honest,
          stagesServedAt: honest.stagesServedAt.map((at) =>
            new Date(Date.parse(at) - 1).toISOString(),
          ),
        },
      ]),
    );
    const forged = cli(dir, "record", ...recordArgs);
    expect(forged.code).toBe(1);
    expect(forged.out).toContain("stagesServedAt");
  }, 120_000);

  it("refuse an item whose selfCheck lacks a code or holds a false (§2.3, §9.3)", async () => {
    const files = fxCheckedFiles();
    const path = "practice/geography/fx.p.geo.0101.json";
    for (const item of [
      { ...fxMc() },
      { ...fxMc(), selfCheck: { ...FX_SELF_CHECK, lint: false } },
    ]) {
      const { repo: dir, root } = await repo({ ...files, [path]: item });
      const run = cli(
        dir,
        "packets",
        "--batch",
        "p.geo.b01",
        "--pass",
        "A",
        ...BUILD,
      );
      expect(run.code).toBe(1);
      expect(run.err).toContain("selfCheck");
      expect(run.err).toContain("fx.p.geo.0101");
      expect(existsSync(passDir(root, "p.geo.b01", "A"))).toBe(false);
    }
  }, 60_000);

  it("are the same through content:packet, the content team's name for the same tool", async () => {
    const { repo: dir } = await repo();
    const args = ["--batch", "p.geo.b01", "--pass", "A", ...BUILD];
    const old = cli(dir, "packet", ...args);
    const doc = cli(dir, "packets", ...args);
    expect(old.code, old.err).toBe(0);
    const hashes = (out: string) =>
      out
        .split("\n")
        .filter((l) => /^\S+ {2}stage 1 of \d+ {2}[0-9a-f]{64}$/.test(l));
    expect(hashes(old.out)).toEqual(hashes(doc.out));
    expect(hashes(old.out)).toHaveLength(3);
    // Each names itself, as it always did.
    expect(old.out).toContain("content:packet: served 3 pass A stage(s)");
    expect(doc.out).toContain("content:packets: served 3 pass A stage(s)");
    expect(cli(dir, "packet", "--help").out).toContain(
      "npm run content:packet --",
    );
  }, 60_000);
});
