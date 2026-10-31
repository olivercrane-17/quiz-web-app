import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabaseConfig } from "@/lib/env";

import type { Database } from "./database.types";

export type ServerSupabaseClient = SupabaseClient<Database>;

/**
 * A cookie-free client for public data on the server, such as leaderboards
 * or published quizzes. It never reads the request, so it is safe inside
 * `"use cache"` scopes and during static generation. Prefer it whenever the
 * data does not depend on who is asking.
 *
 * Returns null when there is no real backend (mock or off mode, or an
 * unusable configuration).
 */
export function createSupabasePublicServerClient(): ServerSupabaseClient | null {
  const config = getSupabaseConfig();
  if (config === null) return null;

  try {
    return createClient<Database>(config.url, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  } catch (error) {
    console.warn(
      "[supabase] Could not create the public server client. Continuing without a backend.",
      error,
    );
    return null;
  }
}

/**
 * Creates a request-scoped, cookie-aware Supabase client for Server
 * Components, Server Functions and Route Handlers. Create one per request and
 * never keep it in module scope: it carries that request's cookies.
 *
 * Returns null when there is no real backend (mock or off mode, or an
 * unusable configuration).
 *
 * It reads `cookies()` in every backend mode, so it is always request-time
 * work. That keeps rendering identical between mock builds (E2E) and
 * production builds. With Cache Components enabled this means: call it inside
 * a `<Suspense>` boundary, a Server Function or a Route Handler, and never
 * inside a `"use cache"` scope.
 *
 * The app does not use Supabase Auth sessions (players get a local guest
 * identity, see docs/01-ENGINEERING-CONSTRAINTS.md), so there is no
 * session-refresh proxy. If Supabase Auth is ever adopted, add `src/proxy.ts`
 * to refresh sessions first: Server Components cannot persist refreshed
 * cookies on their own.
 */
export async function getSupabaseServerClient(): Promise<ServerSupabaseClient | null> {
  const cookieStore = await cookies();

  const config = getSupabaseConfig();
  if (config === null) return null;

  try {
    return createServerClient<Database>(config.url, config.publishableKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // The cache-control headers passed as the second argument cannot
          // be set through cookies(). Responses that read cookies are already
          // rendered dynamically and are not cached by Next.js.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
          }
        },
      },
    });
  } catch (error) {
    console.warn(
      "[supabase] Could not create the server client. Continuing without a backend.",
      error,
    );
    return null;
  }
}
