// @vitest-environment node
/**
 * The content lint, rule for rule (CONTENT_GUIDE §2.13, ARCHITECTURE §5.2,
 * CNT-2's acceptance): a positive and a negative fixture for every rule from
 * C01 to C28, run through `lintBank` in scripts/content/lint.ts, the entry
 * point content:check, content:build and the packet builder use. Each pair
 * is a minimal one: the negative fixture changes one thing in the positive
 * one, and only the negative fixture draws the rule.
 *
 * Every name, place and number is invented (the fixture realm of Arvenna),
 * except where a rule is about the real world: C27's countries come from
 * content/reference/capitals-excluded.json.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { Encore, McItem } from "../../../src/content/schema/items.ts";
import {
  REPO_ROOT,
  countryId,
  fxComparison,
  fxCountryList,
  fxEncore,
  fxFiles,
  fxMc,
  fxMystery,
  fxTf,
  loadContentTree,
  loadFx,
  removeTempDirs,
  type FxFiles,
} from "../../../src/content/pipeline/__fixtures__/builders.ts";
import { rot13 } from "../../../src/content/pipeline/text.ts";
import { RULES, lintBank, type Finding } from "../lint.ts";
import { REFERENCE_FILES } from "./reference.ts";

afterAll(removeTempDirs);

const TODAY = "2026-11-04";
const MC = "practice/geography/fx.p.geo.0101.json";
const TF = "practice/geography/fx.p.geo.0102.json";
const CMP = "practice/geography/fx.p.geo.0103.json";
const MYS = "mysteries/fx.m.geo.0101.json";
const ENC = "encores/fx.e.0101.json";

type Json = Record<string, unknown>;
type Tree = "fixtures" | "content";

/** The repository's reference files, for a tree that brings its own folder. */
function references(overrides: Record<string, unknown> = {}): FxFiles {
  const out: FxFiles = {};
  for (const spec of REFERENCE_FILES) {
    out[`reference/${spec.name}`] =
      overrides[spec.name] ??
      (JSON.parse(
        readFileSync(join(REPO_ROOT, "content/reference", spec.name), "utf8"),
      ) as unknown);
  }
  return out;
}

/** An fx. id, or a file named by one, as a content tree spells it. */
const plain = (id: string) => id.replace(/fx\.(?=[pmer]\.)/, "");

/**
 * The same bank as a content tree: plain ids, sealed kinds in the plaintext
 * workspace. C26 skips fixture trees (their claims are never checked), so
 * its fixtures live here.
 */
function asContent(files: FxFiles): FxFiles {
  const out: FxFiles = {};
  for (const [path, value] of Object.entries(files)) {
    if (value === undefined) continue;
    const sealed = /^(mysteries|encores|room-packs|schedule|spares)\//.test(
      path,
    );
    const target = (sealed ? `.sealed-plain/${path}` : path).replace(
      /fx\.(?=[pme]\.)/,
      "",
    );
    out[target] = JSON.parse(
      JSON.stringify(value).replace(/"fx\.([a-z])/g, '"$1'),
    ) as unknown;
  }
  return out;
}

async function lint(
  files: FxFiles,
  options: { tree?: Tree; dedupe?: boolean; launch?: boolean } = {},
): Promise<Finding[]> {
  const bank =
    options.tree === "content"
      ? await loadContentTree(asContent(files))
      : await loadFx(files);
  return lintBank(bank, {
    today: TODAY,
    dedupe: options.dedupe === true,
    launch: options.launch === true,
  });
}

/** The findings of one rule about one file, as "severity rule". */
function drawn(findings: Finding[], rule: string, file: string): string[] {
  const target = plain(file);
  return findings
    .filter(
      (finding) =>
        finding.rule === rule &&
        (finding.file.endsWith(file) || finding.file.endsWith(target)),
    )
    .map((finding) => `${finding.severity} ${finding.rule}`);
}

const words = (n: number) =>
  `${Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "reed" : "pipes")).join(" ")}.`;

/** An mc stem of exactly `length` characters, ending with a question mark. */
function stemOf(length: number): string {
  const base = "Which instrument opens the spring festival in Halvessa";
  return `${base} ${"a".repeat(length - base.length - 2)}?`;
}

