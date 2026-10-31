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
