// @vitest-environment node
/**
 * The header builder in next.config.ts (SEC-1, ARCHITECTURE §10.8): the
 * Content Security Policy for each kind of build, and which headers each
 * path gets. `e2e/security/headers.spec.ts` checks the same headers on a
 * production build's responses. Last, the premise behind the policy's
 * 'unsafe-inline': no code under src/ parses a string as HTML.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";
import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";

import config, {
  contentSecurityPolicy,
  securityHeaderOptionsFor,
  securityHeaderRules,
  supabaseOrigins,
  type HeaderRule,
  type SecurityHeaderOptions,
} from "../../next.config";
import {
  DEFAULT_SUPABASE_URL,
  parsePublicEnv,
  type PublicEnvSource,
} from "../../src/lib/env-parse";

const PROJECT = "https://zcodouduyvxwefxebvmv.supabase.co";
const PROJECT_SOCKET = "wss://zcodouduyvxwefxebvmv.supabase.co";

/** The options a production build made with these variables gets. */
function built(source: PublicEnvSource): SecurityHeaderOptions {
  return securityHeaderOptionsFor(PHASE_PRODUCTION_BUILD, source);
}

/** The policy's directives by name, each with its sources. */
function directivesOf(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of policy.split("; ")) {
    const [name = "", ...sources] = part.split(" ");
    expect(directives.has(name), `${name} appears twice`).toBe(false);
    directives.set(name, sources);
  }
  return directives;
}

function sourcesOf(policy: string, directive: string): string[] | undefined {
  return directivesOf(policy).get(directive);
}

/**
 * Whether Next's router applies a header rule to `path`: the matcher that
 * next/dist/server/lib/router-utils/filesystem.js builds for each header.
 */
function matches(source: string, path: string): boolean {
  const match = getPathMatch(source, {
    strict: true,
    removeUnnamedParams: true,
    regexModifier: (regex) => modifyRouteRegex(regex),
  });
  return match(path) !== false;
}

/** The headers a response for `path` gets: every matching rule, later rules winning. */
function headersFor(rules: HeaderRule[], path: string): Map<string, string> {
  const headers = new Map<string, string>();
  for (const rule of rules) {
    if (!matches(rule.source, path)) continue;
    for (const { key, value } of rule.headers) headers.set(key, value);
  }
  return headers;
}

