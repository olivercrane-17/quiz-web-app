/**
 * Shared pieces of the SQL scripts (ARCHITECTURE §8.16, §8.17): the
 * migration list, the scan for statements that cannot apply unattended,
 * and the parser for SQL test files. Pure functions over strings and paths,
 * so the scripts' tests can feed them fixtures.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const MIGRATIONS_DIR = "supabase/migrations";
export const TESTS_DIR = "supabase/tests";
export const EXPECTED_ADVISORS = "supabase/expected-advisors.json";
export const STANDING_CHECKS = "supabase/tests/baseline/standing-checks.test.sql";

/** `<14-digit version>_<snake_case name>.sql`, the form apply_migration records. */
const MIGRATION_NAME = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const OWNER_ONLY = /_owner_only\.sql$/;

export interface MigrationFile {
  /** The file name, such as 20261104000000_baseline.sql. */
  file: string;
  /** The name apply_migration records: the file name without .sql. */
  stem: string;
  version: string;
  /** Written for the project owner to apply; never applied by agents. */
  ownerOnly: boolean;
}

export function parseMigrationName(file: string): MigrationFile | null {
  const match = MIGRATION_NAME.exec(file);
  if (!match) return null;
  return {
    file,
    stem: file.slice(0, -".sql".length),
    version: match[1] as string,
    ownerOnly: OWNER_ONLY.test(file),
  };
}

/** Every .sql file in supabase/migrations, in apply order, and the names that break the rule. */
export function listMigrations(root: string): {
  migrations: MigrationFile[];
  badNames: string[];
} {
  const files = readdirSync(join(root, MIGRATIONS_DIR))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const migrations: MigrationFile[] = [];
  const badNames: string[] = [];
  for (const file of files) {
    const parsed = parseMigrationName(file);
    if (parsed === null) badNames.push(file);
    else migrations.push(parsed);
  }
  return { migrations, badNames };
}

export function readText(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

// ---------------------------------------------------------------------------
// Statements that cannot apply unattended
// ---------------------------------------------------------------------------

/**
 * The Supabase MCP asks a human to confirm destructive statements, and no
 * one is there during autonomous work (01-ENGINEERING-CONSTRAINTS.md). So
 * the words below never appear in SQL we send, comments and function bodies
 * included, and every DELETE carries a WHERE in its own statement. Owner-only
 * migrations are the one exception and are never sent.
 */
const FORBIDDEN_WORDS: { rule: string; pattern: RegExp }[] = [
  { rule: "DROP", pattern: /\bdrop\b/gi },
  { rule: "REVOKE", pattern: /\brevoke\b/gi },
  { rule: "TRUNCATE", pattern: /\btruncate\b/gi },
  { rule: "RENAME", pattern: /\brename\b/gi },
  { rule: "ALTER ROLE", pattern: /\balter\s+(?:role|user)\b/gi },
];
const DELETE_FROM = /\bdelete\s+from\b/gi;
/**
 * Characters nobody can see in a review: C0 and C1 controls other than tab,
 * line feed and carriage return, zero-width characters and the bidi
 * controls of Trojan Source (CVE-2021-42574). SQL names them with \u
 * escapes instead.
 */
const INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

export interface ForbiddenFinding {
  file: string;
  line: number;
  rule: string;
  excerpt: string;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let at = 0; at < index; at += 1) {
    if (text.charCodeAt(at) === 10) line += 1;
  }
  return line;
}

function excerptAt(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? undefined : end).trim();
}

