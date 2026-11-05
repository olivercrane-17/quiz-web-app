// @vitest-environment node
import { describe, expect, it } from "vitest";

import { compositionIdOf } from "./composition.ts";

describe("compositionIdOf", () => {
  it("names each run of identical consecutive types (§4.9)", () => {
    expect(compositionIdOf(["mystery", "mystery", "mystery", "encore"])).toBe(
      "m3e1",
    );
    expect(compositionIdOf([...Array<"mc">(9).fill("mc"), "encore"])).toBe(
      "c9e1",
    );
    expect(
      compositionIdOf(["mc", "mc", "mc", "mc", "mc", "mystery", "encore"]),
    ).toBe("c5m1e1");
    expect(
      compositionIdOf(["tf", "comparison", "comparison", "ordering"]),
    ).toBe("t1p2o1");
    expect(compositionIdOf(["mc", "mystery", "mc"])).toBe("c1m1c1");
    expect(compositionIdOf([])).toBe("");
  });
});
