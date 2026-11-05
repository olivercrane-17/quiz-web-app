# The content lint (CNT-2)

`scripts/content/lint.ts` is the lint's entry point (ARCHITECTURE §2.3): `lintBank(bank, { sealed, launch })`. `content:check`, `content:build`, `content:batch` and `content:packets` call it. It runs CONTENT_GUIDE §2.13 rule for rule from two places and merges the findings:

- `src/content/pipeline/lint/`: C01 to C25, the X pool rules and the acceptance rule for active items, the content workstream's lint, kept as working code;
- this folder: the rules the pipeline lacked and the parts of its rules that read the reference files CNT-2 added (`content/reference/`, schemas and loader in `reference.ts`).

| Rule | Here                                                                                                                                                                                                                                                                              | Severity                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| C04  | An option of exactly 24 characters warns too (the pipeline starts at 25; the desktop grid needs every option under 24)                                                                                                                                                            | warn                                  |
| C08  | Numeric dates in claims and `writerNotes` too, not only player-facing text (§2.13); a ratio such as 75/25 is no date                                                                                                                                                              | error                                 |
| C11  | En or em dashes, double spaces, URLs, HTML or Markdown in claims and `writerNotes` too                                                                                                                                                                                            | error                                 |
| C12  | The suggestion probe: the engine's own `suggest()` over the list as it ships, on every word of a clue before `optionsFromClue` and each prefix of 3 or more letters; the answer or an accepted id in the top `SUGGESTION_COUNT` fails. The typing rules apply to those clues only | error                                 |
| C13  | Every clue from `optionsFromClue` (`src/config/shared.json`) on, not clue 4 by index. It replaces the pipeline's C13                                                                                                                                                              | error                                 |
| C14  | A list request's `lr.` id in a mystery's entity fields: a draft may hold one (the schema takes it), an error from checking on                                                                                                                                                     | error                                 |
| C15  | Measured encores, by `units.json`: one per ten of a batch's planned target (at least one), 12 in the bank; the later ids are reported                                                                                                                                             | error                                 |
| C17  | A near-tie of years passes when `exactDates` are 365 or more days apart and each label claim states its day in words; then the pipeline's refusal of every near-tie is lifted                                                                                                     | error (warn: a needless `exactDates`) |
| C19  | Rebuilt on `superlatives.json`, with §2.13's exemptions: the standard comparison stems, "only" before a number or "a few", "most of". It replaces the pipeline's C19                                                                                                              | warn                                  |
| C22  | A sealed item that is a near-copy of a §12 example (error, replacing the pipeline's warning); a sealed mystery whose answer is a §12.7 answer (error); a §12.9 encore value (warn)                                                                                                | error, warn                           |
| C26  | The risk floor: a digit or number word, quotation marks, a superlative, "only", "first", "invented", "named after", "comes from" or "means", the key of a counterintuitive item, a sealed clue, value or input claim                                                              | error                                 |
| C27  | "Capital" beside a country from `capitals-excluded.json` (by its name or any name or alias of its list entry), or in any clue of a mystery whose answer is one                                                                                                                    | error                                 |
| C28  | The four clue-4 options, labelled as the server labels them, agree on brackets, ", Country" tails and spaced hyphens. It replaces the pipeline's X02 warning                                                                                                                      | error                                 |

## Severity by status

A rule new in CNT-2 (C26, C27, C28, and the additions to C08, C11, C12, C14, C15, C17 and C22) must not turn content red that an editor accepted before it existed, the policy CNT-1 set for its own additions (`cutoff.ts`):

- on an **active** item accepted before the rules landed (`verification.editor.decidedAt` before `RULES_LANDED_AT`) its findings are warnings, and `--launch` (QA-2's launch check) makes them errors again. An item accepted since met them at `content:decide`, which runs this folder's rules at their own severity, so they keep it;
- **cut** and **retired** items never ship and are never checked again, so these rules skip them;
- the risk floor (C26) decides which claims the checks must back with external evidence, so it is an error from **checking** on, a warning on a **draft** (the writer's selfCheck `claims` code confirms the floor before submitting, §9.3), and fixture trees, whose claims are never checked, skip it.

`lintAllow` waives what it always did (warnings, C06, C08, C09 and C17's near-tie refusal), before the status policy applies; a downgraded error is still not waivable.

## Tests

- `rules.test.ts`: a positive and a negative fixture for every rule C01 to C28 through `lintBank`, the additions above, the status policy and its cut-off, and CONTENT_GUIDE §12's sixty good examples as an oracle (none draws C04, C08, C11, C12, C13, C15, C17, C19, C26, C27 or C28; the denylist bars exactly the guide's answers and values).
- `reference.test.ts`: every reference file against its schema and against the guide (§3.4's capitals, §2.13's superlatives, §12's examples), and the unit constants against each other.
- `sealed-output.test.ts`: a sealed run of these rules, and of the audit check, prints only severity, id, rule code and path.
