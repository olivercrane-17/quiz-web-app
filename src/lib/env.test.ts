import { afterEach, describe, expect, it, vi } from "vitest";

describe("env module", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("runs in mock mode under Vitest", async () => {
    const env = await import("./env");

    expect(env.getBackendMode()).toBe("mock");
    expect(env.isBackendEnabled()).toBe(true);
    expect(env.isMockBackend()).toBe(true);
    expect(env.isSupabaseEnabled()).toBe(false);
    expect(env.getSupabaseConfig()).toBeNull();
    expect(() => new URL(env.getSiteUrl())).not.toThrow();
  });

  it("reports the off mode as having no backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_MODE", "off");
    vi.resetModules();
    const env = await import("./env");

    expect(env.isBackendEnabled()).toBe(false);
    expect(env.isMockBackend()).toBe(false);
    expect(env.getSupabaseConfig()).toBeNull();
  });

  it("logs configuration issues once instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_BACKEND_MODE", "nonsense");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bad host");
    vi.resetModules();

    const env = await import("./env");

    expect(env.isSupabaseEnabled()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[env] NEXT_PUBLIC_BACKEND_MODE"),
    );
  });

  it("reads every name in PUBLIC_ENV_NAMES from its own variable", async () => {
    // next.config.ts pins exactly these names at build time, so a name that
    // readPublicEnvSource() skips or reads from the wrong variable would be
    // a silent configuration bug.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { PUBLIC_ENV_NAMES } = await import("./env-parse");
    for (const name of PUBLIC_ENV_NAMES) {
      vi.stubEnv(name, `value of ${name}`);
    }
    vi.resetModules();

    const { readPublicEnvSource } = await import("./env");

    expect(readPublicEnvSource()).toEqual(
      Object.fromEntries(
        PUBLIC_ENV_NAMES.map((name) => [name, `value of ${name}`]),
      ),
    );
  });
});
