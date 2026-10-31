# Knewt: design exploration A, warm editorial

*Senior product design, 31 October 2026. Direction: premium calm in the spirit of the best newspaper puzzle sections, made warmer and more playful. Binding inputs: [02-PRODUCT-DECISIONS.md](../../../02-PRODUCT-DECISIONS.md), sections 1, 5, 6 and 8 of [SYNTHESIS.md](../../../research/SYNTHESIS.md) and [05-ux-ui-best-practices.md](../../../research/05-ux-ui-best-practices.md).*

**The idea in one paragraph.** A sheet of warm newsprint, black ink and one confident orange. Each Daily arrives as a ticket you tear off. The clue ladder is drawn as a real ladder with a rail, and a points marker slides down it one rung per clue. Verdicts are marked the way an editor marks a proof: right answers get a stamp, wrong picks get a pencil strike. Fraunces, a soft and slightly wonky old-style serif, carries the personality. Atkinson Hyperlegible Next carries everything you read. Motion behaves like paper and ink, so things lift, sink, unfold and get stamped, and nothing spins.

**What to open.** `index.html` shows every screen in both themes. The PNGs are listed in section 11. All colour numbers here are measured by `contrast.js` from `tokens.json`, the same file that generates `tokens.css`.

---

## 1. Name

The owner picks the name (decision 12). Three coined candidates, one recommended. No trademark search was possible from here, so every name below needs one before launch.

### Recommended: Knewt

- **Say it "newt".** It is "knew it" with the ending worn smooth: the thing people say out loud when clue 2 lands. One syllable, five letters, not a dictionary word.
- **It gives us a mark that explains the game.** The mark is a newt curled into a question mark. Its head is the ball terminal, its tail is the stem, and the dot stays a dot. Below 32 px it reads simply as "?", and from 48 px up you see the legs and the eye. Small-animal colophons are an old publishing habit (Penguin, Puffin, Pelican) [K], which suits an editorial brand.
- **It survives the group chat.** `Knewt #42 · 9/12 · Encore 4% off` scans cleanly, and "Did you get today's Knewt?" works as a sentence.
- **One wink, used once.** The solved headline is "Knew it." The spelling joke lives in the name and never in UI copy.
- **Risks, honestly.** People who only hear it may type "newt"; most of our spread is pasted text that shows the spelling, but we should register the obvious typo domains. "Pissed as a newt" is a common British idiom for drunk, and "Newt" recalls Newt Gingrich for some US players. Both are mild, but real. An edtech brand called Knewton existed [K].

### Alternate: Kenling

"Ken" means to know ("beyond my ken"), and "-ling" is the small, fond suffix of inkling and darling. A Kenling is a little bit of knowing. It is the most literary of the three, easy to spell from hearing, and suits a purely typographic identity with no mascot. Risks: it needs a sentence of explanation, it is quieter in a feed, and some will hear Barbie's Ken.

### Alternate: Pennydrop

From "the penny drops", the click of finally getting it. Copper would become the accent, and the mark would be the dot of a question mark dropping into place. Risks: at nine letters it is the longest, the idiom is more British and Commonwealth than American, and a coin reads as in-game currency in most mobile games. We sell nothing, so the mark must never be a coin.

**Considered and dropped.** Inkling (a real word, and Nintendo's Splatoon characters are called Inklings [K]). Inklet (one letter from "inkjet" in search, and close to the studio inkle and its ink and Inky tools [K]). Kenning (lovely, but a real word, so not coined). Clew (sounds exactly like Hasbro's Clue [K]). Oho (an interjection, hard to own and impossible to search for).

`[K]` marks background knowledge not verified this session, as in the research reports.

---

## 2. Personality and voice

**Personality.** Knewt is the friend who runs the puzzle page: well read and quick to laugh, glad when you get one and kind when you don't. Curious, never smug. Warm, never cute.

**Voice rules.**
1. **Write like a person at the next desk.** Short sentences, plain words, numerals for numbers, sentence case, no all-caps.
2. **One smile per screen at most.** Jokes live in the margins (an empty state, a 404). A verdict is never the place for one.
3. **Be exact about points, streaks and time.** "Clue 2, so 3 points." "A freeze covered yesterday."
4. **Never blame and never nag.** No guilt, no fake urgency, no "so close!" when it wasn't close ([SYNTHESIS 8.6, 8.11](../../../research/SYNTHESIS.md)). Write for Manchester, Mumbai, Toronto and Melbourne alike: dates as "31 October", no idioms that only work in one country.

**Sample microcopy.**

| Moment | Copy |
|---|---|
| Home | "Good morning." · Daily ticket: "Three Mysteries and an Encore", "About 4 minutes", "No countdown", button "Play today's Daily" |
| First clue, first visit only | "Guess, or tap Next clue." |
| Typing, no match | "No one by that name in our list. Try a surname." |
| Wrong guess | The guess appears in clue 1 as a struck chip. Status region: "Not Mary Shelley. Clue 2: Her father was a famous Romantic poet she never knew." |
| Next clue button | "Next clue" with "then worth 2" |
| Clue 4 | "Last clue. Pick one of four." |
| Solved | "Knew it." then "Clue 2, so 3 points." |
| Missed | "This one got away. It was Spirited Away." |
| Encore prompt | "How close can you get?" |
| Encore result | "Bullseye. 4% off." · "Close. 12% off." · "334 was the answer. You were 40% off." |
| Results, best fact | "New best streak: 13 days" |
| Percentile | "Top 29% so far today. You beat 71% of players." |
| Cold start | "38 people have played so far. Check back tonight for your place." |
| End of the Daily | Button "Done for today" · "Next Daily in 9h 41m · Practice while you wait" |
| Practice, wrong | "Not quite" then "It's Uranus." |
| Practice, right | "Right" then "It's Uranus." |
| Streak, freeze used | "Your streak is safe. A freeze covered yesterday." |
| After a break | "Best streak: 23 days. Today starts a new one." |
| Offline | "The Daily needs a connection. Practice works offline, but it isn't today's Daily." |
| Report | "Something off with this question? Tell us." |
| Share sheet title | "Share your result. No answers included." |
| Server error | "That didn't reach us. Your answer is safe on this phone. Try again." |

