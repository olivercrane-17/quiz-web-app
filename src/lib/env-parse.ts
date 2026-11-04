/**
 * Pure parsing of the public configuration: no globals, no side effects.
 *
 * Two places feed raw values in. `src/lib/env.ts` does it at runtime, and
 * `next.config.ts` does it at build time to stop unsafe builds. The config
 * file can only load this module through a relative import (the "@/" alias
 * is not available there), so keep it free of process.env reads and of
 * imports other than the feature flag table, which is plain data reached
 * by relative paths too. App code imports everything through `@/lib/env`
 * instead.
 */

import {
  FEATURE_DEFAULTS,
  FEATURE_FLAGS,
  isFeatureFlag,
  type FeatureFlag,
} from "../config/features";

export const BACKEND_MODES = ["supabase", "mock", "off"] as const;

/**
 * - `supabase`: the real Supabase project (default).
 * - `mock`: the in-app mock backend. No network calls. Used by E2E tests.
 * - `off`: no backend at all. Features that need one must degrade gracefully.
 */
export type BackendMode = (typeof BACKEND_MODES)[number];

/**
 * Every public variable the app reads.
 *
 * next.config.ts pins each one at build time, and `readPublicEnvSource()` in
 * env.ts reads each one with a literal `process.env.NAME` expression. A unit
 * test keeps the two in sync.
 */
export const PUBLIC_ENV_NAMES = [
  /** `supabase` (default), `mock` or `off`. */
  "NEXT_PUBLIC_BACKEND_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  /** Legacy JWT "anon" key. Only used when the publishable key is unset. */
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
  /**
   * The feature flags that are on in this build, comma-separated, or `none`.
   * Unset means the defaults in src/config/features.ts (ARCHITECTURE §10.5);
   * a list replaces them.
   */
  "NEXT_PUBLIC_FEATURES",
  /** Set by Vercel: "production", "preview" or "development". */
  "NEXT_PUBLIC_VERCEL_ENV",
  /** Set by Vercel: host of the current deployment, without protocol. */
  "NEXT_PUBLIC_VERCEL_URL",
  /** Set by Vercel: production host of the project, without protocol. */
  "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL",
  /** Set by Vercel: the commit the deployment was built from. The app version. */
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
] as const;

export type PublicEnvName = (typeof PUBLIC_ENV_NAMES)[number];

/** Raw values as they arrive from the environment. Every field is optional. */
export type PublicEnvSource = Partial<Record<PublicEnvName, string>>;

/** Public identifiers of the project's Supabase instance. Safe for browsers. */
export const DEFAULT_SUPABASE_URL = "https://zcodouduyvxwefxebvmv.supabase.co";
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_u6KrUSv5WrxoakIDBd1i4w_4JPB01ts";

export const DEFAULT_BACKEND_MODE: BackendMode = "supabase";
export const LOCAL_SITE_URL = "http://localhost:3000";

/**
 * The NEXT_PUBLIC_FEATURES value that turns every flag off. An empty value
 * can't say that, because blank counts as unset, which means the defaults.
 */
export const NO_FEATURES = "none";

/** The app version of a build that was not made from a known commit. */
export const LOCAL_APP_VERSION = "local";

export type FeatureFlags = Readonly<Record<FeatureFlag, boolean>>;

export interface SupabaseConfig {
  readonly url: string;
  readonly publishableKey: string;
}

export interface PublicEnv {
  /**
   * The effective backend mode. A `supabase` request without a usable
   * Supabase configuration is downgraded to `off` (and reported in `issues`).
   */
  readonly backendMode: BackendMode;
  /** Present only when `backendMode` is `supabase`. */
  readonly supabase: SupabaseConfig | null;
  /** Absolute site URL without a trailing slash, e.g. https://example.com */
  readonly siteUrl: string;
  /**
   * Every feature flag, on or off for this build: the flags that
   * NEXT_PUBLIC_FEATURES lists, or the defaults when it is unset.
   */
  readonly features: FeatureFlags;
  /**
   * The build's version, sent with attempt starts and analytics events:
   * the lowercase commit SHA Vercel built from, or `local`.
   */
  readonly appVersion: string;
  /** Human-readable configuration problems. Empty when all is well. */
  readonly issues: readonly string[];
}

const SECRET_KEY_PREFIX = "sb_secret_";
const HAS_PROTOCOL = /^[a-z][a-z\d+.-]*:\/\//i;
const SUPABASE_HOST = /^https:\/\/([a-z\d]+)\.supabase\.co$/i;
/** A full or abbreviated git commit hash. */
const COMMIT_SHA = /^[\da-f]{7,40}$/i;

/**
 * Turns raw environment values into a validated configuration.
 * Pure and total: it never throws and never reads globals.
 */
