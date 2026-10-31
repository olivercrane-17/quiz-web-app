# UX and UI best practices for quiz games on the web

*Research track 05, 31 October 2026*

**Method and confidence.** The run's shared WebSearch budget was gone before this track began, and the network allowlist blocks www.w3.org and developer.mozilla.org, so no web searches ran. I verified the highest-stakes claims against official sources the sandbox can reach: W3C repositories (WCAG 2.2 at 29 Oct 2026, ARIA, Web Audio, Audio Session), MDN browser-compat-data 8.1.7, Google Fonts metadata, and library READMEs and bundles. **[V]** = verified this session. **[K]** = known source, not re-opened (medium confidence). **[O]** = product behavior seen earlier, which may have changed. *Our read* = inference.

## Summary

- **Play first.** The first question is one tap from the landing page. Accounts and names wait until a round ends ([Wroblewski](https://alistapart.com/article/signupforms/) [K]).
- **Big answers in the lower middle, committed on release.** Use four full-width buttons at least 48 px tall; WCAG's 24 px is a floor ([2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) [V]). SC 2.5.2 bars non-essential touch-down commits ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html) [V]), so score speed from the press timestamp.
- **Acknowledge within 100 ms, then let people read.** A 35-word explanation takes about 9 seconds at the average 238 words per minute ([NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/), [Brysbaert](https://doi.org/10.1016/j.jml.2019.104047) [K]), so the player decides when to continue.
- **Never signal by color alone.** Pair red and green with an icon and a word, and keep UI states at 3:1 contrast ([1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) [V]).
- **Solo timers must be optional.** WCAG 2.2.1 (Level A) requires a way to switch off or lengthen time limits, and W3C ranks "off" as most helpful. Live rooms can use the real-time exception ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) [V]).
- **Sound and haptics are extras.** `navigator.vibrate` works only in Chromium browsers on Android ([browser-compat-data](https://github.com/mdn/browser-compat-data) [V]). Play effects through Web Audio, which waits for a gesture and defaults to mixable "ambient" audio, unlike `<audio>` elements ([Audio Session](https://w3c.github.io/audio-session/) [V]).
- **Motion stays short and optional.** Aim for 100 to 500 ms ([NN/g](https://www.nngroup.com/articles/animation-duration/) [K]), support reduced motion, and never exceed three flashes a second ([2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) [V]). Lottie and Rive runtimes weigh 46 to about 460 KB gzipped (measured), so load them late.
- **Results screens are the memory.** Endings dominate recall ([Kahneman et al.](https://doi.org/10.1111/j.1467-9280.1993.tb00589.x) [K]). Open on the best fact, review misses, keep one primary button, and share text that reads well aloud.

## Detailed findings

### Instant play and onboarding

Luke Wroblewski's 2008 case for "gradual engagement" still holds: let people use the product, and ask for an account once they have progress worth keeping ([A List Apart](https://alistapart.com/article/signupforms/)) [K]. Duolingo puts a lesson before profile creation and pitches sign-up as a way to save progress ([UserOnboard](https://www.useronboard.com/how-duolingo-onboards-new-users/)) [K]. Wordle never required an account [O]. NN/g reports that people skip or forget deck-of-cards tutorials, and recommends contextual tips when a feature first matters ([NN/g](https://www.nngroup.com/articles/mobile-app-onboarding/)) [K]. In a quiz, the first question is the tutorial.

### Thumb reach and answer buttons

Steven Hoober watched 1,333 people use phones. 49% held them in one hand; the rest cradled them (36%) or used both hands (15%) ([UXmatters](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)) [K]. Later he found taps land most accurately near the center (about 7 mm of error) and worst near the corners (11 to 12 mm), with grips shifting constantly ([UXmatters](https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php)) [K]. The popular "thumb zone" map ([Smashing](https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/)) [K] boils this down well: big targets placed center to low, away from the top corners.

WCAG 2.2 sets a Level AA floor of 24 by 24 CSS px (or equivalent spacing) and suggests aiming for 44 px on important controls ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)) [V]. Apple asks for 44 pt and Android for 48 dp ([Apple](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Android](https://support.google.com/accessibility/android/answer/7101858)) [K]; NN/g suggests about 1 cm ([NN/g](https://www.nngroup.com/articles/touch-target-size/)) [K]. Under Fitts's law, pointing time grows with distance and shrinks with target size ([Fitts](https://doi.org/10.1037/h0055392)) [K]. When points depend on speed, button geometry is part of the scoring.

Two Level A rules shape the press. SC 2.5.2 bars completing an action on the down-event unless that is essential, and W3C's examples are an on-screen piano and skeet shooting ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html)) [V]. SC 2.5.3 requires the accessible name to contain the visible label, so voice-control users can say "click Paris" ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)) [V]. Kahoot pairs each answer color with a shape (red triangle, blue diamond, yellow circle, green square), so tiles stay distinct for color-blind players [O].

### Feedback timing and the reveal

Nielsen's limits still apply: 0.1 s feels instant, 1 s keeps the flow of thought, and 10 s is the edge of attention ([NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)) [K]. Google's INP metric rates an interaction good at 200 ms or less and poor above 500 ms, thresholds I confirmed in the `web-vitals` 6.2.3 source ([web.dev](https://web.dev/articles/inp), [web-vitals](https://github.com/GoogleChrome/web-vitals)) [V]. NN/g puts most UI animation at 100 to 500 ms ([NN/g](https://www.nngroup.com/articles/animation-duration/)) [K].

Duolingo raises a bottom sheet (green with a check, or red with the right answer), and Continue appears where Check was, so the thumb never travels [O]. Kahoot leaves pacing to the host [O]. At 238 words per minute, the average adult rate for non-fiction ([Brysbaert](https://doi.org/10.1016/j.jml.2019.104047)) [K], report 03's 35-word "why" line takes about 9 seconds. Auto-advance after 1.5 s means nobody reads it.

### Explanations after answers

A meta-analysis of computer-based learning found that explanations beat showing the right answer, which beat right/wrong alone, with mean effects of about 0.49, 0.32 and 0.05 ([Van der Kleij et al.](https://doi.org/10.3102/0034654314564881)) [K]. Butler, Karpicke and Roediger found that feedback after multiple-choice tests improved later recall, with delayed feedback ahead of immediate in their study ([2007](https://doi.org/10.1037/1076-898X.13.4.273)) [K]. *Our read:* explain at once for curiosity, then revisit misses on the results screen for retention.

### Timers and progress

Under WCAG 2.2.1 (Level A), each time limit must be switchable off, adjustable to at least ten times the default, or extendable at least ten times after a 20-second warning, unless it is real-time, essential or over 20 hours ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)) [V]. W3C ranks off above adjustable above extendable, and notes a third party may grant extra time, "for example, granting double time on a test". A host extending one player's timer does exactly that; Jackbox hosts already have an extended-timers setting [O]. AAA criterion 2.2.3 cites turn-taking games as the untimed ideal [V].

Timer visuals lack quiz-specific evidence. HQ Trivia's ring and Kahoot's countdown show the two common forms, a draining shape read peripherally and a number read directly [O]. *Our read:* use both, with the bar moving linearly so it never misleads.

A meta-analysis of 32 web-survey experiments found constant-speed progress indicators had no significant effect on break-offs. Fast-then-slow ones reduced them, and slow-then-fast ones increased them ([Villar, Callegaro and Yang](https://doi.org/10.1177/0894439313497468)) [K]. A 10-question round with a visible end is the easy case.

### Results and sharing

In Kahneman's cold-water study, people chose to repeat a longer trial because it ended less painfully, the root of the peak-end rule ([Kahneman et al.](https://doi.org/10.1111/j.1467-9280.1993.tb00589.x)) [K]. Duolingo's lesson-complete screen shows XP and accuracy cards under a cheering character [O]. Wordle's spoiler-free grid spread the game, and its High Contrast Mode swaps to orange and blue ([NYT](https://www.nytimes.com/games/wordle/index.html)) [O], though screen readers read that grid square by square [K]. Web Share works in Chrome (Android, and desktop since 128) and Safari, but Firefox desktop keeps it behind a flag, so we need a clipboard fallback ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)) [V].

### Sound

An `AudioContext` may stay suspended until the page has sticky activation, meaning a prior gesture ([Web Audio](https://webaudio.github.io/web-audio-api/)) [V]. The Audio Session spec, in Safari since 16.4, gives `AudioContext` the default type "ambient" (mixes with other audio) and media elements "playback" (should not mix) ([W3C](https://w3c.github.io/audio-session/)) [V]. We believe ambient audio on iPhone also obeys the silent switch; confirm on a device. WCAG 1.4.2 requires a pause or volume control for audio that autoplays for more than 3 seconds [V]. The Game Accessibility Guidelines ask for separate effects and music volumes, with nothing conveyed by sound alone ([GAG](https://gameaccessibilityguidelines.com/full-list/)) [K].

### Haptics

Support per browser-compat-data 8.1.7 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)) [V]:

| Browser | `navigator.vibrate` |
|---|---|
| Chrome, Samsung Internet (Android) | Works; since Chrome 60, only after a user gesture |
| Firefox for Android | Returns `true` but never vibrates (abuse concerns) |
| Firefox desktop | Removed in 129 (August 2024) |
| Safari, all platforms | Not supported |

On iOS, Safari 17.4's native switch (`<input type="checkbox" switch>`) ticks when toggled. `ios-haptics` 3.3.0 (updated 25 Oct 2026) lays a transparent label, wired to a hidden switch, over an element so the user's own tap fires it ([README](https://github.com/tijnjh/ios-haptics)) [V]. Nothing can fire at the later reveal, and the hidden controls may surface to assistive tech. Apple advises sparing haptics that complement visual feedback ([Apple](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)) [K]. Android favors short, crisp effects over buzzy ones ([Android](https://developer.android.com/develop/ui/views/haptics/haptics-principles)) [K].

### Motion and microinteractions

SC 2.3.3 (AAA) asks that interaction-triggered motion can be turned off. W3C notes vestibular reactions can be severe enough to need bed rest, and names `prefers-reduced-motion` or a site-wide setting as fixes ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)) [V]. One national survey found vestibular dysfunction in about 35% of US adults aged 40 and over ([Agrawal et al.](https://doi.org/10.1001/archinternmed.2009.66)) [K]. SC 2.3.1 (Level A) bans more than three flashes a second above the thresholds, judged against a 341 by 256 px block ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)) [V]. `canvas-confetti` offers `disableForReducedMotion`, but it defaults to false ([README](https://github.com/catdad/canvas-confetti)) [V].

Same-document View Transitions run in Chrome 111+, Safari 18+ and Firefox 144+ (14 October 2025), though cross-document ones still lack Firefox ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)) [V]. Measured gzipped sizes: lottie-web 5.13.0 is 76 KB (light player 46 KB), the full `motion` 14.9.0 bundle is 59 KB (tree-shaken imports are smaller), and `@rive-app/canvas-lite` 2.49.0 is about 340 KB of WASM plus 119 KB of JS [V]. Against a 150 KB home-route budget, each needs lazy loading.

### Typography and color, plus dark mode

In an eye-tracking study of 48 readers with dyslexia, sans-serif, monospaced and roman fonts helped, italics hurt, and OpenDyslexic did nothing ([Rello and Baeza-Yates](https://doi.org/10.1145/2513383.2513447)) [K]. Trials of OpenDyslexic and Dyslexie found no reading gains ([Wery and Diliberto](https://doi.org/10.1007/s11881-016-0127-1), [Kuster et al.](https://doi.org/10.1007/s11881-017-0154-6)) [K], while extra letter spacing helped children with dyslexia ([Zorzi et al.](https://doi.org/10.1073/pnas.1205566109)) [K]. The British Dyslexia Association advises sans-serif type and 1.5 line spacing, bold over italics or underline, no all-caps, and off-white backgrounds ([BDA](https://www.bdadyslexia.org.uk/advice/employers/creating-a-dyslexia-friendly-workplace/dyslexia-friendly-style-guide)) [K]. WCAG 1.4.12 requires layouts to survive 1.5 line height and 0.12 em letter spacing [V].

Atkinson Hyperlegible Next (Braille Institute, on Google Fonts since January 2025) is a variable sans built for low-vision legibility. Lexend claims to reduce visual stress, though that research is its creators' own. Fredoka and Nunito are rounded, playful display faces ([Google Fonts](https://github.com/google/fonts)) [V].

About 1 in 12 men and 1 in 200 women have a color vision deficiency, mostly red-green, the very pair quiz apps lean on ([Colour Blind Awareness](https://www.colourblindawareness.org/colour-blindness/)) [K]. NN/g found light mode reads better for people with normal vision while dark mode can help some low-vision users, and advises offering both ([NN/g](https://www.nngroup.com/articles/dark-mode/)) [K]. Material's dark theme uses #121212 instead of black, with desaturated accents ([Material](https://m2.material.io/design/color/dark-theme.html)) [K].

### Visual direction for 2025 and 2026

Google's Material 3 Expressive (May 2025) brought bolder shapes and springier motion, backed, Google says, by 46 studies with more than 18,000 participants ([Google Design](https://design.google/library/expressive-material-design-google-research)) [K, vendor claim]. Apple's Liquid Glass (June 2025) went translucent ([Apple](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)) [K], and NN/g criticized its legibility ([NN/g](https://www.nngroup.com/articles/liquid-glass/)) [K, URL unconfirmed]. *Our read:* borrow the expressive half (chunky rounded shapes, big type, tactile buttons, spring motion) and skip glass behind text.

### Keyboard and screen readers in timed play

Under SC 2.1.4 (Level A), single-key shortcuts such as 1 to 4 for answers must be possible to turn off or remap, or work only while their component has focus, because speech-input users trigger them by accident ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)) [V]. SC 4.1.3 (AA) requires status messages to reach assistive tech without taking focus ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)) [V]. In the current ARIA draft, `status` is a polite live region and `alert` an assertive one; `timer` is a `status` subclass whose text updates at fixed intervals ([ARIA](https://w3c.github.io/aria/)) [V]. ARIA 1.2 gave `timer` an implicit `aria-live` of off [K], but the draft no longer says so, so set it explicitly. WCAG 2.2's Focus Not Obscured (2.4.11) affects sticky footers, and Dragging Movements (2.5.7) affects drag-to-order questions [V].

## Implications for our product

Starting values for the design system and playtests; where they overlap with report 03, they match it.

**First run**

1. `/` shows "Play today's quiz" above the fold at 360 by 640, plus "Quick play". One tap reaches question 1: no carousel, no login.
2. Teach in context, once. The first timed question carries a one-line tip ("Faster answers earn a bonus. Change the timer in Settings."). Ask for a nickname only after a finished round, and only if a leaderboard needs one.

**Question screen**

3. Mobile uses `100dvh` with `env(safe-area-inset-bottom)` padding: header (progress, exit, sound, settings), question in the upper 40%, answers stacked in the lower 55%.
4. Answer buttons are full width minus 16 px gutters, at least 56 px tall with 12 px gaps, and hold 18 px left-aligned text that wraps and grows the button. Letter badges (A to D) identify options without color. Use a 16 px radius and a 4 px darker bottom edge that compresses 2 px on press.
5. Desktop (768 px and up) gets a 720 px column, a 2 by 2 grid only when every answer is under about 24 characters, and key hints 1 to 4. Shortcuts can be switched off and only listen while focus is in the question (SC 2.1.4).
6. Show the pressed state on `pointerdown` but commit on `click`, so sliding off cancels. Score speed from that press's `pointerdown` timestamp.
7. Accessible names match the visible answer text. Each new question moves focus to its heading (`tabindex="-1"`), after hidden "Question 3 of 10" text.

**Reveal**

8. Solo timeline: press state at 0 ms; lock-in by 150 ms (10 ms vibration on Android if on); reveal at 400 ms; points count up until 900 ms; then the explanation sheet rises as an overlay, so nothing shifts (CLS budget 0.05). The automatic part stays under 1.2 s, and a tap skips it.
9. A wrong pick turns red with an X and "Your answer"; the right one turns green with a check and "Correct answer". Others dim but keep 4.5:1 text contrast. A 6 px, two-cycle shake becomes a color fade under reduced motion.
10. The explanation stays until the player taps Continue, which sits where the answers were. Optional Auto-advance waits 2 s plus 0.25 s per word. Hosts advance live rooms; autopilot rooms allow 3 s plus 0.3 s per word.
11. A polite `role="status"` region says "Correct. Paris. Plus 850 points." or "Not quite. You chose Lyon. The answer is Paris." `role="alert"` is only for a lost connection.

**Timers**

12. Off, Relaxed (2x), Standard (20 s) and Fast (10 s), per report 03; solo practice defaults to Off. Timed modes show the question alone for 0.25 s per word (1.5 to 5 s, doubled on Relaxed), then fade in answers and start the clock.
13. A linear bar above the answers plus a seconds label. At 5 s left it turns amber and striped, so the change isn't color alone. No flashing, and no pulse under reduced motion.
14. The visual timer has `aria-live="off"`; opt-in "Announce time" speaks 10 s and 5 s warnings via the status region. Solo timers pause on `visibilitychange`. Hosts can add 50% time for everyone or for one player.

**Progress and results**

15. A segmented bar, one segment per question, each marked with a check or X icon once answered. Endless modes show lives instead.
16. Results open on the best fact (a personal best, accuracy, a longest streak or a level-up), then the Daily percentile, then "Review your misses". One primary button ("Play again" or "Done for today"), with Share secondary.
17. Share uses the Web Share API with a clipboard fallback and leads with words ("Daily #212: 8/10, best streak 6") plus the link. Any emoji grid comes last.

**Sound and haptics**

18. Effects are synthesized or sprited in Web Audio (under 30 KB), with the `AudioContext` created on the first tap. They start off behind a visible speaker toggle (report 03). Effects and Music have separate toggles and volume. Music never autoplays, and choices persist.
19. A soft tap under 50 ms, a rising two-note chime under 300 ms for correct, a low muted thud for wrong (no harsh buzzer), and ticks only in the last 5 s.
20. Android haptics sit behind a toggle: tap 10 ms, correct 20 ms, wrong 30-40-30 ms. Nothing depends on them. The iOS workaround stays flagged off until it passes VoiceOver testing.

**Motion and visual style**

21. The initial bundle uses only CSS transitions, `@starting-style`, WAAPI and View Transitions. Confetti (`disableForReducedMotion: true`) and any mascot load lazily. An in-app Reduce motion setting overrides the OS either way. Big celebrations are kept for 5- and 10-answer streaks and perfect rounds.
22. Fredoka or Nunito for headings and scores; Atkinson Hyperlegible Next for reading text. Questions 22 to 26 px on mobile with `text-wrap: balance`; explanations 17 px, 65 characters a line at most; `tabular-nums` on scores and timers so count-ups don't jitter. No all-caps answers; bold, not italics.
23. "Readable text" adds 0.05 em letter spacing, 1.6 line height and an off-white background. "Read aloud" uses `speechSynthesis` and pauses the timer while it speaks.
24. Semantic tokens (correct, incorrect, selected, warning) pass 3:1 against neighbors in both themes and under protan and deutan simulation. "High-contrast feedback" swaps to blue and orange, as Wordle does. In `forced-colors` mode, borders and icons carry the states.
25. Dark mode follows the system, with an override: surfaces near #121212, desaturated accents, re-checked contrast, no translucent panels behind text.

**QA**

26. Test iPhone Safari (iOS 18 and 26), a mid-range Android phone with Chrome, and desktop Chrome, Edge, Firefox and Safari; VoiceOver, TalkBack, NVDA and a JAWS spot check; keyboard-only play, reduced motion, forced colors, 200% zoom and 320 px width. Gate releases on answer-tap INP of 200 ms or less.

## Anti-patterns to avoid

- A sign-up wall or tutorial carousel before the first question.
- Red and green fills as the only feedback.
- Auto-advancing past an explanation before anyone could read it.
- Small or top-corner targets, or buttons that move between questions.
- Committing answers on touch-down.
- Solo timers with no off switch, or timers that keep running in a hidden tab.
- Flashing countdowns, or live regions that read every tick.
- Number-key shortcuts that can't be turned off.
- Sound before a tap, or music on by default.
- `<audio>` elements for effects, which can pause the player's own music.
- Vibration that carries meaning, or long buzzy patterns.
- An animation runtime in the initial bundle, or confetti that ignores reduced motion (the library default).
- Long, unskippable celebrations, or emoji-only share text.
- Pure black with neon accents, or glass panels behind text.
- A "dyslexia font" offered as the whole accessibility story.
- Dimming unchosen answers until they can't be read.

## Open questions

1. **Ranked Daily and timers.** If the Daily board rewards speed, an Off timer breaks comparability, yet 2.2.1 applies unless timing is essential. Rank by accuracy with time as a tiebreaker, or keep a separate untimed board?
2. **Sound default.** Report 03 says off. Test that against "on after the first tap, at low volume".
3. **iOS haptics.** Is the switch workaround stable across iOS releases, and invisible to VoiceOver?
4. **European Accessibility Act.** It has applied since 28 June 2025 to some consumer services, e-commerce included, with a microenterprise exemption ([EUR-Lex](https://eur-lex.europa.eu/eli/dir/2019/882/oj)) [K]. If we sell anything, legal should confirm whether WCAG 2.1 AA (via EN 301 549) binds us.
5. **Mascot.** Is a character worth hundreds of KB, or can SVG and CSS poses do the job?
6. **Desktop layout.** A 2 by 2 grid or a list? A/B test it with keyboard users.
7. **Confirm step.** Should players with tremors get a "select, then confirm" mode, and how should speed scoring treat it?
8. **Re-verification.** Re-check every [K] and [O] item once search is back, especially the NN/g URLs and Material 3 Expressive figures. No Baymard data was reachable.

## Sources

Verified this session [V] (source repository, package or bundle):

- https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html
- https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html
- https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html
- https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- https://github.com/w3c/wcag
- https://w3c.github.io/aria/
- https://webaudio.github.io/web-audio-api/
- https://w3c.github.io/audio-session/
- https://github.com/mdn/browser-compat-data
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
- https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
- https://web.dev/articles/inp
- https://github.com/GoogleChrome/web-vitals
- https://github.com/tijnjh/ios-haptics
- https://github.com/catdad/canvas-confetti
- https://github.com/google/fonts
- https://www.npmjs.com/package/lottie-web
- https://www.npmjs.com/package/motion
- https://www.npmjs.com/package/@rive-app/canvas-lite

Known sources, not re-opened [K]:

- https://alistapart.com/article/signupforms/
- https://www.useronboard.com/how-duolingo-onboards-new-users/
- https://www.nngroup.com/articles/mobile-app-onboarding/
- https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
- https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php
- https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/
- https://developer.apple.com/design/human-interface-guidelines/accessibility
- https://support.google.com/accessibility/android/answer/7101858
- https://www.nngroup.com/articles/touch-target-size/
- https://doi.org/10.1037/h0055392
- https://www.nngroup.com/articles/response-times-3-important-limits/
- https://www.nngroup.com/articles/animation-duration/
- https://doi.org/10.1016/j.jml.2019.104047
- https://doi.org/10.3102/0034654314564881
- https://doi.org/10.1037/1076-898X.13.4.273
- https://doi.org/10.1177/0894439313497468
- https://doi.org/10.1111/j.1467-9280.1993.tb00589.x
- https://gameaccessibilityguidelines.com/full-list/
- https://developer.apple.com/design/human-interface-guidelines/playing-haptics
- https://developer.android.com/develop/ui/views/haptics/haptics-principles
- https://doi.org/10.1001/archinternmed.2009.66
- https://doi.org/10.1145/2513383.2513447
- https://doi.org/10.1007/s11881-016-0127-1
- https://doi.org/10.1007/s11881-017-0154-6
- https://doi.org/10.1073/pnas.1205566109
- https://www.bdadyslexia.org.uk/advice/employers/creating-a-dyslexia-friendly-workplace/dyslexia-friendly-style-guide
- https://www.colourblindawareness.org/colour-blindness/
- https://www.nngroup.com/articles/dark-mode/
- https://m2.material.io/design/color/dark-theme.html
- https://design.google/library/expressive-material-design-google-research
- https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/
- https://www.nngroup.com/articles/liquid-glass/
- https://eur-lex.europa.eu/eli/dir/2019/882/oj

Product observations [O]:

- https://www.nytimes.com/games/wordle/index.html
- https://www.duolingo.com/
- https://kahoot.com/
- https://www.jackboxgames.com/
