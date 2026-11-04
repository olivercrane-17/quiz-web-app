/**
 * Item schemas: practice items (mc, tf, comparison), mysteries, encores and
 * room-pack questions, exactly as CONTENT_GUIDE §2.3 to §2.9 define them,
 * including the fields marked +. Unknown keys are refused.
 *
 * The schemas check shape: required fields, types, enums, id patterns, the
 * claim list a format needs, and what `active` requires. Writing rules
 * (lengths, wording, giveaways and so on) are lint rules C02 to C25, so a
 * draft that breaks a style rule still parses and gets a precise message.
 */
import { z } from "zod";

import { ClaimSchema, LintAllowSchema, type Claim } from "./claims.ts";
import {
  ENTITY_ID_PATTERN,
  ID_PATTERNS,
  ITEM_STATUSES,
  LIST_REQUEST_ID_PATTERN,
  VOLATILITIES,
  answerType,
  categoryCode,
  isoDate,
  region,
  share,
  tag,
  text,
} from "./primitives.ts";
import { VerificationSchema, type Verification } from "./verification.ts";

/** The estimator's output for practice and room items (§8.5). */
export const PredictedRateSchema = z.strictObject({
  p: share,
  spread: z.number().min(0),
  estimator: text,
});

/** Cumulative solve shares by clue (§2.7, §8.3). */
export const MysteryPredictedSchema = z
  .strictObject({
    solveByClue: z.tuple([share, share, share, share]),
    spread: z.number().min(0),
    estimator: text,
  })
  .superRefine((predicted, ctx) => {
    if (!isNonDecreasing(predicted.solveByClue)) {
      ctx.addIssue({
        code: "custom",
        path: ["solveByClue"],
        message: "cumulative shares never fall from one clue to the next",
      });
    }
  });

/** Encore estimate (+): close-band and exact shares (§2.8, §8.4). */
export const EncorePredictedSchema = z
  .strictObject({
    pClose: share,
    pExact: share,
    spread: z.number().min(0),
    estimator: text,
  })
  .superRefine((predicted, ctx) => {
    if (predicted.pExact > predicted.pClose) {
      ctx.addIssue({
        code: "custom",
        path: ["pExact"],
        message: "pExact cannot exceed pClose",
      });
    }
  });

/**
 * + The writer's self-check (§2.3, §9.3): the eleven codes, each true to
 * leave draft. `mystery` and `encore` are true on other kinds too: the
 * writer confirms there is nothing of that kind to check. Optional in the
 * file, because the bank predates the field; once present on an item past
 * draft, every code must be true.
 */
export const SELF_CHECK_CODES = [
  "lint",
  "claims",
  "datasets",
  "rivalTest",
  "volatility",
  "regional",
  "style",
  "myths",
  "mystery",
  "encore",
  "doubts",
] as const;

export const SelfCheckSchema = z.strictObject(
  Object.fromEntries(SELF_CHECK_CODES.map((code) => [code, z.boolean()])) as {
    [K in (typeof SELF_CHECK_CODES)[number]]: z.ZodBoolean;
  },
);
export type SelfCheck = z.infer<typeof SelfCheckSchema>;

/** Fields every item carries (§2.3). */
const commonShape = {
  id: z.string(),
  status: z.enum(ITEM_STATUSES),
  category: categoryCode,
  tags: z.array(tag).min(1).max(6),
  region,
  volatility: z.enum(VOLATILITIES),
  reviewBy: isoDate.nullable(),
  seededDifficulty: z.int().min(1).max(5),
  counterintuitive: z.boolean(),
  explanation: text,
  learnMore: text,
  claims: z.array(ClaimSchema).min(1),
  selfCheck: SelfCheckSchema.optional(),
  writerNotes: z.string().optional(),
  lintAllow: z.array(LintAllowSchema).optional(),
  verification: VerificationSchema.optional(),
};

