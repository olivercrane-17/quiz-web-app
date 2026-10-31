// @vitest-environment node
/**
 * Drives the real CLIs end to end in a throwaway repository: open a batch,
 * take ids, write items, submit, build packets, record both checks, accept,
 * close. Practice items only, so no sealed plaintext is involved.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { McItem } from "../schema/items.ts";
import {
  EDITOR,
  REPO_ROOT,
  fxMc,
  fxRecord,
  fxTf,
  removeTempDirs,
  tempDir,
} from "./__fixtures__/builders.ts";
import { loadBank } from "./bank.ts";
import { resolveLayout } from "./layout.ts";

function makeRepo(): string {
  const repo = tempDir("qz-cli-");
  writeFileSync(join(repo, "package.json"), "{}\n");
  for (const path of [
    "content/categories.json",
    "content/batches.json",
    "content/reference",
    "content/datasets/manifest.json",
  ]) {
    cpSync(join(REPO_ROOT, path), join(repo, path), { recursive: true });
  }
  return repo;
}

/** A throwaway content key: packets shuffle their options with it. */
const KEY = Buffer.alloc(32, 11).toString("base64");

function cli(repo: string, script: string, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      join(REPO_ROOT, "scripts/content", `${script}.ts`),
      ...args,
    ],
    {
      cwd: repo,
      encoding: "utf8",
      // Never the machine's own key file: HOME is the throwaway repository.
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH ?? "",
        HOME: repo,
        QZ_CONTENT_KEY: KEY,
      },
    },
  );
  return { code: result.status, out: result.stdout, err: result.stderr };
}

afterAll(removeTempDirs);

const realId = (item: McItem, id: string) => ({ ...item, id });

