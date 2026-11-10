/**
 * npm run content:dedupe -- [--sealed] [--cross-pool] [--threshold <n>]
 *                           [--item <id>] [--write] [--reveal] [--json] [--strict]
 * npm run content:dedupe -- --cross-pool-ok --daily <id> --item <id>
 *                           --editor <ed-...> --reason <text> [--json]
 *
 * Near-duplicates across the whole bank and the guide's worked examples
 * (C22), and the cross-pool check of ARCHITECTURE §5.2 (X29, AC-CNT-06): no
 * practice or room item may share a fact with a Daily item (CONTENT_GUIDE
 * §10.5, §10.9). X29 runs whenever sealed items are loaded, and each of its
 * findings is an error; a near-duplicate pair is for the editor's call in
 * content:decide. Exit 1 on any X29 finding, or on any pair with --strict.
 *
 * Every report names ids, rule codes, scores and counts only, never item
 * text. A pair with one sealed side (the other a plaintext item or a guide
 * example, whose answers are public) would give the sealed answer away, so
 * without --reveal it is listed under its sealed id only, with no score or
 * reason, in the text and the JSON output alike. On the workspace a pair
 * prints as `0.912  m.geo.0101  m.geo.0103  (reason)` and a pair across the
 * seal as `  -    m.geo.0102  a public item` (content/README.md); each X29
 * finding follows as `error X29 m.geo.0101: ...`, then the counts.
 *
 * Sealed items come from the plaintext workspace (content/.sealed-plain/)
 * by default. --sealed decrypts content/sealed/ in memory instead, with the
 * content key (QZ_CONTENT_KEY or ~/.config/quiz-web-app/content.key), and
 * then everything goes through the redacting reporter (§5.4,
 * scripts/content/lib/report.ts): `error m.geo.0101 X29`, a note or two
 * and the counts. An error thrown while sealed content is open prints one
 * line that says nothing about it. --item, --write, --reveal and
 * --cross-pool-ok are for your own terminal on the workspace, so they
 * refuse --sealed.
 *
 * --item <id> shows the nearest neighbour of one item, and the pairs X29
 * flags for it with each one's judgment. --write records
 * verification.dedupe on checking items that score below the flag
 * threshold (verdict unique); flagged items are left for the editor.
 *
 * --cross-pool-ok (CNT-2b) records an editor's judgment that a flagged
 * pair shares an entity but not a fact: `related_ok`, stored on the sealed
 * Daily item (`verification.crossPool`) with a hash of both items' packet
 * fields, so X29 skips the pair until either item changes
 * (src/content/pipeline/crosspool.ts). It prints the Daily item's id and
 * counts, never the other item next to it. See content/README.md.
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
  crossPoolPairs,
  planJudgment,
  stateCounts,
  type CrossPoolPair,
  type JudgmentState,
} from "../../src/content/pipeline/crosspool.ts";
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
import { crossPoolReport } from "./lib/rules.ts";

const USAGE = `Usage: npm run content:dedupe -- [options]

  --sealed         Decrypt content/sealed/ in memory instead of reading the workspace;
                   every line then goes through the redacting reporter (§5.4)
  --cross-pool     Only the cross-pool check (X29): Daily items against practice and room items
  --threshold <n>  Report pairs scoring at least n (default ${DEDUPE_FLAG})
  --item <id>      Show the nearest neighbour of one item and the pairs X29 flags for it
  --write          Record verification.dedupe (verdict unique) on checking items below the threshold
  --reveal         Name both sides of pairs between a sealed item and a public one
                   (your own terminal only, never CI or shared logs)
  --skip-guide     Leave the guide's examples out
  --root <dir>     Bank root (default content/)
  --fixtures       Treat --root as a fixture tree
  --strict         Fail on warnings too
  --json           Machine-readable output

  --cross-pool-ok  Record an editor's related_ok on one pair X29 flags: the two share an
                   entity, not a fact. Stored on the sealed Daily item; X29 skips the pair
                   until either item changes. Needs the workspace (refuses --sealed), with:
    --daily <id>   The Daily item (a mystery or an encore) the judgment lives on
    --item <id>    The practice item or room question it is judged against
    --editor <id>  The editor (ed-...): never a run that wrote, checked or estimated either item
    --reason <text>  Why the two state different facts`;

/** Options --cross-pool-ok takes; anything else refuses it. */
const JUDGMENT_OPTIONS = new Set([
  "cross-pool-ok",
  "daily",
  "item",
  "editor",
  "reason",
  "json",
  "root",
  "fixtures",
]);

const show = (id: string) => id.replace(/^guide:/, "guide example ");

const STATE_TEXT: Record<JudgmentState, string> = {
  holds: "related_ok holds",
  lapsed: "related_ok lapsed (an item changed)",
  invalid: "related_ok invalid (its editor wrote, checked or estimated one)",
  none: "no judgment",
};

