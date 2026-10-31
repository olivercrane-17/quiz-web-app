# Content Guide: how we write and check every question

| | |
|---|---|
| Status | v1.1, binding for all content work. Revised after review; the Review log at the end records each call |
| Owner | Head of content (editor-in-chief) |
| Date | 31 October 2026 |
| Who reads it | Writer, estimator, fact-checker, editor, list-builder, scheduler, auditor and planter agents, plus the owner |
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
7. Two independent checkers, blind to each other and to the writer's notes, and a third check (pass D) on every Daily item before it freezes. Any doubt means cut or rewrite.
8. Never invent a source or a URL. Evidence is a dataset record we downloaded, a search result we were given, a calculation anyone can re-run, or a checker's knowledge, labelled as such.
9. Sealed content never lands in git in plain text, and nothing public points at it. The repository is public.
10. Change the meaning, change the ID. IDs are never reused.

### 0.2 Roles

One agent run holds one role on any given item. Where the orchestrator can choose models, checker B and the Daily auditor (pass D) run on a different model family or size from the writer, because shared models make shared mistakes ([SYNTHESIS §7.6](./research/SYNTHESIS.md)). Every check record names its model (§9.8), so an audit can confirm the rule held.

| Role | Does | Never does |
|---|---|---|
| Writer | Drafts a batch, lists every claim, runs the lint, self-checks (§9.3), files list requests for missing entities (§2.12) | Checks their own items, sees checker records before both are complete, or mints an entity id |
| Estimator | Predicts difficulty from a blind packet (§8.5) | Edits text, or uses its own solve rate as difficulty |
| Fact-checker A ("confirm") | Verifies every claim as a subject expert and gathers external evidence for the high-risk ones (§9.4) | Sees the writer's notes, checker B's record or the estimate; asks for a packet stage before recording the one before; edits the item |
| Fact-checker B ("refute") | Verifies every claim while trying to break the item (§9.4) | The same as checker A |
| Editor | Style, balance, dedupe calls, merging the checkers' claim lists, resolving disagreements, accepting or cutting, setting `reviewBy`; owns the batch register, the myths list and the reference files | Accepts an item a checker failed without new evidence; edits an item they wrote or checked |
| List builder | Builds and checks the answer lists, mints every entity id, fills list requests (§2.10, §2.12), and works the queue of "My guess should have counted" reports (§9.10) | Types a Wikidata id from memory, or names a mystery, a mystery batch or a list request in an entry's `source` |
| Scheduler | Assembles Dailies and room packs, runs the feasibility solver and the day check (§10) | Schedules an item that isn't `active`, or freezes a Daily before every item on it has passed D |
| Auditor | Runs the seeded audits and pass D (§9.9, §9.10) | Audits or D-checks an item they wrote, checked, followed up or tiebroke |
| Planter | Writes the planted items for a seeded audit (§9.10) | Writes or checks real items in the batches that audit samples, or puts a planted item anywhere under `content/` |

### 0.3 The pipeline

| Step | Who | Output | Gate to the next step |
|---|---|---|---|
| 1. Draft | Writer | Item files, every item `draft` | Lint clean; claims listed; every entity id copied from a published list, or a list request filed for it (§2.12) |
| 2. Self-check | Writer | `selfCheck` and `writerNotes` on every item | All eleven `selfCheck` codes are `true` (§9.3); the packet builder refuses anything less |
| 3. Packets | Tooling | Staged blind packets for each checker, a single-stage packet for each estimator, every stage hashed (§9.4) | Packets exist |
| 4. Estimate | Estimator | `predicted` on every item | None; runs beside step 5 |
| 5. Check | Checkers A and B, in parallel | Two check records per item | Both records complete |
| 6. Merge and resolve | Editor | The merged claim list, any follow-ups, and a decision per item (§9.7, §9.8) | Every item accepted, rewritten or cut |
| 7. Accept | Editor, then the validator | `status: active` | The acceptance rule in §9.9 passes |
| 8. Pack or schedule | Tooling and the scheduler | Practice packs, or entries in the sealed pool | §10 |
| 9. Pass D | Auditor | A D record on every item of a scheduled Daily or spare set | §9.9, rule 7, before the Daily freezes (§10.7) |

For a sealed batch, every step ends with `npm run content:seal` and a checkpoint commit of the envelopes, so losing the sandbox costs at most one step's work (§11.2).

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
- **Fairness:** species from every continent, well beyond the familiar northern ones. Common English names, with both where regions differ: the animal Europeans call an elk is the North American moose. No conservation status or population counts, because they change. Records ("fastest") only with a defined measure and solid evidence.

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

[ARCHITECTURE.md](./ARCHITECTURE.md) §5 owns file formats, validation and build outputs, and its §3.2 holds the TypeScript content types. This section restates those formats for writers and adds the fields the checking protocol needs. Additions are marked **+**. The validator refuses unknown keys, so every addition goes into the content schemas (`src/content/schema/`, ticket CNT-1) before the first batch is submitted; ARCHITECTURE §5.1.1 adopts them all, field for field.

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
| Mystery, encore, room pack, schedule, spare set, challenge pack, list request, audit record | `content/.sealed-plain/<folder>/<id>.json`, with folders `mysteries`, `encores`, `room-packs`, `schedule`, `spares`, `challenge-packs` (none before 30 Dailies close, PRD §3.6.1), `list-requests` (§2.12) and `audits` (§9.10) | Only as encrypted envelopes, `content/sealed/<folder>/<id>.json.enc` (§11.2) |
| Checker packets, planted audit items, downloaded datasets | `.cache/packets/`, `.cache/audits/<audit-id>/`, `.cache/datasets/<key>/` | Never: `.cache/` is git-ignored |

### 2.3 Fields every item carries

| Field | Type | Required | Rule |
|---|---|---|---|
| `id` | string | yes | The pattern for its pool (§2.12) |
| `status` | `draft`, `checking`, `active`, `cut` or `retired` | yes | Writers submit `draft`. `active` means accepted under §9.9 |
| `category` | category code | yes | One of the twelve codes in §1 (`geo`, `hist` and so on) |
| `tags` | string[] | yes | 1 to 6 lowercase kebab-case tags |
| `region` | `global` or `region:<code>` | yes | `global` for everything at launch |
| `volatility` | `evergreen`, `slow` or `dated` | yes | §3.4. `fast` is never accepted |
| `reviewBy` | ISO date or null | yes | Null in a draft. For a `slow` item the editor sets it at acceptance, at most 24 months after `verification.editor.decidedAt`, and the validator checks that bound; a writer may suggest a date in `writerNotes`. Null for `evergreen` and `dated` |
| `seededDifficulty` | integer 1 to 5 | yes | The writer's guess on the §8 scale. Encores carry it too, as ARCHITECTURE §3.2 now does |
| `predicted` | object | from `checking` on | The estimator's output (§8.5). Writers leave it out. Room questions carry it too (§2.9) |
| `explanation` | string | yes | 35 words or fewer (§7) |
| `learnMore` | string | yes | The search term for the "Learn more" Wikipedia search link, usually the answer's name. Never a URL (PRD §3.18.3) |
| `counterintuitive` + | boolean | yes | True when the obvious answer is wrong (§3.1) |
| `claims` + | Claim[] | yes | Every checkable statement in the item (§9.2) |
| `selfCheck` + | object | to leave `draft` | The eleven codes of §9.3, each `true`: `{ "lint": true, "claims": true, "datasets": true, "rivalTest": true, "volatility": true, "regional": true, "style": true, "myths": true, "mystery": true, "encore": true, "doubts": true }`. `mystery` and `encore` are `true` on other kinds too: the writer confirms there is nothing of that kind to check. The packet builder refuses an item with a code missing or `false` |
| `writerNotes` + | string | no | What the writer checked and what they doubt, in prose. Stripped from checker packets, so it never stands in for `selfCheck` |
| `lintAllow` + | object[] | no | Editor-approved exceptions: `{ "rule": "C19", "text": "...", "reason": "..." }` |
| `verification` | object | from `checking` on | The record in §9.8, whose shape is an addition (+) |

Mysteries and encores also carry `sourceLabels` (ARCHITECTURE §3.2), the reveal's sources line. Writers leave it empty. The editor fills it at acceptance from the evidence: dataset publishers and the names of Tier A or B sites. It stays empty when the key rests on knowledge alone, and nothing in it is ever invented.

### 2.4 Multiple choice (`format: "mc"`)

| Field | Type | Required | Rule |
|---|---|---|---|
| `stem` | string | yes | A question ending in "?", 120 characters or fewer (100 in rooms). Positive wording (§3.6) |
| `answer` | string | yes | The one correct option. 60 characters or fewer; aim for under 24 (23 or fewer), because the desktop 2 by 2 grid appears only when every option is under 24 characters (PRD §3.0.3) |
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
| `exactDates` + | `{ "a": "1962-10-05", "b": "1963-11-23" }` | when two year values are under 10 apart | The ISO dates of both events. Their years must equal `values`, and each side's label claim states its day in words. Omit it otherwise |

The engine always shuffles which side shows first (ARCHITECTURE §3.2: comparisons ship with `order` set to shuffle), so a writer never balances `a` and `b` answers across a batch, and a side's letter never hints at the key.

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

**Separation guard (lint C17).** Dates at least 10 years apart, or at least 365 days apart when both are exact, undisputed days recorded in `exactDates`. Never the same year: that is a coin flip with no foothold. Quantities: the larger at least 1.1 times the smaller, except exact counts and defined values (atomic numbers, letters in an alphabet), where any difference works. Latitudes at least 0.5° apart, comparing city centres or named points, never whole countries.

### 2.7 Mystery (`kind: "mystery"`)

| Field | Type | Required | Rule |
|---|---|---|---|
| `answerType` | enum | yes | One of the twelve types in §2.10 |
| `answer` | entity id | yes | An active entry in that type's list, by the id its list builder minted (§2.12). A draft may hold a list request's id (`lr.`) until the request is filled |
| `accepted` | entity id[] | yes, may be empty | Up to 2 genuine equivalents from the same list (PRD §4.1.1), each approved by the editor |
| `clues` | string[4] | yes | Hardest first, each 140 characters or fewer (PRD §3.18.3). Rules in §5 |
| `distractors` | entity id[3] | yes | Same list, distinct, none in `accepted`. With the answer they make the four clue-4 options, which the server shuffles per attempt |
| `slot` | 1, 2 or 3 | yes | The difficulty: 1 is Mystery 1 (easy), 2 is Mystery 2 (medium), 3 is Mystery 3 (hard) |
| `sourceLabels` | string[] | yes | §2.3 |
| `likelyGuesses` + | entity id[] | yes | 6 to 12 entries players will plausibly type, mostly wrong ones, including every entity of the answer's list that a clue names (§5.2, rule 15). All must exist in the list (§5.3) |
| `rivals` + | object[] | yes | At least 3, each `{ "id": "...", "ruledOutBy": [1, 3] }` and ruled out by at least one of clues 1 to 3. This is the uniqueness proof (§5.4), and the clues it names are the ones that pin the answer (§9.5.5) |
| `giveawayTerms` + | string[] | yes, may be empty | Words beyond the name and aliases that would give the answer away ("kimjang" for kimchi). Banned from clues by lint C12 |
| `seedSolveShares` + | number[4] or null | no | The writer's forecast of the cumulative share of typical adults solved by each clue (§8.3) |

The four options on clue 4 (or on clue `optionsFromClue`, if PRD Q3 moves them) are `answer` plus `distractors`. Aliases live on the answer-list entry, never on the mystery, so every mystery with the same answer shares them and the lint reads them from the list. The estimator's `predicted` for a mystery is `{ "solveByClue": [s1, s2, s3, s4], "spread": ..., "estimator": "v0" }`, with cumulative shares (ARCHITECTURE §3.2 confirms "cumulative") and the spread defined in §8.5.

### 2.8 Encore (`kind: "encore"`)

| Field | Type | Required | Rule |
|---|---|---|---|
| `question` | string | yes | 120 characters or fewer. A "How many..." count, a question that names its unit, or "In what year..." |
| `valueKind` | `quantity` or `year` | yes | |
| `answer` | number | yes | The exact accepted value, already rounded to `decimals`. Positive. Years are whole numbers from 1 to 9999 (PRD §4.2.1) |
| `decimals` | 0, 1 or 2 | yes | How many decimals players may type. 0 for years |
| `unit` | string | yes | The unit word ("days", "teeth", "years"). An empty string for years |
| `unitShort` | string | yes | What follows numbers in the preview and the reveal ("km", or the same as `unit`). An empty string for years (ARCHITECTURE §3.2) |
| `unitLabel` | string | yes | What sits beside the field ("days", "times Earth's volume"). An empty string for years |
| `bands` | `{ "bullseye": n, "close": n }` or null | yes | Null means the defaults: bullseye within 5% and close within 15% for quantities, within 2 and 5 years for years (memo §2). Overrides use the same units (a fraction, or years); the reason goes in `writerNotes` |
| `sourceLabels` | string[] | yes | §2.3 |
| `derivation` + | object or null | yes | For a number built from other facts: `formula`, `inputs` (each with `claimId`, `value`, `unit` and `what`), `unrounded` and `rounding`. Null for direct facts |

The estimator's `predicted` for an encore is `{ "pClose": ..., "pExact": ..., "spread": ..., "estimator": "v0" }` (§8.4), with the spread defined in §8.5.

### 2.9 Room packs

A pack is one sealed file, `room-packs/<pack-id>.json`: `{ "id": "around-the-world", "title": "...", "theme": "...", "questions": [ ... ] }` (ARCHITECTURE §5.1). `questions` holds exactly 15 items in play order, so the last is the double-points finale. Each question is a sealed choice item: `kind: "choice"`, `format: "mc"`, the §2.4 fields and every §2.3 field, `predicted` included, with an id `r.<pack-id>.<NN>`. The pack template bands questions by `predicted.p` (§10.9), and the release leaves `predicted` out of SQL (ARCHITECTURE §5.1.1).

Room rules on top of §2.4: exactly 3 wrong options (the host screen shows four answers with letters and shapes), stems of 100 characters or fewer, options of 30 or fewer (aim for under 24), and explanations of 25 words or fewer where possible, because the host screen reads them across a room.

### 2.10 Closed answer lists

A mystery's guesses can only be entries from its type's list (PRD §3.18.4). Lists are public: they ship to every client.

**File fields** (ARCHITECTURE §5.1): `type` (the answer type), `version` (an ISO date, new for every published change), `liveAt` + (the UTC date of the commit that first published this version, rule 5), `provenance` (each source with `source`, `license` and `retrievedAt`) and `entities`. The build adds the normalized `keys` (ARCHITECTURE §5.5); writers never do.

**Entity fields.**

| Field | Type | Required | Rule |
|---|---|---|---|
| `id` | entity id | yes | A Wikidata QID, or `x.<type>.<slug>` (§2.12), minted by the list builder and nobody else. Never changes once anything references it |
| `name` | string | yes | The canonical name players type |
| `display` | string | yes | What suggestions and clue-4 options show: `name` plus the type's qualifier when the rule calls for one |
| `aliases` | string[] | yes | Other names a player might type: other spellings (Aluminum), former names (Constantinople), short forms (UK), native names and transliterations (Gisaengchung). Diacritic-free copies are unnecessary, because matching strips diacritics (PRD §4.1.3) |
| `popularity` | integer | yes | Wikidata sitelink count, which breaks ties in suggestion ranking (PRD §4.1.3). 0 until the enrichment job fills it, so ties fall to alphabetical order meanwhile |
| `qualifier` + | object | yes | The type's facts behind `display` (table below). Every person, TV series and music artist also carries a short `descriptor` |
| `source` + | string | yes | Where the entry came from: a dataset key with its locator, or a list batch id. Never a mystery id, a mystery batch or a list request, because the file is public (§11.2) |
| `status` + | `active` or `retired` | yes | Retired entries stay in the file, so old guesses still resolve |
| `addedIn` + | ISO date | yes | The `liveAt` of the version that added the entry (freeze rule below) |
| `wikidataId` + | string or null | no | A QID found later for an `x.` entity. The `id` itself never changes |
| `replacedBy` + | entity id or null | no | For merged duplicates |

**Types.** The type names and files follow ARCHITECTURE §3.2; minimums and targets come from PRD §3.18.4.

| `type` | File | Player line | Minimum | Target | `display` rule | `qualifier` |
|---|---|---|---|---|---|---|
| `country` | `country.json` | a country | 190 | about 250 | The CLDR 49 English short name, with the overrides below. CLDR forms and variants become aliases | `iso_a2` |
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
| `sport` | `sport.json` | a sport or game | 100 | 200 | Common English name; association football is "Association football", with Football, Soccer and "Football (soccer)" as aliases | none |

**Display overrides.** Outside the types whose qualifier always shows (films, books, cities, landmarks), no display form carries a bracket, a spaced hyphen or a qualifier such as "SAR China", because a lone bracket among the clue-4 options points at the key (rule 6). CLDR 49's short names break that in seven places (checked in `cldr-localenames-full` 49.0.0), so the country list gives six of them a new display and keeps every CLDR form as an alias:

| `iso_a2` | CLDR short name | Display | Aliases besides the CLDR forms |
|---|---|---|---|
| MM | Myanmar (Burma) | Myanmar | Burma |
| CD | Congo - Kinshasa (variant: Congo (DRC)) | Democratic Republic of the Congo | DR Congo, DRC |
| CG | Congo - Brazzaville (variant: Congo (Republic)) | Republic of the Congo | Congo-Brazzaville |
| HK | Hong Kong SAR China | Hong Kong | |
| MO | Macao SAR China | Macao | Macau |
| PS | Palestinian Territories | Palestine | |

Rule 7 keeps Palestine out of answers and options. The seventh, "Cocos (Keeling) Islands", keeps its official name, because rule 7 keeps territories out of answers and options too. Lint C28 checks that the four display forms of every mystery's options agree on brackets and qualifiers.

**List rules.**
1. One entity, one list. People famous mainly for music go in `music_artist`; everyone else goes in `person`.
2. Lists are global and stable. They are never filtered per Daily, so the list itself gives nothing away (PRD §3.18.4).
3. Size: at least 100 entries to serve any Mystery slot (PRD §3.18.4). Every list reaches the table's minimum before launch.
4. Coverage beats size. Every scheduled mystery's answer, distractors, rivals and likely guesses must be active entries. A player who types a sensible wrong guess and sees "No matches" thinks the game is broken. A writer who needs a missing entity files a list request (§2.12), and the mystery stays `draft` until a published version holds it.
5. Freeze. The repository is public, so a list version goes live with the commit that first publishes it: that commit's UTC date on the public branch is the version's `liveAt`, and every entry the version adds carries `addedIn` equal to it. The list builder writes both on the day of the commit, and in CI, where git history is available, the validator fails a list whose `liveAt` differs from that commit's date. An entry can be a scheduled answer only when the Daily's date is at least 30 days after its `addedIn` (lint C14). So that no diff narrows a batch's answers: a version that adds entries adds at least 100, or every entry still missing from the list's target if fewer remain; additions land in their own commit, never in one that adds or changes sealed envelopes; and the entries a mystery batch needs join the next regular version mixed with entries no mystery needs, never as a small set of their own. A version that only fixes aliases, displays or retirements may be any size.
6. Qualifiers. Films, books, cities and landmarks always show theirs. People, TV series and music artists show a descriptor only on a collision. If any clue-4 option shows a descriptor, the server labels all four (ARCHITECTURE §5.5), writers pick distractors whose display forms match the answer's form, and lint C28 checks the four agree. An answer that is the only option with a bracket is a giveaway.
7. Places whose sovereignty is disputed are guessable entries, but never answers or distractors, and never the subject of a question about status. Under the line "a country", territories that aren't sovereign states (Hong Kong, Macao, Greenland, Puerto Rico) are guessable entries too, never answers or distractors.
8. ISO codes are not aliases, except the forms people really type (UK, US, USA, UAE).
9. Avoid aliases that normalize to another entry's name unless the two are true namesakes.
10. Each list ships as hashed static JSON of 80 KB gzipped or less (PRD §8.1), measured on every build (ARCHITECTURE §5.5). A synthetic 3,000-entry person list comes to about 64 KB, but if the real `person` list passes 80 KB before reaching its target, the content lead lowers that target in the table above rather than split the list. Each list's `provenance` feeds `/credits` (§9.5.1).

### 2.11 Schedule records

