/**
 * content/reference/: the lint's word lists and constants (CONTENT_GUIDE
 * §11.1, ARCHITECTURE §2.1). Every file there has a schema here
 * (REFERENCE_FILES), and `loadLintReferences` reads the four that CNT-2's
 * rules use:
 *
 * - superlatives.json: the superlative words of C19 and C26;
 * - capitals-excluded.json: the countries C27 keeps away from "capital";
 * - units.json: exact unit definitions for calculation evidence (§9.5.4) and
 *   the measured units of C15;
 * - example-denylist.json: the guide's §12.7 answers and §12.9 values,
 *   barred from sealed pools by C22.
 *
 * The other four (myths, spelling, stopwords, slurs) keep their schemas in
 * src/content/schema/reference.ts and their loader in the pipeline's
 * references.ts, which the bank loader runs; they are re-exported here so
 * this table names every reference file once. Loading is synchronous because
 * `lintBank` is (ARCHITECTURE §2.3), and the files are small.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { z, type ZodType } from "zod";

import {
  answerType,
  entityId,
  isoA2,
  isoDate,
  text,
  type AnswerType,
} from "../../../src/content/schema/primitives.ts";
import {
  MythsFileSchema,
  SlursFileSchema,
  SpellingFileSchema,
  StopwordsFileSchema,
} from "../../../src/content/schema/reference.ts";

export {
  MythsFileSchema,
  SlursFileSchema,
  SpellingFileSchema,
  StopwordsFileSchema,
};

/** One lowercase word, as the text rules match it (case folded). */
const lowerWord = z
  .string()
  .regex(/^[a-z][a-z'-]*$/, "one lowercase word per entry");

function noDuplicates<T>(
  values: readonly T[],
  key: (value: T) => string,
  ctx: z.RefinementCtx,
  path: (string | number)[],
  what: string,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const k = key(value);
    if (seen.has(k))
      ctx.addIssue({
        code: "custom",
        path: [...path, index],
        message: `duplicate ${what} ${k}`,
      });
    seen.add(k);
  });
}

/** The words C19 names in its own row of §2.13; the file may add, never drop them. */
export const SECTION_SUPERLATIVES = [
  "first",
  "only",
  "record",
  "most",
  "least",
  "best",
  "worst",
] as const;

/** content/reference/superlatives.json (C19, C26). */
export const SuperlativesFileSchema = z
  .strictObject({
    version: isoDate,
    note: text,
    words: z.array(lowerWord).min(1),
  })
  .superRefine((file, ctx) => {
    noDuplicates(file.words, (w) => w, ctx, ["words"], "word");
    for (const word of SECTION_SUPERLATIVES) {
      if (!file.words.includes(word))
        ctx.addIssue({
          code: "custom",
          path: ["words"],
          message: `"${word}" is one of the words CONTENT_GUIDE §2.13 names for C19 and C26`,
        });
    }
  });
export type SuperlativesFile = z.infer<typeof SuperlativesFileSchema>;

export const CAPITAL_REASONS = [
  "multiple_or_none",
  "moved",
  "move_announced",
] as const;
export type CapitalReason = (typeof CAPITAL_REASONS)[number];

/** content/reference/capitals-excluded.json (CONTENT_GUIDE §3.4, C27). */
export const CapitalsExcludedFileSchema = z
  .strictObject({
    version: isoDate,
    note: text,
    countries: z.array(
      z.strictObject({
        /** The name the guide's table gives; the list's names and aliases count too. */
        country: text,
        /** Joins the entry to its country-list entity (`qualifier.iso_a2`). */
        iso_a2: isoA2,
        reason: z.enum(CAPITAL_REASONS),
        /** What moved, and when, as §3.4 states it. */
        detail: text.optional(),
      }),
    ),
  })
  .superRefine((file, ctx) => {
    noDuplicates(
      file.countries,
      (entry) => entry.iso_a2,
      ctx,
      ["countries"],
      "country",
    );
    file.countries.forEach((entry, index) => {
      if (entry.reason !== "multiple_or_none" && entry.detail === undefined)
        ctx.addIssue({
          code: "custom",
          path: ["countries", index, "detail"],
          message: "a moved or announced capital records what moved (§3.4)",
        });
    });
  });
