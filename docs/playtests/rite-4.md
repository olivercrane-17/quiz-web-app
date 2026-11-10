# RITE round 4: persona playtest of the M1 greybox

**Date:** Tuesday 10 November 2026 · **Build:** production build of the playtest worktree at `ba19192` (built 13:40:34 UTC), one server on port 3120 for all five personas, mock backend, fixture content, real clock · **Round:** 4 (PRD §9.3, M1) · **Judged by:** the PRD §9.4 rubric · **Previous round:** [rite-3.md](./rite-3.md); its fixes, and D27 to D30 from 02-PRODUCT-DECISIONS §26, are in this build

## The short version

Five persona agents played a first Daily and all five returned a full report: findings, the three answers, the four probe answers, a time and a fun score. Four played #51. Lena's browser was set to Melbourne time, where it was already 11 November, so she got #52. Marcus also came back the next day for #52.

- **0 P0, 1 P1, 22 P2**, merged from 53 findings in five reports. The P1 is a confusion this time, and it sits on the game's one all-or-nothing step.
- **R4-01 (P1, confusion): clue 4 teaches one way to lock in and uses another.** The line above the options says "Keys A to D choose. Enter locks in." and a chosen option shows as pressed. A tap, or Enter on an option that has focus, locks it in at once. Four of five believed in the two-step model (Priya, Marcus, Lena, Sam). Lena and Sam each acted on it and lost a Mystery: 0 points, no undo. Round 3's fixes caused it: D28 put the key legend on screen from the start, phones included, and R3-09 gave the options a pressed state.
- **R3-01 is fixed.** The header at Lock in equals the stop screen in all five first sessions and in both extra runs (4:25, 5:34, 4:03, 4:59, 5:04; then 1:10 and 2:30), across reloads and on Lena's throttled phone.
- **Comprehension: 15 of 15** on questions 1 to 3, all five personas, all before any help page.
- **The probes pass**: five of five knew the stopwatch kept running while away, and five of five said "the Encore, then time".
- **The M1 gate does not pass.** PRD §9.3 needs a last round with no P0 or P1 confusion, and R4-01 is one. Everything else on round 3's list is met or close. Section 10 says what round 5 must show.
- **Fun 6.8** (four 7s and Lena's 6) and **would share: 4 of 5**. Lena wouldn't, because of the tap that cost her a Mystery and because the stop screen gave her nothing to compare 5/12 with.

## 1. Method

### What changed from round 3

The build carries the FIX3 lanes and Integration 7 on top of round 3's build: one rounding rule and a frozen header (R3-01), D27's "no time limit", D28's focus on the options group at clue 4, D30's same for practice, gated help sentences, the toast's new place, the charcoal inset, and the fair fixture Daily (set A) with its clue-4 lint. Round 3's section 10 asked for these changes to the method.

| Round 3 asked for | What round 4 did | Result |
|---|---|---|
| Five complete sessions on one build, with any empty slot re-run before the synthesis (item 1) | Five reports, none marked missing. I have no record of whether any slot needed a re-run | Met |
| Header read just before Lock in, against the stop screen (item 4) | All five recorded both, with a reload mid-Mystery in Priya's, Dee's, Marcus's, Sam's and Lena's sessions | Met, 5 of 5 |
| Dee and Marcus repeat key test (c) with no Tab; test (b) still commits nothing (item 5) | Both ran it. Dee also ran both in fresh contexts and after a reload | Met as scripted; two edges fail (R4-11) |
| The leave probe and the tie question, asked of all five (item 6) | Asked of all five | Met, 5 of 5 on each |
| A fair fixture Daily (item 7) | #51 is set A: nobody solved Mystery 1 on clue 1, and every clue-4 option seen fits the clues before it | Met for #51. Lena played #52, which set A doesn't cover |
| Record the commit and build time; record a run of the spread test and the cross-pool check before play (item 8) | `ba19192`, 13:40:34 UTC, in `rite4-build-time.txt` | Commit and time met. No run of the two checks is in the evidence I was given |
| Keep the slots, and report on IDN-2's claim offer (item 9) | All five slots kept. Priya opened the site in an Instagram-style context after her Daily and reported on the offer | Met. The offer never showed (R4-09) |
| Evidence beside the E2E reports (item 10) | Evidence is in `/home/user/playtest-evidence/rite-4/` | Not met, for the fourth round |

### Who played

| Persona | §9.3 slot | Device and setup | Daily | Score | Time (header at Lock in = stop screen) | Less the time away | Fun | Would share |
|---|---|---|---|---|---|---|---|---|
| Priya | Daily-ritual player; non-US English | 390×844 touch, clipboard; then a fresh Instagram-style context | #51 | 7/12, Encore over 999% off (a caret slip, her own) | 4:25, with 2:04 away | about 2:21 | 7 | Yes |
| Dee | Trivia buff | Desktop 1280×800, keyboard first; three fresh contexts for option orders and key tests | #51 | 7/12, Encore 259% off | 5:34, with about 2:12 away | about 3:22 | 7 | Yes |
| Marcus | Host of an office quiz; non-US English | 390 px touch phone, clipboard | #51, then #52 the next day | 7/12, 247% off; then 5/12 | 4:03, with 2:08 away; then 1:10 | about 1:55 | 7 | Yes |
| Sam | Screen-reader user | Desktop 1280×800 at 200% text, keyboard only, read from aria snapshots; a second Daily at 390×844 and 200% in a fresh context | #51, twice | 7/12, 247% off | 4:59, with 2:06 away; the second run 2:30 | about 2:53 | 7 | Yes |
| Lena | First-time casual player from a friend's link; low-end Android over slow 4G | 360×640 in-app browser profile, CPU ×4, slow 4G, touch, Melbourne time | #52 | 5/12, 42% off | 5:04, with 2:04 away | about 3:00 | 6 | No |

**Content.** #51 is fixture set A: a film (Easy, The Lantern Keeper), an element (Medium, cobalt), a fixture country (Hard, Arvenna) and an Encore on the depth of fixture Lake Ostry (86.4 m). #52 is a person (Easy, Odile Marsh), a country (Medium) and an element (Hard, bismuth), with an Encore whose answer is 212 steps.

**Severity.** As in every round, I re-judged each finding against PRD §9.4, so a persona's own label is shown but doesn't decide it. *Confusion* is a wrong belief about a rule or a score, or an action taken on one; the gate counts it. *Defect* is a fault that confused nobody.

### Where this round fell short

1. **Lena played #52, not #51.** Her driver sets `timezoneId: 'Australia/Melbourne'`, and at 13:40 UTC that is past midnight on the 11th. So the fair fixture was played by four personas. Her comprehension answers still count (the rules are the same), but her content remarks are about a Daily that round 3's fairness pass didn't touch.
2. **Two of the three clue-4 findings came out of key tests, not free play.** Lena pressed a hardware C on a phone profile and then tapped A. Sam's loss was on his second Daily, while he was trying the keys. I say in section 5 why they still count.
3. **Dee's browser was restarted after her main session**, so her How to play, More menu and key-test repeats ran in fresh contexts. Her first Daily ran in one context on the real clock. She reports that a cleanup command was refused and her driver process may still be running.
4. **Times are agent times**, and every first Daily includes about two minutes away on purpose.
5. **No recorded run of the spread test or the cross-pool check.** Dee's own check found the same clue-4 order in two of three fresh contexts. With 24 possible orders that happens by chance about one time in eight, so it proves nothing either way; a recorded run of the spread test would settle it.
6. **Evidence is still not beside the E2E reports.**

## 2. Comprehension check

Asked as written after each persona's first Daily. All five answered before opening How to play or How scoring works, and said so. Question 4 is out of M1's check (decisions memo §22). Their words are in Appendix A.

| Question (PRD §9.4) | Expected | Priya | Dee | Marcus | Sam | Lena |
|---|---|---|---|---|---|---|
| 1. What does solving a Mystery on clue 1 earn? | 4 points | Yes | Yes | Yes | Yes | Yes |
| 2. What does a wrong guess cost? | The same as Next clue: the Mystery is then worth one point less | Yes, and one pick on the last clue, a wrong one scores 0 | Yes, same | Yes, same | Yes, same | Yes, same |
| 3. What does the Encore decide? | The tiebreak after points; it scores no points | Yes; time only after that | Yes; time only after that | Yes; time only after that | Yes; time only after that | Yes; time only after that |

**The check passes: 15 of 15.** This is the first round with all five answers, and Priya's slot, empty in round 3, is as clean as the rest. Three of them (Dee, Marcus, Sam) opened the help pages afterwards and found them in agreement with what they'd said.

## 3. Probes

| Probe | Priya | Dee | Marcus | Sam | Lena |
|---|---|---|---|---|---|
| "While you were away, did your stopwatch keep counting?" | Yes. 0:50 when she left, 124 s away, 2:55 when back; the X's label, the toast and Today's card all said so | Yes. 1:52, about 130 s away, 4:04. Nothing visible warned her before she pressed X | Yes. 1:09, about 2:08 away, 3:17 | Yes. 1:17, 125.7 s away, 3:23 | Yes. 2:09, 120 s away, 4:13 |
| "If two players tie on points, what decides?" | Encore, then time | Encore, then time; level on all three shares a place | Encore, then time | Encore, then time | Encore, then time (faster wins) |
| Key tests | Touch. Key B at clue 4 only highlighted; a tap locked at once. Enter in the guess box with nothing picked sent nothing | (a) a letter on a heading: nothing. (b) "Cartographer", "Bartholomew", "Arvenna", "Cuba", "Aldessa" at clue 4: nothing committed. (c) fresh context, no Tab, A then Enter: locked A. Fails: "Abba" or "Dada" then Enter locked A; after a reload at clue 4, A then Enter did nothing until Tab | Key B highlighted; key A then Enter locked in; a tap locked at once. Enter with nothing picked sent nothing | Keys on More, the page body and the Skip link did nothing. c, then b, then Enter locked B. A then A locked A; a held key didn't. With A chosen, Tab to B and Enter locked B at once | Key C highlighted C; a tap on A then locked A. A double tap on Next clue spent one clue |
| Header at Lock in against the stop screen | 4:25 and 4:25 | 5:34 and 5:34 | 4:03 and 4:03; day 2, 1:10 and 1:10 | 4:59 and 4:59; second run, 2:30 and 2:30 | 5:04 and 5:04 |

**What the probes show.** The clock is honest and reads as honest: every leave added the time away to the second, every reveal paused it (Priya, Dee, Marcus and Sam each checked), and the number at Lock in is the number on the stop screen in seven runs out of seven. The tie order is understood by all five. The key tests pass as round 3 wrote them. What they turned up instead is that clue 4 now has two ways to lock in and tells the player about only one (R4-01), plus two narrow keyboard faults (R4-11).

## 4. What improved since round 3

### Round 3's P1, and the P2 the gate named

| ID | Sev | Round 3 finding | Status | Round 4 evidence | What's left |
|---|---|---|---|---|---|
| R3-01 | P1 (defect) | The header jumps 1 or 2 s at Lock in | Fixed | Seven runs, seven matches, with a reload in each first session and Lena on CPU ×4 and slow 4G. Reloads moved the clock by 1 to 3 s of real time and no more | Nothing |
| R3-05 | P2 (gate) | Clue 4's keys are dead from where focus lands | Partly fixed | Focus lands on the options group with a visible ring and the legend (Sam). A then Enter with no Tab locks A (Dee in a fresh context, Marcus) | After a reload at clue 4, focus lands on the H1 and the keys do nothing until Tab (R4-11). The always-on legend now reaches touch players and misleads them (R4-01) |

### Round 3's P2s marked "before round 4"

| ID | Finding | Status | Round 4 evidence |
|---|---|---|---|
| R3-02 | "untimed" on Today's card | Fixed | "About 4 minutes, no time limit" (Marcus, Lena). Nobody saw a clash with the stopwatch |
| R3-04 | Content fairness in the fixture Daily | Fixed for #51 | Mystery 1 took a wrong guess or more from all four: Priya and Sam solved it on clue 3, Dee and Marcus on clue 2. Dee's clue-4 options were Goalkeeper, Innkeeper, Beekeeper and Lantern Keeper. She liked the decoys: "proper quiz deduction". Open edges: Hard Mystery 3 fell on clue 1 for Priya and Sam, its clue 4 restates clue 1, and Mystery 1's clues 3 and 4 are near twins (R4-20) |
| R3-06 | Help pages promise what isn't built | Fixed, as far as round 4 shows | How scoring works now says "Results don't compare you with other players yet". Dee found the page "admirably thorough" and it matched what she saw. Its Honest play section raised a new objection (R4-10), and the Accessibility page promises 200% text that the header doesn't give (R4-12) |
| R3-07 | Practice keys | Fixed | Focus lands on the options group, the legend reads "Keys A to D answer at once." and became "Keys A to C" on a three-option item (Sam). Enter moves on after an answer (Marcus, Lena). The two modes still differ on purpose (R4-13) |
| R3-08 | Toasts cover controls; Today's title | Partly fixed | No toast covered a control. It now sits over the page heading instead (Priya, Marcus, Sam, Lena: R4-06). Today is announced as "Today · Knewt", except once as "Good afternoon." (Sam, R4-18) |
| R3-09 | Screen-reader text | Fixed, as far as round 4 shows | A chosen option is exposed as pressed, and "Stopwatch hidden. It still runs for tie-breaks." is announced (Sam). Show stopwatch says nothing, and a suggestion's name has a stray space (R4-17, R4-18) |
| R3-11 | "You chose true." | Not reported on | Nobody quoted the line |
| R3-14 | Escape in the suggestion list | Not exercised | Marcus's Escape tests were on the stopwatch menu and the How to play sheet |

**Totals:** of the ten items above, five are fixed or fixed as far as round 4 shows, two are partly fixed (R3-05, R3-08), one is fixed for the Daily it was written for (R3-04) and two weren't exercised. Round 3's "later" items stay open where they came up again: the Close button's clipped ring (R3-10), the chips that swap after first paint (R3-16), a unit that wraps away from its number (R3-18, now in practice). Round 3 closed the watch on a one-tap lock at clue 4 (R3-21). Round 4 reopens it as R4-01.

### What worked

- **The clock.** Told three ways before and after leaving, exact on return, paused on every reveal, equal at Lock in. Sam would share the game "mostly because the rules and the timer are honest".
- **The rules teach themselves.** Fifteen right answers out of fifteen before any help. Marcus "got it in about three seconds" and never opened How to play.
- **The fair Mystery 1.** A wrong first guess, a red "Not..." stamp, the ladder dropping from 4 to 3, then the year in clue 2. That sequence taught the wrong-guess rule to four personas in one screen.
- **The clue-1 solve.** "Knew it. +4" with the other clues marked "Not needed" was the best moment for Priya and for Lena.
- **Resume.** Every reload kept the clue, the wrong guesses and the clock.
- **Sharing.** The copy worked first time for all five, and nobody found an answer in the text.

## 5. Ranked findings

Ranked by severity, then by how many personas hit it.

### P0 and P1

| ID | Sev | Kind | Finding | Hit by | Persona labels | Owner | Against the spec |
|---|---|---|---|---|---|---|---|
| R4-01 | P1 | Confusion | At clue 4 the screen says "One pick: a wrong one scores 0" and "Keys A to D choose. Enter locks in.", and a key-chosen option shows as pressed. That reads as choose, then confirm. A tap locks in at once, and so does Enter on an option reached by Tab, even while another option is the chosen one. Priya and Marcus expected a second step and were lucky to tap what they meant. Lena had C highlighted, tapped A to change her mind, and it locked: "This one got away. 0 points." Sam had A chosen, tabbed to B to read it, pressed Enter, and B locked for 0 | 4/5 (Priya, Marcus, Lena, Sam); 2 lost a Mystery | P1 ×4 | MYS, with DS; needs a decision | A regression from two round 3 fixes. D28 shows the key legend from the moment the options appear, on any device. R3-09 exposes the chosen option as a pressed toggle. §22 kept "a clue-4 option commits on release by touch", so the build matches the decisions and the decisions now contradict the screen |

**Why this is a confusion, and why P1.** §9.4 grades wrong beliefs. All four believed something false about the one pick: that a tap or Enter only chooses. The screen taught them that; Priya, Marcus and Lena each quote the legend as the reason. Two acted on the belief and lost points they can't get back. It is the same shape as round 2's R2-02 (keys that answered from a heading, graded P1 confusion): an input that commits for good where the player was led to expect otherwise.

I considered both other grades.

- **Not a P2.** Round 2 filed a one-tap loss as a P2 to watch (R2-25), because Marcus simply mis-aimed. Nobody mis-aimed here. Lena and Sam pressed exactly what they meant to press and the game did something they didn't expect. Three of the three touch players and the one screen-reader user reported it, each on their own.
- **Not a P0, though a strict reader could say so.** §9.4's P0 is acting "on a wrong belief about a rule". The belief here is about how a control works at one step, not about scoring: all four answered the three rule questions correctly, the one-pick rule included, and each finished the Daily. One outcome corrected the belief. The verdict in section 10 is the same on either grade.

Two honest caveats. Lena's path mixed a hardware key with a tap on a phone, which few real players will do. Sam's loss was on a second Daily while he was testing keys. But Priya and Marcus formed the same belief in ordinary first play, and Sam's path (choose, Tab to read the others, Enter) is how a keyboard or screen-reader user reviews options.

### P2

| ID | Finding | Hit by | Owner | Fix | When |
|---|---|---|---|---|---|
| R4-02 | Groups, Me and Settings are one-line "on the way" pages, and Practice offers only Quick play. Me says "Your streak and past results will live here" right after a Daily | 5/5 | GRP-1, STA-1, SET-1; DS for the tabs | D29 already rules: hide or mark unbuilt tabs before launch. Nothing for M1 | M2, M3 |
| R4-03 | Key hints on a phone. "Keys A to D answer at once." shows on every practice question on a touch phone with no keyboard, and the clue-4 legend is in the page text twice (once for screen readers) | 3/5 (Priya, Marcus, Lena) | PRA, MYS | Show a key legend once a key has been pressed, or where the device has a fine pointer and hover. Part of R4-01's fix at clue 4 | Before round 5 |
| R4-04 | While away, Today's Continue card says "Your stopwatch is still running." and shows no time. The warning before leaving is only in the X's accessible name, so a sighted mouse or keyboard user learns it after the press | 5/5 (card); 1/5 (Dee, the X) | DLY, DS | The live time on the Continue card, not announced as it ticks, hidden if the stopwatch is hidden; a visible tooltip on the X | Before round 5 |
| R4-05 | The share text in a chat. No key for 🟧, a wrong guess looks like Next clue, rows are ragged because category names differ in length, the Encore's worst number sits in the first line, there is no line inviting a newcomer and no time. A screen reader reads it square by square | 5/5 | SHR-1 (M3) | Mostly decided: §22 keeps words first and one mark for both (D22). For M3: aligned rows, a hook line, a plain-words variant | M3 |
| R4-06 | The stop screen's layout. Share is a small secondary button under a large sticky "Done for today"; the share grid shows twice; the "Copied" toast sits over the "Daily #51" heading; at 1280×800 the sticky bar covers the share preview | 5/5 | DLY, DS | Share's weight is kept (§22). Move the toast off the heading, change the button's label to "Copied" for a moment, pad the page above the sticky bar, show the grid once | Toast and padding before round 5; the rest later |
| R4-13 | Practice and the Daily use the same keys differently: a letter answers at once in practice and only chooses at clue 4. Both legends say so, and Sam "had to re-read the legend each time". The practice legend is hidden from the accessibility tree and reaches a screen reader only as a description | 3/5 (Dee, Sam, Lena) | PRA, MYS | Kept by D28 and D30. Expose both legends the same way; say the difference in How to play | Later |
| R4-19 | Polish. The legend sits flush against the options group's focus ring and practice shows a stray dark line under it; the Close ring is clipped in the How to play sheet on a phone (R3-10); the practice score's focus ring is square; after three wrong guesses option D sits half below the fold at 1280×800; the footer's second row is indented; Practice's heading is sans-serif while Groups' is serif; the Encore result heading leaves a dangling "·" | 4/5 (Priya, Dee, Marcus, Sam) | DS, MYS | Padding inside the group's ring; inset Close; scroll the options into view at clue 4; one heading face; break before the separator | Later |
| R4-20 | Fixture and practice content. "Arven, as in the Arven Republic" for Arvenna; Mystery 3's clue 4 restates clue 1 and its clue 3 fits four listed countries; Mystery 1's clues 3 and 4 are near twins; the word "fixture" sits inside clue sentences; on #52 a wrong suggestion's descriptor ("cartographer") matches the day's theme; Quick play ends on a Medium after two Hards; "It's Honey and oats." beside "It's the Amber Sea."; "120 / g" wraps; How scoring works repeats one sentence | 3/5 (Dee, Marcus, Lena) | DLY for fixtures, PRA, content team | An editor pass on set A's explanations and the clue 3 to 4 step; a no-break space before units; the repeated sentence removed. For the real bank, a check that a wrong suggestion's descriptor doesn't echo the day's clues | Later; the repeated sentence before round 5 |
| R4-07 | The game talks about ranking at four places and ranks nobody. Dee "believed I was being ranked against someone" during play; Lena couldn't tell whether 5/12 is good and gave that as a reason not to share | 2/5 (Dee, Lena) | DLY-3 (M2) | The percentile and the crowd's numbers arrive in M2 (§22 keeps them out of M1). Until then, no change for the gate; one line on the stop screen is a cheap option (section 8) | M2 |
| R4-11 | Clue 4's keyboard edges. (a) A typed word made only of the letters a to d, then Enter, locks in an option: "Abba" and "Dada" both locked A. (b) After a reload at clue 4 focus lands on the H1 and A then Enter does nothing, under a legend that says they work. (c) The same key twice locks in, and only the Accessibility page says so. (d) A letter key gives no status message where Space does, and a rejected burst leaves a stale "Arvenna chosen. Enter locks it in." | 2/5 (Dee, Sam) | MYS | Section 6 | Before round 5 |
| R4-15 | The Encore's input. Letters go into the field and are then flagged; Enter in the field locks the one answer at once with nothing on screen saying so; a wildly long number (Priya's 15,050 for a lake's depth) gets no second look | 2/5 (Priya, Sam) | MYS | "Enter locks in" beside the field, as clue 4 has. The rest is standard form behaviour and stays | Before round 5 (the hint) |
| R4-17 | The guess box. With several matches Enter does nothing, even when the top row is the exact prefix; typing a year finds nothing though years show in the list; an option's accessible name reads "The Broken Lighthouse , 1972"; at 200% text the fourth suggestion and the clue are off screen while typing | 2/5 (Dee, Sam) | MYS | Remove the stray space. D5 and D23 keep pick, then submit | Stray space before round 5; the rest later |
| R4-08 | A returning player sees a first visit: no streak, no "yesterday 7/12". Yesterday's results page says "These results have moved to the archive" and there is no archive to open | 2/5 (Marcus; Priya for Me) | STK-1, STA-1, the archive (M2); DLY for the line | The streak and archive are M2. Change the line now so it promises nothing: "Yesterday's results aren't kept yet." | The line before round 5; the rest M2 |
| R4-09 | The in-app claim offer never shows. Priya finished a Daily in an Instagram-style context and saw no card on Today, in the Daily or on the stop screen, and she could replay #51 as a second player knowing the answers | 1/5 (Priya) | IDN-2 (M2) | The offer is built (`src/features/identity/offers/claim.tsx`) and no screen in this build mounts the offers registry. Mount it on the stop screen with M2's stop-screen work | M2 |
| R4-10 | How scoring works says a run with a hidden tab mid-round, or the hardest Mystery solved on clue 1 "after an unusually long look", is quietly left out of the crowd's numbers and "nothing on screen changes". The game says "Take your time" three times. Dee: "I cannot tell whether my own run counts" | 1/5 (Dee) | DLY, PRD §4.3.3 | A decision before the crowd's numbers ship (section 8) | M2 |
| R4-12 | Text resize. The progress marks (M1, M2, M3, E) and the stopwatch stay at 15 px at 100% and at 200% text, by design (`src/ui/stopwatch.tsx` sets them in px), and the phone tab labels grow only from 12 to 16.8 px. The Accessibility page promises 200% | 1/5 (Sam) | DS | Size them in rem and let the bar grow or wrap ([WCAG 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)); until then the statement shouldn't claim them | Early M2; release criterion R2 needs it |
| R4-14 | On a reveal, Enter on the focused answer heading moves to the next Mystery and nothing says so. Dee pressed Enter, then tabbed to what she took for Next mystery and pressed Enter again, which spent a Next clue on Mystery 2 | 1/5 (Dee) | MYS | Focus the Next mystery button on a reveal, or show "Enter continues" beside it | Before round 5 |
| R4-16 | A friend's link lands on a generic Today whose headline is "Hello.", and on slow 4G the card first paints generic chips with no Daily number, then swaps about 4 s later (R3-16, R3-19) | 1/5 (Lena) | SHR-1 (M3); DLY, DS | The share landing in M3; reserve the number and chips at their final width | M3; later |
| R4-18 | Announcements. The stop screen focuses "Daily #51" and says nothing of 7/12 or the time; Show stopwatch is silent where Hide is announced; leaving practice is silent; the last verdict stays in the status region on the next Mystery; one return to Today was announced as "Good afternoon." | 1/5 (Sam) | DS, DLY, PRA | "Daily #51: 7 out of 12, time 4:59" as the first announcement; announce Show stopwatch and Leave practice; clear the status region on each round | Later |
| R4-21 | How to play leaves Today's card once the Daily is done, and Settings is a placeholder, so the footer is the only way back to the rules | 1/5 (Dee) | DLY | Keep the link on the done card | Later |
| R4-22 | After a reload a clue the player had already seen gets its "New" badge again | 1/5 (Priya) | MYS | Badge a clue only when it arrives in this view | Later |
| R4-23 | A clue-1 solve gets the same "Knew it." stamp as a clue-2 solve | 1/5 (Marcus) | MYS, DS | Its own stamp, at M5's polish | M5 |

**Re-graded.** The personas filed twelve P1s. Four stand, merged into R4-01. Eight are P2 here.

- **R4-02 (Priya, Marcus): placeholder tabs.** Both read "on the way" correctly and went back with Go to Today. It's M2 and M3 scope and D29 already covers launch. Round 2 and round 3 graded it the same way.
- **R4-09 (Priya): the claim offer.** She read the situation exactly: no offer, and a second identity. That's a missing M2 feature (flow 5.14 is judged at M3's exit), not a wrong belief. It does mean round 3's method table was wrong to say the claim link was "in" the build.
- **R4-08 (Marcus): the returning player.** No misread; the streak is STK-1. The "archive" line promises something that isn't there, which is why its copy goes in before round 5.
- **R4-10 (Dee): Honest play.** She read the page right and disagrees with the rule. Her doubt is about a number M1 doesn't show. It needs a decision, not a fix.
- **R4-07 (Dee, Lena): no comparison.** Dee's belief that she was being ranked is a belief about the product's state, corrected on the stop screen, and nothing she did depended on it. Lena misread nothing; she had nothing to read. It is the strongest pull toward M2's percentile in four rounds, and it cost a share.
- **R4-12 (Sam): fixed-size header text.** He read 4:59 by leaning in, with no retry and no wrong number. It's an accessibility defect against release criterion R2, not a confusion, and it corrupts nothing the round measures.

