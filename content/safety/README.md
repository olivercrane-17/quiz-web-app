# content/safety/

The player-facing slur filter's lists (PRD §3.9.4, ARCHITECTURE §8.13). The
filter runs on every text a player types for other people to see: nicknames,
Group names, room names and quiz fields. It runs in the browser for instant
feedback and again in SQL, which decides.

| File             | Holds                                                                |
| ---------------- | -------------------------------------------------------------------- |
| `slur-terms.txt` | The terms, one per line, ROT13-encoded                               |
| `allowlist.txt`  | Innocent words that contain a long term, one per line, ROT13-encoded |

Both files encode every entry with ROT13, as `content/reference/slurs.json`
does, so no term shows up in a diff, a search result, a log or an agent
transcript. Lines that start with `#` are comments and stay plain. Tools
decode the entries only in memory and never print them.

## Where the lists go

| Command                      | Output                                | What reads it                                                    |
| ---------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `npm run content:build`      | `src/content/generated/moderation.ts` | The client, as a lazy chunk the first time a text field needs it |
| `npm run codegen:moderation` | `supabase/seed/moderation.sql`        | `private.text_is_blocked` once the integrator loads the seed     |
| `npm run content:check`      | (the content lint, rule C23)          | Our own content, so both filters share one list                  |

Run both commands after a change and commit what they write. CI rebuilds
both and fails on any difference. The seed upserts every listed entry and
retires the rest with `active = false`: routine loads never delete a row.

## How matching works

`src/engine/text/moderation.ts` is the matcher, and SQL repeats it step for
step. It folds case, marks, look-alike letters and invisible characters;
reads digits and symbols as letters where they stand for one (`0` as o, `$`
as s); reads a run of repeated letters as one run, so extra letters never
hide a term; and joins letters spelled out with separators. Then:

- a term of 5 letters or fewer matches whole words only (with a plural s or
  es), so an innocent word that merely contains it never hits;
- a longer term matches anywhere once separators are removed, inside words
  and across them;
- an allowlisted word is set aside first, so a long term inside it never
  hits. Short terms never need an allowlist entry.

Every hit shows the same neutral message. Nothing that the filter blocks is
ever logged, sent to analytics or echoed back.

## Changing a list

The content team reviews every change, as PRD §3.9.4 asks.

1. Decode locally to read the list, in a terminal no one records:
   `node -e "require('fs').readFileSync('content/safety/slur-terms.txt','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).forEach(l=>console.log(l.replace(/[a-z]/gi,c=>String.fromCharCode((c<='Z'?65:97)+((c.charCodeAt(0)-(c<='Z'?65:97)+13)%26)))))"`
2. Add a term ROT13-encoded on a line of its own (encode the same way, since
   ROT13 is its own inverse). Prefer terms that are slurs in every common
   sense: a word with an innocent everyday meaning blocks innocent names.
3. A long term can hit innocent words that contain it. To see which, run
   `npm run codegen:moderation -- --candidates <words.json>` with a JSON
   array of words (an English word list, say). It prints the words a long
   term would block, ROT13-encoded; decode them locally and add the innocent
   ones to `allowlist.txt`.
4. Run `npm run content:build`, `npm run codegen:moderation` and `npm test`.
   The tests check that every term is caught under each normalization, that
   no friendly name is blocked, and that no allowlist entry hides a term.

The list was seeded from `content/reference/slurs.json`, the content team's
conservative seed (`content/README.md`).
