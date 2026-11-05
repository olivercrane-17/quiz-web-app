# RITE round 2: persona playtest of the M1 greybox

**Date:** Thursday 5 November 2026 · **Build:** production build of the playtest worktree at `7ecf6df` (built 10:49 UTC), one server on port 3120 for all five personas, mock backend, fixture content · **Round:** 2 of at least 3 (PRD §9.3, M1) · **Judged by:** the PRD §9.4 rubric · **Previous round:** [rite-1.md](./rite-1.md); its fixes, and the decisions in 02-PRODUCT-DECISIONS §19, are in this build

## The short version

Five persona agents played Daily #46 on a build with round 1's fixes in it, and Marcus came back the next morning for #47. The fixes held. All five copied their result and would post it (in round 1 nobody could), all five answered the comprehension questions this build can ask before opening any help, nobody felt rushed by the stopwatch, and every link now opens a page inside the app.

- **0 P0, 3 P1, 31 P2**, merged from 66 findings. Two of the P1s are confusion. The third is a defect that confused nobody but skews every score.
- **The M1 gate fails**, on two counts. Two P1 confusions remain. Leaving the Daily says "Saved" while the stopwatch keeps running, so Priya and Marcus thought it had stopped, and Marcus played on that belief. And the letter keys answer from the question's heading, which cost Sam a practice question and, in Dee's test, a whole Mystery. Separately, question 4 of the comprehension check still can't be asked, because there's no percentile. Section 10 sets out what round 3 must show.
- **Comprehension: 15 of 15** on questions 1 to 3, all before any help. All five also said nothing in play tells you whether the Encore or time breaks a tie first.
- **Clue 4 was answer-first for everyone.** Every fresh browser mints the same mock attempt id, so every new player saw the same option order, and on #46 that order put the answer at A three times out of three. Only Dee noticed.
- **Fun 7.0** (five 7s, up from 6.3) and **would share: 5 of 5** (up from 0). Most of what they asked for next is M2 and M3 work: Groups, a streak, past results, and real Privacy and Terms pages. The trust pages reached main ten minutes after this build was cut.

## 1. Method

### What changed from round 1

Round 1's report asked for six changes to the method (its section 9).

| Round 1 asked for | What round 2 did | Result |
|---|---|---|
| Run the four questions verbatim after each first Daily, and store the answers | Questions 1 to 3 asked after each first Daily, before any help page; answers in section 2 and Appendix A | Question 4 can't be asked without a percentile. Transcripts still aren't beside the E2E reports (shortfall 6) |
| Time each Daily from the server's figures, not the on-screen clock | The stop screen now shows the server's total (D7), and that's the figure recorded | Agent pace makes it a weak estimate of human time (shortfall 5) |
| One build per port, or one build for everyone | One build on one server, port 3120, for all five | Share links pointed where people played, so R1-18 is gone |
| Lena's slot on a low-end Android over slow 4G | Instagram in-app user agent, slow 4G with 4× CPU slowdown, and a soft keyboard simulated by cutting the viewport to 350 px while typing | §9.3's sixth persona type is covered, on a loaded machine (shortfall 4) |
| Replace #45's unsolvable Mystery 3, or play real content | All five played #46, whose bismuth clues now pin the answer (R1-30); Marcus also played #47 | Still fixture content, so Mysteries 1 and 2 were partly luck (shortfall 2) |
| One persona on a second Daily with a returning identity | Marcus played #47 with the page clock at Friday 6 November, 09:00 IST | The first-Daily hints stayed away, as they should |

New probes this round: Marcus moved the page clock to time idling on a reveal, mid-Mystery and away from the Daily; Lena made the clipboard refuse a copy to reach the fallback; Sam played a second Daily on a 390×844 phone with 200% text and the stopwatch hidden; Dee replayed in private windows to compare option orders.

### Who played

| Persona | §9.3 slot | Device and setup | Daily | Score | Time recorded (header at Lock in) | Quick Play | Fun | Would share |
|---|---|---|---|---|---|---|---|---|
| Priya | Daily-ritual player (PRD §2.1); non-US English | 390×844 touch, clipboard only; dark mode checked; two extra fresh windows for the menu and the pills | #46 | 7/12, Encore 13% off (close) | 4:51 (4:53) | 5/10 | 7 | Yes |
| Dee | Trivia buff | Desktop, keyboard first; private windows to compare option orders | #46 | 8/12, Encore 17% off | 3:05 (3:07) | 7/10, then 4/10 | 7 | Yes |
| Marcus | Host of an office quiz; non-US English (en-IN) | Android-sized mobile Chromium, clipboard only; page clock moved for the idle tests | #46, then #47 as a returning player | 7/12, 18% off; then 7/12, Encore spot on | 3:00 (3:03); then 6:44 (6:46), with five minutes away | 5/10 | 7 | Yes |
| Sam | Screen-reader user | Desktop 1280×800 at 200% zoom, keyboard only, read through the accessibility tree and a live-region log; a second Daily at 390×844 with 200% text and the stopwatch hidden | #46, twice | 9/12, 18% off | 3:49 (3:51); the second run 2:27 | Not reported | 7 | Yes |
| Lena | First-time casual player from a friend's link; low-end Android over slow 4G; non-US English | Instagram in-app user agent, slow 4G with 4× CPU slowdown, simulated soft keyboard | #46 | 7/12, 18% off | 1:35 on a replay (her first run was heading for about 4:00) | 9/10 | 7 | Yes |

**Content.** The mock serves fixture Dailies from `content/fixtures/`, set in the invented realm of Arvenna except for the element Mysteries. #46 (Thursday 5 November) was a person (Easy, Odile Marsh), a country (Medium, Valdoria), an element (Hard, bismuth) and an Encore on the steps of the fixture Harbour Tower (212). #47 was a film (The Lantern Keeper), cobalt, the fixture country Arvenna and an Encore on the year the fixture Gorlund Games began (1388).

**Severity.** As in round 1, I re-judged every finding against PRD §9.4, so a persona's own label is shown but doesn't decide it.

- **P0:** a Must flow couldn't be finished, or a persona acted on a wrong belief about a rule.
- **P1:** a persona needed more than one try at a step, or misread a score, a rule or the page they were on.
- **P2:** friction without a wrong belief.

One addition this round: a **Kind** column. *Confusion* is what §9.4 grades and what the M1 gate counts. *Defect* marks a fault that confused nobody but corrupts what a round measures, or would ship a bug. A defect still gets an owner and a fix; the confusion gate just doesn't count it. The merge rule is round 1's: the same root cause and the same fix make one finding, and "hit by" counts every persona who met it, think-aloud included.

### Where this round fell short

1. **The build was cut ten minutes too early.** `7ecf6df` was built at 10:49 UTC. LGL-1 (the seven trust pages, merged at 10:59) and IDN-2 (sync codes, restore, claim links and in-app detection, merged at 10:57) landed on `claude/sleepy-hamilton-p0f789` just after. So all five trust-page reports, and Lena's report that progress lives in one browser, describe code that main has since replaced. Lena guessed as much from the commit log.
2. **Fixture content still limits Mysteries 1 and 2.** Every persona solved Mystery 1 on clue 1 the same way: clue 1 says "Her survey notes", and "ma" lists four names, only one or two of which fit "her". Dee called Mysteries 1 and 2 "a lottery". Only Mystery 3, which uses real chemistry, measured knowledge.
3. **Clue 4 and one Encore were compromised.** Every new player saw the same answer-first option order (R2-03), and Practice handed Marcus the next day's Encore answer (R2-22). Clue-4 results and his day-2 bullseye say little.
4. **The low-end profile ran on a loaded machine.** Lena saw a load average near 10 on 4 cores, so her 4.9 s and 5.3 s to the first guess box are upper bounds. They time `/daily` opened cold, not AC-DLY-02's path from `/`.
5. **Times are agent times.** First plays recorded 3:00 to 4:51, with think-aloud and tool latency inside them (Priya estimates 30 to 60 s per step). Lena's only finished run is a replay after her browser died in Mystery 3, so her 1:35 doesn't count.
6. **Evidence is still outside the repo, and part of it lives in memory.** Transcripts and screenshots sit in `/tmp/pt2-*` and, for Priya and Dee, in `/dev/shm/pt2-*`, which is RAM-backed and gone at the next reboot. §9.4 wants them beside the E2E reports. This is the second round to miss that.
7. **The disk filled up mid-round.** From about 10:53 the root disk had 0 bytes free. Priya's shell lost its output, and Dee's Chromium crashed ("Page crashed", `net::ERR_INSUFFICIENT_RESOURCES`) until she moved shared memory and `TMPDIR` to `/dev/shm`. Lena's browser died mid-Mystery 3, and she replayed Mysteries 1 and 2 with the same moves in a fresh profile.
8. **Harness noise to look at.** No persona logged a console error, a page error or a 4xx or 5xx response. Priya's logs do show two requests aborted on the first load (`GET /api/restore` and `POST /api/identity`) and every direct page load navigating twice. Some request also stays open for about 30 s after load: a reload waiting for network idle took 31 s. Nobody could see any of it, but PLT should know.

