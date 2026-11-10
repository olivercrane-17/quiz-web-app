// @vitest-environment node
/**
 * ENR-1, the Wikidata enrichment workflow (ARCHITECTURE §5.5, §11.7,
 * §12.3; CONTENT_GUIDE §9.5.1). The agents' sandbox can't reach Wikidata,
 * so every test here runs offline: fetch is stubbed with the synthetic
 * Wikidata of __fixtures__/enrich-wikidata.ts, whose QIDs are all copied
 * from dataset records. The real run happens only on a GitHub runner.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  fxMystery,
  removeTempDirs,
  tempDir,
  writeTree,
} from "../../src/content/pipeline/__fixtures__/builders.ts";
import { loadBank } from "../../src/content/pipeline/bank.ts";
import { sha256Hex, stableStringify } from "../../src/content/pipeline/json.ts";
import { resolveLayout } from "../../src/content/pipeline/layout.ts";
import {
  deriveSealKeys,
  envelopeText,
  sealBytes,
} from "../../src/content/pipeline/seal.ts";
import type {
  AnswerEntity,
  AnswerList,
} from "../../src/content/schema/answer-lists.ts";
import type { Mystery } from "../../src/content/schema/items.ts";
import {
  ANSWER_TYPES,
  type AnswerType,
} from "../../src/content/schema/primitives.ts";
import {
  FIXTURE_WORLD,
  PROPERTY_LABELS,
  SYNTHETIC,
  answer,
  item,
  networkError,
  quantity,
  replyToResponse,
  revisionOf,
  text,
  time,
  type SyntheticWorld,
} from "./__fixtures__/enrich-wikidata.ts";
import {
  CHECKS,
  EnrichmentFileSchema,
  MUSIC_ARTIST_HELD,
  PROPERTIES,
  WIKIDATA_API,
  WIKIDATA_PROVENANCE,
  applyEnrichment,
  compareQualifier,
  fetchEnrichment,
  labelMatchOf,
  networkFailure,
  qidHolders,
  suggestionGuard,
  summaryMarkdown,
  verdictOf,
  writeEnrichmentFiles,
  yearOf,
  type Candidate,
  type EnrichDeps,
  type EnrichmentFile,
  type EntityData,
  type PropertyId,
} from "./enrich-wikidata.ts";
import { RULES_LANDED_AT } from "./lint/cutoff.ts";
import { cnt2Findings } from "./lint/index.ts";
import { citedDatasets } from "./lists/importer.ts";

afterAll(removeTempDirs);

const SCRIPT = join(REPO_ROOT, "scripts/content/enrich-wikidata.ts");
const STUB = join(REPO_ROOT, "scripts/content/__fixtures__/enrich-wikidata.ts");
const WORKFLOW = join(REPO_ROOT, ".github/workflows/wikidata-enrich.yml");
const NOW = new Date("2026-11-09T02:47:12.345Z");
const FETCHED_AT = "2026-11-09T02:47:12Z";
const SOURCE = {
  api: "https://www.wikidata.org/w/api.php",
  license: "CC0-1.0",
} as const;

// ---------------------------------------------------------------------------
// The fixture QID list
// ---------------------------------------------------------------------------

function entry(
  id: string,
  name: string,
  qualifier: Record<string, unknown>,
  extra: Partial<AnswerEntity> = {},
): AnswerEntity {
  return {
    id,
    name,
    display: name,
    aliases: [],
    popularity: 0,
    qualifier,
    source: "l.fixture.b01",
    status: "active",
    addedIn: "2026-11-01",
    wikidataId: null,
    replacedBy: null,
    ...extra,
  };
}

function list(type: AnswerType, entities: AnswerEntity[]): AnswerList {
  return {
    type,
    version: "2026-11-01",
    liveAt: "2026-11-01",
    provenance: [
      {
        source: "l.fixture.b01",
        license: "CC0-1.0",
        retrievedAt: "2026-11-01",
      },
    ],
    entities,
  };
}

/** Every QID is copied from a dataset record; see the fixture's header. */
function fixtureLists(): AnswerList[] {
  return [
    list("country", [
      entry("x.country.canada", "Canada", { iso_a2: "CA" }),
      // Its code disagrees with the one candidate whose label agrees.
      entry("x.country.zambia", "Zambia", { iso_a2: "ZW" }),
    ]),
    list("landmark", [
      entry("Q34221", "Niagara Falls", { country: "CA" }),
      // Agrees with Q34221, which the entry above already holds.
      entry("x.landmark.niagara-falls", "Niagara Falls", { country: "US" }),
      entry("x.landmark.victoria-falls", "Victoria Falls", { country: "ZM" }),
    ]),
    list("music_artist", [
      entry("Q1299", "The Beatles", { descriptor: "rock band", kind: "band" }),
      entry("x.music_artist.john-lennon", "John Lennon", {
        descriptor: "singer-songwriter",
        kind: "solo",
      }),
    ]),
    list("person", [
      entry(
        "Q5432",
        "Francisco Goya",
        { descriptor: "painter", born: 1746 },
        { aliases: ["Goya"] },
      ),
      entry("x.person.claude-monet", "Claude Monet", {
        descriptor: "painter",
        born: 1840,
      }),
      // A year off, so the qualifier disagrees.
      entry("x.person.edgar-degas", "Edgar Degas", {
        descriptor: "painter",
        born: 1835,
      }),
      // No year to compare: label only.
      entry("x.person.camille-pissarro", "Camille Pissarro", {
        descriptor: "painter",
        born: null,
      }),
      // Referenced through wikidataId, and deleted on the synthetic Wikidata.
      entry(
        "x.person.edouard-manet",
        "Édouard Manet",
        { descriptor: "painter", born: 1832 },
        { wikidataId: "Q40599" },
      ),
      // Retired: neither read nor searched.
      entry(
        "x.person.retired-painter",
        "Retired Painter",
        { descriptor: "painter", born: 1900 },
        { status: "retired" },
      ),
    ]),
  ];
}

const candidate = (
  qid: string,
  label: string,
  sitelinks: number,
  facts: Candidate["facts"],
  qualifier: Candidate["qualifier"],
): Candidate => ({
  qid,
  revision: revisionOf(qid),
  label,
  description: SYNTHETIC,
  sitelinks,
  labelMatch: "label",
  facts,
  qualifier,
});

/** The hash a run records for an entry: its name, aliases and qualifier. */
function hashOf(entity: AnswerEntity): string {
  return sha256Hex(
    stableStringify({
      name: entity.name,
      aliases: entity.aliases,
      qualifier: entity.qualifier,
    }),
  );
}

/** The hash of a fixture entry, by type and id. */
function fixtureHash(type: AnswerType, id: string): string {
  const entity = fixtureLists()
    .find((l) => l.type === type)
    ?.entities.find((e) => e.id === id);
  if (!entity) throw new Error(`no fixture entry ${id}`);
  return hashOf(entity);
}

