// @vitest-environment node
/**
 * scripts/codegen/moderation-sql.ts (MOD-1): the committed SQL is what the
 * generator writes from today's lists and engine, the lists pass their own
 * checks, and the checks catch what they exist for. Messages name files and
 * lines, never a decoded term, and no decoded term reaches a generated
 * file. The real list stays decoded in memory: findings count or locate,
 * never quote.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import {
  createModerationList,
  isBlocked,
  rot13,
} from "../../src/engine/text/moderation.ts";
import {
  BLOCK_BEGIN,
  BLOCK_END,
  PATHS,
  allowlistCandidates,
  blockMigration,
  foldBlock,
  generate,
  main,
  parseLines,
  readInputs,
  replaceBlock,
  sqlText,
  sqlTextWrapped,
  termVariants,
  unattendedProblems,
  validate,
  type Inputs,
} from "./moderation-sql.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const fixture = readInputs(ROOT).fixture;

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** Inputs from plain lists, as readInputs would decode them. */
function inputs(lists: {
  terms?: string[];
  allowlist?: string[];
  adjectives?: string[];
  animals?: string[];
}): Inputs {
  const terms = lists.terms ?? ["hen", "zorblax", "no go"];
  const allowlist = lists.allowlist ?? ["zorblaxton"];
  return {
    terms,
    allowlist,
    encodedTerms: terms.map(rot13),
    encodedAllowlist: allowlist.map(rot13),
    adjectives: lists.adjectives ?? ["Brave", "Plucky"],
    animals: lists.animals ?? ["Otter", "Newt"],
    fixture,
  };
}

/** A small repository the generator can run in: stand-in lists, a migration with an empty block. */
function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "qz-moderation-sql-"));
  temps.push(root);
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put(
    PATHS.terms,
    `# stand-ins\n${["hen", "zorblax", "no go"].map(rot13).join("\n")}\n`,
  );
  put(PATHS.allowlist, `${rot13("zorblaxton")}\n`);
  put(PATHS.adjectives, "Brave\nPlucky\n");
  put(PATHS.animals, "Otter\nNewt\n");
  put(PATHS.fixture, readFileSync(join(ROOT, PATHS.fixture), "utf8"));
  put(`${PATHS.migrations}/20990101000000_old.sql`, "select 1;\n");
  put(
    `${PATHS.migrations}/20990101000100_moderation.sql`,
    `select 1;\n${BLOCK_BEGIN}\n${BLOCK_END}\nselect 2;\n`,
  );
  return root;
}

describe("the committed SQL", () => {
  it("is exactly what codegen:moderation writes: the fold maps, both seeds and both generated tests", () => {
    const outputs = generate(ROOT);
    expect(outputs.map((output) => output.path)).toEqual([
      "supabase/migrations/20261104000700_moderation.sql",
      PATHS.seedModeration,
      PATHS.seedNames,
      PATHS.test,
      PATHS.listTest,
    ]);
    const stale = outputs
      .filter(
        ({ path, content }) =>
          readFileSync(join(ROOT, path), "utf8") !== content,
      )
      .map(({ path }) => path);
    expect(stale).toEqual([]);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(main(["--check"], ROOT)).toBe(0);
    expect(errors).not.toHaveBeenCalled();
  });

  it("would apply unattended: nothing the MCP stops for, no word the project forbids", () => {
    expect(unattendedProblems(generate(ROOT))).toEqual([]);
  });

  it("holds no decoded term: the seed and the list test keep every term ROT13-encoded", () => {
    const { terms } = readInputs(ROOT);
    expect(terms.length).toBeGreaterThan(0);
    const leaks = generate(ROOT).flatMap(({ path, content }) =>
      terms.flatMap((term, t) =>
        content.includes(`'${term}'`) ? [`${path}: term ${t + 1}`] : [],
      ),
    );
    expect(leaks).toEqual([]);
  });

  it("seeds what content/ lists: every term and allowlist entry as encoded, every name part", () => {
    const real = readInputs(ROOT);
    const seed = readFileSync(join(ROOT, PATHS.seedModeration), "utf8");
    const names = readFileSync(join(ROOT, PATHS.seedNames), "utf8");
    const missing = [
      ...real.encodedTerms.filter((term) => !seed.includes(`'${term}'`)),
      ...real.encodedAllowlist.filter((word) => !seed.includes(`'${word}'`)),
      ...real.adjectives.filter((part) => !names.includes(`'${part}'`)),
      ...real.animals.filter((part) => !names.includes(`'${part}'`)),
    ];
    expect(missing).toEqual([]);
  });
});