## 2. Comprehension check

Asked as written after each persona's first Daily. All five answered before opening How to play or How scoring works, and said so. Their words are in Appendix A.

| Question (PRD §9.4) | Expected | Priya | Dee | Marcus | Sam | Lena |
|---|---|---|---|---|---|---|
| 1. What does solving a Mystery on clue 1 earn? | 4 points | Yes | Yes | Yes | Yes | Yes |
| 2. What does a wrong guess cost? | The same as Next clue: the Mystery is then worth one point less | Yes | Yes | Yes | Yes | Yes |
| 3. What does the Encore decide? | The tiebreak after points; it scores no points | Yes; unsure whether the Encore or time comes first | Yes; same doubt | Yes; same doubt | Yes; same doubt | Yes; same doubt, and "ranked against whom?" |
| 4. What does "so far today" mean? | The percentile counts only players who have finished so far | Can't be asked: this build has no percentile | | | | |

The doubt on question 3 isn't a wrong answer. The expected answer is "the tiebreak after points, no points", and all five gave it. Four of them guessed the order right (Encore, then time) and Sam didn't guess. It still deserves one line on screen (R2-04).

Round 1 inferred its answers from think-alouds: Sam got question 3 wrong, and Priya and Sam only knew question 2 after their first miss. Round 2 asked the questions and got 15 right answers out of 15, each before any help page. The check still can't pass. §9.4 needs all four questions from all five in the last round, and question 4 needs the percentile that M2 builds (section 10).

## 3. What improved since round 1

### Round 1's P0s and P1s, by ID

| ID | Sev | Round 1 finding | Status | Round 2 evidence | What's left |
|---|---|---|---|---|---|
| R1-01 | P0 | No Share or Copy button | Fixed | All five copied their result and saw "Copied. Paste it into your group chat."; Lena forced a clipboard refusal and got the selected "Copy this text" box; practice results share too | Where Share sits (R2-10) and what the grid says in a chat (R2-09) |
| R1-02 | P0 | Dead links ended on a bare 404 | Fixed | Every tab, the gear and every footer link opened a page inside the shell with Go to Today; the Practice tab has a hub with Quick play | Most of those pages are placeholders (R2-07) |
| R1-03 | P0 | The guess field at 200% text on a phone | Fixed | Sam played a whole Daily at 390×844 with 200% text, typing, picking and guessing through all four rounds, and reported no clipped input and no sideways scroll | Clue reflow (R2-17) and fixed-size header text (R2-27) |
| R1-04 | P1 | A wrong guess's cost was a surprise | Fixed | All five met the clue-1 line before their first guess and answered question 2 before any help; on Marcus's second day the first-Daily hints stayed away | |
| R1-05 | P1 | What the stopwatch is for | Fixed | All five saw "Take your time. Time only breaks ties."; nobody said they rushed (Sam: "a relief"); Marcus and Sam used Hide stopwatch; the stop screen reads "Time 4:51 · only breaks ties" | What it counts while you're away (R2-01) |
| R1-06 | P1 | The stopwatch reset on reload | Partly fixed | No reset on any reload, five of five | After a reload the header and the stop screen disagree by 2 or 3 s (R2-08) |
| R1-07 | P1 | The Encore's purpose for a solo player | Fixed | All five said it scores no points and breaks ties on points | Which tiebreak comes first (R2-04) |
| R1-08 | P1 | The header pills | Partly fixed | Solved pills show "+4", and nobody misread a score | They still look like buttons, and E stays blank (R2-06) |
| R1-09 | P1 | Screen-reader text from the previous page | Fixed, as far as round 2 can tell | Sam heard each new page's title, and nobody reported old status text or a second `main` | Today's bare title and the "Saved" collision (R2-29) |
| R1-10 | P1 | "1,200" rejected | Fixed in code, not exercised | `src/engine/encore/parse.test.ts` covers "1,200", "1,20,000" and "300,5" (D1); #46 and #47 take whole numbers, and nobody typed a comma | |
| R1-11 | P1 | Suggestions opened below the fold | Fixed | Nobody lost the list: Lena's simulated keyboard, Priya's 390×844 and Sam's 200% zoom all kept the rows in view | |
| R1-12 | P1 | At 200% zoom the fixed bars hid focus | Fixed | Sam: "focus never goes under the sticky bars (scroll padding works)" | |
| R1-13 | P1 | Number keys against numeric answers | Partly fixed | D6 shipped: letters pick, and digits stand down when an option is a number (Dee) | The keys act from the heading and commit at once (R2-02) |
| R1-14 | P1 | Practice feedback stole focus | Fixed | No focus jumps in Sam's runs | An unnamed scroll box adds a tab stop (R2-30) |
| R1-15 | P1 | "Works offline." before it did | Fixed | The Practice card reads "Ten questions on anything." | |

**Totals:** 12 of the 15 fixed (R1-10 only in code), 3 partly fixed, none still open as filed. Each partial fix left a narrower problem behind, filed below as R2-02, R2-06 and R2-08.

### Round 1's decisions in the build

Of D1 to D18 in the decisions memo's §19, round 2 saw 13 working as decided (D2 to D7, D10, D12 to D15, D17 and D18). Two are half done: D11's pills still have borders, and D16's "Close guess" never reached the stop screen. Nobody exercised D1's commas or D9's kept typing. D8 is this round's to settle.

### Round 1's questions for this round

- **Does the clue-1 hint answer question 2 before the first miss?** Yes. All five read it before guessing, and Priya, Dee, Marcus and Lena quoted it in the moment.
- **Does the new Encore copy fix question 3?** Yes. Nobody thought the Encore scores. What's left is the order of the two tiebreaks (R2-04).
- **Does the stopwatch hint stop the hurrying?** Yes. Nobody said they rushed, and Sam called the line "a relief". So **D8 resolves to: the stopwatch stays visible by default.** Lena's clock did start before she chose to play, but that's the share link (R2-20), not the default.
- **Does anyone share once there's a button?** All five did, and all five would post. Their notes on the grid are R2-09.

### What worked

- **The ladder is still the game.** Dee: "the Bismuth ladder is exactly how a pub-quiz question should be built." Priya and Lena reached bismuth through "expands as it freezes" and the rainbow crystals, and Marcus found #47's raven-to-Arvenna wordplay clever.
- **Resume is solid.** Every reload came back on the same clue, clock included (5 of 5), and Leave then Continue kept even Sam's half-made pick.
- **The tone lands.** Priya found "This one got away." "gentle, not shaming", and the practice "Not quite" read as kind.
- **Sharing works.** "No answers inside." reassured them, the clipboard path worked first time for all five, and when Lena made the clipboard refuse, the selected "Copy this text" box appeared.
- **Practice is easy to pick up and put down.** Quick play starts with no setup and keeps the answers in thumb reach. Leaving mid-run left "Continue practice · 1 of 10" on Today, with no nag (Priya, Lena).
- **The small fixes showed up.** "Your pick: Odile Marsh" in full (R1-28), "Last clue and options · then worth 1" (R1-33), the visible "Pick a name from the list, then Guess." (R1-29), "No matches. Try another spelling, or use Next clue." (D17), "Got there." after a miss (D10), the grid's legend (D3), "Encore off by 13%" (D4), the "Saved" toast (R1-38) and titles such as "Today's Daily · Knewt" (R1-20).
- **The accessibility basics hold.** Sam found a working skip link, one `h1` per page, thick focus rings, nothing hidden under the sticky bars, and the Encore's big "250" with "You're answering 250 steps". Priya: dark mode "looks great".

