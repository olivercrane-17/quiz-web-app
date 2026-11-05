// @vitest-environment node
/**
 * CNT-2b's retire (src/content/pipeline/retire.ts and
 * `content:batch -- retire`): one active item of any pool moves to
 * `retired`, keeps its id, checks and history, and leaves every pool count,
 * pack, release row in play and X19's counts; the register follows; the
 * schedule guard refuses an item a Daily still to close names unless
 * --allow-frozen; draft, checking, cut and retired items are refused; and
 * for a sealed item nothing printed says more than ids and counts.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { BatchRegisterSchema } from "../schema/batches.ts";
import type { AnyItem } from "../schema/items.ts";
import {
  CHECKER_A,
  EDITOR,
  REPO_ROOT,
  WRITER,
  COUNTRY_NAMES,
  fxCountryList,
  fxFiles,
  fxMystery,
  fxPack,
  fxRecord,
  fxRegister,
  fxRoomQuestion,
  itemOf,
  loadContentTree,
  loadFx,
  removeTempDirs,
  tempDir,
  type FxFiles,
} from "./__fixtures__/builders.ts";
import { loadBank, type Bank } from "./bank.ts";
import { decideOne } from "./decisions.ts";
import { batchForItem, parseItemId } from "./ids.ts";
import { cloneJson } from "./json.ts";
import { lintBank } from "./lint/index.ts";
import { poolFindings } from "./lint/pool-rules.ts";
import { mergeRecord } from "./records.ts";
import { issueIds } from "./register.ts";
import {
  applyRetirement,
  namesSealedContent,
  planRetirement,
  type RetireRequest,
} from "./retire.ts";
import { dailyHasClosed } from "./schedule-locks.ts";
import { computeStats } from "./stats.ts";
import { saveItems } from "./store.ts";
import { buildRelease } from "../../../scripts/content/release.ts";
import { loadBuildInputs } from "../../../scripts/content/lib/inputs.ts";
import { buildOutputs } from "../../../scripts/content/lib/outputs.ts";
import { poolRules } from "../../../scripts/content/lib/rules.ts";

afterAll(removeTempDirs);

const RETIRER = "ed-fx-retirer";
const AT = "2026-11-05T10:00:00Z";
const DECIDED_AT = "2026-11-03T09:00:00Z";
const PREDICTED = {
  practice: { p: 0.7, spread: 0.3, estimator: "v0" },
  room: { p: 0.8, spread: 0.3, estimator: "v0" },
  mystery: {
    solveByClue: [0.5, 0.8, 0.92, 0.98],
    spread: 0.3,
    estimator: "v0",
  },
  encore: { pClose: 0.3, pExact: 0.02, spread: 0.4, estimator: "v0" },
} as const;

const PACK = "room-packs/fx-party.json";
const ROOM = "fx.r.fx-party.01";
const fifteen = () =>
  fxPack(Array.from({ length: 15 }, (_, i) => fxRoomQuestion(i + 1)));

/**
 * A fixture bank whose `accept` items went through both checks and the
 * editor's accept (content:record, content:estimate and content:decide's
 * own code), and whose `cut` items were cut.
 */
async function decidedBank(
  accept: readonly string[],
  options: { files?: FxFiles; cut?: readonly string[] } = {},
): Promise<Bank> {
  const bank = await loadFx(options.files ?? fxFiles({ [PACK]: fifteen() }));
  const checked = new Map<string, AnyItem>();
  for (const id of [...accept, ...(options.cut ?? [])]) {
    const record = itemOf(bank, id);
    let item = record.item;
    for (const pass of ["A", "B"] as const)
      item = mergeRecord(item, fxRecord(bank, record, pass), pass, false).item;
    checked.set(id, {
      ...item,
      predicted: PREDICTED[record.pool],
      status: "checking",
    } as AnyItem);
  }
  await saveItems(bank, checked);
  const decided = new Map<string, AnyItem>();
  for (const id of [...accept, ...(options.cut ?? [])]) {
    const record = itemOf(bank, id);
    const parsed = parseItemId(id);
    const batch =
      parsed && bank.register ? batchForItem(bank.register, parsed) : null;
    if (!batch) throw new Error(`${id} has no batch`);
    const { outcome, item } = decideOne(
      bank,
      batch,
      record,
      {
        itemId: id,
        editor: EDITOR,
        decision: accept.includes(id) ? "accept" : "cut",
        reason: accept.includes(id) ? "Both checks pass." : "Not needed.",
        decidedAt: DECIDED_AT,
        // The fixture pack's questions share one template, so C22 flags
        // them against each other: the editor's call, as content:decide
        // takes it.
        dedupe: "related_ok",
      },
      { now: DECIDED_AT },
    );
    if (!item) throw new Error(`${id}: ${outcome.errors.join("; ")}`);
    decided.set(id, item);
  }
  await saveItems(bank, decided);
  return bank;
}

