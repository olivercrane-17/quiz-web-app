# Content Guide: how we write and check every question

| | |
|---|---|
| Status | v1.0, binding for all content work |
| Owner | Head of content (editor-in-chief) |
| Date | 31 October 2026 |
| Who reads it | Writer, estimator, fact-checker, editor, list-builder, scheduler and auditor agents, plus the owner |
| Inputs | [00-PROJECT-BRIEF.md](./00-PROJECT-BRIEF.md), [01-ENGINEERING-CONSTRAINTS.md](./01-ENGINEERING-CONSTRAINTS.md), [02-PRODUCT-DECISIONS.md](./02-PRODUCT-DECISIONS.md) (binding), [PRD.md](./PRD.md) §3.13, §3.18 and §4, [research/SYNTHESIS.md](./research/SYNTHESIS.md) §7, [research/07-content-excellence.md](./research/07-content-excellence.md), [research/gap-3-difficulty-before-players.md](./research/gap-3-difficulty-before-players.md) |

This is the rulebook for every question we publish: the 1,500 practice items, the 360 Daily mysteries, the 120 encores, the 120 room-pack questions and the twelve closed answer lists. It tells writers what a good item looks like, checkers how to prove one right, the editor when to cut, and the scheduler what can run on which day.

**Precedence.** The decisions memo beats the PRD, and the PRD beats this guide on how the product behaves. On how content is written, checked, filed and scheduled, this guide is the authority. If you find a conflict, stop and raise it with the editor. Never pick a side quietly. Appendix A lists every place this guide refines the PRD and the questions it hands back to the product team.

**Words.** *Must* means the validator or the editor rejects the item when the rule is broken. *Should* means the editor needs a written reason, stored in the item, to accept an exception.

## 0. Start here

### 0.1 The rules on one card

1. Every question is a puzzle with a foothold. A player with partial knowledge can reason toward the answer.
2. One defensible answer. If a pedant could argue for a second one, rewrite.
3. Nothing that can change. Our writers' knowledge stops around mid-2026, so no current holders, records, champions, prices or populations.
4. Global English: Oxford spelling, months spelled out, metric units with imperial where it helps, and no single country's local knowledge.
5. Distractors are real confusions of the same kind as the answer. Never jokes, always definitely wrong.
6. Every explanation adds a surprising fact in 35 words or fewer.
7. Two independent checkers, blind to each other and to the writer's notes. Any doubt means cut or rewrite.
8. Never invent a source or a URL. Evidence is a dataset record we downloaded, a search result we were given, or a checker's knowledge, labelled as such.
9. Sealed content never lands in git in plain text. The repository is public.
10. Change the meaning, change the ID. IDs are never reused.

### 0.2 Roles

One agent run holds one role on any given item. Where the orchestrator can choose models, checker B runs on a different model family or size from the writer, because shared models make shared mistakes ([SYNTHESIS §7.6](./research/SYNTHESIS.md)).

| Role | Does | Never does |
|---|---|---|
| Writer | Drafts a batch, lists every claim, runs the lint, self-checks (§9.3) | Checks their own items, or sees checker records before both are complete |
| Estimator | Predicts difficulty from a blind packet (§8.5) | Edits text, or uses its own solve rate as difficulty |
| Fact-checker A ("confirm") | Verifies every claim as a subject expert and gathers external evidence for the high-risk ones (§9.4) | Sees the writer's notes, checker B's record or the estimate; edits the item |
| Fact-checker B ("refute") | Verifies every claim while trying to break the item (§9.4) | The same as checker A |
| Editor | Style, balance, dedupe calls, resolving disagreements, accepting or cutting; owns the batch register and the myths list | Accepts an item a checker failed without new evidence; edits an item they wrote or checked |
| List builder | Builds and checks the answer lists (§2.10) | Types a Wikidata id from memory |
| Scheduler | Assembles Dailies and room packs, runs the day check (§10) | Schedules an item that isn't `active` |
| Auditor | Runs the seeded audits (§9.10) | Audits a batch they wrote or checked |

### 0.3 The pipeline

| Step | Who | Output | Gate to the next step |
|---|---|---|---|
| 1. Draft | Writer | Item files, every item `draft` | Lint clean; claims listed |
| 2. Self-check | Writer | `writerNotes` on every item | The §9.3 checklist is complete |
| 3. Packets | Tooling | One blind packet per checker and estimator, each hashed | Packets exist |
| 4. Estimate | Estimator | `predicted` on every item | None; runs beside step 5 |
| 5. Check | Checkers A and B, in parallel | Two check records per item | Both records complete |
| 6. Resolve | Editor | A decision per item (§9.7) | Every item accepted, rewritten or cut |
| 7. Accept | Editor, then the validator | `status: active` | The acceptance rule in §9.9 passes |
| 8. Pack or schedule | Tooling and the scheduler | Practice packs, or entries in the sealed pool | §10 |

---

## 1. Categories

Twelve categories (PRD §3.18.1). "General knowledge" is a mix of them, never a category. Free tags ("flags", "1990s", "space") drive themed packs and the monthly pack (PRD §3.17).

