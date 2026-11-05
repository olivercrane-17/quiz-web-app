/**
 * npm run codegen:moderation -- [--check] [--candidates <words.json>]
 *
 * The slur filter's SQL, generated from the engine and the content lists
 * (MOD-1; ARCHITECTURE §4.13, §8.13, §8.16):
 *
 * - the generated block of the newest migration that holds one:
 *   `private.fold_text` and `private.moderation_swaps`, the folding table and
 *   the swaps of src/engine/text/moderation.ts as translate() maps, so both
 *   sides fold identically;
 * - supabase/seed/moderation.sql from content/safety/: the terms and the
 *   allowlist stay ROT13-encoded in the file, as on disk, and translate()
 *   decodes them as they load;
 * - supabase/seed/name-parts.sql from content/names/;
 * - supabase/tests/generated/moderation.test.sql: AC-LNT-03's parity tests.
 *   Each reading step must match the engine on sample texts, and the
 *   fixture's stand-in list (src/engine/fixtures/moderation.json) must
 *   compile to the engine's sources and give every case the engine's
 *   verdict;
 * - supabase/tests/generated/moderation-list.test.sql: the real list must
 *   catch each of its terms under each normalization (`termVariants`,
 *   ROT13-encoded there too), and no friendly name may hold a listed term.
 *
 * Every list is checked before anything is written (`validate`). Messages
 * name files and lines, never a decoded term. `--check` writes nothing and
 * exits 1 when a committed file differs. `--candidates` prints, ROT13-encoded
 * and one per line, the words of a JSON array that a substring term would
 * block, for the content team's allowlist review (content/safety/README.md).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import {
  FOLD_BASE,
  FOLD_SWAPS,
  PASSES,
  TRAILING_BANGS,
  TRAILING_SWAPS,
  allowedWords,
  applySwaps,
  createModerationList,
  foldText,
  isBlocked,
  moderationPatterns,
  normalizeForFilter,
  rot13,
  termAlternatives,
  termMatchOf,
  type FilterPass,
  type ModerationTerm,
  type TermMatch,
} from "../../src/engine/text/moderation.ts";
import {
  describeFinding,
  mcpConfirmationReasons,
  scanForbidden,
} from "../sql/lib.ts";

export const PATHS = {
  terms: "content/safety/slur-terms.txt",
  allowlist: "content/safety/allowlist.txt",
  adjectives: "content/names/adjectives.txt",
  animals: "content/names/animals.txt",
  fixture: "src/engine/fixtures/moderation.json",
  migrations: "supabase/migrations",
  seedModeration: "supabase/seed/moderation.sql",
  seedNames: "supabase/seed/name-parts.sql",
  test: "supabase/tests/generated/moderation.test.sql",
  listTest: "supabase/tests/generated/moderation-list.test.sql",
} as const;

export const BLOCK_BEGIN = "-- generated:moderation-sql:begin";
export const BLOCK_END = "-- generated:moderation-sql:end";

/** A friendly-name part: a capital, then lower-case letters, 2 to 11 in all. */
const NAME_PART = /^[A-Z][a-z]{1,10}$/;
/** The longest display name a pair may make (players.nickname, PRD §3.12.1). */
export const NICKNAME_LIMIT = 24;

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ROT_FROM = `${UPPER}${UPPER.toLowerCase()}`;
const ROT_TO = rot13(ROT_FROM);

export interface Fixture {
  terms: ModerationTerm[];
  allowlist: string[];
  patterns: { word: string | null; substring: string | null };
  cases: { text: string; blocked: boolean; why: string }[];
  innocent: string[];
}

export interface Inputs {
  /** Decoded, in memory only; every message cites a line instead. */
  terms: string[];
  allowlist: string[];
  /** The ROT13 lines as the files hold them, for the seed. */
  encodedTerms: string[];
  encodedAllowlist: string[];
  adjectives: string[];
  animals: string[];
  fixture: Fixture;
}

/** One entry per line: trimmed, blank lines and # comments skipped, with its line number. */
export function parseLines(text: string): { value: string; line: number }[] {
  return text
    .split("\n")
    .map((raw, index) => ({ value: raw.trim(), line: index + 1 }))
    .filter(({ value }) => value !== "" && !value.startsWith("#"));
}

function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

