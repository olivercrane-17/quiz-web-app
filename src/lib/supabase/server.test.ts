// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSupabasePublicServerClient,
  getSupabaseServerClient,
} from "./server";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createClient: vi.fn(),
  createServerClient: vi.fn(),
  getSupabaseConfig: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/env", () => ({
  getSupabaseConfig: mocks.getSupabaseConfig,
}));

interface CookieAdapter {
  getAll: () => unknown;
  setAll: (
    cookies: { name: string; value: string; options: object }[],
    headers: Record<string, string>,
  ) => void;
}

const config = {
  url: "https://example.supabase.co",
  publishableKey: "sb_publishable_example",
};

function fakeCookieStore() {
  return {
    getAll: vi.fn(() => [{ name: "sb-session", value: "abc" }]),
    set: vi.fn(),
  };
}

/** The cookie adapter handed to createServerClient on its latest call. */
function lastCookieAdapter(): CookieAdapter {
  const options = mocks.createServerClient.mock.lastCall?.[2] as
    { cookies: CookieAdapter } | undefined;
  if (!options) throw new Error("createServerClient was not called");
  return options.cookies;
}

describe("getSupabaseServerClient", () => {
  let store: ReturnType<typeof fakeCookieStore>;

  beforeEach(() => {
    store = fakeCookieStore();
    mocks.cookies.mockResolvedValue(store);
    mocks.createServerClient.mockImplementation(() => ({
      kind: "server-client",
    }));
  });

  it("returns null without a real backend, but still reads cookies", async () => {
    mocks.getSupabaseConfig.mockReturnValue(null);

    await expect(getSupabaseServerClient()).resolves.toBeNull();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    // Request-time in every mode, so mock builds render like production.
    expect(mocks.cookies).toHaveBeenCalledOnce();
  });

  it("creates a new client per call for the configured project", async () => {
    mocks.getSupabaseConfig.mockReturnValue(config);

    const first = await getSupabaseServerClient();
    const second = await getSupabaseServerClient();

    expect(first).toEqual({ kind: "server-client" });
    expect(second).not.toBe(first);
    expect(mocks.createServerClient).toHaveBeenCalledTimes(2);
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      config.url,
      config.publishableKey,
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
  });

  it("reads and writes cookies through the request cookie store", async () => {
    mocks.getSupabaseConfig.mockReturnValue(config);
    await getSupabaseServerClient();
    const adapter = lastCookieAdapter();

    expect(adapter.getAll()).toEqual([{ name: "sb-session", value: "abc" }]);

    adapter.setAll(
      [
        { name: "sb-a", value: "1", options: { path: "/" } },
        { name: "sb-b", value: "2", options: { path: "/" } },
      ],
      {},
    );
    expect(store.set).toHaveBeenCalledTimes(2);
    expect(store.set).toHaveBeenCalledWith("sb-a", "1", { path: "/" });
  });

  it("ignores cookie writes that Server Components reject", async () => {
    mocks.getSupabaseConfig.mockReturnValue(config);
    store.set.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Function");
    });
    await getSupabaseServerClient();

    expect(() =>
      lastCookieAdapter().setAll(
        [{ name: "sb-a", value: "1", options: {} }],
        {},
      ),
    ).not.toThrow();
  });

  it("degrades to null when the client cannot be created", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.getSupabaseConfig.mockReturnValue(config);
    mocks.createServerClient.mockImplementation(() => {
      throw new Error("boom");
    });

    await expect(getSupabaseServerClient()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("createSupabasePublicServerClient", () => {
  beforeEach(() => {
    mocks.createClient.mockImplementation(() => ({ kind: "public-client" }));
  });

  it("returns null without a real backend", () => {
    mocks.getSupabaseConfig.mockReturnValue(null);

    expect(createSupabasePublicServerClient()).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("creates a session-less client and never reads the request", () => {
    mocks.getSupabaseConfig.mockReturnValue(config);

    expect(createSupabasePublicServerClient()).toEqual({
      kind: "public-client",
    });
    expect(mocks.createClient).toHaveBeenCalledWith(
      config.url,
      config.publishableKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    // Safe inside "use cache": no request APIs are touched.
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it("degrades to null when the client cannot be created", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.getSupabaseConfig.mockReturnValue(config);
    mocks.createClient.mockImplementation(() => {
      throw new Error("boom");
    });

    expect(createSupabasePublicServerClient()).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});
