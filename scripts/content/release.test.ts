// @vitest-environment node
/**
 * The release pipeline (ARCHITECTURE §5.4, §8.17; SQL-3): the committed e2e
 * seed and its SQL test match the fixtures; the seed plays the fixture
 * cycle on every date with numbers from the epoch; a release writes content
 * before schedule, then verify_release, then the record, as statements the
 * MCP sends unattended, whatever the content text holds; release and
 * dedupe pass the redaction test; a release is written only where git
 * ignores it; spare orders carry the rules each spare breaks; and no sealed
 * id reaches a bundle.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DAILY_EPOCH } from "@/config/shared";
import { fixtureDailyFor } from "@/content/loaders/fixtures/sealed";
import type { LocalDate } from "@/engine/types";

import { loadBank, type Bank } from "../../src/content/pipeline/bank.ts";
import {
  COUNTRY_NAMES,
  REPO_ROOT,
  countryId,
  fxCountryList,
  fxEncore,
  fxMc,
  fxMystery,
  removeTempDirs,
  tempDir,
} from "../../src/content/pipeline/__fixtures__/builders.ts";
import { resolveLayout } from "../../src/content/pipeline/layout.ts";
import {
  deriveSealKeys,
  envelopeText,
  sealBytes,
} from "../../src/content/pipeline/seal.ts";
import { ID_PATTERNS } from "../../src/content/schema/primitives.ts";
import { normalizeName } from "../../src/engine/suggest/normalize.ts";
import {
  mcpConfirmationReasons,
  mcpPieces,
  scanForbidden,
} from "../sql/lib.ts";
import { trackDays, type ScheduleDay } from "./lib/rules.ts";
import {
  DEFAULT_CHUNK_BYTES,
  E2E_FROM,
  E2E_SEED_PATH,
  E2E_THROUGH,
  FIXTURE_TEST_PATH,
  chunkProblems,
  fixtureOutputs,
  jsonText,
  numberOf,
  readyOn,
  releaseChunks,
  releaseFile,
  releaseSummary,
  safeToWrite,
  spareBreaks,
  type FixtureOutputs,
  type Release,
  type ReleaseRows,
} from "./release.ts";

afterAll(removeTempDirs);

let fixtures: FixtureOutputs;
let fixtureBank: Bank;
beforeAll(async () => {
  fixtures = await fixtureOutputs(REPO_ROOT);
  fixtureBank = await loadBank(
    resolveLayout({
      repoRoot: REPO_ROOT,
      root: "content/fixtures",
      fixtures: true,
    }),
  );
});

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

describe("the e2e seed (supabase/seed/e2e-track.sql)", () => {
  it("SQL-3 the committed e2e seed and its SQL test match content/fixtures", () => {
    for (const output of [fixtures.seed, fixtures.test]) {
      expect(
        readFileSync(join(REPO_ROOT, output.path), "utf8"),
        `${output.path}: run npm run content:release -- --fixtures`,
      ).toBe(output.content);
    }
    expect(fixtures.seed.path).toBe(E2E_SEED_PATH);
    expect(fixtures.test.path).toBe(FIXTURE_TEST_PATH);
  });

  it("SQL-3 the e2e track plays the fixture cycle on every date from 2026-11-01 to 2028-12-31", () => {
    const { dailies } = fixtures.release;
    const dates: string[] = [];
    for (let date = E2E_FROM; date <= E2E_THROUGH; date = addDays(date, 1))
      dates.push(date);
    expect(dailies.map((daily) => daily.date)).toEqual(dates);
    expect(dailies).toHaveLength(792);
    for (const daily of dailies) {
      const expected = fixtureDailyFor(daily.date as LocalDate);
      expect(expected, daily.date).not.toBeNull();
      expect(daily.rounds, daily.date).toEqual(expected?.rounds);
      expect(daily.daily_number, daily.date).toBe(expected?.daily.dailyNumber);
      expect(daily.ready).toBe(true);
    }
    // Both AC-DLY-09 compositions are in, on their dates.
    const byDate = new Map(dailies.map((daily) => [daily.date, daily]));
    expect(byDate.get("2026-11-15")?.rounds).toHaveLength(10);
    expect(byDate.get("2026-11-16")?.rounds.at(-2)?.type).toBe("mystery");
  });

  it("SQL-3 Daily numbers match the epoch", () => {
    for (const daily of fixtures.release.dailies) {
      const days = Math.round(
        (Date.parse(`${daily.date}T00:00:00Z`) -
          Date.parse(`${DAILY_EPOCH}T00:00:00Z`)) /
          86_400_000,
      );
      expect(daily.daily_number).toBe(days + 1);
      expect(daily.daily_number).toBe(numberOf(daily.date, DAILY_EPOCH));
    }
    expect(fixtures.release.dailies[0]?.daily_number).toBe(42);
  });

  it("SQL-3 holds only fixture content: every sealed id and entity is fx.-prefixed, on the e2e track", () => {
    const { release } = fixtures;
    expect(release.track).toBe("e2e");
    expect(release.version).toMatch(/^e2e-[0-9a-f]{12}$/);
    const ids = [
      ...release.mysteries,
      ...release.encores,
      ...release.questions,
    ].map((row) => row.id);
    expect(ids.length).toBe(6 + 3 + 30);
    for (const id of ids) expect(id).toMatch(/^fx\./);
    for (const entity of release.entities)
      expect(entity.entity_id).toMatch(/^fx\./);
    for (const pack of release.roomPacks) expect(pack.id).toMatch(/^fx-/);
    // The Dailies' choice rounds load as questions, never as a room pack.
    expect(release.roomPacks.map((pack) => pack.id)).toEqual(["fx-party"]);
  });

  it("SQL-3 the SQL test's week loads the hostable room pack, and tries a pack of the Dailies' choice rounds", () => {
    const test = fixtures.test.content;
    const packs = test
      .split("\n")
      .filter((line) => line.startsWith("select private.release_room_packs("));
    expect(packs).toHaveLength(1);
    expect(packs[0]).toContain('"id":"fx-party"');
    expect(test).toContain("p.id = any (array['fx-party'])) = 1");
    expect(test).toContain("room pack fx-leak names question fx.r.dly.01");
    expect(test).toContain(
      "PASS SQL-3 the e2e track takes a fixture edit after its first dates opened",
    );
  });
});

describe("the release's statements", () => {
  const labels = (chunks: readonly { label: string }[]) =>
    chunks.map((chunk) => chunk.label);

  it("SQL-3 a release writes content before schedule, then verify_release, then the record", () => {
    const chunks = releaseChunks(fixtures.release);
    const order = [
      "answer entities",
      "mysteries",
      "encores",
      "sealed questions",
      "room packs",
      "challenge packs",
      "Dailies",
      "spare sets",
      "verify_release",
      "record_release",
    ];
    const seen = labels(chunks).map((label) => order.indexOf(label));
    expect(seen.every((rank) => rank >= 0)).toBe(true);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(labels(chunks).slice(-2)).toEqual([
      "verify_release",
      "record_release",
    ]);
    const record = chunks.at(-1)?.sql ?? "";
    expect(record).toContain(`'${fixtures.release.hash}'`);
    expect(record).toContain(`'${fixtures.release.version}', 'e2e'`);
  });

  it("SQL-3 every chunk is one statement within the size limit that the MCP sends unattended", () => {
    for (const chunks of [
      releaseChunks(fixtures.release),
      releaseChunks(fixtures.release, { allowFrozen: true, chunkBytes: 8000 }),
    ]) {
      for (const chunk of chunks) {
        expect(Buffer.byteLength(chunk.sql)).toBeLessThanOrEqual(
          DEFAULT_CHUNK_BYTES,
        );
        expect(mcpConfirmationReasons(chunk.sql)).toEqual([]);
        expect(
          mcpPieces(chunk.sql).filter((piece) => piece.text.trim() !== ""),
        ).toHaveLength(1);
      }
    }
    const small = releaseChunks(fixtures.release, {
      allowFrozen: true,
      chunkBytes: 8000,
    });
    for (const chunk of small)
      expect(Buffer.byteLength(chunk.sql)).toBeLessThanOrEqual(8000);
    // --allow-frozen reaches every loader that refuses frozen rows, and no other.
    const dailies = small.find((chunk) => chunk.label === "Dailies")?.sql;
    expect(dailies).toMatch(/'::jsonb, true\);$/);
    const packs = small.find((chunk) => chunk.label === "room packs")?.sql;
    expect(packs).toMatch(/'::jsonb\);$/);
    for (const output of [fixtures.seed, fixtures.test])
      expect(scanForbidden(output.path, output.content)).toEqual([]);
  });

  it("SQL-3 a semicolon before drop, delete or truncate, or the word execute, in content never stops a chunk", () => {
    const [first] = fixtures.release.mysteries;
    if (first === undefined) throw new Error("no fixture mystery");
    const awkward = {
      ...first,
      explanation:
        "A bowler who fumbles the ball must not stop; drop it and the batter may run.",
      learn_more:
        "Execute the plan, then; Truncate nothing; 'Delete' the doubt; EXECUTE \"Drop everything\"",
      clues: [
        "execute 'drop",
        ...first.clues.slice(1, 3),
        "back\\slash; delete",
      ],
    };
    const release = {
      ...fixtures.release,
      mysteries: [awkward, ...fixtures.release.mysteries.slice(1)],
    };
    const chunks = releaseChunks(release);
    expect(chunkProblems(chunks, DEFAULT_CHUNK_BYTES)).toEqual([]);
    const chunk = chunks.find((c) => c.label === "mysteries")?.sql ?? "";
    expect(chunk).not.toMatch(/;\s*(?:drop|delete|truncate)\b/i);
    expect(chunk).not.toMatch(/execute/i);
    // What the database decodes is the content itself, so its hash is the same.
    const literal = /'(\[[\s\S]*\])'::jsonb/.exec(chunk)?.[1] ?? "";
    const rows = JSON.parse(literal.replaceAll("''", "'")) as unknown[];
    expect(rows[0]).toEqual(awkward);
    expect(JSON.parse(jsonText(awkward).replaceAll("''", "'"))).toEqual(
      awkward,
    );
  });

  it("SQL-3 a successful release prints counts only, never content", () => {
    const chunks = releaseChunks(fixtures.release);
    const text = releaseSummary(
      fixtures.release,
      chunks,
      "supabase/.generated/content-release-7.sql",
      false,
    ).join("\n");
    expect(text).toContain("792 Dailies");
    for (const row of fixtures.release.mysteries) {
      for (const clue of row.clues) expect(text).not.toContain(clue);
      expect(text).not.toContain(row.id);
    }
    for (const row of fixtures.release.encores) {
      expect(text).not.toContain(row.question);
      expect(text).not.toMatch(new RegExp(`\\b${row.answer}\\b`));
    }
  });
});

// ---------------------------------------------------------------------------
// Decisions memo §24: encoding data is not disguising a statement
// ---------------------------------------------------------------------------

/**
 * A SQL text split the way Postgres reads it: `code` is everything outside
 * string literals and comments, with each standard string literal replaced
 * by a numbered placeholder; `literals` holds their contents, quotes
 * undoubled. A dollar-quoted body (a `do $$ ... $$` block) is code, since
 * Postgres runs it, so it stays in `code` with its quotes, its own literals
 * taken out too.
 * `statements` counts the top-level statements.
 */
