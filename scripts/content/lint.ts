/**
 * The content lint's entry point, as ARCHITECTURE §2.3 fixes it:
 * `lintBank(bank, { sealed }): Finding[]`. content:check, content:build,
 * content:batch and content:packets call it.
 *
 * CONTENT_GUIDE §2.13, rule for rule, comes from two places:
 *
 * - src/content/pipeline/lint/: C01 to C25, the X pool rules and the
 *   acceptance rule for active items, next to the bank loader they read
 *   (the content workstream's lint, kept as working code);
 * - scripts/content/lint/ (CNT-2): the risk floor (C26), the capital rule
 *   (C27), option display parity (C28, superseding X02), C19 rebuilt on
 *   content/reference/superlatives.json, and the parts of C15, C17 and C22
 *   that read units.json, exactDates and example-denylist.json.
 *
 * This file runs both and drops the pipeline findings CNT-2's rules
 * replace. Each finding carries its own `sealed` flag, set from the file it
 * is about, so `sealed` here only says that sealed content may be among the
 * findings; reporters hide sealed excerpts unless --reveal, and a sealed run
 * prints through the redacting reporter (scripts/content/lib/report.ts).
 */
import type { Bank } from "../../src/content/pipeline/bank.ts";
import {
  RULES as PIPELINE_RULES,
  lintBank as lintContentBank,
  type Finding,
  type LintOptions,
} from "../../src/content/pipeline/lint/index.ts";
import { CNT2_RULES, cnt2Findings } from "./lint/index.ts";

export type { Finding, LintOptions };

export interface LintBankOptions extends LintOptions {
  /** Sealed content may be among the findings (they say so one by one). */
  sealed?: boolean;
  /**
   * QA-2's launch check (`content:check -- --launch`): CNT-2's rules report
   * as errors on active items too, instead of warnings.
   */
  launch?: boolean;
}

const joined = (rule: string) =>
  `${PIPELINE_RULES[rule]?.summary ?? ""}; ${CNT2_RULES[rule]?.summary ?? ""}`;

/** Every rule the lint knows, with its severity and summary, C26 to C28 included. */
export const RULES: Record<string, { severity: string; summary: string }> = {
  ...PIPELINE_RULES,
  ...CNT2_RULES,
  C15: { severity: "error", summary: joined("C15") },
  C17: { severity: "error, warn", summary: joined("C17") },
  C22: { severity: "error, warn", summary: joined("C22") },
};

const order = (a: Finding, b: Finding) =>
  a.file.localeCompare(b.file) ||
  (a.itemId ?? "").localeCompare(b.itemId ?? "") ||
  a.rule.localeCompare(b.rule) ||
  (a.path ?? "").localeCompare(b.path ?? "");

export function lintBank(bank: Bank, options: LintBankOptions = {}): Finding[] {
  const { sealed: _sealed, launch, ...rest } = options;
  const base = lintContentBank(bank, rest);
  const cnt2 = cnt2Findings(bank, {
    launch: launch === true,
    dedupe: rest.dedupe !== false,
    guide: rest.guide !== false,
  });
  return [
    ...base.filter((finding) => !cnt2.supersedes(finding)),
    ...cnt2.findings,
  ].sort(order);
}
