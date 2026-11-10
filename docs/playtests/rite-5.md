# RITE round 5: persona playtest of the M1 greybox

**Date:** Tuesday 10 November 2026 · **Build:** production build of the playtest worktree at `f167166` (built 18:17:53 UTC), one server for all five personas, mock backend, fixture set A, real clock, every driver pinned to Europe/London · **Round:** 5 (PRD §9.3, M1) · **Judged by:** the PRD §9.4 rubric · **Previous round:** [rite-4.md](./rite-4.md); its fixes, and D31 to D35 from 02-PRODUCT-DECISIONS §27, are in this build

## The short version

Five persona agents played Daily #51 and all five returned a full report. No slot was missing. Marcus also came back the next day for #52, and Sam and Dee each ran a second #51 in a fresh context.

- **0 P0, 1 P1, 23 P2**, merged from 56 findings in five reports. The personas filed fourteen P1s; two stand, merged into one.
- **R4-01 is fixed.** All five reached clue 4 in the first Daily, wrote down what would lock in the pick before picking, and were right. The three touch players each changed their mind and nothing was sent until Lock in. Nobody lost a Mystery to a press meant as a choice. Priya called the bar that renames itself "Lock in Arvenna" "the best bit of interaction design in the game".
- **R5-01 (P1, confusion): practice answers on one tap, straight after the Daily taught "Tap one, then Lock in".** The cards look the same. On a touch phone the line above them is blank. Four of five (Priya, Marcus, Lena, Dee) expected a second step and had question 1 scored on a press they meant as a choice. Round 4's fix caused it: D31 made the Daily two-step and D32 took the legend off touch, and nothing was put in its place.
- **Comprehension: 15 of 15** on questions 1 to 3, all before any help page.
- **The probes pass**: five of five knew the stopwatch kept running while away, five of five said "the Encore, then time", and the header at Lock in equals the stop screen in every run that recorded both.
- **The M1 gate does not pass.** PRD §9.3 needs a last round with no P0 or P1 confusion, and R5-01 is one. It is a small one: a practice question, no score kept, corrected after one tap. Section 10 says why I still can't grade it away, and what a short round 6 must show.
- **Fun 6.7** (7, 6, 7, 7 and 6.5) and **would share: 5 of 5**, up from 4 of 5. Lena, who wouldn't share in round 4, would now.

## 1. Method

### What changed from round 4

The build carries integrations 8 and 9 on top of round 4's build: D31's choose, then Lock in at clue 4 with the typing rule as amended ("three keys are a word, however slowly"), D32's key legends for keyboards only, the live time on Today's Continue card, a tooltip on the X, "Enter continues." on reveals, "Enter locks in." at the Encore once a keyboard is in use, the toast's new placement, and the copy fixes. Round 4's section 10 asked for these method changes.

| Round 4 asked for | What round 5 did | Result |
|---|---|---|
| Five complete sessions on one build, an empty slot re-run before the synthesis (item 1) | Five reports, none marked missing | Met, with two restarts (see below) |
| Every persona reaches clue 4 in the first Daily and answers "What will lock in your pick?" before the reveal (item 4) | All five did, and wrote the answer before picking | Met, 5 of 5 |
| The three touch personas change their mind once at clue 4 (item 5) | Priya B to D, Marcus Amorra to Arvenna, Lena Copper to Chromium to Cobalt | Met |
| Sam repeats choose, Tab, Enter; Lena repeats a key, then a tap (item 6) | Both ran it in the first Daily | Met: nothing locked. Sam's Enter chose B, which the legend doesn't say (R5-03) |
| Dee repeats tests (c) and (b), adds "Abba" and "Dada", and A then Enter after a reload (item 7) | All run, plus "Add", "Cab", "Dad" and slow keys | Met. The rule that makes it pass has a cost (R5-04) |
| Header at Lock in against the stop screen; the leave probe; the tie question (item 8) | Asked of all five | Met, 5 of 5 on each |
| All five on the same Daily, time zones pinned (item 9) | #51, set A, Europe/London for every driver | Met |
| Commit, build time, and recorded runs of the spread test and the cross-pool check (item 10) | `commit.txt`, `build-time.txt`, `cross-pool.txt`, `spread-contract.txt` | Met. The spread record is the summary line only (20 passed, 28 skipped), with no test names |
| Keep the five slots (item 11) | Kept. Priya reported on the claim offer anyway | Met |
| Evidence beside the E2E reports (item 12) | Evidence is in `/home/user/playtest-evidence/rite-5/` | Not met, for the fifth round |

### Who played

| Persona | §9.3 slot | Device and setup | Daily | Score | Time (header at Lock in = stop screen) | Less the time away | Fun | Would share |
|---|---|---|---|---|---|---|---|---|
| Priya | Daily-ritual player; non-US English | 390×844 touch, clipboard; then a fresh context with an Instagram user agent | #51 | 7/12, Encore 247% off | 4:10, with 2:04 away | about 2:06 | 7 | Yes |
| Dee | Trivia buff | Desktop, keyboard first; fresh contexts for option orders and key tests | #51, twice | 7/12, 189% off | 4:21, with about 2:10 away; second run 1:18 | about 2:11 | 6 | Yes |
| Marcus | Host of an office quiz; non-US English | 390 px touch phone, clipboard, persistent profile | #51, then #52 the next day | 9/12, 178% off; then 2/12 | 3:26, with 2:08 away; then 1:25 | about 1:18 (flattered, see below) | 7 | Yes |
| Sam | Screen-reader user | Desktop 1280×800 at 200% zoom, keyboard only, read from aria snapshots; a second Daily at 390×844 with text at 200% | #51, twice | 9/12, 270% off; then 8/12 | 5:04, with 2:02 away; second run 0:53 | about 3:02 | 7 | Yes |
| Lena | First-time casual player from a friend's link; low-end Android over slow 4G | 360×640, CPU ×4, slow 4G, touch; a second clean touch-only session | #51 | 7/12, 247% off | 4:42, with 2:10 away | about 2:32 | 6.5 | Yes |

**Content.** #51 is fixture set A, as in round 4: a film (Easy, The Lantern Keeper), an element (Medium, cobalt), a fixture country (Hard, Arvenna) and an Encore on the depth of fixture Lake Ostry (86.4 m). The cross-pool run before play reads "79 item(s) indexed, 0 pair(s) at or above 0.5" and "0 Daily item(s) share a fact with a practice or room item (X29)".

**Severity.** As in every round, I re-judged each finding against PRD §9.4, so a persona's own label is shown but doesn't decide it. *Confusion* is a wrong belief about a rule or a score, or an action taken on one; the gate counts it. *Defect* is a fault that confused nobody. A feature that M2 or M3 builds is backlog, whatever label it arrived with.

### Where this round fell short