export function readInputs(root: string): Inputs {
  const encodedTerms = parseLines(read(root, PATHS.terms)).map((e) => e.value);
  const encodedAllowlist = parseLines(read(root, PATHS.allowlist)).map(
    (e) => e.value,
  );
  return {
    terms: encodedTerms.map(rot13),
    allowlist: encodedAllowlist.map(rot13),
    encodedTerms,
    encodedAllowlist,
    adjectives: parseLines(read(root, PATHS.adjectives)).map((e) => e.value),
    animals: parseLines(read(root, PATHS.animals)).map((e) => e.value),
    fixture: JSON.parse(read(root, PATHS.fixture)) as Fixture,
  };
}

/** Line numbers of entries, as the files count them, for messages. */
function linesOf(root: string | null, path: string, count: number): number[] {
  if (root === null) return Array.from({ length: count }, (_, i) => i + 1);
  return parseLines(read(root, path)).map((e) => e.line);
}

/**
 * Everything wrong with the lists, or nothing. A term must be lower-case
 * words of letters and unique; an allowlist entry one word that holds a
 * substring term and no word term; a name part a capitalized word of 2 to
 * 11 letters, unique, with every pair short enough and passing the filter.
 * The fixture must declare the matches and the sources the engine gives.
 */
export function validate(inputs: Inputs, root: string | null = null): string[] {
  const problems: string[] = [];
  const termLines = linesOf(root, PATHS.terms, inputs.terms.length);
  // Spellings the filter reads alike (a run of i for a run of l) may both
  // stay: the content lint (C23) reads this file too and folds less.
  const seen = new Map<string, number>();
  inputs.terms.forEach((term, index) => {
    const line = termLines[index];
    if (!/^[a-z]+(?: [a-z]+)*$/.test(term)) {
      problems.push(
        `${PATHS.terms}:${line}: a term is lower-case letters, with single spaces between words`,
      );
      return;
    }
    const twin = seen.get(term);
    if (twin !== undefined) {
      problems.push(`${PATHS.terms}:${line}: repeats line ${termLines[twin]}`);
    }
    seen.set(term, index);
  });
  const substrings = createModerationList(
    inputs.terms.filter((t) => termMatchOf(t) === "substring"),
    [],
  );
  const words = createModerationList(
    inputs.terms.filter((t) => termMatchOf(t) === "word"),
    [],
  );
  const allowLines = linesOf(root, PATHS.allowlist, inputs.allowlist.length);
  inputs.allowlist.forEach((entry, index) => {
    const line = allowLines[index];
    if (!/^[a-z]+$/.test(entry)) {
      problems.push(
        `${PATHS.allowlist}:${line}: an entry is one lower-case word`,
      );
    } else if (!isBlocked(entry, substrings)) {
      problems.push(
        `${PATHS.allowlist}:${line}: holds no substring term, so it has nothing to allow`,
      );
    } else if (isBlocked(entry, words)) {
      problems.push(
        `${PATHS.allowlist}:${line}: is a word term or its plural, which an allowlist must never hide`,
      );
    }
  });
  const list = createModerationList(inputs.terms, inputs.allowlist);
  for (const [path, parts] of [
    [PATHS.adjectives, inputs.adjectives],
    [PATHS.animals, inputs.animals],
  ] as const) {
    const lines = linesOf(root, path, parts.length);
    const firsts = new Map<string, number>();
    parts.forEach((part, index) => {
      if (!NAME_PART.test(part)) {
        problems.push(
          `${path}:${lines[index]}: a name part is a capital and 1 to 10 lower-case letters`,
        );
      }
      const first = firsts.get(part);
      if (first !== undefined) {
        problems.push(`${path}:${lines[index]}: repeats line ${lines[first]}`);
      }
      firsts.set(part, index);
      if (isBlocked(part, list)) {
        problems.push(`${path}:${lines[index]}: holds a listed term`);
      }
    });
  }
  const longest = (parts: string[]) =>
    Math.max(0, ...parts.map((part) => part.length));
  if (
    longest(inputs.adjectives) + 1 + longest(inputs.animals) >
    NICKNAME_LIMIT
  ) {
    problems.push(
      `content/names/: the longest adjective and animal make more than ${NICKNAME_LIMIT} characters`,
    );
  }
  const adjectiveLines = linesOf(
    root,
    PATHS.adjectives,
    inputs.adjectives.length,
  );
  const animalLines = linesOf(root, PATHS.animals, inputs.animals.length);
  inputs.adjectives.forEach((adjective, i) => {
    inputs.animals.forEach((animal, j) => {
      if (isBlocked(`${adjective} ${animal}`, list)) {
        problems.push(
          `content/names/: ${PATHS.adjectives}:${adjectiveLines[i]} with ${PATHS.animals}:${animalLines[j]} makes a name that holds a listed term`,
        );
      }
    });
  });
  const { fixture } = inputs;
  for (const term of fixture.terms) {
    if (termMatchOf(term.term) !== term.match) {
      problems.push(
        `${PATHS.fixture}: "${term.term}" is declared ${term.match}, but the rule says ${termMatchOf(term.term)}`,
      );
    }
  }
  const patterns = moderationPatterns(fixture.terms);
  if (
    patterns.word !== fixture.patterns.word ||
    patterns.substring !== fixture.patterns.substring
  ) {
    problems.push(
      `${PATHS.fixture}: patterns differ from what the engine compiles; update them to ${JSON.stringify({ word: patterns.word, substring: patterns.substring })}`,
    );
  }
  return problems;
}

