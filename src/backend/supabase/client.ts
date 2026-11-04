/**
 * The app's one Supabase client (ARCHITECTURE §7.5, §1.4 item 7).
 *
 * - `@supabase/supabase-js` loads with import() on the first call, so the
 *   SDK stays out of every first load; prefetchBackend() warms it at idle.
 * - One client per tab: a memoized promise, so concurrent first calls share
 *   one client and one SDK download. A download that fails is forgotten,
 *   and the next call tries again.
 * - Session persistence, token refresh and URL detection are off. The app
 *   has no Supabase Auth session (guest identity lives in our own tables),
 *   so this client never writes auth storage or a cookie (AC-CKE-04), and
 *   there is no server client at all.
 * - `db.retry` is off: the backend never retries a write (§7.1), and
 *   callers retry with the same key.
 * - Its fetch notes each response's status and Retry-After against the
 *   request's AbortSignal. postgrest-js does not expose response headers,
 *   and a 429 from the pre-request hook carries its wait only in
 *   Retry-After (§8.6). Each RPC call has a signal of its own.
 * - `realtime.worker` keeps room heartbeats alive in background tabs; its
 *   worker comes from a Blob URL, which the CSP allows (§10.8). It is asked
 *   for only where the platform has Worker: realtime-js refuses to create a
 *   client at all when a page without workers asks for one, which would
 *   take every RPC down with it.
 *
 * Nothing here touches the DOM, so the contract suites run it in Node too.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export type AppSupabaseClient = SupabaseClient<Database>;

/** The options the client is created with, for this platform. */
export function clientOptions() {
  return {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: { retry: false },
    realtime: { worker: typeof globalThis.Worker === "function" },
    global: { fetch: recordingFetch },
  };
}

/** What the client's fetch saw of one response. */
export interface ResponseMeta {
  status: number;
  /** The Retry-After header as sent: delay seconds or an HTTP date. */
  retryAfter: string | null;
}

const responses = new WeakMap<AbortSignal, ResponseMeta>();

/** The response that a request made with this signal received, if any. */
export function responseMetaFor(signal: AbortSignal): ResponseMeta | undefined {
  return responses.get(signal);
}

/** fetch for the client: the platform fetch, noting each response by its signal. */
export async function recordingFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await globalThis.fetch(input, init);
  const signal = init?.signal;
  if (signal) {
    responses.set(signal, {
      status: response.status,
      retryAfter: response.headers.get("Retry-After"),
    });
  }
  return response;
}

/** The SDK chunk failed to download, typically while offline. */
export class SupabaseSdkLoadError extends Error {
  constructor(cause: unknown) {
    super("The Supabase SDK could not be loaded.", { cause });
    this.name = "SupabaseSdkLoadError";
  }
}

let shared: Promise<AppSupabaseClient | null> | null = null;

async function loadSdk() {
  try {
    return await import("@supabase/supabase-js");
  } catch (error) {
    throw new SupabaseSdkLoadError(error);
  }
}

async function createOnce(): Promise<AppSupabaseClient | null> {
  const config = getSupabaseConfig();
  if (config === null) return null;
  const { createClient } = await loadSdk();
  return createClient<Database>(
    config.url,
    config.publishableKey,
    clientOptions(),
  );
}

/**
 * The tab's Supabase client, or null when this build has no Supabase
 * configuration (mock and off modes). Rejects with SupabaseSdkLoadError
 * when the SDK cannot be downloaded; the next call tries again.
 */
export function getSupabaseClient(): Promise<AppSupabaseClient | null> {
  shared ??= createOnce().catch((error: unknown) => {
    shared = null;
    throw error;
  });
  return shared;
}

/** Tests only: forgets the shared client. */
export function resetSupabaseClientForTests(): void {
  shared = null;
}
