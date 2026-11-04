/**
 * C08 and C11 on claims and `writerNotes` (CONTENT_GUIDE §2.13: "Of them,
 * C08 and C11 also run on claims and writerNotes"). The pipeline's lint
 * runs both on player-facing text only; this adds the rest of the rows:
 *
 * - C08: numeric dates such as 03/04/2025 or 2025-04-03 (L6);
 * - C11: an en or em dash, a double space, a URL, HTML or Markdown. The
 *   rest of C11's player-text checks (stray whitespace, line breaks, emoji,
 *   curly quotes) are §2.1's rules for what players read, and stay there.
 *
 * Both are errors, as in the table; C08's numeric dates take a lintAllow.
 */
import type { AnyItem } from "../../../src/content/schema/items.ts";
import type { TextField } from "../../../src/content/pipeline/lint/fields.ts";
import {
  numericDateHits,
  typographyHits,
} from "../../../src/content/pipeline/lint/text-rules.ts";
import type { RuleHit } from "../../../src/content/pipeline/lint/types.ts";

/** The C11 problems the guide names for claims and notes, by message prefix. */
const NOTE_PROBLEMS = [
  "use a plain hyphen",
  "double space",
  "no URLs",
  "no HTML",
  "no Markdown",
];

/** The claims' text and the writer's notes, as fields. */
export function claimAndNoteFields(item: AnyItem): TextField[] {
  const fields: TextField[] = item.claims.map((claim, i) => ({
    path: `claims[${i}].text`,
    value: claim.text,
    role: "explanation",
  }));
  if (item.writerNotes !== undefined)
    fields.push({
      path: "writerNotes",
      value: item.writerNotes,
      role: "explanation",
    });
  return fields;
}

/** C08 and C11 over an item's claims and notes. */
export function claimAndNoteHits(item: AnyItem): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const field of claimAndNoteFields(item)) {
    hits.push(...numericDateHits(field));
    for (const hit of typographyHits(field, { warnings: false })) {
      if (!NOTE_PROBLEMS.some((problem) => hit.message.startsWith(problem)))
        continue;
      hits.push(
        hit.message.startsWith("no URLs")
          ? {
              ...hit,
              message:
                "no URLs in claims or writerNotes: a URL goes only in a check record's evidence, copied from a tool result (§2.1, §9.6)",
            }
          : hit,
      );
    }
  }
  return hits;
}
