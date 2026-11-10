# RITE round 6: persona playtest of the M1 greybox

**Date:** Tuesday 10 November 2026 · **Build:** production build of the playtest worktree at `63fa3f9` (built 20:58:25 UTC), one server for all five personas, mock backend, fixture set A, real clock, every driver pinned to one time zone · **Round:** 6 (PRD §9.3, M1) · **Judged by:** the PRD §9.4 rubric · **Previous round:** [rite-5.md](./rite-5.md); its fixes, and D36 to D38 from 02-PRODUCT-DECISIONS §28, are in this build

## The short version

Five persona agents played Daily #51 and all five returned a full report. No slot was missing and no browser was killed. Marcus came back the next day for #52, Dee ran a second #51, and Sam ran a second visit on a phone profile.

- **0 P0, 1 P1, 22 P2**, merged from 57 findings in five reports. The personas filed eleven P1s. Two stand, merged into one, and it is a defect, not a confusion.
- **R5-01 is fixed.** All five finished the Daily, locked in from clue 4, opened Quick play and wrote down what a tap would do before the first answer. All five were right, and four quoted the new line ("Tap an answer. It counts straight away."). Nobody had an answer scored on a press meant as a choice.
- **R6-01 (P1, defect): a second tap on "Next question" answers the next question.** The button sits where option D of the next question appears, and the new options are live at once. Priya and Marcus double-tapped out of habit and had four answers scored unread, three of them wrong. Neither held a wrong belief: both had just written that one tap is final. A test can pin it exactly.
- **Comprehension: 15 of 15** on questions 1 to 3, all before any help page, for the third round running.
- **The probes pass**: five of five on the stopwatch while away, the tie order, the clue-4 lock-in and the new practice probe. The header at Lock in equals the stop screen in seven runs of seven.
- **The M1 gate passes, and M1 exits.** PRD §9.3 asks for a last round with no P0 or P1 confusion and a passed comprehension check. Round 6 has neither kind of confusion. Section 10 says why R6-01 doesn't change that, and makes its fix the first item of M2's practice work, proved by a test.
- **Fun 7.0** (five sevens, up from 6.7) and **would share: 5 of 5**.

## 1. Method

### What changed from round 5

Fixes only, as round 5 asked. The build carries FIX5 and integration 10: D36's line above practice options, D37's Enter at the Encore with a button that names the number, D38's eased typed-word rule with the new clue-4 legend, the reporting sentences behind a switch, and no group frame on a touch load.

| Round 5 asked for (rite-5 §10) | What round 6 did | Result |
|---|---|---|
| Five complete sessions on one build, D36 and D37 decided (item 1) | Five reports, none missing | Met |
| Daily first, clue 4 reached and locked from, then Quick play with the new probe written before the first answer (item 4) | All five did, in that order | Met, 5 of 5 |
| Marcus and Lena on touch-only profiles with no hardware key (item 5) | Both report a touch-only session with keys typed only into text fields | Met |
| Priya repeats the Encore's Enter on a touch-only profile (item 6) | Typed 320, pressed Enter: nothing sent | Met |
| The clue-4 probe again; Sam's choose, Tab, Enter; Dee's three slow changes of mind and "Abba", "Dada" (item 7) | Probe 5 of 5. Sam ran his path and said what he expected first. Dee ran the typed words and two changes of mind half a second apart; the three-keys-with-pauses path came from Sam, not Dee | Met, with Dee's slow path covered by Sam |
| Header against the stop screen; the leave probe; the tie question (item 8) | Asked of all five | Met, 5 of 5 on each |
| Same Daily, time zones pinned (item 9) | #51, set A, one zone | Met |
| Own profile and process group for each driver (item 10) | No session reports a killed browser or a restart. Lena lost about a minute to her own script's stalls | Met |
| Commit, build time, cross-pool check, spread test with test names (item 11) | All four files recorded before play. `spread-contract.txt` now names its tests, among them "R2-03 200 seeded identities each take Mystery 1 to clue 4, and each display position holds the key 30 to 70 times" | Met |
| Evidence recorded for a reviewer (item 12, as §28 reworded it) | Evidence is in `/home/user/playtest-evidence/rite-6/` (182 MB), which `docs/playtests/evidence/README.md` covers by its rule for round N's folder. Its table has no row for round 6 yet | Met in substance; the row is still to add |

### Who played

| Persona | §9.3 slot | Device and setup | Daily | Score | Time (header at Lock in = stop screen) | Less the time away | Fun | Would share |
|---|---|---|---|---|---|---|---|---|
| Priya | Daily-ritual player; non-US English | 390×844 touch, clipboard; then a fresh context with an Instagram user agent | #51 | 9/12, Encore 270% off | 4:28, with 2:09 away | about 2:19 | 7 | Yes |
| Dee | Trivia buff | Desktop 1280×800, keyboard first; fresh contexts for key tests and option orders | #51, twice | 9/12, 178% off | 4:13, with about 2:10 away; second run 1:05 | about 2:03 | 7 | Yes |
| Marcus | Host of an office quiz; non-US English | 390 px touch phone, touch only, no clipboard permission on day 1 | #51, then #52 the next day | 7/12, 189% off; then 3/12 | 3:31, with about 2:05 away; then 2:20 | about 1:26 | 7 | Yes |
| Sam | Screen-reader user | Desktop 1280×800 at 200%, keyboard only, read from aria snapshots; then a fresh visit at 390×844 with text at 200% | #51 | 6/12, 247% off | 5:57, with about 2:10 away | about 3:45, key tests included | 7 | Yes |
| Lena | First-time casual player from a friend's link; low-end Android over slow 4G | 360×640, slow 4G, touch only | #51 | 8/12, 247% off | 6:15, with about 2:42 away and about a minute of script stalls | about 2:30 | 7 | Yes |