---

## 3. Colour

Paper and ink do most of the work. **Eft** (the orange of a young newt) is the brand's one loud colour. **Pine** is the second, calm accent and doubles as "correct". **Cranberry** exists only for wrong answers, and **amber** only for room timers. The orange never means "wrong", which is why wrong is a cooler cranberry.

### Tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| `paper` | #F5EFE4 | #1A1714 | Page. Warm newsprint; dark is warm charcoal near the #121212 guidance, never black |
| `paper-raised` | #FFFBF5 | #25211C | Cards, options, sheets |
| `paper-sunken` | #ECE4D6 | #13110E | Wells, letter badges, empty segments |
| `ink` | #1D1A16 | #F3EBDE | Text, primary buttons, filled week dots |
| `ink-2` | #4E463D | #CEC3B3 | Secondary text, dimmed options |
| `ink-3` | #665C51 | #A99D8D | Meta text: dates, counts, kickers |
| `rule` | #E2D9CA | #3A332B | Hairlines (decorative only) |
| `rule-strong` | #8A7F70 | #857A6B | Borders that identify a control, chart bars |
| `ledge` | #DCD0BC | #0D0B09 | The solid "thickness" under cards and buttons |
| `eft` | #E55F29 | #F07A45 | Brand accent: Daily ticket, your bar, points marker |
| `eft-ink` | #1D1A16 | #1A1714 | Text on eft. Dark text, not white, keeps the orange loud |
| `eft-deep` | #B4421A | #F59466 | Eft as text on paper |
| `eft-ledge` | #B9481F | #B9542A | Ledge under eft surfaces |
| `eft-tint` | #FADCCB | #4B2B1D | Highlighter wash, active suggestion |
| `pine` / `pine-line` | #1E5E46 / #1E5E46 | #23604A / #7FD0A8 | Correct fill / correct border and solved squares |
| `pine-ink` / `pine-text` / `pine-tint` | #FFFBF5 / #1E5E46 / #DCEBE2 | #F3EBDE / #7FD0A8 / #1F3A2E | Text on pine / pine as text / pine wash |
| `cranberry` / `cranberry-line` | #B42A3C / #B42A3C | #E0566A / #E0566A | Wrong badge / wrong border and used squares |
| `cranberry-ink` / `cranberry-text` / `cranberry-tint` | #FFFBF5 / #A32536 / #F8E0E1 | #1A1714 / #FF8C9A / #45212A | Icon on cranberry / as text / wrong-pick fill |
| `amber` / `amber-text` | #F2BE4A / #7A5300 | #F2BE4A / #F6CD6E | Room timer warning only |
| `focus` / `focus-on-accent` | #1D1A16 / #1D1A16 | #F3EBDE / #1A1714 | 3 px focus ring; dark ring on the orange ticket in both themes |
| `hc-correct` / `hc-wrong` | #1E5BA8 / #B04A0C | #1F4F8F / #F09A55 | High-contrast feedback setting (full set in `tokens.json`) |

In dark mode the accents get lighter and a little softer, and where one colour cannot do two jobs it splits in two. A dark correct fill can't hold light text at 4.5:1 and also stand 3:1 off its neighbours (the two limits cross at a luminance of about 0.15), so `pine` carries the text and `pine-line` carries the boundary. The focus ring turns dark on the orange ticket because cream on orange measured 2.34:1.

### Measured contrast

Targets are WCAG 2.2: 4.5:1 for text ([1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)) and 3:1 for UI components and state graphics ([1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)). `node contrast.js --check` exits non-zero if any pair misses. The first run caught three misses (light eft on paper at 2.95:1, dark correct text at 4.39:1, the dark focus ring on orange at 2.34:1); the tokens above are the fixed ones.

#### Light theme

