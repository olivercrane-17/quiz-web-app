# Knewt: project status and handoff

Written on 5 November 2026 at about 13:20 UTC, just before a usage-limit pause. It records what is
finished, what was running at the pause and how to pick each piece up. The decisions memo
(`docs/02-PRODUCT-DECISIONS.md`) stays the source of truth for decisions; this file only tracks state.

## Where things stand

- **Integration branch.** `claude/sleepy-hamilton-p0f789` at `38d37c2` or later. It holds every merged
  ticket, the content checkpoints up to "mystery top-ups for the remaining slot gaps", the RITE round 2
  report and memo §22.
- **Merged tickets.** CORE-0a, CORE-0b, PRA-1, MYS-1, DLY-1, PLT-1, PWA-0, ENG-2, CNT-0, DS-1, the round 1
  fixes (FIX-PRA, FIX-MYS, FIX-DLY, FIX-DS), SQL-1, IDN-1, CNT-1, CNT-2, SQL-2, SQL-3, IDN-2, SEC-1 and
  LGL-1.
- **Live database** (Supabase project `zcodouduyvxwefxebvmv`). Applied: key escrow, baseline, helpers,
  identity. SQL-3's `20261104000600_content.sql` was being applied by integration 5's database step at the
  pause (all seven dry runs had passed). Check `list_migrations` before anything else. The three
  `*_attended` / owner-only migrations wait for an owner session (memo §21).
- **CI at `6e11ecb`.** Lint, types, unit tests, build and Chromium E2E pass, and so does the backend
  contract. Three jobs fail:
  - The sealed content check, on the cross-pool overlaps described under Content.
  - E2E on Firefox and WebKit, new since round 5's merge. Integration 5's verify and fix steps were
    meant to look at them.

## The M1 gate

RITE round 2 (`docs/playtests/rite-2.md`) did not pass, narrowly. It found no P0, two P1 confusions
(the stopwatch keeps running after "Saved"; option keys answered from a heading) and one defect (every
fresh mock player saw the same clue-4 order). Memo §22 settles D19 to D26 and defers comprehension
question 4 to the first round with a percentile. Round 3 can be the last M1 round if the fixes land and
nothing new turns up. Its method is in rite-2.md §10. Before it starts, at least 5 GB must be free on the
root disk.

## Running at the pause

All of these live only on this container's disk until they merge into the integration branch.

| Work | Branch or place | State at the pause |
|---|---|---|
| Integration 5 | main checkout | Merge pushed; database step applying SQL-3, then verify and fix |
| MOD-1 (moderation) | `lane/r5-mod1` (`ea61c2d`) | Built; reviewer 1 asked for changes; fix step next |
| ENR-1 | `lane/r5-enr1` (`50e448f`) | Built, reviewed and fixed; waits for the next integration |
| FIX2-DLY, FIX2-MYS, FIX2-PRA, FIX2-DS | `lane/r6-fix{dly,mys,pra,ds}` | Round 2 fixes, building from `lane/r6-docs` |
| CNT-2b (content tooling) | `lane/r6-cnt2b` | Building; spec below |
| Mystery re-estimates | content worktree, `content/production` | Four blind estimators replacing the faked estimates of m.sci, m.food, m.geo and m.nat b01 |

Each lane's developer commits work in progress as it goes ("<ticket>: wip ..."), so an interrupted lane
resumes from its branch. If the container survived, resume each workflow from its run id with the
Workflow tool. If it did not, rebuild a lane from its spec: rite-2.md sections 5 and 6 plus memo §22 for
the FIX2 lanes, ARCHITECTURE §12.3 for MOD-1 and ENR-1, and the section below for CNT-2b.

### CNT-2b, the spec

CNT-2's cross-pool check (X29, CONTENT_GUIDE §10.5) now runs against the sealed Daily items and flags
about 45 of them as sharing a fact with a practice or room question. It is a similarity proxy, so some
flags share a name and not a fact. The tools could neither take an active item out of play nor record
an editor's judgment, so CNT-2b adds two commands:

- `content:batch -- retire --item <id> --editor <ed-id> --reason <text>` moves an active item to
  `retired`, keeps its id and history, and takes it out of every count, build and release. Frozen Dailies
  need `--allow-frozen`.
- `content:dedupe -- --cross-pool-ok --daily <sealed id> --item <public id> --editor <ed-id> --reason <text>`
  records `related_ok` on the sealed side only, hashed over both items, so it lapses when either changes.

## Content

| Pool | Active | Launch target | Gap |
|---|---|---|---|
| Practice | 1,305 | 100 per category | Science 94, Society 99, Sport 88 |
| Mysteries | 386 (2 more checking) | 360 plus spares | Re-estimates and slot balance pending |
| Encores | 84 | 120 (100 Dailies plus 20 spares) | 36; batch e.b04 is open with nothing drafted |
| Room questions | 79 | 120 (8 packs of 15) | 41 |

Nothing is scheduled yet: the scheduler is CNT-3. The unscheduled pool covers 84 Dailies, and encores
are the limit.

Content jobs, in order:

1. Merge CNT-2b into `content/production`. Then an editor resolves each X29 flag: retire the public item
   when the fact really repeats, or record `related_ok` when only a name repeats.
2. Finish m.food.b02. Items m.food.0202 and 0203 need a pass B check and an editor decision, which also
   clears their C26 errors.
3. Once the re-estimates land, set the difficulty band edges and plan the re-slotting. Today, about 30
   items predict below the hard band.
4. Top-ups: encores to 120, room packs to 15 each, and practice back to 100 per category, counting any
   question retired in step 1.
5. Pass D and the seeded audit (`content:audit`) before anything is scheduled.

Launch the jobs that need fact-checkers from a fresh turn, because web searches share one budget per turn.

## Next build steps

1. Integration 6: the four FIX2 lanes, MOD-1, ENR-1 and CNT-2b, then merge the result into
   `content/production`.
2. RITE round 3 on one build of the integration branch, then the M1 exit review (PRD §9.3).
3. Beside it, since neither changes a Must screen (memo §20): SQL-4 and CNT-3.
4. After the M1 exit: DLY-2, PRA-2, then SQL-5 to SQL-12, DLY-3, STK-1, ARC-1, INC-1, STA-1, SET-1, RPT-1,
   ANA-1, CI-0, PWA-1, SHR-1, SHR-2, CHL-1, CI-1, GRP-1, QA-1 and A11Y-1. PERF-1 and QA-2 come later.
   Play routes sit near 220 KB against a 180 KB budget, under waivers until PERF-1.

## Waiting on the owner

- Two open questions:
  - The delete policy. Option 1 is the default being followed: routine work never deletes, and real
    deletions wait for an attended session.
  - Launching with about 30 days of Dailies, or waiting for 100.
- Before launch:
  - Import the project into Vercel and set its environment.
  - Check the Knewt trademark and domain.
  - Get a legal review of sharing, the terms and the privacy policy.
  - Hold one attended database session.
  - Supply a contact email and the operator's legal name and address.
  - Allow GitHub Actions to open pull requests.
  - Re-enable scheduled workflows after 60 inactive days.
  - Verify the client IP hop (CI-0).
