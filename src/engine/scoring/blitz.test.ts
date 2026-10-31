// @vitest-environment node
import { describe, expect, it } from "vitest";

import { blitzPoints } from "./blitz.ts";

describe("blitzPoints", () => {
  it("follows the PRD §3.3.5 formula", () => {
    expect(blitzPoints(0, true)).toBe(150);
    expect(blitzPoints(4000, true)).toBe(125);
    expect(blitzPoints(8000, true)).toBe(100);
    expect(blitzPoints(30_000, true)).toBe(100);
    expect(blitzPoints(-50, true)).toBe(150);
  });

  it("gives nothing for a wrong answer", () => {
    expect(blitzPoints(0, false)).toBe(0);
    expect(blitzPoints(9000, false)).toBe(0);
  });
});
