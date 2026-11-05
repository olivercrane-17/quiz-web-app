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
  removeTempDirs,
  tempDir,
} from "../../src/content/pipeline/__fixtures__/builders.ts";
import type {
  AnswerEntity,
  AnswerList,
} from "../../src/content/schema/answer-lists.ts";
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
  text,
  time,
  type SyntheticWorld,
} from "./__fixtures__/enrich-wikidata.ts";
import {
  CHECKS,
  EnrichmentFileSchema,
  PROPERTIES,
  WIKIDATA_API,
  applyEnrichment,
  compareQualifier,
  fetchEnrichment,
  labelMatchOf,
  networkFailure,
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

afterAll(removeTempDirs);

const SCRIPT = join(REPO_ROOT, "scripts/content/enrich-wikidata.ts");
const STUB = join(REPO_ROOT, "scripts/content/__fixtures__/enrich-wikidata.ts");
const WORKFLOW = join(REPO_ROOT, ".github/workflows/wikidata-enrich.yml");
const NOW = new Date("2026-11-09T02:47:12.345Z");
const FETCHED_AT = "2026-11-09T02:47:12Z";
const SOURCE = {
  api: "https://www.wikidata.org/w/api.php",
  license: "CC0-1.0",
};

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
  label,
  description: SYNTHETIC,
  sitelinks,
  labelMatch: "label",
  facts,
  qualifier,
});

/** What the fixture QID list gives, list by list. */
const EXPECTED: Record<string, EnrichmentFile> = {
  country: {
    format: 1,
    type: "country",
    listVersion: "2026-11-01",
    fetchedAt: FETCHED_AT,
    source: SOURCE,
    properties: { P297: { label: "ISO 3166-1 alpha-2 code", verified: true } },
    sitelinks: [],
    candidates: [
      {
        id: "x.country.canada",
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
    format: 1,
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
        qid: "Q34221",
        label: "Niagara Falls",
        labelMatch: "label",
        sitelinks: 5,
      },
    ],
    candidates: [
      {
        id: "x.landmark.niagara-falls",
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
    format: 1,
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
        qid: "Q1299",
        label: "The Beatles",
        labelMatch: "label",
        sitelinks: 3,
      },
    ],
    candidates: [
      {
        id: "x.music_artist.john-lennon",
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
    format: 1,
    type: "person",
    listVersion: "2026-11-01",
    fetchedAt: FETCHED_AT,
    source: SOURCE,
    properties: { P569: { label: "date of birth", verified: true } },
    sitelinks: [
      {
        id: "Q5432",
        qid: "Q5432",
        label: "Francisco Goya",
        labelMatch: "label",
        sitelinks: 7,
      },
      {
        id: "x.person.edouard-manet",
        qid: "Q40599",
        label: null,
        labelMatch: "none",
        sitelinks: null,
        missing: true,
      },
    ],
    candidates: [
      {
        id: "x.person.camille-pissarro",
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
function cliRepo(): string {
  const repo = tempDir("qz-enrich-");
  writeFileSync(join(repo, "package.json"), "{}\n");
  mkdirSync(join(repo, "content/answer-lists"), { recursive: true });
  for (const fixture of fixtureLists())
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

function cli(repo: string, fetchMode: string, ...args: string[]) {
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
      env: { PATH: process.env.PATH ?? "", HOME: repo, ENR_FETCH: fetchMode },
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
      pull_request: expect.objectContaining({ type: "boolean" }),
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

  it("ENR-1 the workflow's steps are safe to run: pinned first-party actions, no persisted token, no expression inside a script, valid bash", () => {
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
  });

  it("checks the properties under the labels the synthetic Wikidata gives", () => {
    expect(PROPERTY_LABELS).toEqual(PROPERTIES);
  });
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

  it("through the CLI writes one file per list and leaves every list file as it was", () => {
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
  });
});

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

describe("ENR-1 without network", () => {
  it("ENR-1 the real run, which can't reach Wikidata from the sandbox, fails with one line naming the host and writes nothing", () => {
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
  });

  it("a run that loses the network midway writes no partial files", () => {
    const repo = cliRepo();
    const run = cli(repo, "fail-after:5");
    expect(run.code).toBe(1);
    expect(run.stderr.trim().split("\n")).toEqual([
      "enrich-wikidata: cannot reach www.wikidata.org (ENOTFOUND); nothing was written",
    ]);
    expect(existsSync(join(repo, "content/answer-lists/_wikidata"))).toBe(
      false,
    );
  });

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

  it("retries a dropped connection with growing waits", async () => {
    const { deps, sleeps } = stubDeps(FIXTURE_WORLD, (_url, call) =>
      call <= 2 ? networkError("ECONNRESET") : undefined,
    );
    await fetchEnrichment(fixtureLists(), deps, NOW);
    expect(sleeps).toEqual([2000, 4000]);
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
    expect(markdown).toContain("npm run content:check -- --sealed");
    expect(markdown).not.toContain("Not compared this run");
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
    expect({
      ...person,
      version: before.version,
      liveAt: before.liveAt,
      entities: person.entities.map((e) =>
        e.id === "Q5432" ? { ...e, popularity: 0 } : e,
      ),
    }).toEqual(before);

    // A second run finds nothing to do and keeps the version.
    const again = applyEnrichment(person, fileOf(files, "person"), {
      write: true,
      acceptMatches: false,
      today: "2026-11-10",
    });
    expect([again.popularity, again.written, person.version]).toEqual([
      [],
      false,
      TODAY,
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

  it("with acceptMatches sets wikidataId only where the verdict is match", async () => {
    const files = await dryRun();
    const lists = fixtureLists();
    const accepted = lists.flatMap(
      (l) =>
        applyEnrichment(l, fileOf(files, l.type), {
          write: true,
          acceptMatches: true,
          today: TODAY,
        }).accepted,
    );
    // Not the duplicate, the label-only entry or the entries that disagree.
    expect(accepted).toEqual([
      { id: "x.country.canada", qid: "Q16" },
      { id: "x.landmark.victoria-falls", qid: "Q43278" },
      { id: "x.music_artist.john-lennon", qid: "Q1203" },
      { id: "x.person.claude-monet", qid: "Q296" },
    ]);
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

  it("through the CLI reports, then writes, and names the reviewer step, all without network", () => {
    const repo = cliRepo();
    expect(cli(repo, "world").code).toBe(0);
    const lists = join(repo, "content/answer-lists");
    const before = snapshot(lists);

    const report = cli(repo, "offline", "--apply", "--all");
    expect(report.code).toBe(0);
    expect(report.stdout).toContain(
      "person: 1 popularity change(s), 0 wikidataId(s) accepted, 1 held.",
    );
    expect(report.stdout).toContain("  would set popularity of Q5432: 0 -> 7");
    expect(snapshot(lists)).toEqual(before);

    const write = cli(
      repo,
      "offline",
      "--apply",
      "--all",
      "--write",
      "--accept-matches",
      "--today",
      TODAY,
    );
    expect(write.stderr).toBe("");
    expect(write.code).toBe(0);
    expect(write.stdout).toContain(
      "  set wikidataId of x.person.claude-monet: Q296",
    );
    expect(write.stdout).toContain("npm run content:check -- --sealed");
    const person = JSON.parse(
      readFileSync(join(lists, "person.json"), "utf8"),
    ) as AnswerList;
    expect([person.version, person.liveAt]).toEqual([TODAY, TODAY]);
    expect(person.entities.find((e) => e.id === "Q5432")?.popularity).toBe(7);

    const missing = cli(repo, "offline", "--apply");
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("--apply takes --type <type> or --all");
  });
});
