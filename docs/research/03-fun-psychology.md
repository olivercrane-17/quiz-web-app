# 03. The psychology of fun and habit in quiz games

Researched 2026-10-31 with 56 web searches, mostly via abstracts and publisher pages, so effect sizes appear only where a source gave them. Tags: **[E]** peer-reviewed study or meta-analysis, **[F]** company-reported, **[P]** press, legal or standards body, **[S]** secondary or low confidence. *Our read* marks interpretation. The search budget ran out before we could check Nir Eyal's Hook model, so it is left out.

## Summary

- **The core pleasure is a gap you can close.** Curiosity peaks when people think they know an answer but aren't sure, and curious players remember surprising answers weeks later [E]. Every question should be guessable.
- **Answering is learning, even when wrong.** Testing beats restudying, and failed attempts help when feedback follows [E]. Confident errors get fixed most often.
- **Match difficulty lightly.** Objective balance changes how balanced a game feels more than how people play it [E]. Elo ratings can hold a target success rate.
- **Points raise output, not motivation.** Felt competence and autonomy predict enjoyment and return play [E].
- **Streaks are strong and brittle.** People drift away after a break unless they can repair it [E], while Duolingo reports retention gains of up to 14% from streak features [F]. Forgiveness has to ship on day one.
- **Comparison works in small groups of peers.** Competitive drive falls as the field grows, and the bottom of a big board stings [E].
- **Timers bring tension and anxiety together.** Over a quarter of surveyed students felt anxious under Kahoot's limits [E], and WCAG 2.2.1 requires adjustable timing outside real-time play [P].
- **Juice works when it marks real success.** Overloaded feedback can lower felt competence [E, early].
- **The ethics line is turning into law.** Epic paid $245M in FTC refunds over dark patterns, and an EU proposal due in late 2026 targets gamified rewards [P]. Wordle grew huge with a one-a-day cap.

## Detailed findings

### Curiosity and the pleasure of a surprising answer

