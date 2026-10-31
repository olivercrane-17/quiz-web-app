# 06. How studios build and launch quiz products

*Track 06, compiled 2026-10-31.* **Method note.** The shared web search budget ran out before this track started, and direct page fetches were blocked. So this report rests on primary sources still reachable today (official docs bundled with Next.js 16.4 or served by Supabase's MCP tool, plus code and papers on GitHub) and on facts already sourced in reports 01 to 04. Background knowledge fills the gaps and is tagged.

*Tags:* **[F]** we read the primary doc, code or paper today. **[R]** sourced in reports 01 to 04 (original link shown, not re-opened here). **[K]** background knowledge, not re-verified this session (medium or low confidence). *Our read* and *our calculation* mark interpretation.

## Summary

- **Studios find the fun before they write the spec.** NYT Connections came out of an internal game jam and Quizlet Live was prototyped in a day at a hackathon [R]. Rapid playtests that fix problems between sessions are standard practice [K].
- **Launches pass number gates, and studios kill what misses.** Mobile studios soft-launch in a few markets; in 2019 many reportedly killed projects with day-1 retention under 35% [R]. NYT ships new games as public betas first [R].
- **Experiments are routine, and judgment still decides.** Duolingo switched its spaced-repetition model through a six-week randomized test on just under 1 million students and shipped it despite a 7.3% drop in practice. A follow-up on 3.3 million students raised next-day return by 12% (relative) [F].
- **Our traffic makes A/B tests expensive.** Detecting a move from 35% to 38% day-1 retention needs about 4,040 new players per arm (*our calculation*). Test big swings; playtest the rest.
- **Content runs like a newsroom with a scoreboard.** One editor owns each NYT game [R]. Lichess's open code shows how to rate content from play: each attempt is a Glicko match between player and puzzle, and only first rated attempts by players with a fairly certain rating move a puzzle [F].
- **Realtime fan-out is where live quizzes break.** HQ's lag-driven eliminations and ARD's crashed Quizduell premiere are the warnings [R]. Supabase Free allows 200 concurrent connections and 100 messages a second, counted per recipient [F].
- **Async turns and dailies are the sturdy backbone.** Trivia Crack turns take a minute or two inside matches lasting days [R], and a daily is one edited puzzle per date. Neither needs a persistent socket (*our read*).
- **The web launch checklist is concrete:** Google's "good" vitals thresholds (LCP 2.5 s, INP 200 ms, CLS 0.1), install rules that need a manifest and HTTPS but no service worker, OG image size caps, and Supabase pausing Free projects after a quiet week [F].
- **Machines catch some bugs; people catch the rest.** Playwright's own docs say many accessibility problems "can only be discovered through manual testing" [F].

## Detailed findings

### 1. Discovery and prototyping

Small prototypes keep beating big plans in this genre. Connections grew out of an internal NYT game jam and launched in beta in June 2023; Wyna Liu has edited every board ([Wikipedia](https://en.wikipedia.org/wiki/The_New_York_Times_Connections)) [R]. Quizlet Live was prototyped in one day at a hackathon and launched in April 2016. Within a year it reportedly drew about 10% of Quizlet traffic ([Shipping on Fridays](https://shippingonfridays.substack.com/p/hitting-the-hackathon-jackpot-how)) [R].

Studios pair this with short, pillar-driven design docs and timeboxed sprints that end in user tests ([GV sprint](https://www.gv.com/sprint/)) [K]. Microsoft's games user research group described the RITE method in 2002, using the *Age of Empires II* tutorial: change the build once a problem and its fix are clear, sometimes after one participant, then keep testing [K]. Nielsen's rule of thumb is that five users per round reveal most usability problems ([NN/g](https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/)) [K].

*Our read:* agents can build a playable greybox in hours, so our bottleneck is honest playtesting, not building.

### 2. Team topology

Supercell is the best-known example of small autonomous "cells" that kill their own games in beta [K]. *Team Topologies* (Skelton and Pais, 2019) names four team types: stream-aligned, platform, enabling and complicated-subsystem ([key concepts](https://teamtopologies.com/key-concepts)) [K]. Duolingo runs a dedicated retention team; its streak lead said in December 2024 that it ran 600+ streak experiments in four years and killed about half, neutral ones included ([Lenny's Podcast](https://lennysnewsletter.com/p/behind-the-product-duolingo-streaks)) [R]. NYT gives each daily game a named editor: Liu for Connections [R], and Tracy Bennett has curated Wordle's answers since late 2022 [K].

*Our read:* the common shape is stream-aligned pods that each own a player loop and a metric, on top of a shared platform team, with editors treated as owners rather than a service desk.

### 3. Soft launch, betas and kill criteria

Mobile studios usually soft-launch in a handful of markets, proving stability and retention before monetization and a global launch [K]. Retention is the gate. Median mobile games keep about 22 to 23% of players on day 1 and the top quartile 26.5 to 27.7%; older trivia data reaches 48% ([GameAnalytics 2025](https://www.gameanalytics.com/reports/2025-mobile-gaming-benchmarks)) [R]. In 2019 many studios reportedly killed projects with D1 under 35% [R].

The web has no app-store soft launch, so web teams use labelled betas. NYT launched Connections as a beta in June 2023 [R] and retired Digits after its 2023 beta [K]. Launch-day spikes are the other risk. ARD's *Quizduell* app server failed minutes into the May 2014 TV premiere with about 180,000 people registered ([Horizont](https://www.horizont.net/medien/nachrichten/Quizduell-Server-brachen-wohl-wegen-ueberlastung-zusammen-120559)) [R].

### 4. Analytics and experimentation

Duolingo's half-life regression paper (Settles and Meeder, ACL 2016) is the clearest public record of how it tests a core algorithm ([repo and paper](https://github.com/duolingo/halflife-regression)) [F]:

- **Test I** randomized "just under 1 million students" for six weeks, HLR against the old Leitner scheme. Overall activity barely moved (+0.3%, not significant) while practice fell 7.3%. Students had complained that practice "did not review what they thought they needed most," so the team read the drop as healthy and shipped.
- **Test II** followed complaints from vocal students that words decayed too fast. The team traced it to overfitted features and tested a simpler model on 3.3 million students for two weeks. Next-day return to any activity rose 12.0% (relative, p < 0.001) and practice rose 9.5%. The simpler model also solved the cold start for new courses with no training data.

Two habits stand out: qualitative evidence breaks ties when metrics disagree, and complaints from engaged users seed the next test. Product teams test the same way; letting users equip two Streak Freezes raised DAU 0.38% ([Duolingo blog](https://blog.duolingo.com/improving-the-streak)) [R].

*Our calculation* (two-sided alpha 0.05, 80% power): moving D1 from 35% to 37% needs about 9,040 new players per arm, to 38% about 4,040 and to 40% about 1,470, while a share rate moving from 20% to 25% needs about 1,090. At launch volumes we can afford only a few such tests a quarter.

Next.js's `useReportWebVitals` hook sends TTFB, FCP, LCP, CLS and INP to any endpoint ([Next.js](https://nextjs.org/docs/app/guides/analytics)) [F], so field performance can land in our own tables without a third-party tracker.

### 5. Architecture: live, async and daily

**Live rooms (Kahoot, HQ).** Their engineering posts were unreachable, so this covers documented failures. Kahoot's open PINs drew bot floods and rude names, which it answered with a friendly-name generator ([Kahoot community](https://support.kahoot.com/hc/en-us/community/posts/360029558133-Kahoot-Hacks-must-stop)) [R]. A public npm library let anyone join a PIN and auto-answer in about ten lines of code until it was taken down on February 18, 2021 ([README](https://github.com/theusaf/kahoot.js-updated)) [F]. HQ peaked at 2.38 million concurrent players in March 2018. Lag was the top complaint, and a May 2018 glitch eliminated over 700,000 of about a million players on question one ([GamesBeat](https://gamesbeat.com/hq-trivia-sees-multiple-glitches-in-live-contests/)). Researchers also showed question data reaching cheaters ([HackerNoon](https://www.hackernoon.com/how-we-hacked-hq-trivia-loco-brainbaazi-and-how-they-can-prevent-it-5e40c97179ec)) [R]. *Our read:* in sudden-death play, network jitter becomes a lost game, and any answer that reaches the client early becomes a cheat.

**Async duels (Trivia Crack).** Turns take a minute or two while matches run for days, and the friend loop carried it past 500M downloads by 2018 ([PocketGamer.biz](https://pocketgamer.biz/news/69128/trivia-crack-sequel-launch-original-passes-500m-downloads/)) [R]. *Our read:* a turn is one request and one stored state change, so the mode needs no sockets and shrugs off flaky networks.

**Dailies (NYT).** Everyone gets the same puzzle per date, made or curated by an editor, with a spoiler-free share grid [R]. The original Wordle shipped its whole answer list in the page's JavaScript; NYT later moved to serving each day's solution by date so an editor can change it [K]. *Our read:* serve dailies by date from a sealed pool, as our constraints already require.

**Supabase Realtime facts** [F]:

- Free plan: 200 concurrent connections, 100 messages a second, 100 channel joins a second and 2 million messages a month. A message is any WebSocket event "delivered to, or sent from a client," and connections drop while a project exceeds the rate ([limits](https://supabase.com/docs/guides/realtime/limits), [pricing](https://supabase.com/docs/guides/realtime/pricing)).
- Postgres Changes checks access per subscriber on a single thread: "if you have 100 users subscribed to a table where you make a single insert, it will then trigger 100 'reads'." Supabase points to Broadcast at scale ([benchmarks](https://supabase.com/docs/guides/realtime/benchmarks)).
- The database can broadcast through `realtime.send()` or `realtime.broadcast_changes()`. These are private by default, private channels need authenticated clients, replay works only on private channels, and stored messages are deleted after three days ([Broadcast](https://supabase.com/docs/guides/realtime/broadcast)).

*Our calculation:* a 10-question room with three broadcasts per question costs 30 messages per connected client, so 1,530 for 50 players plus a host. Re-sending the roster on every join adds 1,326 more, because that cost grows with the square of room size. The monthly quota then covers roughly 700 to 1,300 such games, and three rooms opening a question in the same second could exceed the 100-a-second cap.

### 6. Content operations and difficulty calibration

Trivia Crack's Question Factory let players submit, rate, translate and flag questions; by one estimate about 1,000 of every 200,000 submissions reached the game, and errors still slipped through ([Windows Central](https://windowscentral.com/trivia-crack-hit-growing-pains-thanks-flood-user-submitted-questions)) [R]. AI drafts need the same gate: in one medical-exam comparison, AI-written items had more factual errors (6% vs 4%) and more duplicates (14% vs 7%) ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11806894/)) [R]. TV quiz shows separate writing from research, with researchers verifying each clue before air [K]. On item design, a meta-analysis of 80 years of studies found three options optimal for multiple choice ([Rodriguez 2005](https://doi.org/10.1111/j.1745-3992.2005.00006.x)) [K].

Calibration from play has open, working models:

- **Elo.** Pelánek treats each answer as a match between player and question, and the simple update tracks heavier models well ([paper](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf)). A 2025 analysis warns such ratings are biased and context-dependent ([Bolsinova et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC12784335/)) [R].
- **Lichess puzzles** run Glicko in production [F]. The code says "we treat the solve as a game where the player is white and the puzzle is black" ([PuzzleFinisher.scala](https://github.com/lichess-org/lila/blob/master/modules/puzzle/src/main/PuzzleFinisher.scala)). Only a first rated attempt changes ratings, and updates are damped when the player picked a theme, most of all for wins on themes that give the answer away (weight 0.1). A puzzle ignores results from dubious players and from players whose own rating deviation is 230 or more ([model.scala](https://github.com/lichess-org/scalachess/blob/master/rating/src/main/scala/glicko/model.scala)). Each user can move puzzle ratings at most 300 times a day, and one result can shift a puzzle by at most 700 points ([Glicko.scala](https://github.com/lichess-org/lila/blob/master/modules/rating/src/main/Glicko.scala)).
- **Spaced review.** Duolingo's HLR, fit on 13 million learning traces, predicts when a learner will forget an item [F], a natural engine for a "review your misses" mode.

### 7. QA practices

Game QA leans on smoke tests for every build, a regression suite, a device and browser matrix, exploratory sessions and a bug bash before each milestone, with bugs triaged by severity and frequency [K]. Web tooling automates much of this [F]:

- Playwright runs axe scans through `@axe-core/playwright`, and its docs recommend pairing them with manual testing ([docs](https://playwright.dev/docs/accessibility-testing)).
- `toHaveScreenshot()` baselines differ by OS and browser, so they must be generated where the tests run ([docs](https://playwright.dev/docs/test-snapshots)).
- Lighthouse CI fails a build when an audit exceeds its `maxNumericValue` or breaks a budgets file ([config](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md)).
- Supabase's production checklist says to load-test, "preferably on a staging env," with k6, the tool behind its own benchmarks ([checklist](https://supabase.com/docs/guides/deployment/going-into-prod)).

### 8. Web launch checklist (verified items)

- **Performance.** Google's web-vitals library sets "good" at LCP up to 2,500 ms, FCP up to 1,800 ms, INP up to 200 ms and CLS up to 0.1 ([source](https://github.com/GoogleChrome/web-vitals/tree/main/src)) [F], judged at the 75th percentile of visits [K]. Our own budget is stricter (LCP < 2.0 s, CLS < 0.05).
- **Install.** Chromium needs a manifest with `name` or `short_name`, 192 px and 512 px icons, `start_url` and `display`, served over HTTPS. A service worker is not required, and iOS 16.4+ installs from the Share menu of Safari and other major browsers ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)) [F]. Next.js advises against relying on `beforeinstallprompt`, which "does not work on Safari iOS," and web push on iOS works only for Home Screen apps ([Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps)) [F].
- **Sharing.** An `opengraph-image` file must stay under 8 MB and a `twitter-image` under 5 MB or the build fails. Generated images (`ImageResponse`) allow only flexbox layouts and a 500 KB bundle, with fonts in ttf, otf or woff ([OG docs](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image), [ImageResponse](https://nextjs.org/docs/app/api-reference/functions/image-response)) [F].
- **SEO.** Use the Metadata API, sitemaps, robots files and JSON-LD, escaping `<` in JSON-LD to block XSS ([checklist](https://nextjs.org/docs/app/guides/production-checklist), [JSON-LD](https://nextjs.org/docs/app/guides/json-ld)) [F].
- **Security and ops.** Enable RLS on every table and "consider how *you* might abuse your service as an attacker." Free projects pause after low activity over 7 days (restorable for 90 days), and Free backups cannot be downloaded ([checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [pausing](https://supabase.com/docs/guides/platform/free-project-pausing)). Next.js's PWA guide serves the service worker with `no-cache` and a strict CSP [F].
- **Legal.** The amended COPPA rule's compliance date was April 2026 ([FTC](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa)) [R]. WCAG 2.2.1 requires adjustable timing outside real-time play ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)) [R]. Hosting user quizzes likely brings EU Digital Services Act notice-and-action duties and UK Online Safety Act risk assessments [K; needs legal review].

## Implications for our product

We should mirror a small studio, adapted to an agent swarm.

1. **Four pods, each owning one metric.** Gameplay owns first-quiz completion, Content owns confirmed bad-question reports per 1,000 answers, Growth owns D1 and share rate, and Platform owns p75 LCP and INP plus realtime disconnects. QA and accessibility act as an enabling team. Every change gets a reviewer from outside its pod.
2. **A one-page PRD per feature**: the player problem, the pillar it serves, a success metric, a kill criterion and a test plan. Nothing gets polished before a playable greybox has been tested.
3. **RITE rounds every build cycle.** Five fresh testers per round (persona agents now, people in beta). Fix between sessions and log every confusion point with its screen.
4. **A beta ladder with written gates.** Closed beta by invite link (about 200 players, two weeks), then a public "Beta" label for four weeks, then 1.0. Advance only with D1 of 35% or better among first-quiz finishers (report 02's target), zero open P0 bugs, p75 vitals inside budget, under one confirmed content error per 1,000 answers and a passed manual accessibility audit. Below 25% D1 after two onboarding iterations, rework the core loop.
5. **Experiment rules.** Until a test can reach about 4,000 new players per arm, only test changes expected to move a primary metric by 5 points or more; ship smaller ones behind a flag with a 10% holdout. Pre-register one primary metric and two guardrails (error rate, report rate) and never stop early on a lucky day. Bucket players by a salted hash of their id.
6. **First-party analytics with a dozen events**: `landing_view`, `first_answer`, `quiz_complete`, `share_click`, `share_landing`, `install_prompt_shown`, `install_accepted`, `report_question`, `room_join`, `room_disconnect`, `daily_complete` and `return_d1`, plus sampled vitals from `useReportWebVitals`. No third-party scripts.
7. **Content as a pipeline with states**: draft, fact-checked (two independent sources, one primary), edited, test-solved, scheduled, live, calibrated, retired. Each item stores its sources, checker, verified date and an expiry for time-sensitive facts. AI may draft; a human verifies every item. Hold 30 dailies scheduled before launch and at least 14 ahead after.
8. **Difficulty from play, Lichess-style.** Seed each question from the writer's estimate and test-solver success rate. Update Elo or Glicko only on a player's first ranked attempt; damp self-picked categories and lifelines; ignore flagged accounts and players with under 20 rated answers; cap each player's daily influence; freeze disputed questions; recompute nightly. Send an item to an editor when success sits above 95% or below 10%, strong players miss more than weak ones, a distractor draws under 5% of picks, or reports pass 1% of plays. Allow three-option questions instead of weak filler distractors.
9. **Daily by date, sealed.** The server releases date D once any time zone reaches it (UTC+14) and accepts results until the last zone leaves it (UTC-12), a window of about 50 hours. The global board for D closes after that.
10. **Live rooms sized for Supabase Free.** Rooms stay DB-authoritative through RPCs. Topics are public but unguessable, since private channels need Supabase Auth, which we lack. Payloads carry only room id, phase, version and server deadline, never an unrevealed answer. No per-second ticks; roster batched once a second; polling every 2 to 3 s as a fallback; rejoin with backoff. Cap rooms at 50 players and the project near 150 live connections, offering an async challenge when full, and move to Pro (500 connections, 500 messages a second) once weekly peaks pass 120.
11. **Async duels and practice use no sockets**, just RPC calls plus a refetch on focus. Push reminders for installed PWAs come later.
12. **CI quality gates.** Unit and E2E tests on every PR (Playwright pinned at 1.63.0), an axe scan of every route with zero serious or critical findings, screenshot baselines made only in the CI Linux image, and Lighthouse CI assertions (LCP 2,000 ms, TBT 200 ms, CLS 0.05, 150 KB gzipped script). Before any release that touches realtime, run a k6 room test from GitHub Actions against a staging project.
13. **A launch checklist owned by Platform**, built from section 8 and adding an iOS install hint, OG images per result, legal and content-policy pages with a report flow, a 13+ age decision, a plan against Free-tier pausing, a nightly data export and pre-written incident banners.
14. **A live ops calendar from week one**, owned by Content: weekly themes, monthly events, holiday packs and a December recap like the one NYT launched on December 16, 2025 ([Engadget](https://www.engadget.com/gaming/nyt-games-has-a-year-in-review-thing-now-too-203000878.html)) [R].

## Anti-patterns to avoid

- Writing a long spec before anything is playable.
- Reading an A/B test with a few hundred players per arm as signal, or stopping one at the first green number.
- Driving room state through Postgres Changes fan-out, or re-sending the roster on every join.
- Elimination formats where our latency costs a player the game (HQ, May 2018).
- Sending answers or future dailies to the client before lock-in (the original Wordle answer list, HQ's leaked question data).
- Letting every play move a question's rating. Repeat attempts, hinted contexts, brand-new players and suspicious accounts add noise; Lichess filters all four.
- Publishing AI-drafted or user-submitted questions without a human check.
- Gating betas on sign-ups or page views instead of D1 and error reports.
- Treating an automated accessibility scan as an audit.
- Launching on the Free tier with no answer to pausing and no backup export.

## Open questions

1. How do Kahoot and HQ handle transport, fan-out, timing sync and bot-resistant joins? Their write-ups were unreachable; rerun when search budget allows.
2. Does Supabase enforce 100 messages a second per exact second or on average, and how does a 50-player room behave at the cap? A k6 test should answer both.
3. Can we run a second free Supabase project as staging, or must load tests hit production off-peak?
4. Do Vercel's Web Analytics and Speed Insights fit the Hobby plan at our volume, and would they break our no-tracker rule?
5. Which [K] claims must be verified before they drive decisions? Start with the three-option finding and the DSA and OSA duties for user quizzes.
6. How many rated answers does a new question need before its rating can be trusted? Simulate with Lichess-like parameters.
7. Will Google show any rich result for quiz pages in late 2026? Check its current search gallery.

## Sources

Read today [F]:

- https://nextjs.org/docs/app/guides/production-checklist
- https://nextjs.org/docs/app/guides/progressive-web-apps
- https://nextjs.org/docs/app/guides/analytics
- https://nextjs.org/docs/app/guides/json-ld
- https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
- https://nextjs.org/docs/app/api-reference/functions/image-response
- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/docs/guides/realtime/pricing
- https://supabase.com/docs/guides/realtime/benchmarks
- https://supabase.com/docs/guides/realtime/broadcast
- https://supabase.com/docs/guides/deployment/going-into-prod
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://github.com/GoogleChrome/web-vitals/tree/main/src
- https://github.com/lichess-org/lila/blob/master/modules/puzzle/src/main/PuzzleFinisher.scala
- https://github.com/lichess-org/lila/blob/master/modules/rating/src/main/Glicko.scala
- https://github.com/lichess-org/scalachess/blob/master/rating/src/main/scala/glicko/model.scala
- https://github.com/duolingo/halflife-regression
- https://github.com/theusaf/kahoot.js-updated
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
- https://playwright.dev/docs/accessibility-testing
- https://playwright.dev/docs/test-snapshots

From reports 01 to 04 [R]:

- https://en.wikipedia.org/wiki/The_New_York_Times_Connections
- https://shippingonfridays.substack.com/p/hitting-the-hackathon-jackpot-how
- https://lennysnewsletter.com/p/behind-the-product-duolingo-streaks
- https://blog.duolingo.com/improving-the-streak
- https://www.gameanalytics.com/reports/2025-mobile-gaming-benchmarks
- https://www.horizont.net/medien/nachrichten/Quizduell-Server-brachen-wohl-wegen-ueberlastung-zusammen-120559
- https://support.kahoot.com/hc/en-us/community/posts/360029558133-Kahoot-Hacks-must-stop
- https://gamesbeat.com/hq-trivia-sees-multiple-glitches-in-live-contests/
- https://www.hackernoon.com/how-we-hacked-hq-trivia-loco-brainbaazi-and-how-they-can-prevent-it-5e40c97179ec
- https://pocketgamer.biz/news/69128/trivia-crack-sequel-launch-original-passes-500m-downloads/
- https://windowscentral.com/trivia-crack-hit-growing-pains-thanks-flood-user-submitted-questions
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11806894/
- https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12784335/
- https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa
- https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html
- https://www.engadget.com/gaming/nyt-games-has-a-year-in-review-thing-now-too-203000878.html

Background, not re-opened today [K]:

- https://www.gv.com/sprint/
- https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/
- https://teamtopologies.com/key-concepts
- https://doi.org/10.1111/j.1745-3992.2005.00006.x
