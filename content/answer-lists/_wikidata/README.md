# Wikidata enrichment (`content/answer-lists/_wikidata/`)

This folder holds the output of the Wikidata enrichment workflow, `.github/workflows/wikidata-enrich.yml` (ticket ENR-1, ARCHITECTURE §5.5). Each run rewrites it, so nobody edits it by hand. There is one file per answer list, `<type>.json`, beside this README.

Wikidata is a candidate source, never evidence (CONTENT_GUIDE §9.5.1). Its data is CC0.

Nothing here changes a list entry. The build, the lint and the SQL seed read only `content/answer-lists/<type>.json`, so merging a run ships nothing and moves no mystery's checks. Entries change only when the list builder applies a merged run, as set out below.

## How a run works

The workflow runs weekly (Monday 02:47 UTC) and by hand (Actions, "Wikidata enrichment", "Run workflow"). A manual run can name one list, and with "open_pull_request" off it is a dry run that only uploads its output as an artifact.

1. **Fetch** (read-only token). After `npm ci`, the job runs `scripts/content/enrich-wikidata.ts`. The script reads every list and asks Wikidata's Action API, one request at a time, with `maxlag` and a User-Agent that names this repository. When Wikidata asks it to wait (replication lag, a rate limit) it waits as long as `Retry-After` says, up to 15 minutes for one request. A connection that fails, before the answer or while its body arrives, gets six tries with growing waits. The script writes the files only once every request has succeeded, so a failed run leaves nothing half-written.
2. **Pull request** (the only job that can write, and it installs nothing from npm). If the new files differ from the default branch's only in `fetchedAt` and item revisions, there is nothing to propose and the job stops. Otherwise it commits the files to the branch `bot/wikidata-enrich`, force-pushes, opens or updates one pull request, and starts CI on the branch, because a pull request opened with the job's token starts no workflow run by itself. Every run rewrites that branch from the default branch, so nobody commits to it.

The repository must allow GitHub Actions to create pull requests (Settings, Actions, General, Workflow permissions). Until the owner allows it, the job pushes the branch, fails with the link to open the pull request by hand, and the launch report carries the item (ARCHITECTURE §12.5).

The agents' sandbox can't reach `www.wikidata.org`. A local run there fails at once with one line naming the host, `enrich-wikidata: cannot reach www.wikidata.org (ENOTFOUND); nothing was written`, and exits with 1.

## What a run asks for

- **Sitelink counts** for every QID the lists reference: an active entry's `id` when it is a QID (copied from a dataset record, CONTENT_GUIDE §2.12), or else its `wikidataId`. The QIDs of retired entries are read too, for the redirects that duplicates are judged by.
- **QID candidates** for every active `x.` entry without a `wikidataId`. The script searches Wikidata for the entry's name and keeps up to five results whose English label or alias is the entry's name or one of its aliases, normalized the way suggestions normalize names (PRD §4.1.3). For each one it reads the facts behind the entry's qualifier and compares them.

| List           | Qualifier field compared | Wikidata property read                                                                                                        |
| -------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `country`      | `iso_a2`                 | P297 (ISO 3166-1 alpha-2 code)                                                                                                |
| `city`         | `country`                | P17 (country), then that item's P297                                                                                          |
| `person`       | `born`                   | P569 (date of birth), year precision or finer                                                                                 |
| `film`         | `year`                   | P577 (publication date): any recorded year                                                                                    |
| `tv_series`    | `startYear`, `country`   | P580 (start time), P571 (inception) or P577; P495 (country of origin), then P297                                              |
| `book`         | `author`                 | P50 (author), then that item's English label and aliases                                                                      |
| `animal`       | `scientificName`         | P225 (taxon name)                                                                                                             |
| `element`      | `symbol`, `number`       | P246 (element symbol), P1086 (atomic number)                                                                                  |
| `landmark`     | `country`                | P17, then P297                                                                                                                |
| `music_artist` | `kind`                   | P569 marks a person (`solo`, `composer`), P571 without P569 a group (`band`). Never enough on its own: see the verdicts below |
| `dish`         | `origin`                 | P495, then P297                                                                                                               |
| `sport`        | none                     | Sports carry no qualifier, so a sport's candidates are never better than `label-only`                                         |

