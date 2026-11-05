/**
 * The sitemap, robots.txt and the not-found page on a production build
 * (LGL-1; ARCHITECTURE §10.1, PRD §6.2): the sitemap lists the indexable
 * routes only, each of which answers 200 without a noindex (AC-UGS-02's
 * sitemap half), and every route it lists, plus the not-found page, has
 * one h1 and a title of its own.
 */
import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "../fixtures";

/** The `<loc>` entries of the sitemap the server sends. */
async function sitemapUrls(request: APIRequestContext): Promise<string[]> {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/xml/);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1] ?? "",
  );
}

test.describe("the sitemap and robots.txt", () => {
  test("AC-UGS-02 the sitemap lists Today, the practice hub and the seven trust pages, absolute and path-only, with no shared quiz or other per-user address", async ({
    request,
    baseURL,
  }) => {
    const urls = await sitemapUrls(request);
    const paths = urls.map((url) => {
      expect(url.startsWith(`${baseURL}/`), url).toBe(true);
      const parsed = new URL(url);
      expect(parsed.search, url).toBe("");
      return parsed.pathname;
    });
    expect(paths).toEqual([
      "/",
      "/practice",
      "/how-scoring-works",
      "/about-our-questions",
      "/privacy",
      "/terms",
      "/content-policy",
      "/accessibility",
      "/credits",
    ]);
    for (const path of paths) {
      expect(path).not.toMatch(
        /^\/(q|c|j|g|claim|room|host|join|create|s|shell)\//,
      );
    }
  });

  test("AC-UGS-02 every page the sitemap lists answers 200 and is indexable", async ({
    page,
    request,
  }) => {
    for (const url of await sitemapUrls(request)) {
      const path = new URL(url).pathname;
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator('meta[name="robots"]'), path).toHaveCount(0);
    }
  });

  test("robots.txt lets crawlers read every page and points at the sitemap", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toMatch(/User-Agent: \*/i);
    expect(text).toContain("Allow: /");
    expect(text).toContain("Disallow: /api/");
    expect(text).toContain("Disallow: /shell/");
    expect(text).not.toMatch(/Disallow: \/\s*$/m);
    expect(text).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
  });
});

test.describe("one h1 and a title of its own on every indexable route and the not-found page", () => {
  test("each route the sitemap lists, and the not-found page, has exactly one h1 and a title no other has", async ({
    page,
    request,
    consoleErrors,
  }) => {
    const paths = (await sitemapUrls(request)).map(
      (url) => new URL(url).pathname,
    );
    const titles = new Map<string, string>();
    for (const path of [...paths, "/no-such-page"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(
        path === "/no-such-page" ? 404 : 200,
      );
      await expect(page.getByRole("heading", { level: 1 }), path).toHaveCount(
        1,
      );
      const title = await page.title();
      expect(title, path).toMatch(/\S/);
      expect(
        titles.has(title),
        `${path} shares "${title}" with ${titles.get(title)}`,
      ).toBe(false);
      titles.set(title, path);
    }
    expect(titles.get("Page not found · Knewt")).toBe("/no-such-page");
    // The not-found page answers 404 on purpose; Chromium logs that load.
    for (let index = consoleErrors.length - 1; index >= 0; index -= 1) {
      if (/status of 404/.test(consoleErrors[index] ?? "")) {
        consoleErrors.splice(index, 1);
      }
    }
  });
});
