/**
 * The content lint (CONTENT_GUIDE §2.13): every machine-checkable rule from
 * C01 to C25, plus pool checks (X rules) from ARCHITECTURE §5.2 and the
 * guide's batch and pack rules, and the acceptance rule of §9.9 for every
 * item that is already active (lint/active-rules.ts).
 *
 * Synchronous, as ARCHITECTURE §2.3 has it: `lintBank(bank, options)` returns
 * the findings. scripts/content/lint.ts is the CNT-2 entry point that wraps
 * it.
 */
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import type { AnyItem, Mystery } from "../../schema/items.ts";
import type { Bank, BankItem, ListIndex } from "../bank.ts";
import {
  DEDUPE_FLAG,
  buildDedupeIndex,
  dedupeEntry,
  entityNamer,
  guideExamples,
  isPublicEntry,
  nearestTo,
  type DedupeEntry,
  type DedupeIndex,
} from "../dedupe.ts";
import { mythMatches } from "../references.ts";
import { foldName } from "../text.ts";
import { activeItemHits } from "./active-rules.ts";
import { entityIdHits, ruleC24 } from "./id-rules.ts";
import {
  ruleC02,
  ruleC03,
  ruleC04,
  ruleC07,
  ruleC15,
  ruleC16,
  ruleC17,
  ruleC18,
} from "./item-rules.ts";
import {
  ruleC12,
  ruleC13,
  ruleC14,
  ruleX01,
  ruleX02,
} from "./mystery-rules.ts";
import { poolFindings, scheduledDates } from "./pool-rules.ts";
import {
  ruleC05,
  ruleC06,
  ruleC08,
  ruleC09,
  ruleC10,
  ruleC11,
  ruleC19,
  ruleC20,
  ruleC21,
  ruleC23,
  slurHits,
} from "./text-rules.ts";
import {
  WAIVABLE_ERRORS,
  type Finding,
  type LintContext,
  type RuleHit,
} from "./types.ts";

export { LINT_VERSION, RULES, type Finding, type Severity } from "./types.ts";

export interface LintOptions {
  writer?: string;
  /** ISO date for the freeze rule. Defaults to today (UTC). */
  today?: string;
  /** Run the C22 near-duplicate check (default true). */
  dedupe?: boolean;
  /** Include the guide's worked examples in C22 (default true). */
  guide?: boolean;
  /**
   * Name both sides of every near-duplicate pair, sealed ones included
   * (`--reveal`, for your own terminal only). Without it a pair that crosses
   * the seal is reported only on its sealed side, with no id, score or
   * reason, because a public item named next to a sealed one gives the
   * sealed answer away (ARCHITECTURE §5.4).
   */
  reveal?: boolean;
}

/** C25: claims that resemble a known myth. */
function ruleC25(bank: Bank, item: AnyItem): RuleHit[] {
  const hits: RuleHit[] = [];
  item.claims.forEach((claim, index) => {
    for (const myth of bank.references.myths) {
      if (mythMatches(myth, claim.text)) {
        hits.push({
          rule: "C25",
          severity: "warn",
          path: `claims[${index}]`,
          message: `claim ${claim.id} resembles a known myth from content/reference/myths.json; the checker decides (§9.3 step 8)`,
          excerpt: myth.id,
        });
      }
    }
  });
  if (
    !("kind" in item) &&
    item.format === "tf" &&
    item.tfKind === "surprising_truth"
  ) {
    for (const myth of bank.references.myths) {
      if (mythMatches(myth, item.stem)) {
        hits.push({
          rule: "C25",
          severity: "warn",
          path: "stem",
          message:
            "a surprising truth that reads like a known myth: check the key very carefully",
          excerpt: myth.id,
        });
      }
    }
  }
  return hits;
}

/**
 * X08: no claim with role explanation. Every fact the explanation states is
 * a claim (§9.2), but an explanation may show a method and state no new fact
 * (the guide's e.0004), so this is a warning the editor clears.
 */
function ruleX08(item: AnyItem): RuleHit[] {
  if (item.claims.some((claim) => claim.role === "explanation")) return [];
  return [
    {
      rule: "X08",
      severity: "warn",
      path: "claims",
      message:
        "no claim with role explanation: list every fact the explanation states, or record a lintAllow when it states none (§9.2)",
    },
  ];
}

/** Every per-item rule, before lintAllow. */
export function rawItemHits(
  ctx: LintContext,
  record: BankItem,
  scheduled: Map<string, string[]>,
): RuleHit[] {
  const { bank } = ctx;
  const item = record.item;
  const refs = bank.references;
  const hits: RuleHit[] = [
    ...ruleC02(item),
    ...ruleC03(item),
    ...ruleC04(item),
    ...ruleC05(item),
    ...ruleC06(item),
    ...ruleC07(item),
    ...ruleC08(item),
    ...ruleC09(item),
    ...ruleC10(item, refs),
    ...ruleC11(item),
    ...ruleC15(item),
    ...ruleC16(item),
    ...ruleC17(item),
    ...ruleC18(item),
    ...ruleC19(item),
    ...ruleC20(item),
    ...ruleC21(item),
    ...ruleC23(item, refs),
    ...ruleC24(bank, record, ctx.writer),
    ...ruleC25(bank, item),
    ...ruleX08(item),
  ];
  if ("kind" in item && item.kind === "mystery") {
    const mystery: Mystery = item;
    hits.push(
      ...ruleC12(bank, mystery),
      ...ruleC13(bank, mystery),
      ...ruleC14(bank, mystery, scheduled.get(mystery.id) ?? []),
      ...ruleX01(mystery),
      ...ruleX02(bank, mystery),
    );
  }
  return hits;
}