/** What the fixture QID list gives, list by list. */
const EXPECTED: Record<string, EnrichmentFile> = {
  country: {
    format: 2,
    type: "country",
    listVersion: "2026-11-01",
    fetchedAt: FETCHED_AT,
    source: SOURCE,
    properties: { P297: { label: "ISO 3166-1 alpha-2 code", verified: true } },
    sitelinks: [],
    candidates: [
      {
        id: "x.country.canada",
        entryHash: fixtureHash("country", "x.country.canada"),
        name: "Canada",
        ours: { iso_a2: "CA" },
        verdict: "match",
        match: "Q16",
        candidates: [
          candidate("Q16", "Canada", 10, { iso_a2: ["CA"] }, "agrees"),
        ],
      },
      {
        id: "x.country.zambia",
        entryHash: fixtureHash("country", "x.country.zambia"),
        name: "Zambia",
        ours: { iso_a2: "ZW" },
        verdict: "none",
        match: null,
        candidates: [
          candidate("Q953", "Zambia", 1, { iso_a2: ["ZM"] }, "disagrees"),
        ],
      },
    ],
  },
  landmark: {
    format: 2,
    type: "landmark",
    listVersion: "2026-11-01",
    fetchedAt: FETCHED_AT,
    source: SOURCE,
    properties: {
      P17: { label: "country", verified: true },
      P297: { label: "ISO 3166-1 alpha-2 code", verified: true },
    },
    sitelinks: [
      {
        id: "Q34221",
        entryHash: fixtureHash("landmark", "Q34221"),
        qid: "Q34221",
        label: "Niagara Falls",
        labelMatch: "label",
        sitelinks: 5,
        revision: revisionOf("Q34221"),
      },
    ],
    candidates: [
      {
        id: "x.landmark.niagara-falls",
        entryHash: fixtureHash("landmark", "x.landmark.niagara-falls"),
        name: "Niagara Falls",
        ours: { country: "US" },
        verdict: "duplicate",
        match: "Q34221",
        candidates: [
          candidate(
            "Q34221",
            "Niagara Falls",
            5,
            { country: ["CA", "US"] },
            "agrees",
          ),
        ],
        sharedWith: ["Q34221"],
      },
      {
        id: "x.landmark.victoria-falls",
        entryHash: fixtureHash("landmark", "x.landmark.victoria-falls"),
        name: "Victoria Falls",
        ours: { country: "ZM" },
        verdict: "match",
        match: "Q43278",
        candidates: [
          candidate(
            "Q43278",
            "Victoria Falls",
            4,
            { country: ["ZM", "ZW"] },
            "agrees",
          ),
        ],
      },
    ],
  },
  music_artist: {
    format: 2,
    type: "music_artist",
    listVersion: "2026-11-01",
    fetchedAt: FETCHED_AT,
    source: SOURCE,
    properties: {
      P569: { label: "date of birth", verified: true },
      P571: { label: "inception", verified: true },
    },
    sitelinks: [
      {
        id: "Q1299",
        entryHash: fixtureHash("music_artist", "Q1299"),
        qid: "Q1299",
        label: "The Beatles",
        labelMatch: "label",
        sitelinks: 3,
        revision: revisionOf("Q1299"),
      },
    ],
    candidates: [
      {
        id: "x.music_artist.john-lennon",
        entryHash: fixtureHash("music_artist", "x.music_artist.john-lennon"),
        name: "John Lennon",
        ours: { kind: "solo" },
        verdict: "match",
        match: "Q1203",
        candidates: [
          candidate(
            "Q1203",
            "John Lennon",
            2,
            { kind: ["composer", "solo"] },
            "agrees",
          ),
        ],
      },
    ],
  },
  person: {
    format: 2,
    type: "person",
    listVersion: "2026-11-01",
    fetchedAt: FETCHED_AT,
    source: SOURCE,
    properties: { P569: { label: "date of birth", verified: true } },
    sitelinks: [
      {
        id: "Q5432",
        entryHash: fixtureHash("person", "Q5432"),
        qid: "Q5432",
        label: "Francisco Goya",
        labelMatch: "label",
        sitelinks: 7,
        revision: revisionOf("Q5432"),
      },
      {
        id: "x.person.edouard-manet",
        entryHash: fixtureHash("person", "x.person.edouard-manet"),
        qid: "Q40599",
        label: null,
        labelMatch: "none",
        sitelinks: null,
        revision: null,
        missing: true,
      },
    ],
    candidates: [
      {
        id: "x.person.camille-pissarro",
        entryHash: fixtureHash("person", "x.person.camille-pissarro"),
        name: "Camille Pissarro",
        ours: { born: null },
        verdict: "label-only",
        match: null,
        candidates: [
          candidate(
            "Q134741",
            "Camille Pissarro",
            6,
            { born: [1830] },
            "unknown",
          ),
        ],
      },
      {
        id: "x.person.claude-monet",
        entryHash: fixtureHash("person", "x.person.claude-monet"),
        name: "Claude Monet",
        ours: { born: 1840 },
        verdict: "match",
        match: "Q296",
        candidates: [
          candidate("Q296", "Claude Monet", 9, { born: [1840] }, "agrees"),
        ],
      },
      {
        id: "x.person.edgar-degas",
        entryHash: fixtureHash("person", "x.person.edgar-degas"),
        name: "Edgar Degas",
        ours: { born: 1835 },
        verdict: "none",
        match: null,
        candidates: [
          candidate("Q46373", "Edgar Degas", 8, { born: [1834] }, "disagrees"),
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

interface Recorded {
  url: URL;
  headers: Record<string, string>;
}

/** Dependencies whose fetch answers from a synthetic world, unless `override` answers first. */
function stubDeps(
  world: SyntheticWorld = FIXTURE_WORLD,
  override?: (url: URL, call: number) => Response | Error | undefined,
) {
  const requests: Recorded[] = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  const deps: EnrichDeps = {
    fetch: (href, init) => {
      const url = new URL(href);
      requests.push({
        url,
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      });
      const custom = override?.(url, requests.length);
      if (custom instanceof Error) return Promise.reject(custom);
      return Promise.resolve(custom ?? replyToResponse(answer(world, url)));
    },
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    userAgent: "knewt-enrich-wikidata/1.0 (tests)",
    log: (line) => logs.push(line),
  };
  return { deps, requests, sleeps, logs };
}

function fileOf(files: readonly EnrichmentFile[], type: AnswerType) {
  const file = files.find((f) => f.type === type);
  if (!file) throw new Error(`no ${type} file`);
  return file;
}

function listOf(lists: readonly AnswerList[], type: AnswerType) {
  const found = lists.find((l) => l.type === type);
  if (!found) throw new Error(`no ${type} list`);
  return found;
}

async function dryRun(world: SyntheticWorld = FIXTURE_WORLD) {
  const { deps } = stubDeps(world);
  return fetchEnrichment(fixtureLists(), deps, NOW);
}

/** A throwaway repository holding the fixture lists, and a preload that stubs fetch. */
function cliRepo(lists: readonly AnswerList[] = fixtureLists()): string {
  const repo = tempDir("qz-enrich-");
  writeFileSync(join(repo, "package.json"), "{}\n");
  mkdirSync(join(repo, "content/answer-lists"), { recursive: true });
  for (const fixture of lists)
    writeFileSync(
      join(repo, "content/answer-lists", `${fixture.type}.json`),
      `${JSON.stringify(fixture, null, 2)}\n`,
    );
  writeFileSync(
    join(repo, "preload.mjs"),
    `import { installFetchStub } from ${JSON.stringify(pathToFileURL(STUB).href)};\ninstallFetchStub();\n`,
  );
  return repo;
}

/** A throwaway content key: never the machine's own (HOME is the throwaway repository). */
const TEST_KEY = Buffer.alloc(32, 7);

/** Seals an item into the throwaway repository with TEST_KEY. */
function seal(repo: string, folder: string, id: string, value: unknown): void {
  const dir = join(repo, "content/sealed", folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.json.enc`),
    envelopeText(
      sealBytes(
        deriveSealKeys(TEST_KEY),
        Buffer.from(`${JSON.stringify(value, null, 2)}\n`),
      ),
    ),
  );
}

function cli(repo: string, fetchMode: string, ...args: string[]) {
  return spawnCli(repo, { ENR_FETCH: fetchMode }, args);
}

/** An apply through the CLI, offline, with the throwaway content key. */
function cliWithKey(repo: string, ...args: string[]) {
  return spawnCli(
    repo,
    { ENR_FETCH: "offline", QZ_CONTENT_KEY: TEST_KEY.toString("base64") },
    args,
  );
}

function spawnCli(
  repo: string,
  env: Record<string, string>,
  args: readonly string[],
) {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--import",
      pathToFileURL(join(repo, "preload.mjs")).href,
      SCRIPT,
      ...args,
    ],
    {
      cwd: repo,
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH ?? "",
        HOME: repo,
        ...env,
      },
    },
  );
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => [name, readFileSync(join(dir, name), "utf8")]),
  );
}

// ---------------------------------------------------------------------------
// The workflow
// ---------------------------------------------------------------------------

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}
interface Job {
  needs?: string;
  if?: string;
  permissions?: Record<string, string>;
  "timeout-minutes"?: number;
  steps: Step[];
}
interface Workflow {
  name: string;
  on: {
    schedule: { cron: string }[];
    workflow_dispatch: { inputs: Record<string, { type: string }> };
  };
  permissions: Record<string, string>;
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, Job>;
}

/**
 * js-yaml is in the lockfile (ESLint's config loader brings it) but not a
 * direct dependency, and it ships no types, so it is loaded untyped here.
 */
const yaml = createRequire(import.meta.url)("js-yaml") as {
  load(source: string): unknown;
};

describe("ENR-1 .github/workflows/wikidata-enrich.yml", () => {
  const source = readFileSync(WORKFLOW, "utf8");
  const workflow = yaml.load(source) as Workflow;
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);

  it("ENR-1 the workflow parses: weekly and manual triggers, a read-only fetch job and a write-scoped pull-request job", () => {
    expect(workflow.name).toBe("Wikidata enrichment");
    expect(workflow.on.schedule).toHaveLength(1);
    // Weekly: a fixed minute, hour and weekday.
    expect(workflow.on.schedule[0]?.cron).toMatch(
      /^\d{1,2} \d{1,2} \* \* [0-6]$/,
    );
    expect(workflow.on.workflow_dispatch.inputs).toEqual({
      type: expect.objectContaining({ type: "string" }),
      open_pull_request: expect.objectContaining({ type: "boolean" }),
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toEqual({
      group: "wikidata-enrich",
      "cancel-in-progress": false,
    });
    expect(Object.keys(workflow.jobs)).toEqual(["fetch", "pull-request"]);

    const fetchJob = workflow.jobs.fetch;
    const prJob = workflow.jobs["pull-request"];
    expect(fetchJob?.permissions).toEqual({ contents: "read" });
    expect(fetchJob?.steps.map((step) => step.run ?? step.uses)).toEqual([
      "actions/checkout@v7",
      "actions/setup-node@v7",
      "npm ci",
      expect.stringContaining("scripts/content/enrich-wikidata.ts"),
      "npx prettier --check content/answer-lists/_wikidata",
      expect.stringContaining("content/answer-lists/_wikidata/*.json"),
      "actions/upload-artifact@v7",
    ]);

    expect(prJob?.needs).toBe("fetch");
    // Every scheduled run; a manual run only on the default branch, when asked.
    expect(prJob?.if).toContain("github.event_name == 'schedule'");
    expect(prJob?.if).toContain("inputs.open_pull_request");
    expect(prJob?.if).toContain(
      "github.ref_name == github.event.repository.default_branch",
    );
    expect(prJob?.permissions).toEqual({
      contents: "write",
      "pull-requests": "write",
      actions: "write",
    });
    // The write token never meets code installed from npm.
    for (const step of prJob?.steps ?? [])
      expect(step.run ?? "").not.toMatch(/\b(npm|npx|node)\b/);
    const upload = fetchJob?.steps.find((s) =>
      s.uses?.startsWith("actions/upload-artifact"),
    );
    const download = prJob?.steps.find((s) =>
      s.uses?.startsWith("actions/download-artifact"),
    );
    expect(download?.with?.name).toBe(upload?.with?.name);
  });

  it(
    "ENR-1 the workflow's steps are safe to run: pinned first-party actions, no persisted token, no expression inside a script, valid bash",
    { timeout: 60_000 },
    () => {
      // No repository secret at all: the job token is github.token.
      expect(source).not.toMatch(/secrets\./);
      for (const step of steps) {
        if (step.uses !== undefined) {
          expect(step.uses).toMatch(/^actions\/[a-z-]+@v\d+$/);
          if (step.uses.startsWith("actions/checkout"))
            expect(step.with?.["persist-credentials"]).toBe(false);
        }
        if (step.run === undefined) continue;
        // Inputs reach scripts through env, so no input can inject a command.
        expect(step.run).not.toContain("${{");
        const script = join(tempDir("qz-enrich-yml-"), "step.sh");
        writeFileSync(script, step.run);
        const syntax = spawnSync("bash", ["-n", script], { encoding: "utf8" });
        expect(syntax.stderr, step.name).toBe("");
        expect(syntax.status, step.name).toBe(0);
      }
    },
  );

  it("checks the properties under the labels the synthetic Wikidata gives", () => {
    expect(PROPERTY_LABELS).toEqual(PROPERTIES);
  });

  const hasJq = spawnSync("jq", ["--version"]).status === 0;
  it.skipIf(!hasJq)(
    "proposes nothing when only fetchedAt and the revisions changed, and copies the output otherwise",
    () => {
      const step = workflow.jobs["pull-request"]?.steps.find(
        (s) => s.name === "Commit, push and open the pull request",
      );
      // Only the part before the first git command runs here.
      const [compare = ""] = (step?.run ?? "").split("git config user.name");
      expect(compare).toContain("nothing to propose");
      const dir = tempDir("qz-enrich-pr-");
      const runner = join(dir, "runner");
      const output = "content/answer-lists/_wikidata";
      mkdirSync(join(runner, "wikidata/out"), { recursive: true });
      mkdirSync(join(dir, output), { recursive: true });
      const earlier = EXPECTED.person;
      if (earlier === undefined) throw new Error("no expected person file");
      const base = `${JSON.stringify(earlier, null, 2)}\n`;
      writeFileSync(join(dir, output, "person.json"), base);
      const rerun = structuredClone(earlier);
      rerun.fetchedAt = "2026-11-16T02:47:12Z";
      for (const record of rerun.sitelinks)
        if (record.revision !== null) record.revision += 1;
      for (const entry of rerun.candidates)
        for (const c of entry.candidates)
          if (c.revision !== null) c.revision += 1;
      const write = () =>
        writeFileSync(
          join(runner, "wikidata/out/person.json"),
          JSON.stringify(rerun),
        );
      const runStep = (script: string) =>
        spawnSync("bash", ["-c", script], {
          cwd: dir,
          encoding: "utf8",
          env: {
            NODE_ENV: "test",
            PATH: process.env.PATH ?? "",
            HOME: dir,
            RUNNER_TEMP: runner,
            OUTPUT: output,
            BASE: "main",
            UNCHANGED_BY: String(step?.env?.UNCHANGED_BY),
          },
        });

      write();
      const same = runStep(compare);
      expect(same.stderr).toBe("");
      expect([same.status, same.stdout.trim()]).toEqual([
        0,
        "Only fetchedAt and revisions differ from main; nothing to propose.",
      ]);
      expect(readFileSync(join(dir, output, "person.json"), "utf8")).toBe(base);

      // A sitelink count that moved is a change: the output is copied over.
      const goya = rerun.sitelinks[0];
      if (goya?.sitelinks != null) goya.sitelinks += 1;
      write();
      const changed = runStep(`${compare}\necho "proposing"`);
      expect([changed.status, changed.stdout.trim()]).toEqual([0, "proposing"]);
      expect(
        JSON.parse(readFileSync(join(dir, output, "person.json"), "utf8")),
      ).toEqual(rerun);
    },
  );
});

// ---------------------------------------------------------------------------
// The dry run
// ---------------------------------------------------------------------------

describe("ENR-1 a dry run over the fixture QID list", () => {
  it("ENR-1 a dry run over the fixture QID list writes the expected JSON shape", async () => {
    const files = await dryRun();
    const dir = join(tempDir("qz-enrich-out-"), "_wikidata");
    const written = await writeEnrichmentFiles(dir, files);
    expect(written.map((path) => path.slice(dir.length + 1)).sort()).toEqual([
      "country.json",
      "landmark.json",
      "music_artist.json",
      "person.json",
    ]);
    for (const [name, raw] of Object.entries(snapshot(dir))) {
      const data: unknown = JSON.parse(raw);
      expect(EnrichmentFileSchema.safeParse(data).success, name).toBe(true);
      expect(data).toEqual(EXPECTED[name.slice(0, -5)]);
    }
  });

  it("asks only the Action API, one request at a time, with maxlag and a descriptive User-Agent", async () => {
    const { deps, requests, logs } = stubDeps();
    await fetchEnrichment(fixtureLists(), deps, NOW);
    for (const request of requests) {
      expect(`${request.url.origin}${request.url.pathname}`).toBe(WIKIDATA_API);
      expect(request.url.searchParams.get("maxlag")).toBe("5");
      expect(request.headers["user-agent"]).toBe(deps.userAgent);
    }
    expect(requests.map((r) => r.url.searchParams.get("action"))).toEqual([
      "wbgetentities", // the property labels, first
      "wbgetentities", // the referenced QIDs
      ...Array<string>(8).fill("wbsearchentities"),
      "wbgetentities", // the candidates
      ...Array<string>(4).fill("wbgetclaims"), // Q16, Q30, Q953, Q954
    ]);
    // Never a retired entry, never an entry that already has a QID.
    const searched = requests.flatMap(
      (r) => r.url.searchParams.get("search") ?? [],
    );
    expect(searched.sort()).toEqual([
      "Camille Pissarro",
      "Canada",
      "Claude Monet",
      "Edgar Degas",
      "John Lennon",
      "Niagara Falls",
      "Victoria Falls",
      "Zambia",
    ]);
    expect(logs[0]).toBe(
      "Wikidata answered; 11 of 11 qualifier properties verified by label.",
    );
  });

  it("searches once for namesakes and judges each against its own qualifier", async () => {
    const lists = [
      list("person", [
        entry("x.person.claude-monet", "Claude Monet", {
          descriptor: "painter",
          born: 1840,
        }),
        entry("x.person.claude-monet-namesake", "Claude Monet", {
          descriptor: "painter",
          born: 1841,
        }),
      ]),
    ];
    const { deps, requests } = stubDeps();
    const [person] = await fetchEnrichment(lists, deps, NOW);
    const searches = requests.filter(
      (r) => r.url.searchParams.get("action") === "wbsearchentities",
    );
    expect(searches).toHaveLength(1);
    expect(person?.candidates.map((c) => [c.id, c.verdict])).toEqual([
      ["x.person.claude-monet", "match"],
      ["x.person.claude-monet-namesake", "none"],
    ]);
  });

  it("skips a statement or a search result it can't read instead of failing the run", async () => {
    const world: SyntheticWorld = {
      ...FIXTURE_WORLD,
      entities: {
        ...FIXTURE_WORLD.entities,
        Q296: {
          ...FIXTURE_WORLD.entities.Q296,
          // An unreadable statement beside a good one.
          claims: {
            P569: [{ type: 5 as unknown as string, value: null }, time(1840)],
          },
        },
      },
    };
    const { deps } = stubDeps(world, (url) =>
      url.searchParams.get("search") === "Claude Monet"
        ? replyToResponse({
            status: 200,
            body: {
              search: [
                { label: "a result without an id" },
                {
                  id: "Q296",
                  label: "Claude Monet",
                  aliases: [7, "Monet"],
                  match: "unexpected",
                },
              ],
            },
          })
        : undefined,
    );
    const files = await fetchEnrichment(fixtureLists(), deps, NOW);
    expect(fileOf(files, "person")).toEqual(EXPECTED.person);
  });

  it("reads the real lists' QIDs at most 50 a request", async () => {
    // Only the QIDs the real lists hold, each copied from a dataset record.
    const lists = ANSWER_TYPES.filter((type) =>
      existsSync(join(REPO_ROOT, "content/answer-lists", `${type}.json`)),
    ).map((type) => {
      const real = JSON.parse(
        readFileSync(
          join(REPO_ROOT, "content/answer-lists", `${type}.json`),
          "utf8",
        ),
      ) as AnswerList;
      return {
        ...real,
        entities: real.entities.filter((e) => /^Q\d+$/.test(e.id)),
      };
    });
    const qids = lists.flatMap((l) => l.entities.map((e) => e.id));
    expect(qids.length).toBeGreaterThan(50);
    const { deps, requests } = stubDeps();
    const files = await fetchEnrichment(lists, deps, NOW);
    const sizes = requests
      .slice(1)
      .filter((r) => r.url.searchParams.get("action") === "wbgetentities")
      .map((r) => (r.url.searchParams.get("ids") ?? "").split("|").length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(50);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(new Set(qids).size);
    expect(files.flatMap((f) => f.sitelinks.map((r) => r.id)).sort()).toEqual(
      [...qids].sort(),
    );
  });

  it(
    "through the CLI writes one file per list and leaves every list file as it was",
    { timeout: 60_000 },
    () => {
      const repo = cliRepo();
      const lists = join(repo, "content/answer-lists");
      const before = snapshot(lists);
      const run = cli(repo, "world", "--summary", "summary.md");
      expect(run.stderr).toBe("");
      expect(run.code).toBe(0);
      expect(snapshot(lists)).toEqual(before);
      const out = snapshot(join(lists, "_wikidata"));
      expect(Object.keys(out)).toEqual([
        "country.json",
        "landmark.json",
        "music_artist.json",
        "person.json",
      ]);
      for (const [name, raw] of Object.entries(out)) {
        const data = JSON.parse(raw) as EnrichmentFile;
        expect({ ...data, fetchedAt: FETCHED_AT }).toEqual(
          EXPECTED[name.slice(0, -5)],
        );
      }
      expect(readFileSync(join(repo, "summary.md"), "utf8")).toContain(
        "| person | 2 | 1 | 0 | 1 | 0 | 3 | 1 | 0 | 0 | 1 | 1 |",
      );
      expect(run.stdout.trim().split("\n").at(-1)).toBe(
        "enrich-wikidata: wrote 4 file(s) to content/answer-lists/_wikidata/. No list entry changed; once the pull request merges, the list builder applies it with --apply.",
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

describe("ENR-1 without network", () => {
  it(
    "ENR-1 the real run, which can't reach Wikidata from the sandbox, fails with one line naming the host and writes nothing",
    { timeout: 60_000 },
    () => {
      const repo = cliRepo();
      // An earlier run's output stays exactly as it was.
      const out = join(repo, "content/answer-lists/_wikidata");
      mkdirSync(out);
      writeFileSync(join(out, "person.json"), '{ "earlier": true }\n');
      const run = cli(repo, "offline");
      expect(run.code).toBe(1);
      expect(run.stdout).toBe("");
      expect(run.stderr).toBe(
        "enrich-wikidata: cannot reach www.wikidata.org (ENOTFOUND); nothing was written\n",
      );
      expect(snapshot(out)).toEqual({ "person.json": '{ "earlier": true }\n' });
    },
  );

  it(
    "a run that loses the network midway writes no partial files",
    { timeout: 60_000 },
    () => {
      const repo = cliRepo();
      const run = cli(repo, "fail-after:5");
      expect(run.code).toBe(1);
      expect(run.stderr.trim().split("\n")).toEqual([
        "enrich-wikidata: cannot reach www.wikidata.org (ENOTFOUND); nothing was written",
      ]);
      expect(existsSync(join(repo, "content/answer-lists/_wikidata"))).toBe(
        false,
      );
    },
  );

  it("waits as Retry-After asks on 429 and maxlag answers, then carries on", async () => {
    const { deps, sleeps } = stubDeps(FIXTURE_WORLD, (_url, call) => {
      if (call === 1)
        return new Response("slow down", {
          status: 429,
          headers: { "retry-after": "7" },
        });
      if (call === 2)
        return replyToResponse({
          status: 200,
          body: {
            error: {
              code: "maxlag",
              info: "Waiting for a database server: 6 seconds lagged.",
              lag: 6,
            },
          },
          headers: { "retry-after": "5" },
        });
      return undefined;
    });
    const files = await fetchEnrichment(fixtureLists(), deps, NOW);
    expect(sleeps).toEqual([7000, 5000]);
    expect(fileOf(files, "person")).toEqual(EXPECTED.person);
  });

  it("rides out a long spell of maxlag on its wait budget, not on its attempts", async () => {
    const { deps, sleeps } = stubDeps(FIXTURE_WORLD, (_url, call) =>
      call >= 2 && call <= 11
        ? replyToResponse({
            status: 200,
            body: { error: { code: "maxlag", info: "6 seconds lagged." } },
            headers: { "retry-after": "5" },
          })
        : undefined,
    );
    const files = await fetchEnrichment(fixtureLists(), deps, NOW);
    expect(sleeps).toEqual(Array<number>(10).fill(5000));
    expect(fileOf(files, "person")).toEqual(EXPECTED.person);
  });

  it("gives up once the waits Wikidata asks for pass 15 minutes, naming the host", async () => {
    const { deps, sleeps } = stubDeps(FIXTURE_WORLD, () =>
      replyToResponse({
        status: 200,
        body: { error: { code: "ratelimited", info: "slow down" } },
        headers: { "retry-after": "60" },
      }),
    );
    await expect(fetchEnrichment(fixtureLists(), deps, NOW)).rejects.toThrow(
      "www.wikidata.org still answered API error ratelimited to wbgetentities after 15 minutes of waiting",
    );
    expect(sleeps).toEqual(Array<number>(15).fill(60_000));
  });

  it("retries a dropped connection with growing waits", async () => {
    const { deps, sleeps } = stubDeps(FIXTURE_WORLD, (_url, call) =>
      call <= 2 ? networkError("ECONNRESET") : undefined,
    );
    await fetchEnrichment(fixtureLists(), deps, NOW);
    expect(sleeps).toEqual([2000, 4000]);
  });

  /** A 200 answer whose body fails while it arrives, as undici reports it. */
  const failingBody = (error: Error) =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"entities":'));
          controller.error(error);
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  it("retries a body that times out on the way, and never calls it not JSON", async () => {
    const { deps, sleeps } = stubDeps(FIXTURE_WORLD, (_url, call) =>
      call === 2
        ? failingBody(
            new DOMException(
              "The operation was aborted due to timeout",
              "TimeoutError",
            ),
          )
        : undefined,
    );
    const files = await fetchEnrichment(fixtureLists(), deps, NOW);
    expect(sleeps).toEqual([2000]);
    expect(fileOf(files, "person")).toEqual(EXPECTED.person);
  });

  it("gives up on a connection that keeps dropping mid-body, naming the host and the socket error", async () => {
    const { deps, sleeps } = stubDeps(FIXTURE_WORLD, () =>
      failingBody(
        new TypeError("terminated", { cause: { code: "UND_ERR_SOCKET" } }),
      ),
    );
    await expect(fetchEnrichment(fixtureLists(), deps, NOW)).rejects.toThrow(
      "cannot reach www.wikidata.org (UND_ERR_SOCKET)",
    );
    expect(sleeps).toEqual([2000, 4000, 8000, 16000, 32000]);
  });

  it("still says not JSON for a body that arrives whole but isn't JSON", async () => {
    const { deps, requests } = stubDeps(
      FIXTURE_WORLD,
      () => new Response("<html>maintenance</html>", { status: 200 }),
    );
    await expect(fetchEnrichment(fixtureLists(), deps, NOW)).rejects.toThrow(
      "www.wikidata.org sent a wbgetentities response that is not JSON",
    );
    expect(requests).toHaveLength(1);
  });

  it("reads a country item that wbgetclaims calls an unresolved redirect as no country", async () => {
    const { deps } = stubDeps(FIXTURE_WORLD, (url) =>
      url.searchParams.get("action") === "wbgetclaims" &&
      url.searchParams.get("entity") === "Q954"
        ? replyToResponse({
            status: 200,
            body: {
              error: {
                code: "unresolved-redirect",
                info: "The given entity ID refers to a redirect, which is not supported in this context.",
              },
            },
          })
        : undefined,
    );
    const landmark = fileOf(
      await fetchEnrichment(fixtureLists(), deps, NOW),
      "landmark",
    );
    const victoria = landmark.candidates.find(
      (c) => c.id === "x.landmark.victoria-falls",
    );
    expect(victoria?.candidates[0]?.facts).toEqual({ country: ["ZM"] });
    expect([victoria?.verdict, victoria?.match]).toEqual(["match", "Q43278"]);
  });

  it("asks again for an id a truncated wbgetentities answer left out, instead of calling it missing", async () => {
    let truncated = 0;
    const { deps, requests } = stubDeps(FIXTURE_WORLD, (url) => {
      const ids = (url.searchParams.get("ids") ?? "").split("|");
      if (truncated > 0 || !ids.includes("Q34221")) return undefined;
      truncated += 1;
      const body = answer(FIXTURE_WORLD, url).body as {
        entities: Record<string, unknown>;
      };
      delete body.entities.Q34221;
      return replyToResponse({
        status: 200,
        body: {
          ...body,
          warnings: {
            result: {
              warnings:
                "This result was truncated because it would otherwise be larger than the limit of 8,388,608 bytes.",
            },
          },
        },
      });
    });
    const files = await fetchEnrichment(fixtureLists(), deps, NOW);
    expect(fileOf(files, "landmark")).toEqual(EXPECTED.landmark);
    // The referenced QIDs once, then Q34221 on its own; then the candidates.
    const asked = requests
      .filter((r) => r.url.searchParams.get("action") === "wbgetentities")
      .map((r) => r.url.searchParams.get("ids"));
    expect(asked[2]).toBe("Q34221");
  });

  it("fails the run, naming the id, when a truncated answer keeps leaving it out", async () => {
    const { deps } = stubDeps(FIXTURE_WORLD, (url) => {
      const ids = (url.searchParams.get("ids") ?? "").split("|");
      if (!ids.includes("Q43278")) return undefined;
      const body = answer(FIXTURE_WORLD, url).body as {
        entities: Record<string, unknown>;
      };
      delete body.entities.Q43278;
      return replyToResponse({ status: 200, body });
    });
    await expect(fetchEnrichment(fixtureLists(), deps, NOW)).rejects.toThrow(
      "www.wikidata.org left Q43278 out of wbgetentities (the result was truncated)",
    );
  });

  it("gives up after six 503 answers, naming the host", async () => {
    const { deps, sleeps } = stubDeps(
      FIXTURE_WORLD,
      () => new Response("unavailable", { status: 503 }),
    );
    await expect(fetchEnrichment(fixtureLists(), deps, NOW)).rejects.toThrow(
      "www.wikidata.org still answered HTTP 503 to wbgetentities after 6 attempts",
    );
    expect(sleeps).toEqual([2000, 4000, 8000, 16000, 32000]);
  });

  it("fails at once on a refused API call, naming the host and the code", async () => {
    const { deps, requests } = stubDeps(FIXTURE_WORLD, () =>
      replyToResponse({
        status: 200,
        body: {
          error: { code: "internal_api_error", info: "Something\nbroke" },
        },
      }),
    );
    await expect(fetchEnrichment(fixtureLists(), deps, NOW)).rejects.toThrow(
      "www.wikidata.org refused wbgetentities (internal_api_error: Something broke)",
    );
    expect(requests).toHaveLength(1);
  });

  it("tells a missing host or a refused tunnel, which end the run, from a dropped connection or a timeout", () => {
    expect(networkFailure(networkError("ENOTFOUND"))).toEqual({
      reason: "ENOTFOUND",
      permanent: true,
    });
    expect(networkFailure(networkError("ECONNRESET"))).toEqual({
      reason: "ECONNRESET",
      permanent: false,
    });
    // Through an HTTPS proxy that refuses the host, as undici reports it.
    const refused = new TypeError("fetch failed", {
      cause: Object.assign(new Error("Request was cancelled."), {
        code: 0,
        cause: Object.assign(
          new Error("Proxy response (403) !== 200 when HTTP Tunneling"),
          { code: "UND_ERR_ABORTED" },
        ),
      }),
    });
    expect(networkFailure(refused)).toEqual({
      reason: "the proxy refused the tunnel with HTTP 403",
      permanent: true,
    });
    const timeout = Object.assign(new Error("The operation timed out."), {
      name: "TimeoutError",
    });
    expect(networkFailure(timeout)).toEqual({
      reason: "no answer within 60 s",
      permanent: false,
    });
  });
});

// ---------------------------------------------------------------------------
// The qualifier checks (CONTENT_GUIDE §9.5.1)
// ---------------------------------------------------------------------------

const ALL_VERIFIED = new Set(Object.keys(PROPERTIES) as PropertyId[]);
const NOTHING_RESOLVED = { countries: new Map(), names: new Map() };

function data(claims: EntityData["claims"]): EntityData {
  return {
    id: "Q296",
    revision: null,
    label: null,
    description: null,
    aliases: [],
    sitelinks: 0,
    claims,
  };
}

function agreement(
  type: AnswerType,
  qualifier: Record<string, unknown>,
  entity: EntityData,
  resolved: Parameters<typeof compareQualifier>[3] = NOTHING_RESOLVED,
  verified: ReadonlySet<PropertyId> = ALL_VERIFIED,
) {
  return compareQualifier(type, qualifier, entity, resolved, verified).map(
    (result) => [result.field, result.agrees],
  );
}

describe("the qualifier checks", () => {
  it("reads years only at year precision or finer, with their sign", () => {
    expect(yearOf(time(1746).value)).toBe(1746);
    expect(yearOf(time(1746, 9).value)).toBe(1746);
    expect(yearOf(time(1740, 8).value)).toBeNull(); // a decade
    expect(yearOf(time(1700, 7).value)).toBeNull(); // a century
    expect(yearOf(time(-469, 9).value)).toBe(-469);
    expect(yearOf({ time: "soon", precision: 11 })).toBeNull();
    expect(yearOf("1746")).toBeNull();
  });

  it("compares each list's qualifier with Wikidata's facts", () => {
    const born = { descriptor: "painter", born: 1642 };
    // Two recorded birth dates (calendars differ): either may agree.
    expect(
      agreement("person", born, data({ P569: [time(1642), time(1643)] })),
    ).toEqual([["born", true]]);
    expect(agreement("person", born, data({ P569: [time(1600, 7)] }))).toEqual([
      ["born", null],
    ]);
    expect(
      agreement(
        "person",
        { ...born, born: null },
        data({ P569: [time(1642)] }),
      ),
    ).toEqual([["born", null]]);
    expect(
      agreement(
        "film",
        { year: 1996 },
        data({ P577: [time(1995), time(1996)] }),
      ),
    ).toEqual([["year", true]]);
    expect(
      agreement("film", { year: 1997 }, data({ P577: [time(1995)] })),
    ).toEqual([["year", false]]);
    expect(
      agreement(
        "animal",
        { scientificName: "Panthera leo" },
        data({ P225: [text("Panthera Leo")] }),
      ),
    ).toEqual([["scientificName", true]]);
    expect(
      agreement(
        "element",
        { symbol: "Cs", number: 55 },
        data({ P246: [text("Cs")], P1086: [quantity(55)] }),
      ),
    ).toEqual([
      ["symbol", true],
      ["number", true],
    ]);
    expect(
      agreement(
        "element",
        { symbol: "Cs", number: 55 },
        data({ P246: [text("CS")], P1086: [quantity(56)] }),
      ),
    ).toEqual([
      ["symbol", false],
      ["number", false],
    ]);
    expect(
      agreement(
        "music_artist",
        { descriptor: "composer", kind: "composer" },
        data({ P569: [time(1912)] }),
      ),
    ).toEqual([["kind", true]]);
    expect(
      agreement(
        "music_artist",
        { descriptor: "rock band", kind: "band" },
        data({ P569: [time(1912)] }),
      ),
    ).toEqual([["kind", false]]);
    expect(
      agreement(
        "music_artist",
        { descriptor: "rock band", kind: "band" },
        data({ P571: [time(1960, 9)] }),
      ),
    ).toEqual([["kind", true]]);
    expect(
      agreement(
        "music_artist",
        { descriptor: "rock band", kind: "band" },
        data({}),
      ),
    ).toEqual([["kind", null]]);
    expect(
      agreement("dish", { origin: null }, data({ P495: [item("Q145")] })),
    ).toEqual([["origin", null]]);
    expect(agreement("sport", {}, data({}))).toEqual([]);
  });

  it("reads countries through each item's ISO code, and authors through their names", () => {
    // Q145, Q16 and Q30 are natural-earth's ids for GB, CA and US.
    const countries = new Map([
      ["Q145", ["GB"]],
      ["Q16", ["CA"]],
      ["Q30", ["US"]],
    ]);
    const resolved = { countries, names: new Map<string, string[]>() };
    const series = { descriptor: "UK", country: "GB", startYear: 2005 };
    expect(
      agreement(
        "tv_series",
        series,
        data({ P580: [time(2005)], P495: [item("Q145")] }),
        resolved,
      ),
    ).toEqual([
      ["startYear", true],
      ["country", true],
    ]);
    expect(
      agreement(
        "tv_series",
        series,
        data({ P571: [time(2005)], P495: [item("Q30")] }),
        resolved,
      ),
    ).toEqual([
      ["startYear", true],
      ["country", false],
    ]);
    expect(
      agreement(
        "city",
        { country: "CA", admin1: null },
        data({ P17: [item("Q16")] }),
        resolved,
      ),
    ).toEqual([["country", true]]);
    expect(
      agreement(
        "landmark",
        { country: "US" },
        data({ P17: [item("Q16"), item("Q30")] }),
        resolved,
      ),
    ).toEqual([["country", true]]);
    // An author item resolves to its English label and aliases (a synthetic pairing).
    const names = new Map([["Q5432", ["Francisco Goya", "Goya"]]]);
    expect(
      agreement(
        "book",
        { author: "Goya", year: 1799 },
        data({ P50: [item("Q5432")] }),
        { countries, names },
      ),
    ).toEqual([["author", true]]);
    expect(CHECKS.book[0]?.same("J.R.R. Tolkien", "J. R. R. Tolkien")).toBe(
      true,
    );
  });

  it("compares nothing through a property that isn't verified this run", () => {
    const unverified = new Set([...ALL_VERIFIED].filter((id) => id !== "P297"));
    const resolved = {
      countries: new Map([["Q16", ["CA"]]]),
      names: new Map<string, string[]>(),
    };
    expect(
      agreement(
        "city",
        { country: "CA", admin1: null },
        data({ P17: [item("Q16")] }),
        resolved,
        unverified,
      ),
    ).toEqual([["country", null]]);
  });

  it("decides each entry's verdict over its label-agreeing candidates", () => {
    const of = (qid: string, qualifier: Candidate["qualifier"]): Candidate => ({
      qid,
      revision: null,
      label: null,
      description: null,
      sitelinks: 0,
      labelMatch: "label",
      facts: {},
      qualifier,
    });
    expect(
      verdictOf([of("Q296", "agrees"), of("Q46373", "disagrees")]),
    ).toEqual({ verdict: "match", match: "Q296" });
    expect(verdictOf([of("Q953", "agrees"), of("Q954", "agrees")])).toEqual({
      verdict: "ambiguous",
      match: null,
    });
    expect(
      verdictOf([of("Q134741", "unknown"), of("Q46373", "disagrees")]),
    ).toEqual({ verdict: "label-only", match: null });
    expect(verdictOf([of("Q46373", "disagrees")])).toEqual({
      verdict: "none",
      match: null,
    });
    expect(verdictOf([])).toEqual({ verdict: "none", match: null });
  });

  it("matches labels the way suggestions normalize names", () => {
    const keys = new Set(["edouard manet", "manet"]);
    expect(labelMatchOf(keys, "Édouard Manet", [])).toBe("label");
    expect(labelMatchOf(keys, "Edouard-Manet Society", ["Manet"])).toBe(
      "alias",
    );
    expect(labelMatchOf(keys, "Claude Monet", ["Monet"])).toBe("none");
    expect(labelMatchOf(new Set(["beatles"]), "The Beatles", [])).toBe("label");
  });

  it("compares nothing through a property whose label differs on Wikidata, and says so", async () => {
    const world: SyntheticWorld = {
      ...FIXTURE_WORLD,
      entities: { ...FIXTURE_WORLD.entities, P569: { label: "date of death" } },
    };
    const files = await dryRun(world);
    const person = fileOf(files, "person");
    expect(person.properties).toEqual({
      P569: { label: "date of death", verified: false },
    });
    expect(person.candidates.map((c) => [c.id, c.verdict])).toEqual([
      ["x.person.camille-pissarro", "label-only"],
      ["x.person.claude-monet", "label-only"],
      ["x.person.edgar-degas", "label-only"],
    ]);
    expect(summaryMarkdown(files)).toContain(
      '**Not compared this run:** P569 (date of birth): Wikidata labels it "date of death".',
    );
  });
});

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

describe("the pull request body", () => {
  it("counts each list and says that no list entry changes", async () => {
    const markdown = summaryMarkdown(await dryRun());
    expect(markdown).toContain(`Fetched ${FETCHED_AT} from ${WIKIDATA_API}`);
    expect(markdown).toContain(
      "This pull request changes only `content/answer-lists/_wikidata/`. No list entry changes",
    );
    for (const row of [
      "| country | 0 | 0 | 0 | 0 | 0 | 2 | 1 | 0 | 0 | 0 | 1 |",
      "| landmark | 1 | 1 | 0 | 0 | 0 | 2 | 1 | 1 | 0 | 0 | 0 |",
      "| music_artist | 1 | 1 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |",
      "| person | 2 | 1 | 0 | 1 | 0 | 3 | 1 | 0 | 0 | 1 | 1 |",
    ])
      expect(markdown).toContain(row);
    expect(markdown).not.toContain("Not compared this run");
  });

  it("gives the list builder's steps in order: a preview of exactly what the write sets, the probed write, the build, both checks, one commit", async () => {
    const steps = summaryMarkdown(await dryRun())
      .split("\n")
      .filter((line) => /^\d\. /.test(line));
    expect(steps).toHaveLength(5);
    expect(steps[0]).toContain(
      "scripts/content/enrich-wikidata.ts --apply --all --accept-matches`",
    );
    expect(steps[1]).toContain("`--write`");
    expect(steps[1]).toContain("C12's suggestion probe");
    expect(steps[2]).toContain("`npm run content:build`");
    expect(steps[3]).toContain(
      "`npm run content:check -- --sealed`, then `npm run content:check`",
    );
    expect(steps[4]).toContain("in a commit that touches no sealed envelope");
  });
});

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

describe("apply, the list builder's step after a merged run", () => {
  const TODAY = "2026-11-09";

  it("copies sitelink counts into popularity under a new version, and changes nothing else", async () => {
    const files = await dryRun();
    const person = listOf(fixtureLists(), "person");
    const before = structuredClone(person);
    const report = applyEnrichment(person, fileOf(files, "person"), {
      write: true,
      acceptMatches: false,
      today: TODAY,
    });
    expect(report).toEqual({
      type: "person",
      stale: false,
      popularity: [{ id: "Q5432", from: 0, to: 7 }],
      accepted: [],
      held: [
        {
          id: "x.person.edouard-manet",
          reason: "Q40599 is missing on Wikidata",
        },
      ],
      written: true,
    });
    expect([person.version, person.liveAt]).toEqual([TODAY, TODAY]);
    // The list now credits Wikidata, for /credits (PRD §3.14).
    expect(person.provenance).toEqual([
      ...before.provenance,
      {
        source: WIKIDATA_PROVENANCE,
        license: "CC0-1.0",
        retrievedAt: "2026-11-09",
      },
    ]);
    expect({
      ...person,
      version: before.version,
      liveAt: before.liveAt,
      provenance: before.provenance,
      entities: person.entities.map((e) =>
        e.id === "Q5432" ? { ...e, popularity: 0 } : e,
      ),
    }).toEqual(before);

    // A later run credits Wikidata once, keeping the newest retrieval date.
    const later = structuredClone(fileOf(files, "person"));
    later.fetchedAt = "2026-11-16T02:47:12Z";
    const goya = later.sitelinks.find((r) => r.id === "Q5432");
    if (goya) goya.sitelinks = 8;
    applyEnrichment(person, later, {
      write: true,
      acceptMatches: false,
      today: "2026-11-16",
    });
    expect(
      person.provenance.filter((p) => p.source === WIKIDATA_PROVENANCE),
    ).toEqual([
      {
        source: WIKIDATA_PROVENANCE,
        license: "CC0-1.0",
        retrievedAt: "2026-11-16",
      },
    ]);
    expect(person.version).toBe("2026-11-16");

    // The same run again has nothing new to give: nothing changes, version included.
    const again = applyEnrichment(person, later, {
      write: true,
      acceptMatches: false,
      today: "2026-11-17",
    });
    expect([again.popularity, again.written, person.version]).toEqual([
      [],
      false,
      "2026-11-16",
    ]);
  });

  it("only reports without write", async () => {
    const files = await dryRun();
    const landmark = listOf(fixtureLists(), "landmark");
    const before = structuredClone(landmark);
    const report = applyEnrichment(landmark, fileOf(files, "landmark"), {
      write: false,
      acceptMatches: true,
      today: TODAY,
    });
    expect(report.popularity).toEqual([
      { id: "Q34221", from: 0, to: 5 },
      { id: "x.landmark.victoria-falls", from: 0, to: 4 },
    ]);
    expect(report.written).toBe(false);
    expect(landmark).toEqual(before);
  });

  it("with acceptMatches sets wikidataId only where the verdict is match, and never for a music_artist", async () => {
    const files = await dryRun();
    const lists = fixtureLists();
    const reports = lists.map((l) =>
      applyEnrichment(l, fileOf(files, l.type), {
        write: true,
        acceptMatches: true,
        today: TODAY,
      }),
    );
    // Not the duplicate, the label-only entry or the entries that disagree,
    // and not John Lennon: a date of birth says person, not musician.
    expect(reports.flatMap((r) => r.accepted)).toEqual([
      { id: "x.country.canada", qid: "Q16" },
      { id: "x.landmark.victoria-falls", qid: "Q43278" },
      { id: "x.person.claude-monet", qid: "Q296" },
    ]);
    expect(reports.find((r) => r.type === "music_artist")?.held).toEqual([
      { id: "x.music_artist.john-lennon", reason: MUSIC_ARTIST_HELD },
    ]);
    expect(
      listOf(lists, "music_artist").entities.find(
        (e) => e.id === "x.music_artist.john-lennon",
      ),
    ).toMatchObject({ wikidataId: null, popularity: 0 });
    const monet = listOf(lists, "person").entities.find(
      (e) => e.id === "x.person.claude-monet",
    );
    expect(monet).toMatchObject({
      id: "x.person.claude-monet",
      wikidataId: "Q296",
      popularity: 9,
    });
    const degas = listOf(lists, "person").entities.find(
      (e) => e.id === "x.person.edgar-degas",
    );
    expect(degas).toMatchObject({ wikidataId: null, popularity: 0 });
  });

  it("holds an entry that changed after the run, a QID whose label differs, and a QID another entry took", async () => {
    const files = await dryRun();
    const file = structuredClone(fileOf(files, "person"));
    const goya = file.sitelinks.find((r) => r.id === "Q5432");
    if (goya)
      Object.assign(goya, { label: "Someone Else", labelMatch: "none" });
    const person = listOf(fixtureLists(), "person");
    person.version = "2026-11-05";
    for (const entity of person.entities) {
      if (entity.id === "x.person.edouard-manet") entity.wikidataId = "Q296";
    }
    const report = applyEnrichment(person, file, {
      write: false,
      acceptMatches: true,
      today: TODAY,
    });
    expect(report.stale).toBe(true);
    expect(report.popularity).toEqual([]);
    expect(report.accepted).toEqual([]);
    expect(report.held).toEqual([
      {
        id: "Q5432",
        reason:
          'Wikidata labels Q5432 "Someone Else", which is neither the name nor an alias',
      },
      {
        id: "x.person.claude-monet",
        reason: "Q296 already belongs to x.person.edouard-manet",
      },
      {
        id: "x.person.edouard-manet",
        reason: "the entry changed after the run; fetch again",
      },
    ]);
  });

  it("holds an entry whose qualifier or aliases changed after the run, even under its old name", async () => {
    const files = await dryRun();
    const person = listOf(fixtureLists(), "person");
    for (const entity of person.entities) {
      // The list builder repoints Monet's entry at someone else...
      if (entity.id === "x.person.claude-monet")
        entity.qualifier = { descriptor: "footballer", born: 1900 };
      // ...and drops the alias Goya's label check could have rested on.
      if (entity.id === "Q5432") entity.aliases = [];
    }
    person.version = "2026-11-12";
    const report = applyEnrichment(person, fileOf(files, "person"), {
      write: true,
      acceptMatches: true,
      today: TODAY,
    });
    const changed = "the entry changed after the run; fetch again";
    expect(report).toMatchObject({
      stale: true,
      popularity: [],
      accepted: [],
      held: [
        { id: "Q5432", reason: changed },
        { id: "x.person.claude-monet", reason: changed },
        {
          id: "x.person.edouard-manet",
          reason: "Q40599 is missing on Wikidata",
        },
      ],
      written: false,
    });
    expect(
      person.entities.find((e) => e.id === "x.person.claude-monet"),
    ).toMatchObject({ wikidataId: null, popularity: 0 });
  });

  it("holds a match its own candidates don't bear out, and refuses such a file outright", async () => {
    const files = await dryRun();
    const edits: [string, (file: EnrichmentFile) => void][] = [
      // A QID no candidate carries.
      [
        "a match no candidate carries",
        (file) => {
          const monet = file.candidates.find(
            (c) => c.id === "x.person.claude-monet",
          );
          if (monet) monet.match = "Q12345";
        },
      ],
      // The only candidate disagrees, yet the verdict stayed match.
      [
        "a match whose candidate disagrees",
        (file) => {
          const agreeing = file.candidates.find(
            (c) => c.id === "x.person.claude-monet",
          )?.candidates[0];
          if (agreeing) agreeing.qualifier = "disagrees";
        },
      ],
    ];
    for (const [what, edit] of edits) {
      const file = structuredClone(fileOf(files, "person"));
      edit(file);
      const report = applyEnrichment(listOf(fixtureLists(), "person"), file, {
        write: false,
        acceptMatches: true,
        today: TODAY,
      });
      expect(report.accepted, what).toEqual([]);
      expect(report.held, what).toContainEqual({
        id: "x.person.claude-monet",
        reason: "the file's verdict does not follow from its candidates",
      });
      const parsed = EnrichmentFileSchema.safeParse(file);
      expect(parsed.success, what).toBe(false);
      expect(
        parsed.error?.issues.map((i) => i.path.join(".")),
        what,
      ).toEqual(["candidates.1.verdict"]);
    }
    // A duplicate always names whom it shares the QID with.
    const shared = structuredClone(fileOf(files, "landmark"));
    delete shared.candidates[0]?.sharedWith;
    expect(EnrichmentFileSchema.safeParse(shared).success).toBe(false);
  });

  it("marks a match on a QID another list, a retired entry or a redirect already holds as a duplicate", async () => {
    const music = list("music_artist", [
      entry("Q1203", "John Lennon", {
        descriptor: "singer-songwriter",
        kind: "solo",
      }),
    ]);
    const person = () =>
      list("person", [
        entry("x.person.john-lennon", "John Lennon", {
          descriptor: "musician",
          born: 1940,
        }),
        // Retired, yet its QID still names the entity.
        entry(
          "Q46373",
          "Edgar Degas",
          { descriptor: "painter", born: 1834 },
          { status: "retired" },
        ),
        entry("x.person.edgar-degas", "Edgar Degas", {
          descriptor: "painter",
          born: 1834,
        }),
        // Its wikidataId redirects to Monet's QID (a synthetic redirect).
        entry(
          "x.person.edouard-manet",
          "Édouard Manet",
          { descriptor: "painter", born: 1832 },
          { wikidataId: "Q40599" },
        ),
        entry("x.person.claude-monet", "Claude Monet", {
          descriptor: "painter",
          born: 1840,
        }),
      ]);
    // Wikidata answers for Q40599 with Q296 and the redirect, as for a merged item.
    const redirecting = (url: URL) => {
      const ids = url.searchParams.get("ids")?.split("|") ?? [];
      if (!ids.includes("Q40599")) return undefined;
      const merged = new URL(url.href);
      merged.searchParams.set(
        "ids",
        ids.map((id) => (id === "Q40599" ? "Q296" : id)).join("|"),
      );
      const body = answer(FIXTURE_WORLD, merged).body as {
        entities: Record<string, Record<string, unknown>>;
      };
      const monet = body.entities.Q296;
      if (monet) monet.redirects = { from: "Q40599", to: "Q296" };
      return replyToResponse({ status: 200, body });
    };
    const verdicts = (file: EnrichmentFile) =>
      file.candidates.map((c) => [c.id, c.verdict, c.match, c.sharedWith]);
    const expected = [
      [
        "x.person.claude-monet",
        "duplicate",
        "Q296",
        ["x.person.edouard-manet"],
      ],
      ["x.person.edgar-degas", "duplicate", "Q46373", ["Q46373"]],
      ["x.person.john-lennon", "duplicate", "Q1203", ["Q1203"]],
    ];

    // Every list read in one run...
    const both = await fetchEnrichment(
      [music, person()],
      stubDeps(FIXTURE_WORLD, redirecting).deps,
      NOW,
    );
    expect(verdicts(fileOf(both, "person"))).toEqual(expected);
    // ...or one list, with the others read for their QIDs only.
    const alone = await fetchEnrichment(
      [person()],
      stubDeps(FIXTURE_WORLD, redirecting).deps,
      NOW,
      [music],
    );
    expect(verdicts(fileOf(alone, "person"))).toEqual(expected);

    // A run that read neither the music list nor the redirect sees two
    // matches; apply still holds both, given the QIDs every list holds
    // (applyMain reads every list present for them).
    const blind = fileOf(
      await fetchEnrichment([person()], stubDeps().deps, NOW),
      "person",
    );
    expect(verdicts(blind)).toEqual([
      ["x.person.claude-monet", "match", "Q296", undefined],
      ["x.person.edgar-degas", "duplicate", "Q46373", ["Q46373"]],
      ["x.person.john-lennon", "match", "Q1203", undefined],
    ]);
    const target = person();
    const report = applyEnrichment(target, blind, {
      write: false,
      acceptMatches: true,
      today: TODAY,
      holders: qidHolders([music, target], new Map([["Q40599", "Q296"]])),
    });
    expect(report.accepted).toEqual([]);
    expect(report.held).toEqual([
      {
        id: "x.person.claude-monet",
        reason: "Q296 already belongs to x.person.edouard-manet",
      },
      {
        id: "x.person.edouard-manet",
        reason: "Q40599 is missing on Wikidata",
      },
      {
        id: "x.person.john-lennon",
        reason: "Q1203 already belongs to Q1203",
      },
    ]);
  });

  it(
    "through the CLI previews exactly what the write sets, writes only with the content key, and names the next steps, all without network",
    { timeout: 60_000 },
    () => {
      const repo = cliRepo();
      expect(cli(repo, "world").code).toBe(0);
      const lists = join(repo, "content/answer-lists");
      const before = snapshot(lists);
      const args = ["--apply", "--all", "--accept-matches", "--today", TODAY];

      // The preview lists the wikidataId acceptances the write will make.
      const report = cli(repo, "offline", ...args);
      expect(report.code).toBe(0);
      expect(report.stdout).toContain(
        "person: 2 popularity change(s), 1 wikidataId(s) accepted, 1 held.",
      );
      expect(report.stdout).toContain(
        "  would set popularity of Q5432: 0 -> 7",
      );
      expect(report.stdout).toContain(
        "  would set wikidataId of x.person.claude-monet: Q296",
      );
      expect(report.stdout).toContain(
        `  held x.music_artist.john-lennon: ${MUSIC_ARTIST_HELD}`,
      );
      expect(snapshot(lists)).toEqual(before);

      // No content key, no write: the probe needs it.
      const keyless = cli(repo, "offline", ...args, "--write");
      expect(keyless.code).toBe(1);
      expect(keyless.stdout).toBe("");
      expect(keyless.stderr).toContain("--write needs the content key");
      expect(snapshot(lists)).toEqual(before);

      const write = cliWithKey(repo, ...args, "--write");
      expect(write.stderr).toBe("");
      expect(write.code).toBe(0);
      expect(write.stdout).toContain(
        "  set wikidataId of x.person.claude-monet: Q296",
      );
      expect(write.stdout).toContain(
        "C12's suggestion probe found no new hit on 0 checking or active sealed mystery(ies).",
      );
      expect(write.stdout).toContain(
        "Next: npm run content:build, then npm run content:check -- --sealed and npm run content:check",
      );
      const person = JSON.parse(
        readFileSync(join(lists, "person.json"), "utf8"),
      ) as AnswerList;
      expect([person.version, person.liveAt]).toEqual([TODAY, TODAY]);
      expect(person.entities.find((e) => e.id === "Q5432")?.popularity).toBe(7);
      expect(person.provenance.at(-1)?.source).toBe(WIKIDATA_PROVENANCE);
      // content:lists reads the credit as no dataset, so it asks for no pin.
      expect([...citedDatasets(person)]).toEqual([]);

      // A hand-edited verdict fails the file's own schema.
      const out = join(lists, "_wikidata/country.json");
      const edited = JSON.parse(readFileSync(out, "utf8")) as EnrichmentFile;
      const canada = edited.candidates[0];
      if (canada) canada.match = "Q12345";
      writeFileSync(out, JSON.stringify(edited));
      const refused = cli(repo, "offline", "--apply", "--type", "country");
      expect(refused.code).toBe(1);
      expect(refused.stderr).toContain(
        "content/answer-lists/_wikidata/country.json is not a format 2 enrichment file (candidates.0.verdict: the file's verdict does not follow from its candidates)",
      );

      const missing = cli(repo, "offline", "--apply");
      expect(missing.code).toBe(1);
      expect(missing.stderr).toContain("--apply takes --type <type> or --all");
    },
  );

  it(
    "through the CLI holds a match on a QID another list holds, with --type too",
    { timeout: 60_000 },
    async () => {
      const music = list("music_artist", [
        entry("Q1203", "John Lennon", {
          descriptor: "singer-songwriter",
          kind: "solo",
        }),
      ]);
      const person = list("person", [
        entry("x.person.john-lennon", "John Lennon", {
          descriptor: "musician",
          born: 1940,
        }),
      ]);
      const repo = cliRepo([music, person]);
      // A file fetched for the person list alone, blind to the music list.
      const [file] = await fetchEnrichment([person], stubDeps().deps, NOW);
      await writeEnrichmentFiles(
        join(repo, "content/answer-lists/_wikidata"),
        file ? [file] : [],
      );
      expect(file?.candidates[0]?.verdict).toBe("match");
      const run = cli(
        repo,
        "offline",
        "--apply",
        "--type",
        "person",
        "--accept-matches",
      );
      expect(run.code).toBe(0);
      expect(run.stdout).toContain(
        "  held x.person.john-lennon: Q1203 already belongs to Q1203",
      );
      expect(run.stdout).not.toContain("would set wikidataId");
    },
  );
});

// ---------------------------------------------------------------------------
// The suggestion probe before --write (C12, CONTENT_GUIDE §2.13)
// ---------------------------------------------------------------------------

describe("the suggestion probe that --write runs first", () => {
  const TODAY = "2026-11-09";
  /** Six invented people who sort before Claude Monet on "cla". */
  const CLABORS = ["Aster", "Brine", "Corrin", "Dune", "Esk", "Fenn"].map(
    (surname) =>
      entry(`x.person.clabor-${surname.toLowerCase()}`, `Clabor ${surname}`, {
        descriptor: "fixture painter",
        born: 1900,
      }),
  );

  /** The fixture lists, with the Clabors in the person list. */
  function probeLists(): AnswerList[] {
    return fixtureLists().map((l) =>
      l.type === "person" ? { ...l, entities: [...l.entities, ...CLABORS] } : l,
    );
  }

  /**
   * An invented mystery about Claude Monet's entry, accepted on 1 November
   * (before CNT-2's rules landed), so content:check would only warn on a C12
   * hit. Its first clue holds "clan": typing "cla" shows six Clabors while
   * every popularity is 0, and Monet first once he has one.
   */
  function mystery(): Mystery {
    const accepted = JSON.parse(
      readFileSync(
        join(REPO_ROOT, "content/practice/geography/p.geo.0101.json"),
        "utf8",
      ),
    ) as { verification: Mystery["verification"] };
    return {
      ...fxMystery(),
      id: "m.art.0101",
      status: "active",
      category: "art",
      answerType: "person",
      answer: "x.person.claude-monet",
      clues: [
        "Its fixture clan gathered by the Vellum river.",
        "Its calendar has thirteen weeks of 28 days.",
        "The river runs through its capital, Cindral.",
        "This invented fixture person painted the seven bridges of Cindral.",
      ],
      distractors: [
        "x.person.edgar-degas",
        "x.person.camille-pissarro",
        "Q5432",
      ],
      likelyGuesses: CLABORS.map((e) => e.id),
      rivals: [
        { id: "x.person.edgar-degas", ruledOutBy: [1, 2] },
        { id: "x.person.camille-pissarro", ruledOutBy: [2, 3] },
        { id: "Q5432", ruledOutBy: [1, 3] },
      ],
      predicted: {
        solveByClue: [0.2, 0.4, 0.6, 0.9],
        spread: 0.1,
        estimator: "es-fx-estimator",
      },
      verification: accepted.verification,
    } as Mystery;
  }

  it("finds the C12 hit a new popularity brings on a mystery accepted before the rules landed, which content:check only warns about", async () => {
    const lists = probeLists();
    const person = listOf(lists, "person");
    const record = mystery();
    expect(
      Date.parse(record.verification?.editor?.decidedAt ?? ""),
    ).toBeLessThan(Date.parse(RULES_LANDED_AT));
    const tree = (people: AnswerList) =>
      writeTree({
        "answer-lists/person.json": people,
        ".sealed-plain/mysteries/m.art.0101.json": record,
      });
    const bank = await loadBank(
      resolveLayout({ repoRoot: REPO_ROOT, root: await tree(person) }),
    );
    expect(bank.itemsById.get("m.art.0101")?.item.status).toBe("active");

    // As the lists stand, and with a popularity elsewhere: no new hit.
    expect(suggestionGuard(bank, [person])).toEqual({
      probed: 1,
      findings: [],
    });
    const goya = structuredClone(person);
    for (const e of goya.entities) if (e.id === "Q5432") e.popularity = 7;
    expect(suggestionGuard(bank, [goya]).findings).toEqual([]);

    // Monet's sitelink count takes him to the top of "cla": a new hit.
    const monet = structuredClone(person);
    for (const e of monet.entities)
      if (e.id === "x.person.claude-monet") e.popularity = 9;
    expect(suggestionGuard(bank, [monet])).toEqual({
      probed: 1,
      findings: [
        expect.objectContaining({
          rule: "C12",
          severity: "error",
          itemId: "m.art.0101",
          path: "clues[0]",
        }),
      ],
    });

    // content:check sees the same hit on that list, but only as a warning,
    // which exits 0: why --write probes for itself.
    const after = await loadBank(
      resolveLayout({ repoRoot: REPO_ROOT, root: await tree(monet) }),
    );
    expect(
      cnt2Findings(after, { dedupe: false })
        .findings.filter((f) => f.rule === "C12" && f.itemId === "m.art.0101")
        .map((f) => `${f.severity} ${f.path ?? ""}`),
    ).toEqual(["warn clues[0]"]);
  });

  it("names a sealed mystery it can't read rather than vouch for it, but lets a broken draft be", async () => {
    const person = listOf(probeLists(), "person");
    const bank = await loadBank(
      resolveLayout({
        repoRoot: REPO_ROOT,
        root: await writeTree({
          "answer-lists/person.json": person,
          ".sealed-plain/mysteries/m.art.0101.json": "{ not json",
          ".sealed-plain/mysteries/m.art.0102.json": {
            ...mystery(),
            id: "m.art.0102",
            status: "draft",
            clues: [],
          },
        }),
      }),
    );
    expect(suggestionGuard(bank, [person]).findings).toEqual([
      expect.objectContaining({
        rule: "C01",
        file: expect.stringMatching(/mysteries\/m\.art\.0101\.json$/),
      }),
    ]);
  });

  it(
    "through the CLI refuses the write, prints only ids, rules and paths, and leaves every list as it was",
    { timeout: 60_000 },
    () => {
      const repo = cliRepo(probeLists());
      seal(repo, "mysteries", "m.art.0101", mystery());
      expect(cli(repo, "world").code).toBe(0);
      const lists = join(repo, "content/answer-lists");
      const before = snapshot(lists);
      const write = cliWithKey(
        repo,
        "--apply",
        "--all",
        "--accept-matches",
        "--write",
        "--today",
        TODAY,
      );
      expect(write.stderr).toBe("");
      expect(write.code).toBe(1);
      const lines = write.stdout.trim().split("\n");
      expect(lines.slice(0, 2)).toEqual([
        "error m.art.0101 C12 clues[0]",
        "enrich-wikidata: 1 item(s), 1 error(s), 0 warning(s).",
      ]);
      expect(lines).toHaveLength(3);
      expect(lines[2]).toMatch(/^enrich-wikidata: nothing was written\./);
      // No entry, clue or popularity: nothing ties the refusal to an answer.
      for (const secret of [
        "Monet",
        "monet",
        "Clabor",
        "clan",
        "popularity",
        "x.person",
        "Q296",
      ])
        expect(write.stdout).not.toContain(secret);
      expect(snapshot(lists)).toEqual(before);

      // A key that opens nothing can't vouch for the mystery either.
      const wrongKey = spawnCli(
        repo,
        {
          ENR_FETCH: "offline",
          QZ_CONTENT_KEY: Buffer.alloc(32, 8).toString("base64"),
        },
        ["--apply", "--all", "--accept-matches", "--write", "--today", TODAY],
      );
      expect(wrongKey.code).toBe(1);
      expect(wrongKey.stdout).toContain(
        "error content/sealed/mysteries/m.art.0101.json.enc C01",
      );
      expect(snapshot(lists)).toEqual(before);

      // Without the accept, Monet keeps popularity 0: the probe passes.
      const popularityOnly = cliWithKey(
        repo,
        "--apply",
        "--all",
        "--write",
        "--today",
        TODAY,
      );
      expect(popularityOnly.stderr).toBe("");
      expect(popularityOnly.code).toBe(0);
      expect(popularityOnly.stdout).toContain(
        "C12's suggestion probe found no new hit on 1 checking or active sealed mystery(ies).",
      );
    },
  );
});