## 4. Ranked findings

Ranked by severity, then by how many personas hit it.

### P0 and P1

| ID | Sev | Kind | Finding | Hit by | Persona labels | Owner | Against the spec |
|---|---|---|---|---|---|---|---|
| R2-01 | P1 | Confusion | Leaving the Daily says "Saved", but the stopwatch keeps running while a clue is open, and nothing in play says so. Priya and Marcus believed it had stopped; Marcus was away five minutes mid-Mystery and recorded 6:44 for about 1:45 of play | 4/5 (Priya, Dee, Marcus, Lena) | P1 ×2, P2 ×2 | DLY | Copy gap. The rule is the spec's (PRD §3.1.3, §4.1.4), but "progress is saved" (§3.1.3) and the "Saved" toast (DESIGN §6.9) read as a pause |
| R2-02 | P1 | Confusion | Letter and digit keys answer from the question's heading, at once and for good, with no visible hint and no way to turn them off. A stray "c" cost Sam a practice question; in Dee's test, typing "Cartographer" once the clue-4 options appeared threw away the Mystery | 2/5 (Dee, Sam) | P1 ×2 | MYS, with PRA and DS | Bug: PRD §3.0.3 promises a switch (§3.12) that doesn't exist yet; fails WCAG 2.1.4, so release criterion R2 as well |
| R2-03 | P1 | Defect | Every new player on the mock gets the same clue-4 option order, and on #46 that order puts the answer at A on all three Mysteries | Found by Dee; all five played it | P1 | DLY, with MYS | Bug in the mock: PRD §3.1.3 stores a shuffle per attempt, and every fresh browser repeats one |

### P2

| ID | Finding | Hit by | Owner | Fix | When |
|---|---|---|---|---|---|
| R2-04 | The tiebreak order is never said in play. The header says "Time only breaks ties", the Encore says "If you tie on points, the closer guess ranks higher", and only How to play gives the order. Nothing ranks anyone yet, while How to play promises results "so far today" | 5/5 | MYS, DLY | D21 | Before round 3 |
| R2-05 | "Choosing a category and a difficulty comes next." on the Practice hub reads as the step after Quick play. Priya thought she'd skipped one | 5/5 | PRA | "Coming soon: choose a category and a difficulty.", or drop the line | Before round 3 |
| R2-06 | The header pills and Today's round chips still look like buttons: all five read them as controls, and four tapped one. The E pill never shows the Encore's result. The stopwatch is a button by design (DESIGN §6.7), yet Priya's tap on it opened nothing, which needs a check | 5/5 | DS, DLY | D11 as decided: flat marks, no border or ledge. E shows 🎯 or the % off | Before round 3 |
| R2-07 | Groups, Me and Settings, and six of the seven footer pages, say only "This part of Knewt isn't ready yet." An empty Privacy page cost Priya some trust, and Groups was what Priya, Marcus and Lena wanted next | 5/5 | DS; LGL-1 (on main); GRP-1, STA-1, SET-1 | Build round 3 from main, which has the trust pages. Each placeholder says what's coming and what works now | Before round 3 |
| R2-08 | The header's time and the stop screen's disagree by 2 or 3 s after a reload or a Leave and Continue: Priya 4:53 and 4:51, Dee 3:07 and 3:05, Marcus 3:03 and 3:00 (then 6:46 and 6:44), Sam 3:51 and 3:49. Dee: "Which one breaks my tie?" | 4/5 (Priya, Dee, Marcus, Sam) | DLY | Section 6 | Before round 3 |
| R2-09 | The grid in a chat. A miss is 🟧🟧🟧🟧, which reads as "used every clue"; the pasted text carries no legend; 🟧 nearly vanishes on the orange score card; "Encore off by 18%" means little to the friend who receives it; the rows don't line up | 4/5 (Priya, Dee, Marcus, Lena) | DLY, DS | D22 for the miss. DS draws the card's rows on a cream inset. Words stay first (PRD §3.5.1) | Inset before round 3; the miss mark after D22 |
| R2-10 | Share sits under the share text box, below the fold at 360×640, and the sticky "Done for today" covers the box. Three personas hunted for it | 3/5 (Priya, Marcus, Lena) | DLY | Share straight under the score card, as PRD §3.1.6 says, still secondary | Before round 3 |
| R2-11 | No streak, games played, history or "welcome back", and no way to report a question | 3/5 (Priya, Marcus; Dee for reporting) | M2: STK-1, STA-1, F-RPT | Nothing for M1 | M2 |
| R2-12 | After Lock in, "See your results" sits below the fold at 390×844, and the page doesn't scroll to it | 2/5 (Priya, Marcus) | MYS | Scroll the result into view and dock "See your results" | Before round 3 |
| R2-13 | A guess is a pick and then Guess. With one match left, Guess still says "Pick a name from the list, then Guess.", and Enter takes two presses. (Dee, Sam and Lena pressed Enter twice without comment) | 2/5 (Priya, Marcus) | MYS | D23 | After D23 |
| R2-14 | Practice: an answer sends all four options to the top of the screen and the explanation follows about 1.5 s later, so Marcus wasn't sure his tap had counted | 2/5 (Priya, Marcus) | PRA | Leave the options where they are and bring the sheet up over the space below (PRD §3.0.3: nothing shifts). R1-21's fix moved the problem rather than removing it | Later |
| R2-15 | "Which is bigger?" compares two weights (`fx.p.food.0106`) | 2/5 (Priya, Dee) | PRA | "Which is heavier?", and a lint rule for it | Before round 3 |
| R2-16 | Clue 4 says "Pick one of four" and nothing more, so Lena and Marcus had to assume it's one pick and a wrong one scores 0 | 2/5 (Lena, Marcus) | MYS | D24 | After D24 |
| R2-17 | Clue text. At 200% text on a phone the numbered gutter takes about half the width, so clues run two words a line, and auto-hyphenation splits words ("This fix- / ture coun- / try"). At normal size Marcus saw "bil-lion", and a focus ring wider than the suggestion list under it | 2/5 (Sam, Marcus) | MYS, DS | Clue number above the card when the column is narrow; `hyphens: manual`; ring and list on one edge | Before round 3 (the ring later) |
| R2-18 | Help. How to play opens only from inside the Daily, so reading it costs time; it repeats How scoring works word for word; neither explains the 15% "close" band or that guesses come from the list; `/how-to-play` is a 404 | 2/5 (Dee, Sam) | DLY | D25. LGL-1's How scoring works on main already explains the bands and "% off" | After D25 |
| R2-19 | Today's card. The round chips start as one row ("Easy / Medium / Hard / Number") and grow to two when `get_today` answers, pushing Play down about 30 px. The ticket says "About 4 minutes" without DESIGN §1.4's "untimed", which Sam wanted to know | 2/5 (Lena, Sam) | DLY | Reserve two rows for the chips; "About 4 minutes, untimed" | Later |
| R2-20 | The share link opens `/daily`, which starts the Daily and its clock at once. Lena's stopwatch read 0:42 before she knew what she was looking at, and she never saw Today's intro card | 1/5 (Lena) | DLY | Point the greybox link at `/` until SHR-1's `/s/{number}/{code}` landing exists | Before round 3 |
| R2-21 | The combobox says "7 countries match" but lists six (PRD §4.1.3 caps the list), and ArrowDown wraps at the sixth. Sam went looking for the seventh | 1/5 (Sam) | MYS | D26 | Before round 3 |
| R2-22 | Defect. Practice gave away the next day's Encore: `fx.p.hist.0105` ("Which came first?") explains that the Gorlund Games began in 1388, and #47's Encore (`fx.e.0102`) asks for that year. Marcus scored a bullseye from memory | 1/5 (Marcus) | PRA, DLY | Section 6 | Before round 3 |
| R2-23 | Defect. The ascending fixture items put the key second: 5 of 7 at B. That feeds Dee's tally of A 4, B 8, C 1 and D 1 over 14 practice questions, and chance did the rest, since shuffled items are fine (20,000 seeded shuffles split evenly) | 1/5 (Dee) | PRA | Respread the fixture keys; a pool rule on key positions (CONTENT_GUIDE §4 rule 7 asks writers for this, and nothing checks it) | Before round 3 |
| R2-24 | The stop screen's Encore band still reads "Close", which on its own grey line looks like a dismiss button. D16 asked for "Close guess", and the Encore screen has it | 1/5 (Priya) | DLY | "Close guess" | Before round 3 |
| R2-25 | A clue-4 option locks in on one tap. Marcus aimed at C, hit D and lost the Mystery; guesses take a pick and Guess, and the Encore takes Lock in | 1/5 (Marcus) | Decision | Keep commit on release for touch (PRD §3.0.3) and watch round 3; D20 adds a confirm for keys | Watch |
| R2-26 | Keyboard flow. At a fresh Mystery, typing goes nowhere because focus is on the heading; "/" stops working once focus falls to the page body; there's no key for Next clue; T and F do nothing on true or false | 1/5 (Dee) | MYS, PRA | At clues 1 to 3, a letter typed in the round moves focus to the field and keeps the letter; "/" page-wide; T and F on true or false | Later |
| R2-27 | Large text. At 200% the header pills, stopwatch and A to D badges stay at 15 px; the guess box's Clear (×) disappears; the number line's end labels drift off its ends; a share row on the stop card wraps two and two | 1/5 (Sam) | DS, MYS, DLY | Sizes in `rem` with a header that may wrap; Clear as a text button under a narrow field (a phone has no Escape); labels pinned to the line's ends; each row on one line | Later |
| R2-28 | Contrast. The placeholder measures 3.24:1; upcoming practice segments 1.10:1 (fill) and 1.22:1 (border); the Encore's two bands are near-identical teals | 1/5 (Sam) | DS | 4.5:1 for the placeholder ([WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)); a 3:1 outline on upcoming segments ([WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)); an edge or a pattern between the bands | Later |
| R2-29 | Screen-reader and low-vision details. Today's title is only "Knewt"; "Saved" and the route announcement speak at once; Back puts focus at the top of main, so each footer page cost 5 to 10 Tabs; Hide stopwatch says nothing; the share toast is gone in 4 s; each practice options list is named with the whole question; true or false has no "True or false:" cue; the share text reads out square by square | 1/5 (Sam) | DS, DLY, PRA | "Today · Knewt"; "Saved" after the route announcement; focus back on the link you left from; "Stopwatch hidden. Show it again from More."; Share's own label reads "Copied" for a while; options named "Answers"; "True or false:" before the statement | Later |
| R2-30 | Practice feedback at 200% zoom: an unnamed scroll box (`div tabindex=0`) adds a tab stop, so the Tabs to Next question vary, and Sam's Enter opened Learn more instead | 1/5 (Sam) | PRA | Name the region ("Explanation") or avoid the nested scroll; Next question at a fixed tab position | Later |
| R2-31 | With the keyboard up, a wrong guess's "Not The Amber Isles" stamp and the worth scale scroll away, so only the new clue says anything happened | 1/5 (Lena) | MYS | A line by the field: "✕ Not The Amber Isles · now worth 2" | Later |
| R2-32 | A cold `/daily` on slow 4G shows about 5 s of beige bars with no words. Lena: "is this broken?" | 1/5 (Lena) | DLY, DS | Render the round label at once, or "Loading today's Daily…" with the mark | Later |
| R2-33 | Progress lives in one browser: a fresh profile opened #46 from scratch, so a visitor who starts in Instagram and later opens Chrome loses the day | 1/5 (Lena) | IDN-2 (on main) | Round 3 looks at IDN-2's claim offer (flow 5.14) | Round 3 check |
| R2-34 | State bugs. The second practice results open with item 1's "Why" already expanded from the first run, and `/settings` underlines Me in the tab bar | 1/5 (Dee) | PRA, DS | Key the expanders by run and question; no active tab on `/settings` | Later |

