# [Name]: Architecture, v1

| | |
|---|---|
| Status | Approved for build. Binding for structure, contracts, schema and the order of work. Revised the same day after the architecture review |
| Owner | Principal engineer |
| Date | 31 October 2026 |
| Inputs | [00-PROJECT-BRIEF.md](./00-PROJECT-BRIEF.md), [01-ENGINEERING-CONSTRAINTS.md](./01-ENGINEERING-CONSTRAINTS.md), [02-PRODUCT-DECISIONS.md](./02-PRODUCT-DECISIONS.md) (binding), [PRD.md](./PRD.md), [research/SYNTHESIS.md](./research/SYNTHESIS.md), [research/08-technical-best-practices.md](./research/08-technical-best-practices.md), the foundation code on branch `claude/sleepy-hamilton-p0f789` |
| Companion docs | PRD.md (behavior), DESIGN.md (visual system, glyphs), CONTENT_GUIDE.md (writing and checking rules) |

## How to read this document

**Precedence.** The decisions memo and the PRD decide what the product does. This document decides how it is built: module boundaries, contracts, the database, the RPCs and the order of work. If this document contradicts the PRD on behavior, the PRD wins and this document is corrected in the same pull request. Section 1.4 lists every place where we interpreted or adjusted a PRD rule for technical reasons. Each one is flagged for the PM.

**Verified facts.** Items marked [verified] were checked on 31 October 2026 against the installed packages (Next 16.4.3, React 19.3.1, `@supabase/supabase-js` 2.118.0, Node 22.23.4) or against the live Supabase project through MCP. Everything else is design.

**Names are contracts.** The identifiers, file paths, table names and RPC names below are the ones to use. Renaming one means changing this document first.

**Tickets.** Section 12 is the build plan. Each ticket names the files it owns. A developer agent edits only the files its ticket owns, plus the touch points the ticket lists.

**This revision.** It applies the architecture review of 31 October 2026 and keeps pace with the PRD's own revision of the same day. The Review log at the end lists every correction, where it landed, and the few places where we applied one differently from its wording, with the reason.

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

Review log

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
 |    realtime.send(private): room hints {room, phase, version, deadline}      |
 +----------------------------------------------------------------------------+

 +----------------------------------------------------------------------------+
 |  Vercel, Hobby: static shells (per-user paths rewritten onto one shell      |
 |  each), /_next/static/*, /content/* (packs, lists),                         |
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
4. **Free-tier limits are design inputs.** Realtime only for rooms, packs on the CDN, packed attempt rows, short raw retention, and a database that pauses without breaking any page. Near the size limit a shed switch turns off analytics and other extras so the Daily keeps playing (§8.1).

### 1.2 How requests travel

**A practice answer (works offline).**

1. The player presses option B. `pointerdown` paints the pressed state; `click` commits (§3.0.3 of the PRD).
2. The practice controller dispatches `{ type: 'intent' }` to the engine's run reducer, which moves the run to `judging` and emits a `judge` command.
3. The controller runs the `choice` plugin's judge half against the item from the cached pack and dispatches the verdict.
4. The reducer applies it, the round resolves, the reveal renders, and the first attempt goes into the calibration outbox, which uploads later through `log_practice_answers`.

**A Daily guess (sealed).**

1. The player types "Ca". The suggestion engine matches against the cached answer list on the device. Nothing is sent per keystroke.
2. The player picks "Canada" and taps Guess. The Daily controller dispatches the intent with a fresh idempotency key. The reducer enters `judging` and emits `judge`.
3. `backend.sealed.act()` posts `rpc/round_action`. Postgres locks the attempt row, checks the step and the date's window, validates the entity against the active rows of `private.answer_entities`, judges it, stamps the server time, and returns either the next clue or the reveal, plus `server_time`.
4. The backend corrects the display clock from `server_time`, the reducer applies the verdict, and focus moves to the new clue's heading.

**A room phase change (Beta).**

1. The host taps Reveal. `rpc/room_host_action` updates the room row, bumps `version` and calls `realtime.send()` with a hint on the room's private channel, which clients may read but never write. The hint leaves only after the transaction commits.
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
| D13 | Realtime is used only by rooms, as database broadcast hints on private channels plus polling; Groups and challenges never open a socket | Postgres Changes for everything; Presence; public topics | Free plan: 200 connections, 100 messages a second, 2M a month ([Supabase](https://supabase.com/docs/guides/realtime/limits)). A private channel with a read-only policy stops any participant from publishing to a room's topic ([Supabase](https://supabase.com/docs/guides/realtime/authorization)) | Rooms need a polling fallback, careful message budgets and a project-wide connection cap |
| D14 | The mock backend runs inside the page and shares state across tabs through localStorage, Web Locks and BroadcastChannel | An HTTP mock server in Next route handlers | No extra process, identical in dev and CI, deterministic, works offline | Multi-device tests use several pages in one browser context (§11.4); true multi-context tests run against Supabase in CI |
| D15 | Service worker built with Serwist in configurator mode after `next build`, with a hand-written fallback | `@serwist/next`, `@serwist/turbopack`, `next-pwa` | The webpack plugin fails under Turbopack and the Turbopack helper exports `dynamic = 'force-static'`, which Cache Components rejects ([report 08](./research/08-technical-best-practices.md)); `@serwist/cli` 9.5.13 bundles with esbuild [verified] | One post-build step and a spike to confirm it on a Vercel preview |
| D16 | Content Security Policy without nonces | Nonces through `proxy.ts` | Nonces force every page to render per request, which switches off prerendering (Next's CSP guide) | `script-src 'unsafe-inline'`, offset by zero third-party scripts and no HTML injection paths |
| D17 | Test identities use a reserved player-id prefix and play an `e2e` content track | A secret test key | The real-backend CI job must never touch real statistics or show real sealed content in public CI artifacts, and agents cannot add secrets | Anyone can make themselves a test player, which only sandboxes them (§8.17) |
| D18 | The server decides local dates and scoring times; the client's display clock is corrected from `server_time` on every response | Trusting the device clock | Constraint 6 | Each RPC returns a timestamp |
| D19 | Feature flags are build-time (`NEXT_PUBLIC_FEATURES`) and mirrored in `private.config` for Beta RPCs | Runtime flag service | Static pages can call `notFound()` at build time; no extra request | Flipping a flag needs a redeploy |
| D20 | Rate limits key on normalized subjects: a verified credential where one exists, otherwise the IPv4 address or the IPv6 /64, under project-wide ceilings that need no IP at all. Past a soft per-IP threshold a new identity still registers, as low trust | Hard caps on the raw first `X-Forwarded-For` address | Offices, campuses and carrier NAT put many players behind one IPv4 address, while one IPv6 customer can rotate through a /64 at will. Principle 1 (one tap to play) outranks fairness | Limits bound abuse rather than stop it, and low-trust identities need bookkeeping (§8.5, §8.6) |
| D21 | Every date-dependent RPC uses the player's effective today: the later of the request zone's local date and the latest date already served to that player | The request zone's date alone | Switching to UTC-12 can no longer reopen yesterday as an on-time ranked Daily | A westward traveller's next Daily waits for local time to catch up (§8.7) |

### 1.4 Interpretations and adjustments (flagged for the PM)

| # | PRD reference | What this architecture does | Why |
|---|---|---|---|
| 1 | Silent on where sealed sources live | Sealed sources are encrypted in `content/sealed/`; plaintext exists only in a git-ignored workspace | The repository is public |
| 2 | §8.1 "Continue to the next stem under 100 ms (the next round's first payload arrives with the previous verdict, or is prefetched during the reveal)" | For sealed rounds the next round's layout (label, category chip, answer type, list preload) rides with the verdict and renders in under 100 ms; the clue or stem text arrives one round trip later via `begin_round`. Practice meets the 100 ms rule fully | With PRD §4.3.3's latency rule, a clue issued during the reveal would charge reading time to the player, and it would let a player look up the next clue outside an active round. Settled: the revised PRD §8.1 splits the row the same way (AC-DLY-38) |
| 3 | AC-ROM-01 "1 host and 5 phone contexts" | Mock-backend room tests use six pages in one browser context, each with its own device namespace. Separate contexts are used in the real-backend job (AC-ROM-11) | BroadcastChannel and localStorage do not cross browser contexts |
| 4 | §8.4's general cap (1,000 writes per IP per 5 minutes after the PRD's rate-limit correction) | The pre-request hook applies that number as a per-IP backstop. The general cap proper counts each verified credential (300 calls per 5 minutes) inside `private.authenticate`, so colleagues on one office address never share one budget. Room RPCs and `log_events` skip the hook and carry their own caps | A 20-phone party behind one router sends about 1,200 heartbeats in 5 minutes. Settled: PRD §8.4 now lists both caps |
| 5 | §3.13.2 report notes | Notes are stored with links stripped and never shown to anyone but the owner, so they skip the slur filter | The filter exists for text shown to others |
| 6 | §8.4 headers | `Referrer-Policy` changes from the foundation's `strict-origin-when-cross-origin` to `no-referrer` | The PRD asks for it |
| 7 | AC-CKE-04 "No other cookie is ever set" | The browser Supabase client switches from `@supabase/ssr` to `@supabase/supabase-js` with session persistence off, and the foundation's cookie-writing server client goes, together with the `@supabase/ssr` dependency (SQL-1) | No auth storage can ever be written, and no route needs a server client |
| 8 | §3.5.1 share link `/s/{number}/{code}` | The code's first character names the composition layout and the rest is a mixed-radix payload (§4.10). Codes are not secret, so anyone can forge a result; the landing says "Someone scored", so nothing is claimed | Stateless landings must decode the grid from the URL alone |
| 9 | §3.1.7 home card | The card's heading text is static. "Daily #42 · Sunday 1 November" sits in a fixed-width slot that the boot script fills from `DAILY_EPOCH` and the device's local date before first paint (§10.3), so the prerendered HTML holds no date and hydration changes nothing. Status, chips, the played count and the Group line load only when `get_today` and the Group ranks answer | One-tap play with zero blocking requests (G4), with no LCP or CLS cost from a date that differs per device |
| 10 | Practice deep links | A run request travels in session storage (`qz:practice-intent`), never in a query string | Generated links stay path-only |
| 11 | §3.1.3 "Tapping Play calls start_daily" | `/daily` starts (or resumes) today's attempt when it mounts; Play links to `/daily` and warms the backend on press | Deep links and Back behave the same as the Play button. Settled: PRD §3.1.3 now says Play opens `/daily` |
| 12 | §3.10.2 restore | The device sends a freshly minted secret with `redeem_sync_code` and `redeem_claim`; the server never returns a secret | Secrets only ever travel from client to server. Settled: PRD §3.10.2, §3.10.4, §5.13 and §5.14 now say the same, and claim tokens are minted on the device too |
| 13 | M1 scope (engine §4 complete) | Wave 1 delivers the playable greybox; Wave 2 completes the engine (streaks, ranking, room scoring) before the M1 exit review | Wave 1 must be playable for persona playtests; streak math is not needed to play |
| 14 | Brief: "SQL seed migrations for sealed pools" | Sealed seed SQL is generated at release time from the encrypted sources and applied through MCP, recorded in `private.content_releases` with its hash, instead of living as committed migration files. Schema stays in committed migrations; non-secret data (answer lists, terms, the e2e track) is committed under `supabase/seed/` | Committed SQL would publish every answer, the same leak as item 1 |
| 15 | §3.11.1 "Answer lists use stale-while-revalidate" | Hashed answer lists and packs are cache-first. A list's URL changes whenever its content does, and the manifest naming the current hash ships with the precached shell | A hashed URL is never stale, so revalidating it only adds a request. Settled: the revised PRD §3.11.1 says cache-first |
| 16 | §3.8.2 and §3.10.6 room names | When the host turns on typed names, a phone's typed name counts as a custom nickname: `room_set_name` needs the 18+ band, from the profile or answered on the seat (13 to 17 keep Shuffle), passes the slur filter, and the host can still rename or remove the player | The minors switch allows generated nicknames only. Settled: the revised PRD §3.10.6 makes typing a room name its fifth age moment |
| 17 | §6.2 routes | Per-user paths (`/c/:code`, `/j/:code`, `/claim/:token`, `/g/:groupId`, `/room/:roomId`, `/host/:roomId`, `/join/:code`, `/q/:code` and their sub-pages) are rewritten in `next.config.ts` onto one static shell page each. The address bar keeps the original path, which the island reads through `usePathParam()` (§10.1), following the router as Next reuses the one shell for every id | Under Partial Prefetching every unlisted param costs a function render and an ISR write, and claim tokens would sit in cached pages (§10.1). Settled: PRD §6.2 now describes the shells |
| 18 | §3.16 and §8.3 "raw analytics events for 30 days" | Raw events are kept 7 days and then live only as daily aggregates | Thirty days of raw events was the largest table in the storage estimate (§8.1). Settled: PRD §3.14, §3.16 and §8.3 now say 7 days |
| 19 | §3.14 and §8.3 "raw attempt rows 30 days, then aggregates" | At 30 days an attempt's per-round detail gives way to its share code and the row keeps only its totals; its facts also live in `private.player_stats` and `player_days`. The compact row is deleted 400 days after the attempt ends | The stats page needs only those aggregates, and kept rows drive long-run database size (§8.1). Settled: PRD §3.14 and §8.3 now say the same |
| 20 | §4.1.3 suggestion ties by sitelink count | `popularity` stays 0 until the Wikidata enrichment workflow's first pull request merges (ENR-1); until then ties fall to `display` order | The sandbox can't reach Wikidata, and CONTENT_GUIDE §9.5.1 never types a count from memory. Settled: the revised PRD §4.1.3 says the same |
| 21 | §9.3 M2 exit includes AC-AGE-01 | At the M2 exit AC-AGE-01 runs as SET-1's helper tests only; the E2E moments join as their features land (Groups and challenges in M3, the reminder in M3 as a Should, quiz sharing in M4) | Those moments are built in Waves 13 to 19. Settled: the revised PRD §9.3 scopes the M2 criterion this way |

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
| The §8.2, §8.3 and §8.6 SQL, extracted from this document, runs cleanly on Postgres 16.15 with Supabase's roles stubbed: 63 tables, each with a primary key, and every foreign key indexed except `player_days.attempt_id` | Local `psql` dry run with `ON_ERROR_STOP`, re-run for this revision [verified] |
| The empty project's database is 10.4 MB (`pg_database_size`) | MCP `execute_sql` [verified] |
| `pg_graphql` 1.6.2 is available but not installed. The `graphql` and `graphql_public` schemas and Supabase's placeholder event triggers exist, so `/graphql/v1` reaches nothing today, and a later `create extension` would expose every `anon`-executable RPC there | MCP `execute_sql` on `pg_extension` and `pg_event_trigger` [verified] |
| `realtime.messages` is partitioned, with RLS on and no policies. `anon` holds table grants there that RLS blocks, and `postgres` can create policies on it through Supabase's policy grants: a probe created one inside a block that then raised, so nothing persisted | MCP `execute_sql` [verified] |
| PostgREST on the project is 14.18, which supports `raise sqlstate 'PGRST'` with a custom status and headers | `src/lib/supabase/database.types.ts` (generated through MCP) [verified] |
| Row costs with indexes, measured with 20,000 synthetic rows each: attempt 1,801 B (341 B compacted), player day 136 B, ranked result 203 B, idempotency key 163 B, event 289 B with four indexes, rate counter 227 B, practice bitset row 627 B | Local Postgres 16.15 [verified] |
| A sequence's `nextval` survives the rollback that a pre-request 429 causes; a counter row's update doesn't | Local Postgres 16.15 [verified] |
| With Partial Prefetching (on in `next.config.ts`), a URL whose params aren't in `generateStaticParams` gets the App Shell, then a background render stored in the ISR cache. `dynamicParams` fails the build under Cache Components | `node_modules/next/dist/docs/01-app/02-guides/incremental-static-regeneration-cache-components.md`, `migrating-to-cache-components.md` [verified] |
| `ensureStatic` takes `'shell'`, `'prefetch'`, `'navigation'` or `false`, and `'shell'` needs Partial Prefetching. Typed routes include the sources of `rewrites()`, so links to a rewritten path type-check | `.../route-segment-config/ensureStatic.md`; `next/dist/server/lib/router-utils/route-types-utils.js` [verified] |
| A synthetic 3,000-entry person list gzips to 87.8 KB in the old shipped shape, 110.2 KB with CONTENT_GUIDE's entity fields, and 64.2 KB as the client projection of §5.5 | A local script (random-syllable names, which compress worse than real ones) [verified] |
| `subset-font` 2.9.0 (BSD-3-Clause, built on `harfbuzzjs`) is on npm | `npm view` [verified] |


---

## 2. Folder structure and module boundaries

### 2.1 The tree

```text
content/                              Authored content (§5). Plaintext, except sealed/.
  categories.json                     The 12 categories: id, slug, name, short name, order
  compositions.json                   Share layouts for each Daily composition (§4.10)
  practice/<category-slug>/<id>.json  Practice items, one file each (ships to clients)
  answer-lists/<type>.json            Closed answer lists: the CONTENT_GUIDE §2.10 source fields
  answer-lists/_wikidata/             Enrichment output (ENR-1), never edited by hand
  sealed/                             AES-256-GCM envelopes: mysteries/, encores/, room-packs/, schedule/,
                                      spares/, challenge-packs/, list-requests/, audits/ (§5.4). Never plaintext in git.
  fixtures/                           Fake content for the mock backend, tests and the e2e track (CORE-0a)
  batches.json                        The batch register (CONTENT_GUIDE §11.3)
  datasets/manifest.json              Pinned datasets; the files live in .cache/datasets/ (git-ignored)
  reference/                          The lint's word lists and constants (CONTENT_GUIDE §11.1): myths, spelling,
                                      stopwords, superlatives, capitals-excluded, units, example-denylist (CNT-2)
  calibration/                        Estimator output, re-tune reports and the weekly run's inputs, by item id only
  OPS.md                              The weekly content run, step by step (CNT-3, PRD §3.18.5)
  safety/slur-terms.txt, allowlist.txt
  names/adjectives.txt, animals.txt   Friendly-name parts ("Plucky Otter")
  category-pages/<slug>.json          Intro copy for /categories/[slug] (F-CAT)
  monthly-packs.json                  Month to tag filter and badge (F-PCK)
scripts/
  content/                            crypto.ts, keygen.ts, seal.ts, unseal.ts (CNT-0); build.ts, check.ts,
                                      lib/ with the one redacting reporter (CNT-1); lint.ts, packets.ts,
                                      estimate.ts, audit.ts, lists/ (the per-source list importers behind
                                      content:lists) (CNT-2); schedule.ts, weekly.ts (CNT-3);
                                      release.ts, dedupe.ts (SQL-3);
                                      enrich-wikidata.ts (ENR-1)
  sql/                                bundle-tests.ts, gen-parity.ts, drift-check.ts, advisors-diff.ts
  codegen/                            analytics-sql.ts, moderation-sql.ts
  checks/                             forbidden-imports.mjs, lazy-markers.mjs, secret-scan.mjs
  check-bundle-budget.mjs             (exists; extended by SEC-1)
supabase/
  migrations/                         Timestamped schema migrations (§8.16)
  seed/                               Committed, non-secret data loads (lists, dictionary, terms, e2e track)
  .generated/                         Git-ignored sealed release SQL
  tests/<area>/*.test.sql             SQL tests, each wrapped in begin ... rollback (§8.17)
  tests/generated/                    Parity tests generated from engine fixture tables
  expected-advisors.json              The advisor findings we accept on purpose (§8.2); QA-2 diffs against it
  fallback/                           The room-signals fallback migration, applied only if the rooms gate needs it
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
    (tabs)/practice/page.tsx, archive/, g/, g/new/, me/, me/achievements/, me/sync/,
           settings/, challenges/, categories/[slug]/
    (play)/layout.tsx                 Focus mode: exit, progress, overflow; no tab bar
    (play)/daily/, daily/[number]/, daily/[number]/results/, practice/run/, practice/results/,
           practice/blitz/, practice/survival/, practice/review/
    (landing)/layout.tsx              Minimal header for deep links
    (landing)/s/[number]/[code]/ (+ opengraph-image.tsx), restore/, join/
    (host)/layout.tsx                 Big-screen layout
    (host)/host/
    (info)/layout.tsx                 Readable layout for legal and trust pages
    (info)/privacy/, terms/, content-policy/, credits/, accessibility/,
           how-scoring-works/, about-our-questions/
    (tabs)/create/, create/new/, create/import/, create/help/import/  (Beta)
    (*)/shell/<name>/                 Static shells that next.config.ts rewrites per-user paths onto:
                                      (landing)/shell/challenge, challenge-result, group-invite, claim,
                                      join, quiz, quiz-result; (play)/shell/challenge-play, room,
                                      quiz-play; (tabs)/shell/group, group-settings, editor;
                                      (host)/shell/host-room (§10.1)
    api/identity/route.ts             POST, DELETE: backup cookie
    api/restore/route.ts              GET: backup cookie restore
    manifest.ts, robots.ts, sitemap.ts, not-found.tsx, offline/page.tsx, icon.svg
  features/rounds/mystery/late.ts     Loads late-parts.ts (the crowd chart, the Encore's number line)
                                      apart from the rounds, for every route that runs them (§10.9 item 4)
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
    rng.ts, clock.ts, time/, text/metrics.ts (sortKey, wordCount, charCount)
    rounds/                           Plugin registry plus choice/, mystery/, encore/, ordering/
    run/                              The run state machine
    scoring/, streaks/, practice/, suggest/, encore/, share/, og/ (preview-image alt text), rooms/,
    text/moderation.ts, quiz-lint/, quiz-import/, achievements/, mastery/, fixtures/
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
                                      server-clock.ts, path-param.ts, network.ts, visibility.ts, broadcast.ts,
                                      outbox/, share.ts, sound/, haptics.ts, speech.ts,
                                      browser-context.ts, settings/
  ui/                                 Design-system primitives. No data, no backend.
  pwa/                                sw.ts (Serwist worker), sw-fallback.ts (hand-written fallback)
  assets/og/                          Subset TTF font for preview images
  analytics/dictionary.ts             Event names, properties and allowed values (§3.12)
  config/
    tunables.ts                       Every "(tunable)" number from the PRD
    shared.json                       Values the client and SQL must agree on (§5.3)
    features.ts                       Feature flag names; composes the defaults from flags/ (never edited after CORE-0a)
    flags/                            One file of flag defaults per owner: beta.ts, practice-modes.ts, review.ts,
                                      progression.ts, growth.ts, categories.ts, sound.ts, display.ts (§2.3)
  lib/                                env.ts, env-parse.ts, metadata.ts, supabase/browser.ts (re-exports the one
                                      client from src/backend/supabase/client.ts), supabase/database.types.ts
  test/                               Unit-test helpers
  instrumentation-client.ts           Error capture before hydration (ANA-1)
  instrumentation.ts                  onRequestError: server errors to log_events with the publishable key (ANA-1)
e2e/                                  Playwright specs on the mock backend
  support/                            fixtures.ts, mock.ts, devices.ts, clock.ts, axe.ts, network.ts
e2e-real/                             Playwright specs for the real-backend job (§11.7)
```

Route groups such as `(tabs)` and `(play)` change layouts, never URLs. `/practice` lives in `(tabs)` and `/practice/run` in `(play)`; Next allows the same segment name in two groups as long as no two pages resolve to one URL. Per-user paths have no folder of their own: `next.config.ts` rewrites each onto a static shell under `shell/` (§10.1), so `/c/AB12CD34` serves `(landing)/shell/challenge` while the address bar keeps the code.

### 2.2 Layer rules

Each row says what a layer may import. Anything not listed is forbidden.

| Layer | May import | Must not import | Enforced by |
|---|---|---|---|
| `src/engine` | `src/engine` only, with relative `.ts` imports | React, Next, zod, `@/backend`, `@/platform`, `@/features`, `@/ui`, `@/lib`; DOM globals; `Date.now`, `Math.random`, `new Date()` with no argument | ESLint `no-restricted-imports`, `no-restricted-globals`, `no-restricted-properties`, `no-restricted-syntax` (PLT-1) |
| `src/content/schema` | zod, `src/engine/types` | Anything that runs in the browser | ESLint: only `scripts/**` and `*.test.ts` may import it |
| `src/content` (other) | `src/engine` (pure modules: the types, and runtime helpers the build itself uses, such as `normalizeName` for list keys (§5.5), `compositionIdOf` and `dailyNumberFor`), `config` | React, features | ESLint |
| `src/backend` | engine, content, config, `@/lib/env`, `@/lib/supabase`, `@/platform/server-clock` (which re-exports `systemClock` for the mock), `@/platform/identity` (types), `@/analytics/dictionary` (types only: §7.2's `EventEnvelope`, `BrowserContextKind`, `Platform`) | features, ui, app | ESLint |
| `src/platform` | engine, config, `@/lib/env`, analytics types | features, ui, backend implementations | ESLint |
| `src/ui` | React, config | engine, backend, platform, features | ESLint |
| `src/features/<x>` | engine, `@/backend` (index and types only), content, platform, ui, analytics, config, and another feature only through its `index.ts`, or through its `client.ts` for client hooks and components. An `index.ts` never re-exports a `"use client"` module: a route whose server code imports a barrel gets every client module the barrel re-exports in its first load, used or not, while a client island that imports one export keeps only that module [measured on Home, 1 November 2026] | another feature's internals, `@/backend/mock/**`, `@/backend/supabase/**` | ESLint path patterns |
| `src/app` | feature route modules (`@/features/*/routes/*`), ui, `@/lib/env` | engine, backend | ESLint |
| `src/pwa` | config, the generated content manifest | everything else (it runs inside the service worker) | ESLint |
| `scripts` | `src/engine`, `src/content/schema`, `src/config/shared.json`, Node built-ins | app, features, platform | Convention and review |

Files under `src/engine` and `src/content/schema` use relative imports with explicit `.ts` extensions and erasable TypeScript only (no `enum`, `namespace` or parameter properties). That lets Node 22 run them from `scripts/` without a build step [verified]. CORE-0a turns on `allowImportingTsExtensions`, `erasableSyntaxOnly` and `verbatimModuleSyntax` in `tsconfig.json`; `noEmit` is already on, so these are safe.

### 2.3 Extension points (so parallel tickets never edit the same file)

CORE-0a and CORE-0b create the files in this table, most of them as stubs with their final signatures. Three rows name another creator instead: PRA-2 makes the practice hub stubs, SET-1 the settings sections and CNT-0 the content-lint stub. The owner named in the last column replaces the stub later. Nobody else edits these files.

| Extension point | File | Contract | Filled by |
|---|---|---|---|
| Engine round plugins | `src/engine/rounds/index.ts` imports `./choice/index.ts`, `./mystery/index.ts`, `./encore/index.ts`, `./ordering/index.ts` | Each exports one `RoundPlugin` (§4.4). The registry file never changes | PRA-1 (choice), MYS-1 (mystery, encore); ordering stays a stub that throws `unsupported_round_type` |
| Round UI components | `src/features/rounds/registry.tsx` imports `./choice`, `./mystery`, `./encore` | Each exports a component taking `RoundComponentProps` (§4.4.3). Screens import them from `@/features/rounds/client`: the registry for mixed runs, or one family component (`ChoiceRound` for practice, Blitz, Survival and review) so the route carries no other | PRA-1, MYS-1 |
| Reveal actions | `src/features/reports/reveal-actions.tsx` | `<RevealActions itemRef mode round wrongGuesses? />`: heart toggle and "Report a problem". `round` is `report_open`'s `round_type` (`'mystery'`, `'encore'`, `'choice'`, `'room'` or `'quiz'`), which also picks the report reasons; `wrongGuesses` (Mystery reveals) feeds "My guess should have counted" | RPT-1 |
| Share button | `src/features/share/share-button.tsx` | `<ShareButton payload surface />`, where `payload: SharePayload { text; mode; grid }` as that file defines it: the exact share text (path-only link last), the run's analytics mode, and the player's own rows for the mini grid (or null); `surface` is `share_open`'s | SHR-1 |
| Challenge button | `src/features/challenges/challenge-button.tsx` | `<ChallengeButton attemptId />`; renders nothing until CHL-1 | CHL-1 |
| Streak line and chip | `src/features/streaks/stop-screen-line.tsx`, `chip.tsx` | `<StreakLine summary />`, `<StreakChip />` | STK-1 |
| Home slots | `src/features/home/sections.tsx` imports one `home-slot.tsx` from each of daily, streaks, practice, review, challenges, groups, archive, rooms, editor, and the notices `src/features/streaks/home-notice.tsx` (`StreakNotice`) and `src/features/identity/home-notice.tsx` (`RestoreNotice`) | Each slot is a client island or `null`, and stays a small `"use client"` wrapper that loads its card with `dynamic()` (eager only: the Daily card 4 kB, Quick play 1 kB, the streak chip 1 kB, the banner 1 kB gzipped; Beta slots check their flag before the import). One notice shows above Practice at a time, first with content wins: the repair card (archive slot), `StreakNotice`, `RestoreNotice`. `PracticeHomeSlot({ placement })` renders twice, `'promoted'` before the Daily and `'regular'` after the notices, and CSS shows one, so reading order follows the screen; only the copy on screen counts an impression. The streaks slot holds the This week card only | The owning feature (`StreakNotice` STK-1, `RestoreNotice` IDN-2) |
| Stop-screen offer cards | `src/features/offers/registry.ts` lists providers in PRD priority: repair, claim, sync, install, calendar, group | `OfferProvider { id; isEligible(ctx): boolean; Card }` in each feature's `offers/<id>.tsx`. `ctx` is `OfferContext { summary; streak; ageBand; browser; groupCount; history; now }` as `src/features/offers/types.ts` defines it, so the repair provider hides for the 13 to 17 band (PRD §3.1.6) | ARC-1 (repair), IDN-2 (claim, sync), CAL-1 (install, calendar), GRP-1 (group) |
| Stop-screen comparison card | `src/features/challenges/stop-screen-card.tsx`, `src/features/share-landing/stop-screen-card.tsx` | Each renders `null` unless it applies; the stop screen shows the first that renders, the challenge head-to-head before the shared-result comparison (PRD §3.1.6 item 1) | CHL-1, SHR-2 |
| Groups on the stop screen and home | `src/features/groups/stop-screen-row.tsx`, `src/features/groups/home-line.tsx` | `<GroupsRow />` and `<GroupLine />`, fed by `groups.todayRanks` (PRD §3.1.6 item 4, §3.1.7) | GRP-1 |
| Room host sources | `src/features/editor/share/host-source.tsx`, imported by ROM-2's `src/features/rooms/host/sources.ts` | `HostSourceProvider { id; label; list(): R<HostSource[]> }`; the stub lists nothing | EDT-3 |
| Practice hub cards and badges | `src/features/practice/modes.ts` imports `./blitz/card.tsx`, `./survival/card.tsx`, `@/features/review/card.tsx`, `./monthly-pack-card.tsx`; the category grid renders `@/features/mastery/badge.tsx` | Each renders `null` until built | BLZ-1, REV-1, CAT-1, MAS-1 (PRA-2 creates these stubs) |
| Settings sections | `src/features/settings/sections.ts` | One module per section | SET-1 creates every section, with stubs for `sections/sound.tsx` (filled by SND-1) and `sections/reminder.tsx` (filled by CAL-1) |
| Mock server areas | `src/backend/mock/index.ts` composes `server/<area>.ts` | Each area exports `create<Area>Area(ctx): <Area>Api` | The feature ticket for that area (§12) |
| Supabase adapters | `src/backend/supabase/index.ts` composes `<area>.ts` | Same shape as the mock areas | The SQL ticket for that area |
| Content loaders | `src/content/loaders/*.ts` | `loadPracticePack`, `loadAnswerList`, `loadFixtureDaily`, `getCategories` | PRA-1, MYS-1, DLY-1 for fixtures; CNT-1 switches them to generated modules |
| Analytics | `src/features/analytics/track.ts`, `regret-survey.tsx` | `track(name, props)` typed by the dictionary (a no-op queue until ANA-1); the survey slot on the stop screen | ANA-1 |
| Feature flags | `isFeatureEnabled(flag)` in `src/lib/env.ts` | Returns the defaults from `src/config/features.ts` until PLT-1 parses `NEXT_PUBLIC_FEATURES` | PLT-1 |
| Feature flag defaults | `src/config/flags/<file>.ts`, composed by `src/config/features.ts` (which never changes) | One object of defaults per owner; the owner turns its flags on when its feature ships | `beta.ts` (rooms, editor): the orchestrator at the Beta gate; `practice-modes.ts` (blitz, survival): BLZ-1; `review.ts`: REV-1; `progression.ts` (mastery, achievements): MAS-1; `growth.ts` (calendar, install_pitch): CAL-1; `categories.ts` (category_pages, monthly_pack): CAT-1; `sound.ts` (read_aloud): SND-1; `display.ts` (readable_text, high_contrast): SET-1 |
| Client boot | `src/features/identity/boot.ts`, exported from `@/features/identity` | `bootClient(): Promise<void>`, memoized per tab, never rejects: storage migrations (§6.1), then the identity and `configureBackend({ identity })` (§9.1). Every island that reads storage or calls `getBackend()` awaits it first. It lives in a feature because `src/platform` may not import `@/backend` | CORE-0b (migrations); DLY-1 adds the identity step (Touch); IDN-1 owns it from Wave 3 |
| Path params of rewritten shells | `src/platform/path-param.ts` (`matchPathParam`, pure) and `usePathParam(source)` in `@/features/shell/client` | The hook follows the router's pathname: null on the server, during hydration and at `/shell/<name>`; the island resets per-id state when it changes (§10.1) | CORE-0b |
| Play frame | `PlayFrame({ header, children })` in `@/features/shell` (no client code of its own, so a server route module or a client island may render it) | The play header, then `<main id="main">`; every `(play)` screen renders it, and the `(play)` layout holds only the skip link, the live regions and `StopwatchChoice` (`src/features/shell/stopwatch-choice.tsx`), which renders nothing and announces "Stopwatch hidden. It still runs for tie-breaks." when the More menu hides the stopwatch. It sits in the layout, not the play header, so no tab route's first load carries it (R3-09) | CORE-0b, then DS-1 restyles it |
| Route modules of the rewritten shells | `src/features/challenges/routes/{challenge,challenge-play,challenge-result}.tsx` (CHL-1); `src/features/groups/routes/{group,group-settings,group-invite}.tsx` (GRP-1); `src/features/identity/routes/claim.tsx` (IDN-2); `src/features/rooms/phone/routes/{join,room}.tsx` (ROM-3); `src/features/rooms/host/routes/host-room.tsx` (ROM-2); `src/features/shared-quiz/routes/{quiz,quiz-play,quiz-result}.tsx` (EDT-3); `src/features/editor/routes/editor.tsx` (EDT-1) | The default export and the metadata the shell page re-exports. Beta modules give their metadata a title only while their flag is on. Stubs render `<PagePlaceholder>` with a hidden `<ShellParam>` marker (from `@/features/shell/client`) until replaced | The ticket in brackets |
| Nickname copy | `src/features/nickname/copy.ts` | The nickname field's words | MOD-1 |
| Content lint | `scripts/content/lint.ts` | `lintBank(bank, { sealed }): Finding[]`; the stub finds nothing, so CNT-1's `check.ts` can call it from day one | CNT-2 (CNT-0 creates the stub) |
| Service health | `src/features/incidents/use-health.ts`, `banner.tsx` | `useServiceHealth(): ClientHealth` (returns `'ok'` until INC-1); the banner slot in the shell | INC-1 |
| Nickname field | `src/features/nickname/nickname-field.tsx` | Generated-name picker plus custom field with filter feedback | MOD-1 |
| Stats sections | `src/features/mastery/stats-section.tsx`, `src/features/achievements/summary.tsx` | Rendered by `/me` | MAS-1 |
| Safe points for updates | `src/features/pwa/safe-point.ts` | `useSafePoint()` called by Home, results and stop screens | PWA-1 |
| Sound and haptics | `src/platform/sound/index.ts`, `src/platform/haptics.ts` | `playEffect(id)`, `vibrate(pattern)`; no-ops until SND-1 | SND-1 |
| Settings store | `src/platform/settings/store.ts` | Typed settings with defaults (§6.2); UI-free | CORE-0a writes it in full; SET-1 adds the UI |

Shared files with a single owner per wave: `package.json` and the lockfile (PLT-1 adds every planned dependency in Wave 2; later SQL-1 removes `@supabase/ssr` and PWA-1 changes the `build` script), `next.config.ts` (CORE-0b adds the `rewrites()` block of §10.1 in Wave 0; then untouched until SEC-1 in Wave 11; new public variables are pinned automatically because it reads `PUBLIC_ENV_NAMES`), `.env.example` (PLT-1), `.gitignore` (CNT-0 in Wave 1, then PLT-1), `src/app/layout.tsx` and `globals.css` (DS-1), `eslint.config.mjs` and `playwright.config.ts` (PLT-1, then CI-1), `.github/workflows/ci.yml` (CNT-0 adds the secret scan in Wave 1; then PLT-1; CNT-1 and SQL-3 add one step each; then CI-1). If a ticket truly needs a shared file it does not own, it records the change as a follow-up note in its pull request instead of editing the file.

**Merge order inside a wave** follows the ticket order in §12.2, with two fixed rules: PLT-1 merges first in Wave 2 and DS-1, ENG-2 and PWA-0 rebase onto it, and BLZ-1 merges before REV-1 in Wave 15, because both touch `src/engine/practice/`.

### 2.4 Conventions

- **Ids.** Practice items `p.<cat>.<4 digits>` (`p.geo.0142`), mysteries `m.<cat>.<4 digits>`, encores `e.<4 digits>`, room-pack questions `r.<pack>.<2 digits>`, spare sets `spare.<2 digits>` (`spare.07`), sealed list requests `lr.<batch>.<2 digits>` (`lr.m.hist.b02.03`, CONTENT_GUIDE §2.12), fixtures prefixed `fx.` (sealed choice rounds in fixture Dailies use `fx.r.<set>.<2 digits>`). Category codes: `geo`, `hist`, `sci`, `nat`, `film`, `music`, `art`, `book`, `sport`, `food`, `lang`, `soc`. Answer entities use Wikidata QIDs (`Q90`) only when a dataset record or the enrichment job supplied them; otherwise `x.<type>.<slug>` (CONTENT_GUIDE §2.12), and a QID found later goes in `wikidataId` while the id never changes.
- **Codes.** Crockford base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`) for challenge codes (8), Group invites (10), quiz share codes (10) and sync codes (16). Input is upper-cased, spaces and hyphens are dropped, I and L read as 1, O as 0. Room codes are 6 digits. Secrets, seat tokens, host tokens and claim tokens are 32 random bytes in base64url (43 characters). Secrets, seat tokens, host tokens and claim tokens are minted on the device and only their hashes reach the server; sync codes are minted by the server.
- **Tests.** Unit tests sit next to the code (`*.test.ts`). E2E specs live in `e2e/<area>/*.spec.ts`. Every test that covers a PRD acceptance criterion starts its title with the id: `test('AC-DLY-07 reload resumes at the same clue', ...)`. SQL tests do the same in their final `select 'PASS AC-DLY-05 ...'`.
- **Copy.** User-facing strings for a feature live in `src/features/<area>/copy.ts`, so the copy lint (AC-STK-06) and the design team can find them. When client components render a few of them, those few live in `client-copy.ts` beside it (and `copy.ts` includes them), so a route's client chunk never carries the rest (the shell does this for the skip link and the tab labels).
- **Branches.** One branch per ticket, `t/<ticket-id>`, cut from the integration branch. The orchestrator merges, applies migrations and commits.

---

## 3. Domain types

These are the contracts every ticket codes against. CORE-0a copies them into `src/engine/types/*.ts` and `src/analytics/dictionary.ts` with their doc comments. Field names are camelCase in TypeScript; SQL payloads use snake_case and the Supabase adapter converts them (§7.5). Run-machine types (`RunState`, `RunEvent`, `RunCommand`) are in §4.5, next to the reducer.

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
export type ItemId = Brand<string, 'ItemId'>;                  // 'p.geo.0142', 'm.film.0107', 'e.0113'
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
export type ClaimToken = Brand<string, 'ClaimToken'>;          // 43-char base64url, minted on the device
export type ShareCode = Brand<string, 'ShareCode'>;            // [0-9a-z]{1,8}
export type PackId = Brand<string, 'PackId'>;                  // 'around-the-world'
export type NoticeId = Brand<number, 'NoticeId'>;
export type AchievementId = Brand<string, 'AchievementId'>;    // 'A01' to 'A30'

/** Test identities start with this prefix (§8.17). */
export const TEST_PLAYER_PREFIX = 'e2e2e2e2-';
```

`ids.ts` also exports total parse helpers (`parsePlayerId(raw): PlayerId | null`, `parseChallengeCode`, `normalizeCrockford`, and so on). Nothing else may cast to a branded type.

### 3.2 Content (`src/engine/types/content.ts`)

These are the **built** shapes: what packs, lists, fixtures and SQL loads hold, and what the engine reads. The authored **source** formats carry more (CONTENT_GUIDE §2's fields marked +, including claims, writer notes and verification) and live as zod schemas in `src/content/schema/`, described in §5.1. The build strips everything the product doesn't read.

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
  seededDifficulty: 1 | 2 | 3 | 4 | 5;  // every kind, encores included (memo §11)
  explanation: string;                  // 35 words or fewer, by wordCount (§4.12)
  learnMore: string;                    // the name searched by the "Learn more" link
}

/** Estimator v0 for choice items: the share of typical adults picking the key (CONTENT_GUIDE §8.5). */
export interface PredictedRate { p: number; spread: number; estimator: string }

export type ChoiceFormat = 'mc' | 'tf' | 'comparison';

/** Multiple choice, true/false and comparison share one shape after the build. */
export interface ChoiceItem extends ItemCommon {
  format: ChoiceFormat;
  stem: string;              // comparison: the relation's prompt, "Which came first?"
  options: string[];         // mc: 3 or 4; tf: ['True', 'False']; comparison: [a, b]
  correct: number;           // index into options, in source order
  order: 'shuffle' | 'ascending' | 'fixed';   // mc numbers and dates: ascending, by sortKey (§4.12);
                                              // tf: fixed; comparison: always shuffle, so the key's side never leaks
  valueDisplay: readonly [string, string] | null;   // comparison only, in source order: ['by 1096', 'around 1325']
  predicted: PredictedRate;
}
export type PracticeItem = ChoiceItem;

export type AnswerType =
  | 'country' | 'city' | 'person' | 'film' | 'tv_series' | 'book'
  | 'animal' | 'element' | 'landmark' | 'music_artist' | 'dish' | 'sport';

/**
 * Estimator v0 for mysteries. solveByClue[k - 1] is the CUMULATIVE share of typical adults who have
 * solved the mystery by clue k, so 0 <= s1 <= s2 <= s3 <= s4 <= 1 (a zod refinement), and expected
 * points are s1 + s2 + s3 + s4, because a solve on clue k earns 5 - k (CONTENT_GUIDE §8.3).
 */
export interface MysteryPrediction {
  solveByClue: readonly [number, number, number, number];
  spread: number;
  estimator: string;
}

/** Sealed. Exists on the client only in mock builds (fixtures). */
export interface MysteryContent extends ItemCommon {
  kind: 'mystery';
  answerType: AnswerType;
  answer: EntityId;
  accepted: EntityId[];                                    // at most 2 genuine equivalents
  clues: readonly [string, string, string, string];        // hardest first, 140 characters or fewer (charCount)
  distractors: readonly [EntityId, EntityId, EntityId];
  slot: 1 | 2 | 3;
  predicted: MysteryPrediction;
  sourceLabels: string[];                                  // the reveal's sources line; may be empty
}

/** Estimator v0 for encores: shares inside the close band and exactly right (CONTENT_GUIDE §8.4). */
export interface EncorePrediction { pClose: number; pExact: number; spread: number; estimator: string }

/** Sealed. */
export interface EncoreContent extends ItemCommon {
  kind: 'encore';
  question: string;
  unit: string;                                            // the unit word, 'kilometres'; '' for years
  unitShort: string;                                       // after numbers: 'km' (may equal unit); '' for years
  unitLabel: string;                                       // beside the field: 'in kilometres', "times Earth's volume"
  valueKind: 'quantity' | 'year';
  answer: number;
  decimals: 0 | 1 | 2;
  bands: { bullseye: number; close: number } | null;       // relative error or years; null = defaults
  predicted: EncorePrediction;
  sourceLabels: string[];
}

/** Sealed multiple choice for room packs and for choice rounds in sealed compositions. Built from the
 *  CONTENT_GUIDE §2.4 source shape plus kind 'choice'; the source's predicted rate stays out of SQL. */
export interface SealedChoiceContent extends Omit<ChoiceItem, 'predicted'> { kind: 'choice' }

/**
 * The client projection of an answer entity (§5.5). Only active entries ship, so retired and merged
 * ones are never suggested. The full record (qualifier, source, status, addedIn, wikidataId,
 * replacedBy) stays in the source file, and private.answer_entities keeps every id so old guesses resolve.
 */
export interface AnswerEntity {
  id: EntityId;
  display: string;           // 'Paris, France': what suggestions show
  keys: string[];            // normalizeName of the name first, then of each alias (§4.7)
  popularity: number;        // Wikidata sitelink count; 0 until enrichment (ENR-1); breaks ranking ties
}
export interface AnswerList { type: AnswerType; version: string; entities: AnswerEntity[] }

export interface RoomPack { id: PackId; title: string; theme: string; questionIds: ItemId[] }   // 15 ids

/** Challenge packs (PRD §3.6.1): the table and type exist in v1, but none is published before 30 Dailies close. */
export interface ChallengePack {
  id: PackId; title: string; theme: string;
  rounds: RoundSpec[]; composition: CompositionId; maxPoints: number;
}
```

The Daily assembler and the content checks compute a mystery's expected points with `expectedPoints(predicted)` in `src/engine/scoring/expected.ts`, the sum of the four cumulative shares, and the schedule rules read it (§5.2). On the wire a list ships as compact tuples, `[id, display, keys, popularity]`, which the loader turns into `AnswerEntity` objects; the projection and its size budget are in §5.5.

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

/** A clue-4 option. It names no entity id: pick sends the index, and the server marks guessed ones.
 *  When any of the four labels carries a descriptor, all four do (§8.8, CONTENT_GUIDE §2.10 rule 6). */
export interface OptionView { index: number; label: string; alreadyGuessed: boolean }
export interface WrongGuess { clue: 1 | 2 | 3; entityId: EntityId; display: string }

/** What the client may see while a round is open. */
export type RoundOpen =
  | { family: 'mystery'; index: number; clue: 1 | 2 | 3 | 4; clues: string[];
      wrongGuesses: WrongGuess[]; options: OptionView[] | null; issuedAt: EpochMs }
  | { family: 'encore'; index: number; question: string; unit: string; unitShort: string; unitLabel: string;
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

/** relative: the symmetric error max(g, a) / min(g, a) - 1 of PRD §4.2.2, computed exactly (§4.6); years: |g - a|. */
export interface EncoreError { kind: 'relative' | 'years'; value: number; display: string }   // '4% off'
export type EncoreBand = 'bullseye' | 'close' | null;

export type RoundReveal =
  | { family: 'mystery'; answer: { entityId: EntityId; display: string };
      clues: readonly [string, string, string, string]; solvedOn: 1 | 2 | 3 | 4 | null; points: number;
      pickedOption: number | null; explanation: string; learnMore: string; sourceLabels: string[];
      crowd: MysteryCrowd | null }
  | { family: 'encore'; guess: number; answer: number; unit: string; unitShort: string; error: EncoreError;
      band: EncoreBand; explanation: string; learnMore: string; sourceLabels: string[]; crowd: EncoreCrowd | null }
  | { family: 'choice'; correctIndex: number; chosenIndex: number | null; correct: boolean; points: number;
      valueDisplay: readonly [string, string] | null;   // comparisons: both checked values, in display order
      explanation: string; learnMore: string; crowd: ChoiceCrowd | null }
  | { family: 'withdrawn'; round: RoundFamily; points: number; maxPoints: number };   // a voided round (PRD §3.13.4)

/** The judge's answer to one intent. */
export type RoundVerdict =
  | { kind: 'continue'; open: RoundOpen }                                  // wrong guess or Next clue
  | { kind: 'resolved'; reveal: RoundReveal; next: RoundMeta | null };     // the round is over

/** What begin_round returns. A voided round never opens: it resolves at once as withdrawn,
 *  scoring a mystery's 4 points, or an encore with no error. */
export type RoundStart =
  | { kind: 'open'; open: RoundOpen }
  | { kind: 'withdrawn'; reveal: Extract<RoundReveal, { family: 'withdrawn' }>; next: RoundMeta | null };

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

export interface BestMomentFacts {          // PRD §3.1.6 item 2, in its priority order
  perfect: boolean;
  newBestScore: boolean;          // true only with 3 or more earlier finishes
  firstFinish: boolean;           // the player's first finished Daily ever (also the day-1 milestone)
  milestone: number | null;
  freezeEarned: boolean;
  hardestSolvedOnClue1: boolean;
  bullseye: boolean;              // mastery tiers are decided on the device
  earlierFinishes: number;        // gates the personal comparison (3 or more)
}
export interface StreakDelta {
  before: number; after: number; freezesHeld: 0 | 1 | 2;
  freezeEarned: boolean; repaired: boolean; milestone: number | null;
  paused: { streak: number; until: EpochMs } | null;   // while a repair is possible, the score card shows this
                                                       // pre-break count as paused, never `after` (PRD §3.1.6 item 2)
}
export interface FinishSummary {
  attemptId: AttemptId; points: number; maxPoints: number; encore: EncoreError | null;
  totalMs: number; ranked: boolean; streak: StreakDelta | null; facts: BestMomentFacts;
}

export interface TodayRoundChip { type: RoundType; difficulty: DifficultyBand | null; answerType: AnswerType | null }

export interface DailyTodayCard {
  daily: DailyIdentity;
  rounds: TodayRoundChip[];      // the home card's chips; answer types are public from clue 1 anyway
  playedCount: number | null;    // finished ranked runs so far today; null below 50 (a fixed PRD §3.1.7 rule, not percentile_min_n)
  status: 'not_started' | 'in_progress' | 'finished';
  attemptId: AttemptId | null;
  progress: { roundIndex: number; of: number } | null;
  finished: { points: number; maxPoints: number; rows: ShareCell[][]; encore: EncoreError | null } | null;
  nextUnlockAt: EpochMs;          // the start of the day after the effective today, in the request's zone (AC-STK-07)
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
  histogram: ScoreHistogram | null;   // null below percentile_min_n eligible finishers
  personal: { average: number; best: number; earlierFinishes: number } | null;   // from 3 earlier finishes
  challenge: { code: ChallengeCode } | null;   // set when a challenge run landed here (§10.1)
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
  display: 'active' | 'paused' | 'broken';           // PRD §4.4.3 step 6: what every surface shows
  paused: { streak: number; until: EpochMs } | null; // while a repair is possible: the pre-break count and
                                                     // the repair deadline; no surface then shows current (0)
  breakTooLong: boolean;           // two or more uncovered dates in the break
  notices: StreakNotice[];         // unseen one-time notices
  today: LocalDate;                // the effective today (§8.7): never earlier than one already served
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
  challengerPlayed: boolean;                   // false for a rematch its sender hasn't played yet
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
  // nickname: the participant's chosen nickname, or their generated friendly name; nothing else
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
/** points, daysPlayed and currentStreak leave today out until the viewer has finished today's Daily,
 *  so the week totals can't reveal anyone's score for today (AC-GRP-06). */
export interface GroupWeekRow {
  rank: number; memberNo: number; nickname: string; isMe: boolean;
  points: number; daysPlayed: number;
  currentStreak: number; streakPaused: boolean;   // paused: currentStreak holds the pre-break count, shown
                                                  // as "23 · paused", never 0 (PRD §3.7.2, AC-RPR-09)
}

/** One line of the stop screen's Groups row and the home card's Group line (PRD §3.1.6 item 4). */
export interface GroupTodayRank {
  groupId: GroupId; name: string;
  rank: number | null; tied: boolean;   // null until the viewer has finished today's Daily
  finishers: number; notYet: number;
}
export interface GroupBoard {
  group: GroupSummary;
  today: { daily: DailyIdentity; viewerFinished: boolean; playedCount: number; rows: GroupTodayRow[] };
  week: { start: LocalDate; end: LocalDate; through: LocalDate; maxPoints: number; rows: GroupWeekRow[] };
  lastWeek: { nicknames: string[]; points: number } | null;   // everyone tied on the top points (AC-GRP-15)
  fetchedAt: EpochMs;
}
export type GroupAdminAction =
  | { kind: 'rename'; name: string }
  | { kind: 'regenerate_invite' }
  | { kind: 'transfer_admin'; memberNo: number }
  | { kind: 'remove'; memberNo: number }
  | { kind: 'delete' };                              // after both confirm steps on the client (AC-GRP-13)
```

### 3.7 Rooms, Beta (`rooms.ts`)

```ts
export type RoomPhase = 'lobby' | 'read' | 'answering' | 'reveal' | 'standings' | 'paused' | 'podium' | 'ended';
export interface RoomSettings {
  timerSeconds: 10 | 20 | 30 | 60 | null;   // null: host advances
  scoring: 'classic' | 'accuracy';
  names: 'generated' | 'typed';            // typed: phones may set a filtered name (§8.11); generated by default
}
export type RoomSource = { kind: 'pack'; packId: PackId } | { kind: 'quiz'; quizId: QuizId };

/** The only thing Realtime carries. A hint to refetch, never truth. */
export interface RoomHint { roomId: RoomId; version: number; phase: RoomPhase; questionIndex: number; deadline: EpochMs | null }

export interface RoomQuestionView {
  index: number; total: number; isFinal: boolean; stem: string;
  options: string[] | null;        // null until the server clock passes optionsAt: the read beat never carries them
  optionsAt: EpochMs; deadline: EpochMs | null;
}
export interface RoomRevealView { correctIndex: number; distribution: number[]; explanation: string; voided: boolean }
export interface RoomStanding { seatId: SeatId; name: string; score: number; rank: number }

export interface RoomPlayerView {
  roomId: RoomId; version: number; phase: RoomPhase; locked: boolean; serverTime: EpochMs;
  hostAway: boolean;                // no host call for 60 s; the room ends after 15 minutes away
  names: 'generated' | 'typed';
  me: { seatId: SeatId; name: string; score: number; rank: number | null; gapAbove: number | null;
        aboveName: string | null; answered: boolean; last: { correct: boolean; points: number } | null;
        extraTime: boolean; scoresFrom: number };   // a seat that joined mid-question scores from the next one
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
  joinsOpen: boolean;              // false while locked, full or at the project's connection cap
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
  version: number;                 // the immutable version that plays, rooms and challenges reference (§8.3)
  updatedAt: EpochMs; shareCode: QuizShareCode | null; state: QuizState;
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
export type ItemReportReason = 'guess_should_count' | 'wrong_answer' | 'ambiguous' | 'out_of_date' | 'offensive' | 'typo';   // the first on Mystery reveals only
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
  guessEntityId?: EntityId | null;  // 'guess_should_count': the chosen wrong guess, null for "I couldn't find my answer"
  note: string | null;              // 280 chars or fewer; links stripped on both sides
  clientId: IdempotencyKey;         // the outbox key; one report per identity per target
}

/** itemRef: 'p.geo.0142', 'daily:42:2', 'room:<roomId>:7', 'quiz:<code>:3' */
export interface HeartInput { itemRef: string; on: boolean; clientId: IdempotencyKey }
```

### 3.10 Identity and health (`identity.ts`, `health.ts`)

```ts
export type AgeBand = 'under_13' | '13_17' | '18_plus';
export type AgeMoment = 'nickname' | 'group' | 'reminder' | 'quiz_share' | 'room_name';   // PRD §3.10.6's five moments

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
  retryAfterMs: number | null;       // set on every 'rate_limited', and on 'unavailable' while the server sheds
  limitScope?: 'ip' | 'player' | 'project';   // 'rate_limited' only: whose limit refused, which picks AC-IDN-04's copy
  refId: string | null;              // the short reference shown in small text
  current?: unknown;                 // 'stale' and 'conflict' carry the current server state
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: BackendError };
```

### 3.12 Analytics events (`src/analytics/dictionary.ts`)

The dictionary is the single source for client types, the client-side allowlist and the SQL allowlist (SQL-10 generates `supabase/seed/analytics-dictionary.sql` from it). It mirrors PRD §7.2, including the revision's `run_complete` name, `how_to_play_open`, the `repair` offer, the stop screen's comparison and Groups properties, `home` as a share surface, the `room_name` age moment, the `NEXT` vital, and `client_error` kind `server`, for errors that `instrumentation.ts` reports from the server (§8.14).

```ts
const e = <const T extends readonly string[]>(...values: T) => ({ kind: 'enum', values }) as const;
const bool = { kind: 'bool' } as const;
const num = (min: number, max: number) => ({ kind: 'number', min, max }) as const;
const ref = { kind: 'item_ref' } as const;       // 'p.geo.0142' style
const word = { kind: 'token', max: 48 } as const; // [a-z0-9_.-], e.g. a composition id or build id
const hex16 = { kind: 'hex', length: 16 } as const;
const numOrNone = (min: number, max: number) => ({ kind: 'number_or_none', min, max }) as const;

const MODE = e('daily', 'archive', 'practice', 'blitz', 'survival', 'review', 'challenge', 'room', 'quiz');
const APP = e('whatsapp', 'instagram', 'facebook', 'messenger', 'tiktok', 'snapchat', 'linkedin', 'telegram', 'google', 'other', 'none');
const OFFER = e('repair', 'claim', 'sync', 'install', 'calendar', 'group', 'none');
const SURFACE = e('stop', 'home', 'archive', 'practice', 'challenge', 'group_invite', 'quiz', 'head_to_head');
const TRIGGER = e('third_daily', 'first_quiz', 'in_app_first', 'private_first', 'pre_install', 'tenth_daily', 'manual');

export const EVENTS = {
  landing_view: { entry: e('direct', 'share', 'challenge', 'group_invite', 'room', 'quiz', 'search', 'installed', 'other'), app: APP },
  first_answer: { mode: MODE },
  practice_start: { mode: MODE, category: word, difficulty: e('easy', 'medium', 'hard', 'mixed', 'ramp') },
  run_complete: { mode: MODE, score_band: e('0-3', '4-6', '7-9', '10-12', '7-8', '9-10', 'na'), composition: word },
  results_view: { mode: MODE },
  stop_screen_view: { first_view: bool, offer: OFFER, comparison: e('head_to_head', 'shared_result', 'none'),
                      groups_shown: e('0', '1', '2', '3+') },
  offer_action: { offer: OFFER, action: e('accept', 'dismiss') },
  how_to_play_open: { round: numOrNone(1, 10), first_daily: bool },
  mystery_input: { round: num(1, 3), typed: bool, suggestions_shown: bool, resolution: e('guess', 'option', 'missed'),
                   first_keystroke_s: e('0-5', '5-15', '15-30', '30+', 'none') },
  suggestion_none: { answer_type: word, query_len: e('3-5', '6-10', '11+') },
  share_open: { mode: MODE, surface: SURFACE },
  share_complete: { method: e('native', 'clipboard', 'manual'), mode: MODE, surface: SURFACE },
  share_cancel: { mode: MODE, surface: SURFACE },
  challenge_open: { state: e('valid', 'expired', 'full', 'not_open', 'invalid'), relation: e('new', 'already_played', 'self') },
  group_invite_open: { state: e('valid', 'full', 'invalid') },
  room_join: { result: e('ok', 'full', 'locked', 'bad_code', 'rate_limited'), method: e('qr', 'code'),
               phase: e('lobby', 'in_game'), name: e('generated', 'typed') },
  room_disconnect: { reason: e('heartbeat_timeout', 'offline', 'hidden', 'removed', 'ended'), duration_s: e('0-10', '10-60', '60+') },
  realtime_fallback: { reason: e('channel_error', 'late_phase') },
  read_beat_skip: { slot: num(1, 50) },
  explanation_dwell: { mode: MODE, seconds: e('0-2', '2-5', '5-10', '10-20', '20+') },
  question_heart: { item_id: ref, mode: MODE, value: e('on', 'off') },
  report_open: { mode: MODE, round_type: e('mystery', 'encore', 'choice', 'room', 'quiz') },
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
  age_band_set: { band: e('13_17', '18_plus'), moment: e('nickname', 'group', 'reminder', 'quiz_share', 'room_name') },   // Under 13 sends nothing
  settings_change: { setting: e('theme', 'motion', 'sound', 'haptics', 'readable_text', 'high_contrast', 'read_aloud',
                                'stopwatch', 'shortcuts', 'auto_advance', 'timer_announcements', 'display_name'),
                     value: e('system', 'light', 'dark', 'on', 'off', 'shown', 'hidden', 'generated', 'custom') },
  offline_state_shown: { feature: e('daily', 'archive', 'challenge', 'group', 'room', 'quiz', 'restore') },
  incident_banner_shown: { state: e('degraded', 'outage', 'unreachable', 'maintenance', 'content_fix') },
  survey_answer: { question_id: e('regret_v1'), answer: e('yes', 'no', 'not_sure', 'dismissed') },
  web_vitals: { metric: e('LCP', 'INP', 'CLS', 'FCP', 'TTFB', 'Q1', 'NEXT'), value: num(0, 600_000), rating: e('good', 'needs_improvement', 'poor') },
  client_error: { kind: e('error', 'rejection', 'rpc', 'server'), message_hash: hex16, rpc: word, code: word },   // server: onRequestError
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

`PropValue` maps `enum` to its literal union, `bool` to `boolean`, `number` to `number`, `number_or_none` to `number | 'none'` and the string kinds to `string`. A dictionary edit is a contract change: it needs a new SQL dictionary load (SQL-10's generator) in the same pull request, and CI fails if the committed SQL does not match the dictionary.

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
| `localDateOf(at, tz)` | The `YYYY-MM-DD` date of instant `at` in zone `tz`, built from the `year`, `month` and `day` parts of `Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)`. Never by parsing a formatted string, whose layout has shifted between ICU releases |
| `zoneOffsetMinutes(at, tz)` | UTC offset at that instant |
| `startOfLocalDay(date, tz)` | The instant of local 00:00 (found by offset search, safe across DST) |
| `msUntilLocalMidnight(at, tz)` | Countdown source for "Next Daily in" |
| `addDays(date, n)`, `daysBetween(a, b)` | Calendar arithmetic on `LocalDate` strings |
| `dailyNumberFor(date, epoch)` | `daysBetween(epoch, date) + 1` |
| `globalWindow(date)` | `{ opensAt: date 00:00 at UTC+14, closesAt: date+1 00:00 at UTC-12 }`, about 50 hours. An attempt's close is computed from its own `local_date` (§8.7) |
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

The feature layer turns `Announcement` data into copy ("Not Heat. Clue 3, now worth 2: ...") from its `copy.ts`, so wording stays with the design team. Plugins leave `verdict.next` and crowd stats null; the sealed layer (the mock server or SQL) fills them in, because only it knows the attempt's composition and the crowd. A voided round never reaches a plugin's `open` or `judge`: the sealed layer resolves it as withdrawn first (§8.8).

`rounds/index.ts` exports `PLUGINS: PluginRegistry`, keyed by `RoundType`, and `pluginFor(type)`. The registry imports one module per family and never changes after CORE-0a.

#### 4.4.1 Families

| Family | Client state | Judge state | Rules (PRD) |
|---|---|---|---|
| `choice` (mc, tf, comparison) | Options in display order, chosen index, reveal | Correct index in display order | Display order: `shuffle` items use the stored or seeded order; `ascending` items sort by `sortKey` (§4.12); tf is fixed (True, False); comparisons always shuffle. One `answer` intent resolves the round. 1 point (practice and sealed), 0 when wrong. A comparison's reveal carries `valueDisplay` in display order. Cells `correct` or `wrong` (PRD §3.3.2) |
| `mystery` | Clue number, revealed clues, wrong guesses, options from `optionsFromClue` | Answer, accepted ids, distractors, guessed ids, current clue | `guess` on clues 1 to 3: an id not on the list is `invalid_entity` and consumes nothing; a repeat is `already_guessed` and consumes nothing; a correct id resolves with `5 - k` points; a wrong id issues clue `k + 1`. `next_clue` issues clue `k + 1`. From clue `optionsFromClue` the four options (answer plus three distractors, in the stored shuffle, naming no entity id) replace typing; options already guessed come back `alreadyGuessed`. A correct `pick` resolves with `5 - k`; a wrong pick before clue 4 issues the next clue with that option disabled; a wrong pick on clue 4 misses with 0. Cells: `k - 1` passed, solved, `4 - k` unused; a miss is four passed; a void is four voided (PRD §4.1) |
| `encore` | Question, unit, kind, decimals | Answer, bands | One `lock_in` with a parsed value resolves the round with the error, band and display (PRD §4.2). 0 points |
| `ordering` | (reserved) | (reserved) | The stub throws `unsupported_round_type`; the content schema refuses ordering items in v1 |

#### 4.4.2 Encore input and suggestions are engine code too

- `encore/parse.ts`: `parseEncoreInput(raw, { decimals, valueKind })` returns `{ ok: true, value, preview }` or `{ ok: false, error: 'not_number' | 'not_positive' | 'bad_separator' | 'too_many_decimals' | 'too_many_digits' | 'year_range' }`, implementing PRD §4.2.1 exactly. With no decimals allowed, every "." and "," is a thousands separator and is ignored. With decimals: when both kinds appear, the last separator is the point and must be the only one of its kind, and every earlier one is grouping; when one kind appears, its first occurrence is the point and any further separator is `bad_separator`; more digits after the point than allowed is `too_many_decimals`. A minus sign or a value of 0 is `not_positive` ("Positive numbers only."). At most 15 significant digits; years are whole numbers from 1 to 9999. Scaled by `10^decimals`, any accepted value is an exact integer below 2^53, which is what the exact error of §4.6 works on, and `round_judge_encore` re-checks the same limits on the value it receives (§8.8).
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

export interface Suggestion {             // one row of the guess combobox (PRD §4.1.3)
  entityId: EntityId;
  display: string;                        // "Paris, France"
  alreadyGuessed: boolean;                // listed, disabled, "Already guessed"
  match: { start: number; end: number } | null;  // the matched part of display for <mark>; null for an alias or typo
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
  requests: number;                // begin_round plus each accepted state-changing action (§8.8)
  activeMs: number;                // client-measured active time
  hiddenMs: number;                // time the page was hidden or the window blurred while a clue was open
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
  | { kind: 'judge'; index: number; intent: RoundIntent; key: IdempotencyKey; hiddenMs: number; activeMs: number }
  | { kind: 'schedule_retry'; tries: number; afterMs: number | null }   // transport: 2, 5, 10, then 30 s;
                                                   // rate_limited: Retry-After, else 1, 2, 4, 8 s with jitter
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
4. `failed` with `retryable: false` clears `pending` and returns to `active` with the error, except `stale`, which emits `resync`. `rate_limited` keeps `pending` and schedules a silent retry with the same key (PRD §3.0.2): the server refused before consuming anything, so the clue is still open when it goes through. The view shows plain copy after 5 s of refusals, the action's own copy at once when the wait passes 60 s, and a feature's fallback only after 30 s.
5. Reading time never counts: `activeMs` accrues only between `opened` and `verdict 'resolved'`, and only while not hidden (client measure; the server keeps its own).
6. End rules: `fixed` finishes on the Continue after the last round; `strikes` finishes on the Continue after the `max`th wrong verdict; `clock` finishes on the first `tick` at or after `countdownEndsAt`, discarding an unresolved round (AC-BLZ-01).
7. `visibility(hidden)` during `active` or `judging` starts a hidden span and `visibility(visible)` adds it to `slot.hiddenMs`; every `judge` command carries the round's running total, which the server keeps as the round's maximum. In Blitz a hidden page also pauses the countdown (AC-BLZ-03).
8. Sealed runs never persist answers locally; `resume` rebuilds them from `AttemptSnapshot`. Local runs persist `LocalRunSnapshot { config, slots, score, strikes, startedAt, index }` after every verdict, so a reload resumes (AC-DLY-07 for the Daily, Back behavior for practice).

Controllers (`src/features/<mode>/model/controller.ts`) interpret commands: they call `GameBackend` or the local judge, run timers through `src/platform`, translate announcements into copy, record analytics, and expose the state to React through `useSyncExternalStore`. Controllers are framework-free TypeScript, unit-tested with the mock backend.

### 4.6 Scoring (`scoring/`)

| Rule | Function | Formula | PRD |
|---|---|---|---|
| Mystery points | `mysteryPoints(solvedOn)` | `5 - k`; 0 when missed; a voided mystery scores 4 | §4.1.2, §3.13.4 |
| Encore error | `encoreError(kind, guess, answer, decimals)` | quantity `max(g, a) / min(g, a) - 1`, so twice the answer and half of it are both 1.0 ("100% off"); year `abs(g - a)`. Kept as the exact ratio `(max - min) / min` of two integers scaled by `10^decimals`, and turned into a float only for `value` | §4.2.2 |
| Encore band | `encoreBand(error, bands)` | bullseye `e <= 0.05` or `d <= 2`; close `e <= 0.15` or `d <= 5`; checked on the unrounded error without floating point: a quantity is inside band `b` when `(max - min) × 10,000 <= min × (b × 10,000)`, in `bigint` here and `numeric` in SQL, with bands stored to at most 4 decimal places. So 21 against 20 is a bullseye on both sides, although a float `21 / 20 - 1` is 0.050000000000000044 | §4.2.2 |
| Encore display | `formatEncoreError(error)` | "Spot on"; "under 1% off"; whole percent rounded half up from the exact ratio ("4% off"; 1,045 against 1,000 is "5% off", where a float would give 4.499...); "over 999% off" at 999% or more; "1 year off", "3 years off" | §4.2.2 |
| Choice points | `choicePoints(correct)` | 1 or 0 | §3.3.1 |
| Run points | `runPoints(outcomes)` | sum; maximum = sum of `maxPoints` | §3.1.2 |
| Effective round time | `effectiveRoundMs(serverMs, clientMs, requests)` | `max(serverMs - 400 * requests, clientMs)`, never below 0, capped at 15 min. `requests` counts the round's `begin_round` (for round 0, the `start_*` call that opened it, §8.4) plus each accepted state-changing action (a wrong guess, Next clue, a pick, an encore lock-in, a choice answer). Refused calls (`invalid_entity`, `already_guessed`, `stale`, `rate_limited`), replays of a known key and repeated `begin_round` calls never count | §4.3.2, §4.3.3 |
| Expected mystery points | `expectedPoints(predicted)` | `s1 + s2 + s3 + s4` over the cumulative shares | CONTENT_GUIDE §8.3 |
| Ranking | `compareRuns(a, b)`; `rankKey(run)` | points desc, then encore error asc (voided or absent: equal), then total time asc | §4.3.1 |
| Rank key (SQL parity) | `rankKey(run): bigint` | `points * 2^58 + (2^34 - 1 - errMicro) * 2^24 + (2^24 - 1 - totalMs)`, where `errMicro = min(round(error * 1e6), 2^34 - 1)`, rounded half up from the same exact ratio as the band check (0 when voided or absent) and `totalMs` is capped at `2^24 - 1`. Higher is better; equal keys tie. Supports up to 31 points | §4.3.1 |
| Percentile | `percentile(worse, tied, pool)` | `floor(100 * (B + 0.5 T) / (N - 1))`, shown only when `N >= percentile_min_n` (50 at launch); `N` counts the player once | §4.3.4 |
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

1. **Normalize** (`normalizeName`): Unicode NFKD, strip combining marks, lowercase, `&` to `and`, delete apostrophes (`'`, `‘`, `’`, `ʼ`, `` ` ``) and periods (`R.E.M.` is `rem`, `U.S.` is `us`), turn every other run of punctuation or symbols into one space (hyphens and slashes split words: `guinea bissau`, `ac dc`), collapse whitespace, trim, drop a leading `the `, `a ` or `an `. The build stores each entity's normalized name, then its aliases, in `keys`, so phones skip that work. Only active entries ship (§5.5), so a retired or merged entry is never suggested.
2. **Match**: an entity matches when the normalized query is a prefix of a key or of any word in a key. For queries of 5 or more characters, a key or word also matches when it starts with a string within one edit (insertion, deletion, substitution or adjacent swap) of the query.
3. **Rank** tiers: exact key, canonical-name prefix (`keys[0]`), alias prefix, word prefix, typo. Ties break on `popularity` (descending), then `display` (ascending). Popularity is global, so ranking never hints at today's answer, and while it is 0 everywhere (before ENR-1's first pull request) ties simply fall to `display` order.
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
  ability: null;                          // reserved: adaptive Mixed (F-ADP) is Later (PRD §3.3.3)
  tags?: string[];                        // monthly pack (F-PCK)
}
export interface PracticePlan {
  items: PracticeItem[];
  notes: ('repeats_mixed_in' | 'pool_exhausted' | 'hard_filled' | 'hard_exhausted')[];
}
export function planPracticeRun(pool: readonly PracticeItem[], req: PracticeRequest): PracticePlan;
export function createPracticeStream(pool: readonly PracticeItem[], req: PracticeRequest): PracticeStream;  // Blitz, Survival
```

1. **Eligible pool**: the category (or all), minus the pulled-item denylist, minus items past `reviewBy`.
2. **Bands** by predicted rate `p` (tunable): Easy `p >= 0.75`, Medium `0.45 <= p < 0.75`, Hard `p < 0.45` (AC-PRA-08). Mixed takes 4 Easy, 4 Medium and 2 Hard in the PRD's shape: positions 1 to 4 hold the Easy items and 5 to 7 three of the Mediums, in non-increasing `p`; positions 8 and 9 hold the two Hard items, the hardest at 8 or 9 by seed; position 10 holds the Medium with the highest `p` (AC-PRA-13).
3. **Freshness tiers**: never seen, then seen 60 or more days ago, then the least recently seen. Using the last tier adds the `repeats_mixed_in` note (AC-PRA-05, AC-PRA-06). **Short Hard filters**: before any repeat, a Hard run fills from the hardest unseen Medium items in the same category (`hard_filled`); when those run out too, the plan stops with `hard_exhausted` and the setup offers Hard Mixed, so repeats come only from "Play with repeats" (AC-PRA-14).
4. **Composition**: at most 1 true/false and 2 comparisons; the first question is never true/false and is the easiest in the run (AC-PRA-03). Selection draws with the seeded RNG and replaces any pick that would break a rule.
5. **Option order**: shuffled with the seed unless the item is `ascending` or `fixed` (AC-PRA-04).
6. **Adaptive Mixed (F-ADP) is Later.** The PRD moved it out of v1, because it would adapt on estimates carrying 13 to 21 points of error before play data exists. The request keeps its `ability` slot (always null), and packs still carry each item's `samples` count from the weekly re-tune, so adding it later changes no contract.
7. **Survival** ramps Easy for questions 1 to 5, Medium for 6 to 12, Hard from 13 (tunable), and ends on 3 strikes or an empty pool. **Blitz** lasts `blitz_seconds` (60 at launch, one length only) and streams from the filters; its countdown pauses during each 600 ms verdict flash, while the tab is hidden and while read aloud speaks; only answered questions are marked seen, and a question on screen when time runs out is unscored and unseen.
8. **Review (F-REV)**: intervals 1, 3, 7 and 21 local days; right moves to the next interval, wrong resets to 1 day, right at 21 days marks the item learned. The queue keeps 200 items (oldest dropped); a session serves up to 10 due items, oldest due first (AC-REV-01 to 04).

### 4.9 How the Daily composition stays data-driven

A Daily is a schedule row whose `rounds` column is an ordered `RoundSpec[]`. Nothing in the code knows that v1 has three mysteries and an encore.

- **Rounds come from the plugin registry.** The run machine walks `RoundMeta[]`; each round's plugin supplies its maximum points, client state, judge and share cells. The Daily's maximum is the sum, so `[mc ×9, encore]` scores out of 9 (AC-DLY-09).
- **The UI comes from the round component registry**, keyed by family. The header's progress bar has one segment per round; labels such as "Mystery 2 of 3 · Medium" come from `RoundMeta.ordinal`, `ofType` and `difficulty`.
- **SQL dispatches on the round type.** `begin_round` and `round_action` call `private.round_open_<family>` and `private.round_judge_<family>` (§8.8). All five v1 types have SQL handlers.
- **The composition id is derived.** Each run of identical consecutive types becomes a letter and a count: mystery `m`, encore `e`, mc `c`, tf `t`, comparison `p`, ordering `o`. So `[mystery, mystery, mystery, encore]` is `m3e1`, `[mc ×9, encore]` is `c9e1`, and `[mc ×5, mystery, encore]` is `c5m1e1`. Analytics' `run_complete.composition` carries it.
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
- `shareAltText(decoded)` in `src/engine/og/alt-text.ts` builds the preview image's alt text ("Daily #42 result: 9 out of 12. Geography solved on clue 1. ..."). ENG-2 writes it; SHR-2 owns it from Wave 12, so it sits outside SHR-1's `src/engine/share/`.

Codes carry no secret and can be forged. The landing says "Someone scored", so a forged code claims nothing.

### 4.11 Streak evaluation (`streaks/`)

The engine implements PRD §4.4 as one pure function. The mock backend uses it as its "server", and the SQL copy is tested against the same scenario table.

```ts
export interface StreakInput {
  now: EpochMs;
  today: LocalDate;                                   // the effective today (§8.7), never earlier than one already served
  dayStart(date: LocalDate): EpochMs;                 // local 00:00 in the current zone
  offsetMinutes: number;                              // current request
  lastFinishOffsetMinutes: number | null;
  zone: TimeZone;                                     // current request
  lastFinishZone: TimeZone | null;
  datelineCandidate: { date: LocalDate; zone: TimeZone } | null;   // stored by an earlier request, PRD §4.4.7
  datelineUsedAt: EpochMs | null;                     // the date-line rule fires at most once per 30 days
  days: { date: LocalDate; status: Exclude<DayStatus, 'today'> }[];  // stored statuses, sorted
  pending: LocalDate[];                               // dates holding an open ranked attempt that can still finish on time
  freezesHeld: 0 | 1 | 2;
  freezeProgress: number;
  lastRepairAt: EpochMs | null;
  incidents: { start: EpochMs; end: EpochMs }[];      // the player's track plus 'all'
}
export interface StreakEvaluation {
  written: { date: LocalDate; status: 'freeze' | 'protected' | 'missed' }[];   // new gap statuses
  freezesHeld: 0 | 1 | 2;
  current: number;
  best: number;
  repair: RepairOffer | null;
  repairBlockedUntil: EpochMs | null;
  paused: { streak: number; until: EpochMs } | null;  // set exactly when repair is set
  display: 'active' | 'paused' | 'broken';            // PRD §4.4.3 step 6: paused exactly when repair is set;
                                                      // broken once a Missed date can no longer be repaired
  breakTooLong: boolean;
  datelineUsed: boolean;                              // this evaluation applied the date-line rule
  datelineCandidate: { date: LocalDate; zone: TimeZone } | null;   // to store: new, kept, or null once decided
  notices: { kind: 'freeze_spent' | 'protected'; date: LocalDate }[];
}
export function evaluateStreak(input: StreakInput): StreakEvaluation;
export function applyFinish(state: StreakCounters, finish: {
  date: LocalDate;
  kind: 'on_time' | 'repair' | 'other';
  existing: 'freeze' | 'protected' | 'missed' | null;   // the gap status already stored for that date, if any
}): StreakCounters;
```

Steps (PRD §4.4.3 to §4.4.7): find `L`, the latest Played or Repaired date; walk the gap `L+1 .. today-1`, skipping `pending` dates, which stay undecided like today until their attempt finishes or its window closes; mark Protected where an incident overlaps the local day, or by the date-line rule (PRD §4.4.7): the first gap date becomes a candidate when the offset grew by 12 hours or more since the last finish, the zone name differs from the last finish's, and the rule hasn't fired in the last 30 days; the candidate stays undecided until the next request, which protects it if it keeps the new zone and otherwise leaves it an ordinary gap date (AC-STK-08); else spend a held freeze while the streak is alive; else mark Missed and stop spending freezes in that gap. The chain ending at `L` counts Played and Repaired dates across Freeze and Protected dates. The current streak is the chain count when no gap date is Missed, otherwise 0; today never lowers it. A Missed date `M` is repairable when it is the only Missed date in its span, a chain of at least 1 ended before it, the local time is before `M+3 00:00`, and no repair happened in the last 168 hours. While it is repairable, `paused` holds the pre-break chain count and the repair deadline, and every surface shows that instead of 0 (AC-RPR-09).

`applyFinish` grants a freeze on every 7th on-time finish or repair while fewer than 2 are held, and holds progress at 0 while 2 are held. An on-time finish for a date that already holds Freeze turns it into Played and refunds the freeze, up to the cap of 2; over Protected it becomes Played. Both can happen after a westward zone change or a gap evaluated while that date's attempt was still open, and both are fixture rows. A repair turns Missed into Repaired. A second repair inside the 168 hours, or a finish whose zone change didn't earn streak credit (§8.7), is `other` and changes nothing.

### 4.12 Other pure modules

| Module | Owner | Contents |
|---|---|---|
| `scoring/ranking.ts`, `percentile.ts`, `room.ts`, `blitz.ts`, `expected.ts` | ENG-2 | §4.6 |
| `text/metrics.ts` | CORE-0a | `sortKey(option)`: a signed year for BC and AD dates ("500 BC" is -500, "AD 79" is 79, "1912" is 1912), otherwise the numeric value with its unit ("1,250 km" is 1250 km), and an error when one set of options mixes forms or units; `wordCount(text)`: whitespace-separated tokens on NFC text; `charCount(text)`: NFC code points. The build, the content lint and the choice plugin all use these three, so a length or order rule means the same thing everywhere |
| `rooms/phases.ts` | ROM-1 | The room phase machine used by the mock server (§8.11), mirroring SQL |
| `text/moderation.ts` | MOD-1 | `foldText`, `normalizeForFilter` (case, diacritics, swaps such as 0 for o and @ for a, repeated letters, separators), `isBlocked(text, terms)`; the term list is a lazy chunk |
| `og/alt-text.ts` | ENG-2, then SHR-2 | `shareAltText` (§4.10) |
| `quiz-lint/` | EDT-1 | Blocking checks and L1 to L8 (PRD §3.9.4) |
| `quiz-import/` | EDT-2 | Format A blocks and RFC 4180 CSV with delimiter detection and BOM stripping (PRD §3.9.3); lazy-loaded |
| `achievements/` | MAS-1 | Table-driven rules for A01 to A30 over server stats and device stats |
| `mastery/` | MAS-1 | Tier rules over first attempts at distinct items (PRD §3.4.4) |
| `share/` | DLY-1 (text), ENG-2 (codes), SHR-1 (final) | §4.10, except the alt text |

### 4.13 Parity fixtures (`src/engine/fixtures/`)

One JSON table per rule set, written once from the PRD and replayed in two places: Vitest (against the engine) and SQL (against the RPCs, through tests that `scripts/sql/gen-parity.ts` generates into `supabase/tests/generated/`).

| Fixture | Rows | PRD source |
|---|---|---|
| `mystery-scoring.json` | Every row of PRD §4.1.7, plus invalid and duplicate guesses | §4.1 |
| `encore.json` | Every row of PRD §4.2.4 (2,500 and 625 against 1,250 both 100% off), plus parse failures, year cases, and the exact boundaries: 21 against 20 and 20 against 21 (exactly 5%, bullseye), 23 against 20 (exactly 15%, close), 1,045 against 1,000 ("5% off"), and 2 and 5 years | §4.2 |
| `ranking.json` | The 12 head-to-head pairings of AC-CHL-05, including an exact tie | §4.3.1 |
| `percentile.json` | Pools at 49 and 50, ties, a tied top, P = 100 and under 5, flagged and low-trust players, bands and the all-bands fallback (AC-DLY-20) | §4.3.4 |
| `streaks.json` | S1 to S13 of PRD §4.4.8; AC-RPR-01 to 04 and 09, AC-STK-08 and 09, AC-FRZ-01 to 05, AC-INC-03; plus our own rows: an evaluation run twice (one freeze spent), a gap date whose ranked attempt is still open across midnight, an on-time finish over a stored Freeze (refunded) and over Protected, a westward hop that can't reopen a served date, a hop with and without 20 hours since the previous call, a second date-line protection inside 30 days (Missed), and two repairable archive finishes back to back (one repair) | §4.4 |
| `timing.json` | Request counting for the latency allowance (begin_round and accepted actions count; refused, replayed and repeated calls don't), AC-DLY-23, and the honest-play thresholds of AC-DLY-25 (4.9 s and 5.0 s hidden per round; a clue-4 pick at 0.8 s; a typed solve at 1.2 s) | §4.3.3, §4.3.6 |
| `room-scoring.json` | Every row of PRD §4.5.5, grace boundaries at 400 and 600 ms (AC-ROM-08), voids | §4.5 |
| `moderation.json` | Listed terms under each normalization, 100 allowlist words (AC-LNT-03) | §3.9.4 |
| `share-codes.json` | Round trips, maximum values, malformed codes | §3.5 |

---

## 5. Content pipeline

### 5.1 Sources

Everything the product says lives under `content/` as JSON, one item per file, so many writer and checker agents can work at once without merge conflicts. CONTENT_GUIDE.md owns how items are written and checked; this section owns formats, validation and outputs.

#### 5.1.1 Source formats (`src/content/schema/`, CNT-1)

The zod source schemas adopt CONTENT_GUIDE §2.3 to §2.11, §9.2's claim records, §9.8's verification object and §11.3's batch register field for field, every field the guide marks + included. They are separate from the built types of §3.2: a source file holds the item, its claims and its checking trail, and the build keeps only what the product reads.

| Source | Fields (CONTENT_GUIDE section) | What the build does with them |
|---|---|---|
| Every item | `id`, `status`, `category`, `tags`, `region`, `volatility`, `reviewBy`, `seededDifficulty`, `predicted`, `explanation`, `learnMore`, `counterintuitive`, `claims`, `writerNotes`, `lintAllow`, `selfCheck`, `verification` (§2.3) | Strips `status`, `counterintuitive`, `claims`, `writerNotes`, `lintAllow`, `selfCheck` and `verification` from everything it ships |
| Multiple choice | `format: "mc"`, `stem`, `answer`, `wrong`, `order` (§2.4) | `answer` and `wrong` become `options` and `correct` |
| True or false | `format: "tf"`, `stem`, `answer` (boolean), `tfKind` (§2.5) | Strips `tfKind`; options are fixed as True, False |
| Comparison | `format: "comparison"`, `stem`, `a`, `b`, `answer`, `relation`, `measure`, `unit`, `values`, `exactDates`, `valueDisplay` (§2.6) | Strips `relation`, `measure`, `unit`, `values` and `exactDates` after checking them; ships `valueDisplay` as a pair; `order` is always shuffle |
| Mystery | `kind: "mystery"`, `answerType`, `answer`, `accepted`, `clues`, `distractors`, `slot`, `sourceLabels`, `likelyGuesses`, `rivals`, `giveawayTerms`, `seedSolveShares` (§2.7) | Strips `likelyGuesses`, `rivals`, `giveawayTerms` and `seedSolveShares` after checking them |
| Encore | `kind: "encore"`, `question`, `valueKind`, `answer`, `decimals`, `unit`, `unitShort`, `unitLabel`, `bands`, `sourceLabels`, `derivation`, and `predicted` as `{ pClose, pExact, spread, estimator }` (§2.8, §8.4) | Strips `derivation` after checking its arithmetic |
| Room-pack question | The §2.4 multiple-choice shape plus `kind: "choice"` and every §2.3 field, `predicted` included, because the pack template bands questions by `predicted.p` (§2.9, §8.5, §10.9) | `content:release` converts it to `SealedChoiceContent`; `predicted` stays out of SQL |
| Room pack | `id`, `title`, `theme`, `questions` (15 sources in play order) (§2.9) | Loads `room_packs` and `sealed_questions` |
| Answer list | `type`, `version`, `liveAt`, `provenance`, `entities`; each entity `id`, `name`, `display`, `aliases`, `popularity`, `qualifier`, `source`, `status`, `addedIn`, `wikidataId`, `replacedBy` (§2.10) | Ships the projection of §5.5; loads every entry, active or not, into SQL |
| Schedule | `track`, `dailies`; each daily `date`, `rounds`, `status`, `predictedPoints`, `dayCheck`, `spareOrder` (§2.11, §10.7) | `status` is advisory (the database alone decides what is frozen, §8.7); `predictedPoints` and `dayCheck` are checked and stripped; `spareOrder` loads into `dailies.spare_order`, where the release adds the rule codes each spare would break against that date's neighbours |
| Spare set | `spares/<id>.json`: `id` (`spare.<NN>`), `track` and the same round records, with no date (CONTENT_GUIDE §2.11) | Loads `daily_spares` on the file's track |
| List request | `list-requests/<id>.json` (sealed): `id` (`lr.<batch>.<NN>`), the name, the qualifier and the evidence (CONTENT_GUIDE §2.12) | Validated only; never shipped. Once the list builder fills it, the entity joins the next list version and drafts swap the `lr.` id for the entity's |
| Audit record | `audits/<id>.json` (sealed): CONTENT_GUIDE §9.10's record | Validated by CNT-2's schema; never shipped |
| Batch register | `content/batches.json`: each batch's `batchId`, `pool`, `category` (or `packId` or `answerType`), `writer`, `status`, `plan`, `accepted`, `cut`, `lastSequence`, `searchCaps`, `searchesUsed`, `highRiskClaims`, `externallyEvidenced`, `bandCounts`, `typeCounts`, `measuredEncores`, `approvals` and `incidents` (§11.3) | Validated only (CNT-2's schema); never shipped |
| Challenge pack | `challenge-packs/<id>.json`: `id`, `track`, `title`, `theme`, `rounds` (PRD §3.6.1; none before 30 Dailies close) | Loads `challenge_packs` |

**Status gates the rules.** A `draft` needs the right shape and nothing more. From `checking` on, `predicted` and `verification` must be present (CONTENT_GUIDE §2.3). Only `active` items must pass the acceptance rule of §5.2, and only `active` items build. `cut` and `retired` items stay in the repo, so ids are never reused, and never ship. Unknown keys still fail, so a guide-compliant file passes and a misspelt field doesn't.

**Practice item** (`content/practice/geography/p.geo.0142.json`, plaintext, ships to clients after the build). The `verification` object is CONTENT_GUIDE §9.8's; §12.15 of the guide shows one filled in, and the schema tests use it as a passing fixture.

```jsonc
{
  "id": "p.geo.0142",
  "status": "active",
  "format": "mc",
  "category": "geo",
  "tags": ["capitals", "oceania"],
  "region": "global",
  "volatility": "evergreen",
  "reviewBy": null,
  "seededDifficulty": 2,
  "counterintuitive": true,
  "stem": "Which city is the capital of Australia?",
  "answer": "Canberra",
  "wrong": ["Sydney", "Melbourne", "Perth"],
  "order": "shuffle",
  "explanation": "Sydney and Melbourne both wanted the title, so the constitution put the capital on land granted by New South Wales, at least 100 miles (about 160 km) from Sydney.",
  "learnMore": "Canberra",
  "predicted": { "p": 0.62, "spread": 0.41, "estimator": "v0" },
  "claims": [
    { "id": "c1", "role": "key", "risk": "high", "riskReason": "counterintuitive", "text": "Canberra is the capital of Australia." },
    { "id": "c2", "role": "distractor", "risk": "standard", "text": "Sydney, Melbourne and Perth are state capitals, not the national capital." },
    { "id": "c3", "role": "explanation", "risk": "high", "riskReason": "number", "text": "Section 125 of the Australian Constitution requires the seat of government to be on territory in New South Wales granted to the Commonwealth, at least 100 miles from Sydney." },
    { "id": "c4", "role": "explanation", "risk": "standard", "text": "Sydney and Melbourne were rivals to be the national capital." },
    { "id": "c5", "role": "explanation", "risk": "high", "riskReason": "number", "text": "100 miles is about 160 km." }
  ],
  "selfCheck": { "lint": true, "claims": true, "datasets": true, "rivalTest": true, "volatility": true, "regional": true,
                 "style": true, "myths": true, "mystery": true, "encore": true, "doubts": true },
  "writerNotes": "c1 checked in mledoze-countries (cca3=AUS, capital); as a capital key it also needs a Tier A or B web result. Sydney is the obvious wrong pick, so counterintuitive is true, which makes c1 high under C26. c5 is a pure conversion, so a calculation can confirm it.",
  "verification": {
    "checks": [ /* two CheckRecords (CONTENT_GUIDE §9.8): passes A and B, by different checkers */ ],
    "merge": { "mergedAt": "2026-11-02T10:55:00Z", "editor": "ed-g7h8i9", "claims": [ /* each claim id with addedBy */ ], "duplicates": [], "sentToFollowUp": [] },
    "followUps": [],
    "tiebreak": null,
    "editor": { "editor": "ed-g7h8i9", "decision": "accept", "reason": "Both checks pass.", "decidedAt": "2026-11-02T11:00:00Z" },
    "dailyChecks": [],
    "dedupe": { "checkedAt": "2026-11-02T10:10:00Z", "nearestId": null, "score": 0.0, "verdict": "unique" },
    "mythsScreen": { "checkedAt": "2026-11-02T10:10:00Z", "hits": [] },
    "lint": { "version": "1.1", "passed": true, "warnings": [] },
    "rechecks": [],
    "corrections": []
  }
}
```

**Mystery, Encore and room pack** (sealed) follow the table; a mystery's claims cover the key, each clue, each distractor's wrongness and the uniqueness proof.

**Schedule** (sealed, `content/sealed/schedule/2026-12.json` after decryption):

```json
{ "track": "main", "dailies": [
  { "date": "2026-12-01",
    "rounds": [
      { "type": "mystery", "difficulty": "easy",   "contentId": "m.geo.0101" },
      { "type": "mystery", "difficulty": "medium", "contentId": "m.film.0107" },
      { "type": "mystery", "difficulty": "hard",   "contentId": "m.sci.0103" },
      { "type": "encore",  "difficulty": null,     "contentId": "e.0101" }
    ],
    "status": "assembled",
    "predictedPoints": 8.3,
    "dayCheck": { "checker": "fc-q1w2e3", "checkedAt": "2026-11-20", "issues": [], "verdict": "pass" },
    "spareOrder": ["spare.07", "spare.02", "spare.15"] } ] }
```

Daily numbers are never authored; they come from `DAILY_EPOCH` in `src/config/shared.json`.

**Answer list** (`content/answer-lists/country.json`, plaintext). The source holds the full CONTENT_GUIDE §2.10 record; the build ships the projection of §5.5.

```json
{ "type": "country", "version": "2026-11-01", "liveAt": "2026-11-01",
  "provenance": [ { "source": "cldr-territories@7d2b9cb", "license": "Unicode-3.0", "retrievedAt": "2026-10-31" } ],
  "entities": [ { "id": "x.country.czechia", "name": "Czechia", "display": "Czechia",
                  "aliases": ["Czech Republic", "Česko", "Česká republika"], "popularity": 0,
                  "qualifier": { "iso_a2": "CZ" }, "source": "cldr-territories@7d2b9cb CZ",
                  "status": "active", "addedIn": "2026-11-01", "wikidataId": null, "replacedBy": null } ] }
```

**Room pack** (sealed): `{ "id": "around-the-world", "title": "...", "theme": "...", "questions": [ 15 room-pack question sources ] }`.

### 5.2 Validation (`src/content/schema/`, `scripts/content/lint.ts`, build-time only)

`npm run content:check` runs every level below; CNT-1 owns the schemas and cross-file rules, CNT-2 the lint. Word and character limits use `wordCount` and `charCount`, and ascending order uses `sortKey` (§4.12), the same functions the engine runs.

| Level | Rules |
|---|---|
| Shape (C01) | Every file parses against its zod source schema; unknown keys fail; ids match their file name and the pool's pattern (CONTENT_GUIDE §2.12). Reserved example ids (batch 00, room sequences 90 to 99) are refused anywhere under `content/` and allowed only in schema tests |
| Status | `draft`: shape only. `checking`: `predicted` and `verification` present. `active`: the acceptance rule below and a clean lint |
| Lint (C02 to C28) | CONTENT_GUIDE §2.13 in full, rule for rule, including the time-word list of C09, the US-spelling check of C10, the giveaway and prefix checks of C12 (with its suggestion probe through the engine's own `suggest()`), the clue-4 display check of C13, coverage and the 30-day freeze from `addedIn` in C14 (which also refuses an `lr.` list-request id from `checking` on), the separation guard and `exactDates` of C17, the ambiguous units of C21, C22 as an error for a sealed near-copy of a guide example, the myths screen of C25, the risk floor of C26, the capital rule of C27 and the option display parity of C28. Text rules read player-facing fields only. C03 (stem length) is an error. A warning passes only with an editor's `lintAllow` record |
| Item | Explanation 35 words or fewer; mc has 3 or 4 distinct options and never "all/none of the above"; tf and comparison have exactly 2; `order: ascending` only when every option yields a `sortKey` of one form; comparisons always shuffle; `volatility: slow` needs `reviewBy`; `fast` is refused |
| Mystery | Four clues of 140 characters or fewer; answer, accepted ids, distractors, rivals and likely guesses exist on the type's list, are active, aren't replaced and differ; at least 3 rivals, each ruled out by one of clues 1 to 3; `predicted.solveByClue` satisfies `0 <= s1 <= s2 <= s3 <= s4 <= 1`, as does `seedSolveShares` when present; the list holds 100 or more active entities, whatever the slot (PRD §3.18.4, CONTENT_GUIDE §2.10 rule 3); the answer's entry passed its 30-day freeze (`addedIn`) |
| Encore | `answer > 0`, and a quantity answer of 21 or more unless `bands` is overridden (C15); decimals 0 to 2; years are whole numbers from 1 to 9999; custom bands satisfy `bullseye < close` and have at most 4 decimal places (§4.6); `unitShort` and `unitLabel` present (empty strings for years); a `derivation`'s arithmetic reproduces `unrounded` |
| Comparison | `answer` wins under `relation` on `values`; the separation guard; `valueDisplay` names both sides |
| Acceptance (`active`, CONTENT_GUIDE §9.9) | Checks A and B by two different checkers, neither of them the writer or the editor, and every follow-up and tiebreak by someone who is none of the writer, the editor or the claim's author; both verdicts `pass`, or one `pass` with a passing tiebreak T standing in for the other check's `revise` or `fail` (CONTENT_GUIDE §9.7); every claim in the merged list confirmed in both checks, a follow-up standing in for the check that lacked it; every high-risk claim backed by dataset, web or calculation evidence in at least one confirming check; every claim naming a country's current capital backed by the dataset record and a Tier A or B web result (CONTENT_GUIDE §3.4); in sealed Daily pools, CONTENT_GUIDE §9.5.5: evidence on every clue, value and input claim, and two independent external sources for every clue that pins the answer, every number, date or "only" in a clue, and every encore value; for mysteries, both checks confirm uniqueness and neither found a rival fitting clues 1 to 3; no open blocker; lint passed; dedupe `unique` or `related_ok`; myths screen clean; the editor's decision `accept`, and for a `slow` item a `reviewBy` no more than 24 months after `editor.decidedAt`. Nothing here requires a stored passage: under memo §10 a standard claim may rest on checker knowledge |
| Pool | At most 10% true/false per category pack; at least 100 active items per category at launch (warning before); 40 kB gzipped per pack, 400 kB for all packs; 80 kB gzipped per shipped list, measured for every list on every build (§5.5); the near-duplicate check (C22) on normalized stems against the bank and CONTENT_GUIDE's own examples |
| Lists (CONTENT_GUIDE §2.10) | `liveAt` equals the UTC date of the commit that first published that version on the public branch, read from git history (so CI checks out with `fetch-depth: 0`, §5.7), and every entry the version adds carries `addedIn` equal to it (rule 5); every person, TV series and music artist entry carries a descriptor (§5.5); the display overrides of CONTENT_GUIDE §2.10 hold |
| Cross-pool (sealed) | No practice or room-pack item shares a fact with a Daily item: practice and room stems are compared with sealed clues, keys and encore questions (CONTENT_GUIDE §10.5, §10.9), locally and in the `content-sealed` job, under the output rule of §5.4 |
| Schedule (CONTENT_GUIDE §10.1 to §10.5) | One Daily per date with no gaps from the epoch to the last scheduled date; Mystery 1, 2 and 3 have slots 1, 2 and 3 and predicted points inside their assembly windows; three different categories and three different answer types per Daily; the encore's category differs from all three mysteries'; at least one counterintuitive item; no two items share a theme tag; `global` items only; the weekly spread rules of §10.4, whose category rules count the mystery slots only (the encore counts toward none of them): in any 7 consecutive Dailies no category in the mystery slots on two consecutive days, each category at most twice, Film & TV, Music or Food & Drink in at least 4, an answer type at most 4 times, a free tag at most twice and at most 2 year-kind encores, and every category in a mystery slot at least once in any 6 consecutive Dailies; no mystery or encore repeats within 365 days; no answer entity repeats as a mystery answer within 60 days; no answer from the last 7 days appears as a distractor; every composition has a share layout that fits 8 characters (§4.9); a runway warning below 30 Dailies; no sealed item scheduled on or after its `reviewBy`; a Daily is ready to freeze only when every item on it has a passing pass D for that date against the list versions that ship then, and a spare set is listed only when every item has a passing D with `forDate` null (CONTENT_GUIDE §9.9, rule 7) |
| Packs | Room packs hold exactly 15 questions: mc with exactly 3 wrong options, stems of 100 characters or fewer, options of 30 or fewer, and the 6/6/3 template by `predicted.p` (CONTENT_GUIDE §10.9) |

### 5.3 Build outputs (`npm run content:build`, `scripts/content/build.ts`)

| Output | Path | Notes |
|---|---|---|
| Practice packs | `public/content/packs/<category-slug>.<hash8>.json` | `{ category, version, items: ChoiceItem[] }`, active items only, every source-only field of §5.1.1 stripped |
| Answer lists | `public/content/lists/<type>.<hash8>.json` | The client projection of §5.5: active entries only, as compact tuples |
| Manifest | `src/content/generated/manifest.ts` | Hashed URLs for every pack and list, item counts, content version. Imported by loaders and the service worker config |
| Categories, names | `src/content/generated/categories.ts`, `names.ts` | Static modules |
| Category pages | `src/content/generated/category-pages.ts` | Intro copy and one sample item per category (F-CAT) |
| Moderation terms | `src/content/generated/moderation.ts` | Loaded lazily by `text/moderation.ts` |
| Mock fixtures | `src/backend/mock/fixtures.generated.ts` | From `content/fixtures/` only, never from `content/sealed/` |
| Non-secret SQL loads | `supabase/seed/answer-entities.sql`, `practice-items.sql`, `config.sql`, `moderation.sql`, `e2e-track.sql` | Idempotent upserts, committed. `answer-entities.sql` carries every entry ever published, with `display`, `option_label` and `active`; `practice-items.sql` carries each item's id, category, option count and bitset position (§8.3) |

Outputs are deterministic and committed. CI rebuilds them into a temporary directory and fails on any difference, so a content change without a rebuild never merges. `src/config/shared.json` holds the values both sides must agree on, named as the PRD names them: `dailyEpoch`, `crowdMinN: 50`, `percentileMinN: 50`, `encoreBands`, `latencyAllowanceMs: 400`, `roundCapMs: 900000`, `optionsFromClue: 4`, `honestPlayHiddenMs: 5000`, `tooFastMs: 1500`, `dailyMinutes: 4` and `blitzSeconds: 60`. The build turns it into `supabase/seed/config.sql` (`crowd_min_n`, `percentile_min_n` and so on). Lint rules C12 and C13 read `optionsFromClue` from the same file, so changing it re-lints every sealed item, and an item that now fails is rewritten or swapped out of its Daily before its date (CONTENT_GUIDE §2.13).

### 5.4 Sealed content: encrypted at rest, loaded through MCP

- **Format.** Each sealed file is `content/sealed/<kind>/<id>.json.enc` holding `{ "v": 1, "alg": "A256GCM", "kid": "k1", "iv": "<base64>", "data": "<base64>", "tag": "<base64>" }`. The IV is the first 12 bytes of `HMAC-SHA256(k_iv, plaintext)`, so unchanged plaintext gives unchanged ciphertext and clean diffs; reusing an IV only for identical messages is safe.
- **Keys.** Two 32-byte keys derived with HKDF from one master key, read from `QZ_CONTENT_KEY` (base64) or from `~/.config/quiz-web-app/content.key`, never from the repo. CNT-0 creates the key in Wave 1 (`npm run content:keygen`), before any sealed writing starts.
- **Escrow.** Right after creating it, the orchestrator escrows the key through MCP: `insert into private.key_escrow (kid, key) values ('k1', decode('<base64>', 'base64'))`. The table has RLS on, a deny-all policy and no grants, so only `postgres` can read it, and no API role ever can. After a release the database holds every sealed plaintext anyway, so the escrow exposes nothing new; what it adds is a copy that survives the sandbox, because the Free plan has no downloadable backups.
- **Recovery** (also in `content/sealed/README.md`): through MCP `execute_sql`, run `select encode(key, 'base64') from private.key_escrow where kid = 'k1'`, write the result to `~/.config/quiz-web-app/content.key` with mode 600, and check it with `npm run content:unseal -- --verify`, which decrypts every envelope in memory and prints only a count. The launch report still asks the owner to keep the key in a password manager and to add it as the `QZ_CONTENT_KEY` GitHub secret.
- **Workflow.** `npm run content:unseal` decrypts into `content/.sealed-plain/` (git-ignored since CNT-0). Writers and checkers work there. `npm run content:seal` encrypts every changed file back into `content/sealed/`. A check (`scripts/checks/secret-scan.mjs`, from CNT-0, run by `npm run check` and in CI) fails if any file under `content/sealed/` is not an envelope or if `content/.sealed-plain/` is tracked.
- **The output rule.** Every command that decrypts content (`content:check --sealed`, `check:lazy --sealed`, `content:release` and `content:dedupe`) reports through one redacting reporter, `scripts/content/lib/report.ts`. A finding prints as item id, rule code and field path (`m.film.0107 C12 clues[1]`), and a run ends with counts. No clue text, key, entity name, alias, number or diff ever reaches stdout or stderr (`check:lazy --sealed` reports file, item id and field, never text): the reporter catches zod issues and assertion errors and re-emits them in the same three-part form. The `content-sealed` job runs in a public repository's logs, where one message such as "clue 2 contains the alias 'Constantinople'" would publish a Daily answer. A unit test (CNT-1) runs the sealed validator over a fixture with planted failures (a clue containing an alias, a near-duplicate, a failing refinement, a bad encore unit) and asserts that no fixture string, alias or numeric answer appears in either stream, matching numbers by value and names as whole tokens.
- **Release.** `npm run content:release -- --version <n>` decrypts in memory, validates, and writes `supabase/.generated/content-release-<n>.sql` (git-ignored) in a fixed order: content rows (`mysteries`, `encores`, `sealed_questions`, `room_packs`, `challenge_packs`), then schedule rows (`dailies`, `daily_spares`), then a call to `private.verify_release(p_version)`, then the `private.content_releases` row last. Answer entities load earlier, from the committed seed. The orchestrator applies the file with MCP `execute_sql` in chunks of 400 kB or less, one transaction per chunk, in that order. `verify_release` raises unless every `contentId` in every scheduled Daily and spare on the release's track exists and is active, and every answer, accepted and distractor id exists in `private.answer_entities` and is active. Because schedule rows load after the content they name, a failed chunk never leaves a Daily pointing at a missing mystery, and a failed check leaves the release unrecorded, to be re-run. Scheduled Dailies already frozen (§8.7) are refused by the loader unless `--allow-frozen` is passed for a correction.
- **Never in a bundle.** Clients never receive sealed item ids (`RoundMeta` has none). After every build, `scripts/checks/lazy-markers.mjs` scans `.next/static`, `.next/server/app` (prerendered HTML and RSC payloads) and `public/` for sealed ids (`(?<!fx\.)\b(m\.[a-z]+\.\d{4}|e\.\d{4}|r\.[a-z0-9]+(?:-[a-z0-9]+)*\.\d{2})\b`, a room pack's name taking digits as the content schema's room ids do) and, when the key is present, for any clue text. Either finding fails CI.
- **Upgrade path.** If the owner makes the repository private, `QZ_SEALED_PLAINTEXT=1` lets the scripts read plaintext files and the encryption steps become no-ops. Nothing else changes.

### 5.5 Answer lists

Lists come from the pinned open datasets of CONTENT_GUIDE §9.5.1 (CLDR, GeoNames, MoMA and Tate; ODbL and BY-SA data only for checking single facts, never copied into a shipped list) and from checked list batches, imported by small per-source scripts in `scripts/content/lists/` that record provenance. Wikidata supplies ids and sitelink counts only through the enrichment workflow (ENR-1), as a candidate source, never as evidence. The content team reviews aliases (both spellings where English varies, short forms, transliterations). Lists are global and never filtered per Daily (PRD §3.18.4).

- **The client projection.** Each shipped list holds only `[id, display, keys, popularity]` per active entry, where `keys` is `normalizeName` of the name and then of each alias, computed by the build with the engine's own function, so the device and the build normalize identically. Retired entries and entries marked `replacedBy` are left out, so they are never suggested. The content-team fields (`qualifier`, `source`, `status`, `addedIn`, `wikidataId`, `replacedBy`) never ship. A synthetic person list at its 3,000-entry target gzips to 64 KB in this form, against 88 KB for the old shape and 110 KB with the guide's fields (§1.5).
- **The size check.** `content:check` measures every shipped list on every build, in CI too, and fails one over 80 KB gzipped. If `person` passes 80 KB before reaching its target, the content lead lowers that target in CONTENT_GUIDE §2.10, since the PRD budget is per list.
- **SQL keeps everything.** `supabase/seed/answer-entities.sql` loads `(answer_type, entity_id, display, option_label, active)` for every entry ever published. A retired entry stays so an old guess still resolves and displays, while `round_action` refuses an inactive id with `invalid_entity` (§8.8), and `content:check` forbids retired or replaced ids in any scheduled mystery's answer, accepted ids, distractors, rivals or likely guesses (C14). A client holding an older cached list that meets `invalid_entity` reloads the list.
- **Option labels.** `option_label` is "Name (descriptor)" for types that carry a descriptor (person, TV series, music artist) and equals `display` for types whose display always shows its qualifier (film, book, city, landmark). When any of a mystery's four options would show a bracket, the server labels all four with `option_label`, so the key is never the only option with a qualifier (CONTENT_GUIDE §2.10 rule 6; PRD §3.1.4). The content check requires a descriptor on every person, TV series and music artist entry.
- **Enrichment.** ENR-1's GitHub Actions workflow queries Wikidata from a runner, which can reach it, writes candidates and sitelink counts to `content/answer-lists/_wikidata/` and opens a pull request. The list builder accepts a match only under CONTENT_GUIDE §9.5.1's rule. Until its first pull request merges, `popularity` is 0 and suggestion ties fall to `display` order.

### 5.6 Fixtures (`content/fixtures/`)

Fake but well-formed content, prefixed `fx.`: 40 practice items across four categories (including true/false and comparisons), six mysteries and three encores cycled into a Daily for every date, the compositions `[mc ×9, encore]` and `[mc ×5, mystery, encore]` on two fixed dates for AC-DLY-09 (their choice rounds use `fx.r.dly.<NN>` ids), one 15-question room pack, and small answer lists (countries with aliases, about 60 films, the 118 elements, and enough people and music artists to exercise descriptors). CORE-0a ships every fixture file in Wave 0, so the three Wave 1 slices share one set of entity ids and none of them writes content. From CNT-1 on, fixtures follow the source formats of §5.1.1. The mock backend, unit tests, the greybox and the real database's `e2e` track all use them.

### 5.7 How CI validates content

| Step | Where | What |
|---|---|---|
| `npm run content:check` | `verify` job, checked out with full history (`fetch-depth: 0`) | Schemas, lint and cross-file rules for plaintext content and fixtures; the lists' `liveAt` against git history (§5.2); per-pack and per-list size checks; generated-output drift check |
| `npm run content:check -- --sealed` | `content-sealed` job, only when the `QZ_CONTENT_KEY` secret exists | Decrypts in memory, validates sealed items, the schedule and the latest audit record's counts (AC-CNT-05, CONTENT_GUIDE §9.10), and runs the cross-pool dedupe, all through the redacting reporter of §5.4; prints "Sealed content validation: not run (QZ_CONTENT_KEY is not set)" otherwise |
| `scripts/checks/secret-scan.mjs` | `verify` job | Envelope-only sealed directory, no key files, no plaintext workspace |
| Bundle scan (`npm run check:lazy`) | `verify` job, after `next build`; the `content-sealed` job runs it again with `--sealed` (next row) | No sealed ids in `.next/static`, `.next/server/app` or `public/` |
| `npm run build` then `npm run check:lazy -- --sealed` | `content-sealed` job; the build step never sees the key, the scan step alone gets `QZ_CONTENT_KEY` | Decrypts in memory and scans the keyless build for sealed texts, and for answers (Encore numbers, Mystery keys, room answers) beside their item text; prints counts plus file, item id and field only |

### 5.8 Commands

| Command | Does |
|---|---|
| `npm run content:build` | Validate, then write every output in §5.3 |
| `npm run content:check` | Validate and drift-check without writing (`--sealed` adds the sealed files) |
| `npm run content:keygen` | Create the content key once (CNT-0); refuses if one exists |
| `npm run content:unseal` / `content:seal` | Decrypt to, or encrypt from, `content/.sealed-plain/` (`--verify` decrypts in memory and prints a count) |
| `npm run content:release -- --version <n>` | Generate the sealed release SQL |
| `npm run content:dedupe` | The cross-pool near-duplicate check, through the redacting reporter |
| `npm run content:packets -- --batch <id>` | Build the blind, hashed checker and estimator packets for a batch, with the staged clue reveal (CNT-2) |
| `npm run content:estimate -- --batch <id>` | Run estimator v0 and write `predicted` (CNT-2) |
| `npm run content:audit -- --seed <n>` | Draw a seeded audit sample with planted items and validate its record (CNT-2) |
| `npm run content:lists -- --type <type>` | Re-import one answer list from its recorded sources |
| `npm run content:schedule -- --track <track>` | Assemble or re-assemble unfrozen Dailies and spares behind the freeze (CNT-3) |
| `npm run content:weekly -- --track <track> [--dry-run]` | The weekly content run's planning step: work list, 7 new Dailies, owner queue (CNT-3) |

---

## 6. Client persistence

### 6.1 The storage layer (`src/platform/storage/`)

- `kv.ts` wraps `localStorage` with try/catch on every call, JSON decoding through per-key decoders, a quota-error path that drops the least valuable caches first (only keys ranked below the key being written, so a cache write can never cost practice history, the outbox or a draft; a quarantine copy never evicts anything and is skipped when it doesn't fit), and an in-memory fallback when storage is missing (some private windows, unit tests). Every key starts with `qz:`.
- **Device namespaces for tests.** In mock builds only, a page that sets `window.__QZ_DEVICE__ = 'phone3'` before load gets keys prefixed `qz:d:phone3:`. That is how one browser context holds several "devices" for room tests (§11.4). The mock database (`qz-mock:*` keys) is never namespaced, so those devices share one server. Supabase builds ignore the flag.
- `schema.ts` declares `STORAGE_VERSION`, every key, its decoder and its owner. `migrations.ts` holds ordered, idempotent migrations `{ from, to, run(kv) }`. They run once at boot, before any feature reads storage, inside a `navigator.locks` request so two tabs never migrate at once.
- **Failure rules.** A key that fails to decode is moved to `qz:quarantine:<key>` and reset; the rest of storage stays. Identity is never deleted by a migration. Each migration has a unit test that feeds it a snapshot from the previous version.

### 6.2 Keys

| Key | Contents | Owner | Cap | Server copy |
|---|---|---|---|---|
| `qz:meta` | `{ storageVersion, createdAt, migratedAt }` | CORE-0a | tiny | none |
| `qz:identity` | `LocalIdentity` | IDN-1 | tiny | hash of the secret; the backup cookie holds the plaintext |
| `qz:profile` | Cached `Profile` (friendly name, nickname, age band) | IDN-1 | tiny | truth is the server |
| `qz:sync` | The sync code as shown at `/me/sync` | IDN-2 | tiny | hash only |
| `qz:settings` | `Settings` (below) | CORE-0a store, SET-1 UI | tiny | none (the age band lives in the profile) |
| `qz:practice` | Seen index (`ItemId` to day number), best scores per mode and length, monthly-pack progress (no ability estimate: adaptive Mixed is Later, §4.8) | PRA-2, BLZ-1, REV-1 | about 40 kB at 1,500 items | none (lost with storage; accepted in v1) |
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
| `qz:seats:<roomId>` | Seat token for one room (Beta), minted on the device before the first join, so a retried join finds the same seat | ROM-3 | pruned after 24 h | hash only |
| `qz:host:<roomId>` | Host token for a room this device created (Beta), minted before `create_room` | ROM-2 | pruned after 24 h | hash only |
| `qz:under13` | `{ since: EpochMs; pendingDelete?: { playerId; secret } }`: the device-side flag left after an Under 13 answer (§9.7) | SET-1 | tiny | the secret only until `delete_player` succeeds |

Session storage: `qz:session` (analytics session id for the tab), `qz:practice-intent` (the next practice run's request), `qz:practice-run` (the id of the run this tab is playing, so a reload resumes that run and not another tab's), `qz:server-clock` (offset samples), `qz:share-origin` (the Daily number and share code of a share landing whose Play was tapped, for the stop screen's comparison card, PRD §3.1.6 item 1), `qz:restore-notice` (the note Today shows once after a restore, §9.6). `SESSION_KEYS` in the storage schema lists them, and a schema test holds every `qz:` name in `src/` to the schema, so /privacy describes each.

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

Reports, hearts, analytics events and practice answers may queue offline (PRD §3.0.2); nothing else does. Each entry carries a client-generated UUID that the server keeps under a unique constraint, so a resend is harmless. The outbox flushes on `online`, on `visibilitychange` to hidden (with `fetch` `keepalive` for analytics), every 10 s while it holds analytics events, and at 20 events. Entries that fail with `invalid_input` are dropped and counted in `client_error`; `rate_limited` waits for `retryAfterMs`. An `unavailable` answer from a server that is shedding load (§8.1) drops queued analytics events and keeps reports, hearts and practice answers for a later flush, after the `retryAfterMs` it carries.

### 6.4 Several tabs

`src/platform/broadcast.ts` opens one `BroadcastChannel('qz')` and also listens to `storage` events. Messages: `identity_changed`, `settings_changed`, `daily_finished`, `streak_changed`, `outbox_flushed`. A tab that receives `daily_finished` refetches its home card. A stale tab that submits a Daily action gets `stale` from the server and re-renders the current state (PRD §3.1.3).

### 6.5 What lives where

| Data | Source of truth | Device | Survives cleared storage? |
|---|---|---|---|
| Identity | Server (hash) | `qz:identity` + backup cookie | Yes, through the cookie, a sync code or a claim |
| Daily attempts, streaks, freezes, repairs, protected dates | Server | Cache only | Yes |
| Group memberships, boards, challenges | Server | Cache only | Yes |
| Achievements unlocked | Server (`record_achievements`) | Progress computed locally | Unlocks yes, partial progress no |
| Practice history, seen index, bests, review queue, mastery counters | Device | `qz:practice`, `qz:review`, `qz:mastery` | No (accepted for v1, PRD §3.3.7) |
| Practice first attempts for calibration | Server aggregate (`item_stats`, folded at upload, §8.12) | Outbox until sent | Sent ones yes |
| Settings | Device (age band also on the server) | `qz:settings` | Age band only |
| Offer-card history | Device | `qz:offers` | No (a card may show again) |
| Editor drafts | Device until saved, then server | `qz:drafts:*` | Saved quizzes yes |
| Room seat | Server (hash) | `qz:seats:<roomId>` | No (the phone joins as a new player) |
| Room host token | Server (hash) | `qz:host:<roomId>` | No (the host screen can't control the room again) |

---

## 7. The backend interface (`src/backend`)

### 7.1 Principles

- **One interface, three implementations.** `supabase`, `mock` and `off`, picked by `NEXT_PUBLIC_BACKEND_MODE` at build time (constraint 2). Features import only `@/backend` (`getBackend()` and the types).
- **Results, not exceptions.** Every method resolves to `Result<T>` (§3.11). Expected failures never throw. A thrown error is a bug and is reported as `client_error`.
- **Identity is implicit.** The backend is built with an `IdentityProvider` and adds the player id and secret to every call that needs them. Feature code never handles secrets.
- **Callers own idempotency and retries.** Writes take an `IdempotencyKey` from the caller; controllers decide when to retry, and always with the same key. Every method that creates a record takes one (`clientId`), or a client-minted token that doubles as one (seat, host and claim tokens), so a retry after the 8 s timeout returns the first result instead of a second challenge, Group or room. The backend itself never retries a write.
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
  createClaim(token: ClaimToken): R<{ expiresAt: EpochMs }>;   // device-minted; a retry with the same token returns the same claim
  peekClaim(token: ClaimToken): R<ClaimPreview>;
  redeemClaim(token: ClaimToken, newSecret: Secret): R<RestoredProfile & { playerId: PlayerId }>;
  exportData(): R<ServerDataExport>;
  deletePlayer(): R<void>;
}

export interface SealedRunApi {
  /** A new attempt comes back with round 0 already open, so its first clue or stem arrives with the start (PRD §4.1.4). */
  start(source: SealedSource, ctx: { tz: TimeZone; browser: BrowserContextInfo; appVersion: string }): R<AttemptSnapshot>;
  get(attemptId: AttemptId): R<AttemptSnapshot>;
  /** converted: true once the window's close has turned the attempt into an unranked archive run (§8.7). */
  beginRound(attemptId: AttemptId, index: number):
    R<{ start: RoundStart; finished: FinishSummary | null; converted: boolean; serverTime: EpochMs }>;   // a voided round arrives withdrawn
  act(input: {
    attemptId: AttemptId;
    index: number;
    step: number;                  // the clue number (mystery) or 1; a mismatch returns 'stale'
    intent: RoundIntent;
    clientActiveMs: number;
    hiddenMs: number;              // honest-play report: hidden or blurred time in this round so far
    key: IdempotencyKey;
  }): R<{ verdict: RoundVerdict; finished: FinishSummary | null; converted: boolean; serverTime: EpochMs }>;
  finish(attemptId: AttemptId): R<FinishSummary>;   // idempotent; the last act() already finishes
}

export interface DailyApi {
  today(tz: TimeZone): R<DailyTodayCard>;                 // callable before any identity exists
  results(attemptId: AttemptId): R<DailyResults>;
  numbers(attemptId: AttemptId): R<{                      // the caller's finished attempts only; refetched on every visit
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
  create(attemptId: AttemptId, clientId: IdempotencyKey): R<{ code: ChallengeCode; expiresAt: EpochMs }>;
  landing(code: ChallengeCode, tz: TimeZone): R<ChallengeLanding>;   // callable without identity
  headToHead(code: ChallengeCode): R<HeadToHead>;
  rematch(code: ChallengeCode, tz: TimeZone, clientId: IdempotencyKey): R<{ code: ChallengeCode }>;
  shelf(): R<ChallengeShelf>;
  participants(code: ChallengeCode): R<ChallengeParticipants>;      // the challenger only
}

export interface GroupApi {
  create(input: { name: string; nickname: NicknameInput; clientId: IdempotencyKey }):
    R<{ group: GroupSummary; invite: InviteCode }>;
  preview(invite: InviteCode): R<GroupInvitePreview>;               // callable without identity
  join(invite: InviteCode, nickname: NicknameInput): R<GroupSummary>;
  /** deleted: Groups the caller belonged to that their admin deleted, shown once and then acked (AC-GRP-13). */
  list(): R<{ groups: GroupSummary[]; deleted: { noticeId: NoticeId; name: string }[] }>;
  board(groupId: GroupId, tz: TimeZone): R<GroupBoard>;
  todayRanks(tz: TimeZone): R<GroupTodayRank[]>;                // the stop screen's row and the home card's line
  invite(groupId: GroupId): R<{ invite: InviteCode }>;
  setNickname(groupId: GroupId, nickname: NicknameInput): R<GroupSummary>;
  admin(groupId: GroupId, action: GroupAdminAction): R<{ group: GroupSummary | null; invite: InviteCode | null }>;   // both null after 'delete'
  leave(groupId: GroupId): R<void>;
}

export interface RoomApi {
  /** hostToken is minted on the device and doubles as the idempotency key with clientId. */
  create(input: { source: RoomSource; settings: RoomSettings; hostToken: HostToken; clientId: IdempotencyKey }):
    R<{ roomId: RoomId; code: RoomCode }>;
  /** seatToken is minted on the device before the first join and stored, so a retry finds the same seat. */
  join(input: { code: RoomCode; method: 'qr' | 'code'; seatToken: SeatToken }):
    R<{ roomId: RoomId; seatId: SeatId; name: string; rejoined: boolean; scoresFrom: number }>;
  shuffleName(roomId: RoomId, seat: SeatToken): R<{ name: string }>;
  setName(roomId: RoomId, seat: SeatToken, name: string, ageBand?: AgeBand): R<{ name: string }>;   // typed names only; 18+ from the profile or the seat
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
  save(draft: QuizDraft): R<UserQuiz>;                     // a first save sends draft.localId (a UUID) as its key;
                                                           // 'conflict' carries the server copy in error.current
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
  /** option is in source order (the ChoiceItem.correct index space). Once the identity is registered the
   *  backend adds its credential, and only those answers count toward report weight (§8.12). */
  uploadAnswers(batch: {
    itemId: ItemId; correct: boolean; option: number; timeBucket: '0-5' | '5-15' | '15-30' | '30+';
    mode: RunMode; selfPicked: boolean;   // a run in a category the player chose: counts half (CONTENT_GUIDE §8.6)
    clientId: IdempotencyKey;
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
| `unavailable` | no | `off` mode; or, with `retryAfterMs` set, a write the server is shedding near its storage limit (§8.1) | "This feature isn't available on this server.", or the feature's paused copy while shedding (PRD §8.5; quiz saves: "Saving is paused for a while. Your quiz is safe on this device."; new rooms: "Hosting is paused for a while. Try again later.") |
| `feature_disabled` | no | A Beta flag is off server-side | Entry points stay hidden |
| `auth_failed` | no | Wrong or pruned credential | Try the cookie restore once; then a new identity, explained in plain words |
| `rate_limited` | after `retryAfterMs` | SQL caps or HTTP 429 from the pre-request check. Always carries `retryAfterMs`, from the end of the window that refused it, and `limitScope`; the refusal consumed nothing | Silent retries with the same key (PRD §3.0.2): `Retry-After`, else 1, 2, 4 and 8 s with jitter; plain copy and Retry after 5 s (registration says "on your network" only for scope `ip`, AC-IDN-04); the action's own copy at once when the wait passes 60 s; a feature's fallback only after 30 s |
| `limit_reached` | no | Quotas: 10 Groups and 50 quizzes per player (the 20 challenges a day are a rate limit, `rate_limited`, §8.6) | The PRD's copy |
| `invalid_input` | no | Validation failed | Inline message |
| `invalid_entity` | no | A guess that is not on the list, or an entry retired since the device cached it | Reload the answer list once, then treat as `stale` |
| `already_guessed` | no | A repeat guess | "Already guessed" on the chip; nothing consumed |
| `blocked_text` | no | The slur filter matched | "Please choose different wording." or "Please choose a different name." |
| `age_required` | no | The action needs the age band | Opens the age-band question |
| `age_forbidden` | no | The band does not allow the action | The PRD's copy for that band |
| `not_found` | no | Unknown code, attempt or group | The invalid-link copy |
| `stale` | no | Step mismatch or a stale tab | Re-render from `error.current` |
| `conflict` | no | Version mismatch (quiz save, host action), or an idempotency key reused for a different call | The conflict copy |
| `already_played` | no | One attempt per player per date | Show that result |
| `expired` | no | Challenge after 30 days; claim after 10 minutes | The expired copy |
| `not_open` | no | A challenged date after the reader's local date | The unlock countdown |
| `full` | no | Group 50, challenge 50, a room's 20 seats, the project's live-connection cap for rooms | The full copy |
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
  setShed(on: boolean): void;                      // the storage shed switch of §8.1
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
| `client.ts` | Lazily imports `@supabase/supabase-js` and calls `createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { worker: true } })` once per tab: the app's only Supabase client. SQL-1 turns `src/lib/supabase/browser.ts` into a re-export of it, deletes the foundation's cookie-writing `server.ts`, and drops `@supabase/ssr`, so one tab holds one client and one GoTrue instance, and no auth storage or cookie can be written (AC-CKE-04). `worker: true` keeps room heartbeats alive in background tabs; its worker comes from a Blob URL [verified in `realtime-js` 2.118.0], so the CSP needs `worker-src 'self' blob:` |
| `rpc.ts` | `call<T>(fn, args, decode, opts)`: adds `p_player` and `p_secret` for authenticated RPCs, aborts after 8 s, maps the envelope and transport errors to `BackendError`, feeds `server_time` to the server clock, reports failures to the health monitor (§10.6), and calls `identity.markRegistered()` after the first successful write |
| `decode.ts` | Small hand-written decoders (no zod in the browser) that check required fields and map snake_case to camelCase. A decode failure becomes `internal` plus a `client_error` event |
| `realtime.ts` | `subscribeRoom(roomId, audience, handlers)`: one private channel per room, `room:<id>` for players or `roomhost:<id>` for the host, `{ config: { private: true, broadcast: { self: false } } }`, listening to broadcast event `hint`. A select-only policy lets clients read those topics and nothing lets them publish (§8.11). Status `SUBSCRIBED` maps to `live`; `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED` and a `tenant_events` disconnect map to `down`, which starts 3 s polling. If the rooms gate shows private channels misbehaving, a build flag falls back to public topics with the same hints |
| `<area>.ts` | One adapter per `GameBackend` area, written by the SQL ticket that writes the area's RPCs |

**Transport mapping.** A rejected `fetch` while `navigator.onLine` is false becomes `offline`; while it is true, `unreachable`. HTTP 429 (from the pre-request check, §8.6) becomes `rate_limited` with `retryAfterMs` from its `Retry-After` header and `limitScope: 'ip'`. HTTP 5xx becomes `unreachable`. A 200 response with `{ ok: false, code }` becomes that code. Anything else is `internal`.

**Contract tests.** `src/backend/contract/<area>.contract.ts` defines one behavioral suite per area against the `GameBackend` interface. `*.mock.test.ts` runs it against the mock in every `npm test`. `*.real.test.ts` runs the same suite in Node against the real project only when `QZ_REAL_BACKEND=1`, which the `backend-contract` GitHub workflow sets (SQL-1 creates it). Each suite uses test identities (§8.17). Each mock area exports `MOCK_CAPABILITIES`, the methods it really implements, and the mock run skips the rest, so a SQL ticket can land its suite before the feature ticket that builds the matching mock behavior. These suites are how the mock and SQL stay honest with each other.

### 7.6 The off implementation (`src/backend/off/`)

Every method resolves `{ ok: false, error: { code: 'unavailable', retryable: false, retryAfterMs: null, refId: null } }`; `rooms.subscribe` returns a no-op. Practice, settings and legal pages work fully. Every online feature shows "This feature isn't available on this server." (PRD §3.0.2).

---

## 8. Supabase design

### 8.1 Free-plan limits that shape the design

| Limit | Value | What we do about it |
|---|---|---|
| Database size | Read-only past 500 MB ([Supabase](https://supabase.com/docs/guides/platform/database-size)) | Short raw retention and compact rows (below); alerts at 250 MB and 300 MB, and a shed switch at about 380 MB that keeps the Daily playing (below) |
| Egress | 5 GB uncached plus 5 GB cached a month ([Supabase](https://supabase.com/docs/guides/storage/serving/bandwidth), via [report 08](./research/08-technical-best-practices.md)) | Compact JSON payloads, no repeated explanations, practice off Supabase entirely. Postgres can't see egress, so we estimate it from a sampled response-size counter and alert at 3 GB estimated |
| Realtime | 200 concurrent connections, 100 messages a second, 100 joins a second, 2M messages a month; a broadcast bills one message plus one per receiver, and a project over the per-second rate has its connections disconnected (`tenant_events`) ([limits](https://supabase.com/docs/guides/realtime/limits), [billing](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)) | Only rooms use Realtime: 20 players a room, hints only, on private channels; answer counts coalesced to one host hint a second; a project-wide cap of 150 live room connections; client refetches capped at two a second; polling fallback (§8.11). Message counts and peak connections are estimated from server counters |
| Pausing | After about a week of low activity ([Supabase](https://supabase.com/docs/guides/platform/free-project-pausing)) | A daily GitHub Actions keepalive and a 30-minute probe (CI-1) |
| Backups | None downloadable on Free ([Supabase](https://supabase.com/docs/guides/platform/backups)) | Everything rebuildable from the repo plus the content key, which is escrowed in the database (§5.4, memo §10); the Pro upgrade path in the launch report |
| Compute | Nano: shared CPU, 0.5 GB RAM, 60 direct connections, 200 pooler clients ([Supabase](https://supabase.com/docs/guides/platform/compute-and-disk)) | SHA-256 instead of bcrypt; short RPCs; heavy work in cron jobs |
| Statement timeout | `anon` 3 s [verified] ([Supabase](https://supabase.com/docs/guides/database/postgres/timeouts)) | Every RPC is index-driven and does bounded work; percentiles use one indexed rank key (§8.9); deleting a player is index lookups only |
| `pg_cron` | 8 concurrent jobs, each under 10 minutes ([Supabase](https://supabase.com/docs/guides/cron)) | Seven jobs, all short (§8.15); `cron.job_run_details` pruned to 7 days |
| Pre-request hook | Data API only; GET and HEAD run read-only ([Supabase](https://supabase.com/docs/guides/api/securing-your-api)) | Every RPC is a POST; the hook is a per-IP backstop (§8.6) |

**Storage, counted table by table.** Every table that grows is listed, with its indexes. The figures are measured on local Postgres 16 with 20,000 synthetic rows per table (§1.5). "A Daily player" is one player finishing one Daily on one day.

| Table | Bytes with indexes | Per | Kept | Working set per daily player |
|---|---|---|---|---|
| `attempts`, full | about 950 (1,801 with the old keyed JSONB) | Daily played | 30 days, then compacted | 18.3 kB (the extra over the compact row, for 30 days) |
| `attempts`, compacted | 341 | Daily played | 400 days | grows 10.2 kB a month |
| `round_actions` | 163 | accepted action (about 8 a Daily) | 48 hours after the attempt ends | 3.3 kB |
| `daily_results` | 203 | ranked finish | 30 days after the window closes, then folded into `daily_pools` | 6.4 kB |
| `player_days` | 136 | Daily played | while the player exists | grows 4.1 kB a month |
| `events` | 289 | event (about 15 a Daily player a day) | 7 days, then daily aggregates | 30.3 kB (130 kB at the old 30 days) |
| `rate_counters` | 227 | counter row (about 8 a day) | 2 days | 3.6 kB |
| `players`, `credentials`, `streaks`, `player_stats` | about 930 together | registered identity (assumed: 20% of daily players are new each day) | while the identity exists (pruning idle identities is an owner decision, §12.5) | grows 5.6 kB a month |
| `practice_firsts` | 627 | practice player | 180 days after the last upload | small |
| `daily_aggregates`, `cron.job_run_details`, `heartbeats`, `realtime.messages` | about 2.2 MB a month, 2 MB, 0.1 MB and a few MB | the project | aggregates kept; the others pruned or rotated | fixed |
| Empty project plus our schema and seed data | 10.4 MB [verified] plus about 4 MB | the project | | fixed |

So the working set is about 62 kB per daily player, kept rows grow about 20 kB per daily player per month, and we allow 20% for dead tuples between vacuums. At 1,000 daily players the database starts near 90 MB and grows about 22 MB a month: the 250 MB alert fires around month 7, the 300 MB alert around month 9, and the Pro trigger (two alerts in a month) follows. At 3,000 the working set alone is about 240 MB, so the 250 MB alert fires in the first weeks, the 300 MB alert about month one, and the shed switch would trip near month two: at that scale Supabase Pro is a launch-month decision, which the owner checklist states (§12.5). Abuse fills it faster, which is why the caps below exist and why shedding protects the Daily.

**What keeps it small.**
- **Packed rounds are positional `json`**, not keyed JSONB: about 370 bytes for a whole Daily instead of about 1,200 (measured), with times stored as milliseconds after the attempt's start (§8.3).
- **Idempotency keys store no response.** A replay rebuilds its answer from the attempt's current state (§8.8), so `round_actions` holds 163 bytes a key instead of a copy of every reveal.
- **Raw events live 7 days**, then only as nightly rollups (§8.14). `web_vitals` and `explanation_dwell` stay sampled at 25%.
- **Practice first attempts fold into `item_stats` at upload**, with a one-row bitset per player for the "first attempt" rule, instead of 30 days of raw rows (§8.12).
- **Quiz attempts reference an immutable quiz version** (`quiz_versions`) instead of copying the quiz into each attempt (§8.3).
- **Ranked results fold after 30 days**: the final percentile moves onto the attempt, the date's histogram into `daily_pools`, and the rows go.
- **Byte caps**: every RPC that takes a batch or user text checks `octet_length` first (64 kB for `log_events` and for a whole quiz, 32 kB for practice uploads, 4 kB for a report); user content is capped per subject per day (512 kB per player, 2 MB per IP subject); and `log_events` has project-wide ceilings (§8.6).
- **`cron.job_run_details` is pruned** to 7 days by the hourly job, since pg_cron never prunes it and seven jobs write about 770 rows a day.

**The shed switch.** `private.config.shed` (`{ "on": false, "since": null }`) is turned on by the hourly job when `pg_database_size()` passes `shed_on_mb` (380, tunable) and off again below `shed_off_mb` (340). While it is on, `log_events`, `log_practice_answers`, `set_heart`, `save_quiz` and `create_room` return `unavailable` with `retry_after_ms` set to the next hourly check, the prune passes run every hour instead of nightly, and an alert names the trigger. Daily play, the archive, streaks, challenges and Groups keep working. The hourly job also raises alerts at 250 MB and 300 MB.

**Usage we can only estimate.** Postgres can't see egress, Realtime message counts or WebSocket connections, and we hold no Management API token. So the content queue shows three estimates, each labelled as one: Realtime messages as hints sent times the subscribers live at the time (`rooms.hints_sent` and `deliveries_est`), peak connections as heartbeating seats plus live hosts, sampled in `private.connection_peaks` whenever a room is created or joined and by the 5-minute room sweep, and egress from a 1% sample of response sizes taken in `private.ok()` (`private.egress_samples`). Alerts fire at 1M estimated messages a month, 120 estimated peak connections and 3 GB estimated egress. The owner checklist adds a weekly look at the usage dashboard, or a Management API token stored as a GitHub secret for a workflow that reads real usage (§12.5).

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

drop extension if exists pg_graphql;                    -- the app never uses GraphQL (not installed today [verified])
alter role authenticator set pgrst.openapi_mode = 'disabled';   -- /rest/v1/ stops listing every RPC
notify pgrst, 'reload config';
```

The global revoke differs from Supabase's snippet, which scopes it to `in schema public`. Postgres grants EXECUTE on every new function to PUBLIC as a global default, and a per-schema revoke cannot remove a global grant ([PostgreSQL](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html)). The project's `pg_default_acl` holds only per-schema grants for `postgres`, so the per-schema form leaves every new function in `public` and `private` executable by `anon`. A local dry run showed exactly that, and showed the global form closing the gap (§1.5).

**GraphQL and the OpenAPI root.** An `anon`-executable function is reachable through `/graphql/v1` as well as `/rest/v1/rpc`, and one GraphQL request can alias dozens of mutations past a per-request cap ([lint 0028](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0028_anon_security_definer_function_executable)). `pg_graphql` isn't installed on the project today [verified], so the drop is a guard, and a standing check fails if it ever appears. `pgrst.openapi_mode = 'disabled'` is PostgREST's own in-database setting; whether the hosted gateway honors it is checked by the real-backend contract job, which asserts that `GET /rest/v1/` with the publishable key lists no functions. Both are items of the adversarial audit.

Rules for every later migration:

1. **Tables live in `private`**, never in `public`. Each gets `alter table ... enable row level security` and one explicit deny-all policy, `create policy deny_all on private.<table> for all using (false) with check (false)`, as lint 0008's page recommends, so the advisor sees a policy and nobody but the owner sees a row. Only the owner (`postgres`, which owns the SECURITY DEFINER functions and bypasses RLS) can touch them.
2. **RPCs live in `public`** and are the whole API: `language plpgsql security definer set search_path = ''`, every relation schema-qualified (`private.players`, `extensions.digest`). Each one is followed by `revoke all on function ... from public, anon, authenticated;` and `grant execute on function ... to anon;`.
3. **Helpers live in `private`** and are never granted to anyone. **Every function in every schema**, helpers, hooks, cron entry points and trigger functions included, declares `set search_path = ''` (lint 0011).
4. **The allowlist is data.** `private.rpc_allowlist` names every function `anon` may execute. A SQL test fails if `anon` can execute anything outside it, or anything in `private` (AC-INC-04, AC-UGS-05). **The accepted advisor findings are data too:** `supabase/expected-advisors.json` lists lint 0028 (`anon_security_definer_function_executable`) for exactly the rows of `private.rpc_allowlist`, plus the one INFO `unindexed_foreign_keys` finding on `player_days.attempt_id` (§8.3), and nothing else. Every SQL ticket's dry-run report and QA-2 diff `get_advisors` output against it with `scripts/sql/advisors-diff.ts`; any other finding fails.
5. **Every RPC returns the envelope** `{ "ok": true, "data": ..., "server_time": ... }` or `{ "ok": false, "code": "...", "current": ..., "retry_after_ms": ..., "ref": ..., "server_time": ... }` through `private.ok(data)` and `private.err(code, ...)`. Expected failures return; they never raise, so failure counters commit. Each RPC validates before it writes, so an early return never leaves partial changes. Unexpected exceptions raise and roll the whole call back.
6. **Time comes from `private.now()`**, never `now()` directly, so SQL tests can set the clock (§8.17).
7. **`postgres` owns everything.** Every table, sequence and function in `public` and `private` is owned by `postgres`, because the default-privilege revokes above apply only to objects that role creates; a standing check fails on any other owner, which would mean `apply_migration` ran as another role. No table uses `FORCE ROW LEVEL SECURITY`, since the definer functions rely on the owner's bypass.
8. **Sizes are checked before anything else.** An RPC that takes jsonb or free text checks `octet_length` before parsing further (§8.6).

### 8.3 Tables

All tables are in `private` with RLS enabled. In the real migrations, column defaults call `private.now()`; the DDL below writes `now()` for brevity.

Every foreign key has an index on its referencing columns except `player_days.attempt_id`. That index would add about 30 bytes to every player-day row, kept for as long as the player exists, and nothing ever looks a player day up by its attempt. The nightly job that deletes attempts 400 days after they end first sets `player_days.attempt_id` to null for those dates, through the player-day primary key, so no delete ever scans `player_days`. The performance advisor's single INFO-level `unindexed_foreign_keys` finding there is expected and listed (§8.2). Every table also carries the deny-all policy of §8.2; the DDL below leaves those lines out.

```sql
-- ===== Configuration and operations (SQL-1; ops tables SQL-8) ==========================
create table private.config (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
create table private.rpc_allowlist (name text primary key);
create table private.time_zones (name text primary key);            -- from pg_timezone_names, refreshed nightly
create table private.ip_salts (day date primary key, salt bytea not null);   -- one per UTC day, deleted after 48 hours (§8.6)
create table private.rate_counters (
  bucket text not null,              -- e.g. 'identity_1m', 'general_player_5m' (§8.6)
  subject bytea not null,            -- sha256(bucket, key, the window's salt): never a raw IP or player id
  window_start timestamptz not null,
  hits integer not null default 0,   -- keeps counting past the cap, so refusals are hits - cap
  cap integer not null,
  primary key (bucket, subject, window_start));
create index on private.rate_counters (window_start);
create sequence private.refused_general_ip_5m;                       -- the hook's 429s survive their own rollback
create table private.write_keys (                                    -- idempotency for RPCs that create records (§8.6)
  client_id uuid primary key,
  fn text not null,
  player_id uuid,                    -- deleted by delete_player
  result jsonb not null,
  created_at timestamptz not null default now());
create index on private.write_keys (created_at);
create index on private.write_keys (player_id);
create table private.rpc_errors (
  id bigint generated always as identity primary key, at timestamptz not null default now(),
  fn text not null, sqlstate text not null, ref text not null,
  room_id uuid, question_index smallint,
  detail text);                      -- uuids, tokens and secrets redacted before it is stored
create index on private.rpc_errors (at);
create table private.heartbeats (ts timestamptz primary key);       -- pg_cron, every 5 minutes; kept 7 days
create table private.service_state (
  id smallint primary key default 1 check (id = 1),
  state text not null default 'ok' check (state in ('ok', 'degraded', 'outage', 'maintenance')),
  message_id text, starts_at timestamptz, ends_at timestamptz, content_fix_daily integer,
  updated_at timestamptz not null default now());
create table private.alerts (
  id bigint generated always as identity primary key, at timestamptz not null default now(),
  kind text not null, detail jsonb not null, resolved_at timestamptz);
create table private.daily_aggregates (
  day date not null, metric text not null,
  dims text not null default '',     -- a short 'k=v;k=v' key, not jsonb, so the primary key stays small
  value bigint not null,
  primary key (day, metric, dims));
create table private.egress_samples (                                -- a 1% sample of response sizes (§8.1)
  hour timestamptz primary key, calls integer not null default 0, bytes bigint not null default 0);
create table private.connection_peaks (hour timestamptz primary key, peak integer not null);
create table private.key_escrow (                                    -- CNT-0 (§5.4); read only by postgres through MCP
  kid text primary key, key bytea not null, created_at timestamptz not null default now());

-- ===== Identity (SQL-2) =================================================================
create table private.players (
  id uuid primary key,                                   -- minted on the device
  created_at timestamptz not null default now(),
  is_test boolean not null default false,                -- id starts with 'e2e2e2e2-'
  track text not null default 'main' check (track in ('main', 'e2e')),
  low_trust boolean not null default false,              -- registered past the soft threshold (§8.5)
  friendly_name text not null,                           -- 'Plucky Otter'
  nickname text check (char_length(nickname) between 1 and 24),
  age_band text check (age_band in ('13_17', '18_plus')),   -- an Under 13 answer never reaches the server (§9.7)
  age_band_set_at timestamptz,
  tz text, tz_since timestamptz,                         -- the stored zone, and when it was first seen (§8.7)
  max_local_date date,                                   -- the latest local date served: today never goes back
  last_seen_at timestamptz,                              -- touched at most every 10 minutes
  last_finish_offset_min smallint, last_finish_tz text,   -- the date-line rule (PRD §4.4.7)
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
  token_hash bytea primary key,                          -- the device mints the token; a retry repeats the hash
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
  answer_type text not null, entity_id text not null,
  display text not null,
  option_label text not null,                            -- 'Queen (band)': used for all four options when any shows a bracket
  active boolean not null default true,                  -- false once retired or replaced; kept so old guesses resolve
  primary key (answer_type, entity_id));
create table private.practice_items (                  -- public ids, for reports, the denylist and calibration
  id text primary key, category text not null references private.categories (id),
  ord smallint not null unique,                          -- the item's bit in practice_firsts (§8.12)
  option_count smallint not null check (option_count between 2 and 4),
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
  question text not null,
  unit text not null, unit_short text not null, unit_label text not null,
  value_kind text not null check (value_kind in ('quantity', 'year')),
  answer numeric not null check (answer > 0),
  decimals smallint not null default 0 check (decimals between 0 and 2),
  bullseye numeric, close numeric,                       -- null: defaults from config
  explanation text not null, learn_more text not null, source_labels text[] not null default '{}',
  status text not null default 'active', content_hash text not null);
create table private.sealed_questions (                 -- room packs and sealed choice rounds
  id text primary key check (id ~ '^(fx\.)?r\.[a-z0-9-]+\.\d{2}$'),
  track text not null default 'main',
  format text not null check (format in ('mc', 'tf', 'comparison')),
  category text references private.categories (id),
  stem text not null,
  options text[] not null check (cardinality(options) between 2 and 4),
  correct smallint not null,
  option_order text not null check (option_order in ('shuffle', 'ascending', 'fixed')),
  value_display text[] check (value_display is null or cardinality(value_display) = 2),
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
  status text not null default 'scheduled' check (status in ('scheduled', 'frozen')),   -- the only frozen state (§8.7)
  ready boolean not null default false,               -- every item passed pass D for this date (CONTENT_GUIDE §9.9 rule 7)
  spare_order jsonb not null default '[]',             -- [{ "spare": id, "breaks": [rule codes] }], best first (CONTENT_GUIDE §10.7)
  frozen_at timestamptz,
  primary key (track, daily_number),
  unique (track, local_date));
create table private.daily_spares (
  id text primary key,
  track text not null default 'main' check (track in ('main', 'e2e')),   -- a gap only ever takes its own track's spare
  rounds jsonb not null, composition text not null, max_points smallint not null,
  used_for_date date);
create index on private.daily_spares (track) where used_for_date is null;
create table private.challenge_packs (                  -- PRD §3.6.1; none published at launch
  id text primary key,
  track text not null default 'main' check (track in ('main', 'e2e')),
  title text not null, theme text not null,
  rounds jsonb not null,                                 -- RoundSpec[] drawn from past Dailies
  composition text not null, max_points smallint not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  published_at timestamptz);
create table private.room_packs (
  id text primary key, track text not null default 'main', title text not null, theme text not null,
  question_ids text[] not null check (cardinality(question_ids) = 15),
  status text not null default 'active');
create table private.content_releases (                 -- written last by each release, after verify_release (§5.4)
  version text primary key, applied_at timestamptz not null default now(),
  content_hash text not null, counts jsonb not null);

-- ===== Attempts: Daily, archive, challenge, pack, shared quiz (SQL-4, SQL-5, SQL-7) =====
create table private.attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references private.players (id) on delete set null,   -- detached on deletion
  kind text not null check (kind in ('daily', 'archive', 'challenge', 'pack', 'quiz')),
  track text not null default 'main',
  daily_number integer, pack_id text, quiz_id uuid, quiz_version integer, challenge_id bigint,
  ranked boolean not null default false,          -- first attempt at the player's effective today
  local_date date,                                -- the player's effective local date at start
  tz text not null, offset_min smallint not null,
  offset_band smallint not null check (offset_band between 0 and 2),   -- 0 Americas, 1 EMEA, 2 APAC
  context text not null, app text not null, app_version text not null,
  status text not null default 'active' check (status in ('active', 'finished', 'abandoned')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  round_count smallint not null,
  current_round smallint not null default 0,
  current_step smallint not null default 0,       -- clue number; 0 = round not begun
  rounds json not null,                           -- packed per-round state, positional (below)
  points smallint not null default 0,
  encore_err numeric, total_ms integer, rank_key bigint,
  flags smallint not null default 0,              -- 1 hidden, 2 expert slot, 4 too fast, 8 missing report,
                                                  -- 16 zone change, 32 low trust (§8.8)
  streak_credit boolean not null default true,    -- false for a zone hop without 20 hours since the last call (§8.7)
  repair_of date,
  share_code text,                                -- the grid, kept after compaction for head-to-heads and history
  final_percentile smallint,                      -- moved here when daily_results is folded (§8.9)
  compacted boolean not null default false);
create unique index attempts_one_per_date on private.attempts (player_id, track, daily_number) where daily_number is not null;
create unique index attempts_one_per_pack on private.attempts (player_id, pack_id) where pack_id is not null;
create unique index attempts_one_per_quiz on private.attempts (player_id, quiz_id) where quiz_id is not null;
create index on private.attempts (player_id, started_at desc);
create index on private.attempts (started_at) where status = 'active';
create table private.round_actions (               -- idempotency keys, pruned 48 h after the attempt ends
  idem uuid primary key,
  attempt_id uuid not null references private.attempts (id) on delete cascade,
  round smallint not null, step smallint not null,
  intent_hash bigint not null,                    -- the same key with another intent is 'conflict'
  at timestamptz not null default now());         -- no stored response: a replay rebuilds it (§8.8)
create index on private.round_actions (attempt_id);
create table private.daily_results (               -- finished ranked attempts: the percentile pool
  attempt_id uuid primary key references private.attempts (id) on delete cascade,
  track text not null, daily_number integer not null, band smallint not null,
  eligible boolean not null,                      -- false when any honest-play flag is set
  points smallint not null, encore_err numeric, encore_guess numeric,
  total_ms integer not null, rank_key bigint not null,
  finished_at timestamptz not null,
  final_percentile smallint);                     -- stored when the global window closes; pruned 30 days later
create index daily_results_rank on private.daily_results (track, daily_number, eligible, band, rank_key);
create table private.daily_pools (                 -- what a date keeps once daily_results is folded
  track text not null, daily_number integer not null,
  histogram integer[] not null, eligible integer not null, closed_at timestamptz not null,
  primary key (track, daily_number));
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

-- ===== Streaks, stats and incidents (SQL-6, SQL-7) ======================================
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
  dateline_protected_at timestamptz,              -- the date-line rule fires at most once per 30 days
  dateline_candidate date, dateline_candidate_tz text,   -- waiting for the next request to keep the new zone
  updated_at timestamptz not null default now());
create table private.player_stats (                -- aggregates kept at finish, so /me never scans attempts
  player_id uuid primary key references private.players (id) on delete cascade,
  finishes integer not null default 0, points_sum integer not null default 0, best smallint,
  score_counts integer[] not null default '{}',   -- index = points
  solves_by_clue integer[] not null default '{0,0,0,0,0}',   -- clue 1 to 4, then missed
  encore_bullseyes integer not null default 0, encore_closes integer not null default 0,
  encore_err_hist integer[] not null default '{0,0,0,0,0,0,0,0}',   -- buckets for an approximate median
  category_counts jsonb not null default '{}',
  updated_at timestamptz not null default now());
create table private.notices (
  id bigint generated always as identity primary key,
  player_id uuid not null references private.players (id) on delete cascade,
  kind text not null check (kind in ('freeze_spent', 'protected', 'rescored', 'key_corrected', 'group_deleted')),
  payload jsonb not null, created_at timestamptz not null default now(), seen_at timestamptz);
create index on private.notices (player_id) where seen_at is null;
create table private.incidents (
  id bigint generated always as identity primary key,
  track text not null default 'all' check (track in ('main', 'e2e', 'all')),   -- heartbeat gaps are 'all'
  starts_at timestamptz not null, ends_at timestamptz not null check (ends_at > starts_at),
  kind text not null check (kind in ('heartbeat_gap', 'declared', 'publish_failure')),
  note text, created_at timestamptz not null default now(),
  unique (kind, track, starts_at));
create index on private.incidents using gist (tstzrange(starts_at, ends_at));

-- ===== Reports, hearts, practice calibration (SQL-9) ====================================
create table private.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid,                               -- no FK: deleted explicitly by delete_player
  target_kind text not null check (target_kind in
    ('practice_item', 'daily_round', 'pack_question', 'room_question', 'quiz', 'quiz_question')),
  target_ref text not null,                       -- 'p.geo.0142', 'main:42:2', 'quiz:<code>:3'
  reason text not null,
  guess_entity_id text,                           -- 'guess_should_count' only: the chosen guess (PRD §3.13.2)
  note text check (char_length(note) <= 280),     -- links stripped; nulled after 180 days
  weight numeric(3, 2) not null,
  ip_subject bytea,                               -- daily-salted (§8.6); nulled after 48 hours
  client_id uuid not null unique,
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  unique (reporter_id, target_kind, target_ref));
create table private.report_tallies (
  target_kind text not null, target_ref text not null,
  weighted numeric not null default 0, raw integer not null default 0,
  distinct_subjects integer not null default 0,   -- weighted reports from distinct IP subjects
  first_report_at timestamptz not null, paged_at timestamptz, alert_at timestamptz,
  pulled_at timestamptz, resolved_at timestamptz,
  primary key (target_kind, target_ref));
create table private.pulled_items (
  version bigint generated always as identity primary key,
  item_id text not null unique, pulled_at timestamptz not null default now(),
  reason text not null, auto boolean not null default true, restored_at timestamptz);
create table private.pull_queue (                  -- automatic pulls past the daily cap wait for the owner
  item_id text primary key, queued_at timestamptz not null default now(), weighted numeric not null);
create table private.hearts (
  player_id uuid not null, item_ref text not null, created_at timestamptz not null default now(),
  primary key (player_id, item_ref));
create table private.practice_firsts (             -- one row per practice player, instead of raw answers
  player_id uuid primary key,                     -- no FK: practice-only players never register
  created_at timestamptz not null default now(), last_at timestamptz not null default now(),
  items bytea not null default '',                -- bit practice_items.ord: a first attempt arrived
  auth_items bytea not null default '',           -- the same, from uploads under a valid credential
  rated integer not null default 0);              -- first attempts seen; calibration counts from the 21st
create table private.item_stats (                  -- aggregates, kept
  item_ref text primary key,
  first_attempts numeric not null default 0, correct numeric not null default 0,   -- weighted: self-picked runs add 0.5
  option_counts integer[] not null default '{0,0,0,0}',   -- source order: the ChoiceItem.correct index space
  hearts integer not null default 0, reports_weighted numeric not null default 0);

-- ===== Analytics (SQL-10) ===============================================================
create table private.event_dictionary (name text primary key, props jsonb not null);   -- generated (§3.12)
create table private.events (                      -- raw, kept 7 days
  event_id uuid primary key, name text not null, player_id uuid not null, session_id uuid not null,
  ts_client timestamptz not null, ts_server timestamptz not null default now(),
  app_version text not null, route_group text not null, platform text not null, context text not null,
  props jsonb not null default '{}');
create index on private.events (ts_server);
create index on private.events (name, ts_server);
create index on private.events (player_id);        -- delete_player stays an index lookup

-- ===== Moderation (MOD-1) ===============================================================
create table private.moderation_terms (term text primary key, match text not null check (match in ('word', 'substring')));
create table private.moderation_allow (word text primary key);

-- ===== Challenges (SQL-11) ==============================================================
create table private.challenges (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  creator_id uuid not null references private.players (id) on delete cascade,
  creator_attempt_id uuid references private.attempts (id) on delete set null,   -- null until a rematch's sender plays it
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
create table private.group_removals (              -- the invite current at removal no longer works for that player
  group_id uuid not null references private.groups (id) on delete cascade,
  player_id uuid not null references private.players (id) on delete cascade,
  invite_code text not null,
  removed_at timestamptz not null default now(),
  primary key (group_id, player_id));
create index on private.group_removals (player_id);

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
  host_token_hash bytea not null unique,          -- minted on the device; a retried create finds its room
  source_kind text not null check (source_kind in ('pack', 'quiz')), pack_id text, quiz_id uuid, quiz_version integer,
  questions jsonb not null,                       -- sealed snapshot, options in room order (rooms live 24 hours)
  settings jsonb not null,                        -- { "timer_s": 20, "scoring": "classic", "names": "generated" }
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
  auto_voids smallint not null default 0,         -- voids from our own errors, capped per game (§8.11)
  host_seen_at timestamptz not null default now(),   -- touched by room_host_state; 60 s old is "host away"
  host_last_call_at timestamptz,                  -- spacing for host calls, instead of counter rows
  last_host_hint_at timestamptz,                  -- answer-count hints: at most one a second
  hints_sent integer not null default 0, deliveries_est integer not null default 0,   -- Realtime estimates
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz);
create unique index rooms_active_code on private.rooms (code) where status <> 'ended';
create index on private.rooms (host_player_id);
create table private.room_seats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references private.rooms (id) on delete cascade,
  seat_token_hash bytea not null unique,          -- minted on the device; also the join's idempotency key
  name text not null,
  name_typed boolean not null default false,
  age_band text check (age_band in ('13_17', '18_plus')),   -- answered on the seat when the phone has no profile
  first_question smallint not null default 0,     -- a seat that joins mid-question scores from the next one
  joined_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  last_state_at timestamptz,                      -- per-seat call spacing, instead of counter rows
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
  client_id uuid unique,                          -- the first save's key (§8.6)
  title text not null check (char_length(title) between 3 and 60),
  description text not null default '' check (char_length(description) <= 200),
  version integer not null default 1,             -- the current row in quiz_versions
  question_count smallint not null check (question_count between 1 and 50),
  bytes integer not null check (bytes <= 65536),  -- octet_length of the current version
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  share_code text unique check (share_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  shared_at timestamptz, share_confirmed_at timestamptz,
  hidden_at timestamptz, taken_down_at timestamptz, takedown_reason text,
  plays integer not null default 0, score_sum integer not null default 0);
create index on private.quizzes (owner_id);
create table private.quiz_versions (               -- immutable: attempts reference a version instead of copying it
  quiz_id uuid not null references private.quizzes (id) on delete cascade,
  version integer not null,
  questions jsonb not null,                       -- 1 to 50 UserQuizQuestion, validated by save_quiz
  created_at timestamptz not null default now(),
  primary key (quiz_id, version));
alter table private.attempts add foreign key (quiz_id, quiz_version)
  references private.quiz_versions (quiz_id, version) on delete set null;
create index on private.attempts (quiz_id, quiz_version) where quiz_id is not null;
```

**Packed round state** (`attempts.rounds`, stored as `json` text, one positional array per round, with every time in milliseconds after `started_at`). Positional arrays in `json` take about 370 bytes for a whole Daily against about 1,200 for keyed JSONB (§1.5); the handlers parse the value once per call and write it back once.

```json
[ ["m", [120, 41900], ["Q16"], null, 2, 3, 52140, 51880, 2, 0, 52260, 2031],
  ["e", [170000], 1200, 0.04, 2, 9100, 9010, 2, 0, 179100],
  ["c", [6000], 1302, 2, 1, 1, 6100, 6020, 2, 0, 12100],
  ["w", 4] ]
```

| Code | Fields, in order |
|---|---|
| `m` (mystery) | clue issue times, guessed entity ids, picked option or null, solved-on clue or null, points, server ms (`sms`), client ms (`cms`), counted requests (`rq`), hidden ms (`hm`, the round's maximum report), resolve time, option shuffle as four digits |
| `e` (encore) | issue time, guess, error, band (0 none, 1 close, 2 bullseye), `sms`, `cms`, `rq`, `hm`, resolve time |
| `c` (choice) | issue time, option shuffle, chosen index, correct (0 or 1), points, `sms`, `cms`, `rq`, `hm`, resolve time |
| `w` (withdrawn) | points awarded (4 for a mystery, 0 for an encore) |

After 30 days a nightly job sets `rounds` to `[]`, keeping the scalar columns and `share_code`, and sets `compacted = true`. Attempts are deleted 400 days after they end; `player_days` and `player_stats` keep their facts.

### 8.4 RPC catalogue

Conventions: every RPC is `public.<name>(...) returns jsonb`, called with POST. "(auth)" means the first two parameters are `p_player uuid, p_secret text`, checked by `private.authenticate` (§8.5); "(auth, registers)" means an unknown player id is registered on the spot, under the identity limits; "(optional auth)" means `p_player uuid default null, p_secret text default null` as the **last** two parameters, because Postgres requires every parameter after a defaulted one to have a default too, so required parameters always come first. Text inputs pass `private.clean_text` (NFC, trimmed, control characters removed, whitespace collapsed) before validation, and every jsonb or free-text input passes an `octet_length` cap first (§8.6). Every RPC that creates a record takes a client key, `p_client_id uuid`, or a client-minted token that serves as one, and a repeated key returns the first result (§8.6). Every RPC also falls under the general caps of §8.6 unless the table says it is exempt. A wrong secret always returns the same `auth_failed` and changes nothing (AC-IDN-03), and every `rate_limited` carries `retry_after_ms`.

**Identity (SQL-2; `set_nickname` in MOD-1)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `register_player(p_player uuid, p_secret text, p_context text, p_app text)` | `Profile` | Secret matches `^[A-Za-z0-9_-]{43}$`; context and app in their enums. A known player with a matching credential gets its profile back (idempotent); a known player without a match gets `auth_failed`; an unknown player is created with a generated friendly name and a `mint` credential, through `insert ... on conflict do nothing` and a re-select, so two first writes racing from one device create one player | `invalid_input`, `auth_failed`, `rate_limited` | The identity limits of §8.5 (AC-IDN-04); test ids have their own |
| `get_profile(auth)` | `Profile` | | `auth_failed` | |
| `set_age_band(auth, p_band text, p_moment text)` | `Profile` | `13_17` or `18_plus`, and the moment in its enum; an Under 13 answer is never sent (§9.7) | `invalid_input` | 10 per player per day |
| `set_nickname(auth, p_nickname text, p_generated boolean)` | `Profile` | A generated name must be a valid `name_parts` pair; custom text needs `18_plus` (`13_17` gets `age_forbidden`, unknown gets `age_required`), 1 to 24 characters, and must pass `private.text_is_blocked` | `invalid_input`, `age_required`, `age_forbidden`, `blocked_text` | 20 per player per day |
| `create_sync_code(auth)` | `{ code }` | 16 Crockford characters from `gen_random_bytes(10)`; upserts the hash, so the previous code stops working (AC-SYN-03) | `auth_failed`, `rate_limited` | 5 per player per day |
| `redeem_sync_code(p_code text, p_new_secret text)` | `{ player_id, profile, streak, last_daily }` | Checks the failure counters before looking at the code (AC-SYN-04); normalizes case, spaces, hyphens, I and L to 1, O to 0 (AC-SYN-02); adds a `sync` credential for the new secret; keeps the 10 most recently used credentials | `invalid_input`, `not_found`, `rate_limited` | 5 failures per IP subject per 15 minutes; 20 per IP subject per day |
| `create_claim(auth, p_token text)` | `{ expires_at }` | The device mints the 32-byte token and sends it; the server stores its hash with a 10-minute expiry, and a retry with the same token returns the same claim | `auth_failed`, `invalid_input`, `rate_limited` | 5 per player per hour |
| `peek_claim(p_token text)` | `ClaimPreview` | Valid, unexpired, unredeemed | `expired`, `not_found`, `rate_limited` | 10 per IP subject per hour, shared with redeem |
| `redeem_claim(p_token text, p_new_secret text)` | `{ player_id, profile, streak, last_daily }` | `update ... set redeemed_at = private.now() where token_hash = ... and redeemed_at is null and expires_at > private.now() returning ...` makes it single-use (AC-IAB-04); adds a `claim` credential | `expired`, `not_found`, `rate_limited` | 10 per IP subject per hour |
| `export_my_data(auth)` | `ServerDataExport` | Everything keyed by the player id | `auth_failed` | 5 per player per day |
| `delete_player(auth)` | `{}` | Deletes the player (cascading to credentials, sync code, claims, memberships, challenges, quizzes, streak rows, stats, notices and achievements), detaches attempts, and deletes events, hearts, reports, practice bitsets and write keys by player id, every one an index lookup. Rate counters hold only salted hashes and error details are redacted at write time, so no table keeps the id (AC-DAT-02) | `auth_failed` | |
| `t_client_ip(p_player uuid, p_secret text)` | `{ chosen_forged, first_hop_forged, last_hop_forged, hops, header_names }` | Test identities only (others get `not_found`). Reports, as booleans and header names, never addresses, whether the address the limiter keys on equals a forged `X-Forwarded-For` value the caller sent (§8.6) | `auth_failed`, `not_found` | 30 per player per hour |

**Sealed runs (SQL-4, SQL-5, SQL-7; challenge and pack starts in SQL-11; quiz starts in SQL-15)**

Every `start_*` RPC that creates an attempt opens round 0 in the same call, as `begin_round` would, so the snapshot carries the first clue or stem and one tap reaches it (PRD §3.1.3, §4.1.4, G4); that call counts as round 0's `begin_round` toward `rq`. A resumed attempt comes back as it stands.

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `get_today(p_tz text, optional auth)` | `DailyTodayCard` | Never registers. With a valid credential it uses the effective today (§8.7) and includes the attempt's status; without one, the request zone's date. Carries the round chips and, from 50 finished ranked runs, the played count (PRD §3.1.7, AC-DLY-33) | | 300 per IP subject per minute (`landing_ip_1m`) |
| `start_daily(auth, registers, p_tz text, p_context text, p_app text, p_app_version text)` | `AttemptSnapshot` | Resolves the zone and the effective today (§8.7); finds the track's Daily for that date; returns the existing attempt for that player and Daily, finished or not (AC-DLY-05, AC-DLY-06); otherwise inserts a ranked `daily` attempt with `insert ... on conflict do nothing` on `attempts_one_per_date` and re-selects, so a double tap or a second tab gets the same attempt; sets flag 16 and, without 20 hours since the previous call, `streak_credit = false` for a zone hop (§8.7, AC-STK-09); draws the per-round shuffles and opens round 0, so the snapshot carries Mystery 1's clue 1 | `no_daily` (also records a `publish_failure` incident on the player's track), `auth_failed`, `rate_limited` | general caps |
| `start_archive(auth, registers, p_tz text, p_daily_number int)` | `AttemptSnapshot` | One of the 7 dates before the effective today (AC-ARC-01); one attempt per date. An abandoned attempt for that date reopens in place as unranked `archive`, with its resolved rounds and guesses (AC-ARC-07); repair is decided when it finishes | `not_open`, `not_found`, `already_played` | general caps |
| `start_challenge_run(auth, registers, p_tz text, p_code text)` | `AttemptSnapshot` | The challenged date equals the effective today: a ranked `daily` attempt (AC-CHL-02); within the last 7 days: `archive` (AC-CHL-03); older: `challenge`, no streak effect; later: `not_open` with `unlocks_at` (AC-CHL-04). At most 50 entries, counted with `update private.challenges set accepted = accepted + 1 where id = ... and accepted < 50 returning`, so concurrent accepts never pass 50 or raise (AC-CHL-06) | `not_open`, `full`, `expired`, `already_played`, `not_found` | general caps |
| `start_pack_run(auth, registers, p_pack text)` | `AttemptSnapshot` | Published challenge packs on the caller's track (`private.challenge_packs`); none exist at launch | `not_found` | general caps |
| `start_quiz_run(auth, registers, p_code text)` | `AttemptSnapshot` | Shared, not hidden, not taken down; the attempt references the quiz's current immutable version (`quiz_id`, `quiz_version`) and copies nothing; unranked | `not_found`, `unavailable` | general caps |
| `get_attempt(auth, p_attempt uuid)` | `AttemptSnapshot` | Owner only; resolved rounds carry reveals; the open round carries only what was issued; a round voided since it opened resolves as withdrawn here (§8.8) | `not_found` | |
| `begin_round(auth, p_attempt uuid, p_round smallint)` | `{ start, finished, converted }` | `p_round = current_round` and the previous round resolved. First converts the attempt if its window has closed (§8.7). A voided round resolves at once as withdrawn (4 points for a mystery, no error for an encore) and returns the next round's meta, or `finished` when it was the last. Otherwise it issues the clue or stem; repeated calls return the same open state without moving its issue time and never count toward `rq` | `stale`, `not_found` | |
| `round_action(auth, p_attempt uuid, p_round smallint, p_step smallint, p_action jsonb, p_client_ms int, p_hidden_ms int, p_idem uuid)` | `{ verdict, finished, converted }` | In this order: lock the attempt `for update`; look up `p_idem` scoped to this attempt (a key held by another attempt, or by a different intent hash, is `conflict`; a known key returns the response rebuilt from the attempt's current state); convert the attempt if its window has closed; resolve a voided current round as withdrawn; `p_round` and `p_step` must match, else `stale` with the current open state; check the per-attempt cap (a refusal consumes nothing and stores no key); dispatch to the family judge (§8.8); on an accepted action insert the key with `on conflict (idem) do nothing`; on resolution stamp times, flags and points; the final round finishes the attempt in the same transaction | `stale`, `conflict`, `invalid_entity`, `already_guessed`, `invalid_input`, `rate_limited`, `not_found` | 120 accepted actions per attempt |
| `finish_attempt(auth, p_attempt uuid)` | `FinishSummary` | Idempotent recovery path; converts after the window closes like the others | `not_found`, `invalid_input` | |
| `get_daily_results(auth, p_attempt uuid)` | `DailyResults` | The caller's finished attempts only; `challenge` is set when the attempt came from a challenge; `personal` comes from `player_stats` once 3 earlier finishes exist | `not_found` | |
| `get_daily_numbers(auth, p_attempt uuid)` | `{ percentile, histogram, crowd }` | The caller's finished attempts only, `not_found` otherwise, so no run still in progress can read the crowd's numbers, the Encore's median guess included; §8.9 | `not_found` | 60 per player per hour |
| `get_archive(auth, p_tz text)` | `ArchiveListing` | T-1 to T-7 of the effective today, with tile states and repair status; an abandoned attempt's tile reopens it | | |

**Streaks, notices, stats and achievements (SQL-6, SQL-7, MAS-1)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `get_streak(auth, p_tz text)` | `StreakState` | Runs `private.evaluate_streak` under the player's streak lock (§8.10); idempotent; uses the effective today | | |
| `ack_notices(auth, p_ids bigint[])` | `{}` | The caller's notices only | | |
| `get_my_stats(auth, p_tz text)` | `PlayerServerStats` | Reads `player_stats`, `player_days` and achievements, never a scan of attempts | | 60 per player per hour |
| `record_achievements(auth, p_ids text[])` | `{ newly_recorded }` | Ids in the allowlist `A01` to `A30` | `invalid_input` | 30 per player per day |

**Challenges (SQL-11)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `create_challenge(auth, p_attempt uuid, p_client_id uuid)` | `{ code, expires_at }` | The caller's finished `daily`, `archive`, `challenge` or `pack` attempt; practice never reaches the server, so no practice source can exist (AC-CHL-08); a repeated key returns the first code and counts once | `not_found`, `rate_limited` | 20 per player per day (AC-CHL-07) |
| `get_challenge(p_code text, p_tz text, optional auth)` | `ChallengeLanding` | Works without identity; unknown codes return state `invalid`; `challenger_played` is false for a rematch its sender hasn't played | | 300 per IP subject per minute |
| `get_head_to_head(auth, p_code text)` | `HeadToHead` | The caller played it; it names the challenger and the caller only, never another recipient (AC-CHL-13) | `not_found` | |
| `create_rematch(auth, p_code text, p_tz text, p_client_id uuid)` | `{ code }` | The most recent date in the effective today and the last 7 that neither player finished; else the first published pack that draws from no Daily either player has played (AC-CHL-16); else tomorrow (AC-CHL-09). `creator_attempt_id` stays null until the sender plays it | `not_found`, `rate_limited` | counts toward the 20 |
| `get_challenge_shelf(auth)` | `ChallengeShelf` | 50 per section, newest first | | |
| `get_challenge_participants(auth, p_code text)` | `ChallengeParticipants` | The creator only; each row names the participant by their chosen nickname, or their generated friendly name when they never chose one, and nothing else | `not_found` | |

**Groups (SQL-12)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `create_group(auth, registers, p_name text, p_nickname text, p_generated boolean, p_client_id uuid)` | `{ group, invite }` | Age band known (`age_required`) and not `under_13` (`age_forbidden`); `13_17` must use a generated nickname; name 3 to 30 characters; both texts pass the filter (AC-GRP-07); 10 groups per player at most; a repeated key returns the first group | `age_required`, `age_forbidden`, `blocked_text`, `limit_reached`, `rate_limited` | 3 per player per day |
| `get_group_invite(p_code text)` | `GroupInvitePreview` | Name and member count only | | 300 per IP subject per minute |
| `join_group(auth, registers, p_code text, p_nickname text, p_generated boolean)` | `GroupSummary` | Same age and text rules. Locks the Group row `for update` before counting members, taking the next `member_no` and choosing the nickname suffix, so concurrent joins never pass 50 or collide on " 2" (AC-GRP-02); tracks never mix; a member joining again gets their membership back; a player removed while this invite was current gets `removed`, and once the admin regenerates the invite the new code joins them and clears the row (AC-GRP-14) | `full`, `not_found`, `removed`, `age_required`, `age_forbidden`, `blocked_text`, `limit_reached` | 20 joins per player per hour |
| `list_my_groups(auth)` | `{ groups, deleted }` | `deleted` lists the caller's unseen `group_deleted` notices with the Group's name; the client shows each once in place of its row and acks it (AC-GRP-13) | | |
| `get_group_board(auth, p_group uuid, p_tz text)` | `GroupBoard` | Members only (AC-GRP-03); Today rows carry no score or grid until the viewer finished today's Daily (AC-GRP-06); the week sums `player_days` rows with status `played` from Monday to Sunday (AC-GRP-04), through yesterday until the viewer finished today, with today kept out of `currentStreak` likewise; a member whose streak is paused gets the pre-break count with `streak_paused` (AC-RPR-09) | `not_member` | 120 per player per hour |
| `get_group_today_ranks(auth, p_tz text)` | `GroupTodayRank[]` | The caller's Groups in `/g` order, at most 3; for each, today's finishers ranked by the Daily ranking rule with ties shared, the finisher count and the not-yet count; `rank` is null until the caller finished today | | 120 per player per hour |
| `get_group_invite_code(auth, p_group uuid)` | `{ invite }` | Members only | `not_member` | |
| `set_group_nickname(auth, p_group uuid, p_nickname text, p_generated boolean)` | `GroupSummary` | Text and age rules | `blocked_text`, `age_forbidden`, `not_member` | |
| `group_admin(auth, p_group uuid, p_action jsonb)` | `{ group, invite }`, both null after a delete | Admin only (others get `invalid_input`): rename (filter), regenerate the invite (AC-GRP-10), transfer admin, remove a member by `member_no` (recording the current invite in `group_removals`), and delete, which removes the Group with its memberships and writes a `group_deleted` notice for every other member, after which the board refuses them all (AC-GRP-13) | `not_member`, `blocked_text`, `invalid_input` | |
| `leave_group(auth, p_group uuid)` | `{}` | A leaving admin hands over to the longest-standing member (AC-GRP-11); the last member's leave deletes the group | `not_member` | |

**Rooms, Beta (SQL-13, SQL-14).** The `room_*` RPCs skip the pre-request hook and carry their own spacing rules, kept as timestamps on the seat and room rows instead of counter rows; `create_room` and `join_room` count toward the general caps.

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `create_room(auth, registers, p_source jsonb, p_settings jsonb, p_host_token text, p_client_id uuid)` | `{ room_id, code }` | Server flag `rooms`; refused while shedding (§8.1). The source resolves through `private.room_source(p_source, player)`, which dispatches to `room_source_pack` (SQL-13) or `room_source_quiz` (SQL-15); settings in their enums (`names` defaults to `generated`); the project-wide live-connection cap (§8.11); a repeated host token or key returns the same room; a 6-digit code unique among live rooms, redrawn on a clash in a loop of at most 5 tries | `feature_disabled`, `not_found`, `age_forbidden`, `full`, `unavailable`, `rate_limited` | 5 per identity per hour |
| `join_room(p_code text, p_method text, p_seat_token text)` | `{ room_id, seat_id, name, rejoined, scores_from }` | A seat token already known for that room restores the seat, name and score with no join limit applied (AC-ROM-02); a removed seat's token is refused (AC-ROM-05). Otherwise a new seat: refused while locked, when the room already holds 20 seats that aren't removed (AC-ROM-06; a removed guest's place can be refilled, and a disconnected seat keeps its own, PRD §3.8.2), or at the project's live-connection cap; accepted in any phase, scoring from the next question. The wrong-code limit is checked before the code is looked up, and only a `not_found` result counts toward it | `not_found`, `full`, `locked`, `removed`, `ended`, `rate_limited` | 10 wrong codes per IP subject (IPv6 /64) per minute; project-wide wrong codes slow new joins (§8.6) |
| `room_shuffle_name(p_room uuid, p_seat_token text)` | `{ name }` | Before the seat's first answer | `stale` | 1 per second per seat |
| `room_set_name(p_room uuid, p_seat_token text, p_name text, p_age_band text default null, optional auth)` | `{ name }` | Only while the room's `names` setting is `typed` and before the seat's first answer; the 18+ band, since a typed name is a custom nickname: taken from the profile when the phone sends its credential, otherwise from `p_age_band`, which is stored on the seat (PRD §3.10.6; `age_required` when neither is known, `age_forbidden` for 13 to 17); 1 to 16 characters after `clean_text`; `private.text_is_blocked`; a clash with a live seat's name gets " 2"; the host can still rename or remove the seat | `feature_disabled`, `age_required`, `age_forbidden`, `blocked_text`, `invalid_input`, `removed` | 5 per seat |
| `room_heartbeat(p_room uuid, p_seat_token text)` | `{ version }` | Touches `last_heartbeat_at`; runs `private.room_tick` | `removed`, `ended`, `rate_limited` | 1 per 2 s per seat |
| `room_player_state(p_room uuid, p_seat_token text)` | `RoomPlayerView` | Runs `private.room_tick`; `options` is null until `private.now() >= options_at`, and the correct option never appears before the reveal (AC-ROM-09); `host_away` after 60 s without a host call | `removed`, `ended`, `not_found` | 2 per second per seat |
| `room_host_state(p_room uuid, p_host_token text)` | `RoomHostView` | Touches `host_seen_at`; runs `private.room_tick`; `options` is null until `options_at` here too | `not_found` | 4 per second |
| `room_host_action(p_room uuid, p_host_token text, p_action jsonb, p_expected_version int)` | `RoomHostView` | `p_expected_version` must equal `version`, so a double tap returns `conflict`; transitions per §8.11; renames pass the filter | `conflict`, `invalid_input`, `blocked_text` | 10 per second |
| `room_answer(p_room uuid, p_seat_token text, p_question smallint, p_option smallint, p_client_ms int, p_idem uuid)` | `{ accepted, late }` | Phase `answering` for that question, and a seat whose `first_question` has come; one answer per seat, never changed; accepted until the seat's deadline plus 500 ms, with no speed bonus after the deadline; later answers rejected (AC-ROM-08) | `stale`, `removed`, `invalid_input` | 2 per question per seat |
| `room_leave(p_room uuid, p_seat_token text)` | `{}` | Marks the seat disconnected, not removed | | |

**User quizzes, Beta (SQL-15)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `save_quiz(auth, registers, p_quiz jsonb, p_base_version int, p_client_id uuid)` | `UserQuiz` | Server flag `editor`; refused while shedding; 64 kB at most by `octet_length`; every blocking rule of PRD §3.9.4 and the filter on every field (AC-EDT-05, AC-LNT-02); version check, returning the current copy on `conflict` (AC-EDT-04); a changed question list writes a new immutable `quiz_versions` row; a first save's key is unique, so a retried first save returns the same quiz; 50 quizzes per player; the daily byte caps of §8.6 | `invalid_input`, `blocked_text`, `conflict`, `limit_reached`, `unavailable`, `rate_limited` | 30 saves per player per hour |
| `list_my_quizzes(auth)` | `UserQuiz[]` | | | |
| `delete_quiz(auth, p_quiz uuid)` | `{}` | Owner only | `not_found` | |
| `share_quiz(auth, p_quiz uuid, p_confirm boolean)` | `{ code }` | `18_plus` and `p_confirm` (AC-UGS-01); not hidden or taken down; a quiz already shared returns its code | `age_required`, `age_forbidden`, `invalid_input`, `rate_limited` | 10 per player per day |
| `unshare_quiz(auth, p_quiz uuid)` | `{}` | Clears `share_code` (AC-UGS-06) | | |
| `get_shared_quiz(p_code text)` | `SharedQuizLanding` | Hidden quizzes return state `hidden`; unshared or taken down return `unavailable` | | 300 per IP subject per minute |

**Reports, hearts, practice, analytics and health (SQL-8, SQL-9, SQL-10)**

| RPC | `data` | Rules | Errors | Limits |
|---|---|---|---|---|
| `submit_report(auth, registers, p_target jsonb, p_reason text, p_note text, p_client_id uuid)` | `{ stored }` | One per identity per target; 4 kB at most; weight per §8.12 (0 without an authenticated answer, 0 for test and low-trust identities, 0.5 under 24 hours old, else 1; AC-RPT-02); stores the reporter's daily-salted IP subject; links stripped from the note; `guess_should_count` only on a Mystery round, with a guess the reporter actually made there or null; thresholds in §8.12 | `invalid_input` | 30 per player per day |
| `set_heart(auth, registers, p_item_ref text, p_on boolean, p_client_id uuid)` | `{}` | Idempotent per client id; refused while shedding | `unavailable` | 300 per player per day |
| `log_practice_answers(p_player uuid, p_batch jsonb, p_secret text default null)` | `{ accepted }` | Calibration data. No secret is required, so practice-only players never register (AC-IDN-01); a registered device sends its secret, and only answers under a valid credential count toward report weight. 50 rows and 32 kB at most; ids must exist in `practice_items`; option indices in source order and below the item's option count; folded at once into `practice_firsts` and `item_stats` (§8.12), a `selfPicked` row at half weight; refused while shedding | `invalid_input`, `unavailable` | 500 per player per day; 2,000 per IP subject per day; 50 new practice ids per IP subject per day |
| `get_pulled_items(p_since bigint)` | `{ version, item_ids }` | | | 300 per IP subject per minute |
| `log_events(p_batch jsonb)` | `{ accepted }` | 50 events and 64 kB at most; unknown names dropped, unknown properties stripped, enums checked (AC-ANA-02); any value matching an e-mail, phone or URL-with-query pattern drops the event (AC-ANA-04); `event_id` unique (AC-ANA-03); `ts_client` within 7 days of server time. While a project ceiling is tripped the batch is accepted and dropped (`accepted: 0`), and while shedding the call returns `unavailable` | `invalid_input`, `unavailable` | Exempt from the hook; 60 events per identity per minute, 300 per IP subject per 5 minutes; the project ceilings of §8.6 |
| `get_service_status()` | `ServiceStatus` | `service_state` plus incidents in the last 72 hours | | Exempt |
| `pre_request()` | (hook) | §8.6 | HTTP 429 | |

**Owner-only functions** live in `private`, run through MCP `execute_sql`, and are never granted to `anon` or `authenticated`: `declare_incident(p_start, p_end, p_kind, p_note, p_track)`, `set_service_state(p_state, p_message_id, p_starts, p_ends)`, `admin_void_round(p_track, p_daily, p_round, p_reason)`, `admin_correct_key(p_track, p_daily, p_round, p_entity, p_reason)`, `admin_add_accepted(p_track, p_daily, p_round, p_entity, p_reason)`, `admin_pull_item(p_item, p_reason)`, `admin_restore_item(p_item)`, `admin_release_pull_queue(p_item)`, `admin_takedown_quiz(p_quiz, p_reason)`, `admin_resolve_report(p_target_kind, p_target_ref, p_status)`, `admin_set_shed(p_on)`, `weekly_inputs(p_track)` (the weekly content run's inputs as one JSON document), plus the views `private.list_builder_queue` (`guess_should_count` reports grouped by answer type and guessed entity, so an alias or accepted id can follow, PRD §3.13.3) and `private.content_queue`: open reports with weights and distinct reporters, the weekly content run's exceptions and samples (alerts of kind `owner_queue`), the automatic-pull queue, alerts, the Daily runway, heartbeat gaps, refusals per rate-limit bucket and day, and free-tier usage, with the Realtime, connection and egress figures labelled as estimates (§8.1).

### 8.5 The guest identity scheme

```sql
create type private.auth_result as (player_id uuid, code text, retry_after_ms integer);
create function private.authenticate(
  p_player uuid, p_secret text, p_register boolean,
  p_context text default 'unknown', p_app text default 'none')
returns private.auth_result language plpgsql security definer set search_path = '' as $$ ... $$;
```

1. A null id or a secret that fails `^[A-Za-z0-9_-]{43}$` returns `auth_failed`.
2. `v_hash := extensions.digest(p_secret, 'sha256')`.
3. If a credential `(p_player, v_hash)` exists: touch its `last_used_at` when more than a day old and `players.last_seen_at` when more than 10 minutes old; count the call in `general_player_5m` and return `rate_limited` with its retry-after when over; clear `low_trust` once the identity is 24 hours old or has finished 2 Dailies; return the player.
4. If the player exists without that credential, return `auth_failed`.
5. If `p_register` is true: check the project ceiling `identity_all_1h` and the burst limit `identity_1m` on the IP subject (IPv4 address, or IPv6 /64), and return `rate_limited` with a retry-after and the scope that refused (`project` or `ip`) if either is over; a tripped ceiling also writes an owner alert. Then count the soft bucket `identity_soft_1h`: past it, the identity is created with `low_trust = true`. Insert the player with `on conflict (id) do nothing` and re-select, so a concurrent first write from the same device creates one player, and the loser of that race goes back to step 3. The friendly name comes from `name_parts`; ids starting `e2e2e2e2-` get `is_test`, `track = 'e2e'`, their own bucket and never low trust. A `mint` credential follows.
6. Otherwise return `auth_failed`.

**Low trust** is how an office, a campus or a carrier's shared IPv4 address keeps playing without letting one address mint a crowd. A low-trust identity plays normally and sees nothing different. Its reports weigh 0, and its first finished Daily carries flag 32, which keeps that run out of percentiles, histograms and crowd stats (PRD §4.3.6, AC-DLY-21). The mark lifts once the identity is 24 hours old or has finished 2 Dailies. A run is judged when it finishes: flag 32 goes on a ranked finish while the identity is low trust, under 24 hours old and without an earlier finished Daily, so its second finished Daily already counts (AC-IDN-06).

Adding a credential (sync or claim) prunes all but the 10 most recently used (PRD §3.10.1). The secret's plaintext only ever travels from the client to the server inside POST bodies over TLS; it is never stored or logged, and the server never sends it back. A random 256-bit secret cannot be guessed, so a plain SHA-256 is enough and costs the shared CPU almost nothing ([report 08](./research/08-technical-best-practices.md)).

### 8.6 Rate limiting in SQL

**Subjects.** Limits key on a verified credential when one exists, and otherwise on an IP subject:

- `private.client_ip()` picks the address from `request.headers` by the rule in `private.config.client_ip`, `{ "header": "x-forwarded-for", "hop": "first" }` by default, which is Supabase's documented expression ([Supabase](https://supabase.com/docs/guides/api/securing-your-api)). A missing or malformed header yields null, and all such requests share one subject.
- `private.ip_prefix(ip)` keeps an IPv4 address whole and masks IPv6 to its /64 for every bucket (PRD §8.4), the block one household or phone usually holds, since a client can rotate through its /64 at will. A client holding a wider block still meets the project-wide ceilings, and the identities it registers past the soft threshold are low trust.
- A subject is `sha256(bucket || '|' || key || salt)`, where the salt belongs to the UTC day the window **started** (`private.ip_salts`, created on first use and deleted once the following day ends, so each lives 48 hours, PRD §8.3). A day-long window therefore uses one salt from start to end and never resets when the salt rotates at midnight. Player subjects hash the player id the same way, so no table holds a raw address or player id.

**The hop rule is unverified.** Supabase documents taking the first `X-Forwarded-For` hop but doesn't say a client can't supply it. The `client-ip` contract test (the `backend-contract` workflow, with test identities) sends `X-Forwarded-For: 203.0.113.7` and calls `t_client_ip`. It fails when the chosen address is the forged one, and it reports which hops a client controls. If the first hop is forgeable, `client_ip` moves to the hop Supabase's proxy appends (`"hop": "last"`, a position from the right, or a header such as `x-real-ip`, whichever the test shows the client can't set), the test re-runs, and the verified rule goes here. **Verified rule:** not yet run; CI-0 records it.

**Layer 1, the pre-request hook.** Following Supabase's documented pattern, as a per-IP backstop:

```sql
create function public.pre_request() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_method text := current_setting('request.method', true);
  v_path   text := ltrim(current_setting('request.path', true), '/');   -- 'rpc/start_daily', with or without a leading slash
  v_limit  private.limit_result;
begin
  if v_method is null or v_method in ('GET', 'HEAD') then return; end if;
  if v_path in ('rpc/log_events', 'rpc/get_service_status', 'rpc/pre_request')
     or v_path like 'rpc/room!_%' escape '!' then return; end if;
  v_limit := private.hit_ip('general_ip_5m', private.client_ip(), 300, private.limit('general_ip_5m'));
  if not v_limit.allowed then
    perform nextval('private.refused_general_ip_5m');   -- the raise below rolls back everything else
    raise sqlstate 'PGRST' using
      message = json_build_object('code', 'rate_limited', 'message', 'Too many requests')::text,
      detail  = json_build_object('status', 429, 'headers',
                  json_build_object('Retry-After', ceil(v_limit.retry_after_ms / 1000.0)::text))::text;
  end if;
end $$;

alter role authenticator set pgrst.db_pre_request = 'public.pre_request';
notify pgrst, 'reload config';
```

The hook runs in the request's own transaction, so its raise rolls back the counter row it just updated. That is harmless for the limit, because the earlier hits are committed, but it would lose the refusal count, so the hook bumps a sequence first: a `nextval` survives the rollback [verified]. The hook has to be callable by `anon`, so it sits in `public` and in the allowlist; called directly it only counts a request. SQL-8 applies it last, so a mistake in it cannot block earlier work.

**Layer 2, per-action limits.** `private.hit(bucket text, key text, window_seconds int, max int) returns private.limit_result (allowed boolean, retry_after_ms int)` upserts one counter row per aligned window, keeps counting past the cap, and reports the time left in the window when it refuses. `hit_ip`, `hit_player` and `hit_global` build the key; `peek_*` reads without counting, for failure-only limits that must refuse before checking (sync codes, claims, wrong room codes). Every refusal returns `rate_limited` with `retry_after_ms` and `limit_scope` (`ip`, `player` or `project`), and a refused request consumes nothing: no clue, no key, no counter but the one that refused. The hourly job adds each ended window's refusals (`hits - cap`) and the hook sequence's growth to `daily_aggregates` (metric `rate_limited`, dims `bucket=<name>`), which `private.content_queue` shows per bucket and day, so the owner tunes from data.

| Action | Limit (tunable, `private.config.limits`) | Bucket | Subject |
|---|---|---|---|
| Any call through the hook | 1,000 per 5 minutes | `general_ip_5m` | IP (IPv6 /64) |
| Any authenticated call | 300 per 5 minutes | `general_player_5m` | Player |
| New identity, soft | Past 60 an hour, registered as low trust | `identity_soft_1h` | IP (IPv6 /64) |
| New identity, burst | Refused past 20 a minute | `identity_1m` | IP (IPv6 /64) |
| New identity, project-wide | Refused past 5,000 an hour, with an owner alert | `identity_all_1h` | Project |
| New test identity | 200 an hour | `identity_test_1h` | IP |
| Sync-code redeem | 5 failures per 15 minutes; 20 a day | `sync_fail_15m`, `sync_1d` | IP (IPv6 /64) |
| Claim | 5 created per player per hour; 10 redemptions or peeks per hour | `claim_player_1h`, `claim_ip_1h` | Player; IP |
| Challenges | 20 per player per day | `challenge_player_1d` | Player |
| Groups | 3 created per player per day; 20 joins per player per hour | `group_create_1d`, `group_join_1h` | Player |
| Rooms | 5 created per identity per hour; 10 wrong codes a minute; 150 live connections project-wide; 300 wrong codes a minute project-wide | `room_create_1h`, `room_join_bad_1m`, `room_join_bad_all_1m` | Player; IP (IPv6 /64); project |
| Quizzes | 30 saves per player per hour; 10 shares per player per day; 512 kB saved per player per day; 2 MB saved per IP per day | `quiz_save_1h`, `quiz_share_1d`, `ugc_bytes_player_1d`, `ugc_bytes_ip_1d` | Player; IP |
| Reports | 30 per player per day | `report_player_1d` | Player |
| `log_events` | 60 events per identity per minute; 300 per IP per 5 minutes; 600 rows a minute and 150,000 a day project-wide | `events_player_1m`, `events_ip_5m`, `events_all_1m`, `events_all_1d` | Player; IP (IPv6 /64); project |
| Practice uploads | 500 rows per player per day; 2,000 per IP per day; 50 new practice ids per IP per day; 3 counted answers per IP per item per day | `practice_player_1d`, `practice_ip_1d`, `practice_ids_ip_1d`, `calib_ip_item_1d` | Player; IP |
| Unauthenticated landing reads | 300 per IP per minute | `landing_ip_1m` | IP (IPv6 /64) |

**Project-wide ceilings** need no IP at all, so a client rotating addresses still meets them. When one trips, the product sheds load instead of failing open: new identities wait (`rate_limited` with the window's retry-after), `log_events` accepts batches and drops them, and joins without a seat token are slowed to one try per 5 s for the rest of the minute, while seat-token rejoins, Daily play and every authenticated player carry on.

**Payload caps.** Every RPC that takes jsonb or free text checks `octet_length` before anything else: 64 kB for `log_events` and for a whole quiz, 32 kB for `log_practice_answers`, 4 kB for `submit_report`, 2 kB for room calls and 8 kB for the rest. Over the cap is `invalid_input`.

**Write keys.** An RPC that creates a record checks `private.write_keys` first. A known `client_id` with the same function and player returns the stored `result` (the challenge code, the Group and invite, the quiz); the same key with another function or player is `conflict`. Keys are pruned after 48 hours. Rooms and claims use the device-minted token's hash, and saved quizzes `quizzes.client_id`, in the same way. A table-driven SQL test sends each creating RPC the same key twice and expects one row.

**Tests** (SQL-1 for the helpers, SQL-2 for identity): 30 registrations from one IP subject in 10 minutes all pass at normal trust, and the 61st inside an hour registers as low trust (AC-IDN-06); a 21st registration inside one minute is refused with `retry_after_ms` and `limit_scope = 'ip'`, and a tripped project ceiling refuses with `limit_scope = 'project'`; every `rate_limited` from every bucket carries a retry-after (table-driven); two IPv6 addresses in one /64 share every subject, and two /64s don't (AC-IDN-07); a forged first hop changes the subject only while `client_ip` says `first`; refusals land in `daily_aggregates` by bucket, the hook's included.

### 8.7 Time zones and "the Daily for local date D"

- **Zone.** `p_tz` must be in `private.time_zones`, copied from `pg_timezone_names` (faster to probe than the view) and refreshed by the nightly job, so tzdata updates arrive without a migration. An unknown zone falls back to `players.tz`, then `UTC` (PRD §4.4.1).
- **Local date.** `(private.now() at time zone v_tz)::date`. The device clock is never used for dates.
- **The effective today.** `private.player_today(player, tz)` returns the later of the request zone's local date and `players.max_local_date`, and raises `max_local_date` when the request's date is later. Every date-dependent RPC uses it: `start_daily`, `get_today` (with a credential), `get_streak`, `start_archive`, `start_challenge_run`, `get_archive`, `get_group_board`, `get_group_today_ranks` and `create_rematch`. A player who has been served D can never be served D-1 again, so switching to UTC-12 can't reopen yesterday as an on-time ranked Daily (PRD glossary, "Local date").
- **Zone changes.** `players.tz` holds the stored zone and `tz_since` the time it was first seen. A call whose zone gives an earlier local date than the stored zone does is a zone hop. Its play is accepted, but the attempt carries flag 16, which keeps it out of percentiles and crowd stats, and it earns streak credit only if 20 hours or more have passed since the player's previous call (`last_seen_at`); without that, `attempts.streak_credit` is false and the finish counts as `other` (§8.10). The stored zone moves to the new one at once when the new date is the same or later, and after a hop only once those 20 hours have passed. A real flight passes that test; flipping zones in settings doesn't.
- **Offset and band.** `offset_min` is the zone's UTC offset at `private.now()`; the band is 0 below -120, 1 from -120 to 239, 2 from 240 (§4.6).
- **The Daily for D.** The row in `private.dailies` with the player's track and `local_date = D`. Daily numbers satisfy `daily_number = (D - daily_epoch) + 1`, checked by a SQL test.
- **Global window of D.** Opens at `(D::timestamp - interval '14 hours') at time zone 'UTC'` (D 00:00 at UTC+14) and closes at `((D + 1)::timestamp + interval '12 hours') at time zone 'UTC'` (D+1 00:00 at UTC-12).
- **What the close does.** `begin_round`, `round_action` and `finish_attempt` compute the close from the attempt's own `local_date`. After it, the attempt converts in place before anything is judged: `ranked = false`, `kind = 'archive'`, status `active`, its resolved rounds and guesses kept. It can then never extend a streak on time or enter percentiles, and finishing it may still repair a Missed date (§8.10). The response says so (`converted: true`), and the screen relabels the run "Archive · unranked". Attempts still open at their close are marked abandoned by the hourly job (AC-DLY-22); a call on an abandoned attempt answers `stale`, and its archive tile reopens it through `start_archive` in the same way (PRD §3.1.3, AC-ARC-07). SQL tests play an action one second before the close (ranked, on time) and one second after (converted, unranked) (AC-DLY-22).
- **Final percentiles.** The hourly job stores each ranked result's `final_percentile` as its date's window closes (§8.9), not at the nightly run, so the stats page never shows a number the crowd could still move.
- **Midnight.** "Next Daily in" counts to the start of the day after the effective today in the request's zone. After a westward move that is later than the zone's next midnight, so a player already served D+1 waits for the first UTC-12 midnight after D+1 rather than being offered D again (AC-STK-07). A run started at 23:59:30 and finished at 00:03 belongs to the earlier date (AC-DLY-08).
- **Publishing and freezing.** `private.publish()` (written by SQL-3, run hourly) keeps a Daily in place for every date up to today plus 3 on every track. A scheduled Daily that can't publish (an item it names is no longer active, or it never became ready) takes the first unused spare in its date's `spare_order`; a date with no row takes the track's first unused spare. Only that track's spares are ever used, and the alert names the rules the spare breaks (CONTENT_GUIDE §10.7). It freezes rows by one rule in `private.config.freeze`: `{ "days_initial": 3, "days": 7, "switch_on": "<date>" }`, 3 days ahead until `switch_on` and 7 days after it, and only a row whose `ready` flag the release set: every item carries a passing pass D for that date against the list versions shipping then (CONTENT_GUIDE §9.9, rule 7). A Daily inside the freeze window that isn't ready stays editable and raises an alert; one that reaches its date unready can't publish, so its first spare takes the date. `switch_on` starts at `DAILY_EPOCH` plus 28 days, and the owner moves it once two calm weeks have passed, which turns CONTENT_GUIDE §10.7's "3 days ahead at first, 7 after two calm weeks" into one config value. The database alone decides what is frozen (`dailies.status` and `frozen_at`); a schedule file's authored `status` is advisory. A content release refuses to change a frozen row without `--allow-frozen`.

### 8.8 Sealed rounds in SQL

`begin_round` and `round_action` dispatch to family handlers, all in `private`. Before any handler runs, the attempt converts if its window has closed (§8.7), and the round's void flag is checked.

| Handler | Does |
|---|---|
| `choice_source(attempt, round)` | Returns a choice round's question by the attempt's kind: `choice_source_sealed` (SQL-4) reads `private.sealed_questions`; `choice_source_quiz` (SQL-15) reads the attempt's quiz version. SQL-4 creates both, the second as a stub that answers `not_found`, so SQL-15 replaces only its own function |
| `round_open_choice(attempt, round)` | Builds the stem and options in the stored display order (`sh`; comparisons always shuffled), sets the issue time |
| `round_judge_choice(...)` | `answer { option }`: correct when `sh[option]` is the key; resolves with 1 or 0 points; a comparison's reveal carries both `value_display` strings in display order |
| `round_open_mystery(...)` | Returns clue 1, the answer type and an empty guess list; sets the issue time |
| `round_judge_mystery(...)` | §4.4.1 exactly. `guess` checks the active rows of `private.answer_entities` (`invalid_entity` for an unknown or inactive id, nothing stored) and the guess list (`already_guessed`, nothing stored); a wrong guess or `next_clue` stores the new clue's issue time and returns clue `k + 1`. From clue `options_from_clue` it returns the four options in shuffle order, labelled with `display`, or with every option's `option_label` when any display would show a bracket (§5.5), and never their entity ids; `pick` judges an option; resolution returns the full reveal |
| `round_open_encore(...)` / `round_judge_encore(...)` | Validates the number (positive, decimals, at most 15 significant digits, years 1 to 9999), computes the error, band and display string with the same rules as the engine, in exact `numeric` arithmetic (§4.6; parity tested at exactly 5% and 15%); the question carries `unit_label` and the reveal `unit_short` |

**Voided rounds are withdrawn.** Every open and judge first reads the round's `voided` flag in `dailies.rounds` (or the challenge pack's). A voided round opens already resolved: 4 points for a mystery, no error for an encore (so everyone ties on it), a `withdrawn` reveal, and the next round's meta. An attempt that was mid-round when the void landed resolves the same way on its next call, whichever of `begin_round`, `round_action`, `get_attempt` or `finish_attempt` that is. The packed state records `["w", points]`. SQL tests cover a voided mystery before it opens, one mid-round, a voided encore, and a voided last round finishing the attempt.

**On every resolution:**
- `sms = resolved_at - issued[0]`; `cms = p_client_ms`.
- `rq` is 1 for the round's `begin_round` (for round 0, the `start_*` call that opened it) plus 1 for each accepted state-changing action: a wrong guess, Next clue, a pick, an encore lock-in or a choice answer. Refused calls (`invalid_entity`, `already_guessed`, `stale`, `rate_limited`), replays of a known key and repeated `begin_round` calls never count, so no client can buy itself 400 ms per call (rows in `timing.json`).
- `hm = greatest(hm, p_hidden_ms)`: each action reports the round's hidden time so far, and the round keeps the largest. A null `p_hidden_ms` sets the missing-report mark instead.
- The hidden mark when `hm >= private.config.honest_play_hidden_ms` (5,000 at launch), so 4.9 s of hidden play in each of two rounds flags nothing and 5.0 s in one round flags the run (AC-DLY-25).
- The too-fast mark when a **typed** guess solves within `too_fast_ms` (1,500) of the clue it answered. Picks among the clue-4 options never set it: picking a recognized option in under a second is normal.

The reveal includes crowd stats from `round_stats` once `crowd_min_n` eligible runs exist, and the next round's `RoundMeta`.

**Replays rebuild their answer.** `round_actions` stores a key's attempt, round, step and intent hash, never the response. A known key returns the response rebuilt from the attempt's current state, which is the post-action state because one intent is in flight per client, and which also reflects a void that landed in between. That keeps the idempotency log small (§8.1).

`private.finish_attempt_internal(attempt)` (SQL-4) runs in the same transaction as the final action:

1. Points: the sum of round points (a voided mystery scores 4).
2. Total time: `sum(least(greatest(sms - 400 * rq, cms, 0), 900000))` (PRD §4.3.2, §4.3.3).
3. The encore error and the rank key (§4.6); a voided or missing encore counts 0 for everyone.
4. Status `finished`, the share code, then the hook chain, each hook created by SQL-4 as a no-op and replaced only by its owner: `on_attempt_finished_results` (SQL-5), `on_attempt_finished_streaks` (SQL-6), `on_attempt_finished_stats` (SQL-7), `on_attempt_finished_challenges` (SQL-11) and `on_attempt_finished_quizzes` (SQL-15). Later tickets never edit `finish_attempt_internal` itself.

What the hooks do:
- **Results (SQL-5).** Flags: 1 hidden (any round's `hm` at or over the threshold), 2 expert slot (the hardest-slot mystery solved on clue 1 after a clue-1 dwell more than 3 times the median of `round_stats.clue1_dwell_hist` once it holds 50 solves, else over 120 s), 4 too fast, 8 missing report, 16 zone change, 32 low trust (set at the finish while the identity is low trust, under 24 hours old and without an earlier finished Daily, §8.5). For ranked attempts, a `daily_results` row with `eligible = (flags = 0)`; for eligible ones, the `round_stats`, `wrong_guess_tallies` and dwell-histogram increments.
- **Streaks (SQL-6).** Ranked attempts with `streak_credit` call `private.apply_finish(player, local_date, 'on_time')`; archive attempts of a repairable date call it with `'repair'`; others change nothing (§8.10).
- **Stats (SQL-7).** `player_stats` counters, the cohort fields on a first finish, and `players.last_finish_offset_min` and `last_finish_tz`.
- **Challenges (SQL-11).** Entries' attempt ids, and a rematch's `creator_attempt_id` when its sender finishes it.
- **Quizzes (SQL-15).** Play counts and the score sum.

`finish_attempt_internal` returns `FinishSummary` with the streak delta and best-moment facts (perfect, new best with 3 or more earlier finishes, first finish, milestone, freeze earned, hardest solved on clue 1, bullseye).

### 8.9 Percentiles and crowd stats

```sql
-- inside get_daily_numbers, for the caller's finished attempt (row "me" in daily_results)
select count(*) into v_band_n from private.daily_results
 where track = me.track and daily_number = me.daily_number and eligible and band = me.band;
v_scope_band := v_band_n >= v_min_n;                  -- percentile_min_n; else use every band (PRD §4.3.4)
select count(*) filter (where rank_key < me.rank_key),
       count(*) filter (where rank_key = me.rank_key),
       count(*)
  into v_worse, v_tied, v_pool
  from private.daily_results
 where track = me.track and daily_number = me.daily_number and eligible
   and attempt_id <> me.attempt_id
   and (not v_scope_band or band = me.band);
v_n := v_pool + 1;                                    -- the player, counted once
-- v_n < v_min_n: cold start; else floor(100 * (v_worse + 0.5 * v_tied) / (v_n - 1))
```

`get_daily_numbers` answers only for a finished attempt the caller owns; anything else is `not_found`, so an archive or challenge run still in progress can't read the crowd's numbers before its own lock-in (an [SQL] test calls it on an archive attempt before the Encore). The `daily_results_rank` index makes both counts index range scans, a few milliseconds at 10,000 finishers. Flagged and low-trust players still get a percentile, because their own row is excluded from the pool either way (PRD §4.3.4). The histogram groups the same pool by points. Unranked plays (archive, challenge-only) read the same pool and return `unranked` with "You'd have beaten N%" once `percentile_min_n` eligible runs exist, and `windowOpen` while the date is still open somewhere. Crowd stats come from the `round_stats` counters with largest-remainder percentages; the most common wrong guess needs 5% of eligible wrong guesses.

**Final percentiles** are stored by the hourly job as a date's window closes, and `admin_void_round` and `admin_correct_key` recompute them for their date (§8.12). Thirty days after the close, the nightly job copies each `final_percentile` onto its attempt, keeps the date's histogram and eligible count in `daily_pools`, and deletes the date's `daily_results` rows; archive results inside the 7-day window always read live rows.

### 8.10 Streaks, freezes, repair and protected dates

`private.evaluate_streak(p_player uuid, p_tz text) returns jsonb` is the SQL twin of `evaluateStreak` (§4.11), replayed against `src/engine/fixtures/streaks.json` by generated tests. It and `private.apply_finish` both begin the same way:

```sql
insert into private.streaks (player_id) values (p_player) on conflict do nothing;
select * into v_s from private.streaks where player_id = p_player for update;
```

So every streak change for one player runs one at a time, although the home card, the streak chip, the stats page and a second tab's finish can all arrive together.

1. `T` = the effective today (§8.7); `L` = the latest `played` or `repaired` date in `player_days`.
2. For each gap date `L+1 .. T-1` with no row, skipping a date that holds a ranked attempt still open inside its window (it stays undecided, like today): protected if an incident on the player's track or `all` overlaps `[start_of_day(D, tz), start_of_day(D + 1, tz))`, or by the date-line rule of PRD §4.4.7 (the first gap date, the offset grew by 720 minutes or more since the last finish, the zone name differs from `players.last_finish_tz`, and `dateline_protected_at` is null or more than 30 days old). The first evaluation that meets it stores `dateline_candidate` and `dateline_candidate_tz` and leaves the date undecided; the next one protects the date and sets `dateline_protected_at` if its zone is the same, or clears the candidate and treats the date like any other gap date if not; else `freeze` if a streak is alive and a freeze is held; else `missed`, after which no freeze is spent in that gap. Each row goes in with `on conflict do nothing`, and a freeze is spent, and its notice written, only when `get diagnostics` reports a row count of 1, so a second evaluation in the same moment spends nothing.
3. The chain, current and best streak, repair offer (a single Missed date in its span, a chain before it, local time before `M+3 00:00`, no repair in 168 hours), `paused` (the pre-break chain count and the repair deadline, set exactly when a repair is offered), the display state (`active`, `paused` or `broken`, PRD §4.4.3 step 6) and `repair_blocked_until` are computed on every evaluation; the counters among them (`current`, `best`, the freezes) are cached in `private.streaks`.

`private.apply_finish(p_player, p_date, p_kind)`, under the same lock:
- `on_time` writes `played`. If the date already holds `freeze`, it becomes `played` and the freeze is refunded, up to 2 held; if it holds `protected`, it becomes `played`. Both can happen after a westward zone change or a gap evaluated while that date's attempt was still open.
- `repair` turns `missed` into `repaired` and records `last_repair_at`, but only if the 168-hour cap still allows it at that moment; a second repairable finish right behind the first finds the cap closed and changes nothing.
- Both increment `dailies_finished` and the freeze progress (a grant at 7 while fewer than 2 are held; progress stays 0 while 2 are held, AC-FRZ-01). Protection never spends a freeze (AC-FRZ-05), and voids and rescoring never touch streaks (PRD §3.13.4).

SQL tests beyond the generated parity rows: the evaluation run twice in one transaction spends one freeze and writes one notice; two repairable archive attempts finished back to back repair once; an on-time finish over a stored Freeze plays the date and refunds the freeze; a zone hop with and without 20 hours since the previous call; a second date-line protection inside 30 days leaves the date Missed; a jump that lasts one request protects nothing, and its date then takes a freeze or Missed; a jump without a change of zone name protects nothing (AC-STK-08).

**Outage protection.** `private.incidents` collects heartbeat gaps of 10 minutes or more (detected by cron, §8.15, track `all`), declared incidents (`declare_incident`, track `all` unless given) and `publish_failure` incidents from `no_daily` on the player's own track, so a test player's missing e2e Daily never protects a main-track streak. Players see the one-time `protected` notice on their next visit.

### 8.11 Rooms: the state machine and Realtime

| Phase | Entered by | Timing set by the server | Left by |
|---|---|---|---|
| `lobby` | `create_room` | Ends after 30 minutes idle (cron) | Host `start` with at least one seat: `read` for question 0 |
| `read` | `start` or `next` | `options_at = phase_started_at + clamp(0.25 s × words, 1.5 s, 5 s)`; `skip_read` sets `options_at` to now | `room_tick` at `options_at`: `answering`, with a hint, because phones learn the options only then |
| `answering` | tick | `deadline_at = options_at + T` (T × 1.5 when extended; a seat with extra time gets its own × 1.5 deadline); null when the timer is off | Tick after the last seat's deadline plus 500 ms, every connected seat answered, or host `reveal`: `reveal` (scores computed with `roomPoints`) |
| `reveal` | | | Host `next`: `standings` |
| `standings` | | | Host `next`: `read` for the next question, or `podium` after the last; host `pause`: `paused` |
| `paused` | Host `pause` (between questions only) | | Host `resume`: `standings` |
| `podium` | After the last standings | Ends after 10 minutes | Host `end`: `ended` |
| `ended` | Host `end`, 4 hours total, idle timeouts, or 15 minutes with the host away | Deleted after 24 hours | |

- **Lazy transitions.** `private.room_tick(room)` reads the room row without a lock. Only when a time-based transition is due does it take `for update`, check again and apply it, bump `version` and send hints, so heartbeats and state polls in a quiet room lock nothing. Every room RPC calls it first. The host screen also calls `room_host_state` at `options_at` and at the deadline plus 600 ms, so phases move on time even when every phone is idle.
- **Options stay on the server until `options_at`.** `room_player_state` and `room_host_state` return `options: null` while `private.now() < options_at`, so no client, modified or not, can read them during the read beat and answer at t ≈ 0 for the full 300 speed points (PRD §4.5.1). The read-to-answering tick sends a hint, and phones also refetch on their own timer at `optionsAt` on the server-corrected clock; the 400 ms latency allowance covers that round trip. An [SQL] test calls `room_player_state` 1 ms before `options_at` and again at it, and AC-ROM-09's network assertion covers the read beat.
- **Hints.** After each version change a phase hint goes to both topics, `room:<id>` and `roomhost:<id>`: `realtime.send(jsonb_build_object('room', id, 'v', version, 'phase', phase, 'q', question_index, 'deadline', deadline_at), 'hint', <topic>, true)`. Answer counts go only to the host topic, at most one hint a second per room (`last_host_hint_at`); in between, the host screen relies on its own state polls. Topics use the room's random id, never the join code. Clients treat hints as a reason to refetch, never as truth; the sync controller refetches at most twice a second and only for a newer version.
- **Private channels.** Hints travel on private channels ([Supabase](https://supabase.com/docs/guides/realtime/authorization)). SQL-14 adds one select-only policy for `anon` on `realtime.messages`, `using (realtime.topic() ~ '^room(host)?:[0-9a-f-]{36}$')`, and no insert policy, so a client can subscribe to a room topic it knows but never publish to one; only `realtime.send` in the database can. `postgres` can create that policy [verified]. If private channels misbehave under the gate, `realtime.ts` falls back to public topics carrying the same hints.
- **Message budget.** A phase change costs two sends: 1 plus 20 deliveries on the players' topic and 1 plus 1 on the host's, 23 messages in all. About four phase changes a question plus at most 20 coalesced count hints (40 messages) make about 130 messages a question, or about 2,000 for a 15-question game with 20 phones, so about 1,000 full games a month fit the 2M quota.
- **The per-second cap.** Every WebSocket message delivered to or sent by a client counts toward the project's 100 a second, and past it Realtime disconnects every connection in the project (`tenant_events`, [Supabase](https://supabase.com/docs/guides/realtime/limits)). One phase change in a 20-phone room is 23 events at once, so four rooms changing phase in the same second come close. `create_room` and `join_room` therefore enforce a project-wide cap of 150 live room connections (seats with a heartbeat in the last 15 s plus hosts seen in the last 60 s, PRD §8.5) and answer `full` past it, and the rooms gate measures the real behavior: ROM-4's real-backend check runs headless `realtime-js` clients in Node, 3 rooms of 20, and records peak events per second and every disconnect. If it sees one, the cap comes down before any Beta label goes on.
- **Polling.** Every 3 s while the channel is down (`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED` or a `tenant_events` disconnect) or a phase is more than 1 s overdue; every 15 s otherwise (PRD §3.8.5).
- **Presence and spacing.** Join and heartbeat RPCs, not Realtime Presence. A seat counts as connected with a heartbeat in the last 15 s. Per-seat call limits are timestamps on `room_seats` (`last_heartbeat_at`, `last_state_at`) and the host's on `rooms`, never counter rows, so a game writes nothing to `rate_counters`.
- **Host heartbeat and host away.** `room_host_state` touches `host_seen_at`, and the host screen calls it at least every 15 s. After 60 s without a host call, `host_away` turns on and phones show "Waiting for the host..." (PRD §3.8.2), with the current phase kept on screen. After 15 minutes away, the room ends.
- **Late joins.** New seats are accepted in any phase until the host locks the room. A seat that joins during `read` or `answering` scores from the next question (`first_question`), and its phone says so; a seat that joins in the lobby or between questions plays the next question in full.
- **Typed names.** With `settings.names = 'typed'`, a phone may set its own name through `room_set_name` (§8.4): the 18+ band (from the profile, or answered on the seat when the phone has none), the slur filter and 16 characters, and the host can still rename or remove the seat. Generated names stay the default (memo §6).
- **Our errors void the question (AC-ROM-04).** Each room RPC validates its input and authorizes the seat or host token first, outside any exception block, so a malformed input or a wrong token is an ordinary error and voids nothing. Only the state-changing body after that point runs inside `begin ... exception when others then ... end`: the handler records `private.rpc_errors` with the room and question and, if the room is in `read` or `answering`, adds the question to `rooms.voided`, bumps `version`, sends a hint and returns `internal` with a reference. Automatic voids are capped at 2 per game (`auto_voids`); after that the handler logs and returns `internal` without voiding, so a path validation missed can't become a "void this question" button. A watchdog in `room_tick` voids an `answering` phase still open 10 s after its last deadline plus grace, inside the same cap. A voided question scores nothing, leaves every streak counter `s` as it was, and every screen shows the notice.
- **Usage estimates.** Each send adds 1 to `rooms.hints_sent` and the live subscriber count plus 1 to `deliveries_est`; the nightly job rolls them into `daily_aggregates` as `realtime_messages_est`, and connection peaks land in `private.connection_peaks` (§8.1).
- **Fallback.** If database broadcast misbehaves under the gate, `realtime.ts` can switch to Postgres Changes on a small `signals.room_signals (topic_hash, version, phase, question_index, deadline_at)` table. It is keyed by `sha256(room id || pepper)` and kept in a schema PostgREST doesn't expose, so its rows can't be listed through `/rest/v1/`, and a subscriber without a filter sees only hashes. It joins the `supabase_realtime` publication [verified: the publication exists] with an `anon` select policy. SQL-14 writes that migration into `supabase/fallback/`, and the orchestrator applies it only if the gate needs it; private broadcast channels stay the first choice.

### 8.12 Reports and rescoring

**Weights.** A report weighs 0 unless its identity answered the item under a valid credential: for a practice item, the item's bit in `practice_firsts.auth_items`; for a sealed item, a resolved round in one of its attempts. Test and low-trust identities weigh 0, identities under 24 hours old 0.5, the rest 1 (AC-RPT-02). Thresholds count weight only from distinct IP subjects: a report from a subject already among the target's weighted reporters that day adds to the raw count and not to the weight (`report_tallies.distinct_subjects`). The stored subject is nulled after 48 hours.

| Target | Threshold | Effect |
|---|---|---|
| Practice item | Weights summing to 3.0 (three full reports or six half-weight ones; 2.5 isn't enough) | Added to `private.pulled_items`; clients exclude it on their next online load (AC-RPT-03). At most 10 automatic pulls a day project-wide; later ones wait in `private.pull_queue` for the owner |
| Daily round | 3 raw reports | `paged_at` and an alert in the content queue |
| Daily round | Weighted reports from 2% of the date's ranked players and at least 10 | `alert_at`; never an automatic void (AC-RPT-04) |
| Any item | Reports above 1% of plays | Flagged for review |
| Shared quiz | Weights summing to 3.0 | `hidden_at` set; visitors see "This quiz is being reviewed." (AC-UGS-04) |

**Practice calibration at upload.** `log_practice_answers` sets each item's bit in the player's `practice_firsts` row, and in `auth_items` too under a valid credential. A newly set bit is a first attempt. It adds to `item_stats` (attempts, correct, and the chosen option's count in source order) only when the identity already holds 20 or more rated answers, its `practice_firsts` row is at least a day old, it isn't low trust, and that IP subject has counted fewer than 3 answers on the item today (`calib_ip_item_1d`). An answer from a run in a category the player picked adds 0.5 instead of 1, because people pick what they are good at (CONTENT_GUIDE §8.6). The Monday calibration view reads `item_stats` alone and marks an item `disputed` while it has open reports or a pull, so the re-tune keeps its last estimate until the matter closes; the weekly run adds pending re-checks from the content side. So one address can't push an item past the 100-attempt re-tune threshold, and no raw answer row is ever kept.

**Voids and key corrections.**
- `private.admin_void_round` marks the round voided in `dailies.rounds`; recomputes points, encore error and rank key for every finished attempt on that date (a voided mystery scores 4; a voided encore ranks everyone equal on it); rewrites `daily_results` and the date's `player_days.points`, which the Group week tab sums; recomputes stored final percentiles; and writes a `rescored` notice for each affected player (AC-RPT-05). Attempts still in progress resolve the round as withdrawn on their next call (§8.8).
- `private.admin_correct_key` accepts only an entity that was one of the round's four clue-4 options: a distractor that turned out to be right, or the original answer when the correction adds an accepted equivalent. For any other entity it refuses, because players who picked on clue 4 never had the true answer to choose, and the round must be voided instead. It then re-checks stored guesses (the solve clue becomes the first clue at which the player guessed the corrected answer, or picked it on clue 4, AC-RPT-06), rewrites `daily_results` and `player_days.points`, recomputes final percentiles and writes `key_corrected` notices.
- `private.admin_add_accepted(p_track, p_daily, p_round, p_entity, p_reason)` adds an accepted id after play, usually from a `guess_should_count` report. It keeps the primary answer and the options, so the options rule doesn't apply, and it rescores earlier guesses of that entity the way a key correction does, with `key_corrected` notices (PRD §3.13.3).
- Percentiles, head-to-heads and Group boards read the rewritten rows. Streaks never change. Setting `service_state.content_fix_daily` shows the "We fixed a mistake in today's Daily" banner.
- SQL tests: a void before the round opens, mid-round and after finishes; a correction to a distractor; a refused correction to an entity outside the options; Group week points after each.

### 8.13 Where the slur filter runs

| Text | Client (instant feedback) | SQL (authoritative) |
|---|---|---|
| Custom nicknames | Nickname field | `set_nickname` |
| Group names and Group nicknames | Create, join and settings forms | `create_group`, `join_group`, `set_group_nickname`, `group_admin` |
| Typed room names (when the host allows them) | The phone's name field | `room_set_name` |
| Host renames in rooms | Rename dialog | `room_host_action` |
| Every quiz field and every imported row | Editor and import preview | `save_quiz` |
| Report notes | Not filtered (never shown to anyone); links stripped | `submit_report` strips links |

Room players type names only when the host turns typed names on, and then only with the 18+ band; the 13 to 17 band always picks generated names. The client matcher (`src/engine/text/moderation.ts`) and `private.text_is_blocked` use one term list (`content/safety/`) and one folding table: MOD-1 generates `private.fold_text` as a `translate()` map from the engine's folding table, so the two sides fold identically and return the same verdicts (AC-LNT-03). The term list loads on the client as a lazy chunk, only when a text field needs it.

### 8.14 Analytics ingestion

`log_events` validates each event against `private.event_dictionary` (generated from §3.12), stores it with `ts_server`, and never stores an IP address, user agent, referrer value or free text (PRD §3.16). The nightly job rolls raw events into `private.daily_aggregates` (counts per name, route group, context and day, plus the funnel and cohort views behind G1 to G18) and then deletes raw rows older than 7 days (§1.4 item 18). While a project ceiling is tripped the call accepts batches and drops them, and while shedding it answers `unavailable` (§8.1, §8.6). Server errors arrive from `src/instrumentation.ts`, whose `onRequestError` posts to `log_events` with only the publishable key, as `client_error` with kind `server` under a reserved server player id (`00000000-0000-4000-8000-000000000000`). Day-N retention, cohorts and completion come from attempts, not events (PRD §7.3). Owner-facing SQL views live in `private` and are read through MCP.

### 8.15 Scheduled jobs (`pg_cron`)

SQL-8 installs `pg_cron` as Supabase documents (`create extension pg_cron with schema pg_catalog; grant usage on schema cron to postgres; grant all privileges on all tables in schema cron to postgres;`, [Supabase](https://supabase.com/docs/guides/cron/install)) and schedules seven jobs, all short. The bodies they call, `private.hourly()`, `private.nightly()`, `private.weekly()`, `private.rooms_sweep()` and `private.publish()`, exist from SQL-1 with every hook below as a no-op, so each SQL ticket fills its own hook when it lands, and SQL-4 to SQL-7 have abandonment, final percentiles and pruning long before SQL-8 schedules anything. Until then the orchestrator runs `select private.hourly()` by hand in wave exits that need it.

| Job | Schedule (UTC) | Work |
|---|---|---|
| `qz_heartbeat` | every 5 minutes | Insert a heartbeat |
| `qz_incidents` | every 10 minutes | Turn heartbeat gaps of 10 minutes or more in the last 48 hours into `all`-track incidents (idempotent) |
| `qz_publish` | hourly at :07 | `private.publish()` (SQL-3): a Daily in place through today plus 3 on every track, from that track's spares if needed; the freeze rule (§8.7); the runway alert below 30 scheduled Dailies |
| `qz_rooms` | every 5 minutes | `private.rooms_sweep()` (SQL-13, then SQL-14): end rooms idle 30 minutes in the lobby, 4 hours in total, or 15 minutes with the host away; delete ended rooms after 24 hours; sample live connections |
| `qz_hourly` | hourly at :13 | `hourly_platform` (SQL-1: salts for days before yesterday dropped, counters older than 2 days and write keys older than 48 hours pruned, ended windows' refusals added to aggregates, `cron.job_run_details` and heartbeats kept to 7 days); `hourly_attempts` (SQL-4: idempotency keys 48 hours after their attempts end; attempts open past their close marked abandoned); `hourly_results` (SQL-7: final percentiles for windows that just closed); `hourly_ops` (SQL-8: database size, the 250 MB and 300 MB alerts, the shed switch, usage-estimate alerts) |
| `qz_nightly` | 03:17 | `nightly_platform` (SQL-1: refresh `time_zones` from `pg_timezone_names`); `nightly_players` (SQL-2: test players older than a day, expired claims); `nightly_attempts` (SQL-4: compact attempts older than 30 days; delete attempts 400 days after they end, nulling their player-day links first); `nightly_results` (SQL-7: fold `daily_results` 30 days after the close); `nightly_reports` (SQL-9: report notes after 180 days, reporter subjects after 48 hours, practice bitsets idle for 180 days); `nightly_analytics` (SQL-10: roll up, then delete raw events older than 7 days; usage estimates into aggregates); `nightly_rooms` (SQL-14); `nightly_quizzes` (SQL-15: quiz versions that no attempt, room or current quiz references) |
| `qz_weekly` | Monday 04:23 | `weekly_calibration` (SQL-9): refresh the item calibration view that the weekly content run reads |

Each job body is one call, such as `select private.nightly();`. SQL-8 writes no job body except its own `hourly_ops`. Each ticket replaces only its own hook with `create or replace`, so two tickets never edit the same function. The same pattern covers attempt finishing (`on_attempt_finished_*`, §8.8), choice questions (`choice_source_*`) and room sources (`room_source_*`): the ticket that owns a dispatcher creates every hook it calls, as a no-op or a stub.

### 8.16 Migration files (`supabase/migrations/`)

The table is the plan. The files written so far carry their apply date instead: `20261104000000_baseline.sql` and `20261104000100_helpers.sql` (SQL-1), `20261104000200_platform_jobs_attended.sql` (SQL-1, attended) and `20261104000300_api_surface_owner_only.sql` (SQL-1, owner only), `20261104000400_identity.sql` and `20261104000500_identity_attended.sql` (SQL-2; the second is attended), `20261104000600_content.sql` (SQL-3) and `20261104000700_moderation.sql` (MOD-1). A later ticket takes the next free number after the last file, not its planned name.

| File | Ticket | Contents |
|---|---|---|
| `20261031000000_key_escrow.sql` | CNT-0 | The `private` schema (idempotent, with its revokes) and `private.key_escrow` with RLS and its deny-all policy |
| `20261101000000_baseline.sql` | SQL-1 | Default-privilege revokes, the `pg_graphql` drop and the OpenAPI setting, config, allowlist, time zones, salts, counters and the refusal sequence, write keys, error log, alerts, aggregates, the egress and connection samples |
| `20261101000100_helpers.sql` | SQL-1 | `private.now`, `ok` (with the 1% response-size sample), `err`, `clean_text`, `strip_links`, `redact`, `valid_tz`, `client_ip`, `ip_prefix`, `salt_for`, `hit`, `hit_ip`, `hit_player`, `hit_global`, `peek_*`, `limit`, the write-key helpers, `crockford`, `random_token`, test helpers; the job bodies and every hook of §8.15 as no-ops |
| `20261101000200_identity.sql` | SQL-2 | Players (with the zone and trust columns), credentials, sync codes, claims, name parts (with a small starter list), `authenticate`, identity RPCs, `t_client_ip`, `nightly_players` |
| `20261101000300_content.sql` | SQL-3 | Content tables (answer entities with option labels and the active flag, spares by track, challenge packs), `verify_release`, `publish` |
| `20261101000400_attempts.sql` | SQL-4 | Attempts, idempotency keys, `player_today`, `get_today`, `start_daily`, `start_archive`, `get_attempt`, `begin_round`, `round_action` with choice rounds and `choice_source`, `finish_attempt_internal` and its hook chain, `finish_attempt`, `hourly_attempts`, `nightly_attempts` |
| `20261101000500_rounds_mystery_encore.sql` | SQL-5 | Mystery and encore handlers, withdrawn rounds, honest-play flags, `on_attempt_finished_results`, `daily_results`, crowd counters |
| `20261101000600_streaks.sql` | SQL-6 | Player days, streaks, notices, incidents, `evaluate_streak`, `apply_finish`, `get_streak`, `ack_notices`, `on_attempt_finished_streaks` |
| `20261101000700_results_stats.sql` | SQL-7 | `get_daily_results`, `get_daily_numbers`, `get_archive`, `get_my_stats`, `player_stats`, `daily_pools`, `on_attempt_finished_stats`, `hourly_results`, `nightly_results` |
| `20261101000800_ops.sql` | SQL-8 | Heartbeats, service state, `get_service_status`, owner functions for incidents and shedding, `hourly_ops`, `pg_cron` and the job schedule |
| `20261101000900_pre_request.sql` | SQL-8 | `public.pre_request` and the `authenticator` setting |
| `20261101001000_reports_practice.sql` | SQL-9 | Reports, tallies, pulled items and the pull queue, hearts, practice bitsets, item stats, their RPCs, void, key-correction and accepted-id functions, `list_builder_queue`, `weekly_inputs`, `nightly_reports`, `weekly_calibration` |
| `20261101001100_analytics.sql` | SQL-10 | Event dictionary and events tables, `log_events`, `nightly_analytics` |
| `20261101001200_moderation.sql` | MOD-1 | Terms, allowlist, generated `fold_text`, `text_is_blocked`, `set_nickname` (the reviewed name lists load as seed data) |
| `20261101001300_challenges.sql` | SQL-11 | Challenges, entries, challenge RPCs, `start_challenge_run`, `start_pack_run`, `on_attempt_finished_challenges` |
| `20261101001400_groups.sql` | SQL-12 | Groups, members, removal records, Group RPCs including `get_group_today_ranks` and deletion |
| `20261101001500_achievements.sql` | MAS-1 | Achievements table, `record_achievements` |
| `20261101001600_rooms_core.sql` | SQL-13 | Rooms, seats, create, join, heartbeat, state, `room_set_name`, lobby host actions, `room_source` with `room_source_pack` and the `room_source_quiz` stub, the lobby part of `rooms_sweep` |
| `20261101001700_rooms_game.sql` | SQL-14 | Answers, `room_tick`, phases, scoring, voids, hints and the private-channel policy, the rest of `rooms_sweep`, `nightly_rooms`; the `room_signals` fallback kept in `supabase/fallback/` |
| `20261101001800_quizzes.sql` | SQL-15 | Quizzes, quiz versions and the attempts foreign key, their RPCs, `start_quiz_run`, `choice_source_quiz`, `room_source_quiz`, `on_attempt_finished_quizzes`, `nightly_quizzes`, takedown |

Data loads are not migrations. `supabase/seed/*.sql` (committed: answer entities, practice item ids, config, moderation terms, name parts, the analytics dictionary, the e2e track) and `supabase/.generated/content-release-*.sql` (sealed, never committed) are applied through `execute_sql` and recorded in `private.content_releases`.

**Who applies what.** A SQL ticket proves its migration with a dry run: through `execute_sql` it runs `begin;`, the migration, its tests, and `rollback;` (Postgres DDL is transactional, so nothing persists). After the merge, the orchestrator applies each new file with `apply_migration`, using the file's stem as the name, in file order, then re-runs the area's tests and the advisors (`get_advisors` for security and performance), diffing the findings against `supabase/expected-advisors.json` (§8.2). `scripts/sql/drift-check.ts` compares the repo's file list with `list_migrations` output pasted into it. Applied migrations are never edited; fixes are new files. Then the orchestrator regenerates `src/lib/supabase/database.types.ts` with `generate_typescript_types`.

### 8.17 SQL tests, test identities and the e2e track

- **Clock.** `private.now()` returns `current_setting('qz.now', true)::timestamptz` when that setting is non-empty and `session_user = 'postgres'` (MCP sessions and cron), else `now()`. PostgREST sessions run as `authenticator`, so clients can never move the clock. Tests call `set_config('qz.now', '2026-11-01T23:59:30Z', true)` between steps, and set `request.headers` the same way to simulate client addresses.
- **Shape of a test.** `supabase/tests/<area>/<name>.test.sql` is one transaction: `begin;`, setup through `private.t_player(seed)` (a deterministic test player and secret), `do $$ ... assert ...; $$;` blocks that call the public RPCs (optionally after `set local role anon` to prove grants), `select 'PASS <AC id> <name>';`, `rollback;`. A failed `assert` raises, so the MCP call reports the failure. Tests of production limits use ordinary player ids inside the rolled-back transaction, since test ids have their own buckets.
- **Generated parity tests.** `npm run sql:gen` turns the engine fixture tables (§4.13) into `supabase/tests/generated/*.test.sql`; committed and drift-checked like content outputs.
- **Standing checks** (SQL-1, re-run by every SQL ticket): RLS enabled, and a deny-all policy present, on every table in `private`; no table with `FORCE ROW LEVEL SECURITY`; nothing in `public` executable by `anon` outside `private.rpc_allowlist`; nothing in `private` executable by `anon` or `authenticated`; every function in `public` and `private` has `search_path` set to empty, and every `public` function is SECURITY DEFINER; `postgres` owns every table, sequence and function in both schemas; `pg_graphql` is not installed.
- **AC-DAT-02 in full.** After `delete_player`, a scan of every `uuid`, `text`, `bytea` and `jsonb` column of every table in `private`, `rpc_errors.detail` included, finds no trace of the player id in text or byte form; `rate_counters` and `reports.ip_subject` hold only salted hashes.
- **Running them.** `npm run sql:bundle -- --area daily` prints one combined script per area for an agent to paste into `execute_sql`. Results go into the ticket's pull request description and, before launch, into the launch report.
- **Test identities.** Player ids starting `e2e2e2e2-` are test players: `track = 'e2e'`, excluded from every statistic and aggregate, unable to join a `main` Group or challenge, weightless in reports, and deleted after a day. They play the `e2e` content track, which `supabase/seed/e2e-track.sql` fills from `content/fixtures/` for every date from 1 November 2026 to 31 December 2028; its spares, incidents and publish failures stay on that track. Anyone can become a test player, which only sandboxes them; that is why the real-backend CI job needs no secret and never shows real sealed content in public CI artifacts.

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
- **Restore** (`/restore`): mint a new secret locally, call `redeem_sync_code(code, newSecret)`, then replace the local identity (`source: 'sync'`) and post the cookie. If the device already has progress (`registered` is true or local history is not empty), show the confirm step first; cancelling keeps the device's identity (AC-SYN-06). There is no merge in v1, and practice history, mastery and the review queue stay on the device they were made on, which the restore and claim copy says (PRD §1.4).
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
offer card "Keep my streak" --> create_claim(token)
   token minted here (43 chars, 10 min, hashed)
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

### 9.7 Under 13 (`src/features/age/under13.ts`, SET-1)

An Under 13 answer at any of the five moments (PRD §3.10.6) runs one sequence and is never undone on that device:

1. If the device holds a registered identity, call `delete_player` with it first. When the server can't be reached, `qz:under13` keeps the player id and secret as `pendingDelete`, the call is retried on the next online load, and both are dropped the moment it succeeds.
2. Call `DELETE /api/identity` to expire the backup cookie.
3. Clear every `qz:` key and the outbox except `qz:settings` (display preferences, which carry no identifier), then write `qz:under13`.
4. From then on `getBackend()` returns a refusing backend: every method resolves `unavailable` without a request, `track()` drops events, and the practice uploader stays off. The Daily card, the Group, challenge-name, reminder, quiz-sharing and room-name moments show "[Name] is for players aged 13 and over. You can still play Practice on this device.", and the age question never offers itself again.

Nothing is sent for the answer itself: `age_band_set` fires only for 13 to 17 and 18 or over. A Playwright spec (AC-AGE-04) answers Under 13 on a registered profile, checks the SQL scan for the player id, the expired cookie and empty storage, then plays a session of Practice online and asserts the network log holds no RPC and no `log_events` call.
---

## 10. Rendering, routing, PWA, security and performance

### 10.1 Routes

"Shell" means a prerendered static shell whose data loads in a client island. Per-user paths have no dynamic segment at all: they are rewritten onto one static shell page each (below), and the island reads its param through `usePathParam()` (below). Only `/daily/[number]` (one value a day, shared by everyone), `/categories/[slug]` and `/s/[number]/[code]` keep real dynamic segments, read only inside `<Suspense>` ([verified] Next 16 dynamic-routes docs).

| Route | Group | Rendering | Suspense | Data | Owner |
|---|---|---|---|---|---|
| `/` | `(tabs)` | Static shell; islands from home slots | Tab-bar active marker | Backend after first paint | CORE-0b, slot owners |
| `/daily` | `(play)` | Shell | none | `sealed.start({ kind: 'today' })` on mount | DLY-1, DLY-2 |
| `/daily/[number]` | `(play)` | Shell | Island reading params | `sealed.start({ kind: 'archive' })` | ARC-1 |
| `/daily/[number]/results` | `(play)` | Shell | Island reading params | `daily.results`, `daily.numbers`, `groups.todayRanks`; a ranked or repairing challenge run lands here with the head-to-head card | DLY-3 |
| `/archive` | `(tabs)` | Shell | none | `daily.archive` | ARC-1 |
| `/practice` | `(tabs)` | Static; category grid server-rendered from generated modules | none | none until Start | PRA-2 |
| `/practice/run`, `/practice/results` | `(play)` | Shell | none | Packs from the CDN or cache | PRA-1 |
| `/practice/blitz`, `/practice/survival` | `(play)` | Shell | none | Packs | BLZ-1 |
| `/practice/review` | `(play)` | Shell | none | Local review queue | REV-1 |
| `/challenges` | `(tabs)` | Shell | none | `challenges.shelf` | CHL-1 |
| `/c/:code`, `/c/:code/result` | `(landing)` | Rewritten to `shell/challenge` and `shell/challenge-result` | none | `challenges.landing`; `headToHead` for unranked runs | CHL-1 |
| `/c/:code/play` | `(play)` | Rewritten to `shell/challenge-play` | none | `sealed.start({ kind: 'challenge' })`. On finish, a run whose attempt kind is `daily`, or which repaired the streak, goes to `/daily/[number]/results`, where the stop screen shows the head-to-head card fed by `get_head_to_head` and every offer card, the in-app claim included; any other run goes to `/c/:code/result` | CHL-1 |
| `/s/[number]/[code]` | `(landing)` | Stateless: a Server Component decodes params; `generateMetadata` reads params | The decoded grid | None, the URL only | SHR-2 |
| `/s/[number]/[code]/opengraph-image` | | Stateless image route | | None | SHR-2 |
| `/g`, `/g/new` | `(tabs)` | Shell | none | `groups.list` | GRP-1 |
| `/g/:groupId`, `/g/:groupId/settings` | `(tabs)` | Rewritten to `shell/group` and `shell/group-settings` | none | `groups.board` (refetch on focus and visibility) | GRP-1 |
| `/j/:code` | `(landing)` | Rewritten to `shell/group-invite` | none | `groups.preview` | GRP-1 |
| `/me` | `(tabs)` | Shell | none | `stats.get` plus device data | STA-1 |
| `/me/achievements` | `(tabs)` | Shell | none | Stats and device data | MAS-1 |
| `/me/sync` | `(tabs)` | Shell | none | Device | IDN-2 |
| `/restore` | `(landing)` | Shell | none | `identity.redeemSyncCode` | IDN-2 |
| `/claim/:token` | `(landing)` | Rewritten to `shell/claim`, so no token ever sits in a cached page | none | `identity.peekClaim` | IDN-2 |
| `/settings` | `(tabs)` | Static shell | none | Device | SET-1 |
| `/host` | `(host)` | Shell; `notFound()` when `rooms` is off | none | | ROM-2 |
| `/host/:roomId` | `(host)` | Rewritten to `shell/host-room` | none | `rooms.hostState`, `subscribe` | ROM-2 |
| `/join` | `(landing)` | Static shell | none | | ROM-3 |
| `/join/:code`, `/room/:roomId` | `(landing)`, `(play)` | Rewritten to `shell/join` and `shell/room` | none | `rooms.join`, `playerState`, `subscribe` | ROM-3 |
| `/create`, `/create/new` | `(tabs)` | Shell; `notFound()` when `editor` is off | none | Drafts, `quizzes.listMine` | EDT-1 |
| `/create/:quizId` | `(tabs)` | Rewritten to `shell/editor`; `notFound()` when `editor` is off | none | Drafts, `quizzes.listMine` | EDT-1 |
| `/create/import`, `/create/help/import` | `(tabs)` | Shell; help page fully static | none | | EDT-2 |
| `/q/:code`, `/q/:code/result` | `(landing)` | Rewritten to `shell/quiz` and `shell/quiz-result`, `noindex` | none | `quizzes.landing` | EDT-3 |
| `/q/:code/play` | `(play)` | Rewritten to `shell/quiz-play`, `noindex` | none | `sealed.start({ kind: 'quiz' })` | EDT-3 |
| `/categories/[slug]` | `(tabs)` | Fully static (`generateStaticParams` over the 12 slugs) | none | Generated modules | CAT-1 |
| Seven legal and trust pages | `(info)` | Fully static | none | none | LGL-1 |
| `/offline` | root | Static | none | none | PWA-1 |
| Not found | root | Static | none | none | LGL-1 |
| `/api/identity`, `/api/restore` | | Request-time route handlers | | Cookie only | IDN-1 |
| `/manifest.webmanifest`, `/sitemap.xml`, `/robots.txt` | | Static metadata routes | | | PWA-1, LGL-1 |
| `/sw.js` | | `public/sw.js`, generated after `next build` | | | PWA-1 |

Indexable routes are `/`, `/practice`, `/categories/*` and the legal pages; everything else exports `robots: { index: false }` through `noindex()` in `src/lib/metadata.ts`, and the sitemap lists only indexable routes (AC-UGS-02). Every link we generate is path-only.

**Rewrites.** With Partial Prefetching on, a URL whose params aren't in `generateStaticParams` gets the App Shell, then a background render stored in the ISR cache [verified], so every claim token, challenge code, invite, Group, room and quiz would cost a function render and an ISR write on Hobby, and claim tokens would persist in cached pages. Those shells' server output never depended on the param, so `next.config.ts` (CORE-0b) maps each pattern onto one static page under `shell/`: `/c/:code`, `/c/:code/play`, `/c/:code/result`, `/j/:code`, `/claim/:token`, `/g/:groupId`, `/g/:groupId/settings`, `/room/:roomId`, `/host/:roomId`, `/join/:code`, `/q/:code`, `/q/:code/play`, `/q/:code/result` and `/create/:quizId`. `rewrites()` returns a plain array, which Next applies after the filesystem, so real pages such as `/g/new`, `/join` and `/create/import` still win. The address bar keeps the original path; the island reads the param with `usePathParam(source)` from `@/features/shell/client`, over the pure `matchPathParam` in `src/platform/path-param.ts`. It is null on the server and during hydration, so server and client HTML match, and it follows the router's pathname afterwards: every id of a pattern resolves to the one segment its shell lives at, so Next reuses the mounted island when `/g/A` pushes `/g/B`, and keeps it mounted but hidden (`<Activity>`) behind another tab, then shows that same copy at the next id or on Back. A read of `location.pathname` in a mount effect would keep the first id, so islands reset per-id state when the value changes, or key themselves by it [verified on the production build, `e2e/routing/rewrites.spec.ts`]. Typed routes include rewrite sources [verified], so `/c/${code}` links still type-check. One precached shell per pattern also serves these routes offline (§10.7). A shell opened at its own `/shell/...` address finds no param and shows that feature's invalid-link copy. `/s/[number]/[code]` and its image keep real dynamic segments, because caching per URL is exactly what helps there.

### 10.2 Cache Components rules we follow

1. Request data (`params`, `cookies()`, `headers()`) is read only inside `<Suspense>`, and only on `/s/[number]/[code]` and in route handlers.
2. Client hooks that read the URL (`useParams`, `usePathname`, `useSelectedLayoutSegment`) sit inside `<Suspense>`. The tab bar renders without its active marker as the fallback, because a shared layout's `usePathname` suspends while any route below it has unknown params [verified].
3. `useSearchParams` is not used anywhere (no query strings).
4. No `Date.now()`, `Math.random()` or `crypto.randomUUID()` in Server Components or module scope; client components call them only in effects and handlers, so server and client HTML match.
5. No route segment config exports (`dynamic`, `revalidate`, `runtime`), no `proxy.ts`, no `experimental.useOffline` (the service worker owns offline). The one exception is `ensureStatic`, on the route-group layouts (CORE-0b) and, if DS-1 wants it, `'shell'` on the root layout, since a group may be stricter than the root but never weaker. `(tabs)`, `(host)` and `(info)` set `'navigation'`, the only level Next validates: `next dev` and `next build` fail on runtime data, uncached data or a short-lived cache anywhere in the route, even inside `<Suspense>`, and on a dynamic segment without `generateStaticParams` (`/categories/[slug]` lists its 12 slugs). `(play)` and `(landing)` set `'shell'`, because `/daily/[number]`, `/daily/[number]/results` and `/s/[number]/[code]` read params; `'shell'` only keeps the App Shell that a default `<Link>` prefetches static and adds no build validation, so in those two groups review keeps request data out (rule 1) [verified: `ensureStatic` docs].
6. **Hidden routes stay mounted** in `<Activity>`. Timers live in effects with cleanup and rebuild from absolute deadlines (`countdownEndsAt`, room `deadline`); Realtime subscriptions, BroadcastChannel listeners and visibility trackers are effects; audio pauses in cleanup; controllers keep state outside React, so a re-shown game screen resumes exactly where it was. Route visibility is not page visibility: the honest-play tracker reads `document.visibilityState` and window blur only.
7. Server data fetching with `"use cache"` is not needed in v1: game data is client-side, and content modules are static imports.
8. Rewritten shells (§10.1) read their param through `usePathParam()`, never through `useParams()` (they have no dynamic segment) and never once on mount (the shell instance is reused for every id).

### 10.3 The root layout and the boot script

`src/app/layout.tsx` (DS-1) renders `<html lang="en" suppressHydrationWarning>` with an inline script in `<head>`, following Next's flash-prevention guide (`node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`). The script (under 600 bytes) reads `qz:settings` inside try/catch and sets `data-theme`, `data-motion`, `data-readable` and `data-contrast` on `<html>` before first paint. A tiny client component re-applies them in `useLayoutEffect` to survive React's development remount. The layout also loads the two font families through `next/font/local` with `display: 'swap'`, renders the skip link, and mounts one app-wide pair of live regions (polite and assertive) used through `src/ui/announce.ts`. There are no context providers at the root: islands reach the backend, settings and identity through module singletons, which keeps the shared bundle small.

**The Daily card's date slot.** The home card's heading is static text. "Daily #42 · Sunday 1 November" goes in a fixed-width slot (`<span id="qz-daily-slot" suppressHydrationWarning>`) with a placeholder of the same width, and a second inline script placed right after the slot fills it from `DAILY_EPOCH` and the device's local date before first paint, using `formatToParts` as the engine does. On a client navigation to Home the card's island fills it on mount. The prerendered HTML therefore holds no date, hydration changes nothing, and the slot's width keeps CLS at zero (§1.4 item 9, §10.9).

### 10.4 Share landings and preview images

- **`/s/[number]/[code]`** decodes the code with `decodeShareCode` on the server, inside `<Suspense>`. Valid codes render the grid, "Someone scored 9/12 on Daily #42" and one primary button, "Play today's Daily", which links to `/daily`. An island compares the reader's own local Daily number with the link's ("Your Daily today is #41. #42 unlocks at midnight your time.") and, if the reader already finished today, shows "You scored 10/12 today" from the cached home card. No database call, so it renders with the database paused or the backend `off` (AC-SHR-06). Tapping Play stores the link's number and code in session storage (`qz:share-origin`), so the stop screen can show "vs the result you opened" (PRD §3.1.6 item 1) through SHR-2's comparison card.
- **`generateMetadata`** reads params and returns the title, description and `robots: { index: false }`. With Cache Components this defers metadata to request time, which is allowed because the page body also reads params [verified, generate-metadata docs]. Link-preview bots that cannot run scripts (WhatsApp, facebookexternalhit, Twitterbot, which also matches Telegram's agent, Slackbot, Discordbot) receive blocking metadata from Next's default `htmlLimitedBots` list [verified]; we keep the default rather than replace it.
- **`opengraph-image.tsx`** uses `ImageResponse` from `next/og` in the default Node runtime: 1200 by 630, the wordmark, "Daily #42", the score, the grid and the encore token, never an answer. One subset TTF font (Satori cannot read woff2) is read once at module scope. The response sets `Cache-Control: public, max-age=31536000, immutable` and `CDN-Cache-Control: public, s-maxage=31536000, immutable`, because the URL fully determines the image; `max-age` alone governs only the browser. After the first push to main, SHR-2's check fetches one image twice from the deployment and expects the second response to be a CDN hit (`x-vercel-cache: HIT`); the result goes in the launch report. Malformed codes get a generic image. A build check keeps every image under 500 kB (AC-SHR-07) and a test scans 200 generated results for answer text (AC-SHR-02).

### 10.5 Feature flags and Beta routes

`NEXT_PUBLIC_FEATURES` is a comma-separated list parsed by `env-parse.ts` (PLT-1) into `env.features`; unset means the defaults in `src/config/features.ts`, which composes one file per owner under `src/config/flags/` (§2.3), so each owner turns its own flags on without touching another's lines. Flags: `rooms` and `editor` (off until their gates pass), and the Should features `blitz`, `survival`, `review`, `mastery`, `achievements`, `calendar`, `install_pitch`, `category_pages`, `monthly_pack`, `read_aloud`, `readable_text`, `high_contrast` (on once built). Adaptive Mixed has no flag, since the PRD moved it to Later. `isFeatureEnabled(flag)` comes from `@/lib/env`. Beta route modules call `notFound()` when their flag is off; the value is fixed at build time, so the page prerenders as the not-found page (AC-ROM-13). Home slots, achievements (AC-ACH-03) and settings rows check the same flags. Server-side, `private.config.features` makes `create_room` and `save_quiz` return `feature_disabled` when off, and a room's `names` setting gates `room_set_name` the same way.

### 10.6 Connectivity and the health monitor (`src/platform/network.ts`, INC-1)

- `navigator.onLine` plus `online`/`offline` events give the device state (`offline`).
- The backend reports every transport failure. Two failures within 30 s while the browser says it is online put the app in `unreachable`; the monitor then retries `get_service_status` after 5, 15, 30 and 60 s, and a success clears the state (AC-INC-02).
- `get_service_status` runs on load, every 5 minutes while the page is visible, and after any failed RPC. Its `state` drives the banners of PRD §3.15.2. A banner known at load renders in place; one that appears later slides in as a fixed overlay, so nothing shifts (AC-INC-05).

### 10.7 PWA: manifest, service worker, offline and updates

**Manifest** (`app/manifest.ts`): name and short name from the brand constant, `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, background and theme colors from the design tokens (with `<meta name="theme-color" media="(prefers-color-scheme: dark)">` for the dark theme), icons at 192 and 512 px plus a maskable 512, an Apple touch icon at 180 px, `categories: ['games', 'entertainment']`.

**Building the worker.** `npm run build` becomes `next build && node scripts/pwa/build-sw.mjs`. That script computes the precache list and runs `@serwist/cli` 9.5.13's `build` (which bundles `src/pwa/sw.ts` with esbuild) into `public/sw.js`. `next start` reads `public/` at server start [verified], and Vercel collects `public/` after the build command, so the worker ships with the deployment. PWA-0 proves the chain locally in Wave 2: `next build`, `serwist build` and `next start`, then a Chromium spec confirms the worker registers and serves the practice shell offline. The deployed check follows the first push to main, because Vercel preview deployments may sit behind deployment protection. If either fails, `src/pwa/sw-fallback.ts` is bundled by esbuild directly, with the same contract and tests.

**Precache** (revisioned by the build id):

| Entry | Source |
|---|---|
| First-load JS and CSS of every offline route (`/`, `/practice`, `/practice/run`, `/practice/results`, `/practice/blitz`, `/practice/survival`, `/practice/review`, `/me`, `/me/sync`, `/settings`, the legal pages, `/offline`, and the editor routes when `editor` is on) | The union of `firstLoadChunkPaths` in `.next/diagnostics/route-bundle-stats.json` [verified file and format] |
| Every lazy chunk reachable from the play routes: the backend chunk and Supabase SDK, confetti, `inapp-spy`, the moderation term list, the sound sprite decoder | The build's chunk graph from `.next/diagnostics` [verified file], walked from each play route's first-load chunks |
| Those routes' HTML shells, plus one shell per rewritten pattern (§10.1) | Fetched by the worker at install |
| Fonts, the sound sprite, icons | `public/` |
| All 12 practice packs (400 kB gzipped budget) | The content manifest |

**Runtime rules**, in order:

1. Never touch `/api/*` or any cross-origin request (Supabase RPCs and Realtime included) (AC-PWA-03).
2. `/_next/static/*`: cache first (hashed, immutable).
3. `/content/*` (packs and answer lists): cache first, keeping the two newest versions of each. Their URLs are hashed, so a cached copy is never stale (§1.4 item 15).
4. React Server Component requests (`RSC: 1` header) for offline routes: network first, then the cache, then a network error. A network error makes Next fall back to a full navigation (it logs a console error [verified], which the offline E2E specs expect and allow).
5. Navigations: network first with a 3 s timeout, then the precached shell for that path, then `/offline`. Navigations to `/s/*` and `/categories/*` are cached as they happen, so a share landing opened once works offline.

**Registration** happens at idle after the first load (`requestIdleCallback`, with a 3 s fallback), with `updateViaCache: 'none'`. `/sw.js` is served with `Cache-Control: no-cache` and `Service-Worker-Allowed: /` (SEC-1 sets the headers).

**Updates never interrupt a question.** A new worker installs and waits. Home, results screens and stop screens call `useSafePoint()`, which posts `SKIP_WAITING` to a waiting worker. On `controllerchange` the page reloads only if it is on Home; on a results or stop screen the reload waits for the next navigation to Home (AC-PWA-04). `sw_update_applied` records the versions. Old caches are deleted on activation.

**Deploys during a session.** Hobby has no skew protection, so a deploy can remove chunks that a running tab still imports. Precaching every lazy chunk reachable from the play routes covers the offline case. Online, a `ChunkLoadError` or a failed dynamic `import()` marks the page stale, and the app reloads at the next safe point (Home, a results or stop screen), never mid-question; a sealed run then resumes from the server (§4.5, invariant 8).

**`navigator.storage.persist()`** is called only when `matchMedia('(display-mode: standalone)').matches`, the one context where WebKit grants it ([gap 2](./research/gap-2-web-retention-and-identity.md), AC-PWA-05).

**Offline behavior** follows the PRD §3.11.1 table: Home renders with the Daily card's offline state and Practice promoted; practice modes play fully; stats show cached server figures with "Updated 2 hours ago"; Daily, archive, challenges, Groups, rooms and shared quizzes show their offline copy with a Practice link; settings and legal pages work; the editor edits and plays drafts.

### 10.8 Security headers and the Content Security Policy

SEC-1 replaces the foundation's minimal policy in `next.config.ts` with this one (no nonces, D16). `parsePublicEnv()` supplies the Supabase origin at build time; mock and off builds allow only `'self'`.

```text
default-src 'self';
script-src 'self' 'unsafe-inline';                                   ('unsafe-eval' added in development only)
script-src-attr 'none';                                              (no inline event handlers, decisions memo §21)
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

Other headers on every response: `Referrer-Policy: no-referrer` (PRD §8.4), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=()` (Web Share and clipboard stay available). Vercel adds HSTS. Per path: `/sw.js` gets `Cache-Control: no-cache` and `Service-Worker-Allowed: /`; `/content/:path*` gets `Cache-Control: public, max-age=31536000, immutable`; `/api/:path*` gets `Cache-Control: no-store`. Vercel preview deployments inject the toolbar from `vercel.live`; only when `NEXT_PUBLIC_VERCEL_ENV` is `preview`, SEC-1 allows its sources (`VERCEL_TOOLBAR` in `next.config.ts`, after Vercel's toolbar CSP guide): `https://vercel.live` in `script-src`, `style-src`, `img-src`, `font-src`, `connect-src` and `frame-src`, plus `https://vercel.com` in `img-src`, `https://assets.vercel.com` in `font-src` and `wss://ws-us3.pusher.com` in `connect-src`. SEC-1 also evaluates `experimental.sri` and records the result. A smoke spec asserts every header on `/`, `/daily`, `/sw.js` and an API route.

### 10.9 Performance plan

**The budget is mostly spent before we write a line.** The empty foundation route ships 135.4 kB gzipped [verified], so app code on `/` gets about 14.6 kB, and play routes (budget 180 kB, PRD §8.1) get about 44.6 kB.

| Route | Budget (first-load JS, gzipped) | Our share | Enforced by |
|---|---|---|---|
| `/` | 150 kB | about 14.6 kB | `npm run check:bundle` (SEC-1 adds the routes below) |
| `/daily`, `/practice/run` | 180 kB | about 44.6 kB | same |
| Every other route | 200 kB | about 64 kB | same (a guard, not a PRD number) |

How we stay inside it:

1. **Server Components for everything static.** The home cards' text, the practice category grid, footers and legal pages are HTML, not JavaScript.
2. **Tiny islands.** Home ships the Daily card island, the streak chip, the Quick-play button and the tab-bar marker, each a few kilobytes: byte targets of 4 kB, 1 kB and 1 kB gzipped for the first three, and 1 kB for the incident banner that every header carries. Everything else loads with `import()`. Next does not code-split a Client Component that a Server Component imports, even through `dynamic()`, and `sections.tsx` imports every home slot statically, so each other slot stays a small `"use client"` wrapper that calls `dynamic(() => import('./home-card'))` itself, and a Beta slot checks its flag before that import (§2.3).
3. **No heavy client libraries.** No zod, date library, state library, CSS-in-JS or component kit in the browser. Motion uses CSS transitions, `@starting-style`, the Web Animations API and View Transitions (PRD §8.1). `motion` is not installed unless DESIGN.md demands it, and then only lazily.
4. **Lazy-only modules** carry a marker string (`__qz_lazy_<name>__`) and the bundle check fails if any marker appears in a route's first-load chunks: the Supabase SDK, the mock backend, `inapp-spy`, the confetti module, the QR generator, the CSV and Format A importer, the editor, the moderation term list, the share-image helpers, the sound sprite decoder, and the rounds' late parts (`__qz_lazy_rounds_late__`: the reveal's crowd chart and the Encore's number line, which `src/features/rounds/mystery/late.ts` loads with `import("./late-parts")` as a round arrives; a reveal shows without them and the next round asks again after a failed fetch). Two more parts load apart without a marker: the Daily's How to play sheet (`daily/screen/load-how-to-play.ts`; a failed fetch is a toast and the next press tries again) and the running time on Today's Continue card (`daily/home-clock.tsx`). The inline sheet has its own module (`src/ui/sheet-inline.tsx`), so a route that shows only an inline sheet doesn't ship the modal one.
5. **Warm the path to clue 1.** Home's Play button is a `<Link prefetch>` to `/daily`; at idle after first paint, `prefetchBackend()` loads the backend chunk and SDK so the first tap only waits for `start_daily`. The Daily's answer lists load at start, in parallel with clue 1 (PRD §3.1.3).
6. **Fast transitions.** The next round's layout arrives with each verdict (§1.4 item 2); practice judges locally, so Continue to the next stem stays under 100 ms.
7. **INP.** Answer handlers paint the pressed state in the same frame and defer scoring, sound and analytics with `startTransition`; a Playwright trace test with 4x CPU throttling keeps the answer tap handler under 50 ms (PRD §8.1).
8. **LCP and CLS.** The LCP element is the Daily card's static heading text, with preloaded subset fonts and `adjustFontFallback`; the number and date sit in a fixed-width slot filled before first paint (§10.3), so hydration changes neither the text nor the layout. Skeletons match final sizes; late banners overlay instead of pushing content.
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
| Real backend | Playwright and Vitest on GitHub runners | `e2e-real/`, `*.real.test.ts` | Every [Real] criterion, a full Daily, identity restore, a challenge, a Group, a 1 host plus 10 phone room; the forged-header client-ip check, the OpenAPI-root and GraphQL checks (§8.2, §8.6), and the Realtime load check (3 rooms of 20 headless clients, §8.11) | `e2e-real` and `backend-contract` workflows |
| Performance | `check:bundle`, Lighthouse CI, Playwright traces | `scripts/`, `lighthouserc.json`, `e2e/perf/` | §10.9 | CI |

### 11.2 Unit tests

- **Table-driven from fixtures.** Engine tests load `src/engine/fixtures/*.json` (§4.13); the same rows feed the SQL parity tests, so one fixture edit moves both.
- **Time and randomness** come from `createFakeClock` and `createRng('<literal>')`; no test sleeps.
- **Selection properties.** AC-PRA-03 runs 1,000 seeded practice plans and asserts the composition rules for each, and AC-PRA-13 checks the Mixed order over 1,000 more.
- **Copy lint (AC-STK-06).** A test scans the streak and repair copy (`src/features/streaks/copy.ts` and `src/features/archive/copy.ts`) for "lost", "don't break", "hurry", "midnight" and exclamation marks, and checks with London, New York and Sydney fixtures that every repair deadline renders as "by the end of" (or "until the end of") a weekday in the player's zone.
- **Redaction (§5.4).** The sealed validator runs over a fixture with planted failures, and the test asserts that no fixture clue, answer name, alias or numeric answer reaches stdout or stderr (CNT-1).
- **Text metrics.** `sortKey`, `wordCount` and `charCount` (§4.12) have table tests, BC and AD dates and mixed forms included, shared by the content lint's fixtures.
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
  - Gate additions (ROM-4): the host page closes for 60 s of mock time and every phone shows the host-away notice, and 15 minutes ends the room; a phone joining mid-question scores from the next one; with typed names on, a filtered name is refused and a clean one shown everywhere, and the 13 to 17 band keeps Shuffle; ten wrong codes in a minute block that page's next attempt while a seat-token rejoin still goes through; options are absent from every response during the read beat.
- **Challenges in in-app browsers.** A ranked challenge run inside a WhatsApp fixture ends on the stop screen with the head-to-head card, and the in-app claim card is its offer (CHL-1).
- **Sealed assertions in mock mode** check the mock's response log, proving the contract; the real network assertions (AC-DLY-03, AC-DLY-04, AC-ROM-09, AC-UGS-03) run again in `e2e-real/` with `page.on('response')`.
- **Expected console errors.** The offline navigation fallback logs "Failed to fetch RSC payload" [verified]; offline specs remove exactly that message from `consoleErrors` and fail on anything else.

### 11.5 Accessibility

- `expectNoSeriousAxe(page)` runs `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])` and fails on any `serious` or `critical` violation. A route crawler visits every route in the §10.1 table (Beta routes with their flags on) in light and dark (`page.emulateMedia({ colorScheme })`) (AC-A11Y-01).
- `forcedColors: 'active'` and `reducedMotion: 'reduce'` emulation (Chromium), a 320 px viewport, 200% text (an injected `html { font-size: 200% }`) and the WCAG 1.4.12 text-spacing styles, each judged by the DOM clipping check of AC-A11Y-04 rather than screenshots: every visible text or interactive element inside the viewport horizontally, `scrollWidth <= clientWidth` and `scrollHeight <= clientHeight` on any of them whose overflow is hidden, and no horizontal page scroll (AC-A11Y-04, AC-A11Y-06).
- Keyboard-only journeys use only `page.keyboard` (AC-A11Y-02); accessibility-tree baselines use `toMatchAriaSnapshot` (AC-A11Y-03); target sizes are measured with bounding boxes (AC-A11Y-05).
- Real VoiceOver and TalkBack passes are beta gates, reported "not run" before then (AC-A11Y-07).

### 11.6 SQL tests through MCP

The conventions are in §8.17. Each SQL ticket ships tests for every RPC it adds: the success path, the wrong-secret path (AC-IDN-03, table-driven over every write RPC), each validation rule, each rate limit, and each [SQL] criterion in its area. The standing checks (privileges, RLS, definer settings) run with every ticket. Before launch QA-2 runs the whole suite, plus `get_advisors` for security and performance diffed against `supabase/expected-advisors.json`, and records the results in the launch report.

### 11.7 The real-backend jobs (GitHub Actions)

GitHub runners can reach Supabase; the sandbox cannot (constraints).

| Workflow | Triggers | Does |
|---|---|---|
| `backend-contract.yml` (SQL-1) | Push to any branch touching `supabase/` or `src/backend/`, nightly, manual | `QZ_REAL_BACKEND=1 npx vitest run --project contract-real`: the contract suites against the real project, in Node, with test identities. They include the `client-ip` test (SQL-2: a forged `X-Forwarded-For` must not move the limiter's subject), the OpenAPI-root check (`GET /rest/v1/` lists no functions) and the GraphQL check (`/graphql/v1` reaches no RPC) |
| `e2e-real.yml` (CI-0 in Wave 9, extended by CI-1, QA-1 and ROM-4) | Push to `main`, nightly at 05:17 UTC, manual | Builds with `NEXT_PUBLIC_BACKEND_MODE=supabase` (the built-in URL and publishable key, no secret), starts the app, runs `playwright test -c playwright.real.config.ts` on Chromium. Its fixtures allow `zcodouduyvxwefxebvmv.supabase.co` over https and wss and nothing else. Specs: a full Daily on the e2e track with network sealed assertions; sync-code restore across two contexts (AC-SYN-01); claim redemption; a challenge between two contexts; a Group join and the hidden-until-finished board (AC-GRP-06); a room with 1 host and 10 phones in separate contexts (AC-ROM-11); the Realtime load check, headless `realtime-js` clients in Node for 3 rooms of 20, recording peak events per second and disconnects (ROM-4) |
| `wikidata-enrich.yml` (ENR-1) | Weekly and manual | Fetches sitelink counts and QID candidates for the entities content references and opens a pull request to `content/answer-lists/_wikidata/` |
| `usage.yml` (optional) | Weekly, only when the owner adds a Management API token as a secret | Reads the project's real usage and opens an issue past the alert lines; otherwise the owner checks the dashboard weekly (§12.5) |
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

`playwright.config.ts` builds the project list from `E2E_ALL_BROWSERS`; CI sets it to 1 and installs one browser per matrix job: it restores `~/.cache/ms-playwright` keyed on OS, arch, ImageOS, Playwright version and browser; on a hit runs `playwright install-deps <browser>`, otherwise `playwright install --with-deps <browser>`, with apt retries and two 8-minute attempts; the sandbox never runs `playwright install` (brief). Jobs in `ci.yml` after PLT-1 and CI-1: `verify` (lint, format, typecheck, unit, content check, build, bundle budget, bundle scans), `e2e` (matrix: chromium, webkit, firefox), `a11y` (Chromium), `lighthouse` (Chromium) and `content-sealed` (only when the `QZ_CONTENT_KEY` secret exists; it also runs the cross-pool dedupe, every message through the redacting reporter of §5.4, then builds the app in a step without the key and runs `check:lazy -- --sealed`, the sealed text scan of that build, with the key).

### 11.9 Traceability

Every test that proves an acceptance criterion carries its id at the start of its title. `scripts/checks/ac-coverage.mjs` (`npm run check:ac`) lists every AC id `docs/PRD.md` defines, reads the titles of the Vitest and Playwright tests under `src/`, `scripts/` and `e2e/` and the `select 'PASS ...'` lines under `supabase/tests/`, and prints, by area, the ids no title starts with, the ids only skipped or fixme tests name, and any id the other docs name that PRD.md does not define. A title starts with an id when the id is in the run of ids that opens it ("R1-16 AC-SHR-02 ..." counts; an id in a comment or mid-title does not). It exits 0 and only reports while Beta areas have no tests; `--strict` exits 1 on any gap, `--only AC-DLY,AC-PRA` scopes it to areas, and `--json` prints the report. QA-2 turns it into a release gate: every Must criterion has a passing test or an explicit "not run" with the reason.

---

## 12. Work breakdown

### 12.1 How the plan runs

- **One ticket, one branch, one agent.** Branch `t/<ID>` from the integration branch. A ticket edits only the paths under **Owns** plus the **Touch** paths it lists. Stubs from CORE-0a and CORE-0b carry final signatures, so a ticket that needs another area's module codes against its stub and never edits it.
- **Definition of done.** `npm run check` (lint, typecheck, unit tests) passes; the ticket's E2E specs pass on Chromium; `npm run build` and `npm run check:bundle` pass; no new console errors; acceptance criteria named below have tests whose titles start with the AC id. SQL tickets add: a dry run through `execute_sql` (`begin`, the migration, the tests, `rollback`) that passes; the advisor diff against `supabase/expected-advisors.json`; recorded payload fixtures for their adapter decoders; and the result lines pasted into the pull request.
- **Machine limits.** The sandbox has 4 CPUs. Parallel tickets each set a distinct `E2E_PORT`, and the orchestrator lets only one `next build` run at a time.
- **Wave exit.** The orchestrator merges the wave's tickets in table order (PLT-1 first in Wave 2, BLZ-1 before REV-1 in Wave 15, §2.3), applies new migrations with `apply_migration` (file stem as the name), loads changed seed data, regenerates `database.types.ts`, then runs `npm run check`, the full Chromium E2E suite and the wave's exit spec. A failing exit check is fixed before the next wave starts.
- **The M1 gate.** PRD §9.3 lets a milestone's work start only after the previous exit passes, and RITE rounds need fixes between them. Persona playtests start after the Wave 1 exit and run beside Wave 2; Wave 2F holds the fixes, one round at a time; the M1 exit review closes Wave 2F, and no Wave 3 ticket starts before it passes. Playtests repeat after Wave 14.
- **Content tooling is in these tickets; content production isn't.** CNT-0 (sealing, Wave 1), CNT-1 and CNT-2 (schemas, build, lint, packets, estimator, audits, Wave 3) and ENR-1 (enrichment, Wave 4) deliver what CONTENT_GUIDE §0.3 and §11.5 need. Writing and checking run in parallel from week one, and sealed writing waits only for CNT-0. CNT-3 (Wave 5) adds the scheduler and the weekly content run.
- **Content tooling that already exists.** The content workstream began some of this tooling early: on 31 October 2026 the working tree held uncommitted scripts under `scripts/content/`, `src/content/schema/` and `src/content/pipeline/`, with commands such as `content:packet`, `content:record` and `content:decide`. CNT-0, CNT-1 and CNT-2 each start by reconciling whatever exists then with §5. Working code is kept, and a path or command name that differs from this document is either moved to the name here or renamed here first, since names are contracts.
- **Sizes** are for one developer agent: S is about 1 hour, M about 1.5 hours, L about 2 hours.

### 12.2 Waves at a glance

| Wave | Milestone | Tickets (built in parallel) | Exit check |
|---|---|---|---|
| 0 | M1 | CORE-0a, CORE-0b (0b starts from 0a's first commit) | `npm run check`, build, smoke spec; Home renders the greybox shell; every rewritten pattern serves its shell |
| 1 | M1 | PRA-1, MYS-1, DLY-1, CNT-0 | `e2e/greybox.spec.ts`: Quick play to results; a fixture Daily of three Mysteries and an Encore to the stop screen with share text; reload resumes mid-Mystery. Sealed files can be written: the ignore rules, the seal scripts and the escrowed key exist. **Playable greybox for persona playtests** |
| 2 | M1 | PLT-1 (merges first), ENG-2, DS-1, PWA-0 | Engine covers PRD §4 with every worked example; lint boundaries on; design tokens live; the service-worker spike's result recorded |
| 2F | M1 | FIX-PRA, FIX-MYS, FIX-DLY, once per RITE round | The last RITE round finds no P0 or P1 confusion. **M1 exit review: the gate to Wave 3** |
| 3 | M2 | SQL-1, CNT-1, CNT-2, IDN-1 | Baseline migration applied; content builds and lints from guide-compliant sources; backup cookie works |
| 4 | M2 | SQL-2, SQL-3, IDN-2, ENR-1 | Identity RPCs live; sealed content pipeline and e2e track loaded; sync code and claim flows on the mock |
| 5 | M2 | SQL-4, DLY-2, PRA-2, CNT-3 | Choice rounds in SQL; complete Daily screen and practice on the mock; the scheduler fills two weeks of fixture Dailies behind the freeze |
| 6 | M2 | SQL-5, DLY-3, STK-1 | Sealed Mystery and Encore in SQL; full stop screen; streak UI |
| 7 | M2 | SQL-6, ARC-1, INC-1 | Streaks in SQL; archive and repair; banners |
| 8 | M2 | SQL-7, STA-1, SET-1 | Percentiles and stats in SQL; stats and settings pages |
| 9 | M2 | SQL-8, RPT-1, ANA-1, CI-0 | Cron, health, rate-limit hook; reports and hearts; analytics; the real-backend job plays a full Daily |
| 10 | M2 | SQL-9, SQL-10, LGL-1 | Reports and analytics in SQL; legal pages |
| 11 | M2 | SEC-1, PWA-1, MOD-1 | CSP and headers; offline PWA; slur filter on both sides. **M2 exit review** |
| 12 | M3 | SHR-1, SHR-2, SQL-11 | Share text, landing and preview image; challenges in SQL |
| 13 | M3 | CHL-1, SQL-12, CI-1 | Challenge links; Groups in SQL; Lighthouse, a11y and keepalive jobs |
| 14 | M3 | GRP-1, QA-1, A11Y-1 | Groups; real-backend suite; accessibility sweep. **M3 exit review and persona round** |
| 15 | M2 Should | BLZ-1 (merges before REV-1), REV-1, MAS-1 | Blitz, Survival, review, mastery, achievements |
| 16 | M3 Should | CAL-1, CAT-1, SND-1 | Calendar reminder and install pitch; category pages and monthly pack; sound and read aloud |
| 17 | M4 (Beta) | SQL-13, ROM-1, EDT-1 | Room core in SQL; mock rooms and sync controller; quiz editor |
| 18 | M4 (Beta) | SQL-14, ROM-2, EDT-2 | Room gameplay in SQL; host screen; bulk import |
| 19 | M4 (Beta) | ROM-3, SQL-15, EDT-3 | Phones in rooms; quizzes in SQL; sharing user quizzes |
| 20 | M4, M5 | ROM-4, PERF-1, QA-2 | Rooms gate result recorded; budgets met; release checks |

### 12.3 Tickets

#### Wave 0

**CORE-0a · Contracts, engine core and backend skeleton** · L · depends on nothing
- **Scope.** Mostly transcription, and its first commit is the type files alone, which CORE-0b starts from: §3 types into `src/engine/types/` with the id parse helpers and `normalizeCrockford`; §3.12 into `src/analytics/dictionary.ts`; §7.2 into `src/backend/types.ts` and `errors.ts`. Engine core: `rng.ts`, `clock.ts`, `time/` (dates from `formatToParts`), `text/metrics.ts` (`sortKey`, `wordCount`, `charCount`), plugin types and registry (§4.4) with stub plugins and a test plugin (`rounds/testing/echo.ts`), and the full run reducer (§4.5). Backend skeleton: `getBackend`, `prefetchBackend`, the off backend, the mock composition with a memory store and stub areas, stub Supabase adapters. Platform: `storage/` (kv, schema v1, migration runner), `settings/store.ts` (full `Settings`), `clock.ts`, `server-clock.ts`, `identity/provider.ts` (interface). Config: `tunables.ts` with every PRD tunable, `shared.json`, `features.ts`. Content: `types.ts` and loader stubs. All fixture content of §5.6 (practice items, every fixture answer list with aliases and descriptors, the fixture Dailies including the AC-DLY-09 compositions, the room pack), so the three Wave 1 slices share one set of entity ids and none of them writes content. `tsconfig.json`: `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`.
- **Owns.** `src/engine/**`, `src/analytics/**`, `src/backend/**`, `src/content/types.ts`, `src/content/loaders/**`, `src/config/**` (each `src/config/flags/<file>.ts` then passes to the owner §2.3 names), `src/platform/{storage,settings}/**`, `src/platform/{clock,server-clock}.ts`, `src/platform/identity/provider.ts`, `content/fixtures/**`, `tsconfig.json`.
- **Acceptance.** Unit: an `rng` sequence fixture; `localDateOf` at UTC+14, UTC-12 and across a DST change; `globalWindow`; `dailyNumberFor`; the `sortKey`, `wordCount` and `charCount` tables (BC and AD dates, mixed forms rejected); run-machine invariants 1 to 8 with the test plugin; storage migration from a v0 fixture; kv fallback when `localStorage` throws; settings defaults; every fixture file decodes into the §3 types.

**CORE-0b · App skeleton, shell, UI primitives and stubs** · L · starts from CORE-0a's first commit
- **Scope.** The five route-group layouts as greybox; `src/features/shell/` (header, tab bar with its active marker inside `<Suspense>`, play header); Home moved to `src/app/(tabs)/page.tsx` (with the foundation's `page.test.tsx`) composing the home slots; every extension-point stub of §2.3 except those PRA-2, SET-1 and CNT-0 create, including the stop-screen comparison and Groups slots and the host-source provider; greybox `src/ui/` primitives with their full state APIs (Button; AnswerButton with pressed on `pointerdown`, commit on `click`, and every state the rounds need: idle, pressed, locked, correct, your answer, dimmed, already guessed, disabled; Card, Sheet, Skeleton, ProgressSegments, `announce.ts`); in mock builds the `track()` stub records calls in `window.__qzTrackLog`, so specs can assert events before ANA-1; a stub `isFeatureEnabled()` in `src/lib/env.ts` returning the defaults; the static shell pages under `shell/`, each re-exporting its feature's route module, and the `rewrites()` block of §10.1 in `next.config.ts`; `src/platform/{sound,haptics}` stubs; `e2e/greybox.spec.ts` as `test.fixme`.
- **Owns.** `src/features/{shell,home,rounds,offers}/**`, the stub files of §2.3, `src/ui/**`, `src/app/(tabs)/page.tsx`, `src/app/(*)/layout.tsx`, `src/app/(*)/shell/**`, `src/app/page.tsx` and `src/app/page.test.tsx` (moved), `src/platform/{sound,haptics}*`, `src/platform/path-param.ts`, `e2e/greybox.spec.ts`, `e2e/routing/rewrites.spec.ts`, `e2e/home/sections.spec.ts`, `e2e/ui/sheet-live-regions.spec.ts`. **Touch:** `src/lib/env.ts` (the `isFeatureEnabled` stub only), `next.config.ts` (the `rewrites()` block only).
- **Acceptance.** E2E: `e2e/smoke.spec.ts` passes; Home shows four tab-bar destinations with accessible names; each rewritten pattern serves its shell with the address bar unchanged, and `/g/new` and `/join` still serve their own pages. That last check runs in `rewrites.spec.ts` as soon as each page exists; none does in Wave 0, so it carries over to GRP-1, ROM-3, EDT-1 and EDT-2, whose acceptance names it. Component tests for every AnswerButton state. Build and bundle budget pass.

#### Wave 1: the playable greybox

**PRA-1 · Practice greybox** · L · depends on CORE-0a, CORE-0b
- **Scope.** The `choice` plugin, both halves (§4.4.1), with `sortKey` for ascending options and shuffled comparisons. `planPracticeRun` with bands, Mixed 4/4/2 in the PRD's position shape (AC-PRA-13), short Hard filters (AC-PRA-14), composition rules, the first-question rule and option order (seen index and denylist accepted as inputs). Practice controller: local judge, `LocalRunSnapshot` persistence and resume, run history. `ChoiceRound` component on CORE-0b's AnswerButton states: reveal at 400 ms, explanation sheet with Continue where the answers were, keys 1 to 4 scoped to the question, status announcements. Routes `/practice/run` and `/practice/results` (score, questions with verdicts, Play again). The Quick-play home slot (rendered twice, by `placement`, §2.3). The practice loader over CORE-0a's fixture pack. Its islands await `bootClient()` before reading storage, and practice imports `ChoiceRound` from `@/features/rounds/client` on its own, never through the registry, so `/practice/run` never carries the Mystery and Encore components.
- **Owns.** `src/engine/rounds/choice/**`, `src/engine/practice/**`, `src/features/rounds/choice/**`, `src/features/practice/**`, `src/app/(play)/practice/{run,results}/page.tsx`, `src/content/loaders/practice.ts`, `e2e/practice/greybox.spec.ts`.
- **Acceptance.** AC-PRA-03 (1,000 seeded plans), AC-PRA-04, AC-PRA-08, AC-PRA-13, AC-PRA-14 (engine); commit on release and scoped shortcuts (component); AC-PRA-01, AC-PRA-11, AC-PRA-12 and resume after reload (E2E).

**MYS-1 · Mystery and Encore rounds** · L · depends on CORE-0a, CORE-0b
- **Scope.** `mystery` and `encore` plugins, both halves, with `optionsFromClue` (3 and 4); the judge half labels clue-4 options by §5.5 (all four take their option labels when any shows a bracket); `encore/parse.ts`; mystery and encore scoring helpers; the suggestion engine (§4.7) with its benchmark, around CORE-0a's `normalizeName`, which deletes apostrophes and periods (§4.7 step 1). `MysteryRound`: answer-type line, the stake indicator ("4 3 2 1", "Worth 3 points now", and Next clue naming the next worth, PRD §3.1.4), clue stack, ARIA 1.2 combobox with listbox popup, Guess disabled until a selection, Next clue, stamped wrong-guess chips with focus kept in the field after a wrong guess, the keyboard-open layout tracked through `visualViewport`, clue-4 options with "Already guessed", the reveal card (answer, all four clues with "Not needed", explanation, Learn more as a Wikipedia search link, the sources line when the item has source labels, `RevealActions` slot, Continue) and the withdrawn card. `EncoreRound`: `unitLabel` beside the field, `inputmode`, the preview with `unitShort` ("You're answering 1,250 km"), inline errors, Lock in, the result line with band and the number line (PRD §3.1.5). `AnswerListHandle` over CORE-0a's fixture lists.
- **Owns.** `src/engine/rounds/{mystery,encore}/**`, `src/engine/{encore,suggest}/**`, `src/engine/scoring/{mystery,encore}.ts`, `src/engine/fixtures/{mystery-scoring,encore}.json`, `src/features/rounds/{mystery,encore}/**`, `src/features/rounds/answer-list.ts`, `src/content/loaders/answer-lists.ts`.
- **Acceptance.** Every row of PRD §4.1.7 and §4.2.4 (engine); parse failures; AC-SUG-01 to 05 (matching, typo tolerance from 5 characters, tiers, ties and exact Enter); suggestion benchmark under 4 ms; combobox keyboard behavior and announced counts, exact-Enter selection, disabled already-guessed options, the encore preview (component); AC-DLY-29 and AC-DLY-35 (component); AC-DLY-36 (engine and component).

**DLY-1 · The sealed Daily on the mock backend** · L · depends on CORE-0a, CORE-0b
- **Scope.** The persistent mock store (localStorage, Web Locks, BroadcastChannel), context and controls (`reset`, `seed`, `failNext`, `setLatency`, `inspect`, `responses`), and the `identity` (register on first write), `sealed` (start today, get, beginRound with withdrawn rounds, act with idempotency, finish; generic over plugins) and `daily` (today card, basic results) areas, using CORE-0a's fixture Dailies. Local identity minting (`src/platform/identity/local.ts`), wired into the client boot's identity step (`bootClient()` in `src/features/identity/boot.ts`: load or mint, then `configureBackend()`); every island it builds awaits `bootClient()` before touching storage or the backend. The Daily controller (run machine plus backend commands, the retry schedule, resync, announcement copy). Greybox Daily screen (header with four-segment progress and stopwatch, round area from the registry, Continue labels), greybox stop screen (score card, rounds, plain share text from `share/text.ts` linking to `/daily` until ENG-2's codes exist, Done for today), the home Daily card slot (not started, in progress, finished). Routes `/daily` and `/daily/[number]/results`. Writes and un-fixmes `e2e/greybox.spec.ts`.
- **Owns.** `src/backend/mock/{index,store,context,controls,realtime,fixtures}.ts`, `src/backend/mock/server/{identity,sealed,daily}.ts`, `src/platform/identity/local.ts`, `src/features/daily/**`, `src/engine/share/text.ts`, `src/app/(play)/daily/page.tsx`, `src/app/(play)/daily/[number]/results/page.tsx`, `src/content/loaders/fixture-daily.ts`, `e2e/daily/greybox.spec.ts`, `e2e/greybox.spec.ts`. **Touch:** `src/features/identity/boot.ts` (the identity step only).
- **Acceptance.** On the branch: the sealed area with the test plugin (a repeated key returns the rebuilt result; stale steps; idempotent `beginRound`; a voided round opens withdrawn), controller retry and resync tests. Wave exit (after PRA-1 and MYS-1 merge): AC-DLY-01, a full fixture Daily to the stop screen with share lines in order, AC-DLY-07, AC-DLY-09, and a Quick-play run.

**CNT-0 · Sealed-content safety from day one** · M · depends on CORE-0a
- **Scope.** The `.gitignore` entries `content/.sealed-plain/`, `supabase/.generated/` and `.cache/`; `scripts/content/{crypto,seal,unseal,keygen}.ts` (HKDF, AES-256-GCM with the deterministic IV of §5.4, `--verify`); `scripts/checks/secret-scan.mjs` and its CI step; `content/sealed/README.md` with the recovery steps; the stub `scripts/content/lint.ts` of §2.3; the migration `20261031000000_key_escrow.sql`. Then, as the orchestrator's step after merge: create the key with `npm run content:keygen` and escrow it through MCP at once (§5.4). Release, the content tables and `release.ts` stay in SQL-3.
- **Owns.** `.gitignore` (these entries), `scripts/content/{crypto,seal,unseal,keygen,lint}.ts`, `scripts/checks/secret-scan.mjs`, `content/sealed/**`, `supabase/migrations/20261031000000_key_escrow.sql`, `supabase/tests/escrow/**`. **Touch:** `.github/workflows/ci.yml` (the secret-scan step).
- **Acceptance.** Encryption round trip; unchanged plaintext gives unchanged ciphertext; a tampered tag fails; `git check-ignore -q content/.sealed-plain/probe.json` succeeds; the secret scan catches plaintext under `content/sealed/`; the escrow table refuses `anon` and `authenticated` and has its deny-all policy (SQL dry run); the recovery steps restore a key that `content:unseal -- --verify` accepts.

#### Wave 2: engine completeness, tooling, design system

**PLT-1 · Platform tooling** · L · depends on CORE-0a, CORE-0b; merges first in this wave
- **Scope.** ESLint layer rules (§2.2) including engine purity. It fixes lint findings only in files no other Wave 2 ticket owns, and records the rest as follow-ups that DS-1, ENG-2 and PWA-0 fix after rebasing onto it. Pinned dependencies added once: `zod` 4.6.7, `inapp-spy` 5.0.10, `@axe-core/playwright` 4.14.0, `qrcode-generator` 2.0.4, `serwist` and `@serwist/cli` 9.5.13, `esbuild`, `@vitest/coverage-v8`, `@lhci/cli`, `subset-font` 2.9.0 (for SHR-2). npm scripts for content, SQL, real-backend and performance tasks. Vitest projects (jsdom unit, Node engine, `contract-real`) and engine coverage thresholds. Playwright: projects per §11.8, service workers blocked, `pwa-chromium` placeholder, `playwright.real.config.ts` skeleton, `e2e/support/` helpers (§11.4). `ci.yml` E2E matrix. `env-parse.ts`: `NEXT_PUBLIC_FEATURES` and `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` as the app version, with tests; `isFeatureEnabled` completed. `.env.example` documents both. `.gitignore`: `public/sw.js`.
- **Owns.** `eslint.config.mjs`, `package.json`, `package-lock.json`, `vitest.config.mts`, `playwright.config.ts`, `playwright.real.config.ts`, `e2e/fixtures.ts`, `e2e/support/**`, `.github/workflows/ci.yml`, `src/lib/env.ts`, `src/lib/env-parse.ts` (and tests), `.env.example`, `.gitignore`, `scripts/checks/forbidden-imports.mjs`.
- **Acceptance.** A lint fixture importing React into `src/engine` fails; the files PLT-1 owns lint clean and the follow-ups are listed; feature-flag parsing tests; a test that `.env.example` names every variable in `PUBLIC_ENV_NAMES`; `E2E_ALL_BROWSERS=1 npx playwright test --list` shows WebKit and Firefox projects; local E2E still green on Chromium.

**ENG-2 · Streaks, ranking, rooms and share codes in the engine** · L · depends on CORE-0a; rebases on PLT-1
- **Scope.** `evaluateStreak` and `applyFinish` (§4.11) with `paused` and the `display` state, pending dates, the 30-day date-line limit and the upgrade of stored Freeze and Protected dates; ranking, `rankKey`, percentile, offset bands, largest remainder; `expectedPoints`; room points, grace window and ranking; Blitz points; head-to-head and week ranking; share codes, and the first `og/alt-text.ts` (§4.10); the fixture tables of §4.13, `timing.json` included; `content/compositions.json`; its PLT-1 follow-ups.
- **Owns.** `src/engine/streaks/**`, `src/engine/scoring/{ranking,percentile,room,blitz,social,expected}.ts`, `src/engine/share/code.ts`, `src/engine/og/**`, `src/engine/fixtures/{streaks,ranking,percentile,room-scoring,share-codes,timing}.json`, `content/compositions.json`.
- **Acceptance.** PRD §4.4.8 S1 to S13, AC-STK-08 and AC-STK-09 (engine fixtures), the `display` state on every scenario, AC-RPR-01 to 04 and AC-RPR-09, AC-FRZ-01 to 05, AC-INC-03 (engine halves), plus §4.13's own streak rows; every row of PRD §4.5.5 and the AC-ROM-08 boundaries; AC-BLZ-02; AC-CHL-05's 12 pairings; AC-DLY-20 and AC-DLY-25 (engine halves); AC-SHR-03 over 10,000 random results; share-code round trips and malformed inputs.

**DS-1 · Design system foundation** · L · depends on CORE-0b and DESIGN.md; rebases on PLT-1
- **Scope.** Tokens in `globals.css` for both themes (surfaces, semantic correct, incorrect, selected and warning, the high-contrast pair, readable text), `data-*` attribute theming, two font families through `next/font/local`, the boot script with its development re-apply and the date-slot script (§10.3), every primitive restyled to DESIGN.md (Button, every AnswerButton state of CORE-0b's API, Card, Sheet, Dialog, Skeleton, Banner, ProgressSegments, Stopwatch, Segmented control, Chip, Toast), the shell (header, tab bar, play header and `PlayFrame`, footer), focus rings, the skip link, reduced-motion and forced-colors rules, and PLT-1's follow-ups in these files.
- **Owns.** `src/app/layout.tsx`, `src/app/globals.css`, `src/app/fonts/**`, `src/ui/**`, `src/features/shell/**`, `src/platform/settings/boot.ts`.
- **Acceptance.** A token test computes contrast (4.5:1 text, 3:1 states, both themes); the boot script sets attributes from stored settings; first paint is dark when dark is stored (screenshot); the date slot is filled before first paint and hydration logs no mismatch; forced-colors emulation keeps state borders; axe clean on `/` in both themes; no horizontal scroll at 320 px; bundle budget passes.

**PWA-0 · Service-worker spike** · S · depends on PLT-1 (the Serwist pins)
- **Scope.** `next build`, `serwist build` and `next start` in the sandbox; a throwaway worker that precaches the practice shell; a Chromium spec that registers it and loads `/practice/run` offline after one visit. The result, with any fix the configurator mode needed, goes in the pull request for PWA-1. The deployed check is listed for the orchestrator after the first push to main, since Vercel previews may sit behind deployment protection.
- **Owns.** `scripts/pwa/spike/**`, `e2e/pwa/spike.spec.ts`.
- **Acceptance.** The spec passes locally in `pwa-chromium`, or the failure and the switch to the hand-written fallback are recorded.

#### Wave 2F: M1 fixes (once per RITE round)

**FIX-PRA, FIX-MYS, FIX-DLY · RITE fixes** · S to M each · depend on the round's findings
- **Scope.** After each persona round, the holders of PRA-1, MYS-1 and DLY-1 fix the P0 and P1 findings in their own areas, with copy and flow changes to the PRD and DESIGN.md recorded as follow-ups for their owners. The next round runs on the merged fixes.
- **Owns.** Each one the Owns list of its Wave 1 ticket.
- **Acceptance.** The finding's reproduction becomes a test; the last round finds no P0 or P1 confusion; the M1 exit review (PRD §9.3) signs off, which gates Wave 3.

#### Wave 3

**SQL-1 · Database baseline and RPC plumbing** · L · depends on PLT-1, the M1 exit
- **Scope.** Migrations `..._baseline.sql` and `..._helpers.sql` (§8.2, §8.6, §8.15, §8.16): the deny-all policies, `search_path` on every function, the `pg_graphql` drop and the OpenAPI setting, the limiter (subjects, salts by window start, the refusal sequence, retry-after), write keys, payload caps, redaction, `private.ok` with its egress sample, and the job bodies with every hook as a no-op. `supabase/README.md`; `supabase/expected-advisors.json`; SQL test helpers and the standing checks (§8.17); `scripts/sql/{bundle-tests,drift-check,advisors-diff}.ts`; `src/backend/supabase/{client,rpc,decode}.ts`; `src/lib/supabase/browser.ts` reduced to a re-export of the backend client, with `server.ts` and its test deleted and `@supabase/ssr` dropped; the `backend-contract.yml` workflow with the OpenAPI-root and GraphQL checks; the contract harness.
- **Owns.** Those files, `src/lib/supabase/**` (and its tests), `supabase/tests/baseline/**`, `src/backend/contract/harness.ts`, `.github/workflows/backend-contract.yml`. **Touch:** `package.json` (dropping `@supabase/ssr`).
- **Acceptance.** The dry run passes; the standing checks (RLS and a deny-all policy everywhere, no forced RLS, the `anon` allowlist, nothing in `private` executable, definer and empty `search_path` on every function, `postgres` owning everything, no `pg_graphql`); the advisor diff shows only the expected findings; `private.now()` honors `qz.now` only for `postgres`; the limiter's window, retry-after and scope, refusal counting, IPv6 /64 subjects and the salt chosen by window start; the hook bodies run as no-ops; RPC wrapper tests (envelope mapping, 429 with `Retry-After`, offline and unreachable, timeout, server-clock samples); the browser client writes no storage and no cookie, and one tab creates one client.

**CNT-1 · Content schemas and the build** · L · depends on PLT-1, CNT-0, Wave 1
- **Scope.** The zod source schemas of §5.1.1 for every file type, every CONTENT_GUIDE + field included, with status gating; the cross-file rules of §5.2 (items, mysteries, encores, comparisons, the acceptance rule, pools, packs, and the schedule rules of CONTENT_GUIDE §10.1 to §10.5); `scripts/content/{build,check}.ts` calling CNT-2's lint; the redacting reporter (`scripts/content/lib/report.ts`, §5.4); every output of §5.3, with source-only fields stripped and the list projection of §5.5; per-pack and per-list size checks; loaders switched to the generated manifest; `content/categories.json`; fixtures moved to the source formats, with the spare ids in `content/fixtures/spares/*` renamed to `spare.NN` as §2.4 names them (the fixture loader already accepts both spellings, so the rename touches content files only); generated `supabase/seed/{answer-entities,practice-items,config}.sql`; the `content:check` step and drift check in CI, with the checkout at `fetch-depth: 0` so the lists' `liveAt` can be checked against git history (§5.2).
- **Owns.** `src/content/schema/**`, `src/content/generated/**`, `src/content/loaders/**`, `scripts/content/{build,check}.ts`, `scripts/content/lib/**`, `content/categories.json`, `content/README.md`, `content/fixtures/**`, `public/content/**`, those seed files. **Touch:** `.github/workflows/ci.yml` (one step, plus `fetch-depth: 0` on the `verify` job's checkout), `src/backend/mock/fixtures.ts` (switch to the generated module).
- **Acceptance.** CONTENT_GUIDE §12's good examples pass as fixtures (their reserved ids allowed only in schema tests) and its bad examples fail on the rule each one names; good and bad samples for every other rule; a `draft` without `predicted` passes, a `checking` one fails, and an `active` item missing a confirming check fails the acceptance rule; two builds produce identical outputs; the drift check fails on a hand-edited pack; size budgets enforced, with a synthetic 3,000-entry person list under 80 KB; the redaction test of §5.4; the checks behind AC-CNT-01, 02, 03, 04 and 06, which pass on the real bank at QA-2; the Wave 1 greybox specs still pass on generated content.

**CNT-2 · Content tooling: lint, packets, estimator, audits** · L · starts from CNT-1's first commit (the source schemas)
- **Scope.** `scripts/content/lint.ts` replacing CNT-0's stub with CONTENT_GUIDE §2.13 rules C02 to C28 (C01 is CNT-1's schemas); `scripts/content/packets.ts` (blind packets for checkers and estimators, staged for every format as CONTENT_GUIDE §9.4 sets out: the list file in a mystery's first stage, claims only in the last, a hash and a timestamp per stage into `packetSha256` and `stagesServedAt`, and no stage served before the previous cold-solve entry); `scripts/content/estimate.ts` (estimator v0's runner: five angles, the logit median and spread, CONTENT_GUIDE §8.5); `scripts/content/audit.ts` (seeded audit samples with planted items, and the audit record); `scripts/content/lists/` (one importer per pinned dataset, recording provenance, behind `content:lists`); `content/reference/**` (the schemas and loaders for the guide's myths, spelling, stopwords, superlatives, capitals-excluded, units and example-denylist files); schemas for `content/batches.json`, `content/datasets/manifest.json` and the audit record; the dedupe against the bank and CONTENT_GUIDE's own examples; the myths screen.
- **Owns.** `scripts/content/{lint,packets,estimate,audit}.ts`, `scripts/content/lint/**`, `scripts/content/lists/**`, `content/reference/**`, `src/content/schema/{batches,datasets,audit}.ts`, `content/batches.json`, `content/datasets/manifest.json`.
- **Acceptance.** A positive and a negative fixture for every rule C01 to C28; byte-identical packet hashes across two runs; a seeded-audit dry run that writes and validates an audit record, the record AC-CNT-05 reads; in sealed mode every lint finding reaches the console only through the redacting reporter.

**IDN-1 · Guest identity and the backup cookie** · M · depends on DLY-1
- **Scope.** `src/platform/identity/` in full (§9.1): load, restore order, mint, `markRegistered` posting the cookie, 7-day refresh, `replace`, cross-tab broadcast, swapped into the client boot's identity step (`src/features/identity/boot.ts`, which it owns from here; the signature stays). Route handlers `/api/identity` and `/api/restore` (§9.3). Mock identity area: register and profile.
- **Owns.** `src/platform/identity/**`, `src/app/api/identity/route.ts`, `src/app/api/restore/route.ts`, `src/features/identity/boot.ts`, `src/backend/mock/server/identity.ts`, `e2e/identity/cookie.spec.ts`.
- **Acceptance.** AC-CKE-01, AC-CKE-02 (events asserted through the analytics test hook), AC-CKE-03, AC-CKE-04, AC-IDN-01, AC-IDN-05 (the mock registers 30 identities from one IP with no refusal); the registration copy of AC-IDN-04 for both scopes; route-handler unit tests in the Node environment.

#### Wave 4

**SQL-2 · Identity in SQL** · L · depends on SQL-1
- **Scope.** `..._identity.sql`: identity tables with the zone and trust columns, `name_parts` with a starter list, `authenticate` with the soft threshold, low trust, the burst limit and the project ceiling (§8.5), and every identity RPC except `set_nickname`, including `create_claim` with a device-minted token and `t_client_ip`; `nightly_players`; the identity adapter; the identity contract suite with the `client-ip` test (§8.6).
- **Owns.** `supabase/migrations/20261101000200_identity.sql`, `supabase/tests/identity/**`, `src/backend/supabase/identity.ts`, `src/backend/contract/identity.*`.
- **Acceptance.** AC-IDN-02, AC-IDN-03 (table-driven), AC-IDN-04 (server half): 30 registrations from one IP subject in 10 minutes pass at normal trust, a 21st inside one minute is refused with a retry-after and scope `ip`, and the project ceiling refuses with scope `project`; AC-IDN-06 (SQL half, with SQL-5 judging the finishes) and AC-IDN-07; low trust lifts at 24 hours or 2 finished Dailies; AC-SYN-03, AC-SYN-04, AC-IAB-04, the identity half of AC-DAT-02, credential pruning at the 11th device; two concurrent registrations of one id create one player; the `client-ip` contract test exists and runs in CI.

**SQL-3 · Sealed content tables and the release pipeline** · L · depends on SQL-1, CNT-1
- **Scope.** `..._content.sql` (answer entities with option labels and the active flag, spares by track, challenge packs, `verify_release`, `publish`); `scripts/content/{release,dedupe}.ts` (the fixed load order, the verification call, the redacting reporter); the generated `supabase/seed/e2e-track.sql`; the conditional `content-sealed` CI job (the sealed check plus the cross-pool dedupe).
- **Owns.** `supabase/migrations/20261101000300_content.sql`, `supabase/tests/content/**`, `scripts/content/{release,dedupe}.ts`, `supabase/seed/e2e-track.sql`. **Touch:** `.github/workflows/ci.yml` (one job).
- **Acceptance.** The fixture release applies in a dry run with the expected rows, content before schedule; `verify_release` fails a release whose schedule names a missing or inactive mystery, or whose mystery names an inactive distractor; frozen rows are refused; a Daily without pass D on every item never freezes and is replaced by a spare at its date; Daily numbers match the epoch; release and dedupe pass the redaction test; a gap on the e2e track never takes a main-track spare; a scheduled Daily naming a retired item publishes the first unused spare in its date's order, with an alert naming the rules it breaks; the bundle scan finds no sealed ids; AC-OPS-02 (the runway alarm at 29 scheduled Dailies and not at 30).

**IDN-2 · Sync code, restore, claim link and in-app detection** · L · depends on IDN-1
- **Scope.** `/me/sync`, `/restore` with the confirm step, the `/claim/:token` shell's route module; the claim offer (a device-minted token, replaceState, per-app instructions, Android intent link, revert after 10 minutes) and the sync offer with its triggers (§9.2); `src/platform/browser-context.ts` (§9.4); the mock identity area's sync and claim methods; copy, including the note that practice data stays on the device.
- **Owns.** `src/features/identity/**` (except `boot.ts`), `src/features/identity/offers/{claim,sync}.tsx`, `src/platform/browser-context.ts`, `src/app/(tabs)/me/sync/page.tsx`, `src/app/(landing)/restore/page.tsx`, `e2e/identity/{sync,claim,in-app}.spec.ts`. **Touch:** `src/backend/mock/server/identity.ts`.
- **Acceptance.** AC-SYN-01 (two device namespaces in one context), AC-SYN-02, AC-SYN-05, AC-SYN-06, AC-SYN-07 (the copy on the offer, the confirm step and the claim card, and empty practice figures after a restore), AC-IAB-01, AC-IAB-02, AC-IAB-03, the AC-IAB-05 checks that apply so far, expired-claim copy.

**ENR-1 · Wikidata enrichment workflow** · S · depends on CNT-1
- **Scope.** `.github/workflows/wikidata-enrich.yml` and `scripts/content/enrich-wikidata.ts`: from a runner, fetch sitelink counts for the QIDs content references and QID candidates for `x.` entities (CONTENT_GUIDE §9.5.1), write them to `content/answer-lists/_wikidata/`, and open a pull request. Until its first pull request merges, popularity stays 0 and suggestion ties fall to `display` order.
- **Owns.** Those files, `content/answer-lists/_wikidata/README.md`.
- **Acceptance.** The workflow parses; a dry run over a fixture QID list writes the expected JSON shape; the real run is reported "not run" in the sandbox, which can't reach Wikidata.

#### Wave 5

**SQL-4 · Attempts and choice rounds in SQL** · L · depends on SQL-2, SQL-3
- **Scope.** `..._attempts.sql`: attempts with the positional packed state, idempotency keys with intent hashes, `player_today` (the effective today and zone tracking, §8.7), `get_today` with chips and the played count, `start_daily`, `start_archive` with abandoned-attempt reopening, `get_attempt`, `begin_round`, `round_action` in the §8.4 order with the choice handlers and `choice_source` (with the quiz stub), the window-close conversion, `rq` counting, `finish_attempt_internal` with its hook chain of no-ops, `finish_attempt`, `hourly_attempts` and `nightly_attempts`; the `sealed` and `daily` adapters; the sealed contract suite on the e2e track's choice compositions.
- **Owns.** `supabase/migrations/20261101000400_attempts.sql`, `supabase/tests/attempts/**`, `src/backend/supabase/{sealed,daily}.ts`, `src/backend/contract/sealed.*`.
- **Acceptance.** AC-DLY-05, AC-DLY-08 (with `qz.now`), AC-DLY-22 (an action at the close minus 1 s is on time; at plus 1 s the attempt converts); a double tap of `start_daily` makes one row; a replayed key returns the rebuilt response, and a key reused for another attempt or intent is `conflict`; a switch to UTC-12 after D was served still yields D as today, and AC-STK-07 in full (`start_daily`, `get_today` and `nextUnlockAt`); a zone hop sets flag 16, with and without streak credit (AC-STK-09, SQL half); a new attempt's snapshot carries round 0's clue or stem, and that start counts as its `begin_round`; `rq` counts only accepted actions (`timing.json` rows); `stale` steps; one attempt per date; the archive window (AC-ARC-01, SQL half); no correct option before an answer; zone fallback.

**DLY-2 · The Daily screen, complete** · L · depends on DLY-1, MYS-1, DS-1
- **Scope.** Every home-card state (PRD §3.1.7: the date slot, chips, played count, the Past 7 days link, the minutes from `daily_minutes`, outage through `useServiceHealth`), the full header (exit, segments with check, cross or points, the total-time stopwatch with a persisted hide control, first-Daily hints), "How to play" and `how_to_play_open`, the stake indicator wired to the run, resume, lost-connection handling with the 2, 5, 10 and 30 s backoff, the silent `rate_limited` retries of PRD §3.0.2, error states that retry with the same key, "Checking..." after 1.5 s, the honest-play tracker measuring hidden milliseconds (`src/platform/visibility.ts`), a run converted at its window's close relabelled "Archive · unranked", `/daily` auto-start, stale-tab handling.
- **Owns.** `src/features/daily/**` (except `stop-screen/`), `src/platform/visibility.ts`, `e2e/daily/*.spec.ts` (except the greybox and stop-screen specs).
- **Acceptance.** AC-DLY-01, 06, 07, 08, 10, 11, 12, 13, 17, 18, 29, 30, 32 (Chromium here, WebKit in CI), 33, 37 and 38 on the mock.

**PRA-2 · Practice, complete** · L · depends on PRA-1, CNT-1
- **Scope.** The `/practice` hub (server-rendered category grid, remembered difficulty control, Start, the mode-card and mastery-badge stubs of §2.3); the Hard Mixed offer and the repeats choice for short Hard filters; seen-tracking; the denylist fetch and cache; the generic outbox (`src/platform/outbox/`, with the shedding rules of §6.3) and calibration uploads in source order, carrying the credential once registered; packs from the generated manifest with the missing-offline and error states; the repeats note; results polish (best-moment line, Play again, Change category, share slot); offline labelling; the mock practice area.
- **Owns.** `src/features/practice/**` (excluding `blitz/` and `survival/` internals), `src/features/review/card.tsx`, `src/features/mastery/badge.tsx` (stubs), `src/platform/outbox/**`, `src/app/(tabs)/practice/page.tsx`, `src/backend/mock/server/practice.ts`, `e2e/practice/*.spec.ts` (except the greybox spec). **Touch:** `src/engine/practice/**`, `src/features/shell/tabs.ts` (the Practice tab's `prefetch`, on once `/practice` exists).
- **Acceptance.** AC-PRA-05, 06, 07, 10 and 14 (E2E); the pack-missing offline copy; the hub works by keyboard.

**CNT-3 · The scheduler and the weekly content run (F-OPS)** · L · depends on CNT-2, SQL-3
- **Scope.** `scripts/content/schedule.ts`: assembles Dailies from `active` items into the assembly windows (CONTENT_GUIDE §8.3, §10.2) under the rules of CONTENT_GUIDE §10.3 to §10.5 and PRD §3.18.2, with a small backtracking feasibility solver, re-assembles unfrozen dates from re-tuned estimates, ranks each date's `spareOrder`, and never touches a date at or inside the freeze (read from the database's `freeze` config and `frozen_at`, §8.7). `scripts/content/weekly.ts` (`npm run content:weekly -- --track <track> [--dry-run]`): reads the inputs file that `private.weekly_inputs(p_track)` exports through MCP (the calibration view, the runway, open reports and re-check requests, items reaching `reviewBy`) into `content/calibration/`, produces the run's work list and its 7 new Dailies, and writes the owner queue (every exception plus a random sample of accepted items) as release SQL that inserts `alerts` rows of kind `owner_queue`. `content/OPS.md`: the weekly run's steps for the agent that runs it under the owner's account after `qz_weekly` (PRD §3.18.5), including what to do when the 30-day runway alarm fires. Every message goes through the redacting reporter.
- **Owns.** `scripts/content/{schedule,weekly}.ts`, `scripts/content/schedule/**`, `content/OPS.md`, `content/calibration/README.md`.
- **Acceptance.** On fixture content the scheduler fills 14 days behind the freeze with Dailies that pass CNT-1's schedule rules, leaves frozen dates byte-identical, and reports an infeasible window by rule code; AC-OPS-01's content half: a dry run on the e2e track over a seeded inputs file produces 7 new Dailies that pass AC-CNT-02 and AC-CNT-03 for their dates, writes an owner-queue entry for every exception plus a sample, and changes no frozen Daily (SQL-9 adds the export and the SQL half). The full run, end to end for one week on the main track, is an M5 task (PRD §9.3, release criterion R8).

#### Wave 6

**SQL-5 · Mystery and Encore in SQL, finishing, honest play** · L · depends on SQL-4
- **Scope.** `..._rounds_mystery_encore.sql`: the mystery and encore handlers with option labels and inactive entities refused, withdrawn rounds (§8.8), the hidden-milliseconds threshold and the typed-only too-fast mark, `on_attempt_finished_results` with flags 1 to 32, `daily_results`, crowd counters, wrong-guess tallies, the dwell histogram, crowd stats on reveals; the first `scripts/sql/gen-parity.ts` with generated mystery, encore and timing tests; adapter decoding of reveals.
- **Owns.** `supabase/migrations/20261101000500_rounds_mystery_encore.sql`, `supabase/tests/rounds/**`, `scripts/sql/gen-parity.ts`, `supabase/tests/generated/{mystery,encore,timing}*`. **Touch:** `src/backend/supabase/sealed.ts`.
- **Acceptance.** AC-DLY-03 and AC-DLY-04 (SQL halves, in the revised wording); PRD §4.1.7 and §4.2.4 parity; `invalid_entity` and `already_guessed` consume nothing; clue-4 options with flags and labels; AC-DLY-21 (SQL), 23, 24, 25 and 26; AC-RPT-09 and AC-RPT-10 (SQL halves); the low-trust finish rule of AC-IDN-06; the too-fast flag on a typed solve at 1.4 s and none on a clue-4 pick at 0.8 s; withdrawn rounds before opening, mid-round, as an Encore and as the last round; ranked-only results; eligible-only crowd counts.

**DLY-3 · The stop screen, complete** · L · depends on DLY-2, ENG-2
- **Scope.** PRD §3.1.6 in its revised order: the comparison-card slot (filled by CHL-1 and SHR-2), the best-moment line with its priorities (first finish, freeze earned, new best only after 3 earlier finishes), the score card with the paused streak line, the percentile with its copy rules and the personal comparison, the Groups-row slot (filled by GRP-1), the 13-bar histogram with a "You" pattern and a table, rounds with crowd stats and the Encore's number line, review your misses, one offer card from the registry with the repair provider first and history in `qz:offers`, Done for today with the server-corrected countdown, the soft Practice link, the regret-survey slot; refetch on every visit; lazy confetti for 12/12, off under reduced motion; the mock `daily` area's results and numbers (engine percentile, personal figures) and the `addFinishers` control.
- **Owns.** `src/features/daily/stop-screen/**`, `src/features/celebration/**`, `src/backend/mock/server/daily.ts`, `e2e/daily/stop-screen*.spec.ts`. **Touch:** `src/features/offers/registry.ts` (priority logic).
- **Acceptance.** AC-DLY-14, 15, 16, 27, 28 and 34 (one fixture per combination where they combine), percentile copy at 100 and below 5, the histogram's table equivalent, no confetti under reduced motion.

**STK-1 · Streak UI** · M · depends on ENG-2, DLY-2
- **Scope.** The mock `streaks` area built on `evaluateStreak` and `applyFinish`, hooked into the mock's finish; the home streak chip; the streak sheet (current, best, days played, freeze progress, repair status, the 14-day strip with icon and word); the paused state on every surface with "repair by the end of Monday" (no deadline for 13 to 17); the stop-screen streak line with milestones shown once; one-time notices with acknowledgement; record-first copy after a final break; the copy lint test.
- **Owns.** `src/features/streaks/**`, `src/backend/mock/server/streaks.ts`, `e2e/streaks/*.spec.ts`. **Touch:** `src/backend/mock/server/sealed.ts` (finish hook).
- **Acceptance.** AC-STK-01, 03, 04, 05, 06; AC-FRZ-01 to 04 and AC-RPR-09 through mock scenarios.

#### Wave 7

**SQL-6 · Streaks in SQL** · L · depends on SQL-5, ENG-2
- **Scope.** `..._streaks.sql` (§8.10): player days, streaks, notices, incidents with tracks, `evaluate_streak` and `apply_finish` under the per-player lock, the row-count rule for freezes, pending dates, the Freeze and Protected upgrades, the 30-day date-line limit, zone-hop credit, `paused`; `on_attempt_finished_streaks`; `get_streak`, `ack_notices`; generated parity tests from `streaks.json`; the streak adapter and contract suite.
- **Owns.** `supabase/migrations/20261101000600_streaks.sql`, `supabase/tests/streaks/**`, `supabase/tests/generated/streaks*`, `src/backend/supabase/streaks.ts`, `src/backend/contract/streaks.*`.
- **Acceptance.** S1 to S13 and §4.13's own rows, AC-RPR-01 to 04 and 09, AC-STK-08, AC-STK-09 (a hop without 20 hours writes no `played` day, so neither the streak nor the Group week moves), AC-FRZ-05 and AC-INC-03 in SQL; the evaluation twice in one transaction spends one freeze; two repairable archive finishes back to back repair once; an e2e-track publish failure protects no main-track player.

**ARC-1 · Archive and repair** · L · depends on STK-1, DLY-3
- **Scope.** `/archive` with every tile state, an abandoned attempt's tile resuming it; `/daily/[number]` archive play (unranked labels); archive results ("Archive · unranked", the final distribution, "You'd have beaten", "(archive)" in the share text); the home repair card and the `repair` offer provider (both hidden for the 13 to 17 band); repair copy "by the end of Monday"; repair success copy and counter animation from the paused count; "used this week" with the next date; the long-break copy; mock archive listing and repair logic.
- **Owns.** `src/features/archive/**`, `src/features/archive/offers/repair.tsx`, `src/app/(tabs)/archive/page.tsx`, `src/app/(play)/daily/[number]/page.tsx`, `e2e/archive/*.spec.ts`. **Touch:** `src/backend/mock/server/{sealed,daily}.ts`.
- **Acceptance.** AC-ARC-01, 03, 04 (sealed payloads through the mock response log), 05, 06, 07; AC-RPR-01 to 06 and 08 end to end; AC-AGE-02 for the hidden repair card.

**INC-1 · Incident banners and the health monitor** · M · depends on DS-1, DLY-2
- **Scope.** `src/platform/network.ts` (§10.6), the banner slot (polite region, overlay when late, dismiss rules), `useServiceHealth()`, the mock `health` area and `setServiceState` control, display of protected-date notices.
- **Owns.** `src/features/incidents/**`, `src/platform/network.ts`, `src/backend/mock/server/health.ts`, `e2e/incidents/*.spec.ts`.
- **Acceptance.** AC-INC-01, AC-INC-02, AC-INC-05; offline banner copy; degraded and maintenance banners dismissible for an hour.

#### Wave 8

**SQL-7 · Results, percentiles, archive and stats in SQL** · L · depends on SQL-6
- **Scope.** `..._results_stats.sql`: `get_daily_results` (with `challenge` and `personal`), `get_daily_numbers` for finished attempts only (§8.9), `get_archive`, `get_my_stats` over `player_stats`, `on_attempt_finished_stats`, final percentiles at the close (`hourly_results`), the fold into `daily_pools` (`nightly_results`); generated tests from `percentile.json` and `ranking.json`; adapters.
- **Owns.** `supabase/migrations/20261101000700_results_stats.sql`, `supabase/tests/results/**`, `supabase/tests/generated/{percentile,ranking}*`, `src/backend/supabase/stats.ts`. **Touch:** `src/backend/supabase/daily.ts`.
- **Acceptance.** AC-DLY-15 thresholds, AC-DLY-20 (SQL half), AC-ARC-02, percentile parity (bands, ties, flagged and low-trust players, cold start), `get_daily_numbers` refusing an archive attempt before its Encore lock-in, the final percentile stored at the close, AC-STA-01 data shape.

**STA-1 · Stats page** · M · depends on STK-1, PRA-2
- **Scope.** `/me` sections 1 to 8 (PRD §3.4.3) with chart and table pairs, server figures plus device figures, the "Updated" line offline, error states, the mastery and achievement slots, the Past 7 days link; the mock `stats` area.
- **Owns.** `src/features/stats/**`, `src/app/(tabs)/me/page.tsx`, `src/backend/mock/server/stats.ts`, `e2e/stats/*.spec.ts`. **Touch:** `src/features/shell/tabs.ts` (the Me tab's `prefetch`, on once `/me` exists).
- **Acceptance.** AC-STA-01 to 04; the Me half of AC-ARC-08.

**SET-1 · Settings, age band and data controls** · L · depends on DS-1, IDN-2
- **Scope.** `/settings` with every row of PRD §3.12.1 applied at once and logged; the profile section (sync code, restore, age band, Download my data merging server and device data, Delete my data with two confirmations, then storage cleared and the cookie expired); the age-band question (`src/features/age/`, `requireAgeBand(moment)`, `isMinor()`) and the Under 13 sequence of §9.7 with the refusing backend; the Display name row (age band first, a typed name through the filter for 18 and over); stubs for the sound and reminder sections.
- **Owns.** `src/features/settings/**`, `src/features/age/**`, `src/app/(tabs)/settings/page.tsx`, `src/config/flags/display.ts`, `e2e/settings/*.spec.ts`. **Touch:** `src/platform/settings/**`, `src/backend/mock/server/identity.ts` (export and delete), `src/features/shell/app-header.tsx` (the Settings link's `prefetch`, on once `/settings` exists).
- **Acceptance.** AC-SET-01, 02, 03, 05, 07, 08; AC-AGE-04 (§9.7); AC-AGE-01 for the helper (each moment adds its E2E when built, §1.4 item 21); AC-AGE-03 (crawl as a new guest); AC-DAT-01; deletion clears storage and the cookie.

#### Wave 9

**SQL-8 · Operations: health, incidents, cron, the rate-limit hook** · L · depends on SQL-7
- **Scope.** `..._ops.sql` and `..._pre_request.sql` (§8.1, §8.6, §8.15): heartbeats, service state, `get_service_status`, `declare_incident` with a track, `set_service_state`, `admin_set_shed`, `hourly_ops` (the size alerts, the shed switch, the usage estimates and their alerts), `pg_cron` and the seven schedules (no job body besides `hourly_ops`), `public.pre_request` and the `authenticator` setting; the health adapter.
- **Owns.** Those migrations, `supabase/tests/ops/**`, `src/backend/supabase/health.ts`.
- **Acceptance.** A simulated 12-minute heartbeat gap becomes an incident and protects the date (AC-INC-03 end to end in SQL); AC-INC-04; the hook returns 429 with `Retry-After` past the cap (request settings simulated with `set_config`) and the refusal is counted; the jobs exist in `cron.job`; with a simulated size over `shed_on_mb`, the five shed writes return `unavailable` and `start_daily` still works.

**RPT-1 · Reports and hearts** · M · depends on DLY-3, PRA-2
- **Scope.** `RevealActions`: the heart toggle (accessible name, pressed state) and the report sheet (five reasons, plus "My guess should have counted" first on Mystery reveals with the player's wrong guesses to pick from; an optional 280-character note; success, offline and error copy), both queued through the outbox; the quiz reason set for EDT-3; the mock `reports` area with the §8.12 weights and practice pulls.
- **Owns.** `src/features/reports/**`, `src/backend/mock/server/reports.ts`, `e2e/reports/*.spec.ts`.
- **Acceptance.** AC-RPT-01 for the reveal types that exist so far, AC-RPT-03 (mock), AC-RPT-07, AC-RPT-08 (the guess list, and no such reason on Encore or practice reveals), AC-RPT-09 and AC-RPT-10 on the mock, AC-HRT-01.

**ANA-1 · First-party analytics** · L · depends on CORE-0a, DLY-3
- **Scope.** The real `track()` queue (memory plus `qz:outbox`, 200 events, oldest dropped), flushing (10 s, 20 events, hidden with `keepalive`), the envelope, client-side dictionary checks, vitals through `useReportWebVitals` (25% sampling) and the `Q1` mark, `src/instrumentation-client.ts` error capture, `src/instrumentation.ts` (`onRequestError` to `log_events` with the publishable key, kind `server`), `client_error` hashing, `landing_view`, the regret survey (5% of stop-screen views, at most once in 30 days, never in play), the mock `analytics` area.
- **Owns.** `src/features/analytics/**`, `src/instrumentation-client.ts`, `src/instrumentation.ts`, `src/backend/mock/server/analytics.ts`, `e2e/analytics/*.spec.ts`.
- **Acceptance.** AC-ANA-01 (no other origin over a full mock session), AC-ANA-03, AC-ANA-05; deterministic sampling from the session seed; a thrown server error reaches `log_events` as `client_error` with kind `server` (a Node test with a fetch stub).

**CI-0 · The real-backend Daily job** · M · depends on PLT-1, SQL-7
- **Scope.** `e2e-real.yml` (§11.7), `e2e-real/fixtures.ts`, the first real spec (a full Daily on the e2e track with network sealed assertions), `playwright.real.config.ts` completed. From its first run on GitHub, the orchestrator records the verified client-ip hop rule in §8.6.
- **Owns.** `.github/workflows/e2e-real.yml`, `e2e-real/fixtures.ts`, `e2e-real/daily.spec.ts`, `playwright.real.config.ts`.
- **Acceptance.** The workflow parses; the real Daily spec passes on GitHub after the orchestrator pushes (reported "not run" in the sandbox), which is the M2 exit's real-backend criterion.

#### Wave 10

**SQL-9 · Reports, hearts, practice calibration and voids in SQL** · L · depends on SQL-8
- **Scope.** `..._reports_practice.sql` (§8.12): reports with daily-salted subjects, tallies with distinct subjects, pulled items and the capped automatic pulls with their queue, hearts, practice bitsets and the folded calibration with its filters, item stats, their RPCs, `admin_void_round`, `admin_correct_key` as revised and `admin_add_accepted`, pull and restore, `list_builder_queue`, report resolution, the `content_queue` view, `nightly_reports`, `weekly_calibration`; adapters.
- **Owns.** `supabase/migrations/20261101001000_reports_practice.sql`, `supabase/tests/reports/**`, `src/backend/supabase/{reports,practice}.ts`.
- **Acceptance.** AC-RPT-02 to 06 in SQL; AC-PRA-10 server side; denylist versioning; out-of-range option indices refused; calibration counts only from identities with 20 rated answers, a day old, not low trust, and 3 answers per IP subject per item per day, with self-picked answers at half weight and disputed items held at their last estimate; weights from distinct subjects only; the 11th automatic pull of a day queued; a void and a key correction each rewrite the Group week points; AC-RPT-08 (SQL half), AC-RPT-11 and AC-RPT-12; an accepted id added after play rescores an earlier guess of it; the calibration export that CNT-3's weekly run reads (AC-OPS-01, SQL half).

**SQL-10 · Analytics ingestion in SQL** · M · depends on SQL-8, ANA-1
- **Scope.** `..._analytics.sql`; `scripts/codegen/analytics-sql.ts` generating `supabase/seed/analytics-dictionary.sql` with a CI drift check; `log_events` validation, byte cap, limits, project ceilings and shedding; the `nightly_analytics` rollup with 7-day retention; goal views for G1 to G18; the adapter.
- **Owns.** `supabase/migrations/20261101001100_analytics.sql`, `scripts/codegen/analytics-sql.ts`, `supabase/seed/analytics-dictionary.sql`, `supabase/tests/analytics/**`, `src/backend/supabase/analytics.ts`.
- **Acceptance.** AC-ANA-02, AC-ANA-03 (unique ids), AC-ANA-04; a tripped project ceiling drops batches; the dictionary drift check fails on a mismatch.

**LGL-1 · Legal and trust pages, not-found, sitemap** · M · depends on DS-1
- **Scope.** The seven pages of PRD §3.14 (the honest-play disclosure kept to its intent), footer links on Today, Me and Settings, the not-found page, `sitemap.ts`, `robots.ts`, `src/lib/metadata.ts` (`noindex()`, titles), generated license notices for `/credits`.
- **Owns.** `src/features/legal/**`, `src/app/(info)/**`, `src/app/not-found.tsx`, `src/app/{sitemap,robots}.ts`, `src/lib/metadata.ts`, `scripts/content/licenses.ts`, `e2e/legal/*.spec.ts`. **Touch:** `src/features/shell/footer.tsx`.
- **Acceptance.** AC-LGL-01 (prerendered HTML exists in `.next/server/app`), AC-LGL-02, the sitemap half of AC-UGS-02, unique titles and one `h1` per route.

#### Wave 11

**SEC-1 · Security headers and bundle guards** · M · depends on PLT-1
- **Scope.** `next.config.ts` headers and CSP per backend mode (§10.8), per-path headers, the preview-toolbar allowance, the `experimental.sri` evaluation note; per-route budgets, lazy markers and the sealed-id scan of `.next/static`, `.next/server/app` and `public/` in the bundle scripts; header specs.
- **Owns.** `next.config.ts`, `scripts/check-bundle-budget.mjs`, `scripts/checks/lazy-markers.mjs`, `e2e/security/headers.spec.ts`, `e2e/smoke.spec.ts`.
- **Acceptance.** Exact headers on `/`, `/daily`, `/sw.js` and `/api/restore`; Supabase https and wss origins only in Supabase builds (header-builder unit test); no CSP violation in any E2E run; the bundle check fails on a statically imported marker module; AC-CNT-07: the scan, using AC-DLY-04's matching rules, fails on a planted sealed id or clue in a prerendered page and in `public/`.

**PWA-1 · Installable PWA and offline practice** · L · depends on PRA-2, LGL-1, PWA-0
- **Scope.** The manifest and icons; `src/pwa/sw.ts` with Serwist, from PWA-0's result; `scripts/pwa/build-sw.mjs` and the build script change; the precache of every lazy chunk reachable from the play routes and of one shell per rewritten pattern; registration at idle; `useSafePoint()`, the update flow and the `ChunkLoadError` reload at the next safe point; `persist()` in standalone mode; `/offline`; the `pwa-chromium` specs; the hand-written fallback if the deployed check fails.
- **Owns.** `src/pwa/**`, `scripts/pwa/**` (except `spike/`), `src/features/pwa/**`, `src/app/manifest.ts`, `src/app/offline/page.tsx`, `public/icons/**`, `e2e/pwa/*.spec.ts` (except the spike). **Touch:** `package.json` (the `build` script only).
- **Acceptance.** AC-PWA-01 (manifest fields), AC-PWA-02, 03, 04, 05; AC-PRA-02; AC-LGL-03; a lazy chunk removed between two builds triggers a reload at Home, never mid-question. The deployed check after the first push to main is recorded for the orchestrator, since the sandbox cannot reach Vercel.

**MOD-1 · Moderation and friendly names** · L · depends on SQL-2, CNT-1
- **Scope.** `src/engine/text/moderation.ts`; the term-list pipeline (a starter list from an openly licensed dataset, reviewed by the content team) into a lazy client module and `supabase/seed/moderation.sql`; `scripts/codegen/moderation-sql.ts` generating `private.fold_text`; `..._moderation.sql` with `text_is_blocked` and `set_nickname`; reviewed name lists as seed data; `NicknameField` (generated picker plus custom field with filter feedback); `moderation.json` with generated SQL parity tests.
- **Owns.** `src/engine/text/moderation.ts` (and its tests), `src/features/nickname/**`, `content/safety/**`, `content/names/**`, `scripts/codegen/moderation-sql.ts`, `supabase/migrations/20261104000700_moderation.sql`, `supabase/seed/{moderation,name-parts}.sql`, `supabase/tests/moderation/**`, `supabase/tests/generated/moderation*`. **Touch:** `src/backend/supabase/identity.ts`, `src/backend/mock/server/identity.ts`.
- **Acceptance.** AC-LNT-03 (same verdicts on both sides); no generated name contains a listed term (every combination checked).

#### Wave 12

**SHR-1 · Share result** · L · depends on ENG-2, ANA-1
- **Scope.** The final share text for every mode (archive suffix, choice-row collapsing, high-contrast glyph set), glyph sets from DESIGN.md, share links from share codes, `ShareButton` (Web Share text only, clipboard fallback with status copy, a selected read-only text box as the last resort) and its counting events; wired into the stop screen, archive results, practice results and the finished home card through the stub.
- **Owns.** `src/engine/share/**`, `src/features/share/**`, `src/platform/share.ts`, `e2e/share/{text,button}*.spec.ts`.
- **Acceptance.** AC-SHR-01 (byte for byte), 03, 04, 05, 08, 11 (the Finished home card's Share); AC-ARC-05; the share half of AC-SET-04.

**SHR-2 · Share landing and preview image** · L · depends on ENG-2, DS-1
- **Scope.** `/s/[number]/[code]` (stateless decode, metadata, the reader-local island, `qz:share-origin` on Play), the stop screen's shared-result comparison card, the preview image route with a subset TTF (made once with the pinned `subset-font` by `scripts/assets/subset-font.mjs`, output committed), the alt text in `src/engine/og/`, the cache headers and the CDN check after the first push to main, the generic fallback, the image-size check.
- **Owns.** `src/app/(landing)/s/**`, `src/features/share-landing/**`, `src/engine/og/**`, `src/assets/og/**`, `scripts/assets/subset-font.mjs`, `e2e/share/landing*.spec.ts`.
- **Acceptance.** AC-SHR-02 (200 generated results), AC-SHR-06 (an integration test renders the landing with the backend off), AC-SHR-07; a WhatsApp user agent receives the Open Graph tags in the initial HTML; AC-SHR-09 and AC-SHR-10 (a Daily started from a landing shows "vs the result you opened" with no request for it).

**SQL-11 · Challenges in SQL** · L · depends on SQL-7, MOD-1
- **Scope.** `..._challenges.sql` (§8.3, §8.4): challenges with nullable creator attempts, entries, `create_challenge` and `create_rematch` with client keys, `get_challenge` with `challenger_played`, `start_challenge_run` with the guarded accept count, `start_pack_run` over published challenge packs, head-to-head, shelf, participants named by nickname or friendly name, `on_attempt_finished_challenges` and the `challenge` field on results; adapters.
- **Owns.** `supabase/migrations/20261101001300_challenges.sql`, `supabase/tests/challenges/**`, `src/backend/supabase/challenges.ts`, `src/backend/contract/challenges.*`. **Touch:** `src/backend/supabase/sealed.ts` (challenge and pack starts).
- **Acceptance.** AC-CHL-02, 03, 05, 06, 07, 08, 09, 11, 13, 16 and 17 in SQL; the same key twice makes one challenge and counts once; 50 concurrent accepts end at 50 with no error; a participant who never chose a nickname appears under their friendly name.

#### Wave 13

**CHL-1 · Challenge links** · L · depends on SHR-1, SET-1, MOD-1
- **Scope.** `ChallengeButton` with the first-time nickname step ("What should your friends see?", generated name prefilled, custom names through the age band and filter); create and share with a client key; the challenge routes behind CORE-0b's shells: the landing states (including a rematch whose sender hasn't played it), play, and the finish routing of §10.1, with ranked or repairing runs going to the stop screen and the head-to-head card (`stop-screen-card.tsx`, Rematch in the secondary style) and unranked runs to the result page with verdict copy and Rematch; `/challenges`; the participants list; the home "challenges waiting" slot; the mock `challenges` area.
- **Owns.** `src/features/challenges/**`, `src/app/(tabs)/challenges/page.tsx`, `src/backend/mock/server/challenges.ts`, `e2e/challenges/*.spec.ts`.
- **Acceptance.** AC-CHL-01, 04, 05 (copy), 09, 10, 11, 12, 13 (E2E half), 14 and 15; the full, invalid, expired and offline copy; AC-AGE-01 at the nickname moment; AC-AGE-02 for generated-only nicknames; in a WhatsApp fixture, a ranked challenge run ends on the stop screen with the head-to-head card and the in-app claim card as its offer.

**SQL-12 · Groups in SQL** · L · depends on SQL-7, MOD-1
- **Scope.** `..._groups.sql`: groups and members, `create_group` with a client key, `join_group` locking the Group row, every other Group RPC, board computation with the week through yesterday until the viewer finishes, `get_group_today_ranks`, admin handover, invite regeneration, removal records and deletion with its notices; adapters.
- **Owns.** `supabase/migrations/20261101001400_groups.sql`, `supabase/tests/groups/**`, `src/backend/supabase/groups.ts`, `src/backend/contract/groups.*`.
- **Acceptance.** AC-GRP-02, 03, 04, 06, 07, 10, 11, 13 and 14 in SQL; concurrent joins stop at 50 and never collide on a nickname suffix; week totals and streaks leave today out until the viewer finishes; the same key twice makes one Group; today ranks with ties shared.

**CI-1 · Lighthouse, accessibility and keepalive jobs** · M · depends on PLT-1, CI-0
- **Scope.** `keepalive.yml` (§11.7) and the optional `usage.yml`; Lighthouse and a11y jobs in `ci.yml` with `lighthouserc.json`; the final `log-scan` job, which waits for every other job, fetches their logs through the GitHub API and runs AC-DLY-04's matcher over them in sealed mode, reporting only rule codes and counts (AC-CNT-08).
- **Owns.** `.github/workflows/{keepalive,usage}.yml`, `.github/workflows/ci.yml`, `lighthouserc.json`.
- **Acceptance.** Workflow files parse; Lighthouse assertions configured for the four URLs; `usage.yml` skips cleanly without its secret; the log scan fails on a planted sealed string in a job's output.

#### Wave 14

**GRP-1 · Groups** · L · depends on SET-1, MOD-1
- **Scope.** `/g`, `/g/new` (age band first), the invite shell's route (join in three screens at most), the board shell's route (Today and This week tabs, hidden scores until finished, "Not yet", paused streaks shown as "23 · paused", last week's winner, refetch on focus, visibility, pull and after finishing, never polling), the settings shell's route (nickname, leave, admin tools), the invite share text, the Group offer provider, the stop screen's Groups row and the home Group line through their slots, the mock `groups` area.
- **Owns.** `src/features/groups/**`, `src/app/(tabs)/g/{page.tsx,new}/**`, `src/backend/mock/server/groups.ts`, `e2e/groups/*.spec.ts`. **Touch:** `src/features/shell/tabs.ts` (the Groups tab's `prefetch`, on once `/g` exists).
- **Acceptance.** AC-GRP-01, 05, 06 (DOM), 07, 08, 09 (two idle minutes with no polling or socket), 10, 12, 13 (both confirm steps and the one-time copy), 14 (the removed-invite copy) and 15; AC-DLY-31; the Group week tab half of AC-RPR-09; AC-AGE-01 at the Group moment; AC-AGE-02 for Group nicknames; the `rewrites.spec.ts` real-page check for `/g/new` runs and passes; the board and settings shells follow their id through `/g/A`, Today, `/g/B` and Back (the `rewrites.spec.ts` walk while the stub's marker stands, then the ticket's own spec).

**QA-1 · The real-backend suite** · M · depends on CI-0, SQL-11, SQL-12, IDN-2
- **Scope.** Real specs for sync-code restore across two contexts, claim redemption, a challenge between two contexts, a Group join with the hidden board, and sealed network assertions on archive plays (AC-ARC-04); real contract runs for identity, sealed runs, streaks, challenges and Groups.
- **Owns.** `e2e-real/**` (except CI-0's files and ROM-4's), `src/backend/contract/*.real.test.ts`.
- **Acceptance.** The suites pass on GitHub; every test uses test identities.

**A11Y-1 · Accessibility sweep** · L · depends on Wave 13
- **Scope.** `e2e/a11y/`: the route crawler with axe in both themes, forced colors, reduced motion, 320 px, 200% text, the text-spacing styles with the DOM clipping check (§11.5), keyboard-only journeys (Daily, practice, archive, challenge, Group join, sync code, settings), ARIA snapshot baselines. Fixes inside `src/ui/`; anything outside goes to follow-up notes for the owners.
- **Owns.** `e2e/a11y/**`, `src/ui/**`.
- **Acceptance.** AC-A11Y-01 to 06 on every route that exists after Wave 13.

#### Wave 15 (Should)

**BLZ-1 · Blitz and Survival** · L · depends on PRA-2, ENG-2; merges before REV-1
- **Scope.** `/practice/blitz` (one length, `blitz_seconds`, 60 at launch; the bar with amber stripes at 10 s, ticks in the last 5 s; the countdown pausing during each 600 ms verdict flash, while hidden and while reading aloud; auto-advance; the unscored last question; the review list; bests per length) and `/practice/survival` (three X slots, the ramp, the pool-exhausted ending, results with the strike questions, bests per filter); `src/engine/practice/stream.ts`; their hub cards and share texts.
- **Owns.** `src/features/practice/{blitz,survival}/**`, `src/engine/practice/stream.ts`, `src/config/flags/practice-modes.ts`, `src/app/(play)/practice/{blitz,survival}/page.tsx`, `e2e/practice/{blitz,survival}.spec.ts`.
- **Acceptance.** AC-BLZ-01 to 05; AC-SUR-01 to 03.

**REV-1 · Review my misses** · M · depends on PRA-2; rebases on BLZ-1
- **Scope.** The review queue and its intervals, `/practice/review`, the home review card, the hub card. Adaptive Mixed is Later (PRD §3.3.3), so this ticket no longer builds it.
- **Owns.** `src/features/review/**`, `src/engine/practice/review.ts`, `src/config/flags/review.ts`, `src/app/(play)/practice/review/page.tsx`, `e2e/practice/review.spec.ts`.
- **Acceptance.** AC-REV-01 to 04.

**MAS-1 · Mastery and achievements** · L · depends on STA-1, SQL-7
- **Scope.** Engine rules for tiers and A01 to A30; first-attempt counters fed from the practice controller; `/me/achievements`; unlocks shown only on results and stop screens; `..._achievements.sql` with `record_achievements`; adapter and mock; the category badges and stats sections through their stubs.
- **Owns.** `src/engine/{achievements,mastery}/**`, `src/features/{achievements,mastery}/**`, `src/config/flags/progression.ts`, `src/app/(tabs)/me/achievements/page.tsx`, `supabase/migrations/20261101001500_achievements.sql`, `supabase/tests/achievements/**`, `e2e/achievements/*.spec.ts`. **Touch:** `src/features/practice/model/controller.ts` (the first-attempt counter call), `src/backend/supabase/stats.ts`, `src/backend/mock/server/stats.ts`.
- **Acceptance.** AC-ACH-01 to 05; AC-MAS-01 to 04.

#### Wave 16 (Should)

**CAL-1 · Calendar reminder, install pitch and installed first run** · L · depends on SET-1, PWA-1, IDN-2
- **Scope.** The calendar offer and the Settings "Daily reminder" row (Google template link with the daily rule and `ctz`; an `.ics` file; age band at this moment; never in-app or for 13 to 17); the install pitch (Chromium `beforeinstallprompt`; iOS steps after the sync code; "Not now" defers 7 days, at most twice; never in-app or standalone); the installed first-run screen; their events.
- **Owns.** `src/features/{reminder,install}/**`, the `calendar` and `install` offer providers, `src/config/flags/growth.ts`, `src/features/settings/sections/reminder.tsx`, `e2e/growth/*.spec.ts`.
- **Acceptance.** AC-CAL-01 to 06; AC-INS-01 to 03; the installed first screen's copy for AC-SYN-07; AC-IAB-05 in full; AC-AGE-02 for reminder offers.

**CAT-1 · Category pages and the monthly pack** · M · depends on CNT-1, PRA-2
- **Scope.** Twelve static `/categories/[slug]` pages (intro, three topics, one sample question with its answer after the pick, a one-tap Play), sitemap entries, the monthly pack card, its badge shelf and progress.
- **Owns.** `src/features/categories/**`, `src/app/(tabs)/categories/[slug]/page.tsx`, `src/config/flags/categories.ts`, `src/features/practice/monthly-pack-card.tsx`, `content/category-pages/**`, `content/monthly-packs.json`, `e2e/categories/*.spec.ts`. **Touch:** `src/app/sitemap.ts`.
- **Acceptance.** AC-CAT-01, AC-CAT-02, AC-PCK-01.

**SND-1 · Sound and read aloud** · M · depends on SET-1
- **Scope.** A Web Audio engine with a sprite under 30 kB and the `AudioContext` created on the first tap; the effect set; Android haptics; read aloud through `speechSynthesis` (pausing Blitz through the run's `pause` event); host-screen sound defaults for ROM-2; the Settings sound section.
- **Owns.** `src/platform/sound/**`, `src/platform/{haptics,speech}.ts`, `src/config/flags/sound.ts`, `src/features/settings/sections/sound.tsx`, `public/sounds/**`, `e2e/settings/sound.spec.ts`.
- **Acceptance.** AC-SET-03, 06, 07.

#### Wave 17 (Beta)

**SQL-13 · Rooms core in SQL** · L · depends on SQL-12, MOD-1
- **Scope.** `..._rooms_core.sql`: rooms and seats with device-minted host and seat tokens, `create_room` with a client key, `room_source` with `room_source_pack` and the quiz stub, the project's live-connection cap, `join_room` with late joins and refills of removed seats, the wrong-code limit counting only `not_found` and seat-token rejoins exempt, `room_shuffle_name`, `room_set_name` behind the setting with the band from the profile or the seat, `room_heartbeat` and the two state RPCs for the lobby with `host_seen_at`, per-seat spacing on the seat row, lobby host actions (remove, rename, lock, unlock, end, start into `read`), `room_leave`, the hint helper, the lobby part of `rooms_sweep`; the rooms adapter and `realtime.ts` on private channels.
- **Owns.** `supabase/migrations/20261101001600_rooms_core.sql`, `supabase/tests/rooms/**`, `src/backend/supabase/{rooms,realtime}.ts`.
- **Acceptance.** AC-ROM-06; AC-ROM-10 for these RPCs (success, permission, rate limit); same-seat rejoin; a removed token refused; locked rooms refuse only new seats; AC-ROM-14 (ten wrong codes block the eleventh that minute while a seat-token rejoin passes, and 20 phones from one IP join with no refusal); a removed seat's place refilled while a 21st live seat is refused; the connection cap answers `full`; the same host token twice makes one room; `room_set_name` with the setting off, with the 13 to 17 band, with a blocked name, with a clean one, and with the band answered on a seat that has no profile (the SQL half of AC-ROM-17).

**ROM-1 · Room engine, mock rooms and the sync controller** · L · depends on ENG-2
- **Scope.** `src/engine/rooms/phases.ts` (§8.11); the mock `rooms` area (create, join with late joins, heartbeat, host away, state with options withheld until `optionsAt`, host actions, typed names, answers, ticks, voids within the cap, coalesced count hints on BroadcastChannel, `failNext` voiding); `src/features/rooms/model/` (subscription, polling at 3 and 15 s, version gating, the refetch timer at `optionsAt`, 5 s heartbeats, reconnecting state, deadline timers); seat-token minting and storage.
- **Owns.** `src/engine/rooms/**`, `src/backend/mock/server/rooms.ts`, `src/features/rooms/model/**`, `e2e/rooms/smoke.spec.ts`. **Touch:** `src/backend/mock/realtime.ts`.
- **Acceptance.** Phase-table unit tests; scoring integration; polling at 3 s when the status is down; refetch only on a newer version; at most two refetches a second under hint spam; two pages join one mock room.

**EDT-1 · Quiz editor** · L · depends on DS-1, MOD-1
- **Scope.** `/create` (device drafts and server copies), the editor at `/create/new` and behind the `/create/:quizId` shell (fields, add, duplicate, delete with a 10 s undo, move up and down, limits), autosave within 1 s, lint (blocking rules and L1 to L8) with "3 things to fix", client filter feedback, solo play through the practice engine (`quiz_solo`), the Beta label, `notFound()` when the flag is off, the editor home slot, and the mock `quizzes` area for server copies.
- **Owns.** `src/engine/quiz-lint/**`, `src/features/editor/**` (except `import/` and `share/`), `src/app/(tabs)/create/{page.tsx,new}/**`, `src/backend/mock/server/quizzes.ts`, `e2e/editor/{editor,lint}.spec.ts`.
- **Acceptance.** AC-EDT-01, 02, 03; AC-LNT-01; the client half of AC-LNT-02; the `rewrites.spec.ts` real-page check for `/create/new` runs and passes.

#### Wave 18 (Beta)

**SQL-14 · Rooms gameplay in SQL** · L · depends on SQL-13
- **Scope.** `..._rooms_game.sql`: answers, `room_tick` locking only when a transition is due, phases and deadlines, options withheld until `options_at`, Classic and Accuracy scoring with the doubled final question, extensions, reveal distributions, standings, the podium, voids with validation outside the exception block and the cap of 2 (exception handler and watchdog), phase hints to both topics, coalesced count hints, the private-channel policy on `realtime.messages`, host-away ending, the usage counters, the rest of `rooms_sweep` and `nightly_rooms`; `supabase/fallback/room_signals.sql` keyed by hash; generated room-scoring parity tests.
- **Owns.** `supabase/migrations/20261101001700_rooms_game.sql`, `supabase/fallback/**`, `supabase/tests/rooms/game*`, `supabase/tests/generated/room*`. **Touch:** `src/backend/supabase/rooms.ts`.
- **Acceptance.** AC-ROM-08, 09 (with `room_player_state` 1 ms before `options_at` returning no options); AC-ROM-10 for the remaining RPCs; PRD §4.5.5 parity; a void on an injected exception, none on a malformed input, and none past the cap; count hints at most one a second; a room ends after 15 minutes with the host away.

**ROM-2 · The host screen** · L · depends on ROM-1, DS-1, SND-1
- **Scope.** `/host` (packs, the exported host-source slot that EDT-3 fills, timer and scoring with Accuracy forced when the timer is off, the typed-names toggle, the final-question note, the host token minted on Create, the `AudioContext` on Create), the host-room shell's route (code and lazy QR, lobby, every host control, phases at host-screen type sizes, the striped amber countdown, answered counts, reveal, top five, podium, notices, effects on and music off, a state poll at least every 15 s), the Beta label.
- **Owns.** `src/features/rooms/host/**`, `src/app/(host)/host/page.tsx`, `e2e/rooms/host*.spec.ts`.
- **Acceptance.** AC-ROM-07; the host half of AC-ROM-12; AC-ROM-13; the corner code and QR until the room locks (AC-ROM-15); host reload and the host half of AC-ROM-16.

**EDT-2 · Bulk import** · M · depends on EDT-1
- **Scope.** `src/engine/quiz-import/` (Format A, CSV with delimiter detection, RFC 4180 quoting, BOM stripping); `/create/import` (paste or a file up to 200 kB, preview rows with reasons, fix or drop, add, skipped rows past 50); `/create/help/import` with the copyable prompt; lazy loading.
- **Owns.** `src/engine/quiz-import/**`, `src/features/editor/import/**`, `src/app/(tabs)/create/{import,help}/**`, `e2e/editor/import.spec.ts`.
- **Acceptance.** AC-IMP-01 to 05; the `rewrites.spec.ts` real-page check for `/create/import` runs and passes.

#### Wave 19 (Beta)

**ROM-3 · Phones in rooms** · L · depends on ROM-1, ROM-2
- **Scope.** `/join` (numeric code entry), the join and room shells' routes (lobby, Shuffle name, the typed-name field behind the setting with the age band at that moment and filter feedback, every phase with the full question text, answer lock, verdict and points, explanation, rank and gap, podium, notices, host away, late-join copy, reconnecting, and the removed, ended, full, locked and wrong-code copy), silent by default, heartbeats, rejoin with the stored seat token, the room report target.
- **Owns.** `src/features/rooms/phone/**`, `src/app/(landing)/join/page.tsx`, `e2e/rooms/phone*.spec.ts`.
- **Acceptance.** Phone state copy; the phone half of AC-ROM-12; AC-ROM-14's "Too many tries from this network" retry; AC-ROM-15 and AC-ROM-17; the phone half of AC-ROM-16; the `rewrites.spec.ts` real-page check for `/join` runs and passes.

**SQL-15 · User quizzes in SQL** · L · depends on MOD-1, SQL-9
- **Scope.** `..._quizzes.sql` (§8.3, §8.4): quizzes, immutable quiz versions and the attempts foreign key, validation that mirrors the blocking rules, the 64 kB and daily byte caps, a client key on the first save, sharing behind the 18+ band, `get_shared_quiz`, `start_quiz_run` referencing a version, `choice_source_quiz`, `room_source_quiz`, `on_attempt_finished_quizzes`, report-driven hiding, `admin_takedown_quiz`, `nightly_quizzes`; the adapter.
- **Owns.** `supabase/migrations/20261101001800_quizzes.sql`, `supabase/tests/quizzes/**`, `src/backend/supabase/quizzes.ts`.
- **Acceptance.** AC-EDT-05, AC-LNT-02, AC-UGS-01, 03, 04, 05 in SQL; `conflict` on a stale save; the same first-save key twice makes one quiz; a quiz one byte over 64 kB is refused; a quiz attempt copies nothing and plays its version after a later save; unreferenced versions are pruned.

**EDT-3 · Sharing user quizzes** · L · depends on EDT-1, RPT-1, SET-1
- **Scope.** Server save with the conflict choices; the share flow (age band, the 18+ confirmation with the content-policy link, the 13 to 17 message); the unlisted link; the quiz shells' routes (landing with noindex, hidden and unavailable states and report; play; result); creator stats; "Hidden while we review reports"; unshare and delete; My quizzes for the host screen through `host-source.tsx`; the sync-code trigger on the first saved quiz.
- **Owns.** `src/features/editor/share/**`, `src/features/shared-quiz/**`, `e2e/editor/share*.spec.ts`.
- **Acceptance.** AC-EDT-04; AC-UGS-01 (UI), 02, 04 (E2E), 06; AC-AGE-02 for quiz sharing and hosting.

#### Wave 20

**ROM-4 · The rooms gate** · L · depends on ROM-2, ROM-3, SQL-14
- **Scope.** The multi-page mock suite (AC-ROM-01 to 05, 07, 09, 12, 13 and the gate additions of §11.4); the real 1-host, 10-phone game (AC-ROM-11); the Realtime load check (3 rooms of 20 headless `realtime-js` clients in Node, recording peak events per second and disconnects, §8.11); a gate summary in the pull request so the orchestrator can decide the Beta label and the connection cap (PRD §9.2).
- **Owns.** `e2e/rooms/gate*.spec.ts`, `e2e-real/rooms.spec.ts`, `e2e-real/realtime-load.ts`.
- **Acceptance.** The suites themselves; AC-ROM-18 (peak under 80 messages a second, no project-wide disconnect, phases on every phone within 4 s, under 10% of the game on polling); the gate outcome and the measured peak recorded.

**PERF-1 · Performance pass** · L · depends on Waves 1 to 19
- **Scope.** Bring `/`, `/daily` and `/practice/run` inside their budgets; tune prefetching; fix LCP and CLS findings; add the INP trace test (4x CPU throttling) and the Q1 lab test (p75 of 20 throttled runs with the mock's latency fixed at 300 ms per call through `setLatency(300)`, AC-DLY-02); a local Lighthouse run. This is the one cross-cutting ticket: it may edit any feature file, which is safe because the other Wave 20 tickets only add tests.
- **Owns.** `e2e/perf/**`; any file, with each change listed in the pull request.
- **Acceptance.** AC-DLY-02; every bundle budget; Lighthouse 90 or more locally on the four URLs.

**QA-2 · Release checks** · M · depends on everything
- **Scope.** `scripts/checks/ac-coverage.mjs` as a gate; the whole SQL suite and both advisors through MCP, diffed against `supabase/expected-advisors.json`; the AC-DAT-02 scan of every private table; the migration drift check; the static import checks complete (AC-DLY-19, AC-RPR-07, AC-SUR-03); a results summary for the launch report.
- **Owns.** `scripts/checks/ac-coverage.mjs`, `supabase/tests/**` (gap fills).
- **Acceptance.** Every Must criterion maps to a passing test or an honest "not run"; the advisor diff shows only the expected findings; the SQL suite green.

### 12.4 Risks to the plan

| Risk | Early sign | Response |
|---|---|---|
| Wave 1's three slices disagree at merge | The exit spec fails on wiring, not logic | Contracts in §3, §4.4 and §7.2 are code-level, CORE-0a ships the shared fixtures and CORE-0b the AnswerButton states; the orchestrator fixes wiring during the merge, before Wave 2 |
| RITE fixes overrun Wave 2F | A third round still finds P0 or P1 confusion | More rounds before Wave 3; the M1 gate holds, and Wave 2's engine work isn't wasted |
| The 14.6 kB home budget is blown by the first real features | `check:bundle` above 150 kB in Wave 5 or 6 | Islands move to `import()`; PERF-1 is the backstop, but every ticket runs the check |
| Serwist's configurator mode fails | PWA-0's spike or the deployed check | The hand-written fallback worker with the same tests |
| The first `X-Forwarded-For` hop turns out to be client-controlled | The `client-ip` contract test fails | Switch `private.config.client_ip` to the hop Supabase's proxy appends, record the rule in §8.6; until then the project ceilings still bound abuse |
| Database broadcast misbehaves in the rooms gate | AC-ROM-03 or AC-ROM-11 flakes | Public topics, then the hashed `room_signals` fallback; if the gate still fails, rooms stay flagged off (PRD §9.2) |
| Realtime disconnects the whole project under a burst (`tenant_events`) | The load check records a disconnect | Lower the project connection cap; phones already fall back to 3 s polling |
| The database outgrows the free plan early | The 250 MB alert | Short retention and caps are already in; the shed switch keeps the Daily playing; Pro per the owner checklist (§12.5) |
| WebKit refuses Secure cookies on `http://127.0.0.1` | AC-CKE specs fail on `mobile-webkit` | Run those specs on Chromium and Firefox; the launch report lists the gap for the iPhone check |
| The content key is lost | `content:unseal` fails | Recover it from the database escrow (§5.4); the owner checklist still asks for a password-manager copy and the `QZ_CONTENT_KEY` GitHub secret on day one |

### 12.5 Owner checklist (for the launch report)

| Task | When | Why |
|---|---|---|
| Keep the content key in a password manager and add it as the `QZ_CONTENT_KEY` GitHub secret | Day one | The database escrow is a backup, and the `content-sealed` job needs the secret |
| Check the Supabase usage dashboard weekly (egress, Realtime messages, peak connections), or add a Management API token as a GitHub secret for `usage.yml` | Weekly from launch | Postgres can only estimate these three (§8.1) |
| Upgrade to Supabase Pro when an alert fires twice in a month (PRD §8.5); plan it at the first 250 MB alert, and decide before launch if 3,000 daily players are expected | At the alerts | §8.1's arithmetic puts the free plan's limit within weeks at that scale |
| Allow GitHub Actions to open pull requests (repository settings), or merge ENR-1's output by hand | Before Wave 4's exit | The enrichment workflow opens a pull request |
| Re-enable scheduled workflows after 60 days without repository activity | Whenever GitHub suspends them | Keepalive, nightly real-backend runs and enrichment are scheduled |
| Move `private.config.freeze.switch_on` once two calm weeks have passed | Weeks 2 to 4 of play | One freeze rule (§8.7) |
| Decide whether guest identities idle for 400 days are pruned | Before the database passes 250 MB | Per-identity rows are a slow, steady part of growth (§8.1), and pruning one is a product decision |

## Review log

Corrections from the architecture review of 31 October 2026, in the order given, with where each landed. Every one was applied; the notes say where we applied one differently from its wording, and why.

| # | Correction | Where it landed | Notes |
|---|---|---|---|
| 1 | Rate limits from the PRD correction, IPv6 subjects, Retry-After, refusals by bucket, two SQL tests | §8.4, §8.5, §8.6, §7.3, SQL-1, SQL-2 | Merged with corrections 9 and 10 the way the revised PRD (§3.10.1, §8.4) merged its own: 60 new identities an hour per IP at normal trust, then low trust; refusals only past 20 a minute or 5,000 an hour project-wide; IPv6 by /64 everywhere. Both SQL tests pass under those numbers |
| 2 | Paused streaks, the repair offer first, `max_local_date`, the 30-day date-line limit, new fixtures | §3.5, §4.11, §4.13, §2.3, §8.7, §8.10, ARC-1, ENG-2, SQL-4, SQL-6 | Every date-dependent RPC, not only the three named, uses the effective today, so archive, challenges and Groups agree on the date |
| 3 | `p_hidden_ms`, typed-only too-fast, withdrawn rounds, correct-key limits, SQL tests | §3.3, §4.5, §7.2, §8.8, §8.12, SQL-5, SQL-9 | |
| 4 | Rooms: wrong codes only, seat cap, seat-token exemption, host heartbeat and away, late joins, typed names | §3.7, §8.4, §8.11, §8.13, SQL-13, SQL-14, ROM-1, ROM-3, ROM-4 | A typed name is a custom nickname, so `room_set_name` needs the 18+ band, read from the profile or answered on the seat as PRD §3.10.6 allows (§1.4 item 16). The new-seat cap is the room's 20 seats, read as the revised PRD reads it (a removed guest's place can be refilled), so no lifetime cap was added |
| 5 | Ranked challenge finishes to the stop screen, participant names, `challengerPlayed`, the WhatsApp E2E | §3.4, §3.6, §8.4, §10.1, SQL-11, CHL-1 | `creator_attempt_id` became nullable, since a rematch's sender may not have played its date |
| 6 | `solveByClue` cumulative, a refinement, expected points as the sum | §3.2, §4.6, §5.2 | |
| 7 | A client projection for lists, retired entries out, a per-list size check | §3.2, §5.3, §5.5, CNT-1 | |
| 8 | CONTENT_GUIDE Appendix A items 14 to 16 in the schemas, stripping, encore fields, statuses, option labels, `valueDisplay`, C06 to C28 and the schedule rules | §3.2, §5.1.1, §5.2, §5.3, §5.5, CNT-1, CNT-2 | Clue-4 labels are computed on the server from `option_label`, so the rule holds for every client |
| 9 | Normalized subjects, the forged-header test, project ceilings, salts by window start | §8.6, §8.4 (`t_client_ip`), §11.7, SQL-1, SQL-2, CI-0 | The /56 offered for identities and room joins was considered and not used. The revised PRD keys IPv6 by /64 everywhere (§8.3, §8.4, AC-IDN-07), a /56 would pool up to 256 carrier phones that each hold their own /64, and a client with a wider block still meets the project ceilings while its extra identities are low trust. Salts live 48 hours, which the PRD's privacy text states |
| 10 | A soft identity threshold with low trust, per-credential general caps | §3.12, §8.5, §8.6, §8.8, §8.12 | The soft threshold is 60 an hour and the burst 20 a minute, as the revised PRD sets them, for both families of address. A low-trust run is judged at its finish, so the identity's second finished Daily already counts (AC-IDN-06) |
| 11 | §8.1 redone table by table, retention cuts, byte caps, the shed switch, a 250 MB alert | §8.1, §8.3, §8.6, §8.12, §8.15 | Measured on local Postgres rather than estimated; we also made the packed rounds positional `json`, dropped stored replay responses and fold ranked results after 30 days |
| 12 | Per-player streak locking, row-count freezes, upgrades of stored dates, concurrency tests | §4.11, §8.10, SQL-6 | Gap dates holding an open ranked attempt now stay undecided, which removes the most common way a Freeze lands on a date that then finishes |
| 13 | Window-close conversion, abandoned attempts reopened, final percentiles at the close, tests at the close plus and minus 1 s | §8.4, §8.7, §8.9, SQL-4, SQL-7 | Matches the revised PRD §3.1.3 and AC-DLY-22 |
| 14 | Client keys on every creating RPC | §7.2, §8.3, §8.4, §8.6 | Rooms and claims use device-minted tokens as their keys, so no secret has to be stored in plaintext for a replay |
| 15 | Options withheld until `options_at`, the hint, the refetch timer, an SQL test | §3.7, §8.4, §8.11, SQL-14 | The host view withholds them too, since the big screen is a shared display |
| 16 | Realtime: coalesced count hints, both topics, the connection cap, `tenant_events` as down, a load check, private channels | §7.5, §8.1, §8.11, SQL-14, ROM-4 | We verified that `postgres` can create the policy on `realtime.messages` |
| 17 | Lints 0028, 0008 and 0011, the expected-findings list, ownership and forced-RLS checks | §8.2, §8.17, SQL-1, QA-2 | |
| 18 | pg_graphql dropped, the OpenAPI root, both in the audit | §8.2, §11.7 | pg_graphql turned out not to be installed on this project [verified], so the drop is a guard plus a standing check |
| 19 | Usage estimates for egress, Realtime and connections, the owner item | §8.1, §8.15, §12.5 | |
| 20 | CNT-0 with the ignore rules, seal scripts, key creation and escrow | §5.4, §8.3, §8.16, CNT-0 | It sits in Wave 1, since Wave 0's tickets build the contracts it depends on |
| 21 | Redacted output for every command that decrypts, the planted-error test, the cross-pool dedupe | §5.2, §5.4, §5.7, CNT-1, SQL-3 | |
| 22 | Wave 2F for RITE fixes, the M1 gate, PWA-0, `e2e-real` moved earlier, AC-AGE-01 scoped | §10.7, §12.1, §12.2, PWA-0, CI-0, §1.4 item 21 | Named Wave 2F rather than renumbering every later wave |
| 23 | Shared-file clashes in Waves 1, 2, 12, 15, 17 and 19, and CORE-0 split | §2.3, §12.2, §12.3 | |
| 24 | Hooks for attempt finishing, choice sources and room sources; job skeletons in SQL-1 | §8.8, §8.15, §8.16 | |
| 25 | Parameter order, `round_action` ordering, constraint races | §8.4, §8.5 | |
| 26 | `rq` defined | §4.5, §4.6, §8.8, §4.13 (`timing.json`) | |
| 27 | `entityId` dropped from `OptionView`, the revised AC-DLY-03 | §3.3, §4.4.1, SQL-5 | |
| 28 | `get_daily_numbers` for finished attempts only, with a test | §7.2, §8.4, §8.9, SQL-7 | |
| 29 | Group week through yesterday until the viewer finishes; admin functions rewrite player-day points | §3.6, §8.4, §8.12, SQL-9, SQL-12 | |
| 30 | `events(player_id)` indexed, hashed player subjects, the AC-DAT-02 scan of every table | §8.3, §8.4, §8.6, §8.17 | |
| 31 | `challenge_packs`, tracks on spares and incidents, `qz:host:<roomId>` | §3.2, §6.2, §8.3, §8.10 | Heartbeat-gap incidents use track `all`, since our outages hit every track |
| 32 | Per-user paths rewritten onto static shells, `ensureStatic = 'shell'` | §1.4 item 17, §2.1, §10.1, §10.2, CORE-0b | We verified that typed routes include rewrite sources; `/daily/[number]` keeps its segment, being one shared value a day |
| 33 | The static heading, `formatToParts`, lazy chunks and `ChunkLoadError`, CDN caching for images, wider scans, cache-first lists | §1.4 items 9 and 15, §4.3, §5.4, §10.3, §10.4, §10.7, §10.9 | |
| 34 | One Supabase client, no `@supabase/ssr`, `.env.example` | §1.4 item 7, §7.5, SQL-1, PLT-1 | |
| 35 | Room voids scoped and capped, lock-on-demand ticks, spacing on seat rows | §8.11, §8.4 | |
| 36 | Release order and `verify_release` | §5.4, SQL-3 | |
| 37 | Zones: stored zone and time, the 20-hour rule, the date-line limit, nightly `time_zones` | §8.7, §8.10 | |
| 38 | Report weights from authenticated answers, distinct subjects, the pull cap, weight 0 for test and low-trust identities | §8.4, §8.12, SQL-9 | |
| 39 | `instrumentation.ts`, the enrichment decision | §2.1, §8.14, ANA-1, ENR-1, §1.4 item 20 | We did both: a workflow, and popularity 0 with alphabetical ties until its first pull request |
| 40 | Source formats as their own schemas, status gating, the guide's verification object, encore and list fields, CNT-1 fixtures from CONTENT_GUIDE §12 | §5.1.1, §5.2, CNT-1 | The example ids moved out of the guide's reserved batch 00 |
| 41 | The acceptance rule of CONTENT_GUIDE §9.9 in place of stored passages | §5.2 | |
| 42 | Redaction through one reporter, with an acceptance test | §5.4, CNT-1 | Merged with correction 21 |
| 43 | CNT-2 for lint, packets, estimator and audits | §12.3 | It starts from CNT-1's first commit, as CORE-0b does from CORE-0a's |
| 44 | Room-pack sources in the guide's shape plus `predicted`; an id check on sealed questions | §5.1.1, §8.3 | |
| 45 | Retired and merged entities: inactive in SQL, never suggested, refused when guessed, forbidden in schedules | §5.5, §8.3, §8.8 | |
| 46 | `solveByClue` contract (a repeat of 6) | §3.2 | |
| 47 | Comparisons shuffled, `valueDisplay` shipped | §3.2, §3.3, §4.4.1, §8.3, §8.8 | |
| 48 | One `sortKey`, `wordCount` and `charCount` | §4.12, §5.2, CORE-0a | `src/engine/text/metrics.ts` belongs to CORE-0a so Wave 1 can use it; MOD-1 now owns only `moderation.ts` |
| 49 | One freeze rule in config, frozen state from the database only | §8.7 | |
| 50 | `unitShort` and `unitLabel` on encores | §3.2, §3.3, §8.3, MYS-1 | |
| 51 | Practice option indices in source order, calibration filters and IP caps | §7.2, §8.3, §8.12 | Applied at upload, because raw answers are no longer kept (correction 11) |
| 52 | The 80 KB list budget proven at target size | §1.5, §5.5 | Our synthetic test put the projection at 64 KB, so no split is needed; if real data passes 80 KB the target comes down |

Beyond the review, this revision tracks the PRD's own revision, which landed while this one was being written. Adaptive Mixed is Later and Blitz has one length. The stop screen gains its comparison card, Groups row and personal comparison, and the home card its chips, played count and `daily_minutes`. The identity limits, salts and low-trust rule follow PRD §3.10.1, §8.3 and §4.3.6, and the date-line rule waits for the next request to keep the new zone (AC-STK-08). An admin can delete a Group and a removed member can't reuse the old invite. Room phones without a profile answer the age band on the seat. Mystery reveals gain the "My guess should have counted" reason, with `admin_add_accepted` behind it. The Under 13 answer runs §9.7, and the dictionary takes PRD §7.2's names and properties. The weekly content run became CNT-3. Every acceptance criterion the revised PRD adds is assigned to a ticket, and the adaptive-practice criterion it removed is gone. CONTENT_GUIDE v1.1 also landed during this revision, and its hand-backs are in: lint C26 to C28, `selfCheck`, `exactDates`, `liveAt`, the batch register, the `list-requests` and `audits` folders with `lr.` ids, staged packets for every format, `spareOrder`, the pass D freeze gate, and the calibration safeguards (Appendix A items 14, 15 and 17 to 22).

**Cross-doc consistency pass (31 October 2026).** The PRD, this document and CONTENT_GUIDE v1.1 were revised side by side, so the technical program manager reconciled the three as they stood at the end of the day. Changes here:
- **To match the PRD:** `encoreError` uses PRD §4.2.2's symmetric error, and the bands, display and rank key are computed exactly, with fixtures at exactly 5% and 15% (§3.3, §4.6, §4.13, §8.8; the floating-point boundary was CONTENT_GUIDE's hand-back). `parseEncoreInput` follows PRD §4.2.1's separator and zero rules, with `not_positive` in place of `negative` (§4.4.2). Every `start_*` RPC opens round 0, so one tap reaches clue 1 (§7.2, §8.4, §8.8, SQL-4). `StreakState` and `StreakEvaluation` carry the PRD's display state, `StreakDelta` the paused count and `GroupWeekRow` a paused flag (§3.4 to §3.6, §4.11, §8.4, §8.10, ENG-2, GRP-1). The played count shows from a fixed 50 (§3.4, §8.4). Phones whose host is away read "Waiting for the host..." (§8.11). The copy lint bans "midnight" and checks "by the end of" (§11.2), and clipping is a DOM check (§11.5, A11Y-1). The AC-DLY-02 lab test fixes the mock's latency at 300 ms (PERF-1). The report sheet gains its Mystery-only reason (RPT-1). S1 to S13 and the new AC-STK-09 are assigned (§4.13, ENG-2, SQL-4, SQL-6). `limit_reached` no longer lists challenges, which are rate limited (§7.3). No ability estimate is stored while adaptive Mixed is Later (§6.2, §6.5). `reviewBy` replaces `review_by` (CNT-3), and §8.7 credits the freeze rule's two stages to CONTENT_GUIDE §10.7.
- **To match CONTENT_GUIDE:** the §5.1.1 Canberra example is the guide's (its explanation, `c1` at high risk, `selfCheck` and the full verification object), and the list example carries `liveAt`. The batch register row lists every field. In §5.2 the Mystery row asks for 100 entries whatever the slot, the Encore row for answers of 21 or more, the Acceptance row follows CONTENT_GUIDE §9.9 in full, and the Schedule row counts category rules on the mystery slots only and adds the 6-day and 7-day category rules. A new Lists row checks `liveAt` against git history, so the `verify` job checks out with `fetch-depth: 0` (§5.7, CNT-1). Changing `optionsFromClue` re-lints the sealed items (§5.3). Lists are built from the guide's pinned datasets, with Wikidata only through ENR-1, and the per-source importers get a folder and an owner (§2.1, §5.5, CNT-2). The `content-sealed` job checks the audit record's counts (§5.7).
- **Settled in §1.4:** items 4, 11, 12, 15, 17, 18 and 19, now that the PRD says the same.

**Wave 0 review of CORE-0a and CORE-0b (1 November 2026).** The lane's review found contracts the code had to invent and rules no ticket could keep. Changes here, each made with the code it describes:
- **Contracts written down:** `RevealActions` takes `round` and `wrongGuesses`; `SharePayload`, `OfferContext` and `Suggestion` as their files define them; the client boot `bootClient()`; `usePathParam()` over `src/platform/path-param.ts`; `PlayFrame`; the 14 route-module stubs and `nickname/copy.ts` with their owners (§2.3, §4.4.3).
- **Rules that changed:** `normalizeName` deletes apostrophes and periods and turns every other mark into a space (§4.7, with PRD §4.1.3); a quota eviction only drops keys ranked below the key being written (§6.1); rewritten shells follow the router's pathname, because Next reuses one shell for every id (§10.1, §10.2 rule 8); `ensureStatic` sits on the group layouts, `'navigation'` where every route can be fully static (§10.2 rule 5); `src/content` may import pure engine modules and `src/backend` the analytics types (§2.2).
- **Ownership:** one flag-defaults file per owner under `src/config/flags/` (§2.3, §10.5, and each ticket's Owns); Today's notices above Practice, one at a time, with `StreakNotice` (STK-1) and `RestoreNotice` (IDN-2) as new slots; tab and Settings prefetch handed to the owners of their pages (PRA-2, GRP-1, STA-1, SET-1); DLY-1's Touch on the boot; the `/g/new`, `/join`, `/create/new` and `/create/import` page checks carried into GRP-1, ROM-3, EDT-1 and EDT-2; the `spare.NN` rename added to CNT-1.