Schedules follow ARCHITECTURE §5.1: one sealed file per month, `schedule/<yyyy-mm>.json`, holding `{ "track": "main", "dailies": [ { "date": "2026-12-01", "rounds": [ { "type": "mystery", "difficulty": "easy", "contentId": "m.geo.0103" }, ... ] } ] }`. Daily numbers are never authored; they come from `DAILY_EPOCH`. Each daily also carries `status` + (`assembled`, `frozen` or `published`, §10.7), `predictedPoints` + (the sum of its mysteries' predicted expected points, §8.3), `dayCheck` + (the §10.6 record: `checker`, `checkedAt`, `issues` and `verdict`) and `spareOrder` + (the spare set ids ranked for that date, §10.7). The authored `status` is advisory, a note of what the scheduler last did: the database alone decides what is frozen, and a release refuses to change a frozen Daily (ARCHITECTURE §8.7). The 20 spare sets live in `spares/<id>.json`, one file each (ids `spare.<NN>`, §2.12), holding the set's `id`, its `track` and the same round records, with no date. A Daily can move to `frozen` only when every item on it carries a passing pass D record for its date (§9.9, rule 7).

### 2.12 IDs

IDs are stable: never renumbered and never reused. The patterns are ARCHITECTURE's (§2.4). This guide adds one rule so parallel writers can't collide: in practice, mystery and encore IDs, the first two of the four digits are the batch number from the register (§11.3), and the last two are the sequence inside the batch.

| Pool | Batch id in the register | Item ID | Example |
|---|---|---|---|
| Practice | `p.<cat>.b<BB>` | `p.<cat>.<BB><SS>` | `p.geo.0317`: batch 03, item 17 |
| Mystery | `m.<cat>.b<BB>` | `m.<cat>.<BB><SS>` | `m.hist.0207` |
| Encore | `e.b<BB>` | `e.<BB><SS>` | `e.0104` |
| Room question | `r.<pack-id>.b01` | `r.<pack-id>.<NN>`, NN from 01 to 89 | `r.around-the-world.12` |
| Spare set | None: the scheduler numbers them | `spare.<NN>` (ARCHITECTURE §2.4) | `spare.07` |
| List request | The mystery batch that needs it | `lr.<batch>.<NN>`, sealed (§2.12 below) | `lr.m.hist.b02.03` |
| Answer entity | `l.<type>.b<BB>` | A Wikidata QID, or `x.<type>.<slug>` | `x.city.cordoba-ar` |
| Fixture | | Prefixed `fx.` (ARCHITECTURE §5.6) | |

- `<cat>` is the category code from §1 and `<pack-id>` the pack id from §10.9.
- Agent ids: `w-` writer, `es-` estimator, `fc-` checker, `ed-` editor, `lb-` list builder, `sc-` scheduler, `au-` auditor, `pl-` planter, each followed by the run id.
- Batch `00` (`p.geo.0001` to `p.geo.0099` and so on) and room sequences 90 to 99 are reserved for the examples in this guide. The validator rejects them anywhere under `content/`.
- **Entity ids belong to list builders.** Only a list builder mints one, so a writer and a list builder working in parallel can never give one entity two ids. Writers copy active ids from the published list file. For anything missing they file a list request, `lr.<batch>.<NN>`, with the name, the qualifier and the evidence (a dataset record or a search result), in the sealed `list-requests` folder, because a request names a mystery's answer or guesses. The draft may hold the request's id until the list builder fills it; the entity then joins the next regular list version (§2.10, rule 5), and C14 refuses any `lr.` id from `checking` on.
- **When the dataset record behind an entry carries a QID** (MoMA's `Wiki QID`), that QID is the id: mandatory, not a choice. An entry may also take a QID the enrichment job matched before the entry was first referenced (§9.5.1). Otherwise the id is `x.<type>.<slug>`. Never type a QID from memory. Once any item references an entity, its id never changes; a QID found later goes in `wikidataId`.
- Slugs: lowercase ASCII, diacritics transliterated, words joined by hyphens, plus the type's disambiguator: a city's ISO country code (`x.city.cordoba-es`), a film's year (`x.film.heat-1995`), a book's author surname (`x.book.frankenstein-shelley`), a TV series' country (`x.tv_series.the-office-us`) and a descriptor for people who share a name (`x.person.michael-collins-astronaut`).
- **Change the meaning, change the ID.** Before acceptance, edit freely. After acceptance, a wording fix that changes no claim keeps the ID; the change goes in `verification.corrections` (§9.8), and §9.7 says which checks it needs. A changed key or a different question gets a new ID in a new batch, and the old one is `retired`. The one exception: a sealed item that has already been played keeps its ID and logs the correction in `verification.corrections`, so attempts and rescoring still point at it (PRD §3.13.4).

### 2.13 Machine checks (the content lint)

`npm run content:check` (ARCHITECTURE §5.2) runs these on every save. "Error" blocks; "warn" needs the editor to clear it or record a `lintAllow`. L1 to L8 are the creator-lint rules in PRD §3.9.4, which are warnings for players' quizzes and errors for ours. Their triggers carry over and their messages don't: our findings print only the id, rule code and path (Messages, below), while a message such as L7's "Tie it to a fixed year, like 'in 2010'." is copy for quiz creators, and C09 checks more time words than L7 does. ARCHITECTURE §5.2 adopts this whole table, and CNT-2 builds it (C01 is CNT-1's schemas).

**Player-facing text** means the fields a player can see: `stem`, the options (`answer` and `wrong`), `a`, `b`, `clues`, `question`, `unit`, `unitShort`, `unitLabel`, `valueDisplay`, `explanation`, `learnMore`, and a room pack's `title` and `theme`. The text rules below run on those fields only. Of them, C08 and C11 also run on claims and `writerNotes`; C25 to C27 read claims by design. A claim may name "football" to explain a distractor, as r.game-on.90's does, and no player ever reads it, so it never warns.

**`optionsFromClue`.** C12 and C13 read `optionsFromClue` from `src/config/shared.json` (4 at launch; PRD Q3 may move it to 3). Clues before it are typed against, so they get C12's typing rules; clues from it on sit beside the four options, so they get C13's display rule. Whenever the value changes, every sealed item is re-linted, and an item that now fails is rewritten (a new ID if the meaning changes) or swapped out of its Daily before its date.

| ID | Applies to | Check | Severity |
|---|---|---|---|
| C01 | all | Schema valid for its file type | error |
| C02 | all | Explanation of 35 words or fewer (whitespace-separated tokens) | error |
| C03 | mc, tf, comparison | Stem of 120 characters or fewer; 100 in rooms | error |
| C04 | mc | Option over 60 characters (30 in rooms) is an error; 24 or more is a warning, because it rules out the desktop 2 by 2 grid (PRD §3.0.3) | error, warn |
| C05 | mc | "All of the above", "none of the above", "both of these" or "neither" as an option (L1) | error |
| C06 | stems, tf statements | "not", "never", "except" or "isn't" as words (L2); warning in clues | error |
| C07 | mc | Answer longest by more than 50% and more than 15 characters (L3) | error |
| C08 | player-facing text, claims, `writerNotes` | Numeric dates such as 03/04/2025 or 2025-04-03 (L6) | error |
| C09 | player-facing text | Time words: current, currently, latest, now, today, this year, recent, recently, newest, reigning, so far, to date, as of (L7 and more) | error |
| C10 | player-facing text | A US spelling from `content/reference/spelling.json` outside the proper-noun allowlist | warn |
| C11 | player-facing text, claims, `writerNotes` | En dash, em dash, double space, URL, HTML or Markdown | error |
| C12 | mystery | Any clue over 140 characters. In clues before `optionsFromClue`: the answer's name, an alias, a significant word of either (4 or more letters, not a stopword), a word that begins with one, or a giveaway term; and the **suggestion probe**, which runs the engine's own `suggest()` (ARCHITECTURE §4.7: word prefixes, and one-edit typos from 5 characters) against the real list on every clue word and each of its prefixes of 3 or more letters, and fails when the answer or an accepted id comes back in the top 6 (`SUGGESTION_COUNT`) | error |
| C13 | mystery | A clue from `optionsFromClue` on contains a significant word of the answer's display form, qualifier included | error |
| C14 | mystery | Answer, accepted ids, distractors, rivals and likely guesses exist in a published version and are active; no `lr.` request ids from `checking` on; distractors distinct and of the same type; for a scheduled mystery, the Daily's date at least 30 days after the answer's `addedIn` | error |
| C15 | encore | Positive answer; a year is a whole number from 1 to 9999; `decimals` from 0 to 2 and matching `answer`; a quantity of 21 or more unless `bands` is overridden; `unitShort` and `unitLabel` present (empty for years); no temperature or ambiguous units. A unit on the measured list in `content/reference/units.json` (length, area, mass, speed) marks the encore as measured: at most 1 per encore batch, 12 in the bank (§6, rule 3) | error |
| C16 | tf | `tfKind` matches `answer`; the statement has no "?" | error |
| C17 | comparison | The answer wins under the relation; the separation guard (§2.6); when the two years are under 10 apart, `exactDates` is present, its years equal `values`, and each side's label claim states its day | error |
| C18 | mc | `ascending` options all start with a number; no duplicate options (case and spacing ignored) | error |
| C19 | player-facing text | A superlative or "first" word with no high-risk claim behind it: first, only, record, most, least, best, worst, and the "-est" words in `content/reference/superlatives.json` (largest, biggest, smallest, oldest, youngest, tallest, highest, lowest, longest, shortest, fastest, slowest, hottest, coldest, deepest, heaviest, lightest and their kin). Exempt: the standard stems of §2.6 ("Which came first?", "Which was invented first?", "Which was completed first?"), "only" followed by a number (after "about" or "around", if present) or by "a few", and "most of" | warn |
| C20 | player-facing text | The bare word "football", not part of "association football", "football (soccer)" or a named code such as "American football" (§3.3) | warn |
| C21 | player-facing text | An ambiguous unit after a number ("3 cups", "2 tons": ton, gallon, ounce, pint, cup, calorie and their plurals), or as an encore's `unit`; °C or °F in an encore | error in encores, warn elsewhere |
| C22 | all | A near-duplicate of an item in the bank or of an example in this guide: a warning the editor decides on, except that in a sealed pool a hit against a §12 example is an error. It also reads `content/reference/example-denylist.json`: a sealed mystery whose answer is one of the ten §12.7 answers is an error, and a sealed encore whose answer and unit equal one of the §12.9 values is a warning the editor clears only if it measures something else | warn, error |
| C23 | player-facing text | A term on the shared slur list (PRD §3.9.4) | error |
| C24 | ids | ID pattern, batch registered to this writer, no reserved example IDs under `content/` | error |
| C25 | claims | A hit on `content/reference/myths.json` | warn; the checker decides |
| C26 | claims | **The risk floor.** A claim must be `high` when its text holds a digit or a number word (zero to twenty, the tens, hundred, thousand, million, billion and their plurals, dozen, half), quotation marks around a word or phrase, a superlative from C19's list, "only", "first", "invented", "named after", "comes from" or "means"; when it is the key claim of a counterintuitive item (for a comparison, both label claims); and when it is a clue, value or input claim in a sealed pool. Three things don't count: a number word capitalized mid-sentence, which belongs to a title (The Four Seasons); digits that only number clues ("contradicts clues 1 and 4"); and "most of", which is a quantity, not a superlative. Uniqueness claims are exempt, because the rival search proves them (§5.4). Writers may raise risk, never set it below this floor | error |
| C27 | stems, clues, claims | **The capital rule.** "Capital" in the same stem, clue or claim as a country in `content/reference/capitals-excluded.json` (by name or alias), or any clue containing "capital" in a mystery whose answer is a listed country (§3.4) | error |
| C28 | mystery | The four options, labelled as the server would label them (display forms, or `option_label` on all four when any carries a descriptor, ARCHITECTURE §5.5), agree: all carry a bracket or qualifier of the same kind, or none does | error |

**Messages.** Every finding names the item id, the rule code and the field path (`m.film.0107 C12 clues[1]`), and for a sealed file nothing else ever prints (ARCHITECTURE §5.4). Sealed lint output is never pasted into a pull request, an issue or a commit message (§11.2).

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

**Football.** Never write the bare word. Name the competition ("the men's FIFA World Cup"), or write "football (soccer)" for the association game and "American football" for the gridiron one (lint C20). The sport list's display is "Association football", which has no bracket to stand out among options (§2.10).

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
| `slow` | True now and stable, but could drift | Set by the editor at acceptance, at most 24 months later (§2.3) | "MoMA has held it since 1934" |
| `dated` | The year sits in the text, so the fact can't expire | null | "In 1998 Titanic won 11 Academy Awards" |
| `fast` | Changes within months | Never accepted | "The current Formula 1 champion" |

**Things that changed recently and catch writers out:** Kazakhstan's capital became Nur-Sultan in 2019 and Astana again in 2022; Burundi moved its capital from Bujumbura to Gitega in 2019; Swaziland became Eswatini in 2018; Pluto became a dwarf planet in 2006; Indonesia is moving its capital; Croatia adopted the euro in 2023; Saturn's count of known moons has changed several times since 2019.

**No capital question unless the capital is single and settled.** No stem, clue or claim asks for or states a country's capital when the country has more than one capital, a disputed one or none in law; when its capital moved, was renamed or was announced to move since 1990; or when the pinned countries file disagrees with a Tier A source about it. (CLDR names countries but holds no capitals, so for capitals the comparison is with the body that owns the fact.) The pinned file shows why the rule exists: it already gives Gitega for Burundi and Ciudad de la Paz for Equatorial Guinea, so a writer can "confirm" a changed capital against it exactly as a checker would (§9.5.1). The list lives in `content/reference/capitals-excluded.json`, one entry per country with its reason, and lint C27 refuses any stem, clue or claim that pairs "capital" with a listed country. Its launch contents:

| Reason | Countries |
|---|---|
| More than one capital, a disputed one, or none in law | Benin, Bolivia, Côte d'Ivoire, Eswatini, Israel, Malaysia, Montenegro, Nauru, the Netherlands, Palestine, South Africa, Sri Lanka, Switzerland, Yemen |
| Moved or renamed since 1990 | Germany (Bonn to Berlin, 1990), Nigeria (Lagos to Abuja, 1991), Tanzania (Dar es Salaam to Dodoma, 1996), Kazakhstan (Almaty to Akmola in 1997, then renamed Astana, Nur-Sultan and Astana again), Myanmar (Yangon to Naypyidaw, 2005), Palau (Koror to Ngerulmud, 2006), Burundi (Bujumbura to Gitega, 2019) |
| A move announced or under way | Egypt (a new administrative capital east of Cairo), Equatorial Guinea (Malabo to Ciudad de la Paz), Indonesia (Jakarta to Nusantara), South Sudan (Juba to Ramciel) |

The editor adds a country the moment one qualifies. Every claim that names a country's current capital, the key of "Which city is the capital of Australia?" among them, carries both the dataset record and a Tier A or B web result before acceptance (§9.9, rule 3).

### 3.5 Superlatives and "first" claims

These go wrong more often than anything else ([07 §7](./research/07-content-excellence.md)), so they are high-risk claims that need external evidence, and lint C26 refuses to let one be marked standard (§9.2).

- **Name the measure and the scope:** "highest above sea level", "largest by area", "the hottest surface of any planet". Venus has the hottest surface, but Jupiter's interior is far hotter, so "the hottest planet" is ambiguous.
- **Turn a contested first into a documented event.** "Who invented the telephone?" has rival answers. "Who received the US patent for the telephone in March 1876?" has one.
- **Date every record.** "The world's tallest building when it opened in 2010", never "the world's tallest building".
- **"Only" over a living set is a record.** "The only person to win Nobel Prizes in two sciences" could be overtaken; "the first person to win two Nobel Prizes, in 1911" can't. "Only" over a fixed set is still a superlative in disguise: "Mongolia borders only Russia and China" is one claim about every other country, so it is high-risk too.
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

Stems at most 120 characters (aim for 100), options aim for under 24 characters, clues at most 140, explanations at most 35 words. One idea per stem. No double negatives or nested clauses. Everything must read well aloud, because read-aloud mode and screen readers speak it (PRD §3.12), so prefer words to symbols wherever both fit.

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

Shares below are cumulative: the share of typical adults (§8.1) who have solved it by that clue. They are typical shapes, not rules. The rule is the expected-points window in §8.3. These shapes land inside the PRD's bands (PRD §4.1.6), not necessarily inside the tighter assembly windows: at the bottom of every range they sum to 3.04, 2.42 and 1.80, below the windows' floors of 3.2, 2.5 and 1.9, so a ladder pitched at the low end of every clue is in band yet too hard to schedule.

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
6. **No clue gives the answer away in text.** In the clues players type against (those before `optionsFromClue`, so clues 1 to 3 at launch), nothing contains the answer's name, an alias, a significant word from either, or a giveaway term (lint C12). Watch prefixes and near misses: the suggestion box matches the start of any word and, from 5 characters, anything one edit away (PRD §4.1.3), so "Parisians" gives away Paris, "Constantine" gives away Istanbul through its alias Constantinople, "kimjang" gives away kimchi, and "Mexico" surfaces the axolotl's alias "Mexican walking fish", because "mexica" is one letter from "mexico". C12's suggestion probe runs the real matcher over every clue word, so it catches what the eye misses. List such words in `giveawayTerms`.
7. **The clues beside the options contain no word of the answer's display form,** qualifier included (lint C13): clue 4 at launch, clues 3 and 4 if PRD Q3 moves the options up, because the four options show display forms. "Mary Shelley's novel" on clue 4 would point straight at "Frankenstein (Mary Shelley)".
8. **No time-sensitive clue** (§3.4). Dated clues are fine.
9. **Each clue is 140 characters or fewer,** one or two short sentences, readable aloud. Pronouns ("it", "she") are fine. A clue may build on the one before, but must stay true on its own.
10. **The recognition floor.** Most players must recognize the answer among the four options. Hard mysteries are hard because their clues go deep, never because the answer is obscure.
11. **The answer, distractors, rivals and likely guesses are active list entries,** by the ids the list builder minted, and the answer has passed the 30-day freeze (§2.10).
12. **The category is the clue angle; the answer type is the list** (§1.13).
13. **No clue relies on images, audio, video or the player's location.**
14. **Pronouns and gender.** Clues that say "she" make male distractors useless, so choose distractors that fit the pronoun.
15. **A clue that names another entity of the answer's list** (by name or by one of its aliases) must make plain that it isn't the answer, as "Its singer..." or "after hydrogen" does, and that entity goes in `likelyGuesses` and in `rivals` with the clue that rules it out. Otherwise the clue doesn't name it. Players type the first name they read, and a wrong guess costs a clue.
16. **Each clue claim restates its clue exactly** (§9.2): the clue's own words, with the answer's name in place of "it", "she" or "this ...". It keeps the clue's precision and hedges ("about 20 minutes", never "20 minutes"), adds nothing, and drops nothing. The one addition allowed is a bracketed name, so the claim can be checked: for something the clue describes without naming, as in "(Bohemian Rhapsody)", or for the answer as it was called at the clue's date, as in "Istanbul (then Constantinople)". Any further fact is its own claim.

### 5.3 Likely guesses and coverage

List 6 to 12 entries that players will plausibly type at clues 1 to 3, most of them wrong: the neighbours, the famous alternatives, the guess clue 1 seems to invite, and any entity a clue names (rule 15). Every one must exist in the list, by its minted id; a missing one becomes a list request (§2.12). This does three jobs. Players never meet "No matches" for a sensible guess, the "most common wrong guess" line has real candidates (PRD §4.1.5), and the list builder knows what to add before the mystery can be scheduled.

### 5.4 Uniqueness: the rival search

Writers do this before submitting. Both checkers repeat it blind, with the list file in the first stage of their packets (§9.4), and pass D repeats it against the list version that will ship on the Daily's date (§9.9, rule 7).

1. Read clue 1 alone. Write down every list entry that fits it. If more than one fits, tighten clue 1.
2. Add clue 2, then clue 3, and strike every candidate that no longer fits.
3. Hunt for rivals on purpose: same-type entities of the same era, region, field or fame, the famous alternative, and anything sharing a striking fact with the answer.
4. Record at least three of them in `rivals`, each with the clues that rule it out. After clue 3 only the answer may remain.

Mary Shelley began Frankenstein during the 1816 ghost-story contest at Lake Geneva, but so did John Polidori, whose The Vampyre came out of the same nights. "Its author began it during a ghost-story contest" fits both books. "Its author began it aged 18" fits only one, because Polidori was 20 (§12.7).

### 5.5 Clue-4 options

- The three distractors come from the same list as the answer.
- **Plausible at a glance:** the same era, region, field or fame, and matching the clue's pronoun.
- **Definitely wrong:** each distractor contradicts at least one of the four clues, and no distractor fits all four. A distractor may fit some clues; that is what makes it tempting (the Who also played Live Aid at Wembley).
- **Parallel display forms:** never let the answer be the only option with a bracket or a qualifier (§2.10, rule 6; lint C28).
- A distractor that was a Daily answer in the last 7 days should not appear (§10.5).

### 5.6 The mystery explanation

It adds something none of the clues said, ties the clues together, or defuses the likeliest wrong guess. It never just restates a clue.

---

## 6. Encores

The Encore ends every Daily. It scores no points but breaks ties, so its job is to spread the crowd: almost nobody should know the number exactly, and almost anybody should be able to have a sensible go. A bullseye is within 5% (or 2 years) and "close" within 15% (or 5 years) (memo §2).

1. **Stable numbers.** Values that can't move: counts in a design (squares on a chessboard), historical durations, astronomical and geographical constants, and dated facts. No populations, prices, records or current counts, and nothing that an antenna, a resurvey, a renovation or a redefinition can change: the Eiffel Tower's official height has changed several times as antennas were added.
2. **One definition.** If two reputable sources give different values, the encore fails. While writing this guide a search for the Louvre pyramid's pane count turned up 673 (the Louvre's figure) and 689 (attributed to I. M. Pei's office), so that encore is out (§12.10). Lengths and areas with competing definitions (canals, coastlines, rivers, countries with overseas territories) are out unless the question names the definition.
3. **Unit-free by preference, and never ambiguous.** The question names its unit or asks for a count. Prefer counts, ratios, durations and years, which every player estimates in the same terms. A length, area, mass or speed is allowed only when the quantity is equally familiar in metric everywhere (a 400 m running track is; the height of Mount Everest isn't, for players who think in feet), and such measured encores are at most 1 in 10: one per batch, 12 in the bank (lint C15, §11.4). A unit that the question supplies rather than asks for, such as a walking speed, comes in both systems. Never tons, gallons, ounces, calories or "degrees" (lint C21).
4. **A true zero.** The error is a ratio: max(guess, answer) / min(guess, answer) - 1 (PRD §4.2.2), so a guess twice the answer and one half of it are both 100% off. A ratio means something only on a scale with a real zero: counts, lengths, masses, durations, speeds, ratios. Never °C or °F, where "10% off" means nothing. Dates use `valueKind: year` and score in years off.
5. **Big enough.** Quantity answers of 21 or more, so the 5% bullseye holds at least one whole number on each side of the answer (at 20, a guess of 19 is 5.3% off). Smaller answers need a `bands` override with a reason, or a different question. Years run from 1 to 9999 (PRD §4.2.1), so no BC years.
6. **Interesting to estimate.** A typical adult can get within a factor of three by reasoning, few know it exactly (predicted exact share under 5%, never over 10%), and the reveal surprises. **The likeliest round guess misses the bullseye.** Name it in `writerNotes` with its error: for a quantity, the round number players anchor on (40,000 for an Equator of 40,075 km is 0.2% off, so that question fails); for a year, the nearest decade (1900 for the first Michelin Guide is exact, so that one fails too, and in practice any year ending in 0, 1, 2, 8 or 9 fails, because its decade is 2 years away or less). A round anchor inside the bullseye gives thousands of players the same near-perfect score, and mass near-ties stop the Encore breaking ties (rule 9).
7. **Lookup resistance is welcome, not required.** A derived number (a ratio, a sum) is often harder to search for and rewards reasoning (SYNTHESIS §7.5), unless the number is itself famous ("1.3 million Earths"). Every input is its own verified claim, and the arithmetic goes in `derivation`.
8. **Store the precision the evidence supports.** The Sun's volume is "about 1.3 million" times Earth's: store 1,300,000, not 1,302,097.
9. **Years are at most a quarter of encores** (30 of 120). Skip years everybody knows exactly, such as the Moon landing, because exact ties stop the Encore breaking ties.
10. **Bands.** The defaults suit almost everything. Override only with a written reason, and never widen a bullseye beyond 10%.
11. **The explanation shows the way there** (the reasoning, or the surprise), plus the other unit where it helps.
12. **Equally guessable everywhere.** "How many US states are there?" is a count Americans learn at school, so it fails the global rule. A length asked in kilometres fails it more quietly: it favours players who think in metric over those who think in miles (rule 3).

---

## 7. Explanations

Feedback that explains beat feedback that shows the right answer, which beat right-or-wrong alone, with effects of about 0.49, 0.32 and 0.05 ([Van der Kleij et al.](https://doi.org/10.3102/0034654314564881)). A 35-word line takes about 9 seconds to read ([Brysbaert](https://doi.org/10.1016/j.jml.2019.104047)).

- **35 words or fewer**, counted as whitespace-separated tokens, numbers included (lint C02). Room explanations aim for 25.
- It shows after right and wrong answers, so it must work for both.
- **It adds a surprising, verifiable fact.** It never just restates the key. "The capital of Australia is Canberra" is a restatement; "Sydney and Melbourne both wanted the title, so the constitution put the capital on land granted by New South Wales, at least 100 miles from Sydney" earns its place.
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
- **Combine** by taking the median on the logit scale, share by share (the medians of non-decreasing ladders are non-decreasing, so s1 to s4 stay in order). **Spread** measures how far the five disagree on the number that matters for each kind: for practice and room items, the standard deviation of the five logits of *p*; for mysteries, the standard deviation of the five estimators' expected points (each one's s1 + s2 + s3 + s4, §8.3); for encores, the standard deviation of the five logits of `pClose`. Store the combined values and the spread, with the estimator version.
- **Shapes** (`predicted`, ARCHITECTURE §3.2): practice and rooms `{ "p": 0.68, "spread": 0.41, "estimator": "v0" }`; mysteries `{ "solveByClue": [0.3, 0.5, 0.8, 0.97], "spread": 0.35, "estimator": "v0" }`, whose expected points are the sum of the four shares; encores (+) `{ "pClose": 0.31, "pExact": 0.02, "spread": 0.5, "estimator": "v0" }`.
- **The band follows the estimate.** Practice and room bands come from `predicted.p` (PRD §3.3.3), and a mystery whose prediction lands in another window moves to another `slot`. The editor then moves the item to another cell of the batch plan. Nobody rewrites text to chase a number.
- **AI solve rates are never difficulty.** Agents answer most trivia, so their success says almost nothing about people (gap 3).
- **Benchmark before launch:** estimator v0 runs offline on the published recall norms of Tauber and colleagues ([DOI](https://doi.org/10.3758/s13428-012-0307-9)) and of Nelson and Narens ([DOI](https://doi.org/10.1016/S0022-5371%2880%2990266-2)), never in the bank. We proceed at a rank correlation of 0.6 or better (SYNTHESIS §7.10).
- Writers never tune their seed toward the estimator. We keep both to learn which one predicts better.

### 8.6 After launch: how play recalibrates

- **Eligible answers.** For a practice item: a player's first attempt, counted only when the calibration view accepts it (ARCHITECTURE §8.12, `item_stats`): the identity already holds 20 or more rated answers, its practice record is at least a day old, its IP subject has counted fewer than 3 answers on that item that day, and it isn't low trust. For a Daily item: ranked runs with no honest-play flag (PRD §4.3.6). Archive, challenge and repeat plays never count. The practice upload needs no secret (a registered device sends one only so its answers count toward report weight, PRD §3.13.3), so these rules, not a credential, are what keep one client from moving an item.
- **Safeguards** (SYNTHESIS §7.10). Only a player's first rated attempt at an item counts. Flagged and low-trust identities, and identities with under 20 rated answers, are ignored. Each player's influence is capped: one answer per item, ever, inside ARCHITECTURE's daily upload limits. Answers from runs in a category the player picked count half, because people choose the categories they are good at. An item with open reports, a pull or a pending re-check is frozen at its last estimate until the matter closes. The database's calibration view marks open reports and pulls as `disputed`; pending re-checks live on the content side, so the weekly content run adds those holds itself (ARCHITECTURE §8.12).
- **The weekly re-tune** (Mondays, automated). Fit logit(observed) = a + b × logit(predicted) on items with 100 or more eligible answers; add shrunken category offsets once a category has 8 such items; re-score every item. New *p* values ship with the next practice pack build, which moves items between bands automatically, because bands read the current *p* (PRD §3.3.3). The sealed pool is re-scored and Dailies beyond the freeze re-assembled (gap 3).
- **Mysteries** swap predicted solve shares for observed ones once 100 eligible runs exist. The clue where the crowd actually solves shows which rung was mis-pitched.
- **Editor flags** (SYNTHESIS §7.10): success above 95% or below 10%; strong players missing an item more often than weak ones (often a wrong key or ambiguous wording, so the item is re-checked at once); a distractor drawing under 5% of picks; reports above 1% of plays; a mystery whose most common wrong guess takes more than 30% of wrong guesses, which may mean that entity fits a clue.
- **Alarms** (gap 3): a Daily's mean more than 1.0 point from its prediction; an Easy practice item under 65%; a Mystery 1 with observed expected points under 2.6, or a Mystery 3 over 2.8.
- **What writers do with it.** The weekly content run reads the calibration report, re-checks and fixes flagged items, replaces dead distractors, and writes Hard items first, because 20 to 31 Hard items per category (§11.4) last two or three Hard runs.
- **Estimator v1** trains on our own data once 1,000 practice items have 100 first attempts each (gap 3).

---

## 9. Verification protocol

Our writers and checkers are AI agents, mostly without open web access. The decisions memo replaces "two web sources and a stored quote per item" with two independent checkers, datasets for structured facts, WebSearch only for genuinely uncertain items, and cutting whatever stays uncertain (memo §10). It also asks for zero known errors in scheduled Dailies (memo §13), and every player sees every Daily clue on the reveal, so Daily items carry the strictest rules in the bank and a third check of their own, pass D. This section turns all of that into mechanics.

### 9.1 Principles

- **We publish fewer questions before we publish a wrong one** (SYNTHESIS §1, bet 2).
- **Agreement between agents is weak evidence.** Writers and checkers probably share a model family, so their errors correlate (SYNTHESIS §7.6). The protocol leans on independence, external evidence for risky claims and audits seeded with planted errors.
- **Doubt means cut or rewrite.** "Probably" is a fail. AI-written exam items have shown more factual errors than human ones, and one study rejected 31% of them ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11806894/), [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11854382/)), so expect to cut.
- **Evidence is labelled honestly:** a dataset record, a search result or a checker's knowledge. Never dressed up as more than it is.

### 9.2 Claims

An atomic claim is one checkable statement. The key, each distractor's wrongness, each clue, each fact in the explanation, a mystery's uniqueness and an encore's value are all claims. Writers list every claim. Checkers extract their own list from the item text and add anything the writer missed.

| Field | Type | Rule |
|---|---|---|
| `id` | string | `c1`, `c2` and so on from the writer, unique in the item. Additions carry the pass that made them, so two blind checkers can't both write an `x1`: `xA1`, `xA2` from checker A, `xB1` from checker B, `xT1` from a tiebreak, `xD1` from pass D |
| `role` | enum | `key`, `distractor`, `clue`, `explanation`, `uniqueness`, `value`, `input` or `label` (a comparison item's value) |
| `ref` | string, optional | Which part: `clue:2`, `distractor:Sydney`, `item:1` |
| `text` | string | One statement, in plain words. A clue claim restates its clue exactly (§5.2, rule 16) |
| `risk` | `standard` or `high` | Never below lint C26's floor |
| `riskReason` | enum, when high | `number`, `date`, `superlative`, `only`, `first`, `quotation`, `etymology`, `record`, `recent_change`, `counterintuitive`, `sealed_pool` or `checker_doubt`. C26's other triggers map onto these: "invented" to `first`; "named after", "comes from" and "means" to `etymology` |

**The risk floor.** Labels used to be self-assessed, and two same-family checkers' knowledge can pass a standard claim, so an under-labelled claim is the cheapest way for an error into the bank. Lint C26 therefore sets a floor no writer can go under: a digit or a number word, quotation marks, a superlative, "only", "first", "invented", "named after", "comes from" or "means" makes a claim high-risk; so does being the key claim of a counterintuitive item, or a clue, value or input claim in a sealed pool. Writers may raise risk, never lower it. Beyond the floor, a claim is high-risk when it gives an exact date or a year of an event that isn't world-famous, a measurement beyond everyday knowledge, anything that changed in recent years, or anything either checker rates below certain. An encore's value is always high-risk.

**High-risk claims need external evidence** (a dataset, a web result, or a calculation for a pure conversion, §9.5.4) in at least one confirming check. Sealed Daily pools need more (§9.5.5).

**When evidence runs out.** A high-risk claim that can't get external evidence within its batch's search caps (§9.5.2) moves down the precision ladder or is cut. It is never relabelled standard.

**The precision ladder.** When evidence for an exact figure is missing, step down: exact ("3.8 km") to approximate ("about 4 km") to bounded ("less than 5 km") to dropping it. Write each claim at the precision you can defend.

### 9.3 Writer self-check

Tooling can't read a ticked box in prose, so the checklist is a field. Before submission the writer sets each of these eleven codes in `selfCheck` to `true` (§2.3), and keeps any commentary in `writerNotes`. The packet builder refuses an item whose `selfCheck` lacks a code or holds a `false`.

| # | Code | What the writer confirms |
|---|---|---|
| 1 | `lint` | The lint is clean |
| 2 | `claims` | Every claim is listed, with its risk at or above lint C26's floor and set honestly beyond it |
| 3 | `datasets` | Structured facts are checked against a dataset (§9.5.1) wherever one covers them, with the locator noted |
| 4 | `rivalTest` | The rival test is done (§3.2): each distractor argued for, the key argued against |
| 5 | `volatility` | Volatility is set; no time words; nothing depends on knowledge newer than mid-2026 |
| 6 | `regional` | A player in Lagos, Mumbai, Toronto or Sydney has the same chance as one in London or Chicago |
| 7 | `style` | Spelling and style (§3.3): Oxford spelling, no time words, no en or em dashes, an explanation of 35 words or fewer |
| 8 | `myths` | Every claim is screened against `content/reference/myths.json` |
| 9 | `mystery` | Mysteries: rival search, likely guesses, list coverage by minted ids, giveaway terms, rule 15 for named entities, clue claims that restate their clues, and the display checks |
| 10 | `encore` | Encores: unit, stability, true zero, the likeliest round guess outside the bullseye, and the derivation's arithmetic done twice |
| 11 | `doubts` | Doubts are written down in `writerNotes`. An item the writer can't stand behind is dropped, not left for the checkers to catch. Writers may use WebSearch inside their own cap for genuinely uncertain claims (§9.5.2) |

### 9.4 Fact-checker passes A and B

**Independence.** Each checker is a separate agent run with no shared context. Each receives its own blind packet from the packet tool (`npm run content:packets`, ARCHITECTURE §5.8). No stage of a packet holds the writer's notes or `selfCheck`, the estimate, or the other checker's record.

**Staged packets.** One agent run receives its packet in stages. The tool serves the next stage only after the run's check record holds the cold-solve entry for the stage before, and it hashes each stage as it serves it:

| Stage | Multiple choice, true/false, comparison, room question | Mystery | Encore |
|---|---|---|---|
| 1 | The stem and the options in shuffled order (true/false: the statement; comparison: the stem and both labels), and the category | The answer-type line, clue 1, the category, and the answer list file for the type, in the version that will ship | The question, the unit and the category |
| 2 to 4 | None | One clue per stage: clue 2, then 3, then 4. The four options, in shuffled order, arrive with clue `optionsFromClue` | None |
| Final | The key and the writer's claims | The key, accepted ids, distractors, rivals, likely guesses, giveaway terms and the writer's claims | The answer, bands, derivation and the writer's claims |

No stage before the final one holds a claim, because the claims state the key. `packetSha256` stores every stage's hash in order, and `stagesServedAt` the time each was served, so the record proves what the checker saw and when. A cold-solve entry written after the next stage was served makes the record invalid. Estimator packets have a single stage: the item with its key, and nothing else.

**Briefs.** Checker A confirms: verify every claim as a subject expert would, and gather dataset or web evidence for every high-risk claim. Checker B refutes: try to break the item by finding a second defensible answer, an outdated fact, a regional misreading, a trick reading or a giveaway. Both verify every claim.

1. **Cold solve, stage by stage.** Multiple choice, true/false and comparison: answer it and rate your confidence. Mystery: at each clue record your guess and every candidate you would consider, checking candidates against the list file, before asking for the next clue. Encore: give an estimate and say how you got it. A cold miss, or more than one candidate left after clue 3, is a red flag the checker must explain in `issues` as ambiguity or as a gap in their own knowledge. A cold solve never feeds difficulty.
2. **Claims.** After the final stage, extract your own claim list and compare it with the writer's. Give every claim a verdict (`confirmed`, `refuted` or `uncertain`) and its evidence entries, each typed by kind (§9.5, §9.8). Add the claims the writer missed under your pass's prefix (`xA1` or `xB1`), with role, text and risk.
3. **Issues.** Record each problem with its type (`ambiguity`, `second_answer`, `outdated`, `regional`, `trick`, `giveaway`, `wording`, `sensitivity`, `style` or `checker_doubt`) and severity (`blocker`, `fix` or `note`).
4. **Verdict.** `pass` when every claim is confirmed and nothing is a blocker. `fail` when any claim is refuted or any blocker stands. `revise` in every other case: a fixable issue, or any claim left `uncertain`, which also gets an issue of type `checker_doubt` naming it. So an uncertain claim with nothing refuted and no blocker is always `revise`, never a gap between the three.

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
| `mledoze-countries` | `mledoze/countries` at `6031f5d`, `countries.json` (npm `world-countries` 5.1.0) | ODbL 1.0 | ISO codes, capitals, borders, landlocked status, region, area, alternative spellings | Marks Vatican City as a UN member, so it counts 194 members instead of 193 (the Holy See is an observer). Spells Mongolia's capital "Ulan Bator". Gives a changed or planned capital where most players learned the old one: Gitega for Burundi (moved from Bujumbura in 2019), Ngerulmud for Palau (moved from Koror in 2006), Ciudad de la Paz for Equatorial Guinea (most references and players still say Malabo). Gives one capital where there are several or none in law: Colombo for Sri Lanka (the official capital is Sri Jayawardenepura Kotte), Lobamba alone for Eswatini, Sucre alone for Bolivia, Yaren for Nauru; yet lists three for South Africa. Lacks "Czech Republic" among Czechia's spellings. France's area is metropolitan France only (551,695 km²). Every capital value above was read from the pinned file (sha256 `0d92fb23...`) on 31 October 2026 |
| `cldr-territories` | `unicode-org/cldr-json` at `7d2b9cb`, `cldr-json/cldr-localenames-full/main/en/territories.json` (npm `cldr-localenames-full` 49.0.0) | Unicode-3.0 | English display names and their variants: Côte d'Ivoire and Ivory Coast, Czechia and Czech Republic, Eswatini and Swaziland, Türkiye and Turkey | Some names need overrides ("Congo - Kinshasa"). Uses curly apostrophes |
| `ptable` | `Bowserinator/Periodic-Table-JSON` at `a78c7a4`, `PeriodicTableJSON.json` | CC BY-SA 3.0, built from Wikipedia | Checking single facts: atomic numbers, symbols, groups, periods, phase at room temperature. Never copied into the shipped element list (§11.4), and never independent of a Wikipedia source (§9.5.2) | Includes element 119, "Ununennium", which has not been discovered. Spells "Cesium" (IUPAC: caesium). Credits shared discoveries to one person (oxygen to Scheele alone). Predicted properties of superheavy elements look like measured ones |
| `geonames-cities` | npm `cities.json` 1.1.65, 171,094 places from GeoNames | CC BY 4.0 | City coordinates and country codes, so "further north" comparisons can be checked | Homonyms: two places called Cusco in Peru. Match on name, country and `admin1` together |
| `worldcup` | `openfootball/worldcup.json` at `516d382`, one file per tournament | Public domain | Men's World Cup results and finals | Men's tournaments only. Finals settled after extra time or on penalties need the full score fields |
| `moma-artists` | `MuseumofModernArt/collection` at `51a140d`, `Artists.json`, stored in Git LFS (fetch through `media.githubusercontent.com`) | CC0, credit requested | Artist names, birth and death years, nationality, Wikidata QIDs, ULAN ids | Nationality is MoMA's convention: Max Ernst is listed as French |
| `tate` | `tategallery/collection`, `artist_data.csv` | CC0, credit requested | Artists' dates and birthplaces | Places in local languages ("Polska") |
| `met` | `metmuseum/openaccess`, `MetObjects.csv`, Git LFS | CC0 | Object dates, cultures, departments and media | Large; `raw.githubusercontent.com` returns only the LFS pointer |
| `natural-earth` | `nvkelso/natural-earth-vector`, GeoJSON | Public domain | Country shapes, rivers, lakes and populated places | Its own naming conventions, at three scales |
| npm helpers | `iso-639-1` 3.1.6, `currency-codes` 2.2.0, `countries-list` 3.4.1 | MIT | Language and currency codes and names | Currencies change (Croatia moved to the euro in 2023) |
| `corpora` | `dariusk/corpora` | CC0 | Brainstorming list candidates (animals, foods) | Not authoritative, so never evidence |
| Wikidata | Through the enrichment job only; blocked from the sandbox | CC0 | QIDs, sitelinks, labels and aliases for answer lists | Anyone can edit it, so it is a candidate source and never a fact-checker ([07 §11](./research/07-content-excellence.md)) |

**Using a dataset well.** Record the file, the locator (`cca3=AUS`) and the exact excerpt. Cross-check a high-risk dataset fact against a second source, because one bad flag in the most popular countries file shows how errors sit quietly in famous data. Prefer CC0 and public-domain data when building anything we ship. ODbL and BY-SA data are for checking single facts, never for copying substantial parts into shipped files without the owner's say-so, recorded in the batch register ([07 §11](./research/07-content-excellence.md); not legal advice). That is why the element list is written by its list builder from IUPAC's published table and only checked against `ptable`. GeoNames data needs credit if we ship it.

**The enrichment job** (ARCHITECTURE ticket ENR-1). A GitHub Actions job, which can reach hosts the sandbox can't (SYNTHESIS §9, row 27), queries Wikidata for each list entry by name and qualifier and writes candidates to `content/answer-lists/_wikidata/`. The list builder accepts a match only when the label and the qualifier agree (a film's year, a book's author, a city's country). Until the job exists, entities keep `x.` ids and `popularity` stays 0, except where a dataset record carries a QID, which then is the id (§2.12).

#### 9.5.2 WebSearch

Use it only for genuinely uncertain claims: a high-risk claim no dataset covers, a claim a checker rates below certain, a Daily claim that needs a second source (§9.5.5), or a report re-check (§9.10). Web pages themselves are mostly blocked from the sandbox, so don't build a check around fetching them.

- **What the tool gives you:** a list of result titles and URLs, then a prose summary. It returns no page text and no machine-readable link from a summary sentence to a result. Sometimes the prose names the result it drew on ("PEO: Its 'Canberra from above' page welcomes readers to Canberra, the capital city of Australia", from the search in §12.15); often it names its sources only as a group, or not at all. Record the query, the result list exactly as returned, and the summary sentences that state the claim, verbatim.
- **Attribution decides what a call is worth.** When the summary attributes the sentence to a named result, record that result as `citedResult` (title, URL and tier), and the call counts as one source at that result's tier. Otherwise the call counts as one source at the lowest tier among the results the summary could have relied on. A summary built from a Tier C page therefore never passes just because a Tier A URL sits somewhere in the list.
- **Tiers.** A: the body that owns the fact (a government or parliament, a UN agency, a standards body such as IUPAC or the IAU, the museum that holds the object, the organization that awards the prize, a peer-reviewed paper, a national statistics office). B: established reference works and quality press (Britannica, Wikipedia, national broadcasters, major newspapers). C: everything else, which never counts: blogs, listicles, fact sites, forums, AI-written pages and every other quiz or trivia site.
- **When a web check confirms a claim:** the summary states it plainly, the call counts as Tier A or B under the attribution rule, and the summary reports no conflict.
- **Independent sources.** Two sources are independent when different publishers stand behind them. Never two Wikipedia pages, never Wikipedia and data built from it (`ptable` is), and never two results of one call: one WebSearch call is one source however many URLs it lists. A two-source rule (§9.5.5) needs two calls with differently worded queries whose counted sources come from different publishers, or one call plus a dataset record from another publisher.
- **Conflicts fail the claim as written.** Rewrite to what every source agrees on, or cut. Our pane-count search for the Louvre pyramid is the example (§6, rule 2).
- **Budgets are per role, per batch.** The writer, checker A and checker B each have their own cap; tiebreaks and follow-ups are counted against the batch separately, and pass D against the Daily it clears. The editor sets each batch's caps when opening it, from the M1 content spike's measured figure: high-risk claims per item, by pool, that no dataset covered (PRD §9.3; §11.6 below). Checker A's cap is that figure times the batch's drafts, plus a fifth; the writer's and checker B's are each a quarter of A's. Until the spike reports, the starting figures are 1.5 per practice item, 6 per mystery (pinning clues need two sources each), 3 per encore and 1 per room question. Caps are limits, not targets, and every search is counted in its record (`searchesUsed`) and in the register (§11.3).
- **Out of budget never means relabelled.** A high-risk claim that can't get external evidence within the cap moves down the precision ladder or is cut (§9.2). A batch that keeps hitting its caps has too many fragile claims, so the next one is written toward facts the datasets cover.

#### 9.5.3 Knowledge

A checker's own knowledge may confirm a standard-risk claim. The checker restates the fact in their own words, names the basis (`textbook`, `reference` or `everyday`) and gives a confidence. Only `certain` confirms. Knowledge alone never confirms a high-risk claim: a checker may record a knowledge verdict on one, but the claim counts as confirmed only when at least one of the two checks also carries external evidence for it (§9.9). Because the checkers can't see each other, the job is assigned: checker A gathers external evidence for every high-risk claim, and checker B searches only for claims it doubts. One claim may carry several entries of different kinds (a dataset record for one half and knowledge for the other), and each is labelled for what it is.

#### 9.5.4 Calculation

A calculation entry confirms a unit conversion, or arithmetic on other claims that are themselves confirmed (a derived encore value from its inputs). It records the expression, the result, the claims it uses and the constants it needs, and constants come only from `content/reference/units.json`, which holds exact definitions such as 1 mile = 1.609344 km. The validator re-runs every calculation. It never confirms a fact about the world on its own: "100 miles is about 160 km" passes on one, while "the Equator is about 40,075 km long" needs a dataset or a search. This is what keeps §3.3's dual units affordable once C26 makes every number high-risk.

#### 9.5.5 What a Daily item needs

A wrong clue is a Daily error under memo §13, and every player sees all four clues on the reveal, so sealed Daily pools (mysteries, encores, and anything scheduled into a Daily) add these rules to the ones above:
- **Every clue, value and input claim** carries dataset or web evidence in at least one confirming check (C26 already makes them high-risk). A derived value is the one exception: its calculation from evidenced inputs stands in (§9.5.4).
- **Two independent external sources** (§9.5.2) back every clue claim that pins the answer, meaning any clue a rival's `ruledOutBy` names; any number, date or "only" in any clue, clue 4 included; and every encore value. A derived value counts as having two when each of its inputs has two and the validator reproduces the arithmetic.
- **A claim naming a country's current capital** carries the dataset record and a Tier A or B web result, as everywhere (§3.4).
- **Pass D** then re-verifies all of it, against the list version that will ship, before the Daily freezes (§9.9, rule 7).

### 9.6 Never invent a source

- A URL may appear in our files only when it came verbatim from a tool result in that session or from the dataset manifest, and never in player-facing text.
- Never cite a book, page, museum label or dictionary entry you didn't retrieve. Writing "as listed in Britannica" without a result is fabrication.
- Never type a Wikidata id, ISBN, catalogue number or coordinate from memory and present it as evidence. A QID used as an entity id comes from the record its entry's `source` names.
- A fabricated source fails the whole batch. The editor rejects it, fresh checkers re-check every item in it, and the incident goes in the batch register.
- The "Learn more" link is generated from `learnMore` as a Wikipedia search. Nobody types it.

### 9.7 How the editor resolves disagreements

**First, merge.** Each checker added claims blind (§9.2), so neither has seen the other's additions. Once both records are in, the editor builds the merged claim list: the writer's claims plus every addition, with any addition that repeats an existing claim marked as a duplicate of it (`verification.merge`, §9.8). Every claim that only one check confirmed, which includes every surviving addition, goes in a short follow-up packet (the item and those claims) to a run with the other pass's brief: checker B's for an `xA` claim, checker A's for an `xB` claim, never the claim's author, the writer or the editor. The editor may send it to a tiebreak T instead. The follow-up's verdict stands in for the missing check on those claims.

**Then resolve.**

| Checker A | Checker B | The editor |
|---|---|---|
| pass | pass | Reviews style and balance, then accepts or asks for a change, under the re-check rule below |
| pass | revise (either way round) | Applies the fix, under the re-check rule, or rejects it. A rejected revise needs a tiebreak T on the disputed issue, and the item can be accepted only if T passes |
| revise | revise | Applies both fixes under the re-check rule, or rejects one, which needs a T as above |
| pass | fail (either way round) | Reads both records. A real problem means cut or rewrite. If the failing checker misread the item, the editor orders a tiebreak T on the disputed claims, with external evidence required, and accepts only if it passes |
| fail | fail | Cuts, or reopens it as a new draft with a new ID |
| Any `checker_doubt` issue | | Gets external evidence on that claim, through a follow-up or a T, or cuts |

**The re-check rule.** Small edits change meaning ("above sea level", "by area"), so nothing player-facing changes on the editor's say-so alone. Any change to the stem, options, `a`, `b`, clues, `question`, `unit` or key needs a fresh refute check (pass B, a new run) on the whole item and a re-lint. A changed claim anywhere needs two fresh checks on that claim. Only spelling or punctuation fixes in the explanation keep both checks as they stand. After acceptance, every change also goes in `verification.corrections` (§9.8).

The editor never overrules a refuted claim by judgment alone, never adds a fact during resolution without checks, and records every decision with its reason.

### 9.8 Verification record fields

The `verification` object on each item:

| Field | Type | Rule |
|---|---|---|
| `checks` | CheckRecord[2] | Passes A and B |
| `merge` + | object | The editor's merge (§9.7): `mergedAt`, `editor`, `claims` (every claim id in the merged list with who added it: `writer`, `A`, `B`, `T` or `D`), `duplicates` (`[{ "id": "xB2", "sameAs": "c3" }]`) and `sentToFollowUp` (claim ids) |
| `followUps` + | CheckRecord[] | One per follow-up run: a CheckRecord with `pass` set to the brief it ran under (`A` or `B`), `followUpFor` (the claim ids it was sent), `coldSolve` null, and results for those claims only |
| `tiebreak` | CheckRecord or null | Pass T, when §9.7 calls for one |
| `editor` | object | `editor` (agent id), `decision` (`accept`, `rewrite` or `cut`), `reason`, `decidedAt` |
| `dailyChecks` + | CheckRecord[] | Pass D records, one for each Daily date or spare set the item cleared (§9.9, rule 7) |
| `dedupe` | object | `checkedAt`, `nearestId`, `score`, `verdict` (`unique`, `related_ok` or `duplicate`). In a plaintext file whose nearest item is sealed, `nearestId` is the string `"sealed"` and `score` is null, so nothing public names a sealed id or how close it is (§11.2) |
| `mythsScreen` | object | `checkedAt`, `hits` (array) |
| `lint` | object | `version`, `passed`, `warnings` |
| `rechecks` | object[] | Later report and freshness re-checks (§9.10), each a CheckRecord plus `trigger` |
| `corrections` + | object[] | Every change after acceptance: `date`, `change` (what changed, in plain words), `reason`, and `rechecks` (indexes into `rechecks` or `followUps` that cleared it). A played sealed item keeps its ID and logs its correction here (§2.12) |

**CheckRecord**

| Field | Type | Rule |
|---|---|---|
| `checker` | string | Agent id |
| `model` + | string | The model the run used, so an audit can confirm §0.2's model-family rule |
| `pass` | `A`, `B`, `T` or `D` | |
| `brief` | `confirm`, `refute`, `tiebreak` or `daily` | |
| `packetSha256` | string[] | One hash per stage served, in order (§9.4) |
| `stagesServedAt` + | ISO timestamps[] | When each stage was served, in the same order |
| `startedAt`, `finishedAt` | ISO timestamps | |
| `coldSolve` | object or null | Multiple choice, true/false and comparison: `answerGiven`, `confidence` (`low`, `medium` or `high`), `matchedKey`, `recordedAt`. Mystery: `perClue`, a list of `{ "clue", "guess", "candidates", "recordedAt" }`. Encore: `estimate`, `reasoning`, `recordedAt`. Each `recordedAt` falls before the next stage's `stagesServedAt` |
| `claimResults` | object[] | One per claim: `claimId`, `verdict`, `evidence` (an array of typed entries, empty when the verdict rests on nothing), `note`. A checker's own addition also carries `addedClaim`: `{ "role", "ref", "text", "risk", "riskReason" }` |
| `issues` | object[] | `type`, `severity`, `note` |
| `searchesUsed` | integer | Counts against the role's cap (§9.5.2) |
| `forDate` + | ISO date or null | Pass D only: the Daily the check cleared, or null for a spare set |
| `listVersions` + | object | Pass D only: the version of each answer list it checked against, by type |
| `verdict` | `pass`, `revise` or `fail` | |

**Evidence entries**, by kind. A claim may carry several, of different kinds:
- Dataset: `{ "kind": "dataset", "dataset": "<manifest key>", "version": "<commit or npm version>", "file", "locator", "excerpt", "retrievedAt" }`
- Web: `{ "kind": "web", "query", "results": [{ "title", "url" }], "summaryExcerpt", "citedResult": { "title", "url", "tier" } or null, "tiers", "conflictReported", "retrievedAt" }`. `tiers` lists the tiers of the results the summary could have relied on; the call counts at `citedResult.tier`, or at the lowest of `tiers` when `citedResult` is null (§9.5.2)
- Knowledge: `{ "kind": "knowledge", "basis", "restatement", "confidence" }`
- Calculation: `{ "kind": "calculation", "expression", "result", "constants": ["<names from units.json>"], "claimIds": ["<claims it uses>"] }` (§9.5.4)

§12.15 shows a filled-in record.

### 9.9 The acceptance rule

The validator refuses `status: active` unless all of these hold:
1. Two check records, passes A and B, by two different checkers, neither of whom is the writer or the editor. Every follow-up and tiebreak is by a checker who is none of the writer, the editor or the claim's author.
2. Both verdicts are `pass`; or one is `pass` and a passing tiebreak T stands in for the other check's `revise` or `fail` (§9.7).
3. Every claim in the merged list (§9.8) is confirmed in both checks, a follow-up standing in for the check that lacked it. Every high-risk claim has dataset, web or calculation evidence in at least one confirming check. Every claim naming a country's current capital has the dataset record and a Tier A or B web result (§3.4). Sealed Daily pools also meet §9.5.5: evidence on every clue, value and input claim, and two independent external sources for every pinning clue, every number, date or "only" in a clue, and every encore value.
4. Mysteries: both checks confirm the uniqueness claim, and neither found a rival that fits clues 1 to 3.
5. No open blocker. Lint passed. Dedupe verdict `unique` or `related_ok`. Myths screen clean.
6. The editor's decision is `accept`. For a `slow` item, `reviewBy` is set and falls at most 24 months after `editor.decidedAt`.

**For scheduled sealed items, one more** (every mystery and encore in a scheduled Daily or a spare set):

7. **A passing pass D.** After the Daily is assembled and before it freezes, an auditor who didn't write, check, follow up or tiebreak the item, on a different model family or size where one is available, re-verifies every clue and value claim with external evidence under §9.5.5 and repeats the rival search against the list versions that will ship on that date. The record goes in `dailyChecks`, with `forDate` (or null for a spare set) and `listVersions`; it stays valid for another date only while those list versions are unchanged. A D that fails pulls the item from that Daily and sends it back to the editor. The scheduler and the validator refuse to freeze a Daily, or to list a spare set, without a passing D on every item, and refuse any sealed item scheduled on or after its `reviewBy`.

### 9.10 Audits and re-checks

- **Seeded blind audit** (before launch, then monthly). A separate auditor re-checks at least 400 random practice items and 60 sealed Daily items, mixed with at least 25 planted bad items. A planter agent (§0.2) writes the planted items, and at least half of them are subtle: a date a few years off, a number 10 to 20% off, a misattributed quotation, a folk etymology stated as fact, a fact that changed since 2019, a second answer that holds in one region. The rest may be blatant: a wrong key, an ambiguous stem, a right distractor, an invented source. Planted items live only in a git-ignored audit folder, `.cache/audits/<audit-id>/`, never anywhere under `content/`, so none can reach a pack. Every item in the audit, real or planted, reaches the auditor under an opaque packet id, so no id tells the two apart.
- **What a passing audit proves.** It counts only if the auditor catches at least 24 of 25 planted items, or 96% when more are planted. Detection is measured, not perfect: catching 24 of 25 shows a detection rate of at least about 82% at 95% confidence (one-sided Clopper-Pearson), so zero confirmed errors among 400 real items bounds the practice error rate below about 0.9%. With perfect detection the bound would be 0.75%. The old plan's 300 items with 95% of 20 to 30 plants caught gives only about 1.2 to 1.3%, as SYNTHESIS §7.6 itself says. Agent-planted errors run more blatant than real ones, which flatters measured detection; that is why half the plants must be subtle. Zero errors among 60 Daily items bounds the Daily rate only below about 5%, so the Daily's protection is pass D on every scheduled item (§9.9, rule 7), not this sample.
- **The audit record**, `content/sealed/audits/<audit-id>.json.enc`, sealed because it lists sealed ids. It holds the audit id and date; the auditor's and planter's ids and models; every sampled item's id with the auditor's verdict; each planted item's opaque id, defect type and subtlety, and whether the auditor caught it, never its text; the counts of planted and caught items; and each confirmed real error with links to its re-checks. PRD R4 and AC-CNT-05 read these counts, which the `content-sealed` job checks.
- **After a confirmed real error,** that writer's whole batch goes back for a full re-check (PRD §9.1, R4), and a fresh audit runs on a new random sample, so a repaired batch never certifies itself.
- **Owner spot check:** 50 random Daily items before 1.0 (SYNTHESIS §12, decision 14).
- **Report re-checks.** When reports trigger review (PRD §3.13.3), a fresh checker re-verifies the reported claims with external evidence. WebSearch is always allowed here, because a reported claim is uncertain by definition. Voids and key changes then follow PRD §3.13.4, and the re-check goes in `rechecks`. A "My guess should have counted" report also lands in the list builder's queue (`private.list_builder_queue`, grouped by answer type and guessed entity, ARCHITECTURE §8.4): a missing alias goes into the next list version, and a genuine equivalent, once both checks confirm it, becomes an accepted id that the owner adds after play with `admin_add_accepted`, which rescores earlier guesses of it (PRD §3.13.3).
- **Freshness.** An item reaching its `reviewBy` date gets a single fresh check. A failure retires it. A sealed item is never scheduled on or after its `reviewBy` (§9.9, rule 7).

---

## 10. Daily scheduling and room packs

### 10.1 Composition

A v1 Daily is `[mystery easy, mystery medium, mystery hard, encore]` (memo §2), stored as round records in the schedule (§2.11). The engine accepts any composition, so a change of format is a schedule change, never a content rewrite (PRD §3.1.2).

### 10.2 The difficulty ramp

- **Assembly windows** on predicted expected points (§8.3): Mystery 1 from 3.2 to 3.6, Mystery 2 from 2.5 to 2.9, Mystery 3 from 1.9 to 2.3. They sit inside the PRD's bands so estimate error rarely pushes a slot out of its band (gap 3).
- **The Daily's predicted total** runs from 7.8 to 8.6 points, near the PRD's "about 8 of 12". For the first seven Dailies it runs from 8.2 to 8.8, leaning easy while the estimator's bias is unknown.
- Mystery 1 comes from the lowest-spread third of eligible easy mysteries (spread as §8.5 defines it for mysteries: how far the five estimators disagree on expected points), because a misjudged opener hurts most. High-spread items go to Mystery 2.
- Prefer encores with a predicted close share between 20% and 50%.

### 10.3 Spread within a Daily

- Three different categories, and three different answer types.
- The encore's category differs from all three mysteries' categories.
- No item's text, clue-4 options or distractors name or clue another item's answer that day, and no two items share a theme tag.
- At least one of the four items is counterintuitive.
- Everything is `global`.

### 10.4 Spread within a week

In any 7 consecutive Dailies:
- No category appears in the mystery slots on two consecutive days. Each category appears at most twice in the mystery slots, and every category appears in a mystery slot at least once in any 6 consecutive Dailies (PRD §3.18.2; SYNTHESIS §7.4 asks for "every three or four days").
- Film & TV, Music or Food & Drink appears in a mystery slot in at least 4 of the 7 (PRD §3.18.2).
- No answer type appears more than 4 times.
- At most 2 year-kind encores.
- A free tag appears at most twice.

The Encore doesn't count toward any category rule above, as PRD §3.18.2 says for the Film & TV, Music or Food & Drink rule. Its own rules are the year-kind limit and §10.3's different category.

### 10.5 Repeats

- **No answer entity repeats as a mystery answer within 60 days.**
- No mystery or encore repeats within a year (PRD §3.18.2).
- An entity that was an answer in the last 7 days is not used as a distractor.
- Daily items never appear in practice packs or room packs, and no practice or room item covers the same fact as a Daily item.

**Prove it fits before the writing ends.** The pool has no slack to spare: 100 scheduled Dailies and 20 spare sets need 360 mysteries, exactly 10 per slot per category, and §10.3 to §10.5 interact with the answer-type quotas in §11.4 in ways nobody can check by eye. So the scheduler runs a constraint solver (a complete backtracking search, as CNT-3 builds, or an integer program: any exact method that can prove infeasibility) over every rule in §10.3 to §10.5 and the quotas, on all 100 dates and 20 spare sets at once. It runs on the accepted pool after every mystery and encore wave, with the batch plans' quotas standing in for items not yet written, and on the full pool before wave 3's writing ends (§11.5). An infeasible run is reported at once with the rules that clash, while the next batches can still change their answer types or categories. Accepted reserves (the 11th and 12th items of a mystery batch) stay in the pool as slack.

### 10.6 The day check

After assembly, a fresh checker plays the whole Daily cold, all four rounds, and reports cross-item giveaways, theme collisions, tone, and anything that reads oddly across time zones. A Daily is "today" somewhere for about 50 hours (PRD glossary), so no text says "today". The result goes in the schedule record's `dayCheck`. The day check looks for problems between items; it is not a fact check. Pass D is the fact check (§9.9, rule 7).

### 10.7 Locking and spare days

- Keep 14 days assembled. Freeze each Daily 3 days ahead at first and 7 days ahead once two calm weeks have passed, and only once every item on it has a passing pass D for that date and none is scheduled on or after its `reviewBy` (§9.9, rule 7). The database applies this as one rule in its config: the switch from 3 days to 7 is set to `DAILY_EPOCH` plus 28 days, and the owner moves it once two calm weeks have passed (ARCHITECTURE §8.7). The database alone decides what is frozen; a schedule file's `status` is advisory (§2.11). Re-assemble the rest after each Monday re-tune, so week-one lessons reach week two (gap 3).
- The runway alarm sounds below 30 scheduled Dailies (PRD §3.18.2).
- **20 spare sets** (20 mysteries per slot plus 20 encores). Each set obeys §10.3 and the bank-wide repeat rules on its own, and each item carries a passing D before the set is listed. The week rules of §10.4 and the date-based rules of §10.5 depend on neighbours a spare doesn't have yet, so for every scheduled date the scheduler stores a `spareOrder` (§2.11): the spare sets ranked by how few of those rules each would break against that date's actual neighbours, ties going to the predicted points nearest the date's own. If a scheduled Daily can't publish, the first unused spare in its date's order fills it automatically, and an alert to the content queue names every rule it breaks.

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

**Pack template.** 6 easy, 6 medium and 3 hard, banded by each question's `predicted.p` (§8.2, §2.9).
- Positions 1 to 3: easy, to warm the room up.
- Positions 4 to 14: the other 3 easy, 5 medium and 3 hard. Never two hard in a row, and at least one hard at position 8 or later.
- Position 15: the finale, announced on every screen as double points (PRD §3.8.3). Medium, with the pack's best reveal. A very hard finale turns double points into a lottery.

**Room rules.**
- Multiple choice with four options only. No true/false: a 50% guess swings timed scores.
- Stems of 100 characters or fewer and options of 30 or fewer, because the host screen is read across a room (PRD §3.8.6).
- No fact shared with a practice or Daily item. Practice packs sit on every phone in the room, so a shared fact is a shared answer key.
- No answer repeated inside a pack, and no option in a pack equal to another question's key in that pack: "Jordan" offered as a river a few questions after Jordan the country was an answer hands the room a hint. No question names or clues another's answer. Party-safe tone (§3.7).

---

## 11. Files and the production plan

### 11.1 Layout under `content/`

The tree follows ARCHITECTURE §2.1. Files marked (guide) are the content team's working files that this guide adds; (ENR-1) marks the enrichment workflow's output.

```
content/
  categories.json              The twelve categories from section 1
  practice/<category-slug>/    One practice item per file, p.<cat>.<BBSS>.json (ships to clients)
  answer-lists/<type>.json     Closed answer lists with aliases and provenance (ships to clients)
  sealed/                      Encrypted envelopes only: mysteries/, encores/, room-packs/, schedule/, spares/,
                               challenge-packs/, list-requests/, audits/
  .sealed-plain/               Git-ignored plaintext workspace for sealed files (11.2)
  fixtures/                    Fake fx. content for the mock backend and tests (ARCHITECTURE 5.6)
  batches.json                 (guide) The batch register (11.3)
  datasets/manifest.json       (guide) Pinned datasets (9.5.1); the files live in .cache/datasets/ (gitignored)
  reference/myths.json         (guide) Known false "facts" every claim is screened against
  reference/spelling.json      (guide) US to Oxford spelling pairs and the proper-noun allowlist (lint C10)
  reference/stopwords.json     (guide) Words the giveaway lint ignores (lint C12)
  reference/superlatives.json  (guide) The superlative words C19 and C26 look for
  reference/capitals-excluded.json  (guide) Countries with no single, settled capital, each with its reason (3.4, lint C27)
  reference/units.json         (guide) Exact unit definitions for calculations, and the measured-unit list (9.5.4, lint C15)
  reference/example-denylist.json   (guide) This guide's mystery answers and encore values, barred from v1 Dailies (lint C22)
  calibration/                 (guide) Estimator output and weekly re-tune reports, by item id only
  answer-lists/_wikidata/      (ENR-1) Enrichment job output, never edited by hand
.cache/                        Git-ignored: packets/, audits/<audit-id>/ (planted items), datasets/<key>/
```

ARCHITECTURE §2.1 also lists `compositions.json`, `safety/`, `names/`, `category-pages/` and `monthly-packs.json`, which other teams own, and `OPS.md`, the weekly content run's runbook (CNT-3), which whoever runs that run follows.

### 11.2 Sealed content stays out of git in plain text

The repository is public: its raw files were readable without credentials when checked on 31 October 2026. Anything committed is published, and a single plaintext mystery would hand out a Daily answer (constraint 4; PRD §8.4). ARCHITECTURE §5.4 settles the mechanism: sealed files are AES-256-GCM envelopes in `content/sealed/`, plaintext lives only in the git-ignored `content/.sealed-plain/`, and releases reach Postgres through MCP.

- **The guard.** Before writing any sealed file, run `git check-ignore -q content/.sealed-plain/probe.json`. If it fails, stop and tell the editor. It failed when this guide was first written and passed on 31 October 2026 once the `.gitignore` entry landed, but run it anyway: a later edit to `.gitignore` could undo it.
- **The key-escrow check comes first.** Sealed work starts only after it passes: the content key exists outside the repository, a copy sits in `private.key_escrow`, and the copy read back through MCP decrypts every envelope with `npm run content:unseal -- --verify` (ARCHITECTURE §5.4). The key file lives only in the sandbox, so until the escrow is proven, losing the sandbox would take the key and, with it, every envelope ever sealed. Practice items and answer lists don't wait.
- **The workflow.** `npm run content:unseal` decrypts into `content/.sealed-plain/`. Writers and checkers work there. At the end of every pipeline step for a sealed batch (§0.3), run `npm run content:seal`, which encrypts every changed file back into `content/sealed/`, and the orchestrator commits the envelopes, because the workspace dies with the sandbox. Never copy plaintext anywhere else, including the scratchpad, logs, messages or commit text.
- **Messages.** `content:check` and the lint print only the item id, the rule code and the field path for a sealed file (ARCHITECTURE §5.4's output rule). Sealed lint output is never pasted into a pull request, an issue or a commit message, not even after redacting it by hand: the `content-sealed` job's logs are public, and so is everything posted to GitHub.
- **Nothing public points at sealed content.** Plaintext files never name a sealed id: a practice item whose nearest duplicate is sealed records `nearestId` as `"sealed"` (§9.8). A list entry's `source` never names a mystery, a mystery batch or a list request, and list requests themselves are sealed (§2.12). List additions land in their own commits of at least 100 entries, never in a commit that adds or changes sealed envelopes (§2.10, rule 5): a commit that added 20 entities beside a new mystery batch's envelopes would narrow that batch's answers to those 20.
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
| `plan` | Planned counts by difficulty and format, or by slot and answer type (§11.4) |
| `accepted`, `cut` | Counts at close |
| `lastSequence` | Highest sequence number issued; IDs above it are invalid |
| `searchCaps` + | Search caps by role (`writer`, `A`, `B`), set by the editor at opening (§9.5.2) |
| `searchesUsed` + | Searches by role, summed from the check records, plus tiebreaks and follow-ups |
| `highRiskClaims` + | High-risk claims in the merged claim lists of the batch's accepted items, counted at close |
| `externallyEvidenced` + | How many of those carry dataset, web or calculation evidence in a confirming check. The two counts must match before the batch closes. A batch whose share of high-risk claims sits well below its pool's spike figure gets the auditor's look for under-labelling |
| `bandCounts` + | Practice batches, after estimation: accepted items per band by `predicted.p` (§11.4) |
| `typeCounts` + | Mystery batches: accepted items per answer type, against the category's quota (§11.4) |
| `measuredEncores` + | Encore batches: accepted encores with a length, area, mass or speed unit, at most 1 (§6, rule 3) |
| `approvals` + | Anything the owner approved for this batch, such as copying licensed data into a shipped file (§9.5.1) |
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

Writers plan by `seededDifficulty` (1 and 2 easy, 3 and 4 medium, 5 hard, §8.2), but the product bands by predicted *p* (PRD §3.3.3), and the estimator often disagrees with the writer. So once a batch is estimated, the editor records its band counts by *p* in the register (`bandCounts`) and reassigns items to plan cells by *p*, as §8.5 already does for mystery slots. Before launch every category must hold, by *p*, 44 to 56 Easy, 44 to 56 Medium and 20 to 31 Hard items: PRD AC-CNT-04's 40/40/20 split within 5 points on 125 items, with the Hard floor raised to 20 so a Hard run of 10 never runs dry in two sessions. Scale the counts to a category's real size. Top-up batches fill any band below its floor before anything else, Hard first. Each practice batch covers at least four of its category's subtopics, and no subtopic takes more than 30% of a category. About a quarter of each batch is counterintuitive.

**Mysteries: 36 batches of 10, three per category.** Three slot templates: A is 4 easy, 3 medium and 3 hard; B is 3, 4 and 3; C is 3, 3 and 4. Each category gets all three, which totals 10 per slot per category, and each wave totals 40 per slot.

| Categories | `m.<cat>.b01` | `m.<cat>.b02` | `m.<cat>.b03` |
|---|---|---|---|
| `geo`, `hist`, `sci`, `nat` | A | B | C |
| `film`, `music`, `art`, `book` | B | C | A |
| `sport`, `food`, `lang`, `soc` | C | A | B |

A mystery batch uses at least two answer types wherever its category allows more than one, and no answer is repeated anywhere in the bank. Draft 12 to land 10.

**Answer-type quotas.** No type may hold more than 4 of the 21 mystery slots in any 7 Dailies (§10.4), which caps any one type near 70 of the 360, and `person` is open to eight categories, so unplanned writing would overshoot it. The bank therefore follows this plan, which sums to 30 per category and 360 in all. Batches stay within 2 of each figure, the register tracks the running totals (`typeCounts`), and the solver checks them after every wave (§10.5).

| Category | Answer types (of 30) |
|---|---|
| Geography | country 12, city 10, landmark 8 |
| History | person 8, city 8, country 7, landmark 7 |
| Science & Tech | element 20, person 10 |
| Nature & Animals | animal 24, landmark 6 |
| Film & TV | film 18, person 6, tv_series 6 |
| Music | music_artist 24, city 6 |
| Art & Design | landmark 19, person 11 |
| Books & Literature | book 22, person 8 |
| Sport & Games | sport 15, country 6, person 5, city 4 |
| Food & Drink | dish 20, country 6, city 4 |
| Language & Words | country 6, city 4, animal 4, dish 4, person 3, element 3, film 2, book 2, sport 2 |
| Society & Culture | country 7, person 6, city 5, landmark 4, sport 4, dish 4 |

| Type | Plan | Floor | Ceiling |
|---|---|---|---|
| `person` | 57 | 50 | 60 |
| `country` | 44 | 38 | 50 |
| `landmark` | 44 | 38 | 50 |
| `city` | 41 | 35 | 50 |
| `animal` | 28 | 24 | 35 |
| `dish` | 28 | 24 | 35 |
| `book` | 24 | 20 | 30 |
| `music_artist` | 24 | 20 | 30 |
| `element` | 23 | 18 | 25 |
| `sport` | 21 | 16 | 25 |
| `film` | 20 | 16 | 30 |
| `tv_series` | 6 | 4 | 10 |

The ceilings stop any type crowding the week rules; small lists get low ones because their recognizable answers run out first (a list of 118 elements holds perhaps 40 that most adults would know among four options). The floors keep enough types in play for three different answer types a day and no more than 4 of one in a week.

**Encores: 12 batches of 10, two categories of five each.** IDs run `e.0101` to `e.1210`. At most 3 year-kind encores per batch, 30 in all, and at most 1 measured encore (a length, area, mass or speed) per batch, 12 in all (§6, rule 3).

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
| `element` | 118 | `l.element.b01` | All 118 confirmed elements, written by the list builder from IUPAC's published periodic table (names, symbols and numbers) and checked fact by fact against `ptable`, so no CC BY-SA data ships (§9.5.1) |
| `city` | 300 | `l.city.b01` to `b03` | By continent, checked against `geonames-cities` |
| `person` | 1,000 | `l.person.b01` to `b10` | Science and invention; exploration; history and politics before 2001; art and architecture (with MoMA's QID as the id wherever `moma-artists` carries one); literature; film and TV; sport; philosophy and religion; society and economics; a mixed batch of famous names |
| `film` | 500 | `l.film.b01` to `b05` | By decade and region |
| `tv_series` | 200 | `l.tv_series.b01` to `b02` | By region |
| `book` | 300 | `l.book.b01` to `b03` | Classics, world literature, children's books |
| `animal` | 300 | `l.animal.b01` to `b03` | Land, sea, air and fresh water, every continent |
| `landmark` | 200 | `l.landmark.b01` to `b02` | Built, then natural |
| `music_artist` | 500 | `l.music_artist.b01` to `b05` | Composers; pop and rock by decade; music from beyond the US and UK |
| `dish` | 200 | `l.dish.b01` to `b02` | Dishes, then drinks |
| `sport` | 100 | `l.sport.b01` | Sports, then games of every kind |

Lists keep growing toward their targets after launch, in versions of 100 or more entries, or whatever remains to the target (§2.10, rule 5).

### 11.5 Waves

Content production runs beside the build from week one (PRD §9.3).

| Wave | Lands by | Practice | Mysteries | Encores | Rooms | Lists and tooling |
|---|---|---|---|---|---|---|
| 0 | M2's first build wave (ARCHITECTURE Wave 3) | | | | | Schemas, validator and lint, the staged packet tool, dataset manifest, reference files and batch register (CNT-1 and CNT-2, Wave 3); the sealed-storage mechanism and the key-escrow check (§11.2) earlier, from CNT-0 in Wave 1; country and element lists complete |
| 1 | M2 exit | `p.<cat>.b01` and `b02` in every category: 600 items | `m.<cat>.b01` in every category: 120, which is 40 Dailies' worth | `e.b01` to `e.b04`: 40 | | Every list at 100 or more entries, covering every wave 1 mystery through regular versions committed apart from any envelopes (§11.2); the solver's first run |
| 2 | M4 exit | `b03` and `b04`: 600 | `b02`: 120 | `e.b05` to `e.b08`: 40 | All eight packs: 120 | Lists growing toward their minimums; the solver's second run |
| 3 | M5 | `b05` plus top-ups: 300 | `b03`: 120 | `e.b09` to `e.b12`: 40 | Replacements | Every list at its minimum; the solver's full-pool run before wave 3's writing ends; band floors met by *p*; the seeded audit; 100 Dailies and 20 spare sets scheduled, with pass D ahead of each freeze |

Wave 1 covers the M2 exit criterion of 30 scheduled Dailies and 600 practice items through the full process (PRD §9.3), with room to spare.

### 11.6 Throughput

The M1 content spike measures verified items per agent-day for each type (PRD §9.3, SYNTHESIS §7.1), and, by pool, the high-risk claims per item that no dataset covers, which sets the search caps (§9.5.2). Waves are sized from those figures. If throughput falls short, shrink practice first and never the protocol, and never go below 100 practice items per category.

---

## 12. Worked examples

### 12.0 How to read them

- **They are teaching material, not bank content.** Their IDs use the reserved batch 00 (room questions use sequences 90 to 99), which the validator rejects anywhere under `content/`, and the dedupe check reads this guide, so none can slip into the bank. They are public, so no mystery or encore like them may ever be scheduled: lint C22 makes a sealed near-copy of a §12 example an error, and `content/reference/example-denylist.json` bars the ten §12.7 answers and the ten §12.9 encore values from v1 Dailies.
- **Each GOOD example is a complete writer submission:** every field a writer fills, claims included, except `selfCheck`, which is the same eleven `true` codes on every submission (§2.3) and is left out to save space. A real submission without it is refused. `verification` is missing because writers never fill it; §12.15 shows a filled one. Entity ids are the ones a list builder would mint (§2.12): a real writer copies them from the published list file.
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
  "explanation": "Sydney and Melbourne both wanted the title, so the constitution put the capital on land granted by New South Wales, at least 100 miles (about 160 km) from Sydney.",
  "learnMore": "Canberra",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "counterintuitive", "text": "Canberra is the capital of Australia."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Sydney, Melbourne and Perth are state capitals, not the national capital."},
    {
      "id": "c3",
      "role": "explanation",
      "risk": "high",
      "riskReason": "number",
      "text": "Section 125 of the Australian Constitution requires the seat of government to be on territory in New South Wales granted to the Commonwealth, at least 100 miles from Sydney."
    },
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Sydney and Melbourne were rivals to be the national capital."},
    {"id": "c5", "role": "explanation", "risk": "high", "riskReason": "number", "text": "100 miles is about 160 km."}
  ],
  "writerNotes": "c1 checked in mledoze-countries (cca3=AUS, capital); as a capital key it also needs a Tier A or B web result (§3.4). Sydney is the obvious wrong pick, so counterintuitive is true, which makes c1 high under C26. c5 is a pure conversion, so a calculation can confirm it (§9.5.4)."
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
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "counterintuitive", "text": "The ruins of ancient Carthage are in Tunisia, near Tunis."},
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
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "number", "text": "An octopus has three hearts."},
    {"id": "c2", "role": "distractor", "risk": "high", "riskReason": "number", "text": "An octopus does not have one, two or eight hearts."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Two branchial hearts pump blood through the gills, and one systemic heart pumps it round the body."},
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
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "date", "text": "Spirited Away (2001) was made by Studio Ghibli."},
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
  "reviewBy": null,
  "seededDifficulty": 2,
  "counterintuitive": false,
  "stem": "Which artist painted The Persistence of Memory (1931), with its melting clocks?",
  "answer": "Salvador Dalí",
  "wrong": ["René Magritte", "Joan Miró", "Max Ernst"],
  "order": "shuffle",
  "explanation": "The famous canvas is small, only about 24 by 33 cm. New York's Museum of Modern Art has held it since 1934.",
  "learnMore": "The Persistence of Memory",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "date", "text": "Salvador Dalí painted The Persistence of Memory in 1931."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Magritte, Miró and Ernst did not paint The Persistence of Memory."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "number", "text": "The painting measures about 24 by 33 cm."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "date", "text": "The Museum of Modern Art in New York has held the painting since 1934."}
  ],
  "writerNotes": "Volatility is slow because c4 depends on where the painting is kept, so reviewBy stays null until the editor sets it at acceptance; I suggest the full 24 months. Artist records checked in moma-artists (ConstituentID 1364)."
}
```
Why it works: four real Surrealists, a surprising size, and a `slow` volatility class, which gets a review date at acceptance because a location can change.

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
  "stem": "Which novel's first chapter opens with the line 'Call me Ishmael'?",
  "answer": "Moby-Dick",
  "wrong": ["Treasure Island", "Robinson Crusoe", "The Old Man and the Sea"],
  "order": "shuffle",
  "explanation": "Herman Melville's 1851 novel sold poorly, and he died in 1891 largely forgotten as a novelist. Its reputation took off in the 1920s.",
  "learnMore": "Moby-Dick",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "quotation", "text": "The first chapter of Moby-Dick opens with the sentence 'Call me Ishmael.'"},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "None of Treasure Island, Robinson Crusoe and The Old Man and the Sea is narrated by a character called Ishmael."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Moby-Dick was published in 1851 and sold poorly."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Melville died in 1891, largely forgotten as a novelist."},
    {"id": "c5", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Interest in Melville revived strongly in the 1920s."}
  ],
  "writerNotes": "The stem says 'first chapter' because the book itself opens with its Etymology and Extracts sections; the famous line opens Chapter 1, Loomings."
}
```
Why it works: every distractor is another famous sea story, so knowing "it's about the sea" isn't enough, and the stem is worded for the pedant who has read the Extracts.

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
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Each saffron crocus flower has three stigmas, harvested by hand."},
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
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "counterintuitive", "text": "The Great Wall cannot be seen from the Moon with the naked eye."},
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
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "date", "text": "The first crewed Moon landing was in 1969."}
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
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "number", "text": "Goldfish memory lasts far longer than three seconds."},
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
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "The International Date Line runs between Big Diomede and Little Diomede."}
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
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "counterintuitive", "text": "There is no evidence that Salieri poisoned Mozart."},
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
      "risk": "high",
      "riskReason": "date",
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
  "a": "Teaching at Oxford",
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
    {"id": "c1", "role": "label", "ref": "a", "risk": "high", "riskReason": "number", "text": "Gold's atomic number is 79."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "number", "text": "Mercury's atomic number is 80."},
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
  "volatility": "slow",
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
  "writerNotes": "Older shark-like scales of about 450 million years are disputed, so the item uses the undisputed figure, which still wins by about 30 million years. Volatility is slow because 'the oldest known trees' is a record a new fossil find can move; the editor sets reviewBy at acceptance."
}
```
Why it works: it uses the conservative figure for each side, so the answer holds under every date on offer, and the `slow` class makes sure somebody looks again before a new find can flip it.

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
  "exactDates": {"a": "1962-10-05", "b": "1963-11-23"},
  "explanation": "Doctor Who's first episode aired on 23 November 1963, the day after President Kennedy was shot, and the BBC showed it again a week later.",
  "learnMore": "Dr. No (film)",
  "claims": [
    {"id": "c1", "role": "label", "ref": "a", "risk": "high", "riskReason": "date", "text": "Dr. No premiered in London on 5 October 1962."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "date", "text": "Doctor Who's first episode aired on 23 November 1963."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "President Kennedy was shot on 22 November 1963."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "date", "text": "The BBC repeated the first episode a week later, before episode two."}
  ],
  "writerNotes": "Only a year apart, which the separation guard allows because exactDates records both documented days, 414 days apart, and c1 and c2 state them."
}
```
Why it works: two exact dates a year apart, each famous enough to reason about, and a reveal that ties the show to a moment in history.

