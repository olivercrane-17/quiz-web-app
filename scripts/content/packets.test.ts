// @vitest-environment node
/**
 * The packet builder (CONTENT_GUIDE §9.4, ARCHITECTURE §5.8): two separate
 * runs over the same items give byte-identical packet hashes, and the
 * content team's `content:packet` is the same tool as `content:packets`.
 */
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  fxFiles,
  removeTempDirs,
  tempDir,
  writeTree,
} from "../../src/content/pipeline/__fixtures__/builders.ts";

afterAll(removeTempDirs);

/** A throwaway repository holding a fixture tree, outside the real one. */
async function repo(): Promise<{ repo: string; root: string }> {
  const dir = tempDir("qz-packets-");
  writeFileSync(join(dir, "package.json"), "{}\n");
  for (const path of [
    "content/categories.json",
    "content/reference",
    "content/datasets/manifest.json",
  ])
    cpSync(join(REPO_ROOT, path), join(dir, path), { recursive: true });
  const root = await writeTree(fxFiles(), join(dir, "tree"));
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

/** Every stage file of a pass, with the build time taken out. */
function stages(
  dir: string,
  batch: string,
  pass: string,
): Record<string, unknown> {
  const folder = join(dir, ".cache/packets", batch, pass);
  return Object.fromEntries(
    readdirSync(folder)
      .sort()
      .map((name) => {
        const packet = JSON.parse(
          readFileSync(join(folder, name), "utf8"),
        ) as Record<string, unknown>;
        delete packet.generatedAt;
        return [name, packet];
      }),
  );
}

describe("packet hashes", () => {
  it("are byte-identical across two runs, for every pass and for the staged mystery packets", async () => {
    for (const [batch, passes] of [
      ["p.geo.b01", ["A", "B"]],
      ["m.geo.b01", ["A", "B"]],
      ["e.b01", ["A"]],
    ] as const) {
      for (const pass of passes) {
        const first = await repo();
        const second = await repo();
        const args = [
          "--batch",
          batch,
          "--pass",
          pass,
          "--root",
          "tree",
          "--fixtures",
          "--force",
          "--json",
        ];
        const a = cli(first.repo, "packets", ...args);
        const b = cli(second.repo, "packets", ...args);
        expect(a.code, a.err).toBe(0);
        expect(b.code, b.err).toBe(0);
        const hashes = (out: string) =>
          JSON.stringify(
            (
              JSON.parse(out) as {
                items: { itemId: string; packetSha256: string }[];
              }
            ).items,
          );
        // The same bytes: ids and hashes in the same order.
        expect(hashes(a.out)).toBe(hashes(b.out));
        expect(hashes(a.out)).toMatch(/"packetSha256":"[0-9a-f]{64}"/);
        // The stage files agree too, apart from when they were built.
        expect(stages(first.repo, batch, pass)).toEqual(
          stages(second.repo, batch, pass),
        );
      }
    }
  }, 120_000);

  it("are the same through content:packet, the content team's name for the same tool", async () => {
    const { repo: dir } = await repo();
    const args = [
      "--batch",
      "p.geo.b01",
      "--pass",
      "A",
      "--root",
      "tree",
      "--fixtures",
      "--force",
    ];
    const old = cli(dir, "packet", ...args);
    const doc = cli(dir, "packets", ...args);
    expect(old.code, old.err).toBe(0);
    expect(
      old.out
        .split("\n")
        .filter((l) => /packetSha256|^\S+ {2}[0-9a-f]{64}$/.test(l)),
    ).toEqual(
      doc.out
        .split("\n")
        .filter((l) => /packetSha256|^\S+ {2}[0-9a-f]{64}$/.test(l)),
    );
    // Each names itself, as it always did.
    expect(old.out).toContain("content:packet: 3 pass A packet(s)");
    expect(doc.out).toContain("content:packets: 3 pass A packet(s)");
    expect(cli(dir, "packet", "--help").out).toContain(
      "npm run content:packet --",
    );
  }, 60_000);
});