| Foreground | Background | Ratio | Target | Pass | Used for |
|---|---|---|---|---|---|
| `ink` #1D1A16 | `paper` #F5EFE4 | 15.14:1 | 4.5:1 | Yes | Body text on the page |
| `ink` #1D1A16 | `paper-raised` #FFFBF5 | 16.81:1 | 4.5:1 | Yes | Body text on cards and options |
| `ink` #1D1A16 | `paper-sunken` #ECE4D6 | 13.73:1 | 4.5:1 | Yes | Text in wells and the keypad |
| `ink-2` #4E463D | `paper` #F5EFE4 | 8.09:1 | 4.5:1 | Yes | Secondary text on the page |
| `ink-2` #4E463D | `paper-raised` #FFFBF5 | 8.98:1 | 4.5:1 | Yes | Dimmed options and secondary text on cards |
| `ink-3` #665C51 | `paper` #F5EFE4 | 5.71:1 | 4.5:1 | Yes | Meta text (dates, counts) on the page |
| `ink-3` #665C51 | `paper-raised` #FFFBF5 | 6.34:1 | 4.5:1 | Yes | Meta text on cards |
| `paper-raised` #FFFBF5 | `ink` #1D1A16 | 16.81:1 | 4.5:1 | Yes | Primary button label |
| `eft-ink` #1D1A16 | `eft` #E55F29 | 4.95:1 | 4.5:1 | Yes | Text on the Daily card and accent buttons |
| `eft-deep` #B4421A | `paper` #F5EFE4 | 4.91:1 | 4.5:1 | Yes | Accent text (kickers, links) on the page |
| `eft-deep` #B4421A | `paper-raised` #FFFBF5 | 5.45:1 | 4.5:1 | Yes | Accent text on cards |
| `ink` #1D1A16 | `eft-tint` #FADCCB | 13.34:1 | 4.5:1 | Yes | Text on the highlighter wash |
| `pine-ink` #FFFBF5 | `pine` #1E5E46 | 7.42:1 | 4.5:1 | Yes | Correct answer text on its fill |
| `pine-text` #1E5E46 | `paper-raised` #FFFBF5 | 7.42:1 | 4.5:1 | Yes | "Correct answer" label on cards |
| `ink` #1D1A16 | `pine-tint` #DCEBE2 | 14.05:1 | 4.5:1 | Yes | Text on a solved clue |
| `ink` #1D1A16 | `cranberry-tint` #F8E0E1 | 13.82:1 | 4.5:1 | Yes | Your wrong pick, text on its tint |
| `cranberry-text` #A32536 | `paper-raised` #FFFBF5 | 7.08:1 | 4.5:1 | Yes | "Your answer" label on cards |
| `cranberry-text` #A32536 | `cranberry-tint` #F8E0E1 | 5.82:1 | 4.5:1 | Yes | "Your answer" label on its tint |
| `amber-text` #7A5300 | `paper` #F5EFE4 | 5.99:1 | 4.5:1 | Yes | Warning text (rooms only) |
| `rule-strong` #8A7F70 | `paper` #F5EFE4 | 3.43:1 | 3:1 | Yes | Input and option borders on the page |
| `rule-strong` #8A7F70 | `paper-raised` #FFFBF5 | 3.81:1 | 3:1 | Yes | Option borders on cards |
| `focus` #1D1A16 | `paper` #F5EFE4 | 15.14:1 | 3:1 | Yes | Focus ring on the page |
| `focus-on-accent` #1D1A16 | `eft` #E55F29 | 4.95:1 | 3:1 | Yes | Focus ring on the Daily card |
| `selected` #1D1A16 | `paper-raised` #FFFBF5 | 16.81:1 | 3:1 | Yes | Locked-in border before the reveal |
| `pine-line` #1E5E46 | `paper-raised` #FFFBF5 | 7.42:1 | 3:1 | Yes | Correct border and solved square against a neighbour |
| `pine-line` #1E5E46 | `paper` #F5EFE4 | 6.69:1 | 3:1 | Yes | Solved square on the page |
| `cranberry-line` #B42A3C | `paper-raised` #FFFBF5 | 6.10:1 | 3:1 | Yes | Wrong-pick border and used-clue square |
| `cranberry-line` #B42A3C | `cranberry-tint` #F8E0E1 | 5.02:1 | 3:1 | Yes | Wrong-pick border against its own fill |
| `cranberry-ink` #FFFBF5 | `cranberry` #B42A3C | 6.10:1 | 3:1 | Yes | X icon on the wrong badge |
| `pine-ink` #FFFBF5 | `pine` #1E5E46 | 7.42:1 | 3:1 | Yes | Check icon on the correct badge |
| `eft` #E55F29 | `paper` #F5EFE4 | 3.06:1 | 3:1 | Yes | Accent fills (your bar, streak dots) on the page |
| `eft` #E55F29 | `paper-raised` #FFFBF5 | 3.39:1 | 3:1 | Yes | Accent fills on cards |
| `ink` #1D1A16 | `paper-raised` #FFFBF5 | 16.81:1 | 3:1 | Yes | Chart bars and filled week dots |

#### Dark theme

| Foreground | Background | Ratio | Target | Pass | Used for |
|---|---|---|---|---|---|
| `ink` #F3EBDE | `paper` #1A1714 | 15.09:1 | 4.5:1 | Yes | Body text on the page |
| `ink` #F3EBDE | `paper-raised` #25211C | 13.52:1 | 4.5:1 | Yes | Body text on cards and options |
| `ink` #F3EBDE | `paper-sunken` #13110E | 15.93:1 | 4.5:1 | Yes | Text in wells and the keypad |
| `ink-2` #CEC3B3 | `paper` #1A1714 | 10.27:1 | 4.5:1 | Yes | Secondary text on the page |
| `ink-2` #CEC3B3 | `paper-raised` #25211C | 9.20:1 | 4.5:1 | Yes | Dimmed options and secondary text on cards |
| `ink-3` #A99D8D | `paper` #1A1714 | 6.71:1 | 4.5:1 | Yes | Meta text (dates, counts) on the page |
| `ink-3` #A99D8D | `paper-raised` #25211C | 6.01:1 | 4.5:1 | Yes | Meta text on cards |
| `paper-raised` #25211C | `ink` #F3EBDE | 13.52:1 | 4.5:1 | Yes | Primary button label |
| `eft-ink` #1A1714 | `eft` #F07A45 | 6.44:1 | 4.5:1 | Yes | Text on the Daily card and accent buttons |
| `eft-deep` #F59466 | `paper` #1A1714 | 7.91:1 | 4.5:1 | Yes | Accent text (kickers, links) on the page |
| `eft-deep` #F59466 | `paper-raised` #25211C | 7.09:1 | 4.5:1 | Yes | Accent text on cards |
| `ink` #F3EBDE | `eft-tint` #4B2B1D | 10.68:1 | 4.5:1 | Yes | Text on the highlighter wash |
| `pine-ink` #F3EBDE | `pine` #23604A | 6.24:1 | 4.5:1 | Yes | Correct answer text on its fill |
| `pine-text` #7FD0A8 | `paper-raised` #25211C | 8.75:1 | 4.5:1 | Yes | "Correct answer" label on cards |
| `ink` #F3EBDE | `pine-tint` #1F3A2E | 10.42:1 | 4.5:1 | Yes | Text on a solved clue |
| `ink` #F3EBDE | `cranberry-tint` #45212A | 11.80:1 | 4.5:1 | Yes | Your wrong pick, text on its tint |
| `cranberry-text` #FF8C9A | `paper-raised` #25211C | 7.21:1 | 4.5:1 | Yes | "Your answer" label on cards |
| `cranberry-text` #FF8C9A | `cranberry-tint` #45212A | 6.30:1 | 4.5:1 | Yes | "Your answer" label on its tint |
| `amber-text` #F6CD6E | `paper` #1A1714 | 11.79:1 | 4.5:1 | Yes | Warning text (rooms only) |
| `rule-strong` #857A6B | `paper` #1A1714 | 4.24:1 | 3:1 | Yes | Input and option borders on the page |
| `rule-strong` #857A6B | `paper-raised` #25211C | 3.80:1 | 3:1 | Yes | Option borders on cards |
| `focus` #F3EBDE | `paper` #1A1714 | 15.09:1 | 3:1 | Yes | Focus ring on the page |
| `focus-on-accent` #1A1714 | `eft` #F07A45 | 6.44:1 | 3:1 | Yes | Focus ring on the Daily card |
| `selected` #F3EBDE | `paper-raised` #25211C | 13.52:1 | 3:1 | Yes | Locked-in border before the reveal |
| `pine-line` #7FD0A8 | `paper-raised` #25211C | 8.75:1 | 3:1 | Yes | Correct border and solved square against a neighbour |
| `pine-line` #7FD0A8 | `paper` #1A1714 | 9.77:1 | 3:1 | Yes | Solved square on the page |
| `cranberry-line` #E0566A | `paper-raised` #25211C | 4.35:1 | 3:1 | Yes | Wrong-pick border and used-clue square |
| `cranberry-line` #E0566A | `cranberry-tint` #45212A | 3.80:1 | 3:1 | Yes | Wrong-pick border against its own fill |
| `cranberry-ink` #1A1714 | `cranberry` #E0566A | 4.85:1 | 3:1 | Yes | X icon on the wrong badge |
| `pine-ink` #F3EBDE | `pine` #23604A | 6.24:1 | 3:1 | Yes | Check icon on the correct badge |
| `eft` #F07A45 | `paper` #1A1714 | 6.44:1 | 3:1 | Yes | Accent fills (your bar, streak dots) on the page |
| `eft` #F07A45 | `paper-raised` #25211C | 5.77:1 | 3:1 | Yes | Accent fills on cards |
| `ink` #F3EBDE | `paper-raised` #25211C | 13.52:1 | 3:1 | Yes | Chart bars and filled week dots |