1. **Two browsers were killed from outside the app.** Marcus's went about 15 seconds into his two minutes away, and his storage with it. He restarted with a persistent profile, so the Daily that counts is his second attempt and he already knew Mystery 1's answer: the 0:02 solve and the 9/12 are flattered. Lena's went after her first wrong guess; she replayed from a fresh first visit. Both suspect another persona's process cleanup. Their rule answers still count, since the rules are the same on a second look, but Marcus's time and score are not a first play.
2. **Lena's main session reported a fine pointer after the restart**, so it showed keyboard legends on a phone profile. She caught it and re-checked every hint finding in a clean touch-only session (screens 72 to 76).
3. **The round's own probe primed the P1.** Every persona was asked to write down what locks in a pick at clue 4, a few minutes before opening practice. That made them more alert to a second step than a real player would be. I weigh this in section 5.
4. **Three findings came out of key tests, not free play**: Priya's Enter at the Encore, Sam's Enter after Tab, and Dee's third key. None cost a point in a first Daily.
5. **Times are agent times**, and every first Daily includes about two minutes away on purpose.
6. **The spread record has no test names**, and the evidence is still not beside the E2E reports.

## 2. Comprehension check

Asked as written after each persona's first Daily. All five answered before opening How to play or How scoring works, and said so. Question 4 is out of M1's check (decisions memo §22). Their words are in Appendix A.

| Question (PRD §9.4) | Expected | Priya | Dee | Marcus | Sam | Lena |
|---|---|---|---|---|---|---|
| 1. What does solving a Mystery on clue 1 earn? | 4 points | Yes | Yes | Yes | Yes | Yes |
| 2. What does a wrong guess cost? | The same as Next clue: the Mystery is then worth one point less | Yes, and one pick on the last clue, a wrong one scores 0 | Yes, same | Yes, same | Yes, same | Yes, same |
| 3. What does the Encore decide? | The tiebreak after points; it scores no points | Yes; time only after that | Yes; time only after that | Yes; time only after that | Yes; time only after that | Yes; time only after that |

**The check passes: 15 of 15**, for the second round running. Dee, Marcus and Sam opened the help pages afterwards and found them in agreement with what they'd said.

## 3. Probes

| Probe | Priya | Dee | Marcus | Sam | Lena |
|---|---|---|---|---|---|
| "While you were away, did your stopwatch keep counting?" | Yes. 1:01 when she left, 124 s away, card 3:05, header 3:11 when back | Yes. 0:35, 130 s away, 2:47. She watched the card tick 0:43, 1:43, 2:45 | Yes. 0:06, 128 s away, 2:15 | Yes. 1:01, 122 s away, card 3:03, header 3:10 | Yes. 0:33, 130 s away, card 2:43, header 2:52 |
| "If two players tie on points, what decides?" | Encore, then time | Encore, then time | Encore, then time | Encore, then time | Encore, then time (faster wins) |
| "What will lock in your pick?" (written before picking) | "Tapping a country just highlights it. Nothing goes until I press the big Lock in bar." Then B, D, Lock in: as predicted | "A letter or a click only chooses, and nothing is sent until I press Enter or the Lock in button." Then D, C, Enter: as predicted | "Tapping an option only highlights it; nothing is final until I press the Lock in bar." Then two taps and the bar: as predicted | "A letter or activating an option only chooses. Nothing is final until I press Enter or use the Lock in button." Letters and the button: as predicted. Enter after Tab chose B and locked nothing | "Tapping an option just highlights it. The grey Lock in button is what sends it." Then three choices and the bar: as predicted |
| Key tests | Guess box: Enter picked, a second Enter guessed. Encore: Enter locked 300 at once, with no hint on her screen | (a) a letter on a heading: nothing. (b) "Cartographer", "The Beekeeper": nothing committed. (c) A then Enter locked A. "Abba", "Dada", "Add", "Dee Abbadabba" then Enter: nothing. After a reload, A then Enter locked A. A third slow key cleared her choice | Guess box: Enter with nothing picked sent nothing. Clue 4: key B moved the choice, a double tap didn't lock. Encore: "abc-1,5" was flagged; on day 2 Enter locked his number | Keys on More and in its menu: nothing. D, then A: chose, nothing sent. A, Tab, Enter: chose B. A then Enter on A: locked A. Practice: digit 2 answered B | Tap A, key b, tap D: Cobalt chosen, nothing sent until Lock in |
| Header at Lock in against the stop screen | 4:10 and 4:10 | 4:21 and 4:21; second run 1:18 and 1:18 | 3:26 and 3:26 | 5:04 and 5:04 | 4:42 and 4:42 |

**What the probes show.** Clue 4 now does what it says for every input: fifteen choices and changes of mind across five personas sent nothing, and five locks sent what the bar named. The clock is honest and reads as honest. Every leave added the time away, every reveal paused it, and the number at Lock in is the number on the stop screen in six runs out of six. The tie order is understood by all five. What the key tests turned up sits around clue 4, not in it: the Encore's Enter on a phone (R5-02), the legend's word for Enter (R5-03) and the third key (R5-04).

## 4. What improved since round 4

### Round 4's P1

| ID | Sev | Round 4 finding | Status | Round 5 evidence | What's left |
|---|---|---|---|---|---|
| R4-01 | P1 (confusion) | Clue 4 teaches one way to lock in and uses another | Fixed | Five written predictions, five correct. Touch: "Tap one, then Lock in." and a greyed bar that becomes "Lock in Arvenna" (Priya, Marcus, Lena). Keyboard: "Keys A to D choose. Enter locks in." (Dee, Sam). Lena's key, then tap moved the choice and sent nothing. No request left before Lock in in any session | The belief it taught now travels to practice (R5-01). Enter after Tab chooses, which the legend doesn't say (R5-03) |

### Round 4's P2s marked "before round 5"

