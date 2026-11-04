/**
 * CNT-2's rules (CONTENT_GUIDE §2.13): the ones the pipeline's lint
 * (src/content/pipeline/lint/, C01 to C25 and the X rules) didn't have, and
 * the parts of its rules that read the reference files CNT-2 adds.
 *
 * | Rule | What this adds                                                      |
 * | ---- | ------------------------------------------------------------------- |
 * | C04  | The warning at exactly 24 characters (the pipeline starts at 25)    |
 * | C15  | Measured encores: 1 in 10 per batch, 12 in the bank (units.json)    |
 * | C17  | `exactDates`: a near-tie of years passes when both exact days are   |
 * |      | 365 or more apart and each label claim states its day               |
 * | C19  | Rebuilt on superlatives.json, with §2.13's three exemptions         |
 * | C22  | A sealed near-copy of a guide example, and the example denylist     |
 * | C26  | The risk floor                                                      |
 * | C27  | The capital rule (capitals-excluded.json)                           |
 * | C28  | Clue-4 option display parity, labelled as the server labels them    |
 *
 * `scripts/content/lint.ts` merges these with the pipeline's findings and
 * drops the ones they supersede (`superseded`).
 *
 * **Severity by status.** A rule new in CNT-2 must not turn content red
 * that was accepted before it existed (CNT-1 set the same policy for its
 * own additions), so on an `active` item its findings are warnings, and
 * `--launch` (QA-2's launch check) makes them errors again. `cut` and
 * `retired` items never ship and are never checked again, so these rules
 * skip them. The risk floor (C26) decides which claims the checks must back
 * with external evidence, so it bites from `checking` on: on a draft it is a
 * warning, which the writer's selfCheck `claims` code answers before
 * submitting (§9.3), and fixture trees, whose claims are never checked, skip
 * it. Every other new error is an error on drafts too.
 */
import type { AnyItem, Mystery } from "../../../src/content/schema/items.ts";
import type { Bank, BankItem } from "../../../src/content/pipeline/bank.ts";
import { applyLintAllow } from "../../../src/content/pipeline/lint/index.ts";
import type {
  Finding,
  RuleHit,
  Severity,
} from "../../../src/content/pipeline/lint/types.ts";
import { excludedCountries, ruleC27 } from "./capitals.ts";
import { nearTieDates } from "./comparisons.ts";
import { measuredEncoreHits } from "./encores.ts";
import { deniedExampleHits, guideCopies, type GuideCopy } from "./examples.ts";
import { optionAtGridLimit } from "./lengths.ts";
import { ruleC28 } from "./options.ts";
import { loadLintReferences, type LintReferences } from "./reference.ts";
import { ruleC26 } from "./risk-floor.ts";
import { ruleC19 } from "./superlatives.ts";

export { loadLintReferences, type LintReferences } from "./reference.ts";

/** The rules CNT-2 adds or extends, for documentation and tests. */
export const CNT2_RULES: Record<string, { severity: string; summary: string }> =
  {
    C04: {
      severity: "warn",
      summary:
        "An option of exactly 24 characters warns too: the desktop grid needs every option under 24",
    },
    C15: {
      severity: "error",
      summary:
        "Measured encores (a length, area, mass or speed unit from units.json): one per ten in a batch, 12 in the bank",
    },
    C17: {
      severity: "error, warn",
      summary:
        "Two years under 10 apart need exactDates at least 365 days apart and label claims that state each day",
    },
    C19: {
      severity: "warn",
      summary:
        "A superlative from superlatives.json, 'first' or 'only' with no high-risk claim behind it",
    },
    C22: {
      severity: "error, warn",
      summary:
        "A sealed near-copy of a guide example, or a sealed mystery answer or encore value from example-denylist.json",
    },
    C26: {
      severity: "error",
      summary:
        "The risk floor: a claim with a number, quotation, superlative, only, first, invented, named after, comes from or means, the key of a counterintuitive item, or a sealed clue, value or input claim is high",
    },
    C27: {
      severity: "error",
      summary:
        "'Capital' beside a country from capitals-excluded.json, or in a clue whose mystery answer is one",
    },
    C28: {
      severity: "error",
      summary:
        "The four clue-4 options, labelled as the server labels them, agree on brackets and qualifiers",
    },
  };

/** Rules introduced by CNT-2: their findings warn on active items (see above). */
const NEW_RULES = new Set(["C26", "C27", "C28"]);

export interface Cnt2Options {
  /** QA-2's launch check: findings on active items are errors too. */
  launch?: boolean;
  /** Run the guide near-copy check of C22 (default true; it builds a dedupe index). */
  dedupe?: boolean;
  /** Include the guide's worked examples in C22 (default true). */
  guide?: boolean;
}

export interface Cnt2Result {
  findings: Finding[];
  /**
   * True for a pipeline finding these rules replace: every X02 (now C28)
   * and C19 (rebuilt here), C17's near-tie refusal where exactDates meets
   * the guard, and C22's warning where the guide near-copy error stands.
   */
  supersedes(finding: Finding): boolean;
}

