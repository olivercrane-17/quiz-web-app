/**
 * The seven legal and trust pages on a production build (LGL-1; PRD §3.14,
 * DESIGN §12.40): prerendered, 200, axe-clean in both themes, linked from
 * Today's footer, each with one h1 and a title of its own, and carrying the
 * words AC-LGL-02 names in the HTML the server sends. AC-LGL-03 (offline
 * after one visit) belongs to PWA-1, which precaches these pages.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { expectNoSeriousAxe } from "../support/axe";

const PAGES = [
  { path: "/how-scoring-works", title: "How scoring works" },
  { path: "/about-our-questions", title: "About our questions" },
  { path: "/privacy", title: "Privacy" },
  { path: "/terms", title: "Terms" },
  { path: "/content-policy", title: "Content policy" },
  { path: "/accessibility", title: "Accessibility" },
  { path: "/credits", title: "Credits" },
] as const;

/** Where `next build` leaves a route's prerendered HTML (route groups add no folder). */
function prerenderedHtml(path: string): string {
  return join(process.cwd(), ".next/server/app", `${path.slice(1)}.html`);
}

/** The text of the HTML the server sends, tags and whitespace folded away. */
async function servedText(page: Page, path: string): Promise<string> {
  const response = await page.request.get(path);
  expect(response.status(), path).toBe(200);
  return (await response.text())
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

test.describe("AC-LGL-01 the seven trust pages", () => {
  for (const { path, title } of PAGES) {
    test(`AC-LGL-01 ${path} is prerendered, answers 200 with its own title and one h1, and passes axe in both themes`, async ({
      page,
    }) => {
      // The build wrote the page as static HTML (ARCHITECTURE §10.1)...
      expect(existsSync(prerenderedHtml(path)), prerenderedHtml(path)).toBe(
        true,
      );
      // ...and the server sends that copy rather than rendering it.
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(await response?.headerValues("x-nextjs-prerender")).toContain("1");
      expect(response?.headers()["x-nextjs-cache"]).toBe("HIT");

      await expect(page).toHaveTitle(`${title} · Knewt`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      // Indexable: no robots meta of its own, and a canonical address.
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${path}$`),
      );
      await page.waitForLoadState("networkidle");
      await expectNoSeriousAxe(page);

      await page.emulateMedia({ colorScheme: "dark" });
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expectNoSeriousAxe(page);
    });
  }

  test("AC-LGL-01 Today's footer links to all seven, and each link opens its page in the shell", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.getByRole("navigation", { name: "About Knewt" });
    const links = footer.getByRole("link");
    await expect(links).toHaveCount(PAGES.length);
    for (const [index, { path, title }] of PAGES.entries()) {
      await expect(links.nth(index)).toHaveAttribute("href", path);
      await expect(links.nth(index)).toHaveText(title);
    }
    await footer.getByRole("link", { name: "Terms" }).click();
    await expect(page).toHaveURL("/terms");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms");
    // A way back: the tab bar or the top tabs, and the footer again, this page marked.
    await expect(
      page.getByRole("link", { name: /^Today$/ }).first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "About Knewt" })
        .getByRole("link", { name: "Terms" }),
    ).toHaveAttribute("aria-current", "page");

    // The mark is more than colour (DESIGN §11), so it survives forced
    // colours, where every link turns LinkText.
    await page.emulateMedia({ forcedColors: "active" });
    const marks = await page
      .getByRole("navigation", { name: "About Knewt" })
      .getByRole("link")
      .evaluateAll((links) =>
        links.map((link) => {
          const style = getComputedStyle(link);
          return {
            current: link.getAttribute("aria-current") === "page",
            shape: `${style.fontWeight} ${style.textDecorationLine}`,
          };
        }),
      );
    const [current, ...more] = marks.filter((mark) => mark.current);
    expect(current?.current).toBe(true);
    expect(more).toEqual([]);
    // Forced colours paint every link alike (LinkText), so its weight or
    // its underline has to tell the current page apart.
    for (const other of marks.filter((mark) => !mark.current)) {
      expect(other.shape).not.toBe(current?.shape);
    }
  });

  test("AC-LGL-01 a link to a section of another trust page starts keyboard focus at that section", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "keyboard focus order is checked in Chromium",
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/privacy");
    const link = page
      .locator("article")
      .getByRole("link", { name: "How scoring works" });
    await expect(link).toHaveAttribute(
      "href",
      "/how-scoring-works#how-scoring-works-honest-play",
    );
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      "/how-scoring-works#how-scoring-works-honest-play",
    );
    const heading = page.locator("#how-scoring-works-honest-play");
    await expect(heading).toBeInViewport();

    // The next Tab goes on from the section, never back to the top.
    await page.keyboard.press("Tab");
    const onward = await heading.evaluate((target) => {
      const focused = document.activeElement;
      return (
        focused !== null &&
        focused !== document.body &&
        (target.compareDocumentPosition(focused) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0
      );
    });
    expect(onward).toBe(true);
    await expect(heading).toBeInViewport();
  });

  // SET-1 builds /settings with its About section (PRD §3.12.1: "Links to
  // every page in §3.14"); /settings is FIX-DS's placeholder until then.
  test.fixme("AC-LGL-01 Settings links to all seven trust pages", async ({
    page,
  }) => {
    await page.goto("/settings");
    for (const { path } of PAGES) {
      await expect(
        page.locator(`main a[href="${path}"]`).first(),
      ).toBeVisible();
    }
  });

  test("AC-LGL-01 the table of contents takes you to a section, clear of the sticky top bar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/privacy");
    await page
      .getByRole("navigation", { name: "On this page" })
      .getByRole("link", { name: "Children" })
      .click();
    await expect(page).toHaveURL("/privacy#privacy-children");
    const heading = page.getByRole("heading", { level: 2, name: "Children" });
    await expect(heading).toBeInViewport();
    const [bar, top] = await Promise.all([
      page
        .locator("header.kn-topbar")
        .evaluate((el) => el.getBoundingClientRect().bottom),
      heading.evaluate((el) => el.getBoundingClientRect().top),
    ]);
    expect(top).toBeGreaterThanOrEqual(bar);
  });

  test("AC-LGL-01 /credits opens a licence text in place, and nothing runs sideways at 320 px with 200% text and WCAG's text spacing", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/credits");
    const licence = page.locator("details", {
      hasText: "Read the Fraunces licence",
    });
    await licence.getByText("Read the Fraunces licence").click();
    await expect(licence.locator("pre")).toBeVisible();
    await expect(licence.locator("pre")).toContainText(
      "SIL OPEN FONT LICENSE Version 1.1",
    );
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
      for (const details of document.querySelectorAll("details")) {
        details.open = true;
      }
    });
    // The text-spacing overrides of WCAG 1.4.12 (DESIGN §10.5, §11).
    await page.addStyleTag({
      content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
        p { margin-bottom: 2em !important; }`,
    });
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("AC-LGL-02 what the pages say, in the HTML the server sends", () => {
  test("AC-LGL-02 /terms carries the 13+ and 18+ rules", async ({ page }) => {
    const text = await servedText(page, "/terms");
    expect(text).toContain("You must be 13 or older to play Knewt.");
    expect(text).toContain(
      "Sharing a quiz you made, or hosting one in a room, needs you to be 18 or older.",
    );
  });

  test("AC-LGL-02 /how-scoring-works carries the honest-play disclosure and the “% off” explanation", async ({
    page,
  }) => {
    const text = await servedText(page, "/how-scoring-works");
    expect(text).toContain(
      "Solo play runs on the honour system. We can't see what's on your other screen, and with nothing to win there's little point looking things up. If your tab was hidden for more than a few seconds in the middle of a round, that run stays out of the crowd's numbers. Nothing else happens: no penalty, no label, no ban.",
    );
    expect(text).toContain(
      "We divide the larger of your guess and the answer by the smaller, and take away 1. So twice the answer and half the answer are both 100% off",
    );
    expect(text).toContain("2,500 km and 625 km are both 100% off.");
    // The Daily's own How to play text, not a copy of it.
    expect(text).toContain("Each Mystery has four clues, hardest first.");
  });

  test("AC-LGL-02 /about-our-questions carries CONTENT_GUIDE's sentence and mentions AI-assisted drafting", async ({
    page,
  }) => {
    const text = await servedText(page, "/about-our-questions");
    expect(text).toContain(
      "Each one is accepted only after two independent checks, and any fact that is uncertain or easy to get wrong is checked against published data or sources.",
    );
    expect(text).toContain("Questions are drafted with AI assistance.");
  });

  test("AC-LGL-02 no trust page says “stored sources”", async ({ page }) => {
    for (const { path } of PAGES) {
      expect(await servedText(page, path), path).not.toMatch(/stored sources/i);
    }
  });

  test("AC-LGL-02 /credits names every source in the shipped answer lists' provenance", async ({
    page,
  }) => {
    const text = await servedText(page, "/credits");
    const manifest = JSON.parse(
      readFileSync(
        join(process.cwd(), "content/datasets/manifest.json"),
        "utf8",
      ),
    ) as { datasets: { key: string; title: string; sourceLabel: string }[] };
    const dir = join(process.cwd(), "content/answer-lists");
    let sources = 0;
    for (const file of readdirSync(dir).filter((name) =>
      name.endsWith(".json"),
    )) {
      const list = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
        provenance: { source: string }[];
      };
      for (const { source } of list.provenance) {
        sources += 1;
        const keys = [
          ...source.matchAll(/([a-z0-9]+(?:-[a-z0-9]+)*)@[0-9A-Za-z.+-]+/g),
        ].map((match) => match[1]);
        for (const key of keys) {
          const dataset = manifest.datasets.find((entry) => entry.key === key);
          expect(dataset, `${file} names ${key}`).toBeDefined();
          expect(text).toContain(dataset?.title ?? key);
          expect(text).toContain(dataset?.sourceLabel ?? key);
        }
        if (keys.length !== 1 || !/^[a-z0-9-]+@\S+$/.test(source.trim())) {
          expect(text).toContain("Compiled by our content team");
        }
      }
    }
    expect(sources).toBeGreaterThan(0);
    // Both fonts with their licence, Lucide's ISC licence and Wikidata.
    expect(text).toContain("Fraunces");
    expect(text).toContain("Atkinson Hyperlegible Next");
    expect(text).toContain("SIL Open Font License 1.1");
    expect(text).toContain("ISC License");
    expect(text).toContain("Wikidata");
  });
});
