# Knewt: design system and screen specs, v1

| | |
|---|---|
| Status | Final direction, approved for build. The visual and interaction source of truth for v1 |
| Owner | Design director |
| Date | 31 October 2026 |
| Inputs | [00-PROJECT-BRIEF.md](./00-PROJECT-BRIEF.md), [02-PRODUCT-DECISIONS.md](./02-PRODUCT-DECISIONS.md) (binding), [PRD.md](./PRD.md) (what ships), [SYNTHESIS.md §8](./research/SYNTHESIS.md), [05-ux-ui-best-practices.md](./research/05-ux-ui-best-practices.md), the three explorations in [design/explorations/](./design/explorations/) and the judge panel's verdicts |
| Tokens | [design/tokens.css](./design/tokens.css), generated from [design/final/tokens.js](./design/final/tokens.js) |
| Prototype | [design/final/index.html](./design/final/index.html), screenshots in [design/final/screens/](./design/final/screens/) and checks in [design/final/checks/](./design/final/checks/) |

**Precedence.** The decisions memo beats the PRD, and the PRD beats this document on behaviour and copy meaning. This document owns how things look, move, sound and feel, the exact glyphs of the share text, and copy polish. Where this document proposes a change to PRD behaviour, it says so in a box marked **PRD change proposed**, and the PM updates the PRD in the same pull request.

---

## 0. The decisions

### 0.1 Direction: warm editorial (exploration A), with grafts

Two of the three judges picked A. The average scores tied (A 7.67, C 7.67, B 6.17), so the majority vote decides, and nothing in C is strong enough to override it. A explains the Mystery and the Encore most plainly, has the biggest typing targets, keeps one primary action in both themes and brought the most thorough accessibility evidence. C's real advantage was distinctiveness, so the grafts below spend most of their effort there.

What we kept from A: paper and ink with one loud orange, the Daily as a tear-off ticket, the clue ladder with a rail and a 4-3-2-1 worth scale, verdicts marked like proof edits, the tally-mark streak, the crop-safe share card and the "writing desk" sounds.

What changed, and why:

| Problem the panel found in A | What we did |
|---|---|
| Would sit too close to NYT Games and the Guardian | The ticket became a system object (the Daily, the share image, the host join panel, the challenge landing). The newt was redrawn so it reads as an animal. Verdicts became rubber stamps. The score's slash is drawn as one eft pen stroke. Difficulty is shown as inked pips |
| The newt read as "a question mark with lollipop bolts" | A new mark built from a tapering body, bent legs with toes and two eyes, with three detail levels (§1.5) |
| Dark ticket went salmon, the active suggestion went muddy brown | The dark ticket is burnt eft #AD4219 with cream text (5.12:1); the active row is a neutral raised row with an eft bar |
| Dashed 44 px Next clue looked like a placeholder | A solid, ledged 48 px button with an icon and "then worth 2", sitting in the dashed slot where clue 3 will land |
| Pencil strike through the player's own wrong guess | Wrong guesses are stamped ("Not Mary Shelley"), never struck through |
| Green and red squares collapsed for protanopes (delta E 4) | Correct moved to a blue-leaning teal #0B6670: delta E 22 under protan and 45 under deutan |
| The paper grain sat above the text and darkened it | Grain lives under the content, on the page only, at lower opacity; measured worst case for meta text is 5.23:1 |
| "Top 29%" and "beat 71%" disagreed with the chart | One number ("You beat 64% of players so far today"), computed from the same counts the chart draws |
| No route from results to the miss review | "Your mysteries" with "Review clues and the why" |
| Slashed zero in data numerals | Every data numeral (scores, counts, axes, guesses) is set in Fraunces |
| Chip row clipped mid-word, widows at 320 px | No chip row on Today; `text-wrap: pretty` on running text and `balance` on headlines; every screen captured at 320 px |
| Clue 4 and the Encore keypad not drawn | Both drawn ([mystery-clue4-light.png](./design/final/screens/mystery-clue4-light.png), [encore-light.png](./design/final/screens/encore-light.png)) |

The full ledger of the panel's grafts, adopted or declined, is Appendix B.

### 0.2 The name: Knewt

The panel split three ways (Glim, Zooks, Knewt). The design recommendation is **Knewt**, for four reasons:

1. **Decision 12 asks for a coined word.** Knewt is coined. Zooks is an existing interjection and Glim an existing (archaic) English word.
2. **It belongs to the chosen direction.** Glim's whole story is light in the dark, which is exploration C. Zooks is loud, and its own judge called it "louder than A's calm editorial voice".
3. **It names the best moment.** Knewt reads as "knew it", the thing people say when clue 2 lands, and the share line shows the spelling every time ("Knewt Daily #42 · 9/12").
4. **It makes a mark that explains the game:** a newt curled into a question mark.

