# Product Decisions (binding)

Owner's decisions after reading `docs/research/SYNTHESIS.md`. Where this memo and the synthesis disagree, this memo
wins. Everything not mentioned here follows the synthesis.

## 1. The wedge
The Daily leads, with sharing, challenge links and Groups around it. Practice (Quick Play) is the offline, always-on
second pillar. Host rooms and the quiz editor ship in v1 behind a visible "Beta" label, because the repo's founding
intent is "creating and playing quiz games". They ship only if they pass their automated gates (section 9); otherwise
they stay behind a feature flag and the Daily launches without them.

## 2. The Daily's format: Three Mysteries plus an Encore (synthesis arm D)
No real-user bake-off is possible before launch, so we decide now and keep the engine flexible.
- A Daily is an ordered list of rounds. v1 Daily = Mystery 1 (easy), Mystery 2 (medium), Mystery 3 (hard), then the
  Encore. The engine must support any composition of round types (multiple choice, true/false, comparison, mystery,
  encore) so switching to arm B later is a content change, never a code change.
- **Mystery (clue ladder).** One answer, four clues ordered hardest to easiest. The player types a guess and must pick
  from suggestions drawn from a closed answer list for that answer type (countries, cities, people, films, animals,
  elements, landmarks, books, etc.). A wrong guess or "Next clue" reveals the next clue. On clue 4, four options appear
  (answer plus three same-type distractors) and the player picks one. Points: 4, 3, 2, 1 by the clue that solved it,
  0 if missed. Max 12 points per Daily from mysteries.
- **Encore (closest number).** Numeric keypad entry. Shows how far off the player was. Counts as a "bullseye" inside a
  forgiving tolerance (starting value within 5%, or within 2 years for dates) and as "close" within 15% (or 5 years).
- **Ranking:** points, then encore error, then total time. Untimed, with a hideable stopwatch. No countdown.
- **Share text** (spoiler-free, text first, path-only link last), shaped like:
  `Daily #42 · 9/12 · Encore 4% off` then one row per mystery such as `🟥🟩⬜⬜` (solved on clue 2), then the link.
  The design team owns the exact glyphs; they must read well in WhatsApp/iMessage and aloud by screen readers.
- Stop screen: score, percentile "so far today", how-everyone-did chart, per-round crowd stats shown after commit,
  miss review with explanations, share, "You're done for today", then a soft offer of Practice.
- The Daily is free forever, sealed (answers never reach the client before commit), validated by Supabase RPCs.
  If the backend is unreachable, show a clear offline state and offer Practice; never fake a Daily offline.

## 3. Practice (Quick Play)
Ten-question multiple-choice runs, mixed or by category, with an open difficulty choice (Easy, Medium, Hard, Mixed).
Formats: multiple choice (4 options, 3 allowed when a fourth would be filler), true/false (at most 1 in 10),
comparison ("Which came first?", "Which is bigger?"). Untimed by default, offline after first load, seen-tracking.
Opt-in variants on the same engine (Should): **Blitz** (60 seconds, as many as you can, speed points) and **Survival**
(three strikes). Never sell lives or strikes.

## 4. Habit and progression
Streaks, earned freezes (1 per 7 finished Dailies, hold up to 2, auto-applied), free repair through the 7-day archive
within 48 hours capped at once per rolling 7 days, record-first copy after a break, milestones, a Stats page.
Should: category mastery tiers (Bronze to Platinum), about 30 achievements with visible progress, review-my-misses.
XP/levels are cosmetic only if built. Our outages never cost a streak (server-side protected dates).

## 5. Social
Must: share result (Web Share with clipboard fallback, OG preview image, never an answer), challenge links (replay a
sealed Daily or a past-Daily pack, server-scored, head-to-head, rematch, no account), Groups (private Daily board
joined by link, up to 50 members, weekly board resetting Monday, member-only nicknames through a slur filter, no
realtime, refetch on focus). Strangers only ever appear as a percentile. No global named leaderboards.

