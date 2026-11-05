/**
 * The display settings reach `<html>` before first paint (ARCHITECTURE
 * §10.3, DS-1): the inline boot script in `<head>` reads `qz:settings` while
 * the HTML parses, so a stored dark theme is dark from the first frame, and
 * hydration keeps what it set. To see first paint on its own, some tests
 * serve our JavaScript chunks empty: what remains is the prerendered HTML,
 * the CSS and the inline scripts, which is exactly what the browser paints
 * before React runs.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";

type Stored = Record<string, unknown>;

/** Stores settings before any page script runs, as a returning player has them. */
async function storeSettings(page: Page, settings: Stored): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem("qz:settings", JSON.stringify(value));
  }, settings);
}

/** Serves every JavaScript chunk empty, so React never boots. */
async function withoutOurScripts(page: Page): Promise<void> {
  await page.route("**/_next/static/**/*.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
}

/**
 * The browser's chrome colour under each system scheme (the first
 * theme-colour meta whose media applies), and how many such metas there
 * are: a meta whose colour changed would leave React a duplicate.
 */
async function browserChrome(page: Page) {
  return page.evaluate(() => {
    const metas = [
      ...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
    ];
    const colour = (scheme: string) =>
      metas.find(
        (meta) =>
          (meta.getAttribute("media") ?? "") === "" ||
          meta.getAttribute("media") === "all" ||
          meta.getAttribute("media") === `(prefers-color-scheme: ${scheme})`,
      )?.content ?? null;
    return {
      light: colour("light"),
      dark: colour("dark"),
      metas: metas.length,
    };
  });
}

/** A chosen dark theme's chrome, whatever the system's scheme. */
const DARK_CHROME = { light: "#1a1714", dark: "#1a1714", metas: 2 };

async function htmlAttributes(page: Page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    return {
      theme: html.getAttribute("data-theme"),
      motion: html.getAttribute("data-motion"),
      readable: html.getAttribute("data-readable"),
      contrast: html.getAttribute("data-contrast"),
    };
  });
}

/** The mean colour of a screenshot region, decoded in the page itself. */
async function meanColour(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<[number, number, number]> {
  const shot = await page.screenshot({ clip });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("no 2d context");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      sum[0] = (sum[0] ?? 0) + (data[i] ?? 0);
      sum[1] = (sum[1] ?? 0) + (data[i + 1] ?? 0);
      sum[2] = (sum[2] ?? 0) + (data[i + 2] ?? 0);
    }
    const count = data.length / 4;
    return sum.map((channel) => channel / count) as [number, number, number];
  }, shot.toString("base64"));
}

/** A strip of the left gutter, which shows nothing but the page. */
const GUTTER = { x: 2, y: 300, width: 10, height: 120 };

test.describe("the boot script", () => {
  test.use({ colorScheme: "light" });

  test("puts the stored settings on <html> before any of our JavaScript runs", async ({
    page,
  }) => {
    await withoutOurScripts(page);
    await storeSettings(page, {
      v: 1,
      theme: "dark",
      motion: "on",
      readableText: true,
      highContrast: true,
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(await htmlAttributes(page)).toEqual({
      theme: "dark",
      motion: "reduce",
      readable: "on",
      contrast: "on",
    });
    // The page colour is the chosen theme's, though the system is light.
    // Readable text's dark paper is #211D19.
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(33, 29, 25)",
    );
    // The browser's chrome follows from first paint too (DESIGN §12.43).
    expect(await browserChrome(page)).toEqual(DARK_CHROME);
  });

  test("first paint is dark when dark is stored, and light otherwise (screenshot)", async ({
    page,
  }) => {
    await withoutOurScripts(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const [r, g, b] = await meanColour(page, GUTTER);
    // #F5EFE4 under the grain.
    expect(Math.min(r, g, b)).toBeGreaterThan(180);

    await storeSettings(page, { v: 1, theme: "dark" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const dark = await meanColour(page, GUTTER);
    // #1A1714 under the grain.
    expect(Math.max(...dark)).toBeLessThan(60);
  });

  test("a stored light theme wins over a dark system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await withoutOurScripts(page);
    await storeSettings(page, { v: 1, theme: "light" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(245, 239, 228)",
    );
  });

  test("with nothing stored the page follows the system and <html> carries nothing", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    expect(await htmlAttributes(page)).toEqual({
      theme: null,
      motion: null,
      readable: null,
      contrast: null,
    });
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(26, 23, 20)",
    );
  });

  test("hydration keeps what the script set, with no errors, and the browser chrome follows a chosen theme through client navigations", async ({
    page,
  }) => {
    await storeSettings(page, { v: 1, theme: "dark", highContrast: true });
    await page.goto("/");
    // The Daily card's chips arrive after hydration, from the backend.
    await expect(page.locator("[data-daily-card] li").first()).toBeVisible();
    expect(await htmlAttributes(page)).toEqual({
      theme: "dark",
      motion: null,
      readable: null,
      contrast: "on",
    });
    expect(await browserChrome(page)).toEqual(DARK_CHROME);
    // A client navigation renders the viewport's metas again, with the
    // system pair; the chosen theme's colour holds, and after Back too.
    await page
      .locator('[data-home-slot="practice"]')
      .getByRole("link", { name: "Quick play" })
      .first()
      .click();
    await expect(page).toHaveURL("/practice/run");
    await expect(
      page.locator('main [data-state="idle"]').first(),
    ).toBeVisible();
    expect(await browserChrome(page)).toEqual(DARK_CHROME);
    await page.goBack();
    await expect(page.locator("[data-daily-card] li").first()).toBeVisible();
    expect(await browserChrome(page)).toEqual(DARK_CHROME);
    // e2e/fixtures.ts fails the test on any console error (hydration included).
  });

  test("another tab's new settings reach this one without a reload", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-daily-card] li").first()).toBeVisible();
    const other = await context.newPage();
    await other.goto("/");
    await other.evaluate(() => {
      localStorage.setItem(
        "qz:settings",
        JSON.stringify({ v: 1, theme: "dark", readableText: true }),
      );
    });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-readable", "on");
    await other.close();
  });
});

test.describe("the fonts", () => {
  test("both families load from our own origin, and the two roman faces are preloaded", async ({
    page,
  }) => {
    const response = await page.goto("/");
    const preloads = (response?.headers().link ?? "")
      .split(",")
      .filter(
        (link) => link.includes("rel=preload") && link.includes('as="font"'),
      );
    expect(preloads).toHaveLength(2);
    const families = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts]
        .filter((face) => face.status === "loaded")
        .map((face) => face.family.replaceAll('"', ""));
    });
    expect(families).toEqual(
      expect.arrayContaining(["Fraunces", "Atkinson Hyperlegible Next"]),
    );
    // Body text is set in Atkinson, headings and numerals in Fraunces.
    await expect(page.locator("body")).toHaveCSS(
      "font-family",
      /^"Atkinson Hyperlegible Next"/,
    );
    // Firefox quotes every family name it serializes.
    await expect(page.locator(".kn-wordmark-word")).toHaveCSS(
      "font-family",
      /^"?Fraunces/,
    );
  });
});
