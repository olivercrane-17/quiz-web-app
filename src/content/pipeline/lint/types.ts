/**
 * Findings and the context every lint rule receives.
 */
import type { AnyItem } from "../../schema/items.ts";
import type { Bank, BankItem } from "../bank.ts";

export type Severity = "error" | "warn";

export interface Finding {
  /** C01 to C25 from CONTENT_GUIDE §2.13, or an X rule (pool checks). */
  rule: string;
  severity: Severity;
  /** Repository-relative file. */
  file: string;
  itemId?: string;
  /** The field, such as stem, wrong[1] or clues[0]. */
  path?: string;
  /** Safe to print anywhere: never quotes sealed content or a slur. */
  message: string;
  /**
   * The offending text, when there is one. Reporters show it only for
   * plaintext content, or for sealed content with --reveal.
   */
  excerpt?: string;
  /** True for findings about sealed content. */
  sealed: boolean;
}

/** A finding a rule produced, before file and item details are added. */
export interface RuleHit {
  rule: string;
  severity: Severity;
  path?: string;
  message: string;
  excerpt?: string;
  /** The text the hit is about, for lintAllow matching. */
  match?: string;
  /** The whole field value, for lintAllow matching. */
  field?: string;
  /**
   * An error a lintAllow may waive although its rule is not in
   * WAIVABLE_ERRORS (C17's near-tie dates, where the editor states both
   * exact days).
   */
  waivable?: boolean;
}

export interface LintContext {
  bank: Bank;
  /** C24: the writer whose batches these must be. */
  writer?: string;
  /** ISO date used for the freeze rule. */
  today: string;
}

export interface ItemRuleInput {
  ctx: LintContext;
  record: BankItem;
  item: AnyItem;
}

/** Rules whose errors an editor may waive with lintAllow (false positives are inherent). */
export const WAIVABLE_ERRORS = new Set(["C06", "C08", "C09"]);

export const LINT_VERSION = "1.1";

/** Every rule the lint knows, with its default severity, for docs and tests. */
export const RULES: Record<string, { severity: string; summary: string }> = {
  C01: { severity: "error", summary: "Schema valid for its file type" },
  C02: {
    severity: "error",
    summary: "Explanation of 35 words or fewer (rooms: warn above 25)",
  },
  C03: {
    severity: "error",
    summary:
      "Stem of 120 characters or fewer, 100 in rooms; an mc stem ends with ?; encore question of 120 or fewer",
  },
  C04: {
    severity: "error, warn",
    summary:
      "Option over 60 characters (30 in rooms) is an error, over 24 a warning; comparison labels of 40 or fewer",
  },
  C05: {
    severity: "error",
    summary: "All/none of the above, both or neither as an option",
  },
  C06: {
    severity: "error, warn",
    summary:
      "not, never, except or isn't in a stem or statement; warning in clues",
  },
  C07: {
    severity: "error",
    summary: "Answer longest by more than 50% and more than 15 characters",
  },
  C08: {
    severity: "error",
    summary: "Numeric dates such as 03/04/2025 or 2025-04-03",
  },
  C09: {
    severity: "error",
    summary: "Time words: current, latest, now, today, recent and the rest",
  },
  C10: {
    severity: "warn",
    summary: "US or -ise spelling outside the proper-noun allowlist",
  },
  C11: {
    severity: "error",
    summary:
      "En or em dash, double or trailing space, URL, HTML, Markdown (single asterisks too) or emoji",
  },
  C12: {
    severity: "error, warn",
    summary: "Clue over 140 characters, or giving the answer away",
  },
  C13: {
    severity: "error",
    summary: "Clue 4 contains a significant word of the answer's display form",
  },
  C14: {
    severity: "error",
    summary:
      "Mystery entities exist, are active and not replaced; distractors distinct; freeze",
  },
  C15: {
    severity: "error",
    summary:
      "Encore answer, years, decimals, size, bands, units and unit forms; a derivation reproduces unrounded and rounds inside the bullseye",
  },
  C16: {
    severity: "error",
    summary: "tfKind matches the answer; no question mark",
  },
  C17: {
    severity: "error, warn",
    summary:
      "Comparison answer wins under its relation; separation guard (dates under 10 years apart need a C17 lintAllow)",
  },
  C18: {
    severity: "error",
    summary: "Ascending options start with a number; no duplicate options",
  },
  C19: {
    severity: "warn",
    summary: "Superlative or first without any high-risk claim",
  },
  C20: { severity: "warn", summary: "The bare word football" },
  C21: {
    severity: "error in encores, warn elsewhere",
    summary: "Ambiguous units; °C or °F in an encore",
  },
  C22: {
    severity: "warn",
    summary: "Near-duplicate of an item in the bank or the guide",
  },
  C23: { severity: "error", summary: "A term on the shared slur list" },
  C24: {
    severity: "error",
    summary: "Id pattern, registered batch and writer, no reserved example ids",
  },
  C25: {
    severity: "warn",
    summary: "A claim resembling content/reference/myths.json",
  },
  X01: {
    severity: "warn",
    summary: "Mystery answer type outside its category's types (§1)",
  },
  X02: {
    severity: "warn",
    summary: "Clue-4 display forms not parallel (§2.10 rule 6, §5.5)",
  },
  X03: {
    severity: "warn",
    summary: "True/false split in a batch off by more than one (§2.5)",
  },
  X04: {
    severity: "warn, error once closed",
    summary: "Room pack does not hold exactly 15 questions in play (§2.9)",
  },
  X05: { severity: "warn", summary: "Room pack template (§10.9)" },
  X06: {
    severity: "warn",
    summary: "Year encores above the batch's share (§6 rule 9, §11.4)",
  },
  X07: {
    severity: "warn",
    summary:
      "More than 10% true/false among a category's active items (ARCHITECTURE §5.2)",
  },
  X08: {
    severity: "warn",
    summary:
      "No claim with role explanation: list the explanation's facts, or record a lintAllow when it states none (§9.2)",
  },
  X09: {
    severity: "error",
    summary:
      "A shipped answer list over 80 KB gzipped in its client projection (ARCHITECTURE §5.5)",
  },
  X10: {
    severity: "error",
    summary: "Schedule rounds name active items of the right kind",
  },
  X11: {
    severity: "error",
    summary: "Mystery round difficulty matches its slot",
  },
  X12: {
    severity: "error",
    summary:
      "A Daily's mysteries span three categories and three answer types (§10.3)",
  },
  X13: {
    severity: "error",
    summary: "Repeats: items within 365 days, answers within 60 days (§10.5)",
  },
  X14: { severity: "error", summary: "Scheduled items are global (§10.3)" },
  X33: {
    severity: "error",
    summary:
      'A comparison of mass, length or area asks a bare "bigger": the stem names the measure (§2.6, §12.6; RITE round 2, R2-15)',
  },
  X34: {
    severity: "warn",
    summary:
      "More than 40% of a pool's ascending keys at one display position, once it ships 5 or more (§4 rule 7; RITE round 2, R2-23)",
  },
};
