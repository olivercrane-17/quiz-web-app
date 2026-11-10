// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { createHash } from "node:crypto";

import type { AnyItem, McItem } from "../../schema/items.ts";
import {
  COUNTRY_NAMES,
  EDITOR,
  REPO_ROOT,
  countryId,
  fxComparison,
  fxCountryList,
  fxEncore,
  fxFiles,
  fxMc,
  fxMystery,
  fxPack,
  fxRecord,
  fxRegister,
  fxRoomQuestion,
  fxTf,
  itemOf,
  loadContentTree,
  loadFx,
  type FxFiles,
  removeTempDirs,
} from "../__fixtures__/builders.ts";
import { formatFinding } from "../cli.ts";
import { decideOne } from "../decisions.ts";
import { mergeRecord } from "../records.ts";
import { requireBatch } from "../register.ts";
import { saveItems } from "../store.ts";
import { rot13 } from "../text.ts";
import { lintBank, RULES, type Finding } from "./index.ts";
import { bandOf } from "./pool-rules.ts";

afterAll(removeTempDirs);

const MC = "practice/geography/fx.p.geo.0101.json";
const TF = "practice/geography/fx.p.geo.0102.json";
const CMP = "practice/geography/fx.p.geo.0103.json";
const MYS = "mysteries/fx.m.geo.0101.json";
const ENC = "encores/fx.e.0101.json";
const PACK = "room-packs/fx-party.json";

async function lint(
  extra: FxFiles = {},
  options: { writer?: string } = {},
): Promise<Finding[]> {
  return lintBank(await loadFx(fxFiles(extra)), {
    today: "2026-10-31",
    ...options,
  });
}

const of = (findings: Finding[], rule: string, severity?: string) =>
  findings.filter(
    (f) =>
      f.rule === rule && (severity === undefined || f.severity === severity),
  );

const fullPack = (patch: (n: number) => Record<string, unknown> = () => ({})) =>
  fxPack(
    Array.from({ length: 15 }, (_, i) => fxRoomQuestion(i + 1, patch(i + 1))),
  );

describe("the fixture bank", () => {
  it("is clean, so every finding below comes from its one change", async () => {
    expect(await lint({ [PACK]: fullPack() })).toEqual([]);
  });

  it("documents every rule C01 to C25 with a severity", () => {
    for (let n = 1; n <= 25; n += 1) {
      expect(RULES[`C${String(n).padStart(2, "0")}`]?.severity).toBeTruthy();
    }
  });
});

describe("C01 schema", () => {
  it("reports invalid JSON, unknown keys, id and folder mismatches", async () => {
    const findings = await lint({
      [MC]: "{ not json",
      [TF]: { ...fxTf(), extra: true },
      [CMP]: fxComparison({ id: "fx.p.geo.0109" }),
      "practice/history/fx.p.geo.0104.json": fxMc({ id: "fx.p.geo.0104" }),
    });
    const c01 = of(findings, "C01", "error").map(
      (f) => `${f.file.split("/").slice(-2).join("/")} ${f.message}`,
    );
    expect(c01).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/fx\.p\.geo\.0101\.json .*invalid JSON/),
        expect.stringMatching(/fx\.p\.geo\.0102\.json .*extra/),
        expect.stringMatching(/does not match the file name/),
        expect.stringMatching(/a geo item sits in practice\/history/),
      ]),
    );
  });
});

describe("C02 to C04: lengths", () => {
  it("C02 caps explanations at 35 words, and warns on room explanations over 25", async () => {
    const words = (n: number) =>
      Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
    expect(
      of(
        await lint({ [MC]: fxMc({ explanation: words(36) }) }),
        "C02",
        "error",
      ),
    ).toHaveLength(1);
    expect(
      of(await lint({ [MC]: fxMc({ explanation: words(35) }) }), "C02"),
    ).toHaveLength(0);
    const pack = fullPack((n) => (n === 2 ? { explanation: words(26) } : {}));
    expect(of(await lint({ [PACK]: pack }), "C02", "warn")).toHaveLength(1);
  });

  it("C03 caps stems at 120 characters, 100 in rooms", async () => {
    const stem = (n: number) => `${"x".repeat(n - 1)}?`;
    expect(
      of(await lint({ [MC]: fxMc({ stem: stem(121) }) }), "C03", "error"),
    ).toHaveLength(1);
    expect(
      of(await lint({ [MC]: fxMc({ stem: stem(120) }) }), "C03"),
    ).toHaveLength(0);
    expect(
      of(
        await lint({
          [PACK]: fullPack((n) => (n === 1 ? { stem: stem(101) } : {})),
        }),
        "C03",
        "error",
      ),
    ).toHaveLength(1);
  });

  it("C04: over 60 characters is an error, over 24 a warning, rooms error over 30", async () => {
    const findings = await lint({
      [MC]: fxMc({ wrong: ["x".repeat(61), "y".repeat(25), "Reed pipe"] }),
    });
    expect(of(findings, "C04", "error")).toHaveLength(1);
    expect(of(findings, "C04", "warn")).toHaveLength(1);
    const pack = fullPack((n) =>
      n === 3 ? { wrong: ["z".repeat(31), "Kelp", "Lapis"] } : {},
    );
    expect(of(await lint({ [PACK]: pack }), "C04", "error")).toHaveLength(1);
  });
});

