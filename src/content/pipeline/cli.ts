/**
 * Shared helpers for the content CLIs in scripts/content/.
 */
import { parseArgs, type ParseArgsConfig } from "node:util";

import type { Finding } from "./lint/types.ts";

export type CliValues = Record<string, string | boolean | undefined>;

export function parseCli(
  name: string,
  args: string[],
  options: NonNullable<ParseArgsConfig["options"]>,
  usage: string,
): CliValues {
  try {
    const { values } = parseArgs({
      args,
      options: { ...options, help: { type: "boolean", short: "h" } },
      strict: true,
      allowPositionals: false,
    });
    if (values.help) {
      console.log(usage);
      process.exit(0);
    }
    return values as CliValues;
  } catch (error) {
    console.error(`${name}: ${(error as Error).message}\n\n${usage}`);
    process.exit(2);
  }
}

/** Runs a CLI body, turning thrown errors into a one-line message and exit code 1. */
export function run(name: string, body: () => Promise<number | void>): void {
  body().then(
    (code) => {
      process.exitCode = code ?? 0;
    },
    (error: unknown) => {
      console.error(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    },
  );
}

export function str(values: CliValues, key: string): string | undefined {
  const value = values[key];
  return typeof value === "string" ? value : undefined;
}

export function requireStr(
  values: CliValues,
  key: string,
  usage: string,
): string {
  const value = str(values, key);
  if (value === undefined || value === "") {
    console.error(`--${key} is required.\n\n${usage}`);
    process.exit(2);
  }
  return value;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Excerpts of sealed content are hidden unless --reveal is passed. */
export function visibleFinding(finding: Finding, reveal: boolean): Finding {
  if (!finding.sealed || reveal || finding.excerpt === undefined)
    return finding;
  const { excerpt: _hidden, ...rest } = finding;
  return rest;
}

export function formatFinding(finding: Finding, reveal: boolean): string {
  const f = visibleFinding(finding, reveal);
  const where = [f.file, f.itemId, f.path].filter(Boolean).join(" ");
  const excerpt =
    f.excerpt !== undefined ? ` [${JSON.stringify(f.excerpt)}]` : "";
  return `${f.severity === "error" ? "error" : "warn "} ${f.rule} ${where}: ${f.message}${excerpt}`;
}

export function summarize(findings: Finding[]): {
  errors: number;
  warnings: number;
} {
  return {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warn").length,
  };
}