export function parsePublicEnv(source: PublicEnvSource): PublicEnv {
  const issues: string[] = [];
  let backendMode = parseBackendMode(source.NEXT_PUBLIC_BACKEND_MODE, issues);

  let supabase: SupabaseConfig | null = null;
  if (backendMode === "supabase") {
    supabase = resolveSupabase(source, issues);
    if (supabase === null) {
      backendMode = "off";
      issues.push("Supabase is not usable, so the backend is switched off.");
    }
  }

  return {
    backendMode,
    supabase,
    siteUrl: resolveSiteUrl(source, issues),
    features: parseFeatures(source.NEXT_PUBLIC_FEATURES, issues),
    appVersion: resolveAppVersion(
      source.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
      issues,
    ),
    issues,
  };
}

/**
 * NEXT_PUBLIC_FEATURES names the flags that are on, comma-separated
 * ("rooms,blitz"); every flag it leaves out is off. `none` turns them all
 * off. Unset or blank means the defaults (ARCHITECTURE §10.5). Names are
 * read case-insensitively, with hyphens for underscores.
 *
 * An unknown name is reported and ignored. A value that names no known
 * flag at all keeps the defaults, so a typo can't switch every feature off.
 * A list replaces the defaults, so a flag that is on by default but missing
 * from the list is off in that build, and reported, since copying a Beta
 * switch such as "rooms,editor" would otherwise turn off every shipped
 * Should feature without a word.
 */
