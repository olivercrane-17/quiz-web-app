/**
 * npm run content:batch -- <status|open|ids|submit|close|incident> [options]
 *
 * Manages content/batches.json, the batch register (CONTENT_GUIDE §11.3),
 * and issues item ids. See content/README.md.
 */
import { loadBank } from "../../src/content/pipeline/bank.ts";
import {
  parseCli,
  requireStr,
  run,
  str,
  todayUtc,
} from "../../src/content/pipeline/cli.ts";
import { voidBatchChecks } from "../../src/content/pipeline/incidents.ts";
import { writeJsonFile } from "../../src/content/pipeline/json.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import {
  batchItems,
  idRange,
  issueIds,
  openBatch,
  requireBatch,
  searchBudget,
} from "../../src/content/pipeline/register.ts";
import { searchUse } from "../../src/content/pipeline/records.ts";
import { saveItems } from "../../src/content/pipeline/store.ts";
import {
  BatchRegisterSchema,
  type BatchRegister,
} from "../../src/content/schema/batches.ts";
import { lintBank } from "./lint.ts";

const USAGE = `Usage: npm run content:batch -- <command> [options]

  status [--batch <id>] [--json]                   The register, or one batch in detail
  open --batch <id> --writer <w-...|lb-...> [--target <n>]
                                                   Planned -> open; prints the id range
  ids --batch <id> --writer <id> --count <n>        Issue the next n ids to the writer
  submit --batch <id> --writer <id>                Lint gate and self-check, then submitted
  close --batch <id>                               Every item accepted or cut; counts recorded
  incident --batch <id> --kind <fabricated_source|audit_failure|other> --note <text>
                                                   fabricated_source voids the checks of every item
                                                   not yet active and bars their checkers (§9.6)

  Common: --root <dir> (default content/), --fixtures`;

const COMMANDS = new Set([
  "status",
  "open",
  "ids",
  "submit",
  "close",
  "incident",
]);