Every run first fetches the English labels of these properties and compares them with the ones above. A property whose label differs is not compared that run: its facts count as unknown, so no candidate can agree through it, and both the file and the pull request say so. No comparison rests on an id typed from memory. A country item that Wikidata has merged into another names no country that run (its fact reads as unknown).

## The files

| Field         | What it holds                                                                          |
| ------------- | -------------------------------------------------------------------------------------- |
| `format`      | The shape of the file, 2. `--apply` refuses any other                                  |
| `type`        | The answer list                                                                        |
| `listVersion` | The list version the run read                                                          |
| `fetchedAt`   | When the run fetched (UTC)                                                             |
| `source`      | The API and Wikidata's licence                                                         |
| `properties`  | The properties this list's checks read: the label Wikidata gave and whether it matched |
| `sitelinks`   | One record per referenced QID, by entry id                                             |
| `candidates`  | One record per searched `x.` entry, by entry id                                        |

A `sitelinks` record holds the entry's `id`, its `entryHash`, the `qid` it references, Wikidata's `label`, `labelMatch` (`label`, `alias` or `none`), the `sitelinks` count, the item `revision` the run read, and `missing: true` for a deleted item or `redirectedTo` for one merged into another.

A `candidates` record holds the entry's `id`, its `entryHash` and `name`, `ours` (the entry's own value for each compared field), the `verdict`, the agreeing `match`, `sharedWith` for a duplicate, and the candidates themselves, agreeing ones first. Each candidate carries its `qid`, the `revision` the run read, its `label`, `description`, `sitelinks`, `labelMatch`, the `facts` Wikidata gave for each compared field, and `qualifier`: `agrees`, `disagrees` or `unknown`.

- **`entryHash`** is the SHA-256 of the entry's name, aliases and qualifier as the run read them. `--apply` holds any record whose entry no longer hashes the same, because the judgement no longer covers it.
- **`revision`** is the item revision every label and fact came from. Anyone can edit Wikidata, and an apply may run days after the fetch, so a disputed match is checked against `https://www.wikidata.org/wiki/Special:PermanentLink/<revision>`, the data as the run judged it.