export type CapitalsExcludedFile = z.infer<typeof CapitalsExcludedFileSchema>;
export type CapitalsExcludedEntry = CapitalsExcludedFile["countries"][number];

export const MEASURED_DIMENSIONS = ["length", "area", "mass", "speed"] as const;
export type MeasuredDimension = (typeof MEASURED_DIMENSIONS)[number];

/** A unit as written in an encore's unit or unitShort, lower case. */
const unitText = z
  .string()
  .min(1)
  .refine(
    (value) => value === value.toLowerCase() && value === value.trim(),
    "units are lower case with no outer spaces",
  );

/** content/reference/units.json (§9.5.4 calculations, C15's measured units). */
export const UnitsFileSchema = z
  .strictObject({
    version: isoDate,
    note: text,
    constants: z
      .array(
        z.strictObject({
          name: z
            .string()
            .regex(
              /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/,
              "constants are snake_case",
            ),
          value: z.number().positive(),
          definition: text,
        }),
      )
      .min(1),
    measured: z.strictObject({
      length: z.array(unitText).min(1),
      area: z.array(unitText).min(1),
      mass: z.array(unitText).min(1),
      speed: z.array(unitText).min(1),
    }),
  })
  .superRefine((file, ctx) => {
    noDuplicates(
      file.constants,
      (constant) => constant.name,
      ctx,
      ["constants"],
      "constant",
    );
    const seen = new Map<string, string>();
    for (const dimension of MEASURED_DIMENSIONS) {
      file.measured[dimension].forEach((unit, index) => {
        const other = seen.get(unit);
        if (other !== undefined)
          ctx.addIssue({
            code: "custom",
            path: ["measured", dimension, index],
            message: `${unit} is already a ${other} unit`,
          });
        seen.set(unit, dimension);
      });
    }
  });
export type UnitsFile = z.infer<typeof UnitsFileSchema>;

/** content/reference/example-denylist.json (§12.0, C22). */
export const ExampleDenylistFileSchema = z.strictObject({
  version: isoDate,
  note: text,
  /** The ten §12.7 answers, by the ids the guide gives (the lists reuse them). */
  mysteryAnswers: z
    .array(
      z.strictObject({
        example: z.string().regex(/^m\.[a-z]+\.00\d{2}$/, "a §12.7 example id"),
        answerType,
        answer: entityId,
        name: text,
      }),
    )
    .min(1),
  /** The ten §12.9 values, with the unit the example names ("" for years). */
  encoreValues: z
    .array(
      z.strictObject({
        example: z.string().regex(/^e\.00\d{2}$/, "a §12.9 example id"),
        answer: z.number().positive(),
        unit: z.string(),
      }),
    )
    .min(1),
});
export type ExampleDenylistFile = z.infer<typeof ExampleDenylistFileSchema>;

export interface ReferenceFileSpec {
  name: string;
  schema: ZodType;
  /** The lint rules that read it (§2.13). */
  rules: readonly string[];
  /** True for the four the pipeline's bank loader reads and reports itself. */
  pipeline: boolean;
}

/** Every file content/reference/ may hold, with its schema and readers. */
export const REFERENCE_FILES: readonly ReferenceFileSpec[] = [
  {
    name: "myths.json",
    schema: MythsFileSchema,
    rules: ["C25"],
    pipeline: true,
  },
  {
    name: "spelling.json",
    schema: SpellingFileSchema,
    rules: ["C10"],
    pipeline: true,
  },
  {
    name: "stopwords.json",
    schema: StopwordsFileSchema,
    rules: ["C12", "C13"],
    pipeline: true,
  },
  {
    name: "slurs.json",
    schema: SlursFileSchema,
    rules: ["C23"],
    pipeline: true,
  },
  {
    name: "superlatives.json",
    schema: SuperlativesFileSchema,
    rules: ["C19", "C26"],
    pipeline: false,
  },
  {
    name: "capitals-excluded.json",
    schema: CapitalsExcludedFileSchema,
    rules: ["C27"],
    pipeline: false,
  },
  {
    name: "units.json",
    schema: UnitsFileSchema,
    rules: ["C15"],
    pipeline: false,
  },
  {
    name: "example-denylist.json",
    schema: ExampleDenylistFileSchema,
    rules: ["C22"],
    pipeline: false,
  },
];

