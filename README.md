# quiz-web-app

A web app for creating and playing quiz games.

> **Status:** project foundation. The product experience is still being
> designed, so the home page is a placeholder.

## Stack

| Area        | Tool                                                | Version                           |
| ----------- | --------------------------------------------------- | --------------------------------- |
| Framework   | Next.js, App Router, Turbopack                      | 16.4.3                            |
| UI          | React                                               | 19.3.1                            |
| Language    | TypeScript (`strict`, `noUncheckedIndexedAccess`)   | 5.9.3                             |
| Styling     | Tailwind CSS v4, CSS-first config                   | 4.3.3                             |
| Backend     | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) | 0.12.7, 2.118.0                   |
| Unit tests  | Vitest, Testing Library, jsdom                      | 5.0.5                             |
| E2E tests   | Playwright                                          | 1.63.0                            |
| Lint/format | ESLint 9 with `eslint-config-next`, Prettier        | 9.39.5, 3.9.10                    |
| Runtime     | Node.js                                             | 22.x, at least 22.22.2 (`.nvmrc`) |

## Getting started

You need Node.js 22.22.2 or newer on the 22.x line, and npm 10. Test
dependencies such as jsdom need that floor, and npm only warns about it. With
nvm, run `nvm install`: it reads `.nvmrc` and fetches the latest 22.x. A bare
`nvm use` can pick an older 22.x that is already installed.

```bash
nvm install
npm ci
cp .env.example .env.local   # optional: every variable has a safe default
npm run dev
```

Then open http://localhost:3000.

Can't reach Supabase from your machine (a locked-down network or sandbox, for
example)? Set `NEXT_PUBLIC_BACKEND_MODE=mock` in `.env.local` and the app runs
without any network backend.

## Scripts

| Command                | What it does                                                              |
| ---------------------- | ------------------------------------------------------------------------- |
| `npm run dev`          | Dev server with Turbopack on port 3000.                                   |
| `npm run build`        | Production build. Also type-checks the whole project with `tsc`.          |
| `npm run start`        | Serves the production build.                                              |
| `npm run lint`         | ESLint. Any warning fails the run.                                        |
| `npm run lint:fix`     | ESLint with autofix.                                                      |
| `npm run typecheck`    | `next typegen` (route types, `next-env.d.ts`), then `tsc --noEmit`.       |
| `npm test`             | Unit tests, single run.                                                   |
| `npm run test:watch`   | Unit tests in watch mode.                                                 |
| `npm run test:e2e`     | Playwright. Builds and starts the app on port 3100 with the mock backend. |
| `npm run check:bundle` | Gzipped first-load JS per route against the budget. Run after a build.    |
| `npm run format`       | Formats the repo with Prettier (sorts Tailwind classes too).              |
| `npm run format:check` | Fails if anything is unformatted. CI runs this.                           |
| `npm run check`        | Lint, typecheck and unit tests in one go. Run it before you push.         |

## Configuration

All configuration is public and read in one place: `src/lib/env.ts`. The
parsing itself lives in `src/lib/env-parse.ts`, which `next.config.ts` shares.
Code imports helpers from `@/lib/env` and never reads `process.env` for public
values. ESLint enforces this, bracket lookups and destructuring included,
because Next.js only inlines literal `process.env.NAME` reads.

`next.config.ts` pins every public variable at build time (unset ones as empty
strings), so the server and the browser always see the same values. Changing
a value needs a rebuild, or a restart of `next dev`.

| Variable                               | Default                     | Purpose                                                      |
| -------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| `NEXT_PUBLIC_BACKEND_MODE`             | `supabase`                  | `supabase`, `mock` or `off`. See below.                      |
| `NEXT_PUBLIC_SUPABASE_URL`             | the project URL             | Supabase project URL.                                        |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project publishable key | Supabase publishable key.                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`        | unset                       | Legacy JWT key, read only when the publishable key is unset. |
| `NEXT_PUBLIC_SITE_URL`                 | Vercel URL, else localhost  | Canonical site URL for metadata, share links and redirects.  |

Backend modes:

| Mode       | Meaning                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| `supabase` | The real Supabase project. What production uses.                               |
| `mock`     | In-app mock backend with no network calls. E2E tests and offline development.  |
| `off`      | No backend at all. Backend features hide or fall back to local-only behaviour. |

How the env module behaves:

- It never throws. A broken value falls back to a safe default, shows up in
  `env.issues` and is logged once with `console.warn`.
- With no Supabase variables at all, it uses the project's built-in public URL
  and publishable key, so a fresh Vercel deploy works with zero setup.
- A custom `NEXT_PUBLIC_SUPABASE_URL` needs its own key. If the key is missing,
  or the URL is invalid, the backend switches to `off` instead of failing at
  runtime.
- The build fails if any `NEXT_PUBLIC_` variable holds an `sb_secret_` or
  `service_role` key, because `NEXT_PUBLIC_` values are inlined into the
  browser bundle (`next.config.ts` checks before anything is compiled). At
  runtime such a key is also ignored.
- A URL and a key from different projects switch the backend to `off` when
  the mismatch is detectable: the built-in key paired with a custom URL, or a
  legacy JWT key whose `ref` claim names another project. Publishable keys
  carry no project id, so always set the URL and the key together.
- The site URL comes from `NEXT_PUBLIC_SITE_URL`, then Vercel's production or
  preview URL (`NEXT_PUBLIC_VERCEL_*` system variables), then
  `http://localhost:3000`.
