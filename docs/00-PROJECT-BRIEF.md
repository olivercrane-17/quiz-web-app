# Project Brief (read this first)

## Mission
Build a market-ready, genuinely fun and habit-forming quiz web app. The README's original intent is "a web app for
creating and playing quiz games", so both playing and creating quizzes are in scope. Quality bar: something a
real studio would be proud to launch publicly. Every decision should trace back to research about what makes quiz
apps succeed and fail (see `docs/research/`).

## How we work (mirrors a product studio)
1. Discovery research (docs/research/*.md, synthesized in docs/research/SYNTHESIS.md)
2. Product definition: docs/PRD.md, docs/DESIGN.md, docs/ARCHITECTURE.md, docs/CONTENT_GUIDE.md
3. Foundation (platform team), then feature teams on branches, each change reviewed before merge
4. Content team produces and independently fact-checks the question bank
5. QA: unit + E2E + persona playtests + adversarial audits (security, a11y, perf, UX, content) until dry
6. Launch readiness: PWA, SEO, legal pages, performance budget, deploy

## Environment facts every agent must respect
- Repo: /home/user/quiz-web-app, git branch `claude/sleepy-hamilton-p0f789`. Do NOT push and do NOT commit unless your
  task explicitly says so (the orchestrator commits at checkpoints).
- Today is 2026-10-31. Model knowledge ends around mid-2026: never rely on facts that may have changed recently
  (current office holders, "latest" records, sports champions of 2026, prices, etc.).
- Machine: 4 CPUs, 15 GB RAM. Do not run several heavy builds at once; keep long-running dev servers stopped when done.
- Network from the shell: npm registry and GitHub API work. Vercel, Supabase hosts and most websites are BLOCKED from
  curl/the browser. Web research must use the WebSearch tool (load it with ToolSearch query `select:WebSearch`).
- Supabase project (Postgres 17, free plan): ref `zcodouduyvxwefxebvmv`,
  URL `https://zcodouduyvxwefxebvmv.supabase.co`, publishable key `sb_publishable_u6KrUSv5WrxoakIDBd1i4w_4JPB01ts`
  (safe for client code). Reachable ONLY through the Supabase MCP tools (load via ToolSearch, e.g.
  `select:mcp__Supabase__apply_migration,mcp__Supabase__execute_sql`), never from the shell or the test browser.
  Therefore the app must run and be testable locally without Supabase (graceful degradation + mock backend for tests).
- Vercel: no CLI token and no deploy tool in this sandbox. The app must be zero-config deployable on Vercel
  (Next.js), with env vars documented in `.env.example`.
- Playwright: Chromium is pre-installed for Playwright 1.63.0. Pin `@playwright/test` to exactly `1.63.0`. Never run
  `playwright install`. If needed, `executablePath: '/opt/pw-browsers/chromium'` (dir also has chromium-1243).
- Latest stable versions on npm today: next 16.4.3, react 19.3.1, tailwindcss 4.3.3, @supabase/supabase-js 2.118.0,
  @supabase/ssr 0.12.7, motion 14.9.0, vitest 5.0.5. These may postdate your training: read the package's bundled docs
  / type definitions in node_modules before using APIs you are unsure about.

## Writing style for every doc, report, and piece of user-facing copy
- Natural, human, direct. Vary sentence length: mix short punchy sentences with longer ones.
- Never use em dashes. Use commas, periods, colons, or parentheses instead.
- Never use: delve, tapestry, crucial, bustling, seamless, testament, landscape, multifaceted, paramount, underscore, utilize.
- No "It's not just X, it's Y" constructions and no "Not only... but also".
- Avoid perfectly balanced groups of three adjectives/examples; use two or four.
- Never start sentences with: Moreover, Furthermore, Additionally, In addition, Consequently, "It is important to note
  that", "Generally speaking".
- Cite sources (URLs) for research claims.
