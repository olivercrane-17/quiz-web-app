# RITE round 1: persona playtest of the M1 greybox

**Date:** Wednesday 4 November 2026 · **Build:** production build of the playtest worktree at `091dfa3`, mock backend, fixture content · **Round:** 1 of at least 3 (PRD §9.3, M1) · **Judged by:** the PRD §9.4 rubric

## The short version

Five persona agents played the greybox Daily and a Quick Play run, then went looking for everything else. The clue ladder works. Every persona named it as the best part, and the Mystery 1 decoys gave Dee and Sam the best moment of their session. A reload never lost a clue. Almost everything around the ladder let them down.

- **3 P0, 12 P1, 25 P2**, merged from 82 findings across the five sessions.
- **The M1 gate fails**, as expected for a first round. Apart from the P0s and P1s, the comprehension check wasn't run as a scripted step, and its fourth question can't be asked on this build because there is no percentile yet.
- **Nobody would share (0 of 5).** There is no Share or Copy button anywhere, and the grid paints a skipped clue as red as a wrong guess.
- **Most links are dead.** Three of the four tabs, Settings, Past 7 days and all seven footer links open the framework's bare 404, with no way back but the browser.
- **The rules bite before anyone explains them.** The build has none of M1's first-Daily hints and no How to play sheet, so the personas met the rules cold: what a wrong guess costs, what the stopwatch is for, what the Encore decides and that clue 4 allows one pick.
- **Fun averaged 6.3** (range 6 to 7). Priya and Lena said they'd come back for the ladder; Marcus would if sharing and Groups worked.

## 1. Method

**Setup.** Each persona agent served its own copy of the same production build (ports 3121 to 3124, and 3170 for Priya because 3120 was taken) and played in a fresh Playwright Chromium context, thinking aloud. Each one started the Daily from Today and played it to the end, reloaded on purpose in the middle of a Mystery, read the stop screen, played a ten-question Quick Play run, then tried every link it could find. Screenshots, driver scripts and logs are in `/tmp/pt-priya/`, `/tmp/pt-dee/`, `/tmp/pt-marcus/`, `/tmp/pt-sam/` and `/tmp/pt-lena/`.

**Who played.**

| Persona | §9.3 slot | Device and setup | Daily | Score | Quick Play | Fun | Would share |
|---|---|---|---|---|---|---|---|
| Priya | Daily-ritual player (PRD §2.1); non-US English | 390×844 touch, en-GB; a keyboard emulated by cutting the viewport to 505 px tall | #45 | 5/12, Encore 39% off | 7/10 | 7 | No |
| Dee | Trivia buff | Desktop with keyboard and mouse, 1280 px wide, en-CA | #45 | 6/12, Encore 178% off | 7/10 | 6.5 | No |
| Marcus | Host of an office quiz; non-US English | Android-sized mobile Chromium, en-IN, Clipboard API but no Web Share | #45 | 4/12, Encore 247% off | 7/10 | 6 | No |
| Sam | Screen-reader user | Desktop 1280×800 at 200% zoom, keyboard only, read through the accessibility tree and a live-region log; phone check at 390×844 with 200% text | #45 | 5/12, Encore 39% off | 7/10 | 6 | No |
| Lena | First-time casual player, arriving from a friend's link; non-US English | 360×640 Android in-app browser (no Web Share), Melbourne time, so her Daily was already #46 | #46 | 6/12, Encore 13% off (Close) | 8/10 | 6 | No |

**Content.** The mock backend serves fixture Dailies from `content/fixtures/`: invented facts set in the "fixture realm of Arvenna", except the element Mysteries, which use real chemistry. Daily #45 was a film (Easy), an element (cobalt, Medium), a country (Arvenna, Hard) and an Encore on the depth of fixture Lake Ostry (86.4 m, one decimal allowed). Daily #46 was a person (Easy), a country (Medium), an element (bismuth, Hard) and an Encore on the steps of the fixture Harbour Tower (212).

**Severity.** I re-judged every finding against PRD §9.4, so a persona's own label is shown but doesn't decide it.

- **P0:** a Must flow couldn't be finished, or a persona acted on a wrong belief about a rule.
- **P1:** a persona needed more than one try at a step, or misread a score, a rule or the page they were on.
- **P2:** friction without a wrong belief, however annoying.

Reports with the same root cause and the same fix are one finding. "Hit by" counts every persona who met it, including ones who only describe it in their think-aloud. M1 asks for no visual polish, so pure styling P2s wait for DS-1 and M5 unless they confuse someone. Groups, challenges, the percentile, the archive, the preview image and the PWA belong to later milestones or parallel lanes; they appear here only where this build links to them or promises them.

**Where this round fell short of §9.3 and §9.4.**

1. The four-question comprehension check wasn't run as a scripted step. Section 3 infers answers from the think-alouds, which is not a pass.
2. Question 4 ("so far today") can't be asked: the greybox stop screen has no percentile.
3. No usable timing. The stopwatch reset on every deliberate reload (R1-06), and agents don't pace like people. The only whole figure is Lena's 5:33 of active time (2:36, then 2:57 after the reset). `daily_minutes` stays at 4.
4. No low-end Android over slow 4G this round. Lena's 360×640 in-app browser covered the screen, not the network or the CPU.
5. The share link in the text pointed at port 3120 for everyone, because `NEXT_PUBLIC_SITE_URL` is fixed at build time and the personas served copies on other ports. That is a harness artifact, not a product bug (R1-18).
6. Fixture difficulty doesn't match its labels. #45's Hard Mystery is an invented country that no clue lets you deduce, so all four personas who played #45 missed it. Its "Easy" Mystery 1 averaged 1.75 points against the 3.0 to 3.6 target (PRD §4.1.6), because its first clue describes invented facts and its second sets the decoy trap. Scores and fun ratings on #45 are lower than real content would give.
7. Transcripts and screenshots are still in `/tmp`. §9.4 wants them stored beside the E2E reports.

## 2. What worked

