# Fixture content

Fake but well-formed content for the mock backend, unit tests, the greybox
and the real database's `e2e` track (ARCHITECTURE §5.6). Every id starts with
`fx.`, every item is `draft` (fixtures never go through checking), and every
fact is invented and set in the fixture realm of Arvenna, except the element
mysteries, which hint at real chemistry. None of it is real scheduled content
(CONTENT_GUIDE §11.2), and none of it may be copied into `content/`.

The files follow the content source formats (`src/content/schema/`), so
`npm run content:check` validates them on every run, in CI too.

**Edit a fixture, then run `npm run content:build`.** Mock builds (the E2E
build, local development, the playtest build) play the fixture world from
the build's generated copies, in the built shapes of ARCHITECTURE §3.2:
the practice packs and answer lists in
`src/content/generated/fixture-world.json`, and the mock backend's
mysteries, encores, choice rounds, room packs, Dailies and spare sets in
`src/backend/mock/fixtures.generated.ts` (§5.3). Commit them with the
fixture: `content:check`'s drift check (X31) fails until they match. Unit
tests and the E2E support code read the files themselves through
`src/content/loaders/fixtures/`, and a parity test keeps both readings
equal. A change to the mysteries, encores, room packs, schedule, spares or
answer lists also changes the real database's e2e track: run `npm run
content:release -- --fixtures` and commit `supabase/seed/e2e-track.sql` and
`supabase/tests/content/fixture-release.test.sql` with it
(`scripts/content/release.test.ts` fails until they match).

| Folder             | What it holds                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `practice/<slug>/` | 40 practice items in four categories, true/false and comparisons included. Geography holds exactly 3 Hard and 7 Medium items (AC-PRA-14)                                                                             |
| `answer-lists/`    | Invented countries (120, with aliases), films (60), people (40, one shared name) and music artists (32), and the 118 real elements                                                                                   |
| `mysteries/`       | Six mysteries: set A (film, element, country) and set B (person, country, element), one per slot each                                                                                                                |
| `encores/`         | Three encores: a count, a year and a quantity with one decimal                                                                                                                                                       |
| `room-packs/`      | `fx-party`, the 15-question room pack, and `dly`, the sealed choice rounds of the Daily compositions below. `dly` is not hostable: the loader exports it as `FIXTURE_DAILY_CHOICES`, apart from `FIXTURE_ROOM_PACKS` |
| `schedule/`        | The `e2e` track's fixed dates: `[mc ×9, encore]` on 15 November 2026 and `[mc ×5, mystery, encore]` on 16 November 2026 (AC-DLY-09)                                                                                  |
| `spares/`          | Six spare sets on the `e2e` track, `spare.01` to `spare.06` (ARCHITECTURE §2.4), which the cycle below plays                                                                                                         |

**The e2e cycle.** A date with a row in `schedule/` plays that row. Every
other date on or after `dailyEpoch` (`src/config/shared.json`) plays spare
set `((n - 1) mod 6) + 1`, where `n` is its Daily number: set A of the
mysteries on odd numbers, set B on even ones, and the three encores in turn.
`fixtureDailyFrom()` in `src/content/loaders/fixtures/cycle.ts` implements
it for the mock and the tests alike, and the e2e-track seed (SQL-3) must
generate the same Dailies.

**What the fixture world must not give away.** The playtests play this
world in a mock build, so the rules that keep real content fair hold here
too (RITE round 2, `docs/playtests/rite-2.md`):

- No practice or room item states a fixture Mystery's or Encore's fact
  (CONTENT_GUIDE §10.5). `npm run content:dedupe -- --cross-pool --fixtures
--root content/fixtures` counts the fixture Mysteries and Encores as Daily
  items for the cross-pool check (X29), with an extra check for an Encore's
  figure beside its subject in any player-facing text, and CI runs it. A
  practice explanation once gave a persona the next day's Encore (R2-22).
- A comparison of mass, length or area names its measure ("Which is
  heavier?", never a bare "Which is bigger?"; lint X33, R2-15).
- Ascending items spread their keys: no display position holds more than
  40% of them (lint X34, R2-23). Today the seven sit A 2, B 2, C 2, D 1.
- The person list is short (40 names), so a few typed letters list only a
  handful, and a gendered pronoun can leave one. A person Mystery 1 keeps
  its gender out of clue 1 ("this person's survey notes"), and
  `src/content/pipeline/lint/fixture-tree.test.ts` checks the ones round 3
  plays, from Daily #46 on (rite-2.md §10, item 11).