export interface ReferenceProblem {
  /** Absolute path of the file. */
  file: string;
  message: string;
  /** The field path inside the file, when a schema refused it. */
  path?: string;
}

export interface LintReferences {
  /** Folded superlative words (C19, C26). */
  superlatives: ReadonlySet<string>;
  /** Countries with no single, settled capital (C27). */
  capitals: readonly CapitalsExcludedEntry[];
  /** Exact constants by name (§9.5.4). */
  constants: ReadonlyMap<string, number>;
  /** Measured unit (lower case) to its dimension (C15). */
  measured: ReadonlyMap<string, MeasuredDimension>;
  /** §12.7 answers by answer type (C22). */
  deniedAnswers: ReadonlyMap<AnswerType, ReadonlySet<string>>;
  /** §12.9 values (C22). */
  deniedValues: readonly { example: string; answer: number; unit: string }[];
  problems: ReferenceProblem[];
}

function pathOf(path: readonly PropertyKey[]): string {
  let out = "";
  for (const key of path) {
    if (typeof key === "number") out += `[${key}]`;
    else out += out === "" ? String(key) : `.${String(key)}`;
  }
  return out;
}

/** Reads and validates one reference file; null (with a problem) when it can't. */
export function readReferenceFile<T>(
  dir: string,
  name: string,
  schema: ZodType<T>,
  problems: ReferenceProblem[],
): T | null {
  const file = join(dir, name);
  if (!existsSync(file)) {
    problems.push({ file, message: `missing reference file ${name} (§11.1)` });
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    problems.push({
      file,
      message: `${name} is not valid JSON: ${(error as Error).message}`,
    });
    return null;
  }
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) {
    const problem: ReferenceProblem = {
      file,
      message: `${name}: ${issue.message}`,
    };
    const at = pathOf(issue.path);
    if (at !== "") problem.path = at;
    problems.push(problem);
  }
  return null;
}

/**
 * JSON files in content/reference/ that no schema covers. Each is a C01
 * error: a word list nobody validates is a list nobody can trust.
 */
export function unknownReferenceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const known = new Set(REFERENCE_FILES.map((spec) => spec.name));
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !known.has(name))
    .sort();
}

/** The four reference files CNT-2's rules read, validated. */
export function loadLintReferences(dir: string): LintReferences {
  const problems: ReferenceProblem[] = [];
  const superlatives = readReferenceFile(
    dir,
    "superlatives.json",
    SuperlativesFileSchema,
    problems,
  );
  const capitals = readReferenceFile(
    dir,
    "capitals-excluded.json",
    CapitalsExcludedFileSchema,
    problems,
  );
  const units = readReferenceFile(dir, "units.json", UnitsFileSchema, problems);
  const denylist = readReferenceFile(
    dir,
    "example-denylist.json",
    ExampleDenylistFileSchema,
    problems,
  );
  for (const name of unknownReferenceFiles(dir)) {
    problems.push({
      file: join(dir, name),
      message: `${name} is not a reference file this lint knows; every file in content/reference/ has a schema in scripts/content/lint/reference.ts (CONTENT_GUIDE §11.1)`,
    });
  }

  const measured = new Map<string, MeasuredDimension>();
  for (const dimension of MEASURED_DIMENSIONS) {
    for (const unit of units?.measured[dimension] ?? [])
      measured.set(unit, dimension);
  }
  const deniedAnswers = new Map<AnswerType, Set<string>>();
  for (const entry of denylist?.mysteryAnswers ?? []) {
    const ids = deniedAnswers.get(entry.answerType) ?? new Set<string>();
    ids.add(entry.answer);
    deniedAnswers.set(entry.answerType, ids);
  }
  return {
    // Without the file, C19 and C26 still know the words §2.13 names.
    superlatives: new Set(superlatives?.words ?? SECTION_SUPERLATIVES),
    capitals: capitals?.countries ?? [],
    constants: new Map(
      (units?.constants ?? []).map((constant) => [
        constant.name,
        constant.value,
      ]),
    ),
    measured,
    deniedAnswers,
    deniedValues: denylist?.encoreValues ?? [],
    problems,
  };
}