const request = (
  itemId: string,
  patch: Partial<RetireRequest> = {},
): RetireRequest => ({
  itemId,
  editor: RETIRER,
  reason: "It shares its fact with a Daily item.",
  kind: "cross_pool",
  at: AT,
  today: "2026-11-05",
  allowFrozen: false,
  ...patch,
});

async function refusal(
  bank: Bank,
  itemId: string,
  patch: Partial<RetireRequest> = {},
): Promise<string> {
  try {
    await planRetirement(bank, request(itemId, patch));
  } catch (error) {
    return (error as Error).message;
  }
  return "accepted";
}

async function retire(
  bank: Bank,
  itemId: string,
  patch: Partial<RetireRequest> = {},
) {
  const plan = await planRetirement(bank, request(itemId, patch));
  await applyRetirement(bank, plan);
  return plan;
}

/** The bank as the next command would load it. */
const reload = (bank: Bank) => loadBank(bank.layout);

describe("retire (CNT-2b)", () => {
  it(
    "retires an active item of every pool, keeping its id, checks and history and recording why",
    { timeout: 30_000 },
    async () => {
      const ids = ["fx.p.geo.0101", "fx.m.geo.0101", "fx.e.0101", ROOM];
      const bank = await decidedBank(ids);
      for (const id of ids) {
        const before = cloneJson(itemOf(bank, id).item);
        expect(before.status, id).toBe("active");
        const plan = await retire(bank, id);
        expect(plan).toMatchObject({ itemId: id, sealed: id !== ids[0] });
        const after = itemOf(await reload(bank), id).item;
        expect(after.status, id).toBe("retired");
        expect(after.retired).toEqual({
          at: AT,
          by: RETIRER,
          kind: "cross_pool",
          reason: "It shares its fact with a Daily item.",
        });
        // Everything else is as it was: the id, the checks, the history.
        const { status: _s, retired: _r, ...rest } = after;
        const { status: _b, ...was } = before;
        expect(rest).toEqual(was);
      }
      // The record sits right after the status in the file, and the room
      // question stays in its pack, in place.
      const practice = JSON.parse(
        readFileSync(itemOf(bank, ids[0] ?? "").file.abs, "utf8"),
      ) as Record<string, unknown>;
      const keys = Object.keys(practice);
      expect(keys[keys.indexOf("status") + 1]).toBe("retired");
      const pack = JSON.parse(
        readFileSync(itemOf(bank, ROOM).file.abs, "utf8"),
      ) as { questions: { id: string; status: string }[] };
      expect(pack.questions).toHaveLength(15);
      expect(pack.questions[0]).toMatchObject({ id: ROOM, status: "retired" });
    },
  );

  it("refuses draft, checking, cut and retired items, and points draft and checking items to content:decide", async () => {
    const bank = await decidedBank(["fx.p.geo.0101"], {
      cut: ["fx.p.geo.0103"],
    });
    const record = itemOf(bank, "fx.e.0101");
    await saveItems(
      bank,
      new Map([
        [
          "fx.e.0101",
          {
            ...mergeRecord(record.item, fxRecord(bank, record, "A"), "A", false)
              .item,
            predicted: PREDICTED.encore,
            status: "checking",
          } as AnyItem,
        ],
      ]),
    );
    expect(await refusal(bank, "fx.p.geo.0102")).toBe(
      "fx.p.geo.0102 is draft; retire takes active items only, and content:decide covers draft and checking items (cut, or rewrite and re-check)",
    );
    expect(await refusal(bank, "fx.e.0101")).toMatch(
      /^fx\.e\.0101 is checking; retire takes active items only, and content:decide covers/,
    );
    expect(await refusal(bank, "fx.p.geo.0103")).toBe(
      "fx.p.geo.0103 is cut already; its id is never reused",
    );
    await retire(bank, "fx.p.geo.0101");
    expect(await refusal(await reload(bank), "fx.p.geo.0101")).toBe(
      `fx.p.geo.0101 is retired already, by ${RETIRER} at ${AT}`,
    );
    expect(await refusal(bank, "fx.p.geo.0199")).toBe(
      "fx.p.geo.0199 is not an item of the bank",
    );
  });

  it("takes only an editor who did not write, check or estimate the item", async () => {
    const bank = await decidedBank(["fx.p.geo.0101"]);
    expect(await refusal(bank, "fx.p.geo.0101", { editor: "w-fx-new" })).toBe(
      "--editor is an editor's agent id (ed-<run id>), not w-fx-new",
    );
    expect(
      await refusal(bank, "fx.p.geo.0101", { editor: `ed-${WRITER.slice(2)}` }),
    ).toBe(
      "ed-fx-writer wrote fx.p.geo.0101; one run holds one role on an item, so another editor decides (CONTENT_GUIDE §0.2)",
    );
    expect(
      await refusal(bank, "fx.p.geo.0101", {
        editor: `ed-${CHECKER_A.slice(3)}`,
      }),
    ).toMatch(/^ed-fx-alpha checked fx\.p\.geo\.0101;/);
    const record = itemOf(bank, "fx.p.geo.0101");
    const estimated = cloneJson(record.item);
    if (estimated.verification)
      estimated.verification.estimates = [
        ...(estimated.verification.estimates ?? []),
        { by: "es-fx-guess", at: AT },
      ];
    await saveItems(bank, new Map([[record.id, estimated]]));
    expect(
      await refusal(bank, "fx.p.geo.0101", { editor: "ed-FX-GUESS" }),
    ).toMatch(/^ed-FX-GUESS estimated fx\.p\.geo\.0101;/);
    // The editor who accepted it may retire it.
    expect(await refusal(bank, "fx.p.geo.0101", { editor: EDITOR })).toBe(
      "accepted",
    );
  });

  it("needs a reason and a known kind, and keeps anything sealed out of a public item's reason", async () => {
    const bank = await decidedBank(["fx.p.geo.0101", "fx.m.geo.0101"]);
    expect(await refusal(bank, "fx.p.geo.0101", { reason: "  " })).toBe(
      "--reason says why the item leaves play",
    );
    expect(
      await refusal(bank, "fx.p.geo.0101", {
        kind: "duplicate" as RetireRequest["kind"],
      }),
    ).toBe("--kind is cross_pool, recheck, other");
    for (const reason of [
      "It shares a fact with m.geo.0101.",
      "Same flag as fx.m.geo.0101's first clue.",
      "Same value as e.0102.",
      "Overlaps r.all-sorts.04.",
      "Overlaps a question of batch m.geo.b01.",
      "Its answer waits on lr.m.geo.b01.03.",
    ]) {
      expect(namesSealedContent(reason), reason).toBe(true);
      expect(await refusal(bank, "fx.p.geo.0101", { reason })).toMatch(
        /^the reason names a sealed item, batch or list request, and fx\.p\.geo\.0101's file is public/,
      );
    }
    for (const reason of [
      "Shares its fact with a Daily item.",
      "Replaced by p.geo.0144 after a key change (e.g. 2026).",
    ])
      expect(namesSealedContent(reason), reason).toBe(false);
    // A sealed item's file is sealed, so its reason may name what it likes.
    expect(
      await refusal(bank, "fx.m.geo.0101", {
        reason: "Its clue 1 states p.geo.0101's fact; m.geo.0102 replaces it.",
      }),
    ).toBe("accepted");
  });

  it("recounts a closed batch, which stays closed: accepted drops and retired rises; a batch still open is counted at close", async () => {
    const bank = await decidedBank(["fx.p.geo.0101", "fx.p.geo.0103"], {
      cut: ["fx.p.geo.0102"],
    });
    // Close p.geo.b01 as content:batch -- close counts it.
    const register = bank.register;
    const batch = register?.batches.find((b) => b.batchId === "p.geo.b01");
    if (!register || !batch) throw new Error("no register");
    Object.assign(batch, { status: "closed", accepted: 2, cut: 1 });
    writeFileSync(
      bank.layout.registerFile,
      JSON.stringify(BatchRegisterSchema.parse(register)),
    );
    const fresh = await reload(bank);
    const plan = await retire(fresh, "fx.p.geo.0101");
    expect(plan.register).toEqual({
      before: { accepted: 2, cut: 1, retired: 0 },
      after: { accepted: 1, cut: 1, retired: 1 },
    });
    const entry = (b: Bank) =>
      b.register?.batches.find((x) => x.batchId === "p.geo.b01");
    expect(entry(await reload(fresh))).toMatchObject({
      status: "closed",
      accepted: 1,
      cut: 1,
      retired: 1,
    });
    await retire(await reload(fresh), "fx.p.geo.0103");
    expect(entry(await reload(fresh))).toMatchObject({
      status: "closed",
      accepted: 0,
      cut: 1,
      retired: 2,
    });
    // m.geo.b01 is still open: nothing is counted until it closes.
    const open = await decidedBank(["fx.m.geo.0101"]);
    const openPlan = await retire(open, "fx.m.geo.0101");
    expect(openPlan).toMatchObject({
      batchId: "m.geo.b01",
      batchStatus: "open",
      register: null,
    });
    expect(
      (await reload(open)).register?.batches.find(
        (b) => b.batchId === "m.geo.b01",
      ),
    ).toMatchObject({ status: "open", accepted: null, cut: null });
  });

  it("never reuses the id: the register issues past it, and the file stays", async () => {
    const bank = await decidedBank(["fx.p.geo.0101"]);
    await retire(bank, "fx.p.geo.0101");
    const fresh = await reload(bank);
    expect(itemOf(fresh, "fx.p.geo.0101").item.status).toBe("retired");
    const register = fresh.register;
    if (!register) throw new Error("no register");
    // lastSequence is 20 in the fixture register: the next id is 21.
    expect(issueIds(register, "p.geo.b01", WRITER, 1)).toEqual(["p.geo.0121"]);
  });
});