/** "3 flagged: 1 judged related_ok, 1 lapsed, 1 unjudged". */
function pairCounts(pairs: readonly CrossPoolPair[]): string {
  const counts = stateCounts(pairs);
  const parts = [`${counts.holds} judged related_ok`];
  if (counts.lapsed > 0) parts.push(`${counts.lapsed} lapsed`);
  if (counts.invalid > 0) parts.push(`${counts.invalid} invalid`);
  parts.push(`${counts.none} unjudged`);
  return `${pairs.length} flagged: ${parts.join(", ")}`;
}

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
        "cross-pool-ok": { type: "boolean" },
        daily: { type: "string" },
        editor: { type: "string" },
        reason: { type: "string" },
      },
      USAGE,
    );
    sealedRun = values.sealed === true;
    const judging = values["cross-pool-ok"] === true;
    if (
      sealedRun &&
      (values.item !== undefined ||
        values.write === true ||
        values.reveal === true ||
        judging)
    ) {
      console.error(
        "content:dedupe: --item, --write, --reveal and --cross-pool-ok read the plaintext workspace in your own terminal; they do not run with --sealed.",
      );
      return 2;
    }
    if (judging) {
      const extra = Object.keys(values).filter(
        (key) => values[key] !== undefined && !JUDGMENT_OPTIONS.has(key),
      );
      if (extra.length > 0) {
        console.error(
          `content:dedupe: --cross-pool-ok records one judgment and takes only --daily, --item, --editor, --reason, --json, --root and --fixtures, not --${extra.join(", --")}.\n\n${USAGE}`,
        );
        return 2;
      }
      const missing = ["daily", "item", "editor", "reason"].filter(
        (key) => (str(values, key) ?? "") === "",
      );
      if (missing.length > 0) {
        console.error(
          `content:dedupe: --cross-pool-ok needs --${missing.join(", --")}.\n\n${USAGE}`,
        );
        return 2;
      }
    } else {
      const strays = ["daily", "editor", "reason"].filter(
        (key) => values[key] !== undefined,
      );
      if (strays.length > 0) {
        console.error(
          `content:dedupe: --${strays.join(", --")} ${strays.length === 1 ? "goes" : "go"} with --cross-pool-ok only.\n\n${USAGE}`,
        );
        return 2;
      }
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

    if (judging) {
      // The judgment lives on the sealed Daily item. What prints names that
      // item and counts, never the other item beside it (§5.4).
      const editor = str(values, "editor") ?? "";
      const plan = planJudgment(bank, {
        dailyId: str(values, "daily") ?? "",
        itemId: str(values, "item") ?? "",
        editor,
        reason: str(values, "reason") ?? "",
        at: nowUtc(),
      });
      await saveItems(bank, new Map([[plan.dailyId, plan.item]]));
      const what =
        plan.otherPool === "room" ? "a room question" : "a practice item";
      if (json) {
        console.log(
          JSON.stringify(
            {
              ok: true,
              dailyId: plan.dailyId,
              decision: "related_ok",
              by: editor,
              against: plan.otherPool,
              replaced: plan.replaced,
              judgments: plan.judgments,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(
          `${plan.dailyId}: related_ok recorded by ${editor} against ${what}${plan.replaced ? ", replacing the pair's earlier judgment" : ""}. X29 skips the pair until either item changes; ${plan.dailyId} holds ${plan.judgments} judgment(s).`,
        );
        if (layout.kind === "content")
          console.log(
            "The Daily item changed in the plaintext workspace: run npm run content:seal before committing the envelopes.",
          );
      }
      return 0;
    }

    const { index, positions } = bankDedupeIndex(
      bank,
      values["skip-guide"] !== true,
    );
    const sealedIds = new Set(
      bank.items
        .filter((record) => record.file.sealed)
        .map((record) => record.id),
    );
    const crossPoolRan =
      bank.sealedSource !== "none" && layout.kind === "content";

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
      const lines: string[] = [];
      let report: Record<string, unknown>;
      if (crosses && !reveal) {
        // Name no public item next to a sealed one.
        if (sealed) {
          report = { itemId: one, nearest: "a public item", hidden: true };
          lines.push(
            `${one}: nearest is a public item (a practice item or a guide example); pass --reveal to see it`,
          );
        } else {
          // A plaintext item: its nearest public neighbour, and whether a
          // sealed one scores at or above the threshold.
          const nearestPublic = nearestTo(index, position, isPublicEntry);
          const sealedAbove = match.score >= threshold;
          report = {
            itemId: one,
            ...nearestPublic,
            sealedNeighbourAtOrAbove: sealedAbove,
          };
          lines.push(
            `${one}: nearest public ${show(String(nearestPublic.nearestId))} score ${nearestPublic.score.toFixed(3)} (${nearestPublic.reason})${sealedAbove ? `; a sealed item scores at or above ${threshold}, pass --reveal to see it` : ""}`,
          );
        }
      } else {
        report = { itemId: one, ...match };
        lines.push(
          `${one}: nearest ${show(String(match.nearestId))} score ${match.score.toFixed(3)} (${match.reason})`,
        );
      }
      // The pairs X29 flags for this item, with each judgment. A pair with
      // a practice item crosses the seal, so only --reveal names it; a room
      // question and a Daily item are both sealed.
      if (crossPoolRan) {
        const mine = crossPoolPairs(bank).filter(
          (pair) => pair.dailyId === one || pair.otherId === one,
        );
        const nameable =
          reveal || mine.every((pair) => pair.otherPool === "room");
        report.crossPool = {
          flagged: mine.length,
          ...stateCounts(mine),
          ...(nameable
            ? {
                pairs: mine.map((pair) => ({
                  dailyId: pair.dailyId,
                  itemId: pair.otherId,
                  score: pair.score,
                  reason: pair.reason,
                  judgment: pair.state,
                })),
              }
            : {}),
        };
        if (mine.length > 0) {
          lines.push(
            `X29 for ${one}: ${pairCounts(mine)}${nameable ? "" : "; pass --reveal to name them"}`,
          );
          if (nameable)
            for (const pair of mine)
              lines.push(
                `  ${pair.score.toFixed(3)}  ${pair.dailyId}  ${pair.otherId}  (${pair.reason})  ${STATE_TEXT[pair.state]}`,
              );
        }
      }
      console.log(json ? JSON.stringify(report, null, 2) : lines.join("\n"));
      return 0;
    }

    const notes = [...bank.notes];

    // X29 (AC-CNT-06): the check content:check runs, reported on the sealed side.
    const sharedPath = join(repoRoot, "src", "config", "shared.json");
    const shared = (
      existsSync(sharedPath) ? JSON.parse(readFileSync(sharedPath, "utf8")) : {}
    ) as { dailyEpoch?: unknown };
    const x29 = crossPoolReport(bank, {
      today: todayUtc(),
      launch: false,
      epoch: typeof shared.dailyEpoch === "string" ? shared.dailyEpoch : "",
      compositions: null,
      histories: null,
      dedupe: true,
    });
    const crossPool = x29?.findings ?? [];
    const judged = stateCounts(x29?.pairs ?? []);
    if (!crossPoolRan)
      notes.push(
        layout.kind === "fixtures"
          ? "Cross-pool check: not run on a fixture tree (X29 runs on the content layout only)."
          : "Cross-pool check: not run, because no sealed Daily items are loaded.",
      );
    else {
      if (judged.holds > 0)
        notes.push(
          `Cross-pool check: ${judged.holds} flagged pair(s) skipped under an editor's related_ok.`,
        );
      if (judged.lapsed + judged.invalid > 0)
        notes.push(
          `Cross-pool check: ${judged.lapsed + judged.invalid} related_ok judgment(s) no longer stand (${judged.lapsed} lapsed when an item changed, ${judged.invalid} by a run that wrote, checked or estimated one of the two), so X29 reports those pairs again.`,
        );
    }

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
    }

    if (sealedRun) {
      // Decrypted content: the redacting reporter's three-part lines only.
      const findings: ReportFinding[] = [...crossPool];
      for (const pair of pairs) {
        const itemId = pair.crossesSeal ? (pair.sealedId ?? pair.a) : pair.a;
        findings.push({
          rule: "C22",
          severity: "warn",
          file: bank.itemsById.get(itemId)?.file.rel ?? layout.root,
          itemId,
          message: "near-duplicate pair",
          sealed: sealedIds.has(itemId),
        });
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
          extra: {
            pairs: pairs.length,
            crossPool: crossPool.length,
            crossPoolJudged: judged.holds,
            crossPoolLapsed: judged.lapsed + judged.invalid,
          },
        },
        { redact: true, reveal: false, json },
      );
    }

    // The workspace: the pair list content/README.md shows, then X29.
    const failed =
      crossPool.length > 0 || (values.strict === true && pairs.length > 0);
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: !failed,
            indexed: positions.size,
            threshold,
            pairs: shown,
            crossPoolRan,
            crossPool: crossPool.map((finding) => ({
              itemId: finding.itemId ?? null,
              rule: finding.rule,
              message: finding.message,
            })),
            crossPoolJudged: judged.holds,
            crossPoolLapsed: judged.lapsed + judged.invalid,
            written,
            leftForEditor: left,
            notes,
          },
          null,
          2,
        ),
      );
    } else {
      for (const pair of shown) {
        console.log(
          "hidden" in pair
            ? `  -    ${pair.sealedId}  a public item  (pass --reveal to see the pair)`
            : `${pair.score.toFixed(3)}  ${pair.a}  ${show(pair.b)}  (${pair.reason})`,
        );
      }
      for (const finding of crossPool)
        console.log(
          `error ${finding.rule} ${finding.itemId ?? finding.file}: ${finding.message}`,
        );
      for (const note of notes) console.log(`note: ${note}`);
      console.log(
        `content:dedupe: ${positions.size} item(s) indexed, ${pairs.length} pair(s) at or above ${threshold}.`,
      );
      if (crossPoolRan)
        console.log(
          `content:dedupe: ${crossPool.length} Daily item(s) share a fact with a practice or room item (X29).`,
        );
      if (values.write)
        console.log(
          `content:dedupe: recorded dedupe on ${written} item(s); ${left.length} flagged item(s) left for the editor.`,
        );
    }
    return failed ? 1 : 0;
  },
);
