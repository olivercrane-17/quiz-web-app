/**
 * The browser's Supabase client: the backend's one client, re-exported
 * (ARCHITECTURE §1.4 item 7, §7.5). There is no other Supabase client in
 * the app, and none on the server: the client keeps no session, so it can
 * never write auth storage or a cookie (AC-CKE-04).
 *
 * Features never import this module (lint layer rules, §2.2); they go
 * through getBackend(). It resolves to null in mock and off builds, and
 * rejects with SupabaseSdkLoadError when the SDK chunk cannot be
 * downloaded; the next call tries again.
 */
export {
  getSupabaseClient as getSupabaseBrowserClient,
  SupabaseSdkLoadError,
  type AppSupabaseClient as BrowserSupabaseClient,
} from "@/backend/supabase/client";