**Re-graded.** Eleven persona P1s are P2 here. R2-07 (all five, Marcus twice): each persona read "isn't ready yet" correctly and got back with Go to Today, the pages are M2 and M3 scope, and main already has the trust pages. R2-11 (Marcus): the streak belongs to M2's STK-1, and nothing was misread. R2-17 (Sam): the clues are tiring at 200% text but readable, with no sideways scroll, so [WCAG 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) holds. R2-20 (Lena): no wrong belief, though the fix is one line and goes in before round 3. R2-21 (Sam): he heard "7 countries match" and found six, and nothing he did depended on the seventh. R2-22 (Marcus): a fixture defect the real bank already checks for. Part of Dee's time finding became R2-08, which is P2 because four personas noticed the gap and none took the wrong number for their time. Five persona P1s stand: Dee's three (in R2-01, R2-02 and R2-03, the last as a defect), Marcus's (R2-01) and Sam's (R2-02). Priya's and Lena's P2s on the stopwatch join R2-01, since Priya held the same wrong belief as Marcus.

## 5. Fixes for every P1

Each fix names its owning area, the files most likely involved and a check a test can encode. "E2E" means Playwright against the mock backend.

### R2-01 (P1, confusion): "Saved", while the stopwatch keeps running

**Hit by** four. Priya left a Daily for about 40 seconds and came back to find the stopwatch had moved from 0:16 to 0:59: "'Saved' made me think the clock had paused." Marcus left mid-Mystery on day 2 when "the boss walked in", stayed away five minutes on the page clock, and came back to 5:57 where he'd left 0:40. His stop screen said 6:44 for about 1:45 of play. Then he measured it: two idle minutes on a reveal added nothing, two idle minutes mid-Mystery added 2:00, and three minutes on Today after leaving added 3:00. Dee timed 21 s away as 21 s on the clock and watched it run behind How to play (0:13 to 0:17). Lena's reading of How to play cost her eight seconds, and she only found Hide stopwatch after her run.

The build does what the spec says. A round's interval runs from its clue's issue to the request that resolves it (PRD §4.1.4), so time away from an open clue counts and a reveal doesn't. Nothing tells the player. The X is named "Leave the Daily. Your progress is saved." and the toast says "Saved"; next to "Take your time", both read as "paused". LGL-1's How scoring works on main says time counts while a clue is open, but nobody reads that mid-game.

Why P1 and not P0: Marcus did act while holding a wrong belief about a rule. He left because of the scenario, though, not because of the belief, and the belief cost him only the third ranking key. If a round 3 persona leaves, or lingers in How to play, *because* they think the clock has stopped, that is a P0.

