# Gap 3: Estimating trivia difficulty before anyone has played

*Follow-up track, compiled 31 October 2026.* **Method note.** The workflow's shared WebSearch budget (200 calls per turn, all agents) was spent before this track began. All six searches tried here were refused, so the brief's 15-search minimum could not be met. Direct fetches were blocked too: the proxy refused aclanthology.org with a 403, and all earlier WebFetch calls failed on DNS. Evidence comes from four places: two primary sources read through public git (a Jeopardy! data set's README and the QANTA quiz bowl code), results earlier tracks verified, unchecked background knowledge, and our own arithmetic and Monte Carlo. Tags: **[F]** read first-hand today; **[R]** from a verified search in an earlier report; **[K]** background knowledge not re-checked today, so lower confidence, linked only where we are sure of the link; **[C]** our calculation. *Our read* marks interpretation. Open questions ends with a verification queue.

## Summary

- **Text alone gives a rough ranking, not a number.** In the BEA 2024 shared task, the best run cut difficulty RMSE from 0.311 (predict the mean) to 0.299 [K]: about 8% of variance explained, r ≈ 0.28 [C]. Known text and LLM estimators land between r = 0.3 and 0.8, an RMSE of about 13 to 21 points on a trivia bank whose correct rates have an SD of 22 [C]. Nothing we found reaches ±10 points without human answers.
- **A decent estimator is worth 5 to 11 human answers per item** (RMSE of 20 or 15 points at p = 0.5) [C]. Five AI test-solvers are worth almost nothing for difficulty, because they sit at the ceiling.
- **Simulated respondents need human data.** Frontier models know too much, persona prompts don't make them forget, smaller models match human patterns better, and the methods reaching r ≈ 0.8 either pool several weaker models or train on human responses [K].
- **Only academic norms are clean benchmarks.** Tauber et al. (2013) publish recall rates for 299 general-knowledge questions [K]. LearnedLeague, J! Archive, Pointless and Sporcle are for reading only; a 554,131-clue Jeopardy! data set asks that it not be used "to make a public-facing web site, app, or any other product" [F].
- **Practice play needs 200,000 eligible first attempts** to give 2,000 items 100 each. With half to four fifths of practice self-picked, that takes about 100 to 135 days at 500 daily players, 26 to 33 at 2,000 and 5 to 7 at 10,000 [C]. Without exploration slots, adaptive serving leaves the hardest items uncalibrated for most of a year at 500 players.
- **A 600 × 50 panel costs about $1,300 to $2,500 and a week, needs the owner** for the account and payment, and measures paid panelists rather than our players [K][C]. Verdict: no-go now, with a pre-agreed trigger for a $400 to $500 pilot if the benchmark or the first beta week fails.
- **Professionals measure only when difficulty is the score.** Pointless and Family Feud survey 100 people. Everyone else leans on an editor's judgment, a few test-solvers, formats that absorb error and stats after the fact [K].
- **Assembly rule: buffered windows, ordered by predicted p, re-tuned weekly.** Easy slots need a predicted p of 0.90 or more and Expert 0.18 or less. That cuts days with an Easy slot under 60% from about 15 to 19% to 2 to 5% [C]. Lock 60 Dailies' worth of content, not 60 dates.

## Detailed findings

### 1. Predicting difficulty from text alone

**BEA 2024.** The shared task asked teams to predict the difficulty and response time of retired USMLE multiple-choice items from their text ([proceedings](https://aclanthology.org/volumes/2024.bea-1/)) [K]. As we recall, the best difficulty run scored an RMSE of 0.299 against 0.311 for a dummy predicting the training mean, and most runs sat near that baseline [K]. The organizers' scale doesn't convert to points, but the ratio does: if the baseline's error approximates the spread of true difficulty, the winner explained 1 − (0.299/0.311)² ≈ 7.6% of variance, or r ≈ 0.28 [C]. Medical items written to one house standard are a harder case than trivia, where items differ in visible ways (how famous the answer is, how tempting the distractors are). *Our read:* treat 0.3 as a floor and expect somewhat better on trivia.

**Surveys and production.** Reviews of question-difficulty estimation find text models do best when trained on in-domain response data; zero-data estimation is the weak case ([Benedetto et al. 2023](https://doi.org/10.1145/3556538)) [K]. The production precedent we know is the Duolingo English Test, which launched items with machine-estimated difficulty instead of pretesting and refined them from responses ([Settles et al. 2020](https://aclanthology.org/2020.tacl-1.17/)) [K]. That is the pattern recommended here.

**Correlation to points.** For a calibrated predictor, RMSE = SD × √(1 − r²). With an assumed SD of 22 points for a bank spanning 10% to 95% correct [C]:

| Correlation | 0.3 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 |
|---|---|---|---|---|---|---|
| RMSE (points) | 21 | 19 | 18 | 16 | 13 | 10 |

The same RMSE reads as a count of human answers, n₀ = p(1 − p)/RMSE². Fifteen points equals about 11 answers at p = 0.5; twenty points about 6 [C]. Raw LLM estimates also carry bias and compression that only live data removes.

### 2. Public data sets with human correct rates (benchmarks only)

| Source | Human measure | Terms and fit |
|---|---|---|
| Tauber et al. 2013 norms ([DOI](https://doi.org/10.3758/s13428-012-0307-9)) | Recall rate for each of 299 questions, US undergraduates [K] | Article plus supplement, widely used in memory research. Best offline benchmark; supplement license unchecked |
| Nelson and Narens 1980 ([DOI](https://doi.org/10.1016/S0022-5371%2880%2990266-2)) | Recall rates for 300 questions [K] | Same terms; dated, so a second check only |
| LearnedLeague ([site](https://www.learnedleague.com/)) | Correct% for every question [K] | Type-in answers from a strong, self-selected membership; no open license we know of. Read by hand, never scrape |
| J! Archive ([site](https://j-archive.com/)) and a Jeopardy! data set | Clue values; J! Archive game pages mark triple stumpers [K] | Fan site; content belongs to Jeopardy Productions. A 554,131-clue data set on GitHub (Seasons 1 to 42, July 2026) has clue values and per-contestant right and wrong totals, but no per-clue correct rate. Its source "prefers not to be credited", and it asks: "Please don't use the data to make a public-facing web site, app, or any other product" ([README](https://github.com/jwolle1/jeopardy_clue_dataset)) [F] |
| Pointless ([Wikipedia](https://en.wikipedia.org/wiki/Pointless)) | Answer scores from 100-person surveys [K] | Broadcaster-owned format; no data set |
| Sporcle ([site](https://www.sporcle.com/)) | Per-answer percentages in quiz stats [K] | Terms not checked; assume no scraping. Manual spot checks only |
| QANTA ([repo](https://github.com/Pinafore/qb)) | Code that parses Protobowl logs of human buzzes (guess, ruling, timing and user) [F] | Code is MIT; the README states no data license, and whether the log is public is unconfirmed. Quiz bowl text is off-limits as content (07) |
| OpenTDB ([site](https://opentdb.com/)) | Difficulty labels set by submitters, not measured (07) | CC BY-SA 4.0 but no human rates, so no benchmark |

The norms are free recall, while our Daily is mostly multiple choice, where recognition and guessing lift scores. Use them to test the estimator's *ranking* (rank correlation), not its level. And none of these measure our players.

### 3. Do simulated respondents track human difficulty?

- **The ceiling.** Frontier models answer most trivia, so their accuracy carries little difficulty signal. CAIMIRA, fitted to quiz bowl answers from people and AI systems, found the two fail on different questions: models are strongest at retrieving specific facts, people at abductive and conceptual reasoning (Gor et al., [EMNLP 2024](https://aclanthology.org/volumes/2024.emnlp-main/)) [K]. An obscure fact a model finds easy can be the day's hardest item for people.
- **Persona prompts.** Prompting models to answer as weaker students gave model-specific results that did not transfer between models (Benedetto et al., [Findings of EMNLP 2024](https://aclanthology.org/volumes/2024.findings-emnlp/)) [K]. He-Yueya et al. found language models poorly matched to human knowledge distributions; *smaller* models matched better than larger ones, and training on human responses helped most ([arXiv](https://arxiv.org/abs/2407.15645)) [K].
- **Pools of models.** Liu, Bhandari and Pardos (BJET 2025) used six LLMs as respondents on college-algebra items and, with resampling, got difficulties correlating above 0.8 with human calibration, as we recall [K]. Profile-based simulated students (Lu and Wang, Learning @ Scale 2024) picked out hard items in line with real students [K]. Both are small single-domain studies.
- **Tuned simulators** aligned to set ability levels (SMART, Scarlatos et al. 2025) beat plain prompting but train on human-scored data [K].
- **"What share of adults know this?"** The closest evidence is vocabulary. Human word-prevalence norms record the share of people who know each word ([Brysbaert et al. 2019](https://doi.org/10.3758/s13428-018-1077-9)), and later work found LLM familiarity ratings track them closely [K]. We found no verified test on trivia facts.

*Our read:* with only frontier models in our sandbox, persona simulation isn't worth building. A direct-estimate ensemble, benchmarked on the norms and recalibrated on live data, is the cheapest credible path.

### 4. Practice play to 100 first attempts per item

The target is 2,000 × 100 = 200,000 eligible first attempts: a player's first rated try, from a player with 20 or more rated answers who isn't flagged (plan 7.10). QANTA's Protobowl loader uses the same two filters, keeping "only the first record for each question" per user and dropping users with under 20 questions answered ([code](https://github.com/Pinafore/qb/blob/master/qanta/datasets/protobowl.py)) [F]. Seen-tracking makes nearly every practice answer a first attempt.

Base case: 6 practice answers per daily player per day, 70% of them eligible, 10 equally stocked categories, and self-picked play skewed so the least popular category gets a third of its fair share. The app routes the remaining practice to the least-sampled items [C].

| Daily players | App picks all | 50% self-picked | 80% self-picked | 100% self-picked |
|---|---|---|---|---|
| 500 | 95 days | 103 | 134 | 279 |
| 2,000 | 24 | 26 | 33 | 70 |
| 10,000 | 5 | 5 | 7 | 14 |

Halve practice (3 answers, 60% eligible) and times rise about 2.3-fold; double it (12, 80%) and they fall by more than half [C]. Adaptive serving is the bigger trap. If practice targets 75 to 85% success (plan 7.4), Expert items only reach strong players. In an illustrative case where the hardest 300 items draw 4% of answers, they need about 357 days to reach 100 each at 500 players. Aiming 10% of practice serves at them cuts that to about 100 days, and from 89 to 26 at 2,000 players [C].

The Daily calibrates far faster, because every player answers the same nine scored items. If half of a 200-player beta plays daily, each item gets about 100 answers on its first day. Seven Dailies (63 items) pin the estimator's shared bias to a standard error of about 0.13 logits, roughly 3 points at p = 0.5 [C].

### 5. What a small human panel would cost

- **Price.** Prolific sets a minimum hourly rate (about $8, with about $12 recommended) and adds a service fee of roughly 33% for academics and 43% for companies ([pricing](https://www.prolific.com/pricing)) [K].
- **Design.** 600 items × 50 answers = 30,000 answers: 500 people at 60 items each (12 to 15 minutes) or 300 at 100 items (18 to 20 minutes).
- **Cost.** At $9 to $12 an hour, either fee, with 15% over-recruiting for exclusions: about $1,300 to $2,500 [C].
- **Time.** About a week: a day or two to build a panel page with a completion-code redirect, a 20-person pilot, the full run (Prolific advertises fills within hours [K]), then analysis.
- **Without the owner?** No. Someone must open the account, pass verification, fund it and accept the researcher terms. After that, agents could run studies through Prolific's API with an owner-issued token [K].
- **Quality risk.** People look answers up or ask a chatbot; one study estimated 33 to 46% of Mechanical Turk workers used LLMs on a summarizing task ([Veselovsky et al. 2023](https://arxiv.org/abs/2306.07899)) [K]. Mitigate with a per-item time limit, focus-loss logging, attention checks and dropping fast perfect scorers.
- **What it buys.** Combined with an estimator prior of 15 to 20 points, 50 answers per item gives a per-item standard error near 6.5 points, and the Daily's error from item noise falls from about 0.45 to 0.2 questions [C]. It cannot fix the gap between panelists and our self-selected players, the largest unknown before launch.

### 6. How professional setters hit a target without data

- **When difficulty is the score, they pay to measure it.** Pointless and Family Feud build their answers from 100-person surveys [K].
- **Otherwise, judgment plus a forgiving structure.** Quiz bowl tossups run from the hardest clue to the easiest ([QBWiki](https://www.qbwiki.com/wiki/Pyramidal)) [R]. A bonus pairs a part most teams get with a part only the best get, plus one in between, and editors read conversion stats after each event [K]. Jeopardy! encodes intended difficulty in dollar rows, and J! Archive marks triple stumpers, so misses are public after air [K]. LearnedLeague publishes every Correct%, and its "defense" scoring makes members guess which questions an opponent will miss [K].
- **How far off?** We found no setter that publishes its own error. The best proxy is standard-setting research (Bejar 1983; Impara and Plake 1998): expert guesses at item p-values correlate only moderately with real ones and squeeze toward the middle, so easy items look harder than they are and hard ones easier [K]. *Our read:* professionals live with sizeable error because their formats absorb it, then they measure and correct.

### 7. What a Daily looks like under this uncertainty

We simulated 20,000 Dailies per case: nine scored slots (3 Easy, 4 Medium, Expert at 8, Hard at 9), item error σ of 0.6 to 1.2 logits, and a shared bias with SD 0.5 logits before launch or 0.15 after a week of re-tuning [C]. Face-value windows take the plan's bands literally. Buffered windows are Easy 0.90 to 0.97, Medium 0.62 to 0.85, Hard 0.30 to 0.55 and Expert 0.06 to 0.18.

| σ = 0.9 logits, pre-launch bias | Face-value | Buffered |
|---|---|---|
| Easy slots truly 80%+ | 71% | 89% |
| Expert slot truly under 25% | 69% | 81% |
| Medium, Hard in their bands | 47%, 39% | 45%, 38% |
| Days with an Easy slot under 60% | 19% | 5% |
| Day's true mean (9 slots), 5th to 95th percentile | 4.1 to 7.0 | 4.8 to 7.3 |

After a one-week re-tune the buffered range narrows to 5.3 to 6.9. Across all cases, Medium and Hard land in band only 31 to 66% of the time, so the middle can't be steered closely before data. Only the ends and the total can.

## Implications for our product

1. **Redefine "five test-solvers."** With AI solvers, keep it as a check for wrong keys and ambiguity (any miss is a red flag), never as a difficulty measure.
2. **Build estimator v0.** Five independent agent estimates of "the share of English-speaking adults who would pick the right option", given stem and options, each from a different angle (fame of the answer, schooling, distractor pull, recency). Take the median on the logit scale and keep the spread as uncertainty. Store both beside the writer's 1 to 5 seed, tagged with the estimator version.
3. **Benchmark before launch.** Run v0 offline on the Tauber and Nelson and Narens questions, never in the bank. Proceed if rank correlation reaches 0.6; otherwise fix the prompts before scheduling.
4. **Assembly rule for launch Dailies.**
   - Slots 1 to 3: predicted p of 0.90 or more, from the lowest third of spread; slot 1 gets the highest (never true/false).
   - Slots 4 to 7: 0.62 to 0.85, in descending order; high-spread items go to slots 5 to 7.
   - Slot 8: 0.18 or less, with at least two estimates under 0.25, and it must pass the foothold rule (7.5) so its difficulty comes from obscurity, not ambiguity.
   - Slot 9: 0.30 to 0.55. Slot 10 stays the closest-number encore, with no p target.
   - Predicted nine-slot total of 5.8 to 6.4. For the first seven Dailies use 6.2 to 6.6, leaning easy for first-time players while the bias is unknown.
   - If the Daily adopts gap 1's three-mystery format, apply the same method to the predicted share solving at each clue.
5. **Lock content, not dates.** Seal 600 or more verified items plus the 300 reserve and keep 14 days assembled. Freeze 3 days ahead in the first month and 7 after two calm weeks; re-assemble the rest weekly.
6. **Weekly re-tune (automated, Mondays).** Fit logit(observed p) = a + b × logit(predicted p) on Daily items with 100 or more eligible answers and practice items with 100 first attempts. Add shrunken category offsets once a category has 8 such items. Re-score the sealed pool and re-assemble beyond the freeze. Then narrow the windows with threshold = band edge ± z × σ, using σ measured live.
7. **Alarms to the owner's queue:** a Daily mean more than 1.0 question from prediction, an Easy item under 65%, an Expert item over 45%, or strong players missing an item more than weak ones.
8. **Protect the kill metric.** Report D1 by first-Daily score band (0 to 3, 4 to 5, 6 to 7, 8 to 10) beside the headline figure. Mark cohorts whose first Daily missed its prediction by more than a question, and don't test against the 25% kill line until two straight weeks sit within ±0.5 questions of prediction.
9. **Practice ratings.** In the player-versus-question model ([Pelánek 2016](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf), [Lichess](https://github.com/lichess-org/lila/blob/master/modules/puzzle/src/main/PuzzleFinisher.scala)) [R], seed item ratings from v0 with a Glicko deviation of about 175 points (one logit is 400/ln 10 ≈ 174 points) once v0 passes the benchmark, and 350, Glicko's value for an unknown ([Glickman](http://www.glicko.net/glicko/glicko.pdf)), until then [K][C]. Running Elo ratings are biased and context-dependent ([Bolsinova et al. 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12784335/)) [R], so the weekly refit uses a fitted model instead. Reserve 10% of practice serves for the least-sampled items, never as a round's first question.
10. **Pretest Daily items only at scale.** Field-testing a sealed item on 100 practice players spoils it for 1% of players at 10,000 daily players but 20% at 500. Embed pretests only past 10,000.
11. **Cheat early-warning stays observe-only** until an item has 100 eligible answers. Before that, compare a player with the day's observed results, not with predicted difficulty.
12. **Train v1 on our own data** once 1,000 practice items have 100 first attempts each, since in-domain training is where text models gain most [K].

**Panel decision: no-go now.** It needs the owner, against the owner's request that we work autonomously. It costs about $2,000 and measures the wrong population, while seven beta Dailies measure the shared bias for free. Ask the owner for one capped pilot (200 Easy-slot candidates × 30 answers, about 100 people, $400 to $500 [C]) only if benchmark rank correlation falls below 0.5, or beta week 1 shows item error above 25 points or two Dailies more than 1.5 questions off.

## Anti-patterns to avoid

- **Reading AI solve rates as difficulty.** They sit near 100% and miss what people find hard.
- **"Answer as an average adult" prompts** standing in for measurement.
- **Taking the bands at face value** on predicted p: most Easy-slot misses come from here.
- **Locking 60 dates,** so week-1 lessons can't reach week 2.
- **Judging D1 on week 1 alone,** without score bands.
- **Letting adaptive serving starve the extremes,** leaving Expert items unrated for most of a year at small scale.
- **Scraping LearnedLeague, J! Archive, Pointless fan wikis or Sporcle,** or importing their text.
- **Treating panel adults as our players.** A panel fixes rankings, not the audience offset.

## Open questions

- **Our estimator's σ on trivia.** Unknown until the benchmark runs; recompute every window above from it.
- **Recall to multiple choice.** How much do four options lift a recall rate? Measure in beta.
- **Audience offset.** How much stronger are our players than general adults, and does that shift with each channel (Reddit, directories)?
- **Does first-Daily score drive D1?** The score-band split will show it. If it doesn't, this track matters less.
- **Verification queue (when search budget returns):** the BEA 2024 findings paper (scale, team count, correlations); every simulated-respondent study in section 3; any LLM test on the Tauber norms, plus the supplement's license; Prolific's current fees; the terms of LearnedLeague, Sporcle, J! Archive and the Protobowl log; ACF and NAQT bonus guidance; Jeopardy! correct rate by row; the Angoff accuracy figures; pub-quiz setters on their misses; HQ Trivia answer-share archives as a multiple-choice benchmark.

## Sources

- https://github.com/jwolle1/jeopardy_clue_dataset
- https://github.com/Pinafore/qb
- https://github.com/Pinafore/qb/blob/master/qanta/datasets/protobowl.py
- https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12784335/
- https://github.com/lichess-org/lila/blob/master/modules/puzzle/src/main/PuzzleFinisher.scala
- https://www.qbwiki.com/wiki/Pyramidal
- https://aclanthology.org/volumes/2024.bea-1/
- https://doi.org/10.1145/3556538
- https://aclanthology.org/2020.tacl-1.17/
- https://doi.org/10.3758/s13428-012-0307-9
- https://doi.org/10.1016/S0022-5371%2880%2990266-2
- https://www.learnedleague.com/
- https://j-archive.com/
- https://en.wikipedia.org/wiki/Pointless
- https://www.sporcle.com/
- https://opentdb.com/
- https://aclanthology.org/volumes/2024.emnlp-main/
- https://aclanthology.org/volumes/2024.findings-emnlp/
- https://arxiv.org/abs/2407.15645
- https://doi.org/10.3758/s13428-018-1077-9
- https://www.prolific.com/pricing
- https://arxiv.org/abs/2306.07899
- http://www.glicko.net/glicko/glicko.pdf