- **One tap to clue 1.** No sign-up, cookie wall, tutorial or ad between Today and the first clue (Priya, Marcus, Lena). AC-DLY-01 holds.
- **The worth scale teaches the points by itself.** "Next clue · then worth 3" told people the price before they paid it, and all five could say what a clue-1 solve earns. Lena: "Got it without being told."
- **The ladder produces real deduction.** Four "…Lighthouse" decoys on clue 2, then a 1988 prize on clue 3 that only The Lantern Keeper (1987) fits. Dee and Sam called it the best moment of their session, and Priya called the decoys "genuinely fun". Keep this style of decoy.
- **The small touches landed.** The tilted "Not The Broken Lighthouse" stamp, "Already guessed" in the list, "Not needed" on unused clues and "This one got away." on a miss (Priya, Marcus, Sam, Lena).
- **Resume is solid.** Every reload came back on the same clue with the same stamps and points (5 of 5), and Leave then Continue worked (Dee, Lena). Only the clock broke (R1-06).
- **The combobox is accessible.** Match counts are announced, the first Escape closes the list and the second clears it, already-guessed rows are disabled and labelled, and a pick is confirmed aloud. Sam: "like a proper combobox." Aluminum and sulphur matched their entries (Dee).
- **The Encore input.** Numeric keypad, "You're answering 120 m", Enter to lock in, and a number line with a text equivalent (Priya, Sam, Lena).
- **The share text itself.** No spoilers, and "No answers inside." reassured four of them. Priya preferred the label-free mini grid on the Today card to the stop screen's labelled rows.
- **Quick Play.** Answers in thumb reach, no clock, no auto-advance and short explanations people actually read (all five). The fixture world's details recur between the Daily and Practice, and people enjoyed spotting them: Dee's Q2 gave her Q10, and Lena recognised the smoked eel from her Daily.
- **Accessibility basics.** axe-core found no WCAG A or AA violations on the play, Encore and results screens, and forced colours looked excellent. Practice verdicts were announced exactly: "Not quite. You chose A treadmill. The answer is A water wheel."
- **The strategy came out as intended.** Dee and Marcus worked out that a wrong guess costs the same as Next clue, so you should always have a go. PRD §3.1.4 wants exactly that conclusion, so the rule stays. The missing hint (R1-04) should just say it before the first miss.

## 3. Comprehension check (inferred, not a pass)

| Question (PRD §9.4) | Expected | Priya | Dee | Marcus | Sam | Lena |
|---|---|---|---|---|---|---|
| 1. What does a clue-1 solve earn? | 4 points | Yes | Yes | Yes | Yes | Yes |
| 2. What does a wrong guess cost? | The same as Next clue | Yes, after her first miss | Yes | Yes | Yes, after his first miss | Yes |
| 3. What does the Encore decide? | The tiebreak after points; no points | Yes, but "a tiebreak against whom?" | Yes, same question | Yes, same question | **No**: unsure whether it counts toward 5/12 | Yes, same question |
| 4. What does "so far today" mean? | The percentile counts only players who have finished so far | Can't be asked: no percentile in this build | | | | |

Priya and Sam guessed before they knew a miss costs a clue (Priya "gambled without knowing the price"; Sam "would have searched more"). Nobody lost points by it, because a guess never scores less than Next clue, so R1-04 is a P1, not a P0. Sam's answer to question 3 counts as a P1 misread (R1-07).

## 4. Ranked findings

Ranked by severity, then by how many personas hit it.

### P0 and P1

| ID | Sev | Finding | Hit by | Persona labels | Owner | Against the spec |
|---|---|---|---|---|---|---|
| R1-01 | P0 | No Share or Copy button on the stop screen or the finished Today card | 5/5 | P0 ×5 | FIX-DLY | Missing: PRD §3.5.2 (the SHR-1 stub renders nothing) |
| R1-02 | P0 | The Practice, Groups and Me tabs, Settings, Past 7 days and all seven footer links open the bare framework 404, which has no header or tab bar and no way back | 5/5 | P0 ×5; Priya also P1 for the trust pages | DS-1, with FIX-PRA and FIX-DLY | Missing: DESIGN §12.42; the routes themselves are M2 and M3 |
| R1-03 | P0 | On a phone at 200% text the guess field hides what you type and the suggestions truncate to "The L… 1987" | 1/5 (Sam) | P0 | FIX-MYS, with FIX-DLY and DS-1 | Bug: DESIGN §10.5; release criterion R2 |
| R1-04 | P1 | Nothing says a wrong guess costs a clue until it happens | 4/5 (Priya, Dee, Marcus, Sam) | P1 ×3, P2 | FIX-MYS, FIX-DLY | Missing M1 scope: the first-Daily hint (PRD §3.1.4) and How to play (§3.1.3) |
| R1-05 | P1 | The stopwatch ticks with no word on whether time counts, and it hurried all five | 5/5 | P1 ×5 | FIX-DLY | Missing M1 scope: "Time only breaks ties." and Hide stopwatch (PRD §3.1.3) |
| R1-06 | P1 | The stopwatch resets to 0:00 on reload | 5/5 | P1 ×5 | FIX-DLY | Bug: AC-DLY-07, AC-DLY-12 |
| R1-07 | P1 | "Closest guess wins the tiebreak": nobody could say against whom, and Sam couldn't say whether it counts | 5/5 | P1 ×3, P2 ×2 | FIX-MYS, FIX-DLY | Copy gap: PRD §3.1.5, DESIGN §1.4 (D2) |
| R1-08 | P1 | The header pills look like buttons, and a solved pill's bare "2" reads as a clue or Mystery number | 4/5 (Priya, Dee, Marcus, Lena) | P2 ×4, upgraded because two misread a score | FIX-DLY, DS-1 | Bug: DESIGN §6.6 shows a check |
| R1-09 | P1 | Screen-reader text from the previous page: the route announcer reads the old page, and old status messages and a second `main#main` stay in the DOM | 4/5 (Priya, Dee, Marcus, Sam) | P1 (Sam), P2 ×3 | DS-1 | Bug: DESIGN §11 |
| R1-10 | P1 | The Encore rejects "1,200" with "Up to 1 decimal place, please." | 3/5 (Dee, Marcus, Sam) | P1 ×3 | FIX-MYS | The spec as written: PRD §4.2.1 (D1) |
| R1-11 | P1 | Suggestions open below the fold whenever no keyboard is detected, as at 200% zoom or in a short window | 3/5 (Priya, Sam, Lena) | P1 ×2, P2 | FIX-MYS | Gap: PRD §3.1.4 budgets only the keyboard case |
| R1-12 | P1 | At 200% zoom the sticky header and the tab bar hide what has focus: Play behind the tab bar, each practice question's first line under the header | 1/5 (Sam) | P1 ×2, P2 | DS-1, FIX-PRA | Bug: DESIGN §10.2 |
| R1-13 | P1 | Practice keys 1 to 4 pick by position, so "4" for "four bridges" locked in option D (15); the A to D badges look like keys but do nothing | 1/5 (Dee) | P1 | FIX-PRA, FIX-MYS | The spec as written: PRD §3.0.3 (D6) |
| R1-14 | P1 | Practice feedback grabs focus a second after an answer, so Enter on Leave skipped a question instead, twice | 1/5 (Sam) | P1 | FIX-PRA | Bug: DESIGN §11 focus rules |
| R1-15 | P1 | "Works offline." on the Practice card isn't true yet: there is no service worker, so a cold open offline fails | 1/5 (Priya) | P1 | FIX-PRA | Ahead of PWA-0 (parallel lane) |

