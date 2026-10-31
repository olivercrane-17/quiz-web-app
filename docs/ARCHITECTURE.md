# [Name]: Architecture, v1

| | |
|---|---|
| Status | Approved for build. Binding for structure, contracts, schema and the order of work |
| Owner | Principal engineer |
| Date | 31 October 2026 |
| Inputs | [00-PROJECT-BRIEF.md](./00-PROJECT-BRIEF.md), [01-ENGINEERING-CONSTRAINTS.md](./01-ENGINEERING-CONSTRAINTS.md), [02-PRODUCT-DECISIONS.md](./02-PRODUCT-DECISIONS.md) (binding), [PRD.md](./PRD.md), [research/SYNTHESIS.md](./research/SYNTHESIS.md), [research/08-technical-best-practices.md](./research/08-technical-best-practices.md), the foundation code on branch `claude/sleepy-hamilton-p0f789` |
| Companion docs | PRD.md (behavior), DESIGN.md (visual system, glyphs), CONTENT_GUIDE.md (writing and checking rules) |

## How to read this document

**Precedence.** The decisions memo and the PRD decide what the product does. This document decides how it is built: module boundaries, contracts, the database, the RPCs and the order of work. If this document contradicts the PRD on behavior, the PRD wins and this document is corrected in the same pull request. Section 1.4 lists every place where we interpreted or adjusted a PRD rule for technical reasons. Each one is flagged for the PM.

**Verified facts.** Items marked [verified] were checked on 31 October 2026 against the installed packages (Next 16.4.3, React 19.3.1, `@supabase/supabase-js` 2.118.0, Node 22.23.4) or against the live Supabase project through MCP. Everything else is design.

**Names are contracts.** The identifiers, file paths, table names and RPC names below are the ones to use. Renaming one means changing this document first.

**Tickets.** Section 12 is the build plan. Each ticket names the files it owns. A developer agent edits only the files its ticket owns, plus the touch points the ticket lists.

### Contents

1. System overview
2. Folder structure and module boundaries
3. Domain types
4. The game engine
5. Content pipeline
6. Client persistence
7. The backend interface
8. Supabase design
9. Identity details
10. Rendering, routing, PWA, security and performance
11. Testing strategy
12. Work breakdown

---

## 1. System overview

### 1.1 The shape of the system

```text
                          Browser (phone, laptop, TV)
 +---------------------------------------------------------------------------+
 |  Next.js 16 pages: prerendered shells plus small client islands            |
 |    src/app (thin route files) --> src/features/* (screens, controllers)    |
 |                                        |                    |              |
 |                          src/engine (pure TypeScript)   src/platform       |
 |                          round plugins, run machine,    storage, identity, |
 |                          scoring, streaks, share,       clock, network,    |
 |                          practice selection             outbox, sound      |
 |                                        |                                   |
 |                    src/backend: GameBackend (one interface)                |
 |         +-------------------+---------------------+------------------+     |
 |         | supabase          | mock                | off              |     |
 |         | supabase-js RPC,  | in-page server:     | every online     |     |
 |         | Realtime hints,   | localStorage, Web   | call resolves    |     |
 |         | polling fallback  | Locks, Broadcast-   | "unavailable"    |     |
 |         |                   | Channel, scripts    |                  |     |
 |         +---------+---------+---------------------+------------------+     |
 |  Service worker: shells, JS chunks, practice packs. Never RPCs or /api/*.  |
 +------------|-----------------------------------------------^--------------+
              | HTTPS POST /rest/v1/rpc/<fn>                  | WSS topic room:<id>
              v                                               | (hints only)
 +----------------------------------------------------------------------------+
 |  Supabase, free plan: Postgres 17.11 in us-east-1 [verified]                |
 |    public  : SECURITY DEFINER RPCs only, search_path = '', EXECUTE to anon  |
 |    private : every table, RLS enabled, no grants                            |
 |    pg_cron : heartbeat, incident detection, publishing, pruning, rollups    |
 |    realtime.send(): room hints {room, phase, version, deadline}             |
 +----------------------------------------------------------------------------+

 +----------------------------------------------------------------------------+
 |  Vercel, Hobby: static shells, /_next/static/*, /content/* (packs, lists),  |
 |  /sw.js, /api/identity and /api/restore (cookie only, never Supabase),      |
 |  /s/[number]/[code] landing and its opengraph-image (stateless, no DB)      |
 +----------------------------------------------------------------------------+

 Build time:  content/  --zod--> scripts/content/build.ts --> public/content/*.json
                                                          --> src/content/generated/*.ts
              content/sealed/ (encrypted) --> scripts/content/release.ts --> SQL loaded
              into private.* through MCP. Sealed answers never enter a client bundle.
```

Four ideas carry the design.

1. **The page is static and the data is client-side.** Every route ships as a prerendered shell. Personal data (streaks, the Daily attempt, Groups) loads in client islands through `GameBackend`. Nothing renders per request from Supabase, so a paused or slow database never breaks a page, and the CDN serves almost everything.
2. **Postgres is the referee.** Sealed modes (the Daily, the archive, challenges, packs, shared quizzes, rooms) are judged inside SECURITY DEFINER functions with server timestamps. The client only ever sees the next clue or the verdict it has earned.
3. **The engine is shared, pure TypeScript.** Practice judges answers on the device with the same round plugins that the mock backend uses to emulate the server. SQL implements the sealed rules a second time, and shared fixture tables keep both copies in agreement.
4. **Free-tier limits are design inputs.** Realtime only for rooms, packs on the CDN, packed attempt rows, and a database that pauses without breaking any page (§8.1).

### 1.2 How requests travel

**A practice answer (works offline).**

1. The player presses option B. `pointerdown` paints the pressed state; `click` commits (§3.0.3 of the PRD).
2. The practice controller dispatches `{ type: 'intent' }` to the engine's run reducer, which moves the run to `judging` and emits a `judge` command.
3. The controller runs the `choice` plugin's judge half against the item from the cached pack and dispatches the verdict.
4. The reducer applies it, the round resolves, the reveal renders, and the first attempt goes into the calibration outbox, which uploads later through `log_practice_answers`.

**A Daily guess (sealed).**

1. The player types "Ca". The suggestion engine matches against the cached answer list on the device. Nothing is sent per keystroke.
2. The player picks "Canada" and taps Guess. The Daily controller dispatches the intent with a fresh idempotency key. The reducer enters `judging` and emits `judge`.
3. `backend.sealed.act()` posts `rpc/round_action`. Postgres locks the attempt row, checks the step, validates the entity against `private.answer_entities`, judges it, stamps the server time, and returns either the next clue or the reveal, plus `server_time`.
4. The backend corrects the display clock from `server_time`, the reducer applies the verdict, and focus moves to the new clue's heading.

**A room phase change (Beta).**

1. The host taps Reveal. `rpc/room_host_action` updates the room row, bumps `version` and calls `realtime.send()` with a hint. The hint leaves only after the transaction commits.
2. Each phone receives `{ room, phase, version, deadline }` on topic `room:<id>`. If `version` is newer than what it holds, it calls `rpc/room_player_state` and renders the result.
3. If the channel is down, or the phase is more than 1 s overdue, the phone polls every 3 s. Otherwise it polls every 15 s as a safety net.

**A returning player whose storage was wiped.**

1. The page finds no `qz:identity` and calls `GET /api/restore` on our own origin.
2. The route handler reads the `HttpOnly` backup cookie and returns the player id and secret, without contacting Supabase.
3. The client stores them and the next `get_streak` call shows the same streak as before (§9.1, AC-STK-02).

### 1.3 Key decisions and trade-offs

