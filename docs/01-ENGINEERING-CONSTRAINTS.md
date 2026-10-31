# Engineering Constraints and CTO Guidance

These are hard facts about our platform access. The architecture must respect them.

## What we can and cannot control
| Capability | Status | Consequence |
|---|---|---|
| Supabase SQL (migrations, RPC functions, RLS, publications, seed data) | Yes, via Supabase MCP tools | All authoritative backend logic lives in Postgres (SECURITY DEFINER RPCs), versioned in `supabase/migrations/` |
| Supabase service-role key | Not available to us | The app cannot depend on a server-side secret. Next.js server code may only use the publishable key. |
| Supabase Auth configuration (enable anonymous sign-ins, SMTP, OAuth) | Not available | Do not depend on Supabase Auth. Default SMTP only mails project team members, so email login is unusable for players. |
| Supabase Edge Functions | Deployable via MCP, but untestable from the sandbox | Avoid unless there is no SQL alternative |
| Reaching Supabase / Vercel hosts from the sandbox shell or test browser | Blocked | Local dev and E2E tests run against a mock backend. Real-backend integration tests run in GitHub Actions (GitHub runners can reach Supabase). |
| Vercel deploy | Only through the Vercel GitHub integration on push (no CLI token) | Zero-config Next.js. Document env vars. No build step may need network secrets. |

## Required architecture properties
1. **Offline-first single player.** Every single-player mode works with zero network after first load. Online features
   (leaderboards, daily ranking, multiplayer, sharing user quizzes, cloud backup) degrade gracefully with clear UI copy.
2. **Backend behind one TypeScript interface** (e.g. `GameBackend`) with two implementations: `supabase` (RPC + Realtime)
   and `mock` (in-memory/localStorage, deterministic, used by Playwright and local dev). Mode chosen by
   `NEXT_PUBLIC_BACKEND_MODE` (`supabase` | `mock` | `off`).
3. **Guest identity without Supabase Auth.** Client creates a random player id plus a high-entropy secret, stored locally.
   The DB stores only a hash of the secret (pgcrypto). Every write RPC verifies the secret. Offer a "sync code" so a
   player can restore their profile on another device. Rate-limit write RPCs in SQL.
4. **Answer secrecy where it matters.** Questions used by competitive surfaces (daily challenge ranking, live multiplayer)
   must be served without answers and validated server-side, from a sealed pool that never ships in client bundles.
   Casual practice modes may ship answers client-side for instant, offline feedback.
5. **Realtime multiplayer is DB-authoritative.** Room state changes only through RPCs. Clients learn about changes via
   Supabase Realtime (postgres_changes on non-secret state, or broadcast from the database) and must also poll as a
   fallback. Never trust client-sent broadcast messages for scoring.
6. **Timing.** Server timestamps decide competitive scoring. Clients show optimistic timers.
7. **Testability.** Pure, deterministic TypeScript game engine (seeded RNG, injectable clock) with high unit-test coverage.
   SQL functions get SQL-level tests runnable through `execute_sql`, and a GitHub Actions job exercises the real project.
8. **Performance budget.** Fast first load on a mid-range phone over 4G: target LCP < 2.0 s, INP < 200 ms, CLS < 0.05,
   initial JS on the home route around 150 KB gzipped or less. Question packs are code-split / fetched per category and
   cached by the service worker.
9. **Privacy by default.** No third-party trackers at launch, no PII collection required to play, COPPA-safe defaults
   (no open chat, no free-text visible to strangers without moderation).
10. **Free-tier aware.** Respect Supabase free plan and Vercel Hobby limits (connections, realtime messages, DB size,
    function invocations). Prefer static generation and client-side work.