describe("C05 to C09: options and wording", () => {
  it("C05 refuses all/none of the above, both and neither", async () => {
    for (const option of [
      "All of the above",
      "None of these",
      "Neither",
      "Both of these",
    ]) {
      expect(
        of(
          await lint({
            [MC]: fxMc({ wrong: [option, "Hand drum", "Reed pipe"] }),
          }),
          "C05",
          "error",
        ),
      ).toHaveLength(1);
    }
    expect(
      of(
        await lint({
          [MC]: fxMc({
            wrong: ["Neither Here Nor There", "Hand drum", "Reed pipe"],
          }),
        }),
        "C05",
      ),
    ).toHaveLength(0);
  });

  it("C06 flags negative stems and statements as errors and clues as warnings", async () => {
    expect(
      of(
        await lint({
          [MC]: fxMc({
            stem: "Which instrument does not open the Halvessa festival?",
          }),
        }),
        "C06",
        "error",
      ),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [TF]: fxTf({ stem: "Istrova never repaints its doors." }),
        }),
        "C06",
        "error",
      ),
    ).toHaveLength(1);
    const clues = [...fxMystery().clues] as [string, string, string, string];
    clues[1] = "Its calendar has never had more than thirteen months.";
    expect(
      of(await lint({ [MYS]: fxMystery({ clues }) }), "C06", "warn"),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [MC]: fxMc({
            stem: "Which notable instrument opens the Halvessa festival?",
          }),
        }),
        "C06",
      ),
    ).toHaveLength(0);
  });

  it("C07 refuses a key much longer than every other option", async () => {
    const findings = await lint({
      [MC]: fxMc({
        answer: "A carved heron-bone flute with seven holes",
        wrong: ["Drum", "Horn", "Pipe"],
      }),
    });
    expect(of(findings, "C07", "error")).toHaveLength(1);
  });

  it("C08 refuses numeric dates but not fractions or year ranges", async () => {
    expect(
      of(
        await lint({
          [MC]: fxMc({
            explanation: "It first played on 03/04/2025 in the square.",
          }),
        }),
        "C08",
        "error",
      ),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [MC]: fxMc({
            explanation: "It first played on 2025-04-03 in the square.",
          }),
        }),
        "C08",
        "error",
      ),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [MC]: fxMc({
            explanation: "About 3/4 of the town joins the 1966-67 parade.",
          }),
        }),
        "C08",
      ),
    ).toHaveLength(0);
  });

  it("C09 refuses time words, and an editor may waive a false positive with lintAllow", async () => {
    expect(
      of(
        await lint({
          [MC]: fxMc({
            stem: "Which instrument currently opens the Halvessa festival?",
          }),
        }),
        "C09",
        "error",
      ),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [MC]: fxMc({
            stem: "Which instrument opens the festival nowhere but Halvessa?",
          }),
        }),
        "C09",
      ),
    ).toHaveLength(0);
    const waived = fxMc({
      explanation:
        "The flute's tone carries over the electric current of the old tram line.",
      lintAllow: [
        {
          rule: "C09",
          text: "electric current",
          reason: "a noun, not a time word",
        },
      ],
    });
    expect(of(await lint({ [MC]: waived }), "C09")).toHaveLength(0);
  });
});

describe("C10 and C11: spelling and plain text", () => {
  it("C10 warns on US and -ise spellings, but not proper nouns or quotations", async () => {
    const findings = await lint({
      [MC]: fxMc({
        explanation:
          "The flute's color changes as it ages, and players organise a vote on it.",
      }),
    });
    expect(of(findings, "C10", "warn").map((f) => f.excerpt)).toEqual([
      "color",
      "organise",
    ]);
    const fine = fxMc({
      explanation:
        "Players learn it at Pearl Harbor and sing 'the color of the sea', said Mr Gray.",
    });
    expect(of(await lint({ [MC]: fine }), "C10")).toHaveLength(0);
  });

  it("C11 refuses dashes, double spaces, URLs, HTML, Markdown and emoji; warns on curly quotes", async () => {
    const cases = [
      `A flute ${String.fromCharCode(0x2014)} carved from bone.`,
      "A flute  carved from bone.",
      "See https://example.org for more.",
      "A <b>bone</b> flute.",
      "A **bone** flute.",
      "A bone flute \u{1F3B6}.",
    ];
    for (const explanation of cases) {
      expect(
        of(await lint({ [MC]: fxMc({ explanation }) }), "C11", "error"),
      ).toHaveLength(1);
    }
    expect(
      of(
        await lint({
          [MC]: fxMc({ explanation: "The town’s flute is carved from bone." }),
        }),
        "C11",
        "warn",
      ),
    ).toHaveLength(1);
  });
});