```json
{
  "id": "p.sport.0002",
  "status": "draft",
  "format": "comparison",
  "category": "sport",
  "tags": ["tennis", "olympics"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": true,
  "stem": "Which came first?",
  "a": "The first Wimbledon Championships",
  "b": "The first modern Olympic Games",
  "answer": "a",
  "relation": "earlier",
  "measure": "year first held",
  "unit": "year",
  "values": {"a": 1877, "b": 1896},
  "valueDisplay": {"a": "July 1877", "b": "April 1896"},
  "explanation": "The All England Club held its first championship in July 1877, with men's singles only. The first modern Olympics opened in Athens in April 1896, 19 years later.",
  "learnMore": "Wimbledon Championships",
  "claims": [
    {"id": "c1", "role": "label", "ref": "a", "risk": "high", "riskReason": "date", "text": "The first Wimbledon Championships were held in July 1877."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "date", "text": "The first modern Olympic Games opened in Athens in April 1896."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "only", "text": "The All England Club's first championship, in 1877, had a men's singles event only."}
  ],
  "writerNotes": "Nineteen years apart, so no exactDates are needed. The ancient Games pull guesses toward the Olympics, which is why counterintuitive is true."
}
```
Why it works: the Olympic name carries an ancient pedigree, so most players pick it, and 19 years of margin keep the answer safe from any quibble about dates.

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
  "exactDates": {"a": "1886-10-28", "b": "1889-03-31"},
  "explanation": "Gustave Eiffel's company designed the iron framework inside the statue, dedicated in New York in 1886. His tower opened in Paris three years later, in 1889.",
  "learnMore": "Statue of Liberty",
  "claims": [
    {"id": "c1", "role": "label", "ref": "a", "risk": "high", "riskReason": "date", "text": "The Statue of Liberty was dedicated on 28 October 1886."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "date", "text": "The Eiffel Tower opened on 31 March 1889."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Gustave Eiffel's company engineered the statue's internal iron framework."}
  ],
  "writerNotes": "Three years apart, which the separation guard allows because exactDates records both documented days and c1 and c2 state them."
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
    {"id": "c1", "role": "label", "ref": "a", "risk": "high", "riskReason": "number", "text": "The modern Greek alphabet has 24 letters."},
    {"id": "c2", "role": "label", "ref": "b", "risk": "high", "riskReason": "number", "text": "The modern Russian alphabet has 33 letters."},
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
    {"id": "c2", "role": "clue", "ref": "clue:1", "risk": "high", "riskReason": "date", "text": "James Cameron wrote and directed Titanic, and it was released in 1997."},
    {"id": "c3", "role": "clue", "ref": "clue:2", "risk": "high", "riskReason": "number", "text": "Titanic won 11 Academy Awards, including Best Picture."},
    {"id": "c4", "role": "clue", "ref": "clue:3", "risk": "high", "riskReason": "sealed_pool", "text": "Céline Dion sang Titanic's theme song, My Heart Will Go On."},
    {"id": "c5", "role": "clue", "ref": "clue:4", "risk": "high", "riskReason": "sealed_pool", "text": "In Titanic, Leonardo DiCaprio and Kate Winslet play lovers aboard a liner on its doomed maiden voyage."},
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Avatar, Pearl Harbor and The Poseidon Adventure each contradict clues 1 and 2."},
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
    "Its singer was born Farrokh Bulsara in Zanzibar.",
    "In 1975 it released a nearly six-minute single with an operatic middle section.",
    "It played a set of about 20 minutes at Live Aid at Wembley Stadium in 1985.",
    "This British rock group recorded both We Will Rock You and We Are the Champions."
  ],
  "distractors": ["x.music_artist.the-rolling-stones", "x.music_artist.led-zeppelin", "x.music_artist.the-who"],
  "slot": 1,
  "sourceLabels": [],
  "likelyGuesses": [
    "x.music_artist.freddie-mercury",
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
    {"id": "x.music_artist.freddie-mercury", "ruledOutBy": [1]},
    {"id": "x.music_artist.the-who", "ruledOutBy": [1, 2]},
    {"id": "x.music_artist.u2", "ruledOutBy": [1, 2]},
    {"id": "x.music_artist.david-bowie", "ruledOutBy": [1, 2]}
  ],
  "giveawayTerms": [],
  "seedSolveShares": [0.5, 0.8, 0.93, 0.99],
  "explanation": "Guitarist Brian May finished a PhD in astrophysics in 2007, more than 30 years after pausing his studies when the band took off.",
  "learnMore": "Queen (band)",
  "claims": [
    {"id": "c1", "role": "uniqueness", "risk": "standard", "text": "Queen is the only music artist in the list that fits clues 1 to 3."},
    {"id": "c2", "role": "clue", "ref": "clue:1", "risk": "high", "riskReason": "sealed_pool", "text": "Queen's singer was born Farrokh Bulsara in Zanzibar."},
    {
      "id": "c3",
      "role": "clue",
      "ref": "clue:2",
      "risk": "high",
      "riskReason": "date",
      "text": "In 1975 Queen released a nearly six-minute single (Bohemian Rhapsody) with an operatic middle section."
    },
    {
      "id": "c4",
      "role": "clue",
      "ref": "clue:3",
      "risk": "high",
      "riskReason": "number",
      "text": "Queen played a set of about 20 minutes at Live Aid at Wembley Stadium in 1985."
    },
    {
      "id": "c5",
      "role": "clue",
      "ref": "clue:4",
      "risk": "high",
      "riskReason": "sealed_pool",
      "text": "Queen, a British rock group, recorded both We Will Rock You and We Are the Champions."
    },
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "The Rolling Stones, Led Zeppelin and The Who each contradict clues 1, 2 and 4."},
    {
      "id": "c7",
      "role": "explanation",
      "risk": "high",
      "riskReason": "date",
      "text": "Brian May completed a PhD in astrophysics in 2007, decades after pausing his studies."
    }
  ],
  "writerNotes": "Clue 1 names nobody, but 'Farrokh Bulsara' is an alias of Freddie Mercury's own music_artist entry, so rule 15 applies: 'Its singer' makes plain he isn't the answer, and he sits in likelyGuesses and rivals, ruled out by clue 1. Clue 2 says 'In 1975 it released' rather than 'Its 1975 single', because Queen released more than one single that year. Reports of the Live Aid set run from 20 to 22 minutes, hence 'about 20'. Display is 'Queen' without '(band)': no other entry in the music list shares the name, and a bracket only on the key would stand out among the clue-4 options."
}
```
Why it works: the singer's own entry sits among the rivals because clue 1 points at him, three Live Aid acts make clue 3 alone not enough, and the display form stays parallel with the distractors.

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
    "Astronomers spotted it in sunlight during an 1868 eclipse, 27 years before chemists isolated it on Earth.",
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
      "text": "Astronomers spotted helium in sunlight during an 1868 eclipse, 27 years before chemists isolated it on Earth."
    },
    {
      "id": "c3",
      "role": "clue",
      "ref": "clue:2",
      "risk": "high",
      "riskReason": "only",
      "text": "Helium stays liquid at normal pressure even at absolute zero, the only element that does."
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
      "risk": "high",
      "riskReason": "sealed_pool",
      "text": "Helium, a light gas, makes party balloons float and gives voices a squeaky sound."
    },
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Hydrogen, neon and argon each contradict clues 1, 2 and 3."},
    {"id": "c7", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "The name helium comes from the Greek helios, the Sun."},
    {"id": "c8", "role": "explanation", "risk": "standard", "text": "Most of Earth's helium forms through radioactive decay underground and is extracted from natural gas."}
  ],
  "writerNotes": "Clue 1 says 'isolated', not 'found': common references credit Luigi Palmieri with seeing helium's spectral line in Vesuvius lava in 1881 to 1882, so 'found on Earth' 27 years after 1868 would be contestable, while chemists isolating it in 1895 isn't. Clue 3 names hydrogen, which sits in likelyGuesses and rivals (rule 15)."
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
      "text": "Mehmed II made Istanbul (then Constantinople) his capital after his army captured it in 1453."
    },
    {"id": "c3", "role": "clue", "ref": "clue:2", "risk": "high", "riskReason": "date", "text": "Istanbul's Hagia Sophia was completed in 537 as a Christian cathedral."},
    {
      "id": "c4",
      "role": "clue",
      "ref": "clue:3",
      "risk": "high",
      "riskReason": "sealed_pool",
      "text": "Istanbul straddles Europe and Asia on either side of the Bosporus strait."
    },
    {
      "id": "c5",
      "role": "clue",
      "ref": "clue:4",
      "risk": "high",
      "riskReason": "sealed_pool",
      "text": "Istanbul, a city on the Bosporus, is home to the Grand Bazaar and the Blue Mosque."
    },
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
  "likelyGuesses": ["Q171128", "Q46408", "Q233207", "x.person.remedios-varo", "x.person.tamara-de-lempicka", "x.person.maria-izquierdo"],
  "rivals": [
    {"id": "Q171128", "ruledOutBy": [1, 3]},
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
      "riskReason": "number",
      "text": "A bus crash at 18 left Frida Kahlo with lifelong injuries, and she began painting while recovering in bed."
    },
    {
      "id": "c3",
      "role": "clue",
      "ref": "clue:2",
      "risk": "high",
      "riskReason": "date",
      "text": "Frida Kahlo's family home in Coyoacán, the Blue House, opened as a museum in 1958."
    },
    {"id": "c4", "role": "clue", "ref": "clue:3", "risk": "high", "riskReason": "sealed_pool", "text": "Frida Kahlo married the muralist Diego Rivera twice."},
    {
      "id": "c5",
      "role": "clue",
      "ref": "clue:4",
      "risk": "high",
      "riskReason": "sealed_pool",
      "text": "Frida Kahlo, a Mexican painter, is known for self-portraits with joined eyebrows and flowers in her hair."
    },
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Georgia O'Keeffe, Tamara de Lempicka and Leonora Carrington each contradict clues 1, 3 and 4."},
    {"id": "c7", "role": "explanation", "risk": "standard", "text": "Kahlo and Rivera lived in connected studio-houses in San Ángel, joined by a bridge."},
    {"id": "c8", "role": "explanation", "risk": "standard", "text": "Kahlo's work drew on Mexican folk art, including retablos."}
  ],
  "writerNotes": "Distractors are all women painters of the same era, because the clues say 'she'. Clue 3 names Diego Rivera, whose own entry is in likelyGuesses and rivals: 'She married' makes plain he isn't the answer, and clue 1's 'her' rules him out too (rule 15). Every id with a QID comes from moma-artists, which carries one for Kahlo (ConstituentID 2963, Q5588), Rivera (4942, Q171128), O'Keeffe (4360, Q46408) and Carrington (993, Q233207); MoMA has no QID for Remedios Varo and no record for Lempicka or Izquierdo, so those keep x. ids."
}
```
Why it works: the distractors match the clue's pronoun, era, field and fame, so clue 4 still asks for knowledge; the husband the clues name is a rival, not a trap; and the category comes from the clue angle (art), not the list (person).

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
      "text": "Frankenstein's author began it aged 18, during a ghost-story contest at a villa by Lake Geneva in 1816."
    },
    {"id": "c3", "role": "clue", "ref": "clue:2", "risk": "high", "riskReason": "date", "text": "Frankenstein was first published anonymously in London on 1 January 1818."},
    {
      "id": "c4",
      "role": "clue",
      "ref": "clue:3",
      "risk": "high",
      "riskReason": "sealed_pool",
      "text": "Frankenstein's subtitle names the Titan (Prometheus) who stole fire from the gods for humankind."
    },
    {
      "id": "c5",
      "role": "clue",
      "ref": "clue:4",
      "risk": "high",
      "riskReason": "sealed_pool",
      "text": "In Frankenstein, a Gothic novel, a young scientist builds a living creature and then abandons it."
    },
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Dracula, The Picture of Dorian Gray and The Invisible Man each contradict clues 1, 2 and 3."},
    {"id": "c7", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Mary Shelley was 20 when Frankenstein was published."},
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
  "likelyGuesses": ["x.sport.draughts", "x.sport.shogi", "x.sport.xiangqi", "x.sport.chaturanga", "x.sport.go", "x.sport.backgammon", "x.sport.mahjong"],
  "rivals": [
    {"id": "x.sport.shogi", "ruledOutBy": [1, 3]},
    {"id": "x.sport.xiangqi", "ruledOutBy": [1, 3]},
    {"id": "x.sport.chaturanga", "ruledOutBy": [2, 3]},
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
      "riskReason": "superlative",
      "text": "Chess's most powerful piece gained its long-range moves in Europe in the late 1400s."
    },
    {
      "id": "c3",
      "role": "clue",
      "ref": "clue:2",
      "risk": "high",
      "riskReason": "date",
      "text": "Chess grew from chaturanga, a game played in India by about the 6th century."
    },
    {"id": "c4", "role": "clue", "ref": "clue:3", "risk": "high", "riskReason": "date", "text": "In 1997 IBM's Deep Blue computer beat world champion Garry Kasparov at chess."},
    {
      "id": "c5",
      "role": "clue",
      "ref": "clue:4",
      "risk": "high",
      "riskReason": "number",
      "text": "In chess, players move kings, queens, bishops and knights on a board of 64 squares."
    },
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Draughts, shogi and go each contradict clues 1, 3 and 4."},
    {"id": "c7", "role": "explanation", "risk": "high", "riskReason": "number", "text": "In chaturanga the counsellor, the queen's forerunner, moved one square diagonally."},
    {"id": "c8", "role": "explanation", "risk": "high", "riskReason": "quotation", "text": "The new form of the game was nicknamed 'mad queen' chess."}
  ],
  "writerNotes": "Shogi and xiangqi also descend from chaturanga, so clue 2 alone is not unique; clue 1 and clue 3 rule them out. Clue 2 names chaturanga, which has its own entry in the sport list, so it sits in likelyGuesses and rivals: 'grew from' makes plain it isn't the answer (rule 15)."
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
  "volatility": "slow",
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
      "text": "Mongolia's capital has the coldest average yearly temperature of any national capital."
    },
    {"id": "c3", "role": "clue", "ref": "clue:2", "risk": "high", "riskReason": "sealed_pool", "text": "The Gobi Desert covers much of Mongolia's southern half."},
    {
      "id": "c4",
      "role": "clue",
      "ref": "clue:3",
      "risk": "high",
      "riskReason": "date",
      "text": "Genghis Khan united Mongolia's tribes in 1206 and began an empire from there."
    },
    {
      "id": "c5",
      "role": "clue",
      "ref": "clue:4",
      "risk": "high",
      "riskReason": "only",
      "text": "Many herders in Mongolia live in round felt tents called gers, and Mongolia's only neighbours are Russia and China."
    },
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Kazakhstan, Kyrgyzstan and Nepal each contradict clues 1, 3 and 4."},
    {"id": "c7", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Ulaanbaatar lies about 1,350 metres above sea level."},
    {"id": "c8", "role": "explanation", "risk": "standard", "text": "Kazakhstan borders Russia, China, Kyrgyzstan, Uzbekistan and Turkmenistan."}
  ],
  "writerNotes": "Borders checked in mledoze-countries: MNG borders CHN and RUS; KAZ borders CHN, KGZ, RUS, TKM and UZB. The same file spells the capital 'Ulan Bator', so the city list carries both spellings. Volatility is slow because clue 1 is a climate record, which a warming trend could one day shift; the editor sets reviewBy at acceptance, and the item can't be scheduled on or after it. Clue 4 names Russia and China, both in likelyGuesses and rivals (rule 15)."
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
    "It is native to the lakes of the basin where the Aztecs built their capital, Tenochtitlan.",
    "It keeps its feathery external gills as an adult instead of changing form like most salamanders.",
    "It can regrow lost limbs, and even parts of its heart and brain.",
    "In 2021 Mexico put this smiling salamander on a new 50-peso banknote."
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
      "riskReason": "sealed_pool",
      "text": "The axolotl is native to the lakes of the basin where the Aztecs built their capital, Tenochtitlan."
    },
    {
      "id": "c3",
      "role": "clue",
      "ref": "clue:2",
      "risk": "high",
      "riskReason": "sealed_pool",
      "text": "The axolotl keeps its feathery external gills as an adult instead of changing form like most salamanders."
    },
    {"id": "c4", "role": "clue", "ref": "clue:3", "risk": "high", "riskReason": "sealed_pool", "text": "The axolotl can regrow lost limbs, and even parts of its heart and brain."},
    {"id": "c5", "role": "clue", "ref": "clue:4", "risk": "high", "riskReason": "date", "text": "In 2021 Mexico put the axolotl, a smiling salamander, on a new 50-peso banknote."},
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "The olm, the fire salamander and the Chinese giant salamander each contradict clues 1 and 4."},
    {"id": "c7", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "The word axolotl comes from Nahuatl and is often linked to the god Xolotl."},
    {"id": "c8", "role": "explanation", "risk": "standard", "text": "Axolotls regenerate tissue without scarring, which makes them important in research."}
  ],
  "writerNotes": "Clue 1 gives the native range, which can't change, not where the animal survives in the wild today, which conservation keeps changing (§1.4). The aliases 'Mexican walking fish' and 'ajolote' stay out of every clue, and so does the word 'Mexico' in clues 1 to 3: typing it surfaces 'Mexican walking fish', since 'mexica' is one letter from 'mexico', and C12's suggestion probe fails on that. Clue 4 may say Mexico while optionsFromClue is 3 or 4, because players pick from options there. 'Often pink' is gone from clue 4: wild axolotls are mostly dark, so the phrase would need evidence of its own and tells players nothing they need. The olm keeps its gills too, which makes it the expert's distractor."
}
```
Why it works: clues 2 and 3 fit other salamanders as well (the olm keeps its gills, and many salamanders regrow limbs), clues 1 and 4 fit only one, and both the native range and the dated banknote are facts that can't go stale.

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
      "text": "In 2013 UNESCO listed the custom of families making kimchi together each autumn as intangible heritage."
    },
    {
      "id": "c3",
      "role": "clue",
      "ref": "clue:2",
      "risk": "high",
      "riskReason": "sealed_pool",
      "text": "Kimchi is made by salting and fermenting vegetables, most often Chinese cabbage and radish."
    },
    {"id": "c4", "role": "clue", "ref": "clue:3", "risk": "high", "riskReason": "sealed_pool", "text": "Kimchi's red colour usually comes from gochugaru, dried chilli flakes."},
    {"id": "c5", "role": "clue", "ref": "clue:4", "risk": "high", "riskReason": "sealed_pool", "text": "Kimchi, a spicy fermented cabbage, is served with almost every Korean meal."},
    {"id": "c6", "role": "distractor", "risk": "standard", "text": "Sauerkraut, bibimbap and tteokbokki each contradict clues 1 and 2."},
    {"id": "c7", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Chilli peppers reached Korea around the late 16th century."},
    {"id": "c8", "role": "explanation", "risk": "high", "riskReason": "number", "text": "There are hundreds of kinds of kimchi, made from vegetables including radish and cucumber."}
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
  "unitShort": "times",
  "unitLabel": "times Earth's volume",
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
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "number", "text": "The Sun's radius is about 109 times Earth's."}
  ],
  "writerNotes": "The round anchor, 1 million, is 30% off, outside the bullseye. '1.3 million Earths' is a stock figure, so some players will know it exactly; the estimator's exact share decides whether too many do (rule 6)."
}
```
Why it works: a derived number players can reason toward from the 109-times radius, with the arithmetic in the record and an explanation that teaches the cube rule. It isn't lookup-resistant ("1.3 million Earths" is a stock answer), and rule 7 doesn't ask it to be.

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
  "seededDifficulty": 4,
  "counterintuitive": false,
  "question": "How many days would it take to walk once around the Equator at 5 km (3 miles) an hour, without stopping?",
  "valueKind": "quantity",
  "answer": 334,
  "decimals": 0,
  "unit": "days",
  "unitShort": "days",
  "unitLabel": "days",
  "bands": null,
  "sourceLabels": [],
  "derivation": {
    "formula": "40,075 km / 5 km an hour / 24 hours a day",
    "inputs": [
      {"claimId": "c2", "value": 40075, "unit": "km", "what": "Earth's equatorial circumference"}
    ],
    "unrounded": 333.96,
    "rounding": "nearest whole day"
  },
  "explanation": "At 5 km an hour, day and night, the 40,075 km (24,900-mile) loop takes about 8,000 hours. Walking 8 hours a day instead, it would take nearly two years and nine months.",
  "learnMore": "Equator",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "number", "text": "Walking nonstop at 5 km an hour, one trip around the Equator would take about 334 days."},
    {"id": "c2", "role": "input", "risk": "high", "riskReason": "number", "text": "Earth's equatorial circumference is about 40,075 km."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "number", "text": "40,075 km is about 24,900 miles, and 5 km is about 3 miles."},
    {
      "id": "c4",
      "role": "explanation",
      "risk": "high",
      "riskReason": "number",
      "text": "At 5 km an hour, 40,075 km takes about 8,000 hours, which at 8 hours a day is nearly two years and nine months."
    }
  ],
  "writerNotes": "The likeliest round guess is a year, 365 days, which is 9.3% off: close, not a bullseye; 300 is 11% off. Players who know the Equator is about 40,000 km and do the sum reach 333, a bullseye they earned. Only the Equator's length is a fact to check, because the question supplies the speed. It gives that speed in both systems, so an imperial reasoner (24,900 miles at 3 miles an hour) lands on 346, within 4% (rule 3). c3 and c4 are conversions and arithmetic, so calculations confirm them (§9.5.4)."
}
```
Why it works: a duration every player estimates in the same unit, built on one stable constant, with the speed in both systems so metric and imperial reasoners start level (§6, rules 3 and 12). The final design's Encore screen asks the same question. Asked as "How long is the Equator, in kilometres?" it would fail twice: it favours players who think in metric, and the round guess of 40,000 is 0.2% off.

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
  "unitShort": "years",
  "unitLabel": "years",
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
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "quotation", "text": "The name 'Hundred Years' War' was given by later historians."}
  ],
  "writerNotes": "The naive guess, and the likeliest round one, is 100: 16% off under the symmetric error (116 / 100 - 1, PRD §4.2.2), just outside the close band. So the name's anchor earns nothing, and players who know the dates pull ahead."
}
```
Why it works: the name plants a round number that misses even the close band, so the reveal lands as a surprise.

