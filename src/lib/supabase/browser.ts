import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/env";

import type { Database } from "./database.types";

export type BrowserSupabaseClient = SupabaseClient<Database>;

// The shared client once it has been requested. Holding the promise means
// concurrent callers share one client and one SDK download.
let browserClient: Promise<BrowserSupabaseClient | null> | undefined;

/**
 * The shared Supabase client for Client Components.
 *
 * Resolves to null when there is no real backend (mock or off mode, or an
 * unusable configuration) and during server rendering, so callers can
 * branch instead of crashing.
 *
 * The SDK (about 55 KB gzipped) is downloaded on the first call, so it stays
 * out of the initial bundle, and mock or off builds never load it. Call this
 * from effects or event handlers, never during render: the server and the
 * browser get different answers. In an effect, ignore the result if the
 * effect was cleaned up before the promise settled.
 */
export function getSupabaseBrowserClient(): Promise<BrowserSupabaseClient | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  browserClient ??= createBrowserClientOnce();
  return browserClient;
}

async function createBrowserClientOnce(): Promise<BrowserSupabaseClient | null> {
  const config = getSupabaseConfig();
  if (config === null) return null;

  const sdk = await import("@supabase/ssr").catch((error: unknown) => {
    // Usually a chunk that failed to download, for example while offline.
    // Forget the failure so that a later call tries again.
    browserClient = undefined;
    console.warn(
      "[supabase] Could not load the Supabase SDK. Continuing without a backend.",
      error,
    );
    return null;
  });
  if (sdk === null) return null;

  try {
    return sdk.createBrowserClient<Database>(config.url, config.publishableKey);
  } catch (error) {
    console.warn(
      "[supabase] Could not create the browser client. Continuing without a backend.",
      error,
    );
    return null;
  }
}
