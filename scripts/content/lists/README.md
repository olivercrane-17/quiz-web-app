# Answer-list importers (`npm run content:lists`)

One importer per pinned dataset that a list cites (ARCHITECTURE §5.5, CONTENT_GUIDE §2.10 and §9.5.1). `content:lists` re-imports a list from its recorded sources: it reads every dataset the list's `provenance` or its entries' `source` cite from `.cache/datasets/` (run `npm run content:datasets` first), checks each file against its pinned sha256, resolves every citation and compares the entry with the record.

```sh
npm run content:datasets                      # once: fetch and verify the pinned datasets
npm run content:lists -- --type country       # report
npm run content:lists -- --type country --write   # add the CLDR forms an entry lacks
npm run content:lists -- --all --json
```

An entry cites a dataset in its `source` as `<key>@<pin> <locator>`, after anything else the list builder wrote (`l.city.b01; checked geonames-cities@1.1.65 name=Tokyo country=JP admin1=40; world-cities@73c9f54 geonameid=1850147`). Several citations are separated by `;` or by `, ` before the next key.

| Dataset                | Role   | Lists                      | Locator                                         | What is compared                                                |
| ---------------------- | ------ | -------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `cldr-territories`     | source | country                    | `CZ`                                            | Every CLDR form (short name, variant, short) is a name or alias |
| `mledoze-countries`    | check  | country                    | `cca3=CZE`                                      | `iso_a2`; one of its names is ours                              |
| `ptable`               | check  | element                    | `number=55`                                     | `symbol` and `number` (never names: ptable spells "Cesium")     |
| `geonames-cities`      | check  | city                       | `name=Tokyo country=JP admin1=40`               | `country` and `admin1` (`admin1=none` for a city-state)         |
| `world-cities`         | check  | city                       | `geonameid=1850147`                             | The GeoNames id exists and names the city                       |
| `moma-artists`         | check  | person, music_artist       | `ConstituentID=912`                             | The name, `born`, and the QID, which is the entry's id (§2.12)  |
| `tate-artists`         | check  | person, music_artist       | `id=266`                                        | The name ("Surname, Forenames" either way) and `born`           |
| `nobel-prizes`         | check  | person, music_artist, book | `id=26`                                         | The laureate's name; for a book, its `author`                   |
| `nobel-laureates-2016` | check  | person, music_artist       | `id=26`                                         | The name and `born`                                             |
| `natural-earth`        | check  | landmark                   | `<file>.geojson ne_id=1159105019`               | The feature's names, and its Wikidata id as the entry's id      |
| `worldcup`             | check  | person                     | `2014 and 2022 scorer Lionel Messi (Argentina)` | Each named scorer scored in each named tournament               |

- **Source** datasets may supply shipped fields (Unicode, CC0, public domain). CLDR is the only one the lists use that way: its forms are aliases (§2.10), and `--write` adds a missing one under a new list `version` and `liveAt` (today, UTC), which must be committed that day and on its own (§2.10 rule 5).
- **Check** datasets are evidence only (ODbL, BY-SA, or data the lists don't copy). A disagreement is a warning for the list builder, never a change: datasets carry known errors (the manifest's `knownIssues`), so the builder decides. Person names compare loosely: titles, bracketed asides, middle names, initials and name order may differ.
- **Errors**: a citation that resolves to nothing, a dataset the manifest doesn't pin, a pinned file that is missing or changed. **Warnings**: a citation at an older pin, and every disagreement. **Notes**: source records no entry cites (the list builder adds entries only through a list batch, §2.10 rule 5).
- Lists built only from list batches (films, books, dishes, animals, sports, TV series and most people) cite no dataset for their entries, so there is nothing to re-import.
- Nothing here deletes an entry, changes an id or adds an entry.

To add an importer for a newly pinned dataset: a module here exporting a `ListImporter` (`importer.ts`), its entry in `IMPORTERS` (`index.ts`), and a case in `lists.test.ts` with a small invented file in the dataset's own format.