/** Multiple choice (§2.4). */
const mcShape = {
  stem: text,
  answer: text,
  wrong: z.array(text).min(2).max(3),
  order: z.enum(["shuffle", "ascending"]),
};

export const COMPARISON_RELATIONS = [
  "earlier",
  "later",
  "larger",
  "smaller",
  "more",
  "fewer",
  "heavier",
  "lighter",
  "longer",
  "shorter",
  "taller",
  "further_north",
  "further_south",
  "faster",
  "slower",
  "hotter",
  "colder",
] as const;
export type ComparisonRelation = (typeof COMPARISON_RELATIONS)[number];

/** Which value wins under each relation (§2.6). */
export const RELATION_WINS: Record<ComparisonRelation, "higher" | "lower"> = {
  earlier: "lower",
  later: "higher",
  larger: "higher",
  smaller: "lower",
  more: "higher",
  fewer: "lower",
  heavier: "higher",
  lighter: "lower",
  longer: "higher",
  shorter: "lower",
  taller: "higher",
  further_north: "higher",
  further_south: "lower",
  faster: "higher",
  slower: "lower",
  hotter: "higher",
  colder: "lower",
};

interface ItemLike {
  id: string;
  status: string;
  volatility: string;
  reviewBy: string | null;
  selfCheck?: SelfCheck | undefined;
  claims: Claim[];
  verification?: Verification | undefined;
  predicted?: unknown;
}

type Ctx = z.RefinementCtx;

function issue(ctx: Ctx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: "custom", path, message });
}

/** "a checking", "an active", "a retired". */
const aStatus = (status: string) =>
  `${/^[aeiou]/.test(status) ? "an" : "a"} ${status}`;

function isNonDecreasing(values: readonly number[]): boolean {
  return values.every((value, i) => i === 0 || value >= (values[i - 1] ?? 0));
}

/** Rules shared by every item kind. */
function refineCommon(item: ItemLike, ctx: Ctx, idPattern: RegExp): void {
  if (!idPattern.test(item.id)) {
    issue(
      ctx,
      ["id"],
      `id ${JSON.stringify(item.id)} does not match ${idPattern.source}`,
    );
  }
  // The editor sets a slow item's reviewBy at acceptance (§2.3), so a
  // draft or a checking item may still hold null.
  if (
    item.volatility === "slow" &&
    item.reviewBy === null &&
    item.status !== "draft" &&
    item.status !== "checking"
  ) {
    issue(ctx, ["reviewBy"], "a slow item needs a reviewBy date (§3.4)");
  }
  if (item.selfCheck !== undefined && item.status !== "draft") {
    for (const code of SELF_CHECK_CODES) {
      if (item.selfCheck[code] !== true) {
        issue(
          ctx,
          ["selfCheck", code],
          `every self-check code is true before an item leaves draft (§9.3)`,
        );
      }
    }
  }
  if (item.volatility !== "slow" && item.reviewBy !== null) {
    issue(
      ctx,
      ["reviewBy"],
      `reviewBy is null for ${item.volatility} items (§3.4)`,
    );
  }
  const ids = new Set<string>();
  item.claims.forEach((claim, index) => {
    if (ids.has(claim.id))
      issue(ctx, ["claims", index, "id"], `duplicate claim id ${claim.id}`);
    ids.add(claim.id);
  });
  // An explanation may state no separate fact (the guide's e.0004 shows its
  // method), so a missing explanation claim is lint X08, a warning the
  // editor clears, not a shape error.
  // Status gates the rules (CONTENT_GUIDE §2.3, ARCHITECTURE §5.1.1): a
  // draft needs shape only; from checking on, the estimate and the
  // verification record are present; an active item carries the full record.
  if (GATED_STATUSES.has(item.status)) {
    if (item.predicted === undefined) {
      issue(
        ctx,
        ["predicted"],
        `${aStatus(item.status)} item carries the estimator's predicted values (§8.5)`,
      );
    }
    if (item.verification === undefined) {
      issue(
        ctx,
        ["verification"],
        `${aStatus(item.status)} item carries its verification record (§9.8)`,
      );
    }
  }
  const v = item.verification;
  if (item.status === "active" && v !== undefined) {
    if (v.checks.length !== 2) {
      issue(
        ctx,
        ["verification", "checks"],
        "an active item has checks from passes A and B",
      );
    }
    if (v.editor?.decision !== "accept") {
      issue(
        ctx,
        ["verification", "editor"],
        "an active item has an editor decision of accept",
      );
    }
    for (const key of ["dedupe", "mythsScreen", "lint"] as const) {
      if (v[key] === undefined) {
        issue(ctx, ["verification", key], `an active item records ${key}`);
      }
    }
  }
}