| # | Decision | Alternatives considered | Why | The cost we accept |
|---|---|---|---|---|
| D1 | Every route is a prerendered shell with client islands; no request-time rendering of game data | Server rendering with the cookie-aware Supabase client | Cache Components prerenders shells, the CDN serves them, offline shells come for free, and a paused database cannot break a page | Data screens show skeletons on first load; personalization is always client-side |
| D2 | Gameplay calls Supabase RPCs from the browser | Server Actions; route handlers that proxy to Supabase | Server Actions are dispatched one at a time and break across deploys ("Failed to find Server Action") ([Next.js](https://nextjs.org/docs/app/guides/server-actions)); a proxy adds a hop and holds no secret anyway | The RPC surface is public, so every function validates input and rate-limits |
| D3 | All authority in Postgres: tables in `private`, logic in `public` SECURITY DEFINER functions with `set search_path = ''` | RLS policies on exposed tables; Edge Functions | Without Supabase Auth there is no JWT for RLS to key on; one validation point per action; Edge Functions are untestable from the sandbox (constraints) | A large plpgsql surface, tested through MCP and from GitHub Actions only |
| D4 | One `GameBackend` interface with `supabase`, `mock` and `off` implementations chosen at build time | Mocking at the network layer | Hermetic E2E and offline development (constraint 2) | Every feature implements its mock behavior; contract tests run the same suite against the mock locally and the real project in CI |
| D5 | A pure engine shared by practice, the mock server and the SQL parity fixtures | Separate client and test logic | One set of rules, tested once, with JSON fixture tables that SQL tests replay | Two implementations of sealed rules (TypeScript and SQL) that must stay in step |
| D6 | Round-type plugins with a client half (no key) and a judge half (needs the key) | One component per mode | The same plugin serves sealed and unsealed play; the mock server uses the judge half; Daily composition becomes data | A slightly abstract plugin contract (§4.4) |
| D7 | A round's first clue or stem is issued only when the player taps Continue (`begin_round`) | Sending it with the previous verdict | Reading the reveal never counts as round time, and a lookup on the next clue happens inside an active round, where honest-play flags can see it | One round trip before the next clue appears (layout renders at once; see §1.4 item 2) |
| D8 | Guest identity: random player id plus a 256-bit secret, stored as SHA-256 in a credentials table | bcrypt; Supabase anonymous sign-ins | Auth settings are out of reach; a random 256-bit secret has nothing to brute-force, so a fast hash spares the shared CPU ([report 08](./research/08-technical-best-practices.md)) | A stolen secret is a stolen profile; sync codes and claims widen the surface, so each is rate-limited |
| D9 | A first-party `HttpOnly` backup cookie set by our own route handler, which never calls Supabase | Script-set cookies; IndexedDB only | WebKit deletes script-written storage after about 30 days of use without a tap, but server-set cookies survive ([gap 2](./research/gap-2-web-retention-and-identity.md)) | One functional cookie, disclosed on `/privacy` |
| D10 | Sealed content is encrypted at rest in the repo (AES-256-GCM) and loaded into Postgres from the sandbox through MCP | Plaintext in the repo; content kept only in the database | The repository is public, so plaintext would publish every future answer; database-only content breaks "reproducible from the repo" (memo §10) | A content key to look after (owner checklist) and opaque diffs for sealed files |
| D11 | Content is code: JSON sources validated by zod in a build script; generated packs and modules are committed and drift-checked in CI | A CMS; generating at build time on Vercel | Reviewable, reproducible, no runtime dependency | Content edits need `npm run content:build` before commit |
| D12 | Practice packs and answer lists are hashed static JSON on Vercel's CDN, precached by the service worker | Serving them from Supabase | Offline play; Supabase egress stays for live play | Pack updates ship with deploys |
| D13 | Realtime is used only by rooms, as database broadcast hints plus polling; Groups and challenges never open a socket | Postgres Changes for everything; Presence | Free plan: 200 connections, 100 messages a second, 2M a month ([Supabase](https://supabase.com/docs/guides/realtime/limits)) | Rooms need a polling fallback and careful message budgets |
| D14 | The mock backend runs inside the page and shares state across tabs through localStorage, Web Locks and BroadcastChannel | An HTTP mock server in Next route handlers | No extra process, identical in dev and CI, deterministic, works offline | Multi-device tests use several pages in one browser context (§11.4); true multi-context tests run against Supabase in CI |
| D15 | Service worker built with Serwist in configurator mode after `next build`, with a hand-written fallback | `@serwist/next`, `@serwist/turbopack`, `next-pwa` | The webpack plugin fails under Turbopack and the Turbopack helper exports `dynamic = 'force-static'`, which Cache Components rejects ([report 08](./research/08-technical-best-practices.md)); `@serwist/cli` 9.5.13 bundles with esbuild [verified] | One post-build step and a spike to confirm it on a Vercel preview |
| D16 | Content Security Policy without nonces | Nonces through `proxy.ts` | Nonces force every page to render per request, which switches off prerendering (Next's CSP guide) | `script-src 'unsafe-inline'`, offset by zero third-party scripts and no HTML injection paths |
| D17 | Test identities use a reserved player-id prefix and play an `e2e` content track | A secret test key | The real-backend CI job must never touch real statistics or show real sealed content in public CI artifacts, and agents cannot add secrets | Anyone can make themselves a test player, which only sandboxes them (§8.17) |
| D18 | The server decides local dates and scoring times; the client's display clock is corrected from `server_time` on every response | Trusting the device clock | Constraint 6 | Each RPC returns a timestamp |
| D19 | Feature flags are build-time (`NEXT_PUBLIC_FEATURES`) and mirrored in `private.config` for Beta RPCs | Runtime flag service | Static pages can call `notFound()` at build time; no extra request | Flipping a flag needs a redeploy |

### 1.4 Interpretations and adjustments (flagged for the PM)

| # | PRD reference | What this architecture does | Why |
|---|---|---|---|
| 1 | Silent on where sealed sources live | Sealed sources are encrypted in `content/sealed/`; plaintext exists only in a git-ignored workspace | The repository is public |
| 2 | §8.1 "Continue to the next stem under 100 ms (the next round's first payload arrives with the previous verdict, or is prefetched during the reveal)" | For sealed rounds the next round's layout (label, category chip, answer type, list preload) rides with the verdict and renders in under 100 ms; the clue or stem text arrives one round trip later via `begin_round`. Practice meets the 100 ms rule fully | With PRD §4.3.3's latency rule, a clue issued during the reveal would charge reading time to the player, and it would let a player look up the next clue outside an active round |
| 3 | AC-ROM-01 "1 host and 5 phone contexts" | Mock-backend room tests use six pages in one browser context, each with its own device namespace. Separate contexts are used in the real-backend job (AC-ROM-11) | BroadcastChannel and localStorage do not cross browser contexts |
| 4 | §8.4 "a general cap of 300 writes per IP per 5 minutes runs before every request" | The cap counts write RPCs only; room RPCs and `log_events` are exempt and carry their own per-seat and per-identity caps | A 20-phone party behind one router sends about 1,200 heartbeats in 5 minutes |
| 5 | §3.13.2 report notes | Notes are stored with links stripped and never shown to anyone but the owner, so they skip the slur filter | The filter exists for text shown to others |
| 6 | §8.4 headers | `Referrer-Policy` changes from the foundation's `strict-origin-when-cross-origin` to `no-referrer` | The PRD asks for it |
| 7 | AC-CKE-04 "No other cookie is ever set" | The browser Supabase client switches from `@supabase/ssr` to `@supabase/supabase-js` with session persistence off | No auth storage can ever be written |
| 8 | §3.5.1 share link `/s/{number}/{code}` | The code's first character names the composition layout and the rest is a mixed-radix payload (§4.10). Codes are not secret, so anyone can forge a result; the landing says "Someone scored", so nothing is claimed | Stateless landings must decode the grid from the URL alone |
| 9 | §3.1.7 home card | The card computes "Daily #42 · Sunday 1 November" from `DAILY_EPOCH` and the device's local date with no network; status (in progress, finished) loads only when an identity exists | One-tap play with zero blocking requests (G4) |
| 10 | Practice deep links | A run request travels in session storage (`qz:practice-intent`), never in a query string | Generated links stay path-only |
| 11 | §3.1.3 "Tapping Play calls start_daily" | `/daily` starts (or resumes) today's attempt when it mounts; Play links to `/daily` and warms the backend on press | Deep links and Back behave the same as the Play button |
| 12 | §3.10.2 restore | The device sends a freshly minted secret with `redeem_sync_code` and `redeem_claim`; the server never returns a secret | Secrets only ever travel from client to server |
| 13 | M1 scope (engine §4 complete) | Wave 1 delivers the playable greybox; Wave 2 completes the engine (streaks, ranking, room scoring) before the M1 exit review | Wave 1 must be playable for persona playtests; streak math is not needed to play |
| 14 | Brief: "SQL seed migrations for sealed pools" | Sealed seed SQL is generated at release time from the encrypted sources and applied through MCP, recorded in `private.content_releases` with its hash, instead of living as committed migration files. Schema stays in committed migrations; non-secret data (answer lists, terms, the e2e track) is committed under `supabase/seed/` | Committed SQL would publish every answer, the same leak as item 1 |

### 1.5 Measured facts the plan relies on

| Fact | Source |
|---|---|
| The foundation's empty home route already ships **135.4 kB** of gzipped first-load JavaScript (React DOM about 72 kB, the App Router runtime about 50 kB, small runtime chunks). Only about **14.6 kB** of the 150 kB budget is left for our code on `/` | `npm run check:bundle` on the existing `.next` build [verified] |
| The Supabase project is empty: no tables, no migrations. `pgcrypto` is installed in schema `extensions`; `pg_cron`, `pgtap` and `unaccent` are available but not installed; `realtime.send(payload jsonb, event text, topic text, private boolean)` exists and `postgres` may execute it | MCP `list_tables`, `list_migrations`, `list_extensions`, `execute_sql` [verified] |
| Role settings: `anon` has `statement_timeout = 3s`; `authenticator` 8 s. MCP SQL runs as `postgres`, which is not a superuser | MCP `execute_sql` [verified] |
| `pg_timezone_names` lists 598 zones | MCP [verified] |
| Node 22.23.4 runs `.ts` files directly (type stripping), so content and SQL scripts need no build step | Shell [verified] |
| `useParams()` suspends during prerender for params not covered by `generateStaticParams`; `usePathname()` in a shared layout suspends while any route below it has unknown params | `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-params.md`, migrating-to-cache-components guide [verified] |
| Without `experimental.useOffline`, a failed RSC fetch logs `console.error("Failed to fetch RSC payload ... Falling back to browser navigation.")` and does a full navigation | `next/dist/client/components/router-reducer/fetch-server-response.js` [verified] |
| `next start` reads `public/` when the server starts, so a worker written after `next build` is served | `next/dist/server/lib/router-utils/filesystem.js` [verified] |
| `htmlLimitedBots` defaults include WhatsApp, facebookexternalhit, Twitterbot (which matches Telegram's "like TwitterBot" agent), Slackbot and Discordbot; setting the option replaces the list | `next/dist/shared/lib/router/utils/html-bots.js` [verified] |
| `inapp-spy` 5.0.10 is MIT, has no dependencies and gzips to 3.6 kB | npm tarball [verified] |
| The project's `pg_default_acl` grants EXECUTE on new `postgres` functions in `public` to `anon`, `authenticated` and `service_role` per schema, with no global row, so PUBLIC keeps its built-in EXECUTE. Supabase's per-schema `revoke execute on functions from public` therefore changes nothing; the global form in §8.2 does | MCP `execute_sql` on `pg_default_acl`; local Postgres 16 dry run [verified] |
| The §8.2, §8.3 and §8.6 SQL, extracted from this document, runs cleanly on Postgres 16.15 with Supabase's roles stubbed: 53 tables, each with a primary key, every foreign key indexed except `player_days.attempt_id` | Local `psql` dry run with `ON_ERROR_STOP` [verified] |


---

## 2. Folder structure and module boundaries

### 2.1 The tree

```text
content/                              Authored content (§5). Plaintext, except sealed/.
  categories.json                     The 12 categories: id, slug, name, short name, order
  compositions.json                   Share layouts for each Daily composition (§4.10)
  practice/<category-slug>/<id>.json  Practice items, one file each (ships to clients)
  answer-lists/<type>.json            Closed answer lists with aliases and provenance
  sealed/                             AES-256-GCM envelopes: mysteries/, encores/, room-packs/,
                                      schedule/, spares/ (§5.4). Never plaintext in git.
  fixtures/                           Fake content for the mock backend, tests and the e2e track
  safety/slur-terms.txt, allowlist.txt
  names/adjectives.txt, animals.txt   Friendly-name parts ("Plucky Otter")
  category-pages/<slug>.json          Intro copy for /categories/[slug] (F-CAT)
  monthly-packs.json                  Month to tag filter and badge (F-PCK)
scripts/
  content/                            build.ts, check.ts, seal.ts, unseal.ts, release.ts
  sql/                                bundle-tests.ts, gen-parity.ts, drift-check.ts
  codegen/                            analytics-sql.ts, moderation-sql.ts
  checks/                             forbidden-imports.mjs, lazy-markers.mjs, secret-scan.mjs
  check-bundle-budget.mjs             (exists; extended by SEC-1)
supabase/
  migrations/                         Timestamped schema migrations (§8.16)
  seed/                               Committed, non-secret data loads (lists, dictionary, terms, e2e track)
  .generated/                         Git-ignored sealed release SQL
  tests/<area>/*.test.sql             SQL tests, each wrapped in begin ... rollback (§8.17)
  tests/generated/                    Parity tests generated from engine fixture tables
  README.md                           Conventions for migrations, releases and tests
public/
  content/packs/<category>.<hash>.json    Generated practice packs
  content/lists/<type>.<hash>.json        Generated answer lists
  icons/, sounds/
  sw.js                               Generated after next build (git-ignored)
src/
  app/                                Routes only. Page files re-export feature route modules.
    layout.tsx                        Root: <html>, boot script, fonts, skip link; no context providers
    globals.css                       Design tokens (DS-1)
    (tabs)/layout.tsx                 Header plus the four-tab bar
    (tabs)/page.tsx                   Today (home)
    (tabs)/practice/page.tsx, archive/, g/, g/new/, g/[groupId]/, g/[groupId]/settings/,
           me/, me/achievements/, me/sync/, settings/, challenges/, categories/[slug]/
    (play)/layout.tsx                 Focus mode: exit, progress, overflow; no tab bar
    (play)/daily/, daily/[number]/, daily/[number]/results/, practice/run/, practice/results/,
           practice/blitz/, practice/survival/, practice/review/, c/[code]/play/,
           q/[code]/play/, room/[roomId]/
    (landing)/layout.tsx              Minimal header for deep links
    (landing)/s/[number]/[code]/ (+ opengraph-image.tsx), c/[code]/, c/[code]/result/,
              j/[code]/, claim/[token]/, restore/, join/, join/[code]/, q/[code]/,
              q/[code]/result/
    (host)/layout.tsx                 Big-screen layout
    (host)/host/, host/[roomId]/
    (info)/layout.tsx                 Readable layout for legal and trust pages
    (info)/privacy/, terms/, content-policy/, credits/, accessibility/,
           how-scoring-works/, about-our-questions/
    (tabs)/create/, create/new/, create/[quizId]/, create/import/, create/help/import/  (Beta)
    api/identity/route.ts             POST, DELETE: backup cookie
    api/restore/route.ts              GET: backup cookie restore
    manifest.ts, robots.ts, sitemap.ts, not-found.tsx, offline/page.tsx, icon.svg
  features/<area>/                    Screens, controllers (model/), route modules (routes/),
                                      home slots, offer providers. One directory per area:
                                      shell, home, rounds, practice, daily, archive, streaks,
                                      stats, share, share-landing, challenges, groups, rooms,
                                      editor, identity, age, settings, reports, incidents,
                                      offers, analytics, pwa, install, reminder, categories,
                                      review, achievements, mastery, legal, nickname,
                                      celebration, shared-quiz
  engine/                             Pure TypeScript game engine (§4)
    types/                            Domain types (§3)
    rng.ts, clock.ts, time/
    rounds/                           Plugin registry plus choice/, mystery/, encore/, ordering/
    run/                              The run state machine
    scoring/, streaks/, practice/, suggest/, encore/, share/, rooms/, text/, quiz-lint/,
    quiz-import/, achievements/, mastery/, fixtures/
  backend/
    types.ts                          GameBackend and its sub-interfaces (§7.2)
    errors.ts                         Error codes and helpers
    index.ts                          getBackend(), prefetchBackend()
    off/                              The off implementation
    mock/                             index.ts, store.ts, controls.ts, context.ts,
                                      server/<area>.ts, fixtures.generated.ts
    supabase/                         index.ts, client.ts, rpc.ts, decode.ts, realtime.ts,
                                      <area>.ts adapters
    contract/                         One test suite per area, run against mock and real
  content/
    types.ts                          Re-exports content types from the engine
    loaders/                          practice.ts, answer-lists.ts, fixture-daily.ts, categories.ts
    schema/                           zod schemas, imported only by scripts and tests
    generated/                        Build output: manifest.ts, categories.ts, names.ts,
                                      moderation.ts (lazy), category-pages.ts
  platform/                           Browser adapters: storage/, identity/, clock.ts,
                                      server-clock.ts, network.ts, visibility.ts, broadcast.ts,
                                      outbox/, share.ts, sound/, haptics.ts, speech.ts,
                                      browser-context.ts, settings/
  ui/                                 Design-system primitives. No data, no backend.
  pwa/                                sw.ts (Serwist worker), sw-fallback.ts (hand-written fallback)
  assets/og/                          Subset TTF font for preview images
  analytics/dictionary.ts             Event names, properties and allowed values (§3.12)
  config/
    tunables.ts                       Every "(tunable)" number from the PRD
    shared.json                       Values the client and SQL must agree on (§5.3)
    features.ts                       Feature flag names and defaults
  lib/                                env.ts, env-parse.ts, metadata.ts, supabase/ (foundation, kept)
  test/                               Unit-test helpers
  instrumentation-client.ts           Error capture before hydration (ANA-1)
e2e/                                  Playwright specs on the mock backend
  support/                            fixtures.ts, mock.ts, devices.ts, clock.ts, axe.ts, network.ts
e2e-real/                             Playwright specs for the real-backend job (§11.7)
```

Route groups such as `(tabs)` and `(play)` change layouts, never URLs. `/practice` lives in `(tabs)` and `/practice/run` in `(play)`; Next allows the same segment name in two groups as long as no two pages resolve to one URL.

### 2.2 Layer rules

Each row says what a layer may import. Anything not listed is forbidden.

| Layer | May import | Must not import | Enforced by |
|---|---|---|---|
| `src/engine` | `src/engine` only, with relative `.ts` imports | React, Next, zod, `@/backend`, `@/platform`, `@/features`, `@/ui`, `@/lib`; DOM globals; `Date.now`, `Math.random`, `new Date()` with no argument | ESLint `no-restricted-imports`, `no-restricted-globals`, `no-restricted-properties`, `no-restricted-syntax` (PLT-1) |
| `src/content/schema` | zod, `src/engine/types` | Anything that runs in the browser | ESLint: only `scripts/**` and `*.test.ts` may import it |
| `src/content` (other) | engine types, `config` | React, features | ESLint |
| `src/backend` | engine, content, config, `@/lib/env`, `@/lib/supabase`, `@/platform/server-clock`, `@/platform/identity` (types) | features, ui, app | ESLint |
| `src/platform` | engine, config, `@/lib/env`, analytics types | features, ui, backend implementations | ESLint |
| `src/ui` | React, config | engine, backend, platform, features | ESLint |
| `src/features/<x>` | engine, `@/backend` (index and types only), content, platform, ui, analytics, config, and another feature only through its `index.ts` | another feature's internals, `@/backend/mock/**`, `@/backend/supabase/**` | ESLint path patterns |
| `src/app` | feature route modules (`@/features/*/routes/*`), ui, `@/lib/env` | engine, backend | ESLint |
| `src/pwa` | config, the generated content manifest | everything else (it runs inside the service worker) | ESLint |
| `scripts` | `src/engine`, `src/content/schema`, `src/config/shared.json`, Node built-ins | app, features, platform | Convention and review |

Files under `src/engine` and `src/content/schema` use relative imports with explicit `.ts` extensions and erasable TypeScript only (no `enum`, `namespace` or parameter properties). That lets Node 22 run them from `scripts/` without a build step [verified]. CORE-0 turns on `allowImportingTsExtensions`, `erasableSyntaxOnly` and `verbatimModuleSyntax` in `tsconfig.json`; `noEmit` is already on, so these are safe.

### 2.3 Extension points (so parallel tickets never edit the same file)

CORE-0 creates every file in this table, most of them as stubs with their final signatures. The owner named in the last column replaces the stub later. Nobody else edits these files.

| Extension point | File | Contract | Filled by |
|---|---|---|---|
| Engine round plugins | `src/engine/rounds/index.ts` imports `./choice/index.ts`, `./mystery/index.ts`, `./encore/index.ts`, `./ordering/index.ts` | Each exports one `RoundPlugin` (§4.4). The registry file never changes | PRA-1 (choice), MYS-1 (mystery, encore); ordering stays a stub that throws `unsupported_round_type` |
| Round UI components | `src/features/rounds/registry.tsx` imports `./choice`, `./mystery`, `./encore` | Each exports a component taking `RoundComponentProps` (§4.4.3) | PRA-1, MYS-1 |
| Reveal actions | `src/features/reports/reveal-actions.tsx` | `<RevealActions itemRef mode />`: heart toggle and "Report a problem" | RPT-1 |
| Share button | `src/features/share/share-button.tsx` | `<ShareButton payload surface />` | SHR-1 |
| Challenge button | `src/features/challenges/challenge-button.tsx` | `<ChallengeButton attemptId />`; renders nothing until CHL-1 | CHL-1 |
| Streak line and chip | `src/features/streaks/stop-screen-line.tsx`, `chip.tsx` | `<StreakLine summary />`, `<StreakChip />` | STK-1 |
| Home slots | `src/features/home/sections.tsx` imports one `home-slot.tsx` from each of daily, streaks, practice, review, challenges, groups, archive, rooms, editor | Each slot is a client island or `null` | The owning feature |
| Stop-screen offer cards | `src/features/offers/registry.ts` lists providers in PRD priority: claim, sync, install, calendar, group | `OfferProvider { id; isEligible(ctx): boolean; Card }` in each feature's `offers/<id>.tsx` | IDN-2 (claim, sync), CAL-1 (install, calendar), GRP-1 (group) |
| Practice hub cards and badges | `src/features/practice/modes.ts` imports `./blitz/card.tsx`, `./survival/card.tsx`, `@/features/review/card.tsx`, `./monthly-pack-card.tsx`; the category grid renders `@/features/mastery/badge.tsx` | Each renders `null` until built | BLZ-1, REV-1, CAT-1, MAS-1 (PRA-2 creates these stubs) |
| Settings sections | `src/features/settings/sections.ts` | One module per section | SET-1 creates every section, with stubs for `sections/sound.tsx` (filled by SND-1) and `sections/reminder.tsx` (filled by CAL-1) |
| Mock server areas | `src/backend/mock/index.ts` composes `server/<area>.ts` | Each area exports `create<Area>Area(ctx): <Area>Api` | The feature ticket for that area (§12) |
| Supabase adapters | `src/backend/supabase/index.ts` composes `<area>.ts` | Same shape as the mock areas | The SQL ticket for that area |
| Content loaders | `src/content/loaders/*.ts` | `loadPracticePack`, `loadAnswerList`, `loadFixtureDaily`, `getCategories` | PRA-1, MYS-1, DLY-1 for fixtures; CNT-1 switches them to generated modules |
| Analytics | `src/features/analytics/track.ts`, `regret-survey.tsx` | `track(name, props)` typed by the dictionary (a no-op queue until ANA-1); the survey slot on the stop screen | ANA-1 |
| Service health | `src/features/incidents/use-health.ts`, `banner.tsx` | `useServiceHealth(): ClientHealth` (returns `'ok'` until INC-1); the banner slot in the shell | INC-1 |
| Nickname field | `src/features/nickname/nickname-field.tsx` | Generated-name picker plus custom field with filter feedback | MOD-1 |
| Stats sections | `src/features/mastery/stats-section.tsx`, `src/features/achievements/summary.tsx` | Rendered by `/me` | MAS-1 |
| Safe points for updates | `src/features/pwa/safe-point.ts` | `useSafePoint()` called by Home, results and stop screens | PWA-1 |
| Sound and haptics | `src/platform/sound/index.ts`, `src/platform/haptics.ts` | `playEffect(id)`, `vibrate(pattern)`; no-ops until SND-1 | SND-1 |
| Settings store | `src/platform/settings/store.ts` | Typed settings with defaults (§6.2); UI-free | CORE-0 writes it in full; SET-1 adds the UI |

Shared files with a single owner per wave: `package.json` and the lockfile (PLT-1 adds every planned dependency in Wave 2; later only PWA-1 changes the `build` script), `next.config.ts` (untouched until SEC-1 in Wave 11; new public variables are pinned automatically because it reads `PUBLIC_ENV_NAMES`), `src/app/layout.tsx` and `globals.css` (DS-1), `eslint.config.mjs` and `playwright.config.ts` (PLT-1, then CI-1), `.github/workflows/ci.yml` (PLT-1; CNT-1 and SQL-3 add one step each; then CI-1). If a ticket truly needs a shared file it does not own, it records the change as a follow-up note in its pull request instead of editing the file.

### 2.4 Conventions

- **Ids.** Practice items `p.<cat>.<4 digits>` (`p.geo.0042`), mysteries `m.<cat>.<4 digits>`, encores `e.<4 digits>`, room-pack questions `r.<pack>.<2 digits>`, fixtures prefixed `fx.`. Category codes: `geo`, `hist`, `sci`, `nat`, `film`, `music`, `art`, `book`, `sport`, `food`, `lang`, `soc`. Answer entities use Wikidata QIDs (`Q90`); an entity from a dataset without a QID gets `x.<type>.<slug>` and a content-queue note.
- **Codes.** Crockford base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`) for challenge codes (8), Group invites (10), quiz share codes (10) and sync codes (16). Input is upper-cased, spaces and hyphens are dropped, I and L read as 1, O as 0. Room codes are 6 digits. Secrets, seat tokens, host tokens and claim tokens are 32 random bytes in base64url (43 characters).
- **Tests.** Unit tests sit next to the code (`*.test.ts`). E2E specs live in `e2e/<area>/*.spec.ts`. Every test that covers a PRD acceptance criterion starts its title with the id: `test('AC-DLY-07 reload resumes at the same clue', ...)`. SQL tests do the same in their final `select 'PASS AC-DLY-05 ...'`.
- **Copy.** User-facing strings for a feature live in `src/features/<area>/copy.ts`, so the copy lint (AC-STK-06) and the design team can find them.
- **Branches.** One branch per ticket, `t/<ticket-id>`, cut from the integration branch. The orchestrator merges, applies migrations and commits.

---

## 3. Domain types

These are the contracts every ticket codes against. CORE-0 copies them into `src/engine/types/*.ts` and `src/analytics/dictionary.ts` with their doc comments. Field names are camelCase in TypeScript; SQL payloads use snake_case and the Supabase adapter converts them (§7.5). Run-machine types (`RunState`, `RunEvent`, `RunCommand`) are in §4.5, next to the reducer.

### 3.1 Identifiers and primitives (`src/engine/types/ids.ts`)

```ts
declare const brand: unique symbol;
/** A nominal type. Values are created only by the parse helpers in ids.ts. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type EpochMs = number;                                  // ms since the Unix epoch
export type PlayerId = Brand<string, 'PlayerId'>;              // UUID v4, minted on the device
export type Secret = Brand<string, 'Secret'>;                  // 43-char base64url, 256 bits
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;  // UUID v4
export type LocalDate = Brand<string, 'LocalDate'>;            // 'YYYY-MM-DD' in a named zone
export type TimeZone = Brand<string, 'TimeZone'>;              // IANA name
export type DailyNumber = Brand<number, 'DailyNumber'>;        // 1 on DAILY_EPOCH
export type ItemId = Brand<string, 'ItemId'>;                  // 'p.geo.0042', 'm.film.0007', 'e.0013'
export type EntityId = Brand<string, 'EntityId'>;              // Wikidata QID, e.g. 'Q90'
export type AttemptId = Brand<string, 'AttemptId'>;            // UUID, issued by the server
export type ChallengeCode = Brand<string, 'ChallengeCode'>;    // 8 Crockford base32
export type GroupId = Brand<string, 'GroupId'>;                // UUID
export type InviteCode = Brand<string, 'InviteCode'>;          // 10 Crockford base32
export type RoomId = Brand<string, 'RoomId'>;                  // UUID, 122 random bits
export type RoomCode = Brand<string, 'RoomCode'>;              // 6 digits
export type SeatId = Brand<string, 'SeatId'>;                  // UUID
export type SeatToken = Brand<string, 'SeatToken'>;            // 43-char base64url
export type HostToken = Brand<string, 'HostToken'>;            // 43-char base64url
export type QuizId = Brand<string, 'QuizId'>;                  // UUID
export type QuizShareCode = Brand<string, 'QuizShareCode'>;    // 10 Crockford base32
export type SyncCode = Brand<string, 'SyncCode'>;              // 16 Crockford base32, no hyphens
export type ClaimToken = Brand<string, 'ClaimToken'>;          // 43-char base64url
export type ShareCode = Brand<string, 'ShareCode'>;            // [0-9a-z]{1,8}
export type PackId = Brand<string, 'PackId'>;                  // 'around-the-world'
export type NoticeId = Brand<number, 'NoticeId'>;
export type AchievementId = Brand<string, 'AchievementId'>;    // 'A01' to 'A30'

/** Test identities start with this prefix (§8.17). */
export const TEST_PLAYER_PREFIX = 'e2e2e2e2-';
```

`ids.ts` also exports total parse helpers (`parsePlayerId(raw): PlayerId | null`, `parseChallengeCode`, `normalizeCrockford`, and so on). Nothing else may cast to a branded type.

### 3.2 Content (`src/engine/types/content.ts`)

```ts
export type CategoryId =
  | 'geo' | 'hist' | 'sci' | 'nat' | 'film' | 'music'
  | 'art' | 'book' | 'sport' | 'food' | 'lang' | 'soc';

export interface Category {
  id: CategoryId;
  slug: string;          // 'science-tech'
  name: string;          // 'Science & Tech'
  shortName: string;     // the share row label
  order: number;
}

export type DifficultyBand = 'easy' | 'medium' | 'hard';
export type DifficultyChoice = DifficultyBand | 'mixed';
export type Region = 'global' | `region:${string}`;
export type Volatility = 'evergreen' | 'slow' | 'dated';   // 'fast' is refused at launch (SYNTHESIS 7.8)

export interface ItemCommon {
  id: ItemId;
  category: CategoryId;
  tags: string[];
  region: Region;
  volatility: Volatility;
  reviewBy: LocalDate | null;           // required when volatility is 'slow'
  seededDifficulty: 1 | 2 | 3 | 4 | 5;
  explanation: string;                  // 35 words or fewer
  learnMore: string;                    // the name searched by the "Learn more" link
}

export interface PredictedRate { p: number; spread: number; estimator: string }

export type ChoiceFormat = 'mc' | 'tf' | 'comparison';

/** Multiple choice, true/false and comparison share one shape after the build. */
export interface ChoiceItem extends ItemCommon {
  format: ChoiceFormat;
  stem: string;              // comparison: the relation, "Which came first?"
  options: string[];         // mc: 3 or 4; tf: ['True', 'False']; comparison: the two items
  correct: number;           // index into options, in source order
  order: 'shuffle' | 'ascending' | 'fixed';   // numbers and dates: ascending; tf: fixed
  predicted: PredictedRate;
}
export type PracticeItem = ChoiceItem;

export type AnswerType =
  | 'country' | 'city' | 'person' | 'film' | 'tv_series' | 'book'
  | 'animal' | 'element' | 'landmark' | 'music_artist' | 'dish' | 'sport';

/** Sealed. Exists on the client only in mock builds (fixtures). */
export interface MysteryContent extends ItemCommon {
  kind: 'mystery';
  answerType: AnswerType;
  answer: EntityId;
  accepted: EntityId[];                                    // at most 2 genuine equivalents
  clues: readonly [string, string, string, string];        // hardest first, 140 chars or fewer
  distractors: readonly [EntityId, EntityId, EntityId];
  slot: 1 | 2 | 3;
  predicted: { solveByClue: readonly [number, number, number, number]; spread: number; estimator: string };
  sourceLabels: string[];                                  // the reveal's sources line
}

/** Sealed. */
export interface EncoreContent extends Omit<ItemCommon, 'seededDifficulty'> {
  kind: 'encore';
  question: string;
  unit: string;                                            // 'kilometres'
  valueKind: 'quantity' | 'year';
  answer: number;
  decimals: 0 | 1 | 2;
  bands: { bullseye: number; close: number } | null;       // relative error or years; null = defaults
  sourceLabels: string[];
}

/** Sealed multiple choice for room packs and choice rounds in sealed compositions. */
export interface SealedChoiceContent extends Omit<ChoiceItem, 'predicted'> { kind: 'choice' }

export interface AnswerEntity {
  id: EntityId;
  name: string;              // canonical, 'Paris'
  display: string;           // 'Paris, France'
  aliases: string[];
  popularity: number;        // Wikidata sitelink count; breaks ranking ties
  keys: string[];            // normalized name and aliases, precomputed by the build (§4.7)
}

export interface AnswerList { type: AnswerType; version: string; entities: AnswerEntity[] }

export interface RoomPack { id: PackId; title: string; theme: string; questionIds: ItemId[] }   // 15 ids
```

### 3.3 Rounds (`src/engine/types/rounds.ts`)

```ts
export type RoundType = 'mc' | 'tf' | 'comparison' | 'mystery' | 'encore' | 'ordering';
export type RoundFamily = 'choice' | 'mystery' | 'encore' | 'ordering';   // ordering: reserved, no v1 content

/** One row of a Daily composition, stored with the schedule (PRD §3.1.2). */
export interface RoundSpec { type: RoundType; difficulty: DifficultyBand | null; contentId: ItemId }

/** Public facts about a round, known before it opens. Never holds the key. */
export interface RoundMeta {
  index: number;
  type: RoundType;
  difficulty: DifficultyBand | null;
  category: CategoryId | null;
  answerType: AnswerType | null;   // mysteries: the client preloads this list at start
  ordinal: number;                 // 2 in "Mystery 2 of 3"
  ofType: number;                  // 3 in "Mystery 2 of 3"
  maxPoints: number;
  voided: boolean;
}

export interface OptionView { index: number; label: string; entityId: EntityId | null; alreadyGuessed: boolean }
export interface WrongGuess { clue: 1 | 2 | 3; entityId: EntityId; display: string }

/** What the client may see while a round is open. */
export type RoundOpen =
  | { family: 'mystery'; index: number; clue: 1 | 2 | 3 | 4; clues: string[];
      wrongGuesses: WrongGuess[]; options: OptionView[] | null; issuedAt: EpochMs }
  | { family: 'encore'; index: number; question: string; unit: string;
      valueKind: 'quantity' | 'year'; decimals: 0 | 1 | 2; issuedAt: EpochMs }
  | { family: 'choice'; index: number; format: ChoiceFormat; stem: string;
      options: OptionView[]; issuedAt: EpochMs };

/** What the player does. Checked on the device, judged by the plugin's judge half. */
export type RoundIntent =
  | { family: 'mystery'; kind: 'guess'; entityId: EntityId }
  | { family: 'mystery'; kind: 'next_clue' }
  | { family: 'mystery'; kind: 'pick'; option: number }
  | { family: 'encore'; kind: 'lock_in'; value: number }
  | { family: 'choice'; kind: 'answer'; option: number };

export interface MysteryCrowd {
  solvedOn: readonly [number, number, number, number];   // whole percentages, largest remainder
  missed: number;
  topWrongGuess: { entityId: EntityId; display: string } | null;   // only at 5% or more
  eligible: number;
}
export interface EncoreCrowd {
  medianGuess: number;
  bullseyeShare: number;
  closeShare: number;
  buckets: readonly [number, number, number, number];   // bullseye, close, 15-50% off, >50% off (or years)
  eligible: number;
}
export interface ChoiceCrowd { optionShares: number[]; eligible: number }

export interface EncoreError { kind: 'relative' | 'years'; value: number; display: string }   // '4% off'
export type EncoreBand = 'bullseye' | 'close' | null;

export type RoundReveal =
  | { family: 'mystery'; answer: { entityId: EntityId; display: string };
      clues: readonly [string, string, string, string]; solvedOn: 1 | 2 | 3 | 4 | null; points: number;
      pickedOption: number | null; explanation: string; learnMore: string; sourceLabels: string[];
      crowd: MysteryCrowd | null }
  | { family: 'encore'; guess: number; answer: number; unit: string; error: EncoreError; band: EncoreBand;
      explanation: string; learnMore: string; sourceLabels: string[]; crowd: EncoreCrowd | null }
  | { family: 'choice'; correctIndex: number; chosenIndex: number | null; correct: boolean; points: number;
      explanation: string; learnMore: string; crowd: ChoiceCrowd | null };

/** The judge's answer to one intent. */
export type RoundVerdict =
  | { kind: 'continue'; open: RoundOpen }                                  // wrong guess or Next clue
  | { kind: 'resolved'; reveal: RoundReveal; next: RoundMeta | null };     // the round is over

/** Semantic share cells. DESIGN.md maps them to glyphs (default and high-contrast sets). */
export type ShareCell = 'passed' | 'solved' | 'unused' | 'voided' | 'correct' | 'wrong';

export type RoundOutcome =
  | { family: 'mystery'; solvedOn: 1 | 2 | 3 | 4 | null; points: number; voided: boolean;
      category: CategoryId; cells: ShareCell[] }
  | { family: 'encore'; error: EncoreError | null; band: EncoreBand; voided: boolean }
  | { family: 'choice'; correct: boolean; points: number; voided: boolean;
      answerMs: number | null; cells: ShareCell[] };

export interface ResolvedRound { meta: RoundMeta; outcome: RoundOutcome; reveal: RoundReveal }
```

### 3.4 Runs, Daily, archive and results (`runs.ts`, `daily.ts`)

```ts
export type RunMode =
  | 'daily' | 'archive' | 'challenge' | 'pack' | 'quiz'          // sealed, judged by the backend
  | 'practice' | 'blitz' | 'survival' | 'review' | 'quiz_solo';  // local, judged on the device

export type EndRule = { kind: 'fixed' } | { kind: 'strikes'; max: number } | { kind: 'clock'; durationMs: number };
export type Timing = { kind: 'untimed' } | { kind: 'stopwatch' } | { kind: 'countdown'; durationMs: number };
export type ScoringPolicy = 'sealed' | 'practice' | 'blitz';   // rooms are scored on the server (§4.6)

export interface RunConfig {
  mode: RunMode;
  sealed: boolean;
  rounds: RoundMeta[] | 'stream';      // 'stream': Blitz and Survival append rounds as they go
  endRule: EndRule;
  timing: Timing;
  scoring: ScoringPolicy;
  seed: string;                        // practice selection and shuffles
  runId: string;                       // the attempt id for sealed runs, a local UUID otherwise
}

export type AttemptKind = 'daily' | 'archive' | 'challenge' | 'pack' | 'quiz';
export type SealedSource =
  | { kind: 'today' }
  | { kind: 'archive'; dailyNumber: DailyNumber }
  | { kind: 'challenge'; code: ChallengeCode }
  | { kind: 'pack'; packId: PackId }
  | { kind: 'quiz'; code: QuizShareCode };

export interface DailyIdentity { dailyNumber: DailyNumber; date: LocalDate }   // "Daily #42 · Sunday 1 November"
export type CompositionId = string;                                            // 'm3e1', 'c9e1' (§4.9)

export interface AttemptSnapshot {
  attemptId: AttemptId;
  kind: AttemptKind;
  ranked: boolean;
  daily: DailyIdentity | null;
  composition: CompositionId;
  rounds: RoundMeta[];
  maxPoints: number;
  resolved: ResolvedRound[];
  current: { index: number; open: RoundOpen | null } | null;   // open null: Continue not tapped yet
  status: 'active' | 'finished' | 'abandoned';
  points: number;
  startedAt: EpochMs;
  serverTime: EpochMs;
}

export interface BestMomentFacts {
  perfect: boolean;
  newBestScore: boolean;
  milestone: number | null;
  hardestSolvedOnClue1: boolean;
  bullseye: boolean;              // mastery tiers are decided on the device
}
export interface StreakDelta {
  before: number; after: number; freezesHeld: 0 | 1 | 2;
  freezeEarned: boolean; repaired: boolean; milestone: number | null;
}
export interface FinishSummary {
  attemptId: AttemptId; points: number; maxPoints: number; encore: EncoreError | null;
  totalMs: number; ranked: boolean; streak: StreakDelta | null; facts: BestMomentFacts;
}

export interface DailyTodayCard {
  daily: DailyIdentity;
  status: 'not_started' | 'in_progress' | 'finished';
  attemptId: AttemptId | null;
  progress: { roundIndex: number; of: number } | null;
  finished: { points: number; maxPoints: number; rows: ShareCell[][]; encore: EncoreError | null } | null;
  nextUnlockAt: EpochMs;          // the player's next local midnight
  serverTime: EpochMs;
}

export type PercentileView =
  | { status: 'ready'; percentile: number; pool: number; scope: 'band' | 'all'; final: boolean }
  | { status: 'cold_start'; finishers: number }
  | { status: 'unranked'; wouldHaveBeaten: number | null; windowOpen: boolean };

export interface ScoreHistogram { counts: number[]; mine: number | null; pool: number }   // index = points

export interface DailyResults {
  attempt: AttemptSnapshot;       // status 'finished', every round resolved
  summary: FinishSummary;
  percentile: PercentileView;
  histogram: ScoreHistogram | null;   // null below 50 eligible finishers
}

export type ArchiveTileState = 'played' | 'not_played' | 'repair_available' | 'repair_used' | 'abandoned';
export interface ArchiveTile {
  daily: DailyIdentity;
  state: ArchiveTileState;
  result: { points: number; maxPoints: number; rows: ShareCell[][] } | null;
  repairUntil: EpochMs | null;
  nextRepairAt: EpochMs | null;
}
export interface ArchiveListing { today: LocalDate; tiles: ArchiveTile[] }   // T-1 to T-7, newest first
```

### 3.5 Streaks and stats (`streaks.ts`)

```ts
export type DayStatus = 'played' | 'repaired' | 'freeze' | 'protected' | 'missed' | 'today';

export type StreakNotice =
  | { id: NoticeId; kind: 'freeze_spent'; date: LocalDate }
  | { id: NoticeId; kind: 'protected'; date: LocalDate }
  | { id: NoticeId; kind: 'rescored'; dailyNumber: DailyNumber; round: number; points: number; maxPoints: number }
  | { id: NoticeId; kind: 'key_corrected'; dailyNumber: DailyNumber; round: number; points: number; maxPoints: number };

export interface RepairOffer { date: LocalDate; dailyNumber: DailyNumber; until: EpochMs }

export interface StreakState {
  current: number;
  best: number;
  daysPlayed: number;              // Played and Repaired dates, ever
  dailiesFinished: number;
  freezesHeld: 0 | 1 | 2;
  freezeProgress: number;          // 0 to 6; stays 0 while 2 are held
  strip: { date: LocalDate; status: DayStatus }[];   // last 14 dates, oldest first
  repair: RepairOffer | null;
  repairBlockedUntil: EpochMs | null;                // the 168-hour cap
  breakTooLong: boolean;           // two or more uncovered dates in the break
  notices: StreakNotice[];         // unseen one-time notices
  today: LocalDate;
  evaluatedAt: EpochMs;
}

export interface PlayerServerStats {
  daysPlayed: number;
  dailiesFinished: number;
  averageScore: number | null;
  recent: { daily: DailyIdentity; points: number; maxPoints: number }[];   // last 30 played
  scoreDistribution: number[];                                             // index = points
  solvesByClue: readonly [number, number, number, number, number];        // clue 1 to 4, missed
  encore: { bullseyes: number; closes: number; medianError: EncoreError | null };
  dailyCategory: Partial<Record<CategoryId, { firstAttempts: number; correct: number; hardCorrect: number }>>;
  achievements: { id: AchievementId; unlockedAt: EpochMs }[];
  refreshedAt: EpochMs;
}
```

### 3.6 Challenges and Groups (`social.ts`)

```ts
export interface SideResult {
  nickname: string; points: number; maxPoints: number; rows: ShareCell[][];
  encore: EncoreError | null; totalMs: number;
}

export interface ChallengeLanding {
  code: ChallengeCode;
  state: 'valid' | 'expired' | 'full' | 'not_open' | 'invalid';
  relation: 'new' | 'already_played' | 'self';
  challenger: SideResult | null;
  daily: DailyIdentity | null;                 // null for packs
  playAs: 'ranked' | 'archive' | 'challenge_only' | 'pack' | null;
  unlocksAt: EpochMs | null;                   // set when state is 'not_open'
}

export interface HeadToHead {
  code: ChallengeCode;
  you: SideResult;
  them: SideResult;
  verdict: { winner: 'you' | 'them' | 'tie'; decidedBy: 'points' | 'encore' | 'time' | 'tie' };
  rematchAvailable: boolean;
}

export interface ChallengeShelfItem {
  code: ChallengeCode; daily: DailyIdentity | null; counterpart: string;
  state: 'to_play' | 'waiting' | 'won' | 'lost' | 'tied'; createdAt: EpochMs;
}
export interface ChallengeShelf { received: ChallengeShelfItem[]; waiting: ChallengeShelfItem[]; finished: ChallengeShelfItem[] }
export interface ChallengeParticipants {
  rows: { nickname: string; points: number; maxPoints: number; outcome: 'win' | 'loss' | 'tie' }[];
}

export interface GroupSummary { id: GroupId; name: string; memberCount: number; role: 'admin' | 'member'; myNickname: string }
export interface GroupInvitePreview { state: 'valid' | 'full' | 'invalid'; name: string | null; memberCount: number | null }

/** memberNo is a per-group handle. Player ids never leave the server. */
export interface GroupTodayRow {
  memberNo: number; nickname: string; isMe: boolean; status: 'finished' | 'not_yet';
  rank: number | null; points: number | null; maxPoints: number | null;
  rows: ShareCell[][] | null; encore: EncoreError | null;   // all null until the viewer has finished
}
export interface GroupWeekRow {
  rank: number; memberNo: number; nickname: string; isMe: boolean;
  points: number; daysPlayed: number; currentStreak: number;
}
export interface GroupBoard {
  group: GroupSummary;
  today: { daily: DailyIdentity; viewerFinished: boolean; playedCount: number; rows: GroupTodayRow[] };
  week: { start: LocalDate; end: LocalDate; maxPoints: number; rows: GroupWeekRow[] };
  lastWeekWinner: { nickname: string; points: number } | null;
  fetchedAt: EpochMs;
}
export type GroupAdminAction =
  | { kind: 'rename'; name: string }
  | { kind: 'regenerate_invite' }
  | { kind: 'transfer_admin'; memberNo: number }
  | { kind: 'remove'; memberNo: number };
```

### 3.7 Rooms, Beta (`rooms.ts`)

```ts
export type RoomPhase = 'lobby' | 'read' | 'answering' | 'reveal' | 'standings' | 'paused' | 'podium' | 'ended';
export interface RoomSettings { timerSeconds: 10 | 20 | 30 | 60 | null; scoring: 'classic' | 'accuracy' }   // null: host advances
export type RoomSource = { kind: 'pack'; packId: PackId } | { kind: 'quiz'; quizId: QuizId };

/** The only thing Realtime carries. A hint to refetch, never truth. */
export interface RoomHint { roomId: RoomId; version: number; phase: RoomPhase; questionIndex: number; deadline: EpochMs | null }

export interface RoomQuestionView {
  index: number; total: number; isFinal: boolean; stem: string;
  options: string[];               // shown once the server clock passes optionsAt
  optionsAt: EpochMs; deadline: EpochMs | null;
}
export interface RoomRevealView { correctIndex: number; distribution: number[]; explanation: string; voided: boolean }
export interface RoomStanding { seatId: SeatId; name: string; score: number; rank: number }

export interface RoomPlayerView {
  roomId: RoomId; version: number; phase: RoomPhase; locked: boolean; serverTime: EpochMs;
  me: { seatId: SeatId; name: string; score: number; rank: number | null; gapAbove: number | null;
        aboveName: string | null; answered: boolean; last: { correct: boolean; points: number } | null;
        extraTime: boolean };
  question: RoomQuestionView | null;
  reveal: RoomRevealView | null;
  podium: RoomStanding[] | null;
  notice: 'final_question' | 'voided' | 'removed' | 'ended' | null;
}

export interface RoomSeatView {
  seatId: SeatId; name: string; connected: boolean; score: number;
  answered: boolean; extraTime: boolean; removed: boolean;
}
export interface RoomHostView {
  roomId: RoomId; code: RoomCode; version: number; phase: RoomPhase; locked: boolean;
  settings: RoomSettings; serverTime: EpochMs; questionCount: number;
  seats: RoomSeatView[]; answeredCount: number; connectedCount: number;
  question: RoomQuestionView | null; reveal: RoomRevealView | null;
  top: RoomStanding[] | null; podium: RoomStanding[] | null;
}

export type RoomHostAction =
  | { kind: 'start' } | { kind: 'skip_read' } | { kind: 'extend_all' }
  | { kind: 'extra_time'; seatId: SeatId; on: boolean }
  | { kind: 'reveal' } | { kind: 'next' } | { kind: 'pause' } | { kind: 'resume' }
  | { kind: 'remove'; seatId: SeatId } | { kind: 'rename'; seatId: SeatId; name: string }
  | { kind: 'lock'; locked: boolean } | { kind: 'end' };
```

### 3.8 User quizzes, Beta (`quizzes.ts`)

```ts
export interface UserQuizQuestion { format: 'mc' | 'tf'; stem: string; options: string[]; correct: number; explanation: string }
export type QuizState = 'private' | 'shared' | 'hidden' | 'taken_down';

export interface UserQuiz {
  id: QuizId; title: string; description: string; questions: UserQuizQuestion[];
  version: number; updatedAt: EpochMs; shareCode: QuizShareCode | null; state: QuizState;
  stats: { plays: number; averageScore: number | null };
}

export interface QuizDraft {
  localId: string; serverId: QuizId | null; baseVersion: number | null;
  title: string; description: string; questions: UserQuizQuestion[];
  updatedAt: EpochMs; savedAt: EpochMs | null;
}

export type BlockingRule =
  | 'B_TITLE' | 'B_STEM' | 'B_OPTIONS_MIN' | 'B_OPTION_EMPTY' | 'B_OPTION_DUP'
  | 'B_CORRECT' | 'B_LENGTH' | 'B_TEXT' | 'B_COUNT';
export type LintRule = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8';
export interface LintFinding { rule: LintRule | BlockingRule; severity: 'warning' | 'blocking'; path: string; message: string }

export interface SharedQuizLanding {
  code: QuizShareCode; state: 'available' | 'hidden' | 'unavailable';
  title: string | null; description: string | null; questionCount: number | null;
}
export interface ImportRow { row: number; status: 'ok' | 'warning' | 'error'; question: UserQuizQuestion | null; messages: string[] }
```

### 3.9 Reports and hearts (`reports.ts`)

```ts
export type ItemReportReason = 'wrong_answer' | 'ambiguous' | 'out_of_date' | 'offensive' | 'typo';
export type QuizReportReason = 'hateful' | 'sexual' | 'harassment' | 'spam' | 'wrong_answers' | 'other';

export type ReportTarget =
  | { kind: 'practice_item'; itemId: ItemId }
  | { kind: 'daily_round'; dailyNumber: DailyNumber; round: number }
  | { kind: 'pack_question'; itemId: ItemId }
  | { kind: 'room_question'; roomId: RoomId; questionIndex: number }
  | { kind: 'quiz'; code: QuizShareCode }
  | { kind: 'quiz_question'; code: QuizShareCode; index: number };

export interface ReportInput {
  target: ReportTarget;
  reason: ItemReportReason | QuizReportReason;
  note: string | null;              // 280 chars or fewer; links stripped on both sides
  clientId: IdempotencyKey;         // the outbox key; one report per identity per target
}

/** itemRef: 'p.geo.0042', 'daily:42:2', 'room:<roomId>:7', 'quiz:<code>:3' */
export interface HeartInput { itemRef: string; on: boolean; clientId: IdempotencyKey }
```

### 3.10 Identity and health (`identity.ts`, `health.ts`)

```ts
export type AgeBand = 'under_13' | '13_17' | '18_plus';
export type AgeMoment = 'nickname' | 'group' | 'reminder' | 'quiz_share';

export interface LocalIdentity {
  v: 1;
  playerId: PlayerId;
  secret: Secret;
  registered: boolean;               // the server has seen a write from this credential
  createdAt: EpochMs;
  source: 'minted' | 'cookie' | 'sync' | 'claim';
  cookieSavedAt: EpochMs | null;     // last successful POST /api/identity
}

export interface Profile { playerId: PlayerId; friendlyName: string; nickname: string | null; ageBand: AgeBand | null; createdAt: EpochMs }
export interface RestoredProfile { profile: Profile; streak: { current: number; best: number }; lastDaily: DailyIdentity | null }
export interface ClaimPreview { friendlyName: string; nickname: string | null; streak: number; lastDaily: DailyIdentity | null; expiresAt: EpochMs }
export interface ServerDataExport {
  exportedAt: EpochMs; profile: Profile;
  attempts: unknown[]; streakDays: unknown[]; groups: unknown[]; challenges: unknown[]; quizzes: unknown[];
}

export type ServiceState = 'ok' | 'degraded' | 'outage' | 'maintenance';
export type ClientHealth = ServiceState | 'unreachable' | 'offline' | 'unavailable';
export interface ServiceStatus {
  state: ServiceState;
  messageId: string | null;
  startsAt: EpochMs | null;
  endsAt: EpochMs | null;
  protectedDates: LocalDate[];       // recent incident dates, for the one-time notice
  contentFix: { dailyNumber: DailyNumber } | null;
  serverTime: EpochMs;
}
```

### 3.11 Results and errors (`results.ts`)

```ts
export type BackendErrorCode =
  | 'offline' | 'unreachable' | 'timeout' | 'unavailable' | 'feature_disabled'     // transport and mode
  | 'auth_failed' | 'rate_limited' | 'limit_reached'                                // identity and limits
  | 'invalid_input' | 'invalid_entity' | 'already_guessed' | 'blocked_text'         // validation
  | 'age_required' | 'age_forbidden'
  | 'not_found' | 'stale' | 'conflict' | 'already_played' | 'expired' | 'not_open'  // state
  | 'full' | 'locked' | 'removed' | 'ended' | 'not_member' | 'no_daily'
  | 'internal';

export interface BackendError {
  code: BackendErrorCode;
  retryable: boolean;
  retryAfterMs: number | null;
  refId: string | null;              // the short reference shown in small text
  current?: unknown;                 // 'stale' and 'conflict' carry the current server state
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: BackendError };
```

### 3.12 Analytics events (`src/analytics/dictionary.ts`)

The dictionary is the single source for client types, the client-side allowlist and the SQL allowlist (SQL-10 generates `supabase/seed/analytics-dictionary.sql` from it). It mirrors PRD §7 exactly.

```ts
const e = <const T extends readonly string[]>(...values: T) => ({ kind: 'enum', values }) as const;
const bool = { kind: 'bool' } as const;
const num = (min: number, max: number) => ({ kind: 'number', min, max }) as const;
const ref = { kind: 'item_ref' } as const;       // 'p.geo.0042' style
const word = { kind: 'token', max: 48 } as const; // [a-z0-9_.-], e.g. a composition id or build id
const hex16 = { kind: 'hex', length: 16 } as const;

const MODE = e('daily', 'archive', 'practice', 'blitz', 'survival', 'review', 'challenge', 'room', 'quiz');
const APP = e('whatsapp', 'instagram', 'facebook', 'messenger', 'tiktok', 'snapchat', 'linkedin', 'telegram', 'google', 'other', 'none');
const OFFER = e('claim', 'sync', 'install', 'calendar', 'group', 'none');
const SURFACE = e('stop', 'archive', 'practice', 'challenge', 'group_invite', 'quiz', 'head_to_head');
const TRIGGER = e('third_daily', 'first_quiz', 'in_app_first', 'private_first', 'pre_install', 'tenth_daily', 'manual');

export const EVENTS = {
  landing_view: { entry: e('direct', 'share', 'challenge', 'group_invite', 'room', 'quiz', 'search', 'installed', 'other'), app: APP },
  first_answer: { mode: MODE },
  practice_start: { mode: MODE, category: word, difficulty: e('easy', 'medium', 'hard', 'mixed', 'ramp') },
  round_complete: { mode: MODE, score_band: e('0-3', '4-6', '7-9', '10-12', '7-8', '9-10', 'na'), composition: word },
  results_view: { mode: MODE },
  stop_screen_view: { first_view: bool, offer: OFFER },
  offer_action: { offer: OFFER, action: e('accept', 'dismiss') },
  mystery_input: { round: num(1, 3), typed: bool, suggestions_shown: bool, resolution: e('guess', 'option', 'missed'),
                   first_keystroke_s: e('0-5', '5-15', '15-30', '30+', 'none') },
  suggestion_none: { answer_type: word, query_len: e('3-5', '6-10', '11+') },
  share_open: { mode: MODE, surface: SURFACE },
  share_complete: { method: e('native', 'clipboard', 'manual'), mode: MODE, surface: SURFACE },
  share_cancel: { mode: MODE, surface: SURFACE },
  challenge_open: { state: e('valid', 'expired', 'full', 'not_open', 'invalid'), relation: e('new', 'already_played', 'self') },
  group_invite_open: { state: e('valid', 'full', 'invalid') },
  room_join: { result: e('ok', 'full', 'locked', 'bad_code', 'rate_limited'), method: e('qr', 'code') },
  room_disconnect: { reason: e('heartbeat_timeout', 'offline', 'hidden', 'removed', 'ended'), duration_s: e('0-10', '10-60', '60+') },
  realtime_fallback: { reason: e('channel_error', 'late_phase') },
  read_beat_skip: { slot: num(1, 50) },
  explanation_dwell: { mode: MODE, seconds: e('0-2', '2-5', '5-10', '10-20', '20+') },
  question_heart: { item_id: ref, mode: MODE, value: e('on', 'off') },
  report_open: { mode: MODE },
  sync_code_offer: { trigger: TRIGGER },
  sync_code_saved: { trigger: TRIGGER, method: e('copy', 'confirm') },
  sync_code_redeem: { result: e('ok', 'bad', 'rate_limited'), replaced_progress: bool },
  claim_link_offer: { app: APP },
  claim_link_used: { app: APP, result: e('ok', 'expired', 'used') },
  identity_restored: { source: e('cookie', 'sync_code', 'claim') },
  storage_lost: {},
  install_prompt_shown: {},
  install_accepted: {},
  calendar_add: { method: e('google', 'ics') },
  age_band_set: { band: e('under_13', '13_17', '18_plus'), moment: e('nickname', 'group', 'reminder', 'quiz_share') },
  settings_change: { setting: e('theme', 'motion', 'sound', 'haptics', 'readable_text', 'high_contrast', 'read_aloud',
                                'stopwatch', 'shortcuts', 'auto_advance', 'timer_announcements'),
                     value: e('system', 'light', 'dark', 'on', 'off', 'shown', 'hidden') },
  offline_state_shown: { feature: e('daily', 'archive', 'challenge', 'group', 'room', 'quiz', 'restore') },
  incident_banner_shown: { state: e('degraded', 'outage', 'unreachable', 'maintenance', 'content_fix') },
  survey_answer: { question_id: e('regret_v1'), answer: e('yes', 'no', 'not_sure', 'dismissed') },
  web_vitals: { metric: e('LCP', 'INP', 'CLS', 'FCP', 'TTFB', 'Q1'), value: num(0, 600_000), rating: e('good', 'needs_improvement', 'poor') },
  client_error: { kind: e('error', 'rejection', 'rpc'), message_hash: hex16, rpc: word },
  sw_update_applied: { from_version: word, to_version: word },
} as const;

export type EventName = keyof typeof EVENTS;
export type EventProps<N extends EventName> = { [K in keyof (typeof EVENTS)[N]]: PropValue<(typeof EVENTS)[N][K]> };

export type RouteGroup =
  | 'home' | 'daily' | 'archive' | 'practice' | 'challenge' | 'share' | 'group' | 'me'
  | 'settings' | 'room' | 'host' | 'editor' | 'quiz' | 'category' | 'legal' | 'other';
export type Platform = 'ios' | 'android' | 'desktop' | 'other';
export type BrowserContextKind = 'browser' | 'installed' | 'in_app' | 'unknown';

/** Added by the client queue to every event. No free text, IP, user agent or referrer value. */
export interface EventEnvelope {
  event_id: string;            // UUID, unique constraint server-side
  name: EventName;
  player_id: PlayerId;
  session_id: string;          // random per tab
  ts_client: string;           // ISO 8601
  app_version: string;
  route_group: RouteGroup;
  platform: Platform;
  context: BrowserContextKind;
}
```

`PropValue` maps `enum` to its literal union, `bool` to `boolean`, `number` to `number` and the string kinds to `string`. A dictionary edit is a contract change: it needs a new SQL dictionary load (SQL-10's generator) in the same pull request, and CI fails if the committed SQL does not match the dictionary.

---

## 4. The game engine (`src/engine`)

### 4.1 Rules for every engine module

- **Pure.** No React, no Next, no DOM, no storage, no network. Functions take data and return data.
- **No hidden inputs.** Time arrives as `at` on events or through an injected `Clock`; randomness through an injected `Rng`. `Date.now()`, `Math.random()`, `new Date()` without an argument, `crypto.randomUUID()`, `performance` and timers are lint errors here. `Intl` is allowed, because its output depends only on its arguments.
- **Deterministic.** The same seed and the same events give the same output on every machine. Every PRD worked example and scenario table is a table-driven test.
- **Runnable from Node.** Relative imports with `.ts` extensions, erasable syntax only (§2.2), so `scripts/` and the SQL parity generator can import engine modules directly.
- **Coverage.** `src/engine/**` keeps 95% line and 90% branch coverage (Vitest with `@vitest/coverage-v8`, thresholds set by PLT-1).

### 4.2 Seeded randomness (`rng.ts`)

```ts
export interface Rng {
  next(): number;                          // [0, 1)
  int(maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];    // Fisher-Yates, returns a copy
  pick<T>(items: readonly T[]): T;
  fork(label: string): Rng;                // an independent stream, stable for the same label
}
export function createRng(seed: string): Rng;   // sfc32, seeded through cyrb128(seed)
```

Seeds: a practice run uses its `runId` (a UUID from `crypto.getRandomValues`, generated by the controller). The mock server forks `attempt:<id>:round:<n>` for option shuffles. Tests pass literal seeds. SQL never reproduces this generator: sealed shuffles are drawn with `gen_random_bytes` and stored per attempt, so parity tests compare judged results, never shuffles.

### 4.3 Time (`clock.ts`, `time/`)

```ts
export interface Clock { now(): EpochMs; monotonic(): number }
export function createFakeClock(start: EpochMs): Clock & { advance(ms: number): void; set(at: EpochMs): void };
```

`src/platform/clock.ts` provides `systemClock` (`Date.now`, `performance.now`). `src/platform/server-clock.ts` wraps it with an offset learned from `server_time` on RPC responses: offset = server time minus the midpoint of the request, smoothed over the last five samples and kept in session storage. Every display that depends on the date ("Next Daily in 5h 12m", unlock countdowns) reads the server-corrected clock. In E2E, Playwright's `page.clock` drives `Date.now()` and timers, and the mock backend reads the same clock, so the whole stack moves together.

`time/` holds pure helpers, all taking an explicit zone:

| Function | Meaning |
|---|---|
| `localDateOf(at, tz)` | The `YYYY-MM-DD` date of instant `at` in zone `tz`, through `Intl.DateTimeFormat('en-CA', { timeZone })` |
| `zoneOffsetMinutes(at, tz)` | UTC offset at that instant |
| `startOfLocalDay(date, tz)` | The instant of local 00:00 (found by offset search, safe across DST) |
| `msUntilLocalMidnight(at, tz)` | Countdown source for "Next Daily in" |
| `addDays(date, n)`, `daysBetween(a, b)` | Calendar arithmetic on `LocalDate` strings |
| `dailyNumberFor(date, epoch)` | `daysBetween(epoch, date) + 1` |
| `globalWindow(date)` | `{ opensAt: date 00:00 at UTC+14, closesAt: date+1 00:00 at UTC-12 }`, about 50 hours |
| `isoWeek(date)` | Monday to Sunday containing `date` (Group week tab) |
| `formatLongDate(date)` | "Sunday 1 November" (months spelled out, PRD §3.0.4) |

### 4.4 Round plugins (`rounds/`)

A plugin has two halves. The **client half** holds what the player can see and checks intents locally. The **judge half** holds the key and decides verdicts. Practice uses both halves on the device. Sealed play uses only the client half on the device; the judge half runs in the mock server, and SQL holds the authoritative copy of the judge.

```ts
// src/engine/rounds/types.ts
export interface JudgeContext {
  at: EpochMs;                      // server time of this decision
  rng: Rng;                         // forked per attempt and round
  shuffle: readonly number[] | null; // stored option order for the round (sealed); null: derive from rng
  optionsFromClue: 3 | 4;           // PRD Q3, tunable, default 4
  entities: EntityLookup | null;    // validates guesses against the closed list
}

export type IntentError = 'already_guessed' | 'invalid_input' | 'not_selectable';
export type IntentCheck = { ok: true } | { ok: false; error: IntentError };
export type JudgeError = 'invalid_entity' | 'already_guessed' | 'invalid_input' | 'stale';

export interface RoundPlugin<F extends RoundFamily, Content, Client, Judge> {
  readonly family: F;
  readonly types: readonly RoundType[];                 // choice: ['mc', 'tf', 'comparison']
  maxPoints(meta: RoundMeta): number;                   // choice 1, mystery 4, encore 0
  // Client half (no key)
  init(open: Extract<RoundOpen, { family: F }>): Client;
  check(client: Client, intent: Extract<RoundIntent, { family: F }>): IntentCheck;
  apply(client: Client, verdict: RoundVerdict): Client;
  outcome(client: Client, meta: RoundMeta): Extract<RoundOutcome, { family: F }> | null;   // null until resolved
  announce(client: Client, verdict: RoundVerdict): Announcement;                         // data, not copy
  // Judge half (holds the key)
  open(content: Content, meta: RoundMeta, ctx: JudgeContext): { open: Extract<RoundOpen, { family: F }>; judge: Judge };
  judge(content: Content, judge: Judge, intent: Extract<RoundIntent, { family: F }>, ctx: JudgeContext):
    | { ok: true; judge: Judge; verdict: RoundVerdict }
    | { ok: false; error: JudgeError };
}

export type Announcement =
  | { kind: 'correct'; answer: string }
  | { kind: 'wrong_choice'; chosen: string; answer: string }
  | { kind: 'wrong_guess'; guess: string; clue: number; clueText: string }
  | { kind: 'next_clue'; clue: number; clueText: string }
  | { kind: 'mystery_solved'; answer: string; clue: number; points: number }
  | { kind: 'mystery_missed'; answer: string }
  | { kind: 'encore_result'; guess: string; answer: string; error: string; band: EncoreBand };
```

The feature layer turns `Announcement` data into copy ("Not Heat. Clue 3: ...") from its `copy.ts`, so wording stays with the design team. Plugins leave `verdict.next` and crowd stats null; the sealed layer (the mock server or SQL) fills them in, because only it knows the attempt's composition and the crowd.

`rounds/index.ts` exports `PLUGINS: PluginRegistry`, keyed by `RoundType`, and `pluginFor(type)`. The registry imports one module per family and never changes after CORE-0.

#### 4.4.1 Families

| Family | Client state | Judge state | Rules (PRD) |
|---|---|---|---|
| `choice` (mc, tf, comparison) | Options in display order, chosen index, reveal | Correct index in display order | Display order: `shuffle` items use the stored or seeded order; `ascending` items sort numbers and dates; tf is fixed (True, False). One `answer` intent resolves the round. 1 point (practice and sealed), 0 when wrong. Cells `correct` or `wrong` (PRD §3.3.2) |
| `mystery` | Clue number, revealed clues, wrong guesses, options from `optionsFromClue` | Answer, accepted ids, distractors, guessed ids, current clue | `guess` on clues 1 to 3: an id not on the list is `invalid_entity` and consumes nothing; a repeat is `already_guessed` and consumes nothing; a correct id resolves with `5 - k` points; a wrong id issues clue `k + 1`. `next_clue` issues clue `k + 1`. From clue `optionsFromClue` the four options (answer plus three distractors, in the stored shuffle) replace typing; options already guessed come back `alreadyGuessed`. A correct `pick` resolves with `5 - k`; a wrong pick before clue 4 issues the next clue; a wrong pick on clue 4 misses with 0. Cells: `k - 1` passed, solved, `4 - k` unused; a miss is four passed; a void is four voided (PRD §4.1) |
| `encore` | Question, unit, kind, decimals | Answer, bands | One `lock_in` with a parsed value resolves the round with the error, band and display (PRD §4.2). 0 points |
| `ordering` | (reserved) | (reserved) | The stub throws `unsupported_round_type`; the content schema refuses ordering items in v1 |

#### 4.4.2 Encore input and suggestions are engine code too

- `encore/parse.ts`: `parseEncoreInput(raw, { decimals, valueKind })` returns `{ ok: true, value, preview }` or `{ ok: false, error: 'not_number' | 'negative' | 'bad_separator' | 'too_many_decimals' | 'too_many_digits' | 'year_range' }`, implementing PRD §4.2.1 exactly (with no decimals, every "." and "," is a thousands separator; with decimals, the first separator is the point; at most 15 significant digits; years 1 to 9999).
- `suggest/`: §4.7 below.

#### 4.4.3 The round UI contract (`src/features/rounds/contracts.ts`)

```ts
export interface RoundComponentProps {
  meta: RoundMeta;
  open: RoundOpen;
  client: unknown;                        // the plugin's client state, narrowed inside the component
  status: 'idle' | 'judging' | 'checking' | 'revealed' | 'offline' | 'error';  // checking: judging past 1.5 s
  reveal: RoundReveal | null;
  error: { code: BackendErrorCode | IntentError; retryable: boolean } | null;
  onIntent(intent: RoundIntent): void;
  onContinue(): void;
  continueLabel: string;                  // "Next mystery", "On to the Encore", "See your results"
  context: {
    mode: RunMode;
    sealed: boolean;
    list: AnswerListHandle | null;        // mysteries only
    itemRef: string;                      // for RevealActions (hearts, reports)
    settings: PlaySettings;               // shortcuts, motion, sound, read aloud
  };
}

export interface AnswerListHandle {
  status: 'loading' | 'ready' | 'failed';
  suggest(query: string, alreadyGuessed: ReadonlySet<EntityId>): Suggestion[];
}
```

Round components own the round's whole visual life: question, input, pressed and locked states, the reveal, and the Continue button placed where the answers were. Shared pieces (answer buttons, the explanation sheet, the status region) come from `src/ui`.

### 4.5 The run state machine (`run/`)

One reducer drives every mode: the Daily, archive, challenges, packs, shared quizzes, practice, Blitz, Survival, review and solo play of a draft. It never awaits anything. Async work leaves as commands; results come back as events stamped by the controller with `clock.now()`.

```text
            createRun()
                |
                v
   +------> opening --opened--> active --intent (check ok)--> judging
   |           ^                  ^  |                          |   |
   |           |                  |  +--intent (check fails)    |   +--failed (retryable): stay judging,
   |           |                  |     stays active, error     |      schedule_retry; retry re-sends
   |           |                  |                             |      the same idempotency key
   |           |                  +------verdict 'continue'-----+
   |           |                                                |
   |      continue (more rounds, end rule not met)        verdict 'resolved'
   |           |                                                v
   +-----------+------------------------------------------- revealed
                                                               |
                         continue (last round or end rule met) |
                                                               v
                                         finishing --finished--> finished
   Any non-final phase --tick past countdown--> finishing (open round discarded, unscored, not seen)
   Any phase --resume(snapshot)--> rebuilt from the snapshot
   Local runs only --abandon--> abandoned
```

```ts
// src/engine/run/types.ts
export type RunPhase = 'opening' | 'active' | 'judging' | 'revealed' | 'finishing' | 'finished' | 'abandoned';

export interface RoundSlot {
  meta: RoundMeta;
  open: RoundOpen | null;
  client: unknown;                 // plugin client state
  reveal: RoundReveal | null;
  outcome: RoundOutcome | null;
  openedAt: EpochMs | null;
  resolvedAt: EpochMs | null;
  requests: number;                // judge requests in this round (latency allowance)
  activeMs: number;                // client-measured active time
  hidden: boolean;                 // page hidden or window blurred while the round was active
}

export interface RunState {
  config: RunConfig;
  phase: RunPhase;
  index: number;
  slots: RoundSlot[];
  pending: { key: IdempotencyKey; intent: RoundIntent; sentAt: EpochMs; tries: number } | null;
  error: { code: BackendErrorCode | IntentError; retryable: boolean } | null;
  score: number;
  strikes: number;
  startedAt: EpochMs;
  countdownEndsAt: EpochMs | null; // Blitz: moves forward while paused
  pausedAt: EpochMs | null;        // Blitz: tab hidden or read aloud speaking
  summary: FinishSummary | null;
}

export type RunEvent =
  | { type: 'opened'; at: EpochMs; index: number; meta?: RoundMeta; open: RoundOpen }   // meta: stream modes
  | { type: 'intent'; at: EpochMs; intent: RoundIntent; key: IdempotencyKey }
  | { type: 'verdict'; at: EpochMs; key: IdempotencyKey; verdict: RoundVerdict }
  | { type: 'failed'; at: EpochMs; key: IdempotencyKey | null; error: BackendError }
  | { type: 'retry'; at: EpochMs }
  | { type: 'continue'; at: EpochMs }
  | { type: 'finished'; at: EpochMs; summary: FinishSummary | null }
  | { type: 'tick'; at: EpochMs }
  | { type: 'visibility'; at: EpochMs; hidden: boolean }
  | { type: 'pause'; at: EpochMs; paused: boolean }
  | { type: 'resume'; at: EpochMs; snapshot: AttemptSnapshot | LocalRunSnapshot }
  | { type: 'abandon'; at: EpochMs };

export type RunCommand =
  | { kind: 'open_round'; index: number }          // sealed: backend.sealed.beginRound; local: plugin.open
  | { kind: 'judge'; index: number; intent: RoundIntent; key: IdempotencyKey; hidden: boolean; activeMs: number }
  | { kind: 'schedule_retry'; tries: number }      // the controller waits 2, 5, 10, then 30 s
  | { kind: 'resync' }                             // after 'stale': reload the snapshot
  | { kind: 'finish' }                             // sealed: backend.sealed.finish (idempotent)
  | { kind: 'persist' }                            // local runs: save LocalRunSnapshot
  | { kind: 'announce'; announcement: Announcement; politeness: 'polite' | 'assertive' }
  | { kind: 'focus'; target: 'round_heading' | 'clue_heading' | 'reveal_heading' };

export interface Transition { state: RunState; commands: RunCommand[] }
export function createRun(config: RunConfig, at: EpochMs): Transition;
export function reduceRun(state: RunState, event: RunEvent, plugins: PluginRegistry): Transition;
export function selectRunView(state: RunState, plugins: PluginRegistry): RunView;   // memo-friendly view model
```

Invariants, each one a unit test:

1. At most one intent is in flight. While `pending` is set, new intents are refused locally (the UI disables input).
2. A retry always re-sends the same idempotency key; the server returns the stored result, so a retried guess never counts twice.
3. A verdict whose key does not match `pending.key` is ignored.
4. `failed` with `retryable: false` clears `pending` and returns to `active` with the error, except `stale`, which emits `resync`.
5. Reading time never counts: `activeMs` accrues only between `opened` and `verdict 'resolved'`, and only while not hidden (client measure; the server keeps its own).
6. End rules: `fixed` finishes on the Continue after the last round; `strikes` finishes on the Continue after the `max`th wrong verdict; `clock` finishes on the first `tick` at or after `countdownEndsAt`, discarding an unresolved round (AC-BLZ-01).
7. `visibility(hidden)` during `active` or `judging` sets `slot.hidden`; in Blitz it also pauses the countdown (AC-BLZ-03).
8. Sealed runs never persist answers locally; `resume` rebuilds them from `AttemptSnapshot`. Local runs persist `LocalRunSnapshot { config, slots, score, strikes, startedAt, index }` after every verdict, so a reload resumes (AC-DLY-07 for the Daily, Back behavior for practice).

Controllers (`src/features/<mode>/model/controller.ts`) interpret commands: they call `GameBackend` or the local judge, run timers through `src/platform`, translate announcements into copy, record analytics, and expose the state to React through `useSyncExternalStore`. Controllers are framework-free TypeScript, unit-tested with the mock backend.

### 4.6 Scoring (`scoring/`)

| Rule | Function | Formula | PRD |
|---|---|---|---|
| Mystery points | `mysteryPoints(solvedOn)` | `5 - k`; 0 when missed; a voided mystery scores 4 | §4.1.2, §3.13.4 |
| Encore error | `encoreError(kind, guess, answer)` | quantity `abs(g - a) / a`; year `abs(g - a)` | §4.2.2 |
| Encore band | `encoreBand(error, bands)` | bullseye `e <= 0.05` or `d <= 2`; close `e <= 0.15` or `d <= 5`; checked on the unrounded error | §4.2.2 |
| Encore display | `formatEncoreError(error)` | "Spot on"; "under 1% off"; whole percent rounded half up ("4% off"); "over 999% off" at 999% or more; "1 year off", "3 years off" | §4.2.2 |
| Choice points | `choicePoints(correct)` | 1 or 0 | §3.3.1 |
| Run points | `runPoints(outcomes)` | sum; maximum = sum of `maxPoints` | §3.1.2 |
| Effective round time | `effectiveRoundMs(serverMs, clientMs, requests)` | `max(serverMs - 400 * requests, clientMs)`, never below 0, capped at 15 min | §4.3.2, §4.3.3 |
| Ranking | `compareRuns(a, b)`; `rankKey(run)` | points desc, then encore error asc (voided or absent: equal), then total time asc | §4.3.1 |
| Rank key (SQL parity) | `rankKey(run): bigint` | `points * 2^58 + (2^34 - 1 - errMicro) * 2^24 + (2^24 - 1 - totalMs)`, where `errMicro = min(round(error * 1e6), 2^34 - 1)` (0 when voided or absent) and `totalMs` is capped at `2^24 - 1`. Higher is better; equal keys tie. Supports up to 31 points | §4.3.1 |
| Percentile | `percentile(worse, tied, pool)` | `floor(100 * (B + 0.5 T) / (N - 1))`, shown only when `N >= 50`; `N` counts the player once | §4.3.4 |
| Offset band | `offsetBand(minutes)` | below -120: Americas; -120 to 239: Europe and Africa; 240 and above: Asia and Pacific | §4.3.4 |
| Crowd shares | `largestRemainder(counts)` | whole percentages that sum to 100 | §4.1.5 |
| Blitz | `blitzPoints(tMs, correct)` | `100 + max(0, round(50 * (1 - t / 8000)))`; 0 when wrong | §3.3.5 |
| Room Classic | `roomPoints(input)` | correct: `700 + round(300 * (1 - t / T)) + min(250, 50 * (s - 1))`, doubled on the final question; `t = clamp(max(tServer - 400, tClient), 0, T)`; wrong or none: 0 and `s` resets; voided: skipped, `s` unchanged | §4.5.1 |
| Room Accuracy | `roomPoints(input)` | correct: `1000 + min(250, 50 * (s - 1))`, doubled on the final question | §4.5.2 |
| Room grace | `roomAnswerWindow(receivedAt, deadline)` | accepted up to `deadline + 500 ms`, with speed 0 after `deadline`; later rejected | §4.5.3 |
| Room ranking | `rankRoom(seats)` | score desc, then lower sum of effective times on correct answers; equal on both share the rank | §4.5.4 |
| Head-to-head | `headToHead(a, b)` | the ranking key, reporting which key decided | §3.6.2 |
| Group week | `rankWeek(rows)` | points desc, then days played desc; equal on both share the rank | §3.7.2 |

### 4.7 Suggestions (`suggest/`)

All matching runs on the device against the cached list; nothing is sent per keystroke (PRD §4.1.3).

1. **Normalize** (`normalizeName`): Unicode NFKD, strip combining marks, lowercase, `&` to `and`, remove punctuation, collapse whitespace, trim, drop a leading `the `, `a ` or `an `. The build stores each entity's normalized name and aliases in `keys`, so phones skip that work.
2. **Match**: an entity matches when the normalized query is a prefix of a key or of any word in a key. For queries of 5 or more characters, a key or word also matches when it starts with a string within one edit (insertion, deletion, substitution or adjacent swap) of the query.
3. **Rank** tiers: exact key, canonical-name prefix, alias prefix, word prefix, typo. Ties break on `popularity` (descending), then `display` (ascending). Popularity is global, so ranking never hints at today's answer.
4. **Return** up to 6 (`SUGGESTION_COUNT`, tunable) with `alreadyGuessed` flags.
5. **Exact Enter**: `exactMatch(query)` returns the single entity whose name or alias equals the normalized text, if exactly one does.

The largest list (people, about 3,000 entities with aliases) scans in about a millisecond per keystroke; typo matching runs only from 5 characters and is bounded. A Vitest benchmark guards the budget (under 4 ms on CI for the largest fixture).

### 4.8 Practice selection (`practice/`)

```ts
export interface PracticeRequest {
  mode: 'quick' | 'category' | 'blitz' | 'survival' | 'review' | 'pack';
  category: CategoryId | 'mixed';
  difficulty: DifficultyChoice | 'ramp';
  length: number;                         // 10 for practice; stream modes ignore it
  seed: string;
  today: LocalDate;
  seen: SeenIndex;                        // ItemId -> day number last seen
  denylist: ReadonlySet<ItemId>;
  ability: AbilityState | null;           // F-ADP; null when adaptive is off
  tags?: string[];                        // monthly pack (F-PCK)
}
export interface PracticePlan { items: PracticeItem[]; notes: ('repeats_mixed_in' | 'pool_exhausted')[] }
export function planPracticeRun(pool: readonly PracticeItem[], req: PracticeRequest): PracticePlan;
export function createPracticeStream(pool: readonly PracticeItem[], req: PracticeRequest): PracticeStream;  // Blitz, Survival
```

1. **Eligible pool**: the category (or all), minus the pulled-item denylist, minus items past `reviewBy`.
2. **Bands** by predicted rate `p` (tunable): Easy `p >= 0.75`, Medium `0.45 <= p < 0.75`, Hard `p < 0.45` (AC-PRA-08). Mixed without F-ADP takes 4 Easy, 4 Medium and 2 Hard, ordered easiest to hardest.
3. **Freshness tiers**: never seen, then seen 60 or more days ago, then the least recently seen. Using the last tier adds the `repeats_mixed_in` note (AC-PRA-05, AC-PRA-06).
4. **Composition**: at most 1 true/false and 2 comparisons; the first question is never true/false and is the easiest in the run (AC-PRA-03). Selection draws with the seeded RNG and replaces any pick that would break a rule.
5. **Option order**: shuffled with the seed unless the item is `ascending` or `fixed` (AC-PRA-04).
6. **Adaptive Mixed (F-ADP)**: predicted success `1 / (1 + e^-(θ - b))` with `b = -logit(p)`; pick the item whose prediction is closest to 0.80 (band 0.75 to 0.85); one serve in ten goes to the least-sampled eligible item, never first. After each first attempt, `θ += K × (outcome - predicted)` with `K = 0.4` for the first 50 answers, then 0.1; per-category offsets once a category has 10 answers (AC-PRA-09). Packs carry each item's `samples` count from the weekly re-tune for the exploration pick.
7. **Survival** ramps Easy for questions 1 to 5, Medium for 6 to 12, Hard from 13 (tunable), and ends on 3 strikes or an empty pool. **Blitz** streams from the filters; only answered questions are marked seen.
8. **Review (F-REV)**: intervals 1, 3, 7 and 21 local days; right moves to the next interval, wrong resets to 1 day, right at 21 days marks the item learned. The queue keeps 200 items (oldest dropped); a session serves up to 10 due items, oldest due first (AC-REV-01 to 04).

### 4.9 How the Daily composition stays data-driven

A Daily is a schedule row whose `rounds` column is an ordered `RoundSpec[]`. Nothing in the code knows that v1 has three mysteries and an encore.

- **Rounds come from the plugin registry.** The run machine walks `RoundMeta[]`; each round's plugin supplies its maximum points, client state, judge and share cells. The Daily's maximum is the sum, so `[mc ×9, encore]` scores out of 9 (AC-DLY-09).
- **The UI comes from the round component registry**, keyed by family. The header's progress bar has one segment per round; labels such as "Mystery 2 of 3 · Medium" come from `RoundMeta.ordinal`, `ofType` and `difficulty`.
- **SQL dispatches on the round type.** `begin_round` and `round_action` call `private.round_open_<family>` and `private.round_judge_<family>` (§8.8). All five v1 types have SQL handlers.
- **The composition id is derived.** Each run of identical consecutive types becomes a letter and a count: mystery `m`, encore `e`, mc `c`, tf `t`, comparison `p`, ordering `o`. So `[mystery, mystery, mystery, encore]` is `m3e1`, `[mc ×9, encore]` is `c9e1`, and `[mc ×5, mystery, encore]` is `c5m1e1`. Analytics' `round_complete.composition` carries it.
- **Ranking works for any composition**: points, then the encore error (equal for everyone when the composition has no encore or the encore is voided), then time.
- **Share layouts are content.** `content/compositions.json` maps each composition id to a one-character layout code for share links (§4.10). The content build fails if a scheduled composition has no layout or cannot fit in 8 characters.

Switching to synthesis arm B is therefore a schedule change. Adding a brand-new round type is the only code change, and it needs five things: an engine plugin, a round component, the two SQL handlers, a share-cell alphabet and a content schema.

### 4.10 Share text and share codes (`share/`)

**Text** (`buildDailyShareText`): line 1 is `"[Name] Daily #42 · 9/12 · Encore 4% off"`, with `" (archive)"` after the number for archive plays and the bullseye glyph after the token inside the bullseye band. Then one row per mystery (category short name, then four glyphs); consecutive choice rounds collapse into one row labelled by DESIGN.md; the link is the last line. Glyphs come from `src/features/share/glyphs.ts` (default and high-contrast sets, owned by design). Practice, Blitz and Survival texts follow PRD §3.5.4 and link to `/practice`.

**Codes** (`share/code.ts`, owned by ENG-2): `code = layout + payload`.

- `layout` is one base36 character from `content/compositions.json` (`a` = `m3e1`).
- `payload` is a mixed-radix integer written in lowercase base36, at most 7 characters, least significant digit first in this order: the archive flag (radix 2); then for each round in layout order, a mystery's outcome (radix 6: 0 missed, 1 to 4 solved on that clue, 5 voided) and its category (radix 12), a choice round's outcome (radix 3: wrong, correct, voided), or the encore's token (radix 11,001: 0 spot on, 1 under 1% off, 2 to 999 for 1% to 998% off, 1,000 for over 999% off, 1,001 to 10,999 for 1 to 9,999 years off, 11,000 voided) and band (radix 3: none, close, bullseye).
- For `m3e1` the largest payload is `2 × 72³ × 11,001 × 3 ≈ 2.46 × 10¹⁰`, under `36⁷ ≈ 7.84 × 10¹⁰`, so every code fits `^[0-9a-z]{1,8}$` (AC-SHR-03).
- `decodeShareCode(number, code)` returns the layout, rows, score, maximum and encore token, or `null` for anything malformed (the landing then shows a generic "Play today's Daily").
- `shareAltText(decoded)` builds the preview image's alt text ("Daily #42 result: 9 out of 12. Geography solved on clue 1. ...").

Codes carry no secret and can be forged. The landing says "Someone scored", so a forged code claims nothing.

### 4.11 Streak evaluation (`streaks/`)

The engine implements PRD §4.4 as one pure function. The mock backend uses it as its "server", and the SQL copy is tested against the same scenario table.

```ts
export interface StreakInput {
  now: EpochMs;
  today: LocalDate;                                   // local date in the request's zone
  dayStart(date: LocalDate): EpochMs;                 // local 00:00 in the current zone
  offsetMinutes: number;                              // current request
  lastFinishOffsetMinutes: number | null;
  days: { date: LocalDate; status: Exclude<DayStatus, 'today'> }[];  // stored statuses, sorted
  freezesHeld: 0 | 1 | 2;
  freezeProgress: number;
  lastRepairAt: EpochMs | null;
  incidents: { start: EpochMs; end: EpochMs }[];
}
export interface StreakEvaluation {
  written: { date: LocalDate; status: 'freeze' | 'protected' | 'missed' }[];   // new gap statuses
  freezesHeld: 0 | 1 | 2;
  current: number;
  best: number;
  repair: RepairOffer | null;
  repairBlockedUntil: EpochMs | null;
  breakTooLong: boolean;
  notices: { kind: 'freeze_spent' | 'protected'; date: LocalDate }[];
}
export function evaluateStreak(input: StreakInput): StreakEvaluation;
export function applyFinish(state: StreakCounters, finish: { date: LocalDate; kind: 'on_time' | 'repair' | 'other' }): StreakCounters;
```

Steps (PRD §4.4.3 to §4.4.7): find `L`, the latest Played or Repaired date; walk the gap `L+1 .. today-1`; mark Protected where an incident overlaps the local day (or by the date-line rule for the first gap date when the offset grew by 12 hours or more since the last finish); else spend a held freeze while the streak is alive; else mark Missed and stop spending freezes in that gap. The chain ending at `L` counts Played and Repaired dates across Freeze and Protected dates. The current streak is the chain count when no gap date is Missed, otherwise 0; today never lowers it. A Missed date `M` is repairable when it is the only Missed date in its span, a chain of at least 1 ended before it, the local time is before `M+3 00:00`, and no repair happened in the last 168 hours. `applyFinish` grants a freeze on every 7th on-time finish or repair while fewer than 2 are held, and holds progress at 0 while 2 are held.

### 4.12 Other pure modules

| Module | Owner | Contents |
|---|---|---|
| `scoring/ranking.ts`, `percentile.ts`, `room.ts`, `blitz.ts` | ENG-2 | §4.6 |
| `rooms/phases.ts` | ROM-1 | The room phase machine used by the mock server (§8.11), mirroring SQL |
| `text/moderation.ts` | MOD-1 | `foldText`, `normalizeForFilter` (case, diacritics, swaps such as 0 for o and @ for a, repeated letters, separators), `isBlocked(text, terms)`; the term list is a lazy chunk |
| `quiz-lint/` | EDT-1 | Blocking checks and L1 to L8 (PRD §3.9.4) |
| `quiz-import/` | EDT-2 | Format A blocks and RFC 4180 CSV with delimiter detection and BOM stripping (PRD §3.9.3); lazy-loaded |
| `achievements/` | MAS-1 | Table-driven rules for A01 to A30 over server stats and device stats |
| `mastery/` | MAS-1 | Tier rules over first attempts at distinct items (PRD §3.4.4) |
| `share/` | DLY-1 (text), ENG-2 (codes), SHR-1 (final) | §4.10 |

### 4.13 Parity fixtures (`src/engine/fixtures/`)

One JSON table per rule set, written once from the PRD and replayed in two places: Vitest (against the engine) and SQL (against the RPCs, through tests that `scripts/sql/gen-parity.ts` generates into `supabase/tests/generated/`).

| Fixture | Rows | PRD source |
|---|---|---|
| `mystery-scoring.json` | Every row of PRD §4.1.7, plus invalid and duplicate guesses | §4.1 |
| `encore.json` | Every row of PRD §4.2.4, plus parse failures and year cases | §4.2 |
| `ranking.json` | The 12 head-to-head pairings of AC-CHL-05, including an exact tie | §4.3.1 |
| `percentile.json` | Pools at 49 and 50, ties, flagged players, bands | §4.3.4 |
| `streaks.json` | S1 to S10, AC-RPR-01 to 04, AC-FRZ-01 to 05, AC-INC-03 | §4.4 |
| `room-scoring.json` | Every row of PRD §4.5.5, grace boundaries at 400 and 600 ms (AC-ROM-08), voids | §4.5 |
| `moderation.json` | Listed terms under each normalization, 100 allowlist words (AC-LNT-03) | §3.9.4 |
| `share-codes.json` | Round trips, maximum values, malformed codes | §3.5 |

---

## 5. Content pipeline

### 5.1 Sources

Everything the product says lives under `content/` as JSON, one item per file, so many writer and checker agents can work at once without merge conflicts. CONTENT_GUIDE.md owns how items are written and checked; this section owns formats, validation and outputs.

**Practice item** (`content/practice/geography/p.geo.0042.json`, plaintext, ships to clients after the build):

```json
{
  "id": "p.geo.0042",
  "status": "active",
  "format": "mc",
  "category": "geo",
  "stem": "What is the capital of Australia?",
  "answer": "Canberra",
  "wrong": ["Sydney", "Melbourne", "Perth"],
  "order": "shuffle",
  "explanation": "Canberra was built as a compromise between Sydney and Melbourne.",
  "learnMore": "Canberra",
  "tags": ["capitals"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 2,
  "predicted": { "p": 0.62, "spread": 0.12, "estimator": "v0" },
  "verification": [
    { "checker": "check-07", "checkedAt": "2026-11-03", "verdict": "pass", "method": "dataset",
      "evidence": "capital: Canberra", "sourceRef": "npm:<package>@<version>/<file>#AUS" },
    { "checker": "check-12", "checkedAt": "2026-11-03", "verdict": "pass", "method": "reasoned",
      "evidence": "Independent recall cross-checked against the dataset record", "sourceRef": null }
  ]
}
```

True/false items use `"format": "tf", "answer": true`; comparisons use `"format": "comparison", "stem": "Which came first?", "a": "...", "b": "...", "answer": "a"`. The build turns all three into the `ChoiceItem` shape of §3.2. Verification records follow memo §10: two independent checks, structured facts checked against datasets on npm or raw.githubusercontent.com where possible, no fabricated sources, uncertain items cut.

**Mystery and Encore** (sealed): the same shape as `MysteryContent` and `EncoreContent` (§3.2), plus `status` and `verification`, where a mystery's verification covers the key and each clue.

**Schedule** (sealed, `content/sealed/schedule/2026-12.json` after decryption):

```json
{ "track": "main", "dailies": [
  { "date": "2026-12-01",
    "rounds": [
      { "type": "mystery", "difficulty": "easy",   "contentId": "m.geo.0001" },
      { "type": "mystery", "difficulty": "medium", "contentId": "m.film.0007" },
      { "type": "mystery", "difficulty": "hard",   "contentId": "m.sci.0003" },
      { "type": "encore",  "difficulty": null,     "contentId": "e.0001" }
    ] } ] }
```

Daily numbers are never authored; they come from `DAILY_EPOCH` in `src/config/shared.json`.

**Answer list** (`content/answer-lists/country.json`, plaintext):

```json
{ "type": "country", "version": "2026-11-01",
  "provenance": [ { "source": "npm:<package>@<version>", "license": "<license>", "retrievedAt": "2026-11-01" } ],
  "entities": [ { "id": "Q408", "name": "Australia", "display": "Australia",
                  "aliases": ["Commonwealth of Australia"], "popularity": 280 } ] }
```

**Room pack** (sealed): `{ "id": "around-the-world", "title": "...", "theme": "...", "questions": [ 15 sealed choice items ] }`.

### 5.2 Validation (`src/content/schema/`, zod 4, build-time only)

| Level | Rules |
|---|---|
| Shape | Every file parses against its zod schema; unknown keys fail; ids match their file name and prefix |
| Item | Explanation 35 words or fewer; stem under 120 characters (warning above); mc has 3 or 4 distinct options and never "all/none of the above"; tf and comparison have exactly 2; `order: ascending` only when every option parses as a number or date; `volatility: slow` needs `reviewBy`; `fast` is refused; numeric dates such as `03/04` are refused (L6) |
| Mystery | Four clues of 140 characters or fewer; no clue contains the answer's name or any alias after `normalizeName`; answer, accepted ids and distractors exist on the type's list and differ; the list has 30 or more entities for slot 1 and 100 or more for slots 2 and 3 |
| Encore | `answer > 0`; decimals 0 to 2; years are whole numbers from 1 to 9999; custom bands satisfy `bullseye < close` |
| Verification | At least two records with `verdict: pass` from different checkers; every record names a method; sealed items carry the stored passages |
| Pool | At most 10% true/false per category pack; at least 100 active items per category at launch (warning before); 40 kB gzipped per pack, 400 kB for all packs; 80 kB gzipped per list; a near-duplicate check on normalized stems |
| Schedule | One Daily per date with no gaps from the epoch to the last scheduled date; three different categories per Daily; Mystery 1, 2 and 3 have slots 1, 2 and 3; Film & TV, Music or Food & Drink in at least 4 of every 7 Dailies; `global` items only; no item repeats within 365 days; every composition has a share layout that fits 8 characters (§4.9); a runway warning below 30 Dailies |
| Packs | Room packs hold exactly 15 sealed choice items |

### 5.3 Build outputs (`npm run content:build`, `scripts/content/build.ts`)

| Output | Path | Notes |
|---|---|---|
| Practice packs | `public/content/packs/<category-slug>.<hash8>.json` | `{ category, version, items: ChoiceItem[] }`, active items only, verification stripped |
| Answer lists | `public/content/lists/<type>.<hash8>.json` | `AnswerList` with precomputed `keys` |
| Manifest | `src/content/generated/manifest.ts` | Hashed URLs for every pack and list, item counts, content version. Imported by loaders and the service worker config |
| Categories, names | `src/content/generated/categories.ts`, `names.ts` | Static modules |
| Category pages | `src/content/generated/category-pages.ts` | Intro copy and one sample item per category (F-CAT) |
| Moderation terms | `src/content/generated/moderation.ts` | Loaded lazily by `text/moderation.ts` |
| Mock fixtures | `src/backend/mock/fixtures.generated.ts` | From `content/fixtures/` only, never from `content/sealed/` |
| Non-secret SQL loads | `supabase/seed/answer-entities.sql`, `practice-items.sql`, `config.sql`, `moderation.sql`, `e2e-track.sql` | Idempotent upserts, committed |

Outputs are deterministic and committed. CI rebuilds them into a temporary directory and fails on any difference, so a content change without a rebuild never merges. `src/config/shared.json` holds the values both sides must agree on (`dailyEpoch`, `crowdThreshold: 50`, `percentileThreshold: 50`, `encoreBands`, `latencyAllowanceMs: 400`, `roundCapMs: 900000`, `optionsFromClue: 4`), and the build turns it into `supabase/seed/config.sql`.

### 5.4 Sealed content: encrypted at rest, loaded through MCP

- **Format.** Each sealed file is `content/sealed/<kind>/<id>.json.enc` holding `{ "v": 1, "alg": "A256GCM", "kid": "k1", "iv": "<base64>", "data": "<base64>", "tag": "<base64>" }`. The IV is the first 12 bytes of `HMAC-SHA256(k_iv, plaintext)`, so unchanged plaintext gives unchanged ciphertext and clean diffs; reusing an IV only for identical messages is safe.
- **Keys.** Two 32-byte keys derived with HKDF from one master key, read from `QZ_CONTENT_KEY` (base64) or from `~/.config/quiz-web-app/content.key`, never from the repo. The orchestrator creates the key once (SQL-3) and the launch report tells the owner to store it in a password manager and add it as the `QZ_CONTENT_KEY` GitHub secret.
- **Workflow.** `npm run content:unseal` decrypts into `content/.sealed-plain/` (git-ignored). Writers and checkers work there. `npm run content:seal` encrypts every changed file back into `content/sealed/`. A check (`scripts/checks/secret-scan.mjs`, run by `npm run check` and in CI) fails if any file under `content/sealed/` is not an envelope or if `content/.sealed-plain/` is tracked.
- **Release.** `npm run content:release -- --version <n>` decrypts in memory, validates, and writes `supabase/.generated/content-release-<n>.sql` (git-ignored): upserts into `private.mysteries`, `encores`, `sealed_questions`, `dailies`, `daily_spares`, `room_packs`, then a row in `private.content_releases` with the content hash. The orchestrator applies it with MCP `execute_sql`, in chunks of 400 kB or less, inside one transaction per chunk. Scheduled Dailies already frozen (§8.7) are refused by the loader unless `--allow-frozen` is passed for a correction.
- **Never in a bundle.** Clients never receive sealed item ids (`RoundMeta` has none). After every build, `scripts/checks/lazy-markers.mjs` also scans `.next/static` for sealed ids (`(?<!fx\.)\b(m\.[a-z]+\.\d{4}|e\.\d{4}|r\.[a-z-]+\.\d{2})\b`) and, when the key is present, for any clue text. Either finding fails CI.
- **Upgrade path.** If the owner makes the repository private, `QZ_SEALED_PLAINTEXT=1` lets the scripts read plaintext files and the encryption steps become no-ops. Nothing else changes.

### 5.5 Answer lists

Lists come from open datasets (Wikidata, CC0, preferred; npm and GitHub datasets with compatible licenses otherwise), imported by small per-source scripts in `scripts/content/lists/` that record provenance. The content team reviews aliases (both spellings where English varies, short forms, transliterations). The build precomputes `keys` with the engine's `normalizeName`, so the device and the build normalize identically. `supabase/seed/answer-entities.sql` loads `(answer_type, entity_id, display)` so `round_action` can refuse ids that are not on the list. Lists are global and never filtered per Daily (PRD §3.18.4).

### 5.6 Fixtures (`content/fixtures/`)

Fake but well-formed content, prefixed `fx.`: 40 practice items across four categories (including true/false and comparisons), six mysteries and three encores cycled into a Daily for every date, the compositions `[mc ×9, encore]` and `[mc ×5, mystery, encore]` on two fixed dates for AC-DLY-09, one 15-question room pack, and small answer lists (countries, films, elements). The mock backend, unit tests, the greybox and the real database's `e2e` track all use them.

### 5.7 How CI validates content

| Step | Where | What |
|---|---|---|
| `npm run content:check` | `verify` job | Schemas and cross-file rules for plaintext content and fixtures; generated-output drift check |
| `npm run content:check -- --sealed` | `content-sealed` job, only when the `QZ_CONTENT_KEY` secret exists | Decrypts in memory, validates sealed items and the schedule; prints "Sealed content validation: not run (QZ_CONTENT_KEY is not set)" otherwise |
| `scripts/checks/secret-scan.mjs` | `verify` job | Envelope-only sealed directory, no key files, no plaintext workspace |
| Bundle scan | `verify` job, after `next build` | No sealed ids or clue text in `.next/static` |

### 5.8 Commands

| Command | Does |
|---|---|
| `npm run content:build` | Validate, then write every output in §5.3 |
| `npm run content:check` | Validate and drift-check without writing |
| `npm run content:unseal` / `content:seal` | Decrypt to, or encrypt from, `content/.sealed-plain/` |
| `npm run content:release -- --version <n>` | Generate the sealed release SQL |
| `npm run content:lists -- --type <type>` | Re-import one answer list from its recorded sources |

---

## 6. Client persistence

### 6.1 The storage layer (`src/platform/storage/`)

- `kv.ts` wraps `localStorage` with try/catch on every call, JSON decoding through per-key decoders, a quota-error path that drops the least valuable caches first, and an in-memory fallback when storage is missing (some private windows, unit tests). Every key starts with `qz:`.
- **Device namespaces for tests.** In mock builds only, a page that sets `window.__QZ_DEVICE__ = 'phone3'` before load gets keys prefixed `qz:d:phone3:`. That is how one browser context holds several "devices" for room tests (§11.4). The mock database (`qz-mock:*` keys) is never namespaced, so those devices share one server. Supabase builds ignore the flag.
- `schema.ts` declares `STORAGE_VERSION`, every key, its decoder and its owner. `migrations.ts` holds ordered, idempotent migrations `{ from, to, run(kv) }`. They run once at boot, before any feature reads storage, inside a `navigator.locks` request so two tabs never migrate at once.
- **Failure rules.** A key that fails to decode is moved to `qz:quarantine:<key>` and reset; the rest of storage stays. Identity is never deleted by a migration. Each migration has a unit test that feeds it a snapshot from the previous version.

### 6.2 Keys

| Key | Contents | Owner | Cap | Server copy |
|---|---|---|---|---|
| `qz:meta` | `{ storageVersion, createdAt, migratedAt }` | CORE-0 | tiny | none |
| `qz:identity` | `LocalIdentity` | IDN-1 | tiny | hash of the secret; the backup cookie holds the plaintext |
| `qz:profile` | Cached `Profile` (friendly name, nickname, age band) | IDN-1 | tiny | truth is the server |
| `qz:sync` | The sync code as shown at `/me/sync` | IDN-2 | tiny | hash only |
| `qz:settings` | `Settings` (below) | CORE-0 store, SET-1 UI | tiny | none (the age band lives in the profile) |
| `qz:practice` | Seen index (`ItemId` to day number), best scores per mode and length, ability θ and offsets, monthly-pack progress | PRA-2, BLZ-1, REV-1 | about 40 kB at 1,500 items | none (lost with storage; accepted in v1) |
| `qz:review` | Review queue, at most 200 items | REV-1 | about 15 kB | none |
| `qz:mastery` | First-attempt counters per category | MAS-1 | small | none; achievements unlocked are recorded server-side |
| `qz:runs:<runId>` | `LocalRunSnapshot` of an unfinished local run | PRA-1 | one per run, the newest 3 kept | none |
| `qz:history` | The last 100 local run summaries for results and stats | PRA-1 | about 30 kB | none |
| `qz:cache:daily` | Last `DailyTodayCard`, `StreakState`, `PlayerServerStats`, and the player's own last results, with `fetchedAt` | DLY-2, STK-1, STA-1 | small | truth is the server |
| `qz:cache:groups`, `qz:cache:challenges` | Last fetched lists and boards for offline display | GRP-1, CHL-1 | small | truth is the server |
| `qz:denylist` | Pulled practice item ids and their version | PRA-2 | small | truth is the server |
| `qz:outbox` | Queued analytics events (at most 200), reports, hearts and practice answers, each with its idempotency key | PRA-2 (mechanism), ANA-1, RPT-1 | 200 events, 50 reports | delivered, then removed |
| `qz:offers` | Offer-card history: shown and dismissed dates, counts, first-Daily hints seen, survey last shown | DLY-3 and offer owners | tiny | none |
| `qz:drafts:<localId>`, `qz:drafts:index` | Editor drafts (Beta) | EDT-1 | 50 drafts | server copy after save |
| `qz:seats:<roomId>` | Seat token for one room (Beta) | ROM-3 | pruned after 24 h | hash only |

Session storage: `qz:session` (analytics session id for the tab), `qz:practice-intent` (the next practice run's request), `qz:server-clock` (offset samples).

```ts
export interface Settings {
  v: 1;
  theme: 'system' | 'light' | 'dark';
  motion: 'system' | 'on' | 'off';           // "Reduce motion"
  sound: boolean;                             // false by default (host screen keeps its own toggle)
  haptics: boolean;
  readableText: boolean;
  highContrast: boolean;
  readAloud: boolean;
  stopwatch: 'shown' | 'hidden';
  shortcuts: boolean;                         // true by default
  autoAdvance: boolean;
  timerAnnouncements: boolean;
  practiceDifficulty: DifficultyChoice;       // remembered per device, 'mixed' by default
}
```

The root layout's inline boot script (DS-1, §10.3) reads `qz:settings` before first paint and sets `data-theme`, `data-motion`, `data-readable` and `data-contrast` on `<html>`.

### 6.3 The outbox (`src/platform/outbox/`)

Reports, hearts, analytics events and practice answers may queue offline (PRD §3.0.2); nothing else does. Each entry carries a client-generated UUID that the server keeps under a unique constraint, so a resend is harmless. The outbox flushes on `online`, on `visibilitychange` to hidden (with `fetch` `keepalive` for analytics), every 10 s while it holds analytics events, and at 20 events. Entries that fail with `invalid_input` are dropped and counted in `client_error`; `rate_limited` waits for `retryAfterMs`.

### 6.4 Several tabs

`src/platform/broadcast.ts` opens one `BroadcastChannel('qz')` and also listens to `storage` events. Messages: `identity_changed`, `settings_changed`, `daily_finished`, `streak_changed`, `outbox_flushed`. A tab that receives `daily_finished` refetches its home card. A stale tab that submits a Daily action gets `stale` from the server and re-renders the current state (PRD §3.1.3).

### 6.5 What lives where

| Data | Source of truth | Device | Survives cleared storage? |
|---|---|---|---|
| Identity | Server (hash) | `qz:identity` + backup cookie | Yes, through the cookie, a sync code or a claim |
| Daily attempts, streaks, freezes, repairs, protected dates | Server | Cache only | Yes |
| Group memberships, boards, challenges | Server | Cache only | Yes |
| Achievements unlocked | Server (`record_achievements`) | Progress computed locally | Unlocks yes, partial progress no |
| Practice history, seen index, bests, review queue, ability, mastery counters | Device | `qz:practice`, `qz:review`, `qz:mastery` | No (accepted for v1, PRD §3.3.7) |
| Practice first attempts for calibration | Server aggregate | Outbox until sent | Sent ones yes |
| Settings | Device (age band also on the server) | `qz:settings` | Age band only |
| Offer-card history | Device | `qz:offers` | No (a card may show again) |
| Editor drafts | Device until saved, then server | `qz:drafts:*` | Saved quizzes yes |
| Room seat | Server (hash) | `qz:seats:<roomId>` | No (the phone joins as a new player) |

---

## 7. The backend interface (`src/backend`)

### 7.1 Principles

- **One interface, three implementations.** `supabase`, `mock` and `off`, picked by `NEXT_PUBLIC_BACKEND_MODE` at build time (constraint 2). Features import only `@/backend` (`getBackend()` and the types).
- **Results, not exceptions.** Every method resolves to `Result<T>` (§3.11). Expected failures never throw. A thrown error is a bug and is reported as `client_error`.
- **Identity is implicit.** The backend is built with an `IdentityProvider` and adds the player id and secret to every call that needs them. Feature code never handles secrets.
- **Callers own idempotency and retries.** Writes take an `IdempotencyKey` from the caller; controllers decide when to retry, and always with the same key. The backend itself never retries a write.
- **Every response carries server time.** The implementation feeds it to the server clock (§4.3) before returning.
- **Nothing here is in the initial bundle.** `getBackend()` loads the chosen implementation with `import()`; `prefetchBackend()` warms it at idle after first paint and on `pointerdown` of any Play button.

```ts
// src/backend/index.ts
export function getBackend(): Promise<GameBackend>;   // a memoized promise, one instance per tab
export function prefetchBackend(): void;

// src/platform/identity/provider.ts (used by the backend; DLY-1 implements minting, IDN-1 completes it)
export interface IdentityProvider {
  current(): LocalIdentity;          // mints on first use; never null
  markRegistered(): void;            // after the first successful write; triggers the cookie backup
  replace(next: LocalIdentity): void; // after a sync-code or claim restore
}
```

### 7.2 `GameBackend`

```ts
// src/backend/types.ts
type R<T> = Promise<Result<T>>;
export interface BrowserContextInfo { context: BrowserContextKind; app: AppTag; platform: Platform }
export type AppTag = 'whatsapp' | 'instagram' | 'facebook' | 'messenger' | 'tiktok' | 'snapchat'
  | 'linkedin' | 'telegram' | 'google' | 'other' | 'none';
export type NicknameInput = { custom: string } | { generated: string };

export interface GameBackend {
  readonly mode: 'supabase' | 'mock' | 'off';
  readonly identity: IdentityApi;
  readonly sealed: SealedRunApi;      // Daily, archive, challenge, pack and shared-quiz plays
  readonly daily: DailyApi;
  readonly streaks: StreakApi;
  readonly stats: StatsApi;
  readonly challenges: ChallengeApi;
  readonly groups: GroupApi;
  readonly rooms: RoomApi;            // Beta
  readonly quizzes: QuizApi;          // Beta
  readonly reports: ReportApi;
  readonly practice: PracticeSyncApi;
  readonly analytics: AnalyticsApi;
  readonly health: HealthApi;
}

export interface IdentityApi {
  /** Writes register implicitly; this exists for flows that need a profile before any write. */
  register(browser: BrowserContextInfo): R<Profile>;
  getProfile(): R<Profile>;
  setAgeBand(band: AgeBand, moment: AgeMoment): R<Profile>;
  setNickname(nickname: NicknameInput): R<Profile>;              // custom text needs the 18+ band
  createSyncCode(): R<{ code: SyncCode; createdAt: EpochMs }>;   // replaces the previous code
  redeemSyncCode(code: string, newSecret: Secret): R<RestoredProfile & { playerId: PlayerId }>;
  createClaim(): R<{ token: ClaimToken; expiresAt: EpochMs }>;
  peekClaim(token: ClaimToken): R<ClaimPreview>;
  redeemClaim(token: ClaimToken, newSecret: Secret): R<RestoredProfile & { playerId: PlayerId }>;
  exportData(): R<ServerDataExport>;
  deletePlayer(): R<void>;
}

export interface SealedRunApi {
  start(source: SealedSource, ctx: { tz: TimeZone; browser: BrowserContextInfo; appVersion: string }): R<AttemptSnapshot>;
  get(attemptId: AttemptId): R<AttemptSnapshot>;
  beginRound(attemptId: AttemptId, index: number): R<{ open: RoundOpen; serverTime: EpochMs }>;
  act(input: {
    attemptId: AttemptId;
    index: number;
    step: number;                  // the clue number (mystery) or 1; a mismatch returns 'stale'
    intent: RoundIntent;
    clientActiveMs: number;
    hidden: boolean;               // honest-play report for this round so far
    key: IdempotencyKey;
  }): R<{ verdict: RoundVerdict; finished: FinishSummary | null; serverTime: EpochMs }>;
  finish(attemptId: AttemptId): R<FinishSummary>;   // idempotent; the last act() already finishes
}

export interface DailyApi {
  today(tz: TimeZone): R<DailyTodayCard>;                 // callable before any identity exists
  results(attemptId: AttemptId): R<DailyResults>;
  numbers(attemptId: AttemptId): R<{                      // "so far today": refetched on every visit
    percentile: PercentileView;
    histogram: ScoreHistogram | null;
    crowd: (MysteryCrowd | EncoreCrowd | ChoiceCrowd | null)[];   // one per round
  }>;
  archive(tz: TimeZone): R<ArchiveListing>;   // repair is not a separate call: finishing an archive
}                                             // attempt of a repairable date repairs the streak (§8.10)

export interface StreakApi {
  get(tz: TimeZone): R<StreakState>;                      // evaluates gaps on the server, idempotent
  acknowledge(ids: NoticeId[]): R<void>;
}

export interface StatsApi {
  get(tz: TimeZone): R<PlayerServerStats>;
  recordAchievements(ids: AchievementId[]): R<{ newlyRecorded: AchievementId[] }>;
}

export interface ChallengeApi {
  create(attemptId: AttemptId): R<{ code: ChallengeCode; expiresAt: EpochMs }>;
  landing(code: ChallengeCode, tz: TimeZone): R<ChallengeLanding>;   // callable without identity
  headToHead(code: ChallengeCode): R<HeadToHead>;
  rematch(code: ChallengeCode, tz: TimeZone): R<{ code: ChallengeCode }>;
  shelf(): R<ChallengeShelf>;
  participants(code: ChallengeCode): R<ChallengeParticipants>;      // the challenger only
}

export interface GroupApi {
  create(input: { name: string; nickname: NicknameInput }): R<{ group: GroupSummary; invite: InviteCode }>;
  preview(invite: InviteCode): R<GroupInvitePreview>;               // callable without identity
  join(invite: InviteCode, nickname: NicknameInput): R<GroupSummary>;
  list(): R<GroupSummary[]>;
  board(groupId: GroupId, tz: TimeZone): R<GroupBoard>;
  invite(groupId: GroupId): R<{ invite: InviteCode }>;
  setNickname(groupId: GroupId, nickname: NicknameInput): R<GroupSummary>;
  admin(groupId: GroupId, action: GroupAdminAction): R<{ group: GroupSummary; invite: InviteCode | null }>;
  leave(groupId: GroupId): R<void>;
}

export interface RoomApi {
  create(input: { source: RoomSource; settings: RoomSettings }): R<{ roomId: RoomId; code: RoomCode; hostToken: HostToken }>;
  join(input: { code: RoomCode; seatToken: SeatToken | null; method: 'qr' | 'code' }):
    R<{ roomId: RoomId; seatId: SeatId; seatToken: SeatToken; name: string; rejoined: boolean }>;
  shuffleName(roomId: RoomId, seat: SeatToken): R<{ name: string }>;
  heartbeat(roomId: RoomId, seat: SeatToken): R<{ version: number }>;
  playerState(roomId: RoomId, seat: SeatToken): R<RoomPlayerView>;
  hostState(roomId: RoomId, host: HostToken): R<RoomHostView>;
  hostAction(roomId: RoomId, host: HostToken, action: RoomHostAction, expectedVersion: number): R<RoomHostView>;
  answer(input: { roomId: RoomId; seat: SeatToken; questionIndex: number; option: number;
                  clientMs: number; key: IdempotencyKey }): R<{ accepted: boolean; late: boolean }>;
  leave(roomId: RoomId, seat: SeatToken): R<void>;
  /** Hints only. Returns an unsubscribe function. The sync controller adds polling (§8.11). */
  subscribe(roomId: RoomId, audience: 'players' | 'host',
            on: { hint(hint: RoomHint): void; status(status: 'live' | 'down'): void }): () => void;
}

export interface QuizApi {
  listMine(): R<UserQuiz[]>;
  save(draft: QuizDraft): R<UserQuiz>;                     // 'conflict' carries the server copy in error.current
  remove(quizId: QuizId): R<void>;
  share(quizId: QuizId, confirm: { adult: true; policy: true }): R<{ code: QuizShareCode }>;
  unshare(quizId: QuizId): R<void>;
  landing(code: QuizShareCode): R<SharedQuizLanding>;      // callable without identity
}

export interface ReportApi {
  submit(input: ReportInput): R<{ stored: boolean }>;      // stored: false for a duplicate
  heart(input: HeartInput): R<void>;
}

export interface PracticeSyncApi {
  uploadAnswers(batch: {
    itemId: ItemId; correct: boolean; option: number; timeBucket: '0-5' | '5-15' | '15-30' | '30+';
    mode: RunMode; clientId: IdempotencyKey;
  }[]): R<{ accepted: number }>;                           // at most 50 per call
  pulledItems(sinceVersion: number): R<{ version: number; itemIds: ItemId[] }>;
}

export interface AnalyticsApi {
  log(batch: (EventEnvelope & { props: Record<string, unknown> })[]): R<{ accepted: number }>;  // at most 50
}

export interface HealthApi {
  status(): R<ServiceStatus>;
}
```

Shared-quiz play and pack play go through `sealed.start({ kind: 'quiz', code })` and `sealed.start({ kind: 'pack', packId })`, so every sealed mode uses one protocol.

### 7.3 Error codes

The same strings come back from SQL (§8.4), from the mock and from transport mapping.

| Code | Retryable | Raised when | What the UI does |
|---|---|---|---|
| `offline` | yes | The device is offline | Feature offline copy; inputs that need the server disable |
| `unreachable` | yes | Fetch failed while online, HTTP 5xx, gateway errors | Counted by the health monitor; two in 30 s show the unreachable banner (AC-INC-02) |
| `timeout` | yes | No response within 8 s | "Checking..." from 1.5 s, then the error state with Retry |
| `unavailable` | no | `off` mode | "This feature isn't available on this server." |
| `feature_disabled` | no | A Beta flag is off server-side | Entry points stay hidden |
| `auth_failed` | no | Wrong or pruned credential | Try the cookie restore once; then a new identity, explained in plain words |
| `rate_limited` | after `retryAfterMs` | SQL caps or HTTP 429 from the pre-request check | The PRD's copy for that action |
| `limit_reached` | no | Quotas: 10 Groups, 50 quizzes, 20 challenges a day | The PRD's copy |
| `invalid_input` | no | Validation failed | Inline message |
| `invalid_entity` | no | A guess that is not on the list | Treated as `stale` (a client bug) |
| `already_guessed` | no | A repeat guess | "Already guessed" on the chip; nothing consumed |
| `blocked_text` | no | The slur filter matched | "Please choose different wording." or "Please choose a different name." |
| `age_required` | no | The action needs the age band | Opens the age-band question |
| `age_forbidden` | no | The band does not allow the action | The PRD's copy for that band |
| `not_found` | no | Unknown code, attempt or group | The invalid-link copy |
| `stale` | no | Step mismatch or a stale tab | Re-render from `error.current` |
| `conflict` | no | Version mismatch (quiz save, host action) | The conflict copy |
| `already_played` | no | One attempt per player per date | Show that result |
| `expired` | no | Challenge after 30 days; claim after 10 minutes | The expired copy |
| `not_open` | no | A challenged date after the reader's local date | The unlock countdown |
| `full` | no | Group 50, challenge 50, room 20 | The full copy |
| `locked`, `removed`, `ended` | no | Room states | The room copy |
| `not_member` | no | A Group read by a non-member | "You're no longer in this group." |
| `no_daily` | yes | No published Daily for the date (our failure; the server records an incident) | The outage copy; the date is protected |
| `internal` | yes | Unexpected exception | Generic error with Retry and the reference id |

### 7.4 The mock implementation (`src/backend/mock/`)

**Purpose.** Local development without network, every Playwright test, and the component and controller tests. It is a small in-page "server" that follows the same rules as SQL, built from the same engine modules.

| Part | Responsibility |
|---|---|
| `store.ts` | `MockStore` with `read(fn)` and `write(fn)`. The database is one JSON document under `localStorage['qz-mock:db:v1']`. Every write runs inside `navigator.locks.request('qz-mock-db')`, reloads the document, applies the change, saves it and posts `{ type: 'db_changed', tables }` on `BroadcastChannel('qz-mock')`. `createMemoryStore()` is the variant for unit tests |
| `context.ts` | `MockContext { store, clock, rng, controls, emitHint }`. Clock: the page clock, so Playwright's `page.clock` moves the server too. RNG: seeded from `__QZ_MOCK_INIT__.seed` (default `'qz'`), so ids and codes repeat run to run |
| `server/<area>.ts` | One file per `GameBackend` area. Each implements the SQL rules with engine code: plugin judge halves, `evaluateStreak`, `rankKey` and `percentile`, room phases and scoring, moderation. Sealed content comes from `fixtures.generated.ts` |
| `controls.ts` | `window.__qzMock`, attached only in mock builds |
| `realtime.ts` | Room hints on `BroadcastChannel('qz-mock-rt')`, filtered by topic, so several pages in one browser context play one room (AC-ROM-01 in mock form) |

Internal helpers are shared between areas through exports, never by editing another area's file. The sealed area exports `createAttempt(ctx, { kind, dailyNumber, ranked, source })` and `finishAttempt(ctx, attemptId)`; the challenge and archive logic call them.

```ts
// src/backend/mock/controls.ts (typed for tests in e2e/support/mock.ts)
export interface MockControls {
  reset(): Promise<void>;
  seed(scenario: MockScenario): Promise<void>;
  failNext(method: MockMethod, code: BackendErrorCode,
           opts?: { times?: number; when?: Record<string, unknown> }): void;   // e.g. when { questionIndex: 6 }
  setLatency(ms: number): void;                    // default 30 ms, so async paths really run
  setReachable(reachable: boolean): void;          // false: every call fails 'unreachable'
  setRealtime(state: 'live' | 'down'): void;       // 'down': hints stop; subscribers get status 'down'
  addFinishers(dailyNumber: DailyNumber, count: number, spec?: FinisherSpec): Promise<void>;  // crowds
  setServiceState(status: Partial<ServiceStatus>): Promise<void>;
  addIncident(start: EpochMs, end: EpochMs): Promise<void>;
  inspect<T = unknown>(path: string): T;           // read-only, e.g. 'attempts' or 'rooms.<id>'
  responses(): { method: MockMethod; at: EpochMs; payload: unknown }[];        // for sealed-payload assertions
}

export type MockScenario =
  | 'fresh' | 'returning_streak_9_one_freeze' | 'streak_23_missed_yesterday' | 'two_freezes_three_missed'
  | 'repair_used_5_days_ago' | 'finished_today' | 'in_progress_mystery_2' | 'in_app_first_finish'
  | 'group_of_4' | 'challenge_received' | 'room_lobby_5_seats' | 'editor_with_quiz';
```

Pages read `window.__QZ_MOCK_INIT__ = { scenario, seed, failures, latencyMs, realtime }`, which E2E sets with `page.addInitScript` before the app loads, so a scenario applies on the very first render. `navigator.onLine === false` makes every mock call fail with `offline`, so `context.setOffline(true)` behaves as it would against Supabase.

The mock bundles fixture content only. It is a separate chunk that `getBackend()` loads only in mock builds, and the bundle scan (§5.4) proves no real sealed id is in it.

### 7.5 The Supabase implementation (`src/backend/supabase/`)

| Part | Responsibility |
|---|---|
| `client.ts` | Lazily imports `@supabase/supabase-js` and calls `createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { worker: true } })` once per tab. SQL-1 also points `src/lib/supabase/browser.ts` at this configuration (no `@supabase/ssr` in the browser), so no auth storage or cookie can be written (AC-CKE-04). `worker: true` keeps room heartbeats alive in background tabs; its worker comes from a Blob URL [verified in `realtime-js` 2.118.0], so the CSP needs `worker-src 'self' blob:` |
| `rpc.ts` | `call<T>(fn, args, decode, opts)`: adds `p_player` and `p_secret` for authenticated RPCs, aborts after 8 s, maps the envelope and transport errors to `BackendError`, feeds `server_time` to the server clock, reports failures to the health monitor (§10.6), and calls `identity.markRegistered()` after the first successful write |
| `decode.ts` | Small hand-written decoders (no zod in the browser) that check required fields and map snake_case to camelCase. A decode failure becomes `internal` plus a `client_error` event |
| `realtime.ts` | `subscribeRoom(roomId, audience, handlers)`: one public channel per room, `room:<id>` for players or `roomhost:<id>` for the host, `{ config: { private: false, broadcast: { self: false } } }`, listening to broadcast event `hint`. Status `SUBSCRIBED` maps to `live`; `CHANNEL_ERROR`, `TIMED_OUT` and `CLOSED` map to `down`. Unsubscribing calls `removeChannel` |
| `<area>.ts` | One adapter per `GameBackend` area, written by the SQL ticket that writes the area's RPCs |

**Transport mapping.** A rejected `fetch` while `navigator.onLine` is false becomes `offline`; while it is true, `unreachable`. HTTP 429 (from the pre-request check, §8.6) becomes `rate_limited` with `retryAfterMs` from the response details. HTTP 5xx becomes `unreachable`. A 200 response with `{ ok: false, code }` becomes that code. Anything else is `internal`.

**Contract tests.** `src/backend/contract/<area>.contract.ts` defines one behavioral suite per area against the `GameBackend` interface. `*.mock.test.ts` runs it against the mock in every `npm test`. `*.real.test.ts` runs the same suite in Node against the real project only when `QZ_REAL_BACKEND=1`, which the `backend-contract` GitHub workflow sets (SQL-1 creates it). Each suite uses test identities (§8.17). Each mock area exports `MOCK_CAPABILITIES`, the methods it really implements, and the mock run skips the rest, so a SQL ticket can land its suite before the feature ticket that builds the matching mock behavior. These suites are how the mock and SQL stay honest with each other.

### 7.6 The off implementation (`src/backend/off/`)

Every method resolves `{ ok: false, error: { code: 'unavailable', retryable: false, retryAfterMs: null, refId: null } }`; `rooms.subscribe` returns a no-op. Practice, settings and legal pages work fully. Every online feature shows "This feature isn't available on this server." (PRD §3.0.2).

---

## 8. Supabase design

### 8.1 Free-plan limits that shape the design

| Limit | Value | What we do about it |
|---|---|---|
| Database size | Read-only past 500 MB ([Supabase](https://supabase.com/docs/guides/platform/database-size)) | Packed attempt rows compacted after 30 days, raw events and idempotency logs pruned, packs and lists on the CDN, an alert at 300 MB (§8.15) |
| Egress | 5 GB uncached plus 5 GB cached a month ([Supabase](https://supabase.com/docs/guides/storage/serving/bandwidth), via [report 08](./research/08-technical-best-practices.md)) | Compact JSON payloads, no repeated explanations, practice off Supabase entirely, an alert at 3 GB |
| Realtime | 200 concurrent connections, 100 messages a second, 100 joins a second, 2M messages a month; a broadcast bills one message plus one per receiver ([limits](https://supabase.com/docs/guides/realtime/limits), [billing](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)) | Only rooms use Realtime; 20 players a room; hints only, with client refetches capped at two a second; a host-only topic for answer counts; polling fallback |
| Pausing | After about a week of low activity ([Supabase](https://supabase.com/docs/guides/platform/free-project-pausing)) | A daily GitHub Actions keepalive and a 30-minute probe (CI-1) |
| Backups | None downloadable on Free ([Supabase](https://supabase.com/docs/guides/platform/backups)) | Everything rebuildable from the repo plus the content key (memo §10); the Pro upgrade path in the launch report |
| Compute | Nano: shared CPU, 0.5 GB RAM, 60 direct connections, 200 pooler clients ([Supabase](https://supabase.com/docs/guides/platform/compute-and-disk)) | SHA-256 instead of bcrypt; short RPCs; heavy work in cron jobs |
| Statement timeout | `anon` 3 s [verified] ([Supabase](https://supabase.com/docs/guides/database/postgres/timeouts)) | Every RPC is index-driven and does bounded work; percentiles use one indexed rank key (§8.9) |
| `pg_cron` | 8 concurrent jobs, each under 10 minutes ([Supabase](https://supabase.com/docs/guides/cron)) | Seven jobs, all short (§8.15) |
| Pre-request hook | Data API only; GET and HEAD run read-only ([Supabase](https://supabase.com/docs/guides/api/securing-your-api)) | Every RPC is a POST; the hook rate-limits writes (§8.6) |

**Storage estimate**, per player per day played: about 0.8 kB of attempt detail for 30 days (0.15 kB after compaction), 0.1 kB in `daily_results`, 0.05 kB in `player_days`, and about 2 kB of analytics events kept for 30 days. At 1,000 daily players the first year totals about 200 MB with indexes; at 3,000 the 300 MB alert fires around month four and the Pro upgrade trigger (two alerts in a month) follows.

### 8.2 The security baseline

Migration one (SQL-1) applies Supabase's documented opt-in to revoke automatic grants ([Supabase](https://supabase.com/docs/guides/api/securing-your-api)) and builds a private schema:

```sql
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions from public;              -- no "in schema", on purpose
```

The last statement differs from Supabase's snippet, which scopes it to `in schema public`. Postgres grants EXECUTE on every new function to PUBLIC as a global default, and a per-schema revoke cannot remove a global grant ([PostgreSQL](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html)). The project's `pg_default_acl` holds only per-schema grants for `postgres`, so the per-schema form leaves every new function in `public` and `private` executable by `anon`. A local dry run showed exactly that, and showed the global form closing the gap (§1.5).

Rules for every later migration:

1. **Tables live in `private`**, never in `public`. Each gets `alter table ... enable row level security` and no policies. Only the owner (`postgres`, which owns the SECURITY DEFINER functions) can touch them.
2. **RPCs live in `public`** and are the whole API: `language plpgsql security definer set search_path = ''`, every relation schema-qualified (`private.players`, `extensions.digest`). Each one is followed by `revoke all on function ... from public, anon, authenticated;` and `grant execute on function ... to anon;`.
3. **Helpers live in `private`** and are never granted to anyone.
4. **The allowlist is data.** `private.rpc_allowlist` names every function `anon` may execute. A SQL test fails if `anon` can execute anything outside it, or anything in `private` (AC-INC-04, AC-UGS-05).
5. **Every RPC returns the envelope** `{ "ok": true, "data": ..., "server_time": ... }` or `{ "ok": false, "code": "...", "current": ..., "retry_after_ms": ..., "ref": ..., "server_time": ... }` through `private.ok(data)` and `private.err(code, ...)`. Expected failures return; they never raise, so failure counters commit. Each RPC validates before it writes, so an early return never leaves partial changes. Unexpected exceptions raise and roll the whole call back.
6. **Time comes from `private.now()`**, never `now()` directly, so SQL tests can set the clock (§8.17).

### 8.3 Tables

All tables are in `private` with RLS enabled. In the real migrations, column defaults call `private.now()`; the DDL below writes `now()` for brevity.

Every foreign key has an index on its referencing columns except `player_days.attempt_id`. Attempts are never deleted (deleting a player detaches them, and age only compacts them), and that index would add about 30 bytes to every player-day row, which §8.1 budgets at 50. The performance advisor's single INFO-level `unindexed_foreign_keys` finding there is expected. A job that ever deletes attempts must add that index first.

```sql
-- ===== Configuration and operations (SQL-1; ops tables SQL-8) ==========================
create table private.config (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
create table private.rpc_allowlist (name text primary key);
create table private.time_zones (name text primary key);            -- filled from pg_timezone_names (598 rows)
create table private.ip_salts (day date primary key, salt bytea not null);   -- rotated daily, kept 2 days
create table private.rate_counters (
  bucket text not null,              -- e.g. 'identity_ip_1h', 'sync_fail_ip_15m'
  subject bytea not null,            -- sha256(ip || salt) or the player id's bytes
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, subject, window_start));
create index on private.rate_counters (window_start);
create table private.rpc_errors (
  id bigint generated always as identity primary key, at timestamptz not null default now(),
  fn text not null, sqlstate text not null, ref text not null,
  room_id uuid, question_index smallint, detail text);
create index on private.rpc_errors (at);
create table private.heartbeats (ts timestamptz primary key);       -- pg_cron, every 5 minutes
create table private.service_state (
  id smallint primary key default 1 check (id = 1),
  state text not null default 'ok' check (state in ('ok', 'degraded', 'outage', 'maintenance')),
  message_id text, starts_at timestamptz, ends_at timestamptz, content_fix_daily integer,
  updated_at timestamptz not null default now());
create table private.alerts (
  id bigint generated always as identity primary key, at timestamptz not null default now(),
  kind text not null, detail jsonb not null, resolved_at timestamptz);
create table private.daily_aggregates (
  day date not null, metric text not null, dims jsonb not null default '{}', value bigint not null,
  primary key (day, metric, dims));

-- ===== Identity (SQL-2) =================================================================
create table private.players (
  id uuid primary key,                                   -- minted on the device
  created_at timestamptz not null default now(),
  is_test boolean not null default false,                -- id starts with 'e2e2e2e2-'
  track text not null default 'main' check (track in ('main', 'e2e')),
  friendly_name text not null,                           -- 'Plucky Otter'
  nickname text check (char_length(nickname) between 1 and 24),
  age_band text check (age_band in ('under_13', '13_17', '18_plus')),
  age_band_set_at timestamptz,
  tz text,                                               -- last valid zone seen
  last_finish_offset_min smallint,                       -- the date-line rule (PRD §4.4.7)
  first_context text, first_app text,                    -- context of registration
  first_finish_context text, first_finish_date date);    -- cohort: where the first Daily finished
create table private.credentials (
  player_id uuid not null references private.players (id) on delete cascade,
  secret_hash bytea not null,                            -- sha256(secret); never the secret
  source text not null check (source in ('mint', 'sync', 'claim')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),       -- touched at most daily; LRU pruning past 10
  primary key (player_id, secret_hash));
create table private.sync_codes (
  player_id uuid primary key references private.players (id) on delete cascade,
  code_hash bytea not null unique,                       -- sha256(normalized code)
  created_at timestamptz not null default now());
create table private.claims (
  token_hash bytea primary key,
  player_id uuid not null references private.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,                       -- created_at + 10 minutes
  redeemed_at timestamptz);
create index on private.claims (player_id);
create index on private.claims (expires_at);
create table private.name_parts (                       -- friendly-name parts; MOD-1 loads the reviewed lists
  kind text not null check (kind in ('adjective', 'animal')), word text not null,
  primary key (kind, word));

-- ===== Content, sealed and public (SQL-3) ===============================================
create table private.categories (id text primary key, slug text not null unique, name text not null, short_name text not null);
create table private.answer_entities (
  answer_type text not null, entity_id text not null, display text not null,
  primary key (answer_type, entity_id));
create table private.practice_items (                  -- public ids, for reports and the denylist
  id text primary key, category text not null references private.categories (id),
  status text not null default 'active' check (status in ('active', 'pulled')));
create index on private.practice_items (category);
create table private.mysteries (
  id text primary key check (id ~ '^(fx\.)?m\.[a-z]+\.\d{4}$'),
  track text not null default 'main',
  category text not null references private.categories (id),
  answer_type text not null,
  answer_entity text not null,
  accepted_entities text[] not null default '{}' check (cardinality(accepted_entities) <= 2),
  clues text[] not null check (cardinality(clues) = 4),
  distractors text[] not null check (cardinality(distractors) = 3),
  slot smallint not null check (slot between 1 and 3),
  explanation text not null, learn_more text not null, source_labels text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'pulled')),
  content_hash text not null,
  foreign key (answer_type, answer_entity) references private.answer_entities (answer_type, entity_id));
create index on private.mysteries (category);
create index on private.mysteries (answer_type, answer_entity);
create table private.encores (
  id text primary key check (id ~ '^(fx\.)?e\.\d{4}$'),
  track text not null default 'main',
  question text not null, unit text not null,
  value_kind text not null check (value_kind in ('quantity', 'year')),
  answer numeric not null check (answer > 0),
  decimals smallint not null default 0 check (decimals between 0 and 2),
  bullseye numeric, close numeric,                       -- null: defaults from config
  explanation text not null, learn_more text not null, source_labels text[] not null default '{}',
  status text not null default 'active', content_hash text not null);
create table private.sealed_questions (                 -- room packs and sealed choice rounds
  id text primary key,
  track text not null default 'main',
  format text not null check (format in ('mc', 'tf', 'comparison')),
  category text references private.categories (id),
  stem text not null,
  options text[] not null check (cardinality(options) between 2 and 4),
  correct smallint not null,
  option_order text not null check (option_order in ('shuffle', 'ascending', 'fixed')),
  explanation text not null, learn_more text not null,
  status text not null default 'active', content_hash text not null,
  check (correct >= 0 and correct < cardinality(options)));
create index on private.sealed_questions (category);
create table private.dailies (
  track text not null check (track in ('main', 'e2e')),
  daily_number integer not null check (daily_number >= 1),
  local_date date not null,
  rounds jsonb not null,                                 -- RoundSpec[] plus { "voided": bool } per round
  composition text not null,                             -- 'm3e1'
  max_points smallint not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'frozen')),
  frozen_at timestamptz,
  primary key (track, daily_number),
  unique (track, local_date));
