/**
 * The app's one Supabase client (ARCHITECTURE §7.5, §1.4 item 7): lazily
 * loaded, created once per tab with no session, writing no storage and no
 * cookie, retried after a failed download, and its fetch recording each
 * response's Retry-After for the RPC wrapper.
 */
import type * as SupabaseJs from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CONFIG = {
  url: "https://example.supabase.co",
  publishableKey: "sb_publishable_test_key",
};

const mocks = vi.hoisted(() => ({
  getSupabaseConfig: vi.fn(),
  createClient: vi.fn(),
  loadSdk: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getSupabaseConfig: mocks.getSupabaseConfig }));

const actual = await vi.importActual<typeof SupabaseJs>(
  "@supabase/supabase-js",
);

/** A fresh module, so its one-per-tab client starts empty. */
async function freshClientModule() {
  vi.resetModules();
  return import("./client");
}

beforeEach(() => {
  mocks.getSupabaseConfig.mockReturnValue(CONFIG);
  mocks.createClient.mockImplementation(actual.createClient);
  mocks.loadSdk.mockImplementation(() => ({
    createClient: mocks.createClient,
  }));
  vi.doMock("@supabase/supabase-js", () => mocks.loadSdk());
  // Each test builds a client of its own; one page would only ever hold one.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getSupabaseClient", () => {
  it("AC-CKE-04 (client half) the one Supabase client writes no storage and no cookie", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const cookies = document.cookie;
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, data: {}, server_time: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const { getSupabaseClient } = await freshClientModule();

    const client = await getSupabaseClient();
    if (client === null) throw new Error("no client");
    await client.auth.getSession();
    const reply = await (
      client as unknown as {
        rpc(fn: string, args: object): PromiseLike<{ status: number }>;
      }
    ).rpc("t_probe", { p_value: 1 });

    expect(reply.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe(cookies);
  });

  it("creates one client per tab, with no session and no retries", async () => {
    const { getSupabaseClient, recordingFetch } = await freshClientModule();

    const [first, second] = await Promise.all([
      getSupabaseClient(),
      getSupabaseClient(),
    ]);
    const third = await getSupabaseClient();

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(mocks.loadSdk).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(
      CONFIG.url,
      CONFIG.publishableKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        db: { retry: false },
        realtime: { worker: false },
        global: { fetch: recordingFetch },
      },
    );
  });

  it("asks for the realtime worker only where the platform has Worker", async () => {
    const { clientOptions } = await freshClientModule();
    // jsdom has no Worker, and realtime-js refuses to start without one when asked.
    expect(clientOptions().realtime).toEqual({ worker: false });
    vi.stubGlobal("Worker", class {});
    expect(clientOptions().realtime).toEqual({ worker: true });
  });

  it("resolves to null without a Supabase configuration and never loads the SDK", async () => {
    mocks.getSupabaseConfig.mockReturnValue(null);
    const { getSupabaseClient } = await freshClientModule();

    await expect(getSupabaseClient()).resolves.toBeNull();
    expect(mocks.loadSdk).not.toHaveBeenCalled();
  });

  it("rejects with SupabaseSdkLoadError when the SDK cannot be downloaded, and tries again", async () => {
    mocks.loadSdk.mockImplementationOnce(() => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    const { getSupabaseClient, SupabaseSdkLoadError } =
      await freshClientModule();

    await expect(getSupabaseClient()).rejects.toBeInstanceOf(
      SupabaseSdkLoadError,
    );
    await expect(getSupabaseClient()).resolves.not.toBeNull();
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
  });

  it("does not load the SDK until the first call", async () => {
    await freshClientModule();
    expect(mocks.loadSdk).not.toHaveBeenCalled();
  });
});

describe("recordingFetch", () => {
  it("notes each response's status and Retry-After by the request's signal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{}", { status: 429, headers: { "Retry-After": "7" } }),
      ),
    );
    const { recordingFetch, responseMetaFor } = await freshClientModule();
    const signal = new AbortController().signal;
    const other = new AbortController().signal;

    const response = await recordingFetch(
      "https://example.supabase.co/rest/v1/rpc/x",
      {
        method: "POST",
        signal,
      },
    );
    await recordingFetch("https://example.supabase.co/rest/v1/rpc/x");

    expect(response.status).toBe(429);
    expect(responseMetaFor(signal)).toEqual({ status: 429, retryAfter: "7" });
    expect(responseMetaFor(other)).toBeUndefined();
  });
});