**Targets.** Practice is 1,500 items: 125 per category, split 50 Easy, 50 Medium and 25 Hard (the PRD's 40/40/20). Inside each category, 100 are multiple choice, 12 true/false and 13 comparison, which makes the bank 80% multiple choice, 9.6% true/false and 10.4% comparison (PRD §3.18.2). The Daily pool holds 30 mysteries per category (10 per slot) and 10 encores per category: 360 and 120. No category may fall below 100 practice items. If one can't reach 125 at full quality, the editor may move up to 25 of its places to another category and records why in the batch register.

| # | Category | Slug (for URLs) | Code (the `category` value) | Share label (design may shorten) | Practice E / M / H | Mysteries E / M / H | Encores | Mystery answer types |
|---|---|---|---|---|---|---|---|---|
| 1 | Geography | `geography` | `geo` | Geography | 50 / 50 / 25 | 10 / 10 / 10 | 10 | country, city, landmark |
| 2 | History | `history` | `hist` | History | 50 / 50 / 25 | 10 / 10 / 10 | 10 | person, country, city, landmark |
| 3 | Science & Tech | `science-tech` | `sci` | Science & Tech | 50 / 50 / 25 | 10 / 10 / 10 | 10 | element, person |
| 4 | Nature & Animals | `nature-animals` | `nat` | Nature | 50 / 50 / 25 | 10 / 10 / 10 | 10 | animal, landmark (natural) |
| 5 | Film & TV | `film-tv` | `film` | Film & TV | 50 / 50 / 25 | 10 / 10 / 10 | 10 | film, tv_series, person |
| 6 | Music | `music` | `music` | Music | 50 / 50 / 25 | 10 / 10 / 10 | 10 | music_artist, city |
| 7 | Art & Design | `art-design` | `art` | Art & Design | 50 / 50 / 25 | 10 / 10 / 10 | 10 | person, landmark |
| 8 | Books & Literature | `books-literature` | `book` | Books | 50 / 50 / 25 | 10 / 10 / 10 | 10 | book, person |
| 9 | Sport & Games | `sport-games` | `sport` | Sport & Games | 50 / 50 / 25 | 10 / 10 / 10 | 10 | sport, person, city, country |
| 10 | Food & Drink | `food-drink` | `food` | Food & Drink | 50 / 50 / 25 | 10 / 10 / 10 | 10 | dish, country, city |
| 11 | Language & Words | `language-words` | `lang` | Words | 50 / 50 / 25 | 10 / 10 / 10 | 10 | any type, when the clues are about names and words |
| 12 | Society & Culture | `society-culture` | `soc` | Society | 50 / 50 / 25 | 10 / 10 / 10 | 10 | person, country, city, landmark, sport, dish |

Region rule for every category: everything at launch is tagged `global`, which means a typical adult in Lagos, Mumbai, Toronto or Sydney has about the same chance as one in London or Chicago. Regional packs come later (SYNTHESIS §6.7).

### 1.1 Geography (`geo`)
- **Covers:** the physical and human world: countries, capitals, cities, rivers, mountains, oceans, islands, deserts, borders, climate and maps.
- **Subtopics:** countries and capitals; mountains and rivers; oceans and islands; deserts and climate; cities and famous places; borders and enclaves; flags described in words; maps and navigation.
- **Fairness:** no continent above 30% of the category, and Europe plus North America together at most 50%. No sub-national trivia (US states, UK counties) unless the place is world-famous. Capitals only where the answer is single and settled (§3.4). Areas and distances in metric, with imperial in brackets where a player would want it.

### 1.2 History (`hist`)
- **Covers:** the people and events of the past and how everyday life worked, anywhere on Earth, at least 25 years before writing (so before 2001).
- **Subtopics:** ancient civilizations; medieval worlds (Europe, the Islamic world, China, West Africa, the Americas); empires and trade routes; exploration and encounters; revolutions and independence; the 20th century; how people lived; archaeology and lost cities.
- **Fairness:** at least 40% of items about the world outside Europe and North America. No more than 10% of the category on any one war. Casualty figures are never keys. National heroes and "firsts" only when undisputed (§3.5). US presidents and British monarchs only at world-famous level (Washington, Lincoln, Henry VIII, Victoria).

### 1.3 Science & Tech (`sci`)
- **Covers:** how the universe and our technology work: physics, chemistry, astronomy, Earth science, the human body, mathematics, computing, engineering and inventions.
- **Subtopics:** space and astronomy; elements and chemistry; forces and energy; the human body and medicine; Earth and weather; mathematics and numbers; computing and the internet; inventions and engineering.
- **Fairness:** SI units. Settled science only: no "latest discovery" and no counts that keep growing (moons of the giant planets, known exoplanets). Inventions credited with care (§3.5). Medical items state facts and never give advice.

### 1.4 Nature & Animals (`nat`)
- **Covers:** living things and the natural world: animals, plants, fungi, ecosystems, evolution, fossils and dinosaurs.
- **Subtopics:** mammals; birds; ocean life; insects and spiders; reptiles and amphibians; plants and fungi; dinosaurs and fossils; behaviour and senses.
- **Fairness:** species from every continent, not just familiar northern ones. Common English names, with both where regions differ: the animal Europeans call an elk is the North American moose. No conservation status or population counts, because they change. Records ("fastest") only with a defined measure and solid evidence.

### 1.5 Film & TV (`film`)
- **Covers:** films and TV series from anywhere, animation included, the people who make and star in them, awards, and how screen stories get made.
- **Subtopics:** classic cinema; blockbusters; animation; world cinema (Indian, Japanese, Korean, Nigerian, European); directors and performers (career facts); awards history; TV series; film-making and technology.
- **Fairness:** at least 25% of items about productions from outside the US. The release year is the year of first release anywhere. No box-office figures, streaming availability or "current" casts. Quotations are checked word for word, because famous lines are often misremembered (§12.3, Casablanca).

### 1.6 Music (`music`)
- **Covers:** music of every era and place: pop and rock, classical, folk and world music, instruments, basic theory, and the people who make it.
- **Subtopics:** pop and rock history; classical composers; instruments and how they work; world and folk music; songs and albums (historic); musicals and film scores; theory basics; recording and music technology.
- **Fairness:** artists known around the world, never one country's charts. No chart positions or sales records (regional, and they change). No lyrics beyond a title (copyright). Band line-ups only as dated facts.

### 1.7 Art & Design (`art`)
- **Covers:** visual art and the design of things: painting, sculpture, architecture, photography, graphic and product design, fashion and crafts.
- **Subtopics:** famous paintings; sculpture; architecture and buildings; art movements; design of everyday objects; photography; art from beyond Europe (Japanese ukiyo-e, Mughal painting, West African sculpture, Pacific art); fashion and textiles.
- **Fairness:** at least a quarter of items about art and design from outside Europe and North America. Contested heritage (looted objects, repatriation claims) is handled factually or left out. Where a work hangs is `slow` volatility (§3.4). Attributions experts dispute stay out.

### 1.8 Books & Literature (`book`)
- **Covers:** stories in every written form: novels, poetry, plays, children's books, myths and legends, comics and graphic novels, and their authors and characters.
- **Subtopics:** classic novels; poetry and poets; drama and Shakespeare; children's and young-adult books; myths and legends; world literature in translation; characters and opening lines; comics and graphic novels.
- **Fairness:** world literature, with original titles as aliases ("Cien años de soledad"). Avoid any one country's school syllabus. Quotations short and verified. No bestseller counts.

### 1.9 Sport & Games (`sport`)
- **Covers:** sports and games played around the world: the Olympics and Paralympics, football and other team sports, racket and combat sports, motor sport, board, card and video games, puzzles and chess.
- **Subtopics:** Olympic and Paralympic history; football (soccer) and the World Cup; tennis and other racket sports; athletics and swimming; board and card games; chess and puzzles; video games (historic); rules and equipment.
- **Fairness:** the football rule in §3.3. Sports watched mainly in one region (American football, baseball, cricket, rugby league, Australian rules) stay under 10% of the category and at recognition level. No current champions, records, rosters or rankings. Results only as dated facts ("won the 2010 World Cup").

### 1.10 Food & Drink (`food`)
- **Covers:** what people eat and drink and why: dishes and their origins, ingredients, cooking methods, food science, drinks and food customs.
- **Subtopics:** national dishes; ingredients and spices; baking and desserts; cooking and food science; fruit and vegetables; tea, coffee, juice and soft drinks; food history; food words and names.
- **Fairness:** both names for ingredients whose English names differ (§3.3). No contested origin stories as keys (pavlova, tiramisu, the croissant). The alcohol rule in §3.7. No prices or calorie counts, and no brand trivia beyond settled history.

### 1.11 Language & Words (`lang`)
- **Covers:** words and how we use them: etymology, idioms, alphabets and writing systems, the world's languages, names and the oddities of grammar.
- **Subtopics:** word origins; idioms and phrases; alphabets and scripts; languages of the world; names of places and things; grammar and punctuation; dictionaries and their makers; words English borrowed.
- **Fairness:** etymologies are high-risk claims and folk etymologies are everywhere (§12.3, "posh"). No speaker counts or "most spoken" rankings: they change and depend on definitions. US and British differences are fair game only when the question is about the difference. Mysteries here use the existing answer types, with clues about names (§1.13).

### 1.12 Society & Culture (`soc`)
- **Covers:** how people live together: festivals and traditions, beliefs described factually, philosophy, institutions, money, law, customs and symbols.
- **Subtopics:** festivals and calendars; world religions and their practices; philosophy and big ideas; how institutions work (parliaments, courts, the UN); money and trade; customs and etiquette; symbols and emblems; inventions of everyday life.
- **Fairness:** religions presented factually and respectfully, with dates from the calendar that sets them. No current politics, office holders, parties or polls. No "national character" items or stereotypes. Contested sovereignty is never the subject (§3.7).

### 1.13 When an item fits two categories

Classify by the knowledge needed to answer, not the topic named in the stem. A question about the copper in the Statue of Liberty that needs chemistry is Science & Tech; one about who designed its frame is Art & Design.

For mysteries the category is the clue angle and the answer type is the list. A Language & Words mystery may have a country as its answer when every clue is about names: Argentina, named from the Latin for silver, on an estuary the Spanish called the river of silver. That is how all twelve categories can host Daily mysteries with the twelve lists the PRD asks for.

---

## 2. Formats and exact schemas

[ARCHITECTURE.md](./ARCHITECTURE.md) §5 owns file formats, validation and build outputs, and its §3.2 holds the TypeScript content types. This section restates those formats for writers and adds the fields the checking protocol needs. Additions are marked **+**. The validator refuses unknown keys, so Appendix A asks for every addition to go into the content schemas (`src/content/schema/`, ticket CNT-1) before the first batch is submitted.

### 2.1 Conventions

- One item per file, so many writers and checkers can work at once without merge conflicts (ARCHITECTURE §5.1). UTF-8, Unicode NFC, LF line endings, two-space indent.
- Field names are camelCase, as in ARCHITECTURE §3.2. SQL uses snake_case, and the Supabase adapter converts between them. Enum values stay as ARCHITECTURE spells them (`tv_series`, `music_artist`).
- Practice items carry `format` (`mc`, `tf` or `comparison`). Sealed items carry `kind`: `mystery`, `encore`, or `choice` for room questions, which also carry `format: "mc"`.
- Text fields hold plain text: no Markdown, HTML, URLs or emoji. Use straight apostrophes and single quotation marks ('like this'), so JSON needs no escaping. Hyphens only, never en or em dashes. No double or trailing spaces.
- Dates in metadata are ISO 8601 (`2026-11-02`). Dates in player-facing text follow §3.3 ("3 April 1968").
- Numbers in JSON are numbers, never strings, with no thousands separators.

### 2.2 Where files live

| Content | Written as | Committed as |
|---|---|---|
| Practice item | `content/practice/<category-slug>/<id>.json` | Plaintext, because it ships to clients |
| Answer list | `content/answer-lists/<type>.json` | Plaintext, because it ships to clients |
| Mystery, encore, room pack, schedule, spare set | `content/.sealed-plain/<folder>/<id>.json`, with folders `mysteries`, `encores`, `room-packs`, `schedule` and `spares` | Only as encrypted envelopes, `content/sealed/<folder>/<id>.json.enc` (§11.2) |

### 2.3 Fields every item carries

| Field | Type | Required | Rule |
|---|---|---|---|
| `id` | string | yes | The pattern for its pool (§2.12) |
| `status` | `draft`, `checking`, `active`, `cut` or `retired` | yes | Writers submit `draft`. `active` means accepted under §9.9 |
| `category` | category code | yes | One of the twelve codes in §1 (`geo`, `hist` and so on) |
| `tags` | string[] | yes | 1 to 6 lowercase kebab-case tags |
| `region` | `global` or `region:<code>` | yes | `global` for everything at launch |
| `volatility` | `evergreen`, `slow` or `dated` | yes | §3.4. `fast` is never accepted |
| `reviewBy` | ISO date or null | yes | Required for `slow`: at most 24 months after acceptance. Null otherwise |
| `seededDifficulty` | integer 1 to 5 | yes | The writer's guess on the §8 scale. Encores carry it too (+), although ARCHITECTURE §3.2 leaves it off them |
| `predicted` | object | from `checking` on | The estimator's output (§8.5). Writers leave it out |
| `explanation` | string | yes | 35 words or fewer (§7) |
| `learnMore` | string | yes | The search term for the "Learn more" Wikipedia search link, usually the answer's name. Never a URL (PRD §3.18.3) |
| `counterintuitive` + | boolean | yes | True when the obvious answer is wrong (§3.1) |
| `claims` + | Claim[] | yes | Every checkable statement in the item (§9.2) |
| `writerNotes` + | string | no | What the writer checked and what they doubt. Stripped from checker packets |
| `lintAllow` + | object[] | no | Editor-approved exceptions: `{ "rule": "C19", "text": "...", "reason": "..." }` |
| `verification` | object | from `checking` on | The record in §9.8, whose shape is an addition (+) |

Mysteries and encores also carry `sourceLabels` (ARCHITECTURE §3.2), the reveal's sources line. Writers leave it empty. The editor fills it at acceptance from the evidence: dataset publishers and the names of Tier A or B sites. It stays empty when the key rests on knowledge alone, and nothing in it is ever invented.

### 2.4 Multiple choice (`format: "mc"`)

| Field | Type | Required | Rule |
|---|---|---|---|
| `stem` | string | yes | A question ending in "?", 120 characters or fewer (100 in rooms). Positive wording (§3.6) |
| `answer` | string | yes | The one correct option. 60 characters or fewer; aim for 24 or fewer so the desktop 2 by 2 grid works (PRD §3.0.3) |
| `wrong` | string[] | yes | 3 wrong options, or 2 when a fourth would be filler (§4). Same length limits as `answer` |
| `order` | `shuffle` or `ascending` | yes | `ascending` for numbers and dates, years included. Every option must then start with a number, and the engine sorts by it (PRD §3.3.2) |

### 2.5 True or false (`format: "tf"`)

| Field | Type | Required | Rule |
|---|---|---|---|
| `stem` | string | yes | A statement, not a question, 120 characters or fewer, with no negation (§3.6) |
| `answer` | boolean | yes | |
| `tfKind` + | `myth` or `surprising_truth` | yes | `myth`: a widely believed falsehood, so `answer` must be false. `surprising_truth`: a truth most people doubt, so `answer` must be true |

Keep each batch's true/false items within one of an even split between true and false.

### 2.6 Comparison (`format: "comparison"`)

| Field | Type | Required | Rule |
|---|---|---|---|
| `stem` | string | yes | The prompt for the relation (below), naming the measure when "bigger" could mean several things ("Which is bigger by area?") |
| `a`, `b` | string | yes | The two labels, 40 characters or fewer, in the same grammatical form |
| `answer` | `a` or `b` | yes | Must win under `relation` |
| `relation` + | enum | yes | From the table below |
| `measure` + | string | yes | What is compared, in plain words ("year it happened", "area", "atomic number") |
| `unit` + | string | yes | The unit of the values ("year", "km²", "° N", "protons") |
| `values` + | `{ "a": number, "b": number }` | yes | The checked values the relation compares |
| `valueDisplay` + | `{ "a": string, "b": string }` | yes | How the reveal shows them ("by 1096") |

| Relation | Standard stem | Wins |
|---|---|---|
| `earlier` | "Which came first?" (or "Which was invented first?", "Which was completed first?") | Lower value |
| `later` | "Which came later?" (prefer `earlier`) | Higher value |
| `larger`, `smaller` | "Which is bigger by area?", "Which is smaller by mass?" | Higher, lower |
| `more`, `fewer` | "Which has more letters?" | Higher, lower |
| `heavier`, `lighter`, `longer`, `shorter`, `taller` | "Which is heavier?" | Higher, lower, higher, lower, higher |
| `further_north`, `further_south` | "Which city is further north?" | Higher, lower latitude |
| `faster`, `slower`, `hotter`, `colder` | "Which is faster?" | Higher, lower, higher, lower |

Values: dates are signed years (1969 is AD 1969, -30 is 30 BC, -420000000 is 420 million years ago). Latitudes are decimal degrees with south negative. East and west comparisons are not allowed, because longitude wraps.

**Separation guard (lint C17).** Dates at least 10 years apart, or at least one calendar year apart when both are exact, undisputed days. Never the same year: that is a coin flip with no foothold. Quantities: the larger at least 1.1 times the smaller, except exact counts and defined values (atomic numbers, letters in an alphabet), where any difference works. Latitudes at least 0.5° apart, comparing city centres or named points, never whole countries.

### 2.7 Mystery (`kind: "mystery"`)

| Field | Type | Required | Rule |
|---|---|---|---|
| `answerType` | enum | yes | One of the twelve types in §2.10 |
| `answer` | entity id | yes | An active entry in that type's list |
| `accepted` | entity id[] | yes, may be empty | Up to 2 genuine equivalents from the same list (PRD §4.1.1), each approved by the editor |
| `clues` | string[4] | yes | Hardest first, each 140 characters or fewer (PRD §3.18.3). Rules in §5 |
| `distractors` | entity id[3] | yes | Same list, distinct, none in `accepted`. With the answer they make the four clue-4 options, which the server shuffles per attempt |
| `slot` | 1, 2 or 3 | yes | The difficulty: 1 is Mystery 1 (easy), 2 is Mystery 2 (medium), 3 is Mystery 3 (hard) |
| `sourceLabels` | string[] | yes | §2.3 |
| `likelyGuesses` + | entity id[] | yes | 6 to 12 entries players will plausibly type, mostly wrong ones. All must exist in the list (§5.3) |
| `rivals` + | object[] | yes | At least 3, each `{ "id": "...", "ruledOutBy": [1, 3] }` and ruled out by at least one of clues 1 to 3. This is the uniqueness proof (§5.4) |
| `giveawayTerms` + | string[] | yes, may be empty | Words beyond the name and aliases that would give the answer away ("kimjang" for kimchi). Banned from clues by lint C12 |
| `seedSolveShares` + | number[4] or null | no | The writer's forecast of the cumulative share of typical adults solved by each clue (§8.3) |

The four options on clue 4 are `answer` plus `distractors`. Aliases live on the answer-list entry, never on the mystery, so every mystery with the same answer shares them and the lint reads them from the list. The estimator's `predicted` for a mystery is `{ "solveByClue": [s1, s2, s3, s4], "spread": ..., "estimator": "v0" }`, with cumulative shares (Appendix A asks ARCHITECTURE to confirm "cumulative").

### 2.8 Encore (`kind: "encore"`)

| Field | Type | Required | Rule |
|---|---|---|---|
| `question` | string | yes | 120 characters or fewer. A "How many..." count, a question that names its unit, or "In what year..." |
| `valueKind` | `quantity` or `year` | yes | |
| `answer` | number | yes | The exact accepted value, already rounded to `decimals`. Positive. Years are whole numbers from 1 to 9999 (PRD §4.2.1) |
| `decimals` | 0, 1 or 2 | yes | How many decimals players may type. 0 for years |
| `unit` | string | yes | The unit word shown with the field and after numbers ("kilometres", "teeth", "years"). An empty string for years |
| `bands` | `{ "bullseye": n, "close": n }` or null | yes | Null means the defaults: bullseye within 5% and close within 15% for quantities, within 2 and 5 years for years (memo §2). Overrides use the same units (a fraction, or years); the reason goes in `writerNotes` |
| `sourceLabels` | string[] | yes | §2.3 |
| `derivation` + | object or null | yes | For a number built from other facts: `formula`, `inputs` (each with `claimId`, `value`, `unit` and `what`), `unrounded` and `rounding`. Null for direct facts |

The estimator's `predicted` for an encore (+) is `{ "pClose": ..., "pExact": ..., "spread": ..., "estimator": "v0" }` (§8.4).

### 2.9 Room packs

A pack is one sealed file, `room-packs/<pack-id>.json`: `{ "id": "around-the-world", "title": "...", "theme": "...", "questions": [ ... ] }` (ARCHITECTURE §5.1). `questions` holds exactly 15 items in play order, so the last is the double-points finale. Each question is a sealed choice item: `kind: "choice"`, `format: "mc"`, the §2.4 fields and the §2.3 fields except `predicted`, with an id `r.<pack-id>.<NN>`.

Room rules on top of §2.4: exactly 3 wrong options (the host screen shows four answers with letters and shapes), stems of 100 characters or fewer, options of 30 or fewer (aim for 24), and explanations of 25 words or fewer where possible, because the host screen reads them across a room.

### 2.10 Closed answer lists

A mystery's guesses can only be entries from its type's list (PRD §3.18.4). Lists are public: they ship to every client.

**File fields** (ARCHITECTURE §5.1): `type` (the answer type), `version` (an ISO date, new for every published change), `provenance` (each source with `source`, `license` and `retrievedAt`) and `entities`. The build adds the normalized `keys` (ARCHITECTURE §5.5); writers never do.

**Entity fields.**

| Field | Type | Required | Rule |
|---|---|---|---|
| `id` | entity id | yes | A Wikidata QID, or `x.<type>.<slug>` (§2.12). Never changes once anything references it |
| `name` | string | yes | The canonical name players type |
| `display` | string | yes | What suggestions and clue-4 options show: `name` plus the type's qualifier when the rule calls for one |
| `aliases` | string[] | yes | Other names a player might type: other spellings (Aluminum), former names (Constantinople), short forms (UK), native names and transliterations (Gisaengchung). Diacritic-free copies are unnecessary, because matching strips diacritics (PRD §4.1.3) |
| `popularity` | integer | yes | Wikidata sitelink count, which breaks ties in suggestion ranking (PRD §4.1.3). 0 until the enrichment job fills it, so ties fall to alphabetical order meanwhile |
| `qualifier` + | object | yes | The type's facts behind `display` (table below). Every person, TV series and music artist also carries a short `descriptor` |
| `source` + | string | yes | Where the entry came from: a dataset key with its locator, or a list batch id |
| `status` + | `active` or `retired` | yes | Retired entries stay in the file, so old guesses still resolve |
| `addedIn` + | ISO date | yes | The list `version` that added the entry (freeze rule below) |
| `wikidataId` + | string or null | no | A QID found later for an `x.` entity. The `id` itself never changes |
| `replacedBy` + | entity id or null | no | For merged duplicates |

**Types.** The type names and files follow ARCHITECTURE §3.2; minimums and targets come from PRD §3.18.4.

| `type` | File | Player line | Minimum | Target | `display` rule | `qualifier` |
|---|---|---|---|---|---|---|
| `country` | `country.json` | a country | 190 | about 250 | The CLDR 49 English short name, with editor overrides for awkward forms ("Congo - Kinshasa" becomes "Democratic Republic of the Congo"). CLDR variants become aliases | `iso_a2` |
| `city` | `city.json` | a city | 300 | 500 | "Name, Country", with the country's display name | `country`, `admin1` |
| `person` | `person.json` | a person | 1,000 | 3,000 | The name most English sources use, plus a bracketed descriptor only when two entries share a name ("Michael Collins (astronaut)") | `descriptor`, `born` |
| `film` | `film.json` | a film | 500 | 1,500 | "Title (Year)", year of first release | `year` |
| `tv_series` | `tv_series.json` | a TV series | 200 | 500 | "Title", plus "(UK)", "(US)" or a year when titles collide | `descriptor`, `country`, `startYear` |
| `book` | `book.json` | a book | 300 | 800 | "Title (Author)" | `author`, `year` |
| `animal` | `animal.json` | an animal | 300 | 600 | Common English name, singular | `scientificName` |
| `element` | `element.json` | a chemical element | 118 | 118 | IUPAC English name: Aluminium, Caesium, Sulfur | `symbol`, `number` |
| `landmark` | `landmark.json` | a landmark | 200 | 400 | "Name, Country", built or natural | `country` |
| `music_artist` | `music_artist.json` | a musician or band | 500 | 1,500 | The name, plus a descriptor only on a collision inside the list | `descriptor`, `kind` (`solo`, `band`, `composer`) |
| `dish` | `dish.json` | a dish or drink | 200 | 400 | Common English name, with other English names as aliases | `origin` (ISO code or null) |
| `sport` | `sport.json` | a sport or game | 100 | 200 | Common English name; association football is "Football (soccer)" | none |

**List rules.**
1. One entity, one list. People famous mainly for music go in `music_artist`; everyone else goes in `person`.
2. Lists are global and stable. They are never filtered per Daily, so the list itself gives nothing away (PRD §3.18.4).
3. Size: at least 30 entries to serve Mystery 1 and 100 to serve Mysteries 2 and 3 (PRD §3.18.4). Every list reaches the table's minimum before launch.
4. Coverage beats size. Every scheduled mystery's answer, distractors, rivals and likely guesses must be active entries. A player who types a sensible wrong guess and sees "No matches" thinks the game is broken.
5. Freeze. An entry can be a scheduled answer only 30 days after the list version that added it went live, and each new list version adds at least 20 entries, so no single new entry stands out in a diff of the public file.
6. Qualifiers. Films, books, cities and landmarks always show theirs. People, TV series and music artists show a descriptor only on a collision. If any clue-4 option shows a descriptor, all four must (Appendix A, item 6), and writers pick distractors whose display forms match the answer's form. An answer that is the only option with a bracket is a giveaway.
7. Places whose sovereignty is disputed are guessable entries, but never answers or distractors, and never the subject of a question about status.
8. ISO codes are not aliases, except the forms people really type (UK, US, USA, UAE).
9. Avoid aliases that normalize to another entry's name unless the two are true namesakes.
10. Each list ships as hashed static JSON of 80 KB gzipped or less (PRD §8.1). Each list's `provenance` feeds `/credits` (§9.5.1).

### 2.11 Schedule records

Schedules follow ARCHITECTURE §5.1: one sealed file per month, `schedule/<yyyy-mm>.json`, holding `{ "track": "main", "dailies": [ { "date": "2026-12-01", "rounds": [ { "type": "mystery", "difficulty": "easy", "contentId": "m.geo.0103" }, ... ] } ] }`. Daily numbers are never authored; they come from `DAILY_EPOCH`. Each daily also carries `status` + (`assembled`, `frozen` or `published`, §10.7), `predictedPoints` + (the sum of its mysteries' predicted expected points, §8.3) and `dayCheck` + (the §10.6 record: checker, date, issues, verdict). The 20 spare sets live in `spares/` with the same round records and no date.

### 2.12 IDs

IDs are stable: never renumbered and never reused. The patterns are ARCHITECTURE's (§2.4). This guide adds one rule so parallel writers can't collide: in practice, mystery and encore IDs, the first two of the four digits are the batch number from the register (§11.3), and the last two are the sequence inside the batch.

| Pool | Batch id in the register | Item ID | Example |
|---|---|---|---|
| Practice | `p.<cat>.b<BB>` | `p.<cat>.<BB><SS>` | `p.geo.0317`: batch 03, item 17 |
| Mystery | `m.<cat>.b<BB>` | `m.<cat>.<BB><SS>` | `m.hist.0207` |
| Encore | `e.b<BB>` | `e.<BB><SS>` | `e.0104` |
| Room question | `r.<pack-id>.b01` | `r.<pack-id>.<NN>`, NN from 01 to 89 | `r.around-the-world.12` |
| Answer entity | `l.<type>.b<BB>` | A Wikidata QID, or `x.<type>.<slug>` | `x.city.cordoba-ar` |
| Fixture | | Prefixed `fx.` (ARCHITECTURE §5.6) | |

- `<cat>` is the category code from §1 and `<pack-id>` the pack id from §10.9.
- Agent ids: `w-` writer, `es-` estimator, `fc-` checker, `ed-` editor, `lb-` list builder, `sc-` scheduler, `au-` auditor, each followed by the run id.
- Batch `00` (`p.geo.0001` to `p.geo.0099` and so on) and room sequences 90 to 99 are reserved for the examples in this guide. The validator rejects them anywhere under `content/`.
- Entity ids. Use a QID only when it was copied from a dataset record that carries one (MoMA's `Wiki QID`) or written by the enrichment job (§9.5.1). Otherwise use `x.<type>.<slug>`. Never type a QID from memory. Once any item references an entity, its id never changes; a QID found later goes in `wikidataId`.
- Slugs: lowercase ASCII, diacritics transliterated, words joined by hyphens, plus the type's disambiguator: a city's ISO country code (`x.city.cordoba-es`), a film's year (`x.film.heat-1995`), a book's author surname (`x.book.frankenstein-shelley`), a TV series' country (`x.tv_series.the-office-us`) and a descriptor for people who share a name (`x.person.michael-collins-astronaut`).
- **Change the meaning, change the ID.** Before acceptance, edit freely. After acceptance, a wording fix that changes no claim keeps the ID, and git history records the change. A changed key or a different question gets a new ID in a new batch, and the old one is `retired`. The one exception: a sealed item that has already been played keeps its ID and logs the correction, so attempts and rescoring still point at it (PRD §3.13.4).

### 2.13 Machine checks (the content lint)

`npm run content:check` (ARCHITECTURE §5.2) runs these on every save. "Error" blocks; "warn" needs the editor to clear it or record a `lintAllow`. L1 to L8 are the creator-lint rules in PRD §3.9.4, which are warnings for players' quizzes and errors for ours. The checks beyond ARCHITECTURE §5.2 are listed in Appendix A for CNT-1.

| ID | Applies to | Check | Severity |
|---|---|---|---|
| C01 | all | Schema valid for its file type | error |
| C02 | all | Explanation of 35 words or fewer (whitespace-separated tokens) | error |
| C03 | mc, tf, comparison | Stem of 120 characters or fewer; 100 in rooms | error |
| C04 | mc | Option over 60 characters (30 in rooms) is an error; over 24 is a warning | error, warn |
| C05 | mc | "All of the above", "none of the above", "both of these" or "neither" as an option (L1) | error |
| C06 | stems, tf statements | "not", "never", "except" or "isn't" as words (L2); warning in clues | error |
| C07 | mc | Answer longest by more than 50% and more than 15 characters (L3) | error |
| C08 | all text | Numeric dates such as 03/04/2025 or 2025-04-03 (L6) | error |
| C09 | all text | Time words: current, currently, latest, now, today, this year, recent, recently, newest, reigning, so far, to date, as of (L7 and more) | error |
| C10 | all text | A US spelling from `content/reference/spelling.json` outside the proper-noun allowlist | warn |
| C11 | all text | En dash, em dash, double space, URL, HTML or Markdown | error |
| C12 | mystery | A clue over 140 characters, or a clue containing the answer's name, an alias, a significant word of either (4 or more letters, not a stopword), a word that begins with one, or a giveaway term. A clue word sharing its first four letters with a significant word is a warning | error, warn |
| C13 | mystery | Clue 4 contains any significant word of the answer's display form, qualifier included | error |
| C14 | mystery | Answer, distractors, rivals and likely guesses exist and are active; distractors distinct and of the same type; the answer older than the freeze | error |
| C15 | encore | Positive answer; a year is a whole number from 1 to 9999; `decimals` from 0 to 2 and matching `answer`; a quantity of 20 or more unless `bands` is overridden; no temperature or ambiguous units | error |
| C16 | tf | `tfKind` matches `answer`; the statement has no "?" | error |
| C17 | comparison | The answer wins under the relation; the separation guard (§2.6) | error |
| C18 | mc | `ascending` options all start with a number; no duplicate options (case and spacing ignored) | error |
| C19 | all | A superlative or "first" word (first, only, largest, biggest, oldest, tallest, longest, most, highest, fastest, record) without a high-risk claim | warn |
| C20 | all text | The bare word "football" without "(soccer)" or "American" (§3.3) | warn |
| C21 | all text | Ambiguous units: ton, tons, gallon, ounce, pint, cup, calorie; °C or °F in an encore | error in encores, warn elsewhere |
| C22 | all | A near-duplicate of an item in the bank or in this guide | warn; the editor decides |
| C23 | all text | A term on the shared slur list (PRD §3.9.4) | error |
| C24 | ids | ID pattern, batch registered to this writer, no reserved example IDs under `content/` | error |
| C25 | claims | A hit on `content/reference/myths.json` | warn; the checker decides |

---

## 3. Writing rules

### 3.1 Interesting and gettable

People are most curious when they think they almost know ([Kang et al.](https://pubmed.ncbi.nlm.nih.gov/19619181/)), so a good item lives in that zone. "Gettable" means a player with partial knowledge can reason toward the answer. Obscurity never makes a question good.

- **The foothold rule.** Give the player something to reason from. "What is the atomic number of rhodium?" has none: you know 45 or you don't. "Which element's name comes from the Greek for 'rose'?" lets a player reason from roots and the colour of its salts. Routes that work: word roots, elimination, geography, era logic, scale and estimation, and a famous neighbour fact.
- **The "tell someone" test.** The answer or the explanation should be worth repeating to a friend.
- **Hard is not obscure.** A Hard item is one most people miss but a good reasoner can still reach. If nobody could get there without having memorized the fact, it's a bad item at any difficulty.
- **About one item in four is counterintuitive:** written so the obvious guess is wrong, because confident errors are the ones people remember fixing ([Learning Scientists](https://learningscientists.org/blog/2023/8/3-1); SYNTHESIS §7.3). Mark it `counterintuitive: true`. It must mislead through a plausible belief, never through a misread word, and its explanation must defuse the trap. Confident players report exactly these items (PRD §3.13.3), so their evidence has to be solid.

### 3.2 One unambiguous correct answer

Most disputes come from a handful of places ([07 §2](./research/07-content-excellence.md)):

- **Undefined superlatives.** Everest is the highest mountain above sea level; Mauna Kea is the tallest from base to summit. Name the measure.
- **Measurement disputes.** The Nile and the Amazon swap places depending on where you measure from. Leave such pairs out.
- **Counting conventions.** Six continents or seven depends on where you went to school.
- **Contested firsts.** Brazil credits Alberto Santos-Dumont with the first powered flight. See §3.5.
- **Near-ties.** Nintendo was founded in the year the Eiffel Tower opened. See the separation guard in §2.6.
- **Names that changed.** Say which one you mean: "Constantinople (modern Istanbul)".

**The rival test.** Before you submit, argue for each distractor as hard as you can, then argue against the key. If any argument survives, rewrite. Checker B will run the same test (§9.4).

### 3.3 Global English

**Spelling: Oxford spelling** (British spelling with -ize endings). Why this one:
- It is the spelling the UN system uses in its own names, the World Health Organization and the International Labour Organization, so it reads as international English rather than one country's.
- Players in the UK, Ireland, India, South Africa, Australia and New Zealand learn -our and -re forms, and Americans already write -ize, so Oxford spelling sits closer to both groups than either national standard does.
- It matches the PRD's own player-facing copy ("in kilometres", "1 November").

The rules: colour, centre, metre, litre, theatre; organize and realize, but analyse and paralyse; the -ise verbs that never take -ize (advertise, advise, comprise, compromise, devise, exercise, revise, supervise, surprise, televise); travelled, labelled, jewellery, fulfil; haemoglobin, palaeontology, manoeuvre; defence, offence, licence (noun), practice (noun) and practise (verb); programme (but a computer program); grey, tyre, mould, plough, catalogue, ageing, judgement, speciality, chilli. Element names follow IUPAC: aluminium, caesium, sulfur. Proper nouns keep their own spelling (Pearl Harbor, the Lincoln Center, the Labour Party), and so do quotations. Answer lists carry both spellings as aliases, so a player is never marked wrong for spelling the way they were taught (PRD §8.7).

**Words.** Pick words everyone knows ("film", "phone"). For food and everyday words that differ, give both names the first time: aubergine (eggplant), courgette (zucchini), coriander (cilantro), prawns (shrimp), crisps (potato chips), chips (French fries), biscuits (cookies), sweets (candy). Avoid words whose meaning changes by country: pants, first floor, public school, jumper. A billion is a thousand million.

**Football.** Never write the bare word. Name the competition ("the men's FIFA World Cup"), or write "football (soccer)" for the association game and "American football" for the gridiron one (lint C20).

**Dates and numbers.** "3 April 1968", never 03/04/1968 (lint C08). "The 1990s", "the 19th century", "around 2560 BC", "AD 79". Digits for numbers, a comma between thousands (1,250), a point for decimals.

**Units.** Metric first, with imperial in brackets when an everyday reader would want it: "3.8 km (2.4 miles)", "465 °C (870 °F)". Never units with more than one meaning: tons, gallons, ounces, pints, cups, calories (lint C21).

**Seasons and holidays.** Seasons flip between hemispheres, so name the months or the hemisphere. Holidays move between countries, so name the country ("US Thanksgiving").

**Names.** People in the form most English sources use, with their diacritics: Karel Čapek, Antonín Dvořák, Gabriel García Márquez. Places by their established English names (Munich, Rome) and modern countries by their current English short names (Czechia, Eswatini), with former names given in context.

**Local knowledge.** Questions only one country's school or television would teach stay out of the launch bank: US presidents and British monarchs beyond the world-famous few, cricket and NFL statistics, national game shows, local chains.

### 3.4 Nothing that can change

The models drafting our content know little after mid-2026, and the bank has to stay right for years. So nothing time-sensitive enters it (SYNTHESIS §7.6).

**Never:** current office holders and leaders; reigning champions and title holders; records that can be broken ("tallest", "fastest", "best-selling", "highest-grossing") unless dated; "latest", "newest" or "recent"; prices and exchange rates; populations and rankings by population unless historical and dated ("at the 1901 census"); counts that keep growing (moons of Saturn, known exoplanets, World Heritage Sites, members of a body); conservation status; who is in an active band; where something is streaming.

**Volatility classes** (SYNTHESIS §7.8):

| Class | Meaning | `reviewBy` | Example |
|---|---|---|---|
| `evergreen` | Can't change: laws of nature, settled history, who made a work | null | "Dalí painted The Persistence of Memory" |
| `slow` | True now and stable, but could drift | At most 24 months after acceptance | "MoMA has held it since 1934" |
| `dated` | The year sits in the text, so the fact can't expire | null | "In 1998 Titanic won 11 Academy Awards" |
| `fast` | Changes within months | Never accepted | "The current Formula 1 champion" |

**Things that changed recently and catch writers out:** Kazakhstan's capital became Nur-Sultan in 2019 and Astana again in 2022; Swaziland became Eswatini in 2018; Pluto became a dwarf planet in 2006; Indonesia is moving its capital; Croatia adopted the euro in 2023; Saturn's count of known moons has changed several times since 2019.

**No capital questions** for countries with more than one capital or a disputed one (Bolivia, South Africa, the Netherlands, Sri Lanka, Malaysia, Côte d'Ivoire, Tanzania, Benin, Eswatini, Israel), or whose capital moved or was renamed since 1990 (Kazakhstan, Myanmar, Nigeria, Indonesia). The countries file we checked even lists three capitals for South Africa (§9.5.1).

### 3.5 Superlatives and "first" claims

These go wrong more often than anything else ([07 §7](./research/07-content-excellence.md)), so they are high-risk claims that need external evidence (§9.2).

- **Name the measure and the scope:** "highest above sea level", "largest by area", "the hottest surface of any planet". Venus has the hottest surface, but Jupiter's interior is far hotter, so "the hottest planet" is ambiguous.
- **Turn a contested first into a documented event.** "Who invented the telephone?" has rival answers. "Who received the US patent for the telephone in March 1876?" has one.
- **Date every record.** "The world's tallest building when it opened in 2010", never "the world's tallest building".
- **"Only" over a living set is a record.** "The only person to win Nobel Prizes in two sciences" could be overtaken; "the first person to win two Nobel Prizes, in 1911" can't.
- **Prefer bounded claims.** "Less than 5 km apart" survives a slightly different measurement; "3.8 km apart" may not. Write the claim at the precision you can defend (the precision ladder, §9.2).

### 3.6 Fair play

- **No trick questions.** A question may mislead through a plausible belief, never through a misread word. "How many animals of each kind did Moses take on the Ark?" is a trick: it was Noah ([07 §1](./research/07-content-excellence.md)).
- **Positive stems.** No "not", "never", "except" or "isn't" (lint C06). Ask the other way round.
- **No "all of the above" or "none of the above"**, and no "both" or "neither" (lint C05).
- **True/false is only for myths and surprising truths** (§2.5). It is at most 1 in 10 of any practice run (PRD §3.3.1) and about 10% of the bank. A plain fact ("The Sun is a star") is not a true/false item.
- **The answer is never in the stem**, and never in another item served the same day.
- **No "which of these" lists where three options are silly.** Every option must tempt someone.

### 3.7 Sensitivity

The audience is 13 and over (memo §8), and rooms run at office parties, so:
- No tragedies, disasters, crimes, illness or deaths as punchlines or puzzle hooks. They appear only as history, in a factual and respectful tone.
- No answers famous mainly for atrocities.
- No slurs, sexual content, gratuitous violence, drug use or gambling.
- Alcohol appears only as history, geography, science or production facts, never as encouragement, and drinks items stay under a fifth of Food & Drink.
- Religions and festivals: factual, respectful, no ranking of beliefs.
- No stereotypes about nationalities, ethnic groups, religions or genders.
- Living people: public achievements only. No private lives, health, relationships or legal troubles, and never a living person as a distractor for a crime or scandal ([07 §3](./research/07-content-excellence.md)).
- Disputed sovereignty and borders are never the subject of a question.
- No song lyrics or long quotations: titles are fine, and quotations stay to a few verified words.

### 3.8 Length and readability

Stems at most 120 characters (aim for 100), options aim for 24 characters, clues at most 140, explanations at most 35 words. One idea per stem. No double negatives or nested clauses. Everything must read well aloud, because read-aloud mode and screen readers speak it (PRD §3.12), so prefer words to symbols wherever both fit.

---

## 4. Distractors

Distractors decide the quality of a multiple-choice question. Three good options beat four with a filler ([Rodriguez](https://doi.org/10.1111/j.1745-3992.2005.00006.x)), and many exam distractors attract almost nobody ([07 §3](./research/07-content-excellence.md)).

1. **Same kind and form.** Cities with cities, years with years, full names with full names, all in the same grammatical form.
2. **Plausible.** Each one is a real confusion. The best come from the same set (Sydney and Melbourne for Australia's capital), the popular misconception, a neighbour in time or place, a same-type entity of similar fame, or a near number.
3. **Definitely wrong.** Every distractor is a checked claim with role `distractor`. If it is right under any reasonable reading, it goes.
4. **Similar length.** The key is never the longest option by more than 50% and 15 characters (lint C07). Vary which option is longest across a batch.
5. **Not jokes.** No absurd fillers, no comic options, nothing that makes a player feel tricked.
6. **No cues.** No option that echoes the stem's wording, no pair of opposites that points at the key, no absolutes ("always"), no grammar that only fits the key ("an" before the one vowel-led option), no option that contains another, no overlapping ranges.
7. **Numbers.** Spread them sensibly, never one apart unless the answer is a small exact count. Don't always put the key in the middle or make it the only round number. Use the same unit in every option. The engine sorts them ascending (`order: ascending`).
8. **No odd-one-out key.** Test-wise players pick the option that shares the most features with the others, as 1912 does among 1912, 1921, 1812 and 1915 ([07 §3](./research/07-content-excellence.md)).
9. **Three distractors by default; two when a fourth would be filler** (only three classes of rock exist). Never pad.
10. **After launch,** a distractor that draws under 5% of picks is dead weight: replace it or drop to three options (§8.6).

Clue-4 options for mysteries follow the same spirit with list-specific rules (§5.5).

---

## 5. Mystery ladders

A mystery is one answer, an answer-type line ("The answer is a country"), four clues from hardest to easiest, and four options on clue 4. A solve on clue 1 earns 4 points, clue 2 earns 3, clue 3 earns 2 and clue 4 earns 1 (memo §2). The ladder works like a quiz-bowl tossup: the expert gets in early, and the last clue still rewards passing knowledge ([07 §1](./research/07-content-excellence.md)).

### 5.1 What each clue does

Shares below are cumulative: the share of typical adults (§8.1) who have solved it by that clue. They are typical shapes, not rules. The rule is the expected-points window in §8.3, and these shapes land inside it.

| Clue | Job | Mystery 1 (easy) | Mystery 2 (medium) | Mystery 3 (hard) |
|---|---|---|---|---|
| 1 | Hard but fair: a specific, lesser-known fact that points to one answer for anyone who knows it | 45 to 65% | 25 to 40% | 10 to 25% |
| 2 | Narrows the field: era, region, field or form | 75 to 90% | 50 to 65% | 30 to 45% |
| 3 | A well-known association that still avoids the name | 88 to 97% | 75 to 88% | 55 to 70% |
| 4 | Easy: the fact most people know, plus four options | 96% or more | 92% or more | 85% or more |

"Hard but fair" is relative to the slot. Clue 1 of an easy mystery is something about half of players know; clue 1 of a hard one is something an enthusiast knows.

### 5.2 Ladder rules

1. **Every clue is true and specific.** Each clue is its own claim with its own verdict (§9.2).
2. **Clue 1 is hard but fair:** something a person who knows the topic knows. Never a footnote (a postcode, a catalogue number) and never a riddle.
3. **Clue 1 should point to one answer on its own,** the quiz-bowl standard, so an early guess is knowledge, not a gamble. **Clues 1 to 3 together must fit exactly one list entry**, proved by `rivals` (§5.4).
4. **Each clue narrows.** The set of plausible answers shrinks at every step, and the predicted cumulative solve share rises at every clue.
5. **Clue 4 is easy:** the most famous fact, without the name.
6. **No clue gives the answer away in text.** No clue contains the answer's name, an alias, a significant word from either, or a giveaway term (lint C12). Watch prefixes: the suggestion box matches the start of names and words (PRD §4.1.3), so "Parisians" gives away Paris, "Constantine" gives away Istanbul through its alias Constantinople, and "kimjang" gives away kimchi. List such words in `giveawayTerms`.
7. **Clue 4 contains no word of the answer's display form,** qualifier included (lint C13), because the four options show display forms. "Mary Shelley's novel" on clue 4 would point straight at "Frankenstein (Mary Shelley)".
8. **No time-sensitive clue** (§3.4). Dated clues are fine.
9. **Each clue is 140 characters or fewer,** one or two short sentences, readable aloud. Pronouns ("it", "she") are fine. A clue may build on the one before, but must stay true on its own.
10. **The recognition floor.** Most players must recognize the answer among the four options. Hard mysteries are hard because their clues go deep, never because the answer is obscure.
11. **The answer, distractors, rivals and likely guesses are active list entries,** and the answer has passed the 30-day freeze (§2.10).
12. **The category is the clue angle; the answer type is the list** (§1.13).
13. **No clue relies on images, audio, video or the player's location.**
14. **Pronouns and gender.** Clues that say "she" make male distractors useless, so choose distractors that fit the pronoun.

### 5.3 Likely guesses and coverage

List 6 to 12 entries that players will plausibly type at clues 1 to 3, most of them wrong: the neighbours, the famous alternatives, and the guess clue 1 seems to invite. Every one must exist in the list. This does three jobs. Players never meet "No matches" for a sensible guess, the "most common wrong guess" line has real candidates (PRD §4.1.5), and the list builder knows what to add before the mystery can be scheduled.

### 5.4 Uniqueness: the rival search

Writers do this before submitting, and both checkers repeat it blind.

1. Read clue 1 alone. Write down every list entry that fits it. If more than one fits, tighten clue 1.
2. Add clue 2, then clue 3, and strike every candidate that no longer fits.
3. Hunt for rivals on purpose: same-type entities of the same era, region, field or fame, the famous alternative, and anything sharing a striking fact with the answer.
4. Record at least three of them in `rivals`, each with the clues that rule it out. After clue 3 only the answer may remain.

Mary Shelley began Frankenstein during the 1816 ghost-story contest at Lake Geneva, but so did John Polidori, whose The Vampyre came out of the same nights. "Its author began it during a ghost-story contest" fits both books. "Its author began it aged 18" fits only one, because Polidori was 20 (§12.7).

### 5.5 Clue-4 options

- The three distractors come from the same list as the answer.
- **Plausible at a glance:** the same era, region, field or fame, and matching the clue's pronoun.
- **Definitely wrong:** each distractor contradicts at least one of the four clues, and no distractor fits all four. A distractor may fit some clues; that is what makes it tempting (the Who also played Live Aid at Wembley).
- **Parallel display forms:** never let the answer be the only option with a bracket or a qualifier (§2.10, rule 6).
- A distractor that was a Daily answer in the last 7 days should not appear (§10.5).

### 5.6 The mystery explanation

It adds something none of the clues said, ties the clues together, or defuses the likeliest wrong guess. It never just restates a clue.

---

## 6. Encores

The Encore ends every Daily. It scores no points but breaks ties, so its job is to spread the crowd: almost nobody should know the number exactly, and almost anybody should be able to have a sensible go. A bullseye is within 5% (or 2 years) and "close" within 15% (or 5 years) (memo §2).

1. **Stable numbers.** Values that can't move: counts in a design (squares on a chessboard), historical durations, astronomical and geographical constants, and dated facts. No populations, prices, records or current counts, and nothing that an antenna, a resurvey, a renovation or a redefinition can change: the Eiffel Tower's official height has changed several times as antennas were added.
2. **One definition.** If two reputable sources give different values, the encore fails. While writing this guide a search for the Louvre pyramid's pane count turned up 673 (the Louvre's figure) and 689 (attributed to I. M. Pei's office), so that encore is out (§12.10). Lengths and areas with competing definitions (canals, coastlines, rivers, countries with overseas territories) are out unless the question names the definition.
3. **Unambiguous units.** The question names its unit or asks for a count. Metric units; never tons, gallons, ounces, calories or "degrees" (lint C21).
4. **A true zero.** Bands use relative error, so quantities must sit on a scale with a real zero: counts, lengths, masses, durations, speeds, ratios. Never °C or °F, where "10% off" means nothing. Dates use `valueKind: year`.
5. **Big enough.** Quantity answers of 20 or more, so a 5% bullseye allows at least ±1. Smaller answers need a `bands` override with a reason, or a different question. Years run from 1 to 9999 (PRD §4.2.1), so no BC years.
6. **Interesting to estimate.** A typical adult can get within a factor of three by reasoning, few know it exactly (predicted exact share under 5%, never over 10%), and the reveal surprises.
7. **Lookup resistance is welcome, not required.** A derived number (a ratio, a sum) resists a quick search (SYNTHESIS §7.5). Every input is its own verified claim, and the arithmetic goes in `derivation`.
8. **Store the precision the evidence supports.** The Sun's volume is "about 1.3 million" times Earth's: store 1,300,000, not 1,302,097.
9. **Years are at most a quarter of encores** (30 of 120). Skip years everybody knows exactly, such as the Moon landing, because exact ties stop the Encore breaking ties.
10. **Bands.** The defaults suit almost everything. Override only with a written reason, and never widen a bullseye beyond 10%.
11. **The explanation shows the way there** (the reasoning, or the surprise), plus the other unit where it helps.
12. **Equally guessable everywhere.** "How many US states are there?" is a count Americans learn at school, so it fails the global rule.

---

## 7. Explanations

Feedback that explains beat feedback that shows the right answer, which beat right-or-wrong alone, with effects of about 0.49, 0.32 and 0.05 ([Van der Kleij et al.](https://doi.org/10.3102/0034654314564881)). A 35-word line takes about 9 seconds to read ([Brysbaert](https://doi.org/10.1016/j.jml.2019.104047)).

- **35 words or fewer**, counted as whitespace-separated tokens, numbers included (lint C02). Room explanations aim for 25.
- It shows after right and wrong answers, so it must work for both.
- **It adds a surprising, verifiable fact.** It never just restates the key. "The capital of Australia is Canberra" is a restatement; "Sydney and Melbourne both wanted the title, so the constitution put the capital in New South Wales but at least 100 miles from Sydney" earns its place.
- For a counterintuitive item, it defuses the most likely wrong pick.
- **Every fact in it is a claim** (role `explanation`), checked exactly like the key.
- No URLs, no "according to", no source names unless they are part of the fact. "Learn more" carries further reading through `learnMore`.
- Warm and plain: no exclamation marks, no "Did you know?", no puns that need explaining, no jokes at anyone's expense.

Patterns that work: defuse the trap (Canberra); show the method (the chessboard's 204 squares); connect the clues (a mystery); the human detail (Queen's guitarist finishing a PhD in astrophysics in 2007); the story behind a myth (Viking horns owe much to 19th-century opera costumes).

---

## 8. Difficulty before any player data

Nobody has played our questions yet. Writers guess difficulty, an estimator predicts it, and play decides it (SYNTHESIS §7.10). Text-based estimates rank items roughly, with an error of about 13 to 21 points, and nothing reaches ±10 points without human answers ([gap 3](./research/gap-3-difficulty-before-players.md)). So we set wide bands, assemble from buffered windows (§10.2) and re-tune weekly from play.

### 8.1 The typical adult

Every share in this section means: an English-speaking adult from any country we serve, not a trivia fan, answering alone without looking anything up, seeing the options exactly as served.

### 8.2 Practice and room questions

Bands follow the PRD's cut-offs on the predicted correct rate *p*: Easy *p* ≥ 0.75, Medium 0.45 ≤ *p* < 0.75, Hard *p* < 0.45 (PRD §3.3.3).

| `seededDifficulty` | Share of typical adults who pick the right answer | Band | Feels like |
|---|---|---|---|
| 1 | 90% or more | Easy | Almost everyone knows it ("Which planet is closest to the Sun?") |
| 2 | 75 to 89% | Easy | Most know it; a few slip |
| 3 | 60 to 74% | Medium | Many know it, and the rest can reason toward it |
| 4 | 45 to 59% | Medium | A coin flip for a casual player, gettable through the foothold |
| 5 | Under 45% | Hard | Most miss it; good reasoners and enthusiasts get it |

Mind the guessing floor: 25% with four options, 33% with three, 50% for true/false and comparisons. A Hard true/false or comparison item therefore means most people pick the wrong side, so it must be counterintuitive.

### 8.3 Mysteries

A solve on clue *k* earns 5 - *k* points, so a mystery's **expected points equal the sum of its four cumulative solve shares**: E = s1 + s2 + s3 + s4. That makes the ladder easy to reason about. A clue that lifts the cumulative share by 0.2 adds 0.2 points.

| Band | `slot` | Expected points, typical player (PRD §4.1.6) | Assembly window on predicted E (§10.2) |
|---|---|---|---|
| Easy | 1 (Mystery 1) | 3.0 to 3.6 | 3.2 to 3.6 |
| Medium | 2 (Mystery 2) | 2.4 to 3.0 | 2.5 to 2.9 |
| Hard | 3 (Mystery 3) | 1.8 to 2.4 | 1.9 to 2.3 |

`seededDifficulty` for a mystery uses the same 1 to 5 scale on the share solved by clue 2. Writers may also forecast `seedSolveShares`.

### 8.4 Encores

An encore's band comes from the predicted share of typical adults landing inside the close band (15%, or 5 years): easy 50% or more, medium 20 to 49%, hard under 20%. The seed scale maps the same way (seed 1 for 70% or more, 2 for 50 to 69%, 3 for 35 to 49%, 4 for 20 to 34%, 5 under 20%). The estimator also predicts the share answering exactly, which should stay under 5% (§6, rule 6).

### 8.5 Estimator v0

From gap 3's recommendation, run by estimator agents, never by writers:
- **Five independent estimates per item**, each from a blind packet and a different angle: fame of the answer across countries; school exposure; distractor pull (or, for mysteries, clue depth); recency and memorability; reach outside the US and UK.
- **Each returns** *p* for practice and room items, s1 to s4 for mysteries, or the close and exact shares for encores.
- **Combine** by taking the median on the logit scale. The spread is the standard deviation of the five logits. Store both, with the estimator version.
- **Shapes** (`predicted`, ARCHITECTURE §3.2): practice and rooms `{ "p": 0.68, "spread": 0.41, "estimator": "v0" }`; mysteries `{ "solveByClue": [0.3, 0.5, 0.8, 0.97], "spread": 0.35, "estimator": "v0" }`, whose expected points are the sum of the four shares; encores (+) `{ "pClose": 0.31, "pExact": 0.02, "spread": 0.5, "estimator": "v0" }`.
- **The band follows the estimate.** Practice and room bands come from `predicted.p` (PRD §3.3.3), and a mystery whose prediction lands in another window moves to another `slot`. The editor then moves the item to another cell of the batch plan. Nobody rewrites text to chase a number.
- **AI solve rates are never difficulty.** Agents answer most trivia, so their success says almost nothing about people (gap 3).
- **Benchmark before launch:** estimator v0 runs offline on the published recall norms of Tauber and colleagues ([DOI](https://doi.org/10.3758/s13428-012-0307-9)) and of Nelson and Narens ([DOI](https://doi.org/10.1016/S0022-5371%2880%2990266-2)), never in the bank. We proceed at a rank correlation of 0.6 or better (SYNTHESIS §7.10).
- Writers never tune their seed toward the estimator. We keep both to learn which one predicts better.

### 8.6 After launch: how play recalibrates

- **Data.** Practice first attempts, uploaded in batches (PRD §3.3.1), and eligible ranked Daily runs (PRD §4.3.6).
- **The weekly re-tune** (Mondays, automated). Fit logit(observed) = a + b × logit(predicted) on items with 100 or more eligible answers; add shrunken category offsets once a category has 8 such items; re-score every item. New *p* values ship with the next practice pack build, which moves items between bands automatically, because bands read the current *p* (PRD §3.3.3). The sealed pool is re-scored and Dailies beyond the freeze re-assembled (gap 3).
- **Mysteries** swap predicted solve shares for observed ones once 100 eligible runs exist. The clue where the crowd actually solves shows which rung was mis-pitched.
- **Editor flags** (SYNTHESIS §7.10): success above 95% or below 10%; strong players missing an item more often than weak ones (often a wrong key or ambiguous wording, so the item is re-checked at once); a distractor drawing under 5% of picks; reports above 1% of plays; a mystery whose most common wrong guess takes more than 30% of wrong guesses, which may mean that entity fits a clue.
- **Alarms** (gap 3): a Daily's mean more than 1.0 point from its prediction; an Easy practice item under 65%; a Mystery 1 with observed expected points under 2.6, or a Mystery 3 over 2.8.
- **What writers do with it.** The weekly content run reads the calibration report, re-checks and fixes flagged items, replaces dead distractors, and writes Hard items first, because 25 Hard items per category last only two and a half Hard runs.
- **Estimator v1** trains on our own data once 1,000 practice items have 100 first attempts each (gap 3).

---

## 9. Verification protocol

Our writers and checkers are AI agents, mostly without open web access. The decisions memo replaces "two web sources and a stored quote per item" with two independent checkers, datasets for structured facts, WebSearch only for genuinely uncertain items, and cutting whatever stays uncertain (memo §10). This section turns that into mechanics.

### 9.1 Principles

- **We publish fewer questions before we publish a wrong one** (SYNTHESIS §1, bet 2).
- **Agreement between agents is weak evidence.** Writers and checkers probably share a model family, so their errors correlate (SYNTHESIS §7.6). The protocol leans on independence, external evidence for risky claims and audits seeded with planted errors.
- **Doubt means cut or rewrite.** "Probably" is a fail. AI-written exam items have shown more factual errors than human ones, and one study rejected 31% of them ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11806894/), [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11854382/)), so expect to cut.
- **Evidence is labelled honestly:** a dataset record, a search result or a checker's knowledge. Never dressed up as more than it is.

### 9.2 Claims

An atomic claim is one checkable statement. The key, each distractor's wrongness, each clue, each fact in the explanation, a mystery's uniqueness and an encore's value are all claims. Writers list every claim. Checkers extract their own list from the item text and add anything the writer missed.

| Field | Type | Rule |
|---|---|---|
| `id` | string | `c1`, `c2` and so on, unique in the item. Checker additions use `x1`, `x2` |
| `role` | enum | `key`, `distractor`, `clue`, `explanation`, `uniqueness`, `value`, `input` or `label` (a comparison item's value) |
| `ref` | string, optional | Which part: `clue:2`, `distractor:Sydney`, `item:1` |
| `text` | string | One statement, in plain words |
| `risk` | `standard` or `high` | |
| `riskReason` | enum, when high | `number`, `date`, `superlative`, `first`, `quotation`, `etymology`, `record`, `recent_change` or `checker_doubt` |

**High-risk claims need external evidence** (a dataset or a web result) in at least one confirming check: specific numbers and measurements beyond everyday knowledge; exact dates, and years of events that aren't world-famous; superlatives and "only"; firsts and inventions; quotations; etymologies and name origins; anything that changed in recent years; and any claim either checker rates below certain. An encore's value is always high-risk.

**The precision ladder.** When evidence for an exact figure is missing, step down: exact ("3.8 km") to approximate ("about 4 km") to bounded ("less than 5 km") to dropping it. Write each claim at the precision you can defend.

### 9.3 Writer self-check

Every box gets ticked in `writerNotes` before submission:

1. The lint is clean.
2. Every claim is listed, with its risk set honestly.
3. Structured facts are checked against a dataset (§9.5.1) wherever one covers them, with the locator noted.
4. The rival test is done (§3.2): each distractor argued for, the key argued against.
5. Volatility is set; no time words; nothing depends on knowledge newer than mid-2026.
6. Regional check: a player in Lagos, Mumbai, Toronto or Sydney has the same chance as one in London or Chicago.
7. Spelling and style (§3.3): Oxford spelling, no time words, no en or em dashes, an explanation of 35 words or fewer.
8. Every claim is screened against `content/reference/myths.json`.
9. Mysteries: rival search, likely guesses, list coverage, giveaway terms and the clue-4 display check.
10. Encores: unit, stability, true zero, and the derivation's arithmetic done twice.
11. Doubts are written down. An item the writer can't stand behind is dropped, not left for the checkers to catch. Writers may use WebSearch inside the batch's budget for genuinely uncertain claims.

### 9.4 Fact-checker passes A and B

**Independence.** Each checker is a separate agent run with no shared context. Each receives a blind packet built by tooling: the item's text (options in random order, the key withheld until after the cold solve), its category and answer type. Never the writer's notes or evidence, never the estimate, never the other checker's record. The packet is hashed into `packetSha256`, so the record proves what the checker saw.

**Briefs.** Checker A confirms: verify every claim as a subject expert would, and gather dataset or web evidence for every high-risk claim. Checker B refutes: try to break the item by finding a second defensible answer, an outdated fact, a regional misreading, a trick reading or a giveaway. Both verify every claim.

1. **Cold solve, before seeing the key.** Multiple choice, true/false and comparison: answer it and rate your confidence. Mystery: reveal one clue at a time, and at each clue record your guess and every candidate you would consider. Encore: give an estimate and say how you got it. A cold miss, or more than one candidate left after clue 3, is a red flag the checker must explain in `issues` as ambiguity or as a gap in their own knowledge. A cold solve never feeds difficulty.
2. **Claims.** Extract your own claim list, merge it with the writer's, and give each claim a verdict (`confirmed`, `refuted` or `uncertain`), a method (`dataset`, `web` or `knowledge`) and its evidence (§9.5).
3. **Issues.** Record each problem with its type (`ambiguity`, `second_answer`, `outdated`, `regional`, `trick`, `giveaway`, `wording`, `sensitivity` or `style`) and severity (`blocker`, `fix` or `note`).
4. **Verdict.** `pass` when every claim is confirmed and nothing is a blocker; `revise` when a fixable issue exists and no claim is refuted; `fail` when any claim is refuted or any blocker stands.

Checkers never edit the item, never paste the item's text into a search to find a quiz site with the answer, and never treat another trivia site as evidence.

### 9.5 Evidence

#### 9.5.1 Datasets

Download each dataset once, pin it to a commit or package version, and record it in `content/datasets/manifest.json`. Files live in `.cache/datasets/<key>/` (gitignored), one folder per dataset. They are data: inspect them with tools such as `jq`, never execute anything inside them. `git ls-remote` gives the commit, and raw files can be fetched at that commit from `raw.githubusercontent.com/<owner>/<repo>/<commit>/<path>`.

```json
{
  "key": "mledoze-countries",
  "url": "https://raw.githubusercontent.com/mledoze/countries/6031f5df137c41c76d180c55a0782185ae3ed05b/countries.json",
  "commit": "6031f5df137c41c76d180c55a0782185ae3ed05b",
  "sha256": "0d92fb23b43ae080bd439f5dc5d61a8845395fdd0af1479b433c59fe079bd6fd",
  "license": "ODbL-1.0",
  "retrievedAt": "2026-10-31",
  "use": "Check single facts only. Do not copy substantial parts into shipped files.",
  "knownIssues": ["Vatican City is marked unMember: true", "The capital of Mongolia is spelled 'Ulan Bator'", "altSpellings lack 'Czech Republic'"]
}
```

**Good candidates.** Each was fetched and inspected on 31 October 2026. The traps column lists what we found, and it is why a dataset is evidence, never the truth.

| Key | Where | Licence | Good for | Traps we found |
|---|---|---|---|---|
| `mledoze-countries` | `mledoze/countries` at `6031f5d`, `countries.json` (npm `world-countries` 5.1.0) | ODbL 1.0 | ISO codes, capitals, borders, landlocked status, region, area, alternative spellings | Marks Vatican City as a UN member, so it counts 194 members instead of 193 (the Holy See is an observer). Spells Mongolia's capital "Ulan Bator". Lists three capitals for South Africa. Lacks "Czech Republic" among Czechia's spellings. France's area is metropolitan France only (551,695 km²) |
| `cldr-territories` | `unicode-org/cldr-json` at `7d2b9cb`, `cldr-json/cldr-localenames-full/main/en/territories.json` (npm `cldr-localenames-full` 49.0.0) | Unicode-3.0 | English display names and their variants: Côte d'Ivoire and Ivory Coast, Czechia and Czech Republic, Eswatini and Swaziland, Türkiye and Turkey | Some names need overrides ("Congo - Kinshasa"). Uses curly apostrophes |
| `ptable` | `Bowserinator/Periodic-Table-JSON` at `a78c7a4`, `PeriodicTableJSON.json` | CC BY-SA 3.0, built from Wikipedia | Atomic numbers, symbols, groups, periods, phase at room temperature | Includes element 119, "Ununennium", which has not been discovered. Spells "Cesium" (IUPAC: caesium). Credits shared discoveries to one person (oxygen to Scheele alone). Predicted properties of superheavy elements look like measured ones |
| `geonames-cities` | npm `cities.json` 1.1.65, 171,094 places from GeoNames | CC BY 4.0 | City coordinates and country codes, so "further north" comparisons can be checked | Homonyms: two places called Cusco in Peru. Match on name, country and `admin1` together |
| `worldcup` | `openfootball/worldcup.json` at `516d382`, one file per tournament | Public domain | Men's World Cup results and finals | Men's tournaments only. Finals settled after extra time or on penalties need the full score fields |
| `moma-artists` | `MuseumofModernArt/collection` at `51a140d`, `Artists.json`, stored in Git LFS (fetch through `media.githubusercontent.com`) | CC0, credit requested | Artist names, birth and death years, nationality, Wikidata QIDs, ULAN ids | Nationality is MoMA's convention: Max Ernst is listed as French |
| `tate` | `tategallery/collection`, `artist_data.csv` | CC0, credit requested | Artists' dates and birthplaces | Places in local languages ("Polska") |
| `met` | `metmuseum/openaccess`, `MetObjects.csv`, Git LFS | CC0 | Object dates, cultures, departments and media | Large; `raw.githubusercontent.com` returns only the LFS pointer |
| `natural-earth` | `nvkelso/natural-earth-vector`, GeoJSON | Public domain | Country shapes, rivers, lakes and populated places | Its own naming conventions, at three scales |
| npm helpers | `iso-639-1` 3.1.6, `currency-codes` 2.2.0, `countries-list` 3.4.1 | MIT | Language and currency codes and names | Currencies change (Croatia moved to the euro in 2023) |
| `corpora` | `dariusk/corpora` | CC0 | Brainstorming list candidates (animals, foods) | Not authoritative, so never evidence |
| Wikidata | Through the enrichment job only; blocked from the sandbox | CC0 | QIDs, sitelinks, labels and aliases for answer lists | Anyone can edit it, so it is a candidate source and never a fact-checker ([07 §11](./research/07-content-excellence.md)) |

**Using a dataset well.** Record the file, the locator (`cca3=AUS`) and the exact excerpt. Cross-check a high-risk dataset fact against a second source, because one bad flag in the most popular countries file shows how errors sit quietly in famous data. Prefer CC0 and public-domain data when building anything we ship. ODbL and BY-SA data are for checking single facts, never for copying substantial parts into shipped files without the owner's say-so ([07 §11](./research/07-content-excellence.md); not legal advice). GeoNames data needs credit if we ship it.

**The enrichment job** (for Platform to build). A GitHub Actions job, which can reach hosts the sandbox can't (SYNTHESIS §9, row 27), queries Wikidata for each list entry by name and qualifier and writes candidates to `content/answer-lists/_wikidata/`. The list builder accepts a match only when the label and the qualifier agree (a film's year, a book's author, a city's country). Until the job exists, entities keep `x.` ids and `popularity` stays 0, except QIDs copied from datasets that carry them.

#### 9.5.2 WebSearch

Use it only for genuinely uncertain claims: a high-risk claim no dataset covers, a claim a checker rates below certain, or a report re-check (§9.10). Web pages themselves are mostly blocked from the sandbox, so don't build a check around fetching them.

- **What the tool gives you:** a list of result titles and URLs, plus a written summary. It does not give page text. Record the query, the result list exactly as returned, the summary sentences that state the claim (verbatim), and the tiers of the results the summary relies on.
- **Tiers.** A: the body that owns the fact (a government or parliament, a UN agency, a standards body such as IUPAC or the IAU, the museum that holds the object, the organization that awards the prize, a peer-reviewed paper, a national statistics office). B: established reference works and quality press (Britannica, Wikipedia, national broadcasters, major newspapers). C: everything else, which never counts: blogs, listicles, fact sites, forums, AI-written pages and every other quiz or trivia site.
- **When a web check confirms a claim:** the summary states it plainly, at least one listed result is Tier A or B, and the summary reports no conflict. A Daily key or an encore value needs two Tier A or B results, or one plus a dataset.
- **Conflicts fail the claim as written.** Rewrite to what every source agrees on, or cut. Our pane-count search for the Louvre pyramid is the example (§6, rule 2).
- **Budgets per batch** (caps, not targets): practice 10, mystery 15, encore 12, room 8, answer list 5. Every search is counted in the check record (`searchesUsed`). A batch that needs more has too many fragile claims, so rewrite it toward robust facts.

#### 9.5.3 Knowledge

A checker's own knowledge may confirm a standard-risk claim. The checker restates the fact in their own words, names the basis (`textbook`, `reference` or `everyday`) and gives a confidence. Only `certain` confirms. Knowledge alone never confirms a high-risk claim: a checker may record a knowledge verdict on one, but the claim counts as confirmed only when at least one of the two checks also carries dataset or web evidence for it (§9.9). Because the checkers can't see each other, the job is assigned: checker A gathers external evidence for every high-risk claim, and checker B searches only for claims it doubts.

### 9.6 Never invent a source

- A URL may appear in our files only when it came verbatim from a tool result in that session or from the dataset manifest, and never in player-facing text.
- Never cite a book, page, museum label or dictionary entry you didn't retrieve. Writing "as listed in Britannica" without a result is fabrication.
- Never type a Wikidata id, ISBN, catalogue number or coordinate from memory and present it as evidence.
- A fabricated source fails the whole batch. The editor rejects it, fresh checkers re-check every item in it, and the incident goes in the batch register.
- The "Learn more" link is generated from `learnMore` as a Wikipedia search. Nobody types it.

### 9.7 How the editor resolves disagreements

| Checker A | Checker B | The editor |
|---|---|---|
| pass | pass | Reviews style and balance, then accepts or asks for wording. A wording change that touches no claim keeps both checks; a changed claim gets two fresh checks |
| pass | revise (either way round) | Applies or rejects the fix. Changed claims get two fresh checks |
| pass | fail (either way round) | Reads both records. A real problem means cut or rewrite. If the failing checker misread the item, the editor orders a tiebreak: a third blind checker (pass `T`) on the disputed claims, with external evidence required. Accepts only if it passes |
| fail | fail | Cuts, or reopens it as a new draft with a new ID |
| Any claim `uncertain` | | Gets external evidence on that claim, or cuts |

The editor never overrules a refuted claim by judgment alone, never adds a fact during resolution without checks, and records every decision with its reason.

### 9.8 Verification record fields

The `verification` object on each item:

| Field | Type | Rule |
|---|---|---|
| `checks` | CheckRecord[2] | Passes A and B |
| `tiebreak` | CheckRecord or null | Pass T, when §9.7 calls for one |
| `editor` | object | `editor` (agent id), `decision` (`accept`, `rewrite` or `cut`), `reason`, `decidedAt` |
| `dedupe` | object | `checkedAt`, `nearestId`, `score`, `verdict` (`unique`, `related_ok` or `duplicate`) |
| `mythsScreen` | object | `checkedAt`, `hits` (array) |
| `lint` | object | `version`, `passed`, `warnings` |
| `rechecks` | object[] | Later report and freshness re-checks (§9.10), each a CheckRecord plus `trigger` |

**CheckRecord**

| Field | Type | Rule |
|---|---|---|
| `checker` | string | Agent id |
| `pass` | `A`, `B` or `T` | |
| `brief` | `confirm`, `refute` or `tiebreak` | |
| `packetSha256` | string | Hash of the blind packet received |
| `startedAt`, `finishedAt` | ISO timestamps | |
| `coldSolve` | object | Multiple choice, true/false and comparison: `answerGiven`, `confidence` (`low`, `medium` or `high`), `matchedKey`. Mystery: `perClue`, a list of `{ "clue", "guess", "candidates" }`. Encore: `estimate`, `reasoning` |
| `claimResults` | object[] | One per claim: `claimId`, `verdict`, `method`, `evidence`, `note` |
| `issues` | object[] | `type`, `severity`, `note` |
| `searchesUsed` | integer | Counts against the batch budget |
| `verdict` | `pass`, `revise` or `fail` | |

**Evidence**, by method:
- Dataset: `{ "kind": "dataset", "dataset": "<manifest key>", "version": "<commit or npm version>", "file", "locator", "excerpt", "retrievedAt" }`
- Web: `{ "kind": "web", "query", "results": [{ "title", "url" }], "summaryExcerpt", "tiers", "conflictReported", "retrievedAt" }`
- Knowledge: `{ "kind": "knowledge", "basis", "restatement", "confidence" }`

§12.15 shows a filled-in record.

### 9.9 The acceptance rule

The validator refuses `status: active` unless all of these hold:
1. Two check records, passes A and B, by two different checkers, neither of whom is the writer or the editor.
2. Both verdicts are `pass`, or a tiebreak passed under §9.7.
3. Every claim is confirmed in both checks. Every high-risk claim has dataset or web evidence in at least one confirming check. A Daily key or an encore value has two independent external sources.
4. Mysteries: both checks confirm the uniqueness claim, and neither found a rival that fits clues 1 to 3.
5. No open blocker. Lint passed. Dedupe verdict `unique` or `related_ok`. Myths screen clean.
6. The editor's decision is `accept`.

### 9.10 Audits and re-checks

- **Seeded blind audit** (before launch, then monthly). A separate auditor re-checks 300 random practice items and 60 sealed Daily items, mixed with 20 to 30 planted bad items: a wrong key, an ambiguous stem, an outdated fact, a second defensible answer, a right distractor, an invented source. The audit counts only if it catches at least 95% of the planted items. Zero confirmed errors among 300 practice items then bounds the practice error rate below about 1% at 95% confidence (SYNTHESIS §7.6). Any confirmed real error sends that writer's whole batch back for a full re-check (PRD §9.1, R4).
- **Owner spot check:** 50 random Daily items before 1.0 (SYNTHESIS §12, decision 14).
- **Report re-checks.** When reports trigger review (PRD §3.13.3), a fresh checker re-verifies the reported claims with external evidence. WebSearch is always allowed here, because a reported claim is uncertain by definition. Voids and key changes then follow PRD §3.13.4, and the re-check goes in `rechecks`.
- **Freshness.** An item reaching its `reviewBy` date gets a single fresh check. A failure retires it.

---

## 10. Daily scheduling and room packs

### 10.1 Composition

A v1 Daily is `[mystery easy, mystery medium, mystery hard, encore]` (memo §2), stored as round records in the schedule (§2.11). The engine accepts any composition, so a change of format is a schedule change, never a content rewrite (PRD §3.1.2).

### 10.2 The difficulty ramp

- **Assembly windows** on predicted expected points (§8.3): Mystery 1 from 3.2 to 3.6, Mystery 2 from 2.5 to 2.9, Mystery 3 from 1.9 to 2.3. They sit inside the PRD's bands so estimate error rarely pushes a slot out of its band (gap 3).
- **The Daily's predicted total** runs from 7.8 to 8.6 points, near the PRD's "about 8 of 12". For the first seven Dailies it runs from 8.2 to 8.8, leaning easy while the estimator's bias is unknown.
- Mystery 1 comes from the lowest-spread third of eligible easy mysteries, because a misjudged opener hurts most. High-spread items go to Mystery 2.
- Prefer encores with a predicted close share between 20% and 50%.

### 10.3 Spread within a Daily

- Three different categories, and three different answer types.
- The encore's category differs from all three mysteries' categories.
- No item names or clues another item's answer that day, and no two share a theme tag.
- At least one of the four items is counterintuitive.
- Everything is `global`.

### 10.4 Spread within a week

In any 7 consecutive Dailies:
- No category appears on two consecutive days. Each category appears at most twice in the mystery slots, and every category appears at least once in any 6 consecutive Dailies (the PRD's "roughly every 4 days").
- Film & TV, Music or Food & Drink appears in at least 4 of the 7 (PRD §3.18.2).
- No answer type appears more than 4 times.
- At most 2 year-kind encores.
- A free tag appears at most twice.

### 10.5 Repeats

- **No answer entity repeats as a mystery answer within 60 days.**
- No mystery or encore repeats within a year (PRD §3.18.2).
- An entity that was an answer in the last 7 days is not used as a distractor.
- Daily items never appear in practice packs or room packs, and no practice or room item covers the same fact as a Daily item.

### 10.6 The day check

After assembly, a fresh checker plays the whole Daily cold, all four rounds, and reports cross-item giveaways, theme collisions, tone, and anything that reads oddly across time zones. A Daily is "today" somewhere for about 50 hours (PRD glossary), so no text says "today". The result goes in the schedule record's `dayCheck`.

### 10.7 Locking and spare days

- Keep 14 days assembled. Freeze each Daily 3 days ahead in the first month and 7 days ahead after two calm weeks. Re-assemble the rest after each Monday re-tune, so week-one lessons reach week two (gap 3).
- The runway alarm sounds below 30 scheduled Dailies (PRD §3.18.2).
- **20 spare sets** (20 mysteries per slot plus 20 encores) obey every rule above. If a scheduled Daily can't publish, a spare fills the date automatically.

### 10.8 Holidays

Only dates the whole world shares, such as 1 January, get light theming, and those Dailies stay mixed-category. Nothing date-specific: the Daily spans two calendar days somewhere on Earth.

### 10.9 Room packs: 8 packs of 15

Room packs are the sealed pool for host rooms (memo §6; PRD §3.18.2): eight themed packs of 15 multiple-choice questions, served only through room RPCs.

| Pack id | Title | Theme | Categories (15 questions) | Example topics |
|---|---|---|---|---|
| `around-the-world` | Around the World | Places, landmarks, customs and festivals | Geography 12, Society & Culture 3 | ancient cities, rivers, festivals, flags described in words |
| `back-in-time` | Back in Time | Empires and turning points | History 12, Art & Design 3 | wonders, explorers, monuments, inventions |
| `screen-time` | Screen Time | Films and TV from everywhere | Film & TV 15 | famous lines, animation, directors, world cinema |
| `sound-check` | Sound Check | Songs, bands, composers and instruments | Music 15 | albums, instruments, classical pieces, film scores |
| `wild-things` | Wild Things | Animals and plants | Nature & Animals 15 | animal senses, odd bodies, migration, plants |
| `kitchen-table` | Kitchen Table | Food and drink, and the words for them | Food & Drink 12, Language & Words 3 | dishes, spices, drinks, food words |
| `game-on` | Game On | Sports and games played worldwide | Sport & Games 15 | Olympic history, football (soccer), chess, board games |
| `all-sorts` | All Sorts | General knowledge across the rest | Science & Tech 3, Books & Literature 3, Art & Design 3, Language & Words 3, Society & Culture 3 | planets, novels, inventors, words |

**Pack template.** 6 easy, 6 medium and 3 hard.
- Positions 1 to 3: easy, to warm the room up.
- Positions 4 to 14: the other 3 easy, 5 medium and 3 hard. Never two hard in a row, and at least one hard at position 8 or later.
- Position 15: the finale, announced on every screen as double points (PRD §3.8.3). Medium, with the pack's best reveal. A very hard finale turns double points into a lottery.

**Room rules.**
- Multiple choice with four options only. No true/false: a 50% guess swings timed scores.
- Stems of 100 characters or fewer and options of 30 or fewer, because the host screen is read across a room (PRD §3.8.6).
- No fact shared with a practice or Daily item. Practice packs sit on every phone in the room, so a shared fact is a shared answer key.
- No answer repeated inside a pack. Party-safe tone (§3.7).

---

## 11. Files and the production plan

### 11.1 Layout under `content/`

The tree follows ARCHITECTURE §2.1. Files marked (guide) are the content team's working files that this guide adds.

```
content/
  categories.json              The twelve categories from section 1
  practice/<category-slug>/    One practice item per file, p.<cat>.<BBSS>.json (ships to clients)
  answer-lists/<type>.json     Closed answer lists with aliases and provenance (ships to clients)
  sealed/                      Encrypted envelopes only: mysteries/, encores/, room-packs/, schedule/, spares/
  .sealed-plain/               Git-ignored plaintext workspace for sealed files (11.2)
  fixtures/                    Fake fx. content for the mock backend and tests (ARCHITECTURE 5.6)
  batches.json                 (guide) The batch register (11.3)
  datasets/manifest.json       (guide) Pinned datasets (9.5.1); the files live in .cache/datasets/ (gitignored)
  reference/myths.json         (guide) Known false "facts" every claim is screened against
  reference/spelling.json      (guide) US to Oxford spelling pairs and the proper-noun allowlist (lint C10)
  reference/stopwords.json     (guide) Words the giveaway lint ignores (lint C12)
  calibration/                 (guide) Estimator output and weekly re-tune reports, by item id only
  answer-lists/_wikidata/      (guide) Enrichment job output, never edited by hand
```

ARCHITECTURE §2.1 also lists `compositions.json`, `safety/`, `names/`, `category-pages/` and `monthly-packs.json`, which other teams own.

### 11.2 Sealed content stays out of git in plain text

The repository is public: its raw files were readable without credentials when checked on 31 October 2026. Anything committed is published, and a single plaintext mystery would hand out a Daily answer (constraint 4; PRD §8.4). ARCHITECTURE §5.4 settles the mechanism: sealed files are AES-256-GCM envelopes in `content/sealed/`, plaintext lives only in the git-ignored `content/.sealed-plain/`, and releases reach Postgres through MCP.

- **The guard.** Before writing any sealed file, run `git check-ignore -q content/.sealed-plain/probe.json`. If it fails, stop and tell the editor. On 31 October 2026 it failed, because the `.gitignore` entry arrives with ticket PLT-1. Sealed writing also waits for the content key and the `content:seal` script (ticket SQL-3). Practice items and answer lists don't wait.
- **The workflow.** `npm run content:unseal` decrypts into `content/.sealed-plain/`. Writers and checkers work there. `npm run content:seal` encrypts every changed file back into `content/sealed/` at each checkpoint, because the workspace dies with the sandbox. Never copy plaintext anywhere else, including the scratchpad, logs, messages or commit text.
- **Test fixtures** for the mock backend and E2E tests are invented `fx.` items (ARCHITECTURE §5.6), never real scheduled content.
- **This guide is public too,** which is one more reason its examples can never be scheduled.

### 11.3 The batch register

`content/batches.json` is the single place batch numbers come from. The editor opens a batch before anyone writes it, which is why parallel writers never collide.

| Field | Rule |
|---|---|
| `batchId` | For example `p.geo.b03`. Never reused |
| `pool` | `practice`, `mystery`, `encore`, `room` or `list` |
| `category`, `packId` or `answerType` | What the batch covers |
| `writer` | The one agent run allowed to create IDs in it |
| `status` | `open`, `submitted`, `checking` or `closed` |
| `plan` | Planned counts by difficulty and format (§11.4) |
| `accepted`, `cut` | Counts at close |
| `lastSequence` | Highest sequence number issued; IDs above it are invalid |
| `incidents` | Fabricated sources and audit failures, with dates |

### 11.4 Batch plans

Writers draft about 20% more than the plan (30 for a 25-item batch), because some items will be cut. Leftover accepted items wait in the batch as reserves. Shortfalls go into top-up batches (`b06` and up for practice).

**Practice: 60 batches of 25, five per category.**

| Batch | IDs | Easy | Medium | Hard | Multiple choice | True/false | Comparison |
|---|---|---|---|---|---|---|---|
| `p.<cat>.b01` | `p.<cat>.0101` up | 10 | 10 | 5 | 20 | 2 | 3 |
| `p.<cat>.b02` | `p.<cat>.0201` up | 10 | 10 | 5 | 20 | 3 | 2 |
| `p.<cat>.b03` | `p.<cat>.0301` up | 10 | 10 | 5 | 20 | 2 | 3 |
| `p.<cat>.b04` | `p.<cat>.0401` up | 10 | 10 | 5 | 20 | 3 | 2 |
| `p.<cat>.b05` | `p.<cat>.0501` up | 10 | 10 | 5 | 20 | 2 | 3 |
| Per category | | 50 | 50 | 25 | 100 | 12 | 13 |

Difficulty here means the band of `seededDifficulty`: 1 and 2 are easy, 3 and 4 medium, 5 hard (§8.2). Each practice batch covers at least four of its category's subtopics, and no subtopic takes more than 30% of a category. About a quarter of each batch is counterintuitive.

**Mysteries: 36 batches of 10, three per category.** Three slot templates: A is 4 easy, 3 medium and 3 hard; B is 3, 4 and 3; C is 3, 3 and 4. Each category gets all three, which totals 10 per slot per category, and each wave totals 40 per slot.

| Categories | `m.<cat>.b01` | `m.<cat>.b02` | `m.<cat>.b03` |
|---|---|---|---|
| `geo`, `hist`, `sci`, `nat` | A | B | C |
| `film`, `music`, `art`, `book` | B | C | A |
| `sport`, `food`, `lang`, `soc` | C | A | B |

A mystery batch uses at least two answer types wherever its category allows more than one, and no answer is repeated anywhere in the bank. Draft 12 to land 10.

**Encores: 12 batches of 10, two categories of five each.** IDs run `e.0101` to `e.1210`. At most 3 year-kind encores per batch, 30 in all.

| Batch | Categories | Batch | Categories |
|---|---|---|---|
| `e.b01` | Geography, Film & TV | `e.b07` | Geography, Music |
| `e.b02` | History, Music | `e.b08` | History, Food & Drink |
| `e.b03` | Science & Tech, Food & Drink | `e.b09` | Science & Tech, Sport & Games |
| `e.b04` | Nature & Animals, Sport & Games | `e.b10` | Nature & Animals, Language & Words |
| `e.b05` | Art & Design, Language & Words | `e.b11` | Art & Design, Society & Culture |
| `e.b06` | Books & Literature, Society & Culture | `e.b12` | Books & Literature, Film & TV |

**Room packs: 8 batches of 15, one per pack** (`r.around-the-world.b01` to `r.all-sorts.b01`). Draft 18 to land 15.

**Answer lists: 38 batches to reach every minimum.** A list batch holds about 100 entries, all of one type and one domain, so two builders never add the same entities. One independent checker verifies each batch's display forms, qualifiers, aliases and duplicates against datasets where possible, and drops any entry in doubt. Entries a mystery needs get that mystery's two full checks.

| List | Minimum | Batches | Domains and sources |
|---|---|---|---|
| `country` | 190 | `l.country.b01` | All, from CLDR 49 names checked against `mledoze-countries` |
| `element` | 118 | `l.element.b01` | All 118 confirmed elements, from `ptable` numbers and IUPAC names |
| `city` | 300 | `l.city.b01` to `b03` | By continent, checked against `geonames-cities` |
| `person` | 1,000 | `l.person.b01` to `b10` | Science and invention; exploration; history and politics before 2001; art and architecture (QIDs from `moma-artists`); literature; film and TV; sport; philosophy and religion; society and economics; a mixed batch of famous names |
| `film` | 500 | `l.film.b01` to `b05` | By decade and region |
| `tv_series` | 200 | `l.tv_series.b01` to `b02` | By region |
| `book` | 300 | `l.book.b01` to `b03` | Classics, world literature, children's books |
| `animal` | 300 | `l.animal.b01` to `b03` | Land, sea, air and fresh water, every continent |
| `landmark` | 200 | `l.landmark.b01` to `b02` | Built, then natural |
| `music_artist` | 500 | `l.music_artist.b01` to `b05` | Composers; pop and rock by decade; music from beyond the US and UK |
| `dish` | 200 | `l.dish.b01` to `b02` | Dishes, then drinks |
| `sport` | 100 | `l.sport.b01` | Sports, then games of every kind |

Lists keep growing toward their targets after launch, in versions of 20 or more entries (§2.10, rule 5).

### 11.5 Waves

Content production runs beside the build from week one (PRD §9.3).

| Wave | Lands by | Practice | Mysteries | Encores | Rooms | Lists and tooling |
|---|---|---|---|---|---|---|
| 0 | Start of M2 | | | | | Schemas, validator and lint, packet builder, dataset manifest, myths list, batch register, the sealed-storage mechanism (§11.2); country and element lists complete |
| 1 | M2 exit | `p.<cat>.b01` and `b02` in every category: 600 items | `m.<cat>.b01` in every category: 120, which is 40 Dailies' worth | `e.b01` to `e.b04`: 40 | | Every list at 100 or more entries, covering every wave 1 mystery |
| 2 | M4 exit | `b03` and `b04`: 600 | `b02`: 120 | `e.b05` to `e.b08`: 40 | All eight packs: 120 | Lists growing toward their minimums |
| 3 | M5 | `b05` plus top-ups: 300 | `b03`: 120 | `e.b09` to `e.b12`: 40 | Replacements | Every list at its minimum; the seeded audit; 100 Dailies and 20 spare sets scheduled |

Wave 1 covers the M2 exit criterion of 30 scheduled Dailies and 600 practice items through the full process (PRD §9.3), with room to spare.

### 11.6 Throughput

The M1 content spike measures verified items per agent-day for each type (PRD §9.3, SYNTHESIS §7.1). Waves are sized from that figure. If throughput falls short, shrink practice first and never the protocol, and never go below 100 practice items per category.

---

## 12. Worked examples

### 12.0 How to read them

- **They are teaching material, not bank content.** Their IDs use the reserved batch 00 (room questions use sequences 90 to 99), which the validator rejects anywhere under `content/`, and the dedupe check reads this guide, so none can slip into the bank. They are public, so the mysteries and encores could never be scheduled anyway.
- **Each GOOD example is a complete writer submission:** every field a writer fills, claims included. `verification` is missing because writers never fill it; §12.15 shows a filled one.
- The facts were picked for stability. Structured ones were checked against the pinned datasets and a few precise figures with WebSearch while writing this guide (Appendix B), but no example has been through §9. A writer who wants one in the bank writes a fresh item and sends it through the protocol.
- Each GOOD example ends with "Why it works". Each BAD example gives the item, what is wrong, and the fix.

### 12.1 Multiple choice: ten good examples

```json
{
  "id": "p.geo.0001",
  "status": "draft",
  "format": "mc",
  "category": "geo",
  "tags": ["capitals", "oceania"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 2,
  "counterintuitive": true,
  "stem": "Which city is the capital of Australia?",
  "answer": "Canberra",
  "wrong": ["Sydney", "Melbourne", "Perth"],
  "order": "shuffle",
  "explanation": "Sydney and Melbourne both wanted the title, so the constitution put the capital in New South Wales but at least 100 miles (about 160 km) from Sydney.",
  "learnMore": "Canberra",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "Canberra is the capital of Australia."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Sydney, Melbourne and Perth are state capitals, not the national capital."},
    {
      "id": "c3",
      "role": "explanation",
      "risk": "high",
      "riskReason": "number",
      "text": "Section 125 of the Australian Constitution puts the seat of government in New South Wales, not less than 100 miles from Sydney."
    },
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Sydney and Melbourne were rivals to be the national capital."},
    {"id": "c5", "role": "explanation", "risk": "standard", "text": "100 miles is about 160 km."}
  ],
  "writerNotes": "c1 checked in mledoze-countries (cca3=AUS, capital). Sydney is the obvious wrong pick, so counterintuitive is true."
}
```
Why it works: the most tempting wrong answer is the first distractor, and the explanation defuses it with a fact most players never knew.

```json
{
  "id": "p.hist.0001",
  "status": "draft",
  "format": "mc",
  "category": "hist",
  "tags": ["ancient-world", "north-africa"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": true,
  "stem": "In which modern country are the ruins of ancient Carthage?",
  "answer": "Tunisia",
  "wrong": ["Lebanon", "Libya", "Egypt"],
  "order": "shuffle",
  "explanation": "Settlers from Tyre, in modern Lebanon, founded Carthage. Rome destroyed it in 146 BC and later rebuilt it; its ruins stand in the suburbs of Tunis.",
  "learnMore": "Carthage",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "The ruins of ancient Carthage are in Tunisia, near Tunis."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Carthage's ruins are not in Lebanon, Libya or Egypt."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Carthage was founded by Phoenician settlers from Tyre, a city in modern Lebanon."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Rome destroyed Carthage in 146 BC."},
    {"id": "c5", "role": "explanation", "risk": "standard", "text": "The Romans later rebuilt Carthage as a Roman city."}
  ],
  "writerNotes": "Lebanon is the planted trap: players who know Carthage was Phoenician will reach for it."
}
```
Why it works: Hard through reasoning, not obscurity. Partial knowledge (Phoenicians) leads to a tempting wrong answer, and the explanation untangles the chain.

```json
{
  "id": "p.sci.0001",
  "status": "draft",
  "format": "mc",
  "category": "sci",
  "tags": ["earth-science", "rocks"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 2,
  "counterintuitive": false,
  "stem": "Which type of rock forms when molten magma or lava cools and hardens?",
  "answer": "Igneous",
  "wrong": ["Sedimentary", "Metamorphic"],
  "order": "shuffle",
  "explanation": "The name comes from ignis, Latin for fire. Granite cools slowly underground and grows large crystals, while basalt cools fast at the surface and stays fine-grained.",
  "learnMore": "Igneous rock",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "Igneous rock forms when magma or lava cools and solidifies."},
    {
      "id": "c2",
      "role": "distractor",
      "risk": "standard",
      "text": "Sedimentary rock forms from deposited sediment, and metamorphic rock from existing rock changed by heat and pressure."
    },
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "'Igneous' comes from the Latin ignis, fire."},
    {
      "id": "c4",
      "role": "explanation",
      "risk": "standard",
      "text": "Granite cools slowly underground and is coarse-grained; basalt cools quickly at the surface and is fine-grained."
    }
  ],
  "writerNotes": "Three options on purpose: there are only three classes of rock, so a fourth would be filler."
}
```
Why it works: three honest options instead of four with a filler, and an explanation that gives the player a root word to keep.

```json
{
  "id": "p.nat.0001",
  "status": "draft",
  "format": "mc",
  "category": "nat",
  "tags": ["ocean-life", "anatomy"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": true,
  "stem": "How many hearts does an octopus have?",
  "answer": "3",
  "wrong": ["1", "2", "8"],
  "order": "ascending",
  "explanation": "Two hearts pump blood through the gills and a third sends it round the body. The blood is blue because it carries oxygen on copper-based haemocyanin.",
  "learnMore": "Octopus",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "An octopus has three hearts."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "An octopus does not have one, two or eight hearts."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Two branchial hearts pump blood through the gills, and one systemic heart pumps it round the body."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Octopus blood is blue because its oxygen carrier, haemocyanin, contains copper."}
  ]
}
```
Why it works: numbers in ascending order, a distractor borrowed from the famous eight arms, and an obvious guess (one) that is wrong.

```json
{
  "id": "p.film.0001",
  "status": "draft",
  "format": "mc",
  "category": "film",
  "tags": ["animation", "japan"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": false,
  "stem": "Which Japanese animation studio made Spirited Away (2001)?",
  "answer": "Studio Ghibli",
  "wrong": ["Toei Animation", "Madhouse", "Sunrise"],
  "order": "shuffle",
  "explanation": "Hayao Miyazaki co-founded Ghibli in 1985 and named it after a hot Saharan wind, hoping to blow a new wind through Japanese animation.",
  "learnMore": "Studio Ghibli",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "Spirited Away (2001) was made by Studio Ghibli."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Toei Animation, Madhouse and Sunrise are Japanese animation studios that did not make Spirited Away."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Studio Ghibli was founded in 1985, with Hayao Miyazaki among its founders."},
    {
      "id": "c4",
      "role": "explanation",
      "risk": "high",
      "riskReason": "etymology",
      "text": "Ghibli is a name for a hot Saharan wind, chosen so the studio would blow a new wind through anime."
    }
  ]
}
```
Why it works: every distractor is a real studio of the same kind, so fans are tested and newcomers can still recognize the famous name.

```json
{
  "id": "p.music.0001",
  "status": "draft",
  "format": "mc",
  "category": "music",
  "tags": ["classical", "baroque"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": false,
  "stem": "Which composer wrote the violin concertos known as The Four Seasons?",
  "answer": "Antonio Vivaldi",
  "wrong": ["Johann Sebastian Bach", "George Frideric Handel", "Arcangelo Corelli"],
  "order": "shuffle",
  "explanation": "Vivaldi published them in 1725 with four sonnets, possibly his own, describing each season. He spent decades teaching music at a Venice orphanage, the Ospedale della Pietà.",
  "learnMore": "The Four Seasons (Vivaldi)",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "Antonio Vivaldi composed The Four Seasons."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Bach, Handel and Corelli did not compose The Four Seasons."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "The Four Seasons was published in 1725, with a sonnet for each concerto."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "The sonnets may have been written by Vivaldi himself."},
    {"id": "c5", "role": "explanation", "risk": "standard", "text": "Vivaldi taught at the Ospedale della Pietà in Venice for decades."}
  ]
}
```
Why it works: four Baroque composers with names of similar length, so the key doesn't stand out, and the explanation offers a human detail.

```json
{
  "id": "p.art.0001",
  "status": "draft",
  "format": "mc",
  "category": "art",
  "tags": ["surrealism", "paintings"],
  "region": "global",
  "volatility": "slow",
  "reviewBy": "2028-11-01",
  "seededDifficulty": 2,
  "counterintuitive": false,
  "stem": "Which artist painted The Persistence of Memory (1931), with its melting clocks?",
  "answer": "Salvador Dalí",
  "wrong": ["René Magritte", "Joan Miró", "Max Ernst"],
  "order": "shuffle",
  "explanation": "The famous canvas is small, only about 24 by 33 cm. New York's Museum of Modern Art has held it since 1934.",
  "learnMore": "The Persistence of Memory",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "Salvador Dalí painted The Persistence of Memory in 1931."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Magritte, Miró and Ernst did not paint The Persistence of Memory."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "number", "text": "The painting measures about 24 by 33 cm."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "date", "text": "The Museum of Modern Art in New York has held the painting since 1934."}
  ],
  "writerNotes": "Volatility is slow because c4 depends on where the painting is kept. Artist records checked in moma-artists (ConstituentID 1364)."
}
```
Why it works: four real Surrealists, a surprising size, and a `slow` volatility class with a review date because a location can change.

```json
{
  "id": "p.book.0001",
  "status": "draft",
  "format": "mc",
  "category": "book",
  "tags": ["opening-lines", "classic-novels"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 2,
  "counterintuitive": false,
  "stem": "Which novel opens with the line 'Call me Ishmael'?",
  "answer": "Moby-Dick",
  "wrong": ["Treasure Island", "Robinson Crusoe", "The Old Man and the Sea"],
  "order": "shuffle",
  "explanation": "Herman Melville's 1851 novel sold poorly, and he died in 1891 largely forgotten as a novelist. Its reputation took off in the 1920s.",
  "learnMore": "Moby-Dick",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "quotation", "text": "Moby-Dick opens with the sentence 'Call me Ishmael.'"},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Treasure Island, Robinson Crusoe and The Old Man and the Sea do not open with 'Call me Ishmael'."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Moby-Dick was published in 1851 and sold poorly."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Melville died in 1891, largely forgotten as a novelist."},
    {"id": "c5", "role": "explanation", "risk": "standard", "text": "Interest in Melville revived strongly in the 1920s."}
  ]
}
```
Why it works: every distractor is another famous sea story, so knowing "it's about the sea" isn't enough.

```json
{
  "id": "p.food.0001",
  "status": "draft",
  "format": "mc",
  "category": "food",
  "tags": ["spices"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 2,
  "counterintuitive": false,
  "stem": "Which spice is made from the dried stigmas of a crocus flower?",
  "answer": "Saffron",
  "wrong": ["Turmeric", "Paprika", "Cardamom"],
  "order": "shuffle",
  "explanation": "Each flower gives only three stigmas, picked by hand, which is why saffron is so costly. Turmeric, a cheaper yellow colouring, is a dried and ground rhizome.",
  "learnMore": "Saffron",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "Saffron is the dried stigmas of the saffron crocus, Crocus sativus."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Turmeric, paprika and cardamom do not come from crocus stigmas."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Each saffron crocus flower has three stigmas, harvested by hand."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Turmeric is the dried, ground rhizome of a plant in the ginger family."}
  ]
}
```
Why it works: the explanation answers the question a player asks next (why so expensive?) and defuses turmeric, the usual confusion.

```json
{
  "id": "p.lang.0001",
  "status": "draft",
  "format": "mc",
  "category": "lang",
  "tags": ["word-origins", "robots"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": false,
  "stem": "The word 'robot' comes from a 1920 play by which Czech writer?",
  "answer": "Karel Čapek",
  "wrong": ["Franz Kafka", "Jaroslav Hašek", "Milan Kundera"],
  "order": "shuffle",
  "explanation": "The play was R.U.R. (Rossum's Universal Robots). Čapek credited his brother Josef with the word, from the Czech robota, meaning forced labour.",
  "learnMore": "R.U.R.",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "etymology", "text": "The word 'robot' entered use through Karel Čapek's play R.U.R., written in 1920."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Kafka, Hašek and Kundera did not write R.U.R."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "Karel Čapek credited his brother Josef with suggesting the word."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "The Czech word robota means forced labour."}
  ],
  "writerNotes": "Kafka is the trap: a famous Prague writer of the same years, though he wrote in German."
}
```
Why it works: a Hard item with a foothold. Players who don't know Čapek can still reject Kundera on dates and weigh the others, and the explanation teaches the root.

### 12.2 Multiple choice: five bad examples

1. **No foothold.** "What is the atomic number of rhodium?" with 44, 45, 46 and 47.
   *Wrong:* pure lookup; nearby numbers give nobody anything to reason with. *Fix:* "Which element's name comes from the Greek for 'rose', after the colour of its salts?" with rhodium as the key and three other metals as distractors.
2. **Negative stem and a disputed key.** "Which of these is NOT a planet? Mars, Venus, Pluto, Jupiter."
   *Wrong:* the negative is easy to misread (lint C06), and the key rests on a 2006 definition that some astronomers still argue about. *Fix:* "In 2006, which world was reclassified as a dwarf planet?" with Pluto as the key, and Ceres and Eris kept out of the options because both were classed as dwarf planets in 2006 too.
3. **A record that can change.** "What is the tallest building in the world?"
   *Wrong:* a record, so it goes stale the day a taller tower opens (§3.4). *Fix:* "Which building became the world's tallest when it opened in 2010?" (Burj Khalifa). The year makes it `dated`.
4. **A contested first with two defensible answers.** "Who invented the telephone?" with Alexander Graham Bell, Antonio Meucci, Elisha Gray and Thomas Edison.
   *Wrong:* Meucci and Gray both have documented claims, so a well-read player can argue for a distractor. *Fix:* a documented event, "Who received the US patent for the telephone in March 1876?", with Edison, Samuel Morse and Guglielmo Marconi as distractors.
5. **A length cue and joke options.** "What is a Faraday cage?" with "A box", "A metal enclosure that blocks electric fields from outside", "A cage for birds" and "A famous prison".
   *Wrong:* the key is by far the longest (lint C07), two options are jokes, and the options aren't the same kind of thing. *Fix:* four short, serious definitions of the same form, all about electricity and only one right.

### 12.3 True or false: ten good examples

```json
{
  "id": "p.sci.0002",
  "status": "draft",
  "format": "tf",
  "category": "sci",
  "tags": ["space", "myths"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": true,
  "stem": "The Great Wall of China is visible from the Moon with the naked eye.",
  "answer": false,
  "tfKind": "myth",
  "explanation": "The wall is only a few metres wide and the Moon is about 384,000 km away. Even from low orbit, astronauts say it is very hard to spot unaided.",
  "learnMore": "Great Wall of China",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "The Great Wall cannot be seen from the Moon with the naked eye."},
    {"id": "c2", "role": "explanation", "risk": "standard", "text": "The wall is mostly a few metres wide."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "number", "text": "The Moon's average distance from Earth is about 384,000 km."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Astronauts in low Earth orbit report that the wall is very hard to see without aid."}
  ]
}
```
Why it works: a myth many people believe, made specific ("from the Moon", "with the naked eye") so there is only one answer.

```json
{
  "id": "p.hist.0002",
  "status": "draft",
  "format": "tf",
  "category": "hist",
  "tags": ["ancient-egypt", "timelines"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": true,
  "stem": "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid of Giza.",
  "answer": true,
  "tfKind": "surprising_truth",
  "explanation": "The Great Pyramid was finished around 2560 BC, about 2,500 years before Cleopatra died in 30 BC. The Moon landing came about 2,000 years after her death.",
  "learnMore": "Cleopatra",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "date", "text": "Cleopatra's lifetime is closer to 1969 than to the building of the Great Pyramid."},
    {"id": "c2", "role": "explanation", "risk": "high", "riskReason": "date", "text": "The Great Pyramid of Giza was completed around 2560 BC."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Cleopatra died in 30 BC."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "The first crewed Moon landing was in 1969."}
  ]
}
```
Why it works: the margin is centuries wide, so the key holds whatever date you take for the pyramid, and the reveal rewires the player's sense of time.

```json
{
  "id": "p.nat.0002",
  "status": "draft",
  "format": "tf",
  "category": "nat",
  "tags": ["fish", "myths"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": true,
  "stem": "Goldfish can remember things for only about three seconds.",
  "answer": false,
  "tfKind": "myth",
  "explanation": "Experiments have trained goldfish to push levers or respond to sounds for food, and they kept the trick for months.",
  "learnMore": "Goldfish",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "Goldfish memory lasts far longer than three seconds."},
    {"id": "c2", "role": "explanation", "risk": "standard", "text": "Goldfish have been trained to push levers and to respond to sounds for food."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Trained goldfish kept the learned behaviour for months."}
  ]
}
```
Why it works: a myth stated plainly, with an explanation that shows how we know.

```json
{
  "id": "p.geo.0002",
  "status": "draft",
  "format": "tf",
  "category": "geo",
  "tags": ["borders", "islands"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": true,
  "stem": "At their closest point, Russia and the United States are less than 5 km apart.",
  "answer": true,
  "tfKind": "surprising_truth",
  "explanation": "In the Bering Strait, Russia's Big Diomede and the US island of Little Diomede sit about 3.8 km (2.4 miles) apart, on either side of the International Date Line.",
  "learnMore": "Diomede Islands",
  "claims": [
    {
      "id": "c1",
      "role": "key",
      "risk": "high",
      "riskReason": "number",
      "text": "At their closest point, between the Diomede Islands, Russia and the United States are less than 5 km apart."
    },
    {"id": "c2", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Big Diomede and Little Diomede are about 3.8 km apart."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "The International Date Line runs between the two islands."}
  ],
  "writerNotes": "The stem uses the bounded claim, so the key survives small differences in measurement. The exact figure sits in the explanation as its own high-risk claim."
}
```
Why it works: the precision ladder in action. The key is bounded and robust, and the exact figure lives in the explanation.

```json
{
  "id": "p.sport.0001",
  "status": "draft",
  "format": "tf",
  "category": "sport",
  "tags": ["olympics", "art"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": true,
  "stem": "The Olympic Games once awarded medals for painting and music.",
  "answer": true,
  "tfKind": "surprising_truth",
  "explanation": "From 1912 to 1948 the Olympics held art competitions in architecture, literature, music, painting and sculpture. Those medals do not count in official Olympic totals.",
  "learnMore": "Art competitions at the Summer Olympics",
  "claims": [
    {
      "id": "c1",
      "role": "key",
      "risk": "high",
      "riskReason": "date",
      "text": "From 1912 to 1948 the Olympics awarded medals in art competitions, including painting and music."
    },
    {"id": "c2", "role": "explanation", "risk": "standard", "text": "The art competitions covered architecture, literature, music, painting and sculpture."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Art competition medals are not included in official Olympic medal totals."}
  ]
}
```
Why it works: it sounds made up and isn't. That is the whole point of a surprising truth.

```json
{
  "id": "p.food.0002",
  "status": "draft",
  "format": "tf",
  "category": "food",
  "tags": ["vegetables", "food-history"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": true,
  "stem": "Most cultivated carrots were purple or yellow before orange varieties became common.",
  "answer": true,
  "tfKind": "surprising_truth",
  "explanation": "Orange carrots spread from Dutch growers in the 1600s. The popular story that they were bred to honour William of Orange has no good evidence behind it.",
  "learnMore": "Carrot",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "date", "text": "Before the 17th century, cultivated carrots were mostly purple or yellow."},
    {"id": "c2", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Orange carrots were developed and spread by Dutch growers in the 17th century."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "The claim that orange carrots were bred to honour William of Orange lacks good evidence."}
  ]
}
```
Why it works: the explanation catches a second myth on the way out, so the player leaves with two corrections.

```json
{
  "id": "p.lang.0002",
  "status": "draft",
  "format": "tf",
  "category": "lang",
  "tags": ["word-origins", "myths"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": true,
  "stem": "The word 'posh' comes from 'port out, starboard home', for the cooler cabins on voyages to India.",
  "answer": false,
  "tfKind": "myth",
  "explanation": "No ticket stamped 'P.O.S.H.' has ever been found, and the acronym story appeared long after the word. Dictionaries list the word's origin as unknown.",
  "learnMore": "Posh",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "etymology", "text": "There is no evidence that 'posh' comes from 'port out, starboard home'."},
    {"id": "c2", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "No ticket or document marked 'P.O.S.H.' has been found."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "Major dictionaries give the origin of 'posh' as unknown."}
  ]
}
```
Why it works: a tidy folk etymology that most people repeat, debunked with the kind of evidence a player can picture.

```json
{
  "id": "p.film.0002",
  "status": "draft",
  "format": "tf",
  "category": "film",
  "tags": ["quotations", "classic-films"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": true,
  "stem": "In Casablanca (1942), Humphrey Bogart's character says 'Play it again, Sam'.",
  "answer": false,
  "tfKind": "myth",
  "explanation": "Ilsa asks Sam to play it, and Rick later snaps 'Play it!', but nobody says the famous line. Woody Allen used the misquote as the title of a 1969 play.",
  "learnMore": "Casablanca (film)",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "quotation", "text": "No character in Casablanca says 'Play it again, Sam'."},
    {"id": "c2", "role": "explanation", "risk": "high", "riskReason": "quotation", "text": "Ilsa asks Sam to play the song, and Rick later tells him 'Play it!'"},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Woody Allen's play Play It Again, Sam opened in 1969."}
  ]
}
```
Why it works: misquotations make good myths, and every quotation is treated as a high-risk claim.

```json
{
  "id": "p.music.0002",
  "status": "draft",
  "format": "tf",
  "category": "music",
  "tags": ["classical", "myths"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": true,
  "stem": "Antonio Salieri poisoned Mozart.",
  "answer": false,
  "tfKind": "myth",
  "explanation": "There is no evidence of foul play. The rumour spread in Vienna in the 1820s and inspired Pushkin's 1830 play Mozart and Salieri, and later Peter Shaffer's Amadeus.",
  "learnMore": "Antonio Salieri",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "There is no evidence that Salieri poisoned Mozart."},
    {"id": "c2", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Rumours that Salieri poisoned Mozart circulated in Vienna in the 1820s."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Pushkin wrote Mozart and Salieri in 1830."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Peter Shaffer's Amadeus drew on the poisoning legend."}
  ]
}
```
Why it works: it corrects a story drama made famous, and it treats a real person fairly by naming the claim as a rumour.

```json
{
  "id": "p.soc.0001",
  "status": "draft",
  "format": "tf",
  "category": "soc",
  "tags": ["festivals", "calendars"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": true,
  "stem": "Many Orthodox Christians celebrate Christmas on 7 January.",
  "answer": true,
  "tfKind": "surprising_truth",
  "explanation": "Churches that still follow the older Julian calendar keep 25 December, which falls on 7 January in the everyday Gregorian calendar until the year 2100.",
  "learnMore": "Julian calendar",
  "claims": [
    {
      "id": "c1",
      "role": "key",
      "risk": "standard",
      "text": "Orthodox churches that use the Julian calendar, such as the Russian Orthodox Church, celebrate Christmas on 7 January in the Gregorian calendar."
    },
    {
      "id": "c2",
      "role": "explanation",
      "risk": "high",
      "riskReason": "number",
      "text": "From 1900 to 2100 the Julian calendar runs 13 days behind the Gregorian, so Julian 25 December is Gregorian 7 January."
    }
  ]
}
```
Why it works: a festival fact explained through the calendar, respectfully and with a built-in expiry date far beyond our horizon.

### 12.4 True or false: five bad examples

1. **A negative and an undefined term.** "The Great Wall of China is not visible from space."
   *Wrong:* a negative statement (lint C06), and "space" is undefined: in low orbit some astronauts say they glimpsed it, so either answer can be argued. *Fix:* the specific version in §12.3.
2. **Neither a myth nor a surprise.** "Water boils at 100 °C."
   *Wrong:* a plain fact, which is not what true/false is for, and it depends on pressure. *Fix:* "At the top of Mount Everest, water boils at about 70 °C." (True, and surprising.)
3. **A key that depends on interpretation.** "Chameleons change colour to match their background."
   *Wrong:* colour change mostly serves signalling and temperature, but some camouflage happens, so "true" and "false" can both be argued. *Fix:* state something settled, such as "Chameleons change colour partly by rearranging tiny crystals in their skin." (True.)
4. **A definition trap.** "Mount Everest is the tallest mountain on Earth."
   *Wrong:* highest above sea level, yes; tallest from base to summit, no (Mauna Kea). The key depends on a word. *Fix:* "Measured from its base on the sea floor, Mauna Kea is taller than Mount Everest." (True.)
5. **Local knowledge, no surprise.** "Thanksgiving is celebrated in November."
   *Wrong:* true in the US, false in Canada, and not a myth anywhere. *Fix:* "Canada celebrates Thanksgiving in October." (True, and a surprise to many.)

### 12.5 Comparison: ten good examples

```json
{
  "id": "p.hist.0003",
  "status": "draft",
  "format": "comparison",
  "category": "hist",
  "tags": ["universities", "aztecs"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": true,
  "stem": "Which came first?",
  "a": "Teaching at Oxford University",
  "b": "The founding of Tenochtitlan",
  "answer": "a",
  "relation": "earlier",
  "measure": "year it happened",
  "unit": "year",
  "values": {"a": 1096, "b": 1325},
  "valueDisplay": {"a": "by 1096", "b": "around 1325"},
  "explanation": "Oxford had teaching by 1096, more than two centuries before the Mexica founded Tenochtitlan around 1325. Mexico City is built on its ruins.",
  "learnMore": "University of Oxford",
  "claims": [
    {"id": "c1", "role": "label", "ref": "a", "risk": "high", "riskReason": "date", "text": "Teaching existed at Oxford in some form by 1096."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "date", "text": "Tenochtitlan was founded around 1325."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Tenochtitlan was founded by the Mexica, and Mexico City stands on its site."}
  ]
}
```
Why it works: intuition says the "ancient" Aztec city is older, the gap is centuries wide, and both labels are events of the same form.

```json
{
  "id": "p.geo.0003",
  "status": "draft",
  "format": "comparison",
  "category": "geo",
  "tags": ["latitude", "cities"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": true,
  "stem": "Which city is further north?",
  "a": "Rome",
  "b": "New York City",
  "answer": "a",
  "relation": "further_north",
  "measure": "latitude of the city centre",
  "unit": "° N",
  "values": {"a": 41.89, "b": 40.71},
  "valueDisplay": {"a": "41.9° N", "b": "40.7° N"},
  "explanation": "Rome sits at about 41.9° N and New York at about 40.7° N. Even Madrid, at 40.4° N, lies slightly south of New York.",
  "learnMore": "Rome",
  "claims": [
    {"id": "c1", "role": "label", "ref": "a", "risk": "high", "riskReason": "number", "text": "Central Rome lies at about 41.9° N."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "number", "text": "Central New York City lies at about 40.7° N."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Central Madrid lies at about 40.4° N, south of New York City."}
  ],
  "writerNotes": "All three latitudes checked in geonames-cities: Rome IT 41.89193, New York City US 40.71427, Madrid ES 40.4165."
}
```
Why it works: a dataset-checkable surprise. Most players pick New York, so it is Hard while being perfectly fair.

```json
{
  "id": "p.sci.0003",
  "status": "draft",
  "format": "comparison",
  "category": "sci",
  "tags": ["elements", "periodic-table"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": true,
  "stem": "Which element has more protons in each atom?",
  "a": "Gold",
  "b": "Mercury",
  "answer": "b",
  "relation": "more",
  "measure": "atomic number",
  "unit": "protons",
  "values": {"a": 79, "b": 80},
  "valueDisplay": {"a": "79 protons", "b": "80 protons"},
  "explanation": "Mercury has 80 protons and gold 79, so they sit side by side in the periodic table. Alchemists who hoped to turn one into the other were one proton away.",
  "learnMore": "Mercury (element)",
  "claims": [
    {"id": "c1", "role": "label", "ref": "a", "risk": "standard", "text": "Gold's atomic number is 79."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "standard", "text": "Mercury's atomic number is 80."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Alchemists tried to turn mercury and other metals into gold."}
  ],
  "writerNotes": "Checked in ptable (number 79 Gold, number 80 Mercury). A gap of one is allowed because atomic numbers are exact."
}
```
Why it works: the separation guard allows a one-unit gap for exact values, and the precious metal feels like the bigger one.

```json
{
  "id": "p.nat.0003",
  "status": "draft",
  "format": "comparison",
  "category": "nat",
  "tags": ["sharks", "fossils"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": true,
  "stem": "Which came first?",
  "a": "Sharks",
  "b": "Trees",
  "answer": "a",
  "relation": "earlier",
  "measure": "first appearance in the fossil record",
  "unit": "year",
  "values": {"a": -420000000, "b": -390000000},
  "valueDisplay": {"a": "at least 420 million years ago", "b": "about 390 million years ago"},
  "explanation": "Undisputed shark scales date back about 420 million years, and the oldest known trees about 390 million. Sharks were already ancient when the first dinosaurs appeared.",
  "learnMore": "Shark",
  "claims": [
    {"id": "c1", "role": "label", "ref": "a", "risk": "high", "riskReason": "date", "text": "Undisputed fossil shark scales are about 420 million years old."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "date", "text": "The oldest known fossil trees are about 390 million years old."},
    {
      "id": "c3",
      "role": "explanation",
      "risk": "high",
      "riskReason": "first",
      "text": "Sharks existed long before the first dinosaurs, which appeared about 230 million years ago."
    }
  ],
  "writerNotes": "Older shark-like scales of about 450 million years are disputed, so the item uses the undisputed figure, which still wins by about 30 million years."
}
```
Why it works: it uses the conservative figure for each side, so the answer holds under every date on offer.

```json
{
  "id": "p.film.0003",
  "status": "draft",
  "format": "comparison",
  "category": "film",
  "tags": ["1960s", "british-tv", "james-bond"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": false,
  "stem": "Which came first?",
  "a": "Dr. No opens in cinemas",
  "b": "Doctor Who first airs",
  "answer": "a",
  "relation": "earlier",
  "measure": "first release or broadcast",
  "unit": "year",
  "values": {"a": 1962, "b": 1963},
  "valueDisplay": {"a": "5 October 1962", "b": "23 November 1963"},
  "explanation": "Doctor Who's first episode aired on 23 November 1963, the day after President Kennedy was shot, and the BBC showed it again a week later.",
  "learnMore": "Dr. No (film)",
  "claims": [
    {"id": "c1", "role": "label", "ref": "a", "risk": "high", "riskReason": "date", "text": "Dr. No premiered in London on 5 October 1962."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "date", "text": "Doctor Who's first episode aired on 23 November 1963."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "President Kennedy was shot on 22 November 1963."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "date", "text": "The BBC repeated the first episode a week later, before episode two."}
  ],
  "writerNotes": "Only a year apart, which the separation guard allows because both dates are exact, documented days."
}
```
Why it works: two exact dates a year apart, each famous enough to reason about, and a reveal that ties the show to a moment in history.

```json
{
  "id": "p.sport.0002",
  "status": "draft",
  "format": "comparison",
  "category": "sport",
  "tags": ["inventions", "ball-games"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": false,
  "stem": "Which was invented first?",
  "a": "Basketball",
  "b": "Volleyball",
  "answer": "a",
  "relation": "earlier",
  "measure": "year invented",
  "unit": "year",
  "values": {"a": 1891, "b": 1895},
  "valueDisplay": {"a": "1891", "b": "1895"},
  "explanation": "James Naismith devised basketball in Springfield, Massachusetts, in 1891. Four years later William G. Morgan created volleyball, first called mintonette, in nearby Holyoke.",
  "learnMore": "Volleyball",
  "claims": [
    {
      "id": "c1",
      "role": "label",
      "ref": "a",
      "risk": "high",
      "riskReason": "first",
      "text": "James Naismith invented basketball in Springfield, Massachusetts, in December 1891."
    },
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "first", "text": "William G. Morgan created volleyball in Holyoke, Massachusetts, in 1895."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Volleyball was first called mintonette."}
  ],
  "writerNotes": "Four years apart, which the separation guard allows because both inventions are documented to exact days."
}
```
Why it works: two sports invented by single, documented people, so the "first" claims are as safe as firsts get.

```json
{
  "id": "p.food.0003",
  "status": "draft",
  "format": "comparison",
  "category": "food",
  "tags": ["food-history", "inventions"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": true,
  "stem": "Which came first?",
  "a": "The tin can",
  "b": "The can opener",
  "answer": "a",
  "relation": "earlier",
  "measure": "year it appeared",
  "unit": "year",
  "values": {"a": 1810, "b": 1855},
  "valueDisplay": {"a": "patented in 1810", "b": "the 1850s"},
  "explanation": "Peter Durand patented the tin can in 1810. Early cans were thick iron, opened with a hammer and chisel, and dedicated can openers arrived only in the 1850s.",
  "learnMore": "Tin can",
  "claims": [
    {
      "id": "c1",
      "role": "label",
      "ref": "a",
      "risk": "high",
      "riskReason": "first",
      "text": "Peter Durand received a British patent for preserving food in tin cans in 1810."
    },
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "first", "text": "The first dedicated can openers were patented in the 1850s."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Early cans were heavy and were opened with tools such as a hammer and chisel."}
  ]
}
```
Why it works: the right answer feels impossible until the explanation makes it obvious.

```json
{
  "id": "p.art.0002",
  "status": "draft",
  "format": "comparison",
  "category": "art",
  "tags": ["monuments", "engineering"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": false,
  "stem": "Which was completed first?",
  "a": "The Statue of Liberty",
  "b": "The Eiffel Tower",
  "answer": "a",
  "relation": "earlier",
  "measure": "year completed",
  "unit": "year",
  "values": {"a": 1886, "b": 1889},
  "valueDisplay": {"a": "dedicated 28 October 1886", "b": "opened 31 March 1889"},
  "explanation": "Gustave Eiffel's company designed the iron framework inside the statue, dedicated in New York in 1886. His tower opened in Paris three years later, in 1889.",
  "learnMore": "Statue of Liberty",
  "claims": [
    {"id": "c1", "role": "label", "ref": "a", "risk": "high", "riskReason": "date", "text": "The Statue of Liberty was dedicated on 28 October 1886."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "date", "text": "The Eiffel Tower opened on 31 March 1889."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Gustave Eiffel's company engineered the statue's internal iron framework."}
  ],
  "writerNotes": "Three years apart, which the separation guard allows because both dates are exact, documented days."
}
```
Why it works: the link between the two answers is the surprise, and both dates are exact.

```json
{
  "id": "p.lang.0003",
  "status": "draft",
  "format": "comparison",
  "category": "lang",
  "tags": ["alphabets", "scripts"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": false,
  "stem": "Which alphabet has more letters?",
  "a": "Modern Greek",
  "b": "Russian",
  "answer": "b",
  "relation": "more",
  "measure": "letters in the modern alphabet",
  "unit": "letters",
  "values": {"a": 24, "b": 33},
  "valueDisplay": {"a": "24 letters", "b": "33 letters"},
  "explanation": "Cyrillic borrowed many shapes from Greek, which is why Russian Г and П match Greek Γ and Π. It added letters for Slavic sounds Greek lacks, such as Ш.",
  "learnMore": "Cyrillic script",
  "claims": [
    {"id": "c1", "role": "label", "ref": "a", "risk": "standard", "text": "The modern Greek alphabet has 24 letters."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "standard", "text": "The modern Russian alphabet has 33 letters."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Many Cyrillic letters, including Г and П, derive from Greek letters."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Cyrillic added letters such as Ш for Slavic sounds that Greek lacks."}
  ]
}
```
Why it works: exact counts, a player can reason from the look of the scripts, and the reveal shows a family resemblance.

```json
{
  "id": "p.soc.0002",
  "status": "draft",
  "format": "comparison",
  "category": "soc",
  "tags": ["money", "printing"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": true,
  "stem": "Which came first?",
  "a": "Government paper money in China",
  "b": "Gutenberg's printing press",
  "answer": "a",
  "relation": "earlier",
  "measure": "year it appeared",
  "unit": "year",
  "values": {"a": 1024, "b": 1440},
  "valueDisplay": {"a": "the 1020s", "b": "around 1440"},
  "explanation": "Song dynasty officials issued paper notes called jiaozi in the 1020s, more than four centuries before Johannes Gutenberg printed his Bible in Mainz in the 1450s.",
  "learnMore": "Jiaozi (currency)",
  "claims": [
    {"id": "c1", "role": "label", "ref": "a", "risk": "high", "riskReason": "first", "text": "The Song government began issuing paper money, the jiaozi, in the 1020s."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "date", "text": "Gutenberg developed his printing press around 1440."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Gutenberg printed his Bible in Mainz in the 1450s."}
  ]
}
```
Why it works: four centuries of margin, and a reveal that moves the history of money out of Europe.

### 12.6 Comparison: five bad examples

1. **A same-year near-tie.** "Which came first: Nintendo or the Eiffel Tower?"
   *Wrong:* both date from 1889 (the tower opened in March, Nintendo was founded in September), so the answer turns on months nobody can reason about. The guard bans same-year pairs. *Fix:* choose pairs at least ten years apart.
2. **Which version of the thing?** "Which came first: Stonehenge or the Great Pyramid of Giza?"
   *Wrong:* Stonehenge's first earthworks are centuries older than the pyramid, but its famous stone circle is about the same age, so the answer depends on what "Stonehenge" means. *Fix:* name the phase, and keep a clear gap: "Stonehenge's first earthwork ditch".
3. **Started or finished?** "Which came first: the Mona Lisa or the Sistine Chapel ceiling?"
   *Wrong:* Leonardo began around 1503 and kept working on it into the 1510s, while the ceiling ran from 1508 to 1512. *Fix:* use events with a single date, or drop the pair.
4. **An undefined "bigger".** "Which is bigger: a blue whale or a giant sequoia?"
   *Wrong:* by height or by mass? Each gives a different fight. *Fix:* name the measure and compare typical adults with a wide gap ("Which is heavier?").
5. **A trick with no right answer.** "Which weighs more: a kilogram of feathers or a kilogram of steel?"
   *Wrong:* both weigh a kilogram, so neither button is right. A trick, banned by §3.6. *Fix:* drop it.

### 12.7 Mysteries: ten good examples

Ladders are listed hardest clue first. `seedSolveShares` is the writer's forecast (§8.3), and the expected points it implies sit inside the slot's assembly window.

```json
{
  "id": "m.film.0001",
  "kind": "mystery",
  "status": "draft",
  "category": "film",
  "tags": ["1990s", "oscars", "ships"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 2,
  "counterintuitive": false,
  "answerType": "film",
  "answer": "x.film.titanic-1997",
  "accepted": [],
  "clues": [
    "James Cameron wrote and directed it, and it was released in 1997.",
    "It won 11 Academy Awards, including Best Picture.",
    "Céline Dion sang its theme song, My Heart Will Go On.",
    "Leonardo DiCaprio and Kate Winslet play lovers aboard a liner on its doomed maiden voyage."
  ],
  "distractors": ["x.film.avatar-2009", "x.film.pearl-harbor-2001", "x.film.the-poseidon-adventure-1972"],
  "slot": 1,
  "sourceLabels": [],
  "likelyGuesses": [
    "x.film.avatar-2009",
    "x.film.the-terminator-1984",
    "x.film.terminator-2-judgment-day-1991",
    "x.film.true-lies-1994",
    "x.film.ben-hur-1959",
    "x.film.the-lord-of-the-rings-the-return-of-the-king-2003",
    "x.film.a-night-to-remember-1958",
    "x.film.pearl-harbor-2001"
  ],
  "rivals": [
    {"id": "x.film.ben-hur-1959", "ruledOutBy": [1, 3]},
    {"id": "x.film.the-lord-of-the-rings-the-return-of-the-king-2003", "ruledOutBy": [1, 3]},
    {"id": "x.film.a-night-to-remember-1958", "ruledOutBy": [1, 2, 3]}
  ],
  "giveawayTerms": ["RMS"],
  "seedSolveShares": [0.55, 0.78, 0.93, 0.99],
  "explanation": "Cameron filmed the real wreck, about 3,800 metres down in the North Atlantic, before shooting on a near full-size replica of the ship built in Mexico.",
  "learnMore": "Titanic (1997 film)",
  "claims": [
    {"id": "c1", "role": "uniqueness", "risk": "standard", "text": "Titanic (1997) is the only film in the list that fits clues 1 to 3."},
    {"id": "c2", "role": "clue", "ref": "clue:1", "risk": "standard", "text": "James Cameron wrote and directed Titanic, released in 1997."},
    {"id": "c3", "role": "clue", "ref": "clue:2", "risk": "high", "riskReason": "number", "text": "Titanic won 11 Academy Awards, including Best Picture."},
    {"id": "c4", "role": "clue", "ref": "clue:3", "risk": "standard", "text": "Céline Dion sang the film's theme song, My Heart Will Go On."},
    {"id": "c5", "role": "clue", "ref": "clue:4", "risk": "standard", "text": "Leonardo DiCaprio and Kate Winslet play lovers aboard the Titanic on its maiden voyage."},
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Avatar (2009), Pearl Harbor (2001) and The Poseidon Adventure (1972) each contradict clues 1 and 2."},
    {
      "id": "c7",
      "role": "explanation",
      "risk": "high",
      "riskReason": "number",
      "text": "Cameron filmed the real Titanic wreck, which lies about 3,800 metres deep in the North Atlantic."
    },
    {"id": "c8", "role": "explanation", "risk": "standard", "text": "The film was shot on a near full-size replica of the ship built in Mexico."}
  ]
}
```
Why it works: an easy ladder in which clue 1 is still the hardest step, two rivals that share the 11 Oscars, and a clue 4 that never says the ship's name.

```json
{
  "id": "m.music.0001",
  "kind": "mystery",
  "status": "draft",
  "category": "music",
  "tags": ["rock", "1970s", "bands"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 2,
  "counterintuitive": false,
  "answerType": "music_artist",
  "answer": "x.music_artist.queen",
  "accepted": [],
  "clues": [
    "Its singer, born Farrokh Bulsara in Zanzibar, took the stage name Freddie Mercury.",
    "Its 1975 single, nearly six minutes long, has an operatic middle section.",
    "It played a famous 20-minute set at Live Aid at Wembley Stadium in 1985.",
    "This British rock group recorded both We Will Rock You and We Are the Champions."
  ],
  "distractors": ["x.music_artist.the-rolling-stones", "x.music_artist.led-zeppelin", "x.music_artist.the-who"],
  "slot": 1,
  "sourceLabels": [],
  "likelyGuesses": [
    "x.music_artist.the-beatles",
    "x.music_artist.the-rolling-stones",
    "x.music_artist.led-zeppelin",
    "x.music_artist.the-who",
    "x.music_artist.pink-floyd",
    "x.music_artist.david-bowie",
    "x.music_artist.u2",
    "x.music_artist.deep-purple"
  ],
  "rivals": [
    {"id": "x.music_artist.the-who", "ruledOutBy": [1, 2]},
    {"id": "x.music_artist.u2", "ruledOutBy": [1, 2]},
    {"id": "x.music_artist.david-bowie", "ruledOutBy": [1, 2]}
  ],
  "giveawayTerms": [],
  "seedSolveShares": [0.6, 0.85, 0.93, 0.99],
  "explanation": "Guitarist Brian May finished a PhD in astrophysics in 2007, more than 30 years after pausing his studies when the band took off.",
  "learnMore": "Queen (band)",
  "claims": [
    {"id": "c1", "role": "uniqueness", "risk": "standard", "text": "Queen is the only music artist in the list that fits clues 1 to 3."},
    {"id": "c2", "role": "clue", "ref": "clue:1", "risk": "standard", "text": "Freddie Mercury, Queen's singer, was born Farrokh Bulsara in Zanzibar."},
    {
      "id": "c3",
      "role": "clue",
      "ref": "clue:2",
      "risk": "standard",
      "text": "Bohemian Rhapsody, released in 1975, runs almost six minutes and includes an operatic section."
    },
    {
      "id": "c4",
      "role": "clue",
      "ref": "clue:3",
      "risk": "high",
      "riskReason": "number",
      "text": "Queen played a set of about 20 minutes at Live Aid at Wembley Stadium in 1985."
    },
    {"id": "c5", "role": "clue", "ref": "clue:4", "risk": "standard", "text": "Queen recorded We Will Rock You and We Are the Champions."},
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "The Rolling Stones, Led Zeppelin and The Who each contradict clues 1, 2 and 4."},
    {
      "id": "c7",
      "role": "explanation",
      "risk": "high",
      "riskReason": "date",
      "text": "Brian May completed a PhD in astrophysics in 2007, decades after pausing his studies."
    }
  ],
  "writerNotes": "Display is 'Queen' without '(band)': no other entry in the music list shares the name, and a bracket only on the key would stand out among the clue-4 options."
}
```
Why it works: three Live Aid acts as rivals, so clue 3 alone isn't enough, and the display form stays parallel with the distractors.

```json
{
  "id": "m.sci.0001",
  "kind": "mystery",
  "status": "draft",
  "category": "sci",
  "tags": ["elements", "space", "gases"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": false,
  "answerType": "element",
  "answer": "x.element.helium",
  "accepted": [],
  "clues": [
    "Astronomers spotted it in sunlight during an 1868 eclipse, 27 years before it was found on Earth.",
    "It stays liquid at normal pressure even at absolute zero, the only element that does.",
    "It is the second most abundant element in the universe, after hydrogen.",
    "This light gas makes party balloons float and gives voices a squeaky sound."
  ],
  "distractors": ["x.element.hydrogen", "x.element.neon", "x.element.argon"],
  "slot": 2,
  "sourceLabels": [],
  "likelyGuesses": [
    "x.element.hydrogen",
    "x.element.oxygen",
    "x.element.nitrogen",
    "x.element.neon",
    "x.element.argon",
    "x.element.xenon",
    "x.element.radon",
    "x.element.krypton"
  ],
  "rivals": [
    {"id": "x.element.hydrogen", "ruledOutBy": [1, 2, 3]},
    {"id": "x.element.neon", "ruledOutBy": [1, 2, 3]},
    {"id": "x.element.oxygen", "ruledOutBy": [1, 2, 3]}
  ],
  "giveawayTerms": ["helios"],
  "seedSolveShares": [0.28, 0.52, 0.8, 0.98],
  "explanation": "The name comes from helios, Greek for the Sun. Most of Earth's helium forms from radioactive decay underground and is collected from natural gas wells.",
  "learnMore": "Helium",
  "claims": [
    {"id": "c1", "role": "uniqueness", "risk": "standard", "text": "Helium is the only element that fits clues 1 to 3."},
    {
      "id": "c2",
      "role": "clue",
      "ref": "clue:1",
      "risk": "high",
      "riskReason": "date",
      "text": "Helium was detected in the Sun's spectrum during the 1868 eclipse and first isolated on Earth in 1895."
    },
    {
      "id": "c3",
      "role": "clue",
      "ref": "clue:2",
      "risk": "high",
      "riskReason": "superlative",
      "text": "Helium is the only element that does not solidify at normal pressure, even near absolute zero."
    },
    {
      "id": "c4",
      "role": "clue",
      "ref": "clue:3",
      "risk": "high",
      "riskReason": "superlative",
      "text": "Helium is the second most abundant element in the universe, after hydrogen."
    },
    {
      "id": "c5",
      "role": "clue",
      "ref": "clue:4",
      "risk": "standard",
      "text": "Helium is lighter than air, lifts party balloons, and makes voices sound higher when breathed in."
    },
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Hydrogen, neon and argon each contradict clues 1, 2 and 3."},
    {"id": "c7", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "The name helium comes from the Greek helios, the Sun."},
    {"id": "c8", "role": "explanation", "risk": "standard", "text": "Most of Earth's helium comes from radioactive decay and is extracted from natural gas."}
  ]
}
```
Why it works: hydrogen is the perfect distractor, plausible on clue 4 alone and ruled out by three clues, and the explanation keeps the etymology for the reveal.

```json
{
  "id": "m.hist.0001",
  "kind": "mystery",
  "status": "draft",
  "category": "hist",
  "tags": ["byzantium", "ottomans", "cities"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": false,
  "answerType": "city",
  "answer": "x.city.istanbul-tr",
  "accepted": [],
  "clues": [
    "Mehmed II made it his capital after his army captured it in 1453.",
    "Its Hagia Sophia was completed in 537 as a Christian cathedral.",
    "It straddles Europe and Asia on either side of the Bosporus strait.",
    "This city on the Bosporus is home to the Grand Bazaar and the Blue Mosque."
  ],
  "distractors": ["x.city.ankara-tr", "x.city.athens-gr", "x.city.rome-it"],
  "slot": 2,
  "sourceLabels": [],
  "likelyGuesses": [
    "x.city.rome-it",
    "x.city.athens-gr",
    "x.city.ankara-tr",
    "x.city.alexandria-eg",
    "x.city.venice-it",
    "x.city.thessaloniki-gr",
    "x.city.cairo-eg",
    "x.city.damascus-sy"
  ],
  "rivals": [
    {"id": "x.city.rome-it", "ruledOutBy": [1, 2, 3]},
    {"id": "x.city.ankara-tr", "ruledOutBy": [1, 2, 3]},
    {"id": "x.city.thessaloniki-gr", "ruledOutBy": [1, 2, 3]}
  ],
  "giveawayTerms": ["Byzantine", "Constantine"],
  "seedSolveShares": [0.3, 0.5, 0.8, 0.97],
  "explanation": "Constantine renamed Byzantium after himself in 330. It remained a capital until 1923, when the new Turkish republic chose Ankara.",
  "learnMore": "Istanbul",
  "claims": [
    {"id": "c1", "role": "uniqueness", "risk": "standard", "text": "Istanbul is the only city in the list that fits clues 1 to 3."},
    {
      "id": "c2",
      "role": "clue",
      "ref": "clue:1",
      "risk": "high",
      "riskReason": "date",
      "text": "Ottoman forces under Mehmed II captured Constantinople in 1453, and he made it his capital."
    },
    {"id": "c3", "role": "clue", "ref": "clue:2", "risk": "high", "riskReason": "date", "text": "The Hagia Sophia was completed in 537 as a Christian cathedral."},
    {"id": "c4", "role": "clue", "ref": "clue:3", "risk": "standard", "text": "Istanbul lies on both sides of the Bosporus, in Europe and Asia."},
    {"id": "c5", "role": "clue", "ref": "clue:4", "risk": "standard", "text": "Istanbul is home to the Grand Bazaar and the Blue Mosque."},
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Ankara, Athens and Rome each contradict clues 1, 2 and 3."},
    {"id": "c7", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Constantine refounded Byzantium as his capital, Constantinople, in 330."},
    {"id": "c8", "role": "explanation", "risk": "high", "riskReason": "date", "text": "The Republic of Turkey made Ankara its capital in 1923."}
  ],
  "writerNotes": "'Constantinople' and 'Byzantium' are aliases of this entry, so no clue may contain them or words that begin like them ('Constantine', 'Byzantine'). Ankara is the useful distractor, since many players think it is the city everyone has heard of."
}
```
Why it works: the giveaway terms catch the prefix trap through the aliases, and Ankara tempts anyone who half-remembers which city is the capital.

```json
{
  "id": "m.art.0001",
  "kind": "mystery",
  "status": "draft",
  "category": "art",
  "tags": ["painters", "mexico", "self-portraits"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": false,
  "answerType": "person",
  "answer": "Q5588",
  "accepted": [],
  "clues": [
    "A bus crash at 18 left her with lifelong injuries, and she began painting while recovering in bed.",
    "Her family home in Coyoacán, the Blue House, opened as a museum in 1958.",
    "She married the muralist Diego Rivera twice.",
    "This Mexican painter is known for self-portraits with joined eyebrows and flowers in her hair."
  ],
  "distractors": ["Q46408", "x.person.tamara-de-lempicka", "Q233207"],
  "slot": 2,
  "sourceLabels": [],
  "likelyGuesses": ["x.person.diego-rivera", "Q46408", "Q233207", "x.person.remedios-varo", "x.person.tamara-de-lempicka", "x.person.maria-izquierdo"],
  "rivals": [
    {"id": "x.person.remedios-varo", "ruledOutBy": [1, 2, 3]},
    {"id": "Q233207", "ruledOutBy": [1, 2, 3]},
    {"id": "x.person.maria-izquierdo", "ruledOutBy": [1, 2, 3]}
  ],
  "giveawayTerms": [],
  "seedSolveShares": [0.27, 0.5, 0.85, 0.98],
  "explanation": "Kahlo and Rivera later lived in twin studio-houses in San Ángel, joined by a rooftop bridge. Her paintings borrowed from Mexican folk art, including small votive pictures called retablos.",
  "learnMore": "Frida Kahlo",
  "claims": [
    {"id": "c1", "role": "uniqueness", "risk": "standard", "text": "Frida Kahlo is the only person in the list that fits clues 1 to 3."},
    {
      "id": "c2",
      "role": "clue",
      "ref": "clue:1",
      "risk": "high",
      "riskReason": "date",
      "text": "Kahlo was badly injured in a bus accident in 1925, aged 18, and began painting during her recovery."
    },
    {
      "id": "c3",
      "role": "clue",
      "ref": "clue:2",
      "risk": "high",
      "riskReason": "date",
      "text": "Kahlo's family home in Coyoacán, the Blue House, opened as a museum in 1958."
    },
    {"id": "c4", "role": "clue", "ref": "clue:3", "risk": "standard", "text": "Kahlo married Diego Rivera twice."},
    {
      "id": "c5",
      "role": "clue",
      "ref": "clue:4",
      "risk": "standard",
      "text": "Kahlo was a Mexican painter known for self-portraits showing joined eyebrows and flowers in her hair."
    },
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Georgia O'Keeffe, Tamara de Lempicka and Leonora Carrington each contradict clues 1, 3 and 4."},
    {"id": "c7", "role": "explanation", "risk": "standard", "text": "Kahlo and Rivera lived in connected studio-houses in San Ángel, joined by a bridge."},
    {"id": "c8", "role": "explanation", "risk": "standard", "text": "Kahlo's work drew on Mexican folk art, including retablos."}
  ],
  "writerNotes": "Distractors are all women painters of the same era, because the clues say 'she'. Birth and death years and the Wikidata QID checked in moma-artists (ConstituentID 2963, Q5588)."
}
```
Why it works: the distractors match the clue's pronoun, era, field and fame, so clue 4 still asks for knowledge, and the category comes from the clue angle (art), not the list (person).

```json
{
  "id": "m.book.0001",
  "kind": "mystery",
  "status": "draft",
  "category": "book",
  "tags": ["gothic", "science-fiction", "1810s"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": false,
  "answerType": "book",
  "answer": "x.book.frankenstein-shelley",
  "accepted": [],
  "clues": [
    "Its author began it aged 18, during a ghost-story contest at a villa by Lake Geneva in 1816.",
    "It was first published anonymously in London on 1 January 1818.",
    "Its subtitle names the Titan who stole fire from the gods for humankind.",
    "In this Gothic novel, a young scientist builds a living creature and then abandons it."
  ],
  "distractors": ["x.book.dracula-stoker", "x.book.the-picture-of-dorian-gray-wilde", "x.book.the-invisible-man-wells"],
  "slot": 2,
  "sourceLabels": [],
  "likelyGuesses": [
    "x.book.dracula-stoker",
    "x.book.the-vampyre-polidori",
    "x.book.the-strange-case-of-dr-jekyll-and-mr-hyde-stevenson",
    "x.book.the-invisible-man-wells",
    "x.book.the-picture-of-dorian-gray-wilde",
    "x.book.prometheus-unbound-shelley"
  ],
  "rivals": [
    {"id": "x.book.the-vampyre-polidori", "ruledOutBy": [1, 2, 3]},
    {"id": "x.book.prometheus-unbound-shelley", "ruledOutBy": [1, 2]},
    {"id": "x.book.dracula-stoker", "ruledOutBy": [1, 2, 3]}
  ],
  "giveawayTerms": ["Prometheus"],
  "seedSolveShares": [0.25, 0.48, 0.85, 0.98],
  "explanation": "Mary Shelley was 20 when it came out. The creature is never named; Frankenstein is the scientist, Victor.",
  "learnMore": "Frankenstein",
  "claims": [
    {"id": "c1", "role": "uniqueness", "risk": "standard", "text": "Frankenstein is the only book in the list that fits clues 1 to 3."},
    {
      "id": "c2",
      "role": "clue",
      "ref": "clue:1",
      "risk": "high",
      "riskReason": "date",
      "text": "Mary Shelley, aged 18, began Frankenstein during the 1816 ghost-story contest at the Villa Diodati by Lake Geneva."
    },
    {"id": "c3", "role": "clue", "ref": "clue:2", "risk": "high", "riskReason": "date", "text": "Frankenstein was first published anonymously in London on 1 January 1818."},
    {"id": "c4", "role": "clue", "ref": "clue:3", "risk": "standard", "text": "Its subtitle is The Modern Prometheus, and Prometheus stole fire from the gods."},
    {"id": "c5", "role": "clue", "ref": "clue:4", "risk": "standard", "text": "In the novel a young scientist creates a living creature and abandons it."},
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Dracula, The Picture of Dorian Gray and The Invisible Man each contradict clues 1, 2 and 3."},
    {"id": "c7", "role": "explanation", "risk": "standard", "text": "Mary Shelley was 20 when Frankenstein was published."},
    {"id": "c8", "role": "explanation", "risk": "standard", "text": "The creature is never given a name; Victor Frankenstein is its maker."}
  ],
  "writerNotes": "John Polidori's The Vampyre came out of the same 1816 contest, so 'aged 18' is what makes clue 1 unique: Polidori was 20. The alias 'Frankenstein; or, The Modern Prometheus' is why clue 3 describes Prometheus without naming him."
}
```
Why it works: the uniqueness detail ("aged 18") rules out a real rival from the same night, and clue 3 gives a foothold without typing the alias.

```json
{
  "id": "m.sport.0001",
  "kind": "mystery",
  "status": "draft",
  "category": "sport",
  "tags": ["board-games", "chess"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": false,
  "answerType": "sport",
  "answer": "x.sport.chess",
  "accepted": [],
  "clues": [
    "Its most powerful piece gained its long-range moves in Europe in the late 1400s.",
    "It grew from chaturanga, a game played in India by about the 6th century.",
    "In 1997 IBM's Deep Blue computer beat world champion Garry Kasparov at it.",
    "Players move kings, queens, bishops and knights on a board of 64 squares."
  ],
  "distractors": ["x.sport.draughts", "x.sport.shogi", "x.sport.go"],
  "slot": 2,
  "sourceLabels": [],
  "likelyGuesses": ["x.sport.draughts", "x.sport.shogi", "x.sport.xiangqi", "x.sport.go", "x.sport.backgammon", "x.sport.mahjong"],
  "rivals": [
    {"id": "x.sport.shogi", "ruledOutBy": [1, 3]},
    {"id": "x.sport.xiangqi", "ruledOutBy": [1, 3]},
    {"id": "x.sport.draughts", "ruledOutBy": [1, 2, 3]}
  ],
  "giveawayTerms": ["checkmate"],
  "seedSolveShares": [0.25, 0.55, 0.85, 0.99],
  "explanation": "In chaturanga the queen's ancestor, the counsellor, moved only one square diagonally. The faster European game was nicknamed 'mad queen' chess.",
  "learnMore": "Chess",
  "claims": [
    {"id": "c1", "role": "uniqueness", "risk": "standard", "text": "Chess is the only game in the list that fits clues 1 to 3."},
    {
      "id": "c2",
      "role": "clue",
      "ref": "clue:1",
      "risk": "high",
      "riskReason": "date",
      "text": "The queen gained its modern long-range moves in Europe in the late 15th century."
    },
    {
      "id": "c3",
      "role": "clue",
      "ref": "clue:2",
      "risk": "high",
      "riskReason": "date",
      "text": "Chess developed from chaturanga, played in India by about the 6th century."
    },
    {"id": "c4", "role": "clue", "ref": "clue:3", "risk": "high", "riskReason": "date", "text": "IBM's Deep Blue beat world champion Garry Kasparov in a match in 1997."},
    {"id": "c5", "role": "clue", "ref": "clue:4", "risk": "standard", "text": "Chess pieces include kings, queens, bishops and knights, played on a 64-square board."},
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Draughts, shogi and go each contradict clues 1, 3 and 4."},
    {"id": "c7", "role": "explanation", "risk": "standard", "text": "In chaturanga the counsellor, the queen's forerunner, moved one square diagonally."},
    {"id": "c8", "role": "explanation", "risk": "standard", "text": "The new form of the game was nicknamed 'mad queen' chess."}
  ],
  "writerNotes": "Shogi and xiangqi also descend from chaturanga, so clue 2 alone is not unique; clue 1 and clue 3 rule them out."
}
```
Why it works: draughts shares the 64-square board and its crowned kings, so clue 4 still asks the player to know the pieces.

```json
{
  "id": "m.geo.0001",
  "kind": "mystery",
  "status": "draft",
  "category": "geo",
  "tags": ["asia", "landlocked", "steppe"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": false,
  "answerType": "country",
  "answer": "x.country.mongolia",
  "accepted": [],
  "clues": [
    "Its capital has the coldest average yearly temperature of any national capital.",
    "The Gobi Desert covers much of its southern half.",
    "Genghis Khan united its tribes in 1206 and began an empire from here.",
    "Many herders live in round felt tents called gers, and its only neighbours are Russia and China."
  ],
  "distractors": ["x.country.kazakhstan", "x.country.kyrgyzstan", "x.country.nepal"],
  "slot": 3,
  "sourceLabels": [],
  "likelyGuesses": ["x.country.kazakhstan", "x.country.canada", "x.country.russia", "x.country.china", "x.country.iceland", "x.country.finland", "x.country.kyrgyzstan"],
  "rivals": [
    {"id": "x.country.kazakhstan", "ruledOutBy": [1, 2, 3]},
    {"id": "x.country.china", "ruledOutBy": [1, 2, 3]},
    {"id": "x.country.russia", "ruledOutBy": [1, 2]}
  ],
  "giveawayTerms": ["Mongol", "Mongols", "Ulaanbaatar"],
  "seedSolveShares": [0.12, 0.3, 0.6, 0.95],
  "explanation": "Ulaanbaatar sits about 1,350 metres up on the steppe, far from any ocean, which makes its winters brutal. Kazakhstan also borders Russia and China, but it has three other neighbours.",
  "learnMore": "Mongolia",
  "claims": [
    {"id": "c1", "role": "uniqueness", "risk": "standard", "text": "Mongolia is the only country in the list that fits clues 1 to 3."},
    {
      "id": "c2",
      "role": "clue",
      "ref": "clue:1",
      "risk": "high",
      "riskReason": "superlative",
      "text": "Ulaanbaatar has the lowest average annual temperature of any national capital."
    },
    {"id": "c3", "role": "clue", "ref": "clue:2", "risk": "standard", "text": "The Gobi Desert covers much of southern Mongolia."},
    {
      "id": "c4",
      "role": "clue",
      "ref": "clue:3",
      "risk": "high",
      "riskReason": "date",
      "text": "Genghis Khan united the Mongol tribes in 1206 and founded the Mongol Empire."
    },
    {"id": "c5", "role": "clue", "ref": "clue:4", "risk": "standard", "text": "Many Mongolian herders live in gers, and Mongolia borders only Russia and China."},
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Kazakhstan, Kyrgyzstan and Nepal each contradict clues 1, 3 and 4."},
    {"id": "c7", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Ulaanbaatar lies about 1,350 metres above sea level."},
    {"id": "c8", "role": "explanation", "risk": "standard", "text": "Kazakhstan borders Russia, China, Kyrgyzstan, Uzbekistan and Turkmenistan."}
  ],
  "writerNotes": "Borders checked in mledoze-countries: MNG borders CHN and RUS; KAZ borders CHN, KGZ, RUS, TKM and UZB. The same file spells the capital 'Ulan Bator', so the city list carries both spellings."
}
```
Why it works: a hard clue 1 that experts know, a Kazakhstan distractor that fits half the story, and an answer every player recognizes on clue 4.

```json
{
  "id": "m.nat.0001",
  "kind": "mystery",
  "status": "draft",
  "category": "nat",
  "tags": ["amphibians", "mexico", "regeneration"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": false,
  "answerType": "animal",
  "answer": "x.animal.axolotl",
  "accepted": [],
  "clues": [
    "In the wild it lives only in the canals of Xochimilco, remnants of the lakes around the Aztec capital.",
    "It keeps its feathery external gills as an adult instead of changing form like most salamanders.",
    "It can regrow lost limbs, and even parts of its heart and brain.",
    "In 2021 Mexico put this smiling, often pink salamander on a new 50-peso banknote."
  ],
  "distractors": ["x.animal.olm", "x.animal.fire-salamander", "x.animal.chinese-giant-salamander"],
  "slot": 3,
  "sourceLabels": [],
  "likelyGuesses": ["x.animal.newt", "x.animal.mudpuppy", "x.animal.olm", "x.animal.hellbender", "x.animal.fire-salamander", "x.animal.frog", "x.animal.gecko"],
  "rivals": [
    {"id": "x.animal.olm", "ruledOutBy": [1]},
    {"id": "x.animal.mudpuppy", "ruledOutBy": [1]},
    {"id": "x.animal.newt", "ruledOutBy": [1, 2]}
  ],
  "giveawayTerms": [],
  "seedSolveShares": [0.12, 0.35, 0.62, 0.95],
  "explanation": "Its name comes from Nahuatl, the Aztec language, and is often linked to the god Xolotl. Scientists study it because it regrows tissue without scarring.",
  "learnMore": "Axolotl",
  "claims": [
    {"id": "c1", "role": "uniqueness", "risk": "standard", "text": "The axolotl is the only animal in the list that fits clues 1 to 3."},
    {
      "id": "c2",
      "role": "clue",
      "ref": "clue:1",
      "risk": "high",
      "riskReason": "superlative",
      "text": "Wild axolotls live only in the canals of Xochimilco, remnants of the lake system around Tenochtitlan, in modern Mexico City."
    },
    {"id": "c3", "role": "clue", "ref": "clue:2", "risk": "standard", "text": "Axolotls keep their external gills into adulthood, unlike most salamanders."},
    {"id": "c4", "role": "clue", "ref": "clue:3", "risk": "standard", "text": "Axolotls can regenerate limbs and parts of the heart and brain."},
    {"id": "c5", "role": "clue", "ref": "clue:4", "risk": "high", "riskReason": "date", "text": "Mexico issued a new 50-peso banknote showing an axolotl in 2021."},
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "The olm, the fire salamander and the Chinese giant salamander each contradict clues 1 and 4."},
    {"id": "c7", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "The word axolotl comes from Nahuatl and is often linked to the god Xolotl."},
    {"id": "c8", "role": "explanation", "risk": "standard", "text": "Axolotls regenerate tissue without scarring, which makes them important in research."}
  ],
  "writerNotes": "The aliases 'Mexican walking fish' and 'ajolote' stay out of every clue, and so does the word 'Mexico' in clues 1 to 3: its first letters match the alias in the suggestion box (lint C12 warns on it). Clue 4 may say Mexico, because by then players pick from options. The olm keeps its gills too, which makes it the expert's distractor."
}
```
Why it works: each clue is true of several salamanders on its own, but the clues together fit one, and the dated banknote clue cannot go stale.

```json
{
  "id": "m.food.0001",
  "kind": "mystery",
  "status": "draft",
  "category": "food",
  "tags": ["korea", "fermentation"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": false,
  "answerType": "dish",
  "answer": "x.dish.kimchi",
  "accepted": [],
  "clues": [
    "In 2013 UNESCO listed the custom of families making it together each autumn as intangible heritage.",
    "It is made by salting and fermenting vegetables, most often Chinese cabbage and radish.",
    "Its red colour usually comes from gochugaru, dried chilli flakes.",
    "This spicy fermented cabbage is served with almost every Korean meal."
  ],
  "distractors": ["x.dish.sauerkraut", "x.dish.bibimbap", "x.dish.tteokbokki"],
  "slot": 3,
  "sourceLabels": [],
  "likelyGuesses": ["x.dish.sauerkraut", "x.dish.bibimbap", "x.dish.tteokbokki", "x.dish.miso", "x.dish.natto", "x.dish.kombucha", "x.dish.tsukemono"],
  "rivals": [
    {"id": "x.dish.sauerkraut", "ruledOutBy": [1, 3]},
    {"id": "x.dish.tsukemono", "ruledOutBy": [1, 3]},
    {"id": "x.dish.pao-cai", "ruledOutBy": [1, 3]}
  ],
  "giveawayTerms": ["kimjang"],
  "seedSolveShares": [0.1, 0.35, 0.6, 0.95],
  "explanation": "Chilli peppers reached Korea only in the late 1500s or after, so older kimchi was not red. Hundreds of kinds exist, made with radish, cucumber and other vegetables.",
  "learnMore": "Kimchi",
  "claims": [
    {"id": "c1", "role": "uniqueness", "risk": "standard", "text": "Kimchi is the only dish in the list that fits clues 1 to 3."},
    {
      "id": "c2",
      "role": "clue",
      "ref": "clue:1",
      "risk": "high",
      "riskReason": "date",
      "text": "In 2013 UNESCO inscribed kimjang, the communal making of kimchi each autumn, as intangible cultural heritage."
    },
    {"id": "c3", "role": "clue", "ref": "clue:2", "risk": "standard", "text": "Kimchi is made by salting and fermenting vegetables, most often Chinese cabbage and radish."},
    {"id": "c4", "role": "clue", "ref": "clue:3", "risk": "standard", "text": "Kimchi's red colour usually comes from gochugaru, dried chilli flakes."},
    {"id": "c5", "role": "clue", "ref": "clue:4", "risk": "standard", "text": "Kimchi is a staple side dish served with most Korean meals."},
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Sauerkraut, bibimbap and tteokbokki each contradict clues 1 and 2."},
    {"id": "c7", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Chilli peppers reached Korea around the late 16th century."},
    {"id": "c8", "role": "explanation", "risk": "standard", "text": "There are hundreds of kinds of kimchi, made from vegetables including radish and cucumber."}
  ],
  "writerNotes": "'Kimjang' begins like 'kimchi', so typing it would surface the answer: it is a giveaway term and clue 1 describes the custom instead."
}
```
Why it works: the prefix trap is caught before a player could use it, and clue 4 is easy without naming the dish.

### 12.8 Mysteries: five bad examples

1. **A giveaway inside a word.** Answer Paris; clue 2: "Parisians call its underground railway the Métro."
   *Wrong:* "Parisians" begins with the answer's name. A player types the first letters straight from the clue and the suggestion box hands over the answer (lint C12). *Fix:* "Its underground railway opened in 1900, in time for a world's fair."
2. **An upside-down ladder that isn't unique.** Answer Australia; clue 1: "Kangaroos live in the wild here."
   *Wrong:* the most famous fact sits on clue 1, and it isn't even unique, because tree kangaroos live wild in Papua New Guinea. *Fix:* open with a specific, harder fact and save kangaroos for clue 4.
3. **A clue with a shelf life.** Answer Canada; clue 3: "Its current prime minister is ..."
   *Wrong:* office holders change, and our writers' knowledge ends in mid-2026 (§3.4). *Fix:* a dated fact: "In 1999 it created a new territory, Nunavut, from part of its Northwest Territories."
4. **An answer nobody recognizes.** Answer: the saola, a forest animal scientists identified in Vietnam in 1992.
   *Wrong:* most players can't recognize it even among four options, so the mystery is hard through obscurity rather than depth (§5.2, rule 10). *Fix:* keep the deep clues and choose an answer most adults would know on clue 4.
5. **A distractor that fits every clue.** Answer lion; clue 4: "This big cat lives wild in Africa and in India", with the leopard among the options.
   *Wrong:* leopards live wild in Africa and India too, and if clues 1 to 3 don't rule them out, two options are right. *Fix:* a clue only lions fit ("the only cats that live in large family groups called prides"), and the leopard in `rivals` with the clue that rules it out.

### 12.9 Encores: ten good examples

```json
{
  "id": "e.0001",
  "kind": "encore",
  "status": "draft",
  "category": "sci",
  "tags": ["sun", "scale"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": false,
  "question": "The Sun's volume is about how many times Earth's volume?",
  "valueKind": "quantity",
  "answer": 1300000,
  "decimals": 0,
  "unit": "times",
  "bands": null,
  "sourceLabels": [],
  "derivation": {
    "formula": "(695,700 km / 6,371 km) cubed",
    "inputs": [
      {"claimId": "c2", "value": 695700, "unit": "km", "what": "the Sun's nominal radius"},
      {"claimId": "c3", "value": 6371, "unit": "km", "what": "Earth's mean radius"}
    ],
    "unrounded": 1302097,
    "rounding": "two significant figures, as the figure is usually quoted"
  },
  "explanation": "The Sun's radius is about 109 times Earth's, and volume grows with the cube of the radius: 109 × 109 × 109 is roughly 1.3 million.",
  "learnMore": "Sun",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "number", "text": "The Sun's volume is about 1.3 million times Earth's."},
    {"id": "c2", "role": "input", "risk": "high", "riskReason": "number", "text": "The Sun's nominal radius is 695,700 km."},
    {"id": "c3", "role": "input", "risk": "high", "riskReason": "number", "text": "Earth's mean radius is 6,371 km."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "The Sun's radius is about 109 times Earth's."}
  ]
}
```
Why it works: a derived number that resists a quick search, with the arithmetic in the record and an explanation that teaches the cube rule.

```json
{
  "id": "e.0002",
  "kind": "encore",
  "status": "draft",
  "category": "geo",
  "tags": ["earth", "measurement"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": false,
  "question": "How long is the Equator, in kilometres?",
  "valueKind": "quantity",
  "answer": 40075,
  "decimals": 0,
  "unit": "kilometres",
  "bands": null,
  "sourceLabels": [],
  "derivation": null,
  "explanation": "Earth bulges at the Equator, so a loop through both poles is about 67 km shorter. In miles, the Equator is roughly 24,900.",
  "learnMore": "Equator",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "number", "text": "Earth's equatorial circumference is about 40,075 km."},
    {"id": "c2", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Earth's circumference through the poles is about 40,008 km, roughly 67 km less."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "40,075 km is about 24,900 miles."}
  ]
}
```
Why it works: a stable physical constant with one definition, and the explanation gives the miles for players who think in them.

```json
{
  "id": "e.0003",
  "kind": "encore",
  "status": "draft",
  "category": "hist",
  "tags": ["medieval", "wars"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": true,
  "question": "The Hundred Years' War between England and France lasted how many years?",
  "valueKind": "quantity",
  "answer": 116,
  "decimals": 0,
  "unit": "years",
  "bands": null,
  "sourceLabels": [],
  "derivation": {
    "formula": "1453 - 1337",
    "inputs": [
      {"claimId": "c2", "value": 1337, "unit": "year", "what": "start of the war"},
      {"claimId": "c3", "value": 1453, "unit": "year", "what": "end of the war"}
    ],
    "unrounded": 116,
    "rounding": "none"
  },
  "explanation": "It ran, with long truces, from 1337 to 1453. Historians gave it the name centuries later; nobody fighting it called it the Hundred Years' War.",
  "learnMore": "Hundred Years' War",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "number", "text": "The Hundred Years' War lasted 116 years."},
    {"id": "c2", "role": "input", "risk": "high", "riskReason": "date", "text": "The Hundred Years' War began in 1337."},
    {"id": "c3", "role": "input", "risk": "high", "riskReason": "date", "text": "The Hundred Years' War ended in 1453."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "The name 'Hundred Years' War' was given by later historians."}
  ],
  "writerNotes": "The naive guess of 100 is 13.8% off, inside the close band, which feels fair: the name nearly gets you there."
}
```
Why it works: the name plants a number that is close but not right, so the reveal lands as a surprise.

```json
{
  "id": "e.0004",
  "kind": "encore",
  "status": "draft",
  "category": "sport",
  "tags": ["chess", "puzzles"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": true,
  "question": "Counting every size from 1×1 up to 8×8, how many squares are on a chessboard?",
  "valueKind": "quantity",
  "answer": 204,
  "decimals": 0,
  "unit": "squares",
  "bands": null,
  "sourceLabels": [],
  "derivation": {
    "formula": "8² + 7² + 6² + 5² + 4² + 3² + 2² + 1²",
    "inputs": [
      {"claimId": "c2", "value": 8, "unit": "squares per side", "what": "size of a chessboard"}
    ],
    "unrounded": 204,
    "rounding": "none"
  },
  "explanation": "There are 64 squares of 1×1, 49 of 2×2, 36 of 3×3 and so on: the square numbers from 64 down to 1 add up to 204.",
  "learnMore": "Chessboard",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "number", "text": "An 8 by 8 board contains 204 squares of all sizes."},
    {"id": "c2", "role": "input", "risk": "standard", "text": "A chessboard is 8 squares by 8 squares."}
  ]
}
```
Why it works: nobody can look it up faster than they can reason it out, the obvious answer (64) is far off, and the explanation shows the method.

```json
{
  "id": "e.0005",
  "kind": "encore",
  "status": "draft",
  "category": "nat",
  "tags": ["dogs", "teeth"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": false,
  "question": "How many teeth does an adult dog have?",
  "valueKind": "quantity",
  "answer": 42,
  "decimals": 0,
  "unit": "teeth",
  "bands": null,
  "sourceLabels": [],
  "derivation": null,
  "explanation": "Puppies have 28 milk teeth, and adult dogs have 42, ten more than a full adult human set of 32. Cats get by with 30.",
  "learnMore": "Dog anatomy",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "number", "text": "An adult dog normally has 42 teeth."},
    {"id": "c2", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Puppies have 28 deciduous teeth."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "A full adult human set, wisdom teeth included, is 32 teeth."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "number", "text": "An adult cat normally has 30 teeth."}
  ]
}
```
Why it works: a familiar animal and an unfamiliar number, with a human count every player can anchor on.

```json
{
  "id": "e.0006",
  "kind": "encore",
  "status": "draft",
  "category": "art",
  "tags": ["architecture", "ancient-greece"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": false,
  "question": "As built, how many columns ran around the outside of the Parthenon in Athens?",
  "valueKind": "quantity",
  "answer": 46,
  "decimals": 0,
  "unit": "columns",
  "bands": null,
  "sourceLabels": [],
  "derivation": {
    "formula": "2 × 8 + 2 × 17 - 4 (corner columns counted once)",
    "inputs": [
      {"claimId": "c2", "value": 8, "unit": "columns", "what": "across each end"},
      {"claimId": "c3", "value": 17, "unit": "columns", "what": "along each side"}
    ],
    "unrounded": 46,
    "rounding": "none"
  },
  "explanation": "It had 8 columns across each end and 17 along each side, with corner columns counted once. Its columns lean slightly inward, one of several tricks that make it look straighter.",
  "learnMore": "Parthenon",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "number", "text": "The Parthenon's outer colonnade had 46 columns."},
    {"id": "c2", "role": "input", "risk": "high", "riskReason": "number", "text": "The Parthenon had 8 columns across each end."},
    {"id": "c3", "role": "input", "risk": "high", "riskReason": "number", "text": "The Parthenon had 17 columns along each side, corners included."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "The Parthenon's columns lean slightly inward, one of its optical refinements."}
  ]
}
```
Why it works: "as built" fixes the definition despite the ruins, and a player who pictures the temple can reason toward the count.

```json
{
  "id": "e.0007",
  "kind": "encore",
  "status": "draft",
  "category": "music",
  "tags": ["instruments", "harp"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": false,
  "question": "How many strings does a concert grand pedal harp have?",
  "valueKind": "quantity",
  "answer": 47,
  "decimals": 0,
  "unit": "strings",
  "bands": null,
  "sourceLabels": [],
  "derivation": null,
  "explanation": "Its strings span about six and a half octaves. Players find their place by colour: every C string is red, and every F string black or dark blue.",
  "learnMore": "Pedal harp",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "number", "text": "A concert grand pedal harp has 47 strings."},
    {"id": "c2", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Its range is about six and a half octaves."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "On a pedal harp the C strings are red and the F strings black or dark blue."}
  ],
  "writerNotes": "'Concert grand' pins the count: smaller pedal harps have fewer strings."
}
```
Why it works: wide guesses, almost no exact answers, and a reveal players can see in their heads next time they watch an orchestra.

```json
{
  "id": "e.0008",
  "kind": "encore",
  "status": "draft",
  "category": "film",
  "tags": ["animation", "disney", "1930s"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": false,
  "question": "In what year did Disney's Snow White and the Seven Dwarfs premiere?",
  "valueKind": "year",
  "answer": 1937,
  "decimals": 0,
  "unit": "",
  "bands": null,
  "sourceLabels": [],
  "derivation": null,
  "explanation": "Doubters nicknamed it 'Disney's Folly' during its years in production. It premiered in Los Angeles on 21 December 1937, and its profits helped pay for Disney's Burbank studio.",
  "learnMore": "Snow White and the Seven Dwarfs (1937 film)",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "date", "text": "Snow White and the Seven Dwarfs premiered in 1937."},
    {"id": "c2", "role": "explanation", "risk": "standard", "text": "Before release the film was nicknamed 'Disney's Folly'."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "It premiered in Los Angeles on 21 December 1937."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Profits from the film helped fund Disney's studio in Burbank."}
  ]
}
```
Why it works: a year most people place within a decade or two and few know exactly, which is what a tiebreaker needs.

```json
{
  "id": "e.0009",
  "kind": "encore",
  "status": "draft",
  "category": "lang",
  "tags": ["dictionaries", "18th-century"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": false,
  "question": "In what year did Samuel Johnson publish his Dictionary of the English Language?",
  "valueKind": "year",
  "answer": 1755,
  "decimals": 0,
  "unit": "",
  "bands": null,
  "sourceLabels": [],
  "derivation": null,
  "explanation": "Johnson defined about 42,000 words, working with a few assistants for about nine years. He defined 'lexicographer' as 'a harmless drudge'.",
  "learnMore": "A Dictionary of the English Language",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "date", "text": "Samuel Johnson's Dictionary of the English Language was published in 1755."},
    {"id": "c2", "role": "explanation", "risk": "high", "riskReason": "number", "text": "The dictionary defined about 42,000 words."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Johnson worked on it for about nine years, with a few assistants."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "quotation", "text": "Johnson defined a lexicographer as 'a harmless drudge'."}
  ]
}
```
Why it works: the foothold is the 18th century, and the quotation gives the reveal a laugh.

```json
{
  "id": "e.0010",
  "kind": "encore",
  "status": "draft",
  "category": "food",
  "tags": ["restaurants", "guides"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": false,
  "question": "In what year was the first Michelin Guide published?",
  "valueKind": "year",
  "answer": 1900,
  "decimals": 0,
  "unit": "",
  "bands": null,
  "sourceLabels": [],
  "derivation": null,
  "explanation": "Tyre makers André and Édouard Michelin gave it away free to encourage driving. Its restaurant stars came later: the first in 1926.",
  "learnMore": "Michelin Guide",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "first", "text": "The first Michelin Guide was published in 1900."},
    {"id": "c2", "role": "explanation", "risk": "standard", "text": "The Michelin brothers, André and Édouard, ran a tyre company and gave the first guides away."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "first", "text": "The guide awarded its first restaurant stars in 1926."}
  ]
}
```
Why it works: players guess from the age of motoring, and the link between tyres and fine dining is the surprise.

### 12.10 Encores: five bad examples

1. **A number that moves.** "How tall is the Eiffel Tower, in metres?"
   *Wrong:* its official height has changed several times as new antennas went up, so the key can drift (§6, rule 1). *Fix:* a fixed fact about it, such as the year it opened, or a different structure.
2. **Sources that disagree.** "How many glass panes does the Louvre pyramid have?"
   *Wrong:* found while writing this guide: the search summary reported 673 (the Louvre's count), 689 (attributed to I. M. Pei's office) and the popular myth of 666. A key with rival counts fails (§6, rule 2). *Fix:* cut it.
3. **A scale without a true zero.** "At sea level, what temperature does water boil at, in Fahrenheit?"
   *Wrong:* percentage error means nothing on °F or °C, and many players know 212 exactly (§6, rules 4 and 6). *Fix:* a ratio-scale quantity.
4. **A population.** "How many people live in Tokyo?"
   *Wrong:* it changes every year and depends on where you draw the boundary: the 23 wards, or the whole metropolitan area. *Fix:* none; populations stay out unless historical and dated.
5. **An ambiguous unit and a varying animal.** "How much does a blue whale weigh, in tons?"
   *Wrong:* "tons" means three different units, and individual whales vary widely. *Fix:* a defined, stable quantity in an unambiguous unit.

### 12.11 Room-pack questions: ten good examples

```json
{
  "id": "r.around-the-world.90",
  "kind": "choice",
  "status": "draft",
  "format": "mc",
  "category": "geo",
  "tags": ["ancient-sites", "middle-east"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 2,
  "counterintuitive": false,
  "stem": "In which country is the ancient city of Petra?",
  "answer": "Jordan",
  "wrong": ["Egypt", "Lebanon", "Syria"],
  "order": "shuffle",
  "explanation": "The Nabataeans carved Petra's temples and tombs straight into rose-red sandstone cliffs about 2,000 years ago.",
  "learnMore": "Petra",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "Petra is in Jordan."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Petra is not in Egypt, Lebanon or Syria."},
    {
      "id": "c3",
      "role": "explanation",
      "risk": "high",
      "riskReason": "date",
      "text": "The Nabataeans carved Petra's main monuments into sandstone cliffs about 2,000 years ago."
    }
  ]
}
```
Why it works (`around-the-world`, position 3): a short stem a host can read in one breath, four neighbouring countries, and a 17-word reveal.

```json
{
  "id": "r.around-the-world.91",
  "kind": "choice",
  "status": "draft",
  "format": "mc",
  "category": "geo",
  "tags": ["rivers", "middle-east"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": false,
  "stem": "Which river flows through Baghdad?",
  "answer": "Tigris",
  "wrong": ["Euphrates", "Jordan", "Nile"],
  "order": "shuffle",
  "explanation": "The Tigris and Euphrates frame Mesopotamia, 'the land between the rivers'. Baghdad stands on the Tigris; ancient Babylon stood on the Euphrates.",
  "learnMore": "Tigris",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "Baghdad lies on the Tigris."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "The Euphrates, the Jordan and the Nile do not flow through Baghdad."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "Mesopotamia means 'land between the rivers'."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Ancient Babylon stood on the Euphrates."}
  ]
}
```
Why it works (`around-the-world`, position 6): the Euphrates is the near miss, and the reveal hands the room a fact to argue about.

```json
{
  "id": "r.back-in-time.90",
  "kind": "choice",
  "status": "draft",
  "format": "mc",
  "category": "hist",
  "tags": ["ancient-wonders", "egypt"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": false,
  "stem": "Which ancient wonder stood on an island in the harbour of Alexandria?",
  "answer": "A lighthouse",
  "wrong": ["A bronze giant", "A great temple", "A royal tomb"],
  "order": "shuffle",
  "explanation": "The Pharos, finished around 280 BC, stood for centuries until earthquakes toppled it. Its name lives on in the French phare and Italian faro.",
  "learnMore": "Lighthouse of Alexandria",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "The Lighthouse of Alexandria stood on the island of Pharos, at Alexandria's harbour."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "The wonder at Alexandria was not a bronze statue, a temple or a tomb."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "The lighthouse was completed around 280 BC."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Earthquakes eventually destroyed the lighthouse."},
    {"id": "c5", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "The French 'phare' and the Italian 'faro' come from the name Pharos."}
  ]
}
```
Why it works (`back-in-time`, position 8): options in the same form and of similar length, and "a bronze giant" (the Colossus of Rhodes, which also stood by a harbour) is the trap.

```json
{
  "id": "r.screen-time.90",
  "kind": "choice",
  "status": "draft",
  "format": "mc",
  "category": "film",
  "tags": ["quotations", "science-fiction"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 1,
  "counterintuitive": false,
  "stem": "'May the Force be with you' is a line from which film series?",
  "answer": "Star Wars",
  "wrong": ["Star Trek", "Dune", "The Matrix"],
  "order": "shuffle",
  "explanation": "In the 1977 original, General Dodonna says it before the attack on the Death Star. Fans mark 4 May as Star Wars Day.",
  "learnMore": "May the Force be with you",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "quotation", "text": "'May the Force be with you' is a line from the Star Wars films."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "The line does not come from Star Trek, Dune or The Matrix."},
    {
      "id": "c3",
      "role": "explanation",
      "risk": "high",
      "riskReason": "quotation",
      "text": "In Star Wars (1977), General Dodonna says the line before the attack on the Death Star."
    },
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Fans celebrate 4 May as Star Wars Day."}
  ]
}
```
Why it works (`screen-time`, position 2): an early warm-up everyone can answer, with a behind-the-scenes reveal the fans in the room may not know.

```json
{
  "id": "r.sound-check.90",
  "kind": "choice",
  "status": "draft",
  "format": "mc",
  "category": "music",
  "tags": ["albums", "1960s"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 1,
  "counterintuitive": false,
  "stem": "Which band released the album Abbey Road in 1969?",
  "answer": "The Beatles",
  "wrong": ["The Rolling Stones", "The Kinks", "The Who"],
  "order": "shuffle",
  "explanation": "It is named after the London street of the EMI studio where they made it, and it was the last album the Beatles recorded together.",
  "learnMore": "Abbey Road",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "The Beatles released Abbey Road in 1969."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "The Rolling Stones, the Kinks and the Who did not release Abbey Road."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "The album is named after Abbey Road, the London street of the EMI studio where it was recorded."},
    {
      "id": "c4",
      "role": "explanation",
      "risk": "high",
      "riskReason": "superlative",
      "text": "Abbey Road was the last album the Beatles recorded together; Let It Be was released later but recorded earlier."
    }
  ]
}
```
Why it works (`sound-check`, position 1): position 1 is the easiest question in the pack, so every guest scores and the room relaxes.

```json
{
  "id": "r.wild-things.90",
  "kind": "choice",
  "status": "draft",
  "format": "mc",
  "category": "nat",
  "tags": ["bears", "arctic"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": true,
  "stem": "What colour is a polar bear's skin?",
  "answer": "Black",
  "wrong": ["White", "Pink", "Grey"],
  "order": "shuffle",
  "explanation": "Its fur only looks white: each hair is hollow and see-through, and scatters light. In zoos, algae inside the hairs have turned some bears green.",
  "learnMore": "Polar bear",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "A polar bear's skin is black."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "A polar bear's skin is not white, pink or grey."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Polar bear hairs are hollow and translucent, and look white because they scatter light."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Algae growing in the hollow hairs have turned zoo polar bears green."}
  ]
}
```
Why it works (`wild-things`, position 9): the obvious answer is wrong, the room groans, and the reveal is the kind of fact people repeat in the car home.

```json
{
  "id": "r.kitchen-table.90",
  "kind": "choice",
  "status": "draft",
  "format": "mc",
  "category": "food",
  "tags": ["sweets", "nuts"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 2,
  "counterintuitive": false,
  "stem": "Which nut is the main ingredient of marzipan?",
  "answer": "Almond",
  "wrong": ["Hazelnut", "Walnut", "Pistachio"],
  "order": "shuffle",
  "explanation": "Marzipan is mostly ground almonds and sugar. Lübeck in Germany and Toledo in Spain both claim it as their speciality.",
  "learnMore": "Marzipan",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "Marzipan is made mainly from ground almonds and sugar."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Hazelnuts, walnuts and pistachios are not the main ingredient of marzipan."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Lübeck and Toledo are both known for marzipan and claim it as a local speciality."}
  ]
}
```
Why it works (`kitchen-table`, position 5): one confident answer for most of the room, and a reveal that names a rivalry instead of crowning a winner.

```json
{
  "id": "r.game-on.90",
  "kind": "choice",
  "status": "draft",
  "format": "mc",
  "category": "sport",
  "tags": ["tennis", "terms"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 3,
  "counterintuitive": false,
  "stem": "In tennis, what is a score of zero called?",
  "answer": "Love",
  "wrong": ["Nil", "Duck", "Zilch"],
  "order": "shuffle",
  "explanation": "Nobody knows for sure why. A popular theory links it to l'œuf, French for 'the egg', but there is little evidence.",
  "learnMore": "Tennis scoring system",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "In tennis, a score of zero is called 'love'."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "'Nil' (football), 'duck' (cricket) and 'zilch' are not tennis terms for zero."},
    {
      "id": "c3",
      "role": "explanation",
      "risk": "high",
      "riskReason": "etymology",
      "text": "The origin of 'love' in tennis scoring is uncertain, and the l'œuf theory lacks good evidence."
    }
  ]
}
```
Why it works (`game-on`, position 7): every distractor is a real word for zero from another game, and the explanation is honest about an uncertain origin rather than repeating a tidy story.

```json
{
  "id": "r.all-sorts.90",
  "kind": "choice",
  "status": "draft",
  "format": "mc",
  "category": "sci",
  "tags": ["internet", "inventions"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 2,
  "counterintuitive": false,
  "stem": "Which scientist proposed the World Wide Web in 1989?",
  "answer": "Tim Berners-Lee",
  "wrong": ["Vint Cerf", "Alan Turing", "Bill Gates"],
  "order": "shuffle",
  "explanation": "Working at CERN near Geneva, he wanted physicists to share documents easily. The first website went live in 1991, explaining what the web was.",
  "learnMore": "Tim Berners-Lee",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "date", "text": "Tim Berners-Lee proposed the World Wide Web at CERN in 1989."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Vint Cerf, Alan Turing and Bill Gates did not propose the World Wide Web."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Berners-Lee wanted a way for physicists to share documents."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "first", "text": "The first website went live in 1991 and described the web project itself."}
  ]
}
```
Why it works (`all-sorts`, position 4): Vint Cerf, a real pioneer of the internet, is the expert's trap, and the web-versus-internet distinction is the lesson.

```json
{
  "id": "r.all-sorts.91",
  "kind": "choice",
  "status": "draft",
  "format": "mc",
  "category": "sci",
  "tags": ["planets", "space"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": true,
  "stem": "Which planet has the hottest surface in our solar system?",
  "answer": "Venus",
  "wrong": ["Mercury", "Mars", "Jupiter"],
  "order": "shuffle",
  "explanation": "Venus is nearly twice as far from the Sun as Mercury, but its thick carbon dioxide air traps heat at around 465 °C (870 °F).",
  "learnMore": "Venus",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "superlative", "text": "Venus has the hottest surface of any planet in the solar system."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Mercury and Mars have cooler surfaces than Venus, and Jupiter has no solid surface."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Venus orbits nearly twice as far from the Sun as Mercury."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Venus's surface temperature is around 465 °C (870 °F)."}
  ]
}
```
Why it works (`all-sorts`, position 15): a medium finale with the pack's best reveal, worth double points, and "surface" in the stem removes the Jupiter argument.

### 12.12 Room-pack questions: five bad examples

1. **A stem nobody can read across a room.** "In 1066, at the Battle of Hastings, fought on 14 October near the town that grew up as Battle in East Sussex, which English king was killed?"
   *Wrong:* far over 100 characters for a big screen under a timer, and it buries the question. *Fix:* "Which English king died at the Battle of Hastings in 1066?"
2. **A copy of a practice item.** "Which city is the capital of Australia?"
   *Wrong:* the practice bank already holds it, with its key, on every phone in the room, so a guest can find the answer in the cached pack, and regulars will feel it's a repeat. *Fix:* room packs use facts no practice or Daily item covers (§10.9).
3. **True/false in a room.** "True or false: bats are blind."
   *Wrong:* packs are four-option multiple choice only (memo §11), and a 50% guess swings timed scores. *Fix:* rewrite as multiple choice, or move it to practice if it's a good myth.
4. **A current champion, and local.** "Which club won the most recent Premier League title?"
   *Wrong:* it goes stale every May, "most recent" is a time word (lint C09), and it's English club football, not global. *Fix:* dated and global: "Which country won the first men's FIFA World Cup, in 1930?" (Uruguay).
5. **A coin-flip finale.** Position 15, the double-points question, is an obscure date nobody can reason about, such as the year a small country adopted its flag.
   *Wrong:* doubling a question nobody can reach turns the result into luck. *Fix:* position 15 is medium, with the pack's best reveal (§10.9).

### 12.13 Answer-list entries: twelve good examples, one per type

```json
[
  {
    "id": "x.country.czechia",
    "name": "Czechia",
    "display": "Czechia",
    "aliases": ["Czech Republic", "Česko", "Česká republika"],
    "popularity": 0,
    "qualifier": {"iso_a2": "CZ"},
    "source": "cldr-territories@7d2b9cb CZ; checked mledoze-countries cca3=CZE",
    "status": "active",
    "addedIn": "2026-11-01",
    "wikidataId": null,
    "replacedBy": null
  },
  {
    "id": "x.city.cordoba-ar",
    "name": "Córdoba",
    "display": "Córdoba, Argentina",
    "aliases": [],
    "popularity": 0,
    "qualifier": {"country": "AR", "admin1": "05"},
    "source": "geonames-cities name=Córdoba country=AR admin1=05",
    "status": "active",
    "addedIn": "2026-11-01",
    "wikidataId": null,
    "replacedBy": null
  },
  {
    "id": "Q5588",
    "name": "Frida Kahlo",
    "display": "Frida Kahlo",
    "aliases": ["Magdalena Carmen Frida Kahlo y Calderón"],
    "popularity": 0,
    "qualifier": {"descriptor": "painter", "born": 1907},
    "source": "moma-artists@51a140d ConstituentID=2963",
    "status": "active",
    "addedIn": "2026-11-01",
    "wikidataId": null,
    "replacedBy": null
  },
  {
    "id": "x.film.parasite-2019",
    "name": "Parasite",
    "display": "Parasite (2019)",
    "aliases": ["Gisaengchung"],
    "popularity": 0,
    "qualifier": {"year": 2019},
    "source": "l.film.b04",
    "status": "active",
    "addedIn": "2026-11-01",
    "wikidataId": null,
    "replacedBy": null
  },
  {
    "id": "x.tv_series.the-office-uk",
    "name": "The Office",
    "display": "The Office (UK)",
    "aliases": [],
    "popularity": 0,
    "qualifier": {"descriptor": "UK", "country": "GB", "startYear": 2001},
    "source": "l.tv_series.b01",
    "status": "active",
    "addedIn": "2026-11-01",
    "wikidataId": null,
    "replacedBy": null
  },
  {
    "id": "x.book.one-hundred-years-of-solitude-garcia-marquez",
    "name": "One Hundred Years of Solitude",
    "display": "One Hundred Years of Solitude (Gabriel García Márquez)",
    "aliases": ["Cien años de soledad", "100 Years of Solitude"],
    "popularity": 0,
    "qualifier": {"author": "Gabriel García Márquez", "year": 1967},
    "source": "l.book.b02",
    "status": "active",
    "addedIn": "2026-11-01",
    "wikidataId": null,
    "replacedBy": null
  },
  {
    "id": "x.animal.orca",
    "name": "Orca",
    "display": "Orca",
    "aliases": ["Killer whale"],
    "popularity": 0,
    "qualifier": {"scientificName": "Orcinus orca"},
    "source": "l.animal.b02",
    "status": "active",
    "addedIn": "2026-11-01",
    "wikidataId": null,
    "replacedBy": null
  },
  {
    "id": "x.element.aluminium",
    "name": "Aluminium",
    "display": "Aluminium",
    "aliases": ["Aluminum"],
    "popularity": 0,
    "qualifier": {"symbol": "Al", "number": 13},
    "source": "ptable@a78c7a4 number=13",
    "status": "active",
    "addedIn": "2026-11-01",
    "wikidataId": null,
    "replacedBy": null
  },
  {
    "id": "x.landmark.angkor-wat",
    "name": "Angkor Wat",
    "display": "Angkor Wat, Cambodia",
    "aliases": [],
    "popularity": 0,
    "qualifier": {"country": "KH"},
    "source": "l.landmark.b01",
    "status": "active",
    "addedIn": "2026-11-01",
    "wikidataId": null,
    "replacedBy": null
  },
  {
    "id": "x.music_artist.bjork",
    "name": "Björk",
    "display": "Björk",
    "aliases": ["Björk Guðmundsdóttir"],
    "popularity": 0,
    "qualifier": {"descriptor": "singer", "kind": "solo"},
    "source": "l.music_artist.b05",
    "status": "active",
    "addedIn": "2026-11-01",
    "wikidataId": null,
    "replacedBy": null
  },
  {
    "id": "x.dish.gazpacho",
    "name": "Gazpacho",
    "display": "Gazpacho",
    "aliases": [],
    "popularity": 0,
    "qualifier": {"origin": "ES"},
    "source": "l.dish.b01",
    "status": "active",
    "addedIn": "2026-11-01",
    "wikidataId": null,
    "replacedBy": null
  },
  {
    "id": "x.sport.association-football",
    "name": "Football (soccer)",
    "display": "Football (soccer)",
    "aliases": ["Association football", "Soccer", "Football"],
    "popularity": 0,
    "qualifier": {},
    "source": "l.sport.b01",
    "status": "active",
    "addedIn": "2026-11-01",
    "wikidataId": null,
    "replacedBy": null
  }
]
```

| Entry | Why it is right |
|---|---|
| Czechia | CLDR's short name with its variant "Czech Republic" as an alias, which the countries dataset leaves out (§12.14) |
| Córdoba, Argentina | The country qualifier separates it from Córdoba, Spain; no diacritic-free alias is needed, because matching strips accents |
| Frida Kahlo | A real QID copied from a dataset that carries one, with its locator; the descriptor is stored but not shown, because nobody else in the list shares the name |
| Parasite (2019) | The film year is always shown; the romanized Korean title is an alias for players who know it that way |
| The Office (UK) | A collision descriptor, because The Office (US) shares the title |
| One Hundred Years of Solitude | The author is always shown; the original Spanish title and the numeral form are aliases |
| Orca | Both common names, so neither group of players is marked wrong |
| Aluminium | The IUPAC spelling, with the US spelling as an alias; number and symbol from the pinned periodic table |
| Angkor Wat, Cambodia | Landmarks always carry their country |
| Björk | Diacritics kept in the display; the full name as an alias |
| Gazpacho | A dish with one name in every English variety, so no aliases are needed |
| Football (soccer) | The football rule from §3.3 applied to a list entry, with every name players type |

### 12.14 Answer-list entries: five bad examples

1. **An alias list copied from a dataset.** `{"id": "x.country.czechia", "name": "Czechia", "aliases": ["CZ", "Česká republika", "Česko"]}`, taken from `mledoze-countries`.
   *Wrong:* no "Czech Republic", which many players type, and an ISO code ("CZ") that clutters suggestions. *Fix:* the CLDR variant as an alias, and ISO codes only where people really type them (UK, US, USA, UAE).
2. **An element that doesn't exist yet.** `{"id": "x.element.ununennium", "name": "Ununennium"}`, copied from `ptable`.
   *Wrong:* element 119 hasn't been discovered; the dataset holds a placeholder with a predicted phase and a named lab. *Fix:* the element list is the 118 confirmed elements.
3. **One person in two lists.** "Wolfgang Amadeus Mozart" in both `person.json` and `music_artist.json`.
   *Wrong:* a mystery's answer type decides which ID counts, so a player who picks the twin from the other list can never match. *Fix:* one entity, one list (§2.10, rule 1); Mozart belongs in `music_artist`.
4. **A Wikidata id typed from memory.** `{"id": "Q12345", "name": "..."}`, with the QID typed by a writer.
   *Wrong:* nobody can verify it, it may point at another entity, and it would corrupt suggestion ranking. *Fix:* an `x.` id until the enrichment job finds the QID, or a QID copied from a dataset that carries one, with its locator (§2.12, §9.6).
5. **A list too small to hide anything.** A `planet` list of 8 entries used for a medium mystery.
   *Wrong:* typing "M" shows two of the eight, so the suggestion box all but solves it. *Fix:* never under 30 entries; under 100 only for Mystery 1 (PRD §3.18.4), so planets go elsewhere or don't run as mysteries.

### 12.15 A filled-in verification record

This is the `verification` object for the Canberra item in §12.1, to show the format. The dataset values and the search results are real lookups made on 31 October 2026 while writing this guide. Agent ids and timestamps are placeholders, as are the packet hashes, and the `results` list keeps four of the eighteen results the search returned; a real record keeps all of them.

```json
{
  "checks": [
    {
      "checker": "fc-a1b2c3",
      "pass": "A",
      "brief": "confirm",
      "packetSha256": "<sha256 of packet A>",
      "startedAt": "2026-11-02T10:00:00Z",
      "finishedAt": "2026-11-02T10:06:00Z",
      "coldSolve": {"answerGiven": "Canberra", "confidence": "high", "matchedKey": true},
      "claimResults": [
        {
          "claimId": "c1",
          "verdict": "confirmed",
          "method": "dataset",
          "evidence": {
            "kind": "dataset",
            "dataset": "mledoze-countries",
            "version": "6031f5df137c41c76d180c55a0782185ae3ed05b",
            "file": "countries.json",
            "locator": "cca3=AUS",
            "excerpt": "\"capital\": [\"Canberra\"]",
            "retrievedAt": "2026-10-31"
          },
          "note": ""
        },
        {
          "claimId": "c2",
          "verdict": "confirmed",
          "method": "dataset",
          "evidence": {
            "kind": "dataset",
            "dataset": "mledoze-countries",
            "version": "6031f5df137c41c76d180c55a0782185ae3ed05b",
            "file": "countries.json",
            "locator": "cca3=AUS",
            "excerpt": "\"capital\": [\"Canberra\"]",
            "retrievedAt": "2026-10-31"
          },
          "note": "The national capital list holds only Canberra. That Sydney, Melbourne and Perth are state capitals is standard knowledge."
        },
        {
          "claimId": "c3",
          "verdict": "confirmed",
          "method": "web",
          "evidence": {
            "kind": "web",
            "query": "Australian Constitution section 125 seat of government New South Wales \"not less than one hundred miles from Sydney\"",
            "results": [
              {"title": "Section 125 of the Constitution of Australia", "url": "https://en.wikipedia.org/wiki/Section_125_of_the_Constitution_of_Australia"},
              {
                "title": "constitution heading image",
                "url": "https://peo.gov.au/understand-our-parliament/how-parliament-works/the-australian-constitution/the-australian-constitution-online/chapter-vii"
              },
              {"title": "aph.gov.au", "url": "https://aph.gov.au/About_Parliament/Senate/Practice_and_Procedure/Constitution/chapter7"},
              {"title": "Commonwealth of Australia Constitution Act 1900 (UK)", "url": "https://www.foundingdocs.gov.au/item-sdid-122.html"}
            ],
            "summaryExcerpt": "Section 125 requires the seat of the Commonwealth government to be in New South Wales and at least 100 miles from Sydney.",
            "tiers": ["A", "B"],
            "conflictReported": false,
            "retrievedAt": "2026-10-31"
          },
          "note": ""
        },
        {
          "claimId": "c4",
          "verdict": "confirmed",
          "method": "knowledge",
          "evidence": {
            "kind": "knowledge",
            "basis": "reference",
            "restatement": "Sydney and Melbourne competed to be the federal capital, and Canberra was a compromise site between them.",
            "confidence": "certain"
          },
          "note": ""
        },
        {
          "claimId": "c5",
          "verdict": "confirmed",
          "method": "knowledge",
          "evidence": {
            "kind": "knowledge",
            "basis": "everyday",
            "restatement": "A mile is about 1.609 km, so 100 miles is about 161 km.",
            "confidence": "certain"
          },
          "note": ""
        }
      ],
      "issues": [],
      "searchesUsed": 1,
      "verdict": "pass"
    },
    {
      "checker": "fc-d4e5f6",
      "pass": "B",
      "brief": "refute",
      "packetSha256": "<sha256 of packet B>",
      "startedAt": "2026-11-02T10:01:00Z",
      "finishedAt": "2026-11-02T10:05:00Z",
      "coldSolve": {"answerGiven": "Canberra", "confidence": "high", "matchedKey": true},
      "claimResults": [
        {
          "claimId": "c1",
          "verdict": "confirmed",
          "method": "knowledge",
          "evidence": {
            "kind": "knowledge",
            "basis": "textbook",
            "restatement": "Canberra is the capital of Australia and the home of its federal parliament.",
            "confidence": "certain"
          },
          "note": "Rival test: Sydney is the largest city and Melbourne was the temporary seat of government until 1927, but neither is the capital."
        },
        {
          "claimId": "c2",
          "verdict": "confirmed",
          "method": "knowledge",
          "evidence": {
            "kind": "knowledge",
            "basis": "textbook",
            "restatement": "Sydney, Melbourne and Perth are the capitals of New South Wales, Victoria and Western Australia.",
            "confidence": "certain"
          },
          "note": ""
        },
        {
          "claimId": "c3",
          "verdict": "confirmed",
          "method": "knowledge",
          "evidence": {
            "kind": "knowledge",
            "basis": "reference",
            "restatement": "Section 125 places the seat of government in New South Wales, at least 100 miles from Sydney.",
            "confidence": "certain"
          },
          "note": "High-risk: needs external evidence in the other check to count (9.9)."
        },
        {
          "claimId": "c4",
          "verdict": "confirmed",
          "method": "knowledge",
          "evidence": {
            "kind": "knowledge",
            "basis": "reference",
            "restatement": "The Sydney and Melbourne rivalry led to a new, separate capital.",
            "confidence": "certain"
          },
          "note": ""
        },
        {
          "claimId": "c5",
          "verdict": "confirmed",
          "method": "knowledge",
          "evidence": {
            "kind": "knowledge",
            "basis": "everyday",
            "restatement": "100 miles is roughly 161 km.",
            "confidence": "certain"
          },
          "note": ""
        }
      ],
      "issues": [
        {"type": "regional", "severity": "note", "note": "Fair worldwide: the Sydney trap works for players everywhere."}
      ],
      "searchesUsed": 0,
      "verdict": "pass"
    }
  ],
  "tiebreak": null,
  "editor": {
    "editor": "ed-g7h8i9",
    "decision": "accept",
    "reason": "Both checks pass. c1 and c3 carry external evidence. Style clean.",
    "decidedAt": "2026-11-02T11:00:00Z"
  },
  "dedupe": {"checkedAt": "2026-11-02T10:10:00Z", "nearestId": null, "score": 0.0, "verdict": "unique"},
  "mythsScreen": {"checkedAt": "2026-11-02T10:10:00Z", "hits": []},
  "lint": {"version": "1.0", "passed": true, "warnings": []},
  "rechecks": []
}
```

---

## Appendix A. Where this guide refines the inputs, and what it hands back

| # | Topic | The inputs say | This guide | Who acts |
|---|---|---|---|---|
| 1 | Sealed content in a public repository | Answers sealed (constraint 4); everything reproducible from the repo (memo §10); envelopes in `content/sealed/` with a git-ignored plaintext workspace (ARCHITECTURE §5.4) | Follows ARCHITECTURE §5.4, adds the `git check-ignore` guard, and holds sealed writing until the `.gitignore` entry and the content key exist (§11.2). On 31 October 2026 `content/.sealed-plain/` was not yet ignored | PLT-1 (`.gitignore`), SQL-3 (key and seal scripts) |
| 2 | "About our questions" copy | Questions "accepted only after two independent checks against stored sources" (PRD §3.14) | Under memo §10, standard claims can pass on two checkers' knowledge, so "against stored sources" overstates. Suggested: "Questions are drafted with AI assistance. Each one is accepted only after two independent checks, and any fact that is uncertain or easy to get wrong is checked against published data or sources." | Product manager |
| 3 | What a void re-checks | Voids follow a re-check of "the stored source passages" (PRD §3.13.3) | A fresh checker re-verifies the reported claims with external evidence; WebSearch is always allowed for reports (§9.10) | Product manager, to align the PRD wording |
| 4 | The reveal's sources line | `sourceLabels` on mysteries and encores (PRD §3.1.4, ARCHITECTURE §3.2) | Filled by the editor from evidence records (dataset publishers, Tier A and B site names), empty when a key rests on knowledge alone, never invented (§2.3) | Editor |
| 5 | Entity ids | Every list entry carries a Wikidata id (PRD §3.18.4); QIDs as ids, `x.<type>.<slug>` otherwise (ARCHITECTURE §2.4) | QIDs only from datasets that carry them or the enrichment job, never from memory. An id never changes once referenced, so a QID found later goes in `wikidataId` (+). `popularity` stays 0 until enrichment, and ties fall to alphabetical order (§2.10, §2.12, §9.5.1) | Platform: the enrichment job; CNT-1: `wikidataId` |
| 6 | Qualifiers on clue-4 options | Displays such as "Marie Curie (physicist)" and "Queen (band)" (PRD §3.18.4) | A key that is the only option with a bracket is a giveaway. Descriptors only on collisions, and when any of the four options shows one, the engine shows them on all four (§2.10, rule 6) | Engineering (option renderer); content stores descriptors |
| 7 | Mysteries in every category | Twelve categories and twelve lists (PRD §3.18) | Category is the clue angle and answer type the list, so Language & Words and Society & Culture use existing lists (§1.13). `artwork` and `language` lists proposed for 1.1 | Content lead, for 1.1 |
| 8 | Credits | Wikidata (CC0) for answer lists (PRD §3.14) | Also CLDR (Unicode licence), plus GeoNames (CC BY 4.0), MoMA and Tate (CC0, credit requested) wherever their data ships | Whoever writes `/credits` |
| 9 | Repeats | No Daily item repeats within a year (PRD §3.18.2) | Adds: no answer entity repeats within 60 days, and no recent answer as a distractor (§10.5) | Scheduler |
| 10 | Mystery difficulty | Expected-points bands (PRD §4.1.6) | Buffered assembly windows, the expected-points identity, and an easy lean for the first seven Dailies (§8.3, §10.2) | Scheduler |
| 11 | Encore details | Bands and decimals (memo §2, PRD §4.2) | Answers of 20 or more, true-zero scales only, at most a quarter years, conflicting sources fail (§6) | Writers |
| 12 | Numbers the inputs left open | 80/10/10 format mix; 8 packs of 15 (PRD §3.18.2) | 100/12/13 per category; pack themes and a pack template (§1, §10.9) | Editor |
| 13 | Formats | The brief says "mcq" and "truefalse"; ARCHITECTURE §3.2 and §5 set `mc` and `tf`, camelCase fields and one item per file | This guide follows ARCHITECTURE throughout and marks its additions with + | Everyone |
| 14 | Schema additions (+) | The validator refuses unknown keys (ARCHITECTURE §5.2) | Items: `counterintuitive`, `claims`, `writerNotes`, `lintAllow`, the `verification` object of §9.8, and statuses `draft`, `checking`, `cut` and `retired` besides `active`. True/false: `tfKind`. Comparison: `relation`, `measure`, `unit`, `values`, `valueDisplay`. Mystery: `likelyGuesses`, `rivals`, `giveawayTerms`, `seedSolveShares`. Encore: `seededDifficulty`, `predicted` (`pClose`, `pExact`) and `derivation`, because the memo gives every item a difficulty (memo §11). List entities: `qualifier`, `source`, `status`, `addedIn`, `wikidataId`, `replacedBy`. Schedule dailies: `status`, `predictedPoints`, `dayCheck` | CNT-1 |
| 15 | Checks beyond ARCHITECTURE §5.2 | §5.2 covers shape, length, options, numeric dates and pool rules | Lint C06, C07, C09 (more time words), C10, C11, C12 (giveaway terms and prefixes), C13, C14 (coverage and freeze), C17 (separation guard) and C19 to C25. C03 is an error here, a warning in §5.2 | CNT-1 |
| 16 | `predicted.solveByClue` | Four numbers (ARCHITECTURE §3.2) | Read as cumulative shares, so expected points are their sum (§8.3) | ARCHITECTURE owner, to confirm |

## Appendix B. Sources

**Research cited in this guide** (most were gathered by the research tracks; see their method notes):
- [Kang et al., curiosity and memory](https://pubmed.ncbi.nlm.nih.gov/19619181/)
- [Learning Scientists on confident errors](https://learningscientists.org/blog/2023/8/3-1)
- [Rodriguez, three options](https://doi.org/10.1111/j.1745-3992.2005.00006.x)
- [Van der Kleij et al., feedback meta-analysis](https://doi.org/10.3102/0034654314564881)
- [Brysbaert, reading rate](https://doi.org/10.1016/j.jml.2019.104047)
- [AI-written exam items, error rates](https://pmc.ncbi.nlm.nih.gov/articles/PMC11806894/) and [rejection rates](https://pmc.ncbi.nlm.nih.gov/articles/PMC11854382/)
- [Tauber et al. recall norms](https://doi.org/10.3758/s13428-012-0307-9) and [Nelson and Narens](https://doi.org/10.1016/S0022-5371%2880%2990266-2)
- Our own reports: [07 content excellence](./research/07-content-excellence.md), [gap 1](./research/gap-1-daily-format-and-competitors.md), [gap 3](./research/gap-3-difficulty-before-players.md), [SYNTHESIS](./research/SYNTHESIS.md)

**Datasets fetched and inspected on 31 October 2026:**
- [mledoze/countries at 6031f5d](https://raw.githubusercontent.com/mledoze/countries/6031f5df137c41c76d180c55a0782185ae3ed05b/countries.json) and its [licence](https://raw.githubusercontent.com/mledoze/countries/master/LICENSE)
- [CLDR English territory names](https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-localenames-full/main/en/territories.json)
- [Periodic-Table-JSON at a78c7a4](https://raw.githubusercontent.com/Bowserinator/Periodic-Table-JSON/a78c7a48fe7235cebd6153161a9e7fa70f0cfb30/PeriodicTableJSON.json) and its [licence](https://raw.githubusercontent.com/Bowserinator/Periodic-Table-JSON/master/LICENSE.md)
- npm `cities.json` 1.1.65 (GeoNames), fetched with `npm pack`
- [openfootball World Cup 2018](https://raw.githubusercontent.com/openfootball/worldcup.json/master/2018/worldcup.json) and its [README](https://raw.githubusercontent.com/openfootball/worldcup.json/master/README.md)
- [MoMA Artists.json](https://media.githubusercontent.com/media/MuseumofModernArt/collection/main/Artists.json) and its [README](https://raw.githubusercontent.com/MuseumofModernArt/collection/main/README.md)
- [Tate artist data](https://raw.githubusercontent.com/tategallery/collection/master/artist_data.csv) and its [README](https://raw.githubusercontent.com/tategallery/collection/master/README.md)
- [The Met open access README](https://raw.githubusercontent.com/metmuseum/openaccess/master/README.md), [Natural Earth README](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/README.md), [Corpora README](https://raw.githubusercontent.com/dariusk/corpora/master/README.md)

**Web searches run while writing this guide** (results the guide relies on):
- Louvre pyramid pane counts: [Wikipedia, Louvre Pyramid](https://en.wikipedia.org/wiki/Louvre_Pyramid), [Structurae](https://structurae.net/structures/louvre-pyramid)
- Sharks and trees: [Discover Wildlife](https://www.discoverwildlife.com/prehistoric-life/are-sharks-older-than-trees), [EarthDate](https://earthdate.org/node/1142)
- The axolotl banknote: [Keesing Technologies](https://platform.keesingtechnologies.com/mexico-launches-new-50-pesos-banknote/), [Infobae](https://www.infobae.com/en/2022/04/06/the-award-winning-ticket-of-the-axolotl-is-quoted-between-300-thousand-and-up-to-half-a-million-pesos-online)
- Australian Constitution, section 125: [Parliament of Australia](https://aph.gov.au/About_Parliament/Senate/Practice_and_Procedure/Constitution/chapter7), [Parliamentary Education Office](https://peo.gov.au/understand-our-parliament/how-parliament-works/the-australian-constitution/the-australian-constitution-online/chapter-vii), [Wikipedia, Section 125](https://en.wikipedia.org/wiki/Section_125_of_the_Constitution_of_Australia)