- Variables exported in your shell (or set on Vercel, for example by the
  Supabase integration) win over `.env*` files, one name at a time.
  `npm run build` prints the backend it uses
  (`[env] Backend for this build: ...`). If that names the wrong project, run
  `env | grep NEXT_PUBLIC` before anything else. Unit tests and the E2E build
  blank these variables, so they never depend on your shell.

Helpers: `getBackendMode()`, `isBackendEnabled()` (a backend exists: supabase
or mock), `isSupabaseEnabled()` (the real project is in use),
`isMockBackend()`, `getSupabaseConfig()`, `getSiteUrl()` and the parsed `env`
object.

## Supabase

Three clients live in `src/lib/supabase/`. Each returns (or resolves to) `null`
when the real backend is not in use (mock or off mode, or an unusable config),
so callers branch instead of crashing.

| Function                             | Where                                               | Notes                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSupabaseBrowserClient()`         | Client Components                                   | Async singleton. Loads the SDK on first use, outside the initial bundle. Await it in effects or handlers, not during render (`null` on the server). |
| `createSupabasePublicServerClient()` | Server code, including `"use cache"`                | No cookies and no session. Use it for public data such as leaderboards. Cache-friendly.                                                             |
| `getSupabaseServerClient()`          | Server Components, Server Functions, Route Handlers | Request-scoped and cookie-aware. Always reads `cookies()`, so render it inside `<Suspense>`.                                                        |

Notes:

- The app does not use Supabase Auth (see
  `docs/01-ENGINEERING-CONSTRAINTS.md`), so there is no session-refresh proxy.
  In Next.js 16, middleware is called Proxy and lives in `src/proxy.ts`. Add one
  only if Supabase Auth sessions are ever adopted.
- `src/lib/supabase/database.types.ts` is generated. Regenerate it after every
  migration with the Supabase MCP tool `generate_typescript_types` (project
  ref `zcodouduyvxwefxebvmv`), or with
  `npx supabase gen types typescript --project-id zcodouduyvxwefxebvmv`.
  Don't edit it by hand.

## Testing

### Unit tests (Vitest)

- Tests sit next to the code they cover as `*.test.ts(x)` or `*.spec.ts(x)`
  under `src/`. Vitest only collects files under `src/`, so Playwright specs
  in `e2e/` never leak in.
- The default environment is jsdom. Server-only modules can opt into Node with
  a `// @vitest-environment node` comment at the top of the file.
- Matchers from `@testing-library/jest-dom` are registered globally. Mocks,
  stubbed globals and stubbed env vars reset between tests.
- `renderWithUser()` from `@/test/render` renders a component and returns a
  ready `user-event` session.
- Every public variable is blank in unit tests, except
  `NEXT_PUBLIC_BACKEND_MODE`, which is `mock`.
- Async Server Components can't be unit tested yet. Cover them with E2E tests.

### End-to-end tests (Playwright)

- Specs live in `e2e/` as `*.spec.ts` and import `test` and `expect` from
  `e2e/fixtures.ts`. Its fixtures fail any test whose page logs a console
  error, throws an uncaught exception, or tries to reach any host but the app
  under test. Such requests and WebSockets are aborted, so a stray real
  Supabase call or third-party script fails the run even on CI runners that
  could reach the host.
- `npm run test:e2e` runs `next build` and `next start` on
  http://127.0.0.1:3100 with `NEXT_PUBLIC_BACKEND_MODE=mock`,
  `NEXT_PUBLIC_SITE_URL` set to that origin and every other public variable
  blank. Then it runs every spec on two projects: `desktop-chromium` and
  `mobile-chromium` (Pixel 7).
- Set `E2E_PORT` to change the port (default 3100), and `E2E_REUSE_SERVER=1`
  to reuse a server already listening on it. Reuse is off by default, so a
  server from another worktree, or one built without the mock backend, is
  never tested by mistake: the run fails because the port is taken.
- Visited routes stay in the DOM, hidden (see "Visited routes stay mounted"
  below). Locate elements with `getByRole` or `getByLabel`, which skip hidden
  content, or add `.filter({ visible: true })` to CSS locators.
- The HTML report lands in `playwright-report/`. Open it with
  `npx playwright show-report`.
- Browsers: on a fresh machine, run `npx playwright install chromium` once.
  Environments with browsers already provisioned (such as the agent sandbox,
  where `PLAYWRIGHT_BROWSERS_PATH` is set) need no install step.