```json
{
  "id": "e.0004",
  "kind": "encore",
  "status": "draft",
  "category": "sport",
  "tags": ["shogi", "puzzles"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 5,
  "counterintuitive": true,
  "question": "Counting every size from 1 by 1 up to 9 by 9, how many squares are on a shogi board?",
  "valueKind": "quantity",
  "answer": 285,
  "decimals": 0,
  "unit": "squares",
  "unitShort": "squares",
  "unitLabel": "squares",
  "bands": null,
  "sourceLabels": [],
  "derivation": {
    "formula": "9² + 8² + 7² + 6² + 5² + 4² + 3² + 2² + 1²",
    "inputs": [
      {"claimId": "c2", "value": 9, "unit": "squares per side", "what": "size of a shogi board"}
    ],
    "unrounded": 285,
    "rounding": "none"
  },
  "explanation": "There are 81 squares of 1 by 1, 64 of 2 by 2, 49 of 3 by 3 and so on: the square numbers from 81 down to 1 add up to 285.",
  "learnMore": "Shogi",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "number", "text": "A 9 by 9 board contains 285 squares of all sizes."},
    {"id": "c2", "role": "input", "risk": "high", "riskReason": "number", "text": "A shogi board is 9 squares by 9 squares."}
  ],
  "writerNotes": "The obvious answer, 81, is 252% off. The likeliest round guess, 300, is 5.3% off, just outside the bullseye. A shogi board, not a chessboard: 'a chessboard holds 204 squares' is a stock puzzle answer many players know exactly, and the round guess of 200 sits 2% from 204, inside the bullseye (rule 6). The question states the board's size, so no shogi knowledge is needed."
}
```
Why it works: a count anyone can work out in their head, an obvious answer (81) that is far off, and an explanation that shows the method. It isn't lookup-proof and doesn't need to be (rule 7): reasoning gets there as fast as a search.

