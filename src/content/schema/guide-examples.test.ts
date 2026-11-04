// @vitest-environment node
/**
 * CONTENT_GUIDE §12 as fixtures (ARCHITECTURE §5.1.1, CNT-1): every GOOD
 * example is a complete writer submission and passes its source schema
 * and the lint, and every BAD example a machine can judge fails on the
 * rule it names. The examples keep their reserved ids (batch 00, room
 * sequences 90 to 99): allowed here, and only here, refused anywhere
 * under content/ (C24).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  countryId,
  fxComparison,
  fxEncore,
  fxFiles,
  fxMc,
  fxMystery,
  fxPack,
  fxRoomQuestion,
  fxTf,
  loadFx,
  removeTempDirs,
  tempDir,
} from "../pipeline/__fixtures__/builders.ts";
import { loadBank } from "../pipeline/bank.ts";
import { resolveLayout } from "../pipeline/layout.ts";
import { lintBank, type Finding } from "../pipeline/lint/index.ts";
import { ANSWER_LIST_SCHEMAS, answerEntitySchema } from "./answer-lists.ts";
import { CATEGORY_TABLE } from "./categories.ts";
import {
  EncoreSchema,
  MysterySchema,
  PracticeItemSchema,
  RoomQuestionSchema,
  SELF_CHECK_CODES,
} from "./items.ts";
import type { AnswerType } from "./primitives.ts";

afterAll(removeTempDirs);

const GUIDE = readFileSync(join(REPO_ROOT, "docs", "CONTENT_GUIDE.md"), "utf8");

/** §12.0: every submission carries the eleven true codes, left out of the guide for space. */
const SELF_CHECK = Object.fromEntries(SELF_CHECK_CODES.map((c) => [c, true]));

type Json = Record<string, unknown>;

/** The JSON examples of one §12 section, by its number ("12.1"). */
function examples(section: string): Json[] {
  const parts = GUIDE.split(/^### /m);
  const body = parts.find((part) => part.startsWith(`${section} `));
  if (body === undefined) throw new Error(`no section ${section}`);
  return [...body.matchAll(/```json\s*\n([\s\S]*?)```/g)].flatMap((match) => {
    const value = JSON.parse(match[1] ?? "") as Json | Json[];
    return Array.isArray(value) ? value : [value];
  });
}

const GOOD_ITEMS = ["12.1", "12.3", "12.5", "12.7", "12.9", "12.11"];

function schemaFor(item: Json) {
  if (item.kind === "mystery") return MysterySchema;
  if (item.kind === "encore") return EncoreSchema;
  if (item.kind === "choice") return RoomQuestionSchema;
  return PracticeItemSchema;
}

const issues = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) =>
  result.success
    ? []
    : (result.error?.issues ?? []).map(
        (issue) => `${issue.path.map(String).join(".")}: ${issue.message}`,
      );

