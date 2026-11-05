import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * CNT-1 (ARCHITECTURE §5.6, §7.4): `src/backend/index.ts` picks the content
 * world as it loads, from the build's backend mode, so a mock build plays
 * the fixture realm end to end and every other build the real bank. Unit
 * tests run with NODE_ENV "test", where an unselected world would fall back
 * to the fixtures, so "bank" here can only come from the backend's choice.
 */
async function worldOfBuild(mode: string): Promise<string> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BACKEND_MODE", mode);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await import("./index");
  const { contentWorld } = await import("@/content/loaders/world");
  return contentWorld();
}

afterEach(() => {
  vi.resetModules();
});

describe("the content world follows the build's backend", () => {
  it("a mock build plays the fixture world", async () => {
    expect(await worldOfBuild("mock")).toBe("fixtures");
  });

  it.each(["supabase", "off"])(
    "a %s build plays the real bank, never the fixtures",
    async (mode) => {
      expect(await worldOfBuild(mode)).toBe("bank");
    },
  );
});