interface LexedSql {
  code: string;
  literals: string[];
  statements: number;
}

const PLACEHOLDER = (index: number) => `'\u0000${index}\u0000'`;

function lexSql(sql: string): LexedSql {
  const literals: string[] = [];
  const walk = (text: string, top: boolean) => {
    let code = "";
    let statements = 0;
    let pending = false;
    let index = 0;
    while (index < text.length) {
      const char = text[index] as string;
      const next = text[index + 1];
      if (char === "-" && next === "-") {
        const end = text.indexOf("\n", index);
        index = end === -1 ? text.length : end;
        continue;
      }
      if (char === "/" && next === "*") {
        let depth = 1;
        index += 2;
        while (index < text.length && depth > 0) {
          if (text.startsWith("/*", index)) {
            depth += 1;
            index += 2;
          } else if (text.startsWith("*/", index)) {
            depth -= 1;
            index += 2;
          } else index += 1;
        }
        code += " ";
        continue;
      }
      if (char === "'") {
        let value = "";
        index += 1;
        for (;;) {
          if (index >= text.length) throw new Error("unterminated literal");
          if (text[index] === "'") {
            if (text[index + 1] === "'") {
              value += "'";
              index += 2;
              continue;
            }
            index += 1;
            break;
          }
          value += text[index];
          index += 1;
        }
        literals.push(value);
        code += PLACEHOLDER(literals.length - 1);
        pending = true;
        continue;
      }
      const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index));
      if (dollar !== null) {
        const tag = dollar[0];
        const end = text.indexOf(tag, index + tag.length);
        if (end === -1) throw new Error("unterminated dollar quote");
        const body = walk(text.slice(index + tag.length, end), false);
        code += `${tag}${body.code}${tag}`;
        index = end + tag.length;
        pending = true;
        continue;
      }
      if (char === ";" && top) {
        statements += 1;
        pending = false;
      } else if (!/\s/.test(char)) pending = true;
      code += char;
      index += 1;
    }
    if (pending && top) statements += 1;
    return { code, statements };
  };
  const { code, statements } = walk(sql, true);
  return { code, literals, statements };
}