One P2 came close to a P1: **R4-14**. Dee acted on a wrong belief about where she was and it cost a point. I've kept it a P2 because nothing on screen taught the belief, she put it down to her own haste, and one press corrected it. The fix is cheap and goes in before round 5.

## 6. Fixes for the P1, and for the key tests

Each fix names its owning area, the files most likely involved and a check a test can encode. "E2E" means Playwright against the mock backend.

### R4-01 (P1, confusion): one way to lock in at clue 4

**Hit by** Priya, Marcus, Lena and Sam. Lena's shots: `shots/15-key-c.png`, `shots/16-tap-A.png`, `shots/30-m2-tap-after.png`. Sam's: `68-m-m2-enter-on-B.png`.

**What the code does.** `MysteryOptions` (`src/features/rounds/mystery/options.tsx`) draws the legend whenever shortcuts are on (`data-keys-legend="shown"`), with no test for a keyboard or a pointer. Each option is an `AnswerButton` whose `onCommit` calls `lockIn`, so a tap or a click sends the pick on release. Enter on a focused option is the button's native click, and the key handler stops it only after typing (`typedSinceChoice`, the typing window). Moving focus clears the mark (`onFocus` sets `chosen` to null), so after Tab the option Sam had chosen is no longer chosen and Enter commits the one under focus. Space does it the safer way: it chooses first and locks only what is already chosen. The file's own header says "Pointers are untouched: a tap still commits on release", which is §22's ruling.