describe("the Content Security Policy", () => {
  it("is exactly ARCHITECTURE §10.8's policy for the default production build on https", () => {
    const policy = contentSecurityPolicy(
      built({ NEXT_PUBLIC_SITE_URL: "https://knewt.app" }),
    );

    expect(policy).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        `connect-src 'self' ${PROJECT} ${PROJECT_SOCKET}`,
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "media-src 'self'",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
      ].join("; "),
    );
  });

  it("allows the Supabase https and wss origins in Supabase builds, in connect-src alone", () => {
    const policy = contentSecurityPolicy(built({}));

    expect(sourcesOf(policy, "connect-src")).toEqual([
      "'self'",
      PROJECT,
      PROJECT_SOCKET,
    ]);
    for (const [name, sources] of directivesOf(policy)) {
      if (name === "connect-src") continue;
      expect(sources.join(" "), name).not.toContain("supabase");
    }
  });

  it.each(["mock", "off"])(
    "names no Supabase origin in a %s build: connect-src is 'self' alone",
    (mode) => {
      const policy = contentSecurityPolicy(
        built({ NEXT_PUBLIC_BACKEND_MODE: mode }),
      );

      expect(sourcesOf(policy, "connect-src")).toEqual(["'self'"]);
      expect(policy).not.toContain("supabase");
      expect(policy).not.toMatch(/\bwss?:/);
    },
  );

  it("names no Supabase origin when a Supabase build's configuration is unusable and the backend falls back to off", () => {
    const source = { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" };
    expect(parsePublicEnv(source).backendMode).toBe("off");

    expect(contentSecurityPolicy(built(source))).not.toContain("supabase");
  });

  it("follows a custom Supabase project, local http stacks included", () => {
    expect(
      sourcesOf(
        contentSecurityPolicy(
          built({
            NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_custom",
          }),
        ),
        "connect-src",
      ),
    ).toEqual([
      "'self'",
      "https://abcdefgh.supabase.co",
      "wss://abcdefgh.supabase.co",
    ]);
    expect(
      supabaseOrigins({
        url: "http://127.0.0.1:54321",
        publishableKey: "sb_publishable_local",
      }),
    ).toEqual(["http://127.0.0.1:54321", "ws://127.0.0.1:54321"]);
    expect(
      supabaseOrigins({ url: DEFAULT_SUPABASE_URL, publishableKey: "k" }),
    ).toEqual([PROJECT, PROJECT_SOCKET]);
  });

  it("keeps script-src free of hashes and nonces, which would switch off 'unsafe-inline' and block Next's own inline scripts (D16)", () => {
    // Any hash or nonce source makes CSP2 browsers ignore 'unsafe-inline',
    // and every prerendered page carries React's and Next's inline scripts
    // (flight data, boundary runtime, Turbopack bootstrap), different per
    // page and per build. Measured on Home: 28 blocked scripts, no hydration.
    for (const options of [
      built({}),
      built({ NEXT_PUBLIC_BACKEND_MODE: "mock" }),
      built({ NEXT_PUBLIC_VERCEL_ENV: "preview" }),
      securityHeaderOptionsFor(PHASE_DEVELOPMENT_SERVER, {}),
    ]) {
      const scripts = sourcesOf(contentSecurityPolicy(options), "script-src");
      expect(scripts).toContain("'unsafe-inline'");
      expect(scripts?.join(" ")).not.toMatch(
        /'(?:sha256|sha384|sha512|nonce)-|'strict-dynamic'/,
      );
    }
  });

  it("forbids inline event handlers whatever script-src allows", () => {
    expect(
      sourcesOf(contentSecurityPolicy(built({})), "script-src-attr"),
    ).toEqual(["'none'"]);
  });

  it("adds 'unsafe-eval' under next dev only", () => {
    const dev = contentSecurityPolicy(
      securityHeaderOptionsFor(PHASE_DEVELOPMENT_SERVER, {}),
    );
    expect(sourcesOf(dev, "script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
    ]);
    for (const phase of [PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER]) {
      expect(
        contentSecurityPolicy(securityHeaderOptionsFor(phase, {})),
      ).not.toContain("unsafe-eval");
    }
  });

  it("asks for upgrade-insecure-requests only when the site is served over https", () => {
    expect(
      contentSecurityPolicy(
        built({ NEXT_PUBLIC_SITE_URL: "https://knewt.app" }),
      ),
    ).toMatch(/; upgrade-insecure-requests$/);
    // The E2E server and next dev run on http, where an upgrade would break every asset.
    for (const site of ["http://127.0.0.1:3100", "http://localhost:3000"]) {
      expect(
        contentSecurityPolicy(built({ NEXT_PUBLIC_SITE_URL: site })),
      ).not.toContain("upgrade-insecure-requests");
    }
    // Unset, the site URL falls back to the deployment's own https address.
    expect(
      contentSecurityPolicy(
        built({ NEXT_PUBLIC_VERCEL_URL: "knewt-git-x.vercel.app" }),
      ),
    ).toContain("upgrade-insecure-requests");
  });

  it("lets the Vercel toolbar in on preview deployments only", () => {
    const preview = contentSecurityPolicy(
      built({ NEXT_PUBLIC_VERCEL_ENV: "preview" }),
    );
    expect(sourcesOf(preview, "script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://vercel.live",
    ]);
    expect(sourcesOf(preview, "connect-src")).toEqual([
      "'self'",
      PROJECT,
      PROJECT_SOCKET,
      "https://vercel.live",
      "wss://ws-us3.pusher.com",
    ]);
    expect(sourcesOf(preview, "frame-src")).toEqual(["https://vercel.live"]);
    expect(sourcesOf(preview, "style-src")).toContain("https://vercel.live");
    expect(sourcesOf(preview, "font-src")).toContain(
      "https://assets.vercel.com",
    );
    expect(sourcesOf(preview, "img-src")).toContain("https://vercel.com");
    // The page itself still can't be framed by anyone.
    expect(sourcesOf(preview, "frame-ancestors")).toEqual(["'none'"]);

    for (const vercelEnv of ["production", "development", ""]) {
      const policy = contentSecurityPolicy(
        built({ NEXT_PUBLIC_VERCEL_ENV: vercelEnv }),
      );
      expect(policy, vercelEnv).not.toMatch(/vercel|pusher/);
      expect(sourcesOf(policy, "frame-src")).toEqual(["'none'"]);
    }
  });

  it("is one line of unique, well-formed directives", () => {
    for (const options of [
      built({}),
      built({ NEXT_PUBLIC_VERCEL_ENV: "preview" }),
      securityHeaderOptionsFor(PHASE_DEVELOPMENT_SERVER, {
        NEXT_PUBLIC_BACKEND_MODE: "mock",
      }),
    ]) {
      const policy = contentSecurityPolicy(options);
      expect(policy).toMatch(
        /^[a-z-]+(?: [^\s;]+)*(?:; [a-z-]+(?: [^\s;]+)*)*$/,
      );
      expect(directivesOf(policy).get("default-src")).toEqual(["'self'"]);
    }
  });
});