create table private.daily_spares (
  id text primary key, rounds jsonb not null, composition text not null, max_points smallint not null,
  used_for_date date);
create table private.room_packs (
  id text primary key, track text not null default 'main', title text not null, theme text not null,
  question_ids text[] not null check (cardinality(question_ids) = 15),
  status text not null default 'active');
create table private.content_releases (
  version text primary key, applied_at timestamptz not null default now(),
  content_hash text not null, counts jsonb not null);

-- ===== Attempts: Daily, archive, challenge, pack, shared quiz (SQL-4, SQL-5, SQL-7) =====
create table private.attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references private.players (id) on delete set null,   -- detached on deletion
  kind text not null check (kind in ('daily', 'archive', 'challenge', 'pack', 'quiz')),
  track text not null default 'main',
  daily_number integer, pack_id text, quiz_id uuid, quiz_version integer, challenge_id bigint,
  ranked boolean not null default false,          -- first attempt at the player's local today
  local_date date,                                -- the player's local date at start
  tz text not null, offset_min smallint not null,
  offset_band smallint not null check (offset_band between 0 and 2),   -- 0 Americas, 1 EMEA, 2 APAC
  context text not null, app text not null, app_version text not null,
  status text not null default 'active' check (status in ('active', 'finished', 'abandoned')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  round_count smallint not null,
  current_round smallint not null default 0,
  current_step smallint not null default 0,       -- clue number; 0 = round not begun
  rounds jsonb not null,                          -- packed per-round state (below)
  snapshot jsonb,                                 -- sealed copy of a user quiz for 'quiz' attempts
  points smallint not null default 0,
  encore_err numeric, total_ms integer, rank_key bigint,
  flags smallint not null default 0,              -- 1 visibility, 2 expert slot, 4 too fast, 8 missing report
  repair_of date,
  compacted boolean not null default false);