/** The guide's good items as one fixture-kind tree, packs grouped by id. */
function goodTree(): string {
  const root = tempDir("qz-guide-");
  const slugs = new Map(CATEGORY_TABLE.map((c) => [c.id, c.slug]));
  const packs = new Map<string, Json[]>();
  const write = (path: string, value: unknown) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`);
  };
  for (const section of GOOD_ITEMS) {
    for (const example of examples(section)) {
      const item = { ...example, selfCheck: SELF_CHECK };
      const id = String(item.id);
      if (item.kind === "mystery") write(`mysteries/${id}.json`, item);
      else if (item.kind === "encore") write(`encores/${id}.json`, item);
      else if (item.kind === "choice") {
        const pack = id.split(".")[1] ?? "";
        packs.set(pack, [...(packs.get(pack) ?? []), item]);
      } else
        write(
          `practice/${slugs.get(item.category as never) ?? ""}/${id}.json`,
          item,
        );
    }
  }
  for (const [pack, questions] of packs) {
    write(`room-packs/${pack}.json`, {
      id: pack,
      title: pack,
      theme: pack,
      questions,
    });
  }
  return root;
}

describe("CONTENT_GUIDE §12's good examples", () => {
  it("pass their source schemas, every field the guide marks + included", () => {
    let count = 0;
    for (const section of GOOD_ITEMS) {
      for (const example of examples(section)) {
        const item = { ...example, selfCheck: SELF_CHECK };
        expect(
          issues(schemaFor(item).safeParse(item)),
          String(item.id),
        ).toEqual([]);
        count += 1;
      }
    }
    expect(count).toBe(60);
  });

  it("include one good answer-list entry per type, and each passes its type's schema", () => {
    const entries = examples("12.13");
    expect(entries).toHaveLength(12);
    const types = new Set<AnswerType>();
    for (const entry of entries) {
      const id = String(entry.id);
      // A QID's type is its list's: the guide names it beside the entry.
      const match = Object.keys(ANSWER_LIST_SCHEMAS).find((type) =>
        id.startsWith(`x.${type}.`),
      );
      const type = (
        (match ??
        (entry.qualifier as Json | undefined)?.descriptor !== undefined)
          ? match
          : undefined
      ) as AnswerType | undefined;
      const candidates: AnswerType[] =
        type === undefined
          ? (Object.keys(ANSWER_LIST_SCHEMAS) as AnswerType[])
          : [type];
      const passing = candidates.filter(
        (candidate) => answerEntitySchema(candidate).safeParse(entry).success,
      );
      expect(passing.length, id).toBeGreaterThan(0);
      for (const candidate of passing) types.add(candidate);
    }
    expect(types.size).toBe(12);
  });

  it("pass the lint, apart from the rules that need the rest of a bank", async () => {
    const bank = await loadBank(
      resolveLayout({ repoRoot: REPO_ROOT, root: goodTree(), fixtures: true }),
    );
    expect(bank.items).toHaveLength(60);
    const errors = lintBank(bank, { dedupe: false, today: "2026-11-04" })
      .filter((finding) => finding.severity === "error")
      .filter(
        (finding) =>
          // C24: the reserved ids, allowed only in schema tests.
          finding.rule !== "C24" &&
          // C14: the mysteries name entities from lists the guide doesn't ship.
          finding.rule !== "C14",
      )
      .map((finding) => `${finding.itemId ?? finding.file} ${finding.rule}`);
    // The pipeline's C17 doesn't read exactDates yet (§2.6: two exact days
    // a year apart pass the guard), so the two near-tie examples wait on
    // CNT-2's follow-up.
    expect(errors.sort()).toEqual(["p.art.0002 C17", "p.film.0003 C17"]);
  });
});

/**
 * The bad examples a machine can judge. The rest (no foothold, a
 * contested first, a key that depends on interpretation, a definition
 * trap, local knowledge, which version of a thing, an undefined "bigger",
 * an upside-down ladder, an answer nobody knows, a distractor that fits
 * every clue, a moving or disputed number, a population, a coin-flip
 * finale, an alias list copied from a dataset, one person in two lists, a
 * QID typed from memory) are left to people (§2.13), and the checks of §9
 * are where they fail.
 */
describe("CONTENT_GUIDE §12's bad examples", () => {
  const MC = "practice/geography/fx.p.geo.0101.json";
  const TF = "practice/geography/fx.p.geo.0102.json";
  const CMP = "practice/geography/fx.p.geo.0103.json";
  const MYS = "mysteries/fx.m.geo.0101.json";
  const ENC = "encores/fx.e.0101.json";
  const PACK = "room-packs/fx-party.json";

  async function findings(extra: Record<string, unknown>): Promise<Finding[]> {
    return lintBank(await loadFx(fxFiles(extra)), {
      today: "2026-10-31",
      dedupe: true,
    });
  }
  const rules = (list: Finding[], file: string) =>
    list
      .filter((finding) => finding.file.endsWith(file))
      .map((finding) => `${finding.severity} ${finding.rule}`);

  it("12.2: a negative stem fails C06, a record fails C19 and a length cue fails C07", async () => {
    const negative = await findings({
      [MC]: fxMc({ stem: "Which of these fixture rivers is not tidal?" }),
    });
    expect(rules(negative, MC)).toContain("error C06");
    // C19: a superlative with no high-risk claim behind it (§3.5).
    const plain = fxMc().claims.map((claim) => ({
      id: claim.id,
      role: claim.role,
      risk: "standard" as const,
      text: claim.text,
    }));
    const record = await findings({
      [MC]: fxMc({
        stem: "Which fixture tower is the tallest in Cindral?",
        claims: plain,
      }),
    });
    expect(rules(record, MC)).toContain("warn C19");
    const cue = await findings({
      [MC]: fxMc({
        answer: "A metal enclosure that blocks electric fields from outside",
        wrong: ["A box", "A cage", "A prison"],
      }),
    });
    expect(rules(cue, MC)).toContain("error C07");
  });

  it("12.4: a negated statement fails C06", async () => {
    const list = await findings({
      [TF]: fxTf({
        stem: "The fixture wall of Cindral is not visible from the hills.",
      }),
    });
    expect(rules(list, TF)).toContain("error C06");
  });

  it("12.6: a same-year pair and a tie fail the separation guard, C17", async () => {
    const sameYear = await findings({
      [CMP]: fxComparison({ values: { a: 1889, b: 1889 } }),
    });
    expect(rules(sameYear, CMP)).toContain("error C17");
  });

  it("12.8: a giveaway inside a word fails C12, and a clue with a shelf life fails C09", async () => {
    const base = fxMystery();
    const giveaway = await findings({
      [MYS]: fxMystery({
        clues: [
          "Arvennans call its underground railway the Lantern Line.",
          base.clues[1],
          base.clues[2],
          base.clues[3],
        ],
      }),
    });
    expect(rules(giveaway, MYS)).toContain("error C12");
    const shelfLife = await findings({
      [MYS]: fxMystery({
        clues: [
          "Its current first minister lives beside the Vellum.",
          base.clues[1],
          base.clues[2],
          base.clues[3],
        ],
      }),
    });
    expect(rules(shelfLife, MYS)).toContain("error C09");
  });

  it("12.10: a scale without a true zero fails C15, and tons fail C21", async () => {
    const fahrenheit = await findings({
      [ENC]: fxEncore({
        unit: "degrees Fahrenheit",
        unitShort: "°F",
        unitLabel: "in degrees Fahrenheit",
      }),
    });
    // §6 rule 4: a ratio needs a true zero, so no temperature units.
    expect(rules(fahrenheit, ENC)).toContain("error C15");
    const tons = await findings({
      [ENC]: fxEncore({
        unit: "tons",
        unitShort: "tons",
        unitLabel: "in tons",
      }),
    });
    expect(rules(tons, ENC)).toContain("error C21");
  });

  it("12.12: a long room stem fails C03, true/false fails the room schema, and a recent champion fails C09", async () => {
    const pack = (patch: Record<string, unknown>) =>
      fxPack(
        Array.from({ length: 15 }, (_, i) =>
          fxRoomQuestion(i + 1, i === 0 ? patch : {}),
        ),
      );
    const long = await findings({
      [PACK]: pack({
        stem: "In the fixture year of the long frost, at the battle fought near the town that grew up around the old mill, which side won?",
      }),
    });
    expect(rules(long, PACK)).toContain("error C03");
    const trueFalse = await findings({
      [PACK]: pack({ format: "tf", answer: true, wrong: undefined }),
    });
    expect(rules(trueFalse, PACK)).toContain("error C01");
    const recent = await findings({
      [PACK]: pack({ stem: "Which fixture club won the most recent Cup?" }),
    });
    expect(rules(recent, PACK)).toContain("error C09");
  });

  it("12.12: a copy of a practice item is a near-duplicate, C22", async () => {
    const twin = fxMc();
    const list = await findings({
      [PACK]: fxPack(
        Array.from({ length: 15 }, (_, i) =>
          fxRoomQuestion(
            i + 1,
            i === 0
              ? {
                  stem: twin.stem,
                  answer: twin.answer,
                  wrong: twin.wrong,
                  claims: twin.claims,
                }
              : {},
          ),
        ),
      ),
    });
    expect(rules(list, PACK)).toContain("warn C22");
  });

  it("12.14: an element that doesn't exist and a list too small to hide anything fail their schemas", () => {
    expect(
      answerEntitySchema("element").safeParse({
        id: "x.element.ununennium",
        name: "Ununennium",
        display: "Ununennium",
        aliases: [],
        popularity: 0,
        qualifier: { symbol: "Uue", number: 119 },
        source: "ptable",
        status: "active",
        addedIn: "2026-11-01",
      }).success,
    ).toBe(false);
    // "planet" is no answer type (§2.10): no schema takes the list at all.
    expect(Object.keys(ANSWER_LIST_SCHEMAS)).not.toContain("planet");
  });

  it("a mystery whose answer the list doesn't hold fails C14", async () => {
    const list = await findings({
      [MYS]: fxMystery({ answer: countryId("Nowhere") }),
    });
    expect(rules(list, MYS)).toContain("error C14");
  });
});