Known risks, all flagged for the launch report: people who only hear the name will type "newt" (buy the obvious typo domains and make "newt" find us); "pissed as a newt" is a British idiom for drunk; Newt Gingrich and the edtech brand Knewton are nearby associations [K]. Glim was closer to an existing product ("Glim: Daily Self Care Rituals" on the App Store, per exploration C's search), and Zooks sounds like Zoox and Zuke's [K]. A trademark search in classes 9 and 41 and a domain check are required before the owner commits (PRD Q8). `knewt.app` in this document is a placeholder.

`[K]` marks background knowledge not verified this session, as in the research reports.

---

## 1. Brand

### 1.1 Name, spelling and pronunciation

- Written **Knewt**, wordmark lowercase **knewt**. Said "newt", one syllable.
- In running text it is always "Knewt", never "KNEWT" and never "the Knewt". "Did you get today's Knewt?" is fine in marketing, but product copy says "the Daily".
- The pun lives in the name and in one place in the product: the solved stamp, "Knew it." Never in errors or streak copy, and never after a miss.

### 1.2 Personality

Knewt is the friend who runs the puzzle page: well read and quick to laugh, glad when you get one and kind when you don't. Curious, never smug. Warm, never cute. It respects your time, so it tells you when you're done.

### 1.3 Voice and tone rules

1. **Write like a person at the next desk.** Short sentences and plain words. Sentence case everywhere, numerals for numbers, no all caps.
2. **Be exact about points, clues, streaks and time.** "Clue 2, so 3 points." "A freeze covered yesterday." Numbers beat adjectives.
3. **One smile per screen, at most.** Jokes live in the margins (an empty state, the 404). Verdicts, errors, streak messages and offline notes never carry one.
4. **Never blame, never nag.** No guilt, no fake urgency, no "so close!" unless the Encore really was inside the close band. No exclamation marks in errors or streak copy. Streak strings never contain "lost", "don't break" or "hurry" (AC-STK-06).
5. **Say what still works.** Offline and error copy names what the player can do now and what doesn't count.
6. **Write for every English-speaking city.** Months spelled out ("1 November"), no idioms that only work in one country, both spellings accepted in answers, no sports terms that only one country uses.
7. **The honor system is not a crime.** We never call a looked-up answer cheating (PRD §3.0.4).

Tone moves with the moment: brisk during play, warm on a solve, plain and steady on a miss, calm and factual for anything about streaks, privacy, data or outages.

### 1.4 Microcopy for key moments

Copy in the PRD stays the intended wording; this table is the polished version for the copy file. Quote marks are not part of the strings.

| Moment | Copy | Notes |
|---|---|---|
| Greeting | Good morning. / Good afternoon. / Good evening. | By the player's local time |
| Daily ticket | Today's Daily · No. 42 · Three Mysteries and an Encore · Fewer clues, more points. Then one number. · About 4 minutes · no time limit · 4,812 played | The count shows from 50 finishers. "No time limit", not "untimed": the stopwatch runs, because time breaks ties (memo D27) |
| Play | Play today's Daily | |
| First clue, first Daily only | Guess the person from the clue. Type to see suggestions, or tap Next clue for an easier one. | The answer type changes |
| Stopwatch, first Daily only | Take your time. Time only breaks ties. | |
| Wrong guess (stamp) | Not Mary Shelley | On the clue it was tried on |
| Wrong guess (status region) | Not Mary Shelley. Clue 2 is in. Now worth 3. | Polite |
| Next clue | Next clue · then worth 2 | On clue 3: Last clue and options · then worth 1 |
| Clue 4 | Last clue. Pick one of four. | |
| Already guessed | Already guessed | On a suggestion row or an option |
| No matches | No matches. Try another spelling, or tap Next clue. | |
| **Correct** (Mystery solved) | Knew it. · Solved on clue 2 · 3 points | "Got it." for a clue-4 pick |
| **Correct** (practice) | Right · It's Uranus. | Status: Correct. Uranus. |
| **Incorrect** (practice) | Not quite · It's Uranus. | Status: Not quite. You chose Venus. The answer is Uranus. |
| **Incorrect** (Mystery missed) | This one got away. · The answer was Heat (1995) · 0 points | |
| Encore prompt | Encore · one number, the tiebreak | First Daily: Closest guess wins the tiebreak. Within 5% is a bullseye. |
| Encore preview | You're answering 320 days | |
| Encore invalid | Numbers only, please. / Positive numbers only. / That's more digits than we can take. | Inline, under the field |
| Encore result | Bullseye. 4% off. / Close. 12% off. / 28% off. The answer was 1,250 km. / Spot on. | "Close" only inside the close band |
| Best moment | 12 out of 12. A perfect Daily. / Your best Daily yet. / Streak 7. That's a full week. / Mystery 3 on the first clue. / Bullseye on the Encore. / Silver in Geography. / Daily No. 42, done. | PRD §3.1.6 order |
| Percentile | You beat 64% of players so far today. | 100: Nobody has beaten you so far today. Under 5: This one was tough. Tomorrow's a new Daily. |
| Cold start | You're one of the first 23 players today. Come back later to see how you compare. | |
| End of the Daily | Done for today · Next Daily in 9h 41m · Want more? Try a practice round. | |
| **Streak saved** (freeze) | Your streak is safe. A freeze covered yesterday. | Once, next visit |
| Streak saved (our outage) | We had a problem on Tuesday, so that day is covered for everyone. Your streak is safe. | |
| **Streak broken**, repair open | Your 23-day streak can be saved. Play Saturday's Daily by midnight Monday. · Repair now · Not now | Hidden for the 13 to 17 band |
| **Streak broken**, record first | Best streak: 23 days · 41 days played · Today: day 1 of a new run | The current count is never the biggest number on screen (AC-STK-04) |
| Streak broken, can't repair | This break was longer than one day, so it can't be repaired. Your best streak stays on record: 23 days. | |
| Repaired | Streak repaired. You're back on 25 days. | |
| Freeze earned | You earned a freeze. It covers a missed day, automatically. | |
| Freezes full | Freezes full (2 of 2). Progress resumes when one is used. | |
| **Offline** (banner) | You're offline. Practice works, but it isn't today's Daily. | |
| Offline (Daily card) | The Daily needs a connection. Practice works offline, but it isn't today's Daily. · Try again | Practice card moves up |
| Offline mid-round (alert) | You're offline. Your progress is saved, and we'll pick up where you left off. | `role="alert"`, the only one |
| **Error** (guess) | We couldn't check that guess. Try again. | Retry reuses the idempotency key |
| Error (generic) | That didn't reach us. Nothing was lost. Try again. · Ref 7KQ2 | Reference ID in small text, never a code or stack |
| Error (numbers) | We couldn't load today's numbers. · Retry | The rest of the screen renders |
| Slow server | Checking… | After 1.5 s; the copy file uses the single ellipsis character |
| Share copied | Copied. Paste it into your group chat. | |
| Share sheet title | Share your result. No answers inside. | |
| Report sent | Thanks. We read every report, and if we got it wrong we'll fix everyone's scores. | |
| Heart | I liked this | Accessible name: I liked this one |
| Clean sheet | Nothing to review. Clean sheet. | |
| Not found | We couldn't find that page. · Go to Today · Practice | The one smile: Even the newt can't find it. |

### 1.5 The mark and the wordmark

**The idea.** An eft (a young newt) curled into a question mark. The head is the ball terminal, the body is the hook, the tail tapers into the stem, and the dot stays a dot. It is drawn from a centre line with a width profile, so the tail really tapers and the legs bend at the knee and end in three toes. Straight legs with round ends read as bolts, which is what the panel saw in the exploration.

Source: [design/final/mark.js](./design/final/mark.js) generates all three detail levels; [design/final/icons/mark.svg](./design/final/icons/mark.svg) is the full mark. See [checks/marks.png](./design/final/checks/marks.png).

| Level | Use at | What's drawn |
|---|---|---|
| `mark-small` | 16 to 27 px (favicon, inline with text) | Body, head and dot: a plain "?" |
| `mark` | 28 to 47 px (top bar, wordmark lock-up) | Adds the bent legs and two eyes |
| `mark-full` | 48 px and up (app icon, share image, empty states) | Adds the toes at full weight |

**Colourways.** Eft body, ink eyes and ink dot on paper. Eft body, charcoal eyes and cream dot on charcoal (dark theme and the app icon). Ink body with eft eyes on the orange ticket. Never two oranges touching, never a gradient, never an outline version.

**Wordmark.** "knewt" in Fraunces 800 (SOFT 100, WONK 1), tracking −0.03 em, with the mark to its left at 1.24 times the type size (a 36 px mark beside 29 px type) and a 3 px gap. For the share image and print, the wordmark is converted to an SVG outline so it never depends on a loaded font.

**Clear space** is the height of the dot on every side. **Minimum sizes:** 16 px for the mark, 72 px wide for the lock-up.

**App icon.** Charcoal tile #1D1A16, `mark-full` in eft with a cream dot, the mark at 70% of the tile, centred on its optical centre (the bowl, not the box). Maskable variant: the same art inside the 80% safe circle. Sizes: 180 (Apple touch), 192, 512 and maskable 512.

**Don't:** rotate it, add a mouth, give it a speech bubble, animate it walking, or put it inside play screens. It may peek over the edge of the share card and appear in empty states (§1.6).

### 1.6 Illustration rules

- **One character.** The newt is the only illustrated figure. No mascot runtime and no Lottie or Rive in the first bundle ([05](./research/05-ux-ui-best-practices.md)).
- **Where it may appear:** empty states (stats before the first Daily, an empty Groups tab, the 404, offline Practice when a pack isn't cached), the share image, the perfect-Daily moment and marketing. Never on question, clue, verdict or Encore screens.
- **How it's drawn:** flat shapes in paper, ink and eft, using the mark's construction (tapered body, bent legs, two eyes). No gradients, no 3D, no outlines around fills, no text inside illustrations.
- **Poses:** at most four, each a static SVG under 4 KB: curled (the mark), peeking over an edge, reading (head down on a card), and looking for something (head up, tail as a question mark).
- **Size and place:** at most one illustration per screen, never behind text, never larger than 40% of the viewport width on phones, and always `aria-hidden` with the meaning carried by the copy next to it.
- **Ornaments** come from the paper itself: tear lines, punched notches, stamps, rules and tally strokes. No confetti except the perfect Daily (§7.6).

---

## 2. Colour

### 2.1 Principles

- **Paper and ink do most of the work.** Eft is the one loud colour. Teal means correct and cranberry means wrong, and nothing else uses them.
- **Eft never means wrong.** That's why wrong is a cool cranberry. In the high-contrast setting orange does mean wrong, so every in-play accent beside a verdict switches to ink there (the `play-accent` tokens).
- **Never colour alone.** Every state carries an icon and a word; most carry a shape change too ([WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)).
- **Text holds 4.5:1, state graphics and control boundaries hold 3:1** ([1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)), dimmed options included. Every pair is measured from the token source by `contrast.js`; all 130 pass.
- **Dark is warm charcoal, not black**, with softened accents, as Material's dark guidance suggests ([Material](https://m2.material.io/design/color/dark-theme.html)). Large orange areas go darker in dark mode; small accents go lighter.

### 2.2 Tokens

All tokens are CSS custom properties named `--kn-<name>` and Tailwind colours named `<name>` (so `bg-surface`, `text-ink-2`). Ratios are against the background named.

**Paper, ink and structure**

| Token | Light | Dark | Role | Key ratio (light / dark) |
|---|---|---|---|---|
| `page` | #F5EFE4 | #1A1714 | The page (grain sits on this layer only) | |
| `surface` | #FFFBF5 | #25211C | Cards, options, sheets, the tab bar | |
| `surface-2` | #FAF3E8 | #2C2722 | Hover on rows and ghost buttons; the active suggestion in dark | |
| `sunken` | #ECE4D6 | #13110E | Wells, letter badges, empty segments, disabled buttons | |
| `ink` | #1D1A16 | #F3EBDE | Text and icons | 15.14 / 15.09 on page |
| `ink-2` | #4E463D | #CEC3B3 | Secondary text, dimmed options | 8.98 / 9.20 on surface |
| `ink-3` | #665C51 | #A99D8D | Meta text: dates, counts, kickers | 5.71 / 6.71 on page |
| `rule` | #E2D9CA | #3A332B | Decorative hairlines, never a control's only edge | |
| `rule-strong` | #8A7F70 | #857A6B | Borders that identify a control | 3.43 / 4.24 on page |
| `ledge` | #DCD0BC | #0D0B09 | The solid thickness under cards and buttons | |
| `scrim` | ink at 45% | black at 62% | Behind dialogs | |

**Actions and brand**

| Token | Light | Dark | Role | Key ratio (light / dark) |
|---|---|---|---|---|
| `primary` / `on-primary` | #1D1A16 / #FFFBF5 | #F3EBDE / #1A1714 | The one primary button per screen | 16.81 / 15.09 |
| `primary-ledge` | #000000 | #A99B86 | Its ledge | |
| `accent` / `on-accent` | #E55F29 / #1D1A16 | #F07A45 / #1A1714 | Small eft fills (count badges, your bar) | 4.95 / 6.44 |
| `accent-text` | #B4421A | #F59466 | Eft as text or a thin line | 4.91 / 7.91 on page |
| `accent-tint` | #FADCCB | #3B2A20 | Highlighter wash, today's dot, the active suggestion in light | ink on it 13.34 / 11.54 |
| `accent-ledge` | #B9481F | #9A4320 | Ledge under eft things | |
| `ticket` / `on-ticket` | #E55F29 / #1D1A16 | #AD4219 / #F7EEE1 | The Daily ticket and the host join ticket | 4.95 / 5.12 |
| `ticket-card` | #ED8C63 | #873314 | Answer-type cards inside the ticket | on-ticket 7.04 / 7.27 |
| `ticket-invert` / `on-ticket-invert` | #1D1A16 / #F28A5C | #1A1714 / #F59466 | The Encore card inside the ticket | 7.07 / 7.91 |
| `ticket-ledge` | #B9481F | #5E230C | | |
| `focus-on-ticket` | #1D1A16 | #F7EEE1 | Focus ring on the ticket | 4.95 / 5.12 |
| `play-accent` / `on-play-accent` | eft / ink | eft / charcoal | Points marker, "New" tag, field glow | 4.95 / 6.44 |
| `play-accent-text` | #B4421A | #F59466 | Best-moment stamp | 4.91 / 7.91 on page |
| `link` / `link-underline` | ink / #B4421A | cream / #F59466 | Links: ink text, eft underline, 2 px | underline 5.45 / 7.09 |

**Feedback** (the high-contrast setting replaces these)

| Token | Light | Dark | Role | Key ratio (light / dark) |
|---|---|---|---|---|
| `correct` / `on-correct` | #0B6670 / #FFFBF5 | #175B60 / #F3EBDE | Correct fill and its text | 6.47 / 6.57 |
| `correct-line` | #0B6670 | #6AD3CF | Correct border, solved squares | 6.47 / 9.01 on surface |
| `correct-text` | #0B6670 | #7FDCD6 | "Correct answer", "Knew it." | 6.47 / 9.99 on surface |
| `correct-tint` | #DAECEC | #183737 | Solved clue, bullseye band | ink on it 14.19 / 10.82 |
| `correct-ledge` | #063D43 | #0B2E31 | | |
| `incorrect` / `on-incorrect` | #B42A3C / #FFFBF5 | #E0566A / #1A1714 | Wrong badge and its X | 6.10 / 4.85 |
| `incorrect-line` | #B42A3C | #E0566A | Wrong-pick border, used squares, stamps | 6.10 / 4.35 on surface |
| `incorrect-text` | #A32536 | #FF8C9A | "Your answer", stamp text | 7.08 / 7.21 on surface |
| `incorrect-tint` | #F8E0E1 | #45212A | Your wrong pick | ink on it 13.82 / 11.80 |
| `incorrect-ledge` | #D9A3A6 | #2A1419 | | |
| `selected` | ink | cream | Locked-in border before the reveal | 16.81 / 13.52 |
| `focus` | ink | cream | 3 px focus ring, 3 px offset | 15.14 / 15.09 |

**Utilities**

| Token | Light | Dark | Role |
|---|---|---|---|
| `warning` / `on-warning` / `warning-text` | #F2BE4A / ink / #7A5300 | #F2BE4A / charcoal / #F6CD6E | Room and Blitz timers in their last seconds, always with stripes |
| `caution` / `on-caution` / `caution-line` | #FBEBC4 / ink / #9A6B00 | #3A2F14 / cream / #F6CD6E | Outage and maintenance banners |
| `freeze` / `on-freeze` | #DDE7EC / #2B4250 | #22303A / #B9D3E2 | Freeze days and the freeze count |
| `chart-bar` | #8A7F70 | #857A6B | Everyone else's bars (3.81 / 3.80 on surface) |
| `chart-you` / `chart-you-line` | eft / ink | eft / charcoal | Your bar: fill, inset 2 px line and a hatch |

**High-contrast feedback** (Settings; blue and orange, as Wordle does, [05](./research/05-ux-ui-best-practices.md))

| Token | Light | Dark |
|---|---|---|
| `correct` / `on-correct` / `correct-line` / `correct-text` / `correct-tint` | #1E5BA8 / #FFFBF5 / #1E5BA8 / #1E5BA8 / #DCE7F5 | #1F4F8F / #F3EBDE / #8DB8F2 / #A9CBF7 / #1B2A40 |
| `incorrect` / `on-incorrect` / `incorrect-line` / `incorrect-text` / `incorrect-tint` | #B04A0C / #FFFBF5 / #B04A0C / #9A3F08 / #FBE3D0 | #F09A55 / #1A1714 / #F09A55 / #FFB27A / #4A2A16 |
| `play-accent` / `play-accent-text` / `chart-you` | ink | cream |

Every high-contrast pair passes too (6.53:1 for correct text on its fill in light, 6.90:1 in dark; full tables in Appendix A).

### 2.3 Colour-vision checks

Simulated with the Machado, Oliveira and Fernandes model at full severity ([IEEE TVCG](https://doi.org/10.1109/TVCG.2009.113)), reported as luminance ratio and CIE76 delta E:

| Pair | Light, protan | Light, deutan | Dark, protan | Dark, deutan |
|---|---|---|---|---|
| Solved square next to a used square | 1.38 / 22 | 1.31 / 45 | 2.89 / 34 | 1.71 / 38 |
| Correct fill next to a wrong pick | 4.76 / 50 | 5.73 / 57 | 2.04 / 21 | 1.64 / 21 |
| Your bar next to the other bars (plus its ink line and hatch) | 1.14 / 38 | 1.26 / 48 | 1.25 / 33 | 1.67 / 44 |

The exploration's green and red squares measured delta E 4 under protanopia; the teal shift alone takes that to 22, and the check and X glyphs carry the rest. About 1 in 12 men has a colour-vision deficiency ([Colour Blind Awareness](https://www.colourblindawareness.org/colour-blindness/)), which is why the high-contrast set exists and why the share text uses ✅ for a solve (§6.11).

### 2.4 The paper grain

A fractal-noise SVG sits on the page layer only, under every card, sheet, button and line of text, at 16% opacity with `multiply` in light and 12% with `screen` in dark. It is switched off in forced colours, in Readable text mode and on the share image. Measured on the rendered page, the darkest grain pixel leaves `ink-3` at 5.23:1 in light and 6.16:1 in dark (the token values are 5.71 and 6.71). The ticket's edge against the grained page drops to about 2.8:1 at the darkest pixel; that's acceptable because the ticket is a container, and the Play button inside it carries its own 4.95:1 boundary.

---

## 3. Typography

### 3.1 Families and files

| | Display: **Fraunces** | Text: **Atkinson Hyperlegible Next** |
|---|---|---|
| Designers | Undercase Type | Braille Institute of America |
| Licence | SIL Open Font License 1.1, no Reserved Font Name | SIL Open Font License 1.1, no Reserved Font Name |
| Source | [github.com/undercasetype/Fraunces](https://github.com/undercasetype/Fraunces) via `@fontsource-variable/fraunces` 5.3.0 | [github.com/googlefonts/atkinson-hyperlegible-next](https://github.com/googlefonts/atkinson-hyperlegible-next) via `@fontsource-variable/atkinson-hyperlegible-next` 5.3.0 |
| Production cut | SOFT pinned at 100, WONK at 1, weight 500 to 800, optical size 12 to 72 | Weight 400 to 800 |
| Files (latin) | `fraunces-roman-latin.woff2` 52,748 bytes; `fraunces-italic-latin.woff2` 7,972 bytes (static 450, lowercase, digits and a few capitals) | `atkinson-next-latin.woff2` 27,492 bytes |
| On demand (latin-ext) | `fraunces-roman-latin-ext.woff2` 47,244 bytes | `atkinson-next-latin-ext.woff2` 15,728 bytes |

**Budget: 88,212 bytes for the latin set**, inside the PRD's 100 KB for two families. Latin-ext loads only when a page holds a character such as Ł or ř (unicode-range). Preload the two roman files; the italic loads when the ticket renders. `font-display: swap` with metric-matched fallbacks (`size-adjust` 120.7% for Fraunces against Times New Roman, 99.9% for Atkinson against Arial, measured with fontTools from pangram advance widths). The files are built by [fonts/build-fonts.sh](./design/final/fonts/build-fonts.sh) from the Fontsource packages with fontTools 4.68; both licences travel with them and belong on `/credits`.

**Why this pair.** Fraunces at SOFT 100 keeps the friendliness the research wanted from Fredoka or Nunito and adds the newspaper ([SYNTHESIS §8.9](./research/SYNTHESIS.md)); WONK gives the leaning n, m and h that make the wordmark ours. Atkinson Hyperlegible Next does all the reading, exactly as the research recommends.

### 3.2 Scale

Mobile values; display sizes are fluid between 320 and 390 px and capped above. Token names are `--kn-text-*` and Tailwind `text-*`.

| Token | Face | Size / line height | Weight | Tracking | Used for |
|---|---|---|---|---|---|
| `hero` | Fraunces | clamp(66px, 22vw, 88px) / 0.82 | 700 | −0.04em | The score numeral |
| `display-1` | Fraunces | clamp(30px, 9vw, 35px) / 0.98 | 700, italic 450 on line two | −0.02em | Ticket title |
| `display-2` | Fraunces | clamp(28px, 8.5vw, 33px) / 1.05 | 600 | −0.015em | Greeting, page titles |
| `display-3` | Fraunces | clamp(26px, 7.7vw, 30px) / 1.05 | 650 | −0.015em | Sheet titles, the revealed answer |
| `display-4` | Fraunces | clamp(24px, 6.9vw, 27px) / 1.08 | 650 | −0.01em | Screen titles ("A person") |
| `display-5` | Fraunces | 21px / 1.12 | 650 | | Card titles, ledger answers |
| `display-6` | Fraunces | 19px / 1.15 | 650 | | Top bar titles, section heads |
| `stem` | Atkinson | clamp(22px, 6.2vw, 25px) / 1.28, `text-wrap: balance` | 700 | | Questions, the Encore question |
| `lead` | Atkinson | 18px / 1.38 | 600 | | The newest clue, options, suggestions |
| `body` | Atkinson | 17px / 1.5, at most 62 characters a line | 400 | | Explanations, prose |
| `body-sm` | Atkinson | 15px / 1.42 | 400 | | Earlier clues, secondary lines |
| `label` / `label-sm` | Atkinson | 17px / 15px, line height 1.2 | 700 | | Buttons |
| `meta` | Atkinson | 13px / 1.3 | 700 | +0.01em | Kickers, dates, counts |
| `micro` | Atkinson | 12px / 1.25 | 700 | | Axis labels, tags. The floor: nothing smaller |
| `host-code` | Fraunces | clamp(64px, 8.6vw, 168px) / 0.9 | 700 | +0.02em | Room code |
| `host-title` | Fraunces | clamp(32px, 3vw, 64px) | 650 | | Host headings |
| `host-question` | Atkinson | clamp(40px, 3.4vw, 72px) / 1.18 | 700 | | 65 px at 1080p (PRD floor 48) |
| `host-answer` | Atkinson | clamp(28px, 2.2vw, 48px) / 1.2 | 600 | | 42 px at 1080p (PRD floor 36) |
| `host-body` | Atkinson | clamp(18px, 1.35vw, 30px) | 600 | | Host secondary text |

### 3.3 Rules

- **Data numerals are Fraunces.** Atkinson's zero is always slashed (no feature removes it), which looked technical in "10", "320" and on chart axes. Scores, counts, guesses, answers, axis labels, timers on the host screen and the room code are set in Fraunces lining figures (a `num` class or a `<Num>` component). Numbers inside prose sentences stay in Atkinson.
- **Tabular figures where digits change in place.** Atkinson has `tnum` and it works in the DOM: at 40 px, "1111" and "8888" both measure 101.1 px with `tabular-nums` (70.4 and 99.8 px without). The exploration measured no difference because a canvas ignores CSS font features. So the phone stopwatch and Atkinson count-ups use `font-variant-numeric: tabular-nums`. Fraunces has no tabular figures, so Fraunces count-ups set each digit in a fixed 0.62 em cell, and the accessible label carries the plain value.
- **Italics only as a display flourish** in Fraunces ("and an Encore", "No. 42", the italic E). Never for emphasis or reading text, because italics slowed readers with dyslexia ([Rello and Baeza-Yates](https://doi.org/10.1145/2513383.2513447)). Emphasis is bold. Book and film titles stay roman.
- **No all caps anywhere**, including tags and buttons ([BDA](https://www.bdadyslexia.org.uk/advice/employers/creating-a-dyslexia-friendly-workplace/dyslexia-friendly-style-guide)).
- **Line breaks:** headlines and stems use `text-wrap: balance`; all running text uses `text-wrap: pretty`, so a single word never sits alone on the last line. Short tokens that must not split ("●●○ Medium", "Encore 4% off") are wrapped in a no-wrap span.
- **Readable text mode** (Settings) sets tracking to 0.05 em and line height to 1.6 on everything set in Atkinson, uses plainer, lighter paper and turns the grain off.
- **Answer names** always use the list's display form ("Heat (1995)", "Paris, France"), never truncated in options or reveals; suggestion rows may ellipsize the secondary line only.

---

## 4. Space, shape, elevation and layers

**Spacing** is a 4 px scale (Tailwind's default `--spacing: 0.25rem`): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Side gutters are `clamp(16px, 5.2vw, 20px)` (`p-gutter`), so 16 px at 320 and 20 px at 390. Answer options sit 12 px apart, cards 12 px apart, card padding 12 to 20 px.

**Targets:** answer options at least 56 px tall (built at 60), primary buttons 56 px, suggestion rows 48 px, every other control at least 44 by 44 px, with small-looking chips and links given a 44 px hit area by a pseudo-element. WCAG's floor is 24 px ([2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)); the prototype's audit checks 44.

**Radius**

| Token | Value | Used on |
|---|---|---|
| `xs` | 6 px | Progress segments, share squares |
| `sm` | 10 px | Letter badges, Daily progress pills |
| `md` | 14 px | Clue cards, small buttons, Next clue |
| `lg` | 16 px | Buttons, answer options, fields (the research's 16 px) |
| `xl` | 24 px | Cards and the ticket |
| `sheet` | 28 px | Sheets |
| `pill` | 9999 px | Chips, the streak chip, the stopwatch |

**Elevation: the ledge.** Every raised thing has a visible thickness: a solid band under it, like card stock, plus a soft contact shadow. No glass and no translucent panels behind text ([SYNTHESIS §8.9](./research/SYNTHESIS.md)).

| Level | Build | Used on |
|---|---|---|
| e0 | Hairline `rule` only | Ledger rows, dividers |
| e1 | 1 px `rule` border, 3 px `ledge`, `shadow-soft` | Cards |
| e1+ | 1.5 px `rule-strong` border, 4 px `ledge` | Buttons, options, Next clue |
| e2 | 4 px `ticket-ledge` and a larger shadow | The ticket, the share card, the join ticket |
| e3 | Top hairline and `shadow-sheet` cast upward | Sheets and the results dock |

On press, an element moves down 2 px while its ledge shrinks from 4 to 2 px, so its bottom edge stays put and it feels pushed into the page. In dark mode the ledge is darker than the surface and borders do most of the lifting.

**Layers** (`--kn-z-*`): raised 1, sticky 10, banner 20, sheet 30, toast 40, dialog 50. The system keyboard and browser chrome sit outside this stack; layouts account for them (§10.3).

---

## 5. Iconography

**Set: [Lucide](https://lucide.dev)** (ISC licence; some icons derive from Feather, MIT). 24 px grid, 2 px stroke, round caps and joins, open shapes, which matches Fraunces' soft terminals. In the app use `lucide-react` with per-icon imports so only the icons we use ship; the prototype's sprite keeps the same names (`i-<lucide-name>`). The licence goes on `/credits`.

- Sizes: 24 px (default), 20, 18 and 14. At 18 px and below the stroke thickens (2.3 at 18, 2.8 at 14) so small icons keep their weight.
- An icon never carries a state alone: the check comes with "Correct answer", the X with "Your answer". Icon-only buttons have accessible names that start with their visible meaning.
- Fills only for the star (best moment), the pressed heart and the dot of the mark.

**Core mapping**

| Meaning | Lucide | Meaning | Lucide |
|---|---|---|---|
| Today tab | `calendar-days` | Practice tab | `layers` |
| Groups tab | `users` | Me tab | `user-round` |
| Settings | `settings` | More (in play) | `ellipsis` |
| Leave, close | `x` | Correct / wrong | `check` / `x` |
| Next clue | `arrow-down-to-line` | Guess with Enter | `corner-down-left` |
| Stopwatch, timers | `timer` | Sound on / off | `volume-2` / `volume-x` |
| Freeze | `snowflake` | Best moment | `star` (filled) |
| Encore, bullseye | `target` | Challenge | `swords` |
| Share | `share` | Copy | `copy` |
| Learn more | `book-open` | Report | `flag` |
| Heart | `heart` | Offline | `wifi-off` |
| Incident | `triangle-alert` | Info | `info` |
| Lock / unlock room | `lock` / `lock-open` | QR join | `qr-code` |
| Rename | `pencil` | Remove player | `user-x` |
| Shuffle name | `shuffle` | Podium | `trophy` |
| Host screen | `monitor` | Phone | `smartphone` |

**Answer-type icons** (suggestion rows and type labels): country `earth`, city `map-pin`, person `user`, film `film`, TV series `tv`, book `book`, animal `paw-print`, chemical element `atom`, landmark `landmark`, music artist `music`, dish or drink `utensils`, sport or game `trophy`.

**Category icons:** Geography `earth`, History `scroll`, Science & Tech `flask-conical`, Nature & Animals `leaf`, Film & TV `film`, Music `music`, Art & Design `palette`, Books & Literature `book-open`, Sport & Games `dumbbell`, Food & Drink `utensils`, Language & Words `languages`, Society & Culture `drama`.

**Our own glyphs**, drawn on Lucide's rules:

- **Tally** (`i-tally`): four strokes and a gate. The streak is a count of days, so no flame. It replaces the "streak flame" everywhere.
- **Difficulty pips:** one, two or three inked dots (●○○ easy, ●●○ medium, ●●● hard), always followed by the word. They go from sparse to dense as rounds get harder, so they read without colour, and they recur on the ticket, the round kicker, results rows and the room setup.
- **Room answer shapes:** A circle, B triangle, C square, D diamond, drawn in ink beside the letter on the host screen and on phones, so the big screen reads without colour (PRD §3.8.3).
- **The newt mark** (§1.5).

---

## 6. Components

Each component lists anatomy, sizes, states and the rules engineers can't infer from the screenshots. Class names refer to the prototype ([styles.css](./design/final/styles.css)).

### 6.1 Buttons

| Variant | Look | Use |
|---|---|---|
| **Primary** | `primary` fill, `on-primary` label, `primary-ledge`, 56 px, radius `lg`, label 17/700 | One per screen. "Play today's Daily", "Lock in", "Continue", "Done for today", "Start the quiz" |
| **Secondary** | `surface` fill, 1.5 px `rule-strong` border, 4 px `ledge` | Everything else that matters: Share, Challenge, Quick play, offer-card actions |
| **On the ticket** | Ink fill and cream label in light; cream fill and charcoal label in dark | The Daily's Play and the join ticket |
| **Ghost** | No fill until hover (`surface-2`), icon plus label, 44 px | Learn more, Report, I liked this, Rename |
| **Danger** | `incorrect` fill, `on-incorrect` label | Only "Delete my data" and "Delete quiz", always behind a confirm step |
| **Text link** | Ink text, 2 px eft underline offset 3 px, 44 px hit area | "Choose a category", "Review clues and the why" |
| **Icon button** | 44 by 44, radius 12, icon 24 | Leave, close, settings, more |
| **Small** | 44 px tall, radius `md`, 3 px ledge | Inside cards |

States: **hover** (pointer devices only) lightens secondary to `surface-2`; **pressed** sinks 2 px and halves the ledge on `pointerdown`, and the action fires on `click`, so sliding off cancels ([2.5.2](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html)); **focus** is a 3 px `focus` ring at 3 px offset, `focus-on-ticket` on the ticket; **disabled** is `sunken` fill, `ink-3` label and `rule` border, with `aria-disabled` when the control must stay focusable to explain why; **busy** keeps the label, adds a 16 px spinner after it and sets `aria-busy`, and after 1.5 s the label becomes "Checking…". Labels never wrap on phones; if a label can't fit at 320 px, the row stacks.

### 6.2 Answer options, every state

Full width minus gutters, at least 56 px tall (built at 60), 12 px gaps, 18 px left-aligned text that wraps and grows the button, letter badge A to D (36 px, radius 11, Fraunces). On phones the stem sits in the upper 40% and answers in the lower 55%; from 768 px a 720 px column, 2 by 2 only when every option is under 24 characters ([SYNTHESIS §8.2](./research/SYNTHESIS.md)).

| State | Fill / border | Badge | Text | Words | Other |
|---|---|---|---|---|---|
| Idle | `surface` / 1.5 px `rule-strong`, 4 px ledge | Letter on `sunken` | `ink` 18/600 | | |
| Hover (pointer) | Border `ink-2` | | | | |
| Keyboard focus | Focus ring outside the border | | | | Keys A to D pick while focus is on an option or its group; digits 1 to 4 only where no option is a number (memo D6, D20). On a Mystery's options the group takes focus as they appear (D28), and a key only chooses: Enter on the chosen option, or the Lock in bar, locks in (D31). A third letter or digit since focus came to the options makes a typed word at any pace: the keys then choose nothing, Enter locks nothing and the legend line reads "Typing chooses nothing. Press Esc, then A to D." (spoken once) until Escape, Tab or a pointer; the line holds room for all three of its wordings, so nothing moves |
| Pressed | Border `ink`, sinks 2 px, ledge 2 px | | | | Same frame as `pointerdown` |
| Chosen (clue 4, D31) | The pressed look held: border `ink`, sunk 2 px | Letter in the page's colour on an `ink` badge (the system highlight in forced colours), so the mark is a fill, never a hue alone | | | `aria-pressed="true"` on the chosen option only. A tap, a click, Space or a letter key; nothing is sent. Choosing another option moves it, Tab leaves it. Said once: "Cobalt chosen.", with "Enter locks it in." after a key |
| Locked in | 2.5 px `selected` border | | | | By 150 ms; 10 ms haptic if on |
| Checking (sealed) | Locked look held | | | "Checking…" under the question after 1.5 s | The verdict waits for the server |
| **Correct** | `correct` fill / 2 px `correct-line`, `correct-ledge` | Check, stamped in, `on-correct` badge | `on-correct` | "Correct answer" in an outlined pill | |
| **Your wrong pick** | `incorrect-tint` / 2 px `incorrect-line` | X, stamped in, `incorrect` badge | `ink`, never struck through | "Your answer" in `incorrect-text` | 6 px, two-cycle shake |
| Other options after reveal | `surface` / `rule`, sinks 2 px | Letter, outlined | `ink-2` (8.98:1), never opacity | | |
| Already guessed (clue 4) | `sunken` / `rule`, no ledge | Letter | `ink-3` | "Already guessed" | `aria-disabled` |
| Offline (sealed modes) | As idle but `aria-disabled` | | | | The alert explains |
| Forced colours | 4 px double border for correct, 3 px dashed for wrong, 1 px solid for others | Icons stay | `CanvasText` | Words stay | Grain off |
| High contrast | Blue fill for correct, orange tint for wrong | Same icons | | Same words | |

True/false shows two options reading "True" and "False"; comparison shows two large options naming each item, stacked on phones and side by side from 768 px.

**The Lock in bar (clue 4, memo D31).** One primary button under the four options, inside their group and after them for Tab and a screen reader. It is sticky at the bottom of the screen while the options are in view, on `bg` with a top hairline, bleeding over the 16 px gutters and padded for the safe area; its height is the page's bottom scroll inset, and toasts rise above it. Before a choice it reads "Lock in" and is disabled but still focusable; then "Lock in Cobalt". The label keeps to one line and a long name ends in an ellipsis (the whole name stays the button's accessible name), so the bar is the same height before and after a choice. While the pick is judged it is busy and the options wait. On arrival at clue 4 the page scrolls so the options show under the clue as far as the clue's top allows; where the whole group (lead line, legend, four options and the bar) fits under the header, the group wins and the clue's first lines go under the header instead, so no option sits under the bar (390 by 844 at 150% text). Where the group is taller than the screen (360 by 640 at 150%, 390 by 844 at 200%), the bar covers part of an option until the player scrolls, and that is accepted: the bar never covers the lead line or the legend, and the page never scrolls after a tap, since a scroll could put another option, or the bar, under a second tap. A key that moves focus to its option scrolls it clear of the bar, as focus does anywhere. Leaving the Daily and coming back (Continue) returns to the options with focus on their group and nothing chosen, as a reload does.

**The two legends (memo D32).** One line above the options, the group's description, holds either "Tap one, then Lock in." or, once a keyboard is in use, "Keys A to D choose. Enter locks in." The line reserves the taller wording's room, so the change moves nothing. Practice's "Keys A to D answer at once.", the reveal's "Enter continues." under its button and the Encore's "Enter locks in." beside the preview follow the same rule: shown once a key has been pressed or the primary pointer is a mouse or a trackpad, never on a touch-only phone.

### 6.3 The clue ladder and the worth scale

**Ladder.** A 2 px rail runs down the left past numbered rung circles (30 px, Fraunces). The rail is solid ink up to the current rung and dashed below it.

| Rung state | Look |
|---|---|
| Past clue | Circle on `sunken`; clue in `body-sm` `ink-2`; a wrong guess made on it shows as a **stamp** |
| Current clue | Ink circle; a card on `surface` with a 1.5 px ink border, 3 px ledge and radius `md`; clue in `lead` 18/600; a "New" tag in `play-accent` on its top edge ("Last clue" on clue 4) |
| Next slot | Dashed circle; holds the **Next clue** button, which is replaced by the new clue in place |
| Compact (clue 4 shown) | Earlier clues drop to 14 px so the four options fit |

**Stamp** (a wrong guess): "× Not Mary Shelley" in `incorrect-text`, 2 px `incorrect-line` border, radius 7, on `surface`, rotated −2.5°, 13/800. The name stays readable; nothing is struck through.

**Next clue button:** secondary style, 48 px tall, radius `md`, `arrow-down-to-line` icon, label "Next clue" on the left and "then worth 2" in `ink-2` on the right. On clue 3 it reads "Last clue and options · then worth 1". It is always enabled.

**Worth scale** (top right of the Mystery header): the four values 4 3 2 1 in Fraunces 17, the spent ones struck with a 2 px `ink-2` line, and a 33 px `play-accent` disc behind the current value, which switches to `on-play-accent` at 20 px. "points now" sits under it in `micro`. Accessible as one image: "Worth 3 points if you solve it now. Each clue costs a point: 4, 3, 2, 1."

**Reveal clue list** (after a Mystery resolves): all four clues in compact rows. The solving clue sits on `correct-tint` with a 1.5 px `correct-line` and "✓ Solved here"; clues where a guess was made say "You guessed Mary Shelley"; unneeded clues have a dashed border and "Not needed".

### 6.4 The guess combobox and suggestions

Follows the ARIA 1.2 combobox pattern with a listbox popup ([PRD §3.12.3](./PRD.md); [APG](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) [K]).

**Anatomy:** a 58 px field with a 2 px ink border and a soft `play-accent` glow when focused; search icon; floating label "Your guess" in `micro` with the placeholder "Start typing a person"; typed text 19/700; a 44 px clear button; and the **Guess** button inside the field's right edge (primary, 44 px, disabled until a suggestion is selected). The listbox hangs from the field with the same border and a 4 px ledge.

**Rows:** 48 px, answer-type icon in `ink-3`, the name with the typed letters in bold (`<mark>`, which forced colours paints as a highlight), and a right-aligned disambiguation in `ink-2` 14/600 ("Oregon, US", "mathematician", "1995"). The active row gets `accent-tint` in light, `surface-2` in dark, and a 4 px `play-accent` bar on its left edge, so the cue isn't colour alone. Already-guessed rows stay in the list, disabled, with "Already guessed" as the secondary text.

**Behaviour:**

- Up to 6 suggestions from the first character (PRD §4.1.3). The list never runs under the keyboard: its height is limited to whole rows that fit above the visual viewport's bottom edge (three rows on a 390 by 844 phone with the keyboard up), and it scrolls for the rest.
- Tapping a row (or Enter on the highlighted row) fills the field with the display name and closes the list; Guess becomes enabled. Editing the text clears the selection. With a selection, Enter submits.
- The Guess button keeps focus in the field on touch (it cancels the pointer-down blur), so the keyboard stays up after a wrong guess.
- Announcements: the count on each change ("4 people match"), and after a wrong guess the status message with the new clue's text.
- States: empty (placeholder, no list); typing (list); no matches ("No matches. Try another spelling, or tap Next clue."); list failed to load ("We couldn't load the suggestions. You can still use Next clue and pick from four options at the end."); submitting (Guess shows a spinner, field read-only); offline (field and buttons `aria-disabled`, the alert shows); error ("We couldn't check that guess. Try again." under the field with Retry).

> **PRD change proposed (§3.1.4, wrong guess).** The PRD moves focus to the new clue's heading after a wrong guess. On a phone that closes the keyboard and forces an extra tap for every miss. This design keeps focus in the field and relies on the polite status message, which reads the new clue in full ("Not Heat. Clue 3: ..."). Focus does move to the new clue's heading after **Next clue**, because the button the player pressed is replaced by that clue.

### 6.5 The Encore numeric input

**Anatomy:** kicker "Encore · one number, the tiebreak" with the target icon; the question in `stem`; a unit line ("Answer in days. Closest guess wins the tiebreak."); an 84 px field with a 2 px ink border, the floating label "Your number", the value in Fraunces 44/700 lining figures, the unit on the right in `ink-2`, and a measuring-tape ruler along the bottom edge (minor ticks every 9 px, major every 45); a preview line under it ("You're answering **320 days**", polite live region); two hint chips ("Within 5% is a bullseye", "Within 15% is close"); and **Lock in**, the primary button, pinned just above the keypad.

**Input:** `inputmode="numeric"` (or `decimal` when decimals are allowed), parsing per PRD §4.2.1. Grouping appears in the preview, not in the field, so the caret never jumps.

| State | What shows |
|---|---|
| Empty | Field ready (focused on desktop), preview hidden, Lock in disabled |
| Typing, valid | Preview in words and digits, Lock in enabled |
| Invalid | Inline message in `incorrect-text` with an X icon under the field; Lock in disabled; the field border stays ink (no red flood) |
| Locking in | Spinner in Lock in, field read-only |
| Result | The result card (below) replaces the hints; Lock in becomes "See your results" |

**Result card:** "Your guess 320 days · Answer 334 days · 4% off", the band chip ("Bullseye" on `correct-tint` with a `correct-line` edge and the target icon, or "Close" on `sunken`, or nothing), and the **number line**: a 2 px track, the close band shaded, the bullseye band shaded with a `correct-line` edge, the answer as a 3 px ink tick and your guess as a 12 px `play-accent` dot with an inset line. Accessible name: "Bullseye means within 5% of 334. You said 320." The crowd line follows once 50 have answered.

### 6.6 Progress

- **Daily header:** four pills (38 by 30, radius 10, Fraunces), M1 to M3 and an italic E. Upcoming: outlined `rule-strong`. Current: 2 px ink border with a ledge. Solved: `correct` fill with a check. Missed: `incorrect-tint` with an X. Solved and current: the fill plus a 2 px ink outline. Each has a screen-reader label ("Mystery 2, solved on clue 2").
- **Practice:** ten 20 px segments (radius 6) with check or X icons once answered and a 2 px ink outline on the current one. The group's label says "Question 4 of 10. 3 right, 1 wrong so far."
- **Blitz timer:** a full-width 8 px bar that drains linearly, with a seconds label ("42 s") in tabular figures. At 10 s left it turns `warning` with 45° stripes, so the warning isn't colour alone. `aria-live="off"`.
- **Survival strikes:** three dashed X slots; a strike fills one with an `incorrect` X. Never hearts, never refillable.
- **Room countdown:** the same bar on the host screen and phones, amber and striped from 5 s, a seconds label, no pulse under reduced motion, "Host advances" in place of the bar when the timer is off.

### 6.7 The stopwatch

A 36 px pill (with a 44 px hit area) in the Daily header: `timer` icon and `m:ss` in tabular figures, `ink-2` on a `rule` border, `aria-live="off"`. Tapping it opens the More menu at "Hide stopwatch"; hidden, the space collapses and the choice persists everywhere. It pauses visually between rounds (reading never counts), and at 320 px the icon drops so the digits keep their room.

### 6.8 The streak mark (our flame)

The streak is a tally, never a flame: a flame borrows Duolingo's and Snapchat's symbol, and counting days is what a streak is.

- **Streak chip** (Today's top bar): a 38 px pill with two parts, the tally icon in `accent-text` plus the count in Fraunces, and the snowflake plus the freeze count in `on-freeze`. Accessible name: "Streak: 12 days. 1 freeze held. Open your streak." Hidden until the first finished Daily.
- **This week strip:** seven 28 px dots with day letters; played is an ink dot with a check, a freeze day is `freeze` with a snowflake, today is dashed `accent-text` on `accent-tint`, the future is a `rule` outline. Under it: "❄ 1 freeze ready" and "Best streak 23 days".
- **Streak sheet** (14-day strip): every day shows an icon **and** a word: Played, Repaired, Freeze, Protected, Missed, Today (AC-STK-05).
- **Record first:** after a break, the best streak and days played lead in `display-5`, and the current count is set no larger than body text (AC-STK-04).
- **Increment** (on the stop screen): a new tally stroke draws and the count rolls (§7.5). Milestones (1, 3, 7, 14, 30, 50, 100, 200, 365) become the best-moment stamp.

### 6.9 Toasts and status messages

- **Status region:** every screen has one visually hidden polite `role="status"` region for verdicts, counts, confirmations and errors. `role="alert"` is reserved for losing the connection during a sealed round.
- **Toast:** an ink pill (`primary` fill, `on-primary` text, icon on the left), 16 px above the tab bar or dock, max width 420 px, one at a time, 4 s, tap to dismiss, never covering a control. While a control sits under that place and none sits 16 px below the sticky header, the toast shows there instead, and moves back once the bottom is clear; when both places cover a control, it sinks toward the bar, to no less than 4 px above it. It checks again as the page changes, scrolls or resizes (RITE round 3, R3-08). It keeps clear of the page's H1 too, while the H1 is on screen (RITE round 4, R4-06): when both places cover a control or the H1, it takes the first gap under the top place that clears them all. Where there is room it also keeps off the titles inside the page (each `h2` in `main`, such as Today's "Continue Daily #42"), and falls back to the rules above when nothing clears them. On the stop screen that first gap is flush under "Daily #42", over the date line, which is accepted: anything lower is the stamp or the score. It mirrors its text into the status region. Undo toasts (the editor's delete) stay 10 s with an "Undo" text button.
- Toasts confirm: "Copied. Paste it into your group chat.", "Saved", "Report sent", "We'll send this when you're back online." Errors never use a toast; they sit next to what failed. One exception, with the offline icon: "How to play didn't load. Check your connection and try again.", because the menu item that asked for the sheet has closed and there is nothing left to sit beside.

### 6.10 Sheets, dialogs, offer cards and banners

**Explanation sheet** (every reveal): `surface`, radius 28 at the top, a 36 by 4 grab handle, `shadow-sheet`. Contents in order: the verdict row (badge plus "Not quite" or "Right", with the crowd stat on the right: a 52 px bar and "58% got this one"), the title (`display-3`, "It's Uranus."), the explanation (`body`, 35 words or fewer, the answer word highlighted: an `accent-tint` marker wash in light, a 3 px eft underline in dark), one row of ghost actions (I liked this, Learn more, Report), and Continue. It rises into space the layout reserved, so nothing above it moves. On short phones (under 740 px tall) it opens compact (verdict, title, the first line of the explanation, Continue) with "Read more" to expand, and it never covers the correct option or the player's pick.

**Dialogs:** a bottom sheet on phones, centred (max 480 px) from 768 px, `scrim` behind, focus trapped, Escape closes, title in `display-5`, body in `body`, actions at the bottom (primary first on phones, right-aligned on desktop). Used for the report sheet ("What's wrong?" with five reasons as 48 px radio rows and an optional note), the age band ("How old are you?" with three 56 px choices), nickname ("What should your friends see?"), confirms (delete, restore over existing progress) and the streak sheet.

**Offer card** (stop screen, at most one): a card with an icon tile, a title in `display-6`, one line, a **secondary** action and "Not now" as a text link. Never primary-styled, because "Done for today" is the only primary on that screen (AC-DLY-14).

**Incident banners** sit under the top bar as a polite status region: neutral (`sunken` fill, info icon) for degraded and offline; `caution` fill with a `caution-line` edge and the alert icon for outage and unreachable; maintenance neutral with a clock. A banner known at load renders in place; a late one slides in as an overlay, so nothing shifts (AC-INC-05). Degraded and maintenance banners can be dismissed for an hour.

### 6.11 Sharing

**The share text** (decision 2's shape; the PRD fixes the semantics and this section fixes the bytes):

```
Knewt Daily #42 · 9/12 · Encore 4% off 🎯
Geography ✅⬜⬜⬜
History 🟧✅⬜⬜
Film & TV 🟧🟧✅⬜
https://knewt.app/s/42/k3x9q
```

| Rule | Detail |
|---|---|
| Glyphs | 🟧 a clue you used (a wrong guess or Next clue), ✅ the clue that solved it, ⬜ a clue you never needed, ❌ a miss, which ends 🟧🟧🟧❌ (memo D3, D22) |
| Why ✅ and not 🟩 | ✅ renders as a green square with a white check in Noto Color Emoji (checked in this session's chat render) and, as far as we know, on Apple and Microsoft platforms [K], so the mosaic stays square while a solve survives colour blindness and greyscale. A row of four squares that differ only by hue can read the same to a protanope; a row that ends in ✅ can't. Nothing is painted red since memo D3: a used clue is 🟧 |
| Why ⬜ and never ⬛ | A black square vanishes in dark-mode chats ([checks/share-text-chat.png](./design/final/checks/share-text-chat.png)) |
| High-contrast set | 🟧 used, 🟦 solved, ⬜ unused, ❌ missed (it reads by shape, D22), when the player's setting is on |
| Row names | The category's short name, then one space, then the squares. Words first, because screen readers read squares one by one |
| Short names | Geography, History, Science & Tech, Nature, Film & TV, Music, Art & Design, Books, Sport, Food & Drink, Words, Society |
| Line one | `Knewt Daily #42 · 9/12 · Encore 4% off`, plus ` 🎯` inside the bullseye band. Encore tokens: "Encore 4% off", "Encore under 1% off", "Encore over 999% off", "Encore 3 years off", "Encore spot on". Archive: `Knewt Daily #40 (archive) · ...` |
| Voided Mystery | `History · voided` (words only; the score already includes its 4 points) |
| No-break spaces | U+00A0 inside "Daily #42", "9/12" and "Encore 4% off", so a narrow bubble breaks between tokens, never inside one |
| Never | An answer, a clue, a percentile, a streak or a time (PRD §3.5.1). The link is path-only, last |

Device tests before M3 exits (PRD Q5): VoiceOver and TalkBack read the block, in particular whether "9/12" is read as a date and "·" as "middle dot"; if either happens, switch to "9 of 12" and commas.

Other share strings (PRD copy): challenge "I scored 9/12 on Knewt Daily #42. Can you beat me?"; group invite "Join our Knewt Group, Uni lot, and compare Daily scores."; practice "Knewt Practice · Geography · Hard · 8/10", "Knewt Blitz · 1,240 points in 60 s", "Knewt Survival · 31 correct".

**The score card's rows** (stop screen) sit with their legend on an inset inside the orange card: cream with ink in light (`card-inset`, `on-card-inset`), charcoal with cream ink in dark. On charcoal every share glyph holds at least 4:1; on a dark-theme cream 🟧 was about 2.1:1 and ⬜ 1:1. In light, 🟧 keeps about 2.3:1 and ⬜ shows by its grey outline, as in a light chat (R2-09, memo §26).

**The Share button** (stop screen, secondary style) shows a 4 by 3 mini grid of the player's own result inside it (6 px squares in the share colours), so it previews what will be posted. Web Share with the clipboard as fallback, then a selected read-only text box with "Copy this text" if both fail. `share_complete` fires only when the share resolves or the copy succeeds.

**The preview image** (`/s/{n}/{code}/opengraph-image`, [screens/share.png](./design/final/screens/share.png)):

- 1200 by 630, flat colour (no grain), measured at 87,842 bytes for the sample.
- Everything that matters sits inside the central 630 by 630 square (x 285 to 915), because some chats crop to a square. Outside it: only the big newt peeking in and two stacked ticket stubs.
- The card (600 by 550, cream, radius 26, a 6 px ledge) holds the wordmark (SVG outline), "Daily No. 42", the date, the score with the drawn eft slash, the grid with row names that match the share text, the Encore pill, a legend ("solved", "clue used"), the line for strangers ("Three mysteries a day. How few clues do you need?") and "Play today's Daily at knewt.app".
- One font (the PRD's limit): Fraunces only, as a static 650 TTF instance subset to the template's characters, because the image renderer can't read variable woff2. Same light card in every chat theme.
- It never shows an answer, a clue, a percentile or a time; it is drawn from the URL alone.
- Alt text: "Knewt Daily number 42 result: 9 out of 12. Geography solved on clue 1. History solved on clue 2. Film and TV solved on clue 3. Encore 4% off, a bullseye."

### 6.12 Charts

All charts sit on `surface`, use `chart-bar` for everyone else and `chart-you` with a 2 px inset `chart-you-line` and a 45° hatch for the player, label the player's bar "You", set axis numerals in Fraunces 12, and ship a visually hidden table with the same numbers (AC-STA-03). No chart animates on reduced motion.

| Chart | Where | Spec |
|---|---|---|
| How everyone did | Stop screen | 13 bars (0 to 12), 64 px tall, 4 px gaps, axis labels at 0, 3, 6, 9, 12, "4,812 players" top right. Built from the same counts as the percentile, so they can't disagree |
| Crowd by clue | Mystery reveal | Five bars (clue 1 to 4 and ×), each with its percentage above and the label below; the player's bar hatched with "2 · you" |
| Encore buckets | Encore reveal | Four bars: Bullseye, Close, 15 to 50% off, more than 50% off (years: within 2, within 5, 6 to 20, more than 20) |
| Score history | `/me` | The last 30 Dailies as bars, the 12-point line dashed, today outlined |
| Solves by clue, category accuracy | `/me` | Horizontal bars with the count of distinct questions at the end ("74% · 112 questions") |
| Number line | Encore result, results row | §6.5 |
| Mini grid | Share button, Today's finished card, share landing | 6 to 8 px squares in the share colours |

### 6.13 Navigation

- **Phones:** a bottom tab bar on `surface` with a top hairline: Today, Practice, Groups, Me; 48 px targets, label 12/700, the active tab in `ink` with a 28 by 3 eft bar at its top edge. Safe-area padding at the bottom.
- **768 px and up:** a top bar with the wordmark at the left and the four destinations as text tabs (the active one underlined in eft), streak chip and settings at the right.
- **Top bar (phones):** 54 to 56 px; on Today the wordmark, streak chip and settings; elsewhere a title (`display-6` with a `meta` line under it) between icon buttons.
- **Focus mode** (Daily, practice run, challenge, room, user quiz): the tab bar hides; the header keeps only Leave, progress, the stopwatch where relevant and More (Sound, Hide stopwatch, High-contrast feedback, Reduce motion, All settings).
- **Leave's tooltip** (RITE round 4, R4-04): the X shows only an icon, so what leaving does, the second sentence of its accessible name ("Your progress is saved, and the stopwatch keeps running."; on a reveal, "Your progress is saved."), shows in a tooltip under it on hover and on keyboard focus. The pointer may move onto it, Escape puts it away without moving focus (WCAG 1.4.13), and it is hidden from screen readers, which have the words in the name.
- **Skip link** first in every page ("Skip to content"), visible on focus.
- **Footer** on Today and Me: the seven legal and trust pages as 44 px links.

### 6.14 Cards and labels

- **The ticket:** `ticket` fill, radius 24 at the outer corners, two 12 px punched notches at the tear line, a 2 px dashed tear line in `on-ticket` at 42%, and a 4 px `ticket-ledge`. Top part: kicker and the italic number; title; the one-line explainer; four answer-type cards (number, pips, type and difficulty word; the Encore card inverted). Stub: meta line and the primary button. At 200% text the four cards fall into a 2 by 2 grid (a container query on the ticket's width in em).
- **Row card** (challenges, a Group, Host a quiz night): a 40 px icon tile on `sunken`, a title and one line, a count badge (`accent` with `on-accent` text) or a chevron.
- **Beta label:** a 22 px outlined label in `ink-2`, "Beta", next to the feature's name. Never orange.
- **Category tile** (`/practice`): 2 columns on phones, 3 at 768, 4 at 1024; icon, name, mastery tier word if any.

### 6.15 Host-screen components

- **Join ticket:** the ticket component at room scale: "Join on your phone", "knewt.app/join", "Room code" and the code in `host-code` as two groups of three digits; the stub holds the QR on a cream tile (always dark modules on cream, a four-module quiet zone, error correction M) and "Or scan to join · No app and no account. Up to 20 players."
- **Player chip:** a 64 px card with an initial disc, the generated name and an optional second line ("Renamed by you", "Just joined"), and a 44 px "more" button (Rename, Remove). A disconnected seat is greyed with "Reconnecting" and stays listed.
- **Answer tile** (host): letter badge plus shape, the answer text in `host-answer`, never colour-coded by position; at the reveal the correct tile fills `correct` with a check and the others dim; distribution bars grow under each tile.
- **Timer:** §6.6. **Standings:** the top five as rows with rank, name and points, the leader's row carrying a "Leading" stamp (no colour code). **Podium:** three stepped plinths in paper with the top three names, confetti allowed (it is a party).

---

## 7. Motion

### 7.1 Principles

1. **Paper moves like paper.** Things lift, sink, unfold and get stamped. Nothing spins, nothing overshoots more than once, and apart from sheets nothing travels more than 10 px.
2. **Ink marks the verdict.** Checks and crosses are stamped; the rail inks down; a new tally stroke is drawn.
3. **Quick to acknowledge, slow to explain.** The press shows in the same frame, the verdict lands at 400 ms, and the explanation waits for the player, because 35 words take about 9 seconds to read ([Brysbaert](https://doi.org/10.1016/j.jml.2019.104047)).
4. **Always optional.** `prefers-reduced-motion` and the in-app setting (either way) turn movement into short fades; nothing flashes more than three times a second ([2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html), [2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)). Durations sit in NN/g's 100 to 500 ms band ([NN/g](https://www.nngroup.com/articles/animation-duration/)).
5. **Celebration scales with success.** A stamp and a chime for a solve, a drawn stroke for a streak day, confetti only for a perfect Daily ([SYNTHESIS §8.6](./research/SYNTHESIS.md)).

The first bundle uses only CSS transitions, `@starting-style`, the Web Animations API and same-document View Transitions (PRD §8.1). Every translate is multiplied by `--kn-motion-distance`, which is 0 under reduced motion.

### 7.2 Tokens

| Token | Value | Use |
|---|---|---|
| `dur-press` | 90 ms | Press and release |
| `dur-lock` | 120 ms | Lock-in border |
| `dur-quick` | 160 ms | Small fades and pops |
| `dur-base` | 240 ms | Stamps, dimming, tags |
| `dur-reveal` | 320 ms | Answer fills, clue unfold, the points marker |
| `dur-sheet` | 360 ms | Sheets |
| `dur-count` | 500 ms | Count-ups |
| `dur-celebrate` | 900 ms | The longest automatic flourish short of confetti |
| `dur-fade` | 140 ms | Every reduced-motion substitute |
| `ease-out` | cubic-bezier(0.22, 1, 0.36, 1) | Things arriving |
| `ease-in-out` | cubic-bezier(0.65, 0, 0.35, 1) | Things travelling: the rail, the shake |
| `ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) | Stamps and the marker: one small overshoot |
| `ease-press` | cubic-bezier(0.3, 0, 0.5, 1) | Press and release |
| `ease-exit` | cubic-bezier(0.4, 0, 1, 1) | Things leaving |

### 7.3 Choreography: the answer reveal

All tap-to-answer screens (practice, clue 4, room phones, user quizzes). Frames: [checks/motion-answer-reveal.png](./design/final/checks/motion-answer-reveal.png).

| From | Element | What happens | Duration, easing |
|---|---|---|---|
| 0 ms | The pressed option | Sinks 2 px, ledge 4 to 2 px, border to ink, on `pointerdown` | 90 ms, press |
| By 150 ms | Same | Locked in: 2.5 px `selected` border; 10 ms haptic if on | 120 ms, out |
| 150 to 400 ms | Everything | The suspense beat. Sealed modes wait here for the server; "Checking…" after 1.5 s | |
| 400 ms | Correct option | Fills from surface to `correct`, text to `on-correct`, border and ledge follow | 320 ms, out |
| 400 ms | Your wrong pick | Fills to `incorrect-tint`, border to `incorrect-line` | 320 ms, out |
| 400 ms | Letters A and B | Fade out as the badges fill | 120 ms, linear |
| 400 ms | Other options | Dim to `ink-2` and sink 2 px | 240 ms, out |
| 400 ms | Progress segment | Fills with the verdict icon | 200 ms, out |
| 400 ms | Sound, haptic, status | Chime or thud; 20 ms or 30-40-30 ms; "Not quite. You chose Venus. The answer is Uranus." | |
| 420 ms | Wrong pick | Shakes 6 px, two cycles | 300 ms, in-out |
| 440 ms | Badges | Check and X stamp in from 1.4 times size and 10° | 240 ms, spring |
| 400 to 900 ms | Score | Counts up in tabular figures | 500 ms |
| 600 ms | Tags | "Your answer" and "Correct answer" rise 4 px and fade in | 240 ms, out |
| 1,200 ms | Explanation sheet | Rises from below into reserved space | 360 ms, out |
| Until tapped | Sheet | Stays; a tap anywhere completes the automatic part at once | |

Reduced motion: no shake, no scale, no rise; fills cross-fade over 140 ms, stamps appear, the sheet fades in place, the score shows its final value.

### 7.4 Choreography: the clue reveal

A wrong guess or Next clue. Frames: [checks/motion-clue-reveal.png](./design/final/checks/motion-clue-reveal.png).

| From | Element | What happens | Duration, easing |
|---|---|---|---|
| 0 ms | Suggestion list | Folds away (wrong guess) | 120 ms, exit |
| 0 ms | Stamp | "Not Mary Shelley" pops onto the clue it was tried on, from 1.4 times and +12° to −2.5° | 220 ms, spring |
| 0 ms | Sound | Felt thud (wrong guess) or paper slide (Next clue) | |
| 120 ms | Rail | Ink runs down from rung 1 to rung 2 | 240 ms, in-out |
| 200 ms | Rung 2 number | Fills ink | 160 ms |
| 260 ms | Clue card | Unfolds in its slot: fades in, drops 10 px, scaleY 0.9 to 1 | 320 ms, out |
| 300 ms | Worth scale | The 4 is struck; the marker slides one step to 3 | 320 ms, spring |
| 460 ms | Worth scale | The 3 turns `on-play-accent` | 160 ms, linear |
| 560 ms | "New" tag | Rises in | 200 ms, out |
| 560 ms | Status | "Not Mary Shelley. Clue 2 is in. Now worth 3." | |

The field clears and keeps focus throughout, so typing never waits on the animation. Reduced motion: the stamp, card and tag fade in over 140 ms, the rail and marker jump.

**Mystery solved:** at the verdict the reveal card replaces the clue screen with a View Transition cross-fade (200 ms); "Knew it." stamps in at 440 ms (240 ms, spring), "+3" counts up from 400 to 900 ms, and the solve arpeggio plays one note per point earned. **Missed:** no stamp, no shake; the answer fades in at 400 ms with "This one got away."

### 7.5 Choreography: the streak increment

On the stop screen, when the finish extended the streak:

| From | Element | What happens | Duration, easing |
|---|---|---|---|
| 600 ms | Tally icon in the score card | A new stroke draws (stroke-dashoffset 1 to 0) | 320 ms, in-out |
| 640 ms | Count | The old number slides up 8 px and fades; the new one rises from 8 px below | 240 ms, out |
| 640 ms | Sound | A pencil tick | |
| 700 ms | Milestone (if any) | The best-moment stamp reads the milestone and stamps in | 280 ms, spring |
| 760 ms | Freeze earned (if any) | The snowflake pops from 0.6 to 1 and "You earned a freeze" joins the status message | 240 ms, spring |

The chip on Today updates without animation next time; the player has already seen it. Reduced motion: the number cross-fades and the stroke appears.

### 7.6 Choreography: results and the perfect Daily

| From | Element | What happens | Duration, easing |
|---|---|---|---|
| 0 ms | Screen | Cross-fades in from the Encore result (View Transition) | 200 ms |
| 0 ms | Score card | Rises 8 px | 240 ms, out |
| 120 ms | The eft slash | Draws from bottom to top | 200 ms, out |
| 120 to 620 ms | Score | Counts up from 0 to 9 in fixed digit cells | 500 ms |
| 300 ms | Share squares | Stamp in row by row, 50 ms apart in a row, 120 ms between rows | 120 ms each, spring |
| 600 ms | Streak | §7.5 | |
| 700 ms | Best-moment stamp | Lands at −2° | 280 ms, spring |
| 800 ms | Percentile line | Fades up | 240 ms, out |
| 860 ms | Histogram | Bars grow from the baseline, 15 ms apart; "You" appears last | 360 ms, out |
| 1,200 ms | Round rows | Fade up 40 ms apart | 240 ms, out |

The automatic part ends by about 1.6 s and a tap completes it at once. **Perfect Daily (12 of 12):** at 900 ms the score card stamps down from 1.04 times, the "Daily complete" chord plays, and confetti in paper, ink and eft (small rectangles and tally strokes) falls once for 1.2 s. Confetti is lazy-loaded with `disableForReducedMotion: true`, because the library's default is false ([canvas-confetti](https://github.com/catdad/canvas-confetti)). Reduced motion shows everything at its final state with a 140 ms fade and no confetti.

### 7.7 Everything else

| Moment | Motion | Reduced |
|---|---|---|
| Continue to the next round or question | View Transition: old content fades and slides 12 px left, new content in from 12 px right, 200 ms; under 100 ms to the new stem (PRD §8.1) | 140 ms cross-fade |
| Sheet and dialog open / close | Rise 360 ms out / fall 240 ms exit; the scrim fades | Fade |
| Toast | Rises 8 px, 240 ms; leaves with a 160 ms fade | Fade |
| Late banner | Slides down from under the top bar as an overlay, 240 ms | Fade |
| Tab change | No animation (instant), focus to the page heading | |
| Ticket on Today, first paint | None; LCP must not wait for motion | |
| Room phase changes | Host: 320 ms cross-fades; reveal fills as §7.3; standings rows reorder with 320 ms moves | Fades only |
| Countdown bar | Linear, continuous; the amber state never pulses | Same, no pulse |

---

## 8. Sound: the writing desk

Sounds of a desk, not an arcade: a pencil tap, paper sliding, a wooden block, a small kalimba. Everything is synthesised in Web Audio, so there are no sample files and the whole module stays well under the 30 KB budget.

**Defaults** (decision 8, [SYNTHESIS §8.7](./research/SYNTHESIS.md)): effects are **off by default on phones** behind the visible speaker toggle, and the choice is remembered. The host screen starts with effects on. Music is a separate toggle, off by default, and never autoplays ([WCAG 1.4.2](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html)). No meaning is ever carried by sound alone.

**Engine:**

- One `AudioContext`, created on the first tap after sound is switched on (a context stays suspended until a gesture, [Web Audio](https://webaudio.github.io/web-audio-api/)). In Safari 16.4 and later its audio session defaults to "ambient", so it mixes with the player's own music instead of pausing it ([Audio Session](https://w3c.github.io/audio-session/)); confirm the silent switch on a device.
- Chain: every cue → its own gain → a master gain at 0.25 (−12 dBFS) → a compressor (threshold −18 dB, ratio 4, attack 3 ms, release 120 ms) → destination.
- Envelopes use `setValueAtTime` then `exponentialRampToValueAtTime` to 0.001 (never to 0). Peaks below are per cue, before the master gain.
- Noise is one 1 s white-noise buffer made at start-up and reused.

| Cue | Recipe | Envelope | Length, peak |
|---|---|---|---|
| Tap (press) | Noise through a band-pass at 2,800 Hz, Q 1.2 | Attack 2 ms, exponential decay to 18 ms | 20 ms, −24 dBFS |
| Suggestion picked | Sine 2,400 Hz | Attack 1 ms, decay 15 ms | 16 ms, −28 dBFS |
| Clue reveal | Noise through a band-pass sweeping 900 to 2,600 Hz (Q 0.8) over 110 ms; then at 120 ms a wood block: sine at 540 Hz (clue 2), 470 Hz (clue 3) or 410 Hz (clue 4) plus a triangle at 2.7 times that frequency, 12 dB down | Slide: attack 8 ms, gone by 120 ms. Block: attack 2 ms, decay 90 ms (partial 40 ms) | 220 ms, −20 dBFS. The block steps down as the points drain |
| Wrong (guess or pick) | Sine gliding 180 to 120 Hz over 120 ms, through a low-pass at 700 Hz, Q 0.7 | Attack 4 ms, decay to 140 ms | 140 ms, −18 dBFS. A felt thud, never a buzzer |
| Correct (practice) | Triangle G5 784 Hz, then D6 1,175 Hz 70 ms later; each with a sine an octave up, 14 dB down | Attack 5 ms, decay 220 ms (partial 120 ms) | Under 300 ms, −16 dBFS |
| Mystery solved | Kalimba arpeggio, one note per point earned: C6 1,047, D6 1,175, E6 1,319, G6 1,568 Hz, 60 ms apart. Each note: sine plus a triangle at 2 times, 10 dB down, low-passed at 5 kHz. A clue-1 solve adds a sine "ting" at 2,093 Hz | Attack 3 ms, decay 380 ms; ting decay 500 ms at −24 dBFS | 120 to 560 ms, −16 dBFS. You can hear how sharp you were |
| Encore close | Triangle E5 659 Hz, then G5 784 Hz 80 ms later | Attack 5 ms, decay 200 ms | 280 ms, −20 dBFS |
| Encore bullseye | C6, E6, G6 (1,047, 1,319, 1,568 Hz) 55 ms apart, then a 2,093 Hz ting with a 4 Hz tremolo (gain LFO ±15%) | Notes decay 260 ms; ting decay 500 ms | 700 ms, −16 dBFS |
| Streak stroke | Noise band-passed at 4 kHz | Attack 2 ms, decay 60 ms | 60 ms, −26 dBFS |
| Daily complete | C4 262, E4 330, G4 392, C5 523 Hz rolled 45 ms apart; sine plus triangle through a 2.4 kHz low-pass | Attack 10 ms, decay 1.1 s | 1.2 s, −18 dBFS, once per Daily |
| Sheets, toasts, tabs | Silence | | |

**Host screen** (effects on by default):

| Cue | Recipe | Envelope | Length, peak |
|---|---|---|---|
| Player joins | Sine gliding 660 to 990 Hz over 60 ms | Attack 2 ms, decay 120 ms | 130 ms, −20 dBFS |
| Answer locked | Noise band-passed at 1.8 kHz (12 ms) plus a sine at 1,200 Hz | Decay 30 ms | 35 ms, −26 dBFS; at most one per 120 ms so 20 phones never machine-gun |
| Countdown, last 5 s | Sine 1,200 Hz each second; the final second 900 Hz | Attack 2 ms, decay 25 ms | 25 ms each, −22 dBFS |
| Time's up | Sine 300 Hz wood block | Attack 2 ms, decay 150 ms | 160 ms, −18 dBFS |
| Reveal | Triangle G4 392, D5 587, G5 784 Hz, 90 ms apart | Attack 5 ms, decay 600 ms | 800 ms, −14 dBFS |
| Podium | Daily complete, then C6 E6 G6 55 ms apart | As above | 1.6 s, −14 dBFS |
| Lobby music (toggle, off) | A seeded music-box walk on C major pentatonic, triangle oscillators, 84 bpm, 16 bars looping | Each note attack 4 ms, decay 600 ms | −28 dBFS; stops on Start |

---

## 9. Haptics (optional)

`navigator.vibrate` works only in Chromium browsers on Android, after a user gesture; Safari has none and Firefox for Android ignores it ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate), [05](./research/05-ux-ui-best-practices.md)). So haptics are extras behind a Settings toggle (off by default), and the row only appears where the API exists (AC-SET-07).

| Moment | Pattern |
|---|---|
| Lock-in | 10 ms |
| Correct, Mystery solved | 20 ms |
| Wrong | 30, 40, 30 ms |
| Streak milestone | 20, 60, 20 ms |
| Room countdown | None (sound and the bar carry it) |

Nothing depends on a vibration, and nothing vibrates during the read beat or the explanation.

---

## 10. Layout and responsive rules

### 10.1 Breakpoints

Mobile first, using Tailwind's defaults; `md` (768 px) is the main switch.

| Range | Layout |
|---|---|
| 320 to 479 px | One column, 16 to 20 px gutters, bottom tab bar. The 320 px rules below apply under 360 px |
| 480 to 767 px | One column, content capped at 560 px and centred; tab bar stays |
| 768 to 1023 px | Top bar navigation; play screens in a 720 px column (`max-w-play`); answers in 2 by 2 only when every option is under 24 characters; key hints 1 to 4 shown |
| 1024 px and up | Today in two columns: the ticket and Practice on the left (7/12), the week, challenges and Groups on the right (5/12); pages capped at 1120 px (`max-w-page`); reading pages at 640 px |
| Host screen | Its own layout (10.4), from 1024 by 576 up to 3840 by 2160 |

### 10.2 Phones

- `100dvh` screens with `env(safe-area-inset-*)` on the top bar, tab bar and dock.
- Play screens keep the question in the upper 40% and answers in the lower 55%, where thumbs reach best ([Hoober via UXmatters](https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php) [K]). Buttons never move between questions.
- The results dock is sticky at the bottom with "Done for today"; the scroller gets `scroll-padding-bottom` equal to the dock's height, so a focused element is never hidden under it ([2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)).
- **Short phones (700 px tall or less):** Today tightens its gaps and the ticket's padding and sets the greeting at 26 to 30 px, so Play and Quick play stay above the fold at 360 by 640.
- **Under 360 px:** Daily progress pills shrink to 32 px and the stopwatch drops its icon; the worth scale shrinks to 25 px steps; two-button rows stack; the ticket's meta line stacks; the Practice card stacks its actions under the text; the number line narrows to 84 px.
- Every screen was captured at 320 px wide with no horizontal scroll ([checks/reflow-320-*.png](./design/final/checks/)).

### 10.3 The keyboard

Typing is the format's main risk ([SYNTHESIS §6.1](./research/SYNTHESIS.md)), so the Mystery layout is budgeted with the keyboard open: at 390 by 844 with a 291 px keyboard, the current clue, the Next clue button, the field and three whole suggestion rows fit in the 553 px left. Use the VisualViewport API to size the list and keep the field in view; in Chromium, `interactive-widget=resizes-content` in the viewport meta helps. The Encore pins Lock in directly above the number pad. The in-app browsers of WhatsApp and Instagram shrink the viewport differently from Safari; test them on devices during the beta.

### 10.4 The host big screen

Designed at 1280 by 720 and scaled with one unit, `--u: min(1vw, 1.7778vh)`, so every size holds its proportion from a laptop to a 4K TV ([checks/host-lobby-1080p.png](./design/final/checks/host-lobby-1080p.png)). Under 1024 by 576 it shows "This screen is made for a TV or a big monitor. Make the window bigger, or open Knewt on your phone to play." Type floors at 1080p: the question 48 px (built 65), answers 36 px (built 42), the room code at least 140 px. Keep everything 5% inside the edges for TVs that overscan. Controls stay mouse and keyboard friendly (44 px minimum) because a host often drives from the laptop.

### 10.5 Text size and spacing

At 200% text every container grows: no fixed heights on anything holding text, the ticket's four cards fall to 2 by 2, the header's progress pills keep their size while the title wraps, and options grow. The WCAG text-spacing overrides (1.5 line height, 0.12 em letter spacing, 2 em paragraph spacing) cause no clipping ([1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)).

---

## 11. Accessibility rules

Target WCAG 2.2 AA everywhere (PRD §3.12.4). These are the rules designers and engineers apply; the PRD's acceptance criteria test them.

| Area | Rule |
|---|---|
| Colour | Never colour alone: every state has an icon and a word, and usually a shape. Text 4.5:1, state graphics and control edges 3:1, in both themes and the high-contrast set (Appendix A) |
| Focus | A 3 px ring at 3 px offset in `focus` (`focus-on-ticket` on the ticket), never removed; focus order follows the visual order |
| Headings | One `h1` per route: the screen title on play screens (the answer type, "A person"), the question stem in practice, the score summary on results ("Daily number 42, done. 9 points out of 12.") |
| Focus moves | To each new question's heading; to the reveal heading when a round resolves (AC-DLY-18); to the new clue after Next clue; it stays in the field after a wrong guess (§6.4) |
| Live regions | One polite status region per screen; `role="alert"` only for a lost connection in a sealed round; timers and the stopwatch `aria-live="off"`; opt-in room announcements at 10 s and 5 s |
| Names | Accessible names contain the visible label ([2.5.3](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)): "Challenge" is named "Challenge a friend", "Report" is "Report a problem with this question", "I liked this" is "I liked this one" |
| Input | Commit on release; no drag-only interaction ([2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)); every pointer action has a keyboard path; at clue 4 touch, mouse, keyboard and screen reader share one model, choose then Lock in (memo D31); a key legend shows only where a keyboard is in use or likely, and its line is held so nothing moves (D32, §6.2); keys 1 to 4 only while focus is in the question, and switchable off ([2.1.4](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)) |
| Combobox | ARIA 1.2 pattern: `aria-expanded`, `aria-controls`, `aria-activedescendant`, a labelled listbox, the match count announced; every Mystery finishable without typing (Next clue and clue 4's options) |
| Time | Nothing times out outside rooms and the opt-in Blitz ([2.2.1](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)); rooms always offer "Off: host advances", 60 s and per-player extra time |
| Motion | Reduced motion and the in-app override (§7); nothing flashes more than three times a second |
| Forced colours | Borders and icons carry every state (double for correct, dashed for wrong); the grain, the tints and the ticket fill drop out; matched letters keep the system highlight ([checks/forced-colors-*.png](./design/final/checks/), light and dark palettes) |
| Reflow | 320 px with no horizontal scroll ([1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)); 200% text; text-spacing overrides |
| Charts | Every chart has a table equivalent reachable by keyboard and screen reader; the player's bar is marked by a word and a pattern |
| Copy | Plain words, no all caps, no italics for emphasis, months spelled out, numbers as numerals |
| Settings that help | High-contrast feedback, Readable text, Reduce motion, Read aloud (pauses the Blitz clock), hide the stopwatch, keyboard shortcuts off. High-contrast feedback and Reduce motion are in the in-play More menu as well as at the top of Settings, so a player who needs them finds them on the first sheet they open |
| Languages | `lang="en"` (with `en-GB` or `en-US` where we know it) on every page; unique page titles ("Daily No. 42 · Knewt") |

---

## 12. Per-screen specs

Every route in PRD §6.2. Each screen also implements the standard states in PRD §3.0.2 (skeleton after 300 ms, one-line empty states with one action, errors with Retry and what still works, the offline banner, success in the status region). Only what differs is listed. Screenshots are 390 by 844 unless noted.

### 12.1 Today, `/`

Screenshots: [home-light.png](./design/final/screens/home-light.png), [home-dark.png](./design/final/screens/home-dark.png), [reflow-320-home.png](./design/final/checks/reflow-320-home.png).

**Layout, top to bottom:** top bar (wordmark, streak chip, settings) · dateline and greeting (`display-2`) · the Daily ticket · Practice card ("Ten questions on anything. Works offline.", Quick play, Choose a category) · This week card · then, below the fold: review card ("5 questions to review"), challenges row ("2 challenges waiting"), Group row ("Uni lot · You're 2nd this week"), the Beta "Host a quiz night" row, footer links · tab bar. At 360 by 640, Play and Quick play are both above the fold: measured, Play spans 375 to 431 px and Quick play 466 to 510 px, with the tab bar starting at 559 px ([checks/fold-360x640-home.png](./design/final/checks/fold-360x640-home.png)).

| State | Ticket |
|---|---|
| Not started | As drawn. Its answer types come from a non-secret preview of the day's rounds (types and difficulty only); if the backend can't serve that before Play, the cards read Easy, Medium, Hard, Number |
| In progress | Title becomes "Continue Daily No. 42", the line reads "Mystery 2 of 3", the button "Continue". While a round is open, "Your stopwatch is still running." carries the running time after it in the same line (`tabular-nums`, five figures' room held before it arrives, named "Time so far" for screen readers, never a live region, absent with the stopwatch hidden; R4-04) |
| Finished | Title "Done for today", the score in `display-1` with the mini grid, "See results" (secondary) and "Next Daily in 5h 12m"; Practice moves up next to it |
| Offline | Ticket turns `sunken` with ink text: "The Daily needs a connection. Practice works offline, but it isn't today's Daily." and "Try again"; Practice is promoted above it |
| Outage | Ticket keeps its colour; the line reads "We're having trouble on our side. Your streak is protected today." |
| Loading | Ticket skeleton with the Play button live at once (it starts the Daily even if streak data hasn't loaded) |

Cards that can appear above Practice, one at a time: the streak repair card (record first, "Repair now" secondary, "Not now"), a freeze or protection note (once), a restore-success note ("Welcome back, Plucky Otter. Your 23-day streak is here.").

### 12.2 The Daily, `/daily`

Screenshots: [mystery-light.png](./design/final/screens/mystery-light.png), [mystery-dark.png](./design/final/screens/mystery-dark.png), [mystery-clue4-light.png](./design/final/screens/mystery-clue4-light.png), [mystery-solved-light.png](./design/final/screens/mystery-solved-light.png), [mystery-solved-dark.png](./design/final/screens/mystery-solved-dark.png), [encore-light.png](./design/final/screens/encore-light.png), [encore-dark.png](./design/final/screens/encore-dark.png).

**Focus-mode header:** Leave (progress saved, with its tooltip, §6.13), the four progress pills, the stopwatch, More.

**Mystery, guessing (clues 1 to 3):** kicker "Mystery 2 of 3 · ●●○ Medium" · title "A person" with the category chip ("History") and the worth scale at the right · the ladder (past clues with stamps, the current clue card, the Next clue slot) · the combobox with Guess · suggestions. First Daily only: the hint under clue 1 and the stopwatch line.

**Clue 4:** the ladder compacts, the current card's tag reads "Last clue", the lead line "Last clue. Pick one of four." with its one-pick sentence (D24), then the legend line ("Tap one, then Lock in." or "Keys A to D choose. Enter locks in.", §6.2), and four options with the Lock in bar under them (§6.2) replace the combobox; an option already guessed shows disabled with "Already guessed". A press chooses and the bar sends (memo D31). The worth scale sits on 1.

**Solved:** the reveal replaces the clue screen: kicker (round, category, type) · "Knew it." stamp and "Solved on clue 2 · +3" · the answer in `display-3` with its display form's detail line · the four clues (§6.3) · the explanation · the five-bar crowd chart and the most common wrong guess (or "Only 23 players have finished this one. Check back later for the numbers.") · I liked this, Learn more, Report · the dock button "Next mystery" (or "On to the Encore"), with "Enter continues." under it where a keyboard is in use (R4-14, D32). The stopwatch shows paused; reading never counts.

**Missed:** the same card with "This one got away." in place of the stamp, "The answer was Heat (1995) · 0 points", and no celebration.

**Encore:** §6.5. Where a keyboard is in use, "Enter locks in." sits beside the preview and in the field's description (R4-15, D32). After Lock in, the result card shows in place of the hints, and the dock button reads "See your results".

**States:** submitting (Guess or Lock in busy, "Checking…" after 1.5 s); offline mid-round (inputs `aria-disabled`, the alert, retries at 2, 5, 10 and 30 s); error under the field with Retry; resume (reload lands on the same clue with the same stamps, no animation); a stale tab refreshes to the current clue with "This Daily moved on in another tab."

### 12.3 Archive play, `/daily/[number]`

Identical to the Daily with an "Archive · unranked" label under the header (`meta`, `sunken` pill), no percentile promises, and the repair framing when it applies ("Repairing your streak"). Played dates open their result. Offline: "The archive needs a connection." with a Practice link.

### 12.4 The stop screen, `/daily/[number]/results`

Screenshots: [results-light.png](./design/final/screens/results-light.png), [results-dark.png](./design/final/screens/results-dark.png), [reflow-320-results.png](./design/final/checks/reflow-320-results.png).

**Order** (PRD §3.1.6, AC-DLY-14): top bar ("Daily No. 42", the date, Close, Stats) · the best-moment stamp · the score card (score with the drawn slash, "points", streak and freezes at the right, then the share rows exactly as the share text renders them, and the Encore token with the band chip) · Share (with its mini grid) and Challenge, both secondary · the percentile line · How everyone did · "Your mysteries" with "Review clues and the why" · one row per Mystery (number, category and type with pips, the answer in Fraunces, the player's clue and a crowd line such as "Top wrong guess: Mary Shelley", points and squares) and the Encore row (answer, "You said 320, so 4% off", the band chip and the number line) · Review your misses (each miss with its explanation and Learn more, or "Nothing to review. Clean sheet.") · at most one offer card · the sticky dock: "Done for today" (the only primary), "Next Daily in 9h 41m", "Want more? Try a practice round." The regret survey, when sampled, sits above the dock as a dismissible card and never during play.

**Share's confirmation** (R4-06): after a copy the Share button's own label reads "Copied" for two seconds, as well as the toast, and the button holds the wider label's width so nothing beside it moves. The toast keeps off the H1 (§6.9).

**The dock and the page's end** (R4-06, reviewed): the dock is sticky inside the page's flow, so it takes its own room before the last links, and the share text always scrolls clear of it. The page gets no extra padding for it: a dock's height of padding only left an empty band under the last link. On load at 1280 by 800 the dock still crosses the share text, as it crosses whatever sits at the fold; keeping the whole share box above the fold would take a layout change, which round 5 can ask for if players still trip on it.

**States:** cold start (the percentile and chart become the cold-start line; rows show "Numbers come in once 50 players finish"); numbers failed ("We couldn't load today's numbers." with Retry, the rest renders); archive variant ("Archive · unranked", "You'd have beaten 58% of players", "(archive)" in the share). Percentile and chart refetch on every visit while the date is open.

### 12.5 The archive, `/archive`

Header "The last 7 days are always free." · seven ticket-stub tiles, newest first, each with the number, the spelled-out date and its state: played (score and mini grid), not played ("Play"), repair available (an `accent-text` "Repair your streak · until midnight Monday" with the tally icon), repair used ("Play (unranked)" and the note with the next date), abandoned ("Finish it (unranked)"). Offline: skeleton tiles and the offline line.

### 12.6 Practice hub, `/practice`

Title "Practice" · the difficulty segmented control (Easy ●○○, Medium ●●○, Hard ●●●, Mixed, default Mixed, remembered) with "Mixed adapts to how you're doing." when adaptive serving ships · the monthly pack card (only in its month) · the category grid (§6.14) with mastery words · mode cards: Quick play, Blitz ("Answer as many as you can in 60 seconds. Speed earns bonus points." and the Relaxed 120 s option), Survival ("Three strikes. No clock."), Review ("5 due") · Start. Offline: every cached category works; an uncached one shows "This category isn't saved on your device yet. Connect once and it'll work offline." and "Play Mixed instead".

### 12.7 A practice round, `/practice/run`

Screenshots: [practice-light.png](./design/final/screens/practice-light.png), [practice-dark.png](./design/final/screens/practice-dark.png).

Header: Leave, "Practice" over the category name, sound toggle · ten segments · kicker "Question 4 of 10 · ●●○ Medium" · the stem · options (§6.2) · the explanation sheet (§6.10) · Continue. No clock (AC-PRA-12). True/false and comparison use their layouts. Auto-advance, when switched on, shows a thin progress line on Continue that a tap cancels. The repeats note ("You've seen most Hard Geography questions, so a few repeats are mixed in.") appears once above question 1.

### 12.8 Blitz, `/practice/blitz`

The timer bar (§6.6) under the header with the score at the right in Fraunces (count-up per answer), the stem and options; the verdict shows for 600 ms (check or X stamp, no sheet) and the next question slides in. At 10 s the bar turns amber and striped; ticks only in the last 5 s if sound is on. The clock pauses while the tab is hidden or read aloud speaks. Results list every question with its explanation.

### 12.9 Survival, `/practice/survival`

Three strike slots under the header, the difficulty word that applies now ("Medium from question 6"), and the normal question and sheet. The third strike ends the run with no "continue" offer of any kind. "You've answered every question we have here. Remarkable." when the pool runs out.

### 12.10 Review my misses, `/practice/review`

Header "Review · 5 due" · the normal question flow, untimed, offline-capable · a "Learned" stamp on an item answered right at its 21-day review. Empty: "Nothing due today. Missed questions come back here a day, then three days, a week and three weeks later."

### 12.11 Practice results, `/practice/results`

The best-moment line ("10 out of 10. Flawless." or "New best in Geography: 8/10") · the score in `hero` with the slash · every question as a compact row with its verdict, the answer and an expandable explanation · "3 misses saved for review" · "Play again" (primary, same settings), "Change category", Share (secondary). No challenge action (AC-PRA-11).

### 12.12 Challenges, `/challenges`

Three sections: Received (to play), Waiting (sent, nobody finished), Finished (last 30 days). Each row: the other player's name, "Daily No. 42", their score or "Your turn", a result chip ("You won", "Lost by 1", "Dead heat") and a chevron. Empty: "No challenges yet. Finish a Daily and tap Challenge to send one." Offline: "Challenges need a connection. Practice works offline."

### 12.13 Challenge landing, `/c/[code]`

A ticket-style card: "Plucky Otter challenged you" · "Daily No. 42 · Saturday 31 October" · their score with the slash and their grid (squares only, no answers) · one primary button, "Play". Not open yet: "This one unlocks at midnight your time, in 3h 10m. Play today's Daily while you wait." with the Daily as the primary. Ended, full, invalid and offline use the PRD's copy with Play today's Daily as the action. Already played: the head-to-head opens at once.

### 12.14 Challenge play, `/c/[code]/play`

The Daily (12.2) with a strip under the header: "Challenge from Plucky Otter · their score stays hidden until you finish". Ranked or unranked per PRD §3.6.1, labelled when unranked.

### 12.15 Head-to-head, `/c/[code]/result`

Two columns, You and Plucky Otter, each with the score, the grid and the Encore error; the winner's column gets a "Winner" stamp in `play-accent-text` (no colour wash, so it never reads as a verdict); ties get "Dead heat" across both. The verdict line in `display-4`: "You win on the Encore: 4% off against 9%." Buttons: Rematch (primary), Share, Play today's Daily (hidden after playing it). The challenger's own view lists everyone who played, refetched on focus.

### 12.16 Share landing, `/s/[number]/[code]`

Static. A ticket-style card: "Someone scored 9/12 on Daily No. 42" with the grid and the Encore token, then "Play today's Daily" (primary, one tap to clue 1). Other dates: "Your Daily today is #41. #42 unlocks at midnight your time." Already finished today: "You scored 10/12 today" and "See your results". Under it, one line for strangers: "Three mysteries a day. Fewer clues, more points." Works with the backend off.

### 12.17 The preview image, `/s/[number]/[code]/opengraph-image`

§6.11.

### 12.18 Your Groups, `/g`

One row card per Group (name, member count, your place this week, a "Today" dot when members have played) · "Start a Group" (secondary) and "Join with a link" help text. Empty: the newt reading a card, "Groups are private boards for your group chat." and "Start a Group".

### 12.19 Create a Group, `/g/new`

Age band first if unknown (the dialog). Then two fields: "Group name" (3 to 30 characters, live counter) and "Your nickname in this group" (prefilled with the generated name; the 13 to 17 band gets a generated-name picker with Shuffle). Primary "Create group". The slur filter's answer is inline under the field: "Please choose a different name." Success opens the share sheet with the invite text.

### 12.20 The Group board, `/g/[groupId]`

Header with the Group name and a settings icon · the last week's winner as a stamp banner ("Last week: Dee won with 71 points") · a two-part segmented control, Today and This week. Today: members who finished, sorted by the ranking rule, each with rank, nickname, score and mini grid, then "Not yet" rows; before the viewer finishes, scores are hidden behind "8 members have played. Finish today's Daily to see how they did." with Play. This week: rank, nickname, points of 84, days played ("5 of 7") and current streak, shared ranks shown as "=2". Only you: "It's just you so far. Share the invite link with your chat." with Share invite. Offline: the cached board with "Updated 10 minutes ago". No realtime and no polling; refresh on focus and pull.

### 12.21 Group settings, `/g/[groupId]/settings`

Your nickname (edit or picker), Leave group (with a confirm). Admins also get Rename group, Members (Remove per row with a confirm), New invite link ("The old link will stop working."), and Hand admin to. Every destructive action has a confirm dialog.

### 12.22 Group invite, `/j/[code]`

A card with the Group name and "4 members" (nothing else about them) · primary "Join" · then the age band if unknown and the nickname step, at most three screens to the board (AC-GRP-01). Full, invalid and removed states use the PRD's copy with a way back to Today.

### 12.23 Me, `/me`

Title "Me" with the friendly name · the streak sheet (current and best in `display-5`, record first after a break; days played; freezes with "4 of 7 Dailies to your next freeze"; repair status; the 14-day strip with icons and words) · numbers row (days played, Dailies finished, average score in Fraunces) · score history chart and the player's own score distribution · solves by clue · Encore (bullseyes, closes, median error) · accuracy by category with question counts and mastery tiers · practice (rounds, questions, Blitz bests per length, Survival best) · achievements summary ("12 of 30") · links: Your sync code, Challenges, Your quizzes (Beta), Settings · footer. New player: the newt reading, "Play your first Daily to start your stats." and Play. Offline: cached figures with "Updated 2 hours ago".

### 12.24 Achievements, `/me/achievements`

A grid of 2 columns on phones (3 at 768): each tile has a Lucide icon, the name, the rule in one line and a progress bar with "7 of 10". Earned tiles are ink with a small stamp and the date; locked ones are outlined. Four tiles marked "Can be earned today" for new players. Hidden features' achievements don't render (AC-ACH-03). Seasonal badges sit on a separate shelf below.

### 12.25 Your sync code, `/me/sync`

The code in Atkinson Hyperlegible Next 28/700 with tabular figures and 0.08 em letter spacing (here legibility of every character beats the display face, and Atkinson was drawn for exactly that), in four groups (`K7QX-2M9P-T4RW-8HNC`) on a `sunken` well, "Copy code" (secondary) and "I've saved it" (text button), the warning "Anyone with this code can play as you, so keep it private." with the lock icon, and "Make a new code" (with a confirm: "Your old code will stop working."). Works offline (the code lives on the device).

### 12.26 Restore, `/restore`

One field, "Your sync code", 16 characters with automatic grouping as you type (case-insensitive, I and L read as 1, O as 0), a `meta` hint "You'll find it in Me, then Your sync code, on your other device." and primary "Restore". If this device has progress, the confirm dialog with the PRD's copy. Success lands on Today with the welcome-back note. Failures and the rate limit use the PRD's copy inline.

### 12.27 Claim, `/claim/[token]`

A centred card: "Continue as Plucky Otter?" · "Streak 1 · Daily No. 42 done" · primary "Continue" and text "This isn't me". Success lands on Today: "You're all set. Your streak is safe in this browser." Expired: the PRD's copy with "Enter a sync code".

### 12.28 Settings, `/settings`

Grouped list rows (56 px, label left, control right). **Playing** comes first: High-contrast feedback, Sound effects, Haptics (Android only), Daily stopwatch, Keyboard shortcuts, Auto-advance (practice). **Look and feel:** Theme (System, Light, Dark as a segmented control), Reduce motion (System, On, Off), Readable text, Read aloud. **Rooms:** Room timer announcements. **Daily reminder** (hidden in in-app browsers and for 13 to 17). **Your profile:** Sync code, Restore from a code, Age band, Download my data, Delete my data (danger, two confirms). **About:** the seven trust pages. Every change applies at once and shows "Saved" in the status region.

### 12.29 Create a room, `/host` (Beta)

On a laptop, a centred 720 px column: "Host a quiz night" with the Beta label · source as two large choice cards, Our packs (8 pack tiles with a theme line and "15 questions") and My quizzes (after the 18+ confirmation) · Timer as a segmented control (10, 20, 30, 60 s, Off: host advances) · Scoring (Classic, Accuracy; Accuracy forced and the control disabled with a note when the timer is off) · "Final question counts double" as a fixed note · primary "Create room", which also creates the AudioContext. Offline: "Rooms need a connection."

### 12.30 The host screen, `/host/[roomId]` (Beta)

Screenshots: [host-lobby-light.png](./design/final/screens/host-lobby-light.png), [host-lobby-dark.png](./design/final/screens/host-lobby-dark.png) at 1280 by 720.

- **Lobby:** top bar (wordmark, "Quiz night", Beta; Sound on, Lock room, End) · the join ticket on the left · "In the room" with "6 of 20 joined" and the player chips on the right · the pack card ("Around the World" with 15 questions, 20 seconds each, Classic scoring, Final question counts double, and "Change pack or settings") · "Start when everyone's in." and primary "Start the quiz" · footer notes. New players' chips arrive with the join pop.
- **Read beat:** the question alone in `host-question`, a thin line along the top that fills over the beat, "Skip" for the host.
- **Answering:** the question, four answer tiles in a 2 by 2 grid (letter, shape and text), the timer bar and seconds label, "12 of 15 answered", and the host controls (+50% time, Reveal now) in the top bar.
- **Reveal:** the correct tile fills and the others dim, distribution bars under each tile with counts, the explanation under the grid, Next.
- **Standings:** the top five with points and movement arrows; "Final question: double points." as a full-width stamp before question 15.
- **Podium:** three plinths, names in `host-title`, confetti, then "Play today's Daily" and "Host your own" for everyone.
- **Paused, reconnecting and voided:** a banner across the top ("Paused", "Reconnecting…", or "We had a problem with that question, so it doesn't count. Sorry about that.") with the current phase kept on screen.
- The QR and code stay reachable all game from a "Join" button, for latecomers.

### 12.31 Enter a room code, `/join` (Beta)

Phone layout: "Join a room" · six single-digit boxes (one input with `inputmode="numeric"` and `autocomplete="one-time-code"` styled as boxes, Fraunces 32) · primary "Join" · the PRD's error copy inline. Offline: the offline state.

### 12.32 QR target, `/join/[code]` (Beta)

No screen of its own: it joins and redirects to the phone view, showing a one-line "Joining room 482 913…" skeleton while it does.

### 12.33 The phone in a room, `/room/[roomId]` (Beta)

- **Waiting:** "You're in as Brave Otter." in `display-4` · a name chip with Shuffle name · "Waiting for the host to start."
- **Question:** the full question and four options with letters and shapes (§6.2), the timer bar, no sound by default.
- **Locked:** "Locked in. Waiting for the reveal." with the chosen option kept visible.
- **Verdict:** "Correct. +912" or "Not this time." with the answer, then the explanation.
- **Standings:** "4th, 120 behind Plucky Otter" in `display-4`, the leader's line "1st, 80 ahead of Plucky Otter".
- **End:** the podium summary, "Play today's Daily", "Host your own".
- Removed, full, locked, ended and reconnecting states use the PRD's copy (§3.8.2).

### 12.34 Your quizzes, `/create` (Beta)

Title with the Beta label · "New quiz" (primary) and "Import" · quiz cards with title, question count, status ("Saved on this device", "Saved", "Hidden while we review reports") and creator stats ("Played 14 times · average 7.2 out of 10"). Empty: "Make your first quiz. Write questions here, or paste ones you already have." with both actions.

### 12.35 The editor, `/create/new` and `/create/[quizId]` (Beta)

Title and description fields at the top · one card per question: type toggle (Multiple choice, True or false), the stem, three or four options each with a "Correct" radio, the explanation, and a footer with Move up, Move down, Duplicate and Delete (Undo toast for 10 s) · lint warnings inline under the field they concern, with the caution icon in `warning-text` and the fix hint; blocking problems in `incorrect-text` with an X · a sticky bottom bar: the status ("Saved on this device"), "3 things to fix" (jumps to the first), Play, and Save (primary, disabled while anything blocks). Offline: editing and Play work, with the PRD's offline line.

### 12.36 Import, `/create/import` (Beta)

A large text area ("Paste your questions") and "Or choose a CSV file" · "Check" (primary) · the preview: one row per question with OK, Warning or Error (icon, word and reason), Error rows editable in place · "Add 23 questions". The size limit and skipped rows use the PRD's copy.

### 12.37 Import help, `/create/help/import` (Beta)

A reading page (640 px): both formats with copyable examples in a `sunken` code well, and the chatbot prompt with a "Copy prompt" button.

### 12.38 Shared quiz, `/q/[code]`, `/q/[code]/play`, `/q/[code]/result` (Beta)

Landing: a ticket-style card with the title, the creator's nickname, the question count and "Play" (primary), plus Report as a ghost button. Play: the practice question flow, sealed, with Report on every reveal. Result: the score and every explanation, Share and "Play today's Daily". Under review: "This quiz is being reviewed." Unshared: "This quiz isn't available."

### 12.39 Category pages, `/categories/[slug]`

A reading page: the category icon and name in `display-2`, the 100 to 200 word introduction, three example topics as chips, one playable sample question (the practice component with its sheet), and "Play Geography" (primary).

### 12.40 Legal and trust pages

`/privacy`, `/terms`, `/content-policy`, `/credits`, `/accessibility`, `/how-scoring-works`, `/about-our-questions`: a 640 px reading column, title in `display-2`, a "Last updated 31 October 2026" line, `body` text with `display-6` section heads, and a short table of contents on long pages. `/credits` lists both fonts with their OFL notices, Lucide's ISC licence, Wikidata and the open-source notices.

### 12.41 Offline fallback, `/offline`

The newt looking for something, "You're offline. Practice works, but it isn't today's Daily.", primary "Practice", and "Try again".

### 12.42 Not found, and an old browser

"We couldn't find that page." with the one smile ("Even the newt can't find it."), "Go to Today" (primary) and "Practice". Old browser: "Your browser is too old for Knewt. Updating it should fix this." on a plain page with no script dependencies.

### 12.43 Platform files

Manifest: name and short name "Knewt", `theme_color` #F5EFE4 with a dark-scheme override of #1A1714 (`media` on the theme-color meta), `background_color` #F5EFE4, the icons in §1.5, categories games and entertainment. The installed first run with no identity shows "Already playing in your browser? Enter your sync code to bring your streak with you." with Enter code and Start fresh.

### 12.44 Overlays used on many screens

- **Offer cards** (§6.10): claim link ("Playing inside WhatsApp? Open Knewt in your browser to keep your streak." with the two steps for that app), sync code, install (Chromium prompt; iOS shows the code first, then two illustrated steps), calendar reminder ("Want a nudge? Add a daily reminder to your calendar. We never send notifications."), start a Group.
- **Age band dialog**, **nickname dialog**, **report sheet**, **streak sheet**, **content-fix notice** ("We fixed a problem with Daily No. 42, Mystery 2. Everyone gets full points for it, so your score is now 10/12.") and **incident banners**.

---

## 13. Implementation notes

- **Tokens:** copy [design/tokens.css](./design/tokens.css) to `src/app/tokens.css` and import it right after Tailwind; it replaces the placeholder tokens in `globals.css` (aliases for `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border` and `ring-ring` are kept). It removes Tailwind's default palette, so every colour is a semantic token. The file was compiled with Tailwind 4.3.3 in this session and produces `bg-page`, `text-display-3`, `p-gutter`, `max-w-play`, `animate-stamp`, a theme-aware `dark:` variant and the rest.
- **Theme switches** are attributes on `<html>`, written by a tiny inline script before first paint from the stored setting, so there is no flash: `data-theme`, `data-feedback="contrast"`, `data-readable="on"`, `data-motion`.
- **Fonts:** self-host the files in `public/fonts` (no third-party font hosts, constraint 9) or use `next/font/local` with the same files and `adjustFontFallback`. Preload the two roman latin files.
- **Icons:** `lucide-react` named imports; the tally, pips and room shapes as tiny local components; the newt as inline SVG components generated from `mark.js`.
- **The share image:** `next/og` with a static Fraunces 650 TTF (an extra instancer run) and the wordmark as an SVG path.
- **Motion:** CSS and WAAPI only in the first bundle; View Transitions where supported, with an instant swap elsewhere. Confetti and the QR generator load lazily (PRD §8.1).
- **Sound:** one module that builds cues from the recipes in §8 on demand; loaded after the first interaction with sound on.

---

## 14. The prototype and its checks

Everything lives in [design/final/](./design/final/). Open `index.html` for the gallery (every phone screen in both themes, the host lobby and the share image), or one screen with `index.html?screen=home|mystery|options|solved|encore|practice|results|share|host|marks|sharetext&theme=light|dark`, plus `&hc=1` (high-contrast feedback), `&reflow=1`, `&animate=1&t=480` (freeze the animations at a time) and `&reduce=1`.

| File | What it is |
|---|---|
| `tokens.js` | Colour, type, radius, spacing, motion and layer tokens: the source of truth |
| `build-tokens.js` | Writes `../tokens.css` (run `node build-tokens.js`) |
| `contrast.js` | Measures 130 pairs and the CVD table (`node contrast.js --check` fails on any miss) |
| `mark.js` | Generates the newt at three detail levels |
| `build-assets.js` | Builds `sprite.js` from `lucide-static` 1.66.0, the custom glyphs, the marks and the lobby QR (`qrcode-generator` 2.0.4) |
| `fonts/build-fonts.sh` | Builds the woff2 files from Fontsource with fontTools; both OFL texts sit beside them |
| `capture.js` | Captures every screenshot with `require('playwright')` and the pre-installed Chromium, and prints an audit (fonts loaded, horizontal overflow, targets under 44 px, anything past the right edge) |
| `screens/` | The deliverables: Today, Mystery, clue 4, solved, Encore, practice reveal, results, share image and host lobby, light and dark |
| `checks/` | 320 px reflow for every phone screen, the 360 by 640 fold, forced colours (light and dark palettes), high-contrast feedback, motion frame boards, the mark sheet, the 1080p host and the share text in light and dark chats |

Measured on the final run: every phone screen and the host lobby pass the audit (no overflow at 390 or 320 px, no target under 44 px), all 130 colour pairs pass, the fonts total 88,212 bytes, and the share image is 87,842 bytes. Packages were installed in a scratch folder and `node_modules` deleted after copying; nothing here needs an install to open.

**What I caught while iterating** (each fixed and re-captured): the ticket's explainer and meta line wrapped with widows; the fourth suggestion peeked under the keyboard; the explanation sheet covered option D; the Encore had two competing headlines; the score's "12" collided with the share grid's labels; the host lobby overflowed 720 px and truncated names; the forced-colours palette hid the matched letters and painted dimmed options in GrayText; the correct option's border leaked before the reveal in the motion frames; the solved pill lost its fill when it was also current; the "Medium" word split from its pips at 320 px.

---

## 15. Open questions and risks

| # | Question | Proposed answer | Owner |
|---|---|---|---|
| D1 | Trademark and domain for Knewt | Search classes 9 and 41 and the domains, and buy the "newt" typo domains, before any brand work ships; if it fails, keep the system and coin a new name in the same spirit ("knew it") | Owner |
| D2 | Will people hear "newt" and fail to find us? | Make "newt" searches and the typo domains land on us; most spread is pasted text that shows the spelling | Owner, Growth |
| D3 | The newt is generated geometry | An illustrator refines the four poses within §1.5's rules; it must still read as "?" at 24 px | Design |
| D4 | Screen readers and the share text | Device tests in VoiceOver and TalkBack for "9/12", "·" and the emoji names before M3 exits (PRD Q5) | Design, QA |
| D5 | Focus after a wrong guess | Adopt §6.4's proposal and update PRD §3.1.4 | PM |
| D6 | Fraunces is popular in brand work | The ticket, the newt, the stamps and the pen-stroke slash carry the identity; a custom display cut can follow launch | Design |
| D7 | Keyboards in in-app browsers | Test WhatsApp and Instagram on iOS and Android in the closed beta; keep the list's whole-row rule | QA |
| D8 | The answer-type preview on Today | Architecture adds a non-secret preview (types and difficulty) or the ticket shows difficulty only | Platform |

---

## Appendix A. Measured contrast

Output of `node contrast.js` from [design/final/](./design/final/), unedited. WCAG 2.2 relative-luminance formula; simulations use the Machado 2009 matrices at full severity in linear RGB.

#### Light

| Foreground | Background | Ratio | Target | Pass | Used for |
|---|---|---|---|---|---|
| `ink` #1D1A16 | `page` #F5EFE4 | 15.14:1 | 4.5:1 | Yes | Body text on the page |
| `ink` #1D1A16 | `surface` #FFFBF5 | 16.81:1 | 4.5:1 | Yes | Text on cards and options |
| `ink` #1D1A16 | `sunken` #ECE4D6 | 13.73:1 | 4.5:1 | Yes | Text in wells and keypads |
| `ink-2` #4E463D | `page` #F5EFE4 | 8.09:1 | 4.5:1 | Yes | Secondary text on the page |
| `ink-2` #4E463D | `surface` #FFFBF5 | 8.98:1 | 4.5:1 | Yes | Dimmed options, secondary text on cards |
| `ink-3` #665C51 | `page` #F5EFE4 | 5.71:1 | 4.5:1 | Yes | Meta text (dates, counts) on the page |
| `ink-3` #665C51 | `surface` #FFFBF5 | 6.34:1 | 4.5:1 | Yes | Meta text on cards |
| `ink-3` #665C51 | `sunken` #ECE4D6 | 5.17:1 | 4.5:1 | Yes | Meta text in wells |
| `on-primary` #FFFBF5 | `primary` #1D1A16 | 16.81:1 | 4.5:1 | Yes | Primary button label |
| `primary` #1D1A16 | `page` #F5EFE4 | 15.14:1 | 3:1 | Yes | Primary button against the page |
| `on-accent` #1D1A16 | `accent` #E55F29 | 4.95:1 | 4.5:1 | Yes | Text on accent fills (points marker, New tag) |
| `accent-text` #B4421A | `page` #F5EFE4 | 4.91:1 | 4.5:1 | Yes | Accent text and links on the page |
| `accent-text` #B4421A | `surface` #FFFBF5 | 5.45:1 | 4.5:1 | Yes | Accent text on cards |
| `ink` #1D1A16 | `accent-tint` #FADCCB | 13.34:1 | 4.5:1 | Yes | Text on the highlighter wash |
| `on-ticket` #1D1A16 | `ticket` #E55F29 | 4.95:1 | 4.5:1 | Yes | Text on the Daily ticket |
| `on-ticket` #1D1A16 | `ticket-card` #ED8C63 | 7.04:1 | 4.5:1 | Yes | Text on the answer-type cards inside the ticket |
| `on-ticket-invert` #F28A5C | `ticket-invert` #1D1A16 | 7.07:1 | 4.5:1 | Yes | Encore card text inside the ticket |
| `ticket` #E55F29 | `page` #F5EFE4 | 3.06:1 | 3:1 | Yes | Ticket edge against the page |
| `focus-on-ticket` #1D1A16 | `ticket` #E55F29 | 4.95:1 | 3:1 | Yes | Focus ring on the ticket |
| `primary` #1D1A16 | `ticket` #E55F29 | 4.95:1 | 3:1 | Yes | Play button against the ticket |
| `on-correct` #FFFBF5 | `correct` #0B6670 | 6.47:1 | 4.5:1 | Yes | Correct answer text on its fill |
| `correct-text` #0B6670 | `surface` #FFFBF5 | 6.47:1 | 4.5:1 | Yes | "Correct answer" label on cards |
| `ink` #1D1A16 | `correct-tint` #DAECEC | 14.19:1 | 4.5:1 | Yes | Text on a solved clue |
| `correct-line` #0B6670 | `surface` #FFFBF5 | 6.47:1 | 3:1 | Yes | Correct border, solved square on a card |
| `correct-line` #0B6670 | `page` #F5EFE4 | 5.83:1 | 3:1 | Yes | Solved square on the page |
| `ink` #1D1A16 | `incorrect-tint` #F8E0E1 | 13.82:1 | 4.5:1 | Yes | Your wrong pick: text on its tint |
| `incorrect-text` #A32536 | `surface` #FFFBF5 | 7.08:1 | 4.5:1 | Yes | "Your answer" label and wrong-guess stamp on cards |
| `incorrect-text` #A32536 | `incorrect-tint` #F8E0E1 | 5.82:1 | 4.5:1 | Yes | "Your answer" label on its own tint |
| `incorrect-line` #B42A3C | `surface` #FFFBF5 | 6.10:1 | 3:1 | Yes | Wrong-pick border, used-clue square |
| `incorrect-line` #B42A3C | `incorrect-tint` #F8E0E1 | 5.02:1 | 3:1 | Yes | Wrong-pick border against its own fill |
| `on-incorrect` #FFFBF5 | `incorrect` #B42A3C | 6.10:1 | 3:1 | Yes | X icon on the wrong badge |
| `on-correct` #FFFBF5 | `correct` #0B6670 | 6.47:1 | 3:1 | Yes | Check icon on the correct badge |
| `on-play-accent` #1D1A16 | `play-accent` #E55F29 | 4.95:1 | 4.5:1 | Yes | Text on in-play accents (points marker) |
| `play-accent-text` #B4421A | `page` #F5EFE4 | 4.91:1 | 4.5:1 | Yes | In-play accent text on the page (best-moment stamp) |
| `selected` #1D1A16 | `surface` #FFFBF5 | 16.81:1 | 3:1 | Yes | Locked-in border |
| `focus` #1D1A16 | `page` #F5EFE4 | 15.14:1 | 3:1 | Yes | Focus ring on the page |
| `focus` #1D1A16 | `surface` #FFFBF5 | 16.81:1 | 3:1 | Yes | Focus ring on cards |
| `rule-strong` #8A7F70 | `page` #F5EFE4 | 3.43:1 | 3:1 | Yes | Input and option borders on the page |
| `rule-strong` #8A7F70 | `surface` #FFFBF5 | 3.81:1 | 3:1 | Yes | Option borders on cards |
| `warning-text` #7A5300 | `page` #F5EFE4 | 5.99:1 | 4.5:1 | Yes | Warning text (rooms only) |
| `on-warning` #1D1A16 | `warning` #F2BE4A | 10.10:1 | 4.5:1 | Yes | Text on the amber timer state |
| `on-caution` #1D1A16 | `caution` #FBEBC4 | 14.68:1 | 4.5:1 | Yes | Outage banner text |
| `caution-line` #9A6B00 | `caution` #FBEBC4 | 3.97:1 | 3:1 | Yes | Outage banner border and icon |
| `on-freeze` #2B4250 | `freeze` #DDE7EC | 8.37:1 | 4.5:1 | Yes | Freeze day label and icon |
| `chart-bar` #8A7F70 | `surface` #FFFBF5 | 3.81:1 | 3:1 | Yes | Chart bars on cards |
| `chart-you-line` #1D1A16 | `chart-you` #E55F29 | 4.95:1 | 3:1 | Yes | The outline on your bar |
| `chart-you` #E55F29 | `surface` #FFFBF5 | 3.39:1 | 3:1 | Yes | Your bar on the card |
| `link` #1D1A16 | `surface` #FFFBF5 | 16.81:1 | 4.5:1 | Yes | Links on cards |
| `link-underline` #B4421A | `surface` #FFFBF5 | 5.45:1 | 3:1 | Yes | Link underline on cards |

#### Dark

| Foreground | Background | Ratio | Target | Pass | Used for |
|---|---|---|---|---|---|
| `ink` #F3EBDE | `page` #1A1714 | 15.09:1 | 4.5:1 | Yes | Body text on the page |
| `ink` #F3EBDE | `surface` #25211C | 13.52:1 | 4.5:1 | Yes | Text on cards and options |
| `ink` #F3EBDE | `sunken` #13110E | 15.93:1 | 4.5:1 | Yes | Text in wells and keypads |
| `ink-2` #CEC3B3 | `page` #1A1714 | 10.27:1 | 4.5:1 | Yes | Secondary text on the page |
| `ink-2` #CEC3B3 | `surface` #25211C | 9.20:1 | 4.5:1 | Yes | Dimmed options, secondary text on cards |
| `ink-3` #A99D8D | `page` #1A1714 | 6.71:1 | 4.5:1 | Yes | Meta text (dates, counts) on the page |
| `ink-3` #A99D8D | `surface` #25211C | 6.01:1 | 4.5:1 | Yes | Meta text on cards |
| `ink-3` #A99D8D | `sunken` #13110E | 7.09:1 | 4.5:1 | Yes | Meta text in wells |
| `on-primary` #1A1714 | `primary` #F3EBDE | 15.09:1 | 4.5:1 | Yes | Primary button label |
| `primary` #F3EBDE | `page` #1A1714 | 15.09:1 | 3:1 | Yes | Primary button against the page |
| `on-accent` #1A1714 | `accent` #F07A45 | 6.44:1 | 4.5:1 | Yes | Text on accent fills (points marker, New tag) |
| `accent-text` #F59466 | `page` #1A1714 | 7.91:1 | 4.5:1 | Yes | Accent text and links on the page |
| `accent-text` #F59466 | `surface` #25211C | 7.09:1 | 4.5:1 | Yes | Accent text on cards |
| `ink` #F3EBDE | `accent-tint` #3B2A20 | 11.54:1 | 4.5:1 | Yes | Text on the highlighter wash |
| `on-ticket` #F7EEE1 | `ticket` #AD4219 | 5.12:1 | 4.5:1 | Yes | Text on the Daily ticket |
| `on-ticket` #F7EEE1 | `ticket-card` #873314 | 7.27:1 | 4.5:1 | Yes | Text on the answer-type cards inside the ticket |
| `on-ticket-invert` #F59466 | `ticket-invert` #1A1714 | 7.91:1 | 4.5:1 | Yes | Encore card text inside the ticket |
| `ticket` #AD4219 | `page` #1A1714 | 3.03:1 | 3:1 | Yes | Ticket edge against the page |
| `focus-on-ticket` #F7EEE1 | `ticket` #AD4219 | 5.12:1 | 3:1 | Yes | Focus ring on the ticket |
| `primary` #F3EBDE | `ticket` #AD4219 | 4.97:1 | 3:1 | Yes | Play button against the ticket |
| `on-correct` #F3EBDE | `correct` #175B60 | 6.57:1 | 4.5:1 | Yes | Correct answer text on its fill |
| `correct-text` #7FDCD6 | `surface` #25211C | 9.99:1 | 4.5:1 | Yes | "Correct answer" label on cards |
| `ink` #F3EBDE | `correct-tint` #183737 | 10.82:1 | 4.5:1 | Yes | Text on a solved clue |
| `correct-line` #6AD3CF | `surface` #25211C | 9.01:1 | 3:1 | Yes | Correct border, solved square on a card |
| `correct-line` #6AD3CF | `page` #1A1714 | 10.06:1 | 3:1 | Yes | Solved square on the page |
| `ink` #F3EBDE | `incorrect-tint` #45212A | 11.80:1 | 4.5:1 | Yes | Your wrong pick: text on its tint |
| `incorrect-text` #FF8C9A | `surface` #25211C | 7.21:1 | 4.5:1 | Yes | "Your answer" label and wrong-guess stamp on cards |
| `incorrect-text` #FF8C9A | `incorrect-tint` #45212A | 6.30:1 | 4.5:1 | Yes | "Your answer" label on its own tint |
| `incorrect-line` #E0566A | `surface` #25211C | 4.35:1 | 3:1 | Yes | Wrong-pick border, used-clue square |
| `incorrect-line` #E0566A | `incorrect-tint` #45212A | 3.80:1 | 3:1 | Yes | Wrong-pick border against its own fill |
| `on-incorrect` #1A1714 | `incorrect` #E0566A | 4.85:1 | 3:1 | Yes | X icon on the wrong badge |
| `on-correct` #F3EBDE | `correct` #175B60 | 6.57:1 | 3:1 | Yes | Check icon on the correct badge |
| `on-play-accent` #1A1714 | `play-accent` #F07A45 | 6.44:1 | 4.5:1 | Yes | Text on in-play accents (points marker) |
| `play-accent-text` #F59466 | `page` #1A1714 | 7.91:1 | 4.5:1 | Yes | In-play accent text on the page (best-moment stamp) |
| `selected` #F3EBDE | `surface` #25211C | 13.52:1 | 3:1 | Yes | Locked-in border |
| `focus` #F3EBDE | `page` #1A1714 | 15.09:1 | 3:1 | Yes | Focus ring on the page |
| `focus` #F3EBDE | `surface` #25211C | 13.52:1 | 3:1 | Yes | Focus ring on cards |
| `rule-strong` #857A6B | `page` #1A1714 | 4.24:1 | 3:1 | Yes | Input and option borders on the page |
| `rule-strong` #857A6B | `surface` #25211C | 3.80:1 | 3:1 | Yes | Option borders on cards |
| `warning-text` #F6CD6E | `page` #1A1714 | 11.79:1 | 4.5:1 | Yes | Warning text (rooms only) |
| `on-warning` #1A1714 | `warning` #F2BE4A | 10.40:1 | 4.5:1 | Yes | Text on the amber timer state |
| `on-caution` #F3EBDE | `caution` #3A2F14 | 11.12:1 | 4.5:1 | Yes | Outage banner text |
| `caution-line` #F6CD6E | `caution` #3A2F14 | 8.69:1 | 3:1 | Yes | Outage banner border and icon |
| `on-freeze` #B9D3E2 | `freeze` #22303A | 8.69:1 | 4.5:1 | Yes | Freeze day label and icon |
| `chart-bar` #857A6B | `surface` #25211C | 3.80:1 | 3:1 | Yes | Chart bars on cards |
| `chart-you-line` #1A1714 | `chart-you` #F07A45 | 6.44:1 | 3:1 | Yes | The outline on your bar |
| `chart-you` #F07A45 | `surface` #25211C | 5.77:1 | 3:1 | Yes | Your bar on the card |
| `link` #F3EBDE | `surface` #25211C | 13.52:1 | 4.5:1 | Yes | Links on cards |
| `link-underline` #F59466 | `surface` #25211C | 7.09:1 | 3:1 | Yes | Link underline on cards |

#### Light, high-contrast feedback

| Foreground | Background | Ratio | Target | Pass | Used for |
|---|---|---|---|---|---|
| `on-correct` #FFFBF5 | `correct` #1E5BA8 | 6.53:1 | 4.5:1 | Yes | Correct answer text on its fill |
| `correct-text` #1E5BA8 | `surface` #FFFBF5 | 6.53:1 | 4.5:1 | Yes | "Correct answer" label on cards |
| `ink` #1D1A16 | `correct-tint` #DCE7F5 | 13.86:1 | 4.5:1 | Yes | Text on a solved clue |
| `correct-line` #1E5BA8 | `surface` #FFFBF5 | 6.53:1 | 3:1 | Yes | Correct border, solved square on a card |
| `correct-line` #1E5BA8 | `page` #F5EFE4 | 5.89:1 | 3:1 | Yes | Solved square on the page |
| `ink` #1D1A16 | `incorrect-tint` #FBE3D0 | 14.03:1 | 4.5:1 | Yes | Your wrong pick: text on its tint |
| `incorrect-text` #9A3F08 | `surface` #FFFBF5 | 6.60:1 | 4.5:1 | Yes | "Your answer" label and wrong-guess stamp on cards |
| `incorrect-text` #9A3F08 | `incorrect-tint` #FBE3D0 | 5.50:1 | 4.5:1 | Yes | "Your answer" label on its own tint |
| `incorrect-line` #B04A0C | `surface` #FFFBF5 | 5.32:1 | 3:1 | Yes | Wrong-pick border, used-clue square |
| `incorrect-line` #B04A0C | `incorrect-tint` #FBE3D0 | 4.44:1 | 3:1 | Yes | Wrong-pick border against its own fill |
| `on-incorrect` #FFFBF5 | `incorrect` #B04A0C | 5.32:1 | 3:1 | Yes | X icon on the wrong badge |
| `on-correct` #FFFBF5 | `correct` #1E5BA8 | 6.53:1 | 3:1 | Yes | Check icon on the correct badge |
| `on-play-accent` #FFFBF5 | `play-accent` #1D1A16 | 16.81:1 | 4.5:1 | Yes | Text on in-play accents (points marker) |
| `play-accent-text` #1D1A16 | `page` #F5EFE4 | 15.14:1 | 4.5:1 | Yes | In-play accent text on the page (best-moment stamp) |
| `chart-you-line` #FFFBF5 | `chart-you` #1D1A16 | 16.81:1 | 3:1 | Yes | The outline on your bar |
| `chart-you` #1D1A16 | `surface` #FFFBF5 | 16.81:1 | 3:1 | Yes | Your bar on the card |

#### Dark, high-contrast feedback

| Foreground | Background | Ratio | Target | Pass | Used for |
|---|---|---|---|---|---|
| `on-correct` #F3EBDE | `correct` #1F4F8F | 6.90:1 | 4.5:1 | Yes | Correct answer text on its fill |
| `correct-text` #A9CBF7 | `surface` #25211C | 9.58:1 | 4.5:1 | Yes | "Correct answer" label on cards |
| `ink` #F3EBDE | `correct-tint` #1B2A40 | 12.23:1 | 4.5:1 | Yes | Text on a solved clue |
| `correct-line` #8DB8F2 | `surface` #25211C | 7.82:1 | 3:1 | Yes | Correct border, solved square on a card |
| `correct-line` #8DB8F2 | `page` #1A1714 | 8.73:1 | 3:1 | Yes | Solved square on the page |
| `ink` #F3EBDE | `incorrect-tint` #4A2A16 | 10.86:1 | 4.5:1 | Yes | Your wrong pick: text on its tint |
| `incorrect-text` #FFB27A | `surface` #25211C | 9.06:1 | 4.5:1 | Yes | "Your answer" label and wrong-guess stamp on cards |
| `incorrect-text` #FFB27A | `incorrect-tint` #4A2A16 | 7.28:1 | 4.5:1 | Yes | "Your answer" label on its own tint |
| `incorrect-line` #F09A55 | `surface` #25211C | 7.20:1 | 3:1 | Yes | Wrong-pick border, used-clue square |
| `incorrect-line` #F09A55 | `incorrect-tint` #4A2A16 | 5.79:1 | 3:1 | Yes | Wrong-pick border against its own fill |
| `on-incorrect` #1A1714 | `incorrect` #F09A55 | 8.04:1 | 3:1 | Yes | X icon on the wrong badge |
| `on-correct` #F3EBDE | `correct` #1F4F8F | 6.90:1 | 3:1 | Yes | Check icon on the correct badge |
| `on-play-accent` #1A1714 | `play-accent` #F3EBDE | 15.09:1 | 4.5:1 | Yes | Text on in-play accents (points marker) |
| `play-accent-text` #F3EBDE | `page` #1A1714 | 15.09:1 | 4.5:1 | Yes | In-play accent text on the page (best-moment stamp) |
| `chart-you-line` #25211C | `chart-you` #F3EBDE | 13.52:1 | 3:1 | Yes | The outline on your bar |
| `chart-you` #F3EBDE | `surface` #25211C | 13.52:1 | 3:1 | Yes | Your bar on the card |

#### Feedback colours under simulated colour-vision deficiency

Luminance ratio / CIE76 delta E. A delta E above about 10 is easy to see; luminance is what survives greyscale.

| Theme | Pair | Normal | Protan | Deutan | Tritan |
|---|---|---|---|---|---|
| Light | Correct fill next to a wrong pick | 5.32 / 61 | 4.76 / 50 | 5.73 / 57 | 5.06 / 64 |
| Light | Solved square next to a used-clue square | 1.06 / 84 | 1.38 / 22 | 1.31 / 45 | 1.04 / 101 |
| Light | Correct border against an untouched option | 6.47 / 65 | 5.90 / 58 | 6.91 / 64 | 6.14 / 65 |
| Light | Wrong border against an untouched option | 6.10 / 83 | 8.16 / 66 | 5.28 / 60 | 5.89 / 92 |
| Light | Your bar next to the other bars | 1.12 / 66 | 1.14 / 38 | 1.26 / 48 | 1.12 / 71 |
| Light | The outline on your bar | 4.95 / 85 | 3.82 / 60 | 5.65 / 75 | 4.93 / 89 |
| Dark | Correct fill next to a wrong pick | 1.80 / 42 | 2.04 / 21 | 1.64 / 21 | 1.86 / 51 |
| Dark | Solved square next to a used-clue square | 2.07 / 93 | 2.89 / 34 | 1.71 / 38 | 2.07 / 119 |
| Dark | Correct border against an untouched option | 9.01 / 74 | 9.81 / 69 | 8.48 / 65 | 9.00 / 81 |
| Dark | Wrong border against an untouched option | 4.35 / 70 | 3.39 / 36 | 4.97 / 50 | 4.35 / 82 |
| Dark | Your bar next to the other bars | 1.52 / 57 | 1.25 / 33 | 1.67 / 44 | 1.45 / 59 |
| Dark | The outline on your bar | 6.44 / 83 | 5.24 / 64 | 7.17 / 77 | 6.16 / 83 |
| Light, high contrast | Solved square next to a used-clue square | 1.23 / 103 | 1.13 / 91 | 1.49 / 103 | 1.10 / 89 |
| Light, high contrast | Your bar next to the other bars | 4.42 / 45 | 4.35 / 44 | 4.47 / 45 | 4.42 / 45 |
| Dark, high contrast | Solved square next to a used-clue square | 1.09 / 86 | 1.33 / 78 | 1.04 / 86 | 1.14 / 78 |

Paper grain, measured on the rendered page: `ink-3` worst pixel 5.23:1 (light) and 6.16:1 (dark); `ink` worst pixel 13.87:1 and 13.84:1.

---

## Appendix B. The panel's grafts, and what we did with them

| From | Graft | Decision |
|---|---|---|
| C (judge 2) | Solid, ledged Next clue with an icon and "then worth 2" | Adopted: 48 px in the slot where the clue lands |
| C (judge 2) | Wrong guesses as a readable stamp; drop the pencil strike | Adopted everywhere, practice included |
| C (judge 2) | "Your mysteries" and "Review clues and the why" on results | Adopted |
| C (judge 2) | Shift correct toward a blue-leaning teal | Adopted (#0B6670); protan delta E 4 to 22 |
| C (judge 2) | The new points value in the status message | Adopted ("Now worth 3") |
| C (judge 2) | Forced-colours captures with a dark palette | Adopted; Chromium's dark forced palette is captured |
| B (judges 1, 2) | Difficulty words on the ticket and a one-line explainer | Adopted ("Fewer clues, more points. Then one number.") |
| B (judges 1, 2) | Suggestion rows that disambiguate, with a type icon; guessed answers kept but disabled | Adopted |
| B (judges 2, 3) | Result rows that lead with the player's clue and the crowd's top wrong guess | Adopted |
| B (judge 2) | One percentile that matches the chart | Adopted, from the same counts |
| B (judges 1, 2) | Words first in share rows; ✅ for the solve; ⬜ never ⬛ | Adopted, as category names (the PRD's semantics) rather than "City, clue 3:" |
| B (judge 2) | High-contrast feedback on the first settings sheet | Adopted: the in-play More menu and the top of Settings |
| B (judges 1, 3) | The Share button showing the player's mini grid | Adopted |
| B (judge 1) | Shape-coded difficulty | Adapted: inked pips (one, two, three dots) that go from sparse to dense; B's shapes come from Material 3 Expressive's library and would never feel owned |
| B (judge 1) | A tilted sticker and a drawn slash for celebration | Adapted: a tilted rubber-stamp best moment and one eft pen stroke as the slash |
| C (judge 3) | The live "N played" count on the ticket | Adopted from 50 finishers |
| C (judge 3) | A stranger-facing line, a legend and the URL inside the preview card | Adopted |
| B, C (judge 3) | Row labels on the preview grid that match the text | Adopted (category names) |
| B (judge 3) | Flat art for the preview image | Adopted: 87,842 bytes against the exploration's 477 KB |
| B (judge 3) | "Copied. Paste it in the chat." | Adopted in the PRD's wording |
| B (judge 3) | A dare through per-result challenge links (`/r/[code]`) | Adapted: the PRD already gives each result its own stateless `/s/{n}/{code}` page, and the dare lives in the challenge flow ("Can you beat me?") |
| B (judge 3) | The percentile in the share text after 50 finishers | Declined: PRD §3.5.1 keeps percentile, streak and time out of v1's text, and a stateless preview can't carry a live percentile either |
| A (judge 1, for C) | Proof-mark verdicts, the 4-3-2-1 numbers, the crop-safe card, the Encore number line, the highlighter wash | Already A's; kept, with the highlighter becoming an eft underline in dark |
| C (judge 1) | Night-sky palette and the lit-keyhole mark | Not carried over: they belong to C's story. Their lesson, one brand object that recurs everywhere, became the ticket |

---

## Sources

Research claims in this document cite their sources inline. The main ones:

- WCAG 2.2 Understanding documents: [contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [use of colour](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [pointer cancellation](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html), [label in name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html), [animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [three flashes](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html), [character key shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html), [focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [text spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html), [timing adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html), [dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [audio control](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html)
- ARIA Authoring Practices, [combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) [K]
- [Web Audio API](https://webaudio.github.io/web-audio-api/), [Audio Session](https://w3c.github.io/audio-session/), [MDN: Navigator.vibrate](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate), [MDN: Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share), [MDN: View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [NN/g on animation duration](https://www.nngroup.com/articles/animation-duration/), [Material dark theme](https://m2.material.io/design/color/dark-theme.html), [British Dyslexia Association style guide](https://www.bdadyslexia.org.uk/advice/employers/creating-a-dyslexia-friendly-workplace/dyslexia-friendly-style-guide)
- [Rello and Baeza-Yates on fonts and dyslexia](https://doi.org/10.1145/2513383.2513447), [Brysbaert on reading rate](https://doi.org/10.1016/j.jml.2019.104047), [Machado, Oliveira and Fernandes on CVD simulation](https://doi.org/10.1109/TVCG.2009.113), [Colour Blind Awareness](https://www.colourblindawareness.org/colour-blindness/), [Hoober on touch](https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php) [K]
- [canvas-confetti](https://github.com/catdad/canvas-confetti), [Lucide](https://lucide.dev), [Fontsource](https://github.com/fontsource/fontsource), [Fraunces](https://github.com/undercasetype/Fraunces), [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next), [SIL Open Font License](https://openfontlicense.org)
