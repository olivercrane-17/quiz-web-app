/**
 * npm run sql:advisors -- --security <file> --performance <file>
 *
 * Diffs the Supabase advisors against supabase/expected-advisors.json
 * (ARCHITECTURE §8.2 rule 4, §11.6). Save each get_advisors reply (MCP,
 * types security and performance) to a file and pass it. Every finding
 * must match an expected entry, and every required entry must have a
 * finding: the RPC lints for each name in rpc.functions are required, while
 * accepted entries say whether they are. Any other finding fails, so a new
 * one is either fixed or explained in the expected file in the same pull
 * request.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { EXPECTED_ADVISORS, readText } from "./lib.ts";

const USAGE = `Usage: npm run sql:advisors -- [--security <file>] [--performance <file>]

  At least one file: the get_advisors JSON reply for that type.
  --expected <file>   Another expected file (default ${EXPECTED_ADVISORS})`;

/** One advisor finding, as get_advisors returns it. Only name is required. */
export interface Lint {
  name: string;
  title?: string;
  level?: string;
  detail?: string;
  cache_key?: string;
  metadata?: Record<string, unknown>;
}

export interface ExpectedEntry {
  lint: string;
  schema?: string;
  table?: string;
  function?: string;
  index?: string;
  required: boolean;
  ticket?: string;
  why: string;
}

export interface ExpectedFile {
  rpc: { lints: string[]; functions: string[]; why: string };
  accepted: ExpectedEntry[];
}

export interface AdvisorDiff {
  matched: { entry: ExpectedEntry; lint: Lint }[];
  unexpected: Lint[];
  missingRequired: ExpectedEntry[];
  absentOptional: ExpectedEntry[];
}

/** The lints in a get_advisors reply: `{ result: { lints } }`, `{ lints }` or an array. */
export function parseLints(json: unknown): Lint[] {
  let value = json;
  if (typeof value === "object" && value !== null && "result" in value) {
    value = (value as { result: unknown }).result;
    if (typeof value === "string") value = JSON.parse(value);
  }
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "lints" in value
  ) {
    value = (value as { lints: unknown }).lints;
  }
  if (!Array.isArray(value)) {
    throw new Error("an advisor reply must hold a lints array");
  }
  return value.map((lint, index) => {
    if (
      typeof lint !== "object" ||
      lint === null ||
      typeof (lint as { name?: unknown }).name !== "string"
    ) {
      throw new Error(`lint ${index} has no name`);
    }
    return lint as Lint;
  });
}

export function parseExpected(json: unknown): ExpectedFile {
  const file = json as Partial<ExpectedFile> | null;
  const rpc = file?.rpc;
  if (
    !rpc ||
    !Array.isArray(rpc.lints) ||
    !Array.isArray(rpc.functions) ||
    !Array.isArray(file?.accepted)
  ) {
    throw new Error(
      `${EXPECTED_ADVISORS} needs rpc.lints, rpc.functions and accepted arrays`,
    );
  }
  for (const entry of file.accepted) {
    if (
      typeof entry.lint !== "string" ||
      typeof entry.required !== "boolean" ||
      typeof entry.why !== "string" ||
      entry.why.trim() === ""
    ) {
      throw new Error(
        `every accepted entry needs lint, required and a why: ${JSON.stringify(entry)}`,
      );
    }
  }
  return file as ExpectedFile;
}