function parseFeatures(
  raw: string | undefined,
  issues: string[],
): FeatureFlags {
  const entries = (clean(raw) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (entries.length === 0) return FEATURE_DEFAULTS;

  const on = new Set<FeatureFlag>();
  const unknown: string[] = [];
  let none = false;
  for (const entry of entries) {
    const name = entry.toLowerCase().replaceAll("-", "_");
    if (isFeatureFlag(name)) on.add(name);
    else if (name === NO_FEATURES) none = true;
    else unknown.push(entry);
  }

  if (unknown.length > 0) {
    issues.push(
      `NEXT_PUBLIC_FEATURES names unknown flags (${unknown.join(", ")}), which were ignored. Known flags: ${FEATURE_FLAGS.join(", ")}.`,
    );
  }
  if (none && on.size > 0) {
    issues.push(
      `NEXT_PUBLIC_FEATURES lists "${NO_FEATURES}" together with flags, so "${NO_FEATURES}" was ignored.`,
    );
  }
  if (on.size === 0 && !none) {
    issues.push(
      "NEXT_PUBLIC_FEATURES names no known flag, so the default flags apply.",
    );
    return FEATURE_DEFAULTS;
  }

  // "none" asks for every flag off, so it drops nothing by surprise.
  const dropped = FEATURE_FLAGS.filter(
    (flag) => FEATURE_DEFAULTS[flag] && !on.has(flag),
  );
  if (on.size > 0 && dropped.length > 0) {
    const one = dropped.length === 1;
    issues.push(
      `NEXT_PUBLIC_FEATURES replaces the defaults, so this build turns off ${listOf(dropped)}, which ${one ? "is" : "are"} on by default. List ${one ? "it" : "them"} too to keep ${one ? "it" : "them"} on.`,
    );
  }

  return Object.freeze(
    Object.fromEntries(FEATURE_FLAGS.map((flag) => [flag, on.has(flag)])),
  ) as FeatureFlags;
}

/**
 * The commit SHA that Vercel exposes to every build, lowercased, or
 * `local` for builds made anywhere else (local runs, CI, E2E).
 */
function resolveAppVersion(raw: string | undefined, issues: string[]): string {
  const sha = clean(raw);
  if (sha === undefined) return LOCAL_APP_VERSION;
  if (COMMIT_SHA.test(sha)) return sha.toLowerCase();
  issues.push(
    `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA is not a git commit hash. Using "${LOCAL_APP_VERSION}" as the app version.`,
  );
  return LOCAL_APP_VERSION;
}

/**
 * True for keys that bypass Row Level Security: `sb_secret_` keys and legacy
 * JWT keys with the `service_role` role. They must never reach a browser.
 */
export function isPrivilegedKey(key: string): boolean {
  return (
    key.startsWith(SECRET_KEY_PREFIX) ||
    readJwtClaims(key)?.role === "service_role"
  );
}

/**
 * Names of the NEXT_PUBLIC_* variables that hold a privileged key, sorted.
 *
 * Next.js inlines NEXT_PUBLIC_* values into the browser bundle at build time,
 * so a runtime refusal would come too late. next.config.ts fails the build
 * when this list is not empty. Every NEXT_PUBLIC_* variable is checked, not
 * only the ones the app reads: a privileged key never belongs in one.
 */
export function findPrivilegedPublicKeys(
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  return Object.keys(env)
    .filter((name) => {
      const value = env[name];
      return (
        name.startsWith("NEXT_PUBLIC_") &&
        typeof value === "string" &&
        isPrivilegedKey(value.trim())
      );
    })
    .sort();
}

function parseBackendMode(
  raw: string | undefined,
  issues: string[],
): BackendMode {
  const value = clean(raw)?.toLowerCase();
  if (value === undefined) return DEFAULT_BACKEND_MODE;
  if (isBackendMode(value)) return value;
  issues.push(
    `NEXT_PUBLIC_BACKEND_MODE="${raw}" is not one of ${BACKEND_MODES.join(", ")}. Using "${DEFAULT_BACKEND_MODE}".`,
  );
  return DEFAULT_BACKEND_MODE;
}

function isBackendMode(value: string): value is BackendMode {
  return (BACKEND_MODES as readonly string[]).includes(value);
}

function resolveSupabase(
  source: PublicEnvSource,
  issues: string[],
): SupabaseConfig | null {
  const rawUrl = clean(source.NEXT_PUBLIC_SUPABASE_URL);
  const url =
    rawUrl === undefined ? DEFAULT_SUPABASE_URL : normalizeHttpUrl(rawUrl);
  if (url === null) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL is not a valid http(s) URL.");
    return null;
  }

  const explicitKey =
    clean(source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    clean(source.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  let publishableKey: string;
  if (explicitKey !== undefined) {
    publishableKey = explicitKey;
  } else if (url === DEFAULT_SUPABASE_URL) {
    publishableKey = DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  } else {
    // The built-in key belongs to the default project, so it cannot be
    // paired with a custom URL.
    issues.push(
      "NEXT_PUBLIC_SUPABASE_URL points at a custom project, but neither NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY nor NEXT_PUBLIC_SUPABASE_ANON_KEY is set.",
    );
    return null;
  }

  if (isPrivilegedKey(publishableKey)) {
    issues.push(
      "The public Supabase key is a secret or service_role key. It was ignored. Rotate it and use the publishable key instead.",
    );
    return null;
  }

  const mismatch = findProjectMismatch(url, publishableKey);
  if (mismatch !== undefined) {
    issues.push(mismatch);
    return null;
  }

  return { url, publishableKey };
}

/**
 * Catches a URL and a key that belong to different projects. That happens
 * when they come from different sources: each variable is resolved on its
 * own, and a variable exported in the shell (or set on Vercel) wins over the
 * same name in a .env file. Every request would then fail with a 401.
 *
 * Only two cases are detectable offline: the built-in key, and legacy JWT
 * keys, which name their project in the `ref` claim. Publishable keys of
 * other projects carry no project id.
 */
function findProjectMismatch(url: string, key: string): string | undefined {
  const advice = "Set the URL and the key together, from the same project.";
  if (
    key === DEFAULT_SUPABASE_PUBLISHABLE_KEY &&
    url !== DEFAULT_SUPABASE_URL
  ) {
    return `NEXT_PUBLIC_SUPABASE_URL points at ${url}, but the key is the built-in key of ${DEFAULT_SUPABASE_URL}. ${advice}`;
  }

  const urlRef = SUPABASE_HOST.exec(url)?.[1]?.toLowerCase();
  const keyRef = readJwtClaims(key)?.ref;
  if (urlRef !== undefined && typeof keyRef === "string" && keyRef !== urlRef) {
    return `The Supabase key belongs to project "${keyRef}", but NEXT_PUBLIC_SUPABASE_URL points at project "${urlRef}". ${advice}`;
  }
  return undefined;
}

function resolveSiteUrl(source: PublicEnvSource, issues: string[]): string {
  const explicit = clean(source.NEXT_PUBLIC_SITE_URL);
  if (explicit !== undefined) {
    const normalized = normalizeHttpUrl(
      HAS_PROTOCOL.test(explicit) ? explicit : `https://${explicit}`,
    );
    if (normalized !== null) return normalized;
    issues.push(
      "NEXT_PUBLIC_SITE_URL is not a valid http(s) URL. Falling back to the deployment URL.",
    );
  }

  const productionHost = clean(
    source.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
  );
  if (
    clean(source.NEXT_PUBLIC_VERCEL_ENV) === "production" &&
    productionHost !== undefined
  ) {
    const url = normalizeHttpUrl(`https://${productionHost}`);
    if (url !== null) return url;
  }

  const deploymentHost = clean(source.NEXT_PUBLIC_VERCEL_URL);
  if (deploymentHost !== undefined) {
    const url = normalizeHttpUrl(`https://${deploymentHost}`);
    if (url !== null) return url;
  }

  return LOCAL_SITE_URL;
}

/** "a", "a and b", "a, b and c". */
function listOf(names: readonly string[]): string {
  return names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Trimmed value, or undefined when the variable is unset or blank. */
function clean(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Origin plus path without trailing slashes, or null if not http(s). */
function normalizeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** The payload of a JWT-shaped string, or undefined for anything else. */
function readJwtClaims(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".");
  const payload = parts[1];
  if (parts.length !== 3 || payload === undefined) return undefined;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const claims: unknown = JSON.parse(atob(padded));
    if (typeof claims !== "object" || claims === null) return undefined;
    return claims as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