### P2

| ID | Finding | Hit by | Owner | Suggested fix |
|---|---|---|---|---|
| R1-16 | Red marks both a wrong guess and Next clue, so the grid reads as failure ("6/12 with six red squares is not something I would post") | 5/5 | Design decision, then FIX-DLY | D3 |
| R1-17 | Practice results rows read "Question 6 · Not quite · Answer: 4" with no question and no pick; the rows wrap raggedly and Play again sits below the fold | 5/5 | FIX-PRA | A short stem and "You chose X" in each row; Play again above the list or sticky (D13) |
| R1-18 | The share link's host isn't where they played | 5/5 noticed | FIX-DLY, the harness | A unit test that the link is `getSiteUrl()` plus a path; build per port in round 2 |
| R1-19 | "Encore 39% off" reads like a sale | 4/5 (Priya, Dee, Marcus, Lena) | FIX-DLY after D4 | "Encore off by 39%" |
| R1-20 | Every tab and bookmark says "Quiz Web App" over the scaffold's description, and a link preview wouldn't say Knewt either | 4/5 (Priya, Dee, Marcus, Sam) | DS-1 | Brand the title template and description in `src/app/layout.tsx`; titles like "Daily No. 45 · Knewt" (DESIGN §11) |
| R1-21 | Practice: answering scrolls the question off the top and leaves a blank band under the header ("like the page broke") | 3/5 (Priya, Marcus, Lena) | FIX-PRA | Collapse the thumb-zone spacer once an answer locks, so the sheet takes its room without a scroll (PRD §3.0.3: nothing shifts). Do it in this wave |
| R1-22 | "Knew it." after wrong guesses feels unearned | 3/5 (Priya, Dee, Lena) | FIX-MYS after D10 | |
| R1-23 | Next clue wipes what you were typing | 3/5 (Priya, Marcus, Lena) | FIX-MYS after D9 | |
| R1-24 | The placeholder is cut to "Start typing a chemic…" | 3/5 (Priya, Marcus, Lena) | FIX-MYS after D14 | A short noun per answer type |
| R1-25 | Practice copy and content: "It's The Glaziers' Guild." and "It's Eels." mid-sentence, and "300 BC" beside a bare "45" | 3/5 (Priya, Dee, Marcus) | FIX-PRA, content | Lowercase a leading "The" inside a sentence in `src/features/rounds/choice/copy.ts`; mark the era on every option when one option has BC |
| R1-26 | Encore result: a 240 m or 300 m guess sits at the 172.8 m end with no value beside it; no "You" or "Answer" labels; no verdict outside the bands; the "Close" chip reads as a close button | 4/5 (Priya, Dee, Marcus, Lena) | FIX-MYS | Label off-scale marks ("300 m →") and both marks in `number-line.tsx`; D16 for the chip |
| R1-27 | More false affordances: the category chip, the worth scale, the stopwatch pill, the Encore ruler ticks, Today's round chips, the practice progress squares | 3/5 (Priya, Marcus, Lena) | DS-1 | Flat styles for anything that isn't a control; "points now" under the active value in `stake.tsx` (FIX-MYS) |
| R1-28 | A picked title scrolls to its end ("ı Lighthouse (1972)"), hiding the one word that tells the decoys apart | 2/5 (Priya, Marcus) | FIX-MYS | Show the pick in full under the field instead of `scrollLeft = scrollWidth` in `combobox.tsx`. Do it in this wave |
| R1-29 | Enter or Go does nothing with one match left, and tapping the greyed Guess says nothing visible | 2/5 (Marcus, Lena) | FIX-MYS after D5 | Show "Pick a name from the list, then Guess." when Guess is pressed with no pick (the string exists, screen-reader only today) |
| R1-30 | Fixture Mysteries: #45's Hard country can't be deduced, Mystery 1's clue 4 repeats clue 2, and #46's first two bismuth clues fit antimony just as well | 2/5 filed (Dee, Lena); all four #45 players missed Mystery 3 | FIX-DLY (fixtures), content | Rewrite `fx.m.geo.0101`, `fx.m.film.0101` and `fx.m.sci.0102` in `content/fixtures/mysteries/`; ask the content lint to flag a rival that fits clues 1 and 2 together |
| R1-31 | The explanation is cut to one line behind "Read more" at 360×640 and at 200% zoom | 2/5 (Sam, Lena) | FIX-PRA after D12 | |
| R1-32 | Keyboard: focus starts on the heading, the first Tab lands on Next clue (which costs a point), and "/" doesn't reach the field | 1/5 (Dee) | FIX-MYS after D15 | |
| R1-33 | Mystery layout polish: the stamp overlaps the clue above it; a square focus outline inside the rounded clue-4 card; "Mystery 2 of 3 ·" wraps with an orphaned dot; the category chip moves between Mysteries; options C and D below the fold at 360×640; "+0" before the count-up; the compact "Last clue" button drops "then worth 1" | 2/5 (Marcus, Lena) | FIX-MYS | The compact label breaks AC-DLY-29's wording, so fix that one in this wave |
| R1-34 | Keyboard and screen-reader polish: "tap Next clue" on a desktop; stray spaces in names ("Right . It's Red quince."); two `h1`s on the Daily; results focus lands on `body`; the Encore preview is announced on every keystroke; earlier clues drop to 15 px grey; the guess box's focus ring barely shows; `summary` rows use the browser's 1 px ring; at 200% text the `h1` is smaller than the `h2`s and the tab labels run together | 1/5 (Sam) | FIX-MYS, FIX-PRA, FIX-DLY, DS-1 | Debounce the preview by about 600 ms (FIX-MYS); trim the split headings (FIX-PRA); one `h1` per route and focus on the results heading (FIX-DLY); D17 for "tap" |
| R1-35 | Today: opens about 34 px scrolled when you come back; the date shows twice; a 720 px column hugs the left edge at 1280 px; "Good evening." at 00:32; nothing tells a newcomer what Knewt is | 4/5 (Priya, Dee, Marcus, Lena) | DS-1, FIX-DLY | Scroll to the top on arrival (DS-1); D18 for the copy |
| R1-36 | Practice run polish: Play again repeated a question just answered; Quick play silently resumed an old run at its question 3; the "Correct answer" pill squeezes option text to two or three lines; the progress row has no right gutter; the sheet's grab handle doesn't drag | 3/5 (Dee, Marcus, Sam) | FIX-PRA, DS-1 | Keep the last run's items out of the next; label the button "Continue practice · 3 of 10" while a run is open; put the pill under the text |
| R1-37 | Suggestions: element symbols don't match (Fe finds only Fermium; Au and Pb find nothing), and typo matches ("Halvessa Nights" for "light") sit unmarked among real ones | 2/5 (Priya, Dee) | FIX-MYS, content | Symbols as element aliases in the answer lists; rank typo rows last and mark them |
| R1-38 | "Your progress is saved" lives only in the X's accessible name; Learn more opens a new tab with no external-link icon | 1/5 (Lena) | FIX-DLY, FIX-MYS | The "Saved" toast DESIGN §6.9 already lists, on Leave; an external-link icon |
| R1-39 | No running total during play, and "?" opens no shortcut sheet | 1/5 (Dee) | Ideas | D11 covers the total; the sheet can wait |
| R1-40 | Option buttons may read their letter twice ("A A. Arvenna") | 1/5 (Priya), unconfirmed | DS-1 | The badge is `aria-hidden` in `src/ui/answer-button.tsx`, so check the accessibility tree before changing anything |

