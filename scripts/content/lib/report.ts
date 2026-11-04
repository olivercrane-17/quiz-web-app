/**
 * The one redacting reporter (ARCHITECTURE §5.4). Every content command
 * that decrypts sealed content reports through it, so a run in the public
 * `content-sealed` job's logs prints item ids, rule codes, field paths and
 * counts, and never a clue, key, entity name, alias, number or diff:
 *
 *     error m.film.0107 C12 clues[1]
 *     content:check: 412 item(s), 1 error(s), 0 warning(s).
 *
 * A redacting run replaces every message with the rule's fixed title (the
 * JSON report keeps the same keys), drops excerpts, and turns any thrown
 * error, zod issue or assertion into one line that says nothing about the
 * content. A plaintext run keeps the pipeline's long form, with sealed
 * excerpts hidden unless --reveal (src/content/pipeline/cli.ts).
 */
import {
  formatFinding,
  visibleFinding,
} from "../../../src/content/pipeline/cli.ts";

export interface ReportFinding {
  rule: string;
  severity: "error" | "warn";
  file: string;
  itemId?: string;
  path?: string;
  message: string;
  excerpt?: string;
  sealed: boolean;
}

/**
 * Fixed, content-free titles: what a redacting run prints in place of a
 * message. Rules not listed get the generic title.
 */
export const RULE_TITLES: Readonly<Record<string, string>> = {
  C01: "schema, file layout or acceptance rule (§2, §9.9)",
  C02: "explanation length (§7)",
  C03: "stem or question length (§3.8)",
  C04: "option length (§2.4)",
  C05: "all or none of the above (§2.4)",
  C06: "negation (§3.6)",
  C07: "the key is the longest option (§4)",
  C08: "numeric date (§3.3)",
  C09: "time word (§3.4)",
  C10: "spelling (§3.3)",
  C11: "typography (§2.1)",
  C12: "clue gives the answer away (§5.2)",
  C13: "clue 4 names the answer (§5.5)",
  C14: "answer-list coverage or freeze (§2.10)",
  C15: "encore value, unit or bands (§6)",
  C16: "true/false kind (§2.5)",
  C17: "comparison values or separation (§2.6)",
  C18: "option order or duplicates (§2.4)",
  C19: "superlative without a high-risk claim (§3.5)",
  C20: "football (§3.3)",
  C21: "ambiguous unit (§6)",
  C22: "near-duplicate (§9.9)",
  C23: "slur list (PRD §3.9.4)",
  C24: "id, batch or reserved example id (§2.12)",
  C25: "known myth (§9.1)",
  C26: "risk floor (§9.2)",
  C27: "capital rule (§3.4)",
  C28: "clue-4 option display parity (§2.10)",
  X01: "answer type outside its category (§1)",
  X02: "the answer alone carries a qualifier (§2.10)",
  X03: "true/false balance (§2.5)",
  X04: "room pack size (§2.9)",
  X05: "room pack template (§10.9)",
  X06: "year encores (§6)",
  X07: "true/false share (ARCHITECTURE §5.2)",
  X08: "explanation claim (§9.2)",
  X09: "answer-list size (ARCHITECTURE §5.5)",
  X10: "schedule round names an item (§10.1)",
  X11: "schedule slot (§10.2)",
  X12: "schedule categories and answer types (§10.3)",
  X13: "schedule repeats (§10.5)",
  X14: "schedule region (§10.3)",
  X15: "answer-list liveAt and addedIn (§2.10)",
  X16: "answer-list display rule (§2.10)",
  X17: "answer-list minimum (PRD §3.18.4)",
  X18: "build output or pack budget (ARCHITECTURE §5.3)",
  X19: "practice pool at launch (PRD §3.18.2)",
  X20: "schedule coverage (§10.7)",
  X21: "schedule assembly window (§10.2)",
  X22: "schedule spread within a Daily (§10.3)",
  X23: "schedule spread within a week (§10.4)",
  X24: "recent answer as a distractor (§10.5)",
  X25: "share layout (ARCHITECTURE §4.9)",
  X26: "runway (§10.7)",
  X27: "scheduled on or after reviewBy (§9.9)",
  X28: "pass D before freezing or listing (§9.9)",
  X29: "cross-pool shared fact (§10.5)",
  X30: "spare order (§10.7)",
  X31: "generated output drift (ARCHITECTURE §5.3)",
};

