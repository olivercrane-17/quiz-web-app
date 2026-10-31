# 04. Retention systems, social loops and monetization

*Track 04, compiled 2026-10-31.* **Method note.** The shared search budget ran out after 11 searches on this track (the brief asked for 15+), and Duolingo's pages could not be fetched. Evidence comes from search excerpts and from facts gathered by tracks 01 and 02 (marked †). Gaps are filled from well-known academic and platform sources, marked [K] and not re-verified. Spot-check [K] and [S] figures before they drive decisions.

Tags: **[F]** company-reported or filing. **[P]** press or peer-reviewed. **[S]** secondary or unverified. **[K]** prior knowledge. *Our read* marks interpretation.

## Summary

- **Streaks are the most tested retention lever, and forgiveness makes them stronger.** Duolingo reports 600+ streak experiments in four years [S]. Allowing two Streak Freezes instead of one raised daily actives 0.38%, and separating the streak from the daily goal raised day-14 retention 3.3% (relative lifts) [F].
- **Gains arrive in small steps.** Duolingo's notification bandit lifted DAU 0.5% and new-user retention 2% [P]. Its streak lead says streaks only work in an app people already enjoy [S].
- **Competition works best in small pools.** Weekly leagues reportedly lifted Duolingo learning time 17% [S], and lab studies find effort drops as the number of rivals grows [K].
- **Browser permission prompts fail by default.** About 99% of Firefox prompts went unaccepted, yet new users accepted 56% of first-time prompts that followed a click. Since October 2025 Chrome revokes permission from sites whose notifications go ignored, except installed web apps [F].
- **Quiz breakouts grew through built-in social objects:** Wordle's spoiler-free grid (46 shares a second in 2025), HQ's referral lives, Trivia Crack's async matches and Kahoot's room PIN [P/F†].
- **Async beats real-time for a small player base.** QuizUp's live duels reached 10M users in four months and never made money, while Trivia Crack's turn-based matches still earn. Bots posing as people drew a $420M verdict in April 2026 [P†].
- **Players pay for more and resent paying to stop pain.** Packs, archives, bigger rooms and host plans sell. Life timers, ads after every answer, pay-to-win boosts and ad-free passes sold as relief draw the loudest complaints [P†].
- **With no budget, free play plus paid edges is the proven path.** Wordle stayed free until NYT bought it, and Kahoot charges hosts while players play free. Ads only pay at Sporcle's scale and clash with our no-tracker rule.

## Detailed findings

### 1. Streaks: the strongest habit lever, if they forgive

