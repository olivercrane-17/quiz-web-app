# Exploration C: after-hours mystery

*Design exploration, 31 October 2026. Direction: lean into the signature Mystery round, played after hours. Proposed name: **Glim**.*

Open [`index.html`](./index.html) in a browser to see every screen in Dawn (light) and Night (dark) side by side, with buttons that replay the clue reveal and the answer reveal. The PNGs in this folder are the same screens at 390 by 844 CSS px, plus the 1200 by 630 share image, captured by [`capture.js`](./capture.js). Every color comes from one file, [`tokens.js`](./tokens.js), which writes [`tokens.css`](./tokens.css) and [`tokens.json`](./tokens.json). [`contrast.js`](./contrast.js) measures every pairing from that same file, so the numbers below cannot drift from the CSS.

**The pitch in five lines**

1. Glim is old slang for a small light in the dark, and that is exactly what a clue is: one small light that shows you a little more of the answer.
2. The Daily lives in a night window, deep indigo lit by lantern gold, where tonight's three mysteries and the Encore are drawn as a constellation.
3. Clues arrive like evidence under a desk lamp: each new card rises into a gold beam, and a wrong guess gets a rubber stamp on the clue it was tried on.
4. It stays cosy, never creepy, with a wry narrator and music-box sounds, and the light theme, Dawn, is a printed star chart on warm paper that holds its own against the night.
5. Light never carries meaning alone: every state has an icon and a word, and all 140 measured pairings pass WCAG in both themes, color-blind simulation included.

---

## 1. Name

### Recommended: Glim