describe("the header rules", () => {
  const rules = securityHeaderRules(built({}));
  const everyResponse = {
    "Content-Security-Policy": contentSecurityPolicy(built({})),
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=()",
  };

  it.each(["/", "/daily", "/practice/run", "/claim/AB12CD34", "/s/42/A1B2"])(
    "give %s the headers every response carries, and no Cache-Control",
    (path) => {
      expect(Object.fromEntries(headersFor(rules, path))).toEqual(
        everyResponse,
      );
    },
  );

  it("give /sw.js no-cache and the scope of the whole site", () => {
    expect(Object.fromEntries(headersFor(rules, "/sw.js"))).toEqual({
      ...everyResponse,
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    });
  });

  it("give packs and answer lists a year of immutable caching", () => {
    for (const path of [
      "/content/packs/geography.0a1b2c3d.json",
      "/content/lists/country.1031827d.json",
    ]) {
      expect(Object.fromEntries(headersFor(rules, path))).toEqual({
        ...everyResponse,
        "Cache-Control": "public, max-age=31536000, immutable",
      });
    }
  });

  it("keep every API answer out of every cache", () => {
    for (const path of ["/api/restore", "/api/identity"]) {
      expect(Object.fromEntries(headersFor(rules, path))).toEqual({
        ...everyResponse,
        "Cache-Control": "no-store",
      });
    }
  });

  it("set Referrer-Policy to no-referrer on every path (PRD §8.4)", () => {
    for (const path of ["/", "/api/identity", "/sw.js", "/content/x.json"]) {
      expect(headersFor(rules, path).get("Referrer-Policy")).toBe(
        "no-referrer",
      );
    }
  });
});

describe("next.config.ts", () => {
  it("serves the rules built from the build's own pinned variables", async () => {
    // Unit tests run with NEXT_PUBLIC_BACKEND_MODE=mock (vitest.config.mts).
    const headers = await config(PHASE_PRODUCTION_BUILD).headers?.();

    expect(headers).toEqual(
      securityHeaderRules(securityHeaderOptionsFor(PHASE_PRODUCTION_BUILD)),
    );
    const policy = headers?.[0]?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value;
    expect(policy).toBeDefined();
    expect(sourcesOf(policy ?? "", "connect-src")).toEqual(["'self'"]);
    expect(policy).not.toContain("unsafe-eval");
  });

  it("adds 'unsafe-eval' to the policy next dev serves", async () => {
    const headers = await config(PHASE_DEVELOPMENT_SERVER).headers?.();
    const policy = headers?.[0]?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value;

    expect(sourcesOf(policy ?? "", "script-src")).toContain("'unsafe-eval'");
  });
});

