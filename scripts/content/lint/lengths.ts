/**
 * C04's warning boundary (CONTENT_GUIDE §2.13, §2.4, PRD §3.0.3). The guide
 * warns on an option of 24 characters or more, because the desktop 2 by 2
 * grid appears only when every option is under 24. The pipeline's C04 warns
 * from 25, so this adds the one length it misses: exactly 24.
 */
import type { AnyItem } from "../../../src/content/schema/items.ts";
import { choiceOptions } from "../../../src/content/pipeline/lint/fields.ts";
import type { RuleHit } from "../../../src/content/pipeline/lint/types.ts";
import { charCount } from "../../../src/content/pipeline/text.ts";

/** The longest option the 2 by 2 grid takes (PRD §3.0.3). */
export const GRID_OPTION_MAX = 23;

export function optionAtGridLimit(item: AnyItem): RuleHit[] {
  const options = choiceOptions(item);
  if (!options) return [];
  const hits: RuleHit[] = [];
  options.forEach((option, i) => {
    if (charCount(option) !== GRID_OPTION_MAX + 1) return;
    hits.push({
      rule: "C04",
      severity: "warn",
      path: i === 0 ? "answer" : `wrong[${i - 1}]`,
      message: `option has ${GRID_OPTION_MAX + 1} characters; aim for ${GRID_OPTION_MAX} or fewer so the 2 by 2 grid works (§2.4)`,
      excerpt: option,
      match: option,
    });
  });
  return hits;
}