// ---------------------------------------------------------------------------
// The schedule guard and X10
// ---------------------------------------------------------------------------

const MYSTERY = "fx.m.geo.0101";

const daily = (
  date: string,
  status: "assembled" | "frozen" | "published" = "assembled",
) => ({
  date,
  rounds: [{ type: "mystery", difficulty: "easy", contentId: MYSTERY }],
  status,
  predictedPoints: 3.4,
  dayCheck: null,
});

const month = (
  dailies: unknown[],
  track: "main" | "e2e" = "main",
): FxFiles => ({ "schedule/2026-12.json": { track, dailies } });

describe("the schedule guard (CNT-2b)", () => {
  it("treats a Daily as closed only two days after its date, as the database's daily_closes_at does", () => {
    expect(dailyHasClosed("2026-12-01", "2026-12-03")).toBe(true);
    expect(dailyHasClosed("2026-12-01", "2026-12-02")).toBe(false);
    expect(dailyHasClosed("2026-12-01", "2026-12-01")).toBe(false);
    expect(dailyHasClosed("2026-12-01", "2026-11-05")).toBe(false);
  });

  it("refuses an item a Daily still to close names, without --allow-frozen", async () => {
    for (const [status, why] of [
      ["assembled", "1 main-track Daily(ies) that have not closed"],
      ["frozen", "1 main-track Daily(ies) that have not closed (1 frozen)"],
    ] as const) {
      const bank = await decidedBank([MYSTERY], {
        files: fxFiles(month([daily("2026-12-01", status)])),
      });
      for (const today of ["2026-11-05", "2026-12-01", "2026-12-02"])
        expect(await refusal(bank, MYSTERY, { today })).toBe(
          `${MYSTERY} is on ${why}. Pass --allow-frozen for a correction, as content:release takes it for frozen Dailies, and have the scheduler replace it there before the next release`,
        );
      const plan = await planRetirement(
        bank,
        request(MYSTERY, { allowFrozen: true }),
      );
      expect(plan.locks).toMatchObject({
        open: 1,
        frozen: status === "frozen" ? 1 : 0,
        played: 0,
      });
    }
  });

  it("retires an item that only played on Dailies that have closed, without --allow-frozen", async () => {
    const bank = await decidedBank([MYSTERY], {
      files: fxFiles(month([daily("2026-12-01", "published")])),
    });
    const plan = await retire(bank, MYSTERY, { today: "2026-12-03" });
    expect(plan.locks).toMatchObject({ open: 0, played: 1 });
  });

  it("refuses an item a spare set or a challenge pack names, and leaves the e2e track unlocked", async () => {
    const rounds = [
      { type: "mystery", difficulty: "easy", contentId: MYSTERY },
    ];
    const spare = await decidedBank([MYSTERY], {
      files: fxFiles({
        "spares/spare.01.json": {
          id: "spare.01",
          track: "main",
          rounds,
          status: "assembled",
          predictedPoints: 3.4,
          dayCheck: null,
        },
      }),
    });
    expect(await refusal(spare, MYSTERY)).toMatch(
      /^fx\.m\.geo\.0101 is on 1 spare set\(s\)\. Pass --allow-frozen/,
    );
    const pack = await decidedBank([MYSTERY], {
      files: fxFiles({
        "challenge-packs/fx-week-one.json": {
          id: "fx-week-one",
          track: "main",
          title: "Week one",
          theme: "The first week's Dailies",
          rounds,
        },
      }),
    });
    expect(await refusal(pack, MYSTERY)).toMatch(
      /^fx\.m\.geo\.0101 is on 1 challenge pack\(s\)\. Pass --allow-frozen/,
    );
    const e2e = await decidedBank([MYSTERY], {
      files: fxFiles(month([daily("2026-12-01", "frozen")], "e2e")),
    });
    expect(await refusal(e2e, MYSTERY)).toBe("accepted");
  });

  it("X10 lets an item retired after it played stay on the Dailies that have closed, and fails it on one still to close", async () => {
    const bank = await decidedBank([MYSTERY], {
      files: fxFiles(
        month([daily("2026-12-01", "published"), daily("2026-12-20")]),
      ),
    });
    await retire(bank, MYSTERY, { today: "2026-12-03", allowFrozen: true });
    const fresh = await reload(bank);
    const x10 = (today: string) =>
      poolFindings(fresh, today)
        .filter((f) => f.rule === "X10")
        .map((f) => f.message);
    // Before 1 December closes both Dailies are still to come.
    expect(x10("2026-11-30")).toEqual([
      `2026-12-01: round ${MYSTERY} is retired, not active (§0.2)`,
      `2026-12-20: round ${MYSTERY} is retired, not active (§0.2)`,
    ]);
    // Once it has closed, only the Daily still to come fails.
    expect(x10("2026-12-03")).toEqual([
      `2026-12-20: round ${MYSTERY} is retired, not active (§0.2)`,
    ]);
    // The lint reads the same date.
    expect(
      lintBank(fresh, { today: "2026-12-03", dedupe: false })
        .filter((f) => f.rule === "X10")
        .map((f) => f.message),
    ).toEqual([`2026-12-20: round ${MYSTERY} is retired, not active (§0.2)`]);
  });
});