/** The accepted entries plus one required entry per RPC lint and allowlisted function. */
export function expandExpected(file: ExpectedFile): ExpectedEntry[] {
  const rpcEntries = file.rpc.functions.flatMap((fn) =>
    file.rpc.lints.map((lint): ExpectedEntry => ({
      lint,
      schema: "public",
      function: fn,
      required: true,
      why: file.rpc.why,
    })),
  );
  return [...rpcEntries, ...file.accepted];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Whether a finding is this entry: the same lint, and every locator the
 * entry gives (schema, table or function, index) found in the finding's
 * metadata, or else in its detail and cache key.
 */
export function entryMatches(entry: ExpectedEntry, lint: Lint): boolean {
  if (lint.name !== entry.lint) return false;
  const metadata = lint.metadata ?? {};
  const haystack = [
    text(lint.detail),
    text(lint.cache_key),
    text(lint.title),
    JSON.stringify(metadata),
  ].join(" ");
  if (entry.schema !== undefined) {
    const schema = metadata.schema;
    if (
      typeof schema === "string"
        ? schema !== entry.schema
        : !haystack.includes(entry.schema)
    ) {
      return false;
    }
  }
  const object = entry.table ?? entry.function;
  if (object !== undefined) {
    const name = metadata.name;
    if (
      typeof name === "string" ? name !== object : !haystack.includes(object)
    ) {
      return false;
    }
  }
  if (entry.index !== undefined && !haystack.includes(entry.index))
    return false;
  return true;
}

export function diffAdvisors(
  expected: ExpectedEntry[],
  lints: Lint[],
): AdvisorDiff {
  const diff: AdvisorDiff = {
    matched: [],
    unexpected: [],
    missingRequired: [],
    absentOptional: [],
  };
  const seen = new Set<ExpectedEntry>();
  for (const lint of lints) {
    const entry = expected.find((candidate) => entryMatches(candidate, lint));
    if (entry === undefined) diff.unexpected.push(lint);
    else {
      diff.matched.push({ entry, lint });
      seen.add(entry);
    }
  }
  for (const entry of expected) {
    if (seen.has(entry)) continue;
    if (entry.required) diff.missingRequired.push(entry);
    else diff.absentOptional.push(entry);
  }
  return diff;
}

function describeEntry(entry: ExpectedEntry): string {
  return [entry.lint, entry.schema, entry.table ?? entry.function, entry.index]
    .filter((part) => part !== undefined)
    .join(" ");
}

function describeLint(lint: Lint): string {
  return `${lint.name} (${lint.level ?? "?"}): ${lint.detail ?? lint.title ?? lint.cache_key ?? "no detail"}`;
}

export function formatDiff(diff: AdvisorDiff): string {
  const lines: string[] = [];
  for (const { entry } of diff.matched)
    lines.push(`expected   ${describeEntry(entry)}`);
  for (const entry of diff.absentOptional)
    lines.push(`not seen   ${describeEntry(entry)} (optional)`);
  for (const entry of diff.missingRequired)
    lines.push(`MISSING    ${describeEntry(entry)} (required)`);
  for (const lint of diff.unexpected)
    lines.push(`UNEXPECTED ${describeLint(lint)}`);
  return lines.join("\n");
}

/** Lints the performance advisor reports; every other lint is a security one. */
export const PERFORMANCE_LINTS = new Set([
  "unindexed_foreign_keys",
  "auth_rls_initplan",
  "no_primary_key",
  "unused_index",
  "multiple_permissive_policies",
  "duplicate_index",
  "table_bloat",
]);

export function main(argv: string[], root = process.cwd()): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      security: { type: "string" },
      performance: { type: "string" },
      expected: { type: "string" },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const files = [values.security, values.performance].filter(
    (file): file is string => file !== undefined,
  );
  if (files.length === 0) {
    console.error(`sql:advisors: pass at least one advisor reply\n${USAGE}`);
    return 1;
  }
  const lints = files.flatMap((file) =>
    parseLints(JSON.parse(readFileSync(file, "utf8"))),
  );
  const expectedText =
    values.expected === undefined
      ? readText(root, EXPECTED_ADVISORS)
      : readFileSync(values.expected, "utf8");
  const expected = expandExpected(parseExpected(JSON.parse(expectedText)));
  // Entries of an advisor type that was not passed cannot be judged missing.
  const types = new Set(
    [values.security && "security", values.performance && "performance"].filter(
      Boolean,
    ),
  );
  const judged = expected.filter((entry) =>
    types.has(PERFORMANCE_LINTS.has(entry.lint) ? "performance" : "security"),
  );
  const diff = diffAdvisors(judged, lints);
  const report = formatDiff(diff);
  if (report !== "") console.log(report);
  if (diff.unexpected.length > 0 || diff.missingRequired.length > 0) {
    console.error(
      `sql:advisors: failed: ${diff.unexpected.length} unexpected, ${diff.missingRequired.length} missing`,
    );
    return 1;
  }
  console.log(
    `sql:advisors: ${lints.length} findings, all expected (${diff.absentOptional.length} optional entries not seen)`,
  );
  return 0;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`sql:advisors: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