describe("C12 to C14: mysteries", () => {
  const clueSet = (index: number, text: string) => {
    const clues = [...fxMystery().clues] as [string, string, string, string];
    clues[index] = text;
    return clues;
  };

  it("C12 catches the name, aliases, prefixes and giveaway terms, and long clues", async () => {
    const name = await lint({
      [MYS]: fxMystery({ clues: clueSet(0, "Arvenna flies a heron flag.") }),
    });
    expect(of(name, "C12", "error").map((f) => f.message)).toEqual([
      expect.stringContaining("name or an alias"),
    ]);
    const alias = await lint({
      [MYS]: fxMystery({
        clues: clueSet(0, "The Arven Republic flies a heron flag."),
      }),
    });
    expect(of(alias, "C12", "error")).toHaveLength(1);
    const prefix = await lint({
      [MYS]: fxMystery({
        clues: clueSet(1, "Arvennish farmers count thirteen months."),
      }),
    });
    expect(of(prefix, "C12", "error").map((f) => f.message)).toEqual([
      expect.stringContaining("begins with"),
    ]);
    const giveaway = await lint({
      [MYS]: fxMystery({
        giveawayTerms: ["heron"],
        clues: clueSet(
          0,
          "Its flag shows a silver heron above three blue waves.",
        ),
      }),
    });
    expect(of(giveaway, "C12", "error").map((f) => f.message)).toEqual([
      expect.stringContaining("giveaway term"),
    ]);
    const near = await lint({
      [MYS]: fxMystery({
        clues: clueSet(1, "Arverne merchants count thirteen months."),
      }),
    });
    expect(of(near, "C12", "warn")).toHaveLength(1);
    const long = await lint({
      [MYS]: fxMystery({ clues: clueSet(2, `${"a ".repeat(70)}b`) }),
    });
    expect(of(long, "C12", "error").map((f) => f.message)).toEqual([
      expect.stringContaining("141 characters"),
    ]);
  });

  it("C13 keeps every word of the display form, qualifier included, out of clue 4", async () => {
    const list = fxCountryList() as { entities: Record<string, unknown>[] };
    list.entities[0] = { ...list.entities[0], display: "Arvenna (fixture)" };
    const findings = await lint({ "answer-lists/country.json": list });
    expect(of(findings, "C13", "error")).toHaveLength(1);
    expect(of(await lint(), "C13")).toHaveLength(0);
  });

  it("C14 needs active entities, distinct distractors, a big enough list and the freeze", async () => {
    const missing = await lint({
      [MYS]: fxMystery({
        distractors: [
          countryId("Belloria"),
          countryId("Cassova"),
          "fx.x.country.nowhere",
        ],
      }),
    });
    expect(of(missing, "C14", "error").map((f) => f.message)).toEqual([
      expect.stringContaining("not in the country list"),
    ]);
    const twins = await lint({
      [MYS]: fxMystery({
        distractors: [
          countryId("Belloria"),
          countryId("Belloria"),
          countryId("Cassova"),
        ],
      }),
    });
    expect(of(twins, "C14", "error").map((f) => f.message)).toEqual([
      expect.stringContaining("distinct"),
    ]);
    const list = fxCountryList() as { entities: Record<string, unknown>[] };
    list.entities[0] = { ...list.entities[0], status: "retired" };
    expect(
      of(await lint({ "answer-lists/country.json": list }), "C14", "error").map(
        (f) => f.message,
      ),
    ).toEqual([expect.stringContaining("retired")]);
    expect(
      of(await lint({ [MYS]: fxMystery({ slot: 2 }) }), "C14", "error").map(
        (f) => f.message,
      ),
    ).toEqual([expect.stringContaining("needs 100")]);
    const small = fxCountryList(29);
    expect(
      of(
        await lint({
          "answer-lists/country.json": small,
          [MYS]: fxMystery({
            likelyGuesses: COUNTRY_NAMES.slice(1, 7).map(countryId),
          }),
        }),
        "C14",
        "error",
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("C15 to C18: encores, true/false, comparisons and options", () => {
  it("C15 checks encore numbers, units and bands", async () => {
    const cases: Record<string, unknown>[] = [
      { answer: 0 },
      { valueKind: "year", answer: 1890.5, unit: "" },
      { valueKind: "year", answer: 1890, unit: "years" },
      { answer: 212.25 },
      { answer: 12 },
      { unit: "°C" },
      { bands: { bullseye: 0.2, close: 0.1 } },
      { bands: { bullseye: 0.15, close: 0.3 } },
    ];
    for (const patch of cases) {
      expect(
        of(await lint({ [ENC]: fxEncore(patch) }), "C15", "error").length,
        JSON.stringify(patch),
      ).toBeGreaterThan(0);
    }
    expect(
      of(
        await lint({
          [ENC]: fxEncore({ answer: 12, bands: { bullseye: 0.1, close: 0.3 } }),
        }),
        "C15",
      ),
    ).toHaveLength(0);
  });

  it("C16 matches tfKind to the answer and refuses a question mark", async () => {
    expect(
      of(await lint({ [TF]: fxTf({ tfKind: "myth" }) }), "C16", "error"),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [TF]: fxTf({ stem: "Does Istrova repaint its doors each spring?" }),
        }),
        "C16",
        "error",
      ),
    ).toHaveLength(1);
  });

  it("C17 checks the winner and the separation guard", async () => {
    expect(
      of(await lint({ [CMP]: fxComparison({ answer: "b" }) }), "C17", "error"),
    ).toHaveLength(1);
    expect(
      of(
        await lint({ [CMP]: fxComparison({ values: { a: 250, b: 250 } }) }),
        "C17",
        "error",
      ),
    ).toHaveLength(1);
    expect(
      of(
        await lint({ [CMP]: fxComparison({ values: { a: 260, b: 250 } }) }),
        "C17",
        "error",
      ),
    ).toHaveLength(1);
    // Dates under 10 years apart: an error only a C17 lintAllow that states
    // both exact days can waive (§2.6), unlike every other C17 error.
    const dates = fxComparison({
      stem: "Which was built first?",
      relation: "earlier",
      unit: "year",
      measure: "year it was finished",
      values: { a: 1886, b: 1890 },
    });
    expect(of(await lint({ [CMP]: dates }), "C17", "error")).toHaveLength(1);
    const exactDays = {
      ...dates,
      lintAllow: [
        {
          rule: "C17",
          text: "exact days",
          reason:
            "Both are exact, undisputed days: 4 May 1886 and 9 June 1890.",
        },
      ],
    };
    expect(of(await lint({ [CMP]: exactDays }), "C17")).toHaveLength(0);
    expect(
      of(
        await lint({
          [CMP]: { ...exactDays, answer: "b" },
        }),
        "C17",
        "error",
      ).map((f) => f.path),
    ).toEqual(["answer"]);
    const lat = fxComparison({
      stem: "Which tower is further north?",
      relation: "further_north",
      unit: "° N",
      values: { a: 40.3, b: 40.0 },
    });
    expect(of(await lint({ [CMP]: lat }), "C17", "error")).toHaveLength(1);
    const counts = fxComparison({
      stem: "Which tower has more floors?",
      relation: "more",
      unit: "floors",
      values: { a: 80, b: 79 },
    });
    expect(of(await lint({ [CMP]: counts }), "C17")).toHaveLength(0);
    expect(
      of(
        await lint({
          [CMP]: fxComparison({ stem: "Which fixture tower is older?" }),
        }),
        "C17",
        "warn",
      ),
    ).toHaveLength(1);
  });

  it("C18 wants numbers for ascending options and no duplicates", async () => {
    expect(
      of(
        await lint({
          [MC]: fxMc({
            order: "ascending",
            answer: "12",
            wrong: ["about 8", "20", "30"],
          }),
        }),
        "C18",
        "error",
      ),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [MC]: fxMc({ wrong: ["bone  FLUTE", "Hand drum", "Reed pipe"] }),
        }),
        "C18",
        "error",
      ),
    ).toHaveLength(1);
    expect(
      of(
        await lint({ [MC]: fxMc({ answer: "12", wrong: ["8", "20", "30"] }) }),
        "C18",
        "warn",
      ),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [MC]: fxMc({
            order: "ascending",
            answer: "12",
            wrong: ["8", "20", "30"],
          }),
        }),
        "C18",
      ),
    ).toHaveLength(0);
  });
});