## 6. Host rooms (Beta)
Big-screen host view, phones join with a 6-digit code or QR, up to 20 players, host-paced, DB-authoritative state
through RPCs with Realtime notifications and a polling fallback. Question sources: our sealed room packs (written for
launch, since no past Dailies exist yet) and the host's own saved quizzes. Scoring per synthesis 6.5 (700 base, up to
300 speed, streak bonus) with an Accuracy toggle. Timers 10/20/30/60 s or "Off: host advances". Rejoin same seat,
generated friendly names by default, host can remove or rename players and lock the room. Sound on for the host screen.

## 7. Quiz editor (Beta)
Create multiple-choice and true/false quizzes (up to 50 questions) with explanations, bulk import from pasted text/CSV,
creator lint (synthesis 6.6), slur filter on every field, local autosave, save to server, play solo, host in a room,
and share by unlisted link after a self-declared 18+ confirmation. No public gallery. Report button on every shared
quiz and an owner takedown path in SQL. We cannot obtain legal review: write sensible terms and a content policy, and
flag "legal review recommended before marketing UGC sharing" in the launch report.

## 8. Platform
- Guest identity owned by our DB (player id plus secret, only a hash stored), sync code, a server-set httpOnly backup
  cookie through a Next.js route handler, in-app browser detection with a claim link, `persist()` only when installed.
- Installable PWA with offline practice. Light and dark themes, forced-colors support, reduced-motion support.
- First-party analytics through a batched RPC into Supabase. No third-party trackers, no ads, no purchases at launch.
  The future "Plus" model is documented only.
- Legal/trust pages: privacy, terms (13+), content policy and report flow, credits and licenses, accessibility
  statement, "How scoring works" (honest-play disclosure), "About our questions" (AI-assisted drafting, independent
  checks, how to report).
- Incident banners driven by a backend health check; outage dates protect streaks automatically.
- Sound off by default on phones, on for the host screen.
- Age: 13+ to play. Self-declared age band only when it first matters (publishing, nicknames, joining a group).

## 9. Gates for Beta features
Rooms: automated multi-client E2E against the mock backend (join, play, disconnect, rejoin, host controls, polling-only
mode, server error voids the question), SQL-level tests of every room RPC, and a GitHub Actions job that runs a
multi-client game against the real Supabase project. Editor: lint, slur filter and report flow covered by tests.

## 10. Replacing infeasible synthesis requirements
| Synthesis asks for | We do instead | Why |
|---|---|---|
| Four-arm bake-off with real players | Decide arm D now; keep Daily composition data-driven; persona playtests check comprehension | No players before launch |
| Two web sources and a stored quote per item | Two independent fact-check agents per item; structured facts checked against open datasets on raw.githubusercontent.com or npm where possible; WebSearch only for genuinely uncertain items; uncertain items are cut; a "Learn more" Wikipedia search link instead of hand-typed URLs | Unverifiable citations are worse than none; never fabricate a source |
| k6 load tests | Multi-client Playwright game against the real project in GitHub Actions | Practical with our access |
| Encrypted nightly backup and restore drill | Document the upgrade path (Supabase Pro backups); keep all content and schema reproducible from the repo | We do not hold the DB password |
| Edge Function secret spike, web push, payments, AI drafting | Not in v1 | None needed for launch |
| Legal review | Sensible defaults plus a flag in the launch report | Not available to us |

## 11. Content targets for launch
- Practice: 1,500 multiple-choice/true-false/comparison items across 12 categories, balanced by difficulty.
- Daily: 100 scheduled Dailies (300 mysteries and 100 encores) plus 20 spare days.
- Room packs: 8 themed packs of 15 sealed multiple-choice questions.
- Closed answer lists for every mystery answer type (with aliases), large enough that suggestions never give the
  answer away.
- Every item: explanation of 35 words or fewer, difficulty, category, tags, and verification records.

## 12. Name and brand
The design exploration proposes names; the owner picks a short, coined, ownable name (not "Quiz" or "Trivia" plus a
noun). Trademark search is not possible from here, so the launch report flags it.

## 13. Release criteria (definition of market-ready)
1. Every Must feature implemented, code-reviewed, and covered by unit and E2E tests; CI green in Chromium, WebKit and
   Firefox on GitHub runners.
2. Zero serious or critical axe findings on every route; keyboard-only and screen-reader smoke tests pass; works at
   320 px and 200% text.
3. Performance budget met on a production build (home route JS at or under 150 KB gzipped; Lighthouse mobile
   performance 90+ locally).