const allStandard = (item: McItem) =>
  item.claims.map(({ riskReason: _reason, ...claim }) => ({
    ...claim,
    risk: "standard" as const,
  }));

const measured = (id: string): Encore =>
  fxEncore({
    id,
    question: `How far does the fixture ferry ${id.slice(-1)} of Gorlund sail each day?`,
    unit: "km",
    unitShort: "km",
    unitLabel: "km",
  });

/** A near-tie of years (§2.6): exact days a year or more apart. */
function nearTie(
  exactDates: { a: string; b: string } | undefined,
  claimDays: { a: string; b: string } = {
    a: "5 October 1962",
    b: "23 November 1963",
  },
) {
  return fxComparison({
    stem: "Which came first?",
    a: "The Gorlund light is lit",
    b: "The Cindral bridge opens",
    answer: "a",
    relation: "earlier",
    measure: "date it happened",
    unit: "year",
    values: { a: 1962, b: 1963 },
    valueDisplay: { a: "in 1962", b: "in 1963" },
    ...(exactDates ? { exactDates } : {}),
    claims: [
      {
        id: "c1",
        role: "label",
        ref: "a",
        risk: "high",
        riskReason: "date",
        text: `The Gorlund light was first lit on ${claimDays.a}.`,
      },
      {
        id: "c2",
        role: "label",
        ref: "b",
        risk: "high",
        riskReason: "date",
        text: `The Cindral bridge opened on ${claimDays.b}.`,
      },
      {
        id: "c3",
        role: "explanation",
        risk: "standard",
        text: "The Gorlund light guided ferries before the bridge.",
      },
    ],
  });
}

interface RuleCase {
  rule: string;
  /** What the negative fixture breaks, for the test title. */
  breaks: string;
  severity: "error" | "warn";
  file: string;
  positive: FxFiles;
  negative: FxFiles;
  tree?: Tree;
  dedupe?: boolean;
}

const slurTerm = "zorblax";
const slurList = {
  version: "2026-11-04",
  note: "test list",
  encoding: "rot13",
  terms: [rot13(slurTerm)],
  allowlist: [],
};