run("content:batch", async () => {
  const argv = process.argv.slice(2);
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "status";
  if (!COMMANDS.has(command)) {
    console.error(`content:batch: unknown command ${command}\n\n${USAGE}`);
    return 2;
  }
  const values = parseCli(
    "content:batch",
    argv[0] === command ? argv.slice(1) : argv,
    {
      batch: { type: "string" },
      writer: { type: "string" },
      target: { type: "string" },
      count: { type: "string" },
      kind: { type: "string" },
      note: { type: "string" },
      root: { type: "string" },
      fixtures: { type: "boolean" },
      json: { type: "boolean" },
    },
    USAGE,
  );
  const layout = resolveLayout({
    repoRoot: findRepoRoot(),
    root: str(values, "root") ?? "content",
    fixtures: values.fixtures === true,
  });
  const bank = await loadBank(layout);
  if (!bank.register)
    throw new Error(
      `no valid batch register at ${layout.registerFile}; run npm run content:check`,
    );
  const register: BatchRegister = bank.register;
  const save = async () =>
    writeJsonFile(layout.registerFile, BatchRegisterSchema.parse(register));

  if (command === "status") {
    const batchId = str(values, "batch");
    const batches = batchId ? [requireBatch(bank, batchId)] : register.batches;
    const rows = batches.map((batch) => {
      const items = batchItems(bank, batch.batchId);
      const count = (status: string) =>
        items.filter((record) => record.item.status === status).length;
      const range = idRange(register, batch);
      return {
        batchId: batch.batchId,
        pool: batch.pool,
        status: batch.status,
        writer: batch.writer,
        target: batch.plan.target,
        draft: batch.plan.draft,
        drafted: items.length,
        checking: count("checking"),
        active: count("active"),
        cut: count("cut"),
        lastSequence: batch.lastSequence,
        range: range ? `${range.first} to ${range.last}` : null,
        searches: searchUse(bank, batch),
      };
    });
    if (values.json) {
      console.log(
        JSON.stringify(
          batchId
            ? {
                ...rows[0],
                plan: batches[0]?.plan,
                incidents: batches[0]?.incidents,
              }
            : rows,
          null,
          2,
        ),
      );
      return 0;
    }
    for (const row of rows) {
      console.log(
        `${row.batchId.padEnd(26)} ${row.status.padEnd(9)} ${String(row.writer ?? "-").padEnd(14)} target ${String(row.target).padStart(3)}  drafted ${String(row.drafted).padStart(3)}  active ${String(row.active).padStart(3)}  cut ${String(row.cut).padStart(3)}  ids to ${row.lastSequence}`,
      );
    }
    if (batchId && rows[0]) {
      const batch = batches[0];
      console.log(`plan: ${JSON.stringify(batch?.plan)}`);
      console.log(
        `ids: ${rows[0].range ?? "list batch: entities use x.<type>.<slug> or dataset QIDs"}`,
      );
      console.log(
        `searches: ${rows[0].searches.used} of ${rows[0].searches.budget}`,
      );
    }
    return 0;
  }

  const batchId = requireStr(values, "batch", USAGE);

  if (command === "open") {
    const writer = requireStr(values, "writer", USAGE);
    const target = str(values, "target");
    const batch = openBatch(register, batchId, {
      writer,
      ...(target ? { target: Number(target) } : {}),
    });
    await save();
    const range = idRange(register, batch);
    console.log(
      `${batchId} is open for ${writer}. Target ${batch.plan.target}, draft about ${batch.plan.draft}.`,
    );
    console.log(
      range
        ? `Ids: ${range.first} to ${range.last}. Take them with: npm run content:batch -- ids --batch ${batchId} --writer ${writer} --count <n>`
        : "List batch: entities use x.<type>.<slug> ids or QIDs copied from datasets (§2.12).",
    );
    console.log(
      `WebSearch cap for the batch: ${searchBudget(batch)} (§9.5.2).`,
    );
    return 0;
  }

  if (command === "ids") {
    const writer = requireStr(values, "writer", USAGE);
    const count = Number(requireStr(values, "count", USAGE));
    const ids = issueIds(register, batchId, writer, count);
    await save();
    console.log(values.json ? JSON.stringify(ids) : ids.join("\n"));
    return 0;
  }

  const batch = requireBatch(bank, batchId);

  if (command === "submit") {
    const writer = requireStr(values, "writer", USAGE);
    if (batch.status !== "open")
      throw new Error(`${batchId} is ${batch.status}, not open`);
    if (batch.writer !== writer)
      throw new Error(
        `${batchId} is registered to ${String(batch.writer)}, not ${writer}`,
      );
    const items = batchItems(bank, batchId);
    const problems: string[] = [];
    if (items.length === 0 && batch.pool !== "list")
      problems.push("the batch has no items");
    const findings = lintBank(bank, {
      today: todayUtc(),
      writer,
      dedupe: false,
    });
    const ids = new Set(items.map((record) => record.id));
    const errors = findings.filter(
      (finding) =>
        finding.severity === "error" &&
        finding.itemId &&
        ids.has(finding.itemId),
    );
    if (errors.length > 0)
      problems.push(
        `${errors.length} lint error(s); run npm run content:check -- --batch ${batchId}`,
      );
    const noNotes = items.filter(
      (record) =>
        record.item.status === "draft" && !record.item.writerNotes?.trim(),
    );
    if (noNotes.length > 0)
      problems.push(
        `writerNotes missing on ${noNotes.map((record) => record.id).join(", ")} (the §9.3 self-check)`,
      );
    if (problems.length > 0)
      throw new Error(
        `cannot submit ${batchId}:\n  - ${problems.join("\n  - ")}`,
      );
    batch.status = "submitted";
    await save();
    console.log(
      `${batchId} submitted with ${items.length} item(s). Next: npm run content:packet -- --batch ${batchId} --pass A (and B).`,
    );
    return 0;
  }

  if (command === "close") {
    if (batch.pool === "list") {
      // A list batch closes on its entities, recorded by their source (§2.10).
      const entities = [
        ...(bank.lists.get(batch.answerType ?? "country")?.entities.values() ??
          []),
      ].filter((entity) => entity.source.startsWith(batchId));
      batch.accepted = entities.filter((e) => e.status === "active").length;
      batch.cut = entities.filter((e) => e.status === "retired").length;
    } else {
      const items = batchItems(bank, batchId);
      const open = items.filter(
        (record) =>
          record.item.status === "draft" || record.item.status === "checking",
      );
      if (open.length > 0)
        throw new Error(
          `${open.length} item(s) are still draft or checking: ${open.map((r) => r.id).join(", ")}`,
        );
      batch.accepted = items.filter(
        (record) => record.item.status === "active",
      ).length;
      batch.cut = items.filter((record) => record.item.status === "cut").length;
    }
    batch.status = "closed";
    await save();
    console.log(
      `${batchId} closed: ${batch.accepted} accepted (target ${batch.plan.target}), ${batch.cut} cut.`,
    );
    return 0;
  }

  // incident
  const kind = requireStr(values, "kind", USAGE);
  if (
    kind !== "fabricated_source" &&
    kind !== "audit_failure" &&
    kind !== "other"
  )
    throw new Error("--kind is fabricated_source, audit_failure or other");
  const note = requireStr(values, "note", USAGE);
  if (kind !== "fabricated_source") {
    batch.incidents.push({ date: todayUtc(), kind, note });
    await save();
    console.log(`${batchId}: incident recorded.`);
    return 0;
  }
  // A fabricated source fails the whole batch: fresh checkers re-check every
  // item (§9.6). The register is written first, so the checkers are barred
  // even if voiding the items' checks fails; running the command again then
  // finishes the job.
  const voided = voidBatchChecks(bank, batchId);
  batch.incidents.push({
    date: todayUtc(),
    kind,
    note,
    checkers: voided.checkers,
  });
  await save();
  if (voided.updates.size > 0) await saveItems(bank, voided.updates);
  console.log(
    `${batchId}: fabricated-source incident recorded. Checks voided on ${voided.updates.size} item(s); ${voided.checkers.length} checker(s) may not check this batch again: ${voided.checkers.join(", ") || "none"}.`,
  );
  console.log(
    `Next: build fresh packets (content:packet -- --batch ${batchId} --pass A, then B) for new checker runs.`,
  );
  if (voided.active.length > 0)
    console.log(
      `${voided.active.length} item(s) were already active and keep their checks; re-check them under §9.10: ${voided.active.join(", ")}.`,
    );
  return 0;
});