4. Content: every item passed two independent checks; zero known errors in scheduled Dailies.
5. Supabase: migrations applied from the repo, RLS on every table, security and performance advisors clean, SQL tests
   pass through MCP, and the real-backend CI job passes.
6. Persona playtests complete every Must flow without confusion; their top issues fixed.
7. Security review passes: no secrets in the client, rate limits on write RPCs, input validation everywhere.

## 14. Addendum after the spec review (31 October 2026)
These override the PRD and ARCHITECTURE where they differ.
1. **Time zones and zone hops (replaces AC-STK-09's 20-hour rule).** The server accepts a Daily for local date D only
   when D is within one day of the server's UTC date (D in [utc_today - 1, utc_today + 1]). Streak credit requires D to
   be later than the player's last credited Daily date, so a device clock or zone change can never backfill a missed
   day (that is what free repair and freezes are for). A run whose device zone changed since the player's previous
   Daily is kept out of the crowd's numbers (honest-play flag) but still earns streak credit. No 20-hour rule.
   Rewrite AC-STK-09 to test exactly this.
2. **The Daily is online-only** (sealed, server-validated). Signed off.
3. **Content calls approved:** 12 categories; challenge packs only once 30 past Dailies exist; a 120-second
   "Relaxed Blitz" option.
4. **Supabase migrations must apply unattended** (see the new section in 01-ENGINEERING-CONSTRAINTS.md). Where the
   architecture's security baseline uses REVOKE, DROP or ALTER ROLE, achieve the same guarantee by construction (private
   schema without grants, only deliberate RPCs in public) and list anything truly unavoidable in the launch report.

## 15. Verification evidence for Daily items (overrides CONTENT_GUIDE §9.9 rule 3)
The shared web-search budget cannot supply two independent external sources for every Daily clue. So:
- An encore value needs at least one external source (dataset or web).
- A mystery's pinning clues and key must be confirmed by both independent checks (checker B runs on a different
  model from the writer and checker A). Knowledge confirmations count only at "certain" confidence.
- Any claim marked high-risk (numbers, dates, firsts, superlatives, quotations, etymologies, recent change) still needs
  dataset or web evidence in a confirming check. Writers should build hard clues from well-documented facts and use the
  precision ladder rather than lean on exact figures.
- Pass D (final pre-freeze re-check) and the seeded audit remain mandatory before a Daily is scheduled.

## 16. Answer-list freeze at launch (overrides CONTENT_GUIDE §2.10 rule 5 / lint C14 for the baseline)
The 30-day "addedIn" freeze exists so a small list diff can never hint at an upcoming answer. The first published
version of each list (the launch baseline, thousands of entries added at once) cannot narrow anything, so its entries
are eligible as answers immediately. The freeze applies to every entry added after the baseline version.

## 17. Owner answers (31 October 2026)
- Supabase: use project `zcodouduyvxwefxebvmv`. The owner will remove the old `NEXT_PUBLIC_SUPABASE_*` variables
  (project `wjyrysepifthbgbimqzw`) from the cloud environment and point Vercel at the new project.
- Vercel: not confirmed as connected. Treat it as not connected; the launch report carries the import and env steps.
- Content key: delivered to the owner as a file to keep in a password manager and add as the `QZ_CONTENT_KEY` GitHub
  secret. The database escrow table exists (migration applied) but holds no key, because session policy blocks reading
  the key into the transcript. Sealed content released to the database is the second copy.
- `QZ_CONTENT_KEY` is a GitHub **repository** secret (set by the owner). Only the `content-sealed` CI job may reference
  it, it must not declare an `environment:`, and nothing may print or export the key. Fork pull requests never receive
  it.

## 18. Evidence for high-risk claims when web search is unavailable (1 November 2026)
The first production pass cut 1,451 items, and 1,417 of those had passed BOTH independent checks: they were cut only
because their high-risk claims had no dataset or web evidence while the shared search budget was exhausted. That
contradicts this memo's original rule (section 10: two independent checkers, datasets where possible, WebSearch only
for genuinely uncertain items). So:
- A high-risk claim, and an encore value, is accepted when checks A and B (different agent runs; B on a different
  model) both confirmed it directly. Knowledge confirms only at "certain" confidence.