// ---------------------------------------------------------------------------
// Pool counts, packs and the release
// ---------------------------------------------------------------------------

describe("a retired item leaves the pool (CNT-2b)", () => {
  /** n active geography items cloned from a real accepted one. */
  function pool(n: number): FxFiles {
    const template = JSON.parse(
      readFileSync(
        join(REPO_ROOT, "content/practice/geography/p.geo.0101.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const files: FxFiles = {};
    for (let i = 0; i < n; i += 1) {
      const id = `p.geo.${String(1 + Math.floor(i / 99)).padStart(2, "0")}${String(1 + (i % 99)).padStart(2, "0")}`;
      files[`practice/geography/${id}.json`] = { ...template, id };
    }
    return files;
  }
  const geo = (bank: Bank) =>
    poolRules(bank, {
      today: "2026-11-05",
      launch: false,
      epoch: "2026-09-21",
      compositions: null,
      histories: null,
    })
      .filter(
        (f) => f.rule === "X19" && f.file === "content/practice/geography",
      )
      .map((f) => f.message);

  it(
    "AC-CNT-04 a retired practice item leaves X19's counts and every pool count",
    { timeout: 30_000 },
    async () => {
      const bank = await loadContentTree(pool(100));
      expect(geo(bank)).toEqual([]);
      await retire(bank, "p.geo.0101", { editor: "ed-cnt2b-retire-test" });
      const fresh = await reload(bank);
      expect(geo(fresh)).toEqual([
        expect.stringContaining("geo has 99 active practice items"),
      ]);
      const stats = computeStats(fresh, "2026-11-05");
      expect(stats.pools.practice.byStatus).toEqual({ active: 99, retired: 1 });
    },
  );

  it(
    "content:build ships no retired practice item, and the release loads a retired sealed item as retired",
    { timeout: 60_000 },
    async () => {
      const content = await loadContentTree(pool(3));
      await retire(content, "p.geo.0102", { editor: "ed-cnt2b-retire-test" });
      const built = await buildOutputs({
        ...(await loadBuildInputs(REPO_ROOT, {
          bank: await reload(content),
          fixtures: null,
        })),
        previousPracticeSql: null,
      });
      const pack = built.outputs.find((output) =>
        output.path.startsWith("public/content/packs/geography."),
      );
      const items = (
        JSON.parse(pack?.content ?? "{}") as { items?: { id: string }[] }
      ).items;
      expect(items?.map((item) => item.id)).toEqual([
        "p.geo.0101",
        "p.geo.0103",
      ]);

      // The fixture release plays drafts as active, and each needs its
      // estimate to project, so the encore is accepted too.
      const sealed = await decidedBank([MYSTERY, "fx.e.0101"]);
      await retire(sealed, MYSTERY);
      const { release, problems } = buildRelease({
        bank: await reload(sealed),
        fixtures: true,
        epoch: "2026-09-21",
        compositions: null,
        challengePacks: [],
      });
      expect(problems).toEqual([]);
      expect(release?.mysteries.find((row) => row.id === MYSTERY)?.status).toBe(
        "retired",
      );
    },
  );
});

// ---------------------------------------------------------------------------
// The CLI
// ---------------------------------------------------------------------------

function cli(cwd: string, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      join(REPO_ROOT, "scripts/content/batch.ts"),
      ...args,
    ],
    {
      cwd,
      encoding: "utf8",
      // Never the machine's own key: HOME is a throwaway folder.
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: cwd },
    },
  );
  return { code: result.status, out: result.stdout, err: result.stderr };
}

