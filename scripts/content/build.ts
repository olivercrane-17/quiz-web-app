/**
 * npm run content:build -- [--check] [--out <dir>] [--json]
 *
 * Validates the content that ships, then writes every output of
 * ARCHITECTURE §5.3: hashed practice packs and answer-list projections
 * under public/content/, the manifest and static modules under
 * src/content/generated/, the fixture world for mock builds, the mock's
 * sealed fixtures, and the committed SQL loads under supabase/seed/.
 * Deterministic, so `content:check` can rebuild in memory and fail on any
 * difference. See content/README.md.
 */
import { resolve } from "node:path";

import { parseCli, str } from "../../src/content/pipeline/cli.ts";
import { findRepoRoot } from "../../src/content/pipeline/layout.ts";
import {
  compareOutputs,
  driftCount,
  writeOutputs,
  type Drift,
} from "./lib/files.ts";
import { loadBanks, loadBuildInputs } from "./lib/inputs.ts";
import { blockingFindings } from "./lib/shipped.ts";
import { buildOutputs } from "./lib/outputs.ts";
import { printReport, runReported, type ReportFinding } from "./lib/report.ts";

const USAGE = `Usage: npm run content:build -- [options]

  --check        Compare with the committed outputs, write nothing; exit 1
                 on any difference (the drift check content:check runs)
  --out <dir>    Write into <dir> instead of the repository
  --json         Machine-readable output`;

const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;

runReported(
  "content:build",
  () => false,
  async () => {
    const values = parseCli(
      "content:build",
      process.argv.slice(2),
      {
        check: { type: "boolean" },
        out: { type: "string" },
        json: { type: "boolean" },
      },
      USAGE,
    );
    const repoRoot = findRepoRoot();
    const json = values.json === true;
    const banks = await loadBanks(repoRoot);

    // Only what ships can stop the build: active practice items, the
    // lists, the categories and the fixture tree (§5.3).
    const blocking: ReportFinding[] = blockingFindings(banks);
    const result = await buildOutputs(await loadBuildInputs(repoRoot, banks));
    for (const problem of result.problems) {
      blocking.push({ ...problem, severity: "error" });
    }
    if (blocking.length > 0) {
      printReport(
        {
          command: "content:build",
          items: banks.bank.items.length + (banks.fixtures?.items.length ?? 0),
          findings: blocking,
          notes: ["Nothing was written: fix the errors above first."],
        },
        { redact: false, reveal: false, json },
      );
      return 1;
    }

    const out = str(values, "out");
    const root = out === undefined ? repoRoot : resolve(out);
    const check = values.check === true;
    const drift: Drift = check
      ? await compareOutputs(root, result.outputs)
      : await writeOutputs(root, result.outputs);

    const items = result.packs.reduce((sum, pack) => sum + pack.items, 0);
    const entries = result.lists.reduce((sum, list) => sum + list.entities, 0);
    const packBytes = result.packs.reduce(
      (sum, pack) => sum + pack.gzipBytes,
      0,
    );
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: !check || driftCount(drift) === 0,
            contentVersion: result.contentVersion,
            packs: result.packs,
            lists: result.lists,
            ...(check
              ? { drift }
              : {
                  written: [...drift.changed, ...drift.missing],
                  removed: drift.stale,
                }),
          },
          null,
          2,
        ),
      );
    } else {
      for (const pack of result.packs) {
        console.log(
          `pack  ${pack.url}  ${pack.items} item(s)  ${kb(pack.gzipBytes)} gzipped`,
        );
      }
      for (const list of result.lists) {
        console.log(
          `list  ${list.url}  ${list.entities} entr${list.entities === 1 ? "y" : "ies"}  ${kb(list.gzipBytes)} gzipped`,
        );
      }
      const changed = drift.changed.length + drift.missing.length;
      if (check) {
        for (const path of drift.changed) console.log(`differs  ${path}`);
        for (const path of drift.missing) console.log(`missing  ${path}`);
        for (const path of drift.stale) console.log(`stale    ${path}`);
      }
      console.log(
        `content:build: ${result.packs.length} pack(s) with ${items} item(s), ${kb(packBytes)} gzipped; ${result.lists.length} list(s) with ${entries} entries; content version ${result.contentVersion}. ${
          check
            ? driftCount(drift) === 0
              ? "Every output is up to date."
              : `${driftCount(drift)} output(s) differ: run npm run content:build.`
            : changed + drift.stale.length === 0
              ? "Every output was already up to date."
              : `Wrote ${changed} file(s), removed ${drift.stale.length} stale file(s).`
        }`,
      );
    }
    return check && driftCount(drift) > 0 ? 1 : 0;
  },
);
