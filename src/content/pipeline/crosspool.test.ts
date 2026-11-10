// @vitest-environment node
/**
 * CNT-2b's cross-pool judgments (src/content/pipeline/crosspool.ts): an
 * editor's related_ok on one pair the cross-pool check flags (X29,
 * AC-CNT-06, CONTENT_GUIDE §10.5), stored on the sealed Daily item with a
 * hash of both items' packet fields. X29 skips the pair while the hash
 * holds, reports it again once either item changes, and never reads a
 * retired item. The CLI half drives `content:dedupe -- --cross-pool-ok` in a
 * throwaway repository and holds it to the output rule of ARCHITECTURE
 * §5.4: no line it prints joins the public item to the sealed one.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { AnyItem } from "../schema/items.ts";
import type { CrossPoolJudgment } from "../schema/verification.ts";
import {
  CHECKER_A,
  EDITOR,
  REPO_ROOT,
  WRITER,
  fxCountryList,
  fxEncore,
  fxMc,
  fxMystery,
  fxPack,
  fxRecord,
  fxRegister,
  fxRoomQuestion,
  fxTf,
  itemOf,
  loadContentTree,
  removeTempDirs,
  tempDir,
  type FxFiles,
} from "./__fixtures__/builders.ts";
import type { Bank } from "./bank.ts";
import {
  crossPoolPairSha256,
  crossPoolPairs,
  judgmentState,
  planJudgment,
  type JudgmentRequest,
} from "./crosspool.ts";
import { cloneJson } from "./json.ts";
import { mergeRecord } from "./records.ts";
import { saveItems } from "./store.ts";
import { crossPoolRules } from "../../../scripts/content/lib/rules.ts";

afterAll(removeTempDirs);

const MYSTERY = "fx.m.geo.0101";
const TWIN = "fx.p.geo.0101";
const TWIN_TF = "fx.p.geo.0102";
const AT = "2026-11-05T10:00:00Z";

/** A practice item that states the mystery's flag clue, keyed to its answer. */
const twin = (patch: Record<string, unknown> = {}) =>
  fxMc({
    id: TWIN,
    stem: "Which fixture country flies a silver heron above three blue waves?",
    answer: "Arvenna",
    wrong: ["Belloria", "Cassova", "Dravenor"],
    ...patch,
  });

/** A second practice item on the same flag, as a true/false statement. */
const twinTf = () =>
  fxTf({
    id: TWIN_TF,
    stem: "The fixture country Arvenna flies a silver heron above three blue waves.",
    answer: true,
    tfKind: "surprising_truth",
  });

/** A room question on the same flag. */
const roomTwin = () =>
  fxRoomQuestion(1, {
    stem: "Which fixture country flies a silver heron above three waves?",
    answer: "Arvenna",
    wrong: ["Belloria", "Cassova", "Dravenor"],
  });

/** A content tree (sealed items in the workspace), so X29 runs. */
function tree(extra: FxFiles = {}): Promise<Bank> {
  return loadContentTree({
    "batches.json": fxRegister(),
    "answer-lists/country.json": fxCountryList(),
    [`.sealed-plain/mysteries/${MYSTERY}.json`]: fxMystery(),
    [`practice/geography/${TWIN}.json`]: twin(),
    ...extra,
  });
}

const OPTIONS = {
  today: "2026-11-05",
  launch: false,
  epoch: "2026-09-21",
  compositions: null,
  histories: null,
};

const x29 = (bank: Bank) =>
  crossPoolRules(bank, OPTIONS).map(
    (finding) => `${finding.itemId ?? finding.file} ${finding.rule}`,
  );

const request = (patch: Partial<JudgmentRequest> = {}): JudgmentRequest => ({
  dailyId: MYSTERY,
  itemId: TWIN,
  editor: EDITOR,
  reason: "Both name the country; the mystery's clue is about its flag only.",
  at: AT,
  ...patch,
});

/** Records a judgment as content:dedupe -- --cross-pool-ok does. */
async function judge(bank: Bank, patch: Partial<JudgmentRequest> = {}) {
  const plan = planJudgment(bank, request(patch));
  await saveItems(bank, new Map([[plan.dailyId, plan.item]]), {
    skipGuard: true,
  });
  return plan;
}

/** Rewrites one item in place (a hand edit in the workspace or the tree). */
async function edit(bank: Bank, id: string, patch: Record<string, unknown>) {
  const record = itemOf(bank, id);
  await saveItems(
    bank,
    new Map([[id, { ...cloneJson(record.item), ...patch } as AnyItem]]),
    { skipGuard: true },
  );
}

