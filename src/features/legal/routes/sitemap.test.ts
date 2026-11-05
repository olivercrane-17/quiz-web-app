/**
 * `/sitemap.xml` and `/robots.txt` (ARCHITECTURE §10.1, PRD §6.2): the
 * sitemap lists the indexable routes only, never a per-user address
 * (AC-UGS-02's sitemap half), and robots.txt lets crawlers read every page
 * so each can show its own noindex.
 */
import { describe, expect, it } from "vitest";

import type { FeatureFlag } from "@/config/features";
import { CATEGORIES } from "@/content/generated/categories";

import { LEGAL_PATHS } from "../document";
import { LEGAL_DOCUMENTS } from "../documents";
import { buildRobots } from "./robots";
import { buildSitemap, indexablePaths } from "./sitemap";
import sitemap from "./sitemap";

const SITE = "https://knewt.example";
const flags =
  (...on: FeatureFlag[]) =>
  (flag: FeatureFlag) =>
    on.includes(flag);

describe("the sitemap", () => {
  it("AC-UGS-02 lists Today, the practice hub and the seven trust pages, and no per-user address", () => {
    const urls = buildSitemap(SITE, flags()).map((entry) => entry.url);
    expect(urls).toEqual([
      `${SITE}/`,
      `${SITE}/practice`,
      ...LEGAL_PATHS.map((path) => `${SITE}${path}`),
    ]);
    for (const url of urls) {
      expect(url).not.toMatch(
        /\/(q|c|j|g|claim|room|host|join|create|shell|s|api)\//,
      );
    }
  });

  it("AC-UGS-02 never lists a shared quiz, whatever the flags", () => {
    for (const on of [flags(), flags("editor", "rooms", "category_pages")]) {
      expect(
        buildSitemap(SITE, on).some((entry) => entry.url.includes("/q/")),
      ).toBe(false);
    }
  });

  it("adds the 12 category pages once category_pages is on (CAT-1)", () => {
    expect(indexablePaths(flags())).toEqual(["/", "/practice"]);
    expect(indexablePaths(flags("category_pages"))).toEqual([
      "/",
      "/practice",
      ...CATEGORIES.map((category) => `/categories/${category.slug}`),
    ]);
    expect(CATEGORIES).toHaveLength(12);
  });

  it("dates each trust page by its Last updated line", () => {
    const entries = buildSitemap(SITE, flags());
    for (const path of LEGAL_PATHS) {
      const entry = entries.find(
        (candidate) => candidate.url === `${SITE}${path}`,
      );
      expect(entry?.lastModified).toBe(LEGAL_DOCUMENTS[path](flags()).updated);
    }
  });

  it("uses absolute addresses on the build's own site", () => {
    for (const entry of sitemap()) {
      expect(entry.url).toMatch(/^https?:\/\/[^/]+\//);
    }
  });
});

describe("robots.txt", () => {
  it("lets crawlers read every page, closes only the cookie routes and the bare shells, and points at the sitemap", () => {
    expect(buildRobots(SITE)).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/shell/"] },
      sitemap: `${SITE}/sitemap.xml`,
    });
  });
});