```json
{
  "id": "e.0005",
  "kind": "encore",
  "status": "draft",
  "category": "nat",
  "tags": ["pigs", "teeth"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 4,
  "counterintuitive": false,
  "question": "How many teeth does an adult pig have?",
  "valueKind": "quantity",
  "answer": 44,
  "decimals": 0,
  "unit": "teeth",
  "unitShort": "teeth",
  "unitLabel": "teeth",
  "bands": null,
  "sourceLabels": [],
  "derivation": null,
  "explanation": "Adult pigs have 44 teeth, two more than an adult dog and 12 more than a full human set of 32, wisdom teeth included. Piglets start with 28 milk teeth.",
  "learnMore": "Pig",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "number", "text": "An adult pig normally has 44 teeth."},
    {"id": "c2", "role": "explanation", "risk": "high", "riskReason": "number", "text": "An adult dog normally has 42 teeth."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "number", "text": "A full adult human set, wisdom teeth included, is 32 teeth."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Piglets have 28 deciduous teeth."}
  ],
  "writerNotes": "The likeliest round guesses, 40 and 50, are 10% and 14% off: close, not bullseyes. A dog was the first choice, but its 42 teeth sit exactly 5% from a guess of 40, a bullseye for the round number (rule 6). Most players start from the human 32."
}
```
Why it works: a familiar animal and an unfamiliar number, with a human count every player can anchor on, and no round number inside the bullseye.

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
  "unitShort": "columns",
  "unitLabel": "columns",
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
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "The Parthenon's columns lean slightly inward, as part of its optical refinements."}
  ],
  "writerNotes": "The round guesses, 50 and 40, are 9% and 15% off: close, not bullseyes."
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
  "unitShort": "strings",
  "unitLabel": "strings",
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
  "writerNotes": "'Concert grand' pins the count: smaller pedal harps have fewer strings. The round guess, 50, is 6.4% off, outside the bullseye."
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
  "unitShort": "",
  "unitLabel": "",
  "bands": null,
  "sourceLabels": [],
  "derivation": null,
  "explanation": "Doubters nicknamed it 'Disney's Folly' during its years in production. It premiered in Los Angeles on 21 December 1937, and its profits helped pay for Disney's Burbank studio.",
  "learnMore": "Snow White and the Seven Dwarfs (1937 film)",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "date", "text": "Snow White and the Seven Dwarfs premiered in 1937."},
    {"id": "c2", "role": "explanation", "risk": "high", "riskReason": "quotation", "text": "Before release the film was nicknamed 'Disney's Folly'."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "It premiered in Los Angeles on 21 December 1937."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Profits from the film helped fund Disney's studio in Burbank."}
  ],
  "writerNotes": "The nearest decade, 1940, is 3 years off: close, not a bullseye. The nickname in c2 is a quotation, so it needs external evidence like any other."
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
  "unitShort": "",
  "unitLabel": "",
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
  ],
  "writerNotes": "The round anchors, 1750 and 1760, are both 5 years off: at the edge of the close band, outside the bullseye."
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
  "question": "In what year did the Michelin Guide award its first restaurant stars?",
  "valueKind": "year",
  "answer": 1926,
  "decimals": 0,
  "unit": "",
  "unitShort": "",
  "unitLabel": "",
  "bands": null,
  "sourceLabels": [],
  "derivation": null,
  "explanation": "Tyre makers André and Édouard Michelin gave the first guide away in 1900 to get people driving. Single stars arrived in 1926, and the three-star scale in the early 1930s.",
  "learnMore": "Michelin Guide",
  "claims": [
    {"id": "c1", "role": "value", "risk": "high", "riskReason": "first", "text": "The Michelin Guide awarded its first restaurant stars in 1926."},
    {
      "id": "c2",
      "role": "explanation",
      "risk": "high",
      "riskReason": "first",
      "text": "André and Édouard Michelin, who ran a tyre company, gave the first Michelin Guide away free in 1900 to encourage driving."
    },
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "date", "text": "The Michelin Guide's three-star scale was introduced in the early 1930s."}
  ],
  "writerNotes": "The decades either side, 1920 and 1930, are 6 and 4 years off: outside the bullseye. The obvious version, 'In what year was the first Michelin Guide published?', fails rule 6, because its answer, 1900, is itself the round guess."
}
```
Why it works: players reason forward from the age of motoring, the decades either side miss the bullseye (rule 6), and the link between tyres and fine dining is the surprise.

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
Why it works (`around-the-world`, position 3): a short stem a host can read in one breath, Jordan and three countries from the same region, and a 16-word reveal.

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
  "wrong": ["Euphrates", "Indus", "Nile"],
  "order": "shuffle",
  "explanation": "The Tigris and Euphrates frame Mesopotamia, 'the land between the rivers'. Baghdad stands on the Tigris; ancient Babylon stood on the Euphrates.",
  "learnMore": "Tigris",
  "claims": [
    {"id": "c1", "role": "key", "risk": "standard", "text": "Baghdad lies on the Tigris."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "The Euphrates, the Indus and the Nile do not flow through Baghdad."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "Mesopotamia means 'land between the rivers'."},
    {"id": "c4", "role": "explanation", "risk": "standard", "text": "Ancient Babylon stood on the Euphrates."}
  ]
}
```
Why it works (`around-the-world`, position 6): the Euphrates is the near miss, and the reveal hands the room a fact to argue about. The fourth option is the Indus, not the Jordan, because Jordan is the key of the Petra question earlier in the pack (§10.9).

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
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "date", "text": "Fans celebrate 4 May as Star Wars Day."}
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
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "date", "text": "The Beatles released Abbey Road in 1969."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "The Rolling Stones, the Kinks and the Who did not release Abbey Road."},
    {"id": "c3", "role": "explanation", "risk": "high", "riskReason": "etymology", "text": "The album is named after Abbey Road, the London street of the EMI studio where it was recorded."},
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
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "counterintuitive", "text": "A polar bear's skin is black."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "A polar bear's skin is not white, pink or grey."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Polar bear hairs are hollow and translucent, and look white because they scatter light."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "counterintuitive", "text": "Algae growing in the hollow hairs have turned zoo polar bears green."}
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
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "quotation", "text": "In tennis, a score of zero is called 'love'."},
    {"id": "c2", "role": "distractor", "risk": "high", "riskReason": "quotation", "text": "'Nil' (football), 'duck' (cricket) and 'zilch' are not tennis terms for zero."},
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
Why it works (`game-on`, position 7): two distractors are words for zero from other games and the third is everyday slang, so every option sounds like a score, and the explanation is honest about an uncertain origin rather than repeating a tidy story.

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
  "explanation": "Working at CERN near Geneva, he wanted physicists to share documents easily. CERN released the web's software free for anyone in 1993.",
  "learnMore": "Tim Berners-Lee",
  "claims": [
    {"id": "c1", "role": "key", "risk": "high", "riskReason": "date", "text": "Tim Berners-Lee proposed the World Wide Web at CERN in 1989."},
    {"id": "c2", "role": "distractor", "risk": "standard", "text": "Vint Cerf, Alan Turing and Bill Gates did not propose the World Wide Web."},
    {"id": "c3", "role": "explanation", "risk": "standard", "text": "Berners-Lee wanted a way for physicists to share documents."},
    {"id": "c4", "role": "explanation", "risk": "high", "riskReason": "date", "text": "CERN released the World Wide Web software free for anyone to use in 1993."}
  ],
  "writerNotes": "The explanation names a documented release, not 'the first website': sources split between December 1990, when CERN's first page was served, and August 1991, when the project was announced and opened to outsiders (§3.5)."
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
    "source": "l.element.b01",
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
    "name": "Association football",
    "display": "Association football",
    "aliases": ["Football", "Soccer", "Football (soccer)"],
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
| Aluminium | The IUPAC spelling, with the US spelling as an alias. The list builder wrote the entry from IUPAC's table and checked the number and symbol against `ptable`, so the source is the list batch and no CC BY-SA data ships (§9.5.1) |
| Angkor Wat, Cambodia | Landmarks always carry their country |
| Björk | Diacritics kept in the display; the full name as an alias |
| Gazpacho | A dish with one name in every English variety, so no aliases are needed |
| Association football | A display with no bracket, so it can stand among clue-4 options without pointing at itself, and every name players type as an alias, the §3.3 form included (§2.10) |