/** Statuses from which `predicted` and `verification` must be present. */
export const GATED_STATUSES = new Set(["checking", "active", "retired"]);

function countRole(claims: Claim[], role: Claim["role"]): number {
  return claims.filter((claim) => claim.role === role).length;
}

function requireRole(
  ctx: Ctx,
  claims: Claim[],
  role: Claim["role"],
  why: string,
): void {
  if (countRole(claims, role) === 0) {
    issue(
      ctx,
      ["claims"],
      `needs at least one claim with role ${role}: ${why}`,
    );
  }
}

function refineChoiceClaims(claims: Claim[], ctx: Ctx): void {
  requireRole(ctx, claims, "key", "the key is a claim (§9.2)");
  requireRole(
    ctx,
    claims,
    "distractor",
    "each distractor's wrongness is a claim (§4)",
  );
}

export const McItemSchema = z
  .strictObject({
    ...commonShape,
    format: z.literal("mc"),
    ...mcShape,
    predicted: PredictedRateSchema.optional(),
  })
  .superRefine((item, ctx) => {
    refineCommon(item, ctx, ID_PATTERNS.practice);
    refineChoiceClaims(item.claims, ctx);
  });

export const TfItemSchema = z
  .strictObject({
    ...commonShape,
    format: z.literal("tf"),
    stem: text,
    answer: z.boolean(),
    tfKind: z.enum(["myth", "surprising_truth"]),
    predicted: PredictedRateSchema.optional(),
  })
  .superRefine((item, ctx) => {
    refineCommon(item, ctx, ID_PATTERNS.practice);
    requireRole(ctx, item.claims, "key", "the key is a claim (§9.2)");
  });

export const ComparisonItemSchema = z
  .strictObject({
    ...commonShape,
    format: z.literal("comparison"),
    stem: text,
    a: text,
    b: text,
    answer: z.enum(["a", "b"]),
    relation: z.enum(COMPARISON_RELATIONS),
    measure: text,
    unit: text,
    values: z.strictObject({ a: z.number(), b: z.number() }),
    valueDisplay: z.strictObject({ a: text, b: text }),
    /**
     * + The ISO dates of both events when two year values are under 10
     * apart (§2.6): the separation guard then asks 365 days between them.
     */
    exactDates: z.strictObject({ a: isoDate, b: isoDate }).optional(),
    predicted: PredictedRateSchema.optional(),
  })
  .superRefine((item, ctx) => {
    refineCommon(item, ctx, ID_PATTERNS.practice);
    if (item.exactDates !== undefined) {
      for (const side of ["a", "b"] as const) {
        if (Number(item.exactDates[side].slice(0, 4)) !== item.values[side]) {
          issue(
            ctx,
            ["exactDates", side],
            "the exact date's year must equal its value (§2.6)",
          );
        }
      }
    }
    for (const side of ["a", "b"] as const) {
      if (
        !item.claims.some(
          (claim) => claim.role === "label" && claim.ref === side,
        )
      ) {
        issue(
          ctx,
          ["claims"],
          `needs a label claim with ref "${side}" for that value (§9.2)`,
        );
      }
    }
  });