**Re-graded.** These carried a persona's P1 and are P2 here. R1-16 and R1-19 (Priya, Lena): nobody misread their own grid; they predicted their friends would, which is a design call. R1-21, R1-23, R1-26 and R1-28 (parts of Priya's, Dee's and Marcus's P1s): real defects that left no wrong belief about a rule or a score. R1-29 (Marcus): two taps where he wanted one. R1-30 (Lena): a flaw in fixture content, not confusion about the game. R1-32 (Dee): she spotted the Tab trap and stepped around it. R1-18 and R1-20 (Marcus, Lena, Sam): a harness artifact and the scaffold's title; the screen-reader half of Sam's report is R1-09. One went the other way: R1-08 (four P2s) is a P1, because two personas misread a score.

## 5. Fixes for every P0 and P1

Each fix names its owner, the files most likely involved and a check a test can encode. "E2E" means Playwright against the mock backend.

### R1-01 (P0): No way to share the result

**Hit by** all five, all P0. Priya and Marcus would have to long-press and drag across five lines of emoji, and Dee and Lena found that a triple-click selects only one line. Sam couldn't select the `<pre>` from the keyboard at all. His fallback, Ctrl+A then Ctrl+C, copied the whole page with every answer in it, which would spoil the Daily for the chat he pasted it into. Posting is the reason Priya plays daily games. Lena also found no Share on the practice results (PRD §3.5.4).

- **Owner:** FIX-DLY.
- **Files:** `src/features/share/share-button.tsx` (the extension point; it returns `null` until SHR-1), `src/features/daily/stop-screen/stop-screen.tsx` (mounts it under `pre[data-share-text]`), `src/features/daily/home-card.tsx` (already mounts it with `surface="home"`), `src/features/daily/share.ts`.
- **Fix:** Build the greybox path now and leave the mini grid to SHR-1. Use `navigator.share({ text })` where it exists; otherwise `navigator.clipboard.writeText(text)`, then "Copied. Paste it into your group chat." in the status region and as a toast; if both fail, a read-only text box with the text selected and "Copy this text" (PRD §3.5.2). Turn the share box into a focusable read-only `textarea`, so a keyboard user can select just the share. Log `share_open`, `share_complete` and `share_cancel`. Once the button exists, FIX-PRA can mount it on the practice results with PRD §3.5.4's text (P2).
- **Test:**
  - E2E with `navigator.share` removed and clipboard permission granted: finish Daily #45 and press Share on `/daily/45/results`. The clipboard equals the text of `[data-share-text]`, the status region contains "Copied.", and one `share_complete` with method `clipboard` is logged (AC-SHR-05).
  - With `navigator.share` stubbed to resolve, one `share_complete`; stubbed to reject with `AbortError`, one `share_cancel` and no `share_complete` (AC-SHR-04).
  - Back on `/`, the Done for today card has the same button and copies the same text (AC-SHR-11).
  - Keyboard only: Tab reaches Share and Enter copies.

### R1-02 (P0): Dead links end on a bare 404

**Hit by** all five, all P0. Twelve of the 15 or so links on Today reach Next's default "404 This page could not be found.": `/practice`, `/g`, `/me`, `/settings`, `/archive` and the seven trust pages. That page has no header or tabs and nothing to focus, so Tab goes nowhere and Back is the only exit; an installed app wouldn't even have Back. Lena tapped the Practice tab to play more and would have closed the app there. Marcus came for Groups. All five went looking for "How scoring works", the one page that would have answered R1-04, R1-05 and R1-07. Priya noticed the app quietly creates an identity in her browser while Privacy is a 404.

- **Owner:** DS-1 (notes, since the shell is being rebuilt), with two small pieces for feature lanes.
- **Files:** `src/app/not-found.tsx` (missing, so Next renders its own page), `src/features/shell/tabs.ts`, `src/features/shell/footer.tsx`, `src/features/shell/app-header.tsx` (the Settings gear), `src/features/shell/page-placeholder.tsx` (it already says "This part of Knewt isn't ready yet." with "Go to Today"), `src/features/daily/home-card.tsx` (Past 7 days).
- **Fix:**
  - DS-1: a not-found page inside the app shell with DESIGN §12.42's copy ("We couldn't find that page.", "Even the newt can't find it.", Go to Today, Practice) that keeps the tab bar. Then every link the shell draws either resolves or is hidden: stub route modules rendering `PagePlaceholder` inside the right layout for `/g`, `/me`, `/settings` and six of the trust pages, and `/how-scoring-works` showing the How to play text from R1-04.
  - FIX-PRA: a greybox `/practice` holding the Quick play card, so the Practice tab works before PRA-2 builds the hub.
  - FIX-DLY: hide Past 7 days until `/archive` exists, and own the How to play text that `/how-scoring-works` reuses.
- **Test:** E2E: for every `a[href]` on `/` (tabs, gear, footer, the Daily card), the page it opens has an `h1`, the Main navigation landmark and a link named "Go to Today", and never the text "This page could not be found". `/no-such-page` returns 404 with "We couldn't find that page.", the tab bar and a focusable Go to Today. A unit test checks that every `href` in `TABS` and `LEGAL_LINKS` has a route file.

### R1-03 (P0): The guess field at 200% text on a phone

**Hit by** Sam (P0), the only persona who tried large text on a phone. At 390×844 with 200% text, the Guess and Clear buttons keep their size inside the field, so the input's text area shrinks to about 28 px for 38 px text. What you type vanishes, and so do the label and the placeholder. Suggestions truncate to "The L… 1987" and "Paper… 2013", so the names can't be told apart. The header breaks too: the stopwatch sits on the M3 pill and cuts off the E pill, and the page scrolls sideways (418 px of content in 390). He said he'd give up there, and release criterion R2 requires 200% text.

