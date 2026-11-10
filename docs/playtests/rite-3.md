# RITE round 3: persona playtest of the M1 greybox

**Date:** Tuesday 10 November 2026 · **Build:** production build of the playtest worktree at `e7962b7` (built 08:48:14 UTC), one server on port 3120 for all five personas, mock backend, fixture content · **Round:** 3 of at least 3 (PRD §9.3, M1) · **Judged by:** the PRD §9.4 rubric · **Previous round:** [rite-2.md](./rite-2.md); its fixes, and the decisions in 02-PRODUCT-DECISIONS §22 to §25, are in this build

## The short version

Five persona agents played Daily #51, and Marcus came back the next day for #52. Four of them returned a report. Priya played the whole Daily, a Quick Play run and the tabs (her screenshots and log are on disk), but her session returned no report: no findings, no comprehension answers, no probe answers.

- **0 P0, 1 P1, 20 P2**, merged from 40 findings in four reports. The P1 is a defect, not a confusion: the header's time jumps 1 to 2 seconds at Lock in, and the stop screen shows the higher number. All five sessions show it, Priya's log included.
- **No P1 confusion in the four reported sessions.** Both round 2 confusions are gone. Every persona who left the Daily knew the stopwatch kept running, and no key pressed on a heading committed anything.
- **Comprehension: 12 of 12** on questions 1 to 3 from the four who reported, all before any help page. Priya's answers don't exist, so the check stands at four personas out of five.
- **The M1 gate does not pass.** The check needs five personas and has four. Three items on round 2's list for round 3 also fail: the header at Lock in doesn't match the stop screen (5 of 5), A then Enter at clue 4 does nothing from where the game puts focus (Dee, Marcus), and Mystery 1 gave itself away again (5 of 5 solved it on clue 1). Section 10 says what round 4 must show.
- **Fun 7.0** (four 7s) and **would share: 4 of 4**. What they want next is mostly M2 and M3: Groups, a streak, a crowd number on the stop screen.

## 1. Method

### What changed from round 2

The build carries the four FIX2 lanes (FIX2-DLY, FIX2-MYS, FIX2-PRA, FIX2-DS) and the Integration 6 commits on top of them, so D19 to D26, the §25 rulings, LGL-1's trust pages and IDN-2's restore and claim link are all in. Round 2's section 10 asked for these changes to the method.

| Round 2 asked for | What round 3 did | Result |
|---|---|---|
| Build from main once the fixes merge; record the commit and build time; one build for all five (item 7) | `e7962b7`, built 08:48:14 UTC, one server on port 3120. Priya's first screenshot is at 08:50 | Met |
| R2-03's spread test and R2-22's cross-pool check pass before play; Dee repeats her private-window check (item 8) | Both are in the build (`src/backend/contract/daily.contract.ts`, and the "Fixture cross-pool check" step in `.github/workflows/ci.yml`). Dee's two fresh contexts got different clue-4 orders | Dee's check passed. The round didn't record a run of the two checks before play |
| Every persona's header time at Lock in matches the stop screen's (item 9) | All five recorded both | Failed, 5 of 5 (R3-01) |
| Keep the five slots: Lena on the share link, Marcus on a second day, Sam with a screen reader at 200%, one persona in an in-app browser for IDN-2's claim offer (item 10) | Lena landed on Today from the link; Marcus played #52; Sam played at 200% text with the accessibility tree; Lena played in an in-app browser | Met, except that nobody reported on the claim offer |
| A fixture Mystery 1 that doesn't give itself away (item 11) | #51's Mystery 1 is The Lantern Keeper: "keep" lists one film | Failed: all five solved it on clue 1 |
| 5 GB free, Chromium off `/tmp`, evidence beside the E2E reports (item 12) | 22 GB free on the root disk at report time; evidence in `/home/user/playtest-evidence/rite-3/`, on disk | Disk fine, nothing in RAM. Still not beside the E2E reports |

New probes this round: every persona left the Daily with a clue open and came back about two minutes later; each read the header just before Lock in and compared it with the stop screen; Dee and Sam repeated the key tests; Dee replayed in two private windows.

### Who played

| Persona | §9.3 slot | Device and setup | Daily | Score | Time recorded (header at Lock in) | Fun | Would share |
|---|---|---|---|---|---|---|---|
| Priya | Daily-ritual player (PRD §2.1); non-US English | 390×844 touch with an iPhone Safari user agent, clipboard only | #51 | 7/12, Encore 270% off | 5:43 (5:41), with 2:19 away | No report | No report |
| Dee | Trivia buff | Desktop, keyboard first; two private windows for option orders | #51 | 9/12, Encore 39% off | 6:33 (6:32), with about 2:13 away | 7 | Yes |
| Marcus | Host of an office quiz; non-US English (en-IN) | Android-sized mobile Chromium, touch, clipboard only | #51, then #52 as a returning player | 7/12, 39% off; then 8/12, 13% off (Close guess) | 5:37 (5:35), with 3:12 away; then 2:40 (2:38) | 7 | Yes |
| Sam | Screen-reader user | Desktop at 200% text, keyboard only, read through the accessibility tree and a live-region log; a second run at phone size in a fresh profile | #51, twice | 9/12, 39% off; then 8/12 | 4:16 (4:14), with 2:17 away; the second run 0:38 | 7 | Yes |
| Lena | First-time casual player from a friend's link; low-end Android over slow 4G | In-app browser user agent, throttled network and CPU, touch | #51 | 9/12, 39% off | 5:19 (5:17), with about 2:10 away | 7 | Yes |

**Content.** #51 (Tuesday 10 November) is a film (Easy, The Lantern Keeper, `fx.m.film.0101`), an element (Medium, cobalt, `fx.m.sci.0101`), a fixture country (Hard, Arvenna, `fx.m.geo.0101`) and an Encore on the depth of fixture Lake Ostry (86.4 m, `fx.e.0103`). Those are round 2's #47 Mysteries with #42's Encore. Marcus's #52 was Odile Marsh, Valdoria and bismuth.