- External evidence is still required for any claim that needed the tiebreak, and for every myth-screen hit.
- Items cut only for missing external evidence are reinstated through the normal acceptance path.
- Compensating controls: a seeded blind audit with web evidence on a random sample before launch (target error rate
  under 1%), the "Report a problem" button on every reveal with automatic pull on weighted reports, and pass D before
  any Daily is frozen.

## 19. Decisions after RITE round 1 (4 November 2026)
Round 1's synthesis (`docs/playtests/rite-1.md`, section 6) proposed D1 to D18. These override the PRD and DESIGN.md
where they differ, until those documents are updated.
- **D1, Encore commas.** With decimals allowed, commas that are each followed by exactly three digits, or that form
  Indian grouping, are thousands separators: "1,200" is 1200 and "1,20,000" is 120000. A comma before one or two final
  digits is still the decimal point ("300,5" is 300.5). Replace the "`1,250` rejected" worked example.
- **D2, Encore purpose.** "Encore · one number, no points" and "If you tie on points, the closer guess ranks higher."
  on every Daily. The stop screen's Encore row adds "Breaks ties. Scores no points."
- **D3, share glyphs.** A wrong guess and Next clue cost the same, so the share no longer tells them apart, and it stops
  painting them red: every clue used before the solve is 🟧, the solving clue stays ✅ and an unneeded clue stays ⬜.
  A miss is 🟧🟧🟧🟧. 🟧 is the high-contrast set's checked "passed" glyph, so that set keeps 🟧 and 🟦. The stop
  screen shows a one-line legend under its grid: "🟧 clue used · ✅ solved · ⬜ not needed".
- **D4, Encore token.** The share's first line says "Encore off by 4%" ("off by under 1%", "off by over 999%",
  "off by 3 years"); "Encore spot on" stays. The in-app result keeps "4% off".
- **D5, one match.** When exactly one selectable suggestion matches, it is highlighted, so Enter or Go picks it and a
  second Enter submits. Namesakes still pick nothing.
- **D6, keys.** Letters A to D pick, matching the badges. Digits 1 to 4 pick only when no option is a number. One key
  hint per option.
- **D7, time.** The stop screen's score card shows the total time ("Time 3:12 · only breaks ties"). Time never enters
  the share text.
- **D8, stopwatch default.** Decided after round 2: if personas still hurry with the hint in place, the stopwatch is
  hidden by default until the first Daily is finished.
- **D9, Next clue keeps the typing.** Next clue keeps the typed text and its list; a wrong guess still clears.
- **D10, stamps.** "Knew it." only for a solve on clue 1 or 2 with no wrong guess; "Got there." for clue 3 or any
  solve after a miss; "Got it." for a clue-4 pick.
- **D11, header pills.** A solved pill shows "+3" on the correct fill and a missed one the X; pills are flat marks,
  never button-like. No running total in the header for now.
- **D12, explanations.** The compact sheet shows the whole explanation (35 words at most) and scrolls, instead of one
  line and Read more.
- **D13, practice results.** Each row carries a short stem and, on a miss, "You chose X"; Play again sits above the
  list.
- **D14, placeholder.** A short noun per answer type ("Start typing an element") that fits beside Guess at 360 px.
- **D15, focus order.** Next clue comes after the field in reading and focus order, so the first Tab reaches the
  field.
- **D16, band chip.** The chip reads "Close guess", and the result card keeps both band lines, so a guess outside them
  still shows where they were.
- **D17, no matches.** "No matches. Try another spelling, or use Next clue."
- **D18, Today.** One date on Today. A first-visit line under the greeting: "Name the mystery in as few clues as you
  can." From midnight to 4:59 the greeting is "Hello."

## 20. Plan changes (4 November 2026)
- **Wave 3 overlaps Wave 2F.** SQL-1, CNT-1, CNT-2 and IDN-1 change no screen the RITE rounds judge, so they start
  once PLT-1 (and, for CNT-1, CNT-0) has merged, beside the RITE fixes. The M1 exit review still gates every M2 ticket
  that changes a Must screen (DLY-2, PRA-2, DLY-3, STK-1 and later). This trades a little rework risk for days of
  calendar time against the usage limit.