- **Owner:** FIX-MYS for the field and the rows; FIX-DLY for the header row; a DS-1 note for the pills.
- **Files:** `src/features/rounds/mystery/combobox.tsx` (Guess sits inside the field's flex row; rows use `truncate`), `src/features/daily/screen/daily-screen.tsx` and `stopwatch.tsx`, `src/ui/progress-segments.tsx` (DS-1).
- **Fix:** When the field is narrow in `em` (a container query), give Guess its own full-width row under the field and drop the inline Clear (Escape and Backspace still clear, as the compact layout already does). Let suggestion names wrap to two lines and put the year or qualifier under the name, instead of truncating both. In the header, drop the stopwatch's icon (DESIGN §10.2's narrow rule) and let the pills fall back to "Mystery 1 of 3" text when they don't fit.
- **Test:** E2E at 390×844 with `html { font-size: 200% }`: on Mystery 1, type "lan". The input's `clientWidth` is at least 160 px, no suggestion row's name element has `scrollWidth` greater than its `clientWidth`, and `document.documentElement.scrollWidth` is at most 390.

### R1-04 (P1): A wrong guess's cost is a surprise

**Hit by** four. Priya gambled on clue 2 "without knowing the price", and Sam "would have searched more before guessing". Dee and Marcus learned it from the first stamp and then wondered why Next clue exists. Dee also wasn't told that the clue-4 pick is a single shot. The stamp itself was understood at once, and by the end all five could answer question 2. The PRD already has the cure; the build doesn't. The first-Daily hint under clue 1 and the How to play sheet are both M1 scope, and both are missing.

