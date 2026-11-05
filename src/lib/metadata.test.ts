import { describe, expect, it } from "vitest";

import { NOINDEX, indexable, isNoindex, noindex, titleText } from "./metadata";

describe("page metadata (ARCHITECTURE §10.1)", () => {
  it("indexable() titles a page and gives it a path-only canonical address", () => {
    expect(indexable("Privacy", "/privacy")).toEqual({
      title: "Privacy",
      alternates: { canonical: "/privacy" },
    });
    expect(
      indexable("Geography", "/categories/geography", {
        description: "Questions about places.",
      }),
    ).toEqual({
      description: "Questions about places.",
      title: "Geography",
      alternates: { canonical: "/categories/geography" },
    });
  });

  it("noindex() keeps a page out of search results as robots { index: false }, nothing more", () => {
    expect(noindex({ title: "Groups" })).toEqual({
      title: "Groups",
      robots: { index: false },
    });
    expect(NOINDEX).toEqual({ index: false });
    // Each call gets its own object, so no page can change another's.
    expect(noindex({}).robots).not.toBe(noindex({}).robots);
  });

  it("isNoindex() reads every form robots can take", () => {
    expect(isNoindex(undefined)).toBe(false);
    expect(isNoindex({ title: "Today" })).toBe(false);
    expect(isNoindex(noindex({}))).toBe(true);
    expect(isNoindex({ robots: "noindex, follow" })).toBe(true);
    expect(isNoindex({ robots: "index, follow" })).toBe(false);
    expect(isNoindex({ robots: { index: true } })).toBe(false);
    expect(isNoindex(indexable("Privacy", "/privacy"))).toBe(false);
  });

  it("titleText() reads the words a title gives, before the brand template", () => {
    expect(titleText("Privacy")).toBe("Privacy");
    expect(titleText({ absolute: "Knewt" })).toBe("Knewt");
    expect(titleText({ default: "Knewt", template: "%s · Knewt" })).toBe(
      "Knewt",
    );
    expect(titleText(undefined)).toBeNull();
    expect(titleText(null)).toBeNull();
  });
});