describe("C19 to C21: risky words and units", () => {
  it("C19 wants a high-risk claim behind a superlative, and skips comparison stems", async () => {
    const stem = "Which instrument is the oldest in the Halvessa festival?";
    const standard = fxMc().claims.map((claim) =>
      claim.risk === "high"
        ? {
            id: claim.id,
            role: claim.role,
            risk: "standard" as const,
            text: claim.text,
          }
        : claim,
    );
    expect(
      of(await lint({ [MC]: fxMc({ stem, claims: standard }) }), "C19", "warn"),
    ).toHaveLength(1);
    // Any high-risk claim counts, whatever its reason (§2.13; p.film.0003).
    expect(of(await lint({ [MC]: fxMc({ stem }) }), "C19")).toHaveLength(0);
    const claims = [
      ...standard,
      {
        id: "c4",
        role: "key" as const,
        risk: "high" as const,
        riskReason: "superlative" as const,
        text: "The bone flute is the oldest instrument there.",
      },
    ];
    expect(
      of(await lint({ [MC]: fxMc({ stem, claims }) }), "C19"),
    ).toHaveLength(0);
    const first = fxComparison({
      stem: "Which came first?",
      relation: "earlier",
      unit: "year",
      measure: "year finished",
      values: { a: 1801, b: 1850 },
      answer: "a",
    });
    expect(of(await lint({ [CMP]: first }), "C19")).toHaveLength(0);
    const waived = fxMc({
      stem,
      claims: standard,
      lintAllow: [
        { rule: "C19", text: "the oldest", reason: "dated in the explanation" },
      ],
    });
    expect(of(await lint({ [MC]: waived }), "C19")).toHaveLength(0);
  });

  it("C20 wants football (soccer) or American football", async () => {
    expect(
      of(
        await lint({
          [MC]: fxMc({
            explanation:
              "Halvessa's football club plays the flute at every match.",
          }),
        }),
        "C20",
        "warn",
      ),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [MC]: fxMc({
            explanation:
              "Halvessa's football (soccer) club plays it; so does its American football team.",
          }),
        }),
        "C20",
      ),
    ).toHaveLength(0);
  });

  it("C21 flags ambiguous units, as errors in encores", async () => {
    expect(
      of(
        await lint({
          [MC]: fxMc({
            explanation:
              "Each flute weighs less than an ounce and won the Halvessa World Cup.",
          }),
        }),
        "C21",
        "warn",
      ),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [ENC]: fxEncore({
            question:
              "How many tons of stone are in the fixture lighthouse of Gorlund?",
          }),
        }),
        "C21",
        "error",
      ),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [ENC]: fxEncore({
            explanation:
              "The lamp room reaches 40 °C on summer nights, so keepers climb at dawn.",
          }),
        }),
        "C21",
        "error",
      ),
    ).toHaveLength(1);
  });
});

describe("C22 to C25", () => {
  it("C22 warns on near-duplicates in the bank and in the guide", async () => {
    const twin = fxMc({
      id: "fx.p.geo.0104",
      stem: "Which instrument opens the spring festival in Halvessa?",
    });
    const findings = await lint({
      "practice/geography/fx.p.geo.0104.json": twin,
    });
    expect(
      of(findings, "C22", "warn")
        .map((f) => f.itemId)
        .sort(),
    ).toEqual(["fx.p.geo.0101", "fx.p.geo.0104"]);
    const canberra = fxMc({
      id: "fx.p.geo.0105",
      stem: "Which city is the capital of Australia?",
      answer: "Canberra",
      wrong: ["Sydney", "Melbourne", "Perth"],
    });
    const guide = of(
      await lint({ "practice/geography/fx.p.geo.0105.json": canberra }),
      "C22",
    );
    expect(guide.map((f) => f.message)).toEqual([
      expect.stringContaining("the guide's example p.geo.0001"),
    ]);
  });

  it("C23 catches a listed term without ever printing it", async () => {
    const term = "zorblax";
    const reference = (name: string) =>
      JSON.parse(
        readFileSync(join(REPO_ROOT, "content/reference", name), "utf8"),
      ) as unknown;
    const files = fxFiles({
      [MC]: fxMc({
        stem: "Which instrument do the Zorblax players of Halvessa use?",
      }),
      "categories.json": JSON.parse(
        readFileSync(join(REPO_ROOT, "content/categories.json"), "utf8"),
      ) as unknown,
      "reference/stopwords.json": reference("stopwords.json"),
      "reference/spelling.json": reference("spelling.json"),
      "reference/myths.json": reference("myths.json"),
      "reference/slurs.json": {
        version: "2026-10-31",
        note: "test list",
        encoding: "rot13",
        terms: [rot13(term)],
        allowlist: [],
      },
    });
    const findings = of(
      lintBank(await loadFx(files), { today: "2026-10-31" }),
      "C23",
      "error",
    );
    expect(findings).toHaveLength(1);
    const printed =
      JSON.stringify(findings) + formatFinding(findings[0] as Finding, true);
    expect(printed.toLowerCase()).not.toContain(term);
  });

  it("C24 checks the id against the register, the writer and the reserved examples", async () => {
    expect(
      of(
        await lint({ "batches.json": fxRegister({ lastSequence: 0 }) }),
        "C24",
        "error",
      ).length,
    ).toBeGreaterThan(0);
    const planned = fxRegister() as { batches: Record<string, unknown>[] };
    planned.batches[0] = {
      ...planned.batches[0],
      status: "planned",
      writer: null,
      lastSequence: 0,
    };
    expect(
      of(await lint({ "batches.json": planned }), "C24", "error").map(
        (f) => f.message,
      ),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("planned but not open")]),
    );
    expect(
      of(await lint({}, { writer: "w-someone-else" }), "C24", "error").length,
    ).toBeGreaterThan(0);
    expect(
      of(
        await lint({
          "practice/geography/fx.p.geo.0001.json": fxMc({
            id: "fx.p.geo.0001",
          }),
        }),
        "C24",
        "error",
      ).map((f) => f.message),
    ).toEqual(expect.arrayContaining([expect.stringContaining("reserved")]));
    expect(
      of(
        await lint({
          "practice/geography/fx.p.geo.0201.json": fxMc({
            id: "fx.p.geo.0201",
          }),
        }),
        "C24",
        "error",
      ).map((f) => f.message),
    ).toEqual([expect.stringContaining("not in the register")]);
    const bank = await loadContentTree({
      "practice/geography/fx.p.geo.0101.json": fxMc(),
    });
    const contentFindings = of(
      lintBank(bank, { today: "2026-10-31" }),
      "C24",
      "error",
    ).map((f) => f.message);
    expect(contentFindings).toEqual(
      expect.arrayContaining([expect.stringContaining("fx. ids are fixtures")]),
    );
  });

  it("C25 warns when a claim resembles a known myth", async () => {
    const claims = [
      ...fxMc().claims,
      {
        id: "c4",
        role: "explanation" as const,
        risk: "standard" as const,
        text: "Bats are blind, so the festival is held at noon.",
      },
    ];
    expect(
      of(await lint({ [MC]: fxMc({ claims }) }), "C25", "warn"),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [TF]: fxTf({
            stem: "Goldfish remember things for only three seconds.",
          }),
        }),
        "C25",
        "warn",
      ),
    ).toHaveLength(1);
  });
});

