/**
 * The client filter on the real list (AC-LNT-03): the lazy chunk decodes
 * src/content/generated/moderation.ts and catches each listed term under
 * each normalization, the same spellings that
 * supabase/tests/generated/moderation-list.test.sql sends through SQL
 * (`termVariants`). The list is decoded in memory only: a finding names a
 * term by its position and a spelling by its number, never by its text,
 * and no title or message here holds a term.
 */
import { describe, expect, it, vi } from "vitest";

import { termVariants } from "../../../scripts/codegen/moderation-sql";
import { MODERATION_TERMS_ROT13 } from "@/content/generated/moderation";
import { rot13 } from "@/engine/text/moderation";

import { loadNameFilter } from "./filter";

describe("loadNameFilter", () => {
  it("AC-LNT-03 catches each listed term under each normalization on the client", async () => {
    const filter = await loadNameFilter();
    expect(MODERATION_TERMS_ROT13.length).toBeGreaterThan(0);
    const missed: string[] = [];
    MODERATION_TERMS_ROT13.forEach((encoded, t) => {
      const term = rot13(encoded);
      if (!filter.isBlocked(term)) missed.push(`term ${t + 1}`);
      termVariants(term).forEach((variant, v) => {
        if (!filter.isBlocked(variant)) {
          missed.push(`term ${t + 1}, spelling ${v + 1}`);
        }
      });
    });
    expect(missed).toEqual([]);
  });

  it("passes everyday names", async () => {
    const filter = await loadNameFilter();
    for (const name of [
      "Dee",
      "Priya",
      "Sam the Great",
      "Mia K",
      "Plucky Otter",
      "Brave Otter",
      "Ciarán",
      "Zoë",
    ]) {
      expect(filter.isBlocked(name)).toBe(false);
    }
  });

  it("loads the list once and shares it", async () => {
    const first = loadNameFilter();
    expect(loadNameFilter()).toBe(first);
    expect(await first).toBe(await loadNameFilter());
  });

  it("forgets a failed load, so the next call tries again", async () => {
    vi.resetModules();
    vi.doMock("./filter-list", () => {
      throw new Error("offline");
    });
    const offline = await import("./filter");
    await expect(offline.loadNameFilter()).rejects.toThrow();
    vi.doUnmock("./filter-list");
    const filter = await offline.loadNameFilter();
    expect(filter.isBlocked("Dee")).toBe(false);
  });
});