export const GENERIC_TITLE = "content rule (see content/README.md)";

export function ruleTitle(rule: string): string {
  return RULE_TITLES[rule] ?? GENERIC_TITLE;
}

/** A finding as a redacting run reports it: ids, rule, path and title only. */
export function redactFinding(finding: ReportFinding): ReportFinding {
  const out: ReportFinding = {
    rule: finding.rule,
    severity: finding.severity,
    file: finding.file,
    message: ruleTitle(finding.rule),
    sealed: finding.sealed,
  };
  if (finding.itemId !== undefined) out.itemId = finding.itemId;
  if (finding.path !== undefined && finding.path !== "")
    out.path = finding.path;
  return out;
}

/** `error m.film.0107 C12 clues[1]`: the three-part form of §5.4. */
export function redactedLine(finding: ReportFinding): string {
  const where = finding.itemId ?? finding.file;
  const path = finding.path ? ` ${finding.path}` : "";
  return `${finding.severity === "error" ? "error" : "warn "} ${where} ${finding.rule}${path}`;
}

export interface ReportOptions {
  /** A run that decrypted sealed content: the three-part form only. */
  redact: boolean;
  /** --reveal: sealed excerpts in a plaintext run (never with redact). */
  reveal: boolean;
  json: boolean;
}

export interface Report {
  command: string;
  items: number;
  findings: readonly ReportFinding[];
  notes: readonly string[];
  /** Extra keys for the JSON report (content-free by construction). */
  extra?: Record<string, unknown>;
  /** Fail on warnings too. */
  strict?: boolean;
}

export interface ReportSink {
  out: (line: string) => void;
}

const CONSOLE: ReportSink = { out: (line) => console.log(line) };

export function summarize(findings: readonly ReportFinding[]): {
  errors: number;
  warnings: number;
} {
  return {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warn").length,
  };
}

/** Prints a report; returns the exit code (1 on any error, or warning with strict). */
export function printReport(
  report: Report,
  options: ReportOptions,
  sink: ReportSink = CONSOLE,
): number {
  const { errors, warnings } = summarize(report.findings);
  const failed = errors > 0 || (report.strict === true && warnings > 0);
  const reveal = options.reveal && !options.redact;
  if (options.json) {
    sink.out(
      JSON.stringify(
        {
          ok: !failed,
          items: report.items,
          errors,
          warnings,
          notes: report.notes,
          ...(report.extra ?? {}),
          findings: report.findings.map((finding) =>
            options.redact
              ? redactFinding(finding)
              : visibleFinding(finding, reveal),
          ),
        },
        null,
        2,
      ),
    );
  } else {
    for (const finding of report.findings) {
      sink.out(
        options.redact ? redactedLine(finding) : formatFinding(finding, reveal),
      );
    }
    for (const note of report.notes) sink.out(`note: ${note}`);
    sink.out(
      `${report.command}: ${report.items} item(s), ${errors} error(s), ${warnings} warning(s).`,
    );
  }
  return failed ? 1 : 0;
}

/**
 * Runs a CLI body. In a redacting run nothing a thrown error carries is
 * printed, because an error raised while reading sealed content (a JSON
 * parse error quotes its input) could name an answer; the one line says
 * where to look instead.
 */
export function runReported(
  command: string,
  redact: () => boolean,
  body: () => Promise<number>,
): void {
  const fail = (error: unknown) => {
    if (redact()) {
      console.error(
        `${command}: stopped by an internal error; details are hidden in a sealed run (rerun without --sealed on your own machine).`,
      );
    } else {
      console.error(
        `${command}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.exitCode = 1;
  };
  process.on("uncaughtException", fail);
  process.on("unhandledRejection", fail);
  body().then((code) => {
    process.exitCode = code;
  }, fail);
}