#### High-contrast feedback setting (blue and orange, as Wordle does; [05](../../../research/05-ux-ui-best-practices.md))

| Theme | Foreground | Background | Ratio | Target | Pass | Used for |
|---|---|---|---|---|---|---|
| light | `hc-correct-ink` #FFFBF5 | `hc-correct` #1E5BA8 | 6.53:1 | 4.5:1 | Yes | Correct answer text on its blue fill |
| light | `hc-correct-line` #1E5BA8 | `paper-raised` #FFFBF5 | 6.53:1 | 3:1 | Yes | Correct border against a neighbour |
| light | `ink` #1D1A16 | `hc-wrong-tint` #FBE3D0 | 14.03:1 | 4.5:1 | Yes | Wrong pick text on its orange tint |
| light | `hc-wrong-text` #9A3F08 | `paper-raised` #FFFBF5 | 6.60:1 | 4.5:1 | Yes | "Your answer" label |
| light | `hc-wrong-line` #B04A0C | `paper-raised` #FFFBF5 | 5.32:1 | 3:1 | Yes | Wrong border against a neighbour |
| light | `hc-wrong-line` #B04A0C | `hc-wrong-tint` #FBE3D0 | 4.44:1 | 3:1 | Yes | Wrong border against its own fill |
| light | `hc-wrong-ink` #FFFBF5 | `hc-wrong` #B04A0C | 5.32:1 | 3:1 | Yes | X icon on the wrong badge |
| dark | `hc-correct-ink` #F3EBDE | `hc-correct` #1F4F8F | 6.90:1 | 4.5:1 | Yes | Correct answer text on its blue fill |
| dark | `hc-correct-line` #8DB8F2 | `paper-raised` #25211C | 7.82:1 | 3:1 | Yes | Correct border against a neighbour |
| dark | `ink` #F3EBDE | `hc-wrong-tint` #4A2A16 | 10.86:1 | 4.5:1 | Yes | Wrong pick text on its orange tint |
| dark | `hc-wrong-text` #FFB27A | `paper-raised` #25211C | 9.06:1 | 4.5:1 | Yes | "Your answer" label |
| dark | `hc-wrong-line` #F09A55 | `paper-raised` #25211C | 7.20:1 | 3:1 | Yes | Wrong border against a neighbour |
| dark | `hc-wrong-line` #F09A55 | `hc-wrong-tint` #4A2A16 | 5.79:1 | 3:1 | Yes | Wrong border against its own fill |
| dark | `hc-wrong-ink` #1A1714 | `hc-wrong` #F09A55 | 8.04:1 | 3:1 | Yes | X icon on the wrong badge |

#### Feedback states under simulated colour-vision deficiency

Luminance contrast (L) and CIE76 colour difference (ΔE) after the [Machado, Oliveira and Fernandes (2009)](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html) simulation at full severity, applied in linear RGB.

| Theme | Pair | Normal L / ΔE | Protan L / ΔE | Deutan L / ΔE | Tritan L / ΔE |
|---|---|---|---|---|---|
| light | Correct fill next to a wrong pick (`pine` vs `cranberry-tint`) | 6.10 / 66 | 5.63 / 54 | 6.45 / 57 | 6.10 / 67 |
| light | Solved square next to a used-clue square (`pine-line` vs `cranberry-line`) | 1.22 / 84 | 1.17 / 4 | 1.48 / 26 | 1.25 / 99 |
| light | Correct border against an untouched option (`pine-line` vs `paper-raised`) | 7.42 / 69 | 6.97 / 62 | 7.76 / 65 | 7.39 / 69 |
| light | Wrong border against an untouched option (`cranberry-line` vs `paper-raised`) | 6.10 / 83 | 8.12 / 66 | 5.25 / 60 | 5.89 / 92 |
| light | Your bar next to the other bars (`eft` vs `rule-strong`) | 1.12 / 66 | 1.13 / 38 | 1.27 / 48 | 1.12 / 70 |
| light | The ink outline on your bar (`eft-ink` vs `eft`) | 4.95 / 85 | 3.83 / 59 | 5.68 / 75 | 4.91 / 89 |
| light | High-contrast setting: solved next to used (`hc-correct-line` vs `hc-wrong-line`) | 1.23 / 103 | 1.13 / 91 | 1.49 / 104 | 1.09 / 89 |
| dark | Correct fill next to a wrong pick (`pine` vs `cranberry-tint`) | 1.89 / 48 | 2.12 / 25 | 1.75 / 16 | 1.88 / 52 |
| dark | Solved square next to a used-clue square (`pine-line` vs `cranberry-line`) | 2.01 / 92 | 2.73 / 33 | 1.69 / 22 | 2.00 / 107 |
| dark | Correct border against an untouched option (`pine-line` vs `paper-raised`) | 8.75 / 74 | 9.33 / 68 | 8.36 / 63 | 8.71 / 74 |
| dark | Wrong border against an untouched option (`cranberry-line` vs `paper-raised`) | 4.35 / 70 | 3.41 / 36 | 4.96 / 50 | 4.35 / 82 |
| dark | Your bar next to the other bars (`eft` vs `rule-strong`) | 1.52 / 57 | 1.26 / 33 | 1.68 / 45 | 1.45 / 59 |
| dark | The ink outline on your bar (`eft-ink` vs `eft`) | 6.44 / 83 | 5.25 / 64 | 7.21 / 77 | 6.14 / 83 |
| dark | High-contrast setting: solved next to used (`hc-correct-line` vs `hc-wrong-line`) | 1.09 / 86 | 1.33 / 78 | 1.04 / 86 | 1.14 / 78 |

