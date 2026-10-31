# Why Quiz and Trivia Apps Fail: Post-mortems, Benchmarks and Lessons

*Track 02, compiled 2026-10-31 from 57 web searches. Page fetches were blocked here, so figures come from search extracts of the linked pages; spot-check numbers behind big decisions.*

*Confidence:* **[H]** several reputable sources agree. **[M]** one reputable source, or vendor data. **[L]** secondary blog, forum, single unverified source or conflicting reports. *Our read* marks interpretation.

## Summary

- **Cash-prize live trivia failed as a business, and the genre outlived it.** HQ Trivia paid prizes from investor money, peaked at 2.38 million concurrent players in March 2018, lost 92% of installs year over year by mid-2019 and shut in February 2020 when investors walked. Confetti, Cash Show, the Chinese apps and India's Loco all died or pivoted within about two years. The survivor we found, Swagbucks Daily Trivia, pays in loyalty points inside a rewards business.
- **Reach without revenue is a slower death.** QuizUp passed 20 million users in about six months yet sat outside the US top 200 grossing chart at its peak. It raised over $27 million and sold for a reported $7.5 million; Glu closed it in 2021. Its founder's next game, Trivia Royale, got 2.5 million downloads in three weeks and closed within a year.
- **Trust is the product.** Players left after trust failures: a right answer marked wrong, a glitch that eliminated 700,000 players on question one, a prize that never arrived, an opponent who was really a bot.
- **AI has made lookup cheating nearly free.** HQ's former host said in 2026 that "in the age of AI, trivia is unfortunately killed" and launched a word-puzzle show. Real stakes (cash, a global rank) attract cheaters, so our rewards must make cheating pointless before our code makes it hard.
- **Appointment-only play concentrates risk.** Scheduled shows created traffic spikes that broke HQ and ARD's *Quizduell* app, and shut out anyone busy at showtime. Async daily play should carry the product; live rooms sit on top.
- **Content runs out early, and errors cost trust.** Reviewers notice repeats after about two weeks. Trivia Crack's open submissions (a reported million a day) earned it a sloppy reputation. Peer-reviewed studies find more factual errors in AI-written quiz items than in human-written ones.
- **Friction monetization drives the loudest complaints.** Life timers, a full-screen ad after every answer, pay-to-win boosts and paid ad-free passes recur in reviews. Interstitials churn players faster than rewarded video. Fake opponents are now a legal risk: Papaya Gaming lost a $420 million false-advertising verdict over bots in April 2026.
- **Trivia retains well when it works.** Classic genres (trivia, word, board and card) out-retain casual games. Median mobile games keep about 22% of players on day 1, 4% on day 7 and under 1% on day 28; the top quartile hits about 27% on day 1, and the best trivia titles have reached 40-48% D1 and 15-25% D7.
- **Partners drop trivia when their strategy shifts.** Facebook pulled Instant Games from Messenger in 2019 and closed its Gaming app in 2022. Netflix delisted its two trivia titles in 2024. NBC cancelled its QuizUp show in 2016.

## Detailed findings

### 1. HQ Trivia: a hit show with no business underneath (2017 to 2023)