const judgmentsOf = (bank: Bank, id = MYSTERY): CrossPoolJudgment[] =>
  itemOf(bank, id).item.verification?.crossPool ?? [];

describe("cross-pool pairs and their hash (CNT-2b)", () => {
  it(
    "hashes both items' packet fields: either side's stem, key or claims change it, and tags, notes or the verification record do not",
    { timeout: 60_000 },
    async () => {
      const bank = await tree();
      const daily = itemOf(bank, MYSTERY);
      const other = itemOf(bank, TWIN);
      const hash = crossPoolPairSha256(daily, other);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(crossPoolPairSha256(daily, other)).toBe(hash);
      const variant = (
        side: "daily" | "other",
        patch: Record<string, unknown>,
      ) => {
        const record = side === "daily" ? daily : other;
        const changed = {
          id: record.id,
          item: { ...record.item, ...patch } as AnyItem,
        };
        return side === "daily"
          ? crossPoolPairSha256(changed, other)
          : crossPoolPairSha256(daily, changed);
      };
      // What a packet shows lapses the pair...
      expect(variant("other", { stem: `${twin().stem} ` })).not.toBe(hash);
      expect(variant("other", { answer: "Belloria" })).not.toBe(hash);
      expect(
        variant("daily", {
          clues: [...fxMystery().clues.slice(0, 3), "A reworded fourth clue."],
        }),
      ).not.toBe(hash);
      expect(
        variant("daily", {
          claims: [
            ...fxMystery().claims,
            {
              id: "c8",
              role: "explanation",
              risk: "standard",
              text: "A new claim.",
            },
          ],
        }),
      ).not.toBe(hash);
      // ...and nothing else does.
      expect(variant("other", { tags: ["fixtures", "flags"] })).toBe(hash);
      expect(variant("daily", { writerNotes: "Another note." })).toBe(hash);
      expect(
        variant("daily", { verification: { checks: [], crossPool: [] } }),
      ).toBe(hash);
      // The order of the pair is fixed: the Daily item first.
      expect(crossPoolPairSha256(other, daily)).not.toBe(hash);
    },
  );

  it(
    "flags every practice and room item at or above the threshold, not only the nearest",
    { timeout: 60_000 },
    async () => {
      const bank = await tree({
        [`practice/geography/${TWIN_TF}.json`]: twinTf(),
        ".sealed-plain/room-packs/fx-party.json": fxPack([roomTwin()]),
        // An unrelated practice item stays out.
        "practice/geography/fx.p.geo.0103.json": fxMc({ id: "fx.p.geo.0103" }),
      });
      const pairs = crossPoolPairs(bank);
      expect(
        pairs.map((pair) => `${pair.dailyId} ${pair.otherId} ${pair.state}`),
      ).toEqual(
        expect.arrayContaining([
          `${MYSTERY} ${TWIN} none`,
          `${MYSTERY} ${TWIN_TF} none`,
          `${MYSTERY} fx.r.fx-party.01 none`,
        ]),
      );
      expect(pairs.map((pair) => pair.otherId)).not.toContain("fx.p.geo.0103");
      expect(pairs.every((pair) => pair.score >= 0.5)).toBe(true);
    },
  );
});