/** Every forbidden word, invisible character, and DELETE whose statement has no WHERE. */
export function scanForbidden(file: string, sql: string): ForbiddenFinding[] {
  const findings: ForbiddenFinding[] = [];
  for (const { rule, pattern } of FORBIDDEN_WORDS) {
    for (const match of sql.matchAll(pattern)) {
      findings.push({
        file,
        line: lineAt(sql, match.index),
        rule,
        excerpt: excerptAt(sql, match.index),
      });
    }
  }
  for (const match of sql.matchAll(INVISIBLE)) {
    findings.push({
      file,
      line: lineAt(sql, match.index),
      rule: `invisible character U+${match[0].codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}`,
      excerpt: excerptAt(sql, match.index),
    });
  }
  for (const match of sql.matchAll(DELETE_FROM)) {
    const end = sql.indexOf(";", match.index);
    const statement = sql.slice(
      match.index,
      end === -1 ? undefined : end + 1,
    );
    if (!/\bwhere\b/i.test(statement)) {
      findings.push({
        file,
        line: lineAt(sql, match.index),
        rule: "DELETE without WHERE",
        excerpt: excerptAt(sql, match.index),
      });
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}

export function describeFinding(finding: ForbiddenFinding): string {
  return `${finding.file}:${finding.line}: ${finding.rule}: ${finding.excerpt}`;
}

/** Lines that would end or nest the transaction a dry run wraps around a file. */
const TRANSACTION_CONTROL =
  /^\s*(?:begin|commit|rollback|abort|end)\s*;\s*$|^\s*(?:start\s+transaction|savepoint|release\s+savepoint|rollback\s+to)\b/i;

/** Top-level transaction control in a migration (apply_migration and dry runs supply the transaction). */
export function transactionControlLines(sql: string): number[] {
  const out: number[] = [];
  let inBody = false;
  sql.split("\n").forEach((text, index) => {
    // Dollar-quoted bodies (plpgsql) legitimately end blocks with "end;".
    const dollars = text.match(/\$[A-Za-z_]*\$/g)?.length ?? 0;
    if (!inBody && TRANSACTION_CONTROL.test(text)) out.push(index + 1);
    if (dollars % 2 === 1) inBody = !inBody;
  });
  return out;
}

// ---------------------------------------------------------------------------
// SQL test files (§8.17)
// ---------------------------------------------------------------------------

export interface TestFile {
  path: string;
  /** The statements between the file's begin; and rollback;, PASS lines removed. */
  body: string;
  /** The text of every `select 'PASS ...';` line, in order. */
  passLines: string[];
}

const PASS_LINE = /^\s*select\s+'(PASS [^']+)'\s*;\s*$/i;
const CODE_LINE = (line: string) => {
  const trimmed = line.trim();
  return trimmed !== "" && !trimmed.startsWith("--");
};
const NESTED_CONTROL =
  /^\s*(?:begin|commit|rollback|abort)\s*;\s*$|^\s*(?:start\s+transaction|savepoint|release\s+savepoint|rollback\s+to)\b/i;

/**
 * A test file is one transaction: `begin;`, statements, one or more
 * `select 'PASS <AC id or ticket> <name>';` lines, `rollback;`. Throws with
 * the reason when a file breaks the shape.
 */
export function parseTestFile(path: string, text: string): TestFile {
  const lines = text.split("\n");
  const code = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => CODE_LINE(line));
  const first = code[0];
  const last = code[code.length - 1];
  if (first === undefined || !/^\s*begin\s*;\s*$/i.test(first.line)) {
    throw new Error(`${path}: the first statement must be "begin;"`);
  }
  if (
    last === undefined ||
    last === first ||
    !/^\s*rollback\s*;\s*$/i.test(last.line)
  ) {
    throw new Error(`${path}: the last statement must be "rollback;"`);
  }
  const body: string[] = [];
  const passLines: string[] = [];
  for (let index = first.index + 1; index < last.index; index += 1) {
    const line = lines[index] as string;
    const pass = PASS_LINE.exec(line);
    if (pass) {
      passLines.push(pass[1] as string);
      continue;
    }
    if (NESTED_CONTROL.test(line)) {
      throw new Error(
        `${path}:${index + 1}: transaction control inside a test ("${line.trim()}")`,
      );
    }
    body.push(line);
  }
  if (passLines.length === 0) {
    throw new Error(`${path}: no "select 'PASS ...';" line`);
  }
  return { path, body: body.join("\n").trim(), passLines };
}

/** Every *.test.sql file of an area directory, sorted. */
export function listTestFiles(root: string, area: string): string[] {
  const dir = join(TESTS_DIR, area);
  return readdirSync(join(root, dir))
    .filter((file) => file.endsWith(".test.sql"))
    .sort()
    .map((file) => `${dir}/${file}`);
}

export function listAreas(root: string): string[] {
  return readdirSync(join(root, TESTS_DIR), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

// ---------------------------------------------------------------------------
// MCP output
// ---------------------------------------------------------------------------

/**
 * The migration names in list_migrations output, pasted as JSON: the tool's
 * `{ "migrations": [{ "version", "name" }] }`, a bare array of those, or an
 * array of names.
 */
export function parseAppliedMigrations(json: unknown): string[] {
  const list =
    typeof json === "object" &&
    json !== null &&
    !Array.isArray(json) &&
    "migrations" in json
      ? (json as { migrations: unknown }).migrations
      : json;
  if (!Array.isArray(list)) {
    throw new Error(
      'list_migrations output must be { "migrations": [...] } or an array',
    );
  }
  return list.map((entry, index) => {
    if (typeof entry === "string") return entry;
    const name =
      typeof entry === "object" && entry !== null
        ? (entry as { name?: unknown }).name
        : undefined;
    if (typeof name !== "string") {
      throw new Error(`list_migrations entry ${index} has no name`);
    }
    return name;
  });
}