create unique index attempts_one_per_date on private.attempts (player_id, track, daily_number) where daily_number is not null;
create unique index attempts_one_per_pack on private.attempts (player_id, pack_id) where pack_id is not null;
create unique index attempts_one_per_quiz on private.attempts (player_id, quiz_id) where quiz_id is not null;
create index on private.attempts (player_id, started_at desc);
create index on private.attempts (started_at) where status = 'active';
create table private.round_actions (               -- idempotency log, pruned 48 h after the attempt ends
  idem uuid primary key,
  attempt_id uuid not null references private.attempts (id) on delete cascade,
  round smallint not null, step smallint not null,
  at timestamptz not null default now(), result jsonb not null);
create index on private.round_actions (attempt_id);
create table private.daily_results (               -- finished ranked attempts: the percentile pool
  attempt_id uuid primary key references private.attempts (id) on delete cascade,
  track text not null, daily_number integer not null, band smallint not null,
  eligible boolean not null,                      -- false when any honest-play flag is set
  points smallint not null, encore_err numeric, encore_guess numeric,
  total_ms integer not null, rank_key bigint not null,
  finished_at timestamptz not null,
  final_percentile smallint);                     -- stored once the global window closes
create index daily_results_rank on private.daily_results (track, daily_number, eligible, band, rank_key);
create table private.round_stats (                 -- crowd counters, eligible ranked runs only
  track text not null, daily_number integer not null, round smallint not null,
  eligible integer not null default 0,
  solved_on integer[] not null default '{0,0,0,0}', missed integer not null default 0,
  bullseye integer not null default 0, close integer not null default 0,
  option_counts integer[],                        -- choice rounds
  clue1_dwell_hist integer[],                     -- seconds 0..600, hardest-slot clue-1 solves
  primary key (track, daily_number, round));