describe("X29 with the editor's judgments (CNT-2b)", () => {
  it(
    "AC-CNT-06 a related_ok on the sealed Daily item clears its pair, and only that pair",
    { timeout: 60_000 },
    async () => {
      const bank = await tree({
        [`practice/geography/${TWIN_TF}.json`]: twinTf(),
      });
      expect(x29(bank)).toEqual([`${MYSTERY} X29`]);
      const first = await judge(bank);
      expect(first).toMatchObject({
        dailyId: MYSTERY,
        otherPool: "practice",
        replaced: false,
        judgments: 1,
      });
      // Stored on the sealed item, never on the public one.
      expect(judgmentsOf(bank)).toEqual([
        {
          itemId: TWIN,
          decision: "related_ok",
          by: EDITOR,
          at: AT,
          reason: request().reason,
          pairSha256: crossPoolPairSha256(
            itemOf(bank, MYSTERY),
            itemOf(bank, TWIN),
          ),
        },
      ]);
      expect(itemOf(bank, TWIN).item.verification?.crossPool).toBeUndefined();
      // The true/false twin is still unjudged, so the Daily item still fails.
      const left = crossPoolRules(bank, OPTIONS);
      expect(left.map((f) => `${f.itemId} ${f.rule}`)).toEqual([
        `${MYSTERY} X29`,
      ]);
      expect(left[0]?.message).toContain("1 practice or room item(s)");
      expect(left[0]?.message).not.toMatch(/p\.geo/);
      await judge(bank, { itemId: TWIN_TF });
      expect(x29(bank)).toEqual([]);
      expect(judgmentsOf(bank).map((j) => j.itemId)).toEqual([TWIN, TWIN_TF]);
    },
  );

  it(
    "AC-CNT-06 the judgment lapses when either item changes what a packet shows, and X29 reports the pair again",
    { timeout: 60_000 },
    async () => {
      const bank = await tree();
      await judge(bank);
      expect(x29(bank)).toEqual([]);
      // A tag is not in any packet: the judgment holds.
      await edit(bank, TWIN, { tags: ["fixtures", "flags"] });
      expect(x29(bank)).toEqual([]);
      // A reworded stem is: the judgment lapses...
      await edit(bank, TWIN, {
        stem: "Which fixture country flies a silver heron over three blue waves?",
      });
      expect(
        judgmentState(bank, itemOf(bank, MYSTERY), itemOf(bank, TWIN)),
      ).toBe("lapsed");
      const lapsed = crossPoolRules(bank, OPTIONS);
      expect(lapsed.map((f) => `${f.itemId} ${f.rule}`)).toEqual([
        `${MYSTERY} X29`,
      ]);
      expect(lapsed[0]?.message).toContain("lapsed when an item changed");
      // ...until the editor records it again, which replaces the old one.
      const again = await judge(bank);
      expect(again.replaced).toBe(true);
      expect(judgmentsOf(bank)).toHaveLength(1);
      expect(x29(bank)).toEqual([]);
      // A change on the Daily side lapses it too.
      await edit(bank, MYSTERY, {
        explanation:
          "The heron nests by the Vellum, so all four clues point to one valley.",
      });
      expect(x29(bank)).toEqual([`${MYSTERY} X29`]);
    },
  );

  it(
    "AC-CNT-06 a room question near a Daily item: the judgment, on the Daily item, clears both of X29's findings",
    { timeout: 60_000 },
    async () => {
      const bank = await tree({
        [`practice/geography/${TWIN}.json`]: fxMc(),
        ".sealed-plain/room-packs/fx-party.json": fxPack([roomTwin()]),
      });
      expect(x29(bank).sort()).toEqual(
        [`${MYSTERY} X29`, "fx.r.fx-party.01 X29"].sort(),
      );
      const plan = await judge(bank, { itemId: "fx.r.fx-party.01" });
      expect(plan.otherPool).toBe("room");
      expect(x29(bank)).toEqual([]);
      expect(judgmentsOf(bank).map((j) => j.itemId)).toEqual([
        "fx.r.fx-party.01",
      ]);
    },
  );

  it(
    "AC-CNT-06 ignores retired items on either side of a pair",
    { timeout: 60_000 },
    async () => {
      const retired = {
        at: AT,
        by: EDITOR,
        kind: "other",
        reason: "Overlaps another item; replaced.",
      } as const;
      const checked = {
        predicted: { p: 0.6, spread: 0.3, estimator: "v0" },
        verification: { checks: [] },
      };
      const publicRetired = await tree({
        [`practice/geography/${TWIN}.json`]: twin({
          ...checked,
          status: "retired",
          retired,
        }),
      });
      expect(itemOf(publicRetired, TWIN).item.status).toBe("retired");
      expect(x29(publicRetired)).toEqual([]);
      expect(crossPoolPairs(publicRetired)).toEqual([]);
      const dailyRetired = await tree({
        [`.sealed-plain/mysteries/${MYSTERY}.json`]: fxMystery({
          status: "retired",
          retired,
          predicted: {
            solveByClue: [0.5, 0.8, 0.92, 0.98],
            spread: 0.3,
            estimator: "v0",
          },
          verification: { checks: [] },
        }),
      });
      expect(x29(dailyRetired)).toEqual([]);
    },
  );

  it(
    "AC-CNT-06 a judgment by a run that wrote, checked or estimated either item does not count",
    { timeout: 60_000 },
    async () => {
      const bank = await tree();
      await judge(bank);
      expect(x29(bank)).toEqual([]);
      // Hand-edited to name the batch writer's run as its editor.
      const forged = judgmentsOf(bank).map((j) => ({
        ...j,
        by: `ed-${WRITER.slice(2)}`,
      }));
      const daily = itemOf(bank, MYSTERY).item;
      await edit(bank, MYSTERY, {
        verification: { ...daily.verification, crossPool: forged },
      });
      expect(
        judgmentState(bank, itemOf(bank, MYSTERY), itemOf(bank, TWIN)),
      ).toBe("invalid");
      const findings = crossPoolRules(bank, OPTIONS);
      expect(findings.map((f) => `${f.itemId} ${f.rule}`)).toEqual([
        `${MYSTERY} X29`,
      ]);
      expect(findings[0]?.message).toContain("wrote, checked or estimated");
    },
  );

  it(
    "AC-CNT-06 an encore and the practice item that asks its question: judged like a mystery",
    { timeout: 60_000 },
    async () => {
      const encore = fxEncore();
      const bank = await tree({
        [`practice/geography/${TWIN}.json`]: fxMc(),
        [`.sealed-plain/encores/${encore.id}.json`]: encore,
        "practice/geography/fx.p.geo.0104.json": fxMc({
          id: "fx.p.geo.0104",
          stem: "How many steps lead up to the fixture lighthouse of Gorlund?",
          answer: "212",
          wrong: ["180", "196", "230"],
        }),
      });
      expect(x29(bank)).toEqual([`${encore.id} X29`]);
      await judge(bank, { dailyId: encore.id, itemId: "fx.p.geo.0104" });
      expect(x29(bank)).toEqual([]);
    },
  );
});

