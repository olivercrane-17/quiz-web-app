/**
 * List requests (CONTENT_GUIDE §2.12, ARCHITECTURE §5.1.1): a writer who
 * needs an entity the published list lacks files `list-requests/<id>.json`,
 * sealed, with the name, the qualifier and the evidence. The list builder
 * mints the entity into the next regular list version (§2.10 rule 5), and
 * drafts swap the `lr.` id for the entity's. Validated only; never shipped.
 */
import { z } from "zod";

import { QUALIFIER_SCHEMAS } from "./answer-lists.ts";
import {
  ANSWER_TYPES,
  LIST_REQUEST_ID_PATTERN,
  type AnswerType,
  agentId,
  text,
} from "./primitives.ts";
import { DatasetEvidenceSchema, WebEvidenceSchema } from "./verification.ts";

const shell = {
  id: z
    .string()
    .regex(LIST_REQUEST_ID_PATTERN, "list request ids are lr.<batch>.<NN>"),
  /** The writer run that filed it. */
  requestedBy: agentId("w"),
  answerType: z.enum(ANSWER_TYPES),
  /** The name players would type, as the list's `name` would hold it. */
  name: text,
  /** A dataset record or a search result (§2.12): never knowledge alone. */
  evidence: z
    .array(
      z.discriminatedUnion("kind", [DatasetEvidenceSchema, WebEvidenceSchema]),
    )
    .min(1),
};

/**
 * One request. The qualifier is the type's (§2.10, the qualifier column),
 * so the schema reads `answerType` first and checks the qualifier against
 * that type's schema.
 */
export const ListRequestSchema = z
  .strictObject({ ...shell, qualifier: z.record(z.string(), z.unknown()) })
  .superRefine((request, ctx) => {
    const type: AnswerType = request.answerType;
    const result = QUALIFIER_SCHEMAS[type].safeParse(request.qualifier);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: [
            "qualifier",
            ...issue.path.filter((key) => typeof key !== "symbol"),
          ],
          message: issue.message,
        });
      }
    }
  });
export type ListRequest = z.infer<typeof ListRequestSchema>;