**Severity.** As in rounds 1 and 2, I re-judged every finding against PRD §9.4, so a persona's own label is shown but doesn't decide it. The Kind column is round 2's: *Confusion* is what §9.4 grades and the gate counts; *Defect* is a fault that confused nobody but ships a bug or corrupts what the round measures.

### Where this round fell short

1. **Priya's session returned no report.** Her folder holds 58 screenshots, a step-by-step `transcript.log` and the share text she copied. They show a complete Daily (7/12, 5:43), a time away (1:26 when she left, 3:45 when she came back 2:19 later), a Quick Play run and all four tabs. Two of her steps threw (`14-error.png`, `47-error.png`), both after the screen had been captured. There is no think-aloud, no finding and no answer to any scripted question. I use her log only for measured numbers, never for what she understood.
2. **Fixture content again.** Mystery 1 was a free 4 points: "keep" or "keeper" lists one film. Clue 4 of Mysteries 2 and 3 gave the answer away (R3-04). So clue 1 and clue 4 measured little. Round 2's item 11 asked for exactly this to change.
3. **Times are agent times, and every run includes about two minutes away on purpose.** Less the time away, first plays took about 4:20 (Dee), 3:24 (Priya), 3:09 (Lena), 2:25 (Marcus) and 1:59 (Sam). Sam's 0:38 phone run is a fresh profile replaying a known Daily.
4. **Sam's 200% text setting fell back to 16 px twice** during his session. His own probe showed it was the browser setting, not the app.
5. **Evidence is on disk but not beside the E2E reports.** That's better than round 2's RAM disk, and still the third round to miss what §9.4 asks.
6. **Nobody reported on IDN-2's claim offer** (flow 5.14). It's M2 scope and outside the gate.

## 2. Comprehension check

Asked as written after each persona's first Daily. The four who reported all answered before opening How to play or How scoring works, and said so. Question 4 is out of M1's check (decisions memo §22). Their words are in Appendix A.

| Question (PRD §9.4) | Expected | Priya | Dee | Marcus | Sam | Lena |
|---|---|---|---|---|---|---|
| 1. What does solving a Mystery on clue 1 earn? | 4 points | No answer recorded | Yes | Yes | Yes | Yes |
| 2. What does a wrong guess cost? | The same as Next clue: the Mystery is then worth one point less | No answer recorded | Yes, and one pick on clue 4, a wrong one scores 0 | Yes, same | Yes, same | Yes, same |
| 3. What does the Encore decide? | The tiebreak after points; it scores no points | No answer recorded | Yes; time only after that | Yes; time only after that | Yes; time only after that | Yes; time only after that |

Round 2's doubt about the order of the two tiebreaks is gone: all four said the Encore comes before time without being asked. All four also knew a wrong clue-4 pick scores 0, which round 2's Lena and Marcus had to assume (D24 worked).

**The check doesn't pass**, because §9.4 needs all five. Nothing in Priya's log suggests a wrong belief (she finished every step), but a log of what she clicked isn't an answer.

## 3. Probes

Asked after the comprehension check, as round 2's section 10 set out (items 4 to 6 and 9).