- **Owner:** MYS, with DS for `AnswerButton` and the new button. It needs a decision first (D31, section 8), since it reverses a line §22 kept.
- **Files:** `src/features/rounds/mystery/options.tsx` (`onCommit`, the Enter and Space branches of `onKeyDown`, `onFocus`, the legend), `src/ui/answer-button.tsx` (commit on release), `src/features/rounds/mystery/copy.ts` (`options.legend`, `options.lastLead`, `options.chosenNamed`), `src/features/rounds/mystery/index.tsx`, `src/features/legal/documents/accessibility.ts` (the keys paragraph), `src/features/daily/how-to-play.ts`; tests in `src/features/rounds/mystery/rite-3.test.tsx` and `e2e/daily/mystery-rite-3.spec.ts`, with new `rite-4` files beside them.
- **Fix (recommended, D31 option A):** clue 4 gets one model for every input, the Encore's: choose, then Lock in.
  - A tap, a click, Space, Enter on an option that isn't chosen, or its letter chooses that option. It is marked as now (pressed look, inked badge, `aria-pressed="true"`) and announced "Cobalt chosen." Nothing is sent.
  - Choosing another option moves the mark. Tab moves focus and leaves the mark where it is.
  - A **Lock in** button sits under the options, disabled until one is chosen, named for the choice ("Lock in Cobalt"). It sends the pick. Enter on the chosen option does the same. The same letter twice no longer locks in (R4-11c).
  - The line above the options says what is true for the device. With no key pressed yet: "Tap one, then Lock in." Once a key has been used: "Keys A to D choose. Enter locks in."
  - Practice keeps one tap and one key per answer. Its stakes are low and D30 stands; only its legend changes (R4-03).