const base = fxMystery();
const CASES: RuleCase[] = [
  {
    rule: "C01",
    breaks: "an unknown key fails the source schema",
    severity: "error",
    file: MC,
    positive: fxFiles(),
    negative: fxFiles({ [MC]: { ...fxMc(), colour: "red" } }),
  },
  {
    rule: "C02",
    breaks: "an explanation of 36 words",
    severity: "error",
    file: MC,
    positive: fxFiles({ [MC]: fxMc({ explanation: words(35) }) }),
    negative: fxFiles({ [MC]: fxMc({ explanation: words(36) }) }),
  },
  {
    rule: "C03",
    breaks: "a stem of 121 characters",
    severity: "error",
    file: MC,
    positive: fxFiles({ [MC]: fxMc({ stem: stemOf(120) }) }),
    negative: fxFiles({ [MC]: fxMc({ stem: stemOf(121) }) }),
  },
  {
    rule: "C04",
    breaks: "an option of 61 characters",
    severity: "error",
    file: MC,
    positive: fxFiles(),
    negative: fxFiles({
      [MC]: fxMc({
        wrong: ["Brass horn", "Hand drum", `Reed pipe ${"r".repeat(51)}`],
      }),
    }),
  },
  {
    rule: "C05",
    breaks: "'None of the above' as an option",
    severity: "error",
    file: MC,
    positive: fxFiles(),
    negative: fxFiles({
      [MC]: fxMc({ wrong: ["Brass horn", "Hand drum", "None of the above"] }),
    }),
  },
  {
    rule: "C06",
    breaks: "a negative word in the stem",
    severity: "error",
    file: MC,
    positive: fxFiles(),
    negative: fxFiles({
      [MC]: fxMc({
        stem: "Which instrument never opens the spring festival in Halvessa?",
      }),
    }),
  },
  {
    rule: "C07",
    breaks: "a key much longer than every other option",
    severity: "error",
    file: MC,
    positive: fxFiles(),
    negative: fxFiles({
      [MC]: fxMc({ answer: "Bone flute carved from a heron wing" }),
    }),
  },
  {
    rule: "C08",
    breaks: "a numeric date",
    severity: "error",
    file: MC,
    positive: fxFiles({
      [MC]: fxMc({
        explanation: "Halvessa first heard the bone flute on 3 April 1204.",
      }),
    }),
    negative: fxFiles({
      [MC]: fxMc({
        explanation: "Halvessa first heard the bone flute on 03/04/1204.",
      }),
    }),
  },
  {
    rule: "C09",
    breaks: "a time word in the stem",
    severity: "error",
    file: MC,
    positive: fxFiles(),
    negative: fxFiles({
      [MC]: fxMc({
        stem: "Which instrument currently opens the spring festival in Halvessa?",
      }),
    }),
  },
  {
    rule: "C10",
    breaks: "a US spelling",
    severity: "warn",
    file: MC,
    positive: fxFiles({
      [MC]: fxMc({
        explanation:
          "Halvessan players paint the bone flute the colour of the sea.",
      }),
    }),
    negative: fxFiles({
      [MC]: fxMc({
        explanation:
          "Halvessan players paint the bone flute the color of the sea.",
      }),
    }),
  },
  {
    rule: "C11",
    breaks: "an em dash",
    severity: "error",
    file: MC,
    positive: fxFiles({
      [MC]: fxMc({
        explanation:
          "The flute is carved from heron bone - a custom from 1204.",
      }),
    }),
    negative: fxFiles({
      [MC]: fxMc({
        explanation:
          "The flute is carved from heron bone — a custom from 1204.",
      }),
    }),
  },
  {
    rule: "C12",
    breaks: "a clue that names the answer",
    severity: "error",
    file: MYS,
    positive: fxFiles(),
    negative: fxFiles({
      [MYS]: fxMystery({
        clues: [
          "Arvenna flies a silver heron above three blue waves.",
          base.clues[1],
          base.clues[2],
          base.clues[3],
        ],
      }),
    }),
  },
  {
    rule: "C13",
    breaks: "clue 4 holding a word of the answer's display form",
    severity: "error",
    file: MYS,
    positive: fxFiles(),
    negative: fxFiles({
      [MYS]: fxMystery({
        clues: [
          base.clues[0],
          base.clues[1],
          base.clues[2],
          "Arvenna is the home of the seven bridges of Cindral.",
        ],
      }),
    }),
  },
  {
    rule: "C14",
    breaks: "an answer the list doesn't hold",
    severity: "error",
    file: MYS,
    positive: fxFiles(),
    negative: fxFiles({ [MYS]: fxMystery({ answer: countryId("Nowhere") }) }),
  },
  {
    rule: "C15",
    breaks: "an answer with more decimals than the encore allows",
    severity: "error",
    file: ENC,
    positive: fxFiles(),
    negative: fxFiles({ [ENC]: fxEncore({ answer: 212.5 }) }),
  },
  {
    rule: "C16",
    breaks: "a myth whose answer is true",
    severity: "error",
    file: TF,
    positive: fxFiles(),
    negative: fxFiles({
      [TF]: fxTf({ tfKind: "myth", counterintuitive: false }),
    }),
  },
  {
    rule: "C17",
    breaks: "an answer that loses under its relation",
    severity: "error",
    file: CMP,
    positive: fxFiles(),
    negative: fxFiles({ [CMP]: fxComparison({ answer: "b" }) }),
  },
  {
    rule: "C18",
    breaks: "a duplicate option",
    severity: "error",
    file: MC,
    positive: fxFiles(),
    negative: fxFiles({
      [MC]: fxMc({ wrong: ["Brass horn", "Hand drum", "bone  flute"] }),
    }),
  },
  {
    rule: "C19",
    breaks: "a superlative with no high-risk claim behind it",
    severity: "warn",
    file: MC,
    positive: fxFiles({
      [MC]: fxMc({
        stem: "Which is the oldest instrument at the spring festival in Halvessa?",
      }),
    }),
    negative: fxFiles({
      [MC]: fxMc({
        stem: "Which is the oldest instrument at the spring festival in Halvessa?",
        claims: allStandard(fxMc()),
      }),
    }),
  },
  {
    rule: "C20",
    breaks: "the bare word football",
    severity: "warn",
    file: MC,
    positive: fxFiles({
      [MC]: fxMc({
        explanation:
          "Halvessa plays the bone flute before every football (soccer) match.",
      }),
    }),
    negative: fxFiles({
      [MC]: fxMc({
        explanation:
          "Halvessa plays the bone flute before every football match.",
      }),
    }),
  },
  {
    rule: "C21",
    breaks: "an ambiguous unit as an encore's unit",
    severity: "error",
    file: ENC,
    positive: fxFiles(),
    negative: fxFiles({
      [ENC]: fxEncore({ unit: "tons", unitShort: "tons", unitLabel: "tons" }),
    }),
  },
  {
    rule: "C22",
    breaks: "a near-copy of another item",
    severity: "warn",
    file: "practice/geography/fx.p.geo.0104.json",
    positive: fxFiles({
      "practice/geography/fx.p.geo.0104.json": fxMc({
        id: "fx.p.geo.0104",
        stem: "Which bird nests along the fixture river Vellum each spring?",
        answer: "Grey heron",
        wrong: ["Black stork", "White egret", "Little grebe"],
        explanation:
          "The herons return in March and leave once the reeds turn brown.",
        learnMore: "Vellum herons (fixture)",
        claims: [
          {
            id: "c1",
            role: "key",
            risk: "standard",
            text: "Grey herons nest along the Vellum.",
          },
        ],
      }),
    }),
    negative: fxFiles({
      "practice/geography/fx.p.geo.0104.json": fxMc({ id: "fx.p.geo.0104" }),
    }),
    dedupe: true,
  },
  {
    rule: "C23",
    breaks: "a term on the shared slur list",
    severity: "error",
    file: MC,
    positive: fxFiles({ ...references({ "slurs.json": slurList }) }),
    negative: fxFiles({
      ...references({ "slurs.json": slurList }),
      [MC]: fxMc({
        stem: "Which instrument do the Zorblax players of Halvessa use?",
      }),
    }),
  },
  {
    rule: "C24",
    breaks: "an id from a batch nobody opened",
    severity: "error",
    file: "practice/geography/fx.p.geo.0901.json",
    positive: fxFiles({
      "practice/geography/fx.p.geo.0104.json": {
        ...fxTf(),
        id: "fx.p.geo.0104",
      },
    }),
    negative: fxFiles({
      "practice/geography/fx.p.geo.0901.json": {
        ...fxTf(),
        id: "fx.p.geo.0901",
      },
    }),
  },
  {
    rule: "C25",
    breaks: "a claim that resembles a known myth",
    severity: "warn",
    file: TF,
    positive: fxFiles(),
    negative: fxFiles({
      [TF]: fxTf({
        claims: [
          ...fxTf().claims,
          {
            id: "c3",
            role: "explanation",
            risk: "standard",
            text: "Bats in Istrova are blind.",
          },
        ],
      }),
    }),
  },
  {
    rule: "C26",
    breaks: "a claim with a number marked standard",
    severity: "warn",
    file: MC,
    tree: "content",
    positive: fxFiles({
      [MC]: fxMc({
        claims: [
          {
            id: "c1",
            role: "key",
            risk: "high",
            riskReason: "number",
            text: "A bone flute with 7 holes opens the Halvessa spring festival.",
          },
          ...fxMc().claims.slice(1),
        ],
      }),
    }),
    negative: fxFiles({
      [MC]: fxMc({
        claims: [
          {
            id: "c1",
            role: "key",
            risk: "standard",
            text: "A bone flute with 7 holes opens the Halvessa spring festival.",
          },
          ...fxMc().claims.slice(1),
        ],
      }),
    }),
  },
  {
    rule: "C27",
    breaks: "'capital' beside a country with no settled capital",
    severity: "error",
    file: MC,
    positive: fxFiles({
      [MC]: fxMc({
        stem: "Which instrument opens the spring festival in the capital of Halvessa?",
      }),
    }),
    negative: fxFiles({
      [MC]: fxMc({
        stem: "Which instrument opens the spring festival in the capital of Germany?",
      }),
    }),
  },
  {
    rule: "C28",
    breaks: "the answer as the only clue-4 option with a bracket",
    severity: "error",
    file: MYS,
    positive: fxFiles(),
    negative: fxFiles({
      "answer-lists/country.json": (() => {
        const list = fxCountryList() as { entities: Json[] };
        const [first, ...rest] = list.entities;
        return {
          ...list,
          entities: [{ ...first, display: "Arvenna (Republic)" }, ...rest],
        };
      })(),
    }),
  },
];

