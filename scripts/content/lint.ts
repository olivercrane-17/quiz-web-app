/**
 * The content lint's entry point, as ARCHITECTURE §2.3 fixes it:
 * `lintBank(bank, { sealed }): Finding[]`. content:check calls it.
 *
 * The rules themselves live in src/content/pipeline/lint/ (C01 to C25, the X
 * pool rules and the acceptance rule for active items), next to the bank
 * loader they read. Each finding carries its own `sealed` flag, set from the
 * file it is about, so `sealed` here only says that sealed content may be
 * among the findings; reporters hide sealed excerpts unless --reveal.
 */
import type { Bank } from "../../src/content/pipeline/bank.ts";
import {
  lintBank as lintContentBank,
  type Finding,
  type LintOptions,
} from "../../src/content/pipeline/lint/index.ts";

export type { Finding, LintOptions };

export function lintBank(
  bank: Bank,
  options: LintOptions & { sealed?: boolean } = {},
): Finding[] {
  const { sealed: _sealed, ...rest } = options;
  return lintContentBank(bank, rest);
}
