/**
 * What may stop `content:build` (ARCHITECTURE §5.8: "Validate, then write
 * every output"). Only content that ships can: active practice items, the
 * answer lists, the categories and composition layouts, and the whole
 * fixture tree, which mock builds and the mock backend ship. A draft in
 * progress, or a sealed item in the plaintext workspace, never blocks a
 * pack build; `content:check` still reports it.
 */
import type { Bank, BankFile } from "../../../src/content/pipeline/bank.ts";
import { lintBank, type Finding } from "../lint.ts";
import type { LoadedBanks } from "./inputs.ts";
import type { ReportFinding } from "./report.ts";

function rawStatus(file: BankFile | undefined): unknown {
  const data = file?.data;
  return typeof data === "object" && data !== null
    ? (data as { status?: unknown }).status
    : undefined;
}

/** True when an error finding is about something the build ships. */
export function shipsFrom(bank: Bank, finding: Finding): boolean {
  if (bank.layout.kind === "fixtures") return true;
  const file = finding.file;
  if (
    file === "content/categories.json" ||
    file === "content/compositions.json" ||
    file.startsWith("content/answer-lists/")
  ) {
    return true;
  }
  if (!file.startsWith("content/practice/")) return false;
  const record =
    finding.itemId === undefined
      ? undefined
      : bank.itemsById.get(finding.itemId);
  if (record) return record.item.status === "active";
  // A file that failed its schema: it ships if it says it is active.
  return rawStatus(bank.files.find((f) => f.rel === file)) === "active";
}

export function blockingFindings(banks: LoadedBanks): ReportFinding[] {
  const out: ReportFinding[] = [];
  for (const bank of [banks.bank, banks.fixtures]) {
    if (bank === null) continue;
    for (const finding of lintBank(bank, { dedupe: false })) {
      if (finding.severity === "error" && shipsFrom(bank, finding))
        out.push(finding);
    }
  }
  return out;
}