- **Fix (the smaller option, D31 option B):** keep one tap. Then the screen has to stop promising a second step: no key legend until a key is pressed, "One tap locks in." on touch, and Enter on an option that isn't chosen chooses it, as Space does. This removes the false belief and leaves the mis-tap risk round 2 met (R2-25).
- **Test (option A):**
  - E2E, phone 390×844 with touch (Priya's and Marcus's path): on #51 take Next clue three times on Mystery 2. Tap option A. The round is still open (no reveal, the stake still reads 1), A has `aria-pressed="true"` and Lock in is enabled. Tap B: B is pressed and A isn't; still no reveal. Tap Lock in: the reveal is for B's label.
  - E2E, same phone (Lena's path): at clue 4 press the "c" key, then tap A. A is pressed, C isn't, and no reveal shows.
  - E2E, desktop keyboard (Sam's path): at clue 4 press "a", press Tab, press Enter. The round is still open, B is pressed, and the status region holds B's "chosen" line. Enter again: the reveal is for B.
  - Component: with no key pressed, the options' visible text has no "Keys" and has "Tap one, then Lock in."; after a keydown anywhere in the round it has "Keys A to D choose. Enter locks in." and the options' top hasn't moved.
  - Component: two taps on the same option inside 300 ms send nothing; `onPick` is called once, by the button.
  - The existing D28 tests stay: A then Enter with no Tab locks A; "Cartographer" then Enter sends nothing.

### R4-11 (P2, the gate's key tests): clue 4's keyboard edges

**Hit by** Dee (a, b, d) and Sam (c, d).

- **Owner:** MYS.
- **Files:** `src/features/rounds/mystery/options.tsx` (`typingUntil`, `typedSinceChoice`, the option-key branch), `src/features/rounds/mystery/focus.ts` and `index.tsx` (where a restored round sends focus), `src/features/rounds/mystery/copy.ts`, `src/features/legal/documents/accessibility.ts`.
- **What the code does.** (a) A run of option keys alone moves the mark and never sets `typedSinceChoice`, so "abba" ends with A marked, and Enter inside the typing window is allowed because `chosen === from`. (b) On a restored round the options are already there at mount, so the "as the options arrive" focus never fires and the default heading focus wins.
- **Fix:**
  - Three or more printable keys inside one typing window are a typed word, whatever the letters: set `typedSinceChoice`, clear the mark and its announcement. A then B then Enter (a change of mind) still locks B.
  - On restore with the options showing, focus the options group, as on first arrival.
  - With D31 option A the same-key lock goes. Without it, the legend says "Enter or the same key again locks in."
  - A letter key announces the choice the way Space does.
- **Test:**
  - Component: focus the group, type "abba" at 80 ms a key, press Enter: `onPick` isn't called and no option is pressed. The same for "dada", "Abba" after a 2 s pause before Enter, and "cab".
  - Component: "a", wait 1 s, "b", Enter: `onPick` is called once with B's index.
  - E2E (Dee's reload): reach clue 4 on Mystery 1, reload, press A then Enter with no Tab: `document.activeElement` was the options group after the reload, and A is chosen and locked as the model in force defines.
  - Component: after "aldessa" then Enter, the status region doesn't hold a "chosen" line.

### Method fixes

- **Pin the persona's time zone to the server's Daily.** Lena's Melbourne profile gave her #52. Either keep her on UTC or record which Daily each slot should get and check it at Play.
- **Record the spread test and cross-pool check runs** in the evidence folder before play, with their output.
- **Copy the evidence folder beside the E2E reports** as the round's last step. This is the fourth time it hasn't happened.

## 7. P2 fixes to land before round 5

- **R4-03, key legends on touch (PRA, MYS).** In `src/features/rounds/choice/index.tsx` and `options.tsx`, draw the key legend only once a key has been pressed in the run or the device reports a fine pointer with hover; keep its line reserved so nothing moves (§25). *Test:* component with `(pointer: coarse)` and no keydown: no text matching "Keys"; after a keydown, the legend shows and the first option's top is unchanged.
- **R4-04, the Continue card (DLY, DS).** `src/features/daily/home-card.tsx` and `home-copy.ts` show the running time beside "Your stopwatch is still running." (not in a live region; absent when the stopwatch is hidden). The X in `src/features/shell/play-header.tsx` gets a visible tooltip on hover and focus with the label's second sentence. *Test:* E2E, leave Mystery 2 at a known reading, wait 3 s: the card's time is the reading plus 3 s, within 1 s. Hover the X: the tooltip text is visible.
- **R4-06, the toast and the sticky bar (DS, DLY).** `src/ui/toast.ts` keeps the toast clear of the page's H1 as well as its controls; the stop screen (`src/features/daily/stop-screen/`) gets bottom padding the height of the sticky bar; Share's label reads "Copied" for two seconds. *Test:* E2E at 390×844 and at 1280×800, press Share: the toast's box doesn't intersect the H1's; the last line of the share preview can be scrolled above the sticky bar. *After review:* the padding was dropped. The bar is sticky in the page's flow, so the preview already scrolled clear of it and the padding only added an empty band at the page's end; the E2E now holds that the preview clears the bar and that the page ends 24 px under its last link. On load at 1280×800 the bar still crosses the preview (DESIGN §12.4). The toast also keeps off the titles inside the page (`main h2`) where a place or gap allows, and counts an H1 only while it is on screen; on the stop screen it sits on the date line under the heading, which is accepted (DESIGN §6.9).
- **R4-08, the archive line (DLY).** `elsewhere` in `src/features/daily/client-copy.ts` promises nothing until the archive ships. *Test:* `/daily/51/results` on day 2 has no "archive".
- **R4-14, Enter on a reveal (MYS).** In `src/features/rounds/mystery/reveal.tsx` and `use-keyboard.ts`, the reveal focuses the Next mystery button (the verdict is already announced), or shows "Enter continues" beside it. *Test:* component, the reveal mounts: `document.activeElement` is the Next button, or the hint is visible. E2E (Dee's path): on a reveal press Enter, then Tab, then Enter: Mystery 2's stake still reads 4.
- **R4-15, the Encore's Enter (MYS).** "Enter locks in" beside the number field once a key has been used. *Test:* the hint is in the field's description.
- **R4-17, the stray space (MYS).** `src/features/rounds/mystery/combobox.tsx` builds the option's name as "The Broken Lighthouse, 1972". *Test:* the option's accessible name matches `/\S, \d{4}$/`.
- **R4-20, the repeated sentence (DLY).** One sentence about the chart of how everyone did in `src/features/legal/documents/how-scoring-works.ts`. *Test:* no paragraph text appears twice on the page.

## 8. Changes that need a decision

| # | Doc and section | Proposed change | For |
|---|---|---|---|
| D31 | PRD §3.0.3 and §3.1.4; DESIGN §6.2; amends D20 and D28, and reverses §22's "a clue-4 option commits on release by touch" | Option A (recommended): at clue 4 every input chooses, and a Lock in button or Enter on the chosen option commits; the same key twice no longer locks in. Option B: keep one tap, show the key legend only once a key is pressed, say "One tap locks in." on touch, and make Enter on an unchosen option choose it. Practice is unchanged either way | R4-01, R4-11 |
| D32 | DESIGN §11; amends D28 and D30 | A key legend shows once a key has been pressed in the run, or on a device with a fine pointer and hover. This is D20's "once a keyboard is in use", restored | R4-03 |
| D33 | PRD §4.3.3; How scoring works | Before the crowd's numbers ship in M2: either drop "the hardest Mystery solved on its first clue after an unusually long look" from the quiet exclusions, or tell the player on the stop screen when a run is left out. "Take your time" and a silent penalty for taking it can't both stand | R4-10 |
| D34 | PRD §3.1.6 (stop screen), for M1 only | Optional. One line on the stop screen until the percentile ships: "Rankings are on the way. Today your result is yours." §22 chose no greybox "so far today" line; this is a smaller thing and doesn't block the gate | R4-07 |
| D35 | DESIGN §6 (the play header); the Accessibility page | The progress marks, the stopwatch and the tab labels scale with text size, and the header may grow or wrap | R4-12 |

**Why option A for D31.** The last clue is the only place where one press can cost a whole Mystery, and the game has now lost a persona a Mystery there by touch in two rounds of four (Marcus in round 2, Lena in round 4). The Encore, the other one-shot answer, already uses choose, then Lock in, and nobody has complained about it. Option B fixes the belief and keeps the risk.

**Kept as decided** (no doc change): Share stays secondary (§22), though all three phone players asked for it to lead; words first and one mark for a wrong guess and Next clue in the share text (§22, D22); practice answers on one key (D30); pick, then submit in the guess box (D5, D23); the stopwatch's rule while away.

## 9. Fix list by area

| Area | P1 | P2 before round 5 | P2 later |
|---|---|---|---|
| MYS | R4-01 one lock-in model at clue 4 (after D31) | R4-11 typed words of a to d, focus after a reload, the same-key lock, the letter's announcement · R4-14 Enter on a reveal · R4-15 "Enter locks in" at the Encore · R4-17 the stray space | R4-17 Enter on the top prefix match, the list at 200% · R4-19 options in view at clue 4 · R4-22 the "New" badge · R4-23 a clue-1 stamp |
| DS | R4-01 `AnswerButton` without commit on release at clue 4, the Lock in button | R4-04 a tooltip on the X · R4-06 the toast off the heading, padding above the sticky bar | R4-12 header and tab text in rem (D35) · R4-18 announcements · R4-19 rings, footer rows, heading faces |
| DLY | | R4-04 the time on the Continue card · R4-06 "Copied" on the button · R4-08 the archive line · R4-20 the repeated sentence | R4-16 reserved chips · R4-20 the editor pass on set A · R4-21 How to play on the done card |
| PRA | | R4-03 the key legend on touch | R4-13 both legends exposed alike · R4-20 answer case, units, the ramp's last item |

**Outside the four areas.** R4-02 is GRP-1, STA-1 and SET-1 under D29. R4-07 is DLY-3's percentile. R4-08's streak and archive are STK-1 and the archive. R4-09 is IDN-2's offer, to be mounted with the stop screen's offers. R4-05 and R4-16 are SHR-1 in M3. R4-10 waits on D33.

## 10. The M1 gate

### Verdict: round 4 does not pass, so M1 does not exit

PRD §9.3's exit reads: "The last round finds no P0 or P1 confusion and passes the comprehension check (§9.4)." Against round 3's list for round 4:

| # | Round 3 asked round 4 to show | Result |
|---|---|---|
| 1 | Five complete sessions on one build | Met |
| 2 | No P0 and no P1 confusion across the five | **Not met.** R4-01: four personas held a wrong belief about what locks in the last pick, and two lost a Mystery acting on it |
| 3 | All five answer questions 1 to 3 before any help page | Met, 15 of 15 |
| 4 | The header just before Lock in equals the stop screen, with a reload and on the throttled phone | Met, 7 runs of 7 |
| 5 | Test (c): A then Enter with no Tab locks A, with the legend showing. Test (b): a typed name commits nothing | Met as scripted. Two edges fail: a word of only a to d letters, and the keys after a reload (R4-11) |
| 6 | All five say the stopwatch kept counting, and all five say the Encore, then time | Met |
| 7 | A fair fixture Daily | Met for #51. Lena played #52 |
| 8 | Commit and build time recorded; a recorded run of the spread test and the cross-pool check | Half met: no run of the two checks is recorded |
| 9 | The five slots, with a report on the claim offer | Met. The report is that the offer isn't reachable (R4-09, M2) |
| 10 | Evidence beside the E2E reports | Not met |

Nine of the ten are met or are method notes. The one that isn't is the gate's own sentence. I looked for a reading that lets M1 exit and don't think there is an honest one. Calling R4-01 a P2 would mean saying nobody held a wrong belief, and four personas describe the belief in their own words and name the line that gave it to them. Calling it a defect would mean saying nobody was confused, and two of them lost points.

It is also a narrow failure. The format is understood: every rule question was answered right by every persona before any help, the clock is trusted, and the round 3 defect is gone. R4-01 exists because two fixes for keyboard and screen-reader users were applied to every device without checking what they tell a thumb. The fix is one component and one decision.

### What round 5 must show

**To pass the gate:**

1. Five complete sessions on one build with D31 decided and R4-01's fix in, plus R4-11 and the P2s marked "before round 5". An empty slot is re-run on the same build before the synthesis.
2. No P0 and no P1 confusion under §9.4 across the five.
3. All five answer questions 1 to 3 correctly before any help page.

**To show R4-01 is gone:**

4. Every persona reaches clue 4 at least once in the first Daily (take Next clue to the end on one Mystery) and answers a new probe before the reveal: "What will lock in your pick?" All five answer as the build behaves.
5. The three touch personas (Priya, Marcus, Lena) each change their mind once at clue 4, by tapping one option and then another, and say what happened. Nobody loses a Mystery to a press they meant as a choice.
6. Sam repeats his path in his first Daily: choose with a key, Tab to another option, Enter. Lena repeats hers: a key, then a tap. Neither locks anything the legend didn't say it would.
7. Dee repeats test (c) and test (b), adds "Abba" and "Dada" then Enter, and repeats A then Enter after a reload at clue 4. Nothing typed commits, and the keys work after the reload with no Tab.

**To show round 4's passes hold:**

8. Header at Lock in equals the stop screen for all five. The leave probe and the tie question, asked again: five of five on each.

**Method:**

9. All five play the same Daily, set A or a second fair set. Pin Lena's time zone or check the Daily number at Play.
10. Record the commit, the build time and a run of the spread test and the cross-pool check before play.
11. Keep the five slots. The claim offer needs no report until M2 mounts it.
12. Copy transcripts, answers and screenshots beside the E2E reports at the end of the round.

### What would carry into M2 if round 5 passes

None of this blocks the M1 exit; it is listed so it isn't lost. By area: **DLY** the percentile and a line of context on the stop screen (R4-07), the streak and yesterday's result on Today (R4-08), How to play on the done card (R4-21); **IDN** the claim offer mounted on the stop screen (R4-09); **DS** text size in the play header (R4-12, D35), the announcements (R4-18), the polish list (R4-19), unbuilt tabs hidden or marked (R4-02, D29); **MYS** the guess box's Enter and the list at 200% (R4-17), the "New" badge (R4-22); **PRA** the two legends (R4-13) and the content notes (R4-20); **decisions** D33 on Honest play before the crowd's numbers ship. **M3** takes the share text and the share landing (R4-05, R4-16), and **M5** the clue-1 stamp (R4-23).

### Decisions for the M1 exit

- **`options_from_clue` stays at 4.** Nobody stalled on typing in four rounds. R4-01 is about how the options lock in, not when they appear.
- **`daily_minutes` stays at 4.** Less the time away, first plays ran from about 1:55 to 3:22 (median about 2:53), agent latency included. The closed beta's median session sets it (PRD §3.1.7).
- **D8 holds:** the stopwatch stays visible. Its rule is understood by all five and its number is now exact.

## Appendix A. Comprehension answers, verbatim

**Priya**
1. "4 points. The ladder shows 4-3-2-1 with 'points now', and the first clue says 'Get it from this clue for 4 points'."
2. "The same as taking Next clue: the Mystery drops one point (4 to 3) and the next clue comes in, so you may as well have a go. On the last clue you get one pick of four and a wrong one scores 0."
3. "It scores no points. It only decides ties: among players on the same points the closer number ranks higher, and time only counts after that."

**Dee**
1. "4 points. The ladder shows 4/3/2/1 and clue 1 says 'Get it from this clue for 4 points'."
2. "The same as pressing Next clue: you move to the next clue and the Mystery is worth one point less. On clue 4 you get one pick from four, and a wrong pick scores 0."
3. "Nothing in points. It only breaks ties: among players level on points the closer number ranks higher, and time counts only after that."

**Marcus**
1. "4 points. The first clue said 'Get it from this clue for 4 points' and the 4-3-2-1 ladder at the top showed '4 points now'."
2. "The same as taking Next clue: the next clue opens and the Mystery is worth one point less (my wrong first guess took it from 4 to 3). The exception is the last clue, where you get one pick of four and a wrong one scores 0."
3. "It gives no points. It decides ties: if two people have the same points, the closer Encore guess ranks higher, and time only counts after that."

**Sam**
1. "4 points. Clue 1 is worth 4, then 3, 2 and 1 for the later clues, so three Mysteries make 12 at most."
2. "The same as pressing Next clue: the Mystery drops one point in value and the next clue opens. On clue 4 you get one pick, and a wrong one scores 0."
3. "It scores no points. It only breaks ties: among players on the same points the closer number ranks higher, and time only counts after that."

**Lena**
1. "4 points. The first clue said 'Get it from this clue for 4 points' and the 4-3-2-1 ladder showed it; I got it on Bismuth and saw 'Knew it. Solved on clue 1 · +4'."
2. "The same as tapping Next clue: you get pushed to the next clue and the Mystery is worth one point less (4 went to 3 when I guessed the wrong Ada Morrow). The exception is the last clue, where you get one pick out of four and a wrong pick scores 0."
3. "It gives no points. It only decides ties: if two people have the same points, the closer number ranks higher, and time only counts after that."

## Appendix B. Evidence

All under `/home/user/playtest-evidence/rite-4/`; the build time is in `/home/user/playtest-evidence/rite4-build-time.txt`.

- **Priya:** `notes.md`, `driver.js`, screenshots 01 to 56. Time away: 12 to 15. The one-tap lock at clue 4: 17 to 19, and again in the in-app context at 53. Stop screen and share text: 27, 28. The in-app context with no claim offer: 50 to 56.
- **Dee:** `notes.md`, `driver.js`, `snap.js`, 76 files with screenshots 01 to 59. Her key tests and the three fresh contexts are in the notes.
- **Marcus:** `transcript.md`, `driver.js`, 73 screenshots over two days. Clue 4: 24 to 26. Time away: 17, 18. Stop screen and share: 32, 34. Day 2: 57 (Today), 68 (the clue-1 solve), 72 and 73 (Me, and yesterday's results).
- **Sam:** `notes.md`, `raw-output.log`, step scripts `s01.js` on, screenshots 01 to 77. Clue 4 on desktop: `23-m2-clue4.png`. Enter on B: `68-m-m2-enter-on-B.png`. The How to play sheet on a phone: `61-m-howto.png`.
- **Lena:** `notes.md`, `driver.js`, `shots/` with 96 screenshots, per-step output in `out/`. First paint: `shots/01-land-early.png` and `02-land.png`. The key, then the tap: `shots/15-key-c.png`, `shots/16-tap-A.png`. The second tap lock: `shots/30-m2-tap-after.png`.
