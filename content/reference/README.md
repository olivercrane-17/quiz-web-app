# Reference files

The lint's word lists and constants (CONTENT_GUIDE §11.1, ARCHITECTURE §2.1). The editor owns them (§0.2). Each file has a schema in `scripts/content/lint/reference.ts`, and `content:check` refuses a file that fails it, a missing one, and any `.json` file here that no schema covers (C01).

| File                     | Read by  | Holds                                                                                                                                                |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `myths.json`             | C25      | Widely believed false claims, each with the word groups that match it                                                                                |
| `spelling.json`          | C10      | US and -ise spellings with their Oxford forms, and the proper nouns that keep their own                                                              |
| `stopwords.json`         | C12, C13 | Words the giveaway checks ignore                                                                                                                     |
| `slurs.json`             | C23      | The shared slur list, ROT13-encoded so the terms never show up in diffs, searches or logs                                                            |
| `superlatives.json`      | C19, C26 | The superlative words: the seven §2.13 names (first, only, record, most, least, best, worst) and the -est words and their kin                        |
| `capitals-excluded.json` | C27      | Countries with no single, settled capital (§3.4), each with its ISO code and reason: `multiple_or_none`, `moved` or `move_announced`, and what moved |
| `units.json`             | C15      | Exact unit definitions for calculation evidence (§9.5.4), by name, and the length, area, mass and speed units that make an encore a measured one     |
| `example-denylist.json`  | C22      | The ten §12.7 mystery answers and the ten §12.9 encore values, which never go into a Daily (§12.0)                                                   |

## Keeping them current

- **Superlatives.** Add a word when it states a record or a rank. Never remove one of the seven §2.13 names; the schema refuses that. Matching is by whole word, case folded, and "most of" never counts.
- **Capitals.** Add a country the moment its capital stops being single and settled (§3.4): a second capital, a move announced, a rename. C27 matches the `country` name here and every name and alias of its entry in `answer-lists/country.json`, joined on `iso_a2`. A moved or announced capital records what moved in `detail`.
- **Units.** Constants are exact definitions only, never measurements (the speed of light defines the metre, so it is exact; the Earth's radius is not). A calculation names the constants it uses by `name`. A measured unit goes under exactly one dimension, in lower case, as an encore's `unit` or `unitShort` writes it. Units with more than one meaning (tons, gallons, ounces, pints, cups, calories) never go here: C21 refuses them.
- **Example denylist.** It follows the guide: a test fails when it and §12.7 or §12.9 disagree.
- **Myths, spelling, stopwords and slurs** are described in `content/README.md`.

A change to a reference file can turn an item red overnight. Run `npm run content:check` (and, with the key, `npm run content:check -- --sealed`) before committing one.
