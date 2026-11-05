/**
 * npm run content:dedupe -- [--sealed] [--cross-pool] [--threshold <n>]
 *                           [--item <id>] [--write] [--reveal] [--json] [--strict]
 *
 * Near-duplicates across the whole bank and the guide's worked examples
 * (C22), and the cross-pool check of ARCHITECTURE §5.2 (X29, AC-CNT-06): no
 * practice or room item may share a fact with a Daily item (CONTENT_GUIDE
 * §10.5, §10.9). X29 runs whenever sealed items are loaded, and each of its
 * findings is an error; a near-duplicate pair is a warning for the editor's
 * call in content:decide. Exit 1 on any error, or any warning with --strict.
 *
 * Every report names ids, rule codes and counts only, never item text. A
 * pair with one sealed side (the other a plaintext item or a guide example,
 * whose answers are public) would give the sealed answer away, so without
 * --reveal it is reported under its sealed id only, with no score or
 * reason, in the text and the JSON output alike.
 *
 * Sealed items come from the plaintext workspace (content/.sealed-plain/)
 * by default. --sealed decrypts content/sealed/ in memory instead, with the
 * content key (QZ_CONTENT_KEY or ~/.config/quiz-web-app/content.key), and
 * then everything goes through the redacting reporter (§5.4,
 * scripts/content/lib/report.ts): `error m.geo.0101 X29`, a note or two
 * and the counts. An error thrown while sealed content is open prints one
 * line that says nothing about it. --item, --write and --reveal are for
 * your own terminal on the workspace, so they refuse --sealed.
 *
 * --item <id> shows the nearest neighbour of one item. --write records
 * verification.dedupe on checking items that score below the flag
 * threshold (verdict unique); flagged items are left for the editor. See
 * content/README.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadBank } from "../../src/content/pipeline/bank.ts";
import {
  nowUtc,
  parseCli,
  str,
  todayUtc,
} from "../../src/content/pipeline/cli.ts";
import {
  DEDUPE_FLAG,
  dedupeRecordFor,
  flaggedPairs,
  isPublicEntry,
  nearestTo,
} from "../../src/content/pipeline/dedupe.ts";
import { cloneJson } from "../../src/content/pipeline/json.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import { bankDedupeIndex } from "../../src/content/pipeline/lint/index.ts";
import { saveItems } from "../../src/content/pipeline/store.ts";
import type { AnyItem } from "../../src/content/schema/items.ts";
import { keySourceFromProcess, loadMasterKey } from "./crypto.ts";
import { printReport, runReported, type ReportFinding } from "./lib/report.ts";
import { crossPoolRules } from "./lib/rules.ts";

const USAGE = `Usage: npm run content:dedupe -- [options]

  --sealed         Decrypt content/sealed/ in memory instead of reading the workspace;
                   every line then goes through the redacting reporter (§5.4)
  --cross-pool     Only the cross-pool check (X29): Daily items against practice and room items
  --threshold <n>  Report pairs scoring at least n (default ${DEDUPE_FLAG})
  --item <id>      Show the nearest neighbour of one item
  --write          Record verification.dedupe (verdict unique) on checking items below the threshold
  --reveal         Name both sides of pairs between a sealed item and a public one
                   (your own terminal only, never CI or shared logs)
  --skip-guide     Leave the guide's examples out
  --root <dir>     Bank root (default content/)
  --fixtures       Treat --root as a fixture tree
  --strict         Fail on warnings too
  --json           Machine-readable output`;

const show = (id: string) => id.replace(/^guide:/, "guide example ");

let sealedRun = false;

runReported(
  "content:dedupe",
  () => sealedRun,
  async () => {
    const values = parseCli(
      "content:dedupe",
      process.argv.slice(2),
      {
        sealed: { type: "boolean" },
        "cross-pool": { type: "boolean" },
        threshold: { type: "string" },
        item: { type: "string" },
        write: { type: "boolean" },
        reveal: { type: "boolean" },
        "skip-guide": { type: "boolean" },
        root: { type: "string" },
        fixtures: { type: "boolean" },
        strict: { type: "boolean" },
        json: { type: "boolean" },
      },
      USAGE,
    );
    sealedRun = values.sealed === true;
    if (
      sealedRun &&
      (values.item !== undefined ||
        values.write === true ||
        values.reveal === true)
    ) {
      console.error(
        "content:dedupe: --item, --write and --reveal read the plaintext workspace in your own terminal; they do not run with --sealed.",
      );
      return 2;
    }
    const threshold = Number(str(values, "threshold") ?? DEDUPE_FLAG);
    if (!(threshold > 0 && threshold <= 1))
      throw new Error("--threshold is a number above 0 and at most 1");
    const reveal = values.reveal === true;
    const json = values.json === true;
    const repoRoot = findRepoRoot();
    const layout = resolveLayout({
      repoRoot,
      root: str(values, "root") ?? "content",
      fixtures: values.fixtures === true,
    });
    const keys = sealedRun
      ? ((await loadMasterKey(keySourceFromProcess()))?.keys ?? null)
      : null;
    const bank = await loadBank(layout, { sealed: sealedRun, keys });
    const { index, positions } = bankDedupeIndex(
      bank,
      values["skip-guide"] !== true,
    );
    const sealedIds = new Set(
      bank.items
        .filter((record) => record.file.sealed)
        .map((record) => record.id),
    );

    const one = str(values, "item");
    if (one) {
      const position = positions.get(one);
      if (position === undefined)
        throw new Error(
          `${one} is not an indexed item (cut and retired items are skipped)`,
        );
      const sealed = sealedIds.has(one);
      const match = nearestTo(index, position);
      const crosses = sealed !== match.nearestSealed;
      if (crosses && !reveal) {
        // Name no public item next to a sealed one.
        if (sealed) {
          console.log(
            json
              ? JSON.stringify(
                  { itemId: one, nearest: "a public item", hidden: true },
                  null,
                  2,
                )
              : `${one}: nearest is a public item (a practice item or a guide example); pass --reveal to see it`,
          );
          return 0;
        }
        // A plaintext item: its nearest public neighbour, and whether a
        // sealed one scores at or above the threshold.
        const nearestPublic = nearestTo(index, position, isPublicEntry);
        const sealedAbove = match.score >= threshold;
        console.log(
          json
            ? JSON.stringify(
                {
                  itemId: one,
                  ...nearestPublic,
                  sealedNeighbourAtOrAbove: sealedAbove,
                },
                null,
                2,
              )
            : `${one}: nearest public ${show(String(nearestPublic.nearestId))} score ${nearestPublic.score.toFixed(3)} (${nearestPublic.reason})${sealedAbove ? `; a sealed item scores at or above ${threshold}, pass --reveal to see it` : ""}`,
        );
        return 0;
      }
      console.log(
        json
          ? JSON.stringify({ itemId: one, ...match }, null, 2)
          : `${one}: nearest ${show(String(match.nearestId))} score ${match.score.toFixed(3)} (${match.reason})`,
      );
      return 0;
    }

    const fileOf = (id: string) =>
      bank.itemsById.get(id)?.file.rel ?? layout.root;
    const findings: ReportFinding[] = [];
    const notes = [...bank.notes];

    // X29 (AC-CNT-06): the check content:check runs, reported on the sealed side.
    const sharedPath = join(repoRoot, "src", "config", "shared.json");
    const shared = (
      existsSync(sharedPath) ? JSON.parse(readFileSync(sharedPath, "utf8")) : {}
    ) as { dailyEpoch?: unknown };
    const crossPool = crossPoolRules(bank, {
      today: todayUtc(),
      launch: false,
      epoch: typeof shared.dailyEpoch === "string" ? shared.dailyEpoch : "",
      compositions: null,
      histories: null,
      dedupe: true,
    });
    findings.push(...crossPool);
    if (bank.sealedSource === "none" || layout.kind !== "content")
      notes.push(
        "Cross-pool check: not run, because no sealed Daily items are loaded.",
      );

    const pairs =
      values["cross-pool"] === true ? [] : flaggedPairs(index, threshold);
    const shown = pairs.map((pair) =>
      pair.crossesSeal && !reveal
        ? {
            sealedId: pair.sealedId ?? "",
            other: "a public item",
            crossesSeal: true,
            hidden: true as const,
          }
        : pair,
    );
    for (const pair of pairs) {
      const hidden = pair.crossesSeal && !reveal;
      const itemId = pair.crossesSeal ? (pair.sealedId ?? pair.a) : pair.a;
      const other = itemId === pair.a ? pair.b : pair.a;
      findings.push({
        rule: "C22",
        severity: "warn",
        file: fileOf(itemId),
        itemId,
        message: hidden
          ? "near-duplicate of a public item (pass --reveal to see the pair)"
          : `score ${pair.score.toFixed(3)} with ${show(other)} (${pair.reason})`,
        sealed: sealedIds.has(itemId),
      });
    }

    let written = 0;
    const left: string[] = [];
    if (values.write) {
      const checkedAt = nowUtc();
      const updates = new Map<string, AnyItem>();
      for (const record of bank.items) {
        const position = positions.get(record.id);
        if (
          position === undefined ||
          record.item.status !== "checking" ||
          !record.item.verification
        )
          continue;
        const match = nearestTo(index, position);
        if (match.score >= DEDUPE_FLAG) {
          left.push(record.id);
          continue;
        }
        const item = cloneJson(record.item);
        if (!item.verification) continue;
        item.verification.dedupe = dedupeRecordFor(
          record.file.sealed,
          match,
          checkedAt,
          "unique",
        );
        updates.set(record.id, item);
      }
      if (updates.size > 0) await saveItems(bank, updates);
      written = updates.size;
      notes.push(
        `Recorded dedupe on ${written} item(s); ${left.length} flagged item(s) left for the editor.`,
      );
    }
    notes.push(
      `${positions.size} item(s) indexed, ${pairs.length} near-duplicate pair(s), ${crossPool.length} item(s) sharing a fact across pools.`,
    );

    return printReport(
      {
        command: "content:dedupe",
        items: positions.size,
        findings,
        notes,
        strict: values.strict === true,
        extra: sealedRun
          ? { pairs: pairs.length, crossPool: crossPool.length }
          : {
              threshold,
              pairs: shown,
              crossPool: crossPool.length,
              written,
              leftForEditor: left,
            },
      },
      { redact: sealedRun, reveal, json },
    );
  },
);
