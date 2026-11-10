# Knewt: project status and handoff

Written on 10 November 2026 at about 22:30 UTC, when the owner asked for a pause at the first milestone.
It records what is finished and how to pick the work up. The decisions memo
(`docs/02-PRODUCT-DECISIONS.md`) stays the source of truth for decisions; this file only tracks state.

## Where things stand

- **Milestone 1 has exited** (memo §29). Six persona playtest rounds ran. The last found no blocker and no
  confusion, and all five personas would share their result. One condition is attached: the R6-01 fix
  below.
- **Integration branch.** `claude/sleepy-hamilton-p0f789` holds everything, pushed. No lane is unmerged, and
  nothing lives only on the build machine except playtest evidence (see `docs/playtests/evidence/README.md`).
- **Paused.** No team is running and nothing new was started. Say "continue" to resume from "Next steps".

## What is built and merged

- **The playable game on the test backend.** The Daily (three Mysteries and an Encore), the results and
  share screen, Quick play practice, the app shell, and the legal and help pages.
- **Identity.** Anonymous players, sync codes, restore and the backup cookie.
- **Moderation.** The nickname filter runs in the app and in the database with matching rules.
- **Content tooling.** Checks, sealing, release building, retirement and cross-pool judgments.
- **Security.** The Content Security Policy, the secret scan, and a scan of the built app for sealed answers.
- **Tickets.** CORE-0a, CORE-0b, PRA-1, MYS-1, DLY-1, PLT-1, PWA-0, ENG-2, CNT-0, DS-1, SQL-1, IDN-1,
  CNT-1, CNT-2, CNT-2b, SQL-2, SQL-3, IDN-2, SEC-1, LGL-1, MOD-1, ENR-1, OPS-1, and five rounds of playtest
  fixes.

## Live database

Supabase project `zcodouduyvxwefxebvmv`. Six migrations are applied and verified against the repository:
key escrow, baseline, helpers, identity, content and moderation. Their seed data is loaded. The security
advisors show only expected findings, and the drift check is clean.

- **Waiting for an owner session:** `20261104000200_platform_jobs_attended`,
  `20261104000500_identity_attended` and `20261104000300_api_surface_owner_only` (memo §21).
- **Test-track seed:** the load of the current e2e fixture release was running at the pause. Its notes are
  on the build machine. If the machine is gone, rebuild the parts from `supabase/seed/e2e-track.sql` and
  compare `private.content_releases` first.

## Content

| Pool | Active | Launch target | Gap |
|---|---|---|---|
| Practice | 1,336 | 100 per category | Language has 99, with 5 drafts awaiting an editor |
| Mysteries | 384 | 360 plus spares | By difficulty: 136 easy, 115 medium, 94 hard; 41 too hard to schedule |
| Encores | 122 | 120 | None |
| Room questions | 119 | 120 | The sound-check pack is one short |

Nothing is scheduled yet, because the scheduler (CNT-3) isn't built.

## Next steps, in order

1. **R6-01, the milestone's condition.** A second tap on "Next question" can land on an option of the next
   practice question and be scored unread. Build D39 (ignore pointer answers for about 700 ms after a
   question paints) with the tests rite-6.md names. Also apply D40 (clue 4's line) and D38's "Choice
   cleared." announcement.
2. **The next build phase (M2).** SQL-4 and SQL-5 (the real Daily on the database), DLY-2 and PRA-2 (the
   finished Daily and Practice screens), CNT-3 (the scheduler), then DLY-3, STK-1, ARC-1, STA-1, SET-1,
   RPT-1 and the rest of ARCHITECTURE §12.3. Round 6's backlog, by owning ticket, is at the end of
   `docs/playtests/rite-6.md`.
3. **Content jobs.**
   - Decide the 5 language drafts and add one sound-check question.
   - Finish m.food.0202 and m.food.0203.
   - Rewrite the 41 too-hard mysteries and top up hard mysteries (memo §23).
   - Respread the 16 practice answers that sit at B.
   - Run the seeded audit before anything is scheduled.
4. **Performance.** `/daily` is 227 kB and `/practice/run` 197 kB against a 180 kB budget, under waivers
   until PERF-1.
5. **CI.** GitHub's run on the latest push should be checked. WebKit and Firefox can't run on the build
   machine, and the sealed-content job reports the sound-check pack until it is filled.

## Waiting on the owner

- **Deletions.** Option 1 is being followed: routine work never deletes, and real deletions wait for an
  attended session.
- **Launch size.** About 30 days of Dailies, or wait for 100.
- **The lock-in model (memo §27, D31).** Clue 4 is now "tap to choose, then Lock in" on every device. Say
  if you would prefer one tap.
- **Before launch:**
  - Import the project into Vercel and set its environment.
  - Check the Knewt trademark and domain.
  - Get a legal review of sharing, the terms and the privacy policy.
  - Hold one attended database session.
  - Supply a contact email and the operator's legal name and address. The privacy page now tells people to
    email that address for data requests until Settings ships, so someone has to answer it.
  - Allow GitHub Actions to open pull requests.
  - Verify the client IP hop (CI-0).
- **Housekeeping.** Ten `backup/*` branches on GitHub hold work that has since merged. They can be deleted.
