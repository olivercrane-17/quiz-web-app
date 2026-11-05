// @vitest-environment node
/**
 * The release pipeline (ARCHITECTURE §5.4, §8.17; SQL-3): the committed e2e
 * seed and its SQL test match the fixtures; the seed plays the fixture
 * cycle on every date with numbers from the epoch; a release writes content
 * before schedule, then verify_release, then the record, as statements the
 * MCP sends unattended; release and dedupe pass the redaction test; spare
 * orders carry the rules each spare breaks; and no sealed id reaches a
 * bundle.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
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
  fixtureOutputs,
  numberOf,
  readyOn,
  releaseChunks,
  releaseSummary,
  spareBreaks,
  type FixtureOutputs,
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
  });
});

// ---------------------------------------------------------------------------
// The bundle scan (ARCHITECTURE §5.4)
// ---------------------------------------------------------------------------

/** §5.4's pattern: a sealed id, not a fixture's. */
const SEALED_ID = /(?<!fx\.)\b(m\.[a-z]+\.\d{4}|e\.\d{4}|r\.[a-z-]+\.\d{2})\b/;

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe("the bundle scan", () => {
  it("SQL-3 the bundle scan finds no sealed ids in public/, the generated modules or a build", () => {
    const roots = [
      "public",
      "src/content/generated",
      "src/backend/mock/fixtures.generated.ts",
      ".next/static",
      ".next/server/app",
    ];
    const found: string[] = [];
    let scanned = 0;
    for (const root of roots) {
      const abs = join(REPO_ROOT, root);
      const files =
        existsSync(abs) && statSync(abs).isFile() ? [abs] : filesUnder(abs);
      for (const file of files) {
        if (!/\.(?:html|js|json|rsc|txt|ts|body|meta|css|map)$/.test(file))
          continue;
        scanned += 1;
        const match = SEALED_ID.exec(readFileSync(file, "utf8"));
        if (match)
          found.push(`${file.slice(REPO_ROOT.length + 1)}: ${match[0]}`);
      }
    }
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
});