- **Owner:** FIX-MYS (the hint), FIX-DLY (the sheet, the More menu and the first-Daily flag).
- **Files:** `src/features/rounds/mystery/ladder.tsx` or `index.tsx` and `copy.ts`, `src/features/rounds/contracts.ts` (a `firstDaily` flag in the round context), `src/features/daily/model/controller.ts`, `src/features/daily/screen/daily-screen.tsx`, `src/backend/mock/server/sealed.ts` (the start response can say whether the player has finished a Daily; it already counts earlier finishes at the finish), `src/ui/sheet.tsx` (DS-1's primitive).
- **Fix:** Under Mystery 1's clue 1 in the player's first Daily, once per player, PRD §3.1.4's line: "Get it from this clue for 4 points. A wrong guess costs the same as Next clue, so have a go." Add a More menu to the Daily header with How to play: §3.1.3's five parts in order (the ladder, the points, clue 4's single pick, the Encore, the ranking), logging `how_to_play_open` with `first_daily`.
- **Test:** Component: with `firstDaily: true`, clue 1 of Mystery 1 shows the hint; with `false` it doesn't. E2E: a fresh identity sees it on `/daily`; after finishing, the next date's Daily (mock clock plus one day) doesn't. AC-DLY-30 covers the sheet: opened from More, five parts in order, focus back on the same clue when it closes, one `how_to_play_open`.

### R1-05 (P1): What the stopwatch is for

**Hit by** all five. "Time so far" starts with clue 1 and ticks all game, yet time appears nowhere on the stop screen or in the share, and How scoring works is a 404, so nobody could find out whether speed matters. All five felt hurried by it. Priya rushed her first clue "for nothing", and Sam, slow by necessity at 200% zoom, found it made him anxious. Time is the last tiebreak, after the Encore, and nothing ever times out; the build just never says so.

- **Owner:** FIX-DLY.
- **Files:** `src/features/daily/screen/stopwatch.tsx`, `src/features/daily/screen/daily-screen.tsx` (the header's end slot), `src/features/daily/client-copy.ts`, `src/platform/settings/store.ts` (the `stopwatch: "hidden"` setting already exists and is read).
- **Fix:** First Daily only, the line beside the stopwatch: "Take your time. Time only breaks ties." (PRD §3.1.3, DESIGN §1.4). Make the stopwatch open the More menu at Hide stopwatch (DESIGN §6.7), with How to play beside it (R1-04). D7 proposes showing the total time on the stop screen with "only breaks ties", so the clock pays off somewhere.
- **Test:** E2E with a fresh identity: the hint is visible on `/daily`. More, then Hide stopwatch, hides it; after a reload it stays hidden, and it keeps `aria-live="off"` (AC-DLY-12).

### R1-06 (P1): The stopwatch resets on reload

**Hit by** all five, since all of them reloaded on purpose. Priya's went from 2:50 to 0:00 and Lena's from 2:36; Leave then Continue reset Dee's as well. Everything else came back. If time ever counts, a reload looks like a free reset, even though the server's figure is the one that ranks.

- **Owner:** FIX-DLY (the mock and the Daily), with an engine change ENG should review.
- **Files:** `src/engine/types/rounds.ts` and `runs.ts` (`ResolvedRound` and `AttemptSnapshot` carry no active time), `src/backend/mock/server/sealed.ts` and `daily.ts` (store and return each round's server interval), `src/engine/run/reducer.ts` (`resumeSealed` rebuilds resolved slots with `activeMs: 0` and reopens the current round at the reload: "The client measure restarts at the reload; the server keeps its own."), `src/features/daily/model/labels.ts` (`elapsedMs`).
- **Fix:** Return each resolved round's server interval in the snapshot and seed those slots' `activeMs` from it. For the open round, carry the time before the reload (from the clue's `issuedAt`, already in `RoundOpen`, and `serverTime`) as a separate display offset, so the client measure that PRD §4.3.3 compares with the server's stays honest. The Supabase RPCs need the same field later, which is a note for ENG-2's contract.
- **Test:** Unit: resuming a snapshot whose resolved Mystery 1 took 90,000 ms and whose open Mystery 2 clue was issued 30,000 ms before `serverTime` gives `elapsedMs` of 120,000. E2E under the mock clock: 90 s on Mystery 1, solve, Continue, 30 s, reload; the stopwatch reads 2:00 (give or take a second), not 0:00.

### R1-07 (P1): The Encore's purpose for a solo player

**Hit by** all five. "Encore · one number, the tiebreak" and "Closest guess wins the tiebreak." left every persona asking against whom, because nothing in this build ranks you against anyone. Sam couldn't say whether it counted toward his 5/12, which fails comprehension question 3, and Lena found the last question "pointless". The input and the number line were liked.

- **Owner:** FIX-MYS (the round's copy), FIX-DLY (the stop screen's Encore row), once D2 is agreed.
- **Files:** `src/features/rounds/encore/copy.ts` (`kicker`, `tiebreak`), `src/features/rounds/encore/index.tsx`, `src/features/daily/client-copy.ts` and `src/features/daily/stop-screen/stop-screen.tsx` (the Encore row).
- **Fix:** Say what it does in solo terms: kicker "Encore · one number, no points" and the line "If you tie on points, the closer guess ranks higher." Keep the two band chips. On the stop screen's Encore row, add "Breaks ties. Scores no points." The copy can name the percentile and Groups once they exist.
- **Test:** Component: the Encore's intro contains "no points" and "tie", and the stop screen's Encore row contains "Scores no points". Round 2's question 3 is the real test.

### R1-08 (P1): The header pills

**Hit by** four. The M1, M2, M3 and E pills are bordered and button-sized, so Priya, Dee, Marcus and Lena all tapped one expecting to review a Mystery, and nothing happened. Once a Mystery is solved its pill shows a bare "2" or "4". Dee first read it as a clue number and Marcus read "1 3 M3 E" as Mystery numbers: two misreads of a score, which makes this a P1 under §9.4 although all four labelled it P2. DESIGN §6.6 says a solved pill shows a check.

- **Owner:** FIX-DLY (what the pills say), DS-1 (how they look).
- **Files:** `src/features/daily/model/labels.ts` (`progressSegments` sets the solved `mark` to the points), `src/ui/progress-segments.tsx` (DS-1).
- **Fix:** A solved pill shows "+2" on the correct fill and a missed one the X (D11); the screen-reader label adds the points ("Mystery 1, solved on clue 3, 2 points"). Style the pills as flat progress marks with no ledge, and keep the current pill different from a focus ring.
- **Test:** Unit: after Mystery 1 is solved on clue 3, `progressSegments(state)[0]` has the mark "+2" and a label containing "2 points". E2E: no pill has `role="button"` or a pointer cursor.

### R1-09 (P1): Text from the page you just left

**Hit by** four. Sam's screen reader announced the last practice question when he arrived on Practice results, and "Practice done. 7 out of 10." when Play again started a fresh run. Dee and Marcus found old status messages ("Clue 2 is in. Now worth 3.", "247% off. You said 300 m…") still in the DOM on Today. Priya found two `<main id="main">` at once, because the previous page stays in the DOM, hidden, so the skip link's target is ambiguous.

- **Owner:** DS-1 (shell and live regions).
- **Files:** `src/ui/live-regions.tsx`, `src/ui/announce.ts`, `src/features/shell/landmarks.ts`, `src/features/shell/play-frame.tsx`, `src/features/shell/routes/*-layout.tsx`, `src/app/layout.tsx`.
- **Fix:** Clear the polite status region on every pathname change. Give `id="main"`, and any `h1` the route announcer can read, only to the visible route. Make sure each route's title is in place before the announcement (DESIGN §11 asks for unique titles such as "Daily No. 42 · Knewt").
- **Test:** E2E: lock in the Encore, then go to `/`; the status region is empty. After `/daily`, then `/`, then `/practice/run`, `document.querySelectorAll('#main')` returns one element and it is visible. After the last practice question, the route announcer's text is the results page's title, not the question.

### R1-10 (P1): "1,200" is rejected

**Hit by** three. On #45's Encore, which allows one decimal, "1,200" reads as 1.200 and fails with "Up to 1 decimal place, please." Dee, Marcus and Sam had typed no decimal, so the message made no sense, and Dee and Sam then typed a different guess. Marcus, in en-IN, also had "1,20,000" refused ("Check the dots and commas."), while "300,5" passed as 300.5. The parser follows PRD §4.2.1 to the letter, including its worked example, so the rule is what has to change (D1).

- **Owner:** FIX-MYS, after D1.
- **Files:** `src/engine/encore/parse.ts` (`splitAtPoint`), `src/engine/encore/parse.test.ts`, `src/features/rounds/encore/copy.ts`.
- **Fix (the proposed rule):** When only commas appear and every comma is followed by exactly three digits, or the commas form Indian grouping (two-digit groups ending in a three-digit group), they are thousands separators even when decimals are allowed. Any other single kind of separator keeps today's reading, its first occurrence being the point. So "1,200" is 1200, "12,345,678" is 12345678 and "1,20,000" is 120000, while "300,5" stays 300.5. The preview line ("You're answering 1,200 m") confirms the reading before Lock in.
- **Test:** Unit with `{ decimals: 1, valueKind: "quantity" }`: "1,200" gives 1200, "12,345,678" gives 12345678, "1,20,000" gives 120000, "300,5" gives 300.5, "1,250.5" gives 1250.5, and "1,2345" stays `too_many_decimals`. Every `{ decimals: 0 }` case is unchanged.

### R1-11 (P1): Suggestions open below the fold

**Hit by** three. At 200% zoom on a desktop, Sam typed "the" and saw nothing: the list had opened below the fold, and only his screen reader's "47 films match" said it was there. Lena, on #46's third clue in the full-height layout, had Bismuth cut off at the bottom. Priya, with the viewport cut to 505 px to stand in for a keyboard, saw only a sliver of the first row. The compact layout did its job when a real visual-viewport keyboard was detected (Lena), so the gap is every case without one: zoom and short windows, or a keyboard the app can't see.

- **Owner:** FIX-MYS.
- **Files:** `src/features/rounds/mystery/combobox.tsx` (the keep-in-view effect runs only while `keyboard.open`), `src/features/rounds/mystery/use-keyboard.ts` (`keepInView`).
- **Fix:** Whenever the list opens, run the same keep-in-view step against the visual viewport: scroll so the field and the first three rows sit between the sticky header and the bottom edge, and cap the list to the whole rows that fit. Older clues can drop to one line while the list is open, as they do with the keyboard up (PRD §3.1.4).
- **Test:** E2E at 640×400 (200% zoom on 1280×800): on Mystery 1 at clue 3, type "the". The field and three rows lie inside the viewport (each `getBoundingClientRect().bottom` at most `innerHeight`) with no manual scroll. AC-DLY-32 keeps covering the keyboard case.

### R1-12 (P1): At 200% zoom the fixed bars hide focus

**Hit by** Sam, with two P1s and a P2. On Today, tabbing to "Play today's Daily" scrolled it behind the bottom tab bar, with only a few pixels of outline showing; at 200% zoom the header and tab bar take about 28% of a 400 px viewport. In Quick Play, every four-option question opened with "Question N of 10" and the stem's first line under the sticky header, so he pressed Home each time. On a Mystery reveal, "Knew it · Solved on clue 3 · +2" sat half under the header. DESIGN §10.2 already asks for scroll padding, so a focused element is never hidden ([WCAG 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)).

- **Owner:** DS-1 (the padding), FIX-PRA (the question's scroll).
- **Files:** `src/app/globals.css` or DS-1's replacement, `src/features/shell/tab-bar.tsx`, `src/features/shell/play-header.tsx`, `src/features/rounds/choice/index.tsx` (`stemRef.current?.focus()` on open, with the browser's default scroll), `src/features/practice/run-screen.tsx`.
- **Fix:** DS-1: `scroll-padding-top` equal to the sticky header and `scroll-padding-bottom` equal to the tab bar or dock, from their measured heights. FIX-PRA: focus the stem with `preventScroll`, then scroll the question's top to just under the header, letting the options sit lower when the screen is short.
- **Test:** E2E at 640×400: Tab to "Play today's Daily"; its box lies entirely between the header's bottom and the tab bar's top. In a practice run, the stem's top is at or below the header's bottom on every new question.

### R1-13 (P1): Number keys against numeric answers

**Hit by** Dee. On "How many bridges cross the Corran?" (2, 4, 9, 15) she pressed 4 meaning four. It locked in option D, 15, and four was right. The big A to D badges look like keycaps, but C did nothing on Q2 and she had to press 3. The Daily's clue-4 options show the same 1 to 4 hints, and a pick there is instant and final.

- **Owner:** FIX-PRA (choice rounds) and FIX-MYS (clue-4 options), after D6.
- **Files:** `src/features/rounds/choice/index.tsx` (`SHORTCUT_KEYS` is `["1", "2", "3", "4"]`), `src/features/rounds/mystery/options.tsx`, `src/ui/answer-button.tsx` (the `kbd` hint; DS-1).
- **Fix:** Letters A to D pick, matching the badges. Digits 1 to 4 also pick, except on a question where any option is a number, where they do nothing. One key hint per option: the badge already shows the letter, so the separate `kbd` can go.
- **Test:** Component: with options "2", "4", "9" and "15", pressing "4" commits nothing and pressing "b" commits option B. With word options, "3" and "c" both commit option C. The same checks pass on the clue-4 options.

### R1-14 (P1): Practice feedback steals focus

**Hit by** Sam. About a second after an answer, the sheet's title takes focus even when he has already moved on. He Shift+Tabbed to "Leave practice", focus jumped to "Not quite. It's The Ashen Hills.", and his Enter continued to the next question instead of leaving. It happened twice before he worked out the timing.

- **Owner:** FIX-PRA.
- **Files:** `src/features/rounds/choice/index.tsx` (the layout effect on `sheetOpen` calls `titleRef.current?.focus()` whatever has focus).
- **Fix:** Move focus to the sheet only while focus is still on the answered option, inside the question region, or on `body`. Otherwise leave it where the player put it; the verdict still reaches the status region.
- **Test:** E2E: answer with the keyboard, then within 300 ms Shift+Tab to Leave. After 1.5 s focus is still on Leave, and Enter goes to `/`.

### R1-15 (P1): "Works offline." before it does

**Hit by** Priya. With the app already open, Quick play started a run offline. A reload or a cold open without a network shows the browser's own error page, because the build has no service worker and no manifest yet. That's exactly the bus-tunnel case the card promises.

- **Owner:** FIX-PRA, coordinated with PWA-0 in its parallel lane.
- **Files:** `src/features/practice/copy.ts` (`card.line`), `src/features/practice/client-copy.ts`.
- **Fix:** Drop "Works offline." from the Practice card until PWA-0's precache ships, and let PWA-0 restore it in the pull request whose E2E proves it.
- **Test:** Unit: the card's line contains no "offline" while the build registers no service worker. PWA-0 owns the reverse check: cut the network, reload `/practice/run` and answer a question, which must pass before the words come back.

## 6. Changes that need a PRD or DESIGN.md update

These are copy or flow changes the lanes shouldn't make on their own. Each names the section to edit and the finding it answers.

| # | Doc and section | Proposed change | For |
|---|---|---|---|
| D1 | PRD §4.2.1 and its worked examples; DESIGN §1.4 (Encore invalid) | With decimals allowed, commas followed by exactly three digits, or in Indian grouping, are grouping ("1,200" is 1200); a comma before one or two final digits is still the point. Replace the "`1,250` rejected" example | R1-10 |
| D2 | PRD §3.1.5 (first-Daily line); DESIGN §1.4 (Encore prompt) and §6.5 (unit line) | "Encore · one number, no points" and "If you tie on points, the closer guess ranks higher." on every Daily | R1-07 |
| D3 | PRD §3.5.1 and §4.1.7 (share rows); ARCHITECTURE §4.4.1 (cells); DESIGN §6.11 (glyphs) | Either split *passed* into *missed* (a wrong guess or pick, 🟥) and *skipped* (Next clue, a lighter square), or draw every used clue as one neutral square. Add a one-line legend under the stop screen's grid. Design runs the PRD Q5 device checks on whichever wins | R1-16 |
| D4 | PRD §3.5.1 (line 1) and §4.2.2 (the token reuses the display); DESIGN §6.11 (tokens); AC-SHR-01 | Share token "Encore off by 4%"; "Encore spot on" stays, and the in-app result keeps "4% off" | R1-19 |
| D5 | PRD §4.1.3 rule 6 and AC-SUG-05; DESIGN §6.4 | When exactly one selectable row matches, highlight it, so Enter or Go picks it and a second Enter submits. Namesakes still pick nothing | R1-29 |
| D6 | PRD §3.0.3 (keyboard); DESIGN §6.2 and §11 (input) | Letters A to D pick; digits pick only when no option is a number; one key hint per option | R1-13 |
| D7 | PRD §3.1.6; DESIGN §12.4 | The total time on the score card ("Time 3:12 · only breaks ties"), still never in the share text | R1-05 |
| D8 | PRD §3.1.3 | Decide after round 2: if personas still hurry with the hint in place, hide the stopwatch by default until the first Daily is finished | R1-05 |
| D9 | DESIGN §7.4 ("The field clears") and §6.4 | Next clue keeps the typed text and its list; a wrong guess still clears | R1-23 |
| D10 | DESIGN §1.1 and §1.4 | "Knew it." only for a solve on clue 1 or 2 with no wrong guess; "Got there." for clue 3 or any solve after a miss; "Got it." for a clue-4 pick stays | R1-22 |
| D11 | DESIGN §6.6; PRD §3.1.3 (header) | A solved pill shows "+3" on the correct fill and a missed one the X; pills are flat marks, not buttons. Optional: a running total ("6 pts") in the header | R1-08, R1-39 |
| D12 | DESIGN §6.10 (compact sheet) | Show the whole explanation (35 words at most) and let the sheet scroll, instead of one line and Read more | R1-31 |
| D13 | DESIGN §12.11 | Each results row carries a short stem and, on a miss, "You chose X"; Play again above the list or sticky | R1-17 |
| D14 | DESIGN §6.4 (placeholder) | A short noun per type ("Start typing an element"), so it fits beside Guess at 360 px | R1-24 |
| D15 | DESIGN §6.3 and §11 | Next clue sits after the field in reading and focus order, so the first Tab reaches the field | R1-32 |
| D16 | DESIGN §6.5 | The band chip reads "Close guess", and the result card keeps both band lines, so a guess outside them still shows where they were | R1-26 |
| D17 | DESIGN §1.4 (No matches) | "No matches. Try another spelling, or use Next clue." | R1-34 |
| D18 | DESIGN §12.1 and §1.4 | One date on Today (drop it from the ticket's line when the dateline shows it); a first-visit line under the greeting ("Name the mystery in as few clues as you can."); decide whether midnight to 5am gets its own greeting | R1-35 |

**Already in the spec and missing from the build** (no doc change): the first-Daily hints (PRD §3.1.3, §3.1.4, §3.1.5), How to play and the More menu (§3.1.3, AC-DLY-30), Hide stopwatch (AC-DLY-12), the not-found page (DESIGN §12.42), the Share button (PRD §3.5.2), unique page titles (DESIGN §11), scroll padding (DESIGN §10.2), an explanation sheet that shifts nothing (PRD §3.0.3) and the compact Next clue's worth (AC-DLY-29).

**Conflicts, and what we keep.**

- **Share rows.** Priya wants the squares first so they line up. PRD §3.5.1 puts words first for screen readers, and Sam hearing "red square, red square" three times over backs that. Keep words first.
- **✅ or 🟩.** Priya finds the mixed shapes lumpy, but DESIGN §6.11 chose ✅ so a solve survives colour blindness. Keep ✅ unless the Q5 device check finds a better pair.
- **Leaving practice.** Lena wanted a confirm; Sam was glad there wasn't one. Keep no confirm.
- **Next clue or a guess.** Dee and Marcus noticed that a miss costs the same as Next clue. PRD §4.1.2 chose that on purpose. Keep it.

## 7. Notes for DS-1

DS-1 is rebuilding the shell, the primitives, theming and the brand in a parallel lane, so these are inputs to that lane rather than tickets:

1. A not-found page inside the shell with DESIGN §12.42's copy and the tab bar, plus stubs or hidden links for every unbuilt destination (R1-02).
2. `scroll-padding-top` and `scroll-padding-bottom` from the real header, tab bar and dock heights (R1-12).
3. One visible `main#main`, a status region that clears on route change, a title per route in place before the announcer reads it, and an announcer that reads the visible page (R1-09).
4. The brand: "Knewt" in the title template and the description, plus preview metadata that names it (R1-20).
5. Progress pills and chips styled as marks rather than buttons, with the current pill distinct from focus (R1-08, R1-27).
6. The Daily header at 200% text and at 320 px: pills and stopwatch never overflow (R1-03).
7. `AnswerButton`: the "Correct answer" pill under the text, one key hint, and a check of the accessible name for a doubled letter (R1-36, R1-13, R1-40).
8. Today: scroll to the top on arrival, and DESIGN §10.1's two columns from 1024 px instead of a 720 px column at the left (R1-35).
9. Focus rings: one 3 px ring everywhere, `summary` included. At 200% text keep the `h1` larger than the `h2`s (rem minimums in the `clamp()`s) and space the tab labels apart (R1-34).
10. The practice progress row's right gutter, and the sheet's grab handle, which looks draggable but isn't (R1-36).

## 8. Fix list by area

| Area | P0 and P1 | P2 worth doing in this wave |
|---|---|---|
| FIX-DLY | R1-01 Share button (Web Share, clipboard, selected text box) on the stop screen and the Today card · R1-02 hide Past 7 days, write the How to play text · R1-03 the stopwatch fits the 200% header · R1-04 How to play sheet, More menu, `firstDaily` flag · R1-05 stopwatch hint and Hide stopwatch · R1-06 elapsed time survives a reload · R1-07 the stop screen's Encore row · R1-08 "+2" pill marks | R1-30 fixture Mysteries · R1-18 share-link test · R1-34 one `h1`, results focus · R1-38 Saved toast · after D3 and D4: R1-16 glyphs, R1-19 token |
| FIX-MYS | R1-03 guess field and rows at 200% text · R1-04 first-Daily hint under clue 1 · R1-07 Encore copy (after D2) · R1-10 Encore parser (after D1) · R1-11 the list scrolls into view without a keyboard · R1-13 clue-4 option keys (after D6) | R1-28 show the whole pick · R1-33 compact "then worth 1" and layout polish · R1-26 number-line labels · R1-29 visible "Pick a name" hint · R1-37 typo rows · R1-34 preview debounce · after D9, D10, D14 and D15: R1-23, R1-22, R1-24, R1-32 |
| FIX-PRA | R1-02 greybox `/practice` · R1-12 the question's top stays below the header · R1-13 A to D keys, digits off for numeric options (after D6) · R1-14 focus moves only while it's still in the question · R1-15 drop "Works offline." | R1-21 no scroll on feedback · R1-25 casing · R1-36 repeats and "Continue practice" · R1-34 trimmed headings · Share on practice results once R1-01 lands · after D12 and D13: R1-31, R1-17 |
| DS-1 (notes) | R1-02 not-found and stubs · R1-03 header at 200% text · R1-08 pill style · R1-09 live region, `main` and titles · R1-12 scroll padding | R1-20 brand · R1-27 chips · R1-35 Today scroll and layout · R1-36 answer pill, gutter, handle · R1-34 rings and headings · R1-40 check the names |

## 9. Round 2

**Fix first:** every P0 and P1 above, plus the P2s marked "in this wave". Copy changes wait for their D item.

**Change the method:**

1. Run the four comprehension questions verbatim after each persona's first Daily, and store the answers with the transcripts beside the E2E reports (PRD §9.4).
2. Time each Daily from the attempt's server timestamps, not the on-screen clock.
3. Build with `NEXT_PUBLIC_SITE_URL` matching each persona's port, or serve one build to everyone.
4. Give Lena's slot a low-end Android profile over slow 4G (4× CPU slowdown and Lighthouse's mobileSlow4G throttling, as AC-DLY-02 uses), so the round covers §9.3's sixth type.
5. Replace #45's Mystery 3 with a fixture its clues can solve, or play real launch content, so Mystery 3 measures the format and not the fixture.
6. Start at least one persona on a second Daily with a returning identity, to check that the first-Daily hints show once and then stop.

**Decisions for the M1 exit:**

- `options_from_clue` stays at 4. Nobody stalled on typing; the trouble was layout (R1-03, R1-11) and the Enter key (R1-29). Revisit after round 2, per PRD Q3.
- `daily_minutes` stays at 4 until round 2 measures it.

**Watch in round 2:** whether the clue-1 hint alone answers question 2 before the first miss; whether the new Encore copy fixes question 3; whether the stopwatch hint stops the hurrying, which decides D8; and whether anyone shares once there's a button, and what they say about the grid when they do.