describe("the content lint, rule for rule (CONTENT_GUIDE §2.13)", () => {
  it("has a positive and a negative fixture for every rule from C01 to C28", () => {
    const rules = Array.from(
      { length: 28 },
      (_, i) => `C${String(i + 1).padStart(2, "0")}`,
    );
    expect(CASES.map((c) => c.rule)).toEqual(rules);
    for (const rule of rules) expect(RULES[rule], rule).toBeDefined();
  });

  for (const c of CASES) {
    it(`${c.rule}: the positive fixture passes, and ${c.breaks} fails`, async () => {
      const options = {
        ...(c.tree ? { tree: c.tree } : {}),
        ...(c.dedupe ? { dedupe: true } : {}),
      };
      const positive = await lint(c.positive, options);
      expect(drawn(positive, c.rule, c.file)).toEqual([]);
      const negative = await lint(c.negative, options);
      expect(drawn(negative, c.rule, c.file)).toContain(
        `${c.severity} ${c.rule}`,
      );
    });
  }
});

describe("CNT-2's additions to older rules", () => {
  it("C04 warns from 24 characters, where the desktop grid stops", async () => {
    const option = (length: number) =>
      fxFiles({
        [MC]: fxMc({
          wrong: ["Brass horn", "Hand drum", "Reed pipe".padEnd(length, "s")],
        }),
      });
    expect(drawn(await lint(option(23)), "C04", MC)).toEqual([]);
    expect(drawn(await lint(option(24)), "C04", MC)).toEqual(["warn C04"]);
    expect(drawn(await lint(option(25)), "C04", MC)).toEqual(["warn C04"]);
  });

  it("C15 counts measured encores: one per ten in a batch, the later ids reported", async () => {
    const one = await lint(fxFiles({ [ENC]: measured("fx.e.0101") }));
    expect(drawn(one, "C15", ENC)).toEqual([]);
    const two = await lint(
      fxFiles({
        [ENC]: measured("fx.e.0101"),
        "encores/fx.e.0102.json": measured("fx.e.0102"),
      }),
    );
    expect(drawn(two, "C15", ENC)).toEqual([]);
    expect(drawn(two, "C15", "encores/fx.e.0102.json")).toEqual(["error C15"]);
    // A cut encore no longer counts.
    const cut = await lint(
      fxFiles({
        [ENC]: { ...measured("fx.e.0101"), status: "cut" },
        "encores/fx.e.0102.json": measured("fx.e.0102"),
      }),
    );
    expect(drawn(cut, "C15", "encores/fx.e.0102.json")).toEqual([]);
  });

  it("C17 reads exactDates: exact days a year apart pass, closer days or a claim without its day fail", async () => {
    const passing = await lint(
      fxFiles({ [CMP]: nearTie({ a: "1962-10-05", b: "1963-11-23" }) }),
    );
    expect(drawn(passing, "C17", CMP)).toEqual([]);
    // Without exactDates the near-tie stays refused, as before.
    const missing = await lint(fxFiles({ [CMP]: nearTie(undefined) }));
    expect(drawn(missing, "C17", CMP)).toEqual(["error C17"]);
    const close = await lint(
      fxFiles({
        [CMP]: nearTie(
          { a: "1962-10-05", b: "1963-02-01" },
          { a: "5 October 1962", b: "1 February 1963" },
        ),
      }),
    );
    expect(drawn(close, "C17", CMP)).toContain("error C17");
    const unstated = await lint(
      fxFiles({
        [CMP]: nearTie(
          { a: "1962-10-05", b: "1963-11-23" },
          { a: "5 October 1962", b: "November 1963" },
        ),
      }),
    );
    // The label claim misses its day, so the pipeline's refusal stands too.
    expect(
      unstated
        .filter((f) => f.rule === "C17")
        .map((f) => `${f.severity} ${f.path ?? ""}`),
    ).toEqual(["error claims[1].text", "error values"]);
  });

  it("C19 exempts the standard comparison stems, 'only' before a number and 'most of'", async () => {
    const quiet = [
      "Which instrument do only 3 players of Halvessa carry?",
      "Which instrument do only about 300 players of Halvessa carry?",
      "Which instrument do only a few players of Halvessa carry?",
      "Which instrument do most of the players of Halvessa carry?",
    ];
    for (const stem of quiet) {
      const findings = await lint(
        fxFiles({ [MC]: fxMc({ stem, claims: allStandard(fxMc()) }) }),
      );
      expect(drawn(findings, "C19", MC), stem).toEqual([]);
    }
    const loud = await lint(
      fxFiles({
        [MC]: fxMc({
          stem: "Which instrument do only the players of Halvessa carry?",
          claims: allStandard(fxMc()),
        }),
      }),
    );
    expect(drawn(loud, "C19", MC)).toEqual(["warn C19"]);
    const standardStem = await lint(fxFiles({ [CMP]: nearTie(undefined) }));
    expect(drawn(standardStem, "C19", CMP)).toEqual([]);
  });

  it("C22 refuses a sealed near-copy of a guide example and the guide's answers, and warns on its encore values", async () => {
    const guide = readFileSync(
      join(REPO_ROOT, "docs/CONTENT_GUIDE.md"),
      "utf8",
    );
    const shogi = /"question": "(Counting every size[^"]+)"/.exec(guide)?.[1];
    expect(shogi).toBeDefined();
    const copy = await lint(
      fxFiles({
        [ENC]: fxEncore({
          question: shogi,
          answer: 285,
          unit: "squares",
          unitShort: "squares",
          unitLabel: "squares",
        }),
      }),
      { dedupe: true },
    );
    expect(drawn(copy, "C22", ENC)).toEqual(
      expect.arrayContaining(["error C22", "warn C22"]),
    );
    const value = await lint(
      fxFiles({
        [ENC]: fxEncore({
          answer: 285,
          unit: "squares",
          unitShort: "squares",
          unitLabel: "squares",
        }),
      }),
    );
    expect(drawn(value, "C22", ENC)).toEqual(["warn C22"]);
    // A guide answer in a content tree: the real ids the lists reuse.
    const list = fxCountryList() as { entities: Json[] };
    const mongolia = {
      ...list.entities[0],
      id: "x.country.mongolia",
      name: "Mongolia",
      display: "Mongolia",
      aliases: [],
    };
    const answered = await lint(
      fxFiles({
        "answer-lists/country.json": {
          ...list,
          entities: [mongolia, ...list.entities.slice(1)],
        },
        [MYS]: fxMystery({ answer: "x.country.mongolia" }),
      }),
      { tree: "content" },
    );
    expect(drawn(answered, "C22", MYS)).toEqual(["error C22"]);
  });

  it("C22 replaces the pipeline's near-copy warning only when it is about the same guide example", async () => {
    const guide = readFileSync(
      join(REPO_ROOT, "docs/CONTENT_GUIDE.md"),
      "utf8",
    );
    const shogi = /"question": "(Counting every size[^"]+)"/.exec(guide)?.[1];
    // Not a §12.9 value, so the denylist stays out of it.
    const copy = (id: string) =>
      fxEncore({
        id,
        question: shogi,
        answer: 290,
        unit: "squares",
        unitShort: "squares",
        unitLabel: "squares",
      });
    const alone = await lint(fxFiles({ [ENC]: copy("fx.e.0101") }), {
      dedupe: true,
    });
    expect(drawn(alone, "C22", ENC)).toEqual(["error C22"]);
    // With a sealed twin, the pipeline's warning names the twin, and stays.
    const twins = await lint(
      fxFiles({
        [ENC]: copy("fx.e.0101"),
        "encores/fx.e.0102.json": copy("fx.e.0102"),
      }),
      { dedupe: true },
    );
    expect(drawn(twins, "C22", ENC).sort()).toEqual(["error C22", "warn C22"]);
  });

  it("C27 refuses 'capital' in any clue when the mystery's answer is a listed country", async () => {
    const capitals = {
      version: "2026-11-04",
      note: "test list",
      countries: [
        {
          country: "Arvenna",
          iso_a2: "XA",
          reason: "moved",
          detail: "Cindral to Ostrel, 2001",
        },
      ],
    };
    // fxMystery's clue 3 names the capital Cindral without naming Arvenna.
    const findings = await lint(
      fxFiles({ ...references({ "capitals-excluded.json": capitals }) }),
    );
    expect(
      findings
        .filter((f) => f.rule === "C27" && f.file.endsWith(MYS))
        .map((f) => f.path),
    ).toEqual(["claims[3].text", "clues[2]"]);
    // An alias from the country list counts as the country's name.
    const alias = await lint(
      fxFiles({
        ...references({ "capitals-excluded.json": capitals }),
        [MC]: fxMc({
          stem: "Which instrument opens the spring festival in the capital of the Arven Republic?",
        }),
      }),
    );
    expect(drawn(alias, "C27", MC)).toEqual(["error C27"]);
    // Capital letters and capital punishment are other senses.
    const senses = await lint(
      fxFiles({
        [MC]: fxMc({
          stem: "Which instrument do Germany's players write in capital letters?",
        }),
      }),
    );
    expect(drawn(senses, "C27", MC)).toEqual([]);
  });

  it("C28 labels the options as the server does: one bracket means every option label", async () => {
    // People carry descriptors, so a bracket anywhere labels all four.
    const people = (displays: string[]) => ({
      type: "person",
      version: "2026-09-01",
      provenance: [
        { source: "invented", license: "CC0-1.0", retrievedAt: "2026-09-01" },
      ],
      entities: displays.map((display, i) => ({
        id: `fx.x.person.p${i}`,
        name: display.replace(/ \(.*\)$/, ""),
        display,
        aliases: [],
        popularity: 0,
        qualifier: { descriptor: "fixture poet", born: 1900 + i },
        source: "invented",
        status: "active",
        addedIn: "2026-09-01",
      })),
    });
    const names = Array.from(
      { length: 12 },
      (_, i) => `Poet ${"ABCDEFGHIJKL"[i]}`,
    );
    const mystery = fxMystery({
      answerType: "person",
      answer: "fx.x.person.p0",
      distractors: ["fx.x.person.p1", "fx.x.person.p2", "fx.x.person.p3"],
      likelyGuesses: [4, 5, 6, 7, 8, 9].map((i) => `fx.x.person.p${i}`),
      rivals: [
        { id: "fx.x.person.p4", ruledOutBy: [1] },
        { id: "fx.x.person.p5", ruledOutBy: [2] },
        { id: "fx.x.person.p6", ruledOutBy: [3] },
      ],
      giveawayTerms: [],
    });
    const lists = (displays: string[]) =>
      fxFiles({
        "answer-lists/person.json": people(displays),
        [MYS]: mystery,
      });
    const bracketed = [...names];
    bracketed[2] = "Poet C (sculptor)";
    const findings = await lint(lists(bracketed));
    expect(drawn(findings, "C28", MYS)).toEqual([]);
  });
});