Every example carries `addedIn` equal to the `liveAt` of the version that added it, and that version's file wraps them as `{ "type", "version", "liveAt", "provenance", "entities" }` (§2.10).

### 12.14 Answer-list entries: five bad examples

1. **An alias list copied from a dataset.** `{"id": "x.country.czechia", "name": "Czechia", "aliases": ["CZ", "Česká republika", "Česko"]}`, taken from `mledoze-countries`.
   *Wrong:* no "Czech Republic", which many players type, and an ISO code ("CZ") that clutters suggestions. *Fix:* the CLDR variant as an alias, and ISO codes only where people really type them (UK, US, USA, UAE).
2. **An element that doesn't exist yet.** `{"id": "x.element.ununennium", "name": "Ununennium"}`, copied from `ptable`.
   *Wrong:* element 119 hasn't been discovered; the dataset holds a placeholder with a predicted phase and a named lab. *Fix:* the element list is the 118 confirmed elements.
3. **One person in two lists.** "Wolfgang Amadeus Mozart" in both `person.json` and `music_artist.json`.
   *Wrong:* a mystery's answer type decides which ID counts, so a player who picks the twin from the other list can never match. *Fix:* one entity, one list (§2.10, rule 1); Mozart belongs in `music_artist`.
4. **A Wikidata id typed from memory.** `{"id": "Q12345", "name": "..."}`, with the QID typed by a writer.
   *Wrong:* nobody can verify it, it may point at another entity, and it would corrupt suggestion ranking. Writers mint no ids at all. *Fix:* an id the list builder mints: the dataset's QID when the record carries one, which is then mandatory, or an `x.` id until the enrichment job finds one (§2.12, §9.6).