Duolingo's streak lead, Jackson Shuttleworth, said in December 2024 that the team ran 600+ streak experiments in four years and killed about half, neutral ones included, to keep the app simple ([Lenny's Podcast](https://lennysnewsletter.com/p/behind-the-product-duolingo-streaks), [summary](https://www.recall.it/summary/lennys-podcast/behind-the-product-duolingo-streaks-or-jackson-shuttleworth-group-pm-retention-team)) **[S: episode summaries]**. The focus is the first week: moving new users from zero to a seven-day streak. Letting users choose a streak goal gave them ownership. A one-lesson daily bar helped a lot; dropping it to one exercise did not raise DAU. His caveat: streaks only work inside an app people already enjoy.

Published Duolingo results, all relative **[F]**:
- Showing the streak tick up each day raised new learners' day-7 retention 1.7% ([Duolingo](https://blog.duolingo.com/how-duolingo-streak-builds-habit)).
- Two equipped Streak Freezes instead of one raised daily active learners 0.38%; it did not cause more days off (same post).
- Separating the daily goal from the streak raised day-14 retention 3.3% and DAU 1%. Within 20 days, 10.5% more daily learners were on a streak ([Duolingo](https://blog.duolingo.com/improving-the-streak)).
- The Streak Wager (betting gems on a streak) brought learners back more often, per a Duolingo post seen via search excerpt ([Duolingo](https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals)). Secondary sizes vary; Econsultancy reports +14% day-7 retention ([Econsultancy](https://econsultancy.com/six-a-b-tests-used-by-duolingo-to-tap-into-habit-forming-behaviour/)) **[S†]**.

Friend Streaks link up to five people. Learners with one are 22% more likely to finish their daily lesson (correlational), and the cap stayed at five because few users have large active friend groups ([Duolingo](https://blog.duolingo.com/product-lessons-friend-streak/)) **[F]**. By Q4 2024 a third of DAUs had one, and 10M+ users held year-long streaks ([Q4 2024 letter](https://www.sec.gov/Archives/edgar/data/1562088/000156208825000039/q4fy24duolingo12-31x24shar.htm)) **[F†]**. In Q2 2026 Duolingo reported 58.7M DAU and record 84% current-user retention, and a streak revival campaign brought back 15.4M learners ([Pulse 2.0](https://pulse2.com/duolingo-daily-active-users-reach-58-7-million-as-retention-hits-record-84-and-social-accounts-top-1-billion-organic-impressions/)) **[P]**.

Forgiveness has research behind it. Among 96 volunteers forming a habit, automaticity took a median of 66 days, and missing one opportunity "did not materially affect" the process ([Lally et al. 2010](https://doi.org/10.1002/ejsp.674)) **[K]**. Wordle shows the cost of strictness. Its streak counts only solved puzzles, so the word CORER ended 5.6M streaks in October 2024, and the 2022 move to nytimes.com reset others ([TODAY via AOL](https://www.aol.com/exclusive-wordle-puzzle-ended-5-013624721.html), [Kotaku](https://kotaku.com/wordle-new-york-times-streaks-broken-nyt-migration-dail-1848525236)) **[P†]**.

*Our read:* count streaks on showing up, never on winning, and protect them automatically.

### 2. Leagues and leaderboards: small, weekly and matched

Duolingo's leagues are small weekly cohorts with promotion and demotion ([Deconstructor of Fun teardown](https://duolingo.deconstructoroffun.com/mechanics/leagues)) **[S]**. Secondary accounts say the design was adapted from FarmVille 2 and credit it with 17% more learning time and triple the learners studying an hour a day, five days a week; all trace to one origin ([Lakhiani](https://marishalakhiani.substack.com/p/breaking-down-duolingos-growth-model)) **[S]**. Ex-CPO Jorge Mazal credits leaderboards and streak work for 4.5x DAU growth over four years ([Lenny's Newsletter](https://lennysnewsletter.com/p/how-duolingo-reignited-user-growth)) **[S†]**. Duolingo says it tuned league XP to reward the lessons that help learning ([Duolingo](https://blog.duolingo.com/time-spent-learning-well)) **[F]**.

Pool size matters. In Garcia and Tor's "N-effect" studies, test takers scored lower in crowded venues, and people told they faced 10 rivals finished a quiz faster than those told they faced 100 ([Garcia & Tor 2009](https://doi.org/10.1111/j.1467-9280.2009.02385.x)) **[K]**. LinkedIn's puzzles, which compare you with your own connections [K], report 84% next-day return ([Social Media Today](https://www.socialmediatoday.com/news/linkedin-adds-zip-puzzle-game/742847/)) **[F†]**. Clues by Sam shows a speed percentile, which works with a modest audience ([Wikipedia](https://en.wikipedia.org/wiki/Clues_By_Sam)) **[S†]**.

*Our read:* friend boards and percentiles first, then matched weekly leagues once they can fill, with no bots.

### 3. Achievements, XP, levels and mastery

Badges steer effort. On Stack Overflow, users stepped up the targeted activity as they neared a badge and eased off after earning it ([Anderson et al. 2013](https://doi.org/10.1145/2488388.2488398)) **[K]**. Progress pulls hardest near the finish: coffee-card customers bought faster as a free drink approached, and a 12-stamp card with two stamps pre-filled was completed faster than a blank 10-stamp card ([Kivetz, Urminsky & Zheng 2006](https://doi.org/10.1509/jmkr.43.1.39)) **[K]**. Mastery doubles as retention: Duolingo's half-life regression model, which schedules reviews just before a learner forgets, raised daily engagement 12% in an operational test ([Settles & Meeder 2016](https://aclanthology.org/P16-1174/)) **[K]**.

*Our read:* XP and badges change behavior, so point them at accurate play on new questions, not grinding.

### 4. Daily challenges, seasons and live ops

Players solved Wordle 4.2B times in 2025 ([NBC/TODAY](https://www.nbcchicago.com/entertainment/entertainment-news/hardest-wordle-connections-games-2025/3868912/)) **[P†]**, and LinkedIn says 80% of its puzzle players are back a week later (link above). Goal pursuit rises after a new week, month, year or birthday, the "fresh start effect" ([Dai, Milkman & Riis 2014](https://doi.org/10.1287/mnsc.2014.1901)) **[K]**, so weekly resets and monthly seasons create landmarks on purpose. Recaps restart sharing: NYT added a "Year in Games" on December 16, 2025 ([Engadget](https://www.engadget.com/gaming/nyt-games-has-a-year-in-review-thing-now-too-203000878.html)) **[P†]**. HQ sold sponsored specials, including a reported $3M Warner Bros. deal ([Marketing Dive](https://www.marketingdive.com/news/hq-trivia-cashes-in-with-new-social-features-dwayne-johnson-appearance/521093/)), yet its single format "ceased to evolve" ([TechCrunch](https://techcrunch.com/2020/02/14/hq-trivia-shuts-down)) **[P†]**. Quiz-specific live-ops data is an open question.

### 5. Notifications and web push in late 2026

Even mature teams get modest gains. Duolingo's KDD 2020 "sleeping, recovering bandit" picks among reminder templates for millions of daily pushes and models how a template loses punch with repetition. Over a strong baseline it lifted DAU 0.5% and new-user retention 2% ([Yancey & Settles 2020](https://research.duolingo.com/papers/yancey.kdd20.pdf), [KDD](https://www.kdd.org/kdd2020/accepted-papers/view/a-sleeping-recovering-bandit-algorithm-for-optimizing-recurring-notificatio.html)) **[P]**.

Browsers punish careless asks:
- **Firefox.** About 99% of prompts went unaccepted and 48% were denied. Firefox 63 showed 1.45B prompts and recorded 23.66M acceptances (about 1.6%), but new users accepted 56% of first-time prompts that followed a user action. Since Firefox 72 (January 2020), a request without a click or keypress is rejected ([Mozilla](https://blog.mozilla.org/futurereleases/2019/11/04/restricting-notification-permission-prompts-in-firefox/), [Mozilla Hacks](https://hacks.mozilla.org/2019/11/upcoming-notification-permission-changes-in-firefox-72/)) **[F]**.
- **Chrome's quiet prompt.** Since Chrome 80 (2020), sites with very low accept rates get a quieter prompt ([Chromium](https://blog.chromium.org/2020/01/introducing-quieter-permission-ui-for.html)), and accept and block rates are public in CrUX ([Chrome](https://developer.chrome.com/blog/notification-permission-data-in-crux/)) **[F]**.
- **Chrome's auto-revocation.** On October 10, 2025 Google began revoking permission for sites with low engagement and high volume, noting that under 1% of notifications get any interaction. Installed web apps are exempt ([Google](https://blog.google/chromium/automatic-notification-permission/)) **[F]**.
- **Safari on iOS.** Web push works only for Home Screen web apps (iOS 16.4+), and the request must follow a tap ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)) **[K]**.

*Our read:* ask in context after a good moment and send one daily reminder at most. Installing as a PWA helps on iOS and Chrome.

### 6. Social loops that spread quiz games

**Shareable results.** Wordle went from 90 players to about 300,000 in two months before NYT bought it ([NPR](https://www.npr.org/2022/01/31/1077089945/nyt-wordle)), and its grid was shared 46 times a second in 2025 ([NBC/TODAY](https://www.nbcchicago.com/entertainment/entertainment-news/hardest-wordle-connections-games-2025/3868912/)) **[P†]**. Against 4.2B solves, that is roughly one share per three solves (our arithmetic; the counts may measure different things). Its creator capped play at one a day, and he said fans liked that it wasn't "trying to do anything shady with your data or your eyeballs" ([NPR](https://www.npr.org/transcripts/1072980440)) **[P†]**.

**Async challenge-a-friend.** Trivia Crack turns take a minute or two while matches run for days, so each open match is a reason to return. It topped the charts without paid ads ([BBC](https://www.bbc.com/news/business-37630981)) and passed 500M downloads by 2018 ([PocketGamer.biz](https://pocketgamer.biz/news/69128/trivia-crack-sequel-launch-original-passes-500m-downloads/)) **[P†]**. NYT's two-player Crossplay (January 2026) pairs friend games with skill-based matchmaking and passed 1M downloads in three weeks ([PocketGamer.biz](https://www.pocketgamer.biz/nyt-games-multiplayer-word-game-crossplay-surpasses-one-million-downloads)) **[P†]**.

**Real-time duels.** QuizUp's live 1v1 ([Wikipedia](https://en.wikipedia.org/wiki/QuizUp)) reached 10M users in four months ([Fortune](https://fortune.com/2014/03/06/how-hit-trivia-app-quizup-survived-the-hype-cycle/)) on a fraction of a $1M acquisition fund ([PocketGamer.biz](https://www.pocketgamer.biz/we-had-a-1-million-ua-launch-fund-but-only-spent-a-fraction-says-plain-vanilla-ceo-of-us-1-hit-quizup/)) **[P†]**. It "never managed to monetise properly," its founder says ([PocketGamer.biz](https://www.pocketgamer.biz/interview/74081/teatime-games-ceo-thor-fridriksson-candid-talk/)), and it sold for a reported $7.5M before closing in 2021 ([ProductMint](https://productmint.com/what-happened-to-quizup/)) **[P/S†]**. Live matching needs enough players online for one topic at one moment, and faking them is now costly: in April 2026 a jury awarded Skillz $420M against Papaya Gaming over bots posing as humans ([PocketGamer.biz](https://www.pocketgamer.biz/papaya-gaming-ordered-to-pay-420m-in-landmark-false-advertising-verdict/)) **[P†]**.

**Host mode.** "To play Kahoot! is to promote Kahoot!" says Kahoot's 2021 investor deck ([deck](https://kahoot.com/files/2021/06/Kahoot_Company_Presentation_2021_06_03.pdf)), and it counts 10B+ cumulative participants ([Kahoot](https://kahoot.com/blog/2023/11/09/kahoot-reaches-10-billion/)) **[F†]**. Jackbox works the same way: one person owns the game and everyone joins from a phone browser at [jackbox.tv](https://jackbox.tv/) **[K]**. Open codes attract abuse, hence Kahoot's friendly-name generator ([Kahoot forum](https://support.kahoot.com/hc/en-us/community/posts/360029558133-Kahoot-Hacks-must-stop)) **[F†]**.

**Referrals.** HQ gave both sides an extra life per referral ([TechCrunch](https://techcrunch.com/2017/12/27/heres-an-easy-trick-to-get-an-extra-life-on-hq-trivia-without-a-referral/)) and grew from 3,300 players to 2.38M concurrent in five months ([TechCrunch](https://techcrunch.com/2018/03/06/hq-trivia-questions/)) **[P†]**. The reward mattered only because cash was at stake.

### 7. K-factor: a multiplier on retention

K is shares (or invites) per player times the fraction of recipients who start playing. Above 1, each cohort recruits a bigger one, and few products sustain that (*our read*, standard definition). The key point is that sharing compounds with retention. Illustrative assumptions, not data: if 20% of daily finishers share to an average of 8 people, that is 1.6 views per finisher. At a 5% play rate one daily yields K = 0.08, and a player finishing 15 dailies a month yields 1.2. Host rooms differ because about 10 people must join to play at all; if one in twenty later hosts, rooms alone return K = 0.5 per room. Measure each loop separately.

### 8. Monetization: what pays and what players tolerate

| Model | Example | Evidence |
|---|---|---|
| Display and interstitial ads | Sporcle is "probably 90% ads" ([interview](https://www.sramanamitra.com/?p=143057)); ads bring Trivia Crack about half its revenue ([AdMob](https://blog.google/products/admob/admob-helps-etermax-crack-global-games/)) | Pays at very large scale; interstitials churn more players than rewarded video ([PocketGamer.biz](https://www.pocketgamer.biz/what-our-data-reveals-about-ad-quality-and-player-churn-in-mobile-games/)) |
| Lives and energy | Trivia Crack: 5 lives for $4.99, endless lives $29.99 (2015) ([ACCM](https://childrenandmedia.org.au/app-reviews/apps/trivia-crack)) | A standing complaint; Duolingo began replacing Hearts with Energy in 2025 ([Q2 2025 letter](https://www.sec.gov/Archives/edgar/data/1562088/000156208825000165/q2fy25duolingo6-30x25share.htm)) |
| Paid app plus packs | Heads Up!: 24M copies at $0.99, extra decks in-app ([Fortune](https://fortune.com/2016/06/03/ellen-degeneres-digital-network/)) | Accepted when money buys more play |
| Subscription | Duolingo: 12.7M subscribers, 58.7M DAU, Q2 2026 ([letter](https://www.sec.gov/Archives/edgar/data/0001562088/000162828026053299/q2fy26duolingo6-30x26share.htm)); NYT keeps Wordle free and sells the bundle ([Axios](https://www.axios.com/new-york-times-earnings-wordle-acquisition-users-0cb11458-5b27-493b-a14b-d0d96eb82f7a.html)) | Works when the free product is loved; HQ Words at $9.99 a month (2019) came as HQ faded ([Business Insider](https://www.businessinsider.nl/hq-trivia-lay-offs-hq-words-subscription-2019-7)) |
| Host and B2B plans | Kahoot's business plans subsidize free teachers ([EdSurge](https://edsurge.com/news/2018-09-21-kahoot-launches-first-ever-premium-version-for-schools)); $149M ARR in Q3 2022 ([Euronext](https://live.euronext.com/en/products/equities/company-news/2022-11-03-kahoot-group-reports-third-quarter-2022-financial-results)) | The organizer pays; players stay free |
| Cosmetics | No quiz-specific data found this session | Fair by design; evidence gap |
| Cash prizes | HQ: about $1M a month in prizes ([Slidebean](https://slidebean.com/story/what-happened-to-hq-trivia-business-model), [S]) | Failed as a business |

Table facts are † (tracks 01 and 02).

**What players say.** Reviewers attacked Trivia Crack's full-page ad after every answer ([WhistleOut](https://www.whistleout.com/CellPhones/Apps/trivia-crack-app-review)) and its "pay to win" mechanics ([TidBITS](https://tidbits.com/2015/01/09/funbits-trivia-crack-simultaneously-attracts-and-repels/)) **[P†]**. Across 21 free-to-play games, ads had a "weak, insignificant effect" on retention next to the game itself ([Ross, AIIDE](https://ojs.aaai.org/index.php/AIIDE/article/download/12906/12754/16423)) **[P†]**.

**What regulators police.** In December 2022 Epic paid $245M in refunds over interface tricks that caused unwanted purchases, plus a $275M COPPA penalty ([FTC](https://www.ftc.gov/news-events/news/press-releases/2022/12/fortnite-video-game-maker-epic-games-pay-more-half-billion-dollars-over-ftc-allegations)) **[K]**. The amended COPPA rule (compliance due April 2026) requires separate parental consent before a child's data feeds targeted ads ([FTC](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa)) **[K]**. Chrome filters every ad on sites that fail the Better Ads Standards, which ban pop-ups, countdown prestitials, autoplay video with sound and, on mobile, ad density above 30% ([Coalition for Better Ads](https://www.betterads.org/standards/)) **[K]**.

### 9. What fits a web-first launch with no budget

Our no-tracker launch rule excludes behavioral ads, and contextual ads earn little until traffic is large (*our read*). The models that fit cost almost nothing. Wordle stayed free and ad-free; NYT bought it three months after it had 90 players and credited it with "tens of millions" of new users ([NPR](https://www.npr.org/2022/01/31/1077089945/nyt-wordle), [Axios](https://www.axios.com/new-york-times-earnings-wordle-acquisition-users-0cb11458-5b27-493b-a14b-d0d96eb82f7a.html)) **[P†]**. Krillion (July 2026) funds itself with a paid archive and an unlimited mode ([The Word Finder](https://www.thewordfinder.com/misc-solvers/krillion-answers/)) **[S†]**. Blooket and Gimkit reportedly grew bootstrapped on freemium teacher plans ([revenuememo](https://www.revenuememo.com/p/who-owns-blooket)) **[S†]**.

## Implications for our product

These assume our Next.js and Supabase web app, launching in late 2026 with guest identity and no trackers.

1. **Streaks count showing up.** Finishing the Daily Quiz at any score extends the streak. Each seven-day run earns a freeze, and players hold at most two. A held freeze spends itself on a missed day. A broken streak can be repaired free within 48 hours by playing the missed daily from the archive. Streak protection is never sold.
2. **Design the first week.** Animate the counter after each completed day and celebrate days 1, 3, 7 and 30. Let new players pick a streak goal of 7, 14, 30 or 50 days, and A/B test the copy like a feature.
3. **Friend streaks, capped at five.** Two players keep a shared streak while both finish the daily; show it on the home screen and share cards.
4. **Competition in stages.** Launch with a daily percentile ("faster than 72% of today's players") plus private boards for friends and groups that reset every Monday. Open weekly leagues of 20 to 30 players, matched by recent activity and time zone, only once every cohort can fill within its first day. No bots. Only server-validated scores count, and league XP tapers after the first few quizzes a day.
5. **XP that rewards good play.** XP comes from correct answers, with a bonus for unseen questions; replaying an aced quiz earns nothing. Levels unlock cosmetics such as card themes and avatar frames, never advantages.
6. **Achievements with visible progress.** About 40 badges at launch, each showing progress ("7 of 10"), with a few earnable in session one. Mix category mastery, streak milestones, deep-cut answers and social firsts. No badges for spending.
7. **Mastery and review.** Bronze, silver, gold and platinum mastery per category, based on accuracy over distinct questions. "Review my misses" resurfaces missed questions after 1, 3, 7 and 21 days.
8. **Seasons and landmarks.** Monthly seasons bring a themed pack and a badge. A late-2026 launch leaves too little history for a December recap, so ship a "Your first month" recap at day 30 and plan the yearly one for December 2027.
9. **Reminders that earn permission.**
   - Never prompt on load. After the first finished daily, show an in-page card ("Want a nudge tomorrow at 7pm?"). Only a tap on it triggers the browser prompt.
   - Send at most one push a day, at the player's chosen time and only if today's daily is unplayed. After four ignored reminders in a row, stop and say so in the app.
   - Rotate about a dozen templates with rest periods. On iOS, offer reminders after Add to Home Screen.
   - Target an accept rate above 50% on the in-context ask, and offer an "Add to calendar" file to people who decline push.
10. **Share card at launch.** A spoiler-free emoji grid plus an Open Graph image, linking friends into the same daily. Target 20% of daily finishers sharing in beta.
11. **Async challenges first.** "Beat my score" links replay the same seeded set. Recipients play without an account, and the challenger sees the result on the next visit. Keep an "open challenges" shelf and a one-tap rematch.
12. **Honest liquidity.** No open real-time matchmaking at launch. Real-time lives in host rooms and code-started friend duels. "Ghost duels" against a real player's recorded run are labeled as replays. Add quick match when peak waits fall under 20 seconds.
13. **Host mode as the growth engine.** Free rooms up to about 20 players, with the friendly-name generator on by default. The end screen offers two buttons: "Play today's Daily" and "Host your own room."
14. **Monetization roadmap.**
    - Launch: free, no ads, no trackers, no purchases. Build entitlement plumbing behind a flag.
    - Once D7 holds at 15%+ for four weeks (track 02's target), launch a "Plus" supporter tier: full daily archive, unlimited practice packs, deeper stats, cosmetic themes, private leagues and bigger rooms. Test prices such as $3.99 a month against $29.99 a year (hypotheses, not benchmarks).
    - Next, host plans for pubs and office events: rooms of 100+, branding, CSV import and reports, sold per host per month or as a one-night pass. Under-13 classrooms wait for legal review.
    - Ads only as a fallback: contextual, outside play, Better Ads compliant, never between questions. Opt-in rewarded video only for non-competitive extras.
15. **Measure the loops.** Share rate per finisher, share-to-first-answer conversion, challenge acceptance, prompt accept rate, push click-through, friend-streak share of DAU, host conversion, and D1, D7, D14 and D30 for players who finish a first quiz.

## Anti-patterns to avoid

- **Streaks that break on a loss** or a migration (Wordle's CORER, its 2022 move).
- **Selling relief from pain we created,** such as paid streak repair or lives that refill for cash.
- **Notification prompts on page load,** or nagging after a player goes quiet. Chrome now revokes permission for exactly that.
- **Guilt-trip reminders borrowed from Duolingo's owl,** which read as nagging without its brand behind them (*our read*).
- **All-time global leaderboards** in a new app, and leagues opened before they can fill.
- **Bots presented as people** (the Papaya verdict).
- **Lives or energy timers, and interstitials between questions** (Trivia Crack reviews, Unity churn data).
- **Referral rewards that only work with cash** (HQ).
- **Purchase flows built to trick** (Epic's FTC settlement).
- **Badge inflation:** hundreds of trivial badges cheapen all of them (*our read*).
- **No monetization hypothesis** (QuizUp, Trivia Royale).

## Open questions

1. What web push opt-in and click rates should we plan for? Vendor benchmarks (OneSignal, Airship) went unsearched.
2. Do async friend challenges measurably lift trivia retention? Only practitioner claims exist (track 02).
3. What do seasons and live events add for quiz games? No primary data found.
4. What do comparable tiers cost today (NYT Games, Sporcle's ad-free tier, Puzzmo, Kahoot's home plans)? Not verified this session.
5. Paid entitlements need a webhook holding a payment-provider secret. Can a Supabase Edge Function hold it within our constraints, and do we need a merchant of record for VAT?
6. Before any virtual currency ships, check the EU consumer authorities' 2025 principles on in-game currencies and the proposed Digital Fairness Act.
7. What does the amended COPPA rule require if teachers run rooms with under-13 players?
8. What cohort size and fill time make leagues feel fair at our scale?
9. How should guest streaks survive a device switch before syncing?

## Sources

- https://lennysnewsletter.com/p/behind-the-product-duolingo-streaks
- https://www.recall.it/summary/lennys-podcast/behind-the-product-duolingo-streaks-or-jackson-shuttleworth-group-pm-retention-team
- https://blog.duolingo.com/how-duolingo-streak-builds-habit
- https://blog.duolingo.com/improving-the-streak
- https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals
- https://econsultancy.com/six-a-b-tests-used-by-duolingo-to-tap-into-habit-forming-behaviour/
- https://blog.duolingo.com/product-lessons-friend-streak/
- https://www.sec.gov/Archives/edgar/data/1562088/000156208825000039/q4fy24duolingo12-31x24shar.htm
- https://pulse2.com/duolingo-daily-active-users-reach-58-7-million-as-retention-hits-record-84-and-social-accounts-top-1-billion-organic-impressions/
- https://doi.org/10.1002/ejsp.674
- https://www.aol.com/exclusive-wordle-puzzle-ended-5-013624721.html
- https://kotaku.com/wordle-new-york-times-streaks-broken-nyt-migration-dail-1848525236
- https://duolingo.deconstructoroffun.com/mechanics/leagues
- https://marishalakhiani.substack.com/p/breaking-down-duolingos-growth-model
- https://lennysnewsletter.com/p/how-duolingo-reignited-user-growth
- https://blog.duolingo.com/time-spent-learning-well
- https://doi.org/10.1111/j.1467-9280.2009.02385.x
- https://www.socialmediatoday.com/news/linkedin-adds-zip-puzzle-game/742847/
- https://en.wikipedia.org/wiki/Clues_By_Sam
- https://doi.org/10.1145/2488388.2488398
- https://doi.org/10.1509/jmkr.43.1.39
- https://aclanthology.org/P16-1174/
- https://www.nbcchicago.com/entertainment/entertainment-news/hardest-wordle-connections-games-2025/3868912/
- https://doi.org/10.1287/mnsc.2014.1901
- https://www.engadget.com/gaming/nyt-games-has-a-year-in-review-thing-now-too-203000878.html
- https://www.marketingdive.com/news/hq-trivia-cashes-in-with-new-social-features-dwayne-johnson-appearance/521093/
- https://techcrunch.com/2020/02/14/hq-trivia-shuts-down
- https://research.duolingo.com/papers/yancey.kdd20.pdf
- https://www.kdd.org/kdd2020/accepted-papers/view/a-sleeping-recovering-bandit-algorithm-for-optimizing-recurring-notificatio.html
- https://blog.mozilla.org/futurereleases/2019/11/04/restricting-notification-permission-prompts-in-firefox/
- https://hacks.mozilla.org/2019/11/upcoming-notification-permission-changes-in-firefox-72/
- https://blog.chromium.org/2020/01/introducing-quieter-permission-ui-for.html
- https://developer.chrome.com/blog/notification-permission-data-in-crux/
- https://blog.google/chromium/automatic-notification-permission/
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://www.npr.org/2022/01/31/1077089945/nyt-wordle
- https://www.npr.org/transcripts/1072980440
- https://www.bbc.com/news/business-37630981
- https://pocketgamer.biz/news/69128/trivia-crack-sequel-launch-original-passes-500m-downloads/
- https://www.pocketgamer.biz/nyt-games-multiplayer-word-game-crossplay-surpasses-one-million-downloads
- https://en.wikipedia.org/wiki/QuizUp
- https://fortune.com/2014/03/06/how-hit-trivia-app-quizup-survived-the-hype-cycle/
- https://www.pocketgamer.biz/we-had-a-1-million-ua-launch-fund-but-only-spent-a-fraction-says-plain-vanilla-ceo-of-us-1-hit-quizup/
- https://www.pocketgamer.biz/interview/74081/teatime-games-ceo-thor-fridriksson-candid-talk/
- https://productmint.com/what-happened-to-quizup/
- https://www.pocketgamer.biz/papaya-gaming-ordered-to-pay-420m-in-landmark-false-advertising-verdict/
- https://kahoot.com/files/2021/06/Kahoot_Company_Presentation_2021_06_03.pdf
- https://kahoot.com/blog/2023/11/09/kahoot-reaches-10-billion/
- https://jackbox.tv/
- https://support.kahoot.com/hc/en-us/community/posts/360029558133-Kahoot-Hacks-must-stop
- https://techcrunch.com/2017/12/27/heres-an-easy-trick-to-get-an-extra-life-on-hq-trivia-without-a-referral/
- https://techcrunch.com/2018/03/06/hq-trivia-questions/
- https://www.sramanamitra.com/?p=143057
- https://blog.google/products/admob/admob-helps-etermax-crack-global-games/
- https://www.pocketgamer.biz/what-our-data-reveals-about-ad-quality-and-player-churn-in-mobile-games/
- https://childrenandmedia.org.au/app-reviews/apps/trivia-crack
- https://www.sec.gov/Archives/edgar/data/1562088/000156208825000165/q2fy25duolingo6-30x25share.htm
- https://fortune.com/2016/06/03/ellen-degeneres-digital-network/
- https://www.sec.gov/Archives/edgar/data/0001562088/000162828026053299/q2fy26duolingo6-30x26share.htm
- https://www.axios.com/new-york-times-earnings-wordle-acquisition-users-0cb11458-5b27-493b-a14b-d0d96eb82f7a.html
- https://www.businessinsider.nl/hq-trivia-lay-offs-hq-words-subscription-2019-7
- https://edsurge.com/news/2018-09-21-kahoot-launches-first-ever-premium-version-for-schools
- https://live.euronext.com/en/products/equities/company-news/2022-11-03-kahoot-group-reports-third-quarter-2022-financial-results
- https://slidebean.com/story/what-happened-to-hq-trivia-business-model
- https://www.whistleout.com/CellPhones/Apps/trivia-crack-app-review
- https://tidbits.com/2015/01/09/funbits-trivia-crack-simultaneously-attracts-and-repels/
- https://ojs.aaai.org/index.php/AIIDE/article/download/12906/12754/16423
- https://www.ftc.gov/news-events/news/press-releases/2022/12/fortnite-video-game-maker-epic-games-pay-more-half-billion-dollars-over-ftc-allegations
- https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa
- https://www.betterads.org/standards/
- https://www.thewordfinder.com/misc-solvers/krillion-answers/
- https://www.revenuememo.com/p/who-owns-blooket