**Scale and money.** HQ peaked at 2.38 million concurrent players on March 28, 2018 ([Wikipedia](https://en.wikipedia.org/wiki/HQ_%28video_game%29), [TechCrunch, 2018](https://techcrunch.com/?p=1691250)). **[H]** Investors funded the jackpots until late March 2018, when sponsors arrived, including a reported $3 million Warner Bros. deal for three films ([TechCrunch, 2018-03-26](https://techcrunch.com/2018/03/26/hq-trivias-first-sponsored-games-roll-out-this-week-from-nike-and-warner-bros), [CNBC, 2018-03-28](https://www.cnbc.com/2018/03/28/hq-trivia-giving-away-250000-prize-and-adding-sponsorships.html)). **[H]** One secondary analysis puts prizes at about $1 million a month against little income ([Slidebean](https://slidebean.com/story/what-happened-to-hq-trivia-business-model)). **[L]** Pots were also "divvied out among sometimes hundreds of winners," and until January 2018 cashing out required a $20 balance ([TechCrunch, 2018-01-26](https://techcrunch.com/2018/01/26/hq-trivia-gets-rid-of-the-20-minimum-to-collect-your-winnings)). **[M]**

**Payouts.** In 2019 a former *Jeopardy!* champion said a $20,000 win sat unpaid for a month, and Kotaku described a $150 winner who quit after months unable to cash out ([Kotaku](https://kotaku.com/hq-trivia-doesnt-always-pay-players-their-winnings-and-1831495451), [PhoneArena](https://www.phonearena.com/news/Former-Jeopardy-champ-claims-that-hes-been-stiffed-by-HQ-Trivia-after-winning-20000_id117410)). HQ said 99% of winners were paid within 48 hours ([TechCrunch, 2019](https://techcrunch.com/?p=1853194)). **[M]**

**Reliability.** In May 2018 a glitch eliminated more than 700,000 of about a million players on an easy first question, forcing a restart ([GamesBeat](https://gamesbeat.com/hq-trivia-sees-multiple-glitches-in-live-contests/), [KMPH](https://kmph.com/news/entertainment/a-major-glitch-during-tuesdays-hq-trivia-game-caused-many-players-to-lose-their-minds)). **[H]** Lag was the top complaint at peak ([MacRumors, 2017-12-17](https://www.macrumors.com/2017/12/17/hq-trivia-mania)), and a #DeleteHQ wave in February 2018 cited players kicked out after correct answers ([Boing Boing](https://boingboing.net/2018/02/02/deletehq-trivia-players-are.html)). **[M]**

**Cheating and community.** Bots that searched Google for answers appeared within months ([HuffPost Canada, 2018-01-24](https://www.huffingtonpost.ca/2018/01/24/hq-trivia-bot-created-by-canadian-developer-crawls-google-for-possible-answers_a_23342535/)). HQ allowed Googling and group play but banned bots ([Daily Beast](https://thedailybeast.com/hq-the-worlds-most-popular-trivia-app-just-got-hacked-by-a-bot), [Money](https://money.com/hq-trivia-bots-cheaters/?amp=true)). A $25,000 game in March 2018 ended with no winner after a finalist tied to a Discord bot group was removed ([Daily Beast](https://thedailybeast.com/drama-on-hq-as-would-be-winner-is-kicked-out-for-cheating), [TouchArcade](https://toucharcade.com/2018/03/05/are-cheaters-and-insiders-winning-the-50000-hq-trivia-grand-prize/)), and bot-driven perfect scores split purses further ([Money](https://money.com/hq-trivia-bots-cheaters/?amp=true)). **[H]** Researchers showed that HQ and two Indian clones exposed question data cheaters could exploit ([HackerNoon, 2018](https://www.hackernoon.com/how-we-hacked-hq-trivia-loco-brainbaazi-and-how-they-can-prevent-it-5e40c97179ec)). **[M]** The live chat was abusive enough that Popular Science urged HQ to fix it or kill it ([Popular Science](https://www.popsci.com/?p=106111)). **[M]**

**Decline and end.** A November 2018 Sunday game drew 580,000 players and midweek games 200,000 to 400,000 ([Business of Business](https://www.businessofbusiness.com/articles/hq-trivia-is-going-into-limbo-decline-continues/)). Installs for January to June 2019 were 827,000 against 10.2 million a year earlier, per Sensor Tower ([PhoneArena](https://www.phonearena.com/news/HQ-Trivia-and-Words-downloads-drop-92-as-it-plans-to-charge-a-monthly-subscription-fee_id117281)), and The Drum put the install base at 67,000 by January 2020 ([The Drum](https://www.thedrum.com/news/hq-trivia-shuts-down-after-3-years)). **[H]** Co-founder Colin Kroll died in December 2018. In April 2019 more than half the staff petitioned to remove CEO Rus Yusupov ([TechCrunch, 2019-04-14](https://techcrunch.com/2019/04/14/trivia-game-of-thrones/embed/)) and host Scott Rogowsky left. July 2019 brought a 20% layoff and a $9.99-a-month HQ Words subscription ([Business Insider](https://www.businessinsider.nl/hq-trivia-lay-offs-hq-words-subscription-2019-7)). HQ shut on February 14, 2020 after an acquisition fell through and investors stopped funding ([TechCrunch](https://techcrunch.com/2020/02/14/hq-trivia-shuts-down), [CNN](https://edition.cnn.com/2020/02/14/media/hq-trivia-shut-down)). **[H]** An unnamed investor revived it on March 29, 2020 ([Axios](https://www.axios.com/2020/03/29/live-trivia-app-hq-comes-back-to-life)). Wikipedia dates the last official game to November 17, 2022 and removal from both stores to August 5, 2023. **[L: single source]**

**Opinions on the cause.** Rogowsky blamed "incompetence, arrogance, short-sightedness and sociopathic delusion" ([Game Rant](https://gamerant.com/hq-trivia-host-scott-rogowsky-blames-apps-death-sociopathic-delusion/)). CNN's 2023 piece on the documentary *Glitch* summarizes his view that HQ never added new games ([CNN](https://www.cnn.com/2023/03/03/tech/hq-trivia-film)). In February 2026 he launched TextSavvy, a word-puzzle show, because "in the age of AI, trivia is unfortunately killed" ([AOL](https://www.aol.com/articles/hq-trivia-catapulted-host-scott-191520139.html), [TechCrunch, 2026-02-20](https://techcrunch.com/2026/02/20/remember-hq-quiz-daddy-scott-rogowsky-is-back-with-textsavvy-a-daily-mobile-game-show/)). **[M]**

*Our read:* HQ had two hooks, a shot at cash and a shared live moment. Splitting shrank the first; lag and cheaters spoiled the second. Nothing else held players: no progression, no async mode, no friend challenges, no user-made content.

### 2. The clone wave went down with it (2018 to 2020)

- **Confetti (Facebook Watch)** was cancelled in the US and UK in October 2019, a year after launch. Engadget said the format had waned since its 2018 peak ([Engadget, 2019-10-15](https://www.engadget.com/2019-10-15-facebooks-confetti-cancelled.html)). **[H]**
- **Cash Show (ZenJoy, Shanghai)** announced its "final show of 2018" ([X](https://x.com/CashShow_Trivia)) and a later roundup lists it as shut down ([Make Tech Easier](https://maketecheasier.com/trivia-mobile-apps/)). **[L]**
- **China** suspended Baidu and Sohu quiz shows in February 2018 over missing livestream permits and "vulgar" questions, and warned quiz shows against promoting "mammonism" ([Caixin](https://www.caixinglobal.com/2018-02-28/baidu-sohu-quizzes-go-back-online-after-crackdown-101215158.html), [Yahoo/Reuters](https://news.yahoo.com/china-tells-online-quiz-shows-not-promote-mammonism-010425386.html)). Cheating was common enough that one app showed different answer options to different users ([SCMP](https://amp.scmp.com/abacus/games/article/3028327/how-people-are-cheating-chinas-live-trivia-games)). SCMP later wrote that quiz apps never made a comeback ([SCMP](https://amp.scmp.com/abacus/culture/article/3028615/how-chinas-tech-scene-shaped-government)). **[M]**
- **India's Loco** launched as live trivia in 2017 and, after a sale to Pocket Aces, became a game-streaming platform in 2020 ([KrASIA](https://kr-asia.com/indian-game-streaming-startup-loco-raises-usd-9-million-from-pubg-creator-krafton-lumikai)). **[M]** We found no current status for BrainBaazi or The Q.
- **Swagbucks Daily Trivia** (formerly SwagIQ) still runs weeknight live games paid in SB points, with an app update in October 2025 ([App Store](https://apps.apple.com/us/app/-/id1325285782), [APKMirror](https://www.apkmirror.com/apk/prodege/swagbucks-trivia-for-money/variant-%7B%22dpis_slug%22:%5B%22nodpi%22%5D%7D), [MoneyPantry](https://moneypantry.com/swagiq-app-review/)). **[M]** *Our read:* a rewards company can book it as an engagement expense.

### 3. QuizUp and Trivia Royale: reach without revenue (2013 to 2021)

QuizUp reportedly hit a million users in eight days ([Fiksu, vendor claim](https://www.globenewswire.com/news-release/2014/03/06/1033751/0/en/Fiksu-Fuels-Massive-Viral-Spread-for-Plain-Vanilla-s-QuizUp-App.html)) and 20 million by May 2014 ([Wikipedia](https://en.wikipedia.org/wiki/QuizUp)), yet sat outside the US top 200 grossing chart ([Gamerboom](https://gamerboom.com/archives/80580), [Pocket Gamer](https://www.pocketgamer.com/articles/056350/r/)). **[M]** It raised over $27 million and in May 2015 relaunched as a social network: "We don't think of QuizUp as a game anymore" ([Business Insider via Yahoo](https://sg.finance.yahoo.com/news/once-red-hot-trivia-app-151100526.html), [SiliconANGLE](https://siliconangle.com/2015/05/21/quizup-trivia-app-relaunches-as-a-social-network/)). **[H]**

TechCrunch traced the failure to founder Thor Fridriksson's aversion to ads, which led to "unscalable" native ad deals and an NBC game show ([TechCrunch, 2020-07-10](https://techcrunch.com/2020/07/10/how-thor-fridrikssons-trivia-royale-earned-2-5m-downloads-in-3-weeks/)). NBC cancelled the show in August 2016 and Plain Vanilla let its staff go; its CEO admitted putting too many eggs in the NBC basket ([Northstack](https://www.northstack.is/pv-wind-down/)). Glu bought it for a reported $7.5 million and kept it in maintenance mode until the March 2021 shutdown ([ProductMint](https://productmint.com/what-happened-to-quizup/)). **[M]** Fridriksson's own verdict: the company "never managed to monetise properly" ([PocketGamer.biz](https://www.pocketgamer.biz/interview/74081/teatime-games-ceo-thor-fridriksson-candid-talk/)). His Trivia Royale drew 2.5 million downloads in three weeks in mid-2020 ([TechCrunch](https://techcrunch.com/2020/07/10/how-thor-fridrikssons-trivia-royale-earned-2-5m-downloads-in-3-weeks/)). His studio closed in February 2021 because revenue was not sufficient and funding talks broke down ([Northstack, 2021-02-23](https://www.northstack.is/teatime-games-to-close/)). **[H]**

### 4. Trivia Crack: the survivor and its standing complaints

Trivia Crack passed 500 million downloads by 2018 ([PocketGamer.biz](https://pocketgamer.biz/news/69128/trivia-crack-sequel-launch-original-passes-500m-downloads/)), earning roughly half its revenue from ads ([Google AdMob](https://blog.google/products/admob/admob-helps-etermax-crack-global-games/)). **[M]** Its async friend loop survives plenty of friction, which is what reviews attack.

- **Content.** About a million submissions a day reportedly let duds through ([Windows Central](https://windowscentral.com/trivia-crack-hit-growing-pains-thanks-flood-user-submitted-questions)). A 2016 reviewer guessed one question in eight had an error ([Pocketables](https://pocketables.com/2016/01/trivia-crack-kingdoms-and-i-dont-care.html)) **[L]**, and Common Sense Media could not tell whether answers were fact-checked ([Common Sense Media](https://www.commonsensemedia.org/app-reviews/trivia-crack-adventure)).
- **Paywalls.** In 2015 lives refilled slowly; 5 extra cost $4.99 and "endless lives" $29.99 ([ACCM](https://childrenandmedia.org.au/app-reviews/apps/trivia-crack)). TidBITS criticized its "pay to win" mechanics ([TidBITS, 2015-01-09](https://tidbits.com/2015/01/09/funbits-trivia-crack-simultaneously-attracts-and-repels/)), and WhistleOut found a full-page ad after every answer ([WhistleOut](https://www.whistleout.com/CellPhones/Apps/trivia-crack-app-review)). **[M]**
- **Today.** A 2025 review analysis still flags intrusive ads, outdated questions, connectivity problems and language settings ([Kimola](https://kimola.com/reports/essential-trivia-crack-user-feedback-analysis-report-app-store-tr-144560)). **[L]**
- **Sequel.** Trivia Crack 2 (2018) is still listed; we found no shutdown.

### 5. Partners, platforms and launch-night outages

- **Facebook** began moving Instant Games out of Messenger in 2019 ([Game Developer](https://www.gamedeveloper.com/business/facebook-migrating-instant-games-away-from-messenger)) and closed its Gaming app on October 28, 2022 ([TechCrunch](https://techcrunch.com/2022/08/30/meta-shutting-down-facebook-gaming-app)). **[H]** No trivia-specific post-mortem turned up.
- **Netflix** delisted Trivia Quest and Triviaverse with most interactive titles on December 1, 2024, saying the technology "is now limiting" ([VGC](https://videogameschronicle.com/news/netflix-is-removing-almost-all-of-its-interactive-specials-this-month), [What's on Netflix](https://www.whats-on-netflix.com/leaving-soon/netflix-removing-all-but-four-interactive-specials-in-december-2024/)). **[H]**
- **ARD's *Quizduell im Ersten*** lost its app server minutes into the May 2014 premiere, with about 180,000 people registered. ARD blamed hackers, then admitted overload ([Horizont](https://www.horizont.net/medien/nachrichten/Quizduell-Server-brachen-wohl-wegen-ueberlastung-zusammen-120559), [Tagesspiegel](https://www.tagesspiegel.de/potsdam/landeshauptstadt/jorg-pilawas-quizduell-besteht-stresstest-nur-knapp-7248847.html)). **[H]**
- **NBC** cancelled the QuizUp show in 2016 (section 3). **[H]**

*Our read:* trivia hosted on a partner's platform or schedule inherits that partner's priorities and its traffic spikes.

### 6. Fake opponents are now a legal risk

Reviewers of one trivia app (Total Trivia) say they learned too late that opponents were bots ([SmartCustomer](https://www.smartcustomer.com/reviews/totaltrivia.com)). **[L]** On April 23, 2026 a New York federal jury found Papaya Gaming liable for false advertising over bots posing as human opponents and awarded Skillz $420 million ([Yogonet](https://www.yogonet.com/international/news/2026/04/28/118799-skillz-wins-420-million-verdict-against-papaya-gaming-for-false-advertising), [PocketGamer.biz](https://www.pocketgamer.biz/papaya-gaming-ordered-to-pay-420m-in-landmark-false-advertising-verdict/)). A July ruling ordered Papaya to pay $719 million, and commentary on it says bots ran in roughly half of Papaya's cash tournaments before it stopped in late 2023 ([Tushnet, 2026-08-10](https://tushnet.com/2026/08/10/false-advertising-in-online-games-leads-to-over-700-million-award-to-competitor/)). Papaya plans to appeal. **[M]**

### 7. Why players quit

Search surfaced no Reddit threads, so this ranking, ordered by frequency, draws on review aggregators, press coverage, consumer review sites and forums:

1. **Ads crowd out play.** Trivia Star reviewers report ads every three questions and "more time watching ads than I do actually playing" ([unitQ](https://unitq.com/unitq-scorecards/triviastar), [Marlvel](https://marlvel.ai/apps/trivia-star-trivia-games-quiz/reviews)). **[L]**
2. **Repeats and stale questions**, noticed after about two weeks ([JustUseApp](https://justuseapp.com/en/app/6444166120/fun-frenzy-trivia-quiz-games/contact)). **[L]**
3. **Wrong or disputed answers**, from Trivia Crack's errors to an HQ answer a columnist called "hugely controversial" ([Star-Advertiser, 2018-01-05](https://www.staradvertiser.com/2018/01/05/news/how-hq-trivia-became-the-best-worst-thing-on-the-internet/)). **[M]**
4. **Unfair eliminations** from lag and glitches (section 1). **[H]**
5. **Bots posing as people** (section 6). **[M]**
6. **Energy timers and pay-to-win** (section 4). **[M]**
7. **Payout friction** in cash games (section 1). **[M]**

### 8. Retention benchmarks and what separates the top quartile

All figures are mobile. GameAnalytics measures day 28; others use day 30.

| Metric | Median mobile game | Top 25% | Best trivia titles (older data) |
|---|---|---|---|
| D1 | 22.9% (Q1 2024); about 22% (2026 report) | 26.5-27.7%; 31-33% on iOS (2025 report) | up to 48% (2018-2019 reports) |
| D7 | 4.2% (Q1 2024); 3.4-3.9% (2025 report) | not found | 15-25%, "reached only by top projects" |
| D28/D30 | 0.85% D28 (Q1 2024); 0.7-0.8% D30 (2026 report) | 75% of all games sit under 3% D28 | 6.5% D28 for top performers, all genres (2018) |

Sources: GameAnalytics [2025 report](https://www.gameanalytics.com/reports/2025-mobile-gaming-benchmarks) with a [summary](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks), [2026 report](https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks), [Q1 2024 benchmarks](https://gameindustrylibrary.com/documents/q1-mobile-games-benchmarks-2024/read), [2018 report](https://tap-nation.io/assets/docs/Mobile_Benchmarks_Industry_Report_2018_GameAnalytics.pdf), [2019 summary](https://wnhub.io/news/analytics/item-2261). **[M]**

- Adjust measured 27% day-1 retention across gaming apps in 2025 ([Adjust, 2026 report](https://a.storyblok.com/f/47007/x/20551740ee/gaming-app-insights-report-2026.pdf)). **[M]**
- GameAnalytics says classic genres, trivia and word included, "consistently outperform" casual and midcore titles (Q1 2024). **[M]**
- In 2019 many studios reportedly killed projects with D1 under 35%. **[M]**
- The 2018 report called D28 of 6% or more "doing just fine." **[M]**

**What separates the top quartile.** A study of 21 free-to-play games found ads had a "weak, insignificant effect" on retention while the game itself "significantly determines" it ([Ross, AIIDE](https://ojs.aaai.org/index.php/AIIDE/article/download/12906/12754/16423)). **[M]** Unity's ad-quality data shows interstitials consistently churn more players than rewarded video, with one ad network hitting 22% day-1 churn on iOS ([PocketGamer.biz](https://www.pocketgamer.biz/what-our-data-reveals-about-ad-quality-and-player-churn-in-mobile-games/)). A Deloitte and AdMob diary study tied disruptive ad features to shorter sessions and more quitting ([Deloitte](https://www.deloitte.com/us/en/industries/tmt/articles/improve-mobile-game-advertising.html)). **[M]** Fridriksson says social features lift retention "by quite a bit," a practitioner opinion ([TechCrunch](https://techcrunch.com/2020/07/10/how-thor-fridrikssons-trivia-royale-earned-2-5m-downloads-in-3-weeks/)). Daily challenges and shareable results get wide credit, but only from vendor or auto-generated analyses. **[L]** Duolingo has reportedly said a lost streak is a common reason users stop returning ([ContentGrip](https://www.contentgrip.com/duolingo-streak-revival-campaign/)). **[L]**

### 9. AI-written questions and AI-assisted cheating

- In a high-stakes medical exam comparison, AI-written multiple-choice items had more factual errors (6% vs 4%) and more duplicates (14% vs 7%) than human-written ones ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11806894/)). A second study rejected 31% of AI-generated items, largely for inaccuracy ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11854382/)). **[M; medical items, not general trivia]**
- Carnegie Mellon researchers found chatbots stay confident even when wrong ([CMU, July 2025](https://www.cmu.edu/news/stories/archives/2025/july/ai-chatbots-remain-confident-even-when-theyre-wrong)). **[M]**
- A March 2026 Vodafone survey claims 43% of pub quizzers admit to cheating, mostly by phone. It was promotional, so treat it loosely ([Vodafone](https://www.vodafone.co.uk/newscentre/press-release/google-pixel-ai-pub-quiz/)). **[L]**
- Kahoot users have long complained about bots flooding game PINs ([Kahoot community](https://support.kahoot.com/hc/en-us/community/posts/360029558133-Kahoot-Hacks-must-stop)). Our creator mode will rely on join codes too. **[M]**

## Implications for our product

These assume a Next.js and Supabase web app launching in late 2026.

1. **No cash, no sweepstakes, no paid entry.** Rewards are status: streaks, badges, friend leaderboards, cosmetic themes. That removes prize burn, payout operations, gambling-law exposure and most of the motive to cheat.
2. **Async first, live optional.** The backbone is a Daily Quiz: the same 10 questions for everyone, reset at local midnight. Each result gets a spoiler-free share card. Solo category runs and challenge-a-friend links work without an account. Live rooms are host-led (parties, classrooms) and start any time, with no broadcast schedule.
3. **Make cheating pointless, then make it hard.**
   - Pointless: no money is at stake. Global boards exist only for the Daily Quiz; everything else defaults to friends or private groups. Say openly that solo play cannot be policed.
   - Hard: correct answers stay on the server until lock-in; scoring uses server timestamps; options shuffle per player; question tokens are single-use; 10 to 20 second timers with speed scoring make lookups costly; implausibly fast perfect runs stay off public boards.
4. **Run content as a product line.**
   - Launch with at least 3,000 verified questions. A player doing the Daily Quiz plus two 10-question runs sees about 900 a month.
   - Track seen questions per player and avoid repeats within 60 days where the pool allows.
   - Every question carries a source URL, a second reviewer, a difficulty rating and a "last verified" date. AI may draft; humans verify every item.
   - No time-sensitive facts ("current", "latest", records, prices) without a re-check schedule.
   - Put "Report a problem" on every answer reveal and auto-pull a question past a report threshold. Restore streaks or points lost to a confirmed bad question.
5. **User-made quizzes are private by default.** Link sharing works at once; public listing needs automated screening plus review or earned creator reputation. Filter slurs in titles, descriptions, questions and answers. No free-text chat at launch; use preset reactions.
6. **Reliability rules for live rooms.**
   - Never penalize a player for our latency. Use grace windows and let players rejoin the same seat; the server owns the clock.
   - Load-test past expected sizes and cap room size. Check the current Supabase free-plan Realtime connection limit before launch.
   - Rate-limit joins per IP, with a challenge step on bursts. Hosts can lock rooms and remove players.
   - When something breaks, say so on screen and void the round.
7. **Monetize without friction, and pick the model before launch.** No lives or energy and no interstitials inside a quiz. Competitive modes get no pay-to-win items. If we need revenue, test a supporter tier (cosmetics, bigger rooms, creator analytics, custom branding) and, at most, opt-in rewarded ads outside competition. QuizUp shows deferring it is fatal too.
8. **No fake humans.** AI or practice opponents carry a visible "bot" label. Never pad lobbies or player counts.
9. **Play before sign-up.** The first question is one tap from landing. Guest progress lives locally and merges on sign-up; prompt to save after the first finished quiz or on day two of a streak. Apple's review rules take the same line ([Apple Developer Forums](https://developer.apple.com/forums/thread/724336)).
10. **Forgiving streaks.** One automatic freeze a week and a clear way to repair a broken streak.
11. **Plan for novelty decay.** Four formats at or soon after launch (multiple choice, true-or-false speed round, higher-or-lower, put-in-order) plus a themed content calendar. HQ's single format and Confetti's one-year run show how fast a format tires.
12. **Targets and kill criteria.** Assuming (unverified) that web retention trails installed apps, treat these as working targets for players who finish a first quiz: D1 35%, D7 15%, D30 6%. If D1 stays under 25% after two onboarding iterations, rework the core loop. Instrument landing, first answer, first finished quiz, first share and next-day return.
13. **Own distribution.** Build on the open web and an installable PWA, with share cards that deep-link into play.

## Anti-patterns to avoid

- Prizes funded by venture money, or cash as the main reason to play (HQ).
- Appointment-only play with nothing to do between shows (HQ, Confetti).
- Eliminating players because of our own lag or bugs (HQ, May 2018).
- Sending correct answers to the client before lock-in (the HQ and Loco exploits).
- Publishing unreviewed user questions to everyone (Trivia Crack).
- Unsourced questions, or "facts" that expire.
- Bots presented as people (Papaya verdict).
- Lives or energy timers on core play, and pay-to-win items in competitive modes (Trivia Crack).
- Interstitials between questions, or ad-free passes sold by the week.
- Open text chat in large public rooms (HQ).
- A sign-up wall before the first question.
- Betting the company on one partner deal (QuizUp and NBC).
- Chasing downloads with no monetization hypothesis (QuizUp, Trivia Royale).
- Global leaderboards with no plausibility checks.
- Answering decline with bigger prizes instead of new formats (an analyst's view of HQ, [ProductMint](https://productmint.com/what-happened-to-hq-trivia/)).

## Open questions

- What retention should a web-only quiz expect? We found no trivia-specific web benchmarks.
- How short can timers get before honest players feel rushed? Playtest it.
- How large must the bank be before repeats get noticed? Measure repeat complaints in beta.
- How often does AI-drafted general trivia contain errors? The studies we found cover medical exam items only.
- What are the current Supabase free-plan Realtime and database limits, and how does a room behave at the limit?
- Do friend challenges measurably lift trivia retention? We found only practitioner claims.
- What happened to HQ from 2020 to 2023, and to smaller clones like BrainBaazi and The Q? Sources are thin.
- Reddit was out of reach through search; a manual pass would sharpen the quit-reason ranking.

## Sources

- https://en.wikipedia.org/wiki/HQ_%28video_game%29
- https://techcrunch.com/?p=1691250
- https://techcrunch.com/2018/03/26/hq-trivias-first-sponsored-games-roll-out-this-week-from-nike-and-warner-bros
- https://www.cnbc.com/2018/03/28/hq-trivia-giving-away-250000-prize-and-adding-sponsorships.html
- https://slidebean.com/story/what-happened-to-hq-trivia-business-model
- https://techcrunch.com/2018/01/26/hq-trivia-gets-rid-of-the-20-minimum-to-collect-your-winnings
- https://kotaku.com/hq-trivia-doesnt-always-pay-players-their-winnings-and-1831495451
- https://www.phonearena.com/news/Former-Jeopardy-champ-claims-that-hes-been-stiffed-by-HQ-Trivia-after-winning-20000_id117410
- https://techcrunch.com/?p=1853194
- https://gamesbeat.com/hq-trivia-sees-multiple-glitches-in-live-contests/
- https://kmph.com/news/entertainment/a-major-glitch-during-tuesdays-hq-trivia-game-caused-many-players-to-lose-their-minds
- https://www.macrumors.com/2017/12/17/hq-trivia-mania
- https://boingboing.net/2018/02/02/deletehq-trivia-players-are.html
- https://www.huffingtonpost.ca/2018/01/24/hq-trivia-bot-created-by-canadian-developer-crawls-google-for-possible-answers_a_23342535/
- https://thedailybeast.com/hq-the-worlds-most-popular-trivia-app-just-got-hacked-by-a-bot
- https://thedailybeast.com/drama-on-hq-as-would-be-winner-is-kicked-out-for-cheating
- https://money.com/hq-trivia-bots-cheaters/?amp=true
- https://toucharcade.com/2018/03/05/are-cheaters-and-insiders-winning-the-50000-hq-trivia-grand-prize/
- https://www.hackernoon.com/how-we-hacked-hq-trivia-loco-brainbaazi-and-how-they-can-prevent-it-5e40c97179ec
- https://www.popsci.com/?p=106111
- https://www.businessofbusiness.com/articles/hq-trivia-is-going-into-limbo-decline-continues/
- https://www.phonearena.com/news/HQ-Trivia-and-Words-downloads-drop-92-as-it-plans-to-charge-a-monthly-subscription-fee_id117281
- https://www.thedrum.com/news/hq-trivia-shuts-down-after-3-years
- https://techcrunch.com/2019/04/14/trivia-game-of-thrones/embed/
- https://www.businessinsider.nl/hq-trivia-lay-offs-hq-words-subscription-2019-7
- https://techcrunch.com/2020/02/14/hq-trivia-shuts-down
- https://edition.cnn.com/2020/02/14/media/hq-trivia-shut-down
- https://www.axios.com/2020/03/29/live-trivia-app-hq-comes-back-to-life
- https://gamerant.com/hq-trivia-host-scott-rogowsky-blames-apps-death-sociopathic-delusion/
- https://www.cnn.com/2023/03/03/tech/hq-trivia-film
- https://www.aol.com/articles/hq-trivia-catapulted-host-scott-191520139.html
- https://techcrunch.com/2026/02/20/remember-hq-quiz-daddy-scott-rogowsky-is-back-with-textsavvy-a-daily-mobile-game-show/
- https://www.staradvertiser.com/2018/01/05/news/how-hq-trivia-became-the-best-worst-thing-on-the-internet/
- https://productmint.com/what-happened-to-hq-trivia/
- https://www.engadget.com/2019-10-15-facebooks-confetti-cancelled.html
- https://x.com/CashShow_Trivia
- https://maketecheasier.com/trivia-mobile-apps/
- https://www.caixinglobal.com/2018-02-28/baidu-sohu-quizzes-go-back-online-after-crackdown-101215158.html
- https://news.yahoo.com/china-tells-online-quiz-shows-not-promote-mammonism-010425386.html
- https://amp.scmp.com/abacus/games/article/3028327/how-people-are-cheating-chinas-live-trivia-games
- https://amp.scmp.com/abacus/culture/article/3028615/how-chinas-tech-scene-shaped-government
- https://kr-asia.com/indian-game-streaming-startup-loco-raises-usd-9-million-from-pubg-creator-krafton-lumikai
- https://apps.apple.com/us/app/-/id1325285782
- https://www.apkmirror.com/apk/prodege/swagbucks-trivia-for-money/variant-%7B%22dpis_slug%22:%5B%22nodpi%22%5D%7D
- https://moneypantry.com/swagiq-app-review/
- https://www.globenewswire.com/news-release/2014/03/06/1033751/0/en/Fiksu-Fuels-Massive-Viral-Spread-for-Plain-Vanilla-s-QuizUp-App.html
- https://en.wikipedia.org/wiki/QuizUp
- https://gamerboom.com/archives/80580
- https://www.pocketgamer.com/articles/056350/r/
- https://sg.finance.yahoo.com/news/once-red-hot-trivia-app-151100526.html
- https://siliconangle.com/2015/05/21/quizup-trivia-app-relaunches-as-a-social-network/
- https://techcrunch.com/2020/07/10/how-thor-fridrikssons-trivia-royale-earned-2-5m-downloads-in-3-weeks/
- https://www.northstack.is/pv-wind-down/
- https://productmint.com/what-happened-to-quizup/
- https://www.pocketgamer.biz/interview/74081/teatime-games-ceo-thor-fridriksson-candid-talk/
- https://www.northstack.is/teatime-games-to-close/
- https://pocketgamer.biz/news/69128/trivia-crack-sequel-launch-original-passes-500m-downloads/
- https://blog.google/products/admob/admob-helps-etermax-crack-global-games/
- https://windowscentral.com/trivia-crack-hit-growing-pains-thanks-flood-user-submitted-questions
- https://pocketables.com/2016/01/trivia-crack-kingdoms-and-i-dont-care.html
- https://www.commonsensemedia.org/app-reviews/trivia-crack-adventure
- https://childrenandmedia.org.au/app-reviews/apps/trivia-crack
- https://tidbits.com/2015/01/09/funbits-trivia-crack-simultaneously-attracts-and-repels/
- https://www.whistleout.com/CellPhones/Apps/trivia-crack-app-review
- https://kimola.com/reports/essential-trivia-crack-user-feedback-analysis-report-app-store-tr-144560
- https://www.gamedeveloper.com/business/facebook-migrating-instant-games-away-from-messenger
- https://techcrunch.com/2022/08/30/meta-shutting-down-facebook-gaming-app
- https://videogameschronicle.com/news/netflix-is-removing-almost-all-of-its-interactive-specials-this-month
- https://www.whats-on-netflix.com/leaving-soon/netflix-removing-all-but-four-interactive-specials-in-december-2024/
- https://www.horizont.net/medien/nachrichten/Quizduell-Server-brachen-wohl-wegen-ueberlastung-zusammen-120559
- https://www.tagesspiegel.de/potsdam/landeshauptstadt/jorg-pilawas-quizduell-besteht-stresstest-nur-knapp-7248847.html
- https://www.smartcustomer.com/reviews/totaltrivia.com
- https://www.yogonet.com/international/news/2026/04/28/118799-skillz-wins-420-million-verdict-against-papaya-gaming-for-false-advertising
- https://www.pocketgamer.biz/papaya-gaming-ordered-to-pay-420m-in-landmark-false-advertising-verdict/
- https://tushnet.com/2026/08/10/false-advertising-in-online-games-leads-to-over-700-million-award-to-competitor/
- https://unitq.com/unitq-scorecards/triviastar
- https://marlvel.ai/apps/trivia-star-trivia-games-quiz/reviews
- https://justuseapp.com/en/app/6444166120/fun-frenzy-trivia-quiz-games/contact
- https://www.gameanalytics.com/reports/2025-mobile-gaming-benchmarks
- https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks
- https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks
- https://gameindustrylibrary.com/documents/q1-mobile-games-benchmarks-2024/read
- https://tap-nation.io/assets/docs/Mobile_Benchmarks_Industry_Report_2018_GameAnalytics.pdf
- https://wnhub.io/news/analytics/item-2261
- https://a.storyblok.com/f/47007/x/20551740ee/gaming-app-insights-report-2026.pdf
- https://ojs.aaai.org/index.php/AIIDE/article/download/12906/12754/16423
- https://www.pocketgamer.biz/what-our-data-reveals-about-ad-quality-and-player-churn-in-mobile-games/
- https://www.deloitte.com/us/en/industries/tmt/articles/improve-mobile-game-advertising.html
- https://www.contentgrip.com/duolingo-streak-revival-campaign/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11806894/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11854382/
- https://www.cmu.edu/news/stories/archives/2025/july/ai-chatbots-remain-confident-even-when-theyre-wrong
- https://www.vodafone.co.uk/newscentre/press-release/google-pixel-ai-pub-quiz/
- https://support.kahoot.com/hc/en-us/community/posts/360029558133-Kahoot-Hacks-must-stop
- https://developer.apple.com/forums/thread/724336