/**
 * A literal's contents as jsonb decodes them: a JSON value has its \u
 * escapes undone, so the `;` and the x of "execute" are plain again.
 * Anything else (a display name, a version) is returned as it is.
 */
function decodeLiteral(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value) as unknown);
  } catch {
    return value;
  }
}

/** `sql` with every literal replaced by its decoded form, quoted again. */
function decodedSql(lexed: LexedSql): string {
  return lexed.code.replace(
    /'\u0000(\d+)\u0000'/g,
    (_, index: string) =>
      `'${decodeLiteral(lexed.literals[Number(index)] ?? "").replaceAll("'", "''")}'`,
  );
}

const DESTRUCTIVE = /\b(?:drop|delete|truncate)\b/i;

/**
 * What memo §24 allows: no DROP, DELETE or TRUNCATE outside a string
 * literal. Re-lexing the decoded text would prove nothing more (decodedSql
 * quotes every value again, so the code is the same by construction); the
 * callers instead compare the decoded values with the source rows and pin
 * which literal may carry escaped text. Returns the lexed form.
 */
function expectNoDestructiveStatement(sql: string, what: string): LexedSql {
  const written = lexSql(sql);
  expect(written.code, what).not.toMatch(DESTRUCTIVE);
  return written;
}

/** The chunks of a written release file, by the headers chunkFile writes. */
function chunksOfFile(text: string): { label: string; sql: string }[] {
  const header =
    /^-- ===== chunk \d+\/\d+: (.+?)(?:, \d+ row\(s\))?, [\d.]+ kB =====$/gm;
  const marks = [...text.matchAll(header)];
  return marks.map((mark, index) => ({
    label: mark[1] ?? "",
    sql: text
      .slice(
        (mark.index ?? 0) + mark[0].length,
        marks[index + 1]?.index ?? text.length,
      )
      .trim(),
  }));
}