describe("pool rules", () => {
  it("X01 and X02 check a mystery's answer type and clue-4 display forms", async () => {
    const sci = await lint({
      [MYS]: undefined,
      "mysteries/fx.m.sci.0101.json": fxMystery({
        category: "sci",
        id: "fx.m.sci.0101",
      }),
    });
    expect(of(sci, "X01", "warn")).toHaveLength(1);
    expect(of(await lint(), "X01")).toHaveLength(0);
    const list = fxCountryList() as { entities: Record<string, unknown>[] };
    list.entities[0] = { ...list.entities[0], display: "Arvenna (isles)" };
    expect(
      of(await lint({ "answer-lists/country.json": list }), "X02", "warn"),
    ).toHaveLength(1);
  });

  it("X03 keeps a batch's true/false items within one of an even split", async () => {
    const tf = (n: number) =>
      fxTf({
        id: `fx.p.geo.01${n}`,
        stem: `Fixture town number ${n} paints every bridge in a new colour each spring.`,
      });
    const findings = await lint({
      "practice/geography/fx.p.geo.0110.json": tf(10),
      "practice/geography/fx.p.geo.0111.json": tf(11),
    });
    expect(of(findings, "X03", "warn")).toHaveLength(1);
  });

  it("X04 and X05 check a pack's 15 questions and its template", async () => {
    const fourteen = fxPack(
      Array.from({ length: 14 }, (_, i) => fxRoomQuestion(i + 1)),
    );
    expect(of(await lint({ [PACK]: fourteen }), "X04", "warn")).toHaveLength(1);
    const hardOpener = fullPack((n) =>
      n === 1 ? { seededDifficulty: 5 } : {},
    );
    expect(
      of(await lint({ [PACK]: hardOpener }), "X05", "warn").length,
    ).toBeGreaterThan(0);
  });

  it("X10 to X14 check the schedule", async () => {
    const schedule = {
      track: "main",
      dailies: [
        {
          date: "2026-12-01",
          rounds: [
            { type: "mystery", difficulty: "hard", contentId: "fx.m.geo.0101" },
            { type: "encore", difficulty: null, contentId: "fx.e.0199" },
          ],
          status: "assembled",
          predictedPoints: 3.2,
          dayCheck: null,
        },
      ],
    };
    const findings = await lint({ "schedule/2026-12.json": schedule });
    expect(of(findings, "X10", "error").map((f) => f.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("not active"),
        expect.stringContaining("names no item"),
      ]),
    );
    expect(of(findings, "X11", "error")).toHaveLength(1);
  });
});

describe("X33: a comparison names its measure when bigger could mean several things (RITE round 2)", () => {
  /** fx.p.food.0106 as round 2 played it: two weights, "Which is bigger?". */
  const loaves = (patch: Record<string, unknown> = {}) =>
    fxComparison({
      stem: "Which is bigger?",
      a: "A harvest loaf",
      b: "A honey bun",
      relation: "larger",
      measure: "mass",
      unit: "g",
      values: { a: 800, b: 120 },
      valueDisplay: { a: "800 g", b: "120 g" },
      ...patch,
    });

  it("R2-15 refuses the bare Which is bigger? that compared two weights", async () => {
    const found = of(await lint({ [CMP]: loaves() }), "X33");
    expect(found).toEqual([
      expect.objectContaining({
        severity: "error",
        itemId: "fx.p.geo.0103",
        path: "stem",
        excerpt: "Which is bigger?",
      }),
    ]);
    expect(found[0]?.message).toContain(
      'a comparison of mass asks a bare "bigger"',
    );
    expect(found[0]?.message).toContain('"Which is heavier?"');
  });

  it("R2-15 refuses every bare size word on a comparison of mass, length or area", async () => {
    const cases = [
      // Mass, length and area by the measure's words.
      { stem: "Which is larger?", measure: "typical weight", unit: "g" },
      { stem: "Which bridge is greater?", measure: "length", unit: "spans" },
      { stem: "Which is smaller?", measure: "total area", unit: "plots" },
      // By the unit alone, from content/reference/units.json's measured lists.
      {
        stem: "Which tower is bigger?",
        measure: "how far it reaches",
        unit: "m",
      },
      { stem: "Which is bigger?", measure: "the whole farm", unit: "km²" },
      { stem: "Which is bigger?", measure: "the full load", unit: "kg" },
    ];
    for (const patch of cases) {
      expect(
        of(await lint({ [CMP]: loaves(patch) }), "X33", "error"),
        patch.stem,
      ).toHaveLength(1);
    }
  });

  it("R2-15 passes a stem that names the measure, and the fixed fx.p.food.0106", async () => {
    const cases = [
      // The fix: "Which is heavier?" under the relation heavier.
      { stem: "Which is heavier?", relation: "heavier" },
      // The real bank's area and diameter stems (p.geo.0137, p.sci.0108).
      { stem: "Which is bigger by area?", measure: "total area", unit: "km²" },
      {
        stem: "Which country is bigger by area?",
        measure: "area",
        unit: "km²",
      },
      { stem: "Which is bigger by diameter?", measure: "diameter", unit: "km" },
      { stem: "Which is larger in area?", measure: "surface area", unit: "m²" },
    ];
    for (const patch of cases) {
      expect(
        of(await lint({ [CMP]: loaves(patch) }), "X33"),
        patch.stem,
      ).toEqual([]);
    }
  });

  it("R2-15 leaves other measures and other formats to their own rules", async () => {
    // Not mass, length or area: "bigger" there is C17's stem check, if any.
    for (const patch of [
      { measure: "population", unit: "people" },
      { measure: "speed", unit: "km/h" },
      {
        measure: "year it happened",
        unit: "year",
        values: { a: 1204, b: 1388 },
      },
    ]) {
      expect(
        of(await lint({ [CMP]: loaves(patch) }), "X33"),
        patch.measure,
      ).toEqual([]);
    }
    // A multiple-choice stem may say bigger: its options carry the measure.
    const mc = fxMc({ stem: "Which fixture loaf is bigger than a honey bun?" });
    expect(of(await lint({ [MC]: mc }), "X33")).toEqual([]);
  });

  it("R2-15 is an error no lintAllow waives: a stem can always name its measure", async () => {
    const waived = loaves({
      lintAllow: [
        {
          rule: "X33",
          text: "Which is bigger?",
          reason: "Both are loaves, so bigger means heavier.",
        },
      ],
    });
    expect(of(await lint({ [CMP]: waived }), "X33", "error")).toHaveLength(1);
  });
});

