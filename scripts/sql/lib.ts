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
export const STANDING_CHECKS =
  "supabase/tests/baseline/standing-checks.test.sql";

/** `<14-digit version>_<snake_case name>.sql`, the form apply_migration records. */
const MIGRATION_NAME = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const OWNER_ONLY = /_owner_only\.sql$/;
const ATTENDED = /_attended\.sql$/;

export interface MigrationFile {
  /** The file name, such as 20261104000000_baseline.sql. */
  file: string;
  /** The name apply_migration records: the file name without .sql. */
  stem: string;
  version: string;
  /** Written for the project owner to apply; never applied by agents. */
  ownerOnly: boolean;
  /** Applied by us, but only when someone can answer the MCP's confirmation. */
  attended: boolean;
}

export function parseMigrationName(file: string): MigrationFile | null {
  const match = MIGRATION_NAME.exec(file);
  if (!match) return null;
  return {
    file,
    stem: file.slice(0, -".sql".length),
    version: match[1] as string,
    ownerOnly: OWNER_ONLY.test(file),
    attended: ATTENDED.test(file),
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
    const statement = sql.slice(match.index, end === -1 ? undefined : end + 1);
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

// ---------------------------------------------------------------------------
// What makes the Supabase MCP stop for a confirmation
// ---------------------------------------------------------------------------

/** Line and block comments removed, as the MCP does before it looks. */
function withoutComments(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** A quoted string that starts with a destructive command (the MCP's check inside EXECUTE). */
const QUOTED_DESTRUCTIVE =
  /['"]\s*(drop\b|delete\b|truncate\b|alter\s+table\b)/gi;
const DOLLAR_DESTRUCTIVE =
  /execute\s+\$\w*\$\s*(drop\b|delete\b|truncate\b|alter\s+table\b)/gi;
const WORD_DESTRUCTIVE = /\b(drop|delete|truncate|alter\s+table)\b/gi;
/** An identifier, quoted or not, as the MCP reads one. */
const IDENT = String.raw`(?:"(?:[^"]|"")+"|[a-z_\u0080-\uffff][\w$\u0080-\uffff]*)`;
/** A whole statement ALTER TABLE t DROP [COLUMN] c: a dropped column, with or without the word COLUMN. */
const ALTER_DROP_COLUMN = new RegExp(
  String.raw`^\s*alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENT}(?:\s*\.\s*${IDENT})?\s+drop\s+(?!constraint(?![\w$\u0080-\uffff]))(?:column\s+)?(?:if\s+exists\s+)?${IDENT}(?:\s+(?:cascade|restrict))?\s*$`,
  "i",
);

/** True when a match is destructive: anything but ALTER TABLE, or ALTER TABLE followed by DROP COLUMN. */
function destructiveMatch(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  let firstAlter = -1;
  for (
    let match = pattern.exec(text);
    match !== null;
    match = pattern.exec(text)
  ) {
    if (!/^alter/i.test(match[1] as string)) return true;
    if (firstAlter === -1) firstAlter = pattern.lastIndex;
  }
  return firstAlter !== -1 && /\bdrop\s+column\b/i.test(text.slice(firstAlter));
}

/**
 * Where the quote that opens at `index` closes, or -1: the MCP's scan, which
 * reads '' and "" as escaped quotes and backslash escapes in E'...' strings.
 */
function closingQuote(text: string, index: number): number {
  const quote = text[index];
  const escapes =
    quote === "'" &&
    /e/i.test(text[index - 1] ?? "") &&
    !/[\w$\u0080-\uffff]/.test(text[index - 2] ?? "");
  let at = index + 1;
  while (at < text.length) {
    if (escapes && text[at] === "\\") at += 2;
    else if (text[at] === quote) {
      if (text[at + 1] !== quote) return at;
      at += 2;
    } else at += 1;
  }
  return -1;
}

/** The MCP's Vt(): quoted strings and identifiers blanked to '' and "". */
function blankQuotes(text: string): string {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index] as string;
    if (char === "'" || char === '"') {
      const close = closingQuote(text, index);
      out += char === "'" ? "''" : '""';
      index = close === -1 ? text.length : close + 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** A dollar-quote tag where one starts: $$ or $tag$ (the MCP's Xt). */
const DOLLAR_TAG = /\$(?:[a-z_\u0080-\uffff][\w\u0080-\uffff]*)?\$/iy;

export interface McpPiece {
  /** The piece as the MCP reads it: quotes blanked outside dollar quotes, comment text dropped. */
  text: string;
  /** Where the piece starts and ends in the SQL given, for messages. */
  start: number;
  end: number;
}

/** The MCP's fallback for an unterminated quote: a plain split on `;`, quotes blanked. */
function fallbackPieces(sql: string): McpPiece[] {
  const pieces: McpPiece[] = [];
  let start = 0;
  for (const part of sql.split(";")) {
    pieces.push({ text: blankQuotes(part), start, end: start + part.length });
    start += part.length + 1;
  }
  return pieces;
}

/**
 * The pieces the MCP's UPDATE rule reads: a port of In() in
 * @supabase/mcp-server-supabase 0.15.0. It splits on every `;` outside a
 * quoted string, so also inside dollar quotes (function bodies and DO
 * blocks) and inside block comments. It blanks quoted strings outside
 * dollar quotes, keeps the markers `--`, `/*` and `*\/` but drops comment
 * text, and inside an UPDATE statement takes a dollar-quoted string whole.
 * An unterminated quote makes it fall back to a plain split on `;`.
 */
export function mcpPieces(sql: string): McpPiece[] {
  const pieces: McpPiece[] = [];
  let text = "";
  let start = 0;
  let index = 0;
  let dollar: string | undefined;
  let blockDepth = 0;
  let lineComment = false;
  const cut = () => {
    pieces.push({ text, start, end: index });
    text = "";
    start = index + 1;
  };
  while (index < sql.length) {
    const char = sql[index] as string;
    if (lineComment) {
      if (char === "\n" || char === "\r") {
        lineComment = false;
        text += char;
      }
      index += 1;
      continue;
    }
    if (blockDepth > 0) {
      if (char === ";") {
        cut();
        index += 1;
      } else if (char === "/" && sql[index + 1] === "*") {
        text += "/*";
        blockDepth += 1;
        index += 2;
      } else if (char === "*" && sql[index + 1] === "/") {
        text += "*/";
        blockDepth -= 1;
        index += 2;
      } else index += 1;
      continue;
    }
    if (dollar !== undefined) {
      if (char === ";") {
        cut();
        index += 1;
      } else if (sql.startsWith(dollar, index)) {
        text += dollar;
        index += dollar.length;
        dollar = undefined;
      } else {
        text += char;
        index += 1;
      }
      continue;
    }
    if (char === ";") {
      cut();
      index += 1;
      continue;
    }
    if (char === "$" && !/[\w$\u0080-\uffff]/.test(sql[index - 1] ?? "")) {
      DOLLAR_TAG.lastIndex = index;
      const tag = DOLLAR_TAG.exec(sql)?.[0];
      if (tag !== undefined && /^\s*update\s/i.test(text)) {
        const close = sql.indexOf(tag, index + tag.length);
        if (close === -1) return fallbackPieces(sql);
        text += tag + tag;
        index = close + tag.length;
        continue;
      }
      if (tag !== undefined) {
        text += tag;
        dollar = tag;
        index += tag.length;
        continue;
      }
    }
    if (char === "-" && sql[index + 1] === "-") {
      text += "--";
      lineComment = true;
      index += 2;
      continue;
    }
    if (char === "/" && sql[index + 1] === "*") {
      text += "/*";
      blockDepth = 1;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"') {
      const close = closingQuote(sql, index);
      if (close === -1) return fallbackPieces(sql);
      text += char === "'" ? "''" : '""';
      index = close + 1;
      continue;
    }
    text += char;
    index += 1;
  }
  cut();
  return pieces;
}

/**
 * The MCP's Dn: UPDATE <table> SET as it recognizes one (a table without an
 * alias). The MCP's copy also carries the s flag, which changes nothing in a
 * pattern without a dot.
 */
const MCP_UPDATE =
  /(?:^|;)\s*update\s+(?:"(?:[^"]|"")*"|[\w]+)(?:\.(?:"(?:[^"]|"")*"|[\w]+))?\s+set\s+[\w\W]+?(?!\s*where\s)/i;

/**
 * Our UPDATE rule, a little wider than the MCP's: a piece that starts with
 * UPDATE once the comment markers In() leaves are skipped (the MCP looks
 * past nothing), with or without an alias (the MCP needs none), and with no
 * WHERE as a word of its own.
 */
function updateWithoutWhere(text: string): boolean {
  const body = text.replace(/^(?:\s|--|\/\*|\*\/)+/, "");
  return /^update\s/i.test(body) && !/\bwhere\s/i.test(body);
}

/** A piece's first line of SQL, comments left out. */
function excerpt(sql: string, piece: McpPiece): string {
  return (
    sql
      .slice(piece.start, piece.end)
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim()
      .split("\n")[0] ?? ""
  ).trim();
}

/** The MCP's Rn(): DROP, DELETE and TRUNCATE pieces, dropped columns and destructive EXECUTE. */
function destructiveReasons(sql: string): string[] {
  const reasons = new Set<string>();
  const text = withoutComments(sql);
  const alter = /(?:^|;)\s*alter\s+table\s+/i.exec(text);
  if (
    alter &&
    /\sdrop\s+column\s/i.test(text.slice(alter.index + alter[0].length))
  ) {
    reasons.add("ALTER TABLE ... DROP COLUMN");
  }
  for (const piece of text.split(";")) {
    const lead = /^\s*(drop|delete|truncate)\s/i.exec(piece);
    if (lead) {
      reasons.add(
        `a statement starts with ${(lead[1] as string).toUpperCase()} (${piece.trim().split("\n")[0]})`,
      );
    }
    if (ALTER_DROP_COLUMN.test(piece)) {
      reasons.add(
        `ALTER TABLE ... DROP of a column (${piece.trim().split("\n")[0]})`,
      );
    }
    const execute = /execute\s+/i.exec(piece);
    if (
      execute &&
      (destructiveMatch(
        piece.slice(execute.index + execute[0].length),
        QUOTED_DESTRUCTIVE,
      ) ||
        destructiveMatch(piece, DOLLAR_DESTRUCTIVE))
    ) {
      reasons.add(
        `EXECUTE of a destructive command (${piece.trim().split("\n")[0]})`,
      );
    }
  }
  for (const match of text.matchAll(
    /execute\s+(format|concat(?:_ws)?)\s*\([^)]*(?:\)[^;]*|$)/gi,
  )) {
    const pattern =
      (match[1] as string).toLowerCase() === "format"
        ? QUOTED_DESTRUCTIVE
        : WORD_DESTRUCTIVE;
    if (destructiveMatch(match[0], pattern)) {
      reasons.add(`EXECUTE ${match[1]}(...) of a destructive command`);
    }
  }
  return [...reasons];
}

/**
 * Exactly what @supabase/mcp-server-supabase 0.15.0 decides, a port of its
 * Fe() = Rn() || Hn(), which execute_sql and apply_migration both run. Tests
 * hold mcpConfirmationReasons to it; the scripts use the reasons.
 */
export function mcpWouldConfirm(sql: string): boolean {
  return (
    destructiveReasons(sql).length > 0 ||
    mcpPieces(sql).some(
      ({ text }) =>
        text.trim().toLowerCase().startsWith("update") &&
        MCP_UPDATE.test(text) &&
        !/where\s/i.test(text),
    )
  );
}

/**
 * Why the Supabase MCP would stop this SQL to ask a human, following the
 * destructive-SQL check of @supabase/mcp-server-supabase 0.15.0 (the hosted
 * server may differ). Its DROP, DELETE and TRUNCATE rule splits on every
 * `;` without regard to quotes or dollar quotes, so a DELETE inside a
 * function body counts, WHERE or not; it also catches EXECUTE of a
 * destructive string and ALTER TABLE ... DROP COLUMN. Its UPDATE rule reads
 * the pieces of mcpPieces(), which reach into DO blocks and function bodies
 * too. Every SQL the MCP stops for gets a reason here (mcpWouldConfirm),
 * and the UPDATE rule flags a little more. Empty when the SQL can be sent
 * unattended.
 */
export function mcpConfirmationReasons(sql: string): string[] {
  const reasons = new Set(destructiveReasons(sql));
  for (const piece of mcpPieces(sql)) {
    if (updateWithoutWhere(piece.text)) {
      reasons.add(`UPDATE without WHERE (${excerpt(sql, piece)})`);
    }
  }
  return [...reasons];
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
  /**
   * Migrations the file needs, from `-- requires: <migration stem>` lines in
   * its header (before `begin;`). sql:bundle skips the file when one is
   * neither in the bundle nor applied.
   */
  requires: string[];
}

const PASS_LINE = /^\s*select\s+'(PASS [^']+)'\s*;\s*$/i;
const REQUIRES_LINE = /^\s*--\s*requires:\s*(\S+)\s*$/i;
const MIGRATION_STEM = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const CODE_LINE = (line: string) => {
  const trimmed = line.trim();
  return trimmed !== "" && !trimmed.startsWith("--");
};
const NESTED_CONTROL =
  /^\s*(?:begin|commit|rollback|abort)\s*;\s*$|^\s*(?:start\s+transaction|savepoint|release\s+savepoint|rollback\s+to)\b/i;

/**
 * A test file is one transaction: `begin;`, statements, one or more
 * `select 'PASS <AC id or ticket> <name>';` lines, `rollback;`. Its header
 * comments may name migrations it needs (`-- requires: <stem>`). Throws with
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
  const requires: string[] = [];
  for (const line of lines.slice(0, first.index)) {
    const required = REQUIRES_LINE.exec(line);
    if (!required) continue;
    if (!MIGRATION_STEM.test(required[1] as string)) {
      throw new Error(
        `${path}: "-- requires:" names a migration stem such as 20261104000200_platform_jobs_attended`,
      );
    }
    requires.push(required[1] as string);
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
  return { path, body: body.join("\n").trim(), passLines, requires };
}

const PAYLOAD_MARK = /^\s*--\s*payload:\s*([a-z0-9][a-z0-9._-]*)\s*$/i;

/**
 * A payload file records RPC replies for adapter fixtures (§11.1): each
 * `-- payload: <name>` line is followed by one `select <expression>;`, which
 * becomes a "PAYLOAD <name> <json>" result row. Other statements (setting
 * the clock, say) pass through. Returns the statements for a bundle.
 */
export function parsePayloadFile(path: string, text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let names = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const mark = PAYLOAD_MARK.exec(lines[index] as string);
    if (!mark) {
      out.push(lines[index] as string);
      continue;
    }
    const statement: string[] = [];
    let at = index + 1;
    for (; at < lines.length; at += 1) {
      statement.push(lines[at] as string);
      if ((lines[at] as string).trimEnd().endsWith(";")) break;
    }
    const sql = statement.join("\n").trim();
    const select = /^select\s+([\s\S]+);$/i.exec(sql);
    if (!select) {
      throw new Error(
        `${path}:${index + 2}: a payload is one "select <expression>;"`,
      );
    }
    out.push(
      `insert into qz_test_results (line) select 'PAYLOAD ${mark[1]} ' || (${select[1]})::text;`,
    );
    names += 1;
    index = at;
  }
  if (names === 0) throw new Error(`${path}: no "-- payload: <name>" entries`);
  return out.join("\n").trim();
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