/** A practice item, one file in content/practice/<category-slug>/. */
export const PracticeItemSchema = z.discriminatedUnion("format", [
  McItemSchema,
  TfItemSchema,
  ComparisonItemSchema,
]);
export type PracticeItem = z.infer<typeof PracticeItemSchema>;
export type McItem = z.infer<typeof McItemSchema>;
export type TfItem = z.infer<typeof TfItemSchema>;
export type ComparisonItem = z.infer<typeof ComparisonItemSchema>;

/**
 * A mystery's entity fields hold an entity id, or the `lr.` id of a list
 * request (§2.7, §2.12), which a draft may hold until the list builder
 * fills the request. Lint C14 refuses an `lr.` id from checking on.
 */
const mysteryEntity = z
  .string()
  .refine(
    (id) => ENTITY_ID_PATTERN.test(id) || LIST_REQUEST_ID_PATTERN.test(id),
    "must be a Wikidata QID, x.<type>.<slug>, or a draft's list request lr.<batch>.<NN>",
  );

/** Mystery (§2.7). Sealed. */
export const MysterySchema = z
  .strictObject({
    ...commonShape,
    kind: z.literal("mystery"),
    answerType,
    answer: mysteryEntity,
    accepted: z.array(mysteryEntity).max(2),
    clues: z.tuple([text, text, text, text]),
    distractors: z.tuple([mysteryEntity, mysteryEntity, mysteryEntity]),
    slot: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    sourceLabels: z.array(text),
    likelyGuesses: z.array(mysteryEntity).min(6).max(12),
    rivals: z
      .array(
        z.strictObject({
          id: mysteryEntity,
          ruledOutBy: z.array(z.int().min(1).max(3)).min(1),
        }),
      )
      .min(3),
    giveawayTerms: z.array(text),
    seedSolveShares: z
      .tuple([share, share, share, share])
      .nullable()
      .optional(),
    predicted: MysteryPredictedSchema.optional(),
  })
  .superRefine((item, ctx) => {
    refineCommon(item, ctx, ID_PATTERNS.mystery);
    requireRole(
      ctx,
      item.claims,
      "uniqueness",
      "clues 1 to 3 fit only the answer (§5.4)",
    );
    requireRole(
      ctx,
      item.claims,
      "distractor",
      "each distractor contradicts a clue (§5.5)",
    );
    for (let clue = 1; clue <= 4; clue += 1) {
      const ref = `clue:${clue}`;
      if (
        !item.claims.some((claim) => claim.role === "clue" && claim.ref === ref)
      ) {
        issue(
          ctx,
          ["claims"],
          `needs a clue claim with ref "${ref}" (§5.2, rule 1)`,
        );
      }
    }
    item.claims.forEach((claim, index) => {
      if (claim.role === "clue" && !/^clue:[1-4]$/.test(claim.ref ?? "")) {
        issue(
          ctx,
          ["claims", index, "ref"],
          'a clue claim has ref "clue:1" to "clue:4"',
        );
      }
    });
    if (item.seedSolveShares && !isNonDecreasing(item.seedSolveShares)) {
      issue(
        ctx,
        ["seedSolveShares"],
        "cumulative shares never fall from one clue to the next",
      );
    }
    item.rivals.forEach((rival, index) => {
      if (new Set(rival.ruledOutBy).size !== rival.ruledOutBy.length) {
        issue(ctx, ["rivals", index, "ruledOutBy"], "list each clue once");
      }
    });
  });
export type Mystery = z.infer<typeof MysterySchema>;

const derivationSchema = z.strictObject({
  formula: text,
  inputs: z
    .array(
      z.strictObject({
        claimId: z.string(),
        value: z.number(),
        unit: z.string(),
        what: text,
      }),
    )
    .min(1),
  unrounded: z.number(),
  rounding: text,
});