**Content.** #51 is fixture set A, as in rounds 4 and 5: The Lantern Keeper (Easy), cobalt (Medium), Arvenna (Hard) and the depth of Lake Ostry (86.4 m). The cross-pool run before play reads "79 item(s) indexed, 0 pair(s) at or above 0.5" and "0 Daily item(s) share a fact with a practice or room item (X29)". The personas have now seen this set three times as roles, though each session starts with no memory of the others.

**Severity.** Re-judged against §9.4 as in every round. *Confusion* is a wrong belief about a rule or a score, or an action taken on one; the gate counts it. *Defect* is a fault that confused nobody. A feature that M2 or M3 builds is backlog. A preference or a wish is neither.

### Where this round fell short

1. **Dee didn't run her own slow path.** Round 5 asked her to change her mind three times by key with pauses. She changed twice, half a second apart. Sam's session supplies the rest: keys 1.5 s apart always chose, and three inside two seconds tripped the guard.
2. **Three of the four who met the silent Share fallback met it because of the driver.** Marcus's, Sam's and Lena's contexts had no clipboard permission on the first tap. Priya met it where a real player would, in the Instagram context.
3. **Priya couldn't test the claim link's hand-over.** The mock backend keeps its data per browser, so a link made in one context reads as expired in another.
4. **Times are agent times**, and every first Daily includes about two minutes away on purpose.
5. **The ghost tap (R6-01) was first met in free play, then repeated on purpose.** Priya's first was "like I always do"; her second, and Marcus's 600 ms one, were to measure it.

## 2. Comprehension check

Asked as written after each persona's first Daily. All five answered before opening any help page. Question 4 is out of M1's check (decisions memo §22). Their words are in Appendix A.

| Question (PRD §9.4) | Expected | Priya | Dee | Marcus | Sam | Lena |
|---|---|---|---|---|---|---|
| 1. What does solving a Mystery on clue 1 earn? | 4 points | Yes | Yes | Yes | Yes | Yes |
| 2. What does a wrong guess cost? | The same as Next clue: the Mystery is then worth one point less | Yes, and a wrong pick on the last clue scores 0 | Yes, same | Yes, same | Yes, same | Yes, same |
| 3. What does the Encore decide? | The tiebreak after points; it scores no points | Yes; time only after that | Yes; time only after that | Yes; time only after that | Yes; time only after that | Yes; time only after that |

**The check passes: 15 of 15.** Priya, Dee, Marcus and Sam read How scoring works afterwards and found it agreed with them.

## 3. Probes

| Probe | Priya | Dee | Marcus | Sam | Lena |
|---|---|---|---|---|---|
| "While you were away, did your stopwatch keep counting?" | Yes. 1:23 when she left, 129 s away, card 3:32, header 3:34 | Yes. 1:08, 129 s away, card 3:17, header 3:19 | Yes. 0:43, two minutes away, card 2:47, header 2:48 | Yes. 1:34, about 126 s away, card 3:40, header 3:47 | Yes. 1:38, about 160 s away, card 4:19, header 4:22 |
| "If two players tie on points, what decides?" | Encore, then time | Encore, then time | Encore, then time | Encore, then time | Encore, then time |
| "What will lock in your pick?" (written before picking at clue 4) | "Tapping an option only highlights it; nothing counts until I press the big Lock in button." Then B, A, Lock in: as predicted | "A letter or click only highlights; Enter or the Lock in button sends it." Then B, C, Enter: as predicted | "Tapping an option only selects it. The grey Lock in button at the bottom is what sends it." Copper, Cobalt, Lock in: as predicted | "A letter (or tabbing to one) only chooses it. It is sent when I press Enter on the chosen option or the Lock in button." A, D, Tab, Enter: as predicted | "Tapping a film only chooses it; I get one go." B, A, Lock in: as predicted, and no request left on either tap |
| **New.** "What will happen when you tap (or press) an answer here?" (written before the first practice answer) | "One tap is my final answer. No Lock in, no changing my mind." Right | "A letter here is the answer, with no lock-in and no changing my mind." Right | "One tap is final, no Lock in like the Daily." Right | "It answers straight away. I must not press a letter until I am sure." Right | "It will answer right away, no second button." Right |
| Was any practice answer scored on a press meant as a choice? | No. Two were scored on second taps of "Next question" (R6-01) | No, in two runs | No. Two were scored on second taps of "Next question" (R6-01) | No, in two runs | No, in two runs; a swipe that started on a card didn't count |
| Key tests | Guess box: Enter with no match, and with four suggestions and none picked, sent nothing. Encore: typed 320, Enter: nothing sent, focus left the field, button "Lock in 320 m" | A letter on a heading: nothing. "Cartographer", "The Beekeeper", "Abba", "Dada", "Add", "The Lantern Keeper", each then Enter: nothing committed. Esc brought the keys back and the screen said so. A then Enter locked A, also after a reload. Three contexts, three option orders | None (touch only). A tap on the greyed Lock in did nothing | Keys outside the options: nothing. a, d, Tab, Enter: locked D as he expected. With B chosen, Tab to C, Enter: chose C, sent nothing, as he expected. Three letters inside 2 s cleared his choice; a stray "e" or "z" cleared it in silence (R6-14) | None (touch only) |
| Header at Lock in against the stop screen | 4:28 and 4:28 | 4:13 and 4:13; second run 1:05 and 1:05 | 3:31 and 3:31; day 2, 2:20 and 2:20 | 5:57 and 5:57 | 6:15 and 6:15 |

**What the probes show.** The two ways to answer are now both labelled, and both labels are read. Ten written predictions, five at clue 4 and five in practice, and all ten were right. Clue 4 sent nothing early in any session. The Encore's Enter does only what the screen says on a phone and on a desktop. The clock held to the second in seven runs. What the round found is beside the answer, not in it: a tap aimed at a button that has just gone.

## 4. What improved since round 5

### Round 5's P1

