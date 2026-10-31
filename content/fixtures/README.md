# Fixture content

Fake but well-formed content for the mock backend, unit tests, the greybox
and the real database's `e2e` track (ARCHITECTURE §5.6). Every id starts with
`fx.`, every item is `draft` (fixtures never go through checking), and every
fact is invented and set in the fixture realm of Arvenna, except the element
mysteries, which hint at real chemistry. None of it is real scheduled content
(CONTENT_GUIDE §11.2), and none of it may be copied into `content/`.

The files follow the content source formats (`src/content/schema/`), so
`npm run content:check` validates them on every run, in CI too. Browser code
reads them through `src/content/loaders/fixtures/`, which decodes them into
the built shapes of ARCHITECTURE §3.2.

| Folder             | What it holds                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `practice/<slug>/` | 40 practice items in four categories, true/false and comparisons included. Geography holds exactly 3 Hard and 7 Medium items (AC-PRA-14) |
| `answer-lists/`    | Invented countries (120, with aliases), films (60), people (40, one shared name) and music artists (32), and the 118 real elements       |
| `mysteries/`       | Six mysteries: set A (film, element, country) and set B (person, country, element), one per slot each                                    |
| `encores/`         | Three encores: a count, a year and a quantity with one decimal                                                                           |
| `room-packs/`      | `fx-party`, the 15-question room pack, and `dly`, the sealed choice rounds of the Daily compositions below                               |
| `schedule/`        | The `e2e` track's fixed dates: `[mc ×9, encore]` on 15 November 2026 and `[mc ×5, mystery, encore]` on 16 November 2026 (AC-DLY-09)      |
| `spares/`          | Six spare sets on the `e2e` track, which the cycle below plays                                                                           |

**The e2e cycle.** A date with a row in `schedule/` plays that row. Every
other date on or after `dailyEpoch` (`src/config/shared.json`) plays spare
set `((n - 1) mod 6) + 1`, where `n` is its Daily number: set A of the
mysteries on odd numbers, set B on even ones, and the three encores in turn.
`fixtureDailyFor()` in `src/content/loaders/fixtures/sealed.ts` implements
it, and the e2e-track seed (SQL-3) must generate the same Dailies.
