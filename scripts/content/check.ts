/**
 * npm run content:check -- [--batch <id> | --file <path>] [--json] [--sealed]
 *
 * Schema plus lint (C01 to C25 and the X pool checks) over the content bank,
 * and over content/fixtures/ when it exists. Exit 1 on any error (or on any
 * warning with --strict). See content/README.md.
 */
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { loadBank, type Bank } from "../../src/content/pipeline/bank.ts";
import {
  formatFinding,
  parseCli,
  run,
  str,
  summarize,
  todayUtc,
  visibleFinding,
} from "../../src/content/pipeline/cli.ts";
import { batchForItem, parseItemId } from "../../src/content/pipeline/ids.ts";
import {
  keySourceFromProcess,
  loadMasterKey,
} from "../../src/content/pipeline/keys.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import { lintBank, type Finding } from "./lint.ts";

const USAGE = `Usage: npm run content:check -- [options]

  --batch <id>     Only report on one batch (the whole bank is still loaded)
  --file <path>    Only report on one file
  --root <dir>     Bank root (default content/); with --fixtures, a fixture tree
  --fixtures       Treat --root as a fixture tree (fx. ids, plaintext sealed kinds)
  --sealed         Decrypt content/sealed/ in memory instead of reading .sealed-plain/
  --writer <id>    C24: every checked id must come from a batch registered to this writer
  --json           Machine-readable output
  --reveal         Show excerpts of sealed content and both sides of every
                   near-duplicate pair (never in CI or shared logs)
  --strict         Fail on warnings too
  --skip-dedupe    Skip the C22 near-duplicate check
  --today <date>   Date for the freeze rule (default: today, UTC)`;

function belongsToBatch(
  bank: Bank,
  finding: Finding,
  batchId: string,
): boolean {
  if (finding.message.startsWith(`${batchId}:`)) return true;
  if (finding.itemId && bank.register) {
    const parsed = parseItemId(finding.itemId);
    if (parsed && batchForItem(bank.register, parsed)?.batchId === batchId)
      return true;
  }
  const pack = /^r\.(.+)\.b\d{2}$/.exec(batchId)?.[1];
  return (
    pack !== undefined &&
    !finding.itemId &&
    finding.file.endsWith(`/room-packs/${pack}.json`)
  );
}

run("content:check", async () => {
  const values = parseCli(
    "content:check",
    process.argv.slice(2),
    {
      batch: { type: "string" },
      file: { type: "string" },
      root: { type: "string" },
      fixtures: { type: "boolean" },
      sealed: { type: "boolean" },
      writer: { type: "string" },
      json: { type: "boolean" },
      reveal: { type: "boolean" },
      strict: { type: "boolean" },
      "skip-dedupe": { type: "boolean" },
      today: { type: "string" },
    },
    USAGE,
  );
  const repoRoot = findRepoRoot();
  const json = values.json === true;
  const reveal = values.reveal === true;
  const keys = values.sealed
    ? ((await loadMasterKey(keySourceFromProcess()))?.keys ?? null)
    : null;

  const roots: { root: string; fixtures: boolean }[] = [];
  const root = str(values, "root");
  if (root !== undefined) {
    roots.push({ root, fixtures: values.fixtures === true });
  } else {
    roots.push({ root: "content", fixtures: false });
    const batchOrFile = str(values, "batch") ?? str(values, "file");
    if (!batchOrFile && existsSync(join(repoRoot, "content", "fixtures"))) {
      roots.push({ root: "content/fixtures", fixtures: true });
    }
  }

  const all: Finding[] = [];
  const notes: string[] = [];
  let items = 0;
  for (const target of roots) {
    const layout = resolveLayout({
      repoRoot,
      root: target.root,
      fixtures: target.fixtures,
    });
    const bank = await loadBank(layout, {
      sealed: values.sealed === true,
      keys,
    });
    items += bank.items.length;
    notes.push(...bank.notes);
    let findings = lintBank(bank, {
      sealed: values.sealed === true,
      today: str(values, "today") ?? todayUtc(),
      dedupe: values["skip-dedupe"] !== true,
      reveal,
      ...(str(values, "writer")
        ? { writer: str(values, "writer") as string }
        : {}),
    });
    const batchId = str(values, "batch");
    if (batchId)
      findings = findings.filter((finding) =>
        belongsToBatch(bank, finding, batchId),
      );
    const file = str(values, "file");
    if (file) {
      const wanted = relative(repoRoot, resolve(file)).split("\\").join("/");
      findings = findings.filter((finding) => finding.file === wanted);
    }
    all.push(...findings);
  }

  const { errors, warnings } = summarize(all);
  const failed = errors > 0 || (values.strict === true && warnings > 0);
  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: !failed,
          items,
          errors,
          warnings,
          notes,
          findings: all.map((finding) => visibleFinding(finding, reveal)),
        },
        null,
        2,
      ),
    );
  } else {
    for (const finding of all) console.log(formatFinding(finding, reveal));
    for (const note of notes) console.log(`note: ${note}`);
    console.log(
      `content:check: ${items} item(s), ${errors} error(s), ${warnings} warning(s).`,
    );
  }
  return failed ? 1 : 0;
});