| Probe | Priya (from her log) | Dee | Marcus | Sam | Lena |
|---|---|---|---|---|---|
| "While you were away, did your stopwatch keep counting?" | Not asked. Left at 1:26, back at 3:45 after 2:19: it counted every second | Yes. The X's label, the toast and Today's card all said so; 2:16 when she left, 4:29 when back | Yes. Left at 1:17, back after 3:12 to 4:29: "exactly 3:12 had been added" | Yes. 1:25 when he left, 3:42 when back | Yes. 1:24 to 3:34 over about 130 s: "I was warned, so it felt fair" |
| "If two players tie on points, what decides?" | Not asked | Encore, then total time; level on both shares a place | Encore (by % off), then time; three screens agree | Encore, then time | Encore, then time |
| Key tests (round 2's item 5) | Not run (touch) | (a) "k" on the clue-1 heading: nothing. (b) "Cartographer" on the clue-4 heading and on an option: nothing. (c) A then Enter on the clue-4 heading, where focus lands: nothing; from an option, A then Enter locked A, and B then B locked B | A on the clue-4 heading: nothing. Inside the options, A chose it. Escape didn't close the suggestion list. The Encore refused letters and read "1,20,000" as 120,000 | All passed: "a" and "1" on the Mystery heading, "a" on clue 3's, "b" on clue 4's, "5" on the Encore's, "a" and "c" on practice headings committed nothing | Not applicable on touch; "c" on clue 4 and "b" in Quick Play did nothing |
| Header at Lock in against the stop screen | 5:41, then 5:43 | 6:32, then 6:33 | 5:35, then 5:37; day 2 2:38, then 2:40 | 4:14, then 4:16 | 5:17, then 5:19 |

**What the probes show.** The stopwatch rule now forms the right belief: four of four said yes and could say how they knew, and nobody treated leaving as free time. The tie order is understood. The key tests pass as D20 defines them, and fail as Dee read round 2's item 5, because the game puts focus on the clue-4 heading, where D20 makes the keys do nothing (R3-05). The header and stop screen disagree in every session, by 1 or 2 seconds, always upward (R3-01).

## 4. What improved since round 2

### Round 2's P1s, by ID

| ID | Sev | Round 2 finding | Status | Round 3 evidence | What's left |
|---|---|---|---|---|---|
| R2-01 | P1 | "Saved", while the stopwatch keeps running | Fixed | The X reads "Leave the Daily. Your progress is saved, and the stopwatch keeps running.", the toast "Saved. The stopwatch keeps running.", and Today's card "Your stopwatch is still running." Four of four answered the probe right; Priya's log shows the same copy | At 200% text the toast covers Continue for about 4 s (R3-08) |
| R2-02 | P1 | Option keys answer from the heading | Partly fixed | Nothing committed from any heading in Dee's, Sam's or Marcus's tests, and a typed name committed nothing. At clue 4, a key chooses and Enter or the same key locks in | The keys are dead from where clue 4 puts focus, and the legend shows only once focus is inside the options, not "once a keyboard is in use" as D20 says (R3-05). Practice and the Daily use different key models (R3-07) |
| R2-03 | P1 (defect) | The same clue-4 order for every new player | Fixed | Dee's two fresh contexts got different orders at Mystery 1's clue 4, and one kept its order after a reload. Sam's phone run had a different order from his desktop run, which is how he lost clue 4 pressing B from memory | |

### Round 2's P2s marked "before round 3", and the ones that waited on a decision

| ID | Finding | Status | Round 3 evidence |
|---|---|---|---|
| R2-04 | The tiebreak order | Fixed | All four answered the tie question unprompted. The Encore and the stop screen carry D21's lines (Priya's log) |
| R2-05 | The Practice hub line | Fixed | "Coming soon: choose a category and a difficulty." Nobody thought they'd skipped a step |
| R2-06 | Pills and chips look like buttons; E has no mark | Fixed, as far as round 3 shows | Nobody tapped a pill or a chip. Lena added her points from them ("+4, +1 and +4"), so they read as marks |
| R2-07 | Placeholders and trust pages | Fixed as specified | Each placeholder says its own line (Marcus quoted Groups', Priya's log has Settings'). The trust pages are real, and Dee found How scoring works "genuinely transparent". The pages behind the tabs are still empty (R3-03), and the help pages promise some of what isn't built (R3-06) |
| R2-08 | Header and stop screen disagree | Partly fixed | Reloads no longer open a gap, and from Lock in the header holds on the stop screen's value. But it gets there by jumping 1 or 2 s at Lock in, 5 of 5 (R3-01) |
| R2-09 | The grid in a chat | Fixed | The legend carries ❌ (Priya's log), Dee called the grid "nice" with "no answers in it", and nobody misread a pasted grid |
| R2-10 | Share's place | Fixed | Share sits straight under the score card (Priya's log: card, legend, Share, then the text). Nobody hunted for it. Lena's copy toast covers it (R3-08) |
| R2-12 | See your results below the fold | Fixed, as far as round 3 shows | Nobody hunted for it |
| R2-15 | "Which is bigger?" for weights | Fixed | Dee quotes "Which is heavier?". Two such items came back to back, though (R3-12) |
| R2-17 | Clue text at 200% | Fixed, as far as round 3 shows | Sam reported no split words in clues. Clue 1 still starts below the fold on a phone at 200% (R3-17) |
| R2-20 | The share link opened `/daily` | Fixed | Lena landed on Today's card and started the clock herself |
| R2-21 | The match count | Not exercised | No persona typed a prefix with more than six matches |
| R2-22 | Practice gave away an Encore | Fixed | `fx.p.hist.0105` no longer states the year, and CI runs the fixture cross-pool check. Marcus's day-2 Encore was 13% off, not a remembered bullseye |
| R2-23 | Ascending keys at B | Not measured | Nobody kept a tally of key positions this round |
| R2-24 | "Close guess" | Fixed | Marcus's day-2 stop screen: "Encore 13% off (Close guess)" |
| R2-13 (D23) | Guess takes the one match | Fixed | Marcus typed "keep", saw one suggestion and pressed Guess: "Knew it +4" |
| R2-16 (D24) | The clue-4 line | Fixed | "Last clue. Pick one of four. One pick: a wrong one scores 0." on screen, and all four knew it |
| R2-18 (D25) | How to play before the clock | Fixed | Today's card has How to play (Priya's log) |
| R2-19 | Chip rows and "untimed" | Partly fixed | "untimed" is on the card, and now four personas say it clashes with the stopwatch (R3-02). The chips still pop in after first paint on a slow phone (R3-16) |

**Totals:** of round 2's 3 P1s and 18 P2s listed above, 15 are fixed or fixed as far as round 3 shows, 3 are partly fixed (R2-02, R2-08, R2-19), 2 weren't exercised and 1 wasn't measured. Round 2's "later" items mostly stay later. R2-29's Today title ("Knewt") and silent Hide stopwatch, and R2-28's near-identical Encore bands, came up again (R3-08, R3-09, R3-18).

### What worked

