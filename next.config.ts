import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Relative imports: the "@/" alias is not resolved for next.config.ts.
import { shellRewrites } from "./src/features/shell/shell-routes";
import {
  DEFAULT_SUPABASE_URL,
  PUBLIC_ENV_NAMES,
  findPrivilegedPublicKeys,
  parsePublicEnv,
} from "./src/lib/env-parse";

// NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so
// a privileged Supabase key has to stop the build right here. The runtime
// refusal in src/lib/env.ts stays as a second layer, but it only keeps the
// app from using such a key after it has already shipped.
const privilegedKeys = findPrivilegedPublicKeys(process.env);
if (privilegedKeys.length > 0) {
  throw new Error(
    `${privilegedKeys.join(", ")} must not hold an sb_secret_ or service_role key. NEXT_PUBLIC_ values are inlined into the browser bundle, so every visitor would get it. Use the publishable key instead, and rotate the key if an earlier build shipped it.`,
  );
}

/**
 * Every public variable, pinned at build time.
 *
 * Next.js only inlines NEXT_PUBLIC_* variables that are set when it builds.
 * An unset one stays a live process.env read, so the server would see the
 * runtime value while the browser sees undefined. Pinning unset names to ""
 * (which src/lib/env.ts treats as unset) keeps both sides identical.
 */
const publicEnv = Object.fromEntries(
  PUBLIC_ENV_NAMES.map((name) => [name, process.env[name] ?? ""]),
);

/**
 * Baseline security headers sent with every response.
 *
 * - The Content-Security-Policy only covers directives that cannot break
 *   rendering (framing, <base>, plugins). Grow it here, without nonces.
 *   Nonces force every page to render per request, which would switch off
 *   the static prerendering that Cache Components gives us (see "Static vs
 *   Dynamic Rendering with CSP" in
 *   node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 *   The plan follows that guide's "Without Nonces" policy: default-src
 *   'self'; script-src 'self' 'unsafe-inline' ('unsafe-eval' only in
 *   development); style-src 'self' 'unsafe-inline'; img-src 'self' blob:
 *   data:; connect-src 'self' plus the Supabase https:// and wss:// origins
 *   from parsePublicEnv(); form-action 'self'; plus the three directives
 *   below. Vercel preview deployments inject the toolbar from vercel.live,
 *   so allow it there or turn the toolbar off. Evaluate experimental.sri
 *   (hash-based script integrity) at the same time. Proxy-generated nonces
 *   only make sense for routes that are dynamic anyway.
 * - Strict-Transport-Security is added by Vercel on every deployment, so it
 *   is not repeated here.
 * - Permissions-Policy only switches off APIs the app has no use for. Keep
 *   web-share, clipboard-write and fullscreen available for result sharing.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  // Cache Components and Partial Prefetching are the create-next-app 16.4
  // defaults and become always-on in the next major. Data access is dynamic
  // by default: anything that reads cookies() or headers() must render
  // inside <Suspense>, and cached work opts in with "use cache".
  cacheComponents: true,
  partialPrefetching: true,
  // Type-check <Link href> and router navigation against real routes.
  typedRoutes: true,
  reactStrictMode: true,
  poweredByHeader: false,
  env: publicEnv,
  turbopack: {
    rules: {
      // Tailwind CSS v4 runs as a Turbopack loader (no PostCSS config).
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Per-user paths (/c/:code, /g/:groupId, /claim/:token, ...) are served
  // from one static shell page each (ARCHITECTURE §10.1), so no code or
  // token costs a render or sits in a cached page. A plain array: Next
  // applies it after the filesystem, so real pages such as /g/new, /join and
  // /create/import still win. The table is src/features/shell/shell-routes.ts.
  async rewrites() {
    return shellRewrites();
  },
};

/** Names the backend a build talks to, so the build log shows it. */
function describeBackend(): string {
  const { backendMode, supabase } = parsePublicEnv(publicEnv);
  if (supabase === null) return backendMode;
  const project =
    supabase.url === DEFAULT_SUPABASE_URL
      ? "the default project"
      : "a custom project";
  return `${backendMode} at ${supabase.url} (${project})`;
}

export default function config(phase: string): NextConfig {
  // `next build` loads this file again in its compile worker, which inherits
  // the environment. The flag keeps the build log to a single line.
  if (
    phase === PHASE_PRODUCTION_BUILD &&
    process.env.QUIZ_BACKEND_LOGGED !== "1"
  ) {
    process.env.QUIZ_BACKEND_LOGGED = "1";
    console.log(`[env] Backend for this build: ${describeBackend()}`);
  }
  return nextConfig;
}
