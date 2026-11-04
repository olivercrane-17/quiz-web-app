/**
 * src/lib/supabase/browser.ts is the backend's one client, re-exported
 * (ARCHITECTURE §1.4 item 7, §7.5): there is no second Supabase client.
 */
import { describe, expect, it } from "vitest";

import * as backendClient from "@/backend/supabase/client";

import * as browser from "./browser";

describe("the browser Supabase client", () => {
  it("is the backend's one client, not a second one", () => {
    expect(browser.getSupabaseBrowserClient).toBe(
      backendClient.getSupabaseClient,
    );
    expect(browser.SupabaseSdkLoadError).toBe(
      backendClient.SupabaseSdkLoadError,
    );
    expect(Object.keys(browser).sort()).toEqual([
      "SupabaseSdkLoadError",
      "getSupabaseBrowserClient",
    ]);
  });

  it("resolves to null in a build without Supabase", async () => {
    // Unit tests build with NEXT_PUBLIC_BACKEND_MODE=mock (vitest.config.mts).
    await expect(browser.getSupabaseBrowserClient()).resolves.toBeNull();
  });
});