- **Honest timing.** Every persona who left was told the clock would run, saw it run, and called it fair. Marcus: "It told me straight that the stopwatch keeps running, and when I came back it had added exactly the time I was gone. Honest."
- **The rules are learned in play.** Twelve right answers out of twelve, each before any help, with the tie order and clue 4's one pick included.
- **Resume holds.** Every reload kept the clue, the wrong guesses and the clock (5 of 5, Priya's log included). Lena's is the one complaint, about the blank beat before it comes back (R3-16).
- **Wrong guesses read well.** Sam heard "Not The Amber Isles. Clue 2 is in. Now worth 3" plus the new clue: "exactly what a screen reader user needs." Lena got the rule from the red "Not Lead" stamp.
- **Sharing works.** Clipboard copies worked first time for all five, Lena's in-app browser fell back cleanly, and "No answers inside." reassured them again.
- **Per-player option orders.** Dee: "nobody can say 'it was B'" in a group chat.
- **The Encore's input.** Junk is refused with "Numbers only, please.", "1,20,000" is read as 120,000 and echoed back, and Dee checked the % off by hand.

## 5. Ranked findings

Ranked by severity, then by how many personas hit it. "Hit by" counts every persona who met the problem, think-aloud included; Priya counts only where her log measures it.

### P0 and P1

| ID | Sev | Kind | Finding | Hit by | Persona labels | Owner | Against the spec |
|---|---|---|---|---|---|---|---|
| R3-01 | P1 | Defect | The header's time jumps 1 or 2 s at Lock in, and the stop screen shows the higher number: 5:41 to 5:43, 6:32 to 6:33, 5:35 to 5:37 and 2:38 to 2:40, 4:14 to 4:16, 5:17 to 5:19. Marcus saw it keep ticking for about 2 s on the Encore's reveal, though the rules say it "stops on every reveal" | 5/5 (Priya by log, Dee, Marcus, Sam, Lena) | P1 (Marcus), P2 (Dee, Sam), probe only (Lena) | DLY | Bug: R2-08's fix made the frozen header equal the stop screen but lets the frozen value sit above the last running one; round 2's item 9 asked for the reading at Lock in to match |

**Why P1, when R2-08 was P2.** Nobody took the wrong number for their time, so it isn't a confusion and the §9.4 count doesn't include it. It is a P1 defect for the reason R2-03 was: it ships a bug in the third ranking key, and every persona noticed. Marcus: "this is the tie-break number, so it makes me doubt that the time is exact." It has survived one targeted fix, and round 2's section 10 named it as something round 3 had to show gone.

### P2

| ID | Finding | Hit by | Owner | Fix | When |
|---|---|---|---|---|---|
| R3-02 | Today's card says "About 4 minutes, untimed", and the Daily opens on a running stopwatch. "Time only breaks ties" settles it, but the two screens disagree. (R2-19 added "untimed" at Sam's request in round 2) | 4/5 (Dee, Marcus, Sam, Lena) | DLY | D27: "About 4 minutes · no time limit" | Before round 4 |
| R3-03 | Practice's extras, Groups, Me and Settings are placeholders, so three of four tabs lead to "on the way". Groups is what Marcus came for, and Me "doesn't even know I just played" (Lena) | 4/5 (Dee, Marcus, Sam, Lena) | GRP-1, STA-1, SET-1; DS for the tabs | Nothing for M1. Before launch, hide or mark unbuilt tabs (decision) | M2, M3 |
| R3-04 | Content fairness. Clue-4 distractors ignore the clues already shown: Arvenna is the only option starting with A, The Lantern Keeper the only title with "Lantern". Cobalt's clue 4 says "symbol Co, atomic number 27". Mystery 1 lists one film for "keep". Mystery 2's clue 1 ("stir a pinch of it into molten glass") fits four elements. "Black bird" reads as "blackbird". Suggestions from two letters ("ar") cracked Hard Mystery 3 for Lena | 3/5 (Dee, Marcus, Lena) | DLY for the fixture Dailies; content team for the bank | Distractors that fit every clue shown; clue 4 strong without naming the answer from Medium up; a Mystery 1 whose clue 1 can't be typed into one match; "a raven-black bird" | Before round 4 (the fixture Daily round 4 plays) |
| R3-05 | Clue 4's keys from where the game puts focus. Focus lands on the clue-4 heading, where D20 makes A to D do nothing, and the legend "Keys A to D choose. Enter locks in." shows only once focus is inside the options (and pushes them down about 24 px when it does). Dee "thought the shortcut was broken"; Marcus got nothing from A and tapped instead | 2/5 (Dee, Marcus) | MYS, with DS | Section 6 | Before round 4 |
| R3-06 | The help pages promise what isn't built. How scoring works says that until 50 players finish "you see how many have played", and the stop screen shows nothing. The Accessibility page lists six Settings and says Reduce motion is in the More menu; Settings is a placeholder and More has How to play and Hide stopwatch. The Terms cover quiz-making, rooms and 18+ | 2/5 (Dee, Lena) | DLY | Show each sentence only once its feature ships, as D21 did for "so far today"; mark Terms sections "coming later" | Before round 4 |
| R3-07 | Practice and the Daily use different key models, and practice's keys have rough edges. In practice one letter answers; in the Daily a letter chooses and Enter locks in. After a letter answer the focus ring stays on the old, now disabled option (Dee pressed B with focus on A), while an Enter answer moves focus to the feedback heading. At 200% text the practice legend renders below the options, half off screen | 2/5 (Dee, Sam) | PRA | After any answer, focus the feedback heading; the legend above the options (§25 reserves its line); copy per D28 | Before round 4 |
| R3-08 | Toasts cover controls. At 200% text "Saved. The stopwatch keeps running." sits on Continue for about 4 s while the clock runs; the copy toast sits on Share. The route announcer says only "Knewt" on Today (R2-29) | 2/5 (Sam, Lena) | DS | Anchor toasts clear of the content's controls (top, or above the dock); "Today · Knewt" | Before round 4 |
| R3-09 | Screen-reader text. The Mystery heading's name reads "Mystery 1 of 3 , · Easy"; the results page keeps a hidden "Time so far 6:33" live region; a chosen clue-4 option exposes no pressed or selected state; Hide stopwatch says nothing (R2-29) | 2/5 (Dee, Sam) | MYS, DS | Clean separators; no stopwatch region off the play screen; `aria-pressed` on the chosen option, or "B, Arvenna, chosen. Enter locks in."; "Stopwatch hidden. It still runs for tie-breaks." | Before round 4 |
| R3-10 | Focus styling. A heavy black ring on the practice heading after a tap on a phone (programmatic focus); the focused skip link partly under the sticky header; the Close ring clipped in the How to play sheet; practice feedback headings partly under the sticky footer | 2/5 (Sam, Lena) | DS | `:focus-visible` for programmatic focus after a pointer; skip link above the header; scroll padding for both bars; inset Close | Later |
| R3-11 | Practice pacing and layout. The options jump to the top after an answer (R2-14 again); Next question appears about 1.3 s after each tap; the feedback scrolls the question away; "You chose true." against an option that reads "True" | 2/5 (Marcus, Lena) | PRA | Options stay put and the sheet rises over the space below (PRD §3.0.3); Next at once; the option's own case | Later ("You chose True." before round 4) |
| R3-12 | Practice content. Two "Which is heavier?" items back to back; "Honey bun (120 g) vs harvest loaf (800 g)" is labelled Medium; a Medium after two Hards; Lena felt Quick Play was "guessing on made-up lore" (1/10) | 2/5 (Dee, Lena) | PRA | No format twice in a row in a run; recheck comparison labels | Later |
| R3-13 | A returning player sees the first-timer card: nothing about yesterday's 7/12 or a streak | 2/5 (Marcus, Lena) | M2: STK-1, STA-1 | Nothing for M1 | M2 |
| R3-14 | Escape doesn't close the suggestion list | 1/5 (Marcus) | MYS | Escape closes the listbox, a second Escape clears the field ([APG combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)) | Before round 4 |
| R3-15 | A reveal opens slightly scrolled, with "Take your time" cut off at the top | 1/5 (Lena) | MYS | Scroll the reveal card's top into view | Later |
| R3-16 | Loading states on a slow phone. A reload shows a blank cream screen with only X and More ("did I lose it?"); Today's card first paints "· About 4 minutes, untimed" with no "Daily #51" and generic chips, then jumps | 1/5 (Lena) | DLY, DS | A clue-card skeleton with the M1 to E marks; render or reserve the number and chips (R2-19, R2-32) | Later |
| R3-17 | Large-text layout. At 200% the Practice card's heading breaks "Practic / e" and Quick play overflows the card; on a phone, clue 1 starts below the fold and the guess box is two screens down | 1/5 (Sam) | DS, MYS | Stack Today's cards at large text, no mid-word breaks; compact the ladder and the "Take your time" line on phones at large text | Later |
| R3-18 | The Encore reveal. "Your guess 90 / m" wraps the unit; the bullseye and close bands are hard to tell apart (R2-28) | 1/5 (Sam) | MYS, DS | A no-break space between number and unit; an edge or pattern between the bands | Later |
| R3-19 | A friend's link lands on a generic Today with nothing about the friend or their score | 1/5 (Lena) | M3: SHR-1 | The share landing (`/s/{number}/{code}`) | M3 |
| R3-20 | No running total during the Daily | 1/5 (Lena) | Decided | Kept (§22): no visible total; the progress group's accessible name may carry it | Kept |
| R3-21 | A clue-4 option locks in on one tap, with no undo | 1/5 (Marcus) | Decision | Keep commit on release (§22). Nobody mis-tapped this round, so R2-25's watch closes | Watch closed |