/** Encore (§2.8). Sealed. Carries seededDifficulty (+). */
export const EncoreSchema = z
  .strictObject({
    ...commonShape,
    kind: z.literal("encore"),
    question: text,
    valueKind: z.enum(["quantity", "year"]),
    answer: z.number(),
    decimals: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    unit: z.string(),
    /**
     * Display forms of the unit (ARCHITECTURE §5.1.1 and §5.2; the built
     * EncoreContent needs both). A draft may leave them out; from checking
     * on they are required, empty strings for years (lint C15).
     */
    unitShort: z.string().optional(),
    unitLabel: z.string().optional(),
    bands: z
      .strictObject({
        bullseye: z.number().positive(),
        close: z.number().positive(),
      })
      .nullable(),
    sourceLabels: z.array(text),
    derivation: derivationSchema.nullable(),
    predicted: EncorePredictedSchema.optional(),
  })
  .superRefine((item, ctx) => {
    refineCommon(item, ctx, ID_PATTERNS.encore);
    if (GATED_STATUSES.has(item.status)) {
      for (const field of ["unitShort", "unitLabel"] as const) {
        if (item[field] === undefined) {
          issue(
            ctx,
            [field],
            `${aStatus(item.status)} encore carries ${field} (ARCHITECTURE §5.2; empty for years)`,
          );
        }
      }
    }
    if (countRole(item.claims, "value") !== 1) {
      issue(
        ctx,
        ["claims"],
        "an encore has exactly one claim with role value (§9.2)",
      );
    }
    item.derivation?.inputs.forEach((input, index) => {
      const claim = item.claims.find((c) => c.id === input.claimId);
      if (claim?.role !== "input") {
        issue(
          ctx,
          ["derivation", "inputs", index, "claimId"],
          `${input.claimId} must name a claim with role input (§2.8)`,
        );
      }
    });
  });
export type Encore = z.infer<typeof EncoreSchema>;

/**
 * A room-pack question: a sealed choice item with the §2.4 fields and the
 * §2.3 fields (§2.9). The guide's §2.9 leaves `predicted` off room
 * questions, but §8.5 has the estimator return p for them, the pack template
 * bands them by it, and ARCHITECTURE §5.1.1 (which owns formats) includes
 * it, so it follows the same status gate as every other item.
 */
export const RoomQuestionSchema = z
  .strictObject({
    ...commonShape,
    kind: z.literal("choice"),
    format: z.literal("mc"),
    ...mcShape,
    wrong: z.array(text).length(3),
    predicted: PredictedRateSchema.optional(),
  })
  .superRefine((item, ctx) => {
    refineCommon(item, ctx, ID_PATTERNS.room);
    refineChoiceClaims(item.claims, ctx);
  });
export type RoomQuestion = z.infer<typeof RoomQuestionSchema>;

/**
 * One sealed file per pack (§2.9). `questions` holds the pack in play order.
 * Writers draft about 18 to land 15, so the file may hold more than 15 while
 * the batch is open; the "15 in play" rule is pool check X04.
 */
export const RoomPackSchema = z
  .strictObject({
    id: z
      .string()
      .regex(/^(?:fx-)?[a-z0-9]+(?:-[a-z0-9]+)*$/, "pack ids are kebab-case"),
    title: text,
    theme: text,
    questions: z.array(RoomQuestionSchema).min(1).max(89),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    pack.questions.forEach((question, index) => {
      const match = ID_PATTERNS.room.exec(question.id);
      if (match && match[1] !== pack.id) {
        issue(
          ctx,
          ["questions", index, "id"],
          `question ids in this pack start r.${pack.id}.`,
        );
      }
      if (seen.has(question.id))
        issue(ctx, ["questions", index, "id"], `duplicate id ${question.id}`);
      seen.add(question.id);
    });
  });
export type RoomPack = z.infer<typeof RoomPackSchema>;

/** Any single item the pipeline handles. */
export type AnyItem = PracticeItem | Mystery | Encore | RoomQuestion;
