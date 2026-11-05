import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";

// Relative imports: the "@/" alias is not resolved for next.config.ts.
import { shellRewrites } from "./src/features/shell/shell-routes";
import {
  DEFAULT_SUPABASE_URL,
  PUBLIC_ENV_NAMES,
  findPrivilegedPublicKeys,
  parsePublicEnv,
  type SupabaseConfig,
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

/** What the security headers depend on. All of it is fixed when the build runs. */
export interface SecurityHeaderOptions {
  /** The build's Supabase project; null in mock and off builds. */
  supabase: SupabaseConfig | null;
  /** The site URL. An https site also asks browsers to upgrade stray http requests. */
  siteUrl: string;
  /** NEXT_PUBLIC_VERCEL_ENV. Only "preview" lets the Vercel toolbar in. */
  vercelEnv: string | undefined;
  /** `next dev`: React's development build uses eval for its debugging aids. */
  development: boolean;
}

/** One response header, as `headers()` takes it. */
export interface HeaderEntry {
  key: string;
  value: string;
}

/** The headers sent with every response whose path matches `source`. */
export interface HeaderRule {
  source: string;
  headers: HeaderEntry[];
}

const SELF = "'self'";
const NONE = "'none'";

/**
 * What Vercel's toolbar needs on preview deployments, where Vercel injects
 * it from vercel.live: its script and its iframe, its styles, fonts and
 * avatars, and the Pusher socket behind live comments. The list follows
 * the "Using a Content Security Policy" section of
 * https://vercel.com/docs/vercel-toolbar/managing-toolbar (read through a
 * web search on 5 November 2026, since the sandbox can't reach the page).
 * Production and local builds never carry it.
 */
const VERCEL_TOOLBAR: Readonly<Record<string, readonly string[]>> = {
  "script-src": ["https://vercel.live"],
  "style-src": ["https://vercel.live"],
  "img-src": ["https://vercel.live", "https://vercel.com"],
  "font-src": ["https://vercel.live", "https://assets.vercel.com"],
  "connect-src": ["https://vercel.live", "wss://ws-us3.pusher.com"],
  "frame-src": ["https://vercel.live"],
};

/** The project's REST origin and its Realtime socket: https://ref.supabase.co and wss://ref.supabase.co. */
export function supabaseOrigins(supabase: SupabaseConfig | null): string[] {
  if (supabase === null) return [];
  const { protocol, host } = new URL(supabase.url);
  const socket = protocol === "https:" ? "wss:" : "ws:";
  return [`${protocol}//${host}`, `${socket}//${host}`];
}

/**
 * The Content Security Policy of ARCHITECTURE §10.8, for one build.
 *
 * **No nonces and no hashes (D16).** A nonce forces every page to render
 * per request, which switches off the prerendering that Cache Components
 * gives us (node_modules/next/dist/docs/01-app/02-guides/
 * content-security-policy.md, "Static vs Dynamic Rendering with CSP").
 * Hashes fail differently: every prerendered page carries inline scripts
 * from React and Next (the `self.__next_f.push(...)` flight data, React's
 * `$RB`/`$RV` boundary runtime, Turbopack's bootstrap) that differ on every
 * page and in every build, while `headers()` is fixed before any page
 * renders. And once `script-src` holds a single hash, every CSP2 browser
 * ignores `'unsafe-inline'` and blocks every inline script without one:
 * measured on Home with only the boot and intro scripts' hashes added,
 * Chromium blocked 28 inline scripts and the page never hydrated. So
 * `script-src` stays `'self' 'unsafe-inline'`, the one policy a
 * prerendered App Router page can carry, and the app's own inline scripts
 * (the boot script, Today's intro, the date slot) run under it.
 *
 * What keeps that narrow: no script comes from another origin, and
 * `script-src-attr 'none'` forbids inline event handlers, the usual way
 * markup injected through innerHTML runs code (React never renders one).
 * That rule alone isn't enough. Under 'unsafe-inline' an injected
 * `javascript:` link still runs when clicked, and a <script> parsed by
 * createContextualFragment runs once inserted (measured in Chromium). So
 * the policy also rests on no DOM API parsing a string as HTML unless the
 * string is a build-time constant: `dangerouslySetInnerHTML` only in
 * src/ui/inline-script.tsx, and insertAdjacentHTML only for the toast's
 * icon from ICON_PATHS (src/ui/toast.ts).
 * scripts/checks/security-headers.test.ts fails on any other such call
 * under src/ until ESLint bans them (a PLT-1/CI-1 follow-up).
 * `e2e/security/headers.spec.ts` proves the app's inline scripts run under
 * this policy, and every E2E test fails on a console error, which is how
 * Chromium reports a violation.
 *
 * Per build: the Supabase https and wss origins only when the backend is
 * Supabase (mock and off builds talk to 'self' alone); `'unsafe-eval'` only
 * under `next dev`; `upgrade-insecure-requests` only for an https site, so
 * a local http server keeps working; the toolbar's origins only on Vercel
 * preview deployments. `worker-src blob:` is realtime-js's heartbeat worker
 * (src/backend/supabase/client.ts).
 */
export function contentSecurityPolicy(options: SecurityHeaderOptions): string {
  const toolbar = (directive: string): readonly string[] =>
    options.vercelEnv === "preview" ? (VERCEL_TOOLBAR[directive] ?? []) : [];
  const frames = toolbar("frame-src");
  const directives: [string, ...string[]][] = [
    ["default-src", SELF],
    [
      "script-src",
      SELF,
      "'unsafe-inline'",
      ...(options.development ? ["'unsafe-eval'"] : []),
      ...toolbar("script-src"),
    ],
    ["script-src-attr", NONE],
    ["style-src", SELF, "'unsafe-inline'", ...toolbar("style-src")],
    ["img-src", SELF, "data:", "blob:", ...toolbar("img-src")],
    ["font-src", SELF, ...toolbar("font-src")],
    [
      "connect-src",
      SELF,
      ...supabaseOrigins(options.supabase),
      ...toolbar("connect-src"),
    ],
    ["worker-src", SELF, "blob:"],
    ["manifest-src", SELF],
    ["media-src", SELF],
    ["frame-src", ...(frames.length > 0 ? frames : [NONE])],
    ["object-src", NONE],
    ["base-uri", SELF],
    ["form-action", SELF],
    ["frame-ancestors", NONE],
  ];
  if (new URL(options.siteUrl).protocol === "https:") {
    directives.push(["upgrade-insecure-requests"]);
  }
  return directives.map((directive) => directive.join(" ")).join("; ");
}

/**
 * Every response header we set (ARCHITECTURE §10.8, PRD §8.4).
 *
 * - Every path: the CSP; `Referrer-Policy: no-referrer`, so no address (a
 *   claim link, a Group invite) ever leaves in a Referer; `nosniff`;
 *   framing refused twice (`X-Frame-Options` for old browsers beside
 *   `frame-ancestors`); `Cross-Origin-Opener-Policy: same-origin`; and a
 *   Permissions-Policy that switches off powerful APIs the app never uses,
 *   leaving Web Share and the clipboard for sharing results. The identity
 *   routes don't need a Referer: src/platform/identity/backup.ts calls them
 *   in fetch's default cors mode, so a POST still carries the page's own
 *   Origin. (A `mode: "same-origin"` request would send `Origin: null` under
 *   no-referrer, which the routes refuse; AC-CKE-01's spec catches that.)
 * - `/sw.js`: revalidated on every update check, and allowed to control
 *   the whole site (§10.7).
 * - `/content/*`: packs and answer lists have hashed URLs, so a copy never
 *   goes stale (§1.4 item 15).
 * - `/api/*`: the identity routes, never cached anywhere.
 *
 * Vercel adds Strict-Transport-Security on every deployment, so it is not
 * repeated here, and Next serves `/_next/static/*` as immutable itself.
 */
export function securityHeaderRules(
  options: SecurityHeaderOptions,
): HeaderRule[] {
  return [
    {
      source: "/:path*",
      headers: [
        {
          key: "Content-Security-Policy",
          value: contentSecurityPolicy(options),
        },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        {
          key: "Permissions-Policy",
          value:
            "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=()",
        },
      ],
    },
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
    {
      source: "/content/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
    {
      source: "/api/:path*",
      headers: [{ key: "Cache-Control", value: "no-store" }],
    },
  ];
}

/** The header options for `phase`, from a build's pinned public variables. */
export function securityHeaderOptionsFor(
  phase: string,
  env: Readonly<Record<string, string | undefined>> = publicEnv,
): SecurityHeaderOptions {
  const { supabase, siteUrl } = parsePublicEnv(env);
  return {
    supabase,
    siteUrl,
    vercelEnv: env.NEXT_PUBLIC_VERCEL_ENV?.trim() || undefined,
    development: phase === PHASE_DEVELOPMENT_SERVER,
  };
}

/*
 * experimental.sri (hash-based Subresource Integrity), evaluated for SEC-1
 * on a mock build with { algorithm: "sha256" } (5 November 2026): left off.
 *
 * - It builds and plays (Home, then the Daily to clue 1, no console error),
 *   but it covers little. Only the `<script src>` tags Next renders into
 *   the HTML get an `integrity` attribute: 6 of the 9 in Home's HTML. The
 *   chunks Turbopack's runtime loads afterwards get none, which is most of
 *   them: 6 of 28 script tags on Home carried one, and still 6 of 37 once
 *   the Daily had loaded its backend with import().
 * - It does nothing for inline scripts, so 'unsafe-inline' stays (see
 *   contentSecurityPolicy above).
 * - Every script we ship is same-origin, from a content-hashed, immutable
 *   URL over HTTPS, so the tampering it guards against is already out of
 *   reach, while a flag that refuses a chunk whose bytes changed in transit
 *   (a proxy that rewrites scripts, say) could take a page down
 *   mid-question.
 *
 * Revisit when it leaves experimental and covers runtime-loaded chunks.
 */

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
  const headerOptions = securityHeaderOptionsFor(phase);
  return {
    ...nextConfig,
    // Evaluated when the build runs and stored in routes-manifest.json,
    // which `next start` and Vercel both serve from, so a build's headers
    // follow the variables it was built with.
    async headers() {
      return securityHeaderRules(headerOptions);
    },
  };
}
