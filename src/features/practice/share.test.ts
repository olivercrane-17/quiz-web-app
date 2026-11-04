import { describe, expect, it } from "vitest";

import { SHELL_COPY } from "@/features/shell";

import type { PracticeRunRequest } from "./model/storage";
import { practiceSharePayload, practiceShareText } from "./share";

function entry(
  request: Partial<PracticeRunRequest>,
  score: number,
  maxPoints = 10,
) {
  return {
    request: {
      mode: "category" as const,
      category: "geo" as const,
      difficulty: "hard" as const,
      repeats: false,
      ...request,
    },
    score,
    maxPoints,
  };
}

const SITE = "https://knewt.app";

describe("the practice share (PRD §3.5.4)", () => {
  it("R1-01 reads the run's line, then the link last", () => {
    expect(
      practiceShareText(entry({}, 8), {
        category: "Geography",
        siteUrl: SITE,
      }),
    ).toBe(
      `${SHELL_COPY.brand} Practice · Geography · Hard · 8/10\n${SITE}/practice`,
    );
  });

  it("leaves Mixed difficulty out, so Quick play reads Mixed once", () => {
    expect(
      practiceShareText(
        entry({ mode: "quick", category: "mixed", difficulty: "mixed" }, 7),
        { category: "Mixed", siteUrl: SITE },
      ),
    ).toBe(`${SHELL_COPY.brand} Practice · Mixed · 7/10\n${SITE}/practice`);
    expect(
      practiceShareText(
        entry({ category: "mixed", difficulty: "easy" }, 3, 4),
        {
          category: "Mixed",
          siteUrl: SITE,
        },
      ).split("\n")[0],
    ).toBe(`${SHELL_COPY.brand} Practice · Mixed · Easy · 3/4`);
  });

  it("AC-SHR-08 links to /practice by path alone: no /c/ link, no query, no fragment", () => {
    for (const siteUrl of [SITE, `${SITE}/`, "http://127.0.0.1:3211//"]) {
      const text = practiceShareText(entry({}, 5), {
        category: "Geography",
        siteUrl,
      });
      const lines = text.split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[1]).toMatch(/^https?:\/\/[^/?#]+\/practice$/);
      expect(text).not.toContain("/c/");
    }
  });

  it("is text only: the practice mode and no grid", () => {
    const payload = practiceSharePayload(entry({}, 8), {
      category: "Geography",
      siteUrl: SITE,
    });
    expect(payload.mode).toBe("practice");
    expect(payload.grid).toBeNull();
    expect(payload.text.endsWith(`${SITE}/practice`)).toBe(true);
  });
});
