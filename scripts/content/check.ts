/**
 * npm run content:check -- [--batch <id> | --file <path>] [--json] [--sealed] [--launch]
 *
 * Every level of ARCHITECTURE §5.2 over the content bank, and over
 * content/fixtures/ when it exists: the schemas and CNT-2's lint (C01 to
 * C28 and the X pool checks, scripts/content/lint.ts), CNT-1's cross-file
 * rules (scripts/content/lib/rules.ts: items, lists against git history,
 * the pool and the schedule), the sealed files the bank leaves out
 * (challenge packs, list requests), and the drift check: every output of
 * `content:build` rebuilt in memory and compared with what is committed
 * (§5.3, §5.7), with the per-pack and per-list size budgets.
 *
 * With --sealed, sealed content is decrypted in memory and every line goes
 * through the redacting reporter (§5.4): ids, rule codes, field paths and
 * counts only. The content tree's audit records are checked too (the
 * latest pre-launch one's AC-CNT-05 criteria, X32), and with sealed items
 * loaded, the cross-pool dedupe (X29, AC-CNT-06). --launch makes QA-2's
 * launch criteria (AC-CNT-01 to 06) and CNT-2's rules on active items
 * errors. Exit 1 on any error (or on any warning with --strict). See
 * content/README.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { loadBank, type Bank } from "../../src/content/pipeline/bank.ts";
import { parseCli, str, todayUtc } from "../../src/content/pipeline/cli.ts";
import { batchForItem, parseItemId } from "../../src/content/pipeline/ids.ts";
import {
  keySourceFromProcess,
  loadMasterKey,
} from "../../src/content/pipeline/keys.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import { compareOutputs } from "./lib/files.ts";
import { listHistory, type ListHistory } from "./lib/git.ts";
import { loadBuildInputs } from "./lib/inputs.ts";
import { MANIFEST_PATH, buildOutputs } from "./lib/outputs.ts";
import { printReport, runReported } from "./lib/report.ts";
import { cnt1Findings } from "./lib/rules.ts";
import { sealedExtras } from "./lib/sealed-files.ts";
import { auditFindings, auditSources } from "./audit.ts";
import { lintBank, type Finding } from "./lint.ts";

const USAGE = `Usage: npm run content:check -- [options]

  --batch <id>     Only report on one batch (the whole bank is still loaded)
  --file <path>    Only report on one file
  --root <dir>     Bank root (default content/); with --fixtures, a fixture tree
  --fixtures       Treat --root as a fixture tree (fx. ids, plaintext sealed kinds)
  --sealed         Decrypt content/sealed/ in memory instead of reading .sealed-plain/;
                   every line then goes through the redacting reporter (§5.4)
  --launch         QA-2's launch check: AC-CNT-01 to 04 and 06 become errors
  --writer <id>    C24: every checked id must come from a batch registered to this writer
  --json           Machine-readable output
  --reveal         Show excerpts of sealed content and both sides of every
                   near-duplicate pair (never in CI or shared logs)
  --strict         Fail on warnings too
  --skip-dedupe    Skip the C22 near-duplicate check
  --skip-drift     Skip rebuilding the generated outputs and comparing them
  --today <date>   Date for the freeze rule and the runway (default: today, UTC)`;

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

function readJson(path: string): unknown {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as unknown)
    : null;
}

const order = (a: Finding, b: Finding) =>
  a.file.localeCompare(b.file) ||
  (a.itemId ?? "").localeCompare(b.itemId ?? "") ||
  a.rule.localeCompare(b.rule) ||
  (a.path ?? "").localeCompare(b.path ?? "");

let sealedRun = false;

runReported(
  "content:check",
  () => sealedRun,
  async () => {
    const values = parseCli(
      "content:check",
      process.argv.slice(2),
      {
        batch: { type: "string" },
        file: { type: "string" },
        root: { type: "string" },
        fixtures: { type: "boolean" },
        sealed: { type: "boolean" },
        launch: { type: "boolean" },
        writer: { type: "string" },
        json: { type: "boolean" },
        reveal: { type: "boolean" },
        strict: { type: "boolean" },
        "skip-dedupe": { type: "boolean" },
        "skip-drift": { type: "boolean" },
        today: { type: "string" },
      },
      USAGE,
    );
    sealedRun = values.sealed === true;
    const repoRoot = findRepoRoot();
    const json = values.json === true;
    const reveal = values.reveal === true;
    const keys = sealedRun
      ? ((await loadMasterKey(keySourceFromProcess()))?.keys ?? null)
      : null;
    const today = str(values, "today") ?? todayUtc();
    const compositions = readJson(
      join(repoRoot, "content", "compositions.json"),
    );
    const shared = (readJson(join(repoRoot, "src", "config", "shared.json")) ??
      {}) as { dailyEpoch?: unknown };
    const epoch =
      typeof shared.dailyEpoch === "string" ? shared.dailyEpoch : "2026-09-21";

    const roots: { root: string; fixtures: boolean; standard: boolean }[] = [];
    const root = str(values, "root");
    const batchOrFile = str(values, "batch") ?? str(values, "file");
    if (root !== undefined) {
      roots.push({ root, fixtures: values.fixtures === true, standard: false });
    } else {
      roots.push({ root: "content", fixtures: false, standard: true });
      if (!batchOrFile && existsSync(join(repoRoot, "content", "fixtures"))) {
        roots.push({
          root: "content/fixtures",
          fixtures: true,
          standard: true,
        });
      }
    }

    const all: Finding[] = [];
    const notes: string[] = [];
    let items = 0;
    const loaded: { content: Bank | null; fixtures: Bank | null } = {
      content: null,
      fixtures: null,
    };
    for (const target of roots) {
      const layout = resolveLayout({
        repoRoot,
        root: target.root,
        fixtures: target.fixtures,
      });
      const bank = await loadBank(layout, { sealed: sealedRun, keys });
      if (target.standard) {
        if (layout.kind === "content") loaded.content = bank;
        else loaded.fixtures = bank;
      }
      items += bank.items.length;
      notes.push(...bank.notes);
      let findings = lintBank(bank, {
        sealed: sealedRun,
        today,
        dedupe: values["skip-dedupe"] !== true,
        reveal,
        // QA-2's launch check: CNT-2's rules are errors on active items too.
        launch: values.launch === true,
        ...(str(values, "writer")
          ? { writer: str(values, "writer") as string }
          : {}),
      });
      // Lists' liveAt and addedIn against git history (§5.2): the real
      // content tree only, whose history is the repository's.
      let histories: Map<string, ListHistory> | null = null;
      if (target.standard && layout.kind === "content") {
        histories = new Map();
        for (const list of bank.lists.values()) {
          histories.set(list.file.rel, listHistory(repoRoot, list.file.rel));
        }
      }
      findings.push(
        ...cnt1Findings(
          bank,
          {
            today,
            launch: values.launch === true,
            epoch,
            compositions,
            histories,
            dedupe: values["skip-dedupe"] !== true,
          },
          notes,
        ),
        ...(await sealedExtras(bank, { sealed: sealedRun, keys, compositions }))
          .findings,
      );
      // The seeded audit's records (§5.7, AC-CNT-05, CONTENT_GUIDE §9.10):
      // every record against its schema, and the latest pre-launch one's
      // criteria, warnings before launch and errors with --launch. Sealed,
      // so a --sealed run reads the envelopes and the reporter redacts.
      if (target.standard && layout.kind === "content") {
        findings.push(
          ...auditFindings(auditSources(layout, { sealed: sealedRun, keys }), {
            launch: values.launch === true,
          }),
        );
      }
      findings.sort(order);
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

    // The drift check (§5.3, §5.7): rebuild every output in memory and
    // compare. Plaintext runs over the standard trees only.
    const drift =
      !sealedRun &&
      root === undefined &&
      !batchOrFile &&
      values["skip-drift"] !== true &&
      loaded.content !== null;
    if (drift && loaded.content !== null) {
      if (!existsSync(join(repoRoot, MANIFEST_PATH))) {
        notes.push(
          `Generated outputs not checked: ${MANIFEST_PATH} does not exist here (run npm run content:build).`,
        );
      } else {
        const result = await buildOutputs(
          await loadBuildInputs(repoRoot, {
            bank: loaded.content,
            fixtures: loaded.fixtures,
          }),
        );
        for (const problem of result.problems) {
          all.push({ ...problem, severity: "error" });
        }
        const differences = await compareOutputs(repoRoot, result.outputs);
        const say = (path: string, what: string) =>
          all.push({
            rule: "X31",
            severity: "error",
            file: path,
            message: `${what}: run npm run content:build and commit the result (ARCHITECTURE §5.3)`,
            sealed: false,
          });
        for (const path of differences.changed)
          say(path, "differs from what content:build writes");
        for (const path of differences.missing)
          say(path, "is missing; content:build writes it");
        for (const path of differences.stale)
          say(path, "is stale; content:build no longer writes it");
      }
    }

    return printReport(
      {
        command: "content:check",
        items,
        findings: all,
        notes,
        strict: values.strict === true,
      },
      { redact: sealedRun, reveal, json },
    );
  },
);