| ID | Sev | Round 5 finding | Status | Round 6 evidence | What's left |
|---|---|---|---|---|---|
| R5-01 | P1 (confusion) | Practice answers on one tap, straight after the Daily taught "Tap one, then Lock in" | Fixed | Five written predictions, five correct, each before the first answer. Priya, Marcus and Lena quote "Tap an answer. It counts straight away."; Dee and Sam quote "A tap or a key A to D answers at once." Question 1 was scored as each meant it. Round 5 had four of five wrong here | The cards still look the same in both modes, and the line is small and grey. Three said a skimmer could miss it (R6-06). Nobody did |

### Round 5's P2s marked "before round 6"

| ID | Finding | Status | Round 6 evidence |
|---|---|---|---|
| R5-02 | The Encore's Enter on a phone; the plain "Lock in" button; letters in the number field | Fixed for Enter and the button; the field still takes letters | Priya on touch: Enter sent nothing, focus left the field, "You're answering 320 m" stayed and the button read "Lock in 320 m". Sam on a keyboard: Enter locked "and the screen said so". Sam typed "ab300" and it went into the field; "Numbers only, please." was spoken, but shown below the fold at 200% (R6-20). Dee's stale error message wasn't re-tested |
| R5-03 | The legend said "Enter locks in." where Enter on another option chooses | Fixed | Dee and Sam both read "Keys A to D choose. Enter on your choice locks in." Sam wrote his expectation first (Enter on C chooses C and doesn't send B) and that is what happened |
| R5-04 | A third slow key cleared a choice (D38) | Fixed as decided | Keys 1.5 s apart always chose (Sam). "Abba", "Dada", "Add" and a full title, each then Enter, locked nothing, at 260 ms a key too (Dee). When a word trips, focus goes back to the group (Sam). Three valid letters inside two seconds still trip the rule, which is D38 as written; Sam minds (R6-14) |
| R5-06 | Help pages promised "Report a problem" | Fixed, as far as round 6 shows | The sentences sit behind `REPORTS` in `shipped.ts`. Dee read About our questions and How scoring works closely and didn't report the promise |
| R5-11 | The options group's frame on a touch load | Fixed, as far as round 6 shows | None of the three touch players reported a frame in practice or at clue 4. On a keyboard at 200% the ring still sits tight against the text (Sam, in R6-04) |
| R5-12 | A touch after a key keeps the key wording | Built, not exercised | The line now follows the last input. No touch persona pressed a hardware key this round, on purpose |

**Totals:** of the six items and the P1, four are fixed, two are fixed as far as round 6 shows, and one is built but untested by a persona. The one piece left open is the Encore field accepting letters.

### What worked

- **The line above the options.** One sentence, in a place already held for it, undid round 5's P1 for five of five.
- **The button that names the pick.** "Lock in The Lantern Keeper (1987)" and "Lock in 320 m" were praised by Priya, Marcus, Sam and Lena. Priya: the label "does the real work, and does it well".
- **The rules.** Fifteen right answers before any help, again. Marcus and Lena both quote the pink line as what taught them.
- **The clock.** Said three ways and shown ticking. All five knew, and all five numbers match.
- **"Knew it."** Lena and Sam each call a clue-1 solve the best moment of the session.
- **Sharing with the clipboard allowed.** One tap, "Copied. Paste it into your group chat.", the clipboard equal to the preview, no spoilers.

## 5. Ranked findings

Ranked by severity, then by how many personas hit it.

### P0 and P1

| ID | Sev | Kind | Finding | Hit by | Persona labels | Owner | Against the spec |
|---|---|---|---|---|---|---|---|
| R6-01 | P1 | Defect | In Quick play, "Next question" sits at about y 748 to 804 on a 390×844 phone. Option D of the next question renders at about y 770 to 828 and takes taps at once. A second tap on Next, 150 to 600 ms after the first, lands on option D and is scored. Priya: Chalk on question 2 and 1530 on question 3, both wrong, in a 3/10 run. Marcus: Red ochre wrong on question 2, and question 3 answered unread (right by luck), in a 5/10 run | 2/5 (Priya, Marcus); four answers scored, three wrong. The other touch player, Lena, tapped once each time | P1 ×2 | PRA, with DS | PRD §3.0.3 and DESIGN §10.2 put the options in the thumb zone and R1-21 put the sheet's button where the answers were. Each is right alone. Together they stack two targets on one spot a beat apart, and nothing in the spec covers the beat |

**Why this is a defect, and why P1.** A player's score changed on a press they never aimed at an answer. In a mode that says "It counts straight away", that is the worst thing a stray tap can do, and it happened to two of the three touch players in free play. That earns the P1.

It is not a confusion. §9.4 asks whether a persona held a wrong belief about a rule or a score, or acted on one. Priya and Marcus had each written, minutes earlier, that one tap is final, and both said at once what had happened and why: "two of those wrongs were ghost taps". Neither misread a score. Neither changed how they played, beyond tapping once. Round 5's R5-01 was a belief the game taught; this is a tap that arrived after its target had gone.

I looked at the other grades.

- **Not a P1 confusion by the "more than one retry" route.** Nobody needed a retry to get through a step. The step went through too easily.
- **Not a P2.** R5-02, the Encore's Enter, stayed a P2 because it came from a key test and sent the number the screen showed. This came in free play, twice, and sent an answer nobody chose.
- **Not a P0.** Every flow finished and no rule was misunderstood.

One caveat cuts the other way. Round 5's item 5 reads "Nobody has a practice answer scored on a press they meant as a choice", and on its wording that is met: these presses were meant for Next, not as a choice. But the reason for item 5 was that no practice answer should be scored by surprise, and four were. Section 10 weighs that.

### P2

| ID | Finding | Hit by | Owner | Fix | When |
|---|---|---|---|---|---|
| R6-02 | Groups, Me and Settings are one-line placeholders and Practice repeats Quick play. No streak, no stats. On day 2 Today looks like a first visit and yesterday's results are gone. Settings points to a menu you can't reach once the Daily is done | 4/5 (Priya, Dee, Marcus, Lena) | GRP-1, STA-1, SET-1, STK-1, ARC-1; DS-1 for the tabs | D29 rules: hide or mark unbuilt tabs before launch. Backlog. The sixth round to say so | M2, M3 |
| R6-03 | Share with the clipboard blocked. No toast, no spoken word, the button stays "Share". A "Copy this text" box appears with the text selected, above the "Your share text" box that already holds the same text. It stays after a later copy succeeds | 4/5 (Priya, Marcus, Sam, Lena); three through the driver's permissions, Priya in the Instagram context | SHR-1 | One sentence, shown and spoken: "Couldn't copy. Press and hold the text to copy it." Select the box that is already there and add no second one. Hide the fallback after a copy that works. Round 5 had this at 1 of 5 (R5-24); pull it forward | Early M2 |
| R6-04 | Polish and layout. The sticky "Done for today" bar covers the share preview at 1280×800 (Dee). "Take your time" is half under the header on reveals (Dee, Lena). Next mystery is below the fold on every reveal at 360×640 (Lena). Toasts cover the Continue card or the legend at 200% and at 360 px (Sam, Lena). Header chips stay at 15 px while text doubles, so "247%" is hard to read (Sam, Lena). The Encore result heading wraps badly (Lena). The "New" badge returns after a reload (Dee, Marcus). The footer's second row is indented (Marcus). Practice result titles are cut at 200% (Sam). The group's focus ring has no padding (Sam) | 4/5 (Dee, Marcus, Sam, Lena) | DS-1, MYS-1 | Padding for the sticky bar and scroll margin under the header; a reserved edge for toasts; chips in rem; wrap result titles | Later, with D35 |
| R6-05 | Nothing to compare a score against. The game talks of ranks and ties on every screen and the stop screen ranks nobody. Dee, Marcus and Lena couldn't tell whether 9, 7 or 8 out of 12 is good. A friend's link lands on plain Today with no trace of the friend (Lena) | 3/5 (Dee, Marcus, Lena) | DLY-3; SHR-1 for the landing | The percentile is M2 and the share landing is M3. D34's optional line ("comparisons arrive with more players") would answer Dee today | M2, M3 |
| R6-06 | The A to D cards look the same at clue 4, where a tap chooses, and in practice, where a tap answers. The line that tells them apart is small and grey. All three read it and predicted correctly | 3/5 (Priya, Dee, Lena) | PRA-1, DS-1 | Kept as D36 decided. Watch first-question mis-taps in the closed beta; if they show, give the line more weight on question 1 | Later |
| R6-07 | The X leaves with the clock running. All three knew, since it is said three ways. It still reads like a pause to Priya, sits oddly beside "Take your time" for Lena, and felt like a charge to Dee | 3/5 (Priya, Dee, Lena) | DLY-1 | D19 holds. Optional: "Time only breaks ties." on the Continue card | Later |
| R6-08 | Fixture content. The Easy film's first clue matches four look-alike decoys and the Hard country falls to a five-second anagram; clue 4 of the Hard one helps less than clue 1 (Dee). A same-profession decoy on #52 (Marcus). Reveal text disagrees with its answer ("Arven" for Arvenna; "hero" then "watchman"). The word "fixture" sits inside sentences (Priya) | 3/5 (Priya, Dee, Marcus) | CNT-1, CNT-2 | Fixtures don't ship. For the real bank: the prefix check and decoy lint from R5-10, and an editor pass that reads each reveal against its answer | Before M2's content load |
| R6-09 | Today's card. "Then one number." meant nothing before the Encore (Lena). How to play disappears from the card once the Daily is done (Dee). The done card's emoji grid has no labels or legend (Marcus) | 3/5 (Dee, Marcus, Lena) | DLY-1 | "Then one number to guess, for tie-breaks."; keep the How to play link; a one-line legend | Later |
| R6-10 | Practice layout. The options sit at the bottom before an answer and jump to the top after it, then back (Priya, Marcus). At 200% text the sticky Next question button lies over the last line of the explanation with nothing behind it (Sam) | 3/5 (Priya, Marcus, Sam) | PRA-1, DS-1 | The jump is R1-21's design and is half of R6-01's cause; see section 6. An opaque bar behind the sticky button | With R6-01; the bar later |
| R6-11 | Enter in practice does nothing for 0.7 to 1.5 s after an answer, with no sign, and nothing says Enter continues | 2/5 (Dee, Sam) | PRA-1 | Show "Enter continues." as the Daily does, and queue an early Enter. Round 5's R5-23 | Early M2 |
| R6-12 | At clue 4 the page scrolls to fit the options and the points ladder goes under the header. The screen says a wrong pick scores 0 and no longer says a right one scores 1 | 2/5 (Marcus, Lena) | MYS-1 | "Right pick: 1 point. Wrong pick: 0." in the instruction line (amends D24, section 8) | Early M2 |
| R6-13 | A chosen option at clue 4 shows only a dark letter chip and a slightly heavier border. The bar's label is what tells you | 2/5 (Priya, Sam) | DS-1 | A filled card or a thick border, a tick and the word "Chosen". Round 5's R5-18 | Early M2 |
| R6-14 | Clue 4's typing guard. Three valid letters inside two seconds (a, c, d) clear the choice and refuse the third. A stray "e" or "z" half a second after a choice clears it with nothing spoken. The line that changes is the same small grey text in the same place (Dee). Digit 1 chooses A and no page says so | 2/5 (Sam, Dee) | MYS-1 | Announce "Choice cleared." whenever one is; flash the line when it swaps. Whether three quick option letters should keep the last choice is D38's open narrowing (section 8) | Announcement early M2 |
| R6-15 | Practice results and exit. The results page of a second run opens with the "Copy this text" box and question 1's "Why" already open, left from the first run (Marcus). No breakdown by difficulty, and category choice is "coming soon" (Dee). X in practice returns to Today, where Continue practice is half under the tab bar at 640 px (Lena) | 3/5 (Dee, Marcus, Lena) | PRA-1 | Key the results view by run id. The rest is PRA-1's scope | Early M2 for the stale state |
| R6-16 | Keyboard focus and speech. A new Mystery and the Encore focus the heading, so a first typed key goes nowhere (Dee typed 240 into nothing). On a phone layout the tab bar comes after seven footer links. The status region keeps the last verdict into the next round, and "Your pick" isn't exposed to a screen reader. Hide stopwatch gives no spoken confirmation | 2/5 (Dee, Sam) | MYS-1, DS-1 | Send printable keys to the field from a heading; clear the status region on a new round; announce "Stopwatch hidden. It still counts for tie-breaks." Round 5's R5-17 | Later |
| R6-20 | The Encore's field. It takes letters, and at 200% the error and the button are below the fold, so "ab300" looks accepted (Sam). The empty box has no placeholder (Lena) | 2/5 (Sam, Lena) | MYS-1 | Stop a non-number at the key, which R5-02's fix asked for and didn't get; mark the field itself invalid; "Type a number" | Early M2 |
| R6-17 | The share text in a chat: labels before the squares leave the rows ragged, the legend doesn't travel, and "Encore off by 270%" means nothing to a newcomer. She'd post it anyway | 1/5 (Priya) | SHR-1 | §22 keeps words first. Round 5's R5-09 | M3 |
| R6-18 | How scoring works says a run with a "long look" or a hidden tab is quietly left out of the crowd's numbers, beside "Take your time". Dee solved the Hard one on clue 1, left for two minutes and can't tell whether her run counts | 1/5 (Dee) | SQL-5's owner | D33, as widened in §28. Round 5's R5-21 | M2 |
| R6-19 | The in-app claim offer. Nothing on the stop screen, Today or Me offers to carry progress out of Instagram. The panel exists at `/me/sync` and nothing links to it. Its link read "expired" in a clean context seconds later, where "couldn't be used" is the truth. A new guest can replay #51 for 12/12 in 0:31 | 1/5 (Priya) | IDN-2 | Mount the card after the first in-app finish and link `/me/sync` from Me; split "expired" from "not found"; test the hand-over on a shared backend | M2 |
| R6-21 | Clue 4 at 200% text on a phone: the group is 920 px tall on an 844 px screen, so no option shows on arrival. A letter scrolls the chosen one into view | 1/5 (Sam) | MYS-1, DS-1 | Round 5's R5-05, with D35 | Early M2 |
| R6-22 | No running total in play. Lena added the chips up herself | 1/5 (Lena) | DLY-1 | §22 keeps no visible total. No change | None |
| R6-23 | On the stop screen "Done for today" is the large button and Share the small one | 1/5 (Marcus) | DLY-1 | §22 keeps Share secondary. No change | None |

**Re-graded.** The personas filed eleven P1s. Two stand as R6-01, a defect. Nine are P2 or backlog here.

- **R6-03, the Share fallback (Marcus, Lena).** A defect, and the P2 closest to a P1. Marcus "could not tell whether anything was copied" and Lena "had to guess". That is uncertainty, not a wrong belief about a rule or a score, and the box with the text selected did let each of them through without a retry. Lena's second tap worked because the driver had allowed the clipboard by then. It is the path an in-app browser takes, so it shouldn't wait for M3.
- **R6-14, the typing guard (Sam).** Friction. He lost a choice, never a point; the line told him to press Esc and he did. The rule is D38 as decided: three keys closer than 1.5 s are a word. His proposal, to count only non-option letters as typing, would let "Abba" then Enter lock A, which is round 4's R4-11. The silent clearing is a real fault for a screen-reader user and gets its announcement.
- **R6-05, nothing to compare against (Dee, Lena).** DLY-3's percentile in M2 and SHR-1's landing in M3. Both read the screens exactly. Dee found the sentence that admits it, on a page she had to go and open.
- **R6-02, the returning player (Marcus).** STK-1, STA-1 and ARC-1. He misread nothing.
- **R6-18, honest play (Dee).** She read the page right and disagrees with the rule. D33 owns it. A third round has now raised it.
- **R6-08, difficulty labels (Dee).** Fixture content, judged as content. A fair point about the ladder all the same, and CNT's lints are the answer.
- **R6-19, the claim offer (Priya).** IDN-2, M2. She found the unmounted card by reading the source.

## 6. The fix for the P1

"E2E" means Playwright against the mock backend.

### R6-01 (P1, defect): a tap aimed at "Next question" never answers the next question

**Hit by** Priya (`31-qp-q2-after-doubletap.png`, `32-qp-q3-400ms.png`) and Marcus (`33-qp-doubletap-next.png`, `34-qp-doubletap-600.png`; his taps were at x 195, y 776).

**What the code does.** In `src/features/rounds/choice/index.tsx` the options are pushed to the foot of the screen while a question is open (`!settled && "mt-auto"` on the group). After an answer they close up under the stem and the explanation sheet takes the foot, with its button (`continueLabel`, "Next question" or "See your results") where the last option was. That is R1-21's layout. On continue, the next question's options render back at the foot and `interactive` is true on the first frame: `commit(index)` checks nothing but `interactive`. `AnswerButton` commits on `click`, so a whole second tap on the same spot is a valid answer. The component already guards the other direction: a tap during the reveal only completes it, and Enter is held back after an answer (Dee and Sam felt that as R6-11).

- **Owner:** PRA (the choice round), with DS for `answer-button.tsx` and the tunable.
- **Files:** `src/features/rounds/choice/index.tsx` (`commit`, `interactive`, a ref stamped with `systemClock.monotonic()` when `open` changes), `src/config/tunables.ts` (a new `answers.armMs`), `src/ui/answer-button.tsx` (no pressed look, sound or haptic on a tap that won't count), `src/features/practice/results-screen.tsx` (the same guard for Play again and Share after "See your results"), `src/features/rounds/choice/choice-round.test.tsx`, a new `e2e/practice/rite-6.spec.ts`.
- **Fix (recommended, D39 option A):** a pointer answer is ignored for `armMs` after a new question first paints. Marcus's tap came 600 ms after his first, so the window needs to be about 700 ms from the paint; nobody reads a question faster. An ignored tap paints nothing and plays nothing. Keys are left alone: a key answers only with focus in the options group, and round 6's stray-key tests all passed. The results screen ignores taps for the same window after it opens. Make the value a tunable, since Blitz will want it shorter.
- **Fix (the larger option, D39 option B):** stop the two targets sharing a spot, by keeping the options where they are after an answer and opening the explanation as a sheet over them. Priya and Marcus both asked for this (R6-10). It reverses R1-21 and needs the short-phone layout reworked, so it belongs with PRA-1's full practice screen, not a fix lane. Option A is needed either way, because a sheet's button can still sit over an option.
- **Test:**
  - Component, fake clock: answer question 1 and continue. Click option D of question 2 at 300 ms: `onIntent` isn't called, no option has the locked state and `data-stage` is "question". Click it again at 800 ms: `onIntent` is called once with option 3.
  - Component: with focus in the options group, press "d" 100 ms after question 2 opens: `onIntent` is called once. Keys aren't delayed.
  - E2E, 390×844 with touch (the personas' path): open Quick play and answer question 1 with one tap. When "Next question" shows, tap its centre twice, 150 ms apart. Question 2 is on screen, no option is locked and no verdict shows. Repeat into question 3 at 400 ms and into question 4 at 600 ms: the same. Then wait a second and tap option A once: the verdict shows.
  - E2E, the same run: on the last question tap "See your results" twice, 250 ms apart. The results screen shows, the URL is still the results page and no new run has started.
  - E2E, a record of the cause: on question 2, the bounding box of option D and the last known box of "Next question" overlap. If option B is ever taken, flip this to assert they don't.

## 7. P2 fixes worth doing first in M2

No more rounds follow in M1, so nothing is "before round 7". These are the cheap ones that more than one persona met. Each has a check.

- **R6-03, the Share fallback (SHR-1).** `src/features/share/share-button.tsx`: when `copyToClipboard` fails, show a toast and announce the sentence, reuse the existing share-text box where the screen has one, and clear `manual` after a later success. *Test:* in `share-button.test.tsx`, with share and clipboard both failing, the status region holds the sentence and the page has one textbox with the share text; after the clipboard is allowed and Share is pressed again, no `data-share-fallback` remains.
- **R6-15, stale results state (PRA-1).** Key `PracticeResultsScreen` by run id in `src/features/practice/routes/results.tsx`. *Test:* in `results-screen.test.tsx`, open "Why" on run 1, render run 2: no disclosure is open and no fallback box shows.
- **R6-11, Enter in practice (PRA-1).** *Test:* the reveal shows "Enter continues." once a keyboard is in use; Enter pressed 300 ms after a letter answer continues when the sheet opens.
- **R6-14, a cleared choice is spoken (MYS-1).** `src/features/rounds/mystery/options.tsx`. *Test:* in a new `rite-6.test.tsx`, choose C, press "z": the status region holds "Choice cleared."
- **R6-12, clue 4's line (MYS-1), once section 8's wording is accepted.** *Test:* the instruction's text contains "Right pick: 1 point".
- **R6-20, the Encore field (MYS-1).** *Test:* typing "ab300" leaves "300" in the field.

## 8. Changes that need a decision

| # | Doc and section | Proposed change | For |
|---|---|---|---|
| D39 | PRD §3.0.3, DESIGN §10.2 | Option A (recommended): a tap or click on an answer is ignored for about 700 ms after a new question paints, in every mode that uses the choice round; keys aren't delayed; the value is a tunable. Option B: the options stay put after an answer and the explanation opens over them (reverses R1-21), decided with PRA-1's full screen | R6-01, R6-10 |
| D40 | Amends D24 | Clue 4's line becomes "Last clue. Pick one of four. Right pick: 1 point. Wrong pick: 0." | R6-12 |
| D38 | Open since §28 | Sam's case adds to the owner's ruling: three option letters inside two seconds clear a choice. One answer that keeps "Abba" safe is to leave the last choice marked when a word trips, since focus is back on the group and Enter there locks nothing. If the choice is cleared, it is announced either way | R6-14 |
| D34 | Open since round 4 | Build the optional line on the stop screen now. Three personas asked whether their score was good and two filed it as a P1 | R6-05 |
| D33 | Open since round 4 | Unchanged, and raised for the third round | R6-18 |

**Kept as decided** (no doc change): one tap per answer in practice (D30, D36); the typed-word rule's 1.5 s pause (D38); the stopwatch while away (D19); Share secondary and words first in the share text (§22); no visible running total (§22); heading focus on a new Mystery (§22); a different option order for each player.

## 9. Fix and backlog list by area

| Area | P1 | P2 early in M2 | P2 later, or no change |
|---|---|---|---|
| PRA | R6-01 the arm delay on a new question and on results (D39) | R6-11 Enter after an answer · R6-15 results keyed by run | R6-10 the layout jump (D39 option B) · R6-06 the line's weight, if the beta shows mis-taps · R6-15 difficulty breakdown, category choice, where X returns |
| MYS | | R6-12 clue 4's line (D40) · R6-14 "Choice cleared." · R6-20 the Encore field · R6-21 clue 4 at large text | R6-16 keys from a heading, status region · R6-04 the "New" badge, the result heading |
| DS | R6-01 `answer-button.tsx`, the tunable | R6-13 the chosen card | R6-04 sticky bar padding, toasts, chips in rem · R6-10 a bar behind sticky Next · R6-16 tab order |
| DLY | | | R6-07 a line on the Continue card · R6-09 Today's card copy and links · R6-22, R6-23 no change |

**Outside the four areas.** R6-02 is GRP-1, STA-1, SET-1, STK-1 and ARC-1 under D29. R6-05 is DLY-3 and D34, with SHR-1 for the landing. R6-03 and R6-17 are SHR-1, with R6-03 pulled forward. R6-19 is IDN-2. R6-18 waits on D33. R6-08 belongs to CNT-1 and CNT-2.

## 10. The M1 gate

### Verdict: round 6 passes, and M1 exits

PRD §9.3's exit reads: "The last round finds no P0 or P1 confusion and passes the comprehension check (§9.4)." Against round 5's list for round 6:

| # | Round 5 asked round 6 to show | Result |
|---|---|---|
| 1 | Five complete sessions on one build with D36 and D37 decided and the fixes in | Met. No slot empty, no restart |
| 2 | No P0 and no P1 confusion across the five | **Met.** The one P1 is a defect that left no wrong belief (R6-01) |
| 3 | All five answer questions 1 to 3 before any help page | Met, 15 of 15 |
| 4 | Daily first with a lock from clue 4, then Quick play, with the new probe written before the first answer; all five answer as the build behaves | Met, 5 of 5 |
| 5 | Nobody has a practice answer scored on a press meant as a choice; Marcus and Lena on touch-only profiles | Met as written. Four answers were scored on presses meant for another button (R6-01), which this item didn't foresee |
| 6 | Priya's Encore path sends nothing the screen didn't say | Met |
| 7 | The clue-4 probe, 5 of 5; Sam's Tab and Enter; slow keys choose and typed words lock nothing | Met. Dee's slow path was run by Sam |
| 8 | Header at Lock in equals the stop screen; the leave probe and the tie question | Met: 7 runs of 7, and 5 of 5 on each |
| 9 | All five on the same Daily | Met |
| 10 | Each driver in its own profile and process group | Met |
| 11 | Commit, build time, cross-pool check and spread test with test names | Met |
| 12 | Evidence kept and indexed | Met in substance; the index needs its round 6 row |

All twelve are met. Two of them, 5 and 12, are met with a note.

**The call on R6-01.** Round 5 failed the gate on a finding that cost one practice question, because four personas held a belief the game had taught them and acted on it. I said then that the rubric doesn't grade by cost, and that passing it would mean a softer rule for round 5 than for round 4. The same rule applied here gives the other answer. Nobody in round 6 believed anything false. All five wrote the practice rule down before answering and were right, and the two who lost answers to a second tap named the cause on the spot. If I failed this round on R6-01 I'd be using a harder rule than the one that failed round 5: any P1 at all, where the PRD says P1 confusion.

There is a fair objection. A player doesn't care whether the wrong answer on their sheet came from a belief or a stray tap, and item 5 was written to stop surprise answers in practice. I take it seriously, which is why R6-01 stays a P1 and isn't filed with the polish. But a persona round is the tool for finding beliefs, and it has nothing more to say about this fault. It has a cause in the code, a reproduction to the millisecond and a test that fails today. A round 7 would spend five sessions to learn what one Playwright spec proves.

So M1 exits, with one condition written into the exit record: **R6-01's fix and its tests in section 6 land before any other practice work in M2, and D39 is decided first.** If the owner reads the gate as "no P1 of any kind", the remedy is a short round 7 with nothing in it but that fix: the three touch personas double-tap "Next question" and "See your results" at 150, 400 and 600 ms in free play, nobody has an answer scored unread, and questions 1 to 3 and the two written probes hold at five of five.

One limit on this verdict. §9.3's exit also needs the engine's unit tests to cover PRD §4 completely. That is a check of the test suite, not of a playtest, and this report doesn't judge it.

### M1 exit record

**What M1 proved, over six rounds:**

- **The format teaches itself.** Questions 1 to 3 were answered correctly by every persona, before any help page, in rounds 4, 5 and 6: 45 of 45. The ladder, the "points now" label and one pink sentence do the teaching.
- **A wrong guess is understood to cost what Next clue costs.** It is the rubric's own example of a P0, and every persona in round 6 guessed on a first clue without holding back.
- **Clue 4 is safe for every input.** A thumb, a mouse, a keyboard and a screen reader all choose first and lock second, the button names the pick, and in two rounds no Mystery has been lost to a press meant as a choice.
- **The two ways to answer are both labelled and both read.** Ten written predictions in round 6, ten right.
- **The stopwatch is trusted.** Every persona in rounds 5 and 6 knew it ran while they were away, and the header at Lock in has matched the stop screen in every recorded run since round 4.
- **The Encore reads as a tiebreak**, "closest first, then time", five of five for two rounds.
- **Resume holds.** Every reload and every return kept the clue, the wrong guesses and the clock.
- **People would share it.** Five of five in rounds 5 and 6, with no spoiler found in the text. Fun rose from 6.7 to 7.0 on fixture content with no ranking, no streak and three empty tabs.

**What M1 did not prove.** Whether real people behave like the personas; whether anyone returns on day 2, since nothing yet remembers them; and question 4 of the comprehension check, which waits for the percentile and M3's round (§22).

**Exit decisions:**

- **`options_from_clue` stays at 4.** PRD Q3 would move it to 3 if personas stalled on typing. In six rounds nobody did: every persona typed a guess on clue 1 of the first Mystery, and the combobox's two-step (pick, then Guess) was praised. Beta week one re-checks it against the 25% rule.
- **`daily_minutes` stays at 4.** Less the time away, round 6's first Dailies ran from about 1:26 to about 3:45, with a median near 2:20, agent latency and key tests included; round 5's median was about 2:11. "About 4 minutes" is honest with room to spare, and the closed beta's median session sets the real value (PRD §3.1.7).
- **The stopwatch stays visible by default (D8).** With "Take your time. Time only breaks ties." beside it, nobody in round 6 reported hurrying. Hide stopwatch works and persists across a reload (Dee); it needs a spoken confirmation (R6-16) and a home on the Settings page (SET-1).
- **Practice keeps one tap per answer (D36)**, with the arm delay of D39 to come.

**Condition on the exit:** R6-01, as above.

**Backlog by owning ticket, M2 unless marked:**

- **PRA-1:** R6-01 first (the arm delay and its tests). Then Enter after an answer (R6-11), results keyed by run (R6-15), the layout jump and D39's option B (R6-10), a breakdown by difficulty and where X returns (R6-15), the weight of the line if the beta shows mis-taps (R6-06).
- **MYS-1:** clue 4's line (R6-12, D40), "Choice cleared." and D38's ruling (R6-14), the Encore field (R6-20), clue 4 at large text (R6-21), keys from a heading and the status region (R6-16), the "New" badge (R6-04).
- **DS-1:** the chosen card (R6-13), sticky bar padding, a reserved edge for toasts and chips in rem, with D35 (R6-04), a bar behind the sticky Next (R6-10), tab order on phones (R6-16), a paused look for the stopwatch on reveals (R5-08).
- **DLY-1:** Today's card copy and the How to play link (R6-09), a line on the Continue card (R6-07), a sentence on option order (R5-16).
- **DLY-3:** the percentile, and D34's line until it ships (R6-05).
- **GRP-1 (M3), STA-1, SET-1:** the placeholder tabs under D29; today's result on Me; Hide stopwatch on the Settings page (R6-02).
- **STK-1, ARC-1:** yesterday's result and a day count for a returning player (R6-02).
- **IDN-2:** the claim card mounted after an in-app finish, `/me/sync` linked from Me, the "expired" wording, the hand-over tested on a shared backend (R6-19).
- **SQL-5's owner, D33:** honest play against "Take your time", and whether the X counts as hidden (R6-18).
- **RPT-1:** Report a problem, which turns R5-06's sentences back on.
- **CNT-1, CNT-2:** the decoy lint, the prefix check, difficulty that matches the ladder, and reveals read against their answers (R6-08).
- **SHR-1 (M3, with the fallback early in M2):** the clipboard fallback (R6-03); the share text's rows, key and hook line, and a landing that names the friend (R6-17, R6-05).
- **Playtest method, for M3's round:** add round 6's row to the evidence index; give at least one driver a clipboard-blocked context on purpose, and say so; include a double-tap pass on every screen where one button replaces another.

## Appendix A. Comprehension answers, verbatim

**Priya**
1. "4 points. The 4-3-2-1 ladder with 'points now', the line 'Get it from this clue for 4 points', and getting +4 twice taught me that. Three Mysteries, so 12 is the maximum."
2. "One step down the ladder, exactly the same as tapping Next clue: the next clue opens and the Mystery is worth one point less. The exception is clue 4, where you get one pick of four and a wrong pick scores 0."
3. "No points. It only breaks ties: if two players have the same points, the closer number ranks higher, and time only counts after that."

**Dee**
1. "Four points. The 4-3-2-1 ladder was lit on 4, the banner said 'Get it from this clue for 4 points', and my two clue-1 solves read 'Knew it. Solved on clue 1 +4'."
2. "The same as taking Next clue: you drop one rung (my wrong Lighthouse guess took the film from 4 to 3) and the next clue appears. On the last clue it is one pick from four and a wrong one scores 0."
3. "No points. It decides ties: among players level on points, the closer number ranks higher, and only after that does time count."

**Marcus**
1. "4 points. The 4-3-2-1 ladder with 'points now', the line 'Get it from this clue for 4 points', and my own clue-1 solve (Arvenna, +4) all said so."
2. "The same as tapping Next clue: you move on to the next clue and the Mystery is worth one point less (my wrong lighthouse guess took it from 4 to 3). On the last clue you get one pick and a wrong one scores 0."
3. "It gives no points. It decides ties: if two of us have the same points, the closer number ranks higher, and time only counts after that."

**Sam**
1. "4 points. The first clue said 'Get it from this clue for 4 points', the ladder shows 4-3-2-1, and my Cobalt on clue 1 gave +4."
2. "The same as pressing Next clue: the next clue opens and the Mystery is worth one point less (4 to 3 and so on). I saw 'Not The Broken Lighthouse. Clue 2 is in. Now worth 3.' On the last clue it is different: one pick, and a wrong one scores 0."
3. "No points. It decides ties: if two players have the same points, the closer Encore guess ranks higher, and time only counts after that."

**Lena**
1. "4 points. The 4-3-2-1 ladder says 'points now' and I got +4 for Cobalt on clue 1."
2. "The same as tapping Next clue: you drop one step (4 to 3) and the next clue appears. On the last clue it is one pick only and a wrong one scores 0."
3. "Ties. It scores no points; if two people have the same points, the closer number ranks higher, and time only counts after that."

## Appendix B. Evidence

All under `/home/user/playtest-evidence/rite-6/` on the build machine (182 MB, not in git; see `docs/playtests/evidence/README.md`). The build time, commit and the two recorded checks are `build-time.txt`, `commit.txt`, `cross-pool.txt` and `spread-contract.txt` in that folder.

- **Priya:** `notes.md`, `share-daily.txt`, `driver.js`, screenshots 01 to 63. The ghost taps: `31-qp-q2-after-doubletap.png`, `32-qp-q3-400ms.png`. The in-app context and `/me/sync` are in the later screens.
- **Dee:** `notes.txt`, `daemon.js`, screenshots 01 to 54. Clue 4: `12-m1-clue4.png` to `15-m1-result.png`. Key tests: `43-A-b-typed-cartographer.png` to `48-A-reload-A-enter.png`. Option orders: `41-A-clue4.png`, `42-B-clue4.png`.
- **Marcus:** `notes.md`, `driver.js`, screenshots 01 to 74. The ghost taps: `33-qp-doubletap-next.png`, `34-qp-doubletap-600.png`. Share with no clipboard: `27-share-tapped.png`, `28-share-scrolled.png`, `38-qp-share.png`. Stale results: `43-p2-results.png`. Day 2: 50 to 74.
- **Sam:** `transcript.md`, `driver.js`, about 70 screenshots. The typing guard is in the transcript's entries at 21:19 and 21:25 UTC.
- **Lena:** `notes.md`, about 60 screenshots. Clue 4: `08-clue4.png`. Leaving: 13, 14, 16. Share: `26-share-tapped.png`, `27-share-with-clipboard.png`. Practice: `29-quickplay-1.png`, `37-practice-x-midrun.png`.