5. **A list too small to hide anything.** A `planet` list of 8 entries used for a medium mystery.
   *Wrong:* typing "M" shows two of the eight, so the suggestion box all but solves it. *Fix:* never under 100 entries for any slot (PRD §3.18.4), so planets go elsewhere or don't run as mysteries.

### 12.15 A filled-in verification record

This is the `verification` object for the Canberra item in §12.1, to show the format. The dataset values and the search results are real lookups made on 31 October 2026 while writing and revising this guide. Agent ids, models, timestamps and packet hashes are placeholders, and each `results` list keeps four of the seventeen results its search returned, in the order returned; a real record keeps all of them. The two searches show both attribution cases of §9.5.2. The first summary names the page its sentence came from, so the call counts at that page's tier. The second names its sources only as a group, so it counts at the lowest tier it could have relied on.

```json
{
  "checks": [
    {
      "checker": "fc-a1b2c3",
      "model": "<model of run A>",
      "pass": "A",
      "brief": "confirm",
      "packetSha256": ["<sha256 of stage 1>", "<sha256 of the final stage>"],
      "stagesServedAt": ["2026-11-02T10:00:00Z", "2026-11-02T10:01:30Z"],
      "startedAt": "2026-11-02T10:00:00Z",
      "finishedAt": "2026-11-02T10:09:00Z",
      "coldSolve": {"answerGiven": "Canberra", "confidence": "high", "matchedKey": true, "recordedAt": "2026-11-02T10:01:00Z"},
      "claimResults": [
        {
          "claimId": "c1",
          "verdict": "confirmed",
          "evidence": [
            {
              "kind": "dataset",
              "dataset": "mledoze-countries",
              "version": "6031f5df137c41c76d180c55a0782185ae3ed05b",
              "file": "countries.json",
              "locator": "cca3=AUS",
              "excerpt": "\"capital\": [\"Canberra\"]",
              "retrievedAt": "2026-10-31"
            },
            {
              "kind": "web",
              "query": "\"Canberra is the capital\" of Australia Parliamentary Education Office OR National Capital Authority",
              "results": [
                {"title": "www.nca.gov.au", "url": "https://www.nca.gov.au/sites/default/files/primary%20education%20kit%20teacher%27s%20notes.pdf"},
                {"title": "Canberra from above", "url": "https://peo.gov.au/understand-our-parliament/parliament-house/canberra-from-above"},
                {"title": "Canberra fly-over", "url": "https://peo.gov.au/understand-our-parliament/parliament-house/canberra-fly-over"},
                {"title": "Checked content", "url": "https://solarspell-dls.sfis.asu.edu/mea/wikipedia/wp/c/Canberra.htm"}
              ],
              "summaryExcerpt": "PEO: Its \"Canberra from above\" page welcomes readers to Canberra, the capital city of Australia, located on Ngunnawal and Ngambri country.",
              "citedResult": {
                "title": "Canberra from above",
                "url": "https://peo.gov.au/understand-our-parliament/parliament-house/canberra-from-above",
                "tier": "A"
              },
              "tiers": ["A", "B", "C"],
              "conflictReported": false,
              "retrievedAt": "2026-10-31"
            }
          ],
          "note": "A capital key, so it carries the dataset record and a Tier A or B result (§3.4). The summary also drew on Wikipedia mirrors and travel guides, but it attributes this sentence to the Parliamentary Education Office's page, so the call counts at Tier A."
        },
        {
          "claimId": "c2",
          "verdict": "confirmed",
          "evidence": [
            {
              "kind": "dataset",
              "dataset": "mledoze-countries",
              "version": "6031f5df137c41c76d180c55a0782185ae3ed05b",
              "file": "countries.json",
              "locator": "cca3=AUS",
              "excerpt": "\"capital\": [\"Canberra\"]",
              "retrievedAt": "2026-10-31"
            },
            {
              "kind": "knowledge",
              "basis": "textbook",
              "restatement": "Sydney, Melbourne and Perth are the capitals of New South Wales, Victoria and Western Australia.",
              "confidence": "certain"
            }
          ],
          "note": "The dataset covers the half about the national capital; the state capitals rest on knowledge, which a standard claim allows."
        },
        {
          "claimId": "c3",
          "verdict": "confirmed",
          "evidence": [
            {
              "kind": "web",
              "query": "Australian Constitution section 125 seat of government \"territory which shall have been granted to or acquired by the Commonwealth\" \"one hundred miles from Sydney\"",
              "results": [
                {"title": "Section 125 of the Constitution of Australia", "url": "https://en.wikipedia.org/wiki/Section_125_of_the_Constitution_of_Australia"},
                {
                  "title": "constitution heading image",
                  "url": "https://peo.gov.au/understand-our-parliament/how-parliament-works/the-australian-constitution/the-australian-constitution-online/chapter-vii"
                },
                {"title": "Commonwealth of Australia Constitution Act 1900 (UK)", "url": "https://www.foundingdocs.gov.au/item-sdid-122.html"},
                {"title": "Opinion Number. 207", "url": "https://legalopinions.ags.gov.au/legalopinion/opinion-207"}
              ],
              "summaryExcerpt": "By section 125 of that Act the territory must be situated in New South Wales not less than 100 miles from Sydney, contain an area of not less than 100 square miles, and any Crown lands within it shall be granted to the Commonwealth without any payment therefor.",
              "citedResult": null,
              "tiers": ["A", "B"],
              "conflictReported": false,
              "retrievedAt": "2026-10-31"
            }
          ],
          "note": "The summary names its sources only as a group (the Wikipedia article, the government's legal opinions, foundingdocs.gov.au and Parliament of Australia papers), so the call counts as one source at Tier B: enough for a high-risk practice claim, though not as a second source for a Daily clue."
        },
        {
          "claimId": "c4",
          "verdict": "confirmed",
          "evidence": [
            {
              "kind": "knowledge",
              "basis": "reference",
              "restatement": "Sydney and Melbourne competed to be the federal capital, and Canberra was a compromise site between them.",
              "confidence": "certain"
            }
          ],
          "note": ""
        },
        {
          "claimId": "c5",
          "verdict": "confirmed",
          "evidence": [
            {"kind": "calculation", "expression": "100 × 1.609344", "result": 160.9344, "constants": ["mile"], "claimIds": []}
          ],
          "note": "A pure conversion, so a calculation confirms it (§9.5.4)."
        }
      ],
      "issues": [],
      "searchesUsed": 2,
      "verdict": "pass"
    },
    {
      "checker": "fc-d4e5f6",
      "model": "<model of run B, another family>",
      "pass": "B",
      "brief": "refute",
      "packetSha256": ["<sha256 of stage 1>", "<sha256 of the final stage>"],
      "stagesServedAt": ["2026-11-02T10:01:00Z", "2026-11-02T10:02:10Z"],
      "startedAt": "2026-11-02T10:01:00Z",
      "finishedAt": "2026-11-02T10:06:00Z",
      "coldSolve": {"answerGiven": "Canberra", "confidence": "high", "matchedKey": true, "recordedAt": "2026-11-02T10:02:00Z"},
      "claimResults": [
        {
          "claimId": "c1",
          "verdict": "confirmed",
          "evidence": [
            {
              "kind": "knowledge",
              "basis": "textbook",
              "restatement": "Canberra is the capital of Australia and the home of its federal parliament.",
              "confidence": "certain"
            }
          ],
          "note": "Rival test: Sydney is the largest city and Melbourne was the temporary seat of government until 1927, but neither is the capital. High-risk (a counterintuitive key, C26), so it counts only with check A's external evidence (§9.9)."
        },
        {
          "claimId": "c2",
          "verdict": "confirmed",
          "evidence": [
            {
              "kind": "knowledge",
              "basis": "textbook",
              "restatement": "Sydney, Melbourne and Perth are the capitals of New South Wales, Victoria and Western Australia.",
              "confidence": "certain"
            }
          ],
          "note": ""
        },
        {
          "claimId": "c3",
          "verdict": "confirmed",
          "evidence": [
            {
              "kind": "knowledge",
              "basis": "reference",
              "restatement": "Section 125 places the seat of government in New South Wales, at least 100 miles from Sydney, on territory granted to the Commonwealth.",
              "confidence": "certain"
            }
          ],
          "note": "High-risk: counts only with external evidence in the other check (§9.9)."
        },
        {
          "claimId": "c4",
          "verdict": "confirmed",
          "evidence": [
            {
              "kind": "knowledge",
              "basis": "reference",
              "restatement": "The Sydney and Melbourne rivalry led to a new, separate capital.",
              "confidence": "certain"
            }
          ],
          "note": ""
        },
        {
          "claimId": "c5",
          "verdict": "confirmed",
          "evidence": [
            {"kind": "knowledge", "basis": "everyday", "restatement": "100 miles is roughly 161 km.", "confidence": "certain"}
          ],
          "note": "High-risk under C26; check A's calculation carries it."
        }
      ],
      "issues": [
        {"type": "regional", "severity": "note", "note": "Fair worldwide: the Sydney trap works for players everywhere."}
      ],
      "searchesUsed": 0,
      "verdict": "pass"
    }
  ],
  "merge": {
    "mergedAt": "2026-11-02T10:55:00Z",
    "editor": "ed-g7h8i9",
    "claims": [
      {"id": "c1", "addedBy": "writer"},
      {"id": "c2", "addedBy": "writer"},
      {"id": "c3", "addedBy": "writer"},
      {"id": "c4", "addedBy": "writer"},
      {"id": "c5", "addedBy": "writer"}
    ],
    "duplicates": [],
    "sentToFollowUp": []
  },
  "followUps": [],
  "tiebreak": null,
  "editor": {
    "editor": "ed-g7h8i9",
    "decision": "accept",
    "reason": "Both checks pass, and neither added a claim, so nothing needs a follow-up. c1 carries the dataset record and a Tier A result, c3 a Tier B result and c5 a calculation. Style clean.",
    "decidedAt": "2026-11-02T11:00:00Z"
  },
  "dailyChecks": [],
  "dedupe": {"checkedAt": "2026-11-02T10:10:00Z", "nearestId": null, "score": 0.0, "verdict": "unique"},
  "mythsScreen": {"checkedAt": "2026-11-02T10:10:00Z", "hits": []},
  "lint": {"version": "1.1", "passed": true, "warnings": []},
  "rechecks": [],
  "corrections": []
}
```

