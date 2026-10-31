# Gap 2. Web retention without push, and guest identity across share links

*Follow-up track, compiled 2026-10-31.* **Method note.** The shared WebSearch budget was spent before this track ran, so none of its planned searches happened, and webkit.org and support.google.com sit outside this session's network. This report rests on primary sources still reachable through git and npm: WebKit's source code and commit history on `main` and on Safari release branches, MDN's documentation source (snapshot of 2026-10-30), the source of Chrome's Custom Tabs docs, a maintained in-app browser detector with its test fixtures, and a calendar-link reference last checked 2026-08-19. Retention benchmarks, traffic shares and vendor push figures needed the open web, so those questions stay open at the end, with the searches to run.

*Tags:* **[F]** primary doc or source code read today. **[R]** sourced in an earlier `docs/research/` report. **[K]** background knowledge, not re-verified. *Our read* marks interpretation.

## Summary

- **Still no web retention benchmark.** We could not verify a D1, D7 or D30 figure for any browser game or web daily. The only "return" numbers in our files, LinkedIn's 84% next day and 80% a week later, describe returning players inside an app with push [R]. The targets below are judgment, built down from mobile baselines.
- **Safari's seven-day cap is no longer the default rule.** Since the Safari 18 generation (our reading of Apple's release branches), WebKit deletes a site's script-written storage after 30 days of browser use without a tap on that site. Seven days applies only when a site classified as a tracker sent the visitor with link decoration that Safari didn't strip [F]. MDN still says seven days [F].
- **`navigator.storage.persist()` protects nobody in a Safari tab.** WebKit grants it only to sites that are already exempt, chiefly Home Screen web apps, and those are exempt from deletion outright [F].
- **Server-set cookies survive WebKit's deletion pass; script-set cookies don't** [F]. A first-party cookie is a cheap backup for the guest credential.
- **In-app browsers are spreading into group chats.** WhatsApp now opens links in its own browser on iOS and Android (detection added November 2025), Reddit's Android app uses a WebView, and Telegram runs its own on both platforms [F]. These containers don't share storage with Safari or Chrome [F on Android, K on iOS].
- **Android Custom Tabs keep identity; SFSafariViewController doesn't.** Custom Tabs share Chrome's cookie jar [F]. SFSafariViewController has kept a separate store per host app since iOS 11 [K].
- **Measured D1 will understate real return for share cohorts.** A player who starts in WhatsApp and comes back through Safari looks like two people, so kill lines must read a clean cohort, not the blend (*our read*).
- **Web-calibrated targets for the clean cohort:** D1 30% (kill line 20%), D7 12% (floor 5%), D30 5% (floor 2%), plus a 70% next-day continuation target, which is the honest comparison with LinkedIn.
- **No web push in v1, installed or not.** Ship calendar reminders and an install pitch. Build push once installed players pass a set threshold and the Edge Function secret path passes CI.

## Detailed findings

### 1. Published retention for browser games and web dailies

Nothing verifiable surfaced. Report 02 had already flagged web retention as an open question [R], and this track's searches of Poki and CrazyGames developer material, GameAnalytics web segments, Wordle-style creators' posts and Similarweb could not run. GameAnalytics' 2026 report covers mobile and PC ([GameAnalytics](https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks)) [R], which leaves the gap open.