create table private.wrong_guess_tallies (
  track text not null, daily_number integer not null, round smallint not null,
  entity_id text not null, n integer not null default 0,
  primary key (track, daily_number, round, entity_id));

-- ===== Streaks and incidents (SQL-6) ====================================================
create table private.player_days (
  player_id uuid not null references private.players (id) on delete cascade,
  local_date date not null,
  status text not null check (status in ('played', 'repaired', 'freeze', 'protected', 'missed')),
  attempt_id uuid references private.attempts (id) on delete set null,   -- unindexed on purpose (above)
  points smallint,                                -- 'played' and 'repaired'; Group weeks sum 'played'
  primary key (player_id, local_date));
create table private.streaks (
  player_id uuid primary key references private.players (id) on delete cascade,
  current integer not null default 0, best integer not null default 0,
  days_played integer not null default 0, dailies_finished integer not null default 0,
  freezes_held smallint not null default 0 check (freezes_held between 0 and 2),
  freeze_progress smallint not null default 0 check (freeze_progress between 0 and 6),
  last_repair_at timestamptz, first_finish_date date, evaluated_through date,
  updated_at timestamptz not null default now());
create table private.notices (
  id bigint generated always as identity primary key,
  player_id uuid not null references private.players (id) on delete cascade,
  kind text not null check (kind in ('freeze_spent', 'protected', 'rescored', 'key_corrected')),
  payload jsonb not null, created_at timestamptz not null default now(), seen_at timestamptz);
create index on private.notices (player_id) where seen_at is null;
create table private.incidents (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null, ends_at timestamptz not null check (ends_at > starts_at),
  kind text not null check (kind in ('heartbeat_gap', 'declared', 'publish_failure')),
  note text, created_at timestamptz not null default now(),
  unique (kind, starts_at));
create index on private.incidents using gist (tstzrange(starts_at, ends_at));

-- ===== Reports, hearts, practice calibration (SQL-9) ====================================
create table private.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid,                               -- no FK: deleted explicitly by delete_player
  target_kind text not null check (target_kind in
    ('practice_item', 'daily_round', 'pack_question', 'room_question', 'quiz', 'quiz_question')),
  target_ref text not null,                       -- 'p.geo.0042', 'main:42:2', 'quiz:<code>:3'
  reason text not null,
  note text check (char_length(note) <= 280),     -- links stripped; nulled after 180 days
  weight numeric(3, 2) not null,
  client_id uuid not null unique,
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  unique (reporter_id, target_kind, target_ref));
create table private.report_tallies (
  target_kind text not null, target_ref text not null,
  weighted numeric not null default 0, raw integer not null default 0,
  first_report_at timestamptz not null, paged_at timestamptz, alert_at timestamptz,
  pulled_at timestamptz, resolved_at timestamptz,
  primary key (target_kind, target_ref));
create table private.pulled_items (
  version bigint generated always as identity primary key,
  item_id text not null unique, pulled_at timestamptz not null default now(),
  reason text not null, restored_at timestamptz);
create table private.hearts (
  player_id uuid not null, item_ref text not null, created_at timestamptz not null default now(),
  primary key (player_id, item_ref));
create table private.practice_answers (            -- raw first attempts, pruned after 30 days
  player_id uuid not null, item_id text not null, correct boolean not null, option smallint not null,
  time_bucket text not null, mode text not null, client_id uuid not null unique,
  at timestamptz not null default now(),
  primary key (player_id, item_id));
create table private.item_stats (                  -- aggregates, kept
  item_ref text primary key, first_attempts integer not null default 0, correct integer not null default 0,
  option_counts integer[] not null default '{0,0,0,0}', hearts integer not null default 0,
  reports_weighted numeric not null default 0);

-- ===== Analytics (SQL-10) ===============================================================
create table private.event_dictionary (name text primary key, props jsonb not null);   -- generated (§3.12)
create table private.events (                      -- raw, pruned after 30 days
  event_id uuid primary key, name text not null, player_id uuid not null, session_id uuid not null,
  ts_client timestamptz not null, ts_server timestamptz not null default now(),
  app_version text not null, route_group text not null, platform text not null, context text not null,
  props jsonb not null default '{}');
create index on private.events (ts_server);
create index on private.events (name, ts_server);

-- ===== Moderation (MOD-1) ===============================================================
create table private.moderation_terms (term text primary key, match text not null check (match in ('word', 'substring')));
create table private.moderation_allow (word text primary key);

-- ===== Challenges (SQL-11) ==============================================================
create table private.challenges (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  creator_id uuid not null references private.players (id) on delete cascade,
  creator_attempt_id uuid not null references private.attempts (id) on delete cascade,
  source_kind text not null check (source_kind in ('daily', 'pack')),
  track text not null, daily_number integer, pack_id text,
  rematch_of bigint references private.challenges (id) on delete set null,
  accepted smallint not null default 0 check (accepted between 0 and 50),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null);               -- created_at + 30 days
create index on private.challenges (creator_id, created_at desc);
create index on private.challenges (creator_attempt_id);
create index on private.challenges (rematch_of);   -- delete_player cascades through challenges
create table private.challenge_entries (
  challenge_id bigint not null references private.challenges (id) on delete cascade,
  player_id uuid not null references private.players (id) on delete cascade,
  attempt_id uuid references private.attempts (id) on delete set null,
  accepted_at timestamptz not null default now(),
  primary key (challenge_id, player_id));
create index on private.challenge_entries (player_id, accepted_at desc);
create index on private.challenge_entries (attempt_id);

-- ===== Groups (SQL-12) ==================================================================
create table private.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 30),
  invite_code text not null unique check (invite_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  track text not null default 'main',
  created_by uuid references private.players (id) on delete set null,
  admin_id uuid references private.players (id) on delete set null,
  member_count smallint not null default 0 check (member_count between 0 and 50),
  next_member_no smallint not null default 1,
  created_at timestamptz not null default now(),
  last_week_start date, last_week_winner jsonb);  -- cached banner
create index on private.groups (created_by);
create index on private.groups (admin_id);
create table private.group_members (
  group_id uuid not null references private.groups (id) on delete cascade,
  player_id uuid not null references private.players (id) on delete cascade,
  member_no smallint not null,                    -- the handle other members see; never the player id
  nickname text not null check (char_length(nickname) between 1 and 24),
  joined_at timestamptz not null default now(),
  primary key (group_id, player_id),
  unique (group_id, member_no));
create unique index group_members_nickname on private.group_members (group_id, lower(nickname));
create index on private.group_members (player_id);

-- ===== Achievements (MAS-1) =============================================================
create table private.achievements (
  player_id uuid not null references private.players (id) on delete cascade,
  achievement_id text not null check (achievement_id ~ '^A\d{2}$'),
  unlocked_at timestamptz not null default now(),
  primary key (player_id, achievement_id));

-- ===== Rooms, Beta (SQL-13, SQL-14) =====================================================
create table private.rooms (
  id uuid primary key default gen_random_uuid(),
  code char(6) not null check (code ~ '^\d{6}$'),
  track text not null default 'main',
  host_player_id uuid references private.players (id) on delete set null,
  host_token_hash bytea not null,
  source_kind text not null check (source_kind in ('pack', 'quiz')), pack_id text, quiz_id uuid,
  questions jsonb not null,                       -- sealed snapshot, options in room order
  settings jsonb not null,                        -- { "timer_s": 20, "scoring": "classic" }
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'ended')),
  phase text not null default 'lobby'
    check (phase in ('lobby', 'read', 'answering', 'reveal', 'standings', 'paused', 'podium', 'ended')),
  question_index smallint not null default -1,
  phase_started_at timestamptz not null default now(),
  options_at timestamptz, deadline_at timestamptz,
  extended boolean not null default false,        -- +50% for everyone on this question
  version integer not null default 0,
  locked boolean not null default false,
  voided smallint[] not null default '{}',
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz);
create unique index rooms_active_code on private.rooms (code) where status <> 'ended';
create index on private.rooms (host_player_id);
create table private.room_seats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references private.rooms (id) on delete cascade,
  seat_token_hash bytea not null unique,
  name text not null,
  joined_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  removed_at timestamptz,
  extra_time boolean not null default false,
  score integer not null default 0, streak smallint not null default 0,
  correct_ms bigint not null default 0);          -- tiebreak: effective time on correct answers
create unique index room_seats_name on private.room_seats (room_id, lower(name)) where removed_at is null;
create index on private.room_seats (room_id);
create table private.room_answers (
  room_id uuid not null references private.rooms (id) on delete cascade,
  question_index smallint not null,
  seat_id uuid not null references private.room_seats (id) on delete cascade,
  option smallint not null,
  server_ms integer not null, client_ms integer not null, effective_ms integer not null,
  correct boolean not null, points integer not null default 0,
  received_at timestamptz not null default now(),
  idem uuid not null unique,
  primary key (room_id, question_index, seat_id));
create index on private.room_answers (seat_id);       -- the 24-hour room purge cascades through seats

-- ===== User quizzes, Beta (SQL-15) ======================================================
create table private.quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references private.players (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 60),
  description text not null default '' check (char_length(description) <= 200),
  questions jsonb not null,                       -- 1 to 50 UserQuizQuestion, validated by save_quiz
  question_count smallint not null check (question_count between 1 and 50),
  version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  share_code text unique check (share_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  shared_at timestamptz, share_confirmed_at timestamptz,
  hidden_at timestamptz, taken_down_at timestamptz, takedown_reason text,
  plays integer not null default 0, score_sum integer not null default 0);
create index on private.quizzes (owner_id);
```

**Packed round state** (`attempts.rounds`, one element per round, short keys to save space):

```json
[ { "t": "mystery", "iss": ["2026-11-01T10:00:00.120Z", "2026-11-01T10:00:41.900Z"], "g": ["Q16"],
    "pk": null, "so": 2, "pt": 3, "sms": 52140, "cms": 51880, "rq": 2, "h": false,
    "res": "2026-11-01T10:00:52.260Z", "sh": [2, 0, 3, 1] },
  { "t": "encore", "iss": ["..."], "gu": 1200, "er": 0.04, "bd": "bullseye", "sms": 9100, "cms": 9010, "rq": 1, "h": false },
  { "t": "mc", "iss": ["..."], "sh": [1, 3, 0, 2], "ch": 2, "ok": true, "pt": 1, "sms": 6100, "cms": 6020, "rq": 1, "h": false } ]
```

After 30 days a nightly job compacts each element to `{ t, so | ok | er, pt, ms }` and sets `compacted = true`.

### 8.4 RPC catalogue

Conventions: every RPC is `public.<name>(...) returns jsonb`, called with POST. "(auth)" means the first two parameters are `p_player uuid, p_secret text`, checked by `private.authenticate` (§8.5); "(auth, registers)" means an unknown player id is registered on the spot, under the identity rate limit. Text inputs pass `private.clean_text` (NFC, trimmed, control characters removed, whitespace collapsed) before validation. Every RPC also falls under the general cap of §8.6 unless the table says it is exempt. A wrong secret always returns the same `auth_failed` and changes nothing (AC-IDN-03).

**Identity (SQL-2; `set_nickname` in MOD-1)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `register_player(p_player uuid, p_secret text, p_context text, p_app text)` | `Profile` | Secret matches `^[A-Za-z0-9_-]{43}$`; context and app in their enums. A known player with a matching credential gets its profile back (idempotent); a known player without a match gets `auth_failed`; an unknown player is created with a generated friendly name and a `mint` credential | `invalid_input`, `auth_failed`, `rate_limited` | 5 new identities per IP per hour (AC-IDN-04); 200 for test ids |
| `get_profile(auth)` | `Profile` | | `auth_failed` | |
| `set_age_band(auth, p_band text, p_moment text)` | `Profile` | Enums | `invalid_input` | 10 per player per day |
| `set_nickname(auth, p_nickname text, p_generated boolean)` | `Profile` | A generated name must be a valid `name_parts` pair; custom text needs `18_plus` (`13_17` gets `age_forbidden`, unknown gets `age_required`), 1 to 24 characters, and must pass `private.text_is_blocked` | `invalid_input`, `age_required`, `age_forbidden`, `blocked_text` | 20 per player per day |
| `create_sync_code(auth)` | `{ code }` | 16 Crockford characters from `gen_random_bytes(10)`; upserts the hash, so the previous code stops working (AC-SYN-03) | `auth_failed`, `rate_limited` | 5 per player per day |
| `redeem_sync_code(p_code text, p_new_secret text)` | `{ player_id, profile, streak, last_daily }` | Checks the failure counters before looking at the code (AC-SYN-04); normalizes case, spaces, hyphens, I and L to 1, O to 0 (AC-SYN-02); adds a `sync` credential for the new secret; keeps the 10 most recently used credentials | `invalid_input`, `not_found`, `rate_limited` | 5 failures per IP per 15 minutes; 20 per IP per day |
| `create_claim(auth)` | `{ token, expires_at }` | 32 random bytes in base64url; stores the hash; 10-minute expiry | `auth_failed`, `rate_limited` | 5 per player per hour |
| `peek_claim(p_token text)` | `ClaimPreview` | Valid, unexpired, unredeemed | `expired`, `not_found`, `rate_limited` | 10 per IP per hour, shared with redeem |
| `redeem_claim(p_token text, p_new_secret text)` | `{ player_id, profile, streak, last_daily }` | `update ... set redeemed_at = private.now() where token_hash = ... and redeemed_at is null and expires_at > private.now() returning ...` makes it single-use (AC-IAB-04); adds a `claim` credential | `expired`, `not_found`, `rate_limited` | 10 per IP per hour |
| `export_my_data(auth)` | `ServerDataExport` | Everything keyed by the player id | `auth_failed` | 5 per player per day |
| `delete_player(auth)` | `{}` | Deletes the player (cascading to credentials, sync code, claims, memberships, challenges, quizzes, streak rows, notices and achievements), detaches attempts, and deletes events, hearts, reports and practice answers by id (AC-DAT-02) | `auth_failed` | |

**Sealed runs (SQL-4, SQL-5, SQL-7; challenge and pack starts in SQL-11; quiz starts in SQL-15)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `get_today(p_player uuid default null, p_secret text default null, p_tz text)` | `DailyTodayCard` | Never registers; includes attempt status only when the credential is valid | | 60 per IP per minute |
| `start_daily(auth, registers, p_tz text, p_context text, p_app text, p_app_version text)` | `AttemptSnapshot` | Resolves the zone and local date (§8.7); finds the track's Daily for that date; returns the existing attempt for that player and Daily, finished or not (AC-DLY-05, AC-DLY-06); otherwise inserts a ranked `daily` attempt, draws the per-round shuffles, issues round 0 and returns its first clue or stem | `no_daily` (also records a `publish_failure` incident), `auth_failed`, `rate_limited` | general cap |
| `start_archive(auth, registers, p_tz, p_daily_number int)` | `AttemptSnapshot` | The date must be one of the 7 before the player's local date (AC-ARC-01); one attempt per date; unranked | `not_open`, `not_found`, `already_played` | general cap |
| `start_challenge_run(auth, registers, p_tz, p_code text)` | `AttemptSnapshot` | The challenged date equals the reader's local date: a ranked `daily` attempt (AC-CHL-02); within the last 7 days: `archive` (AC-CHL-03); older: `challenge`, no streak effect; later: `not_open` with `unlocks_at` (AC-CHL-04); at most 50 entries (AC-CHL-06) | `not_open`, `full`, `expired`, `already_played`, `not_found` | general cap |
| `start_pack_run(auth, registers, p_pack text)` | `AttemptSnapshot` | Challenge packs only; none exist at launch | `not_found` | general cap |
| `start_quiz_run(auth, registers, p_code text)` | `AttemptSnapshot` | Shared, not hidden, not taken down; copies the questions into `attempts.snapshot`; unranked | `not_found`, `unavailable` | general cap |
| `get_attempt(auth, p_attempt uuid)` | `AttemptSnapshot` | Owner only; resolved rounds carry reveals; the open round carries only what was issued | `not_found` | |
| `begin_round(auth, p_attempt uuid, p_round smallint)` | `{ open }` | `p_round = current_round` and the previous round resolved; repeated calls return the same open state without moving `issued[0]` | `stale`, `not_found` | |
| `round_action(auth, p_attempt uuid, p_round smallint, p_step smallint, p_action jsonb, p_client_ms int, p_hidden boolean, p_idem uuid)` | `{ verdict, finished }` | A known `p_idem` returns its stored result. Otherwise: lock the attempt `for update`; `p_round` and `p_step` must match, else `stale` with the current open state; dispatch to the family judge (§8.8); on resolution stamp times, flags and points; the final round finishes the attempt in the same transaction | `stale`, `invalid_entity`, `already_guessed`, `invalid_input`, `not_found` | 120 per attempt |
| `finish_attempt(auth, p_attempt uuid)` | `FinishSummary` | Idempotent recovery path | `not_found`, `invalid_input` | |
| `get_daily_results(auth, p_attempt uuid)` | `DailyResults` | Finished attempts only | `not_found` | |
| `get_daily_numbers(auth, p_attempt uuid)` | `{ percentile, histogram, crowd }` | §8.9 | `not_found` | 60 per player per hour |
| `get_archive(auth, p_tz)` | `ArchiveListing` | T-1 to T-7 with tile states and repair status | | |

**Streaks, notices, stats and achievements (SQL-6, SQL-7, MAS-1)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `get_streak(auth, p_tz)` | `StreakState` | Runs `private.evaluate_streak` (§8.10); idempotent | | |
| `ack_notices(auth, p_ids bigint[])` | `{}` | The caller's notices only | | |
| `get_my_stats(auth, p_tz)` | `PlayerServerStats` | | | 60 per player per hour |
| `record_achievements(auth, p_ids text[])` | `{ newly_recorded }` | Ids in the allowlist `A01` to `A30` | `invalid_input` | 30 per player per day |

**Challenges (SQL-11)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `create_challenge(auth, p_attempt uuid)` | `{ code, expires_at }` | The caller's finished `daily`, `archive`, `challenge` or `pack` attempt; practice never reaches the server, so no practice source can exist (AC-CHL-08) | `not_found`, `rate_limited` | 20 per player per day (AC-CHL-07) |
| `get_challenge(p_player uuid default null, p_secret text default null, p_code text, p_tz text)` | `ChallengeLanding` | Works without identity; unknown codes return state `invalid` | | 60 per IP per minute |
| `get_head_to_head(auth, p_code)` | `HeadToHead` | The caller played it | `not_found` | |
| `create_rematch(auth, p_code, p_tz)` | `{ code }` | The most recent date in today and the last 7 that neither player finished; else a pack neither played; else tomorrow (AC-CHL-09) | `not_found`, `rate_limited` | counts toward the 20 |
| `get_challenge_shelf(auth)` | `ChallengeShelf` | 50 per section, newest first | | |
| `get_challenge_participants(auth, p_code)` | `ChallengeParticipants` | The creator only | `not_found` | |

**Groups (SQL-12)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `create_group(auth, registers, p_name text, p_nickname text, p_generated boolean)` | `{ group, invite }` | Age band known (`age_required`) and not `under_13` (`age_forbidden`); `13_17` must use a generated nickname; name 3 to 30 characters; both texts pass the filter (AC-GRP-07); 10 groups per player at most | `age_required`, `age_forbidden`, `blocked_text`, `limit_reached`, `rate_limited` | 3 per player per day |
| `get_group_invite(p_code text)` | `GroupInvitePreview` | Name and member count only | | 60 per IP per minute |
| `join_group(auth, registers, p_code, p_nickname, p_generated)` | `GroupSummary` | Same age and text rules; 50 members (AC-GRP-02); a duplicate nickname gets " 2"; tracks never mix | `full`, `not_found`, `age_required`, `age_forbidden`, `blocked_text`, `limit_reached` | 20 joins per player per hour |
| `list_my_groups(auth)` | `GroupSummary[]` | | | |
| `get_group_board(auth, p_group uuid, p_tz)` | `GroupBoard` | Members only (AC-GRP-03); Today rows carry no score or grid until the viewer finished today's Daily (AC-GRP-06); the week sums `player_days` rows with status `played` for Monday to Sunday (AC-GRP-04) | `not_member` | 120 per player per hour |
| `get_group_invite_code(auth, p_group)` | `{ invite }` | Members only | `not_member` | |
| `set_group_nickname(auth, p_group, p_nickname, p_generated)` | `GroupSummary` | Text and age rules | `blocked_text`, `age_forbidden`, `not_member` | |
| `group_admin(auth, p_group, p_action jsonb)` | `{ group, invite }` | Admin only (others get `invalid_input`): rename (filter), regenerate the invite (AC-GRP-10), transfer admin, remove a member by `member_no` | `not_member`, `blocked_text`, `invalid_input` | |
| `leave_group(auth, p_group)` | `{}` | A leaving admin hands over to the longest-standing member (AC-GRP-11); the last member's leave deletes the group | `not_member` | |

**Rooms, Beta (SQL-13, SQL-14).** The `room_*` RPCs are exempt from the general cap and carry their own limits; `create_room` and `join_room` count toward it.

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `create_room(auth, registers, p_source jsonb, p_settings jsonb)` | `{ room_id, code, host_token }` | Server flag `rooms`; an active pack on the caller's track, or the caller's own quiz with the 18+ confirmation and not hidden; settings in their enums; a 6-digit code unique among live rooms (redrawn on a clash); questions copied and shuffled into the room | `feature_disabled`, `not_found`, `age_forbidden`, `rate_limited` | 5 per identity per hour |
| `join_room(p_code text, p_seat_token text default null, p_method text)` | `{ room_id, seat_id, seat_token, name, rejoined }` | A valid seat token for that room restores the seat, name and score (AC-ROM-02); a removed seat's token is refused (AC-ROM-05); a locked room refuses new seats only; 20 seats (AC-ROM-06) | `not_found`, `full`, `locked`, `removed`, `ended`, `rate_limited` | 10 attempts per IP per minute, wrong codes included |
| `room_shuffle_name(p_room uuid, p_seat_token text)` | `{ name }` | Lobby only | `stale` | 20 per seat |
| `room_heartbeat(p_room uuid, p_seat_token text)` | `{ version }` | Touches `last_heartbeat_at`, runs `private.room_tick` | `removed`, `ended` | 1 per 2 s per seat |
| `room_player_state(p_room uuid, p_seat_token text)` | `RoomPlayerView` | Runs `private.room_tick`; never includes the correct option before the reveal (AC-ROM-09) | `removed`, `ended`, `not_found` | 2 per second per seat |
| `room_host_state(p_room uuid, p_host_token text)` | `RoomHostView` | Runs `private.room_tick` | `not_found` | 4 per second |
| `room_host_action(p_room uuid, p_host_token text, p_action jsonb, p_expected_version int)` | `RoomHostView` | `p_expected_version` must equal `version`, so a double tap returns `conflict`; transitions per §8.11; renames pass the filter | `conflict`, `invalid_input`, `blocked_text` | 10 per second |
| `room_answer(p_room uuid, p_seat_token text, p_question smallint, p_option smallint, p_client_ms int, p_idem uuid)` | `{ accepted, late }` | Phase `answering` for that question; one answer per seat, never changed; accepted until the seat's deadline plus 500 ms, with no speed bonus after the deadline; later answers rejected (AC-ROM-08) | `stale`, `removed`, `invalid_input` | 2 per question per seat |
| `room_leave(p_room uuid, p_seat_token text)` | `{}` | Marks the seat disconnected, not removed | | |

**User quizzes, Beta (SQL-15)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `save_quiz(auth, registers, p_quiz jsonb, p_base_version int)` | `UserQuiz` | Server flag `editor`; every blocking rule of PRD §3.9.4 and the filter on every field (AC-EDT-05, AC-LNT-02); version check, returning the current copy on `conflict` (AC-EDT-04); 50 quizzes per player | `invalid_input`, `blocked_text`, `conflict`, `limit_reached`, `rate_limited` | 30 saves per player per hour |
| `list_my_quizzes(auth)` | `UserQuiz[]` | | | |
| `delete_quiz(auth, p_quiz uuid)` | `{}` | Owner only | `not_found` | |
| `share_quiz(auth, p_quiz uuid, p_confirm boolean)` | `{ code }` | `18_plus` and `p_confirm` (AC-UGS-01); not hidden or taken down | `age_required`, `age_forbidden`, `invalid_input`, `rate_limited` | 10 per player per day |
| `unshare_quiz(auth, p_quiz uuid)` | `{}` | Clears `share_code` (AC-UGS-06) | | |
| `get_shared_quiz(p_code text)` | `SharedQuizLanding` | Hidden quizzes return state `hidden`; unshared or taken down return `unavailable` | | 60 per IP per minute |

**Reports, hearts, practice, analytics and health (SQL-8, SQL-9, SQL-10)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `submit_report(auth, registers, p_target jsonb, p_reason text, p_note text, p_client_id uuid)` | `{ stored }` | One per identity per target; weight 0 when the identity never answered the item, 0.5 when it is under 24 hours old, else 1 (AC-RPT-02); links stripped from the note; thresholds in §8.12 | `invalid_input` | 30 per player per day |
| `set_heart(auth, registers, p_item_ref text, p_on boolean, p_client_id uuid)` | `{}` | Idempotent per client id | | 300 per player per day |
| `log_practice_answers(p_player uuid, p_batch jsonb)` | `{ accepted }` | No secret: calibration data only, so practice-only players never register (AC-IDN-01); 50 rows at most; first attempt per player and item; ids must exist in `practice_items` | `invalid_input` | 500 per player per day; 2,000 per IP per day |
| `get_pulled_items(p_since bigint)` | `{ version, item_ids }` | | | 60 per IP per minute |
| `log_events(p_batch jsonb)` | `{ accepted }` | 50 events at most; unknown names dropped, unknown properties stripped, enums checked (AC-ANA-02); any value matching an e-mail, phone or URL-with-query pattern drops the event (AC-ANA-04); `event_id` unique (AC-ANA-03); `ts_client` within 7 days of server time | `invalid_input` | Exempt from the general cap; 60 events per identity per minute, 300 per IP per 5 minutes |
| `get_service_status()` | `ServiceStatus` | `service_state` plus incidents in the last 72 hours | | Exempt |
| `pre_request()` | (hook) | §8.6 | HTTP 429 | |

**Owner-only functions** live in `private`, run through MCP `execute_sql`, and are never granted to `anon` or `authenticated`: `declare_incident(p_start, p_end, p_kind, p_note)`, `set_service_state(p_state, p_message_id, p_starts, p_ends)`, `admin_void_round(p_track, p_daily, p_round, p_reason)`, `admin_correct_key(p_track, p_daily, p_round, p_entity, p_reason)`, `admin_pull_item(p_item, p_reason)`, `admin_restore_item(p_item)`, `admin_takedown_quiz(p_quiz, p_reason)`, `admin_resolve_report(p_target_kind, p_target_ref, p_status)`, plus the view `private.content_queue` (open reports with weights, alerts, the Daily runway, heartbeat gaps and free-tier usage).

### 8.5 The guest identity scheme

```sql
create function private.authenticate(
  p_player uuid, p_secret text, p_register boolean,
  p_context text default 'unknown', p_app text default 'none')
returns uuid language plpgsql security definer set search_path = '' as $$ ... $$;
```

1. A null id or a secret that fails `^[A-Za-z0-9_-]{43}$` returns null.
2. `v_hash := extensions.digest(p_secret, 'sha256')`.
3. If a credential `(p_player, v_hash)` exists, touch `last_used_at` when it is more than a day old and return `p_player`.
4. If the player exists without that credential, return null (the caller answers `auth_failed`).
5. If `p_register` is true, check the identity limit (5 per IP per hour; 200 for test ids), insert the player with a friendly name drawn from `name_parts`, set `is_test` and `track = 'e2e'` when the id starts with `e2e2e2e2-`, insert a `mint` credential, and return the id.
6. Otherwise return null.

Adding a credential (sync or claim) prunes all but the 10 most recently used (PRD §3.10.1). The secret's plaintext only ever travels from the client to the server inside POST bodies over TLS; it is never stored or logged, and the server never sends it back. A random 256-bit secret cannot be guessed, so a plain SHA-256 is enough and costs the shared CPU almost nothing ([report 08](./research/08-technical-best-practices.md)).

### 8.6 Rate limiting in SQL

**Layer 1, the pre-request hook.** Following Supabase's documented pattern ([Supabase](https://supabase.com/docs/guides/api/securing-your-api)):

```sql
create function public.pre_request() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_method text := current_setting('request.method', true);
  v_path   text := ltrim(current_setting('request.path', true), '/');   -- 'rpc/start_daily', with or without a leading slash
  v_ip     text := split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1);
begin
  if v_method is null or v_method in ('GET', 'HEAD') then return; end if;
  if v_path in ('rpc/log_events', 'rpc/get_service_status', 'rpc/pre_request')
     or v_path like 'rpc/room\_%' then return; end if;
  if not private.hit('general_ip_5m', private.ip_subject(v_ip), 300, 300) then
    raise sqlstate 'PGRST' using
      message = json_build_object('code', 'rate_limited', 'message', 'Too many requests')::text,
      detail  = json_build_object('status', 429, 'headers', json_build_object('Retry-After', '60'))::text;
  end if;
end $$;

alter role authenticator set pgrst.db_pre_request = 'public.pre_request';
notify pgrst, 'reload config';
```

The hook has to be callable by `anon`, so it sits in `public` and in the allowlist; called directly it only counts a request. SQL-8 applies it last, so a mistake in it cannot block earlier work.

**Layer 2, per-action limits.** `private.hit(bucket text, subject bytea, window_seconds int, max int) returns boolean` upserts one counter row per aligned window and answers whether the call is still under the limit. `private.peek` reads without counting, for failure-only limits (sync codes, claims) that must refuse before checking. Subjects are the player id's bytes or `private.ip_subject(ip)`, which is `sha256(ip || salt)` with a salt that rotates daily (`private.ip_salts`, kept two days), so raw IP addresses are never stored (PRD §8.3).

| Action | Limit | Bucket |
|---|---|---|
| Any write RPC not exempt | 300 per IP per 5 minutes | `general_ip_5m` |
| New identity | 5 per IP per hour (test ids: 200) | `identity_ip_1h` |
| Sync-code redeem | 5 failures per IP per 15 minutes; 20 per IP per day | `sync_fail_ip_15m`, `sync_ip_1d` |
| Claim | 5 created per player per hour; 10 redemptions or peeks per IP per hour | `claim_player_1h`, `claim_ip_1h` |
| Challenges | 20 per player per day | `challenge_player_1d` |
| Groups | 3 created per player per day; 20 joins per player per hour | `group_create_1d`, `group_join_1h` |
| Rooms | 5 created per identity per hour; 10 joins per IP per minute | `room_create_1h`, `room_join_ip_1m` |
| Quizzes | 30 saves per player per hour; 10 shares per player per day | `quiz_save_1h`, `quiz_share_1d` |
| Reports | 30 per player per day | `report_player_1d` |
| `log_events` | 60 per identity per minute; 300 per IP per 5 minutes | `events_player_1m`, `events_ip_5m` |
| Unauthenticated landing reads | 60 per IP per minute | `landing_ip_1m` |

Every number lives in `private.config` (tunable). The shared-IP case (an office of 20 colleagues doing the Daily at 9 a.m., about 15 writes each) sits at the general cap; the client logs `client_error` with kind `rpc` on every 429, and the content queue view shows 429 counts per day so the cap can be raised before it bites.

### 8.7 Time zones and "the Daily for local date D"

- **Zone.** `p_tz` must be in `private.time_zones` (copied from `pg_timezone_names`, faster to probe than the view). An unknown zone falls back to `players.tz`, then `UTC` (PRD §4.4.1).
- **Local date.** `(private.now() at time zone v_tz)::date`. The device clock is never used for dates.
- **Offset and band.** `offset_min` is the zone's UTC offset at `private.now()`; the band is 0 below -120, 1 from -120 to 239, 2 from 240 (§4.6).
- **The Daily for D.** The row in `private.dailies` with the player's track and `local_date = D`. Daily numbers satisfy `daily_number = (D - daily_epoch) + 1`, checked by a SQL test.
- **Global window of D.** Opens at `(D::timestamp - interval '14 hours') at time zone 'UTC'` (D 00:00 at UTC+14) and closes at `((D + 1)::timestamp + interval '12 hours') at time zone 'UTC'` (D+1 00:00 at UTC-12). An attempt belongs to the local date it started on and can be finished until the window closes; the nightly job then marks it abandoned (PRD §3.1.3).
- **Midnight.** "Next Daily in" counts to the next local midnight in the player's zone. A run started at 23:59:30 and finished at 00:03 belongs to the earlier date (AC-DLY-08).
- **Publishing.** The hourly job keeps a Daily in place for every date up to today plus 3, on every track, assigning a spare (and raising an alert) if the schedule has a gap, and freezes rows 3 days ahead in the first month and 7 days ahead after that (`private.config.freeze_days`). A content release refuses to change a frozen row without `--allow-frozen`.

### 8.8 Sealed rounds in SQL

`begin_round` and `round_action` dispatch to family handlers, all in `private`:

| Handler | Does |
|---|---|
| `round_open_choice(attempt, round)` | Builds the stem and options in the stored display order (`sh`), sets `iss[0]` |
| `round_judge_choice(...)` | `answer { option }`: correct when `sh[option]` is the key; resolves with 1 or 0 points |
| `round_open_mystery(...)` | Returns clue 1, the answer type and an empty guess list; sets `iss[0]` |
| `round_judge_mystery(...)` | §4.4.1 exactly: `guess` checks `private.answer_entities` (`invalid_entity`, nothing stored) and the guess list (`already_guessed`, nothing stored); a wrong guess or `next_clue` sets `iss[k]` and returns clue `k + 1`, with the four options in shuffle order from clue `options_from_clue`; `pick` judges an option; resolution returns the full reveal |
| `round_open_encore(...)` / `round_judge_encore(...)` | Validates the number (positive, decimals, years 1 to 9999), computes the error, band and display string with the same rules as the engine (parity tested) |

On every resolution: `sms = resolved_at - iss[0]`, `cms = p_client_ms`, `rq` (requests in the round), `h = h or p_hidden` (a null `p_hidden` sets the missing-report mark instead), and the too-fast mark when a solve lands within 1.5 s of the clue it answered. The reveal includes crowd stats from `round_stats` once 50 eligible runs exist, and the next round's `RoundMeta`.

`private.finish_attempt_internal(attempt)` runs in the same transaction as the final action:

1. Points: sum of round points (a voided mystery scores 4).
2. Total time: `sum(least(greatest(sms - 400 * rq, cms, 0), 900000))` (PRD §4.3.2, §4.3.3).
3. Encore error and the rank key (§4.6); a voided or missing encore counts 0 for everyone.
4. Flags: 1 visibility (any `h`), 2 expert slot (the hardest-slot mystery solved on clue 1 after a clue-1 dwell more than 3 times the median of `round_stats.clue1_dwell_hist` once it holds 50 solves, else over 120 s), 4 too fast, 8 missing report (PRD §4.3.6: a missing report counts as a flag).
5. Status `finished`. For ranked attempts, a `daily_results` row with `eligible = (flags = 0)`; for eligible ones, the `round_stats`, `wrong_guess_tallies` and dwell histogram increments.
6. Streak: ranked attempts call `private.apply_finish(player, local_date, 'on_time')`; archive attempts of a repairable date call it with `'repair'`; others change nothing (§8.10).
7. Cohort fields on first finish; `players.last_finish_offset_min`.
8. Returns `FinishSummary` with the streak delta and best-moment facts (perfect, new best, milestone, hardest solved on clue 1, bullseye).

### 8.9 Percentiles and crowd stats

```sql
-- inside get_daily_numbers, for the caller's finished attempt (row "me" in daily_results)
select count(*) into v_band_n from private.daily_results
 where track = me.track and daily_number = me.daily_number and eligible and band = me.band;
