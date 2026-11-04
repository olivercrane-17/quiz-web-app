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
import {
  recordsBy,
  voidBatchChecks,
  voidCheckerRecords,
} from "../../src/content/pipeline/incidents.ts";
import { writeJsonFile } from "../../src/content/pipeline/json.ts";
import {
  findRepoRoot,
  resolveLayout,
} from "../../src/content/pipeline/layout.ts";
import {
  anyAgentRun,
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
import { agentId } from "../../src/content/schema/primitives.ts";
import { PASSES, type Pass } from "../../src/content/schema/verification.ts";
import { lintBank } from "./lint.ts";

const USAGE = `Usage: npm run content:batch -- <command> [options]

  status [--batch <id>] [--json]                   The register, or one batch in detail
  open --batch <id> --writer <w-...|lb-...> [--target <n>]
                                                   Planned -> open; prints the id range
  ids --batch <id> --writer <id> --count <n>        Issue the next n ids to the writer
  submit --batch <id> --writer <id>                Lint gate and self-check, then submitted
  close --batch <id>                               Every item accepted or cut; counts recorded
  incident --batch <id> --kind <fabricated_source|invalid_check|audit_failure|other>
           --note <text> [--checker <fc-...>]
                                                   fabricated_source voids the checks of every item
                                                   not yet active and bars their checkers (§9.6);
                                                   invalid_check needs --checker: it voids that one
                                                   checker's records on every item, active ones too,
                                                   reopens those items and bars the checker

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
      checker: { type: "string" },
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
    kind !== "invalid_check" &&
    kind !== "audit_failure" &&
    kind !== "other"
  )
    throw new Error(
      "--kind is fabricated_source, invalid_check, audit_failure or other",
    );
  const note = requireStr(values, "note", USAGE);
  if (kind === "invalid_check") {
    // One checker's records were not real checks: void them on every item of
    // the batch, active ones included, and bar that checker. The register is
    // written first, so the checker is barred even if saving the items
    // fails; running the command again finishes the job, without a second
    // incident.
    const checker = requireStr(values, "checker", USAGE);
    if (!agentId("fc").safeParse(checker).success)
      throw new Error(
        `--checker is a checker's agent id (fc-<run id>), not ${checker}`,
      );
    // Sealed items are read from and written to the plaintext workspace
    // (a fixture tree holds them as plain files instead).
    const sealed =
      layout.kind === "content" &&
      batch.pool !== "practice" &&
      batch.pool !== "list";
    const items = batchItems(bank, batchId);
    const already = batch.incidents.some(
      (incident) =>
        incident.kind === "invalid_check" &&
        anyAgentRun(checker, incident.checkers ?? []),
    );
    if (
      !already &&
      !items.some((record) => recordsBy(record.item, checker).length > 0)
    )
      throw new Error(
        `${checker} has no A, B or T record on any item of ${batchId}, so nothing was recorded; check the id${sealed ? " (sealed items are read from content/.sealed-plain/: run npm run content:unseal first)" : ""}`,
      );
    const voided = voidCheckerRecords(bank, batchId, checker);
    // Which passes each voided item lost, read before the items are saved.
    const lost = new Map<Pass, string[]>();
    for (const record of items) {
      if (!voided.updates.has(record.id)) continue;
      for (const check of recordsBy(record.item, checker))
        lost.set(check.pass, [...(lost.get(check.pass) ?? []), record.id]);
    }
    const history = items.filter(
      (record) =>
        (record.item.status === "cut" || record.item.status === "retired") &&
        recordsBy(record.item, checker).length > 0,
    ).length;
    // Reopened items need checks and decisions again. accepted and cut keep
    // the last close's counts until the batch closes again.
    const reopenBatch = batch.status === "closed" && voided.updates.size > 0;
    if (!already)
      batch.incidents.push({
        date: todayUtc(),
        kind,
        note,
        checkers: [checker],
      });
    if (reopenBatch) batch.status = "checking";
    if (!already || reopenBatch) await save();
    if (voided.updates.size > 0) await saveItems(bank, voided.updates);

    console.log(
      already
        ? `${batchId}: ${checker} is already barred by an invalid_check incident; voiding what is left.`
        : `${batchId}: invalid_check incident recorded; ${checker} may not check this batch again.`,
    );
    if (voided.voided === 0)
      console.log(`No record by ${checker} left to void.`);
    else {
      console.log(
        `Voided ${voided.voided} record(s) by ${checker} on ${voided.updates.size} item(s):`,
      );
      for (const pass of PASSES) {
        const ids = lost.get(pass);
        if (ids) console.log(`  pass ${pass}: ${ids.join(", ")}`);
      }
    }
    if (voided.reopened.length > 0)
      console.log(
        `Reopened ${voided.reopened.length} active item(s), whose accept no longer stands: ${voided.reopened.join(", ")}.`,
      );
    if (history > 0)
      console.log(
        `${history} cut or retired item(s) keep ${checker}'s records as history.`,
      );
    if (reopenBatch)
      console.log(
        `${batchId} was closed and is checking again; accepted and cut keep their counts until the next close.`,
      );
    if (voided.updates.size > 0) {
      console.log("Next steps:");
      console.log("  1. Build a fresh packet for each voided pass:");
      for (const pass of PASSES) {
        const ids = lost.get(pass);
        if (ids)
          console.log(
            `     npm run content:packet -- --batch ${batchId} --pass ${pass} --items ${ids.join(",")}`,
          );
      }
      console.log(
        `  2. A fresh checker run checks each packet and records it under a NEW checker id (content:record refuses ${checker} for this batch):`,
      );
      for (const pass of PASSES) {
        if (lost.has(pass))
          console.log(
            `     npm run content:record -- --batch ${batchId} --pass ${pass} --file <records.json>`,
          );
      }
      console.log(
        `  3. Once the new records are in, the editor decides ${voided.reopened.length > 0 ? "the reopened items" : "these items"} and closes the batch:`,
      );
      console.log(
        `     npm run content:decide -- --batch ${batchId} --file <decisions.json>`,
      );
      console.log(`     npm run content:batch -- close --batch ${batchId}`);
      if (sealed)
        console.log(
          "Sealed items changed in the plaintext workspace: run npm run content:seal before committing the envelopes.",
        );
    }
    return 0;
  }
  if (str(values, "checker") !== undefined)
    throw new Error("--checker goes with --kind invalid_check only");
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