describe("X34: where a pool's ascending keys sit (RITE round 2)", () => {
  /** An ascending item, fx.p.geo.01<n>, whose key sorts to `position` (0 for A) of `count`. */
  const ascending = (n: number, position: number, count = 4): McItem => {
    const values = Array.from({ length: count }, (_, i) => String(n * 10 + i));
    return fxMc({
      id: `fx.p.geo.01${n}`,
      stem: `How many bells ring in fixture tower number ${n}?`,
      answer: values[position] as string,
      wrong: values.filter((_, i) => i !== position),
      order: "ascending",
    });
  };
  /** The files for ascending items 10, 11, ... with their keys at `positions`. */
  const pool = (positions: readonly number[], count = 4): FxFiles =>
    Object.fromEntries(
      positions.map((position, i) => [
        `practice/geography/fx.p.geo.01${10 + i}.json`,
        ascending(10 + i, position, count),
      ]),
    );

  it("R2-23 warns when the key sits second in 5 of 7 ascending items, as round 2's fixtures had it, and names them", async () => {
    // B, B, A, B, B, C, B: Dee's tally came from a pool like this.
    const found = of(await lint(pool([1, 1, 0, 1, 1, 2, 1])), "X34");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: "warn", sealed: false });
    expect(found[0]?.file).toMatch(/practice$/);
    expect(found[0]?.message).toContain(
      "practice: 5 of 7 ascending keys sit at B (71%)",
    );
    expect(found[0]?.message).toContain(
      "fx.p.geo.0110, fx.p.geo.0111, fx.p.geo.0113, fx.p.geo.0114, fx.p.geo.0116",
    );
  });

  it("R2-23 passes a spread with no position above 40%, as the respread fixtures are", async () => {
    // Two, two, two and one of seven: 29% at most.
    expect(of(await lint(pool([0, 1, 2, 3, 0, 1, 2])), "X34")).toEqual([]);
    // Exactly 40% is allowed: 2 of 5, and 4 of 10.
    expect(of(await lint(pool([1, 1, 0, 2, 3])), "X34")).toEqual([]);
    expect(of(await lint(pool([0, 0, 0, 0, 1, 1, 2, 2, 3, 3])), "X34")).toEqual(
      [],
    );
    // One more and it warns: 5 of 10.
    expect(
      of(await lint(pool([0, 0, 0, 0, 0, 1, 2, 2, 3, 3])), "X34", "warn"),
    ).toHaveLength(1);
  });

  it("R2-23 waits for 5 ascending keys, and never asks for a spread no pool could have", async () => {
    // Four keys, all at B: too few to say anything.
    expect(of(await lint(pool([1, 1, 1, 1])), "X34")).toEqual([]);
    // Seven three-option keys can't all stay at 40% (2.8): three may share one.
    expect(of(await lint(pool([0, 0, 0, 1, 1, 2, 2], 3)), "X34")).toEqual([]);
    expect(
      of(await lint(pool([0, 0, 0, 0, 1, 1, 2], 3)), "X34", "warn"),
    ).toHaveLength(1);
  });

  it("R2-23 reads a sealed pool without naming its items: a key's place beside sorted options is the key", async () => {
    const pack = fullPack((n) => {
      if (n > 7) return {};
      // Room questions 1 to 7, ascending, with 5 keys at C.
      const at = [2, 2, 2, 0, 2, 1, 2][n - 1] ?? 0;
      const values = ["10", "20", "30", "40"];
      return {
        stem: `How many lanterns hang on fixture bridge number ${n}?`,
        answer: values[at],
        wrong: values.filter((_, i) => i !== at),
        order: "ascending",
      };
    });
    const found = of(await lint({ [PACK]: pack }), "X34");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: "warn", sealed: true });
    expect(found[0]?.message).toContain(
      "room: 5 of 7 ascending keys sit at C (71%)",
    );
    expect(found[0]?.message).not.toMatch(/fx\.r\./);
  });

  it("R2-23 counts what a content tree ships: its active items, never drafts", async () => {
    const drafts = await loadContentTree({
      "answer-lists/country.json": fxCountryList(),
      ...pool([1, 1, 1, 1, 1, 1, 1]),
    });
    expect(
      of(lintBank(drafts, { today: "2026-10-31", dedupe: false }), "X34"),
    ).toEqual([]);
  });
});

/** fx.p.geo.0101 taken to active the proper way: A, B, the estimate, accept. */
async function activeMc(): Promise<McItem> {
  const bank = await loadFx();
  const record = itemOf(bank, "fx.p.geo.0101");
  let item: AnyItem = record.item;
  for (const pass of ["A", "B"] as const)
    item = mergeRecord(item, fxRecord(bank, record, pass), pass, false).item;
  item = {
    ...item,
    predicted: { p: 0.7, spread: 0.3, estimator: "v0" },
    status: "checking",
  } as AnyItem;
  await saveItems(bank, new Map([[record.id, item]]));
  const { outcome, item: active } = decideOne(
    bank,
    requireBatch(bank, "p.geo.b01"),
    itemOf(bank, record.id),
    {
      itemId: record.id,
      editor: EDITOR,
      decision: "accept",
      reason: "Both checks pass.",
      decidedAt: "2026-11-03T09:00:00Z",
    },
    { now: "2026-11-03T09:00:00Z" },
  );
  expect(outcome.errors).toEqual([]);
  return active as McItem;
}