- **FIX-DS.** Round 1 found shell and primitive defects while DS-1 was mid-build. They go to a FIX-DS follow-up on
  DS-1's lane instead of the feature lanes, so two lanes never edit `src/ui/**` or `src/features/shell/**` at once.

## 21. Decisions of 5 November 2026
- **Deleting data.** Until the owner decides otherwise, routine database work never deletes: rows are overwritten,
  upserted, blanked or switched off. Genuine deletions, such as a player's "Delete my data" request and the nightly removal
  of test players, live in migrations named `*_attended.sql` that are applied only in a session the owner attends, each
  listed with its purpose in `supabase/README.md`. Nothing is ever rewritten or disguised to slip past the database tool's
  confirmation prompt.
- **Content Security Policy.** `script-src` keeps `'unsafe-inline'`: Next.js inserts inline scripts that differ per page
  and per build, so they cannot be hashed in advance, and a per-request nonce would force every page to render on the
  server. Compensating controls: `script-src-attr 'none'`, a test that fails if anyone adds a hash or nonce (either would
  silently disable `'unsafe-inline'` and break hydration), and an E2E that loads every route with zero violations. Revisit
  if the app moves to dynamic rendering.

## 22. Decisions after RITE round 2 (5 November 2026)
Round 2's synthesis (`docs/playtests/rite-2.md`, sections 7 and 10) proposed D19 to D26 and a way through the
comprehension check's question 4. All are accepted as proposed, with D20's practice legend and D23's Enter spelled out
below. They override the PRD, DESIGN.md and §19 where they differ, until those documents are updated.
- **D19, the stopwatch while away.** The rule stays: time counts while a clue or the Encore is open, even with the Daily
  closed or How to play open, and stops on every reveal. Say so where the belief forms. Leaving while a clue or the
  Encore is open, the X's accessible name is "Leave the Daily. Your progress is saved, and the stopwatch keeps running."
  and the toast "Saved. The stopwatch keeps running." Leaving from a reveal keeps "Saved". How to play's ranking part and
  How scoring works say "The stopwatch runs while a clue is open, even while you're away or reading this, and stops on
  every reveal." No pause: the server's interval is the official time (PRD §4.1.4, §4.3.2; ARCHITECTURE D7).
- **D20, option keys (amends D6).** Option keys act only while focus is on an option, inside the options group; a key
  pressed on a heading, the page or the guess field does nothing. On the Daily's clue 4 a key chooses (focus moves to
  that option and it is marked), and Enter or the same key again locks it in. Practice keeps one key per answer, inside
  the group. Once a keyboard is in use, a legend shows on screen: "Keys A to D choose. Enter locks in." at clue 4 and
  "Keys A to D answer." in practice (digits still follow D6). The accessibility statement shows its "Turn them off" line
  only once Settings has the switch (SET-1).
- **D21, the tiebreak order (amends D2).** The Encore line becomes "If you tie on points, the closer guess ranks higher.
  Time only counts after that." The stop screen's Encore row reads "Breaks ties: closest Encore first, then time. Scores
  no points." How to play's "so far today" sentence appears only once the stop screen has a percentile.
- **D22, a miss (amends D3).** A miss ends in ❌: 🟧🟧🟧❌. The legend becomes "🟧 clue used · ✅ solved · ❌ missed ·
  ⬜ not needed", and the high-contrast set keeps ❌, since it reads by shape. A wrong guess and Next clue still look the
  same. Design runs PRD Q5's device checks on ❌ before launch.
- **D23, Guess takes the one match (amends D5).** With exactly one selectable match highlighted, Guess (or Go) submits
  it, and the "Pick a name from the list, then Guess." hint doesn't show. Enter keeps D5's pick, then submit.
- **D24, clue 4's line.** "Last clue. Pick one of four. One pick: a wrong one scores 0."
- **D25, How to play before the clock.** Today's Daily card links "How to play", which opens the same sheet before the
  Daily starts: no attempt is created and no clock runs.
- **D26, the match count.** When more match than show: "7 countries match. Showing 6, so keep typing." is spoken, and
  "Showing 6, so keep typing." also shows under the list.