const LOADER_KEYS: Record<string, keyof ReleaseRows> = {
  mysteries: "mysteries",
  encores: "encores",
  "sealed questions": "questions",
  "room packs": "roomPacks",
  "challenge packs": "challengePacks",
  Dailies: "dailies",
  "spare sets": "spares",
};

const CHUNK_SHAPE =
  /^\s*(?:select private\.(?:release_[a-z_]+|verify_release|record_release)\(|insert into private\.answer_entities \()/;

/**
 * Every chunk of `file` is one statement of a shape a release writes, with
 * no destructive statement outside a string literal, and the values it
 * carries, decoded, are the release's own rows. In a loader chunk every
 * literal but the jsonb rows is the release's version or track, so the
 * only escaped text sits inside that one argument.
 */
function expectFaithfulChunks(file: string, release: Release): void {
  const chunks = chunksOfFile(file);
  expect(chunks.length).toBeGreaterThan(2);
  const loaded = new Map<keyof ReleaseRows, unknown[]>();
  const entities: string[] = [];
  chunks.forEach((chunk, index) => {
    const what = `chunk ${index + 1} (${chunk.label})`;
    const lexed = expectNoDestructiveStatement(chunk.sql, what);
    expect(lexed.statements, what).toBe(1);
    expect(lexed.code, what).toMatch(CHUNK_SHAPE);
    const key = LOADER_KEYS[chunk.label];
    if (key !== undefined) {
      // The loader's arguments: version, track, then the rows as jsonb.
      expect(lexed.literals.length, what).toBe(3);
      expect(lexed.literals.slice(0, 2), what).toEqual([
        release.version,
        release.track,
      ]);
      const rows = JSON.parse(lexed.literals[2] ?? "") as unknown[];
      loaded.set(key, [...(loaded.get(key) ?? []), ...rows]);
    } else if (chunk.label === "answer entities") {
      entities.push(...lexed.literals);
    } else if (chunk.label === "record_release") {
      expect(lexed.literals).toEqual([
        release.version,
        release.track,
        release.hash,
        expect.any(String),
      ]);
      expect(JSON.parse(lexed.literals[3] ?? "")).toEqual(release.counts);
    }
  });
  for (const key of Object.values(LOADER_KEYS)) {
    expect(loaded.get(key) ?? [], key).toEqual(release[key]);
  }
  expect(entities).toEqual(
    release.entities.flatMap((row) => [
      row.answer_type,
      row.entity_id,
      row.display,
      row.option_label,
    ]),
  );
}

describe("memo §24: a release encodes data and never a destructive statement", () => {
  /** Text built to stop a naive statement splitter, or to look like SQL. */
  const HOSTILE = [
    "'; DROP TABLE private.dailies; --",
    'x"); delete from private.mysteries; --',
    "Execute the plan; truncate private.encores",
    "EXECUTE 'drop schema private cascade'",
    "$$; drop function private.verify_release(text, text); $$",
    "*/ drop table x; /* -- truncate",
    "back\\slash \\u003b; DELETE",
    "Ünïcödé ‘quotes’, a semicolon; then Drop it",
  ];
  const hostile = HOSTILE.join(" ");

  /**
   * A main-track release as content:release builds it (no entities, a
   * plain version), carrying the fixture content with hostile text planted
   * in every loader's rows.
   */
  function hostileMainRelease(): Release {
    const base = fixtures.release;
    const [mystery, ...mysteries] = base.mysteries;
    const [encore, ...encores] = base.encores;
    const [question, ...questions] = base.questions;
    const [pack, ...packs] = base.roomPacks;
    const [daily, ...dailies] = base.dailies;
    if (
      mystery === undefined ||
      encore === undefined ||
      question === undefined ||
      pack === undefined ||
      daily === undefined
    )
      throw new Error("the fixture release is missing a loader's rows");
    return {
      ...base,
      track: "main",
      version: "7",
      entities: [],
      mysteries: [
        {
          ...mystery,
          clues: HOSTILE.slice(0, 4),
          explanation: hostile,
          learn_more: HOSTILE[4] ?? "",
          source_labels: HOSTILE.slice(4),
        },
        ...mysteries,
      ],
      encores: [
        { ...encore, question: hostile, unit_label: HOSTILE[2] ?? "" },
        ...encores,
      ],
      questions: [
        { ...question, stem: hostile, options: HOSTILE.slice(0, 4) },
        ...questions,
      ],
      roomPacks: [
        { ...pack, title: HOSTILE[0] ?? "", theme: HOSTILE[3] ?? "" },
        ...packs,
      ],
      challengePacks: [
        {
          id: "cp.01",
          title: HOSTILE[1] ?? "",
          theme: hostile,
          rounds: daily.rounds,
        },
      ],
      dailies: [
        { ...daily, spare_order: [{ spare: "spare.01", breaks: HOSTILE }] },
        ...dailies,
      ],
      counts: { ...base.counts, challenge_packs: 1 },
    };
  }

  it("OPS-1 every chunk of a main-track release holds no DROP, DELETE or TRUNCATE statement outside a string literal, with decoded values equal to the source rows", () => {
    const release = hostileMainRelease();
    for (const options of [{}, { chunkBytes: 8000, allowFrozen: true }]) {
      const chunks = releaseChunks(release, options);
      // Sendable unattended, and still holding the hostile text once decoded.
      expect(chunkProblems(chunks, DEFAULT_CHUNK_BYTES)).toEqual([]);
      const file = releaseFile(release, chunks);
      const decoded = decodedSql(lexSql(file));
      expect(decoded).toContain("; DROP TABLE private.dailies; --");
      expect(decoded).toContain("Execute the plan; truncate");
      expectFaithfulChunks(file, release);
    }
  });

  it("OPS-1 every chunk of the fixture release, and its SQL test, holds no DROP, DELETE or TRUNCATE statement outside a string literal, with decoded values equal to the fixture rows", () => {
    expectFaithfulChunks(fixtures.seed.content, fixtures.release);
    // The SQL test runs inside begin ... rollback and asserts with do blocks.
    const test = expectNoDestructiveStatement(
      fixtures.test.content,
      fixtures.test.path,
    );
    expect(test.statements).toBeGreaterThan(2);
  });

  it("OPS-1 the check itself sees a destructive statement, however it is written", () => {
    for (const sql of [
      "select 1; drop table private.dailies;",
      "do $$ begin delete from private.mysteries where true; end $$;",
      "select 'a'; /* c */ TRUNCATE private.encores;",
    ]) {
      expect(lexSql(sql).code).toMatch(DESTRUCTIVE);
    }
    // Inside a literal, as data, it is no statement.
    const data = lexSql("select private.f('[\"x; drop table y\"]'::jsonb);");
    expect(data.code).not.toMatch(DESTRUCTIVE);
    expect(data.statements).toBe(1);
    expect(data.literals).toEqual(['["x; drop table y"]']);
  });
});

describe("spare orders and readiness", () => {
  const day = (date: string, spare: ScheduleDay): ScheduleDay => ({
    ...spare,
    file: "content/.sealed-plain/schedule/2026-12.json",
    date,
    label: date,
    status: "assembled",
    spareOrder: undefined,
    spareId: null,
  });

  it("SQL-3 a spare order names the rules each spare would break against the date's neighbours", () => {
    const { spares } = trackDays(fixtureBank, "e2e");
    const [a1, b2, a3] = spares as [ScheduleDay, ScheduleDay, ScheduleDay];
    // Set A, set B, set A on three days.
    const days = [
      day("2026-12-01", a1),
      day("2026-12-02", b2),
      day("2026-12-03", a1),
    ];
    const options = { epoch: DAILY_EPOCH, compositions: null };
    // The same rounds again break nothing new.
    expect(spareBreaks(fixtureBank, days, "2026-12-02", b2, options)).toEqual(
      [],
    );
    // Set A between two set-A days repeats items and answers (X13) and
    // categories on consecutive days (X23).
    const breaks = spareBreaks(fixtureBank, days, "2026-12-02", a3, options);
    expect(breaks).toContain("X13");
    expect(breaks).toContain("X23");
    expect([...breaks].sort()).toEqual(breaks);
  });

  it("SQL-3 a Daily without pass D on every item is not ready", () => {
    const { spares } = trackDays(fixtureBank, "e2e");
    const first = spares[0] as ScheduleDay;
    // Fixtures carry no pass D records.
    expect(readyOn(fixtureBank, day("2026-12-01", first), "2026-12-01")).toBe(
      false,
    );
    expect(readyOn(fixtureBank, first, null)).toBe(false);
    const missing = {
      ...day("2026-12-01", first),
      rounds: [
        {
          type: "mystery" as const,
          difficulty: "easy" as const,
          contentId: "m.geo.9999",
        },
      ],
    };
    expect(readyOn(fixtureBank, missing, "2026-12-01")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The redaction test (ARCHITECTURE §5.4)
// ---------------------------------------------------------------------------

/** Every number in a text, by value: "4,813.75" and "4813.75" are the same. */
function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) =>
    Number(m[0].replace(/,/g, "")),
  );
}

/** True when `name` appears in `text` as whole tokens, after normalizeName. */
function hasName(text: string, name: string): boolean {
  return ` ${normalizeName(text)} `.includes(` ${normalizeName(name)} `);
}

describe("release and dedupe over sealed content with planted failures", () => {
  const master = Buffer.alloc(32, 7);
  const plain = (id: string) => id.replace(/^fx\./, "");
  let repo = "";
  let clues: string[] = [];

  beforeAll(() => {
    repo = tempDir("qz-release-redact-");
    writeFileSync(join(repo, "package.json"), "{}\n");
    for (const path of [
      "content/categories.json",
      "content/batches.json",
      "content/compositions.json",
      "content/reference",
      "content/datasets/manifest.json",
      "src/config/shared.json",
    ]) {
      cpSync(join(REPO_ROOT, path), join(repo, path), { recursive: true });
    }
    // supabase/.generated/ is ignored, as in the repository (CNT-0).
    spawnSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(join(repo, ".gitignore"), "supabase/.generated/\n");

    const list = fxCountryList() as { entities: Record<string, unknown>[] };
    mkdirSync(join(repo, "content/answer-lists"), { recursive: true });
    writeFileSync(
      join(repo, "content/answer-lists/country.json"),
      JSON.stringify({
        ...list,
        entities: list.entities.map((e) => ({ ...e, id: plain(String(e.id)) })),
      }),
    );

    const base = fxMystery();
    clues = [
      // Planted: the answer's alias in a clue (C12).
      "The Arven Republic flies a silver heron above three blue waves.",
      "Arvennan farmers count thirteen months of 28 days.",
      base.clues[2],
      base.clues[3],
    ];
    const mystery = {
      ...base,
      id: "m.geo.0101",
      answer: plain(base.answer),
      distractors: base.distractors.map(plain),
      likelyGuesses: base.likelyGuesses.map(plain),
      rivals: base.rivals.map((rival) => ({ ...rival, id: plain(rival.id) })),
      clues,
    };
    // Planted: a bad encore unit and a distinctive numeric answer (C15).
    const encore = {
      ...fxEncore(),
      id: "e.0101",
      answer: 4813.75,
      decimals: 2,
      unit: "°C",
    };
    // Planted: a frozen Daily without pass D (X28).
    const schedule = {
      track: "main",
      dailies: [
        {
          date: "2026-12-01",
          rounds: [
            { type: "mystery", difficulty: "easy", contentId: "m.geo.0101" },
            { type: "encore", difficulty: null, contentId: "e.0101" },
          ],
          status: "frozen",
          predictedPoints: 3.2,
          dayCheck: null,
        },
      ],
    };
    const keys = deriveSealKeys(master);
    const seal = (folder: string, id: string, value: unknown) => {
      const dir = join(repo, "content/sealed", folder);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${id}.json.enc`),
        envelopeText(
          sealBytes(keys, Buffer.from(`${JSON.stringify(value, null, 2)}\n`)),
        ),
      );
    };
    seal("mysteries", "m.geo.0101", mystery);
    seal("encores", "e.0101", encore);
    seal("schedule", "2026-12", schedule);
    // Planted: a public practice item sharing the sealed mystery's answer (X29).
    const practice = {
      ...fxMc(),
      id: "p.geo.0101",
      stem: "Which country flies a silver heron above three blue waves?",
      answer: "Arvenna",
      wrong: ["Belloria", "Cassova", "Dravenor"],
    };
    mkdirSync(join(repo, "content/practice/geography"), { recursive: true });
    writeFileSync(
      join(repo, "content/practice/geography/p.geo.0101.json"),
      `${JSON.stringify(practice, null, 2)}\n`,
    );
  });

  const run = (script: string, args: string[]) => {
    const result = spawnSync(
      process.execPath,
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        join(REPO_ROOT, "scripts/content", script),
        ...args,
      ],
      {
        cwd: repo,
        encoding: "utf8",
        // Never the machine's own key: HOME is the throwaway repository.
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH ?? "",
          HOME: repo,
          QZ_CONTENT_KEY: master.toString("base64"),
        },
      },
    );
    return {
      status: result.status,
      output: `${result.stdout}\n${result.stderr}`,
    };
  };

  const expectClean = (output: string) => {
    for (const name of [
      ...COUNTRY_NAMES,
      "Arven Republic",
      "Arvennan",
      "heron",
      plain(countryId("Arvenna")),
    ])
      expect(hasName(output, name), `name ${name}`).toBe(false);
    expect(numbersIn(output), "the numeric answer").not.toContain(4813.75);
    for (const clue of clues) expect(output).not.toContain(clue);
    expect(output).not.toContain("°C");
  };

  it("SQL-3 release and dedupe pass the redaction test", () => {
    const outputs: string[] = [];
    for (const extra of [[], ["--json"]]) {
      const release = run("release.ts", [
        "--version",
        "t1",
        "--today",
        "2026-11-04",
        ...extra,
      ]);
      expect(release.status).toBe(1);
      outputs.push(release.output);
    }
    const [text] = outputs;
    // The planted failures were found and reported in the three-part form...
    expect(text).toContain("error m.geo.0101 C12 clues[0]");
    for (const rule of ["C15", "X28"]) expect(text).toContain(` ${rule}`);
    expect(text).toContain("Nothing was written");
    // ...nothing was written, and nothing of the content came out.
    expect(existsSync(join(repo, "supabase/.generated"))).toBe(false);

    for (const extra of [[], ["--json"], ["--cross-pool"]]) {
      const dedupe = run("dedupe.ts", ["--sealed", ...extra]);
      expect(dedupe.status).toBe(1);
      outputs.push(dedupe.output);
    }
    expect(outputs[2]).toContain("error m.geo.0101 X29");
    expect(outputs[2]).not.toContain("p.geo.0101");
    // The workspace-only options refuse a sealed run.
    const reveal = run("dedupe.ts", ["--sealed", "--reveal"]);
    expect(reveal.status).toBe(2);
    outputs.push(reveal.output);

    for (const output of outputs) expectClean(output);
    // Six CLI runs, each loading and validating the planted bank: about 4 s
    // alone, and past Vitest's 5 s default under a full parallel suite on a
    // shared machine. src/content/pipeline/sealed-output.test.ts gives its
    // CLI runs 30 s for the same reason.
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Where a release may be written
// ---------------------------------------------------------------------------

describe("the output path", () => {
  it("SQL-3 a release is written only where git ignores it, and never when git refuses to answer", () => {
    const repo = tempDir("qz-release-out-");
    spawnSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(join(repo, ".gitignore"), "supabase/.generated/\n");
    mkdirSync(join(repo, "supabase/seed"), { recursive: true });
    const ignored = join(repo, "supabase/.generated/content-release-7.sql");
    const committable = join(repo, "supabase/seed/content-release-7.sql");
    expect(safeToWrite(ignored)).toBe(true);
    expect(safeToWrite(committable)).toBe(false);

    // Outside every work tree it may write; through a symlink into one it may not.
    const outside = tempDir("qz-release-outside-");
    symlinkSync(join(repo, "supabase/seed"), join(outside, "seed"));
    expect(safeToWrite(join(outside, "content-release-7.sql"))).toBe(true);
    expect(safeToWrite(join(outside, "seed/content-release-7.sql"))).toBe(
      false,
    );

    // A git that exits 128, as git does when it refuses a repository another
    // user owns: inside the work tree that refuses the write, ignored or not.
    const bin = tempDir("qz-release-git-");
    writeFileSync(join(bin, "git"), "#!/bin/sh\nexit 128\n", { mode: 0o755 });
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
    expect(safeToWrite(committable, env)).toBe(false);
    expect(safeToWrite(ignored, env)).toBe(false);
    expect(safeToWrite(join(outside, "content-release-7.sql"), env)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The bundle scan (ARCHITECTURE §5.4)
// ---------------------------------------------------------------------------

/**
 * §5.4's pattern for a sealed id, not a fixture's, with room ids as
 * ID_PATTERNS.room takes them (digits too, so r.top-10.01 and r.y2k.12).
 */
const SEALED_ID =
  /(?<!fx\.)\b(m\.[a-z]+\.\d{4}|e\.\d{4}|r\.[a-z0-9]+(?:-[a-z0-9]+)*\.\d{2})\b/;
const SCANNED = /\.(?:html|js|json|rsc|txt|ts|body|meta|css|map)$/;
const BUILD_ROOTS = [".next/static", ".next/server/app"];

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

/** The scannable files under each root (a folder or one file), and the sealed ids they hold. */
function scan(roots: readonly string[]): { scanned: number; found: string[] } {
  const found: string[] = [];
  let scanned = 0;
  for (const root of roots) {
    const abs = join(REPO_ROOT, root);
    const files =
      existsSync(abs) && statSync(abs).isFile() ? [abs] : filesUnder(abs);
    for (const file of files) {
      if (!SCANNED.test(file)) continue;
      scanned += 1;
      const match = SEALED_ID.exec(readFileSync(file, "utf8"));
      if (match) found.push(`${file.slice(REPO_ROOT.length + 1)}: ${match[0]}`);
    }
  }
  return { scanned, found };
}

/**
 * The build half needs a build: it runs whenever one is there, and with
 * QZ_BUNDLE_SCAN=1 a missing or empty build fails it. Without either it is
 * skipped, visibly. CI scans its build with check:lazy in the verify job
 * (scripts/checks/lazy-markers.mjs), which reads sealed ids as SEALED_ID
 * here does.
 */
const BUILD_REQUIRED = process.env.QZ_BUNDLE_SCAN === "1";
const BUILT = BUILD_ROOTS.every(
  (root) => filesUnder(join(REPO_ROOT, root)).length > 0,
);

describe("the bundle scan", () => {
  it("SQL-3 the bundle scan's pattern takes every sealed id form, room ids with digits included, and no fixture id", () => {
    const sealed = [
      "m.geo.0142",
      "m.sport.9901",
      "e.0007",
      "r.top-10.01",
      "r.90s-pop.04",
      "r.y2k.12",
      "r.harbour-lights.15",
    ];
    for (const id of sealed) {
      expect(SEALED_ID.test(`"${id}"`), id).toBe(true);
      if (id.startsWith("r.")) expect(ID_PATTERNS.room.test(id), id).toBe(true);
    }
    for (const id of [
      "fx.m.geo.0101",
      "fx.e.0101",
      "fx.r.dly.01",
      "fx.r.fx-party.15",
    ])
      expect(SEALED_ID.test(`"${id}"`), id).toBe(false);
  });

  it("SQL-3 the bundle scan finds no sealed ids in public/ or the generated modules", () => {
    const { scanned, found } = scan([
      "public",
      "src/content/generated",
      "src/backend/mock/fixtures.generated.ts",
    ]);
    expect(scanned).toBeGreaterThan(0);
    expect(found).toEqual([]);
    // A release is written only where git ignores it.
    const probe = spawnSync(
      "git",
      ["check-ignore", "-q", "supabase/.generated/content-release-1.sql"],
      { cwd: REPO_ROOT },
    );
    expect(probe.status).toBe(0);
  });

  it.skipIf(!BUILD_REQUIRED && !BUILT)(
    "SQL-3 the bundle scan finds no sealed ids in a build (.next/static and .next/server/app)",
    () => {
      for (const root of BUILD_ROOTS)
        expect(
          filesUnder(join(REPO_ROOT, root)).length,
          `${root} is missing or empty: run npm run build first`,
        ).toBeGreaterThan(0);
      const { scanned, found } = scan(BUILD_ROOTS);
      expect(scanned).toBeGreaterThan(0);
      expect(found).toEqual([]);
    },
  );
});