**What the numbers told us.** Against each other, the green and red squares collapse for protanopes (ΔE 4 in light mode). That is the textbook reason never to signal by colour alone ([1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)), and it is why every state below carries three other cues. Your bar in the chart was also only 1.12:1 against its neighbours, so it now has a 2 px ink outline (3.83:1 or better under every simulation) and a "You" label. The blue and orange setting keeps ΔE at 78 or more under every simulation.

### Correct and incorrect, without colour

| State | Shape | Icon | Words | Other |
|---|---|---|---|---|
| Correct option | Solid fill, 2 px border | Check stamped into the badge | "Correct answer" in an outlined pill | Text turns paper-coloured |
| Your wrong pick | Pale tint, 2 px border | X stamped into the badge | "Your answer" | Hand-drawn pencil strike through the text, a two-cycle shake |
| Other options | Sink 2 px, thinner ledge | Letter badge, outlined | None | Text stays at 8.98:1 (light) and 9.20:1 (dark); dimming never uses opacity |
| Solved clue square | Solid | Check | Row says "+3" and the aria-label "Solved on clue 2" | |
| Used clue square | Tint with border | X | As above | |
| Spare clue square | Dashed outline, empty | None | As above | |
| Forced colours | 4 px double border for correct, 3 px dashed for wrong | Icons stay | Words stay | Grain is switched off |

---

## 4. Typography

