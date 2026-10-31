/**
 * npm run content:dedupe -- [--threshold 0.5] [--item <id>] [--write] [--reveal] [--json]
 *
 * Near-duplicate detection across the whole bank and the guide's worked
 * examples (C22). Prints ids and scores only, never item text. A pair with
 * one sealed side (the other a plaintext item or a guide example, whose
 * answers are public) would give the sealed answer away, so without
 * --reveal it is listed under its sealed id only, with no score or reason,
 * in the text and the JSON output alike. With --write, records
 * verification.dedupe on checking items that score below the flag threshold
 * (verdict unique); flagged items are left for the editor's call in
 * content:decide. See content/README.md.
 */
import { loadBank } from "../../src/content/pipeline/bank.ts";
import { nowUtc, parseCli, run, str } from "../../src/content/pipeline/cli.ts";
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

const USAGE = `Usage: npm run content:dedupe -- [options]

  --threshold <n>  Report pairs scoring at least n (default ${DEDUPE_FLAG})
  --item <id>      Show the nearest neighbour of one item
  --write          Record verification.dedupe (verdict unique) on checking items below the threshold
  --reveal         Name both sides of pairs between a sealed item and a public one
                   (your own terminal only, never CI or shared logs)
  --skip-guide     Leave the guide's examples out
  --root <dir>     Bank root (default content/)
  --fixtures       Treat --root as a fixture tree
  --json           Machine-readable output`;

const show = (id: string) => id.replace(/^guide:/, "guide example ");

run("content:dedupe", async () => {
  const values = parseCli(
    "content:dedupe",
    process.argv.slice(2),
    {
      threshold: { type: "string" },
      item: { type: "string" },
      write: { type: "boolean" },
      reveal: { type: "boolean" },
      "skip-guide": { type: "boolean" },
      root: { type: "string" },
      fixtures: { type: "boolean" },
      json: { type: "boolean" },
    },
    USAGE,
  );
  const threshold = Number(str(values, "threshold") ?? DEDUPE_FLAG);
  if (!(threshold > 0 && threshold <= 1))
    throw new Error("--threshold is a number above 0 and at most 1");
  const reveal = values.reveal === true;
  const layout = resolveLayout({
    repoRoot: findRepoRoot(),
    root: str(values, "root") ?? "content",
    fixtures: values.fixtures === true,
  });
  const bank = await loadBank(layout);
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
          values.json
            ? JSON.stringify(
                { itemId: one, nearest: "a public item", hidden: true },
                null,
                2,
              )
            : `${one}: nearest is a public item (a practice item or a guide example); pass --reveal to see it`,
        );
        return 0;
      }
      // A plaintext item: its nearest public neighbour, and whether a sealed
      // one scores at or above the threshold.
      const nearestPublic = nearestTo(index, position, isPublicEntry);
      const sealedAbove = match.score >= threshold;
      console.log(
        values.json
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
      values.json
        ? JSON.stringify({ itemId: one, ...match }, null, 2)
        : `${one}: nearest ${show(String(match.nearestId))} score ${match.score.toFixed(3)} (${match.reason})`,
    );
    return 0;
  }

  const pairs = flaggedPairs(index, threshold);
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

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          indexed: positions.size,
          threshold,
          pairs: shown,
          written,
          leftForEditor: left,
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
    console.log(
      `content:dedupe: ${positions.size} item(s) indexed, ${pairs.length} pair(s) at or above ${threshold}.`,
    );
    if (values.write)
      console.log(
        `content:dedupe: recorded dedupe on ${written} item(s); ${left.length} flagged item(s) left for the editor.`,
      );
  }
  return 0;
});