Rhymes with "dim". A glim is an old slang word for a light, a candle or a lantern, with older senses of "an eye" and "a glimpse"; "douse the glim" meant "put out the light" ([Wiktionary](https://en.wiktionary.org/wiki/glim), [Merriam-Webster](https://www.merriam-webster.com/dictionary/glim), [Dictionary.com](https://www.dictionary.com/browse/glim)). It shares a root with glimmer, gleam and glimpse.

Why it works:

- **It names the mechanic.** Every clue is a glim, one small light on the answer. The fewer you need, the sharper you were.
- **It names the look.** Light in the dark is the whole visual idea, so the name and the palette tell one story before a single animation plays.
- **It makes a mark.** The i in "glim" is drawn as a lit keyhole: a round dot over a flared slot, in lantern gold. A keyhole says mystery without saying crime, and the light behind the door says "come in". It also replaces the four-point sparkle, which most products now use to flag AI features, the wrong signal for a game whose trust story is careful checking.
- **It is short.** Four letters fit an app icon, a group-chat line ("Glim Daily #42 · 9/12") and a spoken sentence ("done today's Glim?"). It reads the same in Manchester, Mumbai, Toronto and Melbourne.

A happy accident: in C. S. Lewis's *The Silver Chair*, the owl who calls the "Parliament of Owls" is named Glimfeather ([LitCharts](https://www.litcharts.com/lit/the-silver-chair/chapter-4), [Narnia wiki](https://narnia.fandom.com/wiki/Parliament_of_Owls)). The practice question on screen 3 is about that very parliament.

What I checked (web searches on 31 October 2026):

- **Games:** only a tiny itch.io game called Glim ([itch.io](https://tommyowendesign.itch.io/glim)). Nothing in trivia or daily puzzles.
- **Other software uses the name:** "Glim: Daily Self Care Rituals" on the App Store ([App Store](https://apps.apple.com/us/app/-/id6757731063)), "Glim - Connect, Share & Chat", a social app ([AppPricingLab](https://apppricinglab.com/app/apple/6749034339)), and a corporate merchandise platform ([Capterra](https://www.capterra.ie/software/1104462/Glim)).
- **The risk:** the self-care app's "daily rituals" wording sits close to our own daily-ritual positioning, and all three are software. A web search is not a trademark search. The launch report should carry a clearance search in classes 9 and 41, plus a domain check, before the owner commits. `glim.app` in the prototype is a placeholder.

### Alternate 1: Moonwit

Wit by moonlight: cleverness and humour, after hours. It is coined, so it should be easier to own. Searches found no app or game called Moonwit; the nearest names were Mooniz, a 2011 puzzle game ([The App Whisperer](https://theappwhisperer.com/2011/05/our-app-of-the-day-mooniz/)), and BlinkWit, a memory game ([iClarified](https://www.iclarified.com/9346/blinkwit-10-released)). The whole visual system carries over, keyhole i included. Risks: moon marks are the uniform of sleep apps, and seven letters is long for an icon. Pick it if Glim fails clearance.

### Alternate 2: Starcase

Star (the night sky), case (a mystery to crack), and a pun on staircase, because a clue ladder is a staircase you walk down: 4, 3, 2, 1 points. In the share grid, the gold squares literally step down like stairs. No app or game with that exact name turned up; the nearest were Starchasers and Starstruck ([App Store](https://apps.apple.com/py/app/starstruck-puzzle-game/id6756177029)). Risks: autocorrect turns it into "staircase", and the pun needs explaining once. It is the cleverest of the three and the hardest to say aloud.

### Names tried and dropped

| Name | Why it is out | Evidence |
|---|---|---|
| Owlish | Owls are already a trivia cliché: Quiz Owl's, and Owl Games' TRIVIA 360 | [Adapty](https://adapty.io/paywall-library/quiz-owls-animal-trivia/), [Marlvel](https://marlvel.ai/api/llm/publishers/owl-games-ltd/overview) |
| Anything on "clue" or "clew" | Hasbro's game is Clue in the US and Cluedo elsewhere, and "clew" sounds the same | [Wikipedia](https://en.wikipedia.org/wiki/Cluedo) |
| Nightcap | A drink, for a game open to 13-year-olds | Our 13+ floor (decision 8) |
| Glimpsy | No clashes found, but it reads as a children's app | Search above |

---

## 2. Personality and voice

Glim is the friend who stays up late with a mystery novel and reads you the best bits. Think cosy mystery, not crime drama: the village sleuth who solves it over a cup of tea. Four traits:

- **Curious.** Every answer comes with a why, told like a story worth passing on.
- **Warm.** Celebrates you and never mocks you. A miss gets a shrug and a good fact.
- **Wry.** At most one wink per screen. Detective words are seasoning, never the meal.
- **Fair.** Says plainly what counts and what doesn't. No fake urgency, no guilt.

Voice rules:

- Plain words first, flavour second. Instructions, errors, streak and offline copy are always plain.
- Detective words (sleuth, case, cracked, evidence) live in headings and celebrations only.
- Never spooky: no blood, no bodies, and no "murder" in our own copy. Content may use a crime word when it is the fact itself, as with a group of crows.
- Numbers beat adjectives: "Solved on clue 2" beats "Amazing!".
- Follow the house style in [00-PROJECT-BRIEF.md](../../../00-PROJECT-BRIEF.md): no em dashes, no guilt-trips (synthesis 8.11).

Sample microcopy:

| Moment | Copy |
|---|---|
| Home greeting, evening | Good evening, sleuth. |
| Daily card | Daily #42 · Three mysteries and an Encore · About 4 minutes, and no clock to beat. |
| Primary button | Play the Daily |
| First clue, first Daily only | Guess, or tap Next clue. Fewer clues, more points. |
| Wrong guess (stamp on the clue) | Not chimpanzee |
| Wrong guess (polite status) | Not chimpanzee. Clue 2 is in. Now worth 3. |
| Next clue button | Next clue · then worth 2 |
| Clue 4 | Last clue. Pick one of these four. |
| Solved on clue 1 | Cracked it on the first clue. |
| Solved on clue 2 | Got it on clue 2. Nicely sleuthed. |
| Missed | This one got away. It was the koala. |
| Encore intro | Encore. One number, your best guess. |
| Encore result | You said 105. It's 109. Bullseye, 4% off. |
| Stop screen | Case closed for today. New mysteries at midnight. |
| Stop screen button | Done for today |
| Share copied | Copied. No spoilers inside. |
| Streak | 12 days running. |
| After a break | Best streak: 23 days. Today starts a new one. |
| Freeze used | Your streak is safe. A freeze covered yesterday. |
| Cold start | 37 sleuths have finished so far. Check back tonight to see where you land. |
| Offline | The Daily needs a connection. Practice works offline, but it isn't today's Daily. |
| Error | That didn't go through. Your answer is safe, so try again. |
| Practice, wrong answer | Not quite. It's a parliament. |

---

## 3. Color system

### The idea

Two themes, one story. **Night** (dark) is the sky itself: indigo rather than black, lit by lantern gold. **Dawn** (light) is a printed star chart: warm off-white paper printed in indigo, with touches of gold foil and faint coordinate rings in the top corner. The off-white follows the dyslexia-friendly advice in report 05 ([BDA](https://www.bdadyslexia.org.uk/advice/employers/creating-a-dyslexia-friendly-workplace/dyslexia-friendly-style-guide)). The Daily's card is a **night window** in both themes, so the brand moment survives a light-mode phone.

Luminous, never neon. Accents are high in lightness but soft in chroma (gold #FFC857, aqua #6BE6D5, lilac #B5A3FF, orange #FF8752), and the canvas is #11153F, not black, which follows report 05's warning against pure black with neon ([Material](https://m2.material.io/design/color/dark-theme.html)). No panel behind text is translucent; every card is opaque.

### Core tokens

| Token | Dawn | Night | Role |
|---|---|---|---|
| `bg-top` / `bg` / `bg-bottom` | #E9ECFF / #F5F3FA / #FBF9F4 | #0B0E2E / #11153F / #161B4B | The sky, top to bottom |
| `surface-1` / `-2` / `-3` | #FFFFFF / #F4F3FB / #E9E7F7 | #1A1F52 / #232963 / #2E3577 | Cards, inputs, active rows |
| `sheet` | #FFFFFF | #1E2459 | The why sheet |
| `night-1` / `night-2` | #181D58 / #2B2069 | same | The night window, in both themes |
| `text-1` / `text-2` / `text-dim` | #15183F / #474C7E / #555A8E | #F4F2FF / #BEC2EF / #AEB2E6 | Text, secondary text, dimmed answers |
| `line` / `line-ui` | #E3E1F0 / #7B81B5 | #2C3272 / #7A81D0 | Hairlines (decorative) / control borders (3:1) |
| `primary` / `on-primary` | #24287A / #FFFFFF | #FFC857 / #1B1442 | The one primary button per screen |
| `primary-ledge` | #C98A0F | #B9821A | The 4 px edge under primary buttons |
| `accent` / `on-accent` | #FFC23D / #1B1442 | #FFC857 / #1B1442 | Lantern gold fills |
| `accent-text` / `accent-strong` | #8A5A00 / #B57C00 | #FFD27A / #FFC857 | Gold text / gold graphics |
| `violet` / `violet-tint` | #6C5CE0 / #EEEBFF | #B5A3FF / #2C2A6B | Used clues, practice tiles |
| `correct` / `correct-fill` / `on-correct` | #0A6F78 / #DDF1F4 / #FFFFFF | #6BE6D5 / #0C3747 / #04282A | The right answer |
| `incorrect` / `incorrect-fill` / `on-incorrect` | #C4461A / #FFEBD9 / #FFFFFF | #FF8752 / #552A2A / #3A1208 | A wrong pick or guess |
| `selected` / `focus` | #4F46E5 / #4F46E5 | #9DA8FF / #FFD27A | Lock-in, focus rings |
| `link` / `warning` | #3B3FC4 / #9A5B00 | #B9C6FF / #FFB35C | Links, "Checking..." |
| `chart-dot` / `chart-you` | #8580CF / #B57C00 | #7471C6 / #FFC857 | The how-everyone-did chart |

Gold is the light, so it behaves differently by day. On paper, gold cannot carry text or a button edge (about 1.6:1 against white), so Dawn's primary button is ink indigo with a gold ledge, gold text darkens to `accent-text`, and gold graphics use `accent-strong`. Inside the night window, the button stays gold in both themes.

### Correct and incorrect are never color alone

| State | Icon or shape | Words | Other cues |
|---|---|---|---|
| Correct answer | A check replaces the letter badge | "Correct answer" pill | 2 px border; a double border in forced colors |
| Your wrong pick | An X replaces the letter badge | "Your answer" pill | A 6 px shake (a fade under reduced motion); a dashed border in forced colors |
| Wrong guess on a clue | X in a rubber stamp | "Not chimpanzee" | The stamp sits on the clue it was guessed on |
| Other options | Letter badge stays | Option text unchanged | Text stays at 5.9:1 (Dawn) and 8.0:1 (Night) |
| Clue path on the stop screen | Square position in a row of four | Accessible name, "Solved on clue 2" | Gold against violet, a blue-yellow pair |
| Practice progress | Check or X in each segment | Accessible name, "3 right, 1 wrong so far" | |

The state hues sit on the blue-yellow axis, the one red-green color vision keeps: a blue-leaning teal for correct and an orange-leaning red for incorrect. Simulated with the Machado, Oliveira and Fernandes 2009 model ([IEEE TVCG](https://doi.org/10.1109/TVCG.2009.113)), the borders and badges stay 45 to 69 delta E apart under protanopia and deuteranopia, and every state color still clears 3:1 against its surface. The optional **High-contrast feedback** setting (synthesis 6.8) swaps to blue and orange, as Wordle does, and passes too.

### Measured contrast

`node contrast.js` measures 110 foreground and background pairs (WCAG 2.2 formula, [W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)), 14 state colors under two simulations and 16 high-contrast pairs: 140 in all, and all pass. The tightest ones:

| Pair | Theme | Ratio | Target |
|---|---|---|---|
| `line-ui` on `bg-top` (progress segments on the sky) | Dawn | 3.17:1 | 3:1 |
| `line-ui` on `surface-2` (unfocused input) | Dawn | 3.37:1 | 3:1 |
| `chart-dot` on `surface-1` | Dawn | 3.51:1 | 3:1 |
| `accent-strong` on `surface-1` (solved square), deutan | Dawn | 3.36:1 | 3:1 |
| `on-incorrect` on `incorrect` ("Your answer" pill) | Dawn | 4.96:1 | 4.5:1 |
| `incorrect` on `surface-1` (stamp text) | Dawn | 4.96:1 | 4.5:1 |
| `accent-text` on `bg-top` | Dawn | 5.05:1 | 4.5:1 |
| `text-2` under the night window's lamp glow (brightest point) | Night | 5.42:1 | 4.5:1 |
| `chart-dot` on `surface-1` | Night | 3.61:1 | 3:1 |

The full tables are in Appendix A.

---

## 4. Typography

| Role | Family | License | Source | Latin woff2 |
|---|---|---|---|---|
| Display: headings, question stems, scores, stop-screen answers | **Bricolage Grotesque**, variable: weight 200 to 800, width 75 to 100%, optical size 12 to 96 ([repo](https://github.com/ateliertriay/bricolage)) | SIL OFL 1.1 | `@fontsource-variable/bricolage-grotesque` 5.3.0 | 131 KB (all three axes) |
| Text: clues, answers, explanations, UI | **Atkinson Hyperlegible Next**, variable: weight 200 to 800, by the Braille Institute ([repo](https://github.com/googlefonts/atkinson-hyperlegible-next)) | SIL OFL 1.1 | `@fontsource-variable/atkinson-hyperlegible-next` 5.3.0 | 34 KB |
| Mono: clue tags, case numbers, timers, chart axes | **Atkinson Hyperlegible Mono**, variable: weight 200 to 800 ([repo](https://github.com/googlefonts/atkinson-hyperlegible-next-mono)) | SIL OFL 1.1 | `@fontsource-variable/atkinson-hyperlegible-mono` 5.3.0 | 18 KB |

The license texts sit in [`fonts/`](./fonts). The packages were installed in a temporary folder, the three woff2 files copied out, and `node_modules` deleted.

Why these: Bricolage, narrowed to 88 to 92% width, gives the cinematic title-card feel, and its ink traps and rounded joins keep it friendly rather than noir. Atkinson Next does all the reading, as synthesis 8.9 asks. Its mono sibling gives tags and numbers a case-file voice without bringing in a third personality.

| Token | Use | Font | Size / line height | Weight |
|---|---|---|---|---|
| `score` | 9/12 | Bricolage, 90% width | 92 / 0.8 | 800 |
| `display-l` | Top 28% | Bricolage | 34 / 1.0 | 740 |
| `display-m` | Greeting, question stems | Bricolage, 90 to 92% | 28 to 30 / 1.1 | 700 to 740 |
| `display-s` | Verdicts, card titles, stop-screen answers | Bricolage | 19 to 24 / 1.1 | 720 to 740 |
| `text-l` | Newest clue, answer options | Atkinson Next | 18 to 18.5 / 1.34 | 600 |
| `text-m` | Explanations, body | Atkinson Next | 17 / 1.52 | 400 |
| `text-s` | Earlier clues, secondary lines | Atkinson Next | 15 to 15.5 / 1.42 | 400 |
| `label` | Buttons, chips, pills | Atkinson Next | 12.5 to 17 | 700 |
| `mono` | Tags, case numbers, timers | Atkinson Mono | 11 to 15 | 700 |

Rules: stems use `text-wrap: balance`; explanations stop at 65 characters a line; scores, timers and stats use tabular figures; answers are never all caps; emphasis is bold, never italic, and book titles stay roman.

Weight budget: only Atkinson Next (34 KB) is preloaded. The prototype ships Bricolage with all three axes (131 KB); production should instance it at a fixed 90% width with two weights using fonttools. For scale, the package's weight-only file is 41 KB.

---

## 5. Spacing, radius and elevation

**Spacing** runs on a 4 px base: 4, 8, 12, 16, 20, 24, 32, 40, 48 and 64. Screen gutters are 16 px. Answer buttons are at least 60 px tall with 10 px gaps (synthesis 8.2 starts at 56 and 12; we trade 2 px of gap for room under the why sheet, a value for playtests to tune).

**Radius:** 8 px for stamps and keys, 12 px for badges and list rows, 16 px for buttons, answers and inputs (synthesis 8.2), 20 px for cards, 28 px for the sheet, the night window and the stop-screen hero, and full pills for chips.

**Elevation.** In the dark, things are lit, not lifted: emphasis is a warmer edge and a glow, never a heavier shadow. On paper, things rest on indigo-tinted shadows. Nothing is glass.

| Level | Night | Dawn | Used for |
|---|---|---|---|
| e0 | Flat | Flat | The sky, dimmed answers |
| e1 | 1 px top highlight, soft shadow below | Two indigo-tinted shadows | Cards, chips, icon buttons |
| e2 | Stronger highlight and shadow | Deeper, wider shadow | The suggestion list |
| e3 | Shadow cast upward | Shadow cast upward | The why sheet |
| Lit | Gold ring plus gold glow | Gold ring plus amber shadow | The newest clue, the current mystery, the night window's edge |
| Ledge | 4 px solid bottom edge that sinks 2 px on press | Same | Answers, buttons, practice tiles |

---

## 6. Iconography

- A 24 px grid, 2 px strokes, round caps and joins. Fills only for paws, stars, seals and the play mark.
- Drawn for this direction: a **lantern with a flame** (streak), a **sealed envelope with a gold wax seal** (Next clue), the **keyhole** (brand), a **ringed planet** (the Encore in the constellation), a **target** (Encore error and Bullseye), a **stamp X** (wrong guesses), check and X (verdicts), a magnifier (the guess box), a flag (report), a moon (the Today tab) and one icon per answer type in suggestions (a paw for animals; a pin for cities, a bust for people and a film frame for films, to come).
- Every state icon travels with a word, every control has a 44 px hit area, and the star icon is used only for points. Background stars are decoration and never sit behind text.

---

## 7. Motion

Principles:

1. **Light reveals.** New information enters by being lit: it rises out of a slight blur into a lamp's beam. Nothing flies in from off-screen.
2. **Acknowledge fast, read slow.** The press answers in the same frame, the verdict lands by 400 ms, and reading is never timed.
3. **One flourish per moment.** A clue gets one beam, a wrong pick one shake, and only a perfect Daily gets a shower of stars.
4. **Reduced motion means still, not dead.** Every animation has a 160 ms fade in its place, and nothing that carries meaning is lost. An in-app setting overrides the OS either way.

| Token | Value | Used for |
|---|---|---|
| `dur-press` | 80 ms | Press and release |
| `dur-fast` | 160 ms | Fades, reduced-motion swaps |
| `dur-base` | 240 ms | Small state changes |
| `dur-reveal` | 400 ms | Press to verdict |
| `dur-sheet` | 360 ms | The why sheet rising |
| `dur-clue` | 560 ms | A clue card arriving |
| `dur-count` | 500 ms | Points counting up |
| `dur-celebrate` | 900 ms | The largest moment short of a perfect Daily |
| `ease-out` | cubic-bezier(0.16, 1, 0.3, 1) | Everything that arrives |
| `ease-in-out` | cubic-bezier(0.65, 0, 0.35, 1) | The shake |
| `ease-exit` | cubic-bezier(0.4, 0, 1, 1) | Things leaving |
| `ease-spring` | `linear()` curve with about 10% overshoot | Tags, seals, stars popping in |

### Clue reveal

See [`checks/motion-clue-reveal.png`](./checks/motion-clue-reveal.png) for frames at 0, 120, 240, 360, 560 and 1,000 ms.

| Time | What happens | Duration and easing |
|---|---|---|
| 0 ms | Next clue is tapped, or a wrong guess commits. The envelope's wax seal pops and the stamp lands on the clue just tried (spec) | 160 ms, spring |
| 0 to 560 ms | The new card rises 10 px and sharpens out of a 5 px blur | 560 ms, ease-out |
| 120 to 1,020 ms | A gold beam crosses the card once, like a torch passing over evidence | 900 ms, ease-out |
| 300 ms | The worth meter's fourth star dims and drops 3 px: Worth 3 | 260 ms, ease-out |
| 420 ms | The "Just in" tag pops | 260 ms, spring |
| 560 ms | A polite status line reads the clue and its new value. Focus stays in the guess box, so typing never stops | |

Sound: a paper slide and one celesta note. Under reduced motion: a 160 ms fade, no blur, no beam, and the star dims in place.

### Answer reveal in practice

This follows the synthesis 8.3 timeline. See [`checks/motion-answer-reveal.png`](./checks/motion-answer-reveal.png).

| Time | What happens | Duration and easing |
|---|---|---|
| 0 ms | `pointerdown`: the answer sinks 2 px onto its ledge and takes an indigo edge. Commit happens on `click`, so sliding off cancels | 80 ms, ease-out |
| 150 ms | Locked in: indigo border and fill (a 10 ms haptic on Android, if enabled) | |
| 400 ms | Reveal. The right answer turns teal and its check draws in (260 ms); a wrong pick turns orange-red with an X and a 6 px two-cycle shake (320 ms, ease-in-out); other options dim to `text-dim`; the pills slide in 8 px (200 ms) | 400 ms to verdict |
| 400 to 900 ms | Points count up in tabular figures, on correct answers only | 500 ms |
| About 1,200 ms | The why sheet rises as an overlay and nothing above it moves (CLS budget 0.05) | 360 ms, ease-out |
| Until tapped | Continue waits at the bottom of the sheet. Auto-advance stays opt-in | |

In ranked play the reveal waits for the server, and "Checking..." appears after 1.5 s.

### Solved, bullseye and the perfect Daily

A solve stamps the winning card with a teal "Solved · +3", fills that mystery's star in the header and draws the line to the next star (600 ms). A bullseye pulses the target once (240 ms). A perfect Daily, 12 of 12 plus a bullseye, gets the only full-screen moment: a slow shower of gold stars for 1.2 s, lazy-loaded, skippable, off under reduced motion, and never more than three flashes a second ([WCAG 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)).

---

## 8. Sound concept: the Lamplight kit

Everything is synthesized in Web Audio from a few oscillators and filtered noise. There are no sample files, the code stays well under the 30 KB budget, and it mixes with the player's own music instead of pausing it (synthesis 8.7, [Audio Session](https://w3c.github.io/audio-session/)). The palette is celesta and music box over felt: warm and close, like a parlour at night. Never a buzzer, never a thriller sting.

| Event | Sound | Length |
|---|---|---|
| Tap | A felt tick: a triangle wave through a low-pass filter | 30 ms |
| Clue reveal | A paper slide (band-passed noise), then one celesta note, a step lower for each clue (E5, D5, C5) | 260 ms |
| Wrong guess | A low, muted woodblock "tok" | 90 ms |
| Mystery solved | A rising music-box arpeggio with one note per point earned: four notes for a clue-1 solve, one for clue 4. You can hear how sharp you were | 120 to 480 ms |
| Practice correct | A two-note chime rising a fifth | Under 300 ms |
| Practice wrong | A soft felt thud | 120 ms |
| Encore bullseye | A bright "ting" with a slow shimmer (two detuned sines) | 600 ms |
| Done for today | A three-chord "nightcap" cadence on celesta | 1.2 s, skippable |

Defaults follow decision 8: effects start off on phones behind a visible speaker toggle, and the choice is remembered. Effects and music have separate controls, and there is no music in v1. The host screen starts with sound on. Android haptics (tap 10 ms, correct 20 ms, wrong 30-40-30 ms) sit behind their own toggle, and nothing depends on them.

---

## 9. The screens

| Screen | Light | Dark |
|---|---|---|
| 1. Home | [screen1-light.png](./screen1-light.png) | [screen1-dark.png](./screen1-dark.png) |
| 2. Mystery round | [screen2-light.png](./screen2-light.png) | [screen2-dark.png](./screen2-dark.png) |
| 3. Practice reveal | [screen3-light.png](./screen3-light.png) | [screen3-dark.png](./screen3-dark.png) |
| 4. Stop screen | [screen4-light.png](./screen4-light.png) | [screen4-dark.png](./screen4-dark.png) |
| 5. Share preview | [share.png](./share.png) | |

**1. Home.** The night window holds Daily #42, the live player count, tonight's constellation (mystery 1 lit and labelled "A city", then "An animal", "A person" and the Encore as a ringed planet), the title, one line ("About 4 minutes, and no clock to beat") and a gold Play the Daily. It is above the fold at 360 by 640, and one tap reaches clue 1 (synthesis 8.1). The streak card leads with the record ("Best 23 days"), marks the week with checks rather than color alone, shows today dashed and a freeze in hand, and never nags. Practice sits below with Quick play and Categories, "Any time, even offline".

**2. Mystery round.** The header holds Leave (progress is kept), the progress constellation (mystery 1 solved, mystery 2 lit, the rest ahead), "Mystery 2 of 3 · An animal" and a stopwatch the player can hide. Clue 1 carries its punched evidence tag and a "Not chimpanzee" stamp. Clue 2 is lit: a gold edge, "Just in" and a worth meter (three of four stars, "Worth 3"). The guess box is a combobox labelled "Guess the animal", with "Ko" typed; Next clue sits beside it in a sealed envelope, "then worth 2". Four 44 px suggestions come from the closed animal list, with the typed letters in bold and the active one marked by a gold bar and a "Guess" pill, so nothing depends on color. The keyboard is drawn to prove the layout survives it. At 320 px a container query moves Next clue above the input and drops the answer type from the header, since the input label already says it.

**3. Practice reveal.** "What do you call a group of owls?" The player picked A murder: orange-red, an X and "Your answer". A parliament is teal, with a check and "Correct answer". The other two dim and stay readable. The why sheet holds the verdict, a 31-word explanation, Learn more (a Wikipedia search, per decision 10), Report a problem and Continue. Screen readers hear "Not quite. You chose A murder. The answer is A parliament." from a polite status region. At 320 px the pills drop under the answer text instead of squeezing it.

**4. Stop screen.** It opens on the best fact ("Your best Daily yet"), then 9 of 12, "Top 28% so far today" and "You beat 72% of 13,927 players". How everyone did is a unit chart: one row of two dots per 1% of players, so the columns read as a sky of stars, with your column in gold and labelled "You" (not color alone). One row per mystery shows the answer, its type, a crowd stat revealed after commit, the points and the clue path in the share colors. The Encore row reads "109 Earths · you said 105, so 4% off" with a Bullseye chip. "Review clues and the why" covers the miss review. Done for today is the only primary button, Share is secondary, and the countdown sits under them ("Next Daily in 2h 13m", which is midnight minus the 21:47 on the status bar) with a soft Practice link.

**5. Share.** The text, words first and the path-only link last:

```
Glim Daily #42 · 9/12 · Encore 4% off
🟨⬛⬛⬛
🟪🟨⬛⬛
🟪🟪🟨⬛
glim.app/d/42
```

- A screen reader hears "Glim Daily number 42, 9 slash 12, Encore 4% off" before any squares (synthesis 8.8).
- Gold is the clue that cracked it, violet a clue used, black a clue never needed. A miss is four violet squares. The gold steps down the rows like a staircase, the clue ladder made visible.
- Gold and violet rather than green and red: they are our lantern and our dusk, they hold up in WhatsApp and iMessage in both themes, and they are a blue-yellow pair that red-green color blindness keeps apart. Wordle players know 🟨 as "close"; here it means "cracked", and the legend on the preview image says so.
- The 1200 by 630 preview shows the night sky, the wordmark, Daily #42, 9/12, "Encore 4% off", "Top 28% so far today", the grid with a dashed gold line joining the solved squares into a constellation, a legend and the link. Never an answer.

The sample content on these screens was checked by me, but it has not been through the content team's two independent checks yet. Koala fingerprints closely resembling ours comes from Maciej Henneberg's 1990s work, which at least one researcher disputed ([PBS NOVA](https://www.pbs.org/wgbh/nova/article/koala-fingerprints/)). Koalas sleep about 18 to 22 hours a day ([National Geographic Brasil](https://www.nationalgeographicbrasil.com/animais/2023/03/quantas-horas-um-coala-dorme-por-dia)). Chapter 4 of *The Silver Chair* is "A Parliament of Owls" ([Wikipedia](https://en.wikipedia.org/wiki/The_Silver_Chair)). The Sun is about 109 Earths wide ([Caltech Cool Cosmos](https://coolcosmos.ipac.caltech.edu/ask/5-How-large-is-the-Sun-compared-to-Earth)).

---

## 10. Checks I ran

- **`node capture.js --checks`** opens the page in the machine's Chromium (it never runs `playwright install`) and audits each screen. At 390 by 844: all three fonts load, the shortest answer button is 60 px, the shortest suggestion 44 px, the shortest button 56 px, no control is under 44 px and nothing spills off-screen. The same audit passes at 320 px wide ([`checks/`](./checks)).
- **`node contrast.js --check`**: all 140 pairings pass (Appendix A).
- **Forced colors:** [`checks/screen3-light-forced-colors.png`](./checks/screen3-light-forced-colors.png) and [`checks/screen3-dark-forced-colors.png`](./checks/screen3-dark-forced-colors.png) show the states carried by double and dashed borders, icons and words.
- **Motion:** frames frozen with the Web Animations API, in [`checks/motion-clue-reveal.png`](./checks/motion-clue-reveal.png) and [`checks/motion-answer-reveal.png`](./checks/motion-answer-reveal.png).
- **2x copies** of every screen sit in [`hires/`](./hires) for close inspection.

---

## 11. Risks and open questions

1. **It could read as a sleep app.** Indigo, stars and moons are also the uniform of sleep and meditation apps. Our counterweights are gold and orange-red energy, a chunky display face, springy motion, wry copy and a keyhole instead of a moon. Persona playtests should ask "what is this app?" at first glance.
2. **Name clearance,** covered in section 1.
3. **Two primary colors.** The primary button is gold at night and ink in Dawn (gold inside the night window). That is deliberate, but the design system must say which wins on any new dark surface.
4. **Typing on short phones.** At 844 px tall, four suggestions fit above the keyboard. On a 667 px phone only two show, and the list scrolls. Next clue must stay visible in every layout, and the four options on clue 4 keep the mystery finishable without typing.
5. **Font weight.** 131 KB of Bricolage in the prototype; the production plan is in section 4.
6. **Stars in production.** The prototype paints seeded SVG stars around the text. The app should ship one static SVG per layout, with no JavaScript and no images behind text.
7. **Crime words in content.** "A murder" (of crows) is a fact and a fun distractor, but it brushes against the not-creepy rule. CONTENT_GUIDE.md should say where crime words are welcome.

---

## Appendix A. Measured contrast

Output of `node contrast.js`, pasted unedited. Ratios use the WCAG 2.2 relative-luminance formula. Simulations use the Machado, Oliveira and Fernandes 2009 matrices at full severity, in linear RGB.

#### Dawn (light)

| Foreground | Background | Ratio | Target | Pass | Used for |
|---|---|---|---|---|---|
| `text-1` #15183F | `bg-top` #E9ECFF | 14.51:1 | 4.5:1 | yes | Headings and labels on the sky (top of screen) |
| `text-1` #15183F | `bg-bottom` #FBF9F4 | 16.17:1 | 4.5:1 | yes | Headings and labels on the sky (bottom of screen) |
| `text-1` #15183F | `surface-1` #FFFFFF | 17.01:1 | 4.5:1 | yes | Clue text, answers, card text |
| `text-1` #15183F | `surface-2` #F4F3FB | 15.44:1 | 4.5:1 | yes | Typed guess, chips |
| `text-1` #15183F | `surface-3` #E9E7F7 | 13.97:1 | 4.5:1 | yes | Active suggestion, pressed answer |
| `text-1` #15183F | `sheet` #FFFFFF | 17.01:1 | 4.5:1 | yes | Explanation sheet |
| `text-2` #474C7E | `bg-top` #E9ECFF | 6.88:1 | 4.5:1 | yes | Secondary text on the sky (top) |
| `text-2` #474C7E | `bg-bottom` #FBF9F4 | 7.67:1 | 4.5:1 | yes | Secondary text on the sky (bottom) |
| `text-2` #474C7E | `surface-1` #FFFFFF | 8.07:1 | 4.5:1 | yes | Secondary text on cards, earlier clues |
| `text-2` #474C7E | `surface-2` #F4F3FB | 7.32:1 | 4.5:1 | yes | Input label, chip text |
| `text-2` #474C7E | `surface-3` #E9E7F7 | 6.62:1 | 4.5:1 | yes | Secondary text on the active suggestion |
| `text-2` #474C7E | `sheet` #FFFFFF | 8.07:1 | 4.5:1 | yes | Links row on the sheet |
| `text-dim` #555A8E | `bg` #F5F3FA | 5.89:1 | 4.5:1 | yes | Dimmed answers after a reveal (they stay readable) |
| `text-dim` #555A8E | `bg-bottom` #FBF9F4 | 6.16:1 | 4.5:1 | yes | Dimmed answers, lowest point of the sky |
| `accent-text` #8A5A00 | `surface-1` #FFFFFF | 5.93:1 | 4.5:1 | yes | Gold text on cards ("Worth 3", best-fact line) |
| `accent-text` #8A5A00 | `bg-top` #E9ECFF | 5.05:1 | 4.5:1 | yes | Gold text on the sky |
| `accent-text` #8A5A00 | `accent-tint` #FFF1CC | 5.28:1 | 4.5:1 | yes | Best-fact pill |
| `on-primary` #FFFFFF | `primary` #24287A | 12.65:1 | 4.5:1 | yes | Primary button label |
| `on-accent` #1B1442 | `accent` #FFC23D | 10.64:1 | 4.5:1 | yes | Label on gold fills (night-window button, Guess pill) |
| `text-1` #15183F | `correct-fill` #DDF1F4 | 14.55:1 | 4.5:1 | yes | Answer text on the correct answer |
| `text-1` #15183F | `incorrect-fill` #FFEBD9 | 14.69:1 | 4.5:1 | yes | Answer text on a wrong pick |
| `text-1` #15183F | `selected-fill` #ECEBFF | 14.50:1 | 4.5:1 | yes | Answer text while locked in |
| `text-1` #15183F | `violet-tint` #EEEBFF | 14.55:1 | 4.5:1 | yes | Text on violet chips |
| `on-correct` #FFFFFF | `correct` #0A6F78 | 5.90:1 | 4.5:1 | yes | "Correct answer" pill and check badge |
| `on-incorrect` #FFFFFF | `incorrect` #C4461A | 4.96:1 | 4.5:1 | yes | "Your answer" pill and X badge |
| `link` #3B3FC4 | `sheet` #FFFFFF | 7.79:1 | 4.5:1 | yes | "Learn more" link |
| `link` #3B3FC4 | `surface-1` #FFFFFF | 7.79:1 | 4.5:1 | yes | Links on cards |
| `warning` #9A5B00 | `surface-1` #FFFFFF | 5.43:1 | 4.5:1 | yes | "Checking..." and offline notes |
| `line-ui` #7B81B5 | `surface-1` #FFFFFF | 3.72:1 | 3:1 | yes | Borders of inputs, secondary buttons and answers |
| `line-ui` #7B81B5 | `surface-2` #F4F3FB | 3.37:1 | 3:1 | yes | Input border, unfocused |
| `line-ui` #7B81B5 | `bg-bottom` #FBF9F4 | 3.53:1 | 3:1 | yes | Answer borders on the sky |
| `primary` #24287A | `bg-bottom` #FBF9F4 | 12.03:1 | 3:1 | yes | Primary button against the screen |
| `primary` #24287A | `sheet` #FFFFFF | 12.65:1 | 3:1 | yes | Primary button against the sheet |
| `focus` #4F46E5 | `bg-top` #E9ECFF | 5.36:1 | 3:1 | yes | Focus ring on the sky |
| `focus` #4F46E5 | `surface-1` #FFFFFF | 6.29:1 | 3:1 | yes | Focus ring on cards |
| `focus` #4F46E5 | `sheet` #FFFFFF | 6.29:1 | 3:1 | yes | Focus ring on the sheet |
| `correct` #0A6F78 | `bg-bottom` #FBF9F4 | 5.61:1 | 3:1 | yes | Correct answer border against the sky |
| `correct` #0A6F78 | `correct-fill` #DDF1F4 | 5.05:1 | 3:1 | yes | Correct border against its own fill |
| `incorrect` #C4461A | `bg-bottom` #FBF9F4 | 4.71:1 | 3:1 | yes | Wrong-pick border against the sky |
| `incorrect` #C4461A | `incorrect-fill` #FFEBD9 | 4.28:1 | 3:1 | yes | Wrong-pick border against its own fill |
| `incorrect` #C4461A | `surface-1` #FFFFFF | 4.96:1 | 4.5:1 | yes | Wrong-guess stamp text on a clue card |
| `selected` #4F46E5 | `surface-1` #FFFFFF | 6.29:1 | 3:1 | yes | Lock-in border, focused input |
| `selected` #4F46E5 | `surface-2` #F4F3FB | 5.71:1 | 3:1 | yes | Focused input border |
| `accent-strong` #B57C00 | `surface-1` #FFFFFF | 3.59:1 | 3:1 | yes | Solved-on square, current progress star |
| `violet` #6C5CE0 | `surface-1` #FFFFFF | 4.95:1 | 3:1 | yes | Used-clue square |
| `chart-dot` #8580CF | `surface-1` #FFFFFF | 3.51:1 | 3:1 | yes | Distribution chart dots |
| `chart-you` #B57C00 | `surface-1` #FFFFFF | 3.59:1 | 3:1 | yes | Your column in the chart |
| `accent` #FFC23D | `night-1` #181D58 | 9.62:1 | 3:1 | yes | Gold button and stars in the night window |
| `line-ui` #7B81B5 | `bg-top` #E9ECFF | 3.17:1 | 3:1 | yes | Progress segments and chips on the sky |
| `text-1` #15183F | `tabbar` #FFFFFF | 17.01:1 | 4.5:1 | yes | Current tab label |
| `text-2` #474C7E | `tabbar` #FFFFFF | 8.07:1 | 4.5:1 | yes | Other tab labels |

| State color vs surface | Normal | Protan | Deutan | Pass (3:1 all) |
|---|---|---|---|---|
| `correct` on `bg-bottom` | 5.61 | 5.12 | 5.98 | yes |
| `incorrect` on `bg-bottom` | 4.71 | 6.14 | 4.09 | yes |
| `correct` on `surface-1` | 5.90 | 5.41 | 6.28 | yes |
| `incorrect` on `surface-1` | 4.96 | 6.48 | 4.29 | yes |
| `selected` on `surface-1` | 6.29 | 5.10 | 5.94 | yes |
| `accent-strong` on `surface-1` | 3.59 | 4.02 | 3.36 | yes |
| `violet` on `surface-1` | 4.95 | 4.53 | 5.02 | yes |

| Correct vs incorrect | Normal | Protan | Deutan |
|---|---|---|---|
| Borders and badges, delta E (CIE76) | 95 | 51 | 69 |
| Fills, delta E (CIE76) | 18 | 13 | 16 |
| Simulated borders | #0A6F78 / #C4461A | #656A79 / #6B5E11 | #576078 / #8A7A12 |

#### Night (dark)

| Foreground | Background | Ratio | Target | Pass | Used for |
|---|---|---|---|---|---|
| `text-1` #F4F2FF | `bg-top` #0B0E2E | 17.01:1 | 4.5:1 | yes | Headings and labels on the sky (top of screen) |
| `text-1` #F4F2FF | `bg-bottom` #161B4B | 14.69:1 | 4.5:1 | yes | Headings and labels on the sky (bottom of screen) |
| `text-1` #F4F2FF | `surface-1` #1A1F52 | 13.95:1 | 4.5:1 | yes | Clue text, answers, card text |
| `text-1` #F4F2FF | `surface-2` #232963 | 12.11:1 | 4.5:1 | yes | Typed guess, chips |
| `text-1` #F4F2FF | `surface-3` #2E3577 | 10.04:1 | 4.5:1 | yes | Active suggestion, pressed answer |
| `text-1` #F4F2FF | `sheet` #1E2459 | 13.08:1 | 4.5:1 | yes | Explanation sheet |
| `text-2` #BEC2EF | `bg-top` #0B0E2E | 10.88:1 | 4.5:1 | yes | Secondary text on the sky (top) |
| `text-2` #BEC2EF | `bg-bottom` #161B4B | 9.40:1 | 4.5:1 | yes | Secondary text on the sky (bottom) |
| `text-2` #BEC2EF | `surface-1` #1A1F52 | 8.92:1 | 4.5:1 | yes | Secondary text on cards, earlier clues |
| `text-2` #BEC2EF | `surface-2` #232963 | 7.75:1 | 4.5:1 | yes | Input label, chip text |
| `text-2` #BEC2EF | `surface-3` #2E3577 | 6.42:1 | 4.5:1 | yes | Secondary text on the active suggestion |
| `text-2` #BEC2EF | `sheet` #1E2459 | 8.37:1 | 4.5:1 | yes | Links row on the sheet |
| `text-dim` #AEB2E6 | `bg` #11153F | 8.57:1 | 4.5:1 | yes | Dimmed answers after a reveal (they stay readable) |
| `text-dim` #AEB2E6 | `bg-bottom` #161B4B | 7.98:1 | 4.5:1 | yes | Dimmed answers, lowest point of the sky |
| `accent-text` #FFD27A | `surface-1` #1A1F52 | 10.83:1 | 4.5:1 | yes | Gold text on cards ("Worth 3", best-fact line) |
| `accent-text` #FFD27A | `bg-top` #0B0E2E | 13.21:1 | 4.5:1 | yes | Gold text on the sky |
| `accent-text` #FFD27A | `accent-tint` #3A3352 | 8.31:1 | 4.5:1 | yes | Best-fact pill |
| `on-primary` #1B1442 | `primary` #FFC857 | 11.14:1 | 4.5:1 | yes | Primary button label |
| `on-accent` #1B1442 | `accent` #FFC857 | 11.14:1 | 4.5:1 | yes | Label on gold fills (night-window button, Guess pill) |
| `text-1` #F4F2FF | `correct-fill` #0C3747 | 11.49:1 | 4.5:1 | yes | Answer text on the correct answer |
| `text-1` #F4F2FF | `incorrect-fill` #552A2A | 10.85:1 | 4.5:1 | yes | Answer text on a wrong pick |
| `text-1` #F4F2FF | `selected-fill` #2B3277 | 10.40:1 | 4.5:1 | yes | Answer text while locked in |
| `text-1` #F4F2FF | `violet-tint` #2C2A6B | 11.51:1 | 4.5:1 | yes | Text on violet chips |
| `on-correct` #04282A | `correct` #6BE6D5 | 10.36:1 | 4.5:1 | yes | "Correct answer" pill and check badge |
| `on-incorrect` #3A1208 | `incorrect` #FF8752 | 6.96:1 | 4.5:1 | yes | "Your answer" pill and X badge |
| `link` #B9C6FF | `sheet` #1E2459 | 8.67:1 | 4.5:1 | yes | "Learn more" link |
| `link` #B9C6FF | `surface-1` #1A1F52 | 9.24:1 | 4.5:1 | yes | Links on cards |
| `warning` #FFB35C | `surface-1` #1A1F52 | 8.71:1 | 4.5:1 | yes | "Checking..." and offline notes |
| `line-ui` #7A81D0 | `surface-1` #1A1F52 | 4.32:1 | 3:1 | yes | Borders of inputs, secondary buttons and answers |
| `line-ui` #7A81D0 | `surface-2` #232963 | 3.75:1 | 3:1 | yes | Input border, unfocused |
| `line-ui` #7A81D0 | `bg-bottom` #161B4B | 4.55:1 | 3:1 | yes | Answer borders on the sky |
| `primary` #FFC857 | `bg-bottom` #161B4B | 10.56:1 | 3:1 | yes | Primary button against the screen |
| `primary` #FFC857 | `sheet` #1E2459 | 9.40:1 | 3:1 | yes | Primary button against the sheet |
| `focus` #FFD27A | `bg-top` #0B0E2E | 13.21:1 | 3:1 | yes | Focus ring on the sky |
| `focus` #FFD27A | `surface-1` #1A1F52 | 10.83:1 | 3:1 | yes | Focus ring on cards |
| `focus` #FFD27A | `sheet` #1E2459 | 10.16:1 | 3:1 | yes | Focus ring on the sheet |
| `correct` #6BE6D5 | `bg-bottom` #161B4B | 10.76:1 | 3:1 | yes | Correct answer border against the sky |
| `correct` #6BE6D5 | `correct-fill` #0C3747 | 8.41:1 | 3:1 | yes | Correct border against its own fill |
| `incorrect` #FF8752 | `bg-bottom` #161B4B | 6.84:1 | 3:1 | yes | Wrong-pick border against the sky |
| `incorrect` #FF8752 | `incorrect-fill` #552A2A | 5.05:1 | 3:1 | yes | Wrong-pick border against its own fill |
| `incorrect` #FF8752 | `surface-1` #1A1F52 | 6.49:1 | 4.5:1 | yes | Wrong-guess stamp text on a clue card |
| `selected` #9DA8FF | `surface-1` #1A1F52 | 6.96:1 | 3:1 | yes | Lock-in border, focused input |
| `selected` #9DA8FF | `surface-2` #232963 | 6.04:1 | 3:1 | yes | Focused input border |
| `accent-strong` #FFC857 | `surface-1` #1A1F52 | 10.02:1 | 3:1 | yes | Solved-on square, current progress star |
| `violet` #B5A3FF | `surface-1` #1A1F52 | 7.08:1 | 3:1 | yes | Used-clue square |
| `chart-dot` #7471C6 | `surface-1` #1A1F52 | 3.61:1 | 3:1 | yes | Distribution chart dots |
| `chart-you` #FFC857 | `surface-1` #1A1F52 | 10.02:1 | 3:1 | yes | Your column in the chart |
| `accent` #FFC857 | `night-1` #181D58 | 10.07:1 | 3:1 | yes | Gold button and stars in the night window |
| `line-ui` #7A81D0 | `bg-top` #0B0E2E | 5.27:1 | 3:1 | yes | Progress segments and chips on the sky |
| `text-1` #F4F2FF | `tabbar` #141846 | 15.21:1 | 4.5:1 | yes | Current tab label |
| `text-2` #BEC2EF | `tabbar` #141846 | 9.73:1 | 4.5:1 | yes | Other tab labels |
| `text-1` #F4F2FF | `night-1` #181D58 | 14.01:1 | 4.5:1 | yes | Night window title (lightest corner) |
| `text-1` #F4F2FF | `night-2` #2B2069 | 12.55:1 | 4.5:1 | yes | Night window title (violet corner) |
| `text-2` #BEC2EF | `night-1` #181D58 | 8.97:1 | 4.5:1 | yes | Night window labels and constellation names |
| `text-2` #BEC2EF | `night-2` #2B2069 | 8.03:1 | 4.5:1 | yes | Night window labels, violet corner |
| `accent-text` #FFD27A | `night-1` #181D58 | 10.88:1 | 4.5:1 | yes | "Daily #42" in the night window |
| `text-2` #BEC2EF | `night-glow` #4B4358 | 5.42:1 | 4.5:1 | yes | "12,408 playing today" under the lamp glow (brightest point) |
| `text-1` #F4F2FF | `night-glow` #4B4358 | 8.47:1 | 4.5:1 | yes | Title text if it ever reaches the glow |
| `on-accent` #1B1442 | `accent` #FFC857 | 11.14:1 | 4.5:1 | yes | Play the Daily (gold button in the night window) |

| State color vs surface | Normal | Protan | Deutan | Pass (3:1 all) |
|---|---|---|---|---|
| `correct` on `bg-bottom` | 10.76 | 11.25 | 10.21 | yes |
| `incorrect` on `bg-bottom` | 6.84 | 5.40 | 7.69 | yes |
| `correct` on `surface-1` | 10.21 | 10.65 | 9.72 | yes |
| `incorrect` on `surface-1` | 6.49 | 5.11 | 7.32 | yes |
| `selected` on `surface-1` | 6.96 | 7.00 | 6.82 | yes |
| `accent-strong` on `surface-1` | 10.02 | 8.83 | 10.65 | yes |
| `violet` on `surface-1` | 7.08 | 6.92 | 7.09 | yes |

| Correct vs incorrect | Normal | Protan | Deutan |
|---|---|---|---|
| Borders and badges, delta E (CIE76) | 96 | 45 | 58 |
| Fills, delta E (CIE76) | 36 | 17 | 27 |
| Simulated borders | #6BE6D5 / #FF8752 | #DCDBD4 / #A8984C | #C9CCD7 / #C5B250 |

#### High-contrast feedback setting (blue and orange)

| Theme | Pair | Ratio | Target | Pass |
|---|---|---|---|---|
| light | `correct` #1F5FD1 on `bg-bottom` #FBF9F4 | 5.52:1 | 3:1 | yes |
| light | `incorrect` #B35400 on `bg-bottom` #FBF9F4 | 4.77:1 | 3:1 | yes |
| light | `on-correct` #FFFFFF on `correct` #1F5FD1 | 5.81:1 | 4.5:1 | yes |
| light | `on-incorrect` #FFFFFF on `incorrect` #B35400 | 5.02:1 | 4.5:1 | yes |
| light | `text-1` #15183F on `correct-fill` #E4EDFF | 14.47:1 | 4.5:1 | yes |
| light | `text-1` #15183F on `incorrect-fill` #FFEEDD | 15.01:1 | 4.5:1 | yes |
| light | `correct` #1F5FD1 on `correct-fill` #E4EDFF | 4.94:1 | 3:1 | yes |
| light | `incorrect` #B35400 on `incorrect-fill` #FFEEDD | 4.43:1 | 3:1 | yes |
| dark | `correct` #7CB8FF on `bg-bottom` #161B4B | 7.86:1 | 3:1 | yes |
| dark | `incorrect` #FFA14A on `bg-bottom` #161B4B | 8.08:1 | 3:1 | yes |
| dark | `on-correct` #081A33 on `correct` #7CB8FF | 8.42:1 | 4.5:1 | yes |
| dark | `on-incorrect` #2E1500 on `incorrect` #FFA14A | 8.54:1 | 4.5:1 | yes |
| dark | `text-1` #F4F2FF on `correct-fill` #16325E | 11.50:1 | 4.5:1 | yes |
| dark | `text-1` #F4F2FF on `incorrect-fill` #4A2A12 | 11.64:1 | 4.5:1 | yes |
| dark | `correct` #7CB8FF on `correct-fill` #16325E | 6.15:1 | 3:1 | yes |
| dark | `incorrect` #FFA14A on `incorrect-fill` #4A2A12 | 6.41:1 | 3:1 | yes |

All pairs pass.

## Appendix B. Files

| File | What it is |
|---|---|
| [`index.html`](./index.html), [`styles.css`](./styles.css) | The prototype: one template per screen, rendered in Dawn and Night, plus the share card |
| [`tokens.js`](./tokens.js) → [`tokens.css`](./tokens.css), [`tokens.json`](./tokens.json) | Color, type, spacing, radius, elevation and motion tokens. Run `node tokens.js` after editing |
| [`contrast.js`](./contrast.js) | Contrast and color-vision checks; `--check` exits 1 on any failure |
| [`capture.js`](./capture.js) | Screenshots and audits; `--checks` adds 2x copies, 320 px reflow, forced colors and motion frames |
| [`fonts/`](./fonts) | Three woff2 files and their OFL license texts |
| `screen1-light.png` to `screen4-dark.png`, `share.png` | The deliverable captures |
| [`hires/`](./hires), [`checks/`](./checks) | 2x copies, 320 px reflow, forced colors, motion filmstrips |
