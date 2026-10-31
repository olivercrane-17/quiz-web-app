# Research synthesis: what we build, and why

*Head of product research, 31 October 2026, revised the same day after the product director's review and three follow-up gap reports. Built from the eight reports in this folder, which cite 468 unique URLs between them, and the gap reports, which add 64 more. This is the document our teams build from. Appendix A lists every place the reports disagreed and what we chose, and the revision notes at the end list what this revision changed.*

**Reading the citations.** Reports are cited by number: (01) is [01-market-leaders.md](./01-market-leaders.md), (02) [02-failure-postmortems.md](./02-failure-postmortems.md), (03) [03-fun-psychology.md](./03-fun-psychology.md), (04) [04-retention-monetization.md](./04-retention-monetization.md), (05) [05-ux-ui-best-practices.md](./05-ux-ui-best-practices.md), (06) [06-how-studios-build.md](./06-how-studios-build.md), (07) [07-content-excellence.md](./07-content-excellence.md) and (08) [08-technical-best-practices.md](./08-technical-best-practices.md). The follow-ups are (gap 1) [gap-1-daily-format-and-competitors.md](./gap-1-daily-format-and-competitors.md), (gap 2) [gap-2-web-retention-and-identity.md](./gap-2-web-retention-and-identity.md) and (gap 3) [gap-3-difficulty-before-players.md](./gap-3-difficulty-before-players.md). Original sources are linked inline. **[K]** marks background knowledge a track could not re-verify. **[S]** marks a secondary or low-confidence source.

**How much of this was checked.** Less than the citation count suggests. The shared search budget ran out early. Track 04 stopped after 11 searches; tracks 05 to 08 and all three gap tracks ran none. Page fetches failed for 02 and 06, and 07 lists reference hosts outside our network allowlist. So many of the 468 URLs in reports 01 to 08 were cited from search extracts, earlier reports or memory, and never opened. Gaps 2 and 3 read primary sources through git and npm where they could, such as WebKit's source code and a detector's test fixtures. Treat [K] and [S] items as leads. The five below drive decisions that are hard to undo, so each has an owner and a deadline.

