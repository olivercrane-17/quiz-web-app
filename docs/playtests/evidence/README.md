# Playtest evidence index

Each RITE round's report is in `docs/playtests/rite-N.md`. The raw evidence behind a report (screenshots, driver scripts,
driver logs and the facilitator's notes) is not in git: each round is 150 to 180 MB, nearly all of it PNG screenshots.
It stays on the build machine, and this file says where. Decisions memo §28 ("Round 6 method") asks for the evidence to
be recorded here from round 6 on.

## Where each round's evidence lives

| Round | Report | Folder on the build machine | Size | Build under test |
|---|---|---|---|---|
| 1 | `docs/playtests/rite-1.md` | No folder on the build machine | | |
| 2 | `docs/playtests/rite-2.md` | `/home/user/playtest-evidence/rite-2/`, one folder per persona named `pt2-<persona>` | 182 MB | `7ecf6df`, built 10:49 UTC (from the report; no record file) |
| 3 | `docs/playtests/rite-3.md` | `/home/user/playtest-evidence/rite-3/` | 157 MB | Built 2026-11-10 08:48:14 UTC (`/home/user/playtest-evidence/rite3-build-time.txt`) |
| 4 | `docs/playtests/rite-4.md` | `/home/user/playtest-evidence/rite-4/` | 173 MB | `ba19192`, built 2026-11-10 13:40:34 UTC (`rite4-build-time.txt`, in the folder and beside it) |
| 5 | `docs/playtests/rite-5.md` | `/home/user/playtest-evidence/rite-5/` | 178 MB | `f167166`, built 2026-11-10 18:17:53 UTC |
| 6 | `docs/playtests/rite-6.md` | `/home/user/playtest-evidence/rite-6/` | 182 MB | `63fa3f9`, built 2026-11-10 20:58:25 UTC |

Round N's folder is always `/home/user/playtest-evidence/rite-N/`, with one folder per persona inside it (`dee`,
`lena`, `marcus`, `priya`, `sam`). The folders are on disk, not in RAM, but they aren't backed up: if the build machine
is rebuilt they are gone, and the reports, which quote what they rely on, are what remains.

## Round 5's record files

At the top of `/home/user/playtest-evidence/rite-5/`:

| File | What it holds |
|---|---|
| `commit.txt` | The short hash of the commit the playtest build was made from: `f167166`, the branch before FIX5 was merged |
| `build-time.txt` | When that build finished, in UTC: `2026-11-10T18:17:53Z` |
| `cross-pool.txt` | The output of the content dedupe check, run before play: 79 items indexed, no pair at or above 0.5 similarity, and no Daily item sharing a fact with a practice or room item (lint X29) |
| `spread-contract.txt` | The summary lines of the spread test's Vitest run, recorded before play: 20 passed, 28 skipped, of 48, started 18:18:52. It carries no test names, which the round 5 report notes and round 6's method corrects |

In each persona's folder:

| File | What it holds |
|---|---|
| `notes.md` (`transcript.md` in Lena's folder) | The facilitator's notes for that session: what the persona did, said and predicted, step by step |
| `driver.js` | The Playwright script that drove the session's browser |
| `driver.log` | That script's output |
| `run.sh` | The command that started the driver, with its time zone and profile |
| `NN-*.png`, `NNa-*.png` | Screenshots in session order; the number is the step in `notes.md` |
| `tmp`, and `profile` or `driver.ready` where present | The driver's working files: its scratch folder, its browser profile and its ready marker. Not evidence |

Dee's session was driven step by step, so her folder also holds one small script per step (`s01.js` to `s30.js`, and
the follow-up probes `b01.js` to `b09.js` and `c01.js` to `c05.js`, with their `bNN-*.png` screenshots) and
`30-footer-pages.json`, the record of the footer pages she opened.

## What must never go in an evidence folder

No content key and no sealed plaintext: screenshots show only what a player saw on screen in the session.