describe("active items must pass the acceptance rule in content:check (§9.9)", () => {
  it("passes an item that went active through the tools", async () => {
    expect(of(await lint({ [MC]: await activeMc() }), "C01")).toEqual([]);
  });

  it("fails a hand-written active item whose checks are by the writer's own run", async () => {
    const active = await activeMc();
    const v = active.verification;
    if (!v?.editor || !v.dedupe || !v.lint) throw new Error("not accepted");
    // The reviewer's repro: both checks by the writer's run, the editor too,
    // a duplicate, a failed lint, c3 without evidence and the key swapped.
    const forged = {
      ...active,
      answer: "Reed pipe",
      wrong: ["Brass horn", "Hand drum", "Bone flute"],
      verification: {
        ...v,
        checks: v.checks.map((check) => ({
          ...check,
          checker: "fc-fx-writer",
          claimResults: check.claimResults.map((result) =>
            result.claimId === "c3"
              ? {
                  ...result,
                  method: "knowledge" as const,
                  evidence: {
                    kind: "knowledge" as const,
                    basis: "reference" as const,
                    restatement: "r",
                    confidence: "certain" as const,
                  },
                }
              : result,
          ),
        })),
        editor: { ...v.editor, editor: "ed-fx-writer" },
        dedupe: { ...v.dedupe, verdict: "duplicate" as const },
        lint: { ...v.lint, passed: false },
      },
    };
    const messages = of(await lint({ [MC]: forged }), "C01", "error")
      .filter((f) => f.itemId === "fx.p.geo.0101")
      .map((f) => f.message);
    for (const expected of [
      "passes A and B were done by the same checker",
      "pass A checker fc-fx-writer is the writer",
      "the editor ed-fx-writer wrote this batch",
      "high-risk claim c3 has no dataset, web or calculation evidence",
      "the lint has errors",
      "dedupe verdict is duplicate",
      "the item changed after pass A was recorded",
      "the item changed after pass B was recorded",
    ]) {
      expect(messages, expected).toEqual(
        expect.arrayContaining([expect.stringContaining(expected)]),
      );
    }
  });

  it("recomputes myth clearance instead of trusting the file", async () => {
    const active = await activeMc();
    const claims = [
      ...active.claims,
      {
        id: "c4",
        role: "explanation" as const,
        risk: "standard" as const,
        text: "Bats are blind, so the festival is held at noon.",
      },
    ];
    // Even with matching packet hashes and a stored "clean" screen, a claim
    // that resembles a myth and has no external evidence fails.
    const findings = await lint({ [MC]: { ...active, claims } });
    expect(of(findings, "C01").map((f) => f.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("myths screen not clean (claims c4"),
      ]),
    );
  });
});

