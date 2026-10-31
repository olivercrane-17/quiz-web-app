# 07. Content excellence: writing trivia questions people love

*Track 07, compiled 2026-10-31.* **Method note.** The shared search budget was gone before this track began, and opentdb.com, the-trivia-api.com, qbwiki.com and cft.vanderbilt.edu sit outside the network allowlist, so no web searches ran (the brief asked for 15 or more). I checked the highest-stakes facts against primary texts reachable through git and npm: Creative Commons' BY-SA 4.0 legal code, W3C's WCAG 1.1.1 text, Wikitrivia's source and an Open Trivia DB client. The rest comes from sources reports 01 to 06 gathered or from established literature.

*Tags:* **[V]** checked today against the primary text. **[S]** secondary source read today. **[R]** sourced in reports 01 to 06 (link shown, not re-opened). **[K]** established literature or public record, not re-verified this session. **[L]** low confidence. *Our read* marks interpretation.

## Summary

- **A great question is a puzzle with a foothold.** Curiosity peaks when people think they almost know ([PubMed](https://pubmed.ncbi.nlm.nih.gov/19619181/)) [R]. "Gettable" means guessable from partial knowledge; obscurity never makes a question good.
- **One question, one defensible answer.** Superlatives, "firsts", counting conventions and anything with a current holder cause most disputes. Quiz bowl's answer lines are the model for type-in answers [K].
- **Distractors decide multiple-choice quality.** Options should match in kind and length, and every one should be a real confusion. Three good options beat four with a filler ([Rodriguez](https://doi.org/10.1111/j.1745-3992.2005.00006.x)) [R].
- **Writer difficulty labels are a guess.** Measure correct rates, as LearnedLeague does with its public Correct% [K], and flag items strong players miss more than weak ones.
- **About ten broad categories, unlimited tags.** Trivial Pursuit's six are the cultural baseline [K]; OpenTDB's 24 show how a long tail fragments a bank [S].
- **Global English needs a global default.** Region-tag every item, keep US- or UK-only knowledge out of the shared Daily, give dual units and spelled-out dates, and accept both spellings.
- **Two sources, two people.** The writer never checks their own item, and one source is primary. Trivial Pursuit once printed a planted fake fact and won the lawsuit because facts carry no copyright [K].
- **Facts expire.** Kazakhstan's capital changed name twice in three years, and the box-office record flipped twice in two [K]. Volatile items need a review date or a year in the question.
- **Every answer earns a "why".** Explanations beat bare right/wrong feedback in a meta-analysis ([Van der Kleij et al.](https://doi.org/10.3102/0034654314564881)) [R], and confident errors are the ones people fix ([Learning Scientists](https://learningscientists.org/blog/2023/8/3-1)) [R].
- **Open datasets are raw material, not a launch bank.** OpenTDB is CC BY-SA 4.0, so commercial use is allowed. Edits stay BY-SA, though, and copying a substantial part into our database can make the database itself Adapted Material [V]. Jeopardy! and quiz bowl archives are off-limits [K].

## Detailed findings

### 1. What makes a question interesting and gettable

In Kang and colleagues' trivia study, curious people recalled surprising answers better one to two weeks later ([PubMed](https://pubmed.ncbi.nlm.nih.gov/19619181/)) [R]. Curiosity was highest at middling confidence, an inverted U [K], and it even boosted memory for unrelated faces shown during the wait ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4252494/)) [R]. A gettable question lives in that "I almost know this" zone.

Professional formats build that zone on purpose. Quiz bowl's pyramidal tossups run from the hardest clue to the easiest, so the expert buzzes early while the final "giveaway" still rewards passing knowledge ([QBWiki](https://www.qbwiki.com/wiki/Pyramidal), [SoCal Quiz Bowl](https://socalquizbowl.org/pyramidal-questions/)) [R]. Every clue must point to one answer only, or an early buzz becomes a gamble [K]. Jeopardy! adds a second path through the category title: puns narrow the field, and a title in quotation marks tells players that each response contains those letters ([Wikipedia](https://en.wikipedia.org/wiki/Jeopardy!)) [K].

"What is the atomic number of rhodium?" has no foothold: you know 45 or you don't. "Which element takes its name from the Greek word for the Sun?" lets a player reason from *helios*, and the reveal teaches that helium was spotted in sunlight in 1868, nearly three decades before anyone found it on Earth ([Wikipedia](https://en.wikipedia.org/wiki/Helium)) [K].

Surprise helps; tricks don't. Report 03 suggests making the obvious guess wrong in about one question in four, since confident errors are the ones people correct ([Learning Scientists](https://learningscientists.org/blog/2023/8/3-1)) [R]. A preprint finds that benefit weakens for trick questions ([Southampton](https://eprints.soton.ac.uk/412186/1/Beyond_Hypercorrection_manuscipt_R2_Final.docx)) [R]. The classic trick is the Moses illusion: asked how many animals of each kind Moses took on the Ark, most people answer "two" without noticing it was Noah ([Erickson and Mattson](https://doi.org/10.1016/S0022-5371(81)90165-1)) [K]. *Our read:* a question may mislead through a plausible belief, never through a misread word.

### 2. One question, one answer

Disputes cluster in predictable places:

- **Competing definitions.** Everest is the highest mountain above sea level, but Mauna Kea is taller from base to summit ([Wikipedia](https://en.wikipedia.org/wiki/Mauna_Kea)) [K]. Write "highest above sea level".
- **Measurement disputes.** The Nile is usually listed as the longest river, though some studies put the Amazon ahead ([Wikipedia](https://en.wikipedia.org/wiki/Nile)) [K].
- **Counting conventions.** Most English-speaking schools teach seven continents, while much of Latin America teaches six ([Wikipedia](https://en.wikipedia.org/wiki/Continent)) [K].
- **National "firsts".** Brazil credits Alberto Santos-Dumont, not the Wright brothers, with the first powered flight ([Wikipedia](https://en.wikipedia.org/wiki/Alberto_Santos-Dumont)) [K].
- **Near-ties.** Nintendo was founded in 1889, the year the Eiffel Tower opened, so "which came first" turns on months [K].
- **Negative stems.** "Which of these is NOT..." invites misreads. Item-writing guidance says to phrase stems positively and to bold and capitalize any negative you keep ([Haladyna, Downing and Rodriguez](https://doi.org/10.1207/S15324818AME1503_5)) [K].

Quiz bowl handles the leftovers with answer lines, which spell out alternates to accept and near-misses that earn a prompt (a request for more detail) [K]. Report 06's pipeline adds a test-solve state [R]: someone answers cold, then tries to argue that a distractor is also right.

### 3. Distractor design for multiple choice

A widely cited review of item-writing guidance yields rules that transfer well to trivia ([Haladyna, Downing and Rodriguez](https://doi.org/10.1207/S15324818AME1503_5)) [K]:

- Make every distractor plausible, ideally a typical error.
- Keep options the same kind of thing and about the same length.
- Put numeric and date options in order.
- Avoid "all of the above", and use "none of the above" with care.
- Remove cues: absolutes like "always", options that echo the stem, pairs of options that point at the key, and absurd fillers.
- Use humor only where the setting suits it.

Rodriguez's meta-analysis of 80 years of research found three options optimal ([DOI](https://doi.org/10.1111/j.1745-3992.2005.00006.x)) [R]. Real exams carry dead weight: in Tarrant, Ware and Mohammed's nursing exams, many distractors drew under 5% of candidates ([BMC Medical Education](https://doi.org/10.1186/1472-6920-9-40)) [K]. Position leaks too, since writers tend to hide keys in the middle and guessers lean the same way ([Attali and Bar-Hillel](https://doi.org/10.1111/j.1745-3984.2003.tb01099.x)) [K]. Game shows split on the count: HQ ran three options ([TIME](https://time.com/5038037/hq-trivia-app-game/)) [R], while Who Wants to Be a Millionaire? runs four and saves its comic options for the low rungs [K].

*Our read:* good trivia distractors come from the same set (Sydney and Melbourne for Australia's capital), the popular misconception, near numbers, and same-type entities from the same era. Test-wise players spot the key that shares the most features with the rest, as 1912 does in the set 1912, 1921, 1812, 1915. Never use real living people as distractors for crimes or scandals, since a wrong option still pairs a name with a claim.

### 4. Difficulty calibration

LearnedLeague asks six type-in questions per match day and publishes each one's Correct% ([LearnedLeague](https://www.learnedleague.com/)) [K]. Pointless surveys 100 people per question ([Wikipedia](https://en.wikipedia.org/wiki/Pointless)) [K]. Quiz bowl bonuses pair a part most teams get with a part only the best get, plus one in between [K]. Writer labels are weak by comparison: OpenTDB offers just three labels ([client types](https://github.com/Elitezen/open-trivia-db-wrapper)) [S], set by the submitter [L].

Pelánek treats each answer as a match between player and question ([paper](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf)) [R], and report 03 targets 75 to 85% success in casual modes [R]. Classical item analysis adds a defect detector: when strong players miss an item more often than weak ones (a negative point-biserial correlation), the key is often wrong or the wording ambiguous ([Wikipedia](https://en.wikipedia.org/wiki/Point-biserial_correlation_coefficient)) [K].

### 5. A category taxonomy players love

Trivial Pursuit set the template in 1981 with six categories: Geography, Entertainment, History, Arts & Literature, Science & Nature, and Sports & Leisure ([Wikipedia](https://en.wikipedia.org/wiki/Trivial_Pursuit)) [K]. Trivia Crack's wheel uses six close cousins ([GameSkinny](https://www.gameskinny.com/reviews/review-trivia-crack-will-challenge-your-knowledge-and-friendships/)) [R]. OpenTDB runs 24, including "Entertainment: Japanese Anime & Manga" and "Science: Gadgets" ([client types](https://github.com/Elitezen/open-trivia-db-wrapper)) [S], a tail that mirrors who submits rather than who plays (*our read*). The Trivia API uses about ten broad categories such as Food & Drink [L].

*Our read:* use two layers. Ten or so stable categories drive balance and per-category stats. Free-form tags ("Flags", "1990s", "Space", "Dinosaurs") drive themed packs and SEO pages. Food & Drink and Language & Words travel well across regions; sport needs region tags.

### 6. Cultural and regional fairness

English speakers share neither a school curriculum nor a sports calendar. Common traps [K]:

- Spelling: colour or color, aluminium or aluminum.
- Numeric dates: 03/04 is March 4 in the US and 3 April in the UK.
- Holidays: Canada's Thanksgiving falls in October, the US one in November.
- "Football" names different games in different countries.
- Civics: US presidents and British monarchs are local knowledge.
- Contested firsts, as in section 2.

Wikitrivia shows a cheap signal of global fame: its Wikidata queries use sitelinks (how many Wikipedia language editions cover an item) "as a rough popularity signal", drop items below 10 "to cut off very obscure entries", and take the earliest year when dates differ ([source](https://github.com/tom-james-watson/wikitrivia)) [V]. Fame across many languages beats fame in one country. Sensitivity matters too: a racist user-submitted question went viral although Trivia Crack never approved it ([Snopes](https://www.snopes.com/fact-check/trivia-crack/)) [R].

### 7. Fact-checking standards

Errors spread because trivia sources copy each other. Fred Worth planted a fake fact in his trivia encyclopedia (Columbo's first name, "Philip"). It turned up in Trivial Pursuit, and his lawsuit failed because facts carry no copyright ([Wikipedia](https://en.wikipedia.org/wiki/Trivial_Pursuit)) [K]. Myths such as the Great Wall being visible from space still circulate as facts ([Wikipedia](https://en.wikipedia.org/wiki/List_of_common_misconceptions)) [K].

Volume does not fix this. Trivia Crack published roughly 1,000 of every 200,000 submissions, and errors still slipped through ([Windows Central](https://windowscentral.com/trivia-crack-hit-growing-pains-thanks-flood-user-submitted-questions)) [R]. AI drafts fail too. In a medical-exam comparison, AI-written items had more factual errors (6% vs 4%) and more duplicates (14% vs 7%) ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11806894/)) [R], and a second study rejected 31% of AI items ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11854382/)) [R].

The professional answer is separation. TV quiz shows keep researchers apart from writers ([Wikipedia](https://en.wikipedia.org/wiki/Jeopardy!)) [K], and report 06 proposes two independent sources, one of them primary [R]. *Our read:* superlatives, firsts, numbers, quotations and etymologies deserve a second look, because those claims go wrong most often.

### 8. Handling time-sensitive facts

Facts flip faster than banks update. Kazakhstan renamed Astana to Nur-Sultan in 2019 and changed it back in 2022 ([Wikipedia](https://en.wikipedia.org/wiki/Astana)) [K]. Avengers: Endgame passed Avatar as the highest-grossing film in 2019, then Avatar retook the record with a 2021 re-release in China ([Wikipedia](https://en.wikipedia.org/wiki/List_of_highest-grossing_films)) [K]. Pluto lost planet status in 2006 ([Wikipedia](https://en.wikipedia.org/wiki/IAU_definition_of_planet)) [K], and Swaziland became Eswatini in 2018 [K]. Indonesia's planned capital move makes "What is the capital of Indonesia?" a question to park [K]. And the models drafting our content know little after mid-2026, so "current" facts stay out of the seed bank.

### 9. The explanation after each answer

Feedback with an explanation beat showing the right answer, which beat right/wrong alone, with mean effects of about 0.49, 0.32 and 0.05 ([Van der Kleij et al.](https://doi.org/10.3102/0034654314564881)) [R]. A 35-word line takes about 9 seconds to read ([Brysbaert](https://doi.org/10.1016/j.jml.2019.104047)) [R].

A good explanation adds a fact instead of restating the answer. For Canberra: "Sydney and Melbourne both wanted to be capital, so the constitution put the new capital in New South Wales but at least 100 miles (about 160 km) from Sydney" ([Wikipedia](https://en.wikipedia.org/wiki/Canberra)) [K]. That defuses the Sydney trap in 29 words.

### 10. Alternative formats

- **True/false.** Guessing gets half right, so keep it for myths and surprising truths. "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid" is true ([Wikipedia](https://en.wikipedia.org/wiki/Great_Pyramid_of_Giza)) [K].
- **Which came first.** Oxford was teaching by 1096; the Aztec city of Tenochtitlan was founded around 1325 ([Oxford](https://www.ox.ac.uk/about/introduction-and-history), [Wikipedia](https://en.wikipedia.org/wiki/Tenochtitlan)) [K]. Intuition says the opposite, which is the fun.
- **Ordering.** The Timeline card game and Wikitrivia ([source](https://github.com/tom-james-watson/wikitrivia)) [V] show the appeal, and Kahoot's Puzzle type brings it to classrooms [K]. Use well-defined dates, spaced far apart.
- **Closest number.** Wits & Wagers rewards the closest guess without going over ([Wikipedia](https://en.wikipedia.org/wiki/Wits_%26_Wagers)) [K], Kahoot has a Slider type, and pub quizzes settle ties with "nearest wins" [K]. Nobody is shut out, and scores spread.
- **Image.** WCAG 1.1.1 exempts a test "that would be invalid if presented in text", asking only for "descriptive identification" ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html)) [V]. Avoid near-twin flags such as Chad and Romania unless that is the point ([Wikipedia](https://en.wikipedia.org/wiki/Flag_of_Chad)) [K].

### 11. Open datasets: licensing and quality

- **Open Trivia DB** publishes under CC BY-SA 4.0 ([OpenTDB](https://opentdb.com/)) [K]. The license allows use "for any purpose, even commercially" and requires credit, any supplied copyright notice, a license link and a note of changes. Adaptations must carry the same license with no added restrictions ([deed](https://creativecommons.org/licenses/by-sa/4.0/), [legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)) [V]. Section 4 matters most: where database rights apply (as in the EU), putting "all or a substantial portion" of the contents into our own database makes that database, "but not its individual contents", Adapted Material [V]. The API serves only multiple choice and true/false, HTML-encoded unless you request URL or base64 encoding ([client types](https://github.com/Elitezen/open-trivia-db-wrapper)) [S]. Reported problems [L]: entity codes shown raw, uneven difficulty labels, a gaming and pop-culture skew, dated facts and weak distractors.
- **The Trivia API** ([site](https://the-trivia-api.com/)) has described its free tier as non-commercial [L]. Our planned supporter tier makes us commercial, so read the current terms first.
- **Jeopardy! and quiz bowl** archives such as [J! Archive](https://j-archive.com/) hold copyrighted writing [K].
- **Wikidata** is CC0 ([licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)) [K]; Wikipedia text is CC BY-SA [K]. Wikitrivia's FAQ tells players who find a wrong card to fix Wikidata itself ([source](https://github.com/tom-james-watson/wikitrivia)) [V], so treat Wikidata as a candidate source, never a fact-checker.
- **The law underneath.** In the US, facts are free but their expression is protected ([Feist](https://supreme.justia.com/cases/federal/us/499/340/)) [K], and the EU adds a separate database right ([Wikipedia](https://en.wikipedia.org/wiki/Database_right)) [K]. Writing our own questions from primary sources is the clean path. This is not legal advice.

## Implications for our product

1. **Item schema.** Format, stem, options, key, `accept[]` and `prompt[]` for type-in, an explanation of 35 words or fewer, two or more `sources[]` with one marked primary, writer and checker ids, `verified_at`, `volatility`, `review_by`, `region`, category, tags, seeded and measured difficulty, discrimination, status, license and attribution, and a descriptive label for any image.
2. **A pass/fail rubric in CONTENT_GUIDE.md:** a foothold, one defensible answer, no trick wording or negative stem, options of one kind and similar length, an explanation that adds a fact, and filled-in region and volatility tags.
3. **Options.** Four by default, three when a fourth would be filler, never "all/none of the above". Shuffle text options per player with the seeded RNG and sort numbers and dates ascending. Aim for options under about 24 characters (for report 05's 2 by 2 desktop grid) and stems under about 120 characters in timed modes.
4. **Difficulty.** Writers seed 1 to 5, and at least five test-solvers answer an item before it enters the Daily. Measured bands: Easy 80% and up, Medium 50 to 80%, Hard 25 to 50%, Expert under 25%. The Daily runs 3 Easy, 4 Medium, 2 Hard and 1 Expert, opening easy.
5. **Nightly auto-flags.** Pull an item from competitive pools when top-quartile players do no better than bottom-quartile ones, when a distractor outdraws the key among strong players, when its correct rate leaves its band, or when reports pass 2% of plays.
6. **Categories.** Launch with ten: Geography, History, Science & Nature, Film & TV, Music, Arts & Literature, Sport & Games, Food & Drink, Language & Words, and Society & Culture. "General knowledge" is a mix. Each Daily covers at least six categories and at most one sport item.
7. **Regional fairness.** Every item gets a region tag, and the Daily and global boards use `global` items only. Use dual units and spelled-out months. Type-in accepts both spellings. Reviewers come from at least two regions besides the writer's.
8. **Fame floor for generated candidates.** Ordering and "which came first" drafts from Wikidata need at least 10 sitelinks (Wikitrivia's cutoff) and the earliest date. A human still checks each one.
9. **Fact-check gate.** Every item needs two independent sources (one primary) and a checker who is not the writer, plus a pass against a myths list. AI may draft items and explanations, but humans verify each one, and a dedupe check runs against the bank.
10. **Volatility classes.** Evergreen (no expiry), slow (review every 24 months), fast (kept out at launch) and dated (year in the stem, never expires). Items past `review_by` leave rotation automatically.
11. **Explanations everywhere,** after right and wrong answers, written to address the most-picked distractor and linked to the primary source.
12. **Formats at launch.** Multiple choice, true/false (at most one per ten), which came first, ordering (four items, partial credit per correctly ordered pair) and closest number (one per Daily, which also breaks ties, scored by ratio error or years off). Image rounds, flags first, follow once a media-license check exists.
13. **Disputes.** "Report a problem" offers wrong, ambiguous, outdated, offensive and typo. Three distinct reports pull an item from ranked pools pending review. If a key changes, rescore affected attempts and tell those players.
14. **Creator lint.** The quiz editor warns on "all/none of the above", negative stems, option length gaps, duplicate options, missing explanations, numeric dates and time words ("current", "latest", "now", "reigning"). Public user quizzes still pass moderation (reports 01 and 02).
15. **Dataset policy.** The launch bank is original, with no OpenTDB import into the main database. Any later OpenTDB use lives in a separate, attributed BY-SA pack with a credits page, after legal review. No Jeopardy! or quiz bowl text; The Trivia API only under a written commercial license.
16. **Bank size.** A ten-question Daily uses 3,650 items a year, and no Daily item should repeat within a year. Reviewers notice repeats after about two weeks ([JustUseApp](https://justuseapp.com/en/app/6444166120/fun-frenzy-trivia-quiz-games/contact)) [R, L].
17. **Lookup resistance.** HQ's former host moved to word puzzles in 2026, saying AI had killed trivia ([TechCrunch](https://techcrunch.com/2026/02/20/remember-hq-quiz-daddy-scott-rogowsky-is-back-with-textsavvy-a-daily-mobile-game-show/)) [R]. Ranked pools should favor estimation and image items, which resist quick lookups, under short timers.
18. **SEO.** Indexable quiz pages carry original, checked content, since Google's spam policies target scaled content made mainly to rank ([Google](https://developers.google.com/search/docs/essentials/spam-policies)) [K].

## Anti-patterns to avoid

- Lookup facts with no foothold, and "hard" that only means obscure.
- Moses-illusion trick wording, and "Which is NOT" under a timer.
- Two defensible answers: undefined superlatives, contested firsts, counting conventions, near-tie dates.
- "All of the above", joke options in ranked play, mixed option types, a longest-option key, unsorted numbers.
- Current-holder questions without a year.
- Myths stated as fact, and other trivia sites used as sources.
- Explanations that restate the answer.
- US-default content in the global Daily.
- Wholesale imports of open datasets, and scraped Jeopardy! or quiz bowl text.
- Questions that turn tragedies or slurs into entertainment, or pry into private lives.
- Auto-publishing AI or user questions.

## Open questions

1. Check OpenTDB's live license page and category counts (GitHub Actions runners may reach it), then audit 200 items against our rubric.
2. What do The Trivia API's current terms and commercial prices say?
3. Legal: does rewriting facts first seen in OpenTDB create BY-SA adaptations, and how exposed are we to EU database rights?
4. Three or four options in ranked play, and do our difficulty bands hold? Test both in beta.
5. Which regional packs come first, and does the global rule make the Daily bland?
6. How do we measure fun per question: thumbs ratings, completion rates, shares or replays?
7. Re-run this track's searches when budget allows (Jeopardy! writers, LearnedLeague, ACF and NAQT guides, pub-quiz setters), and spot-check every [K] fact before it reaches the content guide.

## Sources

**Checked today [V] or read today [S]**
- https://creativecommons.org/licenses/by-sa/4.0/ (via github.com/creativecommons/cc-legal-tools-data)
- https://creativecommons.org/licenses/by-sa/4.0/legalcode.en
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html (via github.com/w3c/wcag)
- https://github.com/tom-james-watson/wikitrivia
- https://github.com/Elitezen/open-trivia-db-wrapper

**From reports 01 to 06 [R]**
- https://pubmed.ncbi.nlm.nih.gov/19619181/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC4252494/
- https://learningscientists.org/blog/2023/8/3-1
- https://eprints.soton.ac.uk/412186/1/Beyond_Hypercorrection_manuscipt_R2_Final.docx
- https://www.qbwiki.com/wiki/Pyramidal
- https://socalquizbowl.org/pyramidal-questions/
- https://doi.org/10.1111/j.1745-3992.2005.00006.x
- https://doi.org/10.3102/0034654314564881
- https://doi.org/10.1016/j.jml.2019.104047
- https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
- https://time.com/5038037/hq-trivia-app-game/
- https://www.gameskinny.com/reviews/review-trivia-crack-will-challenge-your-knowledge-and-friendships/
- https://windowscentral.com/trivia-crack-hit-growing-pains-thanks-flood-user-submitted-questions
- https://www.snopes.com/fact-check/trivia-crack/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11806894/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11854382/
- https://justuseapp.com/en/app/6444166120/fun-frenzy-trivia-quiz-games/contact
- https://techcrunch.com/2026/02/20/remember-hq-quiz-daddy-scott-rogowsky-is-back-with-textsavvy-a-daily-mobile-game-show/

**Background knowledge, not re-opened this session [K/L]**
- https://doi.org/10.1207/S15324818AME1503_5
- https://doi.org/10.1186/1472-6920-9-40
- https://doi.org/10.1111/j.1745-3984.2003.tb01099.x
- https://doi.org/10.1016/S0022-5371(81)90165-1
- https://www.learnedleague.com/
- https://en.wikipedia.org/wiki/Jeopardy!
- https://en.wikipedia.org/wiki/Pointless
- https://en.wikipedia.org/wiki/Trivial_Pursuit
- https://en.wikipedia.org/wiki/Wits_%26_Wagers
- https://en.wikipedia.org/wiki/Point-biserial_correlation_coefficient
- https://en.wikipedia.org/wiki/Helium
- https://en.wikipedia.org/wiki/Mauna_Kea
- https://en.wikipedia.org/wiki/Nile
- https://en.wikipedia.org/wiki/Continent
- https://en.wikipedia.org/wiki/Alberto_Santos-Dumont
- https://en.wikipedia.org/wiki/Astana
- https://en.wikipedia.org/wiki/List_of_highest-grossing_films
- https://en.wikipedia.org/wiki/IAU_definition_of_planet
- https://en.wikipedia.org/wiki/Canberra
- https://en.wikipedia.org/wiki/Great_Pyramid_of_Giza
- https://en.wikipedia.org/wiki/Tenochtitlan
- https://www.ox.ac.uk/about/introduction-and-history
- https://en.wikipedia.org/wiki/Flag_of_Chad
- https://en.wikipedia.org/wiki/List_of_common_misconceptions
- https://opentdb.com/
- https://the-trivia-api.com/
- https://j-archive.com/
- https://www.wikidata.org/wiki/Wikidata:Licensing
- https://supreme.justia.com/cases/federal/us/499/340/
- https://en.wikipedia.org/wiki/Database_right
- https://developers.google.com/search/docs/essentials/spam-policies