/** A hit with CNT-2's mark on additions to older rules (C15, C17, C22). */
export interface Cnt2Hit extends RuleHit {
  /** True for a CNT-2 addition to a rule the pipeline already had. */
  added?: boolean;
}

/** The pipeline C17 finding that refuses every near-tie of years. */
const NEAR_TIE_REFUSAL = "dates under 10 years apart";

/**
 * The severity a CNT-2 hit carries for an item's status, or null when the
 * rule skips the item (see the module comment).
 */
export function severityFor(
  hit: Cnt2Hit,
  record: BankItem,
  fixtures: boolean,
  launch: boolean,
): Severity | null {
  const status = record.item.status;
  if (status === "cut" || status === "retired") return null;
  if (hit.rule === "C26" && fixtures) return null;
  if (launch) return hit.severity;
  const added = NEW_RULES.has(hit.rule) || hit.added === true;
  if (status === "active" && added) return "warn";
  if (hit.rule === "C26" && status === "draft") return "warn";
  return hit.severity;
}

function finding(record: BankItem, hit: RuleHit, severity: Severity): Finding {
  const out: Finding = {
    rule: hit.rule,
    severity,
    file: record.file.rel,
    itemId: record.id,
    message: hit.message,
    sealed: record.file.sealed,
  };
  const path =
    record.index === undefined
      ? hit.path
      : `questions[${record.index}]${hit.path ? `.${hit.path}` : ""}`;
  if (path) out.path = path;
  if (hit.excerpt !== undefined) out.excerpt = hit.excerpt;
  return out;
}

const mark = (hits: RuleHit[]): Cnt2Hit[] =>
  hits.map((hit) => ({ ...hit, added: true }));

/** Every CNT-2 hit for one item, before lintAllow and the status policy. */
export function cnt2ItemHits(
  bank: Bank,
  record: BankItem,
  refs: LintReferences,
  context: {
    countries: ReturnType<typeof excludedCountries>;
    measured: Map<string, RuleHit[]>;
    copies: Map<string, GuideCopy>;
  },
): { hits: Cnt2Hit[]; nearTiePasses: boolean } {
  const item: AnyItem = record.item;
  const hits: Cnt2Hit[] = [
    ...optionAtGridLimit(item),
    ...ruleC19(item, refs.superlatives),
    ...ruleC26(item, refs.superlatives),
    ...ruleC27(item, context.countries),
    ...mark(context.measured.get(record.id) ?? []),
  ];
  const nearTie = nearTieDates(item);
  if (nearTie) hits.push(...mark(nearTie.hits));
  if ("kind" in item && item.kind === "mystery")
    hits.push(...ruleC28(bank, item as Mystery));
  if (record.file.sealed) {
    hits.push(...mark(deniedExampleHits(item, refs)));
    const copy = context.copies.get(record.id);
    if (copy) hits.push({ ...copy.hit, added: true });
  }
  return { hits, nearTiePasses: nearTie?.passes === true };
}

/** CNT-2's findings for a whole bank, and what they supersede. */
export function cnt2Findings(
  bank: Bank,
  options: Cnt2Options = {},
  refs: LintReferences = loadLintReferences(bank.layout.referenceDir),
): Cnt2Result {
  const launch = options.launch === true;
  const fixtures = bank.layout.kind === "fixtures";
  const findings: Finding[] = [];
  const nearTiesPassing = new Set<string>();

  for (const problem of refs.problems) {
    const out: Finding = {
      rule: "C01",
      severity: "error",
      file: problem.file.replace(`${bank.layout.repoRoot}/`, ""),
      message: problem.message,
      sealed: false,
    };
    if (problem.path) out.path = problem.path;
    findings.push(out);
  }

  const context = {
    countries: excludedCountries(bank, refs.capitals),
    measured: measuredEncoreHits(bank, refs.measured),
    copies:
      options.dedupe === false || options.guide === false
        ? new Map<string, GuideCopy>()
        : guideCopies(bank),
  };
  for (const record of bank.items) {
    const { hits, nearTiePasses } = cnt2ItemHits(bank, record, refs, context);
    if (nearTiePasses) nearTiesPassing.add(record.id);
    // applyLintAllow filters, so the hits it keeps are the same objects.
    for (const hit of applyLintAllow(record.item, hits) as Cnt2Hit[]) {
      const severity = severityFor(hit, record, fixtures, launch);
      if (severity !== null) findings.push(finding(record, hit, severity));
    }
  }
  const copies = context.copies;
  return {
    findings,
    supersedes(f: Finding): boolean {
      if (f.rule === "X02" || f.rule === "C19") return true;
      const id = f.itemId ?? "";
      if (f.rule === "C17")
        return (
          nearTiesPassing.has(id) &&
          f.path?.endsWith("values") === true &&
          f.message.startsWith(NEAR_TIE_REFUSAL)
        );
      if (f.rule === "C22")
        return copies.get(id)?.samePair === true && f.severity === "warn";
      return false;
    },
  };
}