describe("the lists in content/", () => {
  it("pass every check, the 22,638 friendly names included", () => {
    const real = readInputs(ROOT);
    expect(real.adjectives.length * real.animals.length).toBe(22_638);
    expect(validate(real, ROOT)).toEqual([]);
  });

  it("AC-LNT-03 termVariants spells each term ten ways, and the engine catches every one for the fixture list", () => {
    const list = createModerationList(fixture.terms, fixture.allowlist);
    const missed: string[] = [];
    for (const { term } of fixture.terms) {
      const variants = termVariants(term);
      expect(new Set(variants).size).toBe(10);
      variants.forEach((variant, v) => {
        if (!isBlocked(variant, list))
          missed.push(`${term}, spelling ${v + 1}`);
      });
    }
    expect(missed).toEqual([]);
  });
});

describe("validate", () => {
  it("passes the stand-in lists", () => {
    expect(validate(inputs({}))).toEqual([]);
  });

  it("refuses a malformed or repeated term, naming the line and never the term", () => {
    const problems = validate(
      inputs({ terms: ["hen", "Zorblax", "hen", "no  go"] }),
    );
    expect(problems).toEqual([
      `${PATHS.terms}:2: a term is lower-case letters, with single spaces between words`,
      `${PATHS.terms}:3: repeats line 1`,
      `${PATHS.terms}:4: a term is lower-case letters, with single spaces between words`,
    ]);
    expect(problems.join("\n")).not.toMatch(/hen|zorblax/i);
  });

  it("refuses an allowlist entry with nothing to allow, or one that would hide a word term", () => {
    expect(validate(inputs({ allowlist: ["apple", "Zorblaxton"] }))).toEqual([
      `${PATHS.allowlist}:1: holds no substring term, so it has nothing to allow`,
      `${PATHS.allowlist}:2: an entry is one lower-case word`,
    ]);
    // "glimmes" holds the substring term and is the word term's plural.
    expect(
      validate(inputs({ terms: ["glimm", "glimme"], allowlist: ["glimmes"] })),
    ).toEqual([
      `${PATHS.allowlist}:1: is a word term or its plural, which an allowlist must never hide`,
    ]);
  });

  it("refuses a name part that is malformed, repeated or listed, a pair that makes a listed term, and pairs too long for a nickname", () => {
    const problems = validate(
      inputs({
        terms: ["otter", "no go"],
        allowlist: [],
        adjectives: ["No", "brave", "No", "Abcdefghijklmnopqrst"],
        animals: ["Otter", "Go"],
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        `${PATHS.adjectives}:2: a name part is a capital and 1 to 10 lower-case letters`,
        `${PATHS.adjectives}:3: repeats line 1`,
        `${PATHS.adjectives}:4: a name part is a capital and 1 to 10 lower-case letters`,
        `${PATHS.animals}:1: holds a listed term`,
        "content/names/: the longest adjective and animal make more than 24 characters",
        `content/names/: ${PATHS.adjectives}:1 with ${PATHS.animals}:2 makes a name that holds a listed term`,
      ]),
    );
  });

  it("names lines as the files count them, comments and blank lines included", () => {
    const root = sandbox();
    writeFileSync(
      join(root, PATHS.terms),
      `# a comment\n\n${["hen", "Hen", "zorblax"].map(rot13).join("\n")}\n`,
    );
    expect(validate(readInputs(root), root)).toEqual([
      `${PATHS.terms}:4: a term is lower-case letters, with single spaces between words`,
    ]);
  });

  it("holds the fixture to the engine: declared matches and compiled sources", () => {
    const wrong = {
      ...fixture,
      terms: [{ term: "zorblax", match: "word" as const }],
    };
    const problems = validate({ ...inputs({}), fixture: wrong });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toBe(
      `${PATHS.fixture}: "zorblax" is declared word, but the rule says substring`,
    );
    expect(problems[1]).toMatch(
      /patterns differ from what the engine compiles/,
    );
  });
});

