/**
 * Closed answer lists (CONTENT_GUIDE §2.10, ARCHITECTURE §5.1). One file per
 * type in content/answer-lists/<type>.json. The build adds `keys`; writers
 * never do, so a `keys` field is refused like any unknown key.
 */
import { z } from "zod";

import {
  ANSWER_TYPES,
  QID_PATTERN,
  type AnswerType,
  entityId,
  isoA2,
  isoDate,
  text,
} from "./primitives.ts";

const year = z.int().min(-10000).max(2100);
const descriptor = text;

/** The facts behind `display` for each type (§2.10, the qualifier column). */
export const QUALIFIER_SCHEMAS = {
  country: z.strictObject({ iso_a2: isoA2 }),
  city: z.strictObject({ country: isoA2, admin1: z.string().nullable() }),
  person: z.strictObject({ descriptor, born: year.nullable() }),
  film: z.strictObject({ year }),
  tv_series: z.strictObject({ descriptor, country: isoA2, startYear: year }),
  book: z.strictObject({ author: text, year }),
  animal: z.strictObject({ scientificName: text }),
  element: z.strictObject({
    symbol: z.string().regex(/^[A-Z][a-z]{0,2}$/, "an element symbol"),
    number: z.int().min(1).max(118),
  }),
  landmark: z.strictObject({ country: isoA2 }),
  music_artist: z.strictObject({
    descriptor,
    kind: z.enum(["solo", "band", "composer"]),
  }),
  dish: z.strictObject({ origin: isoA2.nullable() }),
  sport: z.strictObject({}),
} satisfies Record<AnswerType, z.ZodType>;

/** The entity schema of one list type. */
export function answerEntitySchema<T extends AnswerType>(type: T) {
  return z
    .strictObject({
      id: entityId,
      name: text,
      display: text,
      aliases: z.array(text),
      popularity: z.int().min(0),
      qualifier: QUALIFIER_SCHEMAS[type],
      source: text,
      status: z.enum(["active", "retired"]),
      addedIn: isoDate,
      wikidataId: z
        .string()
        .regex(QID_PATTERN, "a Wikidata QID")
        .nullable()
        .optional(),
      replacedBy: entityId.nullable().optional(),
    })
    .superRefine((entity, ctx) => {
      const prefix = `x.${type}.`;
      const bare = entity.id.replace(/^fx\./, "");
      if (bare.startsWith("x.") && !bare.startsWith(prefix)) {
        ctx.addIssue({
          code: "custom",
          path: ["id"],
          message: `x. ids in the ${type} list start ${prefix}`,
        });
      }
    });
}

function listSchema<T extends AnswerType>(type: T) {
  return z
    .strictObject({
      type: z.literal(type),
      version: isoDate,
      /**
       * + The UTC date of the commit that first published this version
       * (§2.10 rule 5). content:check compares it with git history.
       * Optional while the lists published before this field existed
       * catch up; their publish date comes from git history either way.
       */
      liveAt: isoDate.optional(),
      provenance: z
        .array(
          z.strictObject({ source: text, license: text, retrievedAt: isoDate }),
        )
        .min(1),
      entities: z.array(answerEntitySchema(type)),
    })
    .superRefine((list, ctx) => {
      const seen = new Set<string>();
      list.entities.forEach((entity, index) => {
        if (seen.has(entity.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["entities", index, "id"],
            message: `duplicate entity id ${entity.id}`,
          });
        }
        seen.add(entity.id);
      });
    });
}

/** One schema per list type, keyed by the file's `type`. */
export const ANSWER_LIST_SCHEMAS: Record<
  AnswerType,
  z.ZodType<AnswerList>
> = Object.fromEntries(
  ANSWER_TYPES.map((type) => [type, listSchema(type)]),
) as unknown as Record<AnswerType, z.ZodType<AnswerList>>;

/**
 * Any answer-list file. It reads `type` first, so a wrong qualifier is
 * reported against the right type instead of as twelve union failures.
 */
export const AnswerListSchema = z
  .custom<AnswerList>()
  .superRefine((raw, ctx) => {
    const type: unknown =
      typeof raw === "object" && raw !== null
        ? (raw as { type?: unknown }).type
        : undefined;
    if (!(ANSWER_TYPES as readonly unknown[]).includes(type)) {
      ctx.addIssue({
        code: "custom",
        path: ["type"],
        message: `type must be one of ${ANSWER_TYPES.join(", ")}`,
      });
      return;
    }
    const result = ANSWER_LIST_SCHEMAS[type as AnswerType].safeParse(raw);
    if (!result.success) {
      for (const problem of result.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: problem.path.filter((key) => typeof key !== "symbol"),
          message: problem.message,
        });
      }
    }
  });

/** An entity as the pipeline reads it, whatever its type. */
export interface AnswerEntity {
  id: string;
  name: string;
  display: string;
  aliases: string[];
  popularity: number;
  qualifier: Record<string, unknown>;
  source: string;
  status: "active" | "retired";
  addedIn: string;
  wikidataId?: string | null | undefined;
  replacedBy?: string | null | undefined;
}

export interface AnswerList {
  type: AnswerType;
  version: string;
  liveAt?: string | undefined;
  provenance: { source: string; license: string; retrievedAt: string }[];
  entities: AnswerEntity[];
}