**Re-graded.** Five persona P1s are P2 here, and two P2s rose to the P1 defect.

- R3-05 (Dee): she pressed A then Enter, got nothing, Tabbed in and it worked. That's one retry, and §9.4's P1 needs more than one. Her wrong belief was about the product ("the shortcut was broken"), not a rule. It's still the item closest to a P1 in this round, and round 2's item 5 makes it a gate item, so it gets a full fix in section 6.
- R3-06 (Dee, the crowd number): she read the page right and noticed the stop screen didn't match it. No misread score. §22 keeps the percentile and the count out of M1, so the page has to say less.
- R3-03 (Marcus, Groups): read correctly, M3 scope, as in round 2.
- R3-08 (Sam, the toast over Continue): he waited it out with no retry, and keyboard focus wasn't blocked. It did cost up to 4 s of tie-break time, so it goes in before round 4.
- R3-16 (Lena, the blank reload): a belief that lasted a beat and corrected itself, about state, not a rule.
- R3-01 (Dee's and Sam's P2s) joins Marcus's P1 as a defect, for the reason given under the table above.

## 6. Fixes for the P1, and for the gate's P2

Each fix names its owning area, the files most likely involved and a check a test can encode. "E2E" means Playwright against the mock backend.

### R3-01 (P1, defect): the header jumps at Lock in

**Hit by** all five. Every session read the header just before Lock in and the stop screen after, and every gap went up: Priya +2 s (her log stamps 5:41 at 08:57:31.932), Dee +1, Marcus +2 on both days, Sam +2 ("less than half a second before I pressed Enter"), Lena +2 on a throttled phone. Dee reloaded mid-Mystery 1, Priya, Marcus and Lena mid-Mystery 2, so reloads are not the cause any more.

**What the code does.** R2-08's fix freezes the header on the finish's `totalMs` once the last verdict brings it (`stopwatchMs` in `src/features/daily/model/labels.ts`; `noteResponse` and `finish` in `src/features/daily/model/controller.ts`), so the frozen header always equals the stop screen. It never promised that the frozen value equals the last running one. Two things let them differ:

1. **Rounding, confirmed in code.** While a round runs, the header shows its time floored (`formatStopwatch` uses `Math.floor`). Once it resolves, the round counts its recorded time rounded to the nearest second (`toSecond` and `recordedRoundMs` in `src/backend/mock/server/sealed.ts`, `wholeSecond` in `labels.ts`). 254.6 s shows as 4:14 and records as 4:15. That's up to 1 s at every verdict, the Encore's included.
2. **The server's bound, not yet traced.** A round records the larger of its server interval less 400 ms a request and the device's own measure (`effectiveRoundMs`). Rounding alone can't make four sessions in five jump by 2 s, so the Encore's server interval also runs about a second longer than the device's. The DLY lane should find out where: from the Encore's issue to the device's `openedAt` (`src/engine/run/reducer.ts`), or the Lock in round trip, while the ticker keeps running in the `judging` phase. Marcus's "kept ticking for about 2 s on the reveal" points at the second.

The E2E that guards R2-08 (`e2e/daily/rite-2.spec.ts`, "R2-08 two wrong guesses and two reloads…") couldn't catch either. It reads the header only after Lock in, accepts a verdict that raises it (`expect(onReveal).toBeGreaterThanOrEqual(beforeVerdict)`), and fast-forwards a mocked page clock in round steps.