describe("severity by status for CNT-2's new rules", () => {
  const floorBreak = (status: string, extra: Json = {}) =>
    fxFiles({
      [MC]: {
        ...fxMc({
          claims: [
            {
              id: "c1",
              role: "key",
              risk: "standard",
              text: "A bone flute with 7 holes opens the Halvessa spring festival.",
            },
            ...fxMc().claims.slice(1),
          ],
        }),
        status,
        ...extra,
      },
    });
  const checkingExtra = {
    predicted: { p: 0.6, spread: 0.4, estimator: "v0" },
    verification: { checks: [] },
  };

  it("C26 warns on a draft, fails from checking on, and skips fixture trees and cut items", async () => {
    expect(
      drawn(await lint(floorBreak("draft"), { tree: "content" }), "C26", MC),
    ).toEqual(["warn C26"]);
    expect(
      drawn(
        await lint(floorBreak("checking", checkingExtra), { tree: "content" }),
        "C26",
        MC,
      ),
    ).toEqual(["error C26"]);
    expect(
      drawn(await lint(floorBreak("cut"), { tree: "content" }), "C26", MC),
    ).toEqual([]);
    expect(drawn(await lint(floorBreak("draft")), "C26", MC)).toEqual([]);
  });

  it("C27 fails on drafts, and --launch keeps every new rule an error", async () => {
    const files = fxFiles({
      [MC]: fxMc({
        stem: "Which instrument opens the spring festival in the capital of Germany?",
      }),
    });
    expect(drawn(await lint(files), "C27", MC)).toEqual(["error C27"]);
    expect(
      drawn(
        await lint(floorBreak("draft"), { tree: "content", launch: true }),
        "C26",
        MC,
      ),
    ).toEqual(["error C26"]);
  });
});