| Verdict      | Meaning                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match`      | Exactly one candidate agrees on both label and qualifier                                                                                                   |
| `duplicate`  | One candidate agrees, but an entry of any list, of any status, already holds that QID (or a QID Wikidata redirects to it), or another entry matches it too |
| `ambiguous`  | Several candidates agree                                                                                                                                   |
| `label-only` | A label agrees, but no qualifier fact could be compared (a sport, a missing fact, an unverified property)                                                  |
| `none`       | No candidate agrees on both                                                                                                                                |

A verdict always follows from the record's own candidates, and `--apply` refuses a file where one doesn't, so a hand edit or a bad merge can never turn into a QID nobody fetched (CONTENT_GUIDE §9.6).

`--accept-matches` never accepts a `music_artist` match. A date of birth or an inception tells a person from a group, not a musician from a company, a city or a cricketer of the same name, so the list builder judges these by hand like the verdicts below `match`. A later check could read P106 (occupation) or P31 (instance of), with their class labels verified on each run the way the properties above are.

## After a run merges: the list builder

The list builder applies a merged run, which is the reviewer step between Wikidata and anything a player sees.

```sh
# 1. See exactly what step 2 will write, wikidataId acceptances included.
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/content/enrich-wikidata.ts --apply --all --accept-matches
# 2. Write it. Needs the content key: the suggestion probe below runs first.
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/content/enrich-wikidata.ts --apply --all --write --accept-matches
# 3. Regenerate what ships: popularity is part of each list's client projection.
npm run content:build
# 4. The sealed check, then the plain one, whose drift check --sealed skips.
npm run content:check -- --sealed
npm run content:check
```

5. Commit the changed lists together with the files `content:build` wrote (`public/content/lists/` and `src/content/generated/manifest.ts`), in a commit that touches no sealed envelope, the same UTC day: `--write` gives each changed list a new `version` and `liveAt` (today, UTC), and a list version goes live with its commit (CONTENT_GUIDE §2.10 rule 5). Until the first applied run, popularity is 0 everywhere and ties fall to display order.

**The suggestion probe.** Popularity breaks suggestion ties (PRD §4.1.3), so a new count can put a mystery's answer among the top six suggestions for a word of one of its typed clues. `content:check` reports that as C12, but on a mystery accepted before CNT-2's rules landed (`scripts/content/lint/cutoff.ts`) only as a warning, which exits 0. So `--write` checks for itself before it writes anything. It decrypts the sealed mysteries in memory and runs C12's probe on every `checking` or `active` one, once with the lists as they stand and once with the changes applied. If any mystery gains a hit, it writes nothing, prints only the count and `error <item id> C12 clues[n]` lines, and exits 1. It refuses to write without the content key, and a sealed mystery file it can't read stops it too, since the probe can't vouch for that mystery.

When the probe refuses, rewrite each mystery it names, or swap it out of its Daily (CONTENT_GUIDE §2.13), and apply again. A Daily inside the freeze window can't change, because a release refuses to touch a frozen Daily without `--allow-frozen` (ARCHITECTURE §8.7). When the refusal names a mystery in one, hold the whole apply until that date has passed. Never apply the other entries on their own: a diff that leaves out one entry points at an answer.

**Pass D.** A written apply gives each changed list a new version even when only popularity or a `wikidataId` changed, and a pass D record stays valid for another date only while the list versions it names are unchanged (CONTENT_GUIDE §9.9 rule 7). A Daily freezes only with a passing pass D against the list versions shipping then (ARCHITECTURE §8.7). So:

- after a written apply, pass D is confirmed again for every unfrozen Daily that uses a changed list;
- while a frozen Daily that hasn't been published yet uses one of the lists, the apply waits until it has been.

Follow-ups recorded for CNT-3 (the scheduler) and for the owner of CONTENT_GUIDE §9.9 rule 7: treat a list version whose only differences are `popularity` and `wikidataId` as unchanged for pass D, with this probe covering that part of the review.

What `--apply` changes, and what it never does:

- It sets `popularity` to the sitelink count of each active entry's referenced QID. It holds, and prints, an entry whose QID is missing on Wikidata, whose Wikidata label is neither the entry's name nor an alias, or whose name, aliases or qualifier changed after the run (its `entryHash` differs).
- With `--accept-matches` it sets `wikidataId` on each `x.` entry whose verdict is `match`, and gives it the candidate's sitelink count. It holds a match whose entry changed after the run, a match the record's own candidates don't bear out, every `music_artist` match, and a match on a QID that an entry of any list already references, whatever that entry's status (it reads every list present for this, with `--type` too).
- A list it changes gains one `provenance` entry, "Wikidata, through the enrichment workflow: sitelink counts and QIDs" (CC0-1.0, retrieved on the run's date), so `/credits` names Wikidata (PRD §3.14). It cites no `key@pin`, so `content:lists` asks for no dataset pin.
- It never changes an `id`, `name`, `display`, alias, qualifier or `status`. An id never changes once anything references it (CONTENT_GUIDE §2.12), and Wikidata's labels and aliases are candidates for the content team to review, never copied in.
- It never skips an entry because a sealed item uses it. A skipped entry would mark a mystery's answer or guesses in a public diff, so the suggestion probe refuses the whole write instead.

## Judging the rest by hand

- Accept a QID only where the label and the qualifier agree (CONTENT_GUIDE §9.5.1). For `duplicate`, `ambiguous`, `label-only` and `none`, and for every `music_artist` match, the list builder decides with evidence, and sets `wikidataId` rather than changing an entry's id.
- Copy a QID from these files, never from memory (CONTENT_GUIDE §2.12, §9.6).
- A `redirectedTo` means Wikidata merged the item. An `x.` entry's `wikidataId` can follow the redirect; a QID used as an id stays as it is.
- A QID id whose label differs (`labelMatch: none`) needs a look at the dataset record its `source` cites, which can be wrong too (`npm run content:lists` compares entries with their records).