The mobile baselines from 02 are the floor we stand on: median D1 about 22 to 27%, top quartile 27 to 33% on iOS, and the best trivia titles up to 48% in 2018-2019 data. Median D7 sits around 4%, and median D28 under 1%, against 6.5% for top performers in 2018 ([GameAnalytics 2025](https://www.gameanalytics.com/reports/2025-mobile-gaming-benchmarks), [Adjust 2026](https://a.storyblok.com/f/47007/x/20551740ee/gaming-app-insights-report-2026.pdf)) [R].

LinkedIn's figures need care. "84% return the next day and 80% a week later" ([Social Media Today](https://www.socialmediatoday.com/news/linkedin-adds-zip-puzzle-game/742847/)) [R] counts players already in the habit, inside an app that can push and that ranks you against colleagues. Set beside new-player D1, it inflates expectations roughly threefold (*our read*). It belongs next to a continuation metric (finished yesterday, finished today).

### 2. Where share links open, and whose storage they use

| App | iOS | Android | Evidence |
|---|---|---|---|
| iMessage | Default browser | n/a | [K] |
| WhatsApp | Own WebView (token `WAiOS`, fixture from iOS 26.0.1) | Own browser (token `WA4A`) | Detection for both added 2025-11-13 [F] |
| Instagram, Facebook, Messenger, Threads | Own WebView (Threads: no iOS fixture) | Own WebView | Fixtures on both platforms; Threads added 2024-11 [F] |
| TikTok | Own WebView | Own WebView | Fixtures on both [F] |
| Snapchat, LinkedIn | Own WebView | No fixture | iOS fixtures only [F] |
| Telegram | Own WebView | Own WebView | Detected through injected `window` objects [F] |
| Reddit | No rule; likely SFSafariViewController [K, low] | Own WebView, seen in build 2024.41 | Android rule added 2026-06-13 [F] |
| X | No current rule; the only fixture dates from iOS 10 | Likely Custom Tabs [K, low] | [F] for the fixture |
| Discord, Slack | No rules; likely SFSafariViewController or Safari [K, low] | Likely Custom Tabs [K, low] | |
| Google app | Own WebView (token `GSA`) | No fixture | [F] |

Sources for the [F] cells: the [inapp-spy](https://github.com/shalanah/inapp-spy) detector (v5.0.10, June 2026), its [changelog](https://github.com/shalanah/inapp-spy/blob/main/CHANGELOG.md), [user-agent rules](https://github.com/shalanah/inapp-spy/blob/main/src/regexAppName.ts), [Telegram check](https://github.com/shalanah/inapp-spy/blob/main/src/detectTelegram.ts) and [fixtures](https://github.com/shalanah/inapp-spy/blob/main/src/tests/mobile.ts). A rule proves an app shipped its own WebView at some point. A missing rule proves nothing, because SFSafariViewController and Custom Tabs send the browser's own user agent.

What each container keeps:

- **System browser.** Persistent. MDN lists proactive deletion as Safari-only ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)) [F]; section 4 covers Safari's rules.
- **Chrome Custom Tabs.** Google lists a "shared cookie jar and permissions model so users don't have to sign-in to sites they are already connected to" ([Chrome](https://developer.chrome.com/docs/android/custom-tabs)) [F]. *Our read:* origin storage is Chrome's too, so identity carries over.
- **Android WebViews.** The same page says WebViews "don't share state with the browser" [F]. Each app holds its own data [K].
- **SFSafariViewController.** A separate store per host app since iOS 11 [K]. The detector's check for it is labeled experimental and needed a fix for Safari 26.4 in March 2026 [F].
- **iOS app WebViews.** Tracking prevention is on by default for apps linked against a recent SDK (iOS 14 onward [K]). The exception is an app that declares `NSCrossWebsiteTrackingUsageDescription` and whose user turned on "Allow Cross-Website Tracking" ([WebKit source](https://github.com/WebKit/WebKit/blob/safari-7622-branch/Source/WebKit/Shared/Cocoa/DefaultWebBrowserChecks.mm)) [F]. So the 30-day rule below applies inside Instagram too, counted in that app's own days of use (*our read*). WebKit also gives embedded WebViews a smaller quota, about 15% of disk against 60% in a browser (MDN) [F]. Whether an app keeps its WebView store between visits is the app's choice, and we verified none [K].

### 3. How much traffic arrives in-app

We found no published per-app breakdown for web games or publishers. The direction shows anyway. The detector added Telegram, LinkedIn and the Google app in October 2024, Threads in November 2024, WhatsApp in November 2025 and Reddit's Android app in June 2026 [F]. WhatsApp matters most to us, because group chats are our main growth loop.

### 4. WebKit's storage rules, read from the source

We read WebKit `main` at commit `bb413b83` (2026-10-31) and four release branches: `safari-7618` (last commit 2024-07-01), `safari-7619` (2024-09-24), `safari-7622` (2025-10-06) and `safari-7625` (2026-09-29). By their dates these are the Safari 17.x, 18, 26 and fall 2026 lines (*our read* of Apple's build numbers).

**The window is 30 days for most sites.** The seven-day cap dates from March 2020 ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)) [K]. Until February 2024 every first-party site lost its script-written storage after 7 "operating days" (days the browser was used) without user interaction. Commit [274398@main](https://github.com/WebKit/WebKit/commit/45061230013728ec9c4900b01b12af26dc592b4b) ([bug 265598](https://bugs.webkit.org/show_bug.cgi?id=265598)) says that rule "has a negative impact on usability by people who visit sites semi-frequently but longer than 7-operational-days". It moved sites never reached through cross-site link decoration, or whose decoration Safari filtered, to 30 operating days. The 7-day window remains for sites reached with unfiltered decoration from a classified tracker [F]. The 30-day branch is absent on `safari-7618` and present on `safari-7619`, `safari-7622`, `safari-7625` and `main` ([deletion logic](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/Classifier/ResourceLoadStatisticsStore.cpp)) [F]. A tap or click resets the clock. A site with no recorded interaction gets no window at all and can be cleared at the next pass, which runs at most hourly [F].

**Exempt domains.** The deletion pass skips app-bound domains, managed domains, domains an embedding app marks through a private API (added July 2024, [bug 276786](https://bugs.webkit.org/show_bug.cgi?id=276786)) and the Home Screen app's own domain. The code comment reads: "Domains permanently configured to be exempt. This can be home screen web applications, app-bound domains, or similar" [F]. It also skips domains whose push notifications the user engaged with in the last 30 operating days ([bug 244609](https://bugs.webkit.org/show_bug.cgi?id=244609)) [F].

**`persist()`.** Since May 2023 ([bug 256817](https://bugs.webkit.org/show_bug.cgi?id=256817)), WebKit resolves `navigator.storage.persist()` to true only when the site is already on that exempt list, and to false in cross-origin frames ([source](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/storage/NetworkStorageManager.cpp)) [F]. The same rule is on all three newer release branches [F]. That answers report 08's open question: it doesn't lift the cap for a site that isn't installed. Inside a Home Screen app it adds protection from storage-pressure eviction, which skips persisted origins (MDN) [F].

**Cookies.** Since June 2022, cookies set from script are deleted along with other script-written storage, and those set on a link-decoration landing expire within 24 hours ([bug 240248](https://bugs.webkit.org/show_bug.cgi?id=240248)) [F]. Server-set cookies are exempt from the deletion (MDN) [F]. Safari still caps them at 7 days when the response comes from an IP address mostly different from the main page's, its defense against cloaked trackers ([bug 246477](https://bugs.webkit.org/show_bug.cgi?id=246477)) [F]. A route on our own origin shouldn't trip that (*our read*).

**A new 180-day sweep.** In May 2026 WebKit added time-based eviction. Storage API data for origins not accessed in 180 days is deleted, skipping active and persisted origins and, after a follow-up, any origin with a push subscription ([bug 313865](https://bugs.webkit.org/show_bug.cgi?id=313865), [bug 314872](https://bugs.webkit.org/show_bug.cgi?id=314872)). It was switched on in [bug 315158](https://bugs.webkit.org/show_bug.cgi?id=315158) and sits on `safari-7625` with every storage type as the default, unless a build flag limits it to service workers [F]. Its commit says it exists because "for users with ITP disabled, website data can accumulate indefinitely", so it rarely touches an active player.

**Confidence.** This is code, not Apple's runtime configuration, and MDN's current page still describes a flat seven days. The 2024 commit message also says the patch "doesn't change the current behavior", apparently about database compatibility, yet the code before and after it moves ordinary sites from 7 to 30 operating days. We rate the 30-day reading medium-high and want a device test before any copy relies on it (open question 9).

### 5. Reminders without push

**Calendar mechanics.** Google's `calendar.google.com/calendar/render?action=TEMPLATE` link accepts `recur=RRULE:FREQ=DAILY` and a `ctz` time zone, both marked verified on 2026-08-19. On Android, `render` is reportedly the only form that opens the event editor in the Calendar app ([add-event-to-calendar-docs](https://github.com/InteractionDesignFoundation/add-event-to-calendar-docs/blob/main/services/google.md)) [F, secondary]. We couldn't reach Google's help page on whether Android's Calendar opens a downloaded `.ics`. From memory, the help says imports work only from a computer [K], so we treat `.ics` on Android as unreliable. iOS Safari hands a `text/calendar` file to an Add to Calendar sheet [K].

**Uptake.** We found no figure for add-to-calendar uptake on a daily habit, and none for Add to Home Screen acceptance on iOS or Android. Report 04 had none either [R].

**iOS 26 install.** WWDC25 coverage said every site added to the Home Screen on iOS 26 opens as a web app by default [K, low; not re-verified].

### 6. Web push benchmarks and Chrome's auto-revocation

Vendor benchmarks for 2025 and 2026 (OneSignal, Airship, CleverTap) remain unverified. The verified record from report 04 [R]: Firefox users accepted about 1.6% of 1.45B prompts, yet new users accepted 56% of first-time prompts that followed a user action ([Mozilla](https://blog.mozilla.org/futurereleases/2019/11/04/restricting-notification-permission-prompts-in-firefox/)). Since October 10, 2025 Chrome revokes permission from sites with low engagement and high volume, noting that under 1% of notifications draw any interaction, and installed web apps are exempt ([Google](https://blog.google/chromium/automatic-notification-permission/)). iOS allows web push only from Home Screen apps ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).

*Our read:* revocation shrinks a tab-based site's reachable list over time, so pre-revocation opt-in benchmarks overstate long-run reach. Installed PWAs are the one web context where push behaves like an app's, and early on they'll be a small group.

## Implications for our product

### Targets and kill lines (replaces the retention rows of SYNTHESIS 10.2)

Split every cohort by where the first finish happened. **Clean** means a system browser, a Custom Tab or the installed app. **In-app** means a detected WebView. SFSafariViewController can't be told apart reliably, so it falls into clean. Kill lines read the clean cohort only, and only in weeks with at least 400 clean first finishers (a 95% interval of about ±4.5 points at 30%).

| Metric | Target | Stretch | Kill line or floor | Basis |
|---|---|---|---|---|
| D1, clean | 30% | 40% | Under 20% after two onboarding iterations: rework the core loop | Mobile median 22-27%, top quartile 27-33% (02). An activated cohort lifts it; no icon and no push lower it (ours) |
| D7, clean | 12% | 20% | Under 5%: review the habit loop | Mobile median about 4%; best trivia 15-25% (02) |
| D30, clean | 5% | 8% | Under 2% | Top performers 6.5% D28 in 2018; median under 1% (02) |
| Next-day continuation (finished yesterday, finishes today) | 70% | 80% | Under 55% | LinkedIn's 84% is this kind of number, from an app with push (ours) |
| D1, in-app | Report weekly | | Below half of clean D1: fix the handoff, not the loop | ours |
| In-app first finishers who use the claim link | 25% | | Under 10% | ours |

The beta ladder in 10.5 should advance on clean D1 of 30%, not 35% blended. Revisit every number after four weeks of data.

### In-app browser policy for share landings

1. **Play first, in whatever container.** No "open in your browser" wall before question one.
2. **Log the container.** `landing_view` gains `context` (browser, installed, in_app or unknown) and `app`, from the detector's user-agent rules plus the Telegram object check. Leave out the experimental SFSafariViewController check at launch.
3. **After the first finished Daily inside a WebView, offer one handoff.** A card under the result says something like "Playing inside WhatsApp? Open this in Safari to keep your streak." Tapping it swaps the address to a claim URL with `history.replaceState`, so the app's own "Open in browser" menu carries the token. On Android the button can also fire an `intent://` link to the default browser [K; test each app]. iOS has no supported way to force Safari [K], so show the two taps.
4. **Claims are single-use and expire after 10 minutes; the database keeps only a hash.** A claim gives the browser the same player id with a new secret, and the WebView keeps working. A confirm step ("Continue as Plucky Otter, 3-day streak?") limits damage if someone shares a claim URL by mistake, and the page swaps back to its normal URL when the token expires.
5. **Never pitch install, push or a calendar download inside a WebView.** Wait for a system browser.
6. **Keep share URLs path-only**, like `/d/2026-11-01/r/AB12`, with no query string, fragment or UTM tag. WebKit's 7-day path keys on link decoration, and a clean path is cheap insurance (*our read*).

### Sync-code trigger (replaces "at a 2-day streak")

- **In a WebView:** right after the first finish, offer the claim link first and the sync code as the fallback.
- **In Safari Private Browsing:** after the first finish, since storage ends with the tab [K].
- **In a system browser:** after the third finished Daily or the first saved quiz. With a 30-day window, losing data by day two is unlikely in Safari, and asking later reaches people who have a habit to protect.
- **Before the iOS install pitch:** show and copy the code, because the Home Screen app starts with its own storage [K]. The installed app's first screen offers "Paste your code".
- **Silent recovery first.** When the identity is minted, a same-origin route sets a first-party backup cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, up to 400 days, Chrome's cap [K]). On load with empty storage, call `/api/restore`, answering same-origin requests only (check `Sec-Fetch-Site`). It needs no key, so it fits the constraints. Log `identity_restored` with its source and `storage_lost` whenever the cookie rescues an empty store; that second event measures real iOS deletion.
- **Call `persist()` only in standalone mode**, where it resolves true.

Rename the 10.2 metric to "players with three finished Dailies who save a code: 30%".

### Reminders and install

- After the first finished Daily in a system browser, offer one "Remind me daily" button. Android and desktop Chrome get the Google template link: `recur=RRULE:FREQ=DAILY`, `ctz` set to the player's IANA zone, a 5-minute event at their chosen time and the Daily's URL in `details`. Apple devices and other calendar apps get an `.ics` with the same RRULE, and desktop shows both. Log `calendar_add` by method.
- Pitch install after the third finished Daily: `beforeinstallprompt` on Chromium, two illustrated steps on iOS Safari. Check the iOS 26 menu path on a device before writing the copy.

### Push for installed PWAs in v1: no

The installed cohort will be small at launch, and iOS push needs an install first. The VAPID private key would sit in an Edge Function secret the sandbox can't test, which the constraints tell us to avoid, and calendar reminders already cover the daily nudge. Build push when installed weekly players reach 10% of weekly habit players or 1,000, whichever comes first, and a GitHub Actions job exercises the Edge Function end to end. When it ships, ask only inside the installed app after a finished Daily, send at most one reminder a day, and stop after three are ignored (decision 9). WebKit then rewards it twice: push-subscribed origins skip the 180-day sweep, and engaged notifications keep a domain's data [F].

## Anti-patterns to avoid

- Gating play behind "open in browser", or showing install and push prompts inside WebViews.
- Calling `persist()` and treating it as protection for Safari tab players. It resolves false there.
- Comparing cohort D1 with LinkedIn's 84%.
- Killing the core loop on blended D1 when many first plays happened in WebViews.
- Keeping the guest secret in a script-set cookie. WebKit deletes those with localStorage and caps them at 24 hours after decorated landings.
- Adding query strings or UTM tags to our own share links.
- Asking for a sync code on a first visit in a system browser.
- Building push before an installed cohort exists to use it.

## Open questions

Allowing webkit.org and support.google.com in the session's network settings would settle items 5 and 9 faster. The rest need web searches this run couldn't make.

1. Web D1, D7 and D30 for browser games and dailies: Poki and CrazyGames docs and talks, GameAnalytics web segments, Wordle-style creators' posts and Similarweb returning-visitor shares.
2. The in-app share of traffic, by app, from any analytics publisher.
3. 2026 link behavior for X, Discord, Slack and iMessage, plus Snapchat and LinkedIn on Android. A device test settles this in an afternoon.
4. Does each app's WebView keep localStorage between visits?
5. Does Android's Google Calendar open a downloaded `.ics` in 2026?
6. Uptake for add-to-calendar on daily habits and for Add to Home Screen.
7. Vendor push benchmarks for 2025-2026, and the measured effect of Chrome's revocation on opt-in bases.
8. Does iOS copy cookies or storage into a Home Screen web app at install?
9. Does shipping Safari follow WebKit's 30-day default? Seed data on a test device, stay away for 8 and then 31 days of Safari use, and check.

## Sources

- https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/Classifier/ResourceLoadStatisticsStore.cpp
- https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/storage/NetworkStorageManager.cpp
- https://github.com/WebKit/WebKit/blob/safari-7622-branch/Source/WebKit/Shared/Cocoa/DefaultWebBrowserChecks.mm
- https://github.com/WebKit/WebKit/commit/45061230013728ec9c4900b01b12af26dc592b4b
- https://github.com/WebKit/WebKit/tree/safari-7618-branch
- https://github.com/WebKit/WebKit/tree/safari-7619-branch
- https://github.com/WebKit/WebKit/tree/safari-7622-branch
- https://github.com/WebKit/WebKit/tree/safari-7625-branch
- https://bugs.webkit.org/show_bug.cgi?id=265598
- https://bugs.webkit.org/show_bug.cgi?id=256817
- https://bugs.webkit.org/show_bug.cgi?id=276786
- https://bugs.webkit.org/show_bug.cgi?id=244609
- https://bugs.webkit.org/show_bug.cgi?id=240248
- https://bugs.webkit.org/show_bug.cgi?id=246477
- https://bugs.webkit.org/show_bug.cgi?id=313865
- https://bugs.webkit.org/show_bug.cgi?id=314872
- https://bugs.webkit.org/show_bug.cgi?id=315158
- https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- https://developer.chrome.com/docs/android/custom-tabs
- https://github.com/shalanah/inapp-spy
- https://github.com/shalanah/inapp-spy/blob/main/CHANGELOG.md
- https://github.com/shalanah/inapp-spy/blob/main/src/regexAppName.ts
- https://github.com/shalanah/inapp-spy/blob/main/src/detectTelegram.ts
- https://github.com/shalanah/inapp-spy/blob/main/src/tests/mobile.ts
- https://github.com/InteractionDesignFoundation/add-event-to-calendar-docs/blob/main/services/google.md
- https://www.socialmediatoday.com/news/linkedin-adds-zip-puzzle-game/742847/
- https://www.gameanalytics.com/reports/2025-mobile-gaming-benchmarks
- https://www.gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks
- https://a.storyblok.com/f/47007/x/20551740ee/gaming-app-insights-report-2026.pdf
- https://blog.mozilla.org/futurereleases/2019/11/04/restricting-notification-permission-prompts-in-firefox/
- https://blog.google/chromium/automatic-notification-permission/
