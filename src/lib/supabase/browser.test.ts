import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
  getSupabaseConfig: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getSupabaseConfig: mocks.getSupabaseConfig,
}));

/**
 * Stands in for the @supabase/ssr chunk and counts how often it loads. Make
 * it throw to simulate a chunk that fails to download.
 */
const loadSdk = vi.fn(() => ({
  createBrowserClient: mocks.createBrowserClient,
}));

const config = {
  url: "https://example.supabase.co",
  publishableKey: "sb_publishable_example",
};

/** Fresh module instance, so the singleton starts empty in every test. */
async function loadBrowserModule() {
  vi.resetModules();
  return import("./browser");
}

describe("getSupabaseBrowserClient", () => {
  beforeEach(() => {
    mocks.createBrowserClient.mockReturnValue({ kind: "browser-client" });
    // Registered per test (vi.mock results survive vi.resetModules), so every
    // test starts with an SDK that has not been loaded yet.
    vi.doMock("@supabase/ssr", loadSdk);
  });

  it("resolves to null and loads nothing without a real backend", async () => {
    mocks.getSupabaseConfig.mockReturnValue(null);
    const { getSupabaseBrowserClient } = await loadBrowserModule();

    await expect(getSupabaseBrowserClient()).resolves.toBeNull();
    expect(loadSdk).not.toHaveBeenCalled();
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });

  it("does not load the SDK until the first call", async () => {
    mocks.getSupabaseConfig.mockReturnValue(config);
    await loadBrowserModule();

    expect(loadSdk).not.toHaveBeenCalled();
  });

  it("creates a single shared client from the configured project", async () => {
    mocks.getSupabaseConfig.mockReturnValue(config);
    const { getSupabaseBrowserClient } = await loadBrowserModule();

    // Concurrent first calls must share one client.
    const [first, second] = await Promise.all([
      getSupabaseBrowserClient(),
      getSupabaseBrowserClient(),
    ]);
    const third = await getSupabaseBrowserClient();

    expect(first).toEqual({ kind: "browser-client" });
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(mocks.createBrowserClient).toHaveBeenCalledTimes(1);
    expect(mocks.createBrowserClient).toHaveBeenCalledWith(
      config.url,
      config.publishableKey,
    );
  });

  it("resolves to null during server rendering", async () => {
    mocks.getSupabaseConfig.mockReturnValue(config);
    vi.stubGlobal("window", undefined);
    const { getSupabaseBrowserClient } = await loadBrowserModule();

    await expect(getSupabaseBrowserClient()).resolves.toBeNull();
    expect(loadSdk).not.toHaveBeenCalled();
  });

  it("degrades to null, once, when the client cannot be created", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.getSupabaseConfig.mockReturnValue(config);
    mocks.createBrowserClient.mockImplementation(() => {
      throw new Error("boom");
    });
    const { getSupabaseBrowserClient } = await loadBrowserModule();

    await expect(getSupabaseBrowserClient()).resolves.toBeNull();
    await expect(getSupabaseBrowserClient()).resolves.toBeNull();
    expect(mocks.createBrowserClient).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("tries again after the SDK fails to download", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.getSupabaseConfig.mockReturnValue(config);
    loadSdk.mockImplementationOnce(() => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    const { getSupabaseBrowserClient } = await loadBrowserModule();

    await expect(getSupabaseBrowserClient()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not load the Supabase SDK"),
      expect.any(Error),
    );

    await expect(getSupabaseBrowserClient()).resolves.toEqual({
      kind: "browser-client",
    });
    expect(mocks.createBrowserClient).toHaveBeenCalledTimes(1);
  });
});