describe("content:batch -- retire (CNT-2b)", () => {
  it(
    "retires through the CLI, recounts a closed batch, and close counts retired items afterwards",
    { timeout: 60_000 },
    async () => {
      const bank = await decidedBank(["fx.p.geo.0101", "fx.p.geo.0103"], {
        cut: ["fx.p.geo.0102"],
      });
      const root = bank.layout.root;
      const fixture = (...args: string[]) =>
        cli(REPO_ROOT, ...args, "--root", root, "--fixtures");
      expect(fixture("close", "--batch", "p.geo.b01").out).toContain(
        "p.geo.b01 closed: 2 accepted (target 10), 1 cut.",
      );
      const args = [
        "retire",
        "--item",
        "fx.p.geo.0101",
        "--editor",
        RETIRER,
        "--reason",
        "Shares its fact with a Daily item.",
        "--kind",
        "cross_pool",
      ];
      const done = fixture(...args);
      expect(done.code, done.err).toBe(0);
      for (const line of [
        `fx.p.geo.0101 retired (cross_pool) by ${RETIRER}: it leaves every pack, pool count and release, and X29 no longer reads it.`,
        "p.geo.b01 stays closed: accepted 2 -> 1, retired 0 -> 1.",
        "Next: npm run content:build",
      ])
        expect(done.out).toContain(line);
      expect(done.out).not.toContain("Shares its fact");
      // Again: refused, exit 1, nothing changes.
      const again = fixture(...args);
      expect(again.code).toBe(1);
      expect(again.err).toContain("fx.p.geo.0101 is retired already");
      // Status shows it; close counts it.
      const status = JSON.parse(
        fixture("status", "--batch", "p.geo.b01", "--json").out,
      ) as Record<string, unknown>;
      expect(status).toMatchObject({ active: 1, cut: 1, retired: 1 });
      expect(fixture("close", "--batch", "p.geo.b01").out).toContain(
        "p.geo.b01 closed: 1 accepted (target 10), 1 cut, 1 retired.",
      );
      // A --batch that is not the item's own retires nothing.
      const wrong = fixture(
        "retire",
        "--item",
        "fx.p.geo.0103",
        "--editor",
        RETIRER,
        "--reason",
        "Replaced by a new item.",
        "--batch",
        "p.geo.b02",
      );
      expect(wrong.code).toBe(1);
      expect(wrong.err).toContain(
        "fx.p.geo.0103 belongs to p.geo.b01, not p.geo.b02; nothing was retired",
      );
      expect(itemOf(await reload(bank), "fx.p.geo.0103").item.status).toBe(
        "active",
      );
    },
  );

  it("refuses bad options with exit code 2", async () => {
    const bank = await decidedBank(["fx.p.geo.0101"]);
    const root = bank.layout.root;
    const fixture = (...args: string[]) =>
      cli(REPO_ROOT, ...args, "--root", root, "--fixtures");
    const base = [
      "retire",
      "--item",
      "fx.p.geo.0101",
      "--editor",
      RETIRER,
      "--reason",
      "Why.",
    ];
    for (const [args, message] of [
      [["retire", "--item", "fx.p.geo.0101"], "--editor is required"],
      [[...base, "--kind", "duplicate"], "--kind for retire is cross_pool"],
      [[...base, "--today", "soon"], "--today is a date"],
      [[...base, "--note", "x"], "retire does not take --note"],
      [
        ["close", "--batch", "p.geo.b01", "--item", "x"],
        "close does not take --item",
      ],
    ] as const) {
      const result = fixture(...args);
      expect(result.code, args.join(" ")).toBe(2);
      expect(result.err).toContain(message);
    }
  });

  it(
    "retires a sealed item in the plaintext workspace and prints only ids and counts",
    { timeout: 60_000 },
    async () => {
      // An accepted mystery, as content:decide leaves it in the workspace.
      const accepted = await decidedBank([MYSTERY]);
      const item = itemOf(accepted, MYSTERY).item;
      const repo = tempDir("qz-retire-sealed-");
      writeFileSync(join(repo, "package.json"), "{}\n");
      for (const path of [
        "content/categories.json",
        "content/reference",
        "content/datasets/manifest.json",
      ])
        cpSync(join(REPO_ROOT, path), join(repo, path), { recursive: true });
      spawnSync("git", ["init", "-q"], { cwd: repo });
      writeFileSync(
        join(repo, ".gitignore"),
        "content/.sealed-plain/\n.cache/\n",
      );
      const files: FxFiles = {
        "batches.json": fxRegister(),
        "answer-lists/country.json": fxCountryList(),
        [`.sealed-plain/mysteries/${MYSTERY}.json`]: item,
      };
      for (const [path, value] of Object.entries(files)) {
        const target = join(repo, "content", path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
      }
      const reason = "Clue 1 restates the flag a practice item asks about.";
      const run = cli(
        repo,
        "retire",
        "--item",
        MYSTERY,
        "--editor",
        RETIRER,
        "--reason",
        reason,
        "--kind",
        "recheck",
      );
      expect(run.code, run.err).toBe(0);
      expect(run.out).toContain(`${MYSTERY} retired (recheck) by ${RETIRER}`);
      expect(run.out).toContain(
        "m.geo.b01 is open; its counts are taken when it closes.",
      );
      expect(run.out).toContain("run npm run content:seal");
      // Ids and counts only: no clue, name, alias, number or the reason.
      const output = `${run.out}\n${run.err}`;
      for (const clue of fxMystery().clues) expect(output).not.toContain(clue);
      for (const name of [...COUNTRY_NAMES, "Arven Republic", "heron"])
        expect(output.toLowerCase()).not.toContain(name.toLowerCase());
      expect(output).not.toContain(reason);
      const stored = JSON.parse(
        readFileSync(
          join(repo, "content/.sealed-plain/mysteries", `${MYSTERY}.json`),
          "utf8",
        ),
      ) as AnyItem;
      expect(stored.status).toBe("retired");
      expect(stored.retired).toMatchObject({ kind: "recheck", reason });
      // A refused retirement prints the id and the status only.
      const refused = cli(
        repo,
        "retire",
        "--item",
        MYSTERY,
        "--editor",
        RETIRER,
        "--reason",
        reason,
      );
      expect(refused.code).toBe(1);
      expect(refused.err.trim()).toBe(
        `content:batch: ${MYSTERY} is retired already, by ${RETIRER} at ${String(stored.retired?.at)}`,
      );
    },
  );
});
