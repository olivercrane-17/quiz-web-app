/**
 * Reference files under content/reference/ (CONTENT_GUIDE §11.1): spelling
 * pairs, stopwords, the myths list and the shared slur list.
 */
import { z } from "zod";

import { categoryCode, isoDate, text } from "./primitives.ts";

const lowerWord = z.string().regex(/^[a-z][a-z'-]*$/, "lowercase words only");

/** content/reference/spelling.json, read by lint C10. */
export const SpellingFileSchema = z.strictObject({
  version: isoDate,
  note: text.optional(),
  /** US spelling to Oxford spelling: "color" to "colour". */
  usToOxford: z.record(lowerWord, lowerWord),
  /** British -ise forms that Oxford spelling writes with -ize. */
  iseToIze: z.record(lowerWord, lowerWord),
  /** Proper nouns that keep their own spelling ("Pearl Harbor"). */
  properNounAllowlist: z.array(text),
});
export type SpellingFile = z.infer<typeof SpellingFileSchema>;

/** content/reference/stopwords.json, read by lint C12 and C13. */
export const StopwordsFileSchema = z.strictObject({
  version: isoDate,
  note: text.optional(),
  words: z.array(lowerWord),
});
export type StopwordsFile = z.infer<typeof StopwordsFileSchema>;

/**
 * content/reference/myths.json, read by lint C25. `match` is a list of word
 * groups: a claim hits the myth when every group has at least one of its
 * words or phrases in the claim (after normalization).
 */
export const MythsFileSchema = z
  .strictObject({
    version: isoDate,
    note: text.optional(),
    myths: z.array(
      z.strictObject({
        id: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "myth ids are kebab-case"),
        claim: text,
        category: categoryCode.optional(),
        match: z.array(z.array(text).min(1)).min(2),
      }),
    ),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.myths.forEach((myth, index) => {
      if (seen.has(myth.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["myths", index, "id"],
          message: `duplicate myth id ${myth.id}`,
        });
      }
      seen.add(myth.id);
    });
  });
export type MythsFile = z.infer<typeof MythsFileSchema>;

/**
 * content/reference/slurs.json, read by lint C23. Terms and allowlist
 * entries are stored ROT13-encoded so the words never show up in diffs,
 * search results or agent transcripts. Tools must never print them.
 */
export const SlursFileSchema = z.strictObject({
  version: isoDate,
  note: text,
  encoding: z.literal("rot13"),
  terms: z.array(text),
  allowlist: z.array(text),
});
export type SlursFile = z.infer<typeof SlursFileSchema>;