## Project structure

```text
.github/workflows/ci.yml   CI: lint, format, typecheck, unit tests, build, E2E
docs/                      Research and product docs (owned by the product team)
e2e/                       Playwright specs and shared fixtures
scripts/                   Repo scripts (bundle budget check)
src/app/                   App Router routes, root layout, globals.css (tokens)
src/lib/env.ts             Typed, crash-proof public configuration
src/lib/env-parse.ts       Pure config parsing, shared with next.config.ts
src/lib/supabase/          Supabase clients and generated database types
src/test/                  Unit test helpers
next.config.ts             Security headers, Cache Components, env pinning, key guard
playwright.config.ts       E2E setup (production build, mock backend)
vitest.config.mts          Unit test setup
```

## Working with Next.js 16

This version differs from older Next.js in ways that trip people up (and AI
agents trained on older docs). The version-matched docs ship in
`node_modules/next/dist/docs/`. Check them before using an API you are unsure
of. `AGENTS.md` says the same and is maintained by `next dev`; commit it as is.

- **Cache Components and Partial Prefetching are on.** Data access is dynamic
  by default. Anything that reads `cookies()`, `headers()` or uncached data
  must render inside `<Suspense>`, or the build fails. Opt into caching with
  `"use cache"` and `cacheLife`. Route segment configs such as `dynamic`,
  `revalidate`, `fetchCache`, `dynamicParams` and `runtime` are not supported.
- **Visited routes stay mounted.** With Cache Components, Next.js keeps up to
  three visited routes inside a hidden React `<Activity>` (`display: none`)
  instead of unmounting them. A game screen left mid-question still holds its
  state when the player comes back. While hidden, effects are cleaned up, and
  they run again on return, so timers belong in effects with a cleanup. State
  that must reset when the player leaves goes in an effect or layout-effect
  cleanup, or behind a `key`. `<audio>` and `<video>` keep playing while
  hidden, so pause them in a cleanup. Details:
  `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`.
- **Typed routes are on.** `<Link href>` and router calls are checked against
  real routes at compile time.
- **Middleware is now Proxy** (`src/proxy.ts`), and `next lint` is gone: lint
  runs through the ESLint CLI.
- **Generated files:** `next-env.d.ts` and `.next/types` are recreated by
  `next dev`, `next build` and `next typegen`, and are git-ignored. Use
  `npm run typecheck` rather than a bare `tsc` on a fresh clone.
- **Tailwind** runs as a Turbopack loader configured in `next.config.ts`,
  the same setup `create-next-app` 16.4 writes. There is no PostCSS config.
  Theme tokens live in `src/app/globals.css` under `@theme`. The loader only
  exists under Turbopack: `next build --webpack` or a PostCSS-based tool
  (Storybook, for example) would get no utilities and report no error. If one
  is ever adopted, switch to `@tailwindcss/postcss` with a
  `postcss.config.mjs` and remove the Turbopack rule in the same change.

## CI

`.github/workflows/ci.yml` runs on pull requests, on pushes to `main` and on
manual dispatch. A pull request covers its branch, so a pushed branch without
one gets no run: open a draft pull request, or start the workflow by hand
(`gh workflow run CI --ref <branch>`). A newer push cancels the stale run for
the same pull request (never on `main`). Two jobs run in parallel on Node 22
with the npm cache:

1. **verify:** `npm ci`, lint, format check, typecheck, unit tests, build,
   then the bundle budget (`npm run check:bundle`: gzipped first-load JS on
   `/` must stay at or under 150 kB, per
   `docs/01-ENGINEERING-CONSTRAINTS.md`).
2. **e2e:** `npm ci`, install Playwright Chromium, run the E2E suite. When it
   fails, the HTML report is uploaded as the `playwright-report` artifact.

## Deployment

The app is zero-config on Vercel: import the repository, keep the detected
Next.js preset, and every push deploys through the Vercel GitHub integration.
Node 22 comes from `engines` in `package.json`. All environment variables are
optional (see the table above). Set `NEXT_PUBLIC_SITE_URL` once a custom
domain exists.

Before the first deploy, check the Vercel project's environment variables. Any
`NEXT_PUBLIC_SUPABASE_*` value must belong to project `zcodouduyvxwefxebvmv`
(or be removed, so the built-in values apply). The Supabase integration also
adds server-only secrets such as `SUPABASE_SERVICE_ROLE_KEY`; never map one of
those to a `NEXT_PUBLIC_` name. The build log shows which backend each
deployment was built with.

Every response carries baseline security headers from `next.config.ts`:
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
`X-Frame-Options` and a minimal `Content-Security-Policy`
(`frame-ancestors`, `base-uri`, `object-src`). Vercel adds
`Strict-Transport-Security` itself. The CSP will grow in place without
nonces: a nonce forces every page to render per request, which would switch
off the static prerendering that Cache Components gives us. The planned policy
is described above `securityHeaders` in `next.config.ts`.

## License

[MIT](./LICENSE)