- **The comprehension check's question 4.** M1's check (PRD §9.4) covers questions 1 to 3. Question 4 moves to the first
  persona round with a percentile, in M3, since DLY-3 builds the percentile in M2. Release criterion R6 still needs all
  four questions at M5. No greybox "so far today" line is built for M1.
- **Defaults kept at the M1 exit.** `options_from_clue` stays 4 and `daily_minutes` stays 4 (the closed beta's median
  session sets it, PRD §3.1.7). D8: the stopwatch stays visible by default, because the hint stopped the hurrying.
- **Kept as specified** (rite-2.md §7, "Conflicts"): Share stays secondary, straight under the score card; words come
  first in the share text; no streak in the share text; a wrong guess costs what Next clue costs; focus after How to play
  returns to the clue; a new Mystery focuses its heading; no visible running total, though the progress group's
  accessible name may carry it; a clue-4 option commits on release by touch (round 3 watches R2-25).
- **FIX2 lanes.** Round 2's fixes run as FIX2-DLY, FIX2-MYS, FIX2-PRA and FIX2-DS, split by owned paths as §20 split
  round 1's. FIX2-DS alone edits `src/ui/**` and `src/features/shell/**`. Round 3 plays a build of the integration
  branch once all four have merged, and if it finds no P0 or P1 confusion it is the last M1 round.

## 23. Assembly windows after the re-estimates (5 November 2026)
- **The evidence.** Fresh, blind estimates replaced the script-made ones on m.sci, m.food, m.geo and m.nat b01. Over
  all 386 active mysteries, CONTENT_GUIDE §10.2's windows (Mystery 1 3.2 to 3.6, Mystery 2 2.5 to 2.9, Mystery 3 1.9 to
  2.3) hold 88, 86 and 61 items; 90 fall in the gaps between them, 53 below 1.9 and 8 above 3.6. Text-only estimates
  carry an error of roughly 13 to 21 points (research gap 3), so the gaps measure noise more than difficulty.
- **The decision.** Until real play calibrates the estimates, the windows are contiguous and follow PRD §4.1.6's bands:
  Mystery 1 from 3.0 to 3.6, Mystery 2 from 2.4 to 3.0, Mystery 3 from 1.8 to 2.4. Inside a window the scheduler (CNT-3)
  prefers points nearest the old centres (3.4, 2.7 and 2.1) and, for Mystery 1, the lowest spread. Items above 3.6 may
  fill Mystery 1 last. Items below 1.8 don't schedule; an editor rewrites their ladders and they are re-estimated. The
  weekly content run (§10.7) re-tunes estimates from play data and may narrow the windows again once it has enough.
- **What it leaves.** By these windows the pool holds 136 easy, 115 medium and 94 hard items, plus 41 below 1.8. The
  100 Dailies and 20 spare sets need 120 in each slot, so the mystery top-ups aim at hard items first (art, film, history
  and language are thinnest), then medium. Rewriting the items below 1.8 is the cheapest source of hard ones.

## 24. Encoding data for the database tool (10 November 2026)
- §21 forbids rewriting or disguising a statement so a destructive operation slips past the database tool's
  confirmation prompt. It does not forbid encoding data. `content:release` escapes `;` and one letter of "execute" inside
  JSON string values, so the tool's statement splitter doesn't cut a content load in half; the stored values are
  identical once decoded. That stays, on one condition, which a test enforces: no chunk the release writes contains a
  DROP, DELETE or TRUNCATE statement, decoded or not. A chunk that needs one belongs in an attended migration (§21).

## 25. Small rulings during the round 2 fixes (10 November 2026)
- **D20's practice legend names only the letters on screen**: "Keys A and B answer." for true or false and comparisons,
  "Keys A to C answer." for three options, "Keys A to D answer." for four. Its line is reserved while shortcuts are on, so
  showing it moves nothing (PRD §3.0.3).
- **Two retired film mysteries** (m.film.0116 and m.film.0123) left the pool rather than being reopened: their accept
  rested on a tiebreak with Tier C evidence, which rule 3 doesn't count, and the only path that reopens an active item
  (an invalid_check incident) would wrongly accuse a checker whose work was real. A future tool to reopen an active item
  for a §9.10 re-check would avoid such losses.

