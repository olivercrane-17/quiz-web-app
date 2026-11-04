// @vitest-environment node
/**
 * CNT-1's rules of ARCHITECTURE §5.2 (scripts/content/lib/rules.ts): a good
 * and a bad sample for each, status gating, and the checks behind
 * AC-CNT-01 to 04 and 06, which pass on the real bank at QA-2 (--launch).
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  countryId,
  fxComparison,
  fxCountryList,
  fxEncore,
  fxFiles,
  fxMc,
  fxMystery,
  loadContentTree,
  loadFx,
  removeTempDirs,
  tempDir,
} from "../../../src/content/pipeline/__fixtures__/builders.ts";
import {
  loadBank,
  type Bank,
  type BankItem,
} from "../../../src/content/pipeline/bank.ts";
import { resolveLayout } from "../../../src/content/pipeline/layout.ts";
import { lintBank } from "../../../src/content/pipeline/lint/index.ts";
import { poolFindings } from "../../../src/content/pipeline/lint/pool-rules.ts";
import { emptyReferences } from "../../../src/content/pipeline/references.ts";
import { CATEGORY_TABLE } from "../../../src/content/schema/categories.ts";
import { PracticeItemSchema } from "../../../src/content/schema/items.ts";
import type { Finding } from "../lint.ts";
import { RULES_LANDED_AT } from "../lint/cutoff.ts";
import { listHistory } from "./git.ts";
import {
  crossPoolRules,
  itemRules,
  listRules,
  poolRules,
  scheduleDayRules,
  scheduleRules,
  trackDays,
  type RuleOptions,
} from "./rules.ts";

afterAll(removeTempDirs);

const COMPOSITIONS = JSON.parse(
  readFileSync(join(REPO_ROOT, "content", "compositions.json"), "utf8"),
) as unknown;
const EPOCH = "2026-09-21";

function options(patch: Partial<RuleOptions> = {}): RuleOptions {
  return {
    today: "2026-09-21",
    launch: false,
    epoch: EPOCH,
    compositions: COMPOSITIONS,
    histories: null,
    ...patch,
  };
}

const rulesOf = (findings: readonly Finding[]) =>
  findings.map((f) => `${f.severity} ${f.rule}`);
const only = (findings: readonly Finding[], rule: string) =>
  findings.filter((f) => f.rule === rule);

function readContent(path: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, "content", path), "utf8"),
  ) as Record<string, unknown>;
}

describe("status gating (ARCHITECTURE §5.1.1)", () => {
  it("a draft without predicted passes its schema, and a checking one fails", () => {
    const { predicted: _predicted, ...draft } = {
      ...fxMc(),
      predicted: undefined,
    };
    expect(PracticeItemSchema.safeParse(draft).success).toBe(true);
    const checking = PracticeItemSchema.safeParse({
      ...draft,
      status: "checking",
    });
    expect(checking.success).toBe(false);
    expect(checking.error?.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["predicted", "verification"]),
    );
  });

  it("AC-CNT-01 an active item passes the acceptance rule, and fails it once a confirming check is missing", async () => {
    // A real accepted item from the bank, with its whole checking trail.
    const item = readContent("practice/geography/p.geo.0101.json");
    const tree = (value: unknown) =>
      loadContentTree({
        "batches.json": readContent("batches.json"),
        "practice/geography/p.geo.0101.json": value,
      });
    // An active item that fails its record fails its schema too, so the
    // finding names the file rather than a parsed item.
    const errors = (bank: Bank) =>
      lintBank(bank, { dedupe: false, today: "2026-11-04" }).filter(
        (f) =>
          f.severity === "error" &&
          f.file.endsWith("practice/geography/p.geo.0101.json"),
      );
    expect(errors(await tree(item))).toEqual([]);

    const verification = item.verification as {
      checks: { claimResults: Record<string, unknown>[] }[];
    };
    const [checkA, checkB] = verification.checks;
    if (checkA === undefined || checkB === undefined)
      throw new Error("two checks");
    // Pass B dropped: one check is not two.
    const oneCheck = {
      ...item,
      verification: { ...verification, checks: [checkA] },
    };
    expect(rulesOf(errors(await tree(oneCheck)))).toContain("error C01");
    // Pass B no longer confirms a claim: not every claim is confirmed in both.
    const unconfirmed = {
      ...item,
      verification: {
        ...verification,
        checks: [
          checkA,
          {
            ...checkB,
            claimResults: checkB.claimResults.map((result, i) =>
              i === 0 ? { ...result, verdict: "uncertain" } : result,
            ),
            verdict: "revise",
          },
        ],
      },
    };
    expect(rulesOf(errors(await tree(unconfirmed)))).toContain("error C01");
  });

  it("AC-CNT-01 every claim of the merged list is confirmed in both checks, a follow-up standing in, never by the writer's run", async () => {
    // The reviewers' probe on the real accepted p.geo.0101: check B adds
    // xB1 and confirms it, A never sees it, and the editor merges it and
    // sends it to a follow-up.
    const item = readContent("practice/geography/p.geo.0101.json");
    const verification = item.verification as {
      checks: { pass: string; claimResults: Record<string, unknown>[] }[];
    } & Record<string, unknown>;
    const added = {
      claimId: "xB1",
      verdict: "confirmed",
      evidence: [
        {
          kind: "knowledge",
          basis: "textbook",
          restatement: "Liechtenstein sits between Switzerland and Austria.",
          confidence: "certain",
        },
      ],
      note: "",
      addedClaim: {
        role: "explanation",
        text: "Liechtenstein lies between Switzerland and Austria.",
        risk: "standard",
      },
    };
    const followUp = (checker: string) => ({
      checker,
      pass: "A",
      brief: "confirm",
      packetSha256: "e".repeat(64),
      startedAt: "2026-11-01T05:00:00Z",
      finishedAt: "2026-11-01T05:05:00Z",
      coldSolve: null,
      claimResults: [
        {
          ...added,
          addedClaim: undefined,
          evidence: [
            {
              kind: "knowledge",
              basis: "reference",
              restatement: "Its neighbours are Switzerland and Austria only.",
              confidence: "certain",
            },
          ],
        },
      ],
      issues: [],
      searchesUsed: 0,
      verdict: "pass",
      followUpFor: ["xB1"],
    });
    const merged = (followUps: unknown[]) => ({
      ...item,
      verification: {
        ...verification,
        checks: verification.checks.map((check) =>
          check.pass === "B"
            ? { ...check, claimResults: [...check.claimResults, added] }
            : check,
        ),
        merge: {
          mergedAt: "2026-11-01T04:10:00Z",
          editor: "ed-pgeo01d",
          claims: [
            ...(item.claims as { id: string }[]).map((claim) => ({
              id: claim.id,
              addedBy: "writer",
            })),
            { id: "xB1", addedBy: "B" },
          ],
          duplicates: [],
          sentToFollowUp: ["xB1"],
        },
        followUps,
      },
    });
    const tree = (value: unknown) =>
      loadContentTree({
        "batches.json": readContent("batches.json"),
        "practice/geography/p.geo.0101.json": value,
      });
    const messages = async (value: unknown) =>
      lintBank(await tree(value), { dedupe: false, today: "2026-11-04" })
        .filter(
          (f) =>
            f.severity === "error" &&
            f.file.endsWith("practice/geography/p.geo.0101.json"),
        )
        .map((f) => f.message);
    expect(await messages(merged([]))).toEqual([
      expect.stringContaining("claim xB1, added by pass B, is not confirmed"),
    ]);
    // A passing follow-up under A's brief, by a fresh run, stands in.
    expect(await messages(merged([followUp("fc-pgeo01f")]))).toEqual([]);
    // The writer's own run (w-pgeo01w) may never be the follow-up.
    expect(await messages(merged([followUp("fc-pgeo01w")]))).toEqual([
      expect.stringContaining("is the writer's run"),
    ]);
  });
});

describe("item rules", () => {
  const MC = "practice/geography/fx.p.geo.0101.json";
  const ascending = (options: string[], status = "draft") =>
    fxMc({
      status: status as never,
      order: "ascending",
      answer: options[0] ?? "",
      wrong: options.slice(1),
    });

  it("C18 ascending options sort by one sortKey form: a new item fails, an accepted one warns, and every item fails at launch", async () => {
    const good = await loadFx(
      fxFiles({ [MC]: ascending(["3 km", "1 km", "12 km", "40 km"]) }),
    );
    expect(only(itemRules(good), "C18")).toEqual([]);
    const mixed = ["3,000 m steeplechase", "400 m hurdles", "110 m hurdles"];
    const bad = await loadFx(fxFiles({ [MC]: ascending(mixed) }));
    expect(rulesOf(only(itemRules(bad), "C18"))).toEqual(["error C18"]);
    const scores = await loadFx(
      fxFiles({ [MC]: ascending(["7-1", "3-0", "4-2", "5-1"]) }),
    );
    expect(rulesOf(only(itemRules(scores), "C18"))).toEqual(["error C18"]);
    // An item the lint already flags (no leading number) isn't repeated here.
    const words = await loadFx(
      fxFiles({ [MC]: ascending(["three", "1 km", "2 km", "4 km"]) }),
    );
    expect(only(itemRules(words), "C18")).toEqual([]);
    // Accepted before the rules landed: a warning, until --launch. Accepted
    // since, with the rule in force: an error (scripts/content/lint/cutoff.ts).
    const acceptedOn = (decidedAt: string): Bank => {
      for (const record of bad.items) {
        record.item = {
          ...record.item,
          status: "active",
          verification: {
            checks: [],
            editor: {
              editor: "ed-fx-editor",
              decision: "accept",
              reason: "Both checks pass.",
              decidedAt,
            },
          },
        } as BankItem["item"];
      }
      return bad;
    };
    const before = acceptedOn("2026-11-04T14:00:00Z");
    expect(rulesOf(only(itemRules(before), "C18"))).toEqual(["warn C18"]);
    expect(rulesOf(only(itemRules(before, true), "C18"))).toEqual([
      "error C18",
    ]);
    const since = acceptedOn(RULES_LANDED_AT);
    expect(rulesOf(only(itemRules(since), "C18"))).toEqual(["error C18"]);
  });

  it("C15 a quantity encore answers 21 or more unless its bands are overridden, and custom bands keep 4 decimals", async () => {
    const ENC = "encores/fx.e.0101.json";
    const at = async (patch: Record<string, unknown>) =>
      rulesOf(
        only(
          itemRules(await loadFx(fxFiles({ [ENC]: fxEncore(patch) }))),
          "C15",
        ),
      );
    expect(await at({ answer: 21, decimals: 0, bands: null })).toEqual([]);
    expect(await at({ answer: 20, decimals: 0, bands: null })).toEqual([
      "error C15",
    ]);
    expect(
      await at({
        answer: 20,
        decimals: 0,
        bands: { bullseye: 0.1, close: 0.2 },
      }),
    ).toEqual([]);
    expect(
      await at({
        answer: 120,
        decimals: 0,
        bands: { bullseye: 0.0525, close: 0.15 },
      }),
    ).toEqual([]);
    expect(
      await at({
        answer: 120,
        decimals: 0,
        bands: { bullseye: 0.05251, close: 0.15 },
      }),
    ).toEqual(["error C15"]);
  });

  it("C14 a slot-1 mystery's list holds 100 active entities in the content bank, whatever the slot", async () => {
    const list = (count: number) => {
      const base = fxCountryList() as { entities: Record<string, unknown>[] };
      const first = base.entities[0] ?? {};
      return {
        ...base,
        entities: [
          ...base.entities,
          ...Array.from(
            { length: Math.max(0, count - base.entities.length) },
            (_, i) => ({
              ...first,
              id: `fx.x.country.pad-${i}`,
              name: `Padland ${i}`,
              display: `Padland ${i}`,
              aliases: [],
            }),
          ),
        ].slice(0, count),
      };
    };
    const tree = async (count: number) =>
      loadContentTree({
        "answer-lists/country.json": list(count),
        ".sealed-plain/mysteries/fx.m.geo.0101.json": fxMystery({ slot: 1 }),
      });
    expect(rulesOf(only(itemRules(await tree(60)), "C14"))).toEqual([
      "error C14",
    ]);
    expect(only(itemRules(await tree(100)), "C14")).toEqual([]);
  });
});

describe("answer-list rules", () => {
  function entity(id: string, name: string, display: string, extra = {}) {
    return {
      id,
      name,
      display,
      aliases: [],
      popularity: 0,
      source: "l.person.b01",
      status: "active",
      addedIn: "2026-11-01",
      ...extra,
    };
  }
  const personList = (entities: unknown[]) => ({
    type: "person",
    version: "2026-11-01",
    provenance: [
      { source: "fixture", license: "CC0-1.0", retrievedAt: "2026-11-01" },
    ],
    entities,
  });
  const person = (
    slug: string,
    name: string,
    display: string,
    descriptor = "fixture",
  ) =>
    entity(`x.person.${slug}`, name, display, {
      qualifier: { descriptor, born: null },
    });

  it("X16 a descriptor shows only on a collision, and countries keep CONTENT_GUIDE §2.10's overrides", async () => {
    const collide = await loadContentTree({
      "answer-lists/person.json": personList([
        person("m-astronaut", "Michael Collins", "Michael Collins (astronaut)"),
        person("m-leader", "Michael Collins", "Michael Collins (Irish leader)"),
      ]),
    });
    expect(only(listRules(collide, options(), []), "X16")).toEqual([]);
    const lone = await loadContentTree({
      "answer-lists/person.json": personList([
        person("ada", "Ada Lovelace", "Ada Lovelace (mathematician)"),
      ]),
    });
    expect(rulesOf(only(listRules(lone, options(), []), "X16"))).toEqual([
      "error X16",
    ]);
    const country = (iso: string, display: string) => ({
      type: "country",
      version: "2026-11-01",
      provenance: [
        { source: "fixture", license: "CC0-1.0", retrievedAt: "2026-11-01" },
      ],
      entities: [
        {
          ...entity(`x.country.${iso.toLowerCase()}`, display, display),
          qualifier: { iso_a2: iso },
          source: "l.country.b01",
        },
      ],
    });
    const x16 = async (iso: string, display: string) =>
      rulesOf(
        only(
          listRules(
            await loadContentTree({
              "answer-lists/country.json": country(iso, display),
            }),
            options(),
            [],
          ),
          "X16",
        ),
      );
    expect(await x16("MM", "Myanmar")).toEqual([]);
    expect(await x16("MM", "Myanmar (Burma)")).toEqual([
      "error X16",
      "error X16",
    ]);
    expect(await x16("HK", "Hong Kong SAR China")).toEqual(["error X16"]);
    expect(await x16("CC", "Cocos (Keeling) Islands")).toEqual([]);
    expect(await x16("GN", "Guinea - Bissau")).toEqual(["error X16"]);
  });

  it("X16 films, books and cities show their qualifiers as the guide writes them", async () => {
    const film = (display: string) => ({
      type: "film",
      version: "2026-11-01",
      provenance: [
        { source: "fixture", license: "CC0-1.0", retrievedAt: "2026-11-01" },
      ],
      entities: [
        {
          ...entity("x.film.heat-1995", "Heat", display),
          qualifier: { year: 1995 },
          source: "l.film.b01",
        },
      ],
    });
    const x16 = async (display: string) =>
      only(
        listRules(
          await loadContentTree({ "answer-lists/film.json": film(display) }),
          options(),
          [],
        ),
        "X16",
      ).length;
    expect(await x16("Heat (1995)")).toBe(0);
    expect(await x16("Heat")).toBe(1);
  });

  it("X15 liveAt is the UTC date of the commit that first published the version, and the entries it added carry it", async () => {
    const repo = tempDir("qz-liveat-");
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: repo,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "fixture",
          GIT_AUTHOR_EMAIL: "fixture@example.invalid",
          GIT_COMMITTER_NAME: "fixture",
          GIT_COMMITTER_EMAIL: "fixture@example.invalid",
          GIT_AUTHOR_DATE: "2026-10-30T23:30:00Z",
          GIT_COMMITTER_DATE: "2026-10-30T23:30:00Z",
        },
      });
    const listPath = "content/answer-lists/person.json";
    mkdirSync(join(repo, "content", "answer-lists"), { recursive: true });
    cpSync(
      join(REPO_ROOT, "content", "reference"),
      join(repo, "content", "reference"),
      {
        recursive: true,
      },
    );
    const write = (value: unknown) =>
      writeFileSync(
        join(repo, listPath),
        `${JSON.stringify(value, null, 2)}\n`,
      );
    const v1 = {
      ...personList([
        person("ada", "Ada Lovelace", "Ada Lovelace", "mathematician"),
      ]),
      version: "2026-10-30",
    };
    (v1.entities[0] as { addedIn: string }).addedIn = "2026-10-30";
    git("init", "-q");
    write(v1);
    git("add", "-A");
    git("commit", "-q", "-m", "v1");

    const check = async (today = "2026-11-04") => {
      const bank = await loadBank(
        resolveLayout({ repoRoot: repo, root: "content" }),
      );
      const histories = new Map([[listPath, listHistory(repo, listPath)]]);
      const notes: string[] = [];
      return rulesOf(
        only(listRules(bank, options({ histories, today }), notes), "X15"),
      );
    };
    expect(await check()).toEqual([]);

    // An entry added without bumping the version: a published list changed.
    const sneaky = {
      ...v1,
      entities: [
        ...v1.entities,
        {
          ...person("alan", "Alan Turing", "Alan Turing", "mathematician"),
          addedIn: "2026-10-30",
        },
      ],
    };
    write(sneaky);
    expect(await check()).toContain("error X15");

    // The same entry in a new version, not yet committed: its addedIn
    // must match the version's liveAt-to-be, today until it is published.
    const v2 = { ...sneaky, version: "2026-11-04" };
    write(v2);
    expect(await check()).toEqual(["warn X15"]);
    (v2.entities[1] as { addedIn: string }).addedIn = "2026-11-04";
    write(v2);
    expect(await check()).toEqual([]);

    // Once committed on 2026-11-05 (UTC), addedIn must be that date.
    git("add", "-A");
    execFileSync("git", ["commit", "-q", "-m", "v2"], {
      cwd: repo,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "fixture",
        GIT_AUTHOR_EMAIL: "fixture@example.invalid",
        GIT_COMMITTER_NAME: "fixture",
        GIT_COMMITTER_EMAIL: "fixture@example.invalid",
        GIT_AUTHOR_DATE: "2026-11-05T00:10:00+02:00",
        GIT_COMMITTER_DATE: "2026-11-05T00:10:00+02:00",
      },
    });
    // 00:10 at UTC+2 is 22:10 on 4 November in UTC: the UTC date counts.
    expect(await check("2026-11-06")).toEqual([]);
    expect(listHistory(repo, listPath)).toMatchObject({
      ok: true,
      versions: [
        { version: "2026-10-30", date: "2026-10-30" },
        { version: "2026-11-04", date: "2026-11-04" },
      ],
    });

    // A later version that backdates an existing entry's addedIn (Alan,
    // first published on 4 November, made to look as old as v1) would
    // shorten its 30-day freeze (C14): an error, whichever version this is.
    const v3 = structuredClone(v2);
    v3.version = "2026-11-06";
    (v3.entities[1] as { addedIn: string }).addedIn = "2026-10-30";
    write(v3);
    expect(await check("2026-11-06")).toEqual(["error X15"]);
    execFileSync("git", ["commit", "-qam", "v3"], {
      cwd: repo,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "fixture",
        GIT_AUTHOR_EMAIL: "fixture@example.invalid",
        GIT_COMMITTER_NAME: "fixture",
        GIT_COMMITTER_EMAIL: "fixture@example.invalid",
        GIT_AUTHOR_DATE: "2026-11-06T09:00:00Z",
        GIT_COMMITTER_DATE: "2026-11-06T09:00:00Z",
      },
    });
    expect(await check("2026-11-07")).toEqual(["error X15"]);
  });

  it("X15 says so instead of guessing outside git history", async () => {
    const root = tempDir("qz-nogit-");
    const history = listHistory(root, "content/answer-lists/person.json");
    expect(history).toEqual({
      ok: false,
      reason: expect.stringMatching(/not a git/),
    });
  });

  it("AC-CNT-03 each list meets its launch minimum, and a scheduled mystery's entities are active entries of its list", async () => {
    const small = await loadContentTree({
      "answer-lists/country.json": fxCountryList(),
    });
    expect(only(listRules(small, options(), []), "X17")).toEqual([]);
    expect(
      rulesOf(only(listRules(small, options({ launch: true }), []), "X17")),
    ).toEqual(["error X17"]);
    // A retired distractor (CONTENT_GUIDE §2.10 rule 4): the lint's C14.
    const list = fxCountryList() as { entities: Record<string, unknown>[] };
    const retired = {
      ...list,
      entities: list.entities.map((entity) =>
        entity.id === countryId("Belloria")
          ? { ...entity, status: "retired" }
          : entity,
      ),
    };
    const findings = lintBank(
      await loadFx(fxFiles({ "answer-lists/country.json": retired })),
      { dedupe: false, today: "2026-11-04" },
    );
    expect(
      findings.some(
        (f) =>
          f.rule === "C14" &&
          f.severity === "error" &&
          f.path?.startsWith("distractors"),
      ),
    ).toBe(true);
  });
});

describe("the practice pool", () => {
  const template = readContent("practice/geography/p.geo.0101.json");
  const tfTemplate = readContent("practice/geography/p.geo.0106.json");
  /** n active geography items, cloned from a real accepted one, with the given p and formats. */
  function pool(spec: { p: number; tf?: boolean }[]) {
    const files: Record<string, unknown> = {};
    spec.forEach(({ p, tf }, i) => {
      const batch = 1 + Math.floor(i / 99);
      const seq = 1 + (i % 99);
      const id = `p.geo.${String(batch).padStart(2, "0")}${String(seq).padStart(2, "0")}`;
      const base = tf ? tfTemplate : template;
      files[`practice/geography/${id}.json`] = {
        ...base,
        id,
        predicted: { ...(base.predicted as object), p },
      };
    });
    return files;
  }
  const shares = (n: number, easy: number, medium: number, tf = 0) =>
    Array.from({ length: n }, (_, i) => ({
      p: i < easy ? 0.85 : i < easy + medium ? 0.6 : 0.3,
      tf: i >= n - tf,
    }));
  const geo = (findings: Finding[]) =>
    findings.filter(
      (f) => f.rule === "X19" && f.file === "content/practice/geography",
    );

  it("AC-CNT-04 a category holds 100 active items, at most 10% true/false, and 40/40/20 by predicted p within 5 points", async () => {
    const good = await loadContentTree(pool(shares(100, 40, 40, 10)));
    expect(geo(poolRules(good, options({ launch: true })))).toEqual([]);
    expect(geo(poolRules(good, options()))).toEqual([]);
  });

  it("AC-CNT-04 fails a short category (a warning before launch), a true/false share over 10% and a lopsided band", async () => {
    const short = await loadContentTree(pool(shares(99, 40, 40)));
    expect(rulesOf(geo(poolRules(short, options())))).toEqual(["warn X19"]);
    expect(rulesOf(geo(poolRules(short, options({ launch: true }))))).toContain(
      "error X19",
    );
    const manyTf = await loadContentTree(pool(shares(100, 40, 40, 11)));
    expect(
      geo(poolRules(manyTf, options({ launch: true }))).map((f) => f.message),
    ).toEqual([expect.stringContaining("true/false")]);
    const lopsided = await loadContentTree(pool(shares(100, 30, 50)));
    expect(
      geo(poolRules(lopsided, options({ launch: true }))).map((f) => f.message),
    ).toEqual([
      expect.stringContaining("easy"),
      expect.stringContaining("medium"),
    ]);
  });

  it("AC-CNT-06 the cross-pool check finds a practice item that shares a fact with a Daily item, and names only the sealed side", async () => {
    const mystery = fxMystery();
    const twin = fxMc({
      id: "fx.p.geo.0101",
      stem: "Which fixture country flies a silver heron above three blue waves?",
      answer: "Arvenna",
      wrong: ["Belloria", "Cassova", "Dravenor"],
    });
    const files = {
      "answer-lists/country.json": fxCountryList(),
      ".sealed-plain/mysteries/fx.m.geo.0101.json": mystery,
    };
    const apart = await loadContentTree({
      ...files,
      "practice/geography/fx.p.geo.0101.json": fxMc(),
    });
    expect(crossPoolRules(apart, options({ launch: true }))).toEqual([]);
    const shared = await loadContentTree({
      ...files,
      "practice/geography/fx.p.geo.0101.json": twin,
    });
    // A sealed run without --launch fails too: the content-sealed job runs
    // the cross-pool dedupe on every build (ARCHITECTURE §5.2, §5.7).
    for (const launch of [false, true]) {
      const found = crossPoolRules(shared, options({ launch }));
      expect(
        found.map((f) => `${f.itemId ?? ""} ${f.rule} ${f.severity}`),
      ).toEqual(["fx.m.geo.0101 X29 error"]);
      expect(found[0]?.message).not.toContain("p.geo");
    }
    // --skip-dedupe skips it, and a plaintext run with no sealed items
    // loaded has nothing to compare.
    expect(crossPoolRules(shared, options({ dedupe: false }))).toEqual([]);
    const plaintext = await loadContentTree({
      "answer-lists/country.json": fxCountryList(),
      "practice/geography/fx.p.geo.0101.json": twin,
    });
    expect(plaintext.sealedSource).toBe("none");
    expect(crossPoolRules(plaintext, options({ launch: true }))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The schedule: a synthetic main track of 100 Dailies and 20 spare sets that
// meets every rule of CONTENT_GUIDE §10.1 to §10.7, then one break at a time.
// ---------------------------------------------------------------------------

/** A 4-day cycle: disjoint days, every category every 4 days, a featured category on 3 of 4. */
const CYCLE = [
  ["film", "geo", "hist"],
  ["music", "sci", "nat"],
  ["food", "art", "book"],
  ["sport", "lang", "soc"],
] as const;
/** Each day's encore category, none of that day's mysteries'. */
const ENCORE_CATEGORY = ["lang", "soc", "geo", "film"] as const;
const TYPE_OF: Record<string, string> = {
  geo: "country",
  hist: "person",
  sci: "element",
  nat: "animal",
  film: "film",
  music: "music_artist",
  art: "landmark",
  book: "book",
  sport: "sport",
  food: "dish",
  lang: "city",
  soc: "tv_series",
};
const SHARES: Record<number, number[]> = {
  1: [0.7, 0.85, 0.9, 0.95],
  2: [0.5, 0.65, 0.75, 0.8],
  3: [0.3, 0.5, 0.6, 0.7],
};
const LIST_VERSION = "2026-09-01";

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

interface Built {
  bank: Bank;
  items: Map<string, Record<string, unknown>>;
  dailies: Record<string, unknown>[];
  spares: Record<string, unknown>[];
}

function scheduleBank(days = 100, spareCount = 20): Built {
  const items = new Map<string, Record<string, unknown>>();
  let serial = 0;
  const next = () => (serial += 1);
  const passD = (forDate: string | null, type: string | null) => ({
    checker: "au-fixture",
    pass: "D",
    brief: "daily",
    forDate,
    listVersions: type === null ? {} : { [type]: LIST_VERSION },
    verdict: "pass",
  });
  const mystery = (category: string, slot: number, forSpare: boolean) => {
    const n = next();
    const type = TYPE_OF[category] ?? "country";
    const id = `m.${category}.${String(1000 + n).padStart(4, "0")}`;
    items.set(id, {
      id,
      kind: "mystery",
      status: "active",
      category,
      tags: [`t${n}`],
      region: "global",
      reviewBy: null,
      counterintuitive: slot === 1,
      answerType: type,
      answer: `x.${type}.a${n}`,
      accepted: [],
      distractors: [1, 2, 3].map((k) => `x.${type}.d${n}-${k}`),
      slot,
      predicted: { solveByClue: SHARES[slot], spread: 0.1, estimator: "v0" },
      verification: { dailyChecks: forSpare ? [passD(null, type)] : [] },
    });
    return id;
  };
  const encore = (category: string, forSpare: boolean) => {
    const n = next();
    const id = `e.${String(1000 + n).padStart(4, "0")}`;
    items.set(id, {
      id,
      kind: "encore",
      status: "active",
      category,
      tags: [`t${n}`],
      region: "global",
      reviewBy: null,
      counterintuitive: false,
      valueKind: "quantity",
      verification: { dailyChecks: forSpare ? [passD(null, null)] : [] },
    });
    return id;
  };
  const rounds = (day: number, forSpare: boolean) => {
    const cycle = CYCLE[day % 4] ?? CYCLE[0];
    return [
      ...cycle.map((category, i) => ({
        type: "mystery",
        difficulty: ["easy", "medium", "hard"][i],
        contentId: mystery(category, i + 1, forSpare),
      })),
      {
        type: "encore",
        difficulty: null,
        contentId: encore(ENCORE_CATEGORY[day % 4] ?? "lang", forSpare),
      },
    ];
  };
  const spareIds = Array.from(
    { length: spareCount },
    (_, i) => `spare.${String(i + 1).padStart(2, "0")}`,
  );
  const spares = spareIds.map((id, i) => ({
    id,
    track: "main",
    rounds: rounds(i, true),
    status: "assembled",
    predictedPoints: 8.2,
    dayCheck: null,
  }));
  const dailies = Array.from({ length: days }, (_, d) => ({
    date: addDays(EPOCH, d),
    rounds: rounds(d, false),
    status: "assembled",
    predictedPoints: 8.2,
    dayCheck: null,
    spareOrder: spareIds,
  }));
  return { bank: bankOf(items, dailies, spares), items, dailies, spares };
}

function bankOf(
  items: Map<string, Record<string, unknown>>,
  dailies: Record<string, unknown>[],
  spares: Record<string, unknown>[],
): Bank {
  const records: BankItem[] = [...items.values()].map((item) => ({
    id: String(item.id),
    pool: item.kind === "mystery" ? "mystery" : "encore",
    file: {
      rel: `content/.sealed-plain/${item.kind === "mystery" ? "mysteries" : "encores"}/${String(item.id)}.json`,
      sealed: true,
    },
    item,
  })) as unknown as BankItem[];
  const lists = new Map(
    Object.values(TYPE_OF).map((type) => [
      type,
      { type, version: LIST_VERSION, entities: new Map(), file: { rel: "x" } },
    ]),
  );
  return {
    layout: { kind: "content" },
    items: records,
    itemsById: new Map(records.map((record) => [record.id, record])),
    invalidIds: new Set(),
    lists,
    categories: [...CATEGORY_TABLE],
    register: null,
    packs: [],
    references: emptyReferences(),
    schedules: [
      {
        file: { rel: "content/.sealed-plain/schedule/main.json" },
        month: { track: "main", dailies },
      },
    ],
    spares: spares.map((spare) => ({
      file: { rel: `content/.sealed-plain/spares/${String(spare.id)}.json` },
      spare,
    })),
  } as unknown as Bank;
}

/** Runs CNT-1's schedule rules and the lint's (X10 to X14) together. */
function scheduleFindings(built: Built, patch: Partial<RuleOptions> = {}) {
  const bank = bankOf(built.items, built.dailies, built.spares);
  const notes: string[] = [];
  return [
    ...scheduleRules(bank, options({ launch: true, ...patch }), notes),
    ...poolFindings(bank).filter((f) => /^X1[0-4]$/.test(f.rule)),
  ];
}

const mysteryOf = (built: Built, day: number, slot: number) => {
  const rounds = built.dailies[day]?.rounds as { contentId: string }[];
  const item = built.items.get(rounds[slot - 1]?.contentId ?? "");
  if (!item) throw new Error("no mystery");
  return item;
};

describe("the schedule (CONTENT_GUIDE §10.1 to §10.7)", () => {
  it("AC-CNT-02 100 consecutive Dailies from the epoch and 20 spare sets pass every Daily, week and repeat rule", () => {
    expect(scheduleFindings(scheduleBank())).toEqual([]);
  });

  it("AC-CNT-02 a gap, a short runway of spares or Dailies, and a Daily before the epoch fail", () => {
    const gap = scheduleBank();
    gap.dailies.splice(50, 1);
    expect(rulesOf(scheduleFindings(gap))).toContain("error X20");
    const fewSpares = scheduleBank(100, 19);
    expect(scheduleFindings(fewSpares).map((f) => f.message)).toEqual([
      expect.stringContaining("AC-CNT-02"),
    ]);
    const short = scheduleBank(99);
    expect(scheduleFindings(short).map((f) => f.rule)).toEqual(["X20"]);
    expect(scheduleFindings(short, { launch: false })).toEqual([]);
  });

  it("AC-CNT-02 the week rules: a category on consecutive days, three times in 7, featured in fewer than 4 of 7, missing from 6", () => {
    const consecutive = scheduleBank();
    mysteryOf(consecutive, 11, 1).category = "film"; // day 10 has film too
    const x23 = (built: Built) =>
      only(scheduleFindings(built), "X23").map((f) => f.message);
    expect(x23(consecutive)).toEqual(
      expect.arrayContaining([expect.stringContaining("two consecutive days")]),
    );
    const unfeatured = scheduleBank();
    for (let day = 0; day < 8; day += 1) {
      for (let slot = 1; slot <= 3; slot += 1) {
        const m = mysteryOf(unfeatured, day, slot);
        if (["film", "music", "food"].includes(String(m.category)))
          m.category = ["sport", "lang", "soc"][day % 3];
      }
    }
    expect(x23(unfeatured)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Film & TV, Music or Food & Drink"),
      ]),
    );
  });

  it("AC-CNT-02 an answer repeated within 60 days, an item repeated within a year, and a recent answer as a distractor fail", () => {
    const repeat = scheduleBank();
    mysteryOf(repeat, 40, 1).answer = mysteryOf(repeat, 0, 1).answer;
    expect(rulesOf(scheduleFindings(repeat))).toContain("error X13");
    const reused = scheduleBank();
    const firstRounds = reused.dailies[0]?.rounds as { contentId: string }[];
    (reused.dailies[80]?.rounds as { contentId: string }[])[0] = {
      ...((reused.dailies[80]?.rounds as object[])[0] as object),
      contentId: firstRounds[0]?.contentId ?? "",
    } as { contentId: string };
    expect(rulesOf(scheduleFindings(reused))).toContain("error X13");
    const recent = scheduleBank();
    (mysteryOf(recent, 12, 2).distractors as string[])[0] = String(
      mysteryOf(recent, 10, 1).answer,
    );
    expect(rulesOf(scheduleFindings(recent))).toEqual(["error X24"]);
  });

  it("X22 the spread within a Daily: the encore's category, a counterintuitive item, shared tags and another mystery's answer", () => {
    const sameCategory = scheduleBank();
    const encoreId = (
      sameCategory.dailies[5]?.rounds as { contentId: string }[]
    )[3]?.contentId;
    const enc = sameCategory.items.get(encoreId ?? "");
    if (enc) enc.category = mysteryOf(sameCategory, 5, 2).category;
    expect(rulesOf(scheduleFindings(sameCategory))).toEqual(["error X22"]);
    const plain = scheduleBank();
    mysteryOf(plain, 5, 1).counterintuitive = false;
    expect(rulesOf(scheduleFindings(plain))).toEqual(["error X22"]);
    const tags = scheduleBank();
    mysteryOf(tags, 5, 2).tags = mysteryOf(tags, 5, 1).tags;
    expect(rulesOf(scheduleFindings(tags))).toEqual(["error X22"]);
    const offered = scheduleBank();
    (mysteryOf(offered, 5, 3).distractors as string[])[0] = String(
      mysteryOf(offered, 5, 1).answer,
    );
    expect(rulesOf(scheduleFindings(offered))).toContain("error X22");
  });

  it("X21 assembly windows on predicted points, per slot and per Daily, and an honest predictedPoints", () => {
    const low = scheduleBank();
    (mysteryOf(low, 30, 1).predicted as { solveByClue: number[] }).solveByClue =
      [0.5, 0.6, 0.7, 0.8];
    const messages = only(scheduleFindings(low), "X21").map((f) => f.message);
    expect(messages).toEqual([
      expect.stringContaining("Mystery 1's window"),
      expect.stringContaining("the window is 7.8 to 8.6"),
      expect.stringContaining("not the sum"),
    ]);
    // A published Daily can't be re-assembled, so its windows warn.
    const frozen = scheduleBank();
    (
      mysteryOf(frozen, 30, 1).predicted as { solveByClue: number[] }
    ).solveByClue = [0.5, 0.6, 0.7, 0.8];
    const day = frozen.dailies[30] as Record<string, unknown>;
    day.predictedPoints = 7.4;
    day.status = "published";
    expect(
      only(scheduleFindings(frozen), "X21").map((f) => f.severity),
    ).toEqual(["warn", "warn"]);
  });

  it("AC-CNT-01 a frozen Daily or a listed spare set needs a passing pass D on every item, against the list versions that ship", () => {
    const frozen = scheduleBank();
    (frozen.dailies[3] as Record<string, unknown>).status = "frozen";
    expect(only(scheduleFindings(frozen), "X28")).toHaveLength(4);
    const date = String(frozen.dailies[3]?.date);
    for (const round of frozen.dailies[3]?.rounds as {
      type: string;
      contentId: string;
    }[]) {
      const item = frozen.items.get(round.contentId);
      if (!item) continue;
      const type = round.type === "mystery" ? String(item.answerType) : null;
      (item.verification as { dailyChecks: unknown[] }).dailyChecks = [
        {
          pass: "D",
          verdict: "pass",
          forDate: date,
          listVersions: type === null ? {} : { [type]: LIST_VERSION },
        },
      ];
    }
    expect(only(scheduleFindings(frozen), "X28")).toEqual([]);
    // A pass D against an older list version no longer counts.
    const stale = mysteryOf(frozen, 3, 2);
    (
      stale.verification as { dailyChecks: { listVersions: object }[] }
    ).dailyChecks[0]!.listVersions = {
      [String(stale.answerType)]: "2026-08-01",
    };
    expect(only(scheduleFindings(frozen), "X28")).toHaveLength(1);
    // A spare set named in a spare order needs pass D with forDate null.
    const spare = scheduleBank();
    const spareRounds = spare.spares[0]?.rounds as { contentId: string }[];
    const spareItem = spare.items.get(spareRounds[0]?.contentId ?? "");
    if (spareItem)
      (spareItem.verification as { dailyChecks: unknown[] }).dailyChecks = [];
    expect(rulesOf(scheduleFindings(spare))).toEqual(["error X28"]);
  });

  it("X27 nothing scheduled on or after its reviewBy", () => {
    const built = scheduleBank();
    mysteryOf(built, 20, 3).reviewBy = String(built.dailies[20]?.date);
    expect(rulesOf(scheduleFindings(built))).toEqual(["error X27"]);
  });

  it("X25 every composition has a share layout that fits", () => {
    const built = scheduleBank();
    const rounds = built.dailies[7]?.rounds as Record<string, unknown>[];
    rounds.splice(3, 0, { ...rounds[2] });
    const messages = only(scheduleFindings(built), "X25").map((f) => f.message);
    expect(messages).toEqual([expect.stringContaining("m4e1")]);
  });

  it("X26 the runway alarm sounds below 30 Dailies from today", () => {
    const built = scheduleBank();
    expect(
      only(scheduleFindings(built, { today: addDays(EPOCH, 70) }), "X26"),
    ).toEqual([]);
    expect(
      rulesOf(
        only(scheduleFindings(built, { today: addDays(EPOCH, 71) }), "X26"),
      ),
    ).toEqual(["warn X26"]);
  });

  it("the e2e track: its own Dailies and spares meet the per-day rules, without the main track's coverage and runway", () => {
    const built = scheduleBank(8, 2);
    const e2e = (built: Built) => {
      const bank = bankOf(built.items, built.dailies, built.spares);
      const schedule = bank.schedules[0];
      if (schedule) schedule.month.track = "e2e";
      for (const { spare } of bank.spares) spare.track = "e2e";
      return bank;
    };
    // A clean e2e week: no gap or runway finding although it starts late
    // and holds only 8 days.
    for (const daily of built.dailies)
      daily.date = addDays(String(daily.date), 30);
    expect(
      scheduleRules(e2e(built), options({ track: "e2e", launch: true }), []),
    ).toEqual([]);
    // Break a window (X21) and share a tag within a Daily (X22).
    const first = mysteryOf(built, 3, 1);
    first.predicted = {
      solveByClue: [0.1, 0.2, 0.3, 0.4],
      spread: 0.1,
      estimator: "v0",
    };
    const second = mysteryOf(built, 5, 2);
    second.tags = [...(mysteryOf(built, 5, 1).tags as string[])];
    const found = scheduleRules(e2e(built), options({ track: "e2e" }), []);
    expect([...new Set(rulesOf(found))].sort()).toEqual([
      "error X21",
      "error X22",
    ]);
    // The main track's rules never read the e2e track.
    expect(scheduleRules(e2e(built), options({ launch: false }), [])).toEqual(
      [],
    );
    // The per-day rules run on any list of days in memory, as the
    // scheduler checks a candidate (CNT-3).
    const days = trackDays(e2e(built), "e2e").dailies;
    const candidate = scheduleDayRules(e2e(built), days.slice(3, 4), options());
    expect(candidate.length).toBeGreaterThan(0);
    expect(new Set(rulesOf(candidate))).toEqual(new Set(["error X21"]));
    expect(scheduleDayRules(e2e(built), days.slice(0, 3), options())).toEqual(
      [],
    );
  });

  it("X30 spare orders name main-track spare sets, and every Daily ranks them", () => {
    const unknown = scheduleBank();
    (unknown.dailies[2] as { spareOrder: string[] }).spareOrder = ["spare.99"];
    expect(rulesOf(scheduleFindings(unknown))).toEqual(["error X30"]);
    const missing = scheduleBank();
    delete (missing.dailies[2] as { spareOrder?: string[] }).spareOrder;
    expect(rulesOf(scheduleFindings(missing))).toEqual(["warn X30"]);
  });

  it("spare sets obey every single-Daily rule on their own: X10, X11, X12 and X14", () => {
    const built = scheduleBank();
    const rounds = built.spares[4]?.rounds as Record<string, unknown>[];
    rounds[0] = { ...rounds[0], contentId: "m.geo.9999" };
    const second = built.items.get(String(rounds[1]?.contentId));
    if (second) {
      second.slot = 3;
      second.region = "region:gb";
    }
    const third = built.items.get(String(rounds[2]?.contentId));
    if (third && second) {
      third.category = second.category;
      third.answerType = second.answerType;
    }
    expect(rulesOf(scheduleFindings(built)).sort()).toEqual(
      expect.arrayContaining([
        "error X10",
        "error X11",
        "error X12",
        "error X14",
      ]),
    );
  });
});

describe("comparisons and the lint", () => {
  it("leave the separation guard to C17, so CNT-1 adds nothing on a clean pair", async () => {
    const bank = await loadFx(
      fxFiles({ "practice/geography/fx.p.geo.0103.json": fxComparison() }),
    );
    expect(itemRules(bank)).toEqual([]);
  });
});