describe("recording a judgment: what is refused (CNT-2b)", () => {
  const refusal = (bank: Bank, patch: Partial<JudgmentRequest>) => {
    try {
      planJudgment(bank, request(patch));
    } catch (error) {
      return (error as Error).message;
    }
    return "accepted";
  };

  it(
    "takes only an editor, never a run that wrote, checked or estimated either item",
    { timeout: 60_000 },
    async () => {
      const bank = await tree();
      expect(refusal(bank, { editor: "fc-fx-somebody" })).toMatch(
        /^--editor is an editor's agent id/,
      );
      expect(refusal(bank, { editor: "w-fx-editor" })).toMatch(
        /^--editor is an editor's agent id/,
      );
      // The writer of either item's batch (both are w-fx-writer's).
      expect(refusal(bank, { editor: `ed-${WRITER.slice(2)}` })).toBe(
        `ed-fx-writer wrote ${MYSTERY}; one run holds one role on an item, so another editor decides (CONTENT_GUIDE §0.2)`,
      );
      // A checker of the Daily item, and an estimator of the practice item.
      const daily = itemOf(bank, MYSTERY);
      const other = itemOf(bank, TWIN);
      await saveItems(
        bank,
        new Map<string, AnyItem>([
          [
            MYSTERY,
            mergeRecord(daily.item, fxRecord(bank, daily, "A"), "A", false)
              .item,
          ],
          [
            TWIN,
            {
              ...other.item,
              verification: {
                checks: [],
                estimates: [{ by: "es-fx-guess", at: AT }],
              },
            } as AnyItem,
          ],
        ]),
        { skipGuard: true },
      );
      expect(refusal(bank, { editor: `ed-${CHECKER_A.slice(3)}` })).toMatch(
        new RegExp(`^ed-fx-alpha checked ${MYSTERY.replace(/\./g, "\\.")};`),
      );
      expect(refusal(bank, { editor: "ed-fx-guess" })).toMatch(
        new RegExp(`^ed-fx-guess estimated ${TWIN.replace(/\./g, "\\.")};`),
      );
      expect(refusal(bank, {})).toBe("accepted");
    },
  );

  it(
    "names a Daily item and a practice item or room question, both in play, that X29 flags, with a reason",
    { timeout: 60_000 },
    async () => {
      const bank = await tree({
        "practice/geography/fx.p.geo.0103.json": fxMc({ id: "fx.p.geo.0103" }),
        [`practice/geography/${TWIN_TF}.json`]: twinTf(),
      });
      expect(refusal(bank, { reason: "   " })).toMatch(/^--reason says why/);
      expect(refusal(bank, { dailyId: "fx.m.geo.0199" })).toMatch(
        /^fx\.m\.geo\.0199 is not an item of the bank; sealed items are read from content\/\.sealed-plain\//,
      );
      expect(refusal(bank, { dailyId: TWIN, itemId: TWIN_TF })).toBe(
        `--daily names a Daily item (a mystery or an encore), and ${TWIN} is a practice item`,
      );
      expect(refusal(bank, { itemId: MYSTERY })).toBe(
        `--item names a practice item or a room question, and ${MYSTERY} is a mystery`,
      );
      expect(refusal(bank, { itemId: "fx.p.geo.0199" })).toBe(
        "fx.p.geo.0199 is not an item of the bank",
      );
      // An unrelated practice item: nothing for X29 to flag, nothing to judge.
      expect(refusal(bank, { itemId: "fx.p.geo.0103" })).toBe(
        "the cross-pool check does not flag this pair (it scores below 0.5), so there is nothing to judge",
      );
      // An item out of play.
      await edit(bank, TWIN, { status: "cut" });
      expect(refusal(bank, {})).toBe(
        `${TWIN} is cut: the cross-pool check no longer reads it, so there is nothing to judge`,
      );
      // No refusal joins the practice item to the sealed one.
      for (const message of [
        refusal(bank, {}),
        refusal(bank, { itemId: "fx.p.geo.0103" }),
        refusal(bank, { editor: `ed-${WRITER.slice(2)}` }),
      ])
        expect(message.includes(MYSTERY) && /p\.geo/.test(message)).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// The CLI, in a throwaway repository with the workspace git-ignored
// ---------------------------------------------------------------------------

const SEALED_ID = /\b(?:fx\.)?(?:m\.[a-z]+\.\d{4}|e\.\d{4})\b/;

/** No line, and no JSON value, names the public item beside a sealed id. */
function expectNoJoin(output: string, publicId: string): void {
  for (const line of output.split("\n"))
    if (line.includes(publicId)) expect(line).not.toMatch(SEALED_ID);
}

function contentRepo(files: FxFiles): string {
  const repo = tempDir("qz-crosspool-");
  writeFileSync(join(repo, "package.json"), "{}\n");
  for (const path of [
    "content/categories.json",
    "content/reference",
    "content/datasets/manifest.json",
  ])
    cpSync(join(REPO_ROOT, path), join(repo, path), { recursive: true });
  // The workspace guard (CONTENT_GUIDE §11.2) asks git whether the
  // plaintext workspace is ignored before anything is written there.
  spawnSync("git", ["init", "-q"], { cwd: repo });
  writeFileSync(join(repo, ".gitignore"), "content/.sealed-plain/\n.cache/\n");
  for (const [path, value] of Object.entries(files)) {
    const target = join(repo, "content", path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  }
  return repo;
}

function cli(repo: string, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      join(REPO_ROOT, "scripts/content/dedupe.ts"),
      ...args,
    ],
    {
      cwd: repo,
      encoding: "utf8",
      // Never the machine's own key: HOME is the throwaway repository.
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: repo },
    },
  );
  return { code: result.status, out: result.stdout, err: result.stderr };
}

describe("content:dedupe -- --cross-pool-ok (CNT-2b)", () => {
  const files = (): FxFiles => ({
    "batches.json": fxRegister(),
    "answer-lists/country.json": fxCountryList(),
    [`.sealed-plain/mysteries/${MYSTERY}.json`]: fxMystery(),
    [`practice/geography/${TWIN}.json`]: twin(),
  });
  const judgeArgs = (...extra: string[]) => [
    "--cross-pool-ok",
    "--daily",
    MYSTERY,
    "--item",
    TWIN,
    "--editor",
    EDITOR,
    "--reason",
    "Same country, different fact.",
    ...extra,
  ];

  it(
    "AC-CNT-06 records the judgment on the sealed item, after which X29 passes, and prints no line that joins the public item to it",
    { timeout: 60_000 },
    () => {
      const repo = contentRepo(files());
      const before = cli(repo, "--cross-pool");
      expect(before.code).toBe(1);
      expect(before.out).toContain(`error X29 ${MYSTERY}:`);

      const recorded = cli(repo, ...judgeArgs());
      expect(recorded.code, recorded.err).toBe(0);
      expect(recorded.out).toContain(
        `${MYSTERY}: related_ok recorded by ${EDITOR} against a practice item.`,
      );
      expect(recorded.out).toContain("run npm run content:seal");
      for (const stream of [recorded.out, recorded.err]) {
        expect(stream).not.toContain(TWIN);
        expect(stream).not.toContain("Same country, different fact.");
      }
      // On the sealed workspace file, never the public one.
      const stored = JSON.parse(
        readFileSync(
          join(repo, "content/.sealed-plain/mysteries", `${MYSTERY}.json`),
          "utf8",
        ),
      ) as AnyItem;
      expect(stored.verification?.crossPool).toEqual([
        expect.objectContaining({
          itemId: TWIN,
          decision: "related_ok",
          by: EDITOR,
        }),
      ]);
      const publicFile = readFileSync(
        join(repo, "content/practice/geography", `${TWIN}.json`),
        "utf8",
      );
      expect(publicFile).not.toMatch(SEALED_ID);

      // JSON output: the Daily id and counts only.
      const json = cli(repo, ...judgeArgs("--json"));
      expect(json.code, json.err).toBe(0);
      expect(JSON.parse(json.out)).toEqual({
        ok: true,
        dailyId: MYSTERY,
        decision: "related_ok",
        by: EDITOR,
        against: "practice",
        replaced: true,
        judgments: 1,
      });

      // X29 now passes, and says how many pairs it skipped.
      for (const args of [["--cross-pool"], ["--cross-pool", "--json"], []]) {
        const after = cli(repo, ...args);
        expect(after.code, after.out).toBe(0);
        expectNoJoin(after.out, TWIN);
      }
      expect(cli(repo, "--cross-pool").out).toContain(
        "1 flagged pair(s) skipped under an editor's related_ok",
      );
      expect(JSON.parse(cli(repo, "--cross-pool", "--json").out)).toMatchObject(
        { ok: true, crossPool: [], crossPoolJudged: 1 },
      );

      // --item lists the pair with its judgment; only --reveal names the
      // practice item beside the Daily item.
      const item = cli(repo, "--item", MYSTERY);
      expect(item.out).toContain(
        `X29 for ${MYSTERY}: 1 flagged: 1 judged related_ok, 0 unjudged; pass --reveal to name them`,
      );
      expectNoJoin(item.out, TWIN);
      const revealed = cli(repo, "--item", MYSTERY, "--reveal");
      expect(revealed.out).toMatch(
        new RegExp(
          `${MYSTERY.replace(/\./g, "\\.")} {2}${TWIN.replace(/\./g, "\\.")} .*related_ok holds`,
        ),
      );
      const fromPublic = cli(repo, "--item", TWIN, "--json");
      expectNoJoin(fromPublic.out, TWIN);
      expect(JSON.parse(fromPublic.out)).toMatchObject({
        crossPool: { flagged: 1, holds: 1 },
      });
      expect(
        (JSON.parse(fromPublic.out) as { crossPool: object }).crossPool,
      ).not.toHaveProperty("pairs");
    },
  );

  it(
    "refuses --sealed, a missing or stray option, and a refused judgment, without joining the two items",
    { timeout: 60_000 },
    () => {
      const repo = contentRepo(files());
      const sealed = cli(repo, ...judgeArgs("--sealed"));
      expect(sealed.code).toBe(2);
      expect(sealed.err).toContain("do not run with --sealed");
      const missing = cli(repo, "--cross-pool-ok", "--daily", MYSTERY);
      expect(missing.code).toBe(2);
      expect(missing.err).toContain(
        "--cross-pool-ok needs --item, --editor, --reason",
      );
      const stray = cli(repo, ...judgeArgs("--write"));
      expect(stray.code).toBe(2);
      expect(stray.err).toContain("not --write");
      const alone = cli(repo, "--editor", EDITOR);
      expect(alone.code).toBe(2);
      expect(alone.err).toContain("--editor goes with --cross-pool-ok only");
      const writer = cli(
        repo,
        ...judgeArgs().map((arg) => (arg === EDITOR ? "ed-fx-writer" : arg)),
      );
      expect(writer.code).toBe(1);
      expect(writer.err).toContain(`ed-fx-writer wrote ${MYSTERY}`);
      for (const result of [sealed, missing, stray, alone, writer])
        expectNoJoin(`${result.out}\n${result.err}`, TWIN);
      // On a fixture tree X29 runs too: its Mysteries and Encores count as
      // Daily items (R2-22).
      const fixtures = cli(
        REPO_ROOT,
        "--cross-pool",
        "--root",
        "src/content/pipeline/__fixtures__/bank",
        "--fixtures",
      );
      expect(fixtures.code, fixtures.err).toBe(0);
      expect(fixtures.out).not.toContain("Cross-pool check: not run");
      // Nothing was written by any of them.
      const stored = JSON.parse(
        readFileSync(
          join(repo, "content/.sealed-plain/mysteries", `${MYSTERY}.json`),
          "utf8",
        ),
      ) as AnyItem;
      expect(stored.verification).toBeUndefined();
    },
  );
});