## 26. Decisions after RITE round 3 (10 November 2026)
Round 3 (`docs/playtests/rite-3.md`) found no P0 and no P1 confusion in four reported sessions, one P1 defect, and a fifth
session that returned no report. M1 doesn't exit yet; round 4 runs five complete sessions on a build with the fixes below.
- **D27, the Today card's timing.** "About 4 minutes · no time limit" replaces "untimed", since time breaks ties.
- **D28, focus at clue 4 (amends D20).** When the four options appear, focus moves to the options group, which is labelled
  by the clue, and the key legend shows from then on, so A then Enter works with no Tab. Typing a name from an option still
  commits nothing (D20's typing guard stays). The practice legend reads "Keys A to D answer at once."
- **D29, unfinished tabs.** Placeholder tabs are hidden or clearly marked before launch; not needed for M1.
- **D30, practice keys.** D28 extends to practice; a question focuses its options group and the legend shows from the start.
- **One clock, properly.** The stopwatch, recorded rounds and the stop screen use one rounding rule, and the header freezes on
  the value shown when Lock in is pressed. The stop screen shows that same value.
- **Help pages promise only what exists.** Sentences about a player count, Settings and Reduce motion show once those ship.
- **A fair fixture Daily for round 4**: a Mystery 1 that no single clue-1 word gives away, and clue-4 distractors that fit the
  earlier clues, with a lint for the second.
- **The score card's inset is charcoal in dark mode** (`--kn-card-inset` with `--kn-on-card-inset`; cream with ink in light).
  Every share glyph holds at least 4:1 on charcoal and fails on a dark-theme cream (🟧 about 2.1:1, ⬜ 1:1). This settles
  R2-09's "cream in both themes".
- **Hide stopwatch is announced**: "Stopwatch hidden. It still runs for tie-breaks."
- **A hidden tab keeps counting on the Daily header** (D19), and every clock value floors to the second: the header, the
  recorded rounds and the stop screen.

## 27. Decisions after RITE round 4 (10 November 2026)
Round 4 (`docs/playtests/rite-4.md`) ran five complete sessions: no P0, comprehension 15 of 15, the header equal to the
stop screen in every run, and one P1 confusion (R4-01), which round 3's own fixes caused. M1 doesn't exit; round 5 follows.
- **D31, one way to lock in at clue 4 (reverses §22's "commits on release by touch" and D20's same-key-twice).** At clue 4
  a tap, a click, Space, Enter on an option that isn't chosen, or a letter key only chooses: the option is marked and
  nothing is sent. A "Lock in <name>" button, or Enter on the chosen option, commits, as the Encore's Lock in does. Choosing
  another option moves the mark. Pressing the same letter twice no longer locks in. The pick is one shot and a miss scores
  0, so the extra tap is worth it, and touch, mouse, keyboard and screen reader now share one model. D20's typing guard
  stays. Amended after integration 8's verification: the third letter or digit since focus came to the options is a
  typed word however slowly the keys come (so "Abba" then Enter locks nothing at any pace); option keys then choose
  nothing until Escape, Tab or a pointer, and the legend says "Typing chooses nothing. Press Esc, then A to D." Two keys
  are never a word. A wrong lock scores 0, so not locking wins over convenience; round 5 judges whether this reads well.
- **D32, key legends only for keyboards.** A key legend shows once a key has been pressed or the device has a fine pointer
  and a keyboard is likely; never on a touch-only phone. At clue 4, touch players read "Tap one, then Lock in."; keyboard
  players read "Keys A to D choose. Enter locks in." Practice keeps one tap or one key per answer, and its legend follows
  the same rule.
- **D33, honest play against "Take your time".** Before M2 shows the crowd's numbers, the honest-play rule that leaves out
  a "long look" is reconciled with the header's "Take your time"; SQL-5's owner brings a proposal.
- **D34, the stop screen until the percentile ships.** One optional line may say that comparisons arrive with more players.
- **D35, text size.** The play header and the tab bar's text scale with the user's text size (release criterion R2), in M2.
- **Round 5 method.** All five play the same Daily (pin every driver's time zone); every persona reaches clue 4 in the
  first Daily and says what will lock in the pick before the reveal; the spread and cross-pool checks are recorded before
  play; evidence is copied beside the E2E reports.