// ---------------------------------------------------------------------------
// SQL text
// ---------------------------------------------------------------------------

/**
 * A string literal: plain when the text is printable ASCII, otherwise U&''
 * with \XXXX escapes, so a generated file holds no character a reviewer
 * cannot see and no backslash-u that a tool could rewrite.
 */
export function sqlText(text: string): string {
  let plain = true;
  let escaped = "";
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (char === "'") escaped += "''";
    else if (char === "\\") escaped += "\\\\";
    else if (code >= 0x20 && code <= 0x7e) escaped += char;
    else {
      plain = false;
      escaped +=
        code > 0xffff
          ? `\\+${code.toString(16).toUpperCase().padStart(6, "0")}`
          : `\\${code.toString(16).toUpperCase().padStart(4, "0")}`;
    }
  }
  return plain ? `'${escaped.replaceAll("\\\\", "\\")}'` : `U&'${escaped}'`;
}

/**
 * A long literal as chunks joined by ||, each line at most `width`
 * characters after `indent`; chunks split between characters, never inside
 * an escape.
 */
export function sqlTextWrapped(
  text: string,
  indent: string,
  width = 100,
): string {
  const chunks: string[] = [];
  let chunk = "";
  for (const char of text) {
    if (
      chunk !== "" &&
      sqlText(chunk + char).length + 3 > width - indent.length
    ) {
      chunks.push(sqlText(chunk));
      chunk = "";
    }
    chunk += char;
  }
  chunks.push(sqlText(chunk));
  return chunks.join(` ||\n${indent}`);
}

/** A SQL text array of literals. */
function sqlArray(values: readonly string[]): string {
  return values.length === 0
    ? "'{}'::text[]"
    : `array[${values.map(sqlText).join(", ")}]::text[]`;
}

/** ROT13 text decoded by translate() as SQL reads it. */
function decoded(literal: string): string {
  return `translate(${literal}, '${ROT_FROM}', '${ROT_TO}')`;
}

/** Wraps `items` onto lines of at most `width` characters, each indented. */
function wrap(items: readonly string[], indent: string, width = 100): string {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    const next = line === "" ? item : `${line}, ${item}`;
    if (indent.length + next.length > width && line !== "") {
      lines.push(`${indent}${line},`);
      line = item;
    } else line = next;
  }
  if (line !== "") lines.push(`${indent}${line}`);
  return lines.join("\n");
}