- **Owner:** DLY.
- **Files:** `src/features/daily/model/labels.ts` (`formatStopwatch`, `elapsedMs`, `wholeSecond`, `stopwatchMs`), `src/features/daily/model/controller.ts` (`syncTicker`, `waiting`, `noteResponse`), `src/backend/mock/server/sealed.ts` (`toSecond`, `recordedRoundMs`, `effectiveRoundMs`, `finishAttempt`), `src/engine/run/reducer.ts` (`openedAt`), `e2e/daily/rite-2.spec.ts`.
- **Fix:** the number shown when Lock in is pressed is the number on the stop screen.
  - One rounding everywhere: the running display and the recorded rounds use the same rule. Floor is the safer choice, since it can never show a time higher than the one counted.
  - Stop the ticker when Lock in is sent and hold the shown value through the reveal.
  - Record the Encore so its whole-second value equals that held value unless the server's bound beats the device's measure by more than the latency allowance. That is the honest-play case (PRD §4.3.3), and only then may the header change after Lock in. Lena's throttled phone is what the 400 ms allowance is for. A 2 s gap on a desktop with the mock's 30 ms latency is not.
  - Apply the same rule at every verdict, so a reveal never raises the header either.
- **Test:**
  - Unit (`labels.test.ts`): a running round at 254,600 ms and the same round recorded at 254,600 ms show the same `m:ss`.
  - E2E on a real clock, mock latency at its default: play #51 to the Encore, read the stopwatch and press Lock in inside one `page.evaluate`, then open the stop screen: `[data-time]` reads `Time ${reading} · only breaks ties`. Repeat with a reload in Mystery 2.
  - E2E: with mock latency at 300 ms (inside the allowance), the same equality holds.
  - The R2-08 E2E asserts equality at every verdict, not "greater than or equal".
  - Round 4: every persona's header at the press equals the stop screen (section 10).

### R3-05 (P2, the gate's key test): clue 4's keys from where focus lands

**Hit by** Dee and Marcus. At clue 4 the game moves focus to the "Clue 4" heading (PRD §3.1.4). D20 makes A to D act only while focus is on an option, so A then Enter does nothing, and nothing says why: the legend is in the DOM but shows only once focus is inside the options (`data-keys-legend` "on-focus" in `options.tsx`). D20 said it shows "once a keyboard is in use", and Dee had been on the keyboard all game. Sam passed because he Tabs to the options by habit. Lena and Priya were on touch. Round 2's item 5 asked for "at clue 4, A then Enter locks in A".