describe("review findings: rules the lint used to miss", () => {
  it("C03: an mc or room stem ends with ?, and an encore question has 120 characters or fewer", async () => {
    expect(
      of(
        await lint({
          [MC]: fxMc({ stem: "Name the instrument of Halvessa." }),
        }),
        "C03",
        "error",
      ),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [PACK]: fullPack((n) =>
            n === 4 ? { stem: "Name the fixture square." } : {},
          ),
        }),
        "C03",
        "error",
      ),
    ).toHaveLength(1);
    const question = `How many steps lead up to the fixture lighthouse of Gorlund ${"and beyond ".repeat(10)}?`;
    expect(
      of(await lint({ [ENC]: fxEncore({ question }) }), "C03", "error"),
    ).toHaveLength(1);
  });

  it("C04: comparison labels have 40 characters or fewer", async () => {
    const a = "The Brindle Tower on the hill above the old harbour";
    expect(
      of(await lint({ [CMP]: fxComparison({ a }) }), "C04", "error").map(
        (f) => f.path,
      ),
    ).toEqual(["a"]);
  });

  it("C11: single-asterisk and underscore emphasis is Markdown", async () => {
    for (const explanation of [
      "Its players carve a *heron* bone, a custom from 1204.",
      "Its players carve a _heron_ bone, a custom from 1204.",
    ]) {
      expect(
        of(await lint({ [MC]: fxMc({ explanation }) }), "C11", "error"),
        explanation,
      ).toHaveLength(1);
    }
    expect(
      of(
        await lint({
          [MC]: fxMc({ explanation: "Two flutes times 3 * 4 players is 24." }),
        }),
        "C11",
      ),
    ).toHaveLength(0);
  });

  it("C14: a replaced list entry counts as retired", async () => {
    const list = fxCountryList() as { entities: Record<string, unknown>[] };
    list.entities[1] = {
      ...list.entities[1],
      replacedBy: countryId("Arvenna"),
    };
    expect(
      of(await lint({ "answer-lists/country.json": list }), "C14", "error").map(
        (f) => f.path,
      ),
    ).toEqual(expect.arrayContaining(["distractors[0]"]));
  });

  it("C15: a derivation reproduces unrounded and rounds inside the bullseye; unit forms fit the kind", async () => {
    const claims = [
      ...fxEncore().claims,
      {
        id: "c3",
        role: "input" as const,
        risk: "high" as const,
        riskReason: "number" as const,
        text: "Each flight has 53 steps.",
      },
    ];
    const derivation = (patch: Record<string, unknown>) =>
      fxEncore({
        claims,
        derivation: {
          formula: "4 × 53",
          inputs: [
            { claimId: "c3", value: 53, unit: "steps", what: "a flight" },
          ],
          unrounded: 212,
          rounding: "none",
          ...patch,
        },
      });
    expect(of(await lint({ [ENC]: derivation({}) }), "C15")).toHaveLength(0);
    for (const patch of [
      { formula: "4 × 54" },
      { unrounded: 230, formula: "230" },
      { unrounded: 240, formula: "240", rounding: "nearest ten" },
    ]) {
      expect(
        of(await lint({ [ENC]: derivation(patch) }), "C15", "error").length,
        JSON.stringify(patch),
      ).toBeGreaterThan(0);
    }
    // A formula in words is not evaluated.
    expect(
      of(
        await lint({
          [ENC]: derivation({
            formula: "four flights of 53 steps",
            unrounded: 212.4,
            rounding: "nearest step",
          }),
        }),
        "C15",
      ),
    ).toHaveLength(0);
    expect(
      of(
        await lint({
          [ENC]: fxEncore({
            valueKind: "year",
            answer: 1890,
            unit: "",
            unitShort: "yr",
            unitLabel: "",
          }),
        }),
        "C15",
        "error",
      ).map((f) => f.path),
    ).toEqual(["unitShort"]);
  });

  it("X08: an item without an explanation claim warns, and a lintAllow clears it", async () => {
    const claims = fxMc().claims.filter((c) => c.role !== "explanation");
    expect(
      of(await lint({ [MC]: fxMc({ claims }) }), "X08", "warn"),
    ).toHaveLength(1);
    expect(
      of(
        await lint({
          [MC]: fxMc({
            claims,
            lintAllow: [
              {
                rule: "X08",
                text: "-",
                reason: "The explanation shows a method.",
              },
            ],
          }),
        }),
        "X08",
      ),
    ).toHaveLength(0);
  });

  it("X09: a shipped list over 80 kB gzipped is an error", async () => {
    const base = fxCountryList() as { entities: Record<string, unknown>[] };
    const big = {
      ...base,
      entities: [
        ...base.entities,
        ...Array.from({ length: 3000 }, (_, i) => {
          const noise = createHash("sha256").update(String(i)).digest("hex");
          return {
            ...base.entities[0],
            id: `fx.x.country.n${noise.slice(0, 24)}`,
            name: `N${noise}`,
            display: `D${noise.slice(8)}`,
            aliases: [`A${noise.slice(16)}`],
          };
        }),
      ],
    };
    expect(
      of(await lint({ "answer-lists/country.json": big }), "X09", "error"),
    ).toHaveLength(1);
    expect(of(await lint(), "X09")).toHaveLength(0);
  });

  it("X10: mc, tf and comparison rounds name choice items of that format; choice is no round type", async () => {
    const daily = (type: string, contentId: string) => ({
      track: "main",
      dailies: [
        {
          date: "2026-12-01",
          rounds: [{ type, difficulty: "easy", contentId }],
          status: "assembled",
          predictedPoints: 3,
          dayCheck: null,
        },
      ],
    });
    const x10 = async (type: string, contentId: string) =>
      of(
        await lint({
          [PACK]: fullPack(),
          "schedule/2026-12.json": daily(type, contentId),
        }),
        "X10",
      ).map((f) => f.message);
    expect(await x10("mc", "fx.r.fx-party.01")).toEqual([
      expect.stringContaining("not active"),
    ]);
    expect(await x10("tf", "fx.r.fx-party.01")).toEqual(
      expect.arrayContaining([
        expect.stringContaining("mc choice item in a tf round"),
      ]),
    );
    expect(await x10("mystery", "fx.e.0101")).toEqual(
      expect.arrayContaining([
        expect.stringContaining("encore item in a mystery round"),
      ]),
    );
    const choice = await lint({
      "schedule/2026-12.json": daily("choice", "fx.e.0101"),
    });
    expect(of(choice, "C01").length).toBeGreaterThan(0);
  });

  it("bands encores by predicted pClose (§8.4)", () => {
    const encore = (pClose: number) =>
      fxEncore({
        seededDifficulty: 1,
        predicted: { pClose, pExact: 0.01, spread: 0.3, estimator: "v0" },
      });
    expect([0.6, 0.3, 0.1].map((p) => bandOf(encore(p)))).toEqual([
      "easy",
      "medium",
      "hard",
    ]);
  });

  it("flags files under content/ that sit outside the layout", async () => {
    const bank = await loadContentTree({
      "mysteries/m.geo.0101.json": { id: "m.geo.0101", kind: "mystery" },
      "notes/packet-copy.json": { stage: "reveal", items: [] },
    });
    const strays = of(lintBank(bank, { today: "2026-10-31" }), "C01")
      .filter((f) => f.message.includes("outside the content layout"))
      .map((f) => f.file.split("/").slice(-2).join("/"));
    expect(strays.sort()).toEqual([
      "mysteries/m.geo.0101.json",
      "notes/packet-copy.json",
    ]);
  });
});

describe("C22 across the seal (ARCHITECTURE §5.4)", () => {
  const twin = {
    "practice/geography/fx.p.geo.0104.json": fxMc({
      id: "fx.p.geo.0104",
      stem: "Which fixture country flies a silver heron above three blue waves?",
      answer: "Arvenna",
      wrong: ["Belloria", "Cassova", "Dravenor"],
    }),
  };

  it("names neither side without --reveal, and both with it", async () => {
    const hidden = of(await lint(twin), "C22");
    expect(hidden.map((f) => f.itemId)).toEqual(["fx.m.geo.0101"]);
    expect(hidden[0]?.message).toContain("near-duplicate of a public item");
    const line = formatFinding(hidden[0] as Finding, false);
    expect(line).not.toContain("fx.p.geo.0104");
    expect(line).not.toMatch(/\d\.\d\d/);

    const shown = of(
      lintBank(await loadFx(fxFiles(twin)), {
        today: "2026-10-31",
        reveal: true,
      }),
      "C22",
    );
    expect(
      shown.map((f) => [f.itemId, f.message.includes("same answer")]),
    ).toEqual([
      ["fx.m.geo.0101", true],
      ["fx.p.geo.0104", true],
    ]);
  });
});

describe("reporting", () => {
  it("never shows excerpts of sealed content unless asked", async () => {
    const findings = await lint({
      [MYS]: fxMystery({
        clues: [
          "Arvenna flies a heron flag.",
          ...fxMystery().clues.slice(1),
        ] as [string, string, string, string],
      }),
    });
    const finding = of(findings, "C12")[0] as Finding;
    expect(finding.sealed).toBe(true);
    expect(formatFinding(finding, false)).not.toContain("arvenna");
    expect(formatFinding(finding, true)).toContain("arvenna");
  });
});