Loewenstein's information-gap theory treats curiosity as a felt deprivation that appears when you notice a hole in what you know. It needs some prior knowledge, and closeable gaps work best ([review](https://stafforini.com/works/loewenstein-1994-psychology-curiosity-review/), [Nautilus](https://nautil.us/curiosity-depends-on-what-you-already-know-235803)). In Kang and colleagues' fMRI study of 19 students, curiosity about trivia questions tracked activity in the caudate, a reward-anticipation region, and curious participants spent scarce tokens or waiting time to see answers ([PubMed](https://pubmed.ncbi.nlm.nih.gov/19619181/)) [E]. They also recalled surprising answers better one to two weeks later. Curiosity even boosted memory for unrelated material shown during the wait ([Gruber, Gelman and Ranganath](https://pmc.ncbi.nlm.nih.gov/articles/PMC4252494/)) [E]. In Wade and Kidd's study of 87 adults, curiosity followed people's estimate of their own knowledge more than their real knowledge, though its independent effect on learning was small ([paper](https://www.kiddlab.com/_files/ugd/0975fd_fe8691bfabc3409b96b14d668cc6bf39.pdf)) [E]. It peaks, Kidd says, "when you think you know something and discover you don't" ([Berkeley News](https://news.berkeley.edu/2019/05/23/curiositystudy)).

Surprise needs a prediction to land. Predicting before seeing an outcome improved learning in Brod, Hasselhorn and Bunge's experiments, and pupil-measured surprise appeared only after a prediction ([record](https://www.fachportal-paedagogik.de/literatur/vollanzeige.html?FId=A34255)) [E]. Dopamine neurons likewise fire for unpredicted rewards and go quiet for predicted ones ([Schultz, Dayan and Montague](https://www.gatsby.ucl.ac.uk/~dayan/papers/sdm97.html)) [E]. In Silvia's appraisal theory, interest needs novelty plus a sense that you can make sense of it; novelty you can't parse becomes confusion ([Silvia and Kashdan](https://mason.gmu.edu/~tkashdan/publications/silvia%20kashdan%20compass%202009.pdf)) [E]. *Our read:* the "wait, really?" moment needs a committed guess before the reveal and a short explanation after.

### Challenge, skill and flow

Flow theory predicts boredom when challenge sits below skill and frustration when it sits far above ([Game Developer](https://www.gamedeveloper.com/design/gamification-dynamics-flow-and-art)), and a shooter experiment supports the broad idea ([PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5954478/)) [E]. A 2023 study found that objectively matching difficulty to skill changed how balanced a game felt but not how people behaved; the authors point instead to player appraisals and a sense of progress ([ACM 2023](https://unpaywall.org/10.1145%2F3611065)) [E]. Oudeyer and colleagues likewise argue that curiosity pulls learners toward activities where they are making the most progress ([chapter](https://emerald.com/insight/content/doi/10.1108/S0749-742320160000019017)) [E]. Wilson and colleagues' "85% rule" finds that, in models of simple right-or-wrong tasks, training near 85% accuracy learns fastest, though the lead author warns against stretching it ([Nature Communications](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579), [Neuroscience News](https://neurosciencenews.com/learning-optimized-15171/)) [E]. Jenova Chen's *flOw* thesis argued for player-steered difficulty over hidden adjustment ([Wikipedia](https://en.wikipedia.org/wiki/Jenova_Chen)) [S].

Pelánek's Elo approach treats each answer as a match between player and question, estimating both live with a simple update that tracks heavier methods well ([Pelánek 2016](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf)) [E]. A 2025 analysis warns that the ratings are biased and context-dependent ([Bolsinova et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC12784335/)) [E].

### Needs over points: self-determination theory

Across four studies, Ryan, Rigby and Przybylski found that felt autonomy and competence predicted enjoyment and future play, with relatedness mattering in multiplayer games ([paper](https://www.rochester.edu/warner/lida/wp-content/uploads/2022/11/02bfe513dd59366750000000.pdf)) [E]. Points are a weaker lever. In Mekler and colleagues' experiment, points raised output and levels and leaderboards raised it more, yet none changed felt competence or intrinsic motivation ([paper](https://glassmanlab.seas.harvard.edu/annotated_works/mekler17.pdf)) [E]. A meta-analysis of 128 studies found that tangible rewards substantially undermine intrinsic motivation ([Deci, Koestner and Ryan](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf)) [E, disputed by Cameron and Pierce]. Sailer and Homner found gamification's learning effects held up in rigorous studies while motivational effects were shakier, with game fiction and social interaction as moderators ([PDF](https://opus.bibliothek.uni-augsburg.de/opus4/files/109056/109056.pdf)) [E].

### Quizzing as learning

Roediger and Karpicke found that testing beat restudying at two days and one week, though restudying looked better after five minutes ([PDF](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf)) [E]. Repeated retrieval is the active ingredient ([Karpicke and Roediger](https://profiles.wustl.edu/en/publications/repeated-retrieval-during-learning-is-the-key-to-long-term-retent/)) [E]. Being wrong first is fine. Failed retrieval attempts improved later learning when the answer followed ([Kornell, Hays and Bjork](https://pubmed.ncbi.nlm.nih.gov/19586265/)) [E], though not in every condition ([Knight et al.](https://amalab.uta.edu/files/2021/12/knight-2012-2.pdf)) [E]. High-confidence errors are the likeliest to be corrected after feedback (the hypercorrection effect), probably because surprise grabs attention ([Learning Scientists](https://learningscientists.org/blog/2023/8/3-1)) [E]; a preprint suggests the effect weakens for trick questions ([Southampton](https://eprints.soton.ac.uk/412186/1/Beyond_Hypercorrection_manuscipt_R2_Final.docx)) [S]. Bjork's "desirable difficulties" (spacing, interleaving topics, generating answers, testing) feel harder but last longer, and help only when the learner can succeed ([Bjork and Linn](https://sites.lifesci.ucla.edu/psych-bjorklab/wp-content/uploads/sites/13/2016/07/RBjork_Linn_2006.pdf)) [E]. Duolingo's spaced-review model roughly halved prediction error versus the Leitner system and lifted engagement 12% ([Duolingo](https://blog.duolingo.com/how-we-learn-how-you-learn), [VentureBeat](https://venturebeat.com/ai/how-duolingo-is-using-ai-to-humanize-virtual-language-lessons)) [F].

### Near-misses and variable rewards

Slot-machine near-misses activated win-related reward regions in 15 healthy volunteers, who disliked them yet wanted to keep playing ([Clark et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC2658737/)) [E]. Skill games show it too: among 60 avid Candy Crush players, near-misses were the most frustrating outcome and produced the strongest urge to continue, which the authors tied to playing longer than intended ([Larche et al.](https://link.springer.com/article/10.1007/s10899-016-9633-7)) [E]. Variable-ratio rewards appeared in 85% of sampled top-grossing mobile games ([DiGRA 2025](https://dl.digra.org/index.php/dl/article/download/2764/2748/2808)) [E], and loot box spending is consistently linked to problem gambling, with causation unproven ([review](https://rozprawyspoleczne.edu.pl/Loot-boxes-gambling-like-mechanisms-hidden-in-digital-games-A-narrative-review-of,216647,0,1.html)) [E]. *Our read:* a quiz already has an honest variable reward, since nobody knows which question will delight them next. Random payouts on top add risk and little fun.

### Streaks and loss aversion

A 2024 meta-analysis of 607 estimates puts the average loss aversion coefficient near 1.96, so losses weigh about twice as much as equal gains ([JEL](https://www.aeaweb.org/doi/10.1257/jel.20221698)) [E], though a 2025 re-analysis disputes its robustness ([JEP](https://ideas.repec.org/a/eee/joepsy/v107y2025ics0167487025000133.html)) [E]. Streaks put that asymmetry to work. Across seven studies, Silverman and Barasch found that logs highlighting intact streaks drove more later engagement than logs showing broken ones, whatever people had actually done ([CU Boulder](https://www.colorado.edu/business/news/2023/04/20/research-streaks-marketing-tech-barasch)) [E]. The drop was worse when people blamed themselves and smaller when a streak could be repaired.

Duolingo shows the upside. A Streak Wager lifted day-7 retention by 14%, and separating the streak from the daily goal lifted day-14 retention by 3.3% ([Duolingo](https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals), [Duolingo](https://blog.duolingo.com/improving-the-streak)) [F]. An animation test raised new learners' day-7 retention by 1.7%. Learners who reach a 7-day streak are 3.6 times as likely to finish a course, a correlation that surely includes self-selection ([Duolingo](https://blog.duolingo.com/how-duolingo-streak-builds-habit)) [F]. The cost shows in complaints about guilt-laden reminders and a researcher's warning that streaks can turn into stress ([Desirability Lab](https://desirabilitylab.com/backfill/backfill-2024-302-duolingo-streak-mechanics), [Gulf Today](https://gulftoday.ae/Opinion/2023/11/06/The-language-app-you-just-cant-put-down)) [S].

### Progress, fresh starts and endings

In Kivetz, Urminsky and Zheng's coffee-card study, purchases sped up by about 20% as the free coffee neared, and a 12-stamp card with two bonus stamps was finished faster than a blank 10-stamp card ([PDF](https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf)) [E]. Nunes and Drèze found the same endowed progress effect at a car wash. Secondary sources put completion near 19% without a head start and 34% with one, and giving a reason helps ([Wharton](https://knowledge.wharton.upenn.edu/podcast/knowledge-at-wharton-podcast/the-lowdown-on-customer-loyalty-programs-which-are-the-most-effective-and-why/), [Coglode](https://coglode.com/nuggets/endowed-progress-effect)) [S]. A new week, month, year or birthday prompts fresh starts on goals ([Dai, Milkman and Riis](https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf)) [E]. Memory leans on an experience's peak and end, which explained 94% of the variance in Fredrickson and Kahneman's ratings; a 2022 meta-analysis of 174 effect sizes backs the rule ([PDF](https://bear.warrington.ufl.edu/brenner/mar7588/Papers/fredr-kahneman-jpsp1993.pdf), [meta-analysis](https://ideas.repec.org/a/eee/jobhdp/v170y2022ics0749597822000334.html)) [E]. The "open loop" idea fared worse. A 2025 meta-analysis found no memory advantage for unfinished tasks, only a tendency to resume them ([Ghibellini and Meier](https://ideas.repec.org/a/pal/palcom/v12y2025i1d10.1057_s41599-025-05000-w.html)) [E].

### Social comparison

Festinger proposed that people judge their abilities against similar others when no objective yardstick exists ([PDF](https://www2.psych.ubc.ca/~schaller/528Readings/Festinger1954.pdf)) [E]. In Garcia and Tor's N-effect studies, people who believed they faced 10 competitors finished faster than those told they faced 100 ([PDF](https://public.websites.umich.edu/~smgarcia/pubs/n-effect.pdf)) [E]. Leaderboard studies are mixed: low ranks can sap motivation, more for some personalities than others, yet one study found replay was likeliest at both the top and the bottom of a board ([Jia et al.](https://scholarworks.iupui.edu/bitstream/1805/17645/1/Jia_2018_designing.pdf)) [E]. Duolingo's former product chief credits leaderboards with a 17% rise in learning time and triple the number of highly engaged learners ([Lenny's Newsletter](https://lennysnewsletter.com/p/how-duolingo-reignited-user-growth)) [S, via summaries].

### Time pressure

Anxiety competes for working memory, so pressure hurts most on multi-step problems, though direct evidence on timers is mixed ([summary](https://mrbartonmaths.com/research/anxiety.html), [WPI](https://digital.wpi.edu/show/h702q988w)) [S]. Quiz data is clearer. A review of 93 Kahoot studies found mostly positive effects, including lower anxiety thanks to anonymity, but time pressure and the struggle to catch up after a miss were recurring complaints ([Wang and Tahir](https://research.gold.ac.uk/id/eprint/39435)) [E]. In one survey more than 25% of students felt anxious about the time limit, and the authors warned that speed scoring tempts players to trade accuracy for points ([iJEP](https://online-journals.org/index.php/i-jep/article/download/21359/9529/75849)) [E]. A teacher asked Kahoot to drop speed scaling because the bonus lures students into answering before thinking ([Kahoot community](https://support.kahoot.com/hc/en-us/community/posts/38794659972755-Add-option-to-remove-points-awarded-scaling-with-answer-speed)), and Kahoot opened Accuracy mode to all users in May 2025 ([Kahoot](https://kahoot.com/blog/2025/05/06/teacher-takeover-accuracy-mode/)) [F]. WCAG 2.2.1 (Level A) requires that users can switch off or lengthen time limits, except in real-time events or where timing is essential ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)) [P].

### Scoring design

Kahoot's Classic scoring awards up to 1,000 points, minus half the fraction of time used, so a correct answer at the buzzer still earns about half ([Kahoot](https://support.kahoot.com/hc/articles/115002303908), [Cloudspress](https://www.cloudspress.com/?p=395513)) [F/S]. One event rulebook adds 100 points per streak step up to 500 ([UC Davis](https://campusrecreation.ucdavis.edu/sites/g/files/dgvnsk6556/files/files/event/Aggies%20at%20Home%20Trivia%20Rules.pdf)) [S], and QuizUp doubled its last question (see [01-market-leaders.md](./01-market-leaders.md)). Gardner-Medwin's certainty-based marking, long used in medical education, pays 1, 2 or 3 for a right answer and 0, -2 or -6 for a wrong one, so honest confidence is the best strategy, and UCL reported higher exam reliability with it ([Moodle docs](https://docs.moodle.org/38/en/Using_certainty-based_marking), [Physiological Society](https://www.physoc.org/abstracts/analysis-of-exams-using-certainty-based-marking/)) [E, from the method's originators]. Kahoot's 2026 Confidence mode lets players "boost" an answer to win or lose 50 to 100 points depending on their boost streak, though its help pages disagree on details ([Kahoot help](https://support.kahoot.com/hc/en-us/articles/32200674639261-How-to-host-kahoots-in-confidence-mode), [Kahoot blog](https://kahoot.com/blog/2026/01/14/boost-productivity-streamline-planning-and-unlock-playful-learning-in-2026/)) [F].

Quizbowl's pyramidal questions run from the hardest clue to the easiest. Experts answer early while the final "giveaway" clue still rewards passing knowledge, and the format blunts raw buzzer speed ([QBWiki](https://www.qbwiki.com/wiki/Pyramidal), [SoCal Quiz Bowl](https://socalquizbowl.org/pyramidal-questions/)) [S]. Hidden catch-up is risky: racing developers report that visible rubber banding leaves players feeling cheated ([MCV](https://www.mcvuk.com/development-news/black-rock-studio-blasts-arubber-bandinga/), [Game Developer](https://gamedeveloper.com/design/the-value-of-rubber-banding-an-engagement-driver-)) [S].

### Game feel and juice

Jonasson and Purho's 2012 talk "Juice It or Lose It" argued that layered feedback, such as easing and color, makes simple games feel alive ([summary](https://roblog.co.uk/2024/03/juicy-games/)) [S]. Hicks and colleagues built a juiciness framework and later noted that empirical evidence for juice was lacking ([DiGRA](https://dl.digra.org/index.php/dl/article/view/936), [CHI PLAY 2019](https://unpaywall.org/10.1145%2F3311350.3347171)) [E]. A pre-registered study of 1,699 players suggests overloaded feedback interferes with felt competence ([KIT](https://publikationen.bibliothek.kit.edu/1000171104/152952099)) [E], while a secondary summary says juice tied to success raised enjoyment ([Substack](https://psych.substack.com/p/the-juicy-factor-the-science-of-making)) [S]. A game-feel survey cites one study where medium and high juice beat both none and extreme ([arXiv](https://arxiv.org/pdf/2011.09201)) [E]. WCAG 2.3.3 (Level AAA) asks that interaction-triggered motion can be turned off, because it can cause dizziness or nausea for people with vestibular disorders, and lists `prefers-reduced-motion` as a technique ([W3C](https://w3c.github.io/wcag/understanding/animation-from-interactions.html)) [P].

### Casual and expert players

Quantic Foundry's survey of 350,000+ gamers found hardcore players stand apart mainly on competition and challenge, with excitement close behind, while casual players want calm, non-adversarial games that are easy to learn ([Quantic Foundry](https://quanticfoundry.com/2018/08/01/casual-hardcore/)) [S, self-reported].

### Ethics: engagement versus dark patterns

Zagal, Björk and Lewis define dark game design patterns as deliberate choices that work against players, exploiting their time and money as well as their social ties. Examples include grinding, play by appointment, pay to skip and social pyramid schemes ([Chalmers](https://research.chalmers.se/en/publication/177148), [arXiv](https://arxiv.org/pdf/2412.05039)) [E]. After its 2022 "Bringing Dark Patterns to Light" report, the FTC settled with Epic Games for $245M in refunds over design tricks that caused unwanted purchases, plus a $275M children's privacy penalty ([CBS News](https://www.cbsnews.com/news/fortnite-epic-games-ftc-520-million-fine), [Fenwick](https://fenwick.com/insights/publications/ftcs-aggressive-enforcement-of-childrens-privacy-and-dark-patterns-a-cautionary-tale-and-simple-steps-companies-can-take-to-reduce-risk)) [P]. The EU's Digital Fairness Act proposal is expected in the fourth quarter of 2026 (one law firm says 11 November). It reportedly targets dark patterns and gamified rewards, with extra protection for minors, and one option would switch addictive features off by default ([EPRS](https://eprs.europarl.europa.eu/contents/publications/EPRS/2026/10/EPRS_BRI%282026%29791529.html), [Taylor Wessing](https://www.taylorwessing.com/en/insights-and-events/insights/2026/10/eu-digital-fairness-act-dark-patterns-and-addictive-designs)) [P]. It is not law yet. The UK Children's Code bars nudges that weaken children's privacy and encourages nudges toward wellbeing, like breaks ([ICO](https://ico.org.uk/for-organisations/guide-to-data-protection/ico-codes-of-practice/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques)) [P].

Restraint can win. Josh Wardle moved Wordle from unlimited play to one puzzle a day and said the shared word created "this social aspect." He called the game "not trying to do anything shady with your data or your eyeballs" ([PocketGamer.biz](https://www.pocketgamer.biz/news/78481/gdc-josh-wardle-shares-his-incorrect-tips-for-wordles-success/), [Boston.com](https://www.boston.com/news/national-news/2022/01/04/he-made-wordle-for-his-partner-now-its-an-online-hit/)) [P].

## Implications for our product

*Our read* throughout: numbers are starting values to tune in playtests.

**Questions and reveals**

1. Every question needs a foothold for a smart guess from partial knowledge. Reject pure lookup facts unless they're estimation questions scored by closeness.
2. Players commit before seeing anything about the answer, crowd stats included.
3. Each question ships with a "why" line of 35 words or fewer, shown on every reveal, to turn surprise into interest and make misses useful.
4. After the reveal, show "38% of players got this." Rare hits become small brags; common misses sting less.
5. Write about one question in four so the obvious guess is wrong. Confident errors are the ones people remember fixing.

**Difficulty**

6. Rate every question (seeded from the author's difficulty tag) and every player per category with Elo. Target a predicted success rate of 75 to 85% in casual modes and 55 to 70% in ranked. Recalibrate offline monthly and freeze ratings on disputed questions.
7. The Daily (the same 10 questions for everyone) peaks at question 8 and ends on an "encore" picked for its reveal.
8. Let players raise difficulty openly ("Go harder for 1.5x points"), never behind their backs.

**Scoring (Classic)**

9. Correct = 700 base + up to 300 speed bonus, decaying linearly from when answers unlock to zero at the time limit. Wrong = 0. Speed tops out at 30% of a question's value (Kahoot allows 50%).
10. Answers unlock after a read delay scaled to question length.
11. Streak bonus: +50 per consecutive correct answer, capped at +250. The final question counts double, announced up front.
12. Accuracy mode (no speed points) is the default in solo practice and one tap away for hosts.
13. Expert opt-in Confidence mode uses certainty-based marking (right/wrong: 100/0, 200/-200, 300/-600), untimed, then shows a calibration chart. Party rooms get a simpler Boost: double if right, lose the base if wrong.
14. A "clue ladder" type for rooms: four clues, hardest first, worth 1000, 700, 400 and 200.

**Streaks and habit**

15. Any completed Daily keeps the streak, counted on the player's local clock with a few hours of grace after midnight.
16. Players earn one free Streak Shield per 7 days played and hold up to two, applied automatically. Shields are never sold.
17. A broken streak can be repaired within 48 hours by playing two rounds.
18. Show best streak and total days played beside the current one. After a break, lead with the record, never a big zero.
19. Offer casual players a weekly goal (4 of 7 days) instead of a daily streak.
20. The Daily ends on "You're done for today," with a countdown and an optional practice link. No autoplay.
21. Reminders are opt-in, at most one a day at a chosen time, in neutral copy, and stop after three are ignored.

**Social**

22. Weekly leagues of 20 to 30 similar-rated players reset each Monday. The default board shows friends plus the five players above and below you.
23. The Daily result shows a percentile ("You beat 64% of today's players"), not a global rank.
24. Minors appear under aliases and only on friend boards by default.

**Timers and accessibility**

25. Timer options: Off, Relaxed (double time), Standard (20 s) and Fast (10 s). Solo play must offer Off to meet WCAG 2.2.1. Live rooms likely fall under the real-time exception, but hosts still get a longer setting.
26. Solo timers are soft: a late answer still earns base points and loses only the bonus.

**Juice**

27. Reveal: instant press state, a short suspense beat, then the result. Right answers get color, a quick pop, a chime and a points count-up. Wrong answers get a soft shake, then the right answer and its "why" line.
28. Scale celebration to significance: more at 5 and 10 in a row, the most for a perfect round. Keep most reveals under about 1.5 seconds, skippable with a tap.
29. Under `prefers-reduced-motion`, swap movement for color and opacity. Sound starts off and the choice is remembered.

**Lanes and guardrails**

30. Calm lane: Daily, untimed practice, multiple choice and hints earned through play. Competitive lane: ranked leagues, Fast timers, type-in answers and Confidence mode, with stats by category.
31. Build a minors switch that turns off streak reminders and public ranking, ready for whatever the DFA requires.
32. Track healthy engagement beside D1/D7/D30 retention: sessions ending at a natural stop, returns without a reminder, notification opt-outs, and "I played longer than I meant to" from a one-question survey.

## Anti-patterns to avoid

- Selling streak freezes or repairs, or sending guilt-trip reminders.
- Manufacturing near-misses, like rigging the last question or flashing "so close!" when it wasn't.
- Loot boxes or other paid randomness, and random multipliers that outweigh knowledge.
- A speed bonus big enough that fast guessing beats thinking, or solo timers with no off switch.
- A global all-time leaderboard as the default screen, or last place shown in red.
- Lookup trivia with no foothold, or reveals with no explanation.
- Fake progress, like a bar that starts at 20% for no reason.
- Confetti on every answer, or long unskippable animations that ignore reduced-motion settings.
- Paying people to show up (login coins, prize pools). It erodes intrinsic motivation, and HQ's prize bill helped sink it (see 01-market-leaders.md).
- Endless play with no stopping point, including autoplay countdowns and cliffhangers built to force a return.

## Open questions

- Which success rate feels best for trivia played for fun rather than study? Test bands at 60, 70, 80 and 90%.
- Does a speed bonus add fun for casual players, or only for competitive ones?
- Do daily streaks help a trivia app with no learning goal, or turn play into a chore? Compare daily-streak and weekly-goal cohorts with a control on retention and regret.
- How will the DFA define "addictive design," and will streaks or leaderboards count? Revisit when the proposal is published, expected in November 2026.
- Is Confidence mode fun beyond experts, and does hypercorrection hold for our trickier questions?
- How fast do Elo ratings settle for new questions, and how do we stop sandbagging in ranked play?
- How much juice can low-end phones handle within our performance budget?

## Sources

- https://stafforini.com/works/loewenstein-1994-psychology-curiosity-review/
- https://nautil.us/curiosity-depends-on-what-you-already-know-235803
- https://pubmed.ncbi.nlm.nih.gov/19619181/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC4252494/
- https://www.kiddlab.com/_files/ugd/0975fd_fe8691bfabc3409b96b14d668cc6bf39.pdf
- https://news.berkeley.edu/2019/05/23/curiositystudy
- https://www.fachportal-paedagogik.de/literatur/vollanzeige.html?FId=A34255
- https://www.gatsby.ucl.ac.uk/~dayan/papers/sdm97.html
- https://mason.gmu.edu/~tkashdan/publications/silvia%20kashdan%20compass%202009.pdf
- https://www.gamedeveloper.com/design/gamification-dynamics-flow-and-art
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5954478/
- https://unpaywall.org/10.1145%2F3611065
- https://emerald.com/insight/content/doi/10.1108/S0749-742320160000019017
- https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579
- https://neurosciencenews.com/learning-optimized-15171/
- https://en.wikipedia.org/wiki/Jenova_Chen
- https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12784335/
- https://www.rochester.edu/warner/lida/wp-content/uploads/2022/11/02bfe513dd59366750000000.pdf
- https://glassmanlab.seas.harvard.edu/annotated_works/mekler17.pdf
- https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf
- https://opus.bibliothek.uni-augsburg.de/opus4/files/109056/109056.pdf
- https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf
- https://profiles.wustl.edu/en/publications/repeated-retrieval-during-learning-is-the-key-to-long-term-retent/
- https://pubmed.ncbi.nlm.nih.gov/19586265/
- https://amalab.uta.edu/files/2021/12/knight-2012-2.pdf
- https://learningscientists.org/blog/2023/8/3-1
- https://eprints.soton.ac.uk/412186/1/Beyond_Hypercorrection_manuscipt_R2_Final.docx
- https://sites.lifesci.ucla.edu/psych-bjorklab/wp-content/uploads/sites/13/2016/07/RBjork_Linn_2006.pdf
- https://blog.duolingo.com/how-we-learn-how-you-learn
- https://venturebeat.com/ai/how-duolingo-is-using-ai-to-humanize-virtual-language-lessons
- https://pmc.ncbi.nlm.nih.gov/articles/PMC2658737/
- https://link.springer.com/article/10.1007/s10899-016-9633-7
- https://dl.digra.org/index.php/dl/article/download/2764/2748/2808
- https://rozprawyspoleczne.edu.pl/Loot-boxes-gambling-like-mechanisms-hidden-in-digital-games-A-narrative-review-of,216647,0,1.html
- https://www.aeaweb.org/doi/10.1257/jel.20221698
- https://ideas.repec.org/a/eee/joepsy/v107y2025ics0167487025000133.html
- https://www.colorado.edu/business/news/2023/04/20/research-streaks-marketing-tech-barasch
- https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals
- https://blog.duolingo.com/improving-the-streak
- https://blog.duolingo.com/how-duolingo-streak-builds-habit
- https://desirabilitylab.com/backfill/backfill-2024-302-duolingo-streak-mechanics
- https://gulftoday.ae/Opinion/2023/11/06/The-language-app-you-just-cant-put-down
- https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf
- https://knowledge.wharton.upenn.edu/podcast/knowledge-at-wharton-podcast/the-lowdown-on-customer-loyalty-programs-which-are-the-most-effective-and-why/
- https://coglode.com/nuggets/endowed-progress-effect
- https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf
- https://bear.warrington.ufl.edu/brenner/mar7588/Papers/fredr-kahneman-jpsp1993.pdf
- https://ideas.repec.org/a/eee/jobhdp/v170y2022ics0749597822000334.html
- https://ideas.repec.org/a/pal/palcom/v12y2025i1d10.1057_s41599-025-05000-w.html
- https://www2.psych.ubc.ca/~schaller/528Readings/Festinger1954.pdf
- https://public.websites.umich.edu/~smgarcia/pubs/n-effect.pdf
- https://scholarworks.iupui.edu/bitstream/1805/17645/1/Jia_2018_designing.pdf
- https://lennysnewsletter.com/p/how-duolingo-reignited-user-growth
- https://mrbartonmaths.com/research/anxiety.html
- https://digital.wpi.edu/show/h702q988w
- https://research.gold.ac.uk/id/eprint/39435
- https://online-journals.org/index.php/i-jep/article/download/21359/9529/75849
- https://support.kahoot.com/hc/en-us/community/posts/38794659972755-Add-option-to-remove-points-awarded-scaling-with-answer-speed
- https://kahoot.com/blog/2025/05/06/teacher-takeover-accuracy-mode/
- https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html
- https://support.kahoot.com/hc/articles/115002303908
- https://www.cloudspress.com/?p=395513
- https://campusrecreation.ucdavis.edu/sites/g/files/dgvnsk6556/files/files/event/Aggies%20at%20Home%20Trivia%20Rules.pdf
- https://docs.moodle.org/38/en/Using_certainty-based_marking
- https://www.physoc.org/abstracts/analysis-of-exams-using-certainty-based-marking/
- https://support.kahoot.com/hc/en-us/articles/32200674639261-How-to-host-kahoots-in-confidence-mode
- https://kahoot.com/blog/2026/01/14/boost-productivity-streamline-planning-and-unlock-playful-learning-in-2026/
- https://www.qbwiki.com/wiki/Pyramidal
- https://socalquizbowl.org/pyramidal-questions/
- https://www.mcvuk.com/development-news/black-rock-studio-blasts-arubber-bandinga/
- https://gamedeveloper.com/design/the-value-of-rubber-banding-an-engagement-driver-
- https://roblog.co.uk/2024/03/juicy-games/
- https://dl.digra.org/index.php/dl/article/view/936
- https://unpaywall.org/10.1145%2F3311350.3347171
- https://publikationen.bibliothek.kit.edu/1000171104/152952099
- https://psych.substack.com/p/the-juicy-factor-the-science-of-making
- https://arxiv.org/pdf/2011.09201
- https://w3c.github.io/wcag/understanding/animation-from-interactions.html
- https://quanticfoundry.com/2018/08/01/casual-hardcore/
- https://research.chalmers.se/en/publication/177148
- https://arxiv.org/pdf/2412.05039
- https://www.cbsnews.com/news/fortnite-epic-games-ftc-520-million-fine
- https://fenwick.com/insights/publications/ftcs-aggressive-enforcement-of-childrens-privacy-and-dark-patterns-a-cautionary-tale-and-simple-steps-companies-can-take-to-reduce-risk
- https://eprs.europarl.europa.eu/contents/publications/EPRS/2026/10/EPRS_BRI%282026%29791529.html
- https://www.taylorwessing.com/en/insights-and-events/insights/2026/10/eu-digital-fairness-act-dark-patterns-and-addictive-designs
- https://ico.org.uk/for-organisations/guide-to-data-protection/ico-codes-of-practice/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques
- https://www.pocketgamer.biz/news/78481/gdc-josh-wardle-shares-his-incorrect-tips-for-wordles-success/
- https://www.boston.com/news/national-news/2022/01/04/he-made-wordle-for-his-partner-now-its-an-online-hit/