v_scope_band := v_band_n >= 50;                       -- else use every band (PRD §4.3.4)
select count(*) filter (where rank_key < me.rank_key),
       count(*) filter (where rank_key = me.rank_key),
       count(*)
  into v_worse, v_tied, v_pool
  from private.daily_results
 where track = me.track and daily_number = me.daily_number and eligible
   and attempt_id <> me.attempt_id
   and (not v_scope_band or band = me.band);
v_n := v_pool + 1;                                    -- the player, counted once
-- v_n < 50: cold start; else floor(100 * (v_worse + 0.5 * v_tied) / (v_n - 1))
```

The `daily_results_rank` index makes both counts index range scans, a few milliseconds at 10,000 finishers. Flagged players still get a percentile, because their own row is excluded from the pool either way (PRD §4.3.4). The histogram groups the same pool by points. Unranked plays (archive, challenge-only) read the same pool and return `unranked` with "You'd have beaten N%" once 50 eligible runs exist, and `windowOpen` while the date is still open somewhere. Crowd stats come from the `round_stats` counters with largest-remainder percentages; the most common wrong guess needs 5% of eligible wrong guesses. After the global window closes, the nightly job stores `final_percentile` for the stats page.

### 8.10 Streaks, freezes, repair and protected dates

`private.evaluate_streak(p_player uuid, p_tz text) returns jsonb` is the SQL twin of `evaluateStreak` (§4.11), replayed against `src/engine/fixtures/streaks.json` by generated tests:

1. `T` = the player's local date; `L` = the latest `played` or `repaired` date in `player_days`.
2. For each gap date `L+1 .. T-1` with no row: protected if an incident overlaps `[start_of_day(D, tz), start_of_day(D + 1, tz))` or the date-line rule applies (first gap date, offset grew by 720 minutes or more since the last finish); else `freeze` if a streak is alive and a freeze is held (decrementing `freezes_held`); else `missed`, after which no freeze is spent in that gap. Rows are inserted with `on conflict do nothing`, so evaluation is idempotent; `freeze_spent` and `protected` notices are written once.
3. The chain, current and best streak, repair offer (single Missed date in its span, a chain before it, local time before `M+3 00:00`, no repair in 168 hours) and `repair_blocked_until` are computed and cached in `private.streaks`.

`private.apply_finish(p_player, p_date, p_kind)`: `on_time` writes `played`; `repair` replaces `missed` with `repaired` and records `last_repair_at`; both increment `dailies_finished` and the freeze progress (a grant at 7 while fewer than 2 are held; progress stays 0 while 2 are held, AC-FRZ-01). Protection never spends a freeze (AC-FRZ-05), and voids and rescoring never touch streaks (PRD §3.13.4).

**Outage protection.** `private.incidents` collects heartbeat gaps of 10 minutes or more (detected by cron, §8.15), declared incidents (`declare_incident`) and `publish_failure` incidents from `no_daily`. Players see the one-time `protected` notice on their next visit.

### 8.11 Rooms: the state machine and Realtime

| Phase | Entered by | Timing set by the server | Left by |
|---|---|---|---|
| `lobby` | `create_room` | Ends after 30 minutes idle (cron) | Host `start` with at least one seat: `read` for question 0 |
| `read` | `start` or `next` | `options_at = phase_started_at + clamp(0.25 s × words, 1.5 s, 5 s)`; `skip_read` sets `options_at` to now | `room_tick` at `options_at`: `answering` |
| `answering` | tick | `deadline_at = options_at + T` (T × 1.5 when extended; a seat with extra time gets its own × 1.5 deadline); null when the timer is off | Tick after the last seat's deadline plus 500 ms, every connected seat answered, or host `reveal`: `reveal` (scores computed with `roomPoints`) |
| `reveal` | | | Host `next`: `standings` |
| `standings` | | | Host `next`: `read` for the next question, or `podium` after the last; host `pause`: `paused` |
| `paused` | Host `pause` (between questions only) | | Host `resume`: `standings` |
| `podium` | After the last standings | Ends after 10 minutes | Host `end`: `ended` |
| `ended` | Host `end`, 4 hours total, idle timeouts | Deleted after 24 hours | |

- **Lazy transitions.** `private.room_tick(room)` locks the room row, applies any time-based transition that is due, bumps `version` and sends a hint. Every room RPC calls it first. The host screen also calls `room_host_state` at `options_at` and at the deadline plus 600 ms, so phases move on time even when every phone is idle.
- **Hints.** After each version change: `realtime.send(jsonb_build_object('room', id, 'v', version, 'phase', phase, 'q', question_index, 'deadline', deadline_at), 'hint', 'room:' || id, false)`. Answer counts go only to the host topic `roomhost:<id>`. The topic uses the room's random id, never the join code. Clients treat hints as a reason to refetch, never as truth, since anyone who learns a public topic can send to it ([report 08](./research/08-technical-best-practices.md)); the sync controller refetches at most twice a second and only for a newer version.
- **Message budget.** About five phase hints per question to 21 subscribers plus one host message per answer: roughly 1,900 messages for a 15-question game with 20 phones, so about 1,000 full games a month fit in the 2M quota.
- **Polling.** Every 3 s while the channel is down or a phase is more than 1 s overdue; every 15 s otherwise (PRD §3.8.5).
- **Presence.** Join and heartbeat RPCs, not Realtime Presence. A seat counts as connected with a heartbeat in the last 15 s.
- **Our errors void the question (AC-ROM-04).** Each room RPC body runs inside `begin ... exception when others then ... end`. The handler records `private.rpc_errors` with the room and question, and, if the room is in `read` or `answering`, adds the question to `rooms.voided`, bumps `version`, sends a hint and returns `internal` with a reference. A watchdog in `room_tick` voids an `answering` phase still open 10 s after its last deadline plus grace. A voided question scores nothing, leaves every streak counter `s` as it was, and every screen shows the notice.
- **Fallback.** If database broadcast misbehaves under the gate, `realtime.ts` can switch to Postgres Changes on a tiny `public.room_signals (room_id, version, phase, question_index, deadline_at)` table with an `anon` select policy on those non-secret columns, added to the `supabase_realtime` publication [verified: the publication exists]. SQL-14 writes that migration but the orchestrator applies it only if the gate needs it.

### 8.12 Reports and rescoring

| Target | Threshold | Effect |
|---|---|---|
| Practice item | 3 weighted reports | Added to `private.pulled_items`; clients exclude it on their next online load (AC-RPT-03) |
| Daily round | 3 raw reports | `paged_at` and an alert in the content queue |
| Daily round | Weighted reports from 2% of the date's ranked players and at least 10 | `alert_at`; never an automatic void (AC-RPT-04) |
| Any item | Reports above 1% of plays | Flagged for review |
| Shared quiz | 3 weighted reports | `hidden_at` set; visitors see "This quiz is being reviewed." (AC-UGS-04) |

`private.admin_void_round` marks the round voided in `dailies.rounds`, recomputes points, encore error and rank key for every finished attempt on that date (a voided mystery scores 4; a voided encore ranks everyone equal on it), rewrites `daily_results`, and writes a `rescored` notice for each affected player (AC-RPT-05). `private.admin_correct_key` re-checks stored guesses: the solve clue becomes the first clue at which the player guessed the corrected answer, or picked it on clue 4 (AC-RPT-06). Percentiles, head-to-heads and Group boards read the rewritten rows. Streaks never change. Setting `service_state.content_fix_daily` shows the "We fixed a mistake in today's Daily" banner.

### 8.13 Where the slur filter runs

| Text | Client (instant feedback) | SQL (authoritative) |
|---|---|---|
| Custom nicknames | Nickname field | `set_nickname` |
| Group names and Group nicknames | Create, join and settings forms | `create_group`, `join_group`, `set_group_nickname`, `group_admin` |
| Host renames in rooms | Rename dialog | `room_host_action` |
| Every quiz field and every imported row | Editor and import preview | `save_quiz` |
| Report notes | Not filtered (never shown to anyone); links stripped | `submit_report` strips links |

Room players cannot type names at all, and the 13 to 17 band only picks generated names. The client matcher (`src/engine/text/moderation.ts`) and `private.text_is_blocked` use one term list (`content/safety/`) and one folding table: MOD-1 generates `private.fold_text` as a `translate()` map from the engine's folding table, so the two sides fold identically and return the same verdicts (AC-LNT-03). The term list loads on the client as a lazy chunk, only when a text field needs it.

### 8.14 Analytics ingestion

`log_events` validates each event against `private.event_dictionary` (generated from §3.12), stores it with `ts_server`, and never stores an IP address, user agent, referrer value or free text (PRD §3.16). The nightly job rolls raw events into `private.daily_aggregates` (counts per name, route group, context and day, plus the funnel and cohort views behind G1 to G18) and then deletes raw rows older than 30 days. Day-N retention, cohorts and completion come from attempts, not events (PRD §7.3). Owner-facing SQL views live in `private` and are read through MCP.

### 8.15 Scheduled jobs (`pg_cron`)

SQL-8 installs `pg_cron` as Supabase documents (`create extension pg_cron with schema pg_catalog; grant usage on schema cron to postgres; grant all privileges on all tables in schema cron to postgres;`, [Supabase](https://supabase.com/docs/guides/cron/install)) and schedules seven jobs, all short:

| Job | Schedule (UTC) | Work |
|---|---|---|
| `qz_heartbeat` | every 5 minutes | Insert a heartbeat |
| `qz_incidents` | every 10 minutes | Turn heartbeat gaps of 10 minutes or more in the last 48 hours into incidents (idempotent) |
| `qz_publish` | hourly at :07 | Keep a Daily in place through today plus 3 on every track, using spares if needed; freeze rows ahead; alert when fewer than 30 scheduled Dailies remain |
| `qz_rooms` | every 5 minutes | End rooms idle 30 minutes in the lobby or 4 hours in total; delete ended rooms after 24 hours |
| `qz_hourly` | hourly at :13 | Rotate the IP salt; prune rate counters older than 2 days, expired claims, and idempotency logs 48 hours after their attempts end |
| `qz_nightly` | 03:17 | Abandon attempts whose window closed; store final percentiles; compact attempts older than 30 days; roll up and prune events and practice answers; null report notes after 180 days; delete test players older than a day; database-size, egress and runway alerts |
| `qz_weekly` | Monday 04:23 | Refresh the item calibration view that the weekly content run reads |

Each job body is one call, such as `select private.nightly();`. SQL-8 writes `private.nightly()` and `private.hourly()` as fixed lists of per-area hooks (`nightly_attempts`, `nightly_reports`, `nightly_analytics`, `nightly_rooms`, `nightly_players`, `hourly_prune`), creating every hook as a no-op. Each later ticket replaces only its own hook with `create or replace`, so two tickets in one wave never edit the same function.

### 8.16 Migration files (`supabase/migrations/`)

| File | Ticket | Contents |
|---|---|---|
| `20261101000000_baseline.sql` | SQL-1 | `private` schema, default-privilege revokes, config, allowlist, time zones, salts, counters, error log |
| `20261101000100_helpers.sql` | SQL-1 | `private.now`, `ok`, `err`, `clean_text`, `strip_links`, `valid_tz`, `ip_subject`, `hit`, `peek`, `crockford`, `random_token`, test helpers |
| `20261101000200_identity.sql` | SQL-2 | Players, credentials, sync codes, claims, name parts (with a small starter list), `authenticate`, identity RPCs |
| `20261101000300_content.sql` | SQL-3 | Content tables and the release bookkeeping |
| `20261101000400_attempts.sql` | SQL-4 | Attempts, idempotency log, `get_today`, `start_daily`, `start_archive`, `get_attempt`, `begin_round`, `round_action` with choice rounds, `finish_attempt` skeleton |
| `20261101000500_rounds_mystery_encore.sql` | SQL-5 | Mystery and encore handlers, honest-play flags, `finish_attempt_internal`, `daily_results`, crowd counters |
| `20261101000600_streaks.sql` | SQL-6 | Player days, streaks, notices, incidents, `evaluate_streak`, `apply_finish`, `get_streak`, `ack_notices` |
| `20261101000700_results_stats.sql` | SQL-7 | `get_daily_results`, `get_daily_numbers`, `get_archive`, `get_my_stats` |
| `20261101000800_ops.sql` | SQL-8 | Heartbeats, service state, alerts, aggregates table, `get_service_status`, owner functions for incidents, `pg_cron` jobs |
| `20261101000900_pre_request.sql` | SQL-8 | `public.pre_request` and the `authenticator` setting |
| `20261101001000_reports_practice.sql` | SQL-9 | Reports, tallies, pulled items, hearts, practice answers, item stats, their RPCs, void and key-correction functions |
| `20261101001100_analytics.sql` | SQL-10 | Event dictionary and events tables, `log_events` |
| `20261101001200_moderation.sql` | MOD-1 | Terms, allowlist, generated `fold_text`, `text_is_blocked`, `set_nickname` (the reviewed name lists load as seed data) |
| `20261101001300_challenges.sql` | SQL-11 | Challenges, entries, challenge RPCs, `start_challenge_run`, `start_pack_run` |
| `20261101001400_groups.sql` | SQL-12 | Groups, members, Group RPCs |
| `20261101001500_achievements.sql` | MAS-1 | Achievements table, `record_achievements` |
| `20261101001600_rooms_core.sql` | SQL-13 | Rooms, seats, create, join, heartbeat, state, lobby host actions |
| `20261101001700_rooms_game.sql` | SQL-14 | Answers, `room_tick`, phases, scoring, voids, hints; `room_signals` fallback kept in `supabase/fallback/` |
| `20261101001800_quizzes.sql` | SQL-15 | Quizzes and their RPCs, `start_quiz_run`, takedown |

Data loads are not migrations. `supabase/seed/*.sql` (committed: answer entities, practice item ids, config, moderation terms, name parts, the analytics dictionary, the e2e track) and `supabase/.generated/content-release-*.sql` (sealed, never committed) are applied through `execute_sql` and recorded in `private.content_releases`.

**Who applies what.** A SQL ticket proves its migration with a dry run: through `execute_sql` it runs `begin;`, the migration, its tests, and `rollback;` (Postgres DDL is transactional, so nothing persists). After the merge, the orchestrator applies each new file with `apply_migration`, using the file's stem as the name, in file order, then re-runs the area's tests and the advisors (`get_advisors` for security and performance). `scripts/sql/drift-check.ts` compares the repo's file list with `list_migrations` output pasted into it. Applied migrations are never edited; fixes are new files. Then the orchestrator regenerates `src/lib/supabase/database.types.ts` with `generate_typescript_types`.

### 8.17 SQL tests, test identities and the e2e track

- **Clock.** `private.now()` returns `current_setting('qz.now', true)::timestamptz` when that setting is non-empty and `session_user = 'postgres'` (MCP sessions and cron), else `now()`. PostgREST sessions run as `authenticator`, so clients can never move the clock. Tests call `set_config('qz.now', '2026-11-01T23:59:30Z', true)` between steps.
- **Shape of a test.** `supabase/tests/<area>/<name>.test.sql` is one transaction: `begin;`, setup through `private.t_player(seed)` (a deterministic test player and secret), `do $$ ... assert ...; $$;` blocks that call the public RPCs (optionally after `set local role anon` to prove grants), `select 'PASS <AC id> <name>';`, `rollback;`. A failed `assert` raises, so the MCP call reports the failure.
- **Generated parity tests.** `npm run sql:gen` turns the engine fixture tables (§4.13) into `supabase/tests/generated/*.test.sql`; committed and drift-checked like content outputs.
- **Standing checks** (SQL-1, re-run by every SQL ticket): RLS enabled on every table in `private` and `public`; nothing in `public` executable by `anon` outside `private.rpc_allowlist`; nothing in `private` executable by `anon` or `authenticated`; every `public` function is SECURITY DEFINER with an empty `search_path`.
- **Running them.** `npm run sql:bundle -- --area daily` prints one combined script per area for an agent to paste into `execute_sql`. Results go into the ticket's pull request description and, before launch, into the launch report.
- **Test identities.** Player ids starting `e2e2e2e2-` are test players: `track = 'e2e'`, excluded from every statistic and aggregate, unable to join a `main` Group or challenge, and deleted after a day. They play the `e2e` content track, which `supabase/seed/e2e-track.sql` fills from `content/fixtures/` for every date from 1 November 2026 to 31 December 2028. Anyone can become a test player, which only sandboxes them; that is why the real-backend CI job needs no secret and never shows real sealed content in public CI artifacts.

---

## 9. Identity details

### 9.1 Lifecycle (`src/platform/identity/`)

1. **On load**, before any island reads identity: if `qz:identity` exists, use it. If not, call `GET /api/restore`. A 200 response restores the identity (`source: 'cookie'`) and logs `identity_restored` (source `cookie`) and `storage_lost`. A 204 means there is nothing to restore, so the client mints: `crypto.randomUUID()` for the player id and 32 bytes from `crypto.getRandomValues` for the secret, `registered: false`.
2. **Nothing reaches Supabase until a write.** The first write (usually `start_daily`) registers the identity server-side. On its first successful response the backend calls `markRegistered()`, which posts the identity to `/api/identity` and records `cookieSavedAt`. A practice-only visit therefore makes no Supabase identity call at all (AC-IDN-01; `/api/restore` is our own route and never reaches Supabase).
3. **Cookie refresh.** At most once every 7 days, on a load where `registered` is true, the client posts the identity again so the 400-day `Max-Age` keeps rolling.
4. **Credentials.** Each restored or claimed device gets its own secret. The server keeps up to 10 per player and prunes the least recently used (PRD §3.10.1).
5. **Too old a browser.** If `crypto.getRandomValues` or ES2020 is missing, the app shows "Your browser is too old for [Name]. Updating it should fix this." (PRD §8.6).

### 9.2 Sync code

- **Format.** 16 Crockford base32 characters (80 bits), generated server-side by `create_sync_code`, shown as four groups: `K7QX-2M9P-T4RW-8HNC`. The device stores the code in `qz:sync` for `/me/sync`; the server stores only `sha256` of the normalized code.
- **Input.** Case-insensitive; spaces and hyphens ignored; I and L read as 1, O as 0 (AC-SYN-02). `normalizeCrockford` in `src/engine/types/ids.ts` and the SQL normalizer agree, checked by a parity fixture.
- **Restore** (`/restore`): mint a new secret locally, call `redeem_sync_code(code, newSecret)`, then replace the local identity (`source: 'sync'`) and post the cookie. If the device already has progress (`registered` is true or local history is not empty), show the confirm step first; cancelling keeps the device's identity (AC-SYN-06). There is no merge in v1.
- **Offer triggers** (offer provider `sync`, owned by IDN-2): the third finished Daily in a system browser; the first server-saved quiz; right after the first finish inside an in-app browser (below the claim card) or a detectable private window; before the iOS install pitch; again at the 10th finished Daily if never saved. Never on a first visit in a system browser (AC-SYN-05).

### 9.3 The backup cookie route handlers

| Route | Behavior |
|---|---|
| `POST /api/identity` | Requires `Sec-Fetch-Site: same-origin` and an `Origin` equal to the site origin; body `{ playerId, secret }` must match the UUID and 43-character base64url formats. Sets `__Host-pid=v1.<playerId>.<secret>` with `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=34560000` (400 days, AC-CKE-01). Returns 204 with `Cache-Control: no-store`. Malformed: 400. Cross-site: 403 |
| `DELETE /api/identity` | Same origin checks; expires the cookie; 204 |
| `GET /api/restore` | 403 unless `Sec-Fetch-Site` is `same-origin` (missing counts as cross-site, AC-CKE-03). With a valid cookie: 200 `{ playerId, secret }`; without: 204. Always `Cache-Control: no-store`. Never contacts Supabase |

The handlers read the request, so they render at request time; they hold no secret of ours and need no environment variables. The service worker never handles `/api/*` (AC-PWA-03). No other cookie is ever set (AC-CKE-04), which is why the browser Supabase client runs with session persistence off (§7.5).

**Test note.** `__Host-` cookies need `Secure`. Chromium and Firefox accept Secure cookies on `http://127.0.0.1`; WebKit may not. If the WebKit project cannot store it, the cookie-restore specs (AC-CKE-02, AC-STK-02, AC-ACH-05) run on Chromium and Firefox only, and the launch report lists the WebKit gap for the owner's iPhone check.

### 9.4 In-app browser detection (`src/platform/browser-context.ts`)

```ts
export interface DetectedContext extends BrowserContextInfo { privateWindow: boolean | null }   // BrowserContextInfo: §7.2
export function detectBrowserContext(): Promise<DetectedContext>;   // memoized per page load
```

1. **Installed:** `matchMedia('(display-mode: standalone)').matches` or `navigator.standalone`.
2. **In-app:** `inapp-spy` 5.0.10 (MIT, 3.6 kB gzipped [verified]), loaded with `import()` after first paint. Its user-agent rules plus its Telegram object check ([inapp-spy](https://github.com/shalanah/inapp-spy)). The experimental SFSafariViewController check is not used, so SFSafariViewController counts as `browser` (PRD §3.10.4).
3. **App mapping:** `whatsapp`, `instagram`, `facebook`, `messenger`, `tiktok`, `snapchat`, `linkedin`, `telegram` map one to one; `gsa` maps to `google`; `threads`, `twitter`, `line`, `wechat` and `reddit` map to `other`; none maps to `none`.
4. **Platform:** iPhone, iPad and iPod, or a Mac user agent with touch points, map to `ios`; Android to `android`; other desktop browsers to `desktop`; the rest to `other`.
5. **Private windows:** best effort only (a storage-quota heuristic); `null` when unsure. A detection failure changes nothing else (PRD §3.10.5).

The result feeds `landing_view`, `start_daily` (`p_context`, `p_app`), the offer-card eligibility rules (no install, push or calendar UI in an in-app browser, AC-IAB-05) and the sync-code triggers. E2E covers each fixture user agent (WhatsApp iOS and Android, Instagram, Facebook, TikTok, Telegram, Safari) with `browser.newContext({ userAgent })` (AC-IAB-01).

### 9.5 The claim link

```text
In-app browser (WhatsApp)                                  System browser (Safari, Chrome)
------------------------                                   ------------------------------
first Daily finished
offer card "Keep my streak" --> create_claim()
   token (43 chars, 10 min, stored hashed)
history.replaceState('/claim/<token>')                      player opens the app's menu,
show the two taps for this app; Android adds                "Open in browser"
"Open in Chrome" (intent:// link); sync code below   ---->  /claim/<token>
after 10 minutes: replaceState back to the original URL       peek_claim(token) --> "Continue as Plucky Otter?
                                                               Streak 1 · Daily #42 done."
                                                             [Continue]: mint a new secret,
                                                               redeem_claim(token, newSecret),
                                                               store identity (source 'claim'),
                                                               POST /api/identity, go home:
                                                               "You're all set. Your streak is safe in this browser."
```

- **Single use and expiry** are enforced in SQL (AC-IAB-04). Expired or used tokens show "This link has expired..." with the sync-code entry (PRD §3.10.4).
- **A browser that already has progress** shows the restore confirm step of §9.2.
- **The same container again.** If `/claim/<token>` opens in the browser that created it (same player id locally), the page says the identity is already here and links home; it never redeems its own token.
- **The in-app copy keeps working**, because redeeming adds a credential instead of replacing one.

### 9.6 Restore precedence

| Situation | Outcome |
|---|---|
| Local identity present | Used; the cookie is refreshed if older than 7 days |
| Local storage empty, cookie present | Restored silently from the cookie |
| Local storage empty, no cookie | A new identity is minted |
| Sync code or claim redeemed on a device with progress | Confirm step; on confirm the device switches to the restored identity, and its old identity is left on the server untouched |
| A write fails with `auth_failed` | One cookie restore is attempted; if that does not fix it, the device mints a new identity and explains: "We couldn't find your profile on this device, so we started a new one. If you saved a sync code, you can restore it in Settings." |

---

## 10. Rendering, routing, PWA, security and performance

### 10.1 Routes

"Shell" means a prerendered static shell whose data loads in a client island. Params are read only inside `<Suspense>` (with `useParams()` in a client island), so Next can prerender one App Shell per dynamic route ([verified] Next 16 dynamic-routes docs).

| Route | Group | Rendering | Suspense | Data | Owner |
|---|---|---|---|---|---|
| `/` | `(tabs)` | Static shell; islands from home slots | Tab-bar active marker | Backend after first paint | CORE-0, slot owners |
| `/daily` | `(play)` | Shell | none | `sealed.start({ kind: 'today' })` on mount | DLY-1, DLY-2 |
| `/daily/[number]` | `(play)` | Shell | Island reading params | `sealed.start({ kind: 'archive' })` | ARC-1 |
| `/daily/[number]/results` | `(play)` | Shell | Island reading params | `daily.results`, `daily.numbers` | DLY-3 |
| `/archive` | `(tabs)` | Shell | none | `daily.archive` | ARC-1 |
| `/practice` | `(tabs)` | Static; category grid server-rendered from generated modules | none | none until Start | PRA-2 |
| `/practice/run`, `/practice/results` | `(play)` | Shell | none | Packs from the CDN or cache | PRA-1 |
| `/practice/blitz`, `/practice/survival` | `(play)` | Shell | none | Packs | BLZ-1 |
| `/practice/review` | `(play)` | Shell | none | Local review queue | REV-1 |
| `/challenges` | `(tabs)` | Shell | none | `challenges.shelf` | CHL-1 |
| `/c/[code]`, `/c/[code]/result` | `(landing)` | Shell | Island reading params | `challenges.landing`, `headToHead` | CHL-1 |
| `/c/[code]/play` | `(play)` | Shell | Island reading params | `sealed.start({ kind: 'challenge' })` | CHL-1 |
| `/s/[number]/[code]` | `(landing)` | Stateless: a Server Component decodes params; `generateMetadata` reads params | The decoded grid | None, the URL only | SHR-2 |
| `/s/[number]/[code]/opengraph-image` | | Stateless image route | | None | SHR-2 |
| `/g`, `/g/new` | `(tabs)` | Shell | none | `groups.list` | GRP-1 |
| `/g/[groupId]`, `/g/[groupId]/settings` | `(tabs)` | Shell | Island reading params | `groups.board` (refetch on focus and visibility) | GRP-1 |
| `/j/[code]` | `(landing)` | Shell | Island reading params | `groups.preview` | GRP-1 |
| `/me` | `(tabs)` | Shell | none | `stats.get` plus device data | STA-1 |
| `/me/achievements` | `(tabs)` | Shell | none | Stats and device data | MAS-1 |
| `/me/sync` | `(tabs)` | Shell | none | Device | IDN-2 |
| `/restore` | `(landing)` | Shell | none | `identity.redeemSyncCode` | IDN-2 |
| `/claim/[token]` | `(landing)` | Shell | Island reading params | `identity.peekClaim` | IDN-2 |
| `/settings` | `(tabs)` | Static shell | none | Device | SET-1 |
| `/host` | `(host)` | Shell; `notFound()` when `rooms` is off | none | | ROM-2 |
| `/host/[roomId]` | `(host)` | Shell | Island reading params | `rooms.hostState`, `subscribe` | ROM-2 |
| `/join` | `(landing)` | Static shell | none | | ROM-3 |
| `/join/[code]`, `/room/[roomId]` | `(landing)`, `(play)` | Shell | Island reading params | `rooms.join`, `playerState`, `subscribe` | ROM-3 |
| `/create`, `/create/new`, `/create/[quizId]` | `(tabs)` | Shell; `notFound()` when `editor` is off | `[quizId]` island | Drafts, `quizzes.listMine` | EDT-1 |
| `/create/import`, `/create/help/import` | `(tabs)` | Shell; help page fully static | none | | EDT-2 |
| `/q/[code]`, `/q/[code]/result` | `(landing)` | Shell, `noindex` | Island reading params | `quizzes.landing` | EDT-3 |
| `/q/[code]/play` | `(play)` | Shell, `noindex` | Island reading params | `sealed.start({ kind: 'quiz' })` | EDT-3 |
| `/categories/[slug]` | `(tabs)` | Fully static (`generateStaticParams` over the 12 slugs) | none | Generated modules | CAT-1 |
| Seven legal and trust pages | `(info)` | Fully static | none | none | LGL-1 |
| `/offline` | root | Static | none | none | PWA-1 |
| Not found | root | Static | none | none | LGL-1 |
| `/api/identity`, `/api/restore` | | Request-time route handlers | | Cookie only | IDN-1 |
| `/manifest.webmanifest`, `/sitemap.xml`, `/robots.txt` | | Static metadata routes | | | PWA-1, LGL-1 |
| `/sw.js` | | `public/sw.js`, generated after `next build` | | | PWA-1 |

Indexable routes are `/`, `/practice`, `/categories/*` and the legal pages; everything else exports `robots: { index: false }` through `noindex()` in `src/lib/metadata.ts`, and the sitemap lists only indexable routes (AC-UGS-02). Every link we generate is path-only.

### 10.2 Cache Components rules we follow

1. Request data (`params`, `cookies()`, `headers()`) is read only inside `<Suspense>`, and only on `/s/[number]/[code]` and in route handlers.
2. Client hooks that read the URL (`useParams`, `usePathname`, `useSelectedLayoutSegment`) sit inside `<Suspense>`. The tab bar renders without its active marker as the fallback, because a shared layout's `usePathname` suspends while any route below it has unknown params [verified].
3. `useSearchParams` is not used anywhere (no query strings).
4. No `Date.now()`, `Math.random()` or `crypto.randomUUID()` in Server Components or module scope; client components call them only in effects and handlers, so server and client HTML match.
5. No route segment config exports (`dynamic`, `revalidate`, `runtime`), no `proxy.ts`, no `experimental.useOffline` (the service worker owns offline).
6. **Hidden routes stay mounted** in `<Activity>`. Timers live in effects with cleanup and rebuild from absolute deadlines (`countdownEndsAt`, room `deadline`); Realtime subscriptions, BroadcastChannel listeners and visibility trackers are effects; audio pauses in cleanup; controllers keep state outside React, so a re-shown game screen resumes exactly where it was. Route visibility is not page visibility: the honest-play tracker reads `document.visibilityState` and window blur only.
7. Server data fetching with `"use cache"` is not needed in v1: game data is client-side, and content modules are static imports.

### 10.3 The root layout and the boot script

`src/app/layout.tsx` (DS-1) renders `<html lang="en" suppressHydrationWarning>` with an inline script in `<head>`, following Next's flash-prevention guide (`node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`). The script (under 600 bytes) reads `qz:settings` inside try/catch and sets `data-theme`, `data-motion`, `data-readable` and `data-contrast` on `<html>` before first paint. A tiny client component re-applies them in `useLayoutEffect` to survive React's development remount. The layout also loads the two font families through `next/font/local` with `display: 'swap'`, renders the skip link, and mounts one app-wide pair of live regions (polite and assertive) used through `src/ui/announce.ts`. There are no context providers at the root: islands reach the backend, settings and identity through module singletons, which keeps the shared bundle small.

### 10.4 Share landings and preview images

- **`/s/[number]/[code]`** decodes the code with `decodeShareCode` on the server, inside `<Suspense>`. Valid codes render the grid, "Someone scored 9/12 on Daily #42" and one primary button, "Play today's Daily", which links to `/daily`. An island compares the reader's own local Daily number with the link's ("Your Daily today is #41. #42 unlocks at midnight your time.") and, if the reader already finished today, shows "You scored 10/12 today" from the cached home card. No database call, so it renders with the database paused or the backend `off` (AC-SHR-06).
- **`generateMetadata`** reads params and returns the title, description and `robots: { index: false }`. With Cache Components this defers metadata to request time, which is allowed because the page body also reads params [verified, generate-metadata docs]. Link-preview bots that cannot run scripts (WhatsApp, facebookexternalhit, Twitterbot, which also matches Telegram's agent, Slackbot, Discordbot) receive blocking metadata from Next's default `htmlLimitedBots` list [verified]; we keep the default rather than replace it.
- **`opengraph-image.tsx`** uses `ImageResponse` from `next/og` in the default Node runtime: 1200 by 630, the wordmark, "Daily #42", the score, the grid and the encore token, never an answer. One subset TTF font (Satori cannot read woff2) is read once at module scope. The response sets `Cache-Control: public, max-age=31536000, immutable`, because the URL fully determines the image. Malformed codes get a generic image. A build check keeps every image under 500 kB (AC-SHR-07) and a test scans 200 generated results for answer text (AC-SHR-02).

### 10.5 Feature flags and Beta routes

`NEXT_PUBLIC_FEATURES` is a comma-separated list parsed by `env-parse.ts` (PLT-1) into `env.features`; unset means the defaults in `src/config/features.ts`. Flags: `rooms` and `editor` (off until their gates pass), and the Should features `blitz`, `survival`, `review`, `adaptive`, `mastery`, `achievements`, `calendar`, `install_pitch`, `category_pages`, `monthly_pack`, `read_aloud`, `readable_text`, `high_contrast` (on once built). `isFeatureEnabled(flag)` comes from `@/lib/env`. Beta route modules call `notFound()` when their flag is off; the value is fixed at build time, so the page prerenders as the not-found page (AC-ROM-13). Home slots, achievements (AC-ACH-03) and settings rows check the same flags. Server-side, `private.config.features` makes `create_room` and `save_quiz` return `feature_disabled` when off.

### 10.6 Connectivity and the health monitor (`src/platform/network.ts`, INC-1)

- `navigator.onLine` plus `online`/`offline` events give the device state (`offline`).
- The backend reports every transport failure. Two failures within 30 s while the browser says it is online put the app in `unreachable`; the monitor then retries `get_service_status` after 5, 15, 30 and 60 s, and a success clears the state (AC-INC-02).
- `get_service_status` runs on load, every 5 minutes while the page is visible, and after any failed RPC. Its `state` drives the banners of PRD §3.15.2. A banner known at load renders in place; one that appears later slides in as a fixed overlay, so nothing shifts (AC-INC-05).

### 10.7 PWA: manifest, service worker, offline and updates

**Manifest** (`app/manifest.ts`): name and short name from the brand constant, `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, background and theme colors from the design tokens (with `<meta name="theme-color" media="(prefers-color-scheme: dark)">` for the dark theme), icons at 192 and 512 px plus a maskable 512, an Apple touch icon at 180 px, `categories: ['games', 'entertainment']`.

**Building the worker.** `npm run build` becomes `next build && node scripts/pwa/build-sw.mjs`. That script computes the precache list and runs `@serwist/cli` 9.5.13's `build` (which bundles `src/pwa/sw.ts` with esbuild) into `public/sw.js`. `next start` reads `public/` at server start [verified], and Vercel collects `public/` after the build command, so the worker ships with the deployment. PWA-1 confirms this on a Vercel preview (the spike in M1's plan). If it fails, `src/pwa/sw-fallback.ts` is bundled by esbuild directly, with the same contract and tests.

**Precache** (revisioned by the build id):

| Entry | Source |
|---|---|
| First-load JS and CSS of every offline route (`/`, `/practice`, `/practice/run`, `/practice/results`, `/practice/blitz`, `/practice/survival`, `/practice/review`, `/me`, `/me/sync`, `/settings`, the legal pages, `/offline`, and the editor routes when `editor` is on) | The union of `firstLoadChunkPaths` in `.next/diagnostics/route-bundle-stats.json` [verified file and format] |
| Those routes' HTML shells | Fetched by the worker at install |
| Fonts, the sound sprite, icons | `public/` |
| All 12 practice packs (400 kB gzipped budget) | The content manifest |

**Runtime rules**, in order:

1. Never touch `/api/*` or any cross-origin request (Supabase RPCs and Realtime included) (AC-PWA-03).
2. `/_next/static/*`: cache first (hashed, immutable).
3. `/content/*` (packs and answer lists): cache first, keeping the two newest versions of each.
4. React Server Component requests (`RSC: 1` header) for offline routes: network first, then the cache, then a network error. A network error makes Next fall back to a full navigation (it logs a console error [verified], which the offline E2E specs expect and allow).
5. Navigations: network first with a 3 s timeout, then the precached shell for that path, then `/offline`. Navigations to `/s/*` and `/categories/*` are cached as they happen, so a share landing opened once works offline.

**Registration** happens at idle after the first load (`requestIdleCallback`, with a 3 s fallback), with `updateViaCache: 'none'`. `/sw.js` is served with `Cache-Control: no-cache` and `Service-Worker-Allowed: /` (SEC-1 sets the headers).

**Updates never interrupt a question.** A new worker installs and waits. Home, results screens and stop screens call `useSafePoint()`, which posts `SKIP_WAITING` to a waiting worker. On `controllerchange` the page reloads only if it is on Home; on a results or stop screen the reload waits for the next navigation to Home (AC-PWA-04). `sw_update_applied` records the versions. Old caches are deleted on activation.

**`navigator.storage.persist()`** is called only when `matchMedia('(display-mode: standalone)').matches`, the one context where WebKit grants it ([gap 2](./research/gap-2-web-retention-and-identity.md), AC-PWA-05).

**Offline behavior** follows the PRD §3.11.1 table: Home renders with the Daily card's offline state and Practice promoted; practice modes play fully; stats show cached server figures with "Updated 2 hours ago"; Daily, archive, challenges, Groups, rooms and shared quizzes show their offline copy with a Practice link; settings and legal pages work; the editor edits and plays drafts.

### 10.8 Security headers and the Content Security Policy

SEC-1 replaces the foundation's minimal policy in `next.config.ts` with this one (no nonces, D16). `parsePublicEnv()` supplies the Supabase origin at build time; mock and off builds allow only `'self'`.

```text
default-src 'self';
script-src 'self' 'unsafe-inline';                                   ('unsafe-eval' added in development only)
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' https://zcodouduyvxwefxebvmv.supabase.co wss://zcodouduyvxwefxebvmv.supabase.co;
worker-src 'self' blob:;                                             (realtime-js heartbeat worker)
manifest-src 'self';
media-src 'self';
frame-src 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;                                           (only when the site URL is https)
```

Other headers on every response: `Referrer-Policy: no-referrer` (PRD §8.4), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=()` (Web Share and clipboard stay available). Vercel adds HSTS. Per path: `/sw.js` gets `Cache-Control: no-cache` and `Service-Worker-Allowed: /`; `/content/:path*` gets `Cache-Control: public, max-age=31536000, immutable`; `/api/:path*` gets `Cache-Control: no-store`. Vercel preview deployments inject the toolbar from `vercel.live`; SEC-1 allows it in `script-src`, `connect-src` and `frame-src` only when `NEXT_PUBLIC_VERCEL_ENV` is `preview`. SEC-1 also evaluates `experimental.sri` and records the result. A smoke spec asserts every header on `/`, `/daily`, `/sw.js` and an API route.

### 10.9 Performance plan

**The budget is mostly spent before we write a line.** The empty foundation route ships 135.4 kB gzipped [verified], so app code on `/` gets about 14.6 kB, and play routes (budget 180 kB, PRD §8.1) get about 44.6 kB.

| Route | Budget (first-load JS, gzipped) | Our share | Enforced by |
|---|---|---|---|
| `/` | 150 kB | about 14.6 kB | `npm run check:bundle` (SEC-1 adds the routes below) |
| `/daily`, `/practice/run` | 180 kB | about 44.6 kB | same |
| Every other route | 200 kB | about 64 kB | same (a guard, not a PRD number) |

How we stay inside it:

1. **Server Components for everything static.** The home cards' text, the practice category grid, footers and legal pages are HTML, not JavaScript.
2. **Tiny islands.** Home ships the Daily card island, the streak chip, the Quick-play button and the tab-bar marker, each a few kilobytes. Everything else loads with `import()`.
3. **No heavy client libraries.** No zod, date library, state library, CSS-in-JS or component kit in the browser. Motion uses CSS transitions, `@starting-style`, the Web Animations API and View Transitions (PRD §8.1). `motion` is not installed unless DESIGN.md demands it, and then only lazily.
4. **Lazy-only modules** carry a marker string (`__qz_lazy_<name>__`) and the bundle check fails if any marker appears in a route's first-load chunks: the Supabase SDK, the mock backend, `inapp-spy`, the confetti module, the QR generator, the CSV and Format A importer, the editor, the moderation term list, the share-image helpers and the sound sprite decoder.
5. **Warm the path to clue 1.** Home's Play button is a `<Link prefetch>` to `/daily`; at idle after first paint, `prefetchBackend()` loads the backend chunk and SDK so the first tap only waits for `start_daily`. The Daily's answer lists load at start, in parallel with clue 1 (PRD §3.1.3).
6. **Fast transitions.** The next round's layout arrives with each verdict (§1.4 item 2); practice judges locally, so Continue to the next stem stays under 100 ms.
7. **INP.** Answer handlers paint the pressed state in the same frame and defer scoring, sound and analytics with `startTransition`; a Playwright trace test with 4x CPU throttling keeps the answer tap handler under 50 ms (PRD §8.1).
8. **LCP and CLS.** The LCP element is static text (the Daily card heading) with preloaded subset fonts and `adjustFontFallback`; skeletons match final sizes; late banners overlay instead of pushing content.
9. **Measure in the field.** `web_vitals` (sampled at 25%) and `Q1`, measured from navigation start to the first clue or question on screen with `performance.mark` in the round components, sent once per session unsampled.

Lighthouse CI (CI-1) asserts LCP 2,000 ms, TBT 200 ms, CLS 0.05 and a performance score of 90 or more on throttled mobile for `/`, `/daily`, `/practice` and a share landing. Locally it runs with Playwright's Chromium (`CHROME_PATH=/opt/pw-browsers/chromium...`).

---

## 11. Testing strategy

### 11.1 Layers

| Layer | Tool | Lives in | Covers | Runs |
|---|---|---|---|---|
| Engine unit | Vitest (Node env) | `src/engine/**/*.test.ts` | Every rule in PRD §4, every worked example and scenario table, the run machine invariants (§4.5), parsers, codecs; 95% lines and 90% branches | `npm test`, CI `verify` |
| Platform and model unit | Vitest (jsdom) | next to the code | Storage migrations, server clock, outbox, controllers driven by the mock backend in memory | same |
| Backend contract | Vitest | `src/backend/contract/` | One behavioral suite per `GameBackend` area: against the mock in every run, against the real project in CI (§11.7) | `npm test`; `backend-contract` workflow |
| Adapter decoding | Vitest | `src/backend/supabase/**/*.test.ts` | Decoders against recorded RPC payloads (`__fixtures__/<rpc>.json`, captured through MCP during the SQL ticket) | `npm test` |
| Content | Vitest plus `content:check` | `src/content/schema/**/*.test.ts` | Good and bad sample files for every schema and cross-file rule | `npm test`, CI `verify` |
| Component | Vitest, Testing Library, user-event | `src/features/**/*.test.tsx`, `src/ui/**/*.test.tsx` | Interaction contracts: combobox (ARIA 1.2 pattern), commit on release, 1 to 4 shortcuts scoped to the question, encore preview, stop-screen order, offer priority, settings persistence | `npm test` |
| E2E, mock backend | Playwright 1.63.0 | `e2e/<area>/*.spec.ts` | Every Must acceptance criterion that is not tagged [SQL] or [Real]; multi-page rooms; offline; PWA | `npm run test:e2e`; CI matrix |
| Accessibility | `@axe-core/playwright` 4.14.0, Playwright | `e2e/a11y/*.spec.ts` | AC-A11Y-01 to 06 | CI `a11y` job and locally |
| SQL | `execute_sql` through MCP | `supabase/tests/**` | Every [SQL] criterion, privileges, RLS, parity fixtures | Agents, per ticket and before launch |
| Real backend | Playwright and Vitest on GitHub runners | `e2e-real/`, `*.real.test.ts` | Every [Real] criterion, a full Daily, identity restore, a challenge, a Group, a 1 host plus 10 phone room | `e2e-real` and `backend-contract` workflows |
| Performance | `check:bundle`, Lighthouse CI, Playwright traces | `scripts/`, `lighthouserc.json`, `e2e/perf/` | §10.9 | CI |

### 11.2 Unit tests

- **Table-driven from fixtures.** Engine tests load `src/engine/fixtures/*.json` (§4.13); the same rows feed the SQL parity tests, so one fixture edit moves both.
- **Time and randomness** come from `createFakeClock` and `createRng('<literal>')`; no test sleeps.
- **Selection properties.** AC-PRA-03 runs 1,000 seeded practice plans and asserts the composition rules for each; AC-PRA-09 simulates a fixed-ability player for 100 answers.
- **Copy lint (AC-STK-06).** A test scans `src/features/streaks/copy.ts` for "lost", "don't break", "hurry" and exclamation marks.
- **Static checks** (`scripts/checks/forbidden-imports.mjs`, run by `npm test`): the Daily, archive and repair module graphs import no module whose path or export mentions entitlement, paywall, purchase, price or ad (AC-DLY-19, AC-RPR-07), and no Survival code path can restore or sell a strike (AC-SUR-03, static half).

### 11.3 Component tests

`renderWithUser()` from `@/test/render` (foundation) plus fake controllers built from the engine. Round components are tested against `RoundComponentProps` with literal `RoundOpen` and `RoundReveal` values, so they never need a backend. Every interactive component test also asserts accessible names and roles with `getByRole`.

### 11.4 E2E on the mock backend

- **Build.** As in the foundation: `next build` and `next start` on `127.0.0.1:3100` with `NEXT_PUBLIC_BACKEND_MODE=mock` and blank public variables. `e2e/fixtures.ts` keeps failing any test that logs a console error or reaches an external host.
- **Service workers are blocked** (`serviceWorkers: 'block'`) in every project except `pwa-chromium`, because requests from a worker bypass Playwright routing (foundation note in `e2e/fixtures.ts`).
- **Helpers** (`e2e/support/`, PLT-1):

```ts
await mockInit(page, { scenario: 'streak_23_missed_yesterday', seed: 'ac-rpr-01' });   // before page.goto
const mock = mockControls(page);          // typed proxy to window.__qzMock
await mock.failNext('sealed.act', 'unreachable', { times: 2 });
await mock.addFinishers(dailyNumber, 49); // AC-DLY-15: cold start at 49, numbers at 50
await setClock(page, '2026-11-01T23:59:30', 'Europe/London');   // page.clock plus timezoneId
const sealed = await expectSealedPayloads(page);   // scans mock.responses() for answer ids before resolution
```

- **Time zones.** Specs that care about local dates create their context with `timezoneId` and drive time with `page.clock` (AC-DLY-08, AC-DLY-17, AC-GRP-05). The mock reads the page clock, so server and client agree.
- **Offline.** `context.setOffline(true)` makes `navigator.onLine` false; the mock then fails every call with `offline`, as Supabase would.
- **Multi-page rooms.** One browser context, several pages. Each page gets `addInitScript(() => { window.__QZ_DEVICE__ = 'phone-3' })`, so it has its own storage namespace, identity and seat token, while all pages share the mock database (localStorage plus Web Locks) and hints (BroadcastChannel). The host page uses a 1280 by 720 viewport and phones a 390 by 844 one.
  - AC-ROM-01: host plus 5 phones join by code, play the 15-question fixture pack to the podium, and every phone's final score matches the host's standings.
  - AC-ROM-02: close phone 3 during question 3, open a new page with the same device id during question 5; it lands on its old seat with its score, and questions 3 and 4 score 0.
  - AC-ROM-03: `mock.setRealtime('down')`; the same game completes and every phase change reaches every page within 4 s through polling.
  - AC-ROM-04: `mock.failNext('rooms.answer', 'internal', { when: { questionIndex: 6 } })`; question 7 is voided on every screen and streak bonuses on question 8 behave as if it never happened.
  - AC-ROM-05, 07, 12 and 13 follow the same pattern. The true multi-device version (separate contexts, real Realtime) is AC-ROM-11 in the real-backend job.
- **Sealed assertions in mock mode** check the mock's response log, proving the contract; the real network assertions (AC-DLY-03, AC-DLY-04, AC-ROM-09, AC-UGS-03) run again in `e2e-real/` with `page.on('response')`.
- **Expected console errors.** The offline navigation fallback logs "Failed to fetch RSC payload" [verified]; offline specs remove exactly that message from `consoleErrors` and fail on anything else.

### 11.5 Accessibility

- `expectNoSeriousAxe(page)` runs `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])` and fails on any `serious` or `critical` violation. A route crawler visits every route in the §10.1 table (Beta routes with their flags on) in light and dark (`page.emulateMedia({ colorScheme })`) (AC-A11Y-01).
- `forcedColors: 'active'` and `reducedMotion: 'reduce'` emulation (Chromium), a 320 px viewport, 200% text (an injected `html { font-size: 200% }`) and the WCAG 1.4.12 text-spacing styles, with screenshot diffs for clipping (AC-A11Y-04, AC-A11Y-06).
- Keyboard-only journeys use only `page.keyboard` (AC-A11Y-02); accessibility-tree baselines use `toMatchAriaSnapshot` (AC-A11Y-03); target sizes are measured with bounding boxes (AC-A11Y-05).
- Real VoiceOver and TalkBack passes are beta gates, reported "not run" before then (AC-A11Y-07).

### 11.6 SQL tests through MCP

The conventions are in §8.17. Each SQL ticket ships tests for every RPC it adds: the success path, the wrong-secret path (AC-IDN-03, table-driven over every write RPC), each validation rule, each rate limit, and each [SQL] criterion in its area. The standing checks (privileges, RLS, definer settings) run with every ticket. Before launch QA-2 runs the whole suite, plus `get_advisors` for security and performance, and records the results in the launch report.

### 11.7 The real-backend jobs (GitHub Actions)

GitHub runners can reach Supabase; the sandbox cannot (constraints).

| Workflow | Triggers | Does |
|---|---|---|
| `backend-contract.yml` (SQL-1) | Push to any branch touching `supabase/` or `src/backend/`, nightly, manual | `QZ_REAL_BACKEND=1 npx vitest run --project contract-real`: the contract suites against the real project, in Node, with test identities |
| `e2e-real.yml` (CI-1) | Push to `main`, nightly at 05:17 UTC, manual | Builds with `NEXT_PUBLIC_BACKEND_MODE=supabase` (the built-in URL and publishable key, no secret), starts the app, runs `playwright test -c playwright.real.config.ts` on Chromium. Its fixtures allow `zcodouduyvxwefxebvmv.supabase.co` over https and wss and nothing else. Specs: a full Daily on the e2e track with network sealed assertions; sync-code restore across two contexts (AC-SYN-01); claim redemption; a challenge between two contexts; a Group join and the hidden-until-finished board (AC-GRP-06); a room with 1 host and 10 phones in separate contexts (AC-ROM-11) |
| `keepalive.yml` (CI-1) | Daily, and every 30 minutes as the availability probe | `curl` POST to `rpc/get_service_status` with the publishable key; fails the run on a non-200 response |

Test identities (`e2e2e2e2-` prefix) are injected into local storage with `addInitScript` before the app loads, so every write lands on the e2e track and in no statistic. The jobs run one at a time (`concurrency: e2e-real`) to stay clear of rate limits. Playwright reports are uploaded only on failure; they can only ever contain fixture content. GitHub suspends scheduled workflows in public repositories after 60 days without activity, which goes on the owner's checklist.

### 11.8 Browser matrix and CI layout

| Project | Device | Local (sandbox) | CI |
|---|---|---|---|
| `desktop-chromium` | Desktop Chrome | yes | yes |
| `mobile-chromium` | Pixel 7 | yes | yes |
| `mobile-webkit` | iPhone 15 | no (no WebKit in the sandbox) | yes |
| `desktop-firefox` | Desktop Firefox | no | yes |
| `pwa-chromium` | Desktop Chrome, service workers allowed | yes | yes |

`playwright.config.ts` builds the project list from `E2E_ALL_BROWSERS`; CI sets it to 1 and installs one browser per matrix job (`npx playwright install --with-deps <browser>`); the sandbox never runs `playwright install` (brief). Jobs in `ci.yml` after PLT-1 and CI-1: `verify` (lint, format, typecheck, unit, content check, build, bundle budget, bundle scans), `e2e` (matrix: chromium, webkit, firefox), `a11y` (Chromium), `lighthouse` (Chromium) and `content-sealed` (only when the `QZ_CONTENT_KEY` secret exists).

### 11.9 Traceability

Every test that proves an acceptance criterion carries its id at the start of its title. `scripts/checks/ac-coverage.mjs` lists every AC id in `docs/PRD.md`, greps the test trees, and prints the ones with no test. QA-2 turns it into a release gate: every Must criterion has a passing test or an explicit "not run" with the reason.

---

## 12. Work breakdown

### 12.1 How the plan runs

- **One ticket, one branch, one agent.** Branch `t/<ID>` from the integration branch. A ticket edits only the paths under **Owns** plus the **Touch** paths it lists. Stubs from CORE-0 carry final signatures, so a ticket that needs another area's module codes against its stub and never edits it.
- **Definition of done.** `npm run check` (lint, typecheck, unit tests) passes; the ticket's E2E specs pass on Chromium; `npm run build` and `npm run check:bundle` pass; no new console errors; acceptance criteria named below have tests whose titles start with the AC id. SQL tickets add: a dry run through `execute_sql` (`begin`, the migration, the tests, `rollback`) that passes; recorded payload fixtures for their adapter decoders; and the result lines pasted into the pull request.
- **Machine limits.** The sandbox has 4 CPUs. Parallel tickets each set a distinct `E2E_PORT`, and the orchestrator lets only one `next build` run at a time.
- **Wave exit.** The orchestrator merges the wave's tickets in table order, applies new migrations with `apply_migration` (file stem as the name), loads changed seed data, regenerates `database.types.ts`, then runs `npm run check`, the full Chromium E2E suite and the wave's exit spec. A failing exit check is fixed before the next wave starts.
- **Persona playtests** (PRD M1) start after the Wave 1 exit and repeat after Wave 14. Content production runs in parallel throughout and is not in these tickets.
- **Sizes** are for one developer agent: S is about 1 hour, M about 1.5 hours, L about 2 hours.

### 12.2 Waves at a glance

| Wave | Milestone | Tickets (built in parallel) | Exit check |
|---|---|---|---|
| 0 | M1 | CORE-0 (bootstrap, alone) | `npm run check`, build, smoke spec; Home renders the greybox shell |
| 1 | M1 | PRA-1, MYS-1, DLY-1 | `e2e/greybox.spec.ts`: Quick play to results; a fixture Daily of three Mysteries and an Encore to the stop screen with share text; reload resumes mid-Mystery. **Playable greybox for persona playtests** |
| 2 | M1 | ENG-2, PLT-1, DS-1 | Engine covers PRD §4 with every worked example; lint boundaries on; design tokens live |
| 3 | M2 | SQL-1, CNT-1, IDN-1 | Baseline migration applied; content builds from sources; backup cookie works |
| 4 | M2 | SQL-2, SQL-3, IDN-2 | Identity RPCs live; sealed content pipeline and e2e track loaded; sync code and claim flows on the mock |
| 5 | M2 | SQL-4, DLY-2, PRA-2 | Choice rounds in SQL; complete Daily screen and practice on the mock |
| 6 | M2 | SQL-5, DLY-3, STK-1 | Sealed Mystery and Encore in SQL; full stop screen; streak UI |
| 7 | M2 | SQL-6, ARC-1, INC-1 | Streaks in SQL; archive and repair; banners |
| 8 | M2 | SQL-7, STA-1, SET-1 | Percentiles and stats in SQL; stats and settings pages |
| 9 | M2 | SQL-8, RPT-1, ANA-1 | Cron, health, rate-limit hook; reports and hearts; analytics |
| 10 | M2 | SQL-9, SQL-10, LGL-1 | Reports and analytics in SQL; legal pages |
| 11 | M2 | SEC-1, PWA-1, MOD-1 | CSP and headers; offline PWA; slur filter on both sides. **M2 exit review** |
| 12 | M3 | SHR-1, SHR-2, SQL-11 | Share text, landing and preview image; challenges in SQL |
| 13 | M3 | CHL-1, SQL-12, CI-1 | Challenge links; Groups in SQL; real-backend and Lighthouse jobs |
| 14 | M3 | GRP-1, QA-1, A11Y-1 | Groups; real-backend suite; accessibility sweep. **M3 exit review and persona round** |
| 15 | M2 Should | BLZ-1, REV-1, MAS-1 | Blitz, Survival, review, adaptive Mixed, mastery, achievements |
| 16 | M3 Should | CAL-1, CAT-1, SND-1 | Calendar reminder and install pitch; category pages and monthly pack; sound and read aloud |
| 17 | M4 (Beta) | SQL-13, ROM-1, EDT-1 | Room core in SQL; mock rooms and sync controller; quiz editor |
| 18 | M4 (Beta) | SQL-14, ROM-2, EDT-2 | Room gameplay in SQL; host screen; bulk import |
| 19 | M4 (Beta) | ROM-3, SQL-15, EDT-3 | Phones in rooms; quizzes in SQL; sharing user quizzes |
| 20 | M4, M5 | ROM-4, PERF-1, QA-2 | Rooms gate result recorded; budgets met; release checks |

### 12.3 Tickets

#### Wave 0

**CORE-0 · Contracts and walking skeleton** · L · depends on nothing
- **Scope.** The largest ticket and mostly transcription: §3 types into `src/engine/types/` with the id parse helpers and `normalizeCrockford`; §3.12 into `src/analytics/dictionary.ts`; §7.2 into `src/backend/types.ts` and `errors.ts`. Engine core: `rng.ts`, `clock.ts`, `time/`, plugin types and registry (§4.4) with stub plugins and a test plugin (`rounds/testing/echo.ts`), and the full run reducer (§4.5). Backend skeleton: `getBackend`, `prefetchBackend`, the off backend, the mock composition with a memory store and stub areas, stub Supabase adapters. Platform: `storage/` (kv, schema v1, migration runner), `settings/store.ts` (full `Settings`), `clock.ts`, `server-clock.ts`, `identity/provider.ts` (interface). Config: `tunables.ts` with every PRD tunable, `shared.json`, `features.ts`. Content: `types.ts` and loader stubs. Every extension-point stub in §2.3 (except those PRA-2 and SET-1 create); in mock builds the `track()` stub records calls in `window.__qzTrackLog`, so specs can assert events before ANA-1. App skeleton: the five route-group layouts as greybox, `src/features/shell/` (header, tab bar with its active marker inside `<Suspense>`, play header), Home moved to `src/app/(tabs)/page.tsx` (with the foundation's `page.test.tsx`) composing the home slots, greybox `src/ui/` primitives (Button, AnswerButton with pressed-on-`pointerdown` and commit-on-`click`, Card, Sheet, Skeleton, ProgressSegments, `announce.ts`). `tsconfig.json`: `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`. `e2e/greybox.spec.ts` as `test.fixme`.
- **Owns.** `src/engine/**`, `src/analytics/**`, `src/backend/**`, `src/content/types.ts`, `src/content/loaders/**`, `src/config/**`, `src/platform/{storage,settings}/**`, `src/platform/{clock,server-clock}.ts`, `src/platform/identity/provider.ts`, `src/platform/{sound,haptics}*`, `src/features/{shell,home,rounds,offers}/**`, the stub files of §2.3, `src/ui/**`, `src/app/(tabs)/page.tsx`, `src/app/(*)/layout.tsx`, `src/app/page.tsx` and `src/app/page.test.tsx` (moved), `tsconfig.json`, `e2e/greybox.spec.ts`.
- **Acceptance.** Unit: an `rng` sequence fixture; `localDateOf` at UTC+14, UTC-12 and across a DST change; `globalWindow`; `dailyNumberFor`; run-machine invariants 1 to 8 with the test plugin; storage migration from a v0 fixture; kv fallback when `localStorage` throws; settings defaults. E2E: `e2e/smoke.spec.ts` passes; Home shows four tab-bar destinations with accessible names. Build and bundle budget pass.

#### Wave 1: the playable greybox

**PRA-1 · Practice greybox** · L · depends on CORE-0
- **Scope.** The `choice` plugin, both halves (§4.4.1). `planPracticeRun` with bands, Mixed 4/4/2, composition rules, the first-question rule and option order (seen index and denylist accepted as inputs). Practice controller: local judge, `LocalRunSnapshot` persistence and resume, run history. `ChoiceRound` component: answer buttons, reveal at 400 ms, explanation sheet with Continue where the answers were, keys 1 to 4 scoped to the question, status announcements. Routes `/practice/run` and `/practice/results` (score, questions with verdicts, Play again). The Quick-play home slot. Fixture pack loader over `content/fixtures/practice/*.json` (40 items).
- **Owns.** `src/engine/rounds/choice/**`, `src/engine/practice/**`, `src/features/rounds/choice/**`, `src/features/practice/**`, `src/app/(play)/practice/{run,results}/page.tsx`, `src/content/loaders/practice.ts`, `content/fixtures/practice/**`, `e2e/practice/greybox.spec.ts`.
- **Acceptance.** AC-PRA-03 (1,000 seeded plans), AC-PRA-04, AC-PRA-08 (engine); commit on release and scoped shortcuts (component); AC-PRA-01, AC-PRA-11, AC-PRA-12 and resume after reload (E2E).

**MYS-1 · Mystery and Encore rounds** · L · depends on CORE-0
- **Scope.** `mystery` and `encore` plugins, both halves, with `optionsFromClue`; `encore/parse.ts`; mystery and encore scoring helpers; the suggestion engine (§4.7) with its benchmark. `MysteryRound`: answer-type line, clue stack, ARIA 1.2 combobox with listbox popup, Guess disabled until a selection, Next clue ("Last clue and options" on clue 3), struck-through wrong-guess chips, clue-4 options with "Already guessed", the reveal card (answer, all four clues with "Not needed", explanation, Learn more as a Wikipedia search link, sources line, `RevealActions` slot, Continue). `EncoreRound`: `inputmode`, preview line, inline errors, Lock in, result line with band. `AnswerListHandle` over fixture lists (countries with aliases, about 60 films, 118 elements).
- **Owns.** `src/engine/rounds/{mystery,encore}/**`, `src/engine/{encore,suggest}/**`, `src/engine/scoring/{mystery,encore}.ts`, `src/engine/fixtures/{mystery-scoring,encore}.json`, `src/features/rounds/{mystery,encore}/**`, `src/features/rounds/answer-list.ts`, `src/content/loaders/answer-lists.ts`, `content/fixtures/answer-lists/**`.
- **Acceptance.** Every row of PRD §4.1.7 and §4.2.4 (engine); parse failures; matching, typo tolerance from 5 characters, ranking ties; suggestion benchmark under 4 ms; combobox keyboard behavior and announced counts, exact-Enter selection, disabled already-guessed options, the encore preview "You're answering 1,250 km" (component).

**DLY-1 · The sealed Daily on the mock backend** · L · depends on CORE-0
- **Scope.** The persistent mock store (localStorage, Web Locks, BroadcastChannel), context and controls (`reset`, `seed`, `failNext`, `setLatency`, `inspect`, `responses`), and the `identity` (register on first write), `sealed` (start today, get, beginRound, act with idempotency, finish; generic over plugins) and `daily` (today card, basic results) areas. Fixture Daily content (6 mysteries, 3 encores, cycled so every date has a Daily, plus the two AC-DLY-09 compositions). Local identity minting (`src/platform/identity/local.ts`). The Daily controller (run machine plus backend commands, retry schedule, resync, announcement copy). Greybox Daily screen (header with four-segment progress and stopwatch, round area from the registry, Continue labels), greybox stop screen (score card, rounds, plain share text from `share/text.ts` linking to `/daily` until ENG-2's codes exist, Done for today), the home Daily card slot (not started, in progress, finished). Routes `/daily` and `/daily/[number]/results`. Writes and un-fixmes `e2e/greybox.spec.ts`.
- **Owns.** `src/backend/mock/{index,store,context,controls,realtime,fixtures}.ts`, `src/backend/mock/server/{identity,sealed,daily}.ts`, `src/platform/identity/local.ts`, `src/features/daily/**`, `src/engine/share/text.ts`, `src/app/(play)/daily/page.tsx`, `src/app/(play)/daily/[number]/results/page.tsx`, `src/content/loaders/fixture-daily.ts`, `content/fixtures/daily/**`, `e2e/daily/greybox.spec.ts`, `e2e/greybox.spec.ts`.
- **Acceptance.** On the branch: the sealed area with the test plugin (a repeated key returns the stored result; stale steps; idempotent `beginRound`), controller retry and resync tests. Wave exit (after PRA-1 and MYS-1 merge): AC-DLY-01, a full fixture Daily to the stop screen with share lines in order, AC-DLY-07, AC-DLY-09, and a Quick-play run.

#### Wave 2: engine completeness, tooling, design system

**ENG-2 · Streaks, ranking, rooms and share codes in the engine** · L · depends on CORE-0
- **Scope.** `evaluateStreak` and `applyFinish` (§4.11); ranking, `rankKey`, percentile, offset bands, largest remainder; room points, grace window and ranking; Blitz points; head-to-head and week ranking; share codes and alt text (§4.10); the five fixture tables; `content/compositions.json`.
- **Owns.** `src/engine/streaks/**`, `src/engine/scoring/{ranking,percentile,room,blitz,social}.ts`, `src/engine/share/code.ts`, `src/engine/fixtures/{streaks,ranking,percentile,room-scoring,share-codes}.json`, `content/compositions.json`.
- **Acceptance.** PRD §4.4.8 S1 to S10, AC-RPR-01 to 04, AC-FRZ-01 to 05, AC-INC-03 (engine halves); every row of PRD §4.5.5 and the AC-ROM-08 boundaries; AC-BLZ-02; AC-CHL-05's 12 pairings; AC-SHR-03 over 10,000 random results; share-code round trips and malformed inputs.

**PLT-1 · Platform tooling** · L · depends on CORE-0
- **Scope.** ESLint layer rules (§2.2) including engine purity, fixing any Wave 1 code they flag. Pinned dependencies added once: `zod` 4.6.7, `inapp-spy` 5.0.10, `@axe-core/playwright` 4.14.0, `qrcode-generator` 2.0.4, `serwist` and `@serwist/cli` 9.5.13, `esbuild`, `@vitest/coverage-v8`, `@lhci/cli`. npm scripts for content, SQL, real-backend and performance tasks. Vitest projects (jsdom unit, Node engine, `contract-real`) and engine coverage thresholds. Playwright: projects per §11.8, service workers blocked, `pwa-chromium` placeholder, `playwright.real.config.ts` skeleton, `e2e/support/` helpers (§11.4). `ci.yml` E2E matrix. `env-parse.ts`: `NEXT_PUBLIC_FEATURES` and `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` as the app version, with tests. `.gitignore` additions (`content/.sealed-plain/`, `supabase/.generated/`, `public/sw.js`).
- **Owns.** `eslint.config.mjs`, `package.json`, `package-lock.json`, `vitest.config.mts`, `playwright.config.ts`, `playwright.real.config.ts`, `e2e/fixtures.ts`, `e2e/support/**`, `.github/workflows/ci.yml`, `src/lib/env.ts`, `src/lib/env-parse.ts` (and tests), `.gitignore`, `scripts/checks/forbidden-imports.mjs`.
- **Acceptance.** A lint fixture importing React into `src/engine` fails; the repo lints clean; feature-flag parsing tests; `E2E_ALL_BROWSERS=1 npx playwright test --list` shows WebKit and Firefox projects; local E2E still green on Chromium.

**DS-1 · Design system foundation** · L · depends on CORE-0 and DESIGN.md
- **Scope.** Tokens in `globals.css` for both themes (surfaces, semantic correct, incorrect, selected and warning, the high-contrast pair, readable text), `data-*` attribute theming, two font families through `next/font/local`, the boot script with its development re-apply (§10.3), primitives restyled to DESIGN.md (Button, AnswerButton states, Card, Sheet, Dialog, Skeleton, Banner, ProgressSegments, Stopwatch, Segmented control, Chip, Toast), the shell (header, tab bar, play header, footer), focus rings, the skip link, reduced-motion and forced-colors rules.
- **Owns.** `src/app/layout.tsx`, `src/app/globals.css`, `src/app/fonts/**`, `src/ui/**`, `src/features/shell/**`, `src/platform/settings/boot.ts`.
- **Acceptance.** A token test computes contrast (4.5:1 text, 3:1 states, both themes); the boot script sets attributes from stored settings; first paint is dark when dark is stored (screenshot); forced-colors emulation keeps state borders; axe clean on `/` in both themes; no horizontal scroll at 320 px; bundle budget passes.

#### Wave 3

**SQL-1 · Database baseline and RPC plumbing** · L · depends on PLT-1
- **Scope.** Migrations `..._baseline.sql` and `..._helpers.sql` (§8.2, §8.16); `supabase/README.md`; SQL test helpers and the standing checks (§8.17); `scripts/sql/{bundle-tests,drift-check}.ts`; `src/backend/supabase/{client,rpc,decode}.ts`; `src/lib/supabase/browser.ts` switched to supabase-js with persistence off; the `backend-contract.yml` workflow; the contract harness.
- **Owns.** Those files, `src/lib/supabase/**` (and its tests), `supabase/tests/baseline/**`, `src/backend/contract/harness.ts`, `.github/workflows/backend-contract.yml`.
- **Acceptance.** The dry run passes; standing checks (RLS everywhere, the `anon` allowlist, nothing in `private` executable, definer and empty `search_path`); `private.now()` honors `qz.now` only for `postgres`; `private.hit` window behavior; RPC wrapper tests (envelope mapping, 429, offline and unreachable, timeout, server-clock samples); the browser client writes no storage and no cookie.

**CNT-1 · Content schemas and the build** · L · depends on PLT-1, Wave 1
- **Scope.** zod schemas and cross-file rules (§5.2); `scripts/content/{build,check}.ts`; every output of §5.3; loaders switched to the generated manifest; `content/categories.json`; fixtures moved to the source formats; generated `supabase/seed/{answer-entities,practice-items,config}.sql`; the `content:check` step and drift check in CI.
- **Owns.** `src/content/schema/**`, `src/content/generated/**`, `src/content/loaders/**`, `scripts/content/{build,check}.ts`, `scripts/content/lib/**`, `content/categories.json`, `content/README.md`, `content/fixtures/**`, `public/content/**`, those seed files. **Touch:** `.github/workflows/ci.yml` (one step), `src/backend/mock/fixtures.ts` (switch to the generated module).
- **Acceptance.** Good and bad samples for every rule; two builds produce identical outputs; the drift check fails on a hand-edited pack; size budgets enforced; the Wave 1 greybox specs still pass on generated content.

**IDN-1 · Guest identity and the backup cookie** · M · depends on DLY-1
- **Scope.** `src/platform/identity/` in full (§9.1): load, restore order, mint, `markRegistered` posting the cookie, 7-day refresh, `replace`, cross-tab broadcast. Route handlers `/api/identity` and `/api/restore` (§9.3). Mock identity area: register and profile.
- **Owns.** `src/platform/identity/**`, `src/app/api/identity/route.ts`, `src/app/api/restore/route.ts`, `src/features/identity/boot.ts`, `src/backend/mock/server/identity.ts`, `e2e/identity/cookie.spec.ts`.
- **Acceptance.** AC-CKE-01, AC-CKE-02 (events asserted through the analytics test hook), AC-CKE-03, AC-CKE-04, AC-IDN-01; route-handler unit tests in the Node environment.

#### Wave 4

**SQL-2 · Identity in SQL** · L · depends on SQL-1
- **Scope.** `..._identity.sql`: identity tables, `name_parts` with a starter list, `authenticate`, and every identity RPC except `set_nickname`; the identity adapter; the identity contract suite.
- **Owns.** `supabase/migrations/20261101000200_identity.sql`, `supabase/tests/identity/**`, `src/backend/supabase/identity.ts`, `src/backend/contract/identity.*`.
- **Acceptance.** AC-IDN-02, AC-IDN-03 (table-driven), AC-IDN-04, AC-SYN-03, AC-SYN-04, AC-IAB-04, the identity half of AC-DAT-02, credential pruning at the 11th device.

**SQL-3 · Sealed content tables and the release pipeline** · L · depends on SQL-1, CNT-1
- **Scope.** `..._content.sql`; `scripts/content/{crypto,seal,unseal,release}.ts` (HKDF, AES-256-GCM with the deterministic IV of §5.4); `scripts/checks/secret-scan.mjs`; `content/sealed/README.md`; the generated `supabase/seed/e2e-track.sql`; creating the content key file on the sandbox; the conditional `content-sealed` CI job.
- **Owns.** `supabase/migrations/20261101000300_content.sql`, `supabase/tests/content/**`, those scripts, `content/sealed/**`, `supabase/seed/e2e-track.sql`. **Touch:** `.github/workflows/ci.yml` (one job).
- **Acceptance.** Encryption round trip; unchanged plaintext gives unchanged ciphertext; a tampered tag fails; the secret scan catches plaintext under `content/sealed/`; the fixture release applies in a dry run with the expected rows; frozen rows are refused; Daily numbers match the epoch; the bundle scan finds no sealed ids.

**IDN-2 · Sync code, restore, claim link and in-app detection** · L · depends on IDN-1
- **Scope.** `/me/sync`, `/restore` with the confirm step, `/claim/[token]`; the claim offer (replaceState, per-app instructions, Android intent link, revert after 10 minutes) and the sync offer with its triggers (§9.2); `src/platform/browser-context.ts` (§9.4); the mock identity area's sync and claim methods; copy.
- **Owns.** `src/features/identity/**` (except `boot.ts`), `src/features/identity/offers/{claim,sync}.tsx`, `src/platform/browser-context.ts`, `src/app/(tabs)/me/sync/page.tsx`, `src/app/(landing)/restore/page.tsx`, `src/app/(landing)/claim/[token]/page.tsx`, `e2e/identity/{sync,claim,in-app}.spec.ts`. **Touch:** `src/backend/mock/server/identity.ts`.
- **Acceptance.** AC-SYN-01 (two device namespaces in one context), AC-SYN-02, AC-SYN-05, AC-SYN-06, AC-IAB-01, AC-IAB-02, AC-IAB-03, the AC-IAB-05 checks that apply so far, expired-claim copy.

#### Wave 5

**SQL-4 · Attempts and choice rounds in SQL** · L · depends on SQL-2, SQL-3
- **Scope.** `..._attempts.sql`: attempts, the idempotency log, `get_today`, `start_daily`, `start_archive`, `get_attempt`, `begin_round`, `round_action` with the choice handlers, a `finish_attempt` skeleton, zone resolution and offset bands; the `sealed` and `daily` adapters; the sealed contract suite on the e2e track's choice compositions.
- **Owns.** `supabase/migrations/20261101000400_attempts.sql`, `supabase/tests/attempts/**`, `src/backend/supabase/{sealed,daily}.ts`, `src/backend/contract/sealed.*`.
- **Acceptance.** AC-DLY-05, AC-DLY-08 (with `qz.now`), idempotent `round_action`, `stale` steps, one attempt per date, the archive window (AC-ARC-01, SQL half), no correct option before an answer, zone fallback.

**DLY-2 · The Daily screen, complete** · L · depends on DLY-1, MYS-1, DS-1
- **Scope.** Every home-card state (PRD §3.1.7, outage through `useServiceHealth`), the full header (exit, segments with check, cross or points, `m:ss` stopwatch with a persisted hide control, first-Daily hint), resume, lost-connection handling with the 2, 5, 10 and 30 s backoff, error states that retry with the same key, "Checking..." after 1.5 s, the honest-play tracker (`src/platform/visibility.ts`), first-Daily hints, `/daily` auto-start, stale-tab handling.
- **Owns.** `src/features/daily/**` (except `stop-screen/`), `src/platform/visibility.ts`, `e2e/daily/*.spec.ts` (except the greybox and stop-screen specs).
- **Acceptance.** AC-DLY-01, 06, 07, 08, 10, 11, 12, 13, 17, 18 on the mock.

**PRA-2 · Practice, complete** · L · depends on PRA-1, CNT-1
- **Scope.** The `/practice` hub (server-rendered category grid, remembered difficulty control, Start, the mode-card and mastery-badge stubs of §2.3); seen-tracking; the denylist fetch and cache; the generic outbox (`src/platform/outbox/`) and calibration uploads; packs from the generated manifest with the missing-offline and error states; the repeats note; results polish (best-moment line, Play again, Change category, share slot); offline labelling; the mock practice area.
- **Owns.** `src/features/practice/**` (excluding `blitz/` and `survival/` internals), `src/features/review/card.tsx`, `src/features/mastery/badge.tsx` (stubs), `src/platform/outbox/**`, `src/app/(tabs)/practice/page.tsx`, `src/backend/mock/server/practice.ts`, `e2e/practice/*.spec.ts` (except the greybox spec). **Touch:** `src/engine/practice/**`.
- **Acceptance.** AC-PRA-05, 06, 07, 10; the pack-missing offline copy; the hub works by keyboard.

#### Wave 6

**SQL-5 · Mystery and Encore in SQL, finishing, honest play** · L · depends on SQL-4
- **Scope.** `..._rounds_mystery_encore.sql`: the mystery and encore handlers, flags, `finish_attempt_internal`, `daily_results`, crowd counters, wrong-guess tallies, the dwell histogram, crowd stats on reveals; the first `scripts/sql/gen-parity.ts` with generated mystery and encore tests; adapter decoding of reveals.
- **Owns.** `supabase/migrations/20261101000500_rounds_mystery_encore.sql`, `supabase/tests/rounds/**`, `scripts/sql/gen-parity.ts`, `supabase/tests/generated/{mystery,encore}*`. **Touch:** `src/backend/supabase/sealed.ts`.
- **Acceptance.** AC-DLY-03 and AC-DLY-04 (SQL halves); PRD §4.1.7 and §4.2.4 parity; `invalid_entity` and `already_guessed` consume nothing; clue-4 options with flags; the too-fast flag at 1.4 s; the visibility and missing-report flags; ranked-only results; eligible-only crowd counts.

**DLY-3 · The stop screen, complete** · L · depends on DLY-2, ENG-2
- **Scope.** PRD §3.1.6 in order: the best-moment line, the score card, the percentile with its copy rules (100, under 5, cold start), the 13-bar histogram with a "You" pattern and a table, rounds with crowd stats, review your misses, one offer card from the registry with history in `qz:offers`, Done for today with the server-corrected countdown, the soft Practice link, the regret-survey slot; refetch of numbers on every visit; lazy confetti for 12/12, off under reduced motion; the mock `daily` area's results and numbers (engine percentile) and the `addFinishers` control.
- **Owns.** `src/features/daily/stop-screen/**`, `src/features/celebration/**`, `src/backend/mock/server/daily.ts`, `e2e/daily/stop-screen*.spec.ts`. **Touch:** `src/features/offers/registry.ts` (priority logic).
- **Acceptance.** AC-DLY-14, AC-DLY-15, AC-DLY-16 (one fixture per combination), percentile copy at 100 and below 5, the histogram's table equivalent, no confetti under reduced motion.

**STK-1 · Streak UI** · M · depends on ENG-2, DLY-2
- **Scope.** The mock `streaks` area built on `evaluateStreak` and `applyFinish`, hooked into the mock's finish; the home streak chip; the streak sheet (current, best, days played, freeze progress, repair status, the 14-day strip with icon and word); the stop-screen streak line with milestones shown once; one-time notices with acknowledgement; record-first copy after a break; the copy lint test.
- **Owns.** `src/features/streaks/**`, `src/backend/mock/server/streaks.ts`, `e2e/streaks/*.spec.ts`. **Touch:** `src/backend/mock/server/sealed.ts` (finish hook).
- **Acceptance.** AC-STK-01, 03, 04, 05, 06; AC-FRZ-01 to 04 through mock scenarios.

#### Wave 7

**SQL-6 · Streaks in SQL** · L · depends on SQL-5, ENG-2
- **Scope.** `..._streaks.sql` (§8.10): player days, streaks, notices, incidents, `evaluate_streak`, `apply_finish` wired into finishing, `get_streak`, `ack_notices`; generated parity tests from `streaks.json`; the streak adapter and contract suite.
- **Owns.** `supabase/migrations/20261101000600_streaks.sql`, `supabase/tests/streaks/**`, `supabase/tests/generated/streaks*`, `src/backend/supabase/streaks.ts`, `src/backend/contract/streaks.*`.
- **Acceptance.** S1 to S10, AC-RPR-01 to 04, AC-FRZ-05 and AC-INC-03 in SQL.

**ARC-1 · Archive and repair** · L · depends on STK-1, DLY-3
- **Scope.** `/archive` with every tile state; `/daily/[number]` archive play (unranked labels); archive results ("Archive · unranked", the final distribution, "You'd have beaten", "(archive)" in the share text); the home repair card (hidden for the 13 to 17 band); repair success copy and counter animation; "used this week" with the next date; the long-break copy; mock archive listing and repair logic.
- **Owns.** `src/features/archive/**`, `src/app/(tabs)/archive/page.tsx`, `src/app/(play)/daily/[number]/page.tsx`, `e2e/archive/*.spec.ts`. **Touch:** `src/backend/mock/server/{sealed,daily}.ts`.
- **Acceptance.** AC-ARC-01, 03, 04 (sealed payloads through the mock response log), 05, 06; AC-RPR-01 to 06 end to end; AC-AGE-02 for the hidden repair card.

**INC-1 · Incident banners and the health monitor** · M · depends on DS-1, DLY-2
- **Scope.** `src/platform/network.ts` (§10.6), the banner slot (polite region, overlay when late, dismiss rules), `useServiceHealth()`, the mock `health` area and `setServiceState` control, display of protected-date notices.
- **Owns.** `src/features/incidents/**`, `src/platform/network.ts`, `src/backend/mock/server/health.ts`, `e2e/incidents/*.spec.ts`.
- **Acceptance.** AC-INC-01, AC-INC-02, AC-INC-05; offline banner copy; degraded and maintenance banners dismissible for an hour.

#### Wave 8

**SQL-7 · Results, percentiles, archive and stats in SQL** · L · depends on SQL-6
- **Scope.** `..._results_stats.sql`: `get_daily_results`, `get_daily_numbers` (§8.9), `get_archive`, `get_my_stats`, the final-percentile step; generated tests from `percentile.json` and `ranking.json`; adapters.
- **Owns.** `supabase/migrations/20261101000700_results_stats.sql`, `supabase/tests/results/**`, `supabase/tests/generated/{percentile,ranking}*`, `src/backend/supabase/stats.ts`. **Touch:** `src/backend/supabase/daily.ts`.
- **Acceptance.** AC-DLY-15 thresholds, AC-ARC-02, percentile parity (bands, ties, flagged players, cold start), AC-STA-01 data shape.

**STA-1 · Stats page** · M · depends on STK-1, PRA-2
- **Scope.** `/me` sections 1 to 8 (PRD §3.4.3) with chart and table pairs, server figures plus device figures, the "Updated" line offline, error states, the mastery and achievement slots; the mock `stats` area.
- **Owns.** `src/features/stats/**`, `src/app/(tabs)/me/page.tsx`, `src/backend/mock/server/stats.ts`, `e2e/stats/*.spec.ts`.
- **Acceptance.** AC-STA-01 to 04.

**SET-1 · Settings, age band and data controls** · L · depends on DS-1, IDN-2
- **Scope.** `/settings` with every row of PRD §3.12.1 applied at once and logged; the profile section (sync code, restore, age band, Download my data merging server and device data, Delete my data with two confirmations, then storage cleared and the cookie expired); the age-band question (`src/features/age/`, `requireAgeBand(moment)`, `isMinor()`); stubs for the sound and reminder sections.
- **Owns.** `src/features/settings/**`, `src/features/age/**`, `src/app/(tabs)/settings/page.tsx`, `e2e/settings/*.spec.ts`. **Touch:** `src/platform/settings/**`, `src/backend/mock/server/identity.ts` (export and delete).
- **Acceptance.** AC-SET-01, 02, 03, 05, 07; AC-AGE-01 for the helper (later moments add their E2E); AC-AGE-03 (crawl as a new guest); AC-DAT-01; deletion clears storage and the cookie.

#### Wave 9

**SQL-8 · Operations: health, incidents, cron, the rate-limit hook** · L · depends on SQL-7
- **Scope.** `..._ops.sql` and `..._pre_request.sql` (§8.6, §8.15): service state, alerts, heartbeats, aggregates, `get_service_status`, `declare_incident`, `set_service_state`, `pg_cron` with the hook structure, `public.pre_request` and the `authenticator` setting; the health adapter.
- **Owns.** Those migrations, `supabase/tests/ops/**`, `src/backend/supabase/health.ts`.
- **Acceptance.** A simulated 12-minute heartbeat gap becomes an incident and protects the date (AC-INC-03 end to end in SQL); AC-INC-04; the hook returns 429 past the cap (request settings simulated with `set_config`); the jobs exist in `cron.job`; the nightly hook abandons attempts after their window.

**RPT-1 · Reports and hearts** · M · depends on DLY-3, PRA-2
- **Scope.** `RevealActions`: the heart toggle (accessible name, pressed state) and the report sheet (five reasons, an optional 280-character note, success, offline and error copy), both queued through the outbox; the quiz reason set for EDT-3; the mock `reports` area with weights and practice pulls.
- **Owns.** `src/features/reports/**`, `src/backend/mock/server/reports.ts`, `e2e/reports/*.spec.ts`.
- **Acceptance.** AC-RPT-01 for the reveal types that exist so far, AC-RPT-03 (mock), AC-RPT-07, AC-HRT-01.

**ANA-1 · First-party analytics** · L · depends on CORE-0, DLY-3
- **Scope.** The real `track()` queue (memory plus `qz:outbox`, 200 events, oldest dropped), flushing (10 s, 20 events, hidden with `keepalive`), the envelope, client-side dictionary checks, vitals through `useReportWebVitals` (25% sampling) and the `Q1` mark, `src/instrumentation-client.ts` error capture, `client_error` hashing, `landing_view`, the regret survey (5% of stop-screen views, at most once in 30 days, never in play), the mock `analytics` area.
- **Owns.** `src/features/analytics/**`, `src/instrumentation-client.ts`, `src/backend/mock/server/analytics.ts`, `e2e/analytics/*.spec.ts`.
- **Acceptance.** AC-ANA-01 (no other origin over a full mock session), AC-ANA-03, AC-ANA-05; deterministic sampling from the session seed.

#### Wave 10

**SQL-9 · Reports, hearts, practice calibration and voids in SQL** · L · depends on SQL-8
- **Scope.** `..._reports_practice.sql` (§8.12): reports, tallies, pulled items, hearts, practice answers, item stats, their RPCs, `admin_void_round`, `admin_correct_key`, pull and restore, report resolution, the `content_queue` view, the `nightly_reports` hook; adapters.
- **Owns.** `supabase/migrations/20261101001000_reports_practice.sql`, `supabase/tests/reports/**`, `src/backend/supabase/{reports,practice}.ts`.
- **Acceptance.** AC-RPT-02 to 06 in SQL; AC-PRA-10 server side; denylist versioning.

**SQL-10 · Analytics ingestion in SQL** · M · depends on SQL-8, ANA-1
- **Scope.** `..._analytics.sql`; `scripts/codegen/analytics-sql.ts` generating `supabase/seed/analytics-dictionary.sql` with a CI drift check; `log_events` validation and limits; the `nightly_analytics` rollup hook; goal views for G1 to G18; the adapter.
- **Owns.** `supabase/migrations/20261101001100_analytics.sql`, `scripts/codegen/analytics-sql.ts`, `supabase/seed/analytics-dictionary.sql`, `supabase/tests/analytics/**`, `src/backend/supabase/analytics.ts`.
- **Acceptance.** AC-ANA-02, AC-ANA-03 (unique ids), AC-ANA-04; the dictionary drift check fails on a mismatch.

**LGL-1 · Legal and trust pages, not-found, sitemap** · M · depends on DS-1
- **Scope.** The seven pages of PRD §3.14 (the honest-play disclosure kept to its intent), footer links on Today, Me and Settings, the not-found page, `sitemap.ts`, `robots.ts`, `src/lib/metadata.ts` (`noindex()`, titles), generated license notices for `/credits`.
- **Owns.** `src/features/legal/**`, `src/app/(info)/**`, `src/app/not-found.tsx`, `src/app/{sitemap,robots}.ts`, `src/lib/metadata.ts`, `scripts/content/licenses.ts`, `e2e/legal/*.spec.ts`. **Touch:** `src/features/shell/footer.tsx`.
- **Acceptance.** AC-LGL-01 (prerendered HTML exists in `.next/server/app`), AC-LGL-02, the sitemap half of AC-UGS-02, unique titles and one `h1` per route.

#### Wave 11

**SEC-1 · Security headers and bundle guards** · M · depends on PLT-1
- **Scope.** `next.config.ts` headers and CSP per backend mode (§10.8), per-path headers, the preview-toolbar allowance, the `experimental.sri` evaluation note; per-route budgets, lazy markers and the sealed-id scan in the bundle scripts; header specs.
- **Owns.** `next.config.ts`, `scripts/check-bundle-budget.mjs`, `scripts/checks/lazy-markers.mjs`, `e2e/security/headers.spec.ts`, `e2e/smoke.spec.ts`.
- **Acceptance.** Exact headers on `/`, `/daily`, `/sw.js` and `/api/restore`; Supabase https and wss origins only in Supabase builds (header-builder unit test); no CSP violation in any E2E run; the bundle check fails on a statically imported marker module.

**PWA-1 · Installable PWA and offline practice** · L · depends on PRA-2, LGL-1
- **Scope.** The manifest and icons; `src/pwa/sw.ts` with Serwist; `scripts/pwa/build-sw.mjs` and the build script change; registration at idle; `useSafePoint()` and the update flow; `persist()` in standalone mode; `/offline`; the `pwa-chromium` specs; the hand-written fallback if the Vercel preview check fails.
- **Owns.** `src/pwa/**`, `scripts/pwa/**`, `src/features/pwa/**`, `src/app/manifest.ts`, `src/app/offline/page.tsx`, `public/icons/**`, `e2e/pwa/*.spec.ts`. **Touch:** `package.json` (the `build` script only).
- **Acceptance.** AC-PWA-01 (manifest fields), AC-PWA-02, 03, 04, 05; AC-PRA-02; AC-LGL-03. The Vercel preview check is recorded for the orchestrator, since the sandbox cannot reach Vercel.

**MOD-1 · Moderation and friendly names** · L · depends on SQL-2, CNT-1
- **Scope.** `src/engine/text/moderation.ts`; the term-list pipeline (a starter list from an openly licensed dataset, reviewed by the content team) into a lazy client module and `supabase/seed/moderation.sql`; `scripts/codegen/moderation-sql.ts` generating `private.fold_text`; `..._moderation.sql` with `text_is_blocked` and `set_nickname`; reviewed name lists as seed data; `NicknameField` (generated picker plus custom field with filter feedback); `moderation.json` with generated SQL parity tests.
- **Owns.** `src/engine/text/**`, `src/features/nickname/**`, `content/safety/**`, `content/names/**`, `scripts/codegen/moderation-sql.ts`, `supabase/migrations/20261101001200_moderation.sql`, `supabase/seed/{moderation,name-parts}.sql`, `supabase/tests/moderation/**`, `supabase/tests/generated/moderation*`. **Touch:** `src/backend/supabase/identity.ts`, `src/backend/mock/server/identity.ts`.
- **Acceptance.** AC-LNT-03 (same verdicts on both sides); no generated name contains a listed term (every combination checked).

#### Wave 12

**SHR-1 · Share result** · L · depends on ENG-2, ANA-1
- **Scope.** The final share text for every mode (archive suffix, choice-row collapsing, high-contrast glyph set), glyph sets from DESIGN.md, share links from share codes, `ShareButton` (Web Share text only, clipboard fallback with status copy, a selected read-only text box as the last resort) and its counting events; wired into the stop screen, archive results and practice results through the stub.
- **Owns.** `src/engine/share/**`, `src/features/share/**`, `src/platform/share.ts`, `e2e/share/{text,button}*.spec.ts`.
- **Acceptance.** AC-SHR-01 (byte for byte), 03, 04, 05, 08; AC-ARC-05; the share half of AC-SET-04.

**SHR-2 · Share landing and preview image** · L · depends on ENG-2, DS-1
- **Scope.** `/s/[number]/[code]` (stateless decode, metadata, the reader-local island), the preview image route with a subset TTF (`scripts/assets/subset-font.mjs`, output committed), alt text, cache headers, the generic fallback, the image-size check.
- **Owns.** `src/app/(landing)/s/**`, `src/features/share-landing/**`, `src/assets/og/**`, `scripts/assets/subset-font.mjs`, `e2e/share/landing*.spec.ts`.
- **Acceptance.** AC-SHR-02 (200 generated results), AC-SHR-06 (an integration test renders the landing with the backend off), AC-SHR-07; a WhatsApp user agent receives the Open Graph tags in the initial HTML.

**SQL-11 · Challenges in SQL** · L · depends on SQL-7, MOD-1
- **Scope.** `..._challenges.sql` (§8.3, §8.4): challenges, entries, `create_challenge`, `get_challenge`, `start_challenge_run`, `start_pack_run`, head-to-head, rematch, shelf, participants; adapters.
- **Owns.** `supabase/migrations/20261101001300_challenges.sql`, `supabase/tests/challenges/**`, `src/backend/supabase/challenges.ts`, `src/backend/contract/challenges.*`. **Touch:** `src/backend/supabase/sealed.ts` (challenge and pack starts).
- **Acceptance.** AC-CHL-02, 03, 05, 06, 07, 08, 09, 11 in SQL.

#### Wave 13

**CHL-1 · Challenge links** · L · depends on SHR-1, SET-1, MOD-1
- **Scope.** `ChallengeButton` with the first-time nickname step ("What should your friends see?", generated name prefilled, custom names through the age band and filter); create and share; `/c/[code]` landing states; `/c/[code]/play`; `/c/[code]/result` with verdict copy and Rematch; `/challenges`; the participants list; the home "challenges waiting" slot; the mock `challenges` area.
- **Owns.** `src/features/challenges/**`, `src/app/(tabs)/challenges/page.tsx`, `src/app/(landing)/c/**`, `src/app/(play)/c/[code]/play/page.tsx`, `src/backend/mock/server/challenges.ts`, `e2e/challenges/*.spec.ts`.
- **Acceptance.** AC-CHL-01, 04, 05 (copy), 09, 10, 11; the full, invalid, expired and offline copy; AC-AGE-01 at the nickname moment; AC-AGE-02 for generated-only nicknames.

**SQL-12 · Groups in SQL** · L · depends on SQL-7, MOD-1
- **Scope.** `..._groups.sql`: groups, members, every Group RPC, board computation, admin handover, invite regeneration; adapters.
- **Owns.** `supabase/migrations/20261101001400_groups.sql`, `supabase/tests/groups/**`, `src/backend/supabase/groups.ts`, `src/backend/contract/groups.*`.
- **Acceptance.** AC-GRP-02, 03, 04, 06, 07, 10, 11 in SQL.

**CI-1 · Real-backend jobs and Lighthouse** · M · depends on PLT-1, SQL-7
- **Scope.** `e2e-real.yml` and `keepalive.yml` (§11.7); Lighthouse and a11y jobs in `ci.yml` with `lighthouserc.json`; `e2e-real/fixtures.ts`; the first real spec (a full Daily on the e2e track with network sealed assertions); `playwright.real.config.ts` completed.
- **Owns.** `.github/workflows/{e2e-real,keepalive}.yml`, `.github/workflows/ci.yml`, `lighthouserc.json`, `e2e-real/fixtures.ts`, `e2e-real/daily.spec.ts`, `playwright.real.config.ts`.
- **Acceptance.** Workflow files parse; the real Daily spec passes on GitHub after the orchestrator pushes (reported "not run" in the sandbox); Lighthouse assertions configured for the four URLs.

#### Wave 14

**GRP-1 · Groups** · L · depends on SET-1, MOD-1
- **Scope.** `/g`, `/g/new` (age band first), `/j/[code]` (join in three screens at most), `/g/[groupId]` (Today and This week tabs, hidden scores until finished, "Not yet", last week's winner, refetch on focus, visibility, pull and after finishing, never polling), `/g/[groupId]/settings` (nickname, leave, admin tools), the invite share text, the Group offer provider, the home Group slot, the mock `groups` area.
- **Owns.** `src/features/groups/**`, `src/app/(tabs)/g/**`, `src/app/(landing)/j/[code]/page.tsx`, `src/backend/mock/server/groups.ts`, `e2e/groups/*.spec.ts`.
- **Acceptance.** AC-GRP-01, 05, 06 (DOM), 07, 08, 09 (two idle minutes with no polling or socket), 10; AC-AGE-01 at the Group moment; AC-AGE-02 for Group nicknames.

**QA-1 · The real-backend suite** · M · depends on CI-1, SQL-11, SQL-12, IDN-2
- **Scope.** Real specs for sync-code restore across two contexts, claim redemption, a challenge between two contexts, a Group join with the hidden board, and sealed network assertions on archive plays (AC-ARC-04); real contract runs for identity, sealed runs, streaks, challenges and Groups.
- **Owns.** `e2e-real/**` (except CI-1's files), `src/backend/contract/*.real.test.ts`.
- **Acceptance.** The suites pass on GitHub; every test uses test identities.

**A11Y-1 · Accessibility sweep** · L · depends on Wave 13
- **Scope.** `e2e/a11y/`: the route crawler with axe in both themes, forced colors, reduced motion, 320 px, 200% text, text-spacing screenshots, keyboard-only journeys (Daily, practice, archive, challenge, Group join, sync code, settings), ARIA snapshot baselines. Fixes inside `src/ui/`; anything outside goes to follow-up notes for the owners.
- **Owns.** `e2e/a11y/**`, `src/ui/**`.
- **Acceptance.** AC-A11Y-01 to 06 on every route that exists after Wave 13.

#### Wave 15 (Should)

**BLZ-1 · Blitz and Survival** · L · depends on PRA-2, ENG-2
- **Scope.** `/practice/blitz` (60 and 120 s, the bar with amber stripes at 10 s, ticks in the last 5 s, pausing while hidden or reading aloud, 600 ms verdicts with auto-advance, the unscored last question, the review list, bests per length) and `/practice/survival` (three X slots, the ramp, the pool-exhausted ending, results with the strike questions, bests per filter); `src/engine/practice/stream.ts`; their hub cards and share texts.
- **Owns.** `src/features/practice/{blitz,survival}/**`, `src/engine/practice/stream.ts`, `src/app/(play)/practice/{blitz,survival}/page.tsx`, `e2e/practice/{blitz,survival}.spec.ts`.
- **Acceptance.** AC-BLZ-01 to 05; AC-SUR-01 to 03.

**REV-1 · Review my misses and adaptive Mixed** · L · depends on PRA-2
- **Scope.** The review queue and its intervals, `/practice/review`, the home review card, the hub card; adaptive Mixed (θ, per-category offsets, exploration) behind the `adaptive` flag, with the setup copy.
- **Owns.** `src/features/review/**`, `src/engine/practice/{review,adaptive}.ts`, `src/app/(play)/practice/review/page.tsx`, `e2e/practice/review.spec.ts`. **Touch:** `src/engine/practice/plan.ts` (call into adaptive).
- **Acceptance.** AC-REV-01 to 04; AC-PRA-09.

**MAS-1 · Mastery and achievements** · L · depends on STA-1, SQL-7
- **Scope.** Engine rules for tiers and A01 to A30; `/me/achievements`; unlocks shown only on results and stop screens; `..._achievements.sql` with `record_achievements`; adapter and mock; the category badges and stats sections through their stubs.
- **Owns.** `src/engine/{achievements,mastery}/**`, `src/features/{achievements,mastery}/**`, `src/app/(tabs)/me/achievements/page.tsx`, `supabase/migrations/20261101001500_achievements.sql`, `supabase/tests/achievements/**`, `e2e/achievements/*.spec.ts`. **Touch:** `src/backend/supabase/stats.ts`, `src/backend/mock/server/stats.ts`.
- **Acceptance.** AC-ACH-01 to 05; AC-MAS-01 to 04.

#### Wave 16 (Should)

**CAL-1 · Calendar reminder, install pitch and installed first run** · L · depends on SET-1, PWA-1, IDN-2
- **Scope.** The calendar offer and the Settings "Daily reminder" row (Google template link with the daily rule and `ctz`; an `.ics` file; age band at this moment; never in-app or for 13 to 17); the install pitch (Chromium `beforeinstallprompt`; iOS steps after the sync code; "Not now" defers 7 days, at most twice; never in-app or standalone); the installed first-run screen; their events.
- **Owns.** `src/features/{reminder,install}/**`, the `calendar` and `install` offer providers, `src/features/settings/sections/reminder.tsx`, `e2e/growth/*.spec.ts`.
- **Acceptance.** AC-CAL-01 to 05; AC-INS-01 to 03; AC-IAB-05 in full; AC-AGE-02 for reminder offers.

**CAT-1 · Category pages and the monthly pack** · M · depends on CNT-1, PRA-2
- **Scope.** Twelve static `/categories/[slug]` pages (intro, three topics, one sample question with its answer after the pick, a one-tap Play), sitemap entries, the monthly pack card, its badge shelf and progress.
- **Owns.** `src/features/categories/**`, `src/app/(tabs)/categories/[slug]/page.tsx`, `src/features/practice/monthly-pack-card.tsx`, `content/category-pages/**`, `content/monthly-packs.json`, `e2e/categories/*.spec.ts`. **Touch:** `src/app/sitemap.ts`.
- **Acceptance.** AC-CAT-01, AC-CAT-02, AC-PCK-01.

**SND-1 · Sound and read aloud** · M · depends on SET-1
- **Scope.** A Web Audio engine with a sprite under 30 kB and the `AudioContext` created on the first tap; the effect set; Android haptics; read aloud through `speechSynthesis` (pausing Blitz through the run's `pause` event); host-screen sound defaults for ROM-2; the Settings sound section.
- **Owns.** `src/platform/sound/**`, `src/platform/{haptics,speech}.ts`, `src/features/settings/sections/sound.tsx`, `public/sounds/**`, `e2e/settings/sound.spec.ts`.
- **Acceptance.** AC-SET-03, 06, 07.

#### Wave 17 (Beta)

**SQL-13 · Rooms core in SQL** · L · depends on SQL-12, MOD-1
- **Scope.** `..._rooms_core.sql`: rooms and seats, `create_room`, `join_room`, `room_shuffle_name`, `room_heartbeat`, the two state RPCs for the lobby, lobby host actions (remove, rename, lock, unlock, end, start into `read`), `room_leave`, the hint helper; the rooms adapter and `realtime.ts`.
- **Owns.** `supabase/migrations/20261101001600_rooms_core.sql`, `supabase/tests/rooms/**`, `src/backend/supabase/{rooms,realtime}.ts`.
- **Acceptance.** AC-ROM-06; AC-ROM-10 for these RPCs (success, permission, rate limit); same-seat rejoin; a removed token refused; locked rooms refuse only new seats.

**ROM-1 · Room engine, mock rooms and the sync controller** · L · depends on ENG-2
- **Scope.** `src/engine/rooms/phases.ts` (§8.11); the mock `rooms` area (create, join, heartbeat, state, host actions, answers, ticks, voids, BroadcastChannel hints, `failNext` voiding); `src/features/rooms/model/` (subscription, polling at 3 and 15 s, version gating, 5 s heartbeats, reconnecting state, deadline timers); seat-token storage.
- **Owns.** `src/engine/rooms/**`, `src/backend/mock/server/rooms.ts`, `src/features/rooms/model/**`, `e2e/rooms/smoke.spec.ts`. **Touch:** `src/backend/mock/realtime.ts`.
- **Acceptance.** Phase-table unit tests; scoring integration; polling at 3 s when the status is down; refetch only on a newer version; at most two refetches a second under hint spam; two pages join one mock room.

**EDT-1 · Quiz editor** · L · depends on DS-1, MOD-1
- **Scope.** `/create` (device drafts and server copies), the editor at `/create/new` and `/create/[quizId]` (fields, add, duplicate, delete with a 10 s undo, move up and down, limits), autosave within 1 s, lint (blocking rules and L1 to L8) with "3 things to fix", client filter feedback, solo play through the practice engine (`quiz_solo`), the Beta label, `notFound()` when the flag is off, the editor home slot.
- **Owns.** `src/engine/quiz-lint/**`, `src/features/editor/**` (except `import/` and `share/`), `src/app/(tabs)/create/{page.tsx,new,[quizId]}/**`, `e2e/editor/{editor,lint}.spec.ts`.
- **Acceptance.** AC-EDT-01, 02, 03; AC-LNT-01; the client half of AC-LNT-02.

#### Wave 18 (Beta)

**SQL-14 · Rooms gameplay in SQL** · L · depends on SQL-13
- **Scope.** `..._rooms_game.sql`: answers, `room_tick`, phases and deadlines, Classic and Accuracy scoring with the doubled final question, extensions, reveal distributions, standings, the podium, voids (exception handler and watchdog), host-only count hints, the `nightly_rooms` hook; `supabase/fallback/room_signals.sql`; generated room-scoring parity tests.
- **Owns.** `supabase/migrations/20261101001700_rooms_game.sql`, `supabase/fallback/**`, `supabase/tests/rooms/game*`, `supabase/tests/generated/room*`. **Touch:** `src/backend/supabase/rooms.ts`.
- **Acceptance.** AC-ROM-08, 09; AC-ROM-10 for the remaining RPCs; PRD §4.5.5 parity; a void on an injected exception.

**ROM-2 · The host screen** · L · depends on ROM-1, DS-1, SND-1
- **Scope.** `/host` (packs or My quizzes, timer and scoring with Accuracy forced when the timer is off, the final-question note, the `AudioContext` on Create), `/host/[roomId]` (code and lazy QR, lobby, every host control, phases at host-screen type sizes, the striped amber countdown, answered counts, reveal, top five, podium, notices, effects on and music off), the Beta label.
- **Owns.** `src/features/rooms/host/**`, `src/app/(host)/host/**`, `e2e/rooms/host*.spec.ts`.
- **Acceptance.** AC-ROM-07; the host half of AC-ROM-12; AC-ROM-13.

**EDT-2 · Bulk import** · M · depends on EDT-1
- **Scope.** `src/engine/quiz-import/` (Format A, CSV with delimiter detection, RFC 4180 quoting, BOM stripping); `/create/import` (paste or a file up to 200 kB, preview rows with reasons, fix or drop, add, skipped rows past 50); `/create/help/import` with the copyable prompt; lazy loading.
- **Owns.** `src/engine/quiz-import/**`, `src/features/editor/import/**`, `src/app/(tabs)/create/{import,help}/**`, `e2e/editor/import.spec.ts`.
- **Acceptance.** AC-IMP-01 to 05.

#### Wave 19 (Beta)

**ROM-3 · Phones in rooms** · L · depends on ROM-1, ROM-2
- **Scope.** `/join` (numeric code entry), `/join/[code]` (the QR target), `/room/[roomId]` (lobby, Shuffle name, every phase with the full question text, answer lock, verdict and points, explanation, rank and gap, podium, notices, reconnecting, and the removed, ended, full, locked and wrong-code copy), silent by default, heartbeats, rejoin with the stored seat token, the room report target.
- **Owns.** `src/features/rooms/phone/**`, `src/app/(landing)/join/**`, `src/app/(play)/room/[roomId]/page.tsx`, `e2e/rooms/phone*.spec.ts`.
- **Acceptance.** Phone state copy; the phone half of AC-ROM-12.

**SQL-15 · User quizzes in SQL** · L · depends on MOD-1, SQL-9
- **Scope.** `..._quizzes.sql` (§8.3, §8.4): validation that mirrors the blocking rules, sharing behind the 18+ band, `get_shared_quiz`, `start_quiz_run` through the sealed framework, play statistics, report-driven hiding, `admin_takedown_quiz`; the adapter.
- **Owns.** `supabase/migrations/20261101001800_quizzes.sql`, `supabase/tests/quizzes/**`, `src/backend/supabase/quizzes.ts`.
- **Acceptance.** AC-EDT-05, AC-LNT-02, AC-UGS-01, 03, 04, 05 in SQL; `conflict` on a stale save.

**EDT-3 · Sharing user quizzes** · L · depends on EDT-1, RPT-1, SET-1
- **Scope.** Server save with the conflict choices; the share flow (age band, the 18+ confirmation with the content-policy link, the 13 to 17 message); the unlisted link; `/q/[code]` (noindex, hidden and unavailable states, report), `/q/[code]/play`, `/q/[code]/result`; creator stats; "Hidden while we review reports"; unshare and delete; My quizzes in `/host`; the mock `quizzes` area; the sync-code trigger on the first saved quiz.
- **Owns.** `src/features/editor/share/**`, `src/features/shared-quiz/**`, `src/app/(landing)/q/**`, `src/app/(play)/q/[code]/play/page.tsx`, `src/backend/mock/server/quizzes.ts`, `e2e/editor/share*.spec.ts`.
- **Acceptance.** AC-EDT-04; AC-UGS-01 (UI), 02, 04 (E2E), 06; AC-AGE-02 for quiz sharing and hosting.

#### Wave 20

**ROM-4 · The rooms gate** · L · depends on ROM-2, ROM-3, SQL-14
- **Scope.** The multi-page mock suite (AC-ROM-01 to 05, 07, 09, 12, 13; §11.4) and the real 1-host, 10-phone game (AC-ROM-11); a gate summary in the pull request so the orchestrator can decide the Beta label (PRD §9.2).
- **Owns.** `e2e/rooms/gate*.spec.ts`, `e2e-real/rooms.spec.ts`.
- **Acceptance.** The suites themselves; the gate outcome recorded.

**PERF-1 · Performance pass** · L · depends on Waves 1 to 19
- **Scope.** Bring `/`, `/daily` and `/practice/run` inside their budgets; tune prefetching; fix LCP and CLS findings; add the INP trace test (4x CPU throttling) and the Q1 lab test (p75 of 20 throttled runs, AC-DLY-02); a local Lighthouse run. This is the one cross-cutting ticket: it may edit any feature file, which is safe because the other Wave 20 tickets only add tests.
- **Owns.** `e2e/perf/**`; any file, with each change listed in the pull request.
- **Acceptance.** AC-DLY-02; every bundle budget; Lighthouse 90 or more locally on the four URLs.

**QA-2 · Release checks** · M · depends on everything
- **Scope.** `scripts/checks/ac-coverage.mjs` as a gate; the whole SQL suite and both advisors through MCP; the migration drift check; the static import checks complete (AC-DLY-19, AC-RPR-07, AC-SUR-03); a results summary for the launch report.
- **Owns.** `scripts/checks/ac-coverage.mjs`, `supabase/tests/**` (gap fills).
- **Acceptance.** Every Must criterion maps to a passing test or an honest "not run"; advisors clean or accepted by the owner; the SQL suite green.

### 12.4 Risks to the plan

| Risk | Early sign | Response |
|---|---|---|
| Wave 1's three slices disagree at merge | The exit spec fails on wiring, not logic | Contracts in §3, §4.4 and §7.2 are code-level; the orchestrator fixes wiring during the merge, before Wave 2 |
| The 14.6 kB home budget is blown by the first real features | `check:bundle` above 150 kB in Wave 5 or 6 | Islands move to `import()`; PERF-1 is the backstop, but every ticket runs the check |
| Serwist's configurator mode fails on Vercel | The PWA-1 preview check | The hand-written fallback worker with the same tests |
| Database broadcast misbehaves in the rooms gate | AC-ROM-03 or AC-ROM-11 flakes | Switch `realtime.ts` to the `room_signals` fallback; if the gate still fails, rooms stay flagged off (PRD §9.2) |
| WebKit refuses Secure cookies on `http://127.0.0.1` | AC-CKE specs fail on `mobile-webkit` | Run those specs on Chromium and Firefox; the launch report lists the gap for the iPhone check |
| The content key is lost | `content:unseal` fails | The sealed pool can only be rebuilt from the database; the owner checklist asks for the key in a password manager and as a GitHub secret on day one |
