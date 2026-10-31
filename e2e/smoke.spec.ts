import { expect, test } from "./fixtures";

test.describe("smoke", () => {
  test("home page loads with a heading and no console errors", async ({
    page,
    consoleErrors,
  }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator("html")).toHaveAttribute("lang", /\S/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Let hydration and any late scripts finish before checking the console.
    await page.waitForLoadState("networkidle");
    expect(consoleErrors).toEqual([]);
  });

  test("responses carry the baseline security headers", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