- **Owner:** DLY.
- **Files:** `src/features/daily/client-copy.ts` (`leave`, `saved`), `src/features/daily/screen/leave-toast.ts` (which toast, by whether a clue or the Encore was open), `src/features/shell/play-header.tsx` (the X's accessible name), `src/features/daily/how-to-play.ts` (the ranking part), `src/features/daily/home-card.tsx` (the In progress card), and on main LGL-1's `src/features/legal/documents/how-scoring-works.ts` (its "Total time" paragraph).
- **Fix (after D19):** keep the rule, and say it where the belief forms.
  - Leaving while a clue or the Encore is open: the X reads "Leave the Daily. Your progress is saved, and the stopwatch keeps running." and the toast "Saved. The stopwatch keeps running." (Priya's own words). Leaving from a reveal keeps "Saved", because the clock is stopped there.
  - How to play's ranking part, and How scoring works: "The stopwatch runs while a clue is open, even while you're away or reading this, and stops on every reveal."
  - A How to play link on Today's card (D25), so the rules can be read before the clock starts.
  - Optional: the In progress card adds "Your stopwatch is still running." when the open round is a clue, and the first-Daily hint carries a "Hide it" link for people like Lena.
  - Not recommended: pausing the clock on leave. The server's interval is the official time (PRD §4.3.2, §4.3.3), and the honest-play checks rely on lookups happening inside an open round (ARCHITECTURE D7). A pause would change both.
- **Test:**
  - Component: leaving with a clue open shows "Saved. The stopwatch keeps running." and mirrors it to the status region; leaving from a reveal shows "Saved".
  - E2E under the mock clock, fresh identity: on Mystery 1 clue 1, press the X, and the toast contains "keeps running". On Today, advance the page clock 120 s and press Continue: the stopwatch reads at least 2:00. Solve Mystery 1, press the X on its reveal, advance 120 s and Continue: the stopwatch hasn't moved.
  - Unit: How to play's ranking part says the stopwatch runs while you're away.
  - Round 3: the probe in section 10.

### R2-02 (P1, confusion): Option keys answer from the heading

**Hit by** Dee and Sam. In Quick Play, Sam pressed "c" with focus on the question's heading, where the app had just put it, and it answered at once: "Not quite. It's the bell comb." (`/tmp/pt2-sam/shots/034-qp-q1-after-c.png`). On the phone at 200% text, "a" on the auto-focused clue-4 heading spent his Daily pick. Dee pressed B for Rosmaar and it locked with no confirm. In a private window she then showed the worse case: once the guess box gives way to the four options at clue 4, typing a name, "Cartographer", locked in option C, Liesl Varo, on its first letter. "This one got away. 0 points." (`/dev/shm/pt2-dee/shots/093-hazard-after-typing.png`). Anyone who keeps typing after a wrong guess on clue 3 could do the same.

The Mystery listens for A to D (and 1 to 4) on the whole round's `<section>`, headings included, and sends the pick on keydown (`onKeyDown` in `src/features/rounds/mystery/index.tsx`). Choice rounds commit on keyup anywhere in the question region, its heading included (`src/features/rounds/choice/index.tsx`). The only hint, "Keys A to D, or 1 to 4, pick.", is `sr-only` text in `options.tsx`, and Quick Play has none. PRD §3.0.3 promises a switch to turn the keys off (§3.12), but Settings is a placeholder until SET-1, and LGL-1's accessibility statement on main already says "Turn them off if they get in your way." Single-character shortcuts that act outside the focused component and can't be turned off fail [WCAG 2.1.4](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html) (Level A), so this blocks release criterion R2 as well as the gate. Round 1's R1-13 was the same class: a key meant one thing to the player and committed another.

- **Owner:** MYS for clue 4; PRA for choice rounds; DS for a legend slot in `AnswerButton`.
- **Files:** `src/features/rounds/mystery/index.tsx` (the section's `onKeyDown`), `src/features/rounds/mystery/options.tsx` (`optionForKey`, the `role="group"` that should own the keys, the `sr-only` hint), `src/features/rounds/mystery/copy.ts` (`options.keys`), `src/features/rounds/choice/index.tsx` (the region-level handler and `shortcutsOn`), `src/ui/answer-button.tsx`.
- **Fix (after D20):**
  - Move the key handler from the round's section to the options group, so keys act only while focus is on an option. That is WCAG 2.1.4's "active only on focus" route, and it holds until SET-1 ships the switch.
  - On clue 4, a key chooses: it moves focus to that option and marks it. Enter, or the same key again, locks it in. Practice keeps one key per answer inside the group.
  - Once a keyboard is in use, show the legend on screen: "Keys A to D choose. Enter locks in."
  - Ask LGL-1 to show the accessibility statement's "Turn them off" line only once Settings has the switch.
- **Test:**
  - Component (Mystery): clue 4 open, focus on its heading, press "c": no pick is sent. Focus option A and press "c": option C has focus and is marked, and still no pick is sent. Press Enter: one pick, for C.
  - Component (choice): focus on the heading, press "c": nothing commits. Focus an option and press "c": C commits.
  - E2E (Dee's repro): on Mystery 1, guess wrong until the options show, then `page.keyboard.type("Cartographer")`. The round is still open, the worth scale still reads 1, and no reveal shows.
  - E2E: after the first key press at clue 4, the legend is visible.

### R2-03 (P1, defect): The same clue-4 order for every new player

**Found by** Dee; all five played it. On #46 the answer was option A on all three clue-4 pickers (Odile Marsh, Valdoria, Bismuth), and a second anonymous window showed the same order (`/dev/shm/pt2-dee/shots/094-m3-clue4-options-private.png`). It fits the other sessions: Marcus's day-1 pick was A, Sam's Tab and Enter landed on Valdoria, and Sam's fresh phone run pressed A and scored. Dee: "Anyone who spots this can bank 1 point per mystery by pressing A."

I traced it. The mock's database lives in each browser's localStorage, and a fresh one always starts its id sequence at 1 with the RNG seeded "qz". So every fresh browser mints the same first attempt id (`03c3a568-33c4-45c2-90eb-706ed374d6de`), and the option shuffles fork from that id. Rerunning them with the engine's own RNG gives the key at A, A and A on a browser's first attempt, and at A, A and C on its second, which is exactly where Marcus found Arvenna on day 2. Across 20,000 consecutive ids each position comes up 25% of the time, so the RNG is fine and the repeat is the bug. Appendix B has the snippet.

It confused nobody, so the confusion gate doesn't count it. It is a P1 anyway, for two reasons. Anyone who notices gains a point per Mystery, so round 3's scores and clue-4 behaviour mean nothing until it's fixed. And the SQL Daily, which will draw shuffles with `gen_random_bytes` (ARCHITECTURE §4.2), has no test yet that would catch the same mistake.

- **Owner:** DLY (the mock's sealed area), with MYS for the contract test.
- **Files:** `src/backend/mock/server/sealed.ts` (`nextUuid`, and `judgeContext`, which forks `attempt:<id>:round:<n>`), `src/backend/mock/context.ts` (the "qz" seed), `src/backend/mock/index.ts` (`__QZ_MOCK_INIT__` and its `seed`), `src/backend/mock/store.ts` (one database per browser), `src/engine/rounds/mystery/options.ts` (`optionOrder`), `src/backend/contract/` (where a `daily.contract.ts` would sit beside `identity.contract.ts`).
- **Fix:** fork the shuffle from the player as well: `player:<playerId>:attempt:<id>:round:<n>`. Player ids come from `crypto.getRandomValues` (`src/platform/identity/local.ts`), so two browsers won't share an order. Seeding the browser mock from random bytes whenever `__QZ_MOCK_INIT__` sets no seed would also work. Either way, an E2E that relies on a fixed order should pin its seed and identity and say so. When SQL-4 and SQL-5 bring the real Daily, the same contract test runs against it.
- **Test:**
  - Contract, on the mock now and on SQL later: 200 seeded identities each start #46 and take Mystery 1 to clue 4; each display position holds the key between 30 and 70 times.
  - Regression: two fresh mock stores with different player ids don't produce the same order on all three Mysteries.
  - Round 3: Dee's private-window check comes back with different orders (section 10).

## 6. P2 fixes to land before round 3

Each of these is small, and together they remove most of the noise round 3 would otherwise log again.

- **R2-04, the tiebreak order (MYS, DLY; after D21).** Encore: `tiebreak` in `src/features/rounds/encore/copy.ts` gains "Time only counts after that." Stop screen: `encoreNote` in `src/features/daily/client-copy.ts` becomes "Breaks ties: closest Encore first, then time. Scores no points." How to play: the "so far today" sentence in `src/features/daily/how-to-play.ts` shows only once the stop screen has a percentile. *Test:* component checks for both lines, and How to play has no "so far today" while the percentile is off.
- **R2-05, the Practice hub line (PRA).** `hub.later` in `src/features/practice/copy.ts` becomes "Coming soon: choose a category and a difficulty." *Test:* the hub's text contains "Coming soon" and not "comes next".
- **R2-06, pills and chips (DS, DLY).** D11 as decided: no border and no ledge for the M1 to E pills (`src/ui/progress-segments.tsx`) and Today's round chips. `progressSegments` in `src/features/daily/model/labels.ts` gives E a mark once the Encore resolves: 🎯 inside the bullseye band, else the % off. *Test:* E2E, the pills' computed border width is 0 and their cursor isn't `pointer`; after Lock in, E's accessible name contains the % off.
- **R2-07, placeholders (DS).** Round 3 runs on a build from main, which has LGL-1's trust pages. `PagePlaceholder` (`src/features/shell/page-placeholder.tsx`) takes one line per destination. Groups: "Groups are on the way. Until then, paste your result into your group chat." Me: "Your streak and past results will live here." Settings: "Settings are on the way. Hide stopwatch is in the Daily's menu." *Test:* each placeholder route renders its own line; LGL-1's E2E already covers the trust pages.
- **R2-08, one clock (DLY).** The cause is in `src/backend/mock/server/sealed.ts`. After a reload or a Continue, the header adds the open round's raw server interval (`openRoundMs` in `snapshotOf`), while the time recorded for that round is the larger of the server interval less 400 ms per request and the device's own measure (`effectiveRoundMs`, PRD §4.3.3). The reload cut the device's measure short, so the allowance decides, and the header ends about 400 ms per request above the record: 2 s for a round of five requests, 3 s for seven or eight. The snapshot also rounds each round to a second while the finish sums raw values. *Fix:* each verdict carries the round's recorded `activeMs`, and the controller (`src/features/daily/model/controller.ts`) replaces that slot's device time and offset with it; at Lock in the header freezes on the finish's `totalMs`; both sides add whole seconds per round. ENG's `round_action` contract needs the field too. *Test:* E2E under the mock clock: two wrong guesses and two reloads in Mystery 2, then finish; the header's time after Lock in equals the stop screen's `[data-time]`. Unit (`labels.test.ts`): a verdict with `activeMs` 75,000 on a slot that carried a 30,000 offset counts exactly 75,000.
- **R2-09, the card's grid (DS).** The score card's rows and legend sit on a cream inset, so 🟧 shows on the orange card in both themes. The miss mark waits for D22. *Test:* a screenshot check at 390 px in light and dark.
- **R2-10, Share's place (DLY).** In `src/features/daily/stop-screen/stop-screen.tsx`, render `ShareButton` straight after the score card and before the share text box (PRD §3.1.6), still secondary, and keep the dock from covering it. *Test:* E2E at 360×640 and 390×844: on `/daily/46/results`, Share lies inside the viewport and above the dock without scrolling.
- **R2-12, See your results (MYS).** After Lock in, scroll the result into view and dock "See your results" at the bottom, as the stop screen docks "Done for today" (`src/features/rounds/encore/index.tsx`). *Test:* E2E at 390×844: after Lock in, "See your results" is inside the viewport with no scroll.
- **R2-15, "Which is heavier?" (PRA).** Change the stem of `content/fixtures/practice/food-drink/fx.p.food.0106.json`, and add a lint rule: a comparison whose measure is mass, length or area can't ask a bare "Which is bigger?" (CONTENT_GUIDE §2 asks for the measure, and §12 lists "an undefined 'bigger'" among its worked failures). *Test:* the rule's unit test, and the fixture tree passes it.
- **R2-17, clue text (MYS, DS).** In the clue stack, put the clue number above the card when the column is narrow in `em`, and set `hyphens: manual` on clue, question and option text. *Test:* E2E at 390×844 with 200% text: the clue card is at least 80% of the viewport's width, and the clue text's computed `hyphens` is `manual`.
- **R2-20, the share link (DLY).** `SHARE_PATH` in `src/features/daily/share.ts` becomes `/` until SHR-1's `/s/{number}/{code}` landing exists (flow 5.1 starts on a landing, not on clue 1). *Test:* unit, `dailyShareLink("https://x")` is `https://x/`. E2E: a fresh context opens the link and sees Today's card with "Play today's Daily" and no attempt in the mock, and one tap reaches clue 1 with the stopwatch at 0:00.
- **R2-21, the match count (MYS; after D26).** In `src/features/rounds/mystery/combobox.tsx` (`countText`) and `copy.ts` (`count`), when `result.total` is more than the rows shown, say "7 countries match. Showing 6, so keep typing." and show the second sentence under the list. *Test:* component with seven matches: the status text contains "Showing 6", and the listbox has six options.
- **R2-22, the overlap (PRA, DLY).** PRA rewrites `content/fixtures/practice/history/fx.p.hist.0105.json` so it no longer states the Gorlund Games' year. CONTENT_GUIDE §10.5 bans this overlap, and `content:dedupe`'s cross-pool check (X29) enforces it for the real bank. On main, though, `npm run content:dedupe -- --cross-pool --fixtures --root content/fixtures` reports "Cross-pool check: not run, because no sealed Daily items are loaded." DLY makes `--fixtures` treat fixture Mysteries and Encores as Daily items and runs the check in CI. *Test:* the check passes on the fixture tree, and fails with X29 on the old `fx.p.hist.0105`.
- **R2-23, ascending keys (PRA).** Respread the keys of the seven ascending fixture items so no position holds more than three, and add a pool rule in `src/content/pipeline/lint/pool-rules.ts`: no position holds more than 40% of the pool's ascending keys (CONTENT_GUIDE §4 rule 7). *Test:* the rule's unit test, and the fixture pool passes.
- **R2-24, "Close guess" (DLY).** `bands.close` in `src/features/daily/client-copy.ts` becomes "Close guess", as D16 says. *Test:* the stop screen's Encore row for a 13% guess contains "Close guess".

## 7. Changes that need a decision

These are copy or flow changes the lanes shouldn't make alone. D19 to D21 hold up the P1 fixes and R2-04, so they come first.

| # | Doc and section | Proposed change | For |
|---|---|---|---|
| D19 | PRD §3.1.3 (Header, How to play's ranking part, Stopwatch); DESIGN §1.4 and §6.9 | Leaving while a clue or the Encore is open: the X's name becomes "Leave the Daily. Your progress is saved, and the stopwatch keeps running." and the toast "Saved. The stopwatch keeps running." Leaving from a reveal keeps "Saved". How to play's ranking part gains "The stopwatch runs while a clue is open, even while you're away or reading this, and stops on every reveal." The rule itself doesn't change | R2-01 |
| D20 | PRD §3.0.3 (Keyboard) and §3.1.4 (Clue 4); DESIGN §6.2 and §11; amends D6 | Option keys act only while focus is on an option. On the Daily's clue 4 a key chooses, and Enter or the same key again locks in; practice keeps one key per answer. Once a keyboard is in use, a legend shows: "Keys A to D choose. Enter locks in." | R2-02 |
| D21 | PRD §3.1.3 (How to play) and §3.1.5; DESIGN §1.4 (Encore prompt); amends D2 | The Encore line becomes "If you tie on points, the closer guess ranks higher. Time only counts after that." The stop screen's Encore row reads "Breaks ties: closest Encore first, then time. Scores no points." How to play's "so far today" sentence appears once the stop screen has a percentile | R2-04 |
| D22 | PRD §3.5.1 ("A miss is four passed squares"); DESIGN §6.11; amends D3 | A miss ends in ❌: 🟧🟧🟧❌. The legend becomes "🟧 clue used · ✅ solved · ❌ missed · ⬜ not needed", and the high-contrast set keeps ❌, since it reads by shape. A wrong guess and Next clue still look the same. Design runs PRD Q5's device checks on ❌ | R2-09 |
| D23 | PRD §4.1.3 rule 6 and AC-SUG-05; DESIGN §6.4; amends D5 | With exactly one selectable match highlighted, Guess (or Go) submits it | R2-13 |
| D24 | DESIGN §1.4 (Clue 4) | "Last clue. Pick one of four. One pick: a wrong one scores 0." | R2-16 |
| D25 | PRD §3.1.3 and §3.1.7; DESIGN §12.1 (Today's card) | Today's Daily card links "How to play", which opens the same sheet before the Daily starts | R2-18, R2-01 |
| D26 | DESIGN §6.4 and §1.4 (the match count) | When more match than show: "7 countries match. Showing 6, so keep typing." spoken, with the second sentence also under the list | R2-21 |

**Already decided or specified, and missing from the build** (no doc change): D11's flat pills (R2-06), D16's "Close guess" on the stop screen (R2-24), Share straight under the score card (PRD §3.1.6, R2-10), an explanation sheet that shifts nothing (PRD §3.0.3, R2-14), the ticket's "untimed" (DESIGN §1.4, R2-19), and the off switch for keys (PRD §3.0.3, which SET-1 builds; R2-02 covers the gap until then).

**Conflicts, and what we keep.**

- **Share as the primary button.** Priya, Marcus and Lena want Share big and "Done for today" small. PRD §3.1.6 and Appendix B keep "Done for today" as the stop screen's one primary button (AC-DLY-14), and §9.4 uses "looks for Share before finding it" as its own P2 example. Keep Share secondary, but put it where the spec says, straight under the card (R2-10).
- **Squares first.** Priya wants the rows to line up. Words first stays (PRD §3.5.1), for screen readers.
- **A streak in the share text.** Priya wants a 🔥 count. PRD §3.5.1 keeps the streak out of v1's share text, and DESIGN §6.8 makes it a tally, never a flame. Keep it out.
- **Pausing the stopwatch.** Priya, Marcus and Lena ask for a pause while away or in How to play. The server's interval is the official time, and the honest-play design depends on it (PRD §4.1.4, §4.3.2; ARCHITECTURE D7). Keep counting, say so (D19), and put the rules before the clock (D25).
- **Next clue against a free guess.** Dee says a wrong guess costing what Next clue costs makes the button pointless. PRD §4.1.2 chose this on purpose, and round 1 kept it. Keep it; the clue-1 line already tells players to have a go.
- **Where focus goes after How to play.** Sam wants it back on More, and AC-DLY-30 sends it to the clue. The ARIA dialog pattern allows a more logical target than the opener ([WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)), and the clue is where play resumes. Keep the clue.
- **Focus on the guess box at a new Mystery.** Dee wants the field focused on desktop. PRD §3.0.3 and §3.1.4 put focus on the heading for screen readers. Keep that, and let typing move focus to the field at clues 1 to 3 (R2-26).
- **A running total.** Sam adds 4 + 1 + 4 in his head. D11 decided on no visible total for now. Keep it, but the progress group's accessible name can carry the total ("5 points so far") at no visual cost.
- **A confirm on clue 4 by touch.** Marcus's slip argues for one, but one slip in five sessions doesn't yet outweigh an extra tap on every pick. Keep commit on release, with slide-off to cancel (PRD §3.0.3), add the confirm for keys (D20), and watch round 3 (R2-25).
- **A text-only share line.** Sam would like one without emoji. PRD §3.5.1 has one share text. Put it to Q5's VoiceOver and TalkBack checks instead of adding a second.

## 8. Notes for DS

The FIX-DS follow-up on DS-1's lane (decisions memo §20) owns `src/ui/**` and `src/features/shell/**`, so these are inputs to that lane:

1. Pills and chips as flat marks with no border or ledge (D11), with the current pill told apart from a focus ring. Check the stopwatch's tap at 390 px, since Priya's tap opened no menu (R2-06).
2. `PagePlaceholder` takes a line per destination on what's coming and what works now (R2-07).
3. `hyphens: manual` for clue, question and option text, and a focus ring that shares an edge with the suggestion list (R2-17).
4. A cream inset for the score card's rows, so 🟧 shows on the orange card (R2-09).
5. A visible key-legend slot in `AnswerButton` for D20 (R2-02).
6. `rem` sizes for the header pills, the stopwatch and the letter badges, with a header that may wrap to two rows at large text (R2-27).
7. Contrast: placeholder text at 4.5:1, a 3:1 outline on upcoming practice segments, an edge or pattern between the Encore's bands (R2-28).
8. Page titles and focus: "Today · Knewt", focus back on the link a Back came from, the Share button's own label reading "Copied" for a few seconds, and no active tab on `/settings` (R2-29, R2-34).

## 9. Fix list by area

| Area | P1 | P2 before round 3 | P2 later |
|---|---|---|---|
| DLY | R2-01 the leave label, toast and How to play line (after D19) · R2-03 shuffles forked per player in the mock | R2-08 one clock · R2-10 Share under the card · R2-20 share link to `/` · R2-22 cross-pool check on fixtures · R2-24 "Close guess" · R2-04 stop screen row and "so far today" (after D21) · R2-06 E's mark · R2-09 the miss mark (after D22) | R2-18 How to play on Today (D25) · R2-19 chip rows and "untimed" · R2-32 words on the loading screen · R2-29 "Saved" after the route announcement |
| MYS | R2-02 keys only on the options, choose then Enter at clue 4, a visible legend (after D20) · R2-03 the option-spread contract test | R2-04 the Encore line (after D21) · R2-12 dock See your results · R2-17 clue number above the card · R2-21 the match count (after D26) | R2-13 Guess takes the one match (D23) · R2-16 the clue-4 line (D24) · R2-26 type to focus, "/" page-wide · R2-27 Clear and the number line's labels · R2-31 a wrong-guess line by the field |
| PRA | R2-02 keys only inside the options in choice rounds | R2-05 the hub line · R2-15 "Which is heavier?" and its lint · R2-22 rewrite `fx.p.hist.0105` · R2-23 respread ascending keys, with a pool rule | R2-14 options stay put · R2-26 T and F keys · R2-29 "Answers" and "True or false:" · R2-30 the scroll box · R2-34 the expanders |
| DS | R2-02 a visible key legend in `AnswerButton` | R2-06 flat pills and chips · R2-07 placeholder lines · R2-17 `hyphens: manual` · R2-09 the card's inset | R2-27 `rem` sizes and a wrapping header · R2-28 contrast · R2-17 the focus ring · R2-29 titles, Back focus, the Copied label · R2-34 no active tab on `/settings` |

**Outside the four areas.** R2-11 (streak, history, reporting) is M2's STK-1, STA-1 and F-RPT. R2-33 and the trust-page half of R2-07 are already on main (IDN-2, LGL-1). Groups, Me and Settings themselves are GRP-1, STA-1 and SET-1. R2-25 is a watch item.

## 10. The M1 gate

### Verdict: round 2 does not pass

PRD §9.3's exit reads: "The last round finds no P0 or P1 confusion and passes the comprehension check (§9.4)." Round 2 fails both halves.

1. **Two P1 confusions.** In R2-01, Priya and Marcus held a wrong belief about what the stopwatch counts, and Marcus played on it. In R2-02, a key press on a heading answered a question Sam hadn't chosen to answer, and Dee showed that the same slip costs a Daily Mystery.
2. **The check can't pass.** Questions 1 to 3 came back 15 of 15, but §9.4 needs all four questions from all five personas, and question 4 needs a percentile.

R2-03 isn't confusion, so the gate doesn't count it. Round 3 can't judge clue 4 or compare scores until it's fixed, though.

The distance left is shorter than "fail" suggests. Round 1 had three P0s and twelve P1s; round 2 has no P0, two P1 confusions and one defect, each small and understood down to the line of code. Every round-1 P0 and P1 is fixed or narrowed. If the fixes above land and nothing new turns up, round 3 can be the last M1 round.

### What round 3 must show

**To pass the gate:**

1. No P0 and no P1 confusion under §9.4 across five sessions, on a build with the three P1 fixes and every P2 marked "Before round 3".
2. All five answer questions 1 to 3 correctly before any help page.
3. A way through question 4. Either the owner records in the decisions memo that M1's check covers questions 1 to 3 and that question 4 moves to the first persona round with a percentile (M3's round, since DLY-3 builds the percentile in M2; R6 still needs all four at M5), or DLY builds a greybox "so far today" line from the mock's finished attempts so the question can be asked. Without one or the other, M1 can't exit whatever round 3 finds. I recommend the deferral: the percentile is M2 scope, and building it now would start M2 work before the M1 exit.

**To show the two P1s are gone** (asked after the comprehension check and stored with it):

4. Each persona leaves the Daily once while a clue is open, and comes back. Asked "While you were away, did your stopwatch keep counting?", all five say yes, and nobody treats leaving or reading How to play as free time.
5. Dee and Sam repeat their key tests. A letter on a heading commits nothing; typing a name once the options show commits nothing; at clue 4, A then Enter locks in A.
6. Asked "If two players tie on points, what decides?", all five say the Encore, then time. This isn't a P1 today, but it came from five of five this round, and the fix is one line.

**Method, so round 3 measures the format and not the harness:**

7. Build from main once the fixes merge, so LGL-1's trust pages and IDN-2's restore and claim link are in. Record the commit and the build time in the report, and serve one build to all five.
8. R2-03's spread test and R2-22's cross-pool check pass before anyone plays. Dee repeats her private-window check, and two fresh windows reach clue 4 of Mystery 1 with different orders.
9. Every persona's header time at Lock in matches the stop screen's, including at least one who reloads mid-Mystery (R2-08).
10. Keep the five slots. Lena opens the share link on the low-end Android profile and now lands on Today (R2-20). Marcus plays a second day with his returning identity. Sam plays with a screen reader at 200%. One persona finishes in an in-app browser to see IDN-2's claim offer (flow 5.14), which is M2's and outside the gate but cheap to watch.
11. A fixture Mystery 1 that doesn't give itself away: a clue 1 whose pronoun can't cut a four-name list to one or two, or a longer person list. Otherwise every Mystery 1 is a free 4 points again.
12. Before starting, at least 5 GB free on the root disk (round 2 ran out at about 10:53), and Chromium launched with shared memory and `TMPDIR` off `/tmp`, as Dee did. At the end, the transcripts, the check's answers and the screenshots go beside the E2E reports, and nothing stays only in `/dev/shm`.

### Decisions for the M1 exit

- **`options_from_clue` stays at 4.** Nobody stalled on typing in either round; the friction in guessing is the two-step submit (R2-13). PRD Q3's beta-week trigger still applies.
- **`daily_minutes` stays at 4.** First plays recorded 3:00, 3:05, 3:49 and 4:51 (median about 3:27), and Lena's first run was heading for about 4:00. These leave out reveal reading by design and include agent latency, so they bracket 4 rather than set it. The closed beta's median session sets it (PRD §3.1.7).
- **D8: the stopwatch stays visible by default.** The hint stopped the hurrying.

## Appendix A. Comprehension answers, verbatim

**Priya**
1. "4 points. The ladder starts at 4, the first clue said 'Get it from this clue for 4 points', and my first Mystery showed +4."
2. "The same as tapping Next clue: the next clue opens and the Mystery is worth one point less (4, 3, 2, 1). On the last clue you pick one of four options, and a wrong pick means 0 for that Mystery."
3. "It scores no points. It is a tiebreaker: if I'm level on points with someone, the closer guess ranks higher. Time also breaks ties. I assumed the Encore counts before time, but the game never said which comes first or who I'm ranked against."

**Dee**
1. "4 points. The 4-3-2-1 ladder was at the top and the first clue said 'Get it from this clue for 4 points'. Both my clue-1 solves showed '+4'."
2. "The same as pressing Next clue: the mystery drops a point (my 4 went to 3) and the next clue appears automatically. On the last clue you get one pick from four, and a wrong pick means 0 for that mystery."
3. "The Encore scores nothing. It's the tie-break: if you're level on points, the closer number ranks higher (within 5% is a bullseye, within 15% is 'close'). Time also only breaks ties, but the game never said which comes first. I guessed Encore before time."

**Marcus**
1. "4 points, the top of the 4-3-2-1 ladder. My first one said 'Knew it. Solved on clue 1 · +4'."
2. "One step on the ladder, the same as pressing Next clue: the mystery drops from 4 to 3 and the next clue appears by itself. I assumed a wrong pick among the four options on the last clue gives 0."
3. "Only ties. The Encore scores no points; if you're level on points, the closer number ranks higher. Time also breaks ties, but the game didn't tell me which comes first. I guessed Encore first, then time."

**Sam**
1. "4 points, the top of the 4-3-2-1 ladder. Before I guessed, the game said 'Get it from this clue for 4 points', and afterwards it confirmed 'Knew it. Solved on clue 1, 4 points.'"
2. "The same as pressing Next clue: the Mystery drops one point and the next clue comes in automatically. My wrong guess 'Araemont' took me from clue 2 worth 3 to clue 3 worth 2."
3. "It only breaks ties: one number, no points. If you tie on points, the closer guess ranks higher. Time also breaks ties, and I wasn't sure which counts first. How to play later confirmed points, then Encore, then time."

**Lena**
1. "4 points, the top of the 4-3-2-1 ladder. The pink bubble said 'Get it from this clue for 4 points', and my lucky Odile Marsh guess got 'Knew it. Solved on clue 1 · +4'."
2. "The same as pressing Next clue: the Mystery is worth one point less (my country went from 3 to 2) and the next clue opens automatically. As far as I could tell nothing else happens. I assumed a wrong pick among the last-clue options just means 0 for that Mystery, but the game never said so."
3. "It doesn't give points. It's the tie-breaker: if I tie on points with someone, whoever's number is closer ranks higher. The stopwatch also 'only breaks ties', so I guess time comes after the Encore, but the game never told me which counts first or who I'm actually ranked against."

## Appendix B. Evidence

- **Priya:** 106 screenshots in `/dev/shm/pt2-priya/shots/` (RAM-backed), scripts in `/tmp/pt2-priya/` (`driver.js`, `step.sh`).
- **Dee:** 95 screenshots in `/dev/shm/pt2-dee/shots/` (RAM-backed), driver `/tmp/pt2-dee/driver.js`. Answer-first options: `094-m3-clue4-options-private.png`. The typed name that locked in C: `093-hazard-after-typing.png`.
- **Marcus:** 92 screenshots in `/tmp/pt2-marcus/shots/`, with `server.js`, `c.js` and `events.log` beside them. Five minutes away: `075-day2-left-mid-daily-today.png`, `076-day2-continue-after-5min.png` and `086-day2-stop-screen.png`.
- **Sam:** 75 screenshots in `/tmp/pt2-sam/shots/`, the announcement and route log in `/tmp/pt2-sam/events.log`, drivers `driver.js` and `do.js`. The stray "c": `034-qp-q1-after-c.png`. Seven matches, six rows: `011-m2-typed-a.png` and `013-m2-active-6th-option.png`. 200% text on a phone: `064-mobile-daily-start.png`.
- **Lena:** 115 screenshots in `/tmp/pt2-lena/shots/`, drivers `lena-drv.js`, `driver.js` and `c.sh`. The arrival: `003-load-8000.png` and `004-loaded.png` against `077-p3-today-newcomer-4s.png`. The stop screen at 360×640: `014-stop-screen.png`.

**Recomputing R2-03's orders.** From the playtest worktree's root, with Node 22:

```ts
// node --experimental-strip-types check.mts
import { createRng } from "./src/engine/rng.ts";
const root = createRng("qz"); // the mock's default seed
const rng = root.fork("attempt:1"); // nextUuid's label for a fresh store's first attempt
const b = Array.from({ length: 16 }, () => rng.int(256));
b[6] = (b[6] & 0x0f) | 0x40;
b[8] = (b[8] & 0x3f) | 0x80;
const h = b.map((x) => x.toString(16).padStart(2, "0")).join("");
const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
for (const n of [0, 1, 2]) {
  console.log(id, n, root.fork(`attempt:${id}:round:${n}`).shuffle([0, 1, 2, 3]));
}
// 03c3a568-33c4-45c2-90eb-706ed374d6de: [0,2,1,3], [0,3,2,1], [0,2,3,1].
// Index 0 is the answer, so it shows first on every Mystery.
```