describe("CONTENT_GUIDE §12's good examples under CNT-2's rules", () => {
  /** The JSON examples of one §12 section. */
  function examples(section: string): Json[] {
    const guide = readFileSync(
      join(REPO_ROOT, "docs/CONTENT_GUIDE.md"),
      "utf8",
    );
    const body = guide.split(/^### /m).find((p) => p.startsWith(`${section} `));
    return [...(body ?? "").matchAll(/```json\s*\n([\s\S]*?)```/g)].flatMap(
      (match) => {
        const value = JSON.parse(match[1] ?? "") as Json | Json[];
        return Array.isArray(value) ? value : [value];
      },
    );
  }

  it("meet the risk floor, the capital rule, option parity, C19 and C17 with exactDates, and the denylist holds every answer and value", async () => {
    const files: FxFiles = { ...fxFiles(), ...references() };
    const packs = new Map<string, Json[]>();
    let count = 0;
    for (const section of ["12.1", "12.3", "12.5", "12.7", "12.9", "12.11"]) {
      for (const example of examples(section)) {
        count += 1;
        const id = String(example.id);
        const item = {
          ...example,
          status: "checking",
          ...checkingStub(example),
        };
        if (example.kind === "mystery") files[`mysteries/${id}.json`] = item;
        else if (example.kind === "encore") files[`encores/${id}.json`] = item;
        else if (example.kind === "choice") {
          const pack = id.split(".")[1] ?? "";
          packs.set(pack, [...(packs.get(pack) ?? []), item]);
        } else {
          const slug = {
            geo: "geography",
            hist: "history",
            sci: "science-tech",
            nat: "nature-animals",
            film: "film-tv",
            music: "music",
            art: "art-design",
            book: "books-literature",
            sport: "sport-games",
            food: "food-drink",
            lang: "language-words",
            soc: "society-culture",
          }[String(example.category)];
          files[`practice/${slug ?? ""}/${id}.json`] = item;
        }
      }
    }
    for (const [pack, questions] of packs)
      files[`room-packs/${pack}.json`] = {
        id: pack,
        title: pack,
        theme: pack,
        questions,
      };
    expect(count).toBe(60);
    // A content tree, so the risk floor applies, at checking, where it fails.
    const findings = await lint(files, { tree: "content" });
    const ofExamples = findings.filter((f) =>
      /\.00\d{2}\.json$|room-packs\/(?!fx-)/.test(f.file),
    );
    // Every example loaded and was linted: its reserved id draws C24 (refused
    // anywhere under content/), and nothing fails its schema.
    expect(
      new Set(ofExamples.filter((f) => f.rule === "C24").map((f) => f.itemId))
        .size,
    ).toBe(60);
    expect(ofExamples.filter((f) => f.rule === "C01")).toEqual([]);
    const cnt2 = ofExamples.filter((f) =>
      ["C04", "C15", "C17", "C19", "C26", "C27", "C28"].includes(f.rule),
    );
    expect(cnt2.map((f) => `${f.itemId ?? f.file} ${f.rule}`)).toEqual([]);
    // The example denylist bars exactly the ten §12.7 answers (errors) and
    // the ten §12.9 values (warnings), so it stays in step with the guide.
    const denied = ofExamples.filter((f) => f.rule === "C22");
    expect(
      denied.filter((f) => f.severity === "error").map((f) => f.itemId),
    ).toEqual(
      examples("12.7")
        .map((e) => e.id)
        .sort(),
    );
    expect(
      denied.filter((f) => f.severity === "warn").map((f) => f.itemId),
    ).toEqual(
      examples("12.9")
        .map((e) => e.id)
        .sort(),
    );
  });
});

/** Enough of a check trail for an item's schema at status checking (§2.3). */
function checkingStub(item: Json): Json {
  const predicted =
    item.kind === "mystery"
      ? { solveByClue: [0.5, 0.8, 0.92, 0.98], spread: 0.3, estimator: "v0" }
      : item.kind === "encore"
        ? { pClose: 0.3, pExact: 0.02, spread: 0.4, estimator: "v0" }
        : { p: 0.6, spread: 0.4, estimator: "v0" };
  return { predicted, verification: { checks: [] } };
}