describe("SQL text", () => {
  it("keeps printable ASCII plain and escapes everything else for U&, with no backslash-u anywhere", () => {
    expect(sqlText("it's")).toBe("'it''s'");
    expect(sqlText("a\\b")).toBe("'a\\b'");
    expect(sqlText("café")).toBe("U&'caf\\00E9'");
    expect(sqlText("a\\é")).toBe("U&'a\\\\\\00E9'");
    expect(sqlText(String.fromCodePoint(0x1d42c))).toBe("U&'\\+01D42C'");
    expect(sqlText(String.fromCodePoint(0x200b))).toBe("U&'\\200B'");
    const block = foldBlock();
    expect(block).not.toMatch(/\\u/i);
    // Nothing a reviewer can't see: printable ASCII and newlines only.
    expect(block).toMatch(/^[\x20-\x7e\n]+$/);
  });

  it("wraps a long literal into chunks of at most the width, never inside an escape", () => {
    const text = `${"é".repeat(30)}${"x".repeat(40)}`;
    const wrapped = sqlTextWrapped(text, "  ", 40);
    const lines = wrapped.split("\n");
    expect(lines.length).toBeGreaterThan(2);
    expect(
      lines.every((line, i) => (i === 0 ? line : line.slice(2)).length <= 38),
    ).toBe(true);
    // Every escape whole within its own literal.
    expect(
      lines.every((line) => !/\\(?![0-9A-F]{4}|\+[0-9A-F]{6})/.test(line)),
    ).toBe(true);
    expect(
      lines.every((line) => /^ *(?:U&)?'[^']*'(?: \|\|)?$/.test(line)),
    ).toBe(true);
  });

  it("replaces only the generated block, and refuses a migration without one", () => {
    const migration = `before\n${BLOCK_BEGIN}\nold\n${BLOCK_END}\nafter\n`;
    expect(replaceBlock(migration, `${BLOCK_BEGIN}\nnew\n${BLOCK_END}`)).toBe(
      `before\n${BLOCK_BEGIN}\nnew\n${BLOCK_END}\nafter\n`,
    );
    expect(() => replaceBlock("select 1;", "x")).toThrow(BLOCK_BEGIN);
  });

  it("puts the block in the newest migration that holds one", () => {
    const root = sandbox();
    expect(blockMigration(root)).toBe(
      `${PATHS.migrations}/20990101000100_moderation.sql`,
    );
    writeFileSync(
      join(root, PATHS.migrations, "20990101000200_later.sql"),
      "select 3;\n",
    );
    expect(blockMigration(root)).toBe(
      `${PATHS.migrations}/20990101000100_moderation.sql`,
    );
    rmSync(join(root, PATHS.migrations, "20990101000100_moderation.sql"));
    expect(() => blockMigration(root)).toThrow(BLOCK_BEGIN);
  });
});

describe("main", () => {
  it("writes every file, then --check finds them current, and a hand edit stale", () => {
    const root = sandbox();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(main([], root)).toBe(0);
    const migration = readFileSync(
      join(root, PATHS.migrations, "20990101000100_moderation.sql"),
      "utf8",
    );
    expect(migration).toContain("create or replace function private.fold_text");
    expect(migration.startsWith("select 1;\n")).toBe(true);
    expect(migration.endsWith("\nselect 2;\n")).toBe(true);
    expect(main(["--check"], root)).toBe(0);

    writeFileSync(join(root, PATHS.seedNames), "-- edited by hand\n");
    errors.mockClear();
    expect(main(["--check"], root)).toBe(1);
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining(`${PATHS.seedNames} differs`),
    );
  });

  it("writes nothing while a list needs fixing, and says where without quoting it", () => {
    const root = sandbox();
    writeFileSync(
      join(root, PATHS.terms),
      `${rot13("hen")}\n${rot13("hen")}\n`,
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(main([], root)).toBe(1);
    const said = errors.mock.calls.flat().join("\n");
    expect(said).toContain(`${PATHS.terms}:2: repeats line 1`);
    expect(said).not.toMatch(/hen/i);
    expect(() => readFileSync(join(root, PATHS.seedModeration))).toThrow();
  });

  it("--candidates prints the words a substring term would block, ROT13-encoded", () => {
    const root = sandbox();
    const words = join(root, "words.json");
    writeFileSync(
      words,
      JSON.stringify([
        "Zorblaxian",
        "Zorblaxton",
        "hens",
        "apple",
        "Zorblaxian",
      ]),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const status = main(["--candidates", words], root);
    const printed = out.mock.calls.map(([text]) => text);
    out.mockRestore();
    expect(status).toBe(0);
    // The allowlisted word and the word term's plural are not candidates.
    expect(printed).toEqual([`${rot13("Zorblaxian")}\n`]);
    expect(() => allowlistCandidates(readInputs(root), { words: [] })).toThrow(
      "JSON array",
    );
  });

  it("reads one entry per line, trimmed, skipping blanks and comments", () => {
    expect(parseLines("# head\n\n  abc  \n#x\ndef\n")).toEqual([
      { value: "abc", line: 3 },
      { value: "def", line: 5 },
    ]);
  });
});