| ID | Finding | Status | Round 5 evidence |
|---|---|---|---|
| R4-03 | Key legends on a touch phone | Fixed for a touch-only phone | Lena's clean session showed no key legend in practice and "Tap one, then Lock in." at clue 4. A hardware key on a phone, or a hybrid pointer, still brings the legends and "Enter continues." for the rest of the session (Marcus, Lena: R5-12), which is D32 as written. Taking the legend off touch left practice with a blank line (R5-01) |
| R4-04 | The Continue card shows no time; the X warns only in its accessible name | Fixed | "Your stopwatch is still running. 1:03", ticking, seen by all five; within a second or two of the header on return. Dee and Sam read the X's label before pressing. The ticking number isn't a live region (Sam) |
| R4-06 | The toast over the heading; "Copied" on the button; the sticky bar | Partly fixed | Share flips to "Copied" and the toast says "Paste it into your group chat" (Marcus, Priya). The toast now sits on the date line, as DESIGN §6.9 accepts; Priya noticed it at the top while "Saved" shows at the bottom. "Saved" covers a line of Today's card at 200% zoom and at 360×640 (Sam, Lena: R5-11) |
| R4-08 | "These results have moved to the archive" | Fixed | Day 2 reads "Results are only kept for today's Daily." (Marcus) |
| R4-11 | Clue 4's keyboard edges | Fixed | (a) "Abba", "Dada", "Add" and "Cab" then Enter lock nothing (Dee). (b) After a reload at clue 4, A then Enter locks A with no Tab (Dee, twice). (c) The same key twice wasn't tried by name; D31 removes it. (d) A choice is announced: "The Beekeeper (1987) chosen. Enter locks it in." (Sam). The rule that fixed (a) refuses a third change of mind by key (R5-04) |
| R4-14 | Enter on a reveal | Fixed | "Enter continues." shows beside the button (Marcus, Sam) and worked from the heading. It does nothing once focus has wrapped to the page body (Sam, in R5-17) |
| R4-15 | Nothing says Enter locks the Encore | Partly fixed | "Enter locks in." shows under the field once a keyboard is in use (Marcus, Lena). On a touch-only phone it doesn't show, and the on-screen keyboard's Enter still locks (Priya: R5-02) |
| R4-17 | The stray space in a suggestion's name | Fixed, as far as round 5 shows | Sam read "The Broken Lighthouse (1972)" and reported no stray space |
| R4-20 | The repeated sentence in How scoring works | Fixed, as far as round 5 shows | Dee read the page closely and didn't report it |

**Totals:** of the nine items, five are fixed, two are fixed as far as round 5 shows, and two are partly fixed (R4-06, R4-15). Round 4's "later" items came up again where nothing was done: the group's focus ring and the dangling "·" (R4-19), the "New" badge after a reload (R4-22), the two modes' keys (R4-13, now R5-01).

### What worked

- **Clue 4.** Nothing was sent early in five first Dailies, and all five could say why beforehand.
- **The rules teach themselves.** Fifteen right answers before any help. The pink line "A wrong guess costs the same as Next clue, so have a go" was quoted by Dee, Marcus and Lena as the thing that taught them.
- **The clock while away.** Said three ways (the X, the toast, the card) and now shown as a live number. Marcus: "I knew it was costing me time, and 'Time only breaks ties' meant I did not much care."
- **Resume.** Every reload kept the clue, the wrong guesses and the clock.
- **Sharing.** The copy worked first time, nobody found an answer in the text, and all five would paste it.
- **Announcements.** Sam: "among the better ones I have used". The wrong-guess message gave him the verdict, the new clue and the stake in one go.

## 5. Ranked findings

Ranked by severity, then by how many personas hit it.

### P0 and P1

| ID | Sev | Kind | Finding | Hit by | Persona labels | Owner | Against the spec |
|---|---|---|---|---|---|---|---|
| R5-01 | P1 | Confusion | Quick play's A to D cards look like clue 4's and answer on one tap. A player who has just finished the Daily has been taught "Tap one, then Lock in". On a touch-only phone the line above the options is an empty strip inside a heavy focus frame; where a legend shows, it reads "Keys A to D answer at once." and says nothing of taps. Priya got question 1 wrong "on a tap I meant as a selection". Marcus tapped A "expecting a Lock in like the Daily". Lena "expected to be able to change my mind and my first tap was scored". Dee, with the key legend on screen, still "lost a question to the instant commit" | 4/5 (Priya, Marcus, Lena, Dee); each had question 1 scored on it | P1 ×2 (Marcus, Lena), P2 ×2 | PRA, with DS; needs a decision | The build matches the decisions. D31 kept "practice keeps one tap and one key per answer" and D32 says a legend is "never on a touch-only phone". The two together leave touch players with a trained habit and no words against it |

**Why this is a confusion, and why P1.** Four personas believed a tap in practice only chooses. The product taught them that, ten minutes earlier, on cards that look the same; three of them name the Daily as the reason. Each acted on the belief and had an answer scored that they hadn't meant to give. That is round 4's R4-01 in a lower key: an input that commits where the player was led to expect otherwise. §9.4 keeps P2 for "friction without a wrong belief", and there is a wrong belief here, held by four of five and acted on by all four.

I considered the other grades.

- **Not a P2, though I looked hard for one.** The case for P2 is real: nothing is at stake in practice, no score is kept, one tap corrects the belief for good, and one tap per answer is what every quiz app does. Priya filed it as a P2 herself ("low stakes"). Round 4 kept R4-14 at P2 on similar grounds. But R4-14 was one persona, and nothing on screen had taught her the belief. This is four personas, taught by the game, in free play. Round 4 graded R4-01 a P1 because the screen taught a belief and players acted on it; the cost decided how bad it was, not whether it counted.
- **Not a P0.** The belief is about how a control works in one mode, not about a rule or a score. All four answered every rule question correctly and finished the run.

Two honest caveats. The round asked each persona to write down what locks in a pick a few minutes before practice, which primed them. And Marcus's and Lena's first practice runs had the key legend showing because of the restarts, so only Priya met the blank line in her main session; Lena and Marcus confirmed it in clean touch sessions afterwards. Neither changes the count of who held the belief.

### P2

