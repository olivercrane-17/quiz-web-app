/**
 * Typed, crash-proof access to public configuration.
 *
 * Every NEXT_PUBLIC_* variable is read here and nowhere else (an ESLint rule
 * enforces this), each with a literal `process.env.NEXT_PUBLIC_NAME`
 * expression. next.config.ts pins every name in PUBLIC_ENV_NAMES at build
 * time, unset ones as "", so the server and the browser always see the same
 * values. Changing a value therefore needs a rebuild (or a restart of
 * `next dev`).
 *
 * Nothing in this module throws. Missing or invalid values fall back to safe
 * defaults and are listed in `env.issues`, which are also logged once as
 * console warnings. The parsing itself lives in ./env-parse, which
 * next.config.ts shares.
 */

import { FEATURE_DEFAULTS, type FeatureFlag } from "../config/features";

import {
  LOCAL_APP_VERSION,
  LOCAL_SITE_URL,
  parsePublicEnv,
  type BackendMode,
  type PublicEnv,
  type PublicEnvName,
  type SupabaseConfig,
} from "./env-parse";

export {
  BACKEND_MODES,
  DEFAULT_BACKEND_MODE,
  DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  DEFAULT_SUPABASE_URL,
  LOCAL_APP_VERSION,
  LOCAL_SITE_URL,
  NO_FEATURES,
  PUBLIC_ENV_NAMES,
  parsePublicEnv,
} from "./env-parse";
export type {
  BackendMode,
  FeatureFlags,
  PublicEnv,
  PublicEnvName,
  PublicEnvSource,
  SupabaseConfig,
} from "./env-parse";

/** Reads one variable, shielding callers from a missing `process` global. */
function read(get: () => string | undefined): string | undefined {
  try {
    return get();
  } catch {
    return undefined;
  }
}

/**
 * The raw public variables. Exported for tests only.
 *
 * Every access must stay a literal `process.env.NAME` expression, because
 * Next.js only inlines those. The return type makes a missing name a type
 * error.
 */
export function readPublicEnvSource(): Record<
  PublicEnvName,
  string | undefined
> {
  return {
    NEXT_PUBLIC_BACKEND_MODE: read(() => process.env.NEXT_PUBLIC_BACKEND_MODE),
    NEXT_PUBLIC_SUPABASE_URL: read(() => process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: read(
      () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: read(
      () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    NEXT_PUBLIC_SITE_URL: read(() => process.env.NEXT_PUBLIC_SITE_URL),
    NEXT_PUBLIC_FEATURES: read(() => process.env.NEXT_PUBLIC_FEATURES),
    NEXT_PUBLIC_VERCEL_ENV: read(() => process.env.NEXT_PUBLIC_VERCEL_ENV),
    NEXT_PUBLIC_VERCEL_URL: read(() => process.env.NEXT_PUBLIC_VERCEL_URL),
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: read(
      () => process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
    ),
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: read(
      () => process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    ),
  };
}

function loadPublicEnv(): PublicEnv {
  let loaded: PublicEnv;
  try {
    loaded = parsePublicEnv(readPublicEnvSource());
  } catch {
    // parsePublicEnv is total, so this is a last line of defence only.
    loaded = {
      backendMode: "off",
      supabase: null,
      siteUrl: LOCAL_SITE_URL,
      features: FEATURE_DEFAULTS,
      appVersion: LOCAL_APP_VERSION,
      issues: ["Public configuration could not be read. Backend switched off."],
    };
  }
  for (const issue of loaded.issues) {
    console.warn(`[env] ${issue}`);
  }
  return loaded;
}

/** The validated public configuration for this build. */
export const env: PublicEnv = loadPublicEnv();

export function getBackendMode(): BackendMode {
  return env.backendMode;
}

/**
 * True when the app has a backend to talk to: the real Supabase project or
 * the mock backend. False in `off` mode, where backend features should hide
 * or fall back to local-only behaviour.
 */
export function isBackendEnabled(): boolean {
  return env.backendMode !== "off";
}

/** True only when the real Supabase project is configured and in use. */
export function isSupabaseEnabled(): boolean {
  return env.backendMode === "supabase";
}

/** True when the in-app mock backend should serve all data. */
export function isMockBackend(): boolean {
  return env.backendMode === "mock";
}

/** Supabase connection details, or null unless the mode is `supabase`. */
export function getSupabaseConfig(): SupabaseConfig | null {
  return env.supabase;
}

/** Absolute site URL without a trailing slash. Always a valid URL. */
export function getSiteUrl(): string {
  return env.siteUrl;
}

/**
 * True when a feature flag is on in this build (ARCHITECTURE §10.5, D19):
 * listed in NEXT_PUBLIC_FEATURES, or on by default when that is unset.
 * Flags are fixed at build time, so a Beta route module that calls
 * notFound() when its flag is off prerenders as the not-found page.
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return env.features[flag];
}

/**
 * The build's version for attempt starts and analytics events (PRD §7.1's
 * `app_version`): the commit SHA a Vercel deployment was built from, or
 * `local` for any other build.
 */
export function getAppVersion(): string {
  return env.appVersion;
}
