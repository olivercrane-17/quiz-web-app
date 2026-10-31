# 08. Technical best practices for a Next.js 16 + Supabase quiz app

*Track 08, compiled 2026-10-31.* **Method note.** The shared WebSearch budget was spent before this track began, so no web searches ran, and vercel.com is outside this session's network. The report rests on primary sources still reachable: the Next.js 16.4.3 docs bundled in `node_modules` (linked at their nextjs.org paths), Supabase's docs through its MCP tool, npm package tarballs, the installed `@supabase/*` 2.118.0 source and our project metadata. Vercel limits are background knowledge.

*Tags:* **[F]** primary doc or source code read today. **[R]** sourced in an earlier `docs/research/` report. **[K]** background knowledge, not re-verified. *Our read* marks interpretation.

## Summary

- **Next.js 16 removes the 15.x escape hatches.** Request APIs are async only, `middleware` became the Node-only `proxy`, Turbopack is the default (any webpack config, even a plugin's, fails `next build`), and `revalidateTag` needs a cache profile [F].
- **Cache Components, already on in our config, sets the rules.** `dynamic` and `revalidate` exports error, `Date.now()` in a prerender breaks the build, in-memory `use cache` rarely survives between serverless calls, and visited routes stay mounted but hidden in `<Activity>` [F].
- **Keep gameplay off Server Actions.** The client sends them one at a time, and a deploy can invalidate their IDs mid-session. Browser-to-RPC calls avoid both (*our read* on [F]).
- **Without Supabase Auth, every RPC runs as `anon`** under a 3 s timeout. An `anon`-callable `SECURITY DEFINER` function is a public API, so each needs `search_path = ''`, explicit grants, input checks and a rate limit [F].
- **Live rooms: Broadcast plus a real polling fallback.** Postgres Changes checks access per subscriber on one thread, and Presence allows 20 messages a second on Free. Private channels need a JWT we lack, so topics must be unguessable and messages treated as hints to refetch [F].
- **Supabase Free has hard edges:** 200 realtime connections, 100 messages a second, read-only mode at 500 MB, 10 GB of bandwidth, a pause after a quiet week and no automatic backups [F].
- **Vercel Hobby is for non-commercial use** and likely lacks Skew Protection [K, medium]. Ads or paid features mean Pro.
- **Offline needs a real service worker.** The experimental `useOffline` only retries requests. Serwist 9.5's Turbopack helper exports `dynamic = 'force-static'`, which Cache Components rejects, so its post-build CLI mode is the one to try [F].
- **Field data improved.** web-vitals 6 reports LCP and INP beyond Chromium and measures soft navigations in Chromium 151+, and first-party beacons meet our no-tracker rule [F].
- **Anti-cheat is architecture:** no ranked answers before lock-in, server timestamps, coarse time bands and per-attempt option shuffles ([R], [K], *our read*).

## Detailed findings

### 1. Next.js 15 to 16: changes that touch us

From the [upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) [F]:

- **Floors.** Node.js 20.9+ and TypeScript 5.1+ to build; Safari 16.4+ or Chromium and Firefox 111+ to run.
- **Async request APIs.** `cookies()`, `headers()`, `params` and `searchParams` must be awaited, including in `opengraph-image` and `icon` routes. `next typegen` emits `PageProps` helpers.
- **`proxy` replaces `middleware`.** Its runtime "is `nodejs`, and it cannot be configured," edge middleware should not be blindly renamed, and the docs call Proxy a last resort ([proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)).
- **Turbopack by default.** A `webpack` config fails `next build`; if you never wrote one, "it is likely that a plugin is adding a webpack option."
- **Caching APIs.** `revalidateTag(tag, profile)` needs a `cacheLife` profile, `updateTag` gives read-your-writes in Server Actions, `refresh()` re-renders the route, and `cacheLife`/`cacheTag` dropped `unstable_`.
- **Images.** `qualities` defaults to `[75]`, `minimumCacheTTL` rose from 60 s to 4 hours, query-string local images need `localPatterns`, and local-IP sources are blocked.
- **Removals.** AMP, `next lint`, runtime config and `unstable_rootParams` are gone, and parallel route slots now need `default.js`.

### 2. Cache Components rules

Our config enables `cacheComponents` and `partialPrefetching`, the create-next-app 16.4 defaults ([caching](https://nextjs.org/docs/app/getting-started/caching)) [F]:

- Data is dynamic unless wrapped in `use cache`, which should always name a `cacheLife`. Cached scopes cannot read `cookies()` or `headers()`, a mistake that "can pass `next build` and fail under `next start`" ([use cache](https://nextjs.org/docs/app/api-reference/directives/use-cache)).
- Exports of `dynamic` or `revalidate` error ([migration guide](https://nextjs.org/docs/app/guides/migrating-to-cache-components)), and so does `runtime`, including the `runtime = 'edge'` many OG examples carry ([cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)).
- `new Date()`, `Date.now()`, `Math.random()` and `crypto.randomUUID()` in a prerender fail the build. Use `connection()` inside `<Suspense>`, or move the work to the client.
- On serverless the in-memory cache "typically" does not persist across requests, and nothing survives a deploy.
- Visited routes are hidden with `<Activity>`: state survives back-navigation while effects are torn down and re-created.
- HTML-limited bots render dynamically, so "a page that loads for a person can fail to render for a crawler" when it needs build-time-only data ([streaming](https://nextjs.org/docs/app/guides/streaming)).

*Our read:* timers must rebuild from a stored deadline when a screen reappears, and share pages must render without a database call.

### 3. Server Actions and Route Handlers

- Server Actions are "reachable via a direct POST request." The framework adds an Origin/Host check and a 1 MB body cap, but each action still needs its own auth check and input validation ([data security](https://nextjs.org/docs/app/guides/data-security), [server actions](https://nextjs.org/docs/app/guides/server-actions)) [F].
- The client "dispatches Server Actions one at a time," so `Promise.all` cannot parallelize them [F].
- Action IDs change with new builds, and a tab on the old build gets "Failed to find Server Action." With `deploymentId` set, Next detects skew and forces a hard navigation ([self-hosting](https://nextjs.org/docs/app/guides/self-hosting)) [F].
- Under Cache Components, `GET` Route Handlers follow the page model and can cache a helper with `use cache` ([route handlers](https://nextjs.org/docs/app/getting-started/route-handlers)). `after()` runs logging after the response via `waitUntil` ([after](https://nextjs.org/docs/app/api-reference/functions/after)) [F].

### 4. Share images with `next/og`

`ImageResponse` (Satori plus Resvg) handles flexbox and a CSS subset but not grid. Its bundle is capped at 500 KB with fonts included, and fonts must be ttf/otf/woff ([ImageResponse](https://nextjs.org/docs/app/api-reference/functions/image-response)) [F]. Static `opengraph-image` files must stay under 8 MB and `twitter-image` under 5 MB, and generated ones prerender unless they read request-time data ([opengraph-image](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image)) [F].

### 5. Supabase without Supabase Auth

**Anonymous sign-ins are off the table** because we cannot change Auth settings. For reference, anonymous users take the `authenticated` role with an `is_anonymous` claim, sign-ins are capped at 30 per hour per IP with CAPTCHA advised, conversion needs manual identity linking, and nothing cleans them up ([anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)) [F]. Our hashed guest secret also stays outside the 50,000 MAU quota, which counts Auth users only ([MAU](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users)) [F].

**RPC security.** A `security definer` function "must set the `search_path`," and with `search_path = ''` every relation needs its schema. Functions are executable by any role until revoked from both `public` and `anon` ([functions](https://supabase.com/docs/guides/database/functions)) [F]. Lint 0028 adds that an `anon`-executable definer function "is effectively a public API endpoint" at `POST /rest/v1/rpc/<name>`, so it should validate input and do little ([lint 0028](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0028_anon_security_definer_function_executable)) [F]. Supabase is "moving the platform default to revoke these automatic grants" and publishes the statements to opt in now ([securing your API](https://supabase.com/docs/guides/api/securing-your-api), [changelog](https://github.com/orgs/supabase/discussions/45329)) [F].

**Timeouts.** `anon` defaults to 3 s and `authenticated` to 8 s, and a function can set its own ([timeouts](https://supabase.com/docs/guides/database/postgres/timeouts)) [F].

**RLS.** Enable it on every exposed table. Supabase measured large gains from indexing policy columns, wrapping `(select auth.uid())`, naming roles with `TO` and adding filters ([RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)) [F]. Our tables can simply grant `anon` nothing and sit in a `private` schema the API cannot reach (*our read*).

**Rate limiting.** The documented pattern is a `pgrst.db_pre_request` function that counts writes per client IP in a `private` table and raises an HTTP error past a threshold (the example allows 100 per 5 minutes). It cannot limit GET or HEAD and does not cover Realtime ([securing your API](https://supabase.com/docs/guides/api/securing-your-api)) [F]. Supabase Cron can prune the log; keep to 8 concurrent jobs of under 10 minutes each ([cron](https://supabase.com/docs/guides/cron)) [F].

**Leaderboards** [K, high]. Keep one row per player per board, indexed on `(board_id, score desc, total_ms asc)`. Page the top N with `rank()` and compute "my rank" as a count of better rows ([window functions](https://www.postgresql.org/docs/17/functions-window.html)). `now()` returns the transaction start, fine for stamping one RPC call ([date/time functions](https://www.postgresql.org/docs/17/functions-datetime.html)).

### 6. Realtime for live rooms

Free plan limits ([limits](https://supabase.com/docs/guides/realtime/limits), [pricing](https://supabase.com/docs/guides/realtime/pricing)) [F]:

| Free plan | Limit |
|---|---|
| Concurrent connections | 200 |
| Messages per second | 100 |
| Channel joins per second | 100 |
| Presence messages per second | 20 |
| Broadcast payload | 256 KB |
| Messages per month | 2 million |

Going over the rate disconnects clients until throughput drops. A broadcast bills as one message sent plus one per receiver, a database change as one per listener ([message usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)) [F]. From load generators inside AWS, client Broadcast measured a 6 ms median (p99 213 ms) and database-triggered Broadcast 46 ms (p99 159 ms) ([benchmarks](https://supabase.com/docs/guides/realtime/benchmarks)) [F].

- **Postgres Changes** runs one access check per subscriber per change on a single thread, so compute upgrades barely help ([Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)) [F]. Its upside for us: clients cannot forge it.
- **Presence** is "not designed for high-frequency updates" ([Presence](https://supabase.com/docs/guides/realtime/presence)) [F].
- **Database Broadcast** (`realtime.send(payload, event, topic, private)`) defaults to private, and its flag must match the client channel. Messages stay in `realtime.messages` for three days, and replay works on private channels only ([Broadcast](https://supabase.com/docs/guides/realtime/broadcast)). The feature is still public beta, unlike plain Broadcast ([features](https://supabase.com/docs/guides/getting-started/features)) [F].
- **Private channels** check RLS on `realtime.messages` against the user's JWT ([authorization](https://supabase.com/docs/guides/realtime/authorization)) [F]. With no per-player JWT, anyone who knows a public topic can listen and send (*our read*).

The installed `realtime-js` 2.118.0 has a `worker` option that runs heartbeats (default 25 s) in a Web Worker built from a Blob URL, plus `disconnectOnEmptyChannelsAfterMs` to close idle sockets [F].

*Our calculation:* one event to a 50-player room is 51 messages, half the per-second cap. Polling every 3 s from 200 players with 1.5 KB responses moves about 360 MB an hour, so 14 busy hours would drain the 5 GB uncached allowance.

### 7. Anti-cheat for trivia

The failures are documented. Researchers showed HQ Trivia question data reaching cheaters ([HackerNoon](https://www.hackernoon.com/how-we-hacked-hq-trivia-loco-brainbaazi-and-how-they-can-prevent-it-5e40c97179ec)), and a public npm library let anyone join a Kahoot PIN and auto-answer until February 2021 ([kahoot.js](https://github.com/theusaf/kahoot.js-updated)) [R]. The original Wordle shipped every answer in its JavaScript [K].

The standard defenses [K, medium-high]: keep ranked answers server-side until each answer locks, issue questions one at a time from a server attempt record, score from server timestamps, make submissions idempotent, and flag implausible patterns for review instead of banning on one signal. Latency fairness is the subtle part. Our database sits in us-east-1 (project metadata) [F]. A player in Asia therefore carries roughly 150 to 250 ms more round trip than one in Virginia [K], and Kahoot-style speed scoring turns that gap into points (*our read*).

### 8. PWA and offline

- Install needs a manifest and HTTPS, and `beforeinstallprompt` fails on iOS Safari. iOS web push needs a home-screen install on 16.4+, and the guide serves `sw.js` with `no-cache` ([PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps)) [F].
- `experimental.useOffline` (new in 16.x) polls with HEAD requests on a 500 ms to 3 s backoff and retries pending navigations and Server Actions on reconnect. It caches nothing, so a cold offline start still needs a worker ([offline support](https://nextjs.org/docs/app/guides/offline-support), [config](https://nextjs.org/docs/app/api-reference/config/next-config-js/useOffline)) [F].
- Serwist 9.5.13 (October 2026) is the tool Next names, and 10.0 is still a preview ([npm](https://www.npmjs.com/package/@serwist/turbopack)) [F]. In the unpacked packages [F]:
  - `@serwist/next` is a webpack plugin that warns under Turbopack, so Next 16 would fail our build with it (*our read*).
  - `@serwist/turbopack` serves the worker from a Route Handler exporting `dynamic: "force-static"`, a version its source says "is for when NOT using `cacheComponents`."
  - Configurator mode builds the worker with `@serwist/cli` after `next build`, and Serwist lists it as Turbopack-ready ([issue 54](https://github.com/serwist/serwist/issues/54)).
- `next-pwa` last shipped in August 2022 ([npm](https://www.npmjs.com/package/next-pwa)) [F].
- WebKit caps script-writable storage at seven days without interaction for sites not on the Home Screen ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)) [K, medium-high]. A lapsed iPhone player's guest id can simply vanish.

### 9. Core Web Vitals

web-vitals 6.2.3 (October 2026) keeps "good" at 2,500 ms for LCP and 200 ms for INP, with CLS at 0.1 ([web-vitals](https://github.com/GoogleChrome/web-vitals)) [F]. LCP and INP now work in Safari and Firefox while CLS stays Chromium-only, and Chromium 151+ can report per soft navigation with `reportSoftNavs: true` [F]. Next's `useReportWebVitals` exposes TTFB, FCP, LCP, CLS and INP for first-party reporting ([analytics](https://nextjs.org/docs/app/guides/analytics)) [F], and React 19.2's `<ViewTransition>` simply skips the animation where unsupported ([view transitions](https://nextjs.org/docs/app/guides/view-transitions)) [F].

### 10. Analytics and error monitoring

- **First-party:** `onRequestError` in `instrumentation.ts` catches server errors, and `instrumentation-client.ts` runs before hydration with a dev warning past 16 ms ([instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation), [client](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client)) [F].
- **Vercel Web Analytics** 2.0.1 skips development and offers `beforeSend` to rewrite or drop events [F]. It is cookieless, with Hobby quotas we could not check [K, medium].
- **PostHog:** `cookieless_mode: 'always'` uses no cookies or browser storage, but "you MUST enable cookieless mode in your PostHog project's settings" or events are ignored ([types](https://www.npmjs.com/package/@posthog/types)) [F]. The free tier has been about 1 million events a month [K, medium].
- **Plausible:** the tracker (0.4.7) is cookieless with an `endpoint` option for first-party proxying ([tracker](https://www.npmjs.com/package/@plausible-analytics/tracker)) [F]; hosted plans are paid [K].
- **Sentry:** 11.10.0 supports `next ^16`, and `tunnelRoute` sends events through our own domain past ad blockers ([package](https://www.npmjs.com/package/@sentry/nextjs)) [F]. The free tier has been about 5,000 errors a month [K, medium].

### 11. Free-tier limits that could bite a launch

Supabase Free [F]: a pause after a week of low activity, restorable for 90 days ([pausing](https://supabase.com/docs/guides/platform/free-project-pausing)); read-only mode past 500 MB, from a 40 to 60 MB start ([database size](https://supabase.com/docs/guides/platform/database-size)); 10 GB of bandwidth (5 GB cached plus 5 GB uncached) ([egress](https://supabase.com/docs/guides/storage/serving/bandwidth)); Nano compute with shared CPU, 0.5 GB RAM, 60 direct connections and 200 pooler clients ([compute](https://supabase.com/docs/guides/platform/compute-and-disk)); and no automatic backups, so free projects should run `supabase db dump` ([backups](https://supabase.com/docs/guides/platform/backups)). Our project runs Postgres 17.11 in us-east-1 under a `vercel_icfg_...` org slug, which suggests Vercel's Marketplace created it (*our read*).

Vercel Hobby [K, medium; verify at [limits](https://vercel.com/docs/limits) and [fair use](https://vercel.com/docs/limits/fair-use-guidelines)]: non-commercial personal use only [K, high]; roughly 100 GB transfer, 1 million edge requests, 1 million function invocations and 4 hours of active CPU a month, paused rather than billed when exceeded; no [Skew Protection](https://vercel.com/docs/skew-protection); short log retention [K, low].

## Implications for our product

1. **Browser-to-RPC gameplay.** `GameBackend` calls Supabase RPCs directly, and each write carries an idempotency key (attempt id plus question index) backed by a unique constraint, so double taps and retries are harmless.
2. **Security baseline in migration one.** Run Supabase's `alter default privileges ... revoke` statements. Tables go in `private` with no grants. RPCs go in `public` (exposed schemas are a dashboard setting we may not control) as `security definer set search_path = ''` functions. Each is revoked from `public, anon`, then granted to `anon` on purpose. Call pgcrypto as `extensions.digest(...)` [K]. A CI SQL test fails on any `anon`-executable function outside an allowlist.
3. **SHA-256 for guest secrets, not bcrypt.** A 256-bit random secret has nothing to brute-force, so a fast hash spares Nano's CPU on every call [K, high].
4. **Fight storage loss on iPhones.** Offer the sync code once a player has something to lose (a 2-day streak or a saved quiz) and call `navigator.storage.persist()`. Returning Safari players also get an Add to Home Screen pitch.
5. **Two rate-limit layers.** `db_pre_request` caps writes per IP (start near 300 per 5 minutes, since schools share IPs). Sensitive RPCs cap per player or IP, for example 5 new identities per IP per hour. Cron prunes the counters hourly.
6. **Ranked and daily flow.** `start_attempt` stores a shuffled option order and returns question 1 without its answer. `submit_answer` stamps `now()` and rejects anything past the deadline plus 500 ms. It returns the verdict with the correct option, then the next question. Give full points inside the first 40% of the timer and step down to half after that, so 150 ms of latency rarely changes a score. Flag implausibly fast runs for review. Daily windows follow report 06.
7. **Indexed leaderboard tables.** `private.board_entries` keyed on `(board_id, player_id)`, upserted with `greatest()`, pruned after 30 days, with each read under about 200 ms. Serve "today's top 50" from a cached `GET` Route Handler so Vercel's bandwidth carries it (*our read*; it must tolerate an unreachable database at build time).
8. **Live rooms on Free.** Phase RPCs call `realtime.send(..., false)` on `room:<128-bit id>`, never the join code. Payloads carry room id, version, phase and deadline only, and clients refetch by RPC when the version moves. Poll every 3 s only while the channel is down or a phase is over a second late, every 15 s otherwise. Track members with join and heartbeat RPCs instead of Presence. Cap rooms at 20 players and call `removeChannel` on leave. Set `worker: true` so background tabs keep their heartbeat, which needs CSP `worker-src 'self' blob:`. If database broadcast misbehaves under k6, switch to Postgres Changes on a tiny signals table.
9. **Cache Components hygiene.** No `proxy.ts` and no segment config exports. The client sends its local date for dailies and the RPC validates it. Quiz state is keyed by attempt id and saved after every answer, so an `<Activity>` re-show or a skew reload resumes mid-quiz. Timers derive from the server deadline.
10. **Stateless share pages.** `/r/[code]` encodes mode, date, score and grid. Metadata and the OG image come from `params` alone (Node runtime, one subset TTF, under 500 KB), so previews survive a paused database.
11. **A Serwist spike in week one.** Try `next build && serwist build` on a Vercel preview, precaching the shell and casual packs and never caching ranked RPCs. Activate updates from the results screen, never mid-question. The fallback is a small hand-written worker plus a script that lists `.next/static`.
12. **Casual packs on Vercel's CDN.** Hashed static JSON per category keeps Supabase egress for live play.
13. **Zero third parties at launch.** Sampled vitals and about a dozen events batch into a rate-limited `log_events` RPC, which `onRequestError` and `window.onerror` share; raw rows drop after 30 days. Add Vercel Web Analytics if the Hobby quota fits, and PostHog or Sentry only when SQL stops being enough.
14. **Guardrails and upgrade triggers.** A daily GitHub Actions keepalive and, given a connection string, a nightly dump. Alerts at 300 MB of data, 3 GB of monthly egress, 1 million realtime messages and 120 peak connections. Vercel Pro the day ads or payments ship; Supabase Pro when an alert fires twice in a month.
15. **INP on the answer tap.** Paint the selection in the same frame and defer scoring and confetti with `startTransition`. Handlers stay under 50 ms on a throttled mid-range Android profile.

## Anti-patterns to avoid

- Sending ranked or daily answers before lock-in, or trusting client clocks.
- Treating Realtime messages on public topics as truth.
- `security definer` functions left with the default `EXECUTE` grant or without `search_path = ''`.
- Room state through Postgres Changes at scale, or rosters through Presence.
- Webpack-only PWA plugins under Turbopack, or `runtime = 'edge'` and `dynamic` exports pasted from old examples.
- Picking "today" at build time, or calling `Math.random()` in prerendered code.
- A site-wide "players online" subscription that pins one of 200 connections per idle visitor.
- Fixed 3-second polling for everyone.
- bcrypt on every RPC for a random secret.
- Trusting `localStorage` on iOS Safari for players who never installed the app.
- Ads or payments on Vercel Hobby.

## Open questions

1. Can the owner provide a database connection string (as a GitHub secret) for nightly dumps, and which variables did the Vercel Marketplace integration inject?
2. Does Serwist configurator mode build cleanly on Vercel with Turbopack and Cache Components?
3. Is the 100 messages a second cap enforced per exact second or on average (report 06 asks too)?
4. How reliable is beta database broadcast on public channels, and what latency do European and Asian phones see from us-east-1?
5. What are Hobby's current quotas for Web Analytics, Speed Insights, log retention and image transformations?
6. Will we monetize at launch? That decides Vercel Pro from day one.
7. The `realtime-js` types mention a long-poll fallback. Does it work against hosted Supabase where WebSockets are blocked?
8. Does Safari's `navigator.storage.persist()` lift the seven-day cap for non-installed sites? [K, low]

## Sources

- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- https://nextjs.org/docs/app/getting-started/caching
- https://nextjs.org/docs/app/api-reference/directives/use-cache
- https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents
- https://nextjs.org/docs/app/guides/migrating-to-cache-components
- https://nextjs.org/docs/app/guides/streaming
- https://nextjs.org/docs/app/guides/data-security
- https://nextjs.org/docs/app/guides/server-actions
- https://nextjs.org/docs/app/guides/self-hosting
- https://nextjs.org/docs/app/getting-started/route-handlers
- https://nextjs.org/docs/app/api-reference/functions/after
- https://nextjs.org/docs/app/api-reference/functions/image-response
- https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
- https://nextjs.org/docs/app/guides/progressive-web-apps
- https://nextjs.org/docs/app/guides/offline-support
- https://nextjs.org/docs/app/api-reference/config/next-config-js/useOffline
- https://nextjs.org/docs/app/guides/analytics
- https://nextjs.org/docs/app/guides/view-transitions
- https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
- https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/api/securing-your-api
- https://github.com/orgs/supabase/discussions/45329
- https://supabase.com/docs/guides/database/postgres/timeouts
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/cron
- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/docs/guides/realtime/pricing
- https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages
- https://supabase.com/docs/guides/realtime/benchmarks
- https://supabase.com/docs/guides/realtime/postgres-changes
- https://supabase.com/docs/guides/realtime/presence
- https://supabase.com/docs/guides/realtime/broadcast
- https://supabase.com/docs/guides/realtime/authorization
- https://supabase.com/docs/guides/getting-started/features
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/docs/guides/platform/database-size
- https://supabase.com/docs/guides/storage/serving/bandwidth
- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/docs/guides/platform/backups
- https://github.com/supabase/supabase-js (realtime-js 2.118.0, read from node_modules)
- https://www.postgresql.org/docs/17/functions-window.html
- https://www.postgresql.org/docs/17/functions-datetime.html
- https://www.npmjs.com/package/@serwist/turbopack
- https://github.com/serwist/serwist/issues/54
- https://www.npmjs.com/package/next-pwa
- https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- https://github.com/GoogleChrome/web-vitals
- https://www.npmjs.com/package/@vercel/analytics
- https://www.npmjs.com/package/@posthog/types
- https://www.npmjs.com/package/@plausible-analytics/tracker
- https://www.npmjs.com/package/@sentry/nextjs
- https://www.hackernoon.com/how-we-hacked-hq-trivia-loco-brainbaazi-and-how-they-can-prevent-it-5e40c97179ec
- https://github.com/theusaf/kahoot.js-updated
- https://vercel.com/docs/limits
- https://vercel.com/docs/limits/fair-use-guidelines
- https://vercel.com/docs/skew-protection