/** Every per-item rule, after the item's lintAllow. */
export function itemHits(
  ctx: LintContext,
  record: BankItem,
  scheduled: Map<string, string[]>,
): RuleHit[] {
  return applyLintAllow(record.item, rawItemHits(ctx, record, scheduled));
}

/**
 * Drops hits the editor waived with lintAllow (§2.3): warnings, the C06,
 * C08 and C09 errors, and errors a rule marks waivable (C17's near-tie dates).
 */
export function applyLintAllow(item: AnyItem, hits: RuleHit[]): RuleHit[] {
  const allow = item.lintAllow ?? [];
  if (allow.length === 0) return hits;
  return hits.filter((hit) => {
    if (
      hit.severity === "error" &&
      !WAIVABLE_ERRORS.has(hit.rule) &&
      hit.waivable !== true
    )
      return true;
    const field = (hit.field ?? "").toLowerCase();
    const match = (hit.match ?? hit.excerpt ?? "").toLowerCase();
    return !allow.some((entry) => {
      const text = entry.text.toLowerCase();
      return (
        entry.rule === hit.rule &&
        (field === "" || field.includes(text)) &&
        text.includes(match)
      );
    });
  });
}

function toFinding(record: BankItem, hit: RuleHit): Finding {
  const out: Finding = {
    rule: hit.rule,
    severity: hit.severity,
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

/** The dedupe index over the bank's items and, optionally, the guide's examples. */
export function bankDedupeIndex(
  bank: Bank,
  includeGuide = true,
): { index: DedupeIndex; positions: Map<string, number> } {
  const stopwords = bank.references.stopwords;
  const namer = entityNamer(bank.lists.values());
  const entries: DedupeEntry[] = [];
  const positions = new Map<string, number>();
  for (const record of bank.items) {
    if (record.item.status === "cut" || record.item.status === "retired")
      continue;
    const entry = dedupeEntry(
      record.item as unknown as Record<string, unknown>,
      stopwords,
      "bank",
      namer,
      record.file.sealed,
    );
    if (!entry) continue;
    positions.set(record.id, entries.length);
    entries.push(entry);
  }
  if (includeGuide && existsSync(bank.layout.guideFile)) {
    const markdown = readFileSync(bank.layout.guideFile, "utf8");
    for (const raw of guideExamples(markdown)) {
      const entry = dedupeEntry(raw, stopwords, "guide", namer);
      if (entry) entries.push({ ...entry, id: `guide:${entry.id}` });
    }
  }
  return { index: buildDedupeIndex(entries), positions };
}

/** Each shipped list's budget, gzipped (PRD §8.1, 1 kB = 1000 bytes). */
export const LIST_GZIP_LIMIT = 80_000;

/**
 * The gzipped size of a list's client projection (ARCHITECTURE §5.5):
 * `[id, display, keys, popularity]` per active, unreplaced entry, with keys
 * the folded name and aliases. foldName stands in for the engine's
 * normalizeName until that module exists.
 */
export function listProjectionBytes(list: ListIndex): number {
  const rows = [...list.entities.values()]
    .filter((entity) => entity.status === "active" && entity.replacedBy == null)
    .map((entity) => [
      entity.id,
      entity.display,
      [...new Set([entity.name, ...entity.aliases].map(foldName))],
      entity.popularity,
    ]);
  return gzipSync(JSON.stringify(rows)).length;
}

export function lintBank(bank: Bank, options: LintOptions = {}): Finding[] {
  const ctx: LintContext = {
    bank,
    today: options.today ?? new Date().toISOString().slice(0, 10),
  };
  if (options.writer !== undefined) ctx.writer = options.writer;
  const reveal = options.reveal === true;
  const findings: Finding[] = [];

  for (const problem of bank.references.problems) {
    findings.push({
      rule: "C01",
      severity: "error",
      file: problem.file.replace(`${bank.layout.repoRoot}/`, ""),
      message: problem.message,
      sealed: false,
    });
  }

  // C01: read errors and schema problems.
  for (const file of bank.files) {
    if (file.error !== undefined) {
      findings.push({
        rule: "C01",
        severity: "error",
        file: file.rel,
        message: file.sealed
          ? "the file could not be read or parsed (details hidden for sealed content)"
          : file.error,
        sealed: file.sealed,
      });
    }
    for (const problem of file.problems) {
      const out: Finding = {
        rule: "C01",
        severity: "error",
        file: file.rel,
        message: problem.message,
        sealed: file.sealed,
      };
      if (problem.path) out.path = problem.path;
      if (problem.itemId) out.itemId = problem.itemId;
      findings.push(out);
    }
  }

  const scheduled = scheduledDates(bank);
  for (const record of bank.items) {
    for (const hit of itemHits(ctx, record, scheduled))
      findings.push(toFinding(record, hit));
  }

  // Answer lists: ids, sources, slurs and the shipped size.
  for (const list of bank.lists.values()) {
    const entities = [...list.entities.values()];
    const hits = [
      ...entityIdHits(bank, {
        type: list.type,
        version: list.version ?? "",
        provenance: [],
        entities,
      }),
      ...slurHits(
        entities.flatMap((entity, i) => [
          { path: `entities[${i}].name`, value: entity.name },
          { path: `entities[${i}].display`, value: entity.display },
          ...entity.aliases.map((alias, j) => ({
            path: `entities[${i}].aliases[${j}]`,
            value: alias,
          })),
        ]),
        bank.references,
      ),
    ];
    const bytes = listProjectionBytes(list);
    if (bytes > LIST_GZIP_LIMIT) {
      hits.push({
        rule: "X09",
        severity: "error",
        message: `the ${list.type} list ships ${(bytes / 1000).toFixed(1)} kB gzipped as [id, display, keys, popularity]; the limit is ${LIST_GZIP_LIMIT / 1000} kB (ARCHITECTURE §5.5)`,
      });
    }
    for (const hit of hits) {
      const out: Finding = {
        rule: hit.rule,
        severity: hit.severity,
        file: list.file.rel,
        message: hit.message,
        sealed: false,
      };
      if (hit.path) out.path = hit.path;
      if (hit.excerpt !== undefined) out.excerpt = hit.excerpt;
      findings.push(out);
    }
  }

  // Pack titles and themes.
  for (const pack of bank.packs) {
    for (const hit of slurHits(
      [
        { path: "title", value: pack.title },
        { path: "theme", value: pack.theme },
      ],
      bank.references,
    )) {
      findings.push({
        rule: hit.rule,
        severity: hit.severity,
        file: pack.file.rel,
        path: hit.path ?? "",
        message: hit.message,
        sealed: true,
      });
    }
  }

  findings.push(...poolFindings(bank, ctx.today));

  // C22: near-duplicates. Without --reveal a plaintext item is compared with
  // public entries only, and a sealed item whose nearest is public learns
  // nothing about which one, so no line ties a public item to a sealed one.
  if (options.dedupe !== false) {
    const { index, positions } = bankDedupeIndex(bank, options.guide !== false);
    for (const record of bank.items) {
      const position = positions.get(record.id);
      if (position === undefined) continue;
      const sealed = record.file.sealed;
      const match = nearestTo(
        index,
        position,
        sealed || reveal ? undefined : isPublicEntry,
      );
      if (match.nearestId === null || match.score < DEDUPE_FLAG) continue;
      const guide = match.nearestId.startsWith("guide:");
      const crossesSeal = sealed !== match.nearestSealed;
      findings.push(
        toFinding(record, {
          rule: "C22",
          severity: "warn",
          message:
            crossesSeal && !reveal
              ? "near-duplicate of a public item (a practice item or a guide example); content:dedupe -- --item <id> --reveal shows which, in your own terminal; the editor decides (§9.9)"
              : `near-duplicate (${match.score.toFixed(2)}, ${match.reason}) of ${guide ? "the guide's example " : ""}${match.nearestId.replace(/^guide:/, "")}; the editor decides (§9.9)`,
        }),
      );
    }
  }

  // Active items: the acceptance rule again, so a file that only says
  // "active" never passes (§9.9, ARCHITECTURE §5.2).
  const withErrors = new Set(
    findings
      .filter((finding) => finding.severity === "error" && finding.itemId)
      .map((finding) => finding.itemId),
  );
  for (const record of bank.items) {
    for (const hit of activeItemHits(bank, record, !withErrors.has(record.id)))
      findings.push(toFinding(record, hit));
  }

  return findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      (a.itemId ?? "").localeCompare(b.itemId ?? "") ||
      a.rule.localeCompare(b.rule) ||
      (a.path ?? "").localeCompare(b.path ?? ""),
  );
}

/** Findings for one item only (used at acceptance for verification.lint). */
export function lintOneItem(
  bank: Bank,
  record: BankItem,
  options: LintOptions = {},
): Finding[] {
  const ctx: LintContext = {
    bank,
    today: options.today ?? new Date().toISOString().slice(0, 10),
  };
  if (options.writer !== undefined) ctx.writer = options.writer;
  const schema = record.file.problems
    .filter(
      (problem) => problem.itemId === undefined || problem.itemId === record.id,
    )
    .map<Finding>((problem) => ({
      rule: "C01",
      severity: "error",
      file: record.file.rel,
      itemId: record.id,
      path: problem.path,
      message: problem.message,
      sealed: record.file.sealed,
    }));
  return [
    ...schema,
    ...itemHits(ctx, record, scheduledDates(bank)).map((hit) =>
      toFinding(record, hit),
    ),
  ];
}