| | Display: **Fraunces** | Text: **Atkinson Hyperlegible Next** |
|---|---|---|
| Designers | Undercase Type (Phaedra Charles, Flavia Zimbardi) | Braille Institute of America |
| Licence | SIL Open Font License 1.1, no Reserved Font Name declared | SIL Open Font License 1.1, no Reserved Font Name declared |
| Copyright line | Copyright 2020 The Fraunces Project Authors (github.com/undercasetype/Fraunces) | Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors |
| Source | [github.com/undercasetype/Fraunces](https://github.com/undercasetype/Fraunces), npm `@fontsource-variable/fraunces` 5.3.0 | [github.com/googlefonts/atkinson-hyperlegible-next](https://github.com/googlefonts/atkinson-hyperlegible-next), npm `@fontsource-variable/atkinson-hyperlegible-next` 5.3.0 |
| Files here | `fonts/fraunces-latin-full-normal.woff2` (121,016 bytes, all four axes), `fonts/fraunces-latin-full-italic.woff2` (149,720 bytes) | `fonts/atkinson-hyperlegible-next-latin-wght-normal.woff2` (33,996 bytes) |
| Licence text | `fonts/Fraunces-OFL-1.1.txt` | `fonts/AtkinsonHyperlegibleNext-OFL-1.1.txt` |
| Settings | `SOFT 100` (rounded terminals), `WONK 1` (the leaning n, m and h), optical size automatic, roman 500 to 800, italic 400 to 500 | Weights 400 to 800; no italic shipped |

The OFL lets us bundle, embed, subset and redistribute both fonts as long as the licence travels with them and the fonts are never sold alone ([openfontlicense.org](https://openfontlicense.org)). Both belong on the credits and licences page (decision 8).

**Why this pair.** Fraunces is an old-style "soft serif" in the line of Windsor, Souvenir and Cooper ([README](https://github.com/undercasetype/Fraunces)), so it reads as editorial and friendly at once. The research suggests Fredoka or Nunito for headings ([05](../../../research/05-ux-ui-best-practices.md), [SYNTHESIS 8.9](../../../research/SYNTHESIS.md)); Fraunces at SOFT 100 keeps their friendliness and adds the newspaper. Atkinson Hyperlegible Next stays exactly as the research recommends for everything players read: questions, clues, options and explanations.

**Measured quirks.**
- **No tabular figures in either font.** At 40 px, "1111" measured 69.6 px and "8888" 91.5 px in Fraunces, identical with `tabular-nums` on; Atkinson gave 75.5 and 80.0 px either way. So the stopwatch and count-ups set each digit in a fixed 0.62 em cell, and their accessible label carries the plain value.
- **Atkinson's zero is slashed, always.** I tested `zero`, `ss01` to `ss05` and `salt`; none removes the slash. We keep it as a legibility feature (0 never looks like O), and hero numerals use Fraunces, which has a plain zero.

**Scale (mobile, as built).**

| Role | Face | Size / line height | Weight | Example |
|---|---|---|---|---|
| Hero numeral | Fraunces | 66 to 86 px fluid / 0.8 | 700 | "9/12" on results |
| Ticket title | Fraunces | 35 / 0.98 | 700, second line italic 400 | "Three Mysteries *and an Encore*" |
| Greeting | Fraunces | 33 / 1.05 | 600 | "Good morning." |
| Sheet title | Fraunces | 30 / 1.05 | 650 | "It's Uranus." |
| Screen title | Fraunces | 27 / 1.05 | 650 | "A person" |
| Card title, ledger answer | Fraunces | 19 to 22 / 1.1 | 650 | "This week", "Lisbon" |
| Question stem | Atkinson | 24 / 1.28, `text-wrap: balance` | 700 | Practice question |
| New clue | Atkinson | 18 / 1.38 | 600 | Clue 2 |
| Earlier clue | Atkinson | 15 / 1.4 | 400 | Clue 1 |
| Option, suggestion | Atkinson | 18 / 1.3 | 600 and 500 | "Uranus", "Ada Lovelace" |
| Body | Atkinson | 17 / 1.5, max 62 characters a line | 400 | Explanations |
| Buttons | Atkinson | 17 | 700 | "Play today's Daily" |
| Meta and kickers | Atkinson | 12 to 14 | 600 to 800 | "Question 4 of 10" |

Rules: italics only as a display flourish in Fraunces (never for reading), bold for emphasis, no all-caps, sentence case everywhere ([BDA guidance via 05](../../../research/05-ux-ui-best-practices.md)).

**Font budget.** The prototype loads about 298 KB of fonts, which is too much. For production: pin Fraunces to SOFT 100 and WONK 1 with fontTools' `varLib.instancer`, keep only the weight axis, and subset the italic to the dozen glyphs we use. I estimate roughly 80 KB in total (not measured: fontTools isn't installed in this sandbox). Preload only the two roman files, use `font-display: swap`, and give the fallbacks `size-adjust` metrics so the swap doesn't shift the layout. Latin-ext files come in through `unicode-range` for names such as Łódź.

---

## 5. Spacing, radius and elevation

**Spacing.** A 4 px base: 4, 8, 12, 16, 20, 24, 32, 40, 48. Side gutters are `clamp(16px, 5.2vw, 20px)`, so 20 px at 390 and 16 px at 320. Answer options sit 12 px apart; cards sit 12 px apart; card padding runs 12 to 20 px.

**Radius.**

| Token | Value | Used on |
|---|---|---|
| `r-xs` | 6 px | Progress segments, results squares (5 px) |
| `r-sm` | 10 px | Letter badges, Daily progress pills |
| `r-md` | 14 px | Clue cards, small buttons |
| `r-lg` | 18 px | Buttons, answer options, the guess field |
| `r-xl` | 24 px | Cards and the Daily ticket |
| `r-sheet` | 28 px | The explanation sheet |
| `r-pill` | 999 px | Chips, tags, the stopwatch, the streak chip |

**Elevation: the ledge.** Every raised thing has a visible thickness, a solid band under it like a stack of card stock, plus a soft contact shadow. No glass and no translucent panels behind text ([SYNTHESIS 8.9](../../../research/SYNTHESIS.md)).

| Level | Build | Used on |
|---|---|---|
| e0 | Hairline rule only | Ledger rows, dividers |
| e1 | 1 px rule border, 3 px `ledge`, soft shadow | Cards |
| e1+ | 1.5 px `rule-strong` border, 4 px `ledge` | Buttons and answer options |
| e2 | 4 px coloured ledge (`eft-ledge`) plus a larger soft shadow | The Daily ticket, the share card |
| e3 | Top hairline plus an upward shadow, no ledge | The explanation sheet, the results dock |

On press, an element moves down 2 px while its ledge shrinks from 4 to 2 px, so its bottom edge stays put and it feels pushed into the page. In dark mode the ledge goes darker than the surface (#0D0B09), shadows deepen, and borders do most of the lifting.

---

## 6. Iconography

Drawn for this exploration as one sprite in `index.html`: close, check, arrow, chevron, settings (sliders), sound off, stopwatch, share, freeze (snowflake), best fact (spark), Today, Practice (cards), Groups, Stats, report (flag), learn more (book), Encore (target), search and streak (tally).

- 24 px grid, 2 px stroke at 24 px, thickening to 2.6 to 3.4 px when drawn at 12 to 16 px so small icons keep their weight.
- Round caps and joins, open shapes; only the spark and dots are filled.
- An icon never carries a state alone: the check comes with "Correct answer", the X with "Your answer". Icon-only buttons get accessible names.
- **The streak is a tally mark, not a flame.** Counting days is what a streak is, and a flame borrows Duolingo's and Snapchat's symbol.
- **The mark.** Eft newt with an ink dot on paper; ink newt with an eft eye on the orange; eft newt with a cream dot on dark. Minimum 20 px. On an ink tile it doubles as the app icon.

---

## 7. Motion

**Principles.**
1. **Paper moves like paper.** Things lift, sink, unfold and slide. Nothing spins, and nothing overshoots more than once. Apart from the sheet, nothing travels more than 10 px.
2. **Ink marks the verdict.** Checks and crosses are stamped on; a wrong pick is struck through like an editor's pencil.
3. **Quick to acknowledge, slow to explain.** The press shows in the same frame, the verdict lands at 400 ms, and the explanation waits for the player (05: about 9 seconds to read 35 words).
4. **Always optional.** `prefers-reduced-motion` and an in-app setting turn every movement into a 120 ms cross-fade; nothing flashes ([2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html), [2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)). Every duration sits in NN/g's 100 to 500 ms band ([NN/g](https://www.nngroup.com/articles/animation-duration/)).

**Tokens.**

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 90 ms | Press and release |
| `--dur-lock` | 120 ms | Lock-in border |
| `--dur-quick` | 160 ms | Small fades and pops |
| `--dur-base` | 240 ms | Stamps, strikes, dimming |
| `--dur-reveal` | 320 ms | Answer fills, clue unfold, the points marker |
| `--dur-sheet` | 360 ms | The explanation sheet |
| `--dur-count` | 500 ms | Score count-ups |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Things arriving |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Things travelling: the rail, the strike, the shake |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Stamps and the points marker: one small overshoot |
| `--ease-press` | `cubic-bezier(0.3, 0, 0.5, 1)` | Press and release |

**The answer reveal** (practice, as built in `styles.css`; [SYNTHESIS 8.3](../../../research/SYNTHESIS.md) timeline). The pressed state shows on `pointerdown` and the answer commits on `click`, so sliding off cancels ([2.5.2](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html)).

| From | Element | What happens | Duration | Easing |
|---|---|---|---|---|
| 0 ms | Pressed option | Sinks 2 px, ledge 4 to 2 px, border warms to ink | 120 ms | press |
| 0 to 400 ms | Everything | The suspense beat. Ranked play waits here for the server; after 1.5 s it says "Checking..." | | |
| 400 ms | Correct option | Fills pine, text turns paper | 320 ms | out |
| 400 ms | Wrong pick | Fills with the cranberry tint, 2 px border | 320 ms | out |
| 400 ms | Other options | Dim to `ink-2` and sink 2 px | 240 ms | out |
| 400 ms | Letters A and B | Fade out | 120 ms | linear |
| 400 ms | Progress segment | Fills with the verdict | 200 ms | out |
| 420 ms | Wrong pick | Shakes 6 px, two cycles | 300 ms | in-out |
| 440 ms | Badges | Check and X stamp in, from 1.4 times size and 10 degrees | 240 ms | spring |
| 520 ms | Wrong pick text | Pencil strike draws left to right | 240 ms | in-out |
| 600 ms | Tags | "Your answer" and "Correct answer" fade up 4 px | 240 ms | out |
| 1200 ms | Explanation sheet | Rises into space reserved for it, so nothing shifts | 360 ms | out |
| Until tapped | Sheet | Stays until Continue; a tap anywhere skips the automatic part | | |

In the Daily, a solve counts its points up ("+3") over `--dur-count` in fixed-width digit cells, alongside a two-note chime.

**The clue reveal** (a wrong guess or Next clue).

| From | Element | What happens | Duration | Easing |
|---|---|---|---|---|
| 0 ms | Miss chip | The wrong guess pops into clue 1, struck through | 220 ms | spring |
| 120 ms | Rail | Ink runs down from rung 1 to rung 2 | 240 ms | in-out |
| 200 ms | Rung 2 | Its number stamps in | 240 ms | spring |
| 260 ms | Clue card | Unfolds from the rail: fades in, drops 10 px into place, scaleY 0.9 to 1 | 320 ms | out |
| 300 ms | Points scale | The 4 is struck and the eft marker slides one rung to 3 | 320 ms | spring |
| 400 ms | Points scale | The 3 turns to ink on the marker | 160 ms | linear |
| 560 ms | New tag | Fades up | 200 ms | out |

The guess field clears and keeps focus throughout, so typing never waits on the animation. The status region reads the new clue.

**Reduced motion.** No translation, scale, rotation or shake. Colours cross-fade in 120 ms, the strike appears without drawing, the sheet fades in place, and the marker jumps. `motion-frames.png` shows both timelines as real frames: the page freezes the CSS animations at the listed millisecond (`index.html?screen=practice&animate=1&t=480`).

**Celebration scale.** A solved mystery gets the stamp and the chime. A new best streak gets an extra stroke drawn on the tally chip. Only a perfect 12 earns the big moment: the result card stamps down onto the page and confetti in paper, ink and eft falls once, lazy-loaded with `disableForReducedMotion: true` ([05](../../../research/05-ux-ui-best-practices.md)).

---

## 8. Sound: "the writing desk"

Sounds of a desk, not an arcade: a pencil tap, paper sliding, a wooden block, a small kalimba. Everything is synthesised in Web Audio, so it costs no sample bytes and mixes with the player's own music ([Audio Session](https://w3c.github.io/audio-session/)). The `AudioContext` is created on the first tap ([Web Audio](https://webaudio.github.io/web-audio-api/)). Effects start off on phones behind the visible speaker toggle, start on for the host screen, and never carry meaning on their own (decision 8, [SYNTHESIS 8.7](../../../research/SYNTHESIS.md)).

| Moment | Recipe | Length |
|---|---|---|
| Tap | White-noise burst through a 2.8 kHz band-pass, 2 ms attack, gone by 18 ms: a pencil on paper | 20 ms |
| Clue reveal | Noise swept 900 to 2,600 Hz (paper sliding), then a 540 Hz sine "wood block" at 120 ms | 160 ms |
| Correct | Triangle G5 (784 Hz) then D6 (1,175 Hz) 70 ms later, each with a 5 ms attack and a 220 ms decay, plus a quiet sine an octave up | Under 300 ms |
| Wrong | Sine gliding 180 to 120 Hz through a 700 Hz low-pass: a felt thud, never a buzzer | 140 ms |
| Encore close | E5 and G5, softer than correct | 200 ms |
| Encore bullseye | C6, E6, G6 (1,047, 1,319, 1,568 Hz), 55 ms apart, then a 2,093 Hz "ting" fading over 500 ms | 700 ms |
| Daily complete | C4, E4, G4, C5 rolled 45 ms apart, sine and triangle through a 2.4 kHz low-pass, 1.1 s decay. Plays once | 1.2 s |
| Room countdown | A 1.2 kHz wood tick in the last 5 seconds only (rooms only) | 25 ms each |

Peaks stay near -12 dBFS behind one master gain. Android haptics, behind their own toggle, follow the research: tap 10 ms, correct 20 ms, wrong 30-40-30 ms.

---

## 9. Sharing

**Share text** (decision 2's shape; design owns the glyphs):

```
Knewt #42 · 9/12 · Encore 4% off 🎯
🏙️ 🟩⬜⬜⬜
👤 🟥🟩⬜⬜
🎬 🟥🟥🟩⬜
knewt.app/d/42
```

- 🟩 solved on this clue, 🟥 a clue you needed, ⬜ a clue you never needed. A missed mystery is 🟥🟥🟥🟥. The 🎯 appears only on a bullseye.
- Words first, squares after, the path-only link last ([SYNTHESIS 6.4, 8.8](../../../research/SYNTHESIS.md)). The row emoji give each line a name a screen reader can say. By CLDR short names it reads "Knewt number 42, 9/12, Encore 4% off, bullseye. Cityscape, green square, white large square..." and so on. "#" reads as "number", where "No." might be read as "no".
- **To test on devices:** whether VoiceOver reads "9/12" as a date and "·" as "middle dot". If either happens, switch to "9 of 12" and commas.
- With the high-contrast setting on, the squares become 🟦 and 🟧, the pair that stays apart for colour-blind friends (the CVD table above).

**Preview image** (`share.png`, 1200 by 630). A result card on an orange table, with the big ink newt peeking in from the left. Everything that matters sits inside the central 630 by 630 square, because some chat apps crop previews to squares. It never shows an answer, only answer types and clue squares, and it always renders on the light card so it looks the same in every chat theme. The score stays readable at a 300 px thumbnail.

---

## 10. The screens

| Screen | What it shows | Decisions worth noting |
|---|---|---|
| 1. Home (`screen1-*.png`) | Masthead with the mark and a tally streak chip, dateline, greeting, the Daily ticket, Practice with topic chips, "This week", tab bar | The ticket is the hero: tear-off stub, real notches, the four answer types as cards. Measured at 360 by 640: Play at 384 to 440 px and Quick play at 496 to 540 px, both above the fold ([SYNTHESIS 8.1](../../../research/SYNTHESIS.md)) |
| 2. Mystery (`screen2-*.png`) | Clue 1 read, a wrong guess struck, clue 2 new, Next clue, "Ada" typed, three suggestions, the system keyboard | Shown with the keyboard open because typing on phones is the format's main risk (SYNTHESIS 6.1). Everything fits in the 553 px left above a 291 px keyboard. The 4-3-2-1 scale teaches scoring without a tutorial. Rows commit on click with a "Guess" cue on the active one |
| 3. Practice (`screen3-*.png`) | Question 4 of 10 just answered: wrong pick struck, correct stamped, others dimmed, explanation sheet | Options are 60 px tall and full width. The sheet lives in reserved space under the options, so nothing moves, and Continue sits under the thumb |
| 4. Results (`screen4-*.png`) | Best fact, 9/12, top 29% so far today, distribution with your bar, three mystery rows with answers and crowd stats, the Encore row with its error on a mini number line, Share and Done for today | One primary button ("Done for today"), Share secondary, the countdown and a soft Practice link last ([SYNTHESIS 8.8](../../../research/SYNTHESIS.md)) |
| 5. Share (`share.png`) | The preview image | Crop-safe centre card, no answers |

**Target sizes, measured in the 390 px build.** Answer options 60 px, suggestion rows 48 px (with 10 px clear of the keyboard), Play, Continue, Share and Done 56 px, icon buttons and Quick play 44 px, tabs 48 px. The stopwatch, streak chip, topic chips and the two text links look smaller, but each has a 44 px hit area. WCAG's floor is 24 px ([2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).

**Reflow.** `reflow-320-screen1.png` to `reflow-320-screen4.png` render every screen at 320 px, full height, with no horizontal scroll. Type sizes on results are fluid so "Top 29%" stays on one line.

**Semantics in the prototype.** The guess field is an ARIA combobox with a listbox and `aria-activedescendant`, verdicts go to a polite `role="status"` region, focus rings are 3 px with a 3 px offset, and `forced-colors` and reduced-motion styles are included.

---

## 11. Self-critique log

I captured every screen after each change and looked at it before moving on. What I caught:

1. **Home.** The greeting wrapped beside the dateline, so the date moved above it. "A person" and "A number" broke inside the ticket's cards, so they became one-word labels. The Practice card slid under the tab bar until the rhythm was tightened.
2. **Dark ticket.** Its cards mixed toward the dark page and went muddy; they now mix toward cream in both themes.
3. **Mystery.** With the keyboard up, only one and a half suggestions showed and clue 2 ran to three lines. I shortened the clue, swapped the label line for a "New" tab on the card's edge, and replaced a "worth 3" badge with the 4-3-2-1 scale. Later I took 12 px back from paddings so the rows could grow from 44 to 48 px.
4. **Results.** The Encore, a required element, hid behind the dock. It became the fourth ledger row with a mini number line.
5. **Chips** rendered underlined because they are links.
6. **Share image.** The newt vanished (orange on orange), the stat pills wrapped, the "/12" at 72% opacity turned muddy brown, and the layout failed a centre-square crop. I rebuilt it as a centred card.
7. **320 px.** The seventh week dot clipped out of its card, "Top 29%" broke onto two lines, and the streak note split into columns because a text span was `inline-flex`.
8. **The fold rule.** Quick play sat just below the fold at 360 by 640, so the streak moved into a top-bar chip and the week strip moved under Practice.
9. **Motion frames.** Letters vanished before the reveal (a keyframe with no `from`), the clue strip's first frame was empty, and the points marker now slides instead of swapping.
10. **Measurements.** The chart's "You" bar measured 1.12:1 against its neighbours, so it gained an ink outline.

**Still open.**
- The newt is a geometric sketch. An illustrator should redraw it, keeping the rule that it reads as "?" below 32 px.
- Fraunces has been popular in brand work since 2021. WONK and SOFT, the ticket and the newt keep this ownable, but a custom display cut could follow launch.
- The keyboard has to be tested in the WhatsApp and Instagram in-app browsers, whose visual viewports shrink differently from Safari's.
- VoiceOver and TalkBack still need to read the share text on a device.
- The clue-4 state (four options under the ladder) and the Encore keypad are specified in words here, not drawn.

---

## 12. Files

| File | What it is |
|---|---|
| `brief.md` | This document |
| `index.html` | The prototype: all screens as templates, a gallery view, and `?screen=home|mystery|practice|results|share&theme=light|dark`, plus `&reflow=1`, `&animate=1`, `&t=480` and `&reduce=1` |
| `styles.css` | Every component, the screen layouts, the motion and the forced-colours rules |
| `tokens.json` | Colour tokens for both themes: the source of truth |
| `tokens.css` | Generated from `tokens.json` by `node build-tokens.js` |
| `contrast.js` | `node contrast.js` prints the measured tables above; `--check` fails on any miss |
| `capture.js` | `node capture.js` writes every PNG with `require('playwright')` and the pre-installed Chromium |
| `motion.html` | The frame board behind `motion-frames.png` |
| `fonts/` | Three woff2 files and both OFL licence texts |
| `screen1-light.png` to `screen4-dark.png` | The four screens in both themes at 390 by 844 |
| `share.png` | The 1200 by 630 preview image |
| `reflow-320-screen1.png` to `reflow-320-screen4.png` | Reflow checks at 320 px |
| `motion-frames.png` | Both reveal timelines, frame by frame |
| `overview.png` | Every screen on one board |