- **Owner:** MYS, with DS for the legend's reserved line.
- **Files:** `src/features/rounds/mystery/focus.ts` (where a new clue sends focus), `src/features/rounds/mystery/options.tsx` (the group, `keysUsed`, `data-keys-legend`, `TYPING_MS`), `src/features/rounds/mystery/index.tsx`, `src/features/rounds/mystery/copy.ts` (`options.legend`), `src/ui/answer-button.tsx`.
- **Fix (after D28):**
  - When the four options appear, focus the options group rather than the heading. The group is labelled by the clue-4 heading and clue text and described by the "Last clue" line, so a screen reader still hears the new clue first (Sam's need). D20 stands as written: keys act inside the group, and the group now has focus.
  - Show the legend from the moment clue 4 opens if a keyboard has been used anywhere in the Daily, in a line reserved above the options so nothing moves (§25's rule for practice).
  - Keep round 2's guard: a typed name commits nothing.
- **Test:**
  - Component: clue 4 opens after a keyboard was used, `document.activeElement` is the options group, the legend is visible, and the options' top doesn't move when it appears.
  - E2E (Dee's test c): on Mystery 1, press Next clue three times; with no Tab, press A then Enter: one pick, for A.
  - E2E (Dee's test b, kept): at clue 4, `page.keyboard.type("Cartographer")`: the round is still open and no reveal shows.
  - Component (Sam): pressing B marks B with `aria-pressed="true"` (R3-09).

### Priya's missing report (method, not a finding)

The gate needs five complete sessions, and the round closed with four. Before round 4's synthesis starts, the harness should check that every persona returned findings, the three answers, the four probe answers and a fun score, and re-run any slot that didn't, on the same build.

## 7. P2 fixes to land before round 4

- **R3-02, the ticket (DLY; after D27).** `minutes` in `src/features/daily/home-copy.ts` becomes `About ${minutes} minutes · no time limit`. *Test:* the home card's text has "no time limit" and not "untimed".
- **R3-04, the fixture Daily round 4 plays (DLY, with the content team).** In the Mysteries `content/fixtures/schedule/2026-11.json` gives round 4's date: clue-4 distractors that fit every clue shown (for `fx.m.geo.0101`, four fixture countries that begin and end with A); a clue 4 that helps without naming the answer (`fx.m.sci.0101` names "Co"); a Mystery 1 whose clue 1 can't be typed into one match; "a raven-black bird". A lint in the fixture checks: every clue-4 option matches the clue-3 constraint where one is machine-checkable (first letter, pattern). *Test:* the lint's unit test, and the round-4 Daily passes it.
- **R3-06, the help pages (DLY).** In `src/features/legal/documents/how-scoring-works.ts`, the "how many have played" sentence shows only once the stop screen has the count (a flag, as D21 did for "so far today"). In `accessibility.ts`, list only the Settings that exist, and show the More-menu sentence only once Reduce motion is there. In `terms.ts`, mark the quiz-making and room sections "coming later". *Test:* with the flags off, none of those sentences render.
- **R3-07, practice keys (PRA; copy after D28).** In `src/features/rounds/choice/index.tsx`, a letter-key answer moves focus to the feedback heading, as Enter does, and the legend's reserved line sits above the options. *Test:* component, focus an option and press "b": focus is on the feedback heading. E2E at 200% text: the legend's box is inside the viewport and above option A.
- **R3-08, toasts (DS).** `src/ui/toast.ts` places toasts where they can't cover the page's controls (top of the viewport, or above the dock), and Today's title becomes "Today · Knewt" (`src/features/shell/route-announcements.tsx`). *Test:* E2E at 200% text, leave the Daily with a clue open: the toast's box doesn't intersect Continue's. The route announcement on `/` is "Today · Knewt".
- **R3-09, screen-reader text (MYS, DS).** Build the Mystery heading's accessible name without stray separators (`src/features/rounds/mystery/kicker.tsx`), drop the stopwatch's live region off the play screen (`src/features/shell/play-header.tsx`, `src/ui/stopwatch.tsx`), expose the chosen option (`options.tsx`), and announce Hide stopwatch. *Test:* the heading's name is "Mystery 1 of 3, Easy"; `/daily/51/results` has no element with "Time so far"; hiding the stopwatch puts "Stopwatch hidden. It still runs for tie-breaks." in the status region.
- **R3-11, the answer's case (PRA).** "You chose True." uses the option's own text. *Test:* the results row for a true-or-false item matches the option's label.
- **R3-14, Escape (MYS).** In `src/features/rounds/mystery/combobox.tsx`, Escape closes the open listbox and a second Escape clears the field. *Test:* component, type "co", press Escape: `aria-expanded` is false and the text stays; Escape again: the field is empty.

## 8. Changes that need a decision

| # | Doc and section | Proposed change | For |
|---|---|---|---|
| D27 | DESIGN §1.4 (the ticket); PRD §3.1.7; amends R2-19's copy | Today's card reads "About 4 minutes · no time limit". The stopwatch line inside stays "Take your time. Time only breaks ties." | R3-02 |
| D28 | PRD §3.0.3 and §3.1.4 (focus at a new clue); DESIGN §11; amends D20's legend | When clue 4's options appear, focus goes to the options group, labelled by the clue. The legend shows from then on once a keyboard has been used in the Daily. Practice's legend reads "Keys A to D answer at once." so the two models are told apart on screen | R3-05, R3-07 |
| D29 | PRD §3.1.6 and §3.11 (tabs at launch) | Before public launch, tabs whose destination is a placeholder are hidden or marked "Soon". No change for M1 | R3-03 |

**Kept as decided** (no doc change): no visible running total (R3-20, §22); commit on release for a clue-4 tap (R3-21, §22); suggestions from the first letters (Lena's R3-04 point), since showing names is how a guess works and the content, not the list, should carry the difficulty; the stopwatch's rule while away, which now forms the right belief.

## 9. Fix list by area

| Area | P1 | P2 before round 4 | P2 later |
|---|---|---|---|
| DLY | R3-01 one rounding, ticker stopped at Lock in, Encore recorded to the shown value | R3-02 "no time limit" (D27) · R3-04 the round-4 fixture Daily and a clue-4 lint · R3-06 help sentences gated, Terms marked | R3-16 skeletons and reserved chips |
| MYS | | R3-05 focus the options group at clue 4, legend from clue 4's opening (D28) · R3-09 heading name and chosen state · R3-14 Escape | R3-15 reveal scroll · R3-17 compact ladder on phones · R3-18 unit no-break space |
| PRA | | R3-07 focus after a letter answer, legend above the options · R3-11 "You chose True." | R3-11 options stay put, Next at once · R3-12 no format twice in a row, difficulty labels |
| DS | | R3-05 the legend's reserved line · R3-08 toast placement, "Today · Knewt" · R3-09 no stopwatch region off the play screen, Hide stopwatch announced | R3-10 focus-visible, skip link, scroll padding, Close inset · R3-17 stacked Today cards, no mid-word breaks · R3-18 band contrast |

**Outside the four areas.** R3-03 and R3-13 are GRP-1, STA-1, SET-1 and STK-1 (M2, M3). R3-19 is SHR-1 (M3). The crowd number Dee wanted is DLY-3's percentile and count (M2), which is why R3-06 trims the page rather than building it.

## 10. The M1 gate

### Verdict: round 3 does not pass, so M1 does not exit

PRD §9.3's exit reads: "The last round finds no P0 or P1 confusion and passes the comprehension check (§9.4)." Against round 2's list for round 3:

| # | Round 2 asked round 3 to show | Result |
|---|---|---|
| 1 | No P0 and no P1 confusion across five sessions | Not established. None in the four reported sessions. The fifth has no think-aloud to judge |
| 2 | All five answer questions 1 to 3 before any help page | Not met: four of four, with Priya's answers missing |
| 3 | A way through question 4 | Met: §22 moves it to M3 |
| 4 | All five say the stopwatch kept counting while away | Four of four said yes; Priya's log shows it counted, but she wasn't asked |
| 5 | Key tests: a letter on a heading commits nothing; a typed name commits nothing; A then Enter at clue 4 locks in A | First two met. The third fails from where the game puts focus (Dee, Marcus) and passes from an option (R3-05) |
| 6 | All five say "the Encore, then time" | Four of four |
| 7 | Build from main, record commit and build time, one build | Met |
| 8 | Spread test and cross-pool check pass; Dee's private windows differ | Dee's check met; the two checks are in the build and CI, with no run recorded for the round |
| 9 | Every header at Lock in matches the stop screen | Failed, 5 of 5 (R3-01) |
| 10 | The five slots, with Lena on the share link, Marcus's second day, Sam at 200%, an in-app run | Met, without a report on the claim offer |
| 11 | A Mystery 1 that doesn't give itself away | Failed: one match for "keep", 5 of 5 solved on clue 1 |
| 12 | Disk space, nothing in RAM, evidence beside the E2E reports | Disk and RAM met; evidence not beside the E2E reports |

The format itself is close. In four sessions no persona held a wrong belief about a rule or needed more than one retry, all twelve answers were right, and both round 2 confusions are gone. The failure is about completeness and three named checks: a missing session, a clock that jumps at the one moment players watch it, a key path that's dead from where focus lands, and a Mystery 1 that measures nothing.

There is a narrower reading. Re-running Priya's slot on `e7962b7` with the full script would complete round 3's comprehension check, and if it found no P1 confusion, §9.3's literal text would be met. I don't recommend exiting that way. R3-01 is a known bug in a ranking key, round 2's list asked for it gone, and R3-05 and item 11 would still be open. All three fixes are small, so a full round 4 costs little more than a replay.

### What round 4 must show

**To pass the gate:**

1. Five complete sessions on one build with R3-01's and R3-05's fixes and every P2 marked "Before round 4". Each session returns findings, the three answers, the probe answers and a fun score. A slot that returns nothing is re-run on the same build before the synthesis.
2. No P0 and no P1 confusion under §9.4 across the five.
3. All five answer questions 1 to 3 correctly before any help page, in the Priya slot too.

**To show this round's problems are gone:**

4. Every persona reads the header between 100 ms and half a second before pressing Lock in, and the stop screen shows that exact time, including one who reloads mid-Mystery and Lena on the throttled phone. If Lena's differs, the gap must be the allowance's case and the header must say so before the reveal (R3-01). (The 100 ms: the header turns a second a few ms after the time it counts does, later on a throttled phone, so a press in that window freezes it on the new second with the press, the value recorded. That step is the press, not a jump; `stopwatch.test.tsx` covers it.)
5. Dee and Marcus repeat test (c): at clue 4, with no Tab, A then Enter locks in A, and the legend is visible when clue 4 opens. Test (b) still commits nothing (R3-05).
6. The leave probe and the tie question, asked again of all five: all say yes, and all say the Encore, then time.

**Method:**

7. A fixture Daily whose Mystery 1 can't be typed into one match from clue 1, whose clue-4 options all fit the clues before them, and whose clue 4 doesn't name the answer above Easy (R3-04).
8. Record the commit and build time, and record a run of the spread test and the cross-pool check before play.
9. Keep the slots: Priya's daily-ritual player on a phone, Dee on the keyboard, Marcus on a second day, Sam with a screen reader at 200% text, Lena from the share link on the throttled in-app profile, reporting on IDN-2's claim offer.
10. Transcripts, answers and screenshots go beside the E2E reports, as §9.4 asks, at the end of the round.

### Decisions for the M1 exit

- **`options_from_clue` stays at 4.** Nobody stalled on typing in three rounds.
- **`daily_minutes` stays at 4.** Less the time away, first plays ran from about 2:00 to 4:20 (median about 3:10), agent latency included. The closed beta's median session sets it (PRD §3.1.7).
- **D8 holds:** the stopwatch stays visible, and now its rule while away is understood too.

## Appendix A. Comprehension answers, verbatim

**Priya:** no answers recorded. Her session returned no report.

**Dee**
1. "4 points. The ladder is 4, 3, 2, 1, and the clue-1 hint said 'Get it from this clue for 4 points'."
2. "The same as pressing Next clue: the Mystery drops one point and the next clue opens. On clue 4 you get one pick, and a wrong pick scores 0."
3. "It scores no points. It breaks ties on points: the closer guess ranks higher, and time only counts after that."

**Marcus**
1. "4 points, the most you can get on a Mystery. The points go 4, 3, 2, 1 down the clues."
2. "The same as tapping Next clue: you drop one point and the next clue opens. On clue 4 there's only one pick, and a wrong pick scores 0."
3. "Only ties. It scores no points. If two people are level on points, the closer Encore guess ranks higher, and time only counts after that."

**Sam**
1. "Solving on clue 1 earns 4 points. The ladder was 4, 3, 2, 1 and it said 'Get it from this clue for 4 points'."
2. "A wrong guess costs the same as Next clue: you move down one clue and the Mystery is worth one point less. On clue 4 you only get one pick, and a wrong pick scores 0."
3. "The Encore scores no points. It breaks ties: if players are level on points, the closer Encore guess ranks higher, and time only counts after that."

**Lena**
1. "4 points. It's a 4-3-2-1 ladder (clue 1 = 4, clue 4 = 1), so the three Mysteries make 12 points at most."
2. "The same as tapping Next clue: you drop one rung (one point) and the next clue opens. On clue 4 you get one pick from four options, and a wrong pick scores 0."
3. "It scores no points. It breaks ties on points: the closer guess ranks higher, and only after that does time count."

## Appendix B. Evidence

All under `/home/user/playtest-evidence/rite-3/`; the build time is in `/home/user/playtest-evidence/rite3-build-time.txt`.

- **Priya:** 58 screenshots, `transcript.log` (timestamped page text, the header at leave, return and Lock in), `share-text.txt`, `run.js` and `steps/`. Time away: `13-away-today-just-left.png`, `15-away-today-after-2min.png`, `16-away-back-in-daily.png`. Header against stop screen: `transcript.log` lines stamped 08:57:31.932 ("HEADER AT LOCK IN: Time so far 5:41") and 08:57:53 ("Time 5:43"). The two thrown steps: `14-error.png`, `47-error.png`.
- **Dee:** 71 screenshots. The heading key test: `104-keytest-a-heading-k.png`. Time away: `113-left-daily-today.png`, `114-today-after-2min.png`, `115-back-in-m3.png`.
- **Marcus:** 84 screenshots, day 1 and day 2. Time away: `09b-today-while-away.png`, `09c-today-after-2min.png`, `09d-back-in-daily.png`. Lock in and the stop screens: shots 16, 40b and 40c.
- **Sam:** `shots/`, `events.log` (announcements and routes), `transcript-notes.txt`, drivers `driver.js` and `do.js`. The toast over Continue: shot 013. Practice legend at 200%: shots 033 and 034. The phone run at 200% text: shot 056 on.
- **Lena:** `shots/`, `transcript.md`, `notes-comprehension.txt`, `driver.js` and `driver.log`. Blank reload: shot 10. First paint: shots 01 and 02. Share toast: shot 32. Tabs: shots 40 to 43.