| ID | Finding | Hit by | Owner | Fix | When |
|---|---|---|---|---|---|
| R5-07 | Groups, Me and Settings are one-line "on the way" pages and Practice offers only Quick play. Me doesn't show the Daily just finished. The gear opens a page that points back to the Daily's menu. Marcus, the organiser, went looking for Groups first | 5/5 | GRP-1, STA-1, SET-1; DS-1 for the tabs | D29 rules: hide or mark unbuilt tabs before launch. Backlog | M2, M3 |
| R5-08 | Nothing in play says the stopwatch stops on a reveal. The number just freezes (0:48 for Priya, 3:19 for Dee, 3:01 for Lena) and the X's label quietly drops "the stopwatch keeps running". Sam's 5:04 was 5:42 of real time. The X leaves at once, and nothing says a reveal is the safe place to stop | 4/5 (Priya, Dee, Sam, Lena) | DS, DLY | A paused look and "Stopwatch paused" in the button's name on reveals. Nobody held a wrong belief; each worked it out | Early M2 |
| R5-10 | Fixture and practice content. Difficulty labels read upside down: the Hard country fell on clue 1 for Dee, Sam and Lena, and its clue 4 restates clue 1. "li" lists four Lighthouse films and "arv" one country, so the list confirms or denies a guess. Clue 2's year can be read off the suggestion rows. The word "fixture" sits inside sentences, and Learn more searches for a made-up title. On #52, facts from the day before's practice pointed Marcus at two wrong options (Mira Tolland, and Pellin for Pellinor). Quick play's question 1 explains with the answer to question 10. "6. Which is longer?" in the review names neither thing | 4/5 (Priya, Dee, Marcus, Lena) | CNT-1, CNT-2; DLY for fixtures; PRA | Fixtures don't ship. For the real bank: a lint that a practice item's subject isn't a wrong option on a Daily whose clue matches it (the cross-pool check passed and didn't catch this, since it looks for shared facts, not decoys); a check that short prefixes return several plausible rows; both things named in a comparison's review row | Later; the lints before M2's content load |
| R5-11 | Polish. The options group's focus ring is heavy, its text sits flush against the left edge and the sticky bar cuts through it (Priya, Marcus; Lena in practice on load). The Encore result heading wraps to "Your guess 300 m ·". The stop screen's legend wraps with a leading "·". The band chips look like unticked boxes. "Copied" shows at the top and "Saved" at the bottom, and "Saved" covers a line of Today's card at 200% zoom and at 360×640. At 360×640 the "Last clue" badge is half under the header and Next mystery is below the fold on every reveal. Emoji rows wrap mid-row at 200% text | 4/5 (Priya, Marcus, Sam, Lena) | DS-1, MYS-1 | Pad and soften the group ring, and don't draw it on a touch load; break before a separator and keep legend pairs together; one toast position; scroll margin for the badge | Later. The group ring on touch goes with R5-01 |
| R5-02 | The Encore's input. Enter in the field locks the one answer at once. On a touch-only phone nothing says so: no hint shows, the button reads plain "Lock in", and the field's `enterkeyhint` is "done", which Android draws as the key that closes the keyboard. Priya pressed it as a key test and 300 locked. The field also takes letters and flags them afterwards (Priya, Sam, Marcus), and "Numbers only, please." stays in the screen-reader message after the entry is corrected (Dee) | 4/5 on the input; 1/5 on Enter (Priya; Marcus saw it lock on day 2 and didn't mind) | MYS-1 | Section 6 | Before round 6 |
| R5-20 | The guess list. The year is the only thing that separates look-alike titles and it is the quietest thing in the row (Marcus picked the 1993 film); typing a year finds nothing (Priya); the fourth suggestion is cut off at 360×640 (Lena); a seen clue gets its "New" badge again after a reload (Lena, R4-22); the field's description still says "Pick a name from the list" once a pick exists (Sam) | 4/5 (Priya, Marcus, Sam, Lena) | MYS-1 | More weight on the descriptor in the row and in "Your pick"; badge a clue only when it arrives in this view; the pick as the field's description | Later |
| R5-09 | The share text in a chat. Rows are ragged because the category names differ in length, there's no key for the squares, no line inviting a newcomer and no time. A perfect day is almost all white. Today's done card shows a clean grid with no labels | 3/5 (Priya, Dee, Marcus) | SHR-1 (M3) | §22 keeps words first. For M3: squares first or padded labels, a hook line, a one-line key | M3 |
| R5-15 | A returning player sees a first visit: no "yesterday 9/12", no day count, and Me is empty straight after a Daily | 3/5 (Marcus on day 2; Priya, Dee for Me) | STK-1, STA-1, ARC-1 | Backlog. The archive line no longer promises anything | M2 |
| R5-12 | Key hints after one hardware key on a phone. "Enter continues." and "Enter locks in." stayed for the rest of Marcus's session; on Lena's hybrid-pointer session clue 4's line flipped from "Tap one, then Lock in." to the key legend after her first tap | 2/5 (Marcus, Lena) | DS-1 | D32 as written. Pick the wording from the last input used (a touch after a key goes back to the touch line) | Later; the touch-after-key rule goes with R5-01 |
| R5-13 | The stop screen. Share is a small secondary button under a large sticky "Done for today" (Priya); with the stopwatch hidden the score card still prints "Time 1:25" (Marcus); on Today's done card Share is small above a full-width "See results" | 2/5 (Priya, Marcus) | DLY-1, DS-1 | Share's weight is kept (§22). Quieten the time when the stopwatch is hidden; match the two buttons on the card | Later |
| R5-16 | Clue 4's option order differs for every player and nothing says so. Dee saw three orders in three fresh contexts (stable across a reload). Sam pressed A from memory of his desktop run in a new context and chose a different film | 2/5 (Dee, Sam) | DLY-1 | By design (the spread contract, recorded as passing). One sentence in How scoring works: "The four options come in a different order for each player." | Early M2 |
| R5-17 | Keyboard focus. A new Mystery focuses its heading, so a first typed letter goes nowhere (Dee). After Next clue it takes three Tabs to reach Next clue again. In the guess list, retyping after an "Already guessed" row leaves the highlight on row 2. Continue from Today focuses the Mystery heading, not the open clue. Closing How to play returns focus to the clue heading, not the button that opened it. "Enter continues." does nothing once focus wraps to the page body. At 200% zoom the tab bar is last in tab order, after seven footer links | 2/5 (Dee, Sam) | MYS-1, DS-1 | Send printable keys to the guess box from a heading; reset the highlighted row when the text changes; return focus to the invoking control. §22 keeps heading focus on a new Mystery | Later |
| R5-18 | A chosen option at clue 4 is marked by a dark letter chip and a slightly darker border. Once focus leaves it, the card looks like the others; the bar's label is what tells you | 2/5 (Sam, Lena) | DS-1 | A tinted fill or a thick border on the chosen card | Early M2 |
| R5-19 | "Fewer clues, more points. Then one number." on Today. "Then one number" meant nothing to Marcus or Lena until the Encore | 2/5 (Marcus, Lena) | DLY-1 | "Then one number to guess, for tie-breaks." | Later |
| R5-03 | Clue 4's legend says "Keys A to D choose. Enter locks in." With A chosen, Sam tabbed to B and pressed Enter, expecting A to lock. Enter chose B instead ("The Beekeeper (1987) chosen. Enter locks it in."). Nothing was sent. The Accessibility page has it right: "Enter on your chosen answer" | 1/5 (Sam) | MYS-1 | Section 6 | Before round 6 |
| R5-04 | Clue 4's third key. Dee pressed A, waited 2.5 s, B, waited 2.5 s, then D, a third change of mind. The panel flipped to "Typing chooses nothing. Press Esc, then A to D." and cleared her choice. "Dad", "Cab" and "bad" at 250 to 600 ms a key did the same, which is right. The focus ring stayed on an option that wasn't chosen | 1/5 (Dee) | MYS-1; needs a decision | Section 6 | Before round 6, if D38 is accepted |
| R5-05 | Clue 4 at large text. On 390×844 with text at 200% the clue and the two legend lines fill the screen and the sticky bar covers the rest: no option is fully visible on arrival, yet A to D are live. The bar reads "Lock in The Be…". The letter chip doesn't grow with the text. At 200% zoom on desktop the header and the bar take a third of a 400 px viewport. Sam chose blind on his second Daily and lost the Mystery | 1/5 (Sam) | MYS-1, DS-1 | Scroll the first option above the bar on arrival; start the label with the letter ("Lock in A: The Be…") or let it wrap; chip in rem; a compact bar on short viewports | Early M2, with D35 |
| R5-06 | About our questions says "Every reveal and explanation has Report a problem" and that a Mystery guess can be contested. No reveal, result or menu has the control. Dee had two things to report | 1/5 (Dee) | DLY-1 (the page); RPT-1 builds the control | Gate the sentences behind a switch in `shipped.ts`, as R3-06 did for streaks and Groups, until RPT-1 turns them on | Before round 6 |
| R5-14 | The game mentions tie-breaks on every screen and the stop screen ranks nobody. Lena couldn't tell whether 7/12 is good | 1/5 (Lena) | DLY-3 | The percentile is M2. D34's optional line wasn't built | M2 |
| R5-21 | How scoring works: a run with the tab hidden mid-round, or the hardest Mystery solved on clue 1 "after an unusually long look", is quietly left out of the crowd's numbers. The header says "Take your time". Dee left with the X for two minutes and can't tell whether her run counts. The 15-minutes-a-round cap is only on that page | 1/5 (Dee) | SQL-5's owner; PRD §4.3.3 | D33 is open. Add to it: whether leaving with the X counts as "hidden" | M2 |
| R5-22 | The in-app claim offer never shows. In a fresh context with an Instagram user agent Priya got a second identity and replayed #51 for 12/12 in 0:14 | 1/5 (Priya) | IDN-2 | The card exists (`src/features/identity/offers/`); no screen mounts it. Round 4 said it needs no report until M2 does | M2 |
| R5-23 | Practice keys. Digit 2 answered B and no legend or page mentions digits. After a letter answer, Enter is dead for about 1.2 s while focus sits on the disabled button | 1/5 (Sam) | PRA-1 | Name the digits in the Accessibility page, or drop them; accept Enter as soon as the verdict shows | Later |
| R5-24 | With the clipboard blocked, Share says nothing and adds a second box, "Copy this text", above the existing "Your share text" box with the same content | 1/5 (Sam) | SHR-1 | Announce "Couldn't copy. Select the text below." and focus the box that is already there | Later |

**Re-graded.** The personas filed fourteen P1s. Two stand, merged into R5-01 (Marcus's and Lena's). Twelve are P2 here.

- **R5-02 (Priya): the Encore's Enter.** A defect, and the P2 that came closest to a P1. It commits a one-shot answer on a key whose own label says "done". I've kept it a P2 because she pressed it as a key test with no on-screen keyboard to read, the number sent was the number the screen showed back to her ("You're answering 300 m"), the Encore scores no points, and nobody met it in free play. On a real Android phone it will catch people. The fix is small and goes in before round 6, with a test.
- **R5-03 (Sam): Enter after Tab.** A defect in the legend's wording. He expected A to lock and B was chosen, so for one keypress he held a wrong belief about a control. Nothing was sent, the announcement told him what had happened, and the behaviour is D31's on purpose: a screen-reader user who presses Enter on an option means that option. Locking the earlier choice instead, as Sam suggests, would be the dangerous reading. The legend should say what the Accessibility page says.
- **R5-05 (Sam, two P1s): clue 4 at 200% text on a phone.** A defect against release criterion R2. He lost a Mystery, and I looked at whether that makes it a confusion. It doesn't: he pressed A from memory of the order on another device, in a fresh context that is a second identity, and the game never told him the order would match. The chosen card showed its full title directly above the bar (`64-m-clue4-chosen.png`). He calls it his mistake. The layout still let him choose what he couldn't see, so it goes early in M2 with D35.
- **R5-04 (Dee): the third key.** Friction, not confusion. She read the line, pressed Esc and carried on; nothing committed. §27 asked round 5 to judge whether the amended rule "reads well". For the one persona who dithers by keyboard it doesn't, and it is the right trade against a typed word locking in. Section 8 proposes a narrower rule.
- **R5-06 (Dee): Report a problem.** A help page promising what isn't built, the same class as round 3's R3-06, which was a P2. She read the page correctly and went looking. Reporting is M2 (RPT-1); the sentence is the defect.
- **R5-21 (Dee): Honest play.** Round 4's R4-10 again. She read the page right and disagrees with the rule; D33 already owns it.
- **R5-22 (Priya): the claim offer.** IDN-2, M2. She read the situation exactly. Backlog.
- **R5-09 (Priya): the share grid.** SHR-1, M3, and mostly decided in §22. She would share it as it is.
- **R5-07 (Marcus, Lena): empty tabs.** GRP-1, STA-1 and SET-1 under D29. Both read "on the way" correctly. It is the fifth round to say so, and for Marcus and Lena it is what holds the fun score down.
- **R5-14 (Lena): no comparison.** DLY-3, M2. She misread nothing; she had nothing to read. It cost a share in round 4 and didn't in round 5.

## 6. Fixes for the P1, and for the key tests

Each fix names its owning area, the files most likely involved and a check a test can encode. "E2E" means Playwright against the mock backend.

### R5-01 (P1, confusion): practice says how a tap answers

**Hit by** Priya, Marcus, Lena and Dee. Priya's shots: `33-practice-q1.png`, `34-practice-q1-after-tap.png`. Marcus's: `43-quickplay-q1.png`, `44-quickplay-q1-answered.png`, `73-day2-practice-q1.png`. Lena's: `76-s2-practice-touch.png`.

**What the code does.** `src/features/rounds/choice/index.tsx` holds a line above the options (`data-keys-line`) and fills it only when `useKeyLegend()` is true: `legendShown = shortcutsOn && keyboard`. On a touch-only phone the line is reserved and `invisible`, which is the empty strip in Lena's screenshot. The legend's only wording is about keys (`CHOICE_COPY`, "Keys A to D answer at once."). Each question focuses the options group with `focusWithRing`, and the frame drew on Lena's touch load. Clue 4's `options.tsx` has three wordings for the same line (`tap`, `keys`, `typed`); practice has one.

- **Owner:** PRA, with DS for `key-legend.ts` and `focus-ring.ts`. It needs a decision first (D36, section 8), since D32 says no legend on a touch-only phone.
- **Files:** `src/features/rounds/choice/index.tsx` (`legendShown`, the `data-keys-line` paragraph, the group's focus on a new question), `src/features/rounds/choice/copy.ts` (the legend's wordings), `src/ui/key-legend.ts` (already knows whether a key has been pressed), `src/ui/focus-ring.ts` (no ring on a script focus after a pointer), `src/features/daily/how-to-play.ts` and `src/features/legal/documents/accessibility.ts` (one sentence on the difference); tests in `src/features/rounds/choice/choice-round.test.tsx` and a new `e2e/practice/rite-5.spec.ts`.
- **Fix (recommended, D36 option A):** practice keeps one tap and one key per answer, and the reserved line always says so.
  - With no key pressed: "Tap an answer. It counts straight away."
  - Once a key has been used, or on a device where a keyboard is likely: "A tap or a key A to D answers at once." (with D30's shorter ranges for two and three options). This is the line Marcus and Lena had, and it named only keys.
  - The line shows on every question, in the place already held for it, so nothing moves.
  - The group's focus frame isn't drawn when the last input was a touch.
- **Fix (the larger option, D36 option B):** practice takes clue 4's model: choose, then Lock in. One habit everywhere, at the price of ten more taps a run and D30 reversed. I don't recommend it. "Tap one, then Lock in." was read and believed by five of five at clue 4, so a line in the same place should carry the opposite message as well.
- **Test:**
  - Component, `(pointer: coarse)` and no keydown: the options group's visible text contains "Tap an answer. It counts straight away.", the line isn't `invisible`, and the first option's top is where it was with the line empty.
  - Component, after a keydown outside a text field: the line reads "A tap or a key A to D answers at once."; on a two-option item, "A tap or a key A or B answers at once."
  - E2E, 390×844 with touch (the personas' path): play #51 to the stop screen, taking Next clue three times on one Mystery and locking in from the bar. Open Quick play. Before any tap on question 1 the line is visible above option A and the options group has no `data-focus-ring`. Tap A once: the verdict shows (behaviour unchanged).
  - E2E, the same phone on a fresh profile with no Daily played: the same line shows on question 1.

### R5-02 (P2, came close): Enter at the Encore locks only where the screen says so

**Hit by** Priya (`27-encore-typed.png`, `28-encore-after-enter.png`). Marcus saw the same on day 2.

**What the code does.** In `src/features/rounds/encore/index.tsx` the field's `onKeyDown` calls `lockIn()` on any Enter. The hint "Enter locks in." is drawn only when `enterHint = useKeyLegend() && result === null`, and typing in a field never counts as a key press for `useKeyLegend`, so a phone's on-screen keyboard sends Enter with no hint showing. The input has `enterKeyHint="done"`. The button reads "Lock in" whatever the number.

- **Owner:** MYS (the Encore), with a decision (D37).
- **Files:** `src/features/rounds/encore/index.tsx` (`onKeyDown`, `enterHint`, the button's label), `src/features/rounds/encore/copy.ts` (`lockIn`, a named form), `src/features/rounds/encore/encore.test.tsx`, a new `e2e/daily/rite-5.spec.ts`.
- **Fix:** Enter locks in only while "Enter locks in." is on screen. With no hint showing, Enter leaves the field (the keyboard closes) and the answer stays as typed under "You're answering 300 m". The button names the number, as clue 4's names the choice: "Lock in 300 m". `enterKeyHint` stays "done", which is then true. Stop a non-number at the key (the field is already `inputMode` numeric) and clear the screen-reader error once the entry is valid.
- **Test:**
  - Component, no key pressed outside a field and `(pointer: coarse)`: type "300", press Enter. `onSubmit` isn't called, the input no longer has focus, the preview still reads "You're answering 300 m" and the button's name is "Lock in 300 m". Click the button: `onSubmit` is called once with 300.
  - Component, with the key legend showing: type "300", Enter: `onSubmit` is called once (R4-15's test stays).
  - Component: type "3o0", correct it to "300": the status region no longer holds "Numbers only, please."
  - E2E, 390×844 touch on #51: reach the Encore, type 300, press Enter. The URL is still the Daily's and no result heading shows. Tap "Lock in 300 m": the result shows.

### R5-03 and R5-04 (P2, the gate's key tests): clue 4's legend and its third key

**Hit by** Sam (`19-m1-tab-after-choose.png`, `20-m1-after-enter.png`) and Dee (`c04-dithering.png`).

- **Owner:** MYS.
- **Files:** `src/features/rounds/mystery/copy.ts` (`options.legend`, `options.typedLegend`), `src/features/rounds/mystery/options.tsx` (`WORD_KEYS`, `keyCount`, `wordTyped`, where focus rests when a word trips), `src/features/rounds/mystery/rite-4.test.tsx` with a new `rite-5.test.tsx` beside it, `e2e/daily/mystery-rite-4.spec.ts`.
- **What the code does.** Enter on an option that isn't chosen chooses it (D31), and the legend says only "Enter locks in." Every letter or digit since focus came to the options adds to `keyCount`; at `WORD_KEYS = 3` the keys choose nothing until Escape, Tab or a pointer, however long the pauses. Focus stays on the last option a key moved it to.
- **Fix:**
  - The legend reads "Keys A to D choose. Enter on your choice locks in." The behaviour stays: Enter never locks an option other than the one under focus.
  - If D38 is accepted: a key that comes 1.5 s or more after the one before starts the count again. A, a pause, B, a pause, D ends with D chosen. "Abba", "Dad" and "Cab" at any typing pace still trip the rule. When it does trip, focus goes back to the options group, so no option wears a ring that reads as a choice, and the line says what was lost: "Typing chooses nothing, so your choice was cleared. Press Esc, then A to D."
  - If D38 isn't accepted, only the legend and the focus move change.
- **Test:**
  - Component: the keyboard legend's text is "Keys A to D choose. Enter on your choice locks in."
  - Component (Sam's path, already in `rite-4.test.tsx`): "a", Tab, Enter: `onPick` isn't called and B is pressed.
  - Component, fake timers (Dee's path, with D38): "a", 2.5 s, "b", 2.5 s, "d": D has `aria-pressed="true"` and the bar reads "Lock in" with D's label. Enter: `onPick` is called once with D's index.
  - Component: "dad", "cab" and "abba" at 80 ms, 250 ms and 600 ms a key, then Enter: `onPick` isn't called, no option is pressed, and `document.activeElement` is the options group.

### Method fixes

- **Keep the drivers apart.** Two browsers were killed by something outside the app. Give each persona its own user data directory and process group, and never clean up by process name.
- **Record the spread test with its test names** (`--reporter=verbose`), so the record shows which contract ran.
- **Copy the evidence folder beside the E2E reports** as the round's last step. This is the fifth time it hasn't happened.
- **Ask the practice probe before practice, not the clue-4 probe before clue 4 again.** See section 10.

## 7. P2 fixes to land before round 6

Round 4's lesson is that every fix between rounds can teach a new wrong belief. This list is short on purpose.

- **R5-06, the reporting promise (DLY).** In `src/features/legal/documents/about-our-questions.ts` and `content-policy.ts`, gate the "Report a problem" sentences behind a new `REPORTS` switch in `shipped.ts`, false until RPT-1. *Test:* in `trust-pages.test.ts`, with the switch off, neither page's text contains "Report a problem".
- **R5-11, the group's frame on touch (DS).** Part of R5-01's fix. *Test:* in R5-01's E2E.
- **R5-12, a touch after a key (DS).** `src/ui/key-legend.ts` reports the last input kind, so a line that offers two wordings shows the touch one after a touch. Only if it falls out of R5-01's work; otherwise later.

Everything else in section 5 waits for M2 or M3.

## 8. Changes that need a decision

| # | Doc and section | Proposed change | For |
|---|---|---|---|
| D36 | DESIGN §11; amends D32's "never on a touch-only phone" and D30 | Option A (recommended): practice keeps one tap, and the line above its options always says so: "Tap an answer. It counts straight away." on touch, "A tap or a key A to D answers at once." with a keyboard. Option B: practice takes choose, then Lock in | R5-01 |
| D37 | PRD §3.1.5; amends R4-15's fix | At the Encore, Enter locks in only while "Enter locks in." shows. Otherwise it leaves the field. The button names the number | R5-02 |
| D38 | Amends D31's "however slowly" | At clue 4 a key that follows a pause of 1.5 s or more starts the count of typed keys again, so slow changes of mind by key always choose. The legend becomes "Keys A to D choose. Enter on your choice locks in." Cost: "Abba" typed at one key every two seconds, then Enter, would lock A. Nobody types a word that slowly, and integration 9's reason for "at any pace" was a test, not a player | R5-03, R5-04 |
| D33 | Open from round 4 | Add to the proposal: whether leaving with the X counts as a hidden tab, and whether the stop screen tells a player their run is left out | R5-21 |

**Kept as decided** (no doc change): one tap per answer in practice, if D36 option A is taken (D30); Enter on an unchosen option chooses (D31); a different option order for each player (the spread contract); Share stays secondary (§22); words first in the share text (§22); heading focus on a new Mystery (§22); the stopwatch's rule while away and on reveals (D19).

## 9. Fix list by area

| Area | P1 | P2 before round 6 | P2 later |
|---|---|---|---|
| PRA | R5-01 the line above the options says a tap answers (after D36) | | R5-23 digits and the Enter gap · R5-10 the review row, the cross-question leak |
| MYS | | R5-02 the Encore's Enter and its named button (D37) · R5-03 the legend's wording · R5-04 slow keys and focus when a word trips (D38) | R5-05 clue 4 at large text · R5-17 keys from a heading, the list's highlight · R5-20 the year's weight, the "New" badge, the field's description |
| DS | R5-01 no group frame on a touch load; `key-legend.ts` | R5-12 the touch line after a touch, if cheap | R5-08 a paused stopwatch · R5-11 polish · R5-18 the chosen card · R5-05 the chip in rem, a compact bar · R5-17 tab order, focus on return |
| DLY | R5-01 one sentence in How to play | R5-06 the reporting sentences gated | R5-13 the hidden stopwatch's time · R5-16 one sentence on option order · R5-19 "Then one number" |

**Outside the four areas.** R5-07 is GRP-1, STA-1 and SET-1 under D29. R5-14 is DLY-3's percentile. R5-15 is STK-1, STA-1 and ARC-1. R5-22 is IDN-2. R5-09 and R5-24 are SHR-1 in M3. R5-06's control is RPT-1. R5-21 waits on D33. R5-10's lints belong to CNT-1 and CNT-2.

## 10. The M1 gate

### Verdict: round 5 does not pass, so M1 does not exit

PRD §9.3's exit reads: "The last round finds no P0 or P1 confusion and passes the comprehension check (§9.4)." Against round 4's list for round 5:

| # | Round 4 asked round 5 to show | Result |
|---|---|---|
| 1 | Five complete sessions on one build with D31 decided and the fixes in | Met. Two browsers were restarted; Marcus's counted Daily is a second attempt |
| 2 | No P0 and no P1 confusion across the five | **Not met.** R5-01: four personas believed a tap in practice only chooses, and each had an answer scored on it |
| 3 | All five answer questions 1 to 3 before any help page | Met, 15 of 15 |
| 4 | Every persona reaches clue 4 and says what will lock in the pick | Met, 5 of 5 |
| 5 | The three touch personas change their mind at clue 4; nobody loses a Mystery to a press meant as a choice | Met |
| 6 | Sam's and Lena's round 4 paths lock nothing the legend didn't say | Met. Sam's Enter chose where the legend says "locks" (R5-03) |
| 7 | Dee's tests (c) and (b), "Abba", "Dada", and A then Enter after a reload | Met. A third slow key is refused (R5-04) |
| 8 | Header at Lock in equals the stop screen; the leave probe and the tie question | Met: 6 runs of 6, and 5 of 5 on each |
| 9 | All five on the same Daily | Met |
| 10 | Commit, build time, spread test and cross-pool check recorded | Met; the spread record is thin |
| 11 | The five slots kept | Met |
| 12 | Evidence beside the E2E reports | Not met |

Ten of the twelve are met, and the six that round 4 wrote to prove R4-01 gone are all among them. The one that isn't met on the product is the gate's own sentence, again.

I want to be plain about how close this is. R5-01 costs a practice question that counts for nothing, and it corrects itself in one tap. If the grade were mine to set by cost alone it would be a P2 and M1 would exit today. But the rubric doesn't grade by cost. It asks whether a persona held a wrong belief and acted on it, and round 4 failed the gate on exactly that test. Four of five did here, in free play, because of something this build taught them. Passing it would mean applying a softer rule to round 5 than to round 4, in the one round that was meant to be the last. A reviewer re-judging the transcripts would be right to ask why.

The failure is also a sign that the format is settled. For the second round running every rule question was answered right by every persona before any help. The clock is trusted and exact. Clue 4, the only place a press costs points, now works the same for a thumb, a mouse, a keyboard and a screen reader. What's left is that the game has two ways to answer and labels one of them. That is a line of copy and a decision, with the Encore's Enter as the same fault in a second place.

### What round 6 must show

Round 6 can be short. No new features go in before it, only the fixes in sections 6 and 7.

**To pass the gate:**

1. Five complete sessions on one build with D36 and D37 decided and their fixes in. An empty slot is re-run on the same build before the synthesis.
2. No P0 and no P1 confusion under §9.4 across the five.
3. All five answer questions 1 to 3 correctly before any help page.

**To show R5-01 is gone:**

4. Every persona finishes the Daily first, reaching clue 4 on one Mystery and locking in from there, then opens Quick play. Before the first answer each writes down a new probe: "What will happen when you tap (or press) an answer here?" All five answer as the build behaves.
5. Nobody has a practice answer scored on a press they meant as a choice. Marcus and Lena run practice on a touch-only profile with no hardware key pressed anywhere in the session.
6. Priya repeats her Encore path on a touch-only profile: type a number, press the keyboard's Enter. Nothing is sent that the screen didn't say would be.

**To show round 5's passes hold:**

7. The clue-4 probe again, five of five. Sam repeats choose, Tab, Enter and says what the legend told him to expect. Dee changes her mind three times by key with pauses, and repeats "Abba" and "Dada" then Enter: slow keys choose, typed words lock nothing.
8. Header at Lock in equals the stop screen for all five. The leave probe and the tie question: five of five on each.

**Method:**

9. All five play the same Daily, set A or a second fair set, with time zones pinned as now.
10. Each driver runs in its own profile and process group. A session whose browser is killed is re-run from a fresh first visit and marked as such.
11. Record the commit, the build time, the cross-pool check and the spread test with its test names before play.
12. Copy transcripts, answers and screenshots beside the E2E reports at the end of the round.

### What would carry into M2 if round 6 passes

None of this blocks the M1 exit; it is listed so it isn't lost. By owning ticket:

- **GRP-1, STA-1, SET-1:** the placeholder tabs, hidden or marked under D29; Hide stopwatch on the Settings page; today's result on Me (R5-07).
- **DLY-3:** the percentile and a line of context on the stop screen (R5-14, D34).
- **STK-1, ARC-1:** yesterday's result and a day count for a returning player (R5-15).
- **IDN-2:** the claim offer mounted on Today and the stop screen in an in-app browser (R5-22).
- **RPT-1:** Report a problem on reveals and explanations, which turns R5-06's sentences back on.
- **SQL-5's owner, D33:** honest play against "Take your time", and whether the X counts as hidden (R5-21).
- **DS-1:** a paused stopwatch on reveals (R5-08), the chosen card (R5-18), clue 4 and the bar at large text with D35 (R5-05), tab order and focus on return (R5-17), the polish list (R5-11), key hints by last input (R5-12).
- **MYS-1:** the guess list (R5-20), keys from a heading (R5-17).
- **PRA-1:** digits and the Enter gap (R5-23).
- **DLY-1:** the hidden stopwatch's time on the stop screen (R5-13), a sentence on option order (R5-16), "Then one number" (R5-19).
- **CNT-1, CNT-2:** the decoy lint between practice and Daily options, prefix checks on the answer lists, and the review row for comparisons (R5-10).
- **SHR-1 (M3):** the share text's rows, key and hook line (R5-09), and the clipboard fallback (R5-24).

### Decisions for the M1 exit

Unchanged from round 4, and round 5 gives no reason to move them.

- **`options_from_clue` stays at 4.** Nobody stalled on typing in five rounds.
- **`daily_minutes` stays at 4.** Less the time away, first plays ran from about 2:06 to 3:02 (median about 2:11, leaving out Marcus's second attempt), agent latency included.
- **D8 holds:** the stopwatch stays visible. Hide stopwatch works for those who want it gone (Marcus, Lena).

## Appendix A. Comprehension answers, verbatim

**Priya**
1. "4 points. The 4-3-2-1 ladder at the top right has 4 lit as 'points now', and the pink hint under the first clue says 'Get it from this clue for 4 points.'"
2. "The same as tapping Next clue: you move down to the next clue and the Mystery is worth one point less (4 to 3 when I guessed The Silent Lighthouse). On the last clue you get one pick from four and a wrong pick scores 0."
3. "It scores no points and only decides ties: between players on the same points, the closer number ranks higher, and time only counts after that."

**Dee**
1. "4 points. The ladder at the top right reads 4-3-2-1 with 4 lit as 'points now', and the hint under clue 1 says 'Get it from this clue for 4 points'."
2. "Exactly what Next clue costs: the next clue opens and the Mystery is worth one point less (4 to 3 when I guessed The Last Keeper). No extra penalty. The exception is the last clue: one pick from four, and a wrong pick scores 0."
3. "It scores no points. It decides ties: if two of us are level on points, the closer number ranks higher, and time only counts after that."

**Marcus**
1. "4 points. The ladder is 4-3-2-1 by the clue you solve on, so three Mysteries make 12 at most."
2. "The same as tapping Next clue: you drop one rung, so the Mystery is worth one point less and the next clue opens. The exception is the last clue's four options, where you get one pick and a wrong one scores 0."
3. "No points. It only decides ties: if two of us are level on points, whoever's number is closer ranks higher, and time only counts after that."

**Sam**
1. "4 points, the top of the 4-3-2-1 ladder, so 12 is a perfect day."
2. "The same as pressing Next clue: the Mystery drops one point and the next clue opens. On the last clue you get one pick from four and a wrong one scores 0."
3. "It scores no points. It breaks ties: on equal points the closer Encore number ranks higher, and time only counts after that."

**Lena**
1. "4 points. The ladder at the top goes 4-3-2-1, the first clue says 'Get it from this clue for 4 points', and I got +4 for Arvenna on clue 1."
2. "One step down the ladder, the same as pressing Next clue: the next clue opens and the Mystery is worth one point less. On the last clue (pick one of four) a wrong pick scores 0."
3. "It gives no points. It breaks ties: if two players have the same points, the closer number ranks higher, and time only counts after that."

## Appendix B. Evidence

All under `/home/user/playtest-evidence/rite-5/`. The build time, commit and the two recorded checks are `build-time.txt`, `commit.txt`, `cross-pool.txt` and `spread-contract.txt` in that folder.

- **Priya:** `notes.md`, `driver.js`, screenshots 01 to 55. Clue 4: `22-m3-clue4-options.png`. The Encore's Enter: `27-encore-typed.png`, `28-encore-after-enter.png`. Stop screen and share: 29, 30. Practice: 33, 34. The in-app context: 49 to 55.
- **Dee:** `notes.md`, `driver.js`, step scripts `b01.js` to `b09.js`, `c01.js` on, `30-footer-pages.json`. The third key: `c04-dithering.png`. The guess list's highlight: `c01-D-retyped-arrow.png`.
- **Marcus:** `notes.md`, `driver.js`, screenshots over two days. Clue 4: `32-B-m3-clue4-options.png`. Stop screen and share: `40-B-stop-screen.png`, `41-B-share-tapped.png`. Practice: 43, 44, 73. Day 2: 52 to 73.
- **Sam:** `notes.md`, `driver.js`, numbered screenshots. Enter after Tab: `19-m1-tab-after-choose.png`, `20-m1-after-enter.png`. Clue 4 on a phone at 200% text: `63-m-clue4.png`, `64-m-clue4-chosen.png`, `65-m-reveal.png`.
- **Lena:** `transcript.md`, `driver.js`, screenshots 01 to 76. The aborted attempt: 01 to 06. Clue 4: 25 to 29. Stop screen: 43, 44. Practice: 48 to 50. The clean touch-only session: 72 to 76, with the blank line and the frame at `76-s2-practice-touch.png`.