describe("the content CLIs", () => {
  it(
    "take a practice batch from planned to closed",
    { timeout: 60_000 },
    async () => {
      const repo = makeRepo();
      const writer = "w-e2e-writer";

      expect(cli(repo, "check").code).toBe(0);
      const open = cli(
        repo,
        "batch",
        "open",
        "--batch",
        "p.geo.b01",
        "--writer",
        writer,
      );
      expect(open.out).toContain("p.geo.0101 to p.geo.0199");
      const ids = JSON.parse(
        cli(
          repo,
          "batch",
          "ids",
          "--batch",
          "p.geo.b01",
          "--writer",
          writer,
          "--count",
          "2",
          "--json",
        ).out,
      ) as string[];
      expect(ids).toEqual(["p.geo.0101", "p.geo.0102"]);

      const dir = join(repo, "content/practice/geography");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "p.geo.0101.json"),
        JSON.stringify(realId(fxMc(), "p.geo.0101"), null, 2),
      );
      writeFileSync(
        join(dir, "p.geo.0102.json"),
        JSON.stringify({ ...fxTf(), id: "p.geo.0102" }, null, 2),
      );
      const check = JSON.parse(
        cli(repo, "check", "--batch", "p.geo.b01", "--json", "--writer", writer)
          .out,
      ) as { ok: boolean; errors: number };
      expect(check).toMatchObject({ ok: true, errors: 0 });
      expect(cli(repo, "check", "--writer", "w-somebody-else").code).toBe(1);

      expect(
        cli(repo, "packet", "--batch", "p.geo.b01", "--pass", "A").code,
      ).toBe(1);
      expect(
        cli(repo, "batch", "submit", "--batch", "p.geo.b01", "--writer", writer)
          .code,
      ).toBe(0);
      for (const pass of ["A", "B"]) {
        const packet = JSON.parse(
          cli(repo, "packet", "--batch", "p.geo.b01", "--pass", pass, "--json")
            .out,
        ) as { items: { itemId: string; packetSha256: string }[] };
        expect(packet.items.map((item) => item.itemId)).toEqual(ids);
      }
      const cold = readFileSync(
        join(repo, ".cache/packets/p.geo.b01/A/cold.json"),
        "utf8",
      );
      expect(cold).not.toContain("writerNotes");
      expect(cold).not.toContain('"claims"');
      expect(cold).not.toContain(fxMc().explanation);
      expect(
        existsSync(join(repo, ".cache/packets/p.geo.b01/B/reveal.json")),
      ).toBe(true);

      const layout = resolveLayout({ repoRoot: repo });
      const bank = await loadBank(layout);
      for (const pass of ["A", "B"] as const) {
        const records = ids.map((id) => {
          const record = bank.itemsById.get(id);
          if (!record) throw new Error(id);
          return fxRecord(bank, record, pass);
        });
        const bad = join(repo, `bad-${pass}.json`);
        writeFileSync(
          bad,
          JSON.stringify(
            records.map((r) => ({ ...r, checker: `fc-${writer.slice(2)}` })),
          ),
        );
        const rejected = cli(
          repo,
          "record",
          "--batch",
          "p.geo.b01",
          "--pass",
          pass,
          "--file",
          bad,
        );
        expect(rejected.code).toBe(1);
        expect(rejected.out).toContain("nothing was merged");
        const good = join(repo, `records-${pass}.json`);
        writeFileSync(good, JSON.stringify(records));
        const merged = cli(
          repo,
          "record",
          "--batch",
          "p.geo.b01",
          "--pass",
          pass,
          "--file",
          good,
        );
        expect(merged.out).toContain(`merged 2 pass ${pass} record(s)`);
      }

      // The estimator's packet and five estimates per item (§8.5).
      expect(
        cli(repo, "packet", "--batch", "p.geo.b01", "--pass", "E").code,
      ).toBe(0);
      const estimate = readFileSync(
        join(repo, ".cache/packets/p.geo.b01/E/estimate.json"),
        "utf8",
      );
      expect(estimate).not.toContain('"claims"');
      const estimates = join(repo, "estimates.json");
      writeFileSync(
        estimates,
        JSON.stringify(
          ids.map((itemId) => ({
            itemId,
            estimator: "es-e2e-estimator",
            estimates: [0.6, 0.66, 0.7, 0.62, 0.68],
          })),
        ),
      );
      const estimated = cli(
        repo,
        "estimate",
        "--batch",
        "p.geo.b01",
        "--file",
        estimates,
      );
      expect(estimated.out).toContain("wrote predicted on 2 item(s)");
      const checking = JSON.parse(
        readFileSync(join(dir, "p.geo.0101.json"), "utf8"),
      ) as { status: string; predicted: { p: number } };
      expect(checking.status).toBe("checking");
      expect(checking.predicted.p).toBeCloseTo(0.66, 2);
      const decisions = join(repo, "decisions.json");
      writeFileSync(
        decisions,
        JSON.stringify([
          {
            itemId: "p.geo.0101",
            editor: EDITOR,
            decision: "accept",
            reason: "Both checks pass.",
          },
          {
            itemId: "p.geo.0102",
            editor: EDITOR,
            decision: "cut",
            reason: "Too close to another item.",
          },
        ]),
      );
      const decided = cli(
        repo,
        "decide",
        "--batch",
        "p.geo.b01",
        "--file",
        decisions,
      );
      expect(decided.out).toContain("p.geo.0101: accept -> active");
      expect(decided.code).toBe(0);
      // A hand edit after acceptance never passes content:check (§9.9).
      const accepted = readFileSync(join(dir, "p.geo.0101.json"), "utf8");
      const swapped = JSON.parse(accepted) as McItem;
      writeFileSync(
        join(dir, "p.geo.0101.json"),
        JSON.stringify(
          {
            ...swapped,
            answer: "Reed pipe",
            wrong: ["Brass horn", "Hand drum", "Bone flute"],
          },
          null,
          2,
        ),
      );
      const tampered = cli(
        repo,
        "check",
        "--file",
        "content/practice/geography/p.geo.0101.json",
      );
      expect(tampered.code).toBe(1);
      expect(tampered.out).toContain(
        "the item changed after pass A was recorded",
      );
      writeFileSync(join(dir, "p.geo.0101.json"), accepted);

      const closed = cli(repo, "batch", "close", "--batch", "p.geo.b01");
      expect(closed.out).toContain("1 accepted (target 63), 1 cut");

      const stats = JSON.parse(cli(repo, "stats", "--json").out) as {
        pools: { practice: { byStatus: Record<string, number> } };
      };
      expect(stats.pools.practice.byStatus).toEqual({ active: 1, cut: 1 });
      expect(cli(repo, "check").code).toBe(0);
    },
  );
});