| Unverified claim | What it drives | Where it stands | Owner | Deadline |
|---|---|---|---|---|
| WebKit clears script-written storage after seven days without a visit, and `navigator.storage.persist()` may exempt a site (08 [K]) | When we offer the sync code; the install pitch | Gap 2 read WebKit's source: since the Safari 18 line, most sites get 30 days of browser use without a tap, and 7 only after a tracker's link decoration. `persist()` resolves true only for Home Screen apps. Medium-high confidence, with no device test yet | Platform pod, on the owner's iPhone | Before the closed beta's sync-code and install copy is final |
| Where Vercel Hobby draws the line on commercial use (08 [K]) | When we move to Vercel Pro | Unread, because vercel.com is outside the allowlist | The owner reads the terms; Platform acts on them | Before the public beta, and before any payment or ad flag |
| What the EU Digital Services Act, the UK Online Safety Act and the UK Children's Code require of us (06 [K], 03) | Sharing user quizzes, the age floor and streak nudges | Needs legal review | The owner, through counsel | Before any user quiz can be shared, and before the public beta |
| HQ paid out about $1M a month in prizes ([Slidebean](https://slidebean.com/story/what-happened-to-hq-trivia-business-model)) [S] | Section 1's account of HQ | One secondary source | Research | Before any launch copy or pitch repeats it |
| No large ten-question multiple-choice daily exists, and the breakouts share paths or brag numbers (gap 1, many cells [K]) | The Daily's format | Gap 1's verification queue (traffic, subreddit sizes, search trends, exact share texts) is still open | Research | Before the PRD locks the Daily's format |

---

## 1. Executive summary

**The question.** What makes a quiz game fun enough to come back to every day, and what killed the ones that failed?

**What the evidence says.** The winners look alike. Play starts in seconds, with no install and no account: a PIN for Kahoot, a link for Wordle. Everyone gets the same small puzzle, so there is something to talk about, and the result can be shared without spoiling it. Wordle's grid was shared about 46 times a second in 2025 ([NBC/TODAY](https://www.nbcchicago.com/entertainment/entertainment-news/hardest-wordle-connections-games-2025/3868912/)). Habits form around streaks that forgive and around small groups of people you know. The daily breakouts closest to trivia ask players to recall or estimate rather than pick from four, and every attempt tells the player something (gap 1).

The famous failures died of economics and broken trust. HQ Trivia paid out roughly $1M a month in prizes, by one secondary estimate ([Slidebean](https://slidebean.com/story/what-happened-to-hq-trivia-business-model)) [S], and its new downloads fell 92% year over year in the first half of 2019 ([PhoneArena](https://www.phonearena.com/news/HQ-Trivia-and-Words-downloads-drop-92-as-it-plans-to-charge-a-monthly-subscription-fee_id117281)). QuizUp passed 20M users and, in its founder's words, "never managed to monetise properly" ([PocketGamer.biz](https://www.pocketgamer.biz/interview/74081/teatime-games-ceo-thor-fridriksson-candid-talk/)). Players quit over wrong answers, lag that eliminated them, ads after every question and opponents who turned out to be bots (02).

**What we will build.** A web-first daily trivia game you can play in one tap.

- **The Daily.** One short quiz a day, fact-checked and the same for everyone. It ends with a percentile ("you beat 64% of players so far today") and a spoiler-free result to share, then a clear "You're done for today." Its format is provisional. A greybox bake-off chooses between today's ten-question design and three clue-ladder variants closer to the breakouts (6.1).
- **Practice** by category that works offline, with a one-line "why" after every answer.
- **Challenge links** that let a friend play the same sealed set with no account.
- **Groups:** a private board for the Daily, joined by a link from the group chat.
- **Later, behind a "Beta" label once each passes its own gates:** host mode for parties and video calls (a big screen plus phones joining by code), and a quiz editor with bulk import, so anyone can write a quiz and host it.

**Why we can win in late 2026.** HQ's former host said in February 2026 that "in the age of AI, trivia is unfortunately killed" ([TechCrunch](https://techcrunch.com/2026/02/20/remember-hq-quiz-daddy-scott-rogowsky-is-back-with-textsavvy-a-daily-mobile-game-show/)). Report 02 files that under lookups: AI made cheating nearly free. Our design answers the lookup threat head on. Nothing is at stake, so a looked-up answer wins nothing. Strangers appear as a percentile, never as a rank to climb. The Daily ends on an estimation encore written so that no single search returns the number (07, gap 1), and we tell players plainly that solo play runs on the honor system. Immaculate Grid thrives under the stats company whose own sites hold every answer, a hint that lookups matter less when nothing rides on them (gap 1).

Trust in the content is a separate argument, and a weaker one. Wrong answers and repeats rank high among report 02's quit reasons, but that ranking rests on low- and medium-confidence sources, so checked content is retention hygiene, not proven demand. What should win players is play that starts in one tap and a result worth posting to the group chat, inside a game that respects them: no ads in play, nothing to buy to keep playing, no guilt-trip reminders and a natural end to every session.

**Five bets.**
1. The Daily is the front door, and it is never for sale.
2. Quality before volume. We ship fewer questions before we ship a wrong one.
3. Streaks reward showing up and forgive by default, without becoming a 48-hour window.
4. Social means small: percentiles for the crowd, names only among friends and groups.
5. The solo loop carries the launch. Rooms and the editor follow, small and labelled Beta, once they pass their own gates.

**What we won't build in v1.** Cash prizes, lives or energy, ads, leaderboards of strangers, open chat, a public gallery of user quizzes, AI quiz generation, web push and real-time matchmaking. Each one either hurt a competitor or waits on something we don't have yet: a large player base, a legal review, an Edge Function secret path proven in CI, or an installed audience to push to.

**How we'll know.** Among players whose first finished Daily happened in a system browser or the installed app (the clean cohort), we hypothesize 30% back on day 1, 12% on day 7 and 5% on day 30, plus 70% next-day continuation among players who finished yesterday (gap 2). D1 of 30% sits near the mobile top quartile, and nobody has published a web baseline, so all of these are hypotheses, not benchmarks. We also target 20% of Daily finishers completing a share, a number of our own. The old "rework the core loop" kill line stays on hold until a web baseline exists (10.2).

---

## 2. Success factors, ranked by strength of evidence

**Grades.** **A**: controlled experiments (peer-reviewed, or company A/B tests on real players) that agree with product evidence. **B**: consistent evidence across several products, large company-reported numbers, or lab experiments that no product test has confirmed. **C**: single cases, anecdotes, practitioner opinion or early studies.

The order shows how sure we are, not how much a factor matters. The Daily ranks fifth because no experiment isolates it. It is still our biggest bet, since nearly every breakout of the past five years is built on it.

**1. Streaks that count showing up, and forgive. Grade A.**
- *Evidence:* In Duolingo's published A/B tests, letting learners equip two Streak Freezes instead of one raised daily actives 0.38% without causing more days off, and separating the streak from the daily goal raised day-14 retention 3.3% ([Duolingo](https://blog.duolingo.com/improving-the-streak), [Duolingo](https://blog.duolingo.com/how-duolingo-streak-builds-habit)). Across seven studies, Silverman and Barasch found that showing people a broken streak cut later engagement, and the drop was smaller when the streak could be repaired ([CU Boulder](https://www.colorado.edu/business/news/2023/04/20/research-streaks-marketing-tech-barasch)). Missing one day "did not materially affect" habit formation in Lally's study ([DOI](https://doi.org/10.1002/ejsp.674)) [K]. Strictness costs: Wordle's CORER ended 5.6M streaks in October 2024 ([TODAY via AOL](https://www.aol.com/exclusive-wordle-puzzle-ended-5-013624721.html)). Duolingo's streak lead adds that streaks only work inside an app people already enjoy ([Lenny's Podcast](https://lennysnewsletter.com/p/behind-the-product-duolingo-streaks)) [S].
- *Transfer risk:* Duolingo's lifts come from an app with a learning goal. Report 03 asks whether daily streaks help a trivia game that has none, or turn play into a chore, and proposes comparing daily-streak and weekly-goal cohorts on retention and regret.
- *Reports:* [04-retention-monetization.md](./04-retention-monetization.md), [03-fun-psychology.md](./03-fun-psychology.md), [01-market-leaders.md](./01-market-leaders.md).
- *We will:* extend the streak on any finished Daily at any score, earn freezes through play, allow one free repair a week, and never sell protection.

**2. Competence and autonomy, not points and prizes. Grade A.**
- *Evidence:* In four studies by Ryan and colleagues, felt autonomy and competence predicted enjoyment and future play ([paper](https://www.rochester.edu/warner/lida/wp-content/uploads/2022/11/02bfe513dd59366750000000.pdf)). In Mekler and colleagues' experiment, points raised output and levels and leaderboards raised it more, yet none changed felt competence or intrinsic motivation ([paper](https://glassmanlab.seas.harvard.edu/annotated_works/mekler17.pdf)). A 128-study meta-analysis found tangible rewards undermine intrinsic motivation, a result others dispute ([Deci and colleagues](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf)). A 2023 study found that matching difficulty to skill changed how balanced a game felt, not how people played ([ACM](https://unpaywall.org/10.1145%2F3611065)).
- *Not part of the A: the success-rate band.* Training near 85% accuracy learns fastest in models of simple right-or-wrong tasks, and the lead author warns against stretching the result ([Wilson et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579)). Report 03 lists the best band for trivia played for fun as an open question and proposes testing 60, 70, 80 and 90%. Our 75 to 85% for casual modes is a starting value, graded C.
- *Reports:* [03-fun-psychology.md](./03-fun-psychology.md), [04-retention-monetization.md](./04-retention-monetization.md).
- *We will:* reward knowledge with status, never cash or login coins. Let players pick harder content openly, with mastery shown per category. Start casual modes near 75 to 85% predicted success and test the band in beta.

**3. Feedback that explains. Grade A for learning; the link to fun is our inference.**
- *Evidence:* A meta-analysis of computer-based feedback found that explanations (effect about 0.49) beat showing the correct answer (0.32), which beat right/wrong alone (0.05) ([Van der Kleij et al.](https://doi.org/10.3102/0034654314564881)) [K]. Testing beat restudying at two days and at a week ([Roediger and Karpicke](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf)). Failed attempts helped when the answer followed ([Kornell and colleagues](https://pubmed.ncbi.nlm.nih.gov/19586265/)), and confident errors are the ones people correct most ([Learning Scientists](https://learningscientists.org/blog/2023/8/3-1)). Interest needs novelty plus the sense that you can make sense of it ([Silvia and Kashdan](https://mason.gmu.edu/~tkashdan/publications/silvia%20kashdan%20compass%202009.pdf)).
- *Reports:* [03-fun-psychology.md](./03-fun-psychology.md), [05-ux-ui-best-practices.md](./05-ux-ui-best-practices.md), [07-content-excellence.md](./07-content-excellence.md).
- *We will:* ship a "why" line of 35 words or fewer, with a source, on every question. The player decides when to move on, and misses come back later for review.

**4. Curiosity gaps: questions you can almost answer. Grade B.**
- *Evidence:* In Kang and colleagues' fMRI study, curiosity about trivia questions tracked reward-anticipation activity, and curious people spent scarce tokens to see answers. They also remembered surprising answers better one to two weeks later ([PubMed](https://pubmed.ncbi.nlm.nih.gov/19619181/)). Curiosity even improved memory for unrelated material shown during the wait ([Gruber and colleagues](https://pmc.ncbi.nlm.nih.gov/articles/PMC4252494/)). Making a prediction before seeing the outcome improved learning, and measurable surprise appeared only after a prediction ([Brod and colleagues](https://www.fachportal-paedagogik.de/literatur/vollanzeige.html?FId=A34255)). Curiosity needs some prior knowledge, and closeable gaps work best ([Loewenstein](https://stafforini.com/works/loewenstein-1994-psychology-curiosity-review/)).
- *Why B:* every one of these is a lab study, Kang's with 19 people, and no product test isolates the effect. This revision moves it down from A.
- *Reports:* [03-fun-psychology.md](./03-fun-psychology.md), [07-content-excellence.md](./07-content-excellence.md).
- *We will:* require a foothold for a smart guess in every question. Crowd stats appear only after the player commits.

**5. A shared daily with a hard cap. Grade B.**
- *Evidence:* Wordle grew from 90 players to about 300,000 in two months with no account and one puzzle a day, and its creator had capped an unlimited prototype ([NPR](https://www.npr.org/2022/01/31/1077089945/nyt-wordle), [Wikipedia](https://en.wikipedia.org/wiki/Josh_Wardle)). NYT players solved 11.2B puzzles in 2025 ([NBC/TODAY](https://www.nbcchicago.com/entertainment/entertainment-news/hardest-wordle-connections-games-2025/3868912/)), and a solo-made logic daily, Clues by Sam, passed 50,000 daily players ([Wikipedia](https://en.wikipedia.org/wiki/Clues_By_Sam)) [S]. None of reports 01 to 08 surveyed direct competitors. Gap 1 did, from earlier transcripts while search was down. The daily trivia slot is contested: Krillion scores typed answers by rarity, Netflix Star: Daily Trivia runs on TV, Immaculate Grid rewards rare sports answers and Bracket City nests clues ([The Word Finder](https://www.thewordfinder.com/misc-solvers/krillion-answers/), [What's on Netflix](https://www.whats-on-netflix.com/news/netflix-games/netflix-star-daily-trivia-game-released/), [Wikipedia](https://en.wikipedia.org/wiki/Immaculate_Grid), [Nieman Lab](https://www.niemanlab.org/2025/06/wordle-who-the-atlantic-launches-a-suite-of-new-daily-puzzles-and-games/)). The geography, film, music and photo dailies (Worldle, Globle, Framed, Heardle, TimeGuessr) let each miss narrow the answer, or score how far off it was [K]. No ten-question multiple-choice daily with a large organic audience turned up, which gap 1 reads as a strong hint, not proof. LinkedIn's 84% next-day return ([Social Media Today](https://www.socialmediatoday.com/news/linkedin-adds-zip-puzzle-game/742847/)) is no benchmark here: it counts people already in the habit, on a platform they open daily anyway (gap 2). None of this separates the format from brand and distribution, hence B.
- *Reports:* [01-market-leaders.md](./01-market-leaders.md), [03-fun-psychology.md](./03-fun-psychology.md), [04-retention-monetization.md](./04-retention-monetization.md), [gap-1-daily-format-and-competitors.md](./gap-1-daily-format-and-competitors.md).
- *We will:* make one Daily, the same for everyone, the front door of the product. Its format stays provisional until the bake-off in 6.1.

**6. Sharing built into the result. Grade B.**
- *Evidence:* Wordle's grid drew about 46 shares a second in 2025 ([NBC/TODAY](https://www.nbcchicago.com/entertainment/entertainment-news/hardest-wordle-connections-games-2025/3868912/)). Set against 4.2B solves that is roughly one share per three solves, but report 04 warns the two counts "may measure different things", so treat it as rough arithmetic from a cultural outlier. Trivia Crack topped the charts without paid ads ([BBC](https://www.bbc.com/news/business-37630981)), and QuizUp spent only a fraction of a $1M acquisition fund ([PocketGamer.biz](https://www.pocketgamer.biz/we-had-a-1-million-ua-launch-fund-but-only-spent-a-fraction-says-plain-vanilla-ceo-of-us-1-hit-quizup/)). HQ's referral lives took it from 3,300 players to 2.38M concurrent in five months, though that worked because cash was at stake ([TechCrunch](https://techcrunch.com/2018/03/06/hq-trivia-questions/)). Kahoot's investor deck puts it simply: "To play Kahoot! is to promote Kahoot!" ([deck](https://kahoot.com/files/2021/06/Kahoot_Company_Presentation_2021_06_03.pdf)). The closest breakouts share a path or a brag number rather than a bare score, such as Framed's row of squares or TimeGuessr's points out of 50,000 (gap 1) [K].
- *Reports:* [01-market-leaders.md](./01-market-leaders.md), [04-retention-monetization.md](./04-retention-monetization.md), [gap-1-daily-format-and-competitors.md](./gap-1-daily-format-and-competitors.md).
- *We will:* ship a text-first share result and a preview image per result on day one, with path-only links that open straight into play. A share counts when the share sheet completes or the copy succeeds, never on the button tap.

**7. One tap to play. Grade B.**
- *Evidence:* Every breakout in report 01 starts in seconds: a PIN, a link, a friend's pending turn or a phone held to your forehead. Kahoot counts 10B+ cumulative participants ([Kahoot](https://kahoot.com/blog/2023/11/09/kahoot-reaches-10-billion/)). Duolingo teaches a lesson before it asks for a profile ([UserOnboard](https://www.useronboard.com/how-duolingo-onboards-new-users/)) [K], following Wroblewski's "gradual engagement" ([A List Apart](https://alistapart.com/article/signupforms/)) [K]. NN/g finds that people skip or forget tutorial carousels ([NN/g](https://www.nngroup.com/articles/mobile-app-onboarding/)) [K].
- *Reports:* [01-market-leaders.md](./01-market-leaders.md), [02-failure-postmortems.md](./02-failure-postmortems.md), [05-ux-ui-best-practices.md](./05-ux-ui-best-practices.md).
- *We will:* put question one a single tap from any landing page, with no install, account, name or tutorial first, in whatever browser the link opened.

**8. Comparison inside small groups. Grade B.**
- *Evidence:* People who believed they faced 10 competitors finished a quiz faster than those told they faced 100 ([Garcia and Tor](https://public.websites.umich.edu/~smgarcia/pubs/n-effect.pdf)). Low leaderboard ranks can sap motivation ([Jia et al.](https://scholarworks.iupui.edu/bitstream/1805/17645/1/Jia_2018_designing.pdf)). A third of Duolingo's daily actives hold a Friend Streak ([Q4 2024 letter](https://www.sec.gov/Archives/edgar/data/1562088/000156208825000039/q4fy24duolingo12-31x24shar.htm)), and learners with one are 22% more likely to finish their daily lesson, a correlation ([Duolingo](https://blog.duolingo.com/product-lessons-friend-streak/)). LinkedIn's games compare players with their own connections (04) [K]. Weekly leagues reportedly lifted learning time 17% ([Lenny's Newsletter](https://lennysnewsletter.com/p/how-duolingo-reignited-user-growth)) [S]. This is the strongest social retention evidence in the reports, and none of it needs realtime.
- *Reports:* [03-fun-psychology.md](./03-fun-psychology.md), [04-retention-monetization.md](./04-retention-monetization.md).
- *We will:* show strangers as a percentile, and put names on a board only inside groups players chose to join. Groups ship at launch, and Friend streaks come first in 1.1.

**9. Timers the player controls. Grade B.**
- *Evidence:* A review of 93 Kahoot studies found time pressure and the struggle to catch up after a miss among the recurring complaints ([Wang and Tahir](https://research.gold.ac.uk/id/eprint/39435)). In one survey more than a quarter of students felt anxious about the time limit, and speed scoring tempted them to trade accuracy for points ([iJEP](https://online-journals.org/index.php/i-jep/article/download/21359/9529/75849)). Kahoot opened Accuracy mode to all users in May 2025 ([Kahoot](https://kahoot.com/blog/2025/05/06/teacher-takeover-accuracy-mode/)). WCAG 2.2.1 (Level A) requires a way to switch off or lengthen time limits outside real-time events, and W3C ranks switching them off as the most helpful option ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)).
- *Reports:* [03-fun-psychology.md](./03-fun-psychology.md), [05-ux-ui-best-practices.md](./05-ux-ui-best-practices.md).
- *We will:* keep countdowns for live rooms, always with an "Off: host advances" setting, and for modes players opt into. Everywhere else, an optional stopwatch measures time and never times anyone out.

**10. Endings people remember. Grade B.**
- *Evidence:* An experience's peak and its end explained 94% of the variance in Fredrickson and Kahneman's ratings ([paper](https://bear.warrington.ufl.edu/brenner/mar7588/Papers/fredr-kahneman-jpsp1993.pdf)), and a 2022 meta-analysis of 174 effect sizes backs the rule ([meta-analysis](https://ideas.repec.org/a/eee/jobhdp/v170y2022ics0749597822000334.html)). Cliffhangers buy nothing: a 2025 meta-analysis found no memory advantage for unfinished tasks ([Ghibellini and Meier](https://ideas.repec.org/a/pal/palcom/v12y2025i1d10.1057_s41599-025-05000-w.html)). The rule is solid; applying it to a results screen is our inference.
- *Reports:* [03-fun-psychology.md](./03-fun-psychology.md), [05-ux-ui-best-practices.md](./05-ux-ui-best-practices.md).
- *We will:* build the Daily toward a peak near the end and an encore last. Results open on the player's best moment and close on "You're done for today."

**11. A free core with paid edges, and no friction. Grade B.**
- *Evidence:* Across 21 free-to-play games, ads had a "weak, insignificant effect" on retention while the game itself "significantly determines" it ([Ross, AIIDE](https://ojs.aaai.org/index.php/AIIDE/article/download/12906/12754/16423)). Unity's data shows interstitials churn more players than rewarded video ([PocketGamer.biz](https://www.pocketgamer.biz/what-our-data-reveals-about-ad-quality-and-player-churn-in-mobile-games/)). Reviews attacked Trivia Crack's full-page ad after every answer and its pay-to-win items ([WhistleOut](https://www.whistleout.com/CellPhones/Apps/trivia-crack-app-review), [TidBITS](https://tidbits.com/2015/01/09/funbits-trivia-crack-simultaneously-attracts-and-repels/)), and Duolingo began replacing Hearts in 2025 ([Q2 2025 letter](https://www.sec.gov/Archives/edgar/data/1562088/000156208825000165/q2fy25duolingo6-30x25share.htm)). What pays is the organizer (Kahoot's business plans subsidize free teachers, with $149M ARR in Q3 2022, [Euronext](https://live.euronext.com/en/products/equities/company-news/2022-11-03-kahoot-group-reports-third-quarter-2022-financial-results)) or a bundle around a free flagship (NYT kept Wordle free, [Axios](https://www.axios.com/new-york-times-earnings-wordle-acquisition-users-0cb11458-5b27-493b-a14b-d0d96eb82f7a.html)). Waiting forever is fatal too: QuizUp "never managed to monetise properly" ([PocketGamer.biz](https://www.pocketgamer.biz/interview/74081/teatime-games-ceo-thor-fridriksson-candid-talk/)).
- *Reports:* [01-market-leaders.md](./01-market-leaders.md), [02-failure-postmortems.md](./02-failure-postmortems.md), [04-retention-monetization.md](./04-retention-monetization.md).
- *We will:* launch free, with no ads and no purchases, but with the paid model already chosen, a metric that switches it on and a date by which we decide regardless (decision 11).

**12. Fairness enforced by the server, and honest opponents. Grade B.**
- *Evidence:* HQ drew answer bots that searched Google within months, and researchers showed its question data reaching cheaters ([HuffPost](https://www.huffingtonpost.ca/2018/01/24/hq-trivia-bot-created-by-canadian-developer-crawls-google-for-possible-answers_a_23342535/), [HackerNoon](https://www.hackernoon.com/how-we-hacked-hq-trivia-loco-brainbaazi-and-how-they-can-prevent-it-5e40c97179ec)). A Blooket cheat script lists 12,000+ installs ([Greasy Fork](https://greasyfork.org/ru/scripts/463382-blooket-hacks/code)), and a public library auto-answered Kahoot games until 2021 ([GitHub](https://github.com/theusaf/kahoot.js-updated)). Faking opponents is now very expensive: in April 2026 a jury found Papaya Gaming liable for $420M over bots posing as human players ([PocketGamer.biz](https://www.pocketgamer.biz/papaya-gaming-ordered-to-pay-420m-in-landmark-false-advertising-verdict/)).
- *Reports:* [01-market-leaders.md](./01-market-leaders.md), [02-failure-postmortems.md](./02-failure-postmortems.md), [06-how-studios-build.md](./06-how-studios-build.md), [08-technical-best-practices.md](./08-technical-best-practices.md).
- *We will:* keep ranked answers on the server until lock-in and score from server time. Any opponent that isn't a live human wears a label. Solo play can't be policed, and we say so, as report 02 advises.

**13. Reliability, so our failures never cost a player. Grade B.**
- *Evidence:* In May 2018 a glitch eliminated more than 700,000 of about a million HQ players on question one ([GamesBeat](https://gamesbeat.com/hq-trivia-sees-multiple-glitches-in-live-contests/)); lag was the top complaint at its peak, and #DeleteHQ followed ([Boing Boing](https://boingboing.net/2018/02/02/deletehq-trivia-players-are.html)). ARD's Quizduell app server failed minutes into its TV premiere ([Horizont](https://www.horizont.net/medien/nachrichten/Quizduell-Server-brachen-wohl-wegen-ueberlastung-zusammen-120559)). Trivia Crack's turn-based matches shrug off flaky networks and still earned about $40K a week on US iOS in 2024 ([Sensor Tower](https://sensortower.com/blog/2024-q2-ios-top-5-trivia%20games-revenue-us-604118ed241bc16eb8b8453a)). Our own ceiling is low: Supabase Free allows 200 realtime connections and 100 messages a second ([Supabase](https://supabase.com/docs/guides/realtime/limits)), and its backups can't be downloaded ([Supabase](https://supabase.com/docs/guides/platform/backups)).
- *Reports:* [02-failure-postmortems.md](./02-failure-postmortems.md), [06-how-studios-build.md](./06-how-studios-build.md), [08-technical-best-practices.md](./08-technical-best-practices.md).
- *We will:* carry the product on async play and keep live rooms small and host-paced, behind their own gate. When our systems break a question, we void it. A tested nightly backup stands behind every streak.

**14. Content people can trust. Grade B: thin on retention data, high on stakes.**
- *Evidence:* Wrong or disputed answers and repeats sit near the top of the quit reasons in report 02, drawn from review aggregators and rated medium and low confidence; reviewers notice repeats after about two weeks ([JustUseApp](https://justuseapp.com/en/app/6444166120/fun-frenzy-trivia-quiz-games/contact)). Trivia Crack published roughly 1 in 200 submissions and still earned an error-prone reputation ([Windows Central](https://windowscentral.com/trivia-crack-hit-growing-pains-thanks-flood-user-submitted-questions)). AI-written exam items carried more factual errors (6% against 4%) and more duplicates (14% against 7%) than human-written ones ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11806894/)), and a second study rejected 31% of AI items ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11854382/)). Both studies used medical exam items; nobody has measured error rates for AI-drafted general trivia (02). NYT gives Connections a single editor, who has edited every board ([Wikipedia](https://en.wikipedia.org/wiki/The_New_York_Times_Connections)).
- *Reports:* [02-failure-postmortems.md](./02-failure-postmortems.md), [07-content-excellence.md](./07-content-excellence.md), [01-market-leaders.md](./01-market-leaders.md), [06-how-studios-build.md](./06-how-studios-build.md).
- *We will:* treat the question bank as the product: two sources per item, one of them primary, a stored quoted passage behind every key, a checker who isn't the writer, and audits seeded with planted errors. When we get one wrong, we say so and fix the scores.

**15. Group play with a way back for weaker players. Grade C.**
- *Evidence:* Blooket's Gold Quest chests (gold, multipliers, steals, swaps or nothing) and Gimkit's in-game economy stop the fastest readers from always winning ([Blooket](https://help.blooket.com/hc/en-us/articles/42100784373655-Game-Overview-Gold-Quest), [Common Sense Education](https://www.commonsense.org/education/reviews/gimkit)). Quizlet Live's random teams reportedly reached about 10% of Quizlet traffic within a year ([Shipping on Fridays](https://shippingonfridays.substack.com/p/hitting-the-hackathon-jackpot-how)) [S]. Hidden catch-up backfires: racing developers report that visible rubber-banding feels like cheating ([MCV](https://www.mcvuk.com/development-news/black-rock-studio-blasts-arubber-bandinga/)) [S]. No study isolates the comeback mechanic itself.
- *Reports:* [01-market-leaders.md](./01-market-leaders.md), [03-fun-psychology.md](./03-fun-psychology.md).
- *We will:* keep room scoring transparent (a capped speed bonus, a streak bonus, a doubled final question and a visible gap to the next player) and add an opt-in Chaos mode after launch.

**16. Variety over a single format. Grade C.**
- *Evidence:* HQ "ceased to evolve" ([TechCrunch](https://techcrunch.com/2020/02/14/hq-trivia-shuts-down)), and Facebook's Confetti was cancelled a year after launch as the format waned ([Engadget](https://www.engadget.com/2019-10-15-facebooks-confetti-cancelled.html)). NYT keeps adding games and landmarks, from Connections (born in a game jam) to a yearly recap ([Engadget](https://www.engadget.com/gaming/nyt-games-has-a-year-in-review-thing-now-too-203000878.html)).
- *Reports:* [02-failure-postmortems.md](./02-failure-postmortems.md), [01-market-leaders.md](./01-market-leaders.md), [04-retention-monetization.md](./04-retention-monetization.md).
- *We will:* launch with four question formats and a content calendar, and ship something new every month.

---

## 3. Failure modes, and exactly how we avoid each

| Failure mode | Who it hurt | Exactly how we avoid it |
|---|---|---|
| Cash as the reason to play | HQ's prize bill, about $1M a month [S]; the 2018 clone wave was dead within two years (02) | No cash, sweepstakes, paid entry or login coins. Rewards are status: streaks, badges, percentiles and cosmetics. |
| Reach with no revenue plan | QuizUp: 20M users, outside the US top-200 grossing chart, sold for a reported $7.5M; Trivia Royale closed within a year (02) | The model is chosen before launch (a Plus supporter tier, then host plans). Plus switches on when clean D7 holds at its 12% target for four weeks, and pricing is decided by week 8 after real players arrive whatever D7 shows (decision 11). |
| Appointment-only play | HQ and Confetti had nothing to do between shows; Quizduell's server died at its premiere (02) | Async first, and rooms start whenever a host wants. No scheduled broadcast shows in v1. |
| Our lag eliminates players | HQ, May 2018: 700,000+ out on question one (02) | No elimination formats. The server owns the clock with a 500 ms grace, and players rejoin their own seat. On our error, the question is voided with a notice on screen. |
| Leaked answers and cheat bots | HQ and Loco question data, Blooket and Kahoot scripts (01, 02, 06) | The Daily pool is sealed and served one question at a time. Answers arrive only after lock-in, options shuffle per attempt, submissions are idempotent and joins are rate-limited. Challenge links replay sealed sets only. |
| Fake humans | Papaya Gaming's $420M verdict; Total Trivia reviews (02) | We never pad lobbies or player counts. Ghost replays and practice bots carry a visible label. |
| Wrong or disputed answers | Trivia Crack's error reputation; HQ's "hugely controversial" answer (02) | Two independent sources (one primary) with the supporting passage stored, and a checker who isn't the writer. Test-solves for ambiguity and wrong keys, audits seeded with planted errors, a myths list, "Report a problem" on every reveal, and void-and-rescore once a re-check confirms we were wrong. |
| Stale facts and repeats | Astana renamed twice in three years (07); repeats noticed after about two weeks (02) | Volatility classes with review-by dates; nothing "current" at launch. Seen-tracking with a 60-day no-repeat rule in practice where the pool allows, and no Daily item repeated within a year. |
| Unvetted user content | A racist submitted question went viral although Trivia Crack never approved it (01) | User quizzes stay private until legal review clears sharing. Then they travel only by unlisted link, challenge or room, with a self-declared 18+ to publish, text only, a slur filter on every field and import, a report and complaints flow, and no public gallery in v1. |
| Toxic chat and names | HQ's abusive live chat; rude names in open Kahoot PINs (01, 02) | No free-text chat. Rooms use generated friendly names by default, and hosts can remove or rename any player and lock the room. Group nicknames pass the slur filter and show to members only. |
| Friction monetization | Trivia Crack's paid lives and an ad after every answer (02, 04) | No lives or energy, no interstitials, no pay-to-win and no paid streak protection, ever. |
| Broken streaks | Wordle's CORER and its 2022 migration (01, 04) | Streaks count finishing, not winning, and are stored server-side with migration tests. Our outages protect everyone's streak automatically, and a tested nightly backup with a restore drill makes that promise real. |
| One format that tires | HQ's single show; Confetti's one-year run (02) | Four formats at launch, then something new every month, whether a themed pack or a new mode. |
| Dependence on a partner | QuizUp's NBC deal; Facebook Instant Games; Netflix's 2024 delisting (02) | We own distribution on the open web. No exclusive platform deals. |
| A sign-up wall | Every breakout in report 01 lets people play first; Apple's review rules take the same line (01, 02) | Play first, in any browser, in-app ones included. A sync code is offered only once there's something to lose: after the third finished Daily, or at the first finish inside an in-app browser (gap 2). |
| "AI-first" messaging and AI errors | Duolingo's 2025 backlash (01); AI item error studies on medical exams (02) | AI may draft; every item is accepted only on stored quoted sources, checked by a separate checker (section 7.6). We never market the product as AI. |
| Notification spam | Firefox: about 99% of prompts unaccepted; Chrome auto-revokes ignored sites since October 2025 (04) | No push in v1, and never a prompt on page load. Players who want a nudge can add a calendar reminder after their first finished Daily. |
| Dark patterns and guilt | FTC v. Epic, $245M in refunds; the EU Digital Fairness Act proposal due late 2026 (03) | No guilt copy, no manufactured near-misses, no loot boxes or paid randomness, a natural stop after the Daily, and healthy-engagement metrics beside retention. |
| Empty leaderboards | New apps with boards nobody fills; as report 01 puts it, "an empty leaderboard is worse than none" (01, 04) | No leagues until every cohort fills within its first day; percentiles appear only once 50 players have finished. |
| Free-tier cliffs | Supabase Free pauses after a quiet week, goes read-only at 500 MB and offers no downloadable backups (06, 08) | Compact storage, CDN-served packs, stateless share pages, usage alerts, written upgrade triggers and an encrypted nightly dump with a restore drill (section 9). |

---

## 4. Product principles

Each principle is a rule we can check. When two of them conflict, the lower number wins.

1. **One tap to the first question.** No install, account, name or tutorial stands between a visitor and question one.
   *Test:* from any landing page, question one renders after a single tap; p75 time from landing to question one is under 3 s on a mid-range Android phone over 4G.
2. **The Daily is never for sale.** Today's quiz stays free and ad-free for everyone, forever.
   *Test:* the Daily's code path contains no entitlement or ad checks; a brand-new guest can finish it every day.
3. **Every question is a puzzle, and every answer teaches.** A player with partial knowledge can reason toward the answer, and the reveal adds a fact worth reading.
   *Test:* 100% of published items pass the rubric in section 7.5 and carry an explanation of 35 words or fewer plus two sources; every misconception item's explanation links its source; no reveal auto-advances unless the player switched that on.
4. **We would rather ship fewer questions than a wrong one.**
   *Test:* under 1% of practice items carry a confirmed error, bounded first by the error-seeded audit and then by reports; zero confirmed key errors in scheduled Dailies; the median Daily item is voided or fixed within 12 hours of its first report; zero items published on one source or on the writer's own check; every key rests on a stored quoted passage; a confirmed error is fixed and every affected score updated.
5. **Show up and your streak survives.** Streaks count finishing, not winning. Protection is earned and applies itself. Repair is free but limited, and nothing that protects a streak is ever sold.
   *Test:* a missed day with a held freeze never breaks a streak; a broken streak can be repaired free within 48 hours, once per rolling 7 days; no product or price touches streaks; our outages never cost anyone a streak, and a restore drill has shown we can bring streaks back from backup.
6. **Compete with people you chose.** Strangers appear as a percentile. Names appear only among friends and groups.
   *Test:* no screen ranks a player by name against people they haven't joined; the Daily shows a percentile and a score distribution.
7. **Fair where the server can enforce it.** The server decides every ranked score from its own clock and records, answers never reach the client before lock-in, no bot poses as a person, and our failures void the round instead of the player. Solo play can't be policed, so we say so, and we keep suspect runs out of the crowd's numbers without punishing anyone.
   *Test:* automated tests assert that ranked payloads hold no answer key before lock-in; any server error in a room voids that question; runs carrying honest-play flags never enter percentile or crowd-stat calculations; no code path bans or labels a player on a flag.
8. **Respect the player's time.** Sessions end on purpose. That rules out autoplay, guilt, fake urgency and more than one reminder a day.
   *Test:* the Daily ends on a stop screen; at least 80% of sessions end on a stop or results screen; the median Daily takes under 5 minutes; under 10% of surveyed players say they played longer than they meant to.
9. **Everyone can play.** We target WCAG 2.2 AA, impose no hard time limits outside live rooms and opt-in modes, never signal by color alone, and make motion optional.
   *Test:* before launch, zero serious or critical axe findings on every route, and Playwright accessibility-tree snapshots and keyboard-only E2E pass for every Must mode, under forced-colors and reduced-motion emulation, at a 320 px viewport and with text at 200%. Before 1.0, real VoiceOver and TalkBack users finish every Must mode in the beta.
10. **Built for the open web.** Fast on a mid-range phone, playable offline for practice, reachable by links that open straight into play, and free of third-party trackers.
    *Test:* p75 LCP under 2.0 s, INP under 200 ms, CLS under 0.05 and question one on screen within 3 s; the home route ships 150 KB of gzipped JavaScript or less; E2E tests pass in Chromium, WebKit and Firefox and see zero third-party requests.

---

## 5. Target audience, positioning and differentiation

### 5.1 Who it's for

**Primary: daily-ritual players.** Adults, roughly 18 to 45, who already play a daily puzzle (Wordle, Connections, LinkedIn's games) and trade results in group chats. They play on phones in three-to-five-minute gaps, and they often open our link inside WhatsApp or Instagram rather than a browser (gap 2). Casual players want calm games that are easy to learn, according to Quantic Foundry's survey of 350,000+ gamers ([Quantic Foundry](https://quanticfoundry.com/2018/08/01/casual-hardcore/)) [S] (03). They speak English, though not all of it American, so the Daily has to be fair to a player in Manchester, Mumbai, Toronto or Melbourne (07). Groups are built for them: a private board for the chat where they already post results.

**Secondary: hosts.** Someone running a quiz for friends, family, an office social, a club night or a video call. They want every guest on their own phone with no install, and a big-screen view running our packs or their own questions within minutes. We used to say Kahoot proved that players become hosts. That was report 01 reading a deck slogan ("To play Kahoot! is to promote Kahoot!"), and Kahoot, Blooket and Gimkit spread teacher to teacher in schools (01). The adult host loop is unproven, so rooms are a gated second pillar, not the growth engine. We aim at adult and mixed-age groups, not schools.

**Tertiary: trivia buffs.** Hardcore players stand apart on competition and challenge (03). They get the hard end of practice, per-category stats, mastery tiers and the closest-number tiebreak. A weekly rarity-scored "Deep Cut" arrives once 500 players finish each Daily (gap 1), Confidence mode after launch, and leagues once they can fill.

**Not in v1:** children under 13 and K-12 classrooms, because COPPA and school-privacy duties need legal review first (01, 04). Teenagers from 13 to 17 may play, which brings in the UK Children's Code (decision 5). Study and exam prep, where AI tools such as Gizmo (13M+ learners) and NotebookLM already lead (01). Prize hunters. And anyone looking for a social network: QuizUp's 2015 relaunch as one ("We don't think of QuizUp as a game anymore") came before its decline (02).

### 5.2 Positioning

> For people who love a daily puzzle and the group chat that comes with it, [working name] is daily trivia that starts in one tap, with no app and no account, and ends in a result worth sending. Unlike trivia apps built on ads and lives, or quiz tools built for classrooms, it never interrupts play to sell you something, and every answer comes with a sourced "why".

**Four messaging pillars, in this order.**
- **Instant:** "One tap. No app, no account."
- **Together:** "Challenge a friend. Compare with your group."
- **Respect:** "No ads in play, and nothing to buy to keep playing."
- **Trust:** "Every answer checked against two sources, with the why."

Trust stays in the set but moves to the back. The evidence that trust drives choice is quit reasons rated low and medium confidence (02, section 7), which makes it a hygiene factor rather than proven demand. It moves up only if a beta test shows trust copy lifting conversion from landing to first answer.

### 5.3 Differentiation

| Alternative | What it does well | Where it leaves room | Our answer |
|---|---|---|---|
| Trivia Crack and other mobile trivia apps | Async friend duels at huge scale (500M+ downloads by 2018) | Reviews complain about ads after answers and paid lives, and about outdated or disputed questions (02) | No ads in play, no lives, checked questions, nothing to install |
| Sporcle | A vast typed-answer library that doubles as search traffic | About 90% ad-funded; a library to browse, not a shared daily (01) | A daily ritual with mobile-first game feel and no ads |
| Krillion, Immaculate Grid | Typed answers scored by rarity, and a result that brags about it (01, gap 1) | Rarity needs a crowd or editor guesses to score, and one missing valid answer marks a right player wrong. Krillion also holds off lookups with a 25-second clock (gap 1) | Clue ladders with suggestions from closed answer lists, no countdown, and rarity saved for a weekly Deep Cut once the crowd exists (6.1) |
| Bracket City, and guessing dailies such as Worldle, Globle, Framed and Heardle | One small object a day, where each miss narrows the answer (gap 1) [K] | Word play, or one narrow subject per game | A trivia daily across ten categories, with a sourced explanation behind every answer; its format is under test (6.1) |
| NYT Games, LinkedIn Games | The daily habit at scale (11.2B NYT solves in 2025) | Their flagship dailies are word and logic puzzles; NYT's bundle is paid, and LinkedIn's games live inside LinkedIn (01) | A trivia daily on the open web, with its format chosen by test rather than assumption |
| Netflix Star: Daily Trivia (August 2026) | Daily trivia for a huge audience | Played with a TV remote inside a subscription, in a format nobody has confirmed (01, gap 1) | Open to anyone on any phone, shared with a link |
| Kahoot, Blooket, Gimkit | The standard for hosted play (10B+ Kahoot participants) | Built for schools and business first; open PINs attract bots and rude names (01) | Built for parties and office socials once rooms pass their gates: no account for hosts or players, and friendly names by default |
| Jackbox | Party play from phone browsers | Paid packs, and a host device running the game [K] (04) | Free, and any browser can host your own questions |
| AI quiz tools (Gizmo, NotebookLM, Kahoot's generator) | A quiz about anything, instantly | Study tools; AI-written items carried more errors in medical exam studies, and nobody has measured general trivia (01, 02) | A game with people to play with, and every item accepted only on cited sources |

### 5.4 Why late 2026, and why the web

- **The daily habit is mainstream.** NYT logged 11.2B solves in 2025 (01), and a solo-made logic daily, Clues by Sam, passed 50,000 daily players ([Wikipedia](https://en.wikipedia.org/wiki/Clues_By_Sam)) [S].
- **The trivia daily slot is contested, mostly by formats unlike the ones we are testing.** Krillion, Netflix Star, Immaculate Grid and Bracket City hold it, and no ten-question multiple-choice daily with a large organic audience turned up (gap 1). The breakouts share four traits: one small shared object, recall or estimation that narrows with each attempt, a low floor with a high ceiling, and a share that shows a path or a brag number. Those traits are the brief for the bake-off in 6.1.
- **AI made lookups instant, so the design has to make them pointless.** No stakes, a percentile rather than a rank, an estimation encore and plain honest-play disclosure answer the threat report 02 names. Checked content then helps keep the players we win.
- **The web caught up.** iOS installs web apps and allows push for Home Screen apps from 16.4 ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)) [K]. Same-document View Transitions now run in every major browser, Firefox included from version 144 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)), and field vitals report from Safari and Firefox (08).
- **Regulators are moving against dark patterns** (FTC v. Epic; the EU Digital Fairness Act proposal due in Q4 2026) (03). Designing ethically now puts us ahead of the rules.

| What the web gives us | What it costs us | Our answer |
|---|---|---|
| Links that open straight into play | No home-screen icon by default | An install pitch after the third finished Daily, never inside an in-app browser; an installable PWA |
| Group-chat links that reach people instantly | Many open inside in-app browsers (WhatsApp, Instagram, TikTok, Snapchat and others) whose storage is separate from Safari's or Chrome's, so one player can end up with two guest ids and a split streak (gap 2) | Detect the container, then offer a one-time claim link and the sync code at the first finished Daily there, with an "open in your browser to keep your streak" hint |
| Pages that search engines index | Weak reminders: iOS push needs an install, and Chrome revokes ignored permissions (04) | A calendar reminder in v1; push only for installed players, later |
| Any screen can be the host display | Safari deletes script-written storage after about 30 days of browser use without a tap for most sites, or 7 after a tracker's decorated link, and `persist()` does nothing in a tab (gap 2, read from WebKit's source; device test pending) | Server-mirrored streaks, a server-set backup cookie, the sync code after the third finished Daily, and `persist()` only in the installed app |
| No app-store review queue or revenue share [K] | No vibration API in Safari (05) | Haptics stay optional extras |

Guest ids also churn when players switch devices or browsers, so measured web day-N retention reads low: one returning person can count as two new players (10.2).

---

## 6. Recommended v1 feature set (MoSCoW, plus a gate)

**Must:** blocks launch. Only the solo core and Groups block launch: the Daily, its archive and repair, practice, sharing, challenge links, streaks, guest identity, accessibility and Groups, plus the platform pieces those can't ship without (the content bank, reporting, legal pages, analytics and backups). **Gated:** host rooms and the quiz editor. Each must pass its own gates (10.4); it then ships behind a "Beta" label or moves to 1.1, and it never holds the Daily. **Should:** planned for v1, cut only to protect a Must's quality, first in line for 1.1. **Could:** v1.x if the core is solid. **Won't (v1):** deliberately excluded, with reasons in 6.10.

Why the gate: rooms run on database broadcast, which is still in public beta, over public topics anyone who learns one can join (08), and the editor carries user-content duties (06). Studios find the fun before they write the spec (06), and scope sprawl was already one of our Medium/High risks. So neither rooms nor the editor goes past greybox until a playtested greybox of the Daily loop exists.

Numbers in this section and in section 8, such as the 700/300 room scoring, the 0.25 s per word read beat, 56 px answer buttons and 30 achievements, are starting values to tune in playtests, as reports 03 and 05 say of their own figures.

### 6.1 Game modes

| Feature | Priority | Spec | Evidence |
|---|---|---|---|
| The Daily | Must | One quiz per date, the same for everyone, unlocking at local midnight. One ranked run with no account needed, and answers stay sealed on the server. It ends on a stop screen with a percentile labelled "so far today", a "how everyone did" chart, a crowd stat per question shown after the player commits, and a review of misses. Format, shape and scoring follow the bake-off below; every arm ends on the closest-number encore and ranks on points, then the encore's error, then time | 01 (Wordle, LinkedIn), 03, 04, gap 1 |
| Daily archive, last 7 days | Must | Unranked replays, served sealed; the free route for streak repair | 03, 04 |
| Quick Play and category practice | Must | Ten-question multiple-choice runs, mixed or from one of ten categories; no clock by default; offline after first load; seen-tracking avoids repeats. Offline, it is labelled clearly as practice, not today's Daily | constraints, 02, 03 |
| Difficulty choice | Should | Players pick easier or harder runs openly, never adjusted behind their backs | 03 |
| Review my misses | Should | Missed questions return after 1, 3, 7 and 21 days | 03, 04, 06 |
| Adaptive practice | Should | Client-side ratings pick items near a target success rate (starting value 75 to 85%), and 10% of serves go to the least-sampled items (7.10) | 03, 06, gap 3 |
| Blitz | Could | Opt-in 10 s countdown with speed points, for the competitive lane | 03 |
| Survival | Could | Three strikes and the run ends; strikes are never sold | 05 |
| Confidence mode | Could | Certainty-based marking (100/0, 200/-200, 300/-600), untimed, with a calibration chart | 03 |
| Deep Cut | Could | A weekly rarity-scored type-in round, once 500 players finish each Daily; rarity seeded from editor estimates until traffic arrives | 01 (Immaculate Grid, Krillion), gap 1 |

**The Daily's format is provisional.** The old plan locked ten multiple-choice questions and called "a daily built for trivia" open space. Two things undercut that. The nearest daily breakouts report 01 cites, Immaculate Grid and Krillion, score typed answers by rarity, and their results show something distinctive rather than "8/10". And none of reports 01 to 08 surveyed direct competitors: daily quiz sites and the geography, film, music and photo guessing dailies (Worldle, Globle, Framed, Heardle, TimeGuessr) appear in none of them. Gap 1 has since surveyed them from earlier transcripts, with search down. It found the slot contested, no large ten-question multiple-choice daily, and breakouts that ask players to recall or estimate, return information on every attempt and share a path or a brag number. Its verification queue is still open, so this is a strong hint, not proof.

So before the PRD locks a format, we run a greybox bake-off. The three variants the product director asked for are arms A to C, and gap 1's recommendation joins as arm D.

| Arm | Shape | Sealed items a day | A year | 120 Dailies | Checks a day | The share shows | Main risk |
|---|---|---|---|---|---|---|---|
| A. Current design (control) | Nine standard questions, mostly multiple choice, plus the closest-number encore | 10 | 3,650 | 1,200 | About 40 | "8/10 in 1:42" | A score with no story, and the heaviest load |
| B. Short set plus a signature | Five multiple-choice questions, one clue-ladder signature question, then the encore | 7 | 2,555 | 840 | About 29 | The score, plus the ladder's row of squares | Two mechanics to learn in three minutes |
| C. Single puzzle | One mystery with four clues, then the encore | 2 | 730 | 240 | About 9 | One row of squares and the encore's error | One unfamiliar category decides the day, and few distinct scores exist |
| D. Three mysteries (gap 1's pick) | Three mysteries of four clues each, easiest first, then the encore; 4, 3, 2 or 1 points by the clue that solved it, out of 12 | 4 | 1,460 | 480 | About 25 | A row per mystery, the score out of 12 and the encore's error | Typing on phones, and a format new players must learn |

Checks a day count every fact, wrong option, uniqueness check and number a checker must verify (gap 1). Sealed items include the encore.

- **How a ladder works.** Clues run from hardest to easiest, as in quiz bowl (03). The player types a guess and picks from suggestions drawn from a closed list for the answer type (countries, people, films, elements), sourced from Wikidata (CC0), in an accessible combobox. A wrong guess or "Next clue" reveals the next clue, and the last clue adds four options, so anyone who can't recall or type the name still finishes (gap 1). Small answer lists (planets, chess pieces) give mysteries away through the suggestions, so they serve only easy mysteries.
- **Why rarity isn't an arm.** Rarity needs a crowd or editor guesses to score fairly, and one missing valid answer marks a right player wrong. Krillion also holds off lookups with a 25-second clock, which our no-countdown rule excludes (gap 1). It returns as the weekly Deep Cut.
- **What every arm keeps.** One Daily per date for everyone, sealed answers, the encore, a hideable stopwatch with no countdown, a sourced "why" on every answer, the stop screen and a spoiler-free share. Practice and the editor stay multiple choice in every arm. Challenges and room packs reuse Daily content, so they take the Daily's format (rooms already support clue ladders, 6.2).
- **How we judge.** Completion, share intent ("would you send this?") and persona feedback from simulated persona rounds (10.4), plus content cost measured for real in the week-one spike (7.1). Persona agents can show where the flow confuses or the copy fails. They can't show what is fun, so the beta confirms the choice.
- **The decision rule.** The PRD adopts the arm with the best simulated completion and share intent whose content cost fits the spike's measured throughput. Gap 1's evidence points to D, with B as the hedge and A as the control. The runner-up rides a beta flag for a random slice of new players, and gap 1's rule decides: keep the lead unless the runner-up's completed-share rate is at least 1.5 times higher with clean D1 no lower (10.5). If typing causes drop-off, the options move up to clue 3.
- **What waits.** Sealed Daily writing starts at scale only after the bake-off, so we never write 1,200 multiple-choice Daily items for a format we then drop. Practice writing starts in week one under every arm.

### 6.2 Question formats

| Feature | Priority | Spec | Evidence |
|---|---|---|---|
| Multiple choice | Must | Four options, or three when a fourth would be filler; never "all/none of the above" | 07 (Rodriguez [K]) |
| True or false | Must | At most one in ten; myths and surprising truths only | 07 |
| Two-way comparison | Must | "Which came first?" and "Which is bigger?" | 02, 07 |
| Closest number | Must | The Daily's encore and first tiebreaker in every arm. Players type a number on a numeric keypad, and it counts as correct inside a forgiving tolerance (starting value: within 15%, or within 5 years for dates). Written so that no single search returns the number, for instance a ratio or a combination of two facts | 07 (Wits & Wagers, pub-quiz "nearest wins"), gap 1 |
| Clue ladder | Must for the bake-off greybox, and for launch if a ladder arm wins | Four clues, hardest first. In the Daily: typed guesses with closed-list suggestions and four options on the last clue, worth 4, 3, 2 or 1. In rooms: worth 1,000, 700, 400 and 200 | 03 (quiz bowl), gap 1 |
| Ordering | Should | Four items placed by tap, so no drag is needed (WCAG 2.5.7); partial credit per correct pair | 05, 07 |
| Image questions | Could | Flags first, after a media-license check; descriptive labels (WCAG 1.1.1) | 07 |

### 6.3 Progression and habit

| Feature | Priority | Spec | Evidence |
|---|---|---|---|
| Streak | Must | Extends on any finished Daily; the counter animates; milestones at days 1, 3, 7 and 30 | 03, 04 |
| Freezes | Must | Earn one per 7 Dailies finished and hold up to two. A held freeze spends itself on a missed day | 04 (two-freeze test) |
| Free repair | Must | Within 48 hours, by playing the missed Daily from the archive, at most once per rolling 7 days and separate from freezes. Uncapped, a player could skip every other day and catch up from the archive, which turns a daily streak into a 48-hour window and makes freezes nearly redundant. Silverman and Barasch measured a softer drop when repair exists, not a case for unlimited repair. The beta tracks repairs per streak-day | 03, 04 |
| Record-first copy | Must | After a break, lead with best streak and total days played, never a big zero | 03 |
| Stats | Must | Days played, current and best streak, Daily score history and accuracy by category | 03 |
| Calendar reminder | Should | Offered after the first finished Daily in a system browser, never inside an in-app browser: Google Calendar's template link with a daily repeat on Android and desktop Chrome, an .ics file on Apple devices, both on desktop | 04, gap 2 |
| Category mastery | Should | Bronze to Platinum, based on accuracy over distinct questions | 03 (SDT), 04 |
| Achievements | Should | About 30 at launch (a starting value), each showing progress ("7 of 10"), a few earnable in session one, none for spending | 04 |
| Streak goal | Could | Pick 7, 14, 30 or 50 days | 04 [S] |
| Weekly goal | Could | Four days out of seven, for casual players who dislike daily streaks; report 03 wants it compared with daily streaks on retention and regret | 03 |
| XP and levels | Could | Earned by correct answers on unseen questions; unlock cosmetics only | 03 (Mekler), 04 |
| First-month recap | Could | At day 30; the yearly recap waits for December 2027 | 04 |

### 6.4 Social

| Feature | Priority | Spec | Evidence |
|---|---|---|---|
| Share result | Must | Text first and the link last, with a preview image per result and never an answer. The template follows the format: arm A reads "Daily #12: 8/10 in 1:42. Streak 6."; ladder arms use gap 1's grid, one row of squares per mystery plus the score and the encore's error. Web Share with a clipboard fallback. A share counts when the share sheet completes or the copy succeeds, never on the button tap. Links stay path-only, with no query string or tracking tag | 01, 04, 05, gap 1, gap 2 |
| Challenge a friend | Must | The link replays a sealed set scored on the server: the challenger's Daily (today's while it is still open for the friend, the archive copy after) or a themed pack built from past Dailies. Practice results can be shared but never issued as challenges, because practice answers ship to the client and a head-to-head on them can't be trusted. The recipient needs no account, both see the head-to-head, and there is an open-challenges shelf and a one-tap rematch | 01, 04 (Trivia Crack, Crossplay), constraints |
| Groups | Must | A private board for the Daily, joined by link, up to 50 members, with a weekly board that resets each Monday. Nicknames are visible to members only and pass the slur filter; under-18s get generated nicknames. No realtime: the board refetches on focus | 03 (N-effect), 04 (Friend Streaks; LinkedIn compares connections [K]) |
| Friend streaks | Could, first item in 1.1 | Up to five people who all finish the Daily | 04 (Duolingo) |

Groups moved up from Should. The primary persona already trades results in group chats (5.1), bet 4 says social means small, small-group comparison is the strongest social retention evidence in the reports (2 #8), and Groups need no realtime.

### 6.5 Multiplayer: host rooms (gated)

| Feature | Priority | Spec | Evidence |
|---|---|---|---|
| Host room | Gated | A big-screen host view; phones join with a six-digit code or a QR code; up to 20 players on Supabase Free; host-paced. Questions come from themed packs built from past Dailies once their 50-hour window closes (already double-checked, sealed on the server and calibrated by play), or from the host's own quiz stored on the server. Nothing a room plays ships in a client bundle | 01, 04, 06, 08, constraints |
| Room safety | Gated | Generated friendly names by default; hosts can remove or rename any player and lock the room; joins are rate-limited | 01 (Kahoot abuse) |
| Room scoring | Gated | Classic, in starting values: 700 base plus up to 300 for speed (linear decay) and a streak bonus of 50 per consecutive correct answer, capped at 250. The final question counts double, announced up front. An Accuracy toggle ignores speed, and accuracy scoring applies whenever the timer is off | 03 |
| Room timers | Gated | 10, 20, 30 or 60 s (20 by default) after a read beat, or "Off: host advances". The host can add 50% for everyone or for one player. W3C ranks switching a limit off as the most helpful fix (05), and report 03 says only that rooms "likely" qualify for WCAG's real-time exception, so Off is always one tap away | 03, 05 |
| Resilience | Gated | Rejoin the same seat, a polling fallback, a 500 ms grace, voiding on our error, and an async challenge offered when a room is full | 02, 06, 08 |
| Full text on phones | Gated | The question and answers appear on every phone as well as the big screen, which helps low-vision players and remote play over video calls | 05 |
| End screen | Gated | A podium, then two buttons: "Play today's Daily" and "Host your own" | 04 |
| Host-screen sound | Should, with rooms | Effects and optional music on by default on the host screen; phones stay silent by default | 05 |
| Preset reactions | Could | A handful of emoji, no free text | 02 |
| Chaos mode | Could | Opt-in chests (steal, swap, multiplier or nothing); hosts can switch sabotage off | 01 |
| Teams | Could | Random teams of three or four, Quizlet Live style | 01 |

**The rooms gate.** Rooms stay in greybox until the Daily loop's greybox has been playtested. Before a Beta label they must pass a k6 test of seven concurrent 20-player rooms from GitHub Actions, forced disconnects and rejoins, play with realtime blocked so only polling works, and tests proving that our errors void the question. If they fail, rooms move to 1.1 and the Daily ships without them.

### 6.6 Quiz creation (the repo's original intent, gated)

| Feature | Priority | Spec | Evidence |
|---|---|---|---|
| Quiz editor | Gated | Text only; multiple choice (three or four options) and true/false; an explanation field; up to 50 questions; autosaves on the device, and is stored on the server once saved, so rooms and challenges can serve it sealed | README, 07 |
| Bulk import | Gated; Must within the editor | Paste rows or upload a CSV in a documented plain-text format any chatbot can produce, so hosts bring their own AI drafts without us holding a model key. Creator lint and the slur filter run on every imported row | 01 (AI generation is "table stakes"), our read |
| Creator lint | Gated; Must within the editor | Warns on all/none of the above, negative stems, option-length gaps, duplicate options, missing explanations, numeric dates and time words ("current", "latest") | 07 |
| Safety and legal minimum | Gated; Must within the editor | A slur filter on every field blocks publishing, and quizzes are private by default. Sharing beyond the creator (unlisted link, challenge or room) waits for legal review, because report 06 attaches DSA notice-and-action and Online Safety Act duties to hosting user quizzes at all [K, needs legal review]. When it clears: a self-declared 18+ to publish, a report and complaints flow with published response times, terms, a contact point and a short written risk assessment | 01, 02, 03, 06 [K] |
| Play your quiz | Gated | Solo for the creator at once; by challenge link or live in a host room once sharing clears; the creator sees a play count and the average score | 01, 04 |
| More formats in the editor | Could | Comparison and closest number | 07 |
| Featured creator quizzes | Could | Picked and moderated by an editor | 01 (Sporcle) |

**The editor gate.** The editor also stays in greybox until the Daily loop's greybox has been playtested. Before a Beta label it needs the slur filter on every field and every import, the report and complaints flow, the legal items above, and legal review for sharing. If any is missing, the editor moves to 1.1 or ships for solo play only.

### 6.7 Content

| Feature | Priority | Spec | Evidence |
|---|---|---|---|
| Launch bank | Must | Sized by the week-one throughput spike: 120 Dailies' worth of sealed content first, then 30 spare days, then a practice pool of 2,000 items (1,500 floor); details in section 7 | 02, 06, 07 |
| Report a problem | Must | On every reveal: wrong, ambiguous, outdated, offensive or typo | 02, 07 |
| The weekly content run | Must, running from launch week | A scheduled agent run that drafts, source-checks and schedules each week and feeds the owner's queue (7.1) | 06, ours |
| Monthly themed pack | Should | With a badge | 04 |
| Regional packs | Could | The first one chosen from player geography after four weeks | 07 |

### 6.8 Accessibility

| Feature | Priority | Spec | Evidence |
|---|---|---|---|
| Big, stable targets | Must | Answer buttons at least 56 px tall (a starting value); other key controls at least 44 px; WCAG's 24 px is only a floor | 05 (WCAG 2.5.8) |
| Commit on release | Must | Pressed state on `pointerdown`, commit on `click` | 05 (WCAG 2.5.2) |
| Never color alone | Must | An icon and a word with every state; 3:1 for UI states; 4.5:1 for text, dimmed options included | 05 (WCAG 1.4.1, 1.4.11) |
| No hard limits outside rooms | Must | Outside rooms nothing times out unless a player opts into Blitz (a hideable stopwatch in the Daily and challenges, untimed practice); rooms offer Off, a 60 s setting and per-player extensions | 03, 05 (WCAG 2.2.1) |
| Typed answers | Must if a ladder arm wins | The suggestion box is an accessible combobox, every mystery can be finished from the four options on its last clue, and nothing depends on typing speed | 05, gap 1 |
| Motion control | Must | Honors `prefers-reduced-motion` with an in-app override; never more than three flashes a second | 03, 05 (WCAG 2.3.1, 2.3.3) |
| Keyboard play | Must | Every mode playable by keyboard; 1 to 4 shortcuts scoped to the question and switchable off | 05 (WCAG 2.1.4) |
| Screen readers | Must | Focus moves to each question's heading; verdicts in a polite status region; a silent timer unless announcements are on; accessible names match visible text | 05 (WCAG 4.1.3, 2.5.3) |
| Reflow | Must | Works at 320 px wide, at 200% zoom, with WCAG text spacing and with sticky footers that never hide focus | 05 (WCAG 1.4.12, 2.4.11) |
| Themes | Must | Light and dark, following the system with an override; forced-colors support | 05 |
| Readable text mode | Should | Extra letter spacing (0.05 em) and line height (1.6) on an off-white background | 05 (BDA [K]) |
| High-contrast feedback | Should | Blue and orange instead of green and red | 05 (Wordle) |
| Read aloud | Should | `speechSynthesis`, pausing any timer while it speaks | 05 |
| Select, then confirm | Could | For players with tremors; speed measured from the confirm | 05 |

### 6.9 Platform and monetization

| Feature | Priority | Spec | Evidence |
|---|---|---|---|
| Guest identity and sync code | Must | No account. A first-party backup cookie set by our own server restores an emptied store silently. The sync code is offered after the third finished Daily in a system browser or the first saved quiz; right after the first finish inside an in-app browser or a private tab; and before the iOS install pitch, since the Home Screen app starts with its own storage [K] | constraints, 08, gap 2 |
| In-app browser handoff | Must | Detect in-app browsers on share and challenge landings and log the container. Play first, in any container. After the first finished Daily inside one, offer a one-time claim link that carries the identity to the system browser, with the sync code as fallback and an "Open in your browser to keep your streak" hint. Never pitch install, push or a calendar file there | gap 2 |
| Installable PWA, offline practice | Must | A manifest with icons plus a service worker; `persist()` called only in the installed app, the one place it resolves true | constraints, 06, 08, gap 2 |
| Install pitch | Should | After the third finished Daily: `beforeinstallprompt` on Chromium, two illustrated steps on iOS Safari, checked on a device before the copy is written | gap 2 |
| Legal and trust pages | Must | Privacy, terms (13+), a content policy with a report flow, credits and licenses, an accessibility statement, and a "How scoring works" page that says solo play runs on the honor system and that runs with tab switches stay out of the crowd's numbers | 02, 06 |
| Incident handling | Must | Pre-written status banners; outages protect streaks automatically | 02, 06 |
| Backups and a restore drill | Must, before the closed beta | An encrypted nightly dump from GitHub Actions and one successful restore drill; the owner supplies the connection string (10.7) | 06, 08 |
| Edge Function secret spike | Must, before launch (a spike, not a feature) | One Edge Function holding a secret, exercised end to end from GitHub Actions; the shared prerequisite for push and payments, and later for AI drafting (section 9, row 25) | constraints, 04, gap 2 |
| First-party analytics | Must | Section 10 | 06, 08 |
| Indexable category pages | Should | One per category, with original copy and one-tap play; no answer dumps | 01, 07 |
| Monetization at launch | Must | Free, with no ads, purchases, trackers or sign-up wall | 04 |
| Paid model, decided now | Must (a decision, not a build) | Plus: the archive beyond 7 days, extra themed packs, deeper stats, cosmetic themes and bigger rooms. Then host plans for pubs and office events. Switch on when clean D7 holds at its 12% target for four weeks; whatever D7 shows, decide pricing by week 8 after real players arrive. Payments can't ship until the secret spike passes and Vercel Pro is in place | 02, 04 |

### 6.10 What we deliberately won't build in v1

| Not building | Why | Revisit when |
|---|---|---|
| Cash prizes, sweepstakes, paid entry | HQ's prize bill, gambling-law exposure, payout operations and the main motive to cheat (02) | Never |
| Lives, energy, pay-to-win, paid streak repair | The loudest complaints in reviews; selling relief from pain we created (02, 04) | Never |
| Ads between questions | Interstitials churn players; Better Ads rules (02, 04) | Never. Contextual ads outside play only as a last-resort fallback |
| Loot boxes or any paid randomness | Linked to problem gambling; the DFA targets gamified rewards (03) | Never |
| Bots presented as people | The Papaya verdict (02) | Never |
| All-time or global named leaderboards | The N-effect; cheaters own the top of public lists (03) | Never all-time. Matched leagues when cohorts fill within a day |
| Leagues | Need enough weekly players to fill cohorts (01, 04) | When every cohort fills within its first day |
| Real-time public matchmaking | Liquidity; QuizUp's live duels never earned (04) | When peak waits fall under 20 s |
| Scheduled live shows | HQ's appointment risk and fan-out failures (02) | A weekly "Showdown" with an async fallback, once rooms prove stable (01) |
| Open text chat | HQ's chat; COPPA-safe defaults (02, constraints) | Not planned |
| Public gallery and search for user quizzes | Moderation load, plus the DSA and UK Online Safety Act duties report 06 attaches to hosting user quizzes at all [K, needs legal review] | After a moderation pipeline and legal review |
| Images or media in user quizzes | Moderation and storage risk | With the gallery |
| AI quiz generation for creators | Our choice, not a prohibition. A model key needs an Edge Function secret; the constraints allow Edge Functions where SQL has no alternative, and here SQL has none. The path is untested, and AI items carried more errors in medical exam studies (02). Bulk import already lets hosts bring their own drafts | When the secret spike passes in CI, with an "AI-assisted" label (01) |
| Web push | Our choice for v1. Signing needs a private key in an Edge Function secret, the same untested path. iOS pushes only to installed apps, a small group at first, and browsers punish careless asks (04, gap 2) | When installed weekly players reach 10% of weekly habit players or 1,000, whichever comes first, and the spike passes in CI (gap 2) |
| Answer pages for past Dailies | Gap 1 recommends free explainer pages once a Daily has closed everywhere, but they would publish the answers that room packs, challenge packs and the Plus archive reuse sealed | When players search for our answers (gap 1's own trigger), with a separate pool for room packs |
| Under-13 or classroom mode | COPPA and school-privacy duties (01, 04) | After legal review |
| Native apps | The web is our distribution | After product-market fit |
| Third-party analytics or trackers | Privacy rule (constraints) | Only if first-party SQL stops being enough (08) |
| Imports from OpenTDB, Jeopardy! or quiz-bowl archives | BY-SA obligations on our database; copyrighted writing (07) | A separate attributed pack after legal review, at most |

---

## 7. Content strategy

### 7.1 Volume, throughput and the content engine

The old plan committed to about 3,900 launch items: 3,000 practice, 600 Daily and a 300-item reserve. Each needs two sources, one of them primary, plus stored quoted passages, which comes to roughly 7,800 retrievals before any re-check. The research behind that plan ran out of budget itself. Track 04 stopped after 11 searches, tracks 05 to 08 and all three gap tracks ran none, page fetches failed for 02 and 06, and 07 lists reference hosts outside the allowlist. Gap 1 puts the shared search budget at 200 calls per turn across all agents, so 7,800 retrievals done as searches would take 39 full budgets. Volume therefore follows measured throughput, not ambition.

**The week-one content spike.** Write and verify a sample of each item type (multiple choice, mystery and encore) under the real search budget and allowlist, through every retrieval path we have: WebSearch, direct fetches where the allowlist permits, and a GitHub Actions job that snapshots source pages for checkers, since runners may reach hosts the sandbox can't (07). Measure verified items per day for each type. Size the launch bank to that throughput and the launch date, and feed the per-type costs into the bake-off (6.1). If throughput falls short, shrink the practice pool, never the two-source rule.

**Launch effort goes to the front door first.**

| Pool | Launch target | Floor | After launch |
|---|---|---|---|
| Scheduled Dailies (sealed) | 120 Dailies' worth or more (arm A: 1,200 items; arm D: 480) | 120. If throughput can't reach it, a cheaper arm or a later date absorbs the gap | Assembled 14 days ahead; alert when the runway drops below 30 days |
| Spare days (sealed reserve for auto-assembly) | 30 Dailies' worth (arm A: 300 items; arm D: 120) | 30 | Refilled monthly |
| Past Dailies (sealed) | Grows by one Daily a day once play begins | None | The source for room packs, challenge packs and the Plus archive |
| Practice pool (ships to the client) | 2,000 items, at least 200 per category | 1,500, at least 150 per category; lower only if the spike forces it, and never under 100 per category | About 300 new items a month |

Why these numbers. The old plan's 60 scheduled Dailies plus the 300-item reserve gave about 90 days, and nothing said what happens on day 91. The new front door gives about 150 days of runway before any new writing. After launch, arm A needs about 600 verified items a month (300 for the Daily, 300 for practice) and arm D about 420. A typical player doing the Daily plus one practice run sees about 300 practice items a month, so 2,000 last roughly seven months. A heavy player who sticks to one category hits repeats within weeks; seen-tracking then steers them to a mixed run with a short note. Reviewers notice repeats after about two weeks (02, low confidence), and no Daily item repeats within a year (07).

If the spare days are ever needed, the scheduler assembles a Daily from them by the composition rules in 7.4, so the Daily never fails to appear.

**The post-launch engine: a scheduled weekly content run.** Each week an agent run drafts new items, checks each against two sources and stores the passages, runs the dedupe and myths checks, and test-solves for ambiguity and wrong keys. After the Monday re-tune (7.10) it re-scores the sealed pool, then schedules Daily content into the runway and practice items into packs. Every exception, plus a random sample, goes to the owner's weekly queue. It has to produce about 140 items a week under arm A, or about 100 under arm D. It runs under the owner's account after handoff (10.7). If it stalls, the 30-day alert leaves a month to recover before the spare days start to go.

### 7.2 Categories

Ten broad categories drive balance and per-category stats (07): **Geography, History, Science & Nature, Film & TV, Music, Arts & Literature, Sport & Games, Food & Drink, Language & Words, Society & Culture.** "General knowledge" is a mix of them, not a category. Free-form tags ("Flags", "1990s", "Space", "Dinosaurs") drive themed packs and search pages. Trivial Pursuit's six categories are the cultural baseline, and OpenTDB's 24 show how a long tail splinters a bank (07).

### 7.3 Format mix

- **The Daily:** set by the winning arm (6.1). In arm A, nine standard items, mostly multiple choice with at most one true/false and one comparison, plus the closest-number encore. In ladder arms, mysteries plus the encore.
- **The practice pool:** about 75% multiple choice, at most 10% true/false, about 10% comparison and about 5% closest number. Ordering joins when it ships.
- **Across the bank:** about one question in four is written so the obvious guess is wrong, because confident errors are the ones people remember fixing (03). It misleads through a plausible belief, never through a misread word (07). Every one of these misconception items links its source in the explanation, since confident-but-wrong players will report them as "wrong" (7.11).

### 7.4 The Daily's shape and difficulty

Launch difficulty is seeded and unmeasured. Writers and an estimator guess it; nobody has played it yet. Test-solves can't fill that gap. Every solver we have is an AI agent that knows most trivia, so its solve rate carries almost no difficulty signal, and even five human solves would leave an estimate of roughly plus or minus 40 points (our calculation, in line with gap 3). Test-solves catch ambiguity and wrong keys, not difficulty. The bands below are therefore wide targets. We assemble Dailies from predicted rates inside buffered windows, then re-tune scheduled Dailies weekly from early play and from the practice items that calibrate first (7.10, gap 3).

Arm A's shape follows. Ladder arms apply the same method to the predicted share of players solving at each clue (gap 3).

| Slot | Target band (true correct rate, unmeasured at launch) | Assembly window (predicted rate) | Purpose |
|---|---|---|---|
| 1 to 4 | Easy: about 70% or more | 0.90 or more, from the lowest-spread estimates; slot 1 gets the highest and is never true/false | A confident start |
| 5 to 7 | Medium: about 40 to 85% | 0.62 to 0.85, in descending order; high-spread items go to slots 6 and 7 | The body of the quiz |
| 8 | Expert: under about 35% | 0.18 or less, with at least two estimates under 0.25. It must pass the foothold rule, so its difficulty comes from obscurity, not ambiguity | The peak (03) |
| 9 | Medium: about 40 to 85% | 0.62 to 0.85 | The climb down, kinder than the old Hard slot |
| 10 | Closest number | No rate target; a forgiving tolerance (6.2) | The encore and first tiebreaker, chosen for its reveal, so nobody is shut out of the ending |

Gap 3's simulations show why the windows sit inside the bands. Taken at face value, the old bands left an Easy slot under 60% on about 19% of days, and buffered windows cut that to about 5%. Even buffered, the middle slots land in band only 31 to 66% of the time, so before data we can steer the ends and the total but not the middle.

**A typical score near 7 of 10.** The old plan aimed at 6 of 10, citing the 55 to 70% band report 03 suggests for ranked play. But report 03 puts the Daily in its calm lane (implication 30), where it targets 75 to 85% for casual modes, and the primary persona wants calm games that are easy to learn (5.1). The share also leads with the score, so a median of 6/10 may suppress sharing. So the shape above opens with four Easy items and puts a Medium at slot 9. The encore's tolerance loosens too (6.2). The predicted nine-slot total runs 6.5 to 7.1, or 6.8 to 7.2 for the first seven Dailies, leaning easy while the estimator's shared bias is unknown (gap 3). Ladder arms aim for about 70% of available points. The beta tests this shape against the old one (three Easy openers and a Hard slot 9) on clean D1 and completed-share rate, as a directional read (10.5). Appendix A records the conflict.

**Rules.** At least six categories. At least two items from Film & TV, Music or Food & Drink and at least two counterintuitive items, so the Daily isn't bland. At most one Sport & Games item, `global` region items only and no repeat within a year. Every Daily item is checked twice and test-solved for ambiguity and wrong keys; an AI solver's miss sends the item back for a re-check and never feeds a difficulty rating. Ladder arms rotate categories so each appears every three or four days (gap 1), with Film & TV, Music or Food & Drink in most Dailies.

**Lock content, not dates.** Keep 14 days assembled. Freeze each Daily 3 days ahead in the first month and 7 days ahead after two calm weeks, and re-assemble the rest after each weekly re-tune, so lessons from week one reach week two (gap 3). The owner's queue gets an alarm when a Daily's mean lands more than 1.0 question from prediction, an Easy item scores under 65%, an Expert item scores over 45%, or strong players miss an item more often than weak ones.

### 7.5 The quality bar (pass/fail rubric for CONTENT_GUIDE.md)

1. **Foothold.** A player with partial knowledge can reason toward the answer. Pure lookup facts are out, except closest-number estimates. "Which element is named after the Greek word for the Sun?" passes; "What is rhodium's atomic number?" fails (07). Encore items favor quantities no single search returns, such as a ratio or a sum of two facts, because gap 1 warns that bare numbers are easy to look up.
2. **One defensible answer.** Define superlatives ("highest above sea level"). Avoid contested firsts, measurement disputes (the Nile or the Amazon), counting conventions (six or seven continents) and near-tie dates (07).
3. **Clean wording.** No trick wording of the "Moses took two of each animal" kind, and no "Which is NOT" under a timer (07).
4. **Options.** Same kind, similar length, a real confusion each (Sydney and Melbourne for Australia's capital) and no joke options in ranked play. Numbers and dates sorted ascending. Never a real living person as a distractor for a crime or scandal (07).
5. **Length.** Stems under about 120 characters and options under about 24 where possible, so the desktop 2 by 2 grid works (07).
6. **Explanation.** 35 words or fewer, adds a fact rather than restating the answer, addresses the most-picked distractor and links the primary source (07).
7. **Tags.** Category, free tags, region, volatility class, a seeded difficulty from 1 to 5, and estimator v0's predicted rate with its spread (7.10).
8. **Sources.** Two independent sources, one of them primary (an official body, the original publisher, a peer-reviewed paper or the museum or archive that holds the object). Wikipedia can point to sources but never counts as the primary. Other trivia sites never count (07). The passage supporting the key, and every clue in a mystery, is stored with the item.
9. **Checks.** A checker who isn't the writer, a pass against a myths list and a dedupe check against the bank. Daily items get two independent checks plus test-solves that look only for ambiguity and wrong keys.
10. **Sensitivity.** No tragedies or slurs played for laughs, and no prying into private lives (07).

### 7.6 Verification when the writers are AI agents

The research says AI may draft but humans should verify every item (02, 06, 07). Our content team is an agent swarm, so we replace the human check with stricter mechanics and keep a human in the loop after launch. Agreement between agents proves little. Writers, checkers and auditors probably share a model family, so their errors correlate, and a second agent saying "correct" is weak evidence. The mechanics below lean on stored text and planted errors instead.

- **Acceptance rests on a stored passage.** The checker retrieves both sources and stores the exact passage that supports the key, and each clue in a mystery. An item is accepted only on that passage, never because agents agree, and nothing passes on model memory.
- **Independence.** Checkers see the item and its claim, never the writer's notes or reasoning.
- **Two checks for every Daily item**, by different checkers.
- **An error-seeded blind audit before launch.** A separate agent re-checks 300 random practice items mixed with 20 to 30 planted bad items: a wrong key, an ambiguous stem, an outdated fact, two defensible answers. The audit counts only if it catches at least 95% of the planted items. Then zero confirmed errors among the 300 bounds the practice error rate below about 1% at 95% confidence, or about 1.1 to 1.3% once the auditor's measured miss rate is allowed for (our calculation). Any confirmed error sends that writer's whole batch back for re-checking, and every later audit is seeded the same way.
- **A freshness cutoff.** The models drafting our content know little after mid-2026, so nothing time-sensitive or "current" enters the seed bank (07).
- **What the published error figures are.** The AI-error studies we cite (6% against 4% factual errors; 31% of items rejected) used medical exam items (02). Nobody has measured AI-drafted general trivia, so we measure our own rate through seeded audits and live reports.
- **A human in the loop after launch.** The owner works a weekly queue of flagged items and audit samples from the content run, and spot-checks 50 random Daily items before 1.0 (decision 14).

### 7.7 Explanations

Every item gets one, shown after right and wrong answers. It adds a fact and defuses the likeliest wrong pick, with a link to the primary source. Report 07's model, for Canberra: "Sydney and Melbourne both wanted to be capital, so the constitution put the new capital in New South Wales but at least 100 miles (about 160 km) from Sydney." That defuses the Sydney trap in 29 words. We measure whether explanations land through dwell time and an optional one-tap heart on the explanation sheet, which doubles as our per-question fun signal (10.3).

### 7.8 Freshness

Volatility classes from report 07: **evergreen** (no expiry), **slow** (review every 24 months), **fast** (kept out at launch) and **dated** (the year sits in the stem, so it never expires). Items past their `review_by` date leave rotation automatically. Facts flip faster than banks update: Kazakhstan renamed its capital twice in three years, and the box-office record changed hands twice in two (07).

### 7.9 Regional fairness

Every item carries a region tag, and the Daily and its percentile use `global` items only. Dual units, spelled-out months ("3 April", never 03/04), care with words that differ by country ("football" names different games) and both spellings accepted in typed answers. A fairness check comes from at least two regions besides the writer's. Fame across many languages beats fame in one country, so generated ordering candidates from Wikidata need at least 10 sitelinks, Wikitrivia's cutoff (07). Report 07 asks whether the global-only rule makes the Daily bland; the mix rule in 7.4 is our answer, and the per-question heart tells us whether it works.

### 7.10 Calibration: estimates first, then play

Writers seed difficulty, an estimator predicts it, and play decides it.

- **Estimator v0.** Five independent agent estimates of the share of English-speaking adults who would pick the right option, given the stem and options, each from a different angle (fame of the answer, schooling, distractor pull, recency). Take the median on the logit scale and keep the spread as uncertainty, stored with the estimator version beside the writer's 1 to 5 seed. Text-only estimators correlate with human difficulty at roughly 0.3 to 0.8 in the literature gap 3 recalls [K], an error of about 13 to 21 points; nothing reaches plus or minus 10 points without human answers.
- **Benchmark before launch.** Run v0 offline on the recall norms of Tauber and colleagues (2013) and of Nelson and Narens (1980), never in the bank ([DOI](https://doi.org/10.3758/s13428-012-0307-9), [DOI](https://doi.org/10.1016/S0022-5371%2880%2990266-2)) [K]. Proceed at a rank correlation of 0.6 or better; otherwise fix the prompts before scheduling. The norms test ranking, not level, since they measure free recall among US undergraduates.
- **Ratings from play, Lichess-style (06).** Seed item ratings from v0 with a Glicko deviation of about 175 once v0 passes the benchmark, and 350 until then (gap 3). Update only on a player's first rated attempt at an item. Damp updates in self-picked categories and cap each player's daily influence. Ignore flagged accounts and players with under 20 rated answers, and freeze ratings on disputed items.
- **Exploration.** Reserve 10% of practice serves for the least-sampled items, never as a round's first question. Without it, adaptive serving leaves the hardest items unrated for most of a year at 500 daily players (gap 3).
- **The weekly re-tune (Mondays, automated).** Fit observed against predicted rates on Daily items with 100 or more eligible answers and on practice items with 100 first attempts. Add shrunken category offsets once a category has eight such items, re-score the sealed pool, re-assemble Dailies beyond the freeze and narrow the assembly windows using the error measured live (gap 3). The Daily calibrates fastest because everyone answers the same items: seven beta Dailies pin the estimator's shared bias to about 3 points (gap 3).
- **Offline play still counts.** Practice results upload in batches when online, so they calibrate the pool too.
- **Editor flags.** Send an item to an editor when its success rate sits above 95% or below 10%, when strong players miss it more than weak ones (a sign of a wrong key or ambiguous wording), when a distractor draws under 5% of picks, or when reports pass 1% of plays (06, 07). When a distractor is dead weight, cut to three options: three good options beat four with a filler (07).
- **No pretests at our scale.** Testing a sealed Daily item on 100 practice players spoils it for 20% of players at 500 daily players, so pretests wait until 10,000 (gap 3). Estimator v1 trains on our own data once 1,000 practice items have 100 first attempts each.
- **No paid panel now.** A 600-item panel with 50 answers each would cost about $1,300 to $2,500 and needs the owner, and it measures paid panelists rather than our players. A capped pilot (about $400 to $500) runs only if the benchmark correlation falls below 0.5, or beta week one shows item error above 25 points or two Dailies more than 1.5 questions off (gap 3, 10.7).

### 7.11 Disputes and corrections

- "Report a problem" sits on every reveal, with five reasons: wrong, ambiguous, outdated, offensive or typo.
- **Reports are weighted.** Guest identities are free (section 9, row 5 allows five new ones per IP per hour), so at launch scale ten sock puppets could void a question. A report counts only from an identity that answered that item, and identities under a day old count half (starting values).
- **Practice items:** three distinct weighted reports pull the item pending review (07).
- **Daily items:** three reports page the editor queue at once. Weighted reports from 2% of that day's players (and at least 10) raise an alert, not a void. The item is voided only after its stored passages are re-checked, by an agent run or by the owner, because one item in four is written so the obvious guess is wrong (7.3) and confident-but-wrong players will report exactly those. When a void stands, everyone gets the point, and results screens explain why once scores recompute. The median time from first report to void or fix is a tracked metric (10.2).
- **Any item** whose report rate passes 1% goes to review (06).
- When a key changes, affected attempts are rescored and those players see a note on their next visit (02, 07).

### 7.12 Licensing

The launch bank is original writing from primary sources. No OpenTDB import into the main database: its CC BY-SA 4.0 license allows commercial use, but copying a substantial part can make our database itself Adapted Material (07). No Jeopardy! or quiz-bowl text. The Trivia API only under a written commercial license. Wikidata (CC0) is a source of candidates and of closed answer lists for clue ladders, never a fact-checker (07). Human-rated data sets serve as benchmarks at most: a 554,131-clue Jeopardy! data set asks that nobody use it "to make a public-facing web site, app, or any other product" ([README](https://github.com/jwolle1/jeopardy_clue_dataset)), and LearnedLeague, J! Archive, Pointless fan wikis and Sporcle are for reading by hand, never scraping (gap 3). Facts carry no copyright, but their expression does, so we write our own wording (07; not legal advice).

### 7.13 Live-ops calendar

Owned by the Content pod from week one (06):
- **Weekly:** the content run (7.1), plus a themed practice pack built from tags ("Space week").
- **Monthly:** a season with a themed pack and a badge (04).
- **Holidays:** a few themed Dailies a year, still mixed-category where possible.
- **January 2027:** a "fresh start" season. Goal pursuit rises after a new week, month, year or birthday (03, [Dai and colleagues](https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf)), and our launch timing hands us one.
- **Recaps:** "Your first month" at day 30; a yearly recap in December 2027, once there's a year to recap (04).

---

## 8. UX and game-feel principles

Timings and sizes in this section are starting values to tune in playtests, as report 05 says of its own.

### 8.1 First run

- `/` shows the Daily card ("Daily #12. About 3 minutes.") with one Play button above the fold at 360 by 640, plus Quick play. One tap reaches question one, with no carousel, login, name or tutorial first, in any browser, in-app ones included (05, gap 2).
- The first question is the tutorial. Teach in context, once. In rooms, the first timed question carries one line about speed points. In the Daily, the first screen says time only breaks ties, and in a ladder arm the first clue says "Guess, or tap Next clue" (05).
- Ask for a nickname only when a group or room needs one. Offer the sync code once there's something to lose: after the third finished Daily in a system browser or a first saved quiz, and right after the first finish inside an in-app browser, next to the claim link and an "Open in your browser to keep your streak" hint (gap 2).

### 8.2 The question screen

- **Mobile layout:** `100dvh` with safe-area padding. The header holds progress, exit, sound and settings. The question sits in the upper 40% and the answers in the lower 55%, where thumbs reach most accurately (05; Hoober [K]).
- **Answer buttons:** full width minus 16 px gutters, at least 56 px tall with 12 px gaps, and 18 px left-aligned text that wraps and grows the button. A to D letter badges mean nothing depends on color. A 16 px radius, with a 4 px darker bottom edge that compresses 2 px on press (05).
- **Desktop (768 px and up):** a 720 px column, a 2 by 2 grid only when every option is under about 24 characters, and key hints 1 to 4 that listen only while focus is in the question and can be switched off (05).
- **Stability:** buttons never move between questions, and the progress bar has one segment per question, each marked with a check or an X once answered (05).

### 8.3 The press and the reveal

The pressed state appears on `pointerdown`; the answer commits on `click`, so sliding off cancels (WCAG 2.5.2). Practice times the answer from that press on the client. In ranked play the server's clock decides (constraints, 08).

| Time after press | What the player sees | Notes |
|---|---|---|
| 0 ms | Pressed state | Same frame as the tap; INP target 200 ms or less |
| By 150 ms | Lock-in state, plus an optional 10 ms vibration on Android | |
| 400 ms | The reveal. The right answer turns green with a check and "Correct answer"; a wrong pick turns red with an X and "Your answer"; the rest dim but keep 4.5:1 text contrast | Ranked play waits here for the server's verdict, which also carries the next question's stem (8.4). The suspense beat hides normal latency; past about 1.5 s, show "Checking..." |
| 400 to 900 ms | Points or a tick count up, with a chime | `tabular-nums`, so digits don't jitter |
| About 1.2 s | The explanation sheet rises as an overlay, so nothing shifts (CLS budget 0.05) | A tap skips the automatic part |
| Until tapped | The explanation stays. Continue sits where the answers were, so the thumb never travels | Opt-in auto-advance waits 2 s plus 0.25 s per word |

A wrong pick gets a soft 6 px, two-cycle shake, which becomes a color fade under reduced motion. A polite `role="status"` region says "Correct. Paris." or "Not quite. You chose Lyon. The answer is Paris." `role="alert"` is reserved for a lost connection (05).

### 8.4 Pacing and the read beat

- In the Daily and in timed modes, the question appears alone before the options fade in (0.25 s per word, from 1.5 to 5 s), and a tap skips it after about a second. A fixed beat added 20 to 50 seconds of enforced waiting to every ten-question Daily, and its case rests on an inference: Brod and colleagues studied explicit predictions, not imposed waits (03). The beta compares the skippable beat with no beat on completion and the per-question heart. Untimed practice shows options at once.
- **Transition budget: under 100 ms from Continue to the next stem on screen.** The next stem arrives with the previous verdict and the options load during the beat; server time starts when they are issued (section 9, row 6). Time only breaks ties, and every player gets the same beat on the same question.
- A 35-word explanation takes about 9 seconds at 238 words a minute ([Brysbaert](https://doi.org/10.1016/j.jml.2019.104047)) [K], so the player decides when to continue (05). Reading the explanation never counts toward a score.
- In rooms the host advances. Autopilot rooms wait 3 s plus 0.3 s per word (05).

### 8.5 Clocks and timers

- **Daily and challenges:** a small stopwatch, not a countdown, which players can hide. Nothing ever times out, and time only breaks ties.
- **Practice:** no clock by default. Blitz, after launch, adds an opt-in 10 s countdown with speed points.
- **Rooms:** a countdown of 10, 20, 30 or 60 s (20 by default), or Off, where the host advances. The countdown is drawn as a linear bar plus a seconds label. At 5 s left it turns amber and striped, so the warning isn't color alone. No flashing, and no pulse under reduced motion. Ticks play only in the last 5 s. The bar is `aria-live="off"`; opt-in announcements speak at 10 s and 5 s (05).
- Solo countdowns pause in hidden tabs. In ranked play the server's time keeps running, and a hidden tab or lost window focus during a ranked question sets an honest-play flag (section 9, row 24) (05, 08).

### 8.6 Celebration and juice

Feedback should mark real success and scale with it (03). The evidence is early. A pre-registered study of 1,699 players suggests overloaded feedback can lower felt competence ([KIT](https://publikationen.bibliothek.kit.edu/1000171104/152952099)), and a game-feel survey cites medium and high juice beating both none and extreme ([arXiv](https://arxiv.org/pdf/2011.09201)).
- **Each correct answer:** color, a quick pop, a chime and a count-up.
- **Five in a row:** a bigger flourish. **A perfect Daily:** the biggest moment, with confetti that is lazy-loaded and set to `disableForReducedMotion: true` (the library default is false) (05).
- **Never:** confetti on every answer, "so close!" when it wasn't close, or a celebration you can't skip (03).

### 8.7 Sound and haptics

- **Defaults:** on phones, effects start off behind a visible speaker toggle and the choice is remembered (03). The host screen starts with sound on, because a room wants atmosphere. Music never autoplays (WCAG 1.4.2).
- **Engine:** effects synthesized or sprited in Web Audio, under 30 KB, with the `AudioContext` created on the first tap. Web Audio mixes with the player's own music, while `<audio>` elements can pause it (05).
- **Palette:** a soft tap under 50 ms, a rising two-note chime under 300 ms for correct, a low, muted thud for wrong (never a harsh buzzer) and ticks only in the last 5 s of a room countdown (05).
- **Haptics:** Android-only extras behind a toggle (tap 10 ms, correct 20 ms, wrong 30-40-30 ms). Safari has no vibration API, so nothing may depend on haptics (05).

### 8.8 Results and the stop screen

- **Open on the best fact:** a personal best, a perfect round, a longest streak or a mastery tier reached. Then the percentile, labelled "so far today" because later time zones are still playing, then the "how everyone did" chart, then "Review your misses" (03, 05).
- **One primary button.** The Daily's says "Done for today" and shows a countdown to tomorrow's quiz, with an optional practice link beneath. Practice says "Play again". Share is always secondary. Nothing autoplays into another round (03, 05).
- **Share text leads with words** and ends with the link. Arm A: "Daily #12: 8/10 in 1:42. Streak 6." Ladder arms use gap 1's grid: the name, number and score, one row of squares per mystery, the encore's error, and the percentile once 50 players have finished. Squares come after the words, because screen readers read grids square by square (05). A share never contains an answer.
- **Cold start:** the percentile appears once 50 players have finished that Daily, and a per-question crowd stat once 50 have answered. Before that, say how many have played and invite the player back later.
- **After a break,** lead with the record ("Best streak: 23 days"), never a big zero (03).

### 8.9 Visual system

- **Expressive, not glassy.** Chunky rounded shapes, big type, tactile buttons and spring motion, borrowed from Material 3 Expressive. No translucent panels behind text, which NN/g criticized in Apple's Liquid Glass (05) [K].
- **Type.** Fredoka or Nunito for headings and scores; Atkinson Hyperlegible Next for reading text. Questions at 22 to 26 px on mobile with `text-wrap: balance`; explanations at 17 px and at most 65 characters a line. No all-caps answers; bold for emphasis, never italics (05).
- **Color.** Semantic tokens (correct, incorrect, selected, warning) at 3:1 against their neighbors in both themes and under protan and deutan simulation. A high-contrast feedback setting swaps to blue and orange, as Wordle does. In `forced-colors` mode, borders and icons carry the states (05).
- **Dark mode** follows the system, with an override: surfaces near #121212 and desaturated accents, never pure black with neon (05).
- **Motion.** UI transitions of 100 to 500 ms ([NN/g](https://www.nngroup.com/articles/animation-duration/)) [K]. An in-app Reduce motion setting overrides the OS either way (05).

### 8.10 The host screen

- Built to be read across a room or on a shared video call. It shows the question, the four answers with letters and shapes, a large timer (or "Host advances" when the timer is off) and a join panel with the code and a QR code.
- Phones show the full question and answers too, rather than colored shapes alone. Players with low vision or far from the screen keep up, and so do remote players on a call.
- Between questions, the big screen shows the top five while each phone shows that player's rank and gap ("4th, 120 behind Brave Otter"). Everyone outside the podium gets a nearby target.

### 8.11 Tone of voice

Write warmly and plainly. Streak and reminder copy stays neutral ("Your streak is safe. A freeze covered yesterday."), with no guilt and no fake urgency (03, 04). Offline copy says what still works and what doesn't count: "The Daily needs a connection. Practice works offline, but it isn't today's Daily."

---

## 9. Technical recommendations and the risks they mitigate

The constraints in [01-ENGINEERING-CONSTRAINTS.md](../01-ENGINEERING-CONSTRAINTS.md) are fixed: no Supabase Auth, no service-role key, Next.js server code limited to the publishable key, a mock backend for local tests, and free tiers. They do not rule out every secret. Edge Functions are deployable through MCP and are to be avoided "unless there is no SQL alternative", and signing web push and verifying payment webhooks have none, nor does holding a model key. Where earlier drafts said the platform can't hold a secret, read it as a choice we made for launch. Row 25 proves the path before launch so the choice can change.

**One recommendation breaks a constraint, and we ask the CTO to sign it off explicitly.** Constraint 1 says every single-player mode works with zero network after first load. The Daily can't: its answers stay sealed on the server (constraint 4), so it needs a connection. Appendix A settles the trade-off, but a table row is not sign-off. The offline fallback is practice, labelled clearly as not today's Daily, and freezes cover a day without signal.

| # | Recommendation | Risk it mitigates | Basis |
|---|---|---|---|
| 1 | One `GameBackend` interface with an implementation per `NEXT_PUBLIC_BACKEND_MODE` value, over a pure game engine with a seeded RNG and an injectable clock | The sandbox can't reach Supabase; timing tests turn flaky | constraints, 08 |
| 2 | Gameplay calls Supabase RPCs from the browser, not Server Actions. Every write carries an idempotency key (attempt id plus question index) backed by a unique constraint | Server Actions run one at a time and break across deploys ("Failed to find Server Action"); double taps and retries double-count | 08 ([Next.js](https://nextjs.org/docs/app/guides/server-actions)) |
| 3 | Security baseline in migration one: tables in a `private` schema with no grants; RPCs as `security definer set search_path = ''`; `EXECUTE` revoked from `public` and `anon`, then granted per function on purpose; every input validated; a CI test that fails on any `anon`-executable function outside an allowlist | An `anon`-callable definer function "is effectively a public API endpoint" ([Supabase lint 0028](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0028_anon_security_definer_function_executable)) | 08 |
| 4 | Guest identity: a random player id plus a 256-bit secret kept on the device and backed by a server-set cookie (row 18). The database stores a SHA-256 hash, not bcrypt, and checks it on every write. A sync code restores the profile elsewhere | No Supabase Auth; bcrypt on every call would burn the Nano instance's shared CPU | constraints, 08 |
| 5 | Two rate-limit layers: `pgrst.db_pre_request` caps writes per IP (start near 300 per 5 minutes, since schools and offices share IPs), and sensitive RPCs cap per identity or IP (for example 5 new identities per IP per hour). Cron prunes the counters. Because identities stay cheap, reports are weighted (7.11) | Bot floods and join spam, as with Kahoot's open PINs; sock-puppet reports | 01, 08 |
| 6 | Sealed ranked flow: `start_attempt` stores a per-attempt option shuffle and returns question one's stem. Each question's options are issued during its read beat, and server time for that question starts when they are issued. `submit_answer` stamps server time and returns the verdict, the explanation and the next stem without its options, so Continue shows the next stem from memory: under 100 ms from tap to stem, with no blocking round trip. Ladder arms issue one clue at a time on the same pattern | Answers leaking early (HQ's exposed data; the original Wordle's answer list in its JavaScript); explanation reading counting against the clock; a blocking round trip per question for players far from us-east-1 | 02, 06, 08 (refined: 08 returned the whole next question with the verdict) |
| 7 | Bounded latency allowance: ranked time is the server's measured interval, and the server accepts the client's own press time only when it is at most 400 ms faster | The database sits in us-east-1, so a player in Asia carries roughly 150 to 250 ms more round trip than one in Virginia [K] | 08 |
| 8 | The Daily by date: date D opens when UTC+14 reaches it and closes when UTC-12 leaves it, about 50 hours, so a UTC+14 player can finish it 26 hours before a UTC-12 player can start. The client sends its local date and the RPC validates it, and an attempt belongs to the date it started. The live percentile reads "so far today" and is computed within broad UTC-offset bands once each band has 50 finishers, using the global figure until then. We never publish answers while a Daily is open anywhere | Time-zone unfairness; the 11:59 pm start; answers circulating on social media and search before later regions play | 06, 08, gap 1 |
| 9 | Compact storage: one row per attempt with answers, times and honest-play flags packed into arrays, and per-question counters updated in place. Raw rows are pruned after 30 days | Free goes read-only at 500 MB. By our estimate a row per answer costs about 1.2 KB per Daily run with indexes, about 360 MB a month at 10,000 daily players; packing cuts that roughly fivefold | 08, our calculation |
| 10 | Live rooms (gated): database broadcast on `room:<128-bit id>` topics, never the join code. Payloads carry only room id, phase, version and server deadline, and clients refetch by RPC when the version moves. Poll every 3 s while the channel is down or a phase runs over 1 s late, every 15 s otherwise. Membership runs through join and heartbeat RPCs, not Presence. Rosters batch once a second. `worker: true` keeps heartbeats alive in background tabs (CSP `worker-src 'self' blob:`) | Realtime caps (200 connections, 100 messages a second, Presence at 20 a second); the 2M-message monthly quota; no JWT for private channels; HQ-style fan-out failures | 06, 08 |
| 11 | Room caps on Free: 20 players per room and about 150 live connections per project, with "room full" offering an async challenge. Move to Supabase Pro (500 connections, 500 messages a second) once weekly peaks pass 120 | One event to a 20-player room costs 21 messages, so a busy moment can hit the per-second cap | 06, 08 |
| 12 | Room fairness: the server deadline plus a 500 ms grace, and a rejoin into the same seat. When we fail, the question is voided with an on-screen notice | HQ's lag eliminations | 02, 08 |
| 13 | The rooms gate: a k6 load test of seven concurrent 20-player rooms from GitHub Actions, forced-disconnect and rejoin tests, polling-only play and void tests, before any realtime release (10.4). If database broadcast misbehaves, switch to Postgres Changes on a tiny signals table | Database broadcast is still public beta, on public topics anyone who learns one can join | 06, 08 |
| 14 | Stateless share pages at `/r/[code]`: metadata and the preview image come from the URL alone (Node runtime, one subset font, under 500 KB). Share links stay path-only, with no query string, fragment or UTM tag | Previews breaking when the database is paused or slow; WebKit's seven-day rule keys on link decoration (gap 2) | 08, gap 2 |
| 15 | Practice packs as hashed static JSON on Vercel's CDN, precached by a service worker that never caches ranked RPCs. Updates activate on a results screen, never mid-question | The offline requirement; Supabase egress (10 GB a month on Free) | constraints, 08 |
| 16 | A Serwist configurator-mode spike (`next build && serwist build`) in week one, with a small hand-written worker as the fallback | `@serwist/next` is a webpack plugin, and `@serwist/turbopack` exports a config that Cache Components rejects | 08 |
| 17 | Cache Components hygiene: no `proxy.ts`, no segment config exports, no `runtime = 'edge'` pasted from old examples, and no `Date.now()` or `Math.random()` in prerendered code. Quiz state is keyed by attempt id and saved after every answer, and timers rebuild from stored deadlines when a hidden route reappears | Build failures; state bugs when `<Activity>` hides and re-shows a route | 08 |
| 18 | Identity defense: mirror streaks server-side. When an identity is minted, a same-origin route sets a first-party backup cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, up to 400 days); on load with empty storage, `/api/restore` brings the identity back, answering same-origin requests only (checked with `Sec-Fetch-Site`). It needs no key, so it fits the constraints. Log `identity_restored` and `storage_lost`, which together measure real iOS deletion. Call `persist()` only in standalone mode. Offer the sync code after the third finished Daily in a browser, and show it before the iOS install pitch | WebKit deletes script-written storage, cookies set from script included, after about 30 days of browser use without a tap for most sites, or 7 after a tracker's decorated link; server-set cookies survive; `persist()` resolves false in a Safari tab (gap 2, read from WebKit's source; device test pending) | 08, gap 2 |
| 19 | Performance budget in CI: Lighthouse CI asserts LCP 2,000 ms, TBT 200 ms, CLS 0.05 and 150 KB of gzipped JS on `/`, on throttled mobile. The initial bundle uses only CSS transitions, `@starting-style`, WAAPI and View Transitions; confetti and any mascot load lazily | A slow first load breaks "seconds to the first question" | constraints, 05, 06 |
| 20 | Answer-tap INP: paint the selection in the same frame and defer scoring and effects with `startTransition`. Handlers stay under 50 ms on a throttled mid-range Android profile | Laggy taps feel unfair when speed scores | 05, 08 |
| 21 | First-party analytics only: events batch into a rate-limited `log_events` RPC shared with `onRequestError` and `window.onerror`; vitals arrive via `useReportWebVitals`; no analytics cookie is ever set (row 18's identity cookie is the only cookie, and it is functional); raw rows drop after 30 days | The privacy rule and its no-tracker promise; ad blockers eating third-party beacons | 06, 08 |
| 22 | Free-tier guardrails and backups: a daily GitHub Actions keepalive, and a nightly `supabase db dump` from GitHub Actions, encrypted before upload because our repo is public, using a connection string and key the owner adds as secrets. A restore drill loads the latest dump into a Postgres 17 service container and checks row counts and a streak recompute; one drill passes before the closed beta, then one a month. Alerts fire at 300 MB of data, 3 GB of monthly egress, 1M realtime messages, 120 peak connections and any missed dump. Supabase Pro when an alert fires twice in a month; Vercel Pro on the day payments or ads ship, or sooner if the owner's reading of the Hobby terms says so | Pausing after a quiet week; read-only mode; no downloadable backups on Free; Hobby is non-commercial [K]; report 06's anti-pattern of launching on Free "with no answer to pausing and no backup export" | 06, 08 |
| 23 | CI gates on every PR: unit and E2E tests (Playwright pinned at 1.63.0) in Chromium (Desktop Chrome and Pixel 7), WebKit (an iPhone profile) and Firefox projects. The GitHub Actions E2E job installs all three browsers; the sandbox keeps running Chromium only. Also an axe scan of every route with zero serious or critical findings, accessibility-tree snapshots, screenshot baselines generated in the CI image, and SQL tests against the real project from GitHub Actions. Real-iPhone Safari checks are a beta gate (10.5) | Regressions, accessibility drift and security holes reaching main; the primary persona's phone engine going untested, though many of our decisions are iOS-specific (storage eviction, Add to Home Screen, Web Share, the audio session, the missing vibration API) | 05, 06 |
| 24 | Honest-play flags: per answer, the client reports whether the page was hidden or the window lost focus between the options appearing and the answer, and the server stores the flags with the attempt. The server adds an Expert-slot check: a correct answer on the day's hardest item after a dwell far above that item's median flags the run (in ladder arms, a clue-1 solve of the hardest mystery). Flagged runs stay out of the percentile and crowd stats and go to review, never to a ban or a public label. A second device defeats every one of these checks, and the "How scoring works" page says plainly that solo play can't be policed (02) | Bots and lookup tools skewing the Daily percentile. The old rule flagged only runs implausibly fast for their accuracy, and a player searching in another tab is slow, so it never tripped | 02, 08, gap 3 |
| 25 | The secret-path spike: before launch, deploy one Edge Function that holds a secret (the Supabase MCP can set Edge Function secrets) and verifies a signed request, and exercise it end to end from a GitHub Actions job, since runners can reach Supabase and the sandbox can't. Web push to installed PWAs and payment webhooks both depend on it, and AI drafting would too. Decision 11's Plus trigger can't fire until it passes | Three roadmap items stuck behind an untested path; reading "avoid unless there is no SQL alternative" as a ban | constraints, 04 (open question 5), gap 2 |
| 26 | In-app browsers: detect them on share and challenge landings with the inapp-spy user-agent rules plus Telegram's object check ([inapp-spy](https://github.com/shalanah/inapp-spy)), and log the container. After the first finished Daily inside a WebView, offer one handoff: a claim URL (single-use, valid for 10 minutes, stored only as a hash) swapped into the address bar with `history.replaceState`, so the app's own "Open in browser" menu carries it. The claim gives the browser the same player id with a new secret, behind a confirm step. The sync code is the fallback. Never pitch install, push or a calendar file inside a WebView | WhatsApp, Instagram, Facebook, TikTok, Snapchat, LinkedIn, Telegram and Reddit's Android app open links in their own WebViews, whose storage is separate from the system browser's, so a player who starts in the group chat and later opens the site directly becomes two guest ids with a split streak | gap 2 |
| 27 | Source snapshots: a GitHub Actions job fetches cited pages the sandbox can't reach and stores each URL, its retrieval date and the quoted passage for checkers. The week-one spike tests it (7.1) | The allowlist blocks reference hosts (07), and the shared search budget runs out | 07, ours |

---

## 10. Success metrics and instrumentation

### 10.1 North star

**Weekly habit players:** unique players who finished the Daily on at least 3 of the last 7 days. It counts habit rather than traffic, and a quiet Sunday doesn't distort it.

### 10.2 Targets

Every retention number here is a hypothesis. The old targets (D1 35%, D7 15%, D30 6%) sat above the mobile top quartile of about 27% D1, and 15% D7 is the level report 02 says is "reached only by top projects". Report 02 adopted them while "assuming (unverified) that web retention trails installed apps", and gap 2 looked for a web baseline and found none. LinkedIn's 84% next-day return ([Social Media Today](https://www.socialmediatoday.com/news/linkedin-adds-zip-puzzle-game/742847/)) is no benchmark, and neither is Duolingo's record 84% current-user retention ([Pulse 2.0](https://pulse2.com/duolingo-daily-active-users-reach-58-7-million-as-retention-hits-record-84-and-social-accounts-top-1-billion-organic-impressions/), 04). Both measure returning players on a platform people already open every day, not a new player's day 1, so we set them only beside our continuation metric.

Cohorts are players who finish a first Daily, split by where that finish happened (gap 2). **Clean** means a system browser, an Android Custom Tab or the installed app; SFSafariViewController can't be told apart, so it counts as clean. **In-app** means a detected WebView. Day N is classic retention: the player answers at least one question on local calendar day N after that first finish. A new device, a second browser, an in-app browser or an evicted store each mints a fresh guest id, which biases measured web day-N retention downward: one returning person can count as two new players. Kill lines and gates read the clean cohort only, and only in weeks with at least 400 clean first finishers, which gives a 95% interval of about plus or minus 4.5 points at 30%. D1 is reported by first-Daily score band (0 to 3, 4 to 5, 6 to 7 and 8 to 10, rescaled for the winning format) beside the headline, and no reading against a kill line counts until two straight weeks of Dailies land within half a question of prediction (gap 3). "Ours" marks a starting hypothesis with no benchmark behind it. We revisit every number after four weeks of data.

| Metric | Target | Floor or kill line | Basis |
|---|---|---|---|
| D1 return, clean cohort | 30% (stretch 40%), a hypothesis | Candidate kill line: under 20% after two onboarding iterations. It stays on hold until a web baseline exists; until then, two qualifying weeks under 20% trigger a core-loop review, not a rework | gap 2; 02 (mobile median about 22%, top quartile about 27%, 31 to 33% on iOS; best trivia titles up to 48% in older data) |
| D7 return, clean | 12% (stretch 20%), a hypothesis | Under 5%: review the habit loop | gap 2; 02 (median about 4%; best trivia titles 15 to 25%) |
| D30 return, clean | 5% (stretch 8%), a hypothesis | Under 2% | gap 2; 02 (median D28 under 1%; top performers 6.5% in 2018) |
| Next-day continuation (finished yesterday, finishes today) | 70% (stretch 80%) | Under 55% | gap 2. LinkedIn's 84% is this kind of number, from an app with push |
| D1 return, in-app cohort | Report weekly | Below half of clean D1: fix the handoff, not the loop | gap 2 |
| In-app first finishers who use the claim link | 25% | Under 10% | gap 2 |
| Weekly habit players | Growing every week of beta | Flat for four weeks | ours |
| Landing to first answer | 60% | Under 40% | ours |
| Landing to question one on screen | p75 under 3 s | Over 4 s | 01 |
| First answer to finished round, new players | 80% | Under 65% | ours |
| Daily start to finish | 90% | Under 80% | ours; a short round with a visible end (05) |
| Daily session length | Median 3 to 5 min | Over 7 min signals friction | 01 (Wordle about 3 min, Connections about 5, both estimates) |
| Sessions ending on a stop or results screen | 80% | Under 65% | 03 |
| "I played longer than I meant to" (sampled one-question survey) | Under 10% | Over 20% | 03 |
| Daily finishers who complete a share | 20% (ours) | Set from the first two weeks of beta | 04's arithmetic is rough and Wordle is an outlier. A share is a completed share sheet or copy, never a button tap |
| Share landings that answer question one | 40% | Under 25% | ours |
| Challenge links opened that end in a finished run | 50% | Under 30% | ours |
| Daily finishers in at least one group | Report weekly | | ours |
| Players with three finished Dailies who save a code | 30% | | gap 2 |
| Free repairs per streak-day | Report weekly in beta | Rising week on week: check the cap | ours |
| Room players who host a room within 30 days | 5% | Under 2% | 04 (one in twenty, illustrative); tests the unproven host loop |
| Median players per room | 4 or more | | ours |
| Confirmed errors per practice item | Under 1% | Over 2%: stop publishing new practice items and re-audit | 7.6 (the seeded audit's bound, then reports) |
| Confirmed key errors in scheduled Dailies | Zero | Any one: an incident review of its check trail | ours |
| Median time from first report to void or fix, Daily items | Under 12 hours (ours) | Over 24 hours | ours |
| Live items with a report rate above 1% | Under 2% of items | | 06, 07 |
| Core Web Vitals, p75 | LCP under 2.0 s, INP under 200 ms, CLS under 0.05 | Google's "good" lines: 2.5 s, 200 ms, 0.1 | constraints, 06 |
| Room questions voided by our errors | Under 1% | Over 3% | 02 |

The old content target, "under 1 confirmed error per 1,000 answers", mixed units. Report 06's metric counted confirmed bad-question reports per 1,000 answers, but the audit bounds a per-item rate: zero errors in 300 means under about 1% of items. A per-answer rate is dominated by the Daily. One wrong Daily key at 10,000 players produces 10,000 wrong-keyed answers, which is 50 to 100 per 1,000 that day. Three metrics replace it: the per-item rate in practice, zero key errors in scheduled Dailies, and how fast a reported Daily item is voided or fixed.

### 10.3 Instrumentation

Derive what we can from server records (attempts, streaks, challenges, groups, rooms, quizzes and reports) and log only the rest from the client. Every event carries a random player id and no personal data, and no third-party script runs (constraints). Raw rows drop after 30 days; daily aggregates stay.

| Client event | Properties | What it answers |
|---|---|---|
| `landing_view` | entry (direct, share, challenge, room, search or installed app), context (browser, installed, in_app or unknown) and app | Traffic mix, share landings and the in-app share of them |
| `first_answer` | mode | Activation |
| `round_complete` | mode, format arm, score band | Completion |
| `results_view`, `stop_screen_view` | mode | Natural stops |
| `share_open`, `share_complete` | method (native or clipboard), mode; `share_complete` fires only when the share sheet resolves or the copy succeeds | Share rate, counted on completed shares |
| `challenge_open` | | The challenge funnel |
| `room_join`, `room_disconnect` | reason | Room reliability |
| `read_beat_skip` | question slot | Whether the beat earns its wait |
| `explanation_dwell` | seconds bucket, sampled | Whether explanations get read |
| `question_heart` | item id, mode | Fun per question |
| `sync_code_offer`, `sync_code_saved` | trigger, context | Exposure to storage loss |
| `claim_link_offer`, `claim_link_used` | app | The in-app handoff |
| `identity_restored`, `storage_lost` | source (cookie, sync code or claim), platform | Real storage deletion, by platform |
| `install_prompt_shown`, `install_accepted` | platform | PWA adoption |
| `calendar_add` | method (Google link or .ics) | Reminder uptake |
| `settings_change` | setting, value | Timer, sound, motion and contrast choices |
| `survey_answer` | question id, answer | Regret and fun |
| `web_vitals` | metric, value, route; sampled | Field performance |
| `client_error` | message hash, route | Stability |

Derived on the server: attempts started and finished, scores and times, honest-play flags, streak extensions, freezes spent, repairs per streak-day, challenges created and finished, group joins, rooms created and finished, quizzes published, reports filed and their weights, time from report to resolution, and day-N returns by cohort.

Report 07 asks how to measure fun per question. Our answer is four signals read together, compared between Daily and practice items: hearts on the explanation sheet, read-beat skips, explanation dwell and the question where a run is abandoned.

### 10.4 Pre-launch gates

Our agents build before any real player arrives, so retention can't gate the first deploy. These gates can, and each one can actually run in our environment, which has Chromium and no human testers. A gate that didn't run is reported as "not run", never as passed. Human-only checks move to the beta (10.5).

| Area | Gate |
|---|---|
| The Daily loop first | A playtested greybox of the Daily loop, which is the bake-off in 6.1, exists before rooms or the editor go past greybox |
| Playtests (simulated) | At least three RITE rounds of five persona agents each, drawn from a first-time casual player, a trivia buff, a host with eight friends, a screen-reader user, a player on a low-end Android phone over slow 4G and a non-US English speaker. Fix between rounds; the last round finds no P0 or P1 confusion (06). These are simulations, "persona agents now, people in beta" in report 06's words: they catch flow, copy and bug problems, not fun, difficulty or real screen-reader use |
| Content | The week-one spike has measured throughput and the bank is sized to it (7.1). Every item passes the rubric with both sources and quoted passages stored; every Daily item is checked twice; the dedupe check finds no near-duplicates; the error-seeded 300-item audit catches at least 95% of its planted errors and finds zero confirmed errors among the real items (7.6); estimator v0 reaches a rank correlation of 0.6 on the recall norms (7.10) |
| Accessibility (automated) | Zero serious or critical axe findings on every route; Playwright accessibility-tree snapshots for every screen; keyboard-only E2E through every Must mode; forced-colors and reduced-motion emulation; a 320 px viewport and text at 200%. Real assistive-tech passes move to the beta |
| Cross-browser | E2E passes in Chromium, WebKit and Firefox in GitHub Actions |
| Performance | Lighthouse CI budgets pass on throttled mobile, and the bundle check passes |
| Security | SQL tests pass (RLS on every table, no `anon`-executable function outside the allowlist, no answer key in any ranked payload before lock-in, rate limits enforced, report weighting applied); an adversarial audit tries replayed submissions, forged times, early answer fetches, sock-puppet reports and join floods |
| Reliability of the core | Daily date tests at UTC+14 and UTC-12; an outage test proves streaks are protected; E2E proves flagged runs stay out of the percentile |
| Data safety | The nightly encrypted dump runs and one restore drill passes before the closed beta, and in any case before any public beta |
| The secret path | The Edge Function spike passes from GitHub Actions, or its failure is logged with a new date. It never blocks the Daily; it blocks push and payments, and AI drafting after them |
| Rooms (their own gate) | A k6 test of seven concurrent 20-player rooms; forced disconnects and rejoins; play with realtime blocked so only polling works; void tests. Pass, and rooms ship under a Beta label; fail, and they move to 1.1 |
| The editor (its own gate) | The slur filter on every field and import; a report and complaints flow with response times; terms, a contact point and a short risk assessment; legal review before any quiz is shared. Pass, and the editor ships under a Beta label; fail, and it moves to 1.1 |
| Bugs | Zero open P0s; every P1 triaged with an owner |

### 10.5 After deploy: beta ladder and experiments

- **The ladder starts after handoff.** The owner, not the agent team, recruits beta players, so the ladder begins once the owner has the build and the release checklist (10.7).
- **Closed beta (06).** Invite-only, at least two weeks, with enough invites to reach 300 clean first-Daily finishers (likely 500 or more invites, our guess).
- **The gate to the public beta.** At least 300 clean first-Daily finishers, with the lower end of the 95% confidence interval for clean D1 at 20% or more, which at 300 finishers means about 75 back on day 1. A product whose true clean D1 is 30% passes about 98% of the time, one at 25% about half the time and one at 20% about 2% of the time (our calculation). The old gate, D1 of 35% or better among about 200 players, was close to a coin toss. At n = 200 the standard error is about 3.4 points (95% interval about plus or minus 6.6), so a product exactly at 35% failed half the time and one at 30% passed roughly 6 to 7% of the time. If the cohort falls short of 300, the closed beta runs longer; a smaller read is reported as directional, never as a pass. The gate also needs zero open P0s, p75 vitals inside budget, zero unresolved Daily key errors with median report-to-resolution under 12 hours, and a passed backup drill. And it needs the human checks that couldn't run before launch: VoiceOver and TalkBack through every Must mode, an NVDA pass and a JAWS spot check, real-iPhone Safari checks (storage, Add to Home Screen, Web Share and the audio session), and fun tests with real players.
- **Public beta.** Four weeks under a "Beta" label, then 1.0 on the same gates read on the larger cohort.
- **Experiment rules (06).** Detecting a move from 35% to 38% D1 needs about 4,040 new players per arm. Until a test can reach about 4,000 per arm, only A/B test changes expected to move a primary metric by 5 points or more, and ship smaller ones behind a flag with a 10% holdout. Pre-register one primary metric and two guardrails, and never stop early on a lucky day. Bucket players by a salted hash of their id.
- **What the beta tests.** At most two flags at once. First, the Daily format's runner-up, judged by gap 1's rule: keep the lead unless the runner-up's completed-share rate is at least 1.5 times higher with clean D1 no lower. Second, the difficulty dial, about 7 of 10 against 6 of 10, on clean D1 and completed-share rate. At beta scale both are directional reads. The read-beat test (skippable beat against none) queues behind them, and the share floor is set from the first two weeks.

### 10.6 Who owns which number

We mirror a small studio (06): four pods, each owning one metric, plus QA and accessibility as an enabling team. Every change gets a reviewer from outside its pod, and nothing gets polished before a playable greybox has been tested.

| Pod | Owns | Its number |
|---|---|---|
| Gameplay | The Daily, practice, formats and the room game loop | First-round completion |
| Content | The bank, the Daily schedule, the weekly content run, calibration and reports | Confirmed key errors in scheduled Dailies (target zero), with the practice error rate and report-to-resolution time as guardrails |
| Growth | Onboarding, sharing, challenges, groups and the in-app handoff | Clean D1 and completed-share rate |
| Platform | Backend, realtime, PWA, identity, backups, performance and security | p75 LCP and INP; realtime disconnects; backup freshness |

### 10.7 The owner's release checklist

Everything an agent can't do sits here, with the date it's needed, so the build itself stays autonomous and nothing in the core build waits on the owner.

| Owner task | Needed by | Why an agent can't do it |
|---|---|---|
| Add the database connection string and a backup encryption key as GitHub secrets | Before the closed beta | Credentials the agents don't hold |
| Recruit the closed beta (about 500 invites) and later the public beta | Closed beta | Agents can't recruit people |
| Run the weekly flag queue, and spot-check 50 random Daily items before 1.0 | Weekly from the closed beta | The human check the research asks for (02, 06, 07) |
| Own the scheduled weekly content run under the owner's account | Launch week | It has to outlive this build |
| Check the name, domain and trademarks, and buy the domain | Before DESIGN.md locks the logo | Purchases and legal judgment |
| Commission legal review: terms, privacy, the content policy, the DSA, Online Safety Act and Children's Code questions, the age floor and user-quiz sharing | Before any user quiz is shared, and before the public beta | Counsel |
| Read Vercel's Hobby terms, then approve plan upgrades (Vercel Pro, Supabase Pro) at their triggers | Before the public beta; at each trigger | Billing, and vercel.com is outside the allowlist |
| Open a payment-provider account and choose a merchant of record for VAT (04) | Before the week-8 pricing decision ships | Billing and identity checks |
| Lend an iPhone for Safari checks and WebKit's 30-day storage test (gap 2) | Closed beta | Hardware |
| Find assistive-tech testers (VoiceOver, TalkBack, NVDA, JAWS) and human fun testers | Closed beta | People |
| Fund the capped difficulty panel pilot, only if gap 3's trigger fires | On the trigger | Account and payment |
| Add webkit.org, support.google.com and vercel.com to the session allowlist, if possible | Any time | Session settings; it would settle several verification items fast |
| Supply a model API key, if AI drafting ever ships | 1.1 or later | Billing |

---

## 11. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation | Early warning |
|---|---|---|---|---|
| Web retention trails app benchmarks, and guest-id churn makes it read lower still | High | High | Clean-cohort hypotheses (10.2), calendar reminders, an install pitch after the third Daily, the backup cookie, claim links, sync codes and server-mirrored streaks | Clean D1 under 20% for two qualifying weeks, which triggers a core-loop review until a web baseline exists |
| The Daily's format gives players nothing to talk about | Medium | High | The four-arm bake-off (6.1), the runner-up behind a beta flag, and shares counted only when completed | Completed-share rate under the floor set in beta week two |
| In-app browsers split one player into two guest ids | High | Medium | Detection on share and challenge landings, a claim link and the sync code at the first in-app finish, the "open in your browser to keep your streak" hint, and no install or push pitch inside WebViews (section 9, row 26) | In-app D1 below half of clean D1; claim-link use under 10% |
| Nobody runs content operations after launch | High | High | 120 Dailies' worth plus 30 spare days at launch (about 150 days of runway), the scheduled weekly content run feeding the owner's queue, auto-assembly from the spare days, retirement by `review_by` and weighted report rules | Runway under 30 days |
| Content throughput can't fill the bank | High | High | The week-one spike sizes the bank to measured throughput; the GitHub Actions snapshot job; cheaper Daily arms; a smaller practice pool, never a weaker two-source rule | Spike throughput below what the launch date needs |
| Errors slip into an AI-drafted bank, and agent checkers miss the same ones | Medium | High | Acceptance only on stored quoted passages, audits seeded with planted errors and void below 95% caught, two checks per Daily item, voids only after a re-check, and the owner's 50-item spot check | Practice error rate over 1%; any Daily key error |
| Difficulty misses before any player data exists | High | Medium | Estimator v0 benchmarked on recall norms, buffered windows, an easy-leaning first week, weekly re-tunes and alarms (7.4, 7.10) | A Daily mean more than 1.0 question from prediction; an Easy item under 65% |
| AI lookups skew the Daily percentile | High | Low to medium | Nothing to win, a percentile instead of a rank, no top-N list, visibility and blur flags, the Expert-slot check, an estimation encore and plain disclosure. A second device still defeats it | Once the hardest item has 100 eligible answers, flagged runs get it right at least twice as often as unflagged runs |
| Spoilers spread during the 50-hour window | Medium | Medium | Spoiler-free shares, the "so far today" label, percentiles by broad UTC-offset band, and no answers from us while a Daily is open anywhere | Late-band accuracy above early-band accuracy on the same Daily |
| The Daily feels bland on global, non-volatile items | Medium | Medium | The mix rule (two Film & TV, Music or Food & Drink items and two counterintuitive items), monthly themed packs and per-question hearts | Hearts and dwell on Daily items below practice items' |
| Cold start: thin percentiles, empty groups, few rooms | High | Medium | Thresholds before percentiles show, solo value first, no leagues, groups small by design | Under 50 finishers per Daily |
| Supabase Free limits during a spike | Medium | High | Compact storage, CDN packs, stateless share pages, alerts, room caps with an async fallback and written upgrade triggers | Any alert in section 9, row 22 |
| Data loss, with no downloadable backups on Free | Low | High | The encrypted nightly dump, plus a restore drill before the closed beta and monthly after (section 9, row 22) | A missed dump or a failed drill |
| Realtime instability (beta database broadcast, public topics) | Medium | Medium | Rooms gated, a polling fallback, the k6 test, a signals-table fallback, the void rule and async challenges | Voided questions over 1% |
| Legal duties for hosting user quizzes (DSA, UK Online Safety Act) and for teenage players (UK Children's Code) | Medium | High | No sharing until legal review; a self-declared 18+ to publish; a report and complaints flow with response times; terms, a contact point and a risk assessment; an age band wired to the minors switch | Legal review not booked when the editor reaches its gate; reports per shared quiz |
| Under-13s play despite the 13+ terms | Medium | Medium | No personal data, no chat, generated names, no public ranking, no behavioral ads; legal review before any classroom mode | |
| Streak mechanics draw regulatory or player backlash as "addictive design" | Low to medium | Medium | Forgiving design, capped repair, no guilt, no sold protection, natural stops and the minors switch; re-read the DFA proposal when it is published, expected around November 2026 (03) | DFA text |
| Novelty fades after the first month | Medium | High | Four formats, monthly packs, the January fresh-start season and the Should/Could roadmap | D30 trend; share rate decaying |
| Scope sprawl dilutes quality | Medium | High | Only the solo core and Groups block launch; rooms and the editor are gated; greybox and playtest before polish; metric-owning pods; reviewers from outside the pod | Must items slipping |
| The Edge Function secret path fails or slips | Medium | Medium | The spike runs before launch; pricing is decided by week 8 regardless; calendar reminders cover the daily nudge | Spike not green by launch |
| Owner-only steps stall the beta | Medium | High | One release checklist with dates (10.7); nothing in the core build waits on the owner | Any checklist item past its date |
| Commercial use on Vercel Hobby by accident | Low | Medium | No payments or ads until Vercel Pro; the owner reads the Hobby terms before the public beta | Any revenue feature flag |
| Latency penalizes distant players | Medium | Low | Accuracy-first async scoring and the bounded latency allowance; room players usually share a location | Regional gaps in tiebreak wins |
| Next.js 16 Cache Components pitfalls break builds or timers | Medium | Medium | The hygiene rules in section 9, row 17; build and E2E on every PR | Build failures |
| iOS Safari wipes guest progress | Medium for non-installed iPhones (about 30 days of use without a tap, per WebKit's source) | Medium | The backup cookie, the sync code, server-mirrored streaks and an install pitch; `persist()` only once installed | `storage_lost` events on iOS |
| The chosen name collides with a trademark | Medium | Medium | Trademark and domain checks before the logo is locked (10.7) | |

---

## 12. Open decisions, with recommended answers

| # | Decision | Recommended answer | Why | Revisit when |
|---|---|---|---|---|
| 1 | Which wedge leads? | The Daily, with sharing, challenges and Groups around it. Host rooms and the editor follow behind a Beta label once they pass their gates | Small-group comparison is the strongest social retention evidence (04), while the adult host loop is unproven, since Kahoot spread through schools (01). Rooms and the editor also carry beta-realtime and user-content risk (06, 08) | After four weeks of beta data |
| 2 | How is the Daily scored, and is it timed? | Points (correct answers, or clue points in a ladder arm), then the encore's error, then total time. A hideable stopwatch, no countdown | Reports 02 and 07 want short timers so lookups cost time; we chose accessibility. An untimed Daily needs no WCAG 2.2.1 exception, lowers anxiety (03), resists latency (08) and stays competitive through the encore tiebreak. With nothing at stake, a looked-up answer wins nothing. Honest-play flags keep suspect runs out of the percentile; a second device still beats them, and we say so | If players ask for speed, test a separate "Daily Blitz" |
| 3 | What format and length is the Daily? | Provisional. Four greybox arms (6.1): the current ten questions, a short set with a clue-ladder signature, a single puzzle, and gap 1's three mysteries. Gap 1's evidence points to three mysteries, with the short set as the hedge | No report surveyed direct competitors until gap 1, whose survey points away from ten multiple-choice questions; content cost runs from 730 to 3,650 sealed items a year (01, gap 1) | After the bake-off, and again after the beta flag |
| 4 | Sound on or off by default? | Off on phones, on for the host screen | Players are often in public; rooms want atmosphere (03, 05) | A/B "on at low volume after the first tap" once traffic allows |
| 5 | Who is it for, by age? | 13+ to play, for a general audience. No classroom mode in v1. A self-declared 18+ to publish a quiz. A self-declared age band, asked only when it first matters (publishing, joining a group or adding a reminder), switches on report 03's minors switch: no streak reminders or nudges beyond the counter, and generated nicknames in place of free text | COPPA and school-privacy duties (01, 04). Teenagers from 13 to 17 bring in the UK Children's Code, which governs nudges, and streaks are nudges (03). Hosting duties attach to user quizzes (06 [K]) | After legal review |
| 6 | How big can rooms get? | 20 players on Free, 50 after Supabase Pro | Connection and message caps (06, 08) | Weekly peaks over 120 connections |
| 7 | Can user quizzes be shared? | Not until legal review clears it. Then unlisted links, challenges and rooms only, with no gallery | Report 06 attaches DSA notice-and-action and Online Safety Act risk-assessment duties to hosting user quizzes at all [K, needs legal review], and v1's links and rooms already let one user's quiz reach others | After legal review; a gallery also waits for a moderation pipeline |
| 8 | AI generation in the editor? | Not in v1, by choice. Bulk import lets hosts bring their own AI drafts | A model key needs an Edge Function secret, which the constraints allow where SQL has no alternative but which we haven't tested; AI errors would dent trust (02, medical exam studies) | When the secret-path spike passes, with an "AI-assisted" label |
| 9 | How do we remind players? | A calendar reminder now: Google's template link on Android and desktop Chrome, an .ics file on Apple devices, never inside an in-app browser. Web push later, only inside the installed app after a finished Daily, at most one a day, stopping after three are ignored | Signing push needs an Edge Function secret, an available but untested path, and iOS pushes only to installed apps, a small group at first (04, gap 2) | When installed weekly players reach 10% of weekly habit players or 1,000, and the spike passes in CI |
| 10 | What leaderboards exist? | Everyone gets a percentile ("so far today") and a score chart, and names appear only on group boards. No top-N list and no all-time board | Top lists reward cheaters; the N-effect (02, 03) | Leagues when cohorts fill within a day |
| 11 | When and how do we charge? | Plus switches on when clean D7 holds at its 12% target for four weeks. Whatever D7 shows, we decide pricing by week 8 after real players arrive. Test $3.99 a month against $29.99 a year, as hypotheses rather than benchmarks | A trigger tied to a D7 the web may never reach would repeat QuizUp's failure to monetise (02). Payments need a webhook secret in an Edge Function (04, open question 5), so the trigger can't fire until the spike passes, and Vercel Pro must be in place | At the trigger, or at week 8 |
| 12 | What happens to the archive? | The last 7 days stay free forever; a deeper archive can be a Plus perk. Nothing free is ever taken away. No public answer pages for past Dailies in v1 | Repair needs a free archive, and a paid archive helps fund Krillion (01, 04). Answer pages would publish the sealed past Dailies that room and challenge packs reuse (gap 1) | When Plus launches; answer pages once players search for them |
| 13 | Do we say AI helped write the questions? | Yes, plainly on the About page: questions are drafted with AI assistance and accepted only on cited sources. Never market the product as AI | Duolingo's "AI-first" backlash (01); honesty protects trust | |
| 14 | Where is the human in the loop? | The owner works a weekly queue fed by the scheduled content run, and spot-checks 50 random Daily items before 1.0 | The research asks for human verification (02, 06, 07) | After 1.0, based on report rates |
| 15 | Three or four options in ranked play? | Four by default, three allowed when a fourth would be filler | Three good options beat four with a filler [K] (07) | Test in beta |
| 16 | Free tiers at launch? | Yes, with the guardrails and upgrade triggers in section 9, row 22, and a tested nightly backup with a restore drill before real players arrive | The constraints assume free tiers, and report 06 names launching on Free with no backup export as an anti-pattern (06, 08) | When an alert fires twice in a month |
| 17 | What do we call it? | A short, ownable name that isn't "Quiz" or "Trivia" plus a noun, checked against trademarks and domains before DESIGN.md locks the logo | A generic name can't be searched or defended | Before the design system is final |
| 18 | What does a challenge link replay? | A sealed set scored on the server: the challenger's Daily (today's while it is open for the friend, the archive copy after) or a themed pack from past Dailies. Never a practice run | Practice answers ship to the client, so a practice head-to-head can't be trusted | If players ask for practice challenges, as an unranked "friendly" mode |
| 19 | Where do room questions come from? | Themed packs built from past Dailies once their window closes, plus user quizzes stored on the server once sharing clears legal review | Constraint 4 needs a sealed pool for live play, and past Dailies are already double-checked, sealed and calibrated by play | When the content run can write room-only packs |
| 20 | Is free streak repair capped? | Yes: one per rolling 7 days, separate from freezes | Uncapped repair turns a daily streak into a 48-hour window and makes freezes nearly redundant; the research measured a softer drop when repair exists, not a need for unlimited repair (03) | Beta data on repairs per streak-day |
| 21 | How hard is the Daily? | About 7 of 10 for a typical player, tested against 6 of 10 in beta | The Daily sits in report 03's calm lane, the persona wants calm games, the share leads with the score, and the estimator's bias is unknown (gap 3) | After the beta's directional read |

---

## Appendix A. Where the reports disagreed, and what we chose

| Topic | What the reports said | Our call | Why |
|---|---|---|---|
| Daily format and length | Ten questions (02, 03, 05, 07) against seven (01); three clue-ladder mysteries plus an encore (gap 1) | Provisional: a four-arm greybox bake-off (6.1), with the runner-up behind a beta flag; about 3 minutes in every arm | Gap 1's survey points away from ten multiple-choice questions, but search was down, so the bake-off has to measure what the reports couldn't |
| Lookup resistance against an untimed Daily | 10 to 20 second timers with speed scoring "make lookups costly" (02, implication 3); ranked pools should favor estimation and image items "under short timers" (07, implication 17); WCAG 2.2.1 and calm play favor no countdown (03, 05) | No countdown in the Daily. Lookups are met by no stakes, a percentile, an estimation encore, honest-play flags and plain disclosure | Accessibility wins: everyone must be able to finish the Daily, and with nothing at stake a looked-up answer wins nothing. Client flags can't stop a second device, so we say plainly that solo play can't be policed (02), and principle 7 no longer claims more than the server can enforce |
| Daily scoring | A speed percentile (01); speed-weighted points (03); accuracy with time as tiebreaker (05's open question) | Points, then the encore's error, then time | Needs no WCAG 2.2.1 exception, lowers anxiety, resists latency and stays competitive |
| Daily difficulty | 3 Easy, 4 Medium, 2 Hard and 1 Expert, opening easy, in measured bands (07); a peak at question 8 and an encore (03); seeded estimates in buffered windows (gap 3) | 4 Easy, 3 Medium, Expert at 8, Medium at 9 and a closest-number encore at 10, in wide bands assembled from predicted rates and re-tuned weekly | Launch difficulty is unmeasured, and before data only the ends and the total can be steered (gap 3) |
| Typical score | 55 to 70% for ranked play (03, implication 6), which the old 6/10 target cited; but the Daily sits in 03's calm lane (implication 30), where casual modes target 75 to 85% | About 7 of 10, tested against 6 of 10 in beta on clean D1 and completed-share rate | The calm persona (5.1), report 03's own calm-lane target, a share that leads with the score, and an estimator whose bias is unknown (gap 3) |
| Test-solvers | Five or more before an item enters the Daily, setting measured bands (07) | Test-solves check ambiguity and wrong keys only; difficulty comes from estimates, then play | AI solvers sit at the ceiling (gap 3), and five human solves would still leave about plus or minus 40 points (our calculation) |
| Speed points | Linear decay to zero, capped at 30% of the value (03); full points for the first 40% of the timer, then half (08) | Linear decay in rooms plus the latency allowance; no speed points in async modes | Banding doesn't shrink the expected latency penalty, it only piles it onto the band edges (our analysis) |
| Streak repair | 24 hours (01); 48 hours by playing two rounds (03); 48 hours by playing the missed Daily (04) | 48 hours, by playing the missed Daily from the archive, at most once per rolling 7 days | Ties the repair to what was missed, and repairability softens the drop (Silverman and Barasch, 03); the cap stops a daily streak from becoming a 48-hour window |
| Freezes | One automatic freeze a week (02); one per 7 days played, hold two (03, 04) | One per 7 Dailies finished, hold two, spent automatically | Duolingo's two-freeze test |
| Midnight grace | "A few hours of grace after midnight" (03) | An attempt counts for the date it started; repair covers the rest | Simpler, and nothing is ambiguous |
| Room size | About 20 (04, 08) against 50 (06) | 20 on Free, 50 after Supabase Pro | The message math in 06 and 08 |
| Global board | "Today's top 50" from a cached route (08) against a percentile, not a rank (03) | A percentile labelled "so far today" and a score chart, no top-N list | Top lists reward cheaters; the N-effect |
| Timer defaults | Off in solo practice (05); Accuracy mode by default in solo (03); 20 s Standard (03) | Practice: no clock. Daily and challenges: a hideable stopwatch. Rooms: a 20 s countdown by default, adjustable from 10 to 60 s, or Off with the host advancing | WCAG 2.2.1. W3C ranks switching a limit off as the most helpful fix (05), and rooms only "likely" qualify as real-time (03) |
| Reminders | An in-context web push ask after the first Daily (04); no push in v1, installed or not (gap 2) | A calendar reminder in v1; push for installed players once they reach 10% of weekly habit players or 1,000 and the secret path passes CI | Push needs an Edge Function secret, available but untested, and the installed cohort starts small |
| Ignored-reminder cutoff | 3 (03) against 4 (04) | 3, once push ships | More conservative, given Chrome's auto-revocation |
| Archive | A paid archive as a premium perk (01) against free repair through the archive (04); free answer pages for past Dailies (gap 1) | The last 7 days free forever; a deeper archive can be a Plus perk; no answer pages in v1 | Never take back something that was free. Answer pages would publish the sealed past Dailies that room and challenge packs reuse |
| Retention targets | D1 35%, D7 15%, D30 6%, set while "assuming (unverified) that web retention trails installed apps" (02); clean-cohort D1 30%, D7 12% and D30 5%, plus 70% continuation (gap 2) | Gap 2's numbers, as hypotheses read on the clean cohort, with the kill line on hold until a web baseline exists | The old targets sat above the mobile top quartile, and nobody found a web baseline |
| Sync-code timing | At a 2-day streak (08) against after the third finished Daily, or at once inside an in-app browser (gap 2) | Gap 2's timing, behind a silent backup cookie | Safari's window is about 30 days of use for most sites, while in-app browsers lose the identity on the first hop |
| Report thresholds | Auto-pull past a threshold (02); editor review above 1% of plays (06); pull above 2% of plays, or at 3 distinct reports (07) | Practice: 3 weighted reports pull the item. Daily: 3 reports page the editor, and weighted reports from 2% of that day's players (at least 10) raise an alert; a void follows only a re-check of the stored passages. Any item over 1% goes to review | Free guest identities make raw counts gameable, and misconception items draw confident wrong reports |
| Next question in ranked play | Returned with the previous verdict (08) | The next stem rides with the verdict; options are issued during the read beat, and server time starts when they are | A fast transition for distant players, and explanation reading never counts against the clock |
| Achievements at launch | About 40 (04) | About 30, as a starting value | Fewer, better badges, per 04's own warning about badge inflation |
| AI drafting for creators | "AI drafts, humans publish" for creators (01) | Not in v1, by choice; bulk import lets hosts bring their own drafts | No tested secret path yet, and AI errors would dent trust |
| Room growth loop | "Players become hosts" (01, reading Kahoot's investor deck) against Kahoot, Blooket and Gimkit spreading teacher to teacher in schools (01) | Rooms are a gated second pillar, and Groups carry social play at launch | The adult host loop is unproven |
| An offline Daily | Every single-player mode offline (constraints) against a sealed, server-validated Daily (constraints) | The Daily needs a connection; practice works offline and is labelled as not today's Daily; freezes cover days without signal. Explicit CTO sign-off requested (section 9) | Answer secrecy wins for the one ranked solo mode |
| Bank size | At least 3,000 verified (02); 3,650 Daily items a year (07); 30 Dailies before launch (06) | Set by the week-one spike: 120 Dailies' worth plus 30 spare days first, then 2,000 practice items (1,500 floor) | The front door comes first and throughput sets volume; the two-source rule never shrinks |

---

## Revision notes

*31 October 2026. This revision applies the product director's 32 corrections and folds in gaps 1 to 3.*

- **Header:** five decision-driving unverified claims, each with an owner and a deadline, and a plain note that tracks 05 to 08 and the gap tracks ran no web searches, so many of the 468 URLs were never opened.
- **Section 1:** HQ's 92% now reads as new downloads in the first half of 2019, year over year. "Why we can win" answers the lookup threat with design and treats trust as hygiene. Rooms and the editor sit behind a Beta gate, and retention targets are clean-cohort hypotheses.
- **Section 2:** curiosity gaps drop from A to B and swap places with feedback, and grade B now covers unconfirmed lab work. The 75 to 85% band leaves #2's A. #1 notes the learning-goal transfer risk, #5 adds gap 1's competitor survey without LinkedIn's 84%, and #6 and #14 restore the caveats from 04 and 02.
- **Sections 3 and 4:** principle 4 uses three content metrics, principle 5 caps repair, principle 7 covers only what the server can enforce, principle 9's pre-launch test is one we can run, and principle 10 adds WebKit and Firefox.
- **Section 5:** the host persona drops "Kahoot proved that players become hosts". Positioning leads with Instant and Together, with Trust last until a beta test says otherwise. Direct competitors join the differentiation table, and in-app browsers and WebKit's 30-day rule join the web trade-offs.
- **Section 6:** only the solo core and Groups block launch; rooms and the editor are gated. The Daily's format is provisional, with a four-arm bake-off and content costs. Groups move to Must, Friend streaks lead 1.1, repair is capped and challenges replay sealed sets only. Rooms get "Off: host advances" and a named question source. Bulk import and a legal minimum are Musts for the editor. Starting-value caveats are back, push and AI generation are framed as choices, and answer pages for past Dailies wait.
- **Section 7:** a week-one throughput spike sizes the bank, with launch effort on the front door and a scheduled weekly content run behind it; the runway alert moves to 30 days. Difficulty is seeded and unmeasured, with wide bands, gap 3's estimator, buffered windows and weekly re-tunes, and a typical score near 7 of 10. A mix rule fights blandness. Audits are seeded with planted errors, acceptance rests on stored passages, reports are weighted and Daily voids wait for a re-check.
- **Section 8:** a skippable read beat with a 100 ms transition budget, a "so far today" percentile, format-dependent share text and honest offline copy.
- **Section 9:** the constraints are restated accurately, with CTO sign-off requested for the online-only Daily. New rows cover the secret-path spike, in-app browsers and source snapshots. Honest-play flags replace the speed-only check, WebKit and Firefox join CI, backups gain encryption and a restore drill, and identity gains a server-set backup cookie.
- **Section 10:** clean-cohort retention hypotheses with the kill line on hold, an own share target counted on completed shares, three content metrics, a beta gate on 300 clean finishers and a lower confidence bound that starts after handoff, honestly labelled pre-launch gates, and a new owner release checklist (10.7).
- **Sections 11 and 12:** new risks for the format, in-app browsers, throughput, difficulty, spoilers, blandness, data loss, legal duties, the secret path and owner bandwidth, with a measured lookup warning. Decisions 1 to 3, 5, 7 to 12, 14 and 16 are updated, and 18 to 21 are new.
- **Appendix A:** new rows for the format, lookup resistance, typical score, test-solvers, retention targets, sync-code timing and the room growth loop, plus updates to repair, timers, reminders, the archive, report thresholds, the next-question flow, the offline Daily and bank size.