---

## Appendix A. Where this guide refines the inputs, and what it hands back

| # | Topic | The inputs say | This guide | Who acts |
|---|---|---|---|---|
| 1 | Sealed content in a public repository | Answers sealed (constraint 4); everything reproducible from the repo (memo §10); envelopes in `content/sealed/` with a git-ignored plaintext workspace (ARCHITECTURE §5.4) | Follows ARCHITECTURE §5.4 and adds: the `git check-ignore` guard (passing since the `.gitignore` entry landed); no sealed work before the key-escrow check passes; sealing and a checkpoint commit at the end of every pipeline step; redacted messages never pasted into GitHub; and nothing public that points at sealed content, list commits included (§2.10, §11.2) | CNT-0 alone (key, escrow and seal scripts); SQL-3 (the release); the orchestrator (checkpoint commits) |
| 2 | "About our questions" copy | Questions "accepted only after two independent checks against stored sources" (PRD §3.14) | Under memo §10, standard claims can pass on two checkers' knowledge, so "against stored sources" overstates. Suggested: "Questions are drafted with AI assistance. Each one is accepted only after two independent checks, and any fact that is uncertain or easy to get wrong is checked against published data or sources." | Done: PRD §3.14 uses this wording |
| 3 | What a void re-checks | Voids follow a re-check of "the stored source passages" (PRD §3.13.3) | A fresh checker re-verifies the reported claims with external evidence; WebSearch is always allowed for reports (§9.10) | Done: PRD §3.13.3 says the same |
| 4 | The reveal's sources line | `sourceLabels` on mysteries and encores (PRD §3.1.4, ARCHITECTURE §3.2) | Filled by the editor from evidence records (dataset publishers, Tier A and B site names), empty when a key rests on knowledge alone, never invented (§2.3) | Editor |
| 5 | Entity ids | Every list entry carries a Wikidata id (PRD §3.18.4); QIDs as ids, `x.<type>.<slug>` otherwise (ARCHITECTURE §2.4) | Only list builders mint ids, and a dataset record's QID is mandatory where it carries one; writers copy ids from published lists and file sealed list requests for anything missing. QIDs never come from memory. An id never changes once referenced, so a QID found later goes in `wikidataId` (+). `popularity` stays 0 until enrichment, and ties fall to alphabetical order (§2.10, §2.12, §9.5.1) | Done in PRD §3.18.4 and §4.1.3. ENR-1 builds the enrichment job; CNT-1 the `wikidataId` field, `lr.` ids and the `list-requests` folder |
| 6 | Qualifiers on clue-4 options | Displays such as "Marie Curie (physicist)" and "Queen (band)" (PRD §3.18.4) | A key that is the only option with a bracket is a giveaway. Descriptors only on collisions, and when any of the four options shows one, the server shows them on all four (ARCHITECTURE §5.5). Lint C28 checks the four agree, and six CLDR country names get bracket-free displays, as does association football (§2.10) | Done: PRD §3.18.4 now shows "Queen", with "Queen (band)" as an option label, and ARCHITECTURE §5.5 builds the labels; content stores descriptors and overrides |
| 7 | Mysteries in every category | Twelve categories and twelve lists (PRD §3.18) | Category is the clue angle and answer type the list, so Language & Words and Society & Culture use existing lists (§1.13). `artwork` and `language` lists proposed for 1.1 | Content lead, for 1.1 |
| 8 | Credits | Wikidata (CC0) for answer lists (PRD §3.14) | Also CLDR (Unicode licence), plus GeoNames (CC BY 4.0), MoMA and Tate (CC0, credit requested) wherever their data ships | Done: PRD §3.14 lists them from each list's `provenance` |
| 9 | Repeats | No Daily item repeats within a year (PRD §3.18.2) | Adds: no answer entity repeats within 60 days, and no recent answer as a distractor (§10.5) | Done: PRD §3.18.2 adds the 60-day rule; the scheduler applies both |
| 10 | Mystery difficulty | Expected-points bands (PRD §4.1.6) | Buffered assembly windows, the expected-points identity, and an easy lean for the first seven Dailies (§8.3, §10.2) | Scheduler |
| 11 | Encore details | Bands and decimals (memo §2); the symmetric error `max(g, a) / min(g, a) - 1` (PRD §4.2.2) | Answers of 21 or more under that error; true-zero scales only; unit-free by preference, with at most 1 measured encore in 10; the likeliest round guess outside the bullseye; at most a quarter years; conflicting sources fail (§6) | Writers |
| 12 | Numbers the inputs left open | 80/10/10 format mix; 8 packs of 15 (PRD §3.18.2) | 100/12/13 per category; pack themes and a pack template (§1, §10.9) | Editor |
| 13 | Formats | The brief says "mcq" and "truefalse"; ARCHITECTURE §3.2 and §5 set `mc` and `tf`, camelCase fields and one item per file | This guide follows ARCHITECTURE throughout and marks its additions with + | Everyone |
| 14 | Schema additions (+) | The validator refuses unknown keys (ARCHITECTURE §5.2) | Items: `counterintuitive`, `claims`, `selfCheck`, `writerNotes`, `lintAllow`, the `verification` object of §9.8, and statuses `draft`, `checking`, `cut` and `retired` besides `active`. Claims: pass-prefixed addition ids (`xA1`) and the `riskReason` values `only`, `counterintuitive` and `sealed_pool`. Verification: `merge`, `followUps`, `dailyChecks`, `corrections`; CheckRecord `model`, `packetSha256` as an array, `stagesServedAt`, `recordedAt` on cold solves, `addedClaim`, evidence as typed arrays with `citedResult` and the `calculation` kind, pass `D` with `forDate` and `listVersions`. True/false: `tfKind`. Comparison: `relation`, `measure`, `unit`, `values`, `valueDisplay`, `exactDates`. Mystery: `likelyGuesses`, `rivals`, `giveawayTerms`, `seedSolveShares`. Encore: `predicted` (`pClose`, `pExact`) and `derivation`. Room questions keep `predicted`. Lists: `liveAt`; entities `qualifier`, `source`, `status`, `addedIn`, `wikidataId`, `replacedBy`. Schedule dailies: `status`, `predictedPoints`, `dayCheck`, `spareOrder`. Sealed folders `list-requests` and `audits`. Register: `searchCaps`, `searchesUsed`, `highRiskClaims`, `externallyEvidenced`, `bandCounts`, `typeCounts`, `measuredEncores`, `approvals` | ARCHITECTURE §5.1.1 adopts every one; CNT-1 builds the schemas |
| 15 | Checks beyond ARCHITECTURE §5.2 | §5.2 covers shape, length, options, numeric dates and pool rules | Lint C06, C07, C09 (more time words), C10, C11, C12 (giveaway terms, and the suggestion probe through the engine's own `suggest()`), C13, C14 (coverage and the freeze from `addedIn`), C17 (separation guard and `exactDates`), C19 to C25, C26 (the risk floor), C27 (excluded capitals) and C28 (option display parity); C22 as an error for sealed near-copies of §12 examples; C12 and C13 read `optionsFromClue`; text rules run on player-facing fields only | ARCHITECTURE §5.2 now lists all of them; CNT-2 builds them |
| 16 | `predicted.solveByClue` | Four numbers (ARCHITECTURE §3.2) | Read as cumulative shares, so expected points are their sum (§8.3); ARCHITECTURE §3.2 now says so | Done |
| 17 | Zero known errors in scheduled Dailies | Memo §13; PRD R4 and AC-CNT-01 | Every clue, value and input claim externally evidenced; two independent sources for pinning clues, numbers, dates and "only" in clues, and every encore value (§9.5.5); and pass D on every scheduled item before its Daily freezes (§9.9, rule 7) | Done: PRD §3.18.3, §3.18.5 and AC-CNT-01; ARCHITECTURE §5.2 and §8.7 (the freeze gate, `dailyChecks`) |
| 18 | The seeded audit | 300 practice items, 95% of 20 to 30 plants caught (SYNTHESIS §7.6; PRD R4, AC-CNT-05) | At least 400 items and 25 plants, at least 24 caught, half the plants subtle, a separate planter, opaque packet ids, plants kept out of `content/`, a sealed audit record, and a fresh audit after any real error (§9.10) | Done: ARCHITECTURE §5.8 and CNT-2 (`content:audit`, the `audits` folder); PRD R4 and AC-CNT-05 cite the record and its sizes |
| 19 | Calibration safeguards | SYNTHESIS §7.10; ARCHITECTURE §8.12's calibration view | Eligible answers defined to match the view, plus half weight for self-picked categories and frozen estimates for disputed items (§8.6) | Done: ARCHITECTURE §7.2 (`selfPicked` in practice uploads) and §8.12 (low-trust and disputed exclusions); the weekly run adds re-check holds |
| 20 | Spare days | "A spare fills the date automatically" (PRD §3.18.2) | The scheduler ranks spares per date in `spareOrder`, and the database takes the first unused one with an alert (§10.7) | Done: ARCHITECTURE §8.7 fills from `spare_order`, and PRD §3.18.2 describes it |
| 21 | Daily feasibility | Week rules and pool sizes (PRD §3.18.2) | Bank-wide answer-type quotas and a constraint solver over §10.3 to §10.5 before wave 3's writing ends (§10.5, §11.4) | Scheduler |
| 22 | Staged packets | `content:packets` builds packets "with the staged clue reveal" (ARCHITECTURE §5.8) | Stages for every format, the list file in a mystery's first stage, claims only in the final stage, a hash and a timestamp per stage, and no stage before the previous cold-solve entry (§9.4) | CNT-2 |

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

**Lookups and searches run while revising this guide** (31 October 2026):
- Canberra as Australia's capital, for §12.15: [Parliamentary Education Office, "Canberra from above"](https://peo.gov.au/understand-our-parliament/parliament-house/canberra-from-above)
- Section 125's granted territory, for §12.15: [Australian Government Solicitor, opinion 207](https://legalopinions.ags.gov.au/legalopinion/opinion-207), [Commonwealth of Australia Constitution Act 1900 (UK)](https://www.foundingdocs.gov.au/item-sdid-122.html), [Wikipedia, Section 125](https://en.wikipedia.org/wiki/Section_125_of_the_Constitution_of_Australia)
- From the pinned copies in `.cache/datasets/`: the `capital` field of 30 countries in `mledoze-countries` (file hash checked against the manifest), the MoMA records and QIDs for Frida Kahlo, Diego Rivera, Georgia O'Keeffe, Leonora Carrington and Remedios Varo, and every CLDR 49 short name with a bracket or a qualifier
- The final design's Encore screen ([docs/design/final/index.html](./design/final/index.html)) for the walking question in e.0002

## Review log

*31 October 2026.* This revision applies all 39 corrections from the content review: the 20 majors and all 19 minors. None is rejected. Two overlapped and are merged into one rule, some are adopted with an adjustment, and some offered a choice. The table records each of those calls; every other correction is applied as written.

| Correction | What this revision does | Why |
|---|---|---|
| A list-level `liveAt` (minor), and defining "went live" for a public repository (major) | Merged. `liveAt` is the UTC date of the commit that first publishes a list version, written at commit time and checked against git history in CI; `addedIn` equals it; the 30-day freeze runs from `addedIn` to the Daily's date (§2.10, rule 5). The "version plus 7 days" alternative isn't used | The two agree on the field and differ on its value. A commit date is exact and checkable, while a 7-day guess is neither |
| List additions in commits of at least 100 entries | Applied, with two exceptions: a final top-up to a list's target may be smaller, and a version that only fixes aliases, displays or retirements may be any size. The old floor of 20 per version is gone (§2.10, §11.4) | Without the exceptions, no list could ever reach an exact target, and an alias fix would wait for 99 unrelated entities |
| The capital rule | Applied with one adjustment: CLDR names countries but holds no capitals, so "the dataset disagrees with CLDR or a Tier A source" becomes "with a Tier A source". Applying the general rule also lists Germany (1990), Tanzania (1996), Montenegro, Switzerland, Nauru and Yemen (§3.4). The five dataset values were confirmed in the pinned file, along with Sucre alone for Bolivia and Yaren for Nauru, now in the traps | The comparison has to be with something that holds capitals. The extra countries meet the rule as the review worded it |
| Lint C26, the risk floor | Applied, with four clarifications so the floor stays honest: number words capitalized mid-sentence belong to titles (The Four Seasons), digits that only number clues don't count, "most of" is a quantity, and uniqueness claims are exempt because the rival search proves them. `only` gets its own `riskReason`, beside new `counterintuitive` and `sealed_pool` values. Every example claim now meets the floor, the eleven the review listed included | Without them, every distractor claim ("contradicts clues 1 and 2") and every title with a number in it would need a search. Where a claim held no number at all, it was reworded rather than relabelled (p.geo.0002 c3, e.0006 c4) |
| Search caps per role, sized from the spike | Applied: caps are per role, per batch, set by a formula on the spike's measured figure, with starting figures until it reports (§9.5.2) | The review asked for caps sized from a measurement that doesn't exist yet, so the formula carries starting values that the spike replaces |
| Namespaced checker additions | Applied. A follow-up goes to a run with the other pass's brief, not literally to the same checker (§9.7) | Agent runs end with their check, so "the other checker" can only be a new run under that brief |
| The Equator encore | Rewritten as a duration, the walking question of the final design's Encore screen, with the speed given in both systems (e.0002). Rule 4 now states PRD §4.2.2's symmetric error, and rule 5's minimum moves from 20 to 21, since under that error a guess of 19 is 5.3% off an answer of 20 | The design already uses this form. The threshold follows from the error the PRD adopted |
| Rewriting m.nat.0001's clue 1 | Applied with a different clue: the suggested "native to the lakes of the Valley of Mexico" contains "Mexico", which the new C12 fails through the alias "Mexican walking fish", so the clue names the basin where the Aztecs built Tenochtitlan. m.geo.0001 and p.nat.0003 are marked `slow` rather than dated | Dating the record to "1991 to 2020 averages" would need evidence for those normals in particular; `slow` with a review date is honest at no cost |
| Freddie Mercury in m.music.0001 | Both options at once: clue 1 is rewritten as suggested, and his entry joins `likelyGuesses` and `rivals`, because "Farrokh Bulsara" is an alias of that entry, so rule 15 applies to the new clue too. Clue 2 now says "In 1975 it released", since Queen released more than one single that year | The suggested clue still names him through his alias |
| Shuffling comparison sides | The guide states that the engine shuffles them (ARCHITECTURE §3.2), so there is no batch-balance rule. p.sport.0002 is replaced by a pair 19 years apart rather than patched with invention days | The exact day an invention happened is rarely undisputed, which is the very thing the separation guard's exception needs |
| The round-number rule | Applied; e.0002 and e.0010 are replaced as asked. Applying the rule to every example also replaced e.0004 (the round guess 200 sits 2% from a chessboard's 204, so it moved to a shogi board) and e.0005 (40 sits exactly 5% from a dog's 42, so it moved to a pig) | The examples have to pass the rules they teach |
| The football display | "Association football" is the display, with Football, Soccer and "Football (soccer)" as aliases, rather than barring the entry from options. CLDR's seventh bracketed form, "Cocos (Keeling) Islands", keeps its official name | A sport that can't be a distractor would be a hole in the list. Territories never reach the options anyway (§2.10, rule 7) |
| The example denylist | Applied. A sealed mystery with a listed answer is an error, while an encore matching a listed value and unit is a warning the editor clears only if it measures something else (lint C22) | The same number can measure a different thing; an answer entity can't |
| The calibration safeguards | Applied in §8.6. Two of them, half weight for self-picked categories and frozen estimates for disputed items, need fields ARCHITECTURE's calibration view lacks, so Appendix A, item 19, hands them over | The guide can define the rule but not the view |
| The lint's message rule | Applied, with the field path kept beside the item id and rule code (§2.13, §11.2) | ARCHITECTURE §5.4's output rule already prints the path, and a path reveals no content |
| The audit bound: a bigger audit, or an honest 1.3% | The bigger audit: at least 400 items and 25 plants, at least 24 caught, half of them subtle (§9.10) | It keeps the practice bound near 0.9% instead of conceding 1.3% |
| Room questions' difficulty field | `predicted` stays on room sources, and the pack template bands by *p* (§2.9, §10.9) | ARCHITECTURE §5.1.1 already does this, and the PRD's bands read *p* |
| The element list's licence | Written by the list builder from IUPAC's table and checked against `ptable`, rather than copied with the owner's approval (§9.5.1, §11.4) | No approval is needed, and the entry's source becomes its own list batch |

**Changes beyond the list, made for consistency.**
- Encores carry `unitShort` and `unitLabel` in §2.8 and in every example, because ARCHITECTURE §3.2 and §5.2 require them.
- List rule 3 now asks for 100 entries for any Mystery slot, as PRD §3.18.4 does; the guide still said 30 for Mystery 1.
- `selfCheck` is required to leave `draft`, not in a draft, so §12's examples still pass as CNT-1's schema fixtures (ARCHITECTURE, CNT-1 acceptance).
- §2.12's id table gains spare sets (`spare.07`, ARCHITECTURE §2.4) and list requests (`lr.`).
- C19's superlative list moves to `content/reference/superlatives.json` and gains the words it missed, such as "coldest" and "hottest"; C26 reads the same list.
- Calculation evidence (§9.5.4), with exact constants in `content/reference/units.json`, because C26 makes every dual-unit conversion high-risk and §3.3 asks for dual units.
- Territories that aren't sovereign states are never answers or distractors under the line "a country" (§2.10, rule 7).
- `spareOrder` in the schedule records carries the spare-selection rule to the database (§2.11, §10.7).
- The sealed folders gain `list-requests` and `audits`, and list `challenge-packs`, which ARCHITECTURE §5.1.1 already has (§2.2).
- The axolotl's clue 4 drops "often pink": wild axolotls are mostly dark.
- §1.4's fairness line is reworded to fit the house style.

**Cross-doc consistency pass (31 October 2026).** The technical program manager reconciled this guide with the revised PRD and ARCHITECTURE. Changes here:
- The desktop 2 by 2 grid needs every option under 24 characters (PRD §3.0.3), so writers aim for 23 or fewer and C04 warns from 24 (§2.4, §2.9, §2.13, §3.8).
- A schedule file's `status` is advisory: the database decides what is frozen, by one config rule whose switch date the owner moves (§2.11, §10.7, ARCHITECTURE §8.7). `dayCheck` now names its fields.
- ARCHITECTURE §5.2 adopts the whole lint table and CNT-2 builds it, while the L-rule messages stay creator copy (§2.13).
- The practice upload's optional secret and the database's `disputed` mark are described as ARCHITECTURE builds them, with re-check holds added by the weekly run (§8.6).
- The enrichment job is ticket ENR-1 (§9.5.1, §11.1, Appendix A item 5), and CNT-0 alone owns the key, escrow and seal scripts (Appendix A item 1).
- The list builder works the "My guess should have counted" queue (§0.2, §9.10).
- The person list's target comes down if the real list passes 80 KB (§2.10, rule 10), and `OPS.md` joins the files other teams own (§11.1).
- Spare-set files name their `id` and `track` (§2.11), and content wave 0 lands on ARCHITECTURE's schedule: the tooling in Wave 3, sealing and the key escrow in Wave 1 (§11.5).
- Appendix A items 2, 3, 5, 6, 8, 9 and 17 to 20 are marked done, and items 14 and 15 point at ARCHITECTURE §5.1.1 and §5.2.
