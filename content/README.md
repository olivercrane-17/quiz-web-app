# Content tooling

The command-line tools that writer, estimator, fact-checker, editor and list-builder agents use to produce the question bank (ticket CNT-1, plus the sealing part of SQL-3, and CNT-2b's retire and cross-pool judgments). How items are written and checked lives in [docs/CONTENT_GUIDE.md](../docs/CONTENT_GUIDE.md); file formats in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) §5. This page says how to drive the tools.

Every command is an npm script. Pass options after `--`:

```sh
npm run content:check -- --batch p.geo.b01
```

The scripts run TypeScript directly on Node 22 (type stripping, no build step). The code lives in `scripts/content/` (thin CLIs), `src/content/pipeline/` (the logic) and `src/content/schema/` (zod 4 schemas). Most commands take `--json` for machine-readable output and `--help` for their options.

## The pipeline at a glance

| Step                              | Who                 | Command                                                        |
| --------------------------------- | ------------------- | -------------------------------------------------------------- |
| Open a batch, take ids            | Editor, then writer | `content:batch -- open`, `content:batch -- ids`                |
| Draft, lint, self-check           | Writer              | write the files, `content:check -- --batch <id> --writer <id>` |
| Submit                            | Writer              | `content:batch -- submit`                                      |
| Blind packets                     | Tooling             | `content:packet -- --pass A`, `--pass B`, `--pass E`           |
| Estimate                          | Estimator           | `content:estimate`                                             |
| Check                             | Checkers A and B    | `content:record`                                               |
| Tiebreak, when §9.7 calls for one | Third checker       | `content:packet -- --pass T`, `content:record -- --pass T`     |
| Resolve and accept                | Editor              | `content:decide`                                               |
| Close                             | Editor              | `content:batch -- close`                                       |
| Take an active item out of play   | Editor              | `content:batch -- retire`                                      |
| Judge a pair X29 flags            | Editor              | `content:dedupe -- --cross-pool-ok`                            |
| Save sealed work                  | Anyone with the key | `content:seal` (and `content:unseal` to start)                 |
| Ship practice packs and lists     | Anyone              | `content:build`, then commit its outputs                       |

### One batch, command by command

Every agent is its own run with its own id (one run, one role on an item). `<b>` is the batch id.

```sh
# Editor (ed-E): open the batch for a writer.
npm run content:batch -- open --batch <b> --writer w-W
# Writer (w-W): take ids, draft, lint until clean, submit.
npm run content:batch -- ids --batch <b> --writer w-W --count <n>
#   sealed pools: npm run content:unseal first, write in content/.sealed-plain/<folder>/, npm run content:seal at every checkpoint
npm run content:check -- --batch <b> --writer w-W
npm run content:batch -- submit --batch <b> --writer w-W
# Tooling (needs the content key): blind packets for A, B and the estimator. A and B start at stage 1.
npm run content:packet -- --batch <b> --pass A
npm run content:packet -- --batch <b> --pass B
npm run content:packet -- --batch <b> --pass E
# Estimator (es-S): five estimates per item from .cache/packets/<b>/E/estimate.json.
npm run content:estimate -- --batch <b> --file estimates.json
# Checkers A (fc-A) and B (fc-B), separately, stage by stage: write the cold-solve entry for the stage you hold
# in your draft, then ask for the next stage, up to the final one with the key and the claims.
npm run content:packet -- --batch <b> --pass A --next --record draft-a.json
npm run content:record -- --batch <b> --pass A --file records-a.json --dry-run
npm run content:record -- --batch <b> --pass A --file records-a.json
# A split verdict: a tiebreak by a third checker (fc-T).
npm run content:packet -- --batch <b> --pass T
npm run content:record -- --batch <b> --pass T --file records-t.json
# Editor (ed-E): dedupe calls, then decisions; rewritten items go back to packets with --items.
npm run content:dedupe
npm run content:decide -- --batch <b> --file decisions.json
npm run content:check -- --batch <b>
npm run content:batch -- close --batch <b>
# Anyone, before every commit or push (sealed pools: content:seal first, commit only envelopes).
npm run check:secrets
```

Agent ids are a role prefix plus the run id (§2.12): `w-` writer, `es-` estimator, `fc-` checker, `ed-` editor, `lb-` list builder, `sc-` scheduler, `au-` auditor. The tools compare run ids across roles, ignoring case, so `w-abc`, `fc-abc` and `fc-ABC` count as the same run, and one run holds one role on an item (§0.2): the writer, the estimators (recorded in `verification.estimates`), the checkers and the editor are all different runs.

## Commands

### content:check

```sh
npm run content:check                                   # whole bank, plus content/fixtures/ if it exists
npm run content:check -- --batch p.geo.b01              # report on one batch
npm run content:check -- --file content/practice/geography/p.geo.0101.json
npm run content:check -- --batch p.geo.b01 --writer w-run42 --json
npm run content:check -- --sealed                       # decrypt content/sealed/ in memory (needs the key)
npm run content:check -- --sealed --launch              # QA-2: the launch criteria AC-CNT-01 to 06 as errors
npm run content:check -- --root src/content/pipeline/__fixtures__/bank --fixtures
```

Runs every level of ARCHITECTURE §5.2 over the bank: the schemas (C01), every lint rule below, CNT-1's cross-file rules (X15 to X30 and the C14, C15 and C18 additions, below), the challenge packs and list requests the bank loader leaves out, and the drift check: every output of `content:build` rebuilt in memory and compared with what is committed, with the size budgets of packs and lists (X09, X18, X31). Exit code 1 on any error, or on any warning with `--strict`. `--json` prints `{ ok, items, errors, warnings, notes, findings }`. By default sealed items come from the plaintext workspace `content/.sealed-plain/`; `--sealed` reads the envelopes instead and prints `Sealed content validation: not run (QZ_CONTENT_KEY is not set)` without a key. Messages about sealed content never quote it: the offending text appears only with `--reveal`, which is for your own terminal, never CI or shared logs. `--skip-dedupe` skips C22 for a quicker run, `--skip-drift` skips the rebuild, and `--today <date>` sets the date for the freeze rule and the runway.

**A `--sealed` run goes through the redacting reporter** (`scripts/content/lib/report.ts`, ARCHITECTURE §5.4), because the `content-sealed` job's logs are public: every finding prints as severity, item id, rule code and field path (`error m.film.0107 C12 clues[1]`), the JSON report keeps its keys with each message replaced by the rule's fixed title, the run ends with counts, and a crash prints one line that says nothing about the content. A plaintext run keeps the long form above.

**`--launch`** is QA-2's launch check. It makes the launch criteria errors: every category at 100 active practice items, at most 10% true/false and 40/40/20 by predicted _p_ within 5 points (AC-CNT-04, X19); every list at its minimum (AC-CNT-03, X17); 100 consecutive Dailies from `DAILY_EPOCH` and 20 spare sets (AC-CNT-02, X20); a pre-launch seeded audit record that meets AC-CNT-05 (X32); and every rule CNT-1 and CNT-2 added (C14, C15 and C18 below, C26 to C28 and the additions in `scripts/content/lint/README.md`) on every item, active ones accepted before those rules landed included. Without it, the per-category minimum and a failing audit record warn, and an active item accepted before the rules landed (`scripts/content/lint/cutoff.ts`) warns on them; an item accepted since meets them at `content:decide`, so they keep their own severity.

**Also on every run:** the audit records under `content/sealed/audits/` (or the workspace's `audits/`), each against its schema (C01), and the latest pre-launch one's AC-CNT-05 criteria (X32, CONTENT_GUIDE §9.10); and, whenever sealed items are loaded (the workspace, or `--sealed`), the cross-pool check: no practice or room item shares a fact with a Daily item (AC-CNT-06, X29, an error, named on the sealed side only). A pair an editor judged `related_ok` is skipped while neither item has changed, and retired items are never read (see [Cross-pool overlaps](#cross-pool-overlaps-retire-or-related_ok)). `--skip-dedupe` skips X29 with C22.

**The drift check** runs when the tree has a generated manifest (`src/content/generated/manifest.ts`) and neither `--batch`, `--file`, `--root` nor `--sealed` narrows the run. An output that differs, is missing or is stale is an X31 error: run `npm run content:build` and commit the result. CI checks out with full history (`fetch-depth: 0`), so each answer list's `liveAt` is compared with the commit that first published its version (X15); outside git, or in a shallow clone, a note says it was not checked.

**Active items prove themselves on every run.** CI runs only `content:check`, so an item whose file says `"status": "active"` must pass the acceptance rule of §9.9 here too, not only when `content:decide` accepted it: checkers independent of the writer, the editor, each other and the estimators; the verdicts and evidence of rules 2 to 4; a clean lint and `verification.lint.passed`; a dedupe verdict other than duplicate; a myths screen that is clean by the checks themselves (stored hits and current matches, `cleared` recomputed, never read from the file); and `reviewBy` within 24 months of the decision. Every A, B and T record's `packetSha256` (one hash per packet stage, or one for the whole packet in records from before staging) must also match the item as it stands, so an edit made after the checks (a swapped key, a reworded statement) fails with `the item changed after pass A was recorded`. Each failure is a C01 error on `verification`. Files under `content/` outside the layout (a `content/mysteries/` folder, a copied packet) are C01 errors too, because a plaintext sealed item there would be committed.

### content:build

```sh
npm run content:build                   # validate what ships, then write every output
npm run content:build -- --check        # compare with the committed outputs, write nothing
npm run content:build -- --out /tmp/x   # write into another directory
npm run content:build -- --json
```

Writes every output of ARCHITECTURE §5.3 from `content/` and `content/fixtures/`, deterministically (no clock, no randomness: the same inputs give the same bytes, which is what lets CI rebuild and compare):

| Output                                     | From                                 | What                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/content/packs/<slug>.<hash8>.json` | active practice items                | `{ category, version, items }`, the built `ChoiceItem` of ARCHITECTURE §3.2: every source-only field stripped, `answer` and `wrong` as `options` and `correct` (the answer first), true/false as True, False, comparisons always shuffled. 40 kB gzipped per pack and 400 kB together at most (X18) |
| `public/content/lists/<type>.<hash8>.json` | `content/answer-lists/`              | The client projection of §5.5: `[id, display, keys, popularity]` per active, unreplaced entry, `keys` from the engine's own `normalizeName`. 80 kB gzipped at most (X09)                                                                                                                            |
| `src/content/generated/manifest.ts`        | the two above                        | Each pack's and list's hashed URL, version and count, and the content version. The loaders fetch from it, and the service worker precaches from it                                                                                                                                                  |
| `src/content/generated/categories.ts`      | `content/categories.json`            | The 12 categories, in display order                                                                                                                                                                                                                                                                 |
| `src/content/generated/names.ts`           | `content/names/*.txt` (MOD-1)        | Friendly-name parts, one per line; empty until MOD-1 adds them                                                                                                                                                                                                                                      |
| `src/content/generated/category-pages.ts`  | `content/category-pages/<slug>.json` | `{ "intro": "..." }` per category (CAT-1) and one sample: the easiest active multiple-choice item by predicted _p_                                                                                                                                                                                  |
| `src/content/generated/moderation.ts`      | `content/safety/*.txt` (MOD-1)       | The player-facing slur terms and allowlist, ROT13-encoded; empty until MOD-1 adds them                                                                                                                                                                                                              |
| `src/content/generated/fixture-world.json` | `content/fixtures/` only             | The fixture world's packs and lists in the same shapes, plus the clue-4 option labels the mock judges with                                                                                                                                                                                          |
| `src/backend/mock/fixtures.generated.ts`   | `content/fixtures/` only             | The mock backend's sealed fixtures: mysteries, encores, choice rounds, the hostable room packs, the e2e Dailies and spare sets                                                                                                                                                                      |
| `supabase/seed/answer-entities.sql`        | `content/answer-lists/`              | Every published entry with `display`, `option_label` and `active`, one upsert per type                                                                                                                                                                                                              |
| `supabase/seed/practice-items.sql`         | categories and active practice items | The categories, then each practice item's id, category, option count and bit position (`ord`). Positions are append-only: the build reads the committed file back, keeps every position it ever handed out, and gives new items the next ones in id order                                           |
| `supabase/seed/config.sql`                 | `src/config/shared.json`             | The values the client and SQL share, in snake_case (`crowd_min_n` and so on)                                                                                                                                                                                                                        |

Packs and lists are named by a hash of their content, so a URL changes whenever its file does and caches stay cache-first. Every JSON and TypeScript output is formatted with the repository's Prettier config, so `npm run format:check` passes on them. The SQL loads are idempotent upserts with nothing destructive (no DELETE, DROP or TRUNCATE), so they apply unattended through MCP, one statement per call, each well under 400 kB.

Only what ships can stop the build: an error on an active practice item, an answer list, the categories, the composition layouts or anything in the fixture tree. Then nothing is written. A draft in progress or a sealed item in the workspace never blocks a pack build; `content:check` still reports it. Nothing the build writes comes from `content/sealed/` or the plaintext workspace: no sealed pool ever reaches `public/content/`, a client module or a log.

**Which world a build plays.** A mock build (`NEXT_PUBLIC_BACKEND_MODE=mock`: the E2E build, local development, the playtest build) plays the fixture world end to end: the mock backend's fixture Dailies, and the fixture world's practice packs and answer lists, so a typed guess finds the fixture entities the mock's Mysteries name. Every other build plays the real bank. `src/backend/index.ts` selects the world as it loads; unit tests get the fixture world.

### content:batch

```sh
npm run content:batch -- status                                       # the register
npm run content:batch -- status --batch p.geo.b01                     # one batch: plan, id range, searches used
npm run content:batch -- open --batch p.geo.b01 --writer w-run42      # planned -> open; prints the id range
npm run content:batch -- open --batch p.geo.b06 --writer w-run42 --target 20   # a top-up batch not in the plan
npm run content:batch -- ids --batch p.geo.b01 --writer w-run42 --count 10     # issues p.geo.0101 to p.geo.0110
npm run content:batch -- submit --batch p.geo.b01 --writer w-run42    # lint gate and writerNotes, then submitted
npm run content:batch -- close --batch p.geo.b01                      # needs every item active or cut
npm run content:batch -- incident --batch p.geo.b01 --kind fabricated_source --note "c3 cited a page nobody retrieved"
npm run content:batch -- incident --batch m.geo.b01 --kind invalid_check --checker fc-run9 --note "pass B records were templated"
npm run content:batch -- retire --item p.geo.0142 --editor ed-run3 --kind other --reason "Overlaps another item; replaced."
npm run content:batch -- retire --item r.all-sorts.06 --editor ed-run3 --kind cross_pool --reason "States m.geo.0107's flag clue."
npm run content:batch -- retire --item m.geo.0107 --editor ed-run3 --kind recheck --reason "Freshness re-check failed c4."
npm run content:batch -- retire --item m.geo.0107 --editor ed-run3 --reason "Key changed; replaced by m.geo.0311." --allow-frozen
npm run content:batch -- retire --item m.geo.0108 --editor ed-run3 --reason "Key changed." --today 2026-11-02   # the guard as of a past date
npm run content:batch -- status --json                                # the register as JSON
npm run content:batch -- status --root src/content/pipeline/__fixtures__/bank --fixtures   # a fixture tree
```

A fabricated source fails the whole batch (§9.6). The `fabricated_source` incident voids the A, B and T records of every item not yet active (a voided checking item goes back to draft and keeps its estimate), stores every checker of the batch in the incident's `checkers`, and `content:record` refuses those checkers for the batch from then on, so fresh runs re-check every item. Items already active keep their checks; the command lists them for a §9.10 re-check.

A checker whose records were not real checks (made by script: templated notes, restatements copied from the claims, every verdict pass) gets an `invalid_check` incident, which needs `--checker`. It voids that one checker's A, B and T records on every item of the batch, active ones included, stores the checker in the incident's `checkers`, and `content:record` refuses that checker for the batch from then on. An active item goes back to `checking` (or `draft`, if it is left without a check or an estimate) and loses `verification.editor`, since its accept rested on the voided record; a checking item left without a check goes back to draft; cut and retired items keep their history. Nothing else on an item changes: the estimate, the other pass, the lint, dedupe and myths records stay exactly as the file has them. A closed batch goes back to `checking` and keeps its `accepted` and `cut` counts until the next close. The register is written before the items, so a run that stops halfway has already barred the checker: run the command again to finish (it adds no second incident). An id with no record in the batch is refused, so a typo bars nobody. The command prints the voided records by pass and the reopened items, then the next steps: a fresh packet for each voided pass (`content:packet -- --pass <pass> --items <ids>`), records from a new checker id, and the editor's decisions on the reopened items before `close`. For a sealed batch, run `content:unseal` first and `content:seal` after.

`content/batches.json` is the only place ids come from (§11.3). Only the registered writer can take ids, and ids above `lastSequence` fail C24. Practice, mystery and encore ids are `BB` (the batch number) plus `SS` (01 to 99); room questions are `r.<pack>.<NN>`, 01 to 89, numbered across the pack's batches. List batches issue no ids: entities use `x.<type>.<slug>` or a QID copied from a dataset that carries one. Every command takes `--root <dir>` and `--fixtures` to work on a fixture tree, and `status --json` prints the rows (with each batch's draft, checking, active, cut and retired items) as JSON.

**`retire`** takes one active item of any pool out of play (CNT-2b). Its status becomes `retired`, the status §2.3 already defines, and it gains a record right after its status, `"retired": { "at", "by", "kind", "reason" }`. Everything else stays: the id, the checks and the whole history, and the id is never reused, since ids are only ever issued above `lastSequence`. From then on it leaves every pool count, `content:build`'s packs and outputs (and with them the fixture world, for a fixture item), the release's rows in play (the release loads it marked retired, so the database keeps it for the attempts that name it but never plays it) and X19's counts, and X29 never reads it.

- **What it takes.** `--item <id>`, `--editor <ed-...>` and `--reason <text>`; `--kind` is `cross_pool` (it shares a fact with a Daily item, X29), `recheck` (a report, freshness or audit re-check failed it, §9.10) or `other` (the default: a changed key that moved to a new id, §2.12, say). A practice item takes `recheck` or `other` only: its file is public, and `cross_pool` there would tell any reader that a Daily item states its fact, which is close to that Daily's answer (ARCHITECTURE §5.4). Room questions and Daily items are sealed and take `cross_pool`. `--batch`, if you pass it, must be the item's own batch, so a typo retires nothing.
- **What it refuses.** Draft and checking items (`content:decide` covers those: cut, or rewrite and re-check), cut and retired items, an editor id that is not `ed-...`, and an editor whose run wrote, checked (any pass, follow-ups and pass D included) or estimated the item, since one run holds one role (§0.2). On a practice item the record sits in a public file, so a reason that names a sealed item, a sealed batch, a list request or a spare set (`m.geo.0101`, `e.b02`, `r.game-on.04`, `lr.m.geo.b01.03`, `spare.07`), a Daily by its number or date ("Daily #42", `2026-12-01`, "1 December 2026", "Dec 1", `01/12/2026`), or the sealed side by name (the words Daily, mystery, encore or sealed), is refused (ARCHITECTURE §5.4); the record's `at` already says when.
- **The schedule guard.** A mystery, encore or sealed question that a main-track Daily still to close names (frozen or merely scheduled), or that a main-track spare set or challenge pack names, is refused without `--allow-frozen`, as `content:release` refuses changes to frozen Dailies. A Daily counts as closed two days after its date by the UTC date (`--today`, default today), since its window ends at 12:00 UTC the day after. `--today` takes a real date no later than today (UTC), else exit 2: a later one would show Dailies still to close as closed and skip the guard, and an earlier one only makes it stricter. With `--allow-frozen` the item retires and the command warns: the scheduler replaces it there (`content:schedule`), and the next release needs `--allow-frozen` too if a frozen Daily changes. An item that only played on Dailies that have closed retires without it, as the database's item locks allow, and stays on those Dailies, which are its history (X10 lets it). The e2e track has no locks. If the workspace lacks a schedule, spare or challenge-pack file that `content/sealed/` holds, the command stops and asks for `content:unseal`, with or without `--allow-frozen`, because the guard could not see every Daily, spare set and challenge pack.
- **The register follows.** A closed batch stays closed and is recounted from its items, as `close` counts them: `accepted` drops, and the register's `retired` count (absent while none is) rises. A batch not yet closed is counted when it closes; `close` counts retired items too.
- **Sealed items** are retired in the plaintext workspace: `content:unseal` first, `content:seal` after, then commit the envelopes. What the command prints names ids, statuses and counts only, never the reason or anything of the item, and `--json` prints the same: `{ ok, itemId, pool, status, kind, by, batch, batchStatus, register, schedule }`. A retired room question leaves its pack one short in play, which X04 reports until a replacement joins it. A retired practice item leaves its pack at the next `content:build`; commit the rebuilt outputs with the item.

### content:packet

```sh
npm run content:packet -- --batch p.geo.b01 --pass A                # stage 1 of every item
npm run content:packet -- --batch p.geo.b01 --pass A --next --record draft-a.json
npm run content:packet -- --batch p.geo.b01 --pass B --json
npm run content:packet -- --batch p.geo.b01 --pass T                # items whose A and B verdicts split
npm run content:packet -- --batch p.geo.b01 --pass T --items p.geo.0104,p.geo.0111
npm run content:packet -- --batch p.geo.b01 --pass E                # the estimator's packet
```

`content:packets` (ARCHITECTURE §5.8) is the same tool. **Packets are staged** (CONTENT_GUIDE §9.4): one agent run receives each item's packet a stage at a time, and the tool serves the next stage only once the run's draft check record holds the cold-solve entry for the stage before.

- **The first call** serves stage 1 of every selected item into `.cache/packets/<batch>/<pass>/<item>/stage-1.json`, logs the stage's hash and the time in `served.json`, and prints them. Running it again starts those items' packets over (the log counts `restarts`).
- **`--next --record <draft.json>`** serves each unfinished item its next stage, once the draft (a JSON array of `{ "itemId", "coldSolve" }`, as `content:record` takes them) holds the cold-solve entry, with its `recordedAt`, for the stage the item is at: a choice item's or an encore's answer for stage 1, a mystery's `perClue` entry for each clue. An item still waiting is listed with the reason; with `--items`, a waiting item fails the run.
- **Stages.** Choice items, true/false, comparisons and encores: stage 1, the item as a player meets it (stem and options in a per-pass order, ascending items sorted; a statement; both labels; an encore's question and units), then the final stage. Mysteries: the answer line, clue 1, the category and the answer list file with the version that ships (stage 1), then one clue per stage, the four clue-4 options with clue 4 (stage 4), then the final stage. No stage before the final holds the key, writerNotes, claims, risk, verification, explanation, difficulty, tags or estimate.
- **The final stage** is the full cold view plus the key, explanation, learnMore, volatility and the claims with their risk, so checker A knows which claims need external evidence, and `mythHits`. Still no writerNotes, no rivals or likely guesses, no estimate and no other checker's record. It also gives the two lists the record copies: `packetSha256` (one hash per stage served, in order) and `stagesServedAt`.
- **estimate.json** (pass E): cold plus the key, for judging fame and distractor pull, in one stage. No claims, notes or seed.

Passes A, B and T need the content key (below); before writing a stage of a sealed item the tool runs `git check-ignore -q .cache/packets/probe.json` and stops if it fails. A fixture tree keeps its packets inside it (`<tree>/.cache/packets/`). The batch must be `submitted` (or `checking`) and lint clean, and **every item's `selfCheck` must hold all eleven codes, each `true`** (§2.3, §9.3): an item without it, or with a code missing or false, stops the build with its id. `--force` allows an open batch.

**Option order.** Options are shuffled with `HMAC-SHA256(k_order, "<itemId>|<pass>")`, `k_order` derived from the content key, so nobody holding only a cold stage can undo the shuffle and read off where the key sits. Without a key the tools sort options (the estimator's packet, which shows the key anyway, and record validation). Fixture trees use a fixed public order key.

**The stage hashes** are SHA-256 of the packet version, the pass, the item id, the stage and the item content that stage shows. A cold stage's content is key-neutral (its options as a sorted set, never the answer field), so its hash says nothing about the key; the final stage's covers every field a packet shows (`PACKET_FIELDS` in `packets.ts`). Display names, category names, myth hits and the option order stay out, so the hashes can be recomputed without the key and a reference-file change never invalidates a check. `content:record`, `content:decide` and `content:check` recompute them from the current item; records accepted before staging keep their one hash of the whole packet, which stays verifiable. Building A, B or T packets moves the batch to `checking`; an item moves to `checking` once it carries both a check record and the estimate, because from `checking` on the schema requires `predicted` and `verification` (§2.3).

### content:estimate

```sh
npm run content:estimate -- --batch p.geo.b01 --file estimates.json
```

```json
[
  {
    "itemId": "p.geo.0101",
    "estimator": "es-run7",
    "estimates": [0.62, 0.7, 0.55, 0.68, 0.74]
  },
  {
    "itemId": "m.geo.0101",
    "estimator": "es-run7",
    "estimates": [
      [0.5, 0.8, 0.92, 0.98],
      [0.45, 0.75, 0.9, 0.97],
      [0.55, 0.8, 0.93, 0.98],
      [0.5, 0.78, 0.9, 0.97],
      [0.6, 0.82, 0.94, 0.99]
    ]
  },
  {
    "itemId": "e.0101",
    "estimator": "es-run7",
    "estimates": [
      { "pClose": 0.3, "pExact": 0.02 },
      { "pClose": 0.25, "pExact": 0.01 },
      { "pClose": 0.35, "pExact": 0.03 },
      { "pClose": 0.3, "pExact": 0.02 },
      { "pClose": 0.28, "pExact": 0.02 }
    ]
  }
]
```

Five estimates per item (§8.5), combined by the median on the logit scale; the spread is the standard deviation of the five logits (for mysteries, of the five estimators' expected points, each one's s1 + s2 + s3 + s4, the scale §10.2 picks Mystery 1 by). Writes `predicted` with `estimator: "v0"` (the method version, as §2.7 and §2.8 define it) and adds `{ "by": "es-...", "at": ... }` to `verification.estimates`, so the estimator's run is never accepted later as a checker or the editor of the item. All or nothing. The estimator may not be the writer, a checker or the editor of the item.

### content:record

```sh
npm run content:record -- --batch p.geo.b01 --pass A --file records-a.json
npm run content:record -- --batch p.geo.b01 --pass B --file records-b.json --dry-run
npm run content:record -- --batch p.geo.b01 --pass A --file recheck-a.json --replace
```

The file is a JSON array of CheckRecords (§9.8) with one extra field, `itemId`. Checkers never edit items: this command validates their records and merges them into `verification.checks` (passes A and B) or `verification.tiebreak` (pass T). It is all or nothing: one bad record and nothing is merged. A record is refused when:

- the checker is the batch's writer, the item's editor, the other pass's checker or an estimator of the item (run ids compared), a checker a fabricated-source incident barred from the batch, or a checker an invalid_check incident barred;
- `packetSha256` and `stagesServedAt` are not the lists `content:packets` served this item for that pass (`served.json`), every stage served, or the item changed since its stages were served (the expected values are never printed); a single hash of the whole packet, the form from before staging, is no longer taken;
- a cold-solve entry has no `recordedAt`, or was recorded before its stage was served or after the next one was;
- the pass or brief is wrong, a claim has no result (A and B verify every claim; a checker's additions use its pass's prefix, `xA1` or `xB1`, with `addedClaim` saying what it added), or a result names a claim the item does not have;
- the verdict breaks §9.4 (a refuted claim or a blocker means fail; an uncertain claim or a fixable issue means revise);
- a confirmed claim rests on no entry that confirms: knowledge below `certain`, or a web call that counts at Tier C (its `citedResult`'s tier, or the lowest of its `tiers` when `citedResult` is null, §9.5.2), or one that reports a conflict. Evidence is the guide's array of typed entries (dataset, web, knowledge, calculation) or, in records from before it, one entry with `method`;
- dataset evidence names a dataset that is not in `content/datasets/manifest.json`, or not at its pinned commit or version;
- the cold solve is not honest: `answerGiven` is not one of the packet's options, `matchedKey` is wrong, a miss has no issue explaining it, a mystery record (A or B) has no entries for clues 1 to 3, a mystery leaves rivals after clue 3 without an ambiguity or second_answer issue, or it lists such a rival and still confirms the uniqueness claim (the two contradict; refute or doubt the claim instead);
- the item is not draft or checking, or already has a record for that pass (use `--replace`);
- a knowledge result's `restatement` repeats the claim's wording (case and punctuation ignored): restate the fact in your own words, from your own check (§9.5);
- a file of five or more records spans less time (from the earliest `startedAt` to the latest `finishedAt`) than its items take to check: 30 seconds per mystery and 8 seconds per other item at the very least.

**Every record is your own work on that item.** Do the cold solve, read the reveal and verify each claim yourself, one item at a time. Never generate records with a script or a template, never copy a claim's text in as your restatement, and never set a verdict before you have checked. A batch of templated records is not a check: the editor treats it as missing and the orchestrator voids it and bars the checker from the batch (`content:batch -- incident --kind invalid_check`), active items included. A long batch is supposed to take a long time; if you run short of time, record fewer items honestly and say so in your final answer.

Searches used are added up against the batch's WebSearch cap (§9.5.2, scaled to the batch size; see `content:batch -- status --batch <id>`), and going over it prints a warning.

### content:decide

```sh
npm run content:decide -- --batch p.geo.b01 --file decisions.json
```

```json
[
  {
    "itemId": "p.geo.0101",
    "editor": "ed-run3",
    "decision": "accept",
    "reason": "Both checks pass; c3 has dataset evidence."
  },
  {
    "itemId": "p.geo.0102",
    "editor": "ed-run3",
    "decision": "accept",
    "reason": "Related, not the same fact.",
    "dedupe": "related_ok"
  },
  {
    "itemId": "m.geo.0103",
    "editor": "ed-run3",
    "decision": "accept",
    "reason": "Sources from the evidence.",
    "edits": { "sourceLabels": ["mledoze/countries"] }
  },
  {
    "itemId": "p.geo.0104",
    "editor": "ed-run3",
    "decision": "rewrite",
    "reason": "Checker B: stem misreads.",
    "edits": {
      "stem": "Which instrument opens the spring festival in Halvessa?"
    }
  },
  {
    "itemId": "p.geo.0105",
    "editor": "ed-run3",
    "decision": "rewrite",
    "reason": "Checker A refuted the key.",
    "edits": {
      "answer": "Bone flute",
      "wrong": ["Brass horn", "Hand drum", "Reed pipe"]
    }
  },
  {
    "itemId": "p.geo.0106",
    "editor": "ed-run3",
    "decision": "cut",
    "reason": "Both checks failed (§9.7)."
  }
]
```

- **accept** may edit only `sourceLabels` (which the editor fills from the evidence), `tags`, `lintAllow` and `reviewBy`, the fields no packet shows. It refuses an item that changed after its checks (every A, B and T `packetSha256` is recomputed), then runs the lint, dedupe and myths screen and the acceptance rule of §9.9 (below). A lint warning passes only with the editor's `lintAllow` (ARCHITECTURE §5.2), which the accept may add in its edits; every waived finding is listed in the output and stored in `verification.lint.warnings`. Only an item that passes becomes `active`, with `verification.editor`, `dedupe`, `mythsScreen` and `lint` filled in.
- **rewrite** applies `edits` (top-level fields). Changing anything a packet shows (`KEY_FIELDS`: the claims, the stem, options, labels, values, clues, distractors, question, explanation, learnMore, measure, units, bands, derivation, order and so on), or passing `"recheck": true`, clears the checks and the estimate and sends the item back to draft for two fresh checks and a fresh estimate (§9.7). With `"wordingOnly": true`, rewording `stem`, `question`, `explanation`, `learnMore`, `measure`, `valueDisplay`, `unitShort` or `unitLabel` keeps the checks: their `packetSha256` values are re-stamped to the new packet and the old values, the fields and the editor go into `verification.editor.reason`, a trail carried into every later editor record. `wordingOnly` never covers a claim-bearing field or a true/false statement, which is its key claim. Edits no packet shows (tags, notes, rivals, likely guesses) keep the checks as they are. An item both checks failed is never rewritten: cut it and draft the replacement under a new id (§9.7).
- **cut** sets `cut`. The id is never reused.

The editor may not be the batch's writer, a checker or an estimator of the item, and `id`, `status`, `kind`, `format`, `verification` and `predicted` can never be edited. A near-duplicate flagged by dedupe (score 0.5 or more) needs `"dedupe": "related_ok"` to be accepted; `"duplicate"` refuses it. When the pair crosses the seal (a plaintext item and a sealed one, or a sealed item and a guide example), the refusal names neither the other item nor the score, and a plaintext item stores `nearestId: "sealed"` with `score: null`; `content:dedupe -- --item <id> --reveal` shows the pair in your own terminal.

**The acceptance rule.** Refused unless: (1) passes A and B exist, by two different checkers, neither the writer nor the editor, the tiebreak by a third, every follow-up by a run that is none of the writer, the editor, an estimator or the author of a claim it was sent (the checker whose pass added it), and no checker or the editor wrote the batch or estimated the item; (2) both pass, or one passes and a tiebreak by a third checker passed; (3) every claim in the merged list (the writer's claims plus the additions `verification.merge` lists, less its duplicates; the writer's claims alone without a merge record) is confirmed in both checks (for the non-passing check, by the tiebreak with external evidence; for a check that never saw an addition, by a passing follow-up under that check's brief that was sent the claim), every high-risk claim has dataset, web or calculation evidence in a confirming check (a web call counts at its `citedResult`'s tier, or at the lowest of its `tiers` when nothing is cited, so Tier C never counts) or was confirmed directly by both independent checks (memo §18), an encore's value has two independent external sources, and so does a mystery's Daily key: every clue claim that pins the answer (any clue a rival's `ruledOutBy` names, as the revised guide's §9.5.5 puts it) and any claim with role key, so no Daily mystery goes active on knowledge alone; (4) a mystery's uniqueness claim is confirmed by both A and B, neither found a rival or ambiguity of severity blocker or fix, and neither listed a candidate besides the answer after clue 3, whatever the severity of the issue explaining it; (5) no open blocker, the lint has no errors, dedupe is unique or related_ok, and every claim that resembles a known myth was confirmed by both checks with dataset or web evidence in one of them; (6) the decision is accept, and a `slow` item's `reviewBy` is at most 24 months after it. The item must also carry `predicted` from the estimator. `content:check` re-applies all of it to every active item.

### content:dedupe

```sh
npm run content:dedupe                           # every pair scoring 0.5 or more, bank and guide examples, then X29
npm run content:dedupe -- --threshold 0.7 --json
npm run content:dedupe -- --item p.geo.0101      # the nearest neighbour of one item
npm run content:dedupe -- --write                # record verification.dedupe (unique) on checking items
npm run content:dedupe -- --item m.geo.0101 --reveal   # your own terminal only: name a pair across the seal
npm run content:dedupe -- --cross-pool           # only the cross-pool check (X29), no pairs
npm run content:dedupe -- --strict               # fail on a near-duplicate pair too
npm run content:dedupe -- --sealed               # content/sealed/ in memory (needs the key), redacted output
npm run content:dedupe -- --cross-pool-ok --daily m.geo.0107 --item p.geo.0142 --editor ed-run3 --reason "Both name the country; the clue is about its flag."
npm run content:dedupe -- --cross-pool-ok --daily e.0104 --item r.all-sorts.06 --editor ed-run3 --reason "Same bridge, different measure." --json
```

Near-duplicate detection across the whole bank and the worked examples in `docs/CONTENT_GUIDE.md` (read, never written). Each item becomes a set of content words from the text that carries its fact (stem and key, a true/false statement, comparison labels and measure, a mystery's clues and answer, an encore's question), folded, with stopwords and plurals trimmed, plus answer keys. A pair scores the larger of Jaccard similarity and 0.8 times containment; a shared answer lifts it to at least 0.5 + 0.5 times that, and two mysteries with the same answer score at least 0.9. At 0.5 and up, C22 warns and the editor decides. Output is ids and scores only, never item text. `--write` records `verdict: "unique"` only for items below the threshold; flagged ones wait for the editor in `content:decide`.

**Pairs across the seal.** A plaintext item, or a guide example (the guide prints its answers), named next to a sealed item gives the sealed answer away by inference, and the content-sealed job's logs are public. So without `--reveal` such a pair is listed under its sealed id only (`m.geo.0102  a public item`), with no score or reason, in the text and the JSON output alike; `content:check` reports it only on the sealed side ("near-duplicate of a public item") and compares plaintext items with public entries only. `--reveal` (in `content:check` and `content:dedupe`) names both sides, for your own terminal only.

**The cross-pool check** (X29, AC-CNT-06, the one `content:check` runs). Whenever sealed items are loaded (the workspace, or `--sealed`), no practice or room item may share a fact with a Daily item. X29 compares every Daily item in play (a mystery or an encore, not cut or retired) with every practice item and room question in play, and flags each pair scoring 0.5 or more, not only the nearest. A pair an editor judged `related_ok` is skipped while that judgment stands (below). Each Daily item with a pair left is an error named on the sealed side only, and so is each room question with one, printed after the pairs as `error X29 m.geo.0101: ...` with the number of pairs left and how many of them carry a judgment that lapsed; then the counts, and a note with how many flagged pairs a judgment covered. When no sealed Daily item is loaded, a note says the check did not run. `--cross-pool` runs this check alone and lists no pairs. `--item <id>` adds the pairs X29 flags for that item, with each judgment's state (`related_ok holds`, `lapsed`, `invalid` or none): a pair with a practice item crosses the seal, so without `--reveal` only its counts print, while a room question and a Daily item, both sealed, are named. `--json` adds `ok`, `crossPoolRan`, `crossPool`, `crossPoolJudged`, `crossPoolLapsed` and `notes` to `indexed`, `threshold`, `pairs`, `written` and `leftForEditor`. With `--fixtures` (CI's "Fixture cross-pool check": `--cross-pool --fixtures --root content/fixtures`) the fixture Mysteries and Encores count as Daily items, and each fixture Encore also fails X29 when a practice or room item's player-facing text gives its figure beside two of its subject words (R2-22); since nothing in a fixture tree is sealed, that finding's message names the practice item. Exit code 1 on any X29 finding; a near-duplicate pair is a C22 warning for the editor and fails the run only with `--strict`; 2 on a bad option.

**`--cross-pool-ok`** records the editor's judgment on one pair X29 flags: the two share an entity but state different facts (CNT-2b). It needs `--daily <id>` (the Daily item: a mystery or an encore), `--item <id>` (the practice item or room question it is judged against, which covers X29's room side too), `--editor <ed-...>` and `--reason <text>`, and takes nothing else but `--json`, `--root` and `--fixtures` (exit 2 otherwise). The judgment is stored on the sealed Daily item, never on the public one, since a public file never names a sealed id: `verification.crossPool` gains `{ "itemId", "decision": "related_ok", "by", "at", "reason", "pairSha256" }`, one per pair, and recording a pair again replaces its judgment. `pairSha256` hashes both items' ids and packet fields (`PACKET_FIELDS`, the fields a checker's packet shows), so the judgment lapses as soon as either item changes in one of them, as an accepted item's checks do, and X29 reports the pair again; tags, notes and verification records leave it standing. It is refused unless both items are in play and X29 flags the pair, and from an editor id that is not `ed-...` or whose run wrote, checked or estimated either item (§0.2); `content:check` applies the same rule to every stored judgment, so a hand-edited one by such a run does not count (`invalid`). What it prints names the Daily item and counts only, never the other item beside it, and `--json` prints `{ ok, dailyId, decision, by, against, replaced, judgments }`. Run `content:seal` after it. On a fixture tree (`--root <dir> --fixtures`) X29 reads the judgment too, since the fixture Mysteries and Encores count as Daily items there (above).

**`--sealed`** decrypts `content/sealed/` in memory with the content key (`QZ_CONTENT_KEY` or `~/.config/quiz-web-app/content.key`) instead of reading the workspace, and everything then goes through the redacting reporter of ARCHITECTURE §5.4: `error m.geo.0101 X29`, each pair as a C22 warning under one id, a note or two and the counts, and an error thrown while sealed content is open prints one line that says nothing about it. Judgments stored in the envelopes count there too. `--item`, `--write`, `--reveal` and `--cross-pool-ok` read the workspace in your own terminal, so they refuse `--sealed` (exit 2). `--skip-guide` leaves the guide's examples out, and `--root <dir>` with `--fixtures` runs over a fixture tree, its Mysteries and Encores counting as Daily items (above).

### Cross-pool overlaps: retire or related_ok

X29 is a similarity proxy: a flagged pair can share a fact, or only an entity (the same country, film or person) while each states something different. Decide each pair by reading both items, in your own terminal: `npm run content:unseal`, then `npm run content:dedupe -- --item <daily id> --reveal` lists the pairs X29 flags for it, with their scores and judgments. This runs on the content tree (`content/` with its `.sealed-plain/` workspace), or on a fixture tree with `--root <dir> --fixtures`, where the fixture Mysteries and Encores count as Daily items.

| What the two items share                                                                  | What to do                                                                                        | Command                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A fact: one gives the other's answer away, or a player of one would learn the other's key | Take the public item out of play: the practice item, or the room question for a room-side finding | `content:batch -- retire --item <public id> --editor <ed-...> --kind other --reason <text>` (`--kind cross_pool` for a room question) |
| An entity, with different facts: neither tells you the other's answer                     | Record `related_ok` with the reason                                                               | `content:dedupe -- --cross-pool-ok --daily <daily id> --item <other id> --editor <ed-...> --reason <text>`                            |

Notes for editors:

- **Retire the public side, not the Daily item.** The Daily item is the scarce one (every slot of every category is planned, §10.5), and the practice bank has slack. Retire a Daily item only when it is wrong in itself, and mind the schedule guard: it is probably already on a Daily.
- **A public reason is public.** On a practice item the retirement record is committed in plaintext beside the item's stem, answer and explanation, so it must not say that a Daily item shares the fact: retire it with `--kind other` and a neutral reason such as "Overlaps another item; replaced.", never the Daily item's id, its Daily's number or date, its answer or its clue, nor the words Daily, mystery, encore or sealed. The command refuses `--kind cross_pool` on a practice item, and ids, Daily numbers, dates (ISO or written out) and those words in its reason; only a person can keep a clue's words out. Commit retirements in batches, not one per Daily, so their timing ties no practice item to one Daily.
- **A judgment's reason is sealed.** It lives on the Daily item, so say plainly why the facts differ ("the mystery's clue is about the flag; the practice item asks for the capital").
- **Judgments lapse.** Rewording either item in anything a packet shows (stem, options, clues, question, explanation, claims) lapses the judgment, and X29 reports the pair again until you record it again. That is deliberate: the reason was about the old wording.
- **One run, one role.** Only an editor records a judgment or retires an item, and never one whose run wrote, checked or estimated either item.
- **Seal and commit.** Both commands change the workspace when the item is sealed: `npm run content:seal`, then commit the envelopes, never plaintext. A retired practice item also needs `npm run content:build` and its rebuilt outputs committed.

### content:datasets

```sh
npm run content:datasets                    # fetch everything, verify every hash
npm run content:datasets -- --key ptable
npm run content:datasets -- --list
npm run content:datasets -- --force         # download again even when the cache matches
```

Downloads the datasets pinned in `content/datasets/manifest.json` into `.cache/datasets/<key>/` (git-ignored) and checks each file against its SHA-256. GitHub files come from `raw.githubusercontent.com` at the pinned commit (MoMA's Git LFS file from `media.githubusercontent.com` at the commit); npm tarballs are checked against the registry's sha512 integrity before anything is read, and members are read in memory and written only to the paths the manifest names. Datasets are data: nothing in them is ever executed. Each folder gets a `PROVENANCE.json`. The script runs Node with `--use-env-proxy`, so it works behind an HTTPS proxy.

To add a dataset, find the commit with `git ls-remote https://github.com/<owner>/<repo>.git HEAD`, add an entry with each file's URL at that commit, its `sha256` and `bytes`, the licence, `sourceLabel`, `use` and `knownIssues`, then run `content:datasets -- --key <key>`.

| Key                    | Source                                               | Licence                      | Good for                                           |
| ---------------------- | ---------------------------------------------------- | ---------------------------- | -------------------------------------------------- |
| `mledoze-countries`    | mledoze/countries@6031f5d                            | ODbL-1.0                     | ISO codes, capitals, borders, areas                |
| `cldr-territories`     | unicode-org/cldr-json@7d2b9cb                        | Unicode-3.0                  | English country names and variants                 |
| `cldr-languages`       | unicode-org/cldr-json@7d2b9cb                        | Unicode-3.0                  | English language names                             |
| `ptable`               | Bowserinator/Periodic-Table-JSON@a78c7a4             | CC-BY-SA-3.0                 | Atomic numbers, symbols, groups                    |
| `geonames-cities`      | npm cities.json@1.1.65                               | CC-BY-4.0 (GeoNames)         | City coordinates, countries, admin1                |
| `world-cities`         | datasets/world-cities@73c9f54                        | CC-BY-4.0 (GeoNames)         | Larger cities with their divisions                 |
| `country-codes`        | datasets/country-codes@2d84034                       | ODC-PDDL-1.0 and CC-BY-4.0   | ISO, FIFA, IOC and other codes                     |
| `language-codes`       | datasets/language-codes@620566f                      | ODC-PDDL-1.0 and Unicode-3.0 | ISO 639 codes and names                            |
| `currency-codes`       | datasets/currency-codes@31cfa13                      | ODC-PDDL-1.0                 | ISO 4217, with withdrawal dates                    |
| `iso-3166-regions`     | lukes/ISO-3166-Countries-with-Regional-Codes@145f1ad | CC-BY-SA-4.0                 | UN M49 regions per country                         |
| `worldcup`             | openfootball/worldcup.json@516d382                   | Public domain                | Men's World Cup results, 1930 to 2022              |
| `nobel-prizes`         | iaseth/nobel-prize-data@63e8e44                      | MIT                          | Nobel Prizes to 2022 (Nobel API v1 copy)           |
| `nobel-laureates-2016` | NobelDB/NobelDB-Data@de9a728                         | Apache-2.0                   | Laureates' birth and death details, to 2016        |
| `olympic-editions`     | moderndive/olympicAthletes@a8de42e                   | CC-BY-4.0                    | Host cities, dates and medal tables of every Games |
| `moma-artists`         | MuseumofModernArt/collection@51a140d                 | CC0-1.0                      | Artist dates, nationality, QIDs                    |
| `tate-artists`         | tategallery/collection@a51d8af                       | CC0-1.0                      | Artist dates and places                            |
| `natural-earth`        | nvkelso/natural-earth-vector@ca96624                 | Public domain                | Countries, rivers, lakes, places, regions          |

Read each entry's `knownIssues` before relying on it: a dataset is evidence, never the truth (§9.5.1). No openly licensed UNESCO World Heritage list could be pinned from GitHub or npm (the one package found ships an R binary, another fetches UNESCO's site at run time), so World Heritage claims need web evidence.

### content:keygen, content:seal, content:unseal

```sh
npm run content:keygen               # once per project; refuses to overwrite a key
npm run content:keygen -- --check    # is a key available? prints its fingerprint
npm run content:unseal               # envelopes -> content/.sealed-plain/
npm run content:unseal -- --force    # also overwrite workspace files that differ
npm run content:unseal -- --verify   # decrypt every envelope in memory, print only counts
npm run content:seal                 # changed workspace files -> envelopes
```

Sealed files (mysteries, encores, room packs, schedule, spares) are committed only as AES-256-GCM envelopes, `content/sealed/<folder>/<id>.json.enc` holding `{ "v": 1, "alg": "A256GCM", "kid": "k1", "iv", "data", "tag" }` (ARCHITECTURE §5.4). Writers and checkers work in `content/.sealed-plain/`, which is git-ignored; every command that writes there first runs `git check-ignore -q content/.sealed-plain/probe.json` and stops if it fails (§11.2). Seal at every checkpoint, because the workspace dies with the sandbox. Never copy plaintext anywhere else: not the scratchpad, logs, messages or commit text.

- **The key.** One 32-byte master key, from `QZ_CONTENT_KEY` (base64) or `~/.config/quiz-web-app/content.key` (base64, mode 0600), never from the repo. `content:keygen` creates the file and prints only a fingerprint. Store the key in a password manager and add it as the `QZ_CONTENT_KEY` GitHub secret.
- **Key derivation.** HKDF-SHA256 over the master key with salt `quiz-web-app/content-seal/v1` (UTF-8) gives three 32-byte keys: `k_enc` with info `qz-content k1 aes-256-gcm key`, `k_iv` with info `qz-content k1 iv hmac-sha256 key`, and `k_order` with info `qz-content k1 packet order key`, which seeds the option order of checker packets (`HMAC-SHA256(k_order, "<itemId>|<pass>")`) and never encrypts anything.
- **IV.** The first 12 bytes of HMAC-SHA256(`k_iv`, plaintext). The same plaintext always gives the same envelope, so diffs stay clean, and an IV repeats only for identical messages. No additional authenticated data; the id inside the decrypted file is checked against the file name instead.
- `content:seal` writes only envelopes whose plaintext changed and reports envelopes with no plaintext (it never deletes them). A file that is not valid JSON is sealed anyway, so work is never lost, and reported as an error. `content:unseal` keeps a workspace file that differs from its envelope unless `--force`, and reports envelopes it cannot decrypt.
- With `QZ_SEALED_PLAINTEXT=1` (the upgrade path if the repository ever goes private) both commands are no-ops.
- **The output rule** (ARCHITECTURE §5.4). Anything that reads sealed content (`content:check`, `content:dedupe`, `content:stats`, `content:record`, `content:decide`, `content:batch -- retire`) prints item ids, rule codes, field paths and counts, never a clue, key, entity name, alias or number from the content, and no line joins a public item to a sealed one; a test plants failures in sealed fixtures, adds a public item that shares a sealed answer, and checks both output streams, with a cross-pool judgment recorded and a sealed retirement refused. Nothing written to a public file names a sealed item either: cross-pool judgments live on the sealed side, and a practice item's retirement reason may not name one. `--reveal` (in `content:check` and `content:dedupe`) is the only way to see excerpts or a cross-seal pair.
- `content/sealed/README.md` holds the recovery notes: where the key lives and how to get it back.

### content:stats

```sh
npm run content:stats
npm run content:stats -- --json --today 2026-12-01
npm run content:stats -- --sealed
```

Counts by pool, category, difficulty band (from `predicted.p` when present, else the seed; mysteries by slot; encores by `predicted.pClose`: easy at 0.5 or more, medium 0.2 to 0.49, hard below 0.2, §8.4), format and status, the answer lists, each batch's progress against its target, and the Daily runway: main-track Dailies scheduled from today, how many in a row, the alarm below 30 (§10.7), how many more Dailies the unscheduled active pool could fill, and the main track's spare sets.

### content:release

```sh
npm run content:release -- --version 3                  # the sealed release (needs the content key)
npm run content:release -- --version 3 --json
npm run content:release -- --version 4 --allow-frozen   # a correction that changes a frozen Daily
npm run content:release -- --version 3 --out supabase/.generated/r3.sql --chunk-kb 120
npm run content:release -- --version 3 --today 2026-12-01
npm run content:release -- --fixtures                   # write the e2e track's seed and its SQL test
npm run content:release -- --fixtures --check           # compare both with what is committed
```

The sealed release (SQL-3, ARCHITECTURE §5.4). It decrypts `content/sealed/` in memory with the content key (`QZ_CONTENT_KEY` or `~/.config/quiz-web-app/content.key`; with `QZ_SEALED_PLAINTEXT=1` it reads the workspace instead), validates it as `content:check -- --sealed` does, and writes `supabase/.generated/content-release-<n>.sql`, which git ignores. Nothing is written when the content does not validate, when a chunk could not be sent unattended, or when `--out` names a path git does not ignore, since the file holds sealed plaintext.

- `--version <n>`: letters, digits, `.`, `_` or `-`, starting with a letter or digit, up to 64 characters; it becomes `content_releases.version`.
- The file is a list of chunks, each one statement of at most `--chunk-kb` kB (default 60, from 4 to 400): content rows (mysteries, encores, sealed questions, room packs, challenge packs), then schedule rows (Dailies, spare sets), then `private.verify_release`, then `private.record_release`, which records the release last. Answer entities load earlier, from `supabase/seed/answer-entities.sql`. Send each chunk as its own `execute_sql` call, in order, and stop at the first that fails. Loading a release again changes nothing, and an older release is refused at its first chunk.
- `--allow-frozen` lets the loaders change frozen Dailies and the items on them, for a correction; without it they refuse those rows. `--today <date>` sets the date the validation rules read (default: today, UTC).
- Everything it prints goes through the redacting reporter: ids, rule codes, field paths and counts, never content. `--json` prints that report with the version, the track, the counts, the number of ready Dailies and each chunk's label, rows and bytes.
- `--fixtures` builds the e2e track's release from `content/fixtures/` instead (§5.6, §8.17) and writes the committed `supabase/seed/e2e-track.sql` and `supabase/tests/content/fixture-release.test.sql`. With `--check` it writes nothing and fails when either file differs from what it would write.

Exit code 1 when the content does not validate, the key is missing, nothing could be written or `--fixtures --check` finds a stale file; 2 on a bad option, as every content command.

### check:secrets

```sh
npm run check:secrets
```

`scripts/checks/secret-scan.mjs`, also the first step of `npm run check` and a CI step, and the last local gate before a push. It fails if:

- `content/.sealed-plain/`, `.cache/packets/` or `supabase/.generated/` is not git-ignored (`git check-ignore`), because then the workspace or a packet is one `git add -A` from a commit;
- any file under `content/sealed/` is not a valid envelope named `<folder>/<id>.json.enc`, in the working tree or in the index (what the next commit holds);
- anything under `content/.sealed-plain/`, `.cache/` or `supabase/.generated/` is tracked (staged files count), or a key file is tracked;
- a tracked, staged or untracked (not ignored) JSON file outside the fixture trees holds sealed content: an object with `kind` mystery, encore or choice, a `clues` array, a packet header (`stage` cold or reveal), or an `id`, `itemId`, `nearestId` or `contentId` naming a sealed item without the `fx.` prefix;
- a text file holds a `QZ_CONTENT_KEY` value, or, when the key is available on the machine, the key's base64 or hex text anywhere, labelled or not. The key is never printed.

It reads `git ls-files`, the envelopes and the files git would commit, so it takes a second or two.

## The lint

`content:check` runs these. Errors block; a warning passes only with an editor's `lintAllow` (`{ "rule": "C19", "text": "...", "reason": "..." }`), which `content:decide` requires before it accepts. A `lintAllow` waives any warning, the C06, C08 and C09 errors, and C17's near-tie dates when its `text` covers the flagged words. Other errors cannot be waived. The lint is version 1.1 (`verification.lint.version`).

| Rule       | Severity                                             | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01        | error                                                | Schema valid for its file type; unknown keys refused; ids match file names and folders; UTF-8 NFC, LF                                                                                                                                                                                                                                                                                                                                                 |
| C02        | error (warn over 25 in rooms)                        | Explanation of 35 words or fewer                                                                                                                                                                                                                                                                                                                                                                                                                      |
| C03        | error                                                | Stem of 120 characters or fewer, 100 in rooms; an mc or room stem ends with "?"; an encore question of 120 or fewer                                                                                                                                                                                                                                                                                                                                   |
| C04        | error, warn                                          | Option over 60 characters (30 in rooms); over 24 warns; a comparison label over 40 characters                                                                                                                                                                                                                                                                                                                                                         |
| C05        | error                                                | All/none of the above, both or neither as an option                                                                                                                                                                                                                                                                                                                                                                                                   |
| C06        | error, warn in clues                                 | not, never, except or isn't as words in a stem, statement or encore question                                                                                                                                                                                                                                                                                                                                                                          |
| C07        | error                                                | The key longest by more than 50% and more than 15 characters                                                                                                                                                                                                                                                                                                                                                                                          |
| C08        | error                                                | Numeric dates such as 03/04/2025 or 2025-04-03 (not fractions like 3/4)                                                                                                                                                                                                                                                                                                                                                                               |
| C09        | error                                                | Time words: current, currently, latest, now, today, this year, recent, recently, newest, reigning, so far, to date, as of                                                                                                                                                                                                                                                                                                                             |
| C10        | warn                                                 | A US spelling or -ise form from `reference/spelling.json`, outside proper nouns, quotations and mid-sentence capitals                                                                                                                                                                                                                                                                                                                                 |
| C11        | error (curly or double quotes warn)                  | En or em dash, double or trailing space, line break, URL, HTML, Markdown (single-asterisk or underscore emphasis too) or emoji                                                                                                                                                                                                                                                                                                                        |
| C12        | error, warn                                          | Clue over 140 characters; a clue with the answer's name or alias, a significant word of either (4 or more characters, not a stopword), a word beginning with one, or a giveaway term; a word sharing the first four letters warns                                                                                                                                                                                                                     |
| C13        | error                                                | Clue 4 holds a significant word of the answer's display form, qualifier included                                                                                                                                                                                                                                                                                                                                                                      |
| C14        | error                                                | Answer, accepted, distractors, rivals and likely guesses exist in the type's list, are active and not `replacedBy` another entry; distractors distinct; the list big enough for the slot (30, or 100 for slots 2 and 3); a scheduled answer past the 30-day freeze                                                                                                                                                                                    |
| C15        | error                                                | Encore: positive answer; years whole from 1 to 9999 with no unit; decimals match; quantities of 20 or more unless bands are overridden; bands sane (bullseye under close, never over 10%); no temperature units; `unitShort` and `unitLabel` empty for years and named for quantities; a derivation whose formula is plain arithmetic reproduces `unrounded`, and the answer equals `unrounded` (rounding none) or sits inside the bullseye around it |
| C16        | error                                                | tfKind matches the answer; no question mark                                                                                                                                                                                                                                                                                                                                                                                                           |
| C17        | error (some warn)                                    | The answer wins under the relation; dates 10 or more years apart (closer is an error only a C17 `lintAllow` stating both exact days waives), latitudes 0.5° apart, quantities 1.1 times apart unless exact counts; the stem names the relation (warn)                                                                                                                                                                                                 |
| C18        | error (warn)                                         | Ascending options start with a number and sort uniquely; no duplicate options; all-number options with shuffle warn                                                                                                                                                                                                                                                                                                                                   |
| C19        | warn                                                 | A superlative or first word with no high-risk claim behind it (any `riskReason`, as §2.13 says)                                                                                                                                                                                                                                                                                                                                                       |
| C20        | warn                                                 | The bare word football                                                                                                                                                                                                                                                                                                                                                                                                                                |
| C21        | error in encores, warn elsewhere                     | Ambiguous units (ton, gallon, ounce, pint, cup, calorie; not "World Cup"); °C, °F or degrees in an encore                                                                                                                                                                                                                                                                                                                                             |
| C22        | warn                                                 | A near-duplicate of a bank item or a guide example (see content:dedupe)                                                                                                                                                                                                                                                                                                                                                                               |
| C23        | error                                                | A term on the shared slur list. The term is never printed                                                                                                                                                                                                                                                                                                                                                                                             |
| C24        | error                                                | Id pattern; batch registered, open and issued that sequence (to `--writer` if given); no `fx.` ids in the bank and only `fx.` ids in fixtures; no reserved example ids (batch 00, rooms 90 to 99); room packs are the eight of §10.9. List entries: a known source (warn)                                                                                                                                                                             |
| C25        | warn                                                 | A claim that resembles `reference/myths.json`; a surprising truth that reads like a myth                                                                                                                                                                                                                                                                                                                                                              |
| X01        | warn                                                 | A mystery answer type outside its category's types (§1)                                                                                                                                                                                                                                                                                                                                                                                               |
| X02        | warn                                                 | The answer is the only clue-4 option with a bracket or qualifier (§2.10 rule 6)                                                                                                                                                                                                                                                                                                                                                                       |
| X03        | warn                                                 | A batch's true/false answers more than one away from an even split (§2.5)                                                                                                                                                                                                                                                                                                                                                                             |
| X04        | warn, error once closed                              | A room pack without exactly 15 questions in play (§2.9)                                                                                                                                                                                                                                                                                                                                                                                               |
| X05        | warn                                                 | The pack template: 6 easy, 6 medium, 3 hard; 1 to 3 easy; medium finale; no two hard in a row; a hard one at 8 or later; no repeated answer (§10.9)                                                                                                                                                                                                                                                                                                   |
| X06        | warn                                                 | Year encores above a quarter of a batch, or the plan's cap (§6 rule 9)                                                                                                                                                                                                                                                                                                                                                                                |
| X07        | warn                                                 | More than 10% true/false among a category's active items (ARCHITECTURE §5.2)                                                                                                                                                                                                                                                                                                                                                                          |
| X08        | warn                                                 | No claim with role explanation: list the explanation's facts, or record a `lintAllow` when it states none (the guide's e.0004 shows only its method)                                                                                                                                                                                                                                                                                                  |
| X09        | error                                                | A shipped list over 80 kB gzipped in its client projection, `[id, display, keys, popularity]` per active, unreplaced entry (ARCHITECTURE §5.5)                                                                                                                                                                                                                                                                                                        |
| X10 to X14 | error                                                | Schedule: rounds name active items of the right kind (round types are ARCHITECTURE §3.3's: an mc, tf or comparison round names a sealed choice item of that format), or, on a Daily that has closed, an item retired since it played; mystery difficulty matches slot; three categories and three answer types; no item within 365 days, no answer within 60; global items only                                                                       |
| X15        | error (warn before the commit)                       | An answer list's `liveAt` is the UTC date of the commit that first published its version, and every entry the version added carries `addedIn` equal to it; a published version never changes its entries (git history, CONTENT_GUIDE §2.10 rule 5)                                                                                                                                                                                                    |
| X16        | error                                                | The display rules of CONTENT_GUIDE §2.10: "Title (Year)" films, "Title (Author)" books, "Name, Country" cities and landmarks, a descriptor only on a name collision, no bracket or spaced hyphen elsewhere, and the six country overrides                                                                                                                                                                                                             |
| X17        | error with `--launch`                                | Each list at its PRD §3.18.4 minimum (AC-CNT-03)                                                                                                                                                                                                                                                                                                                                                                                                      |
| X18        | error                                                | A pack over 40 kB gzipped, all packs over 400 kB, or an item the build cannot convert (ARCHITECTURE §5.2, §5.3)                                                                                                                                                                                                                                                                                                                                       |
| X19        | warn, error with `--launch`                          | 100 active practice items per category; with `--launch` also at most 10% true/false and 40/40/20 by predicted _p_ within 5 points (AC-CNT-04)                                                                                                                                                                                                                                                                                                         |
| X20        | error                                                | One main-track Daily per date from `DAILY_EPOCH` to the last (the e2e track fills its undated days from its spares, so it skips this and X26); with `--launch`, 100 consecutive Dailies and 20 spare sets (AC-CNT-02)                                                                                                                                                                                                                                 |
| X21        | error (warn once frozen)                             | Each Mystery's predicted points inside its slot's window (3.2 to 3.6, 2.5 to 2.9, 1.9 to 2.3) and the Daily's total inside 7.8 to 8.6 (8.2 to 8.8 for Dailies 1 to 7); `predictedPoints` equals the sum (§10.2)                                                                                                                                                                                                                                       |
| X22        | error                                                | Within a Daily: the encore's category differs from the mysteries', one item is counterintuitive, no two items share a tag, and no mystery offers another's answer (§10.3)                                                                                                                                                                                                                                                                             |
| X23        | error                                                | The week rules of §10.4 over consecutive Dailies, mystery slots only for categories                                                                                                                                                                                                                                                                                                                                                                   |
| X24        | error                                                | An answer from the last 7 days used as a distractor (§10.5)                                                                                                                                                                                                                                                                                                                                                                                           |
| X25        | error                                                | A composition with no share layout in `content/compositions.json`, or one that can't fit (ARCHITECTURE §4.9)                                                                                                                                                                                                                                                                                                                                          |
| X26        | warn                                                 | Fewer than 30 main-track Dailies from today: the runway alarm (§10.7)                                                                                                                                                                                                                                                                                                                                                                                 |
| X27        | error                                                | A sealed item scheduled on or after its `reviewBy` (§9.9 rule 7)                                                                                                                                                                                                                                                                                                                                                                                      |
| X28        | error                                                | A frozen or published Daily, or a spare set a spare order names, without a passing pass D on every item for that date (null for a spare) against the list versions that ship now (§9.9 rule 7, AC-CNT-01)                                                                                                                                                                                                                                             |
| X29        | error with sealed items loaded, or with `--fixtures` | A practice or room item that shares a fact with a Daily item, reported on the sealed side only (AC-CNT-06); a pair an editor judged `related_ok` is skipped while neither item changes, and retired items are never read; with `--fixtures`, also a fixture Encore whose figure a practice or room item gives beside two of its subject words, naming that item                                                                                       |
| X30        | error, warn                                          | A spare order naming no main-track spare set; a main-track Daily with no spare order while spare sets exist (warn)                                                                                                                                                                                                                                                                                                                                    |
| X31        | error                                                | A generated output that differs from what `content:build` writes, is missing, or is stale                                                                                                                                                                                                                                                                                                                                                             |
| X32        | warn, error with `--launch`                          | The latest pre-launch seeded audit record misses AC-CNT-05 (CONTENT_GUIDE §9.10); with `--launch`, no pre-launch record at all is an error too. Every audit record is also checked against its schema (C01)                                                                                                                                                                                                                                           |
| X33        | error                                                | A mass, length or area comparison asks a bare bigger/larger/greater/smaller: the stem names the measure (§2.6); no `lintAllow` waives it                                                                                                                                                                                                                                                                                                              |
| X34        | warn                                                 | More than 40% of a pool's ascending keys at one display position, once the pool has 5 or more (§4 rule 7); sealed pools are not named                                                                                                                                                                                                                                                                                                                 |
| X35        | warn                                                 | A clue-4 option breaks a letter rule clue 3 states about the answer's own name (begins or ends with, a double letter, a letter count), so it is out at a glance (§5.5; RITE round 3, R3-04); an editor reads each finding                                                                                                                                                                                                                             |

CNT-1 also adds three item checks under existing codes: **C18**, ascending options must yield one sort-key form under the engine's own `sortKeys` (ARCHITECTURE §4.12); **C15**, a quantity answer of 20 needs `bands`, and custom bands keep 4 decimal places (§4.6); **C14**, a mystery's list holds 100 active entries whatever the slot (PRD §3.18.4). A rule that arrived after an item was accepted must not turn the bank red overnight, so on an item that is already `active` these three warn, and on anything else (and on everything with `--launch`) they fail. Spare sets also get X10 to X12 and X14, which the lint runs on dated Dailies only. The schedule rules apply to the main track; the e2e fixture track follows its own cycle (content/fixtures/README.md).

Not machine-checkable, so left to people: interest and footholds (§3.1), one defensible answer (§3.2), regional fairness, sensitivity and tone, distractor plausibility, and whether a clue really narrows.

## Files

```
content/
  categories.json           The twelve categories (id, slug, name, shortName, order)
  batches.json              The batch register, seeded with the production plan below
  practice/<slug>/<id>.json Practice items (plaintext, ship to clients)
  answer-lists/<type>.json  Closed answer lists
  sealed/<folder>/*.json.enc  Envelopes only
  .sealed-plain/<folder>/   Git-ignored plaintext workspace (content:check flags any other file under content/ outside this layout)
  fixtures/                 Fixture trees: fx. ids, plaintext, sealed kinds directly in the root
  datasets/manifest.json    Pinned datasets
  reference/spelling.json   US and -ise to Oxford spelling pairs, proper-noun allowlist (C10)
  reference/stopwords.json  Words the giveaway lint ignores (C12, C13)
  reference/myths.json      Widely believed false claims (C25), 122 seeded
  reference/slurs.json      The seed slur list (C23), ROT13-encoded
  sealed/challenge-packs/, sealed/list-requests/   Envelopes the bank loader leaves out; content:check validates them
.cache/packets/<batch>/<pass>/   Blind packets (git-ignored): <item>/stage-<k>.json as served, and served.json
.cache/datasets/<key>/          Downloaded datasets (git-ignored)
public/content/packs/, public/content/lists/   content:build's hashed packs and lists (committed, never edited)
src/content/generated/          content:build's manifest and static modules (committed, never edited)
src/backend/mock/fixtures.generated.ts         content:build's mock fixtures, from content/fixtures/ only
supabase/seed/{answer-entities,practice-items,config}.sql   content:build's SQL loads
scripts/content/build.ts, check.ts             The two CNT-1 CLIs; their logic is in scripts/content/lib/
```

**The slur list.** PRD §3.9.4 asks for one list in the repo, reviewed by the content team. `content/reference/slurs.json` is a conservative seed: terms that are slurs in every common sense, leaving out words with innocent meanings (such as embankments, cigarettes and place names). Terms are ROT13-encoded so they never show up in diffs, searches, logs or agent transcripts; decode locally to review (the file's `note` has a one-liner). Matching folds case and accents; terms of five letters or fewer match whole words (with plural endings), longer ones also inside words, after allowlisted phrases are removed. ARCHITECTURE §8.13 puts the player-facing list in `content/safety/slur-terms.txt` and `allowlist.txt` (MOD-1); when those exist, C23 reads them too, so both filters share one list. MOD-1 should seed its file from this one.

**The production plan** in `batches.json`, with accepted targets (writers draft about 15% more, recorded as `plan.draft`):

- practice: `p.<cat>.b01` and `b02` per category, 63 each (mc 50, tf 6, comparison 7; easy 25, medium 25, hard 13 by `seededDifficulty` band): 1,512 in all;
- mysteries: `m.<cat>.b01` per category, 30 each (10 per slot), with the category's answer types from §1;
- encores: `e.b01` to `e.b03`, 40 each, every category 10 across the three, at most 10 years each;
- rooms: `r.<pack>.b01` for the eight packs of §10.9, 15 each (6, 6 and 3), with the pack's category mix;
- lists: 38 batches sized to the §11.4 minimums (country 190, element 118, then batches of 100 up to city 300, person 1,000, film 500, tv_series 200, book 300, animal 300, landmark 200, music_artist 500, dish 200, sport 100), each with its domain.

Every batch starts `planned` with `writer: null`; the editor opens it.

## Additions and choices to confirm

The schemas follow CONTENT_GUIDE §2 and §9.8 exactly, fields marked + included, with these choices where the guide is silent or two inputs differ:

1. **Register status `planned`** (writer null) before a batch is opened; §11.3 lists only open, submitted, checking and closed. The production plan in this register differs from §11.4's five batches of 25: it follows the orchestrator's plan above.
2. **Room questions carry `predicted`** like every other item, following ARCHITECTURE §5.1.1 (which owns formats) over §2.9's "except predicted": §8.5 has the estimator score room items and the pack template bands them by `predicted.p`. A pack file may hold more than 15 questions while its batch is open (writers draft 18); X04 becomes an error once the batch is closed.
3. **Status gates the schema** as §2.3 and ARCHITECTURE §5.1.1 say: a draft needs shape only; `checking`, `active` and `retired` items carry `predicted` and `verification`. So the tools move an item to `checking` when the second of the two arrives (a check record from `content:record`, the estimate from `content:estimate`), not when packets are built.
4. **§9.9 rule 2** is applied literally: a pass plus a revise is accepted only after a passed tiebreak, or after a rewrite with two fresh checks. A `wordingOnly` fix keeps the checks but leaves the revise verdict standing. The editor should confirm this is intended.
5. **"A Daily key needs two external sources" (§9.9 rule 3).** Mysteries have no claim with role key in the guide's examples, so a mystery's key is read as its pinning clues: every clue claim for a clue a rival's `ruledOutBy` names needs two independent external sources, as the revised guide's §9.5.5 says, and so does any claim with role key. Rivals are required and each names a clue, so no Daily mystery goes active without external evidence.
6. **Myths screen.** A hit counts as cleared once both checks confirmed that claim and one of them (or the tiebreak) carries dataset or web evidence for it; a debunking claim matches its myth by design. Two knowledge-only confirmations never clear a famous myth (§9.1).
7. **Accept edits** are limited to `sourceLabels`, `tags`, `lintAllow` and `reviewBy`, the fields no packet shows; `reviewBy` is on the list because the editor sets it at acceptance (§2.3).
8. **Packet hashes and old items.** `packetSha256` (packet version 2) covers the item's own packet-visible fields only. Changing what a packet shows needs a new version, with the old version's hash kept verifiable, or every active item would fail `content:check`.
9. **The explanation claim** is a warning (X08), not a schema rule, because the guide's own e.0004 states no separate fact.
10. **Knowledge confidence** values are `certain`, `likely` and `unsure` (§9.5.3 names only certain); **myth hits** are `{ claimId, mythId, cleared }`; **lint warnings** are `{ rule, path, message }`; **rechecks** carry `trigger`: report, freshness or audit; **day-check issues** take a free-text type.
11. **Where the documents differ, both forms pass for now.** The day check's date is `date` in the guide (§2.11) and `checkedAt` in ARCHITECTURE §5.1; either is accepted. Encores' `unitShort` and `unitLabel` (ARCHITECTURE §5.1.1 and §5.2) are optional in a draft and required from `checking` on. Once the documents agree, tighten the schema to one form. Spare sets carry `track` (`main` or `e2e`), because the release loads them per track (ARCHITECTURE §5.1.1), and round types are ARCHITECTURE §3.3's `mc`, `tf`, `comparison`, `mystery` and `encore`.
12. **WebSearch caps** (§9.5.2) are scaled to batch size: practice 26 for 63 items, mystery 45 for 30, encore 48 for 40, room 8, list 5 per 100.
13. **The manifest** generalizes the §9.5.1 example to a list of files per dataset, each with its URL and hash, plus `title`, `sourceLabel` and `evidence`.
14. **C12 and C13 normalization** approximates the engine's `normalizeName` (not built yet); switch to it when it lands. The build's list projection and its size budget already use the engine's own `normalizeName` (`scripts/content/lib/project.ts`).
15. **The schemas take every + field of CONTENT_GUIDE §2 additively** (CNT-1): `selfCheck` (optional, each code true once an item leaves draft), `exactDates` on comparisons, `liveAt` on lists, `spareOrder` on schedule rows, the risk floor's `only`, `counterintuitive` and `sealed_pool` reasons, and `merge`, `followUps`, `dailyChecks` (pass D, with `forDate` and `listVersions`) and `corrections` on `verification`, with `model` and `stagesServedAt` on a check record. Nothing the bank already holds changed meaning. A slow item's `reviewBy` may stay null until acceptance (§2.3). Spare sets are `spare.NN` (ARCHITECTURE §2.4). Challenge packs and list requests have schemas of their own.
16. **Where the guide's §9.8 record and these files still differ**: a claim result here holds one `method` and one `evidence` object, where §9.8 lists typed evidence entries (with a `calculation` kind), and `packetSha256` is one hash per pass rather than one per stage. The 1,305 accepted items use this form, so it stays until the content lead and the guide agree on one; the guide's §12.15 record passes once those two fields are converted.
17. **Retirement (CNT-2b).** A retired item carries `retired: { at, by, kind, reason }`, required on the `retired` status and refused on any other, so every retirement says when, by which editor, of what kind (`cross_pool`, `recheck` or `other`) and why. The register gains an optional `retired` count, kept with `accepted` and `cut` (never on a list batch, whose retired entities close as cut): a closed batch that loses an item to `retire` stays closed, with `accepted` lower and `retired` higher. X10 lets an item retired after it played stay on a main-track Daily that has closed, since the schedule is its history.
18. **Cross-pool judgments (CNT-2b)** sit in `verification.crossPool` on mysteries and encores only: the schema refuses them on a practice item (a public file names no sealed id) and on a room question (its pairs are judged on the Daily item it sits near, so each pair has one place). An item's judgments name each pair once.