function header(sources: string, about: string[]): string {
  return [
    `-- Generated by npm run codegen:moderation (scripts/codegen/moderation-sql.ts) from ${sources}.`,
    "-- Do not edit: scripts/codegen/moderation-sql.test.ts regenerates it and fails on any difference.",
    ...about.map((line) => `-- ${line}`),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The migration block
// ---------------------------------------------------------------------------

/** private.fold_text and private.moderation_swaps, from the engine's tables. */
export function foldBlock(): string {
  const kept = FOLD_BASE.filter((entry) => entry.to !== "");
  const removed = FOLD_BASE.filter((entry) => entry.to === "");
  const ascii = (entries: typeof FOLD_BASE) =>
    entries.filter((entry) => (entry.from.codePointAt(0) as number) < 0x80);
  const from = (entries: typeof FOLD_BASE) =>
    entries.map((entry) => entry.from).join("");
  const to = (entries: typeof FOLD_BASE) =>
    entries.map((entry) => entry.to).join("");
  const swapFrom = sqlText(from(FOLD_SWAPS));
  const swapTo = sqlText(to(FOLD_SWAPS));
  return [
    BLOCK_BEGIN,
    "-- Written by npm run codegen:moderation from src/engine/text/moderation.ts. Edit the",
    "-- engine and regenerate; never edit this block.",
    "",
    `-- Steps 1 and 2 (the engine's foldText): NFKC, then the folding table, ${kept.length}`,
    `-- characters to their letters and ${removed.length} removed. ASCII text skips NFKC, which`,
    "-- changes no ASCII, and uses the table's ASCII rows alone.",
    "create or replace function private.fold_text(p_text text)",
    "returns text",
    "language sql",
    "immutable",
    "set search_path = ''",
    "as $$",
    "  select case",
    "    when octet_length(p_text) = char_length(p_text) then",
    "      translate(p_text,",
    `        ${sqlTextWrapped(from([...ascii(kept), ...ascii(removed)]), "        ")},`,
    `        ${sqlTextWrapped(to(ascii(kept)), "        ")})`,
    "    else",
    "      translate(normalize(p_text, nfkc),",
    `        ${sqlTextWrapped(from([...kept, ...removed]), "        ")},`,
    `        ${sqlTextWrapped(to(kept), "        ")})`,
    "  end",
    "$$;",
    "",
    "-- Step 3 for one pass (the engine's applySwaps): swaps reads every swap",
    "-- character as its letter; bangs first turns the exclamation marks that end",
    "-- a word into separators, and edges every swap character that ends a word;",
    "-- plain reads none.",
    "create or replace function private.moderation_swaps(p_folded text, p_pass text)",
    "returns text",
    "language sql",
    "immutable",
    "set search_path = ''",
    "as $$",
    "  select case p_pass",
    "    when 'plain' then p_folded",
    `    when 'swaps' then translate(p_folded, ${swapFrom}, ${swapTo})`,
    "    when 'bangs' then translate(",
    `      regexp_replace(p_folded, ${sqlText(TRAILING_BANGS)}, ' ', 'g'),`,
    `      ${swapFrom}, ${swapTo})`,
    "    when 'edges' then translate(",
    `      regexp_replace(p_folded, ${sqlText(TRAILING_SWAPS)}, ' ', 'g'),`,
    `      ${swapFrom}, ${swapTo})`,
    "  end",
    "$$;",
    BLOCK_END,
  ].join("\n");
}

/** The migration with its generated block replaced. */
export function replaceBlock(migration: string, block: string): string {
  const begin = migration.indexOf(BLOCK_BEGIN);
  const end = migration.indexOf(BLOCK_END, begin);
  if (begin === -1 || end === -1) {
    throw new Error(`no ${BLOCK_BEGIN} ... ${BLOCK_END} block`);
  }
  return `${migration.slice(0, begin)}${block}${migration.slice(end + BLOCK_END.length)}`;
}

/**
 * The newest migration that holds a block: applied migrations are never
 * edited, so a change to the folding table goes into a new migration with
 * an empty block of its own.
 */
export function blockMigration(root: string): string {
  const files = readdirSync(join(root, PATHS.migrations))
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .reverse();
  const file = files.find((name) =>
    read(root, `${PATHS.migrations}/${name}`).includes(BLOCK_BEGIN),
  );
  if (file === undefined) {
    throw new Error(`no migration holds ${BLOCK_BEGIN}`);
  }
  return `${PATHS.migrations}/${file}`;
}

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------

export function moderationSeed(inputs: Inputs): string {
  const terms = inputs.encodedTerms.map(
    (encoded, index) =>
      `(${sqlText(encoded)}, '${termMatchOf(inputs.terms[index] as string)}')`,
  );
  const out = [
    header("content/safety/slur-terms.txt and allowlist.txt", [
      "The slur filter's lists (MOD-1, ARCHITECTURE §8.13, §8.16), loaded with execute_sql after the migration",
      "20261104000700_moderation. The entries stay ROT13-encoded here, as in content/safety/, and translate()",
      "decodes them as they load, so no term shows up in the repository. A match is the engine's termMatchOf.",
      "Loading it again changes nothing. An entry that left its list is retired with active = false, never",
      "removed (supabase/README.md §1).",
    ]),
    "",
  ];
  if (terms.length === 0) {
    out.push(
      "update private.moderation_terms",
      "   set active = false",
      " where active;",
    );
  } else {
    out.push(
      "with listed (term, match) as (",
      `  select ${decoded("v.term")}, v.match`,
      "    from (values",
      wrap(terms, "      "),
      "    ) as v (term, match)",
      "), loaded as (",
      "  insert into private.moderation_terms as t (term, match, active)",
      "  select l.term, l.match, true",
      "    from listed l",
      "  on conflict (term) do update",
      "    set match = excluded.match, active = true",
      "  returning t.term",
      ")",
      "update private.moderation_terms",
      "   set active = false",
      " where active",
      "   and term not in (select l.term from listed l);",
    );
  }
  out.push("");
  if (inputs.encodedAllowlist.length === 0) {
    out.push(
      "update private.moderation_allow",
      "   set active = false",
      " where active;",
    );
  } else {
    out.push(
      "with listed (word) as (",
      `  select ${decoded("v.word")}`,
      "    from (values",
      wrap(
        inputs.encodedAllowlist.map((e) => `(${sqlText(e)})`),
        "      ",
      ),
      "    ) as v (word)",
      "), loaded as (",
      "  insert into private.moderation_allow as a (word, active)",
      "  select l.word, true",
      "    from listed l",
      "  on conflict (word) do update",
      "    set active = true",
      "  returning a.word",
      ")",
      "update private.moderation_allow",
      "   set active = false",
      " where active",
      "   and word not in (select l.word from listed l);",
    );
  }
  return `${out.join("\n")}\n`;
}

export function namePartsSeed(inputs: Inputs): string {
  const rows = [
    ...inputs.adjectives.map((word) => `('adjective', ${sqlText(word)})`),
    ...inputs.animals.map((word) => `('animal', ${sqlText(word)})`),
  ];
  return `${[
    header("content/names/adjectives.txt and animals.txt", [
      "The reviewed friendly-name parts (MOD-1, PRD §3.10.1), loaded with execute_sql after the migration",
      "20261104000700_moderation. private.friendly_name_for draws from the active words and set_nickname accepts",
      `a generated name only as an active pair: ${inputs.adjectives.length} adjectives and ${inputs.animals.length} animals, ${inputs.adjectives.length * inputs.animals.length} names.`,
      "Loading it again changes nothing. A word that left its list is retired with active = false, never",
      "removed, so a player's stored name keeps its words (supabase/README.md §1).",
    ]),
    "",
    "with listed (kind, word) as (",
    "  values",
    wrap(rows, "    "),
    "), loaded as (",
    "  insert into private.name_parts as n (kind, word, active)",
    "  select l.kind, l.word, true",
    "    from listed l",
    "  on conflict (kind, word) do update",
    "    set active = true",
    "  returning n.word",
    ")",
    "update private.name_parts",
    "   set active = false",
    " where active",
    "   and (kind, word) not in (select l.kind, l.word from listed l);",
  ].join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Parity tests
// ---------------------------------------------------------------------------

const MARKS: Readonly<Record<string, string>> = {
  a: "á",
  c: "ç",
  e: "é",
  i: "í",
  n: "ñ",
  o: "ö",
  s: "š",
  u: "ü",
  y: "ý",
  z: "ž",
};
const LEET: Readonly<Record<string, string>> = {
  a: "4",
  e: "3",
  i: "1",
  l: "|",
  o: "0",
  s: "$",
  t: "7",
};
/** Cyrillic letters that look like these Latin ones. */
const CYRILLIC: Readonly<Record<string, number>> = {
  a: 0x0430,
  c: 0x0441,
  e: 0x0435,
  i: 0x0456,
  k: 0x043a,
  o: 0x043e,
  p: 0x0440,
  x: 0x0445,
  y: 0x0443,
};

/** Each letter of a term through `f`; spaces kept. */
function eachLetter(term: string, f: (letter: string) => string): string {
  return [...term].map((c) => (c === " " ? c : f(c))).join("");
}

/**
 * A listed term under each normalization of AC-LNT-03, as a player might
 * type it: case, diacritics, swaps, repeats, separators (dots, spaced
 * letters), look-alike letters, a hidden character between letters, a
 * plural, and swaps ending in an exclamation mark.
 */
export function termVariants(term: string): string[] {
  const letters = (separator: string, between: string) =>
    term
      .split(" ")
      .map((word) => [...word].join(separator))
      .join(between);
  return [
    term.toUpperCase(),
    eachLetter(term, (c) => MARKS[c] ?? c),
    eachLetter(term, (c) => LEET[c] ?? c),
    eachLetter(term, (c) => c.repeat(3)),
    letters(".", " "),
    letters(" ", "   "),
    eachLetter(term, (c) =>
      CYRILLIC[c] === undefined ? c : String.fromCodePoint(CYRILLIC[c]),
    ),
    letters(String.fromCodePoint(0x200b), " "),
    `${term}s`,
    `${eachLetter(term, (c) => LEET[c] ?? c)}!`,
  ];
}

/** Sample texts for the step-by-step checks: every table row, every removal, ASCII, swaps. */
export function stepSamples(): {
  fold: string[];
  swaps: string[];
  words: string[];
} {
  const kept = FOLD_BASE.filter((entry) => entry.to !== "");
  const removed = FOLD_BASE.filter((entry) => entry.to === "");
  const printable = Array.from({ length: 0x7f - 0x20 }, (_, i) =>
    String.fromCharCode(0x20 + i),
  ).join("");
  return {
    fold: [
      kept.map((entry) => entry.from).join(""),
      removed.map((entry) => `x${entry.from}`).join(""),
      printable,
      `Ce${String.fromCodePoint(0x0301)}line ${String.fromCodePoint(0xfb01)}ne ${String.fromCodePoint(0xff28, 0xff49)} ${String.fromCodePoint(0x1d42c)}x`,
    ],
    swaps: [
      FOLD_SWAPS.map((entry) => entry.from).join(" "),
      "h3ll0 w0r1d! $|@7 r07! h3n!1 b0b5 5ad 4!! x|y",
    ],
    words: [
      "H.E.N and Heeeen, h e n!",
      "a b cd e f",
      "h3n!1 1hen hen1 $hen",
      `zorb${String.fromCodePoint(0x200b)}lax ${String.fromCodePoint(0x0436)}x y z`,
      "  ",
      "2026 *** !!!",
    ],
  };
}

function caseRows(cases: Fixture["cases"]): string {
  return wrap(
    cases.map(
      (row, index) => `(${index + 1}, ${sqlText(row.text)}, ${row.blocked})`,
    ),
    "      ",
  );
}

/** Retires the live lists inside the test's transaction and loads a list of its own. */
function loadList(
  terms: readonly { literal: string; match: TermMatch }[],
  allow: readonly string[],
): string[] {
  const out = [
    "  update private.moderation_terms set active = false where active;",
    "  update private.moderation_allow set active = false where active;",
  ];
  if (terms.length > 0) {
    out.push(
      "  insert into private.moderation_terms (term, match, active)",
      "  select v.term, v.match, true",
      "    from (values",
      wrap(
        terms.map((t) => `(${t.literal}, '${t.match}')`),
        "      ",
      ),
      "    ) as v (term, match)",
      "  on conflict (term) do update set match = excluded.match, active = true;",
    );
  }
  if (allow.length > 0) {
    out.push(
      "  insert into private.moderation_allow (word, active)",
      "  select v.word, true",
      `    from unnest(${`array[${allow.join(", ")}]::text[]`}) as v (word)`,
      "  on conflict (word) do update set active = true;",
    );
  }
  return out;
}

function sqlTextArray(values: readonly string[]): string {
  return `array[${values.map(sqlText).join(", ")}]::text[]`;
}

export function parityTest(inputs: Inputs): string {
  const { fixture } = inputs;
  const patterns = moderationPatterns(fixture.terms);
  const samples = stepSamples();
  const stepAsserts: string[] = [];
  samples.fold.forEach((text, index) => {
    stepAsserts.push(
      `  assert private.fold_text(${sqlTextWrapped(text, "      ")})`,
      `    = ${sqlTextWrapped(foldText(text), "      ")},`,
      `    'fold_text, sample ${index + 1}';`,
    );
  });
  samples.swaps.forEach((text, index) => {
    for (const pass of PASSES) {
      const folded = foldText(text);
      stepAsserts.push(
        `  assert private.moderation_swaps(${sqlText(folded)}, '${pass}')`,
        `       = ${sqlText(applySwaps(folded, pass))}, 'moderation_swaps, sample ${index + 1}, ${pass}';`,
      );
    }
  });
  samples.words.forEach((text, index) => {
    for (const pass of PASSES) {
      const words = normalizeForFilter(text, pass as FilterPass);
      stepAsserts.push(
        `  assert private.moderation_words(${sqlText(text)}, '${pass}') = ${words.length === 0 ? "'{}'::text[]" : sqlTextArray(words)},`,
        `    'moderation_words, sample ${index + 1}, ${pass}';`,
      );
    }
  });
  const out = [
    header(`${PATHS.fixture} and src/engine/text/moderation.ts`, [
      "AC-LNT-03: SQL's filter returns the engine's verdicts on the same inputs. First each reading step on",
      "sample texts; then the fixture's stand-in list, which must compile to the sources the engine builds and",
      "give every case the engine's verdict while the innocent words pass. The list loads inside the transaction;",
      "moderation-list.test.sql holds the real list to the same rules.",
    ]),
    "begin;",
    "",
    "do $$",
    "begin",
    ...stepAsserts,
    "end",
    "$$;",
    "select 'PASS AC-LNT-03 fold_text, the swaps and the words read match the engine step for step';",
    "",
    "do $$",
    "declare",
    "  v_list private.moderation_list;",
    "  v_case record;",
    "begin",
    ...loadList(
      fixture.terms.map((t) => ({ literal: sqlText(t.term), match: t.match })),
      fixture.allowlist.map(sqlText),
    ),
    "  v_list := private.moderation_list();",
    `  assert v_list.word_re = ${sqlText(patterns.word ?? "")},`,
    "    format('the fixture word pattern is %s', v_list.word_re);",
    `  assert v_list.substring_re = ${sqlText(patterns.substring ?? "")},`,
    "    format('the fixture substring pattern is %s', v_list.substring_re);",
    `  assert v_list.allow = ${sqlArray(allowedWords(fixture.allowlist))},`,
    "    format('the fixture allowlist reads %s', v_list.allow);",
    "  for v_case in",
    "    select * from (values",
    caseRows(fixture.cases),
    "    ) as c (n, text, blocked)",
    "  loop",
    "    assert private.text_blocked_by(v_case.text, v_list) = v_case.blocked,",
    "      format('fixture case %s should be blocked: %s', v_case.n, v_case.blocked);",
    "    assert private.text_is_blocked(v_case.text) = v_case.blocked,",
    "      format('fixture case %s through text_is_blocked', v_case.n);",
    "  end loop;",
    "  for v_case in",
    "    select w.word, w.n",
    `      from unnest(${sqlArray(fixture.innocent)}) with ordinality as w (word, n)`,
    "  loop",
    "    assert not private.text_blocked_by(v_case.word, v_list),",
    "      format('innocent word %s (%s) was blocked', v_case.n, v_case.word);",
    "  end loop;",
    "end",
    "$$;",
    "select 'PASS AC-LNT-03 the fixture list compiles to the engine sources, every case gets the engine verdict, and 100 innocent words that hold a short listed string pass';",
    "rollback;",
  ];
  return `${out.join("\n")}\n`;
}

/**
 * The real list's tests: each term caught under each normalization, its
 * spellings ROT13-encoded as in content/safety/ (the engine meets the same
 * spellings in scripts/codegen/moderation-sql.test.ts), and every friendly
 * name passing. Messages give counts, never a term.
 */
export function listTest(inputs: Inputs): string {
  const realTerms = inputs.encodedTerms.map((encoded, index) => ({
    literal: decoded(sqlText(encoded)),
    match: termMatchOf(inputs.terms[index] as string),
  }));
  const variants = inputs.terms.flatMap((term) =>
    termVariants(term).map((variant) => sqlText(rot13(variant))),
  );
  const out = [
    header("content/safety/ and content/names/", [
      "AC-LNT-03 for the real list, which stays ROT13-encoded here as in content/safety/ and loads inside the",
      "transaction: SQL catches each listed term under each normalization, as the engine does with the same",
      "spellings. Then every friendly name from content/names/ passes. Messages give counts, never a term.",
    ]),
    "begin;",
    "",
    "do $$",
    "declare",
    "  v_list private.moderation_list;",
    "  v_missed integer;",
    "begin",
    ...loadList(
      realTerms,
      inputs.encodedAllowlist.map((e) => decoded(sqlText(e))),
    ),
    "  v_list := private.moderation_list();",
    `  assert cardinality(v_list.allow) = ${allowedWords(inputs.allowlist).length}, 'the allowlist loads';`,
    "  select count(*) into v_missed",
    "    from (values",
    wrap(
      variants.map((v) => `(${v})`),
      "      ",
    ),
    "    ) as v (variant)",
    `   where not private.text_blocked_by(${decoded("v.variant")}, v_list);`,
    "  assert v_missed = 0, format('%s spellings of listed terms passed the filter', v_missed);",
    "end",
    "$$;",
    `select 'PASS AC-LNT-03 the list catches each of its ${inputs.terms.length} terms under each normalization (${termVariants("ab").length} spellings each)';`,
    "",
    "do $$",
    "declare",
    "  v_list private.moderation_list := private.moderation_list();",
    "  v_blocked integer;",
    "begin",
    "  select count(*) into v_blocked",
    `    from unnest(${sqlArray(inputs.adjectives)}) as a (word)`,
    `   cross join unnest(${sqlArray(inputs.animals)}) as b (word)`,
    "   where private.text_blocked_by(a.word || ' ' || b.word, v_list);",
    "  assert v_blocked = 0, format('%s friendly names hold a listed term', v_blocked);",
    "end",
    "$$;",
    `select 'PASS MOD-1 no friendly name holds a listed term (all ${inputs.adjectives.length * inputs.animals.length} pairs of content/names/ checked)';`,
    "rollback;",
  ];
  return `${out.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------

export interface Output {
  path: string;
  content: string;
}

/** Every generated file, with its new content. */
export function generate(root: string): Output[] {
  const inputs = readInputs(root);
  const migration = blockMigration(root);
  return [
    {
      path: migration,
      content: replaceBlock(read(root, migration), foldBlock()),
    },
    { path: PATHS.seedModeration, content: moderationSeed(inputs) },
    { path: PATHS.seedNames, content: namePartsSeed(inputs) },
    { path: PATHS.test, content: parityTest(inputs) },
    { path: PATHS.listTest, content: listTest(inputs) },
  ];
}

/** Words a substring term would block, ROT13-encoded, for the allowlist review. */
export function allowlistCandidates(inputs: Inputs, words: unknown): string[] {
  if (!Array.isArray(words) || !words.every((w) => typeof w === "string")) {
    throw new Error("--candidates takes a JSON array of words");
  }
  const substrings = createModerationList(
    inputs.terms.filter((term) => termMatchOf(term) === "substring"),
    inputs.allowlist,
  );
  return [...new Set(words as string[])]
    .filter((word) => isBlocked(word, substrings))
    .map(rot13);
}

/** Problems that would stop the MCP or break the project's rules, per output. */
export function unattendedProblems(outputs: readonly Output[]): string[] {
  const problems: string[] = [];
  for (const { path, content } of outputs) {
    problems.push(...scanForbidden(path, content).map(describeFinding));
    for (const reason of mcpConfirmationReasons(content)) {
      problems.push(`${path}: the MCP would ask a human to confirm: ${reason}`);
    }
  }
  return problems;
}

export function main(argv: string[], root = process.cwd()): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      check: { type: "boolean", default: false },
      candidates: { type: "string" },
    },
    strict: true,
  });
  const inputs = readInputs(root);
  if (values.candidates !== undefined) {
    const words: unknown = JSON.parse(readFileSync(values.candidates, "utf8"));
    const found = allowlistCandidates(inputs, words);
    for (const word of found) process.stdout.write(`${word}\n`);
    console.error(
      `codegen:moderation: ${found.length} word(s) a substring term would block, ROT13-encoded; decode them locally to review`,
    );
    return 0;
  }
  const problems = validate(inputs, root);
  if (problems.length > 0) {
    console.error("codegen:moderation: the lists need fixing first:");
    for (const problem of problems) console.error(`  ${problem}`);
    return 1;
  }
  const outputs = generate(root);
  const unattended = unattendedProblems(outputs);
  if (unattended.length > 0) {
    console.error(
      "codegen:moderation: refused, the SQL would not apply unattended:",
    );
    for (const problem of unattended) console.error(`  ${problem}`);
    return 1;
  }
  const stale = outputs.filter(({ path, content }) => {
    try {
      return read(root, path) !== content;
    } catch {
      return true;
    }
  });
  if (values.check) {
    for (const { path } of stale) {
      console.error(
        `codegen:moderation: ${path} differs from what codegen:moderation writes: run npm run codegen:moderation and commit the result`,
      );
    }
    return stale.length === 0 ? 0 : 1;
  }
  for (const { path, content } of stale)
    writeFileSync(join(root, path), content);
  console.error(
    `codegen:moderation: ${inputs.terms.length} term(s), ${inputs.allowlist.length} allowlisted word(s), ${inputs.adjectives.length} x ${inputs.animals.length} names; wrote ${stale.length} file(s)`,
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
    console.error(`codegen:moderation: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