const SRC = resolve(__dirname, "../../src");

/**
 * DOM APIs that parse a string as HTML. Under 'unsafe-inline', markup that
 * reaches one can run script even with script-src-attr 'none': a
 * `javascript:` link runs when clicked, and a <script> from
 * createContextualFragment runs once inserted (measured in Chromium).
 */
const HTML_SINKS: readonly (readonly [string, RegExp])[] = [
  ["innerHTML", /\.innerHTML\b/g],
  ["outerHTML", /\.outerHTML\b/g],
  ["insertAdjacentHTML", /\.insertAdjacentHTML\b/g],
  ["setHTMLUnsafe", /\.setHTMLUnsafe\b/g],
  ["parseHTMLUnsafe", /\bparseHTMLUnsafe\b/g],
  ["createContextualFragment", /\.createContextualFragment\b/g],
  ["document.write", /\bdocument\s*\.\s*write(?:ln)?\b/g],
  ["srcdoc", /\bsrcdoc\b/gi],
  ["dangerouslySetInnerHTML", /\bdangerouslySetInnerHTML\b/g],
];

/**
 * The calls the policy allows, each fed only a build-time constant, with
 * how often each file may make it: the inline boot and intro scripts, and
 * the toast's icon SVG from ICON_PATHS.
 */
const ALLOWED_HTML_SINKS = new Map([
  ["src/ui/inline-script.tsx: dangerouslySetInnerHTML", 1],
  ["src/ui/toast.ts: insertAdjacentHTML", 1],
]);

/** One entry per HTML sink in `text`, by name. */
function htmlSinksIn(text: string): string[] {
  return HTML_SINKS.flatMap(([name, pattern]) =>
    Array.from(text.matchAll(pattern), () => name),
  );
}

/** The code under `dir` that ships: tests and their helpers left out, as ESLint's TEST_FILES does. */
function* shippedSources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__fixtures__" || path === join(SRC, "test")) continue;
      yield* shippedSources(path);
    } else if (
      /\.[cm]?[jt]sx?$/.test(entry.name) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
    ) {
      yield path;
    }
  }
}

describe("the premise of 'unsafe-inline' (D16)", () => {
  it("knows the DOM APIs that parse a string as HTML", () => {
    expect(
      htmlSinksIn(
        'a.innerHTML = s; b.outerHTML; c.insertAdjacentHTML("x", s); d.setHTMLUnsafe(s); Document.parseHTMLUnsafe(s); range.createContextualFragment(s); document.write(s); document.writeln(s); <iframe srcDoc={s} />; <div dangerouslySetInnerHTML={x} />; el.textContent = s;',
      ),
    ).toEqual([
      "innerHTML",
      "outerHTML",
      "insertAdjacentHTML",
      "setHTMLUnsafe",
      "parseHTMLUnsafe",
      "createContextualFragment",
      "document.write",
      "document.write",
      "srcdoc",
      "dangerouslySetInnerHTML",
    ]);
  });

  it("holds in src/: nothing parses a string as HTML but the two calls fed build-time constants", () => {
    const found = new Map<string, number>();
    let files = 0;
    for (const path of shippedSources(SRC)) {
      files += 1;
      const file = relative(resolve(SRC, ".."), path).split(sep).join("/");
      for (const name of htmlSinksIn(readFileSync(path, "utf8"))) {
        const sink = `${file}: ${name}`;
        found.set(sink, (found.get(sink) ?? 0) + 1);
      }
    }

    expect(files).toBeGreaterThan(100);
    // Build the nodes instead (createElement, textContent, React), so no
    // nickname, quiz title or toast text is ever parsed as markup. ESLint
    // takes this over once it bans these APIs (a PLT-1/CI-1 follow-up).
    expect(
      [...found]
        .filter(([sink, count]) => count > (ALLOWED_HTML_SINKS.get(sink) ?? 0))
        .map(([sink, count]) => `${sink} (${count})`),
    ).toEqual([]);
  });
});
